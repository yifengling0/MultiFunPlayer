#!/usr/bin/env python3
"""Extract exact pinned C# algorithm spans. Does not rewrite source expressions."""
import hashlib, json, re, subprocess
from pathlib import Path
BASE=Path(__file__).resolve().parent
REPO=next(p for p in BASE.parents if (p/'Source/MultiFunPlayer').is_dir())
GEN=BASE/'.work/generated';GEN.mkdir(parents=True,exist_ok=True)
W=REPO/'Source/MultiFunPlayer'
PIN='36c08fbb99ac9398a63ff1cca1bbf68cd2228a94'
manifest={'sourceCommit':PIN,'kind':'pinned-original-source-and-extraction-manifest','sources':{},'extracts':[],'sourceHashNormalization':'CRLF-to-LF; preserve UTF-8 BOM and all other bytes'}
def read(path):
 p=W/path;b=p.read_bytes().replace(b'\r\n',b'\n');rel=p.relative_to(REPO).as_posix()
 expected=subprocess.check_output(['git','show',f'{PIN}:{rel}'],cwd=REPO).replace(b'\r\n',b'\n')
 if b!=expected: raise RuntimeError('Pinned source differs: '+rel)
 manifest['sources'][rel]=hashlib.sha256(b).hexdigest()
 return b.decode('utf-8-sig')
def span(src,marker,path,expression=False):
 start=src.index(marker)
 if expression:
  end=src.index(';',start)+1
 else:
  opening=src.index('{',start); depth=0; mode='code'; i=opening
  while i<len(src):
   ch=src[i];nx=src[i:i+2]
   if mode=='line':
    if ch=='\n': mode='code'
   elif mode=='block':
    if nx=='*/':mode='code';i+=1
   elif mode=='string':
    if ch=='\\':i+=1
    elif ch=='"':mode='code'
   elif mode=='char':
    if ch=='\\':i+=1
    elif ch=="'":mode='code'
   elif nx=='//':mode='line';i+=1
   elif nx=='/*':mode='block';i+=1
   elif ch=='"':mode='string'
   elif ch=="'":mode='char'
   elif ch=='{':depth+=1
   elif ch=='}':
    depth-=1
    if depth==0:break
   i+=1
  end=i+1
 text=src[start:end]
 manifest['extracts'].append({'source':path,'symbol':marker,'startLine':src[:start].count('\n')+1,'endLine':src[:end].count('\n')+1,'sha256':hashlib.sha256(text.encode()).hexdigest(),'transformation':'none; wrapped in test host namespace/class'})
 return text
path='UI/Controls/ViewModels/ScriptViewModel.cs';s=read(path)
classes=['internal sealed class AxisModel','internal sealed partial class AxisState','internal sealed class AxisValueTransition','internal sealed class AxisStateUpdateContext','internal sealed class AxisSettings','public enum SmartLimitMode','internal sealed class SyncSettings']
header='using MultiFunPlayer.Common;\nusing MultiFunPlayer.Script;\nusing MultiFunPlayer.MotionProvider.ViewModels;\nusing Stylet;\nusing PropertyChanged;\nusing Newtonsoft.Json;\nusing System.Windows;\nusing System.ComponentModel;\nusing System.Reflection;\nusing System.Runtime.CompilerServices;\nusing System.Text.RegularExpressions;\nnamespace MultiFunPlayer.UI.Controls.ViewModels;\n'
(GEN/'GeneratedState.cs').write_text(header+'\n\n'.join(span(s,x,path) for x in classes)+'\n')
methods=[span(s,'bool UpdateValues()',path),span(s,'private double GetAxisPosition(',path,True),span(s,'private double GetSyncProgress(',path,True),span(s,'private void ResetSyncNoLock(',path),span(s,'public void SetAxisTransition(',path)]
methods += [span(s,'public void Handle(MediaPositionChangedMessage message)',path),span(s,'public void Handle(MediaPlayingChangedMessage message)',path),span(s,'public void Handle(MediaSpeedChangedMessage message)',path),span(s,'private void SetMediaPositionInternal(',path),span(s,'private void ResetSync(bool isSyncing = true, params DeviceAxis[] axes)',path,True),span(s,'private void ResetSync(bool isSyncing = true, IEnumerable<DeviceAxis> axes = null)',path)]
(GEN/'GeneratedPipeline.cs').write_text(header+'internal sealed partial class ReferenceHost\n{\n'+'\n\n'.join(methods)+'\n}\n')
messages=read('Common/Messages.cs')
message_lines=[line for line in messages.splitlines() if any(('record '+name+'(') in line for name in ['MediaPositionChangedMessage','MediaPlayingChangedMessage','MediaSpeedChangedMessage'])]
(GEN/'GeneratedMessages.cs').write_text('namespace MultiFunPlayer.Common;\n'+'\n'.join(message_lines)+'\n')
e=read('Common/IDeviceAxisValueProvider.cs');start=e.index('internal record DeviceAxisValueEvent');(GEN/'GeneratedEvents.cs').write_text('namespace MultiFunPlayer.Common;\n'+e[start:])
x=read('Common/Extensions.cs');ext=span(x,'public static bool ValidateIndex<T>', 'Common/Extensions.cs',True)
(GEN/'GeneratedExtensions.cs').write_text('namespace MultiFunPlayer.Common;\npublic static class ReferenceExtensions {\n'+ext+'\n}\n')
for p in ['Common/Keyframe.cs','Common/KeyframeCollection.cs','Common/Utils/MathUtils.cs','Common/DeviceAxis.cs','Common/DeviceSettings.cs','Script/IScriptWriter.cs']:read(p)
rpath='OutputTarget/AbstractOutputTarget.cs';r=read(rpath)
ranges=[span(r,'static void SetMinimum(',rpath,True),span(r,'static void SetMaximum(',rpath,True)]+[span(r,'static void '+n+'(',rpath) for n in ['SetMiddle','OffsetMiddle','SetSize','OffsetSize','SetMiddleAndRange']]
(GEN/'GeneratedRange.cs').write_text('using MultiFunPlayer.Common;\nusing MultiFunPlayer.Input;\nnamespace MultiFunPlayer.OutputTarget;\ninternal static partial class RangeReference {\n'+'\n\n'.join(ranges)+'\n}\n')
read('OutputTarget/DeviceAxisSettings.cs')
for resourceSource in ['Script/IScriptResource.cs', 'Script/ChapterCollection.cs', 'Script/BookmarkCollection.cs', 'Script/Chapter.cs', 'Script/Bookmark.cs']:read(resourceSource)
providerHeader='using MultiFunPlayer.Common;\nusing System.Windows;\nnamespace ReferenceProviders;\n'
cpath='MotionProvider/ViewModels/CustomCurveMotionProvider.cs';c=read(cpath)
cmethods=[span(c,'public override void Update(',cpath),span(c,'private void ResetState(',cpath),span(c,'public void OnIsLoopingChanged(',cpath)]
(GEN/'GeneratedCurve.cs').write_text(providerHeader+'internal sealed partial class CurveReference {\n'+'\n\n'.join(cmethods)+'\n}\n')
lpath='MotionProvider/ViewModels/LoopingScriptMotionProvider.cs';l=read(lpath)
(GEN/'GeneratedLoop.cs').write_text(providerHeader+'internal sealed partial class LoopReference {\n'+span(l,'public override void Update(',lpath)+'\n}\n')
ppath='MotionProvider/ViewModels/PatternMotionProvider.cs';pp=read(ppath)
(GEN/'GeneratedPattern.cs').write_text(providerHeader+span(pp,'public enum PatternType',ppath)+'\ninternal sealed partial class PatternReference {\n'+span(pp,'public override void Update(',ppath)+'\n'+span(pp,'private double Calculate()',ppath)+'\n}\n')
manifest['shims']=['System.Windows.Point: X/Y only','Stylet base and notification/JSON attributes inert','single-thread observable collection replaced with List','BroadcastEvent.Set captured synchronously; no wait/cancellation/transport','logger inert','original script resource/metadata classes compile-linked; host supplies resources; Link manager propagation/file resolution not executed','deterministic Motion values injected via source manager-shaped stub; provider algorithms not in pipeline oracle','host subtracts expected source media advancement before calling unchanged UpdateValues to sample specified confirmed position','Motion provider Update/Calculate/Reset bodies source-extracted; parameter refresh/readonly script supplied by host; general WPF/Fody property notifications not executed','Clock mode executes exact source position/playing/speed handlers and UpdateValues; host starts NaN, supplies TimeSpan observations and fake media-loop clear; no AVPlayer, wallclock, stale, buffer, or output gate',
'Range helper source bodies extracted; gesture shim returns configured target; middleSetAction wrapper copies original line306 expression']
(BASE/'source-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Pinned source extraction OK:',len(manifest['sources']),'files,',len(manifest['extracts']),'spans')
