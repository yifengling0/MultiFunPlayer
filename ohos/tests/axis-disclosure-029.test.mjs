import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';

registerHooks({ resolve(specifier, context, next) {
  return next(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? specifier + '.ts' : specifier, context);
} });
const device = await import('../entry/src/main/ets/core/DeviceProfile.ts');
const axis = await import('../entry/src/main/ets/core/AxisConfiguration.ts');
const motion = await import('../entry/src/main/ets/core/MotionConfiguration.ts');
const preview = await import('../entry/src/main/ets/core/CurvePreview.ts');
const { SettingsDraftOwner } = await import('../entry/src/main/ets/presentation/SettingsDraftOwner.ts');
const { KeyboardInputSession } = await import('../entry/src/main/ets/app/KeyboardInputSession.ts');
const { UiStyle } = await import('../entry/src/main/ets/presentation/UiStyle.ts');
const read = name => readFileSync(new URL('../entry/src/main/ets/components/' + name + '.ets', import.meta.url), 'utf8');
const source = read('AxisSettingsPanel'), sharedSource = read('CurvePointEditor');
const dependencies = { ...device, ...axis, ...motion, ...preview, SettingsDraftOwner, KeyboardInputSession, UiStyle,
  CanvasRenderingContext2D: function() { return new Proxy({}, { get(target, key) { return target[key] ?? (() => {}); } }); },
  RenderingContextSettings: function() {} };
function helpers(text, names) {
  const code = text.split('@Component')[0].replace(/^import .*;\n/gm, '').replace(/export class /g, 'class ');
  return new Function(...Object.keys(dependencies), stripTypeScriptTypes(code) + ';return {' + names.join(',') + '};')(...Object.values(dependencies));
}
Object.assign(dependencies, helpers(sharedSource, ['SettingsNumberLogic', 'SettingsOption', 'CurveEditRules', 'CurveGeometryOwners']));
Object.assign(dependencies, helpers(source, ['AxisSettingsEdits']));
function controller(text, name) {
  const start = text.indexOf('export struct ' + name);
  const end = Math.min(...[text.indexOf('  @Builder', start), text.indexOf('  build()', start)].filter(value => value >= 0));
  const code = text.slice(start, end).replace('export struct', 'class').replace(/@(Prop|State|Watch|StorageLink)(\([^)]*\))?\s*/g, '') + '\n}';
  return new Function(...Object.keys(dependencies), stripTypeScriptTypes(code) + ';return ' + name + ';')(...Object.values(dependencies));
}
const Panel = controller(source, 'AxisSettingsPanel');
const NumberField = controller(sharedSource, 'SettingsNumberField');
const Curve = controller(sharedSource, 'CurvePointEditor');
function fixture(owner = new SettingsDraftOwner(), name = 'L0', profile = 'profile:1', epoch = 0) {
  const panel = new Panel(), changes = [];
  const definition = device.DeviceProfiles.getBuiltIn().axes.find(value => value.name === name);
  Object.assign(panel, { draftOwner: owner, draftScope: 'axis:' + profile + ':' + name, draftEpoch: epoch,
    axis: definition, configuration: new axis.AxisConfiguration(definition), onChange: value => changes.push(value) });
  panel.aboutToAppear(); return { panel, changes, owner };
}
function balanced(text, start) {
  let depth = 0, quote = '';
  for (let end = start; end < text.length; end++) {
    const character = text[end];
    if (quote) { if (character === '\\') end++; else if (character === quote) quote = ''; }
    else if (character === "'" || character === '"' || character === '`') quote = character;
    else if (character === '{') depth++;
    else if (character === '}' && --depth === 0) return text.slice(start, end + 1);
  }
  assert.fail('Unbalanced production component');
}
function props(panel, component, start, variables = {}) {
  const first = source.indexOf(component + '({', start) + component.length + 1;
  return new Function(...Object.keys(variables), ...Object.keys(dependencies),
    'return ' + stripTypeScriptTypes('(' + balanced(source, first) + ')') + ';')
    .call(panel, ...Object.values(variables), ...Object.values(dependencies));
}
function numberField(panel, key) {
  const values = key === 'speedSeconds' ? props(panel, 'SettingsNumberField', source.indexOf("if (this.configuration.speedLimitUnitsPerSecond > 0)")) :
    props(panel, 'SettingsNumberField', source.indexOf('  numberField('), { field: key, label: key, value: panel.configuration[key], unit: '' });
  const field = Object.assign(new NumberField(), values); field.aboutToAppear(); return field;
}
function curve(panel) {
  const editor = Object.assign(new Curve(), props(panel, 'CurvePointEditor', source.indexOf('  build()')));
  editor.aboutToAppear(); return editor;
}
function coordinate(editor) {
  const field = Object.assign(new NumberField(), { draftOwner: editor.draftOwner, draftScope: editor.coordinateDraftScope(),
    draftKey: 'point:0:x', draftSource: editor.coordinateDraftSource(), draftEpoch: editor.draftEpoch,
    draftGuard: editor.coordinateGuard(), value: editor.points[0].x, minimum: editor.minimumX, maximum: editor.maximumX,
    onCommit: editor.pointHandler(0, 'x') });
  field.aboutToAppear(); return field;
}
const groups = ['script', 'link', 'motion', 'safety', 'home'];

test('0.29 accordion permits one advanced section or an intentional all-closed state without editing configuration', () => {
  const f = fixture(), initial = axis.AxisConfiguration.toJson(f.panel.configuration);
  assert.deepEqual(f.panel.expandedGroups, []);
  for (const group of groups) {
    f.panel.groupToggleHandler(group)();
    assert.deepEqual(f.panel.expandedGroups, [group]);
    assert.deepEqual(groups.filter(value => f.panel.groupExpanded(value)), [group]);
    assert.deepEqual(JSON.parse(f.owner.peek(f.panel.draftScope, '$axisInspectorGroups:L0')), [group]);
    assert.equal(f.owner.hasPending(f.panel.draftScope), false);
  }
  f.panel.groupToggleHandler('home')(); assert.deepEqual(f.panel.expandedGroups, []);
  f.panel.groupToggleHandler('unknown')(); assert.deepEqual(f.panel.expandedGroups, []);
  assert.deepEqual(axis.AxisConfiguration.toJson(f.panel.configuration), initial); assert.deepEqual(f.changes, []);
  f.panel.aboutToDisappear();
});

test('legacy multiple-open presentation restores only its last valid group without touching field drafts', () => {
  const owner = new SettingsDraftOwner(), scope = 'axis:profile:1:L0', source = JSON.stringify([scope, 'L0']);
  const lease = owner.open(scope, '$axisInspectorGroups:L0', source, '[]');
  owner.write(lease.token, source, JSON.stringify(['script', 'home', 'unknown', 'motion'])); owner.release(lease.token);
  const pending = owner.open(scope, 'scriptScale', 'draft-source', '1');
  owner.write(pending.token, 'draft-source', '1e-', true); owner.release(pending.token);
  const f = fixture(owner); assert.deepEqual(f.panel.expandedGroups, ['motion']);
  assert.equal(owner.peek(scope, 'scriptScale'), '1e-'); assert.deepEqual(f.changes, []);
  f.panel.groupToggleHandler('motion')(); f.panel.aboutToDisappear();
  const remount = fixture(owner); assert.deepEqual(remount.panel.expandedGroups, []); remount.panel.aboutToDisappear();
});

test('accordion selection survives responsive remounts and remains separate by profile and axis', () => {
  const owner = new SettingsDraftOwner(); let f = fixture(owner);
  f.panel.groupToggleHandler('safety')(); f.panel.aboutToDisappear();
  const other = fixture(owner, 'R0'); other.panel.groupToggleHandler('home')(); other.panel.aboutToDisappear();
  const profile = fixture(owner, 'L0', 'other-profile:2'); assert.deepEqual(profile.panel.expandedGroups, []); profile.panel.aboutToDisappear();
  for (const epoch of [1, 2, 4, 8]) {
    f = fixture(owner, 'L0', 'profile:1', epoch); assert.deepEqual(f.panel.expandedGroups, ['safety']);
    const stale = f.panel.groupToggleHandler('home'); f.panel.draftEpoch++; f.panel.draftContextChanged(); stale();
    assert.deepEqual(f.panel.expandedGroups, ['safety']); assert.deepEqual(f.changes, []); f.panel.aboutToDisappear();
  }
  f = fixture(owner, 'R0'); assert.deepEqual(f.panel.expandedGroups, ['home']); f.panel.aboutToDisappear();
});

for (const transition of ['axis', 'profile', 'epoch', 'owner', 'background', 'invalidate', 'dispose', 'unmount', 'replacement']) {
  test('stale section and edit callbacks are rejected after ' + transition + ' without waiting for Watch', () => {
    const f = fixture(); let edits = 0;
    const header = f.panel.groupToggleHandler('home'), number = f.panel.guardedNumber(() => { edits++; return true; });
    const flag = f.panel.guardedFlag(() => edits++), choice = f.panel.guardedChoice(() => edits++);
    const action = f.panel.guardedAction(() => edits++), points = f.panel.curveHandler();
    if (transition === 'axis') f.panel.axis = device.DeviceProfiles.getBuiltIn().axes.find(value => value.name === 'R0');
    if (transition === 'profile') f.panel.draftScope = 'axis:other:1:L0';
    if (transition === 'epoch') f.panel.draftEpoch++;
    if (transition === 'owner') f.panel.draftOwner = new SettingsDraftOwner();
    if (transition === 'background') f.owner.setAvailable(false);
    if (transition === 'invalidate') f.owner.invalidate();
    if (transition === 'dispose') f.owner.dispose();
    if (transition === 'unmount') f.panel.aboutToDisappear();
    const replacement = transition === 'replacement' ? fixture(f.owner) : null;
    if (replacement) { replacement.panel.groupToggleHandler('link')(); replacement.panel.fieldGuard(); }
    header(); assert.equal(number(2), false); flag(true); choice('makima'); action(); points([new motion.MotionCurvePoint(20, 80)]);
    assert.deepEqual(f.panel.expandedGroups, []); assert.equal(edits, 0); assert.deepEqual(f.changes, []);
    f.panel.aboutToDisappear(); if (replacement) replacement.panel.aboutToDisappear();
  });
}

test('switching sections immediately retires prior numeric, switch, select, curve and action delivery', () => {
  const f = fixture(); f.panel.groupToggleHandler('safety')(); let edits = 0;
  const number = f.panel.guardedNumber(() => { edits++; return true; }), flag = f.panel.guardedFlag(() => edits++);
  const choice = f.panel.guardedChoice(() => edits++), action = f.panel.guardedAction(() => edits++), points = f.panel.curveHandler();
  f.panel.groupToggleHandler('motion')();
  assert.equal(number(3), false); flag(true); choice('speed'); action(); points([new motion.MotionCurvePoint(30, 70)]);
  assert.equal(edits, 0); assert.deepEqual(f.changes, []);
  f.panel.groupToggleHandler('safety')(); number(3); flag(true); choice('speed'); action(); points([new motion.MotionCurvePoint(30, 70)]);
  assert.equal(edits, 0); assert.deepEqual(f.changes, []);
  f.panel.guardedNumber(() => { edits++; return true; })(3); assert.equal(edits, 1); f.panel.aboutToDisappear();
});

for (const [group, key] of [['motion', 'motionProviderBlend'], ['safety', 'smartLimitTargetValue'], ['safety', 'speedSeconds'], ['home', 'autoHomeDelaySeconds']]) {
  test('unapplied ' + key + ' survives section switch, closure and remount with validation state intact', () => {
    let f = fixture(); f.panel.groupToggleHandler(group)(); let field = numberField(f.panel, key);
    field.changeHandler()('1e-'); field.commitHandler()(); assert.equal(field.error, true);
    const oldChange = field.changeHandler(), oldCommit = field.commitHandler(), oldCancel = field.cancelHandler();
    const payload = f.owner.peek(f.panel.draftScope, key);
    f.panel.groupToggleHandler('script')();
    // Events delivered between a fold and the old child disappearing cannot
    // overwrite or falsely confirm its retained draft.
    oldChange('0.4'); oldCommit(); oldCancel();
    assert.equal(f.owner.peek(f.panel.draftScope, key), payload); assert.deepEqual(f.changes, []);
    assert.match(f.panel.groupSummary(group), /有未应用输入/);
    field.aboutToDisappear(); f.panel.aboutToDisappear();
    const owner = f.owner; f = fixture(owner, 'L0', 'profile:1', 5); f.panel.groupToggleHandler(group)();
    field = numberField(f.panel, key); assert.equal(field.draft, '1e-'); assert.equal(field.error, true);
    field.cancelHandler()(); assert.equal(f.panel.groupHasPending(group), false); assert.deepEqual(f.changes, []);
    field.aboutToDisappear(); f.panel.aboutToDisappear();
  });
}

test('valid raw numeric draft remains unapplied across accordion remount until explicit confirmation', () => {
  let f = fixture(); f.panel.groupToggleHandler('motion')(); let field = numberField(f.panel, 'motionProviderBlend');
  field.changeHandler()('0.42'); f.panel.groupToggleHandler('home')(); field.aboutToDisappear(); f.panel.aboutToDisappear();
  const owner = f.owner; assert.deepEqual(f.changes, []); f = fixture(owner); f.panel.groupToggleHandler('motion')();
  field = numberField(f.panel, 'motionProviderBlend'); assert.equal(field.draft, '0.42'); assert.equal(field.edited, true);
  assert.equal(f.panel.configuration.motionProviderBlend, 0); assert.deepEqual(f.changes, []);
  field.commitHandler()(); assert.equal(f.changes.length, 1); assert.equal(f.changes[0].motionProviderBlend, .42);
  field.aboutToDisappear(); f.panel.aboutToDisappear();
});

test('real Smart Limit coordinate editor retains invalid draft and source identity through accordion remount', () => {
  let f = fixture(); f.panel.groupToggleHandler('safety')(); let editor = curve(f.panel), field = coordinate(editor);
  field.changeHandler()('1e-'); field.commitHandler()(); const sourceId = editor.draftSourceId, stale = field.commitHandler();
  f.panel.groupToggleHandler('home')(); field.aboutToDisappear(); editor.aboutToDisappear();
  assert.match(f.panel.groupSummary('safety'), /有未应用输入/); f.panel.aboutToDisappear();
  const owner = f.owner; f = fixture(owner, 'L0', 'profile:1', 2); f.panel.groupToggleHandler('safety')();
  editor = curve(f.panel); field = coordinate(editor); assert.equal(editor.draftSourceId, sourceId);
  assert.equal(field.draft, '1e-'); assert.equal(field.error, true); stale(); assert.deepEqual(f.changes, []);
  field.cancelHandler()(); assert.equal(f.panel.groupHasPending('safety'), false);
  field.aboutToDisappear(); editor.aboutToDisappear(); f.panel.aboutToDisappear();
});

test('summary uses applied scale, offset and inversion rather than pending text or invented telemetry', () => {
  const f = fixture(); Object.assign(f.panel.configuration, { scriptScale: .37, offsetSeconds: -2.5, invertScript: true });
  const field = numberField(f.panel, 'scriptScale'); field.changeHandler()('0.99');
  assert.equal(f.panel.currentSummary(), '已应用 · 强度 0.37× · 偏移 -2.5 秒 · 反转');
  assert.doesNotMatch(f.panel.currentSummary(), /0\.99|连接|运行/); assert.deepEqual(f.changes, []);
  field.aboutToDisappear(); f.panel.aboutToDisappear();
});

test('all 29 bindings survive; common controls precede compact semantic accordion rows', () => {
  const body = source.slice(source.indexOf('  build() {')), common = body.slice(0, body.indexOf('this.groupHeader('));
  const bound = text => [...text.matchAll(/this\.(?:number|switch|reference)Field\('([^']+)'/g)].map(match => match[1]);
  assert.deepEqual(bound(common), ['scriptScale', 'offsetSeconds', 'invertScript']); assert.doesNotMatch(common, /groupExpanded/);
  const all = bound(body).concat([...body.matchAll(/AxisSettingsEdits\.choice\(this\.configuration, '([^']+)'/g)].map(match => match[1]), 'smartLimitPoints');
  const f = fixture(); assert.equal(all.length, 29); assert.deepEqual(all.sort(), Object.keys(f.panel.configuration).sort());
  for (const group of groups) assert.ok(body.includes("if (this.groupExpanded('" + group + "'))"));
  const header = source.slice(source.indexOf('  groupHeader('), source.indexOf('  build() {'));
  assert.match(header, /minHeight: UiStyle\.control/); assert.match(header, /fontSize\(UiStyle\.body\(this\.compact\)\)/);
  assert.match(header, /top: 6, bottom: 6/); assert.match(header, /accessibilityText\(label/);
  assert.match(header, /已展开/); assert.match(header, /已折叠/); assert.doesNotMatch(header, /TextOverflow\.Ellipsis|\.height\(/);
  const unlimited = body.slice(body.indexOf("Button('设为无限制')"), body.indexOf("SettingsSectionTitle({ label: '智能限制'"));
  assert.match(unlimited, /minHeight: UiStyle\.control/); assert.doesNotMatch(unlimited, /\.width\('100%'\)/);
  assert.match(unlimited, /AxisSettingsEdits\.speedFromSeconds\(this\.configuration, 0\)/);
  f.panel.readOnly = true;
  for (const group of groups) { f.panel.groupToggleHandler(group)(); assert.deepEqual(f.panel.expandedGroups, [group]); }
  assert.equal(f.panel.guardedNumber(() => true)(2), false); assert.deepEqual(f.changes, []); f.panel.aboutToDisappear();
});
