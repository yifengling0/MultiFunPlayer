import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root));
const json = (path) => JSON.parse(read(path).toString());
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const media = 'AppScope/resources/base/media/';
const manifest = json('design/app-icon/exports.json');

function pngHeader(path) {
  const data = read(path);
  assert.deepEqual(data.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert.equal(data.toString('ascii', 12, 16), 'IHDR');
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20), depth: data[24], type: data[25] };
}

function assertMediaReference(ref, extension) {
  assert.match(ref, /^\$media:[a-z_]+$/);
  const name = ref.slice('$media:'.length);
  const candidates = readdirSync(new URL(media, root)).filter((file) => file.split('.')[0] === name);
  assert.deepEqual(candidates, [`${name}.${extension}`], `Ambiguous or missing resource: ${ref}`);
}

test('app and launchable Ability use the same layered icon', () => {
  const app = json('AppScope/app.json5').app;
  const module = json('entry/src/main/module.json5').module;
  const ability = module.abilities.find((value) => value.name === module.mainElement);
  assert.equal(app.icon, '$media:app_icon_layered');
  assert.equal(ability.icon, app.icon);
  assertMediaReference(app.icon, 'json');
  assert.ok(ability.skills.some((skill) => skill.entities.includes('entity.system.home') && skill.actions.includes('ohos.want.action.home')));
});

test('layered icon points to distinct transparent foreground and opaque background PNGs', () => {
  const layered = json(`${media}app_icon_layered.json`)['layered-image'];
  assert.deepEqual(layered, { background: '$media:app_icon_background', foreground: '$media:app_icon_foreground' });
  assertMediaReference(layered.background, 'png');
  assertMediaReference(layered.foreground, 'png');
  assert.equal(pngHeader(`${media}app_icon_foreground.png`).type, 6); // RGBA
  assert.equal(pngHeader(`${media}app_icon_background.png`).type, 2); // RGB
});

test('launch window uses the same transparent artwork, without a rectangular icon tile', () => {
  const module = json('entry/src/main/module.json5').module;
  const ability = module.abilities.find((value) => value.name === module.mainElement);
  assert.equal(ability.startWindowIcon, '$media:app_icon_foreground');
  assertMediaReference(ability.startWindowIcon, 'png');
  const colors = json('entry/src/main/resources/base/element/color.json').color;
  assert.equal(colors.find((value) => value.name === ability.startWindowBackground.slice('$color:'.length)).value, '#FFE6A3');
});

test('all checked-in icon PNG exports are 1024px, current, and below 3MiB', () => {
  assert.deepEqual(Object.keys(manifest.exports).sort(), ['app_icon.png', 'app_icon_background.png', 'app_icon_foreground.png']);
  for (const [name, info] of Object.entries(manifest.exports)) {
    const path = media + name;
    const data = read(path);
    const header = pngHeader(path);
    assert.equal(header.width, 1024);
    assert.equal(header.height, 1024);
    assert.equal(header.depth, 8);
    assert.ok(data.length < 3 * 1024 * 1024);
    assert.equal(sha256(data), info.sha256, `Changed export: ${name}; regenerate its manifest`);
  }
});

test('SVG layout and bitmap artwork match the export provenance', () => {
  assert.equal(sha256(read('design/app-icon/icon.svg')), manifest.source_sha256, 'Run tools/export-app-icon.py after editing SVG');
  assert.equal(manifest.artwork, 'foreground-art.png');
  assert.equal(sha256(read('design/app-icon/foreground-art.png')), manifest.artwork_sha256, 'Run tools/export-app-icon.py after editing artwork');
  const source = read('design/app-icon/icon.svg').toString();
  assert.match(source, /id="background"/);
  assert.match(source, /id="foreground"/);
  assert.match(source, /id="pixel-artwork"/);
  assert.match(source, /xlink:href="foreground-art\.png"/);
  assert.doesNotMatch(source, /(?:href|xlink:href)="(?:https?:|file:)/);
});

test('icon canvas and project QA margins remain declared for reproducible clipping checks', () => {
  assert.deepEqual(manifest.canvas, [1024, 1024]);
  assert.deepEqual(manifest.safe_circle, { cx: 512, cy: 512, radius: 500 });
  assert.equal(manifest.clip_radius, 508);
  assert.equal(manifest.visible_alpha_threshold, 64);
  assert.equal(manifest.tested_translation_px, 8);
  const source = read('design/app-icon/icon.svg').toString();
  assert.match(source, /<circle cx="512" cy="512" r="508"\/>/);
  assert.match(source, /width="896" height="896"/);
});
