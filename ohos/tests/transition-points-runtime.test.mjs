import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, next) {
  return next(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? specifier + '.ts' : specifier, context);
} });
const { AxisPipeline, AxisPipelineConfiguration, AxisStepInput } = await import('../entry/src/main/ets/core/AxisPipeline.ts');
const { AxisConfiguration, SyncConfiguration, SmartLimitPoint } = await import('../entry/src/main/ets/core/AxisConfiguration.ts');
const { DeviceProfile, DeviceAxisDefinition } = await import('../entry/src/main/ets/core/DeviceProfile.ts');
const { AxisKeyframe, AxisScriptResource, AxisScriptBinding } = await import('../entry/src/main/ets/core/AxisScriptStore.ts');
const { AxisValueProvenance, AXIS_INDEX_INVALID } = await import('../entry/src/main/ets/core/AxisState.ts');
const { MotionProviderConfiguration, MotionCurvePoint } = await import('../entry/src/main/ets/core/MotionConfiguration.ts');
const { MotionRegistry } = await import('../entry/src/main/ets/core/motion/MotionRegistry.ts');

const points = rows => rows.map(row => new MotionCurvePoint(...row));
const value = (frame, name = 'L0') => frame.axisStates.find(state => state.axisName === name);
const provenance = (frame, name = 'L0') => frame.provenance.find(state => state.axisName === name);
function harness(names = ['L0'], providers = null) {
  const profile = new DeviceProfile('runtime', 'runtime', false, 4,
    names.map(name => new DeviceAxisDefinition(name, name, [name], true, .5)));
  const entries = AxisConfiguration.defaultsForProfile(profile), sync = new SyncConfiguration();
  for (const entry of entries) Object.assign(entry.settings, {
    interpolationType: 'linear', autoHomeEnabled: false, selectedMotionProvider: null, updateMotionProviderWithAxis: null
  });
  for (const name of Object.keys(sync)) if (name !== 'durationSeconds') sync[name] = false;
  const configuration = () => new AxisPipelineConfiguration(profile, entries, sync);
  const pipeline = new AxisPipeline(configuration(), providers);
  let bindings = [], time = 0, revision = 0;
  return { pipeline, entries, sync, configuration,
    setting(name = 'L0') { return entries.find(entry => entry.axisName === name).settings; },
    load(name, rows) {
      bindings = bindings.filter(binding => binding.axisName !== name).concat(new AxisScriptBinding(name,
        new AxisScriptResource('script-' + ++revision, name, 'test', rows.map(row => new AxisKeyframe(...row))), null, revision));
    },
    configure() { pipeline.configure(configuration(), bindings); },
    step(position = 0, delta = .1, playing = false) {
      time += delta;
      return pipeline.step(new AxisStepInput(delta, position, playing, 1, 0, time * 1000), configuration(), bindings);
    }
  };
}
function curveRegistry(onSync) {
  const registry = new MotionRegistry(['L0', 'R0'], undefined, onSync);
  return { registry, provider: registry.getProvider('L0', 'Custom Curve') };
}

test('runtime inspection sees immediate binding invalidation without publishing or mutating a frame', () => {
  const h = harness(); h.load('L0', [[0, .1], [4, .8]]);
  const frame = h.step(2), before = h.pipeline.inspectAxisRuntime('L0');
  assert.equal(before.index, 0); assert.equal(before.insideScript, true);
  assert.notEqual(before, frame.axisStates[0]); assert.ok(Object.isFrozen(before));
  assert.throws(() => { before.index = 23; }, TypeError);
  h.load('L0', [[0, .4], [10, .8]]); h.configure();
  const current = h.pipeline.inspectAxisRuntime('L0');
  assert.equal(current.index, AXIS_INDEX_INVALID); assert.equal(current.insideScript, false);
  assert.equal(current.value, before.value); assert.equal(h.pipeline.snapshot(), frame);
  assert.equal(frame.axisStates[0].insideScript, true);
  assert.throws(() => h.pipeline.inspectAxisRuntime('missing'), /Unknown enabled axis/);
});

test('inspect and clear transition commands do not update providers, phase, counters, or last fields', () => {
  const h = harness(); h.pipeline.setTransition('L0', 1, 4);
  const first = h.step(0, 1), state = h.pipeline.inspectAxisRuntime('L0');
  assert.equal(state.value, .625); assert.equal(provenance(first).transitionApplied, true);
  for (let i = 0; i < 10; i++) assert.deepEqual(h.pipeline.inspectAxisRuntime('L0'), state);
  h.pipeline.clearTransitions(); h.pipeline.clearTransitions();
  assert.equal(h.pipeline.snapshot(), first); assert.deepEqual(h.pipeline.inspectAxisRuntime('L0'), state);
  const held = h.step(0, 1);
  assert.equal(value(held).value, .625); assert.ok(Number.isNaN(value(held).transitionValue));
  assert.equal(provenance(held).transitionApplied, false); assert.equal(held.sequence, first.sequence + 1);
  assert.deepEqual(held.events, []);
});

test('pre-first-tick Append retains the extra sentinel second and unbounded final target', () => {
  const h = harness(); const initial = h.pipeline.snapshot();
  h.pipeline.setTransition('L0', 1, 1); h.pipeline.setTransition('L0', 1, 1, true);
  assert.equal(h.pipeline.snapshot(), initial);
  const middle = h.step(0, 1); assert.equal(value(middle).value, 1);
  const end = h.step(0, 2); assert.equal(value(end).value, 2); assert.equal(h.pipeline.getValue('L0'), 1);
  assert.equal(provenance(end).transitionApplied, true); assert.deepEqual(end.events, []);
  const held = h.step(); assert.equal(provenance(held).transitionApplied, false);
  assert.ok(provenance(held).finalSources.includes('transition'));
  const copied = AxisValueProvenance.copy({ ...provenance(end) });
  assert.equal(copied.transitionApplied, true); assert.ok(Object.isFrozen(copied));
});

test('BypassTransition freezes phase; transitions advance on paused wall time when resumed', () => {
  const h = harness(); h.pipeline.setTransition('L0', 1, 4);
  assert.equal(value(h.step(0, 1)).value, .625);
  h.setting().bypassTransition = true; h.configure(); h.pipeline.requestSync(undefined, false);
  const frozen = h.step(0, 20); assert.equal(value(frozen).value, .625);
  assert.equal(provenance(frozen).transitionApplied, false);
  h.setting().bypassTransition = false; h.configure(); h.pipeline.requestSync(undefined, false);
  const resumed = h.step(0, 1); assert.equal(value(resumed).value, .75);
  assert.equal(provenance(resumed).transitionApplied, true);
});

test('computed transition blocked by script or selected motion is never marked applied', () => {
  const h = harness(); h.load('L0', [[0, .2], [10, .4]]); h.step(0);
  h.pipeline.setTransition('L0', 1, 10);
  const blocked = h.step(1); assert.ok(Number.isFinite(value(blocked).transitionValue));
  assert.equal(provenance(blocked).transitionApplied, false);
  h.setting().bypassScript = true; h.configure(); h.pipeline.requestSync(undefined, false);
  assert.equal(provenance(h.step(2)).transitionApplied, true);
  const motion = new MotionRegistry(['L0']), m = harness(['L0'], motion);
  m.setting().selectedMotionProvider = 'Pattern'; m.pipeline.setTransition('L0', 1, 5);
  assert.equal(provenance(m.step()).transitionApplied, false);
});

test('zero speed/Smart factors remove current transition provenance while sync retains a nonzero contribution', () => {
  const h = harness(); h.pipeline.setTransition('L0', .2, 0); h.step();
  h.setting().speedLimitEnabled = true; h.setting().speedLimitUnitsPerSecond = 0;
  h.pipeline.setTransition('L0', 1, 1);
  const capped = h.step(); assert.equal(value(capped).value, .2);
  assert.equal(provenance(capped).transitionApplied, false);
  h.setting().speedLimitEnabled = false; h.pipeline.requestSync();
  assert.equal(provenance(h.step()).transitionApplied, true);
  const smart = harness(['L0', 'R0']); smart.load('R0', [[0, .2], [10, .2]]); smart.step();
  Object.assign(smart.setting(), { smartLimitInputAxis: 'R0', smartLimitTargetValue: .3,
    smartLimitPoints: [new SmartLimitPoint(0, 0), new SmartLimitPoint(100, 0)] });
  smart.pipeline.setTransition('L0', 1, 10);
  assert.equal(provenance(smart.step()).transitionApplied, false);
});

test('AutoHome replacing an actual transition removes current transition contribution', () => {
  const h = harness(); h.pipeline.setTransition('L0', .2, 0); h.step();
  Object.assign(h.setting(), { selectedMotionProvider: 'Pattern', bypassMotionProvider: true,
    autoHomeEnabled: true, autoHomeDelaySeconds: 0, autoHomeDurationSeconds: 0, autoHomeTargetValue: .7 });
  h.configure(); h.pipeline.requestSync(undefined, false); h.pipeline.setTransition('L0', 1, 10);
  const home = h.step(); assert.equal(value(home).value, .7);
  assert.equal(provenance(home).autoHomeApplied, true); assert.equal(provenance(home).transitionApplied, false);
});

test('Points.Set executes scalar sync in duration/interpolation order before point collection reset', () => {
  const observations = []; let registry;
  registry = new MotionRegistry(['L0'], undefined, axis => observations.push(registry.getProvider(axis, 'Custom Curve').getConfiguration()));
  const provider = registry.getProvider('L0', 'Custom Curve');
  registry.update('L0', 'Custom Curve', .25);
  const write = provider.getWriteState(), time = provider.getTimeSeconds();
  const supplied = points([[2, .9], [-1, .1], [2, .4]]);
  const result = registry.setCustomCurvePoints('L0', 4, 'makima', supplied);
  assert.equal(observations.length, 2);
  assert.equal(observations[0].durationSeconds, 4); assert.equal(observations[0].interpolationMode, 'linear');
  assert.deepEqual(observations[0].points, points([[0, 0]]));
  assert.equal(observations[1].interpolationMode, 'makima'); assert.deepEqual(observations[1].points, points([[0, 0]]));
  assert.deepEqual(result.points, supplied); assert.equal(provider.getTimeSeconds(), time);
  assert.equal(provider.getWriteState(), write); assert.equal(provider.value, write.value);
  assert.equal(registry.getValue('L0'), write.value);
  supplied[0].y = 0; result.points[1].y = 1;
  assert.deepEqual(provider.getConfiguration().points, points([[2, .9], [-1, .1], [2, .4]]));
});

test('point-only and identical Points.Set always refresh without sync or phase/cache mutation', () => {
  const sync = [], { registry, provider } = curveRegistry(axis => sync.push(axis));
  registry.setCustomCurvePoints('L0', 10, 'linear', points([[1, 0], [3, 1]]));
  assert.deepEqual(sync, []); registry.update('L0', 'Custom Curve', 0);
  const before = provider.getWriteState(), generation = provider.getConfigurationGeneration();
  registry.setCustomCurvePoints('L0', 10, 'linear', provider.getConfiguration().points);
  assert.deepEqual(sync, []); assert.equal(provider.pendingRefresh, true);
  assert.equal(provider.getWriteState(), before); assert.equal(provider.getConfigurationGeneration(), generation + 1);
  assert.equal(provider.getTimeSeconds(), 0); assert.equal(registry.getValue('L0'), before.value);
});

test('identical collection Reset rebuilds deferred tiles after earlier loop/interpolation switches', () => {
  const { registry, provider } = curveRegistry();
  const configuration = provider.getConfiguration();
  Object.assign(configuration, { durationSeconds: 4, isLooping: false, points: points([[1, 0], [3, 1]]) });
  provider.configure(configuration); registry.update('L0', 'Custom Curve', 0); assert.equal(provider.value, 0);
  configuration.isLooping = true; configuration.interpolationMode = 'makima'; provider.configure(configuration);
  registry.update('L0', 'Custom Curve', 0); assert.equal(provider.value, 0);
  const oldWrite = provider.getWriteState();
  registry.setCustomCurvePoints('L0', 4, 'makima', configuration.points);
  assert.equal(provider.getWriteState(), oldWrite); assert.equal(provider.value, 0);
  registry.update('L0', 'Custom Curve', 0);
  assert.ok(provider.value > 0); assert.equal(provider.getWriteState().writeGeneration, oldWrite.writeGeneration + 1);
});

test('empty collection retains pending refresh, old value, phase and stopped playback state', () => {
  const { registry, provider } = curveRegistry();
  registry.setCustomCurvePoints('L0', 1, 'linear', points([[0, .6]]));
  registry.update('L0', 'Custom Curve', .4);
  const write = provider.getWriteState(), time = provider.getTimeSeconds();
  registry.setCustomCurvePoints('L0', 1, 'linear', []);
  for (let i = 0; i < 3; i++) {
    const observation = registry.update('L0', 'Custom Curve', 100);
    assert.equal(observation.didWrite, false); assert.equal(observation.source, 'retained');
    assert.equal(observation.cachedValue, .6); assert.equal(observation.configurationGeneration, write.configurationGeneration);
    assert.notEqual(observation.currentConfigurationGeneration, observation.configurationGeneration);
    assert.equal(provider.pendingRefresh, true); assert.equal(provider.getTimeSeconds(), time);
  }
  registry.setCustomCurvePoints('L0', 1, 'linear', points([[0, .8]]));
  assert.equal(provider.getTimeSeconds(), time); registry.update('L0', 'Custom Curve', 0); assert.equal(provider.value, .8);
  const stopped = provider.getConfiguration(); stopped.isLooping = false; provider.configure(stopped);
  registry.update('L0', 'Custom Curve', 5); registry.update('L0', 'Custom Curve', 0);
  assert.equal(provider.isPlaying(), false); assert.ok(Number.isNaN(provider.value));
  const terminal = provider.getWriteState(); registry.setCustomCurvePoints('L0', 4, 'pchip', points([[0, .3]]));
  registry.update('L0', 'Custom Curve', 1);
  assert.equal(provider.isPlaying(), false); assert.equal(provider.getTimeSeconds(), 0); assert.equal(provider.getWriteState(), terminal);
});

test('invalid points payloads reject atomically before scalar sync or any provider mutation', () => {
  const sync = [], { registry, provider } = curveRegistry(axis => sync.push(axis));
  registry.update('L0', 'Custom Curve', .5);
  const configuration = provider.getConfiguration(), write = provider.getWriteState(), generation = provider.getConfigurationGeneration();
  for (const [duration, interpolation, payload] of [
    [0, 'linear', []], [61, 'linear', []], [Infinity, 'linear', []], [2, 'bogus', []],
    [2, undefined, []], [2, 'linear', null], [2, 'linear', undefined], [2, 'linear', [[0, .5]]],
    [2, 'linear', points([[NaN, .5]])], [2, 'linear', points([[Infinity, .5]])],
    [2, 'linear', points([[0, 1.01]])], [2, 'linear', Array.from({ length: 4097 }, () => new MotionCurvePoint())]
  ]) {
    assert.throws(() => registry.setCustomCurvePoints('L0', duration, interpolation, payload));
    assert.deepEqual(provider.getConfiguration(), configuration); assert.equal(provider.getWriteState(), write);
    assert.equal(provider.getConfigurationGeneration(), generation); assert.equal(provider.getTimeSeconds(), .5);
    assert.deepEqual(sync, []);
  }
  assert.throws(() => registry.setCustomCurvePoints('missing', 2, 'linear', []), /Unknown motion axis/);
});

test('generic point-only configure reuses collection semantics; same DTO is no event', () => {
  const sync = [], { provider } = curveRegistry(axis => sync.push(axis));
  const configuration = provider.getConfiguration(); configuration.points = points([[0, .3]]);
  provider.configure(configuration); assert.deepEqual(sync, []); assert.equal(provider.pendingRefresh, true);
  provider.update(.5); const generation = provider.getConfigurationGeneration();
  provider.configure(configuration); assert.equal(provider.pendingRefresh, false);
  assert.equal(provider.getConfigurationGeneration(), generation);
  configuration.speed = 2; provider.configure(configuration); assert.deepEqual(sync, ['L0']);
});

test('live configuration generation rejects changed/stale cache without changing historical write identity', () => {
  const { registry, provider } = curveRegistry(), h = harness(['L0'], registry);
  Object.assign(h.setting(), { selectedMotionProvider: 'Custom Curve', updateMotionProviderWhenPaused: true,
    updateMotionProviderWithoutScript: true });
  registry.setCustomCurvePoints('L0', 10, 'linear', points([[0, .6]]));
  const fresh = h.step(); assert.equal(provenance(fresh).motionApplied, true);
  const write = registry.getObservation('L0');
  h.setting().updateMotionProviderWhenPaused = false;
  h.configure(); h.pipeline.requestSync(undefined, false);
  assert.equal(provenance(h.step()).motionCacheValidated, true);
  registry.setCustomCurvePoints('L0', 10, 'linear', points([[0, .6]]));
  const read = registry.getObservation('L0');
  assert.equal(read.source, 'retained'); assert.equal(read.providerWriteGeneration, write.providerWriteGeneration);
  assert.equal(read.configurationGeneration, write.configurationGeneration);
  assert.equal(read.currentConfigurationGeneration, provider.getConfigurationGeneration());
  const stale = h.step(); assert.equal(value(stale).value, .6);
  assert.equal(provenance(stale).motionCacheValidated, false); assert.equal(provenance(stale).status, 'unknown');
  h.setting().updateMotionProviderWhenPaused = true; h.configure(); h.pipeline.requestSync(undefined, false);
  const recovered = h.step(); assert.equal(provenance(recovered).motionSampleProduced, true);
  assert.equal(provenance(recovered).motionCacheValidated, true);
});
