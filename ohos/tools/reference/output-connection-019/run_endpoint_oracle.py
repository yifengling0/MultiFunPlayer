#!/usr/bin/env python3
"""Execute unchanged original endpoint registrations and parser with inert hosts.
Uses an existing official .NET 9 SDK and regex generator, no restore or network.
Does not execute output lifecycle, WPF/Fody, IO, SDK/HAP or hardware behavior.
"""
from pathlib import Path
import argparse
import hashlib
import json
import os
import subprocess
import tempfile

BASE = Path(__file__).resolve().parent
REPO = BASE.parents[3]


def sha(value):
    return hashlib.sha256(value).hexdigest()


def method(text, marker):
    start = text.index(marker)
    opening = text.index('{', start)
    depth = 0
    for end in range(opening, len(text)):
        if text[end] == '{':
            depth += 1
        elif text[end] == '}':
            depth -= 1
            if depth == 0:
                return text[start:end + 1]
    raise ValueError(marker)


def extract():
    paths = [f'Source/MultiFunPlayer/OutputTarget/ViewModels/{kind}OutputTarget.cs'
             for kind in ['Tcp', 'Udp', 'WebSocket']]
    paths += ['Source/MultiFunPlayer/Common/Utils/NetUtils.cs']
    sources = {path: (REPO / path).read_bytes() for path in paths}
    texts = [sources[path].decode('utf-8-sig') for path in paths]
    snippets = {}
    for key, text, prop in zip(['TCP', 'UDP', 'WS'], texts, ['public EndPoint Endpoint', 'public EndPoint Endpoint', 'public Uri Uri']):
        snippets[key + '_REGISTER'] = method(text, 'public override void RegisterActions(')
        start = text.index(prop)
        snippets[key + '_PROPERTY'] = text[start:text.index('\n', start)]
    snippets['PARSE'] = method(texts[3], 'public static EndPoint ParseEndpoint(')
    snippets['TRY_PARSE'] = method(texts[3], 'public static bool TryParseEndpoint(')
    start = texts[3].index('[GeneratedRegex(')
    end = texts[3].index('private static partial Regex EndpointRegex { get; }', start)
    snippets['REGEX'] = texts[3][start:end + len('private static partial Regex EndpointRegex { get; }')]
    host = (BASE / 'EndpointHost.cs.in').read_text()
    for key, value in snippets.items():
        host = host.replace('@@' + key + '@@', value)
    assert '@@' not in host
    return host, snippets, sources


def inputs():
    endpoint = [None, '', ' ', '127.0.0.1:8080', 'tcode.local:8000', 'DEVICE.example:9000',
                '[2001:db8::1]:9000', '2001:db8::1:9000', '[::1]:9000', '[127.0.0.1]:9000',
                '[device.example]:9000', 'host:0', 'host:65535', 'host:65536', 'host:2147483648',
                'host:9999999999999999999999999', 'host:-1', 'host:+1', 'host:1.5', 'host:1e3',
                'host:00080', 'host:Infinity', 'host:NaN', '127.1:9000', '42:9000', '127.01.0.1:9000',
                '999.0.0.1:9000', 'host.example.:9000', 'bad_host:9000', 'user@host:9000',
                'http://host:9000', 'host:9000?x=1', 'host:9000/path', 'host:9000\n',
                '[::1%zone]:9000', '[::ffff:127.0.0.1]:9000', 'InterNetwork/host:9000',
                'InterNetworkV6/host:9000', 'Unspecified/[2001:db8::1]:9000',
                'InterNetwork/bad_host:9000', 'InterNetwork/user@host:9000', 'InterNetwork/http://host:9000']
    uri = [None, '', ' ', 'ws://device.example/ws', 'wss://DEVICE.example/ws', 'WS://device.example',
           'ws://127.0.0.1:9000/ws', 'wss://[2001:db8::1]:443/ws', 'ws://[::1]/ws',
           'ws://host:00080/ws', 'ws://host:0/ws', 'ws://host:65535/ws', 'ws://host:65536/ws',
           'ws://host:2147483648/ws', 'ws://host:-1/ws', 'ws://host:+1/ws', 'ws://host:1.5/ws',
           'ws://host:/ws', 'http://host/ws', 'https://host/ws', 'ftp://host/ws', 'file:///tmp/test',
           'tcp://host:9000', 'ws://user:pass@host/ws', 'ws://user@host/ws', 'ws://host/ws?x=1',
           'ws://host/ws?token=example', 'ws://host/ws#fragment', 'ws://host/token/example',
           'ws://host/AUTH/example', 'ws://host/%74oken/example', 'ws://host/ws;token=example',
           'ws://host/a/../ws', 'ws://host/space here', 'ws://host\\ws', 'ws://host/ws\\path',
           'ws://[::1%zone]/ws', 'ws://[::ffff:127.0.0.1]/ws', 'ws://[host]/ws', 'ws://::1/ws']
    return [dict(kind=kind, text=text)
            for kind in ['tcp', 'udp', 'webSocket']
            for text in (uri if kind == 'webSocket' else endpoint)]


def run(root):
    root = Path(root)
    version = lambda p: tuple(int(v) for v in p.name.split('-')[0].split('.'))
    sdk = sorted((root / 'sdk').glob('9.*'), key=version)[-1]
    ref = sorted((root / 'packs/Microsoft.NETCore.App.Ref').glob('9.*'), key=version)[-1]
    host, snippets, sources = extract()
    env = {**os.environ, 'DOTNET_CLI_TELEMETRY_OPTOUT': '1', 'DOTNET_SKIP_FIRST_TIME_EXPERIENCE': '1',
           'DOTNET_GENERATE_ASPNET_CERTIFICATE': 'false', 'DOTNET_NOLOGO': '1'}
    with tempfile.TemporaryDirectory(prefix='mfp-output-endpoint-019-') as temp:
        work = Path(temp)
        env['DOTNET_CLI_HOME'] = str(work / 'home')
        (work / 'Host.cs').write_text(host)
        generator = ref / 'analyzers/dotnet/cs/System.Text.RegularExpressions.Generator.dll'
        args = ['/nologo', '/nostdlib+', '/langversion:13', '/nullable:disable', '/target:exe',
                '/out:' + str(work / 'Oracle.dll'), '/analyzer:' + str(generator)]
        args += ['/reference:' + str(path) for path in sorted((ref / 'ref/net9.0').glob('*.dll'))]
        args += [str(work / 'Host.cs')]
        (work / 'compile.rsp').write_text('\n'.join('"' + arg + '"' for arg in args))
        result = subprocess.run([str(root / 'dotnet'), str(sdk / 'Roslyn/bincore/csc.dll'),
                                 '/noconfig', '@' + str(work / 'compile.rsp')], env=env, text=True, capture_output=True)
        if result.returncode:
            raise RuntimeError(result.stdout + result.stderr)
        (work / 'Oracle.runtimeconfig.json').write_text(json.dumps({'runtimeOptions': {
            'tfm': 'net9.0', 'framework': {'name': 'Microsoft.NETCore.App', 'version': ref.name}}}))
        result = subprocess.run([str(root / 'dotnet'), str(work / 'Oracle.dll')], env=env,
                                input=json.dumps(inputs()), text=True, capture_output=True)
        if result.returncode:
            raise RuntimeError(result.stderr)
        result = json.loads(result.stdout)
    return {'provenance': {'executedOriginalCSharp': True, 'sdk': sdk.name, 'runtime': ref.name,
            'compiler': 'Official Roslyn csc.dll and System.Text.RegularExpressions.Generator.dll; no restore',
            'sourceSha256': {path: sha(data) for path, data in sources.items()},
            'extractedSpanSha256': {key: sha(value.encode()) for key, value in snippets.items()},
            'generatedHostSha256': sha(host.encode()), 'hostTemplateSha256': sha((BASE / 'EndpointHost.cs.in').read_bytes()),
            'runnerSha256': sha(Path(__file__).read_bytes()),
            'shims': ['Inert shortcut builder captures the original Action<string> delegates.',
                      'Target host contains original property initializer and full RegisterActions only; base registration is inert.',
                      'No connection state or lifecycle is simulated; the extracted callbacks have no status guard.',
                      'No DNS, network, transport, WPF, Fody, native SDK, HAP, physical output or device execution.']}, **result}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--sdk-root', default=os.environ.get('MFP_DOTNET_ROOT'))
    parser.add_argument('--output', default=str(BASE / 'endpoint-golden.json'))
    args = parser.parse_args()
    if not args.sdk_root:
        raise SystemExit('Provide an existing official .NET 9 SDK with --sdk-root or MFP_DOTNET_ROOT.')
    Path(args.output).write_text(json.dumps(run(args.sdk_root), separators=(',', ':')) + '\n')
