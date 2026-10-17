import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PointCanvasEffects, PointCanvasPoint, PointCanvasGeometry } from '../entry/src/main/ets/core/PointCanvasEffects.ts';

const golden = JSON.parse(readFileSync(new URL('../tools/reference/point-canvas-016/golden.json', import.meta.url), 'utf8'));
const pointList = values => values.map(([x, y]) => new PointCanvasPoint(x, y));
const numbers = points => points === null ? null : points.map(point => [point.x, point.y]);
const geometry = (attached = true, width = 300, height = 150, viewportWidth = 10, viewportHeight = 1) =>
  new PointCanvasGeometry(attached, width, height, viewportWidth, viewportHeight);

for (const fixture of golden.cases) test('unchanged C# canvas/collection → pure effect: ' + fixture.name, () => {
  let points = pointList(fixture.input.initialPoints);
  const sourceSnapshots = fixture.expected.steps;
  fixture.input.steps.forEach((step, index) => {
    if (step.event === 'collection-reset' && step.points !== undefined) points = pointList(step.points);
    const before = structuredClone(points);
    const event = step.event === 'points-bound' ? 'synchronize' : step.event;
    const g = step.geometry;
    const result = PointCanvasEffects.apply(points,
      geometry(g.attached, g.actualWidth, g.actualHeight, g.viewportWidth, g.viewportHeight), event);
    const expected = sourceSnapshots[index];
    assert.deepEqual(numbers(result.points), expected.points, 'model points, step ' + index);
    assert.deepEqual(numbers(result.canvasPoints), expected.canvasPoints, 'canvas coordinates, step ' + index);
    for (const key of ['collectionResetCount', 'removedPointCount', 'pointWriteBackCount',
      'countNotificationCount', 'itemNotificationCount']) assert.equal(result[key], expected[key], key + ', step ' + index);
    assert.deepEqual(structuredClone(points), before, 'projection must not mutate its input');
    assert.equal(expected.collectionIdentityPreserved, true, 'original collection identity retained');
    assert.equal(expected.contextSendCount, expected.countNotificationCount, 'original Send path executes');
    points = result.points;
  });
});

test('full 4096-point bound is retained, and 4097 rejects before iteration', () => {
  const points = Array.from({ length: 4096 }, (_, index) => new PointCanvasPoint(4095 - index, .5));
  const result = PointCanvasEffects.apply(points, geometry(true, 300, 150, 4096), 'collection-reset');
  assert.equal(result.points.length, 4096);
  assert.equal(result.pointWriteBackCount, 4096);
  assert.equal(result.countNotificationCount, 4097);
  assert.equal(points[0].x, 4095);
  const tooMany = Array(4097);
  Object.defineProperty(tooMany, 0, { get() { throw new Error('Do not read oversized input'); } });
  assert.throws(() => PointCanvasEffects.apply(tooMany, geometry(), 'synchronize'), /at most 4096/);
});

test('invalid and sparse points reject atomically even when detached or pruned', () => {
  for (const invalid of [null, {}, 2, 'x', [], { x: 1 }, { x: NaN, y: .5 }, { x: Infinity, y: 0 },
    { x: 1, y: -Infinity }, { x: '1', y: 0 }]) {
    const points = [new PointCanvasPoint(8, .8), invalid];
    const before = structuredClone(points);
    for (const attached of [true, false]) {
      assert.throws(() => PointCanvasEffects.apply(points, geometry(attached), 'viewport-change'));
      assert.deepEqual(structuredClone(points), before);
    }
  }
  assert.throws(() => PointCanvasEffects.apply(Array(3), geometry(), 'collection-reset'), /dense/);
  for (const invalid of [null, {}, 'points']) assert.throws(() => PointCanvasEffects.apply(invalid, geometry(), 'synchronize'));
});

test('invalid geometry and unknown events reject without modifying points', () => {
  const points = [new PointCanvasPoint(5, .5)];
  const before = numbers(points);
  const bad = [null, {}, [], geometry(true, -1), geometry(true, 1, -1), geometry(true, Infinity),
    geometry(true, 1, NaN), geometry(true, 1, 1, 0), geometry(true, 1, 1, -1),
    geometry(true, 1, 1, Infinity), geometry(true, 1, 1, 1, 0), geometry(true, 1, 1, 1, NaN),
    geometry('yes'), geometry(true, '300')];
  for (const g of bad) assert.throws(() => PointCanvasEffects.apply(points, g, 'synchronize'));
  for (const event of ['', 'render', 'duration-set', null]) assert.throws(() => PointCanvasEffects.apply(points, geometry(), event), /Unknown/);
  assert.deepEqual(numbers(points), before);
});

test('finite input arithmetic overflow rejects the whole projection, never commits a partial sort', () => {
  const points = pointList([[1, .5], [Number.MAX_VALUE, .25]]);
  const before = numbers(points);
  assert.throws(() => PointCanvasEffects.apply(points, geometry(true, Number.MAX_VALUE, 150, 1), 'synchronize'), /finite/);
  assert.deepEqual(numbers(points), before);
  assert.throws(() => PointCanvasEffects.apply(pointList([[1, 1]]),
    geometry(true, 1, 1, Number.MIN_VALUE), 'synchronize'), /finite/);
  assert.throws(() => PointCanvasEffects.apply(pointList([[0, Number.MAX_VALUE]]),
    geometry(true, 1, 1, 1, Number.MIN_VALUE), 'collection-reset'), /finite/);
  // No nonexistent conversion occurs when detached/unmeasured, or after pruning this point.
  assert.equal(PointCanvasEffects.apply(points, geometry(false, Number.MAX_VALUE, 150, 1), 'synchronize').points.length, 2);
  assert.equal(PointCanvasEffects.apply(points, geometry(true, 0, 150, 1), 'synchronize').points.length, 2);
  assert.equal(PointCanvasEffects.apply(points, geometry(true, Number.MAX_VALUE, 150, 1), 'viewport-change').points.length, 1);
});

test('results are detached snapshots and equal-content reset still has observable writes', () => {
  const input = pointList([[5, .5]]);
  const g = geometry();
  const result = PointCanvasEffects.apply(input, g, 'collection-reset');
  assert.equal(result.collectionResetCount, 1);
  assert.equal(result.pointWriteBackCount, 1);
  assert.equal(result.countNotificationCount, 2);
  result.points[0].x = 2;
  result.canvasPoints[0].x = 0;
  assert.equal(input[0].x, 5);
  assert.equal(g.actualWidth, 300);
  assert.equal(PointCanvasEffects.apply(input, g, 'collection-reset').points[0].x, 5);
});

test('model has no invented origin, visible-state, rendering or provider-state policy', () => {
  const result = PointCanvasEffects.apply(pointList([[11, 1.2], [-1, -.2]]), geometry(), 'synchronize');
  assert.equal(result.removedPointCount, 0);
  assert.equal(result.points.length, 2);
  assert.ok(result.points[0].x < 0 && result.points[0].y < 0);
  assert.ok(result.points[1].x > 10 && result.points[1].y > 1);
  assert.equal(result.collectionResetCount, 0);
  assert.equal(result.pointWriteBackCount, 2);
});
