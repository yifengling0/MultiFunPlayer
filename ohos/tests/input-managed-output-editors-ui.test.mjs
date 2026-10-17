import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';

registerHooks({ resolve(specifier, context, next) {
  return next(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? specifier + '.ts' : specifier, context);
} });
const model = await import('../entry/src/main/ets/input/ShortcutConfiguration.ts');
const { KeyboardShortcutConfiguration, KeyboardShortcutMapping, defaultShortcutAction,
  cloneShortcutAction, cloneShortcutConfiguration, shortcutActionCatalog } = model;
const source = readFileSync(new URL('../entry/src/main/ets/components/InputSettingsPanel.ets', import.meta.url), 'utf8');
const helpers = source.split('@Component')[0].replace(/^import .*;\n/gm, '').replace(/export class /g, 'class ');
const Edits = new Function(...Object.keys(model), stripTypeScriptTypes(helpers) + '\nreturn InputSettingsEdits;')(...Object.values(model));
const start = source.indexOf('export struct InputSettingsPanel');
const controller = source.slice(start, source.indexOf('  @Builder', start)).replace('export struct', 'class')
  .replace(/@(Prop|State|Watch)(\([^)]*\))?\s*/g, '') + '\n}';
class SettingsOption { constructor(value, label = value) { this.value = value; this.label = label; } }
const dependencies = { ...model, InputSettingsEdits: Edits, SettingsOption };
const Panel = new Function(...Object.keys(dependencies), stripTypeScriptTypes(controller) + '\nreturn InputSettingsPanel;')(...Object.values(dependencies));
const scriptId = 'MotionProvider::Looping Script::Script::Set';
const rangeId = 'OutputTarget::Axis::Range::Middle::Offset';
const outputSpecs = shortcutActionCatalog().filter(spec => spec.targetOutput && spec.targetAxis);
const outputConnectionSpecs = shortcutActionCatalog().filter(spec => spec.targetOutput && !spec.targetAxis);
function fixture(id = rangeId) {
  const panel = new Panel(); const edits = []; const actions = []; let stopped = 0;
  const mapping = new KeyboardShortcutMapping('first', 'First'); mapping.keys = [2017]; mapping.actions = [defaultShortcutAction(id)];
  panel.configuration = new KeyboardShortcutConfiguration(); panel.configuration.mappings = [mapping];
  panel.axisNames = ['L0', 'L1', 'R0']; panel.enabledAxisNames = ['L0', 'L1']; panel.selectedAxisName = 'L0';
  panel.outputOptions = [new SettingsOption('tcp:0', 'TCP 0'), new SettingsOption('udp:0', 'UDP 0（已禁用）')];
  panel.managedScriptOptions = [new SettingsOption('Download/动作.funscript', '动作'),
    new SettingsOption('file://media/Download/Exact%20Name.funscript', 'URI 脚本')];
  panel.actionContextKey = 'targets-generation-1|catalog-1';
  panel.onChange = next => { edits.push(next); panel.configuration = next; };
  panel.onAction = action => actions.push(action); panel.onStop = () => { stopped++; };
  panel.aboutToAppear(); panel.selectTouchAction(id);
  return { panel, edits, actions, stopped: () => stopped };
}

// Exercise the production controller, not a duplicate implementation of editors.
test('the managed script and eight range routes remain reachable alongside exactly six output connection aliases', () => {
  const { panel } = fixture(); const groups = panel.categories();
  assert.equal(groups.length, 20); assert.equal(outputSpecs.length, 8); assert.equal(outputConnectionSpecs.length, 6);
  assert.equal(panel.actionOptions(false, 'output').length, 14);
  assert.ok(panel.actionOptions(false, 'motion-looping').some(option => option.value === scriptId));
  const ids = groups.flatMap(group => {
    const options = panel.actionOptions(false, group.value);
    assert.ok(options.length > 0 && options.length <= 16, group.value);
    return options.map(option => option.value);
  });
  assert.equal(new Set(ids).size, 182);
  assert.deepEqual(ids.sort(), shortcutActionCatalog().map(spec => spec.id).sort());
});

for (const spec of outputSpecs) test('mapping and touch scalar edits preserve the exact output ID and axis: ' + spec.id, () => {
  const { panel, edits, actions } = fixture(spec.id);
  assert.equal(panel.actionText('first', 0, 'outputTargetId', 'udp:0'), true);
  assert.equal(panel.actionText('first', 0, 'targetAxis', 'R0'), true);
  panel.touchChoiceHandler('outputTargetId')('udp:0'); panel.touchChoiceHandler('targetAxis')('R0');
  const fields = [['value', 0.25]];
  if (spec.secondaryValueKind === 'number') fields.push(['secondaryValue', 0.2]);
  if (spec.tertiaryValueKind === 'number') fields.push(['tertiaryValue', 0.8]);
  for (const [field, value] of fields) {
    const old = cloneShortcutConfiguration(panel.configuration);
    const edited = Edits.actionNumber(panel.configuration, 'first', 0, field, value);
    assert.ok(edited); assert.equal(edited.mappings[0].actions[0].outputTargetId, 'udp:0');
    assert.equal(edited.mappings[0].actions[0].targetAxis, 'R0');
    assert.deepEqual(panel.configuration, old);
    assert.equal(panel.actionNumber('first', 0, field, value), true);
    assert.equal(panel.touchNumberHandler(field)(value), true);
    assert.equal(panel.touchAction.outputTargetId, 'udp:0'); assert.equal(panel.touchAction.targetAxis, 'R0');
    assert.equal(panel.configuration.mappings[0].actions[0].outputTargetId, 'udp:0');
    assert.equal(panel.configuration.mappings[0].actions[0].targetAxis, 'R0');
  }
  const expected = cloneShortcutAction(panel.configuration.mappings[0].actions[0]);
  assert.deepEqual(Edits.action(panel.configuration, 'first', 0, expected.id, expected.value).mappings[0].actions[0], expected);
  assert.deepEqual(actions, []); assert.ok(edits.length > 0);
  panel.touchActionHandler()(); assert.deepEqual(actions, [expected]); assert.notEqual(actions[0], panel.touchAction);
  actions[0].outputTargetId = 'tcp:9'; assert.equal(panel.touchAction.outputTargetId, 'udp:0');
});

test('all three numeric fields and output ID reject invalid payloads without changing either draft', () => {
  const { panel, edits, actions } = fixture();
  panel.actionText('first', 0, 'outputTargetId', 'tcp:0'); panel.touchChoiceHandler('outputTargetId')('tcp:0');
  const before = cloneShortcutConfiguration(panel.configuration); const touch = cloneShortcutAction(panel.touchAction);
  const count = edits.length;
  for (const field of ['value', 'secondaryValue', 'tertiaryValue']) {
    for (const value of [NaN, Infinity, -Infinity, 2]) {
      assert.equal(Edits.actionNumber(before, 'first', 0, field, value), null);
      assert.equal(panel.actionNumber('first', 0, field, value), false);
      assert.equal(panel.touchNumberHandler(field)(value), false);
    }
  }
  for (const value of ['tcp:10', 'other:0', '../tcp:0', 'tcp:1']) {
    assert.equal(panel.actionText('first', 0, 'outputTargetId', value), false);
    assert.equal(panel.touchTextHandler('outputTargetId')(value), false);
  }
  assert.equal(Edits.actionNumber(before, 'first', 0, 'unrelated', 0), null);
  assert.equal(Edits.actionText(before, 'first', 0, 'unrelated', ''), null);
  assert.deepEqual(panel.configuration, before); assert.deepEqual(panel.touchAction, touch);
  assert.equal(edits.length, count); assert.deepEqual(actions, []);
});

test('target and script defaults remain unselected, while missing values and disabled labels stay visible', () => {
  const { panel } = fixture(); const action = panel.touchAction;
  assert.equal(action.outputTargetId, ''); assert.equal(panel.outputTargetOptions('')[0].value, '');
  assert.match(panel.outputTargetDescription(action), /未选择.*拒绝.*不会自动/);
  action.outputTargetId = 'udp:0'; action.targetAxis = 'R0';
  assert.match(panel.outputTargetDescription(action), /UDP 0.*已禁用.*udp:0/);
  assert.match(panel.targetDescription(action), /R0.*已禁用/);
  action.outputTargetId = 'webSocket:9'; action.targetAxis = 'Z9';
  assert.match(panel.outputTargetOptions(action.outputTargetId).at(-1).label, /不存在.*已保留/);
  assert.match(panel.outputTargetDescription(action), /webSocket:9.*不存在.*已保留/);
  assert.match(panel.targetDescription(action), /Z9.*不存在.*已保留/);
  const copied = panel.outputTargetOptions(action.outputTargetId); copied[1].label = 'mutated';
  assert.equal(panel.outputOptions[0].label, 'TCP 0'); assert.equal(panel.outputOptions.length, 2);
  panel.selectTouchAction(scriptId); assert.equal(panel.touchAction.text, '');
  assert.equal(panel.managedOptions('')[0].value, ''); assert.match(panel.managedScriptDescription(panel.touchAction), /未选择.*拒绝.*不会清除/);
  panel.touchAction.text = 'Download/missing.funscript';
  assert.equal(panel.managedOptions(panel.touchAction.text).at(-1).value, panel.touchAction.text);
  assert.match(panel.managedScriptDescription(panel.touchAction), /当前目录中不存在.*已保留/);
  assert.equal(panel.managedScriptOptions.length, 2);
});

test('managed script choices preserve exact relative-path or URI references and never execute during edits', () => {
  const { panel, edits, actions } = fixture(scriptId);
  for (const option of panel.managedScriptOptions) {
    panel.bindEditChoice(value => panel.actionText('first', 0, 'text', value))(option.value);
    panel.touchChoiceHandler('text')(option.value);
    assert.equal(panel.configuration.mappings[0].actions[0].text, option.value);
    assert.equal(panel.touchAction.text, option.value);
    assert.equal(panel.actionText('first', 0, 'targetAxis', 'L1'), true);
    assert.equal(panel.touchTextHandler('targetAxis')('L1'), true);
    assert.equal(panel.configuration.mappings[0].actions[0].text, option.value);
    assert.equal(panel.touchAction.text, option.value); assert.deepEqual(actions, []);
  }
  const before = cloneShortcutConfiguration(panel.configuration); const touch = cloneShortcutAction(panel.touchAction);
  const count = edits.length;
  for (const text of ['arbitrary.funscript', '/private/script.funscript', '../Download/script.funscript', ' Download/动作.funscript']) {
    assert.equal(panel.actionText('first', 0, 'text', text), false);
    assert.equal(panel.touchTextHandler()(text), false);
  }
  assert.equal(edits.length, count); assert.deepEqual(panel.configuration, before); assert.deepEqual(panel.touchAction, touch);
  panel.touchActionHandler()(); assert.deepEqual(actions, [touch]);
});

test('catalog removal retains existing references across unrelated edits without silently selecting another entry', () => {
  for (const [id, field, reference] of [[rangeId, 'outputTargetId', 'tcp:0'], [scriptId, 'text', 'Download/动作.funscript']]) {
    const { panel, actions } = fixture(id);
    assert.equal(panel.actionText('first', 0, field, reference), true); assert.equal(panel.touchTextHandler(field)(reference), true);
    panel.outputOptions = []; panel.managedScriptOptions = []; panel.actionContextChanged();
    assert.equal(panel.actionText('first', 0, 'targetAxis', 'L1'), true); assert.equal(panel.touchTextHandler('targetAxis')('L1'), true);
    assert.equal(panel.configuration.mappings[0].actions[0][field], reference); assert.equal(panel.touchAction[field], reference);
    assert.equal(panel.actionText('first', 0, field, reference), true); assert.equal(panel.touchTextHandler(field)(reference), true);
    assert.deepEqual(actions, []);
  }
});

for (const change of ['generation', 'output-removed', 'output-disabled', 'script-removed', 'script-label', 'option-order']) {
  for (const id of [rangeId, scriptId]) test('all queued mapping/touch callbacks retire after ' + change + ': ' + id, () => {
    const { panel, edits, actions } = fixture(id);
    const mappingChoice = panel.bindEditChoice(value => panel.actionText('first', 0, 'targetAxis', value));
    const mappingNumber = panel.bindEditNumber(value => panel.actionNumber('first', 0, 'value', value));
    const mappingText = panel.bindEditText(value => panel.actionText('first', 0, 'text', value));
    const touchChoice = panel.touchChoiceHandler('outputTargetId'); const touchScript = panel.touchChoiceHandler('text');
    const touchNumber = panel.touchNumberHandler('tertiaryValue'); const execute = panel.touchActionHandler();
    if (change === 'generation') panel.actionContextKey = 'targets-generation-2|catalog-1';
    if (change === 'output-removed') panel.outputOptions = [panel.outputOptions[1]];
    if (change === 'output-disabled') panel.outputOptions[0].label = 'TCP 0（已禁用）';
    if (change === 'script-removed') panel.managedScriptOptions = [panel.managedScriptOptions[1]];
    if (change === 'script-label') panel.managedScriptOptions[0].label = 'new label';
    if (change === 'option-order') panel.outputOptions = panel.outputOptions.slice().reverse();
    // Even before ArkUI delivers the Watch callback, the live context mismatch
    // prevents a queued event from using a replacement target/catalog.
    mappingChoice('L1'); assert.equal(mappingNumber(0.2), false); assert.equal(mappingText('Download/动作.funscript'), false);
    touchChoice('tcp:0'); touchScript('Download/动作.funscript'); assert.equal(touchNumber(0.8), false); execute();
    assert.deepEqual(edits, []); assert.deepEqual(actions, []);
    panel.actionContextChanged();
    mappingChoice('R0'); assert.equal(mappingNumber(0.3), false); assert.equal(mappingText('Download/动作.funscript'), false);
    touchChoice('tcp:0'); touchScript('Download/动作.funscript'); assert.equal(touchNumber(0.7), false); execute();
    assert.deepEqual(edits, []); assert.deepEqual(actions, []);
    assert.equal(panel.configuration.mappings[0].actions[0].targetAxis, ''); assert.equal(panel.touchAction.targetAxis, '');
    assert.equal(panel.touchTextHandler('targetAxis')('L1'), true);
  });
}

test('equal fresh option arrays preserve in-progress handlers and equal labels cannot disguise a new generation', () => {
  const { panel, actions } = fixture();
  const number = panel.touchNumberHandler('tertiaryValue'); const revision = panel.renderRevision;
  panel.outputOptions = panel.outputOptions.map(option => new SettingsOption(option.value, option.label));
  panel.managedScriptOptions = panel.managedScriptOptions.map(option => new SettingsOption(option.value, option.label));
  panel.actionContextChanged(); assert.equal(panel.renderRevision, revision); assert.equal(number(0.9), true);
  const queued = panel.touchActionHandler(); panel.actionContextKey += '|replaced-same-id'; panel.actionContextChanged(); queued();
  assert.deepEqual(actions, []); assert.equal(panel.touchAction.tertiaryValue, 0.9);
});

test('target/type edits retire all old scalar and execute callbacks, resetting defaults only for a changed type', () => {
  const { panel, actions } = fixture();
  const old = panel.touchNumberHandler('tertiaryValue'); const execute = panel.touchActionHandler();
  panel.touchChoiceHandler('outputTargetId')('tcp:0'); assert.equal(old(0.7), false); execute();
  assert.equal(panel.touchAction.outputTargetId, 'tcp:0'); assert.deepEqual(actions, []);
  const target = panel.touchChoiceHandler('outputTargetId'); panel.touchChoiceHandler('action')(scriptId); target('udp:0');
  assert.deepEqual(panel.touchAction, defaultShortcutAction(scriptId));
  panel.actionText('first', 0, 'outputTargetId', 'tcp:0'); panel.actionNumber('first', 0, 'tertiaryValue', 0.7);
  panel.selectAction('first', 0, scriptId); assert.deepEqual(panel.configuration.mappings[0].actions[0], defaultShortcutAction(scriptId));
  assert.deepEqual(actions, []);
});

test('readonly/remount invalidation preserves emergency Stop across unavailable option contexts', () => {
  const { panel, actions, edits, stopped } = fixture();
  const output = panel.touchChoiceHandler('outputTargetId'); const script = panel.touchChoiceHandler('text');
  const edit = panel.bindEditChoice(value => panel.actionText('first', 0, 'outputTargetId', value));
  panel.selectTouchAction('App::Stop'); const stop = panel.touchActionHandler();
  panel.readOnly = true; panel.availabilityChanged(); panel.aboutToDisappear();
  panel.actionContextKey = 'removed'; output('tcp:0'); script('Download/动作.funscript'); edit('tcp:0'); stop();
  assert.deepEqual(edits, []); assert.deepEqual(actions, []); assert.equal(stopped(), 1);
  panel.readOnly = false; panel.aboutToAppear(); output('tcp:0'); edit('tcp:0'); assert.deepEqual(edits, []);
});

test('actual ArkUI builders bind managed selectors, output IDs and tertiary limits without new IO or execution paths', () => {
  assert.match(source, /@Prop @Watch\('actionContextChanged'\) outputOptions: SettingsOption\[\]/);
  assert.match(source, /@Prop @Watch\('actionContextChanged'\) managedScriptOptions: SettingsOption\[\]/);
  assert.match(source, /@Prop @Watch\('actionContextChanged'\) actionContextKey: string/);
  assert.match(source, /selected: action.outputTargetId, options: this.outputTargetOptions\(action.outputTargetId\)[\s\S]*?this.bindEditChoice/);
  assert.match(source, /selected: this.touchAction.outputTargetId[\s\S]*?onSelect: this.touchChoiceHandler\('outputTargetId'\)/);
  assert.match(source, /this.spec\(action.id\).managedScript\) \{\s*SettingsChoiceField[\s\S]*?this.managedOptions\(action.text\)[\s\S]*?this.bindEditChoice[\s\S]*?\} else if \(this.spec\(action.id\).valueKind === 'text'\)/);
  assert.match(source, /this.spec\(this.touchActionId\).managedScript\) \{\s*SettingsChoiceField[\s\S]*?this.managedOptions\(this.touchAction.text\)[\s\S]*?this.touchChoiceHandler\('text'\)[\s\S]*?\} else if \(this.spec\(this.touchActionId\).valueKind === 'text'\)/);
  assert.match(source, /value: action.tertiaryValue,[\s\S]*?minimum: this.spec\(action.id\).tertiaryMinimum[\s\S]*?this.bindEditNumber[\s\S]*?'tertiaryValue'/);
  assert.match(source, /value: this.touchAction.tertiaryValue,[\s\S]*?this.touchNumberHandler\('tertiaryValue'\)/);
  assert.doesNotMatch(source, /FilePicker|DocumentViewPicker|readFile|openSync|Output::Connect|Output::Arm|setInterval|setTimeout/);
  assert.doesNotMatch(source, /\b(?:Scroll|List)\s*\(|\.width\(\d+\)|\.height\((?:[0-3]\d|4[0-7])\)/);
});
