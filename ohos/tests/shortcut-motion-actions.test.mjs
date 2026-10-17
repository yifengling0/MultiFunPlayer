import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){return next(specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)?specifier+'.ts':specifier,context);}});
const {MotionConfigurations,MotionProviderConfiguration,MotionCurvePoint}=await import('../entry/src/main/ets/core/MotionConfiguration.ts');
const {MotionRegistry}=await import('../entry/src/main/ets/core/motion/MotionRegistry.ts');
const {RandomMotion}=await import('../entry/src/main/ets/core/motion/RandomMotion.ts');
const {ShortcutAction,defaultShortcutAction,cloneShortcutAction,validateShortcutAction,shortcutActionCatalog,KeyboardShortcutConfiguration,KeyboardShortcutMapping}=await import('../entry/src/main/ets/input/ShortcutConfiguration.ts');
const {applyMotionShortcutAction,motionShortcutProviderId}=await import('../entry/src/main/ets/input/ShortcutMotionActions.ts');
const ids=['Custom Curve','Looping Script','Pattern','Random'];
const common=['Speed::Offset','Speed::Set','Minimum::Offset','Minimum::Set','Maximum::Offset','Maximum::Set'];
const specifics={'Custom Curve':['InterpolationType::Set','Duration::Set','IsLooping::Set','IsLooping::Toggle','Reset'],
 'Looping Script':['Interpolation::Set'],Pattern:['Pattern::Set'],Random:['Octaves::Set','Persistence::Set','Lacunarity::Set']};
function apply(config,command,value=0,text='',target='L0'){
 return applyMotionShortcutAction(config,new ShortcutAction('MotionProvider::'+config.id+'::'+command,value,target,0,text),'L0',['L0','R0']);
}

test('exact 16 scalar source templates expand to 34 provider-applicable scalar actions, all executable',()=>{
 const all=shortcutActionCatalog();assert.equal(all.length,182);assert.equal(new Set(all.map(x=>x.id)).size,182);
 const motions=all.filter(x=>x.category==='motion'&&x.pointsKind==='none'&&!x.managedScript);assert.equal(motions.length,34);
 for(const provider of ids){
  const expected=common.concat(specifics[provider]).map(x=>'MotionProvider::'+provider+'::'+x).sort();
  assert.deepEqual(motions.filter(x=>motionShortcutProviderId(x.id)===provider).map(x=>x.id).sort(),expected);
  for(const id of expected){
   const spec=all.find(x=>x.id===id);assert.equal(spec.targetAxis,true);assert.equal(spec.originalName,id);
   const action=defaultShortcutAction(id);assert.equal(validateShortcutAction(action),true,id);
   const old=new MotionProviderConfiguration(provider);const before=JSON.stringify(old);
   const result=applyMotionShortcutAction(old,action,'L0',['L0','R0']);assert.ok(result,id);assert.ok(result.summary,id);
   assert.equal(JSON.stringify(old),before,id);assert.notEqual(result.settings,old,id);
   assert.deepEqual(MotionConfigurations.validate(result.settings),[],id);
  }
 }
 for(const id of ['MotionProvider::Random::Reset','MotionProvider::Pattern::Octaves::Set','MotionProvider::Custom Curve::Interpolation::Set',
  'MotionProvider::Looping Script::InterpolationType::Set','MotionProvider::Random::Speed::Drive',
  'MotionProvider::random::Speed::Set','Axis::MotionProvider::Set'])assert.equal(motionShortcutProviderId(id),null,id);
 assert.equal(motionShortcutProviderId('MotionProvider::Looping Script::Script::Set'),'Looping Script');
 assert.equal(applyMotionShortcutAction(new MotionProviderConfiguration('Looping Script'),defaultShortcutAction('MotionProvider::Looping Script::Script::Set'),'L0',['L0']),null,'managed script uses separate catalog/IO transaction');
 assert.equal(motionShortcutProviderId('MotionProvider::Custom Curve::Points::Set'),'Custom Curve');
 assert.equal(applyMotionShortcutAction(new MotionProviderConfiguration('Custom Curve'),defaultShortcutAction('MotionProvider::Custom Curve::Points::Set'),'L0',['L0']),null,'points use the separate ordered setter path');
});

test('editor bounds and defaults match source registrations, without interval quantization',()=>{
 const specs=shortcutActionCatalog();
 for(const provider of ids){
  const prefix='MotionProvider::'+provider+'::';
  for(const[command,min,max,step,value]of[['Speed::Offset',-Number.MAX_VALUE,Number.MAX_VALUE,.01,0],['Speed::Set',.01,Number.MAX_VALUE,.01,.01],
   ['Minimum::Offset',-1,1,.01,0],['Minimum::Set',0,1,.01,0],['Maximum::Offset',-1,1,.01,0],['Maximum::Set',0,1,.01,0]]){
   const spec=specs.find(x=>x.id===prefix+command);assert.deepEqual([spec.minimum,spec.maximum,spec.step,spec.defaultValue],[min,max,step,value]);
  }
 }
 for(const[provider,command,min,max,step,value]of[['Custom Curve','Duration::Set',1,60,1,1],['Random','Octaves::Set',1,2147483647,1,1],
  ['Random','Persistence::Set',.01,Number.MAX_VALUE,.01,.01],['Random','Lacunarity::Set',.1,2,.01,.1]]){
  const spec=specs.find(x=>x.id==='MotionProvider::'+provider+'::'+command);assert.deepEqual([spec.minimum,spec.maximum,spec.step,spec.defaultValue],[min,max,step,value]);
 }
 assert.equal(defaultShortcutAction('MotionProvider::Custom Curve::IsLooping::Set').value,0);
 assert.equal(defaultShortcutAction('MotionProvider::Custom Curve::Reset').value,1);
 assert.equal(defaultShortcutAction('MotionProvider::Looping Script::Interpolation::Set').text,'linear');
 const random=new MotionProviderConfiguration('Random');
 assert.equal(apply(random,'Speed::Set',.125).settings.speed,.125);
 assert.equal(apply(random,'Persistence::Set',.135).settings.persistence,.135);
 assert.equal(apply(random,'Lacunarity::Set',.123456).settings.lacunarity,.123456);
 assert.equal(apply(new MotionProviderConfiguration('Custom Curve'),'Duration::Set',1.125).settings.durationSeconds,1.125);
});

for(const provider of ids)test('common scalar setters clone '+provider+', clamp independently and preserve other parameters',()=>{
 const old=new MotionProviderConfiguration(provider);old.speed=.125;old.minimum=.8;old.maximum=.2;
 assert.equal(apply(old,'Speed::Offset',-.2).settings.speed,.01);
 assert.equal(apply(old,'Speed::Offset',.25).settings.speed,.375);
 assert.equal(apply(old,'Minimum::Offset',1).settings.minimum,1);
 assert.equal(apply(old,'Minimum::Offset',-1).settings.minimum,0);
 assert.equal(apply(old,'Maximum::Offset',1).settings.maximum,1);
 assert.equal(apply(old,'Maximum::Offset',-1).settings.maximum,0);
 const same=apply(old,'Speed::Set',.125);assert.equal(same.configurationChanged,false);assert.equal(same.resetSync,false);
 const next=apply(old,'Minimum::Set',.9);assert.equal(next.settings.maximum,.2);assert.equal(next.settings.minimum,.9);
 assert.equal(next.configurationChanged,true);assert.equal(next.resetSync,true);assert.equal(next.resetCustomCurve,false);
 const expected=MotionConfigurations.clone(old);expected.minimum=.9;assert.deepEqual(next.settings,expected);
 assert.equal(old.minimum,.8);assert.equal(old.maximum,.2);
});

test('nonfinite values, scalar overflow, malformed DTOs and unavailable targets fail without mutation',()=>{
 const old=new MotionProviderConfiguration('Pattern');old.speed=Number.MAX_VALUE;const before=JSON.stringify(old);
 assert.equal(apply(old,'Speed::Offset',Number.MAX_VALUE),null);assert.equal(JSON.stringify(old),before);
 for(const value of [NaN,Infinity,-Infinity,0,-.01])assert.equal(apply(old,'Speed::Set',value),null);
 const action=defaultShortcutAction('MotionProvider::Pattern::Speed::Set');
 for(const malformed of [{...action,command:'x'},{...action,text:'unused'},{...action,secondaryValue:1},{...action,targetAxis:'../../axis'}]){
  assert.equal(applyMotionShortcutAction(old,malformed,'L0',['L0']),null);
 }
 assert.equal(applyMotionShortcutAction(old,action,'L0',['R0']),null);
 assert.equal(apply(old,'Speed::Set',1,'','R0'),null);assert.equal(apply(old,'Speed::Set',1,'','Z9'),null);
 assert.ok(apply(old,'Speed::Set',1,'',''),'blank resolves only to supplied selected axis');
 assert.equal(applyMotionShortcutAction(new MotionProviderConfiguration('Random'),action,'L0',['L0']),null);
 const invalid=new MotionProviderConfiguration('Pattern');invalid.speed=NaN;
 assert.equal(applyMotionShortcutAction(invalid,action,'L0',['L0']),null);
});

test('provider-specific enums and duration retain deep-cloned resources and headless setter semantics',()=>{
 const curve=new MotionProviderConfiguration('Custom Curve');curve.points=[new MotionCurvePoint(-1,.2),new MotionCurvePoint(2,.8),new MotionCurvePoint(10,.5)];
 const result=apply(curve,'Duration::Set',1);assert.equal(result.settings.durationSeconds,1);assert.deepEqual(result.settings.points,curve.points);
 assert.notEqual(result.settings.points,curve.points);assert.notEqual(result.settings.points[0],curve.points[0]);
 for(const mode of ['linear','pchip','makima','step']){
  assert.equal(apply(curve,'InterpolationType::Set',0,mode).settings.interpolationMode,mode);
  const loop=new MotionProviderConfiguration('Looping Script');loop.sourceUri='file:///managed/clip.funscript';
  const next=apply(loop,'Interpolation::Set',0,mode);assert.equal(next.settings.interpolationMode,mode);assert.equal(next.settings.sourceUri,loop.sourceUri);
 }
 for(const pattern of ['triangle','sine','doubleBounce','sharpBounce','saw','square'])assert.equal(apply(new MotionProviderConfiguration('Pattern'),'Pattern::Set',0,pattern).settings.pattern,pattern);
 for(const command of ['InterpolationType::Set','Duration::Set'])assert.equal(apply(curve,command,0,'invalid'),null);
 assert.equal(apply(curve,'Duration::Set',.99),null);assert.equal(apply(curve,'Duration::Set',60.01),null);
 assert.equal(apply(curve,'IsLooping::Set',0).settings.isLooping,false);assert.equal(apply(curve,'IsLooping::Toggle').settings.isLooping,false);
 curve.isLooping=false;assert.equal(apply(curve,'IsLooping::Toggle').settings.isLooping,true);
});

test('Random Int32 storage remains exact while the existing activation budget rejects excessive work',()=>{
 const old=new MotionProviderConfiguration('Random');
 for(const value of [1,8,128,129,2147483647]){
  const result=apply(old,'Octaves::Set',value);assert.ok(result);assert.equal(result.settings.octaves,value);
  assert.deepEqual(MotionConfigurations.validate(result.settings),[]);
  if(value>RandomMotion.MAX_RUNTIME_OCTAVES)assert.throws(()=>RandomMotion.validateRuntimeConfiguration(result.settings),/runtime budget/);
  else assert.doesNotThrow(()=>RandomMotion.validateRuntimeConfiguration(result.settings));
 }
 for(const value of [0,1.5,2147483648,NaN,Infinity])assert.equal(apply(old,'Octaves::Set',value),null);
 assert.equal(apply(old,'Persistence::Set',Number.MAX_VALUE).settings.persistence,Number.MAX_VALUE);
 assert.equal(apply(old,'Lacunarity::Set',.099),null);assert.equal(apply(old,'Lacunarity::Set',2.01),null);
 assert.equal(old.octaves,1);
});

test('Reset explicitly preserves parameters and cached output, optionally syncs before phase reset, and works repeatedly',()=>{
 let registry;const callbacks=[];
 registry=new MotionRegistry(['L0','R0'],undefined,axis=>callbacks.push({axis,time:registry.getProvider(axis,'Custom Curve').getTimeSeconds()}),()=>1n);
 const curve=registry.getProvider('L0','Custom Curve');const config=curve.getConfiguration();
 config.points=[new MotionCurvePoint(0,0),new MotionCurvePoint(10,1)];registry.configureProvider('L0',config);
 registry.update('L0','Custom Curve',.75);const cached=registry.getValue('L0');const write=curve.getWriteState();callbacks.length=0;
 for(const sync of [1,1,0]){
  const result=apply(curve.getConfiguration(),'Reset',sync);assert.equal(result.configurationChanged,false);assert.equal(result.resetCustomCurve,true);
  assert.equal(result.resetSync,!!sync);assert.deepEqual(result.settings,curve.getConfiguration());
  registry.resetCustomCurve('L0',result.resetSync);assert.equal(curve.getTimeSeconds(),0);assert.equal(curve.isPlaying(),true);
  assert.equal(registry.getValue('L0'),cached);assert.equal(curve.getWriteState(),write);
 }
 assert.deepEqual(callbacks,[{axis:'L0',time:.75},{axis:'L0',time:0}]);
});

test('scalar apply path emits sync once on change, preserves provider phase and never synthesizes output',()=>{
 let syncs=0;const registry=new MotionRegistry(['L0'],undefined,()=>syncs++,()=>1n);
 registry.update('L0','Custom Curve',.5);const curve=registry.getProvider('L0','Custom Curve');const cached=registry.getValue('L0');const write=curve.getWriteState();
 const changed=apply(curve.getConfiguration(),'Speed::Set',2);assert.equal(changed.configurationChanged,true);
 registry.configureProvider('L0',changed.settings);assert.equal(syncs,1);assert.equal(curve.getTimeSeconds(),.5);
 assert.equal(registry.getValue('L0'),cached);assert.equal(curve.getWriteState(),write);
 const unchanged=apply(curve.getConfiguration(),'Speed::Set',2);assert.equal(unchanged.configurationChanged,false);assert.equal(unchanged.resetSync,false);
 registry.configureProvider('L0',unchanged.settings);assert.equal(syncs,1);
});

test('new scalar/text payloads round trip with source names, independent flags and bounded managed identities',()=>{
 const catalog=shortcutActionCatalog();
 for(const id of ['Shortcut::Enabled::Set','Shortcut::Enabled::Toggle']){
  const spec=catalog.find(x=>x.id===id);assert.equal(spec.category,'shortcut');assert.equal(spec.targetAxis,false);assert.equal(spec.textArgumentLabel,'Target shortcut name');
  for(const name of ['', 'exact Name', 'same name', '非 ASCII']){
   const action=new ShortcutAction(id,id.endsWith('Set')?1:0,'',0,name);assert.equal(validateShortcutAction(action),true);assert.deepEqual(cloneShortcutAction(action),action);
  }
 }
 const byName=new ShortcutAction('Internal::Playlist::PlayByName',0,'',0,'x'.repeat(4096));
 assert.equal(validateShortcutAction(byName),true);assert.equal(validateShortcutAction({...byName,text:'x'.repeat(4097)}),false);
 assert.equal(validateShortcutAction({...byName,text:'path\nfile'}),false);
 const ordinary=new ShortcutAction('Media::Chapter::SeekToByName',0,'',0,'x'.repeat(257));assert.equal(validateShortcutAction(ordinary),false);
 const config=new KeyboardShortcutConfiguration();
 for(const spec of catalog.filter(x=>x.category==='motion'||x.category==='shortcut'||x.id==='Internal::Playlist::PlayByName')){
  const mapping=new KeyboardShortcutMapping('m'+config.mappings.length,'Name '+config.mappings.length);mapping.actions=[defaultShortcutAction(spec.id)];config.mappings.push(mapping);
 }
 const copy=KeyboardShortcutConfiguration.fromJson(JSON.parse(JSON.stringify(config)));assert.deepEqual(copy,config);
 copy.mappings[0].actions[0].targetAxis='R0';assert.equal(config.mappings[0].actions[0].targetAxis,'');
});

test('reducer stays pure and source provenance includes exact registration and optional Reset semantics',()=>{
 const source=readFileSync(new URL('../entry/src/main/ets/input/ShortcutMotionActions.ts',import.meta.url),'utf8');
 assert.doesNotMatch(source,/from ['"](?:@kit|@ohos|node:)|\b(?:setTimeout|setInterval|Date\.now|fetch|XMLHttpRequest)\s*\(/);
 const custom=readFileSync(new URL('../../Source/MultiFunPlayer/MotionProvider/ViewModels/CustomCurveMotionProvider.cs',import.meta.url),'utf8');
 assert.match(custom,/WithLabel\("Request sync"\)\.WithDefaultValue\(true\)/);
 assert.match(custom,/if \(sync\)\s*p\.RequestSync\(\);\s*p\.ResetState\(true\)/);
 const commonSource=readFileSync(new URL('../../Source/MultiFunPlayer/MotionProvider/AbstractMotionProvider.cs',import.meta.url),'utf8');
 assert.match(commonSource,/p\.Speed = Math\.Max\(0\.01, p\.Speed \+ offset\)/);
 assert.match(commonSource,/p\.Minimum = MathUtils\.Clamp01\(p\.Minimum \+ offset\)/);
});
