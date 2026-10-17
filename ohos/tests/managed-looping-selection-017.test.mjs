import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';

registerHooks({ resolve(specifier, context, next) {
  return next(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? specifier + '.ts' : specifier, context);
} });
const { ResourceFileEntry, ResourceLibrary } = await import('../entry/src/main/ets/core/ResourceLibrary.ts');
const { resolveManagedLoopingSelection: resolve, parseManagedLoopingScript: parse } = await import('../entry/src/main/ets/input/ManagedLoopingSelection.ts');
const entry = (uri = 'opaque:download/first', name = 'clip.funscript', path = name) => new ResourceFileEntry(uri, name, path);

test('managed Looping resolves exact catalog URI and returns an independent metadata copy', () => {
  const original = entry();
  const selected = resolve(original.uri, [original]);
  assert.deepEqual(selected, original); assert.notEqual(selected, original);
  selected.uri = 'changed'; selected.name = 'changed'; selected.relativePath = 'changed';
  assert.deepEqual(original, entry());
});

test('managed Looping never resolves labels, basename fallback, case changes or decoded identities', () => {
  const file = entry('file://docs/Download/app/clip%20one.funscript', 'clip one.funscript', 'nested/clip one.funscript');
  for (const identity of [file.name, 'nested', '/private/clip one.funscript', '../clip one.funscript',
    file.uri.toUpperCase(), decodeURIComponent(file.uri), ' ' + file.uri, file.uri + ' ', file.uri + '?x=1']) {
    assert.throws(() => resolve(identity, [file]), /not in the current Download scan/, identity);
  }
  assert.equal(resolve(file.uri, [file]).uri, file.uri);
  assert.equal(resolve(file.relativePath, [file]).uri, file.uri);
});

test('managed Looping identical basenames remain distinct through exact URI identity', () => {
  const a = entry('catalog:a', 'same.funscript', 'a/same.funscript');
  const b = entry('catalog:b', 'same.funscript', 'b/same.funscript');
  assert.equal(resolve(b.uri, [a, b]).relativePath, 'b/same.funscript');
  assert.throws(() => resolve('same.funscript', [a, b]), /not in the current/);
});

test('managed Looping rejects duplicate URI identity even for identical entries or mixed extensions', () => {
  for (const duplicate of [entry(), entry(undefined, 'other.funscript'), entry(undefined, 'video.mp4')]) {
    assert.throws(() => resolve('opaque:download/first', [entry(), duplicate]), /ambiguous/);
  }
});

test('managed Looping exact relative keys reject cross-namespace and duplicate-path ambiguity', () => {
  const a = entry('catalog:a', 'a.funscript', 'folder/a.funscript');
  const b = entry(a.relativePath, 'b.funscript');
  assert.throws(() => resolve(a.relativePath, [a, b]), /ambiguous/);
  assert.throws(() => resolve(a.relativePath, [a, entry('catalog:b', a.name, a.relativePath)]), /ambiguous/);
  assert.throws(() => resolve(a.relativePath, [a, entry(a.uri, 'other.funscript')]), /ambiguous/);
  const same = entry('same.funscript', 'same.funscript');
  assert.deepEqual(resolve('same.funscript', [same]), same, 'one entry matching both keys is not double counted');
});

test('managed Looping empty, null, missing, controls and oversized command arguments never mean clear', () => {
  for (const identity of ['', '   ', null, undefined, 42, {}, [], 'a\0b', 'a\u0085b', 'x'.repeat(4097)]) {
    assert.throws(() => resolve(identity, [entry()]), /nonempty script identity/);
  }
  assert.throws(() => resolve(entry().uri, []), /not in the current/);
});

test('managed Looping allows only a nonempty .funscript filename, preserving exact URI spelling', () => {
  for (const name of ['clip.mp4', 'clip.zip', 'clip.mfunscript', 'clip.funscript.txt', '.funscript', ' .funscript']) {
    const file = entry('opaque:' + name, name);
    assert.throws(() => resolve(file.uri, [file]), /Choose a \.funscript/);
  }
  const accepted = entry('/Download/app/CLIP.FUNSCRIPT', 'CLIP.FUNSCRIPT');
  assert.deepEqual(resolve(accepted.uri, [accepted]), accepted);
});

test('managed Looping validates the bounded catalog without normalizing or mutating its fields', () => {
  for (const malformed of [null, [], {}, { uri: 1, name: 'a.funscript', relativePath: 'a.funscript' },
    entry('catalog:bad', 'a/b.funscript'), entry('catalog:bad', 'clip.funscript', '../clip.funscript'),
    entry('catalog:bad', 'clip.funscript', '/clip.funscript'), entry('catalog:bad', 'clip.funscript', 'a//clip.funscript'),
    entry('catalog:bad', 'clip.funscript', 'a\\clip.funscript'), entry('catalog:bad', 'clip.funscript', 'C:/clip.funscript'),
    entry('catalog:bad', 'clip.funscript', 'other.funscript'), entry('catalog:bad', 'clip\n.funscript'),
    entry('x'.repeat(4097))]) {
    assert.throws(() => resolve(entry().uri, [entry(), malformed]), /invalid/);
  }
  assert.throws(() => resolve(entry().uri, null), /entry limit/);
  assert.throws(() => resolve(entry().uri, Array(ResourceLibrary.MAX_FILES + 1).fill(entry())), /entry limit/);
  const large = Array.from({ length: 600 }, (_, i) => entry('x'.repeat(4000) + i));
  assert.throws(() => resolve(large[0].uri, large), /text limit/);
  const frozen = Object.freeze(entry());
  assert.deepEqual(resolve(frozen.uri, Object.freeze([frozen])), frozen);
});

test('managed Looping resolver imports no native I/O and cannot treat command text as an opening argument', () => {
  const source = readFileSync(new URL('../entry/src/main/ets/input/ManagedLoopingSelection.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /@kit|fileIo|LibraryFiles|readScript\(|fetch\(|decodeURIComponent\(|new URL\(/);
  assert.match(source, /file\.uri === identity/);
  assert.match(source, /new ResourceFileEntry\(selected\.uri, selected\.name, selected\.relativePath\)/);
});

const actions = (pos, count = 2) => Array.from({ length: count }, (_, index) => ({ at: index * 1000, pos }));
const axis = (id, pos, count) => ({ id, actions: actions(pos, count) });
const parsed = (raw, target = 'R0', enabled = ['L0', 'R0', 'L1']) => parse(JSON.stringify(raw), target, enabled);

test('managed Looping conventional actions map to the chosen enabled target independent of L0 and filename aliases', () => {
  for (const axes of [undefined, [], {}]) {
    const document = parsed({ actions: actions(20), axes }, 'R0', ['R0']);
    assert.equal(document.axes.length, 1); assert.equal(document.axes[0].name, 'R0');
    assert.equal(document.axes[0].actions[0].pos, 20);
  }
  assert.equal(parsed({ actions: actions(30) }, 'L1').axes[0].name, 'L1');
});

test('managed Looping multi-axis prefers enabled L0, uses embedded override, and ignores target-specific matching', () => {
  const resource = parsed({ actions: actions(10), axes: [axis('R0', 20), axis('L0', 80)] });
  assert.equal(resource.axes.length, 1); assert.equal(resource.axes[0].name, 'L0');
  assert.equal(resource.axes[0].actions[0].pos, 80);
  const fromTop = parsed({ actions: actions(10), axes: [axis('R0', 20)] });
  assert.equal(fromTop.axes[0].name, 'L0'); assert.equal(fromTop.axes[0].actions[0].pos, 10);
});

test('managed Looping multi-axis fallback preserves source insertion order rather than profile or target order', () => {
  for (const axes of [[axis('X9', 5), axis('L1', 60), axis('R0', 20)],
    { X9: { actions: actions(5) }, L1: { actions: actions(60) }, R0: { actions: actions(20) } }]) {
    const resource = parsed({ actions: actions(10), axes }, 'R0', ['R0', 'L1']);
    assert.equal(resource.axes[0].name, 'L1'); assert.equal(resource.axes[0].actions[0].pos, 60);
  }
  const noTopL0 = parsed({ actions: [], axes: [axis('L1', 60), axis('R0', 20)] });
  assert.equal(noTopL0.axes[0].name, 'L1', 'empty top-level actions do not introduce L0');
});

test('managed Looping missing, empty and unrecognized resources fail; one-point selected resource remains one point', () => {
  for (const raw of [{ actions: [] }, { axes: [axis('X9', 20)] },
    { axes: [axis('L1', 20, 0), axis('R0', 30)] }, { axes: [axis('L0', 20, 0), axis('R0', 30)] }]) {
    assert.throws(() => parsed(raw), /no usable selected resource/);
  }
  const one = parsed({ axes: [axis('L0', 20, 1), axis('R0', 30)] });
  assert.equal(one.axes[0].actions.length, 1); assert.equal(one.axes[0].actions[0].pos, 20);
});

test('managed Looping validates unknown axes and original bounded parser limits before dropping unsupported resources', () => {
  for (const raw of [{ axes: [axis('X9', NaN), axis('R0', 20)] },
    { axes: [axis('../private', 10), axis('R0', 20)] }, { axes: [axis('R0', 10), axis('R0', 20)] },
    { axes: [axis('X9', 101), axis('R0', 20)] }, { actions: [{ at: 86400001, pos: 20 }] },
    { actions: [{ at: .5, pos: 20 }] }, { actions: Array(100001).fill({ at: 0, pos: 20 }) }]) {
    assert.throws(() => parsed(raw));
  }
  assert.throws(() => parse('x'.repeat(8 * 1024 * 1024 + 1), 'R0', ['R0']), /8 MiB/);
  for (const enabled of [null, [], ['L0'], ['R0', 'R0'], ['R0', '../axis'], Array(33).fill('R0')]) {
    assert.throws(() => parsed({ actions: actions(20) }, 'R0', enabled), /unavailable or disabled/);
  }
});

test('managed Looping retains bounded metadata and parser duplicate-time semantics without mutating input', () => {
  const raw = { actions: [{ at: 1000, pos: 20 }, { at: 0, pos: 30 }, { at: 0, pos: 70 }], metadata: {
    chapters: [{ name: 'start', startTime: '00:00:00', endTime: '00:00:01' }], bookmarks: [{ name: 'mark', time: '00:00:00.5' }] } };
  const before = JSON.stringify(raw); const document = parsed(raw);
  assert.deepEqual(document.axes[0].actions.map(point => [point.at, point.pos]), [[0, 70], [1000, 20]]);
  assert.equal(document.metadata.chapters[0].name, 'start'); assert.equal(document.metadata.bookmarks[0].timeMs, 500);
  assert.equal(JSON.stringify(raw), before);
});
