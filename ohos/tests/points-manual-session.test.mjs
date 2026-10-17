import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);}});
const {PlaybackSessionCore}=await import('../entry/src/main/ets/core/PlaybackSessionCore.ts');
const {SettingsSchema}=await import('../entry/src/main/ets/settings/SettingsSchema.ts');
const {FunscriptParser}=await import('../entry/src/main/ets/core/Funscript.ts');
const {MotionCurvePoint}=await import('../entry/src/main/ets/core/MotionConfiguration.ts');
const {AxisTransition}=await import('../entry/src/main/ets/core/AxisTransition.ts');
function config(){const c=SettingsSchema.defaults();for(const k of Object.keys(c.sync))if(k.startsWith('sync'))c.sync[k]=false;c.sync.durationSeconds=.5;for(const d of c.axisSettingsByDevice)for(const a of d.axes)Object.assign(a.settings,{autoHomeEnabled:false,selectedMotionProvider:null,updateMotionProviderWithAxis:null,motionProviderSpeedLimitWithAxis:false});return c;}
function session(){const s=new PlaybackSessionCore(config());s.setConnected(true);return s;}
const state=s=>s.frame().axisStates.find(x=>x.axisName==='L0');
const source=s=>s.dispatchSource(['L0']);
const doc=()=>FunscriptParser.parse('{"actions":[{"at":0,"pos":20},{"at":10000,"pos":80}]}');

test('manual Set and generic pause never admit stopped processing; explicit start discards stopped command',()=>{
 const s=session();const saved=SettingsSchema.encode(s.configurationSnapshot());s.setAxisValue('L0',.9,10);s.pause();s.tick(40);assert.equal(source(s).authorization,null);assert.equal(s.isManualPreviewActive(),false);
 const old=s.frame();s.startManualPreview();assert.equal(s.frame(),old);assert.equal(source(s).authorization,null);s.tick(40);assert.equal(source(s).authorization,null);assert.ok(Number.isNaN(state(s).transitionValue));assert.ok(Number.isNaN(s.frame().mediaPositionMs));assert.equal(SettingsSchema.encode(s.configurationSnapshot()),saved);
 s.setAxisValue('L0',.9,1);assert.equal(source(s).authorization,null);s.tick(40);assert.deepEqual(source(s).authorization.intents,['pausedManual']);assert.equal(source(s).authorization.clockKind,'monotonic');assert.equal(source(s).authorization.updateKind,'fixed');assert.equal(s.dispatchSource(['L0'],'polled').authorization,null);assert.equal(s.frame().events.length,0);
});

test('manual output follows original transition dt and pre-tick Append time=-1 behavior without publishing a command frame',()=>{
 const s=session();s.startManualPreview();const transition=new AxisTransition();transition.set(.5,.8,1);transition.append(.4,.5);
 const old=s.frame();s.setAxisValue('L0',.8,1);s.setAxisValue('L0',.4,.5,true);assert.equal(s.frame(),old);
 for(let n=0;n<30;n++){const expected=transition.update(.1);s.tick(100);assert.equal(state(s).transitionValue,expected);}
 assert.ok(transition.toValue>1,'Append target was not clamped');
});

for(const [name,interrupt] of [['Stop',s=>s.stop()],['background',s=>{s.setForeground(false);s.setForeground(true);}],['preview disconnect',s=>{s.setConnected(false);s.setConnected(true);}],['output disconnect',s=>s.revokeManualPreview()]])test(name+' revokes manual admission and cancels unfinished transition without auto restart',()=>{
 const s=session();s.startManualPreview();s.setAxisValue('L0',.9,10);s.tick(40);assert.ok(source(s).authorization);const epoch=s.frame().epoch;interrupt(s);s.pause();s.tick(40);assert.equal(s.isManualPreviewActive(),false);assert.equal(source(s).authorization,null);assert.ok(Number.isNaN(state(s).transitionValue));s.startManualPreview();s.tick(40);assert.equal(source(s).authorization,null);assert.ok(s.frame().epoch>epoch);s.setAxisValue('L0',.1,1);s.tick(40);assert.ok(source(s).authorization);
});

test('manual bypass, competing Motion, disabled axes, read-only, wrong mode and media opening remain fail-closed',()=>{
 const s=session();s.startManualPreview();const a=s.getAxisConfiguration('L0');a.bypassTransition=true;s.changeAxisConfiguration('L0',a);s.setAxisValue('L0',.9,1);s.tick(40);assert.equal(source(s).authorization,null);
 assert.throws(()=>s.setAxisValue('V0',.4,1));assert.throws(()=>s.setAxisValue('missing',.4,1));for(const v of [NaN,Infinity,-.1,1.1])assert.throws(()=>s.setAxisValue('L0',v,1));assert.throws(()=>s.setAxisValue('L0',.4,-1));
 for(const prepare of [s=>s.load(doc()),s=>s.useExternalClock(true),s=>s.useInternalSource(),s=>s.setConnected(false),s=>s.setForeground(false)]){const x=session();prepare(x);assert.throws(()=>x.startManualPreview());}
 class ReadOnly extends PlaybackSessionCore{assertConfigurationWritable(){throw Error('readonly');}}const r=new ReadOnly(config());r.setConnected(true);assert.throws(()=>r.startManualPreview());assert.throws(()=>r.setAxisValue('L0',.5,1));
});

test('manual mutation during admitted media remains activePlayback and requires a genuine new frame',()=>{
 const s=session();s.load(doc());const a=s.getAxisConfiguration('L0');a.bypassScript=true;s.changeAxisConfiguration('L0',a);s.play();s.tick(40);s.setAxisValue('L0',.9,1);assert.equal(source(s).authorization,null);s.tick(40);assert.deepEqual(source(s).authorization.intents,['activePlayback']);s.pause();s.tick(40);assert.equal(source(s).authorization,null,'generic media pause does not create manual-preview admission');
});

test('ordered Custom points command persists complete detached payload and blocks old dispatch revision',()=>{
 const s=session();const a=s.getAxisConfiguration('L0');Object.assign(a,{selectedMotionProvider:'Custom Curve',updateMotionProviderWhenPaused:true,updateMotionProviderWithoutScript:true,motionProviderBlend:1});s.changeAxisConfiguration('L0',a);s.startStandaloneMotion();s.tick(40);const old=s.frame();const points=[new MotionCurvePoint(.5,.8),new MotionCurvePoint(0,.2),new MotionCurvePoint(.5,.1)];s.setCustomCurvePoints('L0',1,'linear',points);assert.equal(s.frame(),old);assert.equal(source(s).authorization,null);points[0].y=0;assert.equal(s.getMotionConfiguration('L0','Custom Curve').points[0].y,.8);s.tick(40);assert.ok(source(s).authorization);const next=s.frame();s.setCustomCurvePoints('L0',1,'linear',s.getMotionConfiguration('L0','Custom Curve').points);assert.equal(s.frame(),next);assert.equal(source(s).authorization,null);const loaded=SettingsSchema.decode(SettingsSchema.encode(s.configurationSnapshot()));assert.equal(loaded.status,'valid');
});

test('finite append arithmetic overflow is rejected atomically and cannot become an authorized infinite-duration transition',()=>{
 const s=session();s.startManualPreview();s.setAxisValue('L0',.8,Number.MAX_VALUE);const before=JSON.stringify(s.pipeline.transitions[0]);const frame=s.frame();assert.throws(()=>s.setAxisValue('L0',.1,Number.MAX_VALUE,true),/overflow/);assert.equal(JSON.stringify(s.pipeline.transitions[0]),before);assert.equal(s.frame(),frame);assert.equal(s.fault(),'');
});
