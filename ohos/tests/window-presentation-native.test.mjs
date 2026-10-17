// Execute the real .ets boundary under a tiny SDK import stub. No device APIs run.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
registerHooks({
  resolve(s,c,next) {
    if(s==='@kit.BasicServicesKit') return {url:'data:text/javascript,export const deviceInfo={deviceType:"2in1"};',shortCircuit:true};
    if(s==='@kit.ArkUI') return {url:'data:text/javascript,export const window={MaximizePresentation:{ENTER_IMMERSIVE:2,EXIT_IMMERSIVE:1}};',shortCircuit:true};
    if(s==='./WindowPresentation') return next('./WindowPresentation.ts',c);
    return next(s,c);
  },
  load(url,c,next) {
    if(url.endsWith('.ets')) return {format:'module-typescript',source:fs.readFileSync(new URL(url),'utf8').replace('PresentationSnapshot, PresentationWindow,', 'PresentationSnapshot,'),shortCircuit:true};
    return next(url,c);
  }
});
const {NativeWindowPresentation:N}=await import('../entry/src/main/ets/presentation/NativeWindowPresentation.ets');
class Handle {
  mode=4; immersive=false; calls=[]; callback;
  getWindowStatus(){this.calls.push('status');return this.mode;}
  getImmersiveModeEnabledState(){return this.immersive;}
  async maximize(p){this.calls.push('maximize:'+p);if(this.wait)await this.wait;this.mode=p===2?1:2;this.immersive=p===2;}
  async recover(){this.calls.push('recover');this.mode=4;}
  setImmersiveModeEnabledState(v){this.immersive=v;}
  on(event,callback){this.calls.push(event);this.callback=callback;}
}
const stage=h=>({getMainWindow:async()=>h});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('stale getMainWindow completion after stage destruction is discarded',async()=>{
 const d=deferred(),h=new Handle();const attaching=N.attachStage({getMainWindow:()=>d.promise});N.destroyStage();d.resolve(h);await attaching;assert.deepEqual(h.calls,[]);
});
test('real boundary replays fullscreen request made during main-window acquisition',async()=>{
 const d=deferred(),h=new Handle();const attaching=N.attachStage({getMainWindow:()=>d.promise});await N.request(true);d.resolve(h);await attaching;assert.equal(h.mode,1);await N.request(false);assert.equal(h.mode,4);N.destroyStage();
});
test('replacement stage is not blocked by unresolved old native transition',async()=>{
 const h=new Handle(),d=deferred();await N.attachStage(stage(h));h.wait=d.promise;const entering=N.request(true);await Promise.resolve();const count=h.calls.length;N.destroyStage();const replacement=new Handle();await N.attachStage(stage(replacement));await N.request(true);assert.equal(replacement.mode,1);d.resolve();await entering;assert.equal(h.calls.length,count);await N.request(false);N.destroyStage();
});
test('old native status event cannot alter replacement ownership',async()=>{
 const old=new Handle();await N.attachStage(stage(old));const callback=old.callback;N.destroyStage();const h=new Handle();await N.attachStage(stage(h));await N.request(true);callback(4);await N.request(false);assert.equal(h.mode,4);assert.ok(h.calls.includes('recover'));N.destroyStage();
});
test('background exits native mode; foreground stays windowed',async()=>{
 const h=new Handle();await N.attachStage(stage(h));await N.request(true);await N.setForeground(false);assert.equal(h.mode,4);await N.setForeground(true);assert.equal(h.mode,4);N.destroyStage();
});
test('native no-op recovery exposes observed fullscreen and retry status through the boundary',async()=>{
 const h=new Handle();await N.attachStage(stage(h));await N.request(true);
 h.recover=async()=>{h.calls.push('recover-noop');};
 let latest;N.setListener(result=>{latest=result;});const result=await N.request(false);
 assert.equal(result.mode,'native-fullscreen');assert.equal(result.restorationPending,true);assert.equal(latest,result);
 h.recover=async()=>{h.calls.push('recover-retry');h.mode=4;};await N.request(false);
 assert.equal(h.mode,4);assert.equal(h.immersive,false);assert.equal(latest.restorationPending,false);
 N.setListener(undefined);N.destroyStage();
});
test('native external mode observation removes pending restoration without touching newer settings',async()=>{
 const h=new Handle();await N.attachStage(stage(h));await N.request(true);
 h.recover=async()=>{h.calls.push('recover-failed');throw Error('unavailable');};await N.request(false);
 let latest;N.setListener(result=>{latest=result;});assert.equal(latest.restorationPending,true);
 h.mode=2;h.callback(2);assert.equal(latest.restorationPending,false);
 await N.request(false);assert.equal(h.calls.filter(call=>call==='recover-failed').length,1);assert.equal(h.mode,2);
 N.setListener(undefined);N.destroyStage();
});
test('same-stage page ownership prevents an old page from exiting or detaching its replacement',async()=>{
 const h=new Handle();await N.attachStage(stage(h));const seenA=[],seenB=[];
 const ownerA=N.setListener(result=>{seenA.push(result);});await N.requestForOwner(ownerA,true);
 const ownerB=N.setListener(result=>{seenB.push(result);});assert.ok(Number.isInteger(ownerA)&&ownerB>ownerA);
 await N.requestForOwner(ownerB,true);const oldCount=seenA.length,currentCount=seenB.length,calls=h.calls.length;
 const obsoleteExit=await N.requestForOwner(ownerA,false);const obsoleteRelease=await N.releaseOwner(ownerA);
 assert.equal(h.mode,1);assert.equal(h.calls.length,calls);assert.equal(seenA.length,oldCount);assert.equal(seenB.length,currentCount);
 assert.equal(obsoleteExit,seenB.at(-1));assert.equal(obsoleteRelease,seenB.at(-1));
 await N.requestForOwner(ownerB,false);assert.equal(h.mode,4);assert.ok(seenB.length>currentCount);assert.equal(seenA.length,oldCount);
 await N.releaseOwner(ownerB);N.destroyStage();
});
test('current owner release exits once and revokes all later owner requests and callbacks',async()=>{
 const h=new Handle();await N.attachStage(stage(h));const seen=[];
 const owner=N.setListener(result=>{seen.push(result);});await N.requestForOwner(owner,true);const callbackCount=seen.length;
 const result=await N.releaseOwner(owner);assert.equal(result.mode,'windowed');assert.equal(h.mode,4);assert.equal(seen.length,callbackCount);
 const calls=h.calls.length;await N.releaseOwner(owner);await N.requestForOwner(owner,true);await N.requestForOwner(owner,false);
 assert.equal(h.calls.length,calls);assert.equal(h.mode,4);assert.equal(seen.length,callbackCount);N.destroyStage();
});
test('destroyed-stage page tokens and late transitions cannot control or notify the replacement stage',async()=>{
 const old=new Handle(),d=deferred();await N.attachStage(stage(old));const oldSeen=[];
 const ownerA=N.setListener(result=>{oldSeen.push(result);});old.wait=d.promise;const entering=N.requestForOwner(ownerA,true);await Promise.resolve();
 N.destroyStage();const oldCount=oldSeen.length;const h=new Handle();await N.attachStage(stage(h));const seen=[];
 const ownerB=N.setListener(result=>{seen.push(result);});assert.ok(ownerB>ownerA);await N.requestForOwner(ownerB,true);
 const calls=h.calls.length;await N.requestForOwner(ownerA,false);await N.releaseOwner(ownerA);await N.requestForOwner(ownerA,true);
 assert.equal(h.calls.length,calls);assert.equal(h.mode,1);
 d.resolve();await entering;assert.equal(oldSeen.length,oldCount);assert.equal(h.mode,1);assert.equal(seen.at(-1).mode,'native-fullscreen');
 await N.releaseOwner(ownerB);assert.equal(h.mode,4);N.destroyStage();
});
test('background while owner enter is pending never publishes fullscreen or restores enter intent on foreground',async()=>{
 const h=new Handle(),d=deferred();await N.attachStage(stage(h));const seen=[];
 const owner=N.setListener(result=>{seen.push(result);});h.wait=d.promise;const entering=N.requestForOwner(owner,true);await Promise.resolve();
 const background=N.setForeground(false);const lateEnter=N.requestForOwner(owner,true);d.resolve();
 await Promise.all([entering,background,lateEnter]);assert.equal(h.mode,4);assert.ok(seen.every(result=>result.mode!=='native-fullscreen'));
 await N.setForeground(true);assert.equal(h.mode,4);assert.equal(h.calls.filter(call=>call==='maximize:2').length,1);
 await N.requestForOwner(owner,true);assert.equal(h.mode,1);await N.releaseOwner(owner);N.destroyStage();
});
test('owner acquired during getMainWindow remains valid when that same stage finishes attaching',async()=>{
 const d=deferred(),h=new Handle();const attaching=N.attachStage({getMainWindow:()=>d.promise});const seen=[];
 const owner=N.setListener(result=>{seen.push(result);});await N.requestForOwner(owner,true);d.resolve(h);await attaching;
 assert.equal(h.mode,1);assert.equal(seen.at(-1).mode,'native-fullscreen');await N.releaseOwner(owner);assert.equal(h.mode,4);N.destroyStage();
});
test('same-stage replacement exit supersedes an older pending enter without old-page notifications',async()=>{
 const h=new Handle(),d=deferred();await N.attachStage(stage(h));const seenA=[],seenB=[];
 const ownerA=N.setListener(result=>{seenA.push(result);});h.wait=d.promise;const entering=N.requestForOwner(ownerA,true);await Promise.resolve();
 const ownerB=N.setListener(result=>{seenB.push(result);});const oldCount=seenA.length;const exiting=N.requestForOwner(ownerB,false);
 await N.releaseOwner(ownerA);await N.requestForOwner(ownerA,true);d.resolve();await Promise.all([entering,exiting]);
 assert.equal(h.mode,4);assert.equal(seenA.length,oldCount);assert.ok(seenB.every(result=>result.mode!=='native-fullscreen'));
 const calls=h.calls.length;await N.requestForOwner(ownerA,true);await N.requestForOwner(ownerA,false);assert.equal(h.calls.length,calls);
 await N.requestForOwner(ownerB,true);assert.equal(h.mode,1);await N.releaseOwner(ownerB);N.destroyStage();
});
test('replacement owner intent survives an older release already waiting for a native exit',async()=>{
 const h=new Handle(),d=deferred(),started=deferred();await N.attachStage(stage(h));const seenA=[],seenB=[];
 const ownerA=N.setListener(result=>{seenA.push(result);});await N.requestForOwner(ownerA,true);
 h.recover=async()=>{h.calls.push('recover');started.resolve();await d.promise;h.mode=4;};
 const releasing=N.releaseOwner(ownerA);await started.promise;const oldCount=seenA.length;
 const ownerB=N.setListener(result=>{seenB.push(result);});const entering=N.requestForOwner(ownerB,true);d.resolve();await Promise.all([releasing,entering]);
 assert.equal(h.mode,1);assert.equal(seenB.at(-1).mode,'native-fullscreen');assert.equal(seenA.length,oldCount);
 await N.releaseOwner(ownerB);assert.equal(h.mode,4);N.destroyStage();
});
test('destroyed owner requests return invalidated windowed state without touching a dead handle',async()=>{
 const h=new Handle();await N.attachStage(stage(h));const seen=[];
 const owner=N.setListener(result=>{seen.push(result);});await N.requestForOwner(owner,true);N.destroyStage();
 const calls=h.calls.length,count=seen.length;const result=await N.requestForOwner(owner,true);await N.releaseOwner(owner);
 assert.equal(result.mode,'windowed');assert.equal(result.restorationPending,false);assert.equal(h.calls.length,calls);assert.equal(seen.length,count);
});
