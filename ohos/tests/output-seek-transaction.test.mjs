import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);}});
const {OutputCoordinator,OutputEndpoint}=await import('../entry/src/main/ets/output/OutputCoordinator.ts');
const {MemoryTransport}=await import('../entry/src/main/ets/output/MemoryTransport.ts');
const {defaultFixedContext}=await import('../entry/src/main/ets/output/UpdateContext.ts');
const settle=async()=>{for(let n=0;n<32;n++)await Promise.resolve();};
class Time {
  now=0;next=1;tasks=new Map();
  nowMs(){return this.now;}
  scheduleAt(at,fn){const id=this.next++;this.tasks.set(id,{at,fn});return id;}
  cancel(id){this.tasks.delete(id);}
  async advance(ms){const target=this.now+ms;while(true){const next=[...this.tasks].filter(([,v])=>v.at<=target).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];if(!next)break;this.now=next[1].at;this.tasks.delete(next[0]);next[1].fn();await settle();}this.now=target;await settle();}
}
const profile={precision:4,revision:1,axisOrder:['L0'],maximumDurationMs:10000,maximumPayloadBytes:1024};
const config=kind=>({targetId:'seek-simulation',kind:'memory',protocolProfile:profile,axisRanges:[{axisId:'L0',minimum:0,maximum:1,enabled:true}],updateContext:kind==='fixed'?defaultFixedContext():{kind:'polled'},autoConnectPolicy:'manual',allowPausedAutoHome:false,allowPausedMotion:false});
const policy={maximumFrameAgeMs:200,maximumClockAgeMs:200,maximumEventAgeMs:100,maximumFixedElapsedMs:1000,writeTimeoutMs:100,maximumPolledQueueLength:4,allowZeroInterval:true};
function frame(s,epoch=1,value=.5){const sequence=++s.sequence;return {sequence,epoch,profileRevision:1,monotonicMs:s.time.now,mediaPositionMs:500,axisStates:[{axisName:'L0',value}],events:s.kind==='fixed'?[]:[{eventId:sequence,epoch,sourceFrameSequence:sequence,axisName:'L0',kind:'script',targetValue:value,durationSeconds:.1,from:null,to:null,speedLimitUnitsPerSecond:null}]};}
function ready(s,epoch=1,value=.5){const f=frame(s,epoch,value);s.source.value={...s.source.value,frame:f,authorization:{epoch,sourceFrameSequence:f.sequence,sourceConfigurationRevision:epoch,updateKind:s.kind,authorizedAxes:['L0'],intents:['activePlayback'],clockKind:'media',observedMonotonicMs:s.time.now},mediaState:'playing',availability:'ready'};}
async function setup(kind='fixed',armed=true){const s={time:new Time(),kind,sequence:0,source:{value:null,dispatchSource(){return this.value;}},ports:[]};s.source.value={sourceIdentity:'video:A',sourceGeneration:1,foreground:true,faulted:false};ready(s);s.c=new OutputCoordinator({inspect:()=>({available:true,diagnostic:''}),create:()=>{const p=new MemoryTransport(s.time);s.ports.push(p);return p;}},s.source,policy,s.time,s.time);assert.equal(await s.c.connect(config(kind),new OutputEndpoint()),true);if(armed)assert.equal(s.c.arm(),true);s.port=s.ports[0];return s;}
function pending(s,overrides={}){const t={requestId:1,sourceIdentity:'video:A',sourceGeneration:1,previousEpoch:1,currentEpoch:2,profileRevision:1,deadlineMonotonicMs:s.time.now+300,status:'pending',...overrides};s.source.value={...s.source.value,seekTransition:t,authorization:null,availability:'invalidated',mediaState:'paused'};return t;}
function confirmed(s,t,withFrame=true){s.source.value={...s.source.value,seekTransition:{...t,status:'confirmed'}};if(withFrame)ready(s,t.currentEpoch,.8);}
const bytes=p=>p.writeRecords().map(r=>String.fromCharCode(...r.bytes));

for(const kind of ['fixed','polled'])test(`${kind}: trusted seek immediately clears old candidates, preserves explicit intent, and requires confirmed current frame`,async()=>{
 const s=await setup(kind);s.port.planWrite({kind:'defer'});assert.equal(s.c.refresh(),'accepted');if(kind==='fixed')await s.time.advance(10);ready(s,1,.3);s.c.refresh();if(kind==='fixed')await s.time.advance(10);
 assert.equal(s.c.status().inFlight,true);assert.equal(kind==='fixed'?s.c.status().pendingFixed:s.c.status().queuedEvents>0,true);
 const t=pending(s);assert.equal(s.c.beginSourceSeek(),true);assert.equal(s.c.status().armed,true);assert.equal(s.c.status().seekPending,true);assert.equal(s.c.status().pendingFixed,false);assert.equal(s.c.status().queuedEvents,0);assert.equal(s.c.refresh(),'ignored');
 s.port.resolveNextWrite();await settle();assert.deepEqual(s.c.status().lastWritten,[]);assert.equal(s.c.status().completedLocalWrites,0);assert.equal(s.port.writeRecords().length,1);
 // A numerically plausible new frame cannot replace native seekDone confirmation.
 ready(s,2,.8);assert.equal(s.c.refresh(),'ignored');await s.time.advance(10);assert.equal(s.port.writeRecords().length,1);
 // Native confirmation alone still cannot relabel or send the old epoch frame.
 s.source.value={...s.source.value,frame:frame(s,1),authorization:null,availability:'pendingCurrentFrame'};confirmed(s,t,false);assert.equal(s.c.refresh(),'ignored');assert.equal(s.c.status().seekPending,true);
 ready(s,2,.8);assert.equal(s.c.refresh(),'accepted');if(kind==='fixed')await s.time.advance(10);await settle();assert.equal(s.c.status().seekPending,false);assert.equal(s.c.status().armed,true);assert.equal(s.port.writeRecords().length,2);assert.equal(s.port.writeRecords()[1].epoch,2);assert.equal(s.c.status().completedLocalWrites,1);assert.ok(bytes(s.port)[1].startsWith('L07999'));await s.c.dispose();
});

test('a seek without a prior arm never acquires one, including later confirmation and duplicate begin',async()=>{
 const s=await setup('fixed',false),t=pending(s);assert.equal(s.c.beginSourceSeek(),false);confirmed(s,t);assert.equal(s.c.refresh(),'ignored');assert.equal(s.c.status().armed,false);assert.equal(s.c.beginSourceSeek(),false);await s.time.advance(10);assert.equal(s.port.writeRecords().length,0);await s.c.dispose();
});

test('pending seek cannot be established by refresh or confirmed-only publication',async()=>{
 for(const start of ['refresh','confirmed']){const s=await setup(),t=pending(s);if(start==='refresh')s.c.refresh();else {confirmed(s,t);assert.equal(s.c.beginSourceSeek(),false);}confirmed(s,t);s.c.refresh();await s.time.advance(10);assert.equal(s.c.status().armed,false);assert.equal(s.port.writeRecords().length,0);await s.c.dispose();}
});

for(const kind of ['fixed','polled'])for(const revoke of ['stop','disarm','disconnect','background','source','generation','profile','fault','cancel','timeout'])test(`${kind}: ${revoke} permanently revokes pending seek intent`,async()=>{
 const s=await setup(kind),t=pending(s);assert.equal(s.c.beginSourceSeek(),true);
 if(revoke==='stop')s.c.stop();
 if(revoke==='disarm')s.c.disarm();
 if(revoke==='disconnect')await s.c.disconnect();
 if(revoke==='background'){s.c.setForeground(false);await settle();s.c.setForeground(true);}
 if(revoke==='source')s.source.value={...s.source.value,sourceIdentity:'video:B'};
 if(revoke==='generation')s.source.value={...s.source.value,sourceGeneration:2};
 if(revoke==='profile')s.source.value={...s.source.value,frame:{...s.source.value.frame,profileRevision:2}};
 if(revoke==='fault')s.source.value={...s.source.value,faulted:true};
 if(revoke==='cancel')s.source.value={...s.source.value,seekTransition:{...t,status:'cancelled'}};
 if(revoke==='timeout')await s.time.advance(300);
 else s.c.refresh();
 assert.equal(s.c.status().armed,false);assert.equal(s.c.status().seekPending,false);
 s.source.value={...s.source.value,sourceIdentity:'video:A',sourceGeneration:1,faulted:false};confirmed(s,t);s.c.refresh();await s.time.advance(10);assert.equal(s.c.status().armed,false);assert.equal(s.port.writeRecords().length,0);assert.equal(s.c.beginSourceSeek(),false);await s.c.dispose();
});

test('duplicate pending begin is idempotent and an old confirmation cannot complete a newer transaction',async()=>{
 const s=await setup(),first=pending(s);assert.equal(s.c.beginSourceSeek(),true);assert.equal(s.c.beginSourceSeek(),false);confirmed(s,first);assert.equal(s.c.refresh(),'accepted');
 const next=pending(s,{requestId:2,previousEpoch:2,currentEpoch:3});assert.equal(s.c.beginSourceSeek(),true);
 s.source.value={...s.source.value,seekTransition:{...first,status:'confirmed'}};assert.equal(s.c.refresh(),'ignored');assert.equal(s.c.status().seekPending,true);assert.equal(s.c.status().armed,true);
 confirmed(s,next);assert.equal(s.c.refresh(),'accepted');await s.time.advance(10);assert.equal(s.port.writeRecords().length,1);assert.equal(s.port.writeRecords()[0].epoch,3);await s.c.dispose();
});

test('mismatched confirmed identity, epoch, profile, deadline or token cannot resume',async()=>{
 for(const change of [{sourceIdentity:'video:B'},{sourceGeneration:2},{previousEpoch:0},{currentEpoch:1},{profileRevision:2},{deadlineMonotonicMs:301},{requestId:2}]){const s=await setup(),t=pending(s);assert.equal(s.c.beginSourceSeek(),true);confirmed(s,{...t,...change});s.c.refresh();await s.time.advance(10);assert.equal(s.c.status().armed,false,JSON.stringify(change));assert.equal(s.port.writeRecords().length,0);await s.c.dispose();}
});

test('confirmed frame must retain exact axis scope, update kind and source revision gate',async()=>{
 for(const change of [{authorizedAxes:['R0']},{updateKind:'polled'},{sourceConfigurationRevision:0}]){const s=await setup();s.c.refresh();const t=pending(s);assert.equal(s.c.beginSourceSeek(),true);confirmed(s,t);s.source.value.authorization={...s.source.value.authorization,...change};s.c.refresh();await s.time.advance(10);assert.equal(s.c.status().armed,false,JSON.stringify(change));assert.equal(s.port.writeRecords().length,0);await s.c.dispose();}
});

test('old stream receipt may account bytes but cannot commit cache or join a partial command to new seek output',async()=>{
 const s=await setup();s.port.planWrite({kind:'defer'});s.c.refresh();await s.time.advance(10);const t=pending(s);assert.equal(s.c.beginSourceSeek(),true);confirmed(s,t);s.c.refresh();s.port.resolveNextWrite(3);await settle();await s.time.advance(10);assert.equal(s.c.status().armed,false);assert.equal(s.c.status().connection,'fault');assert.equal(s.c.status().lastErrorCode,'transportError');assert.equal(s.c.status().completedLocalWrites,0);assert.deepEqual(s.c.status().lastWritten,[]);assert.equal(s.port.writeRecords().length,1);await s.c.dispose();
});

test('old unresolved write deadline still faults during seek and late full receipt cannot restore intent',async()=>{
 const s=await setup();s.port.planWrite({kind:'defer'});s.c.refresh();await s.time.advance(10);const t=pending(s);assert.equal(s.c.beginSourceSeek(),true);await s.time.advance(100);assert.equal(s.c.status().armed,false);assert.equal(s.c.status().seekPending,false);s.port.resolveNextWrite();await settle();confirmed(s,t);s.c.refresh();assert.equal(s.c.status().armed,false);assert.equal(s.port.writeRecords().length,1);await s.c.dispose();
});

test('native confirmation may advance the epoch again, but only its exact complete frame resumes',async()=>{
 const s=await setup(),t=pending(s);assert.equal(s.c.beginSourceSeek(),true);confirmed(s,{...t,currentEpoch:3},false);assert.equal(s.c.refresh(),'ignored');assert.equal(s.c.status().epoch,3);assert.equal(s.c.status().seekPending,true);
 ready(s,2);assert.equal(s.c.refresh(),'ignored');await s.time.advance(10);assert.equal(s.port.writeRecords().length,0);ready(s,3);assert.equal(s.c.refresh(),'accepted');await s.time.advance(10);assert.equal(s.port.writeRecords()[0].epoch,3);await s.c.dispose();
});

test('one request cannot change its confirmed epoch or regress back to pending',async()=>{
 for(const change of [{currentEpoch:4},{status:'pending'}]){const s=await setup(),t=pending(s);assert.equal(s.c.beginSourceSeek(),true);confirmed(s,{...t,currentEpoch:3},false);s.c.refresh();s.source.value={...s.source.value,seekTransition:{...t,currentEpoch:3,status:'confirmed',...change}};ready(s,change.currentEpoch??3);assert.equal(s.c.refresh(),'ignored');assert.equal(s.c.status().armed,false);assert.equal(s.port.writeRecords().length,0);await s.c.dispose();}
});

test('rapid explicit seeks replace the pending transaction and invalidate all older confirmations',async()=>{
 const s=await setup(),first=pending(s);assert.equal(s.c.beginSourceSeek(),true);const next=pending(s,{requestId:2,previousEpoch:2,currentEpoch:3});assert.equal(s.c.beginSourceSeek(),true);
 confirmed(s,first);assert.equal(s.c.refresh(),'ignored');assert.equal(s.c.status().armed,true);assert.equal(s.c.status().seekPending,true);confirmed(s,next);assert.equal(s.c.refresh(),'accepted');await s.time.advance(10);assert.equal(s.port.writeRecords().length,1);assert.equal(s.port.writeRecords()[0].epoch,3);await s.c.dispose();
});

test('a new explicit seek can replace a confirmed transaction still awaiting its new frame',async()=>{
 const s=await setup(),first=pending(s);assert.equal(s.c.beginSourceSeek(),true);confirmed(s,{...first,currentEpoch:3},false);s.c.refresh();const next=pending(s,{requestId:2,previousEpoch:3,currentEpoch:4});assert.equal(s.c.beginSourceSeek(),true);confirmed(s,next);assert.equal(s.c.refresh(),'accepted');await s.time.advance(10);assert.equal(s.port.writeRecords()[0].epoch,4);await s.c.dispose();
});

test('confirmation without a complete frame cannot extend the original deadline',async()=>{
 const s=await setup(),t=pending(s);assert.equal(s.c.beginSourceSeek(),true);confirmed(s,{...t,currentEpoch:3},false);s.c.refresh();await s.time.advance(300);assert.equal(s.c.status().armed,false);assert.equal(s.c.status().seekPending,false);ready(s,3);s.c.refresh();assert.equal(s.c.status().armed,false);
 // After expiry a new user arm remains possible on the now-current valid frame.
 assert.equal(s.c.arm(),true);assert.equal(s.c.refresh(),'accepted');await s.time.advance(10);assert.equal(s.port.writeRecords().length,1);await s.c.dispose();
});

test('same epoch source replacement and legacy unbound arms cannot become trusted seek handoffs',async()=>{
 for(const missing of ['sourceIdentity','sourceGeneration']){const s=await setup();s.c.disarm();delete s.source.value[missing];assert.equal(s.c.arm(),true);const t=pending(s);s.source.value={...s.source.value,sourceIdentity:'video:A',sourceGeneration:1};assert.equal(s.c.beginSourceSeek(),false);confirmed(s,t);s.c.refresh();assert.equal(s.c.status().armed,false);await s.c.dispose();}
 const s=await setup();s.source.value={...s.source.value,sourceIdentity:'video:B'};s.c.refresh();assert.equal(s.c.status().armed,false);await s.c.dispose();
});

test('a delayed timeout callback cannot preserve already-expired intent through a newer seek',async()=>{
 const s=await setup(),first=pending(s);assert.equal(s.c.beginSourceSeek(),true);s.time.now=301;const next=pending(s,{requestId:2,previousEpoch:2,currentEpoch:3});assert.equal(s.c.beginSourceSeek(),false);assert.equal(s.c.status().armed,false);confirmed(s,next);s.c.refresh();await s.time.advance(10);assert.equal(s.port.writeRecords().length,0);await s.c.dispose();
});

test('reused consumed request cannot leave previous fixed candidate sending during a rejected new seek',async()=>{
 const s=await setup(),first=pending(s);assert.equal(s.c.beginSourceSeek(),true);confirmed(s,first);assert.equal(s.c.refresh(),'accepted');const replay=pending(s,{previousEpoch:2,currentEpoch:3});assert.equal(s.c.beginSourceSeek(),false);assert.equal(s.c.status().armed,false);await s.time.advance(10);assert.equal(s.port.writeRecords().length,0);confirmed(s,replay);s.c.refresh();assert.equal(s.c.status().armed,false);await s.c.dispose();
});

test('duplicate begin is not a way to ignore expiry, background or a changed source binding',async()=>{
 for(const invalid of ['time','source','foreground','token']){const s=await setup(),t=pending(s);assert.equal(s.c.beginSourceSeek(),true);if(invalid==='time')s.time.now=300;if(invalid==='source')s.source.value.sourceIdentity='video:B';if(invalid==='foreground')s.source.value.foreground=false;if(invalid==='token')s.source.value.seekTransition={...t,deadlineMonotonicMs:400};assert.equal(s.c.beginSourceSeek(),false);assert.equal(s.c.status().armed,false,invalid);await s.c.dispose();}
});

for(const kind of ['fixed','polled'])test(`${kind}: overdue old receipt cannot cancel a delayed deadline timer and pump a new epoch`,async()=>{
 const s=await setup(kind);s.port.planWrite({kind:'defer'});s.c.refresh();if(kind==='fixed')await s.time.advance(10);const t=pending(s);assert.equal(s.c.beginSourceSeek(),true);s.time.now=121;confirmed(s,t);s.c.refresh();s.port.resolveNextWrite();await settle();assert.equal(s.c.status().armed,false);assert.equal(s.c.status().lastErrorCode,'writeExpired');assert.equal(s.c.status().connection,'fault');assert.equal(s.c.status().completedLocalWrites,0);assert.equal(s.port.writeRecords().length,1);await s.c.dispose();
});

test('an Arm attempt observing uncaptured pending seek clears any previous candidate',async()=>{
 const s=await setup();s.c.refresh();pending(s);assert.equal(s.c.arm(),false);assert.equal(s.c.status().armed,false);await s.time.advance(10);assert.equal(s.port.writeRecords().length,0);await s.c.dispose();
});
