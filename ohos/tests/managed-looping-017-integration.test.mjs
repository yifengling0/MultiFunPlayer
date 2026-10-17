import test from 'node:test';
import assert from 'node:assert/strict';
import {setupIndex} from './index-controller-helpers.mjs';
const {PlaybackSessionCore}=await import('../entry/src/main/ets/core/PlaybackSessionCore.ts');
const {SettingsSchema}=await import('../entry/src/main/ets/settings/SettingsSchema.ts');
const {FunscriptParser}=await import('../entry/src/main/ets/core/Funscript.ts');
const {ResourceFileEntry}=await import('../entry/src/main/ets/core/ResourceLibrary.ts');
const {ShortcutAction}=await import('../entry/src/main/ets/input/ShortcutConfiguration.ts');
const json=(pos=20)=>JSON.stringify({actions:[{at:0,pos},{at:10000,pos}]});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve}};
const operation=()=>({started:deferred(),completion:deferred(),respectCancellation:false});
function fixture(){
 const cfg=SettingsSchema.defaults();cfg.sync.durationSeconds=.5;
 const engine=new PlaybackSessionCore(cfg);engine.setConnected(true);engine.flush=()=>{};
 let a=engine.getAxisConfiguration('L0');a.selectedMotionProvider='Looping Script';a.updateMotionProviderWhenPaused=true;a.updateMotionProviderWithoutScript=true;engine.changeAxisConfiguration('L0',a);
 engine.load(FunscriptParser.parse(json()));engine.play();engine.tick(40,40);
 const f=setupIndex({engine,actualResources:true});f.engine=engine;
 const p=f.page;p.axisNames=engine.activeRegistry().axes.map(a=>a.name);p.selectedAxis=0;p.libraryRequest=1;p.libraryRoot='managed:root';p.libraryLoaded=true;
 p.mediaCatalog=[new ResourceFileEntry('file:///Download/one.funscript','one.funscript','folder/one.funscript'),new ResourceFileEntry('file:///Download/two.funscript','two.funscript','two.funscript')];f.state.scriptText=json(70);
 p.syncOutput=()=>{};p.sync=()=>{};p.inputNow=()=>40;let disarms=0;p.output.disarm=()=>{disarms++};
 return {...f,get disarms(){return disarms}};
}
const provider=f=>f.engine.motion.getProvider('L0','Looping Script');
test('same managed identity rereads bytes, replaces real resource, resets phase and preserves cached value until tick',async()=>{
 const f=fixture();await f.page.reloadManagedLoopingScript('L0','folder/one.funscript');f.engine.tick(40,80);const first=provider(f).getScriptResource(),frame=f.engine.frame();
 assert.equal(f.engine.getMotionConfiguration('L0','Looping Script').sourceUri,'file:///Download/one.funscript');assert.equal(provider(f).value,.7);
 f.state.scriptText=json(90);await f.page.reloadManagedLoopingScript('L0','file:///Download/one.funscript');
 assert.notEqual(provider(f).getScriptResource(),first);assert.equal(provider(f).getTimeSeconds(),0);assert.equal(provider(f).value,.7);
 assert.equal(f.engine.frame(),frame);assert.equal(f.engine.snapshot().state,'playing');assert.equal(f.engine.dispatchSource(['L0']).authorization,null);
 assert.equal(f.calls.filter(c=>c[0]==='read').length,2);assert.equal(f.disarms,0);f.engine.tick(40,120);assert.equal(provider(f).value,.9);
});
for(const cancel of ['stop','background','focus','refresh','catalog','profile','configuration','seek','cancel'])test('Looping late read cannot survive '+cancel,async()=>{
 const f=fixture();await f.page.reloadManagedLoopingScript('L0','file:///Download/one.funscript');const old=provider(f).getScriptResource();
 const pending=operation();f.reads.push(pending);const work=f.page.reloadManagedLoopingScript('L0','file:///Download/two.funscript');await pending.started.promise;
 assert.equal(f.engine.dispatchSource(['L0']).availability,'pendingCurrentFrame');
 if(cancel==='stop')f.page.stop();else if(cancel==='background'){f.page.foreground=false;f.engine.setForeground(false);f.page.updateKeyboardContext();}
 else if(cancel==='focus'){f.page.viewActive=false;f.page.updateKeyboardContext();}
 else if(cancel==='refresh')f.page.cancelLibrary();else if(cancel==='catalog')f.page.mediaCatalog=f.page.mediaCatalog.slice();
 else if(cancel==='profile')f.engine.selectProfile(f.engine.configurationSnapshot().devices.find(x=>x.id!==f.engine.activeRegistry().profile.id).id);
 else if(cancel==='configuration'){let c=f.engine.getMotionConfiguration('L0','Looping Script');c.speed=2;f.engine.changeMotionConfiguration('L0',c);}
 else if(cancel==='seek')f.engine.seek(100);else f.page.cancelManagedReload();
 pending.completion.resolve();await assert.rejects(work);assert.equal(provider(f).getScriptResource(),old);assert.equal(f.engine.getMotionConfiguration('L0','Looping Script').sourceUri,'file:///Download/one.funscript');assert.ok(f.disarms>0);
});
test('malformed new bytes keep previous resource/configuration and disarm, never success',async()=>{
 const f=fixture();await f.page.reloadManagedLoopingScript('L0','file:///Download/one.funscript');const old=provider(f).getScriptResource();f.state.scriptText='{"actions":[]}';
 await assert.rejects(f.page.reloadManagedLoopingScript('L0','file:///Download/two.funscript'));assert.equal(provider(f).getScriptResource(),old);assert.equal(f.engine.getMotionConfiguration('L0','Looping Script').sourceUri,'file:///Download/one.funscript');assert.ok(f.disarms>0);
});
test('touch command uses exact catalog relative path; basename and arbitrary absolute path do no IO',async()=>{
 const f=fixture();await f.page.touchShortcut(new ShortcutAction('MotionProvider::Looping Script::Script::Set',0,'L0',0,'folder/one.funscript'));
 assert.equal(f.engine.getMotionConfiguration('L0','Looping Script').sourceUri,'file:///Download/one.funscript');const count=f.calls.filter(c=>c[0]==='read').length;
 for(const text of ['one.funscript','file:///secret','',null]){const action=new ShortcutAction('MotionProvider::Looping Script::Script::Set',0,'L0',0,text);await f.page.touchShortcut(action);}
 assert.equal(f.calls.filter(c=>c[0]==='read').length,count);
});
test('newer resource operation owns its pending gate after an older cancelled completion',async()=>{
 const f=fixture(),a=operation(),b=operation();f.reads.push(a,b);const old=f.page.reloadManagedLoopingScript('L0','file:///Download/one.funscript');await a.started.promise;
 f.page.cancelManagedReload();const newer=f.page.reloadManagedLoopingScript('L0','file:///Download/two.funscript');await b.started.promise;
 a.completion.resolve();await assert.rejects(old);assert.equal(f.page.scriptReloadBusy,true);b.completion.resolve();await newer;assert.equal(f.engine.getMotionConfiguration('L0','Looping Script').sourceUri,'file:///Download/two.funscript');
});
