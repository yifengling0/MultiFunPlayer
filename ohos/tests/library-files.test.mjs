import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes, registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return nextResolve(specifier + '.ts', context);
  return nextResolve(specifier, context);
} });
const { ResourceLibrary } = await import('../entry/src/main/ets/core/ResourceLibrary.ts');

const source = readFileSync(new URL('../entry/src/main/ets/library/LibraryFiles.ets', import.meta.url), 'utf8');
const js = stripTypeScriptTypes(source.replace(/^import .*;\n/gm, '').replace('export class LibraryFiles', 'class LibraryFiles'));
function nativeError(code, message = 'native failure') { return Object.assign(new Error(message), { code }); }
function stats(node) {
  return { size: node.size ?? node.bytes?.length ?? 0, isDirectory: () => node.type === 'dir',
    isSymbolicLink: () => node.type === 'link', isFile: () => node.type === 'file' };
}
function file(contents) { return { type: 'file', bytes: typeof contents === 'string' ? Buffer.from(contents) : contents }; }
function setup(nodes = {}) {
  const tree = new Map(Object.entries(nodes));
  const calls = [];
  const handles = new Map();
  let sequence = 0;
  const state = { afterList: undefined, afterOpen: undefined, afterRead: undefined, afterClose: undefined, shortReads: undefined };
  class FileUri {
    constructor(value) { this.url = new URL(value.startsWith('/') ? `file://app${value}` : value); }
    get path() { return decodeURIComponent(this.url.pathname); }
    get name() { return this.path.split('/').at(-1); }
    get scheme() { return this.url.protocol.slice(0, -1); }
    get authority() { return this.url.host; }
  }
  function pathOf(value) { return value.startsWith('/') ? value : new FileUri(value).path; }
  function getNode(path) {
    const node = tree.get(path);
    if (!node) throw nativeError(13900002, 'No such file');
    if (node.error) throw node.error;
    return node;
  }
  const fileIo = {
    OpenMode: { READ_ONLY: 0, NOFOLLOW: 0o400000, NONBLOCK: 0o4000 },
    async lstat(path) { calls.push(['lstat', path]); return stats(getNode(path)); },
    async listFile(path, options) {
      calls.push(['list', path, options]);
      const node = getNode(path);
      if (node.listError) throw node.listError;
      const prefix = path === '/' ? '/' : path + '/';
      const names = node.names ?? [...tree.keys()].filter(key => key.startsWith(prefix) && !key.slice(prefix.length).includes('/')).map(key => key.slice(prefix.length));
      state.afterList?.(path);
      return names.slice(0, options.listNum);
    },
    async open(uri, mode) {
      calls.push(['open', uri, mode]);
      const node = getNode(pathOf(uri));
      if (node.type === 'link' && (mode & fileIo.OpenMode.NOFOLLOW)) throw nativeError(13900033, 'Symbolic link');
      const handle = { fd: ++sequence }; handles.set(handle.fd, { node, offset: 0 });
      state.afterOpen?.(); return handle;
    },
    async stat(fd) { calls.push(['stat', fd]); return stats(handles.get(fd).node); },
    async read(fd, target) {
      calls.push(['read', fd, target.byteLength]);
      const handle = handles.get(fd);
      const count = Math.min(target.byteLength, handle.node.bytes.length - handle.offset, state.shortReads ?? Infinity);
      new Uint8Array(target).set(handle.node.bytes.subarray(handle.offset, handle.offset + count));
      handle.offset += count; state.afterRead?.(handle); return count;
    },
    async close(handle) { calls.push(['close', handle.fd]); assert.ok(handles.delete(handle.fd), 'FD closed exactly once'); state.afterClose?.(); },
    async mkdir(path) {
      calls.push(['mkdir', path]);
      if (tree.has(path)) throw nativeError(13900015, 'File exists');
      tree.set(path, { type: 'dir' });
    }
  };
  const util = { TextDecoder: { create: (encoding, options) => ({ decodeToString: bytes => new TextDecoder(encoding, options).decode(bytes) }) } };
  let ticks = 0;
  const LibraryFiles = new Function('fileIo', 'fileUri', 'util', 'setTimeout', `${js}\nreturn LibraryFiles;`)(
    fileIo, { FileUri }, util, fn => { ticks++; queueMicrotask(fn); return ticks; });
  return { LibraryFiles, tree, calls, state, handles, ticks: () => ticks };
}
const current = () => true;
const quiet = () => {};

test('bounded recursive scan skips symlinks/special files and never follows depth five', async () => {
  const nodes = { '/root': { type: 'dir' }, '/root/link': { type: 'link' }, '/root/pipe': { type: 'special' }, '/root/a.mp4': file('video') };
  let path = '/root';
  for (let depth = 1; depth <= 5; depth++) { path += `/d${depth}`; nodes[path] = { type: 'dir' }; nodes[path + '/x.funscript'] = file('{}'); }
  const { LibraryFiles, calls } = setup(nodes);
  const result = await LibraryFiles.scanDirectory('file://docs/root', current, quiet);
  assert.equal(result.files.length, 5);
  assert.ok(result.files.every(entry => !entry.relativePath.includes('d5')));
  assert.equal(result.truncated, true);
  assert.ok(!calls.some(([op, path]) => op === 'list' && (path.includes('link') || path.endsWith('/d5'))));
  assert.ok(calls.filter(([op]) => op === 'list').every(([, , options]) => options.recursion === false && options.listNum <= 1000));
});

test('entry cap is 1000 including non-files and progress snapshots cannot mutate the index', async () => {
  const nodes = { '/root': { type: 'dir' } };
  for (let index = 0; index < 1100; index++) nodes[`/root/${String(index).padStart(4, '0')}.mp4`] = file('v');
  const { LibraryFiles, calls, ticks } = setup(nodes);
  const visited = [];
  const result = await LibraryFiles.scanDirectory('/root', current, progress => {
    visited.push(progress.visited);
    if (progress.files.length) progress.files[0].name = 'mutated';
    progress.files.length = 0;
  });
  assert.equal(result.visited, 1000); assert.equal(result.files.length, 1000); assert.equal(result.truncated, true);
  assert.notEqual(result.files[0].name, 'mutated'); assert.ok(visited.includes(32)); assert.equal(visited.at(-1), 1000);
  assert.equal(calls.filter(([op]) => op === 'lstat').length, 1001); assert.ok(ticks() >= 32);
});

test('unsafe names including encoded traversal are skipped before lstat', async () => {
  const names = ['..', '.', '../outside', '/absolute', '\\outside', '%2e%2e', '%252e%252e', '%2foutside', 'nul\0x', 'fine.mp4'];
  const { LibraryFiles, calls } = setup({ '/root': { type: 'dir', names }, '/root/fine.mp4': file('v') });
  const result = await LibraryFiles.scanDirectory('/root', current, quiet);
  assert.deepEqual(result.files.map(entry => entry.name), ['fine.mp4']); assert.equal(result.skipped, 9);
  assert.deepEqual(calls.filter(([op]) => op === 'lstat').map(([, path]) => path), ['/root', '/root/fine.mp4']);
});

test('cancellation after listing suppresses subsequent IO and progress', async () => {
  const { LibraryFiles, calls, state } = setup({ '/root': { type: 'dir' }, '/root/a.mp4': file('v') });
  let active = true; state.afterList = () => { active = false; };
  await assert.rejects(LibraryFiles.scanDirectory('/root', () => active, () => assert.fail('stale progress')), /Scan cancelled/);
  assert.deepEqual(calls.map(([op]) => op), ['lstat', 'list']);
});

test('root permission errors throw explicitly; inaccessible child folders remain visible in warnings', async () => {
  const denied = nativeError(13900012, 'Permission denied');
  const blocked = setup({ '/root': { type: 'dir', error: denied } });
  await assert.rejects(blocked.LibraryFiles.scanDirectory('/root', current, quiet), /permission denied or access expired/);
  const child = setup({ '/root': { type: 'dir' }, '/root/private': { type: 'dir', listError: denied }, '/root/a.mp4': file('v') });
  const result = await child.LibraryFiles.scanDirectory('/root', current, quiet);
  assert.equal(result.files.length, 1); assert.equal(result.skipped, 1); assert.match(result.warnings.join(' '), /permission denied/);
});

test('multifile fallback preserves original URIs and same-name parent identity without reading video', async () => {
  const { LibraryFiles, calls, handles } = setup({ '/A/film one.mp4': file('v'), '/B/film one.mp4': file('v'), '/A/film one.funscript': file('{}') });
  const uris = ['file://docs/A/film%20one.mp4', 'file://docs/B/film%20one.mp4', 'file://docs/A/film%20one.funscript'];
  const result = await LibraryFiles.fromSelectedUris([...uris, uris[0]], current, quiet);
  assert.deepEqual(result.files.map(entry => entry.uri), uris); assert.equal(result.skipped, 1);
  assert.notEqual(result.files[0].relativePath, result.files[1].relativePath);
  assert.ok(result.files.every(entry => !entry.relativePath.startsWith('/') && !entry.relativePath.includes('//')));
  assert.equal(result.files[0].name, 'film one.mp4'); assert.equal(LibraryFiles.nameOf(uris[0]), 'film one.mp4');
  assert.equal(calls.some(([op]) => op === 'read'), false); assert.equal(handles.size, 0);
});

test('selected symlinks and special files are rejected and opened descriptors close', async () => {
  const { LibraryFiles, handles, calls } = setup({ '/link.mp4': { type: 'link' }, '/pipe.mp4': { type: 'special' } });
  const result = await LibraryFiles.fromSelectedUris(['file://docs/link.mp4', 'file://docs/pipe.mp4'], current, quiet);
  assert.equal(result.files.length, 0); assert.equal(result.skipped, 2); assert.equal(handles.size, 0);
  assert.ok(calls.filter(([op]) => op === 'open').every(([, , flags]) => (flags & 0o400000) && (flags & 0o4000)));
});

test('selection cancellation immediately after open still closes its FD', async () => {
  const { LibraryFiles, handles, state, calls } = setup({ '/a.mp4': file('v') });
  let active = true; state.afterOpen = () => { active = false; };
  await assert.rejects(LibraryFiles.fromSelectedUris(['file://docs/a.mp4'], () => active, quiet), /Scan cancelled/);
  assert.equal(handles.size, 0); assert.deepEqual(calls.map(([op]) => op), ['open', 'close']);
});

test('script reads use bounded chunks, support short reads and validate UTF8 after complete assembly', async () => {
  const contents = ' '.repeat(65535) + '汉字' + ' '.repeat(70000);
  const { LibraryFiles, calls, state, handles } = setup({ '/a.funscript': file(contents) });
  state.shortReads = 12345;
  assert.equal(await LibraryFiles.readScript('/a.funscript'), contents); assert.equal(handles.size, 0);
  assert.ok(calls.filter(([op]) => op === 'read').every(([, , size]) => size <= 65536));
});

test('oversize, empty, nonregular, invalid UTF8 and premature EOF scripts all close FDs', async () => {
  const cases = [file(''), { ...file('x'), size: 2 * 1024 * 1024 + 1 }, { type: 'special' }, file(Buffer.from([0xff])), { ...file('{}'), size: 4 }];
  for (const node of cases) {
    const { LibraryFiles, handles } = setup({ '/bad': node });
    await assert.rejects(LibraryFiles.readScript('/bad'));
    assert.equal(handles.size, 0);
  }
});

test('script cancellation after a read closes the FD and suppresses its text', async () => {
  const { LibraryFiles, state, handles } = setup({ '/a': file('{}') });
  let active = true; state.afterRead = () => { active = false; };
  await assert.rejects(LibraryFiles.readScript('/a', () => active), /Scan cancelled/); assert.equal(handles.size, 0);
});

test('script growth while reading is detected rather than returning a partial prefix', async () => {
  const { LibraryFiles, state, handles } = setup({ '/a': file('{}') });
  let changed = false;
  state.afterRead = handle => { if (!changed) { changed = true; handle.node.bytes = Buffer.from('{}extra'); } };
  await assert.rejects(LibraryFiles.readScript('/a'), /changed while being read/); assert.equal(handles.size, 0);
});

test('private library creation is app-filesDir scoped and existing directories are revalidated', async () => {
  const { LibraryFiles, tree } = setup();
  assert.equal(await LibraryFiles.createPrivateDirectory('/private/files'), '/private/files/MediaLibrary');
  assert.equal(await LibraryFiles.createPrivateDirectory('/private/files'), '/private/files/MediaLibrary');
  tree.set('/private/files/MediaLibrary', { type: 'link' });
  await assert.rejects(LibraryFiles.createPrivateDirectory('/private/files'), /not a real directory/);
});


test('script permission errors are explicit and cancellation during final close suppresses text', async () => {
  const blocked = setup({ '/denied': { type: 'file', error: nativeError(13900012) } });
  await assert.rejects(blocked.LibraryFiles.readScript('/denied'), /permission denied or access expired/);
  const { LibraryFiles, state, handles } = setup({ '/a': file('{}') });
  let active = true; state.afterClose = () => { active = false; };
  await assert.rejects(LibraryFiles.readScript('/a', () => active), /Scan cancelled/);
  assert.equal(handles.size, 0);
});


test('unrelated files, extension-only names and controls cannot abort a valid directory pair', async () => {
  const unsupported = ['.nomedia', '.DS_Store', '.funscript', '.mp4', 'readme.txt', ' .funscript', 'bad\n.mp4', 'bad\x7f.funscript', 'bad\x85.mp4'];

  const nodes = { '/root': { type: 'dir' }, '/root/film.mp4': file('v'), '/root/film.funscript': file('{}'),
    '/root/extensionless-folder': { type: 'dir' }, '/root/extensionless-folder/second.MKV': file('v') };
  for (const name of unsupported) nodes['/root/' + name] = file('x');
  const { LibraryFiles, calls } = setup(nodes);
  const result = await LibraryFiles.scanDirectory('/root', current, quiet);
  assert.deepEqual(result.files.map(entry => entry.name), ['film.funscript', 'film.mp4', 'second.MKV']);
  assert.equal(result.skipped, unsupported.length);
  const catalog = ResourceLibrary.build(result.files);
  assert.deepEqual(catalog.items.map(item => [item.title, item.status]), [['second', 'video-only'], ['film', 'paired']]);
  assert.ok(calls.some(([op, path]) => op === 'list' && path === '/root/extensionless-folder'));
});

test('multifile fallback skips unsupported, extension-only and control-character names independently', async () => {
  const names = ['film.mp4', 'film.funscript', '.nomedia', '.DS_Store', '.funscript', 'notes.json', 'bad\n.mp4', 'bad\x7f.funscript', 'bad\x85.mp4'];

  const nodes = {};
  for (const name of names) nodes['/root/' + name] = file('x');
  const { LibraryFiles, calls, handles } = setup(nodes);
  const uris = names.map(name => 'file://docs/root/' + encodeURIComponent(name));
  const result = await LibraryFiles.fromSelectedUris(uris, current, quiet);
  assert.deepEqual(result.files.map(entry => entry.name), ['film.mp4', 'film.funscript']);
  assert.equal(result.skipped, names.length - 2); assert.equal(handles.size, 0);
  assert.deepEqual(ResourceLibrary.build(result.files).items.map(item => [item.title, item.status]), [['film', 'paired']]);
  assert.equal(calls.filter(([op]) => op === 'open').length, 2);
});


test('upstream loose funscript suffix candidates pass through scan and multi-picker boundaries', async () => {
  const { LibraryFiles } = setup({ '/root': { type: 'dir' }, '/root/film.mp4': file('v'),
    '/root/film.customfunscript': file('{}'), '/root/film.EXTRA_FUNSCRIPT': file('{}') });
  const scan = await LibraryFiles.scanDirectory('/root', current, quiet);
  assert.deepEqual(scan.files.map(entry => entry.name), ['film.EXTRA_FUNSCRIPT', 'film.customfunscript', 'film.mp4']);
  const scannedItem = ResourceLibrary.build(scan.files).items.find(item => item.title === 'film');
  assert.equal(scannedItem.scripts.length, 2);
  const selected = await LibraryFiles.fromSelectedUris(['file://docs/root/film.mp4', 'file://docs/root/film.customfunscript'], current, quiet);
  assert.deepEqual(selected.files.map(entry => entry.name), ['film.mp4', 'film.customfunscript']);
  const selectedItem = ResourceLibrary.build(selected.files).items.find(item => item.title === 'film');
  assert.equal(selectedItem.scripts[0].file.name, 'film.customfunscript');
});
