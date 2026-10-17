import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s, c, next) { return next(s.startsWith('.') && !/\.[a-z]+$/i.test(s) ? s + '.ts' : s, c); } });
const { PlaybackSessionCore } = await import('../entry/src/main/ets/core/PlaybackSessionCore.ts');
const { SettingsSchema } = await import('../entry/src/main/ets/settings/SettingsSchema.ts');
const { FunscriptParser } = await import('../entry/src/main/ets/core/Funscript.ts');
const { MediaClock } = await import('../entry/src/main/ets/core/MediaClock.ts');
const { AxisPipeline, AxisPipelineConfiguration, AxisStepInput } = await import('../entry/src/main/ets/core/AxisPipeline.ts');
const { MotionRegistry } = await import('../entry/src/main/ets/core/motion/MotionRegistry.ts');
const { OutputCoordinator, OutputEndpoint } = await import('../entry/src/main/ets/output/OutputCoordinator.ts');
const { OutputSettingsModel } = await import('../entry/src/main/ets/output/OutputSettingsModel.ts');
const { MemoryTransport } = await import('../entry/src/main/ets/output/MemoryTransport.ts');

const document = () => FunscriptParser.parse('{"actions":[{"at":0,"pos":10},{"at":10000,"pos":90}]}');
function configuration(edit = () => {}) {
  const config = SettingsSchema.defaults();
  for (const key of Object.keys(config.sync)) { if (key.startsWith('sync')) config.sync[key] = false; }
  config.sync.durationSeconds = .5;
  const axes = config.axisSettingsByDevice.find(device => device.deviceId === config.selectedDeviceId).axes;
  for (const entry of axes) Object.assign(entry.settings, {
    autoHomeEnabled: false, selectedMotionProvider: null, updateMotionProviderWithAxis: null,
    motionProviderSpeedLimitWithAxis: false
  });
  const axis = axes.find(entry => entry.axisName === 'L0').settings;
  Object.assign(axis, { selectedMotionProvider: 'Pattern', motionProviderBlend: 1,
    updateMotionProviderWhenPaused: true, updateMotionProviderWithoutScript: true });
  edit(axis, config);
  return config;
}
function session(edit) {
  const value = new PlaybackSessionCore(configuration(edit)); value.setConnected(true); return value;
}
const source = (value, axes = ['L0']) => value.dispatchSource(axes);
const provenance = value => value.frame().provenance.find(axis => axis.axisName === 'L0');
const axisState = value => value.frame().axisStates.find(axis => axis.axisName === 'L0');
function start(value) { value.startStandaloneMotion(); value.tick(40); return value; }

test('cold settings and generic pause cannot admit standalone Motion; explicit start waits for its own complete frame', () => {
  const s = session(); const saved = SettingsSchema.encode(s.configurationSnapshot());
  s.tick(40); s.pause(); s.tick(40);
  assert.equal(source(s).availability, 'invalidated');
  assert.equal(s.isStandaloneMotionActive(), false);
  const old = s.frame(); s.startStandaloneMotion();
  assert.equal(source(s).authorization, null); assert.equal(s.frame(), old);
  s.tick(40);
  assert.equal(s.isStandaloneMotionActive(), true); assert.equal(s.snapshot().state, 'paused');
  assert.ok(Number.isNaN(s.mediaPositionSeconds())); assert.ok(Number.isNaN(s.frame().mediaPositionMs));
  assert.deepEqual(source(s).authorization.intents, ['pausedMotion']);
  assert.equal(source(s).authorization.clockKind, 'monotonic');
  assert.equal(source(s).authorization.observedMonotonicMs, s.frame().monotonicMs);
  assert.equal(s.snapshot().safetyGateOpen, false); assert.deepEqual(s.snapshot().outputs, []);
  const frame = s.frame(); for (let i = 0; i < 10; i++) { source(s); s.standaloneMotionAxes(); }
  assert.equal(s.frame(), frame); assert.equal(SettingsSchema.encode(s.configurationSnapshot()), saved);
});

test('standalone requires both upstream pause/no-script flags, a selected provider, and an enabled non-bypassed axis', () => {
  for (const paused of [false, true]) for (const without of [false, true]) {
    const s = session(a => { a.updateMotionProviderWhenPaused = paused; a.updateMotionProviderWithoutScript = without; });
    if (paused && without) { start(s); assert.ok(source(s).authorization); }
    else { assert.throws(() => s.startStandaloneMotion()); s.tick(40); assert.equal(source(s).authorization, null); }
  }
  for (const edit of [a => { a.selectedMotionProvider = null; }, a => { a.bypassMotionProvider = true; }]) {
    const s = session(edit); assert.deepEqual(s.standaloneMotionAxes(), []); assert.throws(() => s.startStandaloneMotion());
  }
  const disabled = session((a, config) => {
    a.selectedMotionProvider = null;
    const axis = config.axisSettingsByDevice.find(device => device.deviceId === config.selectedDeviceId).axes.find(entry => entry.axisName === 'V0').settings;
    Object.assign(axis, { selectedMotionProvider: 'Pattern', updateMotionProviderWhenPaused: true, updateMotionProviderWithoutScript: true });
  });
  assert.deepEqual(disabled.standaloneMotionAxes(), []); assert.throws(() => disabled.startStandaloneMotion());
});

test('standalone rejects a live media mode, disconnected/background state, and fault without silently switching sources', () => {
  for (const prepare of [s => s.load(document()), s => s.useExternalClock(true), s => s.useInternalSource(),
    s => s.setConnected(false), s => s.setForeground(false), s => s.tick(-1)]) {
    const s = session(); prepare(s); const saved = SettingsSchema.encode(s.configurationSnapshot());
    assert.throws(() => s.startStandaloneMotion()); assert.equal(s.isStandaloneMotionActive(), false);
    assert.equal(SettingsSchema.encode(s.configurationSnapshot()), saved);
  }
});

test('Stop, background, and disconnect revoke processing even after generic pause and later ticks; each needs explicit restart', () => {
  for (const interrupt of [s => s.stop(), s => { s.setForeground(false); s.setForeground(true); },
    s => { s.setConnected(false); s.setConnected(true); }]) {
    const s = start(session()); const old = source(s); interrupt(s);
    s.pause(); s.tick(40); assert.equal(source(s).availability, 'invalidated'); assert.equal(s.isStandaloneMotionActive(), false);
    s.startStandaloneMotion(); assert.equal(source(s).authorization, null); s.tick(40);
    assert.ok(source(s).authorization); assert.ok(source(s).frame.epoch > old.frame.epoch);
  }
});

test('Pattern, Random, and Custom Curve require a genuinely produced paused sample; idle follow-axis does not inherit permission', () => {
  for (const provider of ['Pattern', 'Random', 'Custom Curve']) {
    const s = start(session(a => { a.selectedMotionProvider = provider; }));
    assert.equal(provenance(s).motionSampleProduced, true); assert.equal(provenance(s).motionApplied, true);
    assert.deepEqual(source(s).authorization.intents, ['pausedMotion']);
  }
  const follows = start(session(a => { a.updateMotionProviderWithAxis = 'R0'; }));
  assert.equal(provenance(follows).motionUpdated, false); assert.equal(source(follows).authorization, null);
});

test('Looping missing, one-point, and cleared resources cannot promote retained values to fresh paused Motion', () => {
  const s = start(session(a => { a.selectedMotionProvider = 'Looping Script'; }));
  assert.equal(provenance(s).motionUpdated, true); assert.equal(provenance(s).motionSampleProduced, false);
  assert.equal(source(s).authorization, null);
  s.setLoopingScript('L0', document(), 'memory://loop'); assert.equal(source(s).authorization, null);
  for (let i = 0; i < 15; i++) s.tick(40);
  assert.ok(source(s).authorization); const value = axisState(s).motionProviderValue;
  s.setLoopingScript('L0', null, ''); s.tick(40);
  assert.equal(axisState(s).motionProviderValue, value); assert.equal(provenance(s).motionSampleProduced, false);
  assert.equal(source(s).authorization, null);
  s.setLoopingScript('L0', FunscriptParser.parse('{"actions":[{"at":0,"pos":90}]}'), 'memory://one-point'); s.tick(40);
  assert.equal(provenance(s).motionSampleProduced, false); assert.equal(source(s).authorization, null);
});

test('empty or completed Custom Curve updates cannot authorize a cached final scalar', () => {
  const empty = session(a => { a.selectedMotionProvider = 'Custom Curve'; });
  const emptyConfig = empty.getMotionConfiguration('L0', 'Custom Curve'); emptyConfig.points = [];
  empty.changeMotionConfiguration('L0', emptyConfig); start(empty);
  assert.equal(provenance(empty).motionSampleProduced, false); assert.equal(source(empty).authorization, null);
  const ended = session(a => { a.selectedMotionProvider = 'Custom Curve'; });
  const config = ended.getMotionConfiguration('L0', 'Custom Curve');
  Object.assign(config, { points: [{ x: 0, y: .2 }, { x: .1, y: .8 }], durationSeconds: .1, isLooping: false });
  ended.changeMotionConfiguration('L0', config); ended.startStandaloneMotion(); ended.tick(100);
  assert.ok(source(ended).authorization); ended.tick(100); ended.tick(100);
  assert.equal(provenance(ended).motionSampleProduced, false); assert.equal(source(ended).authorization, null);
});

test('standalone authorization covers only the exact enabled target scope, never defaults for other axes', () => {
  const s = start(session()); assert.deepEqual(source(s).authorization.authorizedAxes, ['L0']);
  for (const axes of [[], ['L0', 'L0'], ['V0'], ['unknown'], ['R0'], ['L0', 'R0']]) {
    assert.equal(source(s, axes).authorization, null);
  }
  assert.equal(s.dispatchSource().authorization, null);
});

function preparedNative() {
  const s = session(); s.useExternalClock(true);
  const clock = new MediaClock(); const generation = clock.reset('loading');
  clock.prepared(generation, 10000, 0, 0); s.acceptNativeSnapshot(clock.snapshot());
  return { s, clock, generation };
}
test('explicit native open preserves paused processing through its first generation without inventing Play', () => {
  const { s } = preparedNative(); assert.equal(source(s).authorization, null); s.tick(40);
  assert.equal(s.snapshot().state, 'paused'); assert.deepEqual(source(s).authorization.intents, ['pausedMotion']);
  assert.equal(source(s).authorization.clockKind, 'monotonic'); assert.equal(s.snapshot().safetyGateOpen, false);
});

test('Stop revokes native admission before first ready and across late same/new generation observations', () => {
  for (const beforeFirstReady of [false, true]) for (const newGeneration of [false, true]) {
    const s = session(); s.useExternalClock(true); const clock = new MediaClock(); let generation = clock.reset('loading');
    if (!beforeFirstReady) { clock.prepared(generation, 10000, 0, 0); s.acceptNativeSnapshot(clock.snapshot()); s.tick(40); }
    s.stop();
    if (newGeneration) generation = clock.reset('loading');
    clock.prepared(generation, 10000, 200, 80); s.acceptNativeSnapshot(clock.snapshot());
    s.pause(); s.tick(40, 120); assert.equal(source(s).availability, 'invalidated');
    clock.requestPlay(); clock.stateChanged(generation, 'playing'); s.acceptNativeSnapshot(clock.snapshot()); s.tick(40, 160);
    assert.equal(source(s).authorization, null); assert.equal(s.snapshot().safetyGateOpen, false);
  }
});

test('Internal observations cannot reopen Stop; an explicit Internal Play admits the next completed source frame', () => {
  const s = session(); s.useInternalSource(); assert.equal(s.admitInternalPlay(), false);
  s.beginInternalResource('memory://internal'); const doc = document();
  s.loadInternalBindings(doc, s.resources(doc, 'memory://internal', 'Internal'));
  s.acceptInternalPosition(0); s.acceptInternalPlaying(false); s.tick(40);
  assert.ok(source(s).authorization); s.stop();
  s.acceptInternalPosition(1); s.acceptInternalPlaying(true); s.tick(40);
  assert.equal(source(s).authorization, null); assert.equal(s.snapshot().safetyGateOpen, false);
  s.acceptInternalPlaying(false); s.pause(); s.tick(40); assert.equal(source(s).authorization, null);
  assert.equal(s.admitInternalPlay(), true); s.acceptInternalPlaying(true);
  assert.equal(source(s).authorization, null); s.tick(40);
  assert.deepEqual(source(s).authorization.intents, ['activePlayback']);
});

test('ordinary media pause keeps legitimate delayed Home processing while Stop and generic pause revoke it', () => {
  const s = session(a => { a.selectedMotionProvider = null; a.autoHomeEnabled = true; a.autoHomeDelaySeconds = .1; a.autoHomeDurationSeconds = 1; });
  s.load(document()); s.play(); s.tick(40); s.pause(); s.tick(100);
  assert.equal(source(s).authorization, null); s.tick(100);
  assert.deepEqual(source(s).authorization.intents, ['pausedAutoHome']);
  s.stop(); s.pause(); s.tick(100); assert.equal(source(s).authorization, null);
});

test('full runtime rebuild preserves every stored setting, discards phase/resources and history, and never applies a pending profile', () => {
  const s = session(a => { a.selectedMotionProvider = 'Looping Script'; });
  const provider = s.getMotionConfiguration('L0', 'Looping Script'); provider.sourceUri = 'file:///Download/loop.funscript';
  s.changeMotionConfiguration('L0', provider); s.setLoopingScript('L0', document(), provider.sourceUri); start(s); s.tick(100);
  s.selectProfile('TCode-0.2'); const saved = SettingsSchema.encode(s.configurationSnapshot());
  const registry = s.activeRegistry(); const frame = s.frame();
  s.resetRuntime();
  assert.equal(SettingsSchema.encode(s.configurationSnapshot()), saved); assert.equal(s.hasPendingProfileChanges(), true);
  assert.equal(s.activeRegistry().profile.id, registry.profile.id); assert.notEqual(s.activeRegistry(), registry);
  assert.ok(s.activeRegistry().revision > registry.revision); assert.ok(s.frame().epoch > frame.epoch);
  assert.equal(s.snapshot().state, 'stopped'); assert.equal(s.isStandaloneMotionActive(), false);
  assert.ok(Number.isNaN(s.mediaPositionSeconds())); assert.equal(s.mediaDurationSeconds(), 0);
  assert.ok(s.bindings().every(binding => binding.resource === null)); assert.ok(s.previewSamples().every(sample => Number.isNaN(sample.position)));
  s.pause(); s.tick(40); assert.equal(source(s).authorization, null);
  s.startStandaloneMotion(); s.tick(40);
  assert.equal(provenance(s).motionSampleProduced, false); assert.equal(source(s).authorization, null, 'saved URI cannot restore an actual resource');
});

test('fault recovery is explicit, clears native/source modes, and a rebuilt Pattern restarts its original phase', () => {
  const s = start(session()); const initial = axisState(s).motionProviderValue; s.tick(200);
  assert.notEqual(axisState(s).motionProviderValue, initial); s.tick(-1);
  assert.ok(s.fault()); assert.throws(() => s.startStandaloneMotion()); const saved = SettingsSchema.encode(s.configurationSnapshot());
  s.recoverFault(); assert.equal(s.fault(), ''); assert.equal(SettingsSchema.encode(s.configurationSnapshot()), saved);
  s.pause(); s.tick(40); assert.equal(source(s).authorization, null);
  s.resetRuntime(); start(s); assert.equal(axisState(s).motionProviderValue, initial);
  const { s: native } = preparedNative(); native.resetRuntime(); start(native); assert.ok(source(native).authorization);
});

const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
class VirtualTime {
  constructor(now) { this.now = now; this.id = 0; this.tasks = new Map(); }
  nowMs() { return this.now; }
  scheduleAt(at, run) { this.tasks.set(++this.id, { at, run }); return this.id; }
  cancel(id) { this.tasks.delete(id); }
  async advance(ms) {
    const target = this.now + ms;
    while (true) {
      const next = [...this.tasks].filter(([, task]) => task.at <= target).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      this.now = next[1].at; this.tasks.delete(next[0]); next[1].run(); await settle();
    }
    this.now = target; await settle();
  }
}
function outputHarness(s, allowPausedMotion = true) {
  const clock = new VirtualTime(s.frame().monotonicMs); const transport = new MemoryTransport(clock);
  const coordinator = new OutputCoordinator({ inspect() { return { available: true, diagnostic: 'memory only' }; }, create() { return transport; } },
    s, { maximumFrameAgeMs: 200, maximumClockAgeMs: 200, maximumEventAgeMs: 100,
      maximumFixedElapsedMs: 1000, writeTimeoutMs: 100, maximumPolledQueueLength: 4, allowZeroInterval: true }, clock, clock);
  const model = new OutputSettingsModel(); model.dirtyOnly = false; model.pausedMotion = allowPausedMotion;
  model.ranges = s.activeRegistry().axes.map(axis => ({ axisId: axis.name, minimum: 0, maximum: 1, enabled: axis.name === 'L0' }));
  const config = { ...model.config({ precision: 4, revision: s.activeRegistry().revision,
    axisOrder: s.activeRegistry().axes.map(axis => axis.name), maximumDurationMs: 10000, maximumPayloadBytes: 1024 }), kind: 'memory' };
  return { clock, transport, coordinator, config };
}

test('NaN-media standalone writes require target pausedMotion permission and a separate explicit Arm', async () => {
  for (const allowed of [false, true]) {
    const s = start(session()); const h = outputHarness(s, allowed); const c = h.coordinator;
    try {
      assert.equal(await c.connect(h.config, new OutputEndpoint()), true); c.refresh(); await h.clock.advance(10);
      assert.equal(c.status().armed, false); assert.equal(h.transport.writeRecords().length, 0);
      assert.equal(c.arm(), true); c.refresh(); await h.clock.advance(10);
      assert.equal(h.transport.writeRecords().length > 0, allowed);
      if (allowed) {
        s.stop(); c.refresh(); assert.equal(c.status().armed, false); const writes = h.transport.writeRecords().length;
        s.startStandaloneMotion(); s.tick(20, h.clock.now); c.refresh(); await h.clock.advance(10);
        assert.equal(c.status().armed, false); assert.equal(h.transport.writeRecords().length, writes);
        assert.equal(c.arm(), true); c.refresh(); await h.clock.advance(10); assert.ok(h.transport.writeRecords().length > writes);
      }
    } finally { await c.dispose(); }
  }
});

test('runtime rebuild disarms an attached target, clears queued candidates, and late receipts cannot restore old output', async () => {
  const s = start(session()); const h = outputHarness(s); const c = h.coordinator;
  try {
    await c.connect(h.config, new OutputEndpoint()); assert.equal(c.arm(), true);
    h.transport.planWrite({ kind: 'defer' }); c.refresh(); await h.clock.advance(10); await h.clock.advance(10);
    assert.equal(c.status().pendingFixed, true); s.resetRuntime(); c.refresh();
    assert.equal(c.status().armed, false); assert.equal(c.status().pendingFixed, false); assert.equal(c.status().queuedEvents, 0);
    h.transport.resolveNextWrite(); await settle();
    assert.equal(h.transport.writeRecords().length, 1); assert.deepEqual(c.status().lastWritten, []);
    assert.equal(c.status().completedLocalWrites, 0);
    s.startStandaloneMotion(); s.tick(20, h.clock.now); c.refresh();
    assert.equal(c.arm(), false, 'old target profile revision must be applied again after rebuilding');
    await h.clock.advance(10); assert.equal(h.transport.writeRecords().length, 1);
  } finally { await c.dispose(); }
});

for (const provider of ['Pattern', 'Custom Curve', 'Looping Script']) {
  test(`standalone ${provider} matches the direct paused/NaN AxisPipeline numeric path`, () => {
    const config = configuration(a => { a.selectedMotionProvider = provider; });
    const s = new PlaybackSessionCore(config); s.setConnected(true);
    if (provider === 'Custom Curve') {
      const parameters = s.getMotionConfiguration('L0', provider);
      Object.assign(parameters, { points: [{ x: 0, y: .2 }, { x: 1, y: .8 }], durationSeconds: 1, isLooping: true });
      s.changeMotionConfiguration('L0', parameters);
    }
    if (provider === 'Looping Script') s.setLoopingScript('L0', document(), 'memory://numeric-loop');
    const saved = s.configurationSnapshot(); const registry = s.activeRegistry();
    const axes = saved.axisSettingsByDevice.find(device => device.deviceId === registry.profile.id).axes;
    const motion = config.motionSettingsByDevice.find(device => device.deviceId === registry.profile.id);
    let pipeline;
    const manager = new MotionRegistry(registry.axes.map(axis => axis.name), motion, axis => pipeline?.requestSync([axis]));
    const directConfig = new AxisPipelineConfiguration(registry.profile, axes, saved.sync, saved.globalOffsetSeconds, registry.revision);
    pipeline = new AxisPipeline(directConfig, manager, 0);
    if (provider === 'Custom Curve') manager.configureProvider('L0', s.getMotionConfiguration('L0', provider));
    if (provider === 'Looping Script') manager.setScriptResources('L0', s.resources(document(), 'memory://numeric-loop', 'memory://numeric-loop'));
    s.startStandaloneMotion();
    let now = 0;
    for (const elapsed of [40, 160, 80, 400, 100, 400, 60]) {
      now += elapsed; s.tick(elapsed, now);
      const direct = pipeline.step(new AxisStepInput(elapsed / 1000, NaN, false, 1, 0, now, registry.revision), directConfig, []);
      const actual = axisState(s); const expected = direct.axisStates.find(axis => axis.axisName === 'L0');
      for (const field of ['value', 'motionProviderValue', 'scriptValue', 'isDirty', 'isAutoHoming']) assert.equal(actual[field], expected[field], field);
      assert.ok(Number.isNaN(s.frame().mediaPositionMs)); assert.equal(s.frame().isPlaying, false);
    }
  });
}
