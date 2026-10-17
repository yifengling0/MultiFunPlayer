import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
registerHooks({ resolve(specifier, context, nextResolve) { return nextResolve(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? specifier + '.ts' : specifier, context); } });
const { PlaylistPresentation: UI, PlaylistPanelAction: Action, PlaylistActionContext: Context } = await import('../entry/src/main/ets/core/playback/PlaylistPresentation.ts');
const { InternalPlaylist, InternalPlaylistItem } = await import('../entry/src/main/ets/core/playback/InternalPlaylist.ts');
const { MediaLoopControls, AutoSkipToScriptStart } = await import('../entry/src/main/ets/core/playback/MediaControls.ts');
const { AxisChapter, AxisKeyframe } = await import('../entry/src/main/ets/core/AxisScriptStore.ts');
function fixture() {
 const playlist = new InternalPlaylist(() => 0), loop = new MediaLoopControls(), skip = new AutoSkipToScriptStart(), context = new Context();
 context.connected = true; context.positionSeconds = 5; context.durationSeconds = 30;
 context.managedItems = ['a','b','missing'].map((name, index) => new InternalPlaylistItem(name+'.funscript', '/managed/'+name+'.funscript', 'real-associated-'+name, 30, index !== 2));
 const dispatch = (kind,index=-1,value=0,enabled=false) => UI.dispatch(new Action(kind,index,value,enabled),playlist,loop,skip,context);
 return {playlist,loop,skip,context,dispatch};
}
test('source-view commands drive actual model, keep associations, and leave ordered events for host', () => {
 const source = readFileSync(new URL('../../Source/MultiFunPlayer/MediaSource/Views/InternalMediaSource.xaml',import.meta.url),'utf8');
 for (const name of ['RefreshPlaylist','CleanupPlaylist','ClearPlaylist','PlayPrevious','PlayNext','OnRemoveItem']) assert.ok(source.includes(name));
 const f=fixture(); f.dispatch('append'); assert.equal(f.playlist.playlistItems.length,3); assert.equal(f.playlist.currentItem,null);
 assert.equal(f.playlist.isPlaying,false); f.playlist.drainEvents(); f.dispatch('select',1);
 assert.equal(f.playlist.currentItem.associationId,'real-associated-b');
 assert.deepEqual(f.playlist.drainEvents().map(e=>e.kind),['duration','position','load']);
 f.playlist.seek(5); f.dispatch('loop',-1,0,true); f.dispatch('next'); assert.equal(f.playlist.currentItem.name,'b.funscript'); assert.equal(f.playlist.positionSeconds,0);
 f.dispatch('shuffle',-1,0,true); assert.equal(f.playlist.isLooping,false); f.dispatch('previous'); assert.equal(f.playlist.currentItem.name,'a.funscript');
 f.dispatch('remove',0); assert.equal(f.playlist.currentItem.name,'b.funscript'); f.dispatch('cleanup'); assert.equal(f.playlist.playlistItems.length,1);
 f.dispatch('clear'); assert.equal(f.playlist.hasPlaylist,false);
});
test('AB source commands return seek requests without moving source time; chapter first collection rules preserved', () => {
 const f=fixture(); f.dispatch('append'); f.dispatch('select',0); f.playlist.seek(2);
 assert.equal(f.dispatch('loopStart').seekSeconds,null); f.context.positionSeconds=10;
 assert.equal(f.dispatch('loopEnd').seekSeconds,5); assert.equal(f.playlist.positionSeconds,2);
 f.dispatch('loopClear'); f.context.axisChapters=[[],[new AxisChapter('later',0,20)]];
 assert.equal(f.dispatch('loopChapter').seekSeconds,null); assert.equal(f.loop.isValid,false);
 f.context.axisChapters=[[new AxisChapter('first',4,12)]];
 assert.equal(f.dispatch('loopChapter').seekSeconds,4); assert.equal(f.loop.endPosition,12);
 f.dispatch('loopCycle'); assert.equal(f.loop.isValid,false);
});
test('auto-skip defaults and pending coalescing stay source-owned; settings do not cancel queued work', () => {
 const f=fixture(); f.skip.onDurationMessage(0); f.dispatch('autoSkip',-1,0,false); assert.equal(f.skip.pending,true);
 assert.equal(f.dispatch('autoSkipOffset',-1,2).accepted,false); assert.equal(f.skip.offsetSeconds,-5);
 assert.equal(f.dispatch('autoSkipOffset',-1,-2.5).accepted,true);
 f.context.axisKeyframes=[[new AxisKeyframe(0,0),new AxisKeyframe(12,0),new AxisKeyframe(14,1)]];
 assert.equal(f.dispatch('seekScriptStart').seekSeconds,9.5);
 f.loop.setLoop(2,5,30); f.dispatch('clear'); assert.equal(f.skip.pending,false); assert.equal(f.loop.isValid,false);
});
test('read-only and busy actions cannot mutate models; source cancellation clears transient controls', () => {
 const f=fixture(); f.context.readOnly=true;
 for(const name of ['append','clear','loopStart','autoSkip','refresh','cancel']) assert.equal(f.dispatch(name).accepted,false);
 assert.equal(f.playlist.hasPlaylist,false); f.context.readOnly=false; f.context.busy=true;
 assert.equal(f.dispatch('append').accepted,false); f.skip.onDurationMessage(0); f.loop.setLoop(2,5,30);
 assert.equal(f.dispatch('cancel').hostRequest,'cancel'); assert.equal(f.skip.pending,false); assert.equal(f.loop.isValid,false);
 f.context.busy=false; f.context.connected=false; assert.equal(f.dispatch('append').accepted,false);
 assert.equal(f.dispatch('connect').hostRequest,'connect'); assert.equal(f.dispatch('refresh').hostRequest,'refresh');
});
test('snapshot is detached from queue row mutations; append validates indices and preserves exact managed association',()=>{
 const f=fixture(); assert.equal(f.dispatch('append',99).accepted,false); f.dispatch('append',1);
 const v=UI.snapshot(f.playlist,f.loop,f.skip,f.context); assert.equal(v.rows[0].associationId,'real-associated-b');
 v.rows[0].name='changed'; assert.equal(f.playlist.playlistItems[0].name,'b.funscript');
 assert.equal(UI.time(NaN),'—'); assert.equal(UI.time(null),'—'); assert.equal(UI.time(2.25),'2.3s');
});
