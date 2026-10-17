import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){return next(specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)?specifier+'.ts':specifier,context);}});
const {AxisConfiguration,SyncConfiguration}=await import('../entry/src/main/ets/core/AxisConfiguration.ts');
const {DeviceAxisDefinition}=await import('../entry/src/main/ets/core/DeviceProfile.ts');
const {ShortcutAction,defaultShortcutAction,cloneShortcutAction,validateShortcutAction,shortcutActionCatalog,KeyboardShortcutConfiguration,KeyboardShortcutMapping}=await import('../entry/src/main/ets/input/ShortcutConfiguration.ts');
const {applyAxisShortcutAction,applySyncShortcutAction}=await import('../entry/src/main/ets/input/ShortcutSettingActions.ts');
const {LocalShortcutEngine}=await import('../entry/src/main/ets/input/LocalShortcutEngine.ts');
function axis(){return new AxisConfiguration(new DeviceAxisDefinition('L0'),['L0','R0']);}
function apply(settings,id,value=0,text='',target=''){return applyAxisShortcutAction(settings,new ShortcutAction(id,value,target,0,text),'L0',['L0','R0']);}

test('all source-backed catalog defaults are valid, detached and accurately typed',()=>{
 const catalog=shortcutActionCatalog();assert.equal(catalog.length,182);assert.equal(new Set(catalog.map(x=>x.id)).size,182);
 for(const spec of catalog){
  const action=defaultShortcutAction(spec.id);assert.equal(validateShortcutAction(action),true,spec.id);
  assert.equal(action.value,spec.defaultValue);assert.equal(action.secondaryValue,spec.secondaryDefaultValue);assert.equal(action.text,spec.defaultText);
  assert.equal(spec.targetAxis,spec.id.startsWith('OutputTarget::Axis::Range::')||spec.id==='Script::SkipGap'||spec.id.startsWith('MotionProvider::')||(spec.id.startsWith('Axis::')&&!/^Axis::(?:SyncAll|LockAll)/.test(spec.id)));
  assert.ok(['media','axis','sync','internal','motion','shortcut','output','source','app'].includes(spec.category));
 }
 assert.throws(()=>defaultShortcutAction('Output::Arm'));
 assert.equal(defaultShortcutAction('Axis::ScriptScale::Set').value,.01);
 assert.equal(defaultShortcutAction('Sync::Duration::Set').value,4);
 assert.equal(defaultShortcutAction('Axis::InterpolationType::Set').text,'linear');
 const first=shortcutActionCatalog();first.find(x=>x.valueKind==='enum').textOptions[0].value='poison';
 assert.equal(shortcutActionCatalog().find(x=>x.valueKind==='enum').textOptions[0].value,'linear');
});
test('v0.12 action objects migrate additively without losing values or injecting selected names',()=>{
 const old={id:'Axis::ScriptOffset::Offset',value:-.05};const migrated=cloneShortcutAction(old);
 assert.deepEqual(migrated,new ShortcutAction(old.id,old.value));assert.deepEqual(old,{id:old.id,value:-.05});
 const map=new KeyboardShortcutMapping('legacy','Old');map.keys=[2017];map.actions=[old];
 const config=new KeyboardShortcutConfiguration();config.mappings=[map];
 const roundtrip=KeyboardShortcutConfiguration.fromJson(JSON.parse(JSON.stringify(config)));
 assert.deepEqual(roundtrip.mappings[0].actions,[migrated]);
 const engine=new LocalShortcutEngine(roundtrip);const [dispatch]=engine.keyEvent({keyCode:2017,pressed:true},0);
 assert.deepEqual(dispatch.actions[0],migrated);
});
test('expanded snapshots retain targeted, two-number and textual actions without aliasing',()=>{
 const map=new KeyboardShortcutMapping('expanded','Expanded');map.keys=[2017];map.actions=[
  new ShortcutAction('Media::Loop::Set',2,'',8),new ShortcutAction('Axis::LinkAxis::Set',0,'L0',0,'R0'),
  new ShortcutAction('Media::Chapter::SeekToByName',0,'',0,'Part 二')];
 const config=new KeyboardShortcutConfiguration();config.mappings=[map];const engine=new LocalShortcutEngine(config);
 const [dispatch]=engine.keyEvent({keyCode:2017,pressed:true},0);assert.deepEqual(dispatch.actions,map.actions);
 dispatch.actions[1].targetAxis='R0';dispatch.actions[2].text='changed';
 assert.equal(engine.configurationSnapshot().mappings[0].actions[1].targetAxis,'L0');
 assert.equal(engine.configurationSnapshot().mappings[0].actions[2].text,'Part 二');
});
test('payload fields fail closed and optional fields never become arbitrary parameters',()=>{
 for(const action of [
  {...new ShortcutAction('Axis::Lock::Set',1),params:{shell:'x'}},
  {...new ShortcutAction('Axis::Lock::Set',1),typeName:'RemoteAction'},
  new ShortcutAction('Axis::Lock::Set',1,'L00'),new ShortcutAction('Media::Loop::Set',0,'L0',1),
  new ShortcutAction('Axis::Lock::Set',1,'',1),new ShortcutAction('Axis::Lock::Set',1,'',0,'unused'),
  new ShortcutAction('Media::Loop::Set',0,'',NaN),new ShortcutAction('Media::Loop::Set',0,'',-1),
  new ShortcutAction('Media::Bookmark::SeekToByName',0,'',0,'x\n'),new ShortcutAction('Media::Chapter::SeekToByName',0,'',0,'x'.repeat(257)),
  new ShortcutAction('Media::Bookmark::SeekToByIndex',.5),new ShortcutAction('Media::Chapter::SeekToByIndex',2147483648),
  new ShortcutAction('Axis::LinkAxis::Set',0,'',0,'../../path'),new ShortcutAction('Axis::MotionProvider::Set',0,'',0,'arbitrary'),
  new ShortcutAction('Axis::InterpolationType::Set',0,'',0,'unknown')]) assert.equal(validateShortcutAction(action),false,JSON.stringify(action));
 assert.equal(validateShortcutAction(new ShortcutAction('Axis::Lock::Set',1,'Z9')),true,'detached but valid axis names persist');
 assert.equal(validateShortcutAction(new ShortcutAction('Media::Bookmark::SeekToByName',0,'',0,'')),true);
});
test('seek and offsets regain source finite bounds while native media speed stays explicit',()=>{
 assert.equal(validateShortcutAction(new ShortcutAction('Media::Speed::Set',.1)),false);
 assert.equal(validateShortcutAction(new ShortcutAction('Media::Position::Time::Offset',86401)),true);
 assert.equal(validateShortcutAction(new ShortcutAction('Axis::ScriptOffset::Offset',61)),true);
 for(const id of ['Media::ScriptOffset::Set','Media::ScriptOffset::Offset','Media::Position::Time::Offset','Axis::ScriptOffset::Offset','Axis::ScriptOffset::Set','Axis::AutoHomeDuration::Set']){
  assert.equal(validateShortcutAction(new ShortcutAction(id,Number.MAX_VALUE)),true,id);
  assert.equal(validateShortcutAction(new ShortcutAction(id,Infinity)),false,id);
 }
 const current=axis();current.autoHomeDurationSeconds=Number.MAX_VALUE;
 const overflow=apply(current,'Axis::AutoHomeDuration::Offset',Number.MAX_VALUE);
 assert.equal(overflow.settings.autoHomeDurationSeconds,Infinity,'source overflow is not silently capped');
 assert.ok(AxisConfiguration.validate(overflow.settings).some(d=>d.path==='autoHomeDurationSeconds'));
});
const switches=[['Lock','lockScript'],['LockAll','lockScript'],['Bypass::Script','bypassScript'],['Bypass::MotionProvider','bypassMotionProvider'],['Bypass::Transition','bypassTransition'],['InvertScript','invertScript'],['LinkPriority','linkAxisHasPriority'],['SpeedLimitEnabled','speedLimitEnabled'],['AutoHomeEnabled','autoHomeEnabled'],['AutoHomeInsideScript','autoHomeInsideScript'],['MotionProviderFillGaps','motionProviderFillGaps'],['UpdateMotionProviderWhenPaused','updateMotionProviderWhenPaused'],['UpdateMotionProviderWithoutScript','updateMotionProviderWithoutScript']];
for(const [name,field] of switches)test('source boolean Set/Toggle '+name+' clones and only changes '+field,()=>{
 for(const initial of [false,true])for(const value of [0,1]){
  const old=axis();old[field]=initial;const set=apply(old,'Axis::'+name+'::Set',value);
  assert.equal(set.settings[field],value===1);assert.equal(old[field],initial);assert.ok(set.summary);
  const toggle=apply(old,'Axis::'+name+'::Toggle');assert.equal(toggle.settings[field],!initial);
  const expected=AxisConfiguration.clone(old);expected[field]=!initial;assert.deepEqual(toggle.settings,expected);
  assert.notEqual(toggle.settings.smartLimitPoints,old.smartLimitPoints);assert.equal(toggle.resetSync,false);assert.equal(toggle.reloadScript,false);
 }
});
test('Bypass All toggle turns all off when any flag is set, instead of inverting separately',()=>{
 for(let bits=0;bits<8;bits++){
  const old=axis();old.bypassScript=!!(bits&1);old.bypassMotionProvider=!!(bits&2);old.bypassTransition=!!(bits&4);
  const next=apply(old,'Axis::Bypass::All::Toggle').settings;
  assert.deepEqual([next.bypassScript,next.bypassMotionProvider,next.bypassTransition],[bits===0,bits===0,bits===0]);
  for(const value of [0,1]){const set=apply(old,'Axis::Bypass::All::Set',value).settings;assert.deepEqual([set.bypassScript,set.bypassMotionProvider,set.bypassTransition],[!!value,!!value,!!value]);}
 }
});
for(const [name,field] of [['SmartLimitTargetValue','smartLimitTargetValue'],['AutoHomeTargetValue','autoHomeTargetValue'],['MotionProviderBlend','motionProviderBlend']])test('source 0–1 coercion '+name,()=>{
 const old=axis();old[field]=.75;
 assert.equal(apply(old,'Axis::'+name+'::Offset',1).settings[field],1);
 assert.equal(apply(old,'Axis::'+name+'::Offset',-1).settings[field],0);
 assert.equal(apply(old,'Axis::'+name+'::Set',.25).settings[field],.25);assert.equal(old[field],.75);
});
for(const [name,field] of [['AutoHomeDelay','autoHomeDelaySeconds'],['AutoHomeDuration','autoHomeDurationSeconds'],['MotionProviderMinimumGapDuration','motionProviderMinimumGapDurationSeconds']])test('source nonnegative unbounded coercion '+name,()=>{
 const old=axis();old[field]=2;
 assert.equal(apply(old,'Axis::'+name+'::Offset',-3).settings[field],0);
 assert.equal(apply(old,'Axis::'+name+'::Offset',1e6).settings[field],1000002);
 assert.equal(apply(old,'Axis::'+name+'::Set',0).settings[field],0);assert.equal(old[field],2);
});
test('source scale clamping and uncoerced offset are preserved',()=>{
 const old=axis();old.scriptScale=3.5;old.offsetSeconds=10;
 assert.equal(apply(old,'Axis::ScriptScale::Offset',2).settings.scriptScale,4);
 assert.equal(apply(old,'Axis::ScriptScale::Offset',-4).settings.scriptScale,.01);
 assert.equal(apply(old,'Axis::ScriptScale::Set',.01).settings.scriptScale,.01);
 assert.equal(apply(old,'Axis::ScriptOffset::Offset',-12).settings.offsetSeconds,-2);
 assert.equal(apply(old,'Axis::ScriptOffset::Set',-1e6).settings.offsetSeconds,-1e6);
});
test('source speed normalization uses .NET midpoint-to-even and reciprocal Infinity semantics',()=>{
 const old=axis();
 for(const [value,expected] of [[0,0],[.125,.12],[.135,.14],[1.125,1.12],[2.675,2.68],[1e20,1e20]]){
  assert.equal(apply(old,'Axis::SpeedLimitUnitsPerSecond::Set',value).settings.speedLimitUnitsPerSecond,expected);
 }
 assert.equal(apply(old,'Axis::SpeedLimitSecondsPerUnit::Set',0).settings.speedLimitUnitsPerSecond,Infinity);
 assert.equal(apply(old,'Axis::SpeedLimitSecondsPerUnit::Set',8).settings.speedLimitUnitsPerSecond,.12);
 old.speedLimitUnitsPerSecond=10;
 assert.equal(apply(old,'Axis::SpeedLimitUnitsPerSecond::Offset',-20).settings.speedLimitUnitsPerSecond,0);
 assert.equal(apply(old,'Axis::SpeedLimitSecondsPerUnit::Offset',-.1).settings.speedLimitUnitsPerSecond,Infinity);
 old.speedLimitUnitsPerSecond=Infinity;
 assert.equal(apply(old,'Axis::SpeedLimitSecondsPerUnit::Offset',2).settings.speedLimitUnitsPerSecond,.5);
 assert.equal(apply(old,'Axis::SpeedLimitUnitsPerSecond::Offset',-100).settings.speedLimitUnitsPerSecond,Infinity);
 const unlimited=apply(axis(),'Axis::SpeedLimitSecondsPerUnit::Set',0).settings;
 assert.equal(AxisConfiguration.toJson(unlimited).speedLimitUnitsPerSecond,'Infinity');
});
for(const [name,field,reset,reload] of [['LinkAxis','linkAxis',false,true],['SmartLimitInputAxis','smartLimitInputAxis',true,false],['UpdateMotionProviderWithAxis','updateMotionProviderWithAxis',true,false]])test('source '+name+' reference clear and explicit side effects',()=>{
 const old=axis();const result=apply(old,'Axis::'+name+'::Set',0,'R0');
 assert.equal(result.settings[field],'R0');assert.equal(result.resetSync,reset);assert.equal(result.reloadScript,reload);
 const same=apply(result.settings,'Axis::'+name+'::Set',0,'R0');assert.equal(same.resetSync,reset);assert.equal(same.reloadScript,reload);
 const cleared=apply(result.settings,'Axis::'+name+'::Set',0,'');assert.equal(cleared.settings[field],null);
 assert.equal(cleared.resetSync,reset);assert.equal(cleared.reloadScript,reload);
 assert.equal(apply(old,'Axis::'+name+'::Set',0,'L0'),null);
 assert.equal(apply(old,'Axis::'+name+'::Set',0,'Z9'),null);
});
test('explicit unavailable target cannot fall back, and reducers do not invoke runtime actions',()=>{
 const old=axis();assert.equal(apply(old,'Axis::Lock::Set',1,'','R0'),null);
 assert.equal(applyAxisShortcutAction(old,new ShortcutAction('Axis::Lock::Set',1,'L0'),'L0',['R0']),null);
 assert.equal(apply(old,'Axis::Lock::Set',1,'','L0').settings.lockScript,true);
 for(const id of ['Axis::Sync','Axis::Sync::Cancel','Axis::SyncAll','Axis::SyncAll::Cancel','Axis::ClearScript','Axis::ReloadScript','Media::PlayPause::Toggle'])assert.equal(apply(old,id),null,id);
});
test('only registered enum and provider names change known settings; blank provider clears',()=>{
 const old=axis();
 for(const value of ['linear','pchip','makima','step'])assert.equal(apply(old,'Axis::InterpolationType::Set',0,value).settings.interpolationType,value);
 for(const value of ['value','speed'])assert.equal(apply(old,'Axis::SmartLimitMode::Set',0,value).settings.smartLimitMode,value);
 for(const value of ['Pattern','Random','Custom Curve','Looping Script',''])assert.equal(apply(old,'Axis::MotionProvider::Set',0,value).settings.selectedMotionProvider,value||null);
 assert.equal(apply(old,'Axis::MotionProvider::Set',0,'unknown'),null);
});
test('all six Sync source actions clone settings and preserve unregistered script-start/end preferences',()=>{
 const old=new SyncConfiguration();old.syncOnScriptStart=false;
 const specs=shortcutActionCatalog().filter(s=>s.category==='sync');assert.equal(specs.length,6);
 for(const spec of specs){const action=defaultShortcutAction(spec.id);const next=applySyncShortcutAction(old,action);assert.ok(next);assert.notEqual(next,old);assert.equal(next.syncOnScriptStart,false);assert.equal(next.syncOnScriptEnd,true);}
 for(const duration of [.5,4,8])assert.equal(applySyncShortcutAction(old,new ShortcutAction('Sync::Duration::Set',duration)).durationSeconds,duration);
 for(const [name,field] of [['SyncOnMediaResourceChanged','syncOnMediaResourceChanged'],['SyncOnScriptResourceChanged','syncOnScriptResourceChanged'],['SyncOnMediaPlayPause','syncOnMediaPlayPause'],['SyncOnSeek','syncOnSeek'],['SyncOnAutoHomeStartEnd','syncOnAutoHomeStartEnd']]){
  for(const value of [0,1])assert.equal(applySyncShortcutAction(old,new ShortcutAction('Sync::'+name+'::Set',value))[field],!!value);
 }
 assert.equal(applySyncShortcutAction(old,new ShortcutAction('Sync::SyncOnScriptStart::Set',0)),null);
 assert.equal(applySyncShortcutAction(old,new ShortcutAction('Axis::Lock::Toggle')),null);
});
test('all scalar axis catalog entries have a reducer; point and runtime operations stay separate',()=>{
 const runtime=new Set(['Axis::Sync','Axis::SyncAll','Axis::Sync::Cancel','Axis::SyncAll::Cancel','Axis::ClearScript','Axis::ReloadScript',
  'Axis::Value::Set','Axis::Value::Offset','Axis::SmartLimitPoints::Set']);
 for(const spec of shortcutActionCatalog().filter(s=>s.category==='axis')){
  const result=applyAxisShortcutAction(axis(),defaultShortcutAction(spec.id),'L0',['L0','R0']);
  assert.equal(result!==null,!runtime.has(spec.id),spec.id);if(result)assert.ok(result.summary,spec.id);
 }
});
test('audited source anchors source-specific coercions and runtime reference effects',()=>{
 const source=readFileSync(new URL('../../Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs',import.meta.url),'utf8');
 assert.match(source,/var state = settings.BypassScript \|\| settings.BypassMotionProvider \|\| settings.BypassTransition/);
 assert.match(source,/Math.Round\(Math.Max\(0, value\), 2\)/);
 assert.match(source,/ResetSync\(true, source\);\s*AxisSettings\[source\].SmartLimitInputAxis = input/);
 assert.match(source,/AxisSettings\[source\].LinkAxis = target;\s*ReloadAxes\(source\)/);
 const helper=readFileSync(new URL('../entry/src/main/ets/input/ShortcutSettingActions.ts',import.meta.url),'utf8');
 assert.doesNotMatch(helper,/from ['"](@kit|@ohos|node:)|\b(setTimeout|setInterval|Date\.now|fetch|XMLHttpRequest)\s*\(/);
});
