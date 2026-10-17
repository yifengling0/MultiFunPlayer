import test from 'node:test';
import assert from 'node:assert/strict';
import { WindowPresentationController, PresentationSnapshot } from '../entry/src/main/ets/presentation/WindowPresentation.ts';
class Window {
  constructor(mode=4, immersive=false) { this.mode=mode; this.immersive=immersive; this.calls=[]; }
  snapshot() { this.calls.push('read'); return new PresentationSnapshot(this.mode,this.immersive); }
  async enter() { this.calls.push('enter'); if(this.gate) await this.gate; if(this.fail) throw Error('801'); if(!this.noop){this.mode=1;this.immersive=true;} }
  async recover() { this.calls.push('recover'); if(this.restoreFail)throw Error('failure');this.mode=4; }
  async maximizeWindowed() { this.calls.push('maximize-windowed');this.mode=2;this.immersive=false; }
  setImmersive(value) { this.calls.push('immersive:'+value);this.immersive=value; }
}
async function setup(mode=4, immersive=false) { const c=new WindowPresentationController(),w=new Window(mode,immersive);await c.attach(w);return {c,w}; }
test('floating native fullscreen restores floating and original immersive flag',async()=>{const {c,w}=await setup();assert.equal((await c.request(true)).mode,'native-fullscreen');await c.request(false);assert.equal(w.mode,4);assert.equal(w.immersive,false);assert.equal(w.calls.filter(c=>c==='recover').length,1);});
test('maximized baseline restores maximize, never floating',async()=>{const {c,w}=await setup(2);await c.request(true);await c.request(false);assert.equal(w.mode,2);assert.equal(w.immersive,false);assert.ok(!w.calls.includes('recover'));});
test('preserves unusual maximized baseline immersive preference',async()=>{const {c,w}=await setup(2,true);await c.request(true);await c.request(false);assert.equal(w.immersive,true);});
test('mobile fullscreen, split, minimized and unknown modes remain truthful fallback',async()=>{for(const mode of [0,1,3,5]){const {c,w}=await setup(mode);assert.equal((await c.request(true)).mode,'in-window');assert.ok(!w.calls.includes('enter'));await c.request(false);assert.equal(w.mode,mode);}});
test('unsupported and silent no-op native APIs do not claim fullscreen',async()=>{for(const key of ['fail','noop']){const {c,w}=await setup();w[key]=true;assert.equal((await c.request(true)).mode,'in-window');await c.request(false);assert.ok(!w.calls.includes('recover'));}});
test('exit while entering restores after in-flight operation completes',async()=>{const {c,w}=await setup();let release;w.gate=new Promise(r=>release=r);const enter=c.request(true);await Promise.resolve();const leave=c.request(false);release();await Promise.all([enter,leave]);assert.equal(w.mode,4);assert.equal(w.immersive,false);});
test('background during entering restores; foreground does not auto-enter',async()=>{const {c,w}=await setup();let release;w.gate=new Promise(r=>release=r);const enter=c.request(true);await Promise.resolve();const bg=c.setForeground(false);release();await Promise.all([enter,bg]);await c.setForeground(true);assert.equal(w.mode,4);assert.equal(w.calls.filter(x=>x==='enter').length,1);});
test('destroyed in-flight handle is never called again',async()=>{const {c,w}=await setup();let release;w.gate=new Promise(r=>release=r);const enter=c.request(true);await Promise.resolve();c.invalidate();const count=w.calls.length;release();await enter;await c.request(false);assert.equal(w.calls.length,count);});
test('newer stage survives completion of old stage operation',async()=>{const {c,w}=await setup();let release;w.gate=new Promise(r=>release=r);const enter=c.request(true);await Promise.resolve();c.invalidate();const replacement=new Window(2);const attach=c.attach(replacement);release();await Promise.all([enter,attach]);assert.equal(replacement.mode,2);assert.ok(!replacement.calls.includes('recover'));});
test('rapid repeated enter requests do not duplicate native operation',async()=>{const {c,w}=await setup();await Promise.all([c.request(true),c.request(true),c.request(true)]);assert.equal(w.calls.filter(x=>x==='enter').length,1);});
test('manual user resize/mode change is not overwritten on exit',async()=>{const {c,w}=await setup();await c.request(true);w.mode=4;await c.request(false);assert.ok(!w.calls.includes('recover'));});
test('observed external change permanently relinquishes ownership even if mode returns',async()=>{const {c,w}=await setup();await c.request(true);c.observeMode(4);w.mode=1;await c.request(false);assert.ok(!w.calls.includes('recover'));});
test('new immersive preference is not overwritten',async()=>{const {c,w}=await setup();await c.request(true);w.immersive=false;await c.request(false);assert.ok(!w.calls.includes('recover'));});
test('failed restore can be explicitly retried',async()=>{const {c,w}=await setup();await c.request(true);w.restoreFail=true;assert.match((await c.request(false)).reason,/failed/);w.restoreFail=false;await c.request(false);assert.equal(w.mode,4);});
test('request while acquiring a window is replayed when handle arrives',async()=>{const c=new WindowPresentationController();assert.equal((await c.request(true)).mode,'in-window');const w=new Window();assert.equal((await c.attach(w)).mode,'native-fullscreen');});
test('partial maximize is rolled back before reporting fallback',async()=>{const {c,w}=await setup();w.enter=async()=>{w.calls.push('enter');w.mode=2;w.immersive=true;};assert.equal((await c.request(true)).mode,'in-window');assert.equal(w.mode,4);assert.equal(w.immersive,false);});
test('partial immersive preference change is rolled back',async()=>{const {c,w}=await setup();w.enter=async()=>{w.immersive=true;};assert.equal((await c.request(true)).mode,'in-window');assert.equal(w.immersive,false);});

test('silent restore no-op preserves actual fullscreen and explicit-exit retry ownership',async()=>{
 const {c,w}=await setup();await c.request(true);
 w.recover=async()=>{w.calls.push('recover-noop');};
 let result=await c.request(false);
 assert.equal(w.mode,1);assert.equal(result.mode,'native-fullscreen');assert.equal(result.restorationPending,true);
 assert.match(result.reason,/not confirmed/);
 w.recover=async()=>{w.calls.push('recover-retry');w.mode=4;};
 result=await c.request(false);
 assert.equal(w.mode,4);assert.equal(w.immersive,false);assert.equal(result.mode,'windowed');assert.equal(result.restorationPending,false);
 assert.equal(w.calls.filter(call=>call==='recover-retry').length,1);
});
test('rejected rollback after partial maximize preserves ownership and error until explicit exit retries',async()=>{
 const {c,w}=await setup();w.enter=async()=>{w.calls.push('enter');w.mode=2;w.immersive=true;};w.restoreFail=true;
 let result=await c.request(true);
 assert.equal(w.mode,2);assert.equal(result.mode,'in-window');assert.equal(result.restorationPending,true);assert.match(result.reason,/failed/);
 result=await c.request(true);
 assert.equal(result.restorationPending,true);assert.equal(w.calls.filter(call=>call==='enter').length,1);
 w.restoreFail=false;result=await c.request(false);
 assert.equal(w.mode,4);assert.equal(w.immersive,false);assert.equal(result.mode,'windowed');assert.equal(result.restorationPending,false);
});
test('failed fullscreen exit reports its observed mode and allows retry',async()=>{
 const {c,w}=await setup();await c.request(true);w.restoreFail=true;
 let result=await c.request(false);
 assert.equal(result.mode,'native-fullscreen');assert.equal(result.restorationPending,true);
 w.restoreFail=false;result=await c.request(false);
 assert.equal(result.mode,'windowed');assert.equal(result.restorationPending,false);
});
test('unconfirmed exit relinquishes old retry ownership when external window settings change',async()=>{
 for(const change of ['mode','immersive','observed-mode']){
  const {c,w}=await setup();await c.request(true);w.restoreFail=true;await c.request(false);
  const recoverCalls=w.calls.filter(call=>call==='recover').length;
  if(change==='immersive'){w.immersive=false;}else{w.mode=2;}
  let observed;c.setListener(result=>{observed=result;});
  if(change==='observed-mode'){c.observeMode(2);assert.equal(observed.restorationPending,false);}
  w.restoreFail=false;const result=await c.request(false);
  assert.equal(w.calls.filter(call=>call==='recover').length,recoverCalls,change);assert.equal(result.restorationPending,false,change);
 }
});
test('replacement stage discards pending restoration ownership and cannot retry its old handle',async()=>{
 const {c,w}=await setup();await c.request(true);w.restoreFail=true;await c.request(false);
 const recoverCalls=w.calls.filter(call=>call==='recover').length;c.invalidate();
 const replacement=new Window(2);await c.attach(replacement);await c.request(false);
 assert.equal(w.calls.filter(call=>call==='recover').length,recoverCalls);assert.equal(replacement.mode,2);assert.ok(!replacement.calls.includes('recover'));
});
test('silent maximized-baseline restore no-op retries maximize without recovering to floating',async()=>{
 const {c,w}=await setup(2,true);await c.request(true);
 w.maximizeWindowed=async()=>{w.calls.push('maximize-noop');};
 let result=await c.request(false);assert.equal(result.mode,'native-fullscreen');assert.equal(result.restorationPending,true);
 w.maximizeWindowed=async()=>{w.calls.push('maximize-retry');w.mode=2;w.immersive=false;};
 result=await c.request(false);assert.equal(result.restorationPending,false);assert.equal(w.mode,2);assert.equal(w.immersive,true);
 assert.ok(!w.calls.includes('recover'));assert.equal(w.calls.filter(call=>call==='maximize-retry').length,1);
});
test('partial maximize rollback no-op retains baseline for a later explicit exit',async()=>{
 const {c,w}=await setup();w.enter=async()=>{w.mode=2;w.immersive=true;};w.recover=async()=>{};
 const result=await c.request(true);assert.equal(result.mode,'in-window');assert.equal(result.restorationPending,true);assert.match(result.reason,/not confirmed/);
 w.recover=async()=>{w.mode=4;};await c.request(false);assert.equal(w.mode,4);assert.equal(w.immersive,false);
 w.enter=async()=>{w.mode=1;w.immersive=true;};assert.equal((await c.request(true)).mode,'native-fullscreen');await c.request(false);assert.equal(w.mode,4);
});
test('old partial-rollback completion cannot clear or republish replacement stage ownership',async()=>{
 const {c,w}=await setup();let release,started;
 const gate=new Promise(resolve=>{release=resolve;});const restoring=new Promise(resolve=>{started=resolve;});
 w.enter=async()=>{w.mode=2;w.immersive=true;};w.recover=async()=>{started();await gate;w.mode=4;};
 const entering=c.request(true);await restoring;c.invalidate();
 const replacement=new Window(2);await c.attach(replacement);await c.request(true);
 let result;c.setListener(value=>{result=value;});release();await entering;
 assert.equal(result.mode,'native-fullscreen');assert.equal(result.restorationPending,false);
 await c.request(false);assert.equal(replacement.mode,2);assert.ok(replacement.calls.includes('maximize-windowed'));
});
