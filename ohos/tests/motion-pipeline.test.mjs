import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? specifier + '.ts' : specifier, context);
} });
const { DeviceProfile, DeviceAxisDefinition } = await import('../entry/src/main/ets/core/DeviceProfile.ts');
const { AxisConfiguration, SyncConfiguration } = await import('../entry/src/main/ets/core/AxisConfiguration.ts');
const { MotionProviderConfiguration, MotionCurvePoint } = await import('../entry/src/main/ets/core/MotionConfiguration.ts');
const { AxisPipeline, AxisPipelineConfiguration, AxisStepInput } = await import('../entry/src/main/ets/core/AxisPipeline.ts');
const { AxisScriptResource, AxisScriptBinding, AxisKeyframe } = await import('../entry/src/main/ets/core/AxisScriptStore.ts');
const { MotionRegistry } = await import('../entry/src/main/ets/core/motion/MotionRegistry.ts');
const state = (frame, axis = 'L0') => frame.axisStates.find(item => item.axisName === axis);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 2e-14, `${actual} vs ${expected}`);

function setup(names = ['L0'], configure = () => {}, syncDuration = 4) {
  const profile = new DeviceProfile('motion-test', 'Motion test', false, 4,
    names.map(name => new DeviceAxisDefinition(name, name, [name], true, .5)));
  const entries = AxisConfiguration.defaultsForProfile(profile);
  const setting = name => entries.find(entry => entry.axisName === name).settings;
  for (const entry of entries) {
    Object.assign(entry.settings, { autoHomeEnabled: false, selectedMotionProvider: null,
      updateMotionProviderWithAxis: null, motionProviderSpeedLimitWithAxis: false, interpolationType: 'linear' });
  }
  const sync = new SyncConfiguration();
  for (const name of Object.keys(sync)) { if (typeof sync[name] === 'boolean') { sync[name] = false; } }
  sync.durationSeconds = syncDuration;
  let pipeline;
  const manager = new MotionRegistry(names, undefined, axis => pipeline?.requestSync([axis]), () => 0n);
  configure(setting, manager, sync);
  const snapshot = () => new AxisPipelineConfiguration(profile, entries, sync);
  pipeline = new AxisPipeline(snapshot(), manager);
  const bindings = [];
  return { manager, pipeline, setting, sync, bindings,
    load(axisName, points) {
      bindings.push(new AxisScriptBinding(axisName, new AxisScriptResource(axisName, axisName, 'memory',
        points.map(([x, y]) => new AxisKeyframe(x, y)))));
    },
    step(position = 0, delta = 1, playing = true, speed = 1) {
      return pipeline.step(new AxisStepInput(delta, position, playing, speed), snapshot(), bindings);
    }
  };
}

test('real manager: paused provider switch reads axis cache without advancing either provider', () => {
  const h = setup(['L0'], setting => Object.assign(setting('L0'), {
    selectedMotionProvider: 'Pattern', updateMotionProviderWithoutScript: true
  }));
  assert.ok(Number.isNaN(state(h.step(0, 1, false)).motionProviderValue));
  close(state(h.step()).motionProviderValue, .5);
  close(state(h.step(0, 100, false)).motionProviderValue, .5);
  h.setting('L0').selectedMotionProvider = 'Random';
  close(state(h.step(0, 100, false)).motionProviderValue, .5);
  assert.equal(h.manager.getProvider('L0', 'Random').value, 0);
  close(state(h.step()).motionProviderValue, .5);
  const noise = state(h.step(0, 0)).motionProviderValue;
  close(noise, (-.8550724142780401 + 1) / 2);
  h.setting('L0').selectedMotionProvider = 'Pattern';
  close(state(h.step(0, 1, false)).motionProviderValue, noise);
  close(state(h.step()).motionProviderValue, 0, 'Pattern resumes at original 1-second phase');
});

test('real manager: without-script, pause and bypass gates preserve phase/cache', () => {
  const h = setup(['L0'], setting => Object.assign(setting('L0'), { selectedMotionProvider: 'Pattern' }));
  assert.ok(Number.isNaN(state(h.step()).motionProviderValue));
  h.setting('L0').updateMotionProviderWithoutScript = true;
  close(state(h.step()).motionProviderValue, .5);
  h.setting('L0').updateMotionProviderWithoutScript = false;
  close(state(h.step(0, 100)).motionProviderValue, .5);
  h.setting('L0').bypassMotionProvider = true;
  assert.ok(Number.isNaN(state(h.step()).motionProviderValue));
  assert.equal(h.manager.getValue('L0'), .5);
  Object.assign(h.setting('L0'), { bypassMotionProvider: false, updateMotionProviderWithoutScript: true, updateMotionProviderWhenPaused: true });
  close(state(h.step(0, 1, false)).motionProviderValue, 0);
});

test('provider speed uses elapsed delta exactly once, independently of media playback speed', () => {
  const h = setup(['L0'], (setting, manager) => {
    Object.assign(setting('L0'), { selectedMotionProvider: 'Pattern', updateMotionProviderWithoutScript: true });
    manager.configureProvider('L0', Object.assign(new MotionProviderConfiguration('Pattern'), { pattern: 'saw' }));
  });
  close(state(h.step(0, 1, true, 4)).motionProviderValue, 0);
  close(state(h.step(4, 1, true, .25)).motionProviderValue, .25);
  close(state(h.step(4.25, 1, true, 2)).motionProviderValue, .5);
  const snapshot = h.pipeline.snapshot();
  for (let i = 0; i < 100; i++) { assert.equal(h.pipeline.snapshot(), snapshot); }
  close(state(h.step(6.25, 0)).motionProviderValue, .75);
});

test('follow-axis gates on PREVIOUS frame dirty and is independent of registry/axis order', () => {
  const run = names => {
    const h = setup(names, setting => Object.assign(setting('R0'), {
      selectedMotionProvider: 'Pattern', updateMotionProviderWithoutScript: true, updateMotionProviderWithAxis: 'L0'
    }));
    h.load('L0', [[0, 0], [10, 1]]);
    const result = [];
    for (const position of [0, 1, 1, 2, 2]) {
      const frame = h.step(position);
      result.push([state(frame, 'L0').isDirty, state(frame, 'R0').motionProviderValue]);
    }
    return result;
  };
  const expected = [[true, NaN], [true, .5], [false, 0], [true, 0], [false, .5]];
  assert.deepEqual(run(['L0', 'R0']), expected);
  assert.deepEqual(run(['R0', 'L0']), expected);
});

test('follow-axis blocks updates while previous frame auto-homes even if its value is dirty', () => {
  const h = setup(['L0', 'R0'], setting => {
    Object.assign(setting('L0'), { autoHomeEnabled: true, autoHomeDelaySeconds: 0, autoHomeDurationSeconds: 2 });
    Object.assign(setting('R0'), { selectedMotionProvider: 'Pattern', updateMotionProviderWithoutScript: true, updateMotionProviderWithAxis: 'L0' });
  });
  h.pipeline.setTransition('L0', 1, 0);
  h.step(0, .25); // L0 first finite transition; R0 skips
  h.step(0, .25); // R0 sees prior dirty and updates Pattern at t=0
  const homeStart = h.step(0, .25); // transition departure previously dirty, now Home can start
  assert.equal(state(homeStart, 'L0').isAutoHoming, true);
  assert.equal(state(homeStart, 'L0').isDirty, true);
  const cached = h.manager.getValue('R0');
  for (let i = 0; i < 8; i++) {
    const frame = h.step(0, .25);
    assert.equal(state(frame, 'L0').isAutoHoming, true);
    close(h.manager.getValue('R0'), cached);
  }
});

test('gap fill forces full motion weight while long moving segments retain ordinary blending', () => {
  const make = points => {
    const h = setup(['L0'], setting => Object.assign(setting('L0'), {
      selectedMotionProvider: 'Pattern', motionProviderBlend: .25, motionProviderFillGaps: true,
      motionProviderMinimumGapDurationSeconds: 5
    }));
    h.load('L0', points); return state(h.step(0));
  };
  close(make([[0, .2], [10, .8]]).motionProviderValue, .275);
  close(make([[0, .2], [10, .2]]).motionProviderValue, .5);
  close(make([[0, .2], [4, .2], [10, .8]]).motionProviderValue, .275);
});

test('Custom Curve nonloop end requests sync inside the SAME pipeline frame', () => {
  const h = setup(['L0'], (setting, manager) => {
    Object.assign(setting('L0'), { selectedMotionProvider: 'Custom Curve', updateMotionProviderWithoutScript: true });
    manager.configureProvider('L0', Object.assign(new MotionProviderConfiguration('Custom Curve'), {
      durationSeconds: 1, isLooping: false, syncOnEnd: true,
      points: [new MotionCurvePoint(0, 0), new MotionCurvePoint(1, 1)]
    }));
  }, 4);
  close(state(h.step(0, .5)).motionProviderValue, 0);
  close(state(h.step(0, .5)).motionProviderValue, .5);
  const ended = state(h.step(0, .1));
  assert.ok(Number.isNaN(ended.motionProviderValue));
  close(ended.syncTimeSeconds, 3.9);
  assert.equal(h.manager.getProvider('L0', 'Custom Curve').isPlaying(), false);
  close(state(h.step(0, .1)).syncTimeSeconds, 3.8);
});

test('Motion parameter sync and Looping resource load preserve manager cache until next allowed update', () => {
  const h = setup(['L0'], setting => Object.assign(setting('L0'), {
    selectedMotionProvider: 'Pattern', updateMotionProviderWithoutScript: true
  }), 4);
  close(state(h.step(0, .1)).motionProviderValue, .5);
  const parameters = new MotionProviderConfiguration('Pattern'); parameters.pattern = 'square';
  h.manager.configureProvider('L0', parameters);
  close(h.manager.getValue('L0'), .5);
  const frame = h.step(0, .1, false);
  close(state(frame).syncTimeSeconds, 3.9);
  close(state(frame).motionProviderValue, .5);
  h.manager.setScriptResource('L0', new AxisScriptResource('loop', 'loop', 'memory', [new AxisKeyframe(5, 1), new AxisKeyframe(6, 0)]));
  close(h.manager.getValue('L0'), .5);
  h.setting('L0').selectedMotionProvider = 'Looping Script';
  close(state(h.step(0, .1, false)).motionProviderValue, .5);
  close(state(h.step(0, .1)).motionProviderValue, 1);
});

test('original extreme-coordinate Random failure latches pipeline fault instead of emitting fabricated noise', () => {
  const h = setup(['L0'], (setting, manager) => {
    Object.assign(setting('L0'), { selectedMotionProvider: 'Random', updateMotionProviderWithoutScript: true });
    manager.configureProvider('L0', Object.assign(new MotionProviderConfiguration('Random'), { speed: 1e20 }));
  });
  const first = h.step(); close(state(first).motionProviderValue, .5);
  assert.throws(() => h.step(), /pipeline fault.*lattice index is out of range/);
  assert.ok(h.pipeline.getFault());
  assert.equal(h.pipeline.snapshot(), first, 'failed tick cannot publish a partial frame');
  assert.throws(() => h.step(), /pipeline is faulted/);
  assert.throws(() => h.pipeline.resetRuntime(1), /new AxisPipeline and provider instances/);
});
