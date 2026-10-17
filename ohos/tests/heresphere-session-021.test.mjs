import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);}});
const {PlaybackSessionCore}=await import('../entry/src/main/ets/core/PlaybackSessionCore.ts');
const {SettingsSchema}=await import('../entry/src/main/ets/settings/SettingsSchema.ts');
const {FunscriptParser}=await import('../entry/src/main/ets/core/Funscript.ts');
const {HereSphereMediaSource}=await import('../entry/src/main/ets/media/heresphere/HereSphereMediaSource.ts');
const {deoVrScriptMatchHint}=await import('../entry/src/main/ets/media/deovr/DeoVrScriptMatch.ts');
const {RemoteMediaClock}=await import('../entry/src/main/ets/core/RemoteMediaClock.ts');
const doc=FunscriptParser.parse('{"actions":[{"at":0,"pos":10},{"at":100000,"pos":90}]}');
function frame(packet){const body=Buffer.from(JSON.stringify(packet));const bytes=Buffer.alloc(body.length+4);bytes.writeInt32LE(body.length);body.copy(bytes,4);return bytes;}
async function setup(){
 let now=100,sink,seq=0;const tasks=new Map();const sent=[];
 const cfg=SettingsSchema.defaults();for(const k of Object.keys(cfg.sync))if(k.startsWith('sync'))cfg.sync[k]=false;
 const core=new PlaybackSessionCore(cfg);core.setConnected(true);
 const source=new HereSphereMediaSource({create(_ep,_gen,s){sink=s;return {async connect(){},async send(b){sent.push(b.slice());},detach(){},async close(){}};}},
 {nowMs:()=>now,scheduleAt(_t,f){tasks.set(++seq,f);return seq;},cancel(id){tasks.delete(id);}});
 source.subscribe((s,events)=>{if(s.status==='connecting')core.useDeoVrSource(s.generation,'heresphere');core.acceptDeoVrSnapshot(s,events);});
 await source.connect({host:'fixture.test',port:23554,family:1});
 const feed=(packet,at=now)=>{now=at;sink.received(frame(packet));};
 const bind=()=>{const s=source.snapshot();return core.loadDeoVrBindings(s.generation,s.resourceRevision,doc,core.resources(doc,'managed-script','fixture'),'heresphere');};
 const tick=(at=now+40)=>{core.tick(at-(core.frame().monotonicMs||0),at);now=at;};
 return {core,source,sent,feed,bind,tick,setNow:v=>now=v};
}
const packet=(time=1,extra={})=>({path:'C:\\media\\film.mp4',playerState:0,duration:100,currentTime:time,playbackSpeed:1,...extra});

test('HereSphere: remote actual receipts anchor original tracker; snapshots and command receipts never advance it',async()=>{
 const s=await setup();s.feed(packet());assert.equal(s.core.mediaPositionSeconds(),1);s.bind();s.tick(140);
 assert.ok(Math.abs(s.core.mediaPositionSeconds()-1.14)<1e-12);const first=s.core.dispatchSource(['L0']);assert.equal(first.authorization.observedMonotonicMs,100);
 const position=s.core.mediaPositionSeconds();for(let i=0;i<20;i++)s.source.snapshot();await s.source.seek(80);assert.equal(s.core.mediaPositionSeconds(),position);
 assert.equal(s.core.sourceSeekSnapshot(),null);assert.equal(s.core.dispatchSource(['L0']).authorization.observedMonotonicMs,100);
});

test('HereSphere: same raw position refreshes receipt only; after750ms no continued internal integration/authorization',async()=>{
 const s=await setup();s.feed(packet());s.bind();s.tick(140);
 for(let t=180;t<=820;t+=40){s.feed(packet(),t);s.tick(t);}
 const last=s.core.mediaPositionSeconds();s.feed(packet(),900);s.tick(900);
 assert.equal(s.core.snapshot().state,'paused');assert.equal(s.core.mediaPositionSeconds(),last);assert.equal(s.core.dispatchSource(['L0']).authorization,null);
 s.feed(packet(2),940);s.tick(980);assert.equal(s.core.snapshot().state,'playing');assert.ok(s.core.dispatchSource(['L0']).authorization);
});

test('HereSphere: Stop cannot be undone by packets, pause, script completion, or a command send',async()=>{
 const s=await setup();s.feed(packet());s.bind();s.tick(140);s.core.stop();
 s.feed(packet(2),180);s.core.pause();s.tick(220);assert.equal(s.core.dispatchSource(['L0']).authorization,null);
 assert.equal(s.bind(),false);await s.source.playPause(true);s.feed(packet(3),260);s.tick(300);assert.equal(s.core.dispatchSource(['L0']).authorization,null);
 assert.equal(s.core.admitDeoVrPlay(),true);s.feed(packet(3.04),340);s.bind();s.tick(380);assert.ok(s.core.dispatchSource(['L0']).authorization);
});

test('HereSphere: remote seek advances epoch and has no resumable native transition or optimistic target',async()=>{
 const s=await setup();s.feed(packet());s.bind();s.tick(140);const old=s.core.frame();const before=s.core.mediaPositionSeconds();
 assert.equal(s.core.beginDeoVrSeek(),true);assert.equal(s.core.mediaPositionSeconds(),before);assert.equal(s.core.sourceSeekSnapshot(),null);
 await s.source.seek(80);s.tick(180);assert.equal(s.core.dispatchSource(['L0']).authorization,null);
 s.feed(packet(80),220);s.tick(260);assert.ok(s.core.frame().epoch>old.epoch);assert.ok(s.core.dispatchSource(['L0']).authorization);
 assert.equal(s.core.sourceSeekSnapshot(),null);
});

test('HereSphere: new path never adopts prior duration/state proof; stale binding completion refused',async()=>{
 const s=await setup();s.feed(packet());const old=s.source.snapshot();s.bind();s.tick(140);
 s.feed({path:'C:\\new\\second.mp4',currentTime:1},180);s.bind();s.tick(220);assert.equal(s.core.dispatchSource(['L0']).authorization,null);
 assert.equal(s.core.loadDeoVrBindings(old.generation,old.resourceRevision,doc,s.core.resources(doc,'old','old'),'heresphere'),false);
 s.feed(packet(1,{path:'C:\\new\\second.mp4'}),260);s.tick(300);assert.ok(s.core.dispatchSource(['L0']).authorization);
});

test('HereSphere: pending source match suppresses old frame until actual owned bindings and subsequent tick',async()=>{
 const s=await setup();s.feed(packet());s.tick(140);assert.equal(s.core.dispatchSource(['L0']).availability,'pendingCurrentFrame');
 s.bind();assert.equal(s.core.dispatchSource(['L0']).authorization,null);s.tick(180);assert.ok(s.core.dispatchSource(['L0']).authorization);
});

test('HereSphere: pause command gates until actual paused state; actual position event retains original paused smoothing',async()=>{
 const s=await setup();s.feed(packet(10));s.bind();s.tick(140);s.core.requestDeoVrPause();
 s.feed(packet(10.1),180);s.tick(220);assert.equal(s.core.snapshot().state,'paused');assert.equal(s.core.dispatchSource(['L0']).authorization,null);
 s.feed(packet(10.2,{playerState:1}),260);const p=s.core.mediaPositionSeconds();s.tick(300);assert.equal(s.core.mediaPositionSeconds(),p);
});

test('HereSphere: background or disconnected generation cannot regain remote admission',async()=>{
 const s=await setup();s.feed(packet());s.bind();s.tick(140);s.core.setForeground(false);s.feed(packet(2),180);s.core.setForeground(true);s.tick(220);
 assert.equal(s.core.dispatchSource(['L0']).authorization,null);await s.source.disconnect();assert.equal(s.core.admitDeoVrPlay(),false);
});

test('HereSphere: remote hint parsing never creates an openable remote path and retains bounded matching name',()=>{
 for(const [path,name] of [['C:\\media\\film.mp4','film.mp4'],['https://site.test/folder/movie%20one.mp4?secret#frag','movie one.mp4'],['https://site.test/a%2Ffilm.mp4','film.mp4'],['/media/film.mp4','film.mp4']]){
  const hint=deoVrScriptMatchHint(path);assert.equal(hint.name,name);assert.equal(hint.uri,'deovr-metadata-hint');assert.equal(hint.relativePath,name);
 }
 for(const path of ['', '..','/', 'https://site.test', 'https://site.test/%00.mp4','https://site.test/%x.mp4','x'.repeat(4097)])assert.throws(()=>deoVrScriptMatchHint(path));
});

test('HereSphere: remote source cannot enter independent manual/Motion preview; explicit runtime reset retires remote admission',async()=>{
 const s=await setup();
 assert.throws(()=>s.core.startStandaloneMotion(),/Close the media/);
 assert.throws(()=>s.core.startManualPreview(),/Close media/);
 s.core.resetRuntime();assert.equal(s.core.isDeoVrSource(),false);
 s.feed(packet(),180);s.tick(220);assert.equal(s.core.dispatchSource(['L0']).authorization,null);
});

test('HereSphere: generic explicit Play on a remote source waits for a subsequent real receipt instead of inventing script time',async()=>{
 const s=await setup();s.feed(packet());s.bind();s.tick(140);s.core.stop();
 assert.equal(s.core.play(),true);s.tick(180);assert.equal(s.core.snapshot().state,'paused');assert.equal(s.core.dispatchSource(['L0']).authorization,null);
 s.feed(packet(2),220);s.bind();s.tick(260);assert.equal(s.core.snapshot().state,'playing');assert.ok(s.core.dispatchSource(['L0']).authorization);
});


test('HereSphere: equal generation/resource from another source cannot alter clock, load bindings or borrow continuity',async()=>{
 const s=await setup();s.feed(packet());assert.equal(s.bind(),true);s.tick(140);
 const before=s.core.mediaPositionSeconds();const current=s.source.snapshot();
 const foreign={...current,sourceKind:'deovr',positionSeconds:90,resourceRevision:current.resourceRevision+1,eventSequence:current.eventSequence+1};
 s.core.acceptDeoVrSnapshot(foreign,[{kind:'position',generation:foreign.generation,resourceRevision:foreign.resourceRevision,sequence:foreign.eventSequence,value:90,receivedAtMs:150}],150);
 assert.equal(s.core.mediaPositionSeconds(),before);
 assert.equal(s.core.loadDeoVrBindings(current.generation,current.resourceRevision,doc,s.core.resources(doc,'old-deovr','fixture'),'deovr'),false);
 assert.equal(s.core.beginDeoVrControl({kind:'pause'},foreign,150),null);
 const oldEpoch=s.core.frame().epoch;s.core.useDeoVrSource(current.generation,'deovr');
 s.core.acceptDeoVrSnapshot(current,[],160);s.core.tick(40,180);
 assert.equal(s.core.dispatchSource(['L0']).authorization,null);assert.ok(s.core.frame().epoch>oldEpoch);
 assert.equal(s.core.loadDeoVrBindings(current.generation,current.resourceRevision,doc,[],'heresphere'),false);
 await s.source.disconnect();
});
test('HereSphere: remote resource is only a catalog hint, not the legacy path or scene URI',async()=>{
 const s=await setup();s.feed({...packet(),resource:'https://metadata.invalid/folder/film.mp4',path:'wrong.mp4',identifier:'https://metadata.invalid/scene/123'});
 assert.equal(s.source.snapshot().path,'https://metadata.invalid/folder/film.mp4');
 const hint=deoVrScriptMatchHint(s.source.snapshot().path,'heresphere');assert.equal(hint.uri,'heresphere-metadata-hint');assert.equal(hint.name,'film.mp4');
 s.bind();s.tick(140);assert.ok(s.core.dispatchSource(['L0']).authorization);
 s.feed({...packet(2),resource:'  ',path:'fallback-must-not-run.mp4'},180);s.tick(220);assert.equal(s.source.snapshot().path,null);assert.equal(s.core.dispatchSource(['L0']).authorization,null);
 await s.source.disconnect();
});
