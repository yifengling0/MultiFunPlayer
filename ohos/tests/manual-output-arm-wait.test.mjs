import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);}});
const {PlaybackSessionCore}=await import('../entry/src/main/ets/core/PlaybackSessionCore.ts');
const {SettingsSchema}=await import('../entry/src/main/ets/settings/SettingsSchema.ts');
const {OutputCoordinator,OutputEndpoint}=await import('../entry/src/main/ets/output/OutputCoordinator.ts');
const {OutputTargetCollection}=await import('../entry/src/main/ets/output/OutputTargetCollection.ts');
const {MemoryTransport}=await import('../entry/src/main/ets/output/MemoryTransport.ts');
const {defaultFixedContext}=await import('../entry/src/main/ets/output/UpdateContext.ts');
const settle=async()=>{for(let n=0;n<30;n++)await Promise.resolve();};
class Time {
 now=0;next=1;tasks=new Map();nowMs(){return this.now;}scheduleAt(at,callback){const id=this.next++;this.tasks.set(id,{at,callback});return id;}cancel(id){this.tasks.delete(id);}
 async advanceTo(target){while(true){const next=[...this.tasks].filter(([,t])=>t.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;this.now=next[1].at;this.tasks.delete(next[0]);next[1].callback();await settle();}this.now=target;await settle();}
}
const policy={maximumFrameAgeMs:200,maximumClockAgeMs:750,maximumEventAgeMs:200,maximumFixedElapsedMs:1000,writeTimeoutMs:1000,maximumPolledQueueLength:64,allowZeroInterval:true};
function setup(){
 const settings=SettingsSchema.defaults();for(const key of Object.keys(settings.sync))if(key.startsWith('sync'))settings.sync[key]=false;
 for(const device of settings.axisSettingsByDevice)for(const axis of device.axes)Object.assign(axis.settings,{autoHomeEnabled:false,selectedMotionProvider:null,updateMotionProviderWithAxis:null,motionProviderSpeedLimitWithAxis:false});
 const engine=new PlaybackSessionCore(settings);engine.setConnected(true);const time=new Time(),ports=new Map();
 const collection=new OutputTargetCollection(id=>new OutputCoordinator({inspect:()=>({available:true,diagnostic:'mock'}),create(){const port=new MemoryTransport(time);ports.set(id,port);return port;}},engine,policy,time,time));
 return {engine,time,ports,collection};
}
function config(s,id,axis='L0',allowed=true,kind='fixed'){
 const registry=s.engine.activeRegistry();return {targetId:id,kind:'memory',protocolProfile:{precision:4,revision:registry.revision,axisOrder:registry.axes.map(axis=>axis.name),maximumDurationMs:10000,maximumPayloadBytes:1024},axisRanges:registry.axes.map(item=>({axisId:item.name,minimum:0,maximum:1,enabled:item.name===axis})),updateContext:kind==='fixed'?defaultFixedContext():{kind:'polled'},autoConnectPolicy:'manual',allowPausedAutoHome:false,allowPausedMotion:false,allowPausedManual:allowed};
}
async function target(s,id='a',axis='L0',allowed=true,kind='fixed'){
 s.collection.add(id);const c=s.collection.get(id);assert.equal(await c.connect(config(s,id,axis,allowed,kind),new OutputEndpoint()),true);return c;
}
async function tick(s,delta=40){await s.time.advanceTo(s.time.now+delta);s.engine.tick(delta,s.time.now);s.collection.refresh();}

test('real core duration-zero Transition uses explicit idle Arm-wait, sends the sole authorized frame, and holds closed afterward',async()=>{
 const s=setup(),c=await target(s);s.engine.startManualPreview();assert.equal(c.arm(),false,'previous epoch frame cannot establish waiting');
 await tick(s);const source=s.engine.dispatchSource(['L0']);assert.ok(source.manualPreviewAdmission);assert.equal(source.authorization,null);assert.equal(source.availability,'pendingCurrentFrame');
 assert.equal(c.arm(),true);assert.equal(c.status().dispatchSuspended,true);await s.time.advanceTo(50);assert.equal(s.ports.get('a').writeRecords().length,0);
 const before=s.engine.frame();s.engine.setAxisValue('L0',.8,0);assert.equal(s.engine.frame(),before);assert.equal(s.engine.dispatchSource(['L0']).authorization,null);
 s.collection.refresh();assert.equal(c.status().armed,true);assert.equal(c.status().dispatchSuspended,true);
 await tick(s);assert.deepEqual(s.engine.dispatchSource(['L0']).authorization.intents,['pausedManual']);assert.equal(c.status().dispatchSuspended,false);
 await s.time.advanceTo(s.time.now+10);assert.equal(s.ports.get('a').writeRecords().length,1);
 assert.equal(String.fromCharCode(...s.ports.get('a').writeRecords()[0].bytes),'L07999I10\n');
 await tick(s);assert.equal(s.engine.dispatchSource(['L0']).authorization,null);assert.equal(c.status().armed,true);assert.equal(c.status().dispatchSuspended,true);
 await s.time.advanceTo(s.time.now+50);assert.equal(s.ports.get('a').writeRecords().length,1);await s.collection.dispose();
});

test('real manual Set advances command revision within same admission but a nonmanual configuration edit revokes waiting',async()=>{
 const s=setup(),c=await target(s);s.engine.startManualPreview();await tick(s);const admission=s.engine.dispatchSource(['L0']).manualPreviewAdmission;
 assert.equal(c.arm(),true);s.engine.setAxisValue('L0',.7,0);assert.equal(s.engine.dispatchSource(['L0']).manualPreviewAdmission.admissionRevision,admission.admissionRevision);
 await tick(s);await s.time.advanceTo(s.time.now+10);assert.equal(s.ports.get('a').writeRecords().length,1);await tick(s);assert.equal(c.status().armed,true);
 s.engine.setGlobalOffsetSeconds(.1);s.collection.refresh();assert.equal(c.status().armed,false);
 s.engine.setAxisValue('L0',.3,0);await tick(s);await s.time.advanceTo(s.time.now+10);assert.equal(c.status().armed,false);assert.equal(s.ports.get('a').writeRecords().length,1);await s.collection.dispose();
});

test('real per-target preview admissions keep denied, polled, and unrelated scope inert through target selection',async()=>{
 const s=setup(),a=await target(s,'allowed','L0'),b=await target(s,'denied','L0',false),p=await target(s,'polled','L0',true,'polled'),r=await target(s,'rotation','R0');
 s.engine.startManualPreview();await tick(s);assert.equal(a.arm(),true);assert.equal(r.arm(),true);assert.equal(b.arm(),false);assert.equal(p.arm(),false);
 s.collection.select('denied');s.engine.setAxisValue('L0',.8,0);await tick(s);await s.time.advanceTo(s.time.now+10);
 assert.equal(s.ports.get('allowed').writeRecords().length,1);for(const id of ['denied','polled','rotation'])assert.equal(s.ports.get(id).writeRecords().length,0,id);
 await tick(s);assert.equal(a.status().dispatchSuspended,true);assert.equal(r.status().dispatchSuspended,true);
 s.collection.select('allowed');s.engine.setAxisValue('R0',.2,0);await tick(s);await s.time.advanceTo(s.time.now+10);
 assert.equal(s.ports.get('rotation').writeRecords().length,1);assert.equal(s.ports.get('allowed').writeRecords().length,1);
 assert.equal(s.ports.get('denied').writeRecords().length,0);assert.equal(s.ports.get('polled').writeRecords().length,0);await s.collection.dispose();
});

for(const cancel of ['stop','background','disconnect'])test('real '+cancel+' revokes waiting; restart preview and Set never auto-arm',async()=>{
 const s=setup(),c=await target(s);s.engine.startManualPreview();await tick(s);assert.equal(c.arm(),true);
 if(cancel==='stop')s.engine.stop();if(cancel==='background'){s.engine.setForeground(false);s.engine.setForeground(true);}if(cancel==='disconnect'){await c.disconnect();s.engine.revokeManualPreview();}
 s.collection.refresh();assert.equal(c.status().armed,false);if(cancel==='disconnect')assert.equal(await c.connect(config(s,'a'),new OutputEndpoint()),true);
 s.engine.startManualPreview();await tick(s);s.engine.setAxisValue('L0',.9,0);await tick(s);await s.time.advanceTo(s.time.now+10);
 assert.equal(c.status().armed,false);assert.equal(s.ports.get('a').writeRecords().length,0);await s.collection.dispose();
});
