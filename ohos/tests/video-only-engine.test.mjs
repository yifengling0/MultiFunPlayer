import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? specifier + '.ts' : specifier, context);
} });
const { FunscriptParser, FunscriptDocument } = await import('../entry/src/main/ets/core/Funscript.ts');
const { PlaybackEngine } = await import('../entry/src/main/ets/core/PlaybackEngine.ts');
const script = () => FunscriptParser.parse('{"actions":[{"at":0,"pos":20},{"at":1000,"pos":80}]}');

test('clearing a paired source removes all prior axes and native time before video-only playback', () => {
  const engine = new PlaybackEngine();
  engine.setConnected(true);
  engine.load(script());
  engine.setAxisOffset('L0', 50);
  engine.setAxisScale('L0', 2);
  engine.setAxisInverted('L0', true);
  engine.useExternalClock(true);
  engine.acceptMediaClock(500, 10000, true);
  assert.equal(engine.snapshot().outputs.length, 1);

  engine.clearScripts();
  assert.equal(engine.snapshot().state, 'stopped');
  assert.equal(engine.snapshot().safetyGateOpen, false);
  assert.equal(engine.snapshot().positionMs, 0);
  assert.equal(engine.snapshot().durationMs, 0);
  assert.deepEqual(engine.previewSamples(), []);
  assert.deepEqual(engine.snapshot().outputs, []);

  engine.useExternalClock(true);
  assert.equal(engine.acceptMediaClock(1200, 15000, true), true);
  assert.equal(engine.snapshot().positionMs, 1200);
  assert.equal(engine.snapshot().durationMs, 15000);
  assert.equal(engine.snapshot().state, 'playing');
  assert.deepEqual(engine.snapshot().outputs, []);
  engine.tick(5000);
  assert.equal(engine.snapshot().positionMs, 1200, 'native clock never advances synthetically');
  assert.equal(engine.play(), false, 'native playback must come from the adapter');

  engine.acceptMediaClock(15000, 15000, false);
  assert.equal(engine.snapshot().state, 'ended');
  engine.acceptMediaClock(0, 15000, false);
  assert.equal(engine.snapshot().state, 'paused', 'rewind alone never resumes playback');
  engine.acceptMediaClock(0, 15000, true);
  assert.equal(engine.snapshot().state, 'playing');
  assert.deepEqual(engine.previewSamples(), []);
});

test('clearScripts retains user preferences but no per-file axis settings or simulator playability', () => {
  const engine = new PlaybackEngine();
  engine.setConnected(true);
  engine.load(script());
  engine.setInterpolationMode('pchip');
  engine.setGlobalOffset(100);
  engine.setSpeed(2);
  engine.setAxisOffset('L0', 50);
  engine.setAxisScale('L0', 2);
  engine.setAxisInverted('L0', true);
  engine.setAxisInterpolationMode('L0', 'step');
  engine.play();
  engine.clearScripts();
  assert.equal(engine.play(), false);
  assert.equal(engine.snapshot().durationMs, 0);
  assert.equal(engine.snapshot().globalOffsetMs, 100);
  assert.equal(engine.snapshot().speed, 2);
  assert.equal(engine.getAxisOffset('L0'), 0);
  assert.throws(() => engine.getAxisScriptSettings('L0'), /Unknown script axis/);

  engine.load(script());
  const settings = engine.getAxisScriptSettings('L0');
  assert.equal(settings.scale, 1);
  assert.equal(settings.inverted, false);
  assert.equal(settings.interpolationMode, 'pchip');
  assert.equal(engine.getAxisOffset('L0'), 0);
});

test('video-only internal clearing does not make empty external scripts valid', () => {
  const engine = new PlaybackEngine();
  for (const text of ['{}', '{"axes":[]}', '{"actions":"invalid"}']) {
    assert.throws(() => FunscriptParser.parse(text));
  }
  assert.throws(() => engine.load(new FunscriptDocument([])), /1 to 32 axes/);
  assert.deepEqual(engine.previewSamples(), []);
  assert.equal(engine.snapshot().safetyGateOpen, false);
});
