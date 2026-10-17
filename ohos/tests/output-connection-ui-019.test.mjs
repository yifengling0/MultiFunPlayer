import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);}});
const {setupIndex}=await import('./index-controller-helpers.mjs');
const {createOutputOwner}=await import('./output-owner-helpers.mjs');
const {PlaybackSessionCore}=await import('../entry/src/main/ets/core/PlaybackSessionCore.ts');
const {SettingsSchema}=await import('../entry/src/main/ets/settings/SettingsSchema.ts');
const {FunscriptParser}=await import('../entry/src/main/ets/core/Funscript.ts');
const {OutputCoordinator}=await import('../entry/src/main/ets/output/OutputCoordinator.ts');
const {MemoryTransport}=await import('../entry/src/main/ets/output/MemoryTransport.ts');
const {ShortcutAction}=await import('../entry/src/main/ets/input/ShortcutConfiguration.ts');
const policy={maximumFrameAgeMs:200,maximumClockAgeMs:750,maximumEventAgeMs:200,maximumFixedElapsedMs:1000,writeTimeoutMs:1000,maximumPolledQueueLength:64,allowZeroInterval:true};
const settle=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
function setup(){
 const cfg=SettingsSchema.defaults(),core=new PlaybackSessionCore(cfg);core.flush=()=>{};core.setConnected(true);core.load(FunscriptParser.parse('{"actions":[{"at":0,"pos":10},{"at":10000,"pos":90}]}'));core.play();core.tick(40,40);
 const time={now:40,next:0,tasks:new Map(),nowMs(){return this.now;},scheduleAt(at,fn){const id=++this.next;this.tasks.set(id,{at,fn});return id;},cancel(id){this.tasks.delete(id);}};const ports=[];let plan=null;
 const Owner=createOutputOwner(source=>{const c=new OutputCoordinator({inspect:()=>({available:true,diagnostic:''}),create(){const port=new MemoryTransport(time);if(plan){const wait=plan;port.open=()=>wait.promise;plan=null;}ports.push(port);return port;}},source,policy,time,time);const connect=c.connect.bind(c),owned=c.connectOwned.bind(c);c.connect=(v,e)=>connect({...v,kind:'memory'},e);c.connectOwned=(v,e)=>owned({...v,kind:'memory'},e);return c;});
 const h=setupIndex({engine:core,outputOwner:Owner});h.page.inputNow=()=>time.now;Owner.restore(core.outputConfiguration(),core.activeRegistry().profile,core.activeRegistry().revision);h.page.sync=()=>h.page.syncOutput();h.page.sync();
 const add=(kind='tcp')=>{h.page.addOutputTarget(kind);const id=h.page.selectedOutputId,draft=Owner.draftSnapshot(id);draft.host='fixture.invalid';draft.port=1234;draft.editRevision++;draft.model.ranges=draft.model.ranges.map(r=>({...r,enabled:r.axisId==='L0'}));h.page.updateOutputDraft(draft);return id;};
 const action=(id,operation,text='')=>{const a=new ShortcutAction(operation);a.outputTargetId=id;a.text=text;return a;};
 return{...h,core,Owner,time,ports,add,action,plan:wait=>{plan=wait;}};
}
for(const kind of ['tcp','udp','webSocket'])test(`${kind} genuine Connect/Disconnect/Toggle target route stays separate from playback and Arm`,async()=>{
 const h=setup();const id=h.add(kind),connect=h.action(id,'OutputTarget::Connection::Connect');await h.page.executeShortcutAction(connect,'L0');const target=h.page.output.get(id);assert.equal(target.status().connection,'connected');assert.equal(target.status().armed,false);assert.equal(h.core.snapshot().state,'playing');assert.equal(h.ports[0].writeRecords().length,0);
 h.page.armOutput(id);assert.equal(target.status().armed,true);const port=h.ports[0];await h.page.executeShortcutAction(connect,'L0');assert.equal(h.ports.length,1);assert.equal(target.status().armed,true);
 await h.page.executeShortcutAction(h.action(id,'OutputTarget::Connection::Disconnect'),'L0');assert.equal(target.status().connection,'disconnected');assert.equal(target.status().armed,false);assert.equal(h.core.snapshot().state,'playing');
 await h.page.executeShortcutAction(h.action(id,'OutputTarget::Connection::Toggle'),'L0');assert.equal(h.ports.length,2);assert.equal(target.status().armed,false);assert.notEqual(h.ports[1],port);await h.page.output.dispose();
});
test('Endpoint Set saves complete draft but keeps old connected socket; Connect is inert until explicit disconnect',async()=>{
 const h=setup(),id=h.add();await h.page.executeShortcutAction(h.action(id,'OutputTarget::Connection::Connect'),'L0');h.page.armOutput(id);const target=h.page.output.get(id),port=h.ports[0];
 await h.page.executeShortcutAction(h.action(id,'OutputTarget::TCP::Endpoint::Set','next.invalid:4567'),'L0');assert.equal(target.status().armed,false);assert.equal(target.status().connection,'connected');assert.equal(h.Owner.draftSnapshot(id).applicationId,0);assert.equal(h.Owner.configurationSnapshot().targets[0].host,'next.invalid');assert.equal(h.ports[0],port);
 await h.page.executeShortcutAction(h.action(id,'OutputTarget::Connection::Connect'),'L0');assert.equal(h.ports.length,1);h.page.armOutput(id);assert.equal(target.status().armed,false);
 await h.page.executeShortcutAction(h.action(id,'OutputTarget::Connection::Disconnect'),'L0');await h.page.executeShortcutAction(h.action(id,'OutputTarget::Connection::Connect'),'L0');assert.equal(h.ports.length,2);assert.equal(target.status().armed,false);await h.page.output.dispose();
});
test('explicit target survives selection change and invalid/missing target never falls back',async()=>{
 const h=setup(),a=h.add(),b=h.add('udp');await h.page.executeShortcutAction(h.action(a,'OutputTarget::Connection::Connect'),'L0');assert.equal(h.page.output.get(a).status().connection,'connected');assert.equal(h.page.output.get(b).status(),null);
 await assert.rejects(h.page.executeShortcutAction(h.action('','OutputTarget::Connection::Connect'),'L0'));await assert.rejects(h.page.executeShortcutAction(h.action('tcp:9','OutputTarget::Connection::Connect'),'L0'));assert.equal(h.ports.length,1);await h.page.output.dispose();
});
for(const cancellation of ['Stop','focus','draft','remove'])test(`pending shortcut Connect cancellation ${cancellation} cannot leave or arm a late connection`,async()=>{
 const h=setup(),id=h.add(),wait=deferred();h.plan(wait);const operation=h.page.touchShortcut(h.action(id,'OutputTarget::Connection::Connect'));await settle();assert.equal(h.ports.length,1);
 if(cancellation==='Stop')h.page.stop();else if(cancellation==='focus')h.page.cancelKeyboardWork();else if(cancellation==='draft'){const d=h.Owner.draftSnapshot(id);d.port++;d.editRevision++;h.page.updateOutputDraft(d);}else{void h.page.removeOutputTarget(id);}
 wait.resolve();await operation;await settle();const status=h.page.output.get(id)?.status();assert.ok(status===null||status===undefined||status.connection!=='connected');assert.ok(!status?.armed);await h.page.output.dispose();
});
test('late owner cancellation cannot disconnect a newer manual connection',async()=>{
 const h=setup(),id=h.add(),draft=h.Owner.draftSnapshot(id),target=h.page.output.get(id);const endpoint={host:draft.host,port:draft.port,family:1,localPort:0,scheme:'ws',path:'/'};const request=target.connectOwned({...draft.model.config(h.page.outputProfile,id),kind:'memory'},endpoint);assert.equal(await request.completion,true);
 assert.equal(await target.connect({...draft.model.config(h.page.outputProfile,id),kind:'memory'},endpoint),true);target.cancelOwnedConnection(request.requestId);assert.equal(target.status().connection,'connected');assert.equal(h.ports.length,2);await h.page.output.dispose();
});
