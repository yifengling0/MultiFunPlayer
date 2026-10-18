#!/usr/bin/env node
/** Send a short deterministic TCode sequence to a running receiver.
 * This verifies the PC simulator itself; it is not the phone integration test. */
import net from 'node:net';
import dgram from 'node:dgram';

const host = process.env.RECEIVER_HOST || '127.0.0.1';
const tcpPort = Number(process.env.RECEIVER_TCP || 8000);
const udpPort = Number(process.env.RECEIVER_UDP || 8001);
const frames = [
  'L00000I16\n', 'L02500I16\n', 'L05000I16\n', 'L07500I16\n', 'L09999I16\n',
  'L09999 R10000 I16\n', 'L05000 R15000 I16\n', 'L00000 R19999 I16\n',
  'V05000I33\n'
];

await new Promise((resolve, reject) => {
  const socket = net.createConnection(tcpPort, host, () => {
    let index = 0;
    const timer = setInterval(() => {
      if (index >= frames.length) {
        clearInterval(timer);
        socket.end(); resolve(); return;
      }
      socket.write(frames[index++]);
    }, 16);
  });
  socket.on('error', reject);
});
console.log(`tcp: sent ${frames.length} frames to ${host}:${tcpPort}`);

await new Promise((resolve, reject) => {
  const socket = dgram.createSocket('udp4');
  socket.send(frames.slice(0, 5).join(''), udpPort, host, error => {
    socket.close(); error ? reject(error) : resolve();
  });
});
console.log(`udp: sent 5 frames to ${host}:${udpPort}`);
console.log(`dashboard: http://127.0.0.1:8099/`);
