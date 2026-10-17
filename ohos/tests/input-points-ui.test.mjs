import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';

registerHooks({ resolve(specifier, context, next) {
  return next(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? specifier + '.ts' : specifier, context);
} });
const { SettingsDraftOwner } = await import('../entry/src/main/ets/presentation/SettingsDraftOwner.ts');
const model = await import('../entry/src/main/ets/input/ShortcutConfiguration.ts');
const motion = await import('../entry/src/main/ets/core/MotionConfiguration.ts');
const preview = await import('../entry/src/main/ets/core/CurvePreview.ts');
const { KeyboardInputSession } = await import('../entry/src/main/ets/app/KeyboardInputSession.ts');
const { KeyboardShortcutConfiguration, KeyboardShortcutMapping, ShortcutPoint, defaultShortcutAction,
  cloneShortcutAction, cloneShortcutConfiguration, validateShortcutConfiguration } = model;
const { MotionCurvePoint } = motion;
const SMART = 'Axis::SmartLimitPoints::Set';
const CUSTOM = 'MotionProvider::Custom Curve::Points::Set';
const source = name => readFileSync(new URL('../entry/src/main/ets/components/' + name + '.ets', import.meta.url), 'utf8');
const inputSource = source('InputSettingsPanel');
const curveSource = source('CurvePointEditor');
function helpers(text, names, dependencies) {
  const code = text.split('@Component')[0].replace(/^import .*;\n/gm, '').replace(/export class /g, 'class ');
  return new Function(...Object.keys(dependencies), stripTypeScriptTypes(code) + '\nreturn {' + names.join(',') + '};')(...Object.values(dependencies));
}
function controller(text, name, dependencies) {
  const start = text.indexOf('export struct ' + name);
  const build = text.indexOf('  build()', start), builder = text.indexOf('  @Builder', start);
  const end = builder >= 0 && builder < build ? builder : build;
  const code = text.slice(start, end).replace('export struct', 'class').replace(/@(Prop|State|Watch|StorageLink)(\([^)]*\))?\s*/g, '') + '\n}';
  return new Function(...Object.keys(dependencies), stripTypeScriptTypes(code) + '\nreturn ' + name + ';')(...Object.values(dependencies));
}
const curveHelpers = helpers(curveSource, ['SettingsNumberLogic', 'SettingsOption', 'CurveEditRules', 'CurveGeometryOwners'], motion);
const { UiStyle } = await import('../entry/src/main/ets/presentation/UiStyle.ts');
const curve = { ...curveHelpers, SettingsDraftOwner, UiStyle };
const { InputSettingsEdits: E } = helpers(inputSource, ['InputSettingsEdits'], { ...model, ...motion });
const Panel = controller(inputSource, 'InputSettingsPanel', { ...model, ...motion, ...curve, InputSettingsEdits: E });
const canvas = new Proxy({}, { get(target, key) { return target[key] ?? (() => {}); }, set(target, key, value) { target[key] = value; return true; } });
const Editor = controller(curveSource, 'CurvePointEditor', { ...motion, ...curve, ...preview, KeyboardInputSession,
  CanvasRenderingContext2D: function() { return canvas; }, RenderingContextSettings: function() {} });
const NumberField = controller(curveSource, 'SettingsNumberField', { ...curve, KeyboardInputSession });
const points = rows => rows.map(([x, y]) => new MotionCurvePoint(x, y));
const coordinates = values => values.map(point => [point.x, point.y]);
function configuration(id = CUSTOM) {
  const config = new KeyboardShortcutConfiguration();
  const mapping = new KeyboardShortcutMapping('first', 'Points'); mapping.keys = [2017];
  mapping.actions = [defaultShortcutAction(id)]; config.mappings = [mapping]; return config;
}
function fixture(id = CUSTOM) {
  const panel = new Panel(), edits = [], actions = [];
  panel.configuration = configuration(id); panel.axisNames = ['L0', 'L1', 'R0']; panel.enabledAxisNames = ['L0', 'L1'];
  panel.selectedAxisName = 'L0'; panel.onChange = next => { edits.push(next); panel.configuration = next; };
  panel.onAction = action => actions.push(action); panel.aboutToAppear(); panel.selectTouchAction(id);
  return { panel, edits, actions };
}
function mountedEditor(panel, touch = false) {
  const editor = new Editor(), action = touch ? panel.touchAction : panel.configuration.mappings[0].actions[0];
  const smart = action.id === SMART;
  editor.points = panel.curvePoints(action); editor.minimumX = smart ? 0 : null; editor.maximumX = smart ? 100 : null;
  editor.minimumY = 0; editor.maximumY = smart ? 100 : 1; editor.viewMinimumX = 0; editor.viewMaximumX = smart ? 100 : action.value;
  editor.strictX = smart; editor.maximumPoints = touch ? KeyboardShortcutConfiguration.MAX_POINTS_PER_ACTION : panel.mappingMaximumPoints('first', 0);
  editor.interpolationMode = panel.curveInterpolation(action); editor.isLooping = false;
  editor.onChange = touch ? panel.touchPointsHandler() : panel.mappingPointsHandler('first', 0); editor.aboutToAppear(); editor.pointsChanged();
  return editor;
}

test('all 182 actions stay reachable once in bounded touch categories, including both point setters and manual/gap commands', () => {
  const { panel } = fixture(); const reachable = [];
  for (const category of panel.categories()) {
    const options = panel.actionOptions(false, category.value);
    assert.ok(options.length > 0 && options.length <= 16, category.value + ': ' + options.length);
    reachable.push(...options.map(option => option.value));
  }
  assert.equal(reachable.length, 182); assert.equal(new Set(reachable).size, 182);
  for (const id of [SMART, CUSTOM, 'Script::SkipGap', 'Axis::Value::Set', 'Axis::Value::Offset']) assert.ok(reachable.includes(id));
});

for (const id of [SMART, CUSTOM]) test('mapping and touch start with the model-owned point defaults: ' + id, () => {
  const { panel, edits, actions } = fixture();
  panel.selectAction('first', 0, id); panel.selectTouchAction(id);
  assert.deepEqual(panel.configuration.mappings[0].actions[0], defaultShortcutAction(id));
  assert.deepEqual(panel.touchAction, defaultShortcutAction(id));
  assert.notEqual(panel.touchAction.points, panel.configuration.mappings[0].actions[0].points);
  assert.notEqual(panel.touchAction.points[0], panel.configuration.mappings[0].actions[0].points[0]);
  assert.equal(edits.length, 1); assert.deepEqual(actions, []);
});

test('custom points preserve finite extreme x, negative/outside x, duplicates and original input order in detached snapshots', () => {
  const original = configuration(); original.mappings[0].actions[0].targetAxis = 'R0';
  original.mappings[0].actions[0].value = 25; original.mappings[0].actions[0].text = 'makima';
  const values = points([[Number.MAX_VALUE, 1], [-Number.MAX_VALUE, 0], [3, .2], [-3, .4], [3, .8]]);
  const next = E.actionPoints(original, 'first', 0, values); const action = next.mappings[0].actions[0];
  assert.deepEqual(coordinates(action.points), coordinates(values));
  assert.equal(action.value, 25); assert.equal(action.text, 'makima'); assert.equal(action.targetAxis, 'R0');
  assert.notEqual(action.points, values); assert.notEqual(action.points[0], values[0]); assert.ok(action.points[0] instanceof ShortcutPoint);
  values[0].y = .5; action.points[1].y = .5;
  assert.equal(original.mappings[0].actions[0].points[0].y, .5); assert.equal(action.points[0].y, 1);
  assert.equal(values[1].y, 0); assert.equal(validateShortcutConfiguration(next).valid, true);
});

test('smart limits retain percent coordinates and reject unsorted/duplicate x instead of silently normalizing', () => {
  const original = configuration(SMART), before = cloneShortcutConfiguration(original);
  const values = points([[0, 100], [50, 25], [100, 0]]);
  assert.deepEqual(coordinates(E.actionPoints(original, 'first', 0, values).mappings[0].actions[0].points), coordinates(values));
  for (const invalid of [points([[50, 20], [25, 30]]), points([[50, 20], [50, 30]]), points([[-1, 20]]),
    points([[101, 20]]), points([[20, -1]]), points([[20, 101]])]) {
    assert.equal(E.actionPoints(original, 'first', 0, invalid), null);
  }
  assert.deepEqual(original, before);
});

for (const id of [SMART, CUSTOM]) test('point updates reject malformed coordinates/rows, permit empty arrays and obey 4096/action and 8192/config: ' + id, () => {
  const config = configuration(id);
  for (const values of [null, {}, [null], [undefined], new Array(1), points([[NaN, .5]]), points([[Infinity, .5]]),
    points([[1, NaN]]), points([[1, Infinity]]), [{ x: 1, y: .5, runtime: true }]]) {
    assert.equal(E.actionPoints(config, 'first', 0, values), null);
  }
  for (const index of [-1, .5, 1, NaN]) assert.equal(E.actionPoints(config, 'first', index, []), null);
  assert.equal(E.actionPoints(config, 'missing', 0, []), null);
  assert.equal(E.actionPoints(configuration('App::Stop'), 'first', 0, []), null);
  assert.deepEqual(E.actionPoints(config, 'first', 0, []).mappings[0].actions[0].points, []);
  const maximum = Array.from({ length: 4096 }, (_, index) => new MotionCurvePoint(id === SMART ? index / 41 : index, .5));
  const full = E.actionPoints(config, 'first', 0, maximum); assert.ok(full);
  assert.equal(E.actionPoints(config, 'first', 0, maximum.concat(new MotionCurvePoint(100, .5))), null);
  full.mappings[0].actions.push(cloneShortcutAction(full.mappings[0].actions[0]));
  assert.equal(validateShortcutConfiguration(full).valid, true);
  const emptyAction = defaultShortcutAction(id); emptyAction.points = []; full.mappings[0].actions.push(emptyAction);
  assert.equal(E.actionPoints(full, 'first', 2, points([[.5, .5]])), null);
  const empty = E.actionPoints(full, 'first', 2, []); assert.ok(empty);
  const { panel } = fixture(id); panel.configuration = empty;
  assert.equal(panel.mappingMaximumPoints('first', 2), 0); assert.equal(panel.mappingMaximumPoints('first', 0), 4096);
  panel.configuration.mappings[0].actions[1].points.pop(); assert.equal(panel.mappingMaximumPoints('first', 2), 1);
});

test('custom duration and interpolation are independent controls and retain point order and target', () => {
  const { panel, edits, actions } = fixture();
  panel.actionPoints('first', 0, points([[4, 1], [-1, 0], [4, .3]]));
  panel.actionText('first', 0, 'targetAxis', 'R0');
  panel.touchPoints(points([[4, 1], [-1, 0], [4, .3]])); panel.touchText('targetAxis', 'R0');
  for (const value of [1, 60, 2.5]) {
    assert.equal(panel.actionNumber('first', 0, 'value', value), true); assert.equal(panel.touchNumber('value', value), true);
  }
  for (const mode of ['linear', 'pchip', 'makima', 'step']) {
    assert.equal(panel.actionText('first', 0, 'text', mode), true); assert.equal(panel.touchText('text', mode), true);
    assert.equal(panel.curveInterpolation(panel.touchAction), mode); assert.equal(panel.touchAction.value, 2.5);
    assert.deepEqual(coordinates(panel.touchAction.points), [[4, 1], [-1, 0], [4, .3]]);
  }
  for (const value of [0, 60.01, Infinity, NaN]) assert.equal(panel.touchNumber('value', value), false);
  assert.equal(panel.touchText('text', 'unsupported'), false); assert.equal(panel.actionText('first', 0, 'text', 'unsupported'), false);
  assert.equal(panel.touchAction.targetAxis, 'R0'); assert.equal(panel.textArgumentDescription(panel.touchAction), '');
  assert.deepEqual(panel.textOptions(panel.touchAction).map(option => option.value), ['linear', 'pchip', 'makima', 'step']);
  assert.ok(edits.length > 0); assert.deepEqual(actions, []);
});

for (const id of [SMART, CUSTOM]) test('live curve numeric edits/add/delete update only controlled parameters: ' + id, () => {
  const { panel, edits, actions } = fixture(id); let editor = mountedEditor(panel);
  const x = id === SMART ? 75 : -5, y = id === SMART ? 80 : .8;
  editor.draftX = x; editor.draftY = y; editor.add();
  assert.equal(edits.length, 1); assert.equal(panel.configuration.mappings[0].actions[0].points.length, 2);
  editor = mountedEditor(panel); assert.equal(editor.edit(0, id === SMART ? 25 : 5, y), true);
  assert.equal(edits.length, 2);
  editor = mountedEditor(panel); editor.onChange(curve.CurveEditRules.remove(editor.points, 0));
  assert.equal(edits.length, 3); assert.equal(panel.configuration.mappings[0].actions[0].points.length, 1);
  assert.deepEqual(actions, []);
});

for (const id of [SMART, CUSTOM]) test('live curve preview, dragging and cancel remain inert until one end gesture commit: ' + id, () => {
  const { panel, edits, actions } = fixture(id); const editor = mountedEditor(panel);
  const initial = cloneShortcutConfiguration(panel.configuration), point = editor.points[0];
  for (const mode of ['linear', 'pchip', 'makima', 'step']) { editor.interpolationMode = mode; editor.pointsChanged(); }
  editor.beginPoint(editor.px(point.x), editor.py(point.y));
  const x = id === SMART ? 25 : .25, y = id === SMART ? 75 : .75;
  editor.movePoint(editor.px(x), editor.py(y)); assert.equal(edits.length, 0); assert.deepEqual(panel.configuration, initial);
  editor.cancelPoint(); editor.endPoint(); assert.equal(edits.length, 0);
  editor.beginPoint(editor.px(point.x), editor.py(point.y)); editor.movePoint(editor.px(x), editor.py(y));
  editor.endPoint(); editor.endPoint(); assert.equal(edits.length, 1); assert.deepEqual(actions, []);
  assert.deepEqual(coordinates(panel.configuration.mappings[0].actions[0].points), [[x, y]]);
});

for (const transition of ['replace configuration', 'mapping reorder', 'action reorder', 'remove action', 'switch action', 'change target',
  'change duration', 'change interpolation', 'change points', 'read-only roundtrip', 'axis replacement', 'unmount']) {
  test('old mapping curve callbacks cannot retarget after ' + transition, () => {
    const { panel, actions } = fixture(); const late = panel.mappingPointsHandler('first', 0);
    if (transition === 'replace configuration') panel.configuration = cloneShortcutConfiguration(panel.configuration);
    if (transition === 'mapping reorder') { panel.addMapping(); panel.moveMapping('first', 1); }
    if (transition === 'action reorder') { panel.addAction('first', CUSTOM); panel.moveAction('first', 0, 1); }
    if (transition === 'remove action') panel.removeAction('first', 0);
    if (transition === 'switch action') panel.selectAction('first', 0, SMART);
    if (transition === 'change target') panel.actionText('first', 0, 'targetAxis', 'L1');
    if (transition === 'change duration') panel.actionNumber('first', 0, 'value', 5);
    if (transition === 'change interpolation') panel.actionText('first', 0, 'text', 'step');
    if (transition === 'change points') panel.actionPoints('first', 0, []);
    if (transition === 'read-only roundtrip') { panel.readOnly = true; panel.availabilityChanged(); panel.readOnly = false; panel.availabilityChanged(); }
    if (transition === 'axis replacement') { panel.axisNames = ['L0']; panel.axisContextChanged(); }
    if (transition === 'unmount') { panel.aboutToDisappear(); panel.aboutToAppear(); }
    const snapshot = cloneShortcutConfiguration(panel.configuration); late(points([[.2, .2]]));
    assert.deepEqual(panel.configuration, snapshot); assert.deepEqual(actions, []);
  });
}

for (const transition of ['type', 'category', 'target', 'duration', 'interpolation', 'points', 'configuration', 'axis context', 'read-only', 'remount']) {
  test('old touch points and execute callbacks reject ' + transition, () => {
    const { panel, actions, edits } = fixture(), late = panel.touchPointsHandler(), execute = panel.touchActionHandler();
    if (transition === 'type') panel.selectTouchAction(SMART);
    if (transition === 'category') panel.touchChoiceHandler('category')('app');
    if (transition === 'target') panel.touchText('targetAxis', 'L1');
    if (transition === 'duration') panel.touchNumber('value', 10);
    if (transition === 'interpolation') panel.touchText('text', 'step');
    if (transition === 'points') panel.touchPoints([]);
    if (transition === 'configuration') panel.configuration = cloneShortcutConfiguration(panel.configuration);
    if (transition === 'axis context') { panel.enabledAxisNames = []; panel.axisContextChanged(); }
    if (transition === 'read-only') { panel.readOnly = true; panel.availabilityChanged(); panel.readOnly = false; panel.availabilityChanged(); }
    if (transition === 'remount') { panel.aboutToDisappear(); panel.aboutToAppear(); }
    const snapshot = cloneShortcutAction(panel.touchAction); late(points([[.2, .2]])); execute();
    assert.deepEqual(panel.touchAction, snapshot); assert.deepEqual(actions, []); assert.deepEqual(edits, []);
  });
}

for (const id of [SMART, CUSTOM]) test('readonly blocks direct point edits and retained live-editor commits: ' + id, () => {
  const { panel, actions, edits } = fixture(id), mapping = mountedEditor(panel), touch = mountedEditor(panel, true);
  const snapshot = cloneShortcutConfiguration(panel.configuration), draft = cloneShortcutAction(panel.touchAction);
  panel.readOnly = true; panel.availabilityChanged();
  assert.equal(panel.actionPoints('first', 0, []), false); assert.equal(panel.touchPoints([]), false);
  mapping.edit(0, .2, .2); touch.edit(0, .2, .2);
  mapping.draftX = 20; mapping.draftY = .2; mapping.add();
  assert.deepEqual(panel.configuration, snapshot); assert.deepEqual(panel.touchAction, draft);
  assert.deepEqual(edits, []); assert.deepEqual(actions, []);
});

test('touch point edit invalidates previous execute; explicit new execute receives a deep-isolated payload exactly once', () => {
  const { panel, actions, edits } = fixture(), execute = panel.touchActionHandler();
  const input = points([[2, .7], [-2, .3], [2, .9]]); panel.touchPointsHandler()(input);
  input[0].y = 0; execute(); assert.deepEqual(actions, []);
  panel.touchActionHandler()(); assert.equal(actions.length, 1); assert.deepEqual(edits, []);
  assert.deepEqual(coordinates(actions[0].points), [[2, .7], [-2, .3], [2, .9]]);
  assert.notEqual(actions[0].points, panel.touchAction.points); assert.notEqual(actions[0].points[0], panel.touchAction.points[0]);
  actions[0].points[0].y = 0; assert.equal(panel.touchAction.points[0].y, .7);
});

test('point numeric fields keep focus inhibition and reject stale blur/submit after editor remount', () => {
  const { panel, actions, edits } = fixture(), editor = mountedEditor(panel), field = new NumberField(), focus = [];
  const owner = KeyboardInputSession.setListener(value => focus.push(value), () => false);
  field.value = .5; field.onCommit = value => editor.edit(0, value, .5); field.aboutToAppear();
  const id = field.keyboardEditorId, blur = KeyboardInputSession.blurHandler(id, () => field.commit());
  const submit = KeyboardInputSession.submitHandler(id, () => field.commit());
  KeyboardInputSession.focusHandler(id, true)(); assert.equal(KeyboardInputSession.isEditing(), true);
  field.draft = '-2'; submit(); assert.equal(edits.length, 1); assert.deepEqual(actions, []);
  panel.selectAction('first', 0, SMART); const snapshot = cloneShortcutConfiguration(panel.configuration);
  field.aboutToDisappear(); field.draft = '20'; blur(); submit();
  assert.deepEqual(panel.configuration, snapshot); assert.equal(KeyboardInputSession.isEditing(), false);
  assert.deepEqual(focus, [false, true, false]); KeyboardInputSession.releaseListener(owner);
});

test('gap and manual controls explain actual runtime scope without claiming the selected axis scopes the gap search', () => {
  const { panel } = fixture();
  assert.match(panel.executionNote(defaultShortcutAction('Script::SkipGap')), /OHOS 先验证所选轴可用.*原算法随后忽略选择.*全部已绑定脚本轴.*不会限定/);
  for (const id of ['Axis::Value::Set', 'Axis::Value::Offset']) {
    assert.match(panel.executionNote(defaultShortcutAction(id)), /不会启动运行或 Arm.*原版优先级及旁路.*手动启动/);
  }
  assert.equal(panel.executionNote(defaultShortcutAction('Media::PlayPause::Toggle')), '');
});

test('actual ArkUI uses the shared bounded editor, independent interpolation, readonly barriers and 52vp controls with no added root scrolling', () => {
  assert.match(inputSource, /CurvePointEditor\(\{ points: this.curvePoints\(action\), compact: this.compact/);
  assert.match(inputSource, /strictX: this.spec\(action.id\).pointsKind === 'smartLimit'/);
  assert.match(inputSource, /minimumX: this.spec\(action.id\).pointsKind === 'smartLimit' \? 0 : null/);
  assert.match(inputSource, /maximumX: this.spec\(action.id\).pointsKind === 'smartLimit' \? 100 : null/);
  assert.match(inputSource, /interpolationMode: this.curveInterpolation\(action\), isLooping: false/);
  assert.match(inputSource, /this.pointEditor\(action, this.mappingMaximumPoints\(mapping.id, index\), this.mappingPointsHandler\(mapping.id, index\),\s*'mapping:' \+ mapping.id \+ ':action:' \+ index \+ ':' \+ action.id \+ ':points', this.mappingDraftSource\(mapping\), this.draftScope \+ ':mappings'\)/);
  assert.match(inputSource, /this.pointEditor\(this.touchAction, KeyboardShortcutConfiguration.MAX_POINTS_PER_ACTION, this.touchPointsHandler\(\),\s*'touch:' \+ this.touchActionId \+ ':points', this.touchDraftSource\(\), this.draftScope \+ ':touch'\)/);
  assert.equal((inputSource.match(/label: 'Interpolation type · 插值'/g) ?? []).length, 2);
  assert.match(inputSource, /onSelect: this.bindEditChoice\(\(value: string\) => \{ this.actionText\(mapping.id, index, 'text', value\)/);
  assert.match(inputSource, /options: this.textOptions\(this.touchAction\), editable: !this.readOnly, onSelect: this.touchChoiceHandler\('text'\)/);
  assert.match(inputSource, /OHOS 可移植边界.*严格递增.*原版允许的乱序和重复/);
  assert.match(inputSource, /横坐标可为任意有限秒数.*保留输入顺序和重复点/);
  assert.match(inputSource, /\.width\('100%'\)\.enabled\(!this.readOnly\)/);
  assert.doesNotMatch(inputSource, /\b(?:Scroll|List)\s*\(|\.width\(\d+\)|\.height\((?:[0-3]\d|4[0-7])\)/);
  assert.match(curveSource, /List\(\{ space: 4 \}\)/);
  assert.match(curveSource, /height\(this.compact \? 300 : 360\)/);
  assert.match(curveSource, /nestedScroll\(\{ scrollForward: NestedScrollMode.SELF_FIRST, scrollBackward: NestedScrollMode.SELF_FIRST \}\)/);
  assert.doesNotMatch(inputSource, /@kit\.|AVPlayer|fileIo|NativeSettingsStore|setInterval\(|setTimeout\(|Output::Connect|Output::Arm/);
  assert.match(inputSource, /Button\('执行触控动作 · '[\s\S]*?\.onClick\(this.touchActionHandler\(\)\)/);
});
