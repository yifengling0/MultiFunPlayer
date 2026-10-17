import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, next) {
  return next(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? specifier + '.ts' : specifier, context);
} });
const { ContinuousInputMapping } = await import('../entry/src/main/ets/input/ContinuousInputConfiguration.ts');
const { LocalDrivePointer, LocalSurfaceGeometry, LocalTouchPoint, LocalTouchPacket, LocalMousePacket, LocalWheelPacket } =
  await import('../entry/src/main/ets/input/LocalDrivePointer.ts');
const NS = 1e6;
function setup(source = 'touch', kind = 'drive') {
  const pointer = new LocalDrivePointer(), mapping = new ContinuousInputMapping('one', 'Local');
  mapping.source = source; mapping.component = source === 'wheel' ? 'wheelY' : 'x'; mapping.kind = kind;
  pointer.setGeometry(new LocalSurfaceGeometry(200, 100, 10, 20));
  assert.equal(pointer.enable('page:profile:axis:target', 4, mapping, 1000 * NS), true);
  return { pointer, mapping };
}
function touch(phase, time, x = 50, id = 7, options = {}) {
  const point = new LocalTouchPoint(id, x, 25);
  return Object.assign(new LocalTouchPacket('page:profile:axis:target', 4, phase, time * NS, 2, 1,
    'touch', phase === 'end' ? [] : [point], [point]), options);
}
function mouse(phase, time, x = 50, options = {}) {
  return Object.assign(new LocalMousePacket('page:profile:axis:target', 4, phase, time * NS, 1, 3,
    'mouse', x, 25, true, true), options);
}
function wheel(phase, time, dy = 10, options = {}) {
  return Object.assign(new LocalWheelPacket('page:profile:axis:target', 4, phase, time * NS, 1, 3,
    'mouse', 'mouse', 50, 25, 0, dy), options);
}

test('real local contact starts with zero displacement; span-normalized moves retain ns and explicit dt0', () => {
  const { pointer } = setup();
  const down = pointer.touch(touch('begin', 1001), 1001 * NS);
  assert.equal(down.handled, true); assert.equal(down.gesture.value, .25); assert.equal(down.gesture.delta, 0);
  assert.equal(down.gesture.pointerId, 7); assert.equal(down.gesture.contactActive, true);
  const moved = pointer.touch(touch('update', 1002, 100), 1002 * NS);
  assert.equal(moved.gesture.value, .5); assert.equal(moved.gesture.delta, .25);
  assert.equal(moved.gesture.deltaTime, 0); assert.equal(moved.gesture.nativeTimestamp, 1002 * NS);
  assert.equal(moved.gesture.nativeTimestampUnit, 'ns'); assert.equal(moved.contactSerial, down.contactSerial);
});

test('UP ends contact without fabricating a sample and permits only a fresh physical contact', () => {
  const { pointer } = setup(); const first = pointer.touch(touch('begin', 1001), 1001 * NS);
  const up = pointer.touch(touch('end', 1002), 1002 * NS);
  assert.equal(up.contactEnded, true); assert.equal(up.gesture, null); assert.equal(pointer.isReceiving(), true);
  assert.equal(pointer.isContactActive(), false); assert.equal(pointer.touch(touch('update', 1003), 1003 * NS).handled, false);
  assert.ok(pointer.touch(touch('begin', 1004), 1004 * NS).contactSerial > first.contactSerial);
});

test('converted mouse onTouch and unknown sources never create or disturb touch ownership', () => {
  const { pointer } = setup();
  assert.equal(pointer.touch(touch('begin', 1001, 50, 7, { source: 'mouse' }), 1001 * NS).handled, false);
  assert.equal(pointer.isContactActive(), false); assert.equal(pointer.isReceiving(), true);
  pointer.touch(touch('begin', 1002), 1002 * NS);
  assert.equal(pointer.touch(touch('cancel', 1003, 50, 7, { source: 'mouse' }), 1003 * NS).receptionCancelled, false);
  assert.equal(pointer.isContactActive(), true);
});

test('wrong owner/revision cannot feed or cancel a new reception even with matching pointer number', () => {
  const { pointer, mapping } = setup(); pointer.touch(touch('begin', 1001), 1001 * NS);
  assert.equal(pointer.enable('replacement', 5, mapping, 1002 * NS), true);
  assert.equal(pointer.touch(touch('cancel', 1003), 1003 * NS).receptionCancelled, false);
  assert.equal(pointer.touch(touch('begin', 1003), 1003 * NS).handled, false);
  assert.equal(pointer.touch(touch('begin', 1003, 50, 7, { ownerKey: 'replacement', receptionRevision: 5 }), 1003 * NS).handled, true);
});

test('multi-contact, unrelated pointer and empty cancel arrays retire reception', () => {
  for (const make of [() => touch('begin', 1002, 80, 9), () => touch('update', 1002, 80, 9),
    () => touch('update', 1002, 80, 7, { touches: [new LocalTouchPoint(7, 80, 25), new LocalTouchPoint(9, 40, 25)] }),
    () => touch('cancel', NaN, 0, 0, { touches: [], changedTouches: [] })]) {
    const { pointer } = setup(); pointer.touch(touch('begin', 1001), 1001 * NS);
    const result = pointer.touch(make(), 1002 * NS);
    assert.equal(result.receptionCancelled, true); assert.equal(result.gesture, null); assert.equal(pointer.isReceiving(), false);
  }
});

test('out-of-region and every nonfinite position cancel with no implicit clamp or automatic reentry', () => {
  for (const x of [-.001, 200.001, NaN, Infinity, -Infinity]) {
    const { pointer } = setup(); pointer.touch(touch('begin', 1001), 1001 * NS);
    assert.equal(pointer.touch(touch('update', 1002, x), 1002 * NS).receptionCancelled, true);
    assert.equal(pointer.touch(touch('begin', 1003, 50), 1003 * NS).handled, false);
  }
});

test('backward, pre-enable, nonfinite, too old and future timestamps cancel; equal ns is valid', () => {
  const { pointer } = setup(); pointer.touch(touch('begin', 1001), 1001 * NS);
  assert.equal(pointer.touch(touch('update', 1001, 60), 1001 * NS).handled, true);
  assert.equal(pointer.touch(touch('update', 1000.9, 60), 1002 * NS).receptionCancelled, true);
  for (const [eventMs, nowMs] of [[999, 1001], [NaN, 1001], [Infinity, 1001], [1001, 1502], [1003, 1001]]) {
    const sample = setup().pointer;
    assert.equal(sample.touch(touch('begin', eventMs), nowMs * NS).receptionCancelled, true);
  }
});

test('same layout and status renders retain capture; resize and relocation retire it', () => {
  const { pointer, mapping } = setup(); pointer.touch(touch('begin', 1001), 1001 * NS);
  assert.equal(pointer.setGeometry(new LocalSurfaceGeometry(200, 100, 10, 20)), false);
  assert.equal(pointer.isContactActive(), true);
  assert.equal(pointer.setGeometry(new LocalSurfaceGeometry(200, 100, 11, 20)), true); assert.equal(pointer.isReceiving(), false);
  assert.equal(pointer.enable('page:profile:axis:target', 4, mapping, 1002 * NS), true);
  pointer.setGeometry(new LocalSurfaceGeometry(201, 100, 11, 20)); assert.equal(pointer.isReceiving(), false);
  pointer.setGeometry(new LocalSurfaceGeometry(0, 100, 11, 20));
  assert.equal(pointer.enable('page:profile:axis:target', 4, mapping, 1003 * NS), false);
});

test('mouse move/hover never proves hold; owned left press uses local vp differences regardless of raw values', () => {
  const { pointer } = setup('mouse');
  assert.equal(pointer.mouse(mouse('update', 1001), 1001 * NS).handled, false);
  assert.equal(pointer.mouse(mouse('unknown', 1001), 1001 * NS).handled, false);
  assert.equal(pointer.mouse(mouse('begin', 1001, 50, { leftButton: false }), 1001 * NS).handled, false);
  const down = pointer.mouse(mouse('begin', 1002, 50, { pressedLeft: null }), 1002 * NS);
  assert.equal(down.gesture.delta, 0); assert.equal(down.gesture.contactActive, true);
  const move = pointer.mouse(mouse('update', 1003, 70, { rawDeltaX: 1e9, rawDeltaY: NaN, pressedLeft: null }), 1003 * NS);
  assert.equal(move.gesture.delta, .1); assert.equal(move.gesture.deltaTime, 0);
  assert.equal(pointer.mouse(mouse('update', 1004, 70, { pressedLeft: false }), 1004 * NS).receptionCancelled, true);
});

test('mouse normal release keeps ready; native cancel/leave/focus revoke until enable', () => {
  const { pointer } = setup('mouse'); pointer.mouse(mouse('begin', 1001), 1001 * NS);
  assert.equal(pointer.mouse(mouse('end', 1002), 1002 * NS).contactEnded, true); assert.equal(pointer.isReceiving(), true);
  pointer.mouse(mouse('begin', 1003), 1003 * NS);
  assert.equal(pointer.mouse(mouse('cancel', 1004), 1004 * NS).receptionCancelled, true);
  assert.equal(pointer.mouse(mouse('begin', 1005), 1005 * NS).handled, false);
  for (const reason of ['left-region', 'surface-blur', 'background', 'stop', 'text-edit']) {
    const p = setup('mouse').pointer; p.mouse(mouse('begin', 1001), 1001 * NS);
    assert.equal(p.cancel(reason).receptionCancelled, true); assert.equal(p.isContactActive(), false);
  }
});

test('wheel keeps original axis number and calibrates explicitly with .5 origin, no hold, no120 conversion', () => {
  const { pointer } = setup('wheel'); const packet = wheel('begin', 1001, 10);
  const first = pointer.wheel(packet, 1001 * NS);
  assert.equal(packet.verticalAxisValue, 10); assert.equal(first.gesture.delta, .1); assert.equal(first.gesture.value, .6);
  assert.equal(first.gesture.deltaTime, 0); assert.equal(first.gesture.contactActive, false); assert.equal(pointer.isContactActive(), false);
  const second = pointer.wheel(wheel('update', 1002, -30, { tool: 'touchpad' }), 1002 * NS);
  assert.ok(Math.abs(second.gesture.value - .3) < 1e-12); assert.equal(second.gesture.delta, -.3);
  assert.equal(pointer.wheel(wheel('end', 1003), 1003 * NS).handled, false); assert.equal(pointer.isReceiving(), true);
  assert.equal(pointer.wheel(wheel('update', 1004, 0), 1004 * NS).handled, false);
  assert.equal(pointer.wheel(wheel('update', 1005, 10, { tool: 'unknown' }), 1005 * NS).handled, false);
});

test('wheel never starts offset, nonfinite axis cancels, and source data cannot mutate captured mapping', () => {
  const { pointer, mapping } = setup('wheel'); mapping.kind = 'offset'; mapping.wheelSpan = .1;
  assert.equal(pointer.wheel(wheel('begin', 1001, 10), 1001 * NS).gesture.delta, .1);
  assert.equal(pointer.wheel(wheel('update', 1002, Infinity), 1002 * NS).receptionCancelled, true);
  assert.equal(pointer.enable('page:profile:axis:target', 4, mapping, 1003 * NS), false);
});
