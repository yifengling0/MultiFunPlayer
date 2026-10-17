import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { UiStyle } from '../entry/src/main/ets/presentation/UiStyle.ts';
import { ConfirmationOwner } from '../entry/src/main/ets/presentation/ConfirmationOwner.ts';
import { EMERGENCY_STOP_KEY } from '../entry/src/main/ets/input/ShortcutConfiguration.ts';

const source = readFileSync(new URL('../entry/src/main/ets/components/OwnedConfirmationDialog.ets', import.meta.url), 'utf8');
const helpers = source.split('@CustomDialog')[0].replace(/^import .*;\n/gm, '').replace(/export class /g, 'class ');
const Geometry = new Function('UiStyle', stripTypeScriptTypes(helpers) + '\nreturn ConfirmationDialogGeometry;')(UiStyle);
const start = source.indexOf('export struct OwnedConfirmationDialog'), end = source.indexOf('  build()', start);
const controllerCode = source.slice(start, end).replace('export struct', 'class').replace(/@(Prop|State|Watch)(\([^)]*\))?\s*/g, '') + '\n}';
const KeyCode = { KEYCODE_ESCAPE: 2070 }, KeyType = { Down: 0, Up: 1 };
const Dialog = new Function('EMERGENCY_STOP_KEY', 'KeyCode', 'KeyType', stripTypeScriptTypes(controllerCode) + '\nreturn OwnedConfirmationDialog;')(EMERGENCY_STOP_KEY, KeyCode, KeyType);
function mount(options = {}) { const dialog = new Dialog(); Object.assign(dialog, options); dialog.aboutToAppear(); return dialog; }

test('real @CustomDialog delegates the surface and has no root material masking decoration', () => {
  assert.match(source, /@CustomDialog\s+export struct OwnedConfirmationDialog/);
  assert.match(source, /controller\?: CustomDialogController/);
  const rootModifiers = source.slice(source.lastIndexOf('}.width(ConfirmationDialogGeometry.width'));
  assert.match(rootModifiers, /\.height\(ConfirmationDialogGeometry.height\(this.viewportHeight\)\)/);
  assert.doesNotMatch(rootModifiers, /background|blur|border|shadow|clip\(/i);
  assert.doesNotMatch(source, /systemMaterial\s*\(|uiMaterial|backgroundBlurStyle|\.backdropBlur\(/);
  assert.equal((source.match(/\bScroll\(/g) || []).length, 1);
});

test('short 240/320vp geometry preserves fixed48vp cancel/confirm and52vp Stop rows with bounded scroll copy', () => {
  for (const height of [240, 320, 390, 640, 900]) for (const width of [240, 320, 360, 600, 1280]) {
    const outerHeight = Geometry.height(height), messageHeight = Geometry.messageHeight(height);
    assert.ok(outerHeight <= height - 32); assert.ok(Geometry.width(width) <= width - 32);
    assert.ok(messageHeight >= 56); assert.ok(UiStyle.control >= 48);
    assert.equal(messageHeight + Geometry.inset * 2 + Geometry.gap * 2 + UiStyle.control + 52, outerHeight);
    const firstActionTop = Geometry.inset + messageHeight + Geometry.gap;
    const stopTop = firstActionTop + UiStyle.control + Geometry.gap;
    assert.equal(stopTop + 52 + Geometry.inset, outerHeight);
    assert.ok((Geometry.width(width) - Geometry.inset * 2 - Geometry.gap) / 2 >= UiStyle.control);
  }
  assert.equal(Geometry.messageHeight(240), 60); assert.equal(Geometry.messageHeight(320), 140);
  for (const height of [NaN, Infinity, -1, 0]) assert.ok(Number.isFinite(Geometry.messageHeight(height)));
  for (const width of [NaN, Infinity, -1, 0]) assert.ok(Number.isFinite(Geometry.width(width)));
  assert.match(source, /Scroll\(\)[\s\S]*\.height\(ConfirmationDialogGeometry.messageHeight\(this.viewportHeight\)\)/);
  assert.equal((source.match(/Button\(/g) || []).length, 3);
  for (const match of source.matchAll(/\bButton\(/g)) {
    const segment = source.slice(match.index, source.indexOf('.onClick(', match.index));
    assert.match(segment, /\.height\((?:UiStyle.control|52)\)/); assert.match(segment, /\.buttonStyle\(ButtonStyleMode\.(?:NORMAL|EMPHASIZED)\)/);
    assert.match(segment, /\.stateEffect\(true\)/);
  }
  assert.match(source, /Button\('停止全部输出'[\s\S]*\.backgroundColor\(UiStyle.danger\)/);
  assert.match(source, /\.onClick\(this.stopHandler\(\)\)/);
});

test('empty text has readable safe defaults and long explanatory copy is preserved without truncation', () => {
  const dialog = mount({ title: ' ', message: '\n ', confirmLabel: ' ' });
  assert.equal(dialog.displayTitle(), '请确认操作'); assert.ok(dialog.displayMessage().includes('取消'));
  assert.equal(dialog.displayConfirmLabel(), '确认');
  const long = '长标题和源名称 with unicode 🧭 '.repeat(1000);
  dialog.title = long; dialog.message = long; assert.equal(dialog.displayTitle(), long); assert.equal(dialog.displayMessage(), long);
  const copy = source.slice(source.indexOf('Scroll()'), source.indexOf('Row({ space: ConfirmationDialogGeometry.gap })'));
  assert.equal((copy.match(/wordBreak\(WordBreak.BREAK_ALL\)/g) || []).length, 2);
  assert.doesNotMatch(copy, /maxLines|TextOverflow.Ellipsis|\.clip\(/);
});

for (const action of ['confirm', 'cancel', 'stop']) test(`${action} handler never dynamically invokes a rebound callback`, () => {
  const name = 'on' + action[0].toUpperCase() + action.slice(1), events = [];
  const dialog = mount({ [name]: () => events.push('original') }); const old = dialog[action + 'Handler']();
  dialog[name] = () => events.push('replacement'); old(); assert.deepEqual(events, []);
  const current = dialog[action + 'Handler'](); current(); assert.deepEqual(events, ['replacement']);
  dialog.aboutToDisappear(); current(); old(); assert.deepEqual(events, ['replacement']);
  dialog.aboutToAppear(); current(); old(); assert.deepEqual(events, ['replacement']);
  dialog[action + 'Handler']()(); assert.deepEqual(events, ['replacement', 'replacement']);
});

test('actual shell handlers use captured owner actions and cannot confirm after Stop or cancellation', () => {
  for (const first of ['confirm', 'cancel', 'stop']) {
    const owner = new ConfirmationOwner(); const events = []; let dialog;
    const actions = owner.begin(() => true, () => events.push('confirm'), () => events.push('stop'), () => true,
      () => { events.push('dismiss'); dialog.aboutToDisappear(); });
    dialog = mount({ onConfirm: actions.accept, onCancel: actions.cancel, onStop: actions.stop });
    const callbacks = { confirm: dialog.confirmHandler(), cancel: dialog.cancelHandler(), stop: dialog.stopHandler() };
    callbacks[first](); callbacks.confirm(); callbacks.cancel(); callbacks.stop();
    assert.deepEqual(events, first === 'cancel' ? ['dismiss'] : ['dismiss', first]); assert.equal(owner.hasPending(), false);
  }
});

test('opening, copy changes and viewport resize never invoke the business or draft callbacks', () => {
  const dialog = mount({ onConfirm: () => assert.fail('confirm'), onCancel: () => assert.fail('cancel'), onStop: () => assert.fail('stop') });
  dialog.confirmHandler(); dialog.cancelHandler(); dialog.stopHandler();
  dialog.title = 'New title'; dialog.message = 'New copy'; dialog.viewportHeight = 240; dialog.viewportWidth = 320;
  dialog.displayTitle(); dialog.displayMessage(); dialog.displayConfirmLabel(); dialog.aboutToDisappear();
});

test('modal dispatch imports the reserved F12 key and routes only Down F12/ Escape without global Enter acceptance', () => {
  const events = [], dialog = mount({ onStop: () => events.push('stop'), onCancel: () => events.push('cancel'), onConfirm: () => assert.fail('global confirm') });
  const keys = dialog.keyHandler();
  for (const type of [KeyType.Up, 2, 3, -1, 999, undefined]) {
    for (const keyCode of [EMERGENCY_STOP_KEY, KeyCode.KEYCODE_ESCAPE, 2054]) assert.equal(keys({ type, keyCode }), false);
  }
  for (const keyCode of [2054, 2049, -1, 0, 99999]) assert.equal(keys({ type: KeyType.Down, keyCode }), false);
  assert.deepEqual(events, []);
  assert.equal(keys({ type: KeyType.Down, keyCode: EMERGENCY_STOP_KEY }), true);
  assert.equal(keys({ type: KeyType.Down, keyCode: KeyCode.KEYCODE_ESCAPE }), true);
  assert.deepEqual(events, ['stop', 'cancel']);
  assert.match(source, /import \{ EMERGENCY_STOP_KEY \} from '\.\.\/input\/ShortcutConfiguration'/);
  assert.match(source, /import \{ KeyCode \} from '@kit\.InputKit'/);
  assert.match(source, /\.onKeyEventDispatch\(this.keyHandler\(\)\)/);
  assert.doesNotMatch(source, /keyCode === (?:2101|2049|2070|2054)|KEYCODE_ENTER/);
});

for (const [name, keyCode] of [['onStop', EMERGENCY_STOP_KEY], ['onCancel', KeyCode.KEYCODE_ESCAPE]]) {
  test(`modal key capture rejects rebound ${name}, disappearance and remount`, () => {
    const events = [], dialog = mount({ [name]: () => events.push('original') }); const old = dialog.keyHandler();
    dialog[name] = () => events.push('replacement'); assert.equal(old({ type: KeyType.Down, keyCode }), false);
    const current = dialog.keyHandler(); assert.equal(current({ type: KeyType.Down, keyCode }), true);
    dialog.aboutToDisappear(); assert.equal(current({ type: KeyType.Down, keyCode }), false);
    dialog.aboutToAppear(); assert.equal(current({ type: KeyType.Down, keyCode }), false);
    assert.equal(old({ type: KeyType.Down, keyCode }), false); assert.deepEqual(events, ['replacement']);
  });
}

test('modal F12 takes the existing captured Stop path exactly once and cannot leave confirmation pending', () => {
  const owner = new ConfirmationOwner(), events = []; let dialog;
  const actions = owner.begin(() => true, () => events.push('confirm'), () => events.push('stop'), () => true,
    () => { events.push('dismiss'); dialog.aboutToDisappear(); });
  dialog = mount({ onConfirm: actions.accept, onCancel: actions.cancel, onStop: actions.stop });
  const keys = dialog.keyHandler(), confirm = dialog.confirmHandler();
  assert.equal(keys({ type: KeyType.Down, keyCode: EMERGENCY_STOP_KEY }), true);
  assert.equal(keys({ type: KeyType.Down, keyCode: EMERGENCY_STOP_KEY }), false);
  confirm(); assert.equal(owner.hasPending(), false); assert.deepEqual(events, ['dismiss', 'stop']);
});
