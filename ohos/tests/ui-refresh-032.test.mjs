import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s, c, n) { return n(s.startsWith('.') && !/\.[a-z]+$/i.test(s) ? s + '.ts' : s, c); } });
const { UiStyle } = await import('../entry/src/main/ets/presentation/UiStyle.ts');
const root = new URL('../entry/src/main/ets/', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const index = read('pages/Index.ets');
const panels = ['AxisSettingsPanel', 'ContinuousInputPanel', 'DeoVrSourcePanel', 'DeviceSettingsPanel',
  'GeneralSettingsPanel', 'InputSettingsPanel', 'InternalPlaylistPanel', 'MotionSettingsPanel',
  'OutputSettingsPanel', 'SyncSettingsPanel'].map(name => ({ name, text: read('components/' + name + '.ets') }));

function luminance(hex) {
  const rgb = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function contrast(first, second) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('HarmonyOS refresh palette keeps every text and semantic action legible', () => {
  const pairs = [
    [UiStyle.ink, UiStyle.card], [UiStyle.ink, UiStyle.page], [UiStyle.muted, UiStyle.card],
    [UiStyle.muted, UiStyle.page], [UiStyle.onAccent, UiStyle.accent], [UiStyle.danger, UiStyle.dangerSoft],
    [UiStyle.warning, UiStyle.card], [UiStyle.success, UiStyle.card], [UiStyle.accent, UiStyle.accentSoft]
  ];
  for (const [foreground, background] of pairs) {
    assert.ok(contrast(foreground, background) >= 4.5, `${foreground} on ${background}`);
  }
  assert.notEqual(UiStyle.page, UiStyle.card, 'cards must stand out from the canvas');
  assert.notEqual(UiStyle.field, UiStyle.card, 'input wells must stand out inside cards');
});

test('visual scale is compact while every touch target keeps the 48vp floor', () => {
  assert.equal(UiStyle.control, 48);
  assert.ok(UiStyle.controlVisual < UiStyle.control);
  assert.ok(UiStyle.controlFor(false) < UiStyle.control);
  assert.ok(UiStyle.controlFor(true) < UiStyle.controlFor(false));
  assert.ok(UiStyle.radiusCard > UiStyle.radius);
  assert.ok(UiStyle.radiusPill > UiStyle.radius);
  assert.equal(UiStyle.cardPadding, 16);
  assert.ok(UiStyle.icon >= 18 && UiStyle.icon <= 22);
  assert.ok(UiStyle.glyph < UiStyle.body(false));
  assert.equal(UiStyle.fieldLabelWidth(390), '40%');
  assert.equal(UiStyle.fieldControlWidth(390), '56%');
  assert.equal(UiStyle.fieldLabelWidth(320), '100%');
});

test('workspace chrome uses the shared header, segmented tools and rounded surfaces', () => {
  const header = index.slice(index.indexOf('  workspaceHeader() {'), index.indexOf('  build() {'));
  assert.match(header, /headerBrand\(\)/);
  assert.match(header, /UiStyle\.headerSurface/);
  assert.match(header, /backgroundBlurStyle\(BlurStyle\.COMPONENT_THICK\)/);
  assert.match(header, /this\.globalStopButton\(\)/);
  const nav = index.slice(index.indexOf('  headerNav('), index.indexOf('  headerTools()'));
  assert.match(nav, /height\(40\)/);
  assert.match(nav, /borderRadius\(20\)/);
  const tools = index.slice(index.indexOf('  toolNavigation() {'), index.indexOf('  wideTrace() {'));
  assert.match(tools, /height\(40\)/);
  assert.match(tools, /borderRadius\(20\)/);
  assert.match(tools, /radiusPill/);
  assert.match(tools, /shadow\(/);
});

test('video chrome uses one compact row and a real rounded control card', () => {
  const stage = index.slice(index.indexOf('  videoStage() {'), index.indexOf('  workspaceSettings() {'));
  assert.equal((stage.match(/XComponent\(\{/g) || []).length, 1);
  assert.match(stage, /Button\(this\.videoActionPending/);
  assert.match(stage, /height\(40\)/);
  assert.match(stage, /backgroundColor\(UiStyle\.card\)/);
  assert.match(stage, /borderRadius\(\{ topLeft: 16, topRight: 16 \}\)/);
  assert.match(stage, /button.*fontSize\(15\)|fontSize\(15\)/);
  assert.match(stage, /videoGestureHandler/);
  assert.doesNotMatch(stage, /height\(52\)\.padding\(4\)\.fontSize\(16\)/);
});

test('library is a titled card list with search, badges and an explicit empty state', () => {
  const library = index.slice(index.indexOf('  videoLibraryScreen() {'), index.indexOf('  libraryItemDetails('));
  assert.match(library, /Text\('视频库'\)\.fontSize\(UiStyle\.display\)/);
  assert.match(library, /搜索视频、脚本或 ZIP/);
  assert.match(library, /clearLibrarySearch/);
  assert.match(library, /linearGradient/);
  assert.match(library, /successSoft/);
  assert.match(library, /这里还没有视频/);
  assert.match(library, /radiusCard/);
  assert.match(library, /shadow\(/);
  assert.match(index, /libraryContentInset\(\)/);
  assert.match(index, /const maximum = 980;/);
});

const DIRECT_CARD_PANELS = new Set(['GeneralSettingsPanel', 'InputSettingsPanel', 'ContinuousInputPanel',
  'DeviceSettingsPanel', 'MotionSettingsPanel', 'SyncSettingsPanel']);

test('every settings surface shares the white card shell and compact fields', () => {
  for (const panel of panels) {
    assert.match(panel.text, /Settings(?:Number|Text|Switch|Choice)Field/, panel.name + ' fields');
    assert.match(panel.text, /UiStyle\.(?:helper|textFor|body)/, panel.name + ' typography');
    if (DIRECT_CARD_PANELS.has(panel.name)) {
      assert.match(panel.text, /backgroundColor\(UiStyle\.card\)/, panel.name + ' card');
      assert.match(panel.text, /borderRadius\(UiStyle\.radiusCard\)/, panel.name + ' radius');
    } else {
      assert.match(panel.text, /constraintSize\(\{ minHeight/, panel.name + ' keeps bounded actions');
    }
  }
  const shared = read('components/CurvePointEditor.ets');
  assert.match(shared, /minHeight: this\.compact \? 38 : 42/);
  assert.match(shared, /responseRegion\(\{ y: -3, width: '100%', height: UiStyle\.control \}\)/);
  assert.match(shared, /SettingsNumberLogic\.format\(this\.value\)/, 'programmatic text replay must not open a pending draft');
});

test('legacy low-contrast palette values are gone from production ArkTS', () => {
  const files = readdirSync(new URL('.', root), { recursive: true }).filter(path => path.endsWith('.ets'))
    .map(path => ({ path, text: read(path) }));
  for (const legacy of ['#F5F6F8', '#1C2937', '#647181', '#236B73', '#E7F0F0', '#B4434A', '#F9EBED']) {
    for (const file of files) assert.equal(file.text.includes(legacy), false, legacy + ' remains in ' + file.path);
  }
});
