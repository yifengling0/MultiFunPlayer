import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = new URL('../../', import.meta.url);
const base = new URL('../tools/reference/skip-gap-015/', import.meta.url);
const read = relative => readFileSync(new URL(relative, base), 'utf8');
const golden = JSON.parse(read('golden.json'));
const inputs = JSON.parse(read('inputs.json'));
const sha = text => createHash('sha256').update(text, 'utf8').digest('hex');
const normalizedSource = path => readFileSync(new URL(path, root), 'utf8').replace(/\r\n/g, '\n');
const script = normalizedSource('Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs');
const extensions = normalizedSource('Source/MultiFunPlayer/Common/Extensions.cs');
function expression(source, marker) {
  const start = source.indexOf(marker); assert.ok(start >= 0, marker);
  return source.slice(start, source.indexOf(';', start) + 1);
}
function method(source, marker) {
  const start = source.indexOf(marker); assert.ok(start >= 0, marker);
  let depth = 0;
  for (let end = source.indexOf('{', start); end < source.length; end++) {
    if (source[end] === '{') depth++;
    else if (source[end] === '}' && --depth === 0) return source.slice(start, end + 1);
  }
  throw new Error('Unclosed method: ' + marker);
}
const spans = {
  VALIDATE_INDEX: expression(extensions, 'public static bool ValidateIndex<T>'),
  GET_AXIS_POSITION: expression(script, 'private double GetAxisPosition(DeviceAxis axis)'),
  SKIP_GAP_OVERLOAD: expression(script, 'private void SkipGap(double minimumSkip = 0, params DeviceAxis[] axes)'),
  SKIP_GAP: method(script, 'private void SkipGap(IEnumerable<DeviceAxis> axes = null, double minimumSkip = 0)'),
  SEEK_MEDIA: method(script, 'private void SeekMediaToTime(double time)'),
  INDEX_CONSTANTS: ['AfterScriptIndex','BeforeScriptIndex','InvalidIndex'].map(name =>
    script.split('\n').find(line => line.includes('public static int ' + name + ' ')).trim()).join('\n'),
  INSIDE_SCRIPT: expression(script, 'public bool InsideScript => Index >= 0 && Index != AfterScriptIndex')
};

test('SkipGap golden is actual unchanged-source C# execution with bounded structural shims', () => {
  const provenance = golden.provenance;
  assert.equal(provenance.executedCSharp, true);
  assert.equal(provenance.sourceCommit, '36c08fbb99ac9398a63ff1cca1bbf68cd2228a94');
  assert.equal(provenance.sourceHashNormalization, 'CRLF-to-LF; preserve UTF-8 BOM and all other bytes');
  assert.equal(provenance.compiler, 'official Roslyn csc.dll; no restore');
  assert.equal(golden.cases.length, 116);
  assert.deepEqual(golden.cases.map(item => item.input), inputs);
  for (const [path, hash] of Object.entries(provenance.sourceSha256)) {
    assert.equal(sha(normalizedSource(path)), hash, path + ' drift');
  }
  assert.equal(sha(read('Host.cs.in')), provenance.hostTemplateSha256);
  assert.equal(sha(read('run.py')), provenance.runnerSha256);
  assert.equal(sha(read('inputs.json')), provenance.inputsSha256);
  let host = read('Host.cs.in');
  for (const [name, span] of Object.entries(spans)) {
    assert.equal(sha(span), provenance.extractedSpanSha256[name], name + ' span drift');
    assert.ok(host.includes('@@' + name + '@@'), name + ' not injected');
    host = host.replace('@@' + name + '@@', span);
  }
  assert.equal(sha(host), provenance.generatedHostSha256);
  assert.ok(!host.includes('@@'));
  assert.ok(provenance.shims.some(text => text.includes('no full updater or Fody')));
  assert.ok(provenance.portableSafetyDifference.includes('NaN MediaPosition'));
});

// Independent hand-checked contract anchors validate generated results. They do
// not implement a second gap-selection algorithm or create the golden fixture.
const anchors = [
  ['selected_axis_is_ignored',[10]], ['unknown_target_is_not_dereferenced',[10]],
  ['empty_axes_short_circuits',[]], ['null_enumerable_uses_all',[10]],
  ['null_empty_singleton_bindings',[]], ['earliest_past_blocks_future',[]],
  ['earliest_too_near_blocks_future',[]], ['minimum_exact_is_rejected',[]],
  ['minimum_just_greater_is_allowed',[10]], ['inside_non_gap_does_not_search_ahead',[]],
  ['before_starts_at_zero',[10]], ['invalid_starts_at_zero',[10]], ['after_starts_at_zero',[10]],
  ['out_of_range_inside_index',[]], ['flat_to_final_point',[30]],
  ['value_epsilon_strictly_less',[10]], ['value_epsilon_equal_not_gap',[]],
  ['position_epsilon_strictly_less',[.000999]], ['position_epsilon_equal_not_gap',[]],
  ['raw_target_ignores_positive_offsets',[40]], ['raw_target_ignores_negative_offset',[40]],
  ['locked_bypassed_axis_remains_candidate',[10]], ['linked_equal_keyframes_independent_indices',[]],
  ['duration_clamp_occurs_after_threshold',[10]], ['nan_media_position_original_seeks',[10]],
  ['nan_media_duration_no_seek',[]], ['infinite_media_duration_no_seek',[]],
  ['nan_minimum_direct_typed_call',[10]], ['negative_minimum_direct_typed_call',[10]]
];
for (const [name, expected] of anchors) test('original SkipGap contract: ' + name, () => {
  const result = golden.cases.find(item => item.name === name)?.expected;
  assert.ok(result, name); assert.deepEqual(result.seeks, expected); assert.equal(result.exceptionType, null);
});
test('offset oracle prepares state with original index helpers while seek stays raw', () => {
  const result = golden.cases.find(item => item.name === 'raw_target_ignores_positive_offsets').expected;
  assert.deepEqual(result.axes, [{name:'L0',index:2,insideScript:true,axisPosition:20}]);
  assert.deepEqual(result.seeks,[40]);
});
test('negative duration exception is original direct-call behavior, not a supported portable input', () => {
  const result = golden.cases.find(item => item.name === 'negative_duration_direct_typed_call_throws').expected;
  assert.equal(result.exceptionType,'ArgumentException'); assert.deepEqual(result.seeks,[]);
});

const sdkRoot = process.env.MFP_DOTNET_ROOT ?? process.env.DOTNET_ROOT;
const dotnet = sdkRoot ? join(sdkRoot, 'dotnet') : null;
test('re-execute all 116 original C# SkipGap cases with official .NET 9', {
  skip: !dotnet || !existsSync(dotnet) ? 'Set MFP_DOTNET_ROOT or DOTNET_ROOT to installed official .NET 9 SDK; golden/provenance checks still run.' : false
}, () => {
  const execution = spawnSync(process.env.PYTHON ?? 'python3', [fileURLToPath(new URL('run.py',base)), '--sdk-root', sdkRoot],
    {encoding:'utf8', maxBuffer:8*1024*1024, timeout:120000});
  assert.equal(execution.status,0,execution.stdout + execution.stderr);
  const actual = JSON.parse(execution.stdout);
  assert.deepEqual(actual.cases,golden.cases);
  assert.equal(actual.provenance.executedCSharp,true);
  assert.deepEqual(actual.provenance.sourceSha256,golden.provenance.sourceSha256);
  assert.deepEqual(actual.provenance.extractedSpanSha256,golden.provenance.extractedSpanSha256);
  assert.equal(actual.provenance.generatedHostSha256,golden.provenance.generatedHostSha256);
});
