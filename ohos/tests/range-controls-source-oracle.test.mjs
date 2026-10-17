import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createMotionControlValues, transferMotionControlValues, userEditMotionControlValue } from '../entry/src/main/ets/core/MotionControlValues.ts';

const base = new URL('../tools/reference/range-controls-016/', import.meta.url);
const root = new URL('../../', import.meta.url);
const read = name => readFileSync(new URL(name, base), 'utf8');
const source = name => readFileSync(new URL(name, root), 'utf8');
const hash = text => createHash('sha256').update(text).digest('hex');
const manifest = JSON.parse(read('manifest.json'));
const golden = JSON.parse(read('golden.json'));
const inputs = JSON.parse(read('inputs.json'));
const range = read('upstream/RangeSlider.cs');
const numeric = read('upstream/NumericUpDown.cs');
const expression = read('upstream/BindingExpression.cs');
const bindingBase = read('upstream/BindingExpressionBase.cs');
const dependency = read('upstream/DependencyObject.cs');
const plain = value => JSON.parse(JSON.stringify(value));
function method(text, marker) {
  const start = text.indexOf(marker); assert.ok(start >= 0, marker);
  let depth = 0;
  for (let end = text.indexOf('{', start); end < text.length; end++) {
    if (text[end] === '{') depth++;
    else if (text[end] === '}' && --depth === 0) return text.slice(start, end + 1);
  }
  throw new Error('Unclosed method: ' + marker);
}
const snippets = {
  LOWER: method(range, 'internal static object CoerceLowerValue('),
  UPPER: method(range, 'internal static object CoerceUpperValue('),
  RANGES_CHANGED: method(range, 'private static void RangesChanged('),
  COERCE_BOTH: method(range, 'private void CoerceLowerUpperValues()'),
  RAISE_EVENTS: method(range, 'private static void RaiseValueChangedEvents('),
  NUMERIC: method(numeric, 'private static object CoerceValue(')
};

test('retained official sources match Git blob hashes byte for byte', () => {
  for (const item of manifest.files) {
    const bytes = readFileSync(new URL(item.file, base));
    const actual = createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
    assert.equal(actual, item.gitBlobSha1, item.file);
    assert.match(item.url, /^https:\/\/github\.com\//);
  }
  assert.ok(manifest.files.some(item => item.file.endsWith('RangeSlider.cs') && item.url.includes('/2.4.9/')));
  assert.ok(manifest.files.some(item => item.file.endsWith('BindingExpression.cs') && item.version.includes('not locked')));
  const app = JSON.parse(read('application-sources.json'));
  assert.equal(app.sourceCommit, '36c08fbb99ac9398a63ff1cca1bbf68cd2228a94');
  for (const [path, expected] of Object.entries(app.sha256)) assert.equal(hash(source(path)), expected, path);
});

test('oracle executes unchanged pinned methods, explicitly not WPF or Fody', () => {
  const p = golden.provenance;
  assert.equal(p.executedCSharp, true); assert.equal(p.wpfExecuted, false);
  assert.equal(p.compiler, 'official Roslyn csc.dll; no restore');
  assert.equal(p.sdk, '9.0.319');
  assert.deepEqual(golden.cases.map(c => c.input), inputs);
  for (const [file, expected] of Object.entries(p.sourceSha256)) assert.equal(hash(read('upstream/' + file)), expected, file);
  let host = read('Host.cs.in');
  for (const [key, value] of Object.entries(snippets)) {
    assert.equal(hash(value), p.extractedSpanSha256[key], key);
    host = host.replace('@@' + key + '@@', value);
  }
  assert.equal(hash(host), p.generatedHostSha256); assert.ok(!host.includes('@@'));
  assert.equal(hash(read('Host.cs.in')), p.hostTemplateSha256);
  assert.equal(hash(read('run.py')), p.runnerSha256);
  assert.equal(hash(read('inputs.json')), p.inputsSha256);
  assert.ok(p.shims.some(x => x.includes('does not execute any binding')));
});

test('complete actual C# effective state and change sequence matches portable model in 1241 steps', () => {
  let count = 0;
  for (const c of golden.cases) {
    let state = createMotionControlValues();
    for (let index = 0; index < c.input.operations.length; index++) {
      const { field, value } = c.input.operations[index];
      const raw = { minimum: state.sourceMinimum, maximum: state.sourceMaximum, octaves: state.sourceOctaves, [field]: value };
      const before = plain(state), rawBefore = plain(raw);
      const result = transferMotionControlValues(state, raw, [field]);
      assert.deepEqual(plain(result.state), c.expected.steps[index].state, c.input.name + ':' + index);
      assert.deepEqual(plain(result.valueChanges), c.expected.steps[index].valueChanges, c.input.name + ':' + index);
      assert.deepEqual(result.commits, []); assert.deepEqual(plain(state), before); assert.deepEqual(raw, rawBefore);
      state = result.state; count++;
    }
  }
  assert.equal(count, 1241);
});

const anchors = [
  ['lower_crosses_current_upper', .19, .2],
  ['upper_crosses_current_lower', .8, .81],
  ['lower_then_upper_is_history_dependent', .9, .91],
  ['upper_then_lower_is_history_dependent', .19, .2],
  ['retained_lower_base_recovers', .9, 1],
  ['retained_upper_base_recovers', 0, .1],
  ['equal_requested_bounds', .5, .51],
  ['both_zero', 0, .01],
  ['both_one', .99, 1]
];
for (const [name, lower, upper] of anchors) test('independent endpoint anchor: ' + name, () => {
  const actual = golden.cases.find(c => c.input.name === name).expected.steps.at(-1).state;
  assert.equal(actual.minimum, lower); assert.equal(actual.maximum, upper);
});

test('MahApps callback order is Lower then Upper; routed events are separately ordered', () => {
  assert.ok(snippets.COERCE_BOTH.indexOf('CoerceValue(LowerValueProperty)') < snippets.COERCE_BOTH.indexOf('CoerceValue(UpperValueProperty)'));
  assert.ok(snippets.RAISE_EVENTS.indexOf('RangeSelectionChangedEventArgs') < snippets.RAISE_EVENTS.indexOf('LowerValueChangedEvent'));
  assert.ok(snippets.RAISE_EVENTS.indexOf('LowerValueChangedEvent') < snippets.RAISE_EVENTS.indexOf('UpperValueChangedEvent'));
  const step = golden.cases.find(c => c.input.name === 'retained_lower_base_recovers').expected.steps.at(-1);
  assert.deepEqual(step.coercionOrder, ['maximum', 'minimum', 'minimum', 'maximum', 'maximum']);
  assert.deepEqual(step.routedEvents.map(e => e.Event), ['range', 'lower', 'upper']);
});

test('coercion and display transfer have no implicit model write-back', () => {
  const transfer = method(expression, 'internal void TransferValue(object newValue, bool isASubPropertyChange)');
  assert.ok(transfer.indexOf('IsInTransfer = true') < transfer.indexOf('Invalidate(isASubPropertyChange)'));
  assert.ok(transfer.indexOf('Invalidate(isASubPropertyChange)') < transfer.indexOf('IsInTransfer = false'));
  assert.match(method(bindingBase, 'private bool ShouldReactToDirty()'), /IsInTransfer \|\| !IsAttached/);
  assert.match(method(expression, 'internal override bool UpdateOverride()'), /\|\| IsInTransfer/);
  const coerce = method(dependency, 'private void ProcessCoerceValue(');
  assert.match(coerce, /newEntry\.SetCoercedValue\(coercedValue, baseValue/);
  assert.doesNotMatch(coerce, /currentExpr\.SetValue|UpdateSource/);
  for (const code of Object.values(snippets)) assert.doesNotMatch(code, /UpdateSource|SetCurrentValue/);
  assert.doesNotMatch(method(numeric, 'protected virtual void OnValueChanged('), /UpdateSource|SetCurrentValue/);
  assert.doesNotMatch(method(range, 'private void ReCalculateSize()'), /(?:LowerValue|UpperValue)\s*=/);
});

test('unloaded is not detached: coercion has no IsLoaded gate', () => {
  for (const code of Object.values(snippets)) assert.doesNotMatch(code, /IsLoaded|ActualWidth|ActualHeight/);
  const onChanged = method(numeric, 'protected virtual void OnValueChanged(');
  assert.match(onChanged, /if \(this\.IsLoaded\)[\s\S]*MaximumReachedEvent/);
  assert.match(method(bindingBase, 'private bool ShouldReactToDirty()'), /!IsAttached/);
  assert.match(method(expression, 'internal override void DetachOverride()'), /DetachFromContext\(\)/);
  assert.match(method(expression, 'internal override bool ShouldReactToDirtyOverride()'), /DataItem != DisconnectedItem/);
});

test('same-effective explicit setter reaches binding before effective-value comparison', () => {
  const setter = method(dependency, 'private void SetValueCommon(');
  assert.match(setter, /handled = currentExpr\.SetValue\(this, dp, value\)/);
  assert.ok(setter.indexOf('currentExpr.SetValue') < setter.indexOf('UpdateEffectiveValue('));
  assert.match(method(bindingBase, 'internal override bool SetValue('), /Value = value;/);
  assert.match(bindingBase, /set\s*\{\s*ChangeValue\(value, true\);\s*Dirty\(\);/);
  const setTo = method(numeric, 'private void SetValueTo(');
  assert.match(setTo, /SetCurrentValue\(ValueProperty, CoerceValue\(this, value\)\)/);
  assert.doesNotMatch(setTo, /if\s*\(.*(?:this\.Value\s*==|newValue\s*==)/);
  let state = transferMotionControlValues(createMotionControlValues(), { minimum: 0, maximum: 1, octaves: 129 }).state;
  const edited = userEditMotionControlValue(state, 'octaves', 8);
  assert.deepEqual(edited.valueChanges, []);
  assert.deepEqual(plain(edited.commits), [{ field: 'octaves', value: 8 }]);
  assert.equal(state.sourceOctaves, 129); assert.equal(edited.state.sourceOctaves, 8);
});

test('source bindings and model callbacks keep controls separate from providers', () => {
  const project = source('Source/MultiFunPlayer/MultiFunPlayer.csproj');
  assert.match(project, /Include="MahApps.Metro" Version="2\.4\.9"/);
  assert.match(project, /Include="PropertyChanged.Fody" Version="4\.\*"/);
  assert.match(project, /Include="Fody" Version="6\.\*"/);
  assert.match(project, /Include="Stylet" Version="1\.\*"/);
  const model = source('Source/MultiFunPlayer/MotionProvider/ViewModels/RandomMotionProvider.cs');
  assert.match(model, /p\.Octaves = octaves/); assert.doesNotMatch(model, /OnOctavesChanged/);
  assert.match(model, /_time \+= Speed \* deltaTime/);
  const view = source('Source/MultiFunPlayer/MotionProvider/Views/RandomMotionProvider.xaml');
  assert.match(view, /Maximum="8"[\s\S]*Value="\{Binding Octaves\}"/);
  assert.match(view, /LowerValue="\{Binding Minimum, Mode=TwoWay, UpdateSourceTrigger=PropertyChanged\}"/);
  assert.match(view, /UpperValue="\{Binding Maximum, Mode=TwoWay, UpdateSourceTrigger=PropertyChanged\}"/);
});

test('the actual declared MaterialDesign release theme adds no Value write-back', () => {
  const versions = read('upstream/MaterialDesign.get_versions.yml');
  assert.match(versions, /mdix-version: "4\.7\.0"/);
  assert.match(versions, /mdix-mahapps-version: "0\.2\.6"/);
  const theme = read('upstream/MaterialDesignTheme.MahApps.NumericUpDown.xaml');
  assert.match(theme, /x:Key="MaterialDesignNumericUpDown"/);
  assert.match(theme, /x:Name="PART_TextBox"/);
  assert.doesNotMatch(theme, /EventSetter|UpdateSource|Property="Value"|Text="\{Binding/);
  assert.match(read('upstream/FrameworkPropertyMetadata.cs'), /UpdateSourceTrigger\.PropertyChanged\) << 30/);
  assert.match(read('upstream/MaterialDesignTheme.MahApps.Defaults.xaml'), /MaterialDesignTheme\.MahApps\.NumericUpDown\.xaml/);
});

test('no-op transfers retain base/effective history; explicit order can differ', () => {
  const raw = { minimum: .9, maximum: .2, octaves: 9 };
  const a = transferMotionControlValues(createMotionControlValues(), raw).state;
  const b = transferMotionControlValues(createMotionControlValues(), raw, ['maximum', 'minimum', 'octaves']).state;
  assert.equal(a.minimum, .9); assert.equal(a.maximum, .91);
  assert.equal(b.minimum, .19); assert.equal(b.maximum, .2);
  const unchanged = transferMotionControlValues(a, raw);
  assert.deepEqual(plain(unchanged.state), plain(a)); assert.deepEqual(unchanged.valueChanges, []);
  assert.deepEqual(unchanged.commits, []);
});

test('single-endpoint edits constrain and commit only the explicit field', () => {
  const state = transferMotionControlValues(createMotionControlValues(), { minimum: 0, maximum: .2, octaves: 128 }).state;
  const result = userEditMotionControlValue(state, 'minimum', .9);
  assert.equal(result.state.minimum, .19); assert.equal(result.state.sourceMinimum, .19);
  assert.equal(result.state.sourceMaximum, .2); assert.equal(result.state.sourceOctaves, 128);
  assert.deepEqual(plain(result.commits), [{ field: 'minimum', value: .19 }]);
  assert.equal(state.sourceMinimum, 0);
});

test('invalid actions reject before mutation; Int32 display is not runtime activation', () => {
  const state = createMotionControlValues(), before = plain(state);
  for (const raw of [{ minimum: NaN, maximum: 1 }, { minimum: 0, maximum: Infinity },
    { minimum: 0, maximum: 1, octaves: 1.5 }, { minimum: 0, maximum: 1, octaves: 2147483648 }]) {
    assert.throws(() => transferMotionControlValues(state, raw));
  }
  assert.throws(() => transferMotionControlValues(state, { minimum: 0, maximum: 1 }, ['octaves']));
  assert.throws(() => userEditMotionControlValue(state, 'octaves', 1.5));
  assert.throws(() => userEditMotionControlValue(state, 'minimum', Infinity));
  assert.deepEqual(plain(state), before);
  for (const value of [128, 129, 2147483647]) {
    const result = transferMotionControlValues(state, { minimum: 0, maximum: 1, octaves: value });
    assert.equal(result.state.octaves, 8); assert.equal(result.state.sourceOctaves, value); assert.deepEqual(result.commits, []);
  }
});

const sdkRoot = process.env.MFP_DOTNET_ROOT ?? process.env.DOTNET_ROOT;
test('recompile and rerun the unchanged C# oracle offline', { skip: !sdkRoot || !existsSync(join(sdkRoot, 'dotnet')) ? 'Existing .NET 9 SDK not provided; source/golden checks still run' : false }, () => {
  const result = spawnSync('python3', [fileURLToPath(new URL('run.py', base))], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, env: process.env });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.deepEqual(JSON.parse(result.stdout), golden);
});
