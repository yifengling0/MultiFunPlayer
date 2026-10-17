import test from 'node:test';import assert from 'node:assert/strict';import {registerHooks} from 'node:module';import {readFileSync} from 'node:fs';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);}});
const {setupIndex}=await import('./index-controller-helpers.mjs');const {PlaybackSessionCore}=await import('../entry/src/main/ets/core/PlaybackSessionCore.ts');const {SettingsSchema}=await import('../entry/src/main/ets/settings/SettingsSchema.ts');const {defaultShortcutAction,ShortcutPoint}=await import('../entry/src/main/ets/input/ShortcutConfiguration.ts');const {FunscriptParser}=await import('../entry/src/main/ets/core/Funscript.ts');
function setup(){const c=SettingsSchema.defaults();for(const k of Object.keys(c.sync))if(k.startsWith('sync'))c.sync[k]=false;for(const d of c.axisSettingsByDevice)for(const a of d.axes)Object.assign(a.settings,{selectedMotionProvider:null,autoHomeEnabled:false});const engine=new PlaybackSessionCore(c);engine.flush=()=>{};engine.setConnected(true);const s=setupIndex({engine,actualResources:true});return {...s,engine};}
const step=s=>{s.state.now=(s.state.now??0)+40;s.engine.tick(40,s.state.now);};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};

test('actual page explicitly starts paused manual preview, touch Value changes never start/Arm, Stop revokes',async()=>{
 const s=setup(),a=defaultShortcutAction('Axis::Value::Set');a.value=.8;a.secondaryValue=1;await s.page.executeShortcutAction(a,'L0');step(s);assert.equal(s.engine.dispatchSource(['L0']).authorization,null);await s.page.startManualPreview();assert.equal(s.engine.isManualPreviewActive(),true);step(s);assert.equal(s.engine.dispatchSource(['L0']).authorization,null);await s.page.executeShortcutAction(a,'L0');step(s);assert.deepEqual(s.engine.dispatchSource(['L0']).authorization.intents,['pausedManual']);assert.equal(s.page.output.status(),null);s.page.stop();s.engine.pause();step(s);assert.equal(s.engine.isManualPreviewActive(),false);assert.equal(s.engine.dispatchSource(['L0']).authorization,null);
});
for(const [name,cancel] of [['Stop',s=>s.page.stop()],['background',s=>{s.page.foreground=false;s.engine.setForeground(false);s.page.cancelRuntimeControl();}],['output disconnect',s=>s.page.disconnectOutput()],['new source',s=>s.page.cancelRuntimeControl()],['view destroy',s=>{s.page.viewActive=false;s.page.cancelRuntimeControl();}]])test('late native close cannot finish manual startup after '+name,async()=>{
 const s=setup(),closed=deferred();s.page.video.release=()=>closed.promise;const pending=s.page.startManualPreview();await settle();assert.equal(s.page.runtimeBusy,true);await cancel(s);closed.resolve();await pending;assert.equal(s.engine.isManualPreviewActive(),false);assert.equal(s.engine.dispatchSource(['L0']).authorization,null);assert.equal(s.engine.snapshot().state,'stopped');
});

test('read-only, wrong axis configuration and failed media close do not partially start manual preview',async()=>{
 const s=setup();s.page.settingsReadOnly=true;await s.page.startManualPreview();assert.equal(s.engine.isManualPreviewActive(),false);assert.equal(s.calls.some(c=>c[0]==='release'),false);s.page.settingsReadOnly=false;
 for(const axis of s.engine.activeRegistry().axes){const a=s.engine.getAxisConfiguration(axis.name);a.bypassTransition=true;s.engine.changeAxisConfiguration(axis.name,a);}await s.page.startManualPreview();assert.equal(s.engine.isManualPreviewActive(),false);const a=s.engine.getAxisConfiguration('L0');a.bypassTransition=false;s.engine.changeAxisConfiguration('L0',a);s.state.cleanupFailure='unconfirmed media close';await s.page.startManualPreview();assert.equal(s.engine.isManualPreviewActive(),false);assert.match(s.page.runtimeMessage,/unconfirmed/);
});

test('actual points shortcut routes ordered Custom command and Smart collection without generic reset sync',async()=>{
 const s=setup(),custom=defaultShortcutAction('MotionProvider::Custom Curve::Points::Set');custom.value=2;custom.text='makima';custom.points=[new ShortcutPoint(.8,.1),new ShortcutPoint(.1,.9),new ShortcutPoint(.8,.2)];let calls=[];const set=s.engine.setCustomCurvePoints.bind(s.engine);s.engine.setCustomCurvePoints=(...args)=>{calls.push(args);return set(...args);};await s.page.executeShortcutAction(custom,'L0');assert.equal(calls.length,1);assert.equal(s.engine.getMotionConfiguration('L0','Custom Curve').durationSeconds,2);assert.deepEqual(s.engine.getMotionConfiguration('L0','Custom Curve').points.map(p=>[p.x,p.y]),[[.8,.1],[.1,.9],[.8,.2]]);
 const smart=defaultShortcutAction('Axis::SmartLimitPoints::Set');smart.points=[new ShortcutPoint(0,10),new ShortcutPoint(100,90)];const before=s.engine.frame();await s.page.executeShortcutAction(smart,'L0');assert.equal(s.engine.frame(),before);assert.deepEqual(s.engine.getAxisConfiguration('L0').smartLimitPoints.map(p=>[p.x,p.y]),[[0,10],[100,90]]);assert.equal(s.engine.isManualPreviewActive(),false);
 for(const action of [custom,smart,defaultShortcutAction('Axis::Value::Set')]){action.targetAxis='V0';await assert.rejects(s.page.executeShortcutAction(action,'L0'),/禁用/);}
});

test('actual SkipGap command uses original all-axis candidate and existing seek transaction only',async()=>{
 const s=setup();s.engine.load(FunscriptParser.parse(JSON.stringify({actions:[{at:0,pos:20},{at:10000,pos:20},{at:20000,pos:80}]})));s.engine.play();step(s);const a=defaultShortcutAction('Script::SkipGap');a.targetAxis='R0';const calls=[];s.page.seekTransport=(position,preserve)=>calls.push([position,preserve]);const result=await s.page.executeShortcutAction(a,'L0');assert.deepEqual(calls,[[10000,true]]);assert.match(result,/全部绑定轴/);s.page.runtimeBusy=true;await assert.rejects(s.page.executeShortcutAction(a,'L0'),/未就绪/);
});

test('manual start/status touch controls remain full-width52 and paused-waiting reaches controlled output panel',()=>{
 const source=readFileSync(new URL('../entry/src/main/ets/pages/Index.ets',import.meta.url),'utf8');assert.match(source,/关闭媒体和输出连接，启动手动预览'\)\.flatButton\(\)\.constraintSize\(\{ minHeight: UiStyle.control \}\)\.width\('100%'\)/);assert.match(source,/dispatchSuspended: this.outputSuspended/);assert.match(source,/Button\('停止全部输出'\)[^\n]*\.onClick\(\(\) => this.stop\(\)\)/);
});

test('readonly or recovery arriving during native close cannot grant delayed manual admission',async()=>{
 for(const field of ['settingsReadOnly','recoveryRequired']){const s=setup(),closed=deferred();s.page.video.release=()=>closed.promise;const pending=s.page.startManualPreview();await settle();s.page[field]=true;closed.resolve();await pending;assert.equal(s.engine.isManualPreviewActive(),false);assert.equal(s.engine.snapshot().state,'stopped');assert.match(s.page.runtimeMessage,/只读/);}
});
