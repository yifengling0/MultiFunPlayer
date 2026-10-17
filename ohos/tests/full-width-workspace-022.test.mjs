import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);}});
const { setupIndex } = await import('./index-controller-helpers.mjs');
const { UiStyle } = await import('../entry/src/main/ets/presentation/UiStyle.ts');
const { PlaybackSessionCore } = await import('../entry/src/main/ets/core/PlaybackSessionCore.ts');
const { FunscriptParser } = await import('../entry/src/main/ets/core/Funscript.ts');
const { KeyboardInputSession } = await import('../entry/src/main/ets/app/KeyboardInputSession.ts');
const page = readFileSync(new URL('../entry/src/main/ets/pages/Index.ets',import.meta.url),'utf8');
const fields = readFileSync(new URL('../entry/src/main/ets/components/CurvePointEditor.ets',import.meta.url),'utf8');
const sizes = [[240,640],[280,640],[320,640],[360,800],[400,800],[568,320],[800,1280],[800,600],[1280,800],[1920,1080]];
for(const [width,height] of sizes)for(const video of [false,true])test(`real page geometry fills ${width}×${height}, video=${video} without narrowing its content`,()=>{
 const {page:p}=setupIndex();p.resizeWorkspace(width,height);p.videoMode=video;
 const layout=p.workspaceLayout(), inset=p.contentPadding(), toolbar=p.scriptPaneWidth();
 assert.equal(layout.settings.width - inset*2, video || width < 720 || (width < height && width <1200) ? toolbar : toolbar*2+UiStyle.paneGap);
 assert.ok(toolbar>0);
 for(const count of [6,9]){
  const percent=parseFloat(count===6?p.mediaToolWidth():p.axisToolWidth());
  const columns=Math.round(100/percent);assert.ok(toolbar*percent/100>=52-1e-9);
  assert.ok([1,2,3,count].includes(columns));assert.ok(count===9||count%columns===0);
 }
 if(!video&&width===320)assert.equal(p.mediaToolWidth(),(100/3).toString()+'%');
});
test('ordinary panes have no width caps or nested horizontal gutters; modal limits remain independent',()=>{
 const workspace=page.slice(page.indexOf('  workspaceSettings() {'),page.indexOf('  globalStopButton() {'));
 assert.doesNotMatch(workspace,/maxWidth: (?:600|1220)/);assert.match(workspace,/left: this.contentPadding\(\), right: this.contentPadding\(\)/);
 assert.match(page.slice(page.indexOf('  build() {')),/maxWidth: 600/);
 const directory=new URL('../entry/src/main/ets/components/',import.meta.url);
 for(const name of readdirSync(directory).filter(name=>name.endsWith('.ets')&&name!=='CurvePointEditor.ets')){
  const text=readFileSync(new URL(name,directory),'utf8');
  assert.doesNotMatch(text,/\.padding\(UiStyle.padding\(this.compact\)\)/,name);
  assert.doesNotMatch(text,/backgroundColor\(UiStyle.card\)\.borderRadius\(UiStyle.radius\)\.border/,name);
 }
 assert.equal(UiStyle.page,UiStyle.card);assert.doesNotMatch(page.slice(page.indexOf('function flatButton()'),page.indexOf('class ShortcutConnectionOwner')),/shadow\(/);
 const title=fields.slice(fields.indexOf('export struct SettingsSectionTitle'),fields.indexOf('export struct CurvePointEditor'));
 assert.doesNotMatch(title,/backgroundColor|left: 12|right: 12/);assert.match(title,/bottom: 1/);
});
test('width changes alone preserve actual session/frame/source/permission state',()=>{
 const core=new PlaybackSessionCore();core.setConnected(true);core.load(FunscriptParser.parse('{"actions":[{"at":0,"pos":10},{"at":1000,"pos":90}]}'));core.play();core.tick(40,40);
 const {page:p,calls}=setupIndex({engine:core});const before=core.snapshot(),beforeCalls=calls.length;
 for(const [w,h]of sizes){p.resizeWorkspace(w,h);p.contentPadding();p.scriptPaneWidth();p.mediaToolWidth();p.axisToolWidth();}
 assert.deepEqual(core.snapshot(),before);assert.equal(calls.length,beforeCalls);
 assert.equal((page.match(/XComponent\(\{/g)||[]).length,1);
});
function fieldController(name){
 const start=fields.indexOf('export struct '+name),end=fields.indexOf('  build()',start);
 const body=fields.slice(start,end).replace('export struct','class').replace(/@(Prop|State|Watch)(\([^)]*\))?\s*/g,'')+'\n}';
 return new Function('KeyboardInputSession',stripTypeScriptTypes(body)+';return '+name+';')(KeyboardInputSession);
}
for(const name of ['SettingsNumberField','SettingsTextField','SettingsChoiceField'])test(`${name}: actual geometry updates retain draft and keyboard ownership across the breakpoint`,()=>{
 const Field=fieldController(name),field=new Field();field.draft='uncommitted example';field.error=true;
 const editor=field.keyboardEditorId;let changed=0;field.onCommit=()=>{changed++;return true;};field.onSelect=()=>changed++;
 for(const width of [240,320,599,600,601,936,300]){field.measureField(width);assert.equal(field.fieldWidth,width);assert.equal(field.draft,'uncommitted example');assert.equal(field.error,true);assert.equal(field.keyboardEditorId,editor);}
 for(const width of [0,-1,NaN,Infinity])field.measureField(width);
 assert.equal(field.fieldWidth,300);assert.equal(changed,0);
 const block=fields.slice(fields.indexOf('export struct '+name),fields.indexOf('\n@Component',fields.indexOf('export struct '+name)));
 assert.match(block,/fieldLabelWidth\(this.fieldWidth\)/);assert.match(block,/fieldControlWidth\(this.fieldWidth\)/);
 assert.equal((block.match(/TextInput\(/g)||[]).length,name==='SettingsChoiceField'?0:1);
 assert.doesNotMatch(block,/if \(this.fieldWidth/);
});
test('field columns use measured pane width, including a wide window with a narrow video sidebar',()=>{
 for(const w of [240,320,520,599]){assert.equal(UiStyle.fieldLabelWidth(w),'100%');assert.equal(UiStyle.fieldControlWidth(w),'100%');}
 for(const w of [600,800,936]){assert.equal(UiStyle.fieldLabelWidth(w),'40%');assert.equal(UiStyle.fieldControlWidth(w),'60%');}
});
