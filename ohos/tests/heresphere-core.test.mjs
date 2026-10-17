import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);}});
const {HereSphereMediaSource}=await import('../entry/src/main/ets/media/heresphere/HereSphereMediaSource.ts');
const {validateDeoVrEndpoint}=await import('../entry/src/main/ets/media/deovr/DeoVrTypes.ts');
const {DeoVrFrameDecoder,encodeDeoVrCommand,decodeDeoVrUtf8,encodeDeoVrUtf8,frameDeoVrPayload}=await import('../entry/src/main/ets/media/deovr/DeoVrProtocol.ts');
const {decodeHereSpherePacket:decodeDeoVrPacket,hereSphereSceneUri}=await import('../entry/src/main/ets/media/heresphere/HereSphereProtocol.ts');
const endpoint={host:'127.0.0.1',port:23554,family:1};
const options={connectTimeoutMs:100,sendTimeoutMs:50,closeTimeoutMs:30,heartbeatIntervalMs:1000,maximumQueuedCommands:4};
const settle=async()=>{for(let n=0;n<40;n++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const code=expected=>error=>error.code===expected;
const json=value=>frameDeoVrPayload(new TextEncoder().encode(typeof value==='string'?value:JSON.stringify(value)));
const sample=(extra={})=>({resource:extra.path??'clip.mp4',playerState:0,duration:60,currentTime:2.5,playbackSpeed:1,...extra});
const concat=(...chunks)=>{const result=new Uint8Array(chunks.reduce((n,b)=>n+b.length,0));let at=0;for(const b of chunks){result.set(b,at);at+=b.length;}return result;};
class Clock{
  now=0; next=1; tasks=new Map();
  nowMs(){return this.now;}
  scheduleAt(at,callback){const handle=this.next++;this.tasks.set(handle,{at,callback});return handle;}
  cancel(handle){this.tasks.delete(handle);}
  async advanceTo(target){for(;;){const next=[...this.tasks].filter(([,t])=>t.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;this.now=next[1].at;this.tasks.delete(next[0]);next[1].callback();await settle();}this.now=target;await settle();}
}
class Transport{
  constructor(sink){this.sink=sink;this.calls=[];this.sent=[];this.plans=new Map();}
  plan(method,value){if(!this.plans.has(method))this.plans.set(method,[]);this.plans.get(method).push(value);}
  invoke(method){this.calls.push(method);const next=this.plans.get(method)?.shift();if(next instanceof Error)throw next;if(typeof next==='function')return next();return next??Promise.resolve();}
  connect(){return this.invoke('connect');}send(bytes){this.sent.push(bytes.slice());return this.invoke('send');}close(){return this.invoke('close');}detach(){this.invoke('detach');}
  receive(value){this.sink.received(value instanceof Uint8Array?value:json(value));}
}
class Factory{
  entries=[];plans=[];
  create(endpoint,generation,sink){const transport=new Transport(sink);this.plans.shift()?.(transport);this.entries.push({endpoint,generation,transport});return transport;}
}
function setup(){const clock=new Clock(),factory=new Factory(),source=new HereSphereMediaSource(factory,clock,options),events=[],snapshots=[];source.subscribe((s,e)=>{snapshots.push(s);events.push(...e);});return{clock,factory,source,events,snapshots};}
async function opened(){const s=setup();await s.source.connect(endpoint);s.transport=s.factory.entries[0].transport;return s;}
const eventText=e=>e.kind==='path'?`path:${e.path}`:e.kind==='playing'?`playing:${e.playing}`:e.kind==='reset'?'reset':`${e.kind}:${e.value}`;

test('endpoint restore/constructor/subscription/snapshot are inert and detached',async()=>{
  const s=setup();assert.equal(s.factory.entries.length,0);assert.equal(s.clock.tasks.size,0);assert.equal(s.source.snapshot().status,'disconnected');
  await assert.rejects(s.source.seek(1),code('notConnected'));assert.equal(s.factory.entries.length,0);
  const ep={...endpoint};await s.source.connect(ep);ep.host='attacker.example';const snap=s.source.snapshot();snap.endpoint.host='evil.example';snap.path='forged';assert.equal(s.source.snapshot().endpoint.host,'127.0.0.1');assert.equal(s.source.snapshot().path,null);assert.equal(s.factory.entries[0].transport.sent.length,0);
  await s.source.disconnect();assert.equal(s.clock.tasks.size,0);
});
test('strict endpoint validation rejects malformed, credential-bearing and path values before factory creation',async()=>{
  for(const host of ['','tcp://host','user:pass@host','a..b','-a.example','a-.example','999.1.1.1','01.2.3.4','1.2.3','::::','1:2:3','1:2:3:4:5:6:7:8:9','[::1]','fe80::1%en0','a/b','a?token=x','a#fragment','a'.repeat(64)+'.com']){const s=setup();await assert.rejects(s.source.connect({...endpoint,host,family:host.includes(':')?2:1}));assert.equal(s.factory.entries.length,0,host);}
  for(const host of ['127.0.0.1','receiver.example','localhost','::1','2001:db8::8a2e:370:7334','::ffff:192.0.2.1','1:2:3:4:5:6:7:8'])assert.equal(validateDeoVrEndpoint({...endpoint,host,family:host.includes(':')?2:1}).host,host);
});
test('source preserves C# event order and repeated equal sample receipt without invented changes',async()=>{
  const s=await opened();s.clock.now=10;s.transport.receive(sample());assert.deepEqual(s.events.map(eventText),['path:clip.mp4','playing:true','duration:60','position:2.5','speed:1']);
  const first=s.source.snapshot();s.clock.now=20;s.transport.receive(sample());const second=s.source.snapshot();assert.equal(second.receiptSequence,2);assert.equal(second.eventSequence,first.eventSequence);assert.equal(second.observedAtMs,20);assert.equal(second.lastChangedAtMs,10);assert.equal(second.lastReceivedAtMs,20);assert.equal(second.positionSeconds,2.5);
  s.clock.now=20000;for(let i=0;i<5;i++)assert.deepEqual(s.source.snapshot(),second);await s.source.disconnect();
});
test('path change retains original field equality cache but resets per-resource proof',async()=>{
  const s=await opened();s.clock.now=10;s.transport.receive(sample());s.events.length=0;s.clock.now=20;s.transport.receive({path:'next.mp4'});
  let state=s.source.snapshot();assert.deepEqual(s.events.map(eventText),['path:next.mp4']);assert.equal(state.durationSeconds,60);assert.equal(state.playerState,0);assert.equal(state.positionSeconds,2.5);assert.equal(state.durationValid,false);assert.equal(state.playerStateValid,false);assert.equal(state.speedValid,false);assert.equal(state.currentTimeValid,false);assert.equal(state.observedAtMs,-1);assert.equal(state.lastChangedAtMs,-1);
  s.clock.now=30;s.transport.receive(sample({path:'next.mp4'}));state=s.source.snapshot();assert.deepEqual(s.events.map(eventText),['path:next.mp4']);assert.equal(state.receiptSequence,2);assert.equal(state.observedAtMs,30);assert.equal(state.lastChangedAtMs,-1);assert.equal(state.durationValid,true);assert.equal(state.playerStateValid,true);assert.equal(state.speedValid,true);await s.source.disconnect();
});
test('all nonzero int32 playerState values map to paused while changed integer states publish',async()=>{
  const s=await opened();for(const n of [0,1,2,-1,2147483647,-2147483648])s.transport.receive(sample({playerState:n}));assert.deepEqual(s.events.filter(e=>e.kind==='playing').map(e=>e.playing),[true,false,false,false,false,false]);await s.source.disconnect();
});
test('partial length/body and coalesced frames preserve frames and observation order',async()=>{
  const input=concat(json(sample()),json(sample({currentTime:4})),new Uint8Array(4),json(sample({path:'重😀.mp4'})));
  for(const size of [1,2,3,4,7,input.length]){const s=await opened();for(let at=0;at<input.length;at+=size)s.transport.receive(input.subarray(at,at+size));assert.deepEqual(s.events.map(eventText),['path:clip.mp4','playing:true','duration:60','position:2.5','speed:1','position:4','reset','path:重😀.mp4','playing:true','duration:60','position:2.5','speed:1']);await s.source.disconnect();}
});
test('heartbeat/nonpositive lengths reset once, malformed JSON allocates original reader reset state',async()=>{
  const s=await opened();s.transport.receive(new Uint8Array(4));assert.equal(s.events.length,0);s.transport.receive(json('{'));assert.equal(s.events.length,0);s.transport.receive(new Uint8Array([255,255,255,255]));assert.deepEqual(s.events.map(eventText),['reset']);s.transport.receive(new Uint8Array(4));assert.equal(s.events.length,1);
  s.transport.receive(sample());s.transport.receive({currentTime:9});assert.equal(s.events.at(-1).kind,'reset');assert.equal(s.source.snapshot().path,null);assert.equal(s.source.snapshot().observedAtMs,-1);await s.source.disconnect();
});
test('missing path exact case and whitespace reset before optional fields',async()=>{
  for(const packet of [{Path:'clip.mp4',currentTime:7},{path:'   ',currentTime:7},{path:null,currentTime:7}]){const s=await opened();s.transport.receive(sample());const receipt=s.source.snapshot().receiptSequence;s.transport.receive(packet);assert.equal(s.events.at(-1).kind,'reset');assert.equal(s.source.snapshot().receiptSequence,receipt);await s.source.disconnect();}
});
test('malformed/unsafe/nonfinite JSON cannot renew real observation or publish fields',async()=>{
  for(const text of ['{','[]','null','{"path":"clip.mp4","currentTime":1e999}','{"path":"clip.mp4","currentTime":7,"__proto__":{"x":1}}','{"path":"clip.mp4","currentTime":7,"nested":{"constructor":1}}','{"path":"clip.mp4","currentTime":7,"x":"\\ud800"}','{"path":"clip.mp4","x":'+ '['.repeat(18)+'0'+']'.repeat(18)+'}']){
    const s=await opened();s.clock.now=10;s.transport.receive(sample());const before=s.source.snapshot();s.clock.now=20;s.transport.receive(json(text));const after=s.source.snapshot();assert.equal(after.observedAtMs,10,text);assert.equal(after.receiptSequence,1,text);assert.equal(after.eventSequence,before.eventSequence,text);assert.equal(after.currentTimeValid,false,text);await s.source.disconnect();
  }
});
test('strict optional primitive/time/speed bounds ignore invalid fields without a fake sample',async()=>{
  const s=await opened();s.clock.now=10;s.transport.receive(sample());for(const value of [-1,315576001,'7',true,null]){s.clock.now++;s.transport.receive({path:'clip.mp4',currentTime:value,duration:value,playbackSpeed:value});assert.equal(s.source.snapshot().receiptSequence,1);assert.equal(s.source.snapshot().observedAtMs,10);assert.equal(s.source.snapshot().currentTimeValid,false);}await s.source.disconnect();
});
test('frame length/receive bounds fail closed and no payload is logged',async()=>{
  for(const bytes of [new Uint8Array([1,0,1,0]),new Uint8Array(262145)]){const s=await opened();s.transport.receive(sample());s.transport.receive(bytes);assert.equal(s.source.snapshot().status,'fault');assert.equal(s.source.snapshot().path,null);assert.equal(s.transport.calls.filter(x=>x==='close').length,1);await settle();assert.equal(s.source.snapshot().closeConfirmed,true);}
});
test('strict UTF8 and Unicode encoding have no replacement or invalid-surrogate acceptance',()=>{
  for(const bytes of [[0x80],[0xc0,0xaf],[0xe0,0x80,0xaf],[0xed,0xa0,0x80],[0xf4,0x90,0x80,0x80],[0xf5,0x80,0x80,0x80],[0xe2,0x82]])assert.throws(()=>decodeDeoVrUtf8(new Uint8Array(bytes)),code('invalidUtf8'));
  for(const text of ['ASCII','中文😀','\u0000\u007f\u0080\u07ff\u0800\uffff'])assert.equal(decodeDeoVrUtf8(encodeDeoVrUtf8(text)),text);
  assert.throws(()=>encodeDeoVrUtf8('\ud800'),code('invalidUnicode'));assert.throws(()=>decodeDeoVrPacket(frameDeoVrPayload(new Uint8Array()).subarray(4)));
});
test('frames copy input bytes and reset discards partial old generation framing',()=>{
  const decoder=new DeoVrFrameDecoder(),frame=json(sample());assert.equal(decoder.push(frame.subarray(0,6)).length,0);decoder.reset();const copies=decoder.push(frame);frame.fill(0);assert.equal(decodeDeoVrPacket(copies[0]).path,'clip.mp4');
});
test('outbound exact field/null/order and C# numeric formatting, bounded invalid commands',()=>{
  for(const [command,expected] of [[{kind:'playPause',playing:true},{path:null,currentTime:null,playbackSpeed:null,playerState:0,duration:null}],[{kind:'playPause',playing:false},{path:null,currentTime:null,playbackSpeed:null,playerState:1,duration:null}],[{kind:'seek',value:1},{path:null,currentTime:1,playbackSpeed:null,playerState:null,duration:null}],[{kind:'speed',value:1},{path:null,currentTime:null,playbackSpeed:1,playerState:null,duration:null}],[{kind:'path',path:'C:\\重😀.mp4'},{path:'C:\\重😀.mp4',currentTime:null,playbackSpeed:null,playerState:null,duration:null}]]){
    const bytes=encodeDeoVrCommand(command),text=new TextDecoder().decode(bytes.subarray(4));assert.equal(new DataView(bytes.buffer).getInt32(0,true),bytes.length-4);assert.deepEqual(JSON.parse(text),expected);assert.deepEqual(Object.keys(JSON.parse(text)),['path','currentTime','playbackSpeed','playerState','duration']);if(['seek','speed'].includes(command.kind))assert.ok(text.includes('1.0'));
  }
  for(const command of [{kind:'seek',value:-1},{kind:'seek',value:Infinity},{kind:'speed',value:0},{kind:'speed',value:1001},{kind:'path',path:' '},{kind:'path',path:'a'.repeat(8193)},{kind:'path',path:'\ud800'}])assert.throws(()=>encodeDeoVrCommand(command));
});
test('outbound local receipt never mutates observation, path, playing or acknowledges seek',async()=>{
  const s=await opened();s.transport.receive(sample());const before=s.source.snapshot();const commands=[s.source.playPause(false),s.source.seek(20),s.source.changeSpeed(2),s.source.changePath('next.mp4')];const receipts=await Promise.all(commands);for(const receipt of receipts){assert.equal(receipt.remoteAcknowledgement,false);assert.equal(receipt.generation,1);}assert.deepEqual(s.source.snapshot(),before);assert.deepEqual(s.transport.sent.map(b=>JSON.parse(new TextDecoder().decode(b.subarray(4))).currentTime),[null,20,null,null]);await s.source.disconnect();
});
test('idle heartbeat is exactly four zeros, command defers it, no observations from either',async()=>{
  const s=await opened();await s.clock.advanceTo(999);assert.equal(s.transport.sent.length,0);await s.source.playPause(true);await s.clock.advanceTo(1998);assert.equal(s.transport.sent.length,1);await s.clock.advanceTo(1999);assert.deepEqual(s.transport.sent[1],new Uint8Array(4));assert.equal(s.source.snapshot().receiptSequence,0);assert.equal(s.events.length,0);await s.source.disconnect();assert.equal(s.clock.tasks.size,0);
});
test('commands arriving during heartbeat queue in order and never overlap writes',async()=>{
  const s=await opened(),wait=deferred();s.transport.plan('send',wait.promise);await s.clock.advanceTo(1000);const command=s.source.seek(5);assert.equal(s.transport.sent.length,1);wait.resolve();await command;assert.equal(s.transport.sent.length,2);assert.equal(JSON.parse(new TextDecoder().decode(s.transport.sent[1].subarray(4))).currentTime,5);await s.source.disconnect();
});
test('queue is bounded and close rejects active/queued commands without replays',async()=>{
  const s=await opened(),wait=deferred();s.transport.plan('send',wait.promise);const pending=[s.source.seek(1),s.source.seek(2),s.source.seek(3),s.source.seek(4),s.source.seek(5)];const checks=pending.map(p=>assert.rejects(p,code('cancelled')));await assert.rejects(s.source.seek(6),code('commandQueueFull'));await s.source.disconnect();await Promise.all(checks);wait.resolve();await settle();assert.equal(s.transport.sent.length,1);assert.equal(s.source.snapshot().receiptSequence,0);
});
test('unknown send failure is sanitized, never retried, and resets source before close',async()=>{
  const s=await opened();s.transport.receive(sample());s.transport.plan('send',new Error('SECRET password https://user:secret@host'));await assert.rejects(s.source.seek(2),code('sendFailed'));assert.equal(s.transport.sent.length,1);assert.equal(s.source.snapshot().status,'fault');assert.equal(s.source.snapshot().path,null);assert.ok(!JSON.stringify(s.snapshots).includes('SECRET'));await settle();assert.equal(s.source.snapshot().closeConfirmed,true);
});
test('deadline cancels hung send; late success cannot mutate new generation',async()=>{
  const s=await opened(),wait=deferred();s.transport.plan('send',wait.promise);const pending=s.source.seek(9),rejected=assert.rejects(pending,code('sendTimeout'));await s.clock.advanceTo(50);await rejected;await settle();await s.source.connect(endpoint);const newer=s.source.snapshot();wait.resolve();await settle();assert.deepEqual(s.source.snapshot(),newer);assert.equal(s.factory.entries[1].transport.sent.length,0);await s.source.disconnect();
});
test('late completion at elapsed deadline is rejected even without timer dispatch',async()=>{
  const s=await opened(),wait=deferred();s.transport.plan('send',wait.promise);const rejected=assert.rejects(s.source.seek(3),code('sendTimeout'));s.clock.now=51;wait.resolve();await rejected;await settle();assert.equal(s.source.snapshot().status,'fault');
});
test('old receive/error/close callbacks cannot disturb a new connection or forge samples',async()=>{
  const s=await opened(),old=s.transport;s.transport.receive(sample());await s.source.disconnect();await s.source.connect(endpoint);const before=s.source.snapshot();old.receive(sample({path:'forged.mp4',currentTime:40}));old.sink.error();old.sink.closed();assert.deepEqual(s.source.snapshot(),before);await s.source.disconnect();
});
test('cancel during connect waits for actual open completion and second close before reconnect',async()=>{
  const s=setup(),wait=deferred();s.factory.plans.push(t=>t.plan('connect',wait.promise));const opening=s.source.connect(endpoint),rejected=assert.rejects(opening,code('cancelled'));await settle();const transport=s.factory.entries[0].transport;const closing=s.source.disconnect();await rejected;assert.equal(s.source.snapshot().closeConfirmed,false);assert.equal(transport.calls.filter(c=>c==='close').length,1);wait.resolve();await closing;assert.equal(transport.calls.filter(c=>c==='close').length,2);assert.equal(s.source.snapshot().closeConfirmed,true);await s.source.connect(endpoint);await s.source.disconnect();
});
test('unsettled connect remains permanently quarantined after bounded close, late cleanup cannot unlock',async()=>{
  const s=setup(),wait=deferred();s.factory.plans.push(t=>t.plan('connect',wait.promise));const rejected=assert.rejects(s.source.connect(endpoint),code('cancelled'));await settle();const closed=assert.rejects(s.source.disconnect(),code('closeTimeout'));await rejected;await s.clock.advanceTo(30);await closed;assert.equal(s.source.snapshot().quarantined,true);await assert.rejects(s.source.connect(endpoint),code('closeTimeout'));wait.resolve();await settle();assert.equal(s.source.snapshot().quarantined,true);assert.equal(s.factory.entries.length,1);assert.equal(s.factory.entries[0].transport.calls.filter(c=>c==='close').length,2);
});
test('unconfirmed close failure/timeout is permanent fail-closed and blocks replacement sockets',async()=>{
  for(const kind of ['reject','timeout']){const s=await opened(),wait=deferred();s.transport.plan('close',kind==='reject'?new Error('SECRET'):wait.promise);const rejection=assert.rejects(s.source.disconnect(),code(kind==='reject'?'closeFailed':'closeTimeout'));if(kind==='timeout')await s.clock.advanceTo(30);await rejection;assert.equal(s.source.snapshot().quarantined,true);await assert.rejects(s.source.connect(endpoint));wait.resolve();await settle();assert.equal(s.source.snapshot().quarantined,true);assert.equal(s.factory.entries.length,1);await assert.rejects(s.source.playPause(true),code('notConnected'));}
});
test('early received frames are copied, bounded, and retain their real receive timestamps',async()=>{
  const s=setup(),wait=deferred();s.factory.plans.push(t=>t.plan('connect',wait.promise));const opening=s.source.connect(endpoint);const transport=s.factory.entries[0].transport;s.clock.now=10;const bytes=json(sample());transport.receive(bytes);bytes.fill(0);assert.equal(s.source.snapshot().receiptSequence,0);s.clock.now=20;wait.resolve();await opening;assert.equal(s.source.snapshot().observedAtMs,10);assert.equal(s.source.snapshot().path,'clip.mp4');await s.source.disconnect();
});
test('connect rejection, peer error and peer close clear media without cross-generation effects',async()=>{
  const s=setup();s.factory.plans.push(t=>t.plan('connect',new Error('SECRET')));await assert.rejects(s.source.connect(endpoint),code('connectFailed'));await settle();assert.equal(s.source.snapshot().closeConfirmed,true);await s.source.connect(endpoint);s.factory.entries[1].transport.receive(sample());s.factory.entries[1].transport.sink.closed();assert.equal(s.source.snapshot().path,null);assert.equal(s.source.snapshot().diagnostic,'peerClosed');await settle();await s.source.connect(endpoint);s.factory.entries[2].transport.sink.error();assert.equal(s.source.snapshot().diagnostic,'transportError');
});
test('observer mutation/exception cannot change source or next observer data',async()=>{
  const s=await opened();s.source.subscribe((snapshot,events)=>{snapshot.endpoint.host='evil';snapshot.path='evil';if(events.length)events[0].path='evil';throw Error('observer');});let observed;s.source.subscribe((snapshot,events)=>{observed={snapshot,events};});s.transport.receive(sample());assert.equal(observed.snapshot.path,'clip.mp4');assert.equal(observed.events[0].path,'clip.mp4');assert.equal(s.source.snapshot().endpoint.host,'127.0.0.1');await s.source.disconnect();
});
test('backward/nonfinite monotonic clock closes gate and still attempts physical cleanup',async()=>{
  for(const invalid of [-1,NaN,Infinity]){const s=await opened();s.clock.now=10;s.transport.receive(sample());s.clock.now=invalid;s.transport.receive(sample({currentTime:3}));assert.equal(s.source.snapshot().status,'fault');assert.equal(s.source.snapshot().path,null);assert.ok(s.transport.calls.includes('close'));await settle();assert.equal(s.source.snapshot().quarantined,true);}
});

const fixtures=JSON.parse(readFileSync(new URL('../tools/heresphere-original-oracle/original-fixtures.json',import.meta.url),'utf8'));
const intentionalDifferences=new Set(['numeric-strings-converted','fractional-state-rounding','numeric-path-converted','boolean-path-only-conversion','nan-ignored','infinite-speed-accepted','infinite-duration-terminates','invalid-utf8-replacement','numeric-resource-converts-and-wins','bool-resource-converts-and-wins']);
for(const fixture of fixtures.readCases.filter(f=>!intentionalDifferences.has(f.name)))test(`actual extracted HereSphere C# reader parity: ${fixture.name}`,async()=>{const s=await opened(),bytes=new Uint8Array(Buffer.from(fixture.inputHex,'hex'));for(let at=0;at<bytes.length;at+=fixture.chunk)s.transport.receive(bytes.subarray(at,at+fixture.chunk));assert.deepEqual(s.events.map(eventText),fixture.events.map(event=>event.replace(/^(duration|position|speed):(.+)$/,(_,kind,value)=>kind+':'+Number(value).toString())));await s.source.disconnect();});
for(const fixture of fixtures.writeCases.filter(f=>!['seek-negative-direct-control','speed-negative-zero-direct-control','speed-large-direct-control'].includes(f.name)))test(`actual extracted HereSphere C# writer bytes: ${fixture.name}`,()=>{
  const state=JSON.parse(fixture.json);const command=state.path!==null?{kind:'path',path:state.path}:state.playerState!==null?{kind:'playPause',playing:state.playerState===0}:state.currentTime!==null?{kind:'seek',value:fixture.originalRequestedSeconds??state.currentTime}:{kind:'speed',value:state.playbackSpeed};
  assert.equal(Buffer.from(encodeDeoVrCommand(command)).toString('hex').toUpperCase(),fixture.hex);
});

test('new changed-only TimeSpan events preserve raw reader comparisons without inventing movement',async()=>{
  const s=await opened();s.clock.now=10;s.transport.receive({path:'clip.mp4',duration:3.00000015,currentTime:1.00000001});s.clock.now=20;s.transport.receive({path:'clip.mp4',duration:3.00000016,currentTime:1.00000002});s.clock.now=30;s.transport.receive({path:'clip.mp4',duration:3.00000016,currentTime:1.00000002});
  assert.deepEqual(s.events.filter(e=>e.kind==='position').map(e=>e.value),[1,1]);assert.deepEqual(s.events.filter(e=>e.kind==='duration').map(e=>e.value),[3.0000001,3.0000001]);assert.equal(s.source.snapshot().positionSeconds,1);assert.equal(s.source.snapshot().receiptSequence,3);assert.equal(s.source.snapshot().observedAtMs,30);assert.equal(s.source.snapshot().lastChangedAtMs,20);await s.source.disconnect();
});
test('opening receive accumulation and frame-count flood are bounded fail-closed',async()=>{
  const s=setup(),wait=deferred();s.factory.plans.push(t=>t.plan('connect',wait.promise));const rejected=assert.rejects(s.source.connect(endpoint),code('openingReceiveTooLarge'));const transport=s.factory.entries[0].transport;transport.receive(new Uint8Array(200000));transport.receive(new Uint8Array(100000));await rejected;assert.equal(s.source.snapshot().receiptSequence,0);wait.resolve();await settle();assert.equal(s.source.snapshot().closeConfirmed,true);
  const next=await opened();next.transport.receive(new Uint8Array(4*1025));assert.equal(next.source.snapshot().diagnostic,'tooManyFrames');await settle();assert.equal(next.source.snapshot().closeConfirmed,true);
});
test('connect timeout plus outstanding native open is bounded and quarantines until process teardown',async()=>{
  const s=setup(),wait=deferred();s.factory.plans.push(t=>t.plan('connect',wait.promise));const rejected=assert.rejects(s.source.connect(endpoint),code('connectTimeout'));await s.clock.advanceTo(100);await rejected;assert.equal(s.source.snapshot().status,'fault');await s.clock.advanceTo(130);assert.equal(s.source.snapshot().quarantined,true);wait.resolve();await settle();assert.equal(s.source.snapshot().quarantined,true);await assert.rejects(s.source.connect(endpoint));assert.equal(s.factory.entries.length,1);
});
test('reentrant connecting observer cancellation cannot create a transport',async()=>{
  const s=setup();let closing;s.source.subscribe(snapshot=>{if(snapshot.status==='connecting')closing=s.source.disconnect();});await assert.rejects(s.source.connect(endpoint),code('cancelled'));await closing;assert.equal(s.factory.entries.length,0);assert.equal(s.source.snapshot().status,'disconnected');assert.equal(s.source.snapshot().closeConfirmed,true);
});
test('failed listener detach still attempts close and permanently quarantines source',async()=>{
  const s=await opened();s.transport.plan('detach',new Error('secret'));await assert.rejects(s.source.disconnect(),code('detachFailed'));assert.ok(s.transport.calls.includes('close'));assert.equal(s.source.snapshot().quarantined,true);await assert.rejects(s.source.connect(endpoint));
});

test('HereSphere concrete source identity is stable across all lifecycle snapshots',async()=>{
  const s=setup();assert.equal(s.source.snapshot().sourceKind,'heresphere');assert.equal(s.source.snapshot().sceneUri,null);
  await s.source.connect(endpoint);s.transport=s.factory.entries[0].transport;s.transport.receive(sample());await s.source.disconnect();
  assert.ok(s.snapshots.every(value=>value.sourceKind==='heresphere'));
});
test('resource always wins over legacy path, including its complete receipt and optional fields',async()=>{
  const s=await opened();s.transport.receive(sample({path:'ignored.mp4',resource:'chosen.mp4',identifier:'https://example.test/scene/1'}));
  assert.equal(s.source.snapshot().path,'chosen.mp4');assert.equal(s.source.snapshot().lastObservation.path,'chosen.mp4');
  assert.deepEqual(s.events.map(eventText),['path:chosen.mp4','playing:true','duration:60','position:2.5','speed:1']);
  assert.equal(s.events[0].sceneUri,'https://example.test/scene/1');await s.source.disconnect();
});
test('blank resource suppresses path and resets before optional fields; null and unconvertible resource fall back',async()=>{
  for(const resource of ['', ' ', '\t\r\n', '\u2003', '\u0085']){const s=await opened();s.transport.receive(sample());const sequence=s.source.snapshot().receiptSequence;s.transport.receive({resource,path:'fallback.mp4',currentTime:90});assert.equal(s.source.snapshot().path,null);assert.equal(s.source.snapshot().receiptSequence,sequence);assert.equal(s.events.at(-1).kind,'reset');await s.source.disconnect();}
  for(const resource of [null,{},[]]){const s=await opened();s.transport.receive({resource,path:'fallback.mp4',identifier:'https://example.test/ignored',currentTime:3});assert.equal(s.source.snapshot().path,'fallback.mp4');assert.equal(s.source.snapshot().sceneUri,null);assert.equal(s.source.snapshot().positionSeconds,3);await s.source.disconnect();}
});
test('scene metadata follows original path events, never identifier-only or same-path branch changes',async()=>{
  const s=await opened();s.transport.receive({resource:'one.mp4',identifier:'https://example.test/scene/1'});const revision=s.source.snapshot().resourceRevision;
  s.transport.receive({resource:'one.mp4',identifier:'https://example.test/scene/2'});assert.equal(s.events.length,1);assert.equal(s.source.snapshot().sceneUri,'https://example.test/scene/1');assert.equal(s.source.snapshot().resourceRevision,revision);
  s.transport.receive({path:'one.mp4',identifier:'https://example.test/legacy'});assert.equal(s.events.length,1);assert.equal(s.source.snapshot().sceneUri,'https://example.test/scene/1');
  s.transport.receive({path:'two.mp4',identifier:'https://example.test/legacy'});assert.equal(s.source.snapshot().sceneUri,null);assert.equal(s.events.at(-1).sceneUri,null);
  s.transport.receive({resource:'three.mp4',identifier:'ftp://example.test/scene/3'});assert.equal(s.source.snapshot().sceneUri,'ftp://example.test/scene/3');
  s.transport.receive(new Uint8Array(4));assert.equal(s.source.snapshot().sceneUri,null);await s.source.disconnect();
});
test('absolute identifier stays inert, bounded, strict and independent of resource validity',async()=>{
  for(const identifier of ['https://example.test/scene/1','ftp://example.test/scene/2','urn:scene:42','file:///tmp/scene','https://[::1]:443/scene'])assert.equal(hereSphereSceneUri(identifier),identifier);
  for(const identifier of [null,{},42,'relative/scene','/tmp/scene','C:\\scene\\file','https:scene','https://','https://example.test:word/scene','https://example.test:99999/scene','https://[::::]/scene','https://999.1.1.1/scene','urn:','https://user:pass@example.test/scene','https://example.test/scene secret','https://example.test/%zz','a'.repeat(8193),'https://example.test/\u0000'])assert.equal(hereSphereSceneUri(identifier),null,String(identifier));
  const s=await opened();s.transport.receive(sample({identifier:'https://example.test/scene?token=SECRET'}));assert.equal(s.factory.entries.length,1);assert.equal(s.transport.sent.length,0);assert.equal(s.source.snapshot().diagnostic,null);assert.equal(s.source.snapshot().lastObservation.sceneUri,undefined);s.transport.receive(new Uint8Array(4));assert.equal(s.source.snapshot().sceneUri,null);await s.source.disconnect();
});
test('scene metadata observer mutation cannot alter the source or another observer',async()=>{
  const s=await opened();s.source.subscribe((snapshot,events)=>{snapshot.sceneUri='evil';if(events[0])events[0].sceneUri='evil';});let seen;s.source.subscribe((snapshot,events)=>{seen={snapshot,events};});
  s.transport.receive({resource:'clip.mp4',identifier:'https://example.test/scene'});assert.equal(seen.snapshot.sceneUri,'https://example.test/scene');assert.equal(seen.events[0].sceneUri,'https://example.test/scene');assert.equal(s.source.snapshot().sceneUri,'https://example.test/scene');await s.source.disconnect();
});
test('shared private provenance never joins HereSphere and DeoVR instances at matching generation/revision',async()=>{
  const {DeoVrMediaSource,isDeoVrPacketObservation,sameDeoVrObservationSource,isDeoVrDispatchBoundaryForObservation}=await import('../entry/src/main/ets/media/deovr/DeoVrMediaSource.ts');
  const here=await opened(),factory=new Factory(),deo=new DeoVrMediaSource(factory,here.clock,options);await deo.connect(endpoint);here.transport.receive(sample());factory.entries[0].transport.receive({path:'clip.mp4',currentTime:2.5,playerState:0});
  const a=here.source.snapshot().lastObservation,b=deo.snapshot().lastObservation;assert.equal(a.generation,b.generation);assert.equal(a.resourceRevision,b.resourceRevision);assert.equal(deo.snapshot().sourceKind,'deovr');assert.equal(isDeoVrPacketObservation(a),true);assert.equal(isDeoVrPacketObservation({...a}),false);assert.equal(sameDeoVrObservationSource(a,b),false);
  let boundary;await here.source.playPause(false,value=>{boundary=value;});assert.equal(isDeoVrDispatchBoundaryForObservation(boundary,a,'pause'),true);assert.equal(isDeoVrDispatchBoundaryForObservation(boundary,b,'pause'),false);await here.source.disconnect();await deo.disconnect();
});
test('HereSphere reader context fixture reproduces original event-scoped context exactly',async()=>{
  const s=await opened();for(const value of [{resource:'x.mp4',identifier:'https://example.test/scene/1'},{resource:'x.mp4',identifier:'https://example.test/scene/2'},{resource:'y.mp4',identifier:'relative/scene/3'},{path:'z.mp4',identifier:'https://example.test/scene/4'},{resource:'w.mp4',identifier:'ftp://example.test/scene/5'}]){const bytes=json(value);for(const byte of bytes)s.transport.receive(new Uint8Array([byte]));}
  assert.deepEqual(s.events.map(event=>({path:event.path,sceneUri:event.sceneUri})),fixtures.contextEvents.map(event=>({path:event.Path,sceneUri:event.Context?.SceneUri??null})));await s.source.disconnect();
});
test('resource reset invalidates a queued command before dispatch and never sends its identifier',async()=>{
  const s=await opened();s.transport.receive(sample({identifier:'https://example.test/?secret=SECRET'}));const wait=deferred();s.transport.plan('send',wait.promise);const first=s.source.seek(1),queued=s.source.changeSpeed(2),rejected=assert.rejects(queued,code('staleResource'));s.transport.receive({resource:'next.mp4'});wait.resolve();await first;await rejected;assert.equal(s.transport.sent.length,1);assert.ok(!new TextDecoder().decode(s.transport.sent[0]).includes('SECRET'));await s.source.disconnect();
});
test('invalid Unicode and prototype fields in identifier never renew clock evidence',async()=>{
  const s=await opened();s.clock.now=10;s.transport.receive(sample());const before=s.source.snapshot();for(const raw of ['{"resource":"clip.mp4","identifier":"\\ud800","currentTime":7}','{"resource":"clip.mp4","identifier":{"__proto__":1},"currentTime":7}']){s.clock.now=20;s.transport.receive(json(raw));assert.equal(s.source.snapshot().receiptSequence,before.receiptSequence);assert.equal(s.source.snapshot().observedAtMs,10);assert.equal(s.source.snapshot().currentTimeValid,false);}await s.source.disconnect();
});

test('HereSphere receipts drive clock; seek and local sends require fresh observed media and never move the clock',async()=>{
  const {RemoteMediaClock}=await import('../entry/src/main/ets/core/RemoteMediaClock.ts');const s=await opened(),remote=new RemoteMediaClock();remote.begin(s.source.snapshot().generation);s.source.subscribe(snapshot=>remote.accept(snapshot));
  s.clock.now=10;s.transport.receive(sample());assert.equal(remote.ready(10),true);assert.equal(remote.positionSeconds,2.5);
  remote.seek();assert.equal(remote.ready(10),false);await s.source.seek(20);assert.equal(remote.positionSeconds,2.5);assert.equal(remote.ready(10),false);s.clock.now=20;s.transport.receive(sample());assert.equal(remote.ready(20),true);assert.equal(remote.positionSeconds,2.5);
  s.clock.now=700;s.transport.receive(sample());assert.equal(remote.ready(700),true);assert.equal(remote.ready(761),false);assert.equal(remote.positionSeconds,2.5);
  s.clock.now=800;s.transport.receive(sample({currentTime:3}));assert.equal(remote.ready(800),true);s.transport.receive(new Uint8Array(4));assert.equal(remote.ready(800),false);assert.ok(Number.isNaN(remote.positionSeconds));await s.source.disconnect();
});
test('resource changes revoke all clock evidence even when optional field caches compare equal',async()=>{
  const {RemoteMediaClock}=await import('../entry/src/main/ets/core/RemoteMediaClock.ts');const s=await opened(),remote=new RemoteMediaClock();remote.begin(s.source.snapshot().generation);s.source.subscribe(snapshot=>remote.accept(snapshot));
  s.clock.now=10;s.transport.receive(sample());assert.equal(remote.ready(10),true);s.clock.now=20;s.transport.receive({resource:'other.mp4'});assert.equal(remote.ready(20),false);assert.equal(s.source.snapshot().positionSeconds,2.5);assert.ok(Number.isNaN(remote.positionSeconds));
  s.clock.now=30;s.transport.receive(sample({resource:'other.mp4'}));assert.equal(remote.ready(30),true);assert.equal(remote.path,'other.mp4');await s.source.disconnect();
});
test('wire-provided source kind and apparent ACK fields cannot replace local identity or command evidence',async()=>{
  const s=await opened();s.transport.receive(sample({sourceKind:'deovr',confirmed:true,commandId:99,seekComplete:true,serverTimestamp:500}));assert.equal(s.source.snapshot().sourceKind,'heresphere');assert.equal(s.source.snapshot().lastObservation.commandId,undefined);assert.equal(s.source.snapshot().lastObservation.confirmed,undefined);assert.equal(s.source.snapshot().lastObservation.receivedAtMs,0);await s.source.disconnect();
});

test('documented primitive resource coercion boundary is explicit and deterministic',async()=>{
  for(const resource of [42,true,false]){const s=await opened();s.transport.receive({resource,path:'fallback.mp4',identifier:'https://example.test/ignored'});assert.equal(s.source.snapshot().path,'fallback.mp4');assert.equal(s.source.snapshot().sceneUri,null);s.transport.receive({resource});assert.equal(s.source.snapshot().path,null);await s.source.disconnect();}
});

test('source captures protocol identity and dispatch once and rejects invalid strategy identity',async()=>{
  const {DeoVrMediaSource}=await import('../entry/src/main/ets/media/deovr/DeoVrMediaSource.ts');const clock=new Clock(),factory=new Factory();
  const protocol={sourceKind:'heresphere',decodePacket:decodeDeoVrPacket,encodeCommand:encodeDeoVrCommand};const source=new DeoVrMediaSource(factory,clock,options,protocol);
  protocol.sourceKind='deovr';protocol.decodePacket=()=>{throw Error('replaced');};protocol.encodeCommand=()=>{throw Error('replaced');};await source.connect(endpoint);factory.entries[0].transport.receive({resource:'real.mp4',currentTime:3});assert.equal(source.snapshot().sourceKind,'heresphere');assert.equal(source.snapshot().path,'real.mp4');await source.seek(4);await source.disconnect();
  assert.throws(()=>new DeoVrMediaSource(factory,clock,options,{...protocol,sourceKind:'invalid'}),code('invalidProtocol'));
});
