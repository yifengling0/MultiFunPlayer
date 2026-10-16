import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return nextResolve(specifier + '.ts', context);
  return nextResolve(specifier, context);
} });
const { AxisMapping: Mapping } = await import('../entry/src/main/ets/core/AxisMapping.ts');
const names = (...args) => Mapping.findAxesMatchingName(...args).map(axis => axis.name);

test('upstream enabled aliases match case-insensitively only at final dot suffix', () => {
  for (const [axis, aliases] of [['L0', ['stroke', 'L0', 'up']], ['L1', ['surge', 'L1', 'forward']],
    ['L2', ['sway', 'L2', 'left']], ['R0', ['twist', 'R0', 'yaw']], ['R1', ['roll', 'R1']], ['R2', ['pitch', 'R2']]]) {
    for (const alias of aliases) assert.deepEqual(names('movie.' + alias.toUpperCase() + '.FUNSCRIPT'), [axis]);
  }
  for (const name of ['movie.funscript', 'movie.myroll.funscript', 'movie.roll.extra.funscript', 'movie.heave.funscript']) {
    assert.deepEqual(names(name), ['L0']);
  }
});
test('disabled and unavailable known aliases never wildcard to stroke', () => {
  for (const alias of ['vib', 'pump', 'lube', 'suck', 'valve', 'L3', 'V0', 'V1', 'A0', 'A1', 'A2']) {
    assert.deepEqual(names('movie.' + alias + '.funscript'), []);
  }
  assert.deepEqual(names('movie.L3.funscript', 'TCode-0.3', true), []);
  assert.deepEqual(names('movie.A0.funscript', 'TCode-0.2', true), []);
});
test('profile-dependent aliases are not merged into fabricated universal aliases', () => {
  for (const [profile, alias, axis] of [['TCode-0.2', 'lube', 'V1'], ['TCode-0.2', 'valve', 'L3'],
    ['TCode-0.2', 'suck', 'L3'], ['TCode-0.3', 'lube', 'A2'], ['TCode-0.3', 'valve', 'A0'],
    ['TCode-0.3', 'suck', 'A1'], ['TCode-0.3', 'vib', 'V0']]) {
    assert.deepEqual(names('movie.' + alias + '.funscript', profile, true), [axis]);
  }
  assert.throws(() => Mapping.defaultAxes('invented'));
});
test('paths, media matching and empty names behave predictably', () => {
  assert.deepEqual(names('/documents/movie.ROLL.funscript'), ['R1']);
  assert.deepEqual(names('C:\\scripts\\movie.pitch.funscript'), ['R2']);
  assert.deepEqual(names('movie.roll.funscript', 'TCode-0.3', false, '/media/MOVIE.mp4'), ['R1']);
  assert.deepEqual(names('movie.funscript', 'TCode-0.3', false, 'movie.mkv'), ['L0']);
  assert.deepEqual(names('different.roll.funscript', 'TCode-0.3', false, 'movie.mp4'), []);
  assert.deepEqual(names(''), []);
  assert.throws(() => names(null));
  assert.throws(() => names('x'.repeat(4097)));
});
test('callers cannot corrupt future default mappings', () => {
  const axes = Mapping.defaultAxes(); axes[0].funscriptNames.length = 0; axes[0].name = 'oops';
  assert.deepEqual(names('movie.funscript'), ['L0']);
  assert.equal(Mapping.defaultAxes('TCode-0.2').length, 9);
  assert.equal(Mapping.defaultAxes('TCode-0.3').length, 11);
});

test('parseScript maps conventional actions without overwriting explicit embedded axes', () => {
  const ordinary = JSON.stringify({ actions: [{ at: 0, pos: 5 }],
    metadata: { bookmarks: [{ name: 'Start', time: '00:00:00' }] } });
  for (const [suffix, expected] of [['pitch', 'R2'], ['surge', 'L1'], ['sway', 'L2'],
    ['unknown', 'L0'], ['lube', 'L0']]) {
    const doc = Mapping.parseScript(ordinary, 'movie.' + suffix + '.funscript');
    assert.equal(doc.axes[0].name, expected);
    assert.equal(doc.metadata.bookmarks[0].name, 'Start');
  }
  const embedded = Mapping.parseScript(JSON.stringify({ axes: [{ id: 'R0', actions: [] }] }), 'movie.pitch.funscript');
  assert.equal(embedded.axes[0].name, 'R0');
  const explicitEmpty = Mapping.parseScript(JSON.stringify({ actions: [], axes: [] }), 'movie.pitch.funscript');
  assert.equal(explicitEmpty.axes[0].name, 'L0');
  const named = Mapping.parseScript(JSON.stringify({ axes: { L2: { actions: [] } } }), 'movie.pitch.funscript');
  assert.equal(named.axes[0].name, 'L2');
  assert.throws(() => Mapping.parseScript('{', 'movie.funscript'));
});
