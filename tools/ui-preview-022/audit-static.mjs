/** Static evidence only: does not certify rendered layout or touch/IME behavior. */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const file=new URL('./generated/manifest.json',import.meta.url);
const bytes=readFileSync(file),m=JSON.parse(bytes);
const luminance=hex=>{
 const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
 return rgb.reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
};
const ratio=(a,b)=>{const [low,high]=[luminance(a),luminance(b)].sort((a,b)=>a-b);return(high+.05)/(low+.05)};
const colors=[['body/card','ink','card'],['helper/card','muted','card'],['helper/page','muted','page'],['button/soft','ink','accentSoft'],['danger/soft','danger','dangerSoft'],['warning/card','warning','card'],['success/card','success','card']].map(([pair,a,b])=>({pair,foreground:m.tokens[a],background:m.tokens[b]}));
colors.push({pair:'white/accent',foreground:'#FFFFFF',background:m.tokens.accent},{pair:'white/danger',foreground:'#FFFFFF',background:m.tokens.danger});
const contrasts=colors.map(p=>({...p,ratio:Number(ratio(p.foreground,p.background).toFixed(3)),required:4.5,pass:ratio(p.foreground,p.background)>=4.5}));
const geometry=m.viewports.map(v=>{
 const video=m.metrics[v.id].video;
 const bounds=r=>r.x>=0&&r.y>=0&&r.width>=0&&r.height>=0&&r.x+r.width<=v.width+.01&&r.y+r.height<=v.height+.01;
 return {...v,headerHeight:video.headerHeight,sideBySide:video.sideBySide,videoSurface:{width:video.video.width,height:video.video.height-video.controlsHeight},
  controlsHeight:video.controlsHeight,settings:video.settings,inBounds:bounds(video.video)&&bounds(video.settings),
  dialogHeight:Math.max(200,Math.min(620,v.height-24)),snackbarTextHeight:Math.max(52,Math.min(120,v.height*.22))};
});
const result={kind:'Static token, source-label and geometry audit. NO browser screenshots or native render.',sourceManifestSha256:createHash('sha256').update(bytes).digest('hex'),
 tokens:m.tokens,density:{default:m.densityDefault,explicitCompactOnly:m.explicitCompact},contrasts,geometry,
 screenshotStatus:'NOT GENERATED. Local Chromium blocked by sandbox socket restrictions; escalated execution failed during environment setup. Cloud browser file URL explicitly denied. Rendering stopped; no bypass route attempted.',
 limitations:[...m.caveats,'Numeric box bounds and contrast checks cannot detect glyph clipping, ArkUI min-content measurement, image composition, control hit testing, or platform Select/IME behavior.'],
 pass:contrasts.every(p=>p.pass)&&geometry.every(g=>g.inBounds)&&m.densityDefault==='readable'&&m.explicitCompact};
writeFileSync(new URL('./generated/static-audit.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({pass:result.pass,contrasts:contrasts.map(({pair,ratio,pass})=>({pair,ratio,pass})),geometry:geometry.map(({id,videoSurface,settings,inBounds})=>({id,videoSurface,settings,inBounds})),screenshotStatus:result.screenshotStatus},null,2));
if(!result.pass)process.exitCode=1;
