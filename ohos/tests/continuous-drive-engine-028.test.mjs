import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, next) { return next(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? specifier + '.ts' : specifier, context); } });
const { ContinuousInputConfiguration: Configuration, ContinuousInputMapping: Mapping, ContinuousInputAction: Action,
  continuousActionCatalog, cloneContinuousMapping, validateContinuousAction } = await import('../entry/src/main/ets/input/ContinuousInputConfiguration.ts');
const { ContinuousDriveEngine: Engine, ContinuousInputContext: Context, ContinuousOutputIdentity: OutputIdentity,
  ContinuousGesture: Gesture, ContinuousGestureData: Data, convertDriveGesture, convertOffsetGesture } = await import('../entry/src/main/ets/input/ContinuousDriveEngine.ts');

function mapping(extra = {}) { return Object.assign(new Mapping('m', 'Local'), { actions: [new Action('Axis::Value::Drive', 'L0')] }, extra); }
function config(...mappings) { return Object.assign(new Configuration(), { mappings }); }
function context(extra = {}) { return Object.assign(new Context(), { ownerId: 7, enabledAxes: ['L0'], outputTargets: [new OutputIdentity('tcp:0', 3)] }, extra); }
function fixture(extra = {}, others = []) {
  const m = mapping(extra), e = new Engine(config(m, ...others)); e.setContext(context());
  assert.equal(e.enableReception(7), true);
  const capture = e.beginCapture(4, m.source, 7, 0, m.source !== 'wheel'); assert.ok(capture);
  return { m, e, capture };
}
function event(f, value, delta, now, extra = {}) {
  const g = Object.assign(new Gesture(value, delta, 0, f.m.source, f.m.component, 4, f.m.source !== 'wheel', now * 1e6), extra);
  return f.e.gesture(f.capture, g, now);
}
function finish(e, dispatches) { for (const dispatch of dispatches) e.completeDispatch(dispatch); return dispatches; }
function offset(extra = {}, others = []) { return fixture({ kind: 'offset', ...extra }, others); }
function plain(value) { return JSON.parse(JSON.stringify(value)); }

test('persisted default has no mappings/runtime state and uses source defaults', () => {
  const c = Configuration.fromJson(undefined), m = new Mapping('m');
  assert.deepEqual(c.mappings, []); assert.equal(c.enabled, true);
  assert.equal(m.driveMode, 'Relative'); assert.equal(m.offsetMode, 'AbsoluteJoystick');
  assert.equal(m.speed, .1); assert.equal(m.invert, false); assert.equal(m.wheelSpan, 100);
  const e = new Engine(config(mapping())); e.setContext(context());
  assert.equal(e.isReceiving(), false); assert.equal(e.beginCapture(4, 'touch', 7, 0, true), null); assert.equal(e.nextDeadlineMs(), null);
});
test('nine explicit target templates roundtrip without opaque action/runtime payloads', () => {
  const actions = continuousActionCatalog().map(spec => new Action(spec.id, 'L0', spec.targetProvider ? 'Pattern' : '', spec.targetOutput ? 'tcp:0' : ''));
  assert.equal(actions.length, 9); assert.ok(actions.every(validateContinuousAction));
  const c = config(mapping({ actions })); assert.deepEqual(plain(Configuration.fromJson(plain(c))), plain(c));
  for (const field of ['capture', 'token', 'held', 'deadline', 'receiving', 'armed']) {
    assert.ok(Configuration.validate({ ...plain(c), [field]: true }).length > 0);
    const bad = plain(c); bad.mappings[0][field] = true; assert.ok(Configuration.validate(bad).length > 0);
  }
});
test('configuration is detached and strict about missing/unsupported fields and nonfinite numbers', () => {
  const c = config(mapping()), clone = Configuration.clone(c);
  c.mappings[0].actions[0].targetAxis = 'R0'; assert.equal(clone.mappings[0].actions[0].targetAxis, 'L0');
  for (const speed of [NaN, Infinity, -1, 1.01, '0.1']) assert.ok(Configuration.validate(config(mapping({ speed }))).length);
  for (const wheelSpan of [NaN, Infinity, 0, 4097, '100']) assert.ok(Configuration.validate(config(mapping({ wheelSpan }))).length);
  for (const wheelSpan of [1, 1.5, 4096]) assert.deepEqual(Configuration.validate(config(mapping({ wheelSpan }))), []);
  for (const field of Object.keys(mapping())) {
    const m = plain(mapping()); delete m[field]; assert.ok(Configuration.validate(config(m)).length, field);
  }
  assert.ok(Configuration.validate(config(mapping({ id: '../bad' }))).length);
  assert.ok(Configuration.validate(config(mapping({ name: 'a\n' }))).length);
  assert.ok(Configuration.validate(config(mapping(), mapping())).length);
});
test('configuration budgets reject sparse/extended arrays, duplicate IDs and excess actions/mappings', () => {
  const sparse = new Array(1); assert.ok(Configuration.validate(config(mapping({ actions: sparse }))).length);
  const extended = [new Action('Axis::Value::Drive', 'L0')]; extended.payload = true;
  assert.ok(Configuration.validate(config(mapping({ actions: extended }))).length);
  assert.ok(Configuration.validate(config(mapping({ actions: Array.from({ length: 17 }, () => new Action('Axis::Value::Drive', 'L0')) }))).length);
  assert.ok(Configuration.validate(config(...Array.from({ length: 65 }, (_, n) => mapping({ id: 'm' + n })))).length);
  assert.doesNotThrow(() => Configuration.clone(config(...Array.from({ length: 64 }, (_, n) => mapping({ id: 'm' + n })))));
});
test('configuration never falls back to selected axis/provider/output and preserves reverse limits', () => {
  for (const a of [new Action('Axis::Value::Drive', ''), new Action('MotionProvider::Speed::Drive', 'L0'),
    new Action('MotionProvider::Speed::Drive', 'L0', 'Selected'), new Action('OutputTarget::Axis::Range::Size::Drive', 'L0'),
    new Action('Axis::Value::Drive', 'L0', 'Random'), new Action('Axis::Value::Drive', 'L0', '', 'tcp:0'),
    new Action('App::Stop', 'L0'), new Action('Axis::Value::Drive', 'L0', '', '', .2, .8)]) assert.equal(validateContinuousAction(a), false);
  const reverse = new Action('OutputTarget::Axis::Range::Middle::Drive', 'L0', '', 'tcp:0', .9, .1);
  assert.equal(validateContinuousAction(reverse), true); assert.deepEqual(plain(cloneContinuousMapping(mapping({ actions: [reverse] }))).actions[0], plain(reverse));
  assert.equal(validateContinuousAction(new Action('OutputTarget::Axis::Range::Minimum::Drive', 'L0', '', 'tcp:0', .3, .8)), false);
  assert.equal(validateContinuousAction(new Action('OutputTarget::Axis::Range::Maximum::Drive', 'L0', '', 'tcp:0', .2, .8)), false);
});
test('component/source compatibility is explicit and wheel cannot select Offset', () => {
  for (const source of ['touch', 'mouse', 'wheel']) for (const component of ['x', 'y', 'wheelX', 'wheelY']) {
    assert.equal(Configuration.validate(config(mapping({ source, component }))).length === 0, source === 'wheel' ? component.startsWith('wheel') : !component.startsWith('wheel'));
  }
  assert.ok(Configuration.validate(config(mapping({ source: 'wheel', component: 'wheelY', kind: 'offset' }))).length);
  assert.ok(Configuration.validate(config(mapping({ source: 'gamepad' }))).length);
});

for (const mode of ['Absolute', 'Relative', 'RelativePositiveOnly', 'RelativeNegativeOnly', 'RelativeJoystick']) {
  for (const invert of [false, true]) test('Drive ' + mode + ' invert=' + invert + ' boundaries/sign-before-invert', () => {
    for (const value of [0, .25, .5, .75, 1]) for (const delta of [-.1, 0, .1]) {
      const g = new Gesture(value, delta, .025, 'touch', 'x', 4, true);
      const d = convertDriveGesture(mode, invert, g);
      const accept = mode === 'Absolute' || mode === 'Relative' || mode === 'RelativePositiveOnly' && delta > 0 ||
        mode === 'RelativeNegativeOnly' && delta < 0 || mode === 'RelativeJoystick' && (value < .5 && delta < 0 || value > .5 && delta > 0);
      assert.equal(d !== null, accept, JSON.stringify({ value, delta }));
      if (d !== null) {
        assert.equal(d.isAbsolute, mode === 'Absolute'); assert.equal(d.isRelative, mode !== 'Absolute'); assert.equal(d.deltaTime, .025);
        assert.equal(d.valueOrDelta, mode === 'Absolute' ? (invert ? 1 - value : value) : delta * (invert ? -1 : 1));
      }
    }
  });
}
test('ApplyTo uses relative increment and deltaModifier exactly, never duration scaling', () => {
  assert.equal(Data.relative(.2, .1).applyTo(.3), .5); assert.equal(Data.relative(.2, 99).applyTo(.3), .5);
  assert.equal(Data.relative(.2, .1).applyTo(.3, 2), .7); assert.equal(Data.absolute(.2, .1).applyTo(99, 10), .2);
  assert.throws(() => Data.relative(Infinity, 0)); assert.throws(() => Data.absolute(.2, -1));
});
for (const mode of ['Absolute', 'AbsoluteJoystick']) for (const invert of [false, true]) test('Offset conversion ' + mode + ' invert=' + invert, () => {
  for (const speed of [0, .1, 1]) for (const value of [0, .25, .5, .75, 1]) {
    const actual = convertOffsetGesture(mode, speed, invert, new Gesture(value, .3, 0, 'touch', 'x', 4, true));
    const expected = (mode === 'Absolute' ? value : (value - .5) * 2) * speed * (invert ? -1 : 1);
    assert.ok(Math.abs(actual - expected) < 1e-15);
  }
});

test('Offset first tick is delayed: 99/100/200 ms and fixed source duration .1', () => {
  const f = offset(); assert.deepEqual(event(f, 1, .5, 0), []); assert.equal(f.e.nextDeadlineMs(), 100);
  assert.deepEqual(f.e.advance(99), []); const [first] = f.e.advance(100); assert.equal(first.data.valueOrDelta, .1);
  assert.equal(first.data.deltaTime, .1); assert.equal(first.data.isRelative, true); assert.equal(f.e.nextDeadlineMs(), 200);
  f.e.completeDispatch(first); assert.deepEqual(f.e.advance(199), []); assert.equal(f.e.advance(200).length, 1);
});
test('Offset newer value replaces future ticks without resetting the running period', () => {
  const f = offset(); event(f, 1, .5, 0); event(f, .25, -.75, 90); assert.equal(f.e.nextDeadlineMs(), 100);
  const [d] = f.e.advance(100); assert.equal(d.data.valueOrDelta, -.05); f.e.completeDispatch(d);
  event(f, .75, .5, 150); assert.equal(f.e.nextDeadlineMs(), 200); assert.equal(f.e.advance(200)[0].data.valueOrDelta, .05);
});
test('exact zero cancels repeat without synthesizing a dispatch or undoing in-flight work', () => {
  const f = offset(); event(f, 1, .5, 0); const [d] = f.e.advance(100); event(f, .5, -.5, 110);
  assert.equal(f.e.nextDeadlineMs(), null); assert.equal(f.e.isDispatchCurrent(d), true); assert.deepEqual(f.e.advance(1000), []);
  f.e.completeDispatch(d); event(f, 0, -.5, 1001); assert.equal(f.e.nextDeadlineMs(), 1101);
});
test('late ticks coalesce once while retaining phase, with no delayed burst', () => {
  const f = offset(); event(f, 1, .5, 0); const ds = f.e.advance(1050); assert.equal(ds.length, 1); assert.equal(f.e.nextDeadlineMs(), 1100);
  finish(f.e, ds); assert.deepEqual(f.e.advance(1050), []); assert.deepEqual(f.e.advance(1099), []);
  assert.equal(f.e.advance(1100).length, 1);
});
test('one in-flight invocation drops Drive events and Offset ticks instead of queueing', () => {
  const drive = fixture(); const [d] = event(drive, .6, .1, 0);
  assert.deepEqual(event(drive, .9, .3, 1), []); drive.e.completeDispatch({ ...d }); assert.deepEqual(event(drive, .8, -.1, 2), []);
  drive.e.completeDispatch(d); assert.equal(event(drive, .7, -.1, 3)[0].data.valueOrDelta, -.1);
  const f = offset(); event(f, 1, .5, 0); const [first] = f.e.advance(100);
  assert.deepEqual(f.e.advance(200), []); assert.deepEqual(f.e.advance(450), []); assert.equal(f.e.nextDeadlineMs(), 500);
  f.e.completeDispatch(first); assert.deepEqual(f.e.advance(450), []); assert.equal(f.e.advance(500).length, 1);
});
test('equal-deadline ordering invokes old Offset then replaces its value', () => {
  const f = offset(); event(f, 1, .5, 0); const ds = event(f, .25, -.75, 100);
  assert.equal(ds.length, 1); assert.equal(ds[0].data.valueOrDelta, .1); finish(f.e, ds);
  assert.equal(f.e.advance(200)[0].data.valueOrDelta, -.05);
});
test('multiple mappings independently drop in-flight ticks and preserve configuration order', () => {
  const second = mapping({ id: 'second', kind: 'offset', speed: .2 }); const f = offset({}, [second]);
  event(f, 1, .5, 0); const ds = f.e.advance(100); assert.deepEqual(ds.map(d => d.mappingId), ['m', 'second']);
  f.e.completeDispatch(ds[1]); const next = f.e.advance(200); assert.deepEqual(next.map(d => d.mappingId), ['second']);
  assert.equal(next[0].data.valueOrDelta, .2); assert.ok(f.e.isDispatchCurrent(ds[0]));
});
test('source Enabled gates NEW updates only, preserving repeat and current batch until local cancellation', () => {
  const f = offset(); event(f, 1, .5, 0); const [first] = f.e.advance(100); assert.equal(f.e.setMappingEnabled('m', false), true);
  assert.equal(f.e.isDispatchCurrent(first), true); event(f, .5, -.5, 110); assert.equal(f.e.nextDeadlineMs(), 200);
  f.e.completeDispatch(first); assert.equal(f.e.advance(200)[0].data.valueOrDelta, .1);
  assert.equal(f.e.configurationSnapshot().mappings[0].enabled, false);
  f.e.cancel('editor'); assert.equal(f.e.nextDeadlineMs(), null); assert.equal(f.e.isReceiving(), false);
});

for (const reason of ['stop', 'cancel', 'ambiguous-contact', 'outside', 'collapse', 'resize', 'rotation', 'background', 'stage-replaced']) {
  test(reason + ' revokes reception, timer, dispatch tails and later callbacks until explicit enable', () => {
    const f = offset(); event(f, 1, .5, 0); const token = f.e.cancellationToken(), [d] = f.e.advance(100);
    f.e.cancel(reason); assert.equal(f.e.isReceiving(), false); assert.equal(f.e.isContactActive(), false); assert.equal(f.e.nextDeadlineMs(), null);
    assert.equal(f.e.isDispatchCurrent(d), false); assert.deepEqual(f.e.advance(1e9, token), []); assert.deepEqual(event(f, 1, .2, 1e9), []);
    assert.equal(f.e.beginCapture(4, 'touch', 7, 101, true), null); assert.equal(f.e.enableReception(7), true);
    const next = f.e.beginCapture(4, 'touch', 7, 101, true); assert.ok(next); assert.notEqual(next.token, f.capture.token);
    f.e.completeDispatch(d); assert.equal(f.e.isCaptureCurrent(next), true);
  });
}
for (const [field, value] of [['foreground', false], ['focused', false], ['surfaceVisible', false], ['textInput', true], ['ime', true], ['modal', true], ['readOnly', true],
  ['ownerId', 8], ['profileRevision', 1], ['controlRevision', 1], ['enabledAxes', []], ['outputTargets', [new OutputIdentity('tcp:0', 4)]]]) {
  test('context change ' + field + ' retires old capture and does not automatically resume', () => {
    const f = offset(); event(f, 1, .5, 0); const [d] = f.e.advance(100);
    f.e.setContext(context({ [field]: value })); assert.equal(f.e.isReceiving(), false); assert.equal(f.e.isDispatchCurrent(d), false);
    assert.equal(f.e.nextDeadlineMs(), null); f.e.setContext(context()); assert.equal(f.e.isReceiving(), false);
  });
}
test('normal matching UP retires contact and tails but retains reception for a fresh physical contact', () => {
  const f = offset(); event(f, 1, .5, 0); const oldToken = f.e.cancellationToken(), [old] = f.e.advance(100);
  f.e.releaseCapture(f.capture); assert.equal(f.e.isReceiving(), true); assert.equal(f.e.isContactActive(), false);
  assert.equal(f.e.isDispatchCurrent(old), false); assert.equal(f.e.nextDeadlineMs(), null);
  const next = f.e.beginCapture(4, 'touch', 7, 101, true); assert.ok(next); f.e.releaseCapture(f.capture);
  assert.ok(f.e.isCaptureCurrent(next)); assert.deepEqual(f.e.advance(1e9, oldToken), []);
  assert.equal(f.e.gesture(next, new Gesture(1, .5, 0, 'touch', 'x', 4, true, 101e6), 101).length, 0);
  assert.equal(f.e.nextDeadlineMs(), 201);
});
test('release with cancellation reason retires reception instead of treating CANCEL as UP', () => {
  const f = offset(); event(f, 1, .5, 0); f.e.releaseCapture(f.capture, 'cancel'); assert.equal(f.e.isReceiving(), false);
  assert.equal(f.e.nextDeadlineMs(), null); assert.deepEqual(f.e.advance(100), []);
});
test('old completion cannot unlock the new contact invocation and old event cannot move clock/handled state', () => {
  const f = fixture(); const [old] = event(f, .6, .1, 0); f.e.releaseCapture(f.capture);
  const next = f.e.beginCapture(4, 'touch', 7, 1, true); const g = new Gesture(.7, .1, 0, 'touch', 'x', 4, true, 1e6);
  const [current] = f.e.gesture(next, g, 1); assert.ok(current); assert.equal(f.e.lastEventHandled(), true);
  assert.deepEqual(event(f, .9, .2, 1e9), []); assert.equal(f.e.lastEventHandled(), true);
  f.e.completeDispatch(old); assert.deepEqual(f.e.gesture(next, g, 1), []); assert.equal(f.e.isDispatchCurrent(current), true);
});
test('same context snapshots copy mutable arrays; changed contexts cannot mutate an active snapshot in place', () => {
  const f = fixture(); const c = context(); f.e.setContext(c); assert.equal(f.e.isReceiving(), true);
  c.enabledAxes.length = 0; c.outputTargets[0].generation = 99; assert.equal(f.e.isReceiving(), true);
  const [d] = event(f, .6, .1, 0); assert.equal(d.context.outputTargets[0].generation, 3);
  d.mapping.actions[0].targetAxis = 'R0'; d.actions[0].targetAxis = 'R0'; assert.equal(f.e.configurationSnapshot().mappings[0].actions[0].targetAxis, 'L0');
  f.capture.context.enabledAxes.length = 0; assert.equal(f.e.isCaptureCurrent(f.capture), false);
});
test('configuration replacement and invalid edits cancel before validation and never restore reception', () => {
  const f = offset(); event(f, 1, .5, 0); const token = f.e.cancellationToken();
  assert.throws(() => f.e.setConfiguration({ enabled: true, mappings: [{}] })); assert.equal(f.e.nextDeadlineMs(), null);
  assert.equal(f.e.configurationSnapshot().mappings[0].id, 'm'); assert.equal(f.e.isReceiving(), false);
  assert.deepEqual(f.e.advance(1e9, token), []); f.e.setConfiguration(config(mapping())); assert.equal(f.e.isReceiving(), false);
});
test('missing enabled axes/retired output target block reception without fallback', () => {
  const e = new Engine(config(mapping())); assert.equal(e.enableReception(7), false); e.setContext(context({ enabledAxes: ['R0'] }));
  assert.equal(e.enableReception(7), false); e.setConfiguration(config(mapping({ actions: [new Action('OutputTarget::Axis::Range::Size::Drive', 'L0', '', 'udp:0')] })));
  e.setContext(context()); assert.equal(e.enableReception(7), false); e.setContext(context({ outputTargets: [new OutputIdentity('udp:0', 0)] }));
  assert.equal(e.enableReception(7), true); assert.equal(e.enableReception(8), false);
});
test('explicit selected mapping excludes other configured mappings and incomplete draft blocks', () => {
  const e = new Engine(config(mapping(), mapping({ id: 'other' }), mapping({ id: 'draft', actions: [] })));
  e.setContext(context()); assert.equal(e.enableReception(7), false); assert.equal(e.enableReception(7, 'm'), true);
  const capture = e.beginCapture(4, 'touch', 7, 0, true); const ds = e.gesture(capture, new Gesture(.5, .1, 0, 'touch', 'x', 4, true), 0);
  assert.deepEqual(ds.map(d => d.mappingId), ['m']);
});
test('mouse pressed ownership is required; a second pointer/source cancels ambiguity', () => {
  const m = mapping({ source: 'mouse' }), e = new Engine(config(m)); e.setContext(context()); e.enableReception(7);
  assert.equal(e.beginCapture(4, 'mouse', 7, 0, false), null); assert.equal(e.isReceiving(), false);
  const f = fixture(); assert.equal(f.e.beginCapture(5, 'mouse', 7, 1, true), null); assert.equal(f.e.isReceiving(), false);
  assert.deepEqual(event(f, .6, .1, 2), []);
});
test('stale page begin cannot cancel the current page and stale release cannot cancel new contact', () => {
  const f = fixture(); assert.equal(f.e.beginCapture(9, 'touch', 6, 1e9, true), null); assert.ok(f.e.isCaptureCurrent(f.capture));
  assert.equal(event(f, .6, .1, 1).length, 1);
});
test('wheel dispatch is immediate Drive with zero duration and no repeat/held state', () => {
  const f = fixture({ source: 'wheel', component: 'wheelY' }); assert.equal(f.e.isContactActive(), false);
  const [d] = event(f, .6, .1, 0); assert.equal(d.data.deltaTime, 0); assert.equal(d.data.valueOrDelta, .1);
  assert.equal(f.e.nextDeadlineMs(), null); f.e.completeDispatch(d); f.e.releaseCapture(f.capture); assert.equal(f.e.isReceiving(), true);
});
test('mouse and wheel cannot supply a nonzero raw action duration; touch duration is explicit', () => {
  for (const source of ['mouse', 'wheel']) {
    const f = fixture({ source, component: source === 'wheel' ? 'wheelY' : 'x' });
    assert.deepEqual(event(f, .6, .1, 0, { deltaTime: .1 }), []); assert.equal(f.e.isReceiving(), false);
  }
  const f = fixture(); const [d] = event(f, .6, .1, 0, { deltaTime: .025 }); assert.equal(d.data.deltaTime, .025);
});
test('same-capture wheel events drop in-flight invocations without cancelling reception', () => {
  const f = fixture({ source: 'wheel', component: 'wheelY' }); const [first] = event(f, .6, .1, 0);
  assert.deepEqual(event(f, .7, .1, 1), []); assert.equal(f.e.isDispatchCurrent(first), true); assert.equal(f.e.isReceiving(), true);
  f.e.completeDispatch(first); const [next] = event(f, .8, .1, 2); assert.ok(next); assert.equal(f.e.nextDeadlineMs(), null);
});
for (const extra of [{ value: NaN }, { value: Infinity }, { value: -1 }, { value: 1.1 }, { delta: NaN }, { deltaTime: -1 }, { deltaTime: Infinity },
  { nativeTimestamp: NaN }, { nativeTimestamp: -1 }, { nativeTimestampUnit: 'ticks' }, { pointerId: 5 }, { pointerId: .5 }, { contactActive: false },
  { component: 'wheelX' }, { source: 'mouse' }]) {
  test('invalid active gesture cancels safely: ' + Object.keys(extra)[0] + '=' + Object.values(extra)[0], () => {
    const f = offset(); event(f, 1, .5, 0); assert.deepEqual(event(f, 1, .5, 1, extra), []);
    assert.equal(f.e.isReceiving(), false); assert.equal(f.e.nextDeadlineMs(), null);
  });
}
test('nonmonotonic native timestamps and changed units cancel without serving a due timer', () => {
  const f = offset(); event(f, 1, .5, 10); assert.deepEqual(event(f, 1, .5, 110, { nativeTimestamp: 0 }), []);
  assert.equal(f.e.isReceiving(), false); const other = offset(); event(other, 1, .5, 0);
  assert.deepEqual(event(other, 1, .5, 100, { nativeTimestampUnit: 'ms' }), []); assert.equal(other.e.isReceiving(), false);
});
for (const now of [NaN, Infinity, -1, Number.MAX_SAFE_INTEGER]) test('invalid injected monotonic clock ' + now + ' cancels reception', () => {
  const f = offset(); event(f, 1, .5, 0); assert.deepEqual(f.e.advance(now), []); assert.equal(f.e.nextDeadlineMs(), null); assert.equal(f.e.isReceiving(), false);
});
test('backward clock cancels current reception; old token cannot poison the new clock', () => {
  const f = offset(); event(f, 1, .5, 10); assert.deepEqual(f.e.advance(9), []); assert.equal(f.e.isReceiving(), false);
  const old = f.capture.token; f.e.enableReception(7); const fresh = f.e.beginCapture(4, 'touch', 7, 11, true); assert.ok(fresh);
  assert.deepEqual(f.e.advance(1e9, old), []); assert.deepEqual(f.e.advance(12), []); assert.ok(f.e.isCaptureCurrent(fresh));
});
test('malformed context is rejected and still retires previous reception', () => {
  for (const extra of [{ ownerId: NaN }, { profileRevision: -1 }, { outputTargets: [new OutputIdentity('tcp:0', Infinity)] },
    { outputTargets: [new OutputIdentity('tcp:0', 1), new OutputIdentity('tcp:0', 2)] }, { enabledAxes: ['L0', 'L0'] },
    { enabledAxes: new Array(1) }, { foreground: 1 }]) {
    const f = offset(); event(f, 1, .5, 0); assert.throws(() => f.e.setContext(context(extra)));
    assert.equal(f.e.isReceiving(), false); assert.equal(f.e.nextDeadlineMs(), null);
  }
});
test('pure core has no timers, I/O or implicit physical-output/media boundary', () => {
  const source = readFileSync(new URL('../entry/src/main/ets/input/ContinuousDriveEngine.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(setTimeout|setInterval|Date\.now|performance\.now|fetch|connectTarget|armTarget|startPreview|playMedia)\s*\(/);
});
