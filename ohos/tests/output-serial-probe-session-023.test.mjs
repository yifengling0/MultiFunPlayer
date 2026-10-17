import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {stripTypeScriptTypes,registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);}});
import {createOutputOwner} from './output-owner-helpers.mjs';import {setupIndex} from './index-controller-helpers.mjs';
const {SerialProbeError}=await import('../entry/src/main/ets/output/serial/SerialProbeTypes.ts');
const {SerialDiscoveryController}=await import('../entry/src/main/ets/output/SerialDiscoveryController.ts');
const {PlaybackSessionCore}=await import('../entry/src/main/ets/core/PlaybackSessionCore.ts');
const {OutputCoordinator,OutputEndpoint}=await import('../entry/src/main/ets/output/OutputCoordinator.ts');
const {SerialOutputPreferences}=await import('../entry/src/main/ets/settings/SerialOutputPreferences.ts');
const source=readFileSync(new URL('../entry/src/main/ets/app/SerialDiagnosticSession.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/\bexport /g,'');
const fresh=()=>new Function('SerialProbeError',stripTypeScriptTypes(source)+';return SerialDiagnosticSession;')(SerialProbeError);
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};
const selection={backend:'ch34xWriteOnly',portName:'private-device-path',portId:0};
const report={status:'success',closeConfirmed:true,quarantined:false,diagnosticCode:null,readOnly:true,vendorId:0x1a86,productId:0x7523,configuration:1,interfaceId:0,interfaceClass:255,interfaceSubclass:1,interfaceProtocol:2,inputAddress:0x82,outputAddress:2,inputPacketSize:32,outputPacketSize:32,version:0x30,versionExtra:0,versionSupported:true,api18TransfersPresent:true};
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve()};
function fixture(){
 const S=fresh(),gate=deferred();let called=0,current;const probe={async probeReadOnly(s,c){called++;current=c;return gate.promise}};return{S,gate,probe,owner:S.claimOwner(),called:()=>called,current:()=>current()};
}
test('constructor/snapshot/claim are inert; explicit probe closes interlock before await and sanitized success can be copied',async()=>{
 const f=fixture();assert.equal(f.called(),0);assert.equal(f.S.blocked(),false);const op=f.S.run(f.owner,f.probe,selection,()=>true,true);assert.equal(f.called(),1);assert.equal(f.S.blocked(),true);assert.equal(f.current(),true);f.gate.resolve(report);const result=await op;assert.equal(result.phase,'completed');assert.equal(f.S.blocked(),false);assert.deepEqual(JSON.parse(result.report),report);assert.ok(!result.report.includes(selection.portName));result.phase='edited';assert.equal(f.S.snapshot().phase,'completed');
});
for(const action of ['stop','background','owner','release','target'])test(`probe ${action} revokes continuation and discards late report, remaining blocked until exact cleanup`,async()=>{
 const f=fixture();let context=true;const op=f.S.run(f.owner,f.probe,selection,()=>context,true);
 if(action==='stop')f.S.cancel(f.owner);else if(action==='background'){f.S.setForeground(false);f.S.setForeground(true)}else if(action==='owner')f.S.claimOwner();else if(action==='release')f.S.releaseOwner(f.owner);else context=false;
 assert.equal(f.current(),false);assert.equal(f.S.blocked(),true);f.gate.resolve(report);assert.equal((await op).phase,'cancelled');assert.equal(f.S.snapshot().report,'');assert.equal(f.S.blocked(),false);
});
for(const mode of ['timeout','close','unknown','badReport'])test(`probe ${mode} retains process quarantine through owner/foreground changes`,async()=>{
 const f=fixture(),op=f.S.run(f.owner,f.probe,selection,()=>true,true);if(mode==='badReport')f.gate.resolve({...report,closeConfirmed:false});else f.gate.reject(mode==='unknown'?Error('private path/token'):new SerialProbeError(mode,false));await op;assert.equal(f.S.blocked(),true);assert.equal(f.S.snapshot().quarantined,true);assert.ok(!f.S.snapshot().diagnosticCode.includes('private'));f.S.claimOwner();f.S.setForeground(false);f.S.setForeground(true);assert.equal(f.S.blocked(),true);await assert.rejects(f.S.run(f.S.claimOwner(),f.probe,selection,()=>true,true));assert.equal(f.called(),1);
});
test('permission denial with confirmed cleanup unblocks without granting connection or Arm; rejected admission never calls probe',async()=>{
 const f=fixture();for(const [owner,kind,current,quiet]of[[0,selection,true,true],[f.owner,{...selection,backend:'official26'},true,true],[f.owner,selection,false,true],[f.owner,selection,true,false]])await assert.rejects(f.S.run(owner,f.probe,kind,()=>current,quiet));assert.equal(f.called(),0);const op=f.S.run(f.owner,f.probe,selection,()=>true,true);f.gate.reject(new SerialProbeError('permissionDenied',true));assert.equal((await op).phase,'failed');assert.equal(f.S.blocked(),false);assert.equal(f.S.snapshot().report,'');
});
function pageFixture(){
 const f=fixture();const clock={nowMs:()=>0,scheduleAt:()=>1,cancel(){}};const socket={blocked:()=>false,setForeground(){},outputsQuiet:output=>output.ids().every(id=>{const s=output.get(id).status();return !output.get(id).isBusy()&&(s===null||(s.connection==='disconnected'&&s.closeConfirmed&&!s.armed))}),snapshot:()=>({requestId:0}),cancel(){}};
 const Owner=createOutputOwner((engine)=>new OutputCoordinator(engine,{inspect:()=>({available:false,diagnostic:'test'}),create(){throw Error('not admitted')}},clock,clock),socket,f.S);
 const engine=new PlaybackSessionCore();engine.flush=()=>{};const {page}=setupIndex({engine,outputOwner:Owner,serialProbeOwner:f.S,diagnosticOwner:socket});Owner.restore(engine.outputConfiguration(),engine.activeRegistry().profile,engine.activeRegistry().revision);page.addOutputTarget('serial');const d=Owner.draftSnapshot();d.serial.backend=selection.backend;d.serial.portName=selection.portName;d.editRevision++;page.updateOutputDraft(d);page.serialProbeOwner=f.owner;page.serialProbeFactory=f.probe;
 page.serialDiscovery=new SerialDiscoveryController({inspectAll:()=>[{backend:selection.backend,available:true,diagnostic:'experimentalWriteOnlyNotDeviceVerified'}],async listPortsExplicit(){return[{...selection,label:'CH340',vendorId:0x1a86,productId:0x7523,writeOnly:true,controlLines:true}]}});return{...f,page,Owner,engine,draft:Owner.draftSnapshot()};
}
test('actual Index probe binds fresh selection, excludes all target Connect/Arm, and Stop suppresses late completion',async()=>{
 const f=pageFixture();await f.page.refreshSerialPorts(f.draft.targetId,f.draft.targetGeneration,selection.backend);const op=f.page.probeSerial(f.draft.targetId,f.draft.targetGeneration);assert.equal(f.called(),1);assert.equal(f.S.blocked(),true);assert.equal(f.page.serialProbeState.busy,true);const ep=new OutputEndpoint();ep.serial=SerialOutputPreferences.clone(f.draft.serial);assert.equal(f.Owner.canConnect(f.draft.model.config(f.page.outputProfile,f.draft.targetId),ep,f.draft.targetGeneration),false);f.page.armOutput(f.draft.targetId);assert.equal(f.page.outputArmed,false);f.page.stop();assert.equal(f.current(),false);f.gate.resolve(report);await op;assert.equal(f.page.serialProbeState.report,'');assert.equal(f.page.outputArmed,false);
});
for(const action of ['target','edit','background'])test(`actual Index ${action} rejects a pending probe report`,async()=>{
 const f=pageFixture();await f.page.refreshSerialPorts(f.draft.targetId,f.draft.targetGeneration,selection.backend);const op=f.page.probeSerial(f.draft.targetId,f.draft.targetGeneration);assert.equal(f.called(),1);
 if(action==='target')f.page.addOutputTarget('tcp');else if(action==='edit'){const d=f.Owner.draftSnapshot();d.serial.baudRate=9600;d.editRevision++;f.page.updateOutputDraft(d)}else{f.page.foreground=false;f.page.foregroundChanged();f.page.foreground=true;f.page.foregroundChanged()}
 assert.equal(f.current(),false);f.gate.resolve(report);await op;assert.equal(f.page.serialProbeState.report,'');assert.equal(f.page.outputArmed,false);
});

test('actual Index publishes probe busy, success report and failed-close quarantine into controlled panel props',async()=>{
 for(const success of [true,false]){const f=pageFixture();await f.page.refreshSerialPorts(f.draft.targetId,f.draft.targetGeneration,selection.backend);const op=f.page.probeSerial(f.draft.targetId,f.draft.targetGeneration);assert.equal(f.page.serialProbeState.busy,true);assert.equal(f.page.serialProbeState.closeConfirmed,false);if(success)f.gate.resolve(report);else f.gate.reject(new SerialProbeError('serialProbeCloseUnconfirmed',false));await op;assert.equal(f.page.serialProbeState.busy,false);assert.equal(f.page.serialProbeState.quarantined,!success);assert.equal(f.page.serialProbeState.closeConfirmed,success);if(success){assert.deepEqual(JSON.parse(f.page.serialProbeState.report),report);f.page.addOutputTarget('tcp');assert.equal(f.page.serialProbeState.report,'');}else assert.equal(f.page.serialProbeState.report,'');}
});
