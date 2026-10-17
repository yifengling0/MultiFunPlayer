import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);}});
const {ContinuousGesture,ContinuousGestureData,convertDriveGesture,convertOffsetGesture}=await import('../entry/src/main/ets/input/ContinuousDriveEngine.ts');
const {ContinuousInputAction}=await import('../entry/src/main/ets/input/ContinuousInputConfiguration.ts');
const {applyContinuousRange,applyContinuousMotion}=await import('../entry/src/main/ets/input/ContinuousInputActions.ts');
const {applyOutputRangeAction}=await import('../entry/src/main/ets/input/ShortcutOutputRangeActions.ts');
const {MotionProviderConfiguration,MotionConfigurations}=await import('../entry/src/main/ets/core/MotionConfiguration.ts');
const {PlaybackSessionCore}=await import('../entry/src/main/ets/core/PlaybackSessionCore.ts');
const {SettingsSchema}=await import('../entry/src/main/ets/settings/SettingsSchema.ts');
const fixture=JSON.parse(readFileSync(new URL('../tools/reference/continuous-drive-028/golden.json',import.meta.url),'utf8'));
const rows=kind=>fixture.rows.filter(row=>row.input.kind===kind);
const data=i=>i.absolute?ContinuousGestureData.absolute(i.value,i.duration):ContinuousGestureData.relative(i.value,i.duration);
const gesture=i=>new ContinuousGesture(i.value,i.delta,i.duration,'touch','x',1,true);
const dataObject=d=>d===null?null:{valueOrDelta:d.valueOrDelta,deltaTime:d.deltaTime,isAbsolute:d.isAbsolute,isRelative:d.isRelative};
const range=(minimum,maximum)=>({axisId:'L0',minimum,maximum,enabled:true});
const context=i=>JSON.stringify(i);
const action=(i,provider='Pattern')=>new ContinuousInputAction(i.action.replace('TCP/0::','OutputTarget::').replace('MotionProvider::Oracle::','MotionProvider::'),'L0',i.action.startsWith('MotionProvider::')?provider:'',i.action.startsWith('TCP/0::')?'tcp:0':'',i.minimumLimit??0,i.maximumLimit??1);
const field=i=>i.action.includes('::Speed::')?'speed':i.action.includes('::Minimum::')?'minimum':'maximum';
const session=()=>{const s=new PlaybackSessionCore(SettingsSchema.defaults());s.setConnected(true);return s;};
const state=t=>({initialized:t.isInitialized,finished:t.isFinished,current:t.currentValue,from:t.fromValue,to:t.toValue,duration:t.durationSeconds,time:t.timeSeconds});

test('700 unchanged C# Drive outputs equal actual converter across five modes, inversion and adjacent center/sign boundaries',()=>{
 for(const row of rows('drive'))assert.deepEqual(dataObject(convertDriveGesture(row.input.mode,row.input.invert,gesture(row.input))),row.output,context(row.input));
});
test('140 unchanged C# Offset outputs equal actual converter; period/deltaTime remain 0.1 and no immediate invoke',()=>{
 for(const row of rows('offset')){
  const i=row.input;assert.equal(convertOffsetGesture(i.mode,i.speed,i.invert,gesture(i)),row.output.offset,context(i));
  assert.equal(row.output.immediate,0);if(row.output.running){assert.equal(row.output.period,.1);assert.equal(row.output.data.deltaTime,.1);assert.equal(row.output.data.isRelative,true);}
 }
});
test('240 unchanged C# ApplyTo outputs equal actual DTO, with modifiers and no implicit time multiplication',()=>{
 for(const row of rows('apply'))assert.equal(data(row.input).applyTo(row.input.current,row.input.modifier),row.output,context(row.input));
});
test('1782 C# output-range Drive rows match actual reducer including reverse/equal bounds or explicit normalized-domain refusal',()=>{
 let count=0,rejected=0,reversed=0,equal=0;
 for(const row of rows('action').filter(r=>r.input.action.startsWith('TCP/0::'))){
  const i=row.input,before=range(i.minimum,i.maximum),saved={...before},a=action(i),savedAction={...a};
  const actual=applyContinuousRange(before,a,data(i));const o=row.output;
  if(o.minimum<0||o.minimum>1||o.maximum<0||o.maximum>1){assert.equal(actual,null,context(i));rejected++;}
  else{assert.ok(actual,context(i));assert.deepEqual(actual.range,{...before,...o},context(i));assert.equal(actual.changed,o.minimum!==i.minimum||o.maximum!==i.maximum,context(i));assert.notEqual(actual.range,before);if(o.minimum>o.maximum)reversed++;if(o.minimum===o.maximum)equal++;}
  assert.deepEqual(before,saved);assert.deepEqual({...a},savedAction);count++;
 }
 assert.equal(count,1782);assert.ok(rejected>0);assert.ok(reversed>0);assert.ok(equal>0);
});
test('Middle and Size Drive remain distinct from original Set helpers, preserving signed-width arithmetic',()=>{
 for(const row of rows('contrast')){
  const i=row.input;const actual=applyOutputRangeAction(range(i.minimum,i.maximum),{operation:i.action.split('::Range::')[1],value:i.value,minimumLimit:0,maximumLimit:1});
  assert.deepEqual({minimum:actual.range.minimum,maximum:actual.range.maximum},row.output);
 }
 const middle=new ContinuousInputAction('OutputTarget::Axis::Range::Middle::Drive','L0','','tcp:0');
 const size=new ContinuousInputAction('OutputTarget::Axis::Range::Size::Drive','L0','','tcp:0');
 assert.deepEqual(applyContinuousRange(range(.2,.7),middle,ContinuousGestureData.absolute(.5,0)).range,range(.25,.75));
 assert.deepEqual(applyOutputRangeAction(range(.2,.7),{operation:'Middle::Set',value:.5,minimumLimit:0,maximumLimit:1}).range,range(.45,.95));
 assert.deepEqual(applyContinuousRange(range(.2,.8),size,ContinuousGestureData.absolute(0,0)).range,range(.5,.5));
 assert.deepEqual(applyOutputRangeAction(range(.2,.8),{operation:'Size::Set',value:0,minimumLimit:0,maximumLimit:1}).range,range(.495,.505));
});
test('162 C# provider rows apply to all four actual named provider models with raw reverse/equal endpoints and bounded invalid-state refusal',()=>{
 let checked=0;
 for(const row of rows('action').filter(r=>r.input.action.startsWith('MotionProvider::'))){
  const i=row.input,key=field(i);
  for(const id of MotionConfigurations.ids()){
   const before=new MotionProviderConfiguration(id);before.minimum=.8;before.maximum=.2;before[key]=i.current;const saved=JSON.stringify(before),valid=MotionConfigurations.validate(before).length===0;
   const actual=applyContinuousMotion(before,action(i,id),data(i));
   if(!valid)assert.equal(actual,null,context(i));
   else{assert.ok(actual,context(i));assert.equal(actual[key],row.output,context(i));assert.notEqual(actual,before);for(const untouched of ['speed','minimum','maximum'].filter(name=>name!==key))assert.equal(actual[untouched],before[untouched],context(i));}
   assert.equal(JSON.stringify(before),saved);checked++;
  }
 }
 assert.equal(checked,648);
});
test('actual session Blend Drive matches C# callback and normal configuration path without publishing or admitting output',()=>{
 let checked=0;
 for(const row of rows('action').filter(r=>r.input.action==='Axis::MotionProviderBlend::Drive')){
  const i=row.input,s=session(),settings=s.getAxisConfiguration('L0');settings.motionProviderBlend=i.current;
  if(i.current>1){assert.throws(()=>s.changeAxisConfiguration('L0',settings));continue;}
  s.changeAxisConfiguration('L0',settings);const before=s.frame();s.applyContinuousAxisAction(action(i),data(i));
  assert.equal(s.getAxisConfiguration('L0').motionProviderBlend,row.output,context(i));assert.equal(s.frame(),before);
  assert.equal(s.isManualPreviewActive(),false);assert.equal(s.dispatchSource(['L0']).authorization,null);checked++;
 }
 assert.equal(checked,45);
});
test('actual session Motion Drive matches original named-provider callback while another provider is selected',()=>{
 let checked=0;
 for(const row of rows('action').filter(r=>r.input.action.startsWith('MotionProvider::'))){
  const i=row.input,key=field(i),s=session(),settings=s.getMotionConfiguration('L0','Pattern');settings.minimum=.8;settings.maximum=.2;settings[key]=i.current;
  if(MotionConfigurations.validate(settings).length>0){assert.throws(()=>s.changeMotionConfiguration('L0',settings));continue;}
  s.changeMotionConfiguration('L0',settings);const axis=s.getAxisConfiguration('L0');axis.selectedMotionProvider='Random';s.changeAxisConfiguration('L0',axis);
  const unrelated=JSON.stringify(s.getMotionConfiguration('L0','Random')),before=s.frame();s.applyContinuousAxisAction(action(i,'Pattern'),data(i));
  assert.equal(s.getMotionConfiguration('L0','Pattern')[key],row.output,context(i));for(const untouched of ['speed','minimum','maximum'].filter(name=>name!==key))assert.equal(s.getMotionConfiguration('L0','Pattern')[untouched],settings[untouched],context(i));assert.equal(JSON.stringify(s.getMotionConfiguration('L0','Random')),unrelated);
  assert.equal(s.frame(),before);assert.equal(s.dispatchSource(['L0']).authorization,null);checked++;
 }
 assert.equal(checked,126);
});
test('108 actual session Axis Value Drive dispatches exact C# duration/offset transition and never starts preview or publishes a frame',()=>{
 for(const row of rows('action').filter(r=>r.input.action==='Axis::Value::Drive')){
  const i=row.input,s=session();
  // Explicit test fixture for the original state's prior raw numeric value, not a produced pipeline frame.
  s.pipeline.states[0].value=i.current;const before=s.frame();s.applyContinuousAxisAction(action(i),data(i));const transition=s.pipeline.transitions[0];
  assert.deepEqual(state(transition),row.output.state,context(i));
  assert.deepEqual([0,.05,.05,.1].map(dt=>{const v=transition.update(dt);return Number.isFinite(v)?v:null;}),row.output.ticks,context(i));
  assert.equal(s.frame(),before);assert.equal(s.isManualPreviewActive(),false);assert.equal(s.dispatchSource(['L0']).authorization,null);
 }
});
