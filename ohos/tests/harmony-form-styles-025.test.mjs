import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
registerHooks({ resolve(specifier, context, next) {
  return next(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? specifier + '.ts' : specifier, context);
} });
const { UiStyle } = await import('../entry/src/main/ets/presentation/UiStyle.ts');
const names = ['CurvePointEditor', 'DeoVrSourcePanel', 'DeviceSettingsPanel', 'GeneralSettingsPanel',
  'InputSettingsPanel', 'InternalPlaylistPanel', 'MotionSettingsPanel', 'OutputSettingsPanel', 'SyncSettingsPanel'];
const source = name => readFileSync(new URL('../entry/src/main/ets/components/' + name + '.ets', import.meta.url), 'utf8');
const fields = source('CurvePointEditor');
function controller(name, dependencies = {}) {
  const start = fields.indexOf('export struct ' + name), end = fields.indexOf('  build()', start);
  const body = fields.slice(start, end).replace('export struct', 'class')
    .replace(/@(Prop|State|Watch|StorageLink)(\([^)]*\))?\s*/g, '') + '\n}';
  return new Function(...Object.keys(dependencies), stripTypeScriptTypes(body) + '\nreturn ' + name + ';')(...Object.values(dependencies));
}
const helper = fields.split('@Component')[0].replace(/^import .*;\n/gm, '').replace(/export class /g, 'class ');
const { SettingsOption } = new Function(stripTypeScriptTypes(helper) + '\nreturn { SettingsOption };')();
const Choice = controller('SettingsChoiceField', { SettingsOption });
const Switch = controller('SettingsSwitchField');

test('approved 0.25 palette and typography retain explicit density and one pane gutter', () => {
  for (const [name, value] of Object.entries({ page: '#F5F6F8', card: '#F5F6F8', field: '#FFFFFF',
    ink: '#1C2937', muted: '#647181', edge: '#DFE4EA', accent: '#236B73', accentSoft: '#E7F0F0',
    danger: '#B4434A', dangerSoft: '#F9EBED' })) assert.equal(UiStyle[name], value, name);
  assert.equal(UiStyle.body(), 16); assert.equal(UiStyle.helper, 14); assert.equal(UiStyle.section, 18);
  assert.equal(UiStyle.heading, 22); assert.equal(UiStyle.control, 48); assert.equal(UiStyle.radius, 8);
  for (const width of [240, 320, 359]) assert.equal(UiStyle.contentInset(width), 12);
  for (const width of [360, 390, 768, 839]) assert.equal(UiStyle.contentInset(width), 16);
  for (const width of [840, 1024, 1280, 1920]) assert.equal(UiStyle.contentInset(width), 24);
});

for (const name of names) test(name + ': commands share bounded 48vp hit targets, outlined surfaces and explicit focus/disabled states', () => {
  const text = source(name);
  for (const match of text.matchAll(/(?<![A-Za-z])Button\(/g)) {
    const action = text.slice(match.index, text.indexOf('.onClick(', match.index));
    assert.match(action, /minHeight: (?:UiStyle.control|52), maxWidth: '100%', minWidth: UiStyle.control/);
    assert.match(action, /stateEffect\(true\)/); // Native pressed feedback is retained.
    assert.match(action, /borderRadius\(UiStyle.radius\)/);
    assert.match(action, /\.border\(\{ width: 1, color:/);
    assert.match(action, /focused: \{ \.outline\(\{ width: 2, color: UiStyle.accent \}\) \}/);
    assert.match(action, /disabled: \{ \.opacity\(UiStyle.disabledOpacity\) \}/);
    assert.doesNotMatch(action, /\.backgroundColor\(UiStyle.accentSoft\)/, 'accent tint is reserved for actual selected states');
  }
  assert.doesNotMatch(text, /\bScroll\s*\(/, 'the enclosing workspace remains the only panel scroll owner');
  assert.doesNotMatch(text, /\.padding\(UiStyle.padding\(this.compact\)\)/, 'no nested horizontal panel gutter');
});

test('choice details are explicit, complete and readable without enabling a read-only selection', () => {
  const field = new Choice(), changes = []; field.label = 'Download 脚本';
  field.selected = 'uri:kept'; field.options = [new SettingsOption('uri:kept', '很长的文件名 '.repeat(600))];
  field.onSelect = value => changes.push(value); field.aboutToAppear();
  const expected = field.options[0].label;
  assert.equal(field.detailExpanded, false); assert.equal(field.labelText(), expected);
  for (const width of [240, 320, 390, 600, 1200]) field.measureField(width);
  assert.deepEqual(changes, []); assert.equal(field.selected, 'uri:kept');
  field.editable = false; field.detailHandler()();
  assert.equal(field.detailExpanded, true); assert.equal(field.labelText(), expected); assert.deepEqual(changes, []);
  field.detailHandler()(); assert.equal(field.detailExpanded, false);
  field.selectHandler()(0); assert.deepEqual(changes, []);
  const build = fields.slice(fields.indexOf('export struct SettingsChoiceField'), fields.indexOf('export struct SettingsSectionTitle'));
  assert.match(build, /if \(this.detailExpanded\) \{\s*Text\(this.labelText\(\)\).*wordBreak\(WordBreak.BREAK_ALL\)/);
  assert.match(build, /accessibilityText\(this.label \+ '：' \+ this.labelText\(\)\)/);
  assert.match(build, /Select\([\s\S]*backgroundColor\(UiStyle.field\)/);
  assert.doesNotMatch(build, /TextOverflow.Ellipsis|\.maxLines\(/);
});

test('unavailable choice retains its entire saved value and never silently selects a replacement', () => {
  const field = new Choice(), changes = []; field.label = '已保存来源'; field.selected = 'missing:' + '不可用路径/'.repeat(100);
  field.options = [new SettingsOption('new', '可用来源')]; field.onSelect = value => changes.push(value);
  field.aboutToAppear(); assert.equal(field.index(), -1);
  assert.equal(field.labelText(), field.selected + '（不可用，已保留）');
  field.detailHandler()(); assert.equal(field.detailExpanded, true); assert.deepEqual(changes, []);
  field.selectHandler()(-1); field.selectHandler()(1); assert.deepEqual(changes, []);
  field.selectHandler()(0); assert.deepEqual(changes, ['new']);
});

for (const boundary of ['selection', 'options', 'label', 'unmount']) test('choice disclosure and select callbacks reject stale ' + boundary + ' without side effects', () => {
  const field = new Choice(), changes = []; field.label = '来源'; field.selected = 'first';
  field.options = [new SettingsOption('first'), new SettingsOption('second')]; field.onSelect = value => changes.push(value);
  field.aboutToAppear(); const detail = field.detailHandler(), select = field.selectHandler();
  if (boundary === 'selection') field.selected = 'second';
  if (boundary === 'options') field.options = [new SettingsOption('first', 'replaced')];
  if (boundary === 'label') field.label = '另一字段';
  if (boundary === 'unmount') field.aboutToDisappear();
  detail(); select(0); assert.equal(field.detailExpanded, false); assert.deepEqual(changes, []);
});

test('smaller switch visual retains a 48vp touch response and unchanged guarded callback behavior', () => {
  const block = fields.slice(fields.indexOf('export struct SettingsSwitchField'), fields.indexOf('export struct SettingsChoiceField'));
  assert.match(block, /\.width\(48\)\.height\(28\)/);
  assert.match(block, /responseRegion\(\{ x: -2, y: -12, width: UiStyle.control, height: UiStyle.control \}\)/);
  assert.match(block, /constraintSize\(\{ minHeight: UiStyle.control \}\)/);
  assert.match(block, /this.value \? '，已开启' : '，已关闭'/);
  const field = new Switch(), changes = []; field.onChange = value => changes.push(value); field.aboutToAppear();
  const old = field.changeHandler(); field.value = true; old(true); assert.deepEqual(changes, []);
  field.changeHandler()(false); assert.deepEqual(changes, [false]);
  field.editable = false; field.changeHandler()(true); assert.deepEqual(changes, [false]);
});

test('selected rows include readable state and global stop remains the solid destructive action', () => {
  const playlist = source('InternalPlaylistPanel'), input = source('InputSettingsPanel');
  assert.match(playlist, /'▶ 当前脚本'/);
  assert.match(playlist, /row.index === this.snapshot.currentIndex \? UiStyle.accentSoft : UiStyle.field/);
  assert.match(playlist, /row.index === this.snapshot.currentIndex \? '当前脚本：' : '选择脚本：'/);
  assert.match(fields, /index === this.selected \? ' · 已选' : ''/);
  const stop = input.slice(input.indexOf("Button('全局停止 · F12')"), input.indexOf('.onClick(() => this.stop())'));
  assert.match(stop, /fontColor\(UiStyle.field\).backgroundColor\(UiStyle.danger\)/);
  assert.match(source('OutputSettingsPanel'), /Button\('启用发送'\)[\s\S]*this.connection === 'connected' && !this.armed/);
});

for (const compact of [false, true]) test('numeric short-label inline layout is conservative and presentation-only, compact=' + compact, () => {
  for (const width of [240, 280, 299, NaN, Infinity]) {
    assert.equal(UiStyle.numberLabelWidth(width, '强度', '%', compact), '100%');
    assert.equal(UiStyle.numberControlWidth(width, '强度', '%', compact), '100%');
  }
  for (const width of [300, 320, 360, 390, 480, 599]) {
    assert.equal(UiStyle.numberLabelWidth(width, '强度', '%', compact), '45%');
    assert.equal(UiStyle.numberControlWidth(width, '强度', '%', compact), '55%');
    assert.ok(width * 0.55 >= 120);
    for (const [label, unit] of [['安全限速与自动归位的较长说明'.repeat(2), '秒'], ['输出', '长单位与额外的边界说明'.repeat(2)]]) {
      assert.equal(UiStyle.numberLabelWidth(width, label, unit, compact), '100%');
      assert.equal(UiStyle.numberControlWidth(width, label, unit, compact), '100%');
    }
  }
  for (const width of [600, 800, 1200]) {
    assert.equal(UiStyle.numberLabelWidth(width, '轴偏移', 'ms', compact), '40%');
    assert.equal(UiStyle.numberControlWidth(width, '轴偏移', 'ms', compact), '60%');
  }
  const block = fields.slice(fields.indexOf('export struct SettingsNumberField'), fields.indexOf('export struct SettingsTextField'));
  assert.equal((block.match(/TextInput\(/g) ?? []).length, 1, 'responsive sizing retains one input identity');
  assert.match(block, /numberLabelWidth\(this.fieldWidth, this.label, this.unit, this.compact\)/);
  assert.match(block, /numberControlWidth\(this.fieldWidth, this.label, this.unit, this.compact\)/);
  assert.doesNotMatch(block, /if \(this.fieldWidth/);
});

test('secure paste keeps its native consent action and uses only supported security-component styling', () => {
  const text = source('DeviceSettingsPanel');
  const paste = text.slice(text.indexOf('      PasteButton('), text.indexOf('.onClick(this.pasteHandler())') + '.onClick(this.pasteHandler())'.length);
  assert.match(paste, /icon: PasteIconStyle.LINES, text: PasteDescription.PASTE, buttonType: ButtonType.Normal/);
  assert.match(paste, /fontColor\(UiStyle.ink\).iconColor\(UiStyle.ink\).backgroundColor\(UiStyle.field\)/);
  assert.match(paste, /borderWidth\(1\).borderColor\(UiStyle.edge\).borderRadius\(UiStyle.radius\)/);
  assert.match(paste, /minHeight: (?:UiStyle.control|52), maxWidth: '100%', minWidth: UiStyle.control/);
  assert.match(paste, /enabled\(!this.readOnly && !this.transferBusy\)/);
  assert.match(paste, /onClick\(this.pasteHandler\(\)\)/);
  assert.doesNotMatch(paste, /stateStyles|opacity|onTouch|onKeyEvent/);
});
