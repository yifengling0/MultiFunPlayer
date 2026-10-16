import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, nextResolve) { if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return nextResolve(specifier + '.ts', context); return nextResolve(specifier, context); } });
const {Heatmap} = await import('../entry/src/main/ets/core/Heatmap.ts');
import {FunscriptParser} from '../entry/src/main/ets/core/Funscript.ts';
const doc = (actions, axes = []) => FunscriptParser.parse(JSON.stringify({actions, axes}));
test('upstream one-second full stroke contributes equally and uses hottest color', () => {
 const b=Heatmap.build(doc([{at:0,pos:0},{at:1000,pos:100}]),1000,0,2);
 assert.deepEqual(b.map(x=>x.heat),[0.5,0.5]); assert.deepEqual(b.map(x=>x.color),['#f53e2e','#f53e2e']);
 assert.deepEqual(b.map(x=>[x.rangeMin,x.rangeMax]),[[0,0.5],[0.5,1]]);
});
test('stationary and shallow-angle segments have no heat but preserve range',()=>{
 for(const actions of [[{at:0,pos:50},{at:1000,pos:50}],[{at:0,pos:0},{at:10000,pos:1}]]){
 const b=Heatmap.build(doc(actions),10000,0,2); assert.ok(b.every(x=>x.heat===0&&x.color==='#000000'));}
});
test('combined heat sums axes while range follows selected axis only',()=>{
 const d=doc([{at:0,pos:50},{at:1000,pos:50}],[{id:'R0',actions:[{at:0,pos:0},{at:1000,pos:100}]}]);
 assert.deepEqual(Heatmap.build(d,1000,0,2,true).map(x=>x.heat),[.5,.5]);
 assert.deepEqual(Heatmap.build(d,1000,0,2,false).map(x=>x.heat),[0,0]);
 assert.deepEqual(Heatmap.build(d,1000,0,2,true).map(x=>[x.rangeMin,x.rangeMax]),[[.5,.5],[.5,.5]]);
});
test('uncovered buckets use default midpoint; invalid duration yields empty',()=>{
 const d=doc([{at:1000,pos:0},{at:2000,pos:100}]);
 const b=Heatmap.build(d,4000,0,4); assert.equal(b[0].hasRange,false);assert.equal(b[3].rangeMin,.5);
 assert.deepEqual(Heatmap.build(d,0,0),[]); for(const n of [0,1,501,2.1])assert.throws(()=>Heatmap.build(d,1000,0,n));
});
