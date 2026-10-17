import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdtempSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);}});
const {applyOutputRangeAction}=await import('../entry/src/main/ets/input/ShortcutOutputRangeActions.ts');
const {mapFixed,mapEvent,isTCodeDirty,validateRange,rangeDiagnostic}=await import('../entry/src/main/ets/output/RangeModel.ts');
const {encodeFixed,encodeEvent}=await import('../entry/src/main/ets/output/TCodeEncoder.ts');
const {OutputSettingsModel}=await import('../entry/src/main/ets/output/OutputSettingsModel.ts');
const {OutputConfiguration,SavedOutputTarget,SavedOutputDeviceRanges}=await import('../entry/src/main/ets/settings/OutputConfiguration.ts');
const {SettingsSchema}=await import('../entry/src/main/ets/settings/SettingsSchema.ts');
const base=new URL('../tools/reference/output-range-017/',import.meta.url),root=new URL('../../',import.meta.url);
const read=name=>readFileSync(new URL(name,base),'utf8');
const golden=JSON.parse(read('golden.json'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const range=(minimum=.2,maximum=.8,enabled=true)=>({axisId:'L0',minimum,maximum,enabled});
const action=(operation,value,minimumLimit=0,maximumLimit=1)=>({operation,value,minimumLimit,maximumLimit});
function method(text,marker){
 const start=text.indexOf(marker);assert.ok(start>=0,marker);const open=text.indexOf('{',start),arrow=text.indexOf('=>',start);
 if(arrow>=0&&arrow<open)return text.slice(start,text.indexOf(';',arrow)+1);
 let depth=0;for(let end=open;end<text.length;end++){if(text[end]==='{')depth++;else if(text[end]==='}'&&--depth===0)return text.slice(start,end+1);}
 throw Error(marker);
}

test('oracle executes full unchanged original registration and property model, with exact provenance',()=>{
 const p=golden.provenance;assert.equal(p.executedOriginalCSharp,true);assert.equal(p.sdk,'9.0.319');
 const sources={};for(const [path,expected]of Object.entries(p.sourceSha256)){const bytes=readFileSync(new URL(path,root));assert.equal(hash(bytes),expected,path);sources[path]=bytes.toString('utf8').replace(/^\uFEFF/,'');}
 const math=sources['Source/MultiFunPlayer/Common/Utils/MathUtils.cs'],axis=sources['Source/MultiFunPlayer/Common/DeviceAxis.cs'];
 const spans={REGISTER_ACTIONS:method(sources['Source/MultiFunPlayer/OutputTarget/AbstractOutputTarget.cs'],'public virtual void RegisterActions('),
 CLAMP_SAFE:method(math,'public static double ClampSafe('),LERP:method(math,'public static double Lerp('),
 WIRE_VALUE:method(axis,'public static string ToString(DeviceAxis axis, double value)'),WIRE_EVENT:method(axis,'public static string ToString(DeviceAxis axis, double value, double interval)'),
 WIRE_FIXED:method(axis,'public static string ToString(IEnumerable<KeyValuePair<DeviceAxis, double>> values, double interval)'),DIRTY:method(axis,'public static bool IsValueDirty(double value, double lastValue)')};
 let host=read('Host.cs.in');for(const[key,span]of Object.entries(spans)){assert.equal(hash(span),p.extractedSpanSha256[key]);host=host.replace('@@'+key+'@@',span);}
 assert.equal(hash(host),p.generatedHostSha256);assert.equal(hash(read('Host.cs.in')),p.hostTemplateSha256);assert.equal(hash(read('run.py')),p.runnerSha256);
 assert.equal(Object.keys(spans).length,7);assert.ok(!host.includes('@@'));assert.match(p.shims.join('\n'),/No WPF\/Fody/);
});

test('all 2780 exact original callback results match portable pure action or explicit bounded refusal',()=>{
 let checked=0,reversed=0,rejected=0;
 for(const row of golden.rows){const i=row.input;if(i.axis!=='L0')continue;
  const before=range(i.minimum,i.maximum,checked%2===0),snapshot={...before};
  const input=action(i.operation,i.value,i.minimumLimit,i.maximumLimit),inputSnapshot={...input};
  const actual=applyOutputRangeAction(before,input);
  if(row.minimum<0||row.minimum>1||row.maximum<0||row.maximum>1){assert.equal(actual,null,JSON.stringify(i));rejected++;}
  else{assert.ok(actual,JSON.stringify(i));assert.deepEqual(actual.range,{...before,minimum:row.minimum,maximum:row.maximum},JSON.stringify(i));
   assert.equal(actual.changed,row.minimum!==before.minimum||row.maximum!==before.maximum);assert.notEqual(actual.range,before);if(row.minimum>row.maximum)reversed++;}
  assert.deepEqual(before,snapshot);assert.deepEqual(input,inputSnapshot);checked++;
 }
 assert.equal(checked,2780);assert.equal(rejected,220);assert.ok(reversed>300);
});

test('original null and other-axis callbacks do not change L0; shim maps empty/unknown text to null, never all axes',()=>{
 const rows=golden.rows.filter(r=>r.input.axis!=='L0');assert.equal(rows.length,24);
 for(const row of rows){assert.equal(row.minimum,.2);assert.equal(row.maximum,.8);}
});

test('source-specific Middle Set, Size Set, reversed limits and zero-width anchors are retained',()=>{
 const middle=applyOutputRangeAction(range(.2,.7),action('Middle::Set',.5));assert.equal(middle.range.minimum,.45);assert.equal(middle.range.maximum,.95);
 const size=applyOutputRangeAction(range(),action('Size::Set',0));assert.equal(size.range.minimum,.495);assert.equal(size.range.maximum,.505);
 assert.deepEqual(applyOutputRangeAction(range(),action('Minimum::Offset',1,1)).range,range(1,.8));
 assert.deepEqual(applyOutputRangeAction(range(),action('Maximum::Offset',-1,0,0)).range,range(.2,0));
 assert.deepEqual(applyOutputRangeAction(range(.8,.2),action('Minimum::Set',.125)).range,range(.125,.2));
 const decimal=applyOutputRangeAction(range(),action('Minimum::Set',.123456789));assert.equal(decimal.range.minimum,.123456789);
 assert.deepEqual(applyOutputRangeAction(range(.5,.5),action('Middle::Offset',0)).range,range(.5,.5));
});

test('malformed action, nonfinite endpoints, editor-domain violations and unsupported Drive fail without mutation',()=>{
 const original=range(),before=JSON.stringify(original);
 for(const invalid of [null,undefined,{},action('Minimum::Drive',.5),action('minimum::Set',.5),action('Minimum::Set',-.1),action('Minimum::Offset',1.1),action('Middle::Set',.5,.2),action('Minimum::Offset',0,0,.8),action('Maximum::Offset',0,.2),action('Size::Offset',0,NaN),action('Size::Offset',Infinity)])assert.equal(applyOutputRangeAction(original,invalid),null);
 for(const invalid of [null,undefined,range(NaN,1),range(0,Infinity),range(-.01,1),range(1.01,.2),range(.8,-.01),range(.8,1.01),{...original,axisId:'*'},{...original,enabled:1}])assert.equal(applyOutputRangeAction(invalid,action('Size::Set',.5)),null);
 assert.equal(JSON.stringify(original),before);
});

test('432 original C# ascending/reversed/constant Lerp, fixed/polled encoded bytes and dirty comparisons match',()=>{
 assert.equal(golden.mapping.length,432);
 for(const row of golden.mapping){const r=range(row.minimum,row.maximum),profile={precision:row.precision,revision:1,axisOrder:['L0'],maximumDurationMs:2147483647,maximumPayloadBytes:1024};
  const fixed=mapFixed([{axisId:'L0',value:row.value}],[r],profile);assert.equal(fixed[0].value,row.mapped);
  const event={eventId:1,epoch:2,sourceFrameSequence:3,axisId:'L0',kind:'script',targetValue:row.value,durationSeconds:.01025,from:null,to:null};
  const polled=mapEvent(event,r,profile);assert.equal(polled.targetValue,row.mapped);assert.equal(polled.durationSeconds,event.durationSeconds);
  assert.equal(encodeFixed(profile,fixed,10.25,false),row.fixedBytes);assert.equal(encodeEvent(profile,polled),row.polledBytes);
  assert.equal(isTCodeDirty(row.mapped,.5,row.precision),row.dirtyFromHalf);
 }
});

test('schema-1 ordered and reversed settings roundtrip without sorting, new runtime state or scope changes',()=>{
 for(const endpoints of [[.2,.8],[.8,.2],[1,0],[0,1],[.5,.5]]){
  const r=range(...endpoints,false),target=new SavedOutputTarget('tcp',0);target.rangesByDevice=[new SavedOutputDeviceRanges('TCode-0.3',[r])];
  const settings=SettingsSchema.defaults();settings.outputs.targets=[target];settings.outputs.selectedTargetId=target.id;
  const loaded=SettingsSchema.decode(SettingsSchema.encode(settings));assert.equal(loaded.status,'valid');assert.deepEqual(loaded.configuration.outputs.targets[0].rangesByDevice[0].ranges,[r]);
  const model=new OutputSettingsModel();model.ranges=[range()];assert.equal(model.setRange('L0',...endpoints,false),true);assert.deepEqual(model.ranges,[r]);
  assert.deepEqual(OutputConfiguration.validateTarget(target),[]);assert.doesNotThrow(()=>validateRange(r));
  if(endpoints[0]>endpoints[1])assert.match(rangeDiagnostic(r),/^reversedRange:/);
 }
 const model=new OutputSettingsModel();model.ranges=[range()];for(const pair of [[-.01,1],[1.01,.2],[.8,-.01],[.8,1.01]])assert.equal(model.setRange('L0',...pair,true),false);
 const saved=new SavedOutputTarget();saved.rangesByDevice=[new SavedOutputDeviceRanges('TCode-0.3',[range(1.01,.2)])];assert.notDeepEqual(OutputConfiguration.validateTarget(saved),[]);
});

test('optional original .NET execution is reproducible without network or restore',()=>{
 const root=process.env.MFP_DOTNET_ROOT;if(!root||!existsSync(join(root,'dotnet')))return;
 const work=mkdtempSync(join(tmpdir(),'mfp-output-range-017-test-'));try{
  const output=join(work,'golden.json');execFileSync('python3',[fileURLToPath(new URL('run.py',base)),'--sdk-root',root,'--output',output]);
  assert.deepEqual(JSON.parse(readFileSync(output,'utf8')),golden);
 }finally{rmSync(work,{recursive:true,force:true});}
});
