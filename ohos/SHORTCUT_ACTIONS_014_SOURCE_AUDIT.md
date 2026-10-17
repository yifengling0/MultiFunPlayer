# 0.14 Motion / named playlist / shortcut enable / reload source audit

Audit date: 2026-10-16. This is a **source-chain audit**, not a claim that Windows WPF, PropertyChanged.Fody, Stylet, MahApps, native devices, or third-party integrations were executed. No production code, Git state, network connection, physical connection, or File-output recording behavior was changed or reviewed by this audit.

## 1. Evidence and counting

- Original C# source is the checkout's `Source/MultiFunPlayer`, pinned in the existing reference manifest to upstream `36c08fbb99ac9398a63ff1cca1bbf68cd2228a94`.
- The immutable comparison baseline is `../mfp-release-artifacts/0.13.0-b484dd7bd188a4cd/source` (relative to the repository). All original files listed in the companion `tools/reference/action-coverage-014-source.json` were byte-compared against that baseline. The companion records their SHA-256 values and comparison result.
- Registration source and original template indices come from `tools/reference/action-coverage-013.json`. Its own classification baseline is **0.12**, not a claim about what was implemented in 0.13. This audit preserves that distinction.
- The requested new slice is **19 original registration templates, expanding to 37 concrete action names**: 16 Motion templates → 34 names; Internal PlayByName → 1; Shortcut Enabled → 2. Six shared Motion templates expand over four providers. The four already-existing reload/link templates are reviewed separately, not added to the new-slice count.
- Excluded: three shared analog `Drive` templates, Custom Curve `Points::Set`, Looping Script `Script::Set`, external output targets, source connections, arbitrary resource-path entry, and File recording review.

Path shorthand below: `MP` = `Source/MultiFunPlayer/MotionProvider`; `SVM` = `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs`; `Internal` = `Source/MultiFunPlayer/MediaSource/ViewModels/InternalMediaSource.cs`. All references are repository-relative.

## 2. Do not conflate three different contracts

1. **Argument registration/configuration contract.** `Shortcut/IShortcutSettingBuilder.cs:18–20,37–74,90–101` starts with `default(T)`, applies an explicit default factory if present, then numeric template coercion. `WithItemsSource` does not select its first item. `IShortcutSettingTemplateContext.cs:12–23` clamps; the interval does not quantize values. `IShortcutActionConfiguration.cs:53–83` also applies template coercion when populating saved typed values.
2. **Typed callback and provider setter contract.** `IShortcutAction.cs:42–52,68–90` checks argument count/type, not the numeric template bounds or enum membership. Direct typed invocation bypasses numeric-template coercion. `ShortcutSetting<T>.Value` is an auto-property. Only callbacks that explicitly clamp are intrinsically clamped. Enum `ItemsSource` does not make arbitrary cast enum values impossible in a direct typed call.
3. **Already-bound WPF view contract.** Fody notifications can update controls; control event handlers, dependency-property callbacks, and two-way coercion can then mutate the model again. A short registration lambda is not the complete effect. Conversely, those view effects are not unconditional effects of a headless provider setter.

The project enables `<PropertyChanged />` in `FodyWeavers.xml`, uses `PropertyChanged.Fody` 4.*, Stylet 1.*, MahApps.Metro 2.4.9 and MaterialDesignThemes 4.7.0 (`MultiFunPlayer.csproj`). Default Fody setter weaving is the basis for same-value notification suppression and `On<Property>Changed` / `DependsOn` behavior in this source audit; a woven assembly was not executed or disassembled here. Exact dispatcher scheduling, third-party control coercion order, cached-view lifetimes, and notification counts are not presented as runtime-tested facts.

OHOS can reject malformed/non-finite/out-of-declared-range JSON rather than emulate every permissive typed call or original saved-value clamp. That is a strict-input policy, not original callback behavior. Likewise, a finite Speed Offset can overflow after addition; reject a non-finite result before committing it. Do not add unexplained maximum speed or persistence caps.

## 3. Exact Motion registrations, arguments, defaults, applicability

All names have prefix `MotionProvider::`. Provider names are exact, case-sensitive display names: `Custom Curve`, `Looping Script`, `Pattern`, `Random`. `MP/IMotionProviderManager.cs:38–44,47–60,103–108` creates **all four provider instances for every DeviceAxis**, and registers the four provider families. An action addresses the named provider on its target axis even if that provider is not selected for output. It must not silently retarget the currently selected provider.

Every Motion action starts with `DeviceAxis axis`, label `Target axis`, `ItemsSource=DeviceAxis.All`, **source argument default null**. `DeviceAxis.All` is the configured axis set, not an inherently fixed six-axis list. Empty OHOS target meaning “capture selected active axis” is an existing adapter convention, not this original default.

### Shared six templates, each expanded over all four providers

| Original index / source line (`MP/AbstractMotionProvider.cs`) | Suffix | Second argument bounds / interval / action default | Callback |
|---|---|---|---|
| 34 / 55 | `Speed::Offset` | double [−double.MaxValue, double.MaxValue], .01, **0** | `Speed = Max(.01, Speed + offset)` |
| 35 / 60 | `Speed::Set` | double [.01, double.MaxValue], .01, **.01** | `Speed = Max(.01, value)` |
| 37 / 71 | `Minimum::Offset` | double [−1,1], .01, **0** | `Minimum = Clamp01(Minimum + offset)` |
| 38 / 76 | `Minimum::Set` | double [0,1], .01, **0** | `Minimum = Clamp01(value)` |
| 40 / 87 | `Maximum::Offset` | double [−1,1], .01, **0** | `Maximum = Clamp01(Maximum + offset)` |
| 41 / 92 | `Maximum::Set` | double [0,1], .01, **0** | `Maximum = Clamp01(value)` |

Labels are `Value offset` for Offset and `Value` for Set. Numeric format is `{0:P0}`. Minimum and Maximum are independently clamped; the callback does not sort them or enforce a minimum separation. A reversed range is meaningful to the provider's `MathUtils.Map`. An already-bound MahApps RangeSlider has a distinct `.01` MinRange constraint; see section 5.

### Provider-specific ten templates

| Index | Full concrete name | Second argument / declared bounds / interval / action default | Source |
|---|---|---|---|
| 43 | `MotionProvider::Custom Curve::InterpolationType::Set` | `InterpolationType`, all four enum values, **Linear** | CustomCurveMotionProvider.cs:181–184 |
| 44 | `MotionProvider::Custom Curve::Duration::Set` | double **[1,60]**, interval 1, **1**, `{0:F2}s` | :188–191 |
| 45 | `MotionProvider::Custom Curve::IsLooping::Set` | bool **false**, label `Enable looping` | :195–198 |
| 46 | `MotionProvider::Custom Curve::IsLooping::Toggle` | no second argument | :200–202 |
| 47 | `MotionProvider::Custom Curve::Reset` | bool **true**, label `Request sync` | :206–214 |
| 50 | `MotionProvider::Looping Script::Interpolation::Set` | `InterpolationType`, all four values, **Linear** | LoopingScriptMotionProvider.cs:103–106 |
| 51 | `MotionProvider::Pattern::Pattern::Set` | `PatternType`, six values, **Triangle** | PatternMotionProvider.cs:73–76 |
| 52 | `MotionProvider::Random::Octaves::Set` | int **[1, Int32.MaxValue]**, interval 1, **1**, `{0:F0}` | RandomMotionProvider.cs:49–52 |
| 53 | `MotionProvider::Random::Persistence::Set` | double **[.01,double.MaxValue]**, interval .01, **.01** | :56–59 |
| 54 | `MotionProvider::Random::Lacunarity::Set` | double **[.1,2]**, interval .01, **.1** | :63–66 |

Provider-specific setters assign their argument directly; Reset has the explicit sequence below. No Duration integer rounding is specified. Octaves is genuinely Int32, not a rounded double. Its registration has no maximum beyond the argument's type; the bound provider editor's maximum 8 is separate.

Enum numeric order: `InterpolationType` = Linear 0, Pchip 1, Makima 2, Step 3 (`Common/Utils/MathUtils.cs:26–32`); `PatternType` = Triangle 0, Sine 1, DoubleBounce 2, SharpBounce 3, Saw 4, Square 5 (`PatternMotionProvider.cs:11–19`). Exact source enum names should be mapped explicitly to existing OHOS lowercase internal values, without general case folding.

**Action defaults are not provider defaults.** Initial providers use Speed=1, Minimum=0, Maximum=1; Random changes Speed to .3 and has Octaves/Persistence/Lacunarity=1; Custom Curve has Points=[(0,0)], Duration=10, IsLooping=true, SyncOnEnd=true and default Linear interpolation; Looping Script has SourceFile=null and Pchip interpolation; Pattern starts Triangle. In particular Maximum::Set defaults to 0, Custom Duration::Set to 1, IsLooping::Set to false, and Looping Script Interpolation::Set to Linear.

**Null/missing axis behavior differs within the original source.** Manager `GetMotionProvider` returns null for null axis/name. The common template helper (`AbstractMotionProvider.cs:49–50`) then throws `UnreachableException`; provider-specific helpers test for null and do nothing. A non-null unregistered DeviceAxis can fail the manager dictionary index. The portable dispatcher should reject an invalid/missing/disabled target visibly before execution, not deliberately reproduce an exception or accidentally mutate a different axis.

## 4. Motion effects and same-value/order rules

`AbstractMotionProvider.cs:34–43` runs `RequestSync()` **before** `base.OnPropertyChanged(propertyName)` for each notifying property unless `ShouldSyncOnPropertyChanged` excludes it. Sync publishes `SyncRequestMessage(targetAxis)`. `SVM:712–716` handles it with `ResetSync(true, message.Axes)`. `SVM:790–819` changes only SyncTime to SyncSettings.Duration (unless sync bypass); it does not reset motion phase, output Value, axis index, transition, home time, media position, or play/pause state.

| Setter/command | Provider runtime effect beyond configuration |
|---|---|
| Shared Speed / Minimum / Maximum | Changed property requests sync; preserves provider phase/cache/seed. New values are used on a subsequent Update. |
| Random Octaves / Persistence / Lacunarity | Changed property requests sync; retains `_noise` and `_time`. Do not replace the random provider or seed. |
| Pattern Pattern | Changed property requests sync; retains `_time`. |
| Looping Script Interpolation | Changed property requests sync; retains `_time`, `_scriptIndex`, selected Script resource and start/end bounds. |
| Custom Curve InterpolationType | Changed property requests sync; **no provider pending-refresh flag** is set. Existing tiles remain until a separate refresh cause. Formula changes on Update. |
| Custom Curve Duration | Duration plus dependent Viewport notify; both are eligible for base sync. `OnViewportChanged` sets pending refresh. Time is preserved; next Update may reach the new end. Mounted canvas can remove points, separately described below. |
| Custom Curve IsLooping=true transition | Changed property requests sync; `OnIsLoopingChanged` takes `_stateLock` and resumes `_playing=true`. Time/index and provider tiles are not reset. |
| Custom Curve IsLooping=false transition | Changed property requests sync; does not immediately set `_playing=false`, reset phase, or mark tiles dirty. End is handled by a later Update. |
| Custom Curve shortcut Reset(axis, requestSync) | If true, explicitly requests sync **first**; then `ResetState(true)` locks and sets Time=0, index=−1, playing=true. It does not clear Value or rebuild tiles. Works every time even when Time already equals 0 and configuration is unchanged. |
| Custom Curve UI Reset() | `CustomCurveMotionProvider.cs:157` calls only `ResetState(true)`; **no explicit sync**. Do not use a default-sync shortcut bridge to change this UI command. |

`CustomCurveMotionProvider.cs:47–48` excludes Time notifications from sync. Constructor/Reset/end-of-curve Time updates therefore do not acquire a hidden sync just because they notify. `Value` is `[DoNotNotify]` in the base. At nonlooping end, Update calls `ResetState(false)`, optionally requests sync via SyncOnEnd, writes Value=NaN, and returns (`:133–143`). A normal scalar setter must not simulate this endpoint immediately.

Ordinary same-value setter assignments have no new Fody property event, hence no setter-driven sync/control event. Setting a clamped Speed/Minimum/Maximum to its current value also has no new property event. **Explicit commands are different**: Reset and Reload still run even when configuration/state looks unchanged. Collapsing them into “configuration changed?” loses their semantics.

Duration can produce more than one sync request because Viewport is a notifying dependent property. The source establishes the notifications and base ordering; it does not, without woven code/runtime, establish the exact order among Fody dependent callbacks. Coalescing same-axis resets to one final SyncTime write may preserve the numerical state; do not claim event-count equivalence or depend on an invented notification order.

## 5. Loaded WPF effects, including Duration pruning

### Which provider owns a view?

`ScriptView.xaml:937–1161` places the Motion settings in a MaterialDesign PopupBox. Its `ContentControl` at `:1149–1157` uses `s:View.Model` with a MultiBinding of manager, axis Key, and **that axis's SelectedMotionProvider**. `UI/Converters/MotionProviderSelectorConverter.cs:10–18` returns only the matching provider instance. This does not instantiate views for every provider just because all provider models exist.

Axis content uses `NonReloadingTabControl` (`ScriptView.xaml:445`). `UI/Controls/NonReloadingTabControl.cs:30–39` creates presenters for all items on Loaded; `:121–155` retains them and only changes their Visibility. Therefore switching axis tabs is not proof that the old axis has no bindings. PopupBox visual creation and Stylet cached-view lifecycle are third-party behavior not executed here. Neither “only current visible axis can be affected” nor “every provider always has these effects” is established.

### Custom Curve Duration → shared point deletion

The full source path is:

1. Shortcut assigns Duration (`CustomCurveMotionProvider.cs:188–191`).
2. Fody notifies Duration and its dependent Viewport (`:28–34`); `OnViewportChanged` sets refresh (`:60–61`). Base notifications request sync before notifying view subscribers.
3. If a canvas is bound, `MotionProvider/Views/CustomCurveMotionProvider.xaml:136–143` binds the same Points collection and Viewport.
4. `UI/Controls/DraggablePointCanvas.xaml.cs:167–173` receives Viewport's dependency-property change and calls `UpdateViewport`.
5. `:285–300` removes **every** point not contained in the new Rect `(0,0,Duration,1)` from that shared collection, then synchronizes elements. Rect boundaries are included. It does not rescale x positions. Deletion happens even if ActualWidth/ActualHeight is zero; only the subsequent `SynchronizeElementsFromPoints` returns early for zero size (`:303–306`).
6. Collection changes mark the provider's pending refresh (`CustomCurveMotionProvider.cs:70–72`). That collection callback itself does not call RequestSync. With a measured canvas, `:303–353` also orders element positions and writes the collection from them, so UI normalization is not simply the provider's keyframe projection.

The scalar setter alone does **not** prune points. Unconditionally pruning all hidden/unselected providers in a pure shortcut reducer would be wrong. The existing OHOS MotionConfiguration explicitly permits x positions outside Duration, including negative x, and preserves order/duplicates. Recommended minimal API: keep pure provider parameters/points intact; document that loaded-WPF-canvas normalization is not simulated, or model it as a distinct view-attached effect with explicit lifecycle evidence. Do not silently advertise complete loaded-view equivalence for Duration.

Custom interpolation/looping update the canvas preview (`DraggablePointCanvas.xaml.cs:127–153` calls `RefreshLine`) without mutating Points or setting the **provider's** pending-refresh flag. Preview tiles and provider runtime tiles are separate caches. Rebuilding provider tiles on every interpolation/looping change would erase a real source distinction.

### MahApps control constraints

- All four provider views bind Minimum/Maximum two-way to a RangeSlider with Minimum=0, Maximum=1, **MinRange=.01**. They can introduce control coercion/write-back that the two independent scalar callbacks do not specify. Exact lower-vs-upper coercion order was not verified because MahApps runtime/source is not present locally; do not invent it or describe arbitrary reversed-range behavior as loaded-UI proven.
- Random provider editor `RandomMotionProvider.xaml:91–99` has **Octaves maximum 8**, unlike the shortcut registration's Int32 maximum. A bound NumericUpDown can affect an out-of-editor-range model value. The source registration itself remains 1..Int32.MaxValue.
- Custom Duration editor has bounds 1..60 (`CustomCurveMotionProvider.xaml:38–42`), Speed editors minimum .01, Persistence minimum .01, and Lacunarity .1..2. Fraction display formats/intervals are not proof of quantization.
- These are reasons to label the portable contract carefully, not reasons to coerce every hidden provider as though its control were attached.

## 6. Internal::Playlist::PlayByName

The sole concrete action is `Internal::Playlist::PlayByName` (`Internal:19,444–453`). Argument: `string name`, label `File name/path`, default **null**, no numeric bounds or selectable source list.

Ordering and matching:

1. `WhenConnected` requires **Status exactly Connected** (`:416–420`), not Connecting/Disconnecting and not merely a nonempty playlist.
2. Capture current ScriptPlaylist; null returns with no operation.
3. `Playlist.FindIndex(string)` (`:583,587–588`) returns the **first** item for which `Name == name OR FullName == name`, both `StringComparison.OrdinalIgnoreCase`. It does not prefer a later full-path match over an earlier filename match. It does not trim, do substring matching, use basename-without-extension, normalize a supplied path, or use locale-sensitive casing. Null does not match a real FileInfo Name/FullName. Empty/missing text ordinarily gives no match.
4. If found, enqueue `PlayScriptAtIndexMessage(index)`; the action does not load a path or create a new playlist. A typed path is only a lookup string into the existing playlist.
5. The source's 100 ms loop drains messages under `_playlistLock` (`:76–105`). At execution it validates/refreshed-checks that index's current item; only an existing item reaches PlayIndex. Selection is index-based after lookup, so a concurrently mutated playlist is a distinct source race; do not claim snapshot-item identity.
6. `PlayIndex` (`:221–245`) selecting the **same PlaylistItem reference** sets PlaylistIndex then `SetPosition(0, forceSeek:true)`. It does not reload script resources. Selecting a different item sets PlaylistIndex then SetCurrentItem.
7. Successful SetCurrentItem (`:285–326`) loads selected scripts, then SetDuration, SetPosition(0,true), and ChangeScriptMessage including nulls for unfilled axes. No successful path calls SetIsPlaying(true). Existing playing/paused state and speed are preserved. Invalid content can ResetState and publish MediaReset; do not report that as successful playback.

Use the existing OHOS trusted-catalog/Internal selection transaction, including existence/content checks, source revision, cancellation and seek gates. Match catalog display filename/full trusted reference with the already-pinned .NET OrdinalIgnoreCase helper; JavaScript locale/full `toUpperCase()` is not a substitute. Do not treat text matching as permission to access an arbitrary path. Missing result should be a visible no-op/error, not fallback to the first playlist item or an implicit Connect.

## 7. Shortcut::Enabled::Set / Toggle

`UI/Controls/ViewModels/ShortcutSettingsViewModel.cs:273–290`:

- Set arguments: `string shortcutName` (`Target shortcut name`, default null), `bool enabled` (`Enabled`, default **false**).
- Toggle argument: the same string only.
- Resolve with `Shortcuts.FirstOrDefault(x => string.Equals(x.Name, shortcutName, StringComparison.Ordinal))`. **Case-sensitive ordinal, exact and first-match**. Duplicated names affect only the first. Missing name does nothing. `AbstractShortcut.Name` defaults null (`Shortcut/IShortcut.cs:44`), so null can deliberately match the first unnamed original shortcut; null and empty are not interchangeable.
- Original names are not IDs. A portable UI may offer existing names, but must retain exact stored string/first-match semantics and show missing/duplicate ambiguity rather than silently choosing another mapping. OHOS's bounded nonempty text policy, if retained, excludes the original unnamed/null case and should be documented.

### Setter → binding → scheduling chain

`AbstractShortcut` has `[AddINotifyPropertyChangedInterface]`; Enabled is an auto-property initialized true (`IShortcut.cs:33–51`). There is **no OnEnabledChanged handler**. The settings view ToggleButton binds IsChecked to Enabled (`ShortcutSettingsView.xaml:905–918`) and has style tooltip triggers, but no Checked/Unchecked handler that cancels work.

`IShortcut.Update` (`IShortcut.cs:128–135`) checks Enabled only before accepting a new matching gesture. Once accepted:

- `Invoke` (`:56–69`) checks data/configuration count/in-flight scheduling, **not Enabled**, and schedules the whole configuration sequence.
- `ShortcutActionRunner.cs:44–49,138–151` consumes that sequence in order and awaits each action; it does not consult the shortcut's later Enabled value between actions. Self-disable does not cancel remaining actions in its current batch.
- `DelayCallback` (`IShortcut.cs:110–114`) and `RepeatCallback` (`:116–124`) execute their callback under SyncRoot without checking Enabled.
- Hold WhileHolding schedules Delay at press; a later release cancels it **only if the release is delivered through Update** (`ButtonHoldShortcut.cs:16–43`). Disabling before release suppresses that release and can leave its existing timer running.
- Click's delayed action similarly survives Enabled=false (`ButtonClickShortcut.cs:16–38`). Press/release shortcut state is also not reset by Enabled changes.
- Only the explicit cancellation/disposal paths cancel these timers/repeats (`IShortcut.cs:91–105,137–148`). Disabling is not disposal or global shortcut-engine reset.

Therefore do not implement Enabled via a generic `setConfiguration` path that resets all dispatches. Change only the first resolved mapping's enabled flag, preserve the current batch and unrelated gesture state, and retain independently authorized OHOS Stop/F12/focus/capture/background/source/profile cancellation. If OHOS intentionally cancels a disabled mapping's pending hold/click for safety, disclose that difference; it is not the C# setter behavior. A same-value Set is a no-change property operation, while Toggle always flips the resolved target.

## 8. Axis::ReloadScript / LinkAxis / LinkPriority

### Registration and same-value behavior

| Original index | Action | Arguments/defaults | Explicit callback |
|---|---|---|---|
| 136 | `Axis::ReloadScript` | DeviceAxis target, default null | Null no-op; otherwise `OnAxisReload(axis)` → `ReloadAxes(axis)` (`SVM:1710–1711,1208`). |
| 147 | `Axis::LinkAxis::Set` | DeviceAxis source, DeviceAxis target, both default null | Reject null source or source==target; assign LinkAxis; **always ReloadAxes(source)** even if assignment equals existing target (`:1784–1794`). Null target clears link. |
| 140 | `Axis::LinkPriority::Set` | DeviceAxis target default null; bool default false | Generic UpdateSettings setter only (`:1732–1735`). |
| 141 | `Axis::LinkPriority::Toggle` | DeviceAxis target default null | Generic UpdateSettings toggle only (`:1737–1738`). |

`OnAxisSettingsPropertyChanged` (`SVM:1133–1153`) does not handle LinkAxis or LinkAxisHasPriority. The loaded view matters:

- `ScriptView.xaml:899–905` binds LinkAxis to ComboBox SelectedItem with `OnSelectedLinkAxisChanged`. A changed bound selection invokes the handler (`SVM:1249–1276`), which checks cycles by walking the new target chain, rolls back to the removed item/null if circular, then ReloadAxes. Programmatic changes are not excluded.
- `ScriptView.xaml:908–913` binds LinkAxisHasPriority and invokes `OnLinkAxisPriorityChanged` on both Checked and Unchecked. The handler (`SVM:1239–1246`) ReloadAxes. Same-value setter assignments do not change the checked state and should not invent this event.
- LinkAxis::Set has both its explicit reload and a possible loaded-view event reload; do not remove the explicit same-value reload when coalescing effects. Rollback/reentrant view events may add calls; exact count/order is WPF scheduling-dependent and was not executed here.
- The callback itself only rejects self-links, not a multi-axis cycle. Cycle prevention comes from the loaded ComboBox handler. OHOS should validate the complete graph regardless of view lifetime rather than permit recursion; document this deterministic safety boundary.

### Reload ordering and lock behavior

`ReloadAxes` (`SVM:932–953`) does this in order:

1. Normalize null axis collection to all axes; empty collection returns.
2. **ResetSync(true, requested axes) immediately**, before resource search and regardless of eventual resource identity, missing match, or lock.
3. Partition requested axes into link-priority and non-priority.
4. Begin search for **non-priority axes** against current MediaResource.
5. In completion callback, first `UpdateLinkScriptFor(nonPriority.Except(found.Keys))`.
6. Then call SetScript for each found (axis,resource).
7. Finally `UpdateLinkScriptFor(linkPriority)`.

`ScriptRepositoryManager.cs:40–48` publishes PreScriptSearch synchronously, does async search/callback, then PostScriptSearch. Null MediaResource yields an empty result (`:51–55`), but callback still performs fallback links. No `force` flag exists in this original command and it never disables LockScript. Do not invoke a portable `force=true` path that bypasses locks or overwrites resource identity merely because the user requested reload.

`UpdateLinkScriptFor` (`SVM:842–865`) is eligible only if link has priority, current script is null, or current script is already a LinkedScriptResource. Thus a non-priority **ordinary existing script survives a search miss**. Eligible null LinkAxis resets via SetScript(null); eligible non-null LinkAxis wraps the target's script. A target with no script produces null.

`SetScript` (`SVM:886–918`) ordering:

1. If LockScript **and current script non-null**, reject **every** replacement/clear, even same reference. Lock with current null still permits first load.
2. Null→null returns. Same `IScriptResource` reference returns. `model.Script` and argument are interface-typed; this is **reference identity**, not ScriptResource record equality or equal content/hash.
3. For a true replacement, in the state update scope optionally reset sync when SyncOnScriptResourceChanged, always invalidate axis Index, then assign model.Script.
4. Publish ScriptChangedMessage, then recursively update axes linked to this axis, each through the same lock/eligibility/identity checks.

`Script/IScriptResource.cs:18,31–35` creates a **new LinkedScriptResource wrapper every LinkTo(non-null)**. Equal content can therefore still be a true replacement with invalidation, sync, event and propagation. Null LinkTo returns null. Do not substitute content equality for source resource identity. Also do not force every reload to be a replacement if the resolver returns the very same original resource object.

Repeated explicit Reload must preserve command-level ResetSync even if a lock blocks replacement or identity is unchanged. This does not require cold-resetting provider phase, axis output, transitions or media. A following Sync::Cancel in an ordered batch must not be undone by a delayed, duplicate configuration-adoption effect. Resource completion that legitimately changes identity has its own source-defined SyncOnScriptResourceChanged effect and must be distinguished from a spurious deferred reset.

## 9. Implementable API split and acceptance cases

Recommended separation:

1. A strict Motion action parser resolves provider ID from the concrete action name and target axis from the captured dispatch context; a pure reducer clones the named provider config, validates only that action's arguments, and returns changed fields plus an explicit command effect for Reset. It does not select a provider, pause, arm, load an arbitrary path, or reconstruct unrelated providers.
2. A session Motion setter adopts the changed named provider in place and requests target-axis sync on real notifying property changes. Preserve phase/seed/value cache; keep Custom duration refresh, interpolation/looping non-refresh, and looping-true resume distinctions. Expose `resetCustomCurve(axis, requestSync)` so shortcut defaults true and UI still passes false; request sync before reset, including repeated zero-time calls.
3. Keep pure Duration reduction independent of a separately modeled UI-attached canvas effect. State clearly whether loaded-view point pruning/RangeSlider coercion/Octaves editor coercion is unsupported. Do not present a source-only inference as an executed Windows oracle.
4. A shortcut enabled command resolves first exact ordinal name and updates only its enabled flag; do not call the engine-wide configuration-reset API. Existing lifecycle cancellation remains separate.
5. PlayByName resolves first pinned OrdinalIgnoreCase match in the existing managed playlist and enters the existing index selection transaction; preserves paused/playing state and uses explicit command restart behavior for the current item.
6. Reload is a command even for an unchanged config: sync now, resolve under existing resource limits, obey lock, compare identity, propagate links. Keep UI-dependent LinkPriority/LinkAxis behavior explicit rather than relying on nonexistent ArkUI/WPF event equivalence.

Minimum focused tests: all 34 Motion concrete names; named-provider edits while another is selected; provider applicability rejection; all action defaults versus provider defaults; finite-range/integer/enum rejection; same-value Set versus repeated Reset; Reset(false) preserving canceled sync; Reset(true) then Cancel ordering; phase/seed/cache preservation; Custom ended→IsLooping(true) resume; Duration does not universally prune hidden points; interpolation/looping does not rebuild provider tiles; first duplicate/case/null/empty shortcut-name behavior; self-disable preserving current batch; pending hold/click behavior versus independent Stop/focus cancellation; PlayByName first filename/full-reference match, exact .NET case behavior, missing item and same-item restart; Reload locked/nonlocked-empty/same-reference/new-equal-content/new-link-wrapper; non-priority ordinary script surviving a search miss; null link and cycle rejection; LinkAxis same-value reload and LinkPriority same-value no new bound-control event.

This document and its companion ledger do not certify completion of those OHOS implementations or tests. They provide the source contract and explicit boundaries against which the implementation should be reviewed.

## 10. Current 0.14 candidate coverage cross-check

The current runtime-evaluated catalog contains 150 unique actions: 146 original concrete names and four OHOS additions. They map to 128 of the 188 original registration templates. The complete conservative ledger is [ACTION_COVERAGE_014.md](ACTION_COVERAGE_014.md), with per-template `coverage014Templates` in the companion JSON. Current counts are 107 full within the declared portable contract, 21 partial, and 60 unwired. These are implementation coverage categories; separate final local validation appears in VALIDATION.md, without WPF/device parity claims.

The new host Reload/Link route now rescans the same authorized Download root and reads fresh resources through a begin/complete/cancel transaction; the old cached-only host deficiency is resolved. The four templates remain partial because the original arbitrary local/external repository scope is unavailable. Reload now treats incomplete/error-bearing scans and actual read/parse/ZIP failures as failed transactions: old bindings stay, the transaction epoch is canceled and output is disarmed. A genuine complete-search no-match can retain an ordinary resource with an explicit zero-result status. Initial source-open candidate-skipping behavior is unchanged. Known loaded-WPF gaps remain partial: all four shared Minimum/Maximum Set/Offset templates, Custom Curve Duration point pruning, and Random Octaves editor coercion/runtime budget. Named playlist and Enabled commands retain their bounded string/managed-name-domain disclosures.

Stage-1 independent Motion/Enabled/PlayByName checks passed 44 authored cases and 82 existing focused cases at their recorded source snapshot. Managed Reload/Link independent review subsequently passed44 authored cases and59 focused checks, and44stage-1 cases were rerun. Final1731/1731 actual-.NET aggregate and official clean SDK HAP passed with111stable production inputs. Windows UI and device verification remain unclaimed; archive manifests identify the exact candidate.
