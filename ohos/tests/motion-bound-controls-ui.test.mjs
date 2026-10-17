import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
registerHooks({ resolve(specifier, context, next) {
  return next(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? specifier + '.ts' : specifier, context);
} });
const motion = await import('../entry/src/main/ets/core/MotionConfiguration.ts');
const controls = await import('../entry/src/main/ets/core/MotionControlValues.ts');
const { KeyboardInputSession } = await import('../entry/src/main/ets/app/KeyboardInputSession.ts');
const { PlaybackSessionCore } = await import('../entry/src/main/ets/core/PlaybackSessionCore.ts');
const { RandomMotion } = await import('../entry/src/main/ets/core/motion/RandomMotion.ts');
const { OutputCoordinator, OutputEndpoint } = await import('../entry/src/main/ets/output/OutputCoordinator.ts');
const { OutputSettingsModel } = await import('../entry/src/main/ets/output/OutputSettingsModel.ts');
const { MemoryTransport } = await import('../entry/src/main/ets/output/MemoryTransport.ts');
const { MotionConfigurations, MotionProviderConfiguration, MotionCurvePoint } = motion;
const source = readFileSync(new URL('../entry/src/main/ets/components/MotionSettingsPanel.ets', import.meta.url), 'utf8');
const fieldSource = readFileSync(new URL('../entry/src/main/ets/components/CurvePointEditor.ets', import.meta.url), 'utf8');
function helpers(source, names, dependencies) {
  const body = source.split('@Component')[0].replace(/^import .*;\n/gm, '').replace(/export class /g, 'class ');
  return new Function(...Object.keys(dependencies), stripTypeScriptTypes(body) + '\nreturn {' + names.join(',') + '};')(...Object.values(dependencies));
}
function controller(source, name, dependencies) {
  const start = source.indexOf('export struct ' + name);
  const ends = [source.indexOf('  @Builder', start), source.indexOf('  build()', start)].filter(index => index >= 0);
  const body = source.slice(start, Math.min(...ends)).replace('export struct', 'class')
    .replace(/@(Prop|State|Watch)(\([^)]*\))?\s*/g, '') + '\n}';
  return new Function(...Object.keys(dependencies), stripTypeScriptTypes(body) + '\nreturn ' + name + ';')(...Object.values(dependencies));
}
const { MotionSettingsEdits } = helpers(source, ['MotionSettingsEdits'], motion);
const shared = helpers(fieldSource, ['SettingsNumberLogic', 'SettingsOption'], motion);
const Panel = controller(source, 'MotionSettingsPanel', { ...motion, ...controls, ...shared, MotionSettingsEdits });
const NumberField = controller(fieldSource, 'SettingsNumberField', { ...shared, KeyboardInputSession });
const numberSource = fieldSource.slice(fieldSource.indexOf('export struct SettingsNumberField'), fieldSource.indexOf('export struct SettingsTextField'));
function inputEvent(field, event) {
  // Execute the actual ArkUI event expression, including the real keyboard-owner guard.
  const start = numberSource.indexOf('.' + event + '(') + event.length + 2;
  assert.ok(start >= event.length + 2, 'missing numeric event ' + event);
  let depth = 1, cursor = start;
  while (depth > 0 && cursor < numberSource.length) {
    if (numberSource[cursor] === '(') depth++;
    if (numberSource[cursor] === ')') depth--;
    cursor++;
  }
  const expression = numberSource.slice(start, cursor - 1);
  return new Function('KeyboardInputSession', 'return ' + stripTypeScriptTypes(expression) + ';').call(field, KeyboardInputSession);
}
function fixture(id = 'Random', values = {}, echo = true) {
  const panel = new Panel(); const edits = [];
  panel.configuration = Object.assign(new MotionProviderConfiguration(id), values);
  panel.bindingKey = 'profile-a/L0/' + id;
  panel.onChange = next => {
    edits.push(next);
    if (echo) { panel.configuration = MotionConfigurations.clone(next); panel.configurationChanged(); }
  };
  panel.aboutToAppear();
  return { panel, edits, transfer(values) {
    panel.configuration = Object.assign(MotionConfigurations.clone(panel.configuration), values); panel.configurationChanged();
  } };
}
function numeric(panel, field) {
  const input = new NumberField(); input.value = panel.effectiveValue(field);
  input.integer = field === 'octaves'; input.commitEqualEdits = true; input.editable = !panel.readOnly;
  input.onCommit = panel.numberHandler(field); input.aboutToAppear();
  return { input, change: inputEvent(input, 'onChange'), submit: inputEvent(input, 'onSubmit'), blur: inputEvent(input, 'onBlur') };
}
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-14, `${actual} != ${expected}`);

for (const id of MotionConfigurations.ids()) test(id + ': raw reversed range remains separate from effective controls on attach, render and restore', () => {
  const { panel, edits, transfer } = fixture(id, { minimum: .9, maximum: .2 });
  assert.equal(panel.configuration.minimum, .9); assert.equal(panel.configuration.maximum, .2);
  close(panel.effectiveValue('minimum'), .9); close(panel.effectiveValue('maximum'), .91);
  assert.match(panel.rangeDifference(), /模型范围：\[0.9, 0.2\].*控件范围：\[0.9, 0.91\]/);
  const original = JSON.stringify(panel.configuration), state = panel.controlValues, revision = panel.renderRevision;
  for (let i = 0; i < 100; i++) { transfer({}); panel.rangeDifference(); panel.effectiveValue('minimum'); }
  assert.equal(panel.controlValues, state); assert.equal(panel.renderRevision, revision);
  panel.readOnly = true; panel.availabilityChanged(); transfer({ maximum: .3 });
  panel.aboutToDisappear(); panel.aboutToAppear();
  assert.deepEqual(edits, []); assert.equal(panel.configuration.minimum, .9); assert.equal(panel.configuration.maximum, .3);
  assert.equal(JSON.parse(original).maximum, .2);
});

test('Random raw Octaves 12 displays 8 without an implicit provider write or storage clamp', () => {
  const { panel, edits, transfer } = fixture('Random', { octaves: 12 });
  assert.equal(panel.effectiveValue('octaves'), 8); assert.equal(panel.configuration.octaves, 12);
  assert.match(panel.octavesDifference(), /模型 Octaves：12；控件值：8/);
  const field = numeric(panel, 'octaves'); field.blur(); field.submit();
  assert.deepEqual(edits, []); assert.equal(panel.configuration.octaves, 12);
  transfer({ octaves: 128 }); assert.equal(panel.effectiveValue('octaves'), 8); assert.equal(panel.configuration.octaves, 128);
  assert.deepEqual(edits, []); field.input.aboutToDisappear();
});

test('actual edited numeric submit of the same displayed 8 commits through userEdit and the real controlled callback exactly once', () => {
  const { panel, edits } = fixture('Random', { octaves: 12, minimum: .9, maximum: .2 });
  const field = numeric(panel, 'octaves'); field.blur(); assert.deepEqual(edits, []);
  field.change('8'); field.submit();
  assert.equal(field.input.error, false); assert.equal(edits.length, 1); assert.equal(edits[0].octaves, 8);
  assert.equal(panel.configuration.octaves, 8); assert.equal(panel.octavesDifference(), '');
  assert.equal(edits[0].minimum, .9); assert.equal(edits[0].maximum, .2, 'editing Octaves must not write effective range');
  field.blur(); field.submit(); assert.equal(edits.length, 1); field.input.aboutToDisappear();
});

test('an explicit same-effective endpoint edit writes only that endpoint while preserving the reversed raw partner', () => {
  const { panel, edits } = fixture('Random', { minimum: .9, maximum: .2, octaves: 12 });
  const field = numeric(panel, 'minimum'); field.change('0.9'); field.submit();
  assert.equal(edits.length, 1); assert.equal(edits[0].minimum, .9); assert.equal(edits[0].maximum, .2); assert.equal(edits[0].octaves, 12);
  field.input.aboutToDisappear();
});

test('actual numeric edits use the bounded single-field control operation rather than unrestricted model setters', () => {
  const { panel, edits } = fixture('Random', { minimum: .2, maximum: .5, octaves: 12 });
  assert.equal(panel.numberHandler('minimum')(.8), true);
  close(edits.at(-1).minimum, .49); assert.equal(edits.at(-1).maximum, .5); assert.equal(edits.at(-1).octaves, 12);
  assert.equal(panel.numberHandler('maximum')(.1), true); close(edits.at(-1).maximum, .5);
  assert.equal(panel.numberHandler('octaves')(100), true); assert.equal(edits.at(-1).octaves, 8);
  assert.equal(panel.numberHandler('octaves')(0), true); assert.equal(edits.at(-1).octaves, 1);
  const before = edits.length;
  for (const value of [NaN, Infinity, -Infinity, 1.5]) assert.equal(panel.numberHandler('octaves')(value), false);
  assert.equal(edits.length, before);
});

test('sequential source notifications preserve observed transfer order and retained range coercion history', () => {
  const minimumFirst = fixture(), maximumFirst = fixture();
  minimumFirst.transfer({ minimum: .9 }); minimumFirst.transfer({ maximum: .2 });
  maximumFirst.transfer({ maximum: .2 }); maximumFirst.transfer({ minimum: .9 });
  assert.deepEqual(minimumFirst.panel.configuration, maximumFirst.panel.configuration);
  close(minimumFirst.panel.effectiveValue('minimum'), .9); close(minimumFirst.panel.effectiveValue('maximum'), .91);
  close(maximumFirst.panel.effectiveValue('minimum'), .19); close(maximumFirst.panel.effectiveValue('maximum'), .2);
  const retained = maximumFirst.panel.controlValues;
  maximumFirst.transfer({}); assert.equal(maximumFirst.panel.controlValues, retained);
  maximumFirst.transfer({ speed: 2 });
  close(maximumFirst.panel.effectiveValue('minimum'), .19); close(maximumFirst.panel.effectiveValue('maximum'), .2);
  maximumFirst.transfer({ maximum: 1 });
  close(maximumFirst.panel.effectiveValue('minimum'), .9); close(maximumFirst.panel.effectiveValue('maximum'), 1);
  assert.deepEqual(minimumFirst.edits, []); assert.deepEqual(maximumFirst.edits, []);
});

for (const transition of ['axis', 'profile', 'provider', 'configuration', 'readonly', 'detach', 'remount']) {
  test('captured numeric callbacks and old typed drafts cannot overwrite a newer ' + transition + ' context', () => {
    const { panel, edits, transfer } = fixture('Random', { octaves: 12 });
    const field = numeric(panel, 'octaves'); const direct = panel.numberHandler('minimum'); const before = panel.renderRevision;
    field.change('4');
    if (transition === 'axis') { panel.bindingKey = 'profile-a/R0/Random'; panel.bindingChanged(); }
    if (transition === 'profile') { panel.bindingKey = 'profile-b/L0/Random'; panel.bindingChanged(); }
    if (transition === 'provider') { panel.configuration = new MotionProviderConfiguration('Pattern'); panel.configurationChanged(); }
    if (transition === 'configuration') { transfer({ octaves: 16 }); }
    if (transition === 'readonly') { panel.readOnly = true; panel.availabilityChanged(); panel.readOnly = false; panel.availabilityChanged(); }
    if (transition === 'detach') panel.aboutToDisappear();
    if (transition === 'remount') { panel.aboutToDisappear(); panel.aboutToAppear(); }
    assert.ok(panel.renderRevision > before, 'numeric ForEach remount key must change even for equal effective values');
    field.submit(); field.blur(); assert.equal(direct(.2), false); assert.deepEqual(edits, []);
    field.input.aboutToDisappear(); field.change('6'); field.submit(); assert.deepEqual(edits, []);
  });
}

test('same-value cloned host renders do not cancel active typing, but source changes are rejected even before watch delivery', () => {
  const { panel, edits, transfer } = fixture('Random', { octaves: 12 });
  const field = numeric(panel, 'octaves'); field.change('4'); transfer({}); field.submit();
  assert.equal(edits.length, 1); assert.equal(panel.configuration.octaves, 4);
  const late = panel.numberHandler('minimum'); panel.configuration.minimum = .3;
  assert.equal(late(.1), false); assert.equal(edits.length, 1); field.input.aboutToDisappear();
});

test('a fresh callback cannot use the previous context control history before its binding watcher runs', () => {
  const { panel, edits } = fixture('Random', { minimum: .9, maximum: .2 });
  panel.bindingKey = 'profile-a/R0/Random';
  assert.equal(panel.numberHandler('minimum')(.4), false); assert.deepEqual(edits, []);
  panel.bindingChanged(); assert.equal(panel.numberHandler('minimum')(.4), true); assert.equal(edits.length, 1);
});

test('context-keyed remount starts from a complete new snapshot without retaining the outgoing axis history', () => {
  const outgoing = fixture('Random', { minimum: 0, maximum: .1 });
  const stale = outgoing.panel.numberHandler('minimum'); outgoing.panel.aboutToDisappear();
  const incoming = fixture('Random', { minimum: .9, maximum: .2 });
  incoming.panel.bindingKey = 'profile-a/R0/Random'; incoming.panel.bindingChanged();
  close(incoming.panel.effectiveValue('minimum'), .9); close(incoming.panel.effectiveValue('maximum'), .91);
  assert.equal(stale(.05), false); assert.deepEqual(outgoing.edits, []); assert.deepEqual(incoming.edits, []);
});

test('accepted explicit edits retire all other captured numeric and nonnumeric callbacks', () => {
  const { panel, edits } = fixture('Custom Curve'); let resets = 0; panel.onReset = () => resets++;
  const number = panel.numberHandler('minimum'), choice = panel.choiceHandler('interpolationMode');
  const flag = panel.flagHandler('isLooping'), curve = panel.curveHandler(), reset = panel.resetHandler();
  assert.equal(panel.numberHandler('speed')(2), true);
  assert.equal(number(.2), false); choice('step'); flag(false); curve([new MotionCurvePoint(2, .3)]); reset();
  assert.equal(edits.length, 1); assert.equal(resets, 0);
  panel.resetHandler()(); assert.equal(resets, 1);
  panel.readOnly = true; panel.availabilityChanged(); panel.resetHandler()();
  assert.equal(panel.changeNumber('minimum', .2), false); assert.equal(panel.emit(new MotionProviderConfiguration('Random')), false);
  assert.equal(resets, 1); assert.equal(edits.length, 1);
});

test('a host context change during onChange cannot be overwritten by the old accepted control state', () => {
  const { panel } = fixture('Random', { octaves: 12 }, false);
  panel.onChange = () => {
    panel.bindingKey = 'profile-a/R0/Random'; panel.configuration = Object.assign(new MotionProviderConfiguration('Random'), { octaves: 3 });
    panel.bindingChanged();
  };
  assert.equal(panel.numberHandler('octaves')(8), true);
  assert.equal(panel.effectiveValue('octaves'), 3); assert.equal(panel.configuration.octaves, 3);
});

test('a non-echoing controlled callback retains effective state until an accepted source echo', () => {
  const { panel, edits } = fixture('Random', { octaves: 12 }, false);
  assert.equal(panel.numberHandler('octaves')(4), true); assert.equal(edits.length, 1);
  assert.equal(panel.controlValues.octaves, 8); assert.equal(panel.configuration.octaves, 12);
  panel.configuration = MotionConfigurations.clone(edits[0]); panel.configurationChanged();
  assert.equal(panel.configuration.octaves, 4); assert.equal(panel.controlValues.octaves, 4); assert.equal(edits.length, 1);
});

test('a rejected host edit and same-snapshot echo cannot leave speculative effective range or Octaves state', () => {
  const { panel, edits, transfer } = fixture('Random', { minimum: .9, maximum: .2, octaves: 129 }, false);
  const before = JSON.stringify(panel.controlValues);
  panel.onChange = next => { edits.push(next); transfer({}); };
  assert.equal(panel.numberHandler('minimum')(.4), true);
  assert.equal(JSON.stringify(panel.controlValues), before); assert.equal(panel.configuration.minimum, .9);
  assert.equal(panel.numberHandler('octaves')(8), true);
  assert.equal(JSON.stringify(panel.controlValues), before); assert.equal(panel.configuration.octaves, 129);
  transfer({}); assert.equal(JSON.stringify(panel.controlValues), before); assert.equal(edits.length, 2);
});

test('real session configuration edits publish no synthetic frame, clock or output Arm through a connected MemoryTransport', async () => {
  const engine = new PlaybackSessionCore();
  const raw = Object.assign(engine.getMotionConfiguration('L0', 'Random'), { minimum: .9, maximum: .2, octaves: 12 });
  engine.changeMotionConfiguration('L0', raw);
  const time = { nowMs: () => 100, scheduleAt: () => 1, cancel: () => {} }; const ports = [];
  const output = new OutputCoordinator({ inspect: () => ({ available: true, diagnostic: 'memory-only' }),
    create: () => { const port = new MemoryTransport(time); ports.push(port); return port; } }, engine,
    { maximumFrameAgeMs: 200, maximumClockAgeMs: 200, maximumEventAgeMs: 100, maximumFixedElapsedMs: 1000,
      writeTimeoutMs: 100, maximumPolledQueueLength: 4, allowZeroInterval: true }, time, time);
  const model = new OutputSettingsModel(); model.ranges = [{ axisId: 'L0', minimum: 0, maximum: 1, enabled: true }];
  const config = { ...model.config({ precision: 4, revision: engine.frame().profileRevision, axisOrder: ['L0'], maximumDurationMs: 10000, maximumPayloadBytes: 1024 }), kind: 'memory' };
  assert.equal(await output.connect(config, new OutputEndpoint()), true);
  const panel = new Panel(); panel.configuration = engine.getMotionConfiguration('L0', 'Random'); panel.bindingKey = 'profile-a/L0/Random';
  panel.onChange = next => { engine.changeMotionConfiguration('L0', next); panel.configuration = engine.getMotionConfiguration('L0', 'Random'); panel.configurationChanged(); output.refresh(); };
  const frame = engine.frame(), position = engine.snapshot().positionMs, revision = engine.revision();
  panel.aboutToAppear(); panel.configurationChanged(); panel.rangeDifference(); panel.octavesDifference();
  assert.equal(engine.revision(), revision); assert.equal(engine.getMotionConfiguration('L0', 'Random').octaves, 12);
  const field = numeric(panel, 'octaves'); field.blur(); assert.equal(engine.revision(), revision);
  field.change('8'); field.submit();
  assert.equal(engine.getMotionConfiguration('L0', 'Random').octaves, 8); assert.equal(engine.revision(), revision + 1);
  assert.equal(engine.frame(), frame); assert.equal(engine.snapshot().positionMs, position);
  assert.equal(output.status().armed, false); assert.equal(ports[0].writeRecords().length, 0);
  assert.equal(engine.dispatchSource(['L0']).authorization, null);
  panel.aboutToDisappear(); field.input.aboutToDisappear(); await output.dispose();
});

test('showing stored Octaves above the unchanged 128 runtime budget never activates or silently heals it', () => {
  const { panel, edits } = fixture('Random', { octaves: 129 });
  assert.equal(RandomMotion.MAX_RUNTIME_OCTAVES, 128);
  assert.throws(() => RandomMotion.validateRuntimeConfiguration(panel.configuration), /budget of 128/);
  assert.equal(panel.effectiveValue('octaves'), 8); assert.equal(panel.configuration.octaves, 129);
  panel.readOnly = true; panel.availabilityChanged(); panel.aboutToDisappear(); panel.aboutToAppear();
  assert.equal(panel.configuration.octaves, 129); assert.deepEqual(edits, []);
});

test('actual ArkUI routes use retained effective controls, equality-aware edited commits, isolated CustomCurve geometry and responsive layout', () => {
  for (const field of ['minimum', 'maximum', 'octaves']) assert.match(source, new RegExp("this.numberField\\('" + field + "',[^\\n]+this.effectiveValue\\('" + field + "'\\)"));
  assert.match(source, /commitEqualEdits: field === 'minimum' \|\| field === 'maximum' \|\| field === 'octaves'/);
  assert.match(source, /ForEach\(\[field \+ ':' \+ this.renderRevision\]/);
  assert.match(source, /onCommit: this.numberHandler\(field\)/);
  assert.match(source, /if \(this.configuration.id === 'Custom Curve'\) \{\s*SettingsSectionTitle\(\{ label: '自定义控制点[\s\S]*?CurvePointEditor\(\{[^\n]+bindingKey: this.bindingKey, onGeometry: this.onGeometry/);
  assert.equal((source.match(/onGeometry: this.onGeometry/g) || []).length, 1);
  assert.match(source, /onChange: this.curveHandler\(\)/); assert.match(source, /onClick\(this.resetHandler\(\)\)/);
  assert.match(source, /\.constraintSize\(\{ minHeight: UiStyle\.control/);
  assert.match(source, /enabled\(!this.readOnly\)/); assert.match(source, /editable: !this.readOnly/);
  assert.doesNotMatch(source, /\bScroll\s*\(|\.height\('100%'\)|@kit\.|\.arm\(|\.tick\(|\.pause\(|setInterval\(|setTimeout\(|fileIo|NativeSettingsStore|\.save\(/);
});
