import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes, registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return nextResolve(specifier + '.ts', context);
  return nextResolve(specifier, context);
} });
const { FunscriptDocument, FunscriptParser: ActualFunscriptParser } = await import('../entry/src/main/ets/core/Funscript.ts');
const { PlaybackEngine: ActualPlaybackEngine } = await import('../entry/src/main/ets/core/PlaybackEngine.ts');

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

function setup() {
  const calls = [];
  const preparations = [];
  const scans = [];
  const reads = [];
  const initialDocument = { axes: [], metadata: {}, source: 'initial' };
  const state = { scriptText: '{}', candidateActions: 0 };
  const dependencies = {
    DEMO: '{}',
    FunscriptDocument,
    FunscriptParser: { parse: () => initialDocument, MAX_ACTIONS: 100000 },
    PlaybackEngine: class {
      pause() { calls.push(['pause']); }
      load(document) { calls.push(['load', document]); }
      clearScripts() { calls.push(['clearScripts']); }
      stop() {}
      setInterpolationMode() {}
      setConnected() {}
      useExternalClock(value) { calls.push(['externalClock', value]); }
      setForeground(value) { calls.push(['foreground', value]); }
    },
    NativeVideoAdapter: class {
      snapshot() { return { failure: state.cleanupFailure || '' }; }
      async release() { calls.push(['release']); }
      pause() {}
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
        return { document: candidates[0]?.document, selectedFiles: candidates.map(candidate => candidate.file) };
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
        return { files, skipped: 0, truncated: false, warnings: [] };
      },
      async readScript(uri, current) {
        calls.push(['read', uri]);
        const pending = reads.shift();
        if (pending) {
          pending.started.resolve();
          await pending.completion.promise;
        }
        if (pending?.respectCancellation !== false && !current()) { throw Error('Read cancelled'); }
        return state.scriptText;
      }
    },
    canIUse: () => true,
    systemDateTime: { getUptime: () => 0, TimeType: { ACTIVE: 0 } },
    setInterval: () => 1,
    clearInterval: () => {},
    fileIo: {},
    util: {}
  };
  const Index = new Function(...Object.keys(dependencies), js + '\nreturn Index;')(...Object.values(dependencies));
  const page = new Index();
  page.viewActive = true;
  page.foreground = true;
  page.sync = () => {};
  page.getUIContext = () => ({ getHostContext: () => ({}) });
  return { page, calls, preparations, scans, reads, state, initialDocument };
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

test('the same page can reappear with a cleared document using the real strict engine', async () => {
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
  assert.deepEqual(page.engine.previewSamples(), []);
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
    assert.deepEqual(page.engine.previewSamples(), [], outcome);
    assert.equal(page.videoMode, false, outcome);
    assert.equal(page.videoReady, false, outcome);
    assert.equal(page.videoFullscreen, false, outcome);
    assert.equal(page.pendingVideoUri, '', outcome);
    await Promise.resolve();
    if (outcome === 'failure') state.prepareError = 'permission denied';
    if (outcome === 'cancel') page.cancelLibrary();
    pending.resolve('file://docs/new');
    await refreshing;
    page.playPause();
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

test('video without matching scripts opens against the real engine with no old simulated axes or autoplay', async () => {
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
  assert.deepEqual(page.engine.previewSamples(), []);
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
  assert.deepEqual(page.engine.previewSamples(), []);
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
