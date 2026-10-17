#!/usr/bin/env python3
"""Execute original full RegisterActions, plain settings and wire methods offline.
No packages, restore, network, WPF, Fody, physical endpoints or downloaded SDK.
"""
from pathlib import Path
import argparse,hashlib,json,os,random,subprocess,tempfile
BASE=Path(__file__).resolve().parent
REPO=BASE.parents[3]
def sha(value):return hashlib.sha256(value).hexdigest()
def method(text,marker):
 start=text.index(marker); opening=text.index('{',start); depth=0
 # Expression-bodied methods are kept unchanged through their terminating semicolon.
 arrow=text.find('=>',start,opening)
 if arrow>=0:return text[start:text.index(';',arrow)+1]
 for end in range(opening,len(text)):
  if text[end]=='{':depth+=1
  elif text[end]=='}':
   depth-=1
   if depth==0:return text[start:end+1]
 raise ValueError(marker)
def extract():
 paths=['Source/MultiFunPlayer/OutputTarget/AbstractOutputTarget.cs','Source/MultiFunPlayer/OutputTarget/DeviceAxisSettings.cs','Source/MultiFunPlayer/Common/Utils/MathUtils.cs','Source/MultiFunPlayer/Common/DeviceAxis.cs']
 sources={p:(REPO/p).read_bytes() for p in paths}
 read=lambda p:sources[p].decode('utf-8-sig')
 snippets={'REGISTER_ACTIONS':method(read(paths[0]),'public virtual void RegisterActions('),'CLAMP_SAFE':method(read(paths[2]),'public static double ClampSafe('),'LERP':method(read(paths[2]),'public static double Lerp(')}
 axis=read(paths[3])
 for key,marker in [('WIRE_VALUE','public static string ToString(DeviceAxis axis, double value)'),('WIRE_EVENT','public static string ToString(DeviceAxis axis, double value, double interval)'),('WIRE_FIXED','public static string ToString(IEnumerable<KeyValuePair<DeviceAxis, double>> values, double interval)'),('DIRTY','public static bool IsValueDirty(double value, double lastValue)')]:snippets[key]=method(axis,marker)
 host=(BASE/'Host.cs.in').read_text()
 for key,value in snippets.items():host=host.replace('@@'+key+'@@',value)
 assert '@@' not in host
 return host,snippets,sources
def inputs():
 ranges=[(0,1),(.2,.8),(.8,.2),(1,0),(0,0),(1,1),(.5,.5),(.4,.41),(.8,.9),(.2,.7)]
 values=[0,.005,.01,.125,.5,.9999999999999999,1]
 limits=[(0,1),(.2,.8),(.5,.5),(.8,.2),(0,0),(1,1),(.5,.505)]
 rows=[]
 for field in ['Minimum','Maximum','Middle','Size']:
  for mode in ['Set','Offset']:
   for lo,hi in ranges:
    for value in values+([] if mode=='Set' else [-1,-.5,-.005]):
     for lower,upper in ([(0,1)] if mode=='Set' else limits):
      if field=='Minimum':upper=1
      if field=='Maximum':lower=0
      item=dict(operation=field+'::'+mode,axis='L0',minimum=lo,maximum=hi,value=value,minimumLimit=lower,maximumLimit=upper)
      if item not in rows:rows.append(item)
 for axis in [None,'','R0','L1','*','all']:
  for operation in ['Minimum::Set','Maximum::Set','Middle::Set','Size::Set']:
   rows.append(dict(operation=operation,axis=axis,minimum=.2,maximum=.8,value=.125,minimumLimit=0,maximumLimit=1))
 return rows
def run(root):
 exe=Path(root)/'dotnet'; version=lambda p:tuple(int(v) for v in p.name.split('-')[0].split('.'))
 sdk=sorted((Path(root)/'sdk').glob('9.*'),key=version)[-1];ref=sorted((Path(root)/'packs/Microsoft.NETCore.App.Ref').glob('9.*'),key=version)[-1]
 host,snippets,sources=extract();cases=inputs()
 env={**os.environ,'DOTNET_CLI_TELEMETRY_OPTOUT':'1','DOTNET_SKIP_FIRST_TIME_EXPERIENCE':'1','DOTNET_GENERATE_ASPNET_CERTIFICATE':'false','DOTNET_NOLOGO':'1'}
 with tempfile.TemporaryDirectory(prefix='mfp-output-range-017-') as tmp:
  work=Path(tmp);env['DOTNET_CLI_HOME']=str(work/'home');(work/'Host.cs').write_text(host)
  (work/'DeviceAxisSettings.cs').write_bytes(sources['Source/MultiFunPlayer/OutputTarget/DeviceAxisSettings.cs'])
  args=['/nologo','/nostdlib+','/langversion:13','/nullable:disable','/target:exe','/out:'+str(work/'Oracle.dll')]+['/reference:'+str(p) for p in sorted((ref/'ref/net9.0').glob('*.dll'))]+[str(work/'Host.cs'),str(work/'DeviceAxisSettings.cs')]
  (work/'compile.rsp').write_text('\n'.join('"'+a+'"' for a in args))
  compiled=subprocess.run([str(exe),str(sdk/'Roslyn/bincore/csc.dll'),'/noconfig','@'+str(work/'compile.rsp')],env=env,text=True,capture_output=True)
  if compiled.returncode:raise RuntimeError(compiled.stdout+compiled.stderr)
  (work/'Oracle.runtimeconfig.json').write_text(json.dumps({'runtimeOptions':{'tfm':'net9.0','framework':{'name':'Microsoft.NETCore.App','version':ref.name}}}))
  result=subprocess.run([str(exe),str(work/'Oracle.dll')],env=env,input=json.dumps(cases),text=True,capture_output=True)
  if result.returncode:raise RuntimeError(result.stderr)
  result=json.loads(result.stdout)
 return {'provenance':{'executedOriginalCSharp':True,'sdk':sdk.name,'runtime':ref.name,'compiler':'official Roslyn csc.dll; no restore','sourceSha256':{p:sha(b) for p,b in sources.items()},'extractedSpanSha256':{p:sha(s.encode()) for p,s in snippets.items()},'hostTemplateSha256':sha((BASE/'Host.cs.in').read_bytes()),'generatedHostSha256':sha(host.encode()),'runnerSha256':sha(Path(__file__).read_bytes()),'shims':['Shortcut manager captures original registered delegates; builder labels/constraints are inert and separately source-audited.','DeviceAxis contains only two named identities and ToString; output encoding/dirty methods are unchanged source spans.','DeviceAxisSettings.cs is unmodified with inert JSON attributes and Stylet base.','No WPF/Fody/dispatcher/control lifetime or transport execution.']},**result}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--sdk-root',default=os.environ.get('MFP_DOTNET_ROOT'));p.add_argument('--output',default=str(BASE/'golden.json'));a=p.parse_args()
 if not a.sdk_root:raise SystemExit('Set MFP_DOTNET_ROOT to an existing official .NET 9 SDK. No installation is attempted.')
 Path(a.output).write_text(json.dumps(run(a.sdk_root),separators=(',',':'))+'\n')
