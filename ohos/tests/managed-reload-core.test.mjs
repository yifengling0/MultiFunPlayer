import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, next) {
  return next(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? specifier + '.ts' : specifier, context);
} });

const { PlaybackSessionCore } = await import('../entry/src/main/ets/core/PlaybackSessionCore.ts');
const { SettingsSchema } = await import('../entry/src/main/ets/settings/SettingsSchema.ts');
const { FunscriptParser } = await import('../entry/src/main/ets/core/Funscript.ts');
const { AxisConfigurationEntry } = await import('../entry/src/main/ets/core/AxisConfiguration.ts');
const { AxisScriptBinding, AxisScriptResource, AxisKeyframe } = await import('../entry/src/main/ets/core/AxisScriptStore.ts');
const { OutputCoordinator, OutputEndpoint } = await import('../entry/src/main/ets/output/OutputCoordinator.ts');
const { OutputSettingsModel } = await import('../entry/src/main/ets/output/OutputSettingsModel.ts');
const { MemoryTransport } = await import('../entry/src/main/ets/output/MemoryTransport.ts');

const document = () => FunscriptParser.parse('{"actions":[{"at":0,"pos":10},{"at":100000,"pos":90}]}');
const resource = (id = 'current', value = .1) => new AxisScriptResource(id, id + '.funscript', 'Download',
  [new AxisKeyframe(0, value), new AxisKeyframe(.2, .8), new AxisKeyframe(.4, .2), new AxisKeyframe(100, .9)]);
const binding = (axis, value) => new AxisScriptBinding(axis, value);
const axisBinding = (session, axis = 'L0') => session.bindings().find(item => item.axisName === axis);
const axisState = (session, axis = 'L0') => session.frame().axisStates.find(item => item.axisName === axis);
const source = (session, kind = 'fixed', axes = ['L0']) => session.dispatchSource(axes, kind);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
const settle = async () => { for (let i = 0; i < 32; i++) await Promise.resolve(); };
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function configuration(edit = () => {}) {
  const value = SettingsSchema.defaults();
  for (const key of Object.keys(value.sync)) if (key.startsWith('sync')) value.sync[key] = false;
  value.sync.durationSeconds = .5;
  value.playback.autoSkipEnabled = false;
  const axes = value.axisSettingsByDevice.find(item => item.deviceId === value.selectedDeviceId).axes;
  for (const entry of axes) {
    entry.settings.autoHomeEnabled = false; entry.settings.interpolationType = 'linear';
    entry.settings.selectedMotionProvider = null; entry.settings.updateMotionProviderWithAxis = null;
  }
  edit(axes.find(item => item.axisName === 'L0').settings, axes, value);
  return value;
}
function session(edit, bindings = [binding('L0', resource())]) {
  const value = new PlaybackSessionCore(configuration(edit));
  value.setConnected(true); value.loadBindings(document(), bindings); assert.equal(value.play(), true);
  value.tick(40);
  return value;
}
function editAxis(value, axisName, edit, defer = false) {
  const settings = value.getAxisConfiguration(axisName); edit(settings);
  value.changeAxisConfiguration(axisName, settings, defer);
}

for (const outcome of ['found', 'missing', 'locked']) test(`managed reload requests ResetSync before asynchronous ${outcome} search and never manufactures a frame`, async () => {
  const value = session(axis => { axis.lockScript = outcome === 'locked'; });
  value.tick(600);
  close(axisState(value).syncTimeSeconds, 0);
  const before = value.frame(), original = axisBinding(value), position = value.mediaPositionSeconds();
  const read = deferred();
  const token = value.beginScriptReload(['L0']);
  assert.equal(value.frame(), before); assert.equal(value.mediaPositionSeconds(), position);
  assert.equal(axisBinding(value), original); assert.equal(source(value).availability, 'pendingCurrentFrame');
  // This is the mock repository's entry point, before its first await. A real
  // step here proves Sync was already requested when asynchronous search began.
  const replacement = resource('fresh', .7);
  const loading = (async () => {
    value.tick(40);
    close(axisState(value).syncTimeSeconds, .46);
    close(axisState(value, 'R0').syncTimeSeconds, 0);
    assert.equal(value.isScriptReloadCurrent(token), true);
    assert.equal(source(value).authorization, null);
    return value.completeScriptReload(token, await read.promise);
  })();
  for (let i = 0; i < 5; i++) {
    value.tick(40);
    assert.equal(value.isScriptReloadCurrent(token), true);
    assert.equal(source(value).availability, 'pendingCurrentFrame');
    assert.equal(axisBinding(value), original);
  }
  assert.ok(value.frame().sequence > before.sequence); assert.ok(value.mediaPositionSeconds() > position);
  const during = value.frame(), completedAt = value.mediaPositionSeconds();
  read.resolve(outcome === 'missing' ? [] : [binding('L0', replacement)]);
  assert.equal(await loading, true);
  assert.equal(value.frame(), during); assert.equal(value.mediaPositionSeconds(), completedAt);
  assert.equal(value.isScriptReloadCurrent(token), false);
  assert.equal(source(value).availability, 'pendingCurrentFrame'); assert.equal(source(value).authorization, null);
  assert.equal(axisBinding(value).resource, outcome === 'found' ? replacement : original.resource);
  value.tick(0); assert.equal(value.frame(), during); assert.equal(source(value).authorization, null);
  value.tick(40);
  assert.equal(source(value).availability, 'ready'); assert.ok(value.frame().sequence > during.sequence);
  assert.equal(value.frame().epoch, before.epoch); assert.equal(value.snapshot().state, 'playing');
});

test('fresh equal content retains resource reference identity, only targets change, and duplicate completion is inert', () => {
  const first = resource('same'), other = resource('other');
  const value = session(undefined, [binding('L0', first), binding('R0', other)]);
  const old = axisBinding(value), unrelated = axisBinding(value, 'R0');
  const fresh = resource('same'); assert.deepEqual(fresh, first); assert.notEqual(fresh, first);
  const token = value.beginScriptReload(['L0']);
  assert.equal(value.completeScriptReload(token, [binding('L0', fresh), binding('R0', resource('ignored'))]), true);
  const next = axisBinding(value);
  assert.equal(next.resource, fresh); assert.ok(next.revision > old.revision); assert.equal(axisBinding(value, 'R0'), unrelated);
  assert.equal(value.completeScriptReload(token, [binding('L0', resource('late'))]), false);
  assert.equal(axisBinding(value), next);
});

test('Lock protects non-null and empty resources, permits a null first load, and unlock alone does not replay cached discoveries', () => {
  for (const existing of [resource('locked'), new AxisScriptResource('empty', 'empty', 'Download', []), null]) {
    const value = session(axis => { axis.lockScript = true; }, [binding('L0', existing)]);
    const fresh = resource('read-while-locked');
    const token = value.beginScriptReload(['L0']);
    assert.equal(value.completeScriptReload(token, [binding('L0', fresh)]), true);
    assert.equal(axisBinding(value).resource, existing ?? fresh);
    const retained = axisBinding(value);
    editAxis(value, 'L0', axis => { axis.lockScript = false; });
    assert.equal(axisBinding(value), retained);
    const missing = value.beginScriptReload(['L0']); assert.equal(value.completeScriptReload(missing, []), true);
    assert.equal(axisBinding(value), retained, 'an ordinary miss does not clear or replace the resource');
  }
});

test('deferred Link edits retain current bindings until owned commit; priority ignores own discovery and propagates fresh raw resources', () => {
  const first = resource('source'), own = resource('own');
  const value = session(undefined, [binding('L0', first), binding('R0', own)]);
  const before = axisBinding(value, 'R0');
  editAxis(value, 'R0', axis => { axis.linkAxis = 'L0'; axis.linkAxisHasPriority = true; }, true);
  assert.equal(axisBinding(value, 'R0'), before);
  const token = value.beginScriptReload(['L0', 'R0']);
  value.tick(40); assert.equal(axisBinding(value, 'R0'), before);
  const fresh = resource('fresh-source');
  assert.equal(value.completeScriptReload(token, [binding('L0', fresh), binding('R0', resource('must-ignore'))]), true);
  assert.equal(axisBinding(value, 'L0').resource, fresh);
  assert.equal(axisBinding(value, 'R0').resource, fresh); assert.equal(axisBinding(value, 'R0').linkedFromAxis, 'L0');
  assert.ok(axisBinding(value, 'R0').revision > before.revision);
  assert.equal(source(value, 'fixed', ['L0', 'R0']).authorization, null);
  value.tick(40); assert.equal(source(value, 'fixed', ['L0', 'R0']).availability, 'ready');
});

test('fallback Link misses preserve own resources, null targets adopt links, and direct discoveries replace fallback links', () => {
  const first = resource('source'), own = resource('own');
  const value = session(undefined, [binding('L0', first), binding('R0', own)]);
  editAxis(value, 'R0', axis => { axis.linkAxis = 'L0'; }, true);
  let token = value.beginScriptReload(['R0']); value.completeScriptReload(token, []);
  assert.equal(axisBinding(value, 'R0').resource, own); assert.equal(axisBinding(value, 'R0').linkedFromAxis, null);
  value.clearAxisScript('R0'); assert.equal(axisBinding(value, 'R0').resource, null);
  token = value.beginScriptReload(['R0']); value.completeScriptReload(token, []);
  assert.equal(axisBinding(value, 'R0').resource, first); assert.equal(axisBinding(value, 'R0').linkedFromAxis, 'L0');
  const replacement = resource('direct'); token = value.beginScriptReload(['R0']);
  value.completeScriptReload(token, [binding('R0', replacement)]);
  assert.equal(axisBinding(value, 'R0').resource, replacement); assert.equal(axisBinding(value, 'R0').linkedFromAxis, null);
});

test('batch deferred link changes preserve disabled saved configuration and Lock blocks automatic linked propagation', () => {
  const value = session(undefined, [binding('L0', resource('source')), binding('R0', resource('own'))]);
  const disabled = value.configurationSnapshot().axisSettingsByDevice.find(item => item.deviceId === value.activeRegistry().profile.id)
    .axes.filter(item => !value.activeRegistry().axes.some(axis => axis.name === item.axisName));
  const r0 = value.getAxisConfiguration('R0'); r0.linkAxis = 'L0'; r0.linkAxisHasPriority = true; r0.lockScript = true;
  const l0 = value.getAxisConfiguration('L0'); l0.scriptScale = .8;
  const original = axisBinding(value, 'R0');
  value.changeAxisConfigurations([new AxisConfigurationEntry('L0', l0), new AxisConfigurationEntry('R0', r0)], true);
  assert.equal(axisBinding(value, 'R0'), original);
  const token = value.beginScriptReload(['L0', 'R0']);
  value.completeScriptReload(token, [binding('L0', resource('new-source'))]);
  assert.equal(axisBinding(value, 'R0'), original);
  const saved = value.configurationSnapshot().axisSettingsByDevice.find(item => item.deviceId === value.activeRegistry().profile.id).axes;
  for (const entry of disabled) assert.deepEqual(saved.find(item => item.axisName === entry.axisName), entry);
});

test('invalid scopes and duplicate results are rejected without partial binding publication', () => {
  const value = session(); const before = value.frame(), original = value.bindings();
  const disabled = value.activeRegistry().profile.axes.find(axis => !axis.enabled)?.name;
  for (const names of [[], ['L0', 'L0'], ['unknown'], ...(disabled ? [[disabled]] : [])]) {
    assert.throws(() => value.beginScriptReload(names), /unavailable/);
    assert.equal(value.frame(), before); assert.deepEqual(value.bindings(), original);
  }
  const token = value.beginScriptReload(['L0']);
  assert.throws(() => value.completeScriptReload(token, [binding('L0', resource('one')), binding('L0', resource('two'))]), /Duplicate/);
  assert.deepEqual(value.bindings(), original); assert.equal(value.isScriptReloadCurrent(token), true);
  value.cancelScriptReload(token); assert.equal(value.isScriptReloadCurrent(token), false);
});

const cancellations = {
  source: value => { value.loadBindings(document(), [binding('L0', resource('new-source'))]); },
  configuration: value => editAxis(value, 'L0', axis => { axis.scriptScale = .8; }),
  profile: value => { value.selectProfile(value.configurationSnapshot().devices.find(item => item.id !== value.activeRegistry().profile.id).id); },
  stop: value => value.stop(),
  background: value => value.setForeground(false),
  disconnect: value => value.setConnected(false),
  seek: value => value.seek(3000),
  pause: value => value.pause(),
  fault: value => value.tick(-1),
  cancellation: (value, token) => value.cancelScriptReload(token)
};
for (const [name, cancel] of Object.entries(cancellations)) test(`${name} invalidates the captured reload; a late read cannot publish`, async () => {
  const value = session(); const token = value.beginScriptReload(['L0']); const read = deferred();
  const loading = read.promise.then(results => value.completeScriptReload(token, results));
  cancel(value, token);
  const after = value.bindings(), frame = value.frame();
  assert.equal(value.isScriptReloadCurrent(token), false);
  read.resolve([binding('L0', resource('late'))]); assert.equal(await loading, false);
  assert.deepEqual(value.bindings(), after); assert.equal(value.frame(), frame);
});

test('a newer transaction owns publication and stale cancellation/completion cannot retire or overwrite it', () => {
  const value = session(); const first = value.beginScriptReload(['L0']), next = value.beginScriptReload(['L0']);
  assert.ok(next > first); assert.equal(value.isScriptReloadCurrent(first), false); assert.equal(value.isScriptReloadCurrent(next), true);
  value.cancelScriptReload(first); assert.equal(value.isScriptReloadCurrent(next), true);
  assert.equal(value.completeScriptReload(first, [binding('L0', resource('stale'))]), false);
  const latest = resource('latest'); assert.equal(value.completeScriptReload(next, [binding('L0', latest)]), true);
  assert.equal(axisBinding(value).resource, latest);
  assert.equal(value.completeScriptReload(first, [binding('L0', resource('later-stale'))]), false);
  assert.equal(axisBinding(value).resource, latest);
});

test('commit rechecks settings writability after asynchronous I/O without publishing a partial replacement', () => {
  class WritableSession extends PlaybackSessionCore {
    readOnly = false;
    assertConfigurationWritable() { if (this.readOnly) throw new Error('Settings are read-only'); }
  }
  const value = new WritableSession(configuration()); value.setConnected(true);
  value.loadBindings(document(), [binding('L0', resource())]); value.play(); value.tick(40);
  const token = value.beginScriptReload(['L0']), original = value.bindings(), frame = value.frame();
  value.readOnly = true;
  assert.throws(() => value.completeScriptReload(token, [binding('L0', resource('uncommitted'))]), /read-only/);
  assert.deepEqual(value.bindings(), original); assert.equal(value.frame(), frame);
  value.cancelScriptReload(token); assert.equal(value.isScriptReloadCurrent(token), false);
});

test('managed completion preserves actual Internal identity, clock, loop and Motion phase without manufacturing a seek', () => {
  const edit = axis => { axis.selectedMotionProvider = 'Pattern'; axis.motionProviderBlend = 1; axis.updateMotionProviderWithoutScript = true; };
  const value = new PlaybackSessionCore(configuration(edit)), control = new PlaybackSessionCore(configuration(edit));
  for (const item of [value, control]) {
    item.setConnected(true); item.useInternalSource(); item.beginInternalResource('authorized-download-item');
    item.acceptDurationMessage(100); item.acceptInternalPosition(2, true);
    item.loadInternalBindings(document(), [binding('L0', resource())]); item.admitInternalPlay(); item.acceptInternalPlaying(true);
    item.mediaLoop.setLoop(1, 20, 100); item.tick(40);
  }
  const before = source(value); const token = value.beginScriptReload(['L0']);
  for (let i = 0; i < 6; i++) { value.tick(40); control.tick(40); close(axisState(value).motionProviderValue, axisState(control).motionProviderValue); }
  const frame = value.frame(), position = value.mediaPositionSeconds();
  value.completeScriptReload(token, [binding('L0', resource('fresh'))]);
  assert.equal(value.frame(), frame); assert.equal(value.mediaPositionSeconds(), position);
  assert.equal(source(value).sourceIdentity, before.sourceIdentity); assert.equal(source(value).sourceGeneration, before.sourceGeneration);
  assert.equal(value.frame().epoch, before.frame.epoch); assert.equal(value.sourceSeekSnapshot(), null);
  assert.deepEqual(value.drainMediaSeekRequests(), []); assert.equal(value.mediaLoop.startPosition, 1); assert.equal(value.mediaLoop.endPosition, 20);
  value.tick(40); control.tick(40); close(axisState(value).motionProviderValue, axisState(control).motionProviderValue);
});

class Time {
  constructor(now) { this.now = now; this.next = 0; this.tasks = new Map(); }
  nowMs() { return this.now; }
  scheduleAt(at, run) { const id = ++this.next; this.tasks.set(id, { at, run }); return id; }
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
async function output(value, kind = 'fixed', intent = 'activePlayback', armed = true) {
  const time = new Time(value.frame().monotonicMs), transport = new MemoryTransport(time);
  const coordinator = new OutputCoordinator({ inspect: () => ({ available: true, diagnostic: 'memory-only test' }), create: () => transport },
    value, { maximumFrameAgeMs: 2000, maximumClockAgeMs: 2000, maximumEventAgeMs: 2000,
      maximumFixedElapsedMs: 2000, writeTimeoutMs: 2000, maximumPolledQueueLength: 8, allowZeroInterval: true }, time, time);
  const model = new OutputSettingsModel(); model.polled = kind === 'polled'; model.dirtyOnly = false;
  model.pausedAutoHome = intent === 'pausedAutoHome'; model.pausedMotion = intent === 'pausedMotion';
  model.ranges = value.activeRegistry().axes.map(axis => ({ axisId: axis.name, minimum: 0, maximum: 1, enabled: axis.name === 'L0' }));
  const config = { ...model.config({ precision: 4, revision: value.activeRegistry().revision,
    axisOrder: value.activeRegistry().axes.map(axis => axis.name), maximumDurationMs: 120000, maximumPayloadBytes: 1024 }), kind: 'memory' };
  assert.equal(await coordinator.connect(config, new OutputEndpoint()), true);
  if (armed) assert.equal(coordinator.arm(), true);
  return { time, transport, coordinator, async tick(ms = 40) { await time.advance(ms); value.tick(ms, time.now); } };
}
function intentSession(intent) {
  const value = session(axis => {
    if (intent === 'pausedAutoHome') { axis.autoHomeEnabled = true; axis.autoHomeDelaySeconds = 0; axis.autoHomeDurationSeconds = 10; }
    if (intent === 'pausedMotion') {
      axis.selectedMotionProvider = 'Pattern'; axis.motionProviderBlend = 1;
      axis.updateMotionProviderWhenPaused = true; axis.updateMotionProviderWithoutScript = true;
    }
  });
  if (intent !== 'activePlayback') { value.pause(); value.tick(40); value.tick(40); }
  return value;
}

for (const intent of ['activePlayback', 'pausedAutoHome', 'pausedMotion']) test(`${intent}: reload pending suspends real coordinator backlog and retains only the earlier Arm`, async () => {
  const value = intentSession(intent), h = await output(value, 'fixed', intent), c = h.coordinator;
  try {
    assert.deepEqual(source(value).authorization.intents, [intent]);
    h.transport.planWrite({ kind: 'defer' }); assert.equal(c.refresh(), 'accepted'); await h.time.advance(10);
    await h.tick(); assert.equal(c.refresh(), 'accepted'); await h.time.advance(10);
    assert.equal(c.status().inFlight, true); assert.equal(c.status().pendingFixed, true);
    const token = value.beginScriptReload(['L0']);
    assert.equal(c.refresh(), 'ignored'); assert.equal(c.status().armed, true);
    assert.equal(c.status().pendingFixed, false); assert.equal(c.status().queuedEvents, 0);
    for (let i = 0; i < 3; i++) { await h.tick(); assert.equal(c.refresh(), 'ignored'); assert.equal(c.status().armed, true); }
    h.transport.resolveNextWrite(); await settle();
    assert.equal(c.status().completedLocalWrites, 0); assert.deepEqual(c.status().lastWritten, []);
    assert.equal(h.transport.writeRecords().length, 1);
    const before = value.frame(); value.completeScriptReload(token, [binding('L0', resource('new'))]);
    assert.equal(value.frame(), before); assert.equal(c.refresh(), 'ignored'); assert.equal(c.status().armed, true);
    await h.time.advance(10); assert.equal(h.transport.writeRecords().length, 1);
    await h.tick(); assert.equal(source(value).availability, 'ready'); assert.equal(c.refresh(), 'accepted');
    await h.time.advance(10); assert.equal(c.status().armed, true); assert.ok(h.transport.writeRecords().length > 1);
  } finally { await c.dispose(); }
});

test('polled reload clears genuine queued script events and rejects a stale in-flight receipt', async () => {
  const value = session(), h = await output(value, 'polled'), c = h.coordinator;
  try {
    h.transport.planWrite({ kind: 'defer' }); assert.equal(c.refresh(), 'accepted'); await settle();
    await h.tick(220); assert.equal(c.refresh(), 'accepted');
    assert.equal(c.status().inFlight, true); assert.ok(c.status().queuedEvents > 0);
    const token = value.beginScriptReload(['L0']); assert.equal(c.refresh(), 'ignored');
    assert.equal(c.status().armed, true); assert.equal(c.status().queuedEvents, 0);
    await h.tick(220); assert.equal(c.refresh(), 'ignored');
    h.transport.resolveNextWrite(); await settle();
    assert.equal(h.transport.writeRecords().length, 1); assert.equal(c.status().completedLocalWrites, 0);
    value.completeScriptReload(token, [binding('L0', resource('fresh', .9))]); assert.equal(c.refresh(), 'ignored');
    await h.tick(); assert.equal(c.refresh(), 'accepted'); await settle();
    assert.equal(c.status().armed, true); assert.equal(h.transport.writeRecords().length, 2);
  } finally { await c.dispose(); }
});

for (const outcome of ['missing', 'locked']) test(`${outcome} successful reload invalidates old receipts even when no output refresh observed pending`, async () => {
  const value = session(axis => { axis.lockScript = outcome === 'locked'; });
  const h = await output(value), c = h.coordinator;
  try {
    h.transport.planWrite({ kind: 'defer' }); c.refresh(); await h.time.advance(10);
    await h.tick(); c.refresh(); await h.time.advance(10); assert.equal(c.status().pendingFixed, true);
    const original = axisBinding(value), revision = source(value).authorization.sourceConfigurationRevision;
    const token = value.beginScriptReload(['L0']); await h.tick();
    value.completeScriptReload(token, outcome === 'missing' ? [] : [binding('L0', resource('locked-out'))]);
    await h.tick(); assert.equal(axisBinding(value), original);
    assert.ok(source(value).authorization.sourceConfigurationRevision > revision);
    assert.equal(c.refresh(), 'accepted'); assert.equal(c.status().pendingFixed, false);
    h.transport.resolveNextWrite(); await settle();
    assert.equal(h.transport.writeRecords().length, 1); assert.equal(c.status().completedLocalWrites, 0);
    assert.deepEqual(c.status().lastWritten, []); assert.equal(c.status().armed, true);
    await h.time.advance(10); assert.equal(h.transport.writeRecords().length, 2);
  } finally { await c.dispose(); }
});

for (const kind of ['fixed', 'polled']) test(`${kind}: pending or successful reload never acquires a new output Arm`, async () => {
  const value = session(), h = await output(value, kind, 'activePlayback', false), c = h.coordinator;
  try {
    const token = value.beginScriptReload(['L0']); assert.equal(c.arm(), false); assert.equal(c.status().armed, false);
    await h.tick(); c.refresh(); assert.equal(c.status().armed, false);
    value.completeScriptReload(token, [binding('L0', resource('fresh'))]); assert.equal(c.arm(), false);
    await h.tick(); c.refresh(); await h.time.advance(10);
    assert.equal(c.status().armed, false); assert.equal(h.transport.writeRecords().length, 0);
    assert.equal(c.arm(), true, 'only a later explicit Arm on a genuine current frame may grant intent');
  } finally { await c.dispose(); }
});

for (const name of ['stop', 'background', 'source', 'cancellation']) test(`${name} cannot resume a previous output Arm after rejecting delayed reload publication`, async () => {
  const value = session(), h = await output(value), c = h.coordinator;
  try {
    const token = value.beginScriptReload(['L0']); c.refresh(); assert.equal(c.status().armed, true);
    cancellations[name](value, token); c.refresh();
    assert.equal(c.status().armed, false);
    assert.equal(value.completeScriptReload(token, [binding('L0', resource('late'))]), false);
    if (name === 'background') value.setForeground(true);
    value.play(); await h.tick(); c.refresh(); await h.time.advance(10);
    assert.equal(c.status().armed, false); assert.equal(h.transport.writeRecords().length, 0);
  } finally { await c.dispose(); }
});

test('cancellation cannot retain an Arm when the coordinator misses the entire pending interval', async () => {
  const value = session(), h = await output(value), c = h.coordinator;
  try {
    const token = value.beginScriptReload(['L0']);
    value.cancelScriptReload(token); await h.tick(); c.refresh(); await h.time.advance(10);
    assert.equal(c.status().armed, false); assert.equal(h.transport.writeRecords().length, 0);
    assert.equal(value.completeScriptReload(token, [binding('L0', resource('late'))]), false);
  } finally { await c.dispose(); }
});
