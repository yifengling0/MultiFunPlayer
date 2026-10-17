// Standalone reproducible host benchmark and bounded-lineage stress test.
// node --expose-gc --test ohos/tests/axis-pipeline-provenance-stress.test.mjs
// MFP_AXIS_STRESS_FRAMES may INCREASE the default 100,000 frames per scenario.
import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);}});
const core=process.env.MFP_AXIS_BENCH_CORE_ROOT?pathToFileURL(process.env.MFP_AXIS_BENCH_CORE_ROOT.replace(/\/?$/,'/')):new URL('../entry/src/main/ets/core/',import.meta.url);
const {AxisConfiguration,SyncConfiguration,SmartLimitPoint}=await import(new URL('AxisConfiguration.ts',core).href);
const {DeviceProfile,DeviceAxisDefinition}=await import(new URL('DeviceProfile.ts',core).href);
const {AxisPipeline,AxisPipelineConfiguration,AxisStepInput}=await import(new URL('AxisPipeline.ts',core).href);
const {AxisScriptResource,AxisKeyframe,AxisScriptStore}=await import(new URL('AxisScriptStore.ts',core).href);
const {MotionRegistry}=await import(new URL('motion/MotionRegistry.ts',core).href);
const frames=Math.max(100000,Number(process.env.MFP_AXIS_STRESS_FRAMES)||100000);
const names=['L0','L1','L2','R0','R1','R2'];
for(const complex of [false,true])test(`bounded provenance ${complex?'linked/sync/smart/speed/motion':'normal'} six-axis ${frames} frames`,()=>{
 const profile=new DeviceProfile('stress','stress',false,4,names.map(n=>new DeviceAxisDefinition(n,n,[n],true,.5)));
 const settings=AxisConfiguration.defaultsForProfile(profile),sync=new SyncConfiguration();
 for(const key of Object.keys(sync))if(key!=='durationSeconds')sync[key]=false;
 for(const [index,{settings:s}]of settings.entries()){
  Object.assign(s,{autoHomeEnabled:false,selectedMotionProvider:null,updateMotionProviderWithAxis:null,interpolationType:'linear'});
  if(complex){Object.assign(s,{linkAxis:index===0?null:'L0',linkAxisHasPriority:index!==0,speedLimitEnabled:true,speedLimitUnitsPerSecond:.7});
   if(index>0)Object.assign(s,{smartLimitInputAxis:'L0',smartLimitPoints:[new SmartLimitPoint(0,90),new SmartLimitPoint(100,70)]});
   if(index===2||index===5)Object.assign(s,{selectedMotionProvider:'Pattern',motionProviderBlend:.4,updateMotionProviderWithoutScript:true});
  }
 }
 const config=new AxisPipelineConfiguration(profile,settings,sync),registry=complex?new MotionRegistry(names):null;
 const pipeline=new AxisPipeline(config,registry),store=new AxisScriptStore(names,settings);
 const resource=new AxisScriptResource('stress-script','stress','test',[new AxisKeyframe(0,.1),new AxisKeyframe(10,.9),new AxisKeyframe(20,.1)]);
 for(const name of complex?['L0']:names)store.setScript(name,resource);
 const bindings=store.snapshot(),samples=[],heaps=[];let maxOrigins=0,maxDependencies=0,maxSources=0,maxStages=0,maxControlReferences=0,maxControlSamples=0;
 const warmup=5000;
 for(let index=0;index<warmup;index++){
  if(complex&&index%100===0)pipeline.requestSync();
  pipeline.step(new AxisStepInput(.01,(index%1999)/100,true,1,0,index*10),config,bindings);
 }
 let checksum=0;
 const started=performance.now();
 for(let index=0;index<frames;index++){
  if(complex&&index%100===0)pipeline.requestSync();
  const start=performance.now();const frame=pipeline.step(new AxisStepInput(.01,(index%1999)/100,true,1,0,index*10),config,bindings);
  samples.push(performance.now()-start);
  if(index%100===0||index===frames-1){
   checksum+=frame.axisStates.reduce((sum,state)=>sum+(Number.isFinite(state.value)?state.value:0),0);
   if(!process.env.MFP_AXIS_BENCH_CORE_ROOT)assert.ok(Array.isArray(frame.provenance));
   for(const proof of frame.provenance??[]){
    maxOrigins=Math.max(maxOrigins,proof.origins.length);maxDependencies=Math.max(maxDependencies,proof.dependencies.length);maxSources=Math.max(maxSources,proof.finalSources.length);maxStages=Math.max(maxStages,proof.stages.length);
    assert.ok(proof.origins.length<=64);assert.ok(proof.dependencies.length<=32);assert.ok(proof.finalSources.length<=7);assert.ok(proof.stages.length<=16);
    for(const origin of proof.origins){if(origin.control){maxControlReferences=Math.max(maxControlReferences,origin.control.references.length);maxControlSamples=Math.max(maxControlSamples,origin.control.samples.length);assert.ok(origin.control.references.length<=64);assert.ok(origin.control.samples.length<=2);assert.ok(origin.control.sourceKinds.length<=7);}if(origin.anchor)assert.ok(origin.anchor.sourceKinds.length<=7);}
   }
  }
  if(index>=9999&&index%10000===9999){if(global.gc)global.gc();heaps.push(process.memoryUsage().heapUsed);}
 }
 const elapsed=performance.now()-started;const average=samples.reduce((a,b)=>a+b,0)/samples.length;samples.sort((a,b)=>a-b);
 const report={scenario:complex?'complex':'normal',frames,warmup,checksum,core:core.pathname,axes:6,averageStepMs:average,p95StepMs:samples[Math.floor(samples.length*.95)],p99StepMs:samples[Math.floor(samples.length*.99)],maxStepMs:samples.at(-1),elapsedMs:elapsed,maxOrigins,maxDependencies,maxSources,maxStages,maxControlReferences,maxControlSamples,explicitGc:!!global.gc,heapSamplesBytes:heaps};
 // Retained-size bound, not a brittle RSS/allocator timing assertion. GC is
 // explicit only in the documented invocation; Node's default runner omits it.
 if(global.gc&&heaps.length>=4){const warm=heaps[Math.floor(heaps.length/2)];assert.ok(heaps.at(-1)-warm<8*1024*1024,'retained heap grows beyond 8 MiB after warmup');}
 assert.equal(pipeline.snapshot().sequence,frames+warmup);console.log('AXIS_PROVENANCE_STRESS '+JSON.stringify(report));
});
