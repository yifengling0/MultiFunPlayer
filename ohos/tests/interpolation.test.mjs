import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? specifier + '.ts' : specifier, context);
} });
const { FunscriptParser } = await import('../entry/src/main/ets/core/Funscript.ts');
const { interpolateAxis } = await import('../entry/src/main/ets/core/Interpolation.ts');
const fixture = JSON.parse(readFileSync(new URL('./fixtures/interpolation-golden.json', import.meta.url)));
const modes = ['linear', 'pchip', 'makima', 'step'];
const axis = actions => FunscriptParser.parse(JSON.stringify({ actions: actions.map(([at, pos]) => ({ at, pos })) })).axes[0];

test('golden reference transparently identifies evidence and pinned source content', () => {
  assert.equal(fixture.provenance.executedCSharp, false);
  assert.equal(fixture.provenance.kind, 'independent-python-exact-rational-reference');
  for (const [path, expected] of Object.entries(fixture.provenance.sourceSha256)) {
    const content = readFileSync(new URL('../../' + path, import.meta.url));
    assert.equal(createHash('sha256').update(content).digest('hex'), expected, path);
  }
});
for (const row of fixture.cases) {
  test(`independent golden: ${row.mode} / ${row.name}`, () => {
    const input = axis(row.actions);
    const before = JSON.stringify(input);
    for (const sample of row.samples) {
      const actual = interpolateAxis(input, sample.timeMs, row.mode);
      assert.ok(Number.isFinite(actual) && actual >= 0 && actual <= 100);
      // Seconds conversion near 24h with 1ms segments loses some precision;
      // this absolute preview-unit tolerance remains below 1e-7 of full range.
      const tolerance = row.name === 'long-offset-short-segments' ? 1e-5 : 1e-9;
      assert.ok(Math.abs(actual - sample.expected) <= tolerance,
        `t=${sample.timeMs}: ${actual} vs ${sample.expected}`);
    }
    assert.equal(JSON.stringify(input), before, 'sampling must not mutate axis');
  });
}
test('all modes hit exact points; step chooses new value at exact timestamps', () => {
  const actions = [[19, 1], [23, 99], [100, 4], [1000, 66]];
  for (const mode of modes) {
    for (const [time, expected] of actions) {
      assert.ok(Math.abs(interpolateAxis(axis(actions), time, mode) - expected) < 1e-12);
    }
  }
  assert.equal(interpolateAxis(axis(actions), 22.999, 'step'), 1);
  assert.equal(interpolateAxis(axis(actions), 23, 'step'), 99);
});
test('two-point cubic endpoint slopes follow upstream padding rather than linear fallback', () => {
  const input = axis([[0, 0], [1000, 100]]);
  assert.equal(interpolateAxis(input, 250, 'linear'), 25);
  assert.equal(interpolateAxis(input, 250, 'pchip'), 15.625);
  assert.notEqual(interpolateAxis(input, 250, 'makima'), 25);
});
test('raw Makima overshoot is clamped separately for preview', () => {
  const overshoots = fixture.cases.filter(row => row.mode === 'makima').flatMap(row =>
    row.samples.filter(sample => sample.rawNormalized > 1 || sample.rawNormalized < 0)
      .map(sample => ({ row, sample })));
  assert.ok(overshoots.length > 0, 'fixture must exercise actual overshoot');
  for (const { row, sample } of overshoots) {
    assert.equal(interpolateAxis(axis(row.actions), sample.timeMs, row.mode), sample.expected);
  }
});
test('nonfinite times and unsupported runtime modes are rejected, even for empty axes', () => {
  for (const actions of [[], [[0, 50]], [[0, 0], [100, 100]]]) {
    for (const mode of modes) {
      for (const time of [NaN, Infinity, -Infinity]) {
        assert.throws(() => interpolateAxis(axis(actions), time, mode), /finite/);
      }
    }
    assert.throws(() => interpolateAxis(axis(actions), 0, 'cubic'), /Unsupported/);
  }
});
