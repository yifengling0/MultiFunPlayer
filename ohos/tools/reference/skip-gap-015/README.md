# Actual C# Script::SkipGap oracle (0.15)

This isolated harness executes the unchanged original `ScriptViewModel.SkipGap` overloads, `GetAxisPosition`, `SeekMediaToTime`, index constants/InsideScript expression and generic `ValidateIndex`. It compiles the entire unchanged original Keyframe, KeyframeCollection and MathUtils files, so SkipGap/IsGapInternal/search/advance behavior comes from original C#, not a TypeScript or Python transcription.

Only structural dependencies are shimmed: axis dictionary identities, explicit starting states, offsets, a message collector, and System.Windows.Point. Optional index preparation uses the original SearchForIndexBefore/AdvanceIndex/GetAxisPosition methods, and is not a substitute for running the entire UpdateScript lifecycle. Locked/bypassed flags are annotations demonstrating no such filter exists inside SkipGap; setters/controls are not run. Linked-like test axes share equal source keyframes but the host does not claim to execute actual linked-resource creation. No source connection, physical output, WPF, Fody, or dispatcher is run.

## Reproduce offline

Set `MFP_DOTNET_ROOT` (or `DOTNET_ROOT`) to an already-installed official .NET 9 SDK. No install, download, package restore, or network call is performed.

From the repository root:

```sh
python3 ohos/tools/reference/skip-gap-015/run.py --output /tmp/skip-gap-015-reproduced.json
node --test ohos/tests/skip-gap-source-oracle.test.mjs
```

To intentionally regenerate the checked-in source fixture after reviewing source changes:

```sh
python3 ohos/tools/reference/skip-gap-015/run.py --output ohos/tools/reference/skip-gap-015/golden.json
```

`inputs.json` has 36 named edges and 80 deterministic sweep inputs. `golden.json` holds 116 actual C# results and source/span/host/runner/input hashes, SDK and runtime versions, and shim limitations. The Node test checks fixture provenance, 29 independently hand-checked contract anchors, offset-index preparation, the direct-call exception, and optionally recompiles/re-executes all 116 cases. No .NET means the live-execution test explicitly skips, not a full C# pass.

Results are published seek messages after the original finite-target/duration guard, clamping and TimeSpan conversion; they are not a media source's seek acknowledgements. Named coverage includes ignored supplied axis, null/empty axis enumeration, earliest stale/too-near candidate blocking later candidates, current indices, raw seconds despite offsets, strict minimum/epsilon edges, locked/bypassed bindings, empty/singleton collections, and NaN inputs.

Important portable difference: original NaN current MediaPosition can pass comparison checks and publish a finite seek when duration is finite. OHOS may deliberately reject a nonfinite current clock. Negative/NaN thresholds and negative duration in this fixture exercise original direct typed calls, not valid portable action payloads. A correct implementation comparison must classify those as explicit input-safety restrictions rather than silently rewriting the expected C# result.
