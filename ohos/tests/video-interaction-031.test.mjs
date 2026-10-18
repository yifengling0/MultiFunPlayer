import test from 'node:test';
import assert from 'node:assert/strict';
import {setupIndex} from './index-controller-helpers.mjs';
import {VideoDragBounds,VideoDragSession,videoPlaybackIntent} from '../entry/src/main/ets/core/VideoInteraction.ts';
import {MediaClockSnapshot} from '../entry/src/main/ets/core/MediaClock.ts';
const {PlaybackSessionCore}=await import('../entry/src/main/ets/core/PlaybackSessionCore.ts');
const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function fixture(){const f=setupIndex();Object.assign(f.page,{videoMode:true,videoReady:true,positionMs:100,durationMs:10000,surfaceId:'one',currentScreen:'workspace'});f.page.engine.play=()=>{f.calls.push(['enginePlay']);return true;};f.page.video.pause=async()=>f.calls.push(['nativePause']);return f;}
test('shared classifier permits safe pause during refresh/fault while blocking start, preparation and pending actions',()=>{
 for(const blocked of [true,false])assert.equal(videoPlaybackIntent(true,false,false,false,true,false,blocked),'pause');
 assert.equal(videoPlaybackIntent(false,true,false,false,true,false,true),'pause');
 assert.equal(videoPlaybackIntent(false,false,true,true,true,false,false),'replay');
 assert.equal(videoPlaybackIntent(false,false,true,false,true,false,false),'play');
 for(const [ready,available,pending,blocked] of [[false,true,false,false],[true,false,false,false],[true,true,true,false],[true,true,false,true]])assert.equal(videoPlaybackIntent(false,false,ready,false,available,pending,blocked),'blocked');
});
test('actual picture tap and floating button use the same action and do not toggle on a drag',async()=>{
 const {page,calls,state}=fixture();page.videoFloating=true;
 page.videoGestureHandler('tap')({});await settle();assert.equal(calls.filter(c=>c[0]==='nativePlay').length,1);
 page.playing=true;page.libraryBusy=true;page.videoGestureHandler('tap')({});await settle();assert.ok(calls.some(c=>c[0]==='nativePause'));
 page.libraryBusy=false;const n=calls.length;
 const start=page.videoGestureHandler('start'),move=page.videoGestureHandler('update'),end=page.videoGestureHandler('end'),tap=page.videoGestureHandler('tap');
 start({offsetX:-8,offsetY:-8});move({offsetX:-80,offsetY:-200});end({offsetX:-80,offsetY:-200});tap({});await settle();
 assert.equal(calls.length,n);assert.ok(page.floatingYRatio<1);assert.ok(page.floatingXRatio<1);
 state.now=200;tap({});await settle();assert.ok(calls.length>n);
});
test('drag uses total offsets, threshold, clamp and normalized persistence across phone rotation',()=>{
 const d=new VideoDragSession(),b=new VideoDragBounds(390,844,202,202,60);d.begin(b.x(1),b.y(1));assert.equal(d.move(3,4,b),false);assert.equal(d.move(-20,-20,b),true);const x=d.xRatio;d.move(-20,-20,b);assert.equal(d.xRatio,x);
 d.move(-10000,-10000,b);assert.equal(d.xRatio,0);assert.equal(d.yRatio,0);d.move(10000,10000,b);assert.equal(d.xRatio,1);assert.equal(d.yRatio,1);
 const other=new VideoDragBounds(844,390,300,250,60);assert.ok(other.y(d.yRatio)+250<=390);d.cancel();assert.equal(d.move(20,20,b),false);
});
for(const boundary of ['resize','screen','source','background','fullscreen'])test('captured picture/drag callbacks reject '+boundary,async()=>{
 const {page,calls}=fixture();page.videoFloating=true;const start=page.videoGestureHandler('start'),tap=page.videoGestureHandler('tap');const n=calls.length;
 if(boundary==='resize')page.resizeWorkspace(600,500);if(boundary==='screen')page.screenRevision++;if(boundary==='source')page.openVideoRequest++;if(boundary==='background')page.foreground=false;if(boundary==='fullscreen')page.videoFullscreen=true;
 const before=calls.length;start({offsetX:20,offsetY:20});tap({});await settle();assert.equal(calls.length,before);assert.equal(page.videoDragging,false);
});
test('native video observations retain actual playing/time even when the output engine gate is closed',()=>{
 const {page}=fixture();page.engine=new PlaybackSessionCore();page.engine.setForeground(true);page.engine.setConnected(true);page.engine.useExternalClock(true);
 const s=new MediaClockSnapshot();Object.assign(s,{generation:7,ready:true,valid:true,playing:true,state:'playing',durationMs:10000,positionMs:1234,safetyGateOpen:false,observationSequence:1,observedMonotonicMs:0});
 page.videoSnapshot(s);assert.equal(page.observedVideo,s);assert.equal(page.engine.snapshot().state==='playing',false);
 // setup intentionally replaces sync; execute the production selector through its actual prototype.
 page.syncPlaylist=()=>{};page.syncOutput=()=>{};page.drawTrace=()=>{};page.syncErrorPresentation=()=>{};
 page.syncPlaybackDisplay(false,0,0);assert.equal(page.playing,true);assert.equal(page.positionMs,1234);assert.equal(page.durationMs,10000);
 const stale=new MediaClockSnapshot();stale.generation=6;page.videoSnapshot(stale);assert.equal(page.observedVideo,s);
});
test('rapid click while a native command is pending issues one command; Stop revokes the completion',async()=>{
 const {page,calls}=fixture();let resolve;page.video.play=()=>new Promise(r=>{resolve=r;calls.push(['nativePlay']);});
 const first=page.videoPlaybackAction();await settle();await page.videoPlaybackAction();assert.equal(calls.filter(c=>c[0]==='nativePlay').length,1);assert.equal(page.videoActionPending,true);
 page.stop();const epoch=page.videoActionEpoch;resolve();await first;assert.equal(page.videoActionPending,false);assert.equal(page.videoActionEpoch,epoch);assert.equal(page.mediaPlayIntent,false);
});
test('explicit completed replay requests guarded seek/resume, never a native reopen',async()=>{
 const {page,calls}=fixture();page.positionMs=page.durationMs-100;page.videoState='completed';page.mediaPlayIntent=true;page.seekTransport=(pos,preserve)=>calls.push(['seekTransport',pos,preserve,page.mediaPlayIntent]);await page.videoPlaybackAction();assert.deepEqual(calls.find(c=>c[0]==='seekTransport'),['seekTransport',0,true,true]);assert.ok(!calls.some(c=>['video','release','nativePlay'].includes(c[0])));
});

for (const nativeState of ['completed','paused']) test('actual replay seek retains resume until confirmation from '+nativeState,async()=>{
 const {page,calls}=fixture();page.positionMs=nativeState==='completed'?9900:10000;page.videoState=nativeState;page.playing=false;page.mediaPlayIntent=false;
 page.engine.sourceSeekSnapshot=()=>null;page.engine.beginSeek=()=>42;page.output.beginSourceSeek=()=>calls.push(['beginSeek']);page.video.seek=pos=>calls.push(['nativeSeek',pos]);
 await page.videoPlaybackAction();assert.equal(page.resumeSeekRequest,42);assert.deepEqual(calls.find(c=>c[0]==='nativeSeek'),['nativeSeek',0]);assert.ok(!calls.some(c=>c[0]==='nativePlay'));
 page.stop();assert.equal(page.resumeSeekRequest,-1);assert.equal(page.mediaPlayIntent,false);
});
