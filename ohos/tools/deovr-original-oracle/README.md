# Retained DeoVR in-memory oracle

Run from the repository root:

```sh
python3 ohos/tools/deovr-original-oracle/run.py
```

This compiles exact source-extracted `ReadAsync`, `WriteAsync`, `PlayerState`,
`TryToObject` and `ReadExactlyAsync` logic, plus unchanged original resource-builder
files. Only accessibility and transport types are adapted. All packets and writes
stay in memory. No TCP socket, DNS lookup, player, physical output, Git operation,
File recording or NuGet restore is used.

The official retained .NET 9 SDK defaults to the sibling
`mfp-next-design/dotnet-sdk-9.0.319`; `DOTNET_ROOT` can select the same SDK layout.
Roslyn compiles directly with bundled reference assemblies and Newtonsoft.Json
13.0.3. Temporary build files are removed on completion. The only retained output
is `original-fixtures.json`, including inputs, exact commands/events and provenance.

Expected result: 162 assertions, 34 reader cases, 17 writer cases, 17 resource
observations and a four-zero-byte keepalive after the original one-second idle wait.
See [the source audit](../../DEOVR_018_SOURCE_AUDIT.md) for field semantics,
intentional safety differences and static WPF/source-owner/repository findings.

Limitations: Linux resource filename rules do not prove original Windows drive,
UNC or backslash behavior; Linux LF command bytes do not prove Windows CRLF.
No actual WPF bindings, socket lifecycle, repository search or OHOS code executes
in this oracle. It establishes a reference, not production end-to-end verification.
