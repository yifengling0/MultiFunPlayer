import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({resolve(specifier,context,next){return next(specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)?specifier+'.ts':specifier,context);}});
const {FunscriptMetadata,FunscriptChapter}=await import('../entry/src/main/ets/core/Funscript.ts');
const {activeChapter,markerMediaPosition}=await import('../entry/src/main/ets/core/MarkerNavigation.ts');
test('next chapter boundary displays the new chapter and final end remains visible',()=>{
 const metadata=new FunscriptMetadata([new FunscriptChapter('Rise',0,2500),new FunscriptChapter('Return',2500,5000)]);
 assert.equal(activeChapter(metadata,2499).name,'Rise');assert.equal(activeChapter(metadata,2500).name,'Return');
 assert.equal(activeChapter(metadata,5000).name,'Return');assert.equal(activeChapter(metadata,5001),undefined);
 assert.equal(activeChapter(metadata,NaN),undefined);
});
test('gaps and empty metadata have no active chapter',()=>{
 const metadata=new FunscriptMetadata([new FunscriptChapter('A',100,200),new FunscriptChapter('B',300,400)]);
 assert.equal(activeChapter(metadata,250),undefined);assert.equal(activeChapter(new FunscriptMetadata(),0),undefined);
});
test('marker applies both offsets but rejects unreachable positions instead of clamping',()=>{
 assert.equal(markerMediaPosition(500,100,50,1000),650);
 assert.equal(markerMediaPosition(900,100,50,1000),undefined);
 assert.equal(markerMediaPosition(0,-100,0,1000),undefined);
 assert.equal(markerMediaPosition(900,100,0,1000),1000);
 assert.equal(markerMediaPosition(Infinity,0,0,1000),undefined);
});
