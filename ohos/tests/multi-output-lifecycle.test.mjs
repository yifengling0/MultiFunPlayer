import test from 'node:test';
import assert from 'node:assert/strict';
import {setup, edit, playing, connect, settle, SettingsSchema} from './multi-output-helpers.mjs';
const {FunscriptParser}=await import('../entry/src/main/ets/core/Funscript.ts');
const add=(s,kind='tcp')=>{s.page.addOutputTarget(kind);const id=s.page.selectedOutputId;edit(s,id);return id;};
for(const change of ['select','edit','disconnect','remove','background','readonly','recovery'])test('actual Index first pending Apply interrupted by '+change,async()=>{
 const s=setup(undefined,{deferOpen:true});const a=add(s),b=add(s,'udp');s.page.selectOutputTarget(a);const d=s.Owner.draftSnapshot(a);const applying=connect(s,a);await settle();
 let remove;
 if(change==='select')s.page.selectOutputTarget(b);
 if(change==='edit'){s.page.disarmOutput(a);edit(s,a,{host:'new.local'});}
 if(change==='disconnect')await s.page.disconnectOutput(a);
 if(change==='remove')remove=s.page.removeOutputTarget(a);
 if(change==='background'){s.page.foreground=false;s.page.foregroundChanged();s.page.foreground=true;s.page.foregroundChanged();}
 if(change==='readonly'){s.page.settingsReadOnly=true;s.page.syncOutput();}
 if(change==='recovery'){s.page.recoveryRequired=true;s.page.syncOutput();}
 s.ports[0].port.resolveNextOpen();const result=await applying;if(remove)await remove;await settle();
 if(change==='select'){assert.ok(result>0);assert.equal(s.page.selectedOutputId,b);assert.equal(s.Owner.draftSnapshot(b).applicationId,0);assert.equal(s.Owner.draftSnapshot(a).applicationId,result);}
 else {assert.equal(result,0);assert.equal(s.Owner.draftSnapshot(a).applicationId,0);}
 assert.equal(s.ports[0].port.writeRecords().length,0);if(s.page.output.get(a))assert.equal(s.page.output.get(a).status().armed,false);await s.page.output.dispose();
});
for(const action of ['stop','background','profile','fault','seek'])test('actual Index all-target '+action+' closes unselected gates and rejects late receipts',async()=>{
 const s=setup(),a=add(s),b=add(s,'udp');playing(s);await connect(s,a);await connect(s,b);s.page.armOutput(a);s.page.armOutput(b);s.page.selectOutputTarget(a);
 for(const {port}of s.ports)port.planWrite({kind:'defer'});s.page.syncOutput();await s.time.advance(10);
 assert.ok(s.ports.every(({port})=>port.pendingWriteCount===1));s.time.now=60;s.engine.tick(20,60);s.page.syncOutput();await s.time.advance(10);
 if(action==='stop')s.page.stop();
 if(action==='background'){s.page.foreground=false;s.page.foregroundChanged();}
 if(action==='profile'){s.engine.resetRuntime();s.page.syncOutput();}
 if(action==='fault'){s.engine.tick(-1,s.time.now);s.page.syncOutput();}
 if(action==='seek'){s.page.seekTransport(500);s.page.syncOutput();}
 for(const id of [a,b]){const status=s.page.output.get(id).status();assert.equal(status.armed,false);assert.equal(status.pendingFixed,false);assert.equal(status.queuedEvents,0);}
 for(const {port}of s.ports)port.resolveNextWrite();await settle();await s.time.advance(10);
 assert.ok(s.ports.every(({port})=>port.writeRecords().length===1));assert.ok([a,b].every(id=>s.page.output.get(id).status().completedLocalWrites===0));await s.page.output.dispose();
});
test('actual owner cold profile change/edit/re-enable preserves disabled and hidden axis ranges',async()=>{
 let s=setup();const id=add(s);let d=s.Owner.draftSnapshot(id);const axis=d.model.ranges[1].axisId;d.model.ranges[1]={axisId:axis,minimum:.28,maximum:.64,enabled:false};d.editRevision++;s.page.updateOutputDraft(d);
 let profile=s.engine.configurationSnapshot().devices.find(p=>p.id===s.engine.activeRegistry().profile.id);profile.axes.find(a=>a.name===axis).enabled=false;s.engine.changeProfile(profile);let cfg=s.engine.configurationSnapshot();await s.page.output.dispose();s=setup(cfg);assert.equal(s.Owner.draftSnapshot(id).model.ranges.some(r=>r.axisId===axis),false);
 d=s.Owner.draftSnapshot(id);d.host='new.local';d.editRevision++;s.page.updateOutputDraft(d);
 profile=s.engine.configurationSnapshot().devices.find(p=>p.id===s.engine.activeRegistry().profile.id);profile.axes.find(a=>a.name===axis).enabled=true;s.engine.changeProfile(profile);cfg=SettingsSchema.decode(SettingsSchema.encode(s.engine.configurationSnapshot())).configuration;await s.page.output.dispose();s=setup(cfg);assert.deepEqual(s.Owner.draftSnapshot(id).model.ranges.find(r=>r.axisId===axis),{axisId:axis,minimum:.28,maximum:.64,enabled:false});await s.page.output.dispose();
});
test('actual Index native seek fans out, retaining only each previously armed target',async()=>{
 const s=setup(),a=add(s),b=add(s,'udp'),c=add(s);s.engine.load(FunscriptParser.parse(JSON.stringify({actions:[{at:0,pos:10},{at:10000,pos:90}]})));s.engine.useExternalClock(true);
 const snap=(time,seek=0,position=40)=>({generation:1,state:'playing',ready:true,valid:true,observationSequence:time,seekSequence:seek,positionMs:position,durationMs:10000,observedMonotonicMs:time,rate:1,seeking:false,playing:true,safetyGateOpen:true,failure:''});
 s.engine.acceptNativeSnapshot(snap(0));s.engine.play();s.engine.acceptNativeSnapshot(snap(40));s.time.now=40;s.engine.tick(40,40);s.page.syncOutput();
 await connect(s,a);await connect(s,b);await connect(s,c);s.page.armOutput(a);s.page.armOutput(b);s.page.selectOutputTarget(c);
 assert.equal(s.page.output.get(a).status().armed,true);assert.equal(s.page.output.get(b).status().armed,true);assert.equal(s.page.output.get(c).status().armed,false);
 s.page.videoMode=true;s.page.videoReady=true;s.page.playing=true;s.state.now=40;s.page.seekTransport(600);
 for(const id of[a,b]){assert.equal(s.page.output.get(id).status().seekPending,true);assert.equal(s.page.output.get(id).status().armed,true);}assert.equal(s.page.output.get(c).status().armed,false);
 s.engine.acceptNativeSnapshot(snap(60,1,600));s.engine.play();s.engine.acceptNativeSnapshot(snap(61,1,600));s.time.now=80;s.engine.tick(40,80);s.page.syncOutput();await s.time.advance(10);
 for(const id of[a,b]){assert.equal(s.page.output.get(id).status().seekPending,false);assert.equal(s.page.output.get(id).status().armed,true);}assert.equal(s.page.output.get(c).status().armed,false);assert.equal(s.ports[2].port.writeRecords().length,0);await s.page.output.dispose();
});
const {readFileSync}=await import('node:fs');const {stripTypeScriptTypes}=await import('node:module');
const {OutputSettingsModel,OutputSettingsDraft}=await import('../entry/src/main/ets/output/OutputSettingsModel.ts');
const {OutputEndpoint}=await import('../entry/src/main/ets/output/OutputCoordinator.ts');
const { KeyboardInputSession } = await import('../entry/src/main/ets/app/KeyboardInputSession.ts');
const panelSrc=readFileSync(new URL('../entry/src/main/ets/components/OutputSettingsPanel.ets',import.meta.url),'utf8');
const panelCode=('class Panel {'+panelSrc.slice(panelSrc.indexOf('export struct OutputSettingsPanel {')+'export struct OutputSettingsPanel {'.length,panelSrc.indexOf('  build() {'))+'}').replace(/@Prop\s*@Watch\([^)]*\)\s*/g,'').replace(/@Prop\s*|@State\s*/g,'');
const Panel=new Function('OutputSettingsModel','OutputSettingsDraft','OutputEndpoint','KeyboardInputSession',stripTypeScriptTypes(panelCode)+'; return Panel;')(OutputSettingsModel,OutputSettingsDraft,OutputEndpoint,KeyboardInputSession);
function mount(s,id){const p=new Panel();p.profile=s.page.outputProfile;p.profileId=s.page.outputDeviceId;p.draft=s.Owner.draftSnapshot(id);p.onDraftChange=d=>s.page.updateOutputDraft(d);p.onConnect=(...args)=>s.page.applyOutputConfiguration(...args);p.onArm=(...args)=>s.page.armOutput(...args);p.onDisarm=(...args)=>s.page.disarmOutput(...args);p.onDisconnect=(...args)=>s.page.disconnectOutput(...args);p.aboutToAppear();return p;}
test('actual old panel edit/connect/arm/disarm/disconnect cannot affect re-added same-kind:index target',async()=>{
 const s=setup(),id=add(s);playing(s);await connect(s,id);const old=mount(s,id);const oldGeneration=old.targetGeneration;
 await s.page.removeOutputTarget(id);const again=add(s);assert.equal(again,id);assert.ok(s.Owner.draftSnapshot(id).targetGeneration>oldGeneration);await connect(s,id);s.page.armOutput(id);assert.equal(s.page.output.get(id).status().armed,true);
 const current=s.Owner.draftSnapshot(id),saved=s.engine.outputConfiguration(),portCount=s.ports.length;
 old.host='stale.local';old.changed();old.disarm();old.disconnect();old.connect();await settle();
 assert.equal(s.page.output.get(id).status().armed,true);assert.equal(s.page.output.get(id).status().connection,'connected');assert.equal(s.ports.length,portCount);assert.deepEqual(s.Owner.draftSnapshot(id),current);assert.deepEqual(s.engine.outputConfiguration(),saved);
 s.page.disarmOutput(id);old.applicationId=1;old.appliedConfigurationId=1;old.connection='connected';old.arm();assert.equal(s.page.output.get(id).status().armed,false);
 await s.page.removeOutputTarget(id,oldGeneration);assert.notEqual(s.page.output.get(id),null);await s.page.output.dispose();
});
test('actual remounted generation rejects a delayed old successful Apply result despite matching application sequence',async()=>{
 const s=setup(),id=add(s);playing(s);const panel=mount(s,id);let resolve;const oldPromise=new Promise(r=>resolve=r);panel.onConnect=(...args)=>s.page.applyOutputConfiguration(...args).then(value=>oldPromise.then(()=>value));panel.connect();await settle();assert.equal(s.Owner.draftSnapshot(id).applicationId,1);
 await s.page.removeOutputTarget(id);add(s);await connect(s,id);const before=s.Owner.draftSnapshot(id);panel.draft=before;panel.restoreDraft();resolve();await settle();assert.deepEqual(s.Owner.draftSnapshot(id),before);assert.equal(panel.targetGeneration,before.targetGeneration);await s.page.output.dispose();
});
