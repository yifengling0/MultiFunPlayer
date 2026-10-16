import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { MediaClock, MediaClockSnapshot } from '../entry/src/main/ets/core/MediaClock.ts';
const source = readFileSync(new URL('../entry/src/main/ets/media/NativeVideoAdapter.ets', import.meta.url), 'utf8');
const js = stripTypeScriptTypes(source.replace(/^import .*;\n/gm, '').replace('export class NativeVideoAdapter', 'class NativeVideoAdapter'));
function deferred() { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; }
function setup() {
  const calls = [];
  const players = [];
  let fd = 0;
  const state = { releaseFailures: 0, closeFailures: 0, supported: true, regularFile: true, createWait: undefined };
  const fileIo = {
    OpenMode: { READ_ONLY: 0, NOFOLLOW: 1, NONBLOCK: 2 },
    async open(uri) { calls.push(`open:${uri}`); return { fd: ++fd }; },
    async stat() { return { size: 1024, isFile: () => state.regularFile }; },
    async close(file) { calls.push(`close:${file.fd}`); if (state.closeFailures-- > 0) throw Error('close rejected'); }
  };
  const media = {
    SeekMode: { SEEK_CLOSEST: 2 }, BufferingInfoType: { BUFFERING_START: 1, BUFFERING_END: 2 },
    async createAVPlayer() {
      const handlers = new Map();
      const id = players.length + 1;
      const player = {
        state: 'idle', currentTime: 0, duration: 10000,
        on(type, fn) { handlers.set(type, fn); },
        async emit(type, value) { if (type === 'stateChange') this.state = value; await handlers.get(type)?.(value); },
        async release() { calls.push(`release:${id}`); if (state.releaseFailures-- > 0) throw Error('release rejected'); this.state = 'released'; },
        async pause() { await this.emit('stateChange', 'paused'); },
        async play() { await this.emit('stateChange', 'playing'); },
        async prepare() { await this.emit('stateChange', 'prepared'); },
        seek() {}, setPlaybackRate() {}, setVolume() {}
      };
      players.push(player);
      if (state.createWait) { const wait = state.createWait; state.createWait = undefined; await wait.promise; }
      return player;
    }
  };
  const Adapter = new Function('media', 'fileIo', 'systemDateTime', 'MediaClock', 'MediaClockSnapshot', 'canIUse', 'setInterval', 'clearInterval', `${js}\nreturn NativeVideoAdapter;`)(
    media, fileIo, { TimeType: { STARTUP: 0 }, getUptime: () => 100 }, MediaClock, MediaClockSnapshot,
    () => state.supported, () => 1, () => {});
  return { adapter: new Adapter(() => {}), calls, players, state };
}
test('release failure retains player and FD; retry releases then closes exactly once', async () => {
  const { adapter, calls, state } = setup();
  await adapter.open('one', 'surface'); state.releaseFailures = 1;
  await adapter.release();
  assert.equal(adapter.snapshot().state, 'error');
  assert.deepEqual(calls, ['open:one', 'release:1']);
  await adapter.release(); await adapter.release();
  assert.deepEqual(calls, ['open:one', 'release:1', 'release:1', 'close:1']);
});
test('close failure retains only FD; retry never releases native player twice', async () => {
  const { adapter, calls, state } = setup();
  await adapter.open('one', 'surface'); state.closeFailures = 1;
  await adapter.release(); await adapter.release(); await adapter.release();
  assert.deepEqual(calls, ['open:one', 'release:1', 'close:1', 'close:1']);
});
test('new open is blocked while cleanup still fails, then succeeds after recovery', async () => {
  const { adapter, calls, state } = setup();
  await adapter.open('one', 'surface'); state.releaseFailures = 2;
  await adapter.release(); await adapter.open('two', 'surface');
  assert.equal(adapter.snapshot().state, 'error');
  assert.equal(calls.includes('open:two'), false);
  await adapter.open('two', 'surface');
  assert.equal(calls.includes('open:two'), true);
  assert.equal(calls.filter(c => c === 'close:1').length, 1);
  await adapter.release();
});
test('stale pending creation cleans its own resources exactly once and ignores old callbacks', async () => {
  const { adapter, calls, players, state } = setup();
  const wait = deferred(); state.createWait = wait;
  const oldOpen = adapter.open('old', 'surface');
  while (players.length === 0) await Promise.resolve();
  await adapter.open('new', 'surface');
  wait.resolve(); await oldOpen;
  assert.equal(calls.filter(c => c === 'release:1').length, 1);
  assert.equal(calls.filter(c => c === 'close:1').length, 1);
  await players[1].emit('stateChange', 'prepared');
  await adapter.release();
  await players[1].emit('stateChange', 'prepared');
  await players[1].emit('timeUpdate', 9000);
  assert.equal(adapter.snapshot().ready, false);
  assert.equal(adapter.snapshot().positionMs, 0);
});
test('missing AVPlayer capability fails before opening any resource', async () => {
  const { adapter, calls, state } = setup(); state.supported = false;
  await adapter.open('one', 'surface');
  assert.equal(adapter.snapshot().state, 'error');
  assert.match(adapter.snapshot().failure, /unavailable/);
  assert.deepEqual(calls, []);
});
test('concurrent release shares cleanup instead of double releasing or closing', async () => {
  const { adapter, calls, players } = setup();
  await adapter.open('one', 'surface');
  const wait = deferred();
  players[0].release = async () => { calls.push('release:1'); await wait.promise; };
  const first = adapter.release(); const second = adapter.release();
  wait.resolve(); await Promise.all([first, second]);
  assert.deepEqual(calls, ['open:one', 'release:1', 'close:1']);
});
test('failed stale creation cleanup is retained and recoverable without losing new source ownership', async () => {
  const { adapter, calls, players, state } = setup();
  const wait = deferred(); state.createWait = wait;
  const oldOpen = adapter.open('old', 'surface');
  while (players.length === 0) await Promise.resolve();
  await adapter.open('new', 'surface');
  state.releaseFailures = 1; wait.resolve(); await oldOpen;
  assert.equal(adapter.snapshot().state, 'error');
  assert.equal(calls.includes('close:1'), false);
  await adapter.release();
  assert.equal(calls.filter(c => c === 'release:1').length, 2);
  assert.equal(calls.filter(c => c === 'release:2').length, 1);
  assert.equal(calls.filter(c => c === 'close:1').length, 1);
  assert.equal(calls.filter(c => c === 'close:2').length, 1);
});

test('nonregular video is rejected before creating player and closes descriptor', async () => {
  const { adapter, calls, players, state } = setup();
  state.regularFile = false;
  await adapter.open('special', 'surface');
  assert.equal(players.length, 0);
  assert.equal(adapter.snapshot().state, 'error');
  assert.deepEqual(calls, ['open:special', 'close:1']);
});
