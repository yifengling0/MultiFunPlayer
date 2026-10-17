# Range and Octaves control source oracle (0.16)

This bundle executes six unchanged methods from the officially published
MahApps.Metro **2.4.9** source. The project explicitly references that version.
The 93 scenarios contain 1,241 sequential property transfers, including retained
coercion bases, crossing endpoints, opposite update orders, equal endpoints,
same-effective changes, Int32 extremes and deterministic sweeps.

`manifest.json` pins official source URLs and Git blob SHA-1s. `upstream/` contains
the exact fetched UTF-8 bytes and their licenses. The MaterialDesign v4.7.0
release workflow explicitly gives its MahApps integration version as 0.2.6.
The .NET WPF v9.0.0 source is a documented framework baseline; the application's
actual Windows runtime, Fody4.*, Fody6.* and Stylet1.* versions were not locked or
available as local resolved packages. No package or executable was downloaded.

## Reproduce offline

Use an already installed official .NET 9 SDK. The run never restores packages,
installs software, uses a browser, or connects to media/output endpoints.

```sh
MFP_DOTNET_ROOT=/path/to/existing/dotnet-sdk-9 \
  python3 ohos/tools/reference/range-controls-016/run.py --output /tmp/range-controls.json
MFP_DOTNET_ROOT=/path/to/existing/dotnet-sdk-9 \
  node --test ohos/tests/range-controls-source-oracle.test.mjs
```

The tested SDK was 9.0.319, Microsoft.NETCore.App 9.0.21. With no SDK supplied,
the Node test explicitly skips live C# re-execution; golden/provenance checks
still run. To intentionally regenerate reviewed fixtures, set the output to
this directory's `golden.json`.

## What is and is not executed

Unchanged C#: RangeSlider.CoerceLowerValue, CoerceUpperValue, RangesChanged,
CoerceLowerUpperValues, RaiseValueChangedEvents; NumericUpDown.CoerceValue.
The dependency-object host is a **structural shim**, not WPF. It retains base and
effective values and invokes the real callbacks on effective changes. A routed
event collector replaces actual WPF routing. ReCalculateSize is a no-op because
the original method only writes layout geometry. All substitutions are listed
in `golden.json` provenance and visible in `Host.cs.in`.

The fixture does not execute BindingExpression, Fody, Stylet, a dispatcher, XAML,
control loading/unloading, text parsing, thumb geometry, input routing, or a
Windows control. Binding source-write behavior is established by the separately
retained official WPF/control source and source-anchor tests, **not** by the shim.

## Critical distinction

Source-to-target coercion changes the **effective control value**, not the
provider's raw value. TwoWay does not imply source-to-target coercion repair.
RangeSlider source-transfer callbacks use CoerceValue, which stores an effective
value rather than invoking BindingExpression.SetValue. NumericUpDown does not
explicitly UpdateSource in OnValueChanged. A retained raw129 can display8.

An explicit SetValue/SetCurrentValue call on a live TwoWay binding does invoke
its source-update path, even if the effective value stays equal. This allows a
real edited commit of displayed8 to replace raw129. Display refresh/focus/blur
alone is not such an edit. See `../../../RANGE_OCTAVES_016_SOURCE_AUDIT.md`.

The portable model under `core/MotionControlValues.ts` returns separate effective
state and explicit commit records. It never invokes a provider or bypasses the
Random128 runtime budget. Initial state and multiple-field source order are a
declared portable editor contract, not measured XAML initialization scheduling.
