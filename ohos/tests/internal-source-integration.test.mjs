import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s,c,n) { return n(s.startsWith('.') && !/\.[a-z]+$/i.test(s) ? s+'.ts' : s,c); } });
const {PlaybackSessionCore}=await import('../entry/src/main/ets/core/PlaybackSessionCore.ts');
const {FunscriptParser}=await import('../entry/src/main/ets/core/Funscript.ts');
const {InternalSourceLibrary}=await import('../entry/src/main/ets/core/playback/InternalSourceLibrary.ts');
const {InternalPlaylist}=await import('../entry/src/main/ets/core/playback/InternalPlaylist.ts');
const {ResourceLibrary,ResourceFileEntry}=await import('../entry/src/main/ets/core/ResourceLibrary.ts');
const {SettingsSchema}=await import('../entry/src/main/ets/settings/SettingsSchema.ts');
const {MediaClockSnapshot}=await import('../entry/src/main/ets/core/MediaClock.ts');
const json=JSON.stringify({actions:[{at:0,pos:10},{at:1000,pos:90}]});
const doc=FunscriptParser.parse(json);
function core(){const c=new PlaybackSessionCore(); c.setConnected(true);return c;}
function internal(){const c=core();c.useInternalSource();c.beginInternalResource('a.funscript');c.acceptDurationMessage(1,0);c.acceptInternalPosition(0,true);c.loadInternalBindings(doc,c.resources(doc,'a','a'));return c;}
test('Internal direct single axis ignores filename hint per original isUnnamedScript:true; companions restore axis suffix',()=>{
 const profile=SettingsSchema.defaults().devices[0], file=new ResourceFileEntry('opaque:readable','a.roll.funscript','folder/a.roll.funscript');
 const candidate=ResourceLibrary.parseCandidate(json,file,profile);
 assert.deepEqual(InternalSourceLibrary.selectSingle(candidate,profile).document.axes.map(a=>a.name),['L0']);
 assert.equal(InternalSourceLibrary.companionMedia(file,profile).name,'a.funscript');
 assert.equal(InternalSourceLibrary.companionMedia(file,profile).relativePath,'folder/a.funscript');
 const selected=ResourceLibrary.selectDocuments('a.funscript',[candidate],profile);assert.equal(selected.document.axes[0].name,'R1');
});
test('catalog exact association never authorizes persisted URI, traversal, absent or ambiguous file',()=>{
 const p=SettingsSchema.defaults().devices[0],lib=new InternalSourceLibrary(),f=new ResourceFileEntry('authorized://file','a.funscript','nested/a.funscript');lib.replace([f],p);
 assert.equal(lib.resolve('nested/a.funscript').uri,'authorized://file');for(const id of ['../a.funscript','authorized://file','Nested/a.funscript'])assert.equal(lib.resolve(id),undefined);
 const missing=lib.item('missing.funscript');assert.equal(missing.exists,false);assert.ok(Number.isNaN(missing.durationSeconds));
 lib.recordDuration('nested/a.funscript',3);const item=lib.item('nested/a.funscript');assert.equal(item.durationSeconds,3);
 lib.replace([f,new ResourceFileEntry('other','a.funscript','nested/a.funscript')],p);lib.refresh(item);assert.equal(item.exists,false);assert.ok(Number.isNaN(item.durationSeconds));
});
test('duration→forced position→load preserves internal clock and original strict end ownership',()=>{
 const c=internal();c.acceptInternalPlaying(true);c.tick(1000,1000);
 assert.equal(c.snapshot().positionMs,1000);assert.equal(c.snapshot().state,'playing');
 c.tick(100,1100);assert.equal(c.snapshot().state,'playing');assert.equal(c.snapshot().positionMs,1100);
 c.acceptInternalPlaying(false);c.acceptInternalPosition(1,true);c.tick(40,1140);assert.equal(c.snapshot().state,'paused');assert.equal(c.snapshot().positionMs,1000);
});
test('duration auto skip coalesces leading edge and uses latest loaded first-bound resource',()=>{
 const c=internal(); const late=FunscriptParser.parse(JSON.stringify({actions:[{at:0,pos:0},{at:8000,pos:0},{at:9000,pos:100}]}));
 c.acceptDurationMessage(9,0);c.acceptDurationMessage(9,600);c.loadInternalBindings(late,c.resources(late,'late','late'));c.acceptInternalPlaying(false);
 c.tick(999,999);assert.deepEqual(c.drainMediaSeekRequests(),[]);c.tick(1,1000);assert.deepEqual(c.drainMediaSeekRequests(),[3000]);
 c.tick(1000,2000);assert.deepEqual(c.drainMediaSeekRequests(),[]);
});
test('AB runs while paused, seeks only through host queue and clears at original seek tolerance',()=>{
 const c=internal();c.acceptInternalPlaying(false);c.mediaLoop.setLoop(.2,.8,1);c.acceptInternalPosition(.9,true);c.tick(100,100);
 assert.deepEqual(c.drainMediaSeekRequests(),[200]);assert.equal(c.snapshot().positionMs,900);
 c.acceptInternalPosition(1.8,true);assert.equal(c.mediaLoop.isValid,false);
});
test('Internal explicit seek token requires current source and forced confirmation; source switch cancels',()=>{
 const c=internal();c.acceptInternalPlaying(true);c.tick(40,40);const prior=c.frame().epoch;
 const token=c.beginSeek(40);assert.ok(token>0);assert.equal(c.sourceSeekSnapshot().status,'pending');assert.equal(c.sourceSeekSnapshot().previousEpoch,prior);
 c.acceptInternalPosition(.5,true);assert.equal(c.sourceSeekSnapshot().status,'confirmed');assert.ok(c.sourceSeekSnapshot().currentEpoch>prior);
 c.acceptInternalPlaying(true);c.tick(40,80);assert.equal(c.dispatchSource(['L0']).frame.epoch,c.sourceSeekSnapshot().currentEpoch);
 c.beginInternalResource('b.funscript');assert.equal(c.sourceSeekSnapshot().status,'cancelled');
});
test('native seek proof needs actual fresh seekSequence, same native generation and deadline; stop/config revoke',()=>{
 function setup(){const c=core();c.load(doc);c.useExternalClock(true);const s=new MediaClockSnapshot();Object.assign(s,{generation:5,ready:true,valid:true,durationMs:1000,observationSequence:1,observedMonotonicMs:0});c.acceptNativeSnapshot(s);c.play();Object.assign(s,{playing:true,safetyGateOpen:true,observationSequence:2,observedMonotonicMs:40});c.acceptNativeSnapshot(s);c.tick(40,40);return{c,s};}
 let {c,s}=setup();c.beginSeek(40);c.acceptNativeSnapshot(s);assert.equal(c.sourceSeekSnapshot().status,'pending');Object.assign(s,{seekSequence:1,observationSequence:3,observedMonotonicMs:50,positionMs:500,playing:false,safetyGateOpen:false});c.acceptNativeSnapshot(s);assert.equal(c.sourceSeekSnapshot().status,'confirmed');
 ({c,s}=setup());c.beginSeek(40);c.stop();Object.assign(s,{seekSequence:1,observationSequence:3,positionMs:500});c.acceptNativeSnapshot(s);assert.equal(c.sourceSeekSnapshot().status,'cancelled');
 ({c,s}=setup());c.beginSeek(40);c.setAxisScale('L0',.5);assert.equal(c.sourceSeekSnapshot().status,'cancelled');
 ({c,s}=setup());c.beginSeek(40);c.tick(5001,5041);Object.assign(s,{seekSequence:1,observationSequence:3,positionMs:500,observedMonotonicMs:5041});c.acceptNativeSnapshot(s);assert.equal(c.sourceSeekSnapshot().status,'cancelled');
});

test('Internal ChangeScript keeps original AB seek tolerance and leading-edge AutoSkip across duration messages',()=>{
 const c=internal();c.acceptInternalPlaying(false);c.mediaLoop.setLoop(0,.8,1);
 c.tick(500,500);c.beginInternalResource('b.funscript');c.acceptDurationMessage(10,500);c.acceptInternalPosition(0,true);
 const late=FunscriptParser.parse(JSON.stringify({actions:[{at:0,pos:0},{at:8000,pos:0},{at:10000,pos:100}]}));c.loadInternalBindings(late,c.resources(late,'b','b'));c.acceptInternalPlaying(false);
 assert.equal(c.mediaLoop.isValid,true);c.tick(500,1000);assert.deepEqual(c.drainMediaSeekRequests(),[3000],'first duration owns 1s delay; new duration reads latest resources');
});
