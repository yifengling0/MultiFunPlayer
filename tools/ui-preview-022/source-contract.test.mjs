import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { UiStyle } from '../../ohos/entry/src/main/ets/presentation/UiStyle.ts';
import { videoWorkspaceLayout } from '../../ohos/entry/src/main/ets/core/VideoLayout.ts';
import { horizontalWorkspace } from '../../ohos/entry/src/main/ets/presentation/GeneralPresentation.ts';
const manifest=JSON.parse(readFileSync(new URL('./generated/manifest.json',import.meta.url),'utf8'));
const script=readFileSync(new URL('./preview.js',import.meta.url),'utf8');
function renderMarkup(viewport,scene,density='readable') {
  const app={innerHTML:'',scrollIntoView(){}};
  const document={documentElement:{style:{setProperty(){}}},body:{dataset:{}},getElementById:()=>app,querySelectorAll:()=>[]};
  const window={PREVIEW:manifest};
  runInNewContext(script,{window,document,location:{search:`?viewport=${viewport.id}&scene=${scene}&density=${density}`},
    innerWidth:viewport.width,innerHeight:viewport.height,URLSearchParams});
  return {markup:app.innerHTML,audit:window.previewAudit};
}

test('browser approximation is labeled and production fingerprints are current',()=>{
  assert.match(manifest.kind,/NOT an ArkUI/);
  for(const item of manifest.sources) {
    const bytes=readFileSync(new URL('../../'+item.path,import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256,`${item.path}: rerun build-preview.mjs after production changes`);
  }
});
test('shared actual tokens provide readable defaults; density never follows platform/window automatically',()=>{
  assert.equal(manifest.tokens.body,UiStyle.body(false));assert.equal(manifest.tokens.body,18);
  assert.equal(manifest.tokens.compactBody,UiStyle.body(true));assert.equal(manifest.tokens.compactBody,16);
  assert.equal(manifest.tokens.heading,UiStyle.heading);assert.equal(manifest.tokens.heading,22);
  assert.equal(manifest.tokens.helper,UiStyle.helper);assert.equal(manifest.tokens.helper,14);
  assert.equal(manifest.tokens.control,UiStyle.control);assert.equal(manifest.tokens.control,52);
  assert.equal(manifest.densityDefault,'readable');assert.equal(manifest.explicitCompact,true);
});
test('all fourteen viewport geometries are actual production function results',()=>{
  assert.equal(manifest.viewports.length,14);
  for(const vp of manifest.viewports) {
    const m=manifest.metrics[vp.id];
    for(const [key,video,full] of [['plain',false,false],['video',true,false],['fullscreen',true,true]])
      assert.deepEqual(m[key],JSON.parse(JSON.stringify(videoWorkspaceLayout(vp.width,vp.height,video,full))),vp.id+'/'+key);
    assert.equal(m.horizontal,horizontalWorkspace(vp.width,vp.height,'auto'));
  }
});
test('representative markup contains only existing source labels or explicit synthetic fixtures',()=>{
  for(const viewport of manifest.viewports) for(const scene of ['workspace','source','axis','media','output','diagnostic','forms','video','dialog','snackbar']) {
    const {markup,audit}=renderMarkup(viewport,scene);
    assert.deepEqual([...audit.missingSourceLabels],[],`${viewport.id}/${scene}: ${audit.missingSourceLabels}`);
    assert.ok(audit.sourcedLabels>40);
    assert.equal(audit.fixtureErrorLength,512);
    assert.match(markup,/浏览器布局近似 · 非原生截图/);
    assert.doesNotMatch(markup,/https?:\/\//);
  }
});
test('browser fixture leaves production side-effect callbacks unimplemented',()=>{
  assert.doesNotMatch(script,/\b(fetch|XMLHttpRequest|WebSocket|connectDeoVr|applyOutputConfiguration|armOutput)\s*\(/);
  assert.match(script,/Production callbacks are never executed/);
  const {markup}=renderMarkup(manifest.viewports[0],'output');
  assert.match(markup,/192\.0\.2\.123/); // Documentation-only endpoint, not a real device.
  assert.match(markup,/本地完成写入/);assert.match(markup,/不是设备执行确认/);
});
test('all densities keep safe minimum target sizing and compact is explicit',()=>{
  for(const viewport of manifest.viewports) {
    assert.equal(renderMarkup(viewport,'forms').audit.compact,false);
    assert.equal(renderMarkup(viewport,'forms','compact').audit.compact,true);
  }
  const css=readFileSync(new URL('./preview.css',import.meta.url),'utf8');
  assert.match(css,/min-height:var\(--control\)/);
  assert.doesNotMatch(css,/@media[\s\S]*--body/);
});
