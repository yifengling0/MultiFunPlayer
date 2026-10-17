import test from 'node:test';
import assert from 'node:assert/strict';
import { InternalPlaylist, InternalPlaylistItem } from '../entry/src/main/ets/core/playback/InternalPlaylist.ts';
const item = (name, duration = 10, exists = true) => new InternalPlaylistItem(name + '.funscript', '/library/' + name + '.funscript', name, duration, exists);
const ready = (items, random) => { const p = new InternalPlaylist(random); p.setPlaylist(items); p.tick(0); p.drainEvents(); return p; };

test('source defaults and association-preserving append/filter', () => {
 const p = new InternalPlaylist(); assert.equal(p.isLooping, false); assert.equal(p.isShuffling, false);
 const a = item('a'); p.append([a, new InternalPlaylistItem('x.mp4','x','x',1)]); p.tick(0); p.seek(3);
 p.append([item('b'), a]); assert.equal(p.playlistItems.length, 3); assert.equal(p.currentItem, a); assert.equal(p.positionSeconds, 3);
 assert.equal(p.currentItem.associationId, 'a'); assert.equal(p.findIndex('A.FUNSCRIPT'), 0);
});
test('next/previous skip missing files, preserve playing, never wrap at boundary', () => {
 const a = item('a'), b = item('b', 20); const p = ready([a, item('missing', 1, false), b]);
 p.setPlaying(true); p.next(); assert.equal(p.currentItem, b); assert.equal(p.isPlaying, true);
 p.next(); assert.equal(p.currentItem, b); assert.equal(p.positionSeconds, 20); assert.equal(p.isPlaying, false);
 p.previous(); assert.equal(p.currentItem, a); assert.equal(p.isPlaying, false);
 p.seek(4); p.previous(); assert.equal(p.positionSeconds, 0); assert.equal(p.currentItem, a);
});
test('strict end check precedes time advancement, speed retained, automatic transition preserves playing', () => {
 const p = ready([item('a', 1), item('b', 3)]); p.setPlaying(true); p.setSpeed(2);
 p.tick(0.5); assert.equal(p.positionSeconds, 1); assert.equal(p.playlistIndex, 0);
 p.tick(0.1); assert.equal(p.playlistIndex, 0); assert.equal(p.positionSeconds, 1.2);
 p.tick(0.1); assert.equal(p.playlistIndex, 1); assert.equal(p.positionSeconds, 0.2); assert.equal(p.isPlaying, true);
 p.seek(4); p.tick(0.1); assert.equal(p.positionSeconds, 3); assert.equal(p.isPlaying, false);
});
test('loop and shuffle mutually exclusive; loop next restarts current; random may repeat current', () => {
 const a = item('a'); const p = ready([a, item('b')], () => 0);
 p.setShuffling(true); p.seek(3); p.next(); assert.equal(p.currentItem, a); assert.equal(p.positionSeconds, 0);
 p.setLooping(true); assert.equal(p.isShuffling, false); p.seek(11); p.tick(0); assert.equal(p.positionSeconds, 0);
 p.seek(3); p.previous(); assert.equal(p.positionSeconds, 0); assert.equal(p.currentItem, a);
 p.setShuffling(true); assert.equal(p.isLooping, false);
});
test('random refresh and source filename-first ambiguity are preserved', () => {
 const a = item('same'), b = new InternalPlaylistItem('same.funscript','/other/same.funscript','second', 20);
 const p = ready([a,b], () => 0.99); p.playRandom(); assert.equal(p.currentItem, a);
 a.exists = false; b.exists = false; p.playRandom(); assert.equal(p.currentItem, a);
 assert.throws(() => ready([item('x')], () => 1).playRandom(), /Random/);
});
test('removal selects following valid then preceding valid; removing earlier only shifts index', () => {
 const a = item('a'), b = item('b'), c = item('c'); const p = ready([a,b,c]); p.playAt(1); p.seek(4);
 p.remove(a); assert.equal(p.playlistIndex, 0); assert.equal(p.positionSeconds, 4);
 p.remove(b); assert.equal(p.currentItem, c); p.remove(c); assert.equal(p.currentItem, null); assert.ok(Number.isNaN(p.positionSeconds));
 const x = item('x'), y = item('y'); const q = ready([x,y,item('bad', 1, false)]); q.playAt(1); q.remove(y); assert.equal(q.currentItem, x);
});
test('cleanup refreshes availability, restarts retained item, clears lost current until next tick', () => {
 const a = item('a'), b = item('b'); const p = ready([a,b]); p.seek(4); p.cleanup(); assert.equal(p.positionSeconds,0);
 a.exists = false; p.cleanup(); assert.equal(p.currentItem,null); assert.equal(p.playlistItems.length,1);
 p.tick(0); assert.equal(p.currentItem,b); assert.equal(p.isPlaying,false);
});
test('invalid play requests ignored, reload versus same-item restart events, clear is reset', () => {
 const a = item('a'); const p = ready([a]); p.seek(3); p.playAt(5); assert.equal(p.positionSeconds,3);
 p.drainEvents(); p.playAt(0); assert.deepEqual(p.drainEvents().map(e=>e.kind), ['position']);
 p.reloadCurrent(); assert.deepEqual(p.drainEvents().map(e=>e.kind), ['duration','position','load']);
 p.clear(); assert.equal(p.hasPlaylist,false); assert.equal(p.currentItem,null); assert.equal(p.isPlaying,false);
 assert.deepEqual(p.drainEvents().map(e=>e.kind), ['reset','playing']);
});
