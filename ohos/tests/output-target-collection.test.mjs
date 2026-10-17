import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s, c, n) { return n(s.startsWith('.') && !/\.[a-z]+$/i.test(s) ? s + '.ts' : s, c); } });
const { OutputTargetCollection } = await import('../entry/src/main/ets/output/OutputTargetCollection.ts');
const { OutputCoordinator, OutputEndpoint } = await import('../entry/src/main/ets/output/OutputCoordinator.ts');
const { MemoryTransport } = await import('../entry/src/main/ets/output/MemoryTransport.ts');
const { defaultFixedContext } = await import('../entry/src/main/ets/output/UpdateContext.ts');

const settle = async () => { for (let n = 0; n < 40; n++) await Promise.resolve(); };
class Time {
  now = 0; next = 1; tasks = new Map();
  nowMs() { return this.now; }
  scheduleAt(at, fn) { const id = this.next++; this.tasks.set(id, { at, fn }); return id; }
  cancel(id) { this.tasks.delete(id); }
  async advance(ms) {
    const target = this.now + ms;
    while (true) {
      const next = [...this.tasks].filter(([, value]) => value.at <= target).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      this.now = next[1].at; this.tasks.delete(next[0]); next[1].fn(); await settle();
    }
    this.now = target; await settle();
  }
}
/** Exercise the real TransportPort.close contract without inventing a port API. */
class DeferredCloseTransport extends MemoryTransport {
  deferClose = true;
  pendingCloses = [];
  close(reason, generation) {
    if (!this.deferClose) return super.close(reason, generation);
    return new Promise((resolve, reject) => this.pendingCloses.push({ reason, generation, resolve, reject }));
  }
  resolveNextClose() {
    const next = this.pendingCloses.shift();
    assert.ok(next, 'a real transport close must have been requested');
    super.close(next.reason, next.generation).then(next.resolve, next.reject);
  }
}
const policy = { maximumFrameAgeMs: 200, maximumClockAgeMs: 200, maximumEventAgeMs: 100,
  maximumFixedElapsedMs: 1000, writeTimeoutMs: 100, maximumPolledQueueLength: 4, allowZeroInterval: true };
function config(id, kind = id === 'b' ? 'polled' : 'fixed', axis = id === 'b' ? 'R0' : 'L0') {
  return { targetId: id, kind: 'memory', protocolProfile: { precision: 4, revision: 1, axisOrder: ['L0', 'R0'],
    maximumDurationMs: 10000, maximumPayloadBytes: 1024 },
    axisRanges: [{ axisId: 'L0', minimum: .2, maximum: .6, enabled: axis === 'L0' },
      { axisId: 'R0', minimum: .6, maximum: 1, enabled: axis === 'R0' }],
    updateContext: kind === 'fixed' ? defaultFixedContext() : { kind: 'polled' },
    autoConnectPolicy: 'automaticRequested', allowPausedAutoHome: false, allowPausedMotion: false };
}
function publish(s, epoch = 1, values = [.5, .75]) {
  const sequence = ++s.sequence;
  const frame = { sequence, epoch, profileRevision: 1, monotonicMs: s.time.now, mediaPositionMs: 500,
    axisStates: ['L0', 'R0'].map((axisName, index) => ({ axisName, value: values[index] })),
    events: ['L0', 'R0'].map((axisName, index) => ({ eventId: sequence * 2 + index, epoch,
      sourceFrameSequence: sequence, axisName, kind: 'script', targetValue: values[index], durationSeconds: .1,
      from: null, to: null, speedLimitUnitsPerSecond: null })) };
  s.source.value = { ...s.source.value, frame, availability: 'ready', mediaState: 'playing',
    authorization: { epoch, sourceFrameSequence: sequence, sourceConfigurationRevision: epoch,
      updateKind: 'fixed', authorizedAxes: ['L0', 'R0'], intents: ['activePlayback'], clockKind: 'media',
      observedMonotonicMs: s.time.now } };
}
function setup(createPort = (_id, time) => new MemoryTransport(time)) {
  const s = { time: new Time(), sequence: 0, created: [], requests: [], ports: new Map(),
    source: { value: { sourceIdentity: 'video:A', sourceGeneration: 1, foreground: true, faulted: false } } };
  publish(s);
  s.collection = new OutputTargetCollection(id => {
    s.created.push(id);
    const source = { dispatchSource(scope, kind) {
      s.requests.push({ id, scope: scope.slice(), kind });
      const value = s.source.value;
      return { ...value, authorization: value.authorization === null ? null :
        { ...value.authorization, authorizedAxes: scope.slice(), updateKind: kind } };
    } };
    return new OutputCoordinator({ inspect: () => ({ available: true, diagnostic: 'simulation' }), create: () => {
      const port = createPort(id, s.time);
      const ports = s.ports.get(id) ?? []; ports.push(port); s.ports.set(id, ports); return port;
    } }, source, policy, s.time, s.time);
  });
  return s;
}
async function connected(s, ids = ['a', 'b'], armed = ids) {
  for (const id of ids) {
    s.collection.add(id);
    assert.equal(await s.collection.connect(config(id), new OutputEndpoint()), true);
    if (armed.includes(id)) { s.collection.select(id); assert.equal(s.collection.arm(), true); }
  }
}
const port = (s, id) => s.ports.get(id).at(-1);
const bytes = p => p.writeRecords().map(record => String.fromCharCode(...record.bytes));
function pending(s) {
  const transition = { requestId: 1, sourceIdentity: 'video:A', sourceGeneration: 1, previousEpoch: 1,
    currentEpoch: 2, profileRevision: 1, deadlineMonotonicMs: s.time.now + 300, status: 'pending' };
  s.source.value = { ...s.source.value, seekTransition: transition, authorization: null, availability: 'invalidated', mediaState: 'paused' };
  return transition;
}
function confirm(s, transition) {
  s.source.value = { ...s.source.value, seekTransition: { ...transition, status: 'confirmed' } };
  publish(s, transition.currentEpoch, [.8, .25]);
}

test('empty facade is inert; stable target identities and selection never construct a transport', async () => {
  const s = setup(), c = s.collection;
  assert.deepEqual(c.ids(), []); assert.equal(c.selectedId(), null); assert.equal(c.selected(), null);
  assert.equal(c.status(), null); assert.equal(c.configuration(), null); assert.equal(c.message(), '');
  assert.equal(c.isBusy(), false); assert.equal(c.appliedConfigurationId(), 0); assert.equal(c.arm(), false);
  assert.equal(c.inspect('memory').available, false); assert.equal(c.get('absent'), null);
  assert.equal(c.select('absent'), false); assert.equal(await c.remove('absent'), false);
  assert.equal(await c.connect(config('absent'), new OutputEndpoint()), false);
  await c.disconnect(); c.refresh(); c.stop(); c.disarm(); c.beginSourceSeek();
  c.add('a'); const first = c.get('a'); c.add('b'); c.add('a');
  assert.deepEqual(s.created, ['a', 'b']); assert.deepEqual(c.ids(), ['a', 'b']); assert.equal(c.selectedId(), 'a');
  assert.equal(c.get('a'), first); assert.notEqual(c.get('b'), first); assert.equal(c.select('b'), true);
  assert.equal(c.selected(), c.get('b')); assert.equal(c.select('unknown'), false); assert.equal(c.selectedId(), 'b');
  c.ids().splice(0); assert.deepEqual(c.ids(), ['a', 'b']); assert.equal(s.ports.size, 0); assert.equal(s.requests.length, 0);
  assert.throws(() => c.add(' '), /stable identifier/);
  assert.equal(await c.dispose(), true); assert.equal(c.selectedId(), null); assert.throws(() => c.add('c'), /disposed/);
});

test('fixed and polled targets keep independent scopes, ranges, configuration, and selection', async () => {
  const s = setup(), c = s.collection;
  await connected(s);
  c.select('a'); c.refresh(); await settle();
  assert.deepEqual(bytes(port(s, 'b')), ['R08999I100\n']); assert.deepEqual(bytes(port(s, 'a')), []);
  assert.equal(c.configuration().targetId, 'a'); assert.ok(c.appliedConfigurationId() > 0);
  c.select('b'); await s.time.advance(10);
  assert.deepEqual(bytes(port(s, 'a')), ['L04000I10\n']);
  for (const id of ['a', 'b']) assert.equal(c.get(id).status().armed, true);
  assert.ok(s.requests.filter(request => request.id === 'a').every(request => request.kind === 'fixed' && request.scope.join() === 'L0'));
  assert.ok(s.requests.filter(request => request.id === 'b').every(request => request.kind === 'polled' && request.scope.join() === 'R0'));
  publish(s, 1, [.25, .5]); c.refresh(); await s.time.advance(10);
  assert.equal(port(s, 'a').writeRecords().length, 2); assert.equal(port(s, 'b').writeRecords().length, 2);
  await c.disconnect(); assert.equal(c.get('b').status().connection, 'disconnected');
  assert.equal(c.get('a').status().connection, 'connected'); assert.equal(c.get('a').status().armed, true);
  assert.equal(await c.dispose(), true);
});

test('connect routes by configuration id and a late selected-target completion never changes selection', async () => {
  const s = setup((id, time) => { const p = new MemoryTransport(time); p.deferOpen = id === 'a'; return p; }), c = s.collection;
  c.add('a'); c.add('b'); c.select('b');
  const connecting = c.connect(config('a'), new OutputEndpoint());
  assert.equal(c.get('a').status().connection, 'connecting'); assert.equal(c.status(), null);
  assert.equal(c.isBusy(), false); assert.equal(c.appliedConfigurationId(), 0); assert.equal(s.ports.has('b'), false);
  c.select('a'); assert.equal(c.isBusy(), true); c.select('b');
  port(s, 'a').resolveNextOpen(); assert.equal(await connecting, true);
  assert.equal(c.selectedId(), 'b'); assert.equal(c.appliedConfigurationId(), 0); assert.equal(c.get('a').status().armed, false);
  assert.equal(await c.connect(config('unknown'), new OutputEndpoint()), false);
  assert.equal(s.created.length, 2); assert.equal(await c.dispose(), true);
});

test('a background interruption at the connect promise boundary cannot report a successful connection', async () => {
  const s = setup(), c = s.collection; c.add('a');
  const target = c.get('a'), connect = target.connect.bind(target);
  target.connect = async (...args) => {
    const connected = await connect(...args);
    c.setForeground(false); c.setForeground(true);
    return connected;
  };
  assert.equal(await c.connect(config('a'), new OutputEndpoint()), false);
  assert.equal(target.status().connection, 'disconnected'); assert.equal(c.appliedConfigurationId(), 0);
  assert.equal(await c.dispose(), true);
});

for (const action of ['stop', 'disarm']) test(`${action} closes every gate and old write receipts cannot pump queued candidates`, async () => {
  const s = setup(), c = s.collection;
  await connected(s);
  for (const id of ['a', 'b']) port(s, id).planWrite({ kind: 'defer' });
  c.refresh(); await s.time.advance(10); publish(s, 1, [.2, .6]); c.refresh(); await s.time.advance(10);
  assert.equal(c.get('a').status().pendingFixed, true); assert.ok(c.get('b').status().queuedEvents > 0);
  c.select('a'); c[action]();
  for (const id of ['a', 'b']) {
    assert.equal(c.get(id).status().armed, false); assert.equal(c.get(id).status().pendingFixed, false);
    assert.equal(c.get(id).status().queuedEvents, 0); port(s, id).resolveNextWrite();
  }
  await settle(); publish(s); c.refresh(); await s.time.advance(10);
  for (const id of ['a', 'b']) {
    assert.equal(port(s, id).writeRecords().length, 1); assert.equal(c.get(id).status().completedLocalWrites, 0);
  }
  assert.equal(await c.dispose(), true);
});

test('background closes unselected targets and cancels pending opens; newly added targets inherit background', async () => {
  const s = setup((id, time) => { const p = new MemoryTransport(time); p.deferOpen = id === 'b'; return p; }), c = s.collection;
  await connected(s, ['a']); c.add('b'); const connecting = c.connect(config('b'), new OutputEndpoint());
  c.setForeground(false); c.add('c'); await settle();
  assert.equal(c.get('a').status().armed, false); assert.equal(c.get('a').status().connection, 'disconnected');
  assert.equal(await c.get('c').connect(config('c'), new OutputEndpoint()), false);
  assert.equal(await c.connect(config('c'), new OutputEndpoint()), false); assert.equal(s.ports.has('c'), false);
  port(s, 'b').resolveNextOpen(); assert.equal(await connecting, false); assert.equal(c.get('b').status().closeConfirmed, true);
  c.setForeground(true); await settle();
  for (const id of ['a', 'b']) { assert.equal(c.get(id).status().armed, false); assert.equal(c.get(id).status().connection, 'disconnected'); }
  assert.equal(c.get('c').status(), null); assert.equal(s.ports.size, 2); assert.equal(await c.dispose(), true);
});

test('source seek fans out to both update modes and preserves only each target previously armed', async () => {
  const s = setup(), c = s.collection;
  await connected(s, ['a', 'b', 'c'], ['a', 'b']);
  for (const id of ['a', 'b']) port(s, id).planWrite({ kind: 'defer' });
  c.refresh(); await s.time.advance(10); const transition = pending(s);
  c.select('c'); c.beginSourceSeek();
  for (const id of ['a', 'b']) { assert.equal(c.get(id).status().armed, true); assert.equal(c.get(id).status().seekPending, true); }
  assert.equal(c.get('c').status().armed, false); assert.equal(c.get('c').status().seekPending, false);
  for (const id of ['a', 'b']) port(s, id).resolveNextWrite();
  await settle(); c.refresh(); await s.time.advance(10);
  for (const id of ['a', 'b']) assert.equal(port(s, id).writeRecords().length, 1);
  confirm(s, transition); c.refresh(); await s.time.advance(10);
  for (const id of ['a', 'b']) {
    assert.equal(c.get(id).status().armed, true); assert.equal(c.get(id).status().seekPending, false);
    assert.equal(port(s, id).writeRecords().length, 2); assert.equal(port(s, id).writeRecords()[1].epoch, 2);
    assert.equal(c.get(id).status().completedLocalWrites, 1);
  }
  assert.equal(port(s, 'c').writeRecords().length, 0); assert.equal(c.get('c').status().armed, false);
  assert.equal(await c.dispose(), true);
});

test('failed close retains the exact visible retired target and cannot reconnect or be replaced by add', async () => {
  const s = setup(), c = s.collection; await connected(s, ['a']);
  const original = c.get('a'), p = port(s, 'a'); p.rejectClose = true;
  assert.equal(await c.remove('a'), false); assert.deepEqual(c.ids(), ['a']); assert.equal(c.selected(), original);
  assert.equal(c.isRemoving('a'), true); assert.equal(c.isBusy(), true); assert.equal(c.status().closeConfirmed, false);
  assert.equal(c.appliedConfigurationId(), 0); assert.match(c.message(), /closure is confirmed/);
  c.add('a'); assert.equal(c.get('a'), original); assert.deepEqual(s.created, ['a']);
  c.setForeground(true); assert.equal(c.arm(), false);
  assert.equal(await c.connect(config('a'), new OutputEndpoint()), false);
  assert.equal(await original.connect(config('a'), new OutputEndpoint()), false);
  p.rejectClose = false; assert.equal(await c.remove('a'), true); assert.equal(c.selected(), null);
  c.add('a'); assert.notEqual(c.get('a'), original); assert.equal(c.get('a').status(), null);
  assert.equal(s.ports.get('a').length, 1); assert.equal(await c.dispose(), true);
});

test('duplicate removals share one promise; a slow close cannot block removing another target', async () => {
  const s = setup((id, time) => id === 'a' ? new DeferredCloseTransport(time) : new MemoryTransport(time)), c = s.collection;
  await connected(s); const original = c.get('a'); c.select('a');
  const first = c.remove('a'), second = c.remove('a'); assert.equal(first, second);
  assert.equal(c.get('a'), original); assert.equal(c.get('a').status().armed, false);
  assert.equal(port(s, 'a').pendingCloses.length, 1); assert.equal(await c.remove('b'), true);
  assert.deepEqual(c.ids(), ['a']); assert.equal(c.selectedId(), 'a'); c.add('a'); assert.equal(c.get('a'), original);
  port(s, 'a').resolveNextClose(); assert.equal(await first, true); assert.equal(await second, true);
  assert.deepEqual(c.ids(), []); assert.equal(c.selectedId(), null); assert.equal(port(s, 'a').closeRecords().length, 1);
  c.add('a'); assert.notEqual(c.get('a'), original); assert.equal(await c.dispose(), true);
});

for (const opened of ['resolve', 'reject']) test(`removal during pending open retains ownership until its late ${opened} is closed`, async () => {
  const s = setup((_id, time) => { const p = new MemoryTransport(time); p.deferOpen = true; return p; }), c = s.collection;
  c.add('a'); const original = c.get('a'); const connecting = c.connect(config('a'), new OutputEndpoint());
  const p = port(s, 'a'), generation = p.openRecords()[0];
  assert.equal(await c.remove('a'), false); assert.equal(c.get('a'), original); assert.equal(c.isRemoving('a'), true);
  assert.equal(original.status().closeConfirmed, false); c.add('a'); assert.equal(s.created.length, 1);
  if (opened === 'resolve') p.resolveNextOpen(); else p.rejectNextOpen();
  assert.equal(await connecting, false); assert.equal(original.status().closeConfirmed, true);
  assert.equal(original.appliedConfigurationId(), 0); assert.equal(c.appliedConfigurationId(), 0);
  assert.ok(p.closeRecords().length >= 2); assert.ok(p.closeRecords().every(record => record.connectionGeneration === generation));
  assert.equal(p.writeRecords().length, 0); assert.equal(c.get('a'), original);
  assert.equal(await c.remove('a'), true); c.add('a'); const replacement = c.get('a');
  await settle(); assert.notEqual(replacement, original); assert.equal(c.get('a'), replacement);
  assert.equal(await c.dispose(), true);
});

test('removal during replacement freezes the coordinator before a delayed old close can create a new port', async () => {
  const s = setup((_id, time) => new DeferredCloseTransport(time)), c = s.collection; await connected(s, ['a']);
  const original = c.get('a'), p = port(s, 'a');
  const replacement = c.connect({ ...config('a'), updateContext: { kind: 'polled' } }, new OutputEndpoint());
  assert.equal(original.isBusy(), true); assert.equal(p.pendingCloses.length, 1);
  const removing = c.remove('a'); assert.equal(p.pendingCloses.length, 1);
  p.deferClose = false; p.resolveNextClose(); assert.equal(await replacement, false);
  const removed = await removing;
  assert.equal(s.ports.get('a').length, 1); assert.equal(original.appliedConfigurationId(), 0);
  assert.ok(original.status() === null || original.status().closeConfirmed);
  if (!removed) assert.equal(await c.remove('a'), true);
  assert.equal(c.get('a'), null); assert.equal(await original.connect(config('a'), new OutputEndpoint()), false);
  assert.equal(await c.dispose(), true);
});

for (const action of ['refresh', 'stop', 'disarm', 'setForeground', 'beginSourceSeek']) test(`${action} isolates a throwing target and still reaches the other target`, async () => {
  const s = setup(), c = s.collection; await connected(s);
  const first = c.get('a'), original = first[action];
  if (action === 'beginSourceSeek') pending(s);
  first[action] = () => { throw new Error('Simulated target callback failure.'); };
  assert.doesNotThrow(() => action === 'setForeground' ? c.setForeground(false) : c[action]());
  assert.equal(first.status().armed, false);
  if (action === 'refresh') { await settle(); assert.equal(port(s, 'b').writeRecords().length, 1); }
  else if (action === 'beginSourceSeek') assert.equal(c.get('b').status().seekPending, true);
  else assert.equal(c.get('b').status().armed, false);
  first[action] = original; assert.equal(await c.dispose(), true);
});

for (const method of ['disconnect', 'dispose']) test(`a rejecting ${method} retains ownership rather than reporting successful removal`, async () => {
  const s = setup(), c = s.collection; await connected(s, ['a']);
  const target = c.get('a'), original = target[method];
  target[method] = async () => { throw new Error('Simulated cleanup rejection.'); };
  assert.equal(await c.remove('a'), false); assert.equal(c.get('a'), target); assert.equal(c.isRemoving('a'), true);
  target[method] = original; assert.equal(await c.remove('a'), true); assert.equal(await c.dispose(), true);
});

test('global disposal attempts every target, retains failed close, and allows only explicit cleanup retries', async () => {
  const s = setup(), c = s.collection; await connected(s); const failed = c.get('a'); port(s, 'a').rejectClose = true;
  assert.equal(await c.dispose(), false); assert.deepEqual(c.ids(), ['a']); assert.equal(c.get('a'), failed);
  assert.equal(port(s, 'b').closeRecords().length, 1); assert.equal(c.isRemoving('a'), true);
  assert.equal(await c.connect(config('a'), new OutputEndpoint()), false); assert.throws(() => c.add('c'), /disposed/);
  port(s, 'a').rejectClose = false; assert.equal(await c.dispose(), true); assert.deepEqual(c.ids(), []);
  assert.equal(await c.dispose(), true);
});

test('one coordinator cannot be owned by two target identities', async () => {
  const s = setup(); s.collection.add('a'); const target = s.collection.get('a');
  const c = new OutputTargetCollection(() => target); c.add('x'); assert.throws(() => c.add('y'), /own coordinator/);
  assert.deepEqual(c.ids(), ['x']); assert.equal(await c.dispose(), true); assert.equal(await s.collection.dispose(), true);
});

test('paused manual permission stays per target and never leaks through collection fanout or selection', async () => {
  const s = setup(); s.collection.add('a'); s.collection.add('b');
  const allowed = { ...config('a', 'fixed', 'L0'), allowPausedManual: true };
  const denied = { ...config('b', 'fixed', 'L0'), allowPausedMotion: true, allowPausedAutoHome: true };
  s.source.value = { ...s.source.value, mediaState: 'paused',
    authorization: { ...s.source.value.authorization, intents: ['pausedManual'], clockKind: 'monotonic' } };
  assert.equal(await s.collection.get('a').connect(allowed, new OutputEndpoint()), true);
  assert.equal(await s.collection.get('b').connect(denied, new OutputEndpoint()), true);
  assert.equal(s.collection.get('a').arm(), true); assert.equal(s.collection.get('b').arm(), false);
  s.collection.refresh(); await s.time.advance(10);
  assert.equal(s.ports.get('a')[0].writeRecords().length, 1); assert.equal(s.ports.get('b')[0].writeRecords().length, 0);
  s.collection.select('b'); s.collection.refresh(); await s.time.advance(10);
  assert.equal(s.ports.get('b')[0].writeRecords().length, 0);
  assert.equal(s.collection.get('a').configuration().allowPausedManual, true);
  assert.equal(s.collection.get('b').configuration().allowPausedManual, false);
  await s.collection.dispose();
});
