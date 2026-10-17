import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);}});
const {PlaybackSessionCore}=await import('../entry/src/main/ets/core/PlaybackSessionCore.ts');
const {SettingsSchema}=await import('../entry/src/main/ets/settings/SettingsSchema.ts');
const {MotionCurvePoint}=await import('../entry/src/main/ets/core/MotionConfiguration.ts');
const {PointCanvasEffects,PointCanvasGeometry}=await import('../entry/src/main/ets/core/PointCanvasEffects.ts');
const points=values=>values.map(([x,y])=>new MotionCurvePoint(x,y));
function fixture(values=[[2,.2],[0,.8],[2,.7],[-1,.5]],duration=3){const c=SettingsSchema.defaults();for(const k of Object.keys(c.sync))if(k.startsWith('sync'))c.sync[k]=false;const s=new PlaybackSessionCore(c);s.setConnected(true);let p=s.getMotionConfiguration('L0','Custom Curve');p.durationSeconds=duration;p.points=points(values);s.changeMotionConfiguration('L0',p);return s;}
const config=s=>s.getMotionConfiguration('L0','Custom Curve');
const attach=(s,owner=1,w=300,h=120,axis='L0',rev=s.activeRegistry().revision)=>s.attachMotionCanvas(owner,axis,rev,w,h);
function activate(s){const a=s.getAxisConfiguration('L0');Object.assign(a,{selectedMotionProvider:'Custom Curve',updateMotionProviderWhenPaused:true,updateMotionProviderWithoutScript:true,motionProviderBlend:1,autoHomeEnabled:false});s.changeAxisConfiguration('L0',a);s.startStandaloneMotion();s.tick(40);}

test('actual measured attach synchronizes only, retains outside/duplicate points, and invalidates without publishing a frame',()=>{
 const s=fixture();activate(s);const before=config(s),frame=s.frame();const expected=PointCanvasEffects.apply(before.points,new PointCanvasGeometry(true,300,120,3,1),'synchronize');
 assert.equal(attach(s),true);assert.deepEqual(config(s).points,expected.points.map(p=>new MotionCurvePoint(p.x,p.y)));assert.equal(config(s).points.length,4);assert.equal(s.frame(),frame);assert.equal(s.dispatchSource(['L0']).authorization,null);assert.equal(s.isStandaloneMotionActive(),true);
 const rev=s.revision();assert.equal(attach(s),true);assert.equal(s.revision(),rev,'same geometry does not invent SizeChanged');s.tick(40);assert.ok(s.dispatchSource(['L0']).authorization);
});
test('zero measured canvas does not write points, but later Duration viewport change prunes before size check',()=>{
 const s=fixture();const before=config(s),rev=s.revision();assert.equal(attach(s,1,0,0),true);assert.deepEqual(config(s),before);assert.equal(s.revision(),rev);
 const p=config(s);p.durationSeconds=1;s.changeMotionConfiguration('L0',p);assert.deepEqual(config(s).points,points([[0,.8]]));
});
test('detached or equal Duration never invents viewport pruning; attached point Reset sorts without pruning',()=>{
 const s=fixture();let p=config(s);p.durationSeconds=1;s.changeMotionConfiguration('L0',p);assert.equal(config(s).points.length,4);
 attach(s);p=config(s);const count=p.points.length;s.changeMotionConfiguration('L0',p);assert.equal(config(s).points.length,count);
 p=config(s);p.points=points([[9,.1],[-2,.8],[9,.3]]);s.changeMotionConfiguration('L0',p);assert.deepEqual(config(s).points.map(v=>v.x),[-2,9,9]);
 s.detachMotionCanvas(1);p=config(s);p.durationSeconds=2;s.changeMotionConfiguration('L0',p);assert.equal(config(s).points.length,3);
});
test('Points command preserves Duration(old collection) then Reset(incoming collection), phase and genuine sample admission',()=>{
 const s=fixture([[0,.2],[1,.8],[3,.4]],4);activate(s);attach(s);s.tick(40);const provider=s.motion.getProvider('L0','Custom Curve');
 const frame=s.frame();const time=provider?.getTimeSeconds?.();s.setCustomCurvePoints('L0',1,'linear',points([[3,.2],[-1,.8],[0,.5]]));assert.deepEqual(config(s).points.map(p=>p.x),[-1,0,3]);assert.equal(s.frame(),frame);if(provider)assert.equal(provider.getTimeSeconds(),time);assert.equal(s.dispatchSource(['L0']).authorization,null);
 const rev=s.revision();s.setCustomCurvePoints('L0',1,'linear',config(s).points);assert.ok(s.revision()>rev);assert.equal(s.frame(),frame);
});
test('owner, profile, disabled axis, background and revoked owner guards reject stale geometry without changing configuration',()=>{
 const s=fixture();assert.equal(attach(s,2),true);const before=config(s),rev=s.revision();
 for(const args of [[1,500,100,'L0'],[2,500,100,'R0'],[3,500,100,'V0'],[3,500,100,'missing'],[3,500,100,'L0',s.activeRegistry().revision+1]])assert.equal(attach(s,...args),false);
 s.detachMotionCanvas(1);assert.equal(attach(s,2),true);s.detachMotionCanvas(2);assert.equal(attach(s,2),false);assert.deepEqual(config(s),before);assert.equal(s.revision(),rev);
 s.setForeground(false);assert.equal(attach(s,3),false);s.setForeground(true);assert.equal(attach(s,2),false);assert.equal(attach(s,3),true);assert.equal(s.snapshot().state,'stopped');assert.equal(s.dispatchSource(['L0']).authorization,null);
});
test('invalid geometry and derived overflow reject atomically without faulting or consuming owner identity',()=>{
 const s=fixture([[Number.MAX_VALUE,.5]],1);const before=config(s),rev=s.revision(),frame=s.frame();for(const pair of [[-1,100],[NaN,100],[Infinity,100],[Number.MAX_VALUE,100]])assert.throws(()=>attach(s,1,...pair));assert.deepEqual(config(s),before);assert.equal(s.revision(),rev);assert.equal(s.frame(),frame);assert.equal(s.fault(),'');assert.equal(attach(s,1,0,0),true);
});
test('read-only and pending profile cannot acquire a canvas mutation owner',()=>{
 class ReadOnly extends PlaybackSessionCore{assertConfigurationWritable(){throw Error('readonly');}}const r=new ReadOnly();assert.throws(()=>attach(r),/readonly/);
 const s=fixture();s.selectProfile('TCode-0.2');assert.equal(attach(s),false);assert.equal(s.snapshot().state,'stopped');
});
