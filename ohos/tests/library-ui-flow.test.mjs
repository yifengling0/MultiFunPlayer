import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

// Exercise the actual page's state and asynchronous methods, excluding ArkUI
// builders/rendering. Native APIs and content selection are isolated mocks;
// this does not establish real picker grants or device lifecycle behavior.
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
  const picks = [];
  const scans = [];
  const reads = [];
  const initialDocument = { axes: [], metadata: {}, source: 'initial' };
  const state = { scriptText: '{}', candidateActions: 0 };
  const dependencies = {
    DEMO: '{}',
    FunscriptParser: { parse: () => initialDocument, MAX_ACTIONS: 100000 },
    PlaybackEngine: class {
      pause() { calls.push(['pause']); }
      load(document) { calls.push(['load', document]); }
      stop() {}
      useExternalClock(value) { calls.push(['externalClock', value]); }
      setForeground(value) { calls.push(['foreground', value]); }
    },
    NativeVideoAdapter: class {
      async release() { calls.push(['release']); }
      pause() {}
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
    ResourceLibrary: {
      planSearch(video, files, libraries) { calls.push(['plan', files, libraries]); if (state.plan) return state.plan; return Array.from({length: video.scriptCount}, (_,index) => ({kind: 'script', file: {uri: video.uri.replace('.mp4', '') + '.' + index + '.funscript', name: video.uri.replace('.mp4', '') + '.' + index + '.funscript'}})); },
      build: entries => ({ items: entries }),
      parseCandidate(_contents, file) {
        calls.push(['parse', file.uri]);
        return { file, document: { axes: [{ actions: new Array(state.candidateActions) }], metadata: {}, source: file.uri } };
      },
      selectDocuments(_name, candidates) {
        calls.push(['select', candidates.length]);
        return { document: candidates[0]?.document, selectedFiles: candidates.map(candidate => candidate.file) };
      }
    },
    LibraryFiles: {
      async fromSelectedUris(uris, current, progress) {
        calls.push(['scan', uris[0]]);
        const pending = scans.shift();
        if (pending) {
          pending.started.resolve();
          await pending.completion.promise;
        }
        // A stale native callback can still arrive. Tests can intentionally
        // bypass this lower-layer guard to verify Index's own generation checks.
        if (pending?.respectCancellation !== false && !current()) { throw Error('Scan cancelled'); }
        const files = uris.map(uri => ({ uri, name: uri, relativePath: uri }));
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
    picker: {
      DocumentSelectOptions: class {},
      DocumentViewPicker: class { select() { return picks.shift().promise; } },
      DocumentSelectMode: { FOLDER: 1 }
    },
    canIUse: () => true,
    systemDateTime: { getUptime: () => 0, TimeType: { ACTIVE: 0 } },
    fileIo: {},
    util: {}
  };
  const Index = new Function(...Object.keys(dependencies), js + '\nreturn Index;')(...Object.values(dependencies));
  const page = new Index();
  page.viewActive = true;
  page.foreground = true;
  page.sync = () => {};
  page.getUIContext = () => ({ getHostContext: () => ({}) });
  return { page, calls, picks, scans, reads, state, initialDocument };
}

test('stale picker cannot start IO or clear a newer picker busy state', async () => {
  const { page, calls, picks } = setup();
  const first = deferred();
  const second = deferred();
  picks.push(first, second);
  const oldSelection = page.chooseLibrary(false);
  page.cancelLibrary();
  const newerSelection = page.chooseLibrary(false);
  first.resolve(['old.mp4']);
  await oldSelection;
  assert.equal(page.libraryBusy, true);
  assert.equal(page.libraryPicking, true);
  assert.equal(calls.some(([kind]) => kind === 'scan'), false);
  second.resolve(['new.mp4']);
  await newerSelection;
  assert.equal(page.libraryItems[0].uri, 'new.mp4');
  assert.equal(page.libraryBusy, false);
  assert.equal(page.libraryPicking, false);
});

test('cancelled scan cannot publish stale progress or completion over newer selection', async () => {
  const { page, picks, scans } = setup();
  const first = deferred();
  const second = deferred();
  const scan = operation({ respectCancellation: false });
  picks.push(first, second);
  scans.push(scan);
  const oldSelection = page.chooseLibrary(false);
  first.resolve(['old.mp4']);
  await scan.started.promise;
  page.cancelLibrary();
  const newerSelection = page.chooseLibrary(false);
  second.resolve(['new.mp4']);
  await newerSelection;
  const newerMessage = page.libraryMessage;
  scan.completion.resolve();
  await oldSelection;
  assert.equal(page.libraryItems[0].uri, 'new.mp4');
  assert.equal(page.libraryMessage, newerMessage);
  assert.equal(page.libraryBusy, false);
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

test('candidate-count bound rejects before native release or script reads', async () => {
  const { page, calls, initialDocument } = setup();
  await page.openLibraryItem(item('oversize', 65));
  assert.match(page.libraryMessage, /64 candidates/);
  assert.equal(page.document, initialDocument);
  assert.equal(calls.some(([kind]) => kind === 'release' || kind === 'read'), false);
  assert.equal(page.importing, false);
});

test('text budget stops before parsing an over-budget candidate or selecting partial results', async () => {
  const { page, calls, state, initialDocument } = setup();
  state.scriptText = 'x'.repeat(2 * 1024 * 1024);
  await page.openLibraryItem(item('large', 4));
  assert.equal(calls.filter(([kind]) => kind === 'read').length, 3);
  assert.equal(calls.filter(([kind]) => kind === 'parse').length, 2);
  assert.equal(calls.some(([kind]) => kind === 'select' || kind === 'video'), false);
  assert.equal(page.document, initialDocument);
  assert.match(page.status, /Candidate (?:text|action) budget exceeded/);
  assert.equal(page.importing, false);
  assert.equal(page.openingVideo, false);
});

test('aggregate action budget stops reading and preserves the existing document', async () => {
  const { page, calls, state, initialDocument } = setup();
  state.candidateActions = 60000;
  await page.openLibraryItem(item('actions', 4));
  assert.equal(calls.filter(([kind]) => kind === 'read').length, 2);
  assert.equal(calls.filter(([kind]) => kind === 'parse').length, 2);
  assert.equal(calls.some(([kind]) => kind === 'select' || kind === 'video'), false);
  assert.equal(page.document, initialDocument);
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
  assert.equal(page.document, initialDocument);
  assert.match(page.status, /CRC mismatch/);
  assert.equal(calls.some(([kind]) => kind === 'read' || kind === 'video'), false);
  assert.equal(page.importing, false);
});
