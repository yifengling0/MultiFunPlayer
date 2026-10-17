import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, nextResolve) {
 return nextResolve(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? specifier + '.ts' : specifier, context);
} });
const { MediaLoopControls, scriptStartPosition } = await import('../entry/src/main/ets/core/playback/MediaControls.ts');
const { AxisKeyframe } = await import('../entry/src/main/ets/core/AxisScriptStore.ts');
const root = new URL('../../Source/MultiFunPlayer/', import.meta.url);
function span(source, marker) {
 const start = source.indexOf(marker); assert.ok(start >= 0, marker);
 let depth = 0, end = source.indexOf('{',start);
 for (; end < source.length; end++) {
  if (source[end] === '{') depth++;
  if (source[end] === '}' && --depth === 0) break;
 }
 return source.slice(start,end+1);
}
// Source spans here contain no braces in strings/comments. They are inserted
// unchanged in a tiny memory host, not reimplemented as a JS expected function.
const script = readFileSync(new URL('UI/Controls/ViewModels/ScriptViewModel.cs',root),'utf8');
const keyframe = readFileSync(new URL('Common/KeyframeCollection.cs',root),'utf8');
const loopSource = span(script,'internal sealed class MediaLoopSegment');
const gapSource = span(keyframe,'public int SkipGap(int index)');
const isGapSource = span(keyframe,'private bool IsGapInternal(int index)');
const dotnet = process.env.DOTNET_ROOT ? join(process.env.DOTNET_ROOT,'dotnet') : null;

test('actual source-extracted C# loop setters and SkipGap differential (DOTNET_ROOT enables)',
 { skip: !dotnet || !existsSync(dotnet) ? 'Set DOTNET_ROOT to installed official .NET 9 SDK to run C# oracle.' : false }, () => {
 const sdkRoot = resolve(process.env.DOTNET_ROOT);
 const latest = folder => readdirSync(folder).filter(n=>n.startsWith('9.')).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).at(-1);
 const sdk = latest(join(sdkRoot,'sdk')), ref = latest(join(sdkRoot,'packs/Microsoft.NETCore.App.Ref'));
 assert.ok(sdk && ref, '.NET 9 SDK and reference pack required');
 const dir = mkdtempSync(join(tmpdir(),'mfp-controls-oracle-'));
 const source = `using System; using System.Linq; using System.Collections.Generic; using System.Text.Json;
class PropertyChangedBase {}
${loopSource}
record Keyframe(double Position, double Value);
class Keys : List<Keyframe> {
 public Keys(IEnumerable<Keyframe> values):base(values) {}
 ${gapSource}
 ${isGapSource}
}
static class Extensions { public static bool ValidateIndex<T>(this List<T> list,int i)=>i>=0&&i<list.Count; }
class Program {
 static void Main() {
 var loop = new MediaLoopSegment(); var bounds = new List<double?[]>();
 double[] values = [0,5,10,10,-5,double.NaN,double.PositiveInfinity,double.NegativeInfinity,20,0];
 for(int n=0;n<200;n++) {
  var value=values[(n*7+n/10)%values.Length];
  if(n%11==0)loop.Clear(); else if(n%2==0)loop.StartPosition=value; else loop.EndPosition=value;
  bounds.Add([loop.StartPosition,loop.EndPosition]);
 }
 var gaps = new List<int>();
 for(int n=0;n<100;n++) {
  var points=new List<Keyframe>();
  for(int i=0;i<n%9;i++)points.Add(new Keyframe(i*(n%3==0 ? 0.0005 : 10),i<n%5 ? 0 : 0.5));
  gaps.Add(new Keys(points).SkipGap(0));
 }
 Console.Write(JsonSerializer.Serialize(new {bounds,gaps}));
 }
}`;
 writeFileSync(join(dir,'Program.cs'),source);
 const refs = join(sdkRoot,'packs/Microsoft.NETCore.App.Ref',ref,'ref/net9.0');
 const args = ['/nologo','/nostdlib+','/langversion:13','/target:exe','/out:'+join(dir,'Oracle.dll'),
  ...readdirSync(refs).filter(f=>f.endsWith('.dll')).map(f=>'/reference:'+join(refs,f)),join(dir,'Program.cs')];
 const compile = spawnSync(dotnet,[join(sdkRoot,'sdk',sdk,'Roslyn/bincore/csc.dll'),'/noconfig',...args],{encoding:'utf8'});
 assert.equal(compile.status,0,compile.stdout+compile.stderr);
 writeFileSync(join(dir,'Oracle.runtimeconfig.json'),JSON.stringify({runtimeOptions:{tfm:'net9.0',framework:{name:'Microsoft.NETCore.App',version:ref}}}));
 const execute = spawnSync(dotnet,[join(dir,'Oracle.dll')],{encoding:'utf8'});
 assert.equal(execute.status,0,execute.stderr);
 const expected = JSON.parse(execute.stdout); const loop = new MediaLoopControls();
 const values = [0,5,10,10,-5,NaN,Infinity,-Infinity,20,0];
 for(let n=0;n<200;n++) {
  const value=values[(n*7+Math.floor(n/10))%values.length];
  if(n%11===0) loop.clear(); else if(n%2===0) loop.setStart(value,100); else loop.setEnd(value,100);
  assert.deepEqual([loop.startPosition,loop.endPosition],expected.bounds[n],`setter frame ${n}`);
 }
 for(let n=0;n<100;n++) {
  const points=[]; for(let i=0;i<n%9;i++) points.push(new AxisKeyframe(i*(n%3===0?0.0005:10),i<n%5?0:0.5));
  assert.equal(scriptStartPosition(points),expected.gaps[n]<0?null:points[expected.gaps[n]].positionSeconds,`gap case ${n}`);
 }
});
