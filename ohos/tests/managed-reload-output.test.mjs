import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { setup, edit, connect, settle, SettingsSchema } from './multi-output-helpers.mjs';

const {SerialOutputPreferences}=await import('../entry/src/main/ets/settings/SerialOutputPreferences.ts');
const {SerialDiagnosticSnapshot}=await import('../entry/src/main/ets/app/SerialDiagnosticSession.ts');
const { FunscriptParser } = await import('../entry/src/main/ets/core/Funscript.ts');
const { ResourceFileEntry } = await import('../entry/src/main/ets/core/ResourceLibrary.ts');
const { OutputSettingsModel, OutputSettingsDraft } = await import('../entry/src/main/ets/output/OutputSettingsModel.ts');
const { OutputEndpoint } = await import('../entry/src/main/ets/output/OutputCoordinator.ts');
const { KeyboardInputSession } = await import('../entry/src/main/ets/app/KeyboardInputSession.ts');
const { SettingsDraftOwner } = await import('../entry/src/main/ets/presentation/SettingsDraftOwner.ts');

// Keep the actual panel's edit -> Disarm -> draft publication ordering, as well
// as actual Index, NativeOutputSession, collection, coordinators and scheduler.
// Only platform Download I/O and physical transports are mocked.
const panelSource = readFileSync(new URL('../entry/src/main/ets/components/OutputSettingsPanel.ets', import.meta.url), 'utf8');
const panelBody = ('class Panel {' + panelSource.slice(panelSource.indexOf('export struct OutputSettingsPanel {') +
  'export struct OutputSettingsPanel {'.length, panelSource.indexOf('  build() {')) + '}')
  .replace(/@Prop\s*@Watch\([^)]*\)\s*/g, '').replace(/@Prop\s*|@State\s*/g, '');
const Panel = new Function('SerialDiagnosticSnapshot','SerialOutputPreferences','OutputSettingsModel', 'OutputSettingsDraft', 'OutputEndpoint', 'KeyboardInputSession', 'SettingsDraftOwner',
  stripTypeScriptTypes(panelBody) + '; return Panel;')(SerialDiagnosticSnapshot,SerialOutputPreferences,OutputSettingsModel, OutputSettingsDraft, OutputEndpoint, KeyboardInputSession, SettingsDraftOwner);

function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function operation() { return { started: deferred(), completion: deferred(), respectCancellation: false }; }
const contents = (start = 10) => JSON.stringify({ actions: [{ at: 0, pos: start }, { at: 200, pos: 90 }, { at: 400, pos: 20 }, { at: 10000, pos: 80 }],
  axes: [{ id: 'R0', actions: [{ at: 0, pos: 30 }, { at: 10000, pos: 70 }] }] });
const port = (h, id) => h.ports.filter(item => item.id === id).at(-1).port;
const coordinator = (h, id) => h.page.output.get(id);
async function tick(h, elapsed = 40) { await h.time.advance(elapsed); h.engine.tick(elapsed, h.time.now); h.page.syncOutput(); }
function mountPanel(h, id) {
  const panel = new Panel(); panel.profile = h.page.outputProfile; panel.profileId = h.page.outputDeviceId;
  panel.draft = h.Owner.draftSnapshot(id); panel.appliedConfigurationId = coordinator(h, id).appliedConfigurationId();
  panel.onDraftChange = draft => h.page.updateOutputDraft(draft);
  panel.onDisarm = (target, generation) => h.page.disarmOutput(target, generation);
  panel.aboutToAppear(); return panel;
}
async function harness({ polled = false } = {}) {
  const cfg = SettingsSchema.defaults();
  for (const key of Object.keys(cfg.sync)) if (key.startsWith('sync')) cfg.sync[key] = false;
  cfg.sync.durationSeconds = .5; cfg.playback.autoSkipEnabled = false;
  for (const item of cfg.axisSettingsByDevice.find(device => device.deviceId === cfg.selectedDeviceId).axes) {
    item.settings.autoHomeEnabled = false; item.settings.selectedMotionProvider = null; item.settings.updateMotionProviderWithAxis = null;
  }
  const h = setup(cfg, { actualResources: true }); h.ids = [];
  for (const kind of ['tcp', 'udp', 'webSocket']) {
    h.page.addOutputTarget(kind); const id = h.page.selectedOutputId; h.ids.push(id);
    const draft = edit(h, id); draft.model.dirtyOnly = false; draft.model.polled = polled; draft.editRevision++;
    h.page.updateOutputDraft(draft);
  }
  const root = 'file://docs/Download/com.multifunplayer.ohos';
  const video = new ResourceFileEntry(root + '/film.mp4', 'film.mp4', 'film.mp4');
  const script = new ResourceFileEntry(root + '/film.funscript', 'film.funscript', 'film.funscript');
  h.page.libraryRoot = root; h.page.libraryLoaded = true; h.page.mediaCatalog = [video, script];
  h.page.videoMode = true; h.page.activeVideoFile = video; h.state.scanFiles = [video, script];
  h.state.scriptText = contents(70);
  h.engine.load(FunscriptParser.parse(contents())); h.engine.play(); h.time.now = 40; h.engine.tick(40, 40); h.page.syncOutput();
  for (const id of h.ids) assert.ok(await connect(h, id));
  return h;
}

async function armWithOldBacklog(h) {
  const [first, second, idle] = h.ids;
  for (const id of [first, second]) { port(h, id).planWrite({ kind: 'defer' }); h.page.armOutput(id); }
  await h.time.advance(10); await tick(h, h.Owner.draftSnapshot(first).model.polled ? 170 : 40); await h.time.advance(10);
  for (const id of [first, second]) {
    const status = coordinator(h, id).status();
    assert.equal(status.armed, true); assert.equal(status.inFlight, true);
    assert.ok(status.pendingFixed || status.queuedEvents > 0); assert.equal(port(h, id).writeRecords().length, 1);
  }
  assert.equal(coordinator(h, idle).status().armed, false);
}

for (const change of ['scope', 'reconfigure', 'disconnect']) test(`real multi-target ${change} during managed reload leaves that target disarmed and resumes only unaffected prior intent`, async () => {
  const h = await harness(); const [changed, survivor, idle] = h.ids;
  try {
    await armWithOldBacklog(h);
    const oldChanged = port(h, changed), oldSurvivor = port(h, survivor), before = h.engine.frame();
    const oldResource = h.engine.bindings().find(binding => binding.axisName === 'L0').resource;
    const scan = operation(); h.scans.push(scan); const reload = h.page.reloadManagedAxisScripts(['L0']);
    await scan.started.promise;
    assert.equal(h.engine.frame(), before, 'Index starts the pending boundary without a tick');
    for (const id of [changed, survivor]) {
      assert.equal(coordinator(h, id).status().armed, true); assert.equal(coordinator(h, id).status().pendingFixed, false);
      assert.equal(coordinator(h, id).status().queuedEvents, 0);
    }
    await tick(h); assert.equal(h.engine.dispatchSource(['L0']).availability, 'pendingCurrentFrame');
    if (change === 'disconnect') await h.page.disconnectOutput(changed);
    else {
      const panel = mountPanel(h, changed);
      if (change === 'scope') panel.model.ranges = panel.model.ranges.map(range => ({ ...range, enabled: range.axisId === 'R0' }));
      else panel.port++;
      panel.changed(); assert.equal(coordinator(h, changed).status().armed, false);
      assert.equal(h.Owner.draftSnapshot(changed).applicationId, 0);
      assert.ok(await connect(h, changed));
      assert.equal(coordinator(h, changed).status().armed, false);
    }
    assert.equal(coordinator(h, survivor).status().armed, true);
    assert.equal(coordinator(h, idle).status().armed, false);
    oldChanged.resolveNextWrite(); oldSurvivor.resolveNextWrite(); await settle();
    assert.equal(oldChanged.writeRecords().length, 1); assert.equal(oldSurvivor.writeRecords().length, 1);
    assert.equal(coordinator(h, survivor).status().completedLocalWrites, 0); assert.deepEqual(coordinator(h, survivor).status().lastWritten, []);
    const completing = h.engine.frame(); scan.completion.resolve(); await reload;
    assert.equal(h.engine.frame(), completing); h.page.syncOutput(); await h.time.advance(10);
    const fresh = h.engine.bindings().find(binding => binding.axisName === 'L0').resource;
    assert.notEqual(fresh, oldResource); assert.equal(fresh.keyframes[0].value, .7);
    assert.ok(h.calls.some(call => call[0] === 'read' && call[1].endsWith('/film.funscript')));
    assert.equal(oldSurvivor.writeRecords().length, 1, 'resolved I/O alone cannot authorize the preceding frame');
    await tick(h); await h.time.advance(10);
    assert.equal(coordinator(h, survivor).status().armed, true); assert.ok(oldSurvivor.writeRecords().length > 1);
    assert.equal(coordinator(h, changed).status().armed, false); assert.equal(coordinator(h, idle).status().armed, false);
    assert.equal(oldChanged.writeRecords().length, 1); assert.equal(port(h, idle).writeRecords().length, 0);
    if (change !== 'disconnect') assert.equal(port(h, changed).writeRecords().length, 0);
    assert.equal(h.calls.some(call => call[0] === 'video' || call[0] === 'nativePlay'), false);
  } finally { await h.page.output.dispose(); }
});

test('real Index pending reload invalidates polled backlog for every target and late receipts cannot pump old events', async () => {
  const h = await harness({ polled: true }); const [first, second, idle] = h.ids;
  try {
    await armWithOldBacklog(h);
    const scan = operation(); h.scans.push(scan); const reload = h.page.reloadManagedAxisScripts(['L0']);
    await scan.started.promise;
    for (const id of [first, second]) assert.equal(coordinator(h, id).status().queuedEvents, 0);
    // The old receipt is late relative to the transaction boundary, while still
    // inside its original write deadline. Expired writes must fault separately.
    for (const id of [first, second]) { port(h, id).resolveNextWrite(); }
    await settle();
    for (const id of [first, second]) {
      assert.equal(port(h, id).writeRecords().length, 1); assert.equal(coordinator(h, id).status().completedLocalWrites, 0);
      assert.deepEqual(coordinator(h, id).status().lastWritten, []);
    }
    await tick(h, 200);
    scan.completion.resolve(); await reload; h.page.syncOutput();
    for (const id of [first, second]) assert.equal(port(h, id).writeRecords().length, 1);
    await tick(h); await settle();
    for (const id of [first, second]) {
      assert.equal(coordinator(h, id).status().armed, true); assert.equal(port(h, id).writeRecords().length, 2);
    }
    assert.equal(coordinator(h, idle).status().armed, false); assert.equal(port(h, idle).writeRecords().length, 0);
  } finally { await h.page.output.dispose(); }
});
