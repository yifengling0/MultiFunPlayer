import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks,stripTypeScriptTypes} from 'node:module';
import {createOutputOwner,inertCoordinator} from './output-owner-helpers.mjs';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);}});
const {OutputSettingsModel,OutputSettingsDraft}=await import('../entry/src/main/ets/output/OutputSettingsModel.ts');
const {OutputEndpoint}=await import('../entry/src/main/ets/output/OutputCoordinator.ts');
const { KeyboardInputSession } = await import('../entry/src/main/ets/app/KeyboardInputSession.ts');
const {OutputConfiguration,SavedOutputTarget}=await import('../entry/src/main/ets/settings/OutputConfiguration.ts');
const device={id:'TCode-0.3',axes:[{name:'L0',enabled:true}]};
const profile={precision:4,revision:7,axisOrder:['L0'],maximumDurationMs:10000,maximumPayloadBytes:1024};
test('volatile output settings defaults manual, blank destination, paused motion off',()=>{
 const m=new OutputSettingsModel(),e=new OutputEndpoint(),c=m.config(profile);
 assert.equal(e.host,'');assert.equal(e.port,0);assert.equal(c.autoConnectPolicy,'manual');assert.equal(c.allowPausedAutoHome,false);assert.equal(c.allowPausedMotion,false);assert.equal(c.updateContext.intervalMs,10);
});
test('fixed/polled, range and pause edits become actual config without invented provenance',()=>{
 const m=new OutputSettingsModel();m.ranges=[{axisId:'L0',minimum:0,maximum:1,enabled:true}];
 assert.equal(m.setRange('L0',.9,.2,true),true);assert.deepEqual(m.ranges[0],{axisId:'L0',minimum:.9,maximum:.2,enabled:true});
 assert.equal(m.setRange('L0',.2,.8,false),true);assert.equal(m.setRange('L0',1.01,.2,true),false);assert.equal(m.setRange('BAD',0,1,true),false);
 m.pausedAutoHome=true;m.pausedMotion=true;m.polled=true;let c=m.config(profile);assert.deepEqual(c.updateContext,{kind:'polled'});assert.equal(c.allowPausedAutoHome,true);assert.equal(c.allowPausedMotion,true);assert.equal(c.axisRanges[0].enabled,false);
 m.polled=false;m.setKind('webSocket');c=m.config(profile);assert.equal(c.updateContext.intervalMs,16);assert.equal(c.updateContext.usePreciseSleep,false);
 c.axisRanges[0].minimum=.7;assert.equal(m.ranges[0].minimum,.2);assert.throws(()=>m.setKind('serial'));
});
test('UI controls bind target identity, edits disarm only it, and valid preferences are persisted',()=>{
 const ui=readFileSync(new URL('../entry/src/main/ets/components/OutputSettingsPanel.ets',import.meta.url),'utf8');
 for(const hook of ['this.onConnect(this.model.config(this.profile, targetId), endpoint, targetGeneration)','this.onDisconnect(this.targetId, this.targetGeneration)','this.onArm(this.targetId, this.targetGeneration)','this.onDisarm(this.targetId, this.targetGeneration)','this.isApplied() && this.connection'])assert.ok(ui.includes(hook),hook);
 assert.ok(ui.includes('this.applicationId = 0; this.onDisarm(this.targetId, this.targetGeneration)'));assert.ok(ui.includes('revision === this.editRevision'));
 assert.ok(ui.includes('不是设备执行确认'));assert.equal(/preferences|writeFile|console\.|hilog|previewSamples|PlaybackEngine/.test(ui),false);
});


test('application native output lifecycle creates no connection and gates immediately on Ability background',()=>{
 const calls=[];const port={setTerminalGateObserver(){},setForeground(v){calls.push(['foreground',v]);},async dispose(){calls.push(['dispose']);}};
 const NativeOutputSession=createOutputOwner(()=>{calls.push(['create']);return port;});
 NativeOutputSession.setForeground(false);assert.deepEqual(calls,[]);const collection=NativeOutputSession.current({});assert.deepEqual(calls,[]);
 const saved=new OutputConfiguration();saved.targets=[new SavedOutputTarget('tcp',0)];saved.selectedTargetId='tcp:0';NativeOutputSession.restore(saved,device,7);
 assert.equal(collection.get('tcp:0'),port);assert.deepEqual(calls,[['create'],['foreground',false]]);
 NativeOutputSession.current({});assert.equal(calls.filter(([kind])=>kind==='create').length,1);
 const ability=readFileSync(new URL('../entry/src/main/ets/entryability/EntryAbility.ets',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export default class','class');
 const EntryAbility=new Function('UIAbility','NativeOutputSession','AppStorage','PlaybackSession','NativeWindowPresentation','DeoVrSession',stripTypeScriptTypes(ability)+';return EntryAbility;')(class{},NativeOutputSession,{setOrCreate(_name,value){calls.push(['storage',value]);}},{flushIfReady(){calls.push(['flush']);}},{setForeground(){},destroyStage(){}},{closeIfReady(){}});
 calls.length=0;const app=new EntryAbility();app.onBackground();assert.deepEqual(calls,[['foreground',false],['storage',false],['flush']]);
 calls.length=0;app.onForeground();assert.deepEqual(calls,[['foreground',true],['storage',true]]);
 app.onDestroy();assert.ok(calls.filter(([kind,value])=>kind==='foreground'&&value===false).length>0);
 assert.equal(calls.some(([kind])=>kind==='dispose'),false);app.onForeground();assert.equal(NativeOutputSession.current({}),collection);
 assert.equal(calls.some(([kind])=>kind==='connect'||kind==='arm'),false);
});
test('real Index imports native controls and only the normal INTERNET permission',()=>{
 const page=readFileSync(new URL('../entry/src/main/ets/pages/Index.ets',import.meta.url),'utf8');
 assert.ok(page.includes('OutputSettingsPanel({'));assert.ok(page.includes('NativeOutputSession.current(this.engine)'));
 assert.ok(page.includes('this.output.refresh()'));assert.equal(page.includes('this.connected && this.foreground'),false);
 const manifest=JSON.parse(readFileSync(new URL('../entry/src/main/module.json5',import.meta.url),'utf8'));
 assert.deepEqual(manifest.module.requestPermissions,[{name:'ohos.permission.INTERNET'}]);
});


test('opening or hiding output settings does not count as a configuration edit or destroy its draft',()=>{
 const source=readFileSync(new URL('../entry/src/main/ets/components/OutputSettingsPanel.ets',import.meta.url),'utf8');
 const controller=('class Panel {'+source.slice(source.indexOf('export struct OutputSettingsPanel {')+'export struct OutputSettingsPanel {'.length,source.indexOf('  build() {'))+'}')
   .replace(/@Prop\s*@Watch\([^)]*\)\s*/g,'').replace(/@Prop\s*|@State\s*/g,'');
 const Panel=new Function('OutputSettingsModel','OutputSettingsDraft','OutputEndpoint','KeyboardInputSession',stripTypeScriptTypes(controller)+';return Panel;')(OutputSettingsModel,OutputSettingsDraft,OutputEndpoint,KeyboardInputSession);
 const panel=new Panel();let disarms=0;panel.onDisarm=()=>disarms++;panel.profile=profile;panel.profileId=device.id;panel.draft=draftOwner().draftSnapshot();panel.aboutToAppear();
 assert.equal(disarms,0);assert.equal(panel.model.ranges.length,1);panel.changed();assert.equal(disarms,1);
 const page=readFileSync(new URL('../entry/src/main/ets/pages/Index.ets',import.meta.url),'utf8');
 assert.ok(page.includes('.visibility(this.showOutputSettings ? Visibility.Visible : Visibility.None)'));
 assert.equal(page.includes('if (this.showOutputSettings) {\n        OutputSettingsPanel'),false);
});

function panelClass() {
 const source=readFileSync(new URL('../entry/src/main/ets/components/OutputSettingsPanel.ets',import.meta.url),'utf8');
 const controller=('class Panel {'+source.slice(source.indexOf('export struct OutputSettingsPanel {')+'export struct OutputSettingsPanel {'.length,source.indexOf('  build() {'))+'}')
   .replace(/@Prop\s*@Watch\([^)]*\)\s*/g,'').replace(/@Prop\s*|@State\s*/g,'');
 return new Function('OutputSettingsModel','OutputSettingsDraft','OutputEndpoint','KeyboardInputSession',stripTypeScriptTypes(controller)+';return Panel;')(OutputSettingsModel,OutputSettingsDraft,OutputEndpoint,KeyboardInputSession);
}
function draftOwner() {
 const Owner=createOutputOwner(()=>inertCoordinator());Owner.current({});Owner.restore(new OutputConfiguration(),device,7);Owner.addTarget('webSocket');return Owner;
}
test('responsive/video/rotation panel replacement restores controlled endpoint ranges modes and actual application identity',async()=>{
 const Owner=draftOwner(),Panel=panelClass();let disarms=0;
 const mount=()=>{const panel=new Panel();panel.profile=profile;panel.profileId=device.id;panel.draft=Owner.draftSnapshot();panel.onDraftChange=d=>{Owner.saveDraft(d);panel.draft=Owner.draftSnapshot();};panel.onDisarm=()=>disarms++;panel.aboutToAppear();return panel;};
 let panel=mount();panel.host='device.local';panel.port=2345;panel.family='2';panel.localPort=456;panel.path='/control';panel.scheme='wss';
 panel.model.setKind('webSocket');panel.model.setRange('L0',.2,.7,false);panel.model.polled=true;panel.model.pausedAutoHome=true;panel.model.offloadElapsed=true;panel.changed();
 panel.onConnect=async()=>17;panel.connect();await Promise.resolve();await Promise.resolve();panel.appliedConfigurationId=17;assert.equal(panel.isApplied(),true);
 const expected=Owner.draftSnapshot();
 for(const branch of ['wide','narrow','video','rotate','reappear']) {panel=mount();panel.appliedConfigurationId=17;assert.deepEqual(Owner.draftSnapshot(),expected,branch);assert.deepEqual(panel.model.config(profile),expected.model.config(profile),branch);assert.equal(panel.host,'device.local');assert.equal(panel.isApplied(),true);panel.aboutToAppear();assert.deepEqual(Owner.draftSnapshot(),expected);}
 assert.equal(disarms,1);panel.appliedConfigurationId=18;assert.equal(panel.isApplied(),false);panel.appliedConfigurationId=0;assert.equal(panel.isApplied(),false);
 panel.profile={...profile,revision:8,axisOrder:['R0']};panel.profileChanged();assert.equal(panel.applicationId,0);assert.deepEqual(panel.model.ranges,[{axisId:'R0',minimum:0,maximum:1,enabled:true}]);assert.equal(disarms,2);
});
test('stale unmounted connect completion cannot overwrite a newer draft; copies isolate mutable ranges',async()=>{
 const Owner=draftOwner(),Panel=panelClass();const make=()=>{const p=new Panel();p.profile=profile;p.profileId=device.id;p.draft=Owner.draftSnapshot();p.onDraftChange=d=>Owner.saveDraft(d);p.aboutToAppear();return p;};
 const old=make();old.host='device.local';old.port=1234;old.changed();let resolve;old.onConnect=()=>new Promise(r=>resolve=r);old.connect();
 const current=make();current.host='new-device';current.model.setRange('L0',.3,.6,false);current.changed();resolve(11);await Promise.resolve();await Promise.resolve();
 assert.equal(Owner.draftSnapshot().host,'new-device');assert.equal(Owner.draftSnapshot().applicationId,0);
 const copy=Owner.draftSnapshot();copy.model.ranges[0].minimum=0;assert.equal(Owner.draftSnapshot().model.ranges[0].minimum,.3);
});

test('paused manual permission is an independent controlled draft, disarms on edit and survives remount and cold restore',()=>{
 const Owner=draftOwner(),Panel=panelClass();const calls=[];
 const mount=()=>{const panel=new Panel();panel.profile=profile;panel.profileId=device.id;panel.draft=Owner.draftSnapshot();panel.onDraftChange=d=>{assert.equal(Owner.saveDraft(d),true);panel.draft=Owner.draftSnapshot();};panel.onDisarm=(...args)=>calls.push(['disarm',...args]);panel.onArm=()=>calls.push(['arm']);panel.onConnect=()=>{calls.push(['connect']);return Promise.resolve(17);};panel.aboutToAppear();return panel;};
 let panel=mount();assert.equal(panel.model.pausedManual,false);assert.equal(panel.model.config(profile).allowPausedManual,false);
 panel.applicationId=17;panel.appliedConfigurationId=17;panel.connection='connected';panel.model.pausedManual=true;panel.changed();
 assert.equal(panel.applicationId,0);assert.equal(panel.isApplied(),false);assert.deepEqual(calls.map(c=>c[0]),['disarm']);
 assert.equal(Owner.draftSnapshot().model.pausedManual,true);assert.equal(Owner.configurationSnapshot().targets[0].pausedManual,true);
 assert.equal(Owner.configurationSnapshot().targets[0].pausedMotion,false);assert.equal(Owner.configurationSnapshot().targets[0].pausedAutoHome,false);
 const revision=Owner.draftSnapshot().editRevision;
 for(const view of ['wide','narrow','video','rotation','hide-show']){
  panel.aboutToDisappear();panel=mount();assert.equal(panel.model.pausedManual,true,view);assert.equal(panel.model.config(profile).allowPausedManual,true,view);
  assert.equal(panel.model.pausedMotion,false);assert.equal(panel.editRevision,revision);assert.equal(panel.applicationId,0);
 }
 assert.deepEqual(calls.map(c=>c[0]),['disarm']);
 const coldCalls=[],Restored=createOutputOwner(()=>({...inertCoordinator(),connect(){coldCalls.push('connect');},arm(){coldCalls.push('arm');}}));
 Restored.current({});Restored.restore(Owner.configurationSnapshot(),device,7);assert.deepEqual(coldCalls,[]);
 assert.equal(Restored.draftSnapshot().model.pausedManual,true);assert.equal(Restored.draftSnapshot().applicationId,0);
 const copy=Restored.draftSnapshot();copy.model.pausedManual=false;assert.equal(Restored.draftSnapshot().model.pausedManual,true);
});

test('old saved output restore defaults pausedManual false even with both older permissions enabled',()=>{
 const target=new SavedOutputTarget('tcp',0);delete target.pausedManual;target.pausedMotion=true;target.pausedAutoHome=true;
 const saved=new OutputConfiguration();saved.targets=[target];saved.selectedTargetId=target.id;
 const calls=[],Owner=createOutputOwner(()=>({...inertCoordinator(),connect(){calls.push('connect');},arm(){calls.push('arm');}}));
 Owner.current({});Owner.restore(saved,device,7);assert.equal(Owner.draftSnapshot().model.pausedManual,false);
 assert.equal(Owner.configurationSnapshot().targets[0].pausedManual,false);assert.equal(Owner.draftSnapshot().applicationId,0);assert.deepEqual(calls,[]);
});

test('manual output permission UI is disabled for polled and explains explicit start, Set and Arm separately',()=>{
 const source=readFileSync(new URL('../entry/src/main/ets/components/OutputSettingsPanel.ets',import.meta.url),'utf8');
 assert.match(source,/editable: this\.canEdit\(\) && !this\.model\.polled, label: '暂停手动过渡输出'/);
 assert.match(source,/if \(!this\.canEdit\(\) \|\| this\.model\.polled\) \{ return; \} this\.model\.pausedManual = value; this\.changed\(\)/);
 assert.match(source,/不产生 Polled 事件/);assert.match(source,/明确预览 \/ 开始/);assert.match(source,/仅 Set 修改值不会开始，也不会 Arm/);
 const Owner=draftOwner(),Panel=panelClass(),panel=new Panel();panel.profile=profile;panel.profileId=device.id;panel.draft=Owner.draftSnapshot();panel.aboutToAppear();
 panel.model.pausedManual=true;panel.model.polled=true;const copy=OutputSettingsDraft.copy({...panel.draft,model:panel.model});
 panel.draft=copy;panel.restoreDraft();assert.equal(panel.model.pausedManual,true);assert.equal(panel.model.polled,true);
 panel.model.polled=false;assert.equal(panel.model.config(profile).allowPausedManual,true);
});

test('armed-wait status is visibly distinct from dispatch-open and native target summaries retain it',()=>{
 const source=readFileSync(new URL('../entry/src/main/ets/components/OutputSettingsPanel.ets',import.meta.url),'utf8');
 assert.match(source,/@Prop dispatchSuspended: boolean = false/);assert.match(source,/this\.dispatchSuspended \? ' · 待命，无输出' : ' · 发送门开放'/);
 assert.match(source,/明确 Arm 可待命，无输出/);assert.match(source,/只有真实手动 Transition 当前帧通过检查后才发送/);
 const status={connection:'connected',armed:true,dispatchSuspended:true};
 const Owner=createOutputOwner(()=>({...inertCoordinator(),status(){return status;}}));Owner.current({});
 const saved=new OutputConfiguration();saved.targets=[new SavedOutputTarget('tcp',0)];saved.selectedTargetId='tcp:0';Owner.restore(saved,device,7);
 assert.equal(Owner.summaries()[0].armed,true);assert.equal(Owner.summaries()[0].dispatchSuspended,true);
 status.dispatchSuspended=false;assert.equal(Owner.summaries()[0].dispatchSuspended,false);
});
