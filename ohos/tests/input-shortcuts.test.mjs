import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
registerHooks({resolve(specifier,context,next){return next(specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)?specifier+'.ts':specifier,context);}});
const {KeyboardShortcutConfiguration, KeyboardShortcutMapping, ShortcutAction, EMERGENCY_STOP_KEY,
  shortcutActionCatalog, keyCatalog, keyLabel, chordLabel, validateShortcutConfiguration, validateShortcutAction} = await import('../entry/src/main/ets/input/ShortcutConfiguration.ts');
const {LocalShortcutEngine, ShortcutInputContext} = await import('../entry/src/main/ets/input/LocalShortcutEngine.ts');
const {ButtonShortcutState} = await import('../entry/src/main/ets/input/ButtonShortcutState.ts');
const A=2017,B=2018,CTRL=2072,SPACE=2050;
function mapping(trigger='press',extra={}) { return Object.assign(new KeyboardShortcutMapping('m','Test'), {keys:[A],trigger,actions:[new ShortcutAction('Media::PlayPause::Toggle')]},extra); }
function config(...mappings) { return Object.assign(new KeyboardShortcutConfiguration(),{mappings}); }
function fixture(trigger='press',extra={}) { const m=mapping(trigger,extra); return {m,e:new LocalShortcutEngine(config(m))}; }
function event(e,pressed,now,key=A) { return e.keyEvent({keyCode:key,pressed},now); }
function finish(e,dispatches) { for(const d of dispatches)e.completeDispatch(d); return dispatches; }
function context(e,extra) { e.setContext(Object.assign(new ShortcutInputContext(),extra)); }
function actionIds(ds) {return ds.flatMap(d=>d.actions.map(a=>a.id));}

test('default configuration invents no upstream key bindings and restores no transient state',()=>{
 const c=KeyboardShortcutConfiguration.fromJson(undefined);assert.deepEqual(c.mappings,[]);assert.equal(c.enabled,true);
 const e=new LocalShortcutEngine(c);assert.deepEqual(event(e,true,0),[]);assert.equal(e.nextDeadlineMs(),null);assert.equal(e.cancellationToken(),0);
});
test('source audit pins original keyboard set and release-clear ordering',()=>{
 const descriptor=readFileSync(new URL('../../Source/MultiFunPlayer/Input/RawInput/KeyboardGesture.cs',import.meta.url),'utf8');
 const raw=readFileSync(new URL('../../Source/MultiFunPlayer/Input/RawInput/RawInputProcessor.cs',import.meta.url),'utf8');
 assert.match(descriptor,/SortedSet<Key>/);assert.match(descriptor,/_comparer\.Equals\(_keys, other\?\._keys\)/);
 assert.match(raw,/_pressedKeys\.Add\(key\);\s*PublishGesture\(KeyboardGesture\.Create\(_pressedKeys, true\)\)/);
 assert.match(raw,/PublishGesture\(KeyboardGesture\.Create\(_pressedKeys, false\)\);\s*_pressedKeys\.Clear\(\)/);
});
test('source audit anchors trigger boundaries and single-shot holding semantics',()=>{
 const read=name=>readFileSync(new URL('../../Source/MultiFunPlayer/Shortcut/'+name+'.cs',import.meta.url),'utf8');
 assert.match(read('ButtonPressShortcut'),/HandleRepeating \|\| wasPressed/);
 assert.match(read('ButtonReleaseShortcut'),/HandleRepeating \|\| wasReleased/);
 assert.match(read('ButtonClickShortcut'),/_stateCounter == 2 \* ClickCount/);
 assert.match(read('ButtonClickShortcut'),/Delay\(MaximumClickInterval/);
 const hold=read('ButtonHoldShortcut');assert.match(hold,/duration < MinimumHoldDuration/);
 assert.match(hold,/MaximumHoldDuration > MinimumHoldDuration && duration > MaximumHoldDuration/);
 assert.match(hold,/Delay\(MinimumHoldDuration/);assert.doesNotMatch(hold,/Repeat\(/);
});
test('press ignores repeated downs unless HandleRepeating is enabled',()=>{
 for(const repeating of [false,true]){
  const {e}=fixture('press',{handleRepeating:repeating});assert.equal(finish(e,event(e,true,0)).length,1);
  assert.equal(finish(e,event(e,true,1)).length,repeating?1:0);assert.deepEqual(event(e,false,2),[]);
  assert.equal(event(e,true,3).length,1);
 }
});
test('release tracks true-to-false edge and RawInput clears on first key-up',()=>{
 const {e}=fixture('release');assert.deepEqual(event(e,false,0),[]);assert.deepEqual(event(e,true,1),[]);
 assert.equal(finish(e,event(e,false,2)).length,1);assert.deepEqual(event(e,false,3),[]);
});
test('source-level Release HandleRepeating accepts false events without a preceding true',()=>{
 for(const repeating of [false,true]){
  const s=new ButtonShortcutState(mapping('release',{handleRepeating:repeating}));
  assert.equal(s.update(false,0),repeating);assert.equal(s.update(true,1),false);
  assert.equal(s.update(false,2),true);assert.equal(s.update(false,3),repeating);
 }
});
test('exact descriptor set is order insensitive but never matches a superset',()=>{
 const {e}=fixture('press',{keys:[CTRL,A]});assert.deepEqual(event(e,true,0,A),[]);
 assert.equal(finish(e,event(e,true,1,CTRL)).length,1);assert.deepEqual(event(e,true,2,B),[]);
 event(e,false,3,B);event(e,false,4,A);event(e,false,5,CTRL);
 // OHOS safety cancellation clears abandoned smaller-chord latches.
 event(e,true,6,CTRL);assert.equal(event(e,true,7,A).length,1);
});
test('first released member releases full chord then clears descriptor while other key stays held',()=>{
 const {e}=fixture('release',{keys:[CTRL,A]});event(e,true,0,CTRL);event(e,true,1,A);
 assert.equal(finish(e,event(e,false,2,CTRL)).length,1);assert.deepEqual(event(e,false,3,A),[]);
 // Once the first release clears RawInput's set, an A repeat is only {A}.
 event(e,true,4,CTRL);event(e,true,5,A);finish(e,event(e,false,6,CTRL));
 assert.deepEqual(event(e,true,7,A),[]);assert.deepEqual(event(e,false,8,A),[]);
});
test('all duplicate descriptor mappings and their action lists keep configured order',()=>{
 const first=mapping('press',{id:'first',actions:[new ShortcutAction('Media::Position::Time::Offset',5),new ShortcutAction('Axis::Sync')]});
 const second=mapping('press',{id:'second',actions:[new ShortcutAction('Media::PlayPause::Set',0)]});
 const e=new LocalShortcutEngine(config(first,second));const ds=event(e,true,0);
 assert.deepEqual(ds.map(d=>d.mappingId),['first','second']);assert.deepEqual(actionIds(ds),['Media::Position::Time::Offset','Axis::Sync','Media::PlayPause::Set']);
 assert.ok(ds.every(d=>e.isDispatchCurrent(d)));
});
test('one outstanding invocation per mapping suppresses repeats until its exact completion',()=>{
 const {e}=fixture('press',{handleRepeating:true});const [first]=event(e,true,0);
 assert.deepEqual(event(e,true,1),[]);e.completeDispatch({...first,sequence:first.sequence+1});assert.deepEqual(event(e,true,2),[]);
 e.completeDispatch(first);const [second]=event(e,true,3);assert.ok(second.sequence>first.sequence);assert.equal(e.isDispatchCurrent(first),false);
 e.completeDispatch(first);assert.deepEqual(event(e,true,4),[]);e.completeDispatch(second);assert.equal(event(e,true,5).length,1);
});
test('single click waits exactly its release-to-next-click interval, independent of press length',()=>{
 const {e}=fixture('click');event(e,true,0);assert.equal(e.nextDeadlineMs(),null);assert.deepEqual(e.advance(10000),[]);
 event(e,false,10000);assert.equal(e.nextDeadlineMs(),10200);assert.deepEqual(e.advance(10199),[]);
 assert.equal(finish(e,e.advance(10200)).length,1);assert.equal(e.nextDeadlineMs(),null);assert.deepEqual(e.advance(999999),[]);
});
test('click second down cancels timeout even when held far past the interval',()=>{
 const {e}=fixture('click',{clickCount:2});event(e,true,0);event(e,false,10);event(e,true,209);
 assert.equal(e.nextDeadlineMs(),null);assert.deepEqual(e.advance(5000),[]);event(e,false,5001);
 assert.deepEqual(e.advance(5200),[]);assert.equal(e.advance(5201).length,1);
});
test('click count must match exactly; overshoot, repeats and duplicate ups do not create matches',()=>{
 const {e}=fixture('click',{clickCount:2});event(e,true,0);event(e,true,1);event(e,false,2);event(e,false,3);
 event(e,true,4);event(e,false,5);event(e,true,6);event(e,false,7);assert.deepEqual(e.advance(207),[]);
 event(e,true,300);event(e,false,301);event(e,true,302);event(e,false,303);assert.equal(e.advance(503).length,1);
});
test('click counter stays bounded through thousands of unmatched clicks then recovers',()=>{
 const {e}=fixture('click',{clickCount:1});for(let i=0;i<10000;i++){event(e,true,i*2);event(e,false,i*2+1);}
 assert.deepEqual(e.advance(20199),[]);event(e,true,20200);event(e,false,20201);assert.equal(e.advance(20401).length,1);
});
test('deadline equality uses deterministic timer-before-input ordering',()=>{
 const {e}=fixture('click',{clickCount:1});event(e,true,0);event(e,false,10);
 assert.equal(finish(e,event(e,true,210)).length,1);event(e,false,211);assert.equal(e.advance(411).length,1);
});
for(const duration of [999,1000,1500,1501])test('hold release inclusive source bounds at '+duration+'ms',()=>{
 const {e}=fixture('hold',{minimumHoldDurationMs:1000,maximumHoldDurationMs:1500});event(e,true,0);
 assert.equal(event(e,false,duration).length,duration>=1000&&duration<=1500?1:0);
});
for(const maximum of [-1,0,500,1000])test('hold maximum <= minimum is upstream unbounded: '+maximum,()=>{
 const {e}=fixture('hold',{maximumHoldDurationMs:maximum});event(e,true,10);assert.equal(event(e,false,100000).length,1);
});
test('while holding invokes once at minimum, ignores maximum, and never repeats',()=>{
 const {e}=fixture('hold',{holdInvoke:'holding',minimumHoldDurationMs:100,maximumHoldDurationMs:200});event(e,true,0);event(e,true,50);
 assert.equal(e.nextDeadlineMs(),100);assert.deepEqual(e.advance(99),[]);assert.equal(finish(e,e.advance(100)).length,1);
 assert.deepEqual(event(e,true,150),[]);assert.deepEqual(e.advance(10000),[]);assert.deepEqual(event(e,false,10001),[]);
});
test('early release cancels WhileHolding; late callback cannot resurrect it',()=>{
 const {e}=fixture('hold',{holdInvoke:'holding'});event(e,true,0);event(e,false,999);
 assert.equal(e.nextDeadlineMs(),null);assert.deepEqual(e.advance(1000),[]);assert.deepEqual(e.advance(100000),[]);
});
test('zero duration click and hold are bounded single callbacks on next advance',()=>{
 const click=fixture('click',{maximumClickIntervalMs:0}).e;event(click,true,0);event(click,false,0);assert.equal(click.advance(0).length,1);
 const hold=fixture('hold',{minimumHoldDurationMs:0,holdInvoke:'holding'}).e;event(hold,true,0);assert.equal(hold.advance(0).length,1);assert.deepEqual(hold.advance(0),[]);
});
for(const field of ['textInput','ime','capturing'])test(field+' cancels delayed keyboard work and holds keys quarantined until release',()=>{
 const {e}=fixture('hold',{holdInvoke:'holding'});event(e,true,0);const token=e.cancellationToken();context(e,{[field]:true});
 assert.equal(e.nextDeadlineMs(),null);assert.deepEqual(e.advance(5000,token),[]);assert.deepEqual(event(e,true,5001),[]);
 context(e,{});assert.deepEqual(event(e,true,5002),[]);assert.deepEqual(e.advance(6002),[]);
 event(e,false,6003);event(e,true,6004);assert.equal(e.advance(7004).length,1);
});
for(const field of ['foreground','focused'])test(field+' loss cancels issued action lists and pending release',()=>{
 const {e}=fixture();const [d]=event(e,true,0);context(e,{[field]:false});assert.equal(e.isDispatchCurrent(d),false);
 assert.deepEqual(e.dispatchAction(new ShortcutAction('Media::PlayPause::Toggle')),[]);assert.deepEqual(event(e,true,1,EMERGENCY_STOP_KEY),[]);
 context(e,{});assert.deepEqual(event(e,true,2),[]);event(e,false,3);assert.equal(event(e,true,4).length,1);
});
test('settings replacement cancels pending click and rejects late callback without altering the current clock',()=>{
 const {e}=fixture('click');event(e,true,0);event(e,false,1);const old=e.cancellationToken();e.setConfiguration(config(mapping('click')));
 assert.deepEqual(e.advance(100000,old),[]);event(e,true,2);event(e,false,3);assert.equal(e.advance(203).length,1);
});
test('even invalid settings edits cancel pending delayed work while retaining prior safe config',()=>{
 const {e}=fixture('click');event(e,true,0);event(e,false,1);assert.throws(()=>e.setConfiguration({enabled:true,mappings:[{}]}));
 assert.deepEqual(e.advance(1000),[]);assert.equal(e.configurationSnapshot().mappings[0].id,'m');
});
test('reset invalidates issued sequence token and completion cannot unlock a newer dispatch',()=>{
 const {e}=fixture('press',{handleRepeating:true});const [old]=event(e,true,0);e.reset('stop');assert.equal(e.isDispatchCurrent(old),false);
 event(e,false,1);const [current]=event(e,true,2);e.completeDispatch(old);assert.deepEqual(event(e,true,3),[]);e.completeDispatch(current);assert.equal(event(e,true,4).length,1);
});
test('explicit touch action works during editor and text focus and cancels keyboard timers first',()=>{
 const {e}=fixture('click');event(e,true,0);event(e,false,1);context(e,{capturing:true,textInput:true,ime:true});
 const [d]=e.dispatchAction(new ShortcutAction('Media::PlayPause::Set',0));assert.ok(e.isDispatchCurrent(d));assert.equal(d.mappingId,'');assert.equal(d.emergency,false);
 assert.equal(e.nextDeadlineMs(),null);assert.deepEqual(e.advance(1000),[]);
});
test('reserved F12 stop remains immediate in disabled keyboard, editor/text/IME focus and invalid clock',()=>{
 const {e}=fixture('hold',{holdInvoke:'holding'});event(e,true,0);e.setConfiguration(Object.assign(config(mapping()),{enabled:false}));
 context(e,{textInput:true,ime:true,capturing:true});const [d]=event(e,true,NaN,EMERGENCY_STOP_KEY);
 assert.deepEqual(actionIds([d]),['App::Stop']);assert.equal(d.emergency,true);assert.equal(e.lastEventHandled(),true);assert.equal(e.isDispatchCurrent(d),true);
 const [repeat]=event(e,true,-1,EMERGENCY_STOP_KEY);assert.ok(repeat.token>d.token);assert.equal(e.isDispatchCurrent(d),false);
 assert.deepEqual(event(e,false,-1,EMERGENCY_STOP_KEY),[]);assert.equal(e.lastEventHandled(),true);
});
test('matched delayed key is consumed; unmatched key is not consumed',()=>{
 for(const trigger of ['click','hold']){const {e}=fixture(trigger);assert.deepEqual(event(e,true,0),[]);assert.equal(e.lastEventHandled(),true);event(e,false,1);assert.equal(e.lastEventHandled(),true);}
 const {e}=fixture();event(e,true,0,B);assert.equal(e.lastEventHandled(),false);
});
test('disabled mapping and empty editable chord/actions are inert',()=>{
 for(const extra of [{enabled:false},{keys:[]},{actions:[]}]){const {e}=fixture('press',extra);assert.deepEqual(event(e,true,0),[]);assert.deepEqual(event(e,false,1),[]);assert.deepEqual(e.advance(10000),[]);}
});
test('backward/invalid monotonic clocks cancel state, never invoke and preserve watermark',()=>{
 for(const invalid of [-1,NaN,Infinity,50,Number.MAX_SAFE_INTEGER]){
  const {e}=fixture('hold',{holdInvoke:'holding'});event(e,true,100);const token=e.cancellationToken();assert.deepEqual(e.advance(invalid),[]);
  assert.ok(e.cancellationToken()>token);assert.deepEqual(e.advance(2000),[]);assert.deepEqual(event(e,true,2001),[]);
  event(e,false,2002);event(e,true,2003);assert.equal(e.advance(3003).length,1);
 }
});
test('cold restored serialized configuration cannot restore pressed keys, timers, tokens or action latches',()=>{
 const {e}=fixture('hold',{holdInvoke:'holding'});event(e,true,0);const restored=new LocalShortcutEngine(JSON.parse(JSON.stringify(e.configurationSnapshot())));
 assert.equal(restored.cancellationToken(),0);assert.equal(restored.nextDeadlineMs(),null);assert.deepEqual(restored.advance(10000),[]);assert.deepEqual(event(restored,false,10001),[]);
 event(restored,true,10002);assert.equal(restored.advance(11002).length,1);
});
test('configuration and dispatch snapshots are defensive against caller mutations',()=>{
 const c=config(mapping());const e=new LocalShortcutEngine(c);c.mappings[0].actions[0].id='App::Stop';c.mappings[0].keys[0]=B;
 const [d]=event(e,true,0);assert.deepEqual(actionIds([d]),['Media::PlayPause::Toggle']);d.actions[0].id='App::Stop';
 assert.equal(e.configurationSnapshot().mappings[0].actions[0].id,'Media::PlayPause::Toggle');
 const copy=e.configurationSnapshot();copy.mappings[0].keys[0]=B;assert.deepEqual(e.configurationSnapshot().mappings[0].keys,[A]);
});
test('no unsupported toggle/axis trigger or arbitrary action enters local catalog',()=>{
 const ids=shortcutActionCatalog().map(a=>a.id);assert.equal(new Set(ids).size,ids.length);assert.ok(ids.length>=20);
 assert.ok(ids.every(id=>['Internal::AutoConnectEnabled::Set','Internal::AutoConnectEnabled::Toggle','OutputTarget::WebSocket::Uri::Set',...['Internal','DeoVR','HereSphere','OutputTarget'].flatMap(name=>['Toggle','Connect','Disconnect'].map(command=>name+'::Connection::'+command))].includes(id)||!/Connect|Arm|File|Import|Launch|Shell|Uri/i.test(id)));
 for(const trigger of ['toggleEnable','toggleDisable','toggleFlip','axisDrive','axisOffset','axisThreshold'])assert.equal(validateShortcutConfiguration(config(mapping(trigger))).valid,false);
 for(const id of ['Output::Arm','Output::Connect','Emby::Connection::Connect','DeoVR::AutoConnectEnabled::Set','Media::Path::Open','../../command',''])assert.equal(validateShortcutAction(new ShortcutAction(id)),false);
});
test('catalog original names exist in actual source registrations; explicit additions remain labeled',()=>{
 const script=readFileSync(new URL('../../Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs',import.meta.url),'utf8');
 const internal=readFileSync(new URL('../../Source/MultiFunPlayer/MediaSource/ViewModels/InternalMediaSource.cs',import.meta.url),'utf8') +
   readFileSync(new URL('../../Source/MultiFunPlayer/MediaSource/AbstractMediaSource.cs',import.meta.url),'utf8');
 for(const spec of shortcutActionCatalog()){
  if(spec.id.startsWith('App::')){assert.equal(spec.originalName,'');continue;}
  if(spec.targetOutput){
   const endpoints = {
    'OutputTarget::TCP::Endpoint::Set': ['Tcp', 'Endpoint'],
    'OutputTarget::UDP::Endpoint::Set': ['Udp', 'Endpoint'],
    'OutputTarget::WebSocket::Uri::Set': ['WebSocket', 'Uri']
   };
   if (Object.hasOwn(endpoints, spec.id)) {
    const [kind, field] = endpoints[spec.id];
    assert.equal(spec.originalName, '{Identifier}::' + field + '::Set');
    const source = readFileSync(new URL('../../Source/MultiFunPlayer/OutputTarget/ViewModels/' + kind + 'OutputTarget.cs', import.meta.url), 'utf8');
    assert.ok(source.includes('s.RegisterAction<string>($"' + spec.originalName + '"'), spec.id);
    assert.ok(source.includes(kind === 'WebSocket' ? 'Uri.TryCreate(uriString, UriKind.Absolute, out var uri)' : 'NetUtils.TryParseEndpoint(endpointString, out var endpoint)'), spec.id);
    assert.equal(spec.targetAxis, false);
   } else if (/^OutputTarget::Connection::(Toggle|Connect|Disconnect)$/.test(spec.id)) {
    assert.equal(spec.originalName, spec.id.replace('OutputTarget::', '{target.Identifier}::'));
    const source = readFileSync(new URL('../../Source/MultiFunPlayer/UI/Controls/ViewModels/OutputTargetViewModel.cs', import.meta.url), 'utf8');
    assert.ok(source.includes('s.RegisterAction($"' + spec.originalName + '"'), spec.id);
    assert.equal(spec.targetAxis, false);
   } else {
    assert.match(spec.id, /^OutputTarget::Axis::Range::(Minimum|Maximum|Middle|Size)::(Set|Offset)$/);
    assert.equal(spec.originalName,spec.id.replace('OutputTarget::','{Identifier}::'));
    const source=readFileSync(new URL('../../Source/MultiFunPlayer/OutputTarget/AbstractOutputTarget.cs',import.meta.url),'utf8');
    assert.ok(source.includes('"'+spec.originalName+'"')); assert.equal(spec.targetAxis, true);
   }
   continue;
  }
  assert.equal(spec.originalName,spec.id);
  if(/^(Internal|DeoVR|HereSphere)::Connection::(Toggle|Connect|Disconnect)$/.test(spec.id)){
   const source=readFileSync(new URL('../../Source/MultiFunPlayer/UI/Controls/ViewModels/MediaSourceViewModel.cs',import.meta.url),'utf8');
   assert.ok(source.includes('s.RegisterAction($"{source.Name}::Connection::'+spec.id.split('::').at(-1)+'"'),spec.id);
   assert.ok(source.includes('foreach (var source in AvailableSources)'));
  }
  else if(spec.id==='DeoVR::Endpoint::Set'||spec.id==='HereSphere::Endpoint::Set'){
   const name=spec.id.split('::')[0];
   const source=readFileSync(new URL('../../Source/MultiFunPlayer/MediaSource/ViewModels/'+name+'MediaSource.cs',import.meta.url),'utf8');
   assert.ok(source.includes('[DisplayName("'+name+'")]'));
   assert.ok(source.includes('s.RegisterAction<string>($"{Name}::Endpoint::Set"'));
   assert.ok(source.includes('NetUtils.TryParseEndpoint(endpointString, out var endpoint)'));
  }
  else if(spec.id.startsWith('Internal::'))assert.ok(internal.includes('"{Name}'+spec.id.slice('Internal'.length)+'"'));
  else if(spec.id.startsWith('MotionProvider::')){
   const [,provider,...command]=spec.id.split('::');
   const source=readFileSync(new URL('../../Source/MultiFunPlayer/MotionProvider/AbstractMotionProvider.cs',import.meta.url),'utf8')+
    readFileSync(new URL('../../Source/MultiFunPlayer/MotionProvider/ViewModels/'+provider.replaceAll(' ','')+'MotionProvider.cs',import.meta.url),'utf8');
   assert.ok(source.includes('"MotionProvider::{name}::'+command.join('::')+'"'),spec.id);
  }
  else if(spec.id.startsWith('Shortcut::')){
   const source=readFileSync(new URL('../../Source/MultiFunPlayer/UI/Controls/ViewModels/ShortcutSettingsViewModel.cs',import.meta.url),'utf8');
   assert.ok(source.includes('"'+spec.id+'"'),spec.id);
  }
  else assert.ok(script.includes('"'+spec.id+'"'),spec.id);
 }
});
test('key catalog is finite, unique, labels sorted chords and rejects unknown codes',()=>{
 const keys=keyCatalog();assert.equal(new Set(keys.map(k=>k.keyCode)).size,keys.length);assert.ok(keys.length<100);
 assert.equal(keyLabel(A),'A');assert.equal(keyLabel(EMERGENCY_STOP_KEY),'F12');assert.equal(keyLabel(-1),'Unsupported key');assert.equal(chordLabel([CTRL,A]),'A + Left Ctrl');
 for(const key of [-1,0,2016,99999,NaN,1.5,EMERGENCY_STOP_KEY])assert.equal(validateShortcutConfiguration(config(mapping('press',{keys:[key]}))).valid,false);
});
for(const change of [c=>c.extra=true,c=>c.enabled='yes',c=>c.mappings[0].runtime={},c=>c.mappings[0].keys=[A,A],c=>c.mappings[0].id='',c=>c.mappings[0].name='x'.repeat(81),c=>c.mappings[0].maximumHoldDurationMs=-2,c=>c.mappings[0].maximumClickIntervalMs=60001,c=>c.mappings[0].minimumHoldDurationMs=0.5,c=>c.mappings[0].clickCount=0,c=>c.mappings[0].clickCount=9,c=>c.mappings[0].actions[0].value=NaN,c=>c.mappings[0].actions[0].id='Output::Arm',c=>c.mappings.push(c.mappings[0])])test('strict malformed configuration rejects '+change.toString(),()=>{
 const c=config(mapping());change(c);const v=validateShortcutConfiguration(c);assert.equal(v.valid,false);assert.equal(v.configuration,null);assert.ok(v.errors.length);
});
test('configuration limits reject excess mapping, chord and action counts',()=>{
 assert.equal(validateShortcutConfiguration(config(...Array.from({length:65},(_,i)=>mapping('press',{id:'m'+i})))).valid,false);
 assert.equal(validateShortcutConfiguration(config(mapping('press',{keys:Array.from({length:9},(_,i)=>A+i)}))).valid,false);
 assert.equal(validateShortcutConfiguration(config(mapping('press',{actions:Array.from({length:17},()=>new ShortcutAction('App::Stop'))}))).valid,false);
 assert.equal(validateShortcutConfiguration(config(mapping('press',{keys:[],actions:[]}))).valid,true);
});
test('action arguments are finite and bounded; boolean and none values cannot be covert payloads',()=>{
 assert.equal(validateShortcutAction(new ShortcutAction('Media::PlayPause::Set',0.5)),false);
 assert.equal(validateShortcutAction(new ShortcutAction('App::Stop',1)),false);
 assert.equal(validateShortcutAction(new ShortcutAction('Media::Speed::Set',0.1)),false);
 assert.equal(validateShortcutAction(new ShortcutAction('Media::Position::Time::Offset',86401)),true);
 assert.equal(validateShortcutAction(new ShortcutAction('Media::ScriptOffset::Offset',60)),true);
 assert.equal(validateShortcutAction(new ShortcutAction('Media::Position::Time::Offset',-86400)),true);
});
test('engine modules have no platform/timer/file/network dependency or wall clock reads',()=>{
 for(const name of ['ShortcutConfiguration','ButtonShortcutState','LocalShortcutEngine']){
  const src=readFileSync(new URL('../entry/src/main/ets/input/'+name+'.ts',import.meta.url),'utf8');
  assert.doesNotMatch(src,/from ['"](@kit|@ohos|node:)|\b(setTimeout|setInterval|Date\.now|fetch|XMLHttpRequest)\s*\(/);
 }
});

test('OHOS safety divergence: superset release cancels abandoned smaller Hold without synthesizing actions',()=>{
 const {e}=fixture('hold',{holdInvoke:'holding',minimumHoldDurationMs:100});event(e,true,0,A);event(e,true,1,B);
 assert.deepEqual(event(e,false,50,B),[]);assert.equal(e.nextDeadlineMs(),null);assert.deepEqual(e.advance(1000),[]);
 event(e,false,1001,A);event(e,true,1002,A);assert.equal(e.advance(1102).length,1);
 for(const trigger of ['release','click']){const engine=fixture(trigger).e;event(engine,true,0,A);event(engine,true,1,B);assert.deepEqual(event(engine,false,2,B),[]);assert.deepEqual(engine.advance(1000),[]);}
});
test('superset release invalidates abandoned smaller outstanding action list without cancelling independent mapping',()=>{
 const e=new LocalShortcutEngine(config(mapping(),mapping('press',{id:'ab',keys:[A,B]})));
 const [a]=event(e,true,0,A);const [ab]=event(e,true,1,B);assert.ok(e.isDispatchCurrent(a));assert.ok(e.isDispatchCurrent(ab));
 event(e,false,2,B);assert.equal(e.isDispatchCurrent(a),false);assert.equal(e.isDispatchCurrent(ab),true);
});
test('unsupported physical punctuation inhibits exact chord and quarantines held repeats until released',()=>{
 const {e}=fixture('press',{handleRepeating:true});finish(e,event(e,true,0));event(e,true,1,2056);
 assert.deepEqual(event(e,true,2),[]);event(e,false,3,2056);assert.deepEqual(event(e,true,4),[]);
 event(e,false,5);assert.equal(event(e,true,6).length,1);
});
test('known keys pressed while unsupported physical input remains held stay inhibited',()=>{
 const {e}=fixture();event(e,true,0,2056);assert.deepEqual(event(e,true,1),[]);assert.deepEqual(event(e,true,2),[]);
 event(e,false,3,2056);assert.deepEqual(event(e,true,4),[]);event(e,false,5);assert.equal(event(e,true,6).length,1);
});
test('initial invalid-clock down is quarantined before a subsequent valid-time repeat',()=>{
 const {e}=fixture();assert.deepEqual(event(e,true,NaN),[]);assert.deepEqual(event(e,true,1),[]);event(e,false,2);assert.equal(event(e,true,3).length,1);
});
test('malformed physical stream has bounded storage and fails closed while reserved Stop survives',()=>{
 const {e}=fixture();for(let i=0;i<200;i++)event(e,true,i,3000+i);
 assert.ok(e.physicallyDown.length<=128);assert.ok(e.blockedUntilUp.length<=128);
 for(let i=0;i<200;i++)event(e,false,1000+i,3000+i);
 assert.deepEqual(event(e,true,2000),[]);assert.equal(event(e,true,2001,EMERGENCY_STOP_KEY).length,1);
});

test('late ticks preserve timer deadline order and configured order only breaks equal deadlines',()=>{
 const e=new LocalShortcutEngine(config(
  mapping('hold',{id:'late',holdInvoke:'holding',minimumHoldDurationMs:1000}),
  mapping('hold',{id:'early-first',holdInvoke:'holding',minimumHoldDurationMs:100}),
  mapping('hold',{id:'early-second',holdInvoke:'holding',minimumHoldDurationMs:100})
 ));
 event(e,true,0);assert.deepEqual(e.advance(5000).map(d=>d.mappingId),['early-first','early-second','late']);assert.deepEqual(e.advance(10000),[]);
});

test('0.19 adds exactly six original-template output aliases and preserves every inherited catalog field',()=>{
 const baseline=JSON.parse(readFileSync(new URL('../tools/reference/action-coverage-018-source.json',import.meta.url),'utf8')).candidate018.catalog;
 const catalog=shortcutActionCatalog(),ids=new Set(baseline.map(s=>s.id));
 assert.equal(baseline.length,172);assert.equal(catalog.length,182);assert.equal(new Set(catalog.map(s=>s.id)).size,182);
 for(const old of baseline){const current=JSON.parse(JSON.stringify(catalog.find(s=>s.id===old.id)));if(old.id==='Media::Path::Set'){assert.equal(current.label,'设置远端媒体路径（DeoVR / HereSphere）');current.label=old.label;}assert.deepEqual(current,old,old.id);}
 const here=catalog.filter(s=>s.id.startsWith('HereSphere::'));assert.equal(here.length,4);
 const added=catalog.filter(s=>!ids.has(s.id)&&!s.id.startsWith('HereSphere::'));
 const expected=['OutputTarget::TCP::Endpoint::Set','OutputTarget::UDP::Endpoint::Set','OutputTarget::WebSocket::Uri::Set',...['Toggle','Connect','Disconnect'].map(command=>'OutputTarget::Connection::'+command)];
 assert.deepEqual(added.map(s=>s.id).sort(),expected.sort());
 for(const spec of added){assert.match(spec.originalName,/^\{(?:target\.)?Identifier\}::/);assert.equal(spec.category,'output');assert.equal(spec.targetAxis,false);assert.equal(spec.targetOutput,true);assert.equal(spec.managedScript,false);assert.equal(spec.pointsKind,'none');}
 assert.equal(added.filter(s=>s.valueKind==='none').length,3);
 for(const kind of ['TCP','UDP'])assert.equal(added.find(s=>s.id==='OutputTarget::'+kind+'::Endpoint::Set').maximumTextLength,280);
 assert.equal(added.find(s=>s.id==='OutputTarget::WebSocket::Uri::Set').maximumTextLength,1300);
});
