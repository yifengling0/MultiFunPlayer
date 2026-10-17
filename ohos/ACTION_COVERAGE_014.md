# 0.14 original shortcut action coverage

Audit snapshot: 2026-10-16T20:22:46.679782+00:00. Original source: `36c08fbb99ac9398a63ff1cca1bbf68cd2228a94`. Implementation baseline: immutable `0.13.0-b484dd7bd188a4cd/source`.

## Current result and what the counts mean

**150 unique runtime-evaluated catalog actions = 146 original concrete names + 4 OHOS additions.** The 146 original names map to **128 of 188 original registration templates**. Reusable registrations are counted once per original call site, not once per expanded provider name. No catalog-only or underlying-model-only entry receives wiring credit.

| Classification | Original templates | Exposed original concrete names |
|---|---:|---:|
| Full command wiring within the declared portable contract | **107** | **113** |
| Partial original behavior/domain/dependency coverage | **21** | **33** |
| Unwired | **60** | **0** |
| Total | **188** | **146** |

“Full” means the source command and known dependent behavior are wired for valid explicit active targets within the documented OHOS foreground/readiness/input/safety contract. It does not mean unrestricted Windows input, WPF controls, arbitrary repositories, native backend acceptance or device parity. Selected-axis convenience, historical action defaults, strict malformed/non-finite-input rejection, safe failure handling and lifecycle cancellation remain disclosed adaptations. Known specific domain or loaded-view omissions are classified partial, rather than hidden under that general qualification.

**Final local validation:** 1731/1731 tests with actual .NET oracles, zero skips/failures; official SDK clean HAP passed. Two independent 44-case stages passed, with focused regressions. Exact artifact hashes and limits are in VALIDATION.md. This does not certify physical/WPF/visual parity.

## Reproducible count and evidence

- Evaluated the real `shortcutActionCatalog()` under Node 24; all 150 IDs are unique. Every original catalog name maps to exactly one original registration template.
- Every inherited 0.13 handler/dependency anchor was re-located in current source; new handlers were followed into their owning reducer, session, playlist/engine or resource transaction. Hashes record this audit snapshot, not a promise that files will remain unchanged during integration.
- All original registration-source files were byte-compared to immutable 0.13. The 188 original source registrations, names, hashes, argument declarations and callbacks remain available in the frozen 0.13 ledger; current per-template statuses/evidence/specs are in `tools/reference/action-coverage-014-source.json` under `coverage014Templates`.
- [Detailed source-chain audit](SHORTCUT_ACTIONS_014_SOURCE_AUDIT.md) covers Fody setters, dependent properties, mounted controls, same-value behavior, sync ordering, timers, matching and lock/resource identity.

### Change from immutable 0.13

| Measure | 0.13 | Current 0.14 |
|---|---:|---:|
| Catalog concrete actions, including OHOS additions | 113 | 150 |
| Original concrete names | 109 | 146 |
| Original registration templates with a real route | 109 | 128 |
| Full within portable contract | 97 | 107 |
| Partial | 12 | 21 |
| Unwired | 79 | 60 |

The addition is exactly **19 templates / 37 concrete names**: Motion 16 templates expand to 34 names; Internal PlayByName adds one; Shortcut Enabled adds two. Motion’s six shared scalar templates expand across Custom Curve, Looping Script, Pattern and Random. The existing four reload/link templates do not increase coverage counts merely because their dependency implementation improved.

## Current dependency routes

- **Motion (16 templates / 34 names):** Index → exact provider/action resolver → cloned pure reducer → `changeMotionConfiguration` → existing `MotionRegistry.configureProvider` and provider configure. The named provider is updated even when another is selected. Changed properties request sync, retain phase/seed/write cache, and do not manufacture a frame or Arm. Custom Reset routes to an explicit optional sync-before-phase-reset command; default true differs intentionally from UI Reset default false. Repeated Reset still executes; same-value scalar Set does not create a setter notification.
- **Named Internal selection:** Index uses the pinned .NET OrdinalIgnoreCase helper on first Name OR FullName, then the same awaited managed `playlistAction(select)` path as index selection. It does not turn input text into an I/O path. Current-item selection restarts position without rereading the resource and preserves playing/paused state.
- **Shortcut Enabled:** first exact ordinal name in stored mapping order; persists the enabled setting and calls `LocalShortcutEngine.setMappingEnabled`. This does not rebuild all runtime entries, cancel the current batch or admitted hold/click callbacks. New gesture admission is gated; Stop/F12, focus/IME/background/source retirement and ordinary settings replacement remain independent cancellation boundaries.
- **Managed Reload/Link:** Index `reloadManagedAxisScripts` → session `beginScriptReload` (Sync before I/O) → scan the same authorized Download root → reread/parse current source/companions → fresh bindings → `completeScriptReload` → `AxisScriptStore.reload` and synchronous pipeline adoption. Cancel/source/config/profile/dispatch identity changes cannot commit stale reads. LinkAxis executes this command even for same-value assignments; LinkPriority invokes it on an actual change. Priority-only targets skip search.
- **Strict reload failure:** incomplete or warning-bearing reindex, unreadable/malformed companion, parse and ZIP failure abort the reload, cancel its epoch and disarm; the old binding is retained as an explicitly failed operation. A genuine no-match from a complete error-free search is distinct and may retain the ordinary resource with a zero-result status. Initial source-open skip-on-bad-candidate behavior is unchanged. This intentional bounded safe-failure policy is not a claim of unrestricted source repository error equivalence.
- **Resource semantics:** no force bypasses an existing locked resource. A missing ordinary non-priority match retains the prior resource; eligible links resolve in the source-defined order. Fresh equal-content reads remain new reference identities; linked wrappers are new identities. Media/Motion clocks are not cold-reset by the command. Source-controlled output remains pending until a genuine new frame; cancellation/disarm safety behavior is separate from source numerical parity.
- **Existing Media/Axis/Sync/Internal routes:** current evidence anchors cover the reducers and owning session/media dependencies from the frozen 0.13 audit. Source→Fody→bound handler effects for Offset, Scale, Invert, Link, smart-limit inputs and selected provider remain explicit; short registration callbacks are not used to erase those effects.

## The 21 partial templates

Partial means a real command route exists but the listed original scope/effect is restricted or not reproduced. In particular, managed reload is **no longer cache-only**; its remaining limitation is bounded repository scope.

| # | Original template / exposed specialization | Remaining limitation |
|---:|---|---|
| 2 | `{Name}::AutoConnectEnabled::Set → Internal::AutoConnectEnabled::Set` | Only Internal::AutoConnectEnabled::Set is wired. Common WPF registration applies to twelve source names; the other eleven are absent. Saved Internal preference does not connect or arm output. |
| 3 | `{Name}::AutoConnectEnabled::Toggle → Internal::AutoConnectEnabled::Toggle` | Only Internal::AutoConnectEnabled::Toggle is wired. Common WPF registration applies to twelve source names; the other eleven are absent. |
| 14 | `{Name}::LoadAdditionalScripts::Set → Internal::LoadAdditionalScripts::Set` | Additional scripts are resolved only from the existing authorized Download/catalog snapshot, with 64 candidate/expanded-item, 8 MiB text and Funscript action budgets. Does reread authorized script bytes; does not perform the WPF arbitrary local-repository search. |
| 15 | `{Name}::LoadAdditionalScripts::Toggle → Internal::LoadAdditionalScripts::Toggle` | Same managed catalog/search and resource-budget limits as Set. Async prepare/load carries the shortcut lease; no claimed arbitrary-directory repository parity. |
| 20 | `{Name}::Playlist::PlayByName → Internal::Playlist::PlayByName` | First Name OR FullName OrdinalIgnoreCase lookup and current-item restart/pause preservation are wired. Text is at most 4096 UTF-16 units, excludes C0/DEL, and only resolves current managed Download playlist identities; original string argument is unbounded and may be null. |
| 37 | `MotionProvider::{name}::Minimum::Offset` | Independent Clamp01 callback and provider mapping are implemented across all four providers, including reversed ranges. Already-bound WPF RangeSlider MinRange=.01 coercion/write-back is not implemented or runtime-proven; exact third-party coercion ordering is unknown. |
| 38 | `MotionProvider::{name}::Minimum::Set` | Independent Clamp01 callback and provider mapping are implemented across all four providers, including reversed ranges. Already-bound WPF RangeSlider MinRange=.01 coercion/write-back is not implemented or runtime-proven; exact third-party coercion ordering is unknown. |
| 40 | `MotionProvider::{name}::Maximum::Offset` | Independent Clamp01 callback and provider mapping are implemented across all four providers, including reversed ranges. Already-bound WPF RangeSlider MinRange=.01 coercion/write-back is not implemented or runtime-proven; exact third-party coercion ordering is unknown. |
| 41 | `MotionProvider::{name}::Maximum::Set` | Independent Clamp01 callback and provider mapping are implemented across all four providers, including reversed ranges. Already-bound WPF RangeSlider MinRange=.01 coercion/write-back is not implemented or runtime-proven; exact third-party coercion ordering is unknown. |
| 44 | `MotionProvider::{name}::Duration::Set → MotionProvider::Custom Curve::Duration::Set` | Headless Duration setter, sync and pending refresh are wired; points stay intact. A WPF canvas bound to the selected Custom Curve can delete out-of-viewport shared points. Its popup/cached-view lifecycle and deletion are not simulated in OHOS; do not unconditionally prune hidden providers. |
| 52 | `MotionProvider::{name}::Octaves::Set → MotionProvider::Random::Octaves::Set` | Original Int32 1..2147483647 argument values are represented exactly, but the existing Random runtime activation budget rejects Octaves >128 before committing. Bound WPF provider NumericUpDown has maximum 8; its view-dependent write-back is not runtime-proven or reproduced. |
| 86 | `Media::Speed::Offset` | Delta remains -4..4 and resulting rate is clamped to 0.25..4. WPF delta has Double.MinValue..Double.MaxValue and rate minimum 0.01 without an upper cap. Native rate outcome remains backend/device dependent. |
| 87 | `Media::Speed::Set` | Accepted rate is 0.25..4; WPF minimum is 0.01 without an upper cap. Native AVPlayer acceptance/quantization is not device-verified. |
| 107 | `Media::Bookmark::SeekToByName` | Name input is at most 256 UTF-16 code units and rejects C0/DEL control characters; WPF string builder has no corresponding bound. Within this domain, ordinal comparison uses a pinned .NET scalar table. |
| 111 | `Media::Chapter::SeekToByName` | Name input is at most 256 UTF-16 code units and rejects C0/DEL controls; WPF string builder is unbounded. Within domain, ordinal matching and first-collection/raw-time navigation are wired. |
| 136 | `Axis::ReloadScript` | Current host route rescans the same authorized Download root, rereads/parses fresh resources, and commits through begin/complete/cancel ownership tokens. The former cached-only host limitation is fixed. Search remains bounded to that root/catalog and budgets, without original arbitrary local or external repository aggregation. Reload strictly fails on incomplete/warning-bearing reindex, read, parse or ZIP failure: keep old bindings, cancel the transaction epoch and disarm. A genuine complete-search no-match retains ordinary resources with a zero-result status. Independent review and final actual-.NET aggregate/clean SDK passed; see VALIDATION.md for exact scope. |
| 140 | `Axis::LinkPriority::Set` | Current host route rescans the same authorized Download root, rereads/parses fresh resources, and commits through begin/complete/cancel ownership tokens. The former cached-only host limitation is fixed. Search remains bounded to that root/catalog and budgets, without original arbitrary local or external repository aggregation. Reload strictly fails on incomplete/warning-bearing reindex, read, parse or ZIP failure: keep old bindings, cancel the transaction epoch and disarm. A genuine complete-search no-match retains ordinary resources with a zero-result status. Independent review and final actual-.NET aggregate/clean SDK passed; see VALIDATION.md for exact scope. |
| 141 | `Axis::LinkPriority::Toggle` | Current host route rescans the same authorized Download root, rereads/parses fresh resources, and commits through begin/complete/cancel ownership tokens. The former cached-only host limitation is fixed. Search remains bounded to that root/catalog and budgets, without original arbitrary local or external repository aggregation. Reload strictly fails on incomplete/warning-bearing reindex, read, parse or ZIP failure: keep old bindings, cancel the transaction epoch and disarm. A genuine complete-search no-match retains ordinary resources with a zero-result status. Independent review and final actual-.NET aggregate/clean SDK passed; see VALIDATION.md for exact scope. |
| 147 | `Axis::LinkAxis::Set` | Current host route rescans the same authorized Download root, rereads/parses fresh resources, and commits through begin/complete/cancel ownership tokens. The former cached-only host limitation is fixed. Search remains bounded to that root/catalog and budgets, without original arbitrary local or external repository aggregation. Reload strictly fails on incomplete/warning-bearing reindex, read, parse or ZIP failure: keep old bindings, cancel the transaction epoch and disarm. A genuine complete-search no-match retains ordinary resources with a zero-result status. Independent review and final actual-.NET aggregate/clean SDK passed; see VALIDATION.md for exact scope. |
| 187 | `Shortcut::Enabled::Set` | First exact case-sensitive ordinal mapping name is wired, preserving admitted batch and timers. Action lookup text is at most 256 UTF-16 units; saved mapping names at most 80; C0/DEL and null names are rejected. Original null can match an unnamed shortcut and strings are unbounded. Empty OHOS names remain exact strings, not null. |
| 188 | `Shortcut::Enabled::Toggle` | First exact case-sensitive ordinal mapping name is wired, preserving admitted batch and timers. Action lookup text is at most 256 UTF-16 units; saved mapping names at most 80; C0/DEL and null names are rejected. Original null can match an unnamed shortcut and strings are unbounded. Empty OHOS names remain exact strings, not null. |

### Headless numerical proof is not loaded-WPF proof

All shared Minimum/Maximum reducers deliberately preserve independent clamp semantics and reversed ranges. That is source-callback/provider behavior; all four WPF views bind a MinRange=.01 RangeSlider, whose exact coercion/write-back was not executed or reproduced. Duration changes mark provider refresh while preserving points, but a bound Custom Curve canvas can remove out-of-viewport shared points. Only the selected provider is passed to the view; retained axis tabs and third-party popup/view caching make it incorrect to apply pruning universally to hidden providers. Random Octaves has an unrestricted positive Int32 shortcut argument, a bound WPF editor maximum 8, and an OHOS runtime budget 128; those three domains must remain distinct.

## Missing original templates remain missing

**60 templates have no selectable allowlisted command route.** The complete table below lists each. Groups: Debug logging; remaining remote/source connection, endpoint, credential/client/device/process commands; three Motion analog Drive templates, Custom Curve Points::Set, Looping Script Script::Set; all 25 output-target templates; Media::Path::Set; Script::SkipGap; Axis::Value Set/Offset/Drive; Axis::SmartLimitPoints::Set; Axis::MotionProviderBlend::Drive. Internal-only AutoConnect expansion is partial, with other source specializations absent. Existing parameter panels or numerical models do not make these shortcuts implemented.

No new output connection/Arm, arbitrary file/path import, directory or single-video import, Git publication, physical endpoint operation, or File recording review is certified by this ledger.

## Validation state

- Stage-1 independent review: **44 authored checks passed, 0 failed, 0 skipped**; **82 existing focused checks passed, 0 failed, 0 skipped**. The review used actual TypeScript core and extracted real Index methods with mocked native output/Download I/O/ArkUI. Evidence and hashes are recorded in JSON.
- Subsequent managed Reload/Link independent review passed44/44 custom cases and59/59 focused checks;44/44stage-1 cases were rerun. The swallowed-read-error counterexample was fixed and independently retested.
- **Final current aggregate:1731/1731, actual .NET enabled,0skip/fail; official SDK clean HAP verified.** Production111input hashes matched before/after. Immutable archive and compiled-source manifests identify the exact copied artifact; old0.13 results were not substituted.
- No Windows WPF/Fody/MahApps execution, physical output acknowledgement, native keyboard/IME event capture or real phone/tablet/PC visual verification was performed by this coverage audit.

## Family cross-check

| Family | Original templates | Full portable | Partial | Unwired | Exposed concrete names |
|---|---:|---:|---:|---:|---:|
| Axis | 65 | 56 | 4 | 5 | 60 |
| Debug | 1 | 0 | 0 | 1 | 0 |
| Media | 32 | 27 | 4 | 1 | 31 |
| MediaSource | 35 | 8 | 5 | 22 | 13 |
| MotionProvider | 21 | 10 | 6 | 5 | 34 |
| OutputTarget | 25 | 0 | 0 | 25 | 0 |
| Script | 1 | 0 | 0 | 1 | 0 |
| Shortcut | 2 | 0 | 2 | 0 | 2 |
| Sync | 6 | 6 | 0 | 0 | 6 |

## Complete 188-template status appendix

F = full within the declared portable contract; P = partial; U = unwired. Concrete count is the number of current catalog names supplied by that registration, never the denominator. Exact evidence paths/line anchors and per-action arguments are in the JSON ledger.

| # | Original registration template | Status | Exposed concrete names |
|---:|---|:---:|---:|
| 1 | `Debug::Log` | U | 0 |
| 2 | `{Name}::AutoConnectEnabled::Set` | P | 1 |
| 3 | `{Name}::AutoConnectEnabled::Toggle` | P | 1 |
| 4 | `{Name}::Endpoint::Set` | U | 0 |
| 5 | `{Name}::ServerBaseUri::Set` | U | 0 |
| 6 | `{Name}::ApiKey::Set` | U | 0 |
| 7 | `{Name}::Device::SetByName` | U | 0 |
| 8 | `{Name}::RefreshDevices` | U | 0 |
| 9 | `{Name}::Endpoint::Set` | U | 0 |
| 10 | `{Name}::Shuffle::Set` | F | 1 |
| 11 | `{Name}::Shuffle::Toggle` | F | 1 |
| 12 | `{Name}::Looping::Set` | F | 1 |
| 13 | `{Name}::Looping::Toggle` | F | 1 |
| 14 | `{Name}::LoadAdditionalScripts::Set` | P | 1 |
| 15 | `{Name}::LoadAdditionalScripts::Toggle` | P | 1 |
| 16 | `{Name}::Playlist::Clear` | F | 1 |
| 17 | `{Name}::Playlist::Prev` | F | 1 |
| 18 | `{Name}::Playlist::Next` | F | 1 |
| 19 | `{Name}::Playlist::PlayByIndex` | F | 1 |
| 20 | `{Name}::Playlist::PlayByName` | P | 1 |
| 21 | `{Name}::ServerBaseUri::Set` | U | 0 |
| 22 | `{Name}::ApiKey::Set` | U | 0 |
| 23 | `{Name}::Device::SetByName` | U | 0 |
| 24 | `{Name}::RefreshDevices` | U | 0 |
| 25 | `{Name}::Endpoint::Set` | U | 0 |
| 26 | `{Name}::Arguments::Set` | U | 0 |
| 27 | `{Name}::Uri::Set` | U | 0 |
| 28 | `{Name}::ServerBaseUri::Set` | U | 0 |
| 29 | `{Name}::PlexToken::Set` | U | 0 |
| 30 | `{Name}::Client::SetByName` | U | 0 |
| 31 | `{Name}::RefreshClients` | U | 0 |
| 32 | `{Name}::Endpoint::Set` | U | 0 |
| 33 | `{Name}::Endpoint::Set` | U | 0 |
| 34 | `MotionProvider::{name}::Speed::Offset` | F | 4 |
| 35 | `MotionProvider::{name}::Speed::Set` | F | 4 |
| 36 | `MotionProvider::{name}::Speed::Drive` | U | 0 |
| 37 | `MotionProvider::{name}::Minimum::Offset` | P | 4 |
| 38 | `MotionProvider::{name}::Minimum::Set` | P | 4 |
| 39 | `MotionProvider::{name}::Minimum::Drive` | U | 0 |
| 40 | `MotionProvider::{name}::Maximum::Offset` | P | 4 |
| 41 | `MotionProvider::{name}::Maximum::Set` | P | 4 |
| 42 | `MotionProvider::{name}::Maximum::Drive` | U | 0 |
| 43 | `MotionProvider::{name}::InterpolationType::Set` | F | 1 |
| 44 | `MotionProvider::{name}::Duration::Set` | P | 1 |
| 45 | `MotionProvider::{name}::IsLooping::Set` | F | 1 |
| 46 | `MotionProvider::{name}::IsLooping::Toggle` | F | 1 |
| 47 | `MotionProvider::{name}::Reset` | F | 1 |
| 48 | `MotionProvider::{name}::Points::Set` | U | 0 |
| 49 | `MotionProvider::{name}::Script::Set` | U | 0 |
| 50 | `MotionProvider::{name}::Interpolation::Set` | F | 1 |
| 51 | `MotionProvider::{name}::Pattern::Set` | F | 1 |
| 52 | `MotionProvider::{name}::Octaves::Set` | P | 1 |
| 53 | `MotionProvider::{name}::Persistence::Set` | F | 1 |
| 54 | `MotionProvider::{name}::Lacunarity::Set` | F | 1 |
| 55 | `{Identifier}::AutoConnectEnabled::Set` | U | 0 |
| 56 | `{Identifier}::AutoConnectEnabled::Toggle` | U | 0 |
| 57 | `{Identifier}::Axis::Range::Minimum::Offset` | U | 0 |
| 58 | `{Identifier}::Axis::Range::Minimum::Set` | U | 0 |
| 59 | `{Identifier}::Axis::Range::Minimum::Drive` | U | 0 |
| 60 | `{Identifier}::Axis::Range::Maximum::Offset` | U | 0 |
| 61 | `{Identifier}::Axis::Range::Maximum::Set` | U | 0 |
| 62 | `{Identifier}::Axis::Range::Maximum::Drive` | U | 0 |
| 63 | `{Identifier}::Axis::Range::Middle::Offset` | U | 0 |
| 64 | `{Identifier}::Axis::Range::Middle::Set` | U | 0 |
| 65 | `{Identifier}::Axis::Range::Middle::Drive` | U | 0 |
| 66 | `{Identifier}::Axis::Range::Size::Offset` | U | 0 |
| 67 | `{Identifier}::Axis::Range::Size::Set` | U | 0 |
| 68 | `{Identifier}::Axis::Range::Size::Drive` | U | 0 |
| 69 | `{Identifier}::Endpoint::Set` | U | 0 |
| 70 | `{Identifier}::PipeName::Set` | U | 0 |
| 71 | `{Identifier}::SerialPort::Set` | U | 0 |
| 72 | `{Identifier}::Endpoint::Set` | U | 0 |
| 73 | `{Identifier}::ConnectionKey::Set` | U | 0 |
| 74 | `{Identifier}::SourceAxis::Set` | U | 0 |
| 75 | `{Identifier}::Endpoint::Set` | U | 0 |
| 76 | `{Identifier}::Uri::Set` | U | 0 |
| 77 | `{source.Name}::Connection::Toggle` | U | 0 |
| 78 | `{source.Name}::Connection::Connect` | U | 0 |
| 79 | `{source.Name}::Connection::Disconnect` | U | 0 |
| 80 | `{target.Identifier}::Connection::Toggle` | U | 0 |
| 81 | `{target.Identifier}::Connection::Connect` | U | 0 |
| 82 | `{target.Identifier}::Connection::Disconnect` | U | 0 |
| 83 | `Media::PlayPause::Set` | F | 1 |
| 84 | `Media::PlayPause::Toggle` | F | 1 |
| 85 | `Media::Path::Set` | U | 0 |
| 86 | `Media::Speed::Offset` | P | 1 |
| 87 | `Media::Speed::Set` | P | 1 |
| 88 | `Media::ScriptOffset::Offset` | F | 1 |
| 89 | `Media::ScriptOffset::Set` | F | 1 |
| 90 | `Media::Position::Time::Offset` | F | 1 |
| 91 | `Media::Position::Time::Set` | F | 1 |
| 92 | `Media::Position::Percent::Offset` | F | 1 |
| 93 | `Media::Position::Percent::Set` | F | 1 |
| 94 | `Media::Position::SkipToScriptStart` | F | 1 |
| 95 | `Media::Loop::Set::FromMediaPositionOffset` | F | 1 |
| 96 | `Media::Loop::Set` | F | 1 |
| 97 | `Media::Loop::CycleSetStartEnd` | F | 1 |
| 98 | `Media::Loop::Start::Set` | F | 1 |
| 99 | `Media::Loop::End::Set` | F | 1 |
| 100 | `Media::Loop::Clear` | F | 1 |
| 101 | `Media::Loop::Set::FromCurrentChapter` | F | 1 |
| 102 | `Media::Loop::Start::Set::FromMediaPosition` | F | 1 |
| 103 | `Media::Loop::End::Set::FromMediaPosition` | F | 1 |
| 104 | `Media::AutoSkipToScriptStartEnabled::Set` | F | 1 |
| 105 | `Media::AutoSkipToScriptStartEnabled::Toggle` | F | 1 |
| 106 | `Media::AutoSkipToScriptStartOffset::Set` | F | 1 |
| 107 | `Media::Bookmark::SeekToByName` | P | 1 |
| 108 | `Media::Bookmark::SeekToByIndex` | F | 1 |
| 109 | `Media::Bookmark::SeekToNext` | F | 1 |
| 110 | `Media::Bookmark::SeekToPrev` | F | 1 |
| 111 | `Media::Chapter::SeekToByName` | P | 1 |
| 112 | `Media::Chapter::SeekToByIndex` | F | 1 |
| 113 | `Media::Chapter::SeekToNext` | F | 1 |
| 114 | `Media::Chapter::SeekToPrev` | F | 1 |
| 115 | `Script::SkipGap` | U | 0 |
| 116 | `Axis::Value::Offset` | U | 0 |
| 117 | `Axis::Value::Set` | U | 0 |
| 118 | `Axis::Value::Drive` | U | 0 |
| 119 | `Axis::Sync` | F | 1 |
| 120 | `Axis::Sync::Cancel` | F | 1 |
| 121 | `Axis::SyncAll` | F | 1 |
| 122 | `Axis::SyncAll::Cancel` | F | 1 |
| 123 | `Axis::Lock::Set` | F | 1 |
| 124 | `Axis::Lock::Toggle` | F | 1 |
| 125 | `Axis::LockAll::Set` | F | 1 |
| 126 | `Axis::LockAll::Toggle` | F | 1 |
| 127 | `Axis::Bypass::All::Set` | F | 1 |
| 128 | `Axis::Bypass::All::Toggle` | F | 1 |
| 129 | `Axis::Bypass::Script::Set` | F | 1 |
| 130 | `Axis::Bypass::Script::Toggle` | F | 1 |
| 131 | `Axis::Bypass::MotionProvider::Set` | F | 1 |
| 132 | `Axis::Bypass::MotionProvider::Toggle` | F | 1 |
| 133 | `Axis::Bypass::Transition::Set` | F | 1 |
| 134 | `Axis::Bypass::Transition::Toggle` | F | 1 |
| 135 | `Axis::ClearScript` | F | 1 |
| 136 | `Axis::ReloadScript` | P | 1 |
| 137 | `Axis::InterpolationType::Set` | F | 1 |
| 138 | `Axis::InvertScript::Set` | F | 1 |
| 139 | `Axis::InvertScript::Toggle` | F | 1 |
| 140 | `Axis::LinkPriority::Set` | P | 1 |
| 141 | `Axis::LinkPriority::Toggle` | P | 1 |
| 142 | `Axis::SmartLimitInputAxis::Set` | F | 1 |
| 143 | `Axis::SmartLimitMode::Set` | F | 1 |
| 144 | `Axis::SmartLimitTargetValue::Offset` | F | 1 |
| 145 | `Axis::SmartLimitTargetValue::Set` | F | 1 |
| 146 | `Axis::SmartLimitPoints::Set` | U | 0 |
| 147 | `Axis::LinkAxis::Set` | P | 1 |
| 148 | `Axis::SpeedLimitEnabled::Set` | F | 1 |
| 149 | `Axis::SpeedLimitEnabled::Toggle` | F | 1 |
| 150 | `Axis::SpeedLimitSecondsPerUnit::Offset` | F | 1 |
| 151 | `Axis::SpeedLimitSecondsPerUnit::Set` | F | 1 |
| 152 | `Axis::SpeedLimitUnitsPerSecond::Offset` | F | 1 |
| 153 | `Axis::SpeedLimitUnitsPerSecond::Set` | F | 1 |
| 154 | `Axis::AutoHomeEnabled::Set` | F | 1 |
| 155 | `Axis::AutoHomeEnabled::Toggle` | F | 1 |
| 156 | `Axis::AutoHomeDelay::Offset` | F | 1 |
| 157 | `Axis::AutoHomeDelay::Set` | F | 1 |
| 158 | `Axis::AutoHomeInsideScript::Set` | F | 1 |
| 159 | `Axis::AutoHomeInsideScript::Toggle` | F | 1 |
| 160 | `Axis::AutoHomeDuration::Offset` | F | 1 |
| 161 | `Axis::AutoHomeDuration::Set` | F | 1 |
| 162 | `Axis::AutoHomeTargetValue::Offset` | F | 1 |
| 163 | `Axis::AutoHomeTargetValue::Set` | F | 1 |
| 164 | `Axis::ScriptOffset::Offset` | F | 1 |
| 165 | `Axis::ScriptOffset::Set` | F | 1 |
| 166 | `Axis::ScriptScale::Offset` | F | 1 |
| 167 | `Axis::ScriptScale::Set` | F | 1 |
| 168 | `Axis::MotionProvider::Set` | F | 1 |
| 169 | `Axis::MotionProviderBlend::Offset` | F | 1 |
| 170 | `Axis::MotionProviderBlend::Set` | F | 1 |
| 171 | `Axis::MotionProviderBlend::Drive` | U | 0 |
| 172 | `Axis::MotionProviderFillGaps::Set` | F | 1 |
| 173 | `Axis::MotionProviderFillGaps::Toggle` | F | 1 |
| 174 | `Axis::MotionProviderMinimumGapDuration::Offset` | F | 1 |
| 175 | `Axis::MotionProviderMinimumGapDuration::Set` | F | 1 |
| 176 | `Axis::UpdateMotionProviderWithAxis::Set` | F | 1 |
| 177 | `Axis::UpdateMotionProviderWhenPaused::Set` | F | 1 |
| 178 | `Axis::UpdateMotionProviderWhenPaused::Toggle` | F | 1 |
| 179 | `Axis::UpdateMotionProviderWithoutScript::Set` | F | 1 |
| 180 | `Axis::UpdateMotionProviderWithoutScript::Toggle` | F | 1 |
| 181 | `Sync::Duration::Set` | F | 1 |
| 182 | `Sync::SyncOnMediaResourceChanged::Set` | F | 1 |
| 183 | `Sync::SyncOnScriptResourceChanged::Set` | F | 1 |
| 184 | `Sync::SyncOnMediaPlayPause::Set` | F | 1 |
| 185 | `Sync::SyncOnSeek::Set` | F | 1 |
| 186 | `Sync::SyncOnAutoHomeStartEnd::Set` | F | 1 |
| 187 | `Shortcut::Enabled::Set` | P | 1 |
| 188 | `Shortcut::Enabled::Toggle` | P | 1 |
