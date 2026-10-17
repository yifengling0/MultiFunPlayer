import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {stripTypeScriptTypes,registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);}});
import {createOutputOwner} from './output-owner-helpers.mjs';import {setupIndex} from './index-controller-helpers.mjs';
const {formatTCodeValue}=await import('../entry/src/main/ets/output/TCodeEncoder.ts');
const {OutputCoordinator,OutputEndpoint}=await import('../entry/src/main/ets/output/OutputCoordinator.ts');
const {registerNativeTransport}=await import('../entry/src/main/ets/output/NativeTransportAdmission.ts');
const {SerialOutputPreferences}=await import('../entry/src/main/ets/settings/SerialOutputPreferences.ts');
const {SerialDiscoveryController}=await import('../entry/src/main/ets/output/SerialDiscoveryController.ts');
const {PlaybackSessionCore}=await import('../entry/src/main/ets/core/PlaybackSessionCore.ts');
const {FunscriptParser}=await import('../entry/src/main/ets/core/Funscript.ts');
const flush=async()=>{for(let i=0;i<60;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
function load(file,names,deps={},replacements=[]){let s=readFileSync(new URL('../entry/src/main/ets/'+file,import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/^export type .*?;\n/gm,'').replace(/^export \{.*?\} from .*?;\n/gm,'').replace(/\bexport /g,'');for(const [a,b]of replacements)s=s.replaceAll(a,b);return new Function(...Object.keys(deps),stripTypeScriptTypes(s)+`;return {${names}};`)(...Object.values(deps));}
function fixture(){
 const time={now:0,id:0,tasks:new Map(),nowMs(){return this.now},scheduleAt(at,fn){this.tasks.set(++this.id,{at,fn});return this.id},cancel(id){this.tasks.delete(id)},async advance(ms){this.now+=ms;for(const[id,t]of [...this.tasks])if(t.at<=this.now&&this.tasks.delete(id))t.fn();await flush()}};
 const calls=[],writes=[];let listed=0;let openGate=null;let listGate=null;let writePlan=null;let closeFail=false;
 const handle={portInfo:{portName:'tty-test'},async open(attrs){calls.push(['open',attrs]);if(openGate)await openGate.promise},async close(){calls.push(['close']);if(closeFail)throw Error('private close')},async setDtr(value){calls.push(['dtr',value])},async setRts(value){calls.push(['rts',value])},onDataRead(fn){this.data=fn},offDataRead(){this.data=null},onDisconnect(fn){this.detached=fn},offDisconnect(){this.detached=null},async write(bytes,timeout){calls.push(['write',timeout]);const count=writePlan===null?bytes.length:typeof writePlan==='number'?writePlan:typeof writePlan==='function'?writePlan(bytes):await writePlan.promise;if(count>0&&count<=bytes.length)writes.push(bytes.slice(0,count));return count}};
 const busSerial={DataBits:{EIGHT:8},StopBits:{ONE:1},Parity:{NONE:'none'},async getSerialPortList(){listed++;if(listGate)await listGate.promise;return[handle]}};
 const modules={OfficialSerial26Backend:load('output/serial/OfficialSerial26Backend.ets','OfficialSerial26Backend,listOfficial26Ports',{busSerial})};
 const {SerialTransport}=load('output/serial/SerialTransport.ts','SerialTransport');
 const {SerialOwnershipLease}=load('output/serial/SerialOwnershipLease.ts','SerialOwnershipLease');
 const {NativeSerialFactory}=load('output/serial/NativeSerialFactory.ets','NativeSerialFactory',{SerialTransport,SerialOwnershipLease,modules,canIUse:cap=>cap==='SystemCapability.BusManager.Serial',systemDateTime:{TimeType:{STARTUP:0},getUptime:()=>time.now},setTimeout:(fn,ms)=>time.scheduleAt(time.now+ms,fn),clearTimeout:id=>time.cancel(id)},[["await import('./OfficialSerial26Backend')","modules.OfficialSerial26Backend"]]);
 const {createNativeOutputCoordinator}=load('output/NativeOutputCoordinator.ets','createNativeOutputCoordinator',{NativeSerialFactory,SerialOutputPreferences,registerNativeTransport,OutputCoordinator,NativePlatformEnvironment:class{constructor(){return time}},NativeTransportFactory:class{inspect(){return{available:false,diagnostic:'not a network fixture'}}}});
 const engine=new PlaybackSessionCore();engine.flush=()=>{};engine.setForeground(true);engine.setConnected(true);
 const Owner=createOutputOwner(createNativeOutputCoordinator);const {page}=setupIndex({engine,outputOwner:Owner});
 Owner.restore(engine.outputConfiguration(),engine.activeRegistry().profile,engine.activeRegistry().revision);page.syncOutput();
 page.serialDiscovery=new SerialDiscoveryController(new NativeSerialFactory());
 function add(){page.addOutputTarget('serial');const id=Owner.selectedId(),d=Owner.draftSnapshot();d.serial.portName='tty-test';d.model.ranges=d.model.ranges.map(r=>({...r,enabled:r.axisId==='L0',minimum:.8,maximum:.2}));d.editRevision++;page.updateOutputDraft(d);return id}
 const id=add();
 async function connect(targetId=id){const d=Owner.draftSnapshot(targetId),e=new OutputEndpoint();e.serial=SerialOutputPreferences.clone(d.serial);return page.applyOutputConfiguration(d.model.config(page.outputProfile,targetId),e,d.targetGeneration)}
 function play(){engine.load(FunscriptParser.parse(JSON.stringify({actions:[{at:0,pos:25},{at:10000,pos:75}]})));engine.play();time.now=40;engine.tick(40,40);page.syncOutput()}
 return {time,calls,writes,handle,Owner,page,engine,id,add,connect,play,listed:()=>listed,setOpenGate(v){openGate=v},setListGate(v){listGate=v},setWritePlan(v){writePlan=v},setCloseFail(v){closeFail=v}};
}
test('actual Index → owner → factory → registry → SerialTransport → API26 mock is inert until Connect and Arm',async()=>{
 const f=fixture();assert.equal(f.listed(),0);assert.deepEqual(f.calls,[]);assert.equal(f.Owner.draftSnapshot().model.kind,'serial');
 await f.page.refreshSerialPorts(f.id,f.Owner.draftSnapshot().targetGeneration,'official26');assert.equal(f.listed(),1);assert.deepEqual(f.calls,[]);assert.equal(f.page.serialDiscoveryState.ports[0].portName,'tty-test');
 assert.ok(await f.connect()>0);assert.equal(f.listed(),3);assert.equal(f.Owner.current(f.engine).get(f.id).status().simulationOnly,false);assert.equal(f.page.outputArmed,false);assert.equal(f.writes.length,0);
 f.play();assert.equal(f.writes.length,0);f.page.armOutput(f.id);f.page.syncOutput();await f.time.advance(10);assert.equal(f.writes.length,1);
 const text=new TextDecoder().decode(f.writes[0]);assert.match(text,/^L0[0-9]{4}I10\n$/);assert.equal(text,'L0'+formatTCodeValue(.8+(.2-.8)*Math.max(0,Math.min(1,f.engine.frame().axisStates.find(a=>a.axisName==='L0').value)),4)+'I10\n');
 const count=f.writes.length;await f.time.advance(10);assert.equal(f.writes.length,count,'dirty-only retains actual write receipt');
 await f.page.disconnectOutput(f.id);assert.equal(f.page.outputConnection,'disconnected');assert.equal(f.page.outputArmed,false);assert.ok(await f.connect()>0);assert.equal(f.page.outputArmed,false);await f.page.disconnectOutput(f.id);
});
test('actual partial native receipts send each suffix exactly once, zero acceptance faults',async()=>{
 const f=fixture();await f.connect();f.play();f.setWritePlan(bytes=>Math.min(3,bytes.length));f.page.armOutput(f.id);f.page.syncOutput();await f.time.advance(10);
 // Every confirmed suffix is advanced exactly once by the real OutputSession.
 const combined=new TextDecoder().decode(Uint8Array.from(f.writes.flatMap(b=>[...b])));assert.match(combined,/^L0[0-9]{4}I10\n$/);assert.ok(f.writes.length>1);assert.equal(combined.slice(0,3),new TextDecoder().decode(f.writes[0]));assert.equal(f.page.outputArmed,true);
 await flush();f.page.syncOutput();assert.equal(f.Owner.current(f.engine).get(f.id).status().completedLocalWrites,1);assert.equal(f.Owner.current(f.engine).get(f.id).status().armed,true);await f.page.disconnectOutput(f.id);
 const z=fixture();await z.connect();z.play();z.setWritePlan(0);z.page.armOutput(z.id);z.page.syncOutput();await z.time.advance(10);z.page.syncOutput();assert.equal(z.page.outputArmed,false);assert.equal(z.writes.length,0);await z.page.disconnectOutput(z.id);
});
for(const action of ['stop','background','remove'])test(`actual async enumeration ${action} cannot open or regain application identity`,async()=>{
 const f=fixture();const gate=deferred();f.setListGate(gate);const op=f.connect();await flush();
 if(action==='stop')f.page.stop();else if(action==='background'){f.page.foreground=false;f.page.foregroundChanged();f.page.foreground=true;f.page.foregroundChanged()}else void f.page.removeOutputTarget(f.id);
 gate.resolve();assert.equal(await op,0);assert.equal(f.calls.some(c=>c[0]==='open'),false);assert.equal(f.writes.length,0);await flush();
});
test('late permission/open completion after disconnect closes the exact handle and never arms',async()=>{
 const f=fixture();const gate=deferred();f.setOpenGate(gate);const op=f.connect();await flush();assert.equal(f.calls.filter(c=>c[0]==='open').length,1);const closing=f.page.disconnectOutput(f.id);gate.resolve();assert.equal(await op,0);await closing;assert.equal(f.writes.length,0);assert.equal(f.calls.filter(c=>c[0]==='close').length,1);assert.equal(f.page.outputArmed,false);
});
test('two real serial targets cannot share/close another owner; confirmed close frees the lease',async()=>{
 const f=fixture();await f.connect();const second=f.add();assert.equal(await f.connect(second),0);assert.equal(f.calls.filter(c=>c[0]==='open').length,1);assert.equal(f.calls.filter(c=>c[0]==='close').length,0);
 await f.page.disconnectOutput(f.id);assert.ok(await f.connect(second)>0);assert.equal(f.calls.filter(c=>c[0]==='open').length,2);assert.equal(f.Owner.current(f.engine).get(second).status().armed,false);await f.page.disconnectOutput(second);
});
test('close failure survives same-target retries and prevents any second serial open',async()=>{
 const f=fixture();await f.connect();f.setCloseFail(true);await f.page.disconnectOutput(f.id);await f.page.disconnectOutput(f.id);assert.equal(f.Owner.current(f.engine).get(f.id).status().closeConfirmed,false);assert.equal(await f.connect(),0);const second=f.add();assert.equal(await f.connect(second),0);assert.equal(f.calls.filter(c=>c[0]==='open').length,1);
});

test('serial manual controls do not advertise unsupported serial shortcut targets',()=>{const f=fixture();f.page.addOutputTarget('tcp');const options=f.page.shortcutOutputOptions();assert.ok(options.some(o=>o.value.startsWith('tcp:')));assert.ok(!options.some(o=>o.value.startsWith('serial:')));});
