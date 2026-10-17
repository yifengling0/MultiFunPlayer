import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);}});
const { OutputSession }=await import('../entry/src/main/ets/output/OutputSession.ts');
const { MemoryTransport }=await import('../entry/src/main/ets/output/MemoryTransport.ts');
const { defaultFixedContext }=await import('../entry/src/main/ets/output/UpdateContext.ts');
const { NATIVE_NETWORK_ADAPTER_IMPLEMENTATIONS_AVAILABLE }=await import('../entry/src/main/ets/output/TransportPort.ts');
const settle=async()=>{for(let i=0;i<24;i++)await Promise.resolve();};
class VirtualTime {
  now=0;next=1;tasks=new Map();
  nowMs(){return this.now;}
  scheduleAt(at,callback){const id=this.next++;this.tasks.set(id,{at,callback});return id;}
  cancel(id){this.tasks.delete(id);}
  async advanceTo(target){
    while(true){const next=[...this.tasks].filter(([,x])=>x.at<=target).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];if(!next)break;
      this.now=next[1].at;this.tasks.delete(next[0]);next[1].callback();await settle();}
    this.now=target;await settle();
  }
  async advance(delta){await this.advanceTo(this.now+delta);}
  async wakeLate(now){this.now=now;const due=[...this.tasks].filter(([,x])=>x.at<=now).sort((a,b)=>a[1].at-b[1].at);for(const[id,item]of due){if(this.tasks.delete(id))item.callback();}await settle();}
}
const config=(kind='fixed')=>({targetId:'sim-one',kind:'memory',protocolProfile:{precision:4,revision:1,axisOrder:['L0'],maximumDurationMs:10000,maximumPayloadBytes:1024},axisRanges:[{axisId:'L0',minimum:0,maximum:1,enabled:true}],updateContext:kind==='fixed'?defaultFixedContext():{kind:'polled'},autoConnectPolicy:'manual',allowPausedAutoHome:false,allowPausedMotion:false});
const policy=()=>({maximumFrameAgeMs:200,maximumClockAgeMs:200,maximumEventAgeMs:100,maximumFixedElapsedMs:1000,writeTimeoutMs:100,maximumPolledQueueLength:4,allowZeroInterval:true});
async function setup(kind='fixed',options={}){
  const time=options.time??new VirtualTime(),transport=new MemoryTransport(time,options.semantics??'stream');
  const cfg=options.config??config(kind),session=new OutputSession(cfg,options.policy??policy(),transport,time,time);
  assert.equal(await session.connect(),true);session.setMediaState('playing');assert.equal(session.arm(0,cfg.protocolProfile.revision),true);
  return {time,transport,session,updateKind:kind,enabledAxes:cfg.axisRanges.filter(x=>x.enabled).map(x=>x.axisId),sequence:0,eventId:0};
}
function push(s,value=.5,options={}){
  const sequence=options.sequence??++s.sequence,epoch=options.epoch??s.session.snapshot().epoch;
  const events=options.events??[];
  const frame={sequence,epoch,profileRevision:options.revision??s.session.snapshot().profileRevision,monotonicMs:options.stamp??s.time.now,
    mediaPositionMs:options.mediaPositionMs??99999,values:options.values??[{axisId:'L0',value}],events};
  const intents=options.intents??['activePlayback'];
  const authorization={epoch,sourceFrameSequence:sequence,updateKind:options.updateKind??s.updateKind,sourceConfigurationRevision:options.sourceConfigurationRevision??0,authorizedAxes:options.authorizedAxes??s.enabledAxes,intents,clockKind:options.clockKind??(intents[0]==='activePlayback'?'media':'monotonic'),observedMonotonicMs:options.observed??s.time.now};
  return s.session.submitFrame(frame,authorization);
}
function pushEvent(s,value=.5,options={}){
  const sequence=options.sequence??s.sequence+1,epoch=options.epoch??s.session.snapshot().epoch;
  const ev={eventId:options.eventId??++s.eventId,epoch,sourceFrameSequence:sequence,axisId:options.axisId??'L0',kind:options.eventKind??'script',targetValue:value,durationSeconds:options.duration??.125,from:null,to:null};
  return push(s,0,{...options,events:[ev]});
}
const text=record=>String.fromCharCode(...record.bytes);

test('adapter implementations do not imply registered port, automatic connect, restored arm, or implicit first write',async()=>{
  assert.equal(NATIVE_NETWORK_ADAPTER_IMPLEMENTATIONS_AVAILABLE,true);
  const time=new VirtualTime(),port=new MemoryTransport(time),cfg=config();
  const session=new OutputSession(cfg,policy(),port,time,time);
  assert.equal(port.openRecords().length,0);assert.equal(session.arm(0,1),false);
  assert.equal(await session.connect(),true);assert.equal(session.snapshot().armed,false);
  assert.equal(port.writeRecords().length,0);
  assert.throws(()=>new OutputSession({...cfg,kind:'tcp'},policy(),port,time,time),e=>e.code==='physicalTransportUnavailable');
});
test('fixed sends use scheduler elapsed rather than media time/engine delta, cache commits after acceptance',async()=>{
  const s=await setup();s.transport.planWrite({kind:'defer'});push(s,.25,{mediaPositionMs:900000});
  await s.time.advance(10);assert.equal(text(s.transport.writeRecords()[0]),'L02500I10\n');
  assert.deepEqual(s.session.snapshot().lastWritten,[]);assert.equal(s.session.snapshot().completedLocalWrites,0);
  s.transport.resolveNextWrite();await settle();assert.deepEqual(s.session.snapshot().lastWritten,[{axisId:'L0',value:.25}]);
  assert.equal(s.session.snapshot().completedLocalWrites,1);await s.time.advance(10);assert.equal(s.transport.writeRecords().length,1);
});
test('single in-flight plus one latest fixed candidate coalesces backlog, no stale burst',async()=>{
  const s=await setup();s.transport.planWrite({kind:'defer'});push(s,.1);await s.time.advance(10);
  push(s,.2);await s.time.advance(10);push(s,.3);await s.time.advance(10);push(s,.4);await s.time.advance(10);
  assert.equal(s.transport.writeRecords().length,1);assert.equal(s.session.snapshot().pendingFixed,true);assert.equal(s.session.snapshot().coalescedFixed,2);
  s.transport.resolveNextWrite();await settle();assert.equal(s.transport.writeRecords().length,2);assert.equal(text(s.transport.writeRecords()[1]),'L04000I10\n');
  assert.deepEqual(s.session.snapshot().lastWritten,[{axisId:'L0',value:.4}]);
});
test('stream short write resumes only remaining bytes, never the full frame',async()=>{
  const s=await setup();s.transport.planWrite({kind:'accept',acceptedBytes:3});s.transport.planWrite({kind:'accept',acceptedBytes:2});
  push(s,.5);await s.time.advance(10);
  const rows=s.transport.writeRecords();assert.deepEqual(rows.map(text),['L05000I10\n','000I10\n','0I10\n']);
  assert.equal(s.session.snapshot().completedLocalWrites,1);assert.equal(s.session.snapshot().locallyAcceptedBytes,10);
});
test('message short write faults with no retry or cache mutation',async()=>{
  const s=await setup('fixed',{semantics:'message'});s.transport.planWrite({kind:'accept',acceptedBytes:2});push(s,.5);await s.time.advance(10);
  assert.equal(s.session.snapshot().lastErrorCode,'shortMessageWrite');assert.equal(s.session.snapshot().armed,false);
  assert.equal(s.transport.writeRecords().length,1);assert.deepEqual(s.session.snapshot().lastWritten,[]);
});
test('zero progress, unknown write failure, invalid receipt and hung write all fail closed',async()=>{
  for(const plan of [{kind:'accept',acceptedBytes:0},{kind:'accept',acceptedBytes:10000},{kind:'accept',receiptGeneration:99},{kind:'reject'},{kind:'defer'}]) {
    const s=await setup();s.transport.planWrite(plan);push(s,.5);await s.time.advance(10);
    if(plan.kind==='defer') await s.time.advanceTo(110);
    assert.equal(s.session.snapshot().armed,false,JSON.stringify(plan));assert.equal(s.transport.writeRecords().length,1);
    assert.equal(s.session.snapshot().completedLocalWrites,0);assert.deepEqual(s.session.snapshot().lastWritten,[]);
  }
});
test('polled retains upstream target and original duration, independent of final fixed value',async()=>{
  const s=await setup('polled');pushEvent(s,.75,{duration:.12325});await settle();
  assert.equal(text(s.transport.writeRecords()[0]),'L07499I124\n');assert.equal(s.session.snapshot().completedLocalWrites,1);
});
test('bounded polled queue overflows to disarm, never replays the backlog',async()=>{
  const s=await setup('polled',{policy:{...policy(),maximumPolledQueueLength:2}});s.transport.planWrite({kind:'defer'});
  pushEvent(s,.1);pushEvent(s,.2);pushEvent(s,.3);assert.equal(s.session.snapshot().queuedEvents,2);
  assert.equal(pushEvent(s,.4),'rejected');await settle();assert.equal(s.session.snapshot().lastErrorCode,'queueOverflow');
  assert.equal(s.session.snapshot().armed,false);assert.equal(s.session.snapshot().queuedEvents,0);s.transport.resolveNextWrite();await settle();assert.equal(s.transport.writeRecords().length,1);
});
test('expired queued event is dropped instead of replayed after a busy write',async()=>{
  const s=await setup('polled',{policy:{...policy(),maximumEventAgeMs:30}});await s.time.advanceTo(20);
  s.transport.planWrite({kind:'defer'});pushEvent(s,.1,{stamp:20});pushEvent(s,.9,{stamp:0});
  await s.time.advanceTo(35);s.transport.resolveNextWrite();await settle();
  assert.equal(s.transport.writeRecords().length,1);assert.equal(s.session.snapshot().droppedExpired,1);assert.equal(s.session.snapshot().armed,true);
});
test('event cursors are per session; duplicate frames/events do not steal or replay other consumers',async()=>{
  const time=new VirtualTime();const a=await setup('polled',{time}),b=await setup('polled',{time,config:{...config('polled'),targetId:'second'}});
  pushEvent(a,.6,{eventId:10});pushEvent(b,.6,{eventId:10});await settle();
  pushEvent(a,.6,{sequence:1,eventId:10});pushEvent(a,.6,{eventId:10});await settle();
  assert.equal(a.transport.writeRecords().length,1);assert.equal(b.transport.writeRecords().length,1);
});
test('invalid event target/duration or missing fixed axis disarms instead of producing default motion',async()=>{
  for(const [kind,bad] of [['polled','target'],['polled','duration'],['fixed','missing'],['fixed','NaN']]) {
    const s=await setup(kind);
    const result=kind==='polled'?pushEvent(s,bad==='target'?NaN:.5,{duration:bad==='duration'?-1:.1}):push(s,bad==='NaN'?NaN:.5,{values:bad==='missing'?[]:undefined});
    assert.equal(result,'rejected');await settle();assert.equal(s.session.snapshot().armed,false);assert.equal(s.transport.writeRecords().length,0);
  }
});
test('default Pause gates script and paused motion while preserving explicit arm',async()=>{
  const s=await setup();push(s);await s.time.advance(10);s.session.pause();
  assert.equal(s.session.snapshot().armed,true);assert.equal(push(s,.8),'ignored');
  assert.equal(push(s,.8,{intents:['pausedMotion']}),'ignored');await s.time.advance(20);assert.equal(s.transport.writeRecords().length,1);
});
test('explicit paused Motion may use monotonic frames without media advancement; mixed sources fail closed',async()=>{
  const s=await setup('fixed',{config:{...config(),allowPausedMotion:true,allowPausedAutoHome:true}});s.session.pause();
  assert.equal(push(s,.2,{intents:['pausedMotion'],mediaPositionMs:NaN}),'accepted');await s.time.advance(10);
  assert.equal(text(s.transport.writeRecords()[0]),'L02000I10\n');
  assert.equal(push(s,.8,{intents:['pausedMotion','activePlayback']}),'ignored');await s.time.advance(10);assert.equal(s.transport.writeRecords().length,1);
  s.session.stop();s.session.setMediaState('paused');assert.equal(push(s,.8,{intents:['pausedMotion']}),'ignored');assert.equal(s.session.snapshot().armed,false);
});
test('explicit paused AutoHome accepts genuine home events, never relabels script events',async()=>{
  const s=await setup('polled',{config:{...config('polled'),allowPausedAutoHome:true}});s.session.pause();
  assert.equal(pushEvent(s,.3,{intents:['pausedAutoHome'],eventKind:'script'}),'accepted');await settle();assert.equal(s.transport.writeRecords().length,0);
  pushEvent(s,.7,{intents:['pausedAutoHome'],eventKind:'autoHome'});await settle();assert.equal(text(s.transport.writeRecords()[0]),'L06999I125\n');
});
test('Stop, disarm, background, disconnect and source invalidation discard queues and cannot automatically resume',async()=>{
  for(const action of ['stop','disarm','background','disconnect','epoch']) {
    const s=await setup();s.transport.planWrite({kind:'defer'});push(s,.1);await s.time.advance(10);push(s,.8);await s.time.advance(10);
    if(action==='background')s.session.setForeground(false);else if(action==='epoch')s.session.invalidateEpoch(1);else await s.session[action]();
    await settle();s.transport.resolveNextWrite();await settle();s.session.setForeground(true);s.session.setMediaState('playing');
    push(s,.9);await s.time.advance(20);assert.equal(s.session.snapshot().armed,false,action);assert.equal(s.transport.writeRecords().length,1,action);assert.deepEqual(s.session.snapshot().lastWritten,[]);
  }
});
test('late open after background is explicitly closed and cannot reopen or arm',async()=>{
  const time=new VirtualTime(),transport=new MemoryTransport(time);transport.deferOpen=true;
  const session=new OutputSession(config(),policy(),transport,time,time);const pending=session.connect();session.setForeground(false);await settle();
  transport.resolveNextOpen();assert.equal(await pending,false);await settle();assert.equal(session.snapshot().connection,'disconnected');assert.equal(session.snapshot().armed,false);
  assert.equal(transport.closeRecords().some(x=>x.reason==='stale open completion'),true);assert.equal(transport.writeRecords().length,0);
});
test('old generation write/error callbacks cannot mutate a reconnected session',async()=>{
  const s=await setup();s.transport.planWrite({kind:'defer'});push(s,.1);await s.time.advance(10);const old=s.session.snapshot().connectionGeneration;
  await s.session.disconnect();assert.equal(await s.session.connect(),true);s.session.setMediaState('playing');assert.equal(s.session.arm(0,1),true);
  push(s,.8);await s.time.advance(10);s.transport.resolveNextWrite();s.transport.emit({kind:'error',connectionGeneration:old,detail:'late'});await settle();
  assert.equal(s.session.snapshot().connection,'connected');assert.deepEqual(s.session.snapshot().lastWritten,[{axisId:'L0',value:.8}]);assert.equal(s.session.snapshot().completedLocalWrites,1);
});
test('profile/epoch changes invalidate old work and require new explicit arm',async()=>{
  const s=await setup();push(s);await s.time.advance(10);s.session.invalidateEpoch(1);assert.equal(push(s,.8),'ignored');
  assert.equal(s.session.arm(1,1),true);assert.equal(push(s,.2,{epoch:0}),'ignored');push(s,.2);await s.time.advance(10);
  const next={...config(),protocolProfile:{...config().protocolProfile,revision:2},axisRanges:[{axisId:'L0',minimum:0,maximum:.5,enabled:true}]};
  s.session.reconfigure(next);assert.equal(s.session.snapshot().armed,false);assert.equal(s.session.arm(1,1),false);assert.equal(s.session.arm(1,2),true);
  assert.equal(push(s,.9,{revision:1}),'ignored');push(s,.8);await s.time.advance(10);assert.equal(text(s.transport.writeRecords().at(-1)),'L04000I10\n');
});
test('future mismatched epoch cannot leave old latest candidate running',async()=>{
  const s=await setup();push(s,.2);await s.time.advance(10);
  assert.equal(push(s,.9,{epoch:99,sequence:0}),'rejected');await settle();assert.equal(s.session.snapshot().armed,false);
});
test('stale media/monotonic observations and delayed scheduler never encode long movement',async()=>{
  const s=await setup('fixed',{policy:{...policy(),maximumClockAgeMs:15}});push(s,.2);await s.time.advance(20);
  assert.equal(s.transport.writeRecords().length,1);assert.equal(s.session.snapshot().droppedExpired,1);
  const late=await setup('fixed',{policy:{...policy(),maximumFixedElapsedMs:25}});push(late,.3);await late.time.wakeLate(30);
  assert.equal(late.session.snapshot().lastErrorCode,'invalidDuration');assert.equal(late.transport.writeRecords().length,0);
});
test('empty target scope cannot authorize output or retain arm',async()=>{
  const c=config();c.axisRanges[0].enabled=false;const s=await setup('fixed',{config:c});push(s,.2,{values:[]});await s.time.advance(10);
  assert.equal(s.transport.writeRecords().length,0);assert.equal(s.session.snapshot().armed,false);
});
test('one target fault cannot corrupt another target cache/range/scheduler',async()=>{
  const time=new VirtualTime(),a=await setup('fixed',{time}),b=await setup('fixed',{time,config:{...config(),targetId:'second',axisRanges:[{axisId:'L0',minimum:0,maximum:.5,enabled:true}]}});
  a.transport.planWrite({kind:'reject'});push(a,.8);push(b,.8);await time.advance(10);
  assert.equal(a.session.snapshot().armed,false);assert.equal(b.session.snapshot().armed,true);assert.equal(text(b.transport.writeRecords()[0]),'L04000I10\n');
  a.session.setForeground(false);b.session.setForeground(false);await settle();assert.equal(b.session.snapshot().armed,false);
});
test('close failure keeps gate shut and reports uncertain stop; read bytes do not execute controls',async()=>{
  const s=await setup();const generation=s.session.snapshot().connectionGeneration;
  s.transport.emit({kind:'received',connectionGeneration:generation,bytes:Uint8Array.from([35,98,58,49,10])});assert.equal(s.transport.writeRecords().length,0);
  s.transport.rejectClose=true;await s.session.disconnect();assert.equal(s.session.snapshot().closeConfirmed,false);assert.equal(s.session.snapshot().connection,'fault');assert.equal(await s.session.connect(),false);
});
test('stop while short stream continuation is pending cannot append a new command to an abandoned prefix',async()=>{
  const s=await setup();s.transport.planWrite({kind:'accept',acceptedBytes:3});s.transport.planWrite({kind:'defer'});push(s,.5);await s.time.advance(10);
  assert.equal(s.transport.writeRecords().length,2);s.session.stop();s.transport.resolveNextWrite(1);await settle();
  assert.equal(s.session.snapshot().connection,'fault');assert.equal(s.transport.writeRecords().length,2);assert.equal(s.session.snapshot().armed,false);
});
test('new forbidden mixed-source frame clears prior repeatable latest candidate',async()=>{
  const c=config();c.updateContext={...c.updateContext,sendDirtyValuesOnly:false};const s=await setup('fixed',{config:c});
  push(s,.2);await s.time.advance(10);assert.equal(s.transport.writeRecords().length,1);
  assert.equal(push(s,.8,{intents:['activePlayback','pausedMotion']}),'ignored');await s.time.advance(30);
  assert.equal(s.transport.writeRecords().length,1);assert.equal(s.session.snapshot().armed,true);
});
test('mutable caller config/frame/authorization cannot alter already admitted data',async()=>{
  const c=config(),s=await setup('fixed',{config:c});c.protocolProfile.axisOrder[0]='V0';c.axisRanges[0].maximum=.1;
  const values=[{axisId:'L0',value:.4}],intents=['activePlayback'];push(s,.4,{values,intents});values[0].value=.9;intents[0]='pausedMotion';
  await s.time.advance(10);assert.equal(text(s.transport.writeRecords()[0]),'L04000I10\n');
  const records=s.transport.writeRecords();records[0].bytes[0]=0;assert.equal(text(s.transport.writeRecords()[0]),'L04000I10\n');
});
test('configuration change while a write is pending cannot commit old revision cache',async()=>{
  const s=await setup();s.transport.planWrite({kind:'defer'});push(s,.2);await s.time.advance(10);
  s.session.reconfigure({...config(),protocolProfile:{...config().protocolProfile,revision:2}});
  assert.equal(s.session.arm(0,2),false);s.transport.resolveNextWrite();await settle();assert.deepEqual(s.session.snapshot().lastWritten,[]);
  assert.equal(s.session.arm(0,2),true);push(s,.8);await s.time.advance(10);assert.equal(text(s.transport.writeRecords().at(-1)),'L07999I10\n');
});
test('polled source event order survives multi-axis batching and speed-limited target duration',async()=>{
  const c=config('polled');c.protocolProfile.axisOrder=['L0','R0'];c.axisRanges.push({axisId:'R0',minimum:0,maximum:1,enabled:true});
  const s=await setup('polled',{config:c});
  const events=[{eventId:1,epoch:0,sourceFrameSequence:1,axisId:'R0',kind:'speedLimitedScript',targetValue:.8,durationSeconds:.25},
    {eventId:2,epoch:0,sourceFrameSequence:1,axisId:'L0',kind:'autoHome',targetValue:.2,durationSeconds:.5}];
  push(s,.9,{events});await settle();assert.deepEqual(s.transport.writeRecords().map(text),['R07999I250\n','L02000I500\n']);
});
test('original automatic-connect request is retained as configuration but never runs automatically',async()=>{
  const c=config();c.autoConnectPolicy='automaticRequested';const time=new VirtualTime(),transport=new MemoryTransport(time);
  const session=new OutputSession(c,policy(),transport,time,time);await time.advance(60000);session.setForeground(false);await settle();session.setForeground(true);await time.advance(60000);
  assert.equal(transport.openRecords().length,0);assert.equal(session.snapshot().armed,false);
});
test('admission profile independently forbids I0 while the pure encoder remains compatible',async()=>{
  const s=await setup('polled',{policy:{...policy(),allowZeroInterval:false}});pushEvent(s,.5,{duration:0});await settle();
  assert.equal(s.session.snapshot().lastErrorCode,'invalidDuration');assert.equal(s.transport.writeRecords().length,0);
});
test('deterministic state-sequence stress never writes outside explicit valid gate',async()=>{
  const s=await setup();let seed=104729;
  for(let i=0;i<800;i++) {
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;const op=seed%12;
    const before=s.session.snapshot(),count=s.transport.writeRecords().length;
    if(op===0)s.session.stop();else if(op===1)s.session.disarm();else if(op===2)s.session.pause();
    else if(op===3)s.session.setMediaState('playing');else if(op===4)s.session.setForeground(false);
    else if(op===5)s.session.setForeground(true);else if(op===6)await s.session.connect();
    else if(op===7)s.session.arm(s.session.snapshot().epoch,s.session.snapshot().profileRevision);
    else if(op===8)await s.session.disconnect();else if(op===9)push(s,(seed%1000)/1000);
    else if(op===10)push(s,(seed%1000)/1000,{intents:['pausedMotion']});
    else await s.time.advance(10);
    await settle();const after=s.session.snapshot(),newRecords=s.transport.writeRecords().slice(count);
    if(newRecords.length) {
      assert.equal(op,11);assert.equal(before.armed,true);assert.equal(before.foreground,true);assert.equal(before.connection,'connected');assert.equal(before.mediaState,'playing');
      for(const record of newRecords){assert.equal(record.connectionGeneration,before.connectionGeneration);assert.equal(record.epoch,before.epoch);assert.ok(record.startedMonotonicMs<record.deadlineMonotonicMs);}
    }
    if(after.armed){assert.equal(after.foreground,true);assert.equal(after.connection,'connected');}
    assert.ok(after.queuedEvents<=policy().maximumPolledQueueLength);
  }
});
test('degenerate imported range is preserved and surfaced as a diagnostic, never silently edited',async()=>{
  const c=config();c.axisRanges[0].minimum=.3;c.axisRanges[0].maximum=.3;const s=await setup('fixed',{config:c});
  assert.match(s.session.snapshot().configurationDiagnostics[0],/L0: degenerateRange/);push(s,.8);await s.time.advance(10);
  assert.equal(text(s.transport.writeRecords()[0]),'L03000I10\n');assert.equal(c.axisRanges[0].minimum,.3);
});

test('authorization scope rejects empty, duplicate, unknown, extra and partial target axes',async()=>{
  for(const authorizedAxes of [[],['L0','L0'],['BAD'],['L0','R0']]){
    const s=await setup();assert.equal(push(s,.3,{authorizedAxes}),'rejected');assert.equal(s.session.snapshot().lastErrorCode,'invalidIntent');assert.equal(s.session.snapshot().armed,false);await s.time.advance(10);assert.equal(s.transport.writeRecords().length,0);
  }
  const c=config();c.protocolProfile.axisOrder=['L0','R0'];c.axisRanges.push({axisId:'R0',minimum:0,maximum:1,enabled:true});
  const s=await setup('fixed',{config:c});assert.equal(push(s,.4,{values:[{axisId:'L0',value:.4},{axisId:'R0',value:.5}],authorizedAxes:['L0']}),'rejected');
});
test('disabled unrelated unknown values need no authorization and never enter output bytes',async()=>{
  const c=config();c.protocolProfile.axisOrder=['L0','R0'];c.axisRanges.push({axisId:'R0',minimum:0,maximum:1,enabled:false});
  const s=await setup('fixed',{config:c});assert.equal(push(s,.4,{values:[{axisId:'L0',value:.4},{axisId:'R0',value:NaN}],authorizedAxes:['L0']}),'accepted');await s.time.advance(10);
  assert.equal(text(s.transport.writeRecords()[0]),'L04000I10\n');assert.equal(s.session.snapshot().armed,true);
});
test('renamed activePlayback accepts verified active pipeline and refuses legacy script-only intent',async()=>{
  const s=await setup();assert.equal(push(s,.4,{intents:['activePlayback']}),'accepted');await s.time.advance(10);assert.equal(s.transport.writeRecords().length,1);
  assert.equal(push(s,.5,{intents:['scriptPlayback'],clockKind:'media'}),'rejected');assert.equal(s.session.snapshot().armed,false);
});
test('authorized axes are detached from caller mutation before scheduled output',async()=>{
  const s=await setup(),authorizedAxes=['L0'];assert.equal(push(s,.4,{authorizedAxes}),'accepted');authorizedAxes[0]='R0';await s.time.advance(10);assert.equal(text(s.transport.writeRecords()[0]),'L04000I10\n');
});
test('paused pure hold with no current source intent cannot retain a previous candidate',async()=>{
  const s=await setup('fixed',{config:{...config(),allowPausedMotion:true}});s.session.pause();push(s,.4,{intents:['pausedMotion']});await s.time.advance(10);
  assert.equal(push(s,.4,{intents:[],clockKind:'monotonic'}),'rejected');await s.time.advance(10);assert.equal(s.transport.writeRecords().length,1);assert.equal(s.session.snapshot().armed,false);
});

test('suspending fixed and polled sources preserves arm but clears every old candidate and late receipt cache',async()=>{
  for(const kind of ['fixed','polled']){
    const s=await setup(kind,{policy:{...policy(),writeTimeoutMs:1000}});
    s.transport.planWrite({kind:'defer'});
    if(kind==='fixed'){push(s,.1);await s.time.advance(10);push(s,.2);await s.time.advance(10);assert.equal(s.session.snapshot().pendingFixed,true);}
    else {pushEvent(s,.1);pushEvent(s,.2);assert.equal(s.session.snapshot().queuedEvents,1);}
    s.session.suspendCandidates();assert.equal(s.session.snapshot().armed,true);
    assert.equal(s.session.snapshot().pendingFixed,false);assert.equal(s.session.snapshot().queuedEvents,0);
    await s.time.advance(20);s.transport.resolveNextWrite();await settle();
    assert.equal(s.transport.writeRecords().length,1);assert.equal(s.session.snapshot().completedLocalWrites,0);
    assert.deepEqual(s.session.snapshot().lastWritten,[]);
    if(kind==='fixed'){push(s,.8);await s.time.advance(10);}else{pushEvent(s,.8);await settle();}
    assert.equal(s.transport.writeRecords().length,2);assert.equal(s.session.snapshot().armed,true);
  }
});
test('effective source revision change clears pending work even without an intermediate suspend call',async()=>{
  const s=await setup('fixed',{policy:{...policy(),writeTimeoutMs:1000}});
  s.transport.planWrite({kind:'defer'});push(s,.1,{sourceConfigurationRevision:4});await s.time.advance(10);
  push(s,.2,{sourceConfigurationRevision:4});await s.time.advance(10);assert.equal(s.session.snapshot().pendingFixed,true);
  assert.equal(push(s,.9,{sourceConfigurationRevision:5}),'accepted');assert.equal(s.session.snapshot().pendingFixed,false);
  s.transport.resolveNextWrite();await settle();assert.equal(s.transport.writeRecords().length,1);
  assert.deepEqual(s.session.snapshot().lastWritten,[]);await s.time.advance(10);assert.equal(s.transport.writeRecords().length,2);
  assert.equal(push(s,.3,{sourceConfigurationRevision:4}),'ignored');await s.time.advance(10);
  assert.deepEqual(s.session.snapshot().lastWritten,[{axisId:'L0',value:.9}]);
});
test('close retries target the original opened generation until its actual close succeeds',async()=>{
  const s=await setup();const opened=s.transport.openRecords()[0];s.transport.rejectClose=true;
  await s.session.disconnect();await s.session.disconnect();
  assert.deepEqual(s.transport.closeRecords().map(r=>r.connectionGeneration),[opened,opened]);
  assert.equal(s.session.snapshot().closeConfirmed,false);assert.equal(await s.session.connect(),false);
  assert.equal(s.transport.openRecords().length,1);
  s.transport.rejectClose=false;await s.session.disconnect();assert.equal(s.session.snapshot().closeConfirmed,true);
  assert.equal(s.transport.closeRecords()[2].connectionGeneration,opened);
  assert.equal(await s.session.connect(),true);assert.equal(s.transport.openRecords().length,2);
  assert.ok(s.transport.openRecords()[1]>opened);await s.session.dispose();
});
test('pending-open close cannot confirm or reconnect before late open and exact-generation cleanup settle',async()=>{
  const time=new VirtualTime(),transport=new MemoryTransport(time);transport.deferOpen=true;
  const session=new OutputSession(config(),policy(),transport,time,time);const opening=session.connect();
  const opened=transport.openRecords()[0];await session.disconnect();
  assert.equal(session.snapshot().closeConfirmed,false);assert.equal(await session.connect(),false);
  transport.resolveNextOpen();assert.equal(await opening,false);
  assert.deepEqual(transport.closeRecords().map(r=>r.connectionGeneration),[opened,opened]);
  assert.equal(session.snapshot().closeConfirmed,true);assert.equal(session.snapshot().armed,false);
  transport.deferOpen=false;assert.equal(await session.connect(),true);await session.dispose();
});
test('failed late-open cleanup stays unconfirmed and never authorizes a second native handle',async()=>{
  const time=new VirtualTime(),transport=new MemoryTransport(time);transport.deferOpen=true;
  const session=new OutputSession(config(),policy(),transport,time,time);const opening=session.connect();
  await session.disconnect();transport.rejectClose=true;transport.resolveNextOpen();assert.equal(await opening,false);
  assert.equal(session.snapshot().closeConfirmed,false);assert.equal(session.snapshot().connection,'fault');
  assert.equal(await session.connect(),false);assert.equal(transport.openRecords().length,1);
  await session.disconnect();assert.equal(session.snapshot().closeConfirmed,false);
  assert.ok(transport.closeRecords().every(r=>r.connectionGeneration===transport.openRecords()[0]));
});


test('polled prospective event authorization cannot be reused to send fixed scalar values',async()=>{
 const s=await setup();assert.equal(push(s,.9,{updateKind:'polled'}),'rejected');await s.time.advance(10);
 assert.equal(s.transport.writeRecords().length,0);assert.equal(s.session.snapshot().armed,false);
});
test('fixed scalar authorization cannot authorize a polled target event',async()=>{
 const s=await setup('polled');assert.equal(pushEvent(s,.9,{updateKind:'fixed'}),'rejected');await settle();
 assert.equal(s.transport.writeRecords().length,0);assert.equal(s.session.snapshot().armed,false);
});

test('independent paused Manual permission admits monotonic fixed current values without Motion permission',async()=>{
  const c={...config(),allowPausedManual:true},s=await setup('fixed',{config:c});s.session.pause();
  assert.equal(s.session.snapshot().armed,true);assert.equal(c.allowPausedMotion,false);
  assert.equal(push(s,.2,{intents:['pausedManual'],mediaPositionMs:NaN}),'accepted');await s.time.advance(10);
  assert.equal(text(s.transport.writeRecords()[0]),'L02000I10\n');
  assert.equal(s.session.snapshot().completedLocalWrites,1);assert.equal(s.session.snapshot().queuedEvents,0);
  assert.equal(push(s,.7,{intents:['pausedManual']}),'accepted');await s.time.advance(10);
  assert.equal(text(s.transport.writeRecords()[1]),'L06999I10\n');await s.session.dispose();
});

for(const allowPausedManual of [undefined,false,true])for(const allowPausedMotion of [false,true])for(const allowPausedAutoHome of [false,true])
  test(`paused Manual requires its own permission (${allowPausedManual}/${allowPausedMotion}/${allowPausedAutoHome})`,async()=>{
    const c={...config(),allowPausedMotion,allowPausedAutoHome};if(allowPausedManual!==undefined)c.allowPausedManual=allowPausedManual;
    const s=await setup('fixed',{config:c});s.session.pause();
    assert.equal(push(s,.5,{intents:['pausedManual']}),allowPausedManual===true?'accepted':'ignored');await s.time.advance(10);
    assert.equal(s.transport.writeRecords().length,allowPausedManual===true?1:0);await s.session.dispose();
  });

for(const intent of ['pausedMotion','pausedAutoHome','activePlayback'])test('paused Manual permission never grants '+intent,async()=>{
  const s=await setup('fixed',{config:{...config(),allowPausedManual:true}});s.session.pause();
  assert.equal(push(s,.4,{intents:[intent]}),'ignored');await s.time.advance(10);
  assert.equal(s.transport.writeRecords().length,0);await s.session.dispose();
});

for(const extra of ['pausedMotion','pausedAutoHome','activePlayback'])test('mixed Manual and '+extra+' clears an already admitted fixed candidate',async()=>{
  const c={...config(),allowPausedManual:true};c.updateContext={...c.updateContext,sendDirtyValuesOnly:false};
  const s=await setup('fixed',{config:c});s.session.pause();assert.equal(push(s,.2,{intents:['pausedManual']}),'accepted');await s.time.advance(10);
  assert.equal(push(s,.8,{intents:['pausedManual',extra]}),'ignored');await s.time.advance(30);
  assert.equal(s.transport.writeRecords().length,1);assert.equal(s.session.snapshot().armed,true);await s.session.dispose();
});

test('all independently permitted paused fixed sources can share one exact scope',async()=>{
  const s=await setup('fixed',{config:{...config(),allowPausedManual:true,allowPausedMotion:true,allowPausedAutoHome:true}});s.session.pause();
  assert.equal(push(s,.3,{intents:['pausedManual','pausedMotion','pausedAutoHome']}),'accepted');await s.time.advance(10);
  assert.equal(s.transport.writeRecords().length,1);await s.session.dispose();
});

for(const state of ['playing','stopped'])test('Manual intent cannot dispatch while media is '+state,async()=>{
  const s=await setup('fixed',{config:{...config(),allowPausedManual:true}});s.session.setMediaState(state);
  if(state==='stopped')assert.equal(s.session.arm(0,1),true); // Even explicit arm does not grant the paused media state.
  assert.equal(push(s,.8,{intents:['pausedManual']}),'ignored');await s.time.advance(10);
  assert.equal(s.transport.writeRecords().length,0);await s.session.dispose();
});

for(const mode of ['fixed-auth','polled-auth','polled-event','mixed-home-event'])test('polled Manual is unavailable and cannot invent an event: '+mode,async()=>{
  const s=await setup('polled',{config:{...config('polled'),allowPausedManual:true,allowPausedAutoHome:true}});s.session.pause();
  const intents=mode==='mixed-home-event'?['pausedManual','pausedAutoHome']:['pausedManual'];
  const options={intents,updateKind:mode==='fixed-auth'?'fixed':'polled',eventKind:'autoHome'};
  const admitted=mode.includes('event')?pushEvent(s,.8,options):push(s,.8,options);
  assert.equal(admitted,mode==='fixed-auth'?'rejected':'ignored');await s.time.advance(10);
  assert.equal(s.transport.writeRecords().length,0);assert.equal(s.session.snapshot().queuedEvents,0);
  assert.ok(s.session.snapshot().configurationDiagnostics.some(x=>x.includes('pausedManualUnavailable')&&x.includes('no polled event')));
  await s.session.dispose();
});

for(const negative of ['media-clock','invalid-clock-kind','stale-clock','stale-frame','future-clock','future-frame','NaN-clock','polled-authorization','empty-scope','extra-scope','wrong-source-revision','wrong-epoch','wrong-profile','duplicate-sequence'])
  test('paused Manual preserves provenance gate: '+negative,async()=>{
    const s=await setup('fixed',{config:{...config(),allowPausedManual:true}});s.session.pause();await s.time.advance(250);
    const options={intents:['pausedManual']};
    if(negative==='media-clock')options.clockKind='media';
    if(negative==='invalid-clock-kind')options.clockKind='guessed';
    if(negative==='stale-clock')options.observed=0;
    if(negative==='stale-frame')options.stamp=0;
    if(negative==='future-clock')options.observed=251;
    if(negative==='future-frame')options.stamp=251;
    if(negative==='NaN-clock')options.observed=NaN;
    if(negative==='polled-authorization')options.updateKind='polled';
    if(negative==='empty-scope')options.authorizedAxes=[];
    if(negative==='extra-scope')options.authorizedAxes=['L0','R0'];
    if(negative==='wrong-epoch')options.epoch=1;
    if(negative==='wrong-profile')options.revision=2;
    if(negative==='wrong-source-revision'||negative==='duplicate-sequence'){
      assert.equal(push(s,.2,{intents:['pausedManual'],sourceConfigurationRevision:3}),'accepted');s.session.suspendCandidates();
      if(negative==='wrong-source-revision')options.sourceConfigurationRevision=2;else options.sequence=s.sequence;
    }
    assert.notEqual(push(s,.8,options),'accepted');await s.time.advance(10);
    assert.equal(s.transport.writeRecords().length,0);await s.session.dispose();
  });

for(const action of ['stop','disarm','background','disconnect','epoch'])test('paused Manual candidate cannot survive '+action+' or resume implicitly',async()=>{
  const s=await setup('fixed',{config:{...config(),allowPausedManual:true}});s.session.pause();
  assert.equal(push(s,.2,{intents:['pausedManual']}),'accepted');
  if(action==='background')s.session.setForeground(false);else if(action==='epoch')s.session.invalidateEpoch(1);else await s.session[action]();
  await settle();s.session.setForeground(true);s.session.setMediaState('paused');
  assert.equal(push(s,.9,{intents:['pausedManual']}),'ignored');await s.time.advance(20);
  assert.equal(s.session.snapshot().armed,false);assert.equal(s.transport.writeRecords().length,0);await s.session.dispose();
});

test('enabling paused Manual still requires explicit connect and arm and copies permission before caller mutation',async()=>{
  const time=new VirtualTime(),transport=new MemoryTransport(time),c={...config(),allowPausedManual:true};
  const session=new OutputSession(c,policy(),transport,time,time);session.pause();
  const s={time,transport,session,updateKind:'fixed',enabledAxes:['L0'],sequence:0,eventId:0};
  assert.equal(push(s,.2,{intents:['pausedManual']}),'ignored');assert.deepEqual(transport.openRecords(),[]);
  assert.equal(await session.connect(),true);assert.equal(push(s,.2,{intents:['pausedManual']}),'ignored');assert.equal(transport.writeRecords().length,0);
  assert.equal(session.arm(0,1),true);c.allowPausedManual=false;
  assert.equal(push(s,.2,{intents:['pausedManual']}),'accepted');await time.advance(10);assert.equal(transport.writeRecords().length,1);
  await session.dispose();
});

test('malformed paused Manual config fails without weakening prior mandatory booleans',()=>{
  for(const value of [null,0,1,'true',{},[]]){
    const time=new VirtualTime(),transport=new MemoryTransport(time);
    assert.throws(()=>new OutputSession({...config(),allowPausedManual:value},policy(),transport,time,time),e=>e.code==='invalidConfiguration');
    assert.equal(transport.openRecords().length,0);
  }
  for(const field of ['allowPausedMotion','allowPausedAutoHome']){
    const c={...config(),allowPausedManual:true};delete c[field];const time=new VirtualTime();
    assert.throws(()=>new OutputSession(c,policy(),new MemoryTransport(time),time,time),e=>e.code==='invalidConfiguration');
  }
});

test('terminal observer runs synchronously after local gate closure and before async transport cleanup',async()=>{
 const time=new VirtualTime(),transport=new MemoryTransport(time),observed=[];let finish;
 const close=transport.close.bind(transport);transport.close=(reason,generation)=>new Promise(resolve=>{finish=()=>close(reason,generation).then(resolve);});
 let session;session=new OutputSession(config(),policy(),transport,time,time,()=>observed.push(session.snapshot()));
 await session.connect();session.setMediaState('playing');session.arm(0,1);const generation=session.snapshot().connectionGeneration;
 transport.emit({kind:'closed',connectionGeneration:generation});
 assert.equal(observed.length,1);assert.equal(observed[0].armed,false);assert.equal(observed[0].connection,'fault');assert.equal(observed[0].closeConfirmed,false);
 transport.emit({kind:'error',connectionGeneration:generation});assert.equal(observed.length,1);
 finish();await settle();transport.close=close;await session.dispose();assert.equal(observed.length,1);
});

test('throwing terminal observer cannot skip local handle retirement',async()=>{
 const time=new VirtualTime(),transport=new MemoryTransport(time);let calls=0;
 const session=new OutputSession(config(),policy(),transport,time,time,()=>{calls++;throw Error('observer failure');});
 await session.connect();session.setMediaState('playing');session.arm(0,1);await session.disconnect();
 assert.equal(calls,1);assert.equal(session.snapshot().armed,false);assert.equal(session.snapshot().closeConfirmed,true);assert.equal(transport.closeRecords().length,1);await session.dispose();
});

test('old transport generation cannot notify terminal observer or close a reconnected armed session',async()=>{
 const time=new VirtualTime(),transport=new MemoryTransport(time);let calls=0;
 const session=new OutputSession(config(),policy(),transport,time,time,()=>calls++);await session.connect();const old=session.snapshot().connectionGeneration;
 await session.disconnect();assert.equal(calls,1);await session.connect();session.setMediaState('playing');session.arm(0,1);
 transport.emit({kind:'error',connectionGeneration:old});assert.equal(calls,1);assert.equal(session.snapshot().armed,true);assert.equal(session.snapshot().connection,'connected');await session.dispose();assert.equal(calls,2);
});
