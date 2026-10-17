import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
registerHooks({ resolve(specifier, context, next) { return next(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? specifier + '.ts' : specifier, context); } });
const { CurvePreview } = await import('../entry/src/main/ets/core/CurvePreview.ts');
const { MotionCurvePoint, MotionProviderConfiguration } = await import('../entry/src/main/ets/core/MotionConfiguration.ts');
const { CustomCurveMotion } = await import('../entry/src/main/ets/core/motion/CustomCurveMotion.ts');
const points = rows => rows.map(([x, y]) => new MotionCurvePoint(x, y));
const close = (actual, expected, label = '') => assert.ok(Math.abs(actual - expected) <= 2e-14, `${label}: ${actual} vs ${expected}`);

test('preview follows source linear boundary anchors, first-duplicate insertion and looping tile counts', () => {
  const p = points([[.2, .1], [.8, .9]]);
  const fixed = CurvePreview.build(p, 0, 1, 0, 1, 'linear', false);
  assert.deepEqual(fixed.paths[0], points([[0, .1], [.2, .1], [.8, .9], [1, .9]]));
  const tiled = CurvePreview.build(p, 0, 1, 0, 1, 'linear', true);
  assert.equal(tiled.tileCount, 1); close(tiled.paths[0][0].y, .5); close(tiled.paths[0].at(-1).y, .5);
  assert.ok(tiled.keyframes[0].positionSeconds < 0); assert.ok(tiled.keyframes.at(-1).positionSeconds > 1);
  assert.equal(CurvePreview.build(p, 0, 1, 0, 1, 'makima', true).tileCount, 2);
  assert.equal(CurvePreview.build(p, 0, 1, 0, 1, 'pchip', true).tileCount, 1);
  const collision = CurvePreview.build(points([[0, 0], [1, 1]]), 0, 1, 0, 1, 'linear', true);
  assert.equal(CurvePreview.valueAt(collision.keyframes, 0, 'linear'), 1);
  const unsorted = points([[.8, .9], [.2, .1], [.2, .7]]), copy = JSON.stringify(unsorted);
  const result = CurvePreview.build(unsorted, 0, 1, 0, 1, 'linear', false);
  assert.equal(result.keyframes[0].value, .9); assert.equal(result.keyframes.at(-1).value, .7);
  assert.equal(result.keyframes.find(point => point.positionSeconds === .2).value, .1);
  assert.equal(JSON.stringify(unsorted), copy);
});

test('all four preview kernels match live CustomCurveMotion across looping, sparse, duplicate and reversed ranges', () => {
  const sets = [points([[.2, .1], [.8, .9]]), points([[.1, 0], [.3, .8], [.6, .1], [.9, 1]]),
    points([[.4, .6]]), points([[0, 0], [1, 1]]), points([[.8, .7], [.2, .3], [.2, .9]])];
  let compared = 0;
  for (const interpolationMode of ['linear', 'pchip', 'makima', 'step']) for (const isLooping of [false, true]) for (const values of sets) {
    const config = new MotionProviderConfiguration('Custom Curve');
    Object.assign(config, { points: values, durationSeconds: 1, interpolationMode, isLooping, minimum: .9, maximum: .1 });
    const provider = new CustomCurveMotion('L0', config), preview = CurvePreview.build(values, 0, 1, 0, 1, interpolationMode, isLooping);
    assert.equal(preview.issue, ''); assert.ok(preview.paths.length > 0);
    for (let index = 0; index < 32; index++) {
      const time = provider.getTimeSeconds(); provider.update(1 / 32);
      const y = CurvePreview.valueAt(preview.keyframes, time, interpolationMode);
      assert.notEqual(y, null); close(.9 + (.1 - .9) * y, provider.value, `${interpolationMode}/${isLooping}/${time}`); compared++;
    }
    assert.ok(preview.paths.flat().every(point => Number.isFinite(point.x) && point.y >= 0 && point.y <= 1));
  }
  assert.equal(compared, 1280);
});

test('preview agrees with already executed original C# oracle frames before each first cycle boundary', () => {
  const golden = JSON.parse(readFileSync(new URL('./fixtures/motion-provider-golden.json', import.meta.url)));
  assert.equal(golden.provenance.executedCSharp, true); let checked = 0;
  for (const row of golden.cases.filter(row => row.input.provider === 'custom')) {
    const input = row.input, config = new MotionProviderConfiguration('Custom Curve');
    for (const key of ['durationSeconds', 'isLooping', 'speed', 'minimum', 'maximum']) if (input[key] !== undefined) config[key] = input[key];
    if (input.points) config.points = points(input.points);
    if (input.interpolationMode) config.interpolationMode = input.interpolationMode.toLowerCase();
    const preview = CurvePreview.build(config.points, 0, config.durationSeconds, 0, 1, config.interpolationMode, config.isLooping);
    let time = 0;
    for (let index = 0; index < input.frames.length && time < config.durationSeconds; index++) {
      const frame = input.frames[index]; if (Object.keys(frame).some(key => key !== 'deltaSeconds')) break;
      const y = CurvePreview.valueAt(preview.keyframes, time, config.interpolationMode);
      if (y !== null && Number.isFinite(row.frames[index].value)) {
        close(config.minimum + (config.maximum - config.minimum) * y, row.frames[index].value, input.name + '/' + index); checked++;
      }
      time += config.speed * frame.deltaSeconds;
    }
  }
  assert.ok(checked >= 80, String(checked));
});

test('PCHIP/Makima preview samples the actual curved kernel rather than joining control points', () => {
  const p = points([[.1, 0], [.3, .8], [.6, .1], [.9, 1]]);
  for (const mode of ['pchip', 'makima']) {
    const curve = CurvePreview.build(p, 0, 1, 0, 1, mode, true);
    const linear = CurvePreview.build(p, 0, 1, 0, 1, 'linear', true);
    assert.ok(curve.paths[0].length >= 100);
    const differences = curve.paths[0].map(point => Math.abs(point.y - CurvePreview.valueAt(linear.keyframes, point.x, 'linear')));
    assert.ok(differences.some(value => value > .01), mode);
    for (const point of curve.paths[0]) close(point.y, CurvePreview.valueAt(curve.keyframes, point.x, mode));
  }
});

test('Step preview uses horizontal spans and explicit vertical jumps; Smart retains percent coordinates', () => {
  const result = CurvePreview.build(points([[25, 100], [90, 0]]), 0, 100, 0, 100, 'step', false);
  for (const path of result.paths) for (let index = 1; index < path.length; index++) {
    assert.ok(path[index].x === path[index - 1].x || path[index].y === path[index - 1].y);
  }
  const smart = CurvePreview.build(points([[25, 100], [90, 0]]), 0, 100, 0, 100, 'linear', false);
  close(CurvePreview.valueAt(smart.keyframes, 57.5, 'linear', 0, 100), 50);
  assert.deepEqual(smart.paths[0], points([[0, 100], [25, 100], [90, 0], [100, 0]]));
});

test('empty, single, zero-duration and overflow inputs never invent a finite fallback line or mutate settings', () => {
  assert.deepEqual(CurvePreview.build([], 0, 1, 0, 1).paths, []);
  const constant = CurvePreview.build(points([[.5, .6]]), 0, 1, 0, 1, 'makima', true);
  assert.equal(constant.tileCount, 0); assert.ok(constant.paths[0].every(point => Math.abs(point.y - .6) < 1e-15));
  for (const [p, min, max] of [[points([[0, 0]]), 0, 0], [points([[NaN, .5]]), 0, 1], [points([[Infinity, .5]]), 0, 1]]) {
    const result = CurvePreview.build(p, min, max, 0, 1); assert.ok(result.issue.length > 0); assert.deepEqual(result.paths, []);
  }
  const overflow = CurvePreview.build(points([[0, 0], [Number.MAX_VALUE, 1]]), 0, Number.MAX_VALUE, 0, 1, 'makima', true);
  assert.ok(overflow.issue.length > 0); assert.deepEqual(overflow.paths, []);
  assert.equal(CurvePreview.valueAt([], 0, 'linear'), null);
});
