import { SettingsDraftOwner } from '../entry/src/main/ets/presentation/SettingsDraftOwner.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { sep } from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { KeyboardInputSession as Keyboard } from '../entry/src/main/ets/app/KeyboardInputSession.ts';
import { ErrorPresentation, horizontalWorkspace } from '../entry/src/main/ets/presentation/GeneralPresentation.ts';
import { videoWorkspaceLayout } from '../entry/src/main/ets/core/VideoLayout.ts';

const etsRoot = new URL('../entry/src/main/ets/', import.meta.url);
const source = path => readFileSync(new URL(path, etsRoot), 'utf8');
const F12 = 2101;

function session(t, emergencyResult = true) {
  const ids = [];
  const editing = [];
  const emergency = [];
  const owner = Keyboard.setListener(value => editing.push(value), (key, pressed) => {
    emergency.push([key, pressed]); return emergencyResult;
  });
  t.after(() => {
    for (const id of ids) Keyboard.releaseEditor(id);
    Keyboard.releaseListener(owner);
    assert.equal(Keyboard.isEditing(), false, 'the test must release every focused editor');
  });
  return {
    editing, emergency, owner,
    create() { const id = Keyboard.newEditorId(); ids.push(id); return id; },
    renew(id) { const next = Keyboard.renewEditor(id); ids.push(next); return next; }
  };
}

function callbacks(id, changes, commits) {
  return {
    focus: Keyboard.focusHandler(id, true),
    unfocus: Keyboard.focusHandler(id, false),
    blur: Keyboard.blurHandler(id, () => commits.push(id)),
    change: Keyboard.changeHandler(id, value => changes.push(value)),
    submit: Keyboard.submitHandler(id, () => commits.push(id)),
    emergency: Keyboard.emergencyHandler(id)
  };
}

test('focus is an aggregate of live editors with edge-only notifications', t => {
  const f = session(t); const first = f.create(); const second = f.create();
  assert.notEqual(first, second);
  assert.deepEqual(f.editing, [false]);
  for (const id of [0, -1, NaN, Infinity, .5, Number.MAX_SAFE_INTEGER + 1, 999999]) {
    Keyboard.setEditorFocus(id, true);
  }
  assert.equal(Keyboard.isEditing(), false);
  Keyboard.setEditorFocus(first, true); Keyboard.setEditorFocus(first, true);
  Keyboard.setEditorFocus(second, true); Keyboard.setEditorFocus(first, false);
  assert.equal(Keyboard.isEditing(), true);
  assert.deepEqual(f.editing, [false, true]);
  Keyboard.releaseEditor(second); Keyboard.releaseEditor(second);
  assert.equal(Keyboard.isEditing(), false);
  assert.deepEqual(f.editing, [false, true, false]);
  Keyboard.setEditorFocus(second, true);
  assert.equal(Keyboard.isEditing(), false, 'released IDs cannot regain focus');
});

test('renewal preserves focus without a false transition and revokes every old callback', t => {
  const f = session(t); const changes = []; const commits = [];
  const first = f.create(); const old = callbacks(first, changes, commits);
  old.focus(); old.change('before renewal'); old.submit();
  const next = f.renew(first); const current = callbacks(next, changes, commits);
  assert.notEqual(next, first);
  assert.equal(Keyboard.isEditing(), true);
  assert.deepEqual(f.editing, [false, true]);
  old.blur(); old.unfocus(); old.change('stale typed text'); old.submit();
  assert.equal(old.emergency({ keyCode: F12, type: 0 }), false);
  assert.equal(old.emergency({ keyCode: F12, type: 1 }), false);
  assert.equal(old.emergency({ keyCode: 2017, type: 0 }), false);
  assert.deepEqual(changes, ['before renewal']); assert.deepEqual(commits, [first]);
  assert.deepEqual(f.emergency, []); assert.equal(Keyboard.isEditing(), true);
  current.change('current text'); current.submit(); current.blur();
  assert.deepEqual(changes, ['before renewal', 'current text']);
  assert.deepEqual(commits, [first, next, next]);
  assert.equal(Keyboard.isEditing(), false);
  old.focus();
  assert.equal(Keyboard.isEditing(), false, 'late focus cannot revive the old editor');
  assert.deepEqual(f.editing, [false, true, false]);
  current.focus(); assert.equal(current.emergency({ keyCode: F12, type: 0 }), true);
  assert.deepEqual(f.emergency, [[F12, true]]);
});

test('renewing an unfocused editor stays unfocused and cannot interfere with another editor', t => {
  const f = session(t); const focused = f.create(); const idle = f.create();
  Keyboard.setEditorFocus(focused, true);
  const next = f.renew(idle);
  Keyboard.releaseEditor(next);
  assert.equal(Keyboard.isEditing(), true);
  assert.deepEqual(f.editing, [false, true]);
  Keyboard.releaseEditor(focused);
  assert.deepEqual(f.editing, [false, true, false]);
});

test('unmount/remount rejects old focus, blur, text, submit and emergency callbacks', t => {
  const f = session(t); const changes = []; const commits = [];
  const previous = f.create(); const old = callbacks(previous, changes, commits);
  old.focus(); Keyboard.releaseEditor(previous);
  const next = f.create(); const current = callbacks(next, changes, commits);
  current.focus(); old.blur(); old.unfocus(); old.change('late'); old.submit();
  assert.equal(old.emergency({ keyCode: F12, type: 0 }), false);
  assert.equal(old.emergency({ keyCode: 2017, type: 0 }), false);
  assert.deepEqual(changes, []); assert.deepEqual(commits, []);
  assert.deepEqual(f.emergency, []);
  assert.equal(Keyboard.isEditing(), true);
  current.unfocus(); old.focus(); assert.equal(Keyboard.isEditing(), false);
  current.change('live'); current.submit();
  assert.deepEqual(changes, ['live']); assert.deepEqual(commits, [next]);
});

test('listener ownership survives stale page teardown and reflects focus at installation', t => {
  const f = session(t); const id = f.create(); Keyboard.setEditorFocus(id, true);
  const editing = []; const emergencies = [];
  const replacement = Keyboard.setListener(value => editing.push(value), (key, pressed) => {
    emergencies.push([key, pressed]); return true;
  });
  t.after(() => Keyboard.releaseListener(replacement));
  assert.deepEqual(editing, [true]);
  Keyboard.releaseListener(f.owner);
  assert.equal(Keyboard.handleEmergencyKey(F12, true), true);
  Keyboard.setEditorFocus(id, false);
  assert.deepEqual(editing, [true, false]); assert.deepEqual(f.editing, [false, true]);
  assert.deepEqual(emergencies, [[F12, true]]); assert.deepEqual(f.emergency, []);
  Keyboard.setEditorFocus(id, true); Keyboard.releaseListener(replacement);
  assert.equal(Keyboard.isEditing(), true, 'listener teardown does not own editor focus');
  assert.equal(Keyboard.handleEmergencyKey(F12, false), false);
  const final = Keyboard.setListener(value => editing.push(value), () => false);
  t.after(() => Keyboard.releaseListener(final));
  assert.equal(editing.at(-1), true);
  Keyboard.releaseListener(replacement);
  Keyboard.setEditorFocus(id, false); assert.equal(editing.at(-1), false);
});

test('only F12 can be consumed by pre-IME routing; invalid event phases are always rejected', t => {
  const f = session(t); const id = f.create(); const emergency = Keyboard.emergencyHandler(id);
  for (const keyCode of [0, 1, 32, 65, 2017, 2047, 2070, 2072, 2100, 2102, NaN, Infinity]) {
    for (const type of [0, 1]) assert.equal(emergency({ keyCode, type }), false);
  }
  for (const type of [-1, 2, 3, NaN, Infinity, '0']) assert.equal(emergency({ keyCode: F12, type }), false);
  assert.deepEqual(f.emergency, []);
  assert.equal(emergency({ keyCode: F12, type: 0 }), true);
  assert.equal(emergency({ keyCode: F12, type: 1 }), true);
  assert.deepEqual(f.emergency, [[F12, true], [F12, false]]);
  const refusing = Keyboard.setListener(() => {}, () => false);
  t.after(() => Keyboard.releaseListener(refusing));
  assert.equal(emergency({ keyCode: F12, type: 0 }), false);
  Keyboard.releaseListener(refusing);
  assert.equal(emergency({ keyCode: F12, type: 0 }), false);
});

test('focused pre-IME reports only physical transitions, never consumes typing or retains text/history', t => {
  const f = session(t); const id = f.create(); const changes = [];
  const change = Keyboard.changeHandler(id, text => changes.push(text));
  const emergency = Keyboard.emergencyHandler(id);
  Keyboard.setEditorFocus(id, true);
  const retainedState = () => structuredClone(Object.fromEntries(Object.getOwnPropertyNames(Keyboard)
    .filter(key => !['prototype', 'length', 'name'].includes(key) && typeof Keyboard[key] !== 'function')
    .map(key => [key, Keyboard[key]])));
  const before = retainedState();
  const text = ['private host name', '秘密输入🙂', 'composition text', '', 'private\npath'];
  for (const value of text) change(value);
  const expectedTransitions = [];
  for (let keyCode = 2000; keyCode < 2200; keyCode++) {
    if (keyCode === F12) continue;
    for (const type of [0, 1]) {
      const event = { keyCode, type, get keyText() { assert.fail('pre-IME must never inspect typed text'); } };
      assert.equal(emergency(event), false, 'ordinary keys must never be consumed');
      expectedTransitions.push([keyCode, type === 0]);
    }
  }
  assert.deepEqual(changes, text);
  assert.deepEqual(retainedState(), before);
  assert.deepEqual(f.emergency, expectedTransitions, 'physical edges must reach the inhibited shortcut runtime');
  Keyboard.setEditorFocus(id, false);
  emergency({ keyCode: 2017, type: 0 }); emergency({ keyCode: 2017, type: 1 });
  assert.deepEqual(f.emergency, expectedTransitions, 'unfocused field callbacks cannot feed ordinary keys');
});

test('focused physical-key observation forwards exactly keyCode and phase while editing remains inhibited', t => {
  const f = session(t); const id = f.create(); const received = [];
  const owner = Keyboard.setListener(() => {}, (...args) => {
    assert.equal(Keyboard.isEditing(), true);
    received.push(args); return true;
  });
  t.after(() => Keyboard.releaseListener(owner));
  Keyboard.setEditorFocus(id, true); const old = Keyboard.emergencyHandler(id);
  assert.equal(old({ keyCode: 2017, type: 0, keyText: 'private typed character' }), false);
  const renewed = f.renew(id); const current = Keyboard.emergencyHandler(renewed);
  assert.equal(old({ keyCode: 2017, type: 1 }), false);
  assert.deepEqual(received, [[2017, true]]);
  assert.equal(current({ keyCode: 2017, type: 1 }), false);
  for (const type of [-1, 2, NaN, '0']) assert.equal(current({ keyCode: 2017, type }), false);
  assert.deepEqual(received, [[2017, true], [2017, false]]);
});

// Execute real ArkUI component controller methods and callback expressions. Only
// decorator syntax and the declarative build body are removed for Node execution.
const fieldsSource = source('components/CurvePointEditor.ets');
const numberLogic = fieldsSource.slice(fieldsSource.indexOf('export class SettingsNumberLogic'),
  fieldsSource.indexOf('export class SettingsOption')).replace('export class', 'class');
const SettingsNumberLogic = new Function(stripTypeScriptTypes(numberLogic) + '; return SettingsNumberLogic;')();

function fieldClass(name) {
  const start = fieldsSource.indexOf('export struct ' + name);
  const end = fieldsSource.indexOf('  build()', start);
  assert.ok(start >= 0 && end > start, name);
  const code = fieldsSource.slice(start, end).replace('export struct', 'class')
    .replace(/@(Prop|State|Watch|StorageLink)(\([^)]*\))?\s*/g, '') + '\n}';
  return new Function('SettingsDraftOwner', 'KeyboardInputSession', 'SettingsNumberLogic',
    stripTypeScriptTypes(code) + '; return ' + name + ';')(SettingsDraftOwner, Keyboard, SettingsNumberLogic);
}

function closeParen(text, start) {
  let depth = 0; let quote = '';
  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (quote) {
      if (char === '\\') { index++; continue; }
      if (char === quote) quote = '';
    } else if (char === "'" || char === '"' || char === '`') quote = char;
    else if (char === '(') depth++;
    else if (char === ')' && --depth === 0) return index;
  }
  assert.fail('Unclosed callback expression');
}

function textInputs(text) {
  const results = [];
  for (const match of text.matchAll(/\bTextInput\s*\(/g)) {
    const calls = new Map(); let index = closeParen(text, text.indexOf('(', match.index)) + 1;
    while (true) {
      const chain = /^\s*\.(\w+)\s*\(/.exec(text.slice(index));
      if (!chain) break;
      const open = index + chain[0].length - 1; const end = closeParen(text, open);
      calls.set(chain[1], text.slice(open + 1, end)); index = end + 1;
    }
    results.push(calls);
  }
  return results;
}

function fieldCallbacks(name, field) {
  const start = fieldsSource.indexOf('export struct ' + name);
  const end = fieldsSource.indexOf('@Component', start);
  const [input] = textInputs(fieldsSource.slice(start, end < 0 ? undefined : end));
  return Object.fromEntries(['onFocus', 'onBlur', 'onChange', 'onSubmit', 'onKeyPreIme'].map(name => {
    assert.ok(input.has(name), name);
    const callback = new Function('KeyboardInputSession',
      'return (' + stripTypeScriptTypes(input.get(name)) + ');').call(field, Keyboard);
    return [name, callback];
  }));
}

for (const [name, initial, refreshed, nextText, expected] of [
  ['SettingsNumberField', 10, 30, '31', 31],
  ['SettingsTextField', 'original', 'refreshed', 'new text', 'new text']
]) test(name + ' real lifecycle and render-bound hooks reject stale edits after value refresh and remount', t => {
  const f = session(t); const Field = fieldClass(name); const field = new Field(); const commits = [];
  t.after(() => field.aboutToDisappear());
  field.value = initial; field.onCommit = value => { commits.push(value); return true; };
  field.aboutToAppear(); const firstId = field.keyboardEditorId; const old = fieldCallbacks(name, field);
  old.onFocus(); old.onChange('unfinished draft');
  field.value = refreshed; field.refreshValue();
  assert.notEqual(field.keyboardEditorId, firstId);
  assert.equal(field.draft, String(refreshed)); assert.equal(Keyboard.isEditing(), true);
  assert.deepEqual(f.editing, [false, true]);
  old.onChange('obsolete edit'); old.onSubmit(); old.onBlur();
  assert.equal(old.onKeyPreIme({ keyCode: F12, type: 0 }), false);
  assert.equal(field.draft, String(refreshed)); assert.deepEqual(commits, []);
  assert.equal(Keyboard.isEditing(), true);
  const current = fieldCallbacks(name, field);
  current.onChange(nextText); current.onBlur();
  assert.deepEqual(commits, [], 'blur only retains the unapplied draft');
  current.onSubmit();
  assert.deepEqual(commits, [expected]); assert.equal(Keyboard.isEditing(), false);
  old.onFocus(); assert.equal(Keyboard.isEditing(), false);
  current.onFocus(); assert.equal(current.onKeyPreIme({ keyCode: F12, type: 0 }), true);
  field.aboutToDisappear(); assert.equal(Keyboard.isEditing(), false);
  field.value = initial; field.aboutToAppear();
  const remounted = fieldCallbacks(name, field); remounted.onFocus();
  current.onChange('stale after remount'); current.onSubmit(); current.onBlur();
  assert.equal(current.onKeyPreIme({ keyCode: F12, type: 0 }), false);
  assert.equal(field.draft, String(initial)); assert.equal(Keyboard.isEditing(), true);
  assert.deepEqual(commits, [expected]);
  remounted.onChange(nextText); remounted.onSubmit();
  assert.deepEqual(commits, [expected, expected]);
  field.aboutToDisappear();
});

test('every production TextInput binds change, focus, blur and pre-IME to the rendered editor ID', () => {
  const owners = [];
  for (const path of readdirSync(etsRoot, { recursive: true }).filter(path => path.endsWith('.ets'))) {
    const normalized = path.split(sep).join('/');
    for (const calls of textInputs(source(path))) {
      owners.push(normalized);
      const focus = /^KeyboardInputSession\.focusHandler\(this\.(\w+), true\)$/.exec(calls.get('onFocus') ?? '');
      if (normalized === 'pages/Index.ets') {
        assert.equal(calls.get('onFocus'), 'this.librarySearchFocusHandler(true)');
        assert.equal(calls.get('onBlur'), 'this.librarySearchFocusHandler(false)');
        assert.equal(calls.get('onChange'), 'KeyboardInputSession.changeHandler(this.librarySearchEditor, this.librarySearchHandler())');
        assert.equal(calls.get('onKeyPreIme'), 'KeyboardInputSession.emergencyHandler(this.librarySearchEditor)');
        assert.match(source(path), /const revision = this.screenRevision; const editor = this.librarySearchEditor/);
        continue;
      }
      assert.ok(focus, normalized + ': missing bound focus callback');
      const id = focus[1];
      assert.match(calls.get('onChange') ?? '', new RegExp('^KeyboardInputSession\\.changeHandler\\(this\\.' + id + ','), normalized);
      assert.match(calls.get('onBlur') ?? '', new RegExp('^KeyboardInputSession\\.(?:focusHandler|blurHandler)\\(this\\.' + id + ','), normalized);
      if (calls.get('onBlur').includes('.focusHandler(')) assert.ok(calls.get('onBlur').endsWith(', false)'), normalized);
      assert.equal(calls.get('onKeyPreIme'), 'KeyboardInputSession.emergencyHandler(this.' + id + ')', normalized);
      if (calls.has('onSubmit')) assert.match(calls.get('onSubmit'), new RegExp('^KeyboardInputSession\\.submitHandler\\(this\\.' + id + ','), path);
      assert.equal(calls.has('onKeyEvent'), false, 'ordinary field keys must stay private: ' + path);
    }
  }
  assert.deepEqual(owners.sort(), [
    'pages/Index.ets',
    'components/CurvePointEditor.ets', 'components/CurvePointEditor.ets',
    'components/DeviceSettingsPanel.ets', 'components/DeviceSettingsPanel.ets',
  ].sort());
});

test('errors deduplicate by mode/key, return detached notices and bound displayed text', () => {
  const p = new ErrorPresentation();
  const first = p.observe('snackbar', 'output-1:error', 'x'.repeat(1000), true, 100);
  assert.equal(first.message.length, 512); assert.equal(first.expiresAtMs, 5100);
  const again = p.observe('snackbar', 'output-1:error', 'changed text', true, 200);
  assert.deepEqual(again, first); assert.notEqual(again, first);
  first.message = 'tampered'; first.id = -1; first.expiresAtMs = 0;
  assert.deepEqual(p.observe('snackbar', 'output-1:error', 'changed text', true, 300), again);
  assert.equal(p.observe('snackbar', 'output-1:error', 'unchanged fault', true, 5099).id, again.id);
  assert.equal(p.observe('snackbar', 'output-1:error', 'unchanged fault', true, 5100), null);
  assert.equal(p.observe('snackbar', 'output-1:error', 'unchanged fault', true, 9000), null);
});

test('dismissal requires the live notice ID and a repeated fault never reopens it', () => {
  const p = new ErrorPresentation(); const first = p.observe('dialog', 'a', 'A', true, 0);
  assert.equal(p.dismiss(first.id + 1), false); assert.equal(p.dismiss(NaN), false);
  assert.equal(p.observe('dialog', 'a', 'A', true, 100000).id, first.id, 'dialogs have no snackbar timeout');
  assert.equal(p.dismiss(first.id), true); assert.equal(p.dismiss(first.id), false);
  assert.equal(p.observe('dialog', 'a', 'A', true, 100001), null);
  p.observe('dialog', '', '', true, 100002);
  const repeated = p.observe('dialog', 'a', 'A again', true, 100003);
  assert.ok(repeated.id > first.id);
  assert.equal(p.dismiss(first.id), false); assert.equal(p.dismiss(repeated.id), true);
});

test('at most one newest error is queued and its snackbar lifetime starts when promoted', () => {
  const p = new ErrorPresentation(); const active = p.observe('dialog', 'a', 'A', true, 0);
  assert.equal(p.observe('snackbar', 'b', 'B', true, 100).id, active.id);
  assert.equal(p.observe('snackbar', 'c', 'C', true, 200).id, active.id);
  assert.equal(p.observe('snackbar', 'c', 'C duplicate', true, 10000).id, active.id);
  assert.equal(p.dismiss(active.id), true);
  const next = p.observe('snackbar', 'c', 'C duplicate', true, 10001);
  assert.equal(next.message, 'C'); assert.ok(next.id > active.id); assert.equal(next.expiresAtMs, 15001);
  assert.equal(p.dismiss(active.id), false);
  assert.equal(p.observe('snackbar', 'c', 'C duplicate', true, 15000).id, next.id);
  assert.equal(p.observe('snackbar', 'c', 'C duplicate', true, 15001), null);
});

test('snackbar expiry promotes queued errors with a fresh full duration', () => {
  const p = new ErrorPresentation(); const first = p.observe('snackbar', 'a', 'A', true, 50);
  assert.equal(p.observe('snackbar', 'b', 'B', true, 100).id, first.id);
  const next = p.observe('snackbar', 'b', 'B', true, 5050);
  assert.equal(next.message, 'B'); assert.equal(next.expiresAtMs, 10050);
  assert.equal(p.dismiss(first.id), false);
  assert.equal(p.observe('snackbar', 'b', 'B', true, 10050), null);
});

test('none cancels active and queued notices and suppresses future optional notices', () => {
  const p = new ErrorPresentation(); const first = p.observe('dialog', 'a', 'A', true, 0);
  p.observe('dialog', 'b', 'B', true, 100);
  assert.equal(p.observe('none', 'b', 'B', true, 200), null);
  assert.equal(p.dismiss(first.id), false);
  assert.equal(p.observe('none', 'c', 'C', true, 300), null);
  assert.equal(p.observe('none', '', '', true, 400), null);
  const next = p.observe('snackbar', 'c', 'C', true, 500);
  assert.equal(next.message, 'C'); assert.ok(next.id > first.id);
});

test('backgrounding cancels active/queued errors without replaying the same fault on resume', () => {
  const p = new ErrorPresentation(); const first = p.observe('dialog', 'a', 'A', true, 0);
  p.observe('snackbar', 'b', 'B', true, 100);
  assert.equal(p.observe('snackbar', 'b', 'B', false, 200), null);
  assert.equal(p.dismiss(first.id), false);
  assert.equal(p.observe('snackbar', 'b', 'B', true, 300), null);
  assert.equal(p.observe('dialog', 'c', 'C', false, 400), null);
  assert.equal(p.observe('dialog', 'c', 'C', true, 500), null);
  const next = p.observe('dialog', 'd', 'D', true, 600);
  assert.equal(next.message, 'D'); assert.ok(next.id > first.id);
});

test('invalid clocks and explicit cancellation invalidate IDs and pending notices', () => {
  for (const invalid of [NaN, Infinity, -Infinity, -1]) {
    const p = new ErrorPresentation(); const first = p.observe('dialog', 'a', 'A', true, 0);
    p.observe('dialog', 'b', 'B', true, 100);
    assert.equal(p.observe('dialog', 'b', 'B', true, invalid), null);
    assert.equal(p.dismiss(first.id), false);
    assert.equal(p.observe('dialog', 'b', 'B', true, 200), null);
    const next = p.observe('dialog', 'c', 'C', true, 300); assert.ok(next.id > first.id);
    p.cancel(); assert.equal(p.dismiss(next.id), false);
    assert.equal(p.observe('dialog', 'c', 'C', true, 400), null);
  }
});

test('clearing the error key drops queued notices without manufacturing an empty notice', () => {
  const p = new ErrorPresentation();
  assert.equal(p.observe('dialog', '', 'ignored', true, 0), null);
  const first = p.observe('dialog', 'a', 'A', true, 1);
  p.observe('dialog', 'b', 'B', true, 2);
  p.observe('dialog', '', '', true, 3);
  assert.equal(p.dismiss(first.id), true);
  assert.equal(p.observe('dialog', '', '', true, 4), null);
});

test('workspace orientation respects usable width and auto aspect/desktop breakpoints', () => {
  for (const [width, height, auto, horizontal] of [
    [400, 800, false, false], [719.99, 300, false, false], [720, 1280, false, true],
    [720, 720, false, true], [720, 719.99, true, true], [1199.99, 1400, false, true],
    [1200, 1400, true, true], [1920, 1080, true, true]
  ]) {
    assert.equal(horizontalWorkspace(width, height, 'auto'), auto, `${width}x${height}: auto`);
    assert.equal(horizontalWorkspace(width, height, 'horizontal'), horizontal, `${width}x${height}: horizontal`);
    assert.equal(horizontalWorkspace(width, height, 'vertical'), false, `${width}x${height}: vertical`);
  }
});

function bounded(layout, width, height) {
  const w = Number.isFinite(width) && width > 0 ? width : 1;
  const h = Number.isFinite(height) && height > 0 ? height : 1;
  for (const rect of [layout.video, layout.settings]) {
    for (const value of Object.values(rect)) assert.ok(Number.isFinite(value) && value >= 0);
    assert.ok(rect.x + rect.width <= w + 1e-8);
    assert.ok(rect.y + rect.height <= h + 1e-8);
  }
  assert.ok(layout.controlsHeight >= 0 && layout.controlsHeight <= layout.video.height);
  const a = layout.video; const b = layout.settings;
  assert.ok(a.width === 0 || a.height === 0 || b.width === 0 || b.height === 0 ||
    a.x + a.width <= b.x + 1e-8 || b.x + b.width <= a.x + 1e-8 ||
    a.y + a.height <= b.y + 1e-8 || b.y + b.height <= a.y + 1e-8);
}

test('VideoLayout fifth orientation argument controls both forced modes and retains auto compatibility', () => {
  for (const [width, height] of [[400, 800], [567.99, 320], [568, 320], [568, 1000], [800, 1280], [1000, 1400], [1920, 1080]]) {
    const automatic = videoWorkspaceLayout(width, height, true, false, 'auto');
    assert.deepEqual(videoWorkspaceLayout(width, height, true, false), automatic);
    const vertical = videoWorkspaceLayout(width, height, true, false, 'vertical');
    const horizontal = videoWorkspaceLayout(width, height, true, false, 'horizontal');
    assert.equal(vertical.sideBySide, false, `${width}x${height}`);
    assert.equal(horizontal.sideBySide, width >= 568, `${width}x${height}`);
    if (width >= 568) assert.ok(horizontal.video.width >= 240 && horizontal.settings.width >= 320);
    for (const layout of [automatic, vertical, horizontal]) bounded(layout, width, height);
  }
  assert.equal(videoWorkspaceLayout(800, 1280, true, false, 'auto').sideBySide, false);
  assert.equal(videoWorkspaceLayout(800, 1280, true, false, 'horizontal').sideBySide, true);
  assert.equal(videoWorkspaceLayout(1920, 1080, true, false, 'vertical').sideBySide, false);
});

test('all orientations remain bounded for tiny, fractional and invalid safe-window dimensions', () => {
  for (const width of [NaN, Infinity, -1, 0, 1, 48, 320, 567.99, 568, 720, 1000, 1920]) {
    for (const height of [NaN, Infinity, -1, 0, 1, 47.9, 48, 48.1, 320, 800, 1280]) {
      for (const orientation of ['auto', 'vertical', 'horizontal']) {
        for (const visible of [false, true]) for (const fullscreen of [false, true]) {
          const layout = videoWorkspaceLayout(width, height, visible, fullscreen, orientation);
          bounded(layout, width, height);
          if (!visible || fullscreen) assert.deepEqual(layout, videoWorkspaceLayout(width, height, visible, fullscreen));
        }
      }
    }
  }
});
