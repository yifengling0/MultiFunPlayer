import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? specifier + '.ts' : specifier, context);
} });
const { MotionProviderConfiguration, MotionCurvePoint } = await import('../entry/src/main/ets/core/MotionConfiguration.ts');
const { AxisScriptResource, AxisKeyframe } = await import('../entry/src/main/ets/core/AxisScriptStore.ts');
const { MotionRegistry } = await import('../entry/src/main/ets/core/motion/MotionRegistry.ts');
const { MotionProviderWriteState, MotionUpdateObservation } = await import('../entry/src/main/ets/core/motion/MotionProvider.ts');

const configuration = (id, values = {}) => Object.assign(new MotionProviderConfiguration(id), values);
const registry = (names = ['L0']) => new MotionRegistry(names, undefined, undefined, () => 0n);
const resource = (id, points) => new AxisScriptResource(id, id, 'memory', points.map(([x, y]) => new AxisKeyframe(x, y)));
const identity = observation => ({ provider: observation.actualProviderId, generation: observation.providerWriteGeneration,
  configuration: observation.configurationGeneration, resource: observation.resourceId, resourceGeneration: observation.resourceGeneration });

test('uninitialized manager NaN and provider default zero carry no sample evidence', () => {
  const manager = registry();
  const initial = manager.getObservation('L0');
  assert.equal(initial.source, 'uninitialized'); assert.equal(initial.didWrite, false);
  assert.equal(initial.actualProviderId, null); assert.ok(Number.isNaN(initial.cachedValue));
  assert.equal(initial.providerWriteGeneration, 0); assert.equal(initial.cacheWriteGeneration, 0);
  const copiedDefault = manager.update('L0', 'Looping Script', 1);
  assert.equal(copiedDefault.cachedValue, 0, 'original manager still copies the initial provider scalar');
  assert.equal(copiedDefault.source, 'uninitialized'); assert.equal(copiedDefault.actualProviderId, 'Looping Script');
  assert.equal(copiedDefault.didWrite, false); assert.equal(copiedDefault.providerWriteGeneration, 0);
  assert.equal(copiedDefault.cacheWriteGeneration, 1);
  assert.equal(manager.getObservation('missing').source, 'unknown');
});

test('all four providers count actual equal-value writes, including zero-delta ticks', () => {
  for (const id of ['Pattern', 'Random', 'Custom Curve', 'Looping Script']) {
    const manager = registry();
    if (id === 'Looping Script') { manager.setScriptResource('L0', resource('flat', [[0, .4], [1, .4]])); }
    const first = manager.update('L0', id, 0);
    const second = manager.update('L0', id, 0);
    assert.equal(second.cachedValue, first.cachedValue, id);
    assert.equal(first.source, 'fresh'); assert.equal(second.source, 'fresh');
    assert.equal(first.didWrite, true); assert.equal(second.didWrite, true);
    assert.equal(first.providerWriteGeneration, 1); assert.equal(second.providerWriteGeneration, 2);
    assert.equal(second.cacheWriteGeneration, 2); assert.equal(second.actualProviderId, id);
    assert.equal(second.configurationGeneration, 1);
  }
});

test('observation reads never repeat a fresh proof, advance counters, or mutate snapshots', () => {
  const manager = registry();
  const write = manager.update('L0', 'Pattern', .5);
  const saved = JSON.stringify(write);
  for (let i = 0; i < 20; i++) {
    const read = manager.getObservation('L0');
    assert.equal(read.didWrite, false); assert.equal(read.source, 'retained');
    assert.equal(read.cacheWriteGeneration, 1); assert.deepEqual(identity(read), identity(write));
    assert.ok(Object.isFrozen(read)); assert.throws(() => { read.source = 'fresh'; }, TypeError);
  }
  manager.update('L0', 'Pattern', .5);
  assert.equal(JSON.stringify(write), saved, 'returned metadata owns an immutable historical snapshot');
});

test('empty and single-point Looping resources do not manufacture writes or resource lineage', () => {
  const manager = registry();
  for (const [id, points] of [['empty', []], ['single', [[9, .9]]]]) {
    manager.setScriptResource('L0', resource(id, points));
    const read = manager.update('L0', 'Looping Script', 100);
    assert.equal(read.source, 'uninitialized'); assert.equal(read.didWrite, false);
    assert.equal(read.providerWriteGeneration, 0); assert.equal(read.resourceId, null);
    assert.equal(read.resourceGeneration, 0); assert.equal(read.configurationGeneration, 0);
  }
  manager.setScriptResource('L0', resource('original', [[2, .3], [3, .9]]));
  const written = manager.update('L0', 'Looping Script', .2);
  assert.equal(written.source, 'fresh'); assert.equal(written.resourceId, 'original');
  assert.equal(written.resourceGeneration, 3);
  manager.setScriptResource('L0', null);
  const absent = manager.update('L0', 'Looping Script', 100);
  assert.equal(absent.source, 'retained'); assert.equal(absent.didWrite, false);
  assert.deepEqual(identity(absent), identity(written)); assert.equal(absent.cachedValue, .3);
  manager.setScriptResource('L0', resource('replacement-single', [[10, .8]]));
  const single = manager.update('L0', 'Looping Script', 100);
  assert.deepEqual(identity(single), identity(written)); assert.equal(single.source, 'retained');
});

test('resource and configuration generations remain those of the last genuine Looping sample', () => {
  const manager = registry();
  manager.setScriptResource('L0', resource('old', [[0, .2], [1, .8]]));
  const old = manager.update('L0', 'Looping Script', .2);
  manager.configureProvider('L0', configuration('Looping Script', { sourceUri: 'file:///new.funscript' }));
  assert.deepEqual(identity(manager.getObservation('L0')), identity(old));
  const retained = manager.update('L0', 'Looping Script', 1);
  assert.deepEqual(identity(retained), identity(old)); assert.equal(retained.source, 'retained');
  manager.setScriptResource('L0', resource('new', [[4, .7], [5, .1]]));
  const fresh = manager.update('L0', 'Looping Script', .2);
  assert.equal(fresh.didWrite, true); assert.equal(fresh.providerWriteGeneration, 2);
  assert.equal(fresh.configurationGeneration, 2); assert.equal(fresh.resourceGeneration, 3);
  assert.equal(fresh.resourceId, 'new'); assert.equal(fresh.cachedValue, .7);
});

test('empty Custom Curve retains old write identity even though manager copies it every update', () => {
  const manager = registry();
  manager.configureProvider('L0', configuration('Custom Curve', { points: [new MotionCurvePoint(0, .6)] }));
  const old = manager.update('L0', 'Custom Curve', 1);
  manager.configureProvider('L0', configuration('Custom Curve', { points: [] }));
  for (let i = 0; i < 3; i++) {
    const observation = manager.update('L0', 'Custom Curve', 100);
    assert.equal(observation.source, 'retained'); assert.equal(observation.didWrite, false);
    assert.deepEqual(identity(observation), identity(old)); assert.equal(observation.cachedValue, .6);
    assert.equal(observation.cacheWriteGeneration, 2 + i);
  }
  assert.equal(manager.getProvider('L0', 'Custom Curve').getTimeSeconds(), 1);
  manager.configureProvider('L0', configuration('Custom Curve', { points: [new MotionCurvePoint(0, .6)] }));
  const restored = manager.update('L0', 'Custom Curve', 0);
  assert.equal(restored.didWrite, true); assert.equal(restored.providerWriteGeneration, 2);
  assert.equal(restored.configurationGeneration, 4); assert.equal(restored.cachedValue, .6);
});

test('Custom Curve nonloop terminal NaN is one real write; stopped ticks and reset are not', () => {
  const manager = registry();
  manager.configureProvider('L0', configuration('Custom Curve', { durationSeconds: 1, isLooping: false }));
  manager.update('L0', 'Custom Curve', 1);
  const terminal = manager.update('L0', 'Custom Curve', .1);
  assert.ok(Number.isNaN(terminal.cachedValue)); assert.equal(terminal.source, 'fresh');
  assert.equal(terminal.didWrite, true); assert.equal(terminal.providerWriteGeneration, 2);
  const stopped = manager.update('L0', 'Custom Curve', 10);
  assert.equal(stopped.source, 'retained'); assert.equal(stopped.didWrite, false);
  assert.equal(stopped.providerWriteGeneration, 2); assert.ok(Number.isNaN(stopped.cachedValue));
  manager.resetCustomCurve('L0', false);
  assert.equal(manager.getObservation('L0').providerWriteGeneration, 2);
  const restarted = manager.update('L0', 'Custom Curve', 0);
  assert.equal(restarted.source, 'fresh'); assert.equal(restarted.providerWriteGeneration, 3);
});

test('cross-provider cache reports the actual copied old provider, never the new selection or previous cache origin', () => {
  const manager = registry();
  const pattern = manager.update('L0', 'Pattern', 1);
  assert.equal(pattern.cachedValue, .5);
  const untouchedLoop = manager.update('L0', 'Looping Script', 1);
  assert.equal(untouchedLoop.actualProviderId, 'Looping Script'); assert.equal(untouchedLoop.cachedValue, 0);
  assert.equal(untouchedLoop.source, 'uninitialized'); assert.equal(untouchedLoop.providerWriteGeneration, 0);
  manager.setScriptResource('L0', resource('loop-old', [[0, .8], [1, .2]]));
  const loop = manager.update('L0', 'Looping Script', .5);
  manager.setScriptResource('L0', null);
  const patternAgain = manager.update('L0', 'Pattern', 0);
  assert.equal(patternAgain.actualProviderId, 'Pattern'); assert.equal(patternAgain.cachedValue, 0);
  const loopAgain = manager.update('L0', 'Looping Script', 1);
  assert.equal(loopAgain.source, 'retained'); assert.equal(loopAgain.didWrite, false);
  assert.deepEqual(identity(loopAgain), identity(loop)); assert.equal(loopAgain.cachedValue, .8);
  assert.equal(loopAgain.cacheWriteGeneration, 5);
});

test('per-axis evidence is isolated; a provider edited/updated outside the registry cannot mint a registry fresh proof', () => {
  const manager = registry(['L0', 'R0']);
  const first = manager.update('L0', 'Pattern', 1);
  manager.getProvider('L0', 'Pattern').update(1);
  assert.deepEqual(identity(manager.getObservation('L0')), identity(first));
  assert.equal(manager.getValue('L0'), .5);
  assert.equal(manager.getObservation('R0').source, 'uninitialized');
  // Looping's externally sampled value can be copied later without an actual
  // sample in this manager call. Pipeline must require its own known origin.
  const loop = manager.getProvider('R0', 'Looping Script');
  loop.setScriptResource(resource('external', [[0, .4], [1, .8]])); loop.update(1); loop.setScriptResource(null);
  const observation = manager.update('R0', 'Looping Script', 1);
  assert.equal(observation.source, 'retained'); assert.equal(observation.didWrite, false);
  assert.equal(observation.providerWriteGeneration, 1); assert.equal(observation.resourceId, 'external');
});

test('unknown provider preserves original numeric cache but invalidates authorization evidence', () => {
  const manager = registry();
  const old = manager.update('L0', 'Pattern', 1);
  const unknown = manager.update('L0', 'does-not-exist', 1);
  assert.equal(unknown.source, 'unknown'); assert.equal(unknown.didWrite, false);
  assert.equal(unknown.cachedValue, old.cachedValue); assert.deepEqual(identity(unknown), identity(old));
  assert.equal(unknown.cacheWriteGeneration, old.cacheWriteGeneration);
  assert.equal(manager.getObservation('L0').source, 'unknown');
  const restored = manager.update('L0', 'Pattern', 0);
  assert.equal(restored.source, 'fresh'); assert.equal(restored.providerWriteGeneration, 2);
});

test('provider exception before or after writing cannot turn a retained manager value into fresh evidence', () => {
  const manager = registry();
  manager.configureProvider('L0', configuration('Random', { speed: 1e20 }));
  const random = manager.update('L0', 'Random', 1);
  assert.throws(() => manager.update('L0', 'Random', 1), /IndexOutOfRangeException/);
  assert.equal(manager.getValue('L0'), random.cachedValue);
  assert.equal(manager.getObservation('L0').source, 'unknown');
  const pattern = manager.getProvider('L0', 'Pattern');
  const update = pattern.update.bind(pattern);
  pattern.update = delta => { update(delta); throw new Error('after-write failure'); };
  assert.throws(() => manager.update('L0', 'Pattern', 1), /after-write/);
  assert.equal(pattern.getWriteState().writeGeneration, 1, 'provider really wrote before failing');
  const observation = manager.getObservation('L0');
  assert.equal(observation.source, 'unknown'); assert.equal(observation.actualProviderId, 'Random');
  assert.equal(observation.cachedValue, random.cachedValue); assert.equal(observation.cacheWriteGeneration, 1);
});

test('missing, throwing or contradictory proof fails closed without changing numerical update semantics', () => {
  for (const badProof of [() => undefined, () => { throw new Error('unavailable proof'); }]) {
    const manager = registry();
    manager.getProvider('L0', 'Pattern').getWriteState = badProof;
    const observation = manager.update('L0', 'Pattern', 1);
    assert.equal(observation.source, 'unknown'); assert.equal(observation.didWrite, false);
    assert.equal(observation.cachedValue, .5); assert.equal(manager.getValue('L0'), .5);
  }
  const manager = registry();
  manager.update('L0', 'Looping Script', 1);
  manager.getProvider('L0', 'Looping Script').outputValue = .9;
  const contradictory = manager.update('L0', 'Looping Script', 1);
  assert.equal(contradictory.cachedValue, .9); assert.equal(contradictory.source, 'unknown');
});

test('generation exhaustion is unknown, never a reused fresh identity or a numeric behavior change', () => {
  const manager = registry();
  const provider = manager.getProvider('L0', 'Pattern');
  provider.writeGeneration = Number.MAX_SAFE_INTEGER;
  const exhausted = manager.update('L0', 'Pattern', 1);
  assert.equal(exhausted.source, 'unknown'); assert.equal(exhausted.didWrite, false);
  assert.equal(exhausted.cachedValue, .5);
  const cache = registry();
  cache.observations.set('L0', new MotionUpdateObservation(false, null, 0, Number.MAX_SAFE_INTEGER, NaN, 'uninitialized'));
  const full = cache.update('L0', 'Pattern', 1);
  assert.equal(full.source, 'unknown'); assert.equal(full.didWrite, false); assert.equal(full.cachedValue, .5);
});

test('regressing or reused write identities cannot relabel old values as proven samples', () => {
  for (const mutation of [
    state => new MotionProviderWriteState(state.value, state.writeGeneration - 1, state.configurationGeneration, 1, 'old', true),
    state => new MotionProviderWriteState(state.value, state.writeGeneration, state.configurationGeneration + 1, 1, 'old', true),
    state => new MotionProviderWriteState(state.value, state.writeGeneration, state.configurationGeneration, 2, 'new', true)
  ]) {
    const manager = registry();
    manager.setScriptResource('L0', resource('old', [[0, .4], [1, .4]]));
    manager.update('L0', 'Looping Script', 0); manager.update('L0', 'Looping Script', 0);
    manager.setScriptResource('L0', null);
    const provider = manager.getProvider('L0', 'Looping Script');
    const old = provider.getWriteState();
    let reads = 0;
    provider.getWriteState = () => ++reads === 1 ? old : mutation(old);
    const contradictory = manager.update('L0', 'Looping Script', 1);
    assert.equal(contradictory.cachedValue, .4); assert.equal(contradictory.source, 'unknown');
    assert.equal(contradictory.didWrite, false);
  }
});
