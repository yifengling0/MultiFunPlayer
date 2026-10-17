import './helpers/socket-loopback-020-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { NodeLoopbackEnvironment, startReceiver, eventually, delay, deferred } from './helpers/socket-loopback-020-bridge.mjs';
const { NativeTransportFactory } = await import('../entry/src/main/ets/output/native/NativeTransportFactory.ets');
const { SocketDiagnostic } = await import('../entry/src/main/ets/output/diagnostics/SocketDiagnostic.ts');
const nativeLimits = { connectTimeoutMs: 300, writeTimeoutMs: 150, closeTimeoutMs: 200, maximumPayloadBytes: 128, maximumReceiveBytes: 128 };
function setup(options = {}) {
  const env = options.env ?? new NodeLoopbackEnvironment(), native = new NativeTransportFactory(env), ports = [];
  const factory = { create(request) { const ep = { host: request.host, port: request.port, family: 1, localPort: 0 }; const port = request.kind === 'tcp' ? native.createTcp(ep, nativeLimits) : native.createUdp(ep, nativeLimits); ports.push(port); options.alterPort?.(port); return port; }, canRelease: port => port.canRelease(), release: port => native.release(port) };
  const diagnostic = new SocketDiagnostic(factory, env, env, options.nonces ?? { nextNonce: () => randomBytes(16).toString('hex') }, 'nodeBridge', { timeoutMs: options.timeoutMs ?? 500, closeTimeoutMs: options.closeTimeoutMs ?? 300 });
  return { env, native, ports, diagnostic };
}
const request = (kind, port, extra = {}) => ({ kind, host: '127.0.0.1', port, dedicatedReceiverConfirmed: true, ...extra });
const assertClosed = s => { assert.equal(s.diagnostic.snapshot().closeConfirmed, true); assert.equal(s.env.timers.size, 0); assert.ok(s.env.sockets.every(x => x.closed && x.listenerCount() === 0)); };
for (const kind of ['tcp', 'udp']) {
  test(`${kind}: one-shot diagnostic exact echo uses actual production native classes and real sockets`, async t => {
    const receiver = await startReceiver(kind); t.after(() => receiver.close()); const s = setup(); t.after(() => s.diagnostic.dispose());
    assert.equal(s.env.sockets.length, 0); s.diagnostic.setForeground(true); assert.equal(s.env.sockets.length, 0);
    const first = await s.diagnostic.run(request(kind, receiver.port));
    assert.equal(first.phase, 'succeeded'); assert.equal(first.proof, 'exactEcho'); assert.equal(first.evidenceLayer, 'nodeBridge'); assert.equal(first.deviceExecutionAck, false);
    const line = receiver.bytes().toString('ascii'); assert.match(line, /^MFP_DIAG\/1 1 1 [0-9a-f]{32}\n$/);
    assert.equal(first.bytesSent, line.length); assert.equal(first.bytesReceived, line.length); assert.ok(first.latencyMs >= 0); assertClosed(s);
    assert.equal(JSON.stringify(first).includes(line.slice(-33).trim()), false, 'No nonce/payload in snapshot');
    const previous = s.diagnostic.snapshot(); previous.proof = 'none'; assert.equal(s.diagnostic.snapshot().proof, 'exactEcho');
    const second = await s.diagnostic.run(request(kind, receiver.port)); assert.equal(second.requestId, 2); assert.equal(second.connectionGeneration, 2); assert.equal(second.proof, 'exactEcho'); assert.equal(s.env.sockets.length, 2); assertClosed(s);
  });
  test(`${kind}: real peer accepts challenge but silence times out and never implies echo or ACK`, async t => {
    const receiver = await startReceiver(kind, { echo: false }); t.after(() => receiver.close()); const s = setup({ timeoutMs: 60 });
    const result = await s.diagnostic.run(request(kind, receiver.port)); assert.equal(result.phase, 'failed'); assert.equal(result.diagnostic, 'timeout'); assert.equal(result.proof, 'none'); assert.ok(result.bytesSent > 0); assert.equal(result.bytesReceived, 0);
    assert.equal(receiver.bytes().length, result.bytesSent); assert.equal(s.env.sockets[0].sends.length, 1); assertClosed(s);
  });
  test(`${kind}: cancellation/background is synchronous; delayed echo cannot resurrect a request or reopen on return`, async t => {
    const replies = []; const receiver = await startReceiver(kind, { reply: (bytes, reply) => replies.push(() => reply(bytes)) }); t.after(() => receiver.close()); const s = setup();
    const pending = s.diagnostic.run(request(kind, receiver.port)); await eventually(() => replies.length === 1, 'challenge received');
    s.diagnostic.setForeground(false); assert.equal(s.diagnostic.snapshot().phase, 'closing'); s.diagnostic.setForeground(true);
    const result = await pending; assert.equal(result.phase, 'cancelled'); assert.equal(result.proof, 'none'); assertClosed(s); await delay(10); assert.equal(s.env.sockets.length, 1);
    // Reuse needs a new explicit request and its own challenge. Captured old
    // generation events cannot count toward it even if a callback is queued.
    const next = s.diagnostic.run(request(kind, receiver.port)); await eventually(() => replies.length === 2, 'new challenge received'); replies[1]();
    const second = await next; assert.equal(second.requestId, 2); assert.equal(second.proof, 'exactEcho'); assertClosed(s);
  });
  test(`${kind}: stale nonce/request/generation echo, prefix + garbage, and short echo cannot produce proof`, async t => {
    for (const mutation of ['nonce', 'request', 'generation', 'extra', 'short']) {
      const receiver = await startReceiver(kind, { reply: (bytes, reply) => { let text = bytes.toString(); if (mutation === 'nonce') text = text.slice(0, -2) + (text.at(-2) === 'f' ? 'e' : 'f') + '\n'; else if (mutation === 'request') text = text.replace(' 1 1 ', ' 2 1 '); else if (mutation === 'generation') text = text.replace(' 1 1 ', ' 1 2 '); else if (mutation === 'extra') text += 'x'; else text = text.slice(0, -1); reply(Buffer.from(text)); } });
      try { const s = setup({ timeoutMs: 65 }); const result = await s.diagnostic.run(request(kind, receiver.port)); assert.equal(result.phase, 'failed', mutation); assert.equal(result.proof, 'none', mutation); assertClosed(s); } finally { await receiver.close(); }
    }
  });
}
test('TCP exact echo can be fragmented without requiring packet/chunk boundaries', async t => {
  const receiver = await startReceiver('tcp', { reply: (bytes, reply) => { reply(bytes.subarray(0, 5)); setTimeout(() => reply(bytes.subarray(5)), 5); } }); t.after(() => receiver.close());
  const s = setup(); assert.equal((await s.diagnostic.run(request('tcp', receiver.port))).proof, 'exactEcho'); assertClosed(s);
});
test('confirmation, foreground, invalid input, disposal and repeated nonce fail closed without allocating sockets', async () => {
  const s = setup(); assert.equal((await s.diagnostic.run(request('tcp', 12345, { dedicatedReceiverConfirmed: false }))).diagnostic, 'dedicatedReceiverConfirmationRequired');
  for (const bad of [{host:'http://127.0.0.1'}, {port:0}, {port:1.5}, {kind:'webSocket'}]) assert.equal((await s.diagnostic.run(request('tcp', 12345, bad))).diagnostic, 'invalidEndpoint');
  s.diagnostic.setForeground(false); assert.equal((await s.diagnostic.run(request('tcp', 12345))).diagnostic, 'background'); s.diagnostic.setForeground(true); await s.diagnostic.dispose();
  assert.equal((await s.diagnostic.run(request('tcp', 12345))).diagnostic, 'disposed'); assert.equal(s.env.sockets.length, 0);
  for (const nonce of ['', 'NOT_HEX', 'a'.repeat(31)]) { const invalid = setup({nonces:{nextNonce:()=>nonce}}); assert.equal((await invalid.diagnostic.run(request('tcp',12345))).diagnostic,'nonceUnavailable'); assert.equal(invalid.env.sockets.length,0); }
});
test('busy/draft edits cannot replace the owned endpoint; old callbacks cannot satisfy the next request', async t => {
  const receiver = await startReceiver('tcp', { echo:false }); t.after(() => receiver.close()); let oldListener;
  const s = setup({ alterPort(port) { const original = port.subscribe.bind(port); port.subscribe = fn => { oldListener = fn; return original(fn); }; } });
  const draft = request('tcp', receiver.port), first = s.diagnostic.run(draft); draft.host = '192.0.2.1'; draft.port = 9;
  await eventually(() => receiver.bytes().length > 0, 'captured endpoint receives'); const callback = oldListener;
  assert.equal((await s.diagnostic.run(request('udp', receiver.port))).diagnostic, 'busy'); assert.equal(s.env.sockets.length, 1);
  await s.diagnostic.cancel(); assert.equal((await first).phase, 'cancelled');
  const next = s.diagnostic.run(request('tcp', receiver.port)); await eventually(() => s.env.sockets[1]?.sends.length === 1, 'second write');
  callback({kind:'received',connectionGeneration:1,bytes:new Uint8Array(receiver.records[0])}); assert.equal(s.diagnostic.snapshot().proof, 'none'); assert.equal(s.diagnostic.snapshot().bytesReceived,0);
  await s.diagnostic.cancel(); await next; assertClosed(s);
});
test('cancel while success is awaiting close wins; unconfirmed close is bounded and permanently quarantines exact owner', async t => {
  const receiver = await startReceiver('tcp'); t.after(() => receiver.close());
  const gate = deferred(); const s = setup({ alterPort(port) { const close = port.close.bind(port); port.close = async (...args) => { await close(...args); await gate.promise; }; } });
  const pending = s.diagnostic.run(request('tcp',receiver.port)); await eventually(()=>s.diagnostic.snapshot().phase==='closing','success pending close');
  const cancelled=s.diagnostic.cancel(); gate.resolve(); assert.equal((await pending).phase,'cancelled'); assert.equal((await cancelled).proof,'none'); assertClosed(s);
  const blocked = setup({ closeTimeoutMs: 25, alterPort(port) { const close=port.close.bind(port); port.close=async(...args)=>{ await close(...args); await new Promise(()=>{}); }; } });
  const result = await blocked.diagnostic.run(request('tcp',receiver.port)); assert.equal(result.phase,'failed'); assert.equal(result.diagnostic,'closeUnconfirmed'); assert.equal(result.quarantined,true); assert.equal(result.closeConfirmed,false); assert.equal(result.proof,'none');
  assert.equal((await blocked.diagnostic.run(request('tcp',receiver.port))).diagnostic,'closeUnconfirmed'); assert.equal(blocked.env.sockets.length,1); assert.equal(blocked.env.timers.size,0);
});

test('bundled dedicated receiver handles production TCP and UDP diagnostics and never echoes motion/invalid requests', async t => {
  const { startDiagnosticReceiver, validChallenge } = await import('../tools/network-diagnostics/receiver.mjs');
  const logs=[]; const receiver=await startDiagnosticReceiver({host:'127.0.0.1',port:0,protocol:'both',lifetimeMs:5000,log:row=>logs.push(row)}); t.after(()=>receiver.close());
  assert.equal(validChallenge(Buffer.from('L05000I10\n')),false); assert.equal(validChallenge(Buffer.from('MFP_DIAG/1 1 1 '+ 'a'.repeat(32)+'\nextra')),false);
  await assert.rejects(startDiagnosticReceiver({host:'0.0.0.0'}), /--allow-lan/);
  for(const kind of ['tcp','udp']) { const s=setup(); const result=await s.diagnostic.run(request(kind,receiver.port)); assert.equal(result.proof,'exactEcho'); assertClosed(s); }
  assert.deepEqual(receiver.stats(),{accepted:2,rejected:0,receivedBytes:96,closed:false});
  const dgram=await import('node:dgram'); const sender=dgram.createSocket('udp4'); let replies=0; sender.on('message',()=>replies++); await new Promise(resolve=>sender.bind(0,'127.0.0.1',resolve));
  await new Promise((resolve,reject)=>sender.send(Buffer.from('L05000I10\n'),receiver.port,'127.0.0.1',e=>e?reject(e):resolve()));
  await eventually(()=>receiver.stats().rejected===1,'reject invalid datagram'); await delay(10); assert.equal(replies,0); sender.close();
  await receiver.close(); assert.equal(receiver.stats().closed,true); assert.ok(logs.every(row=>!JSON.stringify(row).includes('MFP_DIAG/1'))); assert.equal(logs[0].scope,'loopbackOnly');
});

test('nonce generator failure/repetition never creates a new socket or inherits earlier proof', async t => {
  const receiver=await startReceiver('tcp'); t.after(()=>receiver.close()); const s=setup({nonces:{nextNonce:()=> 'a'.repeat(32)}});
  assert.equal((await s.diagnostic.run(request('tcp',receiver.port))).proof,'exactEcho');
  const denied=await s.diagnostic.run(request('tcp',receiver.port)); assert.equal(denied.diagnostic,'nonceUnavailable'); assert.equal(denied.proof,'none'); assert.equal(denied.bytesReceived,0); assert.equal(s.env.sockets.length,1); assertClosed(s);
  const unavailable=setup({nonces:{nextNonce(){throw new Error('secret native detail');}}}); assert.equal((await unavailable.diagnostic.run(request('tcp',receiver.port))).diagnostic,'nonceUnavailable'); assert.equal(unavailable.env.sockets.length,0);
});
test('received echo without successful local write receipt cannot grant proof or replay', async t => {
  const receiver=await startReceiver('tcp'); t.after(()=>receiver.close()); const s=setup({timeoutMs:65}), hold=deferred(); s.env.holdNextSendCompletion=hold;
  const result=await s.diagnostic.run(request('tcp',receiver.port)); assert.equal(result.proof,'none'); assert.equal(result.bytesSent,0); assert.ok(result.bytesReceived>0); assert.equal(result.diagnostic,'timeout'); assertClosed(s);
  hold.resolve(); await delay(10); assert.equal(s.diagnostic.snapshot().proof,'none'); assert.equal(s.env.sockets[0].sends.length,1);
});

test('UDP exact challenge from an alien source port is ignored by the production peer filter', async t => {
  let legitimateReply; const receiver=await startReceiver('udp',{reply:(bytes,reply)=>{legitimateReply=()=>reply(bytes);}}); t.after(()=>receiver.close()); const s=setup();
  const pending=s.diagnostic.run(request('udp',receiver.port)); await eventually(()=>legitimateReply!==undefined,'request at configured receiver');
  const dgram=await import('node:dgram'); const alien=dgram.createSocket('udp4'); await new Promise(resolve=>alien.bind(0,'127.0.0.1',resolve));
  await new Promise((resolve,reject)=>alien.send(receiver.records[0],s.env.sockets[0].native.address().port,'127.0.0.1',e=>e?reject(e):resolve())); await delay(10);
  assert.equal(s.diagnostic.snapshot().bytesReceived,0); assert.equal(s.diagnostic.snapshot().proof,'none'); alien.close(); legitimateReply(); assert.equal((await pending).proof,'exactEcho'); assertClosed(s);
});
test('diagnostic cancel during DNS cannot connect after late resolution; explicit new run works', async t => {
  const receiver=await startReceiver('tcp'); t.after(()=>receiver.close()); const s=setup(), held=deferred(); s.env.resolveHold=held;
  const pending=s.diagnostic.run(request('tcp',receiver.port)); const cancellation=s.diagnostic.cancel(); assert.equal(s.diagnostic.snapshot().phase,'closing');
  assert.equal((await pending).phase,'cancelled'); await cancellation; held.resolve(); s.env.resolveHold=null; await delay(10); assert.equal(receiver.accepted,0); assert.equal(receiver.bytes().length,0);
  assert.equal((await s.diagnostic.run(request('tcp',receiver.port))).proof,'exactEcho'); assertClosed(s);
});
