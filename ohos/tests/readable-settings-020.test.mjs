import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
registerHooks({ resolve(specifier, context, next) {
  return next(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? specifier + '.ts' : specifier, context);
} });
const { UiStyle } = await import('../entry/src/main/ets/presentation/UiStyle.ts');
const { GeneralConfiguration } = await import('../entry/src/main/ets/settings/GeneralConfiguration.ts');
const base = new URL('../entry/src/main/ets/components/', import.meta.url);
const source = name => readFileSync(new URL(name + '.ets', base), 'utf8');
const files = readdirSync(base).filter(name => name.endsWith('.ets'));

function luminance(hex) {
  const rgb = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function contrast(first, second) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('readable is the shared default and compact never reduces the 52vp control floor', () => {
  assert.equal(UiStyle.body(), 18); assert.equal(UiStyle.body(false), 18); assert.equal(UiStyle.body(true), 16);
  assert.equal(UiStyle.control, 52); assert.equal(UiStyle.heading, 22); assert.equal(UiStyle.helper, 14);
  assert.ok(UiStyle.padding(false) > UiStyle.padding(true)); assert.ok(UiStyle.gap(false) > UiStyle.gap(true));
  for (const file of files) {
    const text = readFileSync(new URL(file, base), 'utf8');
    assert.match(text, /@Prop compact: boolean = false/, file);
    assert.doesNotMatch(text, /deviceType|compact\s*\?\s*(?:32|34|36|40|44|48)\s*:/, file);
    assert.doesNotMatch(text, /\.fontSize\((?:[0-9]|1[0-3])\)|\.font\(\{ size: (?:[0-9]|1[0-3])\s*\}/, file);
    assert.doesNotMatch(text, /\.height\((?:3\d|4\d|5[01])\)/, file);
  }
});

test('palette supplies readable text, semantic actions and restrained light surfaces', () => {
  for (const [foreground, background] of [[UiStyle.ink, UiStyle.card], [UiStyle.muted, UiStyle.card],
    [UiStyle.ink, UiStyle.accentSoft], [UiStyle.field, UiStyle.accent], [UiStyle.field, UiStyle.danger],
    [UiStyle.danger, UiStyle.dangerSoft], [UiStyle.warning, UiStyle.card]]) {
    assert.ok(contrast(foreground, background) >= 4.5, `${foreground} on ${background}`);
  }
});

test('every command keeps a 52vp minimum, bounded width and native pressed feedback', () => {
  let count = 0;
  for (const file of files) {
    const text = readFileSync(new URL(file, base), 'utf8');
    for (const match of text.matchAll(/(?<![A-Za-z])Button\(/g)) {
      const end = text.indexOf('.onClick(', match.index);
      assert.ok(end > match.index, file);
      const button = text.slice(match.index, end);
      assert.doesNotMatch(button.slice(7), /(?<![A-Za-z])Button\(/, file);
      assert.match(button, /minHeight: UiStyle\.control, maxWidth: '100%'/, file);
      assert.match(button, /stateEffect\(true\)/, file);
      assert.match(button, /labelStyle\(\{ maxLines: 10, overflow: TextOverflow\.Clip \}\)/, file);
      count++;
    }
  }
  assert.ok(count >= 30, 'all existing component actions are audited');
});

test('shared fields stack labels and disclose long select values at 240vp', () => {
  const text = source('CurvePointEditor');
  const shared = text.slice(text.indexOf('export struct SettingsNumberField'), text.indexOf('export struct CurvePointEditor'));
  assert.doesNotMatch(shared, /\.width\(this\.compact|TextOverflow\.Ellipsis|maxLines\(/);
  assert.match(shared, /Text\(this\.labelText\(\)\)[^\n]+wordBreak\(WordBreak\.BREAK_ALL\)/);
  assert.match(shared, /optionHeight\(UiStyle\.control\)/);
  assert.match(text, /let best: number = 28/);
  assert.match(shared, /Toggle\([^\n]+\.height\(UiStyle\.control\)/);
  assert.match(shared, /Text\(this\.label\)\.fontSize\(UiStyle\.heading\)/);
  assert.match(shared, /onSubmit\(KeyboardInputSession\.submitHandler/);
  assert.match(shared, /onBlur\(KeyboardInputSession\.blurHandler/);
});

test('playlist names wrap outside bounded action labels and lists retain parent-scroll handoff', () => {
  const text = source('InternalPlaylistPanel');
  assert.match(text, /Text\(\(row\.index \+ 1\) \+ '\. ' \+ row\.name[^\n]+\n[^\n]+wordBreak/);
  assert.match(text, /Text\(row\.name\)[^\n]+wordBreak/);
  assert.match(text, /rows\.length \* 180, 360/); assert.match(text, /managedRows\.length \* 96, 320/);
  assert.equal((text.match(/nestedScroll\(\{ scrollForward: NestedScrollMode\.SELF_FIRST, scrollBackward: NestedScrollMode\.SELF_FIRST \}\)/g) ?? []).length, 2);
  for (const name of ['InputSettingsPanel', 'GeneralSettingsPanel', 'DeoVrSourcePanel', 'OutputSettingsPanel', 'DeviceSettingsPanel']) {
    assert.doesNotMatch(source(name), /\bScroll\s*\(/, name);
  }
});

const generalSource = source('GeneralSettingsPanel');
const helperSource = generalSource.split('@Component')[0].replace(/^import .*;\n/gm, '').replace(/export class /g, 'class ');
const Edits = new Function('GeneralConfiguration', stripTypeScriptTypes(helperSource) + '\nreturn GeneralSettingsEdits;')(GeneralConfiguration);
const start = generalSource.indexOf('export struct GeneralSettingsPanel');
const controller = generalSource.slice(start, generalSource.indexOf('  build()', start))
  .replace('export struct', 'class').replace(/@(Prop|State|Watch)(\([^)]*\))?\s*/g, '') + '\n}';
const Panel = new Function('GeneralConfiguration', 'GeneralSettingsEdits', stripTypeScriptTypes(controller) + '\nreturn GeneralSettingsPanel;')(GeneralConfiguration, Edits);

test('density edits are validated detached snapshots; mounting never mutates a preference', () => {
  const initial = new GeneralConfiguration();
  for (const choice of ['compact', 'readable']) {
    const result = Edits.choice(initial, 'uiDensity', choice);
    assert.notEqual(result, initial); assert.equal(result.uiDensity, choice);
    assert.equal(result.appOrientation, initial.appOrientation); assert.equal(result.errorDisplayType, initial.errorDisplayType);
  }
  for (const bad of ['desktop', 'auto', 'tiny', '', true]) assert.equal(Edits.choice(initial, 'uiDensity', bad), null);
  const panel = new Panel(); const changes = []; panel.onChange = value => changes.push(value);
  panel.aboutToAppear(); assert.equal(panel.configuration.uiDensity, 'readable'); assert.deepEqual(changes, []);
  panel.choiceHandler('uiDensity')('compact'); assert.equal(changes[0].uiDensity, 'compact');
  assert.equal(initial.uiDensity, 'readable');
});

for (const transition of ['replacement', 'watch', 'readonly', 'remount']) {
  test(`density choice rejects stale ownership after ${transition}`, () => {
    const panel = new Panel(); const changes = []; panel.onChange = value => changes.push(value);
    const old = panel.choiceHandler('uiDensity');
    if (transition === 'replacement') panel.configuration = GeneralConfiguration.clone(panel.configuration);
    if (transition === 'watch') panel.ownerChanged();
    if (transition === 'readonly') { panel.readOnly = true; panel.ownerChanged(); panel.readOnly = false; panel.ownerChanged(); }
    if (transition === 'remount') { panel.aboutToDisappear(); panel.aboutToAppear(); }
    old('compact'); assert.deepEqual(changes, []);
    panel.choiceHandler('uiDensity')('compact'); assert.equal(changes.length, 1);
    panel.readOnly = true; panel.choiceHandler('uiDensity')('readable'); assert.equal(changes.length, 1);
  });
}
