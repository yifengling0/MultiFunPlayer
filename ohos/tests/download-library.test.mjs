import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const source = readFileSync(new URL('../entry/src/main/ets/library/DownloadLibrary.ets', import.meta.url), 'utf8');
const js = stripTypeScriptTypes(source.replace(/^import .*;\n/gm, '')
  .replace('export interface DownloadLibraryDirectory', 'interface DownloadLibraryDirectory')
  .replace('export class DownloadLibrary', 'class DownloadLibrary'));
const bundleName = 'com.multifunplayer.ohos';
const path = `/storage/Users/currentUser/Download/${bundleName}`;
const uri = `file://docs${path}`;
const nativeError = (code, message = 'native failure') => Object.assign(new Error(message), { code });

function setup(options = {}) {
  const calls = [];
  const state = { supported: true, bundleName, uris: [uri], kind: 'directory', ...options };
  const context = { applicationInfo: { name: bundleName } };
  class FileUri {
    constructor(value) { calls.push(['parse', value]); this.path = decodeURIComponent(new URL(value).pathname); }
  }
  const bundleManager = {
    BundleFlag: { GET_BUNDLE_INFO_DEFAULT: 0 },
    getBundleInfoForSelfSync(flags) {
      calls.push(['bundle', flags]);
      if (state.bundleError) throw state.bundleError;
      return { name: state.bundleName };
    }
  };
  const picker = {
    DocumentPickerMode: { DOWNLOAD: 1 },
    DocumentSaveOptions: class {},
    DocumentViewPicker: class {
      constructor(value) { assert.equal(value, context); }
      async save(options) {
        calls.push(['save', { ...options }]);
        state.afterSave?.();
        if (state.saveError) throw state.saveError;
        return state.uris;
      }
      select() { assert.fail('No file/folder selection is allowed'); }
    }
  };
  const fileIo = {
    async lstat(path) {
      calls.push(['lstat', path]);
      state.afterStat?.();
      if (state.statError) throw state.statError;
      return { isDirectory: () => state.kind === 'directory', isSymbolicLink: () => state.kind === 'symlink' };
    },
    async listFile(path, options) {
      calls.push(['list', path, options]);
      state.afterList?.();
      if (state.listError) throw state.listError;
      return [];
    },
    mkdir() { assert.fail('Only the system DOWNLOAD service may create the public root'); },
    open() { assert.fail('Directory preparation must not open any media'); }
  };
  const canIUse = capability => {
    calls.push(['capability', capability]);
    assert.equal(capability, 'SystemCapability.FileManagement.UserFileService');
    return state.supported;
  };
  const DownloadLibrary = new Function('bundleManager', 'fileIo', 'fileUri', 'picker', 'canIUse',
    `${js}\nreturn DownloadLibrary;`)(bundleManager, fileIo, { FileUri }, picker, canIUse);
  return { DownloadLibrary, state, calls, context };
}

test('DOWNLOAD prepares the system-owned app directory without any selection UI or media reads', async () => {
  const { DownloadLibrary, context, calls } = setup();
  assert.deepEqual(await DownloadLibrary.prepare(context), { uri, path, displayPath: `Download/${bundleName}` });
  assert.deepEqual(calls.filter(([op]) => op === 'save'), [['save', { pickerMode: 1 }]]);
  assert.deepEqual(calls.filter(([op]) => op === 'lstat' || op === 'list'), [
    ['lstat', path], ['list', path, { recursion: false, listNum: 1 }]
  ]);
});

test('uses the returned path and runtime bundle identity rather than an embedded user or app path', async () => {
  const name = 'org.example.player';
  const returnedPath = `/storage/Users/123/Download/${name}`;
  const returnedUri = `file://docs${returnedPath}/`;
  const { DownloadLibrary, context, calls } = setup({ bundleName: name, uris: [returnedUri] });
  assert.deepEqual(await DownloadLibrary.prepare(context), { uri: returnedUri, path: returnedPath, displayPath: `Download/${name}` });
  assert.equal(calls.find(([op]) => op === 'list')[1], returnedPath);
});

test('unsupported devices and invalid identity fail before calling the system save service', async () => {
  for (const options of [{ supported: false }, { bundleName: '../other' }, { bundleError: nativeError(401) }]) {
    const { DownloadLibrary, context, calls } = setup(options);
    await assert.rejects(DownloadLibrary.prepare(context));
    assert.equal(calls.some(([op]) => op === 'save' || op === 'lstat' || op === 'list'), false);
  }
});

test('empty or ambiguous service response is a failure, never a successful empty media library', async () => {
  for (const uris of [[], [uri, uri]]) {
    const { DownloadLibrary, context, calls } = setup({ uris });
    await assert.rejects(DownloadLibrary.prepare(context), /no single application directory/);
    assert.equal(calls.filter(([op]) => op === 'save').length, 1);
    assert.equal(calls.some(([op]) => op === 'lstat' || op === 'list'), false);
  }
});

test('rejects parents, other apps, opaque providers and traversal before any filesystem access', async () => {
  const invalid = [
    'file://docs/storage/Users/currentUser/Download',
    `${uri}.other`, `${uri}/child`, `file://other${path}`, `file://docs/private/${bundleName}`,
    `https://docs${path}`, path, `${uri}?access=all`, `${uri}#fragment`, `${uri}\n`,
    `file://docs/storage/../Download/${bundleName}`, `file://docs/storage/%2e%2e/Download/${bundleName}`,
    `file://docs/storage/%252e%252e/Download/${bundleName}`, `file://docs/storage//Download/${bundleName}`
  ];
  for (const value of invalid) {
    const { DownloadLibrary, context, calls } = setup({ uris: [value] });
    await assert.rejects(DownloadLibrary.prepare(context), /Download service/);
    assert.equal(calls.some(([op]) => op === 'lstat' || op === 'list'), false, value);
  }
});

test('permission, missing-directory and unsupported-service errors retain code with no broad fallback or retry loop', async () => {
  for (const field of ['saveError', 'statError', 'listError']) {
    for (const code of [201, 13900012, 13900002, 801]) {
      const { DownloadLibrary, context, calls } = setup({ [field]: nativeError(code) });
      await assert.rejects(DownloadLibrary.prepare(context), new RegExp(String(code)));
      assert.equal(calls.filter(([op]) => op === 'save').length, 1);
      assert.ok(calls.filter(([op]) => op === 'lstat' || op === 'list').every(([, location]) => location === path));
    }
  }
});

test('a file or symlink returned as the directory is rejected without listing', async () => {
  for (const kind of ['file', 'symlink']) {
    const { DownloadLibrary, context, calls } = setup({ kind });
    await assert.rejects(DownloadLibrary.prepare(context), /not a real directory/);
    assert.equal(calls.some(([op]) => op === 'list'), false);
  }
});

test('cancellation before or during each asynchronous stage suppresses further IO and completion', async () => {
  for (const phase of ['before', 'afterSave', 'afterStat', 'afterList']) {
    let current = phase !== 'before';
    const { DownloadLibrary, context, calls } = setup({ [phase]: () => { current = false; } });
    await assert.rejects(DownloadLibrary.prepare(context, () => current), /Scan cancelled/);
    if (phase === 'before') assert.equal(calls.length, 0);
    if (phase === 'afterSave') assert.equal(calls.some(([op]) => op === 'lstat' || op === 'list'), false);
    if (phase === 'afterStat') assert.equal(calls.some(([op]) => op === 'list'), false);
  }
});

test('explicit retry asks the system to recreate a missing root and revalidates access each time', async () => {
  const { DownloadLibrary, context, state, calls } = setup({ statError: nativeError(13900002) });
  await assert.rejects(DownloadLibrary.prepare(context), /13900002/);
  state.statError = undefined;
  assert.equal((await DownloadLibrary.prepare(context)).uri, uri);
  state.listError = nativeError(13900012);
  await assert.rejects(DownloadLibrary.prepare(context), /13900012/);
  assert.equal(calls.filter(([op]) => op === 'save').length, 3);
});
