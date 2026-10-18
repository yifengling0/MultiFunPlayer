import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {core} from './source-root.mjs';
const {videoPlaybackIntent,VideoDragBounds,VideoDragSession}=await import(new URL('VideoInteraction.ts',core));
const {applicationWorkspaceLayout}=await import(new URL('VideoLayout.ts',core));
test('shared production intent handles playing pause even when new starts blocked',()=>assert.equal(videoPlaybackIntent(true,true,true,false,true,false,true),'pause'));
test('shared production intent blocks unavailable, pending and unready starts',()=>{assert.equal(videoPlaybackIntent(false,false,true,false,false,false,false),'blocked');assert.equal(videoPlaybackIntent(false,false,true,false,true,true,false),'blocked');assert.equal(videoPlaybackIntent(false,false,false,false,true,false,false),'blocked')});
test('shared production intent replays ended and plays ready',()=>{assert.equal(videoPlaybackIntent(false,false,true,true,true,false,false),'replay');assert.equal(videoPlaybackIntent(false,false,true,false,true,false,false),'play')});
test('shared production drag threshold, clamping and cancellation',()=>{const b=new VideoDragBounds(400,760,208,205,60),d=new VideoDragSession();d.begin(184,547);assert.equal(d.move(3,4,b),false);assert.equal(d.move(-80,-100,b),true);assert.ok(b.x(d.xRatio)<184);d.move(-10000,-10000,b);assert.equal(b.x(d.xRatio),b.minX);assert.equal(b.y(d.yRatio),b.minY);d.cancel();assert.equal(d.move(10,10,b),false)});
test('shared layout bounds on phone, tablet, landscape, float and fullscreen',()=>{for(const [w,h] of [[400,760],[1100,700],[568,320]])for(const floating of [true,false])for(const full of [true,false]){const r=applicationWorkspaceLayout(w,h,full?'player':'workspace',true,full,'auto',floating).video;assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=w&&r.y+r.height<=h)}});
test('standalone artifact embeds exact current shared production source hashes',()=>{const manifest=JSON.parse(readFileSync(new URL('manifest.json',import.meta.url)));const html=readFileSync(new URL('standalone.html',import.meta.url),'utf8');for(const m of manifest){const src=readFileSync(new URL(m.name+'.ts',core));assert.equal(createHash('sha256').update(src).digest('hex'),m.sha256);assert.ok(html.includes(m.sha256))}assert.ok(html.includes('data:video/webm;base64,'))});

const {loadModule}=await import('./load-module.mjs');
const {Heatmap}=await import('data:text/javascript,'+encodeURIComponent(loadModule('Heatmap').js));
test('real Heatmap builds distinct selected axes and combined two-axis heat',()=>{
 const doc={axes:[{name:'L0',actions:[{at:0,pos:0},{at:1000,pos:100},{at:20000,pos:20}]},{name:'R0',actions:[{at:0,pos:50},{at:10000,pos:50},{at:11000,pos:100},{at:12000,pos:0},{at:20000,pos:50}]}]};
 const a=Heatmap.build(doc,20000,0,100,false),b=Heatmap.build(doc,20000,1,100,false),both=Heatmap.build(doc,20000,0,100,true);
 assert.notDeepEqual(a.map(x=>x.heat),b.map(x=>x.heat));assert.notDeepEqual(a.map(x=>x.rangeMin),b.map(x=>x.rangeMin));
 assert.ok(both.reduce((s,x)=>s+x.heat,0)>a.reduce((s,x)=>s+x.heat,0));
});
function adapterHarness(){
 const nodes=new Map(),calls=[];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{style:{},checked:id==='combine',value:'0',scrollTop:0,textContent:'',addEventListener(){},getContext(){return {set fillStyle(v){},fillRect(...args){calls.push(args)}}},getBoundingClientRect(){return {left:10,width:200}},setPointerCapture(){}});return nodes.get(id)};
 Object.assign(node('media'),{paused:true,readyState:4,ended:false,currentTime:4,duration:20,async play(){this.paused=false},pause(){this.paused=true}});
 const source=readFileSync(new URL('app.js',import.meta.url),'utf8').replace(/^import .*?;\n/gm,'');
 const document={getElementById:node,querySelector(){return {value:'0'}},querySelectorAll(){return []},addEventListener(){}};
 const run=new Function('document','applicationWorkspaceLayout','videoPlaybackIntent','VideoDragBounds','VideoDragSession','Heatmap','fetch',source+'\nreturn {snapshot:()=>({floating,full,screen}),render};');
 const result=run(document,applicationWorkspaceLayout,videoPlaybackIntent,VideoDragBounds,VideoDragSession,Heatmap,async()=>({json:async()=>[]}));
 return {...result,node,calls};
}
test('adapter scroll >96 floats, expand returns large preview and scroll top without fullscreen or clock reset',()=>{
 const h=adapterHarness();assert.equal(h.snapshot().floating,false);h.node('settings').scrollTop=96;h.node('settings').onscroll();assert.equal(h.snapshot().floating,false);
 h.node('settings').scrollTop=97;h.node('settings').onscroll();assert.equal(h.snapshot().floating,true);
 h.node('expand').onclick();assert.deepEqual(h.snapshot(),{floating:false,full:false,screen:'workspace'});assert.equal(h.node('settings').scrollTop,0);assert.equal(h.node('media').currentTime,4);
});
test('adapter real heatmap draws clock cursor and click seeks the same media instance',()=>{
 const h=adapterHarness(),media=h.node('media');assert.ok(h.calls.length>100);const last=h.calls.at(-1);assert.equal(last[2],2);assert.equal(last[3],36);
 h.node('heat').onclick({currentTarget:h.node('heat'),clientX:110});assert.equal(media.currentTime,10);assert.equal(h.node('media'),media);
 h.node('heat').onclick({currentTarget:h.node('heat'),clientX:999});assert.equal(media.currentTime,20);
});
