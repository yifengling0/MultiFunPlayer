import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
registerHooks({ resolve(s, c, next) { return next(s.startsWith('.') && !/\.[a-z]+$/i.test(s) ? s + '.ts' : s, c); } });
const { DeoVrMediaSource } = await import('../entry/src/main/ets/media/deovr/DeoVrMediaSource.ts');
const { DeoVrError, validateDeoVrEndpoint } = await import('../entry/src/main/ets/media/deovr/DeoVrTypes.ts');
const { DeoVrFrameDecoder, frameDeoVrPayload, encodeDeoVrUtf8, decodeDeoVrUtf8, decodeDeoVrPacket, encodeDeoVrCommand } = await import('../entry/src/main/ets/media/deovr/DeoVrProtocol.ts');
const { RemoteMediaClock } = await import('../entry/src/main/ets/core/RemoteMediaClock.ts');
const { PlaybackSessionCore } = await import('../entry/src/main/ets/core/PlaybackSessionCore.ts');
const { FunscriptParser } = await import('../entry/src/main/ets/core/Funscript.ts');
const { SettingsSchema } = await import('../entry/src/main/ets/settings/SettingsSchema.ts');
const { deoVrScriptMatchHint } = await import('../entry/src/main/ets/media/deovr/DeoVrScriptMatch.ts');
const { ResourceLibrary, ResourceFileEntry } = await import('../entry/src/main/ets/core/ResourceLibrary.ts');
const settle = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
const packet = (changes={}) => ({path:'film.mp4',playerState:0,duration:20,currentTime:1,playbackSpeed:1,...changes});
const framed = value => frameDeoVrPayload(encodeDeoVrUtf8(typeof value === 'string' ? value : JSON.stringify(value)));
const endpoint = {host:'127.0.0.1',port:23554,family:1};
class Time { now=0; serial=0; timers=new Map(); nowMs(){return this.now;} scheduleAt(at,fn){const id=++this.serial;this.timers.set(id,{at,fn});return id;} cancel(id){this.timers.delete(id);} async advance(to){for(;;){const due=[...this.timers].filter(([,t])=>t.at<=to).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;this.now=due[1].at;this.timers.delete(due[0]);due[1].fn();await settle();}this.now=to;await settle();} }
class MemorySourcePort { constructor(sink){this.sink=sink;this.calls=[];this.openPlan=null;this.closePlan=null;this.sendPlan=null;} connect(){this.calls.push(['connect']);return this.openPlan?.promise??Promise.resolve();} send(bytes){this.calls.push(['send',bytes.slice()]);return this.sendPlan?.promise??Promise.resolve();} detach(){this.calls.push(['detach']);} close(){this.calls.push(['close']);return this.closePlan?.promise??Promise.resolve();} receive(value){this.sink.received(framed(value));} }
function harness(options={}) { const time=new Time(),ports=[],batches=[]; const factory={create(_e,_g,sink){const p=new MemorySourcePort(sink);options.prepare?.(p);ports.push(p);return p;}}; const source=new DeoVrMediaSource(factory,time,options.limits??{connectTimeoutMs:5000,sendTimeoutMs:2000,closeTimeoutMs:1500,heartbeatIntervalMs:1000,maximumQueuedCommands:64}); source.subscribe((s,e)=>batches.push({s,e})); return {time,ports,batches,source}; }
async function opened(options){const h=harness(options);await h.source.connect(endpoint);return h;}
function configuration(){const c=SettingsSchema.defaults();for(const k of Object.keys(c.sync))if(k.startsWith('sync'))c.sync[k]=false;for(const a of c.axisSettingsByDevice.find(d=>d.deviceId===c.selectedDeviceId).axes){a.settings.autoHomeEnabled=false;a.settings.selectedMotionProvider=null;a.settings.updateMotionProviderWithAxis=null;}return c;}
const document = () => FunscriptParser.parse('{"actions":[{"at":0,"pos":10},{"at":20000,"pos":90}]}');
async function coreHarness(options={}) {const h=harness(options);h.core=new PlaybackSessionCore(configuration());h.core.setConnected(true);h.core.useDeoVrSource(1);h.source.subscribe((s,e)=>h.core.acceptDeoVrSnapshot(s,e));await h.source.connect(endpoint);return h;}
function bind(h){const s=h.source.snapshot(),d=document();assert.equal(h.core.loadDeoVrBindings(s.generation,s.resourceRevision,d,h.core.resources(d,'catalog-owned-script','film.funscript')),true);}
function tick(h,at){const elapsed=at-h.time.now;h.time.now=at;h.core.tick(elapsed,at);return h.core.dispatchSource(['L0']);}

for(const size of [1,2,3,4,5,17,1024]) test(`review DeoVR: incremental ${size}-byte framing retains UTF-8 and frame boundaries`,()=>{const expected=packet({path:'C:\\视频\\film😀.mp4'}),one=framed(expected),empty=new Uint8Array(4),bytes=new Uint8Array(one.length*2+4);bytes.set(one);bytes.set(empty,one.length);bytes.set(one,one.length+4);const d=new DeoVrFrameDecoder(),out=[];for(let i=0;i<bytes.length;i+=size)out.push(...d.push(bytes.subarray(i,i+size)));assert.equal(out.length,3);assert.equal(out[1],null);assert.equal(decodeDeoVrPacket(out[0]).path,expected.path);assert.deepEqual(out[0],out[2]);});
test('review DeoVR: malformed UTF-8, JSON, nonfinite fields and unsafe trees fail closed',()=>{for(const bytes of [[0xc0,0x80],[0xe0,0x80,0x80],[0xed,0xa0,0x80],[0xf4,0x90,0x80,0x80],[0xf0,0x9f]])assert.throws(()=>decodeDeoVrUtf8(new Uint8Array(bytes)));for(const text of ['{','[]','null','{"path":"film.mp4","n":1e999}','{"path":"film.mp4","__proto__":{}}','{"path":"\\ud800"}'])assert.throws(()=>decodeDeoVrPacket(encodeDeoVrUtf8(text)));const d=new DeoVrFrameDecoder();assert.throws(()=>d.push(new Uint8Array([1,0,1,0])),/frameTooLarge/);assert.throws(()=>new DeoVrFrameDecoder().push(new Uint8Array(262145)),/receiveTooLarge/);});
test('review DeoVR: changed path retains source optional caches but invalidates current-resource evidence',async()=>{const h=await opened();h.ports[0].receive(packet());const old=h.source.snapshot();h.time.now=100;h.ports[0].receive({path:'new.mp4'});const s=h.source.snapshot();assert.equal(s.resourceRevision,old.resourceRevision+1);for(const k of ['durationSeconds','positionSeconds','speed','playerState'])assert.equal(s[k],old[k]);for(const k of ['currentTimeValid','durationValid','playerStateValid','speedValid'])assert.equal(s[k],false);assert.deepEqual(h.batches.at(-1).e.map(e=>e.kind),['path']);h.ports[0].receive(packet({path:'new.mp4'}));assert.deepEqual(h.batches.at(-1).e,[]);assert.equal(h.source.snapshot().receiptSequence,old.receiptSequence+1);await h.source.disconnect();});
test('review DeoVR: malformed or partial packets and snapshots never fabricate observation receipts',async()=>{const h=await opened();h.ports[0].receive(packet());const before=h.source.snapshot();h.time.now=200;for(const data of ['{',JSON.stringify({path:'film.mp4',currentTime:-1}),JSON.stringify({path:'film.mp4',currentTime:'3'}),JSON.stringify({path:'film.mp4',duration:21})])h.ports[0].sink.received(framed(data));for(let n=0;n<30;n++)h.source.snapshot();assert.equal(h.source.snapshot().receiptSequence,before.receiptSequence);assert.equal(h.source.snapshot().observedAtMs,before.observedAtMs);assert.equal(h.source.snapshot().currentTimeValid,false);await h.source.disconnect();});
test('review DeoVR: all wire commands preserve original five properties and cannot update source state',async()=>{const h=await opened();h.ports[0].receive(packet());const before=h.source.snapshot();for(const [method,value,field,expected] of [['playPause',false,'playerState',1],['seek',7.25,'currentTime',7.25],['changeSpeed',2,'playbackSpeed',2],['changePath','new😀.mp4','path','new😀.mp4']]){const receipt=await h.source[method](value);assert.equal(receipt.remoteAcknowledgement,false);const bytes=h.ports[0].calls.at(-1)[1],decoded=JSON.parse(decodeDeoVrUtf8(bytes.subarray(4)));assert.deepEqual(Object.keys(decoded),['path','currentTime','playbackSpeed','playerState','duration']);assert.equal(decoded[field],expected);assert.equal(Object.values(decoded).filter(v=>v!==null).length,1);assert.deepEqual(h.source.snapshot(),before);}await h.source.disconnect();});
test('review DeoVR: heartbeat has no observation and nonpositive incoming lengths reset source',async()=>{const h=await opened();h.ports[0].receive(packet());const receipt=h.source.snapshot().receiptSequence;await h.time.advance(1000);assert.deepEqual(h.ports[0].calls.find(c=>c[0]==='send')[1],new Uint8Array(4));assert.equal(h.source.snapshot().receiptSequence,receipt);h.ports[0].sink.received(new Uint8Array([255,255,255,255]));assert.equal(h.source.snapshot().path,null);assert.equal(h.batches.at(-1).e[0].kind,'reset');await h.source.disconnect();});
test('review DeoVR: disconnect synchronously rejects queued/inflight writes and late callbacks cannot revive generation',async()=>{const h=await opened();h.ports[0].receive(packet());const p=h.ports[0],pending=deferred();p.sendPlan=pending;const one=h.source.seek(2),two=h.source.playPause(true);const rejected=[assert.rejects(one),assert.rejects(two)];const close=h.source.disconnect();assert.equal(h.source.snapshot().path,null);assert.equal(h.source.snapshot().status,'disconnecting');p.receive(packet({currentTime:9}));pending.resolve();await Promise.all([...rejected,close]);assert.equal(h.source.snapshot().status,'disconnected');assert.equal(p.calls.filter(c=>c[0]==='send').length,1);await h.source.connect(endpoint);const current=h.source.snapshot();p.receive(packet({currentTime:12}));p.sink.closed();assert.deepEqual(h.source.snapshot(),current);await h.source.disconnect();});
for(const mode of ['reject','timeout'])test(`review DeoVR: ${mode} close permanently quarantines the source and never opens replacement`,async()=>{const wait=deferred(),h=await opened({prepare:p=>p.closePlan=wait});const closing=h.source.disconnect(),failed=assert.rejects(closing);if(mode==='reject')wait.reject(Error('failed'));else await h.time.advance(1500);await failed;assert.equal(h.source.snapshot().quarantined,true);await assert.rejects(h.source.connect(endpoint));assert.equal(h.ports.length,1);wait.resolve();await settle();assert.equal(h.source.snapshot().closeConfirmed,false);});
test('review DeoVR: delayed connect delivery retains original source callback receipt time',async()=>{const wait=deferred(),h=harness({prepare:p=>p.openPlan=wait});const connecting=h.source.connect(endpoint);h.time.now=100;h.ports[0].receive(packet());h.time.now=1600;wait.resolve();await connecting;assert.equal(h.source.snapshot().observedAtMs,100);await h.source.disconnect();});
test('review DeoVR: backwards monotonic callbacks fault and revoke current resource',async()=>{const h=await opened();h.time.now=100;h.ports[0].receive(packet());h.time.now=99;h.ports[0].receive(packet({currentTime:2}));assert.equal(h.source.snapshot().status,'fault');assert.equal(h.source.snapshot().path,null);await settle();});
test('review DeoVR: real core admits complete current resource and samples only on actual tick',async()=>{const h=await coreHarness();h.time.now=100;h.ports[0].receive(packet());const before=h.core.frame();bind(h);assert.equal(h.core.frame(),before);assert.equal(h.core.dispatchSource(['L0']).authorization,null);const s=tick(h,140);assert.ok(s.authorization);assert.equal(s.authorization.observedMonotonicMs,100);assert.deepEqual(s.authorization.authorizedAxes,['L0']);assert.equal(h.core.dispatchSource(['bad']).authorization,null);await h.source.disconnect();});
test('review DeoVR: duplicate playing receipts cannot advance the clock or authorize output indefinitely',async()=>{const h=await coreHarness();h.ports[0].receive(packet());bind(h);assert.ok(tick(h,40).authorization);for(const at of [200,400,600,800]){h.time.now=at;h.ports[0].receive(packet());h.core.tick(40,at);}assert.equal(h.source.snapshot().observedAtMs,800);assert.equal(h.source.snapshot().lastChangedAtMs,0);assert.equal(h.core.snapshot().state,'paused');assert.equal(h.core.dispatchSource(['L0']).authorization,null);await h.source.disconnect();});
for(const action of ['Stop','background','disconnect','source switch'])test(`review DeoVR: ${action} cannot be undone by late state or script binding`,async()=>{const h=await coreHarness();h.ports[0].receive(packet());bind(h);assert.ok(tick(h,40).authorization);const s=h.source.snapshot();if(action==='Stop')h.core.stop();if(action==='background'){h.core.setForeground(false);h.core.setForeground(true);}if(action==='disconnect'){h.core.setConnected(false);h.core.setConnected(true);}if(action==='source switch')h.core.useInternalSource();h.time.now=80;h.ports[0].receive(packet({currentTime:2}));h.core.tick(40,80);assert.equal(h.core.dispatchSource(['L0']).authorization,null);assert.equal(h.core.loadDeoVrBindings(s.generation,s.resourceRevision,document(),[]),false);await h.source.disconnect();});
test('review DeoVR: remote seek never confirms local requested position or creates resumable seek token',async()=>{const h=await coreHarness();h.ports[0].receive(packet());bind(h);tick(h,40);const before=h.core.snapshot().positionMs;assert.equal(h.core.beginDeoVrSeek(),true);assert.equal(h.core.snapshot().positionMs,before);assert.equal(h.core.dispatchSource(['L0']).authorization,null);assert.throws(()=>h.core.seek(7000));await h.source.seek(7);assert.equal(h.core.snapshot().positionMs,before);h.time.now=80;h.ports[0].receive(packet({currentTime:4}));assert.ok(Math.abs(h.core.snapshot().positionMs-4000)<1);assert.equal(h.core.sourceSeekSnapshot(),null);await h.source.disconnect();});
test('review DeoVR: new path needs its own playing/duration evidence even when old cached values match',async()=>{const h=await coreHarness();h.ports[0].receive(packet());bind(h);tick(h,40);h.time.now=80;h.ports[0].receive({path:'new.mp4',currentTime:1});bind(h);assert.equal(tick(h,120).authorization,null);h.time.now=160;h.ports[0].receive({path:'new.mp4',currentTime:1,playerState:0,duration:20});assert.ok(tick(h,200).authorization);await h.source.disconnect();});
test('review DeoVR: explicit Play after Stop requires a newer genuine receipt',async()=>{const h=await coreHarness();h.ports[0].receive(packet());bind(h);tick(h,40);h.core.stop();h.time.now=80;h.ports[0].receive(packet({currentTime:2}));assert.equal(h.core.admitDeoVrPlay(),true);assert.equal(tick(h,120).authorization,null);h.time.now=160;h.ports[0].receive(packet({currentTime:2.2}));assert.ok(tick(h,200).authorization);await h.source.disconnect();});
test('review DeoVR: metadata matching selects only catalog-owned URI for remote URL/Windows/file paths',()=>{const file=new ResourceFileEntry('file://authorized/Download/film.funscript','film.funscript');for(const path of ['C:\\outside\\film.mp4','https://not-contacted.invalid/outside/film.mp4?token=not-used','file:///outside/film.mp4','../../film.mp4']){const hint=deoVrScriptMatchHint(path);assert.equal(hint.uri,'deovr-metadata-hint');const plan=ResourceLibrary.planSearch(hint,[file],[]);assert.equal(plan.length,1);assert.deepEqual(plan[0].file,file);assert.notEqual(plan[0].file.uri,path);}for(const path of ['https://example.invalid','https://example.invalid/%00.mp4','../','a\0.mp4'])assert.throws(()=>deoVrScriptMatchHint(path));});

// Actual native adapter, with SDK behavior replaced exclusively by in-memory mocks.
const nativeSource=readFileSync(new URL('../entry/src/main/ets/media/deovr/NativeDeoVrTransport.ets',import.meta.url),'utf8').replace(/^import [\s\S]*?;\n/gm,'').replace(/\bexport /g,'');
const { NativeDeoVrTransportFactory }=new Function('DeoVrError','validateDeoVrEndpoint',stripTypeScriptTypes(nativeSource)+';return {NativeDeoVrTransportFactory};')(DeoVrError,validateDeoVrEndpoint);
class Socket { listeners=new Map(); connectWait=null; closeWait=null; calls=[]; on(name,fn){this.listeners.set(name,fn);}off(name){this.listeners.delete(name);}emit(name,arg){this.listeners.get(name)?.(arg);}connect(){this.calls.push('connect');return this.connectWait?.promise??Promise.resolve();}setExtraOptions(){return Promise.resolve();}close(){this.calls.push('close');return this.closeWait?.promise??Promise.resolve();}send(){this.calls.push('send');return Promise.resolve();} }
class NativeEnvironment extends Time { sockets=[]; prepare=null; supports(){return true;}resolveHost(){return Promise.resolve([{address:'192.0.2.1',family:1}]);}createTcp(){const s=new Socket();this.prepare?.(s);this.sockets.push(s);return s;} }
test('review DeoVR: native pre-connect packets retain actual receive time through source/core',async()=>{const env=new NativeEnvironment(),opening=deferred();env.prepare=s=>s.connectWait=opening;const source=new DeoVrMediaSource(new NativeDeoVrTransportFactory(env),env);const core=new PlaybackSessionCore(configuration());core.setConnected(true);core.useDeoVrSource(1);source.subscribe((s,e)=>core.acceptDeoVrSnapshot(s,e));const connecting=source.connect(endpoint);await settle();env.now=100;env.sockets[0].emit('message',{message:framed(packet()).buffer});env.now=1600;opening.resolve();await connecting;const s=source.snapshot();const d=document();core.loadDeoVrBindings(s.generation,s.resourceRevision,d,core.resources(d,'catalog','film.funscript'));core.tick(40,1640);assert.equal(s.observedAtMs,100,'native buffering must not turn an old receive into a fresh receipt');assert.equal(core.dispatchSource(['L0']).authorization,null);await source.disconnect();});

const { setupIndex } = await import('./index-controller-helpers.mjs');
const { createOutputOwner } = await import('./output-owner-helpers.mjs');
const { OutputCoordinator, OutputEndpoint } = await import('../entry/src/main/ets/output/OutputCoordinator.ts');
const { MemoryTransport } = await import('../entry/src/main/ets/output/MemoryTransport.ts');
const policy={maximumFrameAgeMs:200,maximumClockAgeMs:750,maximumEventAgeMs:200,maximumFixedElapsedMs:1000,writeTimeoutMs:1000,maximumPolledQueueLength:64,allowZeroInterval:true};
function pageHarness(options={}) {
 const h=harness(options),ports=[];const core=new PlaybackSessionCore(configuration());core.flush=()=>{};core.setConnected(true);
 const Owner=createOutputOwner(source=>{const c=new OutputCoordinator({inspect:()=>({available:true,diagnostic:''}),create(config){const port=new MemoryTransport(h.time);ports.push({id:config.targetId,port});return port;}},source,policy,h.time,h.time);const connect=c.connect.bind(c);c.connect=(config,endpoint)=>connect({...config,kind:'memory'},endpoint);return c;});
 const result=setupIndex({engine:core,outputOwner:Owner,actualResources:true,remoteSource:h.source}),page=result.page;
 Owner.restore(core.outputConfiguration(),core.activeRegistry().profile,core.activeRegistry().revision);
 page.libraryLoaded=true;page.libraryRoot='file://docs/Download/com.multifunplayer.ohos';page.mediaCatalog=[new ResourceFileEntry(page.libraryRoot+'/film.funscript','film.funscript')];result.state.scriptText='{"actions":[{"at":0,"pos":10},{"at":20000,"pos":90}]}';
 page.sync=()=>{const s=core.snapshot();page.durationMs=s.durationMs;page.positionMs=s.positionMs;page.playing=s.state==='playing';page.syncOutput();};
 h.source.subscribe((s,e)=>page.deoVrSnapshot(s,e));page.sync();return {...h,...result,core,Owner,outputPorts:ports};
}
async function readyPage(options={}){const h=pageHarness(options);await h.page.connectDeoVr();h.ports[0].receive(packet());await settle();h.time.now=40;h.core.tick(40,40);h.page.sync();return h;}
async function addTarget(h,kind='tcp',options={}){h.page.addOutputTarget(kind);const id=h.page.selectedOutputId,d=h.Owner.draftSnapshot(id);d.host='memory-only.invalid';d.port=1234;d.editRevision++;d.model.ranges=d.model.ranges.map(r=>({...r,enabled:r.axisId==='L0'}));Object.assign(d.model,options);h.page.updateOutputDraft(d);const endpoint=new OutputEndpoint();Object.assign(endpoint,{host:d.host,port:d.port,family:Number(d.family),localPort:d.localPort,scheme:d.scheme,path:d.path});assert.ok(await h.page.applyOutputConfiguration(d.model.config(h.page.outputProfile,id),endpoint));return {id,target:h.page.output.get(id),port:h.outputPorts.at(-1).port};}
async function pageTick(h,delta=40){await h.time.advance(h.time.now+delta);h.core.tick(delta,h.time.now);h.page.sync();await h.time.advance(h.time.now+10);}
async function cleanPage(h){await h.source.disconnect().catch(()=>{});await h.page.output.dispose();}
function pendingRead(){return {started:deferred(),completion:deferred(),respectCancellation:false};}

test('review DeoVR Index: connect and script matching perform authorized catalog reads without physical connect/Arm',async()=>{const h=await readyPage();try{assert.equal(h.page.deoVrActive,true);assert.equal(h.core.isDeoVrSource(),true);assert.equal(h.outputPorts.length,0);assert.deepEqual(h.calls.filter(c=>c[0]==='read').map(c=>c[1]),[h.page.mediaCatalog[0].uri]);assert.equal(h.calls.filter(c=>c[0]==='video').length,0);const out=await addTarget(h);assert.equal(out.target.status().armed,false);await pageTick(h);assert.equal(out.port.writeRecords().length,0);h.page.armOutput(out.id);await pageTick(h);assert.ok(out.port.writeRecords().length>0);}finally{await cleanPage(h);}});
for(const kind of ['tcp','udp','webSocket'])test(`review DeoVR Index: ${kind} seek disarms, clears queued candidates and rejects late write receipt`,async()=>{const h=await readyPage();try{const out=await addTarget(h,kind);out.port.planWrite({kind:'defer'});h.page.armOutput(out.id);await pageTick(h);await pageTick(h);assert.equal(out.target.status().armed,true);const completed=out.target.status().completedLocalWrites;const before=h.core.snapshot().positionMs;await h.page.seekDeoVr(7000);assert.equal(out.target.status().armed,false);assert.equal(out.target.status().pendingFixed,false);assert.equal(out.target.status().queuedEvents,0);assert.equal(h.core.sourceSeekSnapshot(),null);assert.equal(h.core.snapshot().positionMs,before);out.port.resolveNextWrite();await settle();assert.equal(out.target.status().completedLocalWrites,completed);h.time.now+=40;h.ports[0].receive(packet({currentTime:7}));await pageTick(h);assert.equal(out.target.status().armed,false);const writes=out.port.writeRecords().length;await pageTick(h);assert.equal(out.port.writeRecords().length,writes);h.page.armOutput(out.id);await pageTick(h);assert.ok(out.port.writeRecords().length>writes);}finally{await cleanPage(h);}});
for(const change of ['Stop','background','disappear','endpoint'])test(`review DeoVR Index: pending script read is retired by ${change}`,async()=>{const h=pageHarness();try{await h.page.connectDeoVr();const read=pendingRead();h.reads.push(read);h.ports[0].receive(packet());await read.started.promise;assert.equal(h.page.deoVrMatching,true);if(change==='Stop')h.page.stop();if(change==='background'){h.page.foreground=false;h.page.foregroundChanged();h.page.foreground=true;h.page.foregroundChanged();}if(change==='disappear')h.page.aboutToDisappear();if(change==='endpoint'){const c=h.core.mediaSourceConfiguration();c.deoVr.port++;await h.page.applyMediaSourceSettings(c);}read.completion.resolve();await settle();assert.equal(h.core.displayDocument().axes.length,0);assert.equal(h.core.dispatchSource(['L0']).authorization,null);assert.equal(h.page.deoVrActive,false);assert.equal(h.outputPorts.length,0);}finally{await cleanPage(h);}});
test('review DeoVR Index: changed path cancels prior read and installs only the new matching resource',async()=>{const h=pageHarness();try{const next=new ResourceFileEntry(h.page.libraryRoot+'/new.funscript','new.funscript');h.page.mediaCatalog.push(next);h.state.scriptTexts={[h.page.mediaCatalog[0].uri]:'{"actions":[{"at":0,"pos":10},{"at":20000,"pos":20}]}',[next.uri]:'{"actions":[{"at":0,"pos":80},{"at":20000,"pos":90}]}'};await h.page.connectDeoVr();const read=pendingRead();h.reads.push(read);h.ports[0].receive(packet());await read.started.promise;h.ports[0].receive(packet({path:'new.mp4'}));await settle();assert.equal(h.core.displayDocument().axes[0].actions[0].pos,80);const current=h.core.displayDocument();read.completion.resolve();await settle();assert.equal(h.core.displayDocument(),current);assert.equal(h.page.deoVrMatching,false);}finally{await cleanPage(h);}});
for(const action of ['Stop','background','source settings'])test(`review DeoVR Index: ${action} during native opening cannot reactivate or arm on late connect`,async()=>{const waiting=deferred(),h=pageHarness({prepare:p=>p.openPlan=waiting});try{const connecting=h.page.connectDeoVr();await settle();assert.equal(h.ports.length,1);if(action==='Stop')h.page.stop();if(action==='background'){h.page.foreground=false;h.page.foregroundChanged();h.page.foreground=true;h.page.foregroundChanged();}let changing=null;if(action==='source settings'){const c=h.core.mediaSourceConfiguration();c.selectedSource='internal';changing=h.page.applyMediaSourceSettings(c);}waiting.resolve();if(changing)await changing;await connecting;h.ports[0].receive(packet());await settle();assert.equal(h.page.deoVrActive,false);assert.equal(h.source.snapshot().status,'disconnected');assert.equal(h.core.dispatchSource(['L0']).authorization,null);assert.equal(h.outputPorts.length,0);}finally{await cleanPage(h);}});
test('review DeoVR Index: close failure blocks Internal, new endpoint, Download preparation and reconnect',async()=>{const close=deferred(),h=await readyPage({prepare:p=>p.closePlan=close});try{const disconnect=h.page.disconnectDeoVr();close.reject(Error('close unknown'));assert.equal(await disconnect,false);const configuration=h.core.mediaSourceConfiguration();await h.page.connectInternal();const next=h.core.mediaSourceConfiguration();next.deoVr.port++;await h.page.applyMediaSourceSettings(next);await h.page.scanDownloads();await h.page.connectDeoVr();assert.equal(h.ports.length,1);assert.equal(h.page.internalConnected,false);assert.deepEqual(h.core.mediaSourceConfiguration(),configuration);assert.equal(h.calls.filter(c=>c[0]==='prepare').length,0);assert.equal(h.core.dispatchSource(['L0']).authorization,null);}finally{await cleanPage(h);}});
test('review DeoVR Index: a late command completion after Stop does not replace stopped status or match scripts',async()=>{const h=await readyPage();try{const waiting=deferred();h.ports[0].sendPlan=waiting;const command=h.page.setDeoVrPlaying(true);await settle();h.page.stop();const status=h.page.status,readCount=h.calls.filter(c=>c[0]==='read').length;waiting.resolve();await command;await settle();assert.equal(h.page.status,status);assert.equal(h.calls.filter(c=>c[0]==='read').length,readCount);assert.equal(h.core.dispatchSource(['L0']).authorization,null);assert.equal(h.page.deoVrActive,false);}finally{await cleanPage(h);}});
test('review DeoVR Index: repeated Download refresh before retirement settles starts at most one preparation',async()=>{const h=pageHarness();try{const pending=deferred();h.preparations.push(pending,pending);const first=h.page.scanDownloads(),second=h.page.scanDownloads();await settle();assert.equal(h.calls.filter(c=>c[0]==='prepare').length,1);pending.resolve(h.page.libraryRoot);await Promise.all([first,second]);}finally{await cleanPage(h);}});
test('review DeoVR core: paused Motion needs fresh current-resource pause proof',async()=>{const h=await coreHarness();try{const cfg=h.core.getAxisConfiguration('L0');cfg.selectedMotionProvider='Pattern';cfg.motionProviderBlend=1;cfg.bypassScript=true;cfg.updateMotionProviderWithoutScript=true;cfg.updateMotionProviderWhenPaused=true;h.core.changeAxisConfiguration('L0',cfg);h.ports[0].receive(packet({playerState:1}));bind(h);assert.ok(tick(h,40).authorization?.intents.includes('pausedMotion'));h.time.now=80;h.ports[0].receive({path:'new.mp4',currentTime:1,duration:20});bind(h);assert.equal(tick(h,120).authorization,null);h.time.now=160;h.ports[0].receive(packet({path:'new.mp4',playerState:1}));assert.ok(tick(h,200).authorization?.intents.includes('pausedMotion'));assert.equal(tick(h,1000).authorization,null);}finally{await h.source.disconnect();}});

test('review DeoVR Index: removal of a managed script catalog retires its pending match read',async()=>{const h=pageHarness();try{const file=new ResourceFileEntry('file://authorized-script-library/film.funscript','film.funscript');h.page.mediaCatalog=[];h.page.scriptLibraries=[{uri:'file://authorized-script-library',name:'managed',files:[file],recursive:false}];await h.page.connectDeoVr();const read=pendingRead();h.reads.push(read);h.ports[0].receive(packet());await read.started.promise;h.page.editScriptLibrary(0,'remove');assert.equal(h.page.scriptLibraries.length,0);read.completion.resolve();await settle();assert.equal(h.core.displayDocument().axes.length,0,'read from removed catalog must not become current binding');assert.equal(h.core.dispatchSource(['L0']).authorization,null);}finally{await cleanPage(h);}});

test('review DeoVR Index: restoring selection and endpoint preferences remains inert and read-only rejects mutation/connect',async()=>{const h=pageHarness();try{const cfg=h.core.mediaSourceConfiguration();cfg.selectedSource='deovr';cfg.deoVr.host='restored.invalid';h.core.changeMediaSourceConfiguration(cfg);h.page.mediaSourceConfiguration=cfg;h.page.deoVrSnapshot(h.source.snapshot(),[]);assert.equal(h.ports.length,0);assert.equal(h.outputPorts.length,0);h.page.settingsReadOnly=true;const changed=h.core.mediaSourceConfiguration();changed.deoVr.port++;await h.page.applyMediaSourceSettings(changed);await h.page.connectDeoVr();assert.equal(h.ports.length,0);assert.equal(h.core.mediaSourceConfiguration().deoVr.port,cfg.deoVr.port);h.page.settingsReadOnly=false;h.page.recoveryRequired=true;await h.page.connectDeoVr();assert.equal(h.ports.length,0);}finally{await cleanPage(h);}});

const { ShortcutAction } = await import('../entry/src/main/ets/input/ShortcutConfiguration.ts');
test('review DeoVR Index: AB loop routes its real core request through disarming remote seek',async()=>{const h=await readyPage();try{const out=await addTarget(h);h.page.armOutput(out.id);await pageTick(h);assert.equal(out.target.status().armed,true);h.core.mediaLoop.setLoop(.5,1.2,20);h.time.now+=120;h.core.tick(120,h.time.now);h.page.sync();h.page.processMediaSeekRequests();await settle();assert.equal(out.target.status().armed,false);assert.equal(h.core.sourceSeekSnapshot(),null);const sent=h.ports[0].calls.filter(c=>c[0]==='send').at(-1)[1];assert.equal(JSON.parse(decodeDeoVrUtf8(sent.subarray(4))).currentTime,.5);}finally{await cleanPage(h);}});
test('review DeoVR Index: AutoSkip uses real duration scheduling and disarms rather than preserving seek Arm',async()=>{const h=pageHarness();try{h.state.scriptText='{"actions":[{"at":10000,"pos":10},{"at":20000,"pos":90}]}';await h.page.connectDeoVr();h.ports[0].receive(packet());await settle();h.time.now=40;h.core.tick(40,40);h.page.sync();const out=await addTarget(h);h.page.armOutput(out.id);h.time.now=1000;h.ports[0].receive(packet({currentTime:2}));h.core.tick(960,1000);h.page.sync();h.page.processMediaSeekRequests();await settle();assert.equal(out.target.status().armed,false);assert.equal(h.core.sourceSeekSnapshot(),null);const sent=h.ports[0].calls.filter(c=>c[0]==='send').at(-1)[1];assert.equal(JSON.parse(decodeDeoVrUtf8(sent.subarray(4))).currentTime,5);}finally{await cleanPage(h);}});
test('review DeoVR Index: path shortcut only sends metadata and waits received resource before catalog IO',async()=>{const h=await readyPage();try{const out=await addTarget(h);h.page.armOutput(out.id);await pageTick(h);const reads=h.calls.filter(c=>c[0]==='read').length;const action=new ShortcutAction('Media::Path::Set');action.text='https://not-contacted.invalid/outside/new.mp4';await h.page.executeShortcutAction(action,'L0');assert.equal(out.target.status().armed,false);assert.equal(h.calls.filter(c=>c[0]==='read').length,reads);assert.equal(h.source.snapshot().path,'film.mp4');const sent=h.ports[0].calls.filter(c=>c[0]==='send').at(-1)[1];assert.equal(JSON.parse(decodeDeoVrUtf8(sent.subarray(4))).path,action.text);assert.equal(h.core.sourceSeekSnapshot(),null);}finally{await cleanPage(h);}});
test('review DeoVR Index: new remote path during Reload scan rejects old owned reload commit',async()=>{const h=await readyPage();try{h.state.scanFiles=h.page.mediaCatalog;const pending=pendingRead();h.scans.push(pending);const reload=h.page.reloadManagedAxisScripts(['L0']);const rejected=assert.rejects(reload);await pending.started.promise;h.ports[0].receive(packet({path:'new.mp4'}));await settle();const current=h.core.displayDocument();pending.completion.resolve();await rejected;assert.equal(h.core.displayDocument(),current);assert.equal(h.page.scriptReloadBusy,false);}finally{await cleanPage(h);}});

test('review DeoVR Index: Stop during native video retirement prevents the delayed source connect entirely',async()=>{const h=pageHarness();try{const wait=deferred();h.page.video.release=()=>wait.promise;const connecting=h.page.connectDeoVr();await settle();assert.equal(h.ports.length,0);h.page.stop();const stopped=h.page.status;wait.resolve();await connecting;assert.equal(h.ports.length,0);assert.equal(h.page.status,stopped);assert.equal(h.page.deoVrActive,false);}finally{await cleanPage(h);}});
test('review DeoVR Index: stale pause failure cannot stop a new explicitly connected remote generation',async()=>{const h=await readyPage();try{const send=deferred();h.ports[0].sendPlan=send;h.page.pauseTransport();const closing=h.page.disconnectDeoVr();await closing;await h.page.connectDeoVr();h.time.now=100;h.ports.at(-1).receive(packet({currentTime:2}));await settle();h.core.tick(60,100);h.page.sync();assert.equal(h.core.snapshot().state,'playing');send.reject(Error('old sender failed'));await settle();assert.equal(h.page.deoVrActive,true);assert.equal(h.core.snapshot().state,'playing');assert.ok(h.core.dispatchSource(['L0']).authorization);}finally{await cleanPage(h);}});

test('review DeoVR app session: lifecycle close is inert before creation and quarantine survives repeated current()',async()=>{const time=new Time(),ports=[];class Factory{create(_endpoint,_generation,sink){const port=new MemorySourcePort(sink);ports.push(port);return port;}}const code=readFileSync(new URL('../entry/src/main/ets/app/DeoVrSession.ets',import.meta.url),'utf8').replace(/^import [\s\S]*?;\n/gm,'').replace(/\bexport /g,'');const Session=new Function('DeoVrMediaSource','NativeDeoVrTransportFactory','systemDateTime','setTimeout','clearTimeout',stripTypeScriptTypes(code)+';return DeoVrSession;')(DeoVrMediaSource,Factory,{TimeType:{STARTUP:1},getUptime:()=>time.now},(fn,delta)=>time.scheduleAt(time.now+delta,fn),id=>time.cancel(id));Session.closeIfReady();assert.equal(ports.length,0);const source=Session.current();assert.equal(ports.length,0);await source.connect(endpoint);const waiting=deferred();ports[0].closePlan=waiting;Session.closeIfReady();assert.equal(source.snapshot().status,'disconnecting');waiting.reject(Error('unknown close'));await settle();assert.equal(source.snapshot().quarantined,true);assert.equal(Session.current(),source);await assert.rejects(Session.current().connect(endpoint));assert.equal(ports.length,1);});
for(const method of ['onBackground','onWindowStageDestroy','onDestroy'])test(`review DeoVR Ability: actual ${method} revokes source and physical admission synchronously`,async()=>{const h=await readyPage();try{const out=await addTarget(h);h.page.armOutput(out.id);await pageTick(h);const code=readFileSync(new URL('../entry/src/main/ets/entryability/EntryAbility.ets',import.meta.url),'utf8').replace(/^import [\s\S]*?;\n/gm,'').replace('export default class','class');const Entry=new Function('NativeKeyboardWindow','UIAbility','RemoteMediaSession','NativeOutputSession','NativeWindowPresentation','PlaybackSession','AppStorage',stripTypeScriptTypes(code)+';return EntryAbility;')({claimStage(){return 1;},bindStage(){},setForeground(){},releaseStage(){}},class {},{closeIfReady(){void h.source.disconnect().catch(()=>{});}},{setForeground(v){h.page.output.setForeground(v);},closeIfReady(){h.page.output.setForeground(false);}},{destroyStage(){},setForeground(){}},{flushIfReady(){}},{setOrCreate(){}});const app=new Entry();app.lifecycleOwner=++Entry.lifecycleSequence; /* established-stage fixture */ app[method]();assert.equal(out.target.status().armed,false);assert.equal(h.core.dispatchSource(['L0']).authorization,null);assert.notEqual(h.source.snapshot().status,'connected');await settle();}finally{await cleanPage(h);}});

test('review DeoVR core: direct standalone/manual preview is rejected until remote owner is explicitly retired',async()=>{const h=await coreHarness();try{assert.throws(()=>h.core.startStandaloneMotion(),/Close/);assert.throws(()=>h.core.startManualPreview(),/Close/);assert.equal(h.core.isDeoVrSource(),true);assert.equal(h.core.isStandaloneMotionActive(),false);assert.equal(h.core.isManualPreviewActive(),false);h.core.resetRuntime();assert.equal(h.core.isDeoVrSource(),false);h.ports[0].receive(packet());h.core.tick(40,40);assert.equal(h.core.dispatchSource(['L0']).authorization,null);}finally{await h.source.disconnect();}});
test('review DeoVR core: generic Play follows remote admission and cannot fabricate a new observation',async()=>{const h=await coreHarness();try{h.ports[0].receive(packet());bind(h);tick(h,40);h.core.stop();const before=h.source.snapshot().receiptSequence;assert.equal(h.core.play(),true);assert.equal(h.source.snapshot().receiptSequence,before);assert.equal(tick(h,80).authorization,null);h.time.now=120;h.ports[0].receive(packet({currentTime:2}));assert.ok(tick(h,160).authorization);}finally{await h.source.disconnect();}});
test('review DeoVR Index: Endpoint Set same value succeeds without send, reconnect or revoking existing Arm',async()=>{const h=await readyPage();try{const out=await addTarget(h);h.page.armOutput(out.id);await pageTick(h);const oldPort=h.ports[0],calls=oldPort.calls.length;const action=new ShortcutAction('DeoVR::Endpoint::Set');action.text='127.0.0.1:23554';await h.page.executeShortcutAction(action,'L0');assert.equal(h.ports.length,1);assert.equal(oldPort.calls.length,calls);assert.equal(h.page.deoVrActive,true);assert.equal(out.target.status().armed,true);for(const value of ['https://bad.invalid:123','bad.invalid:0','user:secret@bad:123','999.0.0.1:123']){action.text=value;await assert.rejects(h.page.executeShortcutAction(action,'L0'));}assert.equal(oldPort.calls.length,calls);}finally{await cleanPage(h);}});

test('review 0.19 Index: a completed Speed continuity survives the next genuine packet before its next frame',async()=>{
 const h=await readyPage();h.page.inputNow=()=>h.time.now;
 try{
  const out=await addTarget(h);h.page.armOutput(out.id);await pageTick(h);
  await h.page.setPlaybackSpeed(2);assert.equal(out.target.status().controlPending,true);
  h.time.now=120;h.ports[0].receive(packet({currentTime:1.08,playbackSpeed:2}));
  h.time.now=160;h.ports[0].receive(packet({currentTime:1.16,playbackSpeed:2}));
  await pageTick(h);assert.equal(out.target.status().armed,true);assert.equal(out.target.status().controlPending,false);
  h.time.now=240;h.ports[0].receive(packet({currentTime:1.24,playbackSpeed:2}));
  assert.equal(out.target.status().armed,true,'ordinary subsequent source packet must only suspend stale-frame candidates');
  await pageTick(h);assert.equal(out.target.status().armed,true);
 }finally{await cleanPage(h);}
});

test('review 0.19 Index: permitted paused Motion keeps its independent 200 ms cadence while frames arrive faster',async()=>{
 const h=await readyPage();h.page.inputNow=()=>h.time.now;
 try{
  const cfg=h.core.getAxisConfiguration('L0');cfg.selectedMotionProvider='Pattern';cfg.motionProviderBlend=1;
  cfg.bypassScript=true;cfg.updateMotionProviderWithoutScript=true;cfg.updateMotionProviderWhenPaused=true;
  h.core.changeAxisConfiguration('L0',cfg);await pageTick(h);
  const out=await addTarget(h,'webSocket',{pausedMotion:true,intervalMs:200,dirtyOnly:false});
  h.page.armOutput(out.id);await pageTick(h);await h.page.setDeoVrPlaying(false);
  h.time.now+=40;h.ports[0].receive(packet({currentTime:1.15,playerState:1}));
  h.time.now+=40;h.ports[0].receive(packet({currentTime:1.15,playerState:1}));await pageTick(h);
  assert.equal(out.target.status().controlParked,true);const before=out.port.writeRecords().length;
  for(let i=0;i<10;i++){h.ports[0].receive(packet({currentTime:1.15,playerState:1}));await pageTick(h);}
  assert.equal(out.target.status().armed,true);
  assert.ok(out.port.writeRecords().length>before,'new paused frames must not continually reset the independent fixed deadline');
 }finally{await cleanPage(h);}
});

test('review 0.19 Index: a pre-dispatch partial packet cannot substitute for either subsequent observation',async()=>{
 const h=await readyPage();h.page.inputNow=()=>h.time.now;
 try{
  const out=await addTarget(h);h.page.armOutput(out.id);await pageTick(h);
  const delayed=framed(packet({currentTime:1.04,playbackSpeed:2}));h.ports[0].sink.received(delayed.subarray(0,delayed.length-1));
  await h.page.setPlaybackSpeed(2);const writes=out.port.writeRecords().length;
  h.time.now+=20;h.ports[0].sink.received(delayed.subarray(delayed.length-1));
  h.time.now+=20;h.ports[0].receive(packet({currentTime:1.08,playbackSpeed:2}));await pageTick(h);
  assert.equal(out.target.status().armed,true);assert.equal(out.target.status().controlPending,true);
  assert.equal(out.port.writeRecords().length,writes);
  h.time.now+=20;h.ports[0].receive(packet({currentTime:1.12,playbackSpeed:2}));await pageTick(h);
  assert.equal(out.target.status().controlPending,false);assert.equal(out.target.status().armed,true);
 }finally{await cleanPage(h);}
});

test('review 0.19 Index: overlapping queued controls permanently revoke captured Arm despite both local completions',async()=>{
 const h=await readyPage();h.page.inputNow=()=>h.time.now;
 try{
  const out=await addTarget(h);h.page.armOutput(out.id);await pageTick(h);
  const send=deferred();h.ports[0].sendPlan=send;const first=h.page.setPlaybackSpeed(2);await settle();
  assert.equal(out.target.status().controlPending,true);const second=h.page.setDeoVrPlaying(false);await settle();
  assert.equal(out.target.status().armed,false);assert.equal(out.target.status().queuedEvents,0);assert.equal(out.target.status().pendingFixed,false);
  h.ports[0].sendPlan=null;send.resolve();await Promise.all([first,second]);const writes=out.port.writeRecords().length;
  for(let i=0;i<3;i++){h.time.now+=40;h.ports[0].receive(packet({currentTime:1.1,playerState:1,playbackSpeed:2}));await pageTick(h);}
  assert.equal(out.target.status().armed,false);assert.equal(out.port.writeRecords().length,writes);
 }finally{await cleanPage(h);}
});

test('review 0.19 Index: deferred prior output receipt cannot update successful writes during pending ordinary control',async()=>{
 const h=await readyPage();h.page.inputNow=()=>h.time.now;
 try{
  const out=await addTarget(h);out.port.planWrite({kind:'defer'});h.page.armOutput(out.id);await pageTick(h);
  assert.equal(out.port.pendingWriteCount,1);const completed=out.target.status().completedLocalWrites;
  await h.page.setPlaybackSpeed(2);assert.equal(out.target.status().controlPending,true);
  out.port.resolveNextWrite();await settle();assert.equal(out.target.status().completedLocalWrites,completed);
  assert.equal(out.target.status().armed,true);assert.equal(out.target.status().pendingFixed,false);
  assert.equal(out.target.status().queuedEvents,0);const writes=out.port.writeRecords().length;
  await h.time.advance(h.time.now+100);assert.equal(out.port.writeRecords().length,writes);
 }finally{await cleanPage(h);}
});

test('review 0.19 Index: paused permissions remain per-target and same-speed paused control needs a new pair',async()=>{
 const h=await readyPage();h.page.inputNow=()=>h.time.now;
 try{
  const cfg=h.core.getAxisConfiguration('L0');cfg.selectedMotionProvider='Pattern';cfg.motionProviderBlend=1;
  cfg.bypassScript=true;cfg.updateMotionProviderWithoutScript=true;cfg.updateMotionProviderWhenPaused=true;
  h.core.changeAxisConfiguration('L0',cfg);await pageTick(h);
  const yes=await addTarget(h,'tcp',{pausedMotion:true,dirtyOnly:false}),no=await addTarget(h,'tcp',{pausedMotion:false,dirtyOnly:false});
  h.page.armOutput(yes.id);h.page.armOutput(no.id);await pageTick(h);await h.page.setDeoVrPlaying(false);
  h.time.now+=40;h.ports[0].receive(packet({currentTime:1.1,playerState:1}));h.time.now+=40;h.ports[0].receive(packet({currentTime:1.1,playerState:1}));
  const yesBefore=yes.port.writeRecords().length,noBefore=no.port.writeRecords().length;await pageTick(h);
  assert.equal(yes.target.status().controlParked,true);assert.equal(no.target.status().controlParked,true);
  assert.ok(yes.port.writeRecords().length>yesBefore);assert.equal(no.port.writeRecords().length,noBefore);
  await h.page.setPlaybackSpeed(1);assert.equal(yes.target.status().controlPending,true);assert.equal(no.target.status().controlPending,true);
  h.time.now+=40;h.ports[0].receive(packet({currentTime:1.1,playerState:1}));await pageTick(h);
  assert.equal(yes.target.status().controlPending,true);assert.equal(no.target.status().controlPending,true);
  h.time.now+=40;h.ports[0].receive(packet({currentTime:1.1,playerState:1}));await pageTick(h);
  assert.equal(yes.target.status().controlParked,true);assert.equal(no.target.status().controlParked,true);
  assert.equal(no.port.writeRecords().length,noBefore);
 }finally{await cleanPage(h);}
});

for(const parked of [false,true])test(`review 0.19 Index: ${parked?'parked':'pending'} retention expires without page or core ticks and late observations cannot restore it`,async()=>{
 const h=await readyPage();h.page.inputNow=()=>h.time.now;
 try{
  const out=await addTarget(h);h.page.armOutput(out.id);await pageTick(h);await h.page.setDeoVrPlaying(false);
  if(parked){h.time.now+=40;h.ports[0].receive(packet({currentTime:1.1,playerState:1}));h.time.now+=40;h.ports[0].receive(packet({currentTime:1.1,playerState:1}));await pageTick(h);assert.equal(out.target.status().controlParked,true);}
  const writes=out.port.writeRecords().length;await h.time.advance(h.time.now+751);
  assert.equal(out.target.status().armed,false);assert.equal(out.port.writeRecords().length,writes);
  h.ports[0].receive(packet({currentTime:1.1,playerState:1}));await pageTick(h);
  assert.equal(out.target.status().armed,false);assert.equal(out.port.writeRecords().length,writes);
 }finally{await cleanPage(h);}
});

test('review 0.19 Index: repeated reads and zero-elapsed ticks cannot publish the observation pair as an actual frame',async()=>{
 const h=await readyPage();h.page.inputNow=()=>h.time.now;
 try{
  const out=await addTarget(h);h.page.armOutput(out.id);await pageTick(h);await h.page.setPlaybackSpeed(1);
  const frame=h.core.frame();h.time.now+=40;h.ports[0].receive(packet({currentTime:1.04}));h.time.now+=40;h.ports[0].receive(packet({currentTime:1.08}));
  for(let i=0;i<5;i++){h.core.tick(0,h.time.now);h.page.sync();h.core.dispatchSource(['L0']);}
  assert.equal(h.core.frame(),frame);assert.equal(out.target.status().controlPending,true);assert.equal(out.target.status().armed,true);
  await pageTick(h);assert.equal(out.target.status().controlPending,false);assert.equal(out.target.status().armed,true);
 }finally{await cleanPage(h);}
});

for(const polled of [false,true])for(const unknown of ['origin','disabled-axis dependency'])test(`review 0.19 Index: fault-injected unknown ${unknown} cannot become ${polled?'polled':'fixed'} paused parking proof`,async()=>{
 const h=await readyPage();h.page.inputNow=()=>h.time.now;
 try{
  const out=await addTarget(h,'tcp',{polled,pausedMotion:true,pausedAutoHome:true});h.page.armOutput(out.id);await pageTick(h);
  await h.page.setDeoVrPlaying(false);h.time.now+=40;h.ports[0].receive(packet({currentTime:1.1,playerState:1}));h.time.now+=40;h.ports[0].receive(packet({currentTime:1.1,playerState:1}));
  h.time.now+=40;h.core.tick(40,h.time.now);const real=h.core.frame(),originalFrame=h.core.frame.bind(h.core);
  const damaged={...real,provenance:real.provenance.map(p=>p.axisName!=='L0'?p:unknown==='origin'?{...p,status:'unknown'}:{...p,dependencies:[...p.dependencies,{axisName:'R0',status:'unknown',profileRevision:real.profileRevision,epoch:real.epoch,configurationRevision:real.configurationRevision,frameSequence:real.sequence,role:'smartLimit'}]})};
  h.core.frame=()=>damaged;const before=out.port.writeRecords().length;h.page.sync();
  assert.equal(out.target.status().armed,false);assert.equal(out.target.status().controlParked,false);assert.equal(out.port.writeRecords().length,before);
  h.core.frame=originalFrame;await pageTick(h);assert.equal(out.target.status().armed,false);
 }finally{await cleanPage(h);}
});

test('review 0.19 Index: malformed source error after completed active continuity revokes Arm permanently',async()=>{
 const h=await readyPage();h.page.inputNow=()=>h.time.now;
 try{
  const out=await addTarget(h);h.page.armOutput(out.id);await pageTick(h);await h.page.setPlaybackSpeed(2);
  h.time.now+=40;h.ports[0].receive(packet({currentTime:1.08,playbackSpeed:2}));h.time.now+=40;h.ports[0].receive(packet({currentTime:1.16,playbackSpeed:2}));await pageTick(h);
  assert.equal(out.target.status().armed,true);assert.equal(out.target.status().controlPending,false);
  h.time.now+=20;h.ports[0].receive('{');assert.notEqual(h.source.snapshot().diagnostic,null);
  assert.equal(out.target.status().armed,false,'a source parse error must not fall through to old normal-frame permission');
  h.time.now+=20;h.ports[0].receive(packet({currentTime:1.24,playbackSpeed:2}));await pageTick(h);assert.equal(out.target.status().armed,false);
 }finally{await cleanPage(h);}
});

for(const state of [2,-1])test(`review 0.19 Index: raw ${state} notice belongs only to the current active connected foreground source`,async()=>{
 const h=await readyPage();h.page.inputNow=()=>h.time.now;
 try{
  const out=await addTarget(h);h.page.armOutput(out.id);await pageTick(h);const ordinary=h.source.snapshot();
  const unsupported={...ordinary,playerState:state,playing:false};
  for(const ignored of ['old-generation','background','inactive','disconnected']){
   h.page.status='Newer owner status';const currentActive=h.page.deoVrActive,currentForeground=h.page.foreground;
   if(ignored==='background')h.page.foreground=false;if(ignored==='inactive')h.page.deoVrActive=false;
   h.page.deoVrSnapshot({...unsupported,generation:ignored==='old-generation'?ordinary.generation-1:ordinary.generation,status:ignored==='disconnected'?'disconnected':'connected'},[]);
   assert.equal(h.page.status,'Newer owner status',ignored+' must not publish an unsupported-state notice');
   h.page.deoVrActive=currentActive;h.page.foreground=currentForeground;
  }
  h.page.deoVrSnapshot(ordinary,[]);h.page.status='Current normal state';
  h.time.now+=40;h.ports[0].receive(packet({currentTime:1.08,playerState:state}));assert.match(h.page.status,/非普通播放\/暂停状态/);assert.equal(out.target.status().armed,false);
  const currentUnsupported=h.source.snapshot();h.page.stop();const stopped=h.page.status;h.page.deoVrSnapshot(currentUnsupported,[]);assert.equal(h.page.status,stopped);
 }finally{await cleanPage(h);}
});
