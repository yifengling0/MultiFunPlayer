import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c)}});
const {ShortcutAction}=await import('../entry/src/main/ets/input/ShortcutConfiguration.ts');
const {applyMediaShortcut,shortcutNameEquals}=await import('../entry/src/main/ets/input/ShortcutMediaActions.ts');
const {AxisScriptResource,AxisScriptBinding,AxisKeyframe,AxisChapter,AxisBookmark}=await import('../entry/src/main/ets/core/AxisScriptStore.ts');
const {MediaLoopControls}=await import('../entry/src/main/ets/core/playback/MediaControls.ts');
const resource=new AxisScriptResource('r','r','r',[new AxisKeyframe(0,.5),new AxisKeyframe(5,.5),new AxisKeyframe(10,1)],
 [new AxisChapter('Intro',2,4),new AxisChapter('Second',5,8)],[new AxisBookmark('Foo',3),new AxisBookmark('Bar',7)]);
const bindings=[new AxisScriptBinding('L0',resource)];
const action=(id,value=0,secondary=0,text='')=>new ShortcutAction(id,value,'',secondary,text);
function apply(a,pos=3,duration=20,loop=new MediaLoopControls(),sources=bindings){return applyMediaShortcut(a,pos,duration,sources,loop)}
test('time/percent seek clamp, offset, zero-duration and nonfinite observations preserve source guards',()=>{
 for(const [id,value,pos,expected] of [['Time::Set',30,3,20],['Time::Offset',-10,3,0],['Percent::Set',.25,3,5],['Percent::Offset',.5,3,13]])assert.equal(apply(action('Media::Position::'+id,value),pos).seekSeconds,expected);
 assert.throws(()=>apply(action('Media::Position::Percent::Offset',.1),0,0));
 assert.equal(apply(action('Media::Position::Percent::Set',.2),NaN,0).seekSeconds,0);
 assert.throws(()=>apply(action('Media::Position::Time::Set',2),1,NaN));
 assert.throws(()=>apply(action('Media::Position::Time::Offset',Number.MAX_VALUE),Number.MAX_VALUE));
});
test('script start uses original first resource and signed offset; no false media observation',()=>{
 assert.equal(apply(action('Media::Position::SkipToScriptStart',2)).seekSeconds,7);
 assert.equal(apply(action('Media::Position::SkipToScriptStart',-10)).seekSeconds,0);
 const empty=new AxisScriptResource('e','e','e',[]);
 assert.throws(()=>apply(action('Media::Position::SkipToScriptStart'),3,20,new MediaLoopControls(),[new AxisScriptBinding('L0',empty),...bindings]));
 assert.throws(()=>apply(action('Media::Position::SkipToScriptStart',Number.MAX_VALUE),3,Number.MAX_VALUE,new MediaLoopControls(),[new AxisScriptBinding('L0',new AxisScriptResource('x','x','x',[new AxisKeyframe(Number.MAX_VALUE/2,.5),new AxisKeyframe(Number.MAX_VALUE,.9)]))]));
});
test('AB source setters preserve partial invalid bound, immediate clamped seek, relative signs and cycle order',()=>{
 const loop=new MediaLoopControls();assert.equal(apply(action('Media::Loop::Start::Set',5),3,20,loop).seekSeconds,null);
 assert.equal(apply(action('Media::Loop::End::Set',9),3,20,loop).seekSeconds,5);
 assert.equal(apply(action('Media::Loop::Start::Set',10),3,20,loop).seekSeconds,null);assert.equal(loop.endPosition,null);
 assert.equal(apply(action('Media::Loop::Set',30,40),3,20,loop).seekSeconds,20);assert.equal(loop.startPosition,30);
 assert.equal(apply(action('Media::Loop::Set::FromMediaPositionOffset',2,4),3,20,loop).seekSeconds,1);assert.equal(loop.endPosition,7);
 apply(action('Media::Loop::CycleSetStartEnd'),3,20,loop);assert.equal(loop.startPosition,null);
 apply(action('Media::Loop::CycleSetStartEnd'),3,20,loop);assert.equal(loop.startPosition,3);
 assert.equal(apply(action('Media::Loop::CycleSetStartEnd'),6,20,loop).seekSeconds,3);
 assert.equal(apply(action('Media::Loop::Set::FromCurrentChapter'),4,20,loop).seekSeconds,2);
});
test('named/indexed markers use first metadata collection, case-insensitive names and raw time',()=>{
 for(const [kind,name,index,expected]of[['Chapter','second',1,5],['Bookmark','bar',1,7]]){
 assert.equal(apply(action('Media::'+kind+'::SeekToByName',0,0,name)).seekSeconds,expected);
 assert.equal(apply(action('Media::'+kind+'::SeekToByIndex',index)).seekSeconds,expected);
 assert.throws(()=>apply(action('Media::'+kind+'::SeekToByIndex',999)));
 assert.throws(()=>apply(action('Media::'+kind+'::SeekToByName',0,0,'missing')));
 }
 assert.equal(apply(action('Media::Bookmark::SeekToNext'),1.5).seekSeconds,3);
 assert.equal(apply(action('Media::Bookmark::SeekToPrev'),8.5).seekSeconds,3);
});
test('OrdinalIgnoreCase representative C#9 comparisons do not use full or locale case folding',()=>{
 for(const[a,b,want]of[['i','ı',false],['s','ſ',false],['ß','ẞ',false],['ß','ss',false],['σ','ς',true],['k','K',false],['é','É',true],['𐐀','𐐨',true],['İ','i',false],['ABC','abc',true]])assert.equal(shortcutNameEquals(a,b),want,a+'/'+b);
});
