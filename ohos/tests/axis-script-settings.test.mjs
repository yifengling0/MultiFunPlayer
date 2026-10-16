import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, next) { return next(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? specifier + '.ts' : specifier, context); } });
const { PlaybackEngine } = await import('../entry/src/main/ets/core/PlaybackEngine.ts');
const { FunscriptParser } = await import('../entry/src/main/ets/core/Funscript.ts');
const document = () => FunscriptParser.parse(JSON.stringify({axes: ['L0','R0','V0'].map(id => ({id, actions:[{at:0,pos:20},{at:1000,pos:80}]}))}));
function setup() { const engine = new PlaybackEngine(); engine.load(document()); engine.setConnected(true); return engine; }
const value = (engine, name) => engine.previewSamples().find(x => x.name === name).position;

test('source formula scales about device neutral then clamps and inverts', () => {
  const engine = setup();
  engine.setAxisScale('L0', 2);
  assert.equal(value(engine,'L0'),0);
  engine.setAxisInverted('L0',true);
  assert.equal(value(engine,'L0'),100);
  assert.equal(value(engine,'R0'),20);
  engine.setAxisScale('V0',2);
  assert.equal(value(engine,'V0'),40);
  engine.setAxisInverted('V0',true);
  assert.equal(value(engine,'V0'),60);
});
test('per-axis interpolation does not change another axis', () => {
  const engine=setup(); engine.seek(500); engine.setAxisInterpolationMode('L0','step');
  assert.equal(value(engine,'L0'),20); assert.equal(value(engine,'R0'),50);
  assert.equal(engine.getAxisScriptSettings('L0').interpolationMode,'step');
  assert.equal(engine.getAxisScriptSettings('R0').interpolationMode,'linear');
});
test('settings mutations pause and never reopen native or internal output', () => {
  for (const mutate of [e=>e.setAxisScale('L0',.5),e=>e.setAxisInverted('L0',true),e=>e.setAxisInterpolationMode('L0','makima')]) {
    const engine=setup(); engine.play(); mutate(engine); assert.equal(engine.snapshot().safetyGateOpen,false);
    engine.useExternalClock(true); engine.acceptMediaClock(200,1000,true); mutate(engine);
    assert.equal(engine.snapshot().safetyGateOpen,false);
  }
});
test('settings getters are defensive and loading resets per-file axis settings', () => {
  const engine=setup(); engine.setAxisScale('L0',2); const copy=engine.getAxisScriptSettings('L0'); copy.scale=4;
  assert.equal(engine.getAxisScriptSettings('L0').scale,2);
  engine.load(document()); assert.equal(engine.getAxisScriptSettings('L0').scale,1);
  assert.equal(engine.getAxisScriptSettings('L0').inverted,false);
});
test('invalid settings reject without changing state and accept inclusive source scale limits', () => {
  const engine=setup();
  for(const n of [NaN,Infinity,0,.009,4.001]) assert.throws(()=>engine.setAxisScale('L0',n));
  for(const n of [.01,4]) {engine.setAxisScale('L0',n); assert.equal(engine.getAxisScriptSettings('L0').scale,n);}
  assert.throws(()=>engine.setAxisScale('missing',1)); assert.throws(()=>engine.setAxisInverted('L0',1));
  assert.throws(()=>engine.setAxisInterpolationMode('L0','cubic'));
});
test('simulator output and inspection preview apply identical script transforms', () => {
  const engine=setup();engine.seek(250);engine.setAxisScale('L0',.5);engine.setAxisInverted('L0',true);engine.play();
  assert.deepEqual(engine.snapshot().outputs,engine.previewSamples());
});
