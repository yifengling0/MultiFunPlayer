import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);}});
const {PlaybackSessionCore}=await import('../entry/src/main/ets/core/PlaybackSessionCore.ts');const {SettingsSchema}=await import('../entry/src/main/ets/settings/SettingsSchema.ts');
const {AxisScriptResource,AxisScriptBinding,AxisKeyframe}=await import('../entry/src/main/ets/core/AxisScriptStore.ts');const {FunscriptParser}=await import('../entry/src/main/ets/core/Funscript.ts');
const golden=JSON.parse(readFileSync(new URL('../tools/reference/skip-gap-015/golden.json',import.meta.url),'utf8'));
const number=x=>typeof x==='string'?Number(x):x;
for(const c of golden.cases)test('actual source SkipGap oracle → session: '+c.name,()=>{
 const v=c.input,s=new PlaybackSessionCore(SettingsSchema.defaults());s.setConnected(true);
 const duration=number(v.mediaDuration??100),position=number(v.mediaPosition??0),minimum=number(v.minimumSkip??2);
 s.loadBindings(FunscriptParser.parse('{"actions":[{"at":0,"pos":50},{"at":100000,"pos":50}]}'),v.axes.filter(a=>a.points!==null).map(a=>new AxisScriptBinding(a.name,new AxisScriptResource(a.name,a.name,'oracle',a.points.map(p=>new AxisKeyframe(p[0],p[1]))))));
 s.mediaDurationMs=duration*1000;s.externalClock=true;s.tracker.position=position;s.tracker.internal=position;
 for(const a of v.axes){s.pipeline.states.find(x=>x.axisName===a.name).index=c.expected.axes.find(x=>x.name===a.name).index;}
 const frame=s.frame(),requested=v.invocation==='empty'?[]:[v.targetAxis??'L0'];const actual=s.skipGapPosition(requested,minimum);
 const safety=!Number.isFinite(position)||position<0||!Number.isFinite(duration)||duration<=0||!Number.isFinite(minimum)||minimum<0||requested.some(n=>!s.activeRegistry().axes.some(a=>a.name===n));
 const expected=safety?null:(c.expected.seeks[0]??null);
 assert.equal(actual,expected,JSON.stringify(v));assert.equal(s.frame(),frame,'query never advances/publishes');
});
test('real configure invalidation is observed immediately without pretending the old published index changed',()=>{
 const s=new PlaybackSessionCore(SettingsSchema.defaults());s.setConnected(true);s.loadBindings(FunscriptParser.parse('{"actions":[{"at":0,"pos":50},{"at":100000,"pos":50}]}'),[new AxisScriptBinding('L0',new AxisScriptResource('gap','gap','file',[new AxisKeyframe(0,.2),new AxisKeyframe(10,.2),new AxisKeyframe(15,.8)]))]);
 s.seek(2000);s.play();s.tick(40);const frame=s.frame();assert.equal(s.skipGapPosition(['L0'],2),10);const a=s.getAxisConfiguration('L0');a.scriptOffsetSeconds=20;s.changeAxisConfiguration('L0',a);assert.equal(s.frame(),frame);assert.equal(s.skipGapPosition(['L0'],2),10);assert.equal(s.frame(),frame);
});
