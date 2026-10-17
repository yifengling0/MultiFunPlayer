import test from 'node:test';import assert from 'node:assert/strict';import {setup,edit,connect,settle,SettingsSchema} from './multi-output-helpers.mjs';
function configuration(){const c=SettingsSchema.defaults();for(const k of Object.keys(c.sync))if(k.startsWith('sync'))c.sync[k]=false;for(const d of c.axisSettingsByDevice)for(const a of d.axes)Object.assign(a.settings,{autoHomeEnabled:false,selectedMotionProvider:null});return c;}
function step(s,ms=40){s.time.now+=ms;s.state.now=s.time.now;s.engine.tick(ms,s.time.now);s.page.syncOutput();}
async function target(s,allow=true){s.page.addOutputTarget('tcp');const id=s.page.selectedOutputId;edit(s,id);const d=s.Owner.draftSnapshot(id);d.model.pausedManual=allow;d.editRevision++;s.page.updateOutputDraft(d);assert.ok(await connect(s,id));return id;}
const port=(s,id)=>s.ports.find(p=>p.id===id).port;

test('real page/core/coordinator: explicit waiting Arm catches duration-zero command and stays waiting afterward',async()=>{
 const s=setup(configuration());await s.page.startManualPreview();const id=await target(s);step(s);assert.equal(s.engine.dispatchSource(['L0']).availability,'pendingCurrentFrame');assert.ok(s.engine.dispatchSource(['L0']).manualPreviewAdmission);s.page.armOutput(id);assert.equal(s.page.output.get(id).status().armed,true);assert.equal(s.page.output.get(id).status().dispatchSuspended,true);await s.time.advance(100);assert.equal(port(s,id).writeRecords().length,0);
 const before=s.engine.dispatchSource(['L0']).manualPreviewAdmission;s.engine.setAxisValue('L0',.8,0);s.page.syncOutput();assert.equal(s.page.output.get(id).status().armed,true);step(s);assert.deepEqual(s.engine.dispatchSource(['L0']).authorization.intents,['pausedManual']);assert.deepEqual(s.engine.dispatchSource(['L0']).manualPreviewAdmission,before);await s.time.advance(10);assert.equal(port(s,id).writeRecords().length,1);
 step(s);assert.equal(s.page.output.get(id).status().armed,true);assert.equal(s.page.output.get(id).status().dispatchSuspended,true);await s.time.advance(100);assert.equal(port(s,id).writeRecords().length,1);s.engine.setAxisValue('L0',.2,0);s.page.syncOutput();step(s);await s.time.advance(10);assert.equal(port(s,id).writeRecords().length,2);await s.page.output.dispose();
});

test('two targets independently require manual permission; Set never Arms denied target',async()=>{
 const s=setup(configuration());await s.page.startManualPreview();const yes=await target(s),no=await target(s,false);step(s);s.page.armOutput(yes);s.page.armOutput(no);assert.equal(s.page.output.get(yes).status().armed,true);assert.equal(s.page.output.get(no).status().armed,false);s.engine.setAxisValue('L0',.9,0);step(s);await s.time.advance(10);assert.equal(port(s,yes).writeRecords().length,1);assert.equal(port(s,no).writeRecords().length,0);await s.page.output.dispose();
});
for(const [name,revoke]of[['Stop',async(s,id)=>s.page.stop()],['background',async(s,id)=>{s.page.foreground=false;s.engine.setForeground(false);s.page.output.setForeground(false);}],['disconnect',async(s,id)=>s.page.disconnectOutput(id)],['source change',async(s,id)=>s.engine.useInternalSource()],['sync control',async(s,id)=>s.engine.resetSync('L0')],['axis configuration',async(s,id)=>{const a=s.engine.getAxisConfiguration('L0');a.scriptScale=.8;s.engine.changeAxisConfiguration('L0',a);}]])test('waiting Arm is revoked by '+name+' and cannot come back from Set or refresh',async()=>{
 const s=setup(configuration());await s.page.startManualPreview();const id=await target(s);step(s);s.page.armOutput(id);assert.equal(s.page.output.get(id).status().armed,true);await revoke(s,id);s.page.syncOutput();assert.equal(s.page.output.get(id).status().armed,false);s.page.foreground=true;s.engine.setForeground(true);s.page.output.setForeground(true);if(s.engine.isManualPreviewActive())s.engine.setAxisValue('L0',.9,0);step(s);await s.time.advance(10);assert.equal(s.page.output.get(id).status().armed,false);assert.equal(port(s,id).writeRecords().length,0);await s.page.output.dispose();
});

test('disconnection revokes all manual target admissions but does not silently reconnect or Arm after explicit restart',async()=>{
 const s=setup(configuration());await s.page.startManualPreview();const a=await target(s),b=await target(s);step(s);s.page.armOutput(a);s.page.armOutput(b);await s.page.disconnectOutput(a);assert.equal(s.engine.isManualPreviewActive(),false);assert.equal(s.page.output.get(b).status().armed,false);assert.ok(await connect(s,a));await s.page.startManualPreview();step(s);assert.equal(s.page.output.get(a).status().armed,false);assert.equal(s.page.output.get(b).status().armed,false);await s.page.output.dispose();
});

test('default Home may update numeric state but cannot expire waiting manual intent or send without a new manual contribution',async()=>{
 const c=configuration();const axis=c.axisSettingsByDevice.find(d=>d.deviceId===c.selectedDeviceId).axes.find(a=>a.axisName==='L0').settings;axis.autoHomeEnabled=true;axis.autoHomeDelaySeconds=.1;axis.autoHomeDurationSeconds=.5;const s=setup(c);await s.page.startManualPreview();const id=await target(s);step(s);s.page.armOutput(id);s.engine.setAxisValue('L0',.8,0);step(s);await s.time.advance(10);assert.equal(port(s,id).writeRecords().length,1);for(let n=0;n<30;n++){step(s);await s.time.advance(10);}assert.equal(s.page.output.get(id).status().armed,true);assert.equal(s.page.output.get(id).status().dispatchSuspended,true);assert.equal(port(s,id).writeRecords().length,1);s.engine.setAxisValue('L0',.2,0);step(s);await s.time.advance(10);assert.equal(port(s,id).writeRecords().length,2);await s.page.output.dispose();
});


test('actual Stop/restart closes old targets before new manual admission; reapply and explicit Arm remain usable',async()=>{
 const s=setup(configuration());await s.page.startManualPreview();const a=await target(s),b=await target(s);step(s);s.page.armOutput(a);s.page.armOutput(b);s.engine.setAxisValue('L0',.8,0);step(s);await s.time.advance(10);s.page.stop();await s.page.startManualPreview();step(s);assert.equal(s.engine.isManualPreviewActive(),true);
 for(const id of[a,b]){assert.equal(s.page.output.get(id).status().connection,'disconnected');assert.equal(s.page.output.get(id).status().armed,false);assert.ok(await connect(s,id));assert.equal(s.engine.isManualPreviewActive(),true);assert.equal(s.page.output.get(id).status().armed,false);s.page.armOutput(id);assert.equal(s.page.output.get(id).status().armed,true);assert.equal(s.page.output.get(id).status().dispatchSuspended,true);}
 s.engine.setAxisValue('L0',.2,0);step(s);await s.time.advance(10);for(const id of[a,b])assert.equal(s.ports.filter(p=>p.id===id).at(-1).port.writeRecords().length,1);await s.page.output.dispose();
});

test('manual restart rejects unconfirmed old output closure and cannot regain admission from Set',async()=>{
 const s=setup(configuration());await s.page.startManualPreview();const id=await target(s);step(s);s.page.armOutput(id);port(s,id).rejectClose=true;s.page.stop();await s.page.startManualPreview();assert.equal(s.engine.isManualPreviewActive(),false);assert.equal(s.page.output.get(id).status().armed,false);assert.match(s.page.runtimeMessage,/关闭未确认/);s.engine.setAxisValue('L0',.8,0);step(s);await s.time.advance(10);assert.equal(port(s,id).writeRecords().length,0);await s.page.output.dispose();
});

test('Stop during old output closure cancels manual startup and late completion never admits or Arms',async()=>{
 const s=setup(configuration());await s.page.startManualPreview();const id=await target(s);const targetCoordinator=s.page.output.get(id),disconnect=targetCoordinator.disconnect.bind(targetCoordinator);let release;const wait=new Promise(r=>{release=r;});targetCoordinator.disconnect=async()=>{await wait;await disconnect();};s.page.stop();const operation=s.page.startManualPreview();await settle();assert.equal(s.page.runtimeBusy,true);s.page.stop();release();await operation;assert.equal(s.engine.isManualPreviewActive(),false);assert.equal(targetCoordinator.status().armed,false);assert.equal(targetCoordinator.status().connection,'disconnected');await s.page.output.dispose();
});
