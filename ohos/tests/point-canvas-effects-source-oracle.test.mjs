import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = new URL('../../', import.meta.url);
const base = new URL('../tools/reference/point-canvas-016/', import.meta.url);
const read = relative => readFileSync(new URL(relative, base), 'utf8');
const golden = JSON.parse(read('golden.json'));
const inputs = JSON.parse(read('inputs.json'));
const sha = text => createHash('sha256').update(text, 'utf8').digest('hex');
const normalized = path => readFileSync(new URL(path, root), 'utf8').replace(/\r\n/g, '\n');
const canvas = normalized('Source/MultiFunPlayer/UI/Controls/DraggablePointCanvas.xaml.cs');
function method(marker) {
  const start = canvas.indexOf(marker); assert.ok(start >= 0, marker);
  let depth = 0;
  for (let end = canvas.indexOf('{', start); end < canvas.length; end++) {
    if (canvas[end] === '{') depth++;
    else if (canvas[end] === '}' && --depth === 0) return canvas.slice(start, end + 1);
  }
  throw new Error('Unclosed method: ' + marker);
}
function expression(marker) {
  const start = canvas.indexOf(marker); assert.ok(start >= 0, marker);
  return canvas.slice(start, canvas.indexOf(';', start) + 1);
}
const methods = {
  POINTS_PROPERTY_CHANGED: 'private static void OnPointsPropertyChanged(',
  POINTS_COLLECTION_CHANGED: 'private void OnPointsCollectionChanged(',
  SIZE_CHANGED: 'private void OnSizeChanged(', REMOVE_ELEMENT: 'private void RemoveElement(',
  ADD_ELEMENT: 'private void AddElement(', UPDATE_VIEWPORT: 'private void UpdateViewport(',
  ELEMENTS_FROM_POINTS: 'private void SynchronizeElementsFromPoints(',
  POINTS_FROM_ELEMENTS: 'private void SynchronizePointsFromElements('
};
const expressions = {
  FROM_CANVAS: 'public Point FromCanvas(', FROM_CANVAS_X: 'public double FromCanvasX(',
  FROM_CANVAS_Y: 'public double FromCanvasY(', TO_CANVAS: 'public Point ToCanvas(',
  TO_CANVAS_X: 'public double ToCanvasX(', TO_CANVAS_Y: 'public double ToCanvasY('
};

test('canvas fixture pins executed unchanged methods/full collection and explicitly excludes WPF', () => {
  const p = golden.provenance;
  assert.equal(p.executedCSharp, true);
  assert.equal(p.executedWpf, false);
  assert.equal(p.sourceCommit, '36c08fbb99ac9398a63ff1cca1bbf68cd2228a94');
  assert.equal(p.sdk, '9.0.319');
  assert.equal(p.runtime, '9.0.21');
  assert.equal(p.compiler, 'official Roslyn csc.dll; no restore');
  assert.equal(p.sourceHashNormalization, 'CRLF-to-LF; preserve UTF-8 BOM and all other bytes');
  assert.equal(golden.cases.length, 129);
  assert.deepEqual(golden.cases.map(c => c.input), inputs);
  assert.equal(new Set(inputs.map(c => c.name)).size, inputs.length);
  for (const [path, hash] of Object.entries(p.sourceSha256)) assert.equal(sha(normalized(path)), hash, path + ' drift');
  assert.equal(sha(read('Host.cs.in')), p.hostTemplateSha256);
  assert.equal(sha(read('run.py')), p.runnerSha256);
  assert.equal(sha(read('inputs.json')), p.inputsSha256);
  let host = read('Host.cs.in');
  for (const [name, marker] of Object.entries({ ...methods, ...expressions })) {
    const span = name in methods ? method(marker) : expression(marker);
    assert.equal(sha(span), p.extractedSpanSha256[name], name + ' drift');
    assert.ok(host.includes('@@' + name + '@@'));
    host = host.replace('@@' + name + '@@', span);
  }
  assert.equal(sha(host), p.generatedHostSha256);
  assert.ok(!/@@[A-Z_]+@@/.test(host));
  assert.ok(p.shims.some(s => s.includes('ZERO-ORIGIN')));
  assert.ok(p.shims.some(s => s.includes('no dependency property engine')));
  assert.ok(p.shims.some(s => s.includes('full unchanged ObservableConcurrentCollection')));
  assert.ok(p.limitations.some(s => s.includes('inter-control reentrancy')));
});

const caseByName = name => {
  const c = golden.cases.find(item => item.name === name);
  assert.ok(c, name);
  return c.expected.steps;
};
test('closed-edge prune happens before the zero measured-size early return', () => {
  for (const dimension of ['width', 'height']) {
    const c = caseByName('viewport_prunes_before_zero_' + dimension + '_return')[0];
    assert.deepEqual(c.points, [[8, .7], [2, .2], [2, .8]]);
    assert.equal(c.removedPointCount, 2);
    assert.equal(c.pointWriteBackCount, 0);
    assert.equal(c.canvasPoints, null);
    assert.deepEqual(c.collectionEvents, ['Remove', 'Remove']);
  }
  const c = caseByName('closed_edges_and_nearest_outside')[0];
  assert.equal(c.removedPointCount, 4);
  assert.deepEqual(c.points, [[0, 0], [0, 1], [10, 1], [10, 0]]);
});
test('stable sorting retains duplicate order even after pixel underflow', () => {
  const duplicate = caseByName('duplicate_x_stable_no_deduplication')[0];
  assert.deepEqual(duplicate.points.map(p => p[0]), [2, 2, 4, 4, 4]);
  for (const [index, y] of [.6, .2, .8, .1, .5].entries()) assert.ok(Math.abs(duplicate.points[index][1] - y) < 1e-15);
  const c = caseByName('pixel_underflow_ties_preserve_first_model_sort')[0];
  assert.deepEqual(c.points.map(p => p[0]), [0, 0, 0]);
  // Y itself round-trips, so compare the original input tag values with a narrow epsilon.
  for (const [index, y] of [.2, .9, .8].entries()) assert.ok(Math.abs(c.points[index][1] - y) < 1e-15);
});
test('equal reset and resize always write, empty reset still notifies', () => {
  for (const c of caseByName('singleton_equal_reset_writes_each_time')) {
    assert.deepEqual(c.collectionEvents, ['Reset', 'Replace']);
    assert.equal(c.countNotificationCount, 2);
    assert.equal(c.itemNotificationCount, 2);
  }
  for (const c of caseByName('empty_reset_still_notifies')) {
    assert.deepEqual(c.collectionEvents, ['Reset']);
    assert.equal(c.countNotificationCount, 1);
  }
  for (const c of caseByName('equal_points_repeated_synchronize_writes_each_time')) {
    assert.deepEqual(c.collectionEvents, ['Replace', 'Replace']);
  }
});
test('initial points binding and later resize share numeric synchronization but have different property events', () => {
  const [bound, resized] = caseByName('initial_points_binding_unmeasured_then_resize');
  assert.equal(bound.pointPropertyNotifications, 1);
  assert.equal(bound.pointWriteBackCount, 0);
  assert.equal(resized.pointPropertyNotifications, 0);
  assert.equal(resized.pointWriteBackCount, 5);
  assert.equal(resized.removedPointCount, 0);
});
test('explicit delivery schedules demonstrate why incoming Points must not universally be pruned', () => {
  const oldThenReset = caseByName('duration_before_incoming_reset_keeps_new_outside').at(-1);
  const resetThenNew = caseByName('deferred_viewport_after_incoming_reset_prunes_new').at(-1);
  assert.equal(oldThenReset.points.length, 2);
  assert.equal(oldThenReset.points[1][0], 7);
  assert.equal(resetThenNew.points.length, 1);
  assert.equal(resetThenNew.removedPointCount, 1);
});

const sdkRoot = process.env.MFP_DOTNET_ROOT ?? process.env.DOTNET_ROOT;
const dotnet = sdkRoot ? join(sdkRoot, 'dotnet') : null;
test('re-execute all 129 source canvas schedules with installed official .NET 9.0.319', {
  skip: !dotnet || !existsSync(dotnet) ? 'Set MFP_DOTNET_ROOT to installed official .NET 9.0.319; static provenance checks still run.' : false
}, () => {
  const execution = spawnSync(process.env.PYTHON ?? 'python3', [fileURLToPath(new URL('run.py', base)), '--sdk-root', sdkRoot],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 120000 });
  assert.equal(execution.status, 0, execution.stdout + execution.stderr);
  const actual = JSON.parse(execution.stdout);
  assert.deepEqual(actual, golden);
});
