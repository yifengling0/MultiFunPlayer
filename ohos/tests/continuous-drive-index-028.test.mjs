import test from 'node:test';
import assert from 'node:assert/strict';
import { setupIndex } from './index-controller-helpers.mjs';
const { PlaybackSessionCore }=await import('../entry/src/main/ets/core/PlaybackSessionCore.ts');
const { SettingsSchema }=await import('../entry/src/main/ets/settings/SettingsSchema.ts');
const { KeyboardInputSession:K }=await import('../entry/src/main/ets/app/KeyboardInputSession.ts');
const { ContinuousInputConfiguration:Configuration, ContinuousInputMapping:Mapping, ContinuousInputAction:Action }=await import('../entry/src/main/ets/input/ContinuousInputConfiguration.ts');
const { LocalSurfaceGeometry:Geometry, LocalTouchPoint:Point, LocalTouchPacket:Touch, LocalWheelPacket:Wheel }=await import('../entry/src/main/ets/input/LocalDrivePointer.ts');
const settle=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function setup(kind='drive',actionId='Axis::MotionProviderBlend::Drive',source='touch') {
 const engine=new PlaybackSessionCore();engine.setConnected(true);engine.flush=()=>{};
 const tasks=new Map();let next=0;const r=setupIndex({engine,setTimeout:(fn,delay)=>{tasks.set(++next,{fn,at:r.state.now+delay});return next;},clearTimeout:id=>tasks.delete(id)});
 const {page,state}=r;state.now=1000;page.workspaceTool='settings';page.showInputSettings=true;page.showContinuousInput=true;
 page.keyboardOwner=K.setListener(()=>page.updateKeyboardContext(),()=>false,()=>page.cancelKeyboardWork());
 const configuration=new Configuration();const mapping=new Mapping('m1','local');mapping.source=source;mapping.component=source==='wheel'?'wheelY':'x';mapping.kind=kind;
 mapping.driveMode='Absolute';mapping.actions=[new Action(actionId,'L0')];configuration.mappings=[mapping];
 page.applyContinuousConfiguration(configuration);page.selectContinuousMapping('m1');page.continuousSurfaceChanged(new Geometry(200,100,0,0),page.continuousOwnerKey(),page.continuousReceptionRevision);page.enableContinuousInput('m1');
 assert.equal(page.continuousReceiving,true,page.continuousStatus);
 function touch(phase,x=150,id=1){const pts=[new Point(id,x,50)];return new Touch(page.continuousOwnerKey(),page.continuousReceptionRevision,phase,state.now*1e6,0,0,'touch',phase==='end'?[]:pts,pts);}
 async function advance(delta){state.now+=delta;for(const[id,task]of [...tasks])if(task.at<=state.now&&tasks.delete(id))task.fn();await settle();}
 return{...r,engine,tasks,touch,advance};
}
test('actual local touch Drive reaches normal live setter without play/connect/Arm or fabricated frame',async()=>{
 const r=setup();const frame=r.engine.frame();assert.equal(r.page.localContinuousTouch(r.touch('begin')),true);await settle();
 assert.equal(r.engine.getAxisConfiguration('L0').motionProviderBlend,.75);assert.equal(r.engine.frame(),frame);
 assert.equal(r.engine.snapshot().state,'stopped');assert.equal(r.engine.snapshot().safetyGateOpen,false);
 assert.equal(r.page.continuousReceiving,true);assert.equal(r.page.continuousContact,true);
 const up=r.touch('end');r.page.localContinuousTouch(up);assert.equal(r.page.continuousContact,false);assert.equal(r.page.continuousReceiving,true);
 r.state.now++;r.page.localContinuousTouch(r.touch('begin',50));await settle();assert.equal(r.engine.getAxisConfiguration('L0').motionProviderBlend,.25);
});
test('actual independent Offset first100ms, no40ms rounding, release cancels periodic work',async()=>{
 const r=setup('offset');r.page.localContinuousTouch(r.touch('begin',200));await settle();assert.equal(r.engine.getAxisConfiguration('L0').motionProviderBlend,0);
 await r.advance(99);assert.equal(r.engine.getAxisConfiguration('L0').motionProviderBlend,0);
 await r.advance(1);assert.equal(r.engine.getAxisConfiguration('L0').motionProviderBlend,.1);
 await r.advance(100);assert.equal(r.engine.getAxisConfiguration('L0').motionProviderBlend,.2);
 r.page.localContinuousTouch(r.touch('end',200));await r.advance(1000);assert.equal(r.engine.getAxisConfiguration('L0').motionProviderBlend,.2);assert.equal(r.tasks.size,0);
});
for(const reason of ['Stop','focus','background','resize','collapse','text','modal','listener'])test('actual held Offset cancels on '+reason+' and needs fresh explicit reception',async()=>{
 const r=setup('offset');r.page.localContinuousTouch(r.touch('begin',200));const stale=r.touch('update',200);await r.advance(100);assert.equal(r.engine.getAxisConfiguration('L0').motionProviderBlend,.1);
 if(reason==='Stop')r.page.stop();
 if(reason==='focus')K.setWindowFocus(K.claimWindow(),false);
 if(reason==='background'){r.page.foreground=false;r.page.foregroundChanged();}
 if(reason==='resize')r.page.continuousSurfaceChanged(new Geometry(250,100,0,0),r.page.continuousOwnerKey(),r.page.continuousReceptionRevision);
 if(reason==='collapse')r.page.toggleContinuousInput();
 if(reason==='text'){K.setEditing?.(true);r.page.continuous.setContext({...r.page.continuous.contextSnapshot(),textInput:true});r.page.cancelKeyboardWork();}
 if(reason==='modal'){r.page.confirmationCloseUnconfirmed=true;r.page.updateKeyboardContext();}
 if(reason==='listener')K.setListener(()=>{},()=>false,()=>{});
 await r.advance(1000);assert.equal(r.engine.getAxisConfiguration('L0').motionProviderBlend,.1);assert.equal(r.page.continuousReceiving,false);
 assert.equal(r.page.localContinuousTouch(stale),false);assert.equal(r.tasks.size,0);
});
test('normalizer wheel is immediate current data and never schedules Offset repeat',async()=>{
 const r=setup('drive','Axis::MotionProviderBlend::Drive','wheel');
 const packet=new Wheel(r.page.continuousOwnerKey(),r.page.continuousReceptionRevision,'update',r.state.now*1e6,0,0,'mouse','mouse',50,50,0,25);
 assert.equal(r.page.localContinuousWheel(packet),true);await settle();assert.equal(r.engine.getAxisConfiguration('L0').motionProviderBlend,.75);assert.equal(r.tasks.size,0);assert.equal(r.page.continuousReceiving,true);
 await r.advance(5000);assert.equal(r.engine.getAxisConfiguration('L0').motionProviderBlend,.75);
});
test('pending shared worker drops late current batch after actual Stop, no implicit reconnect',async()=>{
 const r=setup();let resolve;r.page.shortcutQueue=new Promise(r=>resolve=r);r.page.localContinuousTouch(r.touch('begin'));r.page.stop();resolve();await settle();
 assert.equal(r.engine.getAxisConfiguration('L0').motionProviderBlend,0);assert.equal(r.page.continuousReceiving,false);
});
test('saved mapping survives clone but reception/timers/preview authority never persist',()=>{
 const r=setup('offset');r.page.localContinuousTouch(r.touch('begin',200));const json=SettingsSchema.encode(r.engine.configurationSnapshot());
 const next=new PlaybackSessionCore(SettingsSchema.decode(json).configuration);assert.equal(next.continuousInputConfiguration().mappings[0].kind,'offset');assert.equal(next.snapshot().state,'stopped');assert.equal(next.isManualPreviewActive(),false);
 assert.equal(/receptionRevision|contactSerial|nativeTimestamp|deadline/.test(json),false);r.page.cancelKeyboardWork();
});
