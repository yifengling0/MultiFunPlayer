# 0.15 original shortcut action coverage

Source-route audit snapshot: **2026-10-16T21:02:28.831703+00:00**. Original source: `36c08fbb99ac9398a63ff1cca1bbf68cd2228a94`. Comparison release: frozen `0.14.0-1c0a8d3a333ddb69/source`. This matrix records the reviewed code snapshot, **not a final 0.15 aggregate, clean SDK build, Windows UI, native-device or physical-output pass**.

## Counts and classification

**155 unique runtime-evaluated catalog IDs = 151 original concrete names + 4 OHOS additions.** All 151 original names map exactly once to **133 of 188 original registration call sites**. Expanding one shared provider registration into four names does not multiply the template denominator. The five new concrete names have real Index → owning helper/core/runtime routes; catalog-only/model-only entries receive no credit.

| Classification | Original templates | Exposed original names |
|---|---:|---:|
| Full command wiring within declared portable contract | **110** | **116** |
| Partial original domain/dependency/loaded-view coverage | **23** | **35** |
| Unwired | **55** | **0** |
| Total | **188** | **151** |

The inherited 0.14 statuses are preserved individually: 107 full portable, 21 partial, 60 unwired. This slice adds **three full-portable routes** (Value Set/Offset and SkipGap) and **two partial routes** (Custom Curve Points and SmartLimitPoints), reducing unwired by five. **None of the prior 21 partial entries was promoted without closing its original restriction.**

“Full portable” means the registered command and known dependent runtime effects are wired within the documented finite/active-target/readiness/foreground/cancellation and output-safety contract. It does not erase a known original argument domain, source-family expansion, mounted-control effect, repository scope or runtime-budget omission. Those specific gaps remain partial. The retained safety gates are not evidence that output devices, desktop controls or every legal C# typed value are supported.

The four separate OHOS additions remain App::Stop, App::Internal::Random, App::Fullscreen::Toggle and App::Library::Show; they never count toward 188.

## Reproducible evidence

- Evaluated the actual `shortcutActionCatalog()` under Node; 155 unique IDs and 151 unambiguous original mappings. JSON preserves all specs and the complete 188-row status matrix.
- Re-located all **154 unique inherited handler/dependency markers** in current source. Their line anchors and hashes record this review time. This is source continuity, not an execution claim for all inherited commands.
- Original source/callback evidence is retained in `tools/reference/action-coverage-015-source.json`: 188 registration texts/callbacks verified, 51 original source files byte-identical to frozen 0.14. The [source-chain audit](SHORTCUT_ACTIONS_015_SOURCE_AUDIT.md) explains Fody, collection identity, mounted controls and numerical edge cases.
- Current UI/core/output/test input hashes are under `candidate015.runtimeAndTestSnapshot`; full release checks must use a later final freeze if any input changes. Prior 0.14 test/build successes are historical and are **not** substituted as 0.15 results.
- The isolated actual-C# SkipGap oracle executed 116 cases and passed 33/33 checks including re-execution; its scope is original selection/seek publication and index helpers with documented shims. It is not a candidate full-stack or Windows proof.

## The five newly exposed routes

| # | Concrete action | Status | Current route and precise boundary |
|---:|---|:---:|---|
|48|MotionProvider::Custom Curve::Points::Set|P|Index → customCurvePointArguments → core.setCustomCurvePoints → registry → stable CustomCurveMotion.setPoints. Duration then Interpolation then forced collection-equivalent Reset; same points refresh, point-only no sync, phase/cache preserved. Bounded DTO/Duration editor domain and unsimulated mounted-canvas normalization keep it partial.|
|115|Script::SkipGap|F|Index → core.skipGapPosition → current script bindings + runtime indices + AxisKeyframes.isGap → existing seekTransport transaction. Retains original ignored-axis/all-binding minimum, raw seconds, stale/near minimum blocking and duration clamp after threshold. Finite ready-clock/active-axis guards are explicit portable safety restrictions.|
|116|Axis::Value::Offset|F|Index → core.setAxisValue(offset=true) → existing AxisPipeline/AxisTransition. Active Append preserves raw target and−1 sentinel arithmetic; validates overflow atomically. Runtime command does not start preview, move media clock, enable output or Arm.|
|117|Axis::Value::Set|F|Same route, fresh/replacement transition from raw finite state/default to clamped target. Zero-duration endpoint still requires a real tick. Script/provider precedence, pause wall-time, bypass freeze and post-processing remain active.|
|146|Axis::SmartLimitPoints::Set|P|Index → detached applyShortcutPointAction → existing configuration/pipeline adoption. No generic sync reset. Percent-domain finite points and strict increasing x reject source-permitted unordered/duplicate lists; measured WPF sort/write-back is not emulated.|

### Point DTO/editor boundary

The implemented payload uses a dedicated bounded `points:[{x,y}]` field; Custom Curve uses the existing scalar `value` for Duration and `text` for the four interpolation tokens. There is no opaque JSON/text evaluator. Validation requires dense arrays, exact x/y records, finite numbers, maximum 4096 points/action and 8192 points across keyboard mappings; the 1 MiB overall settings ceiling remains. Detached editing/copy boundaries prevent Cancel or later draft mutation from changing a saved/dispatched action.

Custom Curve retains finite x outside its viewport, original order and duplicates, with y0..1 and Duration1..60. Smart uses finite x/y0..100 and strict increasing x. Empty lists remain meaningful. Original typed point DTOs do not impose all these domains/counts; both are therefore partial. A working touch editor is not proof of loaded WPF canvas parity.

### Manual-only preview and explicit Arm-wait

The no-media manual route requires explicit `startManualPreview` after the existing cancel/stop ownership path. It concurrently releases media and disconnects **all captured old output targets** through `closeOutputsForManualPreview`; every captured target must be idle, disconnected and close-confirmed. Failed closure or cancelled startup leaves the preview stopped, and a late completion cannot grant it. After confirmed cleanup, `syncOutput` adopts the disconnected baseline **before** `core.startManualPreview` grants the new volatile source. Repeated Start → Apply → explicit Arm therefore remains usable without an old connection closing under the newly granted source. This startup creates neither a media clock nor device permission. Fixed updates can then produce genuine transition-applied frames. Each paused/manual target still needs its own `allowPausedManual`, current profile/axes/source identity, separate Apply and **explicit Arm**.

Current `OutputCoordinator.arm` can capture a valid manual-preview admission while no transition frame exists. It immediately suspends candidates and reports waiting/no output. Refresh keeps that intent only while its bound epoch/profile/admission/source/axes remain current. Only a current fixed, monotonic, `pausedManual` authorized frame can be submitted; held/default/unknown values never become a manual send merely by waiting. This permits a duration-zero command to reach a pre-armed waiting target on its actual frame. Afterward it can wait again without replaying the held value.

Polled contexts have no manual-preview admission. Stop, background, disconnect, source/profile/config invalidation and explicit disarm revoke it; Set/Offset alone cannot revive the preview or Arm. A running media source uses its existing authorization rules and still respects transition priority. These are explicit portable lifecycle/safety adaptations, not claims that the desktop original had identical Arm/Stop semantics. Source review is complete at the listed hashes. This refresh independently re-evaluated the unchanged live catalog and re-located all current source markers. Only Index.ets and the two named manual integration/UI test fixtures changed among the 29 tracked inputs since the prior snapshot; audit documents are not production inputs. The parent reports 83 focused checks passed and its R4 aggregate/SDK run in progress. Those execution results and final release freeze remain separate from this source audit.

### SkipGap source quirks and safety disclosure

The selected target is validated as an active portable axis but does not filter the original-style scan. All current active bindings are considered, including linked/locked/bypassed bindings, using InsideScript's current index or0 otherwise. First choose the minimum raw candidate; an expired/equal/too-near minimum blocks later candidates. Offsets affect the index through normal script updates but are not added to the target. The name is exactly Script::SkipGap, not a Media::Position alias or seek-to-script-start.

The portable route rejects missing/nonfinite current time, nonpositive duration, invalid minimum or unavailable source/target. Actual original C# with NaN MediaPosition can still publish a finite seek; this difference is preserved in the oracle and disclosed, rather than changing its expected answer. The command still uses the established source seek transaction and preserves playback state.

## Prior 21 partials: concrete closure order, without count inflation

Priority is based on useful dependency closure. “Local” means some implementation/evidence work can be done without widening connected sources; it does **not** mean the whole original domain can be declared full after one edit. Current scalar/managed/named routes already exist. Each row below remains partial now.


|#|Original template|Priority / useful next step|Evidence still missing or boundary retained|
|---:|---|---|---|
|44|`MotionProvider::{name}::Duration::Set`|P0 local dependency: Model explicit selected-provider/axis canvas attachment and measured-size lifecycle, then run unchanged source UpdateViewport/sort/write-back against detached fixtures; apply only when the equivalent view is attached.|Current shortcut reducer/provider has no attached-canvas state or pruning path. Existing CustomCurve source fully supplies the geometry effects, but cached-tab/popup/dispatcher ordering is not proven. Do not prune every hidden provider. A source-compatible attachment contract and tests are required before promotion; Windows scheduling remains unexecuted.|
|52|`MotionProvider::{name}::Octaves::Set`|P1 control + runtime budget: Trace Octaves setter → normal property sync → bound NumericUpDown maximum 8 and write-back; model the attached-only effect after pinned control evidence, keeping seed/time. Test129 and Int32.MaxValue rejection before mutation.|No OnOctavesChanged-specific cache/phase reset exists in source; the dependency is ordinary property notification plus bound control. Exact MahApps coercion remains unexecuted. Runtime128 activation budget remains, even if max8 attached-control behavior is reproduced. Do not remove this CPU safety boundary or equate persisted Int32 support with full runtime domain.|
|37|`MotionProvider::{name}::Minimum::Offset`|P1 control semantics: First obtain/inspect the pinned MahApps2.4.9 RangeSlider coercion implementation or a measured WPF oracle; implement explicit attached-control coercion/write-back, preserving pure independent callbacks when detached.|Current reducers correctly independently clamp and allow reversed bounds; they do not implement MinRange.01 loaded write-back. MinRange alone does not specify which endpoint changes or notification order. No external account/root expansion is needed for local model work, but unavailable third-party behavior cannot be guessed or replaced by unconditional sorting/clamping.|
|38|`MotionProvider::{name}::Minimum::Set`|P1 control semantics: First obtain/inspect the pinned MahApps2.4.9 RangeSlider coercion implementation or a measured WPF oracle; implement explicit attached-control coercion/write-back, preserving pure independent callbacks when detached.|Current reducers correctly independently clamp and allow reversed bounds; they do not implement MinRange.01 loaded write-back. MinRange alone does not specify which endpoint changes or notification order. No external account/root expansion is needed for local model work, but unavailable third-party behavior cannot be guessed or replaced by unconditional sorting/clamping.|
|40|`MotionProvider::{name}::Maximum::Offset`|P1 control semantics: First obtain/inspect the pinned MahApps2.4.9 RangeSlider coercion implementation or a measured WPF oracle; implement explicit attached-control coercion/write-back, preserving pure independent callbacks when detached.|Current reducers correctly independently clamp and allow reversed bounds; they do not implement MinRange.01 loaded write-back. MinRange alone does not specify which endpoint changes or notification order. No external account/root expansion is needed for local model work, but unavailable third-party behavior cannot be guessed or replaced by unconditional sorting/clamping.|
|41|`MotionProvider::{name}::Maximum::Set`|P1 control semantics: First obtain/inspect the pinned MahApps2.4.9 RangeSlider coercion implementation or a measured WPF oracle; implement explicit attached-control coercion/write-back, preserving pure independent callbacks when detached.|Current reducers correctly independently clamp and allow reversed bounds; they do not implement MinRange.01 loaded write-back. MinRange alone does not specify which endpoint changes or notification order. No external account/root expansion is needed for local model work, but unavailable third-party behavior cannot be guessed or replaced by unconditional sorting/clamping.|
|107|`Media::Bookmark::SeekToByName`|P2 bounded lookup domain: Retain pinned ordinal matching; add explicit null-vs-empty argument representation tests and exact first-collection fixtures if expanding supported names is needed.|Current command is wired; remaining limitation is bounded256 UTF-16 input and C0/DEL/null exclusion, not a missing search callback. Do not remove bounded input or control-character protection solely to gain a full count. Any intentional wider safe domain must be explicit and tested; no new repository is required.|
|111|`Media::Chapter::SeekToByName`|P2 bounded lookup domain: Retain pinned ordinal matching; add explicit null-vs-empty argument representation tests and exact first-collection fixtures if expanding supported names is needed.|Current command is wired; remaining limitation is bounded256 UTF-16 input and C0/DEL/null exclusion, not a missing search callback. Do not remove bounded input or control-character protection solely to gain a full count. Any intentional wider safe domain must be explicit and tested; no new repository is required.|
|20|`{Name}::Playlist::PlayByName`|P2 bounded managed lookup: Preserve first Name OR FullName OrdinalIgnoreCase and same-item paused restart; add null/empty/duplicate identity tests if extending the typed input domain.|The current route reaches the trusted playlist transaction, but accepts only bounded4096-unit plain text and managed playlist identities. Full original arbitrary resource/name domain is outside the authorized Download-only boundary. Do not treat input text as a new path or request new root access solely for coverage.|
|187|`Shortcut::Enabled::Set`|P2 bounded name identity: Test first exact mapping identity and admitted batch/timers for any proposed null-name compatibility; keep existing name matching and cancellation boundaries.|Mapped action names have256-unit input, stored mapping names80, and reject null/C0/DEL; original null can select an unnamed shortcut. No arbitrary external command/action-name expansion. Merely replacing limits with unbounded strings is not a useful completion; retain partial for the chosen bounded model.|
|188|`Shortcut::Enabled::Toggle`|P2 bounded name identity: Test first exact mapping identity and admitted batch/timers for any proposed null-name compatibility; keep existing name matching and cancellation boundaries.|Mapped action names have256-unit input, stored mapping names80, and reject null/C0/DEL; original null can select an unnamed shortcut. No arbitrary external command/action-name expansion. Merely replacing limits with unbounded strings is not a useful completion; retain partial for the chosen bounded model.|
|86|`Media::Speed::Offset`|P2 source capability split: Separate Internal simulated-clock rate capability from native AVPlayer capability and add exact callback/result tests within each declared rate domain.|Current shared action domain/result remains0.25..4 (Offset argument−4..4), below source minimum.01 and unbounded upper rate. Native accepted/quantized rate lacks device proof. Local Internal routing can improve scope without I/O; it cannot certify native high-speed/backend behavior or justify removing finite/runtime guards. Remains partial until declared source capabilities cover the action.|
|87|`Media::Speed::Set`|P2 source capability split: Separate Internal simulated-clock rate capability from native AVPlayer capability and add exact callback/result tests within each declared rate domain.|Current shared action domain/result remains0.25..4 (Offset argument−4..4), below source minimum.01 and unbounded upper rate. Native accepted/quantized rate lacks device proof. Local Internal routing can improve scope without I/O; it cannot certify native high-speed/backend behavior or justify removing finite/runtime guards. Remains partial until declared source capabilities cover the action.|
|2|`{Name}::AutoConnectEnabled::Set`|P3 absent source integrations: Retain exact Internal preference behavior; implement and review another source family only under a separately approved integration task.|Only Internal specialization is wired;11 other registered media-source families have no corresponding real adapter/dependency route. No new remote source connections, endpoints, credentials, persistent access or process integration in this round. A saved checkbox without a functioning source adapter is not coverage.|
|3|`{Name}::AutoConnectEnabled::Toggle`|P3 absent source integrations: Retain exact Internal preference behavior; implement and review another source family only under a separately approved integration task.|Only Internal specialization is wired;11 other registered media-source families have no corresponding real adapter/dependency route. No new remote source connections, endpoints, credentials, persistent access or process integration in this round. A saved checkbox without a functioning source adapter is not coverage.|
|14|`{Name}::LoadAdditionalScripts::Set`|P3 authorized repository scope: Continue testing complete managed scans, fresh bytes, cancellation, resource limits and fail-closed errors within the same authorized Download root.|The existing managed route is present; remaining original scope is arbitrary local/external repository aggregation and broader search/resource domains. Additional roots, directory/single-video imports or remote repositories are not authorized by this round; no silent scope expansion or network connection.|
|15|`{Name}::LoadAdditionalScripts::Toggle`|P3 authorized repository scope: Continue testing complete managed scans, fresh bytes, cancellation, resource limits and fail-closed errors within the same authorized Download root.|The existing managed route is present; remaining original scope is arbitrary local/external repository aggregation and broader search/resource domains. Additional roots, directory/single-video imports or remote repositories are not authorized by this round; no silent scope expansion or network connection.|
|136|`Axis::ReloadScript`|P3 authorized repository scope: Keep the existing begin/complete/cancel fresh-rescan route and locked/same-reference/new-equal-reference/priority-link regression evidence current.|These are no longer cached-only. Remaining partial status is repository scope, budgets and declared safe failure behavior, not a missing fresh-read bridge. Additional roots and arbitrary local/external repository search require separate authorization. Preserve old binding/disarm on failed transaction; do not widen scope to increase the matrix count.|
|140|`Axis::LinkPriority::Set`|P3 authorized repository scope: Keep the existing begin/complete/cancel fresh-rescan route and locked/same-reference/new-equal-reference/priority-link regression evidence current.|These are no longer cached-only. Remaining partial status is repository scope, budgets and declared safe failure behavior, not a missing fresh-read bridge. Additional roots and arbitrary local/external repository search require separate authorization. Preserve old binding/disarm on failed transaction; do not widen scope to increase the matrix count.|
|141|`Axis::LinkPriority::Toggle`|P3 authorized repository scope: Keep the existing begin/complete/cancel fresh-rescan route and locked/same-reference/new-equal-reference/priority-link regression evidence current.|These are no longer cached-only. Remaining partial status is repository scope, budgets and declared safe failure behavior, not a missing fresh-read bridge. Additional roots and arbitrary local/external repository search require separate authorization. Preserve old binding/disarm on failed transaction; do not widen scope to increase the matrix count.|
|147|`Axis::LinkAxis::Set`|P3 authorized repository scope: Keep the existing begin/complete/cancel fresh-rescan route and locked/same-reference/new-equal-reference/priority-link regression evidence current.|These are no longer cached-only. Remaining partial status is repository scope, budgets and declared safe failure behavior, not a missing fresh-read bridge. Additional roots and arbitrary local/external repository search require separate authorization. Preserve old binding/disarm on failed transaction; do not widen scope to increase the matrix count.|

### What can usefully be closed locally first

1. **Duration 44:** the actual custom Canvas source supplies pruning/sorting/write-back, so implement a separately owned attached/measured-canvas effect and source-derived numerical fixtures first. Keep the pure provider setter unchanged when detached. Explicitly test selected provider changes, retained axis tabs, closed/reopened editor, zero size, same Duration and point-order effects. Until the attachment/lifecycle contract is backed by evidence, universal pruning would create a new parity bug.
2. **Range 37/38/40/41:** independent Clamp01 and reversed provider range are already correct headlessly. The missing work is exact pinned MahApps MinRange.01 coercion/write-back plus attached-control lifecycle. Reading the XAML value alone cannot tell which endpoint moves. Do not substitute ordered endpoints, unconditional minimum spacing or a generic reset.
3. **Octaves 52:** ordinary property-change sync and preserved noise seed/time are implemented. The source has no special OnOctavesChanged reset to invent; the extra dependency is the bound NumericUpDown maximum 8 and possible write-back. The 128 runtime budget remains an independent partial-domain restriction even after attached-control handling is solved.
4. **Bounded names/source-specific speed:** local tests and explicit capability routing can improve correctness inside the approved domain. Unbounded strings, a larger CPU budget or native rate assumptions are not evidence of completion. Keep the useful safety ceilings and honest partial labels.
5. **Repositories/source expansion:** managed fresh rescan was already implemented in 0.14. Its remaining partial labels should not trigger new directory/single-video import, arbitrary root search, remote endpoints, credentials, new persistent access, output connection or File recording work. Those need their own authorized scope.

No old partial is merely “missing a catalog entry.” This audit does not propose cosmetic promotions, global clamping that changes hidden-provider behavior, or removal of safeguards to increase the full count.

## All current partial templates

The 23 partials are the prior 21 above plus 48 Custom Curve Points and 146 SmartLimitPoints. For compact reference, remaining restrictions are:

|#|Template|Remaining restriction|
|---:|---|---|

|2|`{Name}::AutoConnectEnabled::Set`|Only Internal::AutoConnectEnabled::Set is wired. Common WPF registration applies to twelve source names; the other eleven are absent. Saved Internal preference does not connect or arm output.|
|3|`{Name}::AutoConnectEnabled::Toggle`|Only Internal::AutoConnectEnabled::Toggle is wired. Common WPF registration applies to twelve source names; the other eleven are absent.|
|14|`{Name}::LoadAdditionalScripts::Set`|Additional scripts are resolved only from the existing authorized Download/catalog snapshot, with 64 candidate/expanded-item, 8 MiB text and Funscript action budgets. Does reread authorized script bytes; does not perform the WPF arbitrary local-repository search.|
|15|`{Name}::LoadAdditionalScripts::Toggle`|Same managed catalog/search and resource-budget limits as Set. Async prepare/load carries the shortcut lease; no claimed arbitrary-directory repository parity.|
|20|`{Name}::Playlist::PlayByName`|First Name OR FullName OrdinalIgnoreCase lookup and current-item restart/pause preservation are wired. Text is at most 4096 UTF-16 units, excludes C0/DEL, and only resolves current managed Download playlist identities; original string argument is unbounded and may be null.|
|37|`MotionProvider::{name}::Minimum::Offset`|Independent Clamp01 callback and provider mapping are implemented across all four providers, including reversed ranges. Already-bound WPF RangeSlider MinRange=.01 coercion/write-back is not implemented or runtime-proven; exact third-party coercion ordering is unknown.|
|38|`MotionProvider::{name}::Minimum::Set`|Independent Clamp01 callback and provider mapping are implemented across all four providers, including reversed ranges. Already-bound WPF RangeSlider MinRange=.01 coercion/write-back is not implemented or runtime-proven; exact third-party coercion ordering is unknown.|
|40|`MotionProvider::{name}::Maximum::Offset`|Independent Clamp01 callback and provider mapping are implemented across all four providers, including reversed ranges. Already-bound WPF RangeSlider MinRange=.01 coercion/write-back is not implemented or runtime-proven; exact third-party coercion ordering is unknown.|
|41|`MotionProvider::{name}::Maximum::Set`|Independent Clamp01 callback and provider mapping are implemented across all four providers, including reversed ranges. Already-bound WPF RangeSlider MinRange=.01 coercion/write-back is not implemented or runtime-proven; exact third-party coercion ordering is unknown.|
|44|`MotionProvider::{name}::Duration::Set`|Headless Duration setter, sync and pending refresh are wired; points stay intact. A WPF canvas bound to the selected Custom Curve can delete out-of-viewport shared points. Its popup/cached-view lifecycle and deletion are not simulated in OHOS; do not unconditionally prune hidden providers.|
|48|`MotionProvider::{name}::Points::Set`|Dedicated Duration → Interpolation → unconditional Points Reset retains phase and cached output; point-only change has no sync. Point payload is bounded to4096/action and 8192 across keyboard mappings, finite x and normalized y, duration1..60; original typed nested DTO has no such uniform clamp/count bound. Mounted measured WPF canvas sorting/coordinate write-back and viewport-driven pruning lifecycle are not reproduced. Order/duplicates/off-viewport finite x are retained headlessly.|
|52|`MotionProvider::{name}::Octaves::Set`|Original Int32 1..2147483647 argument values are represented exactly, but the existing Random runtime activation budget rejects Octaves >128 before committing. Bound WPF provider NumericUpDown has maximum 8; its view-dependent write-back is not runtime-proven or reproduced.|
|86|`Media::Speed::Offset`|Delta remains -4..4 and resulting rate is clamped to 0.25..4. WPF delta has Double.MinValue..Double.MaxValue and rate minimum 0.01 without an upper cap. Native rate outcome remains backend/device dependent.|
|87|`Media::Speed::Set`|Accepted rate is 0.25..4; WPF minimum is 0.01 without an upper cap. Native AVPlayer acceptance/quantization is not device-verified.|
|107|`Media::Bookmark::SeekToByName`|Name input is at most 256 UTF-16 code units and rejects C0/DEL control characters; WPF string builder has no corresponding bound. Within this domain, ordinal comparison uses a pinned .NET scalar table.|
|111|`Media::Chapter::SeekToByName`|Name input is at most 256 UTF-16 code units and rejects C0/DEL controls; WPF string builder is unbounded. Within domain, ordinal matching and first-collection/raw-time navigation are wired.|
|136|`Axis::ReloadScript`|Current host route rescans the same authorized Download root, rereads/parses fresh resources, and commits through begin/complete/cancel ownership tokens. The former cached-only host limitation is fixed. Search remains bounded to that root/catalog and budgets, without original arbitrary local or external repository aggregation. Reload strictly fails on incomplete/warning-bearing reindex, read, parse or ZIP failure: keep old bindings, cancel the transaction epoch and disarm. A genuine complete-search no-match retains ordinary resources with a zero-result status.|
|140|`Axis::LinkPriority::Set`|Current host route rescans the same authorized Download root, rereads/parses fresh resources, and commits through begin/complete/cancel ownership tokens. The former cached-only host limitation is fixed. Search remains bounded to that root/catalog and budgets, without original arbitrary local or external repository aggregation. Reload strictly fails on incomplete/warning-bearing reindex, read, parse or ZIP failure: keep old bindings, cancel the transaction epoch and disarm. A genuine complete-search no-match retains ordinary resources with a zero-result status.|
|141|`Axis::LinkPriority::Toggle`|Current host route rescans the same authorized Download root, rereads/parses fresh resources, and commits through begin/complete/cancel ownership tokens. The former cached-only host limitation is fixed. Search remains bounded to that root/catalog and budgets, without original arbitrary local or external repository aggregation. Reload strictly fails on incomplete/warning-bearing reindex, read, parse or ZIP failure: keep old bindings, cancel the transaction epoch and disarm. A genuine complete-search no-match retains ordinary resources with a zero-result status.|
|146|`Axis::SmartLimitPoints::Set`|Real cloned point action reaches AxisConfiguration/pipeline with no generic reset-sync. Accepts finite 0..100 percent x/y, empty/singleton arrays,4096/action and 8192 keyboard-total budget. Existing OHOS strict increasing x rejects duplicate/unsorted points that original SetFrom preserves; measured WPF canvas sorts but does not deduplicate. This is partial original-domain/loaded-view coverage, not full hidden behind a safety label.|
|147|`Axis::LinkAxis::Set`|Current host route rescans the same authorized Download root, rereads/parses fresh resources, and commits through begin/complete/cancel ownership tokens. The former cached-only host limitation is fixed. Search remains bounded to that root/catalog and budgets, without original arbitrary local or external repository aggregation. Reload strictly fails on incomplete/warning-bearing reindex, read, parse or ZIP failure: keep old bindings, cancel the transaction epoch and disarm. A genuine complete-search no-match retains ordinary resources with a zero-result status.|
|187|`Shortcut::Enabled::Set`|First exact case-sensitive ordinal mapping name is wired, preserving admitted batch and timers. Action lookup text is at most 256 UTF-16 units; saved mapping names at most 80; C0/DEL and null names are rejected. Original null can match an unnamed shortcut and strings are unbounded. Empty OHOS names remain exact strings, not null.|
|188|`Shortcut::Enabled::Toggle`|First exact case-sensitive ordinal mapping name is wired, preserving admitted batch and timers. Action lookup text is at most 256 UTF-16 units; saved mapping names at most 80; C0/DEL and null names are rejected. Original null can match an unnamed shortcut and strings are unbounded. Empty OHOS names remain exact strings, not null.|

## Remaining unwired scope and validation limits

55 registrations still have no catalog-plus-real-handler route. The appendix enumerates all of them; it includes remaining remote/source configuration and connection families, analog Drive paths, Looping Script Script::Set, Media::Path::Set, Debug::Log and all 25 output-target registrations. New numerical/manual UI does not grant coverage to output-target shortcuts or analog gesture input.

This coverage task did not modify production code, operate Git, connect a network endpoint/physical device, widen a resource root or review File-output recording behavior. It does not assert final 0.15 aggregate/build/phone-tablet-PC/WPF validation. Current runtime and focused-test files are hashed for the parent to reconcile with its final freeze.

## Family cross-check

|Family|Templates|Full portable|Partial|Unwired|Exposed names|
|---|---:|---:|---:|---:|---:|

|Axis|65|58|5|2|63|
|Debug|1|0|0|1|0|
|Media|32|27|4|1|31|
|MediaSource|35|8|5|22|13|
|MotionProvider|21|10|7|4|35|
|OutputTarget|25|0|0|25|0|
|Script|1|1|0|0|1|
|Shortcut|2|0|2|0|2|
|Sync|6|6|0|0|6|

## Complete 188-template appendix

F=full within declared portable contract; P=partial; U=unwired. Exposed count measures concrete catalog names from that registration, never the template denominator. Exact current handlers, line anchors, argument specs and restrictions are retained in `coverage015Templates` in the companion JSON.

|#|Original registration template|Status|Exposed concrete names|
|---:|---|:---:|---:|

|1|`Debug::Log`|U|0|
|2|`{Name}::AutoConnectEnabled::Set`|P|1|
|3|`{Name}::AutoConnectEnabled::Toggle`|P|1|
|4|`{Name}::Endpoint::Set`|U|0|
|5|`{Name}::ServerBaseUri::Set`|U|0|
|6|`{Name}::ApiKey::Set`|U|0|
|7|`{Name}::Device::SetByName`|U|0|
|8|`{Name}::RefreshDevices`|U|0|
|9|`{Name}::Endpoint::Set`|U|0|
|10|`{Name}::Shuffle::Set`|F|1|
|11|`{Name}::Shuffle::Toggle`|F|1|
|12|`{Name}::Looping::Set`|F|1|
|13|`{Name}::Looping::Toggle`|F|1|
|14|`{Name}::LoadAdditionalScripts::Set`|P|1|
|15|`{Name}::LoadAdditionalScripts::Toggle`|P|1|
|16|`{Name}::Playlist::Clear`|F|1|
|17|`{Name}::Playlist::Prev`|F|1|
|18|`{Name}::Playlist::Next`|F|1|
|19|`{Name}::Playlist::PlayByIndex`|F|1|
|20|`{Name}::Playlist::PlayByName`|P|1|
|21|`{Name}::ServerBaseUri::Set`|U|0|
|22|`{Name}::ApiKey::Set`|U|0|
|23|`{Name}::Device::SetByName`|U|0|
|24|`{Name}::RefreshDevices`|U|0|
|25|`{Name}::Endpoint::Set`|U|0|
|26|`{Name}::Arguments::Set`|U|0|
|27|`{Name}::Uri::Set`|U|0|
|28|`{Name}::ServerBaseUri::Set`|U|0|
|29|`{Name}::PlexToken::Set`|U|0|
|30|`{Name}::Client::SetByName`|U|0|
|31|`{Name}::RefreshClients`|U|0|
|32|`{Name}::Endpoint::Set`|U|0|
|33|`{Name}::Endpoint::Set`|U|0|
|34|`MotionProvider::{name}::Speed::Offset`|F|4|
|35|`MotionProvider::{name}::Speed::Set`|F|4|
|36|`MotionProvider::{name}::Speed::Drive`|U|0|
|37|`MotionProvider::{name}::Minimum::Offset`|P|4|
|38|`MotionProvider::{name}::Minimum::Set`|P|4|
|39|`MotionProvider::{name}::Minimum::Drive`|U|0|
|40|`MotionProvider::{name}::Maximum::Offset`|P|4|
|41|`MotionProvider::{name}::Maximum::Set`|P|4|
|42|`MotionProvider::{name}::Maximum::Drive`|U|0|
|43|`MotionProvider::{name}::InterpolationType::Set`|F|1|
|44|`MotionProvider::{name}::Duration::Set`|P|1|
|45|`MotionProvider::{name}::IsLooping::Set`|F|1|
|46|`MotionProvider::{name}::IsLooping::Toggle`|F|1|
|47|`MotionProvider::{name}::Reset`|F|1|
|48|`MotionProvider::{name}::Points::Set`|P|1|
|49|`MotionProvider::{name}::Script::Set`|U|0|
|50|`MotionProvider::{name}::Interpolation::Set`|F|1|
|51|`MotionProvider::{name}::Pattern::Set`|F|1|
|52|`MotionProvider::{name}::Octaves::Set`|P|1|
|53|`MotionProvider::{name}::Persistence::Set`|F|1|
|54|`MotionProvider::{name}::Lacunarity::Set`|F|1|
|55|`{Identifier}::AutoConnectEnabled::Set`|U|0|
|56|`{Identifier}::AutoConnectEnabled::Toggle`|U|0|
|57|`{Identifier}::Axis::Range::Minimum::Offset`|U|0|
|58|`{Identifier}::Axis::Range::Minimum::Set`|U|0|
|59|`{Identifier}::Axis::Range::Minimum::Drive`|U|0|
|60|`{Identifier}::Axis::Range::Maximum::Offset`|U|0|
|61|`{Identifier}::Axis::Range::Maximum::Set`|U|0|
|62|`{Identifier}::Axis::Range::Maximum::Drive`|U|0|
|63|`{Identifier}::Axis::Range::Middle::Offset`|U|0|
|64|`{Identifier}::Axis::Range::Middle::Set`|U|0|
|65|`{Identifier}::Axis::Range::Middle::Drive`|U|0|
|66|`{Identifier}::Axis::Range::Size::Offset`|U|0|
|67|`{Identifier}::Axis::Range::Size::Set`|U|0|
|68|`{Identifier}::Axis::Range::Size::Drive`|U|0|
|69|`{Identifier}::Endpoint::Set`|U|0|
|70|`{Identifier}::PipeName::Set`|U|0|
|71|`{Identifier}::SerialPort::Set`|U|0|
|72|`{Identifier}::Endpoint::Set`|U|0|
|73|`{Identifier}::ConnectionKey::Set`|U|0|
|74|`{Identifier}::SourceAxis::Set`|U|0|
|75|`{Identifier}::Endpoint::Set`|U|0|
|76|`{Identifier}::Uri::Set`|U|0|
|77|`{source.Name}::Connection::Toggle`|U|0|
|78|`{source.Name}::Connection::Connect`|U|0|
|79|`{source.Name}::Connection::Disconnect`|U|0|
|80|`{target.Identifier}::Connection::Toggle`|U|0|
|81|`{target.Identifier}::Connection::Connect`|U|0|
|82|`{target.Identifier}::Connection::Disconnect`|U|0|
|83|`Media::PlayPause::Set`|F|1|
|84|`Media::PlayPause::Toggle`|F|1|
|85|`Media::Path::Set`|U|0|
|86|`Media::Speed::Offset`|P|1|
|87|`Media::Speed::Set`|P|1|
|88|`Media::ScriptOffset::Offset`|F|1|
|89|`Media::ScriptOffset::Set`|F|1|
|90|`Media::Position::Time::Offset`|F|1|
|91|`Media::Position::Time::Set`|F|1|
|92|`Media::Position::Percent::Offset`|F|1|
|93|`Media::Position::Percent::Set`|F|1|
|94|`Media::Position::SkipToScriptStart`|F|1|
|95|`Media::Loop::Set::FromMediaPositionOffset`|F|1|
|96|`Media::Loop::Set`|F|1|
|97|`Media::Loop::CycleSetStartEnd`|F|1|
|98|`Media::Loop::Start::Set`|F|1|
|99|`Media::Loop::End::Set`|F|1|
|100|`Media::Loop::Clear`|F|1|
|101|`Media::Loop::Set::FromCurrentChapter`|F|1|
|102|`Media::Loop::Start::Set::FromMediaPosition`|F|1|
|103|`Media::Loop::End::Set::FromMediaPosition`|F|1|
|104|`Media::AutoSkipToScriptStartEnabled::Set`|F|1|
|105|`Media::AutoSkipToScriptStartEnabled::Toggle`|F|1|
|106|`Media::AutoSkipToScriptStartOffset::Set`|F|1|
|107|`Media::Bookmark::SeekToByName`|P|1|
|108|`Media::Bookmark::SeekToByIndex`|F|1|
|109|`Media::Bookmark::SeekToNext`|F|1|
|110|`Media::Bookmark::SeekToPrev`|F|1|
|111|`Media::Chapter::SeekToByName`|P|1|
|112|`Media::Chapter::SeekToByIndex`|F|1|
|113|`Media::Chapter::SeekToNext`|F|1|
|114|`Media::Chapter::SeekToPrev`|F|1|
|115|`Script::SkipGap`|F|1|
|116|`Axis::Value::Offset`|F|1|
|117|`Axis::Value::Set`|F|1|
|118|`Axis::Value::Drive`|U|0|
|119|`Axis::Sync`|F|1|
|120|`Axis::Sync::Cancel`|F|1|
|121|`Axis::SyncAll`|F|1|
|122|`Axis::SyncAll::Cancel`|F|1|
|123|`Axis::Lock::Set`|F|1|
|124|`Axis::Lock::Toggle`|F|1|
|125|`Axis::LockAll::Set`|F|1|
|126|`Axis::LockAll::Toggle`|F|1|
|127|`Axis::Bypass::All::Set`|F|1|
|128|`Axis::Bypass::All::Toggle`|F|1|
|129|`Axis::Bypass::Script::Set`|F|1|
|130|`Axis::Bypass::Script::Toggle`|F|1|
|131|`Axis::Bypass::MotionProvider::Set`|F|1|
|132|`Axis::Bypass::MotionProvider::Toggle`|F|1|
|133|`Axis::Bypass::Transition::Set`|F|1|
|134|`Axis::Bypass::Transition::Toggle`|F|1|
|135|`Axis::ClearScript`|F|1|
|136|`Axis::ReloadScript`|P|1|
|137|`Axis::InterpolationType::Set`|F|1|
|138|`Axis::InvertScript::Set`|F|1|
|139|`Axis::InvertScript::Toggle`|F|1|
|140|`Axis::LinkPriority::Set`|P|1|
|141|`Axis::LinkPriority::Toggle`|P|1|
|142|`Axis::SmartLimitInputAxis::Set`|F|1|
|143|`Axis::SmartLimitMode::Set`|F|1|
|144|`Axis::SmartLimitTargetValue::Offset`|F|1|
|145|`Axis::SmartLimitTargetValue::Set`|F|1|
|146|`Axis::SmartLimitPoints::Set`|P|1|
|147|`Axis::LinkAxis::Set`|P|1|
|148|`Axis::SpeedLimitEnabled::Set`|F|1|
|149|`Axis::SpeedLimitEnabled::Toggle`|F|1|
|150|`Axis::SpeedLimitSecondsPerUnit::Offset`|F|1|
|151|`Axis::SpeedLimitSecondsPerUnit::Set`|F|1|
|152|`Axis::SpeedLimitUnitsPerSecond::Offset`|F|1|
|153|`Axis::SpeedLimitUnitsPerSecond::Set`|F|1|
|154|`Axis::AutoHomeEnabled::Set`|F|1|
|155|`Axis::AutoHomeEnabled::Toggle`|F|1|
|156|`Axis::AutoHomeDelay::Offset`|F|1|
|157|`Axis::AutoHomeDelay::Set`|F|1|
|158|`Axis::AutoHomeInsideScript::Set`|F|1|
|159|`Axis::AutoHomeInsideScript::Toggle`|F|1|
|160|`Axis::AutoHomeDuration::Offset`|F|1|
|161|`Axis::AutoHomeDuration::Set`|F|1|
|162|`Axis::AutoHomeTargetValue::Offset`|F|1|
|163|`Axis::AutoHomeTargetValue::Set`|F|1|
|164|`Axis::ScriptOffset::Offset`|F|1|
|165|`Axis::ScriptOffset::Set`|F|1|
|166|`Axis::ScriptScale::Offset`|F|1|
|167|`Axis::ScriptScale::Set`|F|1|
|168|`Axis::MotionProvider::Set`|F|1|
|169|`Axis::MotionProviderBlend::Offset`|F|1|
|170|`Axis::MotionProviderBlend::Set`|F|1|
|171|`Axis::MotionProviderBlend::Drive`|U|0|
|172|`Axis::MotionProviderFillGaps::Set`|F|1|
|173|`Axis::MotionProviderFillGaps::Toggle`|F|1|
|174|`Axis::MotionProviderMinimumGapDuration::Offset`|F|1|
|175|`Axis::MotionProviderMinimumGapDuration::Set`|F|1|
|176|`Axis::UpdateMotionProviderWithAxis::Set`|F|1|
|177|`Axis::UpdateMotionProviderWhenPaused::Set`|F|1|
|178|`Axis::UpdateMotionProviderWhenPaused::Toggle`|F|1|
|179|`Axis::UpdateMotionProviderWithoutScript::Set`|F|1|
|180|`Axis::UpdateMotionProviderWithoutScript::Toggle`|F|1|
|181|`Sync::Duration::Set`|F|1|
|182|`Sync::SyncOnMediaResourceChanged::Set`|F|1|
|183|`Sync::SyncOnScriptResourceChanged::Set`|F|1|
|184|`Sync::SyncOnMediaPlayPause::Set`|F|1|
|185|`Sync::SyncOnSeek::Set`|F|1|
|186|`Sync::SyncOnAutoHomeStartEnd::Set`|F|1|
|187|`Shortcut::Enabled::Set`|P|1|
|188|`Shortcut::Enabled::Toggle`|P|1|
