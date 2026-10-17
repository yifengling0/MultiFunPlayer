import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s, c, next) { return next(s.startsWith('.') && !/\.[a-z]+$/i.test(s) ? s + '.ts' : s, c); } });
const { PlaybackSessionCore } = await import('../entry/src/main/ets/core/PlaybackSessionCore.ts');
const { SettingsSchema } = await import('../entry/src/main/ets/settings/SettingsSchema.ts');
const { FunscriptParser } = await import('../entry/src/main/ets/core/Funscript.ts');
const { MediaClock } = await import('../entry/src/main/ets/core/MediaClock.ts');
const document = () => FunscriptParser.parse('{"actions":[{"at":0,"pos":10},{"at":10000,"pos":90}]}');
function configuration(edit = () => {}) {
  const config = SettingsSchema.defaults();
  for (const key of Object.keys(config.sync)) { if (key.startsWith('sync')) config.sync[key] = false; }
  config.sync.durationSeconds = .5;
  const axis = config.axisSettingsByDevice.find(d => d.deviceId === config.selectedDeviceId).axes.find(a => a.axisName === 'L0').settings;
  axis.autoHomeEnabled = false; edit(axis, config); return config;
}
function session(edit) {
  const value = new PlaybackSessionCore(configuration(edit)); value.setConnected(true); value.load(document()); value.play(); return value;
}
const source = s => s.dispatchSource(['L0']);
function step(s, count = 1, elapsed = 40) { for (let i = 0; i < count; i++) s.tick(elapsed); }
function native(edit) {
  const s = session(edit); s.useExternalClock(true);
  const clock = new MediaClock(); const generation = clock.reset('loading');
  clock.prepared(generation, 20000, 1000, 100); s.acceptNativeSnapshot(clock.snapshot()); s.play();
  clock.requestPlay(); clock.stateChanged(generation, 'playing'); s.acceptNativeSnapshot(clock.snapshot());
  return { s, clock, generation };
}

test('target scope projects real axes/events and authorizes only the completed internal media step', () => {
  const s = session(); assert.equal(source(s).authorization, null); step(s);
  const frame = s.frame(); const a = source(s);
  assert.deepEqual(a.authorization.authorizedAxes, ['L0']); assert.deepEqual(a.authorization.intents, ['activePlayback']);
  assert.equal(a.authorization.clockKind, 'media'); assert.equal(a.authorization.observedMonotonicMs, 40);
  assert.equal(a.frame.sequence, frame.sequence); assert.equal(a.frame.axisStates[0], frame.axisStates[0]);
  assert.equal(a.frame.events[0], frame.events[0]); assert.deepEqual(a.frame.axisStates.map(v => v.axisName), ['L0']);
  assert.equal(s.dispatchSource().authorization, null, 'unconfigured NaN axes are not given a finite fallback');
  for (let i = 0; i < 10; i++) source(s);
  assert.equal(s.frame(), frame); assert.throws(() => a.authorization.authorizedAxes.push('R0'));
});

test('empty, duplicate, unknown and disabled runtime scopes cannot authorize', () => {
  const s = session(); step(s);
  for (const scope of [[], ['L0', 'L0'], ['bogus'], ['L1']]) assert.equal(s.dispatchSource(scope).authorization, null);
});

test('native authorization captures the actual observation used by the step, never watchdog/newer snapshot time', () => {
  const { s, clock, generation } = native(); s.tick(100, 200);
  assert.equal(source(s).authorization.observedMonotonicMs, 100);
  clock.observe(generation, 1100, 220); s.acceptNativeSnapshot(clock.snapshot());
  assert.equal(source(s).authorization.observedMonotonicMs, 100);
  s.tick(40, 240); assert.equal(source(s).authorization.observedMonotonicMs, 220);
  s.acceptNativeSnapshot(clock.snapshot()); assert.equal(source(s).authorization.observedMonotonicMs, 220);
  s.tick(40, 1000); assert.equal(source(s).authorization, null);
});

test('source replacement, seek and stop never relabel the preceding authorized frame', () => {
  const s = session(); step(s); const old = source(s);
  s.load(document()); s.play(); assert.equal(source(s).authorization, null);
  step(s, 20); assert.ok(source(s).authorization); assert.ok(source(s).frame.epoch > old.frame.epoch);
  s.seek(3000); s.play(); assert.equal(source(s).authorization, null);
  step(s, 20); s.stop(); assert.equal(source(s).availability, 'invalidated');
});

test('pause then play before a tick still waits for a newly committed control frame', () => {
  const s = session(); step(s); s.pause(); s.play();
  assert.equal(source(s).authorization, null); assert.equal(source(s).availability, 'pendingCurrentFrame');
  step(s); assert.ok(source(s).authorization);
});

test('live edits suspend rather than bless the old frame, then resume after same-epoch lineage is current', () => {
  const s = session(); step(s);
  const a = s.getAxisConfiguration('L0'); a.scriptScale = .8; s.changeAxisConfiguration('L0', a);
  assert.equal(source(s).authorization, null); assert.equal(source(s).availability, 'pendingCurrentFrame');
  step(s, 20); assert.ok(source(s).authorization); assert.equal(s.snapshot().state, 'playing');
});

test('paused home authorization requires an applied home step, not the odd t=0 isAutoHoming boundary', () => {
  const s = session(a => { a.autoHomeEnabled = true; a.autoHomeDelaySeconds = .1; a.autoHomeDurationSeconds = 1; });
  step(s); s.pause(); step(s, 1, 100);
  assert.equal(s.frame().axisStates[0].isAutoHoming, true); assert.equal(s.frame().provenance[0].autoHomeApplied, false);
  assert.equal(source(s).authorization, null);
  step(s, 1, 100);
  assert.deepEqual(source(s).authorization.intents, ['pausedAutoHome']);
  assert.equal(source(s).authorization.clockKind, 'monotonic');
  assert.equal(source(s).authorization.observedMonotonicMs, s.frame().monotonicMs);
});

test('paused Pattern requires a confirmed produced sample that survives into the final value', () => {
  const s = session(a => { a.selectedMotionProvider = 'Pattern'; a.motionProviderBlend = 1;
    a.updateMotionProviderWhenPaused = true; a.updateMotionProviderWithoutScript = true; });
  step(s); s.pause(); step(s);
  assert.equal(s.frame().provenance[0].motionSampleProduced, true);
  assert.deepEqual(source(s).authorization.intents, ['pausedMotion']);
  const a = s.getAxisConfiguration('L0'); a.motionProviderBlend = 0; s.changeAxisConfiguration('L0', a); step(s, 20);
  assert.equal(s.frame().provenance[0].motionSampleProduced, true);
  assert.equal(s.frame().provenance[0].motionApplied, false); assert.equal(source(s).authorization, null);
});

test('Looping missing-resource and resource-clear no-op updates cannot launder its old cached sample', () => {
  const s = session(a => { a.bypassScript = true; a.selectedMotionProvider = 'Looping Script'; a.motionProviderBlend = 1;
    a.updateMotionProviderWhenPaused = true; a.updateMotionProviderWithoutScript = true; });
  step(s); s.pause(); step(s); assert.equal(source(s).authorization, null);
  s.setLoopingScript('L0', document(), 'download://verified.funscript'); step(s, 20);
  assert.deepEqual(source(s).authorization.intents, ['pausedMotion']);
  const value = s.frame().axisStates[0].value; s.setLoopingScript('L0', null, '');
  assert.equal(source(s).authorization, null); step(s);
  assert.equal(s.frame().axisStates[0].value, value, 'original manager cache behavior is preserved');
  assert.equal(s.frame().provenance[0].motionSampleProduced, false); assert.equal(source(s).availability, 'invalidated');
});

test('paused native motion waits for a confirmed native pause but does not need fresh stopped-media observations', () => {
  const { s, clock, generation } = native(a => { a.bypassScript = true; a.selectedMotionProvider = 'Pattern';
    a.motionProviderBlend = 1; a.updateMotionProviderWhenPaused = true; a.updateMotionProviderWithoutScript = true; });
  s.tick(100, 200); s.pause(); s.tick(40, 240); assert.equal(source(s).authorization, null);
  clock.pause(); clock.stateChanged(generation, 'paused'); s.acceptNativeSnapshot(clock.snapshot());
  s.tick(40, 10000); assert.deepEqual(source(s).authorization.intents, ['pausedMotion']);
  clock.beginSeek(); s.acceptNativeSnapshot(clock.snapshot()); assert.equal(source(s).availability, 'invalidated');
});

test('unknown cross-axis dependencies remain denied even when their axis is disabled for the target', () => {
  const s = session(a => { a.smartLimitInputAxis = 'R0'; a.smartLimitPoints = [{ x: 0, y: 0 }, { x: 100, y: 100 }]; });
  step(s);
  // A missing R0 scalar causes the original smart stage to skip, so it adds no
  // fictitious dependency. A produced unknown R0 source must instead be rejected.
  const a = s.getAxisConfiguration('R0'); a.selectedMotionProvider = 'Looping Script'; a.updateMotionProviderWithoutScript = true;
  a.motionProviderBlend = 1; s.changeAxisConfiguration('R0', a); step(s, 20);
  assert.equal(s.frame().provenance.find(p => p.axisName === 'R0').status, 'unknown');
  assert.equal(source(s).authorization, null);
});

test('background, fault and recovery have no implicit physical authorization', () => {
  const s = session(); step(s); s.setForeground(false); assert.equal(source(s).availability, 'invalidated');
  s.setForeground(true); assert.equal(source(s).authorization, null); s.play(); step(s); assert.ok(source(s).authorization);
  s.tick(-1); assert.equal(source(s).faulted, true); assert.equal(source(s).authorization, null);
  s.recoverFault(); assert.equal(source(s).faulted, false); assert.equal(source(s).authorization, null);
});

const { OutputCoordinator, OutputEndpoint } = await import('../entry/src/main/ets/output/OutputCoordinator.ts');
const { OutputSettingsModel } = await import('../entry/src/main/ets/output/OutputSettingsModel.ts');
const { MemoryTransport } = await import('../entry/src/main/ets/output/MemoryTransport.ts');
const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function outputHarness(s, options = {}) {
  const clock = { now: s.frame().monotonicMs, id: 0, tasks: new Map(), nowMs() { return this.now; },
    scheduleAt(at, run) { this.tasks.set(++this.id, { at, run }); return this.id; }, cancel(id) { this.tasks.delete(id); },
    async advance(ms) { this.now += ms; for (const [id, task] of [...this.tasks]) {
      if (task.at <= this.now && this.tasks.delete(id)) task.run(); } await settle(); } };
  const transport = new MemoryTransport(clock);
  const factory = { inspect() { return { available: true, diagnostic: 'memory only' }; }, create() { return transport; } };
  const coordinator = new OutputCoordinator(factory, s, { maximumFrameAgeMs: 200, maximumClockAgeMs: 200,
    maximumEventAgeMs: 100, maximumFixedElapsedMs: 1000, writeTimeoutMs: 100, maximumPolledQueueLength: 4, allowZeroInterval: true, ...options.policy }, clock, clock);
  const model = new OutputSettingsModel(); model.polled = !!options.polled; model.dirtyOnly = false; model.pausedAutoHome = !!options.pausedAutoHome; model.pausedMotion = !!options.pausedMotion;
  model.ranges = s.activeRegistry().axes.map(a => ({ axisId: a.name, minimum: 0, maximum: 1, enabled: a.name === 'L0' }));
  const config = { ...model.config({ precision: 4, revision: s.activeRegistry().revision,
    axisOrder: s.activeRegistry().axes.map(a => a.name), maximumDurationMs: 10000, maximumPayloadBytes: 1024 }), kind: 'memory' };
  return { clock, transport, coordinator, config };
}

test('real Session + Coordinator clears old scheduled candidates during live edit, resumes existing arm only on new valid frame', async () => {
  const s = session(); step(s); const h = outputHarness(s); const c = h.coordinator;
  assert.equal(await c.connect(h.config, new OutputEndpoint()), true); assert.equal(c.arm(), true);
  assert.equal(c.refresh(), 'accepted'); await h.clock.advance(10);
  const before = h.transport.writeRecords().length; assert.ok(before > 0);
  const axis = s.getAxisConfiguration('L0'); axis.scriptScale = .7; s.changeAxisConfiguration('L0', axis);
  assert.equal(source(s).availability, 'pendingCurrentFrame'); assert.equal(c.refresh(), 'ignored');
  assert.equal(c.status().armed, true); assert.equal(c.status().pendingFixed, false); assert.equal(c.status().queuedEvents, 0);
  await h.clock.advance(50); assert.equal(h.transport.writeRecords().length, before, 'scheduler cannot replay the previous settings');
  for (let i = 0; i < 20; i++) {
    await h.clock.advance(40); s.tick(40, h.clock.now); c.refresh();
  }
  assert.equal(c.status().armed, true); assert.ok(source(s).authorization);
  await h.clock.advance(10); assert.ok(h.transport.writeRecords().length > before);
  s.stop(); c.refresh(); assert.equal(c.status().armed, false);
  const stoppedWrites = h.transport.writeRecords().length; s.play(); await h.clock.advance(40); s.tick(40, h.clock.now); c.refresh();
  await h.clock.advance(10); assert.equal(c.status().armed, false); assert.equal(h.transport.writeRecords().length, stoppedWrites);
  await c.dispose();
});

test('real paused-home delay preserves an earlier arm without dispatch until the applied Home frame', async () => {
  const s = session(a => { a.autoHomeEnabled = true; a.autoHomeDelaySeconds = .2; a.autoHomeDurationSeconds = 1; }); step(s);
  const h = outputHarness(s, { pausedAutoHome: true }); const c = h.coordinator;
  await c.connect(h.config, new OutputEndpoint()); assert.equal(c.arm(), true); c.refresh(); await h.clock.advance(10);
  const before = h.transport.writeRecords().length; s.pause(); c.refresh(); assert.equal(c.status().armed, true);
  await h.clock.advance(100); s.tick(100, h.clock.now); c.refresh();
  assert.equal(source(s).authorization, null); assert.equal(c.status().armed, true);
  await h.clock.advance(100); assert.equal(h.transport.writeRecords().length, before);
  s.tick(100, h.clock.now); c.refresh();
  await h.clock.advance(40); s.tick(40, h.clock.now); c.refresh();
  assert.deepEqual(source(s).authorization.intents, ['pausedAutoHome']); await h.clock.advance(10);
  assert.ok(h.transport.writeRecords().length > before); await c.dispose();
});


test('resource change invalidates old fixed backlog even when no refresh observes its pending intermediate state', async () => {
  const s = session(a => { a.bypassScript = true; a.selectedMotionProvider = 'Looping Script'; a.motionProviderBlend = 1;
    a.updateMotionProviderWhenPaused = true; a.updateMotionProviderWithoutScript = true; });
  s.setLoopingScript('L0', document(), 'download://old'); step(s, 20);
  const h = outputHarness(s, { policy: { maximumFrameAgeMs: 2000, maximumClockAgeMs: 2000, writeTimeoutMs: 2000 } });
  const c = h.coordinator; await c.connect(h.config, new OutputEndpoint()); assert.equal(c.arm(), true);
  const oldRevision = source(s).authorization.sourceConfigurationRevision;
  h.transport.planWrite({ kind: 'defer' }); assert.equal(c.refresh(), 'accepted');
  await h.clock.advance(10); await h.clock.advance(10); assert.equal(c.status().pendingFixed, true);
  s.setLoopingScript('L0', FunscriptParser.parse('{"actions":[{"at":0,"pos":90},{"at":10000,"pos":10}]}'), 'download://new');
  s.tick(600, 1400); s.tick(40, 1440); h.clock.now = 1440;
  assert.equal(source(s).availability, 'ready'); assert.ok(source(s).authorization.sourceConfigurationRevision > oldRevision);
  assert.equal(c.refresh(), 'accepted'); assert.equal(c.status().pendingFixed, false);
  h.transport.resolveNextWrite(); await settle();
  assert.equal(h.transport.writeRecords().length, 1, 'late receipt cannot pump the old resource candidate');
  assert.equal(c.status().completedLocalWrites, 0); assert.deepEqual(c.status().lastWritten, []);
  await h.clock.advance(10); assert.equal(h.transport.writeRecords().length, 2);
  assert.notDeepEqual(h.transport.writeRecords()[1].bytes, h.transport.writeRecords()[0].bytes);
  await c.dispose();
});


test('paused source view excludes a t=0 raw Home event even beside another axis genuine Home activity', () => {
  const cfg = configuration(a => { a.autoHomeEnabled = true; a.autoHomeDelaySeconds = 0; a.autoHomeDurationSeconds = 1; });
  const axis = cfg.axisSettingsByDevice.find(d => d.deviceId === cfg.selectedDeviceId).axes.find(a => a.axisName === 'R0').settings;
  axis.autoHomeEnabled = true; axis.autoHomeDelaySeconds = .04; axis.autoHomeDurationSeconds = 1;
  const s = new PlaybackSessionCore(cfg); s.setConnected(true);
  s.load(FunscriptParser.parse('{"actions":[{"at":0,"pos":10},{"at":10000,"pos":90}],"axes":[{"id":"R0","actions":[{"at":0,"pos":20},{"at":10000,"pos":80}]}]}'));
  s.play(); step(s); s.pause(); step(s);
  assert.ok(s.frame().events.some(e => e.axisName === 'R0' && e.kind === 'autoHome'));
  assert.equal(s.frame().provenance.find(p => p.axisName === 'R0').autoHomeApplied, false);
  const view = s.dispatchSource(['L0', 'R0']); assert.equal(view.authorization, null, 'the other paused script axis is not Motion/Home activity');
  assert.ok(view.frame.events.every(e => e.axisName === 'L0'));
});


function defaultSession(edit = () => {}) {
  const cfg = SettingsSchema.defaults(); const axis = cfg.axisSettingsByDevice.find(d => d.deviceId === cfg.selectedDeviceId).axes.find(a => a.axisName === 'L0').settings;
  edit(axis, cfg); const s = new PlaybackSessionCore(cfg); s.setConnected(true); s.load(document()); s.play(); step(s); return s;
}
test('default four-second Sync live edits authorize the first actual blended frame including speed-limit anchors', () => {
  for (const limit of [false, true]) {
    const s = defaultSession(a => { a.autoHomeEnabled = false; a.speedLimitEnabled = limit; a.speedLimitUnitsPerSecond = .1; });
    const axis = s.getAxisConfiguration('L0'); axis.scriptScale = .5; s.changeAxisConfiguration('L0', axis);
    assert.equal(source(s).availability, 'pendingCurrentFrame'); step(s);
    assert.ok(s.frame().provenance[0].crossConfiguration); assert.equal(source(s).availability, 'ready');
    assert.ok(s.frame().provenance[0].origins.some(o => o.anchor?.role === 'syncPrevious'));
    for (let i = 0; i < 100; i++) { step(s); assert.equal(source(s).availability, 'ready'); }
  }
});
test('seek and reload require new epoch frame but retain trusted original soft-sync numeric anchors', () => {
  for (const operation of ['seek', 'load']) {
    const s = defaultSession(a => { a.autoHomeEnabled = false; }); step(s, 10); const old = source(s);
    if (operation === 'seek') s.seek(3000); else s.load(FunscriptParser.parse('{"actions":[{"at":0,"pos":90},{"at":10000,"pos":10}]}'));
    s.play(); assert.equal(source(s).authorization, null); step(s);
    const current = source(s); assert.ok(current.frame.epoch > old.frame.epoch); assert.equal(current.availability, 'ready');
    assert.ok(s.frame().provenance[0].crossEpoch); assert.ok(s.frame().provenance[0].origins.some(o => o.anchor?.role === 'syncPrevious'));
    assert.ok(current.frame.events.every(e => e.epoch === current.frame.epoch && e.sourceFrameSequence === current.frame.sequence));
  }
});
test('cleared Looping resource stays denied despite legitimate previous-value Sync anchors', () => {
  const s = defaultSession(a => { a.autoHomeEnabled = false; a.bypassScript = true; a.selectedMotionProvider = 'Looping Script';
    a.motionProviderBlend = 1; a.updateMotionProviderWithoutScript = true; });
  s.setLoopingScript('L0', document(), 'download://valid'); step(s, 120); assert.ok(source(s).authorization);
  s.setLoopingScript('L0', null, ''); step(s);
  assert.equal(s.frame().provenance[0].status, 'unknown'); assert.equal(source(s).authorization, null);
});


test('polled t=0 Home emits the one original prospective command while fixed still has no activity', async () => {
  const s = session(a => { a.autoHomeEnabled = true; a.autoHomeDelaySeconds = .1; a.autoHomeDurationSeconds = 1; }); step(s);
  const h = outputHarness(s, { polled: true, pausedAutoHome: true }); const c = h.coordinator;
  await c.connect(h.config, new OutputEndpoint()); assert.equal(c.arm(), true); c.refresh(); await settle();
  const before = h.transport.writeRecords().length; s.pause(); c.refresh();
  await h.clock.advance(100); s.tick(100, h.clock.now);
  const original = s.frame().events.find(e => e.kind === 'autoHome'); assert.ok(original);
  assert.equal(s.frame().provenance[0].autoHomeApplied, false); assert.equal(source(s).authorization, null);
  const polled = s.dispatchSource(['L0'], 'polled');
  assert.equal(polled.authorization.updateKind, 'polled'); assert.deepEqual(polled.authorization.intents, ['pausedAutoHome']);
  assert.equal(polled.frame.events[0], original); assert.equal(c.refresh(), 'accepted'); await settle();
  assert.equal(h.transport.writeRecords().length, before + 1);
  const command = new TextDecoder().decode(h.transport.writeRecords().at(-1).bytes); assert.match(command, /I1000\n$/);
  assert.equal(c.refresh(), 'ignored', 'same event cannot be replayed');
  for (let i = 0; i < 20; i++) { await h.clock.advance(40); s.tick(40, h.clock.now); c.refresh(); }
  assert.equal(h.transport.writeRecords().length, before + 1);
  await c.dispose();
});
test('polled empty playing frames consume no unknown scalar and never revive a previous event', async () => {
  const s = session(); step(s, 2); assert.equal(s.frame().events.length, 0);
  const view = s.dispatchSource(undefined, 'polled'); assert.equal(view.availability, 'ready');
  assert.ok(view.frame.axisStates.some(axis => !Number.isFinite(axis.value))); assert.equal(view.frame.events.length, 0);
  assert.equal(s.dispatchSource().authorization, null, 'same unknown scalars remain forbidden for fixed mode');
  const h = outputHarness(s, { polled: true }); await h.coordinator.connect(h.config, new OutputEndpoint());
  assert.equal(h.coordinator.arm(), true); h.coordinator.refresh(); await h.clock.advance(50);
  assert.equal(h.transport.writeRecords().length, 0); await h.coordinator.dispose();
});
test('unknown paused Motion without a genuine event cannot manufacture prospective Home permission', () => {
  const s = session(a => { a.bypassScript = true; a.autoHomeEnabled = false; a.selectedMotionProvider = 'Looping Script';
    a.updateMotionProviderWithoutScript = true; a.updateMotionProviderWhenPaused = true; });
  step(s); s.pause(); step(s); assert.equal(s.dispatchSource(['L0'], 'polled').authorization, null);
});


test('speed edit closes prior control-frame permission without requesting numeric Sync reset',()=>{
 const s=session();step(s);const before=s.frame();const revision=source(s).authorization.sourceConfigurationRevision;
 s.setSpeed(2);assert.equal(s.frame(),before);assert.equal(source(s).availability,'pendingCurrentFrame');
 step(s);assert.ok(source(s).authorization.sourceConfigurationRevision>revision);assert.equal(source(s).availability,'ready');
});

test('two hundred continuous live edits retain authorized output with default Sync and low SpeedLimit', async () => {
 for (const limit of [false, true]) {
  const s=defaultSession(a=>{a.autoHomeEnabled=false;a.speedLimitEnabled=limit;a.speedLimitUnitsPerSecond=.01;});
  s.load(FunscriptParser.parse('{"actions":[{"at":0,"pos":0},{"at":100000,"pos":100}]}'));s.play();step(s);
  const h=outputHarness(s),c=h.coordinator;await c.connect(h.config,new OutputEndpoint());assert.equal(c.arm(),true);c.refresh();
  for(let i=0;i<200;i++) {
   const axis=s.getAxisConfiguration('L0');axis.scriptScale=.5+(i%100)/200;axis.offsetSeconds=(i%20)/100;s.changeAxisConfiguration('L0',axis);
   c.refresh();assert.equal(c.status().armed,true,'pending edit preserves explicit arm');
   h.clock.now+=40;s.tick(40,h.clock.now);
   assert.equal(source(s).availability,'ready',`limit=${limit}, edit=${i+1}`);
   assert.ok(s.frame().provenance[0].origins.length<16,'historical scalar lineage is bounded independently of edit count');
   c.refresh();await h.clock.advance(1);assert.equal(c.status().armed,true);
  }
  assert.equal(s.fault(),'');await c.dispose();
 }
});

test('historical summaries require current known same-profile anchor, never count as direct activity',()=>{
 const s=defaultSession(a=>{a.autoHomeEnabled=false;});let a=s.getAxisConfiguration('L0');a.scriptScale=.5;s.changeAxisConfiguration('L0',a);step(s);
 const original=s.frame();assert.equal(source(s).availability,'ready');
 const summary=original.provenance[0].origins.find(o=>o.source==='historical');assert.ok(summary);
 const replace=(mutate)=>{
  const origins=original.provenance[0].origins.map(o=>o===summary?mutate({...o,anchor:{...o.anchor,sourceKinds:o.anchor.sourceKinds.slice()}}):o);
  s.frame=()=>({...original,provenance:original.provenance.map((p,i)=>i===0?{...p,origins}:p)});
 };
 for(const mutation of [o=>({...o,anchor:null}),o=>({...o,anchor:{...o.anchor,sourceProfileValid:false}}),o=>({...o,anchor:{...o.anchor,sourceKinds:['unknown']}}),o=>({...o,anchor:{...o.anchor,consumerFrameSequence:original.sequence-1}})]){
  replace(mutation);assert.equal(source(s).authorization,null);
 }
 s.frame=()=>({...original,provenance:original.provenance.map((p,i)=>i===0?{...p,origins:[summary]}:p)});
 assert.equal(source(s).authorization,null,'historical scalar alone cannot fabricate current activity');
});

test('Smart Value and Speed use auditable previous-frame control scalars throughout continuous live tuning',async()=>{
 for(const mode of ['value','speed']) {
  const cfg=SettingsSchema.defaults();const axes=cfg.axisSettingsByDevice.find(d=>d.deviceId===cfg.selectedDeviceId).axes;
  const a=axes.find(a=>a.axisName==='L0').settings;a.autoHomeEnabled=false;a.smartLimitInputAxis='R0';a.smartLimitMode=mode;a.smartLimitPoints=[{x:0,y:50},{x:100,y:50}];a.speedLimitEnabled=true;a.speedLimitUnitsPerSecond=.01;
  const s=new PlaybackSessionCore(cfg);s.setConnected(true);s.load(FunscriptParser.parse('{"actions":[{"at":0,"pos":0},{"at":100000,"pos":100}],"axes":[{"id":"R0","actions":[{"at":0,"pos":50},{"at":100000,"pos":50}]}]}'));s.play();step(s);
  const h=outputHarness(s),c=h.coordinator;await c.connect(h.config,new OutputEndpoint());assert.equal(c.arm(),true);c.refresh();
  for(let i=0;i<200;i++) {
   const next=s.getAxisConfiguration('L0');next.scriptScale=.5+(i%100)/200;next.offsetSeconds=(i%20)/100;s.changeAxisConfiguration('L0',next);c.refresh();assert.equal(c.status().armed,true);
   h.clock.now+=40;s.tick(40,h.clock.now);assert.equal(source(s).availability,'ready',`${mode} edit ${i+1}`);
   assert.ok(s.frame().provenance[0].origins.length<16);c.refresh();await h.clock.advance(1);assert.equal(c.status().armed,true);
  }
  const f=s.frame(),p=f.provenance[0],control=p.origins.find(o=>o.control?.role==='smartInput');assert.ok(control);
  assert.equal(control.control.sourceAxisName,'R0');
  for(const edit of [{sourceStatus:'unknown'},{sourceCurrentValid:false},{sourceProfileValid:false},{readFrameSequence:f.sequence-2},{consumerAxisName:'R0'},{sourceAxisName:'R1'},{sourceProfileRevision:f.profileRevision+1}]) {
   s.frame=()=>({...f,provenance:f.provenance.map(v=>v===p?{...p,origins:p.origins.map(o=>o===control?{...o,control:{...o.control,...edit}}:o)}:v)});
   assert.equal(source(s).authorization,null,'invalid prior control scalar cannot authorize: '+JSON.stringify(edit));
  }
  await c.dispose();
 }
});

test('real-script cyclic Smart and Pattern follow start from observed prior frames and survive 200 live edits',async()=>{
 for(const mode of ['value','speed','follow','followSpeed']) {
  const cfg=SettingsSchema.defaults();const axes=cfg.axisSettingsByDevice.find(d=>d.deviceId===cfg.selectedDeviceId).axes;
  for(const name of ['L0','R0']) {const a=axes.find(a=>a.axisName===name).settings;a.autoHomeEnabled=false;
   if(mode.startsWith('follow')){a.updateMotionProviderWithAxis=name==='L0'?'R0':'L0';a.selectedMotionProvider='Pattern';a.motionProviderBlend=.5;a.motionProviderSpeedLimitWithAxis=mode==='followSpeed';}
   else{a.smartLimitInputAxis=name==='L0'?'R0':'L0';a.smartLimitMode=mode;a.smartLimitPoints=[{x:0,y:50},{x:100,y:50}];}
  }
  const s=new PlaybackSessionCore(cfg);s.setConnected(true);s.load(FunscriptParser.parse('{"actions":[{"at":0,"pos":0},{"at":100000,"pos":100}],"axes":[{"id":"R0","actions":[{"at":0,"pos":20},{"at":100000,"pos":80}]}]}'));s.play();
  let started=false;for(let i=0;i<5;i++){step(s);if(source(s).availability==='ready'){started=true;break;}}assert.equal(started,true,mode+' must start without recursive permission');
  const h=outputHarness(s),c=h.coordinator;await c.connect(h.config,new OutputEndpoint());assert.equal(c.arm(),true);c.refresh();
  for(let i=0;i<200;i++) {
   const next=s.getAxisConfiguration('L0');next.scriptScale=.5+(i%100)/200;next.offsetSeconds=(i%20)/100;s.changeAxisConfiguration('L0',next);c.refresh();assert.equal(c.status().armed,true);
   const previous=s.frame().axisStates[0].value;h.clock.now+=40;s.tick(40,h.clock.now);const view=source(s),frame=s.frame();
   if(view.availability==='pendingCurrentFrame') {
    assert.equal(mode,'followSpeed','only original zero-speed hold is idle');assert.equal(frame.axisStates[0].value,previous,'pending pure hold does not move');
    assert.ok(frame.provenance[0].stages.includes('motionFollowLimit'));
   } else assert.equal(view.availability,'ready',`${mode} cycle edit ${i+1}`);
   const p=frame.provenance[0];
   if(view.authorization&&p.origins.some(o=>o.source==='motion'&&o.configurationRevision!==frame.configurationRevision)) {
    assert.equal(p.motionCacheValidated,true);const realFrame=s.frame.bind(s);
    s.frame=()=>({...frame,provenance:frame.provenance.map(v=>v===p?{...p,motionCacheValidated:false}:v)});
    assert.equal(source(s).authorization,null,'retained sample needs this actual read receipt');s.frame=realFrame;
   }
   assert.ok(frame.provenance[0].origins.length<16);c.refresh();await h.clock.advance(1);assert.equal(c.status().armed,true);
  }
  await c.dispose();
 }
});

test('cross-axis control rejects cleared or replaced Looping references and recovers only from verified new samples',async()=>{
 for(const mutation of ['clear','replace']) {
  const s=session(a=>{a.smartLimitInputAxis='R0';a.smartLimitPoints=[{x:0,y:50},{x:100,y:50}];});
  const r=s.getAxisConfiguration('R0');r.selectedMotionProvider='Looping Script';r.updateMotionProviderWithAxis=null;r.updateMotionProviderWithoutScript=true;r.motionProviderBlend=1;r.autoHomeEnabled=false;s.changeAxisConfiguration('R0',r);
  s.setLoopingScript('R0',document(),'download://control-a');step(s,30);assert.equal(source(s).availability,'ready');
  const h=outputHarness(s),c=h.coordinator;await c.connect(h.config,new OutputEndpoint());assert.equal(c.arm(),true);c.refresh();
  s.setLoopingScript('R0',mutation==='clear'?null:document(),mutation==='clear'?'':'download://control-b');
  h.clock.now+=40;s.tick(40,h.clock.now);assert.equal(source(s).authorization,null,'old referenced generation is not a current input');c.refresh();assert.equal(c.status().armed,false);
  if(mutation==='clear'){for(let i=0;i<4;i++){step(s);assert.equal(source(s).authorization,null);}s.setLoopingScript('R0',document(),'download://verified-restored');}
  let recovered=false;for(let i=0;i<80;i++){step(s);if(source(s).availability==='ready'){recovered=true;break;}}
  assert.equal(recovered,true,'fresh valid resource eventually replaces all unknown contributing history');assert.equal(c.status().armed,false,'recovery must not silently arm');await c.dispose();
 }
});

test('validated retained Pattern cache is not a fresh paused Motion intent and cannot bypass Stop or background',()=>{
 const s=session(a=>{a.selectedMotionProvider='Pattern';a.motionProviderBlend=.5;a.updateMotionProviderWithAxis='R0';a.updateMotionProviderWhenPaused=true;a.motionProviderSpeedLimitWithAxis=false;});
 const r=s.getAxisConfiguration('R0');r.selectedMotionProvider=null;r.autoHomeEnabled=false;s.changeAxisConfiguration('R0',r);
 s.load(FunscriptParser.parse('{"actions":[{"at":0,"pos":0},{"at":100000,"pos":100}],"axes":[{"id":"R0","actions":[{"at":0,"pos":20},{"at":100000,"pos":80}]}]}'));s.play();step(s,20);assert.ok(source(s).authorization);
 s.pause();step(s,5);const p=s.frame().provenance[0];assert.equal(p.motionCacheValidated,true);assert.notEqual(p.motionSampleProduced,true);assert.equal(source(s).authorization,null);
 s.stop();step(s);assert.equal(source(s).authorization,null);s.setForeground(false);step(s);assert.equal(source(s).authorization,null);s.setForeground(true);assert.equal(source(s).authorization,null);
});


test('a current-config Motion read still requires its validated cache receipt, not merely old known origin stamps',()=>{
 const s=session(a=>{a.selectedMotionProvider='Pattern';a.motionProviderBlend=.5;a.updateMotionProviderWithAxis=null;});step(s,20);
 const f=s.frame(),p=f.provenance[0];assert.equal(p.motionCacheValidated,true);assert.ok(source(s).authorization);
 s.frame=()=>({...f,provenance:f.provenance.map(v=>v===p?{...p,motionCacheValidated:false}:v)});assert.equal(source(s).authorization,null);
});
