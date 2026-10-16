import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
// ArkTS source uses extensionless imports; Node strips TS types without dependencies.
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
    return nextResolve(specifier + '.ts', context);
  }
  return nextResolve(specifier, context);
} });
const { FunscriptParser: Parser, interpolate } = await import('../entry/src/main/ets/core/Funscript.ts');
const { PlaybackEngine } = await import('../entry/src/main/ets/core/PlaybackEngine.ts');
const parse = value => Parser.parse(JSON.stringify(value));
const fixture = () => parse({ actions: [{ at: 0, pos: 0 }, { at: 500, pos: 100 }, { at: 1000, pos: 0 }] });
const ready = () => { const engine = new PlaybackEngine(); engine.load(fixture()); engine.setConnected(true); return engine; };

test('ordinary actions sort and last duplicate timestamp wins', () => {
  const doc = parse({ actions: [{ at: 20, pos: 20 }, { at: 0, pos: 0 }, { at: 20, pos: 75 }] });
  assert.equal(doc.durationMs, 20);
  assert.equal(doc.axes[0].name, 'L0');
  assert.deepEqual(doc.axes[0].actions.map(p => [p.at, p.pos]), [[0, 0], [20, 75]]);
});
test('axis array supports upstream id and name alias; id takes priority', () => {
  const doc = parse({ axes: [{ id: 'L1', name: 'alias', actions: [{ at: 7, pos: 33 }] }, { name: 'R0', actions: [] }] });
  assert.deepEqual(doc.axes.map(a => a.name), ['L1', 'R0']);
  assert.equal(doc.durationMs, 7);
});
test('named multi-axis and conventional main axis coexist', () => {
  const doc = parse({ actions: [{ at: 100, pos: 1 }], axes: { L1: { actions: [{ at: 200, pos: 99 }] } } });
  assert.equal(doc.durationMs, 200);
  assert.equal(doc.axes.length, 2);
});
test('empty actions valid for preview, zero duration cannot play', () => {
  const doc = parse({ actions: [] });
  assert.equal(interpolate(doc.axes[0], 0), 50);
  const engine = new PlaybackEngine(); engine.load(doc); engine.setConnected(true);
  assert.equal(engine.play(), false);
  assert.equal(engine.snapshot().safetyGateOpen, false);
});
test('invalid root and syntax rejected', () => {
  for (const text of ['', '{', 'null', '[]', 'true', '1', '"x"', '{}', '{"axes":[]}']) {
    assert.throws(() => Parser.parse(text));
  }
});
test('hostile nested shapes, names and duplicate axis names rejected', () => {
  for (const value of [
    { actions: null }, { actions: {} }, { actions: [null] }, { actions: [[]] },
    { axes: 2 }, { axes: null }, { axes: [null] }, { axes: [{ id: 'L0' }] },
    { axes: [{ id: '<script>', actions: [] }] }, { axes: { L1: null } },
    { axes: [{ id: 'constructor', actions: [] }] },
    { actions: [], axes: [{ id: 'L0', actions: [] }] }
  ]) { assert.throws(() => parse(value)); }
  assert.throws(() => Parser.parse('{"axes":{"__proto__":{"actions":[]}}}'));
  assert.equal({}.polluted, undefined);
});
test('reject nonfinite numbers, strings, fractional times and ranges', () => {
  for (const action of [
    { at: -1, pos: 0 }, { at: 0.5, pos: 50 }, { at: 86400001, pos: 0 },
    { at: '0', pos: 1 }, { at: 0, pos: '50' }, { at: 0, pos: -0.1 },
    { at: 0, pos: 100.1 }, { at: 0 }, { pos: 50 }, { at: NaN, pos: 0 },
    { at: 0, pos: Infinity }
  ]) { assert.throws(() => parse({ actions: [action] })); }
  assert.throws(() => Parser.parse('{"actions":[{"at":1e999,"pos":50}]}'));
  assert.throws(() => Parser.parse('{"actions":[{"at":0,"pos":NaN}]}'));
  assert.equal(parse({ actions: [{ at: 86400000, pos: 100 }] }).durationMs, 86400000);
});
test('size limits bound text, action lists, axis counts and total points', () => {
  assert.throws(() => Parser.parse(' '.repeat(Parser.MAX_JSON_LENGTH + 1)));
  assert.throws(() => parse({ actions: Array.from({ length: Parser.MAX_ACTIONS + 1 }, () => ({ at: 0, pos: 0 })) }));
  assert.throws(() => parse({ axes: Array.from({ length: 33 }, (_, i) => ({ id: 'A' + i, actions: [] })) }));
  const points = Array.from({ length: 50001 }, (_, i) => ({ at: i, pos: 50 }));
  assert.throws(() => parse({ axes: [{ id: 'L0', actions: points }, { id: 'L1', actions: points }] }));
});
test('linear interpolation clamps endpoints, exact keys and singleton', () => {
  const axis = fixture().axes[0];
  for (const [time, expected] of [[-1, 0], [0, 0], [250, 50], [500, 100], [750, 50], [1000, 0], [1200, 0]]) {
    assert.equal(interpolate(axis, time), expected);
  }
  const singleton = parse({ actions: [{ at: 100, pos: 37.5 }] }).axes[0];
  assert.equal(interpolate(singleton, 50), 37.5);
  assert.equal(interpolate(singleton, 1000), 37.5);
  assert.throws(() => interpolate(axis, NaN));
});
test('play requires explicit simulated connection and valid loaded timeline', () => {
  const engine = new PlaybackEngine();
  assert.equal(engine.play(), false);
  engine.load(fixture()); assert.equal(engine.play(), false);
  engine.setConnected(true); assert.equal(engine.snapshot().safetyGateOpen, false);
  assert.equal(engine.play(), true); assert.equal(engine.snapshot().safetyGateOpen, true);
  engine.tick(250); assert.equal(engine.snapshot().outputs[0].position, 50);
});
test('pause closes gate, tick does not advance, explicit play resumes', () => {
  const engine = ready(); engine.play(); engine.tick(200); engine.pause(); engine.tick(100);
  assert.equal(engine.snapshot().positionMs, 200);
  assert.equal(engine.snapshot().state, 'paused'); assert.deepEqual(engine.snapshot().outputs, []);
  engine.play(); engine.tick(50); assert.equal(engine.snapshot().positionMs, 250);
});
test('seek clamps, retains closed gate and cannot auto-restart ended timeline', () => {
  const engine = ready(); engine.seek(-100); assert.equal(engine.snapshot().positionMs, 0);
  engine.seek(250); assert.equal(engine.snapshot().state, 'stopped');
  engine.play(); engine.seek(5000); assert.equal(engine.snapshot().state, 'ended');
  assert.equal(engine.play(), false);
  engine.seek(100); assert.equal(engine.snapshot().state, 'paused');
  assert.equal(engine.snapshot().safetyGateOpen, false); assert.equal(engine.play(), true);
});
test('stop resets position and closes output gate', () => {
  const engine = ready(); engine.play(); engine.tick(100); engine.stop(); engine.tick(300);
  assert.equal(engine.snapshot().positionMs, 0); assert.equal(engine.snapshot().state, 'stopped');
  assert.deepEqual(engine.snapshot().outputs, []);
});
test('background and disconnect interrupt, returning never auto-resumes', () => {
  for (const interrupt of ['setForeground', 'setConnected']) {
    const engine = ready(); engine.play(); engine.tick(100); engine[interrupt](false);
    assert.equal(engine.snapshot().safetyGateOpen, false); assert.equal(engine.play(), false);
    engine.tick(100); assert.equal(engine.snapshot().positionMs, 100);
    engine[interrupt](true); engine.tick(100);
    assert.equal(engine.snapshot().state, 'stopped'); assert.equal(engine.snapshot().positionMs, 100);
    assert.equal(engine.play(), true);
  }
});
test('end reached closes output gate and load interrupts prior playback', () => {
  const engine = ready(); engine.play(); engine.tick(100000);
  assert.equal(engine.snapshot().positionMs, 1000); assert.equal(engine.snapshot().state, 'ended');
  assert.deepEqual(engine.snapshot().outputs, []);
  engine.load(fixture()); assert.equal(engine.snapshot().state, 'stopped'); assert.equal(engine.snapshot().positionMs, 0);
});
test('invalid clock and seek input cannot corrupt playback state', () => {
  const engine = ready(); engine.play();
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.throws(() => engine.seek(value)); assert.throws(() => engine.tick(value));
  }
  assert.throws(() => engine.tick(-1)); assert.equal(engine.snapshot().positionMs, 0);
});
test('load copies source; returned snapshots cannot mutate engine', () => {
  const doc = fixture(); const engine = ready(); engine.load(doc); engine.play();
  doc.axes[0].actions[0].pos = 80; doc.axes.length = 0;
  const snapshot = engine.snapshot(); assert.equal(snapshot.outputs[0].position, 0);
  snapshot.positionMs = 999; snapshot.outputs[0].position = 77;
  assert.equal(engine.snapshot().positionMs, 0); assert.equal(engine.snapshot().outputs[0].position, 0);
});
test('all nonempty axes are sampled independently, shorter axis holds final value', () => {
  const engine = ready();
  engine.load(parse({ axes: [{ id: 'L0', actions: [{ at: 0, pos: 0 }, { at: 1000, pos: 100 }] },
    { id: 'L1', actions: [{ at: 0, pos: 100 }, { at: 200, pos: 0 }] }, { id: 'R0', actions: [] }] }));
  engine.play(); engine.tick(500);
  assert.deepEqual(engine.snapshot().outputs.map(p => [p.name, p.position]), [['L0', 50], ['L1', 0]]);
});
test('programmatic unsafe documents are revalidated; failed load clears old timeline', () => {
  for (const actions of [[{ at: 0, pos: Infinity }], [{ at: -1, pos: 10 }], [null], [{ at: 0, pos: 101 }]]) {
    const engine = ready(); engine.play();
    assert.throws(() => engine.load({ axes: [{ name: 'L0', actions }], durationMs: 1000 }));
    assert.equal(engine.snapshot().state, 'stopped');
    assert.equal(engine.snapshot().durationMs, 0);
    assert.deepEqual(engine.snapshot().outputs, []);
    assert.equal(engine.play(), false);
  }
});
test('programmatic document cannot spoof duration or retain unsorted actions', () => {
  const engine = ready();
  engine.load({ axes: [{ name: 'L0', actions: [{ at: 100, pos: 100 }, { at: 0, pos: 0 }] }], durationMs: Infinity });
  assert.equal(engine.snapshot().durationMs, 100);
  engine.play(); engine.tick(50); assert.equal(engine.snapshot().outputs[0].position, 50);
});
test('total action limit counts source entries before duplicate reduction', () => {
  const points = Array.from({ length: 50001 }, () => ({ at: 0, pos: 50 }));
  assert.throws(() => parse({ axes: [{ id: 'L0', actions: points }, { id: 'L1', actions: points }] }));
});
test('unsupported duration metadata and range/inverted flags cannot override actions', () => {
  const doc = parse({ version: '1.0', range: 50, inverted: true, metadata: { duration: 9999 },
    actions: [{ at: 0, pos: 5 }, { at: 100, pos: 95 }] });
  assert.equal(doc.durationMs, 100); assert.equal(interpolate(doc.axes[0], 0), 5);
});
