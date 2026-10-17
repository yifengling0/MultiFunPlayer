import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';

registerHooks({ resolve(specifier, context, next) {
  return next(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? specifier + '.ts' : specifier, context);
} });
const model = await import('../entry/src/main/ets/input/ShortcutConfiguration.ts');
const { KeyboardShortcutConfiguration, KeyboardShortcutMapping, defaultShortcutAction, shortcutActionCatalog,
  cloneShortcutAction, cloneShortcutConfiguration, validateShortcutAction } = model;
const source = readFileSync(new URL('../entry/src/main/ets/components/InputSettingsPanel.ets', import.meta.url), 'utf8');
const helperCode = source.split('@Component')[0].replace(/^import .*;\n/gm, '').replace(/export class /g, 'class ');
const Edits = new Function(...Object.keys(model), stripTypeScriptTypes(helperCode) + '\nreturn InputSettingsEdits;')(...Object.values(model));
const start = source.indexOf('export struct InputSettingsPanel');
const controller = source.slice(start, source.indexOf('  @Builder', start)).replace('export struct', 'class')
  .replace(/@(Prop|State|Watch)(\([^)]*\))?\s*/g, '') + '\n}';
class SettingsOption { constructor(value, label = value) { this.value = value; this.label = label; } }
const dependencies = { ...model, InputSettingsEdits: Edits, SettingsOption };
const Panel = new Function(...Object.keys(dependencies), stripTypeScriptTypes(controller) + '\nreturn InputSettingsPanel;')(...Object.values(dependencies));
const catalog = shortcutActionCatalog();
const newSpecs = catalog.filter(spec => spec.category === 'motion' || spec.category === 'shortcut' || spec.id === 'Internal::Playlist::PlayByName');
function mapping(id, name, action = defaultShortcutAction('Media::PlayPause::Toggle')) {
  const item = new KeyboardShortcutMapping(id, name); item.actions = [action]; item.keys = [2017]; return item;
}
function fixture(action = defaultShortcutAction('Shortcut::Enabled::Set')) {
  const panel = new Panel(); const edits = []; const actions = []; const cancellations = []; let stops = 0;
  panel.configuration = new KeyboardShortcutConfiguration(); panel.configuration.mappings = [mapping('first', 'First', action)];
  panel.axisNames = ['L0', 'L1', 'R0']; panel.enabledAxisNames = ['L0', 'L1']; panel.selectedAxisName = 'L0';
  panel.onChange = next => { edits.push(next); panel.configuration = next; };
  panel.onAction = action => actions.push(action); panel.onCancelCapture = revision => cancellations.push(revision);
  panel.onStop = () => { stops++; }; panel.aboutToAppear();
  return { panel, edits, actions, cancellations, stops: () => stops };
}

test('178 actions are reachable once through 20 bounded groups', () => {
  const { panel } = fixture(); const groups = panel.categories();
  assert.equal(catalog.length, 178); assert.equal(newSpecs.length, 39); assert.equal(groups.length, 20);
  const expected = ['media-playback', 'media-markers', 'media-loop', 'media-script', 'axis-script', 'axis-sync-lock',
    'axis-link-bypass', 'axis-limit', 'axis-home', 'axis-motion', 'sync', 'internal', 'app',
    'motion-custom', 'motion-looping', 'motion-pattern', 'motion-random', 'shortcut', 'output', 'source'];
  assert.deepEqual(groups.map(group => group.value).sort(), expected.sort());
  const reachable = groups.flatMap(group => {
    const options = panel.actionOptions(false, group.value);
    assert.ok(options.length > 0 && options.length <= 16, group.value);
    return options.map(option => option.value);
  });
  assert.deepEqual(reachable.sort(), catalog.map(spec => spec.id).sort());
  assert.equal(new Set(reachable).size, catalog.length);
  for (const [provider, group] of [['Custom Curve', 'motion-custom'], ['Looping Script', 'motion-looping'], ['Pattern', 'motion-pattern'], ['Random', 'motion-random']]) {
    assert.ok(panel.actionOptions(false, group).every(option => option.value.startsWith('MotionProvider::' + provider + '::')));
  }
});

for (const spec of newSpecs) test('controlled mapping and touch fields retain the full real payload: ' + spec.id, () => {
  const original = defaultShortcutAction(spec.id);
  if (spec.targetAxis) original.targetAxis = 'R0';
  if (spec.valueKind === 'text' || spec.textArgumentLabel) original.text = '  Exact / 名称  ';
  if (spec.valueKind === 'enum' || spec.pointsKind === 'customCurve') original.text = spec.textOptions.at(-1).value;
  if (spec.valueKind === 'number') original.value = spec.integer ? 8 : Math.max(spec.minimum, Math.min(0.5, spec.maximum));
  if (spec.valueKind === 'boolean') original.value = 1;
  const { panel, edits, actions } = fixture(original);
  const changed = Edits.action(panel.configuration, 'first', 0, original.id, original.value);
  assert.deepEqual(changed.mappings[0].actions[0], original);
  assert.notEqual(changed.mappings[0].actions[0], original);
  panel.selectTouchAction(spec.id); assert.deepEqual(panel.touchAction, defaultShortcutAction(spec.id));
  panel.touchAction = cloneShortcutAction(original); panel.touchActionHandler()();
  assert.deepEqual(actions, [original]); assert.notEqual(actions[0], panel.touchAction); assert.deepEqual(edits, []);
  assert.ok(validateShortcutAction(actions[0]));
  assert.deepEqual(Object.keys(actions[0]), ['id', 'value', 'targetAxis', 'secondaryValue', 'text', 'points', 'outputTargetId', 'tertiaryValue']);
  assert.notEqual(actions[0].points, panel.touchAction.points);
  if (actions[0].points.length > 0) assert.notEqual(actions[0].points[0], panel.touchAction.points[0]);
});

test('Shortcut Enabled keeps its exact target name independently from the Set boolean or Toggle action', () => {
  const { panel, edits } = fixture();
  assert.equal(panel.actionText('first', 0, 'text', '  Target 名称  '), true);
  assert.equal(panel.actionNumber('first', 0, 'value', 1), true);
  assert.equal(panel.configuration.mappings[0].actions[0].text, '  Target 名称  ');
  assert.equal(panel.configuration.mappings[0].actions[0].value, 1);
  assert.equal(panel.actionText('first', 0, 'text', ''), true);
  assert.equal(panel.configuration.mappings[0].actions[0].value, 1);
  const persisted = cloneShortcutConfiguration(panel.configuration);
  assert.equal(panel.actionText('first', 0, 'targetAxis', 'L0'), false);
  assert.equal(panel.actionNumber('first', 0, 'secondaryValue', 1), false);
  assert.deepEqual(panel.configuration, persisted);
  panel.selectAction('first', 0, 'Shortcut::Enabled::Toggle');
  assert.deepEqual(panel.configuration.mappings[0].actions[0], defaultShortcutAction('Shortcut::Enabled::Toggle'));
  assert.equal(panel.actionText('first', 0, 'text', 'First'), true);
  assert.equal(panel.actionNumber('first', 0, 'value', 1), false);
  assert.equal(edits.at(-1).mappings[0].actions[0].text, 'First');
});

test('PlayByName accepts the bounded managed path length verbatim and remains separate from ordinary target-name limits', () => {
  const id = 'Internal::Playlist::PlayByName'; const { panel, actions } = fixture(defaultShortcutAction(id));
  const spec = catalog.find(candidate => candidate.id === id); assert.equal(spec.maximumTextLength, 4096);
  const exact = '  Download/中文/' + 'a'.repeat(spec.maximumTextLength - 16) + '  ';
  assert.equal(exact.length, spec.maximumTextLength);
  assert.equal(panel.actionText('first', 0, 'text', exact), true);
  assert.equal(panel.configuration.mappings[0].actions[0].text, exact);
  assert.equal(panel.actionText('first', 0, 'text', exact + 'a'), false);
  panel.selectTouchAction(id); assert.equal(panel.touchTextHandler()(exact), true); panel.touchActionHandler()();
  assert.equal(actions[0].text, exact);
  const target = fixture().panel.configuration;
  assert.equal(Edits.actionText(target, 'first', 0, 'text', 'a'.repeat(257)), null);
});

test('name target feedback exposes first exact match, empty names, duplicates, disabled targets and retained missing names', () => {
  const { panel } = fixture(); const action = defaultShortcutAction('Shortcut::Enabled::Toggle');
  const first = mapping('disabled', 'Target'); first.enabled = false;
  panel.configuration.mappings = [first, mapping('second', 'Target'), mapping('case', 'target'), mapping('empty', '')];
  action.text = 'Target'; assert.match(panel.textArgumentDescription(action), /已禁用.*同名 2 项.*第一项/);
  action.text = 'target'; assert.match(panel.textArgumentDescription(action), /已启用.*区分大小写/);
  assert.doesNotMatch(panel.textArgumentDescription(action), /同名/);
  action.text = ''; assert.match(panel.textArgumentDescription(action), /未命名映射.*已启用/);
  action.text = ' Target '; assert.match(panel.textArgumentDescription(action), /“ Target ”.*不存在.*保留/);
  action.text = 'TARGET'; assert.match(panel.textArgumentDescription(action), /不存在.*区分大小写/);
  assert.equal(panel.textArgumentDescription(defaultShortcutAction('Internal::Playlist::PlayByName')), '');
});

test('Reset renders the real optional Request sync boolean, default true, without a playback-state label', () => {
  const { panel, actions } = fixture(); const id = 'MotionProvider::Custom Curve::Reset';
  panel.selectTouchAction(id); assert.equal(panel.touchAction.value, 1);
  assert.deepEqual(panel.booleans(id).map(option => option.value), ['0', '1']);
  assert.match(panel.booleans(id)[0].label, /不请求同步/); assert.match(panel.booleans(id)[1].label, /请求同步/);
  assert.doesNotMatch(panel.booleans(id).map(option => option.label).join(' '), /停止|播放/);
  panel.touchBooleanHandler()('0'); panel.touchActionHandler()(); assert.equal(actions[0].value, 0);
  panel.touchBooleanHandler()('1'); panel.touchActionHandler()(); assert.equal(actions[1].value, 1);
});

test('Motion actions show their fixed provider and retain disabled or missing axis arguments', () => {
  const { panel } = fixture(); const action = defaultShortcutAction('MotionProvider::Random::Octaves::Set');
  assert.match(panel.targetDescription(action), /执行时.*L0.*固定提供器：Random/);
  action.targetAxis = 'R0'; assert.match(panel.targetDescription(action), /固定 R0.*已禁用.*Random/);
  action.targetAxis = 'Z9'; assert.match(panel.targetDescription(action), /不存在.*保留.*Random/);
  panel.selectedAxisName = 'L1'; assert.equal(action.targetAxis, 'Z9');
  assert.equal(panel.targetOptions('Z9').at(-1).value, 'Z9');
});

test('Motion numeric and enum fields use catalog bounds while malformed values cannot mutate snapshots', () => {
  for (const spec of newSpecs.filter(spec => spec.category === 'motion')) {
    const { panel } = fixture(defaultShortcutAction(spec.id));
    const before = cloneShortcutConfiguration(panel.configuration);
    if (spec.valueKind === 'number') {
      for (const value of [NaN, Infinity, -Infinity]) assert.equal(Edits.actionNumber(before, 'first', 0, 'value', value), null);
      assert.ok(Edits.actionNumber(before, 'first', 0, 'value', spec.minimum));
      assert.ok(Edits.actionNumber(before, 'first', 0, 'value', spec.maximum));
      if (spec.integer) assert.equal(Edits.actionNumber(before, 'first', 0, 'value', 1.5), null);
    }
    if (spec.valueKind === 'enum') {
      assert.deepEqual(panel.textOptions(before.mappings[0].actions[0]).map(option => option.value), spec.textOptions.map(option => option.value));
      assert.equal(Edits.actionText(before, 'first', 0, 'text', 'Unknown'), null);
    }
    assert.deepEqual(panel.configuration, before);
  }
});

for (const [id, field, value, kind] of [
  ['Shortcut::Enabled::Set', 'text', 'Target', 'text'],
  ['Shortcut::Enabled::Set', 'value', 1, 'number'],
  ['Shortcut::Enabled::Toggle', 'text', '', 'text'],
  ['Internal::Playlist::PlayByName', 'text', '  Exact / 文件.funscript  ', 'text'],
  ['MotionProvider::Custom Curve::Reset', 'value', 0, 'number'],
  ['MotionProvider::Random::Octaves::Set', 'value', 8, 'number'],
  ['MotionProvider::Pattern::Pattern::Set', 'text', 'sine', 'text'],
  ['MotionProvider::Looping Script::Interpolation::Set', 'targetAxis', 'L1', 'text']
]) test('new touch field commits retire every previous edit and execute callback: ' + id + ' ' + field, () => {
  const { panel, actions } = fixture(); panel.selectTouchAction(id);
  const execute = panel.touchActionHandler(); const oldText = panel.touchTextHandler('text');
  const oldValue = panel.touchNumberHandler(); const oldTarget = panel.touchChoiceHandler('targetAxis');
  const oldType = panel.touchChoiceHandler('action'); const oldCategory = panel.touchChoiceHandler('category');
  const commit = kind === 'text' ? panel.touchTextHandler(field) : panel.touchNumberHandler(field);
  assert.equal(commit(value), true); assert.equal(commit(value), false);
  execute(); assert.equal(oldText('obsolete'), false); assert.equal(oldValue(0), false);
  oldTarget('R0'); oldType('App::Stop'); oldCategory('app');
  assert.equal(panel.touchAction.id, id); assert.equal(panel.touchAction[field], value); assert.deepEqual(actions, []);
  panel.touchActionHandler()(); assert.equal(actions[0][field], value);
});

for (const transition of ['reorder', 'rename', 'remove', 'readonly', 'axis', 'remount']) {
  test('name-target and Motion mapping callbacks cannot retarget after ' + transition, () => {
    const { panel, actions, edits } = fixture(); panel.configuration.mappings.push(mapping('second', 'Second'));
    panel.selectTouchAction('Shortcut::Enabled::Set');
    const text = panel.bindEditText(value => panel.actionText('first', 0, 'text', value));
    const bool = panel.bindEditChoice(value => panel.actionValue('first', 0, Number(value)));
    const touch = panel.touchTextHandler(); const execute = panel.touchActionHandler();
    if (transition === 'reorder') panel.moveMapping('first', 1);
    if (transition === 'rename') panel.changeName('second', 'Renamed');
    if (transition === 'remove') panel.removeMapping('second');
    if (transition === 'readonly') { panel.readOnly = true; panel.availabilityChanged(); panel.readOnly = false; panel.availabilityChanged(); }
    if (transition === 'axis') { panel.enabledAxisNames = ['L0']; panel.axisContextChanged(); }
    if (transition === 'remount') { panel.aboutToDisappear(); panel.aboutToAppear(); }
    const count = edits.length; assert.equal(text('Target'), false); bool('1'); assert.equal(touch('Target'), false); execute();
    assert.equal(edits.length, count); assert.deepEqual(actions, []);
  });
}

test('independent target edits retire captured key callbacks; Stop remains available during readonly and teardown', () => {
  const { panel, actions, cancellations, stops } = fixture();
  panel.captureId = 'first'; panel.captureRevision = 5; panel.captureKeys = [2018];
  const apply = panel.captureApplyHandler('first'); const cancel = panel.captureCancelHandler();
  panel.actionText('first', 0, 'text', 'First'); apply(); cancel();
  assert.deepEqual(panel.configuration.mappings[0].keys, [2017]); assert.deepEqual(cancellations, []);
  panel.selectTouchAction('App::Stop'); const stop = panel.touchActionHandler();
  panel.readOnly = true; panel.availabilityChanged(); panel.aboutToDisappear();
  assert.equal(panel.touchText('text', 'ignored'), false); assert.equal(panel.actionText('first', 0, 'text', 'ignored'), false);
  stop(); panel.stop(); assert.equal(stops(), 2); assert.deepEqual(actions, []);
});

test('actual ArkUI bindings expose independent text and boolean controls with guarded callbacks and 48vp layout', () => {
  assert.match(source, /SettingsTextField\(\{ label: this.spec\(action.id\).textArgumentLabel[\s\S]*?onCommit: this.bindEditText/);
  assert.match(source, /SettingsTextField\(\{ label: this.spec\(this.touchActionId\).textArgumentLabel[\s\S]*?onCommit: this.touchTextHandler\(\)/);
  assert.match(source, /options: this.booleans\(action.id\)/); assert.match(source, /options: this.booleans\(this.touchActionId\)/);
  assert.equal(source.split('禁用仅阻止后续新手势；当前动作组和已排队触发按原语义继续。要立即撤销请使用全局停止。').length - 1, 2);
  assert.doesNotMatch(source, /\b(?:Scroll|List)\s*\(|\.width\(\d+\)|\.height\((?:[0-3]\d|4[0-7])\)/);
  assert.doesNotMatch(source, /FilePicker|DocumentViewPicker|Output::Connect|Output::Arm|setInterval|setTimeout/);
});
