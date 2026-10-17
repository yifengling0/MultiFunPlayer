import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);}});
const {SerialOutputPreferences}=await import('../entry/src/main/ets/settings/SerialOutputPreferences.ts');
const {OutputConfiguration,SavedOutputTarget}=await import('../entry/src/main/ets/settings/OutputConfiguration.ts');
const {OutputSettingsDraft}=await import('../entry/src/main/ets/output/OutputSettingsModel.ts');
const target=()=>new SavedOutputTarget('serial',0);
test('original 115200/8N1/no-handshake and true control lines preserved, OS-control null explicit',()=>{
 const t=target();assert.equal(t.id,'serial:0');assert.deepEqual({...t.serial},{backend:'official26',portName:'',baudRate:115200,dataBits:8,stopBits:1,parity:'none',handshake:'none',dtr:true,rts:true});
 t.serial.backend='official19';t.serial.dtr=null;t.serial.rts=null;assert.deepEqual(OutputConfiguration.cloneTarget(t),t);
});
test('all backend hints can persist without granting unsupported capability or connection',()=>{
 for(const backend of ['official26','official19','ch34xWriteOnly','usbCdc']){
  const t=target();t.serial.backend=backend;t.serial.portName='/dev/ttyS0';
  const copy=OutputConfiguration.cloneTarget(t);assert.equal(copy.serial.backend,backend);assert.notEqual(copy.serial,t.serial);
  copy.serial.portName='other';assert.equal(t.serial.portName,'/dev/ttyS0');
  assert.doesNotMatch(JSON.stringify(copy),/portId|connected|armed|permission|handle|enumeration/);
 }
});
test('old network snapshots lacking additive serial field roundtrip with inert null',()=>{
 for(const kind of ['tcp','udp','webSocket']){const t=new SavedOutputTarget(kind,0);delete t.serial;assert.equal(OutputConfiguration.cloneTarget(t).serial,null);}
 const t=target();delete t.serial;assert.throws(()=>OutputConfiguration.cloneTarget(t));
 const network=new SavedOutputTarget();network.serial=new SerialOutputPreferences();assert.throws(()=>OutputConfiguration.cloneTarget(network));
});
test('forty target slots, ten per kind, distinct ids and selected serial are bounded',()=>{
 const cfg=new OutputConfiguration();cfg.targets=['tcp','udp','webSocket','serial'].flatMap(k=>Array.from({length:10},(_,i)=>new SavedOutputTarget(k,i)));cfg.selectedTargetId='serial:9';
 assert.equal(OutputConfiguration.clone(cfg).targets.length,40);cfg.targets.push(target());assert.throws(()=>OutputConfiguration.clone(cfg));
});
test('serial schema rejects extra identity, capability, secret, malformed values and unsupported settings',()=>{
 const bad=[];for(const field of ['portId','permission','connected','armed','token','password','runtimeId','capability'])bad.push(p=>p[field]=1);
 for(const backend of ['ch343','auto','unknown','',null])bad.push(p=>p.backend=backend);
 for(const baud of [0,-1,4000001,1.5,NaN,Infinity,'115200',null])bad.push(p=>p.baudRate=baud);
 for(const name of ['x'.repeat(1025),'a\n','a\0','a\u0085',3,null])bad.push(p=>p.portName=name);
 for(const [field,values] of [['dataBits',[7,'8',9]],['stopBits',[2,'1']],['parity',['even','odd']],['handshake',['hardware']],['dtr',[1,'true',undefined]],['rts',[1,'false',undefined]]])for(const value of values)bad.push(p=>p[field]=value);
 for(const mutate of bad){const t=target();mutate(t.serial);assert.throws(()=>OutputConfiguration.cloneTarget(t));}
});
test('target drafts deeply detach serial edits and never add a native identity',()=>{
 const d=new OutputSettingsDraft();d.model.setKind('serial');d.serial.backend='ch34xWriteOnly';d.serial.portName='usb-current-path';
 const copy=OutputSettingsDraft.copy(d);copy.serial.baudRate=9600;assert.equal(d.serial.baudRate,115200);assert.equal(copy.model.kind,'serial');
 assert.equal(copy.model.config({precision:4,revision:1,axisOrder:[],maximumDurationMs:10000,maximumPayloadBytes:1024}).autoConnectPolicy,'manual');
});
