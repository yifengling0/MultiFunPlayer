import {createOutputOwner} from './output-owner-helpers.mjs';
import {setupIndex} from './index-controller-helpers.mjs';
const {PlaybackSessionCore}=await import('../entry/src/main/ets/core/PlaybackSessionCore.ts');
const {FunscriptParser}=await import('../entry/src/main/ets/core/Funscript.ts');
const {OutputConfiguration,SavedOutputTarget,SavedOutputDeviceRanges}=await import('../entry/src/main/ets/settings/OutputConfiguration.ts');
const {OutputCoordinator,OutputEndpoint}=await import('../entry/src/main/ets/output/OutputCoordinator.ts');
const {MemoryTransport}=await import('../entry/src/main/ets/output/MemoryTransport.ts');
const {SettingsSchema}=await import('../entry/src/main/ets/settings/SettingsSchema.ts');
const policy={maximumFrameAgeMs:200,maximumClockAgeMs:750,maximumEventAgeMs:200,maximumFixedElapsedMs:1000,writeTimeoutMs:1000,maximumPolledQueueLength:64,allowZeroInterval:true};
const settle=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
class Time{now=0;id=0;tasks=new Map();nowMs(){return this.now;}scheduleAt(at,fn){this.tasks.set(++this.id,{at,fn});return this.id;}cancel(id){this.tasks.delete(id);}async advance(delta){this.now+=delta;for(const [id,t]of [...this.tasks])if(t.at<=this.now&&this.tasks.delete(id))t.fn();await settle();}}
function setup(config=undefined, options={}){
 const time=new Time(),ports=[];let created=0;const engine=new PlaybackSessionCore(config);engine.flush=()=>{};engine.setForeground(true);engine.setConnected(true);
 const Owner=createOutputOwner(source=>{created++;const c=new OutputCoordinator({inspect:()=>({available:true,diagnostic:''}),create(config){const port=new MemoryTransport(time);port.deferOpen=options.deferOpen ?? false;port.rejectClose=options.rejectClose ?? false;ports.push({id:config.targetId,port});return port;}},source,policy,time,time);const connect=c.connect.bind(c);c.connect=(config,endpoint)=>connect({...config,kind:'memory'},endpoint);return c;});
 const r=setupIndex({engine,outputOwner:Owner,actualResources:options.actualResources});const {page}=r;Owner.restore(engine.outputConfiguration(),engine.activeRegistry().profile,engine.activeRegistry().revision);page.syncOutput();
 return {...r,time,ports,engine,Owner,get created(){return created;}};
}
function edit(s,id,updates={}){
 const d=s.Owner.draftSnapshot(id);d.host='device.local';d.port=1234;d.model.ranges=d.model.ranges.map(r=>({...r,enabled:r.axisId==='L0'}));d.editRevision++;Object.assign(d,updates);s.page.updateOutputDraft(d);return s.Owner.draftSnapshot(id);
}
function playing(s){s.engine.load(FunscriptParser.parse(JSON.stringify({actions:[{at:0,pos:10},{at:10000,pos:90}]})));s.engine.play();s.time.now=40;s.engine.tick(40,40);s.page.syncOutput();}
async function connect(s,id){const d=s.Owner.draftSnapshot(id),e=new OutputEndpoint();Object.assign(e,{host:d.host,port:d.port,family:Number(d.family),localPort:d.localPort,scheme:d.scheme,path:d.path});return s.page.applyOutputConfiguration(d.model.config(s.page.outputProfile,id),e);}
export {setup,edit,playing,connect,settle,SettingsSchema,OutputConfiguration,SavedOutputTarget,SavedOutputDeviceRanges,OutputEndpoint};
