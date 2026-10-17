import './helpers/socket-loopback-020-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { NodeLoopbackEnvironment, startReceiver, eventually, delay, deferred } from './helpers/socket-loopback-020-bridge.mjs';
const { NativeTransportFactory } = await import('../entry/src/main/ets/output/native/NativeTransportFactory.ets');
const { OutputCoordinator } = await import('../entry/src/main/ets/output/OutputCoordinator.ts');
const limits = { connectTimeoutMs: 400, writeTimeoutMs: 150, closeTimeoutMs: 400, maximumPayloadBytes: 1024, maximumReceiveBytes: 1024 };
const policy = { maximumFrameAgeMs: 1000, maximumClockAgeMs: 1000, maximumEventAgeMs: 1000, maximumFixedElapsedMs: 1000, writeTimeoutMs: 300, maximumPolledQueueLength: 4, allowZeroInterval: true };
const config = kind => ({ targetId: 'loopback-only', kind, protocolProfile: { precision: 4, revision: 1, axisOrder: ['L0'], maximumDurationMs: 10000, maximumPayloadBytes: 1024 }, axisRanges: [{ axisId: 'L0', minimum: 0, maximum: 1, enabled: true }], updateContext: { kind: 'polled' }, autoConnectPolicy: 'automaticRequested', allowPausedAutoHome: false, allowPausedMotion: false });
function sourceFrame(env, sequence, value = .75) {
  const stamp = env.nowMs();
  return { frame: { sequence, epoch: 1, profileRevision: 1, monotonicMs: stamp, mediaPositionMs: sequence * 125,
    axisStates: [{ axisName: 'L0', value }], events: [{ eventId: sequence, epoch: 1, sourceFrameSequence: sequence, axisName: 'L0', kind: 'script', targetValue: value, durationSeconds: .125, from: null, to: null, speedLimitUnitsPerSecond: null }] },
    authorization: { epoch: 1, sourceFrameSequence: sequence, sourceConfigurationRevision: 0, updateKind: 'polled', authorizedAxes: ['L0'], intents: ['activePlayback'], clockKind: 'media', observedMonotonicMs: stamp },
    mediaState: 'playing', foreground: true, faulted: false, availability: 'ready', sourceIdentity: 'loopback-fixture', sourceGeneration: 1 };
}
for (const kind of ['tcp', 'udp']) {
  test(`${kind}: production Coordinator → Session → TCode → NativeTransport → real OS loopback → production receive`, async t => {
    const receiver = await startReceiver(kind); t.after(() => receiver.close());
    const env = new NodeLoopbackEnvironment(), native = new NativeTransportFactory(env), ports = [], events = [];
    const source = { value: sourceFrame(env, 1), dispatchSource() { return this.value; } };
    const factory = { inspect: kind => native.inspect(kind), create(cfg, endpoint) { const p = kind === 'tcp' ? native.createTcp(endpoint, limits) : native.createUdp({ ...endpoint, localPort: 0 }, limits); p.subscribe(e => events.push(e)); ports.push(p); return p; } };
    const owner = new OutputCoordinator(factory, source, policy, env, env); t.after(() => owner.dispose());
    assert.equal(env.sockets.length, 0); assert.equal(owner.arm(), false); assert.equal(owner.refresh(), 'ignored');
    assert.equal(await owner.connect(config(kind), { host: '127.0.0.1', port: receiver.port, family: 1 }), true);
    assert.equal(owner.status().simulationOnly, false); assert.equal(owner.status().armed, false); assert.equal(owner.refresh(), 'ignored');
    await delay(15); assert.equal(receiver.bytes().length, 0); assert.equal(env.sockets[0].sends.length, 0);
    source.value = sourceFrame(env, 2); assert.equal(owner.arm(), true); assert.equal(owner.refresh(), 'accepted');
    await eventually(() => owner.status().completedLocalWrites === 1 && events.some(e => e.kind === 'received'), 'production write and receive');
    const first = 'L07499I125\n'; assert.equal(receiver.bytes().toString('ascii'), first); assert.equal(env.sockets[0].sends.length, 1);
    assert.equal(Buffer.concat(events.filter(e => e.kind === 'received').map(e => Buffer.from(e.bytes))).toString('ascii'), first);
    assert.equal(owner.status().locallyAcceptedBytes, Buffer.byteLength(first)); assert.equal(ports[0].status().remoteAcknowledgement, false);
    // Remove provenance while still foreground/playing; no preview-value backdoor.
    source.value = { ...sourceFrame(env, 3, .2), authorization: null }; assert.equal(owner.refresh(), 'ignored'); assert.equal(owner.status().armed, false);
    source.value = sourceFrame(env, 4, .25); assert.equal(owner.refresh(), 'ignored'); await delay(15); assert.equal(env.sockets[0].sends.length, 1);
    assert.equal(owner.arm(), true); assert.equal(owner.refresh(), 'accepted');
    await eventually(() => owner.status().completedLocalWrites === 2 && receiver.bytes().length === 22, 'second exact payload');
    assert.equal(receiver.bytes().toString('ascii'), first + 'L02500I125\n');
    if (kind === 'udp') assert.deepEqual(receiver.records.map(x => x.toString('ascii')), [first, 'L02500I125\n']);
    owner.setForeground(false); assert.equal(owner.status().armed, false); owner.setForeground(true);
    await eventually(() => owner.status().closeConfirmed, 'confirmed native close');
    assert.equal(env.sockets[0].closed, true); assert.equal(env.sockets[0].listenerCount(), 0); assert.equal(env.sockets[0].sends.length, 2);
    source.value = sourceFrame(env, 5); assert.equal(owner.refresh(), 'ignored'); assert.equal(owner.arm(), false); assert.equal(env.sockets.length, 1);
    // Explicit reconnect creates no output until another explicit arm + fresh frame.
    assert.equal(await owner.connect(config(kind), { host: '127.0.0.1', port: receiver.port, family: 1 }), true);
    assert.equal(owner.status().armed, false); assert.equal(env.sockets[1].sends.length, 0); await owner.dispose();
    assert.equal(owner.status().closeConfirmed, true); assert.ok(env.sockets.every(s => s.closed && s.listenerCount() === 0)); assert.equal(env.timers.size, 0);
    t.diagnostic(JSON.stringify({ evidenceLayer: 'nodeBridge', kind, exactAscii: receiver.bytes().toString('ascii'), receivedBytes: 22, localWrites: 2, gateRevoked: true, closeConfirmed: true, deviceExecutionAck: false }));
  });
  test(`${kind}: real send with withheld SDK completion times out once, closes and can explicitly reuse adapter`, async t => {
    const receiver = await startReceiver(kind, { echo: false }); t.after(() => receiver.close());
    const env = new NodeLoopbackEnvironment(), factory = new NativeTransportFactory(env), endpoint = { host: '127.0.0.1', port: receiver.port, family: 1, localPort: 0 };
    const port = kind === 'tcp' ? factory.createTcp(endpoint, { ...limits, writeTimeoutMs: 35 }) : factory.createUdp(endpoint, { ...limits, writeTimeoutMs: 35 });
    const cfg = config(kind), bytes = new TextEncoder().encode('MFP_LOOPBACK_TEST\n'), hold = deferred();
    await port.open(cfg, 1); env.holdNextSendCompletion = hold;
    await assert.rejects(port.write({ bytes, epoch: 0, profileRevision: 1, connectionGeneration: 1, deadlineMonotonicMs: env.nowMs() + 100 }), e => e.code === 'writeTimeout');
    await eventually(() => port.status().closeConfirmed && receiver.bytes().length === bytes.length, 'timeout close');
    assert.equal(env.sockets[0].sends.length, 1); assert.equal(port.status().state, 'fault');
    await port.open(cfg, 2); hold.resolve(); await delay(10); assert.equal(env.sockets[1].sends.length, 0); assert.equal(port.status().state, 'ready');
    await port.close('test done', 2); factory.release(port); assert.equal(env.timers.size, 0);
  });
  test(`${kind}: cancel during resolver ownership prevents any delayed native connect/bind, then explicit reuse works`, async t => {
    const receiver = await startReceiver(kind); t.after(() => receiver.close()); const env = new NodeLoopbackEnvironment(), factory = new NativeTransportFactory(env);
    const endpoint = { host: '127.0.0.1', port: receiver.port, family: 1, localPort: 0 }, port = kind === 'tcp' ? factory.createTcp(endpoint, limits) : factory.createUdp(endpoint, limits);
    env.resolveHold = deferred(); const old = env.resolveHold; const opening = port.open(config(kind), 1); const rejection = assert.rejects(opening, e => e.code === 'cancelled');
    await port.close('cancel', 1); await rejection; old.resolve(); env.resolveHold = null; await delay(10);
    assert.equal(receiver.bytes().length, 0); assert.equal(receiver.accepted, 0); assert.equal(env.sockets[0].sends.length, 0);
    await port.open(config(kind), 2); await port.close('done', 2); factory.release(port); assert.equal(env.timers.size, 0);
  });
}
