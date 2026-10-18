import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setupIndex} from './index-controller-helpers.mjs';
import {videoWorkspaceLayout} from '../entry/src/main/ets/core/VideoLayout.ts';
const page=readFileSync(new URL('../entry/src/main/ets/pages/Index.ets',import.meta.url),'utf8');
const builder=name=>page.slice(page.indexOf('  '+name+'() {'),page.indexOf('  @Builder',page.indexOf('  '+name+'() {'))>0?page.indexOf('  @Builder',page.indexOf('  '+name+'() {')):page.indexOf('  build() {'));
test('four tool routes expose every major panel without starting playback or output on navigation',()=>{
 const {page:p,calls}=setupIndex();let value=0;const lease=p.settingsDraftOwner.open('axis:test','value','1','1');p.settingsDraftOwner.write(lease.token,'1','1e-',true);const before=calls.length;
 for(const tool of ['output','media','settings','script']){p.selectWorkspaceTool(tool);assert.equal(p.workspaceTool,tool);}
 assert.ok(calls.slice(before).every(call=>['scrollTop','presentationRequest'].includes(call[0])));assert.equal(p.settingsDraftOwner.peek('axis:test','value'),'1e-');assert.equal(p.settingsDraftOwner.isCurrent(lease.token,'1'),false);
 const text=builder('inspector');for(const name of ['scriptArea','outputPanel','sourcePanel','libraryPanel','preferencesPanel','devicePanel'])assert.match(text,new RegExp('this\\.'+name+'\\(\\)'));
 assert.match(builder('toolNavigation'),/\['script', 'output', 'media', 'settings'\]/);
});
test('leaving input settings cancels transient capture but retains unsubmitted mapping text',()=>{
 const {page:p}=setupIndex();p.workspaceTool='settings';p.showInputSettings=true;p.keyboardCaptureId='capture';p.keyboardCaptureKeys=[1];let cancelled=0;p.cancelKeyboardWork=()=>{cancelled++;p.keyboardCaptureId='';p.keyboardCaptureKeys=[];};p.updateKeyboardContext=()=>{};
 const x=p.settingsDraftOwner.open('input','raw','source','');p.settingsDraftOwner.write(x.token,'source','unfinished',true);p.selectWorkspaceTool('script');assert.equal(cancelled,1);assert.equal(p.showInputSettings,false);assert.equal(p.settingsDraftOwner.peek('input','raw'),'unfinished');
});
test('output selector captures exact target generations and rejects old navigation callbacks',()=>{
 const {page:p}=setupIndex();p.outputTargets=[{id:'tcp-1',generation:7}];let selected=[];p.selectOutputTarget=(...x)=>selected.push(x);const choose=p.outputChoiceHandler();choose('tcp-1');assert.deepEqual(selected,[['tcp-1',7]]);
 p.retireSettingsDrafts();choose('tcp-1');assert.equal(selected.length,1);const fresh=p.outputChoiceHandler();p.foreground=false;fresh('tcp-1');assert.equal(selected.length,1);
});
test('output status summary is derived independently from every real target',()=>{
 const {page:p}=setupIndex();assert.equal(p.outputSummary(),'0 个已连接 · 输出未启用');p.outputTargets=[{connection:'connected',armed:true,dispatchSuspended:true},{connection:'connected',armed:false,dispatchSuspended:false}];assert.equal(p.outputSummary(),'2 个已连接 · 1 个已启用 / 1 个待命');
});
test('approved workspace keeps one video node, permanent Stop and all original protocol add choices',()=>{
 assert.equal((page.match(/XComponent\(\{/g)||[]).length,1);const build=page.slice(page.indexOf('  build() {'));assert.match(build,/this\.videoStage\(\)/);assert.match(build,/this\.workspaceHeader\(\)/);
 assert.match(builder('globalStopButton'),/width\(64\)\.height\(52\)/);assert.match(builder('workspaceHeader'),/this\.globalStopButton\(\)/);assert.match(builder('videoStage'),/Button\('■'\)[\s\S]*this.stop\(\)/);
 const output=builder('outputPanel');for(const kind of ['serial','tcp','udp','webSocket'])assert.match(output,new RegExp("addOutputTarget\\('"+kind+"'\\)"));assert.match(output,/removeOutputConfirmationHandler\(target.id, target.generation\)/);assert.match(output,/target\.dispatchSuspended/);
});
for(const [w,h]of [[240,640],[320,640],[390,844],[568,320],[800,1280],[1024,768],[1920,1080]])test(`player and inspector remain bounded at ${w}×${h}`,()=>{
 const layout=videoWorkspaceLayout(w,h,true,false);for(const rect of [layout.video,layout.settings,layout.trace]){assert.ok(rect.x>=0&&rect.y>=0&&rect.width>=0&&rect.height>=0);assert.ok(rect.x+rect.width<=w&&rect.y+rect.height<=h);}
 assert.equal(layout.headerHeight,72);assert.ok(layout.settings.height>100);assert.ok(layout.video.height>=layout.controlsHeight);
 if(w>=1000&&h>=600){assert.ok(layout.trace.height>0);assert.equal(layout.trace.y,layout.video.y+layout.video.height);assert.ok(layout.settings.width<=480);}
 else assert.equal(layout.trace.height,0);
 assert.equal(videoWorkspaceLayout(w,h,true,true).trace.height,0);
});
test('non-video inspector reserves the real transport, spacing and padding instead of clipping its scroll bottom',()=>{
 const {page:p}=setupIndex();p.videoMode=false;
 for(const [w,h] of [[240,640],[390,844],[568,320],[800,1280],[1024,768],[1920,1080]]){
  p.widthVp=w;p.heightVp=h;p.generalConfiguration.appOrientation='vertical';const available=p.workspaceLayout().settings.height;
  assert.equal(p.inspectorHeight()+52+12+24,available,`${w}×${h}`);assert.ok(p.inspectorHeight()>100);
 }
 p.widthVp=1024;p.heightVp=768;p.generalConfiguration.appOrientation='horizontal';assert.equal(p.inspectorHeight()+32,p.workspaceLayout().settings.height);
 p.videoMode=true;p.currentScreen='workspace';assert.equal(p.inspectorHeight(),p.workspaceLayout().settings.height);
});
test('sync action visibly navigates to its controls and output state stays above the inspector scroll on phones',()=>{
 assert.match(builder('mediaToolbar'),/this\.showMediaSettings = true; this\.selectWorkspaceTool\('script'\)/);
 const inspector=builder('inspector');assert.ok(inspector.indexOf('Text(this.outputSummary())')<inspector.indexOf('Scroll(this.settingsScroller)'));
 const {page:p}=setupIndex();p.outputTargets=[{connection:'fault',armed:false,dispatchSuspended:false}];assert.equal(p.outputSummary(),'0 个已连接 · 输出未启用 · 1 个故障');
});
test('selected output details precede folded other-target status and repeated axis titles/folds are absent',()=>{
 const output=builder('outputPanel');assert.ok(output.indexOf('OutputSettingsPanel(')<output.indexOf('this.showAllOutputStates'));
 assert.match(output,/if \(this.showAllOutputStates\)/);assert.match(output,/ForEach\(this.outputTargets.filter\(target => this.showAllOutputStates \|\| target.id === this.selectedOutputId\)/);assert.match(builder('axisToolbar'),/showTitle: false/);
 assert.equal((builder('axes').match(/showAxisValues/g)||[]).length,0);
});

test('short stacked video keeps a scroll budget, including explicit vertical landscape and fault states',()=>{
 for(const [width,height]of [[480,320],[540,320],[568,320],[800,360]]){
  const layout=videoWorkspaceLayout(width,height,true,false,'vertical');assert.equal(layout.sideBySide,false);assert.ok(layout.settings.height>=156);assert.ok(layout.video.height-layout.controlsHeight>=32);
 }
 const inspector=builder('inspector');assert.match(inspector,/if \(this.inspectorHeight\(\) >= 220\) \{ this.inspectorWarning\(\) \}/);
 const scroll=inspector.slice(inspector.indexOf('Scroll(this.settingsScroller)'));assert.match(scroll,/if \(this.inspectorHeight\(\) < 220\) \{ this.inspectorWarning\(\) \}/);
});
