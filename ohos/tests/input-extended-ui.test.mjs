import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
registerHooks({ resolve(specifier, context, next) {
  return next(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? specifier + '.ts' : specifier, context);
} });
const model = await import('../entry/src/main/ets/input/ShortcutConfiguration.ts');
const { KeyboardShortcutConfiguration, KeyboardShortcutMapping, ShortcutAction, shortcutActionCatalog,
  defaultShortcutAction, cloneShortcutAction, cloneShortcutConfiguration, validateShortcutAction } = model;
const source = readFileSync(new URL('../entry/src/main/ets/components/InputSettingsPanel.ets', import.meta.url), 'utf8');
const helperCode = source.split('@Component')[0].replace(/^import .*;\n/gm, '').replace(/export class /g, 'class ');
const E = new Function(...Object.keys(model), stripTypeScriptTypes(helperCode) + '\nreturn InputSettingsEdits;')(...Object.values(model));
const start = source.indexOf('export struct InputSettingsPanel');
const componentCode = source.slice(start, source.indexOf('  @Builder', start)).replace('export struct', 'class')
  .replace(/@(Prop|State|Watch)(\([^)]*\))?\s*/g, '') + '\n}';
class SettingsOption { constructor(value, label = value) { this.value = value; this.label = label; } }
const dependencies = { ...model, InputSettingsEdits: E, SettingsOption };
const Panel = new Function(...Object.keys(dependencies), stripTypeScriptTypes(componentCode) + '\nreturn InputSettingsPanel;')(...Object.values(dependencies));
function config(action = defaultShortcutAction('Axis::ScriptScale::Set')) {
  const configuration = new KeyboardShortcutConfiguration();
  const mapping = new KeyboardShortcutMapping('first', 'First'); mapping.keys = [2017]; mapping.actions = [action];
  configuration.mappings = [mapping]; return configuration;
}
function fixture(action) {
  const panel = new Panel(); const edits = []; const actions = []; let stops = 0;
  panel.configuration = config(action); panel.axisNames = ['L0', 'L1', 'R0']; panel.enabledAxisNames = ['L0', 'L1'];
  panel.selectedAxisName = 'L0';
  panel.onChange = next => { edits.push(next); panel.configuration = next; };
  panel.onAction = next => actions.push(next); panel.onStop = () => { stops++; };
  return { panel, edits, actions, stops: () => stops };
}
const action = (id, fields) => Object.assign(defaultShortcutAction(id), fields);

test('all action IDs remain reachable exactly once in bounded UI categories', () => {
  const { panel } = fixture(); const categories = panel.categories();
  assert.ok(categories.length > 5 && categories.length <= 20);
  const all = [];
  for (const category of categories) {
    const options = panel.actionOptions(false, category.value);
    assert.ok(options.length > 0 && options.length <= 16, category.value + ' contains ' + options.length);
    all.push(...options.map(option => option.value));
    assert.equal(panel.actionOptions(true, category.value)[0].value, '');
  }
  assert.equal(new Set(all).size, all.length);
  assert.deepEqual(all.sort(), shortcutActionCatalog().map(spec => spec.id).sort());
  assert.deepEqual(panel.actionOptions(false, 'unknown'), []);
});

test('category filters are independent per mapping, reject stale selection callbacks and never save runtime state', () => {
  const { panel, edits, actions } = fixture();
  panel.configuration.mappings.push(new KeyboardShortcutMapping('second', 'Second'));
  const stale = panel.bindEditChoice(id => panel.addAction('first', id));
  panel.selectAppendCategory('first', 'axis-motion');
  assert.equal(panel.appendCategory('first'), 'axis-motion'); assert.equal(panel.appendCategory('second'), 'media-playback');
  stale('App::Stop'); assert.equal(edits.length, 0);
  panel.selectAppendCategory('second', 'media-markers');
  panel.selectAppendCategory('first', 'unsupported'); panel.selectAppendCategory('missing', 'sync');
  assert.equal(panel.appendCategory('first'), 'axis-motion');
  assert.deepEqual(actions, []); assert.deepEqual(Object.keys(panel.configuration), ['enabled', 'mappings']);
  panel.readOnly = true; panel.selectAppendCategory('first', 'sync'); assert.equal(panel.appendCategory('first'), 'axis-motion');
});

test('axis targets distinguish execution-time selection from stable enabled, disabled and missing names', () => {
  const { panel } = fixture();
  const options = panel.targetOptions('Z9');
  assert.deepEqual(options.map(option => option.value), ['', 'L0', 'L1', 'R0', 'Z9']);
  assert.match(options[0].label, /执行时解析.*L0/);
  assert.match(options.find(option => option.value === 'R0').label, /已禁用/);
  assert.match(options.find(option => option.value === 'Z9').label, /不存在.*保留/);
  const current = action('Axis::Lock::Toggle', {}); const stable = action('Axis::Lock::Toggle', { targetAxis: 'L1' });
  assert.match(panel.targetDescription(current), /执行时.*L0/);
  panel.selectedAxisName = 'R0';
  assert.match(panel.targetDescription(current), /R0.*已禁用/);
  assert.match(panel.targetDescription(stable), /固定 L1/);
  assert.equal(stable.targetAxis, 'L1');
});

test('axis reference lists offer None and all configured alternatives and retain invalid persisted references visibly', () => {
  const { panel } = fixture();
  const reference = action('Axis::LinkAxis::Set', { targetAxis: 'L1', text: 'R0' });
  assert.deepEqual(panel.textOptions(reference).map(option => option.value), ['', 'L0', 'R0']);
  assert.match(panel.textOptions(reference).find(option => option.value === 'R0').label, /已禁用/);
  reference.text = 'Z9'; assert.match(panel.textOptions(reference).at(-1).label, /不存在.*保留/);
  reference.text = 'L1'; assert.match(panel.textOptions(reference).find(option => option.value === 'L1').label, /自身.*保留/);
  reference.targetAxis = ''; reference.text = '';
  assert.deepEqual(panel.textOptions(reference).map(option => option.value), ['', 'L1', 'R0']);
});

for (const original of [
  action('Axis::ScriptScale::Set', { value: 1.5, targetAxis: 'R0' }),
  action('Axis::MotionProvider::Set', { targetAxis: 'L1', text: 'Random' }),
  action('Media::Chapter::SeekToByName', { text: '第 1 章 / Intro' }),
  action('Media::Loop::Set', { value: 10, secondaryValue: 20 })
]) test('generic numeric edit retains complete DTO for ' + original.id, () => {
  const input = config(original); const expected = cloneShortcutAction(original);
  const next = E.action(input, 'first', 0, original.id, original.value);
  assert.deepEqual(next.mappings[0].actions[0], expected);
  assert.notEqual(next.mappings[0].actions[0], original); assert.deepEqual(input.mappings[0].actions[0], expected);
  const changed = E.action(input, 'first', 0, 'Axis::InterpolationType::Set', 0);
  assert.deepEqual(changed.mappings[0].actions[0], defaultShortcutAction('Axis::InterpolationType::Set'));
});

test('secondary numeric edits are validated detached snapshots and cannot update unrelated fields', () => {
  const input = config(action('Media::Loop::Set', { value: 10, secondaryValue: 20 }));
  const next = E.actionNumber(input, 'first', 0, 'secondaryValue', 30);
  assert.equal(next.mappings[0].actions[0].value, 10); assert.equal(next.mappings[0].actions[0].secondaryValue, 30);
  assert.equal(input.mappings[0].actions[0].secondaryValue, 20);
  for (const invalid of [-1, NaN, Infinity]) assert.equal(E.actionNumber(input, 'first', 0, 'secondaryValue', invalid), null);
  assert.equal(E.actionNumber(input, 'first', 0, 'armed', 1), null);
  assert.equal(E.actionNumber(config(), 'first', 0, 'secondaryValue', 1), null);
  for (const index of [-1, .5, 1, NaN]) assert.equal(E.actionNumber(input, 'first', index, 'value', 1), null);
});

test('bounded marker names, enum/provider selections and retained axis names validate without truncation or implicit retargeting', () => {
  const marker = config(defaultShortcutAction('Media::Bookmark::SeekToByName'));
  const exact = '  Intro / 第一章  ';
  assert.equal(E.actionText(marker, 'first', 0, 'text', exact).mappings[0].actions[0].text, exact);
  assert.ok(E.actionText(marker, 'first', 0, 'text', 'x'.repeat(256)));
  for (const text of ['x'.repeat(257), '\u0000', 'line\nnext']) assert.equal(E.actionText(marker, 'first', 0, 'text', text), null);
  assert.equal(E.actionText(marker, 'first', 0, 'targetAxis', 'L0'), null);
  const axis = config();
  for (const name of ['', 'L0', 'R0', 'Z9']) assert.equal(E.actionText(axis, 'first', 0, 'targetAxis', name).mappings[0].actions[0].targetAxis, name);
  for (const name of ['l0', 'L10', 'current', '../L0', '']) {
    if (name) assert.equal(E.actionText(axis, 'first', 0, 'targetAxis', name), null);
  }
  for (const id of ['Axis::InterpolationType::Set', 'Axis::SmartLimitMode::Set', 'Axis::MotionProvider::Set']) {
    const value = config(defaultShortcutAction(id));
    for (const option of shortcutActionCatalog().find(spec => spec.id === id).textOptions) {
      assert.equal(E.actionText(value, 'first', 0, 'text', option.value).mappings[0].actions[0].text, option.value);
    }
    assert.equal(E.actionText(value, 'first', 0, 'text', 'arbitrary executable'), null);
  }
  assert.equal(E.actionText(axis, 'first', 0, 'connection', 'x'), null);
  for (const index of [-1, .5, 1, NaN]) assert.equal(E.actionText(axis, 'first', index, 'targetAxis', 'L1'), null);
});

for (const original of [
  action('Axis::ScriptScale::Set', { value: 1.5, targetAxis: 'L1' }),
  action('Axis::MotionProvider::Set', { targetAxis: 'L1', text: 'Random' }),
  action('Axis::LinkAxis::Set', { targetAxis: 'L1', text: 'R0' }),
  action('Media::Bookmark::SeekToByName', { text: 'Opening' }),
  action('Media::Loop::Set', { value: 10, secondaryValue: 30 })
]) test('touch dispatch sends an isolated full DTO for ' + original.id, () => {
  const { panel, actions, edits } = fixture();
  panel.selectTouchAction(original.id); panel.touchAction = cloneShortcutAction(original);
  panel.touchActionHandler()();
  assert.deepEqual(actions, [original]); assert.notEqual(actions[0], original); assert.notEqual(actions[0], panel.touchAction);
  actions[0].text = 'mutated externally'; assert.equal(panel.touchAction.text, original.text);
  assert.deepEqual(edits, []);
});

for (const [id, field, value, kind] of [
  ['Axis::ScriptScale::Set', 'targetAxis', 'L1', 'text'],
  ['Media::Bookmark::SeekToByName', 'text', 'Opening', 'text'],
  ['Axis::InterpolationType::Set', 'text', 'makima', 'text'],
  ['Axis::MotionProvider::Set', 'text', 'Pattern', 'text'],
  ['Axis::LinkAxis::Set', 'text', 'L1', 'text'],
  ['Media::Loop::Set', 'secondaryValue', 30, 'number'],
  ['Axis::ScriptScale::Set', 'value', 2, 'number']
]) test('changing touch ' + id + ' ' + field + ' invalidates every old execute and edit callback', () => {
  const { panel, actions } = fixture(); panel.selectTouchAction(id);
  const execute = panel.touchActionHandler(); const oldType = panel.touchChoiceHandler('action');
  const oldCategory = panel.touchChoiceHandler('category'); const oldText = panel.touchTextHandler(field);
  const oldNumber = panel.touchNumberHandler(field); const oldChoice = panel.touchChoiceHandler(field);
  const commit = kind === 'text' ? panel.touchTextHandler(field) : panel.touchNumberHandler(field);
  assert.equal(commit(value), true); assert.equal(commit(value), false);
  execute(); oldType('App::Stop'); oldCategory('app'); oldChoice(value);
  assert.equal(oldText(String(value)), false); assert.equal(oldNumber(0), false);
  assert.equal(panel.touchAction.id, id); assert.equal(panel.touchAction[field], value); assert.deepEqual(actions, []);
  panel.touchActionHandler()(); assert.equal(actions.length, 1); assert.equal(actions[0][field], value);
});

for (const transition of ['axis context changed', 'configuration replaced', 'read-only roundtrip', 'remount']) {
  test('full DTO touch and mapping callbacks reject ' + transition, () => {
    const { panel, actions, edits } = fixture(); panel.selectTouchAction('Axis::MotionProvider::Set');
    const execute = panel.touchActionHandler(); const text = panel.touchTextHandler(); const target = panel.touchChoiceHandler('targetAxis');
    const mapping = panel.bindEditChoice(value => panel.actionText('first', 0, 'targetAxis', value));
    if (transition === 'axis context changed') panel.axisContextChanged();
    if (transition === 'configuration replaced') panel.configuration = cloneShortcutConfiguration(panel.configuration);
    if (transition === 'read-only roundtrip') { panel.readOnly = true; panel.availabilityChanged(); panel.readOnly = false; panel.availabilityChanged(); }
    if (transition === 'remount') { panel.aboutToDisappear(); panel.aboutToAppear(); }
    execute(); target('L1'); mapping('L1'); assert.equal(text('Random'), false);
    assert.deepEqual(actions, []); assert.deepEqual(edits, []); assert.equal(panel.touchAction.targetAxis, '');
  });
}

test('readonly blocks every new direct callback and every malformed DTO while unconditional Stop survives all invalidations', () => {
  const { panel, actions, edits, stops } = fixture(); panel.selectTouchAction('App::Stop'); const stop = panel.touchActionHandler();
  panel.readOnly = true; panel.availabilityChanged(); panel.aboutToDisappear(); panel.axisContextChanged();
  assert.equal(panel.touchText('targetAxis', 'L1'), false); assert.equal(panel.touchNumber('secondaryValue', 2), false);
  assert.equal(panel.actionText('first', 0, 'targetAxis', 'L1'), false);
  assert.equal(panel.actionNumber('first', 0, 'secondaryValue', 2), false);
  panel.selectActionCategory('first', 0, 'media-loop'); panel.touchChoiceHandler('category')('app');
  stop(); panel.stop(); panel.dispatch(new ShortcutAction('App::Stop'));
  assert.equal(stops(), 3); assert.deepEqual(actions, []); assert.deepEqual(edits, []);
  panel.readOnly = false;
  panel.dispatch(new ShortcutAction('Axis::MotionProvider::Set', 0, 'L1', 0, 'UnsafeProvider'));
  panel.dispatch(new ShortcutAction('Output::Arm')); assert.deepEqual(actions, []);
});

test('all typed payload kinds initialize validly and use real metadata-driven fields', () => {
  const { panel } = fixture();
  for (const spec of shortcutActionCatalog()) {
    panel.selectTouchAction(spec.id);
    assert.deepEqual(panel.touchAction, defaultShortcutAction(spec.id)); assert.ok(validateShortcutAction(panel.touchAction));
    if (['enum', 'provider'].includes(spec.valueKind)) assert.deepEqual(panel.textOptions(panel.touchAction).map(option => option.value), spec.textOptions.map(option => option.value));
  }
  for (const field of ['targetAxis', 'secondaryValue', 'secondaryMinimum', 'secondaryMaximum', 'secondaryLabel', 'secondaryUnit', 'valueLabel', 'integer']) assert.ok(source.includes(field));
  for (const kind of ['number', 'boolean', 'text', 'enum', 'axis', 'provider']) assert.ok(source.includes("valueKind === '" + kind + "'"));
});

test('mobile bindings use wrapped 48vp controls, stable full-draft identities and host-owned execution feedback', () => {
  assert.doesNotMatch(source, /\b(?:Scroll|List)\s*\(|\.width\(\d+\)|\.height\((?:[0-3]\d|4[0-7])\)/);
  assert.match(source, /ForEach\(\[String\(this.touchEpoch\) \+ ':' \+ this.renderRevision\]/);
  assert.match(source, /@Prop actionStatus: string = ''/);
  assert.match(source, /Text\('执行结果：' \+ this.actionStatus\)/);
  assert.match(source, /integer: this.spec\(action.id\).integer/);
  assert.match(source, /integer: this.spec\(this.touchActionId\).integer/);
  assert.match(source, /options: this.actionOptions\(false, this.category\(action.id\)\)/);
  assert.match(source, /options: this.actionOptions\(true, this.appendCategory\(mapping.id\)\)/);
  assert.match(source, /options: this.actionOptions\(false, this.category\(this.touchActionId\)\)/);
  assert.doesNotMatch(source, /FilePicker|DocumentViewPicker|Import|Output::Connect|Output::Arm|setInterval|setTimeout/);
});


test('equal axis props from host redraws preserve active editors while changed availability retires them', () => {
  const { panel, actions } = fixture(); panel.aboutToAppear(); panel.selectTouchAction('Axis::Lock::Toggle');
  const execute = panel.touchActionHandler(); const revision = panel.renderRevision;
  panel.axisNames = panel.axisNames.slice(); panel.enabledAxisNames = panel.enabledAxisNames.slice(); panel.axisContextChanged();
  assert.equal(panel.renderRevision, revision); execute(); assert.equal(actions.length, 1);
  panel.enabledAxisNames = ['L0']; panel.axisContextChanged(); execute(); assert.equal(actions.length, 1);
  assert.equal(panel.renderRevision, revision + 1);
});
