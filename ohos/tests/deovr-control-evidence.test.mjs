import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);}});
const {DeoVrMediaSource,isDeoVrPacketObservation}=await import('../entry/src/main/ets/media/deovr/DeoVrMediaSource.ts');
const {DeoVrControlEvidence}=await import('../entry/src/main/ets/media/deovr/DeoVrControlEvidence.ts');
const {DeoVrFrameDecoder,frameDeoVrPayload}=await import('../entry/src/main/ets/media/deovr/DeoVrProtocol.ts');
const packet=(position=1,extra={})=>({path:'fixture.mp4',currentTime:position,duration:60,playerState:0,playbackSpeed:1,...extra});
const frame=p=>frameDeoVrPayload(new TextEncoder().encode(typeof p==='string'?p:JSON.stringify(p)));
const concat=(...chunks)=>{const b=new Uint8Array(chunks.reduce((n,c)=>n+c.length,0));let at=0;for(const c of chunks){b.set(c,at);at+=c.length;}return b;};
const deferred=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return{promise,resolve,reject};};
const settle=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
const code=value=>e=>e.code===value;
function setup({opening,heartbeatIntervalMs=1000}={}){
 let now=100,task=0,sink;const timers=new Map(),sent=[],plans=[];
 const clock={nowMs:()=>now,scheduleAt(at,callback){timers.set(++task,{at,callback});return task;},cancel(id){timers.delete(id);}};
 const source=new DeoVrMediaSource({create(_e,_g,s){sink=s;return{
  connect:()=>opening?.promise??Promise.resolve(),send(bytes){sent.push(bytes.slice());const plan=plans.shift();if(plan instanceof Error)throw plan;return typeof plan==='function'?plan():plan??Promise.resolve();},detach(){},async close(){}
 };}},clock,{connectTimeoutMs:10000,sendTimeoutMs:2000,closeTimeoutMs:100,heartbeatIntervalMs,maximumQueuedCommands:64});
 const feed=(p,at=now)=>{now=at;sink.received(p instanceof Uint8Array?p:frame(p));};
 const advance=async at=>{while(true){const next=[...timers].filter(([,t])=>t.at<=at).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;timers.delete(next[0]);next[1].callback();await settle();}now=at;await settle();};
 return{source,sent,plans,feed,advance,setNow:v=>now=v,now:()=>now,timers,connect:()=>source.connect({host:'fixture.invalid',port:23554,family:1})};
}
async function opened(initial=packet(),options){const s=setup(options);await s.connect();if(initial)s.feed(initial);return s;}
function begin(s,request={kind:'play'}){
 const evidence=new DeoVrControlEvidence(7,request,s.source.snapshot(),s.now());
 s.source.subscribe(snapshot=>evidence.observe(snapshot,s.now()));
 return evidence;
}
async function dispatch(s,evidence,request={kind:'play'}){
 let boundary;const callback=b=>{boundary=b;assert.equal(evidence.bindDispatch(b,s.now()),true);};
 const receipt=await(request.kind==='speed'?s.source.changeSpeed(request.speed,callback):s.source.playPause(request.kind==='play',callback));
 assert.equal(receipt.remoteAcknowledgement,false);return boundary;
}
const state=(s,e)=>e.snapshot(s.now()).status;

test('observed framing retains header/body first-byte provenance, reset frames, and payload compatibility',()=>{
 const d=new DeoVrFrameDecoder(),b=frame(packet());
 assert.deepEqual(d.pushObserved(b.slice(0,1),{ingressId:1,receivedAtMs:10}),[]);
 assert.deepEqual(d.pushObserved(b.slice(1,7),{ingressId:2,receivedAtMs:20}),[]);
 const [first,reset,next]=d.pushObserved(concat(b.slice(7),new Uint8Array(4),b),{ingressId:3,receivedAtMs:30});
 assert.deepEqual([first.firstIngressId,first.lastIngressId,first.firstReceivedAtMs,first.receivedAtMs],[1,3,10,30]);
 assert.equal(reset.payload,null);assert.deepEqual([reset.firstIngressId,reset.lastIngressId,reset.firstReceivedAtMs,reset.receivedAtMs],[3,3,30,30]);
 assert.deepEqual([next.firstIngressId,next.lastIngressId,next.firstReceivedAtMs,next.receivedAtMs],[3,3,30,30]);
 assert.deepEqual(first.payload,b.slice(4));assert.deepEqual(new DeoVrFrameDecoder().push(b),[b.slice(4)]);
 d.pushObserved(b.slice(0,2),{ingressId:4,receivedAtMs:40});d.reset();
 assert.equal(d.pushObserved(b,{ingressId:5,receivedAtMs:50})[0].firstIngressId,5);
});

test('source exposes immutable detached canonical packet fields without changing sticky cache or receipt events',async()=>{
 const s=await opened(packet(1.00000001));const first=s.source.snapshot();
 assert.equal(first.lastObservation.positionSeconds,1);assert.equal(isDeoVrPacketObservation(first.lastObservation),true);
 assert.throws(()=>{first.lastObservation.speed=999;},TypeError);
 assert.notEqual(first.lastObservation,s.source.snapshot().lastObservation);
 s.feed({path:'fixture.mp4',currentTime:1.00000002},101);const next=s.source.snapshot();
 assert.equal(next.playerStateValid,true);assert.equal(next.speedValid,true);assert.equal(next.playerState,0);assert.equal(next.speed,1);
 assert.equal(next.lastObservation.playerState,null);assert.equal(next.lastObservation.speed,null);assert.equal(next.lastObservation.positionSeconds,1);
 assert.equal(next.lastObservation.packetSequence,2);assert.equal(next.receiptSequence,2);
 const copied={...next.lastObservation};assert.equal(isDeoVrPacketObservation(copied),false);
 s.setNow(999);for(let i=0;i<20;i++)assert.deepEqual(s.source.snapshot(),next);
 await s.source.disconnect();
});

test('opening fragments retain original ingress IDs and times after delayed connection',async()=>{
 const opening=deferred(),s=setup({opening});const connected=s.connect(),b=frame(packet());
 s.feed(b.slice(0,2),110);s.feed(b.slice(2,8),120);s.feed(b.slice(8),130);s.setNow(200);opening.resolve();await connected;
 const observation=s.source.snapshot().lastObservation;
 assert.deepEqual([observation.firstIngressId,observation.lastIngressId,observation.firstReceivedAtMs,observation.receivedAtMs],[1,3,110,130]);
 assert.equal(s.source.snapshot().observedAtMs,130);await s.source.disconnect();
});

for(const [name,request,initial,first,second] of [
 ['Play',{kind:'play'},packet(1,{playerState:1}),packet(1.01),packet(1.02)],
 ['Pause',{kind:'pause'},packet(),packet(1.01,{playerState:1}),packet(1.01,{playerState:1})],
 ['playing Speed',{kind:'speed',speed:2},packet(),packet(1.01,{playbackSpeed:2}),packet(1.02,{playbackSpeed:2})],
 ['paused Speed',{kind:'speed',speed:2},packet(1,{playerState:1}),packet(1,{playerState:1,playbackSpeed:2}),packet(1,{playerState:1,playbackSpeed:2})],
 ['same Speed',{kind:'speed',speed:1},packet(),packet(1.01),packet(1.02)]
])test(`${name} requires two genuinely subsequent observations; no minimum player cadence is invented`,async()=>{
 const s=await opened(initial),e=begin(s,request),boundary=await dispatch(s,e,request);
 assert.equal(boundary.packetSequenceFloor,1);assert.equal(boundary.ingressSequenceFloor,1);assert.equal(state(s,e),'pending');
 s.feed(first,101);assert.equal(state(s,e),'pending');for(let i=0;i<30;i++){e.observe(s.source.snapshot(),101);assert.equal(state(s,e),'pending');}
 s.feed(second,102);assert.equal(state(s,e),'observed');assert.equal(e.snapshot(102).packetSequence,3);assert.equal(e.snapshot(102).observedAtMs,102);
 assert.equal(e.snapshot(102).commandId,boundary.commandId);assert.equal(e.snapshot(102).deadlineMs,5100);await s.source.disconnect();assert.equal(state(s,e),'cancelled');
});

test('dispatch callback is at real send invocation, before completion and after a queued write',async()=>{
 const s=await opened(),wait=deferred();s.plans.push(wait.promise);const previous=s.source.seek(2),e=begin(s);let boundary;
 const pending=s.source.playPause(true,b=>{boundary=b;assert.equal(s.sent.length,1);assert.ok(Object.isFrozen(b));assert.equal(e.bindDispatch(b,s.now()),true);});
 s.feed(packet(1.1),110);s.feed(packet(1.2),120);assert.equal(boundary,undefined);assert.equal(state(s,e),'pending');
 s.setNow(130);wait.resolve();await previous;await pending;assert.equal(boundary.startedAtMs,130);assert.equal(boundary.packetSequenceFloor,3);assert.equal(boundary.ingressSequenceFloor,3);
 s.feed(packet(1.3),131);assert.equal(state(s,e),'pending');s.feed(packet(1.4),132);assert.equal(state(s,e),'observed');await s.source.disconnect();
});

test('false dispatch callback cancels only the queued command, revokes its boundary, and preserves the live source',async()=>{
 const s=await opened(packet(),{heartbeatIntervalMs:100}),wait=deferred();s.plans.push(wait.promise);await s.advance(200);
 assert.deepEqual(s.sent[0],new Uint8Array(4));const request={kind:'speed',speed:1},e=begin(s,request);let boundary;
 const pending=s.source.changeSpeed(1,b=>{boundary=b;assert.equal(e.bindDispatch(b,s.now()),true);return false;});
 const rejected=assert.rejects(pending,code('cancelled'));
 s.feed(packet(1.1),210);assert.equal(boundary,undefined);s.setNow(220);wait.resolve();await rejected;
 assert.equal(s.sent.length,1);assert.equal(s.source.snapshot().status,'connected');assert.equal(s.source.snapshot().diagnostic,null);
 assert.equal(state(s,e),'cancelled');s.feed(packet(1.2),221);s.feed(packet(1.3),222);assert.equal(state(s,e),'cancelled');
 const later=begin(s,request);assert.equal(later.bindDispatch(boundary,222),false);
 await s.source.changeSpeed(2,()=>true);assert.equal(s.sent.length,2);assert.equal(s.source.snapshot().status,'connected');await s.source.disconnect();
});

test('matching queued heartbeat command gets boundary only after heartbeat settles',async()=>{
 const s=await opened(packet(),{heartbeatIntervalMs:100}),wait=deferred();s.plans.push(wait.promise);await s.advance(200);
 const request={kind:'speed',speed:1},e=begin(s,request);let boundary;
 const pending=s.source.changeSpeed(1,b=>{boundary=b;assert.equal(e.bindDispatch(b,s.now()),true);});
 s.feed(packet(1.1),210);assert.equal(boundary,undefined);s.setNow(220);wait.resolve();await pending;
 assert.equal(boundary.startedAtMs,220);assert.equal(boundary.packetSequenceFloor,2);assert.equal(boundary.ingressSequenceFloor,2);
 s.feed(packet(1.2),221);s.feed(packet(1.3),222);assert.equal(state(s,e),'observed');await s.source.disconnect();
});

test('synchronous dispatch cancellation prevents transport.send even after callback ran',async()=>{
 const s=await opened();let closing,called=0;
 await assert.rejects(s.source.playPause(false,()=>{called++;closing=s.source.disconnect();}),code('cancelled'));
 await closing;assert.equal(called,1);assert.equal(s.sent.length,0);assert.equal(s.source.snapshot().status,'disconnected');
});

test('dispatch callback resource replacement rejects only stale command and keeps B connected',async()=>{
 const s=await opened();await assert.rejects(s.source.playPause(false,()=>s.feed(packet(2,{path:'B.mp4'}),101)),code('staleResource'));
 assert.equal(s.sent.length,0);assert.equal(s.source.snapshot().status,'connected');await s.source.playPause(true);assert.equal(s.sent.length,1);await s.source.disconnect();
});

test('all resource-A queued controls are rejected without sending or faulting resource B',async()=>{
 const s=await opened(),wait=deferred();s.plans.push(wait.promise);const active=s.source.playPause(true);
 const commands=[s.source.playPause(false),s.source.changeSpeed(2),s.source.seek(4),s.source.changePath('another.mp4')];
 const checks=commands.map(p=>assert.rejects(p,code('staleResource')));
 s.feed(packet(2,{path:'B.mp4'}),110);let boundary;const current=s.source.changeSpeed(1,b=>{boundary=b;});
 wait.resolve();await active;await Promise.all(checks);await current;
 assert.equal(s.sent.length,2);assert.equal(boundary.resourceRevision,2);assert.equal(s.source.snapshot().status,'connected');await s.source.disconnect();
});

for(const split of [1,3,7,-1])test(`known pre-dispatch fragmented frame cannot establish evidence (split ${split})`,async()=>{
 const s=await opened(),e=begin(s),bytes=frame(packet(1.1)),at=split<0?bytes.length-1:split;
 s.feed(bytes.slice(0,at),101);await dispatch(s,e);s.feed(bytes.slice(at),102);
 assert.equal(s.source.snapshot().lastObservation.firstReceivedAtMs,101);assert.equal(state(s,e),'pending');
 s.feed(packet(1.2),103);assert.equal(state(s,e),'pending');s.feed(packet(1.3),104);assert.equal(state(s,e),'observed');await s.source.disconnect();
});

test('post-boundary fragments can form two packets with distinct completion ingress and increasing time',async()=>{
 const s=await opened(),e=begin(s);await dispatch(s,e);const first=frame(packet(1.1)),second=frame(packet(1.2));
 s.feed(first.slice(0,2),101);s.feed(concat(first.slice(2),second.slice(0,7)),102);assert.equal(state(s,e),'pending');
 s.feed(second.slice(7),103);assert.equal(state(s,e),'observed');await s.source.disconnect();
});

test('coalesced frames and equal timestamps cannot supply the pair',async()=>{
 const s=await opened(),e=begin(s);await dispatch(s,e);
 s.feed(concat(frame(packet(1.1)),frame(packet(1.2))),101);assert.equal(state(s,e),'pending');
 s.feed(packet(1.3),101);assert.equal(state(s,e),'pending');s.feed(packet(1.4),102);assert.equal(state(s,e),'observed');await s.source.disconnect();
});

test('later coalesced frames are ineligible when dispatch occurs reentrantly in the first frame listener',async()=>{
 const s=await opened();let e,pending,entered=false;
 s.source.subscribe(snapshot=>{if(entered||snapshot.lastObservation?.packetSequence!==2)return;entered=true;e=begin(s);pending=s.source.playPause(true,b=>e.bindDispatch(b,s.now()));});
 s.feed(concat(frame(packet(1.1)),frame(packet(1.2)),frame(packet(1.3))),101);await pending;
 assert.equal(state(s,e),'pending');s.feed(packet(1.4),102);assert.equal(state(s,e),'pending');s.feed(packet(1.5),103);assert.equal(state(s,e),'observed');await s.source.disconnect();
});

for(const extra of [{playerState:undefined},{currentTime:undefined}])test(`missing raw fields cannot complete a Play pair: ${JSON.stringify(extra)}`,async()=>{
 const s=await opened(),e=begin(s);await dispatch(s,e);s.feed(packet(1.1),101);s.feed(packet(1.2,extra),102);assert.equal(state(s,e),'pending');
 s.feed(packet(1.3),103);assert.equal(state(s,e),'pending');s.feed(packet(1.4),104);assert.equal(state(s,e),'observed');await s.source.disconnect();
});

for(const extra of [{playbackSpeed:undefined},{playbackSpeed:1},{playbackSpeed:2.0000000001},{playerState:1}])test(`Speed uses same-packet exact state and speed: ${JSON.stringify(extra)}`,async()=>{
 const request={kind:'speed',speed:2},s=await opened(),e=begin(s,request);await dispatch(s,e,request);
 s.feed(packet(1.1,{playbackSpeed:2}),101);s.feed(packet(1.2,{playbackSpeed:2,...extra}),102);assert.equal(state(s,e),'pending');
 s.feed(packet(1.3,{playbackSpeed:2}),103);assert.equal(state(s,e),'pending');s.feed(packet(1.4,{playbackSpeed:2}),104);assert.equal(state(s,e),'observed');await s.source.disconnect();
});

test('canonical sub-100ns increases do not establish playing progress',async()=>{
 const s=await opened(packet(1.00000001)),e=begin(s);await dispatch(s,e);
 s.feed(packet(1.00000002),101);s.feed(packet(1.00000003),102);assert.equal(state(s,e),'pending');
 s.feed(packet(1.0000002),103);assert.equal(state(s,e),'observed');await s.source.disconnect();
});

test('Pause stability compares canonical positions, while changed paused positions restart the pair',async()=>{
 const request={kind:'pause'},s=await opened(),e=begin(s,request);await dispatch(s,e,request);
 s.feed(packet(1.01,{playerState:1}),101);s.feed(packet(1.02,{playerState:1}),102);assert.equal(state(s,e),'pending');
 s.feed(packet(1.02000001,{playerState:1}),103);assert.equal(state(s,e),'observed');await s.source.disconnect();
});

test('contradictory or missing later packet withdraws an observed candidate before frame publication',async()=>{
 const s=await opened(),e=begin(s);await dispatch(s,e);s.feed(packet(1.1),101);s.feed(packet(1.2),102);assert.equal(state(s,e),'observed');
 s.feed({path:'fixture.mp4',currentTime:1.3},103);assert.equal(state(s,e),'pending');assert.equal(e.snapshot(103).packetSequence,-1);
 s.feed(packet(1.4),104);assert.equal(state(s,e),'pending');s.feed(packet(1.5),105);assert.equal(state(s,e),'observed');await s.source.disconnect();
});

for(const fault of ['backward','malformed','reset','path','error','state2','state-1'])test(`${fault} permanently revokes evidence; later matching samples cannot resurrect it`,async()=>{
 const s=await opened(),e=begin(s);await dispatch(s,e);s.feed(packet(1.1),101);
 if(fault==='backward')s.feed(packet(0.9),102);
 else if(fault==='malformed')s.feed(frame('{'),102);
 else if(fault==='reset')s.feed(new Uint8Array(4),102);
 else if(fault==='path')s.feed(packet(1.2,{path:'new.mp4'}),102);
  else if(fault==='state2'||fault==='state-1')s.feed(packet(1.2,{playerState:fault==='state2'?2:-1}),102);
 else{await s.source.disconnect();}
 assert.equal(state(s,e),'cancelled');s.feed(packet(1.3),103);s.feed(packet(1.4),104);assert.equal(state(s,e),'cancelled');await s.source.disconnect();
});

test('observation timeout and canonical playing stall expire without timer/UI ticks and cannot be renewed late',async()=>{
 const s=await opened(),e=begin(s);await dispatch(s,e);s.feed(packet(1.1),101);s.feed(packet(1.2),102);assert.equal(state(s,e),'observed');
 s.setNow(853);assert.equal(state(s,e),'cancelled');s.feed(packet(2),854);s.feed(packet(3),855);assert.equal(state(s,e),'cancelled');await s.source.disconnect();
 const next=await opened(),stall=begin(next);await dispatch(next,stall);
 next.feed(packet(1),400);next.feed(packet(1),800);next.setNow(851);assert.equal(state(next,stall),'cancelled');await next.source.disconnect();
});

test('five-second deadline cannot be extended by new packets, queued dispatch, or reads',async()=>{
 const request={kind:'pause'},s=await opened(),e=begin(s,request);await dispatch(s,e,request);
 for(let at=500;at<=5000;at+=500){s.feed(packet(1+at/1000),at);assert.equal(state(s,e),'pending');}
 s.setNow(5100);assert.equal(state(s,e),'cancelled');s.feed(packet(7,{playerState:1}),5101);s.feed(packet(7,{playerState:1}),5102);assert.equal(state(s,e),'cancelled');await s.source.disconnect();
});

test('invalid clocks and stale initial fields never create an eligible transaction',async()=>{
 const s=await opened();for(const now of [NaN,Infinity,-1,851])assert.equal(new DeoVrControlEvidence(1,{kind:'play'},s.source.snapshot(),now).snapshot(now).status,'cancelled');
 for(const request of [{kind:'speed',speed:0},{kind:'speed',speed:Infinity},{kind:'speed',speed:1001},{kind:'speed'}, {kind:'other'}])assert.equal(new DeoVrControlEvidence(1,request,s.source.snapshot(),100).snapshot(100).status,'cancelled');
 for(const changes of [{status:'fault'},{quarantined:true},{durationValid:false},{durationSeconds:0},{currentTimeValid:false},{playerStateValid:false},{lastObservation:null},{positionSeconds:2}])assert.equal(new DeoVrControlEvidence(1,{kind:'play'},{...s.source.snapshot(),...changes},100).snapshot(100).status,'cancelled');
 const e=begin(s);await dispatch(s,e);assert.equal(e.snapshot(99).status,'cancelled');await s.source.disconnect();
});

test('fabricated and cross-source observations or dispatch boundaries cannot qualify despite identical numeric IDs',async()=>{
 const a=await opened(),b=await opened();const initial=a.source.snapshot();
 const forged=new DeoVrControlEvidence(1,{kind:'play'},{...initial,lastObservation:{...initial.lastObservation}},100);assert.equal(forged.snapshot(100).status,'cancelled');
 const e=begin(a);let boundary;await a.source.playPause(true,value=>{boundary=value;});assert.equal(e.bindDispatch({...boundary},100),false);
 const cross=new DeoVrControlEvidence(2,{kind:'play'},initial,100);await b.source.playPause(true,value=>{assert.equal(cross.bindDispatch(value,100),false);});
 const crossed=begin(a);await dispatch(a,crossed);b.feed(packet(1.1),101);crossed.observe(b.source.snapshot(),101);assert.equal(crossed.snapshot(101).status,'cancelled');
 await a.source.disconnect();await b.source.disconnect();
});

test('source-owned dispatch also binds the actual requested command kind and speed value',async()=>{
 for(const [request,invoke] of [[{kind:'play'},(s,cb)=>s.playPause(false,cb)],[{kind:'speed',speed:2},(s,cb)=>s.changeSpeed(1,cb)],[{kind:'pause'},(s,cb)=>s.changeSpeed(1,cb)]]){
  const s=await opened(),e=begin(s,request);await invoke(s.source,b=>assert.equal(e.bindDispatch(b,s.now()),false));assert.equal(state(s,e),'cancelled');await s.source.disconnect();
 }
});

test('send completion never observes control; a genuine transport failure cancels it through source health',async()=>{
 const s=await opened(),e=begin(s);await dispatch(s,e);assert.equal(state(s,e),'pending');assert.equal(s.source.snapshot().lastObservation.packetSequence,1);
 const wait=deferred();s.plans.push(wait.promise);const failure=s.source.playPause(true,b=>{}),rejected=assert.rejects(failure,code('sendFailed'));
 wait.reject(new Error('fixture transport failure'));await rejected;assert.equal(state(s,e),'cancelled');await settle();
});

test('locally subsequent delayed server samples remain only compatible observations, never causal ACK evidence',async()=>{
 const s=await opened(packet(1,{playerState:1})),e=begin(s);await dispatch(s,e);
 // These bytes could have been sampled by the server before our command; the
 // protocol has no server timestamps with which to distinguish that fact.
 s.feed(packet(1.1),101);s.feed(packet(1.2),102);const proof=e.snapshot(102);
 assert.equal(proof.status,'observed');assert.equal('remoteAcknowledgement' in proof,false);assert.equal('confirmed' in proof,false);assert.equal('armed' in proof,false);await s.source.disconnect();
});
