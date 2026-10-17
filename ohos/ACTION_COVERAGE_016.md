# 0.16 original shortcut action coverage

Source-route audit snapshot: **2026-10-16T21:27:48.089946+00:00**. Original source: `36c08fbb99ac9398a63ff1cca1bbf68cd2228a94`. Comparison: the immutable [0.15 matrix](ACTION_COVERAGE_015.md) and `tools/reference/action-coverage-015-source.json`.

This is a **current integration source snapshot, not a final 0.16 release freeze, aggregate pass, clean SDK/HAP build, Windows binding run, native-device or physical-output pass**. The companion ledger records the reviewed input hashes. The owner reported a provisional production freeze at 21:26 UTC; aggregate/build/review validation is still in progress. These hashes were refreshed after that notice. Any later fix requires another affected-evidence/hash review. No earlier release's test/build result is substituted for a 0.16 result.

## Counts and classification

**155 unique runtime-evaluated catalog IDs = 151 original concrete names + 4 OHOS additions.** Every original name maps exactly once to **133 of 188 original registration call sites**. The actual catalog specs are unchanged from 0.15. Expanding the shared provider registration into four names never multiplies the template denominator.

| Classification | Original templates | Exposed original names |
|---|---:|---:|
| Full command wiring within declared portable contract | **110** | **116** |
| Partial original domain/dependency/loaded-view coverage | **23** | **35** |
| Unwired | **55** | **0** |
| Total | **188** | **151** |

All 188 individual statuses are preserved from 0.15. No partial is promoted. This slice adds proved behavior to existing routes; it introduces **zero new action IDs**. App::Stop, App::Internal::Random, App::Fullscreen::Toggle and App::Library::Show remain separate OHOS additions outside the 188 denominator.

“Full portable” means the registered command and known dependent effects are wired within the declared finite/active-target/readiness/foreground/cancellation/output-safety contract. It does not excuse a known omitted original domain, source expansion, repository scope, runtime budget or material WPF binding/lifetime effect. A pure helper, catalog entry or label without a real dispatch/owning-runtime route earns no coverage.

## Important correction: effective display is not provider write-back

The 0.15 range/Octaves closure plan assumed attached-control coercion could require model normalization. The [pinned source audit](RANGE_OCTAVES_016_SOURCE_AUDIT.md) corrects that premise:

- Ordinary source-to-target transfer may coerce the **effective control display** without writing the coerced result to the provider. TwoWay binding and MinRange=.01 do not themselves normalize the source.
- Minimum/Maximum shortcut callbacks remain independent Clamp01 assignments, including equal/reversed raw ranges. Preserve separate retained source bases and effective display history.
- Raw Random Octaves above 8 may display 8. The independent **128 runtime activation budget** remains; effective 8 cannot make raw 129 or Int32.MaxValue safe to activate.
- A genuine explicit editor setter can commit even when the effective value stays equal. An actual edit/submit of displayed 8 can replace raw 128 with 8. Untouched focus/blur, render, attach and source refresh cannot synthesize that edit.
- WPF hidden/unloaded does **not** imply a detached binding. The current mounted-editor ownership contract is a declared portable lifecycle choice, not proof of equivalent cached WPF lifetime.

The evidence is retained official MahApps 2.4.9/WPF v9.0.0 text plus extracted-method numeric execution. It is not an executed WPF binding engine, resolved Fody assembly or Windows initialization oracle. These distinctions change the partial reasons; they do not justify a count increase.

## Actual current routes and remaining boundaries

### Range and Octaves

Shortcut dispatch in Index still reaches `applyMotionShortcutAction` and `PlaybackSessionCore.changeMotionConfiguration`; source callbacks preserve normal sync, stable provider identity, Random seed/time and independent raw endpoints. `MotionSettingsPanel` owns `MotionControlValues` per context, uses `transferMotionControlValues` for source snapshots, retains coercion history across equal renders and displays raw/effective differences. Explicit bounded numeric edits use `userEditMotionControlValue` and the guarded Index settings callback. `SettingsNumberField` records a real edit so same-effective commits work without making untouched blur a write.

Context/epoch/snapshot guards reject callbacks captured before axis/profile/provider changes, read-only transitions, detachment or remount. The panel's void onChange is not treated as acceptance: speculative effective state is adopted only when the expected host snapshot is accepted or echoed. No programmatic display transfer grants sync, source admission, a new sample or output Arm.

Rows 37/38/40/41 remain partial because initial XAML/binding order, retained hidden/unloaded WPF controls, Fody/dispatcher scheduling and native pointer/two-thumb behavior are unexecuted. Row 52 additionally retains the original Int32-versus-128 runtime limitation. The old claim that ordinary coerced values must be written back is explicitly retired.

### Owned Custom Curve canvas

The real route is `CurvePointEditor.onAreaChange` → `MotionSettingsPanel.onGeometry` → Index's current axis/profile/provider/foreground/read-write guard → `PlaybackSessionCore.attachMotionCanvas` → `PointCanvasEffects` → the existing provider/registry collection-refresh path. Measured geometry is volatile. Old owners, stale contexts, hidden/unmounted panels, background, read-only/recovery and pending profile state cannot use this route to mutate a different active context.

- Initial attachment and actual measurement changes synchronize the measured point collection. They do not guess an initial WPF Viewport event.
- Changed Duration applies a viewport event to the **old** points: closed-edge pruning occurs before the zero-size check. Same Duration or a detached canvas does not invent pruning.
- The dedicated Points command preserves **Duration → Interpolation → unconditional incoming Reset**. A measured Reset sorts and round-trips coordinates while retaining duplicate order and off-viewport points; it does not prune the incoming payload.
- Equal-point Reset still refreshes the stable provider. Collection-only changes preserve phase/cache and add no generic sync. Configuration/output provenance is invalidated, while no synthetic runtime frame, clock advance or output Arm is created.

Rows 44 and 48 remain partial. Current ownership closes a useful portable attachment path but does not reconstruct first binding, hidden/cached/multiple WPF observers, dispatcher/Fody order or native lifetime. Row 48 also retains finite x, y 0..1, Duration 1..60 and 4096/action/8192-total budgets. A smaller viewport does not authorize unconditional pruning of every hidden provider.

### Smart Limit stays distinct

Row 146 still reaches its cloned argument helper and existing axis configuration/pipeline route. It retains finite percent 0..100 coordinates and strict increasing x, excluding source-legal unordered/duplicate lists. The new Custom Curve canvas route is **not** a SmartLimitPreview adapter. A shared pure geometry function cannot establish that missing collection/lifetime route or erase the bounded-domain restriction.

## Evidence and verification

- Executed the actual `shortcutActionCatalog()` under Node 24.19.0: 155 unique IDs, 151 original names, 133 unambiguous registration mappings. All original specs equal 0.15.
- Verified all 188 original registration bodies/callbacks against current source. All 51 source files retain the 0.15 recorded SHA-256s, also matching the recorded immutable 0.14 hashes.
- Re-located all **179 unique inherited row-level route markers**; 154 was the older 0.14-only subset. Current rows contain **211** unique route markers after the 0.16 additions. Their lines and raw-byte SHA-256s are recorded; marker continuity is not execution of every action.
- The companion ledger hashes **42 runtime/test inputs**, the three 0.16 contract/source-audit documents separately, and retained oracle/provenance files. Hashes describe this timestamp and can become stale during integration.
- This coverage audit independently ran `node --test ohos/tests/motion-bound-controls-ui.test.mjs ohos/tests/point-canvas-session.test.mjs`: **33 passed, 0 failed, 0 skipped**. These execute extracted real component controllers and actual session/core paths in Node, including MemoryTransport-only safety checks; they do not render ArkUI on a device.
- Independent consistency checks verify the live catalog, all 188 preserved statuses, original source hashes, exact registration text and whitespace-normalized callback inclusion, route continuity, correction and disclosed limits. Test-source existence alone is not counted as a pass. No test file was added or changed by this audit.
- The scoped source-audit reports separately record 142 point-canvas tests/129 schedules and 22 range-oracle tests/93 cases/1,241 transfers. This coverage audit did **not** reexecute those C# oracles. Their method/structural-shim boundaries remain as documented in the linked audits.

No aggregate suite, clean SDK/HAP build, Windows/Fody/Stylet run, phone/tablet/PC UI validation or physical endpoint was performed by this coverage audit. No Git operation, existing document, production file or shared test was changed.

## All 23 partials: current reasons

|#|Original template|Remaining boundary / next useful evidence|
|---:|---|---|
|2|`{Name}::AutoConnectEnabled::Set`|Only Internal::AutoConnectEnabled::Set is wired. Common WPF registration applies to twelve source names; the other eleven are absent. Saved Internal preference does not connect or arm output.|
|3|`{Name}::AutoConnectEnabled::Toggle`|Only Internal::AutoConnectEnabled::Toggle is wired. Common WPF registration applies to twelve source names; the other eleven are absent.|
|14|`{Name}::LoadAdditionalScripts::Set`|Additional scripts are resolved only from the existing authorized Download/catalog snapshot, with 64 candidate/expanded-item, 8 MiB text and Funscript action budgets. Does reread authorized script bytes; does not perform the WPF arbitrary local-repository search.|
|15|`{Name}::LoadAdditionalScripts::Toggle`|Same managed catalog/search and resource-budget limits as Set. Async prepare/load carries the shortcut lease; no claimed arbitrary-directory repository parity.|
|20|`{Name}::Playlist::PlayByName`|First Name OR FullName OrdinalIgnoreCase lookup and current-item restart/pause preservation are wired. Text is at most 4096 UTF-16 units, excludes C0/DEL, and only resolves current managed Download playlist identities; original string argument is unbounded and may be null.|
|37|`MotionProvider::{name}::Minimum::Offset`|Independent Clamp01 source callbacks remain wired for all four providers, including reversed/equal raw ranges. Pinned MahApps 2.4.9/WPF source and MotionControlValues now model effective display coercion without ordinary source-transfer write-back. Explicit same-effective user edits commit only their selected field. First XAML/binding order, retained hidden/unloaded WPF bindings, Fody/dispatcher timing, and native pointer/two-thumb behavior are not reproduced or executed; the portable mounted-editor lifecycle remains distinct.|
|38|`MotionProvider::{name}::Minimum::Set`|Independent Clamp01 source callbacks remain wired for all four providers, including reversed/equal raw ranges. Pinned MahApps 2.4.9/WPF source and MotionControlValues now model effective display coercion without ordinary source-transfer write-back. Explicit same-effective user edits commit only their selected field. First XAML/binding order, retained hidden/unloaded WPF bindings, Fody/dispatcher timing, and native pointer/two-thumb behavior are not reproduced or executed; the portable mounted-editor lifecycle remains distinct.|
|40|`MotionProvider::{name}::Maximum::Offset`|Independent Clamp01 source callbacks remain wired for all four providers, including reversed/equal raw ranges. Pinned MahApps 2.4.9/WPF source and MotionControlValues now model effective display coercion without ordinary source-transfer write-back. Explicit same-effective user edits commit only their selected field. First XAML/binding order, retained hidden/unloaded WPF bindings, Fody/dispatcher timing, and native pointer/two-thumb behavior are not reproduced or executed; the portable mounted-editor lifecycle remains distinct.|
|41|`MotionProvider::{name}::Maximum::Set`|Independent Clamp01 source callbacks remain wired for all four providers, including reversed/equal raw ranges. Pinned MahApps 2.4.9/WPF source and MotionControlValues now model effective display coercion without ordinary source-transfer write-back. Explicit same-effective user edits commit only their selected field. First XAML/binding order, retained hidden/unloaded WPF bindings, Fody/dispatcher timing, and native pointer/two-thumb behavior are not reproduced or executed; the portable mounted-editor lifecycle remains distinct.|
|44|`MotionProvider::{name}::Duration::Set`|Duration setter, normal sync and refresh remain wired. Current owned Custom Curve canvas receives actual changed-Duration viewport effects, including prune before zero-size return; detached/same-Duration changes do not invent pruning. Portable ownership is based on mounted current axis/profile/provider, unlike potentially retained hidden WPF views. Initial binding order, cached/hidden/multiple observers, Fody/dispatcher delivery and native lifetime are unexecuted, so the original restriction is reduced but not closed.|
|48|`MotionProvider::{name}::Points::Set`|Duration -> Interpolation -> unconditional Points Reset is wired to the stable provider. An actually owned measured Custom Curve canvas now sorts/round-trips without deduplication; a changed Duration applies the viewport event to the old collection before incoming Reset. Finite x, y 0..1, Duration 1..60, 4096/action and 8192 keyboard-total budgets remain narrower than original typed DTOs. Exact initial binding order, hidden/cached/multiple WPF observers, dispatcher/Fody timing and device input remain unverified. Detached commands preserve headless order/duplicates/off-viewport x.|
|52|`MotionProvider::{name}::Octaves::Set`|Original Int32 shortcut values are represented, but Random runtime activation rejects Octaves >128 before provider mutation. Raw values above 8 remain separate from effective NumericUpDown-style display 1..8; ordinary source transfer has no provider write-back. A real same-effective user commit can replace raw 128 with 8. Initial binding/construction order, retained hidden bindings, Fody/dispatcher scheduling and native text/pointer behavior remain unexecuted. Displaying 8 cannot make raw 129 or Int32.MaxValue safe to activate.|
|86|`Media::Speed::Offset`|Delta remains -4..4 and resulting rate is clamped to 0.25..4. WPF delta has Double.MinValue..Double.MaxValue and rate minimum 0.01 without an upper cap. Native rate outcome remains backend/device dependent.|
|87|`Media::Speed::Set`|Accepted rate is 0.25..4; WPF minimum is 0.01 without an upper cap. Native AVPlayer acceptance/quantization is not device-verified.|
|107|`Media::Bookmark::SeekToByName`|Name input is at most 256 UTF-16 code units and rejects C0/DEL control characters; WPF string builder has no corresponding bound. Within this domain, ordinal comparison uses a pinned .NET scalar table.|
|111|`Media::Chapter::SeekToByName`|Name input is at most 256 UTF-16 code units and rejects C0/DEL controls; WPF string builder is unbounded. Within domain, ordinal matching and first-collection/raw-time navigation are wired.|
|136|`Axis::ReloadScript`|Current host route rescans the same authorized Download root, rereads/parses fresh resources, and commits through begin/complete/cancel ownership tokens. The former cached-only host limitation is fixed. Search remains bounded to that root/catalog and budgets, without original arbitrary local or external repository aggregation. Reload strictly fails on incomplete/warning-bearing reindex, read, parse or ZIP failure: keep old bindings, cancel the transaction epoch and disarm. A genuine complete-search no-match retains ordinary resources with a zero-result status.|
|140|`Axis::LinkPriority::Set`|Current host route rescans the same authorized Download root, rereads/parses fresh resources, and commits through begin/complete/cancel ownership tokens. The former cached-only host limitation is fixed. Search remains bounded to that root/catalog and budgets, without original arbitrary local or external repository aggregation. Reload strictly fails on incomplete/warning-bearing reindex, read, parse or ZIP failure: keep old bindings, cancel the transaction epoch and disarm. A genuine complete-search no-match retains ordinary resources with a zero-result status.|
|141|`Axis::LinkPriority::Toggle`|Current host route rescans the same authorized Download root, rereads/parses fresh resources, and commits through begin/complete/cancel ownership tokens. The former cached-only host limitation is fixed. Search remains bounded to that root/catalog and budgets, without original arbitrary local or external repository aggregation. Reload strictly fails on incomplete/warning-bearing reindex, read, parse or ZIP failure: keep old bindings, cancel the transaction epoch and disarm. A genuine complete-search no-match retains ordinary resources with a zero-result status.|
|146|`Axis::SmartLimitPoints::Set`|Real cloned point action reaches AxisConfiguration/pipeline without generic reset-sync. Finite 0..100 percent x/y, empty/singleton arrays, 4096/action and 8192 keyboard-total budget remain. OHOS strict increasing x rejects source-legal duplicate/unsorted points. The Custom Curve canvas integration does not establish an equivalent SmartLimitPreview collection-write-back route; a shared pure PointCanvasEffects helper alone earns no additional action coverage. Original measured Smart Limit canvas sorts without deduplication, and its WPF binding/lifetime remains unexecuted.|
|147|`Axis::LinkAxis::Set`|Current host route rescans the same authorized Download root, rereads/parses fresh resources, and commits through begin/complete/cancel ownership tokens. The former cached-only host limitation is fixed. Search remains bounded to that root/catalog and budgets, without original arbitrary local or external repository aggregation. Reload strictly fails on incomplete/warning-bearing reindex, read, parse or ZIP failure: keep old bindings, cancel the transaction epoch and disarm. A genuine complete-search no-match retains ordinary resources with a zero-result status.|
|187|`Shortcut::Enabled::Set`|First exact case-sensitive ordinal mapping name is wired, preserving admitted batch and timers. Action lookup text is at most 256 UTF-16 units; saved mapping names at most 80; C0/DEL and null names are rejected. Original null can match an unnamed shortcut and strings are unbounded. Empty OHOS names remain exact strings, not null.|
|188|`Shortcut::Enabled::Toggle`|First exact case-sensitive ordinal mapping name is wired, preserving admitted batch and timers. Action lookup text is at most 256 UTF-16 units; saved mapping names at most 80; C0/DEL and null names are rejected. Original null can match an unnamed shortcut and strings are unbounded. Empty OHOS names remain exact strings, not null.|

## Family totals

| Family | Templates | Full portable | Partial | Unwired | Exposed original names |
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

F=full within the declared portable contract; P=partial; U=unwired. Concrete-name expansions do not change the 188 registration denominator. Exact current specs, route anchors, restrictions and source registration evidence are retained in `coverage016Templates` and `original188RegistrationEvidence` in `tools/reference/action-coverage-016-source.json`.

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
