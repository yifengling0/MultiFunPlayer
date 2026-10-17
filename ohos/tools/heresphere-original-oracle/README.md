# Retained HereSphere in-memory oracle

Run from the repository root:

```sh
python3 ohos/tools/heresphere-original-oracle/run.py
node --experimental-strip-types --test ohos/tests/heresphere-core.test.mjs ohos/tests/heresphere-control-evidence.test.mjs
```

The runner pins source SHA-256 values and compiles the actual retained
`HereSphereMediaSource.ReadAsync`, `WriteAsync`, `PlayerState`, context record,
`TryToObject` and exact-read helper. Only method visibility and transport types
change. The harness uses memory streams, a silent logger, and channel-backed
commands. It inherits the existing DeoVR harness cases and adds HereSphere
resource precedence and path-scoped scene context assertions.

Expected oracle result: 187 assertions, 44 reader vectors, 17 writer vectors,
17 unchanged original resource-builder vectors, five context assertions, and
one four-zero-byte keepalive after the original one-second idle wait. Context
assertions are included in the total. Node tests consume the generated fixtures.

The official retained .NET 9.0.319 SDK is used without downloads or NuGet. Its
default location is the sibling `mfp-next-design/dotnet-sdk-9.0.319`; `DOTNET_ROOT`
may select an equivalent installation. Temporary build files are removed. No
socket, DNS, real player, physical output or Git operation is invoked.

## Port safety boundaries

The OHOS adapter shares bounded framing, strict UTF-8, JSON tree/prototype guards,
primitive/time/speed caps, and command checks with the existing DeoVR adapter.
It intentionally excludes Json.NET string/number/bool coercion, invalid-UTF-8
replacement, nonfinite numbers and unsafe/unbounded trees. Numeric or boolean
`resource` values therefore follow the strict unconvertible-resource fallback,
whereas the C# oracle converts them to strings and gives them precedence. Blank
string `resource` resets without fallback; null/object/array resource falls back.

`sceneUri` is transient inert context, attached only on a selected resource path
change. Identifier-only updates and same-path switches between resource/path do
not replace it. Reset clears it. The port retains the input URI spelling, accepts
explicit absolute URI syntax, and conservatively rejects controls, spaces,
malformed percent escapes, credentials, malformed authority and implicit .NET
file-path conversion. It does not promise .NET URI normalization. This metadata
is excluded from commands, packet provenance, persistence, logs and dereferencing.
No identifier can grant filesystem or network access.

These fixtures establish retained-source semantics and local adapter behavior.
They do not validate Windows WPF bindings, actual network/player interoperability,
OHOS device execution, app session ownership, or output hardware. Linux LF
command bytes are not a claim of Windows CRLF byte identity.
