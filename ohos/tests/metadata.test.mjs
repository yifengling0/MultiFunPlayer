import test from 'node:test';
import assert from 'node:assert/strict';
import { FunscriptParser as Parser, FunscriptDocument, FunscriptMetadata,
  FunscriptChapter, FunscriptBookmark, interpolate } from '../entry/src/main/ets/core/Funscript.ts';
const parse = metadata => Parser.parse(JSON.stringify({ actions: [{ at: 0, pos: 5 }, { at: 100, pos: 95 }], metadata }));
const chapter = (name = 'Intro') => ({ name, startTime: '00:00:01.25', endTime: '00:02:03.4567890' });
const bookmark = (name = 'Mark') => ({ name, time: '01:02:03.004' });

test('upstream chapters and bookmarks retain names and millisecond precision', () => {
  const doc = parse({ chapters: [chapter()], bookmarks: [bookmark()] });
  assert.equal(doc.metadata.chapters[0].name, 'Intro');
  assert.equal(doc.metadata.chapters[0].startTimeMs, 1250);
  assert.equal(doc.metadata.chapters[0].endTimeMs, 123456.789);
  assert.equal(doc.metadata.bookmarks[0].timeMs, 3723004);
  assert.equal(doc.durationMs, 100);
  assert.equal(interpolate(doc.axes[0], 0), 5);
});
test('optional metadata constructor is backwards-compatible and deep copies', () => {
  assert.deepEqual(new FunscriptDocument([]).metadata, new FunscriptMetadata());
  for (const value of [undefined, null, {}, { title: 'Ignored', duration: 999 }]) {
    assert.deepEqual(parse(value).metadata, new FunscriptMetadata());
  }
  const metadata = new FunscriptMetadata([new FunscriptChapter('C', 0, 1)], [new FunscriptBookmark('B', 0.0001)]);
  const doc = new FunscriptDocument([], metadata);
  metadata.chapters[0].name = 'mutated'; metadata.bookmarks.length = 0;
  assert.equal(doc.metadata.chapters[0].name, 'C');
  assert.equal(doc.metadata.bookmarks.length, 1);
});
test('TimeSpan fraction scales to milliseconds without rounding to integer', () => {
  for (const [value, expected] of [['00:00:00', 0], ['00:00:00.1', 100], ['00:00:00.01', 10],
    ['00:00:00.001', 1], ['00:00:00.0001', 0.1], ['00:00:00.0000001', 0.0001], ['24:00:00', 86400000]]) {
    assert.ok(Math.abs(Parser.parseTimeSpanMs(value) - expected) < 1e-10);
  }
});
test('strict TimeSpan subset rejects malformed, numeric, negative and excessive input', () => {
  for (const value of [0, null, '0:00:00', '00:0:00', '00:00:0', ' 00:00:00', '00:00:00 ', '-00:00:01',
    '1.00:00:00', '00:60:00', '00:00:60', '24:00:00.0000001', '99:00:00', '00:00:00.',
    '00:00:00.12345678', '00:00:00,1', '00:00:00\n']) {
    assert.throws(() => Parser.parseTimeSpanMs(value), String(value));
  }
});
test('malformed metadata shapes and reversed chapters reject', () => {
  for (const value of [[], 1, 'x', { chapters: null }, { bookmarks: {} }, { chapters: [null] },
    { chapters: [[]] }, { bookmarks: [null] }, { bookmarks: [{}] }, { chapters: [{ name: 'x' }] },
    { chapters: [{ ...chapter(), name: 1 }] }, { bookmarks: [{ ...bookmark(), time: 0 }] },
    { chapters: [{ ...chapter(), startTime: '00:00:02', endTime: '00:00:01' }] }]) {
    assert.throws(() => parse(value));
  }
});
test('metadata entry and name budgets are bounded before mapping', () => {
  const chapters = Array.from({ length: 500 }, () => chapter(''));
  const bookmarks = Array.from({ length: 500 }, () => bookmark('x'.repeat(256)));
  assert.equal(parse({ chapters, bookmarks }).metadata.bookmarks.length, 500);
  assert.throws(() => parse({ chapters, bookmarks: [...bookmarks, bookmark()] }));
  assert.throws(() => parse({ chapters: [chapter('x'.repeat(257))] }));
  assert.throws(() => parse({ bookmarks: [bookmark('x'.repeat(257))] }));
});
test('clone validates normalized metadata, deep copies, and ignores spoofed duration', () => {
  const doc = parse({ chapters: [chapter()], bookmarks: [bookmark()] });
  doc.durationMs = Infinity;
  const copy = Parser.cloneDocument(doc);
  assert.equal(copy.durationMs, 100);
  assert.deepEqual(copy.metadata, doc.metadata);
  doc.metadata.chapters[0].name = 'changed'; doc.metadata.bookmarks.length = 0;
  assert.equal(copy.metadata.chapters[0].name, 'Intro'); assert.equal(copy.metadata.bookmarks.length, 1);
  for (const value of [null, [], { chapters: [null], bookmarks: [] },
    { chapters: [new FunscriptChapter('x', 3, 2)], bookmarks: [] },
    { chapters: [], bookmarks: [new FunscriptBookmark('x', Infinity)] }]) {
    doc.metadata = value; assert.throws(() => Parser.cloneDocument(doc));
  }
});
test('clone revalidates actions and handles legacy documents without metadata', () => {
  assert.equal(Parser.cloneDocument({ axes: [{ name: 'L0', actions: [{ at: 5, pos: 50 }] }], durationMs: 99 }).durationMs, 5);
  for (const value of [null, [], { axes: [{ name: 'L0', actions: [{ at: -1, pos: 0 }] }] }]) {
    assert.throws(() => Parser.cloneDocument(value));
  }
});

test('out-of-order metadata is sorted for previous and next navigation', () => {
  const doc = Parser.parse(JSON.stringify({ actions: [], metadata: {
    chapters: [{ name: 'later', startTime: '00:00:03', endTime: '00:00:04' }, { name: 'earlier', startTime: '00:00:01', endTime: '00:00:02' }],
    bookmarks: [{ name: 'later', time: '00:00:03' }, { name: 'earlier', time: '00:00:01' }]
  }}));
  assert.deepEqual(doc.metadata.chapters.map(c => c.name), ['earlier', 'later']);
  assert.deepEqual(doc.metadata.bookmarks.map(b => b.name), ['earlier', 'later']);
});
