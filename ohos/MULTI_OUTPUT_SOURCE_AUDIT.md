# Multi-output and endpoint persistence: original-source audit

Scope: repository-local original C# sources and the existing OHOS network-output boundary. Read-only source review; the only change made for this audit is this document. No network, hardware, Git, or excluded recording implementation was used. Line references below refer to the original checked-out source, not a claim of runtime verification.

## Conclusions for OHOS 0.11

- Preserve a collection of independent outputs. Selection controls the editor/tab only; it must not decide which connected target receives frames.
- Original output operations are add, remove, select, manual connect/disconnect, and optional auto-connect. Output clone, output rename, and explicit reordering are not implemented by the original controller/view. They may be useful OHOS extensions, but must not be described as upstream behavior.
- Original persistence includes ordered targets, selected target identity, per-target endpoint, axis ranges/enables, chosen update mode, and settings for **all** supported update contexts, including the inactive one.
- Original targets share one global selected device's active axes and TCode precision. Ranges/enables are per output; the device profile is not independently selected per output.
- Keep the deliberate OHOS safety contract: constructing/restoring/selecting an output never connects or arms it; explicit Connect and explicit Arm remain separate. Do not reproduce upstream startup auto-connect/reconnect.
- Current physical kinds remain exactly `tcp`, `udp`, and `webSocket`. Persist validated, non-credential endpoint fields; never serialize live transport/session authorization, arm status, or credentials.

## 1. Collection, identity, selection, and operations

| Behavior | Original implementation and evidence |
| --- | --- |
| Target identity | `AbstractOutputTarget.cs:22–24,45`: display `Name` is initialized from the target class's `DisplayName` attribute; `Identifier` is `Name/InstanceIndex`; `InstanceIndex` is immutable. `Name` has an init-only setter. TCP, UDP, and WebSocket names come from their class attributes at `TcpOutputTarget.cs:15`, `UdpOutputTarget.cs:17`, `WebSocketOutputTarget.cs:14`. |
| Add | `UI/Controls/ViewModels/OutputTargetViewModel.cs:43–60`: find the lowest unused nonnegative index among outputs of the same concrete type, create that type/index, then add it. `:62–70`: append to `Items`, activate it, allocate its semaphore, and register its actions/properties. |
| Limit | `OutputTarget/IOutputTargetFactory.cs:13–33`: creation rejects an index greater than the type's maximum. TCP/UDP/WebSocket use maximum index 9, hence up to 10 instances of each type in the ordinary add path. The factory's upper-bound test alone is not robust validation of imported negative indices. |
| Remove | `OutputTargetViewModel.cs:73–97`: close the collection item, remove its semaphore from the manager, await that semaphore, await target idle, disconnect if connected, await disconnection, unregister its actions/properties, then dispose semaphore and target. There is no explicit neighboring-selection algorithm here; the inherited Stylet conductor handles item closing/selection. Do not invent an exact upstream fallback-on-remove rule. |
| Selection | `UI/Controls/Views/OutputTargetView.xaml:20` binds `Items` and `ActiveItem`; `:65–69` displays the selected view model. `UI/Controls/NonReloadingTabControl.cs:114–131` changes content visibility rather than reconstructing target connections. Network targets run their own worker loop, independent of selected-tab visibility. |
| Order | Add uses `Items.Add`; save writes `JArray.FromObject(Items)`; load iterates the saved array in order. Evidence: `OutputTargetViewModel.cs:64,118,132–144`. No move/reorder action exists in this controller or its full view (`OutputTargetView.xaml:20–109`). |
| Restore selection | `OutputTargetViewModel.cs:147–148`: if `ActiveItem` is available, find its identifier using ordinal equality; otherwise fall back to the first item. With the key absent, every restored add activates its item, so the final add remains selected. |
| Duplicate restore | `OutputTargetViewModel.cs:132–143`: skip a restored target if its exact concrete type and instance index already exist. Restore appends; it does not clear a populated collection. This is startup-oriented load behavior, not a transactional import/replace implementation. |
| Clone/rename | Neither is exposed by `OutputTargetViewModel.cs` or `OutputTargetView.xaml`; target name is init-only. Device-profile clone/rename are separate operations: `UI/Controls/ViewModels/DeviceSettingsViewModel.cs:35–63` and `Common/DeviceSettings.cs:14–20`. |

Path key: `TcpOutputTarget.cs`, `UdpOutputTarget.cs`, and `WebSocketOutputTarget.cs` mean `Source/MultiFunPlayer/OutputTarget/ViewModels/<filename>`. `AbstractOutputTarget.cs` and `IUpdateContext.cs` mean files directly under `Source/MultiFunPlayer/OutputTarget/`. `Views/<filename>` means `Source/MultiFunPlayer/OutputTarget/Views/<filename>`. Explicit `OutputTarget/`, `UI/`, `Common/`, `Settings/`, and `Bootstrapper.cs` references are relative to `Source/MultiFunPlayer/`. `OutputTargetViewModel.cs` means `Source/MultiFunPlayer/UI/Controls/ViewModels/OutputTargetViewModel.cs`; `OutputTargetView.xaml` means `Source/MultiFunPlayer/UI/Controls/Views/OutputTargetView.xaml`.

## 2. Connection and reconnect lifecycle

1. Each target owns its connection status. The enum is Disconnected, Disconnecting, Connecting, Connected (`Common/IConnectable.cs:3–9`), and the network targets' default enum status is Disconnected.
2. `OutputTargetViewModel.cs:152–164` serializes a manual toggle with that target's semaphore. Connected toggles to disconnect; Disconnected toggles to a manual connection; busy states do neither. Shortcut connect/disconnect actions use the same per-target semaphore (`:211–225`).
3. `AbstractOutputTarget.cs:57–81` only begins from Disconnected, changes to Connecting, waits 250 ms for auto-connect, validates through `OnConnectingAsync`, and starts the worker. Connection exceptions are shown for manual attempts; auto-connect errors are swallowed. Failed setup calls disconnect.
4. `AbstractOutputTarget.cs:84–92` changes to Disconnecting, waits 250 ms, invokes worker teardown, then becomes Disconnected. Idle means Connected or Disconnected (`Common/Extensions.cs:18–23`).
5. TCP/UDP workers are independent background threads (`AbstractOutputTarget.cs:408–438`); WebSocket has an independent task (`:545–574`). Worker exit initiates disconnect, and teardown cancels/joins or awaits the worker. Socket disposal belongs to each worker (`TcpOutputTarget.cs:48–53`, `UdpOutputTarget.cs:50–52`, `WebSocketOutputTarget.cs:47–49`).
6. On successful connection all three publish a shared `SyncRequestMessage` before writing (`TcpOutputTarget.cs:77–100`, `UdpOutputTarget.cs:59–84`, `WebSocketOutputTarget.cs:59–77`). The upstream protocol starts output automatically; it has no separate Arm operation.
7. The manager starts its auto-connect scan on view load (`OutputTargetViewModel.cs:100–103`), waits `ScanDelay` (default 2500 ms), then visits **all** targets with `AutoConnectEnabled`, regardless of selection. Each non-connected eligible target is retried; the cycle waits `ScanInterval` (default 5000 ms). See `:25–27,181–203`. Manual connection/disconnection releases a semaphore used to reset/extend the quiet scan wait (`:167–178,200`).
8. Manual disconnect does not clear `AutoConnectEnabled`, so the scan can reconnect it. There is no exponential backoff, maximum retry count, or persistent manual-disconnect suppression here. TCP auto-connect uses a 500 ms connect wait (`TcpOutputTarget.cs:57–74`); WebSocket auto-connect cancels connect after 500 ms (`WebSocketOutputTarget.cs:53–57`) and its async base adds another 250 ms delay (`AbstractOutputTarget.cs:551–552`). UDP has no analogous explicit timeout in its connect block (`UdpOutputTarget.cs:54–60`).

OHOS must keep auto-connect intent inert, including after restore, fault, foreground return, selection, clone, or profile changes. Preserve a future/imported policy only as informational data. A successful Connect alone must not authorize output.

## 3. Per-target update modes, range mapping, and shared profile

### Modes and context defaults

All three network targets expose FixedUpdate and PolledUpdate, defaulting to FixedUpdate. Their update-mode controls are disabled while connected or transitioning (`TcpOutputTarget.cs:25–35`, `UdpOutputTarget.cs:27–37`, `WebSocketOutputTarget.cs:24–34`). Endpoint controls are enabled only while disconnected (`Views/TcpOutputTarget.xaml:132–145`, UDP same lines, WebSocket `:132–146`). Upstream context knobs/ranges remain mutable at runtime; OHOS may deliberately require a safe reapplication/re-arm instead.

| Setting | TCP / UDP | WebSocket | Evidence |
| --- | --- | --- | --- |
| Fixed context class | `TCodeThreadFixedUpdateContext` | `TCodeAsyncFixedUpdateContext` | Target registration methods cited above |
| Default interval | 10 ms | 16 ms | `IUpdateContext.cs:44`; `WebSocketOutputTarget.cs:31` |
| UI interval bounds | 3–33 ms | 16–200 ms | `IUpdateContext.cs:46–47`; `WebSocketOutputTarget.cs:31`; sliders bind these bounds in `Views/UpdateContextTemplates.xaml:174–180,314–320` |
| SendDirtyValuesOnly | true | true | `IUpdateContext.cs:77–86` |
| OffloadElapsedTime | false | false | `IUpdateContext.cs:77–86` |
| UsePreciseSleep | false by default, serialized | not an async-context setting | `IUpdateContext.cs:70–86` |
| Polled context | `ThreadPolledUpdateContext` | `AsyncPolledUpdateContext` | `IUpdateContext.cs:9–35` |

The interval limits are UI bounds, not validated setters. Runtime statistics such as AverageUpdateRate, UpdateRateJitter, and AverageUpdateError are not opted into JSON (`IUpdateContext.cs:9–15,37–49`). Polled contexts have no persisted configuration fields.

### Axis scope and value semantics

- A newly constructed target makes its own map for every `DeviceAxis.All` entry (`AbstractOutputTarget.cs:45–51`). Each output axis defaults to Minimum 0, Maximum 1, Enabled true (`OutputTarget/DeviceAxisSettings.cs:6–11`). These are distinct from device-profile axis definitions in `Common/DeviceSettings.cs`.
- Fixed output reads the shared value provider, substitutes the axis default for nonfinite input, then applies `Lerp(Minimum, Maximum, value)` (`AbstractOutputTarget.cs:122–140`). Network fixed loops apply dirty filtering and the target's Enabled flag before encoding; last-sent values belong to that connection loop (`TcpOutputTarget.cs:98–121`, UDP `:82–105`, WebSocket `:100–117`).
- Fixed dirty comparison uses global protocol precision (`Common/DeviceAxis.cs:54–55`); it is not shared across targets. Elapsed-time offload omits the TCode interval suffix; otherwise fixed output includes elapsed milliseconds (same network loop references).
- Polled output subscribes with the target's unique `Identifier`, uses the event target value and event duration, skips disabled/nonfinite axes, and applies that output's range (`AbstractOutputTarget.cs:143–154,463–488,609–634`; TCP `:127–148`, UDP `:112–133`, WebSocket `:123–144`). A collection implementation must not consume one event queue destructively for only its selected member.
- The source sliders enforce 0–1 and a 0.01 minimum range (`Views/TcpOutputTarget.xaml:193–199`; UDP same; WebSocket `:194–200`). Output setting fields themselves are plain setters, so imported values do not inherit slider validation. OHOS should preserve its explicit validation boundary instead of reproducing this weakness.
- Global device selection is persisted at root `Devices` and `SelectedDevice`, independently of `OutputTarget` (`UI/Controls/ViewModels/DeviceSettingsViewModel.cs:134–148`). Startup preprocessing selects one device and calls `DeviceAxis.InitializeFromDevice` (`Settings/ISettingsPreprocessor.cs:95–105`).
- Initialization is one-time; output precision, axis names, order, defaults, and funscript names come from that shared device. Only enabled, unique valid `[A-Z][0-9]` axes become `DeviceAxis.All` (`Common/DeviceAxis.cs:23–30,59–72`). TCode-0.2 precision is 3 and TCode-0.3 precision is 4 (`Common/DeviceSettings.cs:26–27,44–45`).
- The device-settings view explicitly says changes require restart and that disabling/removing axes can reset settings (`UI/Controls/Views/DeviceSettingsView.xaml:38–39`). The original does not offer independent per-output profile selection or a dynamic profile migration algorithm.

## 4. Exact persistence contract

### Collection keys

`OutputTargetViewModel.cs:106–148` stores the following under root `OutputTarget`:

- `ContentVisible`
- `ScanDelay`
- `ScanInterval`
- `ActiveItem`: target `Identifier`, not array index or display position
- `Items`: ordered array

### Each item

`Settings/Converters/OutputTargetConverter.cs:11–35` writes `$index` and `$type`, then asks the target to save its settings. On load it resolves the type, creates a fresh instance with that index, then calls `HandleSettings`. `$type` includes the qualified type/assembly identity with assembly detail stripped (`Common/Extensions.cs:111–119`). This dynamic type mechanism must not be copied into the OHOS settings format; use a closed kind allowlist.

Common per-item fields are exactly:

- `AutoConnectEnabled`
- `AxisSettings`: object keyed by axis name; each entry has `Minimum`, `Maximum`, `Enabled`
- `UpdateContextSettings`: object keyed by each context's concrete class name, including both Fixed and Polled contexts

Evidence: `AbstractOutputTarget.cs:156–186`, `OutputTarget/DeviceAxisSettings.cs:6–11`, `Settings/Converters/DeviceAxisConverter.cs:18–35`.

TCP and UDP additionally store `UpdateType` plus `Endpoint` (`TcpOutputTarget.cs:158–173`, `UdpOutputTarget.cs:157–172`). WebSocket stores `UpdateType` plus `Uri` (`WebSocketOutputTarget.cs:163–177`). Global `StringEnumConverter` makes the mode values strings (`Bootstrapper.cs:261–271`), hence `FixedUpdate` or `PolledUpdate`.

Fixed context keys are `UpdateInterval`, `SendDirtyValuesOnly`, `OffloadElapsedTime`, plus TCP/UDP `UsePreciseSleep`; polled contexts serialize as empty objects. Bounds/stats are not persisted. The per-target `ContentVisible` declared in `AbstractOutputTarget.cs:27` is not saved by that target's explicit handler, unlike the collection-level key. Connection status, workers, sockets, dirty caches, and current output values are not saved.

### Endpoint encoding and defaults

| Kind | Original default | Saved representation |
| --- | --- | --- |
| TCP | `127.0.0.1:8080` (`TcpOutputTarget.cs:28`) | `Endpoint`, a scheme-less address/host plus colon plus port |
| UDP | `tcode.local:8000` (`UdpOutputTarget.cs:30`) | Same `Endpoint` representation |
| WebSocket | `ws://127.0.0.1/ws` (`WebSocketOutputTarget.cs:27`) | `Uri.ToString()`, including scheme and path/query if present |

TCP/UDP use `EndPoint.ToUriString()` (`Common/Extensions.cs:366–373`), preserving a DNS host rather than resolving and persisting an IP. `Settings/Converters/EndPointConverter.cs:10–14` reads with `NetUtils.ParseEndpoint` (`Common/Utils/NetUtils.cs:23–49,71–72`). That parser supports IP or DNS and a legacy family-prefixed form; the serializer does not emit the family prefix. It uses a greedy host plus final port split, and emits IPv6 address text without URI brackets. Do not round-trip this by naively splitting every colon or by treating it as a complete URL. A structured host/port schema is the safer OHOS representation.

The original endpoint editor keeps host and port fields (`UI/Controls/EndPointBox.xaml.cs:15–19,40–48,59–69`). No selected local UDP bind port is persisted by these original target classes; an OHOS `localPort` is platform-specific configuration.

WebSocket's UI restricts schemes to `ws wss` and exposes path/query (`Views/WebSocketOutputTarget.xaml:141–145`). `UI/Controls/UriBox.xaml.cs:145–176` composes/decomposes scheme, host, port, and path/query. Its separate shortcut setter only checks absolute-URI parsing (`WebSocketOutputTarget.cs:185–190`), so the UI restriction is not universal validation. The target's settings handler writes the full URI without a credentials filter. Do not assume an arbitrary imported URI is safe for ordinary persistence.

## 5. Minimal correct OHOS integration contract

This is a proposed integration contract based on the evidence above and the task's stricter OHOS constraints, not a claim that upstream implements every point.

1. **Collection identity and order.** Use an ordered, bounded array of records with unique stable `targetId`, allowlisted kind, display label if desired, endpoint fields, update settings, and axis ranges. Keep `selectedTargetId` separately. Reordering changes only order; rename changes only label. Stable identity must not depend on array position or editable label. An output clone receives a new identity and deep-copied configuration; no connection/arm/dirty-cache/application identity transfers. Add appends/selects; removal repairs selection deterministically. Empty collections are valid.
2. **Preserve dormant preferences.** Persist fixed knobs even when Polled is selected so toggling back does not reset them. Validate interval bounds against target kind. Save only a whitelist of data fields, preserving the existing settings layer's validation/version discipline. Do not serialize a runtime coordinator, raw UI draft, or dynamic `$type` object.
3. **One owner per target.** Retain one existing single-target `OutputCoordinator` for each stable ID. Each owns connect/disconnect serialization, transport, application identity, generation, queues, dirty cache, and Arm state. Never implement multi-output by repeatedly replacing the one selected coordinator. Dispatch the same completed source frame independently with the target's own enabled-axis scope and update mode; preserve the core's provenance/clock/authorization checks for every target.
4. **Selection is inert.** Selecting, adding, cloning, renaming, reordering, saving, restoring, and returning to the foreground cannot create a transport or grant Arm. An already connected non-selected target continues according to its own authorized state; the UI must show this clearly and offer individual/global stop or disconnect as appropriate.
5. **Safe edits/removal.** Configuration changes must invalidate that target's prior application/Arm identity and reject stale async completion from an old draft/selection. Remove/dispose must stop scheduling, disarm, disconnect, and honor close-confirmation semantics. An unconfirmed-close owner/tombstone must not disappear merely because its visible row was removed. A late connection completion cannot revive a deleted/replaced target or adopt another row's identity.
6. **Global lifecycle fan-out.** Backgrounding, source invalidation, profile revision changes, app teardown, and global emergency disarm must reach every owner, including unselected targets. Source seek transactions remain source/request/generation/profile-specific for each target; do not reuse one target's captured Arm/seek authorization for another.
7. **Profile mapping.** All targets consume the current shared profile/precision. Store ranges by axis name, never row number. On profile/axis changes, reconcile only known compatible axes, initialize genuinely new axes deliberately, and invalidate all applied configurations/Arm states before output resumes. Per-profile output range banks would be an OHOS extension; document that choice instead of claiming it is the original storage layout.
8. **Endpoint persistence.** Store structured bounded host, port, WebSocket scheme and path, and explicitly supported platform-only fields such as address family/local bind port. Validate the closed network kind and endpoint shape before save, restore, and connect. Preserve a DNS hostname and actual WebSocket route; do not reduce WS to host/port alone. Credentials, authorization headers, cookies, bearer/API tokens, user-info, or secret-bearing URI data cannot enter ordinary settings. Reject unsupported or credential-bearing endpoint forms rather than silently changing the destination. Do not blindly persist an arbitrary full URI or unrestricted query; a conservative non-credential path subset is a legitimate documented OHOS restriction.
9. **Restore is data-only.** A settings restore produces disconnected, disarmed records with no timers, sockets, native grants, applied configuration IDs, pending writes, or automatic retries. Auto-connect policy can remain informational (`automaticRequested` already has this meaning in `ohos/entry/src/main/ets/output/OutputTypes.ts:9–10`). Reconnect requires the user's explicit action, followed separately by explicit Arm with fresh authorization.
10. **Checks before claiming completion.** Cover two or more independently configured targets; selection without lifecycle effects; isolated errors/queues/ranges/modes; ordered and selected-ID round trip; clone deep-copy and new ID; remove during connect/write; stale completion; background/profile/source invalidation across all rows; no auto-connect/auto-arm after restore; credential/unknown-kind/duplicate-ID rejection; and persistence of dormant fixed context settings. Hardware/network verification is outside this audit.

## Existing OHOS seams observed

At the time of this audit, `ohos/entry/src/main/ets/output/OutputCoordinator.ts:40–59` explicitly owns one target, which is the appropriate primitive to retain below a collection owner. `ohos/entry/src/main/ets/app/NativeOutputSession.ets:9–28` exposes one static coordinator and one static draft, and `output/OutputSettingsModel.ts:30` supplies fixed target ID `manual-network`; those are singleton seams a collection integration must replace or wrap. `NativeOutputSession.ets:34–39` already preserves unconfirmed-close ownership across Ability recreation; that safety behavior must survive for every target. These OHOS line numbers may move during concurrent integration.
