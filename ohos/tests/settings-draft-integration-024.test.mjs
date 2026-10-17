import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks,stripTypeScriptTypes} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);}});
const {SettingsDraftOwner}=await import('../entry/src/main/ets/presentation/SettingsDraftOwner.ts');
const {KeyboardInputSession}=await import('../entry/src/main/ets/app/KeyboardInputSession.ts');
const device=await import('../entry/src/main/ets/core/DeviceProfile.ts');
const axis=await import('../entry/src/main/ets/core/AxisConfiguration.ts');
const motion=await import('../entry/src/main/ets/core/MotionConfiguration.ts');
const controls=await import('../entry/src/main/ets/core/MotionControlValues.ts');
const {OutputSettingsModel,OutputSettingsDraft}=await import('../entry/src/main/ets/output/OutputSettingsModel.ts');
const {OutputEndpoint}=await import('../entry/src/main/ets/output/OutputCoordinator.ts');
const {SerialOutputPreferences}=await import('../entry/src/main/ets/settings/SerialOutputPreferences.ts');
const {SerialDiagnosticSnapshot}=await import('../entry/src/main/ets/app/SerialDiagnosticSession.ts');
const {setupIndex}=await import('./index-controller-helpers.mjs');
const read=name=>readFileSync(new URL('../entry/src/main/ets/components/'+name+'.ets',import.meta.url),'utf8');
function helper(file,names,deps){const body=read(file).split('@Component')[0].replace(/^import .*;\n/gm,'').replace(/export class/g,'class');return new Function(...Object.keys(deps),stripTypeScriptTypes(body)+';return {'+names.join(',')+'};')(...Object.values(deps));}
const common=helper('CurvePointEditor',['SettingsNumberLogic','SettingsOption','CurveEditRules','CurveGeometryOwners'],motion);
const base={SettingsDraftOwner,KeyboardInputSession,...device,...axis,...motion,...controls,...common,OutputSettingsModel,OutputSettingsDraft,OutputEndpoint,SerialOutputPreferences,SerialDiagnosticSnapshot};
function controller(file,name,deps={}){const all={...base,...deps};const text=read(file),a=text.indexOf('export struct '+name);const b=Math.min(...[text.indexOf('  @Builder',a),text.indexOf('  build()',a)].filter(n=>n>=0));const body=text.slice(a,b).replace('export struct','class').replace(/@(Prop|State|Watch|StorageLink)(\([^)]*\))?\s*/g,'')+'\n}';return new Function(...Object.keys(all),stripTypeScriptTypes(body)+';return '+name+';')(...Object.values(all));}
const NumberField=controller('CurvePointEditor','SettingsNumberField');
const TextField=controller('CurvePointEditor','SettingsTextField');
const AxisPanel=controller('AxisSettingsPanel','AxisSettingsPanel',helper('AxisSettingsPanel',['AxisSettingsEdits'],base));
const SyncPanel=controller('SyncSettingsPanel','SyncSettingsPanel',helper('SyncSettingsPanel',['SyncSettingsEdits'],base));
const MotionPanel=controller('MotionSettingsPanel','MotionSettingsPanel',helper('MotionSettingsPanel',['MotionSettingsEdits'],base));
const OutputPanel=controller('OutputSettingsPanel','OutputSettingsPanel');
function field(owner,scope,key,value,commit=()=>true,Type=NumberField){const f=new Type();Object.assign(f,{draftOwner:owner,draftScope:scope,draftKey:key,value,onCommit:commit});f.aboutToAppear();return f;}
function axisPanel(owner,scope='axis:profile:1:L0'){const p=new AxisPanel();Object.assign(p,{draftOwner:owner,draftScope:scope});p.aboutToAppear();return p;}
function outputPanel(owner,target='tcp-1',generation=1){const p=new OutputPanel();const d=new OutputSettingsDraft();Object.assign(d,{targetId:target,targetGeneration:generation,profileId:'device',profileRevision:1,applicationId:23,host:'127.0.0.1',port:9999});d.model.ranges=[{axisId:'L0',minimum:.1,maximum:.8,enabled:false}];Object.assign(p,{draftOwner:owner,draftScope:'output:device:1:'+target+':'+generation,draft:d,profileId:'device',profile:{precision:4,revision:1,axisOrder:['L0'],maximumDurationMs:10000,maximumPayloadBytes:1024},appliedConfigurationId:23,connection:'connected'});p.aboutToAppear();return p;}

test('actual axis edit callbacks cannot retarget an equal-valued axis before Watch or after mount replacement',()=>{
 const owner=new SettingsDraftOwner(),p=axisPanel(owner);let writes=0;p.onChange=()=>writes++;
 const stale=p.guardedNumber(v=>p.emit({...p.configuration,scriptScale:v}));p.axis=new device.DeviceAxisDefinition('R0');
 assert.equal(stale(1.2),false);assert.equal(writes,0);
 p.draftScope='axis:profile:1:R0';p.draftContextChanged();const current=p.guardedNumber(v=>p.emit({...p.configuration,scriptScale:v}));
 assert.equal(current(1.2),true);assert.equal(writes,1);p.aboutToDisappear();assert.equal(current(1.3),false);
});
test('phone rotation/tablet resize/PC breakpoint remounts retain invalid axis text without model or transport writes',()=>{
 const {page,calls}=setupIndex();const owner=page.settingsDraftOwner;let writes=0;let p=axisPanel(owner);let f=field(owner,p.draftScope,'scriptScale',1,p.guardedNumber(()=>{writes++;return true;}));
 f.changeHandler()('1e-');f.commitHandler()();assert.equal(f.error,true);const stale=f.commitHandler();const baseline=calls.length;
 for(const [w,h]of [[360,800],[800,360],[800,1280],[1280,800],[1920,1080],[600,800],[280,640]]){
  page.resizeWorkspace(w,h);stale();f.aboutToDisappear();p.aboutToDisappear();p=axisPanel(owner);p.draftEpoch=page.settingsDraftEpoch;
  f=field(owner,p.draftScope,'scriptScale',1,p.guardedNumber(()=>{writes++;return true;}));f.draftEpoch=page.settingsDraftEpoch;f.refreshValue();
  assert.equal(f.draft,'1e-');assert.equal(f.error,true);assert.equal(writes,0);
 }
 assert.equal(calls.length,baseline);f.cancelHandler()();assert.equal(f.draft,'1');assert.equal(owner.hasPending(p.draftScope),false);f.aboutToDisappear();p.aboutToDisappear();
});
test('output raw endpoint/range drafts survive target panel remount without persistence, application-ID change or Arm',()=>{
 const owner=new SettingsDraftOwner();let p=outputPanel(owner),writes=0,arms=0,connects=0;p.onDraftChange=()=>writes++;p.onArm=()=>arms++;p.onConnect=async()=>{connects++;return 24;};
 let f=field(owner,p.draftScope,'port',9999,p.guardedNumber(v=>{p.port=v;p.changed();return true;}));f.changeHandler()('12e');
 p.arm();p.connect();assert.deepEqual([writes,arms,connects],[0,0,0]);assert.match(p.editNotice,/确认/);assert.equal(p.isApplied(),true);
 const old=f.commitHandler();f.aboutToDisappear();p.aboutToDisappear();p=outputPanel(owner);f=field(owner,p.draftScope,'port',9999,p.guardedNumber(v=>{p.port=v;p.changed();return true;}));
 assert.equal(f.draft,'12e');assert.equal(p.applicationId,23);assert.deepEqual(p.model.ranges,[{axisId:'L0',minimum:.1,maximum:.8,enabled:false}]);old();assert.equal(p.port,9999);
 f.cancelHandler()();p.onArm=()=>arms++;p.arm();assert.equal(arms,1);f.aboutToDisappear();p.aboutToDisappear();
});
test('same-valued output target generation and runtime profile replacements reject old numeric/choice/button callbacks',()=>{
 const owner=new SettingsDraftOwner(),p=outputPanel(owner);let actions=0;
 const number=p.guardedNumber(()=>{actions++;return true;}),choice=p.guardedChoice(()=>actions++),button=p.guardedAction(()=>actions++);
 p.draft=OutputSettingsDraft.copy(p.draft);p.draft.targetGeneration++;p.restoreDraft();number(9999);choice('same');button();assert.equal(actions,0);
 const profileButton=p.guardedAction(()=>actions++);p.profile={...p.profile,revision:2};profileButton();assert.equal(actions,0);p.aboutToDisappear();
});
test('background preserves raw text but rejects old change, submit and panel operations; foreground requires fresh lease',()=>{
 const owner=new SettingsDraftOwner(),p=outputPanel(owner);let writes=0;const f=field(owner,p.draftScope,'host','127.0.0.1',()=>{writes++;return true;},TextField);
 f.changeHandler()('local draft');const oldChange=f.changeHandler(),oldCommit=f.commitHandler(),oldButton=p.guardedAction(()=>writes++);
 owner.setAvailable(false);oldChange('late');oldCommit();oldButton();assert.equal(writes,0);assert.equal(f.draft,'local draft');
 owner.setAvailable(true);f.draftEpoch++;f.refreshValue();assert.equal(f.draft,'local draft');oldCommit();assert.equal(writes,0);f.commitHandler()();assert.equal(writes,1);f.aboutToDisappear();p.aboutToDisappear();
});
test('motion effective range coercion history survives remount and restoration performs zero model setters',()=>{
 const owner=new SettingsDraftOwner();let writes=0;
 function mount(configuration){const p=new MotionPanel();Object.assign(p,{draftOwner:owner,draftScope:'motion:p:L0:Random',bindingKey:'p:L0:Random',configuration,onChange(){writes++;}});p.aboutToAppear();return p;}
 const config=Object.assign(new motion.MotionProviderConfiguration('Random'),{minimum:.7,maximum:.2});let p=mount(config);
 // Actual transfer sequence retains coerced effective history independently of source.
 p.controlValues=controls.transferMotionControlValues(p.controlValues,{minimum:.1,maximum:.8,octaves:5}).state;p.saveControlDraft();const expected=structuredClone(p.controlValues);p.aboutToDisappear();p=mount(config);
 assert.deepEqual({...p.controlValues},expected);assert.equal(writes,0);p.aboutToDisappear();
});
test('sync field guard rejects stale source, readonly and disposed owner without setter calls',()=>{
 const p=new SyncPanel();p.aboutToAppear();let writes=0;p.onChange=()=>writes++;const commit=p.guardedNumber(v=>p.changeDuration(v));p.readOnly=true;assert.equal(commit(8),false);p.readOnly=false;p.configuration.durationSeconds=9;assert.equal(commit(8),false);
 const fresh=p.guardedNumber(v=>p.changeDuration(v));p.draftOwner.dispose();assert.equal(fresh(8),false);assert.equal(writes,0);p.aboutToDisappear();
});

test('device clone/add names restore per profile while destructive confirmations and retired callbacks do not',()=>{
 const DevicePanel=controller('DeviceSettingsPanel','DeviceSettingsPanel',helper('DeviceSettingsPanel',['DeviceSettingsEdits'],base));
 const owner=new SettingsDraftOwner();function mount(scope){const p=new DevicePanel();p.draftOwner=owner;p.draftScope=scope;p.aboutToAppear();return p;}
 let p=mount('device:A');let clones=0;p.onCloneProfile=()=>clones++;p.cloneName='unfinished clone';p.newAxisName='Z9';p.saveEditorDraft();p.confirmExport=true;p.confirmRemoveProfile=true;
 const old=p.guardedAction(()=>p.cloneProfile());p.aboutToDisappear();p=mount('device:A');assert.equal(p.cloneName,'unfinished clone');assert.equal(p.newAxisName,'Z9');assert.equal(p.confirmExport,false);assert.equal(p.confirmRemoveProfile,false);old();assert.equal(clones,0);
 p.draftScope='device:B';p.selectedProfileId='other';p.restoreEditorDraft();assert.equal(p.cloneName,'');assert.equal(p.newAxisName,'');p.aboutToDisappear();
});
test('device async clipboard result after layout/background retirement cannot import or revive a confirmation',async()=>{
 let resolve;const pending=new Promise(r=>resolve=r);let reads=0,imports=0;
 class DeviceProfileClipboard{async importProfile(){reads++;return pending;}}
 const DevicePanel=controller('DeviceSettingsPanel','DeviceSettingsPanel',{...helper('DeviceSettingsPanel',['DeviceSettingsEdits'],base),DeviceProfileClipboard,NativeDeviceClipboard:class{}});
 const p=new DevicePanel();p.draftScope='device:A';p.onImportProfile=()=>imports++;p.aboutToAppear();assert.equal(reads,0);const task=p.importClipboard();assert.equal(reads,1);
 p.draftOwner.invalidate();p.aboutToDisappear();resolve(device.DeviceProfiles.clone(device.DeviceProfiles.getBuiltIn(),'clone','Clone'));await task;assert.equal(imports,0);assert.equal(p.confirmExport,false);
});

test('incoming output draft retires callbacks before Watch, including same revision semantic replacement',()=>{
 for(const revision of [0,1]) {const p=outputPanel(new SettingsDraftOwner());let writes=0;p.onDraftChange=()=>writes++;
  const old=p.guardedNumber(v=>{p.port=v;p.changed();return true;});p.draft=OutputSettingsDraft.copy(p.draft);p.draft.editRevision+=revision;p.draft.host='newer-source';
  assert.equal(old(4444),false);assert.equal(writes,0);assert.equal(p.host,'127.0.0.1');}
});
test('late Connect results cannot write draft after background, layout or incoming replacement before Watch',async()=>{
 for(const kind of ['background','layout','incoming']) {const p=outputPanel(new SettingsDraftOwner());let resolve,writes=0;p.onDraftChange=()=>writes++;p.onConnect=()=>new Promise(r=>resolve=r);p.connect();
  if(kind==='background')p.draftOwner.setAvailable(false);
  if(kind==='layout'){p.draftOwner.invalidate();p.draftEpoch++;}
  if(kind==='incoming'){p.draft=OutputSettingsDraft.copy(p.draft);p.draft.host='new source';}
  resolve(555);await Promise.resolve();await Promise.resolve();assert.equal(writes,0,kind);assert.equal(p.applicationId,23,kind);}
});
test('hidden output inputs retain drafts and have a reachable cancel-all without applying configuration',()=>{
 const p=outputPanel(new SettingsDraftOwner());let writes=0;p.onDraftChange=()=>writes++;
 const f=field(p.draftOwner,p.draftScope,'intervalMs',20,()=>{writes++;return true;});f.changeHandler()('1e-');f.aboutToDisappear();
 p.model.polled=true;assert.equal(p.canConnectDraft(),false);const before=p.rawDraftEpoch;p.cancelUnappliedInputs();assert.equal(p.rawDraftEpoch,before+1);assert.equal(p.unappliedInputs(),false);assert.equal(writes,0);assert.equal(p.applicationId,23);
 assert.match(read('OutputSettingsPanel'),/Button\('取消本目标全部未应用输入'\)/);
});
test('native Switch and Choice delivery keeps its original callback and option identity across prop rebinding',()=>{
 const Switch=controller('CurvePointEditor','SettingsSwitchField'),Choice=controller('CurvePointEditor','SettingsChoiceField');let writes=0;
 const s=new Switch();s.onChange=()=>writes++;const old=s.changeHandler();s.onChange=()=>writes+=10;old(true);assert.equal(writes,0);s.changeHandler()(true);assert.equal(writes,10);const background=s.changeHandler();s.aboutToDisappear();background(false);assert.equal(writes,10);
 const c=new Choice();c.options=[new common.SettingsOption('a','A')];c.onSelect=()=>writes++;const callback=c.selectHandler();c.onSelect=()=>writes+=10;callback(0);assert.equal(writes,10);
 const options=c.selectHandler();c.options=[new common.SettingsOption('b','B')];options(0);assert.equal(writes,10);c.selectHandler()(0);assert.equal(writes,20);const disabled=c.selectHandler();c.editable=false;disabled(0);assert.equal(writes,20);
 assert.match(read('CurvePointEditor'),/\.onChange\(this.changeHandler\(\)\)/);assert.match(read('CurvePointEditor'),/\.onSelect\(this.selectHandler\(\)\)/);
});
test('actual realtime scale slider applies immediately only to captured live axis and never another equal-valued axis',()=>{
 const {page}=setupIndex();page.viewActive=true;page.foreground=true;page.axisNames=['L0','R0'];page.selectedAxis=0;let writes=[];page.applyAxisSettings=v=>writes.push(v);page.engine.getAxisConfiguration=()=>new axis.AxisConfiguration(new device.DeviceAxisDefinition('L0'));
 const old=page.axisScaleHandler();old(1.2);assert.equal(writes.length,1);page.selectedAxis=1;old(1.3);assert.equal(writes.length,1);
 const current=page.axisScaleHandler();current(1.4);assert.equal(writes.length,2);page.resizeWorkspace(360,780);current(1.5);assert.equal(writes.length,2);
 const background=page.axisScaleHandler();page.foreground=false;background(1.6);assert.equal(writes.length,2);
});

test('background blank Motion admission key does not overwrite retained effective control history',()=>{
 const owner=new SettingsDraftOwner(),config=Object.assign(new motion.MotionProviderConfiguration('Random'),{minimum:.7,maximum:.2});
 function mount(key){const p=new MotionPanel();Object.assign(p,{draftOwner:owner,draftScope:'motion:p:L0:Random',bindingKey:key,configuration:config});p.aboutToAppear();return p;}
 let p=mount('p:L0:Random');p.controlValues=controls.transferMotionControlValues(p.controlValues,{minimum:.1,maximum:.8,octaves:5}).state;p.saveControlDraft();const expected=structuredClone(p.controlValues);p.aboutToDisappear();
 owner.setAvailable(false);p=mount('');assert.deepEqual({...p.controlValues},expected);p.aboutToDisappear();owner.setAvailable(true);p=mount('p:L0:Random');assert.deepEqual({...p.controlValues},expected);p.aboutToDisappear();
});

test('device precision has one readonly-aware editable property and still protects built-in profiles',()=>{
 const s=read('DeviceSettingsPanel');const start=s.indexOf("draftKey: 'precision'");const field=s.slice(start,s.indexOf('onCommit:',start));assert.equal((field.match(/editable:/g)||[]).length,1);assert.match(field,/editable: !this\.readOnly && !this\.selected\(\)\.isBuiltIn/);
});
