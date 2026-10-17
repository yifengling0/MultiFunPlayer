import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { DeoVrError, validateDeoVrEndpoint } from '../entry/src/main/ets/media/deovr/DeoVrTypes.ts';

// Run the production ArkTS with injected in-memory SDK objects only. No net,
// http, real DNS, player endpoint or physical-device/output connection is used.
const source = readFileSync(new URL('../entry/src/main/ets/media/deovr/NativeDeoVrTransport.ets', import.meta.url), 'utf8');
const js = stripTypeScriptTypes(source.replace(/^import [\s\S]*?;\n/gm, '').replace(/\bexport /g, ''));
const api = new Function('DeoVrError', 'validateDeoVrEndpoint', `${js}\nreturn {NativeDeoVrTransportFactory,defaultNativeDeoVrLimits};`)(DeoVrError, validateDeoVrEndpoint);
const coreSource = ['DeoVrProtocol', 'DeoVrMediaSource'].map(name => readFileSync(new URL(`../entry/src/main/ets/media/deovr/${name}.ts`, import.meta.url), 'utf8')
  .replace(/^import [\s\S]*?;\n/gm, '').replace(/\bexport /g, '')).join('\n');
const core = new Function('DeoVrError', 'validateDeoVrEndpoint', `${stripTypeScriptTypes(coreSource)}\nreturn {DeoVrMediaSource,frameDeoVrPayload};`)(DeoVrError, validateDeoVrEndpoint);
const settle = async () => { for (let n = 0; n < 40; n++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const business = (code = 201) => Object.assign(new Error('https://username:SECRET@private.example/path?token=SECRET'), { code });
const endpoint = () => ({ host: 'player.example', port: 23554, family: 1 });
const limits = () => ({ connectTimeoutMs: 100, closeTimeoutMs: 30, maximumSendBytes: 256, maximumReceiveBytes: 128 });
const code = expected => error => error.code === expected;

class MockSocket {
  listeners = new Map(); calls = []; plans = new Map(); offFailures = new Set(); onFailure = null;
  plan(method, value) { if (!this.plans.has(method)) this.plans.set(method, []); this.plans.get(method).push(value); }
  invoke(method, arg) {
    this.calls.push([method, arg]); const value = this.plans.get(method)?.shift();
    if (value instanceof Error) throw value;
    if (typeof value === 'function') return value();
    return Promise.resolve(value);
  }
  on(event, fn) {
    this.calls.push(['on', event]); if (this.onFailure === event) throw business();
    if (!this.listeners.has(event)) this.listeners.set(event, new Set()); this.listeners.get(event).add(fn);
  }
  off(event, fn) { this.calls.push(['off', event]); if (this.offFailures.has(event)) throw business(); this.listeners.get(event)?.delete(fn); }
  emit(event, ...args) { for (const fn of [...(this.listeners.get(event) ?? [])]) fn(...args); }
  connect(arg) { return this.invoke('connect', arg).then(value => { this.emit('connect'); return value; }); }
  setExtraOptions(arg) { return this.invoke('extra', arg); }
  send(arg) { return this.invoke('send', arg); }
  close() { return this.invoke('close'); }
  count(method) { return this.calls.filter(([name]) => name === method).length; }
  listenerCount() { return [...this.listeners.values()].reduce((sum, values) => sum + values.size, 0); }
}
class Environment {
  now = 0; next = 1; tasks = new Map(); calls = []; sockets = []; plans = []; unsupported = new Set(); resolvePlan = null;
  nowMs() { return this.now; }
  scheduleAt(at, callback) { const id = this.next++; this.tasks.set(id, { at, callback }); return id; }
  cancel(id) { this.tasks.delete(id); }
  supports(capability) { this.calls.push(['supports', capability]); return !this.unsupported.has(capability); }
  resolveHost(host) {
    this.calls.push(['resolveHost', host]);
    return this.resolvePlan ?? Promise.resolve([{ address: '192.0.2.10', family: 1 }, { address: '2001:db8::10', family: 2 }]);
  }
  createTcp() { const socket = new MockSocket(); this.calls.push(['createTcp']); this.plans.shift()?.(socket); this.sockets.push(socket); return socket; }
  async advanceTo(target) {
    for (;;) {
      const next = [...this.tasks].filter(([, task]) => task.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      this.now = next[1].at; this.tasks.delete(next[0]); next[1].callback(); await settle();
    }
    this.now = target; await settle();
  }
}
function setup(custom = {}) {
  const env = custom.env ?? new Environment(), factory = new api.NativeDeoVrTransportFactory(env, custom.limits ?? limits());
  const events = [], sink = custom.sink ?? { received: bytes => events.push(['received', bytes]), error: () => events.push(['error']), closed: () => events.push(['closed']) };
  const port = factory.create(custom.endpoint ?? endpoint(), 1, sink);
  return { env, factory, events, sink, port };
}
async function opened(custom = {}) { const s = setup(custom); await s.port.connect(); return s; }
const incoming = bytes => ({ message: bytes.buffer, remoteInfo: { address: '192.0.2.10', port: 23554 } });

test('native creation/inspection/closing unused adapter perform no DNS/socket/send', async () => {
  const s = setup(); assert.equal(s.port.status().state, 'idle'); assert.equal(s.port.status().remoteAcknowledgement, false);
  assert.equal(s.factory.inspect().available, true); assert.equal(s.factory.inspect().automaticConnection, false);
  assert.equal(s.env.calls.filter(([name]) => !['supports'].includes(name)).length, 0);
  await s.port.close(); assert.equal(s.port.canRelease(), true); assert.equal(s.env.sockets.length, 0); assert.equal(s.env.tasks.size, 0);
});
test('native explicit connect resolves exactly configured host/family/port and sends nothing', async () => {
  const s = await opened(); const socket = s.env.sockets[0];
  assert.deepEqual(s.env.calls.filter(([name]) => name === 'resolveHost'), [['resolveHost', 'player.example']]);
  assert.deepEqual(socket.calls.find(([name]) => name === 'connect')[1], { address: { address: '192.0.2.10', family: 1, port: 23554 }, timeout: 100 });
  assert.deepEqual(socket.calls.find(([name]) => name === 'extra')[1], { TCPNoDelay: true });
  assert.equal(socket.count('send'), 0); assert.equal(s.port.status().state, 'connected');
  await s.port.close(); assert.equal(socket.listenerCount(), 0); assert.equal(s.env.tasks.size, 0);
});
test('native copies endpoint and limits before later caller mutations', async () => {
  const e = endpoint(), l = limits(), s = setup({ endpoint: e, limits: l }); e.host = 'changed.example'; e.port = 80; e.family = 2; l.connectTimeoutMs = 2;
  await s.port.connect(); assert.equal(s.env.sockets[0].calls.find(([name]) => name === 'connect')[1].timeout, 100);
  assert.equal(s.env.calls.find(([name]) => name === 'resolveHost')[1], 'player.example'); await s.port.close();
});
test('native IPv6 resolution preserves selected family; missing family defaults to IPv4 only', async () => {
  const s = await opened({ endpoint: { host: '2001:db8::20', port: 1234, family: 2 } });
  assert.deepEqual(s.env.sockets[0].calls.find(([name]) => name === 'connect')[1].address, { address: '2001:db8::10', family: 2, port: 1234 }); await s.port.close();
  const env = new Environment(); env.resolvePlan = Promise.resolve([{ address: '192.0.2.11' }]);
  const a = await opened({ env }); assert.equal(env.sockets[0].count('connect'), 1); await a.port.close();
});
test('native missing family/DNS errors never fall back to another address or leak SDK secrets', async () => {
  for (const mode of ['missing', 'failed']) {
    const env = new Environment(), wait = deferred();
    env.resolvePlan = mode === 'missing' ? Promise.resolve([{ address: '2001:db8::10', family: 2 }]) : wait.promise;
    const s = setup({ env }), pending = s.port.connect(), rejected = assert.rejects(pending);
    if (mode === 'failed') wait.reject(business()); await rejected; await settle();
    assert.equal(env.sockets[0].count('connect'), 0); assert.equal(env.sockets[0].count('close'), 1);
    assert.ok(!JSON.stringify([s.events, s.port.status()]).includes('SECRET')); assert.equal(s.port.canRelease(), true);
  }
});
test('native unsupported SysCap rejects before DNS or socket construction', async () => {
  for (const cap of ['SystemCapability.Communication.NetStack', 'SystemCapability.Communication.NetManager.Core']) {
    const env = new Environment(); env.unsupported.add(cap); const s = setup({ env });
    assert.equal(s.factory.inspect().available, false); await assert.rejects(s.port.connect(), code('nativeUnsupportedSystemCapability')); await settle();
    assert.equal(env.sockets.length, 0); assert.equal(env.calls.some(([name]) => name === 'resolveHost'), false);
  }
});
test('native invalid endpoints, limits and generations are rejected without I/O', () => {
  for (const e of [{ ...endpoint(), host: 'https://player.example' }, { ...endpoint(), host: 'user:SECRET@host' }, { ...endpoint(), port: 0 }, { ...endpoint(), family: 3 }]) {
    const env = new Environment(); assert.throws(() => setup({ env, endpoint: e })); assert.equal(env.sockets.length, 0);
  }
  for (const value of [0, -1, NaN, Infinity, 2147483648]) assert.throws(() => setup({ limits: { ...limits(), maximumSendBytes: value } }), code('nativeInvalidLimits'));
  for (const generation of [-1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    const env = new Environment(), factory = new api.NativeDeoVrTransportFactory(env); assert.throws(() => factory.create(endpoint(), generation, {}), code('nativeInvalidGeneration'));
  }
});
test('native arbitrary binary fragments/coalesced bytes are copied verbatim without UTF8 decoding', async () => {
  const s = await opened(), socket = s.env.sockets[0];
  for (const values of [[0], [0xff, 0x80, 0], [4, 0, 0, 0, 0xc3, 0xa9, 0, 255]]) {
    const bytes = new Uint8Array(values); socket.emit('message', incoming(bytes)); bytes.fill(9);
  }
  assert.deepEqual(s.events.map(event => [...event[1]]), [[0], [255, 128, 0], [4, 0, 0, 0, 195, 169, 0, 255]]);
  socket.emit('message', incoming(new Uint8Array())); assert.equal(s.events.length, 3); await s.port.close();
});
test('native bounds each receive and permanently retires parser delivery on oversized chunk', async () => {
  const s = await opened(), socket = s.env.sockets[0]; socket.emit('message', incoming(new Uint8Array(129))); await settle();
  assert.deepEqual(s.events, [['error']]); assert.equal(s.port.status().diagnostic, 'nativeInvalidReceiveSize'); assert.equal(socket.count('close'), 1);
  socket.emit('message', incoming(new Uint8Array([1]))); assert.equal(s.events.length, 1); assert.equal(s.port.canRelease(), true);
});
test('native early bytes reach core at actual receipt time without claiming connection readiness', async () => {
  const env = new Environment(), connected = deferred(), options = deferred(); env.plans.push(socket => { socket.plan('connect', connected.promise); socket.plan('extra', options.promise); });
  const s = setup({ env }), pending = s.port.connect(); await settle(); const socket = env.sockets[0], bytes = new Uint8Array([0, 255]);
  socket.emit('message', incoming(bytes)); bytes.fill(8); assert.deepEqual([...s.events[0][1]], [0, 255]);
  assert.equal(s.port.status().state, 'connecting'); await assert.rejects(s.port.send(new Uint8Array([1])), code('nativeNotConnected'));
  connected.resolve(); await settle(); socket.emit('message', incoming(new Uint8Array([10, 20])));
  assert.equal(s.events.length, 2); options.resolve(); await pending; assert.deepEqual(s.events.map(event => [...event[1]]), [[0, 255], [10, 20]]); await s.port.close();
});
test('native opening receives remain bounded before connect completes', async () => {
  const env = new Environment(), wait = deferred(); env.plans.push(socket => socket.plan('connect', wait.promise)); const s = setup({ env }), pending = s.port.connect();
  const rejected = assert.rejects(pending, code('nativeInvalidReceiveSize')); await settle();
  env.sockets[0].emit('message', incoming(new Uint8Array(129)));
  await rejected; wait.resolve(); await settle(); assert.deepEqual(s.events, [['error']]); assert.equal(s.port.canRelease(), true);
});
test('native send snapshots exact subarray bytes and reports no synthetic acknowledgment', async () => {
  const s = await opened(), socket = s.env.sockets[0], wait = deferred(); socket.plan('send', wait.promise);
  const backing = new Uint8Array([9, 0, 255, 3, 8]), pending = s.port.send(backing.subarray(1, 4)); backing.fill(6);
  assert.deepEqual([...new Uint8Array(socket.calls.find(([name]) => name === 'send')[1].data)], [0, 255, 3]);
  wait.resolve(); assert.equal(await pending, undefined); assert.equal(s.events.length, 0); await s.port.close();
});
test('native empty/oversized/not-connected/concurrent sends do not touch native send', async () => {
  const s = setup(); await assert.rejects(s.port.send(new Uint8Array([1])), code('nativeNotConnected')); await s.port.connect(); const socket = s.env.sockets[0];
  for (const size of [0, 257]) await assert.rejects(s.port.send(new Uint8Array(size)), code('nativeInvalidSendSize'));
  const wait = deferred(); socket.plan('send', wait.promise); const pending = s.port.send(new Uint8Array([1]));
  await assert.rejects(s.port.send(new Uint8Array([2])), code('nativeConcurrentSend')); assert.equal(socket.count('send'), 1); wait.resolve(); await pending; await s.port.close();
});
test('native unknown send failure is sanitized, closes once and never retries bytes', async () => {
  for (const failure of [business(), 2]) {
    const s = await opened(), socket = s.env.sockets[0]; socket.plan('send', failure); await assert.rejects(s.port.send(new Uint8Array([1]))); await settle();
    await assert.rejects(s.port.send(new Uint8Array([1])), code('nativeNotConnected')); assert.equal(socket.count('send'), 1); assert.equal(socket.count('close'), 1);
    assert.deepEqual(s.events, [['error']]); assert.ok(!JSON.stringify(s.port.status()).includes('SECRET'));
  }
});
test('native close cancels pending send immediately; stale send completion cannot affect fresh generation', async () => {
  const s = await opened(), old = s.env.sockets[0], wait = deferred(); old.plan('send', wait.promise);
  const pending = s.port.send(new Uint8Array([1])), rejected = assert.rejects(pending, code('nativeCancelled')); await s.port.close(); await rejected;
  const next = s.factory.create(endpoint(), 2, s.sink); await next.connect(); wait.resolve(); await settle();
  assert.equal(next.status().state, 'connected'); assert.equal(s.env.sockets[1].count('send'), 0); assert.equal(s.events.length, 0); await next.close();
});
test('native detach synchronously gates callbacks/send/connect without discarding cleanup ownership', async () => {
  const s = await opened(), socket = s.env.sockets[0], received = [...socket.listeners.get('message')][0], error = [...socket.listeners.get('error')][0];
  s.port.detach(); received(incoming(new Uint8Array([1]))); error(business()); await assert.rejects(s.port.send(new Uint8Array([1])), code('nativeNotConnected'));
  await assert.rejects(s.port.connect(), code('nativeConnectAlreadyUsed')); assert.equal(s.events.length, 0); assert.equal(s.port.canRelease(), false); await s.port.close(); assert.equal(s.port.canRelease(), true);
});
test('native stale receive/error/peer-close callbacks and repeated old close never target fresh socket', async () => {
  const s = await opened(), old = s.env.sockets[0], received = [...old.listeners.get('message')][0], error = [...old.listeners.get('error')][0], closed = [...old.listeners.get('close')][0];
  await s.port.close(); const next = s.factory.create(endpoint(), 2, s.sink); await next.connect(); received(incoming(new Uint8Array([1]))); error(business()); closed(); await s.port.close();
  assert.equal(next.status().state, 'connected'); assert.equal(s.env.sockets[1].count('close'), 0); assert.equal(s.events.length, 0); await next.close();
});
test('native close while DNS pending is safe; late DNS can never issue a native connect', async () => {
  const env = new Environment(), wait = deferred(); env.resolvePlan = wait.promise; const s = setup({ env }), pending = s.port.connect();
  const rejected = assert.rejects(pending, code('nativeCancelled')); await s.port.close(); await rejected; assert.equal(s.port.canRelease(), true);
  env.resolvePlan = null; const next = s.factory.create(endpoint(), 2, s.sink); await next.connect(); wait.resolve([{ address: '192.0.2.100', family: 1 }]); await settle();
  assert.equal(env.sockets[0].count('connect'), 0); assert.equal(next.status().state, 'connected'); await next.close();
});
test('native close while connect pending waits for settlement and closes late-open original handle twice', async () => {
  const env = new Environment(), wait = deferred(); env.plans.push(socket => socket.plan('connect', wait.promise)); const s = setup({ env }), pending = s.port.connect();
  const rejected = assert.rejects(pending, code('nativeCancelled')); await settle(); const closing = s.port.close(); let done = false; closing.then(() => { done = true; }); await settle();
  assert.equal(done, false); assert.throws(() => s.factory.create(endpoint(), 2, s.sink), code('nativePriorCloseUnconfirmed'));
  wait.resolve(); await closing; await rejected; assert.equal(env.sockets[0].count('close'), 2); assert.equal(env.sockets[0].count('extra'), 0); assert.equal(s.port.canRelease(), true);
  const next = s.factory.create(endpoint(), 2, s.sink); await next.connect(); await next.close();
});
test('native rejected pending connect allows release only after existing close succeeds', async () => {
  const env = new Environment(), wait = deferred(); env.plans.push(socket => socket.plan('connect', wait.promise)); const s = setup({ env }), pending = s.port.connect();
  const rejected = assert.rejects(pending, code('nativeCancelled')); await settle(); const closing = s.port.close(); wait.reject(business()); await closing; await rejected;
  assert.equal(env.sockets[0].count('close'), 1); assert.equal(s.port.canRelease(), true); assert.equal(s.events.length, 0);
});
test('native pending connect close timeout quarantines forever even after late connection cleanup succeeds', async () => {
  const env = new Environment(), wait = deferred(); env.plans.push(socket => socket.plan('connect', wait.promise)); const s = setup({ env }), pending = s.port.connect();
  const rejected = assert.rejects(pending, code('nativeCancelled')); await settle(); const closing = s.port.close(), failed = assert.rejects(closing, code('nativeCloseTimeout'));
  await env.advanceTo(30); await failed; await rejected; assert.equal(s.port.status().quarantined, true); assert.equal(s.factory.inspect().available, false);
  wait.resolve(); await settle(); assert.ok(env.sockets[0].count('close') >= 2); assert.equal(s.port.canRelease(), false);
  assert.throws(() => s.factory.create(endpoint(), 2, s.sink), code('nativePriorCloseUnconfirmed')); await assert.rejects(s.port.close(), code('nativeCloseUnconfirmed')); assert.equal(env.tasks.size, 0);
});
test('native failed/timed-out close cannot be made successful by retrying or by late completion', async () => {
  for (const mode of ['failure', 'timeout', 'unexpected']) {
    const s = await opened(), socket = s.env.sockets[0], wait = deferred(); socket.plan('close', mode === 'failure' ? business() : mode === 'unexpected' ? true : wait.promise);
    const closing = s.port.close(), rejected = assert.rejects(closing); if (mode === 'timeout') await s.env.advanceTo(30); await rejected;
    wait.resolve(); await settle(); assert.equal(s.port.canRelease(), false); assert.equal(s.port.status().quarantined, true);
    await assert.rejects(s.port.close(), code('nativeCloseUnconfirmed')); assert.throws(() => s.factory.create(endpoint(), 2, s.sink), code('nativePriorCloseUnconfirmed'));
    assert.equal(socket.count('close'), 1); assert.ok(!JSON.stringify(s.port.status()).includes('SECRET'));
  }
});
test('native close completion past monotonic deadline faults even before timer delivery', async () => {
  const s = await opened(), wait = deferred(); s.env.sockets[0].plan('close', wait.promise); const closing = s.port.close(), rejected = assert.rejects(closing, code('nativeCloseTimeout'));
  s.env.now = 31; wait.resolve(); await rejected; assert.equal(s.port.status().quarantined, true); assert.equal(s.env.tasks.size, 0);
});
test('native close rejects backward monotonic time instead of falsely confirming bounded cleanup', async () => {
  const s = await opened(), wait = deferred(); s.env.now = 10; s.env.sockets[0].plan('close', wait.promise);
  const closing = s.port.close(), rejected = assert.rejects(closing, code('nativeInvalidMonotonicClock')); s.env.now = 5; wait.resolve(); await rejected;
  assert.equal(s.port.status().quarantined, true); assert.equal(s.env.tasks.size, 0);
});
test('native broken clock/scheduler still attempts native close and permanently quarantines', async () => {
  for (const mode of ['clock', 'scheduler']) {
    const s = await opened(); if (mode === 'clock') s.env.now = NaN; else s.env.scheduleAt = () => { throw business(); };
    await assert.rejects(s.port.close()); await settle(); assert.equal(s.env.sockets[0].count('close'), 1);
    assert.equal(s.port.status().quarantined, true); assert.equal(s.port.canRelease(), false);
    assert.throws(() => s.factory.create(endpoint(), 2, s.sink), code('nativePriorCloseUnconfirmed'));
  }
});
test('native timer cancellation failure cannot turn a confirmed close into an unhandled leak', async () => {
  const s = await opened(); s.env.cancel = () => { throw business(); }; await s.port.close(); assert.equal(s.port.canRelease(), true);
  await s.env.advanceTo(30); assert.equal(s.port.canRelease(), true); assert.equal(s.port.status().quarantined, false);
});
test('native captured late connect after confirmed close quarantines factory and retires any newer socket', async () => {
  const s = await opened(), old = s.env.sockets[0], late = [...old.listeners.get('connect')][0]; await s.port.close();
  const next = s.factory.create(endpoint(), 2, s.sink); await next.connect(); late(); await settle();
  assert.equal(s.port.status().quarantined, true); assert.equal(next.status().state, 'fault'); assert.equal(s.env.sockets[1].count('close'), 1);
  assert.deepEqual(s.events, [['error']]); assert.throws(() => s.factory.create(endpoint(), 3, s.sink), code('nativePriorCloseUnconfirmed'));
  assert.equal(old.count('close'), 2); await assert.rejects(s.port.close(), code('nativeCloseUnconfirmed'));
});
test('native early connect event followed by close failure and connect resolution gets late cleanup', async () => {
  const env = new Environment(), wait = deferred(); env.plans.push(socket => { socket.plan('connect', wait.promise); socket.plan('close', business()); });
  const s = setup({ env }), pending = s.port.connect(), rejected = assert.rejects(pending, code('nativeCancelled')); await settle();
  const closing = s.port.close(), failed = assert.rejects(closing); wait.resolve(); await failed; await rejected; await settle();
  assert.equal(s.port.status().quarantined, true); assert.ok(env.sockets[0].count('close') >= 2);
});
test('native connect/options failures close native socket and detach every registered observer', async () => {
  for (const operation of ['connect', 'extra']) {
    const env = new Environment(); env.plans.push(socket => socket.plan(operation, business())); const s = setup({ env });
    await assert.rejects(s.port.connect()); await settle(); assert.equal(env.sockets[0].count('close'), 1); assert.equal(env.sockets[0].listenerCount(), 0); assert.equal(s.port.canRelease(), true);
  }
});
test('native listener-registration failure closes partially constructed socket', async () => {
  const env = new Environment(); env.plans.push(socket => { socket.onFailure = 'error'; }); const s = setup({ env }); await assert.rejects(s.port.connect()); await settle();
  assert.equal(env.sockets[0].count('connect'), 0); assert.equal(env.sockets[0].count('close'), 1); assert.equal(env.sockets[0].listenerCount(), 0);
});
test('native peer close/socket error attempt all detach paths even when one off throws', async () => {
  for (const event of ['close', 'error']) {
    const s = await opened(), socket = s.env.sockets[0]; socket.offFailures.add('message'); socket.emit(event, business()); await settle();
    assert.equal(socket.count('close'), 1); for (const name of ['message', 'error', 'close', 'connect']) assert.ok(socket.calls.some(([method, arg]) => method === 'off' && arg === name));
    socket.emit('message', incoming(new Uint8Array([1]))); assert.deepEqual(s.events, [[event === 'close' ? 'closed' : 'error']]); assert.equal(s.port.canRelease(), true);
  }
});
test('native observer exceptions cannot suppress socket cleanup', async () => {
  const fail = () => { throw new Error('observer failure'); };
  for (const trigger of ['message', 'error', 'close']) {
    const s = await opened({ sink: { received: fail, error: fail, closed: fail } }); s.env.sockets[0].emit(trigger, trigger === 'message' ? incoming(new Uint8Array([1])) : business()); await settle();
    assert.equal(s.env.sockets[0].count('close'), 1); assert.equal(s.port.canRelease(), true); assert.equal(s.env.tasks.size, 0);
  }
});
test('native generations are monotonic and independent factories do not share socket ownership', async () => {
  const env = new Environment(), a = await opened({ env }), b = await opened({ env }); await a.port.close();
  for (const generation of [0, 1]) assert.throws(() => a.factory.create(endpoint(), generation, a.sink), code('nativeInvalidGeneration'));
  assert.equal(env.sockets[1].count('close'), 0); await b.port.send(new Uint8Array([1])); assert.equal(env.sockets[0].count('send'), 0); await b.port.close();
});

function integrated(env = new Environment()) {
  const factory = new api.NativeDeoVrTransportFactory(env, { ...limits(), maximumSendBytes: 1024, maximumReceiveBytes: 1024 });
  const source = new core.DeoVrMediaSource(factory, env, { connectTimeoutMs: 100, sendTimeoutMs: 40, closeTimeoutMs: 30, heartbeatIntervalMs: 1000, maximumQueuedCommands: 4 });
  return { env, factory, source };
}
const packet = (changes = {}) => core.frameDeoVrPayload(new TextEncoder().encode(JSON.stringify({ path: 'C:\\fixture\\movie.mp4', playerState: 0, duration: 120, currentTime: 12, playbackSpeed: 1, ...changes })));
test('native plus actual source preserves early receipt timestamp across delayed connection readiness', async () => {
  const env = new Environment(), wait = deferred(); env.plans.push(socket => socket.plan('extra', wait.promise)); const s = integrated(env);
  assert.equal(env.sockets.length, 0); const pending = s.source.connect(endpoint()); await settle(); const socket = env.sockets[0];
  env.now = 10; const bytes = packet(); socket.emit('message', incoming(bytes.slice(0, 3))); socket.emit('message', incoming(bytes.slice(3)));
  assert.equal(s.source.snapshot().path, null); assert.equal(s.source.snapshot().status, 'connecting');
  env.now = 80; wait.resolve(); await pending;
  assert.equal(s.source.snapshot().status, 'connected'); assert.equal(s.source.snapshot().positionSeconds, 12);
  assert.equal(s.source.snapshot().observedAtMs, 10); assert.equal(s.source.snapshot().lastReceivedAtMs, 10); assert.equal(s.source.snapshot().receiptSequence, 1);
  await s.source.disconnect(); assert.equal(env.tasks.size, 0);
});
test('native plus actual source receives fragmented/coalesced Unicode frames and never treats local commands/heartbeat as observations', async () => {
  const s = integrated(); await s.source.connect(endpoint()); const socket = s.env.sockets[0];
  const first = packet({ path: 'C:\\片😀.mp4' }), second = packet({ path: 'C:\\片😀.mp4', currentTime: 13 });
  const combined = new Uint8Array(first.length + second.length); combined.set(first); combined.set(second, first.length);
  for (let offset = 0; offset < combined.length; offset += 7) socket.emit('message', incoming(combined.slice(offset, offset + 7)));
  assert.equal(s.source.snapshot().path, 'C:\\片😀.mp4'); assert.equal(s.source.snapshot().positionSeconds, 13); assert.equal(s.source.snapshot().receiptSequence, 2);
  const receipt = await s.source.seek(50); assert.equal(receipt.remoteAcknowledgement, false); assert.equal(s.source.snapshot().positionSeconds, 13);
  const sent = new Uint8Array(socket.calls.find(([name]) => name === 'send')[1].data);
  assert.equal(new DataView(sent.buffer).getInt32(0, true), sent.length - 4); assert.equal(JSON.parse(new TextDecoder().decode(sent.slice(4))).currentTime, 50);
  await s.env.advanceTo(1000); const allSent = socket.calls.filter(([name]) => name === 'send'); assert.deepEqual([...new Uint8Array(allSent[1][1].data)], [0, 0, 0, 0]);
  assert.equal(s.source.snapshot().receiptSequence, 2); assert.equal(s.source.snapshot().positionSeconds, 13); assert.equal(s.source.snapshot().lastReceivedAtMs, 0);
  await s.source.disconnect(); assert.equal(s.env.tasks.size, 0);
});
test('native plus actual source timed-out native pending connect permanently blocks reconnect after late success', async () => {
  const env = new Environment(), wait = deferred(); env.plans.push(socket => socket.plan('connect', wait.promise)); const s = integrated(env);
  const pending = s.source.connect(endpoint()), rejected = assert.rejects(pending); await settle(); const closing = s.source.disconnect(), closeRejected = assert.rejects(closing);
  await env.advanceTo(30); await rejected; await closeRejected; assert.equal(s.source.snapshot().quarantined, true);
  wait.resolve(); await settle(); assert.equal(s.source.snapshot().status, 'fault'); await assert.rejects(s.source.connect(endpoint())); assert.equal(env.sockets.length, 1); assert.equal(env.tasks.size, 0);
});
test('native plus actual source clean reconnect cannot accept captured old receive/error/close events', async () => {
  const s = integrated(); await s.source.connect(endpoint()); const old = s.env.sockets[0];
  const received = [...old.listeners.get('message')][0], error = [...old.listeners.get('error')][0], closed = [...old.listeners.get('close')][0];
  await s.source.disconnect(); await s.source.connect(endpoint()); received(incoming(packet())); error(business()); closed(); await settle();
  assert.equal(s.source.snapshot().generation, 2); assert.equal(s.source.snapshot().status, 'connected'); assert.equal(s.source.snapshot().path, null);
  s.env.sockets[1].emit('message', incoming(packet({ currentTime: 42 }))); assert.equal(s.source.snapshot().positionSeconds, 42); await s.source.disconnect();
});
