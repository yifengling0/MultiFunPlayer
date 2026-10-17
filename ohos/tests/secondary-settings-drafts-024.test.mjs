import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
registerHooks({ resolve(specifier, context, next) {
  return next(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? specifier + '.ts' : specifier, context);
} });
const keyboard = await import('../entry/src/main/ets/input/ShortcutConfiguration.ts');
const motion = await import('../entry/src/main/ets/core/MotionConfiguration.ts');
const media = await import('../entry/src/main/ets/settings/MediaSourceConfiguration.ts');
const playlist = await import('../entry/src/main/ets/core/playback/PlaylistPresentation.ts');
const { SettingsDraftOwner } = await import('../entry/src/main/ets/presentation/SettingsDraftOwner.ts');
const { KeyboardInputSession } = await import('../entry/src/main/ets/app/KeyboardInputSession.ts');
const { KeyboardShortcutConfiguration, KeyboardShortcutMapping, ShortcutAction, cloneShortcutConfiguration } = keyboard;
const source = name => readFileSync(new URL('../entry/src/main/ets/components/' + name + '.ets', import.meta.url), 'utf8');
function helpers(text, names, dependencies) {
  const code = text.split('@Component')[0].replace(/^import .*;\n/gm, '').replace(/export class /g, 'class ');
  return new Function(...Object.keys(dependencies), stripTypeScriptTypes(code) + '\nreturn {' + names.join(',') + '};')(...Object.values(dependencies));
}
function controller(text, name, dependencies) {
  const start = text.indexOf('export struct ' + name);
  const ends = [text.indexOf('  @Builder', start), text.indexOf('  build()', start)].filter(value => value >= 0);
  const code = text.slice(start, Math.min(...ends)).replace('export struct', 'class')
    .replace(/@(Prop|State|Watch|StorageLink)(\([^)]*\))?\s*/g, '') + '\n}';
  return new Function(...Object.keys(dependencies), stripTypeScriptTypes(code) + '\nreturn ' + name + ';')(...Object.values(dependencies));
}
const fieldSource = source('CurvePointEditor'), inputSource = source('InputSettingsPanel'), mediaSource = source('DeoVrSourcePanel');
const shared = helpers(fieldSource, ['SettingsNumberLogic', 'SettingsOption'], motion);
const dependencies = { ...shared, ...keyboard, ...motion, SettingsDraftOwner, KeyboardInputSession };
const { InputSettingsEdits } = helpers(inputSource, ['InputSettingsEdits'], keyboard);
const Input = controller(inputSource, 'InputSettingsPanel', { ...dependencies, InputSettingsEdits });
const { DeoVrSourceEdits } = helpers(mediaSource, ['DeoVrSourceEdits'], media);
const Media = controller(mediaSource, 'DeoVrSourcePanel', { ...dependencies, ...media, DeoVrSourceEdits });
const Playlist = controller(source('InternalPlaylistPanel'), 'InternalPlaylistPanel', { ...dependencies, ...playlist });
const NumberField = controller(fieldSource, 'SettingsNumberField', dependencies);
const TextField = controller(fieldSource, 'SettingsTextField', dependencies);

// Execute the production ArkUI property object instead of inventing test-only keys.
function fieldObjects(text, name) {
  const objects = [];
  for (const match of text.matchAll(new RegExp(name + '\\(\\{', 'g'))) {
    const start = match.index + name.length + 1;
    let depth = 0, quote = '', end = start;
    for (; end < text.length; end++) {
      const char = text[end];
      if (quote) { if (char === '\\') { end++; } else if (char === quote) { quote = ''; } }
      else if (char === "'" || char === '"' || char === '`') { quote = char; }
      else if (char === '{') { depth++; }
      else if (char === '}' && --depth === 0) { end++; break; }
    }
    objects.push(text.slice(start, end));
  }
  return objects;
}
function props(text, kind, selector, panel, locals = {}) {
  const object = fieldObjects(text, kind).find(value => selector(value));
  assert.ok(object, 'production field not found');
  return new Function(...Object.keys(locals), 'return ' + stripTypeScriptTypes('(' + object + ')') + ';').call(panel, ...Object.values(locals));
}
function field(Type, parameters) { const value = Object.assign(new Type(), parameters); value.aboutToAppear(); return value; }
function inputFixture(owner = new SettingsDraftOwner(), configuration, scope = 'page:input') {
  const panel = new Input(), edits = [], actions = [], captures = [];
  panel.draftOwner = owner; panel.draftScope = scope;
  panel.configuration = configuration ? cloneShortcutConfiguration(configuration) : new KeyboardShortcutConfiguration();
  if (!configuration) {
    const mapping = new KeyboardShortcutMapping('first', 'First'); mapping.trigger = 'click';
    mapping.actions = [new ShortcutAction('Media::Position::Time::Offset', 5)]; panel.configuration.mappings = [mapping];
  }
  panel.axisNames = ['L0', 'L1']; panel.enabledAxisNames = ['L0', 'L1'];
  panel.onChange = next => { edits.push(next); panel.configuration = next; panel.configurationChanged(); };
  panel.onAction = action => actions.push(action); panel.onCapture = id => captures.push(id);
  panel.aboutToAppear(); return { panel, edits, actions, captures, owner };
}
function mappingField(fixture, kind, value) {
  const mapping = fixture.panel.configuration.mappings[0];
  return field(kind === 'SettingsTextField' ? TextField : NumberField,
    props(inputSource, kind, object => object.includes('value: mapping.' + value + ','), fixture.panel, { mapping }));
}

for (const transition of ['narrow-wide', 'rotation', 'video-open-close', 'fullscreen', 'density', 'collapse-expand']) {
  test(transition + ': raw mapping text and invalid numeric draft survive replacement without commits, capture or execution', () => {
    const before = inputFixture(), name = mappingField(before, 'SettingsTextField', 'name');
    const count = mappingField(before, 'SettingsNumberField', 'clickCount');
    name.changeHandler()('正在输入 unsubmitted'); count.changeHandler()('1e-'); count.commitHandler()();
    assert.equal(count.error, true); assert.deepEqual(before.edits, []);
    const staleName = name.commitHandler(), staleCount = count.changeHandler();
    const original = cloneShortcutConfiguration(before.panel.configuration);
    name.aboutToDisappear(); count.aboutToDisappear(); before.panel.aboutToDisappear();
    const after = inputFixture(before.owner, original); after.panel.compact = transition === 'density';
    const nextName = mappingField(after, 'SettingsTextField', 'name'), nextCount = mappingField(after, 'SettingsNumberField', 'clickCount');
    assert.equal(nextName.draft, '正在输入 unsubmitted'); assert.equal(nextCount.draft, '1e-'); assert.equal(nextCount.error, true);
    staleName(); staleCount('8'); assert.deepEqual(before.edits, []); assert.deepEqual(after.edits, []);
    assert.deepEqual(after.actions, []); assert.deepEqual(after.captures, []);
    assert.deepEqual(after.panel.configuration, original);
    nextCount.cancelHandler()(); assert.equal(nextCount.draft, '1'); assert.equal(nextCount.error, false);
    nextName.changeHandler()('Renamed'); nextName.commitHandler()(); assert.equal(after.edits.length, 1);
    assert.equal(after.panel.configuration.mappings[0].name, 'Renamed');
    nextName.aboutToDisappear(); nextCount.aboutToDisappear(); after.panel.aboutToDisappear();
  });
}

test('touch action and append category are retained as detached drafts, never as capture or action authority', () => {
  const first = inputFixture(); first.panel.selectTouchAction('Axis::Value::Set');
  first.panel.touchText('targetAxis', 'L1'); first.panel.touchNumber('value', .42);
  const category = first.panel.categories().find(option => option.value !== 'media-playback').value;
  first.panel.selectAppendCategory('first', category); first.panel.captureId = 'first'; first.panel.captureKeys = [2017];
  const staleExecute = first.panel.touchActionHandler(), staleEdit = first.panel.touchNumberHandler();
  const expected = keyboard.cloneShortcutAction(first.panel.touchAction); first.panel.aboutToDisappear();
  const second = inputFixture(first.owner, first.panel.configuration);
  assert.deepEqual(second.panel.touchAction, expected); assert.notEqual(second.panel.touchAction, first.panel.touchAction);
  assert.equal(second.panel.appendCategory('first'), category);
  assert.equal(second.panel.captureId, ''); assert.deepEqual(second.panel.captureKeys, []);
  staleExecute(); assert.equal(staleEdit(.9), false); assert.deepEqual(first.actions, []); assert.deepEqual(second.actions, []);
  assert.deepEqual(second.edits, []); assert.deepEqual(second.captures, []);
  second.panel.touchActionHandler()(); assert.equal(second.actions.length, 1); assert.deepEqual(second.actions[0], expected);
  second.panel.aboutToDisappear();
});

test('newer mount retires old local draft writes even before old disappear, and old release cannot erase new lease', () => {
  const first = inputFixture(); first.panel.selectTouchAction('Axis::Value::Set'); first.panel.touchNumber('value', .3);
  const stale = first.panel.touchNumberHandler(); const second = inputFixture(first.owner, first.panel.configuration);
  assert.equal(stale(.8), false); assert.equal(first.panel.touchNumber('value', .8), false);
  first.panel.aboutToDisappear(); assert.equal(second.panel.touchNumber('value', .7), true); second.panel.aboutToDisappear();
  const third = inputFixture(first.owner, first.panel.configuration); assert.equal(third.panel.touchAction.value, .7); third.panel.aboutToDisappear();
});

for (const change of ['epoch', 'scope', 'owner', 'background', 'dispose']) {
  test(change + ': local action callbacks are retired before watchers and do not regain authority', () => {
    const f = inputFixture(); f.panel.selectTouchAction('Axis::Value::Set'); f.panel.touchNumber('value', .4);
    const commit = f.panel.touchNumberHandler(), execute = f.panel.touchActionHandler();
    if (change === 'epoch') f.panel.draftEpoch++;
    if (change === 'scope') f.panel.draftScope = 'other:input';
    if (change === 'owner') f.panel.draftOwner = new SettingsDraftOwner();
    if (change === 'background') f.owner.setAvailable(false);
    if (change === 'dispose') f.owner.dispose();
    assert.equal(commit(.9), false); execute(); assert.deepEqual(f.actions, []);
    assert.equal(f.panel.touchAction.value, .4); f.panel.aboutToDisappear();
  });
}

test('background preserves payload but requires a fresh mount before editing; clear discards old action state', () => {
  const first = inputFixture(); first.panel.selectTouchAction('Axis::Value::Set'); first.panel.touchNumber('value', .55);
  first.owner.setAvailable(false); first.panel.aboutToDisappear(); first.owner.setAvailable(true);
  const restored = inputFixture(first.owner, first.panel.configuration); assert.equal(restored.panel.touchAction.value, .55);
  restored.panel.aboutToDisappear(); first.owner.clear();
  const clean = inputFixture(first.owner, first.panel.configuration);
  assert.equal(clean.panel.touchAction.id, 'Media::PlayPause::Toggle'); assert.deepEqual(clean.actions, []); clean.panel.aboutToDisappear();
});

test('equal-valued replacement action and mapping cannot acquire a different semantic draft', () => {
  const original = inputFixture(), mapping = original.panel.configuration.mappings[0], action = mapping.actions[0];
  const initial = field(NumberField, props(inputSource, 'SettingsNumberField', text => text.includes('value: action.value,'), original.panel, { mapping, action, index: 0 }));
  initial.changeHandler()('7e-'); const stale = initial.commitHandler(); initial.aboutToDisappear(); original.panel.aboutToDisappear();
  const changed = cloneShortcutConfiguration(original.panel.configuration);
  changed.mappings[0].actions[0] = new ShortcutAction('Axis::ScriptOffset::Set', 5);
  const next = inputFixture(original.owner, changed), nextMapping = next.panel.configuration.mappings[0], nextAction = nextMapping.actions[0];
  const replacement = field(NumberField, props(inputSource, 'SettingsNumberField', text => text.includes('value: action.value,'), next.panel,
    { mapping: nextMapping, action: nextAction, index: 0 }));
  assert.equal(replacement.draft, '5'); stale(); assert.deepEqual(next.edits, []);
  assert.notEqual(original.panel.mappingDraftSource(mapping), next.panel.mappingDraftSource(nextMapping));
  replacement.aboutToDisappear(); next.panel.aboutToDisappear();
});

function mediaFixture(owner = new SettingsDraftOwner(), selected = 'deovr') {
  const panel = new Media(), edits = [], calls = [];
  panel.draftOwner = owner; panel.draftScope = 'page:source'; panel.configuration.selectedSource = selected;
  panel.onChange = next => { edits.push(next); panel.configuration = next; panel.ownerChanged(); };
  panel.onConnect = () => calls.push('connect'); panel.onDisconnect = () => calls.push('disconnect'); panel.aboutToAppear();
  return { panel, edits, calls, owner };
}
test('DeoVR/HereSphere endpoint drafts survive remount and equal endpoints remain source-isolated', () => {
  const first = mediaFixture();
  const mount = f => field(TextField, props(mediaSource, 'SettingsTextField', () => true, f.panel));
  let host = mount(first); host.changeHandler()('unfinished host '); host.aboutToDisappear(); first.panel.aboutToDisappear();
  const restored = mediaFixture(first.owner); host = mount(restored); assert.equal(host.draft, 'unfinished host ');
  host.aboutToDisappear(); restored.panel.aboutToDisappear();
  const other = mediaFixture(first.owner, 'heresphere'); host = mount(other);
  assert.equal(host.draft, other.panel.endpointHost()); assert.notEqual(host.draft, 'unfinished host ');
  assert.deepEqual(first.calls, []); assert.deepEqual(restored.calls, []); assert.deepEqual(other.calls, []);
  assert.deepEqual(first.edits, []); assert.deepEqual(other.edits, []); host.aboutToDisappear(); other.panel.aboutToDisappear();
});

test('Internal auto-skip incomplete draft persists while live position changes and emits only on explicit commit', () => {
  const owner = new SettingsDraftOwner(), calls = [], snapshot = new playlist.PlaylistPanelSnapshot(); snapshot.autoSkipOffset = -5;
  const mount = position => { const p = new Playlist(); p.draftOwner = owner; p.draftScope = 'page:internal'; p.snapshot = snapshot;
    p.snapshot.positionSeconds = position; p.onAction = action => calls.push(action);
    return field(NumberField, props(source('InternalPlaylistPanel'), 'SettingsNumberField', () => true, p)); };
  let input = mount(0); input.changeHandler()('-'); input.aboutToDisappear(); input = mount(18.25);
  assert.equal(input.draft, '-'); assert.deepEqual(calls, []); input.changeHandler()('-2.5'); input.commitHandler()();
  assert.equal(calls.length, 1); assert.equal(calls[0].kind, 'autoSkipOffset'); assert.equal(calls[0].value, -2.5); input.aboutToDisappear();
});

test('every secondary raw field and curve forwards a semantic key, shared owner and lifecycle epoch', () => {
  for (const name of ['InputSettingsPanel', 'DeoVrSourcePanel', 'InternalPlaylistPanel']) {
    const text = source(name);
    for (const kind of ['SettingsNumberField', 'SettingsTextField', 'CurvePointEditor']) {
      for (const object of fieldObjects(text, kind)) {
        assert.match(object, /draftOwner: this\.draftOwner/); assert.match(object, /draftScope: (?:this\.draftScope|draftScope)/);
        assert.match(object, /draftKey:/); assert.match(object, /draftEpoch: this\.draftEpoch/);
        assert.doesNotMatch(object, /draftKey: this\.label/);
      }
    }
  }
  assert.match(inputSource, /'mapping:' \+ mapping.id \+ ':action:' \+ index \+ ':' \+ action.id \+ ':points'/);
  assert.match(inputSource, /'touch:' \+ this.touchActionId \+ ':points'/);
  const general = source('GeneralSettingsPanel'); assert.match(general, /draftOwner: SettingsDraftOwner/);
  assert.doesNotMatch(general, /SettingsNumberField\(|SettingsTextField\(/);
});

test('unconfirmed touch numbers block execution of the old canonical action; mapping drafts do not', () => {
  const f = inputFixture(); f.panel.selectTouchAction('Axis::Value::Set');
  const touch = field(NumberField, props(inputSource, 'SettingsNumberField', text => text.includes('value: this.touchActionValue,'), f.panel));
  const mapping = mappingField(f, 'SettingsTextField', 'name'); mapping.changeHandler()('Unapplied mapping name');
  f.panel.touchActionHandler()(); assert.equal(f.actions.length, 1, 'mapping editor is not an execution parameter');
  touch.changeHandler()('0.7'); f.panel.touchActionHandler()(); assert.equal(f.actions.length, 1);
  assert.match(f.panel.error, /先确认或取消/); assert.equal(f.panel.touchAction.value, 0);
  touch.cancelHandler()(); f.panel.touchActionHandler()(); assert.equal(f.actions.length, 2);
  touch.changeHandler()('0.7'); touch.commitHandler()(); f.panel.touchActionHandler()();
  assert.equal(f.actions.length, 3); assert.equal(f.actions[2].value, .7);
  assert.equal(f.owner.hasPending(f.panel.draftScope + ':mappings', 'mapping:'), true);
  touch.aboutToDisappear(); mapping.aboutToDisappear(); f.panel.aboutToDisappear();
});

test('raw custom curve coordinates block touch execution but confirmed point selection does not', () => {
  const f = inputFixture(); f.panel.selectTouchAction('MotionProvider::Custom Curve::Points::Set');
  const key = 'touch:' + f.panel.touchActionId + ':points';
  const coordinateScope = JSON.stringify([f.panel.draftScope + ':touch', key, 'coordinates']);
  const lease = f.owner.open(coordinateScope, 'point:0:x', 'curve-v1', '["0","0","0"]');
  f.owner.write(lease.token, 'curve-v1', '["1e-","0","1"]', true);
  f.panel.touchActionHandler()(); assert.deepEqual(f.actions, []); assert.match(f.panel.error, /先确认或取消/);
  f.owner.write(lease.token, 'curve-v1', '["0","0","0"]', false);
  f.panel.touchActionHandler()(); assert.equal(f.actions.length, 1); f.owner.release(lease.token); f.panel.aboutToDisappear();
});

test('pending endpoint text blocks Connect across remount, and Cancel permits the existing canonical endpoint', () => {
  const first = mediaFixture(), host = field(TextField, props(mediaSource, 'SettingsTextField', () => true, first.panel));
  host.changeHandler()('new-target.local'); first.panel.connectionHandler(false)();
  assert.deepEqual(first.calls, []); assert.match(first.panel.draftNotice, /先确认或取消/);
  assert.equal(first.panel.configuration.deoVr.host, '127.0.0.1'); host.aboutToDisappear(); first.panel.aboutToDisappear();
  const second = mediaFixture(first.owner); const nextHost = field(TextField, props(mediaSource, 'SettingsTextField', () => true, second.panel));
  second.panel.connectionHandler(false)(); assert.deepEqual(second.calls, []);
  nextHost.cancelHandler()(); second.panel.connectionHandler(false)(); assert.deepEqual(second.calls, ['connect']);
  nextHost.aboutToDisappear(); second.panel.aboutToDisappear();
});

test('bounded owner write refusal is visible and cannot silently authorize an unsaved touch action', () => {
  const f = inputFixture(new SettingsDraftOwner(100, 2000));
  f.panel.selectTouchAction('MotionProvider::Custom Curve::Points::Set');
  const points = Array.from({ length: 200 }, (_, index) => new motion.MotionCurvePoint(index, .5));
  assert.equal(f.panel.touchPoints(points), true); assert.equal(f.panel.localDraftStorageError, true);
  assert.match(f.panel.error, /草稿空间不足/); f.panel.touchActionHandler()(); assert.deepEqual(f.actions, []);
  f.panel.aboutToDisappear();
});
