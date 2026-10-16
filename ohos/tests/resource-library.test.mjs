import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return nextResolve(specifier + '.ts', context);
  return nextResolve(specifier, context);
} });
const { ResourceLibrary: Library, ResourceFileEntry: File, ResourceLibraryCatalog: SearchCatalog } = await import('../entry/src/main/ets/core/ResourceLibrary.ts');
const { FunscriptParser: Parser } = await import('../entry/src/main/ets/core/Funscript.ts');
const { AxisMapping } = await import('../entry/src/main/ets/core/AxisMapping.ts');
const file = (path, uri = 'file://' + path) => new File(uri, path.replace(/\\/g, '/').split('/').at(-1), path);
const catalog = paths => Library.build(paths.map(path => file(path)));
const source = (path, data = { actions: [{ at: 0, pos: 50 }] }, uri) =>
  Library.parseCandidate(JSON.stringify(data), file(path, uri));
const values = result => result.document?.axes.map(axis => [axis.name, axis.actions[0]?.pos]);
const ordinary = pos => ({ actions: [{ at: 0, pos }] });
const embedded = (id, pos) => ({ axes: [{ id, actions: [{ at: 0, pos }] }] });

test('catalog discovers initial video containers and reports unsupported files', () => {
  const result = catalog(['a.mp4', 'b.MKV', 'c.ts', 'd.m4v', 'e.avi', 'notes.txt']);
  assert.deepEqual(result.items.map(item => [item.title, item.status]),
    [['a', 'video-only'], ['b', 'video-only'], ['c', 'video-only'], ['d', 'video-only']]);
  assert.deepEqual(result.ignoredFiles.map(file => file.name), ['e.avi', 'notes.txt']);
});

test('filenames and aliases ignore case but same-stem files never cross parent directories', () => {
  const result = catalog(['one/Movie.MP4', 'one/MOVIE.PITCH.FUNSCRIPT', 'two/movie.funscript', 'One/movie.funscript']);
  const paired = result.items.find(item => item.parentPath === 'one');
  assert.equal(paired.status, 'paired');
  assert.equal(paired.scripts[0].axisName, 'R2');
  assert.equal(result.items.filter(item => item.status === 'script-only').length, 2);
  assert.deepEqual(catalog(['a\\movie.mp4', 'a/movie.funscript']).items.map(item => item.status), ['paired']);
});

test('upstream loose discovery preserves all media.*funscript candidates before content inspection', () => {
  const item = catalog(['movie.mp4', 'movie.funscript', 'movie.unknown.funscript', 'movie.customfunscript',
    'movie2.funscript', 'movieExtra.pitch.funscript']).items.find(item => item.title === 'movie');
  assert.deepEqual(item.scripts.map(match => match.file.name),
    ['movie.customfunscript', 'movie.funscript', 'movie.unknown.funscript']);
  const unknown = source('movie.unknown.funscript', embedded('R2', 33));
  assert.deepEqual(values(Library.selectDocuments('movie.mp4', [unknown])), [['R2', 33]]);
});

test('catalog recognizes exact same-stem ZIPs including archive-only resources', () => {
  const result = catalog(['one/Movie.MP4', 'one/MOVIE.ZIP', 'one/movie.pitch.zip', 'two/movie.zip', 'notes.rar']);
  const paired = result.items.find(item => item.id === 'one/movie');
  assert.equal(paired.status, 'paired');
  assert.equal(paired.scripts.length, 0);
  assert.deepEqual(paired.archives.map(file => file.name), ['MOVIE.ZIP']);
  assert.equal(paired.video.name, 'Movie.MP4');
  assert.deepEqual(result.items.filter(item => item.status === 'script-only').map(item => item.id),
    ['one/movie.pitch', 'two/movie']);
  assert.deepEqual(result.ignoredFiles.map(file => file.name), ['notes.rar']);
  const duplicate = Library.build([file('movie.mp4'), file('movie.zip', 'shared'), file('movie.ZIP', 'shared')]).items[0];
  assert.equal(duplicate.status, 'ambiguous');
  assert.equal(duplicate.archives.length, 2);
});

test('search plan follows media ZIP, media loose, then ordered library ZIP and loose tiers', () => {
  const media = file('movies/Movie.mp4');
  const local = ['movies/movie.pitch.funscript', 'movies/movie.zip', 'movies/movie.funscript',
    'movies/movie.unknown.funscript', 'movies/movie.customfunscript', 'movies/movieExtra.funscript',
    'movies/sub/movie.zip', 'movies/sub/movie.funscript', 'elsewhere/movie.zip', 'movies/movie.pitch.zip'].map(path => file(path));
  const libraries = [new SearchCatalog('first-root', ['z/movie.funscript', 'z/movie.zip', 'a/movie.zip',
    'a/movie.pitch.funscript', 'movie.funscript'].map(path => file(path, 'first:' + path)), true),
    new SearchCatalog('second-root', ['movie.zip', 'movie.funscript'].map(path => file(path, 'second:' + path)))];
  const plan = Library.planSearch(media, local, libraries, 'selected-media-root');
  assert.deepEqual(plan.map(entry => [entry.kind, entry.rootIdentity, entry.file.relativePath]), [
    ['zip', 'selected-media-root', 'movies/movie.zip'],
    ['script', 'selected-media-root', 'movies/movie.customfunscript'],
    ['script', 'selected-media-root', 'movies/movie.funscript'],
    ['script', 'selected-media-root', 'movies/movie.pitch.funscript'],
    ['script', 'selected-media-root', 'movies/movie.unknown.funscript'],
    ['zip', 'first-root', 'a/movie.zip'], ['zip', 'first-root', 'z/movie.zip'],
    ['script', 'first-root', 'a/movie.pitch.funscript'], ['script', 'first-root', 'movie.funscript'],
    ['script', 'first-root', 'z/movie.funscript'],
    ['zip', 'second-root', 'movie.zip'], ['script', 'second-root', 'movie.funscript']
  ]);
  assert.deepEqual(plan.map(entry => [entry.source, entry.libraryIndex]),
    [...Array(5).fill(['media', -1]), ...Array(5).fill(['library', 0]), ...Array(2).fill(['library', 1])]);
});

test('nonrecursive libraries use root-relative direct children and never infer files from root identity or URI', () => {
  const entries = ['Movie.ZIP', 'movie.FUNSCRIPT', 'nested/movie.zip', 'nested/movie.funscript'].map(path => file(path));
  const root = 'file://opaque/provider%2Fnot-a-path/../identity';
  const direct = Library.planSearch(file('movie.mp4'), [], [new SearchCatalog(root, entries)]);
  assert.deepEqual(direct.map(entry => entry.file.name), ['Movie.ZIP', 'movie.FUNSCRIPT']);
  assert.ok(direct.every(entry => entry.rootIdentity === root));
  assert.equal(Library.planSearch(file('movie.mp4'), [], [new SearchCatalog(root, [], true)]).length, 0);
  assert.equal(Library.planSearch(file('movie.mp4'), [], [new SearchCatalog(root, entries, true)]).length, 4);
  assert.deepEqual(Library.planSearch(file('one/movie.mp4'), [file('One/movie.zip'), file('two/movie.funscript')], []), []);
});

test('search order preserves configured library order, duplicate sources and isolated output objects', () => {
  const earlier = new SearchCatalog('z-root', [file('movie.funscript', 'same')]);
  const later = new SearchCatalog('a-root', [file('movie.funscript', 'same')]);
  const plan = Library.planSearch(file('movie.mp4'), [], [earlier, later, earlier]);
  assert.deepEqual(plan.map(entry => entry.rootIdentity), ['z-root', 'a-root', 'z-root']);
  assert.deepEqual(plan.map(entry => entry.libraryIndex), [0, 1, 2]);
  earlier.files[0].name = 'mutated.funscript';
  assert.equal(plan[0].file.name, 'movie.funscript');
  plan[0].file.uri = 'changed';
  assert.equal(plan[2].file.uri, 'same');
  assert.equal(later.files[0].uri, 'same');
});

test('search plan validates every catalog and bounds combined files and text atomically', () => {
  const media = file('movie.mp4');
  for (const bad of [null, {}, 'files']) {
    assert.throws(() => Library.planSearch(media, bad, []));
    assert.throws(() => Library.planSearch(media, [], bad));
  }
  for (const bad of [null, [], {}, new SearchCatalog('', []), new SearchCatalog('root', [], 'yes'),
    new SearchCatalog('root', [new File('u', 'movie.zip', '../movie.zip')]),
    new SearchCatalog('root', null), new SearchCatalog('bad\nroot', [])]) {
    assert.throws(() => Library.planSearch(media, [], [bad]));
  }
  assert.throws(() => Library.planSearch(null, [], []));
  assert.throws(() => Library.planSearch(media, [], [], ''));
  assert.throws(() => Library.planSearch(media, [], Array(Library.MAX_LIBRARIES + 1).fill(new SearchCatalog('root', []))));
  assert.throws(() => Library.planSearch(media, Array(1001).fill(file('movie.zip')),
    [new SearchCatalog('root', Array(1000).fill(file('movie.funscript')))]));
  assert.throws(() => Library.planSearch(media, [],
    [new SearchCatalog('root', Array.from({ length: 1000 }, (_, index) => file(index + '.zip', 'u'.repeat(3000))))]));
});

test('search order survives invalid-source skips and ZIP entry order before content-led selection', () => {
  const media = file('movie.mp4');
  const plan = Library.planSearch(media, [file('movie.zip'), file('movie.funscript')], [
    new SearchCatalog('library', [file('movie.zip', 'library:zip'), file('movie.pitch.funscript', 'library:loose')])]);
  // The IO layer expands each ZIP in central-directory order without sorting by
  // entry name and catches malformed entries one at a time. Archive matching is
  // by the outer name; embedded resources can have unrelated entry names.
  const content = new Map([
    ['file://movie.zip', [['z/invalid.funscript', '{'], ['z/anything.funscript', JSON.stringify(embedded('R2', 12))],
      ['a/first-alphabetically.funscript', JSON.stringify(embedded('L0', 99))]]],
    ['file://movie.funscript', [['movie.funscript', JSON.stringify(ordinary(50))]]],
    ['library:zip', [['movie.funscript', JSON.stringify(embedded('L0', 66))]]],
    ['library:loose', [['movie.pitch.funscript', JSON.stringify(ordinary(70))]]]
  ]);
  const candidates = [];
  for (const entry of plan) {
    for (const [path, json] of content.get(entry.file.uri)) {
      try { candidates.push(Library.parseCandidate(json, file(path, entry.file.uri + '!' + path))); } catch {}
    }
  }
  assert.deepEqual(values(Library.selectDocuments(media.name, candidates)), [['R2', 12]]);
  assert.deepEqual(candidates.map(candidate => candidate.file.name),
    ['anything.funscript', 'first-alphabetically.funscript', 'movie.funscript', 'movie.funscript', 'movie.pitch.funscript']);
});

test('discovery tiers remain subordinate to global multi-axis and per-axis alias priorities', () => {
  const plan = Library.planSearch(file('movie.mp4'), [file('movie.stroke.funscript')], [
    new SearchCatalog('configured', [file('movie.funscript', 'library:base'), file('movie.unknown.funscript', 'library:multi')])]);
  const singles = plan.slice(0, 2).map((entry, index) => Library.parseCandidate(JSON.stringify(ordinary(index + 10)), entry.file));
  assert.deepEqual(values(Library.selectDocuments('movie.mp4', singles)), [['L0', 11]]);
  const multi = Library.parseCandidate(JSON.stringify(embedded('R1', 88)), plan[2].file);
  assert.deepEqual(values(Library.selectDocuments('movie.mp4', [...singles, multi])), [['R1', 88]]);
});

test('unmatched scripts and videos remain visible including disabled and unavailable suffix hints', () => {
  const result = catalog(['a.mp4', 'b.funscript', 'b.pitch.funscript', 'b.vib.funscript', 'c.L3.funscript']);
  assert.deepEqual(result.items.map(item => item.status), ['video-only', 'script-only', 'script-only']);
  assert.deepEqual(result.items[1].scripts.map(match => [match.axisName, match.enabled]),
    [['L0', true], ['R2', true], ['V0', false]]);
  assert.equal(result.items[2].scripts[0].axisName, '');
});

test('duplicate videos require explicit selection and do not expose a guessed video', () => {
  const item = catalog(['movie.mp4', 'movie.mkv', 'movie.funscript']).items[0];
  assert.equal(item.status, 'ambiguous');
  assert.equal(item.video, undefined);
  assert.equal(item.videos.length, 2);
  assert.match(item.reasons.join(' '), /More than one video/);
});

test('duplicate base scripts and alias collisions retain candidates for upstream first-wins selection', () => {
  const entries = [file('movie.mp4'), file('movie.funscript', 'uri:b'), file('movie.funscript', 'uri:a'),
    file('movie.stroke.funscript'), file('movie.L0.funscript'), file('movie.R2.funscript'), file('movie.pitch.funscript')];
  const item = Library.build(entries).items[0];
  assert.equal(item.status, 'paired');
  assert.equal(item.scripts.length, 6);
  const candidates = item.scripts.map((match, index) => Library.parseCandidate(JSON.stringify(ordinary(index)), match.file));
  const selected = Library.selectDocuments('movie.mp4', candidates);
  assert.deepEqual(selected.selectedFiles.map(file => file.uri), ['uri:a', 'file://movie.pitch.funscript']);
});

test('repeated URI identities are ambiguous even when their names differ', () => {
  const result = Library.build([file('movie.mp4', 'shared'), file('movie.funscript', 'shared')]);
  assert.equal(result.items[0].status, 'ambiguous');
  assert.match(result.items[0].reasons.join(' '), /same resource URI/);
});

test('known suffixes in real media titles do not override upstream basename stripping', () => {
  const result = catalog(['movie.mp4', 'movie.pitch.mp4', 'movie.pitch.funscript']);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].scripts.length, 1);
  assert.equal(result.items[1].scripts.length, 1);
  const candidate = source('movie.pitch.funscript');
  assert.deepEqual(values(Library.selectDocuments('movie.mp4', [candidate])), [['R2', 50]]);
  assert.equal(Library.selectDocuments('movie.pitch.mp4', [candidate]).document, undefined);
});

test('catalog ordering is deterministic ordinal path order and input/output objects are isolated', () => {
  const entries = ['z/movie.mp4', 'a/Movie.mp4', 'a/movie.pitch.funscript', 'a/movie.R2.funscript', 'a/movie.funscript']
    .map(path => file(path));
  const expected = Library.build(entries);
  assert.deepEqual(Library.build(entries.slice().reverse()), expected);
  assert.deepEqual(expected.items[0].scripts.map(match => match.file.name),
    ['movie.R2.funscript', 'movie.funscript', 'movie.pitch.funscript']);
  entries[1].name = 'mutated.mp4';
  assert.equal(expected.items[0].videos[0].name, 'Movie.mp4');
  expected.items[0].videos[0].uri = 'modified';
  assert.notEqual(entries[1].uri, 'modified');
});

test('malformed file inputs fail atomically instead of entering ambiguous path buckets', () => {
  for (const value of [null, {}, 'files', 1]) assert.throws(() => Library.build(value));
  const invalid = [null, [], {}, { uri: 'u', name: 'a.mp4' },
    new File('', 'a.mp4'), new File('u', 'a.mp4', 'b.mp4'), new File('u', 'a/b.mp4'),
    new File('u', 'a.mp4', '/a.mp4'), new File('u', 'a.mp4', '../a.mp4'),
    new File('u', 'a.mp4', './a.mp4'), new File('u', 'a.mp4', 'x//a.mp4'),
    new File('u', 'a.mp4', 'C:/a.mp4'), new File('u', '.mp4'), new File('u\n', 'a.mp4'),
    new File('u', 'a.mp4', 'x\u0000/a.mp4')];
  for (const value of invalid) assert.throws(() => Library.build([file('valid.mp4'), value]));
  assert.throws(() => Library.build([], 'unknown'));
  assert.equal(catalog([]).items.length, 0);
});

test('catalog count, per-string and aggregate text caps reject before unbounded discovery', () => {
  assert.throws(() => Library.build(Array.from({ length: Library.MAX_FILES + 1 }, () => file('a.mp4'))));
  assert.throws(() => Library.build([file('a.mp4', 'x'.repeat(Library.MAX_STRING_LENGTH + 1))]));
  assert.throws(() => Library.build(Array.from({ length: 1000 }, (_, index) =>
    file(index + '.mp4', 'u'.repeat(3000) + index))));
});

test('provider-root prefixes are opaque identities and never URI-decoded', () => {
  const result = catalog(['selected-file%40docs/storage/movie.mp4', 'selected-file%40docs/storage/movie.funscript',
    'selected-file%40media/storage/movie.funscript', 'selected-file%40docs/storage%2Fmovie.funscript']);
  assert.equal(result.items.filter(item => item.status === 'paired').length, 1);
  assert.equal(result.items.filter(item => item.status === 'script-only').length, 2);
});

// Fixed vectors transcribed from DeviceAxisUtilsTests.cs and default device alias
// order at 36c08fbb99ac9398a63ff1cca1bbf68cd2228a94. The Windows C# executable was
// not run. Its test-only custom 'raw' alias is intentionally not a default alias.
test('pinned upstream script/media name vectors and alias priority', () => {
  for (const [name, media, expected] of [
    ['name.funscript', 'name.mp4', ['L0']], ['name.funscript', 'other.mp4', []],
    ['name.pitch.funscript', 'name.mp4', ['R2']], ['name.pitch.funscript', 'other.mp4', []],
    ['name.unknown.funscript', 'name.mp4', []]
  ]) {
    assert.deepEqual(Library.selectDocuments(media, [source(name)]).document?.axes.map(axis => axis.name) || [], expected);
  }
  const chosen = Library.selectDocuments('name.mp4', [source('name.L0.funscript', ordinary(1)),
    source('name.stroke.funscript', ordinary(2)), source('name.funscript', ordinary(3)),
    source('name.R2.funscript', ordinary(4)), source('name.pitch.funscript', ordinary(5))]);
  assert.deepEqual(values(chosen), [['L0', 3], ['R2', 5]]);
});

test('selector follows caller source order for same-name and same-alias sources', () => {
  const first = source('name.pitch.funscript', ordinary(12), 'first');
  const second = source('name.pitch.funscript', ordinary(99), 'second');
  assert.deepEqual(values(Library.selectDocuments('name.mp4', [first, second])), [['R2', 12]]);
  assert.deepEqual(values(Library.selectDocuments('name.mp4', [second, first])), [['R2', 99]]);
});

test('first embedded-axis document wins globally and blocks all missing-axis fallback', () => {
  const result = Library.selectDocuments('name.mp4', [source('name.funscript', ordinary(3)),
    source('name.unknown.funscript', embedded('R2', 55)), source('name.pitch.funscript', embedded('L0', 88)),
    source('name.roll.funscript', ordinary(20))]);
  assert.deepEqual(values(result), [['R2', 55]]);
  assert.deepEqual(result.blockedAxes, ['L0', 'L1', 'L2', 'R0', 'R1']);
  assert.deepEqual(result.selectedFiles.map(file => file.name), ['name.unknown.funscript']);
});

test('an embedded single enabled axis is multi-axis and empty embedded resources block fallback', () => {
  const candidate = source('name.pitch.funscript', { axes: [{ id: 'R2', actions: [] }] });
  assert.equal(candidate.isMultiAxis, true);
  const result = Library.selectDocuments('name.mp4', [candidate, source('name.funscript')]);
  assert.deepEqual(values(result), [['R2', undefined]]);
  assert.equal(result.document.durationMs, 0);
  assert.ok(result.blockedAxes.includes('L0'));
});

test('reader classification ignores disabled/unknown embedded axes like the active upstream device', () => {
  const unknown = source('name.funscript', embedded('X9', 20));
  assert.equal(unknown.isMultiAxis, false);
  assert.equal(unknown.hasSingleAxis, false);
  const result = Library.selectDocuments('name.mp4', [unknown, source('name.stroke.funscript')]);
  assert.equal(result.document, undefined);
  assert.deepEqual(result.blockedAxes, ['L0']);
  const mixed = source('name.funscript', { ...ordinary(10), axes: [{ id: 'V0', actions: [{ at: 0, pos: 90 }] }] });
  assert.equal(mixed.isMultiAxis, true);
  assert.deepEqual(values(Library.selectDocuments('name.mp4', [mixed])), [['L0', 10]]);
});

test('reader rejects invalid/no-action sources for the caller to skip individually', () => {
  for (const data of [{ actions: [] }, { actions: [], axes: [] }, {}, { actions: [{ at: -1, pos: 5 }] }]) {
    assert.throws(() => source('name.funscript', data));
  }
  assert.throws(() => Library.parseCandidate('{', file('name.funscript')));
  assert.equal(source('name.funscript', { ...ordinary(5), axes: [] }).isMultiAxis, false);
});

test('selection keeps L0 metadata first, or first selected axis metadata when L0 is absent', () => {
  const withMarker = (data, name) => ({ ...data, metadata: { bookmarks: [{ name, time: '00:00:00' }] } });
  const pitch = source('name.pitch.funscript', withMarker(ordinary(70), 'pitch'));
  const base = source('name.funscript', withMarker(ordinary(30), 'base'));
  const result = Library.selectDocuments('name.mp4', [pitch, base]);
  assert.equal(result.document.metadata.bookmarks[0].name, 'base');
  assert.equal(Library.selectDocuments('name.mp4', [pitch]).document.metadata.bookmarks[0].name, 'pitch');
  base.document.axes[0].actions[0].pos = 99;
  base.document.metadata.bookmarks[0].name = 'mutated';
  assert.deepEqual(values(result), [['L0', 30], ['R2', 70]]);
  assert.equal(result.document.metadata.bookmarks[0].name, 'base');
});

test('selector bounds input and does not trust programmatic candidate documents', () => {
  for (const value of [null, {}, [null], [Object.assign(source('name.funscript'), { document: null })],
    [Object.assign(source('name.funscript'), { resourceAxes: ['X9'] })]]) {
    assert.throws(() => Library.selectDocuments('name.mp4', value));
  }
  assert.throws(() => Library.selectDocuments(null, []));
  assert.throws(() => Library.selectDocuments('name.mp4', [], 'unknown'));
  assert.throws(() => Library.selectDocuments('name.mp4', Array(Library.MAX_FILES + 1).fill(source('name.funscript'))));
  assert.equal(Library.selectDocuments('name.mp4', []).document, undefined);
  const many = Array.from({ length: 50001 }, (_, at) => ({ at, pos: 50 }));
  assert.throws(() => Library.selectDocuments('name.mp4', [source('name.funscript', { actions: many }),
    source('name.pitch.funscript', { actions: many })]));
});

test('explicit content merge remains strict about real duplicate IDs and combined action limits', () => {
  const a = Parser.parse(JSON.stringify(ordinary(10)));
  const b = Parser.parse(JSON.stringify(embedded('R2', 90)));
  assert.deepEqual(Library.mergeDocuments([a, b]).axes.map(axis => axis.name), ['L0', 'R2']);
  assert.throws(() => Library.mergeDocuments([a, a]));
  assert.throws(() => Library.mergeDocuments([]));
  assert.throws(() => Library.mergeDocuments([null]));
  const many = Array.from({ length: 50001 }, (_, at) => ({ at, pos: 50 }));
  assert.throws(() => Library.mergeDocuments([
    Parser.parse(JSON.stringify({ actions: many })), Parser.parse(JSON.stringify({ axes: [{ id: 'R2', actions: many }] }))]));
});

// Independent small transcription of the upstream lookup/alias loops, distinct
// from the implementation's find()-per-alias formulation. Tests compare documents
// directly; this is source-rule coverage, not runtime or platform parity proof.
test('default aliases agree with an independent upstream selection transcription', () => {
  const definitions = AxisMapping.defaultAxes();
  const aliases = [...new Set(['TCode-0.2', 'TCode-0.3'].flatMap(profile =>
    AxisMapping.defaultAxes(profile).flatMap(axis => axis.funscriptNames).filter(alias => alias !== '*')))]
    .map(alias => '.' + alias.toLowerCase());
  const names = ['name.funscript', 'name.unknown.funscript', 'other.pitch.funscript',
    ...aliases.map(alias => 'name' + alias + '.funscript')].reverse();
  const candidates = names.map((name, index) => source(name, ordinary(index)));
  const expected = [];
  for (const axis of definitions.filter(axis => axis.enabled)) {
    const matches = [];
    for (const alias of axis.funscriptNames) {
      for (const name of [...new Set(names)]) {
        const stem = name.slice(0, name.lastIndexOf('.')).toLowerCase();
        const suffix = aliases.find(alias => stem.endsWith(alias));
        if ((suffix ? stem.slice(0, -suffix.length) : stem) !== 'name') continue;
        if ((alias === '*' && stem === 'name') || stem.endsWith('.' + alias.toLowerCase())) {
          matches.push(...candidates.filter(candidate => candidate.file.name === name));
        }
      }
    }
    if (matches.length) expected.push([axis.name, matches[0].document.axes[0].actions[0].pos]);
  }
  assert.deepEqual(values(Library.selectDocuments('name.mp4', candidates)), expected);
});
