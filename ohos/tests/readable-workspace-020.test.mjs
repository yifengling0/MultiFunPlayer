import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);}});
const {setupIndex}=await import('./index-controller-helpers.mjs');
const {GeneralConfiguration}=await import('../entry/src/main/ets/settings/GeneralConfiguration.ts');
const {PlaybackSessionCore}=await import('../entry/src/main/ets/core/PlaybackSessionCore.ts');
const {FunscriptParser}=await import('../entry/src/main/ets/core/Funscript.ts');
const {SettingsSchema}=await import('../entry/src/main/ets/settings/SettingsSchema.ts');
const {UiStyle}=await import('../entry/src/main/ets/presentation/UiStyle.ts');
const {videoWorkspaceLayout}=await import('../entry/src/main/ets/core/VideoLayout.ts');
const page=readFileSync(new URL('../entry/src/main/ets/pages/Index.ets',import.meta.url),'utf8');
const sizes=[[320,640],[360,800],[390,844],[568,320],[640,360],[768,1024],[1024,768],[1280,800],[320,480]];
for(const [width,height]of sizes)test(`readable workspace ${width}×${height}: actual layout retains visible video/settings and 52vp controls`,()=>{
 const layout=videoWorkspaceLayout(width,height,true,false);assert.equal(layout.headerHeight,72);assert.ok([52,104].includes(layout.controlsHeight));
 assert.ok(layout.video.height-layout.controlsHeight>=80);assert.ok(layout.settings.height>=80);assert.ok(layout.video.width>=240);assert.ok(layout.settings.width>=320);
 for(const r of[layout.video,layout.settings]){assert.ok(r.x>=0&&r.y>=0);assert.ok(r.x+r.width<=width+.001&&r.y+r.height<=height+.001);}
});
test('density is explicit and persisted without changing current frame, media time or starting output',()=>{
 const core=new PlaybackSessionCore();core.setConnected(true);core.load(FunscriptParser.parse('{"actions":[{"at":0,"pos":10},{"at":1000,"pos":90}]}'));core.play();core.tick(40,40);
 const {page:p,calls}=setupIndex({engine:core}),before=core.snapshot(),position=core.mediaPositionSeconds();
 for(const [w,h]of sizes){p.widthVp=w;p.heightVp=h;assert.equal(p.compactControls(),false);}
 const configuration=core.generalConfiguration();configuration.uiDensity='compact';p.applyGeneralSettings(configuration);assert.equal(p.compactControls(),true);assert.equal(core.mediaPositionSeconds(),position);assert.deepEqual(core.snapshot(),before);assert.equal(calls.some(c=>c[0]==='outputConnect'),false);
 const settings=SettingsSchema.defaults();settings.general=core.generalConfiguration();assert.equal(SettingsSchema.decode(SettingsSchema.encode(settings)).configuration.general.uiDensity,'compact');
 p.settingsReadOnly=true;const next=GeneralConfiguration.clone(configuration);next.uiDensity='readable';p.applyGeneralSettings(next);assert.equal(p.compactControls(),true);
});
test('main controls have explicit readable styles; original single native Surface and safe scrolling remain',()=>{
 assert.ok(UiStyle.heading>=22&&UiStyle.helper>=14&&UiStyle.control>=48);assert.equal(UiStyle.body(false),16);assert.equal(UiStyle.body(true),15);
 assert.doesNotMatch(page,/\.fontSize\((?:9|10|11|12|13)\)/);assert.doesNotMatch(page,/\.height\(34\)/);
 assert.equal((page.match(/XComponent\(\{/g)||[]).length,1);assert.match(page,/this\.generalConfiguration\.uiDensity === 'compact'/);assert.doesNotMatch(page,/deviceInfo\.deviceType/);
 const video=page.slice(page.indexOf('  videoStage() {'),page.indexOf('  workspaceSettings() {'));assert.match(video,/Button\('■ 停止'\)/);assert.match(video,/Button\(this.videoFullscreen \? '退出' : '全屏'\)/);
 assert.match(page,/SettingsSwitchField\(\{ label: t\('Combine axes'\)/);assert.doesNotMatch(page,/\bSelect\(\[/);assert.match(page,/Text\(Number.isFinite\(this.axisValues\[index\]\)[^\n]*\.width\(64\)/);
 assert.match(page,/Scroll\(\) \{ Text\(this.errorNoticeMessage\)/);assert.match(page,/OwnedConfirmationDialog\(/);const modal=readFileSync(new URL('../entry/src/main/ets/components/OwnedConfirmationDialog.ets',import.meta.url),'utf8');assert.match(modal,/Button\('停止全部输出'/);assert.match(modal,/height\(UiStyle.control\)/);assert.match(modal,/onClick\(this.stopHandler\(\)\)/);assert.match(page,/Text\(this.diagnosticNotice\)/);assert.match(page,/关闭确认：/);assert.match(page,/Text\(file.name\)[^\n]*wordBreak/);assert.match(page,/Text\(match.file.name\)[^\n]*wordBreak/);assert.match(page,/Text\(target.name\)/);assert.match(page,/outputStatusTone\(target\)/);assert.match(page,/outputEndpointLabel\(target.id\)/);
});
test('diagnostic endpoints revoke receiver confirmation immediately on text editing before focus/commit order',()=>{
 const fields=readFileSync(new URL('../entry/src/main/ets/components/CurvePointEditor.ets',import.meta.url),'utf8');
 assert.equal((fields.match(/onEdit: \(\) => void = \(\): void => \{\};/g)||[]).length,2);assert.equal((fields.match(/this\.onEdit\(\)/g)||[]).length,2);
 assert.equal((page.match(/onEdit: \(\): void => this\.invalidateDiagnosticConfirmation\(\)/g)||[]).length,2);
});

test('global Stop is pinned outside every scrolling pane and uses the existing hard stop in the unified header',()=>{
 const stop=page.slice(page.indexOf('  globalStopButton() {'),page.indexOf('  headerTools() {'));
 assert.match(stop,/Button\('停止'\).*width\(64\).*height\(40\).*flexShrink\(0\)/);assert.match(stop,/responseRegion\(\{ y: -4, width: '100%', height: 48 \}\)/);assert.match(stop,/onClick\(\(\) => this.stop\(\)\)/);
 const header=page.slice(page.indexOf('  workspaceHeader() {'),page.indexOf('  build() {'));
 assert.equal((header.match(/this\.globalStopButton\(\)/g)||[]).length,1);assert.doesNotMatch(header,/Scroll\(/);assert.match(header,/this\.headerBrand\(\)/);
 const build=page.slice(page.indexOf('  build() {'));assert.ok(build.indexOf('this.workspaceHeader()')>build.indexOf('this.videoStage()'));assert.match(page,/Button\('■ 停止'\)[\s\S]{0,220}accessibilityText\(t\('Stop output'\)\)[^\n]*this.stop\(\)/);
 for(const [w,h]of [[240,320],[280,360],[319,320],[320,240],[568,320],[768,1024],[1280,800]]){
  const layout=videoWorkspaceLayout(w,h,false,false);assert.equal(layout.headerHeight,72);assert.equal(layout.settings.y,layout.headerHeight);assert.ok(layout.headerHeight<=h);
  // Fixed Stop72 + More52 + gaps16 + outer24 leave a short MFP title even at240.
  assert.ok(w-(72+52+16+24)>=76);
 }
});
