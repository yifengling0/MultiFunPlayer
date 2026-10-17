import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
registerHooks({resolve(specifier,context,next){return next(specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)?specifier+'.ts':specifier,context);}});
const {AxisConfiguration,SyncConfiguration,SmartLimitPoint}=await import('../entry/src/main/ets/core/AxisConfiguration.ts');
const {DeviceProfile,DeviceAxisDefinition}=await import('../entry/src/main/ets/core/DeviceProfile.ts');
const {AxisPipeline,AxisPipelineConfiguration,AxisStepInput}=await import('../entry/src/main/ets/core/AxisPipeline.ts');
const {AxisScriptResource,AxisKeyframe,AxisScriptBinding}=await import('../entry/src/main/ets/core/AxisScriptStore.ts');
// This fixture was produced by executing pinned ORIGINAL C# source with host
// shims. It is not a second TypeScript/Python transcription. Its provenance
// names every shim; WPF UI, resource Link, real Motion and IO are outside it.
const golden=JSON.parse(readFileSync(process.env.MFP_PIPELINE_GOLDEN ?? new URL('./fixtures/axis-pipeline-valid-golden.json',import.meta.url),'utf8'));
const number=v=>v==='NaN'?NaN:v==='Infinity'?Infinity:v==='-Infinity'?-Infinity:v;
const fieldMap={Offset:'offsetSeconds',AutoHomeDelay:'autoHomeDelaySeconds',AutoHomeDuration:'autoHomeDurationSeconds',MotionProviderMinimumGapDuration:'motionProviderMinimumGapDurationSeconds',Duration:'durationSeconds'};
function populate(target,source){
 for(const [key,value]of Object.entries(source??{})){
  const field=fieldMap[key]??key[0].toLowerCase()+key.slice(1);
  target[field]=key==='InterpolationType'||key==='SmartLimitMode'?value.toLowerCase():key==='SmartLimitPoints'?value.map(([x,y])=>new SmartLimitPoint(x,y)):number(value);
 }
}
function compare(actual,expected,path){
 if(typeof expected==='number'){
  assert.ok(Number.isFinite(actual),`${path}: ${actual} expected ${expected}`);
  assert.ok(Math.abs(actual-expected)<=1e-9,`${path}: ${actual} expected ${expected}`);
 }else if(expected==='NaN'){assert.ok(Number.isNaN(actual),`${path}: ${actual} expected NaN`);}
 else if(expected==='Infinity'||expected==='-Infinity'){assert.equal(actual,number(expected),path);}
 else assert.deepEqual(actual,expected,path);
}
const eventNames={script:'DeviceAxisScriptEvent',autoHome:'DeviceAxisAutoHomeEvent',speedLimitedScript:'DeviceAxisSpeedLimitedScriptEvent'};

test('C# fixture records execution and source/shim provenance',()=>{
 assert.equal(golden.provenance.executedCSharp,true);
 assert.equal(golden.provenance.sourceCommit,'36c08fbb99ac9398a63ff1cca1bbf68cd2228a94');
 assert.ok(golden.provenance.shims.length>0);assert.ok(golden.cases.length>=15);
 assert.equal(golden.provenance.sourceHashNormalization,'CRLF-to-LF; preserve UTF-8 BOM and all other bytes');
 // All pinned originals use LF. Normalize only checkout CRLF (retain BOM),
 // never whitespace or numeric text, so Windows checkout checks the same source.
 for(const [path,expected]of Object.entries(golden.provenance.sourceSha256)){
  const source=readFileSync(new URL('../../'+path,import.meta.url),'utf8').replace(/\r\n/g,'\n');
  assert.equal(createHash('sha256').update(source,'utf8').digest('hex'),expected,path+' source drift');
 }
});
for(const scenario of golden.cases)test('C# original-source trace: '+scenario.name,()=>{
 const input=scenario.input;
 const profile=new DeviceProfile('oracle','oracle',false,4,input.axes.map(a=>new DeviceAxisDefinition(a.name,a.name,[a.name],true,a.defaultValue)));
 const entries=AxisConfiguration.defaultsForProfile(profile);const sync=new SyncConfiguration();
 const cache=new Map();const inputs=new Map();let updates=[];
 const providers={update(axis,name,delta){updates.push(axis+':'+name);if(inputs.has(axis))cache.set(axis,inputs.get(axis));},getValue(axis){return cache.get(axis)??NaN;}};
 let globalOffset=0;let revision=0;let bindings=[];let pipeline;
 const config=()=>new AxisPipelineConfiguration(profile,entries,sync,globalOffset);
 function apply(change){
  if(change.globalOffsetSeconds!==undefined)globalOffset=change.globalOffsetSeconds;
  for(const[name,settings]of Object.entries(change.settings??{}))populate(entries.find(e=>e.axisName===name).settings,settings);
  populate(sync,change.syncSettings);
  for(const[name,points]of Object.entries(change.scripts??{})){
   if(entries.find(e=>e.axisName===name).settings.lockScript && bindings.find(b=>b.axisName===name)?.resource)continue;
   const resource=points===null?null:new AxisScriptResource(name+'-'+(++revision),name,'oracle',points.map(p=>new AxisKeyframe(...p)));
   bindings=bindings.filter(b=>b.axisName!==name).concat(new AxisScriptBinding(name,resource,null,revision));
  }
  for(const[name,value]of Object.entries(change.motionValues??{}))inputs.set(name,number(value));
  if(pipeline){
   if(change.resetSync)pipeline.requestSync(change.resetSync);
   if(change.invalidate)pipeline.invalidateAxes(change.invalidate,false);
   for(const t of change.transitions??[])pipeline.setTransition(t.axisName,t.value,t.durationSeconds,t.offset??false);
  }
 }
 apply(input);pipeline=new AxisPipeline(config(),providers);
 let monotonic=0;
 for(let index=0;index<input.frames.length;index++){
  const command=input.frames[index];const expected=scenario.expected[index];apply(command);updates=[];monotonic+=command.deltaSeconds;
  // The oracle's unchanged desktop media-advance body can introduce sub-ULP
  // rounding. Use its REPORTED position to isolate the axis pipeline from the
  // independent OHOS media-clock adapter, particularly exact keyframe equality.
  const frame=pipeline.step(new AxisStepInput(command.deltaSeconds,expected.mediaPositionSeconds,command.playing,command.playbackSpeed??1,0,monotonic*1000),config(),bindings);
  assert.deepEqual(updates,expected.motionUpdates,`${scenario.name} frame ${index} updates`);
  for(const source of expected.axes){
   const actual=frame.axisStates.find(a=>a.axisName===source.axisName);
   for(const[key,value]of Object.entries(source)){
    if(key==='events')continue;compare(actual[key],value,`${scenario.name} frame ${index} ${source.axisName}.${key}`);
   }
   const events=frame.events.filter(e=>e.axisName===source.axisName);
   assert.equal(events.length,source.events.length,`${scenario.name} frame ${index} ${source.axisName} events`);
   for(let j=0;j<events.length;j++){
    const event=events[j],expectedEvent=source.events[j];
    assert.equal(eventNames[event.kind],expectedEvent.kind);
    compare(event.targetValue,expectedEvent.targetValue,`${scenario.name} frame ${index} event target`);
    compare(event.durationSeconds,expectedEvent.durationSeconds,`${scenario.name} frame ${index} event duration`);
    assert.equal(event.sourceFrameSequence,frame.sequence);assert.equal(event.epoch,frame.epoch);
   }
  }
 }
});
