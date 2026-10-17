import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
registerHooks({ resolve(specifier, context, next) {
  return next(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? specifier + '.ts' : specifier, context);
} });
const { SettingsDraftOwner } = await import('../entry/src/main/ets/presentation/SettingsDraftOwner.ts');
const keyboard = await import('../entry/src/main/ets/input/ShortcutConfiguration.ts');
const general = await import('../entry/src/main/ets/settings/GeneralConfiguration.ts');
const { KeyboardShortcutConfiguration, KeyboardShortcutMapping, ShortcutAction, shortcutActionCatalog,
  keyCatalog, defaultShortcutAction, validateShortcutConfiguration, cloneShortcutConfiguration, EMERGENCY_STOP_KEY } = keyboard;
const { GeneralConfiguration } = general;
const source = name => readFileSync(new URL('../entry/src/main/ets/components/' + name + '.ets', import.meta.url), 'utf8');
function helpers(name, exported, dependencies) {
  const code = source(name).split('@Component')[0].replace(/^import .*;\n/gm, '').replace(/export class /g, 'class ');
  return new Function(...Object.keys(dependencies), stripTypeScriptTypes(code) + '\nreturn {' + exported.join(',') + '};')(...Object.values(dependencies));
}
function component(name, dependencies) {
  const text = source(name); const start = text.indexOf('export struct ' + name);
  const build = text.indexOf('  build()', start); const builder = text.indexOf('  @Builder', start);
  const end = builder < 0 ? build : Math.min(builder, build);
  const code = text.slice(start, end).replace('export struct', 'class').replace(/@(Prop|State|Watch|StorageLink)(\([^)]*\))?\s*/g, '') + '\n}';
  return new Function(...Object.keys(dependencies), stripTypeScriptTypes(code) + '\nreturn ' + name + ';')(...Object.values(dependencies));
}
class SettingsOption { constructor(value, label = value) { this.value = value; this.label = label; } }
const { InputSettingsEdits: E } = helpers('InputSettingsPanel', ['InputSettingsEdits'], keyboard);
const { GeneralSettingsEdits: G } = helpers('GeneralSettingsPanel', ['GeneralSettingsEdits'], general);
const Panel = component('InputSettingsPanel', { SettingsDraftOwner, ...keyboard, InputSettingsEdits: E, SettingsOption });
const GeneralPanel = component('GeneralSettingsPanel', { SettingsDraftOwner, ...general, GeneralSettingsEdits: G, SettingsOption });
function configuration() {
  const value = new KeyboardShortcutConfiguration();
  const mapping = new KeyboardShortcutMapping('first', 'First');
  mapping.keys = [2017, 2072];
  mapping.actions = [new ShortcutAction('Media::Position::Time::Offset', 5), new ShortcutAction('Media::PlayPause::Toggle')];
  value.mappings = [mapping]; return value;
}
function mounted(value = configuration()) {
  const panel = new Panel(); const changes = []; const actions = []; const captures = []; let cancellations = 0; let stops = 0;
  panel.configuration = cloneShortcutConfiguration(value);
  panel.onChange = next => { changes.push(next); panel.configuration = next; };
  panel.onAction = action => actions.push(action);
  panel.onCapture = id => { captures.push(id); panel.captureId = id; };
  panel.onCancelCapture = () => { cancellations++; panel.captureId = ''; panel.captureKeys = []; };
  panel.onStop = () => { stops++; };
  return { panel, changes, actions, captures, cancellations: () => cancellations, stops: () => stops };
}

test('panels start with empty keyboard mappings and no runtime side effects', () => {
  const panel = new Panel();
  assert.deepEqual(panel.configuration.mappings, []);
  assert.equal(panel.configuration.enabled, true);
  assert.equal(panel.captureId, ''); assert.deepEqual(panel.captureKeys, []);
  assert.equal(new GeneralPanel().configuration.appOrientation, 'auto');
  assert.equal(new GeneralPanel().configuration.errorDisplayType, 'snackbar');
});

test('adding a mapping is inert and detached; removal/reordering preserves mapping identities and contents', () => {
  const original = new KeyboardShortcutConfiguration();
  const first = E.addMapping(original); const second = E.addMapping(first); const third = E.addMapping(second);
  assert.deepEqual(original.mappings, []); assert.equal(third.mappings.length, 3);
  assert.deepEqual(first.mappings[0].keys, []); assert.deepEqual(first.mappings[0].actions, []);
  assert.equal(first.mappings[0].trigger, 'press');
  const moved = E.moveMapping(third, 'shortcut-3', -1);
  assert.deepEqual(moved.mappings.map(m => m.id), ['shortcut-1', 'shortcut-3', 'shortcut-2']);
  assert.deepEqual(third.mappings.map(m => m.id), ['shortcut-1', 'shortcut-2', 'shortcut-3']);
  assert.notEqual(moved.mappings[0], third.mappings[0]);
  assert.equal(E.moveMapping(first, 'shortcut-1', -1), null);
  assert.equal(E.moveMapping(first, 'shortcut-1', 1), null);
  assert.equal(E.moveMapping(third, 'shortcut-1', 2), null);
  assert.equal(E.removeMapping(third, 'missing'), null);
  const removed = E.removeMapping(moved, 'shortcut-3');
  assert.deepEqual(removed.mappings.map(m => m.id), ['shortcut-1', 'shortcut-2']);
});

test('mapping count and action count are bounded; every action remains independently ordered', () => {
  let value = new KeyboardShortcutConfiguration();
  for (let index = 0; index < 64; index++) value = E.addMapping(value);
  assert.equal(value.mappings.length, 64); assert.equal(E.addMapping(value), null);
  value = configuration();
  while (value.mappings[0].actions.length < 16) value = E.addAction(value, 'first', 'App::Library::Show');
  assert.equal(E.addAction(value, 'first', 'App::Stop'), null);
  assert.equal(E.addAction(value, 'missing', 'App::Stop'), null);
  assert.equal(E.addAction(configuration(), 'first', 'Output::Arm'), null);
  const moved = E.moveAction(value, 'first', 1, -1);
  assert.deepEqual(moved.mappings[0].actions.slice(0, 2).map(a => a.id), ['Media::PlayPause::Toggle', 'Media::Position::Time::Offset']);
  assert.equal(moved.mappings[0].actions[1].value, 5);
  assert.equal(value.mappings[0].actions[0].value, 5);
  assert.equal(E.moveAction(value, 'first', 0, -1), null);
  assert.equal(E.moveAction(value, 'first', 15, 1), null);
  assert.equal(E.moveAction(value, 'first', 1, 0), null);
  assert.equal(E.moveAction(value, 'first', .5, 1), null);
  assert.equal(E.removeAction(value, 'first', 16), null);
  assert.equal(E.removeAction(value, 'first', -1), null);
  assert.equal(E.removeAction(value, 'first', .5), null);
  const removed = E.removeAction(moved, 'first', 1);
  assert.equal(removed.mappings[0].actions.length, 15);
  assert.equal(removed.mappings[0].actions[0].id, 'Media::PlayPause::Toggle');
});

test('mapping names and flags are actual copied persisted fields with safe validation', () => {
  const original = configuration();
  assert.equal(E.mappingName(original, 'first', ' Renamed ').mappings[0].name, 'Renamed');
  assert.equal(E.mappingName(original, 'first', '').mappings[0].name, '');
  assert.equal(E.mappingName(original, 'first', 'a'.repeat(81)), null);
  assert.equal(E.mappingName(original, 'first', 'bad\u0000name'), null);
  assert.equal(E.mappingName(original, 'missing', 'name'), null);
  assert.equal(E.enabled(original, false).enabled, false);
  for (const field of ['enabled', 'handleRepeating']) {
    const changed = E.flag(original, 'first', field, !original.mappings[0][field]);
    assert.equal(changed.mappings[0][field], !original.mappings[0][field]);
    assert.notEqual(changed.mappings[0].keys, original.mappings[0].keys);
    assert.notEqual(changed.mappings[0].actions[0], original.mappings[0].actions[0]);
  }
  assert.equal(E.flag(original, 'first', 'armed', true), null);
  assert.equal(E.flag(original, 'missing', 'enabled', true), null);
  assert.equal(original.enabled, true); assert.equal(original.mappings[0].name, 'First');
});

test('four trigger modes and both hold modes preserve their independent parameters', () => {
  const original = configuration();
  for (const trigger of ['press', 'release', 'click', 'hold']) {
    const next = E.choice(original, 'first', 'trigger', trigger);
    assert.equal(next.mappings[0].trigger, trigger);
    assert.equal(next.mappings[0].maximumClickIntervalMs, original.mappings[0].maximumClickIntervalMs);
    assert.equal(next.mappings[0].minimumHoldDurationMs, original.mappings[0].minimumHoldDurationMs);
  }
  for (const holdInvoke of ['release', 'holding']) assert.equal(E.choice(original, 'first', 'holdInvoke', holdInvoke).mappings[0].holdInvoke, holdInvoke);
  assert.equal(E.choice(original, 'first', 'trigger', 'analog'), null);
  assert.equal(E.choice(original, 'first', 'holdInvoke', 'repeat'), null);
  assert.equal(E.choice(original, 'first', 'armed', 'yes'), null);
  assert.equal(E.choice(original, 'missing', 'trigger', 'hold'), null);
});

for (const [field, minimum, maximum] of [
  ['clickCount', 1, 8], ['maximumClickIntervalMs', 0, 60000],
  ['minimumHoldDurationMs', 0, 60000], ['maximumHoldDurationMs', -1, 60000]
]) test('trigger setting ' + field + ' uses real integer bounds', () => {
  const original = configuration();
  for (const value of [minimum, maximum]) assert.equal(E.number(original, 'first', field, value).mappings[0][field], value);
  for (const value of [minimum - 1, maximum + 1, .5, NaN, Infinity]) assert.equal(E.number(original, 'first', field, value), null);
  assert.equal(E.number(original, 'missing', field, minimum), null);
  assert.equal(E.number(original, 'first', 'runtimeCounter', 1), null);
});

test('hold max<=min remains accepted unbounded semantics and inactive trigger fields are retained', () => {
  let value = E.choice(configuration(), 'first', 'trigger', 'hold');
  value = E.number(value, 'first', 'minimumHoldDurationMs', 1000);
  for (const maximum of [-1, 0, 500, 1000]) assert.equal(E.number(value, 'first', 'maximumHoldDurationMs', maximum).mappings[0].maximumHoldDurationMs, maximum);
  const switched = E.choice(value, 'first', 'trigger', 'press');
  assert.equal(switched.mappings[0].minimumHoldDurationMs, 1000);
});

test('catalog selection edits exact chord sets, rejects reserved/duplicate/unknown keys and allows inert clearing', () => {
  const original = configuration(); const keys = [2073, 2018, 2047];
  const changed = E.keys(original, 'first', keys);
  assert.deepEqual(changed.mappings[0].keys, [2018, 2047, 2073]);
  keys[0] = 2019; assert.deepEqual(changed.mappings[0].keys, [2018, 2047, 2073]);
  assert.deepEqual(original.mappings[0].keys, [2017, 2072]);
  assert.deepEqual(E.keys(original, 'first', []).mappings[0].keys, []);
  for (const value of [[2017, 2017], [EMERGENCY_STOP_KEY], [1], [NaN], keyCatalog().slice(0, 9).map(k => k.keyCode)]) {
    assert.equal(E.keys(original, 'first', value), null);
  }
  assert.equal(E.keys(original, 'missing', [2017]), null);
  assert.equal(E.addKey(original, 'first', 2017), null);
  assert.equal(E.addKey(original, 'first', EMERGENCY_STOP_KEY), null);
  assert.deepEqual(E.addKey(original, 'first', 2047).mappings[0].keys, [2017, 2047, 2072]);
  assert.deepEqual(E.removeKey(original, 'first', 2017).mappings[0].keys, [2072]);
  assert.equal(E.removeKey(original, 'first', 2018), null);
  assert.equal(E.removeKey(original, 'missing', 2017), null);
});

for (const spec of shortcutActionCatalog()) test('catalog action ' + spec.id + ' is editable with its bounded real payload', () => {
  const original = configuration(); const added = E.addAction(original, 'first', spec.id);
  assert.deepEqual(added.mappings[0].actions.at(-1), defaultShortcutAction(spec.id));
  const defaults = E.action(original, 'first', 0, spec.id, spec.defaultValue);
  assert.deepEqual(defaults.mappings[0].actions[0], defaultShortcutAction(spec.id));
  for (const value of [spec.minimum, spec.maximum]) {
    assert.ok(E.action(original, 'first', 0, spec.id, value));
    const action = defaultShortcutAction(spec.id); action.value = value;
    assert.equal(E.validAction(action), true);
  }
  for (const value of [spec.minimum === -Number.MAX_VALUE ? -Infinity : spec.minimum - 1,
    spec.maximum === Number.MAX_VALUE ? Infinity : spec.maximum + 1, NaN, Infinity]) {
    assert.equal(E.action(original, 'first', 0, spec.id, value), null);
    const action = defaultShortcutAction(spec.id); action.value = value;
    assert.equal(E.validAction(action), false);
  }
  if (spec.valueKind === 'boolean') assert.equal(E.action(original, 'first', 0, spec.id, .5), null);
  assert.equal(original.mappings[0].actions[0].id, 'Media::Position::Time::Offset');
});

test('action edits reject nonexistent rows and unavailable commands', () => {
  const value = configuration();
  for (const index of [-1, .5, 2, NaN]) assert.equal(E.action(value, 'first', index, 'App::Stop', 0), null);
  assert.equal(E.action(value, 'missing', 0, 'App::Stop', 0), null);
  for (const id of ['Output::Arm', 'Output::Connect', 'Gamepad::Axis', '', 'arbitrary script']) {
    assert.equal(E.spec(id), null); assert.equal(E.validAction(new ShortcutAction(id)), false);
    assert.equal(E.action(value, 'first', 0, id, 0), null);
  }
});

test('panel callbacks edit the controlled snapshot without dispatching runtime commands', () => {
  const f = mounted(); const { panel } = f;
  panel.changeEnabled(false); panel.changeName('first', 'Renamed');
  panel.changeFlag('first', 'enabled', false); panel.changeFlag('first', 'handleRepeating', true);
  panel.changeChoice('first', 'trigger', 'click'); panel.changeNumber('first', 'clickCount', 3);
  panel.addKey('first', '2047'); panel.removeKey('first', 2017);
  panel.addAction('first', 'Media::Speed::Set'); panel.actionValue('first', 2, 2);
  panel.selectAction('first', 0, 'Media::Speed::Offset');
  assert.equal(panel.configuration.mappings[0].actions[0].value, .25);
  panel.moveAction('first', 2, -1); panel.removeAction('first', 2);
  panel.addMapping(); const second = panel.configuration.mappings[1].id;
  panel.moveMapping(second, -1); panel.removeMapping(second);
  assert.ok(f.changes.length > 12); assert.deepEqual(f.actions, []); assert.equal(f.stops(), 0);
  assert.equal(validateShortcutConfiguration(panel.configuration).valid, true);
  assert.equal(panel.configuration.mappings[0].name, 'Renamed');
  assert.equal(panel.configuration.mappings[0].clickCount, 3);
});

test('capture only applies the matching mapping on explicit apply, then cancels; stale/empty/reserved captures cannot save', () => {
  const f = mounted(); const { panel } = f;
  panel.startCapture('missing'); assert.deepEqual(f.captures, []);
  panel.startCapture('first'); assert.deepEqual(f.captures, ['first']);
  assert.equal(f.changes.length, 0); assert.deepEqual(f.actions, []);
  panel.applyCapture('first'); assert.equal(f.changes.length, 0);
  panel.captureKeys = [2073, 2018]; panel.applyCapture('missing'); assert.equal(f.changes.length, 0);
  panel.applyCapture('first'); assert.deepEqual(panel.configuration.mappings[0].keys, [2018, 2073]);
  assert.equal(f.cancellations(), 1); assert.equal(panel.captureId, '');
  panel.startCapture('first'); panel.captureKeys = [EMERGENCY_STOP_KEY]; panel.applyCapture('first');
  assert.equal(f.changes.length, 1); assert.ok(panel.error.includes('F12')); assert.equal(f.cancellations(), 1);
  panel.cancelCapture(); assert.equal(f.cancellations(), 2);
  panel.startCapture('first'); panel.removeMapping('first'); assert.equal(f.cancellations(), 3);
  assert.deepEqual(panel.configuration.mappings, []);
});

test('read-only guards every editing/capture/touch callback even if called directly; Stop stays available', () => {
  const f = mounted(); const { panel } = f; panel.readOnly = true;
  panel.captureId = 'first'; panel.captureKeys = [2018];
  const before = cloneShortcutConfiguration(panel.configuration);
  panel.changeEnabled(false); panel.addMapping(); panel.removeMapping('first'); panel.moveMapping('first', 1);
  assert.equal(panel.changeName('first', 'changed'), false);
  panel.changeFlag('first', 'enabled', false); panel.changeChoice('first', 'trigger', 'hold');
  assert.equal(panel.changeNumber('first', 'clickCount', 2), false);
  panel.addKey('first', '2018'); panel.removeKey('first', 2017);
  panel.startCapture('first'); panel.cancelCapture(); panel.applyCapture('first');
  panel.addAction('first', 'App::Stop'); panel.selectAction('first', 0, 'App::Stop');
  assert.equal(panel.actionValue('first', 0, 1), false);
  panel.removeAction('first', 0); panel.moveAction('first', 0, 1);
  panel.selectTouchAction('Media::Speed::Set'); assert.equal(panel.touchValue(2), false);
  panel.dispatch(new ShortcutAction('Media::PlayPause::Toggle')); panel.dispatch(new ShortcutAction('Output::Arm'));
  assert.equal(panel.emit(new KeyboardShortcutConfiguration()), false);
  assert.deepEqual(panel.configuration, before); assert.deepEqual(f.changes, []); assert.deepEqual(f.actions, []);
  assert.deepEqual(f.captures, []); assert.equal(f.cancellations(), 0); assert.equal(panel.touchActionId, 'Media::PlayPause::Toggle');
  panel.stop(); panel.dispatch(new ShortcutAction('App::Stop')); assert.equal(f.stops(), 2);
});

test('phone touch catalog actions dispatch detached payloads through the same single callback and do not save runtime intent', () => {
  const f = mounted(); const { panel } = f;
  for (const spec of shortcutActionCatalog()) {
    panel.selectTouchAction(spec.id); assert.equal(panel.touchActionValue, spec.defaultValue);
    assert.equal(panel.touchValue(spec.defaultValue), true);
    panel.touchActionHandler()();
  }
  assert.equal(f.actions.length, shortcutActionCatalog().length - 1); assert.equal(f.stops(), 1);
  assert.deepEqual(f.changes, []);
  const action = new ShortcutAction('Media::Speed::Set', 2); panel.dispatch(action);
  assert.notEqual(f.actions.at(-1), action); assert.equal(f.actions.at(-1).value, 2);
  panel.dispatch(new ShortcutAction('Media::Speed::Set', 9)); panel.dispatch(new ShortcutAction('Output::Connect'));
  assert.equal(f.actions.at(-1).value, 2);
  panel.selectTouchAction('Media::Speed::Set'); assert.equal(panel.touchValue(9), false);
  panel.selectTouchAction('Output::Arm'); assert.equal(panel.touchActionId, 'Media::Speed::Set');
});

test('all catalog keys except F12 and already selected keys are reachable through the touch chord selector', () => {
  const { panel } = mounted(); const mapping = panel.configuration.mappings[0];
  const actual = panel.keyOptions(mapping).slice(1).map(option => Number(option.value));
  assert.deepEqual(actual, keyCatalog().filter(k => k.keyCode !== EMERGENCY_STOP_KEY && !mapping.keys.includes(k.keyCode)).map(k => k.keyCode));
  assert.deepEqual(panel.actionOptions().map(option => option.value), shortcutActionCatalog().map(spec => spec.id));
  assert.equal(panel.actionOptions(true)[0].value, '');
});

test('General orientation and error choices are validated copies and read-only direct callbacks cannot mutate', () => {
  const initial = new GeneralConfiguration();
  for (const orientation of ['auto', 'vertical', 'horizontal']) {
    const value = G.choice(initial, 'appOrientation', orientation);
    assert.notEqual(value, initial); assert.equal(value.appOrientation, orientation); assert.equal(value.errorDisplayType, 'snackbar');
  }
  for (const mode of ['none', 'dialog', 'snackbar']) assert.equal(G.choice(initial, 'errorDisplayType', mode).errorDisplayType, mode);
  assert.equal(G.choice(initial, 'appOrientation', 'landscape'), null);
  assert.equal(G.choice(initial, 'errorDisplayType', 'silent'), null);
  for (const unsupported of ['AlwaysOnTop', 'AllowWindowResize', 'RememberWindowLocation', 'LogLevel', 'EnableUILogging', 'EnableJsonLogging']) {
    assert.equal(G.choice(initial, unsupported, 'true'), null);
  }
  const panel = new GeneralPanel(); const changes = []; panel.onChange = next => changes.push(next);
  panel.change('appOrientation', 'horizontal'); assert.equal(changes[0].appOrientation, 'horizontal');
  panel.change('errorDisplayType', 'none'); assert.equal(changes[1].errorDisplayType, 'none');
  panel.readOnly = true; panel.change('appOrientation', 'vertical'); panel.change('errorDisplayType', 'dialog');
  assert.equal(changes.length, 2); assert.equal(initial.appOrientation, 'auto');
});

test('UI has content-sized roots, wrapped 48vp controls, real editor bindings and no IO/session/timers', () => {
  const input = source('InputSettingsPanel'); const gen = source('GeneralSettingsPanel');
  for (const text of [input, gen]) {
    assert.doesNotMatch(text, /\b(?:Scroll|List)\s*\(/);
    assert.match(text, /build\(\)\s*\{[\s\S]*?Column\(/);
    assert.doesNotMatch(text, /setInterval|setTimeout|NativeTransport|PlaybackSession|FilePicker|DocumentViewPicker|fs\./);
    assert.doesNotMatch(text, /\.height\((?:3\d|4[0-7])\)/);
  }
  assert.ok((input.match(/wrap: FlexWrap.Wrap/g) ?? []).length >= 4);
  assert.match(input, /F12.*OHOS 新增/);
  assert.match(input, /Button\('全局停止 · F12'\)[\s\S]*?\.onClick\(\(\) => this.stop\(\)\)/);
  assert.doesNotMatch(input, /TextInput\(/); // Shared fields own focus inhibition and pre-IME emergency handling.
  assert.match(input, /SettingsTextField\(\{ label: '映射名称/);
  assert.match(input, /SettingsNumberField/);
  assert.match(input, /this\.triggerEditor\(mapping\)/);
  assert.match(input, /this\.actionRow\(mapping, action, actionIndex\)/);
  for (const field of ['handleRepeating', 'clickCount', 'maximumClickIntervalMs', 'minimumHoldDurationMs', 'maximumHoldDurationMs', 'holdInvoke']) assert.ok(input.includes(field));
  assert.match(input, /minimum: -1, maximum: 60000, integer: true/);
  assert.match(input, /this\.onAction\(cloneShortcutAction\(action\)\)/);
  assert.doesNotMatch(gen, /Toggle\(|SettingsSwitchField|TextInput\(/);
  for (const unsupported of ['AlwaysOnTop', 'AllowWindowResize', 'RememberWindowLocation', 'LogLevel', 'EnableUILogging', 'EnableJsonLogging']) assert.ok(gen.includes(unsupported));
  assert.match(gen, /不改变系统屏幕旋转锁定/); assert.match(gen, /持久状态、停止和安全门控始终有效/);
});

const editCallbacks = panel => [
  ['numeric action', panel.bindEditNumber(value => panel.actionValue('first', 0, value)), 1, false],
  ['action type', panel.bindEditChoice(value => panel.selectAction('first', 0, value)), 'App::Stop', undefined],
  ['remove action', panel.bindEditCommand(() => panel.removeAction('first', 0)), undefined, undefined],
  ['move action', panel.bindEditCommand(() => panel.moveAction('first', 0, 1)), undefined, undefined],
  ['mapping name', panel.bindEditText(value => panel.changeName('first', value)), 'old row', false],
  ['mapping flag', panel.bindEditFlag(value => panel.changeFlag('first', 'enabled', value)), false, undefined],
  ['add mapping', panel.bindEditCommand(() => panel.addMapping()), undefined, undefined],
  ['key selector', panel.bindEditChoice(value => panel.addKey('first', value)), '2047', undefined],
  ['start capture', panel.bindEditCommand(() => panel.startCapture('first')), undefined, undefined]
];
for (const transition of ['reorder', 'delete', 'identical replacement', 'watch notification', 'read-only roundtrip', 'disappear/reappear', 'same-id replacement']) {
  test('rendered edit callbacks cannot target a newer snapshot after ' + transition, () => {
    const value = configuration(); value.mappings[0].actions.push(new ShortcutAction('Media::Speed::Set', 2));
    const f = mounted(value); const { panel } = f;
    const callbacks = editCallbacks(panel);
    if (transition === 'reorder') panel.moveAction('first', 0, 1);
    if (transition === 'delete') panel.removeAction('first', 0);
    if (transition === 'identical replacement') panel.configuration = cloneShortcutConfiguration(panel.configuration);
    if (transition === 'watch notification') panel.configurationChanged();
    if (transition === 'read-only roundtrip') {
      panel.readOnly = true; panel.availabilityChanged(); panel.readOnly = false; panel.availabilityChanged();
    }
    if (transition === 'disappear/reappear') { panel.aboutToDisappear(); panel.aboutToAppear(); }
    if (transition === 'same-id replacement') {
      panel.removeMapping('first'); panel.configuration = configuration();
      panel.configuration.mappings[0].name = 'Replacement';
    }
    const before = cloneShortcutConfiguration(panel.configuration); const count = f.changes.length;
    for (const [label, callback, argument, result] of callbacks) assert.equal(callback(argument), result, label);
    assert.equal(f.changes.length, count); assert.deepEqual(panel.configuration, before);
    assert.deepEqual(f.actions, []); assert.deepEqual(f.captures, []); assert.equal(f.cancellations(), 0);
    const fresh = panel.bindEditText(name => panel.changeName('first', name));
    assert.equal(fresh('fresh row'), true); assert.equal(panel.configuration.mappings[0].name, 'fresh row');
  });
}

test('a queued duplicate edit is invalidated immediately before the host delivers its replacement prop', () => {
  const f = mounted(); const { panel } = f; const before = cloneShortcutConfiguration(panel.configuration);
  const accepted = []; panel.onChange = next => accepted.push(next); // Controlled prop delivery is deliberately delayed.
  const add = panel.bindEditCommand(() => panel.addMapping());
  const rename = panel.bindEditText(value => panel.changeName('first', value));
  add(); add(); assert.equal(rename('late draft'), false);
  assert.equal(accepted.length, 1); assert.deepEqual(panel.configuration, before);
  panel.configuration = accepted[0]; panel.configurationChanged();
  const next = panel.bindEditText(value => panel.changeName('first', value));
  assert.equal(next('new draft'), true); assert.equal(accepted.length, 2);
});

test('configuration and read-only watchers refresh row identity without persisting a UI version', () => {
  const { panel } = mounted(); const before = Object.keys(panel.configuration);
  const revision = panel.renderRevision; panel.configurationChanged(); panel.availabilityChanged();
  assert.equal(panel.renderRevision, revision + 2); assert.deepEqual(Object.keys(panel.configuration), before);
  assert.match(source('InputSettingsPanel'), /mapping.id \+ ':view:' \+ this.renderRevision/);
});

test('touch edits and execution capture the selected action rather than retargeting a newer one', () => {
  const f = mounted(); const { panel } = f;
  panel.selectTouchAction('Media::Position::Time::Offset');
  const oldNumber = panel.touchNumberHandler(); const oldCommand = panel.touchActionHandler();
  panel.selectTouchAction('Media::Speed::Set');
  assert.equal(oldNumber(2), false); oldCommand(); assert.deepEqual(f.actions, []);
  assert.equal(panel.touchActionValue, 1);
  const number = panel.touchNumberHandler(); assert.equal(number(2), true); assert.equal(number(3), false);
  const command = panel.touchActionHandler(); command(); command();
  assert.deepEqual(f.actions, [new ShortcutAction('Media::Speed::Set', 2), new ShortcutAction('Media::Speed::Set', 2)]);
  panel.configuration = cloneShortcutConfiguration(panel.configuration); command(); assert.equal(f.actions.length, 2);
  panel.selectTouchAction('Media::PlayPause::Set'); const bool = panel.touchBooleanHandler();
  panel.selectTouchAction('Media::Speed::Set'); bool('0'); assert.equal(panel.touchActionValue, 1);
  panel.selectTouchAction('App::Stop'); const stop = panel.touchActionHandler();
  panel.readOnly = true; panel.aboutToDisappear(); stop(); panel.stop(); assert.equal(f.stops(), 2);
});

for (const transition of ['replacement', 'watch notification', 'read-only roundtrip', 'disappear/reappear']) {
  test('General choices reject old callbacks after ' + transition, () => {
    const panel = new GeneralPanel(); const changes = [];
    panel.onChange = next => { changes.push(next); panel.configuration = next; };
    const oldOrientation = panel.choiceHandler('appOrientation'); const oldErrors = panel.choiceHandler('errorDisplayType');
    if (transition === 'replacement') panel.configuration = GeneralConfiguration.clone(panel.configuration);
    if (transition === 'watch notification') panel.ownerChanged();
    if (transition === 'read-only roundtrip') { panel.readOnly = true; panel.ownerChanged(); panel.readOnly = false; panel.ownerChanged(); }
    if (transition === 'disappear/reappear') { panel.aboutToDisappear(); panel.aboutToAppear(); }
    oldOrientation('horizontal'); oldErrors('none'); assert.equal(changes.length, 0);
    panel.choiceHandler('appOrientation')('horizontal'); assert.equal(changes.length, 1);
    assert.equal(panel.configuration.appOrientation, 'horizontal');
  });
}

test('all 40 rendered Input settings callbacks are bound at render time; Stop remains unconditional', () => {
  const input = source('InputSettingsPanel').slice(source('InputSettingsPanel').indexOf('  @Builder'));
  // The shared curve builder receives one already-bound point callback. Do not
  // count its typed parameter as a rendered callback, or allow arbitrary naked
  // callbacks elsewhere merely because the builder delegates its own argument.
  const rendered = input.replace(/^\s*private pointEditor\([^\n]+\n/m, '');
  const callbacks = [...rendered.matchAll(/on(?:Change|Select|Commit):\s*([^\n]+)/g)].map(match => match[1]);
  assert.equal(callbacks.length, 40);
  assert.equal(callbacks.filter(callback => callback === 'onChange })').length, 1);
  const pointBuilder = input.slice(0, input.indexOf('  @Builder', input.indexOf('private pointEditor')));
  assert.match(pointBuilder, /private pointEditor\(action: ShortcutAction, maximumPoints: number, onChange: \(points: MotionCurvePoint\[\]\) => void, draftKey: string, draftSource: string, draftScope: string\)/);
  assert.match(pointBuilder, /CurvePointEditor\([\s\S]*onChange: onChange \}\)/);
  const pointCalls = [...input.matchAll(/this\.pointEditor\(([^\n]+)/g)].map(match => match[1]);
  assert.deepEqual(pointCalls, [
    'action, this.mappingMaximumPoints(mapping.id, index), this.mappingPointsHandler(mapping.id, index),',
    'this.touchAction, KeyboardShortcutConfiguration.MAX_POINTS_PER_ACTION, this.touchPointsHandler(),'
  ]);
  for (const callback of callbacks.filter(callback => callback !== 'onChange })')) {
    assert.match(callback, /^this\.(?:bindEdit|touchNumberHandler|touchBooleanHandler|touchChoiceHandler|touchTextHandler)/);
  }
  const clicks = [...input.matchAll(/\.onClick\(([^\n]+)/g)].map(match => match[1]);
  for (const click of clicks) assert.match(click, /^(?:this\.(?:bindEditCommand|touchActionHandler|captureApplyHandler|captureCancelHandler)|\(\) => this\.stop\(\))/);
});

test('Apply and Cancel retain the capture session revision across same-mapping cancel/restart', () => {
  const f = mounted(); const { panel } = f; const cancellations = [];
  panel.captureId = 'first'; panel.captureKeys = [2018]; panel.captureRevision = 7;
  panel.onCancelCapture = revision => cancellations.push(revision);
  const oldApply = panel.captureApplyHandler('first'); const oldCancel = panel.captureCancelHandler();
  // Same mapping and configuration; only the volatile capture identity changes.
  panel.captureId = ''; panel.captureRevision = 8;
  panel.captureId = 'first'; panel.captureKeys = [2019]; panel.captureRevision = 9; panel.captureChanged();
  oldApply(); oldCancel(); assert.deepEqual(f.changes, []); assert.deepEqual(cancellations, []);
  panel.captureApplyHandler('first')();
  assert.deepEqual(panel.configuration.mappings[0].keys, [2019]); assert.deepEqual(cancellations, [9]);
});

test('host expected-revision guards reject stale capture callbacks even before replacement props arrive', () => {
  const { panel } = mounted(); panel.captureId = 'first'; panel.captureKeys = [2018]; panel.captureRevision = 20;
  let hostRevision = 20; let hostConfig = cloneShortcutConfiguration(panel.configuration);
  const emittedRevisions = []; const accepted = []; const canceled = [];
  panel.onChange = (next, revision) => {
    emittedRevisions.push(revision);
    if (revision !== undefined && revision !== hostRevision) return;
    hostConfig = next; accepted.push(next);
  };
  panel.onCancelCapture = revision => { if (revision === hostRevision) { canceled.push(revision); hostRevision++; } };
  const oldApply = panel.captureApplyHandler('first'); const oldCancel = panel.captureCancelHandler();
  hostRevision++; // Host cancels the session.
  hostRevision++; // Host starts the same mapping again. New props are deliberately withheld.
  oldCancel(); oldApply();
  assert.deepEqual(emittedRevisions, [20]); assert.deepEqual(accepted, []); assert.deepEqual(canceled, []);
  assert.deepEqual(hostConfig.mappings[0].keys, [2017, 2072]); assert.equal(hostRevision, 22);
  panel.captureRevision = hostRevision; panel.captureKeys = [2019]; panel.captureChanged();
  panel.captureApplyHandler('first')();
  assert.equal(accepted.length, 1); assert.deepEqual(hostConfig.mappings[0].keys, [2019]);
  assert.deepEqual(canceled, [22]); assert.equal(hostRevision, 23);
});

test('capture Apply snapshots its displayed chord and ordinary edits do not acquire capture-only authority', () => {
  const { panel } = mounted(); const calls = []; const canceled = [];
  panel.onChange = (value, revision) => calls.push([value, revision]); panel.onCancelCapture = revision => canceled.push(revision);
  panel.captureId = 'first'; panel.captureRevision = 4; panel.captureKeys = [2018, 2072];
  const apply = panel.captureApplyHandler('first'); panel.captureKeys[0] = 2019;
  apply(); assert.deepEqual(calls[0][0].mappings[0].keys, [2018, 2072]); assert.equal(calls[0][1], 4);
  assert.deepEqual(canceled, [4]);
  panel.configuration = calls[0][0]; panel.configurationChanged();
  panel.changeName('first', 'Ordinary'); assert.equal(calls[1][1], undefined);
});
