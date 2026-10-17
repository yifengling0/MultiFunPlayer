// Execute the actual native adapter with SDK doubles. No device calls are made.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {registerHooks} from 'node:module';
registerHooks({
 resolve(s,c,next){
  if(s==='@kit.ArkUI')return {url:'data:text/javascript,export const window={MaximizePresentation:{ENTER_IMMERSIVE:2,EXIT_IMMERSIVE:1}};',shortCircuit:true};
  if(s==='@kit.BasicServicesKit')return {url:'data:text/javascript,export const deviceInfo={deviceType:"phone"};',shortCircuit:true};
  if(s==='./WindowPresentation')return next('./WindowPresentation.ts',c);
  return next(s,c);
 },
 load(url,c,next){
  if(url.endsWith('NativeWindowPresentation.ets'))return {format:'module-typescript',source:fs.readFileSync(new URL(url),'utf8').replace('PresentationSnapshot, PresentationWindow,','PresentationSnapshot,'),shortCircuit:true};
  return next(url,c);
 }
});
const {deviceInfo}=await import('@kit.BasicServicesKit');
const {NativeWindowPresentation:N}=await import('../entry/src/main/ets/presentation/NativeWindowPresentation.ets');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
class MobileWindow {
 mode=1; immersive=false; layout=false; status=true; navigation=true; orientation=8; landscape=false; calls=[]; listeners=new Map(); behavior=new Map(); failRead=false;
 getWindowStatus(){this.calls.push(['read-mode']);return this.mode;}
 getImmersiveModeEnabledState(){return this.immersive;}
 getPreferredOrientation(){if(this.failRead)throw Error('orientation read unavailable');return this.orientation;}
 getWindowProperties(){return {isLayoutFullScreen:this.layout,isFullScreen:this.layout&&!this.status,windowRect:{width:this.landscape?1600:900,height:this.landscape?900:1600}};}
 async change(key,args,apply){
  this.calls.push([key,...args]);const behavior=this.behavior.get(key);
  if(behavior)await behavior(args,apply);else apply();
 }
 async setPreferredOrientation(v){await this.change('orientation',[v],()=>{this.orientation=v;this.landscape=v===2||v===4;});}
 async setWindowLayoutFullScreen(v){await this.change('layout',[v],()=>{this.layout=v;this.immersive=v;});}
 async setWindowSystemBarEnable(names){await this.change('bars',[names.slice()],()=>{this.status=names.includes('status');this.navigation=names.includes('navigation');});}
 async maximize(p){this.calls.push(['maximize',p]);this.mode=p===2?1:2;this.immersive=p===2;}
 async recover(){this.calls.push(['recover']);this.mode=4;}
 setImmersiveModeEnabledState(v){this.immersive=v;}
 on(name,callback){this.listeners.set(name,callback);}
 changeMode(mode){this.mode=mode;this.listeners.get('windowStatusDidChange')?.(mode);}
 writes(){return this.calls.filter(([key])=>key!=='read-mode');}
}
async function setup(type='phone',h=new MobileWindow()){
 N.destroyStage();deviceInfo.deviceType=type;await N.setForeground(true);await N.attachStage({getMainWindow:async()=>h});
 const seen=[];const owner=N.setListener(r=>seen.push(r));return {h,owner,seen};
}
async function close(owner){await N.releaseOwner(owner);N.destroyStage();}

test('phone and tablet use observed immersive layout/status and actual landscape; exact orientation restores',async()=>{
 for(const type of ['phone','tablet'])for(const orientation of [0,1,3,5,8,11,12]){
  const h=new MobileWindow();h.orientation=orientation;const {owner}=await setup(type,h);
  const entered=await N.requestForOwner(owner,true);
  assert.equal(entered.mode,'native-fullscreen');assert.match(entered.reason,/navigation visibility is not observable/);
  assert.deepEqual(h.writes(),[['orientation',2],['layout',true],['bars',[]]]);
  assert.equal(h.landscape,true);assert.equal(h.status,false);assert.equal(h.navigation,false);
  const restored=await N.requestForOwner(owner,false);assert.equal(restored.mode,'windowed');assert.equal(restored.restorationPending,false);
  assert.equal(h.orientation,orientation);assert.equal(h.layout,false);assert.equal(h.status,true);assert.equal(h.navigation,true);
  assert.deepEqual(h.writes().slice(-3),[['bars',['status','navigation']],['layout',false],['orientation',orientation]]);
  await close(owner);
 }
});
test('known hidden status/layout baseline is preserved, while navigation follows explicit app-visible exit policy',async()=>{
 const h=new MobileWindow();h.layout=true;h.immersive=true;h.status=false;h.navigation=false;h.orientation=4;h.landscape=true;
 const {owner}=await setup('tablet',h);await N.requestForOwner(owner,true);await N.requestForOwner(owner,false);
 assert.equal(h.layout,true);assert.equal(h.status,false);assert.equal(h.orientation,4);assert.equal(h.navigation,true);
 assert.deepEqual(h.writes(),[['orientation',2],['bars',[]],['bars',['navigation']],['orientation',4]]);await close(owner);
});
test('unknown full-screen device and phone/tablet split/floating modes remain conservative without native writes',async()=>{
 for(const [type,mode] of [['unknown',1],['2in1',1],['phone',2],['phone',3],['tablet',4]]){
  const h=new MobileWindow();h.mode=mode;const {owner}=await setup(type,h);
  assert.equal((await N.requestForOwner(owner,true)).mode,'in-window');assert.deepEqual(h.writes(),[]);await close(owner);
 }
});
test('2in1 floating path retains original maximize/recover behavior and never calls mobile setters',async()=>{
 const h=new MobileWindow();h.mode=4;const {owner}=await setup('2in1',h);
 assert.equal((await N.requestForOwner(owner,true)).mode,'native-fullscreen');await N.requestForOwner(owner,false);
 assert.deepEqual(h.writes(),[['maximize',2],['recover']]);assert.equal(h.immersive,false);await close(owner);
});
test('silent no-ops at every entry step cannot claim mobile fullscreen and roll back earlier effects',async()=>{
 for(const key of ['orientation','layout','bars']){
  const {h,owner,seen}=await setup();h.behavior.set(key,async()=>{});
  const result=await N.requestForOwner(owner,true);assert.equal(result.mode,'in-window',key);assert.equal(result.restorationPending,false,key);
  assert.equal(h.orientation,8,key);assert.equal(h.layout,false,key);assert.equal(h.status,true,key);
  assert.ok(seen.every(r=>r.mode!=='native-fullscreen'),key);await close(owner);
 }
});
test('rejected setters with partial native effects roll back orientation/layout/status before fallback',async()=>{
 for(const key of ['orientation','layout','bars']){
  const {h,owner}=await setup();let first=true;h.behavior.set(key,async(_args,apply)=>{apply();if(first){first=false;throw Error('partially applied');}});
  const result=await N.requestForOwner(owner,true);assert.equal(result.mode,'in-window',key);assert.equal(result.restorationPending,false,key);
  assert.equal(h.orientation,8,key);assert.equal(h.layout,false,key);assert.equal(h.status,true,key);assert.equal(h.navigation,true,key);await close(owner);
 }
});
test('landscape preference alone does not prove rendered landscape geometry',async()=>{
 const {h,owner}=await setup();h.behavior.set('orientation',async([v])=>{h.orientation=v;});
 assert.equal((await N.requestForOwner(owner,true)).mode,'in-window');assert.equal(h.orientation,8);assert.equal(h.layout,false);assert.equal(h.status,true);await close(owner);
});
test('rapid repeated entry requests execute one mobile transition',async()=>{
 const {h,owner}=await setup();await Promise.all([N.requestForOwner(owner,true),N.requestForOwner(owner,true),N.requestForOwner(owner,true)]);
 assert.deepEqual(h.writes(),[['orientation',2],['layout',true],['bars',[]]]);await close(owner);
});
test('exit/background during each pending setter stops later entry steps and restores completed effects',async()=>{
 for(const key of ['orientation','layout','bars'])for(const background of [false,true]){
  const {h,owner,seen}=await setup(),gate=deferred(),started=deferred();let first=true;
  h.behavior.set(key,async(_args,apply)=>{if(first){first=false;started.resolve();await gate.promise;}apply();});
  const entering=N.requestForOwner(owner,true);await started.promise;
  const exiting=background?N.setForeground(false):N.requestForOwner(owner,false);gate.resolve();await Promise.all([entering,exiting]);
  assert.equal(h.orientation,8,key);assert.equal(h.layout,false,key);assert.equal(h.status,true,key);assert.equal(h.navigation,true,key);
  assert.ok(seen.every(r=>r.mode!=='native-fullscreen'),key);
  if(key==='orientation')assert.ok(!h.writes().some(([k])=>k==='layout'||k==='bars'));
  if(key==='layout')assert.ok(!h.writes().some(([k])=>k==='bars'));
  const calls=h.writes().length;await N.setForeground(true);assert.equal(h.writes().length,calls);await close(owner);
 }
});
test('destroyed mobile stage and old callbacks never call dead handle or change replacement state',async()=>{
 for(const key of ['orientation','layout','bars']){
  const {h,owner}=await setup(),gate=deferred(),started=deferred();h.behavior.set(key,async(_args,apply)=>{started.resolve();await gate.promise;apply();});
  const entering=N.requestForOwner(owner,true);await started.promise;const oldCallback=h.listeners.get('windowStatusDidChange');N.destroyStage();const calls=h.calls.length;
  const replacement=await setup('tablet');await N.requestForOwner(replacement.owner,true);gate.resolve();await entering;oldCallback(4);
  await N.requestForOwner(owner,false);await N.releaseOwner(owner);assert.equal(h.calls.length,calls);
  assert.equal(replacement.h.status,false);assert.equal(replacement.seen.at(-1).mode,'native-fullscreen');await close(replacement.owner);
 }
});
test('replacement owner exit supersedes an older pending mobile entry and late old owner cleanup',async()=>{
 const {h,owner,seen}=await setup(),gate=deferred(),started=deferred();let first=true;
 h.behavior.set('layout',async(_args,apply)=>{if(first){first=false;started.resolve();await gate.promise;}apply();});
 const entering=N.requestForOwner(owner,true);await started.promise;const seenB=[];const ownerB=N.setListener(r=>seenB.push(r));const count=seen.length;
 const exiting=N.requestForOwner(ownerB,false);await N.releaseOwner(owner);gate.resolve();await Promise.all([entering,exiting]);
 assert.equal(h.orientation,8);assert.equal(h.layout,false);assert.equal(seen.length,count);assert.ok(seenB.every(r=>r.mode!=='native-fullscreen'));
 await N.requestForOwner(owner,true);assert.equal(h.layout,false);await N.requestForOwner(ownerB,true);assert.equal(h.status,false);await close(ownerB);
});
test('silent no-op exit setters retain retry ownership while restoring other independent state',async()=>{
 for(const key of ['orientation','layout','bars']){
  const {h,owner}=await setup();await N.requestForOwner(owner,true);h.behavior.set(key,async()=>{});
  const pending=await N.requestForOwner(owner,false);assert.equal(pending.restorationPending,true,key);assert.match(pending.reason,/not confirmed/,key);
  if(key!=='orientation')assert.equal(h.orientation,8,key);if(key!=='layout')assert.equal(h.layout,false,key);
  h.behavior.delete(key);const done=await N.requestForOwner(owner,false);assert.equal(done.restorationPending,false,key);
  assert.equal(h.orientation,8);assert.equal(h.layout,false);assert.equal(h.status,true);assert.equal(h.navigation,true);await close(owner);
 }
});
test('rejected bar restoration retains pending policy even if the setter partially showed status',async()=>{
 const {h,owner}=await setup();await N.requestForOwner(owner,true);h.behavior.set('bars',async(_args,apply)=>{apply();throw Error('partial restore');});
 const result=await N.requestForOwner(owner,false);assert.equal(result.restorationPending,true);assert.equal(h.orientation,8);assert.equal(h.layout,false);
 h.behavior.delete('bars');assert.equal((await N.requestForOwner(owner,false)).restorationPending,false);await close(owner);
});
test('external orientation change is preserved while app-owned bars and layout still restore',async()=>{
 const {h,owner}=await setup();await N.requestForOwner(owner,true);h.orientation=11;
 await N.requestForOwner(owner,false);assert.equal(h.orientation,11);assert.equal(h.status,true);assert.equal(h.layout,false);await close(owner);
});
test('external orientation change during bar restoration is not overwritten by the next restore step',async()=>{
 const {h,owner}=await setup();await N.requestForOwner(owner,true);const gate=deferred(),started=deferred();
 h.behavior.set('bars',async(_args,apply)=>{started.resolve();await gate.promise;apply();});const exiting=N.requestForOwner(owner,false);await started.promise;h.orientation=11;gate.resolve();await exiting;
 assert.equal(h.orientation,11);assert.equal(h.status,true);assert.equal(h.layout,false);await close(owner);
});
test('external mode event during pending entry relinquishes ownership and stops remaining mobile calls',async()=>{
 const {h,owner}=await setup(),gate=deferred(),started=deferred();h.behavior.set('orientation',async(_args,apply)=>{started.resolve();await gate.promise;apply();});
 const entering=N.requestForOwner(owner,true);await started.promise;h.changeMode(3);const count=h.calls.length;gate.resolve();await entering;
 assert.equal(h.calls.length,count);assert.equal(h.mode,3);assert.ok(!h.writes().some(([key])=>key==='layout'||key==='bars'));await close(owner);
});
test('unavailable baseline orientation getter causes no mutation',async()=>{
 const {h,owner}=await setup();h.failRead=true;const result=await N.requestForOwner(owner,true);assert.equal(result.mode,'in-window');assert.equal(result.restorationPending,false);assert.deepEqual(h.writes(),[]);await close(owner);
});
test('post-setter read failure stays pending and an explicit exit restores when reads recover',async()=>{
 const {h,owner}=await setup();h.behavior.set('orientation',async(_args,apply)=>{apply();h.failRead=true;});
 const result=await N.requestForOwner(owner,true);assert.equal(result.restorationPending,true);h.failRead=false;h.behavior.delete('orientation');
 const done=await N.requestForOwner(owner,false);assert.equal(done.restorationPending,false);assert.equal(h.orientation,8);await close(owner);
});

test('accepted orientation waits for delayed real window resize rather than immediately rolling back',async()=>{
 const {h,owner}=await setup();h.behavior.set('orientation',async([v])=>{h.orientation=v;if(v===2)setTimeout(()=>{h.landscape=true;h.listeners.get('windowSizeChange')?.({width:1600,height:900});},35);else h.landscape=false;});
 h.off=(name,callback)=>{if(h.listeners.get(name)===callback)h.listeners.delete(name);};
 const result=await N.requestForOwner(owner,true);assert.equal(result.mode,'native-fullscreen');assert.equal(h.landscape,true);
 assert.equal(h.listeners.has('windowSizeChange'),false);await close(owner);
});
test('background cancels delayed geometry verification and does not publish fullscreen',async()=>{
 const {h,owner,seen}=await setup();h.behavior.set('orientation',async([v])=>{h.orientation=v;});const began=deferred();
 const on=h.on.bind(h);h.on=(name,callback)=>{on(name,callback);if(name==='windowSizeChange')began.resolve();};
 h.off=(name,callback)=>{if(h.listeners.get(name)===callback)h.listeners.delete(name);};
 const entering=N.requestForOwner(owner,true);await began.promise;await N.setForeground(false);await entering;
 assert.equal(h.orientation,8);assert.equal(h.status,true);assert.equal(h.layout,false);assert.ok(seen.every(r=>r.mode!=='native-fullscreen'));
 assert.equal(h.listeners.has('windowSizeChange'),false);await close(owner);
});
test('destroyed stage during geometry settle never reads or removes listeners from its dead handle',async()=>{
 const {h,owner}=await setup();h.behavior.set('orientation',async([v])=>{h.orientation=v;});const began=deferred();
 const on=h.on.bind(h);h.on=(name,callback)=>{on(name,callback);if(name==='windowSizeChange')began.resolve();};
 let forbidden=0;h.off=()=>{forbidden++;};const get=h.getWindowProperties.bind(h);let dead=false;h.getWindowProperties=()=>{if(dead)forbidden++;return get();};
 const entering=N.requestForOwner(owner,true);await began.promise;const size=h.listeners.get('windowSizeChange');N.destroyStage();dead=true;
 const replacement=await setup();await N.requestForOwner(replacement.owner,true);size({width:1600,height:900});await entering;
 assert.equal(forbidden,0);assert.equal(replacement.seen.at(-1).mode,'native-fullscreen');await close(replacement.owner);
});

test('external rotation while layout entry is pending is preserved on partial rollback',async()=>{
 const {h,owner}=await setup(),gate=deferred(),started=deferred();let first=true;
 h.behavior.set('layout',async(_args,apply)=>{if(first){first=false;started.resolve();await gate.promise;}apply();});
 const entering=N.requestForOwner(owner,true);await started.promise;h.orientation=11;gate.resolve();
 assert.equal((await entering).mode,'in-window');assert.equal(h.orientation,11);assert.equal(h.layout,false);assert.equal(h.status,true);await close(owner);
});
test('external rotation while hiding bars is pending is preserved on partial rollback',async()=>{
 const {h,owner}=await setup(),gate=deferred(),started=deferred();let first=true;
 h.behavior.set('bars',async(_args,apply)=>{if(first){first=false;started.resolve();await gate.promise;}apply();});
 const entering=N.requestForOwner(owner,true);await started.promise;h.orientation=11;gate.resolve();
 assert.equal((await entering).mode,'in-window');assert.equal(h.orientation,11);assert.equal(h.layout,false);assert.equal(h.status,true);await close(owner);
});
test('unreadable partial bar effect never claims fullscreen and retains normal exit policy for retry',async()=>{
 const {h,owner}=await setup();h.behavior.set('bars',async()=>{h.navigation=false;h.failRead=true;});
 const result=await N.requestForOwner(owner,true);assert.equal(result.mode,'in-window');assert.equal(result.restorationPending,true);
 h.failRead=false;h.behavior.delete('bars');await N.requestForOwner(owner,false);assert.equal(h.status,true);assert.equal(h.navigation,true);assert.equal(h.layout,false);assert.equal(h.orientation,8);await close(owner);
});
test('read failure after each exit mutation can be retried without losing independent pending bar policy',async()=>{
 for(const key of ['bars','layout','orientation']){
  const {h,owner}=await setup();await N.requestForOwner(owner,true);let first=true;
  h.behavior.set(key,async(_args,apply)=>{apply();if(first){first=false;h.failRead=true;}});
  assert.equal((await N.requestForOwner(owner,false)).restorationPending,true,key);h.failRead=false;h.behavior.delete(key);
  const done=await N.requestForOwner(owner,false);assert.equal(done.restorationPending,false,key);
  assert.equal(h.status,true);assert.equal(h.navigation,true);assert.equal(h.layout,false);assert.equal(h.orientation,8);await close(owner);
 }
});

test('external rotation during asynchronous geometry settle is never restored over',async()=>{
 const {h,owner}=await setup();h.behavior.set('orientation',async([v])=>{h.orientation=v;});const began=deferred();
 const on=h.on.bind(h);h.on=(name,callback)=>{on(name,callback);if(name==='windowSizeChange')began.resolve();};
 const entering=N.requestForOwner(owner,true);await began.promise;h.orientation=11;h.landscape=true;h.listeners.get('windowSizeChange')?.({width:1600,height:900});
 assert.equal((await entering).mode,'in-window');assert.equal(h.orientation,11);assert.equal(h.layout,false);assert.equal(h.status,true);await close(owner);
});
test('resize delivered during registration completes cleanly without leaking timers',async()=>{
 const {h,owner}=await setup();h.behavior.set('orientation',async([v])=>{h.orientation=v;});
 const on=h.on.bind(h);h.on=(name,callback)=>{on(name,callback);if(name==='windowSizeChange'){h.landscape=true;callback({width:1600,height:900});}};
 assert.equal((await N.requestForOwner(owner,true)).mode,'native-fullscreen');await close(owner);
});
test('unobserved native mode change during an entry setter does not restore settings over the new mode',async()=>{
 const {h,owner}=await setup();h.behavior.set('orientation',async(_args,apply)=>{apply();h.mode=3;});
 assert.equal((await N.requestForOwner(owner,true)).mode,'in-window');assert.equal(h.mode,3);assert.equal(h.orientation,2);
 assert.deepEqual(h.writes(),[['orientation',2]]);await close(owner);
});

test('rotation restoring bars settles before layout and hide, so native fullscreen stays confirmed',async()=>{
 const {h,owner}=await setup();h.behavior.set('orientation',async([v])=>{h.orientation=v;if(v===2){setTimeout(()=>{h.landscape=true;h.status=true;h.navigation=true;h.listeners.get('windowSizeChange')?.({width:1600,height:900});},30);}else h.landscape=false;});
 const result=await N.requestForOwner(owner,true);assert.equal(result.mode,'native-fullscreen');assert.equal(h.status,false);assert.equal(h.navigation,false);await close(owner);
});
test('geometry timeout never mutates layout or bars after a mere orientation preference',async()=>{
 const {h,owner}=await setup();h.behavior.set('orientation',async([v])=>{h.orientation=v;});
 const result=await N.requestForOwner(owner,true);assert.equal(result.mode,'in-window');assert.ok(!h.writes().some(([k])=>k==='layout'||k==='bars'));assert.equal(h.orientation,8);await close(owner);
});
