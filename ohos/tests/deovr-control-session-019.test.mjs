import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);}});
const {PlaybackSessionCore}=await import('../entry/src/main/ets/core/PlaybackSessionCore.ts');
const {SettingsSchema}=await import('../entry/src/main/ets/settings/SettingsSchema.ts');
const {FunscriptParser}=await import('../entry/src/main/ets/core/Funscript.ts');
const {DeoVrMediaSource}=await import('../entry/src/main/ets/media/deovr/DeoVrMediaSource.ts');
const {OutputCoordinator}=await import('../entry/src/main/ets/output/OutputCoordinator.ts');
const {MemoryTransport}=await import('../entry/src/main/ets/output/MemoryTransport.ts');
const {defaultFixedContext}=await import('../entry/src/main/ets/output/UpdateContext.ts');
const settle=async()=>{for(let i=0;i<24;i++)await Promise.resolve();};
class Time{now=100;next=0;tasks=new Map();nowMs(){return this.now;}scheduleAt(at,fn){const id=++this.next;this.tasks.set(id,{at,fn});return id;}cancel(id){this.tasks.delete(id);}async advance(delta){const until=this.now+delta;for(;;){const next=[...this.tasks].filter(([,t])=>t.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;this.tasks.delete(next[0]);this.now=next[1].at;next[1].fn();await settle();}this.now=until;await settle();}}
const bytes=packet=>{const b=Buffer.from(JSON.stringify(packet)),r=Buffer.alloc(b.length+4);r.writeInt32LE(b.length);b.copy(r,4);return r;};
const packet=(position=1,extra={})=>({path:'fixture.mp4',duration:100,playerState:0,currentTime:position,playbackSpeed:1,...extra});
const config=(kind='fixed',permissions={})=>({targetId:'fixture',kind:'memory',protocolProfile:{precision:4,revision:1,axisOrder:['L0'],maximumDurationMs:100000,maximumPayloadBytes:1024},axisRanges:[{axisId:'L0',minimum:0,maximum:1,enabled:true}],updateContext:kind==='fixed'?defaultFixedContext():{kind:'polled'},autoConnectPolicy:'manual',allowPausedAutoHome:false,allowPausedMotion:false,...permissions});
const policy={maximumFrameAgeMs:750,maximumClockAgeMs:750,maximumEventAgeMs:250,maximumFixedElapsedMs:1000,writeTimeoutMs:100,maximumPolledQueueLength:4,allowZeroInterval:true};
async function setup(kind='fixed',armed=true,settings=null,permissions={}){
 const time=new Time();let sink;const cfg=settings??SettingsSchema.defaults();for(const k of Object.keys(cfg.sync))if(k.startsWith('sync'))cfg.sync[k]=false;
 const core=new PlaybackSessionCore(cfg);core.setConnected(true);
 const source=new DeoVrMediaSource({create(_e,_g,s){sink=s;return{async connect(){},async send(){},detach(){},async close(){}};}},time);
 source.subscribe((s,e)=>{if(s.status==='connecting')core.useDeoVrSource(s.generation);core.acceptDeoVrSnapshot(s,e,time.now);});
 await source.connect({host:'fixture.test',port:23554,family:1});
 const feed=(p,at=time.now)=>{time.now=at;sink.received(bytes(p));};
 const tick=(at=time.now+40)=>{time.now=at;core.tick(at-core.frame().monotonicMs,at);};
 feed(packet());const s=source.snapshot(),doc=FunscriptParser.parse('{"actions":[{"at":0,"pos":10},{"at":100000,"pos":90}]}');core.loadDeoVrBindings(s.generation,s.resourceRevision,doc,core.resources(doc,'fixture','fixture'));tick(140);
 const transport=new MemoryTransport(time),coordinator=new OutputCoordinator({inspect:()=>({available:true,diagnostic:''}),create:()=>transport},core,policy,time,time);
 await coordinator.connect(config(kind,permissions),{host:'',port:0});if(armed)assert.equal(coordinator.arm(),true);coordinator.refresh();
 const begin=async request=>{const lease=core.beginDeoVrControl(request,source.snapshot(),time.now);assert.ok(lease);const retained=coordinator.beginSourceControl();const callback=b=>core.bindDeoVrControl(lease.requestId,b,time.now);if(request.kind==='speed')await source.changeSpeed(request.speed,callback);else await source.playPause(request.kind==='play',callback);return{lease,retained};};
 return{time,core,source,coordinator,transport,feed,tick,begin};
}
for(const kind of ['fixed','polled']){
 test(`${kind} Play and Speed keep only existing Arm after pair and genuinely new frame`,async()=>{
  const s=await setup(kind);const before=s.core.frame();const {retained}=await s.begin({kind:'speed',speed:2});assert.equal(retained,true);
  assert.equal(s.coordinator.status().controlPending,true);s.coordinator.refresh();assert.equal(s.coordinator.status().armed,true);
  s.feed(packet(1.08,{playbackSpeed:2}),180);s.coordinator.refresh();assert.equal(s.coordinator.status().controlPending,true);
  s.feed(packet(1.16,{playbackSpeed:2}),220);s.coordinator.refresh();assert.equal(s.coordinator.status().controlPending,true);assert.equal(s.core.frame(),before);
  s.tick(240);assert.equal(s.coordinator.refresh(),'accepted');assert.equal(s.coordinator.status().armed,true);assert.equal(s.coordinator.status().controlPending,false);
 });
 test(`${kind} Pause parks without bytes then explicit Play requires its own pair`,async()=>{
  const s=await setup(kind);await s.begin({kind:'pause'});s.feed(packet(1.1,{playerState:1}),180);s.feed(packet(1.1,{playerState:1}),220);s.tick(240);
  s.coordinator.refresh();assert.equal(s.coordinator.status().armed,true);assert.equal(s.coordinator.status().controlParked,true);const count=s.transport.writes.length;
  await s.time.advance(100);assert.equal(s.transport.writes.length,count);
  s.feed(packet(1.1,{playerState:1}),340);s.tick(360);s.coordinator.refresh();
  await s.begin({kind:'play'});s.feed(packet(1.2),400);s.feed(packet(1.3),440);s.tick(460);assert.equal(s.coordinator.refresh(),'accepted');assert.equal(s.coordinator.status().armed,true);
 });
 test(`${kind} unarmed ordinary command never creates Arm`,async()=>{
  const s=await setup(kind,false);const {retained}=await s.begin({kind:'speed',speed:1});assert.equal(retained,false);
  s.feed(packet(1.08),180);s.feed(packet(1.16),220);s.tick(240);s.coordinator.refresh();assert.equal(s.coordinator.status().armed,false);assert.equal(s.transport.writes.length,0);
 });
}
for(const revoke of ['stop','background','configuration','seek','path','disconnect'])test(`pending ordinary continuity permanently revokes on ${revoke}`,async()=>{
 const s=await setup();await s.begin({kind:'speed',speed:1});
 if(revoke==='stop')s.core.stop();else if(revoke==='background')s.core.setForeground(false);else if(revoke==='configuration')s.core.setAxisScale('L0',.8);else if(revoke==='seek')s.core.beginDeoVrSeek();else if(revoke==='path')s.feed(packet(1,{path:'new.mp4'}),160);else await s.source.disconnect();
 s.coordinator.refresh();assert.equal(s.coordinator.status().armed,false);s.feed(packet(1.08),180);s.feed(packet(1.16),220);s.tick(240);s.coordinator.refresh();assert.equal(s.coordinator.status().armed,false);
});
test('parked unsolicited remote Play disarms; cannot release parked gate',async()=>{const s=await setup();await s.begin({kind:'pause'});s.feed(packet(1.1,{playerState:1}),180);s.feed(packet(1.1,{playerState:1}),220);s.tick(240);s.coordinator.refresh();assert.equal(s.coordinator.status().controlParked,true);s.feed(packet(1.2),280);s.coordinator.refresh();assert.equal(s.coordinator.status().armed,false);});
test('overlapping unfinished ordinary commands revoke instead of transfer',async()=>{const s=await setup();await s.begin({kind:'speed',speed:1});assert.equal(s.core.beginDeoVrControl({kind:'pause'},s.source.snapshot(),s.time.now),null);s.coordinator.refresh();assert.equal(s.coordinator.status().armed,false);});
test('parked expiration without source or UI tick cannot restore on later packet',async()=>{const s=await setup();await s.begin({kind:'pause'});s.feed(packet(1.1,{playerState:1}),180);s.feed(packet(1.1,{playerState:1}),220);s.tick(240);s.coordinator.refresh();await s.time.advance(751);assert.equal(s.coordinator.status().armed,false);s.feed(packet(1.1,{playerState:1}));s.tick();s.coordinator.refresh();assert.equal(s.coordinator.status().armed,false);});
for(const allow of [false,true])test(`paused Motion obeys existing target permission ${allow}`,async()=>{
 const cfg=SettingsSchema.defaults(),axis=cfg.axisSettingsByDevice.find(d=>d.deviceId===cfg.selectedDeviceId).axes.find(a=>a.axisName==='L0');
 axis.settings.selectedMotionProvider='Pattern';axis.settings.updateMotionProviderWhenPaused=true;axis.settings.updateMotionProviderWithoutScript=true;axis.settings.motionProviderBlend=1;
 const s=await setup('fixed',true,cfg,{allowPausedMotion:allow});await s.begin({kind:'pause'});
 s.feed(packet(1.1,{playerState:1}),180);s.feed(packet(1.1,{playerState:1}),220);s.tick(240);s.coordinator.refresh();
 assert.equal(s.coordinator.status().armed,true);assert.equal(s.coordinator.status().controlParked,true);
 const before=s.transport.writes.length;await s.time.advance(20);assert.equal(s.transport.writes.length>before,allow);
});
test('known Home event remains exact for a permitted polled target after pause observation proof',async()=>{
 const cfg=SettingsSchema.defaults(),axis=cfg.axisSettingsByDevice.find(d=>d.deviceId===cfg.selectedDeviceId).axes.find(a=>a.axisName==='L0');
 axis.settings.autoHomeEnabled=true;axis.settings.autoHomeDelaySeconds=.1;axis.settings.autoHomeDurationSeconds=1;
 const s=await setup('polled',true,cfg,{allowPausedAutoHome:true});await s.begin({kind:'pause'});
 s.feed(packet(1.1,{playerState:1}),180);s.feed(packet(1.1,{playerState:1}),220);s.tick(240);const frame=s.core.dispatchSource(['L0'],'polled');s.coordinator.refresh();await settle();
 assert.equal(s.coordinator.status().armed,true);assert.ok(frame.frame.events.length>0);assert.equal(frame.frame.events[0].durationSeconds,1);
});
test('pending expires at actual old-position freshness without waiting five seconds or a UI tick',async()=>{
 const s=await setup();s.time.now=800;const next=s.core.beginDeoVrControl({kind:'speed',speed:1},s.source.snapshot(),800);assert.ok(next);assert.equal(s.coordinator.beginSourceControl(),true);
 await s.time.advance(50);assert.equal(s.coordinator.status().armed,false);
});
test('missing or contradictory packet after matching pair cannot publish prior evidence',async()=>{
 const s=await setup();await s.begin({kind:'speed',speed:1});s.feed(packet(1.08),180);s.feed(packet(1.16),220);s.feed({path:'fixture.mp4',currentTime:1.2},230);s.tick(240);s.coordinator.refresh();
 assert.equal(s.coordinator.status().controlPending,true);assert.equal(s.core.dispatchSource(['L0']).authorization,null);
 s.feed(packet(1.24),260);s.feed(packet(1.28),280);s.tick(300);assert.equal(s.coordinator.refresh(),'accepted');
});
test('scope changes during pending revoke only edited target; another target can continue its own captured Arm',async()=>{
 const s=await setup();const secondTransport=new MemoryTransport(s.time),second=new OutputCoordinator({inspect:()=>({available:true,diagnostic:''}),create:()=>secondTransport},s.core,policy,s.time,s.time);
 await second.connect({...config(),targetId:'second'},{host:'',port:0});assert.equal(second.arm(),true);second.refresh();
 const lease=s.core.beginDeoVrControl({kind:'speed',speed:1},s.source.snapshot(),s.time.now);assert.ok(lease);assert.equal(s.coordinator.beginSourceControl(),true);assert.equal(second.beginSourceControl(),true);
 await s.source.changeSpeed(1,b=>s.core.bindDeoVrControl(lease.requestId,b,s.time.now));second.disarm();
 s.feed(packet(1.08),180);s.feed(packet(1.16),220);s.tick(240);s.coordinator.refresh();second.refresh();assert.equal(s.coordinator.status().armed,true);assert.equal(second.status().armed,false);
});
for(const state of [2,-1])test(`unsupported raw state ${state} after completed control keeps numeric original but revokes output`,async()=>{
 const s=await setup();await s.begin({kind:'speed',speed:1});s.feed(packet(1.08),180);s.feed(packet(1.16),220);s.tick(240);s.coordinator.refresh();assert.equal(s.coordinator.status().armed,true);
 s.feed(packet(1.16,{playerState:state}),260);s.tick(280);s.coordinator.refresh();assert.equal(s.core.snapshot().state,'paused');assert.equal(s.coordinator.status().armed,false);
 s.feed(packet(1.2),300);s.tick(320);s.coordinator.refresh();assert.equal(s.coordinator.status().armed,false);
});
