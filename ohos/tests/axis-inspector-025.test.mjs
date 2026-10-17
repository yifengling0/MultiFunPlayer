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
const { SettingsDraftOwner } = await import('../entry/src/main/ets/presentation/SettingsDraftOwner.ts');
const { KeyboardInputSession } = await import('../entry/src/main/ets/app/KeyboardInputSession.ts');
const { UiStyle } = await import('../entry/src/main/ets/presentation/UiStyle.ts');
const read = name => readFileSync(new URL('../entry/src/main/ets/components/' + name + '.ets', import.meta.url), 'utf8');
const source = read('AxisSettingsPanel'), sharedSource = read('CurvePointEditor');
function helpers(text, names, dependencies) {
  const body = text.split('@Component')[0].replace(/^import .*;\n/gm, '').replace(/export class /g, 'class ');
  return new Function(...Object.keys(dependencies), stripTypeScriptTypes(body) + '\nreturn {' + names.join(',') + '};')(...Object.values(dependencies));
}
const dependencies = { ...device, ...axis, ...motion, SettingsDraftOwner, KeyboardInputSession, UiStyle };
Object.assign(dependencies, helpers(sharedSource, ['SettingsNumberLogic', 'SettingsOption'], dependencies));
Object.assign(dependencies, helpers(source, ['AxisSettingsEdits'], dependencies));
function controller(text, name) {
  const start = text.indexOf('export struct ' + name);
  const end = Math.min(...[text.indexOf('  @Builder', start), text.indexOf('  build()', start)].filter(value => value >= 0));
  const body = text.slice(start, end).replace('export struct', 'class').replace(/@(Prop|State|Watch|StorageLink)(\([^)]*\))?\s*/g, '') + '\n}';
  return new Function(...Object.keys(dependencies), stripTypeScriptTypes(body) + '\nreturn ' + name + ';')(...Object.values(dependencies));
}
const Panel = controller(source, 'AxisSettingsPanel'), NumberField = controller(sharedSource, 'SettingsNumberField');
function fixture(owner = new SettingsDraftOwner(), axisName = 'L0', profile = 'profile:1') {
  const panel = new Panel(), changes = [];
  const definition = device.DeviceProfiles.getBuiltIn().axes.find(value => value.name === axisName);
  Object.assign(panel, { draftOwner: owner, draftScope: 'axis:' + profile + ':' + axisName, axis: definition,
    configuration: new axis.AxisConfiguration(definition), onChange: snapshot => changes.push(snapshot) });
  panel.aboutToAppear();
  return { panel, changes, owner };
}
function balanced(text, start) {
  let depth = 0, quote = '';
  for (let end = start; end < text.length; end++) {
    const char = text[end];
    if (quote) { if (char === '\\') { end++; } else if (char === quote) { quote = ''; } }
    else if (char === "'" || char === '"' || char === '`') { quote = char; }
    else if (char === '{') { depth++; }
    else if (char === '}' && --depth === 0) { return text.slice(start, end + 1); }
  }
  assert.fail('Unbalanced production block');
}
function groupBody(group) {
  const marker = "if (this.groupExpanded('" + group + "')) ";
  const start = source.indexOf(marker); assert.ok(start >= 0, group + ' has a reachable group body');
  return balanced(source, source.indexOf('{', start));
}
function controls(text) {
  const fields = [...text.matchAll(/this\.(?:number|switch|reference)Field\('([^']+)'/g)].map(match => match[1]);
  fields.push(...[...text.matchAll(/AxisSettingsEdits\.choice\(this\.configuration, '([^']+)'/g)].map(match => match[1]));
  if (/CurvePointEditor\(\{[\s\S]*?points: this\.configuration\.smartLimitPoints/.test(text)) fields.push('smartLimitPoints');
  return fields.sort();
}
function numberField(panel, key, value) {
  // Use the exact production builder's property object, including original range,
  // scope, key, read-only and guarded numeric callback; no test-only binding keys.
  const start = source.indexOf('SettingsNumberField({', source.indexOf('  numberField(')) + 'SettingsNumberField('.length;
  const parameters = new Function('field', 'label', 'value', 'unit', ...Object.keys(dependencies),
    'return ' + stripTypeScriptTypes('(' + balanced(source, start) + ')') + ';')
    .call(panel, key, key, value, '', ...Object.values(dependencies));
  const field = Object.assign(new NumberField(), parameters); field.aboutToAppear(); return field;
}
const groups = {
  script: ['lockScript', 'interpolationType', 'bypassScript', 'bypassTransition'],
  link: ['linkAxis', 'linkAxisHasPriority'],
  motion: ['selectedMotionProvider', 'motionProviderBlend', 'bypassMotionProvider', 'motionProviderFillGaps',
    'motionProviderMinimumGapDurationSeconds', 'motionProviderSpeedLimitWithAxis', 'updateMotionProviderWhenPaused',
    'updateMotionProviderWithoutScript', 'updateMotionProviderWithAxis'],
  safety: ['speedLimitEnabled', 'speedLimitUnitsPerSecond', 'smartLimitInputAxis', 'smartLimitMode', 'smartLimitTargetValue', 'smartLimitPoints'],
  home: ['autoHomeEnabled', 'autoHomeInsideScript', 'autoHomeDelaySeconds', 'autoHomeDurationSeconds', 'autoHomeTargetValue']
};

test('all 29 original axis fields remain bound exactly once; scale, offset and inversion are always visible', () => {
  const body = source.slice(source.indexOf('  build() {'));
  const alwaysVisible = body.slice(0, body.indexOf('this.groupHeader('));
  assert.deepEqual(controls(alwaysVisible), ['invertScript', 'offsetSeconds', 'scriptScale']);
  assert.doesNotMatch(alwaysVisible, /groupExpanded/);
  const all = controls(alwaysVisible);
  for (const [group, expected] of Object.entries(groups)) {
    assert.deepEqual(controls(groupBody(group)), [...expected].sort(), group);
    assert.match(body, new RegExp("this\\.groupHeader\\('" + group + "', '[^']+'\\)"));
    all.push(...controls(groupBody(group)));
  }
  assert.equal(all.length, 29); assert.equal(new Set(all).size, 29);
  assert.deepEqual(all.sort(), Object.keys(fixture().panel.configuration).sort());
});

test('headers are semantic 48vp controls with wrapping current summaries and accessible expanded/collapsed text', () => {
  const header = source.slice(source.indexOf('  groupHeader('), source.indexOf('  build() {'));
  assert.match(header, /minHeight: UiStyle\.control, maxWidth: '100%'/);
  assert.match(header, /stateEffect\(true\)/); assert.match(header, /wordBreak\(WordBreak\.BREAK_ALL\)/);
  assert.match(header, /accessibilityText\(label/); assert.match(header, /已展开/); assert.match(header, /已折叠/);
  assert.match(header, /\.onClick\(this\.groupToggleHandler\(group\)\)/);
  assert.doesNotMatch(header, /enabled\(!this\.readOnly\)|TextOverflow\.Ellipsis|\.height\(/);
});

test('all advanced groups start closed and toggling changes only the volatile presentation entry', () => {
  const f = fixture(), before = axis.AxisConfiguration.toJson(f.panel.configuration);
  for (const group of Object.keys(groups)) assert.equal(f.panel.groupExpanded(group), false);
  for (const group of Object.keys(groups)) f.panel.groupToggleHandler(group)();
  assert.deepEqual(f.panel.expandedGroups, [Object.keys(groups).at(-1)]);
  assert.deepEqual(axis.AxisConfiguration.toJson(f.panel.configuration), before); assert.deepEqual(f.changes, []);
  assert.equal(f.owner.hasPending(f.panel.draftScope), false);
  assert.deepEqual(JSON.parse(f.owner.peek(f.panel.draftScope, '$axisInspectorGroups:L0')), [Object.keys(groups).at(-1)]);
  f.panel.groupToggleHandler('unknown')(); assert.equal(f.panel.expandedGroups.length, 1);
  const presentation = source.slice(source.indexOf('  private groupNames()'), source.indexOf('  private interactionToken('));
  assert.doesNotMatch(presentation, /this\.emit\(|this\.onChange\(|AxisSettingsEdits|\.clearScope\(|\.invalidate\(|\.clear\(|\.play\(|\.connect\(|\.arm\(|\.save\(/);
  f.panel.aboutToDisappear();
});

test('group expansion survives remounts/epochs and remains independent for every axis and profile', () => {
  const owner = new SettingsDraftOwner(); let f = fixture(owner);
  f.panel.groupToggleHandler('motion')(); f.panel.groupToggleHandler('safety')(); f.panel.aboutToDisappear();
  let other = fixture(owner, 'R0'); assert.deepEqual(other.panel.expandedGroups, []); other.panel.groupToggleHandler('home')(); other.panel.aboutToDisappear();
  f = fixture(owner); assert.deepEqual(f.panel.expandedGroups, ['safety']);
  const old = f.panel.groupToggleHandler('home'); f.panel.draftEpoch++; f.panel.draftContextChanged(); old();
  assert.deepEqual(f.panel.expandedGroups, ['safety']); assert.deepEqual(f.changes, []); f.panel.aboutToDisappear();
  other = fixture(owner, 'L0', 'different-profile:1'); assert.deepEqual(other.panel.expandedGroups, []); other.panel.aboutToDisappear();
  other = fixture(owner, 'R0'); assert.deepEqual(other.panel.expandedGroups, ['home']); other.panel.aboutToDisappear();
  f = fixture(new SettingsDraftOwner()); assert.deepEqual(f.panel.expandedGroups, [], 'a fresh process owner has no persisted expansion'); f.panel.aboutToDisappear();
});

for (const transition of ['axis-before-watch', 'profile-before-watch', 'epoch-before-watch', 'owner-before-watch', 'background', 'invalidate', 'dispose', 'unmount']) {
  test('stale header cannot toggle another/current axis after ' + transition, () => {
    const f = fixture(), stale = f.panel.groupToggleHandler('safety');
    if (transition === 'axis-before-watch') f.panel.axis = device.DeviceProfiles.getBuiltIn().axes.find(value => value.name === 'R0');
    if (transition === 'profile-before-watch') f.panel.draftScope = 'axis:other:1:L0';
    if (transition === 'epoch-before-watch') f.panel.draftEpoch++;
    if (transition === 'owner-before-watch') f.panel.draftOwner = new SettingsDraftOwner();
    if (transition === 'background') f.owner.setAvailable(false);
    if (transition === 'invalidate') f.owner.invalidate();
    if (transition === 'dispose') f.owner.dispose();
    if (transition === 'unmount') f.panel.aboutToDisappear();
    stale(); assert.deepEqual(f.panel.expandedGroups, []); assert.deepEqual(f.changes, []);
    if (transition !== 'dispose') assert.equal(f.owner.peek('axis:profile:1:L0', '$axisInspectorGroups:L0'), '[]');
    f.panel.aboutToDisappear();
  });
}

test('new same-axis mount retires an older header before its delayed disappearance', () => {
  const first = fixture(), stale = first.panel.groupToggleHandler('safety');
  const second = fixture(first.owner); second.panel.groupToggleHandler('link')(); stale();
  assert.deepEqual(second.panel.expandedGroups, ['link']); first.panel.aboutToDisappear();
  second.panel.groupToggleHandler('home')(); assert.deepEqual(second.panel.expandedGroups, ['home']);
  second.panel.aboutToDisappear(); const third = fixture(first.owner);
  assert.deepEqual(third.panel.expandedGroups, ['home']); third.panel.aboutToDisappear();
});

for (const [group, key] of [['motion', 'motionProviderBlend'], ['safety', 'smartLimitTargetValue'], ['home', 'autoHomeDelaySeconds']]) {
  test(group + ' collapse/reopen preserves raw invalid input, pending status and explicit cancel without writing settings', () => {
    const f = fixture(); f.panel.groupToggleHandler(group)();
    let field = numberField(f.panel, key, f.panel.configuration[key]);
    field.changeHandler()('1e-'); field.commitHandler()(); assert.equal(field.error, true);
    const staleCommit = field.commitHandler(), staleChange = field.changeHandler();
    const stored = f.owner.peek(f.panel.draftScope, key), baseline = axis.AxisConfiguration.toJson(f.panel.configuration);
    f.panel.groupToggleHandler(group)(); field.aboutToDisappear(); staleCommit(); staleChange('0.4');
    assert.equal(f.panel.groupExpanded(group), false); assert.equal(f.owner.peek(f.panel.draftScope, key), stored);
    assert.equal(f.panel.groupHasPending(group), true); assert.match(f.panel.groupSummary(group), /有未应用输入/);
    f.panel.groupToggleHandler(group)(); field = numberField(f.panel, key, f.panel.configuration[key]);
    assert.equal(field.draft, '1e-'); assert.equal(field.error, true); assert.equal(field.edited, true);
    assert.deepEqual(f.changes, []); assert.deepEqual(axis.AxisConfiguration.toJson(f.panel.configuration), baseline);
    field.cancelHandler()(); assert.equal(field.draft, String(f.panel.configuration[key]));
    assert.equal(field.error, false); assert.equal(f.panel.groupHasPending(group), false); assert.deepEqual(f.changes, []);
    field.aboutToDisappear(); f.panel.aboutToDisappear();
  });
}

test('collapsed safety summary also retains and reveals Smart curve coordinate drafts', () => {
  const f = fixture(), scope = JSON.stringify([f.panel.draftScope, 'curve', 'coordinates']);
  const lease = f.owner.open(scope, 'point:0:x', 'curve-source', '25');
  f.owner.write(lease.token, 'curve-source', '1e-', true); f.owner.release(lease.token);
  f.panel.groupToggleHandler('safety')(); f.panel.groupToggleHandler('safety')();
  assert.equal(f.owner.peek(scope, 'point:0:x'), '1e-'); assert.equal(f.owner.hasPending(scope), true);
  assert.match(f.panel.groupSummary('safety'), /有未应用输入/); assert.deepEqual(f.changes, []);
  f.panel.aboutToDisappear();
});

test('read-only users can inspect every group while original guarded editing paths refuse changes', () => {
  const f = fixture(); f.panel.readOnly = true;
  for (const group of Object.keys(groups)) { f.panel.groupToggleHandler(group)(); assert.equal(f.panel.groupExpanded(group), true); }
  const commit = f.panel.guardedNumber(value => f.panel.emit(dependencies.AxisSettingsEdits.number(f.panel.configuration, 'scriptScale', value)));
  assert.equal(commit(1.2), false); f.panel.guardedFlag(() => f.changes.push('flag'))(true);
  f.panel.guardedChoice(() => f.changes.push('choice'))('linear'); f.panel.guardedAction(() => f.changes.push('button'))();
  assert.deepEqual(f.changes, []);
  for (const group of Object.keys(groups)) assert.match(groupBody(group), /enabled\(!this\.readOnly\)/);
  f.panel.aboutToDisappear();
});

test('real configuration drives summaries, including nondefault interpolation, priority, motion, speed and home settings', () => {
  const f = fixture(), value = f.panel.configuration;
  assert.equal(f.panel.groupSummary('script'), 'PCHIP'); assert.equal(f.panel.groupSummary('link'), '未链接');
  assert.equal(f.panel.groupSummary('motion'), '未选择生成器');
  Object.assign(value, { interpolationType: 'makima', lockScript: true, bypassScript: true, bypassTransition: true,
    linkAxis: 'R1', linkAxisHasPriority: true, selectedMotionProvider: 'Pattern', motionProviderBlend: .37,
    motionProviderFillGaps: true, bypassMotionProvider: true, speedLimitEnabled: true, speedLimitUnitsPerSecond: Infinity,
    smartLimitInputAxis: 'R2', smartLimitMode: 'speed', autoHomeEnabled: true, autoHomeDelaySeconds: 9.5, autoHomeDurationSeconds: 2 });
  assert.equal(f.panel.groupSummary('script'), 'Makima · 已锁定 · 跳过脚本 · 跳过过渡');
  assert.equal(f.panel.groupSummary('link'), 'R1 · 链接轴优先');
  assert.equal(f.panel.groupSummary('motion'), 'Pattern · 混合 0.37 · 已跳过 · 填补间隙');
  assert.equal(f.panel.groupSummary('safety'), '速度限制 无限制 · 智能限制输入 R2（速度）');
  assert.equal(f.panel.groupSummary('home'), '等待 9.5 秒 · 归位 2 秒');
  value.autoHomeEnabled = false; assert.equal(f.panel.groupSummary('home'), '未启用');
  value.speedLimitUnitsPerSecond = 0; assert.match(f.panel.groupSummary('safety'), /0 units\/s/);
  assert.deepEqual(f.changes, []); f.panel.aboutToDisappear();
});

test('unlimited-speed action retains the original numeric conversion but retires on collapse/reopen or axis change', () => {
  const f = fixture(); f.panel.groupToggleHandler('safety')();
  const action = () => f.panel.emit(dependencies.AxisSettingsEdits.speedFromSeconds(f.panel.configuration, 0));
  const stale = f.panel.guardedAction(action); f.panel.groupToggleHandler('safety')(); f.panel.groupToggleHandler('safety')();
  stale(); assert.deepEqual(f.changes, []); f.panel.guardedAction(action)();
  assert.equal(f.changes.length, 1); assert.equal(f.changes[0].speedLimitUnitsPerSecond, Infinity);
  const oldAxis = f.panel.guardedAction(action); f.panel.axis = device.DeviceProfiles.getBuiltIn().axes.find(value => value.name === 'R0');
  oldAxis(); assert.equal(f.changes.length, 1);
  assert.match(groupBody('safety'), /onClick\(this\.guardedAction\(\(\) => \{ this\.emit\(AxisSettingsEdits\.speedFromSeconds\(this\.configuration, 0\)\)/);
  f.panel.aboutToDisappear();
});

test('valid but unapplied numeric text survives collapse and full remount until explicit confirmation', () => {
  let f = fixture(); f.panel.groupToggleHandler('motion')();
  let field = numberField(f.panel, 'motionProviderBlend', f.panel.configuration.motionProviderBlend);
  field.changeHandler()('0.42'); const stale = field.commitHandler();
  f.panel.groupToggleHandler('motion')(); field.aboutToDisappear(); f.panel.aboutToDisappear();
  const before = f; f = fixture(before.owner);
  assert.equal(f.panel.groupExpanded('motion'), false); assert.deepEqual(before.changes, []); assert.deepEqual(f.changes, []);
  assert.equal(f.panel.configuration.motionProviderBlend, 0); f.panel.groupToggleHandler('motion')();
  field = numberField(f.panel, 'motionProviderBlend', f.panel.configuration.motionProviderBlend);
  assert.equal(field.draft, '0.42'); assert.equal(field.edited, true); stale();
  assert.deepEqual(before.changes, []); assert.deepEqual(f.changes, []);
  field.commitHandler()(); assert.equal(f.changes.length, 1); assert.equal(f.changes[0].motionProviderBlend, .42);
  assert.equal(field.edited, false); assert.equal(f.owner.hasPending(f.panel.draftScope, 'motionProviderBlend'), false);
  field.aboutToDisappear(); f.panel.aboutToDisappear();
});

test('header rendering never reopens leases or changes state while backgrounded; foreground restores presentation only', () => {
  const f = fixture(); f.panel.groupToggleHandler('link')(); const stale = f.panel.groupToggleHandler('home');
  f.owner.setAvailable(false); let opens = 0; const open = f.owner.open.bind(f.owner);
  f.owner.open = (...args) => { opens++; return open(...args); };
  const revision = f.panel.groupRevision;
  for (const group of Object.keys(groups)) { f.panel.groupToggleHandler(group)(); f.panel.groupSummary(group); }
  assert.equal(opens, 0); assert.equal(f.panel.groupRevision, revision); assert.deepEqual(f.panel.expandedGroups, ['link']);
  f.owner.setAvailable(true); f.panel.draftEpoch++; f.panel.draftContextChanged(); stale();
  assert.deepEqual(f.panel.expandedGroups, ['link']); f.panel.groupToggleHandler('home')();
  assert.deepEqual(f.panel.expandedGroups, ['home']); assert.deepEqual(f.changes, []); f.panel.aboutToDisappear();
});


test('showTitle defaults to true and disabling the duplicate heading hides no axis controls', () => {
  const f = fixture(); assert.equal(f.panel.showTitle, true);
  const marker = 'if (this.showTitle) ';
  const start = source.indexOf(marker); assert.ok(start >= 0);
  const title = balanced(source, source.indexOf('{', start));
  assert.match(title, /SettingsSectionTitle\(\{ label: this\.axis\.name/);
  assert.deepEqual(controls(title), []);
  const bodyWithoutTitle = source.slice(source.indexOf('  build() {')).replace(marker + title, '');
  assert.equal(controls(bodyWithoutTitle).length, 29);
  assert.doesNotMatch(bodyWithoutTitle, /label: this\.axis\.name/);
  f.panel.showTitle = false;
  assert.deepEqual(controls(bodyWithoutTitle), Object.keys(f.panel.configuration).sort());
  assert.deepEqual(f.changes, []); f.panel.aboutToDisappear();
});
