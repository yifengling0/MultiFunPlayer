#!/usr/bin/env python3
"""Compile unchanged pinned MFP Drive/Offset/data and action spans; offline .NET 9.
No packages, downloads, WPF, native input, output endpoints or fabricated oracle math.
"""
from pathlib import Path
import argparse, hashlib, json, os, subprocess, tempfile
BASE = Path(__file__).resolve().parent
REPO = BASE.parents[3]
PIN = '36c08fbb99ac9398a63ff1cca1bbf68cd2228a94'
PREFIX = 'Source/MultiFunPlayer/'
WHOLE = ['Input/IInputGestureDescriptor.cs', 'Input/IInputGesture.cs', 'Input/IInputGestureData.cs',
         'Shortcut/AxisDriveShortcut.cs', 'Shortcut/AxisOffsetShortcut.cs',
         'OutputTarget/DeviceAxisSettings.cs', 'MotionProvider/AbstractMotionProvider.cs', 'MotionProvider/IMotionProvider.cs']
AUDITED = WHOLE + ['Shortcut/IShortcut.cs', 'Shortcut/IShortcutActionRunner.cs',
    'Common/Utils/MathUtils.cs', 'OutputTarget/AbstractOutputTarget.cs',
    'UI/Controls/ViewModels/ScriptViewModel.cs', 'MotionProvider/IMotionProviderManager.cs',
    'MotionProvider/Views/CustomCurveMotionProvider.xaml', 'MotionProvider/Views/PatternMotionProvider.xaml',
    'MotionProvider/Views/RandomMotionProvider.xaml', 'MotionProvider/Views/LoopingScriptMotionProvider.xaml',
    'MotionProvider/ViewModels/CustomCurveMotionProvider.cs', 'UI/Controls/Views/ScriptView.xaml',
    'Input/RawInput/RawInputProcessor.cs', 'UI/Controls/Views/ShortcutSettingsView.xaml',
    'OutputTarget/Views/TcpOutputTarget.xaml', 'OutputTarget/Views/UdpOutputTarget.xaml',
    'OutputTarget/Views/WebSocketOutputTarget.xaml']

def sha(data): return hashlib.sha256(data).hexdigest()
def blob(data): return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
def method(text, marker):
    start = text.index(marker); opening = text.find('{', start); arrow = text.find('=>', start)
    if arrow >= 0 and (opening < 0 or arrow < opening): return text[start:text.index(';', arrow)+1]
    depth = 0
    for end in range(opening, len(text)):
        if text[end] == '{': depth += 1
        elif text[end] == '}':
            depth -= 1
            if depth == 0: return text[start:end+1]
    raise ValueError(marker)
def registration(text, name):
    marker = 's.RegisterAction<IAxisInputGestureData, DeviceAxis>("' + name + '"'
    start = text.index(marker)
    # Both selected registrations terminate with their expression lambda's semicolon.
    return text[start:text.index(';', start)+1]
def extract():
    manifest = json.loads((BASE/'source-manifest.json').read_text())
    sources = {p: (REPO/p).read_bytes() for p in manifest['sources']}
    for p, data in sources.items():
        expected = manifest['sources'][p]
        if sha(data) != expected['sha256'] or blob(data) != expected['gitBlobSha1']:
            raise ValueError('Pinned source differs: ' + p)
    read = lambda p: sources[PREFIX+p].decode('utf-8-sig')
    math = read('Common/Utils/MathUtils.cs'); script = read('UI/Controls/ViewModels/ScriptViewModel.cs'); shortcut = read('Shortcut/IShortcut.cs')
    spans = {key: method(math, 'public static double '+name+'(') for key, name in
             [('CLAMP_01','Clamp01'),('CLAMP_SAFE','ClampSafe'),('LERP','Lerp'),('UNLERP','UnLerp'),('MAP','Map')]}
    spans.update({
        'OUTPUT_REGISTER': method(read('OutputTarget/AbstractOutputTarget.cs'), 'public virtual void RegisterActions('),
        'SCRIPT_UPDATE_SETTINGS': method(script, 'void UpdateSettings(DeviceAxis axis, Action<AxisSettings> callback)'),
        'AXIS_VALUE_DRIVE': registration(script, 'Axis::Value::Drive'),
        'AXIS_BLEND_DRIVE': registration(script, 'Axis::MotionProviderBlend::Drive'),
        'SET_AXIS_TRANSITION': method(script, 'public void SetAxisTransition('),
        'AXIS_VALUE_TRANSITION': method(script, 'internal sealed class AxisValueTransition'),
        'INVOKE': method(shortcut, 'protected void Invoke('),
        'ON_INVOKED': method(shortcut, 'private void OnInvoked()'),
    })
    host = (BASE/'Host.cs.in').read_text()
    for key, value in spans.items(): host = host.replace('@@'+key+'@@', value)
    if '@@' in host: raise ValueError('Unfilled source placeholder')
    return host, spans, sources

def inputs():
    values = [0, .25, .49999999999999994, .5, .5000000000000001, .75, 1]
    deltas = [-1, -.01, 0, .01, 1]
    result = []
    for mode in ['Absolute','Relative','RelativePositiveOnly','RelativeNegativeOnly','RelativeJoystick']:
        for invert in [False,True]:
            for value in values:
                for delta in deltas:
                    for duration in [0,.025]:
                        result.append(dict(kind='drive',mode=mode,invert=invert,value=value,delta=delta,duration=duration))
    for mode in ['Absolute','AbsoluteJoystick']:
        for invert in [False,True]:
            for speed in [0,.001,.1,.5,1]:
                for value in values:
                    result.append(dict(kind='offset',mode=mode,invert=invert,speed=speed,value=value,delta=.01,duration=0))
    for absolute in [False,True]:
        for value in (values if absolute else [-2,-.5,0,.1,2]):
            for current in [0,.2,.5,1]:
                for modifier in [-1,0,.1,1,2]:
                    result.append(dict(kind='apply',absolute=absolute,value=value,current=current,modifier=modifier,duration=.1))
    for action in ['Axis::Value::Drive','Axis::MotionProviderBlend::Drive',
                   'MotionProvider::Oracle::Speed::Drive','MotionProvider::Oracle::Minimum::Drive','MotionProvider::Oracle::Maximum::Drive']:
        for absolute in [False,True]:
            for value in ([0,.125,.5,1] if absolute else [-2,-.1,0,.1,2]):
                for current in [0,.005,.2,.8,1,1.5]:
                    for duration in ([0,.1] if action=='Axis::Value::Drive' else [0]):
                        result.append(dict(kind='action',action=action,absolute=absolute,value=value,current=current,duration=duration))
    ranges = [(0,1),(.2,.8),(.2,.7),(.8,.2),(1,0),(0,0),(1,1),(.5,.5),(.4,.41)]
    limits = [(0,1),(.2,.8),(.5,.5),(.8,.2),(0,0),(1,1)]
    for field in ['Minimum','Maximum','Middle','Size']:
        for absolute in [False,True]:
            for value in ([0,.125,.5,1] if absolute else [-1,-.005,0,.005,1]):
                for minimum,maximum in ranges:
                    for lo,hi in limits:
                        if field=='Minimum': hi=1
                        if field=='Maximum': lo=0
                        item=dict(kind='action',action='TCP/0::Axis::Range::'+field+'::Drive',absolute=absolute,value=value,
                                  minimum=minimum,maximum=maximum,minimumLimit=lo,maximumLimit=hi,duration=.1)
                        if item not in result: result.append(item)
    # Original Set contrasts are run through the same full original registration method.
    for field in ['Middle','Size']:
        for value in [0,.125,.5,1]:
            result.append(dict(kind='contrast',action='TCP/0::Axis::Range::'+field+'::Set',value=value,minimum=.2,maximum=.7))
    return result

def run(root):
    root=Path(root); exe=root/'dotnet'; sdk=root/'sdk/9.0.319'; ref=root/'packs/Microsoft.NETCore.App.Ref/9.0.21'
    if not exe.is_file() or not sdk.is_dir() or not ref.is_dir():
        raise SystemExit('Existing official .NET SDK 9.0.319 / reference 9.0.21 required. No installation attempted.')
    host, spans, sources = extract(); cases=inputs()
    env={**os.environ,'DOTNET_CLI_TELEMETRY_OPTOUT':'1','DOTNET_SKIP_FIRST_TIME_EXPERIENCE':'1','DOTNET_GENERATE_ASPNET_CERTIFICATE':'false','DOTNET_NOLOGO':'1'}
    with tempfile.TemporaryDirectory(prefix='mfp-continuous-drive-028-') as tmp:
        work=Path(tmp);env['DOTNET_CLI_HOME']=str(work/'home');(work/'Host.cs').write_text(host)
        for path in WHOLE: (work/Path(path).name).write_bytes(sources[PREFIX+path])
        args=['/nologo','/nostdlib+','/langversion:13','/nullable:disable','/target:exe','/out:'+str(work/'Oracle.dll')]
        args+=['/reference:'+str(p) for p in sorted((ref/'ref/net9.0').glob('*.dll'))]
        args+=[str(work/'Host.cs')]+[str(work/Path(p).name) for p in WHOLE]
        (work/'compile.rsp').write_text('\n'.join('"'+a+'"' for a in args))
        compiled=subprocess.run([str(exe),str(sdk/'Roslyn/bincore/csc.dll'),'/noconfig','@'+str(work/'compile.rsp')],env=env,text=True,capture_output=True)
        if compiled.returncode: raise RuntimeError(compiled.stdout+compiled.stderr)
        (work/'Oracle.runtimeconfig.json').write_text(json.dumps({'runtimeOptions':{'tfm':'net9.0','framework':{'name':'Microsoft.NETCore.App','version':ref.name}}}))
        output=subprocess.run([str(exe),str(work/'Oracle.dll')],env=env,input=json.dumps(cases),text=True,capture_output=True)
        if output.returncode: raise RuntimeError(output.stderr)
        result=json.loads(output.stdout, parse_int=lambda value: -0.0 if value == "-0" else int(value))
    return {'provenance':{'executedOriginalCSharp':True,'sourcePin':PIN,'sdk':sdk.name,'runtime':ref.name,
        'compiler':'official Roslyn csc.dll; no restore',
        'sourceSha256':{p:sha(b) for p,b in sources.items()},
        'wholeCompiledFiles':[PREFIX+p for p in WHOLE],
        'extractedSpanSha256':{p:sha(s.encode()) for p,s in spans.items()},
        'hostTemplateSha256':sha((BASE/'Host.cs.in').read_bytes()),'generatedHostSha256':sha(host.encode()),
        'runnerSha256':sha(Path(__file__).read_bytes()),'manifestSha256':sha((BASE/'source-manifest.json').read_bytes()),
        'shims':[
            'Original Drive, Offset, input DTO/interface, AbstractMotionProvider and DeviceAxisSettings files compile unchanged.',
            'Base shortcut uses exact Invoke/OnInvoked methods with a capture runner; repeat stores its callback and period and is manually ticked. No OS timer timing is simulated or claimed.',
            'Original complete output RegisterActions and motion base RegisterActions capture real delegates; argument builders are inert.',
            'Script host executes exact two Drive registrations, UpdateSettings, SetAxisTransition and full AxisValueTransition; axis locks are structural no-ops.',
            'DeviceAxis supplies two stable named identities. Null or unknown input identities are not exercised as valid actions.',
            'JSON/Fody attributes, Stylet notifications and property registration are inert. No WPF/Fody/dispatcher, native event delivery, physical output or canvas attachment execution.'
        ]},**result}
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--sdk-root',default=os.environ.get('MFP_DOTNET_ROOT'));p.add_argument('--output',default=str(BASE/'golden.json'));a=p.parse_args()
    if not a.sdk_root: raise SystemExit('Set MFP_DOTNET_ROOT to an existing official .NET 9 SDK.')
    Path(a.output).write_text(json.dumps(run(a.sdk_root),separators=(',',':'))+'\n')
