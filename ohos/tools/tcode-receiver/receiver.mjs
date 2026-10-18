#!/usr/bin/env node
/**
 * PC-side TCP/UDP TCode receiver simulator for MultiFunPlayer OHOS.
 *
 * It binds real TCP and UDP sockets, parses every received TCode frame, keeps
 * per-axis ranges/rates, and serves a small live dashboard. It intentionally
 * does not emulate a physical device: "local write accepted" is not proof of
 * hardware motion.
 *
 *   node receiver.mjs --tcp 8000 --udp 8001 --http 8099
 *   node receiver.mjs --self-test
 *
 * On the phone, add a TCP or UDP target whose host is this PC's LAN address and
 * whose port matches here, then connect and explicitly enable sending.
 */
import net from 'node:net';
import dgram from 'node:dgram';
import http from 'node:http';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { ReceiverStats, parseTCodePayload } from './protocol.mjs';

function parseArguments(argv) {
  const options = { tcp: 8000, udp: 8001, http: 8099, host: '0.0.0.0', quiet: false, selfTest: false, maximumRecent: 200 };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--self-test') { options.selfTest = true; continue; }
    if (argument === '--quiet') { options.quiet = true; continue; }
    if (argument === '--tcp' || argument === '--udp' || argument === '--http' || argument === '--host' || argument === '--recent') {
      const value = argv[++index];
      if (value === undefined) throw new Error('Missing value for ' + argument);
      if (argument === '--host') options.host = value;
      else if (argument === '--recent') options.maximumRecent = Number(value);
      else options[argument.slice(2)] = Number(value);
      continue;
    }
    if (argument === '--help' || argument === '-h') { options.help = true; continue; }
    throw new Error('Unknown argument: ' + argument);
  }
  return options;
}

function localAddresses() {
  const result = [];
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) result.push({ name, address: entry.address });
    }
  }
  return result;
}

function lineLog(options, receiver, transport, remote, frame) {
  if (options.quiet) return;
  const axes = frame.axes.map(axis => axis.name + '=' + axis.value + ' (' + axis.normalized.toFixed(3) + ')').join(' ');
  const suffix = frame.intervalMs === null ? '' : ' I=' + frame.intervalMs + 'ms';
  console.log(`[${new Date().toISOString()}] ${transport.toUpperCase()} ${remote} frames=${receiver.stats.frames} ${axes}${suffix}`);
}

export function createReceiver(options = {}) {
  const settings = { tcp: 8000, udp: 8001, http: 8099, host: '0.0.0.0', quiet: false, maximumRecent: 200, ...options };
  const stats = new ReceiverStats(settings.maximumRecent);
  const sockets = new Set();
  const servers = { tcp: null, udp: null, http: null };
  let started = false;

  function record(transport, remote, bytes, payload) {
    const before = stats.frames;
    stats.record(transport, bytes, payload);
    if (stats.frames !== before) {
      const frames = parseTCodePayload(payload);
      for (const frame of frames) {
        if (frame.axes.length > 0) lineLog(settings, { stats }, transport, remote, frame);
      }
    }
  }

  function startTcp() {
    return new Promise((resolve, reject) => {
      const server = net.createServer(socket => {
        stats.connectionOpened();
        sockets.add(socket);
        let buffer = '';
        socket.setNoDelay(true);
        console.log(`[tcp] client connected ${socket.remoteAddress}:${socket.remotePort} (active=${stats.activeConnections})`);
        socket.on('data', chunk => {
          buffer += chunk.toString('utf8');
          if (buffer.length > 256 * 1024) buffer = buffer.slice(-128 * 1024);
          let newline = buffer.indexOf('\n');
          while (newline >= 0) {
            const line = buffer.slice(0, newline);
            buffer = buffer.slice(newline + 1);
            if (line.trim().length > 0) record('tcp', `${socket.remoteAddress}:${socket.remotePort}`, Buffer.byteLength(line) + 1, line);
            newline = buffer.indexOf('\n');
          }
        });
        const closed = () => {
          if (!sockets.delete(socket)) return;
          stats.connectionClosed();
          console.log(`[tcp] client closed (active=${stats.activeConnections})`);
        };
        socket.on('close', closed);
        socket.on('error', error => { console.error('[tcp] socket error:', error.message); closed(); });
      });
      server.once('error', reject);
      server.listen(settings.tcp, settings.host, () => {
        servers.tcp = server;
        console.log(`[tcp] listening on ${settings.host}:${server.address().port}`);
        resolve(server.address().port);
      });
    });
  }

  function startUdp() {
    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket('udp4');
      socket.once('error', reject);
      socket.on('message', (message, remote) => {
        record('udp', `${remote.address}:${remote.port}`, message.length, message.toString('utf8'));
      });
      socket.bind(settings.udp, settings.host, () => {
        servers.udp = socket;
        const address = socket.address();
        console.log(`[udp] listening on ${settings.host}:${address.port}`);
        resolve(address.port);
      });
    });
  }

  function renderDashboard(snapshot) {
    const axes = snapshot.axes.map(axis => `<tr><td>${axis.name}</td><td>${axis.count}</td><td>${axis.last === null ? '—' : axis.last.toFixed(4)}</td><td>${axis.minimum === null ? '—' : axis.minimum.toFixed(4)}</td><td>${axis.maximum === null ? '—' : axis.maximum.toFixed(4)}</td></tr>`).join('');
    const recent = snapshot.recent.slice().reverse().map(frame => `<tr><td>${frame.at}</td><td>${frame.transport}</td><td><code>${frame.raw.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</code></td><td>${frame.intervalMs ?? '—'}</td></tr>`).join('');
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MultiFunPlayer TCode receiver</title><style>
:root{color-scheme:dark}body{margin:0;background:#10161f;color:#dce6f2;font:14px/1.5 ui-sans-serif,system-ui,"Segoe UI",sans-serif}main{max-width:1100px;margin:0 auto;padding:24px}
h1{font-size:20px;margin:0 0 4px}small{color:#8798aa}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:18px 0}
.card{background:#182231;border:1px solid #263449;border-radius:14px;padding:12px 14px}.card b{display:block;font-size:24px;color:#6cb6ff}.card span{color:#8798aa}
table{width:100%;border-collapse:collapse;margin-top:8px;font-size:13px}th,td{text-align:left;padding:7px 8px;border-bottom:1px solid #223046}th{color:#8798aa;font-weight:500}
code{color:#b8e0ff}section{margin-top:22px}.ok{color:#58d68d}.warn{color:#f5b041}.muted{color:#8798aa}a{color:#6cb6ff}
</style></head><body><main>
<h1>MultiFunPlayer · TCode receiver</h1><small>TCP :${servers.tcp?.address().port ?? '-'} · UDP :${servers.udp?.address().port ?? '-'} · 自动刷新 1s</small>
<div class="cards">
<div class="card"><b>${snapshot.frames}</b><span>帧数</span></div>
<div class="card"><b>${snapshot.rateHz}</b><span>帧率 Hz</span></div>
<div class="card"><b>${snapshot.activeConnections}</b><span>TCP 连接</span></div>
<div class="card"><b>${snapshot.packets}</b><span>接收包</span></div>
<div class="card"><b>${snapshot.bytes}</b><span>字节</span></div>
<div class="card"><b class="${snapshot.invalidFrames === 0 ? 'ok' : 'warn'}">${snapshot.invalidFrames}</b><span>无法解析</span></div>
</div>
<section><h2>轴</h2><table><thead><tr><th>轴</th><th>命令数</th><th>最后</th><th>最小</th><th>最大</th></tr></thead><tbody>${axes || '<tr><td colspan="5" class="muted">还没有数据</td></tr>'}</tbody></table></section>
<section><h2>最近帧</h2><table><thead><tr><th>时间</th><th>传输</th><th>原始帧</th><th>I (ms)</th></tr></thead><tbody>${recent || '<tr><td colspan="4" class="muted">还没有数据</td></tr>'}</tbody></table></section>
<section class="muted">这只是本地接收模拟器。收到数据不代表真实设备已经执行；手机端仍需明确连接并启用发送。</section>
</main><script>setTimeout(()=>location.reload(),1000)</script></body></html>`;
  }

  function startHttp() {
    return new Promise((resolve, reject) => {
      const server = http.createServer((request, response) => {
        if (request.url === '/stats.json') {
          response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
          response.end(JSON.stringify(stats.snapshot(), null, 2));
          return;
        }
        if (request.url === '/reset') {
          stats.reset();
          response.writeHead(200, { 'content-type': 'application/json' });
          response.end('{"reset":true}');
          return;
        }
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        response.end(renderDashboard(stats.snapshot()));
      });
      server.once('error', reject);
      server.listen(settings.http, settings.host, () => {
        servers.http = server;
        console.log(`[http] dashboard on http://127.0.0.1:${server.address().port}/`);
        resolve(server.address().port);
      });
    });
  }

  async function start() {
    if (started) return;
    started = true;
    await startTcp();
    await startUdp();
    if (settings.http > 0) await startHttp();
    if (!settings.quiet) {
      console.log('PC LAN addresses for the phone target:');
      for (const entry of localAddresses()) console.log(`  ${entry.address}  (${entry.name})`);
      console.log('Windows: allow Node.js on Private networks, or add inbound rules for the TCP/UDP ports.');
      console.log('Phone: add a TCP/UDP target with that host, connect, then explicitly enable sending.');
    }
  }

  async function stop() {
    for (const socket of sockets) { try { socket.destroy(); } catch (_error) {} }
    sockets.clear(); stats.activeConnections = 0;
    await new Promise(resolve => servers.tcp?.close(() => resolve()) ?? resolve());
    await new Promise(resolve => { try { servers.udp?.close(() => resolve()); } catch (_error) { resolve(); } });
    await new Promise(resolve => servers.http?.close(() => resolve()) ?? resolve());
    servers.tcp = null; servers.udp = null; servers.http = null; started = false;
  }

  return { settings, stats, start, stop, get tcpPort() { return servers.tcp?.address().port ?? null; }, get udpPort() { return servers.udp?.address().port ?? null; }, get httpPort() { return servers.http?.address().port ?? null; } };
}

async function selfTest() {
  const receiver = createReceiver({ tcp: 0, udp: 0, http: 0, quiet: true });
  await receiver.start();
  const payloads = [
    'L09999I16\n',
    'L05000 R19999 I16\n',
    'V00000I33\n',
    'L010000I16 L010000\n'
  ];
  await new Promise((resolve, reject) => {
    const socket = net.createConnection(receiver.tcpPort, '127.0.0.1', () => {
      socket.write(payloads.join(''), error => error ? reject(error) : resolve());
    });
    socket.on('error', reject);
  });
  await new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    socket.send(payloads[1], receiver.udpPort, '127.0.0.1', error => { socket.close(); error ? reject(error) : resolve(); });
  });
  await new Promise(resolve => setTimeout(resolve, 150));
  const snapshot = receiver.stats.snapshot();
  const failures = [];
  if (snapshot.frames !== 5) failures.push('expected 5 frames, got ' + snapshot.frames);
  if (!snapshot.axes.some(axis => axis.name === 'L0' && axis.maximum > 0.9)) failures.push('L0 maximum missing');
  if (!snapshot.axes.some(axis => axis.name === 'R1' && axis.maximum > 0.9)) failures.push('R1 maximum missing');
  if (snapshot.transports.tcp < 1 || snapshot.transports.udp < 1) failures.push('both transports must be observed');
  await receiver.stop();
  if (failures.length > 0) {
    console.error('SELF-TEST FAILED: ' + failures.join('; '));
    process.exitCode = 1;
    return;
  }
  console.log(`SELF-TEST OK: ${snapshot.frames} frames, axes=${snapshot.axes.map(axis => axis.name).join(',')}`);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log('Usage: node receiver.mjs [--tcp 8000] [--udp 8001] [--http 8099] [--host 0.0.0.0] [--quiet] [--self-test]');
    return;
  }
  if (options.selfTest) { await selfTest(); return; }
  const receiver = createReceiver(options);
  await receiver.start();
  const summary = setInterval(() => {
    const snapshot = receiver.stats.snapshot();
    console.log(`[summary] frames=${snapshot.frames} rate=${snapshot.rateHz}Hz tcp=${snapshot.transports.tcp} udp=${snapshot.transports.udp} axes=${snapshot.axes.length} invalid=${snapshot.invalidFrames}`);
  }, 2000);
  summary.unref?.();
  const shutdown = async () => {
    clearInterval(summary);
    await receiver.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
