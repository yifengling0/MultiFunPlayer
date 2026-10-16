import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? specifier + '.ts' : specifier, context);
} });
const { FunscriptParser: Parser } = await import('../entry/src/main/ets/core/Funscript.ts');
const { PlaybackEngine } = await import('../entry/src/main/ets/core/PlaybackEngine.ts');
function engine() {
  const e = new PlaybackEngine();
  e.load(Parser.parse('{"axes":[{"id":"L0","actions":[{"at":0,"pos":0},{"at":1000,"pos":100}]},{"id":"R0","actions":[{"at":0,"pos":100},{"at":1000,"pos":0}]}]}'));
  e.setConnected(true);
  return e;
}
test('speed scales monotonic deltas without changing duration or script', () => {
  const e=engine(); e.setSpeed(2); e.play(); e.tick(100);
  assert.equal(e.snapshot().positionMs,200); assert.equal(e.snapshot().outputs[0].position,20);
  e.setSpeed(0.5); e.tick(100); assert.equal(e.snapshot().positionMs,250);
  assert.equal(e.snapshot().durationMs,1000); e.pause(); e.tick(500); assert.equal(e.snapshot().positionMs,250);
});
test('invalid speed is rejected without changing active rate', () => {
  const e=engine(); for(const n of [NaN,Infinity,-1,0,0.009,4.001]) assert.throws(()=>e.setSpeed(n));
  assert.equal(e.snapshot().speed,1); e.setSpeed(0.01); assert.equal(e.snapshot().speed,0.01);
});
test('positive global offset delays script and negative advances it', () => {
  const e=engine();e.seek(500);e.setGlobalOffset(100);
  assert.equal(e.getScriptPosition('L0'),400); assert.equal(e.previewSamples()[0].position,40);
  e.setGlobalOffset(-100);assert.equal(e.previewSamples()[0].position,60);
  assert.equal(e.snapshot().positionMs,500); assert.equal(e.snapshot().outputs.length,0);
});
test('per-axis offsets add to global offset with independent axis sampling', () => {
  const e=engine();e.seek(500);e.setGlobalOffset(100);e.setAxisOffset('L0',100);
  assert.equal(e.previewSamples()[0].position,30);assert.equal(e.previewSamples()[1].position,60);
  e.setAxisOffset('L0',-200);assert.equal(e.previewSamples()[0].position,60);
  assert.throws(()=>e.setAxisOffset('MISSING',1));assert.throws(()=>e.setAxisOffset('L0',Infinity));
});
test('offset changes and interpolation changes close gate; rate changes do not reopen it', () => {
  const e=engine();e.play();e.tick(200);e.setGlobalOffset(20);
  assert.equal(e.snapshot().state,'paused');assert.equal(e.snapshot().safetyGateOpen,false);
  e.setSpeed(2);assert.equal(e.snapshot().safetyGateOpen,false);e.play();e.setAxisOffset('L0',10);
  assert.equal(e.snapshot().state,'paused');e.play();e.setInterpolationMode('pchip');assert.equal(e.snapshot().state,'paused');
});
test('modes are validated and reflected in both preview and gated samples', () => {
  const e=engine();e.seek(250);e.setInterpolationMode('step');assert.equal(e.previewSamples()[0].position,0);
  e.play();assert.equal(e.snapshot().outputs[0].position,0);
  assert.throws(()=>e.setInterpolationMode('spline'));e.setInterpolationMode('linear');assert.equal(e.previewSamples()[0].position,25);
});
test('offset bounds and endpoint holds are finite without extending media duration', () => {
  const e=engine();for(const n of [NaN,Infinity,86400001,-86400001]) assert.throws(()=>e.setGlobalOffset(n));
  e.setGlobalOffset(86400000);assert.equal(e.previewSamples()[0].position,0);
  e.setGlobalOffset(-86400000);assert.equal(e.previewSamples()[0].position,100);
  assert.equal(e.snapshot().durationMs,1000);
});
test('new document clears old per-axis offsets and remains stopped', () => {
  const e=engine();e.setAxisOffset('L0',200);e.setGlobalOffset(50);e.setSpeed(2);
  e.load(Parser.parse('{"actions":[{"at":0,"pos":0},{"at":1000,"pos":100}]}'));
  assert.equal(e.getAxisOffset('L0'),0);assert.equal(e.snapshot().globalOffsetMs,50);
  assert.equal(e.snapshot().speed,2);assert.equal(e.snapshot().state,'stopped');
});
test('background and reconnect cannot bypass settings gate', () => {
  const e=engine();e.setSpeed(4);e.play();e.tick(100);e.setForeground(false);e.setForeground(true);e.tick(100);
  assert.equal(e.snapshot().positionMs,400);assert.equal(e.snapshot().outputs.length,0);
  e.setConnected(false);e.setConnected(true);e.setGlobalOffset(0);assert.equal(e.snapshot().safetyGateOpen,false);
});
