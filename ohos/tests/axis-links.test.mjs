import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({resolve(specifier,context,next){return next(specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)?specifier+'.ts':specifier,context);}});
const {AxisConfiguration,SyncConfiguration}=await import('../entry/src/main/ets/core/AxisConfiguration.ts');
const {DeviceProfile,DeviceAxisDefinition}=await import('../entry/src/main/ets/core/DeviceProfile.ts');
const {AxisScriptStore,AxisScriptResource,AxisScriptBinding,AxisKeyframe,AxisChapter,AxisBookmark}=await import('../entry/src/main/ets/core/AxisScriptStore.ts');
const {AxisPipeline,AxisPipelineConfiguration,AxisStepInput}=await import('../entry/src/main/ets/core/AxisPipeline.ts');
const resource=(id,value=.2)=>new AxisScriptResource(id,id,'test',[new AxisKeyframe(0,value),new AxisKeyframe(10,.8)],[new AxisChapter(id,0,10)],[new AxisBookmark(id,2)]);
function setup(){
 const profile=new DeviceProfile('test','test',false,4,['L0','L1','L2'].map(n=>new DeviceAxisDefinition(n,n,[n],true,.5)));
 const entries=AxisConfiguration.defaultsForProfile(profile);const store=new AxisScriptStore(['L0','L1','L2'],entries);
 return {profile,entries,store,s:(name)=>entries.find(e=>e.axisName===name).settings,apply(){store.setConfiguration(entries);}};
}

test('fallback link respects own resource; priority reload selects source and keeps raw metadata',()=>{
 const h=setup();h.s('L1').linkAxis='L0';h.apply();h.store.setScript('L1',resource('own',.9));h.store.setScript('L0',resource('source'));
 assert.equal(h.store.getBinding('L1').resource.name,'own');assert.equal(h.store.getBinding('L1').linkedFromAxis,null);
 h.s('L1').linkAxisHasPriority=true;h.apply();assert.equal(h.store.getBinding('L1').resource,h.store.getBinding('L0').resource);
 assert.equal(h.store.getBinding('L1').resource.chapters[0].name,'source');assert.equal(h.store.getBinding('L1').resource.bookmarks[0].positionSeconds,2);
 h.store.reload([new AxisScriptBinding('L1',resource('ignored'))]);assert.equal(h.store.getBinding('L1').resource.name,'source');
});

test('source replacement and clear propagate through chains, empty source yields empty link',()=>{
 const h=setup();h.s('L1').linkAxis='L0';h.s('L2').linkAxis='L1';h.apply();assert.equal(h.store.getBinding('L2').resource,null);
 h.store.setScript('L0',resource('first'));assert.equal(h.store.getBinding('L2').resource.name,'first');
 h.store.setScript('L0',resource('second'));assert.equal(h.store.getBinding('L2').resource.name,'second');assert.equal(h.store.getBinding('L2').linkedFromAxis,'L1');
 h.store.clear(['L0']);assert.equal(h.store.getBinding('L1').resource,null);assert.equal(h.store.getBinding('L2').resource,null);
});

test('Lock permits empty-axis first load, blocks clear/replace/link and protects empty resources',()=>{
 const h=setup();h.s('L1').linkAxis='L0';h.s('L1').lockScript=true;h.apply();h.store.setScript('L0',resource('first'));assert.equal(h.store.getBinding('L1').resource.name,'first');
 assert.equal(h.store.setScript('L1',resource('manual')),false);h.store.setScript('L0',resource('next'));assert.equal(h.store.getBinding('L1').resource.name,'first');h.store.clear(['L1']);assert.equal(h.store.getBinding('L1').resource.name,'first');
 h.s('L1').lockScript=false;h.apply();assert.equal(h.store.getBinding('L1').resource.name,'first');h.store.updateLinks();assert.equal(h.store.getBinding('L1').resource.name,'next');
 h.s('L2').lockScript=true;h.apply();assert.equal(h.store.setScript('L2',new AxisScriptResource('empty','empty','test',[])),true);assert.equal(h.store.setScript('L2',resource('filled')),false);
});

test('link cycles/unknown targets are rejected before changing existing configuration',()=>{
 const h=setup();h.s('L1').linkAxis='L0';h.apply();h.store.setScript('L0',resource('valid'));const before=h.store.snapshot();
 h.s('L0').linkAxis='L1';assert.throws(()=>h.apply(),/Circular/);assert.deepEqual(h.store.snapshot(),before);
 h.s('L0').linkAxis='X9';assert.throws(()=>h.apply(),/Unknown/);assert.deepEqual(h.store.snapshot(),before);
});

test('source aliases share immutable raw frames but retain target offset/scale/inversion',()=>{
 const h=setup();h.s('L1').linkAxis='L0';h.s('L1').offsetSeconds=.5;h.s('L1').scriptScale=2;h.s('L1').invertScript=true;h.apply();h.store.setScript('L0',resource('original'));
 const sync=new SyncConfiguration();for(const key of Object.keys(sync))if(key!=='durationSeconds')sync[key]=false;
 for(const entry of h.entries){entry.settings.autoHomeEnabled=false;entry.settings.interpolationType='linear';}
 const config=new AxisPipelineConfiguration(h.profile,h.entries,sync);const p=new AxisPipeline(config);
 const frame=p.step(new AxisStepInput(.1,1,true),config,h.store.snapshot());const a=frame.axisStates.find(a=>a.axisName==='L0');const b=frame.axisStates.find(a=>a.axisName==='L1');
 assert.ok(Math.abs(a.scriptValue-.26)<1e-12);assert.ok(Math.abs(b.scriptValue-1)<1e-12);
 assert.equal(frame.events.find(e=>e.axisName==='L1').to.value,.8);assert.equal(h.store.getBinding('L1').resource,h.store.getBinding('L0').resource);
});

test('resource snapshots deep copy caller objects; duplicate timestamps retain first',()=>{
 const keys=[{positionSeconds:2,value:.8},{positionSeconds:0,value:.2},{positionSeconds:2,value:.9}];const chapters=[{name:'a',startTimeSeconds:0,endTimeSeconds:2}];const bookmarks=[{name:'b',positionSeconds:1}];
 const r=new AxisScriptResource('a','a','test',keys,chapters,bookmarks);keys[0].value=0;chapters[0].name='changed';bookmarks[0].positionSeconds=9;
 assert.deepEqual(r.keyframes.map(p=>p.value),[.2,.8]);assert.equal(r.chapters[0].name,'a');assert.equal(r.bookmarks[0].positionSeconds,1);
 assert.throws(()=>r.keyframes.push(new AxisKeyframe(3,1)),TypeError);assert.throws(()=>{r.bookmarks[0].positionSeconds=4;},TypeError);
 const h=setup();h.store.setScript('L0',r);const snap=h.store.snapshot();assert.throws(()=>snap.pop(),TypeError);assert.throws(()=>{snap[0].revision=99;},TypeError);
 for(const p of [[NaN,.2],[-1,.2],[1,Infinity],[1,1.1]])assert.throws(()=>new AxisScriptResource('bad','bad','test',[new AxisKeyframe(...p)]));
});

test('same resource identity is retained but new equal content invalidates; direct loads replace links',()=>{
 const h=setup();h.s('L1').linkAxis='L0';h.apply();const first=resource('first');h.store.setScript('L0',first);const rev=h.store.getBinding('L0').revision;
 assert.equal(h.store.setScript('L0',first),false);assert.equal(h.store.getBinding('L0').revision,rev);
 assert.equal(h.store.setScript('L0',resource('first')),true);assert.ok(h.store.getBinding('L0').revision>rev);
 h.store.setScript('L1',resource('manual'));h.store.setScript('L0',resource('second'));assert.equal(h.store.getBinding('L1').resource.name,'manual');
});

test('retargeting a link to equal source content creates a new linked wrapper and invalidates',()=>{
 const h=setup();h.store.setScript('L0',resource('same'));h.store.setScript('L2',resource('same'));h.s('L1').linkAxis='L0';h.apply();const old=h.store.getBinding('L1');
 h.s('L1').linkAxis='L2';h.apply();const next=h.store.getBinding('L1');assert.equal(next.linkedFromAxis,'L2');assert.ok(next.revision>old.revision);assert.equal(next.resource,h.store.getBinding('L2').resource);
});

test('Link selection/priority resets source ReloadAxes sync even with unchanged resource content',()=>{
 const h=setup();for(const entry of h.entries){entry.settings.autoHomeEnabled=false;entry.settings.interpolationType='linear';}
 const sync=new SyncConfiguration();for(const key of Object.keys(sync))if(key!=='durationSeconds')sync[key]=false;
 h.store.setScript('L0',resource('same'));h.store.setScript('L2',resource('same'));h.s('L1').linkAxis='L0';h.apply();
 const config=()=>new AxisPipelineConfiguration(h.profile,h.entries,sync);const p=new AxisPipeline(config());p.step(new AxisStepInput(.1,1,true),config(),h.store.snapshot());
 const revision=h.store.getBinding('L1').revision;h.s('L1').linkAxis='L2';h.apply();const frame=p.step(new AxisStepInput(.1,1,true),config(),h.store.snapshot());
 assert.ok(h.store.getBinding('L1').revision>revision);assert.equal(frame.axisStates.find(s=>s.axisName==='L1').syncTimeSeconds,3.9);
});

test('explicit relink creates a fresh wrapper; identical settings adoption and unlock do not relink',()=>{
 const h=setup();h.s('L1').linkAxis='L0';h.apply();h.store.setScript('L0',resource('source'));const first=h.store.getBinding('L1');
 h.apply();assert.equal(h.store.getBinding('L1'),first);h.s('L1').lockScript=true;h.apply();assert.equal(h.store.getBinding('L1'),first);h.s('L1').lockScript=false;h.apply();assert.equal(h.store.getBinding('L1'),first);
 h.store.updateLinks();const next=h.store.getBinding('L1');assert.ok(next.revision>first.revision);assert.equal(next.resource,first.resource);
});
