import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, nextResolve) {
 return nextResolve(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? specifier + '.ts' : specifier, context);
} });
const { MediaLoopControls, AutoSkipToScriptStart, seekToScriptStart, scriptStartPosition, mediaSeekTarget } = await import('../entry/src/main/ets/core/playback/MediaControls.ts');
const { AxisKeyframe, AxisChapter } = await import('../entry/src/main/ets/core/AxisScriptStore.ts');
const keys = pairs => pairs.map(([p,v]) => new AxisKeyframe(p,v));
const chapters = pairs => pairs.map(([s,e]) => new AxisChapter('chapter',s,e));

test('loop bounds preserve source invalidation order, finite checks and equality', () => {
 const loop = new MediaLoopControls(); assert.equal(loop.setLoop(5,10,100),5);
 assert.equal(loop.setStart(10,100),null); assert.equal(loop.endPosition,null); assert.equal(loop.startPosition,10);
 assert.equal(loop.setEnd(9,100),null); assert.equal(loop.startPosition,null); assert.equal(loop.endPosition,9);
 loop.setStart(5,100); loop.setStart(Infinity,100); assert.equal(loop.startPosition,null); assert.equal(loop.endPosition,null);
 loop.setLoop(5,10,100); loop.setEnd(NaN,100); assert.equal(loop.startPosition,5); assert.equal(loop.endPosition,null);
 assert.equal(loop.setLoop(10,5,100),null); assert.equal(loop.startPosition,null); assert.equal(loop.endPosition,5);
 assert.equal(loop.setLoop(-5,200,100),0); assert.equal(loop.startPosition,-5); assert.equal(loop.endPosition,200);
});
test('cycle, 100ms cadence without remainder, and >= end including paused', () => {
 const loop = new MediaLoopControls(); assert.equal(loop.cycle(5,100),null); assert.equal(loop.cycle(10,100),5);
 assert.equal(loop.update(0.05,10,100),null); assert.equal(loop.update(0.06,10,100),5);
 assert.equal(loop.update(0.09,11,100),null); assert.equal(loop.update(0.02,11,100),5);
 loop.cycle(8,100); assert.equal(loop.isValid,false);
});
test('detected seeks clear exactly +/-1 second outside even partial bounds', () => {
 for (const [p,clears] of [[4,true],[4.001,false],[10.999,false],[11,true]]) {
  const loop = new MediaLoopControls(); loop.setLoop(5,10,100); loop.onDetectedSeek(p); assert.equal(loop.isValid,!clears);
 }
 const loop = new MediaLoopControls(); loop.setStart(5,100); loop.onDetectedSeek(4); assert.equal(loop.startPosition,null);
});
test('chapter uses first non-null collection, exact inclusive hit before epsilon; gap tolerance and empty first', () => {
 const loop = new MediaLoopControls(); const a = chapters([[0,10],[10,20],[30,40]]);
 assert.equal(loop.fromCurrentChapter([null,a],10,100),0);
 assert.equal(loop.fromCurrentChapter([a],10.5,100),10);
 assert.equal(loop.fromCurrentChapter([a],29.1,100),30);
 assert.equal(loop.fromCurrentChapter([[],a],35,100),null); assert.equal(loop.startPosition,30);
 assert.equal(loop.fromCurrentChapter([a],25,100),null); assert.equal(loop.startPosition,30);
});
test('skip-gap exact epsilon, singleton and flat tail semantics', () => {
 assert.equal(scriptStartPosition([]),null); assert.equal(scriptStartPosition(keys([[5,0]])),null);
 assert.equal(scriptStartPosition(keys([[0,0],[10,0],[20,0.5]])),10);
 assert.equal(scriptStartPosition(keys([[0,0],[10,0],[20,0]])),20);
 assert.equal(scriptStartPosition(keys([[0,0],[0.0005,1],[2,0]])),0.0005);
 assert.equal(scriptStartPosition(keys([[0,0],[0.001,0.001]])),0);
});
test('auto skip first collection is not minimum, no fallback from empty; clamp ordering and only-before', () => {
 const a = keys([[20,0],[30,1]]), b = keys([[5,0],[10,1]]);
 assert.equal(seekToScriptStart([null,a,b],100,0),15);
 assert.equal(seekToScriptStart([[],a],100,0),null);
 assert.equal(seekToScriptStart([a],10,0),5);
 assert.equal(seekToScriptStart([a],100,15),null);
 assert.equal(seekToScriptStart([a],100,40,-5,false),15);
 assert.equal(seekToScriptStart([a],10,10,5,true),10); // only-before tested before final duration clamp
 assert.equal(seekToScriptStart([a],100,NaN),15);
 assert.equal(mediaSeekTarget(5,NaN),null); assert.equal(mediaSeekTarget(Infinity,100),null);
});
test('duration task is 1-second leading coalescing, reads latest state, disabled does not cancel pending', () => {
 const auto = new AutoSkipToScriptStart(); const a = keys([[20,0],[30,1]]);
 assert.equal(auto.enabled,true); assert.equal(auto.offsetSeconds,-5);
 auto.onDurationMessage(0); auto.onDurationMessage(0.9); assert.equal(auto.poll(0.99,[a],100,0),null);
 auto.offsetSeconds = -2; auto.enabled = false;
 assert.equal(auto.poll(1,[a],100,0),18); assert.equal(auto.pending,false);
 auto.onDurationMessage(2); assert.equal(auto.pending,false);
 auto.enabled = true; auto.onDurationMessage(2,false); assert.equal(auto.pending,false);
 auto.onDurationMessage(2); auto.cancel(); assert.equal(auto.poll(3,[a],100,0),null);
 auto.onDurationMessage(4); assert.equal(auto.poll(5,[a],100,30),null); assert.equal(auto.pending,false);
});
