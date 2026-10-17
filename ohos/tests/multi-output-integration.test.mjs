import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,edit,playing,connect,settle,SettingsSchema,OutputConfiguration,SavedOutputTarget,SavedOutputDeviceRanges,OutputEndpoint} from './multi-output-helpers.mjs';
test('cold saved multi-target restore preserves selection/preferences but opens no transports and acquires no arm',()=>{
 const cfg=SettingsSchema.defaults();const a=new SavedOutputTarget('tcp',0),b=new SavedOutputTarget('udp',0);a.host='a.local';a.port=1;b.host='b.local';b.port=2;b.polled=true;b.rangesByDevice=[new SavedOutputDeviceRanges('TCode-0.3',[{axisId:'L0',minimum:.2,maximum:.7,enabled:false}])];cfg.outputs.targets=[a,b];cfg.outputs.selectedTargetId=b.id;
 const s=setup(cfg);assert.equal(s.created,2);assert.equal(s.ports.length,0);assert.equal(s.page.selectedOutputId,b.id);assert.equal(s.Owner.draftSnapshot().model.ranges.find(r=>r.axisId==='L0').enabled,false);assert.equal(s.page.outputTargets.every(t=>t.connection==='disconnected'&&!t.armed),true);
});
test('actual Index add/edit/select and two independent targets connect and Arm explicitly; selection and one edit leave the other running',async()=>{
 const s=setup();s.page.addOutputTarget('tcp');const a=s.page.selectedOutputId;s.page.addOutputTarget('udp');const b=s.page.selectedOutputId;edit(s,a);edit(s,b);playing(s);
 assert.ok(await connect(s,a));assert.ok(await connect(s,b));assert.equal(s.page.output.get(a).status().armed,false);assert.equal(s.page.output.get(b).status().armed,false);
 s.page.armOutput(a);s.page.armOutput(b);s.page.syncOutput();await s.time.advance(10);assert.equal(s.ports.length,2);assert.equal(s.ports.every(p=>p.port.writeRecords().length===1),true);
 s.page.selectOutputTarget(a);assert.equal(s.page.output.get(b).status().armed,true);const before=s.engine.dispatchSource(['L0']).authorization.sourceConfigurationRevision;
 s.page.disarmOutput(a);edit(s,a,{port:2345});assert.equal(s.page.output.get(a).status().armed,false);assert.equal(s.page.output.get(b).status().armed,true);assert.equal(s.engine.dispatchSource(['L0']).authorization.sourceConfigurationRevision,before);
 s.page.stop();assert.equal(s.page.output.get(a).status().armed,false);assert.equal(s.page.output.get(b).status().armed,false);await s.page.output.dispose();
});
test('valid endpoint and inactive fixed preferences persist, unsafe text stays volatile without overwriting the last saved target',()=>{
 const s=setup();s.page.addOutputTarget('webSocket');const id=s.page.selectedOutputId;let d=edit(s,id);d.model.polled=true;d.model.intervalMs=23;d.model.offloadElapsed=true;d.path='/device';d.editRevision++;s.page.updateOutputDraft(d);
 const saved=s.engine.outputConfiguration();assert.equal(saved.targets[0].polled,true);assert.equal(saved.targets[0].intervalMs,23);assert.equal(saved.targets[0].offloadElapsed,true);
 d=s.Owner.draftSnapshot(id);d.host='user:secret@device.local';d.editRevision++;s.page.updateOutputDraft(d);assert.match(s.page.outputDiagnostic,/未保存/);assert.deepEqual(s.engine.outputConfiguration(),saved);assert.equal(s.Owner.draftSnapshot(id).host,'user:secret@device.local');
 const json=SettingsSchema.encode(s.engine.configurationSnapshot());assert.equal(json.includes('secret'),false);const restored=setup(SettingsSchema.decode(json).configuration);assert.equal(restored.ports.length,0);assert.equal(restored.Owner.draftSnapshot().host,'device.local');assert.equal(restored.Owner.draftSnapshot().applicationId,0);
});
test('runtime registry rebuild invalidates all targets but preserves each saved range and disabled axes across profile restoration',async()=>{
 const s=setup();s.page.addOutputTarget('tcp');const id=s.page.selectedOutputId;let d=edit(s,id);d.model.ranges=d.model.ranges.map(r=>({...r,minimum:.2,maximum:.8,enabled:r.axisId==='L0'}));d.editRevision++;s.page.updateOutputDraft(d);const saved=s.engine.outputConfiguration();
 playing(s);await connect(s,id);s.page.armOutput(id);s.engine.resetRuntime();s.page.syncOutput();assert.equal(s.page.output.get(id).status().armed,false);assert.equal(s.Owner.draftSnapshot(id).applicationId,0);assert.deepEqual(s.Owner.draftSnapshot(id).model.ranges,saved.targets[0].rangesByDevice[0].ranges);
 assert.deepEqual(s.engine.outputConfiguration(),saved);await s.page.output.dispose();
});
test('actual Index removal closes only exact target, persists survivor and lowest free per-kind index can be explicitly added again',async()=>{
 const s=setup();s.page.addOutputTarget('tcp');const a=s.page.selectedOutputId;s.page.addOutputTarget('tcp');const b=s.page.selectedOutputId;edit(s,a);edit(s,b);playing(s);await connect(s,a);await connect(s,b);s.page.armOutput(b);
 await s.page.removeOutputTarget(a);assert.equal(s.page.output.get(a),null);assert.equal(s.page.output.get(b).status().armed,true);assert.deepEqual(s.engine.outputConfiguration().targets.map(t=>t.id),[b]);s.page.addOutputTarget('tcp');assert.equal(s.page.selectedOutputId,a);assert.equal(s.page.output.get(a).status(),null);await s.page.output.dispose();
});
test('readonly guards add/edit/connect/Arm while still allowing selection, disconnect and global safety actions',async()=>{
 const s=setup();s.page.addOutputTarget('tcp');const id=s.page.selectedOutputId;edit(s,id);playing(s);await connect(s,id);s.page.armOutput(id);const saved=s.engine.outputConfiguration();s.page.settingsReadOnly=true;
 s.page.addOutputTarget('udp');const d=s.Owner.draftSnapshot(id);d.editRevision++;d.host='other';s.page.updateOutputDraft(d);assert.deepEqual(s.engine.outputConfiguration(),saved);assert.equal(s.page.output.get(id).status().armed,false);assert.equal(await connect(s,id),0);s.page.armOutput(id);assert.equal(s.page.output.get(id).status().armed,false);await s.page.disconnectOutput(id);assert.equal(s.page.output.get(id).status().connection,'disconnected');await s.page.output.dispose();
});

test('retained unsafe endpoint stays rejected after runtime rebuild and forged submitted endpoint/config cannot bypass current draft',async()=>{
 const s=setup();s.page.addOutputTarget('webSocket');const id=s.page.selectedOutputId;edit(s,id);const saved=s.engine.outputConfiguration();
 let d=s.Owner.draftSnapshot(id);d.path='/token/my-secret';d.editRevision++;s.page.updateOutputDraft(d);assert.match(s.Owner.draftDiagnostic(id),/未保存/);
 s.engine.resetRuntime();s.page.syncOutput();assert.equal(s.Owner.draftSnapshot(id).path,'/token/my-secret');assert.match(s.Owner.draftDiagnostic(id),/未保存/);assert.equal(await connect(s,id),0);assert.equal(s.ports.length,0);assert.deepEqual(s.engine.outputConfiguration(),saved);
 d=s.Owner.draftSnapshot(id);d.path='/control';d.editRevision++;s.page.updateOutputDraft(d);assert.equal(s.Owner.draftDiagnostic(id),'');
 const configuration=d.model.config(s.page.outputProfile,id),endpoint=new OutputEndpoint();Object.assign(endpoint,{host:d.host,port:d.port,path:d.path});
 assert.equal(await s.page.applyOutputConfiguration(configuration,{...endpoint,host:'unselected.local'},d.targetGeneration),0);
 assert.equal(await s.page.applyOutputConfiguration({...configuration,allowPausedMotion:true},endpoint,d.targetGeneration),0);
 assert.equal(s.ports.length,0);assert.ok(await connect(s,id));await s.page.output.dispose();
});
test('deleted and re-added same ID cannot accept an old draft, safety callback, selection or Apply identity',async()=>{
 const s=setup();s.page.addOutputTarget('tcp');const id=s.page.selectedOutputId;const old=edit(s,id);await s.page.removeOutputTarget(id,old.targetGeneration);s.page.addOutputTarget('tcp');
 const current=edit(s,id,{host:'replacement.local'});assert.equal(current.targetId,old.targetId);assert.ok(current.targetGeneration>old.targetGeneration);
 old.host='old-secret';old.editRevision+=100;s.page.updateOutputDraft(old);assert.equal(s.Owner.draftSnapshot(id).host,'replacement.local');playing(s);assert.ok(await connect(s,id));s.page.armOutput(id);assert.equal(s.page.output.get(id).status().armed,true);
 s.page.disarmOutput(id,old.targetGeneration);await s.page.disconnectOutput(id,old.targetGeneration);await s.page.removeOutputTarget(id,old.targetGeneration);assert.equal(s.page.output.get(id).status().armed,true);
 assert.equal(await s.page.applyOutputConfiguration(old.model.config(s.page.outputProfile,id),new OutputEndpoint(),old.targetGeneration),0);assert.equal(s.page.output.get(id).status().armed,true);await s.page.output.dispose();
});
