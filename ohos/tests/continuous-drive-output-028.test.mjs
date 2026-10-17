import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,edit,playing,connect,settle,SettingsSchema} from './multi-output-helpers.mjs';
const {KeyboardInputSession:K}=await import('../entry/src/main/ets/app/KeyboardInputSession.ts');
const {ContinuousInputConfiguration:Config,ContinuousInputMapping:Mapping,ContinuousInputAction:Action}=await import('../entry/src/main/ets/input/ContinuousInputConfiguration.ts');
const {LocalSurfaceGeometry:Geometry,LocalTouchPoint:Point,LocalTouchPacket:Touch}=await import('../entry/src/main/ets/input/LocalDrivePointer.ts');
function settings(){const c=SettingsSchema.defaults();for(const key of Object.keys(c.sync))if(key.startsWith('sync'))c.sync[key]=false;for(const device of c.axisSettingsByDevice)for(const axis of device.axes)Object.assign(axis.settings,{autoHomeEnabled:false,selectedMotionProvider:null});return c;}
function receive(h,action){const p=h.page;h.state.now=h.time.now;p.workspaceTool='settings';p.showInputSettings=true;p.showContinuousInput=true;p.keyboardOwner=K.setListener(()=>p.updateKeyboardContext(),()=>false,()=>p.cancelKeyboardWork());
 const c=new Config(),m=new Mapping('local','explicit');m.driveMode='Absolute';m.actions=[action];c.mappings=[m];p.applyContinuousConfiguration(c);p.selectContinuousMapping(m.id);p.continuousSurfaceChanged(new Geometry(200,100,0,0),p.continuousOwnerKey(),p.continuousReceptionRevision);p.enableContinuousInput(m.id);assert.equal(p.continuousReceiving,true,p.continuousStatus);
 return x=>{h.state.now=h.time.now;const points=[new Point(1,x,50)];return new Touch(p.continuousOwnerKey(),p.continuousReceptionRevision,p.continuousContact?'update':'begin',h.state.now*1e6,0,0,'touch',points,points);};}
async function targets(h,manual=false){h.ids=[];for(const kind of ['tcp','udp']){h.page.addOutputTarget(kind);const id=h.page.selectedOutputId;h.ids.push(id);const d=edit(h,id);d.model.dirtyOnly=false;d.model.pausedManual=manual;d.editRevision++;h.page.updateOutputDraft(d);}for(const id of h.ids)assert.ok(await connect(h,id));}
async function tick(h,dt=40){await h.time.advance(dt);h.state.now=h.time.now;h.engine.tick(dt,h.time.now);h.page.syncOutput();}
const port=(h,id)=>h.ports.find(item=>item.id===id).port;
for(const field of ['Minimum','Maximum','Middle','Size'])test('actual input '+field+' Drive mutates only captured target and no connection or Arm',async()=>{
 const h=setup(settings());try{h.page.addOutputTarget('tcp');const id=h.page.selectedOutputId;edit(h,id);h.page.addOutputTarget('udp');const other=h.page.selectedOutputId;edit(h,other);const saved=h.Owner.draftSnapshot(other);
 const packet=receive(h,new Action('OutputTarget::Axis::Range::'+field+'::Drive','L0','',id));h.page.localContinuousTouch(packet(100));await settle();assert.equal(h.page.continuousReceiving,true,h.page.continuousStatus);assert.deepEqual(h.Owner.draftSnapshot(other),saved);assert.equal(h.ports.length,0);assert.equal(h.engine.snapshot().state,'stopped');
 const range=h.Owner.draftSnapshot(id).model.ranges[0];if(field==='Size')assert.deepEqual([range.minimum,range.maximum],[.25,.75]);if(field==='Middle')assert.deepEqual([range.minimum,range.maximum],[0,1]);
 }finally{h.page.cancelKeyboardWork();await h.page.output.dispose();}
});
test('real fixed range Drive clears old queue/receipt, keeps already armed target intent and another target unchanged',async()=>{
 const h=setup(settings());try{playing(h);await targets(h);for(const id of h.ids)h.page.armOutput(id);const[id,other]=h.ids,c=h.page.output.get(id),p=port(h,id);p.planWrite({kind:'defer'});await h.time.advance(10);await tick(h);await h.time.advance(10);assert.equal(c.status().pendingFixed,true);const original=h.engine.frame();
 const packet=receive(h,new Action('OutputTarget::Axis::Range::Minimum::Drive','L0','',id));h.page.localContinuousTouch(packet(80));await settle();assert.equal(c.status().armed,true);assert.equal(c.status().dispatchSuspended,true);assert.equal(c.status().pendingFixed,false);assert.equal(h.engine.frame(),original);assert.equal(h.page.continuousReceiving,true);
 p.resolveNextWrite();await settle();assert.equal(c.status().completedLocalWrites,0);assert.equal(c.status().lastWritten.length,0);const before=p.writeRecords().length;await h.time.advance(10);assert.equal(p.writeRecords().length,before);assert.ok(h.page.output.get(other).status().completedLocalWrites>0);
 await tick(h);await h.time.advance(10);assert.ok(p.writeRecords().length>before);assert.equal(c.status().armed,true);
 // Another current motion event remains valid after the first target range commit.
 h.page.localContinuousTouch(packet(100));await settle();assert.equal(h.Owner.draftSnapshot(id).model.ranges[0].minimum,.5);assert.equal(h.page.continuousReceiving,true);
 }finally{h.page.cancelKeyboardWork();await h.page.output.dispose();}
});
for(const change of ['draft','disconnect','replace'])test('actual pending Drive cannot survive external target '+change,async()=>{
 const h=setup(settings());try{await targets(h);const id=h.ids[0],packet=receive(h,new Action('OutputTarget::Axis::Range::Minimum::Drive','L0','',id));let release;h.page.shortcutQueue=new Promise(r=>release=r);h.page.localContinuousTouch(packet(90));const before=h.Owner.draftSnapshot(id).model.ranges[0].minimum;
 if(change==='draft'){const d=h.Owner.draftSnapshot(id);d.port++;d.editRevision++;h.page.updateOutputDraft(d);}
 if(change==='disconnect')await h.page.output.get(id).disconnect();
 if(change==='replace'){await h.Owner.removeTarget(id,h.Owner.draftSnapshot(id).targetGeneration);h.page.addOutputTarget('tcp');}
 release();await settle();assert.equal(h.page.continuousReceiving,false);if(change!=='replace')assert.equal(h.Owner.draftSnapshot(id).model.ranges[0].minimum,before);
 assert.equal(h.ports.every(({port})=>port.writeRecords().length===0),true);
 }finally{h.page.cancelKeyboardWork();await h.page.output.dispose();}
});
test('actual stopped Value Drive never creates preview or Arm and old held epoch cannot establish Arm-wait',async()=>{
 const h=setup(settings());try{await targets(h,true);const[id]=h.ids;
 const packet=receive(h,new Action('Axis::Value::Drive','L0'));h.page.localContinuousTouch(packet(160));await settle();await tick(h);await h.time.advance(10);assert.equal(h.engine.isManualPreviewActive(),false);assert.equal(h.ports.every(({port})=>port.writeRecords().length===0),true);assert.equal(h.page.output.get(id).status().armed,false);
 h.page.cancelKeyboardWork();h.engine.startManualPreview();await tick(h);assert.equal(h.page.output.get(id).arm(),false,'old held scalar cannot authorize a new preview epoch');assert.equal(h.engine.dispatchSource(['L0']).availability,'invalidated');assert.equal(h.ports.every(({port})=>port.writeRecords().length===0),true);
 }finally{h.page.cancelKeyboardWork();await h.page.output.dispose();}
});
test('actual fresh manual preview and explicit fixed pausedManual Arm-wait sends only a real Value Drive transition; Stop revokes',async()=>{
 const h=setup(settings());try{await targets(h,true);const[id,denied]=h.ids;let d=h.Owner.draftSnapshot(denied);d.model.pausedManual=false;d.editRevision++;h.page.updateOutputDraft(d);await connect(h,denied);
 h.engine.startManualPreview();await tick(h);assert.equal(h.page.output.get(id).arm(),true);assert.equal(h.page.output.get(denied).arm(),false);
 const packet=receive(h,new Action('Axis::Value::Drive','L0'));const frame=h.engine.frame();h.page.localContinuousTouch(packet(160));await settle();assert.equal(h.engine.frame(),frame);await tick(h);await h.time.advance(10);assert.equal(port(h,id).writeRecords().length,1);assert.equal(port(h,denied).writeRecords().length,0);
 const old=packet(50);h.page.stop();assert.equal(h.page.localContinuousTouch(old),false);await tick(h);await h.time.advance(50);assert.equal(h.page.output.get(id).status().armed,false);assert.equal(port(h,id).writeRecords().length,1);
 }finally{h.page.cancelKeyboardWork();await h.page.output.dispose();}
});
