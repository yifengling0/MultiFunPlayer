import './helpers/socket-loopback-020-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { NodeLoopbackEnvironment, startReceiver, eventually, delay, deferred } from './helpers/socket-loopback-020-bridge.mjs';
// Node's close event provides hadError; OHOS close() resolves void. Normalize
// only the injected test SDK facade, leaving both production adapters unchanged.
class HereSphereNodeEnvironment extends NodeLoopbackEnvironment {
  createTcp() { const socket = super.createTcp(), close = socket.close.bind(socket); socket.close = async () => { await close(); }; return socket; }
}
const { RemoteMediaClock } = await import('../entry/src/main/ets/core/RemoteMediaClock.ts');
const { HereSphereMediaSource } = await import('../entry/src/main/ets/media/heresphere/HereSphereMediaSource.ts');
const { NativeDeoVrTransportFactory } = await import('../entry/src/main/ets/media/deovr/NativeDeoVrTransport.ets');
const { DeoVrFrameDecoder, frameDeoVrPayload, encodeDeoVrCommand } = await import('../entry/src/main/ets/media/deovr/DeoVrProtocol.ts');
const options = { connectTimeoutMs: 500, sendTimeoutMs: 150, closeTimeoutMs: 500, heartbeatIntervalMs: 1000, maximumQueuedCommands: 8 };
const limits = { connectTimeoutMs: 500, closeTimeoutMs: 500, maximumSendBytes: 65540, maximumReceiveBytes: 262144 };
const frame = value => frameDeoVrPayload(new TextEncoder().encode(JSON.stringify(value)));
const sample = (extra = {}) => ({ resource: 'fixture.mp4', path: 'ignored.mp4', identifier: 'https://example.test/scene/1', playerState: 0, duration: 60, currentTime: 2.5, playbackSpeed: 1, ...extra });
async function setup(t, override = {}) {
  const receiver = await startReceiver('tcp', { echo: false }), environment = new HereSphereNodeEnvironment();
  const native = new NativeDeoVrTransportFactory(environment, limits), source = new HereSphereMediaSource(native, environment, { ...options, ...override });
  const events = []; source.subscribe((_snapshot, values) => events.push(...values));
  t.after(async () => { try { await source.disconnect(); } finally { await receiver.close(); } });
  assert.equal(environment.sockets.length, 0); assert.equal(environment.timers.size, 0); assert.equal(native.inspect().automaticConnection, false);
  const endpoint = { host: '127.0.0.1', port: receiver.port, family: 1 }; await source.connect(endpoint);
  await eventually(() => receiver.accepted === 1, 'loopback accepted');
  const server = [...receiver.connections][0];
  return { receiver, environment, native, source, endpoint, events, server };
}
test('HereSphere core → production native TCP → real 127.0.0.1 framing, fields, commands, reset and reconnect', async t => {
  const s = await setup(t, { heartbeatIntervalMs: 80 }), bytes = frame(sample()), clock = new RemoteMediaClock();
  clock.begin(s.source.snapshot().generation); s.source.subscribe(snapshot => clock.accept(snapshot));
  s.server.write(bytes.slice(0, 1)); await delay(8); assert.equal(s.source.snapshot().receiptSequence, 0);
  s.server.write(Buffer.concat([bytes.slice(1), frame(sample({ currentTime: 3 }))]));
  await eventually(() => s.source.snapshot().receiptSequence === 2, 'fragmented/coalesced HereSphere packets');
  assert.equal(s.source.snapshot().sourceKind, 'heresphere'); assert.equal(s.source.snapshot().path, 'fixture.mp4');
  assert.equal(s.source.snapshot().sceneUri, 'https://example.test/scene/1'); assert.equal(clock.positionSeconds, 3); assert.equal(clock.ready(s.environment.nowMs()), true);
  assert.deepEqual(s.events.map(event => event.kind), ['path', 'playing', 'duration', 'position', 'speed', 'position']);
  clock.seek(); assert.equal(clock.ready(s.environment.nowMs()), false);
  const before = s.source.snapshot(), commands = [{kind:'playPause',playing:false},{kind:'seek',value:20},{kind:'speed',value:2},{kind:'path',path:'next.mp4'}];
  const receipts = await Promise.all([s.source.playPause(false), s.source.seek(20), s.source.changeSpeed(2), s.source.changePath('next.mp4')]);
  assert.ok(receipts.every(receipt => receipt.remoteAcknowledgement === false)); assert.deepEqual(s.source.snapshot(), before); assert.equal(clock.positionSeconds, 3); assert.equal(clock.ready(s.environment.nowMs()), false);
  const expected = Buffer.concat(commands.map(command => Buffer.from(encodeDeoVrCommand(command))));
  await eventually(() => s.receiver.bytes().length >= expected.length, 'exact command bytes on OS loopback');
  const decoded = new DeoVrFrameDecoder().push(s.receiver.bytes());
  assert.deepEqual(decoded.filter(value => value !== null).map(value => JSON.parse(new TextDecoder().decode(value))), commands.map(command => JSON.parse(new TextDecoder().decode(encodeDeoVrCommand(command).slice(4)))));
  assert.ok(!s.receiver.bytes().includes(Buffer.from('identifier'))); assert.ok(!s.receiver.bytes().includes(Buffer.from('example.test')));
  await eventually(() => new DeoVrFrameDecoder().push(s.receiver.bytes()).some(value => value === null), 'four-zero-byte idle heartbeat');
  assert.deepEqual(s.source.snapshot(), before);
  s.server.write(new Uint8Array(4)); await eventually(() => s.source.snapshot().path === null, 'peer reset'); assert.equal(s.source.snapshot().sceneUri, null);
  s.server.write(frame({resource:null,path:'legacy.mp4',identifier:'https://example.test/ignored',currentTime:1}));
  await eventually(() => s.source.snapshot().path === 'legacy.mp4', 'legacy fallback'); assert.equal(s.source.snapshot().sceneUri, null);
  await s.source.disconnect(); assert.equal(s.source.snapshot().closeConfirmed, true); assert.equal(s.environment.sockets[0].closed, true); assert.equal(s.environment.sockets[0].listenerCount(), 0); assert.equal(s.environment.timers.size, 0);
  await s.source.connect(s.endpoint); assert.equal(s.source.snapshot().generation, 2); assert.equal(s.source.snapshot().path, null); assert.equal(s.environment.sockets[1].sends.length, 0);
  await s.source.disconnect(); assert.ok(s.environment.sockets.every(socket => socket.closed && socket.listenerCount() === 0)); assert.equal(s.environment.timers.size, 0);
  t.diagnostic('Evidence layer: production HereSphere/NativeDeoVrTransport classes with Node-backed SDK facade and real OS loopback; no OHOS device or real player claimed.');
});
test('oversized HereSphere frame over real loopback fails closed and clears native socket listeners/timers', async t => {
  const s = await setup(t); s.server.write(frame(sample())); await eventually(() => s.source.snapshot().path === 'fixture.mp4', 'initial state');
  s.server.write(new Uint8Array([1,0,1,0])); await eventually(() => s.source.snapshot().closeConfirmed, 'oversized frame cleanup');
  assert.equal(s.source.snapshot().status, 'fault'); assert.equal(s.source.snapshot().diagnostic, 'frameTooLarge'); assert.equal(s.source.snapshot().path, null); assert.equal(s.source.snapshot().sceneUri, null);
  assert.equal(s.environment.sockets[0].closed, true); assert.equal(s.environment.sockets[0].listenerCount(), 0); assert.equal(s.environment.timers.size, 0); assert.equal(s.receiver.bytes().length, 0);
});
test('a real sent HereSphere seek with withheld native completion times out once, clears evidence and never replays', async t => {
  const s = await setup(t, { sendTimeoutMs: 40 }); s.server.write(frame(sample())); await eventually(() => s.source.snapshot().path === 'fixture.mp4', 'initial state');
  const hold = deferred(); s.environment.holdNextSendCompletion = hold;
  await assert.rejects(s.source.seek(10), error => error.code === 'sendTimeout'); await eventually(() => s.source.snapshot().closeConfirmed, 'send-timeout close');
  assert.equal(s.source.snapshot().status, 'fault'); assert.equal(s.source.snapshot().path, null); assert.equal(s.environment.sockets[0].sends.length, 1);
  assert.deepEqual(s.receiver.bytes(), Buffer.from(encodeDeoVrCommand({kind:'seek',value:10})));
  await s.source.connect(s.endpoint); hold.resolve(); await delay(10); assert.equal(s.source.snapshot().status, 'connected'); assert.equal(s.environment.sockets[1].sends.length, 0); assert.equal(s.source.snapshot().lastObservation, null);
  await s.source.disconnect(); assert.equal(s.environment.timers.size, 0); assert.ok(s.environment.sockets.every(socket => socket.closed && socket.listenerCount() === 0));
});
