import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
registerHooks({ resolve(specifier, context, next) {
  return next(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? specifier + '.ts' : specifier, context);
} });
const { SettingsDraftOwner, DraftLease } = await import('../entry/src/main/ets/presentation/SettingsDraftOwner.ts');
const { UiStyle } = await import('../entry/src/main/ets/presentation/UiStyle.ts');
const { KeyboardInputSession } = await import('../entry/src/main/ets/app/KeyboardInputSession.ts');
const motion = await import('../entry/src/main/ets/core/MotionConfiguration.ts');
const preview = await import('../entry/src/main/ets/core/CurvePreview.ts');
const source = readFileSync(new URL('../entry/src/main/ets/components/CurvePointEditor.ets', import.meta.url), 'utf8');
const helperCode = source.split('@Component')[0].replace(/^import .*;\n/gm, '').replace(/export class /g, 'class ');
const shared = new Function(...Object.keys(motion), stripTypeScriptTypes(helperCode) + '\nreturn {SettingsNumberLogic, CurveEditRules, CurveGeometryOwners};')(...Object.values(motion));
const canvas = new Proxy({}, { get(target, key) { return target[key] ?? (() => {}); }, set(target, key, value) { target[key] = value; return true; } });
function controller(name) {
  const start = source.indexOf('export struct ' + name), end = source.indexOf('  build()', start);
  const code = source.slice(start, end).replace('export struct', 'class').replace(/@(Prop|State|Watch|StorageLink)(\([^)]*\))?\s*/g, '') + '\n}';
  const dependencies = { ...motion, ...preview, ...shared, SettingsDraftOwner, DraftLease, KeyboardInputSession, UiStyle,
    CanvasRenderingContext2D: function() { return canvas; }, RenderingContextSettings: function() {} };
  return new Function(...Object.keys(dependencies), stripTypeScriptTypes(code) + '\nreturn ' + name + ';')(...Object.values(dependencies));
}
const NumberField = controller('SettingsNumberField'), TextField = controller('SettingsTextField'), Curve = controller('CurvePointEditor');
function closeParen(text, start) {
  let depth = 0, quote = '';
  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (quote) { if (char === '\\') index++; else if (char === quote) quote = ''; }
    else if (char === '"' || char === "'" || char === '`') quote = char;
    else if (char === '(') depth++; else if (char === ')' && --depth === 0) return index;
  }
  assert.fail('Unclosed callback');
}
function hooks(field, name = 'SettingsNumberField') {
  const start = source.indexOf('export struct ' + name), end = source.indexOf('\n@Component', start);
  const text = source.slice(start, end), result = {};
  let index = closeParen(text, text.indexOf('(', text.indexOf('TextInput('))) + 1;
  while (true) {
    const chain = /^\s*\.(\w+)\s*\(/.exec(text.slice(index)); if (!chain) break;
    const open = index + chain[0].length - 1, close = closeParen(text, open);
    if (/^on(Change|Submit|Focus|Blur|KeyPreIme)$/.test(chain[1])) {
      result[chain[1]] = new Function('KeyboardInputSession', 'return (' + stripTypeScriptTypes(text.slice(open + 1, close)) + ');').call(field, KeyboardInputSession);
    }
    index = close + 1;
  }
  return result;
}
function field(owner = new SettingsDraftOwner(), options = {}, Kind = NumberField) {
  const result = new Kind(); Object.assign(result, { draftOwner: owner, draftScope: 'profile:one/axis:L0', draftKey: 'value', value: 2 }, options);
  result.aboutToAppear(); return result;
}
function curve(owner = new SettingsDraftOwner(), options = {}) {
  const result = new Curve(); Object.assign(result, { draftOwner: owner, draftScope: 'profile:one/axis:L0', draftKey: 'custom', bindingKey: 'L0/Custom Curve',
    points: [new motion.MotionCurvePoint(1, 0.2), new motion.MotionCurvePoint(5, 0.8)] }, options);
  result.aboutToAppear(); return result;
}
function coordinate(editor, key, overrides = {}) {
  const adding = key.startsWith('new:'), part = key.endsWith(':x') ? 'x' : 'y', index = adding ? -1 : Number(key.split(':')[1]);
  return field(editor.draftOwner, { draftScope: editor.coordinateDraftScope(), draftKey: key,
    draftSource: editor.coordinateDraftSource(), draftEpoch: editor.draftEpoch, draftGuard: editor.coordinateGuard(),
    value: adding ? part === 'x' ? editor.draftX : editor.draftY : editor.points[index][part],
    minimum: part === 'x' ? editor.minimumX : editor.minimumY, maximum: part === 'x' ? editor.maximumX : editor.maximumY,
    onCommit: adding ? editor.draftHandler(part) : editor.pointHandler(index, part), ...overrides });
}

test('owner preserves payloads, bounds ownership and never revives an invalidated callback', () => {
  const owner = new SettingsDraftOwner();
  const first = owner.open('profile', 'timeout', '5', '5'); assert.ok(first instanceof DraftLease);
  assert.equal(owner.write(first.token, '5', '1e-'), true);
  owner.release(first.token); assert.equal(owner.read(first.token, '5'), null);
  const second = owner.open('profile', 'timeout', '5', '5'); assert.equal(second.value, '1e-');
  assert.equal(second.sourceId, first.sourceId); assert.notEqual(second.token, first.token);
  assert.equal(owner.write(first.token, '5', 'stale'), false);
  owner.invalidate(); assert.equal(owner.isCurrent(second.token, '5'), false);
  const third = owner.open('profile', 'timeout', '5', '5'); assert.equal(third.value, '1e-');
  owner.setAvailable(false); const unavailable = owner.open('profile', 'timeout', '5', '5');
  assert.equal(unavailable.token, 0); assert.equal(unavailable.value, '1e-');
  owner.setAvailable(true); assert.equal(owner.isCurrent(third.token, '5'), false);
  const changed = owner.open('profile', 'timeout', '9', '9'); assert.equal(changed.value, '9'); assert.notEqual(changed.sourceId, first.sourceId);
  owner.clear(); assert.equal(owner.isCurrent(changed.token, '9'), false);
  assert.equal(owner.open('profile', 'timeout', '5', '5').value, '5');
  owner.dispose(); assert.equal(owner.open('profile', 'timeout', '5', '5').token, 0);
});

test('owner capacity only reclaims released baselines and reports overflow without evicting live or dirty records', () => {
  const owner = new SettingsDraftOwner(2, 512);
  const edited = owner.open('a', 'dirty', 'source', 'initial'); owner.write(edited.token, 'source', 'unfinished'); owner.release(edited.token);
  const clean = owner.open('a', 'clean', 'source', 'initial'); owner.release(clean.token);
  const next = owner.open('a', 'next', 'source', 'initial'); assert.ok(next.token > 0);
  const restored = owner.open('a', 'dirty', 'source', 'initial'); assert.equal(restored.value, 'unfinished');
  assert.equal(owner.open('a', 'overflow', 'source', 'initial').token, 0);
  assert.equal(owner.write(restored.token, 'source', 'x'.repeat(1000)), false);
  assert.equal(owner.read(restored.token, 'source'), 'unfinished'); assert.equal(owner.isCurrent(next.token, 'source'), true);
});

test('default owner accommodates all maximum curve coordinates plus ordinary settings with one large curve source', () => {
  const owner = new SettingsDraftOwner(), points = Array.from({ length: motion.MotionConfigurations.MAX_POINTS }, (_, x) => ({ x, y: 0.5 }));
  const main = owner.open('axis', 'curve', JSON.stringify(points), '[]'); assert.ok(main.token > 0);
  for (let index = 0; index < points.length * 2 + 512; index++) {
    const lease = owner.open('axis', String(index), String(main.sourceId) + ':' + index, '["0","0","0"]');
    assert.ok(lease.token > 0, 'field ' + index); assert.equal(owner.write(lease.token, String(main.sourceId) + ':' + index, '["1e-","0","1"]'), true);
  }
  assert.equal(owner.isCurrent(main.token, JSON.stringify(points)), true);
});

for (const raw of ['-', '1e-', '', '  2.500  ']) test('numeric raw draft survives real remount without blur commit: ' + JSON.stringify(raw), () => {
  const owner = new SettingsDraftOwner(), commits = [];
  const first = field(owner, { onCommit: value => { commits.push(value); return true; } }), old = hooks(first);
  old.onFocus(); old.onChange(raw); old.onBlur(); assert.deepEqual(commits, []);
  first.aboutToDisappear(); const second = field(owner, { onCommit: first.onCommit });
  assert.equal(second.draft, raw); assert.equal(second.edited, true);
  old.onChange('77'); old.onSubmit(); old.onBlur(); assert.equal(second.draft, raw); assert.deepEqual(commits, []);
  second.aboutToDisappear();
});

test('validation error/edited state survive remount; explicit submit and cancel retain existing number rules', () => {
  const owner = new SettingsDraftOwner(), commits = [];
  let f = field(owner, { minimum: 0, integer: true, onCommit: value => { commits.push(value); return true; } });
  hooks(f).onChange('1.5'); hooks(f).onSubmit(); assert.equal(f.error, true); f.aboutToDisappear();
  f = field(owner, { minimum: 0, integer: true, onCommit: value => { commits.push(value); return true; } });
  assert.equal(f.draft, '1.5'); assert.equal(f.error, true); assert.equal(f.edited, true);
  f.cancelHandler()(); assert.equal(f.draft, '2'); assert.equal(f.error, false); assert.equal(f.edited, false); assert.deepEqual(commits, []);
  hooks(f).onChange('3'); hooks(f).onBlur(); assert.deepEqual(commits, []); hooks(f).onSubmit(); assert.deepEqual(commits, [3]);
  f.aboutToDisappear();
});

for (const transition of ['source', 'scope', 'key', 'epoch', 'bounds', 'availability', 'owner']) test('render-bound callbacks reject ' + transition + ' before a Watch can run', () => {
  const owner = new SettingsDraftOwner(), commits = [], f = field(owner, { onCommit: value => { commits.push(value); return true; } });
  const stale = hooks(f); stale.onChange('8');
  if (transition === 'source') f.value = 3;
  if (transition === 'scope') f.draftScope = 'profile:two';
  if (transition === 'key') f.draftKey = 'different';
  if (transition === 'epoch') f.draftEpoch++;
  if (transition === 'bounds') f.maximum = 4;
  if (transition === 'availability') owner.setAvailable(false);
  if (transition === 'owner') f.draftOwner = new SettingsDraftOwner();
  stale.onChange('9'); stale.onSubmit(); stale.onBlur(); assert.equal(f.draft, '8'); assert.deepEqual(commits, []);
  f.refreshValue(); assert.deepEqual(commits, []); f.aboutToDisappear();
});

test('background and layout invalidate before rebind while retaining incomplete numeric text', () => {
  const owner = new SettingsDraftOwner(), commits = [], f = field(owner, { onCommit: value => { commits.push(value); return true; } });
  const stale = hooks(f); stale.onChange('1e-'); owner.setAvailable(false); f.draftEpoch++;
  stale.onSubmit(); stale.onBlur(); f.refreshValue(); assert.equal(f.draft, '1e-');
  owner.setAvailable(true); f.draftEpoch++; f.refreshValue(); const current = hooks(f);
  stale.onChange('10'); stale.onSubmit(); assert.equal(f.draft, '1e-'); assert.deepEqual(commits, []);
  current.onChange('4'); owner.invalidate(); f.draftEpoch++; stale.onBlur(); current.onBlur();
  f.refreshValue(); assert.equal(f.draft, '4'); assert.deepEqual(commits, []); hooks(f).onSubmit(); assert.deepEqual(commits, [4]);
  f.aboutToDisappear();
});

test('explicit equal numeric edits preserve Range/Octaves semantics without duplicate unchanged commits', () => {
  const commits = [], f = field(undefined, { commitEqualEdits: true, onCommit: value => { commits.push(value); return true; } });
  f.focused = true;
  hooks(f).onSubmit(); assert.deepEqual(commits, []); hooks(f).onChange('2'); hooks(f).onBlur(); assert.deepEqual(commits, []);
  hooks(f).onSubmit(); assert.deepEqual(commits, [2]); hooks(f).onSubmit(); assert.deepEqual(commits, [2]); f.aboutToDisappear();
});

test('text drafts survive remount and commit only on explicit confirmation; cancellation is guarded', () => {
  const owner = new SettingsDraftOwner(), commits = [], options = { value: 'original', onCommit: value => { commits.push(value); return value.length > 0; } };
  const first = field(owner, options, TextField), old = hooks(first, 'SettingsTextField'); old.onChange(''); old.onSubmit();
  assert.equal(first.error, true); first.aboutToDisappear(); const second = field(owner, options, TextField);
  assert.equal(second.draft, ''); assert.equal(second.error, true); second.cancelHandler()();
  const cancel = second.cancelHandler(), current = hooks(second, 'SettingsTextField'); current.onChange('replacement'); current.onBlur();
  assert.deepEqual(commits, ['']); current.onSubmit(); assert.deepEqual(commits, ['', 'replacement']);
  second.draftEpoch++; cancel(); assert.equal(second.draft, 'replacement'); second.aboutToDisappear();
});

test('storage overflow is visible and blocks commit while allowing a shorter edit or cancellation', () => {
  const owner = new SettingsDraftOwner(10, 256), commits = [], f = field(owner, { onCommit: value => { commits.push(value); return true; } });
  hooks(f).onChange('9'.repeat(300)); assert.equal(f.storageError, true); hooks(f).onSubmit(); assert.deepEqual(commits, []);
  hooks(f).onChange('3'); assert.equal(f.storageError, false); f.cancelHandler()(); assert.equal(f.draft, '2'); f.aboutToDisappear();
});

test('curve selected row and raw coordinate drafts survive geometry remount; active drag cancels without emitting', () => {
  const owner = new SettingsDraftOwner(), changes = [], editor = curve(owner, { onChange: points => changes.push(points) });
  const x = coordinate(editor, 'point:0:x'), stale = hooks(x); stale.onChange('1e-');
  editor.beginPoint(editor.px(1), editor.py(0.2)); editor.movePoint(editor.px(2), editor.py(0.4)); assert.equal(editor.dragging, true);
  const end = editor.gestureHandler('end'), sourceId = editor.draftSourceId;
  editor.geometryHandler(editor.geometryOwner, editor.bindingKey)({}, { width: 800, height: 180 });
  assert.equal(editor.dragging, false); assert.equal(editor.draftSourceId, sourceId); end({ fingerList: [] }); assert.deepEqual(changes, []);
  stale.onChange('7'); stale.onSubmit(); assert.equal(x.draft, '1e-'); x.aboutToDisappear();
  const restored = coordinate(editor, 'point:0:x'); assert.equal(restored.draft, '1e-'); restored.aboutToDisappear();
  editor.aboutToDisappear(); const next = curve(owner, { onChange: points => changes.push(points) });
  assert.equal(next.selected, 0); assert.equal(next.draftSourceId, sourceId); assert.equal(coordinate(next, 'point:0:x').draft, '1e-');
  assert.deepEqual(changes, []); next.aboutToDisappear();
});

test('curve new-point committed numeric state and incomplete raw coordinate draft survive full remount', () => {
  const owner = new SettingsDraftOwner(), changes = [], first = curve(owner, { onChange: points => changes.push(points) });
  const x = coordinate(first, 'new:x'), y = coordinate(first, 'new:y');
  hooks(x).onChange('3.5'); hooks(x).onSubmit(); assert.equal(first.draftX, 3.5);
  hooks(y).onChange('1e-'); hooks(y).onSubmit(); assert.equal(y.error, true); assert.deepEqual(changes, []);
  x.aboutToDisappear(); y.aboutToDisappear(); first.aboutToDisappear();
  const next = curve(owner, { onChange: points => changes.push(points) }); assert.equal(next.draftX, 3.5); assert.equal(next.draftY, 0);
  const newX = coordinate(next, 'new:x'), newY = coordinate(next, 'new:y'); assert.equal(newX.draft, '3.5'); assert.equal(newY.draft, '1e-'); assert.equal(newY.error, true);
  newX.aboutToDisappear(); newY.aboutToDisappear(); next.aboutToDisappear(); assert.deepEqual(changes, []);
});

test('actual point-list changes invalidate coordinate drafts and all old handlers before their Watch runs', () => {
  const owner = new SettingsDraftOwner(), changes = [], editor = curve(owner, { onChange: points => changes.push(points) });
  const input = coordinate(editor, 'point:0:x'), stale = hooks(input), oldAdd = editor.addHandler(); stale.onChange('1e-');
  const oldPoint = editor.pointHandler(0, 'y'); editor.points = [new motion.MotionCurvePoint(2, 0.2), new motion.MotionCurvePoint(5, 0.8)];
  stale.onChange('3'); stale.onSubmit(); oldPoint(0.6); oldAdd(); assert.deepEqual(changes, []); assert.equal(input.draft, '1e-');
  const oldSource = editor.draftSourceId; editor.pointsChanged(); assert.notEqual(editor.draftSourceId, oldSource);
  const refreshed = coordinate(editor, 'point:0:x'); assert.equal(refreshed.draft, '2'); input.aboutToDisappear();
  hooks(refreshed).onChange('3'); hooks(refreshed).onSubmit(); assert.equal(changes.length, 1); assert.equal(changes[0][0].x, 3);
  refreshed.aboutToDisappear(); editor.aboutToDisappear();
});

for (const boundary of ['unmount', 'background', 'source']) test('in-progress curve drag never completes across ' + boundary, () => {
  const owner = new SettingsDraftOwner(), changes = [], editor = curve(owner, { onChange: points => changes.push(points) });
  editor.beginPoint(editor.px(1), editor.py(0.2)); editor.movePoint(editor.px(3), editor.py(0.5)); const end = editor.gestureHandler('end');
  if (boundary === 'unmount') editor.aboutToDisappear();
  if (boundary === 'background') { owner.setAvailable(false); editor.draftEpoch++; }
  if (boundary === 'source') editor.points = [new motion.MotionCurvePoint(0, 0), new motion.MotionCurvePoint(10, 1)];
  end({ fingerList: [] }); editor.endPoint(); assert.deepEqual(changes, []); assert.equal(editor.dragging, false); editor.aboutToDisappear();
});

test('common controls display explicit accessible actions and blur is focus-only', () => {
  const fields = source.slice(source.indexOf('export struct SettingsNumberField'), source.indexOf('export struct SettingsSwitchField'));
  assert.equal((fields.match(/onBlur\(KeyboardInputSession.focusHandler\(this.keyboardEditorId, false\)\)/g) ?? []).length, 2);
  assert.doesNotMatch(fields, /onBlur\(KeyboardInputSession.blurHandler/);
  assert.equal((fields.match(/Text\('未应用'\)/g) ?? []).length, 2);
  assert.equal((fields.match(/Button\('确认'\)/g) ?? []).length, 2);
  assert.equal((fields.match(/Button\('取消'\)/g) ?? []).length, 2);
  assert.equal((fields.match(/minHeight: UiStyle\.control(?:For\(this\.compact\))?, maxWidth: '100%'/g) ?? []).length, 4);
});


test('pending metadata survives remount/background, isolates scopes and blocks Add until new coordinates are confirmed or canceled', () => {
  const owner = new SettingsDraftOwner(), changes = [], editor = curve(owner, { onChange: points => changes.push(points) });
  const x = coordinate(editor, 'new:x'), y = coordinate(editor, 'new:y'), row = coordinate(editor, 'point:0:x');
  hooks(x).onChange('3'); hooks(y).onChange('1e-'); hooks(row).onChange('4');
  assert.equal(owner.hasPending(editor.coordinateDraftScope(), 'new:'), true);
  assert.equal(owner.hasPending('another scope'), false);
  const token = x.draftToken; assert.ok(owner.peek(x.draftScope, x.draftKey).includes('3')); assert.equal(x.draftToken, token);
  editor.addHandler()(); assert.deepEqual(changes, []); assert.match(editor.message, /确认或取消/);
  hooks(x).onSubmit(); y.cancelHandler()(); assert.equal(owner.hasPending(editor.coordinateDraftScope(), 'new:'), false);
  assert.equal(owner.hasPending(editor.coordinateDraftScope(), 'point:'), true);
  editor.addHandler()(); assert.equal(changes.length, 1); assert.deepEqual([changes[0].at(-1).x, changes[0].at(-1).y], [3, 0]);
  owner.setAvailable(false); assert.equal(owner.hasPending(row.draftScope, 'point:'), true);
  x.aboutToDisappear(); y.aboutToDisappear(); row.aboutToDisappear(); editor.aboutToDisappear();
});

test('rejected oversize edit still marks pending so actions cannot use hidden old values', () => {
  const owner = new SettingsDraftOwner(10, 256), f = field(owner);
  hooks(f).onChange('9'.repeat(300)); assert.equal(f.storageError, true); assert.equal(owner.hasPending(f.draftScope, f.draftKey), true);
  f.cancelHandler()(); assert.equal(owner.hasPending(f.draftScope, f.draftKey), false); f.aboutToDisappear();
});


test('actual curve source replacement clears orphaned pending rows even across a full remount', () => {
  const owner = new SettingsDraftOwner(), first = curve(owner), removed = coordinate(first, 'point:1:x');
  hooks(removed).onChange('1e-'); const scope = first.coordinateDraftScope(); assert.equal(owner.hasPending(scope), true);
  removed.aboutToDisappear(); first.aboutToDisappear();
  const next = curve(owner, { points: [new motion.MotionCurvePoint(1, 0.2)] });
  assert.equal(owner.hasPending(scope), false); assert.equal(owner.peek(scope, 'point:1:x'), null); next.aboutToDisappear();
});

test('curve source anchor survives pressure while a retained coordinate draft references it', () => {
  const owner = new SettingsDraftOwner(3, 16384), first = curve(owner), input = coordinate(first, 'point:0:x');
  hooks(input).onChange('1e-'); const sourceId = first.draftSourceId; input.aboutToDisappear(); first.aboutToDisappear();
  const unused = owner.open('other', 'baseline', '0', '0'); owner.release(unused.token);
  owner.open('another', 'replacement', '0', '0');
  const next = curve(owner); assert.equal(next.draftSourceId, sourceId);
  const restored = coordinate(next, 'point:0:x'); assert.equal(restored.draft, '1e-'); restored.aboutToDisappear(); next.aboutToDisappear();
});


test('guard replacement retires old rendered change/submit/cancel callbacks without poisoning the current field', () => {
  const commits = [], f = field(undefined, { onCommit: value => { commits.push(value); return true; } });
  const old = hooks(f), cancel = f.cancelHandler(); old.onChange('4');
  f.draftGuard = () => true; old.onChange('5'); old.onSubmit(); cancel();
  assert.equal(f.draft, '4'); assert.deepEqual(commits, []);
  hooks(f).onSubmit(); assert.deepEqual(commits, [4]); f.aboutToDisappear();
});


test('overflow warning and cancellation stay reachable after remount instead of leaving an invisible pending blocker', () => {
  const owner = new SettingsDraftOwner(10, 256), first = field(owner);
  hooks(first).onChange('9'.repeat(300)); assert.equal(first.storageError, true); first.aboutToDisappear();
  const next = field(owner); assert.equal(next.storageError, true); assert.equal(next.edited, true);
  assert.equal(owner.hasPending(next.draftScope, next.draftKey), true);
  next.cancelHandler()(); assert.equal(next.storageError, false); assert.equal(next.edited, false);
  assert.equal(owner.hasPending(next.draftScope, next.draftKey), false); next.aboutToDisappear();
});
