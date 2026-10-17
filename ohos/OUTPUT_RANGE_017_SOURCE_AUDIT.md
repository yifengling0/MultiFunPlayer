# Output range Set/Offset source audit (0.17)

Scope: eight abstract output range command templates, original setters and bindings, portable numeric reducer, and independently bounded reversed output endpoints. No Drive actions, external endpoints, target creation, auto-connect, file-recording control, device operation, or Windows-runtime claim.

## 1. Source registration and exact target identity

`Source/MultiFunPlayer/OutputTarget/AbstractOutputTarget.cs:22–47,190–330` supplies eight Set/Offset registrations per output instance. The exact original name is `{Identifier}::Axis::Range::{Minimum|Maximum|Middle|Size}::{Set|Offset}`. The 4 fields × 2 operations are eight templates, not eight globally registered instances. Four additional Drive registrations exist but are outside this implementation.

`Identifier` is `${Name}/${InstanceIndex}`; `Name` is the concrete type's `DisplayName`, not a user-editable nickname. Exact prefixes are `TCP/0`, `UDP/0`, `WebSocket/0`, `Serial/0`, `Pipe/0`, `File/0`, `The Handy/0`, `Buttplug.io/0` for index zero. `UI/Controls/ViewModels/OutputTargetViewModel.cs:42–70,206–235` picks the smallest unused nonnegative index within a target type, registers actions on add and unregisters on remove. Removed identifiers can be reused; a portable stale-target guard must therefore include live instance generation, not only a saved identifier.

Each callback closes over that one output object's `AxisSettings`. There is no target-name parameter, selected-output fallback, all-target action, or output-enabled prerequisite. A disabled axis's settings can still change. Selection in the original output tab does not retarget an existing callback.

The axis argument is a `DeviceAxis`, using `WithItemsSource(DeviceAxis.All)`. Builder default is null. `UpdateSettings` invokes the callback only when `axis != null`; it then indexes the dictionary by that exact axis. Null is a no-op, never all axes or current selected axis. The set of `DeviceAxis.All` entries comes from enabled valid profile axes, not from the output's per-axis Enabled flags. `Settings/Converters/DeviceAxisConverter.cs:9–15` converts non-string, empty or unknown JSON names to null using `DeviceAxis.TryParse`; exact axis names resolve through `Common/DeviceAxis.cs:39–44,62–78`. No wildcard or “all” name exists. Our oracle's identity shim explicitly maps unknown text to null and does not execute that converter or the whole real axis initialization.

Portable static action templates plus explicit `outputTargetId` are an adaptation. The application must resolve a saved target's current instance generation and a current explicit axis; it must not broadcast on null/empty/unknown fields. Current owned network targets support TCP/UDP/WebSocket only. The abstract template also exists for five other original target types, so whole-original output-target parity remains partial.

## 2. Arguments, editor domain and defaults

All rows begin with `axis`. The table lists the remaining original callback arguments in order. Every numeric editor interval is 0.01 and displayed as `P0`. Interval/display formatting does not quantize the stored double. `IShortcutSettingBuilder.cs:38–42` uses default(T), then template coercion; `IShortcutSettingTemplateContext.cs` clamps but does not round.

| Suffix | Arguments after axis | Value editor/default | Limit editors/defaults |
|---|---|---|---|
| Minimum::Set | value | [0,1], 0 | fixed minimumLimit=0 |
| Minimum::Offset | offset, minimumLimit | [-1,1], 0 | [0,1], 0 |
| Maximum::Set | value | [0,1], 0 | fixed maximumLimit=1 |
| Maximum::Offset | offset, maximumLimit | [-1,1], 0 | [0,1], 1 |
| Middle::Set | value | [0,1], 0 | fixed limits 0,1 |
| Middle::Offset | offset, minimumLimit, maximumLimit | [-1,1], 0 | each [0,1], defaults 0,1 |
| Size::Set | value | [0,1], 0 | fixed limits 0,1 |
| Size::Offset | offset, minimumLimit, maximumLimit | [-1,1], 0 | each [0,1], defaults 0,1 |

The two independently edited limits are not required to be ordered or at least 0.01 apart in the original registration. Original raw settings deserialization and direct invocation are less bounded than these editors. The portable command reducer intentionally accepts only finite editor-domain numbers; it does not pretend that all original malformed/raw states are supported.

## 3. Exact setter formulas and observable quirks

`OutputTarget/DeviceAxisSettings.cs` is an unmodified plain Minimum/Maximum/Enabled property model, defaults 0/1/true. There is no endpoint setter clamp, sort, rounding, inversion flag, dirty flag, automatic connect, or update event. Fody/Stylet notification behavior is separate from the property values.

Let m=Minimum and M=Maximum. `MathUtils.ClampSafe(x,a,b)` clamps x between min(a,b) and max(a,b), so crossed bounds are reordered inside each clamp only. It does not order the final pair.

- Minimum Set: m ← ClampSafe(value,0,M−.01). Minimum Offset: m ← ClampSafe(m+offset,minimumLimit,M−.01). M is untouched.
- Maximum Set: M ← ClampSafe(value,m+.01,1). Maximum Offset: M ← ClampSafe(M+offset,m+.01,maximumLimit). m is untouched.
- OffsetMiddle first limits a positive offset that would pass the upper limit, or a negative offset that would pass the lower limit. It then assigns Minimum with bounds [lower,upper−.01], then Maximum with [lower+.01,upper]. Each clamp independently uses ClampSafe.
- **Middle Set uses the actual binding `OffsetMiddle(s, value - (s.Maximum - s.Minimum) / 2, 0, 1)`**. It subtracts half WIDTH, not current midpoint. For [.2,.7], Set(.5) yields [.45,.95]. Do not substitute the separately defined Drive helper `SetMiddle`.
- OffsetSize computes current midpoint, then `ClampSafe(M−m+offset,.01,upper−lower)`. SetMiddleAndRange computes endpoints around that midpoint, shifts the lower endpoint when the new upper exceeds upper, then shifts the upper endpoint when the lower is below lower; finally it independently clamps the endpoints.
- **Size Set uses `OffsetSize(s, value - (s.Maximum - s.Minimum), 0, 1)`**. Preserve that arithmetic order and its .01 size clamp. [.2,.8] Set(0) yields [.495,.505], unlike the Drive-like `SetSize` helper.

Legal original inputs can produce reversed endpoints: [.2,.8], Minimum Offset(+1,limit=1) yields [1,.8]; Maximum Offset(−1,limit=0) yields [.2,0]. No sorting is justified. Equal endpoints remain possible. Some legal editor inputs plus degenerate/raw states produce endpoints outside [0,1], such as Minimum operations on a [0,0] starting range or Maximum operations on [1,1]. Those outcomes remain explicitly unsupported by the bounded portable pipeline; the reducer refuses the entire edit.

## 4. Binding and inversion interpretation

TCP/UDP/WebSocket views bind `RangeSlider.LowerValue` to `Value.Minimum` and `UpperValue` to `Value.Maximum`, TwoWay with PropertyChanged, Minimum=0, Maximum=1 and MinRange=.01. Enabled controls the slider. `AutoToolTipPrecision=2`, percentage conversion, layout rounding and thumb minimum geometry are display/control concerns, not command rounding.

The retained official MahApps 2.4.9 and WPF source audit under `tools/reference/range-controls-016` applies here: CoerceLowerValue/CoerceUpperValue produce bounded, ordered *effective control values* and RangesChanged coerces Lower then Upper. Source-to-target transfer is not proof of source write-back: WPF TransferValue sets IsInTransfer, while dirty/update paths suppress writes during transfer. Consequently raw output settings, which output mapping actually reads, must not be silently replaced by the visible thumb positions. Explicit user slider edits are a different path. No Windows WPF/Fody/dispatcher runtime was executed for this release; template initialization, timing, mounted/unmounted races and full pointer geometry remain unverified.

There is no output-range Invert property or command. Reversed raw endpoints invert output by the same original Lerp formula. Script inversion is a distinct upstream pipeline setting and must not be toggled as a substitute.

## 5. Fixed/polled mapping, dirty cache and rounding

`AbstractOutputTarget.GetValues` reads current provider scalars and applies `MathUtils.Lerp(min,max,value)`. Original Lerp is `from + (to-from)*Math.Clamp(t,0,1)`, including negative slope for reversed endpoints. Original fixed GetValue replaces nonfinite source values with the axis default; portable dispatch intentionally fails closed instead of creating default motion.

The TCP/UDP/WebSocket fixed loops read current settings on every tick. They compare the **unquantized, already range-mapped double** against the last successfully sent mapped double, then filter by Enabled. `DeviceAxis.IsValueDirty` is `Abs(last-current)*(outputMaximum+1)>=1 || (IsFinite(current) XOR IsFinite(last))`. Range changes do not clear the cache, force dirty, reset the timer, or directly send anything. If the newly mapped scalar is unchanged, a dirty-only loop remains quiet. The mapped cache updates only after stream Write/Send completion. Range editing must retain successful `lastWritten` while invalidating stale queued candidates/receipts as required by the portable safety layer.

Polled callbacks wait for a genuine provider event, read current settings, skip disabled axes and nonfinite original target values, map that event's TargetValue and retain its Duration. They do not apply fixed dirty filtering or synthesize a new event solely because a range changed. Thread/async polling's null *axes list* means all axes; that scheduler API is distinct from the command's null single-axis no-op.

Original `DeviceAxis.ToString` uses custom all-zero .NET formatting after multiplication by outputMaximum, not an explicit Math.Round in the setter. Duration uses `(int)Math.Floor(milliseconds+.75)`. The existing encoder's precision 1–9 compatibility remains unchanged; source precision-10 overflow is still blocked. New fixtures execute original Lerp, ToString fixed/event overloads and IsValueDirty across ascending/reversed/equal ranges and precision 1–9.

## 6. Portable integration boundary

`input/ShortcutOutputRangeActions.ts` is independent of catalog and runtime. API:

- `applyOutputRangeAction(range, {operation,value,minimumLimit,maximumLimit})`
- operation is one of the eight `Minimum::Set` etc. suffixes
- returns `{range,changed}` or null; clones only and performs no selection, persistence, scheduling, device, connection or arm operation
- endpoints each must be finite in [0,1]; reversed/equal endpoints are preserved; axisId/Enabled are unchanged
- Set commands require canonical unused limits 0/1, Minimum Offset requires unused maximumLimit=1, Maximum Offset requires unused minimumLimit=0
- crossed/equal/sub-.01 Offset limits are evaluated exactly, not pre-rejected by an invented rule; any out-of-[0,1] final endpoint refuses the complete edit

`OutputSettingsModel.setRange`, `RangeModel.validateRange`, and `OutputConfiguration` now accept independently finite [0,1] endpoints, preserve order through saved schema 1 and display a reversedRange diagnostic. Enabled/axis/profile/endpoint/permission validations are untouched. Existing `RangeEditor` helpers still have their older stricter limit guard and Drive-like setSize/setMiddle semantics; the new shortcut reducer does not call those helpers and does not change ordinary UI editing into command semantics.

Before this integration, OutputCoordinator had no same-profile range update API, while OutputSession.reconfigure revoked the gate and required a strictly newer profile revision. Neither path alone supplied the original live range behavior. The parent integration owns the narrow range-only application transaction: resolve current target generation, validate all axes/configuration, persist detached preferences, clear old candidates and ignore late receipts, preserve successful mapped dirty history and only an already-authorized arm intent, wait for a new genuine current frame/event, and never reconnect or create an arm. Scope, endpoint, permission, kind, profile or instance changes are separate invalidations. This audit does not claim those parent lifecycle changes passed based on the numeric oracle.

## 7. Executed evidence and remaining limits

New executable oracle: `tools/reference/output-range-017/run.py`, `Host.cs.in`, `golden.json`. It extracts the entire unchanged original RegisterActions method and invokes its captured delegates; it does not rewrite the eight callback expressions. Unmodified DeviceAxisSettings.cs is compiled with inert JSON/Stylet shims. Exact original math/encoding/dirty spans and generated-host/source SHA-256 values are retained. Official already-present .NET 9.0.319 / runtime 9.0.21; no package restore, installation, network or endpoint access.

`tests/output-range-017-source-oracle.test.mjs` proves:

- 2,780 exact original callback cases across all eight operations, normal/reversed/equal endpoints, sub-.01 and crossed limits, fractional non-quantized values; 220 out-of-[0,1] outputs explicitly refused, every supported output exactly equal as binary64
- 24 null/other-axis identity cases (empty/unknown names mapped to null by the declared host shim)
- 432 exact original mapped values, fixed bytes, polled bytes and dirty comparisons, precision 1–9
- detached pure edits, unchanged axis/Enabled, malformed/unsupported fail-closed behavior
- old ordered schema-1 data and new reversed data round-trip without sorting, unknown fields or runtime authority
- optional live official .NET rerun equals the retained golden result including source provenance

Remaining original differences: unsupported five target kinds and Drive input context; bounded finite normalized range domain versus unconstrained raw original settings; portable current-generation/queue/receipt safety; stricter finite source admission; original auto-connect behavior; precision 10; actual Windows binding and physical transport/device timing. Static portable actions do not imply original dynamic-name import or whole-target feature parity.
