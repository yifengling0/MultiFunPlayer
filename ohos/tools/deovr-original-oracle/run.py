#!/usr/bin/env python3
"""Execute extracted retained DeoVR reader/writer with in-memory transport only.

No NuGet, DNS, sockets, physical output, app edits, or Git operations. Build files
stay under a fresh temporary directory. Source method bodies are retained; only
accessibility and transport parameter types change, as recorded in provenance.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SDK = Path(os.environ.get("DOTNET_ROOT", ROOT.parent / "mfp-next-design/dotnet-sdk-9.0.319"))
DOTNET = SDK / "dotnet"
NEWTONSOFT = SDK / "sdk/9.0.319/Newtonsoft.Json.dll"
PINNED = {
    "Source/MultiFunPlayer/MediaSource/ViewModels/DeoVRMediaSource.cs": "33620551b1c8cd5feab95b7fd1d39baa47cef517c078975664d3b846561328d5",
    "Source/MultiFunPlayer/Common/Extensions.cs": "8c275fe3b490b9b100e697abab88a9644d1f70cfa613d0c80ccd02752577ea02",
    "Source/MultiFunPlayer/Bootstrapper.cs": "5d4e3812b0d8101906c00d25cb7ff5a8319873eaa1e45b33d1632228b0ccc7db",
    "Source/MultiFunPlayer/MediaSource/MediaResource/MediaResourceInfo.cs": "443b2feac2b58e66eaa61dc54c3ef01606711b2348635b58fc82e84eab7c12bd",
    "Source/MultiFunPlayer/MediaSource/MediaResource/MediaResourceInfoBuilder.cs": "bea1a8ef4d25fddf96c554f40a64d2df77fced59029cc29cf7351b0450c464e4",
    "Source/MultiFunPlayer/MediaSource/MediaResource/Modifier/IMediaPathModifier.cs": "aeb36ff29841a09cadc25e195c629b650666f90607c510f790b154a9509c0c0c",
}
sources = {}
for name, expected in PINNED.items():
    content = (ROOT / name).read_bytes()
    actual = hashlib.sha256(content).hexdigest()
    assert actual == expected, f"Retained source drift: {name}: {actual}"
    sources[name] = content.decode("utf-8-sig").splitlines()

def lines(name, first, last):
    return "\n".join(sources[name][first - 1:last])

source = "Source/MultiFunPlayer/MediaSource/ViewModels/DeoVRMediaSource.cs"
reader_writer = lines(source, 94, 228)
reader_writer = reader_writer.replace("private async Task", "public async Task")
reader_writer = reader_writer.replace("TcpClient client, NetworkStream stream", "MemoryClient client, Stream stream")
player = lines(source, 264, 271)
ext = "Source/MultiFunPlayer/Common/Extensions.cs"
json_helpers = lines(ext, 28, 56)
stream_helper = lines(ext, 243, 248)
generated = """using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System.Text;
partial class OriginalDeoVR {
""" + reader_writer + "\n" + player + "\n}\nstatic class OriginalExtensions {\n" + json_helpers + "\n" + stream_helper + "\n}\n"

with tempfile.TemporaryDirectory(prefix="mfp-deovr-original-") as tmp:
    tmp = Path(tmp)
    (tmp / "GeneratedOriginal.cs").write_text(generated)
    shutil.copyfile(HERE / "Oracle.cs", tmp / "Oracle.cs")
    for name in ["MediaResourceInfo.cs", "MediaResourceInfoBuilder.cs", "Modifier/IMediaPathModifier.cs"]:
        path = ROOT / "Source/MultiFunPlayer/MediaSource/MediaResource" / name
        shutil.copyfile(path, tmp / path.name)
    (tmp / "GlobalUsings.cs").write_text("global using System; global using System.IO; global using System.Linq; global using System.Collections.Generic; global using System.Threading; global using System.Threading.Tasks;\n")
    refs = next((SDK / "packs/Microsoft.NETCore.App.Ref").glob("9.*/ref/net9.0"))
    (tmp / "out").mkdir()
    args = ["/nologo", "/nostdlib+", "/langversion:13", "/target:exe", "/nullable:disable", "/out:" + str(tmp / "out/Oracle.dll")]
    args += ["/reference:" + str(p) for p in refs.glob("*.dll")]
    args += ["/reference:" + str(NEWTONSOFT)] + [str(p) for p in tmp.glob("*.cs")]
    (tmp / "compile.rsp").write_text("\n".join('"' + arg + '"' for arg in args))
    (tmp / "out/Oracle.runtimeconfig.json").write_text(json.dumps({"runtimeOptions": {"tfm": "net9.0", "framework": {"name": "Microsoft.NETCore.App", "version": refs.parents[1].name}}}))
    shutil.copyfile(NEWTONSOFT, tmp / "out/Newtonsoft.Json.dll")
    env = dict(os.environ, DOTNET_ROOT=str(SDK), DOTNET_CLI_HOME=str(tmp / "home"), DOTNET_SKIP_FIRST_TIME_EXPERIENCE="1", DOTNET_CLI_TELEMETRY_OPTOUT="1")
    result = subprocess.run([str(DOTNET), str(SDK / "sdk/9.0.319/Roslyn/bincore/csc.dll"), "/noconfig", "@" + str(tmp / "compile.rsp")], env=env, text=True, capture_output=True)
    if result.returncode:
        raise SystemExit(result.stdout + result.stderr)
    result = subprocess.run([str(DOTNET), str(tmp / "out/Oracle.dll")], env=env, text=True, capture_output=True)
    if result.returncode:
        raise SystemExit(result.stdout + result.stderr)
    evidence = json.loads(result.stdout)
    evidence["sourceSha256"] = PINNED
    evidence["newtonsoftDllSha256"] = hashlib.sha256(NEWTONSOFT.read_bytes()).hexdigest()
    evidence["extraction"] = {
        "readerWriter": "DeoVRMediaSource.cs:94-228, private->public; TcpClient->MemoryClient; NetworkStream->Stream",
        "playerState": "DeoVRMediaSource.cs:264-271, unchanged",
        "jsonConversion": "Extensions.cs:28-56, unchanged",
        "exactRead": "Extensions.cs:243-248, unchanged",
        "resource": "MediaResourceInfoBuilder.cs, MediaResourceInfo.cs, IMediaPathModifier.cs compiled unchanged; paths use Linux System.IO semantics",
        "serializer": "Bootstrapper.cs:263-282 primitive-relevant indented formatting/error handler reproduced; nonprimitive converters and logging excluded",
        "limitations": "Linux .NET9/Json.NET13; no Windows WPF, actual socket lifecycle, source selection, repository execution or real player tested",
    }
    dest = HERE / "original-fixtures.json"
    dest.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n")
    print(f"PASS: {evidence['assertions']} assertions; {len(evidence['readCases'])} reader cases; {len(evidence['writeCases'])} writer cases; {len(evidence['resourceCases'])} resource cases; {dest}")
