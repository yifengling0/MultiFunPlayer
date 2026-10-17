# 0.21 next real media source: retained-source audit

## Decision and evidence boundary

**Implement HereSphere as the next one complete, explicitly connected remote source.** It has the best combination of an already portable transport, no credential dependency, observed position/state/duration/rate, and all four original outbound controls. The retained HereSphere and DeoVR adapters differ primarily in media identity decoding; their framing and command shape are the same. This is a source-based engineering recommendation, not a current vendor compatibility, real-player, SDK/HAP or physical-device acceptance claim.

The scope is source selection → explicit connect → received media identity/clock → authorized catalog matching → existing axis pipeline → explicitly connected/armed output, plus play/pause, seek, path and speed commands, cancellation and teardown. An endpoint row or alternative label on DeoVR alone does not meet this scope.

This audit read retained C# and current OHOS ownership/UI code. It verified all **18 remaining external-source registration sites** against the immutable 0.19 ledger's source hashes and exact registration/callback text. It also executed the retained HereSphere reader/writer in an in-memory .NET oracle: **187 assertions passed**, including 44 reader cases, 17 writer cases, 17 resource vectors and five additional context assertions. No real socket, player, external endpoint, physical device, credentials, media file, Git operation, File recording or signing operation was used. Only this new repository document was written by this audit; the execution harness and outputs are temporary files.

Evidence is a snapshot taken on **2026-10-16 UTC**, before independent acceptance of concurrent 0.21 implementation. Existing docs and source remain untouched by this audit. Original source identifier in the baseline ledger is `36c08fbb99ac9398a63ff1cca1bbf68cd2228a94`; this audit did not inspect Git.

## Candidate comparison

| Candidate | Original protocol and observations | Controls actually implemented | Main portability/correctness cost | Decision |
|---|---|---|---|---|
| **HereSphere** | TCP `127.0.0.1:23554` default; signed 32-bit length + UTF-8 JSON; `resource` preferred over legacy `path`; optional `identifier`; `playerState`, `duration`, `currentTime`, `playbackSpeed` | Play/pause, fractional-second seek, remote path, speed; idle four-zero-byte keepalive | Windows loopback process precheck is nonportable; no server timestamp or correlated acknowledgement; strengthen lifecycle/freshness and source-kind ownership | **Next source** |
| VLC | HTTP Basic with empty username/password; `/requests/status.json`, `/requests/playlist.json`; original `apiversion` must be 3 or 4; 200 ms polling | Force resume/pause, integer-second seek, in-play/stop path, rate | Secure password entry/storage/transport; credential-bearing destination isolation; separate version-specific timeline/playlist semantics | Useful later; materially larger security/protocol scope |
| MPV | Windows `NamedPipeClientStream(".", "multifunplayer-mpv")`, optional `mpv.exe` launch/download; JSON line property observers | Pause, `time-pos`, `loadfile`, speed; original observes `seek` event as ForceSeek for next position | No original network endpoint; OHOS local process/IPC replacement or separately deployed bridge required; Arguments action must control real launch | Defer; a TCP textbox would misrepresent original implementation |
| Whirligig | TCP default port 2000; passive lines `C`, `S`, `duration=`, `P`; position/duration/state | **No outbound writer**, no observed rate | Limited source capabilities; no remote play/pause/seek/rate controls can honestly be enabled | Feasible receive-only adapter later; lower complete-player value |

Primary evidence: [HereSphere:29–299](../Source/MultiFunPlayer/MediaSource/ViewModels/HereSphereMediaSource.cs#L29), [VLC:25–305](../Source/MultiFunPlayer/MediaSource/ViewModels/VlcMediaSource.cs#L25), [MPV:24–359](../Source/MultiFunPlayer/MediaSource/ViewModels/MpvMediaSource.cs#L24), [Whirligig:28–153](../Source/MultiFunPlayer/MediaSource/ViewModels/WhirligigMediaSource.cs#L28).

### Comparison details that should not be erased

- VLC's default HTTP client timeout is five seconds; AutoConnect changes it to 500 ms. API 3 resets on negative `currentplid`, reconstructs duration from prior duration/`length`/`time ÷ position`, and derives position from fraction × duration. API 4 resets on stopped state and uses `time` directly. A changed playlist ID triggers a playlist read and selection of the current leaf's URI. The source has no finite/zero-denominator protection around the API 3 duration heuristic. A portable implementation must tighten these hazards explicitly, not infer milliseconds from API 3 integer `time`. Seeking truncates to `(int)TotalSeconds` ([VLC:103–251](../Source/MultiFunPlayer/MediaSource/ViewModels/VlcMediaSource.cs#L103)). Password uses Windows protected-string persistence, not an OHOS secret store ([VLC:258–275](../Source/MultiFunPlayer/MediaSource/ViewModels/VlcMediaSource.cs#L258)).
- MPV observes pause/duration/time-pos/path/speed using `observe_property_string`; a `seek` event marks the next position event ForceSeek. This is not a correlated command acknowledgement. The original executable/arguments/auto-start UI is real process-management UI, including a Windows bootstrapper download, and cannot be reproduced by storing text without a process/IPC implementation ([MPV:36–147,150–247,270–343](../Source/MultiFunPlayer/MediaSource/ViewModels/MpvMediaSource.cs#L36)).
- Whirligig publishes playing=true on every `P` line even if its position fails parsing; `S` only changes playing, `C` changes path or resets, and duration/position parsing replaces comma with dot. Its reader uses platform StreamReader framing with no source-level line bound ([Whirligig:69–119](../Source/MultiFunPlayer/MediaSource/ViewModels/WhirligigMediaSource.cs#L69)).

## All 18 still-unwired media-source registrations

These are **registration sites**, not 18 sources and not 18 UI fields. All were checked against `original188RegistrationEvidence` and `coverage019Templates` in the [0.19 ledger](tools/reference/action-coverage-019-source.json). Row IDs remain the stable original-site numbers.

| Site | Original concrete name | Exact owner/callback effect | Real dependency |
|---:|---|---|---|
| 5 | `Emby::ServerBaseUri::Set` | Emby:333, assign only after absolute `Uri.TryCreate` | Authenticated server/session lifecycle |
| 6 | `Emby::ApiKey::Set` | Emby:341, direct ApiKey assignment | Secure credential entry/storage and authenticated requests |
| 7 | `Emby::Device::SetByName` | Emby:345, first ordinal exact name match, then select device ID | Actual discovered device list and selected-session owner |
| 8 | `Emby::RefreshDevices` | Emby:355, await RefreshDevices only if CanRefreshDevices | Disconnected, not busy, URI and API key present; real discovery |
| 9 | `HereSphere::Endpoint::Set` | HereSphere:275, NetUtils.TryParseEndpoint then assign | Framed TCP reader/writer, source owner, media identity, clock and UI |
| 21 | `Jellyfin::ServerBaseUri::Set` | Jellyfin:342, absolute URI then assign | Authenticated server/session lifecycle |
| 22 | `Jellyfin::ApiKey::Set` | Jellyfin:350, direct ApiKey assignment | Secure credential handling and authenticated transport |
| 23 | `Jellyfin::Device::SetByName` | Jellyfin:354, first ordinal exact name match, then select ID | Actual refreshed device list and ID ownership |
| 24 | `Jellyfin::RefreshDevices` | Jellyfin:364, guarded async refresh | Disconnected/not-busy/URI/API-key guard and real discovery |
| 25 | `MPC-HC::Endpoint::Set` | Mpc:222, endpoint parser then assign | HTTP/HTML variable poller and real controls |
| 26 | `MPV::Arguments::Set` | Mpv:351, direct Arguments assignment | Optional actual process launch and named-pipe IPC |
| 27 | `OFS::Uri::Set` | Ofs:234, absolute URI then assign | WebSocket timeline plus live funscript/project changes |
| 28 | `Plex::ServerBaseUri::Set` | Plex:447, absolute URI then assign | Authenticated XML timeline/metadata and client routing |
| 29 | `Plex::PlexToken::Set` | Plex:455, direct token assignment | Secure token handling, client-specific headers |
| 30 | `Plex::Client::SetByName` | Plex:459, first ordinal exact name match, then MachineIdentifier | Actual refreshed clients and selected client owner |
| 31 | `Plex::RefreshClients` | Plex:469, guarded async refresh | Disconnected/not-busy/server/nonblank-token guard and discovery |
| 32 | `VLC::Endpoint::Set` | Vlc:284, endpoint parser then assign | Password/HTTP Basic, API version, playlist and clock |
| 33 | `Whirligig::Endpoint::Set` | Whirligig:142, endpoint parser then assign | Passive TCP line reader with truthful limited capabilities |

Links: [Emby registrations](../Source/MultiFunPlayer/MediaSource/ViewModels/EmbyMediaSource.cs#L328), [Jellyfin](../Source/MultiFunPlayer/MediaSource/ViewModels/JellyfinMediaSource.cs#L337), [MPC-HC](../Source/MultiFunPlayer/MediaSource/ViewModels/MpcMediaSource.cs#L217), [OFS](../Source/MultiFunPlayer/MediaSource/ViewModels/OfsMediaSource.cs#L229), [Plex](../Source/MultiFunPlayer/MediaSource/ViewModels/PlexMediaSource.cs#L442). OFS specifically includes `funscript_change`, `funscript_remove`, `project_change` and media changes with `ReloadScripts:false`; a clock-only adapter would omit its core live-edit integration.

The shared source Connection Toggle/Connect/Disconnect sites **77–79 already have partial coverage** for Internal and DeoVR. HereSphere should add three **concrete names** at these same sites plus row 9's concrete Endpoint name. It must not count as three new original registration sites. Shared AutoConnect Set/Toggle sites 2–3 remain partial unless the actual host scan is implemented; saving a toggle is insufficient. The common Media Path/PlayPause/Position/Speed actions must route to the real selected owner rather than create redundant source-specific aliases.

If the only catalog change is those four HereSphere IDs, inherited 0.19 arithmetic would be **182 IDs = 164 original concrete + 14 normalized aliases + 4 OHOS additions**, **154/188 sites exposed**, and conservatively **110 full / 44 partial / 34 unwired**. This is a conditional projection, not a completed 0.21 audit. The remaining 18-source group becomes 17, with row 9 partial rather than unrestricted full. Independent final catalog/source-route audit must verify this and retain every inherited limitation.

## HereSphere: complete retained contract

### Connect, disconnect and source selection

[HereSphere:23–90](../Source/MultiFunPlayer/MediaSource/ViewModels/HereSphereMediaSource.cs#L23) and [AbstractMediaSource:54–124,176–202](../Source/MultiFunPlayer/MediaSource/AbstractMediaSource.cs#L54) establish:

1. Default endpoint is loopback port 23554. Null endpoint rejects connection. Loopback additionally checks a Windows process name matching case-insensitive `heresphere`; this is host convenience, not a protocol handshake.
2. Base connection begins only from Disconnected, sets Connecting, delays 250 ms for AutoConnect, then starts a run task. HereSphere uses a new TcpClient, with 500 ms connect cancellation only for AutoConnect. Successful TCP connect immediately marks Connected, before any valid media observation.
3. Reader and writer run together; first completion cancels the linked token. The original does not explicitly await both tasks with WhenAll. Final reset is published unless disposing; a connect failure returns before that reset block.
4. Base source accepts controls only while Connected into an unbounded channel, drained at run entry and normal exit. Disconnect marks Disconnecting, delays 250 ms, cancels/awaits the run, disposes token and clears ownership. Dispose does not transmit a pause/stop command.
5. [MediaSourceViewModel:114–230](../Source/MultiFunPlayer/UI/Controls/ViewModels/MediaSourceViewModel.cs#L114) serializes transitions with a semaphore and owns one current source. New source connection closes the current source first. The view's selected tab is not itself the connected owner. Host AutoConnect scans shown enabled sources after 2500 ms, at a default 5000 ms interval; hiding a current source disconnects it.

OHOS should retain its stronger explicit-intent, bounded-queue, early-byte buffering, generation retirement, cancel-before-await, background teardown and close-quarantine guarantees. Do not copy original unbounded/lifetime assumptions as safety guarantees. Do not implement Windows process enumeration or silently start/discover a remote player.

### Frames, fields and identity

[HereSphere:93–195](../Source/MultiFunPlayer/MediaSource/ViewModels/HereSphereMediaSource.cs#L93) is the primary reader:

- Read exactly four header bytes, interpret signed int32 using BitConverter, then read exactly that many UTF-8 bytes. The executed .NET host is little-endian, as are the retained Windows targets. Original source has no frame-size cap. Incoming **zero or negative length resets media state**, rather than freshening a clock. Repeated reset before allocated state produces no event. Truncated header/payload ends the reader with EndOfStreamException in the in-memory execution.
- Parse JObject; field names are case-sensitive. Json.NET conversion accepts a broader domain than strict JSON-typed TS: numeric strings and fractional-to-int conversions, number/bool media strings, duplicate last-wins keys, and replacement decoding of invalid UTF-8. The portable implementation should remain strict, finite, Unicode-valid and bounded; list these deliberate domain differences.
- Prefer `resource` if present and convertible to string. **A blank resource resets immediately even when a valid legacy path is also present.** Missing/null/unconvertible resource falls back to `path`; a missing/blank/unconvertible path resets. The executed C# also converts numeric/bool resource to `"42"`/`"True"`, which then wins; a strict portable decoder must not accidentally describe its narrower behavior as identical.
- On changed resource, attach `HereSphereMediaResourceContext` only if `identifier` converts to an absolute URI. A relative/invalid/missing identifier yields null context. The source accepts absolute non-HTTP schemes, including FTP. Legacy `path` never uses identifier context. **Identifier-only changes on the same media string do not publish a path/context update.** A resource-to-legacy transition with identical string likewise has no new path event.
- Repository-wide symbol search found no other HereSphereMediaResourceContext/SceneUri consumer. [MediaResourceInfo equality](../Source/MultiFunPlayer/MediaSource/MediaResource/MediaResourceInfo.cs#L16) compares Source and Name and ignores Context. Preserve useful bounded scene metadata as inert data, but neither fetch identifier URLs nor claim Stash/XBVR integration from this record. An intentionally stricter URI validator is acceptable if disclosed.
- Changed `playerState` converts to int, with 0 meaning playing and every other int meaning not playing. Changed nonnegative duration/currentTime become TimeSpan seconds; changed positive playbackSpeed becomes a speed event. Event order in a full packet is path, playing, duration, position, speed.
- Optional cached fields are retained when omitted/invalid or when path changes; equality suppresses duplicate original events. A new resource still needs its own field evidence in OHOS. Equal currentTime packets may be new receipts but cannot prove playing-clock progress. Json errors are swallowed by the original; OHOS rejection must not grant freshness or preserve a pending control proof as if a valid packet arrived.

### Commands and heartbeat

[HereSphere:197–253,289–295](../Source/MultiFunPlayer/MediaSource/ViewModels/HereSphereMediaSource.cs#L197) has four outbound controls:

| Common control | Populated JSON property | Value |
|---|---|---|
| Play/Pause | `playerState` | 0 / 1 |
| Seek | `currentTime` | `TimeSpan.TotalSeconds`, fractional seconds retained to source TimeSpan precision |
| Change path | `path` | Requested remote path, **not `resource`** |
| Change speed | `playbackSpeed` | Requested scalar |

The serialized PlayerState property order is path/currentTime/playbackSpeed/playerState/duration, with every unused property included as null. Bootstrapper enables indented JSON and does not change default null inclusion. UTF-8 byte length, not string character count, prefixes the payload. An idle writer waits 1000 ms then sends exactly four zero bytes and FlushAsync; commands reset that idle wait. Unknown control messages do not produce writes. The original writer directly accepts some unsafe domains (negative seek or speed, blank path); the portable public command contract must retain explicit numeric/path guards.

There is **no wire request ID, command acknowledgement, seek completion event, server sample timestamp or measured transit delay**. Neither send completion nor a position approximately matching a requested seek proves remote execution. Every seek/path change must revoke physical Arm before dispatch and require fresh source/resource evidence plus explicit re-Arm. Play/pause/rate continuity may use the existing bounded later-observation policy for already-Armed targets only if its original-owner/dispatch-boundary/whole-packet proof remains intact for HereSphere; it is still not an ACK.

### Source UI, persistence and common media controls

[HereSphereMediaSource.xaml:13–89](../Source/MultiFunPlayer/MediaSource/Views/HereSphereMediaSource.xaml#L13) includes the shared expander; a busy-aware parent ToggleConnectAsync button; connected/disconnected tooltip/icon; AutoConnect toggle; and endpoint editor enabled only when disconnected. The shared host UI supplies visible source tabs, status and scan timing. The source persists Endpoint, while the base persists AutoConnectEnabled. The endpoint shortcut uses NetUtils.TryParseEndpoint, which is distinct from the WPF host/port field parser and accepts a broader domain than current OHOS endpoint validation.

[ScriptViewModel:1011–1052,1412–1463](../Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs#L1412) provides common PlayPause Set/Toggle, Path Set, Speed Set/Offset, Time/Percent Set/Offset and SkipToScriptStart. Seek helpers require finite duration and clamp to 0..duration; speed snaps within 0.01 of 1 and floors at 0.01 without an original upper cap. Commands publish messages; they do not optimistically change observed media state. Existing common seek-loop/auto-skip paths also need correct remote ownership, not only a new source panel button.

## Implementation acceptance contract

The following requirements are stronger portable ownership requirements, not claims about original C# safeguards:

1. **Real owner identity.** Carry source kind plus connection/resource generation through settings, app session, transport callback, packet observation, script search, core source identity, control boundary and output proof. Equal numerical generations for HereSphere/DeoVR must not collide. Current core uses a `deovr:` identity and current Index has one named singleton; audit every hard-coded branch before widening it. Only one selected source may drive the engine. Old callbacks must be inert before waiting for close.
2. **Complete safe switching.** Disconnect prior source and require confirmed closure before admitting the next, including faulted/opening/late-open sources. Preserve quarantine after failed close. Returning to Internal/video, background, page disappearance, settings restore and endpoint edits must retire HereSphere work just as they retire DeoVR. Connection and selection never Arm or restore a socket.
3. **Reachable settings/UI.** Add HereSphere source choice, independently saved validated host/port, real connect/cancel/disconnect, observed status/path/position/duration/playing/rate/freshness/error. Do not show a working-looking AutoConnect control without a scan. Endpoint edits are disconnected-only and stale UI closures cannot edit a newer owner. Read-only settings must still permit cancel/disconnect. Preserve 0.20 narrow-pane/readability behavior.
4. **Backward-compatible settings.** Restore old Internal/DeoVR configurations by explicitly adding HereSphere defaults; do not relax unknown-field/credential/runtime-state rejection. New settings persist source choice/endpoints only. Invalid/missing/future data must not choose a live source or auto-connect.
5. **Received timeline only.** TCP-connected is distinct from media-ready. Preserve finite bounds, per-resource field validity, receipt sequencing, monotonic receive time, changed-position stall detection and stale expiry. Unknown fields, keepalive sends/receives, malformed packets, cached snapshots and redraws never mint freshness. Existing 750 ms policy is a local safety budget, not a measured HereSphere update-rate guarantee.
6. **Authorized matching only.** Use `resource`/fallback path as bounded identity and basename matching hints against current authorized catalog. Never read the remote path or identifier, traverse remote shares, or open new libraries implicitly. Bind async lookup/read/parse/apply to exact source kind, owner, resource, catalog/root/profile revision; reject stale completions and ambiguity. Retain stable axis pipeline and original locking/link behavior.
7. **Actual commands.** Route every existing common play/pause, rate, seek/loop/auto-skip, remote-path and stop entry point to the current source. Do not turn source connection into remote play, or report local send as player confirmation. Preserve strong receive-boundary proofs for play/rate continuity and unconditional seek/path disarm.
8. **Regression isolation.** The new resource decoder must not cause DeoVR packets with `resource` but no `path` to become valid. Distinct source owner/factory identity and cancellation must be proved even if shared framing/command primitives are reused. Prefer one narrowly parameterized engine with mode-specific decoder and explicit kind over a broad unrelated refactor or duplicated safety implementation.

## Required local fixture and integration matrix

| Layer | Minimum evidence |
|---|---|
| Original reader/writer | Retained-source hashes, method extraction disclosure, fragmentation/coalescing/reset, resource/path precedence, context changes, null/coercion differences, four command byte frames and idle keepalive |
| Bounded portable protocol | Valid UTF-8/Unicode, oversized/header/JSON complexity, bad types, signed length, source-specific decoder isolation, inert URI metadata, numeric finiteness/time precision |
| Transport lifecycle | Early bytes, delayed open after cancel, EOF, connect/send/close timeout, failed close quarantine, handler detach, command queue expiry, late receives/writes |
| Source switching | Internal↔HereSphere, DeoVR↔HereSphere, same numerical generations across kinds, in-flight connect/control/match, background/reappear, endpoint change, read-only settings close |
| Media clock/output | Ready versus connected, full fields versus sticky-cache fields, equal position stall, missing currentTime, reset/no media, resource replacement, stale expiry, no send-as-ACK, seek/path disarm |
| Command continuity | Same real source owner only; frame header first byte after dispatch boundary; no recycled/pre-dispatch packet; timeout/new command/replacement cancellation; only previous armed targets can resume |
| Application/UI | Loaded panel selection/edit/connect/cancel/disconnect; all common controls; saved config migration; host/port error/status; narrow pane/scroll; stale closure suppression |
| Catalog accounting | Exactly one newly exposed original registration site for HereSphere endpoint; three additional concrete shared connection names; inherited aliases/statuses unchanged unless separately evidenced |

No real-player tests are replaced by fixtures. Manual authorized verification remains necessary for current HereSphere server configuration, actual packet cadence and native OHOS behavior. Fixture results do not verify Windows/WPF/Fody execution, actual socket lifecycle, platform build, signed HAP, hardware movement or remote application action completion.

## Executed checks and reproducibility

- **PASS:** Python static comparison checked all 18 current source-file SHA-256 values against 0.19 ledger, exact line-range registration/callback text, and inherited unwired statuses.
- **PASS:** Temporary extracted HereSphere original oracle, 187 assertions; .NET 9.0.21 / Newtonsoft.Json assembly 13.0.0.0; little-endian execution; idle write `00000000` after 1001 ms. Reader/writer method bodies came from HereSphere lines 93–253; only private→public and TcpClient/NetworkStream→MemoryClient/Stream parameter adaptations were made. PlayerState 289–296 and context record 299 were retained. Json helpers and exact-read helper were extracted unchanged; primitive-relevant Bootstrapper serializer formatting/error handling was reproduced. Existing DeoVR harness was adapted to HereSphere and extended with resource/context cases.
- Temporary reproducible driver: `/tmp/audit_heresphere_021.py`; generated harness, compiler response, binary and complete JSON evidence: `/tmp/mfp-heresphere021-audit-yxh3oqlm/`. These are local engineering evidence, not shipped app assets or a durable test suite; implementation should retain its own reproducible fixture harness.
- **Not run by this audit:** full OHOS Node suite, SDK/ArkTS build, HAP package inspection, actual native sockets, real HereSphere/VLC/MPV/Whirligig, Windows UI, output-device tests. No runtime implementation acceptance is implied.

Primary source SHA-256 values:

| Source | SHA-256 |
|---|---|
| HereSphereMediaSource.cs | `bf17b4412d45fcafd9e88bc2cbdab137786afb96e8630e0b7e230d82f1ff56f6` |
| VlcMediaSource.cs | Prefix `2c95f2d4cfc1`; full value verified against original ledger |
| MpvMediaSource.cs | Prefix `58e0446561b2`; full value verified against original ledger |
| WhirligigMediaSource.cs | Prefix `6f28db0f782f`; full value verified against original ledger |

The recommendation closes a genuine second remote-player loop while leaving authentication-heavy sources, live editor integration and Windows process/IPC sources explicitly out of scope.
