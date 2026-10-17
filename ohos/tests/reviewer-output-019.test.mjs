import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return next(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);}});
const {setupIndex}=await import('./index-controller-helpers.mjs');
const {createOutputOwner}=await import('./output-owner-helpers.mjs');
const {PlaybackSessionCore}=await import('../entry/src/main/ets/core/PlaybackSessionCore.ts');
const {SettingsSchema}=await import('../entry/src/main/ets/settings/SettingsSchema.ts');
const {FunscriptParser}=await import('../entry/src/main/ets/core/Funscript.ts');
const {OutputCoordinator}=await import('../entry/src/main/ets/output/OutputCoordinator.ts');
const {MemoryTransport}=await import('../entry/src/main/ets/output/MemoryTransport.ts');
const {ShortcutAction,KeyboardShortcutConfiguration,KeyboardShortcutMapping}=await import('../entry/src/main/ets/input/ShortcutConfiguration.ts');
const {ShortcutKeyEvent}=await import('../entry/src/main/ets/input/LocalShortcutEngine.ts');
const settle=async()=>{for(let n=0;n<60;n++)await Promise.resolve();};
const policy={maximumFrameAgeMs:200,maximumClockAgeMs:750,maximumEventAgeMs:200,maximumFixedElapsedMs:1000,writeTimeoutMs:1000,maximumPolledQueueLength:64,allowZeroInterval:true};
function setup(){
 const config=SettingsSchema.defaults();for(const key of Object.keys(config.sync))if(key.startsWith('sync'))config.sync[key]=false;
 const core=new PlaybackSessionCore(config);core.flush=()=>{};core.setConnected(true);core.load(FunscriptParser.parse('{"actions":[{"at":0,"pos":10},{"at":10000,"pos":90}]}'));core.play();core.tick(40,40);
 const time={now:40,next:0,tasks:new Map(),nowMs(){return this.now;},scheduleAt(at,fn){const id=++this.next;this.tasks.set(id,{at,fn});return id;},cancel(id){this.tasks.delete(id);}};
 const ports=[],endpoints=[];let deferNext=false;
 const Owner=createOutputOwner(source=>{const coordinator=new OutputCoordinator({inspect:()=>({available:true,diagnostic:''}),create(_cfg,endpoint){const port=new MemoryTransport(time);port.deferOpen=deferNext;deferNext=false;ports.push(port);endpoints.push({...endpoint});return port;}},source,policy,time,time);const connect=coordinator.connect.bind(coordinator),owned=coordinator.connectOwned.bind(coordinator);coordinator.connect=(cfg,e)=>connect({...cfg,kind:'memory'},e);coordinator.connectOwned=(cfg,e)=>owned({...cfg,kind:'memory'},e);return coordinator;});
 const h=setupIndex({engine:core,outputOwner:Owner});h.page.inputNow=()=>time.now;Owner.restore(core.outputConfiguration(),core.activeRegistry().profile,core.activeRegistry().revision);h.page.sync=()=>h.page.syncOutput();h.page.sync();
 const add=(kind='tcp')=>{h.page.addOutputTarget(kind);const id=h.page.selectedOutputId,draft=Owner.draftSnapshot(id);draft.host='fixture.invalid';draft.port=1234;draft.editRevision++;draft.model.ranges=draft.model.ranges.map(r=>({...r,enabled:r.axisId==='L0'}));h.page.updateOutputDraft(draft);return id;};
 const action=(id,operation,text='')=>{const result=new ShortcutAction(operation);result.outputTargetId=id;result.text=text;return result;};
 const direct=(id,operation,text='')=>h.page.executeShortcutAction(action(id,operation,text),'L0');
 const touch=(id,operation,text='')=>h.page.touchShortcut(action(id,operation,text));
 return{...h,core,Owner,time,ports,endpoints,add,action,direct,touch,deferOpen(){deferNext=true;},dispose:()=>h.page.output.dispose()};
}
const CONNECT='OutputTarget::Connection::Connect',DISCONNECT='OutputTarget::Connection::Disconnect',TOGGLE='OutputTarget::Connection::Toggle';
const endpointAction=kind=>kind==='webSocket'?'OutputTarget::WebSocket::Uri::Set':`OutputTarget::${kind.toUpperCase()}::Endpoint::Set`;

for(const kind of ['tcp','udp','webSocket'])test(`review output 0.19: ${kind} canonical endpoint no-op and connected Connect preserve existing Arm without new IO`,async()=>{
 const h=setup();try{const id=h.add(kind);await h.direct(id,CONNECT);const target=h.page.output.get(id);h.page.armOutput(id);assert.equal(target.status().armed,true);const before=h.Owner.configurationSnapshot(),media=h.core.snapshot(),port=h.ports[0];
  await h.direct(id,endpointAction(kind),kind==='webSocket'?'WS://FIXTURE.INVALID:1234/':'FIXTURE.INVALID:01234');await h.direct(id,CONNECT);
  assert.equal(h.ports.length,1);assert.equal(h.ports[0],port);assert.equal(target.status().armed,true);assert.deepEqual(h.Owner.configurationSnapshot(),before);assert.equal(h.core.snapshot().state,media.state);assert.equal(port.writeRecords().length,0);
 }finally{await h.dispose();}
});

test('review output 0.19: endpoint edit retires an opening shortcut and its late native completion cannot apply the new draft',async()=>{
 const h=setup();try{const id=h.add();h.deferOpen();const pending=h.touch(id,CONNECT);await settle();const old=h.ports[0];assert.equal(h.page.output.get(id).status().connection,'connecting');
  await h.direct(id,endpointAction('tcp'),'next.invalid:4567');assert.equal(h.Owner.draftSnapshot(id).applicationId,0);assert.equal(h.Owner.configurationSnapshot().targets[0].host,'next.invalid');
  old.resolveNextOpen();await pending;await settle();assert.notEqual(h.page.output.get(id).status().connection,'connected');assert.equal(h.Owner.draftSnapshot(id).applicationId,0);assert.equal(old.writeRecords().length,0);
  await h.direct(id,CONNECT);assert.equal(h.ports.length,2);assert.equal(h.endpoints[1].host,'next.invalid');assert.equal(h.endpoints[1].port,4567);assert.equal(h.page.output.get(id).status().armed,false);
 }finally{await h.dispose();}
});

test('review output 0.19: queued captured target cannot silently adopt a removed and recreated same ID',async()=>{
 const h=setup();try{const blocker=h.add('udp'),victim=h.add('tcp'),oldGeneration=h.Owner.draftSnapshot(victim).targetGeneration;
  const config=new KeyboardShortcutConfiguration(),mapping=new KeyboardShortcutMapping('review-owned');mapping.keys=[2017];mapping.actions=[h.action(blocker,CONNECT),h.action(victim,CONNECT)];config.mappings=[mapping];h.page.keyboard.setConfiguration(config);h.page.keyboardConfiguration=config;h.page.updateKeyboardContext();h.deferOpen();const dispatch=h.page.keyboard.keyEvent(new ShortcutKeyEvent(2017,true),h.time.now)[0];assert.ok(dispatch);const first=h.page.runShortcutDispatch(dispatch);await settle();assert.equal(h.ports.length,1,'second action must actually be queued before target removal');
  await h.page.removeOutputTarget(victim);const replacement=h.add('tcp');assert.equal(replacement,victim);assert.notEqual(h.Owner.draftSnapshot(replacement).targetGeneration,oldGeneration);
  h.ports[0].resolveNextOpen();await first;await settle();assert.equal(h.ports.length,1);assert.equal(h.page.output.get(replacement).status(),null);assert.equal(h.Owner.draftSnapshot(replacement).applicationId,0);
 }finally{await h.dispose();}
});

for(const change of ['Stop','focus','background','disappear'])test(`review output 0.19: ${change} cancellation wins over delayed real MemoryTransport open`,async()=>{
 const h=setup();try{const id=h.add();h.deferOpen();const pending=h.touch(id,CONNECT);await settle();
  if(change==='Stop')h.page.stop();else if(change==='focus')h.page.cancelKeyboardWork();else if(change==='background'){h.page.foreground=false;h.page.foregroundChanged();}else h.page.aboutToDisappear();
  h.ports[0].resolveNextOpen();await pending;await settle();assert.notEqual(h.page.output.get(id)?.status()?.connection,'connected');assert.equal(h.ports[0].writeRecords().length,0);assert.equal(h.Owner.draftSnapshot(id).applicationId,0);
 }finally{await h.dispose();}
});

test('review output 0.19: failed close is retained and Connect or Toggle cannot replace it',async()=>{
 const h=setup();try{const id=h.add();await h.direct(id,CONNECT);h.page.armOutput(id);h.ports[0].rejectClose=true;await assert.rejects(h.direct(id,DISCONNECT));assert.equal(h.page.output.get(id).status().armed,false);assert.equal(h.page.output.get(id).status().closeConfirmed,false);
  await assert.rejects(h.direct(id,CONNECT));await assert.rejects(h.direct(id,TOGGLE));assert.equal(h.ports.length,1);assert.equal(h.core.snapshot().state,'playing');
 }finally{await h.dispose();}
});

test('review output 0.19: disconnected Disconnect and invalid endpoint edits are inert for all other targets',async()=>{
 const h=setup();try{const idle=h.add('tcp'),active=h.add('udp');await h.direct(active,CONNECT);h.page.armOutput(active);const before=h.Owner.configurationSnapshot();
  await h.direct(idle,DISCONNECT);for(const value of ['user:secret@host.invalid:1234','host.invalid:0','[host.invalid]:1234'])await assert.rejects(h.direct(idle,endpointAction('tcp'),value));
  assert.equal(h.ports.length,1);assert.equal(h.page.output.get(active).status().armed,true);assert.equal(h.page.output.get(idle).status(),null);assert.deepEqual(h.Owner.configurationSnapshot(),before);
 }finally{await h.dispose();}
});

test('review output 0.19: stale Index continuation and cancellation cannot disarm a newer explicitly connected target',async()=>{
 const h=setup();try{const id=h.add(),target=h.page.output.get(id),original=target.connectOwned.bind(target);
  target.connectOwned=(config,endpoint)=>{const request=original(config,endpoint);return{requestId:request.requestId,completion:request.completion.then(async connected=>{
   assert.equal(connected,true);assert.equal(await target.connect(config,endpoint),true);
   const draft=h.Owner.draftSnapshot(id);draft.applicationId=target.appliedConfigurationId();assert.equal(h.Owner.saveDraft(draft),true);h.page.armOutput(id);assert.equal(target.status().armed,true);
   h.page.cancelKeyboardWork();return connected;
  })};};
  await h.touch(id,CONNECT);assert.equal(h.ports.length,2);assert.equal(target.status().connection,'connected');assert.equal(target.status().armed,true);assert.equal(h.ports[1].closeRecords().length,0);
 }finally{await h.dispose();}
});

test('review output 0.19: endpoint persistence failure reports failure and leaves its target disarmed without reconnect',async()=>{
 const h=setup();try{const id=h.add();await h.direct(id,CONNECT);h.page.armOutput(id);const target=h.page.output.get(id),old=h.ports[0];
  h.core.changeOutputConfiguration=()=>{throw Error('injected save failure');};
  await assert.rejects(h.direct(id,endpointAction('tcp'),'next.invalid:4567'));
  assert.equal(target.status().armed,false);assert.equal(target.status().connection,'connected');assert.equal(h.ports.length,1);assert.equal(h.ports[0],old);assert.equal(h.Owner.draftSnapshot(id).applicationId,0);assert.ok(h.page.outputSaveDiagnostic.length>0);assert.equal(h.core.snapshot().state,'playing');
 }finally{await h.dispose();}
});
