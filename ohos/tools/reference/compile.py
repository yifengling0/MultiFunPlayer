#!/usr/bin/env python3
"""Compile original C# directly with official Roslyn/ref packs; no NuGet restore."""
from pathlib import Path
import json,subprocess,sys
from runtime import BASE,WORK,dotnet_path,environment,version_key
subprocess.run([sys.executable,str(BASE/'extract.py')],check=True)
dotnet=dotnet_path();root=dotnet.parent
sdks=sorted((root/'sdk').glob('9.*'),key=version_key)
refs=sorted((root/'packs/Microsoft.NETCore.App.Ref').glob('9.*'),key=version_key)
if not sdks or not refs:raise SystemExit('An official .NET 9 SDK and its bundled net9.0 reference pack are required.')
sdk=sdks[-1];reference=refs[-1];repo=next(p for p in BASE.parents if (p/'Source/MultiFunPlayer').is_dir())
originals=['Common/Keyframe.cs','Common/KeyframeCollection.cs','Common/Utils/MathUtils.cs','Common/DeviceAxis.cs','Common/DeviceSettings.cs','Script/IScriptWriter.cs','OutputTarget/DeviceAxisSettings.cs','Script/IScriptResource.cs','Script/ChapterCollection.cs','Script/BookmarkCollection.cs','Script/Chapter.cs','Script/Bookmark.cs']
sources=list(BASE.glob('*.cs'))+list((WORK/'generated').glob('*.cs'))+[repo/'Source/MultiFunPlayer'/r for r in originals]
out=WORK/'bin';out.mkdir(parents=True,exist_ok=True)
args=['/nologo','/nostdlib+','/langversion:13','/target:exe','/nullable:disable','/optimize+','/checked-','/out:'+str(out/'Reference.dll')]+['/reference:'+str(f) for f in (reference/'ref/net9.0').glob('*.dll')]+[str(f) for f in sources]
rsp=WORK/'compile.rsp';rsp.write_text('\n'.join('"'+a+'"' for a in args)+'\n')
(out/'Reference.runtimeconfig.json').write_text(json.dumps({'runtimeOptions':{'tfm':'net9.0','framework':{'name':'Microsoft.NETCore.App','version':reference.name}}})+'\n')
result=subprocess.run([str(dotnet),str(sdk/'Roslyn/bincore/csc.dll'),'/noconfig','@'+str(rsp)],env=environment(),stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
(WORK/'compile.log').write_text(result.stdout);print(result.stdout)
(WORK/'build-info.json').write_text(json.dumps({'sdk':sdk.name,'runtime':reference.name,'compiler':'official Roslyn csc.dll','sourceManifest':'tools/reference/source-manifest.json','compiled':result.returncode==0},indent=2)+'\n')
raise SystemExit(result.returncode)
