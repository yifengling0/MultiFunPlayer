# 0.28 continuous Drive: exact-source numerical and setter-chain audit

Audit date: 2026-10-17. Original repository:
[Yoooi0/MultiFunPlayer](https://github.com/Yoooi0/MultiFunPlayer/tree/36c08fbb99ac9398a63ff1cca1bbf68cd2228a94),
pin `36c08fbb99ac9398a63ff1cca1bbf68cd2228a94`.

## Scope and executable evidence

`tools/reference/continuous-drive-028/` compiles eight unchanged original files
and thirteen unchanged source spans using official .NET SDK9.0.319 / runtime
9.0.21. It executes original Drive, Offset and DTO code, the entire output action
registration method, the entire base Motion provider class, the Axis Value and
Blend registrations, and the actual original transition setter/class. It does
not hand-rewrite the expected algorithms. Twenty-five complete original source
files are byte-verified against the Git pin and recorded in the manifest.

The 3,194-row fixture includes 700 Drive, 140 Offset, 240 ApplyTo, 2,106 nine-template
action rows and eight Set contrasts. Original busy-drop code is executed in an
additional capture-runner probe. The reproducibility test compiles/runs the
original code again and compares the full result to the retained fixture.
SHA-256 pins source, exact extracted spans, runner, manifest, host template and
generated host. C# negative zero is preserved through the Python/JSON pipeline.

The source locations below are relative to `Source/MultiFunPlayer/`.

## Drive and DTO arithmetic

- `Shortcut/AxisDriveShortcut.cs:9–35`: default `Relative`, `Invert=false`, five
  modes. `RelativePositiveOnly` and `RelativeNegativeOnly` test the original
  delta sign before inversion. `RelativeJoystick` admits only value<.5 with
  delta<0 or value>.5 with delta>0. Exactly centered, stationary and
  returning-toward-center samples produce no invocation. Absolute inversion is
  `1-value`; relative inversion multiplies delta by−1.
- `Input/IInputGestureData.cs:43–69`: absolute/relative constructors preserve
  duration. `ApplyTo(value,deltaModifier=1)` returns the absolute value or
  `value + ValueOrDelta * deltaModifier`. Time is not multiplied into relative
  data a second time. The fixture tests modifiers−1,0,.1,1,2.
- `Shortcut/AxisOffsetShortcut.cs:10–42`: independent default
  `AbsoluteJoystick`, Speed=.1, Invert=false. Absolute is value×speed×sign;
  joystick uses the original two Map branches (`.5..1→0..1`, `.5..0→0..−1`).
  Zero cancels; nonzero creates a repeat only when one is not already running.
  Each callback constructs `Relative(_offset,.1)` using the current offset.
- `UI/Controls/Views/ShortcutSettingsView.xaml:218–250`: Offset's Speed editor
  has minimum0 and maximum1. This is unrelated to a Motion provider's Speed,
  whose Drive callback has minimum.01 and no maximum1.

## Repeat and action execution boundaries

`Shortcut/IShortcut.cs:59–72` executes an Interlocked scheduled flag. Null data,
no configurations or an already scheduled invocation do not enqueue work. A
refused schedule releases the flag; successful completion releases it through
`OnInvoked`. The oracle executes these exact methods with a capture runner and
proves a second invocation is dropped while held, a later invocation succeeds
after completion, and a refused first schedule does not permanently block.

`IShortcut.cs:88–100,129–137` starts a PeriodicTimer and waits for its first tick
before calling the repeat action. `AxisOffsetShortcut.Update` does not call the
action immediately or restart an existing repeat when its offset changes.
`IShortcutActionRunner.cs:53–60,136–151` awaits each action in batch order before
returning completion. These are source facts. This bundle's repeat shim only
records period/callback and explicitly ticks it; it does not execute a fake WPF
or PeriodicTimer schedule. The native port's separate fake-clock tests own
99/100/200ms deadlines, coalescing, cancellation, stale capture and late callback
proofs. None of this establishes actual Windows/OHOS event delivery latency.

## Nine action transformations

1. `UI/Controls/ViewModels/ScriptViewModel.cs:1613–1615`: Axis Value forwards
   `ValueOrDelta`, `DeltaTime`, and `IsRelative` to SetAxisTransition. The exact
   setter (`:1216–1236`) uses the current finite raw value or axis default. A
   first command clamps the target0..1; an active relative command calls Append.
   `AxisValueTransition` (`:2185–2247`) retains the original initial−1 time
   sentinel and append arithmetic, including its unclamped appended target.
   A command does not construct a new published pipeline frame.
2. Same file `:1935–1937`: Blend applies data to the existing blend and Clamp01.
3. `MotionProvider/AbstractMotionProvider.cs:65–67`: provider Speed is
   `max(.01, data.ApplyTo(existingSpeed))`.
4. Same file `:81–83`: Minimum is `Clamp01(data.ApplyTo(existingMinimum))`.
5. Same file `:97–99`: Maximum is `Clamp01(data.ApplyTo(existingMaximum))`.
6. `OutputTarget/AbstractOutputTarget.cs:271–274`: Minimum applies data then
   `ClampSafe(value,minimumLimit,existingMaximum−.01)`.
7. Same file `:289–292`: Maximum applies data then
   `ClampSafe(value,existingMinimum+.01,maximumLimit)`.
8. Same file `:309–313`, helper `:201–213`: Middle applies data to the actual
   midpoint `(max+min)/2`; retains signed half-width `(max−min)/2`; first shifts
   down if the new high endpoint exceeds the upper limit, else shifts up if the
   new low endpoint is below the lower limit; then independently ClampSafes
   both endpoints. This is not Middle Set's `OffsetMiddle(value−halfWidth)`.
9. Same file `:330–334`, helpers `:226–251`: Size applies data to the signed
   width `max−min`, keeps midpoint, then applies the original two independent
   high/low overflow adjustments and endpoint ClampSafes. It does not pass
   through OffsetSize's width clamp. Absolute Size0 can produce equal endpoints;
   Size Set0 uses OffsetSize and normally produces width.01.

`MathUtils.ClampSafe` orders its two bounds, not the stored range. Crossed limits
can therefore produce reversed ranges. Among 1,782 range rows, the portable
reducer exactly preserves 266 in-domain reversed and355 equal results. It
explicitly refuses179 original results outside normalized0..1, rather than
silently clamping them differently. Other valid results match bit-for-bit JS
number equality. Limit arguments remain independent and unrounded.

## Full Motion/property/binding/canvas chain, without invented scheduling

1. `AbstractMotionProvider` uses raw auto-properties for Speed/Minimum/Maximum.
   The original callbacks do not compare/sort Minimum and Maximum. The intended
   property-notification route calls RequestSync before the Stylet base callback.
   The fixture compiles the auto-properties with inert Fody/Stylet attributes;
   it does not claim measured notification counts or resolved woven behavior.
2. `MotionProvider/IMotionProviderManager.cs:39–65,105–111` keeps instances by
   axis and provider name/type. RegisterActions captures each specific provider
   getter. Changing a named provider does not mean changing whatever provider
   is later selected in the view, recreating its clock/noise, or replacing its
   cached value with a newly calculated sample.
3. All four provider XAML views bind Minimum/Maximum TwoWay to RangeSlider
   LowerValue/UpperValue, with fixed0..1 and MinRange.01. The existing pinned
   [0.16 control audit](RANGE_OCTAVES_016_SOURCE_AUDIT.md) follows the actual
   MahApps2.4.9/WPF source. A source-to-target effective coercion does not imply
   source repair. Equal/reversed raw provider values remain meaningful. A
   genuine editor commit is a different source-write path. Initial XAML order,
   view lifetime and dispatcher interleavings remain unexecuted.
4. `CustomCurveMotionProvider.cs:31–34,60–61` makes Viewport depend on Duration,
   not Speed/Minimum/Maximum. The canvas binds Points and that Viewport. None
   of the three base Drive callbacks changes Duration or the Points collection;
   they do not justify pruning/sorting/roundtripping Points, an invented viewport
   callback, a time reset or a replacement canvas. Existing actual canvas events
   remain governed by the [0.16 point-canvas audit](POINT_CANVAS_016_SOURCE_AUDIT.md).
5. `DeviceAxisSettings.cs` likewise has independent Minimum/Maximum auto-properties.
   TCP/UDP/WebSocket XAML binds them to the same kind of RangeSlider. It does not
   prove a second automatic normalization of the original callback's result.
   `AbstractOutputTarget.GetValues` maps with Lerp(min,max,value); reverse ranges
   are intentional input to the retained mapping/encoding/dirty oracles.

The portable session applies Blend/Motion through normal configuration setters
and output through the target-scoped range transaction. This oracle verifies
the numerical consumer route, preserves existing partial-control boundaries,
and does not promote all registered actions to full Windows UI parity.

## Source/platform and safety distinctions

`Input/RawInput/RawInputProcessor.cs:19–23,46–49,136–188` uses a virtual center.5,
500-count width/height and wheel divisors120×10/20. Mouse/wheel action durations
are0. Its Y accumulator uses the newly updated X accumulator. Individually
clamped mouse deltas are accumulated before a rate-limited publish, so a
published delta can exceed±1. The old button Offset argument-editor bound must
not silently become a continuous Drive delta bound.

Those Windows counts and quirks are not native vp. The local adapter must label
its own calibrated vp spans and touch duration contract. This oracle does not
validate gamepad normalization, raw HID input, global hooks, TCode IN, native
wheel phase reliability or actual touch/mouse duplicate delivery.

Configuration, explicit local reception, manual preview and physical Arm are
separate. Numerical mutation cannot grant any of them. The actual-session
consumer tests assert no implicit preview, no published command frame and no
output authorization. They initialize explicit prior runtime values as test
fixtures and inspect the real transition, not a counterfeit physical frame.
Native UI lifecycle, device delivery and live hardware still require their
separate tests and authorized devices.
