# 0.15 structured points, manual axis value, and gap-skip source audit

Audit date: 2026-10-16. This is a source-chain audit, not a Windows/WPF execution or an implementation-completion claim. This task changed only this document, its companion `ohos/tools/reference/action-coverage-015-source.json`, and the isolated SkipGap oracle/test files described in section 9; production files were not edited. No Git operation, network/device connection, or File-output behavior review was performed.

## 1. Evidence, denominator, and scope

The original C# source is `Source/MultiFunPlayer`, identified by the existing reference manifest as upstream `36c08fbb99ac9398a63ff1cca1bbf68cd2228a94`. No Git command was used to establish this identifier. Files were read and byte-compared against the frozen `../mfp-release-artifacts/0.14.0-1c0a8d3a333ddb69/source`. The companion records SHA-256 values and comparison outcomes.

The original denominator remains **188 literal built-in registration call sites**. A fresh source scan matches all 188 distinct path/line entries of `ohos/tools/reference/action-coverage-013.json`; all 188 saved registration texts and source-file hashes were checked. The companion preserves all original registration/callback evidence, without importing that older ledger's 0.12/0.13 coverage classifications as current coverage.

This slice is exactly **five original templates and five concrete names**, with no runtime family expansion:

| Original index | Concrete name | Registration |
|---|---|---|
| 48 | `MotionProvider::Custom Curve::Points::Set` | `MotionProvider/ViewModels/CustomCurveMotionProvider.cs:217–227` |
| 115 | `Script::SkipGap` | `UI/Controls/ViewModels/ScriptViewModel.cs:1594–1597` |
| 116 | `Axis::Value::Offset` | same file, `1601–1605` |
| 117 | `Axis::Value::Set` | same file, `1607–1611` |
| 146 | `Axis::SmartLimitPoints::Set` | same file, `1775–1780` |

`Axis::Value::Drive` is a separate sixth registration and is **not** part of this scope. A button's stored number is not `IAxisInputGestureData`. Existing `SkipToScriptStart`, curve editing, or an internal transition primitive is not evidence of an exposed shortcut.

Path shorthand: `SVM` = `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs`; `Curve` = `Source/MultiFunPlayer/MotionProvider/ViewModels/CustomCurveMotionProvider.cs`; `Canvas` = `Source/MultiFunPlayer/UI/Controls/DraggablePointCanvas.xaml.cs`; other original relative paths below start under `Source/MultiFunPlayer`.

## 2. Three distinct validation/effect contracts

1. **Configuration metadata.** `Shortcut/IShortcutSettingBuilder.cs:37–74,90–100` applies `default(T)`/the explicit default, then numeric-template coercion. `IShortcutSettingTemplateContext.cs:16–22` clamps numeric values but does not quantize to Interval. `IShortcutActionConfiguration.cs:54–81` applies that template coercion when populating saved typed values. ItemsSource does not choose its first item.
2. **Typed invocation.** `IShortcutAction.cs:44–52,80–101` checks argument types/count only. It does not validate finite doubles, enum membership, point order/count/domain, or nested DTO fields. The two point arguments have custom templates and no numeric template context; nested Custom Curve Duration is not automatically clamped on deserialization by the outer shortcut setting.
3. **Bound controls.** Loaded, measured controls can sort/write back points; Duration's viewport change can delete points. The action editor's NumericUpDown bounds do not prove every headless/deserialized callback obeys those bounds.

The project enables PropertyChanged.Fody (`FodyWeavers.xml`, `MultiFunPlayer.csproj`). Source-described `On<Property>Changed` and dependent-property notifications below assume the default weaving used by that project. This audit did not execute/disassemble a woven assembly. Same-value ordinary setters are expected to suppress notification under that weaving; explicit collection `SetFrom` is different and always calls Refresh. Exact Fody dependent-callback order, third-party binding coercion, dispatcher races, cached-popup creation, and notification counts remain unexecuted.

Strict finite/bounded JSON rejection is appropriate for the portable input boundary, but must be identified as that boundary rather than a restriction present in every original callback. Validate an entire argument before mutating runtime state; reject derived arithmetic overflow too. Do not emulate malformed typed-call exceptions or non-finite propagation just for nominal parity.

## 3. Original argument defaults and applicability

| Action | Argument defaults / editor domain | Direct callback |
|---|---|---|
| Custom Curve Points Set | target `DeviceAxis=null`; a fresh `PointsActionSettingsViewModel`: Points `[(0.5,0.5)]`, Duration `1` second, InterpolationType `Linear`. Custom editor Duration 1–60; point viewport `(0,0,Duration,1)`. | Get **Custom Curve on that axis**; if provider exists: Duration, InterpolationType, existing Points.SetFrom, in that order. |
| SmartLimitPoints Set | target `DeviceAxis=null`; Points `[(50,50)]`, percent x/y. SmartLimitPreview's canvas viewport is the default `(0,0,100,100)`. | If axis is non-null: existing `AxisSettings[axis].SmartLimitPoints.SetFrom(points)`. |
| Axis Value Offset | target null; offset `0`, declared −1..1, interval .01; duration `0`, declared 0..double.MaxValue, interval 1 second. | `SetAxisTransition(axis, offset, duration, offset:true)`. |
| Axis Value Set | target null; value `0`, declared 0..1, interval .01; duration `0`, declared 0..double.MaxValue, interval 1 second. | `SetAxisTransition(axis, value, duration)`. |
| Script SkipGap | target null, described as all scripts; minimum skip `2` seconds, declared 0..double.MaxValue, interval 1. | `SkipGap(minimumSkip, axis)`, whose implementation ignores the chosen axis after the nonempty check. |

These are action defaults, not provider/axis defaults. Custom Curve initially has Points `[(0,0)]`, Duration 10, IsLooping=true and SyncOnEnd=true. SmartLimitPoints initially has `[(25,100),(90,0)]` (`SVM:2350–2354`). Interpolation enum order is Linear, Pchip, Makima, Step (`Common/Utils/MathUtils.cs:26–32`).

The manager owns all four provider instances per configured axis (`MotionProvider/IMotionProviderManager.cs:38–60`). A Custom Curve action changes that provider even if another provider is selected. All five actions ignore the script-lock setting; lock only blocks eligible script-resource replacement (`SVM:886–909`). A null axis is a no-op for the two manual actions and SmartLimitPoints. Custom Curve's specific helper is also a no-op if its lookup returns null. Invalid non-null dictionary keys may throw; a portable adapter should visibly reject absent/disabled targets instead of retargeting them.

## 4. Collection identity and the entire point-control chain

### 4.1 SetFrom is not property replacement

`Common/ObservableConcurrentCollection.cs:39–49,90–100` takes its collection lock, clears its internal list, enumerates/adds all supplied points in their supplied order, releases the lock, then calls `Refresh`. Refresh sends a Reset CollectionChanged event through the collection's captured SynchronizationContext using `Send`, followed by Count and Item[] property notifications.

Consequences:

- The **destination collection object is retained**. The argument collection object is not installed into the provider/settings. Point values are structs copied into the list.
- Equal content and an already-empty target still produce Reset; there is no content-equality early return.
- The headless method neither sorts nor deduplicates nor clamps points, and imposes no point-count limit.
- A direct self-alias call (`destination.SetFrom(destination)`) clears the list before enumeration, yielding empty content. Do not introduce that alias with a portable DTO; copy arguments before commit.
- Null/malformed typed input is not validated here and can throw after a clear. Portable prevalidation should avoid partial mutation.
- The lock protects the list replacement, not the whole three-property Custom Curve action or a global pipeline transaction. Individual Count/index reads and canvas callbacks are not proof of an atomic cross-thread snapshot.

### 4.2 Custom Curve callback, subscriptions, and refresh

The callback at `Curve:217–227` is precisely:

1. `p.Duration = vm.Duration`.
2. `p.InterpolationType = vm.InterpolationType`.
3. `p.Points.SetFrom(vm.Points)`.

Duration is an auto-property and Viewport depends on Duration (`Curve:28–34`). Duration changes can notify both properties; `OnViewportChanged` marks `_pendingRefreshFlag` (`:60–61`). Interpolation change does not itself mark the provider's keyframe cache dirty. `AbstractMotionProvider.cs:34–43` requests sync before dispatching each eligible property notification; `Curve:47–48` excludes only Time.

The Points property change handler (`Curve:50–58`) removes the old collection subscription, attaches the new one and marks pending refresh. **The shortcut retains the collection, so this property-replacement hook is not its path.** Instead the already-installed `OnPointsCollectionChanged` handler (`:70–72`) marks pending refresh with Interlocked.Exchange. This handler does **not** request sync or notify the provider's Points property. Thus:

- Point-only changes request no sync.
- Equal scalar values plus equal points still force a refresh, with no setter-driven sync.
- Changed Duration and/or InterpolationType request sync through their scalar/dependent notifications; exact event count is not established here.
- The callback does not reset Time, `_index`, `_playing`, output Value, Minimum/Maximum, Speed, IsLooping, SyncOnEnd, axis index, media position, play/pause, or the transition.
- An explicit shortcut Reset is a different action. Do not call it as a convenience for Points Set.

`SVM:712–716,790–819` handles provider SyncRequest by setting only SyncTime to configured Duration, unless sync bypass is enabled. No phase/clock/manual transition reset is implied.

`Curve:74–155` consumes pending refresh during a later provider Update. Empty/null Points return immediately, retaining the old Value/time/playing state and leaving the pending flag for a later nonempty update. Nonempty points rebuild `_keyframes`; `_index` is searched at the existing Time only when playing. A stopped nonlooping curve does not resume just because points changed. Existing update gates still apply: provider selected, not bypassed, pause setting, script/gap eligibility and follow-axis dirty/home conditions (`SVM:243–302`). Changing points does not bypass these gates or fabricate a fresh provider sample.

When rebuilding, `KeyframeCollection.Add` sorts by x and retains the **first inserted value at an exactly duplicate x** (`Common/KeyframeCollection.cs:13–25`). This is a separate internal projection, not a rewrite of the original Points list. Tiling uses original list first/last subsets before insertion. Nonlooping endpoints are inserted left-first and right-last; an existing point at x=0 can therefore lose to the synthesized left endpoint. Keeping list order/duplicates matters. At a later normal endpoint, the original reset/end/optional-sync/NaN-write behavior still occurs; Points Set does not trigger it immediately.

An equal Points Set can be semantically observable after an earlier interpolation/looping change: it forces the previously unrefreshed tiled cache to be rebuilt with the current mode. Content-equality optimization would lose this.

### 4.3 Loaded Custom Curve canvas and shortcut argument editor

The provider view binds its same Points collection, Duration-derived Viewport, InterpolationType, IsLooping and Time (`MotionProvider/Views/CustomCurveMotionProvider.xaml:136–143`). A bound viewport dependency-property change calls `Canvas:167–173` → UpdateViewport (`:285–300`): every point outside the new Rect is removed from the **shared model collection**; it is not rescaled. This removal happens even before a measured-size check. Bounds include the rectangle edges.

Points Reset reaches `OnPointsCollectionChanged` (`Canvas:176–184`) → SynchronizeElementsFromPoints (`:303–323`). A zero ActualWidth or ActualHeight returns without normalizing. Otherwise it sorts points by x into elements, then SynchronizePointsFromElements (`:325–354`) orders element x coordinates and writes each point back through the collection indexer. Each write notifies, even if the coordinate is unchanged. Conversion round-trips use measured dimensions (`:477–483`), so exact floating-point bit identity is not guaranteed. Equal x points remain; there is no deduplication here. Ordinary Points Reset does not itself call UpdateViewport and therefore does not independently prune every out-of-range incoming point. Coordinate conversion does not clamp them. Dragging clamps pixel positions (`:248–259`), which is yet another path.

Duration is assigned before incoming points. A mounted provider canvas may first prune/reorder its *old* points during the viewport change, followed by incoming `SetFrom` and another sort/write-back. Final results depend on binding notification timing; do not infer that all new points are unconditionally pruned against the new duration. Interpolation/tiling dependency changes refresh the canvas preview but do not dirty the provider cache themselves.

The shortcut configuration editor separately binds `Value.Points`, `Value.Viewport` and `Value.InterpolationType`, with a 1–60 Duration editor (`UI/Dialogs/Views/ShortcutActionConfigurationDialog.xaml:81–112`). `PointsActionSettingsViewModel` subscribes to its own collection and forwards Points PropertyChanged (`Curve:249–281`); `ShortcutActionConfiguration` subscribes to the argument's property events (`IShortcutActionConfiguration.cs:45–50`). This updates the action representation, not the runtime provider's phase. Editing a live argument collection and copying it into a provider remain distinct operations.

View presence is conditional. `ScriptView.xaml:1149–1157` resolves the provider view from the selected provider, while `NonReloadingTabControl.cs` retains axis content presenters. Hidden tabs are not proof of no bindings; having a provider instance is not proof that its canvas is mounted/measured. Popup/Stylet/WPF lifecycle was not executed. A portable headless point command should preserve these distinctions and explicitly disclose unsimulated loaded-canvas normalization.

### 4.4 SmartLimitPoints callback and loaded preview

`SVM:1775–1780` calls SetFrom on the existing Settings.SmartLimitPoints. No custom subscription forwards its collection changes to AxisSettings.PropertyChanged. Even a Points property replacement would not match the reset-sync switch in `SVM:1133–1152`. Therefore no command-driven ResetSync, auto-home reset, phase reset, index invalidation, script reload, or play/pause/clock change is specified.

A mounted `ScriptView.xaml:1199–1202` binds SmartLimitPreview to the same collection. The shortcut argument template does the same to its own collection (`ShortcutActionConfigurationDialog.xaml:76–79`). `UI/Controls/SmartLimitPreview.xaml` embeds DraggablePointCanvas with default viewport 100×100, so measured canvas Reset follows the sort/coordinate-write-back chain above. It does not imply strict x uniqueness. The preview's Input animation changes its displayed Output (`SmartLimitPreview.xaml.cs:55–79`); it does not write settings or output hardware.

On the next pipeline calculation, `SVM:447–474` reads the current list directly. If no input axis, nonfinite current output/input, or zero points, it skips the limiter. It uses previous committed input-axis Value ×100, `Interpolation.Linear(points,x)/100`, then applies Value mode or fourth-power Speed mode and clamps the resulting axis value. `Common/Utils/MathUtils.cs:132–145` scans list order; it does not sort/deduplicate. One point yields a constant factor. Empty points disable this stage. Points-only edits do not reset the speed/home/sync accumulators.

## 5. Exact manual-value transition lifecycle

### 5.1 Invocation and ownership

`SVM:1216–1236` returns on null axis, then takes that AxisState's update lock. It obtains the **existing** ExternalTransition (`SVM:2153`). There is no AxisSettings setter or WPF slider-driven callback in this route.

- Absolute Set always restarts a transition. Starting value is the raw finite `state.Value`, otherwise the axis default. Target is Clamp01(value).
- Offset on an initialized, unfinished transition calls `Append(offset,duration)`.
- Otherwise Offset starts from finite raw state.Value/default and targets Clamp01(from+offset).
- This command does not sample the pipeline, set State.Value immediately, request sync, alter auto-home counters, select/bypass a provider, bypass a script, unlock a script, or change media position/playback speed/play/pause.
- The starting value is the current **post-processing internal axis value**, not the old transition's raw target, and not the clamped public `GetValue` accessor.

### 5.2 Set, Append, first tick and completion

The source type is wholly defined at `SVM:2185–2238`:

- Set records initialized=true, current=from, from, to, duration and **time=−1**.
- Append records from=current interpolated transition value; adds offset to the old target **without Clamp01**; computes new duration as old duration + requested duration − old time; resets time=−1. Before the first tick old time is −1, so an append adds requested duration **plus one second**. Preserve this source quirk; do not silently substitute zero elapsed.
- Update returns NaN when not initialized or already finished. First update uses deltaTime directly instead of adding it to −1. Later updates accumulate deltaTime.
- When the update crosses the duration, it clears initialized and returns the exact target for that one update. It does not update the private current field on that endpoint branch. A subsequent update returns NaN.
- Otherwise it linearly interpolates with Clamp01(time/duration) and stores current. There is no easing and no media-speed multiplier.
- Zero duration Set emits its target on the first Update, including deltaTime=0. Set alone does not emit it.
- New absolute Set replaces the old transition; active Offset extends it. Identical requests are commands and must not be discarded because serialized values match.

Source callbacks permit pathological nonfinite/negative direct typed inputs. The declared editor domain is finite 0+ duration; the portable boundary should reject invalid inputs and finite-input arithmetic overflow in Append before mutation. Do not add an undocumented small duration cap. Raw appended target may exceed [0,1]; source public `GetValue` clamps (`SVM:752–753`). Sync, home, smart limit and speed limit can also clamp the internal value, but there is no unconditional final clamp in ApplyValues. An output-facing clamp must not feed back and rewrite the transition's raw state.

### 5.3 Advance, application gates, pause, locks and post-processing

The update loop uses stopwatch wall delta, even when media is paused (`SVM:120–177`). Only media-position advancement is multiplied by PlaybackSpeed. UpdateTransition runs regardless of IsPlaying or LockScript, and does not check script/provider availability. **BypassTransition skips Update and freezes elapsed transition time** (`:305–311`). A transition can otherwise run to completion invisibly while a script or provider wins.

The transition value replaces the candidate output only when finite and both clauses are true (`SVM:373–376`):

- `BypassScript || context.Invalid`
- `BypassMotionProvider || SelectedMotionProvider == null`

BeforeScript and AfterScript are distinct from Invalid (`SVM:2143–2160`). Do not replace this test with “no interpolated script sample” or “outside script.” A selected but stale/paused/unknown provider still blocks manual output unless its bypass is on. Merely having an inactive transition does not enable a manual override.

The full calculation order is: prior Value → script → motion provider → eligible transition → auto-home → sync → smart limit → speed limit (`SVM:315–335`). Auto-home eligibility is calculated before ApplyValues; transition dirtiness suppresses auto-home only when context.Invalid **and SelectedMotionProvider is null** (`:394–405`), without considering the bypass flags. Thus a manual transition can still be affected by existing home state in other gate combinations. Do not unconditionally reset or suspend auto-home as part of the manual command.

At end of update, the pipeline commits values and speed (`SVM:2288–2320`). Once the transition returns NaN, final calculation starts from last Value; the value is held if nothing else replaces it, until home/other stages modify it. Completion is not automatically a return-to-default command. All axis states are locked by BeginUpdate before the calculation loop and unlocked at EndUpdate. SetAxisTransition uses the same axis lock. This is synchronization ownership, not the separate user-facing LockScript switch.

State.Value and TransitionValue are DoNotNotify properties. The 60 Hz UI path manually notifies Value/InsideScript only while values content is shown (`SVM:509–517,2174–2178`). The displayed progress bar is **one-way** (`ScriptView.xaml:1639–1645`); its display range does not clamp the model or generate another SetAxisTransition. There is no source WPF slider write-back to emulate for these two callbacks.

A portable session command must retain existing foreground/epoch/fault/profile/output-arm/Stop rules. Those are OHOS safety policy, not implicit original transition semantics. It must not persist elapsed transitions, auto-arm output, synthesize a media clock, or reset provider/runtime state to make a manual value visible.

## 6. Exact Script::SkipGap semantics

### 6.1 Axis filter and current bindings

`SVM:955–985` takes axes, defaults a null enumerable to DeviceAxis.All, and returns if the enumerable is empty. It then computes candidates from **AxisKeyframes.Keys**, not axes. The action's null DeviceAxis is passed as a one-element params array containing null, which is nonempty; no null key is dereferenced because that array is not used in candidate selection. A specified axis likewise does not restrict selection.

AxisKeyframes is a view of each AxisModel's **current Script.Keyframes**, updated through Script property notifications (`SVM:102–106`). It is not the import catalog, a saved file path or an unbound source. Linked resources expose the same keyframe collection (`Script/IScriptResource.cs:18,31–34`), but each axis has its own current index/offset. Locked and BypassScript axes are not filtered. A bypassed axis's index may be stale; this is not a reason in the original to discard its candidate. Portable profile filtering should use current active registry bindings and state, not disabled stored configurations or stale dispatch references.

### 6.2 Per-axis candidate

For each axis:

1. Null keyframes → null candidate.
2. Start index = current state.Index when InsideScript; otherwise **0** (including Invalid, BeforeScript and AfterScript).
3. `KeyframeCollection.SkipGap(startIndex)` requires a valid start **and following point**, otherwise −1 (`Common/KeyframeCollection.cs:87–96`). Empty and singleton scripts contribute nothing.
4. It advances while `abs(next.Value−prev.Value) < .001 OR abs(next.Position−prev.Position) < .001` (`:123–132`). Both thresholds are strict; this is not only an equal-value test and not an AND.
5. If it did not advance and state.InsideScript is true → null candidate. Otherwise, if returned index is valid → that point's raw Position.

Therefore a Before/Invalid/After axis whose first pair is not a gap can contribute its first keyframe time. An inside axis at a non-gap contributes nothing; the algorithm does not search ahead for a later gap. An all-flat sequence returns the last point. Current Index is consumed as-is, not recomputed from the latest media position within the command. Actual script update/index calculation uses MediaPosition−GlobalOffset−AxisOffset (`SVM:195,752`), so offsets can affect the **index**, while the returned skip coordinate has no compensating offset added.

### 6.3 Minimum selection and seek

Take the minimum candidate with null treated as +infinity. Only **after** choosing that minimum, capture MediaPosition and reject if no candidate, currentPosition >= candidate, or candidate−currentPosition <= minimumSkip (`SVM:980–985`). The minimum must be strictly ahead and strictly more than the threshold. A past or too-close candidate blocks all later candidates; do not first filter for future/large-enough candidates. Minimum skip is the distance from current media position to the selected target, not the gap's full segment duration.

The command compares and seeks the **raw script seconds**. It adds neither GlobalOffset nor axis offset and does not use the auto-skip-to-start offset. This is a source quirk, not a corrected-time interpretation. `SeekMediaToTime` (`SVM:1046–1051`) requires finite MediaDuration and target, clamps target to [0,MediaDuration], then publishes MediaSeekMessage. It does not directly mutate position, index, sync, IsPlaying, speed or transition. A target beyond finite duration is clamped to the end after the minimum-distance test; there is no second threshold check after clamping.

The original has no explicit finite-current-position check here: NaN comparisons are false, so a finite candidate may publish a seek if duration is finite. No explicit connected/source-ready/IsPlaying gate exists in this method. Negative duration or malformed nonfinite arguments are not a supported portable input domain. An OHOS finite clock/source readiness gate is a deliberate safety restriction, not a source guard.

For Internal media, queued MediaSeekMessage is handled only with a current item, under the playlist lock, using SetPosition(forceSeek:true) (`MediaSource/ViewModels/InternalMediaSource.cs:76–89`). It does not set playing. When a source reports position, `SVM:610–648` handles first position/seek: optional sync and media-loop clearing can follow; transition and provider phase are retained. The gap action does not promise immediate seek acceptance or a physical output frame. Reuse the existing OHOS source-specific seek transaction/confirmation path, preserving source identity, playback state, cancellation and output gating.

## 7. Portable argument shape and implementation advice

These are recommendations, not a declaration that the candidate has implemented them.

### Typed point arguments

Prefer one explicit optional structured field on ShortcutAction, accepted only for the two exact points action IDs. A bounded discriminated shape is sufficient:

- Custom Curve: `{ kind: 'customCurve', points: [{ x, y }], durationSeconds: 1, interpolationMode: 'linear' }`.
- Smart limit: `{ kind: 'smartLimit', points: [{ x, y }] }`.

Accept only these exact keys per kind; reject nulls, extra executable/path/endpoint fields, non-array points, non-object points, nonfinite numbers, invalid enum tokens and kind/action mismatch. Deep-copy at editor draft, save/load, dispatch capture, and runtime commit boundaries. Do not store JSON in the text argument, share runtime collections with saved actions, or allow arbitrary payloads for other action IDs. Old scalar shortcuts must still round-trip with the new field absent. Cancel must discard the detached editor draft, including point moves and duration changes.

Reuse the existing maximum **4096 points per argument** and the **1 MiB total settings JSON** ceiling, plus 64 mappings/16 actions per mapping; reject before expensive clone/map operations and retain an aggregate serialized size bound so per-action bounds cannot multiply unboundedly. These are existing OHOS resource limits, not original WPF limits. The editor can impose a smaller explicitly disclosed practical point limit if desired; do not silently truncate data.

For Custom Curve, duration 1–60 and finite x/y with y 0–1 are a reasonable declared editor-compatible domain. Existing MotionConfiguration deliberately allows finite x outside [0,duration], list order and duplicates; preserve those on import/command if retaining the headless contract, while a drag UI can keep newly created points within its viewport. Do not silently sort, clamp or deduplicate imported points. If choosing strict x-in-viewport instead, document the narrower input contract. Empty points are meaningful and supported by the source.

For Smart limit, finite x/y 0–100 matches the visual editor domain. Existing AxisConfiguration **requires strictly increasing x**, which is narrower than both headless SetFrom and the loaded canvas's duplicate-preserving behavior. Minimal safe integration can retain that validator and reject unordered/duplicate action arguments visibly, with partial-parity disclosure. Full headless ordered-list equivalence would require deliberate validator/schema/UI/test changes; silently sorting/deduplicating would change source behavior. Empty/one-point lists should retain their skip/constant-factor meaning.

### Dedicated point runtime operation

Existing `MotionProvider.configure` requests sync on **any** changed configuration and returns immediately on equal JSON. Existing `CustomCurveMotion.onConfigurationChanged` refreshes only when serialized points/duration differ. This is insufficient for original Points Set: point-only changes must avoid sync, and equal content must refresh. Add a dedicated command path through the Custom Curve instance/registry/core preserving scalar assignment order and an unconditional collection-equivalent refresh. Validate first, preserve phase and cached value, and retain provenance invalidation rules without claiming old provider samples are fresh. Do not replace the provider instance.

For SmartLimitPoints use existing settings adoption without adding a reset-sync trigger. Do not let a general changed-settings path accidentally reset index, home, provider, transition, lock, pause, or media state.

### Manual value and SkipGap adapters

`AxisPipeline.setTransition` and `AxisTransition` already encode source Set/Append/−1/one-shot-end behavior. Add a session-level runtime command to that primitive, not a persistent AxisConfiguration setting. The core must reject stale/disabled axes, pending-profile/fault/busy state as applicable, retain separate output permission, and allow an accepted transition to advance under the ordinary paused pipeline tick. Validate nonfinite derived target/duration before append mutation. Absolute/relative commands must remain observable even if their argument values equal a previous command.

SkipGap needs a snapshot of **current bindings and runtime indices** and a named, documented choice about original all-axis/raw-position quirks. The conservative parity contract is source-compatible behavior across active axes, regardless of the supplied single-axis argument; display that behavior clearly rather than presenting a fake axis filter. A corrected filtering or offset-aware mode should be separately named/documented, not attributed to the original action. Do not substitute `scriptStartPosition` or recalculate indices to conceal this distinction.

## 8. Baseline OHOS observations and required regression evidence

The comparison baseline is frozen 0.14, not concurrently edited 0.15 code. Companion hashes identify its inspected files. Existing assets include:

- `core/AxisPipeline.ts`: internal transition primitive, separate raw state/public clamped GetValue, stage/gate order, observation provenance, no implicit shortcut exposure.
- `core/AxisTransition.ts`: −1 sentinel and unclamped active append arithmetic already present.
- `core/motion/MotionRegistry.ts`, `MotionProvider.ts`, `CustomCurveMotion.ts`: stable provider instances/configuration and sample lineage; generic configuration is insufficient for repeated point commands.
- `core/PlaybackSessionCore.ts`: distinct configuration adoption, foreground/pause ticks, fault/profile checks, source seek transactions, output safety revisions. Reuse its existing boundaries rather than call pipeline internals from UI.
- `input/ShortcutConfiguration.ts`, `ShortcutMotionActions.ts`, `ShortcutSettingActions.ts`, `ShortcutMediaActions.ts`: finite scalar/text allowlist and detached configuration; no point payload in the frozen action schema.
- `core/MotionConfiguration.ts`: 4096-point cap, finite x, normalized y, retained order/duplicates; `core/AxisConfiguration.ts`: percent point domain and strict increasing x; `settings/SettingsSchema.ts`: 1 MiB aggregate serialization ceiling.

Minimum focused checks before advertising the five templates:

1. Source/defaults: all five exact IDs/defaults; no Drive exposure; original 188 denominator unchanged; malformed DTO/extra fields/nonfinite/overflow rejected without partial commit; old scalar configurations unchanged.
2. Points: deep-copy across all boundaries; save/load/export/cancel; empty/singleton/max/max+1; unsorted/duplicate/domain policy explicit; nonselected Custom Curve target; same scalar+same points forces refresh; point-only no sync; changed scalar sync; Time/output/playing preserved; stopped nonlooping remains stopped; prior interpolation/looping change followed by equal points rebuilds tiles; existing standalone-motion cache/provenance gates hold.
3. Smart points: no reset-sync/index/home/transition; empty skip and single constant; input-axis previous state; percent versus normalized units; strict-order rejection disclosed if retained; loaded-WPF sorting not misrepresented as universal.
4. Manual: default fallback, finite raw starting value, zero duration, first positive/zero delta, active append before/after first tick, repeated pre-tick +1-second quirk, unclamped targets, overflow, exact one-shot endpoint then NaN/held value; pause/speed independence; bypass freeze/resume; invisible completion while script/provider wins; Invalid versus Before/After; unknown selected provider; LockScript independence; sync/home/smart/speed stage interaction; Stop/cancel/profile/source generation and no automatic arming.
5. SkipGap: null/explicit axis all-axis behavior; no/empty/singleton bindings; linked/locked/bypassed axes; stale/current Index; all-flat; both .001 epsilon edges; inside non-gap; before/after/invalid start0; earliest past/too-near candidate blocks later candidate; equality with minimum skip; raw coordinate despite offsets; duration clamp after threshold; finite/readiness policy; source seek preserves pause and uses existing cancellation/generation/acknowledgement gates.

The source text proves the described call paths, not WPF scheduling, device output, complete UI reachability, or final 0.15 test success. Those require separate implementation and validation evidence.


## 9. Executed original-C# SkipGap oracle

The isolated `ohos/tools/reference/skip-gap-015/` harness compiles unchanged original SkipGap overloads, GetAxisPosition and SeekMediaToTime spans together with the full original Keyframe/KeyframeCollection/MathUtils files. The original ValidateIndex helper, index constants and InsideScript expression are extracted unchanged. Structural shims and explicit index preparation are listed in the fixture provenance; this is not a newly written gap-selection algorithm. The existing general `tools/reference/run.py` was not changed.

On this audit snapshot, official .NET SDK 9.0.319 / runtime 9.0.21 executed **116 cases** (36 named edges, 80 deterministic sweep inputs). `tests/skip-gap-source-oracle.test.mjs` passed **33/33, zero skips**, including source/span/host/input hash verification, hand-checked contract anchors, and fresh compile/re-execution of all 116 cases. The fixture records published seek messages after original clamping/TimeSpan conversion, not source acknowledgements or full pipeline execution.

The actual C# results confirm: selecting R0 can seek L0's earlier candidate; a past/too-near minimum blocks later candidates; empty axes return before scanning; Invalid/Before/After begin at index0; positive/negative offsets influence prepared indices but target remains raw seconds; strict .001 gap and strict minimum-skip boundaries; duration clamping occurs after the minimum-distance decision; NaN MediaPosition can still produce a seek. Direct NaN/negative minimum and negative-duration cases deliberately demonstrate unsupported typed-call behavior. A portable nonfinite-clock rejection is an explicit safety difference, not an oracle mismatch to conceal.

The fixture and test do not certify candidate OHOS runtime differential parity. The source bindings, desktop controls, whole update loop, source connection and physical output remain outside this isolated harness. Reproduction instructions and all shim limitations are in `ohos/tools/reference/skip-gap-015/README.md`.
