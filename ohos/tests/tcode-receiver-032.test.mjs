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
