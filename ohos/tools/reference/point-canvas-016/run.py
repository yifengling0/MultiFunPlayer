#!/usr/bin/env python3
"""Execute unchanged MFP canvas methods and collection on an EXISTING .NET SDK.
Offline, no restore/download/WPF/Fody; bounded structural shims are enumerated.
"""
from pathlib import Path
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import tempfile

BASE = Path(__file__).resolve().parent
REPO = next(p for p in BASE.parents if (p / 'Source/MultiFunPlayer').is_dir())
SRC = REPO / 'Source/MultiFunPlayer'
PIN = '36c08fbb99ac9398a63ff1cca1bbf68cd2228a94'
METHODS = {
    'POINTS_PROPERTY_CHANGED': 'private static void OnPointsPropertyChanged(',
    'POINTS_COLLECTION_CHANGED': 'private void OnPointsCollectionChanged(',
    'SIZE_CHANGED': 'private void OnSizeChanged(',
    'REMOVE_ELEMENT': 'private void RemoveElement(',
    'ADD_ELEMENT': 'private void AddElement(',
    'UPDATE_VIEWPORT': 'private void UpdateViewport(',
    'ELEMENTS_FROM_POINTS': 'private void SynchronizeElementsFromPoints(',
    'POINTS_FROM_ELEMENTS': 'private void SynchronizePointsFromElements(',
}
EXPRESSIONS = {
    'FROM_CANVAS': 'public Point FromCanvas(',
    'FROM_CANVAS_X': 'public double FromCanvasX(',
    'FROM_CANVAS_Y': 'public double FromCanvasY(',
    'TO_CANVAS': 'public Point ToCanvas(',
    'TO_CANVAS_X': 'public double ToCanvasX(',
    'TO_CANVAS_Y': 'public double ToCanvasY(',
}
SOURCE_PATHS = [
    'UI/Controls/DraggablePointCanvas.xaml.cs',
    'Common/ObservableConcurrentCollection.cs',
    'UI/Controls/DraggablePointCanvas.xaml',
    'MotionProvider/ViewModels/CustomCurveMotionProvider.cs',
    'MotionProvider/Views/CustomCurveMotionProvider.xaml',
    'UI/Controls/SmartLimitPreview.xaml',
    'UI/Controls/SmartLimitPreview.xaml.cs',
    'UI/Dialogs/Views/ShortcutActionConfigurationDialog.xaml',
    'UI/Controls/ViewModels/ScriptViewModel.cs',
    'UI/Controls/Views/ScriptView.xaml',
    'UI/Controls/NonReloadingTabControl.cs',
]


def sha(value):
    return hashlib.sha256(value).hexdigest()


def method(text, marker):
    start = text.index(marker)
    depth = 0
    for end in range(text.index('{', start), len(text)):
        if text[end] == '{':
            depth += 1
        elif text[end] == '}':
            depth -= 1
            if depth == 0:
                return text[start:end + 1]
    raise RuntimeError('Unclosed original method: ' + marker)


def extract():
    canvas = (SRC / SOURCE_PATHS[0]).read_text(encoding='utf-8-sig').replace('\r\n', '\n')
    spans = {name: method(canvas, marker) for name, marker in METHODS.items()}
    for name, marker in EXPRESSIONS.items():
        start = canvas.index(marker)
        spans[name] = canvas[start:canvas.index(';', start) + 1]
    host = (BASE / 'Host.cs.in').read_text()
    for name, span in spans.items():
        host = host.replace('@@' + name + '@@', span)
    # The introductory comment mentions placeholders generically, but no token may remain.
    if any('@@' + name + '@@' in host for name in spans):
        raise RuntimeError('An extracted span was not inserted')
    return host, spans


def run(inputs, sdk_root=None):
    root = sdk_root or os.environ.get('MFP_DOTNET_ROOT') or os.environ.get('DOTNET_ROOT')
    exe = Path(root) / 'dotnet' if root else Path(shutil.which('dotnet') or '/unavailable-dotnet')
    if not exe.is_file():
        raise SystemExit('Set MFP_DOTNET_ROOT to the existing official .NET 9.0.319 SDK. No download attempted.')
    exe = exe.resolve()
    root = exe.parent
    sdk = root / 'sdk/9.0.319'
    if not sdk.is_dir():
        raise SystemExit('The pinned installed .NET SDK 9.0.319 is required; no install attempted.')
    version = lambda p: tuple(int(v) for v in p.name.split('-')[0].split('.'))
    ref = sorted((root / 'packs/Microsoft.NETCore.App.Ref').glob('9.*'), key=version)[-1]
    host, spans = extract()
    env = {**os.environ, 'DOTNET_CLI_TELEMETRY_OPTOUT': '1', 'DOTNET_SKIP_FIRST_TIME_EXPERIENCE': '1',
           'DOTNET_GENERATE_ASPNET_CERTIFICATE': 'false', 'DOTNET_NOLOGO': '1'}
    with tempfile.TemporaryDirectory(prefix='mfp-point-canvas-016-') as temp:
        work = Path(temp)
        env['DOTNET_CLI_HOME'] = str(work / 'home')
        (work / 'Host.cs').write_text(host)
        args = ['/nologo', '/nostdlib+', '/langversion:13', '/nullable:disable', '/target:exe', '/checked-',
                '/out:' + str(work / 'Oracle.dll')]
        args += ['/reference:' + str(p) for p in sorted((ref / 'ref/net9.0').glob('*.dll'))]
        args += [str(work / 'Host.cs'), str(SRC / 'Common/ObservableConcurrentCollection.cs')]
        (work / 'compile.rsp').write_text('\n'.join('"' + a + '"' for a in args) + '\n')
        compiled = subprocess.run([str(exe), str(sdk / 'Roslyn/bincore/csc.dll'), '/noconfig', '@' + str(work / 'compile.rsp')],
                                  env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=60)
        if compiled.returncode:
            raise SystemExit(compiled.stdout)
        (work / 'Oracle.runtimeconfig.json').write_text(json.dumps({'runtimeOptions': {'tfm': 'net9.0',
            'framework': {'name': 'Microsoft.NETCore.App', 'version': ref.name}}}))
        executed = subprocess.run([str(exe), str(work / 'Oracle.dll')], env=env, input=json.dumps(inputs),
                                  text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60)
        if executed.returncode:
            raise SystemExit(executed.stderr)
        # System.Text.Json emits negative zero as -0. Preserve its sign when
        # Python re-serializes the fixture instead of converting it to int(0).
        results = json.loads(executed.stdout, parse_int=lambda token: -0.0 if token == '-0' else int(token))
    provenance = {
        'executedCSharp': True, 'executedWpf': False, 'sourceCommit': PIN, 'sdk': sdk.name, 'runtime': ref.name,
        'compiler': 'official Roslyn csc.dll; no restore',
        'sourceHashNormalization': 'CRLF-to-LF; preserve UTF-8 BOM and all other bytes',
        'sourceSha256': {str((SRC / path).relative_to(REPO)): sha((SRC / path).read_text(encoding='utf-8').replace('\r\n', '\n').encode())
                         for path in SOURCE_PATHS},
        'extractedSpanSha256': {name: sha(span.encode()) for name, span in spans.items()},
        'generatedHostSha256': sha(host.encode()),
        'hostTemplateSha256': sha((BASE / 'Host.cs.in').read_bytes()),
        'runnerSha256': sha(Path(__file__).read_bytes()),
        'inputsSha256': sha((BASE / 'inputs.json').read_bytes()),
        'shims': [
            'System.Windows.Point is a double-field struct; UIElement/DraggablePoint and dependency-event arguments are structural.',
            'PointElements is List<UIElement>; event subscription storage exists but there is no native visual tree or input.',
            'Rect.Contains is a closed-edge containment shim restricted to finite positive ZERO-ORIGIN viewports, matching both audited bindings; this is not WPF Rect execution.',
            'RefreshLine/RefreshScrubber and pointer enter/leave handlers are no-ops: no interpolation, preview, visibility or provider effects are claimed.',
            'BindingOperations.EnableCollectionSynchronization is a no-op; full unchanged ObservableConcurrentCollection runs using .NET Lock and an explicit inline SynchronizationContext.Send.',
            'A test schedule explicitly supplies attachment/size/viewport and delivers events; no dependency property engine, WPF layout/dispatcher, popup lifetime or Fody executes.',
        ],
        'limitations': [
            'Exactly the supplied single-canvas event schedule and unchanged method/collection arithmetic, not Windows/WPF behavior.',
            'No proof of initial Points-versus-Viewport binding order, same-value DP callback delivery, inter-control reentrancy or thread races.',
            'Portable model rejects invalid/nonfinite/overflow, nonpositive viewport, negative actual size and more than 4096 points before callers can commit.',
            'No changes to provider, settings, action coverage, UI ownership, output, network endpoints or hardware.',
        ],
    }
    return {'schemaVersion': 1, 'provenance': provenance,
            'cases': [{'name': item['name'], 'note': item.get('note', ''), 'input': item, 'expected': result}
                      for item, result in zip(inputs, results)]}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--sdk-root')
    parser.add_argument('--output')
    args = parser.parse_args()
    result = run(json.loads((BASE / 'inputs.json').read_text()), args.sdk_root)
    text = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
    if args.output:
        Path(args.output).write_text(text)
    else:
        print(text, end='')
