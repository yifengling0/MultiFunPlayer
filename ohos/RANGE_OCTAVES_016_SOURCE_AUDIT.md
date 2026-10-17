# 0.16 RangeSlider / Octaves source audit

Audit date: 2026-10-16. Original application source:
`36c08fbb99ac9398a63ff1cca1bbf68cd2228a94`.

## Result and correction to the 0.15 hypothesis

For an already configured, normally bound control, a provider shortcut's
source-to-target transfer can coerce the **displayed effective value without
writing the coerced value back to the provider**. Neither `TwoWay` nor
`MinRange=.01` establishes automatic provider normalization.

Consequently:

- Preserve the independent `Minimum` / `Maximum` shortcut callbacks, including
  equal/reversed provider ranges. Do not impose `.01` separation in the model.
- Preserve an Octaves source value above8 when a control only displays8. The
  source callback does not acquire an upper bound from the live view.
- Preserve the separate **Random128 runtime activation budget**. Displaying8
  does not make raw129 or Int32.MaxValue safe to activate.
- A genuine explicit editor setter/commit can write back, including when its
  effective value stays equal. A display refresh or unedited focus/blur must not
  synthesize that commit.

This corrects the proposed “attached-control coercion/write-back” dependency in
the 0.15 matrix; it does not silently promote its partial rows. Initial XAML
binding order, popup/view caching, dispatcher interleavings and actual Windows
lifetime behavior remain unexecuted. Dynamic `MinRange` changes have a distinct
setter path described below and must not be conflated with ordinary transfers.

## Evidence and pinning

No resolved MahApps/Fody/Stylet package cache or woven desktop application was
found locally. Only official repository **text source** was retrieved. No
package, executable, Windows runtime, or unknown software was installed or run.

The exact retained files and licenses are under
`tools/reference/range-controls-016/upstream/`; `manifest.json` records verified
Git blob SHA-1s and official URLs. Tests reconstruct Git blob hashes byte for
byte. `application-sources.json` records the original app chain's SHA-256s.

| Evidence | Pin / scope |
|---|---|
| [RangeSlider.cs](https://github.com/MahApps/MahApps.Metro/blob/2.4.9/src/MahApps.Metro/Controls/RangeSlider.cs) | MahApps2.4.9, blob `e341a995420c3747288a472078b11cdd055eb87d` |
| [NumericUpDown.cs](https://github.com/MahApps/MahApps.Metro/blob/2.4.9/src/MahApps.Metro/Controls/NumericUpDown.cs) | MahApps2.4.9, blob `522b5b963cfb3a322b31ce59a7dadccb554e51cc` |
| [BindingExpression.cs](https://github.com/dotnet/wpf/blob/v9.0.0/src/Microsoft.DotNet.Wpf/src/PresentationFramework/System/Windows/Data/BindingExpression.cs) | WPF v9.0.0 framework baseline, blob `ced9291429a105ab2a6218f96a92a1e45669e1e9` |
| [BindingExpressionBase.cs](https://github.com/dotnet/wpf/blob/v9.0.0/src/Microsoft.DotNet.Wpf/src/PresentationFramework/System/Windows/Data/BindingExpressionBase.cs) | WPF baseline, blob `21915f798018fc38e9f2aed26a6d6cb316a31c0a` |
| [DependencyObject.cs](https://github.com/dotnet/wpf/blob/v9.0.0/src/Microsoft.DotNet.Wpf/src/WindowsBase/System/Windows/DependencyObject.cs) | WPF baseline, blob `ccda5318a81b5b1b6c77d57b3dc4e4cc02ef5d34` |
| [FrameworkPropertyMetadata.cs](https://github.com/dotnet/wpf/blob/v9.0.0/src/Microsoft.DotNet.Wpf/src/PresentationFramework/System/Windows/FrameworkPropertyMetadata.cs) | WPF baseline, blob `6958326b22fd4aee11962f1f03eca5dc759840d6` |
| [MaterialDesign numeric theme](https://github.com/MaterialDesignInXAML/MaterialDesignInXamlToolkit/blob/v4.7.0/MaterialDesignThemes.MahApps/Themes/MaterialDesignTheme.MahApps.NumericUpDown.xaml) | v4.7.0, blob `c871450abb148fe1bd07c097921305b0463c8a24` |
| [MaterialDesign release versions](https://github.com/MaterialDesignInXAML/MaterialDesignInXamlToolkit/blob/v4.7.0/.github/workflows/get_versions.yml) | Explicitly pairs MaterialDesign4.7.0 with MahApps integration0.2.6 |

`MultiFunPlayer.csproj` pins MahApps.Metro2.4.9, MaterialDesignThemes4.7.0 and
MaterialDesignThemes.MahApps0.2.6. It uses **Fody6.*, PropertyChanged.Fody4.*,
Stylet1.***, not exact versions, and targets `net9.0-windows` without fixing the
desktop runtime patch. `FodyWeavers.xml` enables PropertyChanged and
ConfigureAwait. No lock file or actual woven output resolves those wildcards.
The [official Fody documentation](https://github.com/Fody/PropertyChanged/blob/master/readme.md)
describes notification weaving and unchanged-value suppression, but is only
supporting documentation, not proof of the missing resolved assembly.

## Application chain

1. `AbstractMotionProvider.cs:70–99` registers Minimum/Maximum Set/Offset/Drive.
   Each invokes the selected provider instance on the target axis and applies
   `MathUtils.Clamp01` only to that endpoint. It never compares the other bound.
   The registered argument editor is independently bounded0..1 (Offset−1..1).
2. `RandomMotionProvider.cs:48–52` registers Octaves Set as an `int`, with an
   action argument editor minimum1 and no maximum8. The callback assigns
   `p.Octaves = octaves`. Numeric argument coercion in
   `IShortcutSettingTemplateContext.cs:16–22` is distinct from the runtime view.
3. These are auto-properties. Under the project's intended PropertyChanged
   weaving, changed values use `AbstractMotionProvider.OnPropertyChanged`:
   `RequestSync()` precedes `base.OnPropertyChanged` (`:34–43`). No special
   `OnOctavesChanged`, range-reordering setter, seed recreation or `_time` reset
   exists. Random creates `_noise` in its constructor and advances `_time` only
   in `Update` (`RandomMotionProvider.cs:18–33`). Exact woven notification counts
   and dispatch timing remain unexecuted.
4. `MotionProviderManager` holds persistent instances by axis/name. Its
   `GetMotionProvider` returns that instance; a command does not need the provider
   view to exist. `MotionProviderSelectorConverter` returns the selected
   instance for the `ScriptView.xaml:1150–1156` Stylet `View.Model` ContentControl
   inside the provider popup. This source does not prove which hidden/cached
   views remain bound after a particular navigation.
5. All four provider views bind LowerValue to Minimum and UpperValue to Maximum
   with `Mode=TwoWay, UpdateSourceTrigger=PropertyChanged`, and use fixed slider
   Minimum0, Maximum1, MinRange.01. Random's view lines91–99 binds NumericUpDown
   Value to Octaves with Minimum1, Maximum8, Interval1 and integer parsing.
6. `App.xaml` merges MaterialDesign's MahApps defaults; the pinned defaults
   dictionary includes its NumericUpDown theme. That theme supplies the named
   text box/buttons and styling but no `Value` setter, text-value binding,
   `EventSetter` or source-update handler. The app's RangeSlider style likewise
   has no provider write-back event handler. MahApps Value metadata is
   `BindsTwoWayByDefault`; WPF metadata's default source-update trigger is
   PropertyChanged. The supplied control binding is therefore TwoWay without
   needing an explicit mode on the Octaves XAML.

## Effective range coercion and ordering

Pinned `RangeSlider.cs:242–317` gives these rules, in this order:

- Upper: if proposed >Maximum **or** Lower+MinRange >Maximum, return Maximum;
  otherwise if proposed <Lower+MinRange, return Lower+MinRange; else proposed.
- Lower: if proposed <Minimum **or** Upper−MinRange <Minimum, return Minimum;
  otherwise if proposed >Upper−MinRange, return Upper−MinRange; else proposed.
- `RangesChanged` returns during `_internalUpdate`; otherwise it invokes
  `CoerceLowerUpperValues`, which recoerces **Lower first, then Upper**, raises
  value events, updates `_oldLower/_oldUpper`, and recalculates geometry.
- Changes may re-enter this same callback. The original, uncoerced base value
  survives and can become effective when the other endpoint later allows it.
- `RaiseValueChangedEvents` emits RangeSelectionChanged, then LowerValueChanged,
  then UpperValueChanged, only for the relevant unequal values. This routed
  event order is not a claim about model PropertyChanged or dispatcher ordering.

The controlled numeric difference matters. With a settled display[0,.2], a
source Minimum=.9 displays[.19,.2] but preserves raw[.9,.2]. Raising source
Maximum to1 can restore the retained Lower=.9. Starting instead from display
[0,1], transferring Minimum=.9 **before** Maximum=.2 produces display[.9,.91].
Transferring Maximum=.2 first produces[.19,.2]. A stateless sort or simultaneous
“normalize both” function erases this history and is incorrect.

MinRangeWidth10 controls geometry; it is not an additional logical range gap.
`ReCalculateSize` only writes geometry, not LowerValue/UpperValue.

### Separate setter paths

`MinRangeChanged` (`:339–360`) directly assigns UpperValue twice while
`_internalUpdate` is true, then coerces it. If an Upper binding is already
attached, those **setters** can enter source update. Fixed MinRange=.01 ordinary
endpoint transfers do not invoke this path. Initial XAML property ordering has
not been executed, so this audit does not claim all construction effects are
absent. Mouse/two-thumb movement also directly sets endpoints; whole-range
increase/decrease can assign Upper→Lower or Lower→Upper. Only the subsequent
coercion callback's Lower→Upper order is universal within this audited scope.

## Effective Octaves and binding write-back

`NumericUpDown.CoerceValue` (`:377–403`) preserves null, conditionally truncates
when NumericInput.Decimal is absent, and bounds the effective number to
Minimum/Maximum. The default NumericInput mode is All; the Octaves source is
already an Int32. Its valid display range is1..8.

`OnValueChanged` (`:1037–1105`) updates text/button state and raises events; it
does not call UpdateSource or SetCurrentValue. Nonempty programmatic display
text during an ordinary transfer has no manual-change/undo/redo commit path
in `OnTextChanged` (`:1421–1441`). User text editing and transient manual-change
state are separate input paths and are not emulated by the pure transfer model.

The WPF chain establishes the critical distinction:

1. `BindingExpression.TransferValue` (`:1263–1526`) sets IsInTransfer, obtains
   source value, caches it, calls target invalidation/coercion, cleans the
   binding and clears IsInTransfer.
2. `DependencyObject.CoerceValue` (`:1086–1120`) and
   `ProcessCoerceValue` (`:1646–1728`) keep base/effective values separately.
   Normal coercion uses SetCoercedValue, not BindingExpression.SetValue.
3. `BindingExpressionBase.ShouldReactToDirty` (`:1466–1473`) excludes active
   transfers and detached bindings; `BindingExpression.UpdateOverride`
   (`:1834–1847`) also excludes transfers. There is no automatic “repair source
   from coerced display” on this path, even with TwoWay metadata.
4. Explicit `SetValue` / `SetCurrentValue` goes through
   `DependencyObject.SetValueCommon`: the existing expression receives
   `currentExpr.SetValue` **before** final effective-value update/equality logic.
   A reflective BindingExpression sets its cached Value; that setter calls
   Dirty, which can UpdateSource. NumericUpDown's `SetValueTo` always calls
   SetCurrentValue after constraining the proposed value; it has no
   same-effective-value early exit.

Thus explicit commit8 can replace source129 while the target stays8 and emits
no new ValueChanged. A disabled increment button does not generate such a
setter call; neither does an untouched focus/blur in the portable UI contract.
The pure model's commits record an **explicit edit request**, not an inferred
ValueChanged event.

## Detached, unloaded and hidden controls

- **No view / binding detached / data item disconnected:** provider callbacks
  still run. There is no target transfer/commit merely from those callbacks.
- **Bound target, including a retained hidden or unloaded control:** coercion
  has no IsLoaded, visibility, ActualWidth or measurement guard. Unloaded is
  not equivalent to detached. A binding that remains attached can still have
  its effective value updated.
- NumericUpDown's IsLoaded checks only gate MinimumReached/MaximumReached
  routed events; the numeric coercion and general ValueChanged path are not
  gated that way.
- Whether a specific Stylet popup/Expander/tab retains its binding, when
  DataContext propagates, and exact Loaded/Unloaded/dispatcher scheduling need
  a Windows runtime test. No boolean “selected view is visible” can prove this.

## Portable API and verified scope

`entry/src/main/ets/core/MotionControlValues.ts` exports:

- `createMotionControlValues()` gives a declared settled starting display
  0/1/1 and matching source bases. This is not reconstructed XAML construction.
- `transferMotionControlValues(current, raw, changedFields?)` returns copied
  state, effective `valueChanges` and **no commits**. It retains separate
  sourceMinimum/sourceMaximum/sourceOctaves. Explicit changedFields follow the
  observed notification order; omitted fields transfer only changed bases in
  the declared portable Minimum→Maximum→Octaves order. Render refreshes do not
  throw away history or write model values.
- `userEditMotionControlValue(current, field, proposed)` returns a constrained,
  explicit **single-field** commit for the caller's real setter, even if display
  value remains equal. It does not reproduce pointer geometry, two-thumb drag
  rounding, locale parsing, dynamic MinRange or manual-input races. The caller
  must require an actual edit and retain/adopt state for the correct editor
  identity. Failed/cancelled setters must not be reported as applied.

All functions are pure. They hold no provider, output, clock, sync, seed, binding
permission or runtime-admission object. Endpoints must be finite; transferred
Octaves must be an Int32, while activation remains subject to Random128.

The C# oracle extracts and runs six **unchanged** MahApps methods. Its explicit
structural dependency-object and event-record shims are documented in
`tools/reference/range-controls-016/README.md`, `Host.cs.in` and golden
provenance. It uses the existing official SDK9.0.319/runtime9.0.21 offline,
without package restore. **93 cases / 1,241 sequential transfers** match the
portable model's every effective state and effective change sequence.

The shim is not an executed WPF binding oracle. Source-write conclusions are
separately grounded in the retained official binding/control sources and
source-anchor tests. Windows/Fody/Stylet execution, initialization, dispatcher
interleavings, cached-view scheduling, pointer behavior and hardware remain
unverified. Those boundaries remain partial regardless of this local pass.

### Verification recorded for this slice

- `MFP_DOTNET_ROOT=<existing official 9.0.319 SDK> node --test
  ohos/tests/range-controls-source-oracle.test.mjs`: **22 passed, 0 failed,
  0 skipped**, including live offline C# compilation/re-execution and exact
  source/golden provenance checks.
- `node --test ohos/tests/shortcut-motion-actions.test.mjs
  ohos/tests/motion-providers.test.mjs ohos/tests/motion-noise.test.mjs`:
  **42 passed, 0 failed, 0 skipped**. These include unchanged independent range
  callbacks, retained phase/seed, Int32 storage, atomic129 rejection and
  the128 activation boundary.
- No aggregate gate, SDK/HAP build, device, Windows UI or physical-output result
  is claimed by this audit. Integration owns those later checks.
