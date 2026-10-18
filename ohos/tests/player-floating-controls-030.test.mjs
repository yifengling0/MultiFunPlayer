import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {setupIndex} from './index-controller-helpers.mjs';
import {applicationWorkspaceLayout} from '../entry/src/main/ets/core/VideoLayout.ts';
const source=fs.readFileSync(new URL('../entry/src/main/ets/pages/Index.ets',import.meta.url),'utf8');
for(const [w,h] of [[1,1],[240,320],[320,568],[390,844],[844,390],[768,1024],[1024,768],[1920,1080]])for(const screen of ['library','workspace','player'])for(const floating of [false,true])test(`preview bounds ${w}x${h} ${screen} floating=${floating}`,()=>{
 const a=applicationWorkspaceLayout(w,h,screen,true,false,'auto',floating);
 for(const r of [a.video,a.settings,a.trace]) assert.ok(r.x>=0&&r.y>=0&&r.width>=0&&r.height>=0&&r.x+r.width<=w+0.001&&r.y+r.height<=h+0.001,JSON.stringify(r));
 assert.ok(a.controlsHeight<=a.video.height);
 if(w>=240&&h>=320)assert.ok(a.video.width>0&&a.video.height>a.controlsHeight);
});
test('floating and fullscreen controls never reopen, seek, connect, arm or change playback position',()=>{
 const {page,calls}=setupIndex(); page.videoMode=true;page.viewActive=true;page.foreground=true;page.currentScreen='workspace';page.surfaceId='stable';page.positionMs=12500;page.playing=true;
 const n=calls.length;
 for(let i=0;i<10;i++){page.setVideoFloating(true);page.setVideoFloating(false);page.setVideoFullscreen(true);page.videoControlsVisible = true;page.scheduleVideoChromeHide();page.videoControlsVisible = true;page.scheduleVideoChromeHide();page.setVideoFullscreen(false);}
 assert.equal(page.surfaceId,'stable');assert.equal(page.positionMs,12500);assert.equal(page.playing,true);
 assert.ok(!calls.slice(n).some(c=>['video','release','seek','nativePlay','enginePlay','arm','connect'].includes(c[0])));
});
test('fullscreen starts clean; revealed chrome follows its playing timer, timer hides playing controls and exit cancels timer',(t)=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const {page}=setupIndex({setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout});Object.assign(page,{videoMode:true,viewActive:true,foreground:true,playing:true});
 page.setVideoFullscreen(true);assert.equal(page.videoControlsVisible,false);
 page.videoControlsVisible = true;page.scheduleVideoChromeHide();assert.equal(page.videoControlsVisible,true);assert.equal(page.playing,true);
 t.mock.timers.tick(3500);assert.equal(page.videoControlsVisible,false);
 page.videoControlsVisible = true;page.scheduleVideoChromeHide();page.setVideoFullscreen(false);t.mock.timers.tick(4000);assert.equal(page.videoControlsVisible,true);
});
test('paused, background and replaced fullscreen epochs cannot hide the current controls',(t)=>{
 t.mock.timers.enable({apis:['setTimeout']});const {page}=setupIndex({setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout});Object.assign(page,{videoMode:true,viewActive:true,foreground:true,playing:false});
 page.setVideoFullscreen(true);page.videoControlsVisible = true;page.scheduleVideoChromeHide();t.mock.timers.tick(3500);assert.equal(page.videoControlsVisible,true);
 page.playing=true;page.scheduleVideoChromeHide();page.foreground=false;t.mock.timers.tick(3500);assert.equal(page.videoControlsVisible,true);
 page.foreground=true;page.setVideoFullscreen(false);page.setVideoFullscreen(true);page.videoControlsVisible = true;page.scheduleVideoChromeHide();page.cancelVideoChromeTimer();t.mock.timers.tick(4000);assert.equal(page.videoControlsVisible,true);
});
test('scroll shrinks the same surface and player heatmap uses the same document/axis/position',()=>{
 assert.equal((source.match(/XComponent\(\{/g)||[]).length,1);
 assert.match(source,/this.drawTraceInto\(this.canvas\); this.drawTraceInto\(this.playerCanvas\)/);
 const painter=source.slice(source.indexOf('  drawTraceInto('),source.indexOf('  @Builder\n  heading'));
 for(const value of ['this.engine.displayDocument()','this.selectedAxis','this.positionMs','this.durationMs'])assert.ok(painter.includes(value));
 assert.equal((source.match(/currentOffset\(\).yOffset > 96/g)||[]).length,0);
 const stage=source.slice(source.indexOf('  videoStage()'),source.indexOf('  workspaceSettings()'));
 assert.match(stage,/this.videoPictureHeight\(\)/);assert.match(stage,/videoGestureHandler/);
 assert.match(stage,/SliderChangeMode.End.*SliderChangeMode.Click.*scheduleVideoChromeHide/);
});

test('wide preview reserves complete heatmap/transport chrome at short and tall sizes',()=>{
 for(const [w,h] of [[900,380],[1000,800],[1920,1080]]){
 const a=applicationWorkspaceLayout(w,h,'workspace',true,false);
 assert.ok(a.controlsHeight>=88);if(a.video.height>=240)assert.ok(a.controlsHeight>=136);
 }
});
test('actual heatmap painter advances cursor and rebuilds after axis, seek duration and document changes',async()=>{
 const {stripTypeScriptTypes}=await import('node:module');const {Heatmap}=await import('../entry/src/main/ets/core/Heatmap.ts');
 const body=source.slice(source.indexOf('  drawTrace(): void'),source.indexOf('  @Builder\n  heading'));
 const Painter=new Function('Heatmap','UiStyle',stripTypeScriptTypes('class Painter {'+body+'};')+'return Painter;')(Heatmap,{ink:'#111'});
 function context(){return {width:300,height:36,lines:[],clearRect(){this.lines=[];},fillRect(){},save(){},restore(){},beginPath(){},moveTo(x,y){this.lines.push([x,y]);},lineTo(x,y){this.lines.push([x,y]);},rect(){},closePath(){},clip(){},stroke(){}};}
 const p=new Painter();let document={axes:[{name:'L0',actions:[{at:0,pos:0},{at:1000,pos:100}]},{name:'L1',actions:[{at:0,pos:20},{at:1000,pos:40}]}]};
 Object.assign(p,{canvas:context(),playerCanvas:context(),engine:{displayDocument:()=>document},durationMs:1000,positionMs:250,selectedAxis:0,axisNames:['L0','L1'],heatCombine:false,heatShowRange:true,heatInvert:false});
 p.drawTrace();assert.equal(p.playerCanvas.lines.at(-1)[0],75);assert.deepEqual(p.canvas.lines,p.playerCanvas.lines);const first=p.heatBuckets;
 p.positionMs=750;p.drawTrace();assert.equal(p.playerCanvas.lines.at(-1)[0],225);assert.equal(p.heatBuckets,first);
 p.selectedAxis=1;p.drawTrace();assert.notEqual(p.heatBuckets,first);assert.equal(p.heatAxis,1);
 p.durationMs=2000;p.positionMs=1000;p.drawTrace();assert.equal(p.playerCanvas.lines.at(-1)[0],150);
 document={axes:[]};p.drawTrace();assert.equal(p.heatDocument,document);assert.ok(p.heatBuckets.every(b=>b.heat===0));
});
