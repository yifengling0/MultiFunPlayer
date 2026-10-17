# Original shortcut action coverage and 0.13 implementation scope

Audit date: 2026-10-16. This is an independently checked source ledger, not an implementation or device-test claim.

## 0.13 actual candidate coverage (supersedes the planning shortlist)

**113 runtime-evaluated catalog entries = 109 original concrete names + 4 OHOS additions.** Each original name was checked beyond the catalog: `Index.executeShortcutAction` reaches a real reducer/controller and an owning session/resource/media dependency. The 109 names correspond to 109 of the 188 original registration templates; two common AutoConnect templates are represented only by their Internal specialization.

| Actual candidate classification | Templates |
|---|---:|
| Full command wiring within the declared portable contract | **97** |
| Partial original behavior/domain/dependency coverage | **12** |
| Unwired original templates | **79** |
| **Total** | **188** |

These are **frozen, software-validated candidate** counts: the final run passed **1514/1514 tests, 0 failures, 0 skips**, including actual .NET reference execution, followed by the successful clean official SDK build (**33/33 tasks executed**). “Full” here means the source scalar command, parameter bounds and dependent effects are wired for explicit valid active targets within the OHOS foreground/readiness contract. It does not mean unrestricted WPF application/input/backend parity. Selected-axis convenience, legacy editor defaults, safer failure handling, finite-result validation and stricter malformed-input rejection are disclosed adaptations; they are not exact source editor-default equivalence. No physical device, native rate, keyboard/IME or Windows UI execution was performed by this audit.

### The 12 partial templates

| Template / exposed specialization | Limitation |
|---|---|
| `Internal::AutoConnectEnabled::Set` (#2) | Only Internal::AutoConnectEnabled::Set is wired. Common WPF registration applies to twelve source names; the other eleven are absent. Saved Internal preference does not connect or arm output. |
| `Internal::AutoConnectEnabled::Toggle` (#3) | Only Internal::AutoConnectEnabled::Toggle is wired. Common WPF registration applies to twelve source names; the other eleven are absent. |
| `Internal::LoadAdditionalScripts::Set` (#14) | Additional scripts are resolved only from the existing authorized Download/catalog snapshot, with 64 candidate/expanded-item, 8 MiB text and Funscript action budgets. Does reread authorized script bytes; does not perform the WPF arbitrary local-repository search. |
| `Internal::LoadAdditionalScripts::Toggle` (#15) | Same managed catalog/search and resource-budget limits as Set. Async prepare/load carries the shortcut lease; no claimed arbitrary-directory repository parity. |
| `Media::Speed::Offset` (#86) | Delta remains -4..4 and resulting rate is clamped to 0.25..4. WPF delta has Double.MinValue..Double.MaxValue and rate minimum 0.01 without an upper cap. Native rate outcome remains backend/device dependent. |
| `Media::Speed::Set` (#87) | Accepted rate is 0.25..4; WPF minimum is 0.01 without an upper cap. Native AVPlayer acceptance/quantization is not device-verified. |
| `Media::Bookmark::SeekToByName` (#107) | Name input is at most 256 UTF-16 code units and rejects C0/DEL control characters; WPF string builder has no corresponding bound. Within this domain, ordinal comparison uses a pinned .NET scalar table. |
| `Media::Chapter::SeekToByName` (#111) | Name input is at most 256 UTF-16 code units and rejects C0/DEL controls; WPF string builder is unbounded. Within domain, ordinal matching and first-collection/raw-time navigation are wired. |
| `Axis::ReloadScript` (#136) | reloadAxisScript reuses this.discovered and does not requery ScriptRepositoryManager or reread changed files. It preserves lock/link behavior and resets sync; it cannot discover external edits/new resources. |
| `Axis::LinkPriority::Set` (#140) | Changing LinkPriority invokes the owning configuration path and reloads from this.discovered. WPF binding Checked/Unchecked handler calls ReloadAxes with a repository search; current resource refresh is cache-only. |
| `Axis::LinkPriority::Toggle` (#141) | Same cached reload limitation as LinkPriority::Set; toggle still flips the flag and preserves sync/link semantics. |
| `Axis::LinkAxis::Set` (#147) | Validated link target and cycle rejection are wired, but the consequent ReloadAxes equivalent resolves from this.discovered rather than a fresh repository search. |

### Dependency audit, not declaration counting

- **31 Media templates:** position/loop/chapter/bookmark actions reach `applyMediaShortcut` and the existing fenced `seekTransport`; play/pause use the real host source controls; global offsets use `setGlobalOffsetSeconds`; auto-skip updates saved preferences and the live helper. Speed Set/Offset remain partial. Name lookup is exact within its bounded text domain and uses the pinned .NET ordinal scalar mapping.
- **60 Axis templates:** configuration actions reach `applyAxisShortcutAction`, whole-profile validation and atomic `changeAxisConfigurations`; sync/reset/cancel reaches `requestSync(..., enabled)`; resource commands reach real `AxisScriptStore` operations. Reload-dependent entries remain partial because their source list is cached. Provider-specific `MotionProvider::{name}::*` actions are still absent despite `Axis::MotionProvider::Set` being present.
- **6 Sync templates:** each is dispatched to `applySyncShortcutAction`, then `changeSync` and immediate pipeline configuration adoption.
- **12 MediaSource templates/specializations:** Internal preferences and playlist commands reach real persistence/setters/load-event processing. AutoConnect is a saved Internal-only preference, never an output Connect/Arm. LoadAdditionalScripts now passes the owning shortcut lease through asynchronous preparation and publication, but retains managed-search/budget limitations.
- **79 unwired:** no credit merely because a model supports the underlying setting. This includes all 21 provider-specific motion templates, all 25 output templates, Debug, arbitrary path actions, the remaining remote-media integration, general SkipGap, direct Axis Value actions, SmartLimitPoints, MotionProviderBlend Drive, Shortcut Enabled actions and Internal PlayByName.

The formerly restricted global/axis offset and relative time-seek arguments now accept the source finite Double domain; positive auto-skip offsets persist. Existing defaults remain +0.05 seconds for offset increments, +5 seconds for relative seek, PlayPause::Set=true, and the documented speed defaults. These default adaptations are separate from command execution coverage.

### Complete WPF binding-chain evidence

A shortcut callback assigning a property is not a headless-only operation in the running WPF application. The source chain is:

1. `FodyWeavers.xml:2` enables PropertyChanged weaving; the project references PropertyChanged.Fody. `AxisSettings : PropertyChangedBase` (`ScriptViewModel.cs:2345`) and the view model's notification-capable base expose changed properties to bindings. The constructor also subscribes every axis settings object to `OnAxisSettingsPropertyChanged` (`ScriptViewModel.cs:108–109`).
2. The actual `ScriptView.xaml` binds those properties to `Value`, `IsChecked`, `SelectedItem` or `SelectedValue` and attaches ordinary change handlers. Property-to-control updates can raise those same events; no mouse/keyboard-only predicate exists in the handlers.
3. `ComboBoxAssist.cs:29–34` subscribes to ordinary `SelectionChanged` and calls `binding.UpdateTarget()`. Its handler (`37–44`) unconditionally executes the attached handler before `binding.UpdateSource()`. `UpdateSourceTrigger=Explicit` on SelectedMotionProvider controls target-to-source updates; it does not suppress source-to-target property notifications.
4. `NonReloadingTabControl.cs:30–40` creates child presenters for every axis on Loaded. `134–155` reuses existing presenters, and `125–131` changes visibility rather than destroying them on tab switch. This preserves bound control/handler state outside the selected axis tab.

| Programmatic property assignment | Bound event and source handler | Required effect |
|---|---|---|
| GlobalOffset | XAML 373–374 → `OnOffsetValueChanged`, VM 824–840 | Sync all axes |
| Axis Offset | XAML 1572–1573 → same handler | Sync the target axis |
| ScriptScale | XAML 1594–1595 → `OnScriptScaleSliderValueChanged`, VM 1315–1323 | Sync the target axis |
| InvertScript | XAML 759–762, one-way IsChecked → Checked/Unchecked → VM 1349–1361 | Sync, then idempotent assignment of checked state |
| LinkAxisHasPriority | XAML 910–913 → Checked/Unchecked → VM 1239–1246 | `ReloadAxes` and its sync/resource effects |
| LinkAxis | XAML 900–905 → SelectionChanged → VM 1249–1275 | Reject circular links and reload |
| SmartLimitInputAxis | XAML 1194–1196 → SelectionChanged → VM 1279–1289 | Reject self-reference and sync |
| UpdateMotionProviderWithAxis | XAML 1133–1136 → SelectionChanged → VM 1292–1302 | Reject self-reference and sync |
| SelectedMotionProvider | XAML 968–970 → ComboBoxAssist ordinary SelectionChanged → VM 1305–1313 | Sync before updating the bound source |

This is a source-backed path for loaded/bound WPF controls, not a claim that WPF was executed on this host. Same-value assignments may not raise a property/control change. Headless registration-callback tests alone cannot prove the complete UI-mediated behavior. The final OHOS contract therefore preserves these effects in the owning configuration/pipeline path; it does not suppress them based on command origin. The direct Link callback lacks a longer-cycle check, but the loaded bound selection handler supplies one, so treating the callback alone as the complete behavior would be incorrect.

### Candidate ordering and safety corrections now visible in source

`PlaybackSessionCore` now calls `pipeline.configure(configuration, scripts.snapshot())` at synchronous configuration/resource boundaries. This adopts both settings and binding identity before a later Sync Cancel action, rather than deferring a second sync to the next tick. It does not sample/advance the motion clock. The integration suite includes settings→cancel and clear/reload/link→cancel cases. The final integration log confirms the complete 1514-test pass and clean SDK build; this audit independently checked the recorded results and current production hashes. Source-path inspection alone was not treated as a test pass.

### Frozen verification evidence

- Final integrated suite: **1514 tests / 1514 pass / 0 fail / 0 skip**, 28.533819689 seconds. Actual .NET reference/oracle execution was enabled, including the Unicode scalar comparison scan.
- Clean official SDK build: **33 tasks / 33 executed**, 24.750 seconds; unsigned HAP **6,178,586 bytes**.
- HAP SHA-256: `b484dd7bd188a4cda206c72d403cf54ffef97f727894426464bd367003b0a6f3`.
- **110 production/configuration inputs** match before/after build and the current files. Before/after manifest SHA-256: `7e4958c4e9fac53c2ff7824ae50ffd328d54c6126286e1e7fb8ff093cbed4b98`.
- Source evidence log: `/tmp/mfp-0130-r1-final-clean-build.log`; its SHA-256 and all snapshot hashes are retained in the JSON ledger. These two audit documents are documentary outputs and are not counted as production/compiler inputs.
- SDK device-capability/deprecation warnings remain. No signing, installation, physical connection/device acknowledgement, keyboard/IME or phone/tablet/PC visual validation is claimed. The source-backed WPF binding analysis is not execution of Windows UI controls.

Per-template actual status, all 109 handler/dependency evidence chains, catalog argument specs, shared adaptations and current production hashes are under `coverage013Candidate` / `candidate013` in the JSON ledger. The original 0.12 records and historical planning classification remain intact below.

## Frozen baseline and precise counts

The coverage baseline is the immutable `0.12.0-d00b7110ffd797d4/source` archive. The live 0.13 catalog was being edited while this audit ran; new declarations must not be counted as working actions before their dispatch and tests pass. All source references below are relative to the repository. WPF source baseline is `36c08fbb99ac9398a63ff1cca1bbf68cd2228a94`.

- **188 original registration templates**, independently scanned from literal/interpolated `RegisterAction` calls and matched one-for-one to the earlier appendix by source path, line and name expression.
- **22 selectable OHOS 0.12 actions: 18 original-template matches and 4 OHOS additions.** Every one of the 18 original matches has an actual `Index.executeShortcutAction` case. `performShortcutDispatch` owns ordering, lease cancellation and availability gates; it is not a registry of every original action.
- **170 original templates remain unexposed in 0.12.** Existing underlying settings/UI/pipeline functionality is not shortcut coverage.
- **33 archived files** (30 registration-source files plus catalog, Index and source audit) matched `SOURCE_SHA256SUMS` exactly.
- This audit changed only this document and `tools/reference/action-coverage-013.json`. It performed no Git operations, physical output connections or File-target behavior review.

The denominator counts registration **call sites**, not runtime names. Abstract motion-provider actions expand over four providers; common media actions expand over twelve sources; output identifiers expand over actual instances. A repeated template such as `{Name}::Endpoint::Set` in different classes is a distinct registration call site. Plugin-added actions are outside the finite catalog.

| Classification | Templates | Meaning |
|---|---:|---|
| Wired in frozen 0.12 | 18 | Selectable and dispatched, with explicit adaptations below |
| P0 scalar adapters | 27 | Useful first 0.13 slice; existing scalar/no-argument schema and core behavior |
| P1 typed portable adapters | 75 | Mostly existing core; add explicit axis/provider/string/enum/multi-value arguments and exact semantics |
| P2 deeper adapters | 12 | Lifecycle, missing algorithm, structured editor or direct-motion work remains |
| Deferred media integration | 24 | Connection/autoconnect, remote endpoint/auth/device/client or process arguments |
| Deferred output integration | 21 | Non-Drive per-instance output configuration or connection actions |
| Deferred axis-input data | 9 | `IAxisInputGestureData` cannot be supplied by local button triggers; four are also output actions |
| Deferred arbitrary resource paths | 2 | Media path and Looping Script provider path commands |
| **Total** | **188** | Mutually exclusive classification |

Family cross-check: Debug 1; MediaSource 35; MotionProvider 21; OutputTarget 25; Media 32; Script 1; Axis 65; Sync 6; Shortcut 2.

Machine-readable evidence: [`tools/reference/action-coverage-013.json`](tools/reference/action-coverage-013.json). Each of its 188 records contains a unique source registration ID, complete original registration text, source SHA-256, callback, argument types, builders, extracted numeric bounds/defaults, known concrete expansions, 0.12 catalog/dispatcher match and implementation notes. Exact builder/callback text is authoritative; extracted range metadata is only a convenience.

## What the existing 18 matches mean

The four additions are `App::Stop`, `App::Internal::Random`, `App::Fullscreen::Toggle` and `App::Library::Show`. They must not increase the original-template coverage numerator. F12 Stop has no universal WPF action counterpart.

The original-template matches are listed below. “Wired” describes reachability through the guarded host, not unrestricted WPF compatibility.

| Original action | 0.12 route | Important adaptation |
|---|---|---|
| `Internal::Playlist::Prev` | `Index.ets:488` | Portable adapter through existing guarded host command. No claim of Windows input providers or device verification. |
| `Internal::Playlist::Next` | `Index.ets:489` | Portable adapter through existing guarded host command. No claim of Windows input providers or device verification. |
| `Media::PlayPause::Set` | `Index.ets:467` | OHOS new action default is true (1); WPF new bool action default is false. Guarded pause intentionally closes output permission. |
| `Media::PlayPause::Toggle` | `Index.ets:466` | Routes through OHOS playback/source/foreground/readiness safety gates. |
| `Media::Speed::Offset` | `Index.ets:485` | OHOS speed result 0.25..4, delta -4..4, default +0.25; source minimum result 0.01 with no upper cap and delta default 0. |
| `Media::Speed::Set` | `Index.ets:484` | OHOS speed 0.25..4, default 1; source minimum 0.01, no upper cap, clamped action default 0.01. Both snap abs(1-speed)<0.01. |
| `Media::ScriptOffset::Offset` | `Index.ets:476` | OHOS argument and final offset +/-60 seconds, default +0.05; WPF source default 0 with no explicit time bound. |
| `Media::Position::Time::Offset` | `Index.ets:475` | OHOS argument +/-86400 seconds and default +5; source action default 0 without that cap. |
| `Media::Loop::Clear` | `Index.ets:493` | Portable adapter through existing guarded host command. No claim of Windows input providers or device verification. |
| `Media::Loop::Start::Set::FromMediaPosition` | `Index.ets:491` | Portable adapter through existing guarded host command. No claim of Windows input providers or device verification. |
| `Media::Loop::End::Set::FromMediaPosition` | `Index.ets:492` | Portable adapter through existing guarded host command. No claim of Windows input providers or device verification. |
| `Media::Bookmark::SeekToNext` | `Index.ets:483` | Portable adapter through existing guarded host command. No claim of Windows input providers or device verification. |
| `Media::Bookmark::SeekToPrev` | `Index.ets:482` | Portable adapter through existing guarded host command. No claim of Windows input providers or device verification. |
| `Media::Chapter::SeekToNext` | `Index.ets:481` | Portable adapter through existing guarded host command. No claim of Windows input providers or device verification. |
| `Media::Chapter::SeekToPrev` | `Index.ets:480` | Portable adapter through existing guarded host command. No claim of Windows input providers or device verification. |
| `Axis::Sync` | `Index.ets:487` | Currently selected-axis-only; WPF has a configured DeviceAxis argument (null does nothing). Add explicit stable axis targets before claiming argument parity. |
| `Axis::SyncAll` | `Index.ets:486` | Portable adapter through existing guarded host command. No claim of Windows input providers or device verification. |
| `Axis::ScriptOffset::Offset` | `Index.ets:477` | Currently selected-axis-only and +/-60-second argument/final clamp; WPF uses configured axis and no explicit offset bound. |

The A/B actions already support ready native video as well as Internal playback: `PlaylistPresentation.dispatch` distinguishes `mediaConnected` from Internal `connected`. They are not Internal-only. Existing bookmark/chapter next/previous actions use the first available metadata collection, raw marker times and ±1.5-second source boundaries. Explicit configured axis arguments are absent from the frozen 0.12 schema; selected-axis behavior must not be described as complete argument parity.

## Historical pre-implementation 0.13 planning shortlist

1. **P0:** expose the 27 scalar/no-argument actions below, with source-derived tests and the existing guarded host paths. This raises the exposed original-template count from 18 to **45/188**, plus four OHOS additions, for **49 concrete catalog entries**. This is a planning count, not a statement that 0.13 passes.
2. **P1:** introduce strict action-specific arguments and expose the 75 portable templates. Also fix configurable axis targeting for the two existing selected-axis-only actions. P0 + P1 would reach **120/188 templates**. The six abstract provider Set/Offset templates expand across four providers, so this would yield **138 concrete original action names**, plus the four OHOS additions. Counts must be generated from actual tested exposure, not copied from this plan.
3. Keep the remaining P2/deferred entries absent or explicitly unavailable. Do not let a catalog declaration route to a silent no-op, fabricate an axis gesture from a button value, implicitly connect/arm output, or reintroduce arbitrary path loading.

### P0 exact shortlist

The current `{id, value}` representation can express these arguments. `SyncAll::Cancel` needs a thin public session bridge; all entries still need deliberate host integration and tests. For unbounded source numeric editors, use finite validation and also validate arithmetic results/conversions. A finite seconds argument can overflow when multiplied by 1000.

| Action | Source argument bounds and defaults | Existing behavior / work needed |
|---|---|---|
| `Internal::Shuffle::Set` | Enable shuffle: bool; default false | InternalPlaylist.setShuffling; Index.persistInternalPlaylist. Source setters work while disconnected; current PlaylistPresentation shuffle command requires Internal connected. Adapt preferences directly and persist mutual exclusion. |
| `Internal::Shuffle::Toggle` | No arguments | InternalPlaylist.setShuffling; Index.persistInternalPlaylist. Toggle existing shuffling, preserve source mutual exclusion with looping; source does not require connection. |
| `Internal::Looping::Set` | Enable looping: bool; default false | InternalPlaylist.setLooping; Index.persistInternalPlaylist. Source setters work while disconnected; current presentation loop command requires Internal connected. Adapt preferences directly and persist mutual exclusion. |
| `Internal::Looping::Toggle` | No arguments | InternalPlaylist.setLooping; Index.persistInternalPlaylist. Toggle existing looping, preserve source mutual exclusion with shuffling; source does not require connection. |
| `Internal::Playlist::Clear` | No arguments | Index.playlistAction(clear); InternalPlaylist.clear. Connected-only Clear must route through playlistAction/applyInternalEvents: clear queue, reset scripts, output Stop and persist playlist. Never directly clear only the array. |
| `Internal::Playlist::PlayByIndex` | Index: 0..double.MaxValue; step 1; default 0 | Index.playlistAction(select,index); InternalPlaylist.playAt. Integer >=0; runtime validates current playlist length. Await owned script publication exactly like existing Prev/Next. |
| `Media::ScriptOffset::Set` | Value: double.MinValue..double.MaxValue; step 1; default 0 | PlaybackSessionCore.setGlobalOffset; Index.changeOffset. Source accepts any finite representable seconds; current OHOS offset shortcut policy is +/-60 seconds. Either preserve this explicit bound or deliberately expand/test it; do not label it the source bound. |
| `Media::Position::Time::Set` | Value: 0..double.MaxValue; step 1; default 0 | Index.seekTransport; mediaSeekTarget. Source numeric argument >=0 seconds; clamp against finite authoritative media duration and route through seekTransport. |
| `Media::Position::Percent::Offset` | Value offset: -1..1; step 0.01; default 0 | PlaybackSessionCore.mediaPositionSeconds/mediaDurationSeconds; Index.seekTransport. Offset is -1..1 normalized, calculated from current mediaPosition/mediaDuration. Require finite nonzero duration before division. |
| `Media::Position::Percent::Set` | Value: 0..1; step 0.01; default 0 | PlaybackSessionCore.mediaDurationSeconds; Index.seekTransport. Value is 0..1 normalized. Use authoritative duration, not stale UI document length. |
| `Media::Position::SkipToScriptStart` | Offset: double.MinValue..double.MaxValue; step 1; default 0 | seekToScriptStart; engine.axisKeyframes; Index.seekTransport. Use the configured action offset with onlyWhenBefore=false; existing panel helper uses autoSkip.offsetSeconds and therefore cannot be reused unchanged. Source default argument is 0, not auto-skip runtime -5. |
| `Media::Loop::CycleSetStartEnd` | No arguments | Index.playlistAction(loopCycle); MediaLoopControls.cycle. Existing cycle helper: complete loop clears; no start sets start; otherwise sets end. Supports ready Internal and native video. |
| `Media::Loop::Start::Set` | Position: 0..double.MaxValue; step 1; default 0 | MediaLoopControls.setStart; Index.seekTransport. Use action value rather than current position; apply returned seek through existing host fencing. |
| `Media::Loop::End::Set` | Position: 0..double.MaxValue; step 1; default 0 | MediaLoopControls.setEnd; Index.seekTransport. Use action value rather than current position; apply returned seek through existing host fencing. |
| `Media::Loop::Set::FromCurrentChapter` | No arguments | Index.playlistAction(loopChapter); MediaLoopControls.fromCurrentChapter. First non-null chapter collection; inclusive endpoints and +/-1 second tolerance from MediaLoopControls, not manual MarkerNavigation rules. |
| `Media::AutoSkipToScriptStartEnabled::Set` | Auto-skip to script start enabled: bool; default false | PlaybackSessionCore.changePlaybackConfiguration; AutoSkipToScriptStart. Persist via playback configuration; source scheduled callback does not recheck enabled, so any extra cancellation policy must be explicit. |
| `Media::AutoSkipToScriptStartEnabled::Toggle` | No arguments | PlaybackSessionCore.playbackConfiguration/changePlaybackConfiguration. Toggle saved autoSkipEnabled and keep live helper/config synchronized. |
| `Media::AutoSkipToScriptStartOffset::Set` | Value: double.MinValue..double.MaxValue; step 1; default 0 | PlaybackConfiguration.MIN_AUTO_SKIP_OFFSET_SECONDS; changePlaybackConfiguration. WPF action allows signed offsets without an explicit finite upper bound; current PlaybackConfiguration only supports -86400..0. Keep this restricted or deliberately extend schema/tests. |
| `Media::Bookmark::SeekToByIndex` | Bookmark index: 0..double.MaxValue; step 1; default 0 | AxisScriptBinding.resource.bookmarks; Index.seekTransport. Integer >=0; validate the first available bookmark collection length, then seek raw marker time. |
| `Media::Chapter::SeekToByIndex` | Chapter index: 0..double.MaxValue; step 1; default 0 | AxisScriptBinding.resource.chapters; Index.seekTransport. Integer >=0; validate the first available chapter collection length, then seek raw start time. |
| `Axis::SyncAll::Cancel` | No arguments | AxisPipeline.requestSync(undefined,false). No-argument thin guarded session bridge to requestSync(undefined,false). Cancellation clears sync time, not motion/playing. |
| `Sync::Duration::Set` | Value: 0.5..8; step 0.5; default 4 | PlaybackSessionCore.changeSync; SyncConfiguration. Duration 0.5..8 seconds, step 0.5, action default 4. Update persistent sync configuration, not active counter by direct mutation. |
| `Sync::SyncOnMediaResourceChanged::Set` | Sync on media resource changed enabled: bool; default false | PlaybackSessionCore.configurationSnapshot().sync/changeSync. Set matching saved boolean through changeSync; retain other sync settings. No toggle registration is implied. |
| `Sync::SyncOnScriptResourceChanged::Set` | Sync on script resource changed enabled: bool; default false | PlaybackSessionCore.configurationSnapshot().sync/changeSync. Set matching saved boolean through changeSync; retain other sync settings. No toggle registration is implied. |
| `Sync::SyncOnMediaPlayPause::Set` | Sync on media play/pause enabled: bool; default false | PlaybackSessionCore.configurationSnapshot().sync/changeSync. Set matching saved boolean through changeSync; retain other sync settings. No toggle registration is implied. |
| `Sync::SyncOnSeek::Set` | Sync on media seek enabled: bool; default false | PlaybackSessionCore.configurationSnapshot().sync/changeSync. Set matching saved boolean through changeSync; retain other sync settings. No toggle registration is implied. |
| `Sync::SyncOnAutoHomeStartEnd::Set` | Sync on auto-home start/end enabled: bool; default false | PlaybackSessionCore.configurationSnapshot().sync/changeSync. Set matching saved boolean through changeSync; retain other sync settings. No toggle registration is implied. |

### P1 argument and session contract

- Keep old persisted `{id,value}` mappings valid through an explicit additive migration. Do not widen old bounds or change old defaults implicitly. Reject unknown fields, invalid enum values, unsupported action/data combinations and non-finite numbers; preserve ordered action lists.
- Bind axis operations to a validated active-profile axis identity. Define whether an empty target means selected-at-dispatch or unavailable; never silently turn it into “all.” The source default `DeviceAxis` argument is null, which normally does nothing. Selected-axis convenience is an OHOS adaptation.
- Treat a linked/input axis separately from the target axis. Reject self/unknown references and longer Link cycles through `SettingsSchema`/`changeAxisConfiguration`. Smart/Motion previous-frame dependency cycles are not Link cycles.
- Use an allowlisted provider ID and action-specific enum selection. Generic abstract provider templates expand to all four concrete names; the Custom Curve, Looping Script, Pattern and Random registrations each apply only to their own provider.
- Use bounded plain strings only for existing metadata/playlist lookup. A lookup string must never be treated as an executable action, endpoint, credential or file path to open.
- A two-value loop action needs two named numeric parameters. Curve points and SmartLimit point collections remain P2 until their structured argument model and editor are implemented; a lone numeric value is insufficient.
- Mutate cloned values through owning session methods so persistence, configuration validation, sync effects, link reload and output provenance remain coherent. `changeAxisConfiguration`, `changeMotionConfiguration`, `changeSync` and playback configuration already exist.
- Take parameter defaults from each registration builder, not from the current runtime setting. Source `WithItemsSource` does not select its first entry. Numeric `default(T)` is zero, then clamped to the builder minimum. Boolean default is false unless explicit. Notable exceptions include Sync duration 4 and Custom Curve Reset request-sync true.

### Source semantics and historical integration risks

1. **Lock-all toggle versus bypass-all toggle.** `Axis::LockAll::Toggle` flips each axis independently. `Axis::Bypass::All::Toggle` computes OR of Script/MotionProvider/Transition bypass, then sets all three to its inverse. Bypass/lock are not emergency Stop.
2. **Disconnected Internal preferences.** WPF Shuffle/Looping Set/Toggle are not connection-gated. The existing OHOS panel controller gates these commands behind Internal connected. New shortcuts should use the underlying preference setters and persistence deliberately, rather than inheriting that restriction unnoticed. Enabling either mode disables the other.
3. **Sync ordering.** The core pipeline supports `requestSync(axisNames, false)`, but 0.12 session exposes only enable/reset. Do not cancel by Stop or by rebuilding. Configuration changes are adopted on the next pipeline step and can request sync; `[change configuration, cancel sync]` needs a regression test proving sync is not revived on the next tick. WPF property notifications occur synchronously before the cancel callback.
4. **Script-start versus gap skip.** Manual `Media::Position::SkipToScriptStart` has action offset default 0 and `onlyWhenBefore=false`; the panel path uses the saved auto-skip offset, default -5. General `Script::SkipGap` instead uses current `AxisState.Index/InsideScript`, picks the earliest later gap and requires a gap strictly greater than minimumSkip (action default 2). WPF's implementation unexpectedly takes `AxisKeyframes.Keys` rather than its supplied axis filter. Do not quietly claim either source-compatible or corrected filtering without a deliberate contract.
5. **Auto-skip offsets.** WPF action accepts signed offsets without a source upper cap. Existing OHOS saved schema admits only -86400..0 seconds. Either expose that restriction honestly or separately widen the schema and regression tests. The source already-scheduled callback does not recheck Enabled; extra cancellation is a documented safety policy.
6. **Speed-limit reciprocal and rounding.** Units/s values clamp nonnegative and use C# `Math.Round(value, 2)` (midpoint-to-even). Seconds/unit zero maps to positive infinity; inverse infinity maps to zero. Existing `AxisConfiguration.toJson/fromJson` preserves positive infinity using its literal sentinel. Naive JSON serialization turns it into null; naive `Math.round` also differs at midpoint cases. Use differential edge-case tests.
7. **Motion action ranges differ from storage ranges.** Custom Curve Duration shortcut is 1..60 seconds, step 1, default 1, though provider storage accepts wider positive durations. Random Octaves shortcut is a positive Int32, not the UI's 1..8 range. Generic Speed minimum is 0.01 with no finite source UI upper cap. Minimum/Maximum independently clamp 0..1; reversed ranges are supported.
8. **Custom Curve Reset.** `CustomCurveMotion.reset` already resets state playing=true; the session bridge currently suppresses the optional sync request. Add the configured request-sync (default true) without recreating the provider or resetting unrelated phase.
9. **Name and index lookup.** Bookmark/chapter names use ordinal case-insensitive first match. Indices are zero-based integers and must be in the selected first collection. Do not apply selected-axis offsets or the different manual marker-navigation policy. Internal PlayByName searches existing playlist name/fullName case-insensitively; it is not a path importer.
10. **Motion-while-paused settings.** `UpdateMotionProviderWhenPaused` and `UpdateMotionProviderWithoutScript` can enable generated motion during paused/no-script operation. Changing them must never acquire arming, auto-connect or revive globally stopped processing. Maintain the existing intent/provenance gates.
11. **Self-modifying shortcuts.** Source Enable actions match the first exact ordinal name. A stable-ID adaptation is preferable, but disable/remove/self-disable must retire pending timers and chains immediately. Updating persisted Enabled alone is insufficient.
12. **Async additional-script reload.** Existing LoadAdditionalScripts host work prepares/reloads managed items asynchronously. The 0.12 preparation predicate lacks the owning shortcut lease. A Stop/focus change during it must not permit stale publication, subsequent actions, or revived playback.

## P2 and deferred work

- **Debug::Log** (`Source/MultiFunPlayer/Bootstrapper.cs:117–120`): No supported NLog-equivalent local logger exposed. Do not add a decorative no-op log action.
- **Internal::LoadAdditionalScripts::Set** (`Source/MultiFunPlayer/MediaSource/ViewModels/InternalMediaSource.cs:433–433`): Existing host can rebuild associated scripts, but its current asynchronous prepareInternalItems predicate lacks the owning shortcut lease. Add lifecycle/Stop cancellation before chaining this action.
- **Internal::LoadAdditionalScripts::Toggle** (`Source/MultiFunPlayer/MediaSource/ViewModels/InternalMediaSource.cs:434–434`): Same asynchronous reload ownership requirement as Set. Preserve only managed Download identities, no new file access UI.
- **MotionProvider::Custom Curve::Points::Set** (`Source/MultiFunPlayer/MotionProvider/ViewModels/CustomCurveMotionProvider.cs:217–227`): Structured points plus duration and interpolation are one source argument object. Existing curve storage alone is not a shortcut argument editor. Apply atomically and invalidate motion provenance.
- **Script::SkipGap** (`Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1594–1597`): Only scriptStartPosition/SkipGap(0) is ported. General SkipGap uses each current AxisState.Index/InsideScript and requires a gap strictly greater than minimumSkip. WPF surprisingly ignores the supplied axes filter when taking AxisKeyframes.Keys.MinBy; choose and document intended versus bug-compatible behavior. Never substitute seek-to-script-start.
- **Axis::Value::Offset** (`Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1601–1605`): Pipeline primitive exists but no public session command/intent adapter. Direct transition can produce motion: prove Stop dominance, fresh intent, provenance and clamp/append semantics before enabling.
- **Axis::Value::Set** (`Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1607–1611`): Pipeline primitive exists but no public session command/intent adapter. Requires explicit axis/value/duration and motion safety validation.
- **Axis::ClearScript** (`Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1705–1706`): Store supports selected clear, but session exposes only all-script clear. New targeted bridge must preserve lock semantics, provenance and source identity.
- **Axis::ReloadScript** (`Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1710–1711`): Store supports selected reload, but session has no public targeted reload adapter. Preserve discovered resources, lock/link behavior and output invalidation.
- **Axis::SmartLimitPoints::Set** (`Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1775–1780`): Structured ordered points in 0..100 percent; default [(50,50)]. Do not confuse with Custom Curve normalized Y or silently reorder imported points.
- **Shortcut::Enabled::Set** (`Source/MultiFunPlayer/UI/Controls/ViewModels/ShortcutSettingsViewModel.cs:283–286`): Original first exact ordinal name match can be ambiguous. Adopt explicit stable mapping IDs with a documented adaptation; cancel disabled mapping timers and queued chains, including self-disable.
- **Shortcut::Enabled::Toggle** (`Source/MultiFunPlayer/UI/Controls/ViewModels/ShortcutSettingsViewModel.cs:288–290`): Same stable identity/self-disable cancellation requirement as Set. Configuration replacement must not accidentally resume the old chain.

Deferred families remain useful future work, but require separate capability/authority boundaries:

- 24 media integration templates include common AutoConnect and Connection registrations. An Internal-only implementation would cover a specialization, not all twelve source instances. Endpoint/authentication/client/device and MPV arguments remain outside this local shortcut increment.
- 25 total output-family templates exist: 21 non-Drive entries plus four Drive entries counted in the axis-input category. Range mutation may be pure arithmetic, but the shortcut still needs precise stable output-instance identity, stale-target handling and the established apply/rearm boundary. Middle::Set has an original callback discrepancy already noted in the source audit. This audit does not reopen File-target review.
- Nine Drive templates explicitly consume axis gesture data: three abstract MotionProvider fields, four output range fields, Axis Value and Axis MotionProviderBlend. Button triggers cannot claim these by passing a number with missing delta/time/absolute-relative semantics.
- `Media::Path::Set` and `MotionProvider::Looping Script::Script::Set` accept arbitrary path text in WPF. Preserve the existing managed-Download resource boundary and excluded import UI.

## Acceptance evidence for any claimed 0.13 coverage

- Count actual catalog actions and dispatch implementations against registration IDs. Enumerate concrete provider names separately from templates. Unknown/unsupported targets must be unavailable, not fallback to another axis/output.
- Execute source-derived action callbacks against boundary tables: min/max/zero/negative, enum/null/unknown targets, empty metadata, index overflow, arithmetic overflow and roundtrip settings persistence. For selected callbacks, execute the unchanged C# reference where available, rather than only comparing to copied prose.
- Verify legacy keyboard mappings migrate with identical behavior/defaults. New fields must not grant arbitrary data or executable payloads. Parameters that are irrelevant to an action must be rejected or normalized by a documented schema.
- Test ordered chains, including parameter changes followed by Sync Cancel, multiple sequential axis changes, runtime configuration adoption, async playlist selection then Play, cancel/Stop during selection, self-disable, source/profile changes and late native callbacks.
- Assert no new action calls Connect, Arm, starts standalone motion, opens arbitrary resources, acquires grants, or bypasses the existing output intent/provenance fencing. Guarded action failure must not advance into an unsafe later action.
- Test actual page dispatch/controller integration and action editor roundtrips, not only pure catalog counts. Then run the existing local-input/persistence/source-control/output regression suites and the real OHOS SDK build. No device/physical-output success follows from mocks or this source audit.

## Complete 188-template classification

This table is an index; per-action callback, parameter bounds and exact source text are in the JSON ledger. The planning column is frozen relative to 0.12. The actual candidate column comes from the handler/dependency audit above and is frozen after the 1514-test/clean-SDK pass; physical device parity remains unverified.

| # | Original registration template / concrete specialization | 0.12 planning status | 0.13 actual candidate | Registration source |
|---:|---|---|---|---|
| 1 | `Debug::Log` | P2 deeper | Unwired | `Source/MultiFunPlayer/Bootstrapper.cs:117–120` |
| 2 | `{Name}::AutoConnectEnabled::Set` | Deferred media integration | Partial | `Source/MultiFunPlayer/MediaSource/AbstractMediaSource.cs:165–165` |
| 3 | `{Name}::AutoConnectEnabled::Toggle` | Deferred media integration | Partial | `Source/MultiFunPlayer/MediaSource/AbstractMediaSource.cs:166–166` |
| 4 | `DeoVR::Endpoint::Set` | Deferred media integration | Unwired | `Source/MultiFunPlayer/MediaSource/ViewModels/DeoVRMediaSource.cs:250–254` |
| 5 | `Emby::ServerBaseUri::Set` | Deferred media integration | Unwired | `Source/MultiFunPlayer/MediaSource/ViewModels/EmbyMediaSource.cs:333–337` |
| 6 | `Emby::ApiKey::Set` | Deferred media integration | Unwired | `Source/MultiFunPlayer/MediaSource/ViewModels/EmbyMediaSource.cs:341–341` |
| 7 | `Emby::Device::SetByName` | Deferred media integration | Unwired | `Source/MultiFunPlayer/MediaSource/ViewModels/EmbyMediaSource.cs:345–351` |
| 8 | `Emby::RefreshDevices` | Deferred media integration | Unwired | `Source/MultiFunPlayer/MediaSource/ViewModels/EmbyMediaSource.cs:355–355` |
| 9 | `HereSphere::Endpoint::Set` | Deferred media integration | Unwired | `Source/MultiFunPlayer/MediaSource/ViewModels/HereSphereMediaSource.cs:275–279` |
| 10 | `Internal::Shuffle::Set` | P0 scalar | Full (portable contract) | `Source/MultiFunPlayer/MediaSource/ViewModels/InternalMediaSource.cs:423–423` |
| 11 | `Internal::Shuffle::Toggle` | P0 scalar | Full (portable contract) | `Source/MultiFunPlayer/MediaSource/ViewModels/InternalMediaSource.cs:424–424` |
| 12 | `Internal::Looping::Set` | P0 scalar | Full (portable contract) | `Source/MultiFunPlayer/MediaSource/ViewModels/InternalMediaSource.cs:428–428` |
| 13 | `Internal::Looping::Toggle` | P0 scalar | Full (portable contract) | `Source/MultiFunPlayer/MediaSource/ViewModels/InternalMediaSource.cs:429–429` |
| 14 | `Internal::LoadAdditionalScripts::Set` | P2 deeper | Partial | `Source/MultiFunPlayer/MediaSource/ViewModels/InternalMediaSource.cs:433–433` |
| 15 | `Internal::LoadAdditionalScripts::Toggle` | P2 deeper | Partial | `Source/MultiFunPlayer/MediaSource/ViewModels/InternalMediaSource.cs:434–434` |
| 16 | `Internal::Playlist::Clear` | P0 scalar | Full (portable contract) | `Source/MultiFunPlayer/MediaSource/ViewModels/InternalMediaSource.cs:438–438` |
| 17 | `Internal::Playlist::Prev` | Wired 0.12 | Full (portable contract) | `Source/MultiFunPlayer/MediaSource/ViewModels/InternalMediaSource.cs:439–439` |
| 18 | `Internal::Playlist::Next` | Wired 0.12 | Full (portable contract) | `Source/MultiFunPlayer/MediaSource/ViewModels/InternalMediaSource.cs:440–440` |
| 19 | `Internal::Playlist::PlayByIndex` | P0 scalar | Full (portable contract) | `Source/MultiFunPlayer/MediaSource/ViewModels/InternalMediaSource.cs:441–443` |
| 20 | `Internal::Playlist::PlayByName` | P1 typed | Unwired | `Source/MultiFunPlayer/MediaSource/ViewModels/InternalMediaSource.cs:444–453` |
| 21 | `Jellyfin::ServerBaseUri::Set` | Deferred media integration | Unwired | `Source/MultiFunPlayer/MediaSource/ViewModels/JellyfinMediaSource.cs:342–346` |
| 22 | `Jellyfin::ApiKey::Set` | Deferred media integration | Unwired | `Source/MultiFunPlayer/MediaSource/ViewModels/JellyfinMediaSource.cs:350–350` |
| 23 | `Jellyfin::Device::SetByName` | Deferred media integration | Unwired | `Source/MultiFunPlayer/MediaSource/ViewModels/JellyfinMediaSource.cs:354–360` |
| 24 | `Jellyfin::RefreshDevices` | Deferred media integration | Unwired | `Source/MultiFunPlayer/MediaSource/ViewModels/JellyfinMediaSource.cs:364–364` |
| 25 | `MPC-HC::Endpoint::Set` | Deferred media integration | Unwired | `Source/MultiFunPlayer/MediaSource/ViewModels/MpcMediaSource.cs:222–226` |
| 26 | `MPV::Arguments::Set` | Deferred media integration | Unwired | `Source/MultiFunPlayer/MediaSource/ViewModels/MpvMediaSource.cs:351–351` |
| 27 | `OFS::Uri::Set` | Deferred media integration | Unwired | `Source/MultiFunPlayer/MediaSource/ViewModels/OfsMediaSource.cs:234–238` |
| 28 | `Plex::ServerBaseUri::Set` | Deferred media integration | Unwired | `Source/MultiFunPlayer/MediaSource/ViewModels/PlexMediaSource.cs:447–451` |
| 29 | `Plex::PlexToken::Set` | Deferred media integration | Unwired | `Source/MultiFunPlayer/MediaSource/ViewModels/PlexMediaSource.cs:455–455` |
| 30 | `Plex::Client::SetByName` | Deferred media integration | Unwired | `Source/MultiFunPlayer/MediaSource/ViewModels/PlexMediaSource.cs:459–465` |
| 31 | `Plex::RefreshClients` | Deferred media integration | Unwired | `Source/MultiFunPlayer/MediaSource/ViewModels/PlexMediaSource.cs:469–469` |
| 32 | `VLC::Endpoint::Set` | Deferred media integration | Unwired | `Source/MultiFunPlayer/MediaSource/ViewModels/VlcMediaSource.cs:284–288` |
| 33 | `Whirligig::Endpoint::Set` | Deferred media integration | Unwired | `Source/MultiFunPlayer/MediaSource/ViewModels/WhirligigMediaSource.cs:142–146` |
| 34 | `MotionProvider::{name}::Speed::Offset` | P1 typed | Unwired | `Source/MultiFunPlayer/MotionProvider/AbstractMotionProvider.cs:55–58` |
| 35 | `MotionProvider::{name}::Speed::Set` | P1 typed | Unwired | `Source/MultiFunPlayer/MotionProvider/AbstractMotionProvider.cs:60–63` |
| 36 | `MotionProvider::{name}::Speed::Drive` | Deferred axis input | Unwired | `Source/MultiFunPlayer/MotionProvider/AbstractMotionProvider.cs:65–67` |
| 37 | `MotionProvider::{name}::Minimum::Offset` | P1 typed | Unwired | `Source/MultiFunPlayer/MotionProvider/AbstractMotionProvider.cs:71–74` |
| 38 | `MotionProvider::{name}::Minimum::Set` | P1 typed | Unwired | `Source/MultiFunPlayer/MotionProvider/AbstractMotionProvider.cs:76–79` |
| 39 | `MotionProvider::{name}::Minimum::Drive` | Deferred axis input | Unwired | `Source/MultiFunPlayer/MotionProvider/AbstractMotionProvider.cs:81–83` |
| 40 | `MotionProvider::{name}::Maximum::Offset` | P1 typed | Unwired | `Source/MultiFunPlayer/MotionProvider/AbstractMotionProvider.cs:87–90` |
| 41 | `MotionProvider::{name}::Maximum::Set` | P1 typed | Unwired | `Source/MultiFunPlayer/MotionProvider/AbstractMotionProvider.cs:92–95` |
| 42 | `MotionProvider::{name}::Maximum::Drive` | Deferred axis input | Unwired | `Source/MultiFunPlayer/MotionProvider/AbstractMotionProvider.cs:97–99` |
| 43 | `MotionProvider::Custom Curve::InterpolationType::Set` | P1 typed | Unwired | `Source/MultiFunPlayer/MotionProvider/ViewModels/CustomCurveMotionProvider.cs:181–184` |
| 44 | `MotionProvider::Custom Curve::Duration::Set` | P1 typed | Unwired | `Source/MultiFunPlayer/MotionProvider/ViewModels/CustomCurveMotionProvider.cs:188–191` |
| 45 | `MotionProvider::Custom Curve::IsLooping::Set` | P1 typed | Unwired | `Source/MultiFunPlayer/MotionProvider/ViewModels/CustomCurveMotionProvider.cs:195–198` |
| 46 | `MotionProvider::Custom Curve::IsLooping::Toggle` | P1 typed | Unwired | `Source/MultiFunPlayer/MotionProvider/ViewModels/CustomCurveMotionProvider.cs:200–202` |
| 47 | `MotionProvider::Custom Curve::Reset` | P1 typed | Unwired | `Source/MultiFunPlayer/MotionProvider/ViewModels/CustomCurveMotionProvider.cs:206–213` |
| 48 | `MotionProvider::Custom Curve::Points::Set` | P2 deeper | Unwired | `Source/MultiFunPlayer/MotionProvider/ViewModels/CustomCurveMotionProvider.cs:217–227` |
| 49 | `MotionProvider::Looping Script::Script::Set` | Deferred resource path | Unwired | `Source/MultiFunPlayer/MotionProvider/ViewModels/LoopingScriptMotionProvider.cs:96–99` |
| 50 | `MotionProvider::Looping Script::Interpolation::Set` | P1 typed | Unwired | `Source/MultiFunPlayer/MotionProvider/ViewModels/LoopingScriptMotionProvider.cs:103–106` |
| 51 | `MotionProvider::Pattern::Pattern::Set` | P1 typed | Unwired | `Source/MultiFunPlayer/MotionProvider/ViewModels/PatternMotionProvider.cs:73–76` |
| 52 | `MotionProvider::Random::Octaves::Set` | P1 typed | Unwired | `Source/MultiFunPlayer/MotionProvider/ViewModels/RandomMotionProvider.cs:49–52` |
| 53 | `MotionProvider::Random::Persistence::Set` | P1 typed | Unwired | `Source/MultiFunPlayer/MotionProvider/ViewModels/RandomMotionProvider.cs:56–59` |
| 54 | `MotionProvider::Random::Lacunarity::Set` | P1 typed | Unwired | `Source/MultiFunPlayer/MotionProvider/ViewModels/RandomMotionProvider.cs:63–66` |
| 55 | `{Identifier}::AutoConnectEnabled::Set` | Deferred output | Unwired | `Source/MultiFunPlayer/OutputTarget/AbstractOutputTarget.cs:255–255` |
| 56 | `{Identifier}::AutoConnectEnabled::Toggle` | Deferred output | Unwired | `Source/MultiFunPlayer/OutputTarget/AbstractOutputTarget.cs:256–256` |
| 57 | `{Identifier}::Axis::Range::Minimum::Offset` | Deferred output | Unwired | `Source/MultiFunPlayer/OutputTarget/AbstractOutputTarget.cs:260–264` |
| 58 | `{Identifier}::Axis::Range::Minimum::Set` | Deferred output | Unwired | `Source/MultiFunPlayer/OutputTarget/AbstractOutputTarget.cs:266–269` |
| 59 | `{Identifier}::Axis::Range::Minimum::Drive` | Deferred axis input | Unwired | `Source/MultiFunPlayer/OutputTarget/AbstractOutputTarget.cs:271–274` |
| 60 | `{Identifier}::Axis::Range::Maximum::Offset` | Deferred output | Unwired | `Source/MultiFunPlayer/OutputTarget/AbstractOutputTarget.cs:278–282` |
| 61 | `{Identifier}::Axis::Range::Maximum::Set` | Deferred output | Unwired | `Source/MultiFunPlayer/OutputTarget/AbstractOutputTarget.cs:284–287` |
| 62 | `{Identifier}::Axis::Range::Maximum::Drive` | Deferred axis input | Unwired | `Source/MultiFunPlayer/OutputTarget/AbstractOutputTarget.cs:289–292` |
| 63 | `{Identifier}::Axis::Range::Middle::Offset` | Deferred output | Unwired | `Source/MultiFunPlayer/OutputTarget/AbstractOutputTarget.cs:296–301` |
| 64 | `{Identifier}::Axis::Range::Middle::Set` | Deferred output | Unwired | `Source/MultiFunPlayer/OutputTarget/AbstractOutputTarget.cs:303–306` |
| 65 | `{Identifier}::Axis::Range::Middle::Drive` | Deferred axis input | Unwired | `Source/MultiFunPlayer/OutputTarget/AbstractOutputTarget.cs:308–312` |
| 66 | `{Identifier}::Axis::Range::Size::Offset` | Deferred output | Unwired | `Source/MultiFunPlayer/OutputTarget/AbstractOutputTarget.cs:316–321` |
| 67 | `{Identifier}::Axis::Range::Size::Set` | Deferred output | Unwired | `Source/MultiFunPlayer/OutputTarget/AbstractOutputTarget.cs:323–326` |
| 68 | `{Identifier}::Axis::Range::Size::Drive` | Deferred axis input | Unwired | `Source/MultiFunPlayer/OutputTarget/AbstractOutputTarget.cs:328–332` |
| 69 | `{Identifier}::Endpoint::Set` | Deferred output | Unwired | `Source/MultiFunPlayer/OutputTarget/ViewModels/ButtplugOutputTarget.cs:409–413` |
| 70 | `{Identifier}::PipeName::Set` | Deferred output | Unwired | `Source/MultiFunPlayer/OutputTarget/ViewModels/PipeOutputTarget.cs:158–158` |
| 71 | `{Identifier}::SerialPort::Set` | Deferred output | Unwired | `Source/MultiFunPlayer/OutputTarget/ViewModels/SerialOutputTarget.cs:319–319` |
| 72 | `{Identifier}::Endpoint::Set` | Deferred output | Unwired | `Source/MultiFunPlayer/OutputTarget/ViewModels/TcpOutputTarget.cs:181–185` |
| 73 | `{Identifier}::ConnectionKey::Set` | Deferred output | Unwired | `Source/MultiFunPlayer/OutputTarget/ViewModels/TheHandyOutputTarget.cs:202–202` |
| 74 | `{Identifier}::SourceAxis::Set` | Deferred output | Unwired | `Source/MultiFunPlayer/OutputTarget/ViewModels/TheHandyOutputTarget.cs:206–206` |
| 75 | `{Identifier}::Endpoint::Set` | Deferred output | Unwired | `Source/MultiFunPlayer/OutputTarget/ViewModels/UdpOutputTarget.cs:180–184` |
| 76 | `{Identifier}::Uri::Set` | Deferred output | Unwired | `Source/MultiFunPlayer/OutputTarget/ViewModels/WebSocketOutputTarget.cs:186–190` |
| 77 | `{source.Name}::Connection::Toggle` | Deferred media integration | Unwired | `Source/MultiFunPlayer/UI/Controls/ViewModels/MediaSourceViewModel.cs:215–215` |
| 78 | `{source.Name}::Connection::Connect` | Deferred media integration | Unwired | `Source/MultiFunPlayer/UI/Controls/ViewModels/MediaSourceViewModel.cs:216–222` |
| 79 | `{source.Name}::Connection::Disconnect` | Deferred media integration | Unwired | `Source/MultiFunPlayer/UI/Controls/ViewModels/MediaSourceViewModel.cs:223–229` |
| 80 | `{target.Identifier}::Connection::Toggle` | Deferred output | Unwired | `Source/MultiFunPlayer/UI/Controls/ViewModels/OutputTargetViewModel.cs:212–212` |
| 81 | `{target.Identifier}::Connection::Connect` | Deferred output | Unwired | `Source/MultiFunPlayer/UI/Controls/ViewModels/OutputTargetViewModel.cs:213–219` |
| 82 | `{target.Identifier}::Connection::Disconnect` | Deferred output | Unwired | `Source/MultiFunPlayer/UI/Controls/ViewModels/OutputTargetViewModel.cs:220–226` |
| 83 | `Media::PlayPause::Set` | Wired 0.12 | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1413–1418` |
| 84 | `Media::PlayPause::Toggle` | Wired 0.12 | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1420–1420` |
| 85 | `Media::Path::Set` | Deferred resource path | Unwired | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1424–1424` |
| 86 | `Media::Speed::Offset` | Wired 0.12 | Partial | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1428–1430` |
| 87 | `Media::Speed::Set` | Wired 0.12 | Partial | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1431–1433` |
| 88 | `Media::ScriptOffset::Offset` | Wired 0.12 | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1444–1445` |
| 89 | `Media::ScriptOffset::Set` | P0 scalar | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1446–1447` |
| 90 | `Media::Position::Time::Offset` | Wired 0.12 | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1451–1452` |
| 91 | `Media::Position::Time::Set` | P0 scalar | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1453–1454` |
| 92 | `Media::Position::Percent::Offset` | P0 scalar | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1456–1458` |
| 93 | `Media::Position::Percent::Set` | P0 scalar | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1459–1460` |
| 94 | `Media::Position::SkipToScriptStart` | P0 scalar | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1462–1463` |
| 95 | `Media::Loop::Set::FromMediaPositionOffset` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1467–1470` |
| 96 | `Media::Loop::Set` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1472–1475` |
| 97 | `Media::Loop::CycleSetStartEnd` | P0 scalar | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1477–1485` |
| 98 | `Media::Loop::Start::Set` | P0 scalar | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1487–1487` |
| 99 | `Media::Loop::End::Set` | P0 scalar | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1488–1488` |
| 100 | `Media::Loop::Clear` | Wired 0.12 | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1489–1489` |
| 101 | `Media::Loop::Set::FromCurrentChapter` | P0 scalar | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1490–1490` |
| 102 | `Media::Loop::Start::Set::FromMediaPosition` | Wired 0.12 | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1491–1491` |
| 103 | `Media::Loop::End::Set::FromMediaPosition` | Wired 0.12 | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1492–1492` |
| 104 | `Media::AutoSkipToScriptStartEnabled::Set` | P0 scalar | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1496–1497` |
| 105 | `Media::AutoSkipToScriptStartEnabled::Toggle` | P0 scalar | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1499–1500` |
| 106 | `Media::AutoSkipToScriptStartOffset::Set` | P0 scalar | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1504–1506` |
| 107 | `Media::Bookmark::SeekToByName` | P1 typed | Partial | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1516–1521` |
| 108 | `Media::Bookmark::SeekToByIndex` | P0 scalar | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1523–1528` |
| 109 | `Media::Bookmark::SeekToNext` | Wired 0.12 | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1530–1538` |
| 110 | `Media::Bookmark::SeekToPrev` | Wired 0.12 | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1540–1548` |
| 111 | `Media::Chapter::SeekToByName` | P1 typed | Partial | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1558–1563` |
| 112 | `Media::Chapter::SeekToByIndex` | P0 scalar | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1565–1570` |
| 113 | `Media::Chapter::SeekToNext` | Wired 0.12 | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1572–1580` |
| 114 | `Media::Chapter::SeekToPrev` | Wired 0.12 | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1582–1590` |
| 115 | `Script::SkipGap` | P2 deeper | Unwired | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1594–1597` |
| 116 | `Axis::Value::Offset` | P2 deeper | Unwired | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1601–1605` |
| 117 | `Axis::Value::Set` | P2 deeper | Unwired | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1607–1611` |
| 118 | `Axis::Value::Drive` | Deferred axis input | Unwired | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1613–1615` |
| 119 | `Axis::Sync` | Wired 0.12 | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1619–1620` |
| 120 | `Axis::Sync::Cancel` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1622–1623` |
| 121 | `Axis::SyncAll` | Wired 0.12 | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1625–1625` |
| 122 | `Axis::SyncAll::Cancel` | P0 scalar | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1626–1626` |
| 123 | `Axis::Lock::Set` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1630–1633` |
| 124 | `Axis::Lock::Toggle` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1635–1636` |
| 125 | `Axis::LockAll::Set` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1638–1640` |
| 126 | `Axis::LockAll::Toggle` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1642–1642` |
| 127 | `Axis::Bypass::All::Set` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1646–1658` |
| 128 | `Axis::Bypass::All::Toggle` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1660–1671` |
| 129 | `Axis::Bypass::Script::Set` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1675–1678` |
| 130 | `Axis::Bypass::Script::Toggle` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1680–1681` |
| 131 | `Axis::Bypass::MotionProvider::Set` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1685–1688` |
| 132 | `Axis::Bypass::MotionProvider::Toggle` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1690–1691` |
| 133 | `Axis::Bypass::Transition::Set` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1695–1698` |
| 134 | `Axis::Bypass::Transition::Toggle` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1700–1701` |
| 135 | `Axis::ClearScript` | P2 deeper | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1705–1706` |
| 136 | `Axis::ReloadScript` | P2 deeper | Partial | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1710–1711` |
| 137 | `Axis::InterpolationType::Set` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1715–1718` |
| 138 | `Axis::InvertScript::Set` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1722–1725` |
| 139 | `Axis::InvertScript::Toggle` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1727–1728` |
| 140 | `Axis::LinkPriority::Set` | P1 typed | Partial | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1732–1735` |
| 141 | `Axis::LinkPriority::Toggle` | P1 typed | Partial | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1737–1738` |
| 142 | `Axis::SmartLimitInputAxis::Set` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1742–1752` |
| 143 | `Axis::SmartLimitMode::Set` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1756–1759` |
| 144 | `Axis::SmartLimitTargetValue::Offset` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1763–1766` |
| 145 | `Axis::SmartLimitTargetValue::Set` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1768–1771` |
| 146 | `Axis::SmartLimitPoints::Set` | P2 deeper | Unwired | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1775–1780` |
| 147 | `Axis::LinkAxis::Set` | P1 typed | Partial | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1784–1794` |
| 148 | `Axis::SpeedLimitEnabled::Set` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1798–1801` |
| 149 | `Axis::SpeedLimitEnabled::Toggle` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1803–1804` |
| 150 | `Axis::SpeedLimitSecondsPerUnit::Offset` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1811–1814` |
| 151 | `Axis::SpeedLimitSecondsPerUnit::Set` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1816–1819` |
| 152 | `Axis::SpeedLimitUnitsPerSecond::Offset` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1823–1826` |
| 153 | `Axis::SpeedLimitUnitsPerSecond::Set` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1828–1831` |
| 154 | `Axis::AutoHomeEnabled::Set` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1835–1838` |
| 155 | `Axis::AutoHomeEnabled::Toggle` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1840–1841` |
| 156 | `Axis::AutoHomeDelay::Offset` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1845–1848` |
| 157 | `Axis::AutoHomeDelay::Set` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1850–1853` |
| 158 | `Axis::AutoHomeInsideScript::Set` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1857–1860` |
| 159 | `Axis::AutoHomeInsideScript::Toggle` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1862–1863` |
| 160 | `Axis::AutoHomeDuration::Offset` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1867–1870` |
| 161 | `Axis::AutoHomeDuration::Set` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1872–1875` |
| 162 | `Axis::AutoHomeTargetValue::Offset` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1879–1882` |
| 163 | `Axis::AutoHomeTargetValue::Set` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1884–1887` |
| 164 | `Axis::ScriptOffset::Offset` | Wired 0.12 | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1891–1894` |
| 165 | `Axis::ScriptOffset::Set` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1896–1899` |
| 166 | `Axis::ScriptScale::Offset` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1903–1906` |
| 167 | `Axis::ScriptScale::Set` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1908–1911` |
| 168 | `Axis::MotionProvider::Set` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1916–1919` |
| 169 | `Axis::MotionProviderBlend::Offset` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1925–1928` |
| 170 | `Axis::MotionProviderBlend::Set` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1930–1933` |
| 171 | `Axis::MotionProviderBlend::Drive` | Deferred axis input | Unwired | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1935–1937` |
| 172 | `Axis::MotionProviderFillGaps::Set` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1941–1944` |
| 173 | `Axis::MotionProviderFillGaps::Toggle` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1946–1947` |
| 174 | `Axis::MotionProviderMinimumGapDuration::Offset` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1951–1954` |
| 175 | `Axis::MotionProviderMinimumGapDuration::Set` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1956–1959` |
| 176 | `Axis::UpdateMotionProviderWithAxis::Set` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1963–1973` |
| 177 | `Axis::UpdateMotionProviderWhenPaused::Set` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1977–1980` |
| 178 | `Axis::UpdateMotionProviderWhenPaused::Toggle` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1982–1983` |
| 179 | `Axis::UpdateMotionProviderWithoutScript::Set` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1987–1990` |
| 180 | `Axis::UpdateMotionProviderWithoutScript::Toggle` | P1 typed | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1992–1993` |
| 181 | `Sync::Duration::Set` | P0 scalar | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1997–1999` |
| 182 | `Sync::SyncOnMediaResourceChanged::Set` | P0 scalar | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:2003–2004` |
| 183 | `Sync::SyncOnScriptResourceChanged::Set` | P0 scalar | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:2008–2009` |
| 184 | `Sync::SyncOnMediaPlayPause::Set` | P0 scalar | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:2013–2014` |
| 185 | `Sync::SyncOnSeek::Set` | P0 scalar | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:2018–2019` |
| 186 | `Sync::SyncOnAutoHomeStartEnd::Set` | P0 scalar | Full (portable contract) | `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:2023–2024` |
| 187 | `Shortcut::Enabled::Set` | P2 deeper | Unwired | `Source/MultiFunPlayer/UI/Controls/ViewModels/ShortcutSettingsViewModel.cs:283–286` |
| 188 | `Shortcut::Enabled::Toggle` | P2 deeper | Unwired | `Source/MultiFunPlayer/UI/Controls/ViewModels/ShortcutSettingsViewModel.cs:288–290` |
