import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes,registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);}});
const {setupIndex}=await import('./index-controller-helpers.mjs');
const {createOutputOwner}=await import('./output-owner-helpers.mjs');
const {SocketDiagnostic}=await import('../entry/src/main/ets/output/diagnostics/SocketDiagnostic.ts');
const {OutputCoordinator,OutputEndpoint}=await import('../entry/src/main/ets/output/OutputCoordinator.ts');
const {MemoryTransport}=await import('../entry/src/main/ets/output/MemoryTransport.ts');
const {PlaybackSessionCore}=await import('../entry/src/main/ets/core/PlaybackSessionCore.ts');
const {FunscriptParser}=await import('../entry/src/main/ets/core/Funscript.ts');
const {KeyboardInputSession}=await import('../entry/src/main/ets/app/KeyboardInputSession.ts');
const {ShortcutAction,EMERGENCY_STOP_KEY}=await import('../entry/src/main/ets/input/ShortcutConfiguration.ts');
const source=readFileSync(new URL('../entry/src/main/ets/app/SocketDiagnosticSession.ets',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export class SocketDiagnosticSession','class SocketDiagnosticSession');
const settle=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
const policy={maximumFrameAgeMs:200,maximumClockAgeMs:750,maximumEventAgeMs:200,maximumFixedElapsedMs:1000,writeTimeoutMs:1000,maximumPolledQueueLength:64,allowZeroInterval:true};
function setup(){
 const time={now:40,next:0,tasks:new Map(),nowMs(){return this.now;},scheduleAt(at,fn){const id=++this.next;this.tasks.set(id,{at,fn});return id;},cancel(id){this.tasks.delete(id);}};
 const diagnosticPorts=[],outputPorts=[];let nonce=0,rejectClose=false;
 const diagnostic=new SocketDiagnostic({create(){const p=new MemoryTransport(time);const open=p.open.bind(p);p.open=(c,g)=>open({...c,kind:'memory'},g);p.rejectClose=rejectClose;diagnosticPorts.push(p);return p;},canRelease:()=>!rejectClose,release(){}},time,time,{nextNonce:()=> (++nonce).toString(16).padStart(32,'0')},'nodeBridge');
 const Diagnostic=new Function('NativeSocketDiagnostic',stripTypeScriptTypes(source)+';return SocketDiagnosticSession;')(class{constructor(){return diagnostic;}});
 const Owner=createOutputOwner(source=>{const c=new OutputCoordinator({inspect:()=>({available:true,diagnostic:''}),create(){const p=new MemoryTransport(time);outputPorts.push(p);return p;}},source,policy,time,time);const connect=c.connect.bind(c),owned=c.connectOwned.bind(c);c.connect=(v,e)=>connect({...v,kind:'memory'},e);c.connectOwned=(v,e)=>owned({...v,kind:'memory'},e);return c;},Diagnostic);
 const core=new PlaybackSessionCore();core.flush=()=>{};core.setConnected(true);core.load(FunscriptParser.parse('{"actions":[{"at":0,"pos":10},{"at":10000,"pos":90}]}'));core.play();core.tick(40,40);
 const h=setupIndex({engine:core,outputOwner:Owner,diagnosticOwner:Diagnostic}),p=h.page;
 Owner.restore(core.outputConfiguration(),core.activeRegistry().profile,core.activeRegistry().revision);p.diagnosticOwner=Diagnostic.claimOwner();p.sync=()=>p.syncOutput();p.sync();
 const request=()=>({kind:'tcp',host:'fixture.invalid',port:1234,dedicatedReceiverConfirmed:true});
 const prepare=()=>{p.editDiagnosticHost('fixture.invalid');p.editDiagnosticPort(1234);p.diagnosticConfirmed=true;};
 const add=(kind='tcp')=>{p.addOutputTarget(kind);const id=p.selectedOutputId,d=Owner.draftSnapshot(id);d.host='fixture.invalid';d.port=1234;d.editRevision++;d.model.ranges=d.model.ranges.map(r=>({...r,enabled:r.axisId==='L0'}));p.updateOutputDraft(d);return id;};
 const connect=id=>{const d=Owner.draftSnapshot(id),e=new OutputEndpoint();Object.assign(e,{host:d.host,port:d.port,family:1,localPort:0,scheme:d.scheme,path:d.path});return p.connectOutput(d.model.config(p.outputProfile,id),e,d.targetGeneration);};
 const echo=()=>{const port=diagnosticPorts.at(-1),w=port.writeRecords().at(-1);port.emit({kind:'received',connectionGeneration:w.connectionGeneration,bytes:w.bytes});};
 return {...h,time,core,Diagnostic,Owner,diagnostic,diagnosticPorts,outputPorts,request,prepare,add,connect,echo,quarantine(){rejectClose=true;}};
}
test('diagnostic restores inert with empty endpoint and requires explicit dedicated receiver confirmation',async()=>{
 const h=setup(),p=h.page;assert.equal(p.diagnosticHost,'');assert.equal(p.diagnosticPort,0);assert.equal(p.diagnosticConfirmed,false);await p.startSocketDiagnostic();assert.equal(h.diagnosticPorts.length,0);
 h.prepare();p.invalidateDiagnosticConfirmation();await p.startSocketDiagnostic();assert.equal(h.diagnosticPorts.length,0);assert.match(p.diagnosticNotice,/编辑/);
 h.prepare();p.foreground=false;await p.startSocketDiagnostic();assert.equal(h.diagnosticPorts.length,0);
});
test('ALL targets must be confirmed disconnected, including nonselected busy/fault/removal',async()=>{
 const h=setup();const bad=[{connection:'connected',armed:false,closeConfirmed:true},{connection:'disconnected',armed:true,closeConfirmed:true},{connection:'fault',armed:false,closeConfirmed:false}];
 for(const state of bad){const outputs={ids:()=>['selected','hidden'],get:id=>({isBusy:()=>false,status:()=>id==='hidden'?state:null}),isRemoving:()=>false};await assert.rejects(h.Diagnostic.run(h.page.diagnosticOwner,h.request(),outputs));}
 for(const mode of ['busy','removing']){const outputs={ids:()=>['hidden'],get:()=>({isBusy:()=>mode==='busy',status:()=>null}),isRemoving:()=>mode==='removing'};await assert.rejects(h.Diagnostic.run(h.page.diagnosticOwner,h.request(),outputs));}
 assert.equal(h.diagnosticPorts.length,0);
});
test('live one-shot interlocks real UI and shortcut Connect/Arm across all targets; Stop cancels without autoarm',async()=>{
 const h=setup(),p=h.page,a=h.add(),b=h.add('udp');h.prepare();const pending=p.startSocketDiagnostic();assert.equal(h.Diagnostic.blocked(),true);await settle();assert.equal(h.diagnosticPorts.length,1);
 assert.equal(await h.connect(a),false);assert.equal(await h.connect(b),false);for(const id of[a,b]){const action=new ShortcutAction('OutputTarget::Connection::Connect');action.outputTargetId=id;await assert.rejects(p.executeOutputConnectionAction(action,null));p.armOutput(id);}
 assert.equal(h.outputPorts.length,0);assert.equal(p.editDiagnosticHost('other.invalid'),false);p.stop();await pending;assert.equal(h.diagnostic.snapshot().phase,'cancelled');assert.equal(h.Diagnostic.blocked(),false);assert.equal(h.diagnostic.snapshot().proof,'none');
 assert.equal(await h.connect(a),true);assert.equal(p.output.get(a).status().armed,false);assert.equal(h.outputPorts[0].writeRecords().length,0);await p.output.dispose();
});
test('background/stage lifecycle through actual NativeOutputSession cancels and foreground never reruns',async()=>{
 const h=setup();h.prepare();const pending=h.page.startSocketDiagnostic();await settle();h.Owner.setForeground(false);await pending;assert.equal(h.diagnostic.snapshot().phase,'cancelled');h.Owner.setForeground(true);await settle();assert.equal(h.diagnosticPorts.length,1);assert.equal(h.Diagnostic.blocked(),false);
 const code=readFileSync(new URL('../entry/src/main/ets/entryability/EntryAbility.ets',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export default class','class');
 for(const method of ['onBackground','onWindowStageDestroy','onDestroy']){
  h.Owner.setForeground(true);const operation=h.Diagnostic.run(h.page.diagnosticOwner,h.request(),h.page.output);await settle();
  const Ability=new Function('UIAbility','NativeOutputSession','RemoteMediaSession','NativeWindowPresentation','PlaybackSession','AppStorage',stripTypeScriptTypes(code)+';return EntryAbility;')(class{},h.Owner,{closeIfReady(){}},{destroyStage(){},setForeground(){}},{flushIfReady(){}},{setOrCreate(){}});
  new Ability()[method]();assert.equal(h.diagnostic.snapshot().phase,'closing');assert.equal((await operation).phase,'cancelled');
 }
});
test('remount cancels old request, late owner cannot cancel new request, and close quarantine survives replacement page',async()=>{
 const h=setup(),old=h.page.diagnosticOwner;const first=h.Diagnostic.run(old,h.request(),h.page.output);await settle();const next=h.Diagnostic.claimOwner();assert.equal((await first).phase,'cancelled');
 const second=h.Diagnostic.run(next,h.request(),h.page.output);await settle();h.Diagnostic.releaseOwner(old);assert.equal(h.diagnostic.snapshot().busy,true);h.echo();assert.equal((await second).proof,'exactEcho');
 h.quarantine();const failed=h.Diagnostic.run(next,h.request(),h.page.output);await settle();h.Diagnostic.cancel(next);await failed;assert.equal(h.Diagnostic.blocked(),true);assert.equal(h.diagnostic.snapshot().quarantined,true);
 const newest=h.Diagnostic.claimOwner();h.Owner.setForeground(false);h.Owner.setForeground(true);assert.equal(h.Diagnostic.blocked(),true);assert.equal((await h.Diagnostic.run(newest,h.request(),h.page.output)).phase,'rejected');assert.equal(h.diagnosticPorts.length,3);
 const target=h.add();assert.equal(await h.connect(target),false);assert.equal(h.outputPorts.length,0);
});
test('last successful record cannot overwrite a newer denied or rejected diagnostic notice on refresh',async()=>{
 const h=setup(),p=h.page;h.prepare();const first=p.startSocketDiagnostic();await settle();h.echo();await first;assert.match(p.diagnosticResult,/完整回显/);
 p.diagnosticPort=0;p.diagnosticConfirmed=true;await p.startSocketDiagnostic();assert.match(p.diagnosticNotice,/invalidEndpoint/);for(let i=0;i<5;i++)p.syncOutput();assert.match(p.diagnosticNotice,/invalidEndpoint/);assert.match(p.diagnosticResult,/诊断记录 · 请求 1/);
 p.diagnosticPort=1234;const id=h.add();await h.connect(id);p.diagnosticConfirmed=true;await p.startSocketDiagnostic();p.syncOutput();assert.match(p.diagnosticNotice,/断开所有/);await p.output.dispose();
});
test('actual F12 Stop cancels diagnostic while text editing and old echo cannot restore it',async()=>{
 const h=setup();h.prepare();const pending=h.page.startSocketDiagnostic();await settle();const port=h.diagnosticPorts[0],w=port.writeRecords()[0];
 const editor=KeyboardInputSession.newEditorId();KeyboardInputSession.setEditorFocus(editor,true);assert.equal(KeyboardInputSession.isEditing(),true);
 assert.equal(h.page.handleKeyboardKey(EMERGENCY_STOP_KEY,true),true);await pending;KeyboardInputSession.releaseEditor(editor);port.emit({kind:'received',connectionGeneration:w.connectionGeneration,bytes:w.bytes});h.page.syncSocketDiagnostic();assert.equal(h.diagnostic.snapshot().proof,'none');assert.equal(h.diagnostic.snapshot().phase,'cancelled');
});

test('pinned global Stop hard-stops actual wide-tablet playback and armed output without depending on scroll or keyboard',async()=>{
 const h=setup(),p=h.page,id=h.add();await h.connect(id);const d=h.Owner.draftSnapshot(id);d.applicationId=p.output.get(id).appliedConfigurationId();h.Owner.saveDraft(d);p.syncOutput();p.armOutput(id);assert.equal(p.output.get(id).status().armed,true);
 p.widthVp=1024;p.heightVp=768;p.videoMode=false;p.showOutputSettings=false;p.showSourceSettings=false;p.showInputSettings=false;
 const code=readFileSync(new URL('../entry/src/main/ets/pages/Index.ets',import.meta.url),'utf8');const builder=code.slice(code.indexOf('  globalStopButton() {'),code.indexOf('  headerTools() {'));
 assert.match(builder,/onClick\(\(\) => this.stop\(\)\)/);p.stop();assert.equal(h.core.snapshot().state,'stopped');assert.equal(p.output.get(id).status().armed,false);assert.equal(h.core.dispatchSource(['L0']).authorization,null);await p.output.dispose();
});
