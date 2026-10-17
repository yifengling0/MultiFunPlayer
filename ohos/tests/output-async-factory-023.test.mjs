import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);}});
const {OutputCoordinator,OutputEndpoint}=await import('../entry/src/main/ets/output/OutputCoordinator.ts');
const {MemoryTransport}=await import('../entry/src/main/ets/output/MemoryTransport.ts');
const {OutputSettingsModel}=await import('../entry/src/main/ets/output/OutputSettingsModel.ts');
const profile={precision:4,revision:1,axisOrder:['L0'],maximumDurationMs:10000,maximumPayloadBytes:1024};
const policy={maximumFrameAgeMs:200,maximumClockAgeMs:200,maximumEventAgeMs:100,maximumFixedElapsedMs:1000,writeTimeoutMs:100,maximumPolledQueueLength:4,allowZeroInterval:true};
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function fixture(){
 const time={nowMs(){return 0},scheduleAt(){return 1},cancel(){}};
 const source={value:{frame:{sequence:1,epoch:1,profileRevision:1,monotonicMs:0,mediaPositionMs:0,axisStates:[{axisName:'L0',value:.5}],events:[]},authorization:null,mediaState:'stopped',foreground:true,faulted:false},dispatchSource(){return this.value}};
 let resolve; let reject; const seen=[]; const port=new MemoryTransport(time);
 const factory={inspect(){return {available:true,diagnostic:''}},create(c,e){seen.push({c,e});return new Promise((a,b)=>{resolve=a;reject=b})}};
 const model=new OutputSettingsModel();model.ranges=[{axisId:'L0',minimum:0,maximum:1,enabled:true}];
 const config={...model.config({...profile,axisOrder:profile.axisOrder.slice()},'memory:0'),kind:'memory'}; const endpoint=new OutputEndpoint();endpoint.host='localhost';endpoint.port=1234;
 const coordinator=new OutputCoordinator(factory,source,policy,time,time);
 return {coordinator,source,config,endpoint,port,seen,resolve(){resolve(port)},reject(){reject(Error('private error'))}};
}
test('async creation is inert and successful explicit connect never arms',async()=>{
 const f=fixture();const op=f.coordinator.connect(f.config,f.endpoint);assert.equal(f.coordinator.isBusy(),true);
 assert.equal(f.port.openRecords().length,0);f.resolve();assert.equal(await op,true);
 assert.equal(f.port.openRecords().length,1);assert.equal(f.coordinator.status().armed,false);assert.equal(f.port.writeRecords().length,0);
 await f.coordinator.dispose();
});
for(const action of ['stop','disarm','disconnect','dispose','background','sourceBackground'])test(`${action} while factory awaits rejects late candidate without open`,async()=>{
 const f=fixture();const op=f.coordinator.connect(f.config,f.endpoint);assert.equal(f.port.openRecords().length,0);
 if(action==='background'){f.coordinator.setForeground(false);f.coordinator.setForeground(true)}
 else if(action==='sourceBackground')f.source.value.foreground=false;
 else await f.coordinator[action]();
 f.resolve();assert.equal(await op,false);assert.deepEqual(f.port.openRecords(),[]);assert.equal(f.coordinator.status(),null);assert.equal(f.coordinator.arm(),false);assert.equal(f.coordinator.isBusy(),false);
 await f.coordinator.dispose();
});
test('pending factory snapshots config and endpoint against caller mutation',async()=>{
 const f=fixture();const op=f.coordinator.connect(f.config,f.endpoint);
 f.config.axisRanges[0].minimum=.9;f.config.protocolProfile.axisOrder.push('R0');f.endpoint.host='other';f.endpoint.port=9999;
 assert.equal(f.seen[0].c.axisRanges[0].minimum,0);assert.deepEqual(f.seen[0].c.protocolProfile.axisOrder,['L0']);assert.equal(f.seen[0].e.host,'localhost');assert.equal(f.seen[0].e.port,1234);
 f.resolve();assert.equal(await op,true);assert.equal(f.coordinator.configuration().axisRanges[0].minimum,0);assert.deepEqual(f.coordinator.configuration().protocolProfile.axisOrder,['L0']);await f.coordinator.dispose();
});
test('factory rejection and repeated connect do not leak status or native errors',async()=>{
 const f=fixture();const op=f.coordinator.connect(f.config,f.endpoint);assert.equal(await f.coordinator.connect(f.config,f.endpoint),false);
 f.reject();assert.equal(await op,false);assert.equal(f.coordinator.isBusy(),false);assert.equal(f.coordinator.status(),null);assert.doesNotMatch(f.coordinator.message(),/private error/);
 const next=f.coordinator.connect(f.config,f.endpoint);f.resolve();assert.equal(await next,true);assert.equal(f.coordinator.status().armed,false);await f.coordinator.dispose();
});
test('shortcut cancellation owns an in-progress async factory and cannot resurrect it',async()=>{
 const f=fixture();const owned=f.coordinator.connectOwned(f.config,f.endpoint);f.coordinator.cancelOwnedConnection(owned.requestId);f.resolve();
 assert.equal(await owned.completion,false);assert.equal(f.port.openRecords().length,0);assert.equal(f.coordinator.status(),null);await settle();
});
