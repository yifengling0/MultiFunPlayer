import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
registerHooks({ resolve(s, c, next) { return next(s.startsWith('.') && !/\.[a-z]+$/i.test(s) ? s + '.ts' : s, c); } });
const { PlaybackSessionCore } = await import('../entry/src/main/ets/core/PlaybackSessionCore.ts');
const { SettingsSchema } = await import('../entry/src/main/ets/settings/SettingsSchema.ts');
const { FunscriptParser } = await import('../entry/src/main/ets/core/Funscript.ts');
const { MediaClock } = await import('../entry/src/main/ets/core/MediaClock.ts');
const { OutputCoordinator, OutputEndpoint } = await import('../entry/src/main/ets/output/OutputCoordinator.ts');
const { OutputSettingsModel } = await import('../entry/src/main/ets/output/OutputSettingsModel.ts');
const { MemoryTransport } = await import('../entry/src/main/ets/output/MemoryTransport.ts');
const index = readFileSync(new URL('../entry/src/main/ets/pages/Index.ets', import.meta.url), 'utf8');
const start = index.indexOf('  armOutput('), end = index.indexOf('  disarmOutput(', start);
assert.ok(start >= 0 && end > start, 'extract the actual production Index.armOutput method');
const pageSource = stripTypeScriptTypes('class Page {\n' + index.slice(start, end) + '\n}');

async function fixture({ motion = true, permitMotion = true } = {}) {
  const config = SettingsSchema.defaults();
  for (const key of Object.keys(config.sync)) if (key.startsWith('sync')) config.sync[key] = false;
  const axis = config.axisSettingsByDevice.find(d => d.deviceId === config.selectedDeviceId).axes.find(a => a.axisName === 'L0').settings;
  Object.assign(axis, { autoHomeEnabled: false, bypassScript: motion, selectedMotionProvider: 'Pattern',
    motionProviderBlend: motion ? 1 : 0, updateMotionProviderWhenPaused: motion, updateMotionProviderWithoutScript: motion });
  const session = new PlaybackSessionCore(config);
  session.setConnected(true);
  session.load(FunscriptParser.parse('{"actions":[{"at":0,"pos":10},{"at":10000,"pos":90}]}'));
  session.useExternalClock(true);
  const media = new MediaClock(), generation = media.reset('loading');
  media.prepared(generation, 20000, 1000, 100); session.acceptNativeSnapshot(media.snapshot()); session.play();
  media.requestPlay(); media.stateChanged(generation, 'playing'); session.acceptNativeSnapshot(media.snapshot());
  session.tick(100, 200); session.pause();
  media.pause(); media.stateChanged(generation, 'paused'); session.acceptNativeSnapshot(media.snapshot()); session.tick(40, 240);
  const clock = { now: 240, id: 0, tasks: new Map(), nowMs() { return this.now; },
    scheduleAt(at, run) { this.tasks.set(++this.id, { at, run }); return this.id; }, cancel(id) { this.tasks.delete(id); },
    async advance(ms) { this.now += ms; for (const [id, task] of [...this.tasks]) {
      if (task.at <= this.now && this.tasks.delete(id)) task.run();
    } for (let i = 0; i < 30; i++) await Promise.resolve(); } };
  const transport = new MemoryTransport(clock);
  const coordinator = new OutputCoordinator({ inspect: () => ({ available: true, diagnostic: 'memory only' }), create: () => transport }, session,
    { maximumFrameAgeMs: 200, maximumClockAgeMs: 200, maximumEventAgeMs: 100, maximumFixedElapsedMs: 1000,
      writeTimeoutMs: 100, maximumPolledQueueLength: 4, allowZeroInterval: true }, clock, clock);
  const model = new OutputSettingsModel(); model.dirtyOnly = false; model.pausedMotion = permitMotion;
  model.ranges = session.activeRegistry().axes.map(a => ({ axisId: a.name, minimum: 0, maximum: 1, enabled: a.name === 'L0' }));
  const outputConfig = { ...model.config({ precision: 4, revision: session.activeRegistry().revision,
    axisOrder: session.activeRegistry().axes.map(a => a.name), maximumDurationMs: 10000, maximumPayloadBytes: 1024 }), kind: 'memory' };
  assert.equal(await coordinator.connect(outputConfig, new OutputEndpoint()), true);
  const NativeOutputSession = { selectedId: () => 'memory', matchesTarget: (id, gen) => id === 'memory' && gen === 1,
    draftSnapshot: () => ({ targetGeneration: 1, applicationId: coordinator.appliedConfigurationId(), profileRevision: session.activeRegistry().revision }),
    draftDiagnostic: () => '' };
  const Page = new Function('NativeOutputSession', 'SerialDiagnosticSession', 'SocketDiagnosticSession', pageSource + ';return Page;')(
    NativeOutputSession, { blocked: () => false }, { blocked: () => false });
  const page = new Page();
  Object.assign(page, { videoMode: true, viewActive: true, foreground: true, confirmationCloseUnconfirmed: false,
    runtimeBusy: false, settingsReadOnly: false, recoveryRequired: false, engine: session,
    outputProfile: { revision: session.activeRegistry().revision },
    output: { get: id => id === 'memory' ? coordinator : null, isRemoving: () => false }, syncOutput: () => {} });
  return { page, session, media, clock, transport, coordinator };
}

test('actual Index Arm permits a real authorized native pausedMotion frame and sends only after coordinator refresh', async () => {
  const f = await fixture();
  try {
    assert.equal(f.session.snapshot().state, 'paused');
    assert.deepEqual(f.session.dispatchSource(['L0']).authorization.intents, ['pausedMotion']);
    f.page.armOutput('memory', 1);
    assert.equal(f.coordinator.status().armed, true);
    assert.equal(f.transport.writeRecords().length, 0, 'Arm itself never writes');
    assert.equal(f.coordinator.refresh(), 'accepted'); await f.clock.advance(10);
    assert.ok(f.transport.writeRecords().length > 0, 'explicitly permitted paused motion reaches simulated output');
  } finally { await f.coordinator.dispose(); }
});

for (const state of ['unauthorized', 'stopped', 'seeking']) {
  test('actual Index Arm rejects native ' + state + ' frames without sending', async () => {
    const f = await fixture({ motion: state !== 'unauthorized' });
    try {
      if (state === 'stopped') f.session.stop();
      if (state === 'seeking') { f.media.beginSeek(); f.session.acceptNativeSnapshot(f.media.snapshot()); }
      assert.equal(f.session.dispatchSource(['L0']).authorization, null);
      f.page.armOutput('memory', 1);
      assert.equal(f.coordinator.status().armed, false);
      f.coordinator.refresh(); await f.clock.advance(10);
      assert.equal(f.transport.writeRecords().length, 0);
    } finally { await f.coordinator.dispose(); }
  });
}

test('paused Motion without target permission cannot dispatch through actual Index Arm', async () => {
  const f = await fixture({ permitMotion: false });
  try {
    assert.deepEqual(f.session.dispatchSource(['L0']).authorization.intents, ['pausedMotion']);
    f.page.armOutput('memory', 1); f.coordinator.refresh(); await f.clock.advance(10);
    assert.equal(f.transport.writeRecords().length, 0, 'target pausedMotion permission remains mandatory');
  } finally { await f.coordinator.dispose(); }
});
