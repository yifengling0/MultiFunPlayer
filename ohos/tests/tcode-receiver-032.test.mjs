import test from 'node:test';
import assert from 'node:assert/strict';
import { ReceiverStats, parseTCodeLine, parseTCodePayload } from '../tools/tcode-receiver/protocol.mjs';

test('TCode parser preserves precision, axis names and intervals without clamping', () => {
  const frame = parseTCodeLine('L05000 R15000 I16\r');
  assert.deepEqual(frame.axisNames, ['L0', 'R1']);
  assert.deepEqual(frame.axes.map(axis => [axis.raw, axis.value, axis.digits]), [['L05000', 5000, 4], ['R15000', 5000, 4]]);
  assert.equal(frame.intervals[0], 16);
  assert.equal(frame.intervalMs, 16);
  assert.ok(Math.abs(frame.axes[0].normalized - 5000 / 9999) < 1e-12);
  assert.deepEqual(frame.unknown, []);
});

test('multiple lines, malformed tokens and empty payloads are handled deterministically', () => {
  const frames = parseTCodePayload('L09999I16\n\nXbad L010000\n');
  assert.equal(frames.length, 2);
  assert.equal(frames[0].axes[0].name, 'L0');
  assert.equal(frames[0].axes[0].normalized, 1);
  assert.deepEqual(frames[1].unknown, ['Xbad']);
  assert.deepEqual(parseTCodePayload('\n\r\n'), []);
});

test('receiver stats count both transports, frames and per-axis ranges', () => {
  const stats = new ReceiverStats(10);
  stats.record('tcp', 12, 'L05000I16\n');
  stats.record('udp', 10, 'L010000I16');
  stats.record('udp', 8, 'garbage');
  const snapshot = stats.snapshot();
  assert.equal(snapshot.frames, 2);
  assert.equal(snapshot.invalidFrames, 1);
  assert.equal(snapshot.packets, 3);
  assert.equal(snapshot.transports.tcp, 1);
  assert.equal(snapshot.transports.udp, 2);
  assert.equal(snapshot.axes[0].name, 'L0');
  assert.equal(snapshot.axes[0].count, 2);
  assert.ok(Math.abs(snapshot.axes[0].minimum - 10000 / 99999) < 1e-12);
  assert.ok(Math.abs(snapshot.axes[0].maximum - 5000 / 9999) < 1e-12);
  assert.equal(snapshot.recent.length, 2);
  assert.equal(snapshot.recent[0].transport, 'tcp');
});

test('mixed valid and unknown commands invalidate the whole line', () => {
  const stats = new ReceiverStats();
  stats.record('tcp', 20, 'L05000I16 garbage\n');
  stats.record('udp', 20, 'L05000I16 R1oops\n');
  const snapshot = stats.snapshot();
  assert.equal(snapshot.invalidFrames, 2);
  assert.equal(snapshot.frames, 0);
  assert.deepEqual(snapshot.axes, []);
  assert.deepEqual(snapshot.recent, []);
  stats.record('udp', 20, 'L05000I16\nR19999I16\n');
  assert.equal(stats.snapshot().frames, 2);
});

test('idle snapshots clear rate without requiring another packet', () => {
  const originalNow = Date.now;
  let now = 1000;
  Date.now = () => now;
  try {
    const stats = new ReceiverStats();
    stats.record('tcp', 10, 'L05000I16');
    now = 2000;
    stats.record('tcp', 10, 'L05000I16');
    assert.equal(stats.snapshot().rateHz, 2);
    now = 12000;
    const idle = stats.snapshot();
    assert.equal(idle.rateHz, 0);
    assert.equal(idle.frames, 2);
    assert.equal(idle.lastFrameAt, new Date(2000).toISOString());
    now = 13000;
    assert.equal(stats.snapshot().rateHz, 0);
    stats.record('udp', 10, 'L05000I16');
    now = 14000;
    stats.record('udp', 10, 'L05000I16');
    assert.ok(stats.snapshot().rateHz > 0);
  } finally { Date.now = originalNow; }
});

test('reset preserves active connections and subsequent close accounting', () => {
  const stats = new ReceiverStats();
  stats.connectionOpened(); stats.connectionOpened(); stats.connectionOpened();
  stats.connectionClosed();
  stats.record('tcp', 10, 'L05000I16');
  stats.reset();
  const snapshot = stats.snapshot();
  assert.equal(snapshot.activeConnections, 2);
  assert.equal(snapshot.connections, 2);
  assert.equal(snapshot.peakConnections, 2);
  assert.equal(snapshot.frames, 0);
  assert.equal(snapshot.rateHz, 0);
  stats.connectionClosed();
  assert.equal(stats.snapshot().activeConnections, 1);
  stats.connectionOpened();
  assert.equal(stats.snapshot().activeConnections, 2);
});
