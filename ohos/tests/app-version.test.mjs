import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { APP_VERSION_NAME, APP_VERSION_CODE } from '../entry/src/main/ets/core/AppVersion.ts';
const page = readFileSync(new URL('../entry/src/main/ets/pages/Index.ets', import.meta.url), 'utf8');
test('UI version derives from the tested version constants matching the package manifest', () => {
  const app = JSON.parse(readFileSync(new URL('../AppScope/app.json5', import.meta.url), 'utf8')).app;
  assert.equal(APP_VERSION_NAME, app.versionName); assert.equal(APP_VERSION_CODE, app.versionCode);
  assert.match(page, /Text\(APP_VERSION_NAME \+ ' OHOS'\)/);
  assert.doesNotMatch(page, /Text\(['"]\d+\.\d+\.\d+ OHOS['"]\)/);
});
test('narrow media toolbar distributes bounded touch targets rather than overflowing or shrinking them', () => {
  const toolbar = page.slice(page.indexOf('  mediaToolbar() {'), page.indexOf('  timeline() {'));
  assert.match(toolbar, /wrap: FlexWrap\.Wrap/); assert.doesNotMatch(toolbar, /Blank\(\)/);
  assert.equal((toolbar.match(/\.flexShrink\(0\)/g) || []).length, 6);
  assert.equal((toolbar.match(/\.width\(this.mediaToolWidth\(\)\)/g) || []).length, 6);
});
