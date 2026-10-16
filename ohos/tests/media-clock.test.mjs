import test from 'node:test';
import assert from 'node:assert/strict';
import { MediaClock } from '../entry/src/main/ets/core/MediaClock.ts';
function prepared() {
  const clock = new MediaClock();
  const generation = clock.reset('loading');
  clock.prepared(generation, 10000, 0, 100);
  return { clock, generation };
}
function playing() {
  const result = prepared();
  assert.equal(result.clock.requestPlay(), true);
  result.clock.stateChanged(result.generation, 'playing');
  return result;
}
test('preparation observes real position and stays paused until explicit play and native playing', () => {
  const { clock, generation } = prepared();
  assert.equal(clock.snapshot().ready, true);
  assert.equal(clock.snapshot().safetyGateOpen, false);
  clock.stateChanged(generation, 'playing');
  assert.equal(clock.snapshot().safetyGateOpen, false);
  clock.requestPlay();
  assert.equal(clock.snapshot().safetyGateOpen, true);
});
test('time is authoritative, never extrapolated by rate or elapsed time', () => {
  const { clock, generation } = playing();
  clock.observe(generation, 1234, 200);
  clock.rateChanged(generation, 4);
  clock.checkFreshness(900);
  assert.equal(clock.snapshot().positionMs, 1234);
  assert.equal(clock.snapshot().rate, 4);
});
test('seek ignores old updates and accepts only observed actual landing position', () => {
  const { clock, generation } = playing();
  clock.beginSeek(); clock.observe(generation, 5000, 200);
  assert.equal(clock.snapshot().positionMs, 0);
  assert.equal(clock.snapshot().seeking, true);
  assert.equal(clock.requestPlay(), false);
  clock.endSeek(generation, 4900, 300);
  assert.equal(clock.snapshot().positionMs, 4900);
  assert.equal(clock.snapshot().valid, true);
  assert.equal(clock.snapshot().safetyGateOpen, false);
});
test('stale playback freezes and a fresh update alone cannot restart output', () => {
  const { clock, generation } = playing();
  clock.observe(generation, 100, 200);
  assert.equal(clock.checkFreshness(951), false);
  assert.equal(clock.snapshot().positionMs, 100);
  assert.equal(clock.snapshot().valid, false);
  clock.observe(generation, 200, 960); clock.stateChanged(generation, 'playing');
  assert.equal(clock.snapshot().safetyGateOpen, false);
});
test('buffering closes gate and buffering end cannot restart it', () => {
  const { clock, generation } = playing();
  clock.setBuffering(generation, true);
  assert.equal(clock.snapshot().safetyGateOpen, false);
  clock.setBuffering(generation, false); clock.observe(generation, 100, 200);
  clock.stateChanged(generation, 'playing');
  assert.equal(clock.snapshot().safetyGateOpen, false);
});
test('source replacement rejects stale prepared, time, rate, state and seek callbacks', () => {
  const { clock, generation } = playing();
  clock.reset('loading');
  clock.prepared(generation, 10000, 4000, 200);
  clock.observe(generation, 6000, 300); clock.rateChanged(generation, 4);
  clock.stateChanged(generation, 'playing'); clock.endSeek(generation, 8000, 400);
  assert.equal(clock.snapshot().ready, false);
  assert.equal(clock.snapshot().positionMs, 0);
  assert.equal(clock.snapshot().rate, 1);
  assert.equal(clock.snapshot().state, 'loading');
});
test('unknown and invalid duration or position fail closed', () => {
  for (const duration of [0, -1, NaN, Infinity]) {
    const clock = new MediaClock(); const g = clock.reset();
    clock.prepared(g, duration, 0, 100);
    assert.equal(clock.requestPlay(), false);
  }
  for (const position of [-1, NaN, Infinity, 10001]) {
    const { clock, generation } = playing(); clock.observe(generation, position, 200);
    assert.equal(clock.snapshot().valid, false); assert.equal(clock.snapshot().safetyGateOpen, false);
  }
});
test('pause, completion, errors and release cannot auto-reopen output', () => {
  for (const state of ['paused', 'completed', 'stopped', 'error', 'released']) {
    const { clock, generation } = playing(); clock.stateChanged(generation, state);
    clock.stateChanged(generation, 'playing'); assert.equal(clock.snapshot().safetyGateOpen, false);
  }
  const { clock, generation } = playing(); clock.fail('Decoder failed');
  clock.observe(generation, 50, 200); assert.equal(clock.requestPlay(), false);
  assert.equal(clock.snapshot().failure, 'Decoder failed');
});
test('snapshot mutations cannot change internal authority and end position closes gate', () => {
  const { clock, generation } = playing(); const snapshot = clock.snapshot();
  snapshot.positionMs = 9000; assert.equal(clock.snapshot().positionMs, 0);
  clock.observe(generation, 10000, 200); assert.equal(clock.snapshot().safetyGateOpen, false);
});
test('non-finite or negative clock values fail closed even while paused', () => {
  for (const now of [NaN, Infinity, -Infinity, -1]) {
    for (const create of [prepared, playing]) {
      const { clock } = create();
      assert.equal(clock.checkFreshness(now), false);
      assert.equal(clock.snapshot().valid, false);
      assert.equal(clock.snapshot().safetyGateOpen, false);
      assert.equal(clock.requestPlay(), false);
    }
    const { clock, generation } = playing();
    clock.observe(generation, 500, now);
    assert.equal(clock.snapshot().valid, false);
    assert.equal(clock.snapshot().positionMs, 0);
  }
});
test('backward uptime and invalid freshness limits fail closed', () => {
  const { clock } = playing();
  assert.equal(clock.checkFreshness(99), false);
  for (const timeout of [NaN, Infinity, -1]) {
    const current = playing().clock;
    assert.equal(current.checkFreshness(100, timeout), false);
    assert.equal(current.snapshot().safetyGateOpen, false);
  }
});
test('completed media rewinds using confirmed time and still needs explicit Play', () => {
  const { clock, generation } = playing();
  clock.observe(generation, 10000, 200);
  clock.stateChanged(generation, 'completed');
  assert.equal(clock.requestPlay(), false);
  clock.beginSeek();
  assert.equal(clock.requestPlay(), false);
  clock.endSeek(generation, 0, 300);
  assert.equal(clock.snapshot().safetyGateOpen, false);
  assert.equal(clock.requestPlay(), true);
  clock.stateChanged(generation, 'playing');
  assert.equal(clock.snapshot().safetyGateOpen, true);
  clock.reset();
  clock.endSeek(generation, 0, 400);
  assert.equal(clock.requestPlay(), false);
});
