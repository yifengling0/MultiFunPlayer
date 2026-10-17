import { SettingsDraftOwner } from '../entry/src/main/ets/presentation/SettingsDraftOwner.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
registerHooks({ resolve(specifier, context, next) { return next(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? specifier + '.ts' : specifier, context); } });
const device = await import('../entry/src/main/ets/core/DeviceProfile.ts');
const axis = await import('../entry/src/main/ets/core/AxisConfiguration.ts');
const motion = await import('../entry/src/main/ets/core/MotionConfiguration.ts');
const preview = await import('../entry/src/main/ets/core/CurvePreview.ts');
const { KeyboardInputSession } = await import('../entry/src/main/ets/app/KeyboardInputSession.ts');
const { DeviceProfiles, DeviceAxisDefinition } = device;
const { AxisConfiguration, SyncConfiguration } = axis;
const { MotionConfigurations, MotionProviderConfiguration, MotionCurvePoint } = motion;
const source = name => readFileSync(new URL('../entry/src/main/ets/components/' + name + '.ets', import.meta.url), 'utf8');
function helpers(name, exports, dependencies = {}) {
  const input = source(name).split('@Component')[0].replace(/^import .*;\n/gm, '').replace(/export class /g, 'class ');
  return new Function(...Object.keys(dependencies), stripTypeScriptTypes(input) + '\nreturn {' + exports.join(',') + '};')(...Object.values(dependencies));
}
const { UiStyle } = await import('../entry/src/main/ets/presentation/UiStyle.ts');
const curve = helpers('CurvePointEditor', ['SettingsNumberLogic', 'SettingsOption', 'CurveEditRules', 'CurveGeometryOwners'], motion);
const { SettingsNumberLogic, CurveEditRules } = curve;
const { AxisSettingsEdits } = helpers('AxisSettingsPanel', ['AxisSettingsEdits'], { ...device, ...axis, ...motion });
const { SyncSettingsEdits } = helpers('SyncSettingsPanel', ['SyncSettingsEdits'], axis);
const { DeviceSettingsEdits } = helpers('DeviceSettingsPanel', ['DeviceSettingsEdits'], device);
const { MotionSettingsEdits, ManagedMotionScriptResource } = helpers('MotionSettingsPanel', ['MotionSettingsEdits', 'ManagedMotionScriptResource'], motion);
const profile = DeviceProfiles.getBuiltIn();
const initialAxis = () => new AxisConfiguration(profile.axes[0], profile.axes.map(axis => axis.name));
const custom = () => DeviceProfiles.clone(profile, 'custom-1', 'Custom');

test('numeric input handles decimal/scientific/infinite values without NaN or null persistence', () => {
  for (const input of ['', ' ', '-', '.', 'NaN', 'null', '0x20', '1px', '1e9999', '-Infinity']) {
    assert.equal(SettingsNumberLogic.parse(input), null, input);
  }
  assert.equal(SettingsNumberLogic.parse(' -0.125e2 '), -12.5);
  assert.equal(SettingsNumberLogic.parse('.25'), .25);
  assert.equal(SettingsNumberLogic.parse('∞'), null);
  for (const input of ['∞', 'Infinity', '无限制']) assert.equal(SettingsNumberLogic.parse(input, true), Infinity);
  assert.equal(SettingsNumberLogic.format(Infinity), '无限制');
  assert.equal(SettingsNumberLogic.valid(Infinity, 0, null, true), true);
  assert.equal(SettingsNumberLogic.valid(Infinity, 0, null, false), false);
  assert.equal(SettingsNumberLogic.valid(1.5, 1, 10, false, true), false);
});

test('all 29 axis fields have real, copy-on-edit bindings and preserve untouched fields', () => {
  const initial = initialAxis();
  const flagFields = Object.keys(initial).filter(field => typeof initial[field] === 'boolean');
  const numberFields = AxisConfiguration.numberRanges().map(range => range.field).filter(field => !field.includes('.'));
  const choices = { linkAxis: 'R0', smartLimitInputAxis: 'R1', smartLimitMode: 'speed', interpolationType: 'makima',
    updateMotionProviderWithAxis: 'R2', selectedMotionProvider: 'Pattern' };
  const handled = [...flagFields, ...numberFields, ...Object.keys(choices), 'smartLimitPoints'];
  assert.equal(handled.length, 29);
  assert.deepEqual(handled.sort(), Object.keys(initial).sort());
  const ui = source('AxisSettingsPanel');
  for (const field of flagFields) {
    assert.ok(ui.includes(`this.switchField('${field}'`), field);
    const edited = AxisSettingsEdits.flag(initial, field, !initial[field]);
    assert.equal(edited[field], !initial[field]);
    assert.deepEqual(Object.keys(edited), Object.keys(initial));
    for (const other of Object.keys(initial).filter(candidate => candidate !== field)) assert.deepEqual(edited[other], initial[other]);
    assert.notEqual(edited, initial); assert.notEqual(edited.smartLimitPoints, initial.smartLimitPoints);
  }
  for (const field of numberFields) {
    assert.ok(ui.includes(`this.numberField('${field}'`), field);
    assert.ok(AxisSettingsEdits.number(initial, field, initial[field]));
    assert.equal(AxisSettingsEdits.number(initial, field, NaN), null);
  }
  for (const [field, value] of Object.entries(choices)) {
    const edited = AxisSettingsEdits.choice(initial, field, value);
    assert.equal(edited[field], value); assert.notEqual(edited, initial);
    assert.ok(ui.includes(`'${field}'`));
  }
  assert.equal(AxisSettingsEdits.choice(initial, 'interpolationType', 'unknown'), null);
  assert.equal(AxisSettingsEdits.choice(initial, 'selectedMotionProvider', 'unknown'), null);
  assert.equal(AxisSettingsEdits.choice(initial, 'smartLimitMode', 'bogus'), null);
  assert.equal(AxisSettingsEdits.number(initial, 'playing', 1), null);
  assert.equal(AxisSettingsEdits.flag(initial, 'armed', true), null);
});

test('axis bounds are shared and zero seconds means unlimited, not zero speed', () => {
  const initial = initialAxis();
  for (const range of AxisConfiguration.numberRanges().filter(range => !range.field.includes('.'))) {
    if (range.minimum !== null) assert.equal(AxisSettingsEdits.number(initial, range.field, range.minimum - .01), null, range.field);
    if (range.maximum !== null) assert.equal(AxisSettingsEdits.number(initial, range.field, range.maximum + .01), null, range.field);
  }
  const unlimited = AxisSettingsEdits.speedFromSeconds(initial, 0);
  assert.equal(unlimited.speedLimitUnitsPerSecond, Infinity);
  assert.equal(AxisConfiguration.toJson(unlimited).speedLimitUnitsPerSecond, 'Infinity');
  assert.equal(JSON.parse(JSON.stringify(unlimited)).speedLimitUnitsPerSecond, 'Infinity');
  assert.equal(AxisSettingsEdits.speedFromSeconds(initial, 2).speedLimitUnitsPerSecond, .5);
  assert.equal(AxisSettingsEdits.speedFromSeconds(initial, -1), null);
  assert.equal(AxisSettingsEdits.speedFromSeconds(initial, NaN), null);
  assert.equal(AxisSettingsEdits.number(initial, 'speedLimitUnitsPerSecond', 0).speedLimitUnitsPerSecond, 0);
  assert.equal(initial.speedLimitUnitsPerSecond, 10);
});

test('sync editor covers duration and seven switches using model validation', () => {
  const initial = new SyncConfiguration(); const ui = source('SyncSettingsPanel');
  assert.equal(Object.keys(initial).length, 8);
  for (const field of Object.keys(initial).filter(field => field !== 'durationSeconds')) {
    assert.ok(ui.includes(`this.changeFlag('${field}'`), field);
    const next = SyncSettingsEdits.flag(initial, field, false);
    assert.equal(next[field], false); assert.equal(initial[field], true); assert.notEqual(next, initial);
  }
  const range = SyncConfiguration.numberRanges()[0];
  assert.equal(SyncSettingsEdits.duration(initial, range.minimum).durationSeconds, range.minimum);
  assert.equal(SyncSettingsEdits.duration(initial, range.maximum).durationSeconds, range.maximum);
  for (const number of [range.minimum - .001, range.maximum + .001, NaN, Infinity]) assert.equal(SyncSettingsEdits.duration(initial, number), null);
});

test('built-in devices allow only enabled switches; custom clone fields and axes are editable', () => {
  const original = DeviceProfiles.getBuiltIn();
  assert.deepEqual(DeviceProfiles.builtInProfiles().map(profile => profile.id), ['TCode-0.2', 'TCode-0.3']);
  assert.equal(DeviceSettingsEdits.precision(original, 6), null);
  assert.equal(DeviceSettingsEdits.rename(original, 'Renamed'), null);
  assert.equal(DeviceSettingsEdits.axisText(original, 0, 'name', 'X0'), null);
  assert.equal(DeviceSettingsEdits.axisDefault(original, 0, .9), null);
  assert.equal(DeviceSettingsEdits.addAxis(original, 'X0'), null);
  assert.equal(DeviceSettingsEdits.removeAxis(original, 0), null);
  const disabled = DeviceSettingsEdits.axisFlag(original, 0, false);
  assert.equal(disabled.axes[0].enabled, false); assert.equal(original.axes[0].enabled, true);
  assert.equal(disabled.axes.length, original.axes.length); assert.deepEqual(disabled.axes[1], original.axes[1]);
  const c = custom();
  assert.equal(DeviceSettingsEdits.precision(c, DeviceProfiles.MAX_OUTPUT_PRECISION).outputPrecision, DeviceProfiles.MAX_OUTPUT_PRECISION);
  assert.equal(DeviceSettingsEdits.precision(c, 1.5), null);
  assert.equal(DeviceSettingsEdits.precision(c, 11), null);
  assert.equal(DeviceSettingsEdits.rename(c, ' Renamed ').name, 'Renamed');
  assert.equal(DeviceSettingsEdits.axisText(c, 0, 'name', 'Z9').axes[0].name, 'Z9');
  assert.equal(DeviceSettingsEdits.axisText(c, 0, 'name', 'l0'), null);
  assert.equal(DeviceSettingsEdits.axisText(c, 0, 'name', 'L1'), null);
  assert.equal(DeviceSettingsEdits.axisText(c, 0, 'friendlyName', '').axes[0].friendlyName, null);
  assert.equal(DeviceSettingsEdits.axisDefault(c, 0, .2).axes[0].defaultValue, .2);
  assert.equal(DeviceSettingsEdits.axisDefault(c, 0, 1.1), null);
  const added = DeviceSettingsEdits.addAxis(c, 'Z9');
  assert.deepEqual(added.axes.at(-1), new DeviceAxisDefinition('Z9'));
  assert.equal(DeviceSettingsEdits.addAxis(c, 'L0'), null);
  assert.equal(DeviceSettingsEdits.removeAxis(added, added.axes.length - 1).axes.length, c.axes.length);
  assert.equal(c.axes.length, original.axes.length);
});

test('device alias editing matches upstream final dotted segments and case-insensitive distinct', () => {
  const result = DeviceSettingsEdits.axisText(custom(), 0, 'funscriptNames', '*.stroke, stroke, STROKE, film.twist, , . , *, L0');
  assert.deepEqual(result.axes[0].funscriptNames, ['stroke', 'twist', '*', 'L0']);
  assert.deepEqual(DeviceSettingsEdits.aliases(''), []);
});

test('motion shared scalars and every provider-specific parameter edit through shared validation', () => {
  for (const id of MotionConfigurations.ids()) {
    const initial = new MotionProviderConfiguration(id);
    for (const [field, value] of Object.entries({ speed: 2, minimum: .9, maximum: .1 })) {
      const next = MotionSettingsEdits.number(initial, field, value);
      assert.equal(next[field], value); assert.notEqual(next, initial);
    }
    assert.equal(MotionSettingsEdits.number(initial, 'speed', 0), null);
    assert.equal(MotionSettingsEdits.number(initial, 'minimum', -1), null);
    assert.equal(MotionSettingsEdits.number(initial, 'maximum', 2), null);
    assert.equal(MotionSettingsEdits.number(initial, 'speed', Infinity), null);
    assert.equal(MotionSettingsEdits.number(initial, 'runtime', 1), null);
  }
  const random = new MotionProviderConfiguration('Random');
  for (const [field, value] of Object.entries({ octaves: 4, persistence: .4, lacunarity: 1.2 })) assert.equal(MotionSettingsEdits.number(random, field, value)[field], value);
  assert.equal(MotionSettingsEdits.number(random, 'octaves', 1.5), null);
  assert.equal(MotionSettingsEdits.number(random, 'octaves', 9).octaves, 9); // Source action range, no invented UI storage cap.
  assert.equal(MotionSettingsEdits.number(random, 'lacunarity', 2.1), null);
  assert.equal(MotionSettingsEdits.number(random, 'persistence', 0), null);
  const pattern = new MotionProviderConfiguration('Pattern');
  for (const name of ['triangle', 'sine', 'doubleBounce', 'sharpBounce', 'saw', 'square']) assert.equal(MotionSettingsEdits.choice(pattern, 'pattern', name).pattern, name);
  assert.equal(MotionSettingsEdits.choice(pattern, 'pattern', 'unknown'), null);
  assert.equal(MotionSettingsEdits.number(pattern, 'octaves', 2), null);
  const custom = new MotionProviderConfiguration('Custom Curve');
  assert.equal(MotionSettingsEdits.number(custom, 'durationSeconds', 0), null);
  assert.equal(MotionSettingsEdits.number(custom, 'durationSeconds', 70).durationSeconds, 70);
  assert.equal(MotionSettingsEdits.flag(custom, 'isLooping', false).isLooping, false);
  assert.equal(MotionSettingsEdits.flag(custom, 'syncOnEnd', false).syncOnEnd, false);
  for (const mode of ['linear', 'pchip', 'makima', 'step']) assert.equal(MotionSettingsEdits.choice(custom, 'interpolationMode', mode).interpolationMode, mode);
  const points = [new MotionCurvePoint(2, .4), new MotionCurvePoint(-1, .5), new MotionCurvePoint(2, .2)];
  const edited = MotionSettingsEdits.curve(custom, points); assert.deepEqual(edited.points, points); assert.notEqual(edited.points, points);
  assert.equal(MotionSettingsEdits.curve(custom, [new MotionCurvePoint(1, NaN)]), null);
});

test('looping script selection is limited to supplied managed resources; stale references survive scalar edits', () => {
  const initial = new MotionProviderConfiguration('Looping Script');
  const resources = [new ManagedMotionScriptResource('file://managed/example.funscript', 'example.funscript')];
  assert.equal(MotionSettingsEdits.resource(initial, '/not-managed.funscript', resources), null);
  assert.equal(MotionSettingsEdits.resource(initial, 'https://remote.example/file', resources), null);
  assert.equal(MotionSettingsEdits.resource(initial, resources[0].uri, resources).sourceUri, resources[0].uri);
  initial.sourceUri = 'file://managed/missing.funscript';
  assert.equal(MotionSettingsEdits.number(initial, 'speed', 2).sourceUri, initial.sourceUri);
  assert.equal(MotionSettingsEdits.resource(initial, '', resources).sourceUri, null);
  assert.equal(MotionSettingsEdits.resource(initial, 'file://managed/query?token=x', [new ManagedMotionScriptResource('file://managed/query?token=x', 'bad')]), null);
  assert.equal(MotionSettingsEdits.choice(initial, 'interpolationMode', 'step').interpolationMode, 'step');
});

test('Smart curve strictly orders edits while Custom preserves user order and duplicate times', () => {
  const points = [new MotionCurvePoint(25, 100), new MotionCurvePoint(90, 0)];
  const added = CurveEditRules.add(points, 50, 50, 0, 100, 0, 100, true, 4096);
  assert.deepEqual(added.map(point => point.x), [25, 50, 90]); assert.equal(points.length, 2);
  assert.equal(CurveEditRules.add(points, 25, 50, 0, 100, 0, 100, true, 4096), null);
  assert.equal(CurveEditRules.replace(points, 0, 95, 50, 0, 100, 0, 100, true), null);
  assert.equal(CurveEditRules.replace(points, 0, NaN, 50, 0, 100, 0, 100, true), null);
  assert.equal(CurveEditRules.replace(points, 0, 30, 101, 0, 100, 0, 100, true), null);
  assert.equal(CurveEditRules.add(points, 30, 50, 0, 100, 0, 100, true, 2), null);
  const custom = [new MotionCurvePoint(3, 1), new MotionCurvePoint(1, 0)];
  const duplicates = CurveEditRules.add(custom, 1, .5, null, null, 0, 1, false, 4096);
  assert.deepEqual(duplicates.map(point => point.x), [3, 1, 1]);
  assert.equal(CurveEditRules.replace(custom, 0, -1, .5, null, null, 0, 1, false)[0].x, -1);
  const removed = CurveEditRules.remove(points, 0); assert.equal(removed.length, 1); assert.notEqual(removed[0], points[1]);
  const initial = initialAxis(); assert.equal(AxisSettingsEdits.curve(initial, added).smartLimitPoints.length, 3);
  assert.equal(AxisSettingsEdits.curve(initial, [new MotionCurvePoint(90, 1), new MotionCurvePoint(25, 1)]), null);
});

function formClass(file, className, dependencies = {}) {
  dependencies = { SettingsDraftOwner, KeyboardInputSession, UiStyle, ...dependencies };
  const text = source(file); const start = text.indexOf('export struct ' + className);
  let end = text.indexOf('  build()', start); const builder = text.indexOf('  @Builder', start);
  if (builder >= 0 && builder < end) end = builder;
  const input = text.slice(start, end).replace('export struct', 'class').replace(/@(Prop|State|Watch|StorageLink)(\([^)]*\))?\s*/g, '') + '\n}';
  return new Function(...Object.keys(dependencies), stripTypeScriptTypes(input) + '\nreturn ' + className + ';')(...Object.values(dependencies));
}

test('numeric/text form commits explicitly, blocks invalid input and ignores unchanged/disabled fields', () => {
  const NumberField = formClass('CurvePointEditor', 'SettingsNumberField', curve);
  const form = new NumberField(); const changes = []; form.value = 2; form.minimum = 0; form.onCommit = value => { changes.push(value); return true; };
  form.aboutToAppear(); assert.equal(form.draft, '2'); form.commit(); assert.deepEqual(changes, []);
  form.draft = '3.5'; form.commit(); assert.deepEqual(changes, [3.5]); assert.equal(form.error, false);
  form.draft = '-'; form.commit(); assert.equal(form.error, true); assert.deepEqual(changes, [3.5]);
  form.draft = '-1'; form.commit(); assert.equal(form.error, true);
  form.editable = false; form.draft = '8'; form.commit(); assert.deepEqual(changes, [3.5]);
  form.editable = true; form.value = 7; form.refreshValue(); assert.equal(form.draft, '7'); assert.equal(form.error, false);
  const TextField = formClass('CurvePointEditor', 'SettingsTextField', curve);
  const text = new TextField(); text.value = 'L0'; text.aboutToAppear(); const labels = []; text.onCommit = value => { labels.push(value); return value.length > 0; };
  text.commit(); assert.deepEqual(labels, []); text.draft = ''; text.commit(); assert.equal(text.error, true);
  text.editable = false; text.draft = 'L1'; text.commit(); assert.deepEqual(labels, ['']);
});

test('read-only/recovery state prevents every panel callback; scrolling remains outside disabled form', () => {
  for (const [file, className, dependencies] of [
    ['AxisSettingsPanel', 'AxisSettingsPanel', { ...device, ...axis, ...motion, ...curve, AxisSettingsEdits }],
    ['MotionSettingsPanel', 'MotionSettingsPanel', { ...motion, ...curve, MotionSettingsEdits }],
    ['SyncSettingsPanel', 'SyncSettingsPanel', { ...axis, SyncSettingsEdits }],
    ['DeviceSettingsPanel', 'DeviceSettingsPanel', { ...device, ...curve, DeviceSettingsEdits }]
  ]) {
    const Panel = formClass(file, className, dependencies); const panel = new Panel(); panel.readOnly = true;
    const changes = []; panel.onChange = value => changes.push(value); panel.onChangeProfile = value => changes.push(value);
    panel.onCloneProfile = (...values) => changes.push(values); panel.onRemoveProfile = value => changes.push(value);
    if (file === 'AxisSettingsPanel') assert.equal(panel.emit(initialAxis()), false);
    if (file === 'MotionSettingsPanel') assert.equal(panel.emit(new MotionProviderConfiguration('Random')), false);
    if (file === 'SyncSettingsPanel') { assert.equal(panel.changeDuration(4), false); panel.changeFlag('syncOnSeek', false); }
    if (file === 'DeviceSettingsPanel') { assert.equal(panel.emit(custom()), false); panel.cloneName = 'Copy'; panel.cloneProfile(); panel.removeProfile(); }
    assert.deepEqual(changes, [], file);
    assert.doesNotMatch(source(file), /Scroll\(\)/); assert.match(source(file), /enabled\(!this\.readOnly\)/);
    assert.doesNotMatch(source(file), /height\('100%'\)/, 'panel must size to content within workspace scroll');
    assert.ok(!source(file).includes('Scroll().enabled'), file);
  }
});

test('all settings components remain free of IO, timers, media pause and direct persistence', () => {
  for (const file of ['CurvePointEditor', 'DeviceSettingsPanel', 'AxisSettingsPanel', 'SyncSettingsPanel', 'MotionSettingsPanel']) {
    const text = source(file);
    assert.doesNotMatch(text, /@kit\.|AVPlayer|\.pause\(|setInterval\(|setTimeout\(|fileIo|NativeSettingsStore|\.save\(/, file);
  }
  assert.match(source('DeviceSettingsPanel'), /保存后下次启动生效/);
  assert.match(source('DeviceSettingsPanel'), /当前生效设备/);
  assert.match(source('CurvePointEditor'), /minHeight: UiStyle\.control/);
  assert.match(source('CurvePointEditor'), /List\(/);
  assert.match(source('CurvePointEditor'), /PanGesture\(/);
  assert.match(source('CurvePointEditor'), /onActionCancel\(/);
  assert.match(source('MotionSettingsPanel'), /scriptResources/);
});


test('Canvas drags commit once, constrain Smart point order, cancel safely and reject stale gestures', () => {
  const canvas = new Proxy({}, { get(target, key) { return target[key] ?? (() => {}); }, set(target, key, value) { target[key] = value; return true; } });
  const Editor = formClass('CurvePointEditor', 'CurvePointEditor', { ...motion, ...curve, ...preview,
    CanvasRenderingContext2D: function() { return canvas; }, RenderingContextSettings: function() {} });
  const editor = new Editor(); editor.points = [new MotionCurvePoint(25, 100), new MotionCurvePoint(90, 0)];
  editor.minimumX = 0; editor.maximumX = 100; editor.minimumY = 0; editor.maximumY = 100;
  editor.viewMinimumX = 0; editor.viewMaximumX = 100; editor.strictX = true;
  const changes = []; editor.onChange = points => changes.push(points); editor.aboutToAppear(); editor.pointsChanged();
  editor.beginPoint(editor.px(25), editor.py(100)); editor.endPoint(); assert.equal(changes.length, 0);
  editor.beginPoint(editor.px(25), editor.py(100)); editor.movePoint(editor.px(120), editor.py(50));
  assert.equal(changes.length, 0); assert.equal(editor.points[0].x, 25);
  editor.endPoint(); assert.equal(changes.length, 1);
  assert.ok(changes[0][0].x < 90 && changes[0][0].x >= 0); assert.equal(changes[0][0].y, 50);
  assert.equal(editor.points[0].x, 25); editor.endPoint(); assert.equal(changes.length, 1);
  editor.beginPoint(editor.px(25), editor.py(100)); editor.movePoint(editor.px(50), editor.py(40));
  editor.cancelPoint(); editor.endPoint(); assert.equal(changes.length, 1); assert.equal(editor.workingPoints[0].x, 25);
  editor.beginPoint(editor.px(25), editor.py(100)); editor.movePoint(editor.px(50), editor.py(40));
  editor.points = []; editor.pointsChanged(); editor.endPoint(); assert.equal(changes.length, 1); assert.equal(editor.selected, -1);
  editor.panStart({ fingerList: [], offsetX: 0, offsetY: 0 }); editor.pan({ fingerList: [] });
  editor.points = [new MotionCurvePoint(25, 100), new MotionCurvePoint(90, 0)]; editor.pointsChanged();
  editor.panStart({ fingerList: [{ localX: editor.px(25) + 2, localY: editor.py(100) + 3 }], offsetX: 2, offsetY: 3 });
  editor.pan({ fingerList: [{ localX: editor.px(50), localY: editor.py(50) }] }); editor.endPoint();
  assert.equal(changes.length, 2); assert.equal(changes[1][0].x, 50); assert.equal(changes[1][0].y, 50);
});

test('bounded curve point list forwards edge scrolling to workspace', () => {
  assert.match(source('CurvePointEditor'), /nestedScroll\(\{ scrollForward: NestedScrollMode\.SELF_FIRST, scrollBackward: NestedScrollMode\.SELF_FIRST \}\)/);
});


test('Custom Curve Reset invokes only the supplied session command, without parameter or clock mutation', () => {
  const Panel = formClass('MotionSettingsPanel', 'MotionSettingsPanel', { ...motion, ...curve, MotionSettingsEdits });
  const panel = new Panel(); let resets = 0; let edits = 0;
  panel.configuration = new MotionProviderConfiguration('Custom Curve');
  const before = JSON.stringify(panel.configuration); panel.onReset = () => resets++; panel.onChange = () => edits++;
  panel.resetCurve(); assert.equal(resets, 1); assert.equal(edits, 0); assert.equal(JSON.stringify(panel.configuration), before);
  panel.readOnly = true; panel.resetCurve(); assert.equal(resets, 1);
  panel.readOnly = false; panel.configuration = new MotionProviderConfiguration('Pattern'); panel.resetCurve(); assert.equal(resets, 1);
  panel.configuration = new MotionProviderConfiguration('Custom Curve'); panel.onReset = undefined; panel.resetCurve(); assert.equal(resets, 1);
  assert.match(source('MotionSettingsPanel'), /if \(this\.onReset !== undefined\)/);
  assert.match(source('MotionSettingsPanel'), /interpolationMode: this\.configuration\.interpolationMode/);
  assert.match(source('MotionSettingsPanel'), /isLooping: this\.configuration\.isLooping/);
});

test('empty Canvas pans reject recognition, retaining outer scrolling; only control-point hits capture', () => {
  const canvas = new Proxy({}, { get(target, key) { return target[key] ?? (() => {}); }, set(target, key, value) { target[key] = value; return true; } });
  const GestureJudgeResult = { CONTINUE: 0, REJECT: 1 }, GestureControl = { GestureType: { PAN_GESTURE: 2, TAP_GESTURE: 0 } };
  const Editor = formClass('CurvePointEditor', 'CurvePointEditor', { ...motion, ...curve, ...preview, GestureJudgeResult, GestureControl,
    CanvasRenderingContext2D: function() { return canvas; }, RenderingContextSettings: function() {} });
  const editor = new Editor(); editor.points = [new MotionCurvePoint(5, .5)]; editor.pointsChanged();
  const pan = { type: 2 };
  assert.equal(editor.judgeGesture(pan, { fingerList: [], offsetX: 0, offsetY: 0 }), 1);
  assert.equal(editor.judgeGesture(pan, { fingerList: [{ localX: 15, localY: 165 }], offsetX: 0, offsetY: 0 }), 1);
  assert.equal(editor.judgeGesture(pan, { fingerList: [{ localX: editor.px(5) + 6, localY: editor.py(.5) + 4 }], offsetX: 6, offsetY: 4 }), 0);
  assert.equal(editor.judgeGesture({ type: 0 }, { fingerList: [] }), 0);
  editor.points = [new MotionCurvePoint(20, .5)]; assert.equal(editor.outsideCount(), 1);
  assert.equal(editor.hitPoint(editor.px(20), editor.py(.5)), -1);
  assert.deepEqual(editor.bounds(), [0, 10]); assert.equal(editor.points[0].x, 20);
});

function boundCurveEditor() {
 const canvas=new Proxy({},{get:(t,k)=>t[k]??(()=>{}),set:(t,k,v)=>(t[k]=v,true)});
 const Editor=formClass('CurvePointEditor','CurvePointEditor',{...motion,...curve,...preview,CanvasRenderingContext2D:function(){return canvas;},RenderingContextSettings:function(){}});
 const editor=new Editor(),changes=[],geometry=[];editor.points=[new MotionCurvePoint(0,0)];editor.bindingKey='profile/L0/Custom';editor.onChange=p=>changes.push(p);editor.onGeometry=(...args)=>geometry.push(args);editor.aboutToAppear();return{editor,changes,geometry};
}
test('actual canvas geometry uses measured plot dimensions and revokes old owner callbacks on switch and unmount',()=>{
 const {editor,geometry}=boundCurveEditor();const owner=editor.geometryOwner,area=editor.geometryHandler(owner,editor.bindingKey);assert.deepEqual(geometry[0],[owner,0,0,true]);area({}, {width:324,height:180});assert.deepEqual(geometry.at(-1),[owner,300,156,true]);const count=geometry.length;area({}, {width:324,height:180});area({}, {width:NaN,height:180});assert.equal(geometry.length,count);
 editor.bindingKey='profile/R0/Custom';editor.bindingChanged();const next=editor.geometryOwner;assert.ok(next>owner);assert.deepEqual(geometry.at(-1),[next,300,156,true]);area({}, {width:600,height:180});assert.equal(geometry.at(-1)[0],next);editor.aboutToDisappear();const n=geometry.length;editor.geometryHandler(next,editor.bindingKey)({}, {width:600,height:180});assert.equal(geometry.length,n);
});
test('old numeric/delete/add/draft/gesture callbacks cannot cross same-valued axis context or point replacement',()=>{
 for(const change of ['key','callback','points','disappear']){
  const {editor,changes}=boundCurveEditor();const edit=editor.pointHandler(0,'x'),remove=editor.removeHandler(0),add=editor.addHandler(),draft=editor.draftHandler('x'),start=editor.gestureHandler('start'),end=editor.gestureHandler('end');
  if(change==='key'){editor.bindingKey='profile/R0/Custom';editor.bindingChanged();}else if(change==='callback')editor.onChange=p=>changes.push(p);else if(change==='points'){editor.points=[new MotionCurvePoint(.5,0)];editor.pointsChanged();}else editor.aboutToDisappear();
  assert.equal(edit(.25),false,change);assert.equal(draft(.3),false,change);remove();add();start({fingerList:[{localX:editor.px(0),localY:editor.py(0)}],offsetX:0,offsetY:0});end({fingerList:[]});assert.deepEqual(changes,[],change);
 }
 const {editor,changes}=boundCurveEditor();assert.equal(editor.pointHandler(0,'x')(.25),true);assert.equal(changes[0][0].x,.25);
});

test('an already-started drag cannot be completed through a fresh callback after bounds, size, interpolation or source identity changes',()=>{
 for(const mutate of [e=>e.viewMaximumX=1,e=>e.canvasWidth=500,e=>e.interpolationMode='step',e=>e.isLooping=true,e=>e.onChange=()=>{throw Error('stale drag committed');}]){
  const {editor,changes}=boundCurveEditor();editor.beginPoint(editor.px(0),editor.py(0));editor.movePoint(editor.px(5),editor.py(.5));assert.equal(editor.dragging,true);mutate(editor);editor.pointsChanged();editor.gestureHandler('end')({fingerList:[]});assert.deepEqual(changes,[]);assert.equal(editor.dragging,false);
 }
});

test('4096 point rows retain one bounded snapshot and compact keys rather than quadratic point JSON per row',()=>{
 const {editor}=boundCurveEditor();editor.points=Array.from({length:4096},(_,i)=>new MotionCurvePoint(i/4096,.123456789));editor.pointsChanged();const snapshot=editor.editSnapshot;
 const keys=editor.points.map((_,i)=>editor.editToken()+':'+i);assert.equal(new Set(keys).size,4096);assert.ok(keys.reduce((n,k)=>n+k.length,0)<65536);assert.equal(editor.editSnapshot,snapshot);assert.ok(snapshot.length<300000);
 const before=editor.editToken();editor.points=[new MotionCurvePoint(0,.5)];editor.pointsChanged();assert.notEqual(editor.editToken(),before);
});
