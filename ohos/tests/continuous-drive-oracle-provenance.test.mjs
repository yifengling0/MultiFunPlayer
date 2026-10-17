import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdtempSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const base=new URL('../tools/reference/continuous-drive-028/',import.meta.url),root=new URL('../../',import.meta.url);
const read=name=>readFileSync(new URL(name,base),'utf8');
const fixture=JSON.parse(read('golden.json')),manifest=JSON.parse(read('source-manifest.json'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function method(text,marker){
 const start=text.indexOf(marker);assert.ok(start>=0,marker);const opening=text.indexOf('{',start),arrow=text.indexOf('=>',start);
 if(arrow>=0&&(opening<0||arrow<opening))return text.slice(start,text.indexOf(';',arrow)+1);
 let depth=0;for(let end=opening;end<text.length;end++){if(text[end]==='{')depth++;else if(text[end]==='}'&&--depth===0)return text.slice(start,end+1);}throw Error(marker);
}
function registration(text,name){const start=text.indexOf('s.RegisterAction<IAxisInputGestureData, DeviceAxis>("'+name+'"');assert.ok(start>=0);return text.slice(start,text.indexOf(';',start)+1);}

test('0.28 exact C# provenance pins all source bytes, whole classes, unchanged extracted methods and structural boundaries',()=>{
 const p=fixture.provenance;assert.equal(p.executedOriginalCSharp,true);assert.equal(p.sourcePin,'36c08fbb99ac9398a63ff1cca1bbf68cd2228a94');
 assert.equal(p.sdk,'9.0.319');assert.equal(p.runtime,'9.0.21');assert.equal(manifest.sourcePin,p.sourcePin);
 assert.equal(Object.keys(p.sourceSha256).length,25);assert.equal(p.wholeCompiledFiles.length,8);
 const sources={};for(const [path,expected]of Object.entries(manifest.sources)){
  const bytes=readFileSync(new URL(path,root));assert.equal(bytes.length,expected.bytes,path);assert.equal(hash(bytes),expected.sha256,path);assert.equal(p.sourceSha256[path],expected.sha256,path);
  const blob=createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');assert.equal(blob,expected.gitBlobSha1,path);sources[path]=bytes.toString('utf8').replace(/^\uFEFF/,'');
 }
 const source=name=>sources['Source/MultiFunPlayer/'+name],math=source('Common/Utils/MathUtils.cs'),script=source('UI/Controls/ViewModels/ScriptViewModel.cs'),shortcut=source('Shortcut/IShortcut.cs');
 const spans={};for(const [key,name]of [['CLAMP_01','Clamp01'],['CLAMP_SAFE','ClampSafe'],['LERP','Lerp'],['UNLERP','UnLerp'],['MAP','Map']])spans[key]=method(math,'public static double '+name+'(');
 Object.assign(spans,{
  OUTPUT_REGISTER:method(source('OutputTarget/AbstractOutputTarget.cs'),'public virtual void RegisterActions('),
  SCRIPT_UPDATE_SETTINGS:method(script,'void UpdateSettings(DeviceAxis axis, Action<AxisSettings> callback)'),
  AXIS_VALUE_DRIVE:registration(script,'Axis::Value::Drive'),AXIS_BLEND_DRIVE:registration(script,'Axis::MotionProviderBlend::Drive'),
  SET_AXIS_TRANSITION:method(script,'public void SetAxisTransition('),AXIS_VALUE_TRANSITION:method(script,'internal sealed class AxisValueTransition'),
  INVOKE:method(shortcut,'protected void Invoke('),ON_INVOKED:method(shortcut,'private void OnInvoked()')
 });
 let host=read('Host.cs.in');for(const[key,span]of Object.entries(spans)){assert.equal(hash(span),p.extractedSpanSha256[key],key);host=host.replace('@@'+key+'@@',span);}
 assert.equal(Object.keys(spans).length,13);assert.ok(!host.includes('@@'));assert.equal(hash(host),p.generatedHostSha256);
 assert.equal(hash(read('Host.cs.in')),p.hostTemplateSha256);assert.equal(hash(read('run.py')),p.runnerSha256);assert.equal(hash(read('source-manifest.json')),p.manifestSha256);
 assert.match(p.shims.join('\n'),/No WPF\/Fody\/dispatcher/);assert.match(p.shims.join('\n'),/manually ticked/);
});

test('fixture covers five Drive modes, both inversions, source sign/center boundaries, Offset modes and nine action templates',()=>{
 const rows=fixture.rows,select=kind=>rows.filter(row=>row.input.kind===kind);
 assert.equal(rows.length,3194);assert.equal(select('drive').length,700);assert.equal(select('offset').length,140);assert.equal(select('apply').length,240);assert.equal(select('action').length,2106);assert.equal(select('contrast').length,8);
 assert.deepEqual([...new Set(select('drive').map(row=>row.input.mode))],['Absolute','Relative','RelativePositiveOnly','RelativeNegativeOnly','RelativeJoystick']);
 assert.equal(new Set(select('action').map(row=>row.input.action)).size,9);
 const find=(kind,match)=>select(kind).find(row=>Object.entries(match).every(([key,value])=>row.input[key]===value));
 assert.equal(find('drive',{mode:'RelativePositiveOnly',invert:true,value:.5,delta:.01,duration:0}).output.valueOrDelta,-.01);
 assert.equal(find('drive',{mode:'RelativePositiveOnly',invert:true,value:.5,delta:-.01,duration:0}).output,null);
 for(const delta of [-1,-.01,0,.01,1])assert.equal(find('drive',{mode:'RelativeJoystick',invert:false,value:.5,delta,duration:0}).output,null);
 assert.equal(find('offset',{mode:'AbsoluteJoystick',invert:false,speed:.1,value:.5}).output.running,false);
 assert.deepEqual(find('offset',{mode:'AbsoluteJoystick',invert:false,speed:.1,value:1}).output,
  {immediate:0,running:true,period:.1,data:{valueOrDelta:.1,deltaTime:.1,isAbsolute:false,isRelative:true},offset:.1});
 // Preserve source signed zero across the C# -> Python -> JSON pipeline.
 assert.ok(Object.is(find('drive',{mode:'Relative',invert:true,value:.5,delta:0,duration:0}).output.valueOrDelta,-0));
});

test('original Invoke enforces busy-drop and retry after refusal; Offset updates a retained callback and cancels at zero',()=>{
 assert.deepEqual(fixture.scheduling,{countWhileHeld:1,countAfterCompletion:2,acceptedAfterRefusal:1,
  immediateCount:0,startsWhileChanging:1,repeatStoppedAtZero:true,values:[
   {valueOrDelta:.1,deltaTime:.1,isAbsolute:false,isRelative:true},{valueOrDelta:.05,deltaTime:.1,isAbsolute:false,isRelative:true}
  ]});
 const source=readFileSync(new URL('Source/MultiFunPlayer/Shortcut/IShortcut.cs',root),'utf8');
 const repeat=method(source,'private async Task RepeatCallback(');
 assert.match(repeat,/using var timer = new PeriodicTimer\(period\);[\s\S]*while \(await timer.WaitForNextTickAsync\(token\)\)[\s\S]*action\(\);/);
 // This is source evidence for wait-before-first-invoke, not a fake clock claim about WPF/.NET scheduling.
 assert.ok(repeat.indexOf('WaitForNextTickAsync')<repeat.indexOf('action();'));
});

test('Motion setters and range bindings retain raw values rather than inventing source-to-target repair or canvas effects',()=>{
 const src=name=>readFileSync(new URL('Source/MultiFunPlayer/'+name,root),'utf8');
 const provider=src('MotionProvider/AbstractMotionProvider.cs');
 assert.match(provider,/public double Minimum \{ get; set; \} = 0/);assert.match(provider,/public double Maximum \{ get; set; \} = 1/);
 assert.match(provider,/p\.Minimum = MathUtils\.Clamp01\(data\.ApplyTo\(p\.Minimum\)\)/);
 assert.match(provider,/p\.Maximum = MathUtils\.Clamp01\(data\.ApplyTo\(p\.Maximum\)\)/);
 for(const name of ['Random','Pattern','CustomCurve','LoopingScript']){
  const view=src('MotionProvider/Views/'+name+'MotionProvider.xaml');
  assert.match(view,/LowerValue="\{Binding Minimum, Mode=TwoWay, UpdateSourceTrigger=PropertyChanged\}"/);
  assert.match(view,/UpperValue="\{Binding Maximum, Mode=TwoWay, UpdateSourceTrigger=PropertyChanged\}"/);assert.match(view,/MinRange="0\.01"/);
 }
 const curve=src('MotionProvider/ViewModels/CustomCurveMotionProvider.cs');
 assert.match(curve,/\[DependsOn\(nameof\(Duration\)\)\][\s\S]*?public Rect Viewport => new\(0, 0, Duration, 1\)/);
 assert.doesNotMatch(curve,/OnMinimumChanged|OnMaximumChanged|DependsOn\(nameof\(Minimum\)\)|DependsOn\(nameof\(Maximum\)\)/);
 const audit=readFileSync(new URL('../RANGE_OCTAVES_016_SOURCE_AUDIT.md',import.meta.url),'utf8');assert.match(audit,/without\s+writing the coerced value back/);
});

test('actual original .NET 9 execution reproduces the entire golden fixture without network or restore',t=>{
 const sdk=process.env.MFP_DOTNET_ROOT;if(!sdk||!existsSync(join(sdk,'dotnet'))){t.skip('Supply MFP_DOTNET_ROOT for live original C# re-execution.');return;}
 const work=mkdtempSync(join(tmpdir(),'mfp-drive-oracle-test-'));
 try{const output=join(work,'golden.json');execFileSync('python3',[fileURLToPath(new URL('run.py',base)),'--sdk-root',sdk,'--output',output]);assert.deepEqual(JSON.parse(readFileSync(output,'utf8')),fixture);}
 finally{rmSync(work,{recursive:true,force:true});}
});
