import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { ScriptZip } from '../entry/src/main/ets/core/ScriptZip.ts';

const current = () => true;
const bytes = value => Buffer.isBuffer(value) ? value : Buffer.from(value);
const sourceUri = 'file://docs/media/film.zip';
const inflate = async (compressed, maxOutputBytes, isCurrent) => {
  assert.ok(isCurrent());
  const result = inflateRawSync(compressed, { maxOutputLength: maxOutputBytes, info: true });
  return { bytes: result.buffer, consumedBytes: result.engine.bytesWritten };
};
const read = (archive, inflater = inflate, isCurrent = current) => ScriptZip.readScripts(archive, sourceUri, inflater, isCurrent);

// Deterministic ZIP32 fixture writer. Never extracts anything or writes archive
// files. Supports deliberately malformed headers for boundary tests below.
function zip(specs, options = {}) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const spec of specs) {
    const name = bytes(spec.name);
    const content = bytes(spec.contents ?? '{}');
    const method = spec.method ?? 0;
    const compressed = spec.compressed ?? (method === 8 ? deflateRawSync(content) : content);
    const flags = spec.flags ?? (0x800 | (spec.descriptor ? 8 : 0));
    const crc = spec.crc ?? ScriptZip.crc32(content);
    const size = spec.size ?? content.length;
    const compressedSize = spec.compressedSize ?? compressed.length;
    const extra = spec.extra ?? Buffer.alloc(0);
    const localExtra = spec.localExtra ?? extra;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(spec.version ?? 20, 4);
    local.writeUInt16LE(flags, 6); local.writeUInt16LE(method, 8);
    local.writeUInt32LE(spec.descriptor ? 0 : crc, 14);
    local.writeUInt32LE(spec.descriptor ? 0 : compressedSize, 18);
    local.writeUInt32LE(spec.descriptor ? 0 : size, 22);
    local.writeUInt16LE(name.length, 26); local.writeUInt16LE(localExtra.length, 28);
    let descriptor = Buffer.alloc(0);
    if (spec.descriptor) {
      const signed = spec.descriptor !== 'unsigned';
      descriptor = Buffer.alloc(signed ? 16 : 12);
      let start = 0;
      if (signed) { descriptor.writeUInt32LE(0x08074b50, 0); start = 4; }
      descriptor.writeUInt32LE(crc, start); descriptor.writeUInt32LE(compressedSize, start + 4); descriptor.writeUInt32LE(size, start + 8);
    }
    const record = Buffer.concat([local, name, localExtra, compressed, descriptor]);
    locals.push(record);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(0x314, 4);
    central.writeUInt16LE(spec.version ?? 20, 6); central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressedSize, 20); central.writeUInt32LE(size, 24);
    central.writeUInt16LE(name.length, 28); central.writeUInt16LE(extra.length, 30);
    central.writeUInt32LE(spec.attributes ?? 0, 38); central.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([central, name, extra])); offset += record.length;
  }
  const order = options.order ?? centrals.map((_, index) => index);
  const directory = Buffer.concat(order.map(index => centrals[index]));
  const comment = bytes(options.comment ?? '');
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(specs.length, 8); end.writeUInt16LE(specs.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(comment.length, 20);
  return Buffer.concat([...locals, directory, end, comment]);
}
const central = archive => archive.readUInt32LE(archive.length - 6);
function mutate(archive, callback) { const result = Buffer.from(archive); callback(result, central(result), result.length - 22); return result; }
const base = () => zip([{ name: 'film.funscript', contents: '{"actions":[]}' }]);


test('CRC32 matches the standard check value and supports bounded cancellation', () => {
  assert.equal(ScriptZip.crc32(bytes('123456789')), 0xcbf43926);
  assert.equal(ScriptZip.crc32(bytes('')), 0);
  assert.throws(() => ScriptZip.crc32(new Uint8Array(100), () => false), /cancelled/);
});

test('stored/DEFLATE candidates keep central-directory order, leaf names and unique archive/index identities', async () => {
  const archive = zip([
    { name: 'folder/film.funscript', contents: 'first' },
    { name: 'another/film.FUNSCRIPT', contents: 'second', method: 8 },
    { name: 'readme.txt', contents: 'not a script' },
    { name: 'film.customfunscript', contents: 'loose suffix is not ZIP extension parity' },
    { name: 'nested/', contents: '', attributes: (0x41ed << 16) >>> 0 }
  ], { order: [1, 2, 0, 4, 3], comment: 'PK\x05\x06 is allowed inside a comment' });
  const results = await read(archive);
  assert.deepEqual(results.map(entry => [entry.name, entry.contents]), [['film.FUNSCRIPT', 'second'], ['film.funscript', 'first']]);
  assert.deepEqual(results.map(entry => entry.sourceUri), [`zip:${encodeURIComponent(sourceUri)}#entry=0`, `zip:${encodeURIComponent(sourceUri)}#entry=2`]);
  const other = await ScriptZip.readScripts(archive, '/different/film.zip', inflate);
  assert.notEqual(results[0].sourceUri, other[0].sourceUri);
});

test('signed/unsigned descriptors, UTF-8 names, BOM text and malformed JSON remain valid archive candidates', async () => {
  const results = await read(zip([
    { name: '电影/电影.funscript', contents: '\ufeff{"text":"😀汉字"}', method: 8, descriptor: true },
    { name: 'film.funscript', contents: '{', method: 8, descriptor: 'unsigned' },
    { name: 'empty.funscript', contents: '', method: 8 },
    { name: 'empty-stored.funscript', contents: '' }
  ]));
  assert.deepEqual(results.map(entry => entry.contents), ['{"text":"😀汉字"}', '{', '', '']);
  assert.equal(results[0].name, '电影.funscript');
});

test('all unsafe archive paths are rejected even for non-script entries', async () => {
  for (const name of ['../bad.funscript', 'a/../bad.txt', '/bad', '\\bad', 'a\\b', 'a//b', './a', 'a/./b',
    'C:/bad', 'a:stream', 'a\0b', 'a\nb', 'a\x7fb', '%2e%2e/b', 'a/%252f/b', '/']) {
    await assert.rejects(read(zip([{ name, contents: 'x' }])), /Unsafe ZIP entry path/, name);
  }
});

test('symlinks, special entries and contradictory directory metadata fail closed', async () => {
  for (const attributes of [(0xa1ff << 16) >>> 0, (0x11ff << 16) >>> 0, (0x41ed << 16) >>> 0, 0x10]) {
    await assert.rejects(read(zip([{ name: 'file.funscript', attributes }])), /links|special|directory/);
  }
  await assert.rejects(read(zip([{ name: 'folder/', contents: 'x' }])), /directory contents/);
  await assert.rejects(read(zip([{ name: 'folder/', contents: '', attributes: (0x81a4 << 16) >>> 0 }])), /directory attributes/);
});

test('ZIP64, encryption, spanning, unsupported method/flags and legacy filename encoding are explicit', async () => {
  const extras = [Buffer.from([1, 0, 0, 0]), Buffer.from([1, 0x99, 0, 0]), Buffer.from([0x17, 0, 0, 0])];
  for (const extra of extras) await assert.rejects(read(zip([{ name: 'a.funscript', extra }])), /ZIP64|Encrypted/);
  for (const flags of [1, 0x40, 0x2000]) await assert.rejects(read(zip([{ name: 'a.funscript', flags }])), /Encrypted/);
  await assert.rejects(read(zip([{ name: 'a.funscript', flags: 0x10 }])), /flags/);
  await assert.rejects(read(zip([{ name: 'a.funscript', flags: 2 }])), /flags/);
  await assert.rejects(read(zip([{ name: 'a.funscript', method: 12 }])), /stored or DEFLATE/);
  await assert.rejects(read(zip([{ name: 'a.funscript', version: 45 }])), /ZIP64/);
  await assert.rejects(read(zip([{ name: '电影.funscript', flags: 0 }])), /legacy filename/);
  await assert.rejects(read(mutate(base(), (b, c, e) => b.writeUInt16LE(1, e + 4))), /Multi-disk/);
  await assert.rejects(read(mutate(base(), (b, c, e) => b.writeUInt16LE(65535, e + 10))), /ZIP64/);
  await assert.rejects(read(mutate(base(), (b, c) => b.writeUInt32LE(0xffffffff, c + 24))), /ZIP64/);
});

test('hard archive, entry, total expansion and entry-count bounds apply before inflation', async () => {
  let calls = 0;
  const never = async () => { calls++; assert.fail('must validate limits before inflation'); };
  await assert.rejects(read(new Uint8Array(ScriptZip.MAX_ARCHIVE_BYTES + 1), never), /32 MiB/);
  await assert.rejects(read(zip([{ name: 'a.funscript', method: 8, size: ScriptZip.MAX_ENTRY_BYTES + 1 }]), never), /2 MiB/);
  await assert.rejects(read(zip(Array.from({ length: 5 }, (_, i) => ({ name: `${i}.txt`, method: 8, size: ScriptZip.MAX_ENTRY_BYTES }))), never), /8 MiB/);
  await assert.rejects(read(zip(Array.from({ length: 257 }, (_, i) => ({ name: `${i}.txt`, contents: '' }))), never), /256 entries/);
  assert.equal(calls, 0);
  assert.deepEqual(await read(zip([])), []);
  assert.deepEqual(await read(zip(Array.from({ length: 256 }, (_, i) => ({ name: `${i}.txt`, contents: '' })))), []);
});

test('declared sizes, CRC, extra fields, local/central metadata and descriptors must agree', async () => {
  for (const make of [
    () => zip([{ name: 'a.funscript', crc: 123 }]),
    () => zip([{ name: 'a.funscript', method: 8, size: 1 }]),
    () => zip([{ name: 'a.funscript', size: 1 }]),
    () => zip([{ name: 'a.funscript', extra: Buffer.from([2, 0, 10, 0]) }]),
    () => mutate(base(), b => b.writeUInt16LE(8, 8)),
    () => mutate(base(), b => b.writeUInt32LE(0, 14)),
    () => mutate(base(), b => b[30] ^= 1),
    () => mutate(base(), (b, c, e) => b.writeUInt16LE(2, e + 10)),
    () => mutate(zip([{ name: 'a.funscript', method: 8, descriptor: true }]), (b, c) => b[c - 4] ^= 1)
  ]) await assert.rejects(read(make()));
  // An ignored entry with a bad checksum invalidates all earlier candidates too.
  await assert.rejects(read(zip([{ name: 'good.funscript' }, { name: 'bad.txt', crc: 123 }])), /CRC mismatch/);
});

test('truncation, overlap, unindexed local records, trailing garbage and bad central offsets fail closed', async () => {
  const archive = base();
  for (let length = 0; length < archive.length; length++) await assert.rejects(read(archive.subarray(0, length)));
  await assert.rejects(read(Buffer.concat([archive, Buffer.from('garbage')])));
  await assert.rejects(read(mutate(archive, (b, c, e) => b.writeUInt32LE(c - 1, e + 16))));
  const two = zip([{ name: 'a.funscript' }, { name: 'b.funscript' }]);
  await assert.rejects(read(mutate(two, (b, c) => b.writeUInt32LE(0, c + 46 + 'a.funscript'.length + 42))));
  await assert.rejects(read(mutate(archive, (b, c, e) => { b.writeUInt16LE(0, e + 8); b.writeUInt16LE(0, e + 10); b.writeUInt32LE(0, e + 12); b.writeUInt32LE(e, e + 16); })), /hidden/);
});

test('deflate bombs, trailing compressed bytes and dishonest adapters cannot bypass output validation', async () => {
  const bomb = zip([{ name: 'a.funscript', method: 8, contents: 'x'.repeat(100000), size: 10 }]);
  await assert.rejects(read(bomb), /larger|size|buffer/i);
  await assert.rejects(read(zip([{ name: 'a.funscript', method: 8, compressed: Buffer.concat([deflateRawSync('{}'), Buffer.from('junk')]) }])), /trailing/);
  await assert.rejects(read(zip([{ name: 'a.funscript', method: 8 }]), async (data, max) => {
    assert.equal(max, 3); return { bytes: bytes('oversized'), consumedBytes: data.length };
  }), /size/);
  await assert.rejects(read(zip([{ name: 'a.funscript', method: 8 }]), async () => ({ bytes: bytes('{}'), consumedBytes: -1 })), /trailing/);
  await assert.rejects(read(zip([{ name: 'a.funscript', method: 8, compressed: Buffer.from([0xff, 0xff]) }])));
});

test('strict UTF-8 rejects overlong, surrogate, invalid continuation, truncation and out-of-range values', async () => {
  for (const content of [[0xff], [0xc0, 0x80], [0xed, 0xa0, 0x80], [0xe2, 0x20, 0xa1], [0xf0, 0x90], [0xf4, 0x90, 0x80, 0x80]]) {
    await assert.rejects(read(zip([{ name: 'a.funscript', contents: Buffer.from(content) }])), /UTF-8/);
  }
  await assert.rejects(read(zip([{ name: Buffer.from([0xff]), contents: '{}' }])), /UTF-8/);
  const text = '😀汉字'.repeat(20000);
  assert.equal((await read(zip([{ name: 'a.funscript', contents: text, method: 8 }])))[0].contents, text);
});

test('cancellation before validation or after inflation returns no partial candidates', async () => {
  await assert.rejects(read(base(), inflate, () => false), /cancelled/);
  let active = true;
  await assert.rejects(read(zip([{ name: 'first.funscript' }, { name: 'second.funscript', method: 8 }]), async (...args) => {
    const result = await inflate(...args); active = false; return result;
  }, () => active), /cancelled/);
});

const source = readFileSync(new URL('../entry/src/main/ets/library/ScriptZipFiles.ets', import.meta.url), 'utf8');
const nativeJs = stripTypeScriptTypes(source.replace(/^import .*;\n/gm, '').replace('export class ScriptZipFiles', 'class ScriptZipFiles'));
function nativeSetup(archive = base()) {
  const calls = [];
  const state = { type: 'file', bytes: archive, reportedSize: archive.length, active: true, handles: new Set(),
    afterOpen: undefined, afterRead: undefined, afterClose: undefined, afterInflate: undefined, afterEnd: undefined,
    shortRead: Infinity, openError: undefined, zipStatus: 1, initStatus: 0, streamOverride: undefined };
  let offset = 0;
  const fileIo = {
    OpenMode: { READ_ONLY: 0, NOFOLLOW: 0o400000, NONBLOCK: 0o4000 },
    async open(uri, mode) {
      calls.push(['open', uri, mode]);
      if (state.openError) throw state.openError;
      const file = { fd: 7 }; state.handles.add(file.fd); state.afterOpen?.(); return file;
    },
    async stat(fd) { calls.push(['stat', fd]); return { size: state.reportedSize, isFile: () => state.type === 'file' }; },
    async read(fd, target) {
      calls.push(['read', fd, target.byteLength]);
      const count = Math.min(target.byteLength, state.bytes.length - offset, state.shortRead);
      new Uint8Array(target).set(state.bytes.subarray(offset, offset + count)); offset += count;
      state.afterRead?.(); return count;
    },
    async close(file) { calls.push(['close', file.fd]); assert.ok(state.handles.delete(file.fd)); state.afterClose?.(); }
  };
  let stream;
  const zlib = { ReturnStatus: { OK: 0, STREAM_END: 1 }, CompressFlushMode: { FINISH: 4 },
    async createZip() {
      calls.push(['createZip']);
      return {
        async inflateInit2(options, windowBits) { calls.push(['init', windowBits]); assert.equal(windowBits, -15); return state.initStatus; },
        async inflate(options, mode) {
          calls.push(['inflate', options.availableIn, options.availableOut]); assert.equal(mode, 4);
          assert.equal(options.availableOut, options.nextOut.byteLength);
          const result = inflateRawSync(options.nextIn, { maxOutputLength: options.availableOut, info: true });
          new Uint8Array(options.nextOut).set(result.buffer);
          stream = { totalIn: result.engine.bytesWritten, totalOut: result.buffer.length };
          state.afterInflate?.(); return state.zipStatus;
        },
        async getZStream() { calls.push(['stream']); return state.streamOverride ?? stream; },
        async inflateEnd() { calls.push(['end']); state.afterEnd?.(); return 0; }
      };
    }
  };
  const ScriptZipFiles = new Function('fileIo', 'zlib', 'ScriptZip', `${nativeJs}\nreturn ScriptZipFiles;`)(fileIo, zlib, ScriptZip);
  return { ScriptZipFiles, calls, state, read: () => ScriptZipFiles.readScripts(sourceUri, () => state.active) };
}

test('native ZIP reader uses read-only nofollow/nonblock FD, bounded short reads and finally close', async () => {
  const value = nativeSetup(zip([{ name: 'a.funscript', contents: '汉字'.repeat(20000) }]));
  value.state.shortRead = 12345;
  assert.equal((await value.read())[0].contents, '汉字'.repeat(20000));
  assert.equal(value.state.handles.size, 0);
  assert.ok(value.calls.filter(([op]) => op === 'read').every(([, , size]) => size <= 65536));
  assert.equal(value.calls[0][2], 0o400000 | 0o4000);
  assert.equal(value.calls.filter(([op]) => op === 'close').length, 1);
});

test('native raw DEFLATE has bounded output, validates terminal status/counters and always releases state', async () => {
  const good = nativeSetup(zip([{ name: 'a.funscript', method: 8 }]));
  assert.equal((await good.read())[0].contents, '{}');
  assert.deepEqual(good.calls.slice(-4).map(([op]) => op), ['init', 'inflate', 'stream', 'end']);
  assert.equal(good.calls.find(([op]) => op === 'inflate')[2], 3);
  for (const override of [
    value => value.state.zipStatus = 0,
    value => value.state.streamOverride = { totalIn: 0, totalOut: 2 },
    value => value.state.streamOverride = { totalIn: 4, totalOut: 100 },
    value => value.state.afterInflate = () => { value.state.active = false; },
    value => value.state.afterEnd = () => { value.state.active = false; }
  ]) {
    const value = nativeSetup(zip([{ name: 'a.funscript', method: 8 }])); override(value);
    await assert.rejects(value.read()); assert.equal(value.calls.filter(([op]) => op === 'end').length, 1);
    assert.equal(value.state.handles.size, 0);
  }
  const bomb = nativeSetup(zip([{ name: 'a.funscript', method: 8, contents: 'x'.repeat(100000), size: 10 }]));
  await assert.rejects(bomb.read()); assert.equal(bomb.calls.filter(([op]) => op === 'end').length, 1);
  assert.equal(bomb.calls.find(([op]) => op === 'inflate')[2], 11);
});

test('native reader rejects special/oversized/changing/truncated files and closes on cancellation', async () => {
  for (const override of [
    value => value.state.type = 'special',
    value => value.state.reportedSize = ScriptZip.MAX_ARCHIVE_BYTES + 1,
    value => value.state.reportedSize = 0,
    value => value.state.reportedSize += 1,
    value => value.state.reportedSize -= 1,
    value => value.state.afterOpen = () => { value.state.active = false; },
    value => value.state.afterRead = () => { value.state.active = false; },
    value => value.state.afterClose = () => { value.state.active = false; }
  ]) {
    const value = nativeSetup(); override(value); await assert.rejects(value.read());
    assert.equal(value.state.handles.size, 0); assert.equal(value.calls.filter(([op]) => op === 'close').length, 1);
    assert.equal(value.calls.some(([op]) => op === 'createZip'), false);
  }
  const denied = nativeSetup(); denied.state.openError = Object.assign(new Error('denied'), { code: 13900012 });
  await assert.rejects(denied.read(), /permission denied or access expired/);
  assert.equal(denied.calls.some(([op]) => op === 'close'), false);
});

test('exact 2 MiB entry and 8 MiB aggregate limits remain usable', async () => {
  const entry = Buffer.alloc(ScriptZip.MAX_ENTRY_BYTES, 32);
  entry[0] = 123; entry[1] = 125;
  const one = await read(zip([{ name: 'a.funscript', contents: entry, method: 8 }]));
  assert.equal(one[0].contents.length, ScriptZip.MAX_ENTRY_BYTES);
  assert.deepEqual(await read(zip(Array.from({ length: 4 }, (_, index) => ({
    name: `${index}.txt`, contents: entry, method: 8
  })))), []);
});

test('archive identities and names have hard length/control limits', async () => {
  for (const identity of ['', 'x'.repeat(4097), 'bad\0uri', 'bad\x85uri']) {
    await assert.rejects(ScriptZip.readScripts(base(), identity, inflate), /identity/);
  }
  await assert.rejects(read(zip([{ name: 'x'.repeat(4097), contents: '' }])), /name.*limit/);
  const value = nativeSetup();
  await assert.rejects(value.ScriptZipFiles.readScripts('bad\0uri'), /URI/);
  assert.equal(value.calls.length, 0);
});

test('native initialization failure never inflates or claims successful cleanup', async () => {
  const value = nativeSetup(zip([{ name: 'a.funscript', method: 8 }]));
  value.state.initStatus = -2;
  await assert.rejects(value.read(), /initialize/);
  assert.equal(value.calls.some(([op]) => op === 'inflate' || op === 'end'), false);
  assert.equal(value.state.handles.size, 0);
});
