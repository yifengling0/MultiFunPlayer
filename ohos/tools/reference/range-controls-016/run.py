#!/usr/bin/env python3
"""Execute unchanged pinned MahApps methods with explicit structural shims.
Offline compilation with an existing official .NET 9 SDK; never restore/install.
"""
from pathlib import Path
import argparse, hashlib, json, os, shutil, subprocess, tempfile
BASE = Path(__file__).resolve().parent
def sha(b): return hashlib.sha256(b).hexdigest()
def method(text, marker):
 start = text.index(marker); depth = 0
 for end in range(text.index('{', start), len(text)):
  if text[end] == '{': depth += 1
  elif text[end] == '}':
   depth -= 1
   if depth == 0: return text[start:end+1]
 raise ValueError('Unclosed original method: '+marker)
def extract():
 range_source = (BASE/'upstream/RangeSlider.cs').read_text(encoding='utf-8-sig')
 numeric = (BASE/'upstream/NumericUpDown.cs').read_text(encoding='utf-8-sig')
 markers = {
  'LOWER':'internal static object CoerceLowerValue(',
  'UPPER':'internal static object CoerceUpperValue(',
  'RANGES_CHANGED':'private static void RangesChanged(',
  'COERCE_BOTH':'private void CoerceLowerUpperValues()',
  'RAISE_EVENTS':'private static void RaiseValueChangedEvents('
 }
 snippets = {key:method(range_source,value) for key,value in markers.items()}
 snippets['NUMERIC'] = method(numeric,'private static object CoerceValue(')
 host = (BASE/'Host.cs.in').read_text()
 for key,value in snippets.items(): host=host.replace('@@'+key+'@@', value)
 assert '@@' not in host
 return host,snippets
def run(sdk_root=None):
 root=sdk_root or os.environ.get('MFP_DOTNET_ROOT') or os.environ.get('DOTNET_ROOT')
 exe=Path(root)/'dotnet' if root else Path(shutil.which('dotnet') or '/unavailable-dotnet')
 if not exe.is_file(): raise SystemExit('Set MFP_DOTNET_ROOT to an existing official .NET 9 SDK; no install is attempted.')
 exe=exe.resolve(); root=exe.parent
 version=lambda p:tuple(int(v) for v in p.name.split('-')[0].split('.'))
 sdk=sorted((root/'sdk').glob('9.*'),key=version)[-1]
 ref=sorted((root/'packs/Microsoft.NETCore.App.Ref').glob('9.*'),key=version)[-1]
 host,snippets=extract(); inputs=json.loads((BASE/'inputs.json').read_text())
 env={**os.environ,'DOTNET_CLI_TELEMETRY_OPTOUT':'1','DOTNET_SKIP_FIRST_TIME_EXPERIENCE':'1',
      'DOTNET_GENERATE_ASPNET_CERTIFICATE':'false','DOTNET_NOLOGO':'1'}
 with tempfile.TemporaryDirectory(prefix='mfp-range-controls-016-') as tmp:
  work=Path(tmp); env['DOTNET_CLI_HOME']=str(work/'home'); (work/'Host.cs').write_text(host)
  args=['/nologo','/nostdlib+','/langversion:13','/nullable:disable','/target:exe','/checked-',
        '/out:'+str(work/'Oracle.dll')]
  args+=['/reference:'+str(p) for p in sorted((ref/'ref/net9.0').glob('*.dll'))]
  args+=[str(work/'Host.cs')]
  (work/'compile.rsp').write_text('\n'.join('"'+a+'"' for a in args)+'\n')
  result=subprocess.run([str(exe),str(sdk/'Roslyn/bincore/csc.dll'),'/noconfig','@'+str(work/'compile.rsp')],
    env=env,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
  if result.returncode: raise SystemExit(result.stdout)
  (work/'Oracle.runtimeconfig.json').write_text(json.dumps({'runtimeOptions':{'tfm':'net9.0',
    'framework':{'name':'Microsoft.NETCore.App','version':ref.name}}}))
  result=subprocess.run([str(exe),str(work/'Oracle.dll')],env=env,input=json.dumps(inputs),text=True,
    stdout=subprocess.PIPE,stderr=subprocess.PIPE)
  if result.returncode: raise SystemExit(result.stderr)
  outputs=json.loads(result.stdout)
 provenance={
  'executedCSharp':True,'wpfExecuted':False,'sdk':sdk.name,'runtime':ref.name,
  'compiler':'official Roslyn csc.dll; no restore',
  'sourceSha256':{p.name:sha(p.read_bytes()) for p in sorted((BASE/'upstream').iterdir())},
  'extractedSpanSha256':{key:sha(value.encode()) for key,value in snippets.items()},
  'generatedHostSha256':sha(host.encode()),'hostTemplateSha256':sha((BASE/'Host.cs.in').read_bytes()),
  'runnerSha256':sha(Path(__file__).read_bytes()),'inputsSha256':sha((BASE/'inputs.json').read_bytes()),
  'shims':[
   'DependencyObject.CoerceValue stores effective values and recursively invokes unchanged RangesChanged only on an effective change; this is a declared structural shim, not the Windows property engine.',
   'Retained BaseLower/BaseUpper are supplied source values. The harness does not execute any binding or prove model write-back behavior.',
   'ReCalculateSize is a no-op; original source only writes geometry, not endpoints.',
   'Routed-event arguments are structural records and RaiseEvent is a collector. No WPF routing or dispatcher is executed.',
   'Default settled range 0..1 and MinRange .01 are injected. XAML attribute/binding initialization and unloaded lifetime are not reproduced.',
   'NumericInput.All, minimum1 and maximum8 are injected; only NumericUpDown.CoerceValue executes, not text parsing or OnValueChanged.'
  ],
  'limitations':['No WPF/Fody/Stylet/dispatcher execution','No native control lifecycle proof','No pointer geometry, template timing or two-thumb edit proof','No network, packages, endpoints or physical output']
 }
 return {'schemaVersion':1,'provenance':provenance,'cases':[{'input':i,'expected':o} for i,o in zip(inputs,outputs)]}
if __name__=='__main__':
 parser=argparse.ArgumentParser(); parser.add_argument('--sdk-root'); parser.add_argument('--output'); args=parser.parse_args()
 result=json.dumps(run(args.sdk_root),ensure_ascii=False,indent=2)+'\n'
 if args.output: Path(args.output).write_text(result)
 else: print(result,end='')
