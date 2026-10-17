#!/usr/bin/env node
/** Dedicated MFP_DIAG/1 receiver. No third-party dependencies, motion decoder,
 * recording, outbound initiation, credentials, saved state, or payload logs. */
import net from 'node:net';
import dgram from 'node:dgram';
import { pathToFileURL } from 'node:url';
const MAX_BYTES = 128;
export function validChallenge(bytes) {
  if (bytes.length > MAX_BYTES || bytes.length === 0) return false;
  // Buffer ASCII decoding masks high bits; reject those before decoding.
  if (bytes.some(value => value > 127)) return false;
  const match = /^MFP_DIAG\/1 ([1-9][0-9]{0,15}) ([1-9][0-9]{0,15}) ([a-f0-9]{32})\n$/.exec(bytes.toString('ascii'));
  return match !== null && Number.isSafeInteger(Number(match[1])) && Number.isSafeInteger(Number(match[2]));
}
export async function startDiagnosticReceiver(options = {}) {
  const host = options.host ?? '127.0.0.1', requestedPort = options.port ?? 0, protocol = options.protocol ?? 'both';
  const maxRequests = options.maxRequests ?? 20, lifetimeMs = options.lifetimeMs ?? 120000, log = options.log ?? (row => console.log(JSON.stringify(row)));
  const family = net.isIP(host);
  if (!family) throw new Error('Bind host must be a numeric local IP address.');
  const loopback = host === '127.0.0.1' || host === '::1';
  if (!loopback && options.allowLan !== true) throw new Error('Non-loopback bind requires explicit --allow-lan.');
  if (!['tcp', 'udp', 'both'].includes(protocol) || !Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65535 ||
      !Number.isInteger(maxRequests) || maxRequests < 1 || maxRequests > 100 || !Number.isInteger(lifetimeMs) || lifetimeMs < 100 || lifetimeMs > 300000) throw new Error('Invalid bounded receiver settings.');
  const sockets = new Set(); let tcp = null, udp = null, port = requestedPort, accepted = 0, rejected = 0, receivedBytes = 0, closed = false, closing = null, timer = null, logs = 0;
  const boundedLog = row => { if (logs++ < 32) log(row); };
  let finishClosed; const completion = new Promise(resolve => { finishClosed = resolve; });
  const stats = () => ({ accepted, rejected, receivedBytes, closed });
  const reject = transport => { rejected++; boundedLog({ event: 'rejected', transport }); };
  const accept = (transport, bytes) => { accepted++; receivedBytes += bytes.length; boundedLog({ event: 'echo', transport, bytes: bytes.length, requestNumber: accepted }); };
  async function close() {
    if (closing) return closing;
    closed = true; clearTimeout(timer);
    closing = (async () => {
      for (const socket of sockets) socket.destroy();
      const pending = [];
      if (tcp) pending.push(new Promise(resolve => { try { tcp.close(resolve); } catch { resolve(); } }));
      if (udp) pending.push(new Promise(resolve => { try { udp.close(resolve); } catch { resolve(); } }));
      await Promise.all(pending); boundedLog({ event: 'closed', ...stats() }); finishClosed();
    })();
    return closing;
  }
  const atLimit = () => { if (accepted >= maxRequests) { setTimeout(() => { void close(); }, 50); } };
  try {
    if (protocol !== 'udp') {
      tcp = net.createServer(socket => {
        if (closed || sockets.size >= 8 || accepted >= maxRequests) { socket.destroy(); return; }
        sockets.add(socket); let pending = Buffer.alloc(0), done = false;
        socket.setTimeout(2000, () => socket.destroy()); socket.on('error', () => {}); socket.on('close', () => sockets.delete(socket));
        socket.on('data', bytes => {
          if (done || closed) return;
          if (pending.length + bytes.length > MAX_BYTES) { done = true; reject('tcp'); socket.destroy(); return; }
          pending = Buffer.concat([pending, bytes]);
          if (!pending.includes(10)) return;
          done = true;
          if (accepted >= maxRequests || !validChallenge(pending)) { reject('tcp'); socket.destroy(); return; }
          accept('tcp', pending); socket.end(pending); atLimit();
        });
      });
      await new Promise((resolve, reject) => { tcp.once('error', reject); tcp.listen(requestedPort, host, resolve); }); port = tcp.address().port;
      tcp.on('error', () => { boundedLog({ event: 'listenerError', transport: 'tcp' }); void close(); });
    }
    if (protocol !== 'tcp') {
      udp = dgram.createSocket(family === 6 ? 'udp6' : 'udp4');
      udp.on('message', (bytes, remote) => {
        if (closed || accepted >= maxRequests) return;
        if (!validChallenge(bytes)) { reject('udp'); return; }
        accept('udp', bytes);
        // Only replies to the requesting peer; never larger than its challenge.
        udp.send(bytes, remote.port, remote.address, error => { if (error) boundedLog({ event: 'sendError', transport: 'udp' }); }); atLimit();
      });
      await new Promise((resolve, reject) => { udp.once('error', reject); udp.bind(port, host, resolve); }); port = udp.address().port;
      udp.on('error', () => { boundedLog({ event: 'listenerError', transport: 'udp' }); void close(); });
    }
  } catch (error) { await close(); throw error; }
  timer = setTimeout(() => { void close(); }, lifetimeMs);
  boundedLog({ event: 'listening', bindHost: host, port, protocol, scope: loopback ? 'loopbackOnly' : 'LANExplicitlyEnabled',
    appDestination: host === '0.0.0.0' || host === '::' ? 'Use this computer\'s reachable LAN IP and the displayed port; wildcard is not a destination.' : host,
    maximumRequests: maxRequests, expiresAfterSeconds: lifetimeMs / 1000, deviceExecutionAck: false });
  return { host, port, protocol, close, completion, stats };
}
function usage() {
  console.log('Usage: node receiver.mjs [--protocol tcp|udp|both] [--port 0..65535] [--host LOCAL_IP] [--allow-lan] [--max-requests 1..100] [--seconds 1..300]');
  console.log('Defaults: loopback 127.0.0.1, ephemeral port, TCP + UDP, 20 requests, 120 seconds. No files or payload logs.');
  console.log('Phone/tablet testing: explicitly bind your computer LAN IP with --host <IP> --allow-lan, then enter that IP and printed port in the app. Never point this diagnostic at a motion device.');
}
async function main() {
  const args = process.argv.slice(2), options = {};
  const flagMap = { '--host': 'host', '--port': 'port', '--protocol': 'protocol', '--max-requests': 'maxRequests', '--seconds': 'lifetimeMs' };
  for (let index = 0; index < args.length; index++) {
    const flag = args[index]; if (flag === '--help' || flag === '-h') { usage(); return; }
    if (flag === '--allow-lan') { options.allowLan = true; continue; }
    if (!flagMap[flag] || index + 1 >= args.length) throw new Error('Unknown or incomplete option. Run --help.');
    const value = args[++index]; options[flagMap[flag]] = ['--port', '--max-requests', '--seconds'].includes(flag) ? Number(value) * (flag === '--seconds' ? 1000 : 1) : value;
  }
  const receiver = await startDiagnosticReceiver(options);
  const stop = () => { void receiver.close(); }; process.once('SIGINT', stop); process.once('SIGTERM', stop);
  await receiver.completion; process.off('SIGINT', stop); process.off('SIGTERM', stop);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error('Receiver could not start:', error.message); process.exitCode = 1; });
}
