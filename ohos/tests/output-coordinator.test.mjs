import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);}});
const {OutputCoordinator,OutputEndpoint}=await import('../entry/src/main/ets/output/OutputCoordinator.ts');
const {OutputSettingsModel}=await import('../entry/src/main/ets/output/OutputSettingsModel.ts');
const {OutputSession}=await import('../entry/src/main/ets/output/OutputSession.ts');
const {MemoryTransport}=await import('../entry/src/main/ets/output/MemoryTransport.ts');
const {registerNativeTransport,isRegisteredNativeTransport,releaseNativeTransport}=await import('../entry/src/main/ets/output/NativeTransportAdmission.ts');
const profile={precision:4,revision:1,axisOrder:['L0'],maximumDurationMs:10000,maximumPayloadBytes:1024};
const policy={maximumFrameAgeMs:200,maximumClockAgeMs:200,maximumEventAgeMs:100,maximumFixedElapsedMs:1000,writeTimeoutMs:100,maximumPolledQueueLength:4,allowZeroInterval:true};
const config=()=>{const m=new OutputSettingsModel();m.ranges=[{axisId:'L0',minimum:0,maximum:1,enabled:true}];return {...m.config({...profile,axisOrder:profile.axisOrder.slice()}),kind:'memory'};};
const settle=async()=>{for(let n=0;n<30;n++)await Promise.resolve();};
function setup(){
 const time={now:0,id:0,tasks:new Map(),nowMs(){return this.now;},scheduleAt(at,fn){this.tasks.set(++this.id,{at,fn});return this.id;},cancel(id){this.tasks.delete(id);},async advance(n){this.now+=n;const tasks=[...this.tasks];for(const[id,t]of tasks){if(t.at<=this.now&&this.tasks.delete(id))t.fn();}await settle();}};
 const source={value:{frame:{sequence:1,epoch:1,profileRevision:1,monotonicMs:0,mediaPositionMs:0,axisStates:[{axisName:'L0',value:.5}],events:[]},authorization:{epoch:1,sourceFrameSequence:1,sourceConfigurationRevision:0,updateKind:'fixed',authorizedAxes:['L0'],intents:['activePlayback'],clockKind:'media',observedMonotonicMs:0},mediaState:'playing',foreground:true,faulted:false},dispatchSource(){return this.value;}};
 const ports=[];const factory={inspect(){return {available:true,diagnostic:'mock'};},create(){const p=new MemoryTransport(time);ports.push(p);return p;}};
 const c=new OutputCoordinator(factory,source,policy,time,time);return {c,source,ports,time};
}
test('constructor inert, explicit connect does not arm or write, then real authorized frame writes',async()=>{
 const s=setup();assert.equal(s.ports.length,0);assert.equal(s.c.arm(),false);assert.equal(await s.c.connect(config(),new OutputEndpoint()),true);
 assert.equal(s.c.status().armed,false);assert.equal(s.ports[0].writeRecords().length,0);
 assert.equal(s.c.arm(),true);assert.equal(s.c.refresh(),'accepted');await s.time.advance(10);assert.equal(s.c.status().completedLocalWrites,1);
 await s.c.dispose();
});
test('missing provenance, stopped and faulted sources disarm, never emit preview',async()=>{
 for(const update of [{authorization:null},{mediaState:'stopped'},{faulted:true},{foreground:false}]){
  const s=setup();await s.c.connect(config(),new OutputEndpoint());s.c.arm();s.source.value={...s.source.value,...update};s.c.refresh();await s.time.advance(10);
  assert.equal(s.c.status().armed,false);assert.equal(s.ports[0].writeRecords().length,0);assert.equal(s.c.arm(),false);await s.c.dispose();
 }
});
test('epoch change invalidates arm; older epoch cannot feed new arm; replace never auto-arms',async()=>{
 const s=setup();await s.c.connect(config(),new OutputEndpoint());s.c.arm();s.c.refresh();
 const old=s.source.value;s.source.value={...old,frame:{...old.frame,epoch:2,sequence:2},authorization:{...old.authorization,epoch:2,sourceFrameSequence:2}};
 s.c.refresh();assert.equal(s.c.status().armed,false);assert.equal(s.c.arm(),true);s.source.value=old;assert.equal(s.c.refresh(),'ignored');
 assert.equal(await s.c.connect(config(),new OutputEndpoint()),true);assert.equal(s.c.status().armed,false);assert.equal(s.ports[1].writeRecords().length,0);await s.c.dispose();
});
test('background closes and returning foreground never reconnects or arms',async()=>{
 const s=setup();await s.c.connect(config(),new OutputEndpoint());s.c.arm();s.c.setForeground(false);await settle();s.c.setForeground(true);
 assert.equal(s.c.status().armed,false);assert.equal(s.c.status().connection,'disconnected');assert.equal(s.ports.length,1);await s.c.dispose();
});
test('factory identity required, fake marker denied, kind mismatch and reconfiguration kind denied',async()=>{
 const s=setup(),p=new MemoryTransport(s.time);Object.defineProperty(p,'simulationOnly',{value:false});p.nativeNetworkKind='tcp';
 assert.throws(()=>new OutputSession({...config(),kind:'tcp'},policy,p,s.time,s.time));
 registerNativeTransport(p,'tcp');assert.equal(isRegisteredNativeTransport(p,'udp'),false);
 assert.throws(()=>new OutputSession({...config(),kind:'udp'},policy,p,s.time,s.time));
 const session=new OutputSession({...config(),kind:'tcp'},policy,p,s.time,s.time);assert.equal(session.snapshot().simulationOnly,false);
 session.reconfigure({...config(),kind:'udp',protocolProfile:{...profile,revision:2}});assert.equal(session.snapshot().lastErrorCode,'invalidConfiguration');await session.dispose();assert.equal(isRegisteredNativeTransport(p,'tcp'),false);
});
test('old epoch fault/background callbacks cannot tear down newer armed source',async()=>{
 const s=setup();await s.c.connect(config(),new OutputEndpoint());s.c.arm();const old=s.source.value;
 s.source.value={...old,frame:{...old.frame,epoch:2,sequence:2},authorization:{...old.authorization,epoch:2,sourceFrameSequence:2}};
 s.c.refresh();s.c.arm();s.source.value={...old,faulted:true,foreground:false};s.c.refresh();assert.equal(s.c.status().armed,true);assert.equal(s.c.status().connection,'connected');await s.c.dispose();
});
test('disposed coordinator cannot reconnect and null authorization cannot arm',async()=>{
 const s=setup();await s.c.connect(config(),new OutputEndpoint());s.source.value.authorization=null;assert.equal(s.c.arm(),false);await s.c.dispose();assert.equal(await s.c.connect(config(),new OutputEndpoint()),false);
});
test('replacement is denied while old close remains unconfirmed',async()=>{
 const s=setup();await s.c.connect(config(),new OutputEndpoint());s.ports[0].rejectClose=true;assert.equal(await s.c.connect(config(),new OutputEndpoint()),false);assert.equal(s.ports.length,1);assert.equal(s.c.status().armed,false);await s.c.dispose();
});
test('coordinator passes only enabled target scope and rejects mismatched arm authorization',async()=>{
 const s=setup(),scopes=[];s.source.dispatchSource=function(scope){scopes.push(scope);return this.value;};
 const c=config();c.protocolProfile.axisOrder=['L0','R0'];c.axisRanges.push({axisId:'R0',minimum:0,maximum:1,enabled:false});
 await s.c.connect(c,new OutputEndpoint());assert.equal(s.c.arm(),true);assert.equal(s.c.refresh(),'accepted');assert.ok(scopes.length>=3);assert.ok(scopes.every(scope=>JSON.stringify(scope)==='["L0"]'));
 s.source.value.authorization={...s.source.value.authorization,authorizedAxes:['R0']};assert.equal(s.c.arm(),false);assert.equal(s.c.status().armed,false);await s.c.dispose();
});
test('null paused hold source clears arm and never turns numeric frame into fresh authorization',async()=>{
 const s=setup();await s.c.connect({...config(),allowPausedMotion:true},new OutputEndpoint());s.c.arm();s.c.refresh();
 s.source.value={...s.source.value,mediaState:'paused',authorization:null};assert.equal(s.c.refresh(),'ignored');assert.equal(s.c.status().armed,false);await s.time.advance(10);assert.equal(s.ports[0].writeRecords().length,0);await s.c.dispose();
});


test('native release predicate retains quarantined identity and close confirmation cannot ignore it',async()=>{
 const s=setup(),p=new MemoryTransport(s.time);Object.defineProperty(p,'simulationOnly',{value:false});let releasable=false;
 registerNativeTransport(p,'tcp',()=>releasable);
 assert.equal(releaseNativeTransport(p),false);assert.equal(isRegisteredNativeTransport(p,'tcp'),true);
 const session=new OutputSession({...config(),kind:'tcp'},policy,p,s.time,s.time);
 assert.equal(session.snapshot().closeConfirmed,false);assert.equal(await session.connect(),false);
 await session.dispose();assert.equal(isRegisteredNativeTransport(p,'tcp'),true);
 releasable=true;assert.equal(releaseNativeTransport(p),true);assert.equal(isRegisteredNativeTransport(p,'tcp'),false);
});

test('applied configuration identity is issued only by successful real connect and changes on replacement',async()=>{
 const s=setup();assert.equal(s.c.appliedConfigurationId(),0);await s.c.connect(config(),new OutputEndpoint());const first=s.c.appliedConfigurationId();assert.ok(first>0);
 await s.c.disconnect();assert.equal(s.c.appliedConfigurationId(),0);await s.c.connect(config(),new OutputEndpoint());assert.ok(s.c.appliedConfigurationId()>first);assert.equal(s.c.status().armed,false);await s.c.dispose();assert.equal(s.c.appliedConfigurationId(),0);
});

for (const revoke of ['disconnect','backgroundReturn','disarm','stop','dispose']) {
 test(`replacement close suspension cannot resume Connect after ${revoke}`,async()=>{
  const s=setup();await s.c.connect(config(),new OutputEndpoint());const first=s.c.appliedConfigurationId();
  let finish;const port=s.ports[0],close=port.close.bind(port);port.close=(reason,generation)=>new Promise(resolve=>{finish=()=>close(reason,generation).then(resolve);});
  const replacing=s.c.connect(config(),new OutputEndpoint());await settle();assert.equal(s.c.isBusy(),true);
  if(revoke==='backgroundReturn'){s.c.setForeground(false);s.c.setForeground(true);}else if(revoke==='disconnect'||revoke==='dispose'){void s.c[revoke]();}else{s.c[revoke]();}
  finish();assert.equal(await replacing,false);await settle();assert.equal(s.ports.length,1);assert.equal(s.c.appliedConfigurationId(),0);assert.equal(s.c.status().armed,false);assert.equal(s.c.status().connection,'disconnected');
  port.close=close;
  if(revoke!=='dispose'){assert.equal(await s.c.connect(config(),new OutputEndpoint()),true);assert.ok(s.c.appliedConfigurationId()>first);assert.equal(s.c.status().armed,false);}
  await s.c.dispose();
 });
 test(`late first open cannot assign an application identity after ${revoke}`,async()=>{
  const s=setup();const original=s.c.factory.create;s.c.factory.create=()=>{const p=original();p.deferOpen=true;return p;};
  const opening=s.c.connect(config(),new OutputEndpoint());assert.equal(s.ports.length,1);
  if(revoke==='backgroundReturn'){s.c.setForeground(false);s.c.setForeground(true);}else if(revoke==='disconnect'||revoke==='dispose'){void s.c[revoke]();}else{s.c[revoke]();}
  s.ports[0].resolveNextOpen();assert.equal(await opening,false);assert.equal(s.c.appliedConfigurationId(),0);assert.equal(s.c.status().armed,false);assert.equal(s.c.status().connection,'disconnected');await s.c.dispose();
 });
}

test('coordinator forwards fixed paused Manual authorization only after explicit connect and Arm',async()=>{
 const s=setup();s.source.value={...s.source.value,mediaState:'paused',authorization:{...s.source.value.authorization,intents:['pausedManual'],clockKind:'monotonic'}};
 assert.equal(await s.c.connect({...config(),allowPausedManual:true},new OutputEndpoint()),true);
 assert.equal(s.c.status().armed,false);assert.equal(s.c.refresh(),'ignored');await s.time.advance(10);assert.equal(s.ports[0].writeRecords().length,0);
 assert.equal(s.c.arm(),true);assert.equal(s.c.refresh(),'accepted');await s.time.advance(10);assert.equal(s.ports[0].writeRecords().length,1);
 assert.equal(s.c.configuration().allowPausedManual,true);assert.equal(s.c.configuration().allowPausedMotion,false);
 s.source.value={...s.source.value,authorization:null};s.c.refresh();assert.equal(s.c.status().armed,false);await s.c.dispose();
});

test('coordinator normalizes missing additive Manual permission and never derives it from Motion',async()=>{
 const s=setup(),c={...config(),allowPausedMotion:true};delete c.allowPausedManual;
 s.source.value={...s.source.value,mediaState:'paused',authorization:{...s.source.value.authorization,intents:['pausedManual'],clockKind:'monotonic'}};
 assert.equal(await s.c.connect(c,new OutputEndpoint()),true);assert.equal(s.c.configuration().allowPausedManual,false);
 assert.equal(s.c.arm(),false);assert.equal(s.c.refresh(),'ignored');await s.time.advance(10);assert.equal(s.ports[0].writeRecords().length,0);await s.c.dispose();
});

function manualPreview(s, updates={}) {
 const previous=s.source.value;
 s.source.value={...previous,sourceIdentity:'manual-preview',sourceGeneration:7,mediaState:'paused',availability:'pendingCurrentFrame',authorization:null,
   manualPreviewAdmission:{epoch:previous.frame.epoch,profileRevision:previous.frame.profileRevision,admissionRevision:12,authorizedAxes:['L0']},...updates};
 return s.source.value;
}
function manualTransition(s, value=.75, options={}) {
 const previous=s.source.value,sequence=previous.frame.sequence+1,revision=options.sourceConfigurationRevision??20;
 s.source.value={...previous,availability:'ready',frame:{...previous.frame,sequence,monotonicMs:s.time.now,axisStates:[{axisName:'L0',value}],events:[]},
   authorization:{epoch:previous.frame.epoch,sourceFrameSequence:sequence,sourceConfigurationRevision:revision,updateKind:'fixed',authorizedAxes:['L0'],intents:['pausedManual'],clockKind:'monotonic',observedMonotonicMs:s.time.now,...options.authorization}};
}
async function manualWaiting(options={}) {
 const s=setup();manualPreview(s,options.source??{});assert.equal(await s.c.connect({...config(),allowPausedManual:true,...options.config},new OutputEndpoint()),true);
 return s;
}

test('explicit Manual Arm-wait admits duration-zero one-frame window then returns to held waiting without output replay',async()=>{
 const s=await manualWaiting();assert.equal(s.c.refresh(),'ignored');assert.equal(s.c.status().armed,false);
 assert.equal(s.c.arm(),true);assert.equal(s.c.status().armed,true);assert.equal(s.c.status().dispatchSuspended,true);
 assert.equal(s.c.refresh(),'ignored');await s.time.advance(10);assert.equal(s.ports[0].writeRecords().length,0);
 manualTransition(s,.75);assert.equal(s.c.refresh(),'accepted');assert.equal(s.c.status().dispatchSuspended,false);
 await s.time.advance(10);assert.equal(s.ports[0].writeRecords().length,1);
 const transitionSequence=s.source.value.frame.sequence;manualPreview(s);s.source.value.frame={...s.source.value.frame,sequence:transitionSequence+1,monotonicMs:s.time.now};
 assert.equal(s.c.refresh(),'ignored');assert.equal(s.c.status().armed,true);assert.equal(s.c.status().dispatchSuspended,true);
 await s.time.advance(20);assert.equal(s.ports[0].writeRecords().length,1);
 manualTransition(s,.25,{sourceConfigurationRevision:21});assert.equal(s.c.refresh(),'accepted');await s.time.advance(10);assert.equal(s.ports[0].writeRecords().length,2);
 await s.c.dispose();
});

test('initial unknown scalar with separate healthy preview admission keeps Arm-wait inert until genuine transition',async()=>{
 const s=await manualWaiting();s.source.value.frame.axisStates[0].value=NaN;
 assert.equal(s.c.arm(),true);assert.equal(s.c.status().dispatchSuspended,true);s.c.refresh();await s.time.advance(20);assert.equal(s.ports[0].writeRecords().length,0);
 manualTransition(s,.8);assert.equal(s.c.refresh(),'accepted');await s.time.advance(10);assert.equal(s.ports[0].writeRecords().length,1);await s.c.dispose();
});

for(const negative of ['missing-admission','null-admission','permission','polled','playing','stopped','background','fault','invalidated','epoch','profile','empty-scope','extra-scope','duplicate-scope','negative-revision','missing-identity','missing-generation'])
 test('explicit Arm cannot save manual waiting intent with '+negative,async()=>{
  const s=await manualWaiting();
  if(negative==='missing-admission')delete s.source.value.manualPreviewAdmission;
  if(negative==='null-admission')s.source.value.manualPreviewAdmission=null;
  if(negative==='permission')await s.c.connect({...config(),allowPausedManual:false,allowPausedMotion:true,allowPausedAutoHome:true},new OutputEndpoint());
  if(negative==='polled')await s.c.connect({...config(),allowPausedManual:true,updateContext:{kind:'polled'}},new OutputEndpoint());
  if(negative==='playing'||negative==='stopped')s.source.value.mediaState=negative;
  if(negative==='background')s.source.value.foreground=false;
  if(negative==='fault')s.source.value.faulted=true;
  if(negative==='invalidated')s.source.value.availability='invalidated';
  if(negative==='epoch')s.source.value.manualPreviewAdmission.epoch++;
  if(negative==='profile')s.source.value.manualPreviewAdmission.profileRevision++;
  if(negative==='empty-scope')s.source.value.manualPreviewAdmission.authorizedAxes=[];
  if(negative==='extra-scope')s.source.value.manualPreviewAdmission.authorizedAxes=['L0','R0'];
  if(negative==='duplicate-scope')s.source.value.manualPreviewAdmission.authorizedAxes=['L0','L0'];
  if(negative==='negative-revision')s.source.value.manualPreviewAdmission.admissionRevision=-1;
  if(negative==='missing-identity')delete s.source.value.sourceIdentity;
  if(negative==='missing-generation')delete s.source.value.sourceGeneration;
  assert.equal(s.c.arm(),false);assert.equal(s.c.status().armed,false);await s.time.advance(10);assert.equal(s.ports.every(p=>p.writeRecords().length===0),true);await s.c.dispose();
 });

for(const revoke of ['stop','disarm','disconnect','background','seek','preview-ended','admission-revision','epoch','profile','scope','source-identity','source-generation','source-error','invalidated','media-state'])
 test('saved Manual Arm-wait is revoked by '+revoke+' and Set cannot reconstruct it',async()=>{
  const s=await manualWaiting();assert.equal(s.c.arm(),true);const original=structuredClone(s.source.value);
  if(revoke==='stop'||revoke==='disarm'||revoke==='disconnect')await s.c[revoke]();
  if(revoke==='background'){s.c.setForeground(false);s.c.setForeground(true);}
  if(revoke==='seek')assert.equal(s.c.beginSourceSeek(),false);
  if(revoke==='preview-ended')s.source.value.manualPreviewAdmission=null;
  if(revoke==='admission-revision')s.source.value.manualPreviewAdmission.admissionRevision++;
  if(revoke==='epoch'){s.source.value.manualPreviewAdmission.epoch++;s.source.value.frame.epoch++;}
  if(revoke==='profile'){s.source.value.manualPreviewAdmission.profileRevision++;s.source.value.frame.profileRevision++;}
  if(revoke==='scope')s.source.value.manualPreviewAdmission.authorizedAxes=['R0'];
  if(revoke==='source-identity')s.source.value.sourceIdentity='other-preview';
  if(revoke==='source-generation')s.source.value.sourceGeneration++;
  if(revoke==='source-error')s.source.value.faulted=true;
  if(revoke==='invalidated')s.source.value.availability='invalidated';
  if(revoke==='media-state')s.source.value.mediaState='playing';
  s.c.refresh();assert.equal(s.c.status().armed,false,revoke);s.source.value=original;manualTransition(s,.9);s.c.refresh();await s.time.advance(10);
  assert.equal(s.c.status().armed,false);assert.equal(s.ports[0].writeRecords().length,0);await s.c.dispose();
 });

for(const replacement of ['permission','scope','mode'])test('replacing target '+replacement+' never transfers manual wait arm',async()=>{
 const s=await manualWaiting();assert.equal(s.c.arm(),true);const c={...config(),allowPausedManual:true};
 if(replacement==='permission')c.allowPausedManual=false;if(replacement==='scope')c.axisRanges[0].enabled=false;if(replacement==='mode')c.updateContext={kind:'polled'};
 assert.equal(await s.c.connect(c,new OutputEndpoint()),true);assert.equal(s.c.status().armed,false);manualTransition(s);s.c.refresh();await s.time.advance(10);
 assert.ok(s.ports.every(p=>p.writeRecords().length===0));await s.c.dispose();
});

for(const intent of ['activePlayback','pausedMotion','pausedAutoHome'])test('manual waiting cannot be opened by '+intent+' authorization',async()=>{
 const s=await manualWaiting({config:{allowPausedMotion:true,allowPausedAutoHome:true}});assert.equal(s.c.arm(),true);
 manualTransition(s,.8,{authorization:{intents:[intent],clockKind:intent==='activePlayback'?'media':'monotonic'}});
 assert.equal(s.c.refresh(),'ignored');assert.equal(s.c.status().armed,false);await s.time.advance(10);assert.equal(s.ports[0].writeRecords().length,0);await s.c.dispose();
});

for(const allowed of [false,true])test('manual waiting keeps existing per-intent checks for mixed paused Motion: '+allowed,async()=>{
 const s=await manualWaiting({config:{allowPausedMotion:allowed}});assert.equal(s.c.arm(),true);
 manualTransition(s,.8,{authorization:{intents:['pausedManual','pausedMotion']}});
 assert.equal(s.c.refresh(),allowed?'accepted':'ignored');await s.time.advance(10);assert.equal(s.ports[0].writeRecords().length,allowed?1:0);await s.c.dispose();
});

test('manual admission is detached from mutable source arrays and revision objects',async()=>{
 const s=await manualWaiting();const admission=s.source.value.manualPreviewAdmission;assert.equal(s.c.arm(),true);
 admission.admissionRevision++;s.c.refresh();assert.equal(s.c.status().armed,false);assert.equal(s.ports[0].writeRecords().length,0);await s.c.dispose();
});

test('late full receipt from finished Manual transition cannot cache or replay through held waiting',async()=>{
 const s=await manualWaiting();assert.equal(s.c.arm(),true);s.ports[0].planWrite({kind:'defer'});manualTransition(s,.2);s.c.refresh();await s.time.advance(10);
 assert.equal(s.ports[0].writeRecords().length,1);manualPreview(s);s.c.refresh();assert.equal(s.c.status().armed,true);assert.equal(s.c.status().dispatchSuspended,true);
 s.ports[0].resolveNextWrite();await settle();assert.equal(s.c.status().completedLocalWrites,0);assert.deepEqual(s.c.status().lastWritten,[]);
 await s.time.advance(10);assert.equal(s.ports[0].writeRecords().length,1);manualTransition(s,.8,{sourceConfigurationRevision:21});s.c.refresh();await s.time.advance(10);
 assert.equal(s.ports[0].writeRecords().length,2);assert.equal(s.c.status().completedLocalWrites,1);await s.c.dispose();
});

test('late partial receipt after manual hold faults and cannot reconstruct wait intent on next Set',async()=>{
 const s=await manualWaiting();assert.equal(s.c.arm(),true);s.ports[0].planWrite({kind:'defer'});manualTransition(s,.2);s.c.refresh();await s.time.advance(10);
 manualPreview(s);s.c.refresh();s.ports[0].resolveNextWrite(3);await settle();assert.equal(s.c.status().armed,false);assert.equal(s.c.status().connection,'fault');
 manualTransition(s,.8,{sourceConfigurationRevision:21});s.c.refresh();await s.time.advance(10);assert.equal(s.ports[0].writeRecords().length,1);await s.c.dispose();
});

test('one real manual frame repeatedly refreshed remains admitted but never replays after pending hold',async()=>{
 const s=await manualWaiting();assert.equal(s.c.arm(),true);manualTransition(s,.2);assert.equal(s.c.refresh(),'accepted');assert.equal(s.c.refresh(),'ignored');assert.equal(s.c.status().armed,true);
 await s.time.advance(10);assert.equal(s.ports[0].writeRecords().length,1);const frame=s.source.value;manualPreview(s);s.c.refresh();
 s.source.value=frame;assert.equal(s.c.refresh(),'ignored');await s.time.advance(10);assert.equal(s.ports[0].writeRecords().length,1);await s.c.dispose();
});

for(const negative of ['permission','polled','null-admission','stale-admission'])test('READY pausedManual cannot bypass explicit Arm conditions via '+negative,async()=>{
 const s=await manualWaiting();manualTransition(s);
 if(negative==='permission')await s.c.connect({...config(),allowPausedManual:false},new OutputEndpoint());
 if(negative==='polled'){await s.c.connect({...config(),allowPausedManual:true,updateContext:{kind:'polled'}},new OutputEndpoint());s.source.value.authorization.updateKind='polled';}
 if(negative==='null-admission')s.source.value.manualPreviewAdmission=null;
 if(negative==='stale-admission')s.source.value.manualPreviewAdmission.epoch++;
 assert.equal(s.c.arm(),false);assert.equal(s.c.status().armed,false);s.c.refresh();await s.time.advance(10);assert.ok(s.ports.every(p=>p.writeRecords().length===0));await s.c.dispose();
});
