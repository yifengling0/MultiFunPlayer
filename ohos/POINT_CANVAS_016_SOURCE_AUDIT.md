# 0.16 point-canvas numeric and collection-effects audit

Audit date: 2026-10-16. This slice implements a **pure, event-driven effect model**, not a WPF control or an attachment scheduler. Original source identity is the existing reference manifest's `36c08fbb99ac9398a63ff1cca1bbf68cd2228a94`; all eleven source-chain files are hashed in `tools/reference/point-canvas-016/golden.json` and were byte-compared successfully against frozen `0.14.0-1c0a8d3a333ddb69/source`. No Git command was used. The pre-existing [0.15 source audit](SHORTCUT_ACTIONS_015_SOURCE_AUDIT.md) and [coverage matrix](ACTION_COVERAGE_015.md) remain the baseline; this document does not promote any action from partial to full.

## 1. Scope and delivered API

New implementation: `entry/src/main/ets/core/PointCanvasEffects.ts`.

```ts
PointCanvasEffects.apply(points,
  new PointCanvasGeometry(attached, actualWidth, actualHeight, viewportWidth, viewportHeight),
  'collection-reset' | 'viewport-change' | 'synchronize')
```

- `points` is the current/incoming list of `{x,y}` values. The method does not mutate it, the geometry or any runtime object.
- `attached` means the explicitly supplied callback is delivered to this bound canvas. It does **not** mean selected, visible, currently showing a popup, or proven to exist because a provider instance exists.
- Both audited source usages have zero-origin viewports. Custom Curve uses `(0,0,Duration,1)`; Smart Limit uses the canvas default `(0,0,100,100)`. The API does not accept arbitrary rectangle origins.
- `actualWidth/actualHeight` are explicit measured control sizes. Zero is meaningful. Negative/nonfinite sizes and nonpositive/nonfinite viewport dimensions are rejected.
- `collection-reset` includes the originating `SetFrom` Reset. Call it with incoming points after the caller has prepared the command, including its own scalar/event ordering. It does not itself assign Duration or change a provider.
- `viewport-change` means an actual viewport callback. It is not a blanket alias for every Duration command or every render. The caller must not invent this event for a same-value setter.
- `synchronize` is the common numeric/collection projection of an actual Points binding/replacement callback or actual SizeChanged callback. The caller owns those distinct lifecycle events; the pure projection does not emit a Points property notification.

The result includes `points`, `canvasPoints`, `collectionResetCount`, `removedPointCount`, `pointWriteBackCount`, `countNotificationCount`, and `itemNotificationCount`. `canvasPoints=null` means this callback did not synchronize elements; it does not assert that old native elements were cleared. Measured empty synchronization returns `canvasPoints=[]`.

The notification counts describe observable source effects for one explicitly scheduled canvas and its retained collection. They are **evidence**, not instructions to execute multiple provider commands, call `SetFrom` once per point, advance the media clock, request sync, or mark stale output samples fresh. The original provider's pending refresh is a flag; adapters must preserve the source command's semantics without manufacturing one refresh/reset per observer notification.

## 2. Complete original source chain

Paths in this section are relative to `Source/MultiFunPlayer`.

### Custom Curve provider and shortcut

1. `MotionProvider/ViewModels/CustomCurveMotionProvider.cs:188–191`: Duration action assigns the selected axis's existing Custom Curve provider `Duration`.
2. Same file `:28–34`: `Viewport` depends on Duration and returns `new Rect(0,0,Duration,1)`; `:60–61` marks the provider's refresh flag on Viewport notification.
3. Same file `:217–227`: Points action assigns Duration, then InterpolationType, then calls the existing `p.Points.SetFrom(vm.Points)`. It does not replace the collection.
4. Same file `:50–58,70–72`: the provider subscribes to collection changes; collection notifications mark pending refresh. This collection route is separate from scalar property synchronization and does not reset Time, playing state or cached output.
5. `MotionProvider/Views/CustomCurveMotionProvider.xaml:136–143`: a `DraggablePointCanvas` binds the same Points, InterpolationType, IsLooping, Time and Viewport; Height is 150, width is layout-derived.
6. `UI/Controls/Views/ScriptView.xaml:1149–1157`: the provider view is selected through a MultiBinding over manager, axis key and SelectedMotionProvider. Existence of all provider instances does not prove existence of all provider views.
7. `UI/Controls/NonReloadingTabControl.cs:30–40,121–155`: axis content presenters are created/cached and selected visibility is changed without removing all old presenters. A hidden axis can retain content/bindings.

### Action argument editor

1. `UI/Dialogs/Views/ShortcutActionConfigurationDialog.xaml:81–111`: Custom Curve argument template binds `Value.Points`, `Value.Viewport` and `Value.InterpolationType`; its control has Width=300 and Height=150; Duration's NumericUpDown specifies 1–60.
2. `CustomCurveMotionProvider.cs:251–282`: the argument DTO has its own collection, default `(0.5,0.5)`, Duration=1 and Linear interpolation. It forwards collection events as a Points property notification; its Viewport also depends on Duration. This is separate from the target provider collection.
3. The template's measured size and coercion behavior do not validate every headless/deserialized invocation or establish dispatcher order for the provider's three assignments.

### Smart Limit provider/settings and editor

1. `UI/Controls/ViewModels/ScriptViewModel.cs:1775–1780`: the action calls `SmartLimitPoints.SetFrom(points)`; default argument is `(50,50)`. Axis defaults are `(25,100),(90,0)` at `:2350–2354`.
2. `UI/Controls/Views/ScriptView.xaml:1199–1202`: SmartLimitPreview binds that axis's settings collection.
3. `UI/Dialogs/Views/ShortcutActionConfigurationDialog.xaml:76–79`: the action argument template separately binds SmartLimitPreview to its argument collection.
4. `UI/Controls/SmartLimitPreview.xaml:70–76`: a 125×125 grid contains DraggablePointCanvas, binding Points and Input-derived ScrubberPosition, with no viewport override. `DraggablePointCanvas.xaml.cs:97–100` therefore supplies `(0,0,100,100)`.
5. `SmartLimitPreview.xaml.cs:51–58,60–83`: Points DP notification and displayed Input/Output calculations are separate. Output display does not mutate settings or grant hardware output authority.

### Common canvas callback and collection chain

1. `DraggablePointCanvas.xaml.cs:110–124`: Points DP change unsubscribes the old collection, subscribes the new collection, calls `SynchronizeElementsFromPoints`, then raises Points PropertyChanged.
2. Same file `:167–173`: Viewport DP change calls `UpdateViewport(oldValue,newValue)`, then raises Viewport PropertyChanged.
3. Same file `:176–184`: collection change returns if `_ignorePointsCollectionChanged`, otherwise synchronizes then refreshes the scrubber. The handler is not limited to Reset, although this model exposes the requested SetFrom/Reset route.
4. `DraggablePointCanvas.xaml:9` wires `SizeChanged="OnSizeChanged"`; `.xaml.cs:262–267` synchronizes then refreshes the scrubber.
5. Same file `:285–300`: viewport callback suppresses this canvas's collection handler, removes every out-of-viewport point by index in the existing collection, then synchronizes. Pruning precedes the measured-size early return. `oldValue` is not consulted.
6. Same file `:303–323`: zero ActualWidth **or** ActualHeight returns before touching elements. Otherwise the element count is reconciled, Points are stably ordered by X, every element Position is assigned `ToCanvas`, then points are synchronized back.
7. Same file `:325–354`: with nonzero measured dimensions, this canvas suppresses its collection handler, reconciles point count to element count, stably orders elements by pixel X, reorders children and writes every Point through the collection indexer, even if numerically equal. It refreshes the line then clears suppression.
8. Same file `:477–483`: conversions are exactly `x / Viewport.Width * ActualWidth`, `(1-y / Viewport.Height) * ActualHeight`, `x / ActualWidth * Viewport.Width`, and `(1-y / ActualHeight) * Viewport.Height`. They do not clamp or compensate for a rectangle origin. Both audited binding origins are zero.
9. `Common/ObservableConcurrentCollection.cs:90–99`: SetFrom clears/adds in argument order inside its lock, then calls Refresh; even equal and empty input emits Reset. `:39–50` delivers CollectionChanged, Count and Item[] through the captured SynchronizationContext.Send. `:57–73` index writes always emit Replace; `:164–176` RemoveAt emits Remove. The original collection object is retained.

## 3. Exact per-event numerical effects

| Delivered event | Detached | Attached with either measured size zero | Attached with positive measured sizes |
|---|---|---|---|
| collection-reset | Incoming order/duplicates retained; Reset=1 | Same, no pruning/sorting/write-back | Reset=1; stable model-X sort, coordinate roundtrip, stable pixel-X sort; Replace once per remaining point; no prune |
| viewport-change | No canvas effect | Closed-edge prune only, in original list order | Closed-edge prune, then stable two-stage sort/roundtrip and Replace per survivor |
| synchronize | No canvas effect | No canvas effect | Stable two-stage sort/roundtrip and Replace per point; no prune |

Within the bounded single-canvas schedule, Count and Item[] notifications each equal `Reset + Remove + Replace`. Empty measured synchronization has zero Replace; empty/equal SetFrom still has one Reset. Equal-content optimization would lose these observable effects.

No deduplication occurs here. In particular, distinct input X values can underflow to the same pixel X; the second stable order retains the first model-X ordering, not the original unsorted input order. The implementation explicitly tracks tie ordinals rather than depending on a platform's undocumented sort stability. It uses comparisons instead of subtracting finite but extreme coordinates, avoiding a comparator-overflow artifact.

The coordinate roundtrip is observable: y=0.2 can become 0.19999999999999996. Signed zero is retained by the oracle and model. Avoid normalizing or rounding these values away in fixture generation. The separate provider KeyframeCollection's first-duplicate projection is not the same operation as canvas synchronization.

### Scalar/Reset ordering must remain explicit

The fixture supplies both schedules:

1. Existing points `(2,.2),(8,.8)` → delivered Duration viewport shrink to width3 removes old x8 → incoming SetFrom `(7,.7),(1,.1)` sorts/writes but retains x7 outside width3.
2. Incoming SetFrom first → later delivered viewport shrink removes incoming x7.

These are examples of the effect of an explicit delivery order, **not evidence that WPF chooses either schedule for every invocation**. Never unconditionally prune incoming points after every Points action. Same Duration is not evidence of a new viewport callback. Resize and initial Points binding are not viewport callbacks and cannot be substituted for one.

## 4. What the executable oracle proves

`tools/reference/point-canvas-016/run.py` extracts **fourteen unchanged method/expression spans** from original DraggablePointCanvas and compiles the **entire unchanged ObservableConcurrentCollection.cs** with the existing official .NET SDK 9.0.319 / runtime 9.0.21. Roslyn is invoked directly without restore. No NuGet, SDK download, network, Git, device or output connection is used.

Unchanged executed spans include the Points DP handler, collection handler, SizeChanged handler, AddElement/RemoveElement, UpdateViewport, both synchronization methods and all six conversion expressions. Generated output records source/span/host/runner/input hashes. Source-chain hashes cover eleven files. The fixture contains **129 schedules, 337 delivered events and 2,082 original indexer write-backs**.

Structural shims are deliberately narrow:

- Point is a double-field struct. Native visual elements are a list with stored event handlers; no native layout/input occurs.
- Rect.Contains is a finite-positive, zero-origin closed-edge containment shim. **The WPF Rect implementation is not executed.** No result is claimed for shifted/empty/negative/nonfinite rectangles.
- Dependency-property event arguments are explicit data; there is no dependency-property engine.
- RefreshLine, RefreshScrubber and pointer enter/leave handlers are no-ops. This excludes line interpolation, visual preview, visibility, animation and scrubber effects from the claim.
- BindingOperations.EnableCollectionSynchronization is a no-op. Original collection locking and observer methods execute, with an explicit inline SynchronizationContext.Send. This does not establish WPF cross-thread synchronization.
- The test schedule supplies attachment, measurement and event order. No Fody, Stylet, dispatcher, cached popup or real device executes.

The Node differential checks compare **every returned coordinate exactly**, including signed zero, and all collection counts against executable C# results. Hand-checked anchors independently establish prune-before-size-check, closed edges, duplicate order, notifications, Points-property-versus-size event distinctions and schedule-dependent final lists. Finite validation and ceiling/overflow tests cover portable-only safety restrictions.

## 5. Validation and integration boundaries

Focused validation completed on 2026-10-16:

- `MFP_DOTNET_ROOT=<existing-sdk9.0.319> node --test ohos/tests/point-canvas-effects*.test.mjs`: **142 passed, 0 failed, 0 skipped**, including fresh C# compilation and all 129 oracle schedules.
- Isolated strict TypeScript check with the already installed official tools' TypeScript (`--noEmit --strict --target ES2020 --module ES2020 --skipLibCheck`) passed for the new module. This is not an ArkTS/HAP build.
- 4096 points accepted; 4097 rejected before element iteration. Sparse/malformed/nonfinite points and invalid geometry reject without input mutation. Intermediate and final coordinate overflow rejects the whole pure operation before any caller commit.
- Maximum point count is the existing OHOS resource ceiling, not an upstream WPF limitation. The model does not loosen settings JSON or aggregate shortcut budgets and does not alter existing validators.

Still outside this slice:

1. Actual attachment detection, owner identity, onAreaChange scheduling, destroyed/stale callback rejection, save/apply transactions and output provenance. The parent integration owns these routes.
2. Which initial binding callback arrives first; whether a same-value assignment delivers a DP callback; Fody property/dependent notifications; third-party coercion and dispatcher scheduling.
3. Multiple canvases concurrently observing the same collection. `_ignorePointsCollectionChanged` is per canvas; another observer can have its own reentrant effects. The single-canvas counts are not a proof of all observer orderings.
4. Hidden/cached WPF views. Numeric canvas callbacks have no IsVisible guard; only RefreshScrubber checks visibility (`:447–474`). A portable hidden/destroyed-owner invalidation rule is a declared safety/lifecycle policy, not proof that hidden WPF content is detached.
5. Native visual dimensions, mouse/touch event behavior, full line/scrubber rendering, collection-null/foreign-child states, negative/nonfinite typed-call propagation, or a full compiled WPF/Fody application.
6. Existing provider/schema/components, Index/session wiring, aggregate/HAP builds and phone/tablet/PC validation. None was changed or certified by this focused slice. No action coverage count is promoted by a standalone pure model or shim-host result.

An integrating owner should emit events only for observed binding/size/viewport/collection changes, bind them to the intended collection and axis identity, suppress self-induced feedback, and commit only after the complete pure result validates. Do not normalize on every render, infer mount state from provider selection alone, or apply a stale callback to a newly selected axis.
