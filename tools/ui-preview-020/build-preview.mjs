/** Read-only production adapter: no package installs, networking or app execution. */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative } from 'node:path';
import { UiStyle } from '../../ohos/entry/src/main/ets/presentation/UiStyle.ts';
import { videoWorkspaceLayout } from '../../ohos/entry/src/main/ets/core/VideoLayout.ts';
import { horizontalWorkspace } from '../../ohos/entry/src/main/ets/presentation/GeneralPresentation.ts';
const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, '../..');
const ets = resolve(root, 'ohos/entry/src/main/ets');
const viewports = [
  ['phone-320',320,568], ['phone-360',360,640], ['phone-390',390,844],
  ['landscape-568',568,320], ['landscape-640',640,360],
  ['tablet-768',768,1024], ['tablet-1024',1024,768],
  ['pc-1280',1280,800], ['window-320',320,480]
].map(([id,width,height])=>({id,width,height}));
const paths = [ 'pages/Index.ets', 'core/VideoLayout.ts', 'presentation/UiStyle.ts',
  'presentation/GeneralPresentation.ts','settings/GeneralConfiguration.ts','core/AppVersion.ts','l10n/Texts.ets',
  ...readdirSync(resolve(ets,'components')).filter(f=>f.endsWith('.ets')).map(f=>'components/'+f) ];
const sources = paths.map(path=>({ path: 'ohos/entry/src/main/ets/'+path,
  sha256:createHash('sha256').update(readFileSync(resolve(ets,path))).digest('hex') }));
const texts = Object.fromEntries(paths.map(path=>[path,readFileSync(resolve(ets,path),'utf8')]));
const literalStrings = new Set();
for(const source of Object.values(texts)) {
  for(const match of source.matchAll(/'((?:[^'\\\r\n]|\\.)*)'/g)) {
    try { literalStrings.add(JSON.parse('"'+match[1].replace(/"/g,'\\"')+'"')); } catch {}
  }
}
const colors = {};
for(const key of ['page','card','field','ink','muted','edge','edgeLight','accent','accentSoft','danger','dangerSoft','warning','success']) colors[key]=UiStyle[key];
const tokens = {...colors,heading:UiStyle.heading,helper:UiStyle.helper,control:UiStyle.control,radius:UiStyle.radius,
  body:UiStyle.body(false),compactBody:UiStyle.body(true),gap:UiStyle.gap(false),compactGap:UiStyle.gap(true),
  padding:UiStyle.padding(false),compactPadding:UiStyle.padding(true)};
const metrics = {};
for(const v of viewports) metrics[v.id] = {
  plain: videoWorkspaceLayout(v.width,v.height,false,false),
  video: videoWorkspaceLayout(v.width,v.height,true,false),
  fullscreen:videoWorkspaceLayout(v.width,v.height,true,true),
  horizontal:horizontalWorkspace(v.width,v.height,'auto')
};
const general=texts['settings/GeneralConfiguration.ts'];
const index=texts['pages/Index.ets'];
const compactMethod=index.slice(index.indexOf('  compactControls()'),index.indexOf('  resizeWorkspace('));
const heatmap=index.match(/Canvas\(this\.canvas\)\.width\('100%'\)\.height\(this\.compactControls\(\) \? (\d+) : (\d+)\)/);
if(!heatmap) throw Error('Update preview adapter: production heatmap metric expression changed.');
const manifest={
  schema:1,kind:'Browser design/layout approximation; NOT an ArkUI/device render',
  generatedAt:new Date().toISOString(),viewports,tokens,metrics,sources,
  uiMetrics:{heatmapCompact:Number(heatmap[1]),heatmapReadable:Number(heatmap[2])},
  version:texts['core/AppVersion.ts'].match(/APP_VERSION_NAME[^=]*=\s*'([^']+)'/)?.[1]??'unknown',
  densityDefault:general.match(/uiDensity[^=]*=\s*'([^']+)'/)?.[1]??'unavailable',
  explicitCompact:/uiDensity\s*===\s*'compact'/.test(compactMethod)&&!compactMethod.includes('compactDevice'),
  sourceStrings:[...literalStrings].sort(),
  caveats:[
    'HTML mirrors representative ArkUI builder sections; it does not execute ArkUI, native Select, XComponent or player callbacks.',
    'Actual UiStyle values and VideoLayout/horizontalWorkspace functions are imported without copying their numeric values.',
    'Chinese fixture filenames, paths, long errors and endpoint names are deliberately synthetic. No real endpoint is contacted.',
    'CSS line wrapping, font fallback, measurement and safe-area behavior differ from HarmonyOS. Native IME, touch, accessibility and hardware require device acceptance.',
    'Screenshot checks prove only this browser approximation. SHA256 fingerprints allow a stale preview to be detected.'
  ]
};
writeFileSync(resolve(dir,'generated/manifest.json'),JSON.stringify(manifest,null,2)+'\n');
writeFileSync(resolve(dir,'generated/manifest.js'),'window.PREVIEW = '+JSON.stringify(manifest)+';\n');
console.log(`Read ${sources.length} production files; ${viewports.length} viewports; ${manifest.kind}`);
