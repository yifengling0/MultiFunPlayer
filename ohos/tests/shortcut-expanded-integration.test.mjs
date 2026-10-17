import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c)}});
const{setupIndex}=await import('./index-controller-helpers.mjs');
const{PlaybackSessionCore}=await import('../entry/src/main/ets/core/PlaybackSessionCore.ts');
const{SettingsSchema,PlaybackConfiguration}=await import('../entry/src/main/ets/settings/SettingsSchema.ts');
const{FunscriptParser,FunscriptMetadata,FunscriptChapter,FunscriptBookmark}=await import('../entry/src/main/ets/core/Funscript.ts');
const{ShortcutAction,KeyboardShortcutConfiguration,KeyboardShortcutMapping,defaultShortcutAction,shortcutActionCatalog}=await import('../entry/src/main/ets/input/ShortcutConfiguration.ts');
const{ShortcutKeyEvent}=await import('../entry/src/main/ets/input/LocalShortcutEngine.ts');
const{AxisConfigurationEntry}=await import('../entry/src/main/ets/core/AxisConfiguration.ts');
const{applyAxisShortcutAction}=await import('../entry/src/main/ets/input/ShortcutSettingActions.ts');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve}};
const settle=async()=>{for(let i=0;i<40;i++)await Promise.resolve()};
function fixture(configuration=SettingsSchema.defaults()){
 const engine=new PlaybackSessionCore(configuration);engine.setConnected(true);engine.flush=()=>{};
 const doc=FunscriptParser.parse('{"actions":[{"at":0,"pos":20},{"at":5000,"pos":20},{"at":20000,"pos":90}]}');
 doc.metadata=new FunscriptMetadata([new FunscriptChapter('Intro',0,10000),new FunscriptChapter('End',10000,20000)],[new FunscriptBookmark('First',0),new FunscriptBookmark('Second',10000)]);
 engine.load(doc);engine.play();engine.tick(40,40);
 const f=setupIndex({engine,actualResources:true}),{page,state}=f;page.axisNames=engine.activeRegistry().axes.map(a=>a.name);page.selectedAxis=0;page.inputNow=()=>40;page.libraryLoaded=true;
 page.sync=()=>{const s=engine.snapshot();page.playing=s.state==='playing';page.positionMs=s.positionMs;page.durationMs=s.durationMs;page.playbackSpeed=s.speed};page.sync();
 return{...f,engine};
}
function configure(page,actions,id='m',key=2017){const c=new KeyboardShortcutConfiguration(),m=new KeyboardShortcutMapping(id);m.keys=[key];m.actions=actions;c.mappings=[m];page.keyboard.setConfiguration(c);page.keyboardConfiguration=c;page.updateKeyboardContext();return c}
function send(page,key=2017){const d=page.keyboard.keyEvent(new ShortcutKeyEvent(key,true),40)[0];assert.ok(d);return page.runShortcutDispatch(d)}
for(const spec of shortcutActionCatalog().filter(s=>s.category==='axis'||s.category==='sync')){
 test('actual touch dispatcher: '+spec.id,async()=>{const{page,engine}=fixture();let arms=0;page.output.arm=()=>{arms++};const action=defaultShortcutAction(spec.id);if(spec.targetAxis)action.targetAxis='L0';await page.touchShortcut(action);assert.ok(!page.inputMessage.startsWith('未执行'),page.inputMessage);assert.notEqual(page.inputMessage,'');assert.equal(arms,0);assert.equal(engine.snapshot().state,'playing');});
}
test('explicit axis, selected target capture at admission, and same-profile disabled/missing targets never fallback',async()=>{
 const{page,engine}=fixture();await page.touchShortcut(new ShortcutAction('Axis::ScriptScale::Set',2,'R0'));assert.equal(engine.getAxisConfiguration('R0').scriptScale,2);assert.equal(engine.getAxisConfiguration('L0').scriptScale,1);
 await page.touchShortcut(new ShortcutAction('Axis::ScriptScale::Set',3,'Q0'));assert.match(page.inputMessage,/不存在或已禁用/);assert.equal(engine.getAxisConfiguration('L0').scriptScale,1);
 const wait=deferred();const original=page.executeShortcutAction.bind(page);page.executeShortcutAction=async(a,axis,d)=>{if(a.id==='App::Library::Show')await wait.promise;return original(a,axis,d)};
 configure(page,[new ShortcutAction('App::Library::Show'),new ShortcutAction('Axis::ScriptScale::Set',1.5)]);const work=send(page);await settle();page.selectedAxis=page.axisNames.indexOf('R0');wait.resolve();await work;assert.equal(engine.getAxisConfiguration('L0').scriptScale,1.5);assert.equal(engine.getAxisConfiguration('R0').scriptScale,2);
 const c=SettingsSchema.defaults();c.devices.find(p=>p.id===c.selectedDeviceId).axes.find(a=>a.name==='R0').enabled=false;const disabled=fixture(c);await disabled.page.touchShortcut(new ShortcutAction('Axis::ScriptScale::Set',3,'R0'));assert.match(disabled.page.inputMessage,/不存在或已禁用/);assert.equal(disabled.engine.getAxisConfiguration('R0').scriptScale,1);
});
test('profile/runtime replacement retires queued target, no late command or feedback writes',async()=>{
 const{page,engine}=fixture(),wait=deferred();const original=page.executeShortcutAction.bind(page);page.executeShortcutAction=async(a,axis,d)=>{if(a.id==='App::Library::Show')await wait.promise;return original(a,axis,d)};
 configure(page,[new ShortcutAction('App::Library::Show'),new ShortcutAction('Axis::ScriptScale::Set',2,'L0')]);const work=send(page);await settle();engine.resetRuntime();wait.resolve();await work;assert.equal(engine.getAxisConfiguration('L0').scriptScale,1);assert.match(page.inputMessage,/设备配置已失效/);
});
test('all-axis lock toggle is independent per-axis and a failed batch commits nothing',async()=>{
 const{page,engine}=fixture();const a=engine.getAxisConfiguration('L0');a.lockScript=true;engine.changeAxisConfiguration('L0',a);await page.touchShortcut(new ShortcutAction('Axis::LockAll::Toggle'));assert.equal(engine.getAxisConfiguration('L0').lockScript,false);assert.equal(engine.getAxisConfiguration('R0').lockScript,true);
 const before=engine.configurationSnapshot(),first=engine.getAxisConfiguration('L0'),bad=engine.getAxisConfiguration('R0');first.scriptScale=2;bad.scriptScale=NaN;assert.throws(()=>engine.changeAxisConfigurations([new AxisConfigurationEntry('L0',first),new AxisConfigurationEntry('R0',bad)]));assert.deepEqual(engine.configurationSnapshot(),before);
});
test('setting then Sync Cancel applies source command ordering without sampling, old authorization closes',async()=>{
 const{page,engine}=fixture();const old=engine.frame();await page.touchShortcut(new ShortcutAction('Axis::Bypass::Script::Set',1,'L0'));assert.equal(engine.frame(),old);assert.equal(engine.dispatchSource(['L0']).authorization,null);
 await page.touchShortcut(new ShortcutAction('Axis::Sync::Cancel',0,'L0'));assert.equal(engine.frame(),old);engine.tick(40,80);assert.equal(engine.frame().axisStates.find(a=>a.axisName==='L0').syncTimeSeconds,0);
});
test('positive auto-skip and large offsets persist unchanged; no nonfinite overflow is accepted',async()=>{
 const{page,engine}=fixture();await page.touchShortcut(new ShortcutAction('Media::AutoSkipToScriptStartOffset::Set',8));assert.equal(engine.playbackConfiguration().autoSkipOffsetSeconds,8);assert.equal(SettingsSchema.decode(SettingsSchema.encode(engine.configurationSnapshot())).configuration.playback.autoSkipOffsetSeconds,8);
 await page.touchShortcut(new ShortcutAction('Media::ScriptOffset::Set',90000));assert.equal(engine.configurationSnapshot().globalOffsetSeconds,90000);
 await page.touchShortcut(new ShortcutAction('Axis::ScriptOffset::Set',80000,'L0'));assert.equal(engine.getAxisConfiguration('L0').offsetSeconds,80000);
 await page.touchShortcut(new ShortcutAction('Media::ScriptOffset::Set',Number.MAX_VALUE));await page.touchShortcut(new ShortcutAction('Media::ScriptOffset::Offset',Number.MAX_VALUE));assert.match(page.inputMessage,/未执行/);assert.equal(engine.configurationSnapshot().globalOffsetSeconds,Number.MAX_VALUE);
});
test('disconnected Internal preferences mutate saved state only and never connect or arm',async()=>{
 const{page,engine}=fixture();let connects=0,arms=0;page.connectInternal=async()=>{connects++};page.output.arm=()=>{arms++};
 for(const id of ['Internal::Shuffle::Set','Internal::Looping::Set','Internal::AutoConnectEnabled::Set','Internal::LoadAdditionalScripts::Set']){await page.touchShortcut(new ShortcutAction(id,1));assert.ok(!page.inputMessage.startsWith('未执行'),page.inputMessage)}
 const p=engine.playbackConfiguration();assert.equal(p.internalLooping,true);assert.equal(p.internalShuffling,false);assert.equal(p.internalAutoConnect,true);assert.equal(p.loadAdditionalScripts,true);assert.equal(page.internalConnected,false);assert.equal(connects,0);assert.equal(arms,0);
});

test('clear/reload/linked-resource commands then Sync Cancel never resync on the next frame',async()=>{
 for(const id of ['Axis::ClearScript','Axis::ReloadScript','Axis::LinkAxis::Set']) {
  const{page,engine}=fixture();const action=new ShortcutAction(id,0,id==='Axis::LinkAxis::Set'?'R0':'L0',0,id==='Axis::LinkAxis::Set'?'L0':'');
  await page.touchShortcut(action);await page.touchShortcut(new ShortcutAction('Axis::SyncAll::Cancel'));const old=engine.frame();engine.tick(40,80);assert.notEqual(engine.frame(),old);for(const axis of engine.frame().axisStates)assert.equal(axis.syncTimeSeconds,0,id+' '+axis.axisName);
 }
});
