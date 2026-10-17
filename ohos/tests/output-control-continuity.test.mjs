import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, next) {
  return next(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? specifier + '.ts' : specifier, context);
} });
const { OutputSession } = await import('../entry/src/main/ets/output/OutputSession.ts');
const { MemoryTransport } = await import('../entry/src/main/ets/output/MemoryTransport.ts');
const { defaultFixedContext } = await import('../entry/src/main/ets/output/UpdateContext.ts');
const { copyControlLease, sameControlLease } = await import('../entry/src/main/ets/output/OutputControlContinuity.ts');

const settle = async () => { for (let index = 0; index < 32; index++) await Promise.resolve(); };
class Time {
  now = 100; next = 1; tasks = new Map();
  nowMs() { return this.now; }
  scheduleAt(at, callback) { const id = this.next++; this.tasks.set(id, { at, callback }); return id; }
  cancel(id) { this.tasks.delete(id); }
  async advance(delta) {
    const target = this.now + delta;
    while (true) {
      const next = [...this.tasks].filter(([, task]) => task.at <= target)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      this.now = next[1].at; this.tasks.delete(next[0]); next[1].callback(); await settle();
    }
    this.now = target; await settle();
  }
}
const configuration = (kind = 'fixed', permissions = {}) => ({
  targetId: 'ordinary-control', kind: 'memory',
  protocolProfile: { precision: 4, revision: 1, axisOrder: ['L0'], maximumDurationMs: 10000, maximumPayloadBytes: 1024 },
  axisRanges: [{ axisId: 'L0', minimum: 0, maximum: 1, enabled: true }],
  updateContext: kind === 'fixed' ? defaultFixedContext() : { kind: 'polled' },
  autoConnectPolicy: 'manual', allowPausedAutoHome: false, allowPausedMotion: false, ...permissions
});
const policy = { maximumFrameAgeMs: 750, maximumClockAgeMs: 750, maximumEventAgeMs: 250,
  maximumFixedElapsedMs: 1000, writeTimeoutMs: 100, maximumPolledQueueLength: 4, allowZeroInterval: true };
async function setup(kind = 'fixed', options = {}) {
  const time = new Time(), transport = new MemoryTransport(time);
  const config = options.config ?? configuration(kind, options.permissions);
  const session = new OutputSession(config, policy, transport, time, time);
  assert.equal(await session.connect(), true); session.setMediaState('playing');
  if (options.armed !== false) assert.equal(session.arm(1, 1), true);
  return { time, transport, config, session, kind, sequence: 10 };
}
function leaseFor(s, overrides = {}) {
  return { requestId: 1, sourceIdentity: 'deovr:current', sourceGeneration: 2, epoch: 1,
    profileRevision: 1, startFrameSequence: s.sequence, startSourceConfigurationRevision: 7,
    deadlineMonotonicMs: s.time.now + 5000, ...overrides };
}
function sample(s, options = {}) {
  const sequence = options.sequence ?? ++s.sequence, epoch = options.epoch ?? 1;
  const intents = options.intents ?? ['activePlayback'];
  const frame = { sequence, epoch, profileRevision: options.profileRevision ?? 1,
    monotonicMs: options.monotonicMs ?? s.time.now, mediaPositionMs: 500,
    values: [{ axisId: 'L0', value: options.value ?? 0.5 }],
    events: s.kind === 'fixed' ? [] : [{ eventId: sequence, epoch, sourceFrameSequence: sequence,
      axisId: 'L0', kind: options.eventKind ?? 'script', targetValue: options.value ?? 0.5,
      durationSeconds: 0.1, from: null, to: null, speedLimitUnitsPerSecond: null }] };
  const authorization = { epoch, sourceFrameSequence: sequence, sourceConfigurationRevision: 7,
    authorizedAxes: ['L0'], updateKind: s.kind, intents,
    clockKind: intents.includes('activePlayback') ? 'media' : 'monotonic', observedMonotonicMs: s.time.now,
    ...options.authorization };
  return { frame, authorization };
}
function submit(s, options) { const data = sample(s, options); return s.session.submitFrame(data.frame, data.authorization); }
function complete(s, lease, options) { const data = sample(s, options); return s.session.completeSourceControl(lease, data.frame, data.authorization); }
function pausedFrame(s, lease, options = {}) {
  const data = sample(s, { intents: ['pausedAutoHome'], eventKind: 'autoHome', ...options });
  return s.session.submitSourceControlFrame(lease, data.frame, data.authorization);
}
function park(s, lease, duration = 700) {
  s.session.setMediaState('paused');
  return s.session.parkSourceControl(lease, s.time.now + duration);
}
const writes = s => s.transport.writeRecords();

test('lease copies detach every exact identity field', () => {
  const input = leaseFor({ sequence: 10, time: { now: 100 } }), captured = copyControlLease(input);
  assert.notEqual(captured, input); assert.equal(sameControlLease(captured, input), true);
  for (const key of Object.keys(input)) {
    const changed = { ...input, [key]: typeof input[key] === 'string' ? 'different' : input[key] + 1 };
    assert.equal(sameControlLease(captured, changed), false, key);
  }
  input.sourceIdentity = 'mutated'; assert.equal(captured.sourceIdentity, 'deovr:current');
});

for (const kind of ['fixed', 'polled']) test(`${kind}: control retains the original Arm and requires an actual newer frame`, async () => {
  const s = await setup(kind), lease = leaseFor(s);
  let implicitArmCalls = 0; s.session.arm = () => { implicitArmCalls++; throw new Error('Must not recreate Arm'); };
  assert.equal(s.session.beginSourceControl(lease), true);
  assert.equal(s.session.snapshot().armed, true); assert.equal(s.session.snapshot().controlPending, true);
  assert.equal(s.session.snapshot().seekPending, false);
  assert.equal(complete(s, lease, { sequence: lease.startFrameSequence }), 'ignored');
  assert.equal(submit(s), 'ignored');
  await s.time.advance(40); assert.equal(writes(s).length, 0);
  assert.equal(complete(s, lease), 'accepted'); await s.time.advance(10);
  assert.equal(s.session.snapshot().controlPending, false); assert.equal(s.session.snapshot().armed, true);
  assert.equal(writes(s).length, 1); assert.equal(implicitArmCalls, 0); await s.session.dispose();
});

for (const kind of ['fixed', 'polled']) test(`${kind}: an unarmed or replacement target never acquires control retention`, async () => {
  const s = await setup(kind, { armed: false }), lease = leaseFor(s);
  assert.equal(s.session.beginSourceControl(lease), false); assert.equal(complete(s, lease), 'ignored');
  assert.equal(park(s, lease), false); assert.equal(pausedFrame(s, lease), 'ignored');
  assert.equal(s.session.snapshot().armed, false); assert.equal(writes(s).length, 0); await s.session.dispose();
});

test('pending timeout expires without frames, UI ticks or source refresh', async () => {
  const s = await setup(), lease = leaseFor(s, { deadlineMonotonicMs: s.time.now + 300 });
  assert.equal(s.session.beginSourceControl(lease), true); await s.time.advance(300);
  assert.equal(s.session.snapshot().armed, false); assert.equal(s.session.snapshot().controlPending, false);
  assert.equal(complete(s, lease), 'ignored'); assert.equal(writes(s).length, 0); await s.session.dispose();
});

for (const invalid of ['expired', 'long', 'nan', 'backwards']) test(`invalid pending timing: ${invalid}`, async () => {
  const s = await setup();
  const deadline = invalid === 'expired' ? s.time.now : invalid === 'long' ? s.time.now + 5001 : Number.NaN;
  const lease = leaseFor(s, invalid === 'backwards' ? {} : { deadlineMonotonicMs: deadline });
  if (invalid === 'backwards') {
    assert.equal(s.session.beginSourceControl(lease), true); s.time.now--;
    assert.equal(complete(s, lease), 'ignored');
  } else assert.equal(s.session.beginSourceControl(lease), false);
  assert.equal(s.session.snapshot().armed, false); await s.session.dispose();
});

test('actual current time rejects a completion or renewal before a delayed timer runs', async () => {
  for (const parked of [false, true]) {
    const s = await setup(), lease = leaseFor(s, { deadlineMonotonicMs: s.time.now + 300 });
    s.session.beginSourceControl(lease); if (parked) assert.equal(park(s, lease, 200), true);
    s.time.now += parked ? 200 : 300;
    assert.equal(parked ? s.session.parkSourceControl(lease, s.time.now + 700) : complete(s, lease), parked ? false : 'ignored');
    assert.equal(s.session.snapshot().armed, false); await s.session.dispose();
  }
});

for (const kind of ['fixed', 'polled']) test(`${kind}: pending gate clears queued work and late full receipts cannot update dirty cache`, async () => {
  const s = await setup(kind); s.transport.planWrite({ kind: 'defer' }); assert.equal(submit(s), 'accepted');
  if (kind === 'fixed') await s.time.advance(10);
  assert.equal(submit(s, { value: 0.7 }), 'accepted'); if (kind === 'fixed') await s.time.advance(10);
  assert.equal(s.session.snapshot().inFlight, true);
  assert.equal(kind === 'fixed' ? s.session.snapshot().pendingFixed : s.session.snapshot().queuedEvents > 0, true);
  const lease = leaseFor(s); assert.equal(s.session.beginSourceControl(lease), true);
  assert.equal(s.session.snapshot().pendingFixed, false); assert.equal(s.session.snapshot().queuedEvents, 0);
  s.transport.resolveNextWrite(); await settle();
  assert.equal(s.session.snapshot().completedLocalWrites, 0); assert.deepEqual(s.session.snapshot().lastWritten, []);
  assert.ok(s.session.snapshot().locallyAcceptedBytes > 0); assert.equal(writes(s).length, 1);
  assert.equal(complete(s, lease, { value: 0.7 }), 'accepted'); await s.time.advance(10);
  assert.equal(writes(s).length, 2); assert.equal(s.session.snapshot().completedLocalWrites, 1); await s.session.dispose();
});

test('control suspension preserves successfully completed dirty values without accepting stale receipts', async () => {
  const s = await setup(); submit(s); await s.time.advance(10);
  assert.deepEqual(s.session.snapshot().lastWritten, [{ axisId: 'L0', value: 0.5 }]);
  const lease = leaseFor(s); s.session.beginSourceControl(lease);
  assert.deepEqual(s.session.snapshot().lastWritten, [{ axisId: 'L0', value: 0.5 }]);
  assert.equal(complete(s, lease), 'accepted'); await s.time.advance(10);
  assert.equal(writes(s).length, 1); await s.session.dispose();
});

test('a confirmed partial stream faults during begin and cannot retain Arm', async () => {
  const s = await setup(); s.transport.planWrite({ kind: 'accept', acceptedBytes: 3 }); s.transport.planWrite({ kind: 'defer' });
  submit(s); await s.time.advance(10); assert.equal(writes(s).length, 2);
  assert.equal(s.session.beginSourceControl(leaseFor(s)), false); assert.equal(s.session.snapshot().armed, false);
  assert.equal(s.session.snapshot().connection, 'fault'); assert.equal(s.session.snapshot().controlPending, false);
  s.transport.resolveNextWrite(); await settle(); assert.equal(writes(s).length, 2); await s.session.dispose();
});

for (const kind of ['fixed', 'polled']) for (const receipt of ['partial', 'overdue', 'reject'])
test(`${kind}: late ${receipt} receipt permanently revokes control`, async () => {
  const s = await setup(kind); s.transport.planWrite({ kind: 'defer' }); submit(s);
  if (kind === 'fixed') await s.time.advance(10);
  const lease = leaseFor(s); s.session.beginSourceControl(lease);
  if (receipt === 'overdue') s.time.now += 100;
  if (receipt === 'reject') s.transport.rejectNextWrite(); else s.transport.resolveNextWrite(receipt === 'partial' ? 3 : undefined);
  await settle(); assert.equal(s.session.snapshot().armed, false); assert.equal(s.session.snapshot().connection, 'fault');
  assert.equal(s.session.snapshot().lastErrorCode, receipt === 'overdue' ? 'writeExpired' : 'transportError');
  assert.equal(s.session.snapshot().completedLocalWrites, 0); assert.deepEqual(s.session.snapshot().lastWritten, []);
  assert.equal(complete(s, lease), 'ignored'); assert.equal(writes(s).length, 1); await s.session.dispose();
});

test('old unresolved write timeout remains binding without source ticks', async () => {
  const s = await setup(); s.transport.planWrite({ kind: 'defer' }); submit(s); await s.time.advance(10);
  const lease = leaseFor(s); s.session.beginSourceControl(lease); await s.time.advance(100);
  assert.equal(s.session.snapshot().lastErrorCode, 'writeExpired'); assert.equal(s.session.snapshot().armed, false);
  s.transport.resolveNextWrite(); await settle(); assert.equal(complete(s, lease), 'ignored'); await s.session.dispose();
});

for (const overlap of ['same', 'new']) test(`unresolved ${overlap} request overlap revokes rather than transfers Arm`, async () => {
  const s = await setup(), lease = leaseFor(s); s.session.beginSourceControl(lease);
  assert.equal(s.session.beginSourceControl(overlap === 'same' ? lease : { ...lease, requestId: 2 }), false);
  assert.equal(s.session.snapshot().armed, false); assert.equal(complete(s, lease), 'ignored'); await s.session.dispose();
});

for (const kind of ['fixed', 'polled']) test(`${kind}: retain-only parking admits no frame, expires independently, and cannot be bypassed`, async () => {
  const s = await setup(kind), lease = leaseFor(s); s.session.beginSourceControl(lease);
  assert.equal(park(s, lease, 300), true); assert.equal(s.session.snapshot().controlParked, true);
  assert.equal(s.session.snapshot().controlPending, false); assert.equal(s.session.snapshot().seekPending, false);
  assert.equal(submit(s, { intents: ['pausedAutoHome'], eventKind: 'autoHome' }), 'ignored');
  assert.equal(s.session.arm(1, 1), false); await s.time.advance(300);
  assert.equal(s.session.snapshot().armed, false); assert.equal(s.session.snapshot().controlParked, false);
  assert.equal(s.session.parkSourceControl(lease, s.time.now + 700), false);
  assert.equal(writes(s).length, 0); await s.session.dispose();
});

test('fresh park renewal invalidates old timer callbacks and may outlive the pending deadline', async () => {
  const s = await setup(), lease = leaseFor(s, { deadlineMonotonicMs: s.time.now + 100 });
  s.session.beginSourceControl(lease); const pendingCallback = [...s.time.tasks.values()][0].callback;
  assert.equal(park(s, lease, 300), true); const oldCallback = [...s.time.tasks.values()][0].callback;
  await s.time.advance(200); assert.equal(s.session.parkSourceControl(lease, s.time.now + 700), true);
  pendingCallback(); oldCallback(); assert.equal(s.session.snapshot().armed, true);
  await s.time.advance(699); assert.equal(s.session.snapshot().armed, true);
  await s.time.advance(1); assert.equal(s.session.snapshot().armed, false); await s.session.dispose();
});

for (const expiry of ['tooFar', 'now', 'nan']) test(`park rejects ${expiry} proof expiry`, async () => {
  const s = await setup(), lease = leaseFor(s); s.session.beginSourceControl(lease); s.session.pause();
  const until = expiry === 'tooFar' ? s.time.now + 751 : expiry === 'now' ? s.time.now : Number.NaN;
  assert.equal(s.session.parkSourceControl(lease, until), false); assert.equal(s.session.snapshot().armed, false); await s.session.dispose();
});

for (const kind of ['fixed', 'polled']) test(`${kind}: separately allowed real paused Home frame sends under the parked identity`, async () => {
  const s = await setup(kind, { permissions: { allowPausedAutoHome: true } }), lease = leaseFor(s);
  s.session.beginSourceControl(lease); park(s, lease);
  assert.equal(pausedFrame(s, lease), 'accepted'); await s.time.advance(10);
  assert.equal(writes(s).length, 1); assert.equal(s.session.snapshot().controlParked, true);
  assert.equal(s.session.snapshot().armed, true); await s.session.dispose();
});

for (const kind of ['fixed', 'polled']) test(`${kind}: paused Motion uses existing fixed/event rules without inventing events`, async () => {
  const s = await setup(kind, { permissions: { allowPausedMotion: true } }), lease = leaseFor(s);
  s.session.beginSourceControl(lease); park(s, lease);
  assert.equal(pausedFrame(s, lease, { intents: ['pausedMotion'], eventKind: 'script' }), 'accepted');
  await s.time.advance(10); assert.equal(writes(s).length, kind === 'fixed' ? 1 : 0); await s.session.dispose();
});

for (const intent of ['pausedAutoHome', 'pausedMotion', 'pausedManual', 'activePlayback'])
test(`parking cannot grant unpermitted ${intent} output`, async () => {
  const s = await setup('fixed', { permissions: { allowPausedManual: true } }), lease = leaseFor(s);
  s.session.beginSourceControl(lease); park(s, lease);
  assert.equal(pausedFrame(s, lease, { intents: [intent] }), 'ignored');
  assert.equal(s.session.snapshot().armed, false); assert.equal(writes(s).length, 0); await s.session.dispose();
});

test('new explicit control from fresh parking preserves intent while unsolicited Play revokes it', async () => {
  const s = await setup(), lease = leaseFor(s); s.session.beginSourceControl(lease); park(s, lease);
  const next = leaseFor(s, { requestId: 2 }); assert.equal(s.session.beginSourceControl(next), true);
  s.session.setMediaState('playing'); assert.equal(complete(s, lease), 'ignored');
  assert.equal(s.session.snapshot().controlPending, true); assert.equal(s.session.snapshot().armed, true);
  assert.equal(complete(s, next), 'accepted'); await s.time.advance(10); assert.equal(writes(s).length, 1);
  const third = leaseFor(s, { requestId: 3 }); s.session.beginSourceControl(third); park(s, third);
  s.session.setMediaState('playing'); assert.equal(s.session.snapshot().armed, false);
  assert.equal(complete(s, third), 'ignored'); await s.session.dispose();
});

test('new explicit paused Speed can begin from parking but overlapping frame-wait cannot', async () => {
  const s = await setup(), lease = leaseFor(s); s.session.beginSourceControl(lease); park(s, lease);
  const next = leaseFor(s, { requestId: 2 }); assert.equal(s.session.beginSourceControl(next), true);
  assert.equal(s.session.snapshot().armed, true); assert.equal(s.session.snapshot().controlPending, true);
  assert.equal(s.session.beginSourceControl({ ...next, requestId: 3 }), false);
  assert.equal(s.session.snapshot().armed, false); await s.session.dispose();
});

test('caller mutation cannot replace the captured lease or its expiry', async () => {
  const s = await setup(), lease = leaseFor(s), original = { ...lease };
  s.session.beginSourceControl(lease); lease.deadlineMonotonicMs += 1000;
  assert.equal(complete(s, original), 'accepted'); await s.time.advance(10);
  assert.equal(s.session.snapshot().armed, true); await s.session.dispose();
});

for (const change of [{ sourceIdentity: 'other' }, { sourceGeneration: 99 }, { epoch: 2 }, { profileRevision: 2 },
  { startFrameSequence: 0 }, { startSourceConfigurationRevision: 0 }, { deadlineMonotonicMs: 9999 }, { requestId: 2 }])
test(`exact lease rejects changed ${Object.keys(change)[0]}`, async () => {
  const s = await setup(), lease = leaseFor(s); s.session.beginSourceControl(lease);
  assert.equal(complete(s, { ...lease, ...change }), 'ignored'); assert.equal(s.session.snapshot().armed, false);
  assert.equal(writes(s).length, 0); await s.session.dispose();
});

for (const kind of ['fixed', 'polled']) for (const change of ['scope', 'mode', 'revision', 'epoch', 'profile', 'stale', 'payload', 'intent'])
test(`${kind}: completion preserves normal ${change} validation`, async () => {
  const s = await setup(kind), lease = leaseFor(s); s.session.beginSourceControl(lease);
  const options = change === 'scope' ? { authorization: { authorizedAxes: ['R0'] } }
    : change === 'mode' ? { authorization: { updateKind: kind === 'fixed' ? 'polled' : 'fixed' } }
    : change === 'revision' ? { authorization: { sourceConfigurationRevision: 6 } }
    : change === 'epoch' ? { epoch: 2 } : change === 'profile' ? { profileRevision: 2 }
    : change === 'stale' ? { monotonicMs: 0 } : change === 'payload' ? { value: Number.NaN }
    : { intents: ['pausedMotion'] };
  if (change === 'stale') s.time.now += 800;
  assert.notEqual(complete(s, lease, options), 'accepted'); assert.equal(s.session.snapshot().armed, false, change);
  assert.equal(writes(s).length, 0); await s.session.dispose();
});

for (const parked of [false, true]) for (const revoke of ['stop', 'disarm', 'background', 'disconnect', 'dispose', 'epoch', 'reconfigure', 'error', 'seek'])
test(`${parked ? 'parked' : 'pending'}: ${revoke} permanently clears retention`, async () => {
  const s = await setup(), lease = leaseFor(s); s.session.beginSourceControl(lease); if (parked) park(s, lease);
  if (revoke === 'stop') s.session.stop();
  if (revoke === 'disarm') s.session.disarm();
  if (revoke === 'background') { s.session.setForeground(false); await settle(); s.session.setForeground(true); }
  if (revoke === 'disconnect') { await s.session.disconnect(); assert.equal(await s.session.connect(), true); }
  if (revoke === 'dispose') await s.session.dispose();
  if (revoke === 'epoch') s.session.invalidateEpoch(2);
  if (revoke === 'reconfigure') s.session.reconfigure({ ...s.config, protocolProfile: { ...s.config.protocolProfile, revision: 2 } });
  if (revoke === 'error') s.transport.emit({ kind: 'error', connectionGeneration: s.session.snapshot().connectionGeneration });
  if (revoke === 'seek') assert.equal(s.session.beginSourceSeek({ requestId: 1, sourceIdentity: lease.sourceIdentity,
    sourceGeneration: lease.sourceGeneration, previousEpoch: 1, currentEpoch: 2, profileRevision: 1,
    deadlineMonotonicMs: s.time.now + 300, status: 'pending' }), false);
  assert.equal(s.session.snapshot().armed, false); assert.equal(s.session.snapshot().controlPending, false);
  assert.equal(s.session.snapshot().controlParked, false); assert.equal(complete(s, lease), 'ignored');
  assert.equal(s.session.parkSourceControl(lease, s.time.now + 700), false); assert.equal(writes(s).length, 0);
  await s.session.dispose();
});

test('ordinary control cannot adopt an existing pending native seek', async () => {
  const s = await setup(); assert.equal(s.session.beginSourceSeek({ requestId: 1, sourceIdentity: 'native',
    sourceGeneration: 2, previousEpoch: 1, currentEpoch: 2, profileRevision: 1,
    deadlineMonotonicMs: s.time.now + 300, status: 'pending' }), true);
  assert.equal(s.session.beginSourceControl(leaseFor(s, { epoch: 2 })), false);
  assert.equal(s.session.snapshot().armed, false); assert.equal(s.session.snapshot().seekPending, false); await s.session.dispose();
});

for (const parked of [false, true]) test(`range-only edit cannot bypass ${parked ? 'parked' : 'pending'} control identity`, async () => {
  const s = await setup(), lease = leaseFor(s); s.session.beginSourceControl(lease); if (parked) park(s, lease);
  assert.equal(s.session.updateRanges([{ axisId: 'L0', minimum: 0.1, maximum: 0.9, enabled: true }], 1, s.sequence), false);
  assert.equal(s.session.snapshot().armed, true); s.session.disarm();
  assert.equal(s.session.updateRanges([{ axisId: 'L0', minimum: 0.1, maximum: 0.9, enabled: true }], 1, s.sequence), true);
  assert.equal(s.session.snapshot().armed, false); await s.session.dispose();
});

test('consumed request ID cannot suspend an already resumed output a second time', async () => {
  const s = await setup(), lease = leaseFor(s); s.session.beginSourceControl(lease); complete(s, lease);
  assert.equal(s.session.beginSourceControl(lease), false); assert.equal(s.session.snapshot().armed, false);
  await s.time.advance(10); assert.equal(writes(s).length, 0); await s.session.dispose();
});

test('an unarmed start consumes its token so later explicit Arm cannot join the old transaction', async () => {
  const s = await setup('fixed', { armed: false }), lease = leaseFor(s);
  assert.equal(s.session.beginSourceControl(lease), false); assert.equal(s.session.arm(1, 1), true);
  assert.equal(s.session.beginSourceControl(lease), false); assert.equal(s.session.snapshot().armed, false);
  assert.equal(complete(s, lease), 'ignored'); await s.session.dispose();
});

for (const kind of ['fixed', 'polled']) for (const receipt of ['full', 'partial'])
test(`${kind}: parking renewal invalidates ${receipt} receipts from previously authorized paused work`, async () => {
  const s = await setup(kind, { permissions: { allowPausedAutoHome: true } }), lease = leaseFor(s);
  s.session.beginSourceControl(lease); park(s, lease);
  s.transport.planWrite({ kind: 'defer' }); assert.equal(pausedFrame(s, lease), 'accepted');
  if (kind === 'fixed') await s.time.advance(10);
  assert.equal(park(s, lease), true); s.transport.resolveNextWrite(receipt === 'partial' ? 3 : undefined); await settle();
  assert.equal(s.session.snapshot().completedLocalWrites, 0); assert.deepEqual(s.session.snapshot().lastWritten, []);
  assert.equal(s.session.snapshot().armed, receipt === 'full'); assert.equal(writes(s).length, 1);
  if (receipt === 'full') {
    assert.equal(pausedFrame(s, lease), 'accepted'); await s.time.advance(10); assert.equal(writes(s).length, 2);
  } else assert.equal(s.session.snapshot().connection, 'fault');
  await s.session.dispose();
});

for (const kind of ['fixed', 'polled']) test(`${kind}: a delayed park expiry blocks stale candidates at receipt time`, async () => {
  const s = await setup(kind, { permissions: { allowPausedAutoHome: true } }), lease = leaseFor(s);
  s.session.beginSourceControl(lease); park(s, lease, 40); s.transport.planWrite({ kind: 'defer' }); pausedFrame(s, lease);
  if (kind === 'fixed') await s.time.advance(10);
  pausedFrame(s, lease, { value: 0.8 }); if (kind === 'fixed') await s.time.advance(10);
  s.time.now = 140; s.transport.resolveNextWrite(); await settle();
  assert.equal(s.session.snapshot().armed, false); assert.equal(s.session.snapshot().controlParked, false);
  assert.equal(s.session.snapshot().completedLocalWrites, 0); assert.deepEqual(s.session.snapshot().lastWritten, []);
  assert.equal(writes(s).length, 1); await s.session.dispose();
});

test('a park renewal that invalidates a confirmed partial prefix must fail and retain close quarantine', async () => {
  const s = await setup('fixed', { permissions: { allowPausedAutoHome: true } }), lease = leaseFor(s);
  s.session.beginSourceControl(lease); park(s, lease);
  s.transport.planWrite({ kind: 'accept', acceptedBytes: 3 }); s.transport.planWrite({ kind: 'defer' });
  pausedFrame(s, lease); await s.time.advance(10); s.transport.rejectClose = true;
  assert.equal(park(s, lease), false); await settle();
  assert.equal(s.session.snapshot().armed, false); assert.equal(s.session.snapshot().closeConfirmed, false);
  assert.equal(await s.session.connect(), false); s.transport.resolveNextWrite(); await settle();
  assert.equal(s.session.snapshot().closeConfirmed, false); assert.equal(s.session.snapshot().controlParked, false);
  await s.session.dispose();
});

test('old parked receipt cannot commit dirty state or pump old work after the next explicit Play', async () => {
  const s = await setup('fixed', { permissions: { allowPausedAutoHome: true } }), lease = leaseFor(s);
  s.session.beginSourceControl(lease); park(s, lease); s.transport.planWrite({ kind: 'defer' });
  pausedFrame(s, lease); await s.time.advance(10);
  const next = leaseFor(s, { requestId: 2 }); assert.equal(s.session.beginSourceControl(next), true);
  s.session.setMediaState('playing'); assert.equal(complete(s, next, { value: 0.9 }), 'accepted');
  s.transport.resolveNextWrite(); await settle(); assert.equal(s.session.snapshot().completedLocalWrites, 0);
  assert.deepEqual(s.session.snapshot().lastWritten, []); await s.time.advance(10);
  assert.equal(writes(s).length, 2); assert.deepEqual(s.session.snapshot().lastWritten, [{ axisId: 'L0', value: 0.9 }]);
  await s.session.dispose();
});

test('pending source freshness independently expires at 750 ms with no UI ticks', async () => {
  const s = await setup(), lease = leaseFor(s); assert.equal(s.session.beginSourceControl(lease), true);
  await s.time.advance(749); assert.equal(s.session.snapshot().armed, true);
  await s.time.advance(1); assert.equal(s.session.snapshot().armed, false);
  assert.equal(s.session.renewSourceControl(lease, s.time.now + 750), false);
  assert.equal(complete(s, lease), 'ignored'); assert.equal(writes(s).length, 0); await s.session.dispose();
});

test('owner can immediately shorten pending freshness to the actual pre-control observation deadline', async () => {
  const s = await setup(), lease = leaseFor(s); s.session.beginSourceControl(lease);
  assert.equal(s.session.renewSourceControl(lease, s.time.now + 120), true);
  await s.time.advance(120); assert.equal(s.session.snapshot().armed, false);
  assert.equal(s.session.renewSourceControl(lease, s.time.now + 750), false); await s.session.dispose();
});

test('fresh pending observations may renew up to the original five-second absolute deadline', async () => {
  const s = await setup(), lease = leaseFor(s); s.session.beginSourceControl(lease);
  const staleTimer = [...s.time.tasks.values()][0].callback;
  for (let index = 0; index < 7; index++) {
    await s.time.advance(700);
    assert.equal(s.session.snapshot().armed, true);
    assert.equal(s.session.renewSourceControl(lease, Math.min(s.time.now + 750, lease.deadlineMonotonicMs)), true);
  }
  staleTimer(); assert.equal(s.session.snapshot().armed, true);
  assert.equal(s.session.snapshot().controlPending, true); assert.equal(writes(s).length, 0);
  await s.time.advance(100); assert.equal(s.session.snapshot().armed, false);
  assert.equal(s.session.renewSourceControl(lease, s.time.now + 1), false); await s.session.dispose();
});

test('a delayed pending timer cannot be bypassed by renewal after the former freshness expiry', async () => {
  const s = await setup(), lease = leaseFor(s); s.session.beginSourceControl(lease);
  s.time.now += 750;
  assert.equal(s.session.renewSourceControl(lease, s.time.now + 750), false);
  assert.equal(s.session.snapshot().armed, false); assert.equal(complete(s, lease), 'ignored'); await s.session.dispose();
});

for (const invalid of ['tooFar', 'absolute', 'now', 'nan', 'identity'])
test(`pending renewal rejects ${invalid} evidence`, async () => {
  const s = await setup(), lease = leaseFor(s, invalid === 'absolute' ? { deadlineMonotonicMs: s.time.now + 300 } : {});
  s.session.beginSourceControl(lease);
  const expiry = invalid === 'tooFar' ? s.time.now + 751 : invalid === 'absolute' ? s.time.now + 301
    : invalid === 'now' ? s.time.now : invalid === 'nan' ? Number.NaN : s.time.now + 750;
  assert.equal(s.session.renewSourceControl(invalid === 'identity' ? { ...lease, sourceGeneration: 3 } : lease, expiry), false);
  assert.equal(s.session.snapshot().armed, false); await s.session.dispose();
});

test('pending renewal never turns a completed parked control back into pending', async () => {
  const s = await setup(), lease = leaseFor(s); s.session.beginSourceControl(lease); park(s, lease, 400);
  assert.equal(s.session.renewSourceControl(lease, s.time.now + 750), false);
  assert.equal(s.session.snapshot().armed, true); assert.equal(s.session.snapshot().controlParked, true);
  await s.time.advance(400); assert.equal(s.session.snapshot().armed, false); await s.session.dispose();
});

test('frequent authorized paused Motion frames do not starve a slower fixed output cadence', async () => {
  const config = configuration('fixed', { allowPausedMotion: true });
  config.updateContext = { ...config.updateContext, intervalMs: 200, maximumIntervalMs: 1000 };
  const s = await setup('fixed', { config }), lease = leaseFor(s);
  s.session.beginSourceControl(lease); park(s, lease);
  assert.equal(pausedFrame(s, lease, { intents: ['pausedMotion'], value: 0.1 }), 'accepted');
  for (let observation = 1; observation <= 10; observation++) {
    await s.time.advance(50);
    assert.equal(s.session.renewParkedSourceControl(lease, s.time.now + 750), true);
    assert.equal(pausedFrame(s, lease, { intents: ['pausedMotion'], value: 0.1 + observation / 100 }), 'accepted');
  }
  assert.deepEqual(writes(s).map(write => write.startedMonotonicMs), [300, 500]);
  assert.equal(s.session.snapshot().armed, true); assert.equal(s.session.snapshot().controlParked, true);
  assert.equal(s.session.snapshot().completedLocalWrites, 2); await s.session.dispose();
});

test('retain-only parking still clears candidate and stops a running cadence after activity ends', async () => {
  const config = configuration('fixed', { allowPausedMotion: true });
  config.updateContext = { ...config.updateContext, intervalMs: 200, maximumIntervalMs: 1000 };
  const s = await setup('fixed', { config }), lease = leaseFor(s);
  s.session.beginSourceControl(lease); park(s, lease); pausedFrame(s, lease, { intents: ['pausedMotion'] });
  await s.time.advance(50); assert.equal(s.session.renewParkedSourceControl(lease, s.time.now + 750), true);
  pausedFrame(s, lease, { intents: ['pausedMotion'], value: 0.8 });
  assert.equal(park(s, lease), true); await s.time.advance(250);
  assert.equal(writes(s).length, 0); assert.equal(s.session.snapshot().armed, true);
  // Proof renewal alone does not start a scheduler or authorize an old scalar.
  assert.equal(s.session.renewParkedSourceControl(lease, s.time.now + 750), true);
  await s.time.advance(250); assert.equal(writes(s).length, 0); await s.session.dispose();
});

test('parked freshness renewal cannot create parking or output while control is pending', async () => {
  const s = await setup('fixed', { permissions: { allowPausedMotion: true } });
  submit(s); const lease = leaseFor(s); assert.equal(s.session.beginSourceControl(lease), true); s.session.pause();
  assert.equal(s.session.renewParkedSourceControl(lease, s.time.now + 750), false);
  assert.equal(s.session.snapshot().controlPending, true); assert.equal(s.session.snapshot().controlParked, false);
  await s.time.advance(100); assert.equal(writes(s).length, 0); await s.session.dispose();
});

for (const invalid of ['identity', 'expiry', 'tooFar', 'nan'])
test(`invalid ${invalid} parked renewal clears a previously authorized candidate`, async () => {
  const s = await setup('fixed', { permissions: { allowPausedMotion: true } }), lease = leaseFor(s);
  s.session.beginSourceControl(lease); park(s, lease); pausedFrame(s, lease, { intents: ['pausedMotion'] });
  const until = invalid === 'expiry' ? s.time.now : invalid === 'tooFar' ? s.time.now + 751
    : invalid === 'nan' ? Number.NaN : s.time.now + 750;
  assert.equal(s.session.renewParkedSourceControl(invalid === 'identity' ? { ...lease, sourceGeneration: 3 } : lease, until), false);
  assert.equal(s.session.snapshot().armed, false); await s.time.advance(10);
  assert.equal(writes(s).length, 0); await s.session.dispose();
});

test('parked renewal cannot revive expired parking when its expiry callback is delayed', async () => {
  const s = await setup(), lease = leaseFor(s); s.session.beginSourceControl(lease); park(s, lease, 120);
  s.time.now += 120;
  assert.equal(s.session.renewParkedSourceControl(lease, s.time.now + 750), false);
  assert.equal(s.session.snapshot().armed, false); await s.session.dispose();
});

for (const kind of ['fixed', 'polled']) test(`${kind}: authorized parked renewal leaves valid in-flight work and cache accounting intact`, async () => {
  const s = await setup(kind, { permissions: { allowPausedAutoHome: true } }), lease = leaseFor(s);
  s.session.beginSourceControl(lease); park(s, lease); s.transport.planWrite({ kind: 'defer' });
  pausedFrame(s, lease); if (kind === 'fixed') await s.time.advance(10);
  assert.equal(s.session.renewParkedSourceControl(lease, s.time.now + 750), true);
  s.transport.resolveNextWrite(); await settle();
  assert.equal(s.session.snapshot().armed, true); assert.equal(s.session.snapshot().completedLocalWrites, 1);
  assert.deepEqual(s.session.snapshot().lastWritten, [{ axisId: 'L0', value: 0.5 }]); await s.session.dispose();
});
