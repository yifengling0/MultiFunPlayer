import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? specifier + '.ts' : specifier, context);
} });
const { MotionProviderConfiguration, MotionCurvePoint, MotionConfigurations, AxisMotionConfiguration, DeviceMotionConfiguration } = await import('../entry/src/main/ets/core/MotionConfiguration.ts');
const { AxisKeyframe, AxisScriptResource, AxisScriptBinding } = await import('../entry/src/main/ets/core/AxisScriptStore.ts');
const { PatternMotion } = await import('../entry/src/main/ets/core/motion/PatternMotion.ts');
const { RandomMotion } = await import('../entry/src/main/ets/core/motion/RandomMotion.ts');
const { CustomCurveMotion } = await import('../entry/src/main/ets/core/motion/CustomCurveMotion.ts');
const { LoopingScriptMotion } = await import('../entry/src/main/ets/core/motion/LoopingScriptMotion.ts');
const { MotionRegistry } = await import('../entry/src/main/ets/core/motion/MotionRegistry.ts');
const close = (actual, expected, tolerance = 2e-14) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} vs ${expected}`);
const settings = (id, overrides = {}) => Object.assign(new MotionProviderConfiguration(id), overrides);
const resource = (points, name = 'test') => new AxisScriptResource(name, name, 'memory', points.map(([x, y]) => new AxisKeyframe(x, y)));
const curve = (overrides = {}, onSync) => new CustomCurveMotion('L0', settings('Custom Curve', overrides), onSync);

test('source provenance is pinned; these tests are source-led, not an executed C# binary oracle', () => {
  const sources = {
    'AbstractMotionProvider.cs': 'f970c36b3d6ad042c60bb393d9a8e7344c68ce22985d10dced85fa1783209f28',
    'IMotionProviderManager.cs': '609d3a02b8b0dc07304389385c041dbaa063357f686ae56c81da59e7981164cd',
    'ViewModels/PatternMotionProvider.cs': '94db6501d556179b6c6713ce42541dba938d53ee34d79b60f5341358f400c5bf',
    'ViewModels/RandomMotionProvider.cs': '8d2a465883d8cf7559fe225edf20497dce46fc196f8be2db7e24f17278deaf42',
    'ViewModels/CustomCurveMotionProvider.cs': 'fb83c8ae42f9364a49b9528b04be0f847db1fc548d0c6701131d533c3a85ae4d',
    'ViewModels/LoopingScriptMotionProvider.cs': '6b44886577814558b494916579e37e3e6af98f5557185e7e2c3571aa50c2925f'
  };
  for (const [path, hash] of Object.entries(sources)) {
    assert.equal(createHash('sha256').update(readFileSync(new URL('../../Source/MultiFunPlayer/MotionProvider/' + path, import.meta.url))).digest('hex'), hash, path);
  }
});

test('all six patterns follow upstream 4-second formula and sample BEFORE advancing time', () => {
  const expected = {
    triangle: [.5, 0, .5, 1, .5], sine: [.5, 0, .5, 1, .5],
    doubleBounce: [.5, .32322330470336313, .5, .676776695296637, .5],
    sharpBounce: [.4999981041571669, .7126557291396094, .9839950843644806, .9281319398378758, .4999981041571669],
    saw: [0, .25, .5, .75, 0], square: [1, 1, 0, 0, 1]
  };
  for (const [pattern, values] of Object.entries(expected)) {
    const provider = new PatternMotion('L0', settings('Pattern', { pattern }));
    assert.equal(provider.value, 0);
    for (const value of values) { provider.update(1); close(provider.value, value); }
  }
});

test('pattern speed, reversed/equal range, zero delta and long delta retain exact phase semantics', () => {
  const provider = new PatternMotion('L0', settings('Pattern', { pattern: 'saw', speed: 2, minimum: .8, maximum: .2 }));
  provider.update(1); close(provider.value, .8);
  provider.update(0); close(provider.value, .5);
  provider.update(100.5); close(provider.value, .5);
  provider.update(0); close(provider.value, .35); // phase = (2 + 201) % 4 = 3
  provider.configure(settings('Pattern', { pattern: 'square', minimum: .3, maximum: .3 }));
  provider.update(0); close(provider.value, .3);
});

test('Random default speed=.3, samples current phase and does not reseed on parameter changes', () => {
  const provider = new RandomMotion('R0', undefined, undefined, 0n);
  provider.update(1); close(provider.value, .5);
  provider.update(0); close(provider.value, (-.8550724142780401 + 1) / 2);
  provider.configure(settings('Random', { minimum: 1, maximum: 0 }));
  provider.update(0); close(provider.value, 1 - (-.8550724142780401 + 1) / 2);
});

test('configuration changes sync exactly when changed, preserve phase/value, reject invalid DTOs atomically', () => {
  const sync = [];
  const provider = new PatternMotion('L0', undefined, axis => sync.push(axis));
  provider.update(1);
  const changed = settings('Pattern', { pattern: 'saw' });
  provider.configure(changed);
  assert.deepEqual(sync, ['L0']); assert.equal(provider.value, .5);
  changed.speed = 9; // ownership is a deep snapshot
  provider.update(1); assert.equal(provider.value, .25);
  provider.configure(settings('Pattern', { pattern: 'saw' })); assert.equal(sync.length, 1);
  assert.throws(() => provider.configure(settings('Pattern', { speed: NaN })));
  assert.throws(() => provider.configure(settings('Random')));
  provider.update(0); assert.equal(provider.value, .5);
});

test('default curve is constant zero, with linear interpolation, duration 10, loop and sync-on-end enabled', () => {
  const provider = curve();
  assert.deepEqual(provider.getConfiguration(), settings('Custom Curve'));
  for (let i = 0; i < 24; i++) { provider.update(1); assert.equal(provider.value, 0); }
  assert.equal(provider.getTimeSeconds(), 4);
});

test('nonloop curve completes at next tick, emits NaN and sync once, reset restarts without resetting cached value', () => {
  const sync = [];
  const provider = curve({ points: [new MotionCurvePoint(0, 0), new MotionCurvePoint(1, 1)], durationSeconds: 1, isLooping: false }, axis => sync.push(axis));
  provider.update(.5); assert.equal(provider.value, 0);
  provider.update(.5); assert.equal(provider.value, .5);
  provider.update(.1); assert.ok(Number.isNaN(provider.value)); assert.equal(provider.isPlaying(), false);
  assert.equal(provider.getTimeSeconds(), 0); assert.deepEqual(sync, ['L0']);
  provider.update(50); assert.deepEqual(sync, ['L0']);
  provider.reset(); assert.ok(Number.isNaN(provider.value)); provider.update(.25); assert.equal(provider.value, 0);
  provider.reset(true); assert.deepEqual(sync, ['L0', 'L0']);
});

test('syncOnEnd=false stops silently; toggling looping restarts but parameter changes do not reset clock', () => {
  const sync = [];
  const provider = curve({ durationSeconds: 1, isLooping: false, syncOnEnd: false }, axis => sync.push(axis));
  provider.update(10); provider.update(1);
  assert.ok(Number.isNaN(provider.value)); assert.deepEqual(sync, []);
  provider.configure(settings('Custom Curve', { durationSeconds: 1, isLooping: true, syncOnEnd: false }));
  assert.equal(provider.isPlaying(), true); provider.update(.25); assert.equal(provider.getTimeSeconds(), .25);
  const next = provider.getConfiguration(); next.speed = 2; provider.configure(next);
  provider.update(.25); assert.equal(provider.getTimeSeconds(), .75);
});

test('looping curve discards overshoot and tiles across the boundary instead of endpoint holding', () => {
  const provider = curve({ durationSeconds: 4, points: [new MotionCurvePoint(1, 0), new MotionCurvePoint(3, 1)] });
  provider.update(1); close(provider.value, .5);
  provider.update(1); close(provider.value, 0);
  provider.update(100); close(provider.value, .5);
  provider.update(1); close(provider.value, .5); assert.equal(provider.getTimeSeconds(), 1);
});

test('curve boundary collisions retain first inserted keyframe, including preceding tile at time zero', () => {
  const provider = curve({ durationSeconds: 1, points: [new MotionCurvePoint(0, 0), new MotionCurvePoint(1, 1)] });
  for (let i = 0; i < 6; i++) { provider.update(.25); assert.equal(provider.value, 1); }
});

test('empty curve keeps its last output/time; restored points resume and refresh at current time', () => {
  const provider = curve({ durationSeconds: 4, points: [new MotionCurvePoint(1, 0), new MotionCurvePoint(3, 1)] });
  provider.update(2); assert.equal(provider.value, .5);
  provider.configure(settings('Custom Curve', { points: [], durationSeconds: 4 }));
  provider.update(20); assert.equal(provider.value, .5); assert.equal(provider.getTimeSeconds(), 2);
  provider.configure(settings('Custom Curve', { points: [new MotionCurvePoint(0, .7)], durationSeconds: 4 }));
  provider.update(1); assert.equal(provider.value, .7); assert.equal(provider.getTimeSeconds(), 3);
});

test('nonloop endpoint padding holds first/last curve value outside the supplied points', () => {
  const provider = curve({ durationSeconds: 4, isLooping: false, points: [new MotionCurvePoint(1, .2), new MotionCurvePoint(3, .8)] });
  provider.update(1); close(provider.value, .2);
  provider.update(1); close(provider.value, .2);
  provider.update(1); close(provider.value, .5);
  provider.update(.5); close(provider.value, .8);
  provider.update(.5); close(provider.value, .8);
  provider.update(0); assert.ok(Number.isNaN(provider.value));
});

test('looping script starts at first keyframe, uses PCHIP and wraps without emitting terminal endpoint', () => {
  const sync = [];
  const provider = new LoopingScriptMotion('L0', undefined, axis => sync.push(axis));
  provider.setScriptResource(resource([[5, 0], [6, 1]]));
  provider.update(.25); assert.equal(provider.value, 0);
  provider.update(.75); assert.equal(provider.value, .15625);
  provider.update(100); assert.equal(provider.value, 0); assert.equal(provider.getTimeSeconds(), 105);
  provider.update(0); assert.equal(provider.value, 0); assert.equal(provider.getTimeSeconds(), 5);
  assert.deepEqual(sync, ['L0']);
});

test('unloaded, empty and single-keyframe looping resources do not advance or invent output', () => {
  const provider = new LoopingScriptMotion('L0');
  provider.update(1); assert.equal(provider.value, 0);
  provider.setScriptResource(resource([[0, .4], [1, .6]])); provider.update(.5); assert.equal(provider.value, .4);
  provider.setScriptResource(null); provider.update(1); assert.equal(provider.value, .4);
  provider.setScriptResource(resource([])); provider.update(1); assert.equal(provider.value, .4);
  provider.setScriptResource(resource([[7, .9]])); provider.update(1); assert.equal(provider.value, .4); assert.equal(provider.getTimeSeconds(), 7);
});

test('manager cache is per-axis and initially NaN; provider initial zero is copied only on update', () => {
  const manager = new MotionRegistry(['L0', 'R0'], undefined, undefined, () => 0n);
  assert.ok(Number.isNaN(manager.getValue('L0'))); assert.ok(Number.isNaN(manager.getValue('R0')));
  manager.update('L0', 'Pattern', 1); assert.equal(manager.getValue('L0'), .5);
  manager.configureProvider('L0', settings('Pattern', { pattern: 'square' }));
  assert.equal(manager.getValue('L0'), .5, 'configuration change cannot refresh axis cache');
  assert.equal(manager.getProvider('L0', 'Looping Script').value, 0);
  assert.equal(manager.getValue('L0'), .5, 'switching selection without Update reads old provider cache');
  manager.update('L0', 'Looping Script', 1); assert.equal(manager.getValue('L0'), 0);
  manager.update('L0', 'missing', 1); assert.equal(manager.getValue('L0'), 0);
  manager.update('L0', 'Pattern', 0); assert.equal(manager.getValue('L0'), 1);
  assert.ok(Number.isNaN(manager.getValue('R0')));
});

test('providers have independent phase on each axis and switching back resumes its old phase', () => {
  const manager = new MotionRegistry(['L0', 'R0'], undefined, undefined, () => 0n);
  manager.update('L0', 'Pattern', 1); manager.update('R0', 'Pattern', 2);
  manager.update('L0', 'Random', 100); manager.update('L0', 'Pattern', 0);
  assert.equal(manager.getValue('L0'), 0);
  manager.update('R0', 'Pattern', 0); assert.equal(manager.getValue('R0'), .5);
});

test('loaded multi-axis script prefers enabled L0 then first available resource, never loads sourceUri', () => {
  const first = resource([[0, .2], [1, .3]], 'first');
  const stroke = resource([[0, .8], [1, .9]], 'stroke');
  const bindings = [new AxisScriptBinding('R0', first), new AxisScriptBinding('L0', stroke)];
  const enabled = new MotionRegistry(['L0', 'R0'], undefined, undefined, () => 0n);
  enabled.setScriptResources('R0', bindings); enabled.update('R0', 'Looping Script', 0); assert.equal(enabled.getValue('R0'), .8);
  const disabled = new MotionRegistry(['R0'], undefined, undefined, () => 0n);
  disabled.setScriptResources('R0', bindings); disabled.update('R0', 'Looping Script', 0); assert.equal(disabled.getValue('R0'), .2);
  disabled.configureProvider('R0', settings('Looping Script', { sourceUri: 'file:///not-loaded.funscript' }));
  disabled.update('R0', 'Looping Script', 1); assert.equal(disabled.getValue('R0'), .2);
  assert.equal(disabled.getProvider('R0', 'Looping Script').getScriptResource(), null);
});

test('configuration snapshots never contain runtime output, phase, seed, or resources', () => {
  const manager = new MotionRegistry(['L0'], undefined, undefined, () => 123n);
  manager.update('L0', 'Pattern', 1); manager.setScriptResource('L0', resource([[1, .2], [2, .3]]));
  const snapshot = manager.configurationSnapshot('test');
  assert.equal(snapshot.deviceId, 'test'); assert.equal(snapshot.axes[0].providers.length, 4);
  assert.doesNotMatch(JSON.stringify(snapshot), /timeSeconds|seed|resourceId|"value"/);
  snapshot.axes[0].providers.find(p => p.id === 'Pattern').speed = 20;
  assert.equal(manager.getProvider('L0', 'Pattern').getConfiguration().speed, 1);
});

test('large octave values are preserved in storage but explicitly refused by runtime activation, never clamped', () => {
  const excessive = settings('Random', { octaves: 2147483647 });
  assert.equal(MotionConfigurations.clone(excessive).octaves, 2147483647);
  assert.throws(() => new RandomMotion('R0', excessive, undefined, 0n), /activation refused.*runtime budget of 128/);
  const provider = new RandomMotion('R0', undefined, undefined, 0n);
  provider.update(1);
  assert.throws(() => provider.configure(excessive), /stored configuration has not been clamped or changed/);
  assert.equal(provider.getConfiguration().octaves, 1);
  provider.update(0); close(provider.value, (-.8550724142780401 + 1) / 2);
  const boundary = new RandomMotion('R0', settings('Random', { octaves: 128 }), undefined, 0n);
  boundary.update(1); assert.equal(boundary.value, .5);
  assert.throws(() => boundary.configure(settings('Random', { octaves: 129 })), /activation refused/);
});

test('batch runtime rejection is atomic, retains cached values and does not partly apply another provider', () => {
  const manager = new MotionRegistry(['L0'], undefined, undefined, () => 0n);
  manager.update('L0', 'Pattern', 1);
  const configuration = new DeviceMotionConfiguration('test', [new AxisMotionConfiguration('L0', [
    settings('Pattern', { pattern: 'square' }), settings('Random', { octaves: 129 })
  ])]);
  assert.throws(() => manager.configure(configuration), /activation refused/);
  assert.equal(manager.getProvider('L0', 'Pattern').getConfiguration().pattern, 'triangle');
  assert.equal(manager.getValue('L0'), .5);
  assert.equal(configuration.axes[0].providers[1].octaves, 129);
});

test('source property switches do not rebuild curve boundary tiles until points/duration changes', () => {
  const provider = curve({ durationSeconds: 4, isLooping: false,
    points: [new MotionCurvePoint(1, 0), new MotionCurvePoint(3, 1)] });
  provider.update(0); assert.equal(provider.value, 0);
  const changed = provider.getConfiguration(); changed.isLooping = true; provider.configure(changed);
  provider.update(0); assert.equal(provider.value, 0, 'loop toggle does not set upstream refresh flag');
  changed.interpolationMode = 'makima'; provider.configure(changed); provider.update(0);
  assert.equal(provider.value, 0, 'interpolation switch alone also does not refresh padding');
  changed.durationSeconds = 5; provider.configure(changed); provider.update(0);
  assert.ok(provider.value > 0, 'duration change rebuilds looping tiles');
});

test('Makima two-point loop tiles twice for all needed interpolation neighbors', () => {
  const provider = curve({ durationSeconds: 4, interpolationMode: 'makima',
    points: [new MotionCurvePoint(1, 0), new MotionCurvePoint(3, 1)] });
  provider.update(0);
  assert.deepEqual(provider.keyframes.map(point => point.positionSeconds), [-7, -5, -3, -1, 1, 3, 5, 7, 9, 11]);
  close(provider.value, .5);
});

test('Custom Curve retains unsorted/duplicate/negative points and inserts sorted first-wins at runtime', () => {
  const points = [new MotionCurvePoint(2, .8), new MotionCurvePoint(-1, .3), new MotionCurvePoint(2, .9), new MotionCurvePoint(1, .2)];
  const provider = curve({ durationSeconds: 4, isLooping: false, points });
  provider.update(1);
  assert.deepEqual(provider.getConfiguration().points, points);
  assert.deepEqual(provider.keyframes.map(point => [point.positionSeconds, point.value]), [[-1, .3], [0, .8], [1, .2], [2, .8], [4, .2]]);
  close(provider.value, .8);
  provider.update(1); close(provider.value, .2);
  provider.update(1); close(provider.value, .8);
});
