# MultiFunPlayer original C# reference oracle

This development-only harness executes the pinned upstream C# numerical code under .NET 9. It neither builds/runs the WPF application nor connects a player, device, server, or output target. It is not shipped in the HarmonyOS application.

## Reproduce

Requirements: Git with source commit `36c08fbb99ac9398a63ff1cca1bbf68cd2228a94` available, Python 3.9+, and an existing official .NET 9 SDK (C# 13). From the repository root:

```sh
# Point to your own SDK directory, or leave unset if dotnet is already on PATH.
export MFP_DOTNET_ROOT=/path/to/official/dotnet-sdk
python3 ohos/tools/reference/compile.py
python3 ohos/tools/reference/run.py smoke
python3 ohos/tools/reference/generate_goldens.py
```

The script never downloads or installs software. Output goes to ignored `ohos/tools/reference/.work/results/`. An optional output directory is the first argument to `generate_goldens.py`, `generate_pipeline_cases.py`, or `generate_clock_cases.py`. The latter two regenerate only those families. The full generator takes roughly a minute on the validation host.

`compile.py` verifies source bytes, extracts original bodies, then invokes the SDK's official `Roslyn/bincore/csc.dll` against its bundled net9.0 reference pack. It performs no NuGet restore. Direct Roslyn compilation was used because this sandbox's `dotnet build`/NuGet named-mutex setup attempted a read-only filesystem directory; this avoids that unrelated build-service path, not an access control. `Reference.csproj` is also provided for ordinary SDK environments, after running `extract.py`.

All invocations set `DOTNET_CLI_TELEMETRY_OPTOUT=1`, `DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1`, `DOTNET_GENERATE_ASPNET_CERTIFICATE=false`, and a local ignored `DOTNET_CLI_HOME`. No network service, credentials, developer certificates, SDK archives, build binaries, or execution logs belong in Git.

### Validation SDK provenance

Validated on official SDK **9.0.319**, runtime **9.0.21 linux-x64**; the generated provenance records the actual runtime/architecture/culture, not just this text. Reproducing with a different runtime is useful but must retain that difference, particularly for floating-point-to-Int32 conversion or formatting behavior.

- Vendor release metadata: <https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/9.0/releases.json>
- Verified SDK tarball: <https://builds.dotnet.microsoft.com/dotnet/Sdk/9.0.319/dotnet-sdk-9.0.319-linux-x64.tar.gz>
- Bytes: `218314841`
- SHA-512: `ed080b81dd2cca56a453c939468b0061a60a083a87eaf21e035794cd28a14fc00faf52d96a4e4116f3cc1de40e6289cd0f08a8fd478d49e4dc4f28570e2f602c`

This is a provenance record, not an automatic installation mechanism.

## What really executes

`source-manifest.json` pins 20 original files and records hashes/33 extracted spans. Hashing normalizes CRLF to LF while preserving a UTF-8 BOM and every other byte. Thus Windows checkout newline conversion alone does not invalidate evidence. The extractor compares the working file with `git show <pinned commit>:<path>` using the same normalization and rejects any other difference. Source files under `Source/` are never rewritten. Generated wrappers are ignored in `.work/generated`.

| Family | Original execution | Host boundary |
|---|---|---|
| Keyframes / interpolation / gap / noise | Compile-link `Keyframe`, `KeyframeCollection`, all `MathUtils.cs` including OpenSimplex | Simple WPF Point type only; no copied numerical formulas |
| Axis pipeline | Exact entire `UpdateValues` body, original state/settings/transition classes and helpers extracted from ScriptViewModel | Single-thread synchronous host; deterministic injected Motion cache; selected script keyframes supplied directly |
| Media clock | Original position/playing/speed handlers, ResetSync and SetMediaPositionInternal, plus same UpdateValues | TimeSpan observations supplied by host; fake nullable loop segment/clear; no native player or safety gate |
| Pattern / Custom Curve / Looping Script | Original Update/Calculate/Reset bodies | Config defaults, resource loading result and refresh flags supplied by host; no WPF/Fody property-change execution |
| TCode and writer | Compile-link `DeviceAxis.cs`, `DeviceSettings.cs`, original `FunscriptWriter` | One fresh process per precision, no actual output transport |
| Output ranges | Original SetMinimum/Maximum/Middle/Size/offset/SetMiddleAndRange helper bodies | Gesture shim returns specified value; separate `middleSetAction` copies the original line306 action argument verbatim |
| Int32 casts | Actual .NET runtime `(int)double` probe | Explicitly a newly authored runtime probe, not an extracted application method |

`Shims.cs` supplies inert logging, attributes/property notifications, list-backed observable collection, synchronous event capture, and minimal Point/Rect types. Extracted AxisState locking code executes, but this does not test concurrent WPF scheduling. Source Link manager propagation, file readers, media loop seeking scheduler, settings migration, native sockets, and property notification graph are not exercised here.

The sampled-position **pipeline** host subtracts the expected in-body playing advance before `UpdateValues` so its requested position is the value sampled by the pipeline. This adapter is not the source clock. The separate **clock** command starts both positions NaN and calls the original handlers/UpdateValues without that subtraction. Do not confuse their evidence.

Reflection-applied settings do not trigger WPF/Fody notifications. Input cases explicitly request `resetSync` where required. Motion provider output sync counts cover explicit Update calls, not generic property-change notifications. See [command side effects](COMMAND_SIDE_EFFECTS.zh-CN.md) and [clock integration contract](MEDIA_CLOCK_CONTRACT.zh-CN.md).

## Generated families and consumers

- `pipeline-valid-golden.json`: 25 scenarios / 306 frames, valid Sync duration with disabled flags where appropriate. This is the source for `ohos/tests/fixtures/axis-pipeline-valid-golden.json`.
- `pipeline-golden.json`: same 25 scenarios with some raw source Duration=0 algorithm probes. Do not claim those invalid UI settings are supported by the public configuration API.
- `resource-identity.json`: original record/interface types prove SetScript's `IScriptResource == IScriptResource` is reference equality, despite record value equality. A fresh LinkedScriptResource wrapper is not the same reference. This probe does not run the Link manager.
- `clock-golden.json`: 11 scenarios / 81 frames; NaN before anchor, sparse observations, smoothing, exact 1-second boundary, force seek, pause, speed and loop-clear semantics.
- `provider-golden.json`: 35 scenarios / 1015 frames, four interpolations, two-point Makima tiling, duplicate endpoints, non-loop finish, loop-toggle/no-refresh, unsorted/duplicate points and reversed ranges.
- `noise-golden.json`: 252 values across signed 64-bit seeds (including seed+31 overflow), negative/lattice coordinates and octaves.
- `noise-extreme-golden.json`: ten extreme-coordinate cases, including eight original IndexOutOfRangeException observations; `int32-casts.json` records runtime conversion behavior separately.
- `tcode-1.json` through `tcode-10.json`: original precision/range/interval/nonfinite behavior. `tcode-near-3/4.json`: 694/775 rows around binary adjacent midpoint values.
- `range-golden.json`: 224 original helper/action probes; middle Set action is distinct from gesture SetMiddle and preserves the suspicious original expression rather than silently correcting it.
- `writer-rounding.json`: actual original writer's contents and supplied seconds. Temporary filenames are omitted from the JSON so values are reproducible.
- `zero-delta-speed-source-defect.json`: expected actual ArithmeticException, not a fabricated successful frame. A later zero-delta stationary step with SpeedLimit enabled reaches Math.Sign(NaN), even at unlimited max. A production caller must fail closed and recover runtime state.

Only a successful executable run receives `executedCSharp: true` provenance. The manifest itself proves source/extraction identity, not execution. Consumers may store reviewed fixtures, but should preserve their provenance and compare source hashes using the declared newline normalization. The full generator does not overwrite test fixtures automatically.

C# uses NaN internally; JSON represents named nonfinite numbers as strings. Preserve that distinction from missing fields and null. Production configuration permits positive Infinity only for unlimited speed-limit rate with its explicit codec, not a blanket acceptance of nonfinite settings.

## Important measured boundaries

- TCode custom all-zero formatting is not equivalent to JavaScript Math.round at adjacent binary midpoints. Decimal formatting can round a value one ULP below a nominal half upward.
- Funscript timestamp `Math.Round(seconds*1000)` uses ties-to-even; original position remains floating point.
- TCode interval is `floor(milliseconds + .75)`. Output scheduler elapsed time is distinct from axis deltaSeconds.
- On the tested .NET9 host, precision10 `_outputMaximum` saturates Int32.MaxValue, and its subsequent Int32 `+1` overflows; this is evidence of original boundary behavior, not proof that precision10 is safe for devices.
- Extreme OpenSimplex coordinates can throw in original code. Production must diagnose/fail closed rather than silently inventing an output.
- These tests verify source numerical behavior on the stated runtime. They do not establish physical device safety, native UI behavior, complete feature parity, or original WPF cross-thread semantics.
