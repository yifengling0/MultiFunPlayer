import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {registerHooks,stripTypeScriptTypes} from 'node:module';
registerHooks({resolve(s,c,n){
 if(s==='@kit.ArkUI')return{url:'data:text/javascript,export const window={WindowEventType:{WINDOW_SHOWN:1,WINDOW_ACTIVE:2,WINDOW_INACTIVE:3,WINDOW_HIDDEN:4,WINDOW_DESTROYED:7}}',shortCircuit:true};
 return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);
},load(u,c,n){if(u.endsWith('.ets'))return{format:'module-typescript',source:fs.readFileSync(new URL(u),'utf8'),shortCircuit:true};return n(u,c);}});
const {KeyboardInputSession:K}=await import('../entry/src/main/ets/app/KeyboardInputSession.ts');
const {NativeKeyboardWindow:N}=await import('../entry/src/main/ets/app/NativeKeyboardWindow.ets');
const {KeyboardShortcutConfiguration,KeyboardShortcutMapping,ShortcutAction}=await import('../entry/src/main/ets/input/ShortcutConfiguration.ts');
const {setupIndex}=await import('./index-controller-helpers.mjs');
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{resolve,reject,promise}};
const settle=async()=>{for(let i=0;i<24;i++)await Promise.resolve()};
class Handle{
 focused=true;onCalls=[];offCalls=[];callback;
 isFocused(){if(this.queryError)throw Error('unavailable');return this.focused;}
 on(name,callback){this.onCalls.push([name,callback]);if(this.subscribeError)throw Error('subscription unsupported');this.callback=callback;}
 off(name,callback){this.offCalls.push([name,callback]);if(this.offError)throw Error('already destroyed');}
 emit(type){this.callback?.(type);}
}
const stage=handle=>({getMainWindow:async()=>handle});
async function attach(t,handle=new Handle(),foreground=true){const owner=N.attachStage(stage(handle),foreground);t.after(()=>N.releaseStage(owner));await settle();return{handle,owner};}
function install(page){page.keyboardOwner=K.setListener(()=>page.updateKeyboardContext(),(key,down)=>page.handleKeyboardKey(key,down),()=>page.cancelKeyboardWork());return page.keyboardOwner;}
function configure(page,trigger='hold',actions=['App::Library::Show']){
 const c=new KeyboardShortcutConfiguration(),m=new KeyboardShortcutMapping('hold');m.keys=[2017];m.trigger=trigger;m.holdInvoke='holding';m.minimumHoldDurationMs=100;m.actions=actions.map(x=>new ShortcutAction(x));c.mappings=[m];page.keyboardConfiguration=c;page.keyboard.setConfiguration(c);page.updateKeyboardContext();return m;
}
function pageFixture(t){const f=setupIndex();const owner=install(f.page);t.after(()=>K.releaseListener(owner));f.page.inputNow=()=>f.state.now??0;return f;}

test('native focus starts closed, follows real queried focus and unsubscribes the exact listener',async t=>{
 const pending=defer(),h=new Handle(),owner=N.attachStage({getMainWindow:()=>pending.promise},true);t.after(()=>N.releaseStage(owner));
 assert.equal(K.isWindowFocused(),false);assert.match(K.windowFocusMessage(),/无法确认/);pending.resolve(h);await settle();assert.equal(K.isWindowFocused(),true);
 h.focused=false;h.emit(3);assert.equal(K.isWindowFocused(),false);h.emit(2);assert.equal(K.isWindowFocused(),false,'late ACTIVE is not evidence while isFocused is false');
 h.focused=true;h.emit(1);assert.equal(K.isWindowFocused(),true);const cb=h.callback;N.releaseStage(owner);assert.equal(K.isWindowFocused(),false);assert.deepEqual(h.offCalls,[['windowEvent',cb]]);cb(2);assert.equal(K.isWindowFocused(),false);
});
test('replacement rejects old acquisition, native callback, foreground and cleanup ownership',async t=>{
 const pending=defer(),old=new Handle(),a=N.attachStage({getMainWindow:()=>pending.promise},true);const {handle:h,owner:b}=await attach(t);assert.ok(b>a);
 pending.resolve(old);await settle();assert.deepEqual(old.onCalls,[]);N.setForeground(a,false);N.releaseStage(a);assert.equal(K.isWindowFocused(),true);
 const stale=h.callback;const {owner:c}=await attach(t);stale(3);assert.equal(K.isWindowFocused(),true);N.releaseStage(b);assert.equal(K.isWindowFocused(),true);N.releaseStage(c);
});
test('background gates delayed ACTIVE; foreground never creates an action or resumes an old timer',async t=>{
 const {handle:h,owner}=await attach(t);N.setForeground(owner,false);h.emit(2);assert.equal(K.isWindowFocused(),false);N.setForeground(owner,true);assert.equal(K.isWindowFocused(),true);
 h.emit(4);assert.equal(K.isWindowFocused(),false);const cb=h.callback;h.emit(7);assert.equal(K.isWindowFocused(),false);cb(2);N.setForeground(owner,true);assert.equal(K.isWindowFocused(),false,'destroyed native handle cannot revive');
});
test('query and subscription failure stay closed, including after foreground, without fallback to page lifetime',async t=>{
 for(const error of ['queryError','subscribeError']){const h=new Handle();h[error]=true;const {owner}=await attach(t,h);assert.equal(K.isWindowFocused(),false);assert.match(K.windowFocusMessage(),/无法确认/);N.setForeground(owner,true);assert.equal(K.isWindowFocused(),false);N.releaseStage(owner);}
 const owner=N.attachStage({getMainWindow:async()=>{throw Error('destroyed')}},true);await settle();assert.equal(K.isWindowFocused(),false);N.releaseStage(owner);
});
test('actual Index fake-clock hold is canceled on inactive despite foreground/page staying active',async t=>{
 const {page,state,calls}=pageFixture(t),{handle:h}=await attach(t);const invoked=[];page.executeShortcutAction=async a=>{invoked.push(a.id)};configure(page);
 page.handleKeyboardKey(2017,true);assert.equal(page.keyboard.nextDeadlineMs(),100);const token=page.keyboard.cancellationToken();calls.length=0;
 h.focused=false;h.emit(3);assert.equal(page.viewActive,true);assert.equal(page.foreground,true);assert.equal(page.keyboard.nextDeadlineMs(),null);assert.equal(page.keyboard.advance(1000,token).length,0);assert.equal(calls.some(([k])=>['pause','stop','outputForeground'].includes(k)),false);
 h.focused=true;h.emit(2);state.now=1000;page.handleKeyboardKey(2017,true);assert.equal(page.keyboard.nextDeadlineMs(),null);page.handleKeyboardKey(2017,false);page.handleKeyboardKey(2017,true);assert.equal(page.keyboard.nextDeadlineMs(),1100);
 for(const d of page.keyboard.advance(1100))await page.runShortcutDispatch(d);assert.deepEqual(invoked,['App::Library::Show']);
});
test('native CANCEL and every unsupported phase cancel without Release/Click or pending hold; no new enum required',async t=>{
 for(const trigger of ['release','click','hold'])for(const phase of [3,2,-1,NaN,undefined]){
  const {page,state}=pageFixture(t);await attach(t);const invoked=[];page.executeShortcutAction=async a=>invoked.push(a.id);configure(page,trigger);
  const cb=page.keyboardDispatchHandler();cb({type:0,keyCode:2017});const token=page.keyboard.cancellationToken();assert.equal(cb({type:phase,keyCode:2017}),false);assert.ok(page.keyboard.cancellationToken()>token);assert.equal(page.keyboard.nextDeadlineMs(),null);
  state.now=1000;assert.equal(page.keyboard.advance(1000).length,0);cb({type:1,keyCode:2017});await settle();assert.deepEqual(invoked,[]);
 }
});
test('focused editor pre-IME Cancel retires hold and no private text is inspected',async t=>{
 const {page}=pageFixture(t);await attach(t);configure(page);page.handleKeyboardKey(2017,true);const id=K.newEditorId();t.after(()=>K.releaseEditor(id));const cb=K.emergencyHandler(id);const token=page.keyboard.cancellationToken();
 cb({type:3,keyCode:2017,get keyText(){assert.fail('text must remain private')}});assert.ok(page.keyboard.cancellationToken()>token);assert.equal(page.keyboard.nextDeadlineMs(),null);
});
test('same-window listener replacement retires old hold and late batch without changing window identity',async t=>{
 const old=pageFixture(t);await attach(t);configure(old.page);old.page.handleKeyboardKey(2017,true);assert.equal(old.page.keyboard.nextDeadlineMs(),100);
 const windowOwner=K.windowOwner;let next=K.setListener(()=>{},()=>false,()=>{});t.after(()=>K.releaseListener(next));assert.equal(K.windowOwner,windowOwner);assert.equal(old.page.keyboard.nextDeadlineMs(),null);
 install(old.page);old.page.handleKeyboardKey(2017,false);configure(old.page,'press',['App::Library::Show','App::Fullscreen::Toggle']);const pending=defer(),calls=[];
 old.page.executeShortcutAction=async a=>{calls.push(a.id);if(calls.length===1)await pending.promise};old.page.handleKeyboardKey(2017,true);await settle();const work=old.page.shortcutQueue;
 next=K.setListener(()=>{},()=>false,()=>{});assert.equal(K.windowOwner,windowOwner);pending.resolve();await work;assert.deepEqual(calls,['App::Library::Show']);
});
test('late root/editor cancellation from a replaced page cannot retire the new owner',async t=>{
 const old=pageFixture(t);await attach(t);const oldRoot=old.page.keyboardDispatchHandler(),oldPre=old.page.keyboardPreImeHandler(),id=K.newEditorId(),oldField=K.emergencyHandler(id);t.after(()=>K.releaseEditor(id));
 const current=pageFixture(t);await attach(t);configure(current.page);current.page.handleKeyboardKey(2017,true);const token=current.page.keyboard.cancellationToken();
 for(const cb of [oldRoot,oldPre,oldField]){assert.equal(cb({type:3,keyCode:2017}),false);assert.equal(cb({type:0,keyCode:2101}),false);}
 K.releaseListener(old.page.keyboardOwner);assert.equal(current.page.keyboard.cancellationToken(),token);assert.equal(current.page.keyboard.nextDeadlineMs(),100);
});
test('inactive retires queued and awaiting batches; late completion cannot issue later actions',async t=>{
 const {page}=pageFixture(t),{handle:h}=await attach(t),pending=defer(),invoked=[];configure(page,'press',['App::Library::Show','App::Fullscreen::Toggle']);
 page.executeShortcutAction=async a=>{invoked.push(a.id);if(invoked.length===1)await pending.promise;};page.handleKeyboardKey(2017,true);await settle();const old=page.shortcutQueue;
 h.focused=false;h.emit(3);h.focused=true;h.emit(2);pending.resolve();await old;assert.deepEqual(invoked,['App::Library::Show']);assert.equal(page.pendingShortcutDispatches.length,0);
});
test('actual root F12 remains immediate in focused text/capture, without claiming global inactive delivery',async t=>{
 const {page}=pageFixture(t),{handle:h}=await attach(t);let stopped=0;page.stop=()=>stopped++;page.executeShortcutAction=async a=>{if(a.id==='App::Stop')page.stop()};page.showInputSettings=true;page.updateKeyboardContext();
 assert.equal(page.keyboardPreImeHandler()({type:0,keyCode:2101}),true);await settle();assert.equal(stopped,1);h.focused=false;h.emit(3);page.keyboardDispatchHandler()({type:0,keyCode:2101});await settle();assert.equal(stopped,1);
});
const abilitySource=fs.readFileSync(new URL('../entry/src/main/ets/entryability/EntryAbility.ets',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export default class','class');
function abilityClass(initialize=async()=>{},calls=[]){return new Function('NativeKeyboardWindow','UIAbility','NativeOutputSession','AppStorage','PlaybackSession','NativeWindowPresentation','RemoteMediaSession',stripTypeScriptTypes(abilitySource)+';return EntryAbility;')(N,class{},
 {setForeground(v){calls.push(['outputForeground',v])},closeIfReady(){calls.push(['outputClose'])}},
 {setOrCreate(k,v){calls.push(['storage',k,v])}},{initialize,flushIfReady(){calls.push(['flush'])}},
 {async attachStage(){calls.push(['presentationAttach'])},async setForeground(v){calls.push(['presentationForeground',v])},destroyStage(){calls.push(['presentationDestroy'])}},
 {closeIfReady(){calls.push(['remoteClose'])}});}
function instance(Ability){const app=new Ability();app.context={filesDir:'/owned'};return app;}
function ability(initialize){return instance(abilityClass(initialize));}
test('actual Ability invalidates acquisition before settings resolve and binds only the current stage',async()=>{
 const init=defer(),app=ability(()=>init.promise),h=new Handle();let gets=0,loads=0;const work=app.onWindowStageCreate({getMainWindow:async()=>{gets++;return h},loadContent:async()=>loads++});app.onWindowStageDestroy();init.resolve();await work;await settle();assert.equal(gets,0);assert.equal(loads,0);assert.equal(K.isWindowFocused(),false);
});
test('old Ability cleanup/background cannot revoke another Ability window input owner',async()=>{
 const calls=[],Ability=abilityClass(async()=>{},calls),first=instance(Ability),second=instance(Ability),a=new Handle(),b=new Handle();await first.onWindowStageCreate({...stage(a),loadContent:async()=>{}});await settle();await second.onWindowStageCreate({...stage(b),loadContent:async()=>{}});await settle();assert.equal(K.isWindowFocused(),true);
 calls.length=0;first.onForeground();first.onBackground();first.onWindowStageDestroy();first.onDestroy();assert.deepEqual(calls,[],'retired Ability cannot touch global foreground, outputs, media or presentation');assert.equal(K.isWindowFocused(),true);a.emit(3);assert.equal(K.isWindowFocused(),true);second.onBackground();assert.equal(K.isWindowFocused(),false);b.emit(2);assert.equal(K.isWindowFocused(),false);second.onDestroy();
});

test('replacement Ability blocks late settings completion and late load failure global side effects',async()=>{
 const pending=defer(),calls=[];let count=0;const Ability=abilityClass(()=>++count===1?pending.promise:Promise.resolve(),calls),a=instance(Ability),h=new Handle();let staleLoads=0;
 const first=a.onWindowStageCreate({...stage(h),loadContent:async()=>staleLoads++});const b=instance(Ability);await b.onWindowStageCreate({...stage(new Handle()),loadContent:async()=>{}});await settle();calls.length=0;pending.resolve();await first;assert.equal(staleLoads,0);assert.deepEqual(calls,[]);assert.equal(K.isWindowFocused(),true);
 const fail=defer(),old=b.onWindowStageCreate({...stage(new Handle()),loadContent:()=>fail.promise});await settle();const c=instance(Ability);await c.onWindowStageCreate({...stage(new Handle()),loadContent:async()=>{}});await settle();calls.length=0;fail.reject(Error('stale load'));await old;assert.deepEqual(calls,[]);assert.equal(K.isWindowFocused(),true);c.onWindowStageDestroy();calls.length=0;c.onDestroy();assert.ok(calls.some(([k])=>k==='outputClose'),'normal StageDestroy then Destroy still closes current connection');
});

test('constructing an uncreated Ability cannot steal existing lifecycle ownership',async()=>{
 const calls=[],Ability=abilityClass(async()=>{},calls),first=instance(Ability),h=new Handle();await first.onWindowStageCreate({...stage(h),loadContent:async()=>{}});await settle();const uncreated=instance(Ability);calls.length=0;uncreated.onForeground();uncreated.onBackground();uncreated.onWindowStageDestroy();uncreated.onDestroy();assert.deepEqual(calls,[]);assert.equal(K.isWindowFocused(),true);
 first.onBackground();assert.equal(K.isWindowFocused(),false);assert.ok(calls.some(([k,v])=>k==='outputForeground'&&v===false));first.onDestroy();
});
