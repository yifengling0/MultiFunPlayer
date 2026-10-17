import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c)}});
const{ShortcutAction,ShortcutPoint,defaultShortcutAction,cloneShortcutAction,validateShortcutAction,shortcutActionCatalog,
 KeyboardShortcutConfiguration,KeyboardShortcutMapping}=await import('../entry/src/main/ets/input/ShortcutConfiguration.ts');
const{applyShortcutPointAction,customCurvePointArguments,CustomCurvePointArguments}=await import('../entry/src/main/ets/input/ShortcutPointActions.ts');
const{LocalShortcutEngine}=await import('../entry/src/main/ets/input/LocalShortcutEngine.ts');
const{AxisConfiguration,SmartLimitPoint}=await import('../entry/src/main/ets/core/AxisConfiguration.ts');
const{DeviceAxisDefinition}=await import('../entry/src/main/ets/core/DeviceProfile.ts');
const{MotionCurvePoint}=await import('../entry/src/main/ets/core/MotionConfiguration.ts');
const{SettingsSchema}=await import('../entry/src/main/ets/settings/SettingsSchema.ts');
const SMART='Axis::SmartLimitPoints::Set',CURVE='MotionProvider::Custom Curve::Points::Set';
function smart(points=[]){return new ShortcutAction(SMART,0,'L0',0,'',points)}
function curve(points=[],duration=1,interpolation='linear'){return new ShortcutAction(CURVE,duration,'L0',0,interpolation,points)}
function axis(){return new AxisConfiguration(new DeviceAxisDefinition('L0'),['L0','R0'])}
function keyboard(actions){const result=new KeyboardShortcutConfiguration(),mapping=new KeyboardShortcutMapping('points','Points');mapping.keys=[2017];mapping.actions=actions;result.mappings=[mapping];return result}
function pairs(points){return points.map(({x,y})=>[x,y])}

test('0.15 adds exactly five source identities with source-derived numeric bounds and payload defaults',()=>{
 const specs=shortcutActionCatalog();assert.equal(specs.length,182);assert.equal(new Set(specs.map(s=>s.id)).size,182);
 const script=readFileSync(new URL('../../Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs',import.meta.url),'utf8');
 for(const id of [SMART,'Axis::Value::Set','Axis::Value::Offset','Script::SkipGap'])assert.ok(script.includes('"'+id+'"'),id);
 for(const id of ['Media::Position::SkipGap','MotionProvider::CustomCurve::Points::Set'])assert.equal(specs.find(s=>s.id===id),undefined);
 assert.deepEqual(specs.filter(s=>s.pointsKind!=='none').map(s=>[s.id,s.pointsKind]),[[SMART,'smartLimit'],[CURVE,'customCurve']]);
 assert.deepEqual(pairs(defaultShortcutAction(SMART).points),[[50,50]]);
 const custom=defaultShortcutAction(CURVE);assert.deepEqual([custom.value,custom.text,pairs(custom.points)],[1,'linear',[[.5,.5]]]);
 for(const[id,min,max,value,secondary]of[['Axis::Value::Set',0,1,0,true],['Axis::Value::Offset',-1,1,0,true],['Script::SkipGap',0,Number.MAX_VALUE,2,false],[CURVE,1,60,1,false]]){
  const s=specs.find(s=>s.id===id);assert.deepEqual([s.minimum,s.maximum,s.defaultValue,s.targetAxis],[min,max,value,true]);
  assert.equal(s.secondaryValueKind,secondary?'number':'none');assert.equal(s.secondaryDefaultValue,0);
  if(secondary)assert.deepEqual([s.secondaryMinimum,s.secondaryMaximum,s.secondaryLabel],[0,Number.MAX_VALUE,'Duration']);
 }
 assert.equal(specs.find(s=>s.id==='Script::SkipGap').category,'media');
 assert.deepEqual(specs.find(s=>s.id===CURVE).textOptions.map(s=>s.value),['linear','pchip','makima','step']);
});

test('general constructor stays empty while point catalog defaults are fresh deep copies',()=>{
 assert.deepEqual(new ShortcutAction('App::Stop').points,[]);assert.deepEqual(new ShortcutAction(SMART).points,[]);
 const points=[new ShortcutPoint(10,20)];const action=smart(points);points[0].x=99;points.push(new ShortcutPoint(30,40));
 assert.deepEqual(pairs(action.points),[[10,20]]);assert.notEqual(action.points[0],points[0]);
 const first=defaultShortcutAction(SMART),second=defaultShortcutAction(SMART);first.points[0].x=1;
 assert.deepEqual(pairs(second.points),[[50,50]]);
 const firstCurve=defaultShortcutAction(CURVE);firstCurve.points.push(new ShortcutPoint(1,1));
 assert.deepEqual(pairs(defaultShortcutAction(CURVE).points),[[.5,.5]]);
});

test('old point-less payloads migrate additively and all nonpoint actions reject nonempty points',()=>{
 for(const spec of shortcutActionCatalog().filter(s=>s.pointsKind==='none')){
  const old=defaultShortcutAction(spec.id);delete old.points;
  assert.equal(validateShortcutAction(old),true,spec.id);assert.deepEqual(cloneShortcutAction(old).points,[]);
  assert.equal(validateShortcutAction({...old,points:[{x:0,y:0}]}),false,spec.id);
 }
 const old={id:'Axis::ScriptOffset::Offset',value:-.05};assert.deepEqual(cloneShortcutAction(old),new ShortcutAction(old.id,old.value));
});

test('smart-limit coordinates retain percent units and explicit strict-X OHOS boundary without rewriting',()=>{
 for(const points of [[],[{x:0,y:100}],[{x:0,y:100},{x:50,y:50},{x:100,y:0}]])assert.equal(validateShortcutAction(smart(points)),true);
 for(const points of [[{x:-1,y:0}],[{x:101,y:0}],[{x:1,y:-1}],[{x:1,y:101}],[{x:50,y:0},{x:50,y:100}],[{x:100,y:0},{x:0,y:100}]]){
  const action=smart(points),before=JSON.stringify(action);assert.equal(validateShortcutAction(action),false);assert.equal(JSON.stringify(action),before);
 }
 assert.equal(validateShortcutAction(smart([{x:.123456,y:99.99999}])),true);
});

test('custom curves preserve finite negative/out-of-viewport x, list order and first-duplicate inputs',()=>{
 const points=[{x:10,y:.25},{x:-1,y:.75},{x:10,y:.9},{x:Number.MAX_VALUE,y:1},{x:-Number.MAX_VALUE,y:0}];
 for(const mode of ['linear','pchip','makima','step']){
  const action=curve(points,1.125,mode);assert.equal(validateShortcutAction(action),true);
  const args=customCurvePointArguments(action);assert.ok(args);assert.equal(args.durationSeconds,1.125);assert.equal(args.interpolationMode,mode);
  assert.deepEqual(pairs(args.points),pairs(points));assert.notEqual(args.points,action.points);assert.notEqual(args.points[0],action.points[0]);
 }
 assert.deepEqual(customCurvePointArguments(curve()).points,[]);
 for(const duration of [0,.99,60.01,NaN,Infinity,-Infinity])assert.equal(customCurvePointArguments(curve([],duration)),null);
 for(const mode of ['', 'Linear', 'spline', 'linear\n'])assert.equal(customCurvePointArguments(curve([],1,mode)),null);
 for(const y of [-.01,1.01])assert.equal(validateShortcutAction(curve([{x:0,y}])),false);
});

test('point DTOs reject unknown fields, arrays, null, missing coordinates, strings and nonfinite numbers',()=>{
 for(const id of [SMART,CURVE]){
  const base=defaultShortcutAction(id);
  for(const points of [null,{},'0,1',1,[null],[[]],[{}],[{x:0}],[{y:0}],[{x:'0',y:0}],[{x:0,y:'0'}],
   [{x:NaN,y:0}],[{x:Infinity,y:0}],[{x:-Infinity,y:0}],[{x:0,y:NaN}],[{x:0,y:Infinity}],
   [{x:0,y:0,command:'App::Stop'}],[{x:0,y:0,sourceUri:'file:///x'}],new Array(1)]){
   const action={...base,points};assert.equal(validateShortcutAction(action),false,id+' '+JSON.stringify(points));assert.throws(()=>cloneShortcutAction(action));
  }
  const decorated=[];decorated.command='App::Stop';assert.equal(validateShortcutAction({...base,points:decorated}),false);
  for(const fields of [{secondaryValue:1},{targetAxis:'../L0'},{targetAxis:null},{file:'x'},{runtime:{}}])assert.equal(validateShortcutAction({...base,...fields}),false);
 }
 assert.equal(validateShortcutAction({...smart(),text:'linear'}),false);assert.equal(validateShortcutAction({...smart(),value:1}),false);
});

test('per-action and aggregate point budgets reject overflow before persistence, including disabled mappings',()=>{
 assert.equal(KeyboardShortcutConfiguration.MAX_POINTS_PER_ACTION,4096);assert.equal(KeyboardShortcutConfiguration.MAX_TOTAL_POINTS,8192);
 const points=Array.from({length:4096},(_,i)=>({x:i,y:i%2}));const action=curve(points);
 assert.equal(validateShortcutAction(action),true);assert.equal(validateShortcutAction({...action,points:points.concat({x:0,y:0})}),false);
 const max=keyboard([action,curve(points)]);assert.deepEqual(KeyboardShortcutConfiguration.validate(max),[]);
 max.mappings[0].enabled=false;max.mappings[0].actions.push(curve([{x:0,y:0}]));
 assert.match(KeyboardShortcutConfiguration.validate(max)[0],/8192/);assert.throws(()=>KeyboardShortcutConfiguration.clone(max),/8192/);
});

test('point helpers only map copies, preserve unrelated settings, and reject cross-kind/invalid input',()=>{
 const old=axis();old.smartLimitPoints=[new SmartLimitPoint(25,75)];old.offsetSeconds=3;old.speedLimitUnitsPerSecond=Infinity;
 const before=JSON.stringify(AxisConfiguration.toJson(old)),action=smart([{x:0,y:100},{x:100,y:0}]);
 const result=applyShortcutPointAction(action,old);assert.ok(result);assert.deepEqual(pairs(result.smartLimitPoints),[[0,100],[100,0]]);
 assert.equal(result.offsetSeconds,3);assert.equal(result.speedLimitUnitsPerSecond,Infinity);assert.equal(JSON.stringify(AxisConfiguration.toJson(old)),before);
 result.smartLimitPoints[0].y=50;assert.equal(action.points[0].y,100);assert.equal(old.smartLimitPoints[0].y,75);
 assert.deepEqual(applyShortcutPointAction(smart(),old).smartLimitPoints,[]);
 for(const invalid of [curve(),new ShortcutAction('App::Stop'),{...action,points:[{x:1,y:2},{x:1,y:3}]}])assert.equal(applyShortcutPointAction(invalid,old),null);
 assert.equal(applyShortcutPointAction(action,null),null);const malformed=axis();malformed.offsetSeconds=NaN;assert.equal(applyShortcutPointAction(action,malformed),null);
 assert.equal(customCurvePointArguments(action),null);assert.equal(customCurvePointArguments(new ShortcutAction('App::Stop')),null);
 const points=[new MotionCurvePoint(1,.5)];const args=new CustomCurvePointArguments(2,'step',points);points[0].y=.9;assert.equal(args.points[0].y,.5);
});

test('configuration, admitted dispatch, touch dispatch and snapshot boundaries detach nested points',()=>{
 const original=curve([{x:.5,y:.25}]),config=keyboard([original]);const engine=new LocalShortcutEngine(config);
 original.points[0].y=.8;config.mappings[0].actions[0].points.push(new ShortcutPoint(1,1));
 const snapshot=engine.configurationSnapshot();assert.deepEqual(pairs(snapshot.mappings[0].actions[0].points),[[.5,.25]]);
 const [dispatch]=engine.keyEvent({keyCode:2017,pressed:true},0);assert.deepEqual(pairs(dispatch.actions[0].points),[[.5,.25]]);
 snapshot.mappings[0].actions[0].points[0].y=.9;dispatch.actions[0].points[0].y=.7;
 assert.deepEqual(pairs(engine.configurationSnapshot().mappings[0].actions[0].points),[[.5,.25]]);
 engine.completeDispatch(dispatch);engine.keyEvent({keyCode:2017,pressed:false},1);
 const [next]=engine.keyEvent({keyCode:2017,pressed:true},2);assert.deepEqual(pairs(next.actions[0].points),[[.5,.25]]);
 const touch=curve([{x:1,y:.4}]);const [touched]=engine.dispatchAction(touch);touch.points[0].y=.3;assert.deepEqual(pairs(touched.actions[0].points),[[1,.4]]);
});

test('SettingsSchema roundtrip keeps bounded point payloads and optional old points without aliasing',()=>{
 const settings=SettingsSchema.defaults();settings.keyboard=keyboard([smart([{x:0,y:100},{x:100,y:0}]),curve([{x:5,y:.2},{x:-1,y:.8},{x:5,y:.9}],3,'makima')]);
 const encoded=SettingsSchema.encode(settings),restored=SettingsSchema.decode(encoded);assert.equal(restored.status,'valid');
 assert.deepEqual(restored.configuration.keyboard,settings.keyboard);restored.configuration.keyboard.mappings[0].actions[1].points[0].y=.5;
 assert.equal(settings.keyboard.mappings[0].actions[1].points[0].y,.2);
 const old=JSON.parse(encoded);old.keyboard.mappings[0].actions=[{id:'Media::PlayPause::Toggle',value:0}];
 const migrated=SettingsSchema.decode(JSON.stringify(old));assert.ok(migrated.configuration);assert.deepEqual(migrated.configuration.keyboard.mappings[0].actions[0].points,[]);
 const bad=JSON.parse(encoded);bad.keyboard.mappings[0].actions[0].points[0].exec='App::Stop';assert.equal(SettingsSchema.decode(JSON.stringify(bad)).configuration,null);
});

test('pure point helpers have no runtime, file, timer, platform or network dependency',()=>{
 const code=readFileSync(new URL('../entry/src/main/ets/input/ShortcutPointActions.ts',import.meta.url),'utf8');
 assert.doesNotMatch(code,/from ['"](?:@kit|@ohos|node:)|\b(?:setTimeout|setInterval|Date\.now|fetch|XMLHttpRequest|configureProvider|setPoints|resetSync)\s*\(/);
});
