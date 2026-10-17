import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c)}});
const {setupIndex}=await import('./index-controller-helpers.mjs');
const {PlaybackSessionCore}=await import('../entry/src/main/ets/core/PlaybackSessionCore.ts');
const {SettingsSchema}=await import('../entry/src/main/ets/settings/SettingsSchema.ts');
const {FunscriptParser}=await import('../entry/src/main/ets/core/Funscript.ts');
const {ResourceFileEntry}=await import('../entry/src/main/ets/core/ResourceLibrary.ts');
const {ShortcutAction,KeyboardShortcutConfiguration,KeyboardShortcutMapping}=await import('../entry/src/main/ets/input/ShortcutConfiguration.ts');
const {ShortcutKeyEvent}=await import('../entry/src/main/ets/input/LocalShortcutEngine.ts');
const {KeyboardInputSession}=await import('../entry/src/main/ets/app/KeyboardInputSession.ts');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve}};
const operation=()=>({started:deferred(),completion:deferred(),respectCancellation:false});
const json=(pos=20)=>JSON.stringify({actions:[{at:0,pos},{at:20000,pos}]});
const binding=(e,n='L0')=>e.bindings().find(b=>b.axisName===n);
function fixture(){
 const config=SettingsSchema.defaults();for(const k of Object.keys(config.sync))if(k.startsWith('sync'))config.sync[k]=false;
 const engine=new PlaybackSessionCore(config);engine.setConnected(true);engine.flush=()=>{};engine.load(FunscriptParser.parse(json()));engine.play();engine.tick(40,40);
 const f=setupIndex({engine,actualResources:true}),{page,state}=f;
 page.axisNames=engine.activeRegistry().axes.map(a=>a.name);page.selectedAxis=0;page.inputNow=()=>40;
 page.libraryLoaded=true;page.libraryRoot='/Download/app';page.videoMode=true;
 const video=new ResourceFileEntry('/Download/app/movie.mp4','movie.mp4','movie.mp4');page.activeVideoFile=video;
 page.mediaCatalog=[video];state.scanFiles=[video,new ResourceFileEntry('/Download/app/movie.funscript','movie.funscript','movie.funscript')];state.scriptText=json(80);
 let disarms=0;page.output.disarm=()=>{disarms++};page.syncOutput=()=>{};
 return{...f,engine,get disarms(){return disarms}};
}
test('fresh bounded same-root scan discovers newly added companion; replacement identity requires a real tick',async()=>{
 const f=fixture(),{page,engine,calls}=f,old=binding(engine),frame=engine.frame(),position=engine.snapshot().positionMs;
 await page.reloadManagedAxisScripts(['L0']);assert.equal(calls.find(c=>c[0]==='scan')[1],page.libraryRoot);
 assert.ok(calls.some(c=>c[0]==='read'&&c[1]==='/Download/app/movie.funscript'));assert.notEqual(binding(engine).resource,old.resource);
 assert.equal(binding(engine).resource.keyframes[0].value,.8);assert.equal(engine.frame(),frame);assert.equal(engine.snapshot().positionMs,position);
 assert.equal(engine.dispatchSource(['L0']).authorization,null);engine.tick(40,80);assert.ok(engine.dispatchSource(['L0']).authorization);assert.equal(f.disarms,0);
 assert.equal(calls.some(c=>['release','nativePlay','video','prepare'].includes(c[0])),false);
});
test('same-content reread is new identity; Lock protects existing object but still reads and requests sync',async()=>{
 const{page,state,engine,calls}=fixture();state.scriptText=json();const old=binding(engine);await page.reloadManagedAxisScripts(['L0']);assert.notEqual(binding(engine).resource,old.resource);
 const a=engine.getAxisConfiguration('L0');a.lockScript=true;engine.changeAxisConfiguration('L0',a);engine.tick(40,80);engine.resetSync('L0',false);
 const locked=binding(engine),start=calls.filter(c=>c[0]==='read').length;await page.reloadManagedAxisScripts(['L0']);assert.equal(binding(engine),locked);
 assert.equal(calls.filter(c=>c[0]==='read').length,start+1);engine.tick(40,120);assert.ok(engine.frame().axisStates.find(a=>a.axisName==='L0').syncTimeSeconds>0);
});
test('ordinary missing companion is explicit zero result and preserves prior ordinary resource',async()=>{
 const{page,state,engine}=fixture(),old=binding(engine);state.scanFiles=[page.activeVideoFile];const message=await page.reloadManagedAxisScripts(['L0']);assert.match(message,/新读取 0/);assert.equal(binding(engine),old);assert.match(message,/保留原普通资源/);
});
test('malformed matching resource rejects rather than reporting successful cached reload',async()=>{
 const f=fixture(),{page,state,engine}=f,old=binding(engine);state.scriptText='{}';await assert.rejects(page.reloadManagedAxisScripts(['L0']));assert.equal(binding(engine),old);assert.ok(f.disarms>0);assert.match(page.scriptReloadStatus,/重载未完成/);
});
test('priority link skips I/O, nonpriority new-link uses fresh root scan and same link explicitly reloads',async()=>{
 const{page,engine,calls}=fixture();let a=engine.getAxisConfiguration('R0');a.linkAxis='L0';a.linkAxisHasPriority=true;engine.changeAxisConfiguration('R0',a,true);
 await page.reloadManagedAxisScripts(['R0']);assert.equal(calls.some(c=>c[0]==='scan'),false);assert.equal(binding(engine,'R0').linkedFromAxis,'L0');
 const old=binding(engine,'R0');await page.touchShortcut(new ShortcutAction('Axis::LinkAxis::Set',0,'R0',0,'L0'));assert.notEqual(binding(engine,'R0'),old);
 a=engine.getAxisConfiguration('R0');a.linkAxisHasPriority=false;engine.changeAxisConfiguration('R0',a,true);await page.reloadManagedAxisScripts(['R0']);assert.ok(calls.some(c=>c[0]==='scan'));
});
test('same LinkPriority Set has no redundant repository read; changed value does reload',async()=>{
 const{page,calls}=fixture();await page.touchShortcut(new ShortcutAction('Axis::LinkPriority::Set',0,'R0'));assert.equal(calls.filter(c=>c[0]==='scan').length,0);
 await page.touchShortcut(new ShortcutAction('Axis::LinkPriority::Set',1,'R0'));assert.equal(calls.filter(c=>c[0]==='scan').length,0,'priority-only skips search');
 await page.touchShortcut(new ShortcutAction('Axis::LinkPriority::Set',0,'R0'));assert.equal(calls.filter(c=>c[0]==='scan').length,1);
});
for(const cancel of ['stop','background','focus','refresh','catalog','profile','configuration','seek','cancel'])test('late reload result cannot survive '+cancel,async()=>{
 const f=fixture(),{page,state,engine,reads}=f,old=binding(engine),pending=operation();reads.push(pending);
 const work=page.reloadManagedAxisScripts(['L0']);await pending.started.promise;assert.equal(engine.dispatchSource(['L0']).availability,'pendingCurrentFrame');
 if(cancel==='stop')page.stop();else if(cancel==='background'){page.foreground=false;engine.setForeground(false);page.updateKeyboardContext();}
 else if(cancel==='focus'){page.viewActive=false;page.updateKeyboardContext();}
 else if(cancel==='refresh')page.cancelLibrary();else if(cancel==='catalog')page.mediaCatalog=page.mediaCatalog.slice();
 else if(cancel==='profile'){const p=engine.configurationSnapshot().devices.find(p=>p.id!=='TCode-0.3');engine.selectProfile(p.id);}
 else if(cancel==='configuration'){const a=engine.getAxisConfiguration('L0');a.scriptScale=2;engine.changeAxisConfiguration('L0',a);}
 else if(cancel==='seek')engine.seek(100);else page.cancelManagedReload();
 pending.completion.resolve();await assert.rejects(work);assert.equal(binding(engine),old);assert.equal(page.scriptReloadBusy,false);assert.ok(f.disarms>0);
});
test('abandoned read cannot clear a newer reload ownership',async()=>{
 const{page,state,reads,engine}=fixture(),first=operation(),second=operation();reads.push(first,second);const a=page.reloadManagedAxisScripts(['L0']);await first.started.promise;
 page.cancelManagedReload();const b=page.reloadManagedAxisScripts(['L0']);await second.started.promise;first.completion.resolve();await assert.rejects(a);assert.equal(page.scriptReloadBusy,true);
 state.scriptText=json(90);second.completion.resolve();await b;assert.equal(binding(engine).resource.keyframes[0].value,.9);assert.equal(page.scriptReloadBusy,false);
});
test('Internal association resolves only from newly scanned catalog and respects direct/companion setting',async()=>{
 for(const additional of [false,true]){const{page,state,engine,calls}=fixture();page.videoMode=false;page.internalConnected=true;
 const file=new ResourceFileEntry('/Download/app/movie.funscript','movie.funscript','movie.funscript');page.internalLibrary.replace([file],engine.activeRegistry().profile);
 page.playlist.setPlaylist([page.internalLibrary.item(file.relativePath)]);page.playlist.playAt(0);page.playlist.drainEvents();
 const config=engine.playbackConfiguration();config.loadAdditionalScripts=additional;engine.changePlaybackConfiguration(config);
 await page.reloadManagedAxisScripts(['L0']);assert.equal(binding(engine).resource.keyframes[0].value,.8);assert.deepEqual(calls.filter(c=>c[0]==='read').map(c=>c[1]),[file.uri]);}
});
test('ordered keyboard Reload then Sync Cancel waits for IO; Stop revokes pending continuation',async()=>{
 for(const stopped of [false,true]){const{page,engine,reads}=fixture();const c=new KeyboardShortcutConfiguration(),m=new KeyboardShortcutMapping('reload');m.keys=[2017];m.actions=[new ShortcutAction('Axis::ReloadScript',0,'L0'),new ShortcutAction('Axis::Sync::Cancel',0,'L0')];c.mappings=[m];page.keyboard.setConfiguration(c);page.updateKeyboardContext();
 const pending=operation();reads.push(pending);const[d]=page.keyboard.keyEvent(new ShortcutKeyEvent(2017,true),40);const work=page.runShortcutDispatch(d);await pending.started.promise;
 if(stopped)page.stop();pending.completion.resolve();await work;engine.tick(40,80);if(stopped)assert.equal(engine.snapshot().state,'stopped');else assert.equal(engine.frame().axisStates.find(a=>a.axisName==='L0').syncTimeSeconds,0);}
});
test('confirmed native playback clock and provider registry keep running throughout reload without invented observations',async()=>{
 const{MediaClock}=await import('../entry/src/main/ets/core/MediaClock.ts');
 const{page,engine,reads,calls}=fixture();const axis=engine.getAxisConfiguration('L0');axis.selectedMotionProvider='Pattern';axis.motionProviderBlend=.2;engine.changeAxisConfiguration('L0',axis);
 engine.useExternalClock(true);const clock=new MediaClock(),generation=clock.reset('loading');clock.prepared(generation,20000,1000,100);engine.acceptNativeSnapshot(clock.snapshot());engine.play();clock.requestPlay();clock.stateChanged(generation,'playing');engine.acceptNativeSnapshot(clock.snapshot());engine.tick(40,140);
 const epoch=engine.frame().epoch,registry=engine.motion,pending=operation();reads.push(pending);const work=page.reloadManagedAxisScripts(['L0']);await pending.started.promise;
 const observation=clock.snapshot().observationSequence;clock.observe(generation,1080,180);engine.acceptNativeSnapshot(clock.snapshot());engine.tick(40,180);
 assert.equal(engine.snapshot().state,'playing');assert.ok(engine.snapshot().positionMs>1000);assert.equal(engine.dispatchSource(['L0']).availability,'pendingCurrentFrame');assert.equal(engine.motion,registry);assert.equal(engine.frame().epoch,epoch);
 pending.completion.resolve();await work;assert.equal(engine.frame().epoch,epoch);assert.equal(clock.snapshot().observationSequence,observation+1);assert.equal(engine.dispatchSource(['L0']).authorization,null);
 clock.observe(generation,1120,220);engine.acceptNativeSnapshot(clock.snapshot());engine.tick(40,220);assert.ok(engine.dispatchSource(['L0']).authorization);assert.equal(engine.motion,registry);assert.equal(calls.some(c=>['release','nativePlay','video'].includes(c[0])),false);
});

test('incomplete or error-bearing reindex cannot commit a partial replacement or retain old arm intent',async()=>{
 for(const mode of ['limit','permission']){const f=fixture(),{page,state,engine,calls}=f,old=binding(engine);if(mode==='limit')state.scanTruncated=true;else state.scanWarnings=['Cannot inspect a folder entry: permission denied'];await assert.rejects(page.reloadManagedAxisScripts(['L0']),/目录重索引不完整/);assert.equal(binding(engine),old);assert.equal(calls.some(c=>c[0]==='read'),false);assert.ok(f.disarms>0);}
});
