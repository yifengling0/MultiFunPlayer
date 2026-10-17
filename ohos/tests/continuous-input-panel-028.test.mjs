import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
registerHooks({ resolve(specifier, context, next) {
  return next(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? specifier + '.ts' : specifier, context);
} });
const config = await import('../entry/src/main/ets/input/ContinuousInputConfiguration.ts');
const native = await import('../entry/src/main/ets/input/LocalDrivePointer.ts');
const { SettingsDraftOwner } = await import('../entry/src/main/ets/presentation/SettingsDraftOwner.ts');
const source = readFileSync(new URL('../entry/src/main/ets/components/ContinuousInputPanel.ets', import.meta.url), 'utf8');
const SourceType = { Unknown: 0, Mouse: 1, TouchScreen: 2 };
const SourceTool = { Unknown: 0, Finger: 1, MOUSE: 3, TOUCHPAD: 4 };
const TouchType = { Down: 0, Up: 1, Move: 2, Cancel: 3 };
const MouseAction = { Press: 0, Release: 1, Move: 2, Hover: 3, CANCEL: 13 };
const MouseButton = { Left: 0, Right: 1, None: 5 };
const AxisAction = { NONE: 0, BEGIN: 1, UPDATE: 2, END: 3, CANCEL: 4 };
class SettingsOption { constructor(value, label = value) { this.value = value; this.label = label; } }
const helper = source.split('@Component')[0].replace(/^import .*;\n/gm, '').replace(/export class /g, 'class ');
const ContinuousInputEdits = new Function(...Object.keys(config), stripTypeScriptTypes(helper) + '\nreturn ContinuousInputEdits;')(...Object.values(config));
const start = source.indexOf('export struct ContinuousInputPanel'), end = source.indexOf('  @Builder', start);
const code = source.slice(start, end).replace('export struct', 'class').replace(/@(Prop|State|Watch)(\([^)]*\))?\s*/g, '') + '\n}';
const deps = { ...config, ...native, ContinuousInputEdits, SettingsDraftOwner, SettingsOption, SourceType, SourceTool, TouchType, MouseAction, MouseButton, AxisAction };
const Panel = new Function(...Object.keys(deps), stripTypeScriptTypes(code) + '\nreturn ContinuousInputPanel;')(...Object.values(deps));
function panel(overrides = {}) {
  const configuration = new config.ContinuousInputConfiguration(), mapping = new config.ContinuousInputMapping('one', 'Local');
  mapping.actions.push(new config.ContinuousInputAction('Axis::Value::Drive', 'L0')); configuration.mappings.push(mapping);
  const result = new Panel(); Object.assign(result, { configuration, selectedMappingId: 'one', ownerKey: 'owner', receptionRevision: 4,
    draftScope: 'profile:continuous', receiving: true, canReceive: true, axisOptions: [new SettingsOption('L0')], ...overrides });
  result.aboutToAppear(); return result;
}
function touchEvent(sourceType = SourceType.TouchScreen) {
  return { source: sourceType, sourceTool: SourceTool.Finger, type: TouchType.Down, timestamp: 1001000000,
    touches: [{ id: 7, x: 50, y: 25 }], changedTouches: [{ id: 7, x: 50, y: 25 }], stopPropagation() { this.stopped = true; } };
}
function mouseEvent() {
  return { source: SourceType.Mouse, sourceTool: SourceTool.MOUSE, action: MouseAction.Press, timestamp: 1001000000,
    x: 50, y: 25, button: MouseButton.Left, pressedButtons: [MouseButton.Left], rawDeltaX: 1e9,
    stopPropagation() { this.stopped = true; } };
}
function wheelEvent() {
  return { source: SourceType.Mouse, sourceTool: SourceTool.MOUSE, action: AxisAction.UPDATE, timestamp: 1001000000,
    x: 50, y: 25, getHorizontalAxisValue() { return 2; }, getVerticalAxisValue() { return 10; },
    propagation() { this.propagated = true; } };
}

test('actual native handler copies vp/source/time and prevents synthetic mouse-touch duplication', () => {
  const calls = [], p = panel({ onLocalTouch: packet => { calls.push(packet); return true; } }); const handler = p.touchHandler();
  const touch = touchEvent(); handler(touch); assert.equal(touch.stopped, true); assert.equal(calls.length, 1);
  assert.ok(calls[0] instanceof native.LocalTouchPacket); assert.equal(calls[0].touches[0].xVp, 50);
  assert.equal(calls[0].eventTimestampNs, touch.timestamp); assert.equal(calls[0].ownerKey, 'owner'); assert.equal(calls[0].receptionRevision, 4);
  touch.touches[0].x = 999; assert.equal(calls[0].touches[0].xVp, 50);
  const converted = touchEvent(SourceType.Mouse); handler(converted); assert.equal(converted.stopped, undefined); assert.equal(calls.length, 1);
});

test('actual held-mouse native handler preserves unknown button proof and ignores SDK-dependent rawDelta', () => {
  let packet; const p = panel({ onLocalMouse: value => { packet = value; return true; } });
  const event = mouseEvent(); p.mouseHandler()(event); assert.equal(event.stopped, true);
  assert.equal(packet.leftButton, true); assert.equal(packet.pressedLeft, true); assert.equal(packet.xVp, 50);
  assert.equal('rawDeltaX' in packet, false);
  delete event.pressedButtons; p.mouseHandler()(event); assert.equal(packet.pressedLeft, null);
  event.pressedButtons = []; p.mouseHandler()(event); assert.equal(packet.pressedLeft, false);
  event.action = MouseAction.CANCEL; p.mouseHandler()(event); assert.equal(packet.phase, 'cancel');
});

test('axis handler synchronously propagates every unhandled path and consumes only explicit admission', () => {
  const p = panel(); let calls = 0;
  p.onLocalWheel = () => { calls++; return false; };
  const declined = wheelEvent(); p.wheelHandler()(declined); assert.equal(declined.propagated, true); assert.equal(calls, 1);
  p.receiving = false; const disabled = wheelEvent(); p.wheelHandler()(disabled); assert.equal(disabled.propagated, true); assert.equal(calls, 1);
  p.receiving = true; p.readOnly = true; const readonly = wheelEvent(); p.wheelHandler()(readonly); assert.equal(readonly.propagated, true);
  p.readOnly = false; const stale = p.wheelHandler(); p.receptionRevision++; const replaced = wheelEvent(); stale(replaced); assert.equal(replaced.propagated, true);
  p.onLocalWheel = packet => { calls++; assert.equal(packet.verticalAxisValue, 10); assert.equal(packet.tool, 'mouse'); return true; };
  const accepted = wheelEvent(); p.wheelHandler()(accepted); assert.equal(accepted.propagated, undefined);
  const unknown = wheelEvent(); unknown.source = SourceType.Unknown; p.wheelHandler()(unknown); assert.equal(unknown.propagated, true);
  p.onLocalWheel = () => { throw new Error('adapter failure'); };
  const failed = wheelEvent(); assert.throws(() => p.wheelHandler()(failed), /adapter failure/); assert.equal(failed.propagated, true);
});

test('old native/edit/enable callbacks reject changed props before Watch or callback rebinding', () => {
  for (const mutate of [p => { p.configuration = config.ContinuousInputConfiguration.clone(p.configuration); },
    p => { p.draftOwner = new SettingsDraftOwner(); }, p => { p.configuration = config.ContinuousInputConfiguration.clone(p.configuration); p.configuration.mappings[0].invert = true; },
    p => { p.ownerKey = 'replacement'; }, p => { p.receptionRevision++; }, p => { p.selectedMappingId = 'other'; },
    p => { p.draftEpoch++; }, p => { p.axisOptions = [new SettingsOption('L1')]; }, p => { p.outputOptions = [new SettingsOption('tcp:0')]; },
    p => { p.onChange = () => {}; }, p => { p.readOnly = true; }]) {
    let calls = 0; const p = panel({ onLocalTouch: () => { calls++; return true; }, onEnable: () => { calls++; } });
    const touch = p.touchHandler(), edit = p.number(() => { calls++; return true; });
    p.receiving = false; const enable = p.enableHandler(); p.receiving = true;
    mutate(p); touch(touchEvent()); edit(.5); p.receiving = false; enable(); assert.equal(calls, 0);
  }
  let calls = 0; const p = panel({ onLocalMouse: () => { calls++; return true; } }); const old = p.mouseHandler();
  p.onLocalMouse = () => { calls++; return true; }; old(mouseEvent()); assert.equal(calls, 0);
});

test('status-only rerender does not retire current native callback or geometry ownership', () => {
  let calls = 0; const p = panel({ onLocalTouch: () => { calls++; return true; } }); const handler = p.touchHandler();
  p.latestValue = .7; p.latestDelta = .1; p.status = '接触中'; p.lastAction = 'Axis::Value::Drive'; handler(touchEvent()); assert.equal(calls, 1);
  let geometry; p.onSurfaceChanged = value => { geometry = value; }; const area = p.areaHandler();
  area({}, { width: 200, height: 100, globalPosition: { x: 10, y: 20 } }); assert.equal(geometry.widthVp, 200); assert.equal(geometry.windowXVp, 10);
  p.receptionRevision++; geometry = null; area({}, { width: 300, height: 100, globalPosition: { x: 10, y: 20 } }); assert.equal(geometry, null);
});

test('leave, blur and teardown cancel with exact reception scope without invented zero sample', () => {
  const calls = [], p = panel({ onCancel: (...args) => calls.push(args) });
  p.hoverHandler()(false); assert.deepEqual(calls[0], ['left-region', 'owner', 4]);
  p.cancelHandler('surface-blur')(); assert.deepEqual(calls[1], ['surface-blur', 'owner', 4]);
  const late = p.touchHandler(); p.aboutToDisappear(); assert.deepEqual(calls[2], ['surface-disappeared', 'owner', 4]);
  const event = touchEvent(); late(event); assert.equal(event.stopped, undefined);
});

test('pending explicit-confirm draft blocks enable; clearing pending still requires an explicit button action', () => {
  let enabled = 0; const p = panel({ receiving: false, onEnable: () => { enabled++; } });
  const draft = p.draftOwner.open(p.draftScope, 'continuous:one:speed', 'source', '.1');
  p.draftOwner.write(draft.token, 'source', '1e-', true); assert.equal(p.available(), false); p.enableHandler()(); assert.equal(enabled, 0);
  p.draftOwner.write(draft.token, 'source', '.1', false); assert.equal(p.available(), true); assert.equal(enabled, 0);
  p.enableHandler()(); assert.equal(enabled, 1);
});

test('detached mapping edits preserve other rows, nine targets, reverse limits and invalid-value rejection', () => {
  const p = panel(), before = JSON.stringify(p.configuration);
  const next = ContinuousInputEdits.source(p.configuration, 'one', 'wheel');
  assert.equal(next.mappings[0].kind, 'drive'); assert.equal(next.mappings[0].component, 'wheelY'); assert.equal(JSON.stringify(p.configuration), before);
  assert.equal(ContinuousInputEdits.mapping(p.configuration, 'one', item => { item.speed = Infinity; }), null);
  assert.equal(ContinuousInputEdits.mapping(p.configuration, 'one', item => { item.wheelSpan = 0; }), null);
  assert.equal(config.continuousActionCatalog().length, 9);
  assert.equal(ContinuousInputEdits.action(p.configuration, 'one', -1, () => {}), null);
  const ranges = ContinuousInputEdits.mapping(p.configuration, 'one', item => {
    item.actions = [new config.ContinuousInputAction('OutputTarget::Axis::Range::Middle::Drive', 'L0', '', 'tcp:0', .8, .2)];
  });
  assert.equal(ranges.mappings[0].actions[0].minimumLimit, .8); assert.equal(ranges.mappings[0].actions[0].maximumLimit, .2);
});

test('UI uses existing drafts/material controls, one selected editor and local native events without fake slider', () => {
  for (const name of ['SettingsNumberField', 'SettingsTextField', 'SettingsSwitchField', 'SettingsChoiceField', 'SettingsSectionTitle']) assert.ok(source.includes(name));
  for (const hook of ['.onTouch(this.touchHandler())', '.onMouse(this.mouseHandler())', '.onAxisEvent(this.wheelHandler())', '.onHover(this.hoverHandler())', '.onAreaChange(this.areaHandler())']) assert.ok(source.includes(hook));
  assert.ok(source.includes('ForEach(this.selectedMappings()')); assert.ok(source.includes('UiStyle.control'));
  assert.ok(source.includes('draftGuard: this.editGuard()')); assert.ok(source.includes('onEdit: this.cancelHandler'));
  assert.ok(!source.includes('Slider(')); assert.ok(!source.includes('setInterval(')); assert.ok(!source.includes('onBlur(() => this.commit'));
  assert.ok(!source.includes('getPinchAxisScaleValue')); assert.ok(!source.includes('hasAxis('));
});

test('opening a mapping editor cancels before editing and does not consume native controls', () => {
  const calls = [], p = panel({ onCancel: (...args) => calls.push(args) });
  const touch = touchEvent(); p.editorTouchHandler()(touch); assert.equal(touch.stopped, undefined);
  const mouse = mouseEvent(); p.editorMouseHandler()(mouse); assert.equal(mouse.stopped, undefined);
  assert.equal(calls.length, 2); assert.equal(calls[0][0], 'editor-opened');
  p.receiving = false; p.editorTouchHandler()(touch); assert.equal(calls.length, 2);
});
