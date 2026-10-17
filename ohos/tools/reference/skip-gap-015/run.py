#!/usr/bin/env python3
"""Compile/run ORIGINAL SkipGap source offline with an existing official .NET 9 SDK.
No NuGet, downloads, network, Git, WPF, media connection or physical device use.
"""
from pathlib import Path
import argparse, hashlib, json, os, re, shutil, subprocess, tempfile
BASE = Path(__file__).resolve().parent
REPO = next(p for p in BASE.parents if (p/'Source/MultiFunPlayer').is_dir())
SRC = REPO/'Source/MultiFunPlayer'
PIN = '36c08fbb99ac9398a63ff1cca1bbf68cd2228a94'
def sha(data): return hashlib.sha256(data).hexdigest()
def source(path): return (SRC/path).read_text(encoding='utf-8-sig').replace('\r\n','\n')
def method(text, marker):
 start = text.index(marker); opening = text.index('{', start); depth = 0
 for end in range(opening, len(text)):
  if text[end] == '{': depth += 1
  elif text[end] == '}':
   depth -= 1
   if depth == 0: return text[start:end+1]
 raise RuntimeError('Unclosed original method: '+marker)
def expression(text, marker):
 start = text.index(marker); return text[start:text.index(';',start)+1]
def extract():
 script = source('UI/Controls/ViewModels/ScriptViewModel.cs')
 extension = source('Common/Extensions.cs')
 snippets = {
  'VALIDATE_INDEX': expression(extension, 'public static bool ValidateIndex<T>'),
  'GET_AXIS_POSITION': expression(script, 'private double GetAxisPosition(DeviceAxis axis)'),
  'SKIP_GAP_OVERLOAD': expression(script, 'private void SkipGap(double minimumSkip = 0, params DeviceAxis[] axes)'),
  'SKIP_GAP': method(script, 'private void SkipGap(IEnumerable<DeviceAxis> axes = null, double minimumSkip = 0)'),
  'SEEK_MEDIA': method(script, 'private void SeekMediaToTime(double time)'),
  'INDEX_CONSTANTS': '\n'.join(next(line.strip() for line in script.splitlines() if 'public static int '+name+' ' in line) for name in ['AfterScriptIndex','BeforeScriptIndex','InvalidIndex']),
  'INSIDE_SCRIPT': expression(script, 'public bool InsideScript => Index >= 0 && Index != AfterScriptIndex')
 }
 text = (BASE/'Host.cs.in').read_text()
 for name, snippet in snippets.items(): text = text.replace('@@'+name+'@@', snippet)
 assert '@@' not in text
 return text, snippets

def run(inputs, sdk_root=None):
 root = sdk_root or os.environ.get('MFP_DOTNET_ROOT') or os.environ.get('DOTNET_ROOT')
 exe = Path(root)/'dotnet' if root else Path(shutil.which('dotnet') or '/unavailable-dotnet')
 if not exe.is_file(): raise SystemExit('Set MFP_DOTNET_ROOT or DOTNET_ROOT to an existing official .NET 9 SDK. No install/download attempted.')
 exe = exe.resolve(); root = exe.parent
 version = lambda p: tuple(int(v) for v in p.name.split('-')[0].split('.'))
 sdk = sorted((root/'sdk').glob('9.*'), key=version)[-1]
 ref = sorted((root/'packs/Microsoft.NETCore.App.Ref').glob('9.*'), key=version)[-1]
 host, snippets = extract()
 originals = ['Common/Keyframe.cs','Common/KeyframeCollection.cs','Common/Utils/MathUtils.cs']
 all_sources = ['UI/Controls/ViewModels/ScriptViewModel.cs','Common/Extensions.cs',*originals]
 env = {**os.environ, 'DOTNET_CLI_TELEMETRY_OPTOUT':'1', 'DOTNET_SKIP_FIRST_TIME_EXPERIENCE':'1',
        'DOTNET_GENERATE_ASPNET_CERTIFICATE':'false', 'DOTNET_NOLOGO':'1'}
 with tempfile.TemporaryDirectory(prefix='mfp-skip-gap-015-') as temp:
  work = Path(temp); env['DOTNET_CLI_HOME'] = str(work/'home'); (work/'Host.cs').write_text(host)
  args = ['/nologo','/nostdlib+','/langversion:13','/nullable:disable','/target:exe','/checked-',
          '/out:'+str(work/'Oracle.dll')]
  args += ['/reference:'+str(p) for p in sorted((ref/'ref/net9.0').glob('*.dll'))]
  args += [str(work/'Host.cs'),*[str(SRC/p) for p in originals]]
  (work/'compile.rsp').write_text('\n'.join('"'+a+'"' for a in args)+'\n')
  result = subprocess.run([str(exe),str(sdk/'Roslyn/bincore/csc.dll'),'/noconfig','@'+str(work/'compile.rsp')],
    env=env,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
  if result.returncode: raise SystemExit(result.stdout)
  (work/'Oracle.runtimeconfig.json').write_text(json.dumps({'runtimeOptions':{'tfm':'net9.0',
    'framework':{'name':'Microsoft.NETCore.App','version':ref.name}}}))
  result = subprocess.run([str(exe),str(work/'Oracle.dll')],env=env,input=json.dumps(inputs),
    text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
  if result.returncode: raise SystemExit(result.stderr)
  results = json.loads(result.stdout)
 provenance = {
  'executedCSharp': True, 'sourceCommit': PIN, 'sdk': sdk.name, 'runtime': ref.name,
  'compiler': 'official Roslyn csc.dll; no restore',
  'sourceHashNormalization':'CRLF-to-LF; preserve UTF-8 BOM and all other bytes',
  'sourceSha256': {str((SRC/p).relative_to(REPO)):sha((SRC/p).read_text(encoding='utf-8').replace('\r\n','\n').encode()) for p in all_sources},
  'extractedSpanSha256': {k:sha(v.encode()) for k,v in snippets.items()},
  'generatedHostSha256':sha(host.encode()),
  'hostTemplateSha256':sha((BASE/'Host.cs.in').read_bytes()),
  'runnerSha256':sha(Path(__file__).read_bytes()),
  'inputsSha256':sha((BASE/'inputs.json').read_bytes()),
  'shims': [
   'DeviceAxis structural record and All list; input-order dictionary keys are the currently bound axes.',
   'AxisState carries explicit Index with unchanged original index constants and InsideScript expression; no full updater or Fody.',
   'AxisSettings carries Offset only. locked/bypassScript input annotations do not filter source method; this test does not run their setter/event paths.',
   'CaptureEventAggregator records the MediaSeekMessage published by unchanged SeekMediaToTime; no media source acknowledgement.',
   'System.Windows.Point structural fields permit compiling unchanged MathUtils; WPF is not loaded.',
   'Optional initial-index preparation calls unchanged GetAxisPosition, SearchForIndexBefore and AdvanceIndex only; it does not claim full UpdateScript scheduling.'
  ],
  'limitations':['No WPF/Fody/dispatcher execution','No source connections, output or hardware','Not a full pipeline lifecycle test'],
  'portableSafetyDifference':'Original NaN MediaPosition can pass SkipGap comparisons and publish a finite seek. A finite-current-clock readiness rejection in OHOS is intentional and must not be counted as identical behavior.'
 }
 return {'schemaVersion':1,'provenance':provenance,'cases':[{'name':i['name'],'note':i.get('note',''),'input':i,'expected':r} for i,r in zip(inputs,results)]}
if __name__ == '__main__':
 parser = argparse.ArgumentParser(); parser.add_argument('--sdk-root'); parser.add_argument('--output'); args = parser.parse_args()
 result = run(json.loads((BASE/'inputs.json').read_text()),args.sdk_root)
 text = json.dumps(result,ensure_ascii=False,indent=2)+'\n'
 if args.output: Path(args.output).write_text(text)
 else: print(text,end='')
