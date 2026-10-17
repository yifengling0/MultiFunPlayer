import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { OpenSimplex } from '../entry/src/main/ets/core/motion/OpenSimplex.ts';

test('C# oracle provenance pins original source, source commit and executed runtime', () => {
  assert.equal(provenance.executedCSharp, true);
  assert.equal(provenance.kind, 'original-csharp-source-extracted-with-host-shims');
  assert.equal(provenance.sourceCommit, '36c08fbb99ac9398a63ff1cca1bbf68cd2228a94');
  assert.equal(provenance.runtime, '9.0.21 linux-x64');
  assert.equal(provenance.sdk, '9.0.319');
  const manifest = JSON.parse(readFileSync(new URL('../tools/reference/source-manifest.json', import.meta.url)));
  assert.equal(manifest.sourceCommit, provenance.sourceCommit);
  assert.equal(Object.keys(provenance.sourceSha256).length, 20);
  assert.deepEqual(provenance.sourceSha256, manifest.sources);
  for (const [path, expected] of Object.entries(provenance.sourceSha256)) {
    const source = readFileSync(new URL('../../' + path, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
    assert.equal(createHash('sha256').update(source).digest('hex'), expected, path);
  }
  assert.deepEqual(fixture.extremeCoordinateProvenance, provenance);
  assert.deepEqual(fixture.int32CastProvenance, provenance);
  assert.equal(fixture.int32CastKind, 'dotnet-runtime-conversion-probe-not-source-extraction');
});

test('252 original C# samples: signed seeds, lattice boundaries, negative coordinates and octaves', t => {
  const noises = new Map();
  let maxError = 0;
  let worst = null;
  assert.equal(rows.length, 252);
  for (const row of rows) {
    if (!noises.has(row.seed)) { noises.set(row.seed, new OpenSimplex(BigInt(row.seed))); }
    const actual = noises.get(row.seed).calculateOctaves2D(row.x, row.y, row.octaves, row.persistence, row.lacunarity);
    const error = Math.abs(actual - row.value);
    if (error > maxError) { maxError = error; worst = row; }
    assert.ok(error <= 2e-14, `${JSON.stringify(row)}: actual=${actual}, error=${error}`);
  }
  t.diagnostic(`252 executed C# samples; max absolute error=${maxError}, tolerance=2e-14; worst=${JSON.stringify(worst)}`);
});

// Independent 16-bit-limb LCG/remainder calculation. All numeric arithmetic is
// exact below 2^53; BigInt only decodes the initial test seed, never multiplies.
// This is a second route for detecting silent Number precision and sign bugs.
function limbPermutation(seed) {
  let word = Array.from({length: 4}, (_, i) => Number(BigInt.asUintN(64, seed) >> BigInt(16 * i) & 65535n));
  const multiplier = [0x7f2d, 0x4c95, 0xf42d, 0x5851];
  const increment = [0x814f, 0xf767, 0x7b7e, 0x1405];
  const source = Array.from({length: 2048}, (_, i) => i);
  const result = [];
  for (let i = 2047; i >= 0; i--) {
    let carry = 0;
    const next = [];
    for (let k = 0; k < 4; k++) {
      let total = carry + increment[k];
      for (let j = 0; j <= k; j++) { total += word[j] * multiplier[k - j]; }
      next.push(total % 65536); carry = Math.floor(total / 65536);
    }
    word = next;
    const shifted = word.slice();
    carry = 31;
    for (let k = 0; k < 4; k++) {
      const total = shifted[k] + carry;
      shifted[k] = total % 65536; carry = Math.floor(total / 65536);
    }
    let remainder = 0;
    let power64 = 1 % (i + 1);
    for (let k = 3; k >= 0; k--) {
      remainder = (remainder * 65536 + shifted[k]) % (i + 1);
      power64 = power64 * 65536 % (i + 1);
    }
    if (shifted[3] >= 32768) { remainder = (remainder - power64 + i + 1) % (i + 1); }
    result[i] = source[remainder]; source[remainder] = source[i];
  }
  return result;
}

test('all 2048 permutation entries agree with independent limb arithmetic and Python golden hashes', () => {
  for (const row of permutationGoldens) {
    const seed = BigInt(row.seed);
    const noise = new OpenSimplex(seed);
    assert.deepEqual(noise.permutation, limbPermutation(seed), row.seed);
    const hash = createHash('sha256').update(noise.permutation.join(',')).digest('hex');
    assert.equal(hash, row.permutationSha256, row.seed);
    assert.equal(new Set(noise.permutation).size, 2048);
  }
});

test('seed+31 has its OWN signed overflow, and seeds normalize to signed 64-bit', () => {
  const seed = -3238533541855260418n;
  const next = BigInt.asIntN(64, seed * 6364136223846793005n + 1442695040888963407n);
  assert.equal(next, 9223372036854775797n);
  assert.ok(BigInt.asIntN(64, next + 31n) < 0);
  const normalized = new OpenSimplex(0n);
  assert.deepEqual(new OpenSimplex(1n << 64n).permutation, normalized.permutation);
  assert.deepEqual(new OpenSimplex(-(1n << 64n)).permutation, normalized.permutation);
});

test('one octave is raw noise and zero octaves remains NaN at the low-level source boundary', () => {
  const noise = new OpenSimplex(-1n);
  assert.equal(noise.calculateOctaves2D(.3, -.7, 1, .65, 1.8), noise.calculate2D(.3, -.7));
  assert.ok(Number.isNaN(noise.calculateOctaves2D(.3, -.7, 0, .65, 1.8)));
});

test('extreme coordinates preserve .NET9 Int32 conversion and original lattice-index failures', () => {
  assert.equal(fixture.extremeCoordinateCases.length, 10);
  for (const row of fixture.extremeCoordinateCases) {
    const noise = new OpenSimplex(BigInt(row.seed));
    const sample = () => noise.calculateOctaves2D(row.x, row.y, row.octaves, row.persistence, row.lacunarity);
    if (row.exception !== undefined) {
      assert.equal(row.exception, 'System.IndexOutOfRangeException');
      assert.throws(sample, /lattice index is out of range.*IndexOutOfRangeException/, JSON.stringify(row));
    } else {
      assert.equal(sample(), row.value, JSON.stringify(row));
    }
  }
  for (const row of fixture.int32CastCases) {
    assert.equal(OpenSimplex.toInt32(Number(row.input)), row.result, '.NET9 (int)' + row.input);
  }
});

// Generated from the original C# source; runtime/hash/command accompany the fixture.
const fixture = JSON.parse(readFileSync(new URL('./fixtures/motion-noise-golden.json', import.meta.url)));
const provenance = fixture.provenance;
const rows = fixture.rows;
const permutationGoldens = [{"seed": "0", "permutationSha256": "99ef08464bd1623a5b91bc42da31eaa2f7bab9a0c9243e88f9e0cc507214faee"}, {"seed": "1", "permutationSha256": "dd8e999c30c0ab7c8dda5b72b1e4c4336643155af120a2cb1a9e2bc8f39cffb8"}, {"seed": "-1", "permutationSha256": "c96eadbd2822fade81c82c31b045203b5059e6bac8aafb0a552bc48663dc45e1"}, {"seed": "9223372036854775807", "permutationSha256": "202066a50b7de5d5d08daf292813caf10d1029f3eaaaeb45712fccdde7b00e8c"}, {"seed": "-9223372036854775808", "permutationSha256": "c3da93b51708061f01294964867762a84d5ee9772530bb9e235ac2146655042e"}, {"seed": "-3238533541855260418", "permutationSha256": "940f6a82d1c6c4142401085455da53c8ac932f2845cefcf792d1a0bb4d60c31f"}];
