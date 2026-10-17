# Point-canvas 0.16 executable source oracle

This isolated offline oracle executes fourteen unchanged spans from the original
`DraggablePointCanvas.xaml.cs`, plus the whole unchanged
`ObservableConcurrentCollection.cs`. It uses an existing official .NET SDK
9.0.319 / runtime 9.0.21 and Roslyn directly; no project restore, NuGet or download
is involved.

It proves numeric/collection behavior for explicitly supplied **single-canvas**
event schedules. It does **not** run WPF, bindings, the dispatcher, Fody, actual
layout/visibility, provider callbacks or hardware. Every environmental shim and
source hash is enumerated in `golden.json` provenance. In particular,
`Rect.Contains` is a finite positive zero-origin closed-edge shim, not the WPF
implementation. Both audited source bindings use zero-origin viewports.

## Reproduce

From the repository root, with the already installed SDK path:

```sh
export MFP_DOTNET_ROOT=/path/to/existing/dotnet-sdk-9.0.319
python3 ohos/tools/reference/point-canvas-016/generate_inputs.py
python3 ohos/tools/reference/point-canvas-016/run.py \
  --output ohos/tools/reference/point-canvas-016/golden.json
node --test ohos/tests/point-canvas-effects*.test.mjs
```

Input generation creates schedules only, never expected values. `run.py`
extracts source bodies without rewriting them, compiles into a disposable local
temporary directory, executes C# and records the output. Negative zero emitted
by System.Text.Json is preserved through Python fixture serialization.

The 129 schedules include 33 named contracts and 96 deterministic sweeps, for
337 delivered events. They cover detached/zero-size/measured controls, initial
Points binding and Resize, viewport prune before the size guard, closed-edge
containment, order and duplicates, pixel-X collisions, negative zero and
fractional roundtrip, empty/single/equal Reset, clearing existing elements,
detach/reattach, and alternative Duration/SetFrom delivery schedules. The pure
model tests additionally enforce 4096/4097, dense/finite validation, derived
overflow rejection, cloned output and no input mutation.

`point-canvas-effects-source-oracle.test.mjs` verifies full-file/span/host/runner/
input hashes, hand-checked contract anchors and freshly re-executes C# when
`MFP_DOTNET_ROOT` (or `DOTNET_ROOT`) points to the installed SDK. Without that
environment variable the re-execution test is explicitly skipped; static
provenance and golden differential checks still run.

`point-canvas-effects.test.mjs` compares the new pure model against each original
C# event snapshot with exact numerical comparison. `points-bound` oracle events
map to the model's common `synchronize` numeric effect; original Points property
notifications are checked separately and are not fabricated by that model.

See `ohos/POINT_CANVAS_016_SOURCE_AUDIT.md` for the complete binding/collection
source chain, API and integration limits. This oracle does not change the
existing 188-template action coverage denominator or close attachment-related
partial labels by itself.
