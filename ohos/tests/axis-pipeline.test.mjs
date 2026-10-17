import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, next) { return next(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? specifier + '.ts' : specifier, context); } });
const { AxisConfiguration, AxisConfigurationEntry, SyncConfiguration, SmartLimitPoint } = await import('../entry/src/main/ets/core/AxisConfiguration.ts');
const { DeviceProfile, DeviceAxisDefinition } = await import('../entry/src/main/ets/core/DeviceProfile.ts');
const { AxisPipeline, AxisPipelineConfiguration, AxisStepInput } = await import('../entry/src/main/ets/core/AxisPipeline.ts');
const { AxisScriptResource, AxisKeyframe, AxisScriptBinding, AxisKeyframes } = await import('../entry/src/main/ets/core/AxisScriptStore.ts');
const { AxisTransition } = await import('../entry/src/main/ets/core/AxisTransition.ts');
const { AXIS_INDEX_INVALID: INVALID, AXIS_INDEX_AFTER: AFTER, axisValueChanged } = await import('../entry/src/main/ets/core/AxisState.ts');

function setup(names=['L0'], providers=null) {
  const profile = new DeviceProfile('test','test',false,4,names.map(name => new DeviceAxisDefinition(name,name,[name],true,.5)));
  const entries = AxisConfiguration.defaultsForProfile(profile);
  for(const {settings} of entries) { settings.interpolationType='linear'; settings.selectedMotionProvider=null; settings.updateMotionProviderWithAxis=null; settings.autoHomeEnabled=false; }
  const sync=new SyncConfiguration(); for(const key of Object.keys(sync)) if(key!=='durationSeconds') sync[key]=false;
  const config=()=>new AxisPipelineConfiguration(profile,entries,sync);
  let pipeline=null; const getPipeline=()=>pipeline ??= new AxisPipeline(config(),providers);
  let bindings=[]; let clock=0;
  return { profile,entries,sync,get pipeline(){return getPipeline();},config, setting:(name='L0')=>entries.find(e=>e.axisName===name).settings,
    load(name,points) { const resource=new AxisScriptResource(name+'-'+clock,name,'test',points.map(p=>new AxisKeyframe(...p))); bindings=bindings.filter(b=>b.axisName!==name).concat(new AxisScriptBinding(name,resource)); },
    clear(name) { bindings=bindings.filter(b=>b.axisName!==name); },
    step(position,delta=.1,playing=true,speed=1) {clock+=delta; return getPipeline().step(new AxisStepInput(delta,position,playing,speed,0,clock*1000),config(),bindings);},
    get bindings(){return bindings;}
  };
}
const state=(frame,name='L0')=>frame.axisStates.find(s=>s.axisName===name);
const near=(a,b,tol=1e-12)=>assert.ok(Math.abs(a-b)<=tol,`${a} != ${b}`);
class Cache {
  values=new Map(); updates=[]; next=()=>.8;
  update(name,provider,delta) {this.updates.push([name,provider,delta]); this.values.set(name,this.next(name,provider,delta));}
  getValue(name){return this.values.get(name) ?? NaN;}
}

test('initial/empty/single-point tracks keep NaN; exact tail stops script segments',()=>{
  const h=setup(); let f=h.step(0); assert.ok(Number.isNaN(state(f).value)); assert.equal(state(f).index,INVALID); assert.equal(state(f).isDirty,false);
  h.load('L0',[]); assert.ok(Number.isNaN(state(h.step(1)).value));
  h.load('L0',[[2,.8]]); f=h.step(1); assert.equal(state(f).index,-1); assert.equal(f.events[0].targetValue,.8); assert.ok(Number.isNaN(f.events[0].durationSeconds));
  f=h.step(2); assert.equal(state(f).index,0); assert.equal(state(f).insideScript,true); assert.ok(Number.isNaN(state(f).value));
  h.load('L0',[[0,.1],[1,.9]]); near(state(h.step(.5)).value,.5); f=h.step(1); assert.equal(state(f).index,1); assert.ok(Number.isNaN(state(f).scriptValue)); near(state(f).value,.5);
  h.sync.syncOnScriptEnd=true; f=h.step(1.1); assert.equal(state(f).index,AFTER); assert.ok(Number.isNaN(f.events[0].targetValue));
  f=h.step(.25); assert.equal(state(f).index,0); near(state(f).scriptValue,.3);
});

test('seconds offsets, custom neutral, scale clamp and invert remain distinct from raw events',()=>{
  const h=setup(); h.profile.axes[0].defaultValue=.2;
  // Profile change requires new pipeline; construct it with the final profile.
  const cfg=new AxisPipelineConfiguration(h.profile,h.entries,h.sync,.1);
  const p=new AxisPipeline(cfg); const settings=AxisConfiguration.clone(h.entries[0].settings); settings.offsetSeconds=.2; settings.scriptScale=2; settings.invertScript=true;
  const next=new AxisPipelineConfiguration(h.profile,[new AxisConfigurationEntry('L0',settings)],h.sync,.1);
  const r=new AxisScriptResource('x','x','test',[new AxisKeyframe(0,.1),new AxisKeyframe(1,.9)]);
  const f=p.step(new AxisStepInput(.1,.55,true),next,[new AxisScriptBinding('L0',r)]);
  near(state(f).scriptValue,.6); assert.equal(f.events[0].targetValue,.9); assert.equal(f.events[0].durationSeconds,1);
});

test('gap uses value OR time epsilon and contiguous remaining duration, never merely long duration',()=>{
  const points=values=>values.map(v=>new AxisKeyframe(...v));
  assert.equal(AxisKeyframes.isGap(points([[0,0],[10,1]]),0),false);
  assert.equal(AxisKeyframes.isGap(points([[0,0],[10,.000999]]),0),true);
  assert.equal(AxisKeyframes.isGap(points([[0,0],[10,.001]]),0),false);
  assert.equal(AxisKeyframes.isGap(points([[0,0],[.000999,1]]),0),true);
  assert.equal(AxisKeyframes.isGap(points([[0,0],[.001,1]]),0),false);
  const p=points([[0,.2],[3,.2],[7,.2],[10,.8]]);
  assert.equal(AxisKeyframes.gapDuration(p,0),7); assert.equal(AxisKeyframes.gapDuration(p,1),4); assert.equal(AxisKeyframes.gapDuration(p,2),-1);
});

test('Bypass preserves index, clears insideGap, and does not imply Invalid',()=>{
  const h=setup(); h.load('L0',[[0,.2],[10,.2]]); assert.equal(state(h.step(1)).insideGap,true);
  h.setting().bypassScript=true; const f=h.step(2); assert.equal(state(f).index,0); assert.equal(state(f).insideScript,true); assert.equal(state(f).insideGap,false); assert.ok(Number.isNaN(state(f).scriptValue));
});

test('motion gating reads shared cached value even when paused/no-script and bypass retains cache',()=>{
  const cache=new Cache(); const h=setup(['L0'],cache); h.setting().selectedMotionProvider='Pattern';
  let f=h.step(0,.1,false); assert.equal(cache.updates.length,0); assert.ok(Number.isNaN(state(f).value));
  cache.values.set('L0',.8); f=h.step(0,.1,false); near(state(f).motionProviderValue,.8); assert.equal(cache.updates.length,0);
  h.setting().updateMotionProviderWithoutScript=true; h.setting().updateMotionProviderWhenPaused=true;
  f=h.step(0,.2,false,4); assert.deepEqual(cache.updates.at(-1),['L0','Pattern',.2]);
  h.setting().bypassMotionProvider=true; f=h.step(0,.1,false); assert.ok(Number.isNaN(state(f).motionProviderValue)); assert.equal(cache.values.get('L0'),.8);
});

test('script motion blend and eligible gap forcing use original gap entry reset',()=>{
  const cache=new Cache(); const h=setup(['L0'],cache); const s=h.setting(); s.selectedMotionProvider='Pattern'; s.motionProviderBlend=.5;
  h.load('L0',[[0,.2],[10,.8]]); near(state(h.step(0)).motionProviderValue,.5);
  h.load('L0',[[0,.2],[10,.2]]); s.motionProviderFillGaps=true;
  const f=h.step(1); near(state(f).motionProviderValue,.8); near(state(f).syncTimeSeconds,3.9);
});

test('all-axis begin/update/end gives one-frame Smart dependency and array-order independence',()=>{
  const run=names=>{
    const h=setup(names); const s=h.setting('L1'); s.smartLimitInputAxis='L0'; s.smartLimitTargetValue=0; s.smartLimitPoints=[new SmartLimitPoint(0,100),new SmartLimitPoint(100,0)];
    h.load('L0',[[0,0],[10,1]]);h.load('L1',[[0,1],[10,1]]);
    const frames=[h.step(0),h.step(5),h.step(10)]; return frames.map(f=>['L0','L1'].map(n=>state(f,n).value));
  };
  const a=run(['L0','L1']); assert.deepEqual(a,run(['L1','L0'])); assert.deepEqual(a,[[0,1],[.5,1],[.5,.5]]);
});

test('motion follow gates and limits against previous dirty/signed speed',()=>{
  const cache=new Cache(); const h=setup(['L0','L1'],cache); const s=h.setting('L1'); s.selectedMotionProvider='Pattern';s.updateMotionProviderWithAxis='L0';s.updateMotionProviderWithoutScript=true;
  h.load('L0',[[0,0],[10,1]]);
  assert.ok(Number.isNaN(state(h.step(0,1),'L1').value)); assert.equal(cache.updates.length,0);
  let f=h.step(1,1); near(state(f,'L0').speed,-.1); assert.equal(cache.updates.length,1); near(state(f,'L1').motionProviderValue,.8);
  cache.next=()=>0; f=h.step(2,1); near(state(f,'L1').motionProviderValue,0); near(state(f,'L1').value,.7);
});

test('Transition set/end-once/append matches source sentinel and coverage rules',()=>{
  const t=new AxisTransition(); assert.ok(Number.isNaN(t.update(1)));t.set(0,1,1);near(t.update(.25),.25);t.append(.5,.5);near(t.update(.25),.5);near(t.update(1),1.5);assert.ok(Number.isNaN(t.update(1)));
  const h=setup();h.pipeline.setTransition('L0',.9,1);near(state(h.step(0,.5,false)).value,.7);near(state(h.step(0,.5,false)).value,.9);assert.ok(Number.isNaN(state(h.step(0,.1,false)).transitionValue));
  h.load('L0',[[1,.2],[2,.8]]);h.pipeline.setTransition('L0',.1,1);const f=h.step(0,.5,false);assert.equal(state(f).index,-1);near(state(f).transitionValue,.5);near(state(f).value,.9);
});

test('AutoHome initial NaN, dirty reset, delay boundary, smoothstep and stable completion',()=>{
  const h=setup();Object.assign(h.setting(),{autoHomeEnabled:true,autoHomeDelaySeconds:1,autoHomeDurationSeconds:2});
  for(let i=0;i<4;i++)assert.ok(Number.isNaN(state(h.step(0,1,false)).value));
  h.pipeline.setTransition('L0',1,0);h.step(0,.1,false); h.step(0,.1,false); // transition departure is dirty too
  let f=h.step(0,.5,false); assert.equal(state(f).isAutoHoming,false);
  f=h.step(0,.5,false); assert.equal(state(f).isAutoHoming,true);near(state(f).value,1); assert.equal(f.events[0].kind,'autoHome');assert.equal(f.events[0].durationSeconds,2);
  f=h.step(0,1,false);near(state(f).value,.75); f=h.step(0,1,false);near(state(f).value,.5);assert.equal(state(f).isAutoHoming,true);assert.equal(h.step(0,1,false).events.length,0);
});

test('zero-duration Home marks homing before delay exactly as the source branch',()=>{
  const h=setup();Object.assign(h.setting(),{autoHomeEnabled:true,autoHomeDelaySeconds:5,autoHomeDurationSeconds:0});
  h.pipeline.setTransition('L0',1,0);h.step(0,.1,false);h.step(0,.1,false);
  const f=h.step(0,.1,false);assert.equal(state(f).isAutoHoming,true);near(state(f).value,1);assert.equal(f.events[0].kind,'autoHome');
});

test('Sync recursively blends previous final value, counts down during home, no UI advancement',()=>{
  const h=setup();h.load('L0',[[0,1],[10,1]]);h.step(0);h.pipeline.requestSync();
  h.pipeline.setTransition('L0',0,0); // valid script still wins
  const before=h.pipeline.snapshot();assert.equal(h.pipeline.snapshot(),before);
  let f=h.step(0,1);near(state(f).syncTimeSeconds,3);near(state(f).value,1);
  h.clear('L0');h.pipeline.setTransition('L0',0,0);f=h.step(0,1);near(state(f).value,1-Math.pow(2,-7.5));near(state(f).syncTimeSeconds,2);
  h.pipeline.requestSync(undefined,false);near(state(h.step(0)).syncTimeSeconds,0);
});

test('SpeedLimit threshold equality, zero maximum, source speed sign and raw event wrapping',()=>{
  const h=setup();Object.assign(h.setting(),{speedLimitEnabled:true,speedLimitUnitsPerSecond:.2});h.load('L0',[[0,0],[1,1]]);
  let f=h.step(0,1);assert.equal(f.events[0].kind,'speedLimitedScript');near(f.events[0].targetValue,.2);near(f.events[0].to.value,1);
  f=h.step(.2,1);near(state(f).value,.2);assert.equal(state(f).isSpeedLimited,true);near(state(f).speed,-.2);
  h.setting().speedLimitUnitsPerSecond=0;f=h.step(.5,1);near(state(f).value,.2);assert.equal(state(f).isSpeedLimited,true);
  assert.throws(()=>h.step(.2,0),/Math.Sign/);
});

test('NaN dirty XOR, exact epsilon, and zero-delta source arithmetic are explicit',()=>{
  assert.equal(axisValueChanged(NaN,NaN),false);assert.equal(axisValueChanged(NaN,0),true);assert.equal(axisValueChanged(0,NaN),true);
  assert.equal(axisValueChanged(0,1e-6),false);assert.equal(axisValueChanged(0,1.00001e-6),true);
  const h=setup();h.pipeline.setTransition('L0',.2,0);h.step(0,0);const f=h.step(0,0);assert.ok(Number.isNaN(state(f).speed));
  for(const d of [-1,NaN,Infinity])assert.throws(()=>h.step(0,d),/Invalid axis frame/);
});

test('frame/config/resource ownership and session epoch prevent stale or external mutation',()=>{
  const h=setup();h.load('L0',[[0,.1],[1,.9]]);const f=h.step(.5);const config=h.config();
  assert.throws(()=>{f.axisStates[0].value=1;},TypeError);assert.throws(()=>f.events.push(null),TypeError);assert.throws(()=>{config.axisSettings[0].settings.smartLimitPoints[0].y=0;},TypeError);
  assert.throws(()=>{h.bindings[0].resource.keyframes[0].value=1;},TypeError);
  h.entries[0].settings.scriptScale=2;assert.equal(config.axisSettings[0].settings.scriptScale,1);
  h.pipeline.invalidateAxes(undefined,false);near(state(h.pipeline.snapshot()).value,.5);
  h.pipeline.resetRuntime(1);assert.ok(Number.isNaN(state(h.pipeline.snapshot()).value));assert.throws(()=>h.step(.5),/epoch/);assert.throws(()=>h.pipeline.resetRuntime(1),/increase/);
  const fresh=h.pipeline.step(new AxisStepInput(.1,.5,true,1,1,1),h.config(),h.bindings);assert.equal(fresh.epoch,1);assert.ok(fresh.sequence>f.sequence);
});

test('all four kernels in seconds match preview kernels only inside actual segments',async()=>{
  const {interpolateAxis}=await import('../entry/src/main/ets/core/Interpolation.ts');
  const raw=[[0,.1],[.6,.8],[1,.2],[2.2,.9],[4,.3]]; const points=raw.map(x=>new AxisKeyframe(...x));
  const axis={actions:raw.map(([x,y])=>({at:x*1000,pos:y*100}))};
  for(const mode of ['linear','pchip','makima','step']) for(const t of [.1,.59,.6,.75,1,1.5,2.2,3.8]) {
    const index=AxisKeyframes.advanceIndex(points,AxisKeyframes.searchForIndexBefore(points,t),t);
    near(Math.max(0,Math.min(1,AxisKeyframes.interpolate(points,index,t,mode))),interpolateAxis(axis,t*1000,mode)/100);
  }
});

test('same-frame provider reset applies before sync; cached reads never advance provider time',()=>{
  let pipeline;const cache=new Cache();cache.next=()=>{pipeline.requestSync(['L0']);return 1;};
  const h=setup(['L0'],cache);Object.assign(h.setting(),{selectedMotionProvider:'Pattern',updateMotionProviderWithoutScript:true});pipeline=h.pipeline;
  const f=h.step(0,.25);near(state(f).value,.5+.5/1024);near(state(f).syncTimeSeconds,3.75);
  for(let i=0;i<10;i++){assert.equal(h.pipeline.snapshot(),f);h.pipeline.getValue('L0');}assert.equal(cache.updates.length,1);
});

test('paused/no-script Motion gate combinations independently permit updates',()=>{
  for(const playing of [false,true])for(const whenPaused of [false,true])for(const withoutScript of [false,true])for(const hasScript of [false,true]){
    const cache=new Cache();const h=setup(['L0'],cache);Object.assign(h.setting(),{selectedMotionProvider:'Pattern',updateMotionProviderWhenPaused:whenPaused,updateMotionProviderWithoutScript:withoutScript});
    const c=new Cache();const p=setup(['L0'],c);Object.assign(p.setting(),h.setting());if(hasScript)p.load('L0',[[0,0],[1,1]]);p.step(.5,.1,playing);
    assert.equal(c.updates.length,Number((playing||whenPaused)&&(withoutScript||hasScript)),JSON.stringify({playing,whenPaused,withoutScript,hasScript}));
  }
});

test('Home countdown is real elapsed time, sync continues under home, and bypass-all leaves postprocessing enabled',()=>{
  const h=setup();Object.assign(h.setting(),{autoHomeEnabled:true,autoHomeDelaySeconds:0,autoHomeDurationSeconds:1});
  h.pipeline.setTransition('L0',1,0);h.step(0,.1,false);h.step(0,.1,false);
  Object.assign(h.setting(),{bypassScript:true,bypassMotionProvider:true,bypassTransition:true});
  const f=h.step(0,.25,false,4);near(state(f).autoHomeTimeSeconds,.25);near(state(f).value,1-.5*(.25*.25*(3-2*.25)));assert.equal(state(f).isAutoHoming,true);near(state(f).syncTimeSeconds,3.75);
});

test('motion follower does not update while target previous frame is auto-homing',()=>{
  const cache=new Cache();const h=setup(['L0','L1'],cache);Object.assign(h.setting('L0'),{autoHomeEnabled:true,autoHomeDelaySeconds:0,autoHomeDurationSeconds:1});Object.assign(h.setting('L1'),{selectedMotionProvider:'Pattern',updateMotionProviderWithAxis:'L0',updateMotionProviderWithoutScript:true,updateMotionProviderWhenPaused:true});
  h.pipeline.setTransition('L0',1,0);h.step(0,.1,false);h.step(0,.1,false);let f=h.step(0,.1,false);assert.equal(state(f,'L0').isAutoHoming,true);
  const updates=cache.updates.length;f=h.step(0,.1,false);assert.equal(cache.updates.length,updates);assert.equal(state(f,'L0').isDirty,true);
});

test('GetValue clamps appended transition raw state without falsifying internal source trace',()=>{
 const h=setup();h.pipeline.setTransition('L0',1,1);h.step(0,.5,false);h.pipeline.setTransition('L0',1,.1,true);
 const f=h.step(0,1,false);assert.equal(state(f).value,2);assert.equal(h.pipeline.getValue('L0'),1);
});

test('no provider port fails explicitly before committing any frame',()=>{
 const h=setup();h.setting().selectedMotionProvider='Random';const p=h.pipeline;const old=p.snapshot();assert.throws(()=>h.step(0),/explicit provider port/);assert.equal(p.snapshot(),old);
});

test('disabled stored axes resolve once into enabled immutable pipeline settings',()=>{
 const h=setup(['L0','L1']);h.profile.axes[1].enabled=false;h.setting('L0').smartLimitInputAxis='L1';
 const config=new AxisPipelineConfiguration(h.profile,h.entries,h.sync);assert.equal(config.axes.length,1);assert.equal(config.axisSettings[0].settings.smartLimitInputAxis,null);assert.equal(h.setting('L0').smartLimitInputAxis,'L1');assert.equal(config.diagnostics[0].code,'inactive_axis_reference');
});

test('nonreset settings changes do not restart sync; matching source handlers do',()=>{
 const h=setup();h.load('L0',[[0,.2],[20,.8]]);h.step(0);h.pipeline.requestSync();h.step(1,1);h.setting().speedLimitEnabled=true;h.setting().speedLimitUnitsPerSecond=.5;
 near(state(h.step(2,1)).syncTimeSeconds,2);h.setting().offsetSeconds=.1;near(state(h.step(3,1)).syncTimeSeconds,3);
});

test('a rejected source arithmetic tick latches fault and requires full provider/runtime reconstruction',()=>{
 const cache=new Cache();const h=setup(['L0'],cache);Object.assign(h.setting(),{speedLimitEnabled:true,speedLimitUnitsPerSecond:Infinity});h.load('L0',[[0,.2],[1,.8]]);
 h.step(0,.1);const last=h.pipeline.snapshot();assert.throws(()=>h.step(0,0),/Math.Sign/);
 const fault=h.pipeline.getFault();assert.equal(fault.epoch,0);assert.equal(fault.attemptedSequence,last.sequence+1);assert.match(fault.reason,/Math.Sign/);assert.equal(fault.recovery,'recreatePipelineAndProviders');assert.equal(h.pipeline.snapshot(),last);
 assert.throws(()=>{fault.reason='ignored';},TypeError);assert.throws(()=>h.step(.1,.1),/is faulted/);assert.throws(()=>h.pipeline.resetRuntime(1),/new AxisPipeline and provider/);
 const recovered=new AxisPipeline(h.config(),new Cache(),1);assert.equal(recovered.getFault(),null);assert.equal(recovered.step(new AxisStepInput(.1,0,true,1,1),h.config(),h.bindings).epoch,1);
});

test('provider failure cannot publish partially updated axes or resume on the old session',()=>{
 let calls=0;const provider={update(name){calls++;if(name==='L1')throw new Error('provider failed');},getValue(){return .8;}};const h=setup(['L0','L1'],provider);
 for(const e of h.entries)Object.assign(e.settings,{selectedMotionProvider:'Pattern',updateMotionProviderWithoutScript:true});const last=h.pipeline.snapshot();
 assert.throws(()=>h.step(0),/provider failed/);assert.equal(calls,2);assert.equal(h.pipeline.snapshot(),last);assert.ok(last.axisStates.every(s=>Number.isNaN(s.value)));assert.throws(()=>h.step(0),/is faulted/);assert.equal(calls,2);
});

test('confirmed seek can advance epoch and invalidate index while preserving last value and runtime',()=>{
 const h=setup();h.load('L0',[[0,.1],[10,.9]]);const before=h.step(5,.1);h.pipeline.advanceEpoch(1);h.pipeline.invalidateAxes(undefined,false);
 assert.equal(h.pipeline.snapshot(),before);assert.equal(h.pipeline.snapshot().epoch,0);near(h.pipeline.getValue('L0'),.5);
 assert.throws(()=>h.step(2),/epoch/);assert.throws(()=>h.pipeline.advanceEpoch(1),/increase/);
 const after=h.pipeline.step(new AxisStepInput(.1,2,true,1,1,200),h.config(),h.bindings);assert.equal(after.epoch,1);near(state(after).value,.26);near(state(after).speed,2.4);assert.equal(after.events[0].epoch,1);
});

test('advanceEpoch preserves transition progress but cannot unlock a fault',()=>{
 const h=setup();h.pipeline.setTransition('L0',1,1);h.step(0,.25,false);h.pipeline.advanceEpoch(1);
 const next=h.pipeline.step(new AxisStepInput(.25,0,false,1,1),h.config());near(state(next).value,.75);
 const broken=setup();Object.assign(broken.setting(),{speedLimitEnabled:true,speedLimitUnitsPerSecond:1});broken.load('L0',[[0,.2],[1,.8]]);broken.step(0);assert.throws(()=>broken.step(0,0),/Math.Sign/);assert.throws(()=>broken.pipeline.advanceEpoch(1),/new AxisPipeline and provider/);
});

test('new identical-content resource identity resets script state while same instance does not',()=>{
 const h=setup();h.sync.syncOnScriptResourceChanged=true;const config=h.config();const p=new AxisPipeline(config);
 const make=()=>new AxisScriptResource('same','same','test',[new AxisKeyframe(0,.1),new AxisKeyframe(10,.9)]);const first=make();
 p.step(new AxisStepInput(1,1,true),config,[new AxisScriptBinding('L0',first)]);
 let f=p.step(new AxisStepInput(1,2,true),config,[new AxisScriptBinding('L0',first)]);near(state(f).syncTimeSeconds,2);assert.equal(f.events.length,0);
 f=p.step(new AxisStepInput(1,3,true),config,[new AxisScriptBinding('L0',make())]);near(state(f).syncTimeSeconds,3);assert.equal(f.events.length,1);
});
