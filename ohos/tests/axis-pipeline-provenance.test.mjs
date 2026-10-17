import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({resolve(specifier,context,next){return next(specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)?specifier+'.ts':specifier,context);}});
const {AxisConfiguration,SyncConfiguration,SmartLimitPoint}=await import('../entry/src/main/ets/core/AxisConfiguration.ts');
const {DeviceProfile,DeviceAxisDefinition}=await import('../entry/src/main/ets/core/DeviceProfile.ts');
const {AxisPipeline,AxisPipelineConfiguration,AxisStepInput}=await import('../entry/src/main/ets/core/AxisPipeline.ts');
const {AxisScriptResource,AxisKeyframe,AxisScriptBinding,AxisScriptStore}=await import('../entry/src/main/ets/core/AxisScriptStore.ts');
const {MotionRegistry}=await import('../entry/src/main/ets/core/motion/MotionRegistry.ts');
const {MotionUpdateObservation}=await import('../entry/src/main/ets/core/motion/MotionProvider.ts');
const resource=(id,points=[[0,.2],[10,.8]])=>new AxisScriptResource(id,id,'test',points.map(point=>new AxisKeyframe(...point)));
function harness(names=['L0'],providers=null){
 const profile=new DeviceProfile('evidence','evidence',false,4,names.map(n=>new DeviceAxisDefinition(n,n,[n],true,.5)));
 const entries=AxisConfiguration.defaultsForProfile(profile),sync=new SyncConfiguration();
 for(const {settings:s}of entries)Object.assign(s,{autoHomeEnabled:false,selectedMotionProvider:null,updateMotionProviderWithAxis:null,interpolationType:'linear'});
 for(const key of Object.keys(sync))if(key!=='durationSeconds')sync[key]=false;
 const config=()=>new AxisPipelineConfiguration(profile,entries,sync);let pipeline=null,epoch=0,time=0,bindings=[];
 return {entries,profile,sync,config,get pipeline(){return pipeline??=new AxisPipeline(config(),providers);},
 setting:(n='L0')=>entries.find(e=>e.axisName===n).settings,
 load(name,id,points){bindings=bindings.filter(b=>b.axisName!==name).concat(new AxisScriptBinding(name,resource(id,points),null,1));},
 setBindings(value){bindings=value;},
 step(position=0,delta=.1,playing=true){time+=delta;return this.pipeline.step(new AxisStepInput(delta,position,playing,1,epoch,time*1000),config(),bindings);},
 advance(){this.pipeline.advanceEpoch(++epoch);},get epoch(){return epoch;}};
}
const p=(frame,name='L0')=>frame.provenance.find(v=>v.axisName===name);
const v=(frame,name='L0')=>frame.axisStates.find(v=>v.axisName===name);
const motionSettings=h=>Object.assign(h.setting(),{selectedMotionProvider:'Pattern',updateMotionProviderWithoutScript:true,updateMotionProviderWhenPaused:true});

test('provenance no source/NaN is none, not implicit playing authorization',()=>{
 const h=harness();assert.equal(p(h.pipeline.snapshot()).status,'none');
 for(const playing of [true,false]){const f=h.step(NaN,.1,playing);assert.equal(f.isPlaying,playing);assert.equal(p(f).status,'none');assert.deepEqual(p(f).finalSources,[]);assert.equal(p(f).autoHomeApplied,false);assert.equal(p(f).motionApplied,false);}
});
test('script origins carry raw resource binding identity; paused script is not held/motion/home',()=>{
 const h=harness();h.load('L0','script-one');const first=h.step(1);const paused=h.step(1,.1,false),q=p(paused);
 assert.equal(q.status,'known');assert.equal(q.primarySource,'script');assert.deepEqual(q.finalSources,['script']);
 assert.equal(q.origins[0].resourceId,'script-one');assert.equal(q.origins[0].bindingRevision,1);assert.equal(q.origins[0].firstFrameSequence,paused.sequence);
 assert.equal(q.origins[0].isPlaying,false);assert.equal(q.motionApplied,false);assert.equal(q.autoHomeApplied,false);
 assert.notEqual(first.sequence,paused.sequence);assert.equal(v(first).value,v(paused).value);
});
test('terminal hold retains producer frame, old epoch and config instead of refreshing origins',()=>{
 const h=harness();h.load('L0','one',[[0,.2],[1,.8]]);const first=h.step(.5);const held=h.step(1);
 assert.equal(p(held).primarySource,'held');assert.ok(p(held).finalSources.includes('held'));assert.equal(p(held).origins[0].lastFrameSequence,first.sequence);
 h.advance();assert.equal(h.pipeline.snapshot(),held);const after=h.step(1);assert.equal(after.epoch,1);assert.equal(p(after).crossEpoch,true);assert.equal(p(after).dependencies[0].epoch,0);
 h.setting().speedLimitEnabled=true;h.setting().speedLimitUnitsPerSecond=1;const changed=h.step(1);
 assert.equal(changed.configurationRevision,1);assert.equal(p(changed).crossConfiguration,true);
 const same=h.step(1);assert.equal(same.configurationRevision,changed.configurationRevision);
});
test('legacy void motion port and unobserved prefilled cache remain unknown',()=>{
 const port={update(){},getValue(){return .8;}};const h=harness(['L0'],port);motionSettings(h);
 const first=h.step(0,.1,false);assert.equal(v(first).value,.8);assert.equal(p(first).status,'unknown');assert.equal(p(first).motionUpdated,true);assert.equal(p(first).motionSampleProduced,null);assert.equal(p(first).motionApplied,false);
 h.setting().updateMotionProviderWhenPaused=false;const cache=h.step(0,.1,false);assert.equal(p(cache).status,'unknown');assert.equal(p(cache).motionUpdated,false);assert.equal(p(cache).motionCacheRead,true);
});
test('real provider fresh sample vs paused cache keeps actual origin and generation',()=>{
 const registry=new MotionRegistry(['L0']);const h=harness(['L0'],registry);motionSettings(h);
 const fresh=h.step(0,.1,false),origin=p(fresh).origins.find(o=>o.source==='motion');assert.equal(p(fresh).status,'known');assert.equal(p(fresh).motionSampleProduced,true);assert.equal(p(fresh).motionApplied,true);assert.equal(origin.providerId,'Pattern');assert.equal(origin.providerWriteGeneration,1);
 h.setting().updateMotionProviderWhenPaused=false;const cached=h.step(0,.1,false);assert.equal(p(cached).motionUpdated,false);assert.equal(p(cached).motionSampleProduced,null);assert.equal(p(cached).motionApplied,false);assert.equal(p(cached).origins.find(o=>o.source==='motion').firstFrameSequence,fresh.sequence);assert.equal(p(cached).crossConfiguration,true);
});
test('Looping early return and provider switching cannot launder initial/old samples',()=>{
 const registry=new MotionRegistry(['L0']);const h=harness(['L0'],registry);motionSettings(h);h.step();
 h.setting().selectedMotionProvider='Looping Script';h.pipeline.requestSync(undefined,false);
 const empty=h.step();assert.equal(v(empty).motionProviderValue,0);assert.equal(p(empty).status,'unknown');assert.equal(p(empty).motionSampleProduced,false);
 registry.setScriptResource('L0',resource('loop'));h.pipeline.invalidateMotionProvenance();const loaded=h.step();assert.equal(p(loaded).motionSampleProduced,true);assert.equal(p(loaded).origins.find(o=>o.source==='motion'&&o.providerId==='Looping Script').resourceId,'loop');
 h.pipeline.requestSync(undefined,false);const known=h.step();assert.equal(p(known).status,'known');
 registry.setScriptResource('L0',null);h.pipeline.invalidateMotionProvenance();const old=h.step();assert.equal(p(old).motionSampleProduced,false);assert.equal(p(old).status,'unknown');assert.equal(p(old).motionApplied,false);assert.equal(p(old).origins.find(o=>o.source==='motion').resourceId,'loop');
});
test('observed provider private cache retains its original frame when switched away and back',()=>{
 const registry=new MotionRegistry(['L0']);registry.setScriptResource('L0',resource('loop'));const h=harness(['L0'],registry);motionSettings(h);h.setting().selectedMotionProvider='Looping Script';const loop=h.step();
 h.setting().selectedMotionProvider='Pattern';h.step();
 registry.setScriptResource('L0',null); // no scalar mutation; intentionally keep origin generation to examine retained read
 h.setting().selectedMotionProvider='Looping Script';const back=h.step();const origin=p(back).origins.find(o=>o.source==='motion'&&o.providerId==='Looping Script');
 assert.equal(p(back).motionSampleProduced,false);assert.equal(origin.firstFrameSequence,loop.sequence);assert.equal(origin.resourceId,'loop');assert.equal(p(back).motionApplied,false);
});
test('provider invalidation taints held final lineage and is read-only for numeric runtime',()=>{
 const registry=new MotionRegistry(['L0']);const h=harness(['L0'],registry);motionSettings(h);const first=h.step();
 h.pipeline.invalidateMotionProvenance(['L0']);assert.equal(h.pipeline.snapshot(),first);
 h.setting().bypassMotionProvider=true;const after=h.step();assert.equal(v(after).value,v(first).value);assert.equal(p(after).status,'unknown');assert.ok(p(after).origins.some(o=>o.providerGeneration===0));
 h.setting().bypassMotionProvider=false;h.step();h.pipeline.requestSync(undefined,false);const recovered=h.step();assert.equal(p(recovered).status,'known');assert.ok(p(recovered).origins.some(o=>o.providerGeneration===1));
});
test('AutoHome delay t=0 flag is not applied home; t>0 records actual baseline and applied source',()=>{
 const h=harness();Object.assign(h.setting(),{autoHomeEnabled:true,autoHomeDelaySeconds:1,autoHomeDurationSeconds:2});
 h.pipeline.setTransition('L0',1,0);h.step(0,.1,false);h.step(0,.1,false);
 const waiting=h.step(0,1,false);assert.equal(v(waiting).isAutoHoming,true);assert.equal(p(waiting).autoHomeApplied,false);assert.ok(p(waiting).stages.includes('autoHomeWait'));
 const home=h.step(0,1,false);assert.equal(p(home).autoHomeApplied,true);assert.equal(p(home).primarySource,'autoHome');assert.ok(p(home).finalSources.includes('transition'));assert.ok(p(home).dependencies.some(d=>d.role==='autoHomeStart'));assert.equal(p(home).motionApplied,false);
 const done=h.step(0,1,false);assert.deepEqual(p(done).finalSources,['autoHome']);assert.equal(p(done).autoHomeApplied,true);
});
test('Home replacing a freshly calculated motion sample does not falsely mark motion applied',()=>{
 let generation=0;const port={update(){return new MotionUpdateObservation(true,'Pattern',++generation,generation,.8,'fresh');},getValue(){return .8;}};
 const h=harness(['L0'],port);motionSettings(h);Object.assign(h.setting(),{autoHomeEnabled:true,autoHomeDelaySeconds:0,autoHomeDurationSeconds:1});h.step(0,.1,false);
 const home=h.step(0,.5,false);assert.equal(p(home).motionSampleProduced,true);assert.equal(p(home).motionApplied,false);assert.equal(p(home).autoHomeApplied,true);assert.ok(p(home).finalSources.includes('motion'));assert.ok(p(home).finalSources.includes('autoHome'));
});
test('Sync mixed old epoch/current source is exposed until the source blend actually finishes',()=>{
 const h=harness();h.load('L0','one');h.step(0);h.advance();h.pipeline.requestSync();const f=h.step(1,1);
 assert.equal(p(f).crossEpoch,true);assert.ok(p(f).dependencies.some(d=>d.role==='syncPrevious'&&d.epoch===0));assert.deepEqual([...new Set(p(f).origins.map(o=>o.epoch))],[0,1]);
 for(let i=0;i<5;i++)h.step(1,1);assert.equal(p(h.pipeline.snapshot()).crossEpoch,false);
});
test('Smart and follow inspect previous-frame dependency lineage regardless of axis array order',()=>{
 for(const names of [['L0','L1'],['L1','L0']]){
  const registry=new MotionRegistry(names);const h=harness(names,registry);h.load('L0','driver');Object.assign(h.setting('L1'),{selectedMotionProvider:'Pattern',updateMotionProviderWithAxis:'L0',updateMotionProviderWithoutScript:true,smartLimitInputAxis:'L0',smartLimitPoints:[new SmartLimitPoint(0,50),new SmartLimitPoint(100,50)]});
  const first=h.step(0);const f=h.step(1);const q=p(f,'L1');assert.ok(q.dependencies.some(d=>d.role==='motionFollow'&&d.axisName==='L0'&&d.frameSequence===first.sequence));assert.ok(q.dependencies.some(d=>d.role==='smartInput'&&d.frameSequence===first.sequence));assert.ok(q.origins.some(o=>o.axisName==='L0'&&o.lastFrameSequence===first.sequence));
 }
});
test('zero speed cap removes current motion contribution; zero-delta fault publishes no provenance',()=>{
 const registry=new MotionRegistry(['L0']);const h=harness(['L0'],registry);motionSettings(h);h.step();Object.assign(h.setting(),{speedLimitEnabled:true,speedLimitUnitsPerSecond:0});
 const capped=h.step();assert.equal(p(capped).motionSampleProduced,true);assert.equal(p(capped).motionApplied,false);assert.ok(p(capped).stages.includes('speedLimit'));
 h.setting().bypassMotionProvider=true;const stationary=h.step();assert.throws(()=>h.step(0,0),/Math.Sign/);assert.equal(h.pipeline.snapshot(),stationary);assert.throws(()=>h.step(),/faulted/);assert.equal(h.pipeline.snapshot().provenance,stationary.provenance);
});
test('provenance snapshots, origins and dependency arrays cannot be mutated across consumers',()=>{
 const h=harness();h.load('L0','one');h.step(0);h.pipeline.requestSync();const f=h.step(1),q=p(f);
 for(const action of [()=>q.finalSources.push('unknown'),()=>{q.origins[0].epoch=999;},()=>q.dependencies[0].sources.push('unknown'),()=>{f.provenance[0]=null;},()=>{q.motionApplied=true;}])assert.throws(action,TypeError);
 assert.equal(h.pipeline.snapshot(),f);assert.equal(p(h.pipeline.snapshot()).status,'known');
});
test('long sync retains direct current write and a bounded historical scalar summary',()=>{
 const registry=new MotionRegistry(['L0']);const h=harness(['L0'],registry);motionSettings(h);h.step();h.pipeline.requestSync();
 for(let i=0;i<500;i++){const f=h.step(0,.001,false);assert.equal(p(f).status,'known');assert.ok(p(f).origins.length<=3);}
 const q=p(h.pipeline.snapshot());const origin=q.origins.find(o=>o.source==='motion'&&!o.isPlaying);assert.equal(origin.lastProviderWriteGeneration,origin.providerWriteGeneration);assert.ok(q.origins.some(o=>o.source==='historical'&&o.anchor.sourceKinds.includes('motion')));
});
test('Link uses raw resource provenance and Lock retains original resource identity',()=>{
 const h=harness(['L0','L1']);h.setting('L1').linkAxis='L0';const store=new AxisScriptStore(['L0','L1'],h.entries);
 store.setScript('L0',resource('original'));h.setBindings(store.snapshot());const first=h.step(1);assert.equal(p(first,'L1').origins[0].resourceId,'original');assert.equal(p(first,'L1').origins[0].axisName,'L1');
 h.setting('L1').lockScript=true;store.setConfiguration(h.entries);store.setScript('L0',resource('replacement'));h.setBindings(store.snapshot());const changed=h.step(1);assert.equal(p(changed,'L0').origins.find(o=>o.source==='script'&&o.lastFrameSequence===changed.sequence).resourceId,'replacement');assert.equal(p(changed,'L1').origins.find(o=>o.source==='script'&&o.lastFrameSequence===changed.sequence).resourceId,'original');
});

test('motion dirty/speed-follow carries both driver frames across an epoch boundary',()=>{
 const registry=new MotionRegistry(['L0','L1']);const h=harness(['L0','L1'],registry);h.load('L0','driver');Object.assign(h.setting('L1'),{selectedMotionProvider:'Pattern',updateMotionProviderWithAxis:'L0',updateMotionProviderWithoutScript:true,motionProviderSpeedLimitWithAxis:true});
 h.step(0);h.advance();const current=h.step(1);assert.equal(p(current,'L0').crossEpoch,false);
 const follower=h.step(2),q=p(follower,'L1');const samples=q.origins.filter(o=>o.control!==null).flatMap(o=>o.control.samples);assert.ok(samples.some(s=>s.axisName==='L0'&&s.epoch===0));assert.ok(samples.some(s=>s.axisName==='L0'&&s.epoch===1));assert.equal(q.crossEpoch,true);
});
test('replayed write counter and malformed value observation cannot certify a fresh sample',()=>{
 let mismatch=false;const port={update(){return new MotionUpdateObservation(true,'Pattern',1,1,mismatch?.9:.8,'fresh');},getValue(){return .8;}};
 const h=harness(['L0'],port);motionSettings(h);const first=h.step();assert.equal(p(first).motionSampleProduced,true);
 const replay=h.step();assert.equal(p(replay).motionSampleProduced,false);assert.equal(p(replay).motionApplied,false);assert.equal(p(replay).origins[0].firstFrameSequence,first.sequence);
 mismatch=true;const wrong=h.step();assert.equal(p(wrong).motionSampleProduced,false);assert.equal(p(wrong).status,'unknown');
});
test('long held frames never accumulate source tags or old dependency trees',()=>{
 const h=harness();h.pipeline.setTransition('L0',.3,0);h.step();
 for(let index=0;index<1000;index++){const q=p(h.step());assert.deepEqual(q.finalSources,['transition','held']);assert.equal(q.dependencies.length,1);assert.equal(q.origins.length,1);}
});

test('provider callbacks cannot mutate the caller input into a different frame identity',()=>{
 let input;let generation=0;
 const port={update(){input.isPlaying=false;input.epoch=999;input.monotonicMs=999;return new MotionUpdateObservation(true,'Pattern',++generation,generation,.6,'fresh');},getValue(){return .6;}};
 const h=harness(['L0'],port);motionSettings(h);input=new AxisStepInput(.1,0,true,1,0,10);
 const f=h.pipeline.step(input,h.config(),[]);assert.equal(f.isPlaying,true);assert.equal(f.epoch,0);assert.equal(f.monotonicMs,10);assert.equal(p(f).origins[0].isPlaying,true);
});

test('repeated resource revisions consume bounded historical scalars rather than exhausting origin budget',()=>{
 const h=harness();let last;
 for(let index=0;index<80;index++){
  h.load('L0','unique-'+index);h.pipeline.requestSync();last=h.step(1);
  assert.ok(p(last).origins.length<=64);assert.ok(p(last).dependencies.length<=32);
 }
 assert.equal(p(last).origins.length,2);assert.equal(p(last).status,'known');assert.ok(!p(last).finalSources.includes('unknown'));
 h.pipeline.requestSync(undefined,false);const replaced=h.step(1);assert.equal(p(replaced).status,'known');assert.equal(p(replaced).origins.length,1);assert.equal(p(replaced).origins[0].resourceId,'unique-79');
});

function currentAnchor(origin,frame,role){
 const a=origin.anchor;assert.ok(a);assert.equal(a.role,role);assert.equal(a.sourceStatus,'known');
 assert.equal(a.consumerFrameSequence,frame.sequence);assert.equal(a.consumerEpoch,frame.epoch);
 assert.equal(a.consumerProfileRevision,frame.profileRevision);assert.equal(a.consumerConfigurationRevision,frame.configurationRevision);
 assert.equal(a.sourceProfileRevision,frame.profileRevision);assert.equal(a.sourceProfileValid,true);assert.ok(a.sourceKinds.length>0);assert.ok(!a.sourceKinds.includes('historical'));return a;
}
test('live config edit marks only the actual historical Sync scalar as a current trusted anchor',()=>{
 const h=harness();h.load('L0','live');const old=h.step(1);h.setting().scriptScale=.5;const fresh=h.step(2);
 assert.equal(p(fresh).crossConfiguration,true);assert.equal(p(fresh).status,'known');
 const historical=p(fresh).origins.find(o=>o.configurationRevision===old.configurationRevision);
 const anchor=currentAnchor(historical,fresh,'syncPrevious');assert.equal(anchor.sourceFrameSequence,old.sequence);
 const direct=p(fresh).origins.find(o=>o.configurationRevision===fresh.configurationRevision);assert.equal(direct.anchor,null);assert.equal(direct.lastFrameSequence,fresh.sequence);
 assert.equal(p(old).origins[0].anchor,null);assert.throws(()=>{historical.anchor.consumerEpoch=999;},TypeError);
});
test('seek and resource reload expose trusted previous scalars without refreshing original producer identity',()=>{
 const h=harness();h.sync.syncOnScriptResourceChanged=true;h.load('L0','before');const old=h.step(1);
 h.advance();h.pipeline.requestSync();const seek=h.step(2);assert.equal(p(seek).status,'known');assert.equal(p(seek).crossEpoch,true);
 for(const origin of p(seek).origins.filter(o=>o.epoch===0)){const a=currentAnchor(origin,seek,'syncPrevious');assert.equal(a.sourceFrameSequence,old.sequence);}
 assert.ok(p(seek).origins.some(o=>o.epoch===1&&o.anchor===null&&o.lastFrameSequence===seek.sequence));
 h.load('L0','after');const reload=h.step(3);const oldScript=p(reload).origins.find(o=>o.source==='historical'&&o.anchor.sourceKinds.includes('script'));const a=currentAnchor(oldScript,reload,'syncPrevious');assert.equal(a.sourceFrameSequence,seek.sequence);assert.equal(a.sourceEpoch,seek.epoch);
 assert.ok(p(reload).origins.some(o=>o.resourceId==='after'&&o.anchor===null&&o.lastFrameSequence===reload.sequence));
});
test('same original Motion sample used as cache AND Sync anchor remains two distinct auditable paths',()=>{
 const registry=new MotionRegistry(['L0']);const h=harness(['L0'],registry);motionSettings(h);const old=h.step();
 h.setting().updateMotionProviderWhenPaused=false;const paused=h.step(0,.1,false);const origins=p(paused).origins.filter(o=>o.source==='historical'||(o.source==='motion'&&o.firstFrameSequence===old.sequence));
 assert.equal(origins.length,2);assert.equal(origins.filter(o=>o.anchor===null).length,1);
 currentAnchor(origins.find(o=>o.anchor!==null),paused,'syncPrevious');assert.equal(p(paused).motionApplied,false);assert.equal(p(paused).motionSampleProduced,null);
});
test('invalidated cached Motion still denies when the same sample also appears under a valid Sync anchor',()=>{
 const registry=new MotionRegistry(['L0']);const h=harness(['L0'],registry);motionSettings(h);h.step();h.pipeline.invalidateMotionProvenance();h.setting().updateMotionProviderWhenPaused=false;
 const f=h.step(0,.1,false);assert.equal(p(f).status,'unknown');
 assert.ok(p(f).origins.some(o=>o.source==='motion'&&o.anchor===null));
 currentAnchor(p(f).origins.find(o=>o.source==='historical'&&o.anchor.sourceKinds.includes('motion')),f,'syncPrevious');
});
test('unknown historical scalar cannot be washed known by a genuine new source plus Sync',()=>{
 const port={update(){},getValue(){return .8;}};const h=harness(['L0'],port);motionSettings(h);const old=h.step();assert.equal(p(old).status,'unknown');
 h.setting().bypassMotionProvider=true;h.load('L0','new-known');const f=h.step(1);assert.equal(p(f).status,'unknown');
 assert.ok(p(f).origins.some(o=>o.source==='script'&&o.anchor===null&&o.lastFrameSequence===f.sequence));
 assert.ok(p(f).dependencies.some(d=>d.role==='syncPrevious'&&d.status==='unknown'));
});
test('hold does not refresh an earlier anchor; explicit known Home/Transition/Speed reads do',()=>{
 const h=harness();h.load('L0','old',[[0,.2],[1,.8]]);h.step(.2);h.pipeline.requestSync();const synced=h.step(.3);
 h.pipeline.requestSync(undefined,false);const held=h.step(1);assert.equal(p(held).primarySource,'held');
 assert.ok(p(held).origins.some(o=>o.anchor!==null&&o.anchor.consumerFrameSequence===synced.sequence));
 assert.ok(p(held).origins.every(o=>o.anchor===null||o.anchor.consumerFrameSequence!==held.sequence));
 h.setting().bypassScript=true;h.pipeline.setTransition('L0',.9,1);const transition=h.step(1);assert.ok(p(transition).origins.some(o=>o.anchor?.role==='transitionStart'));for(const o of p(transition).origins.filter(o=>o.anchor?.role==='transitionStart'))currentAnchor(o,transition,'transitionStart');
 const home=harness();Object.assign(home.setting(),{autoHomeEnabled:true,autoHomeDelaySeconds:0,autoHomeDurationSeconds:2});home.pipeline.setTransition('L0',1,0);home.step(0,.1,false);home.step(0,.1,false);const homing=home.step(0,.5,false);
 for(const o of p(homing).origins.filter(o=>o.source==='historical'&&o.anchor.sourceKinds.includes('transition')))currentAnchor(o,homing,'autoHomeStart');assert.equal(p(homing).autoHomeApplied,true);
 const speed=harness();speed.load('L0','script');speed.step(0);Object.assign(speed.setting(),{speedLimitEnabled:true,speedLimitUnitsPerSecond:.01});const limited=speed.step(5);
 assert.ok(p(limited).origins.some(o=>o.anchor?.role==='speedPrevious'));for(const o of p(limited).origins.filter(o=>o.anchor?.role==='speedPrevious'))currentAnchor(o,limited,'speedPrevious');
});

for(const limited of [false,true])test(`continuous 2000 live scale/offset edits remain bounded and known; speed cap=${limited}`,()=>{
 const h=harness();h.load('L0','continuous',[[0,.1],[1000,.9]]);h.setting().speedLimitEnabled=limited;h.setting().speedLimitUnitsPerSecond=.01;h.step(1);
 let maxOrigins=0;
 for(let index=0;index<2000;index++){
  h.setting().scriptScale=.5+(index%100)/200;h.setting().offsetSeconds=(index%20)/100;
  const f=h.step(1+(index+1)*.04,.04);const proof=p(f);assert.equal(proof.status,'known',`edit ${index}`);
  maxOrigins=Math.max(maxOrigins,proof.origins.length);assert.ok(proof.origins.length<=3);assert.ok(proof.dependencies.length<=3);
  for(const origin of proof.origins.filter(o=>o.source==='historical'))currentAnchor(origin,f,origin.anchor.role);
 }
 for(let index=0;index<250;index++)assert.equal(p(h.step(90+index*.04,.04)).status,'known');
 assert.ok(maxOrigins<=3);
});
test('historical summary preserves unknown and profile-invalid source boundaries without recursive kinds',async()=>{
 const {AxisSourceOrigin,AxisValueProvenance,AxisHistoricalAnchor}=await import('../entry/src/main/ets/core/AxisState.ts');
 const bad=new AxisValueProvenance('L0',1,0,0,0,true,[],'script',['script'],[new AxisSourceOrigin('script','L0',1,0,1,0,true)],[],false,false,'known');
 const a=new AxisHistoricalAnchor('syncPrevious',bad,2,0,0,1);assert.equal(a.sourceProfileValid,false);assert.deepEqual(a.sourceKinds,['script']);assert.equal(AxisHistoricalAnchor.copy(a).sourceProfileValid,false);
 const unknown=new AxisValueProvenance('L0',1,0,0,0,true,[],'unknown',['historical','unknown','unknown'],[],[],false,false,'unknown');
 const b=new AxisHistoricalAnchor('syncPrevious',unknown,2,0,0,1);assert.equal(b.sourceStatus,'unknown');assert.deepEqual(b.sourceKinds,['unknown']);assert.throws(()=>b.sourceKinds.push('script'),TypeError);
});

function currentControl(origin,frame,consumer,role,kind,checkCurrent=true){
 const c=origin.control;assert.equal(origin.source,'control');assert.ok(c);assert.equal(origin.anchor,null);
 assert.equal(c.consumerAxisName,consumer);assert.equal(c.role,role);assert.equal(c.inputKind,kind);
 assert.equal(c.consumerFrameSequence,frame.sequence);assert.equal(c.consumerEpoch,frame.epoch);
 assert.equal(c.consumerProfileRevision,frame.profileRevision);assert.equal(c.consumerConfigurationRevision,frame.configurationRevision);
 assert.equal(c.readFrameSequence,frame.sequence-1);assert.ok(c.sourceFrameSequence<=c.readFrameSequence);
 if(kind!=='speed')assert.equal(c.sourceFrameSequence,c.readFrameSequence);
 assert.equal(c.sourceStatus,'known');assert.equal(c.sourceProfileValid,true);if(checkCurrent)assert.equal(c.sourceCurrentValid,true);
 assert.ok(c.samples.length>=1&&c.samples.length<=2);assert.ok(c.references.length<=64);
 assert.ok(!c.sourceKinds.includes('control'));assert.ok(!c.sourceKinds.includes('historical'));return c;
}
for(const mode of ['value','speed'])test(`Smart ${mode}: 2000 live edits have bounded actual previous-frame control and scalar anchor`,()=>{
 const h=harness(['L0','L1']);h.load('L0','main',[[0,.1],[1000,.9]]);h.load('L1','driver',[[0,.5],[1000,.5]]);
 Object.assign(h.setting(),{smartLimitInputAxis:'L1',smartLimitMode:mode,smartLimitPoints:[new SmartLimitPoint(0,50),new SmartLimitPoint(100,50)]});
 h.step(1);
 for(let i=0;i<2000;i++){
  h.setting().scriptScale=.5+(i%100)/200;h.setting().offsetSeconds=(i%20)/100;
  const f=h.step(1+i*.04,.04),q=p(f);assert.equal(q.status,'known');assert.ok(q.origins.length<=4);assert.ok(q.dependencies.length<=3);
  const c=currentControl(q.origins.find(o=>o.control!==null),f,'L0','smartInput','value');assert.equal(c.sourceAxisName,'L1');
  assert.notEqual(c.sourceConfigurationRevision,c.consumerConfigurationRevision);
  if(mode==='speed')currentAnchor(q.origins.find(o=>o.anchor?.role==='smartPrevious'),f,'smartPrevious');
 }
});
test('cyclic Smart inputs use last complete frame in either axis enumeration order',()=>{
 const traces=[];
 for(const names of [['L0','L1'],['L1','L0']]){
  const h=harness(names);for(const [n,start]of [['L0',.2],['L1',.7]]){h.load(n,n,[[0,start],[100,.9]]);Object.assign(h.setting(n),{smartLimitInputAxis:n==='L0'?'L1':'L0',smartLimitMode:'speed',smartLimitPoints:[new SmartLimitPoint(0,50),new SmartLimitPoint(100,80)]});}
  const values=[];for(let i=0;i<200;i++){h.setting().scriptScale=.5+i/1000;const f=h.step(i*.04,.04);for(const n of names){assert.equal(p(f,n).status,'known');assert.ok(p(f,n).origins.length<=4);}values.push(['L0','L1'].map(n=>v(f,n).value));}traces.push(values);
 }assert.deepEqual(traces[0],traces[1]);
});
test('cyclic real Pattern follow starts from script plus observed initial NaN classification, remains bounded through edits',()=>{
 const registry=new MotionRegistry(['L0','L1']);const h=harness(['L0','L1'],registry);
 for(const [n,start]of [['L0',.2],['L1',.7]]){h.load(n,n,[[0,start],[100,.9]]);Object.assign(h.setting(n),{selectedMotionProvider:'Pattern',motionProviderBlend:.5,motionProviderSpeedLimitWithAxis:false,updateMotionProviderWithAxis:n==='L0'?'L1':'L0'});}
 let invalid=0,recovered=0;const priorInvalid=new Map();const first=h.step(0,.04);for(const n of ['L0','L1']){assert.equal(p(first,n).status,'known');assert.equal(p(first,n).motionUpdated,false);}
 for(let i=1;i<2000;i++){
  h.setting().scriptScale=.5+(i%100)/200;h.setting().offsetSeconds=(i%20)/100;
  const f=h.step(i*.04,.04);for(const n of ['L0','L1']){const q=p(f,n);assert.equal(q.status,'known',`${n} frame${i}`);assert.ok(q.origins.length<=6);const c=currentControl(q.origins.find(o=>o.control!==null),f,n,'motionFollow','activity',false);if(!c.sourceCurrentValid){invalid++;priorInvalid.set(n,true);}else if(priorInvalid.get(n)){recovered++;priorInvalid.set(n,false);}assert.ok(c.references.length<=4);if(i===1)assert.equal(c.samples[0].status,'none');else assert.ok(c.samples.every(s=>s.status==='known'));}
 }assert.equal(invalid,0);assert.equal(recovered,0);
});
test('follow speed proof retains exact two producer samples and separate current activity read',()=>{
 const registry=new MotionRegistry(['L0','L1']);const h=harness(['L0','L1'],registry);h.load('L0','driver',[[0,.1],[100,.9]]);h.load('L1','follower',[[0,.8],[100,.2]]);
 Object.assign(h.setting('L1'),{selectedMotionProvider:'Pattern',motionProviderBlend:.5,updateMotionProviderWithAxis:'L0',motionProviderSpeedLimitWithAxis:true});h.step(0,.04);h.step(.04,.04);
 let caps=0;for(let i=2;i<202;i++){h.setting('L1').scriptScale=.5+(i%100)/200;const f=h.step(i*.04,.04),q=p(f,'L1');assert.equal(q.status,'known');assert.ok(q.origins.length<=6);for(const o of q.origins.filter(o=>o.control!==null)){const c=currentControl(o,f,'L1','motionFollow',o.control.inputKind);if(c.inputKind==='speed'){caps++;assert.equal(c.samples.length,2);assert.equal(c.samples[0].frameSequence+1,c.samples[1].frameSequence);}}}assert.ok(caps>0);
});
test('control references reject clear/replace of raw held script and recover on genuinely replaced source',()=>{
 const h=harness(['L0','L1']);h.load('L0','main',[[0,.2],[100,.8]]);h.load('L1','driver',[[0,.5],[100,.5]]);
 Object.assign(h.setting(),{smartLimitInputAxis:'L1',smartLimitPoints:[new SmartLimitPoint(0,50),new SmartLimitPoint(100,50)]});h.step(1);h.step(2);
 h.setBindings([new AxisScriptBinding('L0',resource('main',[[0,.2],[100,.8]]),null,1)]);
 const clear=h.step(3),control=p(clear).origins.find(o=>o.control!==null).control;assert.equal(control.sourceCurrentValid,false);assert.equal(p(clear).status,'known');assert.equal(p(clear,'L1').status,'known');
 h.load('L1','new-driver',[[0,.6],[100,.6]]);h.step(4);h.pipeline.requestSync(undefined,false);const recover=h.step(5);assert.equal(p(recover).status,'known');assert.equal(p(recover).origins.find(o=>o.control!==null).control.references.find(r=>r.axisName==='L1').resourceId,'new-driver');
});
test('unknown finite and retained provider cache cannot be laundered by control summaries',()=>{
 const registry=new MotionRegistry(['L0','L1']);const h=harness(['L0','L1'],registry);h.load('L0','main');Object.assign(h.setting(),{smartLimitInputAxis:'L1',smartLimitPoints:[new SmartLimitPoint(0,50),new SmartLimitPoint(100,50)]});
 Object.assign(h.setting('L1'),{selectedMotionProvider:'Pattern',updateMotionProviderWithoutScript:true,updateMotionProviderWhenPaused:true});h.step();h.step();
 h.setting('L1').updateMotionProviderWhenPaused=false;h.step(0,.1,false);const retained=h.step(0,.1,false);assert.equal(p(retained).status,'known');assert.equal(p(retained).origins.find(o=>o.control!==null).control.sourceCurrentValid,true);
 h.pipeline.invalidateMotionProvenance(['L1']);const invalid=h.step(0,.1,false);assert.equal(p(invalid).origins.find(o=>o.control!==null).control.sourceCurrentValid,false);
 const legacy=harness(['L0','L1'],{update(){},getValue(){return .8;}});legacy.load('L0','main');Object.assign(legacy.setting(),{smartLimitInputAxis:'L1',smartLimitPoints:[new SmartLimitPoint(0,50),new SmartLimitPoint(100,50)]});Object.assign(legacy.setting('L1'),{selectedMotionProvider:'Pattern',updateMotionProviderWithoutScript:true});legacy.step();assert.equal(p(legacy.step()).status,'unknown');
});
test('control references, samples and nested arrays are immutable across consumers',()=>{
 const h=harness(['L0','L1']);for(const n of ['L0','L1'])h.load(n,n);Object.assign(h.setting(),{smartLimitInputAxis:'L1',smartLimitPoints:[new SmartLimitPoint(0,50)]});h.step();const f=h.step(),c=p(f).origins.find(o=>o.control!==null).control;
 for(const mutate of [()=>{c.consumerEpoch=9;},()=>c.samples.push(null),()=>c.references.push(null),()=>c.samples[0].sourceKinds.push('unknown'),()=>{c.references[0].resourceId='fake';}])assert.throws(mutate,TypeError);assert.equal(h.pipeline.snapshot(),f);assert.equal(p(f).status,'known');
});

test('cache-use receipt certifies a real retained read without refreshing actual producer or activity',()=>{
 const registry=new MotionRegistry(['L0']);const h=harness(['L0'],registry);motionSettings(h);const first=h.step();assert.equal(p(first).motionCacheValidated,true);
 h.setting().updateMotionProviderWhenPaused=false;const cached=h.step(0,.1,false),q=p(cached);assert.equal(q.motionCacheValidated,true);assert.equal(q.motionSampleProduced,null);assert.equal(q.motionApplied,false);assert.equal(q.origins.find(o=>o.source==='motion').lastFrameSequence,first.sequence);
 h.pipeline.invalidateMotionProvenance();const invalid=h.step(0,.1,false);assert.equal(p(invalid).motionCacheValidated,false);assert.equal(p(invalid).status,'unknown');
});
test('unsupported skipped observations cannot certify a retained read, even if the previous write was known',()=>{
 let value=.6,generation=0;const port={update(){return new MotionUpdateObservation(true,'Pattern',++generation,generation,value,'fresh');},getValue(){return value;}};
 const h=harness(['L0','L1'],port);Object.assign(h.setting('L1'),{selectedMotionProvider:'Pattern',updateMotionProviderWithoutScript:true,updateMotionProviderWhenPaused:true});h.load('L0','main');Object.assign(h.setting(),{smartLimitInputAxis:'L1',smartLimitPoints:[new SmartLimitPoint(0,50)]});
 const first=h.step();assert.equal(p(first,'L1').motionCacheValidated,true);h.setting('L1').updateMotionProviderWhenPaused=false;value=.8;
 const skipped=h.step(0,.1,false);assert.equal(p(skipped,'L1').motionCacheValidated,false);assert.equal(p(skipped,'L1').status,'unknown');assert.equal(v(skipped,'L1').motionProviderValue,.8);const dependent=h.step(0,.1,false);assert.equal(p(dependent).origins.find(o=>o.control!==null).control.sourceCurrentValid,false);
});
test('same write identity with a changed scalar is not an authenticated retained sample',()=>{
 let value=.6;const port={update(){return new MotionUpdateObservation(true,'Pattern',1,1,value,'fresh');},getObservation(){return new MotionUpdateObservation(false,'Pattern',1,1,value,'retained');},getValue(){return value;}};
 const h=harness(['L0'],port);motionSettings(h);h.step();h.setting().updateMotionProviderWhenPaused=false;value=.9;
 const f=h.step(0,.1,false);assert.equal(v(f).motionProviderValue,.9);assert.equal(p(f).motionCacheValidated,false);assert.equal(p(f).status,'unknown');
});
test('current historical/control classes deep-copy nonclass DTO inputs',async()=>{
 const {AxisSourceOrigin,AxisValueProvenance}=await import('../entry/src/main/ets/core/AxisState.ts');
 const h=harness(['L0','L1']);for(const n of ['L0','L1'])h.load(n,n);Object.assign(h.setting(),{smartLimitInputAxis:'L1',smartLimitPoints:[new SmartLimitPoint(0,50)]});h.step();const original=p(h.step()),raw=structuredClone(original);
 const copied=AxisValueProvenance.copy(raw),c=copied.origins.find(o=>o.control!==null).control;raw.origins.find(o=>o.control!==null).control.samples[0].sourceKinds.push('unknown');raw.origins.find(o=>o.control!==null).control.references[0].resourceId='changed';
 assert.ok(!c.samples[0].sourceKinds.includes('unknown'));assert.notEqual(c.references[0].resourceId,'changed');assert.ok(Object.isFrozen(c));
});

test('true unknown in a feedback cycle stays denied until explicit new-epoch pipeline/provider reconstruction',()=>{
 const registry=new MotionRegistry(['L0','L1']);const h=harness(['L0','L1'],registry);
 const bindings=[new AxisScriptBinding('L0',resource('main',[[0,.1],[100,.9]]),null,1)];h.setBindings(bindings);
 Object.assign(h.setting(),{smartLimitInputAxis:'L1',smartLimitMode:'speed',smartLimitPoints:[new SmartLimitPoint(0,50),new SmartLimitPoint(100,50)]});
 Object.assign(h.setting('L1'),{selectedMotionProvider:'Looping Script',bypassScript:true,motionProviderBlend:1,updateMotionProviderWithAxis:'L0',motionProviderSpeedLimitWithAxis:true,updateMotionProviderWithoutScript:true});
 registry.setScriptResource('L1',resource('old-loop'));for(let i=0;i<150;i++)h.step(i*.04,.04);assert.equal(p(h.pipeline.snapshot()).status,'known');
 registry.setScriptResource('L1',null);h.pipeline.invalidateMotionProvenance(['L1']);for(let i=150;i<170;i++)h.step(i*.04,.04);assert.equal(p(h.pipeline.snapshot()).status,'unknown');
 const replacement=resource('new-loop',[[0,.8],[10,.2]]);registry.setScriptResource('L1',replacement);h.pipeline.invalidateMotionProvenance(['L1']);
 for(let i=170;i<320;i++){const f=h.step(i*.04,.04);assert.equal(p(f).status,'unknown');assert.ok(p(f).origins.length<=4);}
 const oldSnapshot=h.pipeline.snapshot(),newEpoch=h.epoch+1;
 const freshRegistry=new MotionRegistry(['L0','L1']);freshRegistry.setScriptResource('L1',replacement);
 const freshPipeline=new AxisPipeline(h.config(),freshRegistry,newEpoch);assert.equal(freshPipeline.snapshot().sequence,0);assert.equal(p(freshPipeline.snapshot()).status,'none');
 let recovered;for(let i=0;i<150;i++)recovered=freshPipeline.step(new AxisStepInput(.04,12.8+i*.04,true,1,newEpoch,12800+i*40),h.config(),bindings);
 assert.equal(p(recovered).status,'known');assert.equal(p(recovered,'L1').status,'known');assert.equal(recovered.epoch,newEpoch);
 assert.equal(h.pipeline.snapshot(),oldSnapshot);assert.equal(p(oldSnapshot).status,'unknown');
});
