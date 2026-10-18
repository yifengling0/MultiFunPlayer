import {applicationWorkspaceLayout} from './VideoLayout.js';
import {Heatmap} from './Heatmap.js';
import {videoPlaybackIntent,VideoDragBounds,VideoDragSession} from './VideoInteraction.js';
const el=id=>document.getElementById(id),media=el('media'),drag=new VideoDragSession();
let w=400,h=760,floating=false,screen='workspace',full=false,layout,bounds,xRatio=1,yRatio=1,origin,pointer=null,intent='none',event='ready',taps=0,drags=0;
// Synthetic script data; all bucket/range/color calculations are production Heatmap.build.
const script={axes:[{name:'L0',actions:[{at:0,pos:0},{at:2000,pos:100},{at:8000,pos:10},{at:10000,pos:90},{at:20000,pos:20}]},{name:'R0',actions:[{at:0,pos:50},{at:5000,pos:50},{at:6000,pos:100},{at:7000,pos:0},{at:20000,pos:50}]}]};
function paintHeatmap(){
 const canvas=el('heat'),width=Math.max(2,Math.round(layout.video.width));canvas.width=width;canvas.height=36;
 const ctx=canvas.getContext('2d'),duration=Number.isFinite(media.duration)?media.duration*1000:20000;
 const selected=Number(document.querySelector('input[name="axis"]:checked').value);
 const buckets=Heatmap.build(script,duration,selected,Math.min(333,width),el('combine').checked);
 buckets.forEach((bucket,i)=>{ctx.fillStyle=bucket.color;ctx.fillRect(i*width/buckets.length,0,Math.ceil(width/buckets.length),36);if(bucket.hasRange){ctx.fillStyle='#ffffff99';ctx.fillRect(i*width/buckets.length,(1-bucket.rangeMax)*36,Math.max(1,width/buckets.length),Math.max(1,(bucket.rangeMax-bucket.rangeMin)*36))}});
 const cursor=Math.max(0,Math.min(width-1,media.currentTime*1000/duration*width));ctx.fillStyle='#fff';ctx.fillRect(cursor,0,2,36);
 canvas.title=`${script.axes[selected].name} ${el('combine').checked?'combined':'single'}; ${media.currentTime.toFixed(2)}s / ${(duration/1000).toFixed(2)}s`;
}
for(const control of document.querySelectorAll('input[name="axis"],#combine'))control.onchange=render;
el('heat').onclick=e=>{const r=e.currentTarget.getBoundingClientRect();if(Number.isFinite(media.duration)){media.currentTime=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))*media.duration;event='heatmap-seek';render()}};
function rect(node,r){Object.assign(node.style,{left:r.x+'px',top:r.y+'px',width:r.width+'px',height:r.height+'px'});}
function render(){
 layout=applicationWorkspaceLayout(w,h,screen,true,full,'auto',floating);
 bounds=new VideoDragBounds(w,h,layout.video.width,layout.video.height,layout.headerHeight);
 el('stage').style.width=w+'px';el('stage').style.height=h+'px';
 const r={...layout.video};if(floating&&screen==='workspace'){r.x=bounds.x(xRatio);r.y=bounds.y(yRatio);}
 rect(el('video'),r);rect(el('settings'),layout.settings);el('controls').style.height=layout.controlsHeight+'px';
 el('bar').style.display=full?'none':'block';el('play').textContent=media.paused?'播放':'暂停';el('expand').textContent=floating?'展开':'浮窗';el('full').textContent=full?'退出全屏':'全屏';
 el('axes').style.display=layout.controlsHeight>=130?'flex':'none';paintHeatmap();
 el('status').textContent=JSON.stringify({screen,floating,full,playing:!media.paused,ended:media.ended,position:+media.currentTime.toFixed(2),intent,event,taps,drags,x:+r.x.toFixed(1),y:+r.y.toFixed(1),width:r.width,height:r.height},null,2);
}
async function toggle(){taps++;intent=videoPlaybackIntent(!media.paused,false,media.readyState>=2,media.ended,true,false,el('busy').checked);event='tap';if(intent==='pause')media.pause();else if(intent==='play'||intent==='replay'){if(intent==='replay')media.currentTime=0;try{await media.play();}catch(e){event=String(e)}}render();}
el('play').onclick=toggle;
function setFloating(value){drag.cancel();pointer=null;floating=value;if(!value)el('settings').scrollTop=0;render()}
el('expand').onclick=()=>setFloating(!floating);
el('full').onclick=()=>{drag.cancel();pointer=null;full=!full;screen=full?'player':'workspace';floating=false;render()};
el('settings').onscroll=()=>{if(!full&&screen==='workspace'&&el('settings').scrollTop>96&&!floating){event='scroll-float';setFloating(true)}};
el('floating').onclick=()=>{screen='workspace';full=false;setFloating(!floating)};
el('workspace').onclick=()=>{drag.cancel();pointer=null;screen='workspace';full=false;render()};
el('size').onchange=()=>{drag.cancel();pointer=null;[w,h]=el('size').value.split(',').map(Number);render()};
el('input').onpointerdown=e=>{if(pointer!==null){drag.cancel();pointer=null;return}pointer=e.pointerId;origin=[e.clientX,e.clientY];drag.begin(bounds.x(xRatio),bounds.y(yRatio));e.currentTarget.setPointerCapture(e.pointerId)};
el('input').onpointermove=e=>{if(pointer!==e.pointerId)return;if(drag.move(e.clientX-origin[0],e.clientY-origin[1],bounds)&&floating&&screen==='workspace'){xRatio=drag.xRatio;yRatio=drag.yRatio;event='drag';render()}};
el('input').onpointerup=e=>{if(pointer!==e.pointerId)return;const moved=drag.moved;drag.cancel();pointer=null;if(moved){drags++;event='drag-end';render()}else toggle()};
el('input').onpointercancel=()=>{drag.cancel();pointer=null;event='cancel';render()};
document.addEventListener('visibilitychange',()=>{drag.cancel();pointer=null});
for(const name of ['loadeddata','play','pause','ended','timeupdate'])media.addEventListener(name,()=>{if(name!=='timeupdate')event=name;render()});
el('source').textContent='Loading production-source hashes';fetch('/manifest.json').then(r=>r.json()).then(x=>el('source').textContent=x.map(m=>m.file+': '+m.sha256).join(' | '));
render();
