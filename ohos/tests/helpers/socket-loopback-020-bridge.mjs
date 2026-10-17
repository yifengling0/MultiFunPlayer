/** OHOS-shaped SDK facade backed by actual Linux net/dgram sockets.
 * All OS binds and connects are forced to IPv4 loopback and ephemeral local ports.
 * Production UDP's wildcard bind is narrowed to 127.0.0.1 by this test boundary.
 * Optional delayed completion is explicit fault injection, not an echo substitute. */
import net from 'node:net';
import dgram from 'node:dgram';
import { EventEmitter } from 'node:events';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
export const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function eventually(predicate, detail = 'condition', timeoutMs = 1200) {
  const deadline = performance.now() + timeoutMs;
  while (!predicate()) { if (performance.now() >= deadline) throw new Error('Timed out: ' + detail); await delay(2); }
}
export function deferred() { let resolve, reject; const promise = new Promise((a,b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
const buffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const peer = address => { assert.equal(address.address, '127.0.0.1'); assert.ok(address.port > 0 && address.port <= 65535); assert.equal(address.family, 1); };
class BridgeSocket {
  events = new EventEmitter(); sends = []; closeCalls = 0; closed = false; closePromise = null;
  constructor(kind, environment) {
    this.kind = kind; this.environment = environment;
    this.native = kind === 'tcp' ? new net.Socket() : dgram.createSocket('udp4');
    this.native.on('error', error => this.events.emit('error', error));
    // EventEmitter error semantics differ from the SDK. Keep a non-owning sink
    // after SDK detach so late native errors cannot crash the Node process.
    this.events.on('error', () => {});
    this.native.on('close', () => { this.closed = true; this.events.emit('close'); });
    if (kind === 'tcp') this.native.on('data', bytes => this.events.emit('message', { message: buffer(bytes), remoteInfo: { address: this.native.remoteAddress, port: this.native.remotePort } }));
    else this.native.on('message', (bytes, remote) => this.events.emit('message', { message: buffer(bytes), remoteInfo: { address: remote.address, port: remote.port } }));
  }
  on(name, fn) { this.events.on(name, fn); }
  off(name, fn) { this.events.off(name, fn); }
  listenerCount() { return this.events.eventNames().reduce((sum, name) => sum + this.events.listenerCount(name), 0) - 1; }
  async connect({ address }) {
    peer(address); assert.equal(this.kind, 'tcp');
    await new Promise((resolve, reject) => { this.native.once('error', reject); this.native.connect({ host: address.address, port: address.port, localAddress: '127.0.0.1', localPort: 0 }, () => { this.native.off('error', reject); resolve(); }); });
  }
  async bind(address) {
    assert.equal(this.kind, 'udp'); assert.equal(address.port, 0); assert.equal(address.family, 1); assert.ok(['0.0.0.0', '127.0.0.1'].includes(address.address));
    await new Promise((resolve, reject) => { this.native.once('error', reject); this.native.bind(0, '127.0.0.1', () => { this.native.off('error', reject); resolve(); }); });
  }
  async setExtraOptions(options) { assert.deepEqual(options, { TCPNoDelay: true }); this.native.setNoDelay(true); }
  async send({ data, address }) {
    const bytes = Buffer.from(data).slice(); this.sends.push(bytes);
    if (this.kind === 'tcp') await new Promise((resolve, reject) => this.native.write(bytes, error => error ? reject(error) : resolve()));
    else { peer(address); await new Promise((resolve, reject) => this.native.send(bytes, address.port, address.address, error => error ? reject(error) : resolve())); }
    if (this.environment.holdNextSendCompletion) {
      const hold = this.environment.holdNextSendCompletion; this.environment.holdNextSendCompletion = null; await hold.promise;
    }
  }
  close() {
    this.closeCalls++;
    if (this.closePromise) return this.closePromise;
    if (this.closed) return Promise.resolve();
    this.closePromise = new Promise((resolve, reject) => {
      this.native.once('close', resolve);
      if (this.kind === 'tcp') this.native.destroy();
      else { try { this.native.close(); } catch (error) { if (error.code === 'ERR_SOCKET_DGRAM_NOT_RUNNING') { this.closed = true; resolve(); } else reject(error); } }
    });
    return this.closePromise;
  }
}
export class NodeLoopbackEnvironment {
  sockets = []; timers = new Map(); nextTimer = 0; holdNextSendCompletion = null; resolveHold = null;
  nowMs() { return performance.now(); }
  scheduleAt(at, callback) { const id = ++this.nextTimer; this.timers.set(id, setTimeout(() => { this.timers.delete(id); callback(); }, Math.max(0, at - this.nowMs()))); return id; }
  cancel(id) { clearTimeout(this.timers.get(id)); this.timers.delete(id); }
  supports() { return true; }
  async resolveHost(host) { assert.equal(host, '127.0.0.1', 'Only numeric loopback is authorized'); if (this.resolveHold) await this.resolveHold.promise; return [{ address: host, family: 1 }]; }
  createTcp() { const socket = new BridgeSocket('tcp', this); this.sockets.push(socket); return socket; }
  createUdp() { const socket = new BridgeSocket('udp', this); this.sockets.push(socket); return socket; }
  createWebSocket() { throw new Error('Outside the TCP/UDP loopback scope'); }
}
export async function startReceiver(kind, options = {}) {
  const records = [], connections = new Set(); let accepted = 0;
  const receive = (bytes, reply) => { records.push(Buffer.from(bytes)); if (options.echo !== false) { if (options.reply) options.reply(bytes, reply); else reply(bytes); } };
  const server = kind === 'tcp' ? net.createServer(socket => {
    accepted++; connections.add(socket); socket.on('close', () => connections.delete(socket)); socket.on('error', () => {});
    socket.on('data', bytes => receive(bytes, data => socket.write(data)));
  }) : dgram.createSocket('udp4');
  if (kind === 'udp') server.on('message', (bytes, remote) => receive(bytes, data => server.send(data, remote.port, remote.address)));
  await new Promise((resolve, reject) => { server.once('error', reject); if (kind === 'tcp') server.listen(0, '127.0.0.1', resolve); else server.bind(0, '127.0.0.1', resolve); });
  return { kind, port: server.address().port, records, connections, get accepted() { return accepted; }, bytes() { return Buffer.concat(records); },
    async close() { for (const socket of connections) socket.destroy(); await new Promise(resolve => server.close(resolve)); } };
}
