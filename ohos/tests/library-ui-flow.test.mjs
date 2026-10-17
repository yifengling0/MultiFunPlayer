import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes, registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return nextResolve(specifier + '.ts', context);
  return nextResolve(specifier, context);
} });
const { FunscriptDocument, FunscriptParser: ActualFunscriptParser } = await import('../entry/src/main/ets/core/Funscript.ts');
const { PlaybackSessionCore } = await import('../entry/src/main/ets/core/PlaybackSessionCore.ts');
const { DeviceAxisDefinition, DeviceProfiles } = await import('../entry/src/main/ets/core/DeviceProfile.ts');
const { AxisConfiguration, AxisConfigurationEntry, SyncConfiguration } = await import('../entry/src/main/ets/core/AxisConfiguration.ts');
const { UiStyle } = await import('../entry/src/main/ets/presentation/UiStyle.ts');
const { videoWorkspaceLayout } = await import('../entry/src/main/ets/core/VideoLayout.ts');
const { MotionProviderConfiguration } = await import('../entry/src/main/ets/core/MotionConfiguration.ts');
const {OutputSettingsDraft}=await import('../entry/src/main/ets/output/OutputSettingsModel.ts');
const {InternalSourceLibrary}=await import('../entry/src/main/ets/core/playback/InternalSourceLibrary.ts');
const {InternalPlaylist,InternalPlaylistItem,InternalPlaylistEvent}=await import('../entry/src/main/ets/core/playback/InternalPlaylist.ts');
const {PlaylistPresentation,PlaylistPanelSnapshot,PlaylistPanelAction,PlaylistActionContext}=await import('../entry/src/main/ets/core/playback/PlaylistPresentation.ts');
const {PlaybackConfiguration}=await import('../entry/src/main/ets/settings/SettingsSchema.ts');
const {ResourceLibrary: ActualResourceLibrary,ResourceFileEntry: ActualResourceFileEntry,ResourceSelectionResult}=await import('../entry/src/main/ets/core/ResourceLibrary.ts');
const { KeyboardInputSession } = await import('../entry/src/main/ets/app/KeyboardInputSession.ts');
const { KeyboardShortcutConfiguration, ShortcutAction, cloneShortcutAction, shortcutActionCatalog, EMERGENCY_STOP_KEY, isShortcutKey } = await import('../entry/src/main/ets/input/ShortcutConfiguration.ts');
const { applyAxisShortcutAction, applySyncShortcutAction } = await import('../entry/src/main/ets/input/ShortcutSettingActions.ts');
const { applyMediaShortcut, shortcutNameEquals } = await import('../entry/src/main/ets/input/ShortcutMediaActions.ts');
const {applyShortcutPointAction,customCurvePointArguments}=await import('../entry/src/main/ets/input/ShortcutPointActions.ts');
const {resolveManagedLoopingSelection,parseManagedLoopingScript}=await import('../entry/src/main/ets/input/ManagedLoopingSelection.ts');
const {applyOutputEndpointAction,isOutputEndpointAction,outputConnectionOperation}=await import('../entry/src/main/ets/input/ShortcutOutputConnectionActions.ts');
const {OutputEndpoint}=await import('../entry/src/main/ets/output/OutputCoordinator.ts');
const {applyOutputRangeAction}=await import('../entry/src/main/ets/input/ShortcutOutputRangeActions.ts');
const {applyMotionShortcutAction,motionShortcutProviderId}=await import('../entry/src/main/ets/input/ShortcutMotionActions.ts');
const { LocalShortcutEngine, ShortcutDispatch, ShortcutKeyEvent } = await import('../entry/src/main/ets/input/LocalShortcutEngine.ts');
const { GeneralConfiguration } = await import('../entry/src/main/ets/settings/GeneralConfiguration.ts');
const { ErrorPresentation, horizontalWorkspace } = await import('../entry/src/main/ets/presentation/GeneralPresentation.ts');
const {MediaSourceConfiguration}=await import('../entry/src/main/ets/settings/MediaSourceConfiguration.ts');
const {parseMediaSourceShortcut}=await import('../entry/src/main/ets/input/ShortcutSourceActions.ts');
const {deoVrScriptMatchHint,parseDeoVrEndpointText}=await import('../entry/src/main/ets/media/deovr/DeoVrScriptMatch.ts');
class ActualPlaybackEngine extends PlaybackSessionCore { flush() {} }

// Exercise the actual page's state and asynchronous methods, excluding ArkUI
// builders/rendering. Native APIs and Download provisioning are isolated mocks;
// this does not establish real system grants or device lifecycle behavior.
const source = readFileSync(new URL('../entry/src/main/ets/pages/Index.ets', import.meta.url), 'utf8');
const start = source.indexOf('struct Index {');
const end = source.indexOf('  drawTrace(): void', start);
assert.ok(start >= 0 && end > start, 'Index controller extraction boundaries exist');
const controller = ('class Index {' + source.slice(start + 'struct Index {'.length, end) + '}')
  .replace(/@StorageLink\([^)]*\)\s*@Watch\([^)]*\)\s*/g, '')
  .replace(/@State\s*/g, '');
const js = stripTypeScriptTypes(controller);
const ShortcutConnectionOwner = new Function(stripTypeScriptTypes(source.slice(source.indexOf('class ShortcutConnectionOwner'),source.indexOf('@Entry'))) + ';return ShortcutConnectionOwner;')();

function deferred() {
  let resolve;
  const promise = new Promise(value => { resolve = value; });
  return { promise, resolve };
}

function operation(options = {}) {
  return { started: deferred(), completion: deferred(), ...options };
}

function item(stem, scriptCount = 1) {
  const video = { uri: stem + '.mp4', name: stem + '.mp4', scriptCount };
  return {
    status: 'paired', video, videos: [video],
    scripts: Array.from({ length: scriptCount }, (_, index) => ({
      file: { uri: `${stem}.${index}.funscript`, name: `${stem}.${index}.funscript` }
    }))
  };
}

function setup(options = {}) {
  const calls = [];
  const preparations = [];
  const scans = [];
  const reads = [];
  const initialDocument = { axes: [], metadata: {}, source: 'initial' };
  const state = { scriptText: '{}', candidateActions: 0 };
  const inertRemote = { snapshot() { return {status:'disconnected',generation:0,resourceRevision:0,path:null,positionSeconds:null,durationSeconds:null,playing:false,diagnostic:null,closeConfirmed:true}; }, async disconnect() {}, subscribe() { return () => {}; } };
  const dependencies = {
    SocketDiagnosticSession: options.diagnosticOwner || { claimOwner() { return 1; }, owns(owner) { return owner > 0; }, releaseOwner() {}, cancel() {}, blocked() { return false; }, outputsQuiet() { return true; }, snapshot() { return { requestId: 0, busy: false, phase: 'idle' }; } },
    ShortcutConnectionOwner, OutputEndpoint, applyOutputEndpointAction, isOutputEndpointAction, outputConnectionOperation,
    MediaSourceConfiguration, deoVrScriptMatchHint, parseDeoVrEndpointText, parseMediaSourceShortcut, RemoteMediaSession: options.remoteOwner || { current: kind => (kind === 'heresphere' ? options.hereSphereSource : options.remoteSource) || inertRemote, allClosed: () => [options.remoteSource, options.hereSphereSource].every(source => !source || source.snapshot().closeConfirmed) },
    KeyboardInputSession, KeyboardShortcutConfiguration, ShortcutAction, cloneShortcutAction, shortcutActionCatalog, EMERGENCY_STOP_KEY, isShortcutKey,
    resolveManagedLoopingSelection, parseManagedLoopingScript, applyOutputRangeAction, SettingsOption: class { constructor(value,label){this.value=value;this.label=label;} },
    applyAxisShortcutAction, applySyncShortcutAction, applyMediaShortcut, shortcutNameEquals, applyShortcutPointAction, customCurvePointArguments, applyMotionShortcutAction, motionShortcutProviderId, LocalShortcutEngine, ShortcutDispatch, ShortcutKeyEvent, GeneralConfiguration, ErrorPresentation, horizontalWorkspace,
    ResourceSelectionResult, videoWorkspaceLayout, UiStyle, OutputSettingsDraft, InternalSourceLibrary, InternalPlaylist, InternalPlaylistItem, InternalPlaylistEvent, PlaylistPresentation, PlaylistPanelSnapshot, PlaylistPanelAction, PlaylistActionContext, PlaybackConfiguration,
    NativeWindowPresentation: { setListener() { return 1; }, releaseOwner() { return Promise.resolve(); }, requestForOwner(_owner, value) { calls.push(['presentationRequest', value]); return Promise.resolve(); } },
    NativeOutputSession: { matchesTarget() { return true; }, canConnect() { return true; }, restore() {}, synchronizeProfile() {}, summaries() { return []; }, selectedId() { return 'manual-network'; }, draftDiagnostic() { return ''; }, draftSnapshot(){return new OutputSettingsDraft();},saveDraft(){return true;}, setForeground(value) { calls.push(['outputForeground',value]); }, current() { return {
      ids() { return []; }, get() { return this; }, isRemoving() { return false; }, stop() {}, disarm() {}, beginSourceSeek() { calls.push(['outputBeginSeek']); return false; }, setForeground() {}, refresh() {}, status() { return null; },
      appliedConfigurationId(){return 0;}, isBusy() { return false; }, message() { return ''; }, async connect() { return false; }, async disconnect() {}
    }; } },
    deviceInfo: { deviceType: 'phone' },
    Scroller: class { scrollEdge() { calls.push(['scrollTop']); } },
    Edge: { Top: 0 },
    DEMO: '{}',
    FunscriptDocument,
    FunscriptParser: { parse: () => initialDocument, MAX_ACTIONS: 100000 },
    DeviceAxisDefinition, AxisConfiguration, AxisConfigurationEntry, SyncConfiguration, MotionProviderConfiguration,
    ManagedMotionScriptResource: class { constructor(uri, name) { Object.assign(this, { uri, name }); } },
    PlaybackSession: { current: () => new class {
      isDeoVrSource() { return false; }
      deoVrReady() { return false; }
      mediaSourceConfiguration() { return new MediaSourceConfiguration(); }
      cancelSourceSeek() {}
      outputConfiguration() { return {}; }
      playbackConfiguration() { return new PlaybackConfiguration(); }
      keyboardConfiguration() { return new KeyboardShortcutConfiguration(); }
      generalConfiguration() { return new GeneralConfiguration(); }
      pause() { calls.push(['pause']); }
      load(document) { calls.push(['load', document]); }
      loadBindings(document) { calls.push(['load', document]); }
      resources() { return []; }
      activeRegistry() { return { axes: [], profile: DeviceProfiles.getBuiltIn(), revision: 1 }; }
      flush() {}
      clearScripts() { calls.push(['clearScripts']); }
      stop() {}
      setInterpolationMode() {}
      isManualPreviewActive() { return false; }
      revokeManualPreview() {}
      detachMotionCanvas() {}
      hasPendingProfileChanges() { return false; }
      setConnected() {}
      useExternalClock(value) { calls.push(['externalClock', value]); }
      setForeground(value) { calls.push(['foreground', value]); }
    } },
    NativeVideoAdapter: class {
      snapshot() { return { failure: state.cleanupFailure || '' }; }
      async release() { calls.push(['release']); }
      pause() {}
      seek() {}
      setVolume() {}
      play() { calls.push(['nativePlay']); }
      open(uri, surface) { calls.push(['video', uri, surface]); }
      dispose() {}
    },
    VideoSurfaceController: class {},
    CanvasRenderingContext2D: class {},
    RenderingContextSettings: class {},
    ResourceFileEntry: class {
      constructor(uri, name, relativePath) { Object.assign(this, { uri, name, relativePath }); }
    },
    LoadedScriptInput: class { constructor(file, contents) { Object.assign(this, {file, contents}); } },
    ResourceLibraryCatalog: class { constructor(rootIdentity, files, recursive) { Object.assign(this, {rootIdentity, files, recursive}); } },
    ResourceDiscoveryCandidate: class { constructor(file, kind) { Object.assign(this, {file, kind}); } },
    ScriptLibrarySource: class {},
    ScriptZipFiles: { async readScripts(uri) { calls.push(['zip', uri]); if (state.zipError) throw Error(state.zipError); return state.zipEntries || []; } },
    DownloadLibrary: {
      async prepare() {
        calls.push(['prepare']);
        const pending = preparations.shift();
        // Deliberately allow stale completion to exercise the page's own guard.
        const root = pending ? await pending.promise : 'file://docs/Download/com.multifunplayer.ohos';
        if (state.prepareError) throw Error(state.prepareError);
        return { uri: root, path: root, displayPath: 'Download/com.multifunplayer.ohos' };
      }
    },
    ResourceLibrary: {
      planSearch(video, files, libraries) { calls.push(['plan', files, libraries]); if (state.plan) return state.plan; return Array.from({length: video.scriptCount}, (_,index) => ({kind: 'script', file: {uri: video.uri.replace('.mp4', '') + '.' + index + '.funscript', name: video.uri.replace('.mp4', '') + '.' + index + '.funscript'}})); },
      build: entries => ({ items: entries.map(entry => ({ ...entry, videos: /\.(mp4|mkv|m4v|ts)$/i.test(entry.name) ? [entry] : [] })) }),
      parseCandidate(_contents, file) {
        calls.push(['parse', file.uri]);
        if (state.parseError) throw Error(state.parseError);
        return { file, document: { axes: [{ actions: new Array(state.candidateActions) }], metadata: {}, source: file.uri } };
      },
      selectDocuments(_name, candidates) {
        calls.push(['select', candidates.length]);
        return { document: candidates[0]?.document, axisSources: [], selectedFiles: candidates.map(candidate => candidate.file) };
      }
    },
    LibraryFiles: {
      async scanDirectory(uri, current, progress) {
        calls.push(['scan', uri]);
        const pending = scans.shift();
        if (pending) {
          pending.started.resolve();
          await pending.completion.promise;
        }
        // A stale native callback can still arrive. Tests can intentionally
        // bypass this lower-layer guard to verify Index's own generation checks.
        if (pending?.respectCancellation !== false && !current()) { throw Error('Scan cancelled'); }
        if (state.scanError) throw Error(state.scanError);
        const files = state.scanFiles ?? [{ uri: uri + '/film.mp4', name: 'film.mp4', relativePath: 'film.mp4' }];
        progress({ files, visited: files.length, skipped: 0 });
        return { files, skipped: 0, truncated: state.scanTruncated || false, warnings: state.scanWarnings || [] };
      },
      async readScript(uri, current) {
        calls.push(['read', uri]);
        const pending = reads.shift();
        if (pending) {
          pending.started.resolve();
          await pending.completion.promise;
        }
        if (pending?.respectCancellation !== false && !current()) { throw Error('Read cancelled'); }
        return state.scriptTexts?.[uri] ?? state.scriptText;
      }
    },
    canIUse: () => true,
    systemDateTime: { getUptime: () => state.now ?? 0, TimeType: { ACTIVE: 0 } },
    setTimeout: callback => { queueMicrotask(callback); return 1; },
    setInterval: () => 1,
    clearInterval: () => {},
    fileIo: {},
    util: {}
  };
  if(options.outputOwner) { dependencies.NativeOutputSession=options.outputOwner; }
  if(options.engine) { dependencies.PlaybackSession={current:()=>options.engine}; }
  if(options.actualResources) { dependencies.ResourceLibrary=ActualResourceLibrary; dependencies.FunscriptParser=ActualFunscriptParser; }
  const Index = new Function(...Object.keys(dependencies), js + '\nreturn Index;')(...Object.values(dependencies));
  const page = new Index();
  page.viewActive = true;
  page.foreground = true;
  page.sync = () => {};
  const syncPlaylist = page.syncPlaylist.bind(page); page.syncPlaylist = () => {};
  page.restoreLoopingScripts = async () => {};
  page.getUIContext = () => ({ getHostContext: () => ({}) });
  return { page, calls, preparations, scans, reads, state, initialDocument, syncPlaylist };
}

test('stale Download preparation cannot start IO or clear a newer scan busy state', async () => {
  const { page, calls, preparations } = setup();
  const first = deferred();
  const second = deferred();
  preparations.push(first, second);
  const oldSelection = page.scanDownloads();
  await Promise.resolve();
  page.cancelLibrary();
  const newerSelection = page.scanDownloads();
  first.resolve('file://docs/old');
  await oldSelection;
  assert.equal(page.libraryBusy, true);
  assert.equal(page.libraryLoaded, false);
  assert.equal(calls.some(([kind]) => kind === 'scan'), false);
  second.resolve('file://docs/new');
  await newerSelection;
  assert.equal(page.libraryItems[0].uri, 'file://docs/new/film.mp4');
  assert.equal(page.libraryBusy, false);
  assert.equal(page.libraryLoaded, true);
});

test('cancelled scan cannot publish stale progress or completion over a newer Download scan', async () => {
  const { page, preparations, scans } = setup();
  const first = deferred();
  const second = deferred();
  const scan = operation({ respectCancellation: false });
  preparations.push(first, second);
  scans.push(scan);
  const oldSelection = page.scanDownloads();
  first.resolve('file://docs/old');
  await scan.started.promise;
  page.cancelLibrary();
  const newerSelection = page.scanDownloads();
  second.resolve('file://docs/new');
  await newerSelection;
  const newerMessage = page.libraryMessage;
  scan.completion.resolve();
  await oldSelection;
  assert.equal(page.libraryItems[0].uri, 'file://docs/new/film.mp4');
  assert.equal(page.libraryMessage, newerMessage);
  assert.equal(page.libraryBusy, false);
});

test('failed Download preparation is explicit and a manual refresh retries instead of treating failure as empty', async () => {
  const { page, state, calls } = setup();
  state.prepareError = 'permission denied (13900012)';
  await page.scanDownloads();
  assert.equal(page.libraryLoaded, false);
  assert.equal(page.libraryBusy, false);
  assert.match(page.libraryMessage, /Cannot scan.*permission denied.*13900012/);
  assert.equal(calls.some(([kind]) => kind === 'scan'), false);
  state.prepareError = undefined;
  await page.refreshLibrary();
  assert.equal(page.libraryLoaded, true);
  assert.equal(calls.filter(([kind]) => kind === 'prepare').length, 2);
  assert.equal(calls.filter(([kind]) => kind === 'scan').length, 1);
});

test('directory scan failure stays distinct from a successfully empty directory', async () => {
  const { page, state, calls } = setup();
  state.scanError = 'Cannot read folder: permission denied';
  await page.scanDownloads();
  assert.equal(page.libraryLoaded, false);
  assert.match(page.libraryMessage, /Cannot scan.*permission denied/);
  state.scanError = undefined;
  state.scanFiles = [];
  await page.refreshLibrary();
  assert.equal(page.libraryLoaded, true);
  assert.deepEqual(page.libraryItems, []);
  assert.match(page.libraryMessage, /No media found/);
  assert.doesNotMatch(page.libraryMessage, /Cannot scan/);
  await page.refreshLibrary();
  assert.equal(calls.filter(([kind]) => kind === 'prepare').length, 3);
});

test('repeated refresh clicks do not overlap Download preparation', async () => {
  const { page, preparations, calls } = setup();
  const pending = deferred();
  preparations.push(pending);
  const running = page.scanDownloads();
  await page.refreshLibrary();
  await page.scanDownloads();
  assert.equal(calls.filter(([kind]) => kind === 'prepare').length, 1);
  pending.resolve('file://docs/ready');
  await running;
  assert.equal(page.libraryLoaded, true);
  assert.equal(calls.filter(([kind]) => kind === 'scan').length, 1);
});

test('backgrounding cancels pending Download preparation and suppresses stale IO and success', async () => {
  const { page, preparations, calls } = setup();
  const pending = deferred();
  preparations.push(pending);
  const running = page.scanDownloads();
  await Promise.resolve();
  page.foreground = false;
  page.foregroundChanged();
  const cancelledMessage = page.libraryMessage;
  pending.resolve('file://docs/stale');
  await running;
  assert.equal(page.libraryBusy, false);
  assert.equal(page.libraryLoaded, false);
  assert.equal(page.libraryMessage, cancelledMessage);
  assert.equal(calls.some(([kind]) => kind === 'scan'), false);
});

test('page startup scans automatically and page disposal cancels the pending preparation', async () => {
  const { page, preparations, calls } = setup();
  const pending = deferred();
  preparations.push(pending);
  page.aboutToAppear();
  await Promise.resolve();
  assert.equal(calls.filter(([kind]) => kind === 'prepare').length, 1);
  page.aboutToDisappear();
  pending.resolve('file://docs/stale');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.some(([kind]) => kind === 'scan'), false);
  assert.equal(page.libraryBusy, false);
  assert.equal(page.viewActive, false);
});

test('the same page can reappear with a cleared document using the real pipeline session', async () => {
  const { page, state, calls } = setup();
  page.engine = new ActualPlaybackEngine();
  page.document = new FunscriptDocument([]);
  state.scanFiles = [];
  assert.doesNotThrow(() => page.aboutToAppear());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.libraryLoaded, true);
  page.aboutToDisappear();
  assert.doesNotThrow(() => page.aboutToAppear());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.libraryLoaded, true);
  assert.deepEqual(page.document.axes, []);
  assert.equal(page.engine.previewSamples().length, 6);
  assert.ok(page.engine.previewSamples().every(sample => Number.isNaN(sample.position)));
  assert.equal(calls.filter(([kind]) => kind === 'prepare').length, 2);
  page.aboutToDisappear();
});

test('closing and reopening an already loaded empty list does not trigger a preparation loop', async () => {
  const { page, state, calls } = setup();
  state.scanFiles = [];
  await page.scanDownloads();
  page.showLibrary();
  page.showLibrary();
  page.showLibrary();
  assert.equal(page.libraryLoaded, true);
  assert.equal(calls.filter(([kind]) => kind === 'prepare').length, 1);
});

test('an access failure on refresh discards the obsolete catalog and root', async () => {
  const { page, state } = setup();
  await page.scanDownloads();
  assert.equal(page.libraryItems.length, 1);
  state.prepareError = 'permission denied';
  await page.refreshLibrary();
  assert.equal(page.libraryLoaded, false);
  assert.deepEqual(page.libraryItems, []);
  assert.deepEqual(page.mediaCatalog, []);
  assert.equal(page.libraryRoot, '');
  assert.match(page.libraryMessage, /permission denied/);
});

test('the visible library contains videos while retaining all script and ZIP candidates for matching', async () => {
  const { page, state } = setup();
  state.scanFiles = ['film.mp4', 'film.funscript', 'film.zip', 'unpaired.funscript']
    .map(name => ({ uri: 'file://docs/root/' + name, name, relativePath: name }));
  await page.scanDownloads();
  assert.deepEqual(page.libraryItems.map(entry => entry.name), ['film.mp4']);
  assert.deepEqual(page.mediaCatalog.map(entry => entry.name), ['film.mp4', 'film.funscript', 'film.zip', 'unpaired.funscript']);
});

test('refresh success, failure or cancellation closes old media and clears real engine scripts before rescan', async () => {
  for (const outcome of ['success', 'failure', 'cancel']) {
    const { page, state, preparations, calls } = setup();
    page.engine = new ActualPlaybackEngine();
    const prior = ActualFunscriptParser.parse('{"actions":[{"at":0,"pos":0},{"at":1000,"pos":100}]}');
    page.document = prior;
    page.engine.load(prior);
    page.engine.setConnected(true);
    page.engine.play();
    page.videoMode = true;
    page.videoReady = true;
    page.videoFullscreen = true;
    page.pendingVideoUri = 'old.mp4';
    const pending = deferred();
    preparations.push(pending);
    const refreshing = page.refreshLibrary();
    assert.deepEqual(page.document.axes, [], outcome);
    assert.equal(page.engine.previewSamples().length, 6, outcome);
    assert.ok(page.engine.previewSamples().every(sample => Number.isNaN(sample.position)), outcome);
    assert.equal(page.videoMode, false, outcome);
    assert.equal(page.videoReady, false, outcome);
    assert.equal(page.videoFullscreen, false, outcome);
    assert.equal(page.pendingVideoUri, '', outcome);
    await Promise.resolve();
    if (outcome === 'failure') state.prepareError = 'permission denied';
    if (outcome === 'cancel') page.cancelLibrary();
    pending.resolve('file://docs/new');
    await refreshing;
    await page.playPause();
    assert.deepEqual(page.engine.snapshot().outputs, [], outcome);
    assert.equal(page.engine.snapshot().safetyGateOpen, false, outcome);
    assert.equal(calls.filter(([kind]) => kind === 'release').length, 1, outcome);
    assert.equal(calls.some(([kind]) => kind === 'video' || kind === 'nativePlay'), false, outcome);
  }
});

test('duplicate refresh while old native release is pending cannot release or prepare twice', async () => {
  const { page, calls } = setup();
  const release = deferred();
  page.video.release = async () => {
    calls.push(['release']);
    await release.promise;
  };
  const refreshing = page.refreshLibrary();
  await page.refreshLibrary();
  assert.equal(calls.filter(([kind]) => kind === 'release').length, 1);
  assert.equal(calls.some(([kind]) => kind === 'prepare'), false);
  release.resolve();
  await refreshing;
  assert.equal(calls.filter(([kind]) => kind === 'prepare').length, 1);
  assert.equal(page.libraryLoaded, true);
});

test('video without matching scripts opens against the real engine with cleared axis runtime and no autoplay', async () => {
  const { page, state, calls } = setup();
  page.engine = new ActualPlaybackEngine();
  const prior = ActualFunscriptParser.parse('{"actions":[{"at":0,"pos":0},{"at":1000,"pos":100}]}');
  page.document = prior;
  page.engine.load(prior);
  page.engine.setConnected(true);
  assert.equal(page.engine.play(), true);
  state.plan = [];
  page.surfaceId = 'surface';
  await page.openLibraryItem(item('video-only', 0));
  assert.equal(page.videoOnly, true);
  assert.equal(page.videoMode, true);
  assert.equal(page.videoReady, false);
  assert.deepEqual(page.document.axes, []);
  assert.equal(page.engine.previewSamples().length, 6);
  assert.ok(page.engine.previewSamples().every(sample => Number.isNaN(sample.position)));
  assert.equal(page.engine.snapshot().safetyGateOpen, false);
  assert.deepEqual(calls.filter(([kind]) => kind === 'video'), [['video', 'video-only.mp4', 'surface']]);
  assert.equal(calls.some(([kind]) => kind === 'select' || kind === 'read'), false);
  assert.match(page.status, /Video only/);
});

test('invalid matching scripts fail closed with the real engine rather than becoming a video-only success', async () => {
  const { page, state, calls } = setup();
  page.engine = new ActualPlaybackEngine();
  const prior = ActualFunscriptParser.parse('{"actions":[{"at":0,"pos":0},{"at":1000,"pos":100}]}');
  page.document = prior;
  page.engine.load(prior);
  page.engine.setConnected(true);
  page.engine.play();
  page.surfaceId = 'surface';
  state.parseError = 'Invalid script JSON';
  await page.openLibraryItem(item('invalid'));
  assert.equal(page.videoOnly, false);
  assert.deepEqual(page.document.axes, []);
  assert.equal(page.engine.previewSamples().length, 6);
  assert.ok(page.engine.previewSamples().every(sample => Number.isNaN(sample.position)));
  assert.equal(page.engine.snapshot().safetyGateOpen, false);
  assert.equal(page.pendingVideoUri, '');
  assert.equal(page.videoReady, false);
  assert.equal(page.videoState, 'error');
  assert.equal(calls.some(([kind]) => kind === 'video'), false);
  assert.match(page.status, /No readable matching script/);
});

test('cancellation during native source release prevents even the first script read', async () => {
  const { page, calls } = setup();
  const release = deferred();
  let releaseCalls = 0;
  page.video.release = async () => {
    if (++releaseCalls === 1) await release.promise;
  };
  const opening = page.openLibraryItem(item('stale'));
  page.foreground = false;
  page.foregroundChanged();
  release.resolve();
  await opening;
  assert.equal(calls.some(([kind]) => kind === 'read' || kind === 'plan' || kind === 'video'), false);
  assert.equal(page.openingVideo, false);
  assert.equal(page.importing, false);
});

test('background cancels pending pair and stale read cannot replace a newer pair', async () => {
  const { page, reads, calls } = setup();
  const read = operation({ respectCancellation: false });
  reads.push(read);
  page.surfaceId = 'surface';
  const oldPair = page.openLibraryItem(item('old'));
  await read.started.promise;
  assert.equal(page.importing, true);
  page.foreground = false;
  page.foregroundChanged();
  assert.equal(page.openingVideo, false);
  assert.equal(page.importing, false);
  assert.equal(page.pairOpening, false);
  page.foreground = true;
  page.foregroundChanged();
  await page.openLibraryItem(item('new'));
  const newerDocument = page.document;
  const newerStatus = page.status;
  read.completion.resolve();
  await oldPair;
  assert.equal(page.document, newerDocument);
  assert.equal(page.status, newerStatus);
  assert.equal(page.videoName, 'new.mp4');
  assert.deepEqual(calls.filter(([kind]) => kind === 'video'), [['video', 'new.mp4', 'surface']]);
  assert.equal(calls.some(([kind, uri]) => kind === 'parse' && uri === 'old.0.funscript'), false);
  assert.equal(page.importing, false);
  assert.equal(page.openingVideo, false);
});

test('candidate-count bound releases the old source, clears scripts and rejects before script reads', async () => {
  const { page, calls, initialDocument } = setup();
  await page.openLibraryItem(item('oversize', 65));
  assert.match(page.status, /64 candidates/);
  assert.notEqual(page.document, initialDocument);
  assert.deepEqual(page.document.axes, []);
  assert.equal(calls.filter(([kind]) => kind === 'release').length, 1);
  assert.equal(calls.filter(([kind]) => kind === 'clearScripts').length, 1);
  assert.equal(calls.some(([kind]) => kind === 'read' || kind === 'video'), false);
  assert.equal(page.videoReady, false);
  assert.equal(page.importing, false);
});

test('text budget stops before parsing an over-budget candidate or selecting partial results', async () => {
  const { page, calls, state, initialDocument } = setup();
  state.scriptText = 'x'.repeat(2 * 1024 * 1024);
  await page.openLibraryItem(item('large', 4));
  assert.equal(calls.filter(([kind]) => kind === 'read').length, 3);
  assert.equal(calls.filter(([kind]) => kind === 'parse').length, 2);
  assert.equal(calls.some(([kind]) => kind === 'select' || kind === 'video'), false);
  assert.notEqual(page.document, initialDocument);
  assert.deepEqual(page.document.axes, []);
  assert.match(page.status, /Candidate (?:text|action) budget exceeded/);
  assert.equal(page.importing, false);
  assert.equal(page.openingVideo, false);
});

test('aggregate action budget stops reading and clears the previous script source', async () => {
  const { page, calls, state, initialDocument } = setup();
  state.candidateActions = 60000;
  await page.openLibraryItem(item('actions', 4));
  assert.equal(calls.filter(([kind]) => kind === 'read').length, 2);
  assert.equal(calls.filter(([kind]) => kind === 'parse').length, 2);
  assert.equal(calls.some(([kind]) => kind === 'select' || kind === 'video'), false);
  assert.notEqual(page.document, initialDocument);
  assert.deepEqual(page.document.axes, []);
  assert.match(page.status, /Candidate (?:text|action) budget exceeded/);
  assert.equal(page.importing, false);
  assert.equal(page.openingVideo, false);
});


test('ZIP entries precede loose candidates and configured catalogs retain user order', async () => {
  const { page, calls, state } = setup();
  page.surfaceId = 'surface';
  page.mediaCatalog = [{uri: 'media'}];
  page.scriptLibraries = [{uri: 'second', files: [], recursive: true}, {uri: 'first', files: [], recursive: false}];
  state.plan = [{kind: 'zip', file: {uri: 'film.zip'}}, {kind: 'script', file: {uri: 'film.funscript', name: 'film.funscript'}}];
  state.zipEntries = [{name: 'film.funscript', sourceUri: 'film.zip#0', contents: '{}'}];
  await page.openLibraryItem(item('film'));
  assert.deepEqual(calls.filter(([kind]) => kind === 'parse').map(([, uri]) => uri), ['film.zip#0', 'film.funscript']);
  const plan = calls.find(([kind]) => kind === 'plan');
  assert.deepEqual(plan[2].map(x => [x.rootIdentity, x.recursive]), [['second', true], ['first', false]]);
  assert.equal(calls.filter(([kind]) => kind === 'video').length, 1);
});

test('malformed ZIP stops paired opening rather than falling back to a loose script', async () => {
  const { page, calls, state, initialDocument } = setup();
  state.plan = [{kind: 'zip', file: {uri: 'bad.zip'}}, {kind: 'script', file: {uri: 'film.funscript'}}];
  state.zipError = 'CRC mismatch';
  await page.openLibraryItem(item('film'));
  assert.notEqual(page.document, initialDocument);
  assert.deepEqual(page.document.axes, []);
  assert.match(page.status, /CRC mismatch/);
  assert.equal(calls.some(([kind]) => kind === 'read' || kind === 'video'), false);
  assert.equal(page.importing, false);
});


test('refresh surfaces native cleanup failure, blocks scanning and permits an explicit retry', async () => {
  const { page, calls, state } = setup();
  state.cleanupFailure = 'Video cleanup failed: release rejected. Close the video again to retry.';
  page.videoMode = true; page.videoReady = true; page.pendingVideoUri = 'old.mp4';
  await page.refreshLibrary();
  assert.equal(page.videoMode, false);
  assert.equal(page.videoReady, false);
  assert.equal(page.pendingVideoUri, '');
  assert.deepEqual(page.document.axes, []);
  assert.equal(page.libraryLoaded, false);
  assert.equal(page.libraryBusy, false);
  assert.match(page.libraryMessage, /Video cleanup failed: release rejected/);
  assert.equal(calls.some(([kind]) => kind === 'prepare' || kind === 'scan' || kind === 'video'), false);
  state.cleanupFailure = '';
  await page.refreshLibrary();
  assert.equal(page.libraryLoaded, true);
  assert.equal(calls.filter(([kind]) => kind === 'prepare').length, 1);
  assert.equal(calls.filter(([kind]) => kind === 'release').length, 2);
});

test('selecting a video with unresolved native cleanup cannot read scripts or open a replacement', async () => {
  const { page, calls, state } = setup();
  state.cleanupFailure = 'Video cleanup failed: descriptor close rejected.';
  page.pendingVideoUri = 'stale.mp4'; page.videoReady = true;
  await page.openLibraryItem(item('next'));
  assert.match(page.status, /Video cleanup failed: descriptor close rejected/);
  assert.equal(page.pendingVideoUri, '');
  assert.equal(page.videoReady, false);
  assert.equal(page.videoState, 'error');
  assert.equal(page.openingVideo, false);
  assert.equal(page.importing, false);
  assert.deepEqual(page.document.axes, []);
  assert.equal(calls.some(([kind]) => kind === 'plan' || kind === 'read' || kind === 'zip' || kind === 'video'), false);
});

test('resource navigation reveals the list and scrolls to it instead of hiding an already-open list',()=>{const {page,calls}=setup();page.libraryLoaded=true;page.showResources=true;page.showLibrary();assert.equal(page.showResources,true);assert.equal(page.resourceFocus,true);page.showLibrary();assert.equal(page.showResources,true);assert.equal(calls.filter(([kind])=>kind==='scrollTop').length,2);assert.equal(calls.some(([kind])=>kind==='prepare'),false);});

test('all device sizes default readable and compact is an explicit saved preference',()=>{const {page}=setup();for(const [w,h] of [[320,640],[1400,900],[2000,1300]]){page.widthVp=w;page.heightVp=h;assert.equal(page.compactControls(),false);}page.generalConfiguration.uiDensity='compact';assert.equal(page.compactControls(),true);page.videoMode=true;page.widthVp=320;assert.equal(page.compactControls(),true);page.generalConfiguration.uiDensity='readable';assert.equal(page.compactControls(),false);});


test('actual video Play controller does not require any output connection',async()=>{
 const {page,calls}=setup();page.videoMode=true;page.videoReady=true;page.durationMs=10000;page.positionMs=100;
 page.engine.play=()=>{calls.push(['enginePlay']);return true;};page.outputConnection='disconnected';page.outputArmed=false;
 await page.playPause();assert.ok(calls.some(([kind])=>kind==='enginePlay'));assert.ok(calls.some(([kind])=>kind==='nativePlay'));
 assert.equal(page.outputArmed,false);assert.equal(/enabled\(this\.connected/.test(source),false);
});
test('actual output disconnect controller disarms output without pausing media',async()=>{
 const {page,calls}=setup();page.playing=true;page.videoMode=true;let armed=true,connection='connected';
 page.output={get(){return this;},disarm(){armed=false;calls.push(['outputDisarm']);},async disconnect(){connection='disconnected';calls.push(['outputDisconnect']);},
 refresh(){},status(){return{connection,armed,completedLocalWrites:0,locallyAcceptedBytes:0,lastErrorCode:null,closeConfirmed:true};},appliedConfigurationId(){return 0;},isBusy(){return false;},message(){return'';}};
 page.outputProfile.revision=page.engine.activeRegistry().revision;await page.disconnectOutput();
 assert.equal(page.playing,true);assert.equal(page.outputConnection,'disconnected');assert.equal(page.outputArmed,false);
 assert.equal(calls.some(([kind])=>kind==='pause'||kind==='release'),false);
});
test('actual foreground controller closes output lifecycle and media source before return without implicit arm',()=>{
 const {page,calls}=setup();page.videoMode=true;page.foreground=false;page.foregroundChanged();
 assert.ok(calls.some(([kind,value])=>kind==='outputForeground'&&value===false));assert.ok(calls.some(([kind,value])=>kind==='foreground'&&value===false));
 assert.ok(calls.some(([kind])=>kind==='release'));page.foreground=true;page.foregroundChanged();
 assert.ok(calls.some(([kind,value])=>kind==='outputForeground'&&value===true));assert.equal(calls.some(([kind])=>kind==='nativePlay'),false);
});
test('actual connect controller does not implicitly arm or start media, and recovery blocks explicit arm',async()=>{
 const {page,calls}=setup();let arms=0;page.output={get(){return this;},async connect(){calls.push(['outputConnect']);return true;},disarm(){calls.push(['outputDisarm']);},arm(){arms++;},
 refresh(){},status(){return{connection:'connected',armed:false,completedLocalWrites:0,locallyAcceptedBytes:0,lastErrorCode:null,closeConfirmed:false};},appliedConfigurationId(){return 0;},isBusy(){return false;},message(){return'';}};
 page.outputProfile.revision=page.engine.activeRegistry().revision;
 assert.equal(await page.connectOutput({},{}),true);assert.equal(arms,0);assert.equal(calls.some(([kind])=>kind==='nativePlay'),false);
 page.recoveryRequired=true;page.armOutput();assert.equal(arms,0);assert.equal(page.outputArmed,false);
});

test('newly appearing view synchronizes foreground into surviving core before play, without relying on StorageLink watch',()=>{
 const {page,calls}=setup();const core=new ActualPlaybackEngine();core.load(ActualFunscriptParser.parse('{"actions":[{"at":0,"pos":0},{"at":1000,"pos":100}]}'));core.setForeground(false);page.engine=core;page.foreground=true;page.scanDownloads=()=>{};
 page.aboutToAppear();assert.equal(core.play(),true);assert.ok(calls.some(([kind,value])=>kind==='outputForeground'&&value===true));
 page.aboutToDisappear();
});

test('explicit Download refresh replaces runtime providers and pipeline, stops output and never implicitly plays or arms',async()=>{
 const {page,calls}=setup();const core=new ActualPlaybackEngine();core.setConnected(true);core.load(ActualFunscriptParser.parse('{"actions":[{"at":0,"pos":10},{"at":10000,"pos":90}]}'));core.play();core.tick(40);
 page.engine=core;const oldPipeline=core.pipeline,oldMotion=core.motion,oldRegistry=core.activeRegistry(),oldEpoch=core.frame().epoch;
 let armed=true;page.output={stop(){armed=false;calls.push(['outputStop']);}};
 await page.refreshLibrary();assert.notEqual(core.pipeline,oldPipeline);assert.notEqual(core.motion,oldMotion);assert.ok(core.activeRegistry().revision>oldRegistry.revision);assert.ok(core.frame().epoch>oldEpoch);
 assert.equal(core.snapshot().state,'stopped');assert.equal(core.snapshot().safetyGateOpen,false);assert.equal(armed,false);
 assert.ok(calls.some(([kind])=>kind==='outputStop'));assert.equal(calls.some(([kind])=>kind==='nativePlay'),false);
 assert.equal(page.pendingVideoUri,'');assert.equal(page.libraryLoaded,true);
});

const settleInternal = async () => { for(let i=0;i<32;i++) await Promise.resolve(); };
function internalPage() {
 const result=setup({actualResources:true}),{page,state}=result;
 page.engine=new ActualPlaybackEngine();page.engine.setConnected(true);
 state.scriptTexts={
  'managed:a':JSON.stringify({actions:[{at:0,pos:10},{at:1000,pos:90}]}),
  'managed:b':JSON.stringify({actions:[{at:0,pos:30},{at:2000,pos:70}]}),
  'managed:roll':JSON.stringify({actions:[{at:0,pos:0},{at:1500,pos:100}]})
 };
 page.mediaCatalog=[new ActualResourceFileEntry('managed:a','a.funscript','a.funscript'),new ActualResourceFileEntry('managed:b','b.funscript','b.funscript'),new ActualResourceFileEntry('managed:roll','a.roll.funscript','a.roll.funscript')];
 page.internalLibrary.replace(page.mediaCatalog,page.engine.activeRegistry().profile);
 page.sync=()=>{const snapshot=page.engine.snapshot();page.playing=snapshot.state==='playing';page.positionMs=snapshot.positionMs;page.durationMs=snapshot.durationMs;result.syncPlaylist();};
 return result;
}
test('actual Internal controller connects without output, appends managed association, loads and advances from its 100ms source clock',async()=>{
 const {page,state,calls}=internalPage();await page.connectInternal();assert.equal(page.internalConnected,true);assert.equal(page.playing,false);
 await page.playlistAction(new PlaylistPanelAction('append',0));assert.deepEqual(page.engine.playbackConfiguration().playlistAssociations,['a.funscript']);
 state.now=100;page.tickInternal(100);await settleInternal();assert.equal(page.fileName,'a.funscript');assert.equal(page.playing,false);assert.equal(page.durationMs,1000);
 await page.playPause();page.engine.tick(40,140);page.sync();assert.equal(page.playing,true);assert.equal(page.positionMs,40);
 state.now=200;page.tickInternal(200);page.engine.tick(60,200);page.sync();assert.ok(page.positionMs>90&&page.positionMs<120);assert.equal(calls.some(c=>c[0]==='nativePlay'),false);
 assert.equal(page.engine.dispatchSource(['L0']).authorization.intents[0],'activePlayback');
 page.stop();assert.equal(page.engine.snapshot().state,'stopped');await page.playPause();page.engine.tick(40,240);page.sync();assert.equal(page.playing,true,'explicit Play after Stop restores Internal observation');
});
test('actual Internal next preserves media playing, same item loop only seeks, invalid script clears prior source',async()=>{
 const {page,state,calls}=internalPage();await page.connectInternal();await page.playlistAction(new PlaylistPanelAction('append',0));await page.playlistAction(new PlaylistPanelAction('append',1));
 state.now=100;page.tickInternal(100);await settleInternal();await page.playPause();page.engine.tick(40,140);page.sync();
 await page.playlistAction(new PlaylistPanelAction('next'));await settleInternal();assert.equal(page.fileName,'b.funscript');assert.equal(page.playlist.isPlaying,true);assert.equal(page.playing,true);assert.equal(page.durationMs,2000);
 await page.playlistAction(new PlaylistPanelAction('loop',-1,0,true));const reads=calls.filter(c=>c[0]==='read').length;state.now=150;await page.playlistAction(new PlaylistPanelAction('next'));await settleInternal();assert.equal(calls.filter(c=>c[0]==='read').length,reads);assert.equal(page.fileName,'b.funscript');assert.equal(page.positionMs,0);
 await page.playlistAction(new PlaylistPanelAction('loop',-1,0,false));state.scriptTexts['managed:a']='broken JSON';await page.playlistAction(new PlaylistPanelAction('previous'));await settleInternal();assert.equal(page.playing,false);assert.equal(page.document.axes.length,0);assert.ok(page.internalError.length>0);
});
test('cancelled Internal async selection cannot replace a newer video/source or restart media',async()=>{
 const {page,state,reads,calls}=internalPage();await page.connectInternal();await page.playlistAction(new PlaylistPanelAction('append',0));
 const read=operation({respectCancellation:false});reads.push(read);state.now=100;page.tickInternal(100);await read.started.promise;assert.equal(page.internalLoading,true);
 page.disconnectInternal();page.videoMode=true;const document=page.document;read.completion.resolve();await settleInternal();assert.equal(page.document,document);assert.equal(page.internalConnected,false);assert.equal(page.playing,false);assert.equal(page.internalLoading,false);assert.equal(calls.some(c=>c[0]==='nativePlay'),false);
});
test('persisted Internal IDs restore only exact managed catalog entries and never auto-play or auto-arm',async()=>{
 const {page,state,calls}=internalPage();const config=page.engine.playbackConfiguration();config.playlistAssociations=['b.funscript','missing.funscript','b.funscript'];config.internalAutoConnect=true;page.engine.changePlaybackConfiguration(config);
 await page.connectInternal();assert.deepEqual(page.playlist.playlistItems.map(i=>i.associationId),config.playlistAssociations);assert.equal(page.playlist.playlistItems[1].exists,false);
 state.now=100;page.tickInternal(100);await settleInternal();assert.equal(page.fileName,'b.funscript');assert.equal(page.playing,false);assert.equal(page.outputArmed,false);assert.equal(calls.filter(c=>c[0]==='read').some(c=>c[1].includes('missing')),false);
});
test('actual AB and AutoSkip controls remain available on native media without Internal connection',async()=>{
 const {page,state}=internalPage();page.videoMode=true;page.videoReady=true;page.engine.load(ActualFunscriptParser.parse(state.scriptTexts['managed:a']));page.engine.useExternalClock(true);
 const {MediaClockSnapshot}=await import('../entry/src/main/ets/core/MediaClock.ts');const native=new MediaClockSnapshot();Object.assign(native,{generation:1,durationMs:1000,ready:true,valid:true,observationSequence:1,observedMonotonicMs:0,positionMs:200});page.videoSnapshot(native);
 assert.equal(page.playlistContext().connected,false);assert.equal(page.playlistContext().mediaConnected,true);
 await page.playlistAction(new PlaylistPanelAction('loopStart'));assert.equal(page.engine.mediaLoop.startPosition,.2);
 page.engine.acceptNativeSnapshot({...native,positionMs:800,seekSequence:1,observationSequence:2});page.video.seek=position=>{state.requestedSeek=position;};await page.playlistAction(new PlaylistPanelAction('loopEnd'));assert.equal(state.requestedSeek,200);assert.equal(page.engine.sourceSeekSnapshot().status,'pending');
});

class OutputTestTime {
 now=0; next=1; tasks=new Map(); nowMs(){return this.now;}
 scheduleAt(at,fn){const id=this.next++;this.tasks.set(id,{at,fn});return id;} cancel(id){this.tasks.delete(id);}
 async advance(ms){const target=this.now+ms;while(true){const next=[...this.tasks].filter(([,v])=>v.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;this.now=next[1].at;this.tasks.delete(next[0]);next[1].fn();await settleInternal();}this.now=target;await settleInternal();}
}
async function nativeOutputPage(armed=true) {
 const r=internalPage(),{page,state}=r;
 const {MediaClock}=await import('../entry/src/main/ets/core/MediaClock.ts');
 const {OutputCoordinator,OutputEndpoint}=await import('../entry/src/main/ets/output/OutputCoordinator.ts');
 const {MemoryTransport}=await import('../entry/src/main/ets/output/MemoryTransport.ts');
 const {defaultFixedContext}=await import('../entry/src/main/ets/output/UpdateContext.ts');
 const time=new OutputTestTime();time.now=40;state.now=40;
 const doc=ActualFunscriptParser.parse(JSON.stringify({actions:[{at:0,pos:10},{at:10000,pos:90}]}));page.engine.load(doc);page.engine.useExternalClock(true);page.videoMode=true;
 const clock=new MediaClock(),generation=clock.reset('loading');clock.prepared(generation,10000,0,0);page.videoSnapshot(clock.snapshot());
 page.video.play=()=>{clock.requestPlay();clock.stateChanged(generation,'playing');page.videoSnapshot(clock.snapshot());};
 page.video.pause=()=>{clock.pause();page.videoSnapshot(clock.snapshot());};
 page.video.seek=position=>{state.nativeSeekTarget=position;clock.beginSeek();page.videoSnapshot(clock.snapshot());};
 await page.playPause();page.engine.tick(40,40);page.sync();assert.equal(page.playing,true);
 const transport=new MemoryTransport(time),reg=page.engine.activeRegistry();
 const config={targetId:'index-seek-test',kind:'memory',protocolProfile:{precision:4,revision:reg.revision,axisOrder:reg.axes.map(a=>a.name),maximumDurationMs:10000,maximumPayloadBytes:1024},axisRanges:reg.axes.map(a=>({axisId:a.name,minimum:0,maximum:1,enabled:a.name==='L0'})),updateContext:defaultFixedContext(),autoConnectPolicy:'manual',allowPausedAutoHome:false,allowPausedMotion:false};
 const policy={maximumFrameAgeMs:200,maximumClockAgeMs:750,maximumEventAgeMs:200,maximumFixedElapsedMs:1000,writeTimeoutMs:1000,maximumPolledQueueLength:64,allowZeroInterval:true};
 page.output=new OutputCoordinator({inspect:()=>({available:true,diagnostic:''}),create:()=>transport},page.engine,policy,time,time);
 await page.output.connect(config,new OutputEndpoint());if(armed)assert.equal(page.output.arm(),true,JSON.stringify({source:page.engine.dispatchSource(['L0']),status:page.output.status(),message:page.output.message()}));page.output.refresh();
 return {...r,time,clock,generation,transport};
}
test('actual Index native seek waits for seekDone and new frame while retaining only an existing output arm',async()=>{
 for(const armed of [true,false]) {
  const {page,state,time,clock,generation,transport}=await nativeOutputPage(armed);
  page.seekTransport(5000);assert.equal(page.engine.sourceSeekSnapshot().status,'pending');assert.equal(page.playing,false);assert.equal(page.output.status().armed,armed);assert.equal(page.output.status().seekPending,armed);
  time.now=80;state.now=80;page.engine.tick(40,80);page.output.refresh();assert.equal(page.playing,false);assert.equal(transport.writeRecords().length,0);
  clock.endSeek(generation,5000,100);state.now=100;time.now=100;page.videoSnapshot(clock.snapshot());assert.equal(page.engine.sourceSeekSnapshot().status,'confirmed');assert.equal(page.playing,true);assert.equal(page.output.status().seekPending,armed);
  state.now=140;time.now=140;page.engine.tick(60,140);page.sync();page.output.refresh();assert.equal(page.output.status().armed,armed);assert.equal(page.output.status().seekPending,false);
  await time.advance(10);assert.equal(transport.writeRecords().length,armed?1:0);await page.output.dispose();
 }
});
test('actual Index Stop, background and source replacement cancel native seek resume permanently',async()=>{
 for(const action of ['stop','background','source']) {
  const {page,state,time,clock,generation,transport}=await nativeOutputPage(true);page.seekTransport(5000);
  if(action==='stop')page.stop();
  if(action==='background'){page.foreground=false;page.foregroundChanged();page.foreground=true;page.engine.setForeground(true);}
  if(action==='source'){page.closeVideo();page.videoMode=true;}
  clock.endSeek(generation,5000,100);state.now=100;time.now=100;page.videoSnapshot(clock.snapshot());page.engine.tick(100,140);page.sync();page.output.refresh();await time.advance(20);
  assert.equal(page.playing,false,action);assert.equal(page.output.status().armed,false,action);assert.equal(transport.writeRecords().length,0,action);await page.output.dispose();
 }
});

test('rapid native seek replacement retains only the first actual playing intent and final confirmation',async()=>{
 const {page,state,time,clock,generation,transport}=await nativeOutputPage(true);
 page.seekTransport(3000);const first=page.resumeSeekRequest;state.now=60;time.now=60;page.seekTransport(6000);
 assert.ok(page.resumeSeekRequest>first);assert.equal(page.output.status().armed,true);assert.equal(page.output.status().seekPending,true);
 clock.endSeek(generation,6000,100);state.now=100;time.now=100;page.videoSnapshot(clock.snapshot());assert.equal(page.playing,true);
 page.engine.tick(100,140);time.now=140;page.output.refresh();await time.advance(10);assert.equal(page.output.status().armed,true);assert.equal(transport.writeRecords().length,1);await page.output.dispose();
});

test('Internal cancel invalidates pending native pair too, and refreshed failure cannot reuse old Internal catalog',async()=>{
 const {page,state,reads,calls}=internalPage();
 page.internalLibrary.recordDuration('a.funscript',1);page.restoreInternalPlaylist();
 state.prepareError='denied';await page.scanDownloads();assert.equal(page.internalLibrary.resolve('a.funscript'),undefined);assert.equal(page.playlistContext().managedItems.length,0);
 const pending=operation({respectCancellation:false});reads.push(pending);page.mediaCatalog=[new ActualResourceFileEntry('managed:a','a.funscript','a.funscript'),new ActualResourceFileEntry('managed:video','a.mp4','a.mp4')];
 state.prepareError='';const opening=page.openLibraryItem({video:page.mediaCatalog[1],videos:[page.mediaCatalog[1]],scripts:[],id:'a'});await pending.started.promise;
 await page.playlistAction(new PlaylistPanelAction('cancel'));pending.completion.resolve();await opening;
 assert.equal(page.videoMode,false);assert.equal(page.openingVideo,false);assert.equal(page.importing,false);assert.equal(page.document.axes.length,0);assert.equal(calls.some(c=>c[0]==='video'),false);
});

test('Stop cancels pending Internal selection publication and explicit Play safely reloads selected item',async()=>{
 const {page,state,reads}=internalPage();await page.connectInternal();await page.playlistAction(new PlaylistPanelAction('append',0));await page.playlistAction(new PlaylistPanelAction('append',1));
 state.now=100;page.tickInternal(100);await settleInternal();await page.playPause();page.engine.tick(40,140);page.sync();
 const read=operation({respectCancellation:false});reads.push(read);const selecting=page.playlistAction(new PlaylistPanelAction('next'));await read.started.promise;
 assert.equal(page.internalLoading,true);const request=page.internalRequest;page.stop();assert.ok(page.internalRequest>request);assert.equal(page.internalConnected,true);
 assert.equal(page.document.axes.length,0);assert.equal(page.engine.snapshot().state,'stopped');assert.equal(page.engine.autoSkip.pending,false);
 read.completion.resolve();await selecting;await settleInternal();state.now=200;page.tickInternal(200);page.engine.tick(60,200);
 assert.equal(page.engine.snapshot().state,'stopped');assert.equal(page.engine.autoSkip.pending,false);assert.equal(page.document.axes.length,0);assert.equal(page.internalLoading,false);
 await page.playPause();await settleInternal();assert.equal(page.fileName,'b.funscript');assert.equal(page.playing,true);assert.equal(page.internalAwaitingReload,false);assert.equal(page.outputArmed,false);
});

test('Stop cancels pending Internal connection and append metadata without late queue mutation',async()=>{
 const {page,state,reads}=internalPage();await page.connectInternal();const read=operation({respectCancellation:false});reads.push(read);
 const append=page.playlistAction(new PlaylistPanelAction('append',0));await read.started.promise;page.stop();read.completion.resolve();await append;
 assert.equal(page.playlist.playlistItems.length,0);assert.equal(page.internalBusy,false);assert.equal(page.engine.snapshot().state,'stopped');
 page.disconnectInternal();const settings=page.engine.playbackConfiguration();settings.playlistAssociations=['a.funscript'];page.engine.changePlaybackConfiguration(settings);page.internalRestored=false;
 const pending=operation({respectCancellation:false});reads.push(pending);const connecting=page.connectInternal();await pending.started.promise;page.stop();pending.completion.resolve();await connecting;
 assert.equal(page.internalConnected,false);assert.equal(page.internalBusy,false);assert.equal(page.engine.snapshot().state,'stopped');
});

test('native seek confirmation at or after exact deadline cannot restore media or output intent',async()=>{
 for(const lateBy of [0,1]) {
  const {page,state,time,clock,generation,transport}=await nativeOutputPage(true);page.seekTransport(5000);const deadline=page.engine.sourceSeekSnapshot().deadlineMonotonicMs;
  state.now=deadline+lateBy;time.now=state.now;clock.endSeek(generation,5000,state.now);page.videoSnapshot(clock.snapshot());page.output.refresh();
  assert.equal(page.engine.sourceSeekSnapshot().status,'cancelled');assert.equal(page.playing,false);assert.equal(page.output.status().armed,false);assert.equal(transport.writeRecords().length,0);await page.output.dispose();
 }
});

test('clearing a cancelled Internal selection releases reload hold for a newly appended paused queue',async()=>{
 const {page,state,reads}=internalPage();await page.connectInternal();await page.playlistAction(new PlaylistPanelAction('append',0));
 const read=operation({respectCancellation:false});reads.push(read);state.now=100;page.tickInternal(100);await read.started.promise;page.stop();read.completion.resolve();await settleInternal();
 assert.equal(page.internalAwaitingReload,true);await page.playlistAction(new PlaylistPanelAction('clear'));assert.equal(page.internalAwaitingReload,false);
 await page.playlistAction(new PlaylistPanelAction('append',1));state.now=200;page.tickInternal(200);await settleInternal();
 assert.equal(page.fileName,'b.funscript');assert.equal(page.playlist.currentItem.associationId,'b.funscript');assert.equal(page.playing,false);assert.equal(page.outputArmed,false);
});

test('actual Internal AB loops preserve existing arm across repeated confirmed epochs without calling arm again',async()=>{
 const {page,state,time,transport}=await nativeOutputPage(true);page.closeVideo();await page.connectInternal();
 const settings=page.engine.playbackConfiguration();settings.autoSkipEnabled=false;page.engine.changePlaybackConfiguration(settings);
 await page.playlistAction(new PlaylistPanelAction('append',0));state.now=140;time.now=140;page.tickInternal(140);await settleInternal();await page.playPause();
 page.engine.tick(40,180);state.now=180;time.now=180;page.sync();page.output.refresh();assert.equal(page.output.status().armed,false);
 const config=page.output.configuration();config.protocolProfile.revision=page.engine.activeRegistry().revision;const {OutputEndpoint}=await import('../entry/src/main/ets/output/OutputCoordinator.ts');await page.output.connect(config,new OutputEndpoint());assert.equal(page.output.arm(),true);
 let rearm=0;const originalArm=page.output.arm.bind(page.output);page.output.arm=()=>{rearm++;return originalArm();};
 page.engine.mediaLoop.setLoop(.1,.35,1);let seeks=0,lastRequest=-1;
 for(let i=1;i<=60;i++) {
  const now=180+i*40;state.now=now;await time.advance(now-time.now);page.tickInternal(now);await settleInternal();page.engine.tick(40,now);page.processMediaSeekRequests();page.finishMediaSeek();page.sync();page.output.refresh();
  const seek=page.engine.sourceSeekSnapshot();if(seek!==null&&seek.requestId!==lastRequest){seeks++;lastRequest=seek.requestId;assert.equal(seek.status,'confirmed');}
  assert.equal(page.output.status().armed,true,JSON.stringify({i,source:page.engine.dispatchSource(['L0']),status:page.output.status()}));assert.equal(page.playing,true);
 }
 assert.ok(seeks>=4);assert.ok(transport.writeRecords().length>4);assert.equal(rearm,0);page.stop();assert.equal(page.output.status().armed,false);await page.output.dispose();
});

// Actual native adapter with mocked SDK callbacks, contributed by independent review.
async function useActualNativeAdapter(page,state) {
 const {MediaClock,MediaClockSnapshot}=await import('../entry/src/main/ets/core/MediaClock.ts');
 const adapterSource=readFileSync(new URL('../entry/src/main/ets/media/NativeVideoAdapter.ets',import.meta.url),'utf8');
 const adapterJs=stripTypeScriptTypes(adapterSource.replace(/^import .*;\n/gm,'').replace('export class NativeVideoAdapter','class NativeVideoAdapter'));
 const seeks=[],handlers=new Map();
 const player={state:'idle',currentTime:0,duration:10000,on:(type,fn)=>handlers.set(type,fn),
 async emit(type,value){if(type==='stateChange')this.state=value;await handlers.get(type)?.(value);},
 async play(){await this.emit('stateChange','playing');},async pause(){await this.emit('stateChange','paused');},
 async prepare(){await this.emit('stateChange','prepared');},async release(){this.state='released';},
 seek(target){seeks.push(target);},setPlaybackRate(){},setVolume(){}};
 const media={VideoScaleType:{VIDEO_SCALE_TYPE_SCALED_ASPECT:2},SeekMode:{SEEK_CLOSEST:2},BufferingInfoType:{BUFFERING_START:1,BUFFERING_END:2},createAVPlayer:async()=>player};
 const fileIo={OpenMode:{READ_ONLY:0,NOFOLLOW:1,NONBLOCK:2},open:async()=>({fd:1}),stat:async()=>({size:1024,isFile:()=>true}),close:async()=>{}};
 const Adapter=new Function('media','fileIo','systemDateTime','MediaClock','MediaClockSnapshot','canIUse','setInterval','clearInterval',adapterJs+'\nreturn NativeVideoAdapter;')(media,fileIo,{TimeType:{STARTUP:0},getUptime:()=>state.now},MediaClock,MediaClockSnapshot,()=>true,()=>1,()=>{});
 page.pauseTransport();page.video=new Adapter(s=>page.videoSnapshot(s));await page.video.open('video','surface');await player.emit('stateChange','initialized');return{player,seeks};
}
test('actual NativeVideoAdapter keeps rapid replacement pending until final native seekDone',async()=>{
 const {page,state,time,transport}=await nativeOutputPage(false);const {player,seeks}=await useActualNativeAdapter(page,state);
 await page.playPause();await settleInternal();state.now=80;time.now=80;page.engine.tick(40,80);page.sync();assert.equal(page.playing,true);assert.equal(page.output.arm(),true);page.output.refresh();
 page.seekTransport(3000);await settleInternal();assert.deepEqual(seeks,[3000]);state.now=90;time.now=90;page.seekTransport(6000);await settleInternal();assert.deepEqual(seeks,[3000]);
 player.currentTime=3001;await player.emit('seekDone',3000);assert.deepEqual(seeks,[3000,6000]);assert.equal(page.engine.sourceSeekSnapshot().status,'pending');assert.equal(page.playing,false);
 player.currentTime=3500;await player.emit('timeUpdate',3500);assert.equal(page.engine.sourceSeekSnapshot().status,'pending');assert.equal(page.playing,false);
 state.now=100;time.now=100;player.currentTime=6005;await player.emit('seekDone',6000);await settleInternal();assert.equal(page.engine.sourceSeekSnapshot().status,'confirmed');assert.equal(page.positionMs,6005);assert.equal(page.playing,true);assert.equal(transport.writeRecords().length,0);
 state.now=140;time.now=140;page.engine.tick(60,140);page.sync();page.output.refresh();await time.advance(10);assert.equal(transport.writeRecords().length,1);await page.output.dispose();await page.video.release();
});
test('native AutoSkip uses delayed latest script and does not acquire play or output intent',async()=>{
 const {page,state,time,transport}=await nativeOutputPage(false);page.pauseTransport();
 const late=ActualFunscriptParser.parse(JSON.stringify({actions:[{at:0,pos:0},{at:8000,pos:0},{at:10000,pos:100}]}));page.engine.load(late);page.engine.useExternalClock(true);
 const {player,seeks}=await useActualNativeAdapter(page,state);assert.equal(page.engine.autoSkip.pending,true);assert.equal(page.playing,false);
 const pref=page.engine.playbackConfiguration();pref.autoSkipEnabled=false;page.engine.changePlaybackConfiguration(pref);
 state.now=1039;time.now=1039;page.engine.tick(999,1039);page.processMediaSeekRequests();await settleInternal();assert.deepEqual(seeks,[]);
 state.now=1040;time.now=1040;page.engine.tick(1,1040);page.processMediaSeekRequests();await settleInternal();assert.deepEqual(seeks,[3000]);assert.equal(page.engine.sourceSeekSnapshot().status,'pending');
 state.now=1050;time.now=1050;player.currentTime=3002;await player.emit('seekDone',3000);assert.equal(page.engine.sourceSeekSnapshot().status,'confirmed');assert.equal(page.playing,false);assert.equal(page.output.status().armed,false);assert.equal(transport.writeRecords().length,0);
 await page.output.dispose();await page.video.release();
});
test('actual native callbacks cannot revive stopped, backgrounded, configured, errored or expired seeks',async()=>{
 for(const action of ['stop','background','configuration','error','timeout']) {
  const {page,state,time,transport}=await nativeOutputPage(false);const {player}=await useActualNativeAdapter(page,state);await page.playPause();await settleInternal();state.now=80;time.now=80;page.engine.tick(40,80);page.sync();assert.equal(page.output.arm(),true);page.output.refresh();
  page.seekTransport(5000);await settleInternal();
  if(action==='stop'){page.stop();await settleInternal();}
  if(action==='background'){page.foreground=false;page.foregroundChanged();await settleInternal();page.foreground=true;page.engine.setForeground(true);}
  if(action==='configuration')page.engine.setAxisScale('L0',.5);
  if(action==='error'){await player.emit('error',{message:'synthetic native failure'});await settleInternal();}
  if(action==='timeout'){state.now=5080;time.now=5080;page.engine.tick(5000,5080);page.finishMediaSeek();}
  else{state.now=100;time.now=100;}
  player.currentTime=5000;await player.emit('seekDone',5000);await settleInternal();
  if(action==='stop'){player.currentTime=0;await player.emit('seekDone',0);await settleInternal();}
  page.engine.tick(40,state.now+40);page.sync();page.output.refresh();assert.equal(page.playing,false,action);assert.equal(page.output.status().armed,false,action);assert.equal(transport.writeRecords().length,0,action);
  await page.output.dispose();await page.video.release();
 }
});
test('actual automatic item transition publishes duration forced zero ChangeScript advancement in order',async()=>{
 const {page,state}=internalPage();await page.connectInternal();await page.playlistAction(new PlaylistPanelAction('append',0));await page.playlistAction(new PlaylistPanelAction('append',1));state.now=100;page.tickInternal(100);await settleInternal();await page.playPause();
 const order=[];for(const [name,label] of [['acceptDurationMessage','duration'],['acceptInternalPosition','position'],['loadInternalBindings','script']]){const fn=page.engine[name].bind(page.engine);page.engine[name]=(...args)=>{order.push([label,label==='script'?args[0].durationMs:args[0],args[1]]);return fn(...args);};}
 state.now=1100;page.tickInternal(1100);assert.equal(page.playlist.currentItem.name,'a.funscript');assert.equal(page.playlist.positionSeconds,1);
 state.now=1200;page.tickInternal(1200);assert.equal(page.playlist.currentItem.name,'a.funscript');assert.equal(page.playlist.positionSeconds,1.1);
 order.length=0;state.now=1300;page.tickInternal(1300);await settleInternal();assert.equal(page.playlist.currentItem.name,'b.funscript');assert.equal(page.playing,true);
 assert.deepEqual(order.map(x=>x.slice(0,2)),[['duration',2],['position',0],['script',2000],['position',.1]]);assert.equal(order[1][2],true);assert.equal(order[3][2],false);
});

test('Stop cancels pending native pair script read',async()=>{
 const {page,state,reads,calls}=internalPage();page.surfaceId='surface';page.video.seek=target=>calls.push(['nativeSeek',target]);
 const file=new ActualResourceFileEntry('managed:video','a.mp4','a.mp4');page.mediaCatalog=[page.mediaCatalog[0],file];
 const pending=operation({respectCancellation:false});reads.push(pending);const opening=page.openLibraryItem({video:file,videos:[file],scripts:[],id:'a'});await pending.started.promise;
 page.stop();const stopped={request:page.openVideoRequest,status:page.status,opening:page.openingVideo,axes:page.document.axes.length};pending.completion.resolve();await opening;
 assert.equal(calls.some(c=>c[0]==='video'),false);assert.equal(page.status,stopped.status);assert.equal(page.document.axes.length,0);
});
test('Stop cancels video-only source awaiting prior release',async()=>{
 const {page,calls}=internalPage();page.surfaceId='surface';page.video.seek=target=>calls.push(['nativeSeek',target]);
 const file=new ActualResourceFileEntry('managed:video','only.mp4','only.mp4');page.mediaCatalog=[file];const release=deferred();page.video.release=()=>release.promise;
 const opening=page.openLibraryItem({video:file,videos:[file],scripts:[],id:'only'});await Promise.resolve();page.stop();const stopped=page.status;release.resolve();await opening;
 assert.equal(calls.some(c=>c[0]==='video'),false);assert.equal(page.status,stopped);
});

function configureStandalone(page,provider='Pattern') {
 const axis=page.engine.getAxisConfiguration('L0');Object.assign(axis,{selectedMotionProvider:provider,updateMotionProviderWhenPaused:true,updateMotionProviderWithoutScript:true,bypassMotionProvider:false,autoHomeEnabled:false});page.engine.changeAxisConfiguration('L0',axis);
}
test('actual standalone Start closes media and admits only paused NaN processing; output still requires explicit policy and Arm',async()=>{
 const {page,state,time,transport}=await nativeOutputPage(false);configureStandalone(page);await page.startStandaloneMotion();
 assert.equal(page.videoMode,false);assert.equal(page.internalConnected,false);assert.equal(page.engine.isStandaloneMotionActive(),true);assert.equal(page.playing,false);assert.equal(page.engine.mediaPositionSeconds(),Number.NaN);assert.equal(page.output.status().armed,false);assert.equal(page.document.axes.length,0);
 time.now=80;state.now=80;page.engine.tick(40,80);page.output.refresh();const dispatch=page.engine.dispatchSource(['L0']);assert.deepEqual(dispatch.authorization.intents,['pausedMotion']);assert.equal(dispatch.authorization.clockKind,'monotonic');assert.equal(transport.writeRecords().length,0);
 const config=page.output.configuration();config.protocolProfile.revision=page.engine.activeRegistry().revision;config.allowPausedMotion=true;const {OutputEndpoint}=await import('../entry/src/main/ets/output/OutputCoordinator.ts');await page.output.connect(config,new OutputEndpoint());assert.equal(page.output.status().armed,false);assert.equal(page.output.arm(),true);page.output.refresh();await time.advance(10);assert.equal(transport.writeRecords().length,1);
 page.stop();page.engine.pause();state.now=130;time.now=130;page.engine.tick(40,130);page.output.refresh();await time.advance(20);assert.equal(page.engine.isStandaloneMotionActive(),false);assert.equal(page.output.status().armed,false);assert.equal(transport.writeRecords().length,1);
 await page.startStandaloneMotion();state.now=190;time.now=190;page.engine.tick(40,190);page.output.refresh();await time.advance(10);assert.equal(page.engine.isStandaloneMotionActive(),true);assert.equal(page.output.status().armed,false);assert.equal(transport.writeRecords().length,1);await page.output.dispose();
});
test('runtime rebuild is explicit, keeps saved settings, clears media/provider history and leaves new identity stopped/disarmed',async()=>{
 const {page,state,time,transport}=await nativeOutputPage(true);configureStandalone(page,'Looping Script');const doc=ActualFunscriptParser.parse(state.scriptTexts['managed:a']);page.engine.setLoopingScript('L0',doc,'managed:a');
 const before=page.engine.configurationSnapshot(),registry=page.engine.activeRegistry(),frame=page.engine.frame();page.settingsReadOnly=true;await page.resetRuntimeSafely();
 assert.deepEqual(page.engine.configurationSnapshot(),before);assert.notEqual(page.engine.activeRegistry(),registry);assert.ok(page.engine.activeRegistry().revision>registry.revision);assert.ok(page.engine.frame().epoch>frame.epoch);assert.equal(page.engine.snapshot().state,'stopped');assert.equal(page.document.axes.length,0);assert.equal(page.engine.bindings().every(b=>b.resource===null),true);assert.equal(page.output.status().armed,false);assert.equal(page.runtimeBusy,false);
 page.engine.pause();page.engine.tick(40,80);assert.equal(page.engine.dispatchSource(['L0']).authorization,null);assert.equal(transport.writeRecords().length,0);
 page.settingsReadOnly=false;await page.startStandaloneMotion();page.engine.tick(40,120);assert.equal(page.engine.dispatchSource(['L0']).authorization,null,'rebuild did not silently reload old Looping resource');assert.equal(page.output.status().armed,false);await page.output.dispose();
});
test('Stop/background/visible Internal Cancel during runtime cleanup revoke delayed standalone Start and do not auto-retry',async()=>{
 for(const action of ['stop','background','cancel']) {
  const {page,state}=internalPage();configureStandalone(page);const closed=deferred();page.video.release=()=>closed.promise;const started=page.startStandaloneMotion();await settleInternal();assert.equal(page.runtimeBusy,true);
  if(action==='stop')page.stop();else if(action==='cancel')await page.playlistAction(new PlaylistPanelAction('cancel'));else{page.foreground=false;page.foregroundChanged();page.foreground=true;page.engine.setForeground(true);}
  closed.resolve();await started;page.engine.pause();page.engine.tick(40,40);assert.equal(page.runtimeBusy,false);assert.equal(page.engine.isStandaloneMotionActive(),false);assert.equal(page.engine.dispatchSource(['L0']).authorization,null);assert.equal(page.playing,false);
 }
});
test('standalone Start does not destroy current media for missing flags or read-only settings, and native cleanup failure stays closed',async()=>{
 const {page,state}=internalPage();page.videoMode=true;await page.startStandaloneMotion();assert.equal(page.videoMode,true);assert.match(page.runtimeMessage,/暂停更新/);
 configureStandalone(page);page.settingsReadOnly=true;await page.startStandaloneMotion();assert.equal(page.videoMode,true);assert.equal(page.engine.isStandaloneMotionActive(),false);
 page.settingsReadOnly=false;state.cleanupFailure='unconfirmed old native close';await page.startStandaloneMotion();assert.equal(page.engine.isStandaloneMotionActive(),false);assert.equal(page.engine.snapshot().state,'stopped');assert.match(page.runtimeMessage,/unconfirmed/);
});
test('runtime controls remain reachable in the shared source panel and keep 52vp targets across compact layouts',()=>{
 const panel=source.slice(source.indexOf('  sourcePanel() {'),source.indexOf('  outputPanel() {'));
 assert.match(panel,/启动独立Motion/);assert.match(panel,/安全重建运行状态/);assert.match(panel,/Button\(this\.standaloneMotion[\s\S]*?\.constraintSize\(\{ minHeight: UiStyle.control \}\)/);assert.ok(panel.indexOf('安全重建运行状态')<panel.indexOf('if (this.showSourceSettings)'));
 assert.match(source,/this\.standaloneMotion = this\.engine\.isStandaloneMotionActive\(\)/);
});
test('actual native video Stop revokes processing after seekDone and generic pause; only explicit Play can resume',async()=>{
 const {page,state,time}=await nativeOutputPage(false);configureStandalone(page);const {player}=await useActualNativeAdapter(page,state);
 await page.playPause();await settleInternal();state.now=80;time.now=80;page.engine.tick(40,80);page.sync();assert.equal(page.playing,true);
 page.stop();await settleInternal();player.currentTime=0;await player.emit('seekDone',0);await player.emit('stateChange','paused');page.engine.pause();state.now=120;time.now=120;page.engine.tick(40,120);page.sync();
 assert.equal(page.engine.dispatchSource(['L0']).authorization,null);assert.equal(page.output.arm(),false);
 await page.playPause();await settleInternal();state.now=160;time.now=160;page.engine.tick(40,160);page.sync();assert.equal(page.playing,true);assert.equal(page.output.status().armed,false);await page.output.dispose();await page.video.release();
});
test('explicit native fresh open spans actual release-idle/loading generations then prepared paused Motion without pressing Play',async()=>{
 const {page,state}=internalPage();configureStandalone(page);page.videoMode=true;page.engine.useExternalClock(true);state.now=0;
 const {player}=await useActualNativeAdapter(page,state);assert.equal(player.state,'prepared');state.now=40;page.engine.tick(40,40);page.sync();
 const dispatch=page.engine.dispatchSource(['L0']);assert.equal(page.playing,false);assert.deepEqual(dispatch.authorization?.intents,['pausedMotion']);assert.equal(dispatch.authorization?.clockKind,'monotonic');
 page.stop();await settleInternal();await player.emit('seekDone',0);state.now=80;page.engine.tick(40,80);assert.equal(page.engine.dispatchSource(['L0']).authorization,null);await page.video.release();
});

test('actual Index bound Motion callbacks reject late axis/provider/profile/configuration and readonly changes',()=>{
 const {page}=internalPage();page.axisNames=page.engine.activeRegistry().axes.map(a=>a.name);page.selectedAxis=0;page.motionEditorId='Custom Curve';page.showMotionSettings=true;
 const axis=page.axisNames[0],rev=page.engine.activeRegistry().revision;const previous=page.engine.getMotionConfiguration(axis,'Custom Curve');const next={...previous,speed:2};const calls=[];page.applyMotionSettings=(p,a)=>calls.push([p,a]);
 const make=()=>page.motionSettingsHandler(axis,'Custom Curve',rev,previous);
 const valid=make();valid(next);assert.equal(calls.length,1);assert.equal(calls[0][1],axis);
 for(const mutate of [()=>page.selectedAxis=1,()=>page.motionEditorId='Pattern',()=>page.settingsReadOnly=true,()=>page.recoveryRequired=true,()=>page.foreground=false,()=>page.showMotionSettings=false,()=>page.viewActive=false]){
  Object.assign(page,{selectedAxis:0,motionEditorId:'Custom Curve',settingsReadOnly:false,recoveryRequired:false,foreground:true,showMotionSettings:true,viewActive:true});const callback=make();mutate();callback(next);assert.equal(calls.length,1);
 }
 Object.assign(page,{viewActive:true,showMotionSettings:true,foreground:true});const late=make();page.engine.changeMotionConfiguration(axis,next);late({...next,speed:3});assert.equal(calls.length,1);
 assert.match(source,/ForEach\(\[this\.motionBindingKey\(\)\]/,'complete axis/profile/provider context remounts panel rather than depending on prop-watch order');
});
test('actual Index geometry callbacks are scoped to active mounted Custom context and old detach cannot revoke a newer owner',()=>{
 const {page}=internalPage();page.axisNames=page.engine.activeRegistry().axes.map(a=>a.name);page.selectedAxis=0;page.motionEditorId='Custom Curve';page.showMotionSettings=true;
 const rev=page.engine.activeRegistry().revision,key=page.motionBindingKey(),handler=page.motionCanvasHandler('L0','Custom Curve',rev,key);handler(100,300,156,true);assert.equal(page.engine.motionCanvas.owner,100);
 page.selectedAxis=1;handler(101,300,156,true);assert.equal(page.engine.motionCanvas.owner,100);const key2=page.motionBindingKey();page.motionCanvasHandler(page.axisNames[1],'Custom Curve',rev,key2)(102,300,156,true);assert.equal(page.engine.motionCanvas.owner,102);handler(100,0,0,false);assert.equal(page.engine.motionCanvas.owner,102);
 page.settingsReadOnly=true;page.motionCanvasHandler(page.axisNames[1],'Custom Curve',rev,key2)(103,300,156,true);assert.equal(page.engine.motionCanvas.owner,102);
});

test('captured curve Reset rejects retargeting, readonly/background and newer source snapshot; current Reset changes runtime only',()=>{
 const {page}=internalPage();page.axisNames=page.engine.activeRegistry().axes.map(a=>a.name);page.selectedAxis=0;page.motionEditorId='Custom Curve';page.showMotionSettings=true;
 const axis=page.axisNames[0],rev=page.engine.activeRegistry().revision,previous=page.engine.getMotionConfiguration(axis,'Custom Curve'),calls=[];page.engine.resetCustomCurve=a=>calls.push(a);
 const capture=()=>page.motionResetHandler(axis,rev,previous);capture()();assert.deepEqual(calls,[axis]);
 for(const mutate of [()=>page.selectedAxis=1,()=>page.motionEditorId='Random',()=>page.settingsReadOnly=true,()=>page.recoveryRequired=true,()=>page.foreground=false,()=>page.showMotionSettings=false,()=>page.viewActive=false]){
  Object.assign(page,{selectedAxis:0,motionEditorId:'Custom Curve',settingsReadOnly:false,recoveryRequired:false,foreground:true,showMotionSettings:true,viewActive:true});const callback=capture();mutate();callback();assert.equal(calls.length,1);
 }
 Object.assign(page,{viewActive:true,foreground:true,showMotionSettings:true});const old=capture();page.engine.changeMotionConfiguration(axis,{...previous,speed:2});old();assert.equal(calls.length,1);
 assert.match(source,/onReset: this\.motionResetHandler/);assert.doesNotMatch(source,/Button\('Reset curve time'\)/);
});
