import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? specifier + '.ts' : specifier, context);
} });
const { MotionProviderConfiguration, MotionCurvePoint } = await import('../entry/src/main/ets/core/MotionConfiguration.ts');
const { AxisKeyframe, AxisScriptResource } = await import('../entry/src/main/ets/core/AxisScriptStore.ts');
const { PatternMotion } = await import('../entry/src/main/ets/core/motion/PatternMotion.ts');
const { CustomCurveMotion } = await import('../entry/src/main/ets/core/motion/CustomCurveMotion.ts');
const { LoopingScriptMotion } = await import('../entry/src/main/ets/core/motion/LoopingScriptMotion.ts');
const golden = JSON.parse(readFileSync(new URL('./fixtures/motion-provider-golden.json', import.meta.url)));

// The C# host runs unchanged extracted Update/Calculate/ResetState/loop-toggle
// methods with memory resources. WPF/Fody and file selection are not executed.
// Callback assertions here isolate only Update-generated sync; configuration
// notifications and same-frame pipeline sync have separate integration tests.
test('provider oracle executes source-extracted C#, and every pinned source hash still matches', () => {
  assert.equal(golden.provenance.executedCSharp, true);
  assert.equal(golden.kind, 'original-csharp-source-extracted-motion-providers');
  assert.equal(golden.provenance.sourceCommit, '36c08fbb99ac9398a63ff1cca1bbf68cd2228a94');
  assert.equal(golden.provenance.runtime, '9.0.21 linux-x64');
  assert.equal(golden.provenance.sdk, '9.0.319');
  const manifest = JSON.parse(readFileSync(new URL('../tools/reference/source-manifest.json', import.meta.url)));
  assert.equal(manifest.sourceCommit, golden.provenance.sourceCommit);
  assert.equal(Object.keys(golden.provenance.sourceSha256).length, 20);
  assert.deepEqual(golden.provenance.sourceSha256, manifest.sources);
  for (const [path, expected] of Object.entries(golden.provenance.sourceSha256)) {
    assert.equal(manifest.sources[path], expected, path + ' unified source manifest');
    const source = readFileSync(new URL('../../' + path, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
    assert.equal(createHash('sha256').update(source).digest('hex'), expected, path);
  }
});

function applyParameters(configuration, input) {
  for (const key of ['speed', 'minimum', 'maximum', 'durationSeconds', 'isLooping', 'syncOnEnd']) {
    if (input[key] !== undefined) { configuration[key] = input[key]; }
  }
  if (input.interpolationMode !== undefined) { configuration.interpolationMode = input.interpolationMode.toLowerCase(); }
  if (input.points !== undefined) { configuration.points = input.points.map(([x, y]) => new MotionCurvePoint(x, y)); }
  if (input.pattern !== undefined) { configuration.pattern = input.pattern[0].toLowerCase() + input.pattern.slice(1); }
}

test('1015 actual C# provider frames match values, clocks, segment indexes, playing and end-sync', t => {
  let maximumError = 0;
  let worst = '';
  let checked = 0;
  assert.equal(golden.cases.length, 35);
  for (const row of golden.cases) {
    const input = row.input;
    const id = { custom: 'Custom Curve', pattern: 'Pattern', loop: 'Looping Script' }[input.provider];
    const initial = new MotionProviderConfiguration(id);
    applyParameters(initial, input);
    let syncRequests = 0;
    let insideUpdate = false;
    const callback = () => { if (insideUpdate) { syncRequests++; } };
    const provider = input.provider === 'custom' ? new CustomCurveMotion('L0', initial, callback) :
      input.provider === 'pattern' ? new PatternMotion('L0', initial, callback) : new LoopingScriptMotion('L0', initial, callback);
    if (input.script !== undefined) {
      provider.setScriptResource(new AxisScriptResource('oracle', 'oracle', 'memory',
        input.script.map(([x, y]) => new AxisKeyframe(x, y))));
    }
    assert.equal(input.frames.length, row.frames.length);
    for (let frame = 0; frame < input.frames.length; frame++) {
      const update = input.frames[frame];
      const next = provider.getConfiguration();
      applyParameters(next, update);
      provider.configure(next);
      if (update.reset) { provider.reset(); }
      syncRequests = 0;
      insideUpdate = true;
      provider.update(update.deltaSeconds);
      insideUpdate = false;
      const actual = { value: provider.value, timeSeconds: provider.timeSeconds, syncRequests };
      if (input.provider === 'custom') { actual.index = provider.index; actual.playing = provider.isPlaying(); }
      if (input.provider === 'loop') { actual.index = provider.scriptIndex; }
      for (const [field, value] of Object.entries(row.frames[frame])) {
        const expected = typeof value === 'string' ? Number(value) : value;
        const label = `${input.name}, frame ${frame}, ${field}`;
        if (typeof expected === 'number' && Number.isNaN(expected)) {
          assert.ok(Number.isNaN(actual[field]), label + ' must be NaN');
        } else if (typeof expected === 'number' && Number.isFinite(expected)) {
          const error = Math.abs(actual[field] - expected);
          if (error > maximumError) { maximumError = error; worst = label; }
          assert.ok(error <= 2e-14, `${label}: ${actual[field]} vs ${expected}; error=${error}`);
        } else {
          assert.equal(actual[field], expected, label);
        }
      }
      checked++;
    }
  }
  assert.equal(checked, 1015);
  t.diagnostic(`35 cases / ${checked} executed C# provider frames; max absolute error=${maximumError}, tolerance=2e-14; worst=${worst}`);
});
