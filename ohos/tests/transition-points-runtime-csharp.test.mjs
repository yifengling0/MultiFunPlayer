import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, next) {
  return next(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? specifier + '.ts' : specifier, context);
} });
const { MotionRegistry } = await import('../entry/src/main/ets/core/motion/MotionRegistry.ts');
const { MotionCurvePoint } = await import('../entry/src/main/ets/core/MotionConfiguration.ts');
const golden = JSON.parse(readFileSync(new URL('./fixtures/transition-points-runtime-golden.json', import.meta.url), 'utf8'));

test('point-reset numerical oracle records actual extracted C# execution and its notification shim boundary', () => {
  assert.equal(golden.provenance.executedCSharp, true);
  assert.equal(golden.kind, 'original-csharp-source-extracted-motion-providers');
  assert.equal(golden.provenance.runtime, '9.0.21 linux-x64');
  assert.match(golden.provenance.pointsCommandBoundary, /does not execute Points.SetFrom, WPF, or Fody callbacks/);
  for (const [path, expected] of Object.entries(golden.provenance.sourceSha256)) {
    const source = readFileSync(new URL('../../' + path, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
    assert.equal(createHash('sha256').update(source).digest('hex'), expected, path);
  }
});

for (const scenario of golden.cases) test('actual C# point-refresh numerical trace: ' + scenario.input.name, () => {
  const registry = new MotionRegistry(['L0']), provider = registry.getProvider('L0', 'Custom Curve');
  function apply(input, command) {
    const configuration = provider.getConfiguration();
    for (const key of ['durationSeconds', 'isLooping', 'syncOnEnd']) if (key in input) configuration[key] = input[key];
    if ('interpolationMode' in input) configuration.interpolationMode = input.interpolationMode.toLowerCase();
    if ('points' in input) {
      const points = input.points.map(point => new MotionCurvePoint(...point));
      if (command) {
        registry.setCustomCurvePoints('L0', configuration.durationSeconds, configuration.interpolationMode, points);
        configuration.points = provider.getConfiguration().points;
      } else configuration.points = points;
    }
    provider.configure(configuration);
  }
  apply(scenario.input, false);
  for (let i = 0; i < scenario.input.frames.length; i++) {
    const input = scenario.input.frames[i], expected = scenario.frames[i];
    apply(input, true); registry.update('L0', 'Custom Curve', input.deltaSeconds);
    for (const [key, actual] of Object.entries({ value: provider.value, timeSeconds: provider.getTimeSeconds(),
      index: provider.index, playing: provider.isPlaying() })) {
      const reference = expected[key];
      if (reference === 'NaN') assert.ok(Number.isNaN(actual), key + ' frame ' + i);
      else if (typeof reference === 'number') assert.ok(Math.abs(actual - reference) <= 2e-14,
        `${key} frame ${i}: ${actual} vs ${reference}`);
      else assert.equal(actual, reference, key + ' frame ' + i);
    }
  }
});
