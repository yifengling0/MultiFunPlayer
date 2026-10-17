# Remote media source feasibility after 0.13

Audit date: 2026-10-16. Scope: the original WPF sources retained in this checkout and the current OHOS source, clock, library and output boundaries. This is a source-based implementation plan, not an assertion of compatibility with current player releases. No player, server, network endpoint, credentials or physical output was contacted. No remote-source implementation is included.

## Recommendation

**Implement DeoVR first, then HereSphere using the same bounded TCP framing codec.** DeoVR has a small, bidirectional JSON protocol covering resource path, play/pause, duration, position and playback speed. It needs neither Windows IPC nor an authentication/secret-storage feature. HereSphere shares the framing and commands but adds resource/identifier semantics. The proposed first milestone is a reachable source UI, explicit connection, actual received timeline observations, authorized local script matching, remote controls, lifecycle cleanup and existing output admission, all exercised with in-memory native mocks.

**A seek-preserving-arm equivalent is not supported by the evidence.** Neither source reads a command identifier, acknowledged seek target, server observation timestamp or seek-complete event. A successful TCP send or a later matching position cannot satisfy the current native seek transaction. For the first integration, commanded remote seek must synchronously revoke physical output arm and require a new explicit Arm after a valid current source frame. If retaining arm across remote seeks is mandatory, this milestone is blocked on a separately verified protocol extension or a different evidence model; do not manufacture `seekDone`.

Evidence: [DeoVR connection and reader](../Source/MultiFunPlayer/MediaSource/ViewModels/DeoVRMediaSource.cs), lines 29–155; writer/state shape, lines 173–224 and 264–270. [HereSphere reader](../Source/MultiFunPlayer/MediaSource/ViewModels/HereSphereMediaSource.cs), lines 93–179; writer/state shape, lines 197–248 and 289–295. [Current seek confirmation](entry/src/main/ets/core/PlaybackSessionCore.ts), lines 465–510; [output transaction](entry/src/main/ets/output/OutputCoordinator.ts), lines 139–195.

## Ranking of the original integrations

Ranking prioritizes a small, useful, bidirectional OHOS milestone with defensible clock evidence, rather than popularity or a claim that a player runs on OHOS. Source filenames below are under `Source/MultiFunPlayer/MediaSource/ViewModels/`.

| Rank | Original integration | Transport and original capability | Main cost or limitation |
| --- | --- | --- | --- |
| 1 | DeoVR | TCP, default `127.0.0.1:23554`; length-prefixed UTF-8 JSON; path, state, duration, position, speed in; play/pause, seek, path and speed out | New source clock/lifecycle boundary and stream parser. No seek ACK, timestamp, authentication or buffering signal in the implementation. `DeoVRMediaSource.cs:29–155,173–224,264–270`. |
| 2 | HereSphere | Same default port/framing and outbound commands; `resource` preferred over legacy `path`, optional `identifier` scene context | Additional identity and media-context handling. No stronger seek evidence than DeoVR. `HereSphereMediaSource.cs:29–40,93–179,197–248,289–299`. |
| 3 | OFS | WebSocket, default `ws://127.0.0.1:8080/ofs`; named timeline events and play/seek/speed commands; live funscript change/remove | Existing native WebSocket is close to the wire needs, but complete original parity includes streamed script replacement/removal and project reset. No bootstrap request, regular heartbeat or correlated seek ACK appears in this source. `OfsMediaSource.cs:27–28,90–174,182–206`. |
| 4 | MPC-HC | HTTP, default port 13579; `/variables.html` every 200 ms; play/pause, seek, open path | Needs an HTTP adapter and bounded HTML extraction. Seek command has whole-second `hh:mm:ss` precision; playback rate is read-only. `MpcMediaSource.cs:26,86–146,163–195,245–249`. |
| 5 | Whirligig | TCP, default port 2000; line-oriented path, stop, duration, playing-position observations | Smallest passive receiver, but the original has no command writer and no speed observation. Not the first choice for complete remote-control UX. `WhirligigMediaSource.cs:28–39,69–119`. |
| 6 | VLC | HTTP Basic password; status and playlist JSON; 200 ms polling; play/pause, seek, path and speed commands | Auth handling plus API 3/4 differences, playlist/path lookup races and coarse v3 position/duration reconstruction. `VlcMediaSource.cs:25–28,41–67,103–208,224–275`. |
| 7 | Emby | HTTP API key; device/session discovery; 500 ms session polling; play/pause and seek commands; playback rate observation | Credentials and selected session identity, slower/indirect clock, no command-correlated seek evidence. `EmbyMediaSource.cs:27–33,115–209,214–277,309–324,380–382`. |
| 8 | Jellyfin | Similar HTTP/device/session design; play/pause and seek | Same auth/session work; the retained source does not expose playback-rate observation or speed command. `JellyfinMediaSource.cs:27–33,115–204,211–296,318–333,389–391`. |
| 9 | Plex | HTTP token; client discovery; XML timeline polling and metadata; play/pause and seek | More client/header/XML/metadata plumbing. `commandID` is sent, but this reader does not correlate a completed seek to it. Long polling can exceed the current 750 ms clock budget. `PlexMediaSource.cs:28–35,120–258,275–315,358–388,480–491`. |
| 10 | mpv | Original uses Windows named pipe and optionally launches `mpv.exe`; newline JSON property observations and commands | Not a network source as implemented. A TCP bridge would be a new deployment/protocol feature, not a direct port. Original `seek` event flags the next time observation, without request correlation. `MpvMediaSource.cs:36–105,119–128,150–206,215–243`. |
| 11 | PotPlayer | Windows process/window handles, `WM_USER`, `WM_COPYDATA`, registry and `user32.dll` | Cannot reuse this transport on OHOS. Would require a Windows-side agent and an explicitly designed/authorized remote protocol. `PotPlayerMediaSource.cs:30–63,97–191,209–263,290–314`. |

Internal is intentionally excluded from the remote ranking: its OHOS clock/playlist already has a separate local integration. Ranking 5 does not imply Whirligig supports outbound control. Emby/Jellyfin are close; Emby ranks ahead only because its retained source observes rate.

## Exact first-candidate wire contract

### DeoVR framing and state

1. Open a TCP client to the configured host and port. The original performs no application handshake. The Windows-only localhost process check is a precondition in the desktop application, not a wire requirement (`DeoVRMediaSource.cs:29–55`).
2. Read exactly four header bytes, interpreted by original `BitConverter.ToInt32`, then exactly that many UTF-8 payload bytes (`:101–114`). The Windows wire expectation is little-endian signed 32-bit length; encode/decode little-endian explicitly in OHOS rather than relying on host endianness. This is derived from the retained implementation, not an independently verified published protocol specification.
3. The original treats length `<= 0` as a source reset and continues (`:103–108,161–167`). For the new parser, preserve zero-length reset behavior; reject negative/oversized lengths as malformed and fail closed rather than allocating or attempting resynchronization. This stricter handling is a disclosed safety difference.
4. A received object must contain a nonblank `path`, otherwise the original resets and ignores the rest (`:119–132`). It then reads fields in the following order:

| Field | Original conversion and meaning | Published event |
| --- | --- | --- |
| `path` | Nonblank string, changed value | `MediaPathChangedMessage(path)` |
| `playerState` | Integer; exactly `0` means playing, every other accepted integer means not playing | `MediaPlayingChangedMessage(state == 0)` |
| `duration` | Number `>= 0`, seconds | `MediaDurationChangedMessage` |
| `currentTime` | Number `>= 0`, seconds | `MediaPositionChangedMessage`, default `ForceSeek=false` |
| `playbackSpeed` | Number `> 0` | `MediaSpeedChangedMessage` |

The original emits these scalar events only when the cached value differs. Missing optional values do not themselves reset an otherwise valid path, and malformed JSON is ignored. It also does not clear every cached field merely because a path changes. Do not carry that behavior into physical-output authorization: a new OHOS resource generation must start without a usable old clock or old script binding. Require finite numbers and coherent position/duration before admitting output. Preserving original event/parse semantics and adding stricter output admission are separate layers (`DeoVRMediaSource.cs:120–158`).

Example complete inbound payload, before the four-byte length prefix:

```json
{"path":"C:\\Media\\demo.mp4","currentTime":12.5,"playbackSpeed":1.0,"playerState":0,"duration":120.0}
```

The inbound path describes a remote resource; it is not permission or a usable URI to open that file on OHOS.

### DeoVR outbound commands and keepalive

The original constructs a fresh five-property `PlayerState` for each control and sets only the relevant property. Global JSON settings select indented formatting and do not configure null omission; therefore the retained serializer emits the other properties as null. The examples below compact whitespace, preserving that field/null shape. Payload length is the number of UTF-8 bytes of the actual serialized text, not characters and not a fixed size (`DeoVRMediaSource.cs:192–217,264–270`; [Bootstrapper.cs](../Source/MultiFunPlayer/Bootstrapper.cs), lines 256–283).

```json
{"path":null,"currentTime":null,"playbackSpeed":null,"playerState":0,"duration":null}
{"path":null,"currentTime":null,"playbackSpeed":null,"playerState":1,"duration":null}
{"path":null,"currentTime":12.5,"playbackSpeed":null,"playerState":null,"duration":null}
{"path":"C:\\Media\\demo.mp4","currentTime":null,"playbackSpeed":null,"playerState":null,"duration":null}
{"path":null,"currentTime":null,"playbackSpeed":1.25,"playerState":null,"duration":null}
```

In order: Play, Pause, Seek in seconds, Change path, Change speed. Each JSON payload gets its own four-byte length prefix. The original emits exactly four zero bytes when waiting for an outbound control times out after 1000 ms (`:177–184,219–224`). This is an **idle-write keepalive**, not an unconditional timer that can interleave bytes with an active command. Outbound zero keepalive must not be confused with inbound zero reset. Keepalive has no clock-observation or seek-confirmation value.

There is no distinct Stop command in this writer. Local Stop must close processing/output admission; a remote Pause or path command is a separate deliberate remote control with clear UI semantics. No automatic reconnect, re-arm or unsolicited remote path change is needed for the first milestone.

### HereSphere differences

- Framing, state/rate/time fields, play/pause/seek/speed commands, and outgoing `path` property match the DeoVR shape (`HereSphereMediaSource.cs:100–114,158–179,219–241,289–295`).
- For received media, `resource` is preferred. A recognized but blank resource resets rather than falling back to `path`. Legacy `path` is used only when the resource branch is not taken; missing both resets (`:119–155`).
- On changed resource, an absolute `identifier` URI becomes `HereSphereMediaResourceContext.SceneUri`; the original does not fetch it in this class (`:127–135,299`). The original also does not publish an identifier-only change when resource text is unchanged. Preserve the distinction between resource identity, optional context and local script match key; do not auto-fetch context URLs or treat them as credentials.
- The idle keepalive is followed by `FlushAsync` (`:243–248`). There is still no incoming seek ACK, sequence or timestamp in the parsed fields.

## Other original message forms

These are sufficient to assess relative effort; they are not instructions to connect to a service.

- **OFS:** receive `{"type":"event","name":"media_change","data":{"path":"..."}}`, `play_change` with `playing`, `duration_change` with `duration`, `time_change` with `time`, and `playbackspeed_change` with `speed`. Times are seconds. Send `{"type":"command","name":"change_play","data":{"playing":true}}`, `change_time` with `time`, or `change_playbackspeed` with `speed`; original numeric commands use four decimal places. `funscript_change` carries `data.name` and `data.funscript`; `funscript_remove` carries `data.name`; `project_change` resets. Media-change disables default script reload. `ForceSeek` is a local setting applied to received time events, not an ACK (`OfsMediaSource.cs:105–174,184–206`).
- **Whirligig:** newline records beginning `C ` publish the remaining quoted path; malformed/empty C path resets. `S` publishes not-playing. `duration=<seconds>` publishes duration. `P <seconds>` first publishes playing, then position if parseable; decimal commas are normalized. No writer is present (`WhirligigMediaSource.cs:71–105`).
- **MPC-HC:** GET `/variables.html`; parse `<p id="field">value</p>` fields `state`, `filepath`, `duration`, `position`, `playbackrate`. State 2 is playing; times are milliseconds. GET `/command.html?wm_command=887` for Play, `888` for Pause, `-1&position=hh:mm:ss` for Seek, and `/browser.html?path=<URI-escaped-path>` for open. HTTP success is request success, not seek completion (`MpcMediaSource.cs:90–146,174–195,245–249`).
- **VLC:** Basic authorization is Base64 of `:<password>`. GET `/requests/status.json` and, on changed `currentplid`, `/requests/playlist.json`. Accept only `apiversion` 3/4; read `state`, `length`, `rate`; v4 position is `time` seconds, v3 position is fractional `position` times reconstructed duration. Controls append `?command=pl_forceresume`, `pl_forcepause`, `seek&val=<integer-seconds>`, `in_play&input=<escaped-path>` or `rate&val=<four-decimal-rate>`; blank path maps to `pl_stop` (`VlcMediaSource.cs:51–67,107–208,235–251`).
- **Emby/Jellyfin:** GET `/System/Ping`, discover `/Devices` and device options, then GET `/Sessions?...&DeviceId=<selected-id>` every 500 ms. Read session `Id`, `PlayState.PositionTicks`, `PlayState.IsPaused`, `NowPlayingItem.Path` and `NowPlayingItem.RunTimeTicks`; ticks divide by 10,000 to milliseconds. Emby also reads `PlayState.PlaybackRate`. POST an empty body to `/Sessions/<session-id>/Playing/Pause`, `Unpause` or `Seek` with `SeekPositionTicks=<milliseconds*10000>`. Emby uses query `api_key`; Jellyfin source uses `ApiKey`. The original selects the first returned session. A port must bind validated selected-device/session/resource identity and reject stale responses rather than applying a prior session's state (`EmbyMediaSource.cs:77,127–171,195–207,253–272`; `JellyfinMediaSource.cs:77,127–168,192–204,250–289`).
- **Plex:** send `X-Plex-Token`, `X-Plex-Target-Client-Identifier` and controller-identification headers. GET `/player/timeline/poll?wait=1&commandID=<n>`; after a five-second cancellation use `wait=0`. Read XML `Timeline` attributes `time`, `key`, `state`, type/stream ID, then metadata `Part.file` and `Part.duration`; times are milliseconds. GET `/player/playback/play`, `/pause` or `/seekTo`, with `type=<timeline-type>&commandID=<n>` and seek `offset=<integer-ms>`. Merely having an outgoing commandID does not prove a correlated completed seek; the reader never validates one (`PlexMediaSource.cs:140–203,219–258,289–315,480–491`).
- **mpv:** send newline JSON `{"command":["observe_property_string",1,"pause"]}` and equivalent observer IDs 2 duration, 3 time-pos, 4 path, 5 speed. Read `event:"property-change"`, `name`, `data`; `pause:"yes"` means paused. An `event:"seek"` makes the next position event ForceSeek. Commands are `set_property pause yes/no`, `set_property time-pos <four-decimal-seconds>`, `loadfile <slash-normalized-path>` and `set_property speed <four-decimal-rate>`, serialized as string arguments. None of this converts the original local named pipe into a remote TCP service (`MpvMediaSource.cs:77–105,124–128,165–206,217–243`).
- **PotPlayer:** `WM_USER=0x0400` uses `GetTotalTime=0x5002`, `GetCurrentTime=0x5004`, `SetCurrentTime=0x5005`, `GetPlayState=0x5006`, `SetPlayState=0x5007`, `GetFilename=0x6020`; `SetFilename=0x03e8` uses `WM_COPYDATA=0x004a`. Times are milliseconds; play state 2/1 is play/pause. These are Win32 IPC messages, not network packets (`PotPlayerMediaSource.cs:154–191,209–263,302–314`).

## OHOS integration boundary that must be added

### The current external clock is specifically native video

`useExternalClock(true)` sets source identity to `native`; `acceptNativeSnapshot` replaces its source generation on native generation changes and confirms seeks using native generation/seek sequence. `MediaClock` explicitly stores AVPlayer observations and only opens its gate after actual state/position plus local intent. `NativeVideoAdapter` completes seek from the actual `seekDone` callback and `player.currentTime`, never the requested position. Remote packets must not be fed into `acceptInternalPosition`, a preview clock, or fabricated AVPlayer snapshots to obtain authorization.

Evidence: [MediaClock.ts](entry/src/main/ets/core/MediaClock.ts), lines 1–17,25–83,102–105; [NativeVideoAdapter.ets](entry/src/main/ets/media/NativeVideoAdapter.ets), lines 109–122,216–224; [PlaybackSessionCore.ts](entry/src/main/ets/core/PlaybackSessionCore.ts), lines 143–169,460–519. The reachable selector currently exposes Internal and Local video: [Index.ets](entry/src/main/ets/pages/Index.ets), lines 1496–1509.

Introduce a distinct remote observation/source policy alongside the native path, with at least:

- Protocol and explicit configured endpoint identity, local connection generation, resource generation/opaque identity, observation sequence and local monotonic receive time.
- Actual observed playing, position, duration and rate, plus per-field validity. Socket-connected, source-ready, local processing intent, target-connected and target-armed are different states.
- Explicit capabilities for path/play/pause/seek/rate, and `seekCompletionEvidence=none` for DeoVR/HereSphere. Unsupported controls must be disabled rather than routed to the local preview or silently accepted.
- Generation retirement before asynchronous cleanup, bounded parser/command queues, source-switch cancellation and late callback rejection. A reconnect, path/reset event or endpoint change cannot reuse an old resource generation even when path text is identical.
- Clear separation of observation sequence from change-only events. A JSON packet with no valid time does not refresh the media-clock observation. Sending a keepalive, polling the UI or re-reading a snapshot never creates a new observation.

The original common events contain values only, without source/generation/receive time or command IDs: [Messages.cs](../Source/MultiFunPlayer/Common/Messages.cs), lines 16–21,32–36. Therefore translating those events alone loses evidence required by OHOS. The new envelope is necessary safety metadata, not a new invented server field.

### Time, identity and the unavoidable evidence limits

- The retained remote protocols provide media position, not a trusted server monotonic timestamp. A local receive timestamp bounds time since receipt; it does not measure network latency or prove when the player sampled the value. Do not relabel it as an end-to-end latency measurement.
- Within one TCP stream messages are ordered, but queued old observations may arrive after an outbound seek. Neither transport order nor target equality attributes an observation to that command. Resource path is also not a globally unique playback instance ID.
- Path/reset, reconnect and detected discontinuities must revoke old output authorization. Same-path replay/reload without any distinguishing event cannot be uniquely identified by the DeoVR wire fields; document this instead of claiming perfect identity. HereSphere identifier context improves matching information but does not create a seek transaction ID.
- The current tracker applies original smoothing and extrapolates only when its caller admits playing: >1 second error or ForceSeek snaps; otherwise it applies 0.33 error correction and a bounded 0.9–1.1 step ([MediaPositionTracker.ts](entry/src/main/ets/core/MediaPositionTracker.ts), lines 1–29). Remote receipt alone must not allow indefinite extrapolation. Gate on a bounded age of actual time reports, validate finite/ranged values and use an explicit stall policy for repeated unchanged positions while playing. A nominally alive connection/heartbeat is not evidence that playback advances.
- The current core rejects a playing native observation older than 750 ms and captures the observation used for the completed frame. That is an application policy, not a promise of these remote players' update frequency. Keep an explicit conservative remote budget and test its boundary; do not silently enlarge existing budgets to accommodate polling or long pauses. OFS change-only events and Plex long polling need specific freshness/stall design before they can support continuous physical output ([PlaybackSessionCore.ts](entry/src/main/ets/core/PlaybackSessionCore.ts), lines 525–538,583–587,664–677).
- Do not infer rate 1, duration, ready state, playback completion or pause confirmation from a requested control. For missing initial rate/state/time, remain unready for physical dispatch. A supported rate outside the current processing range needs an explicit product/validation decision, not silent clamping.

### Commanded seek and output

Before issuing any remote seek, including A/B or AutoSkip, synchronously invalidate physical output candidates and explicit arm intent. Do not invoke the same-source keep-arm transition, invent `seekSequence`, call native `endSeek`, or confirm a request merely after a transport promise resolves. The UI may separately show command submission and subsequently observed position; it must not label them acknowledged seek completion.

Later valid observations may restore preview/processing readiness. They must not restore physical arm. A new explicit Arm must still require an eligible completed frame. Do not issue an extra remote Play to manufacture completion; remote playback state remains observational. An AB/AutoSkip command can therefore interrupt physical output until re-armed: disclose this first-version behavior, or leave those automatic controls unavailable for that source. If product requirements demand continuous armed AB looping, the ACK limitation is a blocker to resolve before implementation.

The current keep-arm transaction binds source identity/generation, increasing request ID, previous/current epoch, profile and a five-second monotonic deadline. Confirmation still requires a new fully authorized frame. Any new remote path must preserve exact axes/update-kind/configuration/provenance gates, freshness and close quarantine for all targets. It must never send device bytes from the remote packet callback directly.

Evidence: [OutputTypes.ts](entry/src/main/ets/output/OutputTypes.ts), lines 92–134; [OutputCoordinator.ts](entry/src/main/ets/output/OutputCoordinator.ts), lines 121–138,139–195,202–233; [Index seek routing](entry/src/main/ets/pages/Index.ets), lines 1191–1221. Existing playing/paused proof is assembled by [PlaybackSessionCore.ts](entry/src/main/ets/core/PlaybackSessionCore.ts), lines 565–677 and 746–751.

### Resource and library binding

The remote resource is identity/matching data only. Never pass a Windows drive path, UNC path, remote HTTP URL or HereSphere identifier to OHOS `fileIo.open` or fetch an adjacent script automatically. Bind against already authorized local catalogs, or offer explicit script selection. Define bounded basename extraction separately from opaque identity: retain the full resource identity, distinguish Windows/POSIX/URL forms, handle escaping once, and refuse ambiguous matches. Do not merge equal basenames from different resources into one clock identity.

The current `ResourceLibrary.planSearch` expects a validated relative local catalog entry and does not decode URLs or infer file access. Its script selection can be reused after a validated match key and local candidates exist; its current input contract must not be bypassed by disguising a remote absolute path as a local file. Async script reads must carry the source/resource generation so a late result for A cannot attach after remote resource B appears. Clear old bindings immediately on resource replacement/reset and retain the existing no-match/invalid-script distinctions.

Evidence: [ResourceLibrary.ts](entry/src/main/ets/core/ResourceLibrary.ts), lines 131–142,225–268,326–350,431–449; existing local pair-read generation guards [Index.ets](entry/src/main/ets/pages/Index.ets), lines 1100–1181. No scene-service/script-download integration is implied by this milestone.

## Native networking, localhost, authentication and secrets

### What can be reused and what cannot

- The application already declares `ohos.permission.INTERNET` ([module.json5](entry/src/main/module.json5), line 12).
- Existing native adapters demonstrate `@kit.NetworkKit` TCP, hostname resolution, IPv4/IPv6 family selection and STARTUP monotonic time. TCP uses `on('message')`, `connect`, `setExtraOptions({TCPNoDelay:true})`, `send` and `close`; WebSocket uses actual open events and text sends ([NativeTcpTransport.ets](entry/src/main/ets/output/native/NativeTcpTransport.ets), lines 18–39,50–69,349–395; [NativeWebSocketTransport.ets](entry/src/main/ets/output/native/NativeWebSocketTransport.ets), lines 11–19,39–79).
- These are currently **output** adapters. `TransportPort.open` requires `OutputTargetConfig`; do not invent a TCode output configuration or register a player as a physical output target merely to obtain a TCP socket. Share a genuinely neutral transport/lifecycle layer or implement a source-specific native port, preserving existing output behavior ([TransportPort.ts](entry/src/main/ets/output/TransportPort.ts), lines 1–24; [NativeTcpTransport.ets](entry/src/main/ets/output/native/NativeTcpTransport.ets), lines 162–181).
- A specific reuse trap: current output receive handling discards bytes until `entry.ready`; readiness is set only after `channel.connect()` resolves, and TCP connect also awaits `setExtraOptions`. A remote source can push its initial state earlier. A source port needs bounded buffering of initial bytes, with generation checks, rather than losing its first snapshot. Test this race ([NativeTcpTransport.ets](entry/src/main/ets/output/native/NativeTcpTransport.ets), lines 183–204,365–373).
- TCP callbacks are arbitrary chunks, not JSON messages. Header/payload fragments and several coalesced frames must be handled. Bound declared payload size, total buffered bytes, messages processed per turn and outbound queue. On ambiguous write failure, do not blindly resend a control or splice a new frame after an unknown partial frame.
- Existing SDK receipts are explicitly local acceptance, with no remote ACK. Existing adapters preserve unconfirmed-close/quarantine records instead of replacing handles behind a failed close. Carry those lifecycle principles into the source port; a local close cannot claim that a remote player stopped ([NativeTcpTransport.ets](entry/src/main/ets/output/native/NativeTcpTransport.ets), lines 7–11,106–111,144–179,210–226,336–346,375–379).

### Localhost and deployment

`127.0.0.1`/`localhost` on an OHOS device refers to that device's network namespace. It does not reach a Windows player on the user's PC or the build host. Use an explicitly supplied reachable player host/port for a separate device. Do not silently copy the desktop defaults, guess emulator host aliases, scan the LAN, enable a player web interface, change firewall rules or create a bridge.

The DeoVR/HereSphere/Whirligig desktop localhost prechecks enumerate Windows processes; they cannot be ported as OHOS player-discovery logic (`DeoVRMediaSource.cs:38–40`; `HereSphereMediaSource.cs:38–40`; `WhirligigMediaSource.cs:37–39`). Remote binding/firewall/player settings, actual player update frequency and native device networking still require device/player verification. Repository API usage and SDK compilation establish implementability, not that an arbitrary player accepts remote clients.

### Authentication and private data

- DeoVR/HereSphere/Whirligig/MPC-HC/OFS source implementations do not provide an authentication exchange. Their shown TCP/HTTP/`ws` defaults are plaintext. Absence of a credential requirement is an implementation simplification, not authenticated peer identity or safe exposure to an untrusted network. First UI should use a user-selected trusted endpoint and disclose plaintext where applicable.
- VLC requires a password; Emby/Jellyfin require API keys; Plex requires a token. Original protected settings use Windows `ProtectedData` with `DataProtectionScope.CurrentUser`, which is not a portable OHOS secret store ([ProtectedStringUtils.cs](../Source/MultiFunPlayer/Common/Utils/ProtectedStringUtils.cs), lines 20–25,51–56). No Windows ciphertext import or plaintext fallback should be promised.
- Current native WebSocket endpoints intentionally reject user-info/query/authentication surfaces and do not load secrets. They can express OFS `/ofs`, but they are not an authenticated HTTP API client ([NativeWebSocketTransport.ets](entry/src/main/ets/output/native/NativeWebSocketTransport.ets), lines 7–19).
- Before implementing authenticated sources, design an approved secure credential-entry/storage path, scoped requests and redacted errors. API keys in Emby/Jellyfin query URLs and original trace logging must not be copied into OHOS logs or exported configuration. Use only dummy credentials in fixtures. Real credentials, including persistent access changes, require the appropriate user-controlled flow.
- Paths, scene identifiers and full JSON can contain private viewing information or signed URLs. Keep raw packets and secret-bearing endpoints out of logs; render bounded safe diagnostic codes. A remote packet must never change physical target settings, connect an output, arm output, read arbitrary files or trigger credential transmission.

## Verification plan without external connections

All items below can be verified by feeding bytes/events to real production code through injected in-memory SDK mocks. A loopback server is **not necessary** for these checks and none was started for this audit. Existing native tests already execute actual ArkTS implementations with only injected mocks and explicitly exclude real network modules: [output-native-network.test.mjs](tests/output-native-network.test.mjs), lines 1–18,21–55.

| Layer | Required local evidence |
| --- | --- |
| Source codec/oracle | Exact four-byte little-endian length and UTF-8 byte lengths; CJK/emoji and escaped paths; every header/payload split point; multiple frames; zero reset; malformed/negative/huge lengths; malformed UTF-8/JSON; missing/blank path; unknown fields; finite validation; seconds conversion; each outbound command including null shape; idle keepalive not interleaved with commands. Compare actual retained C# behavior where harnessable, with safety deviations listed rather than hidden. |
| Source session | Explicit Connect only; no construction-time network work; startup snapshot before connect promise completes; valid/partial snapshots; reset, path change and same-path reconnect; monotonically retired generations; slow DNS/connect/write/close; stale callbacks; bounded queues; no replay after uncertain write; error redaction and close quarantine. |
| Clock | Timestamp only when a real valid time observation is accepted; no timestamp refresh from outbound keepalive/UI snapshot; bad/nonmonotonic clocks; receipt-age and stall thresholds; paused repeated position; missing rate/duration/state; large discontinuity; no fabricated seek target; source switch during async script load. |
| Controls | Native source UI really dispatches Play/Pause/Seek/Rate to the selected remote port; displayed playing/rate/position remain observed; unsupported operations disabled; Stop closes local gates; rapid seek replacement and pre-command queued packets never confirm a request or resurrect arm. |
| Core + output | Real remote adapter + real session core + real coordinator/target collection + MemoryTransport. Test fixed and polled policies, exact axis scope, source revision/epoch, stale candidate and receipt invalidation, output-not-connected preview, explicitly armed normal playback, seek revocation, pause/home/motion policy, Stop, background, disconnect, reconnect and replacement. A received player packet cannot itself Arm or write device bytes. |
| Library + UI | Authorized catalog matching and explicit ambiguous selection; remote path never opened; old reads rejected after resource switch; no-script/invalid-script cases; controller routing for Internal/local/remote; entry/page background teardown before any late network callback; no auto reconnect/resume/arm. |
| SDK integration | Compile the reachable source adapter, panel and Index lifecycle wiring against the same supported official SDK; add source-specific smoke coverage, then run the existing aggregate regressions. A codec-only test or unreachable adapter is not end-to-end completion. |

The existing seek/output and native-video tests are regression requirements, not evidence that a new remote protocol already works: [output-seek-transaction.test.mjs](tests/output-seek-transaction.test.mjs), [playback-session-dispatch.test.mjs](tests/playback-session-dispatch.test.mjs), [native-video-adapter.test.mjs](tests/native-video-adapter.test.mjs), [multi-output-integration.test.mjs](tests/multi-output-integration.test.mjs). Background currently closes output admission synchronously in [EntryAbility.ets](entry/src/main/ets/entryability/EntryAbility.ets), lines 34–44; a source owner must receive equivalent invalidation instead of depending only on a delayed UI watcher.

## Milestone completion and remaining real-device gates

The next source milestone is complete only when DeoVR is reachable through the actual application, receives an observed timeline, binds authorized scripts, routes its supported controls, preserves existing pipeline/output rules and passes source/native-mock/controller/aggregate/SDK checks. Document the intentional lack of same-source seek arm retention, authentication and remote-file fetching. HereSphere can follow once its resource/context behavior has equivalent tests; it should not be enabled merely because its TCP framing matches.

A separate, explicitly authorized device/player validation must establish: actual host reachability and server settings, player version compatibility, captured message shapes/frequency, endianness/empty-message behavior, latency/stall behavior, play/rate/seek results, suspend/resume and cleanup on real OHOS. Physical output validation is an additional separate gate. Mock or build success must never be reported as proof of accurate remote playback synchronization, remote command completion, device execution or hardware safety.

Audit deliverable: this document only. No source files, tests, configuration, credentials or network state were changed by this audit; no remote-player or hardware validation was run.
