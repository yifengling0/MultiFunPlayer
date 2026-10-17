# DeoVR original-source contract for 0.18

## Result and evidence boundary

The retained original has a bidirectional, unauthenticated TCP JSON source with a received media timeline and four remote control messages. It has **no correlated seek acknowledgement, server sample timestamp, resource-instance ID, or command ID**. A successful socket write and a later nearby position are not acknowledgements. The OHOS owner must revoke physical Arm before every remote seek, including automatic loop/skip seeks, and must never feed a remote packet through a native AVPlayer seek-complete route.

This audit extends [the 0.17 dependency assessment](REMAINING_ORIGINAL_DEPENDENCIES_017.md), tracing the actual original reader/writer, global serializer, connection owner, WPF settings/control bindings, media-resource builder and script matching. It does not claim 0.18 production implementation, action coverage, SDK/HAP success, WPF execution or real-player/device verification.

The isolated [original-source oracle](tools/deovr-original-oracle/run.py) executes extracted original reader/writer method bodies and the unchanged resource builder with in-memory streams. On Linux .NET 9.0.21 / Newtonsoft.Json 13.0.3 it passed **162 assertions: 34 reader cases, 17 writer cases, 17 resource observations, and the idle keepalive check**. [Machine-readable fixtures](tools/deovr-original-oracle/original-fixtures.json) contain complete framed input bytes, emitted events, terminal exceptions, actual command bytes and runtime/source provenance. The Windows-specific `System.IO.Path`, WPF/Fody, actual sockets, host source selection and repositories were not executed. No external player/physical endpoint was contacted, no File recording was started, and no Git command was run.

All source anchors below are relative to the retained `Source/MultiFunPlayer/` tree. The retained provenance identifies source commit `36c08fbb99ac9398a63ff1cca1bbf68cd2228a94`; this audit verifies file bytes by SHA-256 rather than querying Git.

## 1. Wire framing and observation semantics

Primary implementation: [DeoVRMediaSource.cs:94–171](../Source/MultiFunPlayer/MediaSource/ViewModels/DeoVRMediaSource.cs#L94). Exact-read helper: [Extensions.cs:241–256](../Source/MultiFunPlayer/Common/Extensions.cs#L241).

1. Read exactly four bytes, then `BitConverter.ToInt32(lengthBuffer, 0)`. This is **signed native-endian Int32** in source, little-endian on the original Windows x64 target and the executed Linux x64 oracle. An explicit little-endian OHOS codec is the appropriate portable contract, rather than a network/big-endian integer.
2. A length **less than or equal to zero** calls `ResetState` and immediately reads the next header. No payload is consumed. Reset emits a message only if the reader has allocated its `PlayerState`; it then sets that state to null. Repeated empty frames therefore do not repeatedly emit reset. Negative lengths are reset markers in the retained code, not a fatal validation error.
3. A positive length allocates `PlayerState` if needed, allocates exactly that many payload bytes and reads them fully. There is no explicit maximum frame length, buffered-byte budget, depth budget, receive deadline or per-dispatch work cap here. Fragmented headers/payloads and adjacent complete frames are handled by `ReadExactlyAsync` plus the loop. Truncation raises `EndOfStreamException` from the helper.
4. `Encoding.UTF8.GetString` uses replacement fallback, not strict validation. Invalid UTF-8 inside a string can become U+FFFD and still produce a path event. The executed oracle proves this distinction.
5. Parse with `JObject.Parse`; keys use exact, case-sensitive `TryGetValue`. JSON errors inside the parse block are swallowed. A malformed positive frame preserves previous fields; it has nevertheless allocated a state, so a subsequent zero frame can emit reset even when no valid path has ever arrived. Unknown properties, including `title`, `timestamp`, `seekComplete` or `commandId`, are unused.
6. Every positive parsed observation must carry a convertible, non-null, non-whitespace `path`. Missing/blank/unconvertible path resets state and skips all remaining fields. A packet containing only `currentTime` is not a partial clock update.

### Field order, accepted domain and caching

The source checks fields in the following order irrespective of JSON property order. All fields except `path` are optional and are retained when missing, null, unconvertible or outside the stated comparison.

| JSON field | Original conversion and condition | Original effect |
| --- | --- | --- |
| `path` | `TryToObject<string>`, then non-whitespace | If ordinal string differs, publish `MediaPathChangedMessage(path)` then cache it. |
| `playerState` | `TryToObject<int>`, any resulting Int32 | If different from cached integer, publish `MediaPlayingChangedMessage(state == 0)`. All nonzero integers mean not playing; changing 2 to -1 publishes a second false event. |
| `duration` | `TryToObject<double>`, `>= 0` | If different, publish `TimeSpan.FromSeconds(value)`, then cache seconds. |
| `currentTime` | `TryToObject<double>`, `>= 0` | If different, publish position `TimeSpan.FromSeconds(value)`, then cache seconds. There is no duration clamp. |
| `playbackSpeed` | `TryToObject<double>`, `> 0` | If different, publish raw double speed, then cache it. |

`PlayerState` contains nullable optional numeric fields, not default zero/one values ([DeoVR:264–270](../Source/MultiFunPlayer/MediaSource/ViewModels/DeoVRMediaSource.cs#L264)). The very first reported zero duration/position or state 0 therefore emits an event. **Changing `path` does not clear those other cached fields**. The executed changed-path fixture emits only a path message when the optional values equal the old resource's values. Repeating an unchanged `currentTime` emits no original position message, even if a packet was newly received.

The equality cache retains the raw double, while the duration/position event carries a TimeSpan quantized to 100 ns. Executed inbound 3.00000015 duration emits 3.0000001 seconds and 0.00001235 currentTime emits 0.0000123. CurrentTime 1.00000001 followed by 1.00000002 emits two separate position events whose values both equal 1 second; a third identical 1.00000002 is suppressed. A port that only compares quantized snapshots would lose this source event distinction.

Conversion is Json.NET coercion, not a strict JSON schema. [Extensions.cs:28–56](../Source/MultiFunPlayer/Common/Extensions.cs#L28) explicitly rejects `JTokenType.Null`, then invokes `ToObject(typeof(T), serializer)` and catches `JsonException`. [Bootstrapper.cs:256–283](../Source/MultiFunPlayer/Bootstrapper.cs#L256) supplies the global serializer and handles serializer/reader/writer error events. The isolated oracle reproduces the primitive-relevant global settings and confirms:

- Numeric strings such as `"2"` and `"1.5"` are numeric observations.
- `path: 42` becomes `"42"`; `path: true` becomes `"True"`.
- Boolean numeric fields are ignored under these settings.
- Fractional numeric `playerState` is rounded by Json.NET conversion: the sequence 0.5, 1.5, 2.5 becomes 0, 2, 2 and produces true, false, then no new state event.
- Duplicate JSON names use the last value in `JObject.Parse`.
- Unconvertible optional objects/arrays/bogus strings are ignored in the tested cases.
- NaN fails the numeric comparisons and is ignored; positive infinity **passes** the speed check and is published. Positive-infinite duration raises `OverflowException` in `TimeSpan.FromSeconds`, which is not swallowed by the inner `catch (JsonException)` and terminates the read task. The port must not reproduce this unsafe acceptance.

Stricter OHOS UTF-8/JSON, finite-number, exact-type, length/depth/string/resource-budget rules are intentional restrictions and require explicit documentation. They cannot be called identical to every original input domain merely because ordinary packets match.

## 2. Exact outbound commands and idle behavior

[DeoVRMediaSource.cs:173–228](../Source/MultiFunPlayer/MediaSource/ViewModels/DeoVRMediaSource.cs#L173) waits for a control-channel item or a 1,000 ms delay. It cancels the losing wait. On a supported command it creates a fresh `PlayerState`, sets exactly one property, serializes it, prefixes the UTF-8 **byte** count and awaits `stream.WriteAsync`.

| Common message | Set member / wire field |
| --- | --- |
| `MediaPlayPauseMessage(true/false)` | `State = 0/1` → `playerState` |
| `MediaSeekMessage(TimeSpan)` | `Position = Position.TotalSeconds` → `currentTime` |
| `MediaChangePathMessage(string)` | `Path = Path` → `path` |
| `MediaChangeSpeedMessage(double)` | `Speed = Speed` → `playbackSpeed` |

Unsupported control messages are consumed and ignored. There is no command coalescing, result ID, retry protocol or response waiter in this method. Its own setters do not clamp seek/rate; the executed direct-control negative seek serializes `-1.0`. UI time-seek validation/clamping is a separate caller contract in section 5.

The actual JSON property order is `path`, `currentTime`, `playbackSpeed`, `playerState`, `duration`; all five properties are present, including nulls. Global `Formatting.Indented` is significant for exact byte fixtures. No applicable primitive global converter overrides these fields; the global endpoint/filesystem/axis/shortcut/log-level converters target other types. Whole-number nullable doubles retain a fractional `.0` in Json.NET serialization. For example, the executed Linux play payload is exactly:

```json
{
  "path": null,
  "currentTime": null,
  "playbackSpeed": null,
  "playerState": 0,
  "duration": null
}
```

It is 106 UTF-8 bytes with LF newlines and no trailing newline; its header is `6A 00 00 00`. Pause changes 0 to 1. Rate 1 uses `"playbackSpeed": 1.0` and is 108 bytes; seek 1.25 is 109 bytes. The fixtures contain the exact Unicode/quote/backslash escaping case as well. The Linux LF fixture is **not proof of Windows CRLF bytes**. JSON-equivalent compact formatting or LF normalization on OHOS must be described as a representation choice if it differs from a deployed original, and a real-player test is still needed.

Additional executed float fixtures establish uppercase exponent notation with a signed, at-least-two-digit exponent: seek 0.00001 becomes `1E-05`, seek 0.0001 remains `0.0001`, and one TimeSpan tick becomes `1E-07`. TimeSpan conversion happens before writing: requested 0.00001235 seconds becomes `1.23E-05`, 3.00000015 becomes `3.0000001`, and 1.00000005 becomes `1.0`, consistent with truncation to 100 ns ticks in this runtime. Each seek fixture records `originalRequestedSeconds` separately from its resulting command JSON. Direct speed has no TimeSpan stage: 1.2345678901234567e-5 is serialized as `1.2345678901234568E-05`; direct negative zero is `-0.0`. These invalid-for-a-stricter-port direct controls are reference-domain evidence, not recommendations to allow them. JS `toString()` alone is not an exact Json.NET numeric-byte formatter.

After an idle wait wins, the writer sends exactly **four zero bytes**, with no JSON payload. This is a client-to-player keepalive, not a request carrying a sample timestamp. It does not prove a response arrived or refresh a received clock. The source never issues a separate state-poll command. There is no inbound idle timeout or unchanged-position stall detection in this implementation.

There is no remote stop message. The source UI's Stop-shaped icon means disconnect; closing the client is not evidence the remote player paused or stopped.

## 3. Connection, source ownership and disposal

### Source instance

[DeoVR:23–91](../Source/MultiFunPlayer/MediaSource/ViewModels/DeoVRMediaSource.cs#L23) and [AbstractMediaSource:54–124,176–202](../Source/MultiFunPlayer/MediaSource/AbstractMediaSource.cs#L54) establish:

- Default endpoint: `127.0.0.1:23554`. Null endpoint fails. If the endpoint is loopback IP or DNS `localhost` (case-insensitive), enumerate Windows processes and require a process name matching case-insensitive `(deovr|slr)` anywhere. This is a Windows host convenience, not a network handshake or portable OHOS requirement.
- Base connect only starts from `Disconnected`, sets `Connecting`, waits 250 ms for AutoConnect, then calls the source precheck and launches the run task. It does not await connection completion itself.
- A new `TcpClient` is allocated for each run. AutoConnect adds a 500 ms linked cancellation timeout around `ConnectAsync`; manual connect has no explicit source timeout beyond cancellation/platform behavior. The socket extension dispatches IP versus DNS host connection ([Extensions:297–305](../Source/MultiFunPlayer/Common/Extensions.cs#L297)). There is no TLS, authentication, capability exchange, subscription request or additional socket-options step here.
- TCP connect success immediately sets `Connected`, before receiving a valid media packet. Thus original `Connected` does not mean media/resource/clock readiness.
- The run starts reader and writer concurrently, waits for the first to finish, cancels the shared linked token, and rethrows only the completed task's fault via `ThrowIfFaulted`. It does **not** explicitly await `WhenAll` for both tasks. Stream/client `using` cleanup follows. I/O exceptions are debug logged; other run failures show an error dialog; cancellation is ignored. A final `MediaResetMessage` is published unless disposing. Connect failure returns before that final reset block.
- Base `Run` drains the unbounded control channel before running, schedules `DisconnectAsync` in `finally`, then drains again on normal completion. Commands enter the channel only while status is `Connected`; the queue has single-reader/single-writer options, without a size bound.
- Base disconnect returns for already-disconnected/disconnecting, otherwise sets `Disconnecting`, delays 250 ms, then calls guarded cancellation. `OnDisconnectingAsync` uses an interlocked guard, cancels the run token, awaits the stored task, disposes the cancellation source and clears references; finally status becomes `Disconnected`.
- Dispose sets `IsDisposing=true` and synchronously waits on `OnDisconnectingAsync`; it does not transmit a pause/stop command. The source was subscribed to the event aggregator at construction; there is no explicit unsubscribe in this base Dispose body. These are original lifecycle details, not recommended portable race guarantees.

### Host source manager

[MediaSourceViewModel:23–62,114–230](../Source/MultiFunPlayer/UI/Controls/ViewModels/MediaSourceViewModel.cs#L23) owns a single `_currentSource`, independently of the visible/active tab. A semaphore serializes source connect/disconnect operations. When changing connection source it disconnects the current one first; the new one becomes current only on `Connected`. The helper awaits source status becoming either connected or disconnected after starting connect.

The host begins scanning after view load and an initial default `ScanDelay=2500 ms`; only shown `Items` with `AutoConnectEnabled` are attempted. It scans in item order while no current source exists, waits for the current source's disconnect, then uses default `ScanInterval=5000 ms`, also consuming a semaphore used to nudge scan timing. This scan is host policy, not DeoVR wire polling. Hiding a currently connected source first disconnects it; selecting another visible tab alone is not a network source switch. Dispose cancels host scanning, waits it, disposes the current source and semaphore/token objects ([host:233–254](../Source/MultiFunPlayer/UI/Controls/ViewModels/MediaSourceViewModel.cs#L233)).

For OHOS, source generation retirement before await, bounded command queues, stale-callback rejection, early-byte buffering, background teardown, uncertain-close quarantine and explicit reconnect intent are new safety/ownership obligations. Original async structure does not prove them. Saving an auto-connect flag without a working host scan is not original auto-connect parity; auto-connect is also not physical-output Arm permission.

## 4. Path, title, resource identity and script search

### Resource building

DeoVR publishes the incoming path verbatim with `ReloadScripts=true`, `Context=null` ([Messages:16–21](../Source/MultiFunPlayer/Common/Messages.cs#L16)). It never reads a separate title. [ScriptViewModel:535–574](../Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs#L535) builds a resource after applying the ordered configured path modifiers and context. [MediaResourceInfoBuilder:11–88](../Source/MultiFunPlayer/MediaSource/MediaResource/MediaResourceInfoBuilder.cs#L11) then:

- Uses modified path if a modifier returned a different reference; otherwise original path. A null effective path yields no resource.
- Tries absolute URI first. File URI uses `uri.LocalPath` and the file-path parser. A non-file URI uses `Path.GetFileName(uri.LocalPath)` as `Name`. Empty filename returns no resource. This uses a decoded URI local path, not the raw last URL segment or a `filename` query value.
- URL `Source` is `scheme://host` plus `:port` when port is not 80, plus the preceding local-path directory trimmed of ending slashes/backslashes. Thus normal HTTPS includes `:443`, while HTTP :80 is omitted. User-info, query and fragment are not in Source/Name, although the original path still retains them.
- File-path parsing extracts a filename with `System.IO.Path`, requires `path.EndsWith(name)`, and for a relative path makes it absolute only if the corresponding file exists under the original application's current working directory. Source is the prefix before the filename, trimming a directory-ending separator except at a filesystem root.
- Resource equality compares **Source and Name ordinal only** ([MediaResourceInfo:9–17](../Source/MultiFunPlayer/MediaSource/MediaResource/MediaResourceInfo.cs#L9)); it ignores original/modified path, path type and Context. A raw path change may consequently produce a source event but not a resource change. A URL query-only change is a demonstrated example.

The two modifier implementations are [Decode:11–38](../Source/MultiFunPlayer/MediaSource/MediaResource/Modifier/ViewModels/DecodeMediaPathModifier.cs#L11) and [Find/Replace:11–37](../Source/MultiFunPlayer/MediaSource/MediaResource/Modifier/ViewModels/FindReplaceMediaPathModifier.cs#L11). Decode defaults to `Uri.UnescapeDataString`, with HTML decode and URL decode options; failures return the old string. Find/Replace defaults to empty find/replace, case-sensitive literal replacement, optional regex; failures also return the old string. Modifier ordering matters. The URL-to-file UI action adds an exact Find/Replace modifier after an explicit local file-picker selection, then reprocesses the current original path ([ScriptViewModel:1362–1394](../Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs#L1362)).

### Executed resource vectors and OS limitation

| Input | Source-executed Linux result |
| --- | --- |
| `https://example.test/folder/movie%20one.mp4?x#y` | Name `movie one.mp4`, Source `https://example.test:443/folder` |
| Same host/path with changed query | Equal resource despite different OriginalPath |
| `http://example.test:80/movie.mp4` | Name `movie.mp4`, Source `http://example.test` |
| `https://example.test/folder/segment%2Fmovie.mp4` | Name `movie.mp4`, Source `https://example.test:443/folder/segment` |
| `https://example.test/folder/segment%5Cmovie.mp4` | Linux Name `segment\movie.mp4`; backslash is not a Linux Path separator |
| URL ending `/folder/` | No resource |
| Relative `movie.mp4?literal-query` | File Name retains the literal `?literal-query` |

The fixtures also record drive paths, UNC paths and file URIs. Their **Linux output must not be used as Windows basename truth**: for example `C:\Videos\movie one.mp4` remains the entire Linux `Name`, because the URI file route produces backslashes and Linux Path does not split them. The original WPF application's Windows `System.IO.Path` treats both separators as path separators. The latter is a platform/API inference; no Windows process was executed here. A portable implementation needs explicit Windows/UNC/file-URI handling and platform-independent tests, not the false assumption that executing unchanged C# on Linux proves Windows path behavior.

### Resource replacement and retained runtime state

After resource inequality, the original assigns `MediaResource`, optionally resets sync, enables sync bypass, calls `ResetAxes(null)`, conditionally `ReloadAxes(null)`, invalidates media state only if the new resource is null, invalidates all axis indices, then clears sync bypass.

The names of these calls do not imply a complete runtime reset:

- [ResetAxes:868–878](../Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs#L868) calls `SetScript(axis,null)` for all axes.
- [SetScript:886–918](../Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs#L886) first returns if `LockScript && existing Script != null`. Locked non-null script bindings therefore survive media change/reset and reject replacement search results. A locked axis with no existing script can still acquire a script. Unlocked changed bindings invalidate Index, assign Script, publish ScriptChanged, and update links.
- [InvalidateAxisState:736–750](../Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs#L736) only sets each `Index = InvalidIndex` in an update scope. It does not recreate AxisModels, overwrite runtime values or rebuild motion providers.
- [ResetSync:790–819](../Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs#L790) changes SyncTime, with sync-bypass suppression. It does not reset provider phase. Retaining the existing pipeline/provider registry while invalidating its admitted output is consistent with these source operations.
- These are immediate method effects. Subsequent axis update ticks can change values, auto-home state and provider phase according to their existing update rules; this audit does not claim values remain forever frozen.

### Script matching chain

[ReloadAxes:932–952](../Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs#L932) partitions axes by link priority; searches non-priority axes; links unmatched searched axes, applies found resources, then applies priority links. [ScriptRepositoryManager:28–77](../Source/MultiFunPlayer/Script/Repository/ScriptRepositoryManager.cs#L28) orders repositories by DisplayIndex, publishes PreScriptSearch, runs the search asynchronously, calls its callback, then publishes PostScriptSearch. Every enabled repository is searched. Dictionary Merge overwrites an earlier axis entry with a later repository's entry ([Extensions:231–235](../Source/MultiFunPlayer/Common/Extensions.cs#L231)). Repository failures are logged and iteration continues. The callback has the global lifetime token but no per-media generation check in this chain; stale-resource cancellation must be strengthened in OHOS.

[LocalScriptRepository:33–140](../Source/MultiFunPlayer/Script/Repository/ViewModels/LocalScriptRepository.cs#L33) searches by media filename without its final extension:

1. If the media Source is a real local directory, inspect `<media-stem>.zip`, then sorted `<media-stem>.*funscript` files.
2. Do the same for every configured script library, honoring its Recursive option; filesystem results are sorted by full name. ZIP entries with `.funscript` extension case-insensitively are read in archive order.
3. Keep successful script reads. The first multi-axis candidate fills all requested axes using each resource or null; once the result has entries, later multi-axis candidates are ignored.
4. Match single-axis names with each axis's ordered `FunscriptNames`, using [DeviceAxisUtils:60–103](../Source/MultiFunPlayer/Common/Utils/DeviceAxisUtils.cs#L60): strip recognized axis suffix for media-base comparison, use ordinal-ignore-case basename comparison, accept `*` only for an unnamed script, otherwise a matching suffix. First match for an axis wins within the Local repository; single-axis matches do not overwrite existing multi-axis entries.
5. Other enabled repositories include Stash and XBVR. They are independent integrations; implementing a managed local basename search cannot claim those repositories or original arbitrary-directory/ZIP scope.

### Minimal safe OHOS matching hint

The incoming remote resource string is **matching data, never a local read URL or path authorization**. A safe portable hint can derive a bounded final filename without dereferencing any remote or local path: parse recognized URI syntax, remove URL query/fragment through parsing, decode the URI path at most once, handle slash and backslash explicitly, and reject empty/dot/dot-dot/control-character/invalid-escape/oversized results. For non-URI Windows/UNC/local text, split both separators without blindly URI-decoding literal percent signs. Alternatively reject encoded separators and require explicit user selection; that is a documented stricter domain. In all cases search only the current authorized catalog, fail closed on ambiguity or incomplete reads, and retain the original raw resource plus connection/resource generation for replacement ownership. A hint is neither resource-instance identity nor permission to enumerate a Windows share. This paragraph is a safety design recommendation, not an assertion that the retained source applies those restrictions.

## 5. Time, play, rate and seek consumers

The common messages contain values and `MediaPositionChangedMessage.ForceSeek=false` by default, but no source/generation/timestamp/correlation fields ([Messages:16–36](../Source/MultiFunPlayer/Common/Messages.cs#L16)). DeoVR never sets ForceSeek.

- [Playing handler:576–587](../Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs#L576) ignores an unchanged boolean, optionally resets sync, then updates IsPlaying. Sending a Play/Pause command does not optimistically change this observed state.
- [Duration handler:589–599](../Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs#L589) stores seconds when changed, then schedules auto-skip. [Speed:601–608](../Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs#L601) stores changed speed.
- [Position:610–649](../Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs#L610) initializes both displayed/internal position when currently nonfinite. Otherwise compare new time to internal extrapolated time. Absolute error **greater than one second** or ForceSeek is treated as a discontinuity: optionally reset sync, clear AB loop if outside its endpoints by one second, and set both positions. Smaller corrections add `0.33 * error` to internal position. This is a heuristic, not seek acknowledgement.
- [Update thread:120–151](../Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs#L120) extrapolates internal time by local delta × rate while playing and nudges displayed time within 90–110% of that tick progression. It has no received-observation freshness budget or server-latency measure. Loop checking runs at 10 Hz ([521–531](../Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs#L521)).
- [InvalidateMediaState:1018–1028](../Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs#L1018) sets IsPlaying false, resource null, duration NaN, speed 1, displayed/internal position NaN and clears the loop. [Reset handler:651–665](../Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs#L651) returns immediately if MediaResource is already null; otherwise resets scripts/sync/index through the mechanisms above.
- [Seek helpers:1038–1052](../Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs#L1038) require finite duration and requested time/percent. Percent is clamped 0..1; time is clamped 0..duration. They publish a command only, without marking it complete.
- [Auto-skip:1054–1092](../Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs#L1054) defaults enabled, offset -5 seconds, waits 1,000 ms after scheduling and seeks before the first available script start if currently before target. It has no resource-generation ownership beyond the global cancellation token. AB start/end setters can immediately seek when the resulting segment is valid ([1094–1128](../Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs#L1094)).
- [Rate action callbacks:1428–1440](../Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs#L1428) snap within `<0.01` of 1 to 1, then `Math.Max(0.01, speed)`. There is no original upper rate cap in these callbacks. This differs from any bounded OHOS rate policy and from native backend rate capabilities.

Consequently local receive time can establish only receipt age. A packet without valid currentTime, an outbound keepalive, a repaint and a reread of old state cannot freshen a clock. Same-path reloads cannot be perfectly distinguished by the retained fields. The port must explicitly define finite-field completeness, stall/freshness policy, discontinuity thresholds, raw-resource generation and uncertain-command behavior without pretending the original provides stronger evidence.

## 6. Complete DeoVR WPF surface, properties, actions and persistence

### Source-specific and shared source UI

[DeoVRMediaSource.xaml:13–89](../Source/MultiFunPlayer/MediaSource/Views/DeoVRMediaSource.xaml#L13) has:

- Shared `ContentVisible` expander binding.
- Connect/disconnect button calling parent `ToggleConnectAsync(this source)`, disabled only while Connecting/Disconnecting; busy indicator bound to IsConnectBusy. Tooltip changes Connect/Disconnect, icon Play/Stop; connection transition animates opacity. It is not remote playback Play/Stop.
- Auto-connect toggle bound directly to AutoConnectEnabled.
- Endpoint editor enabled only while `IsDisconnected`, bound two-way to Endpoint.

Status-derived properties in [DeoVR:23–29](../Source/MultiFunPlayer/MediaSource/ViewModels/DeoVRMediaSource.cs#L23) are Status, IsConnected, IsDisconnected, IsConnectBusy, CanToggleConnect, plus Endpoint. `Name="DeoVR"` and AutoConnectEnabled come from the base. PropertyChanged/Fody and actual WPF binding lifetime are not executed by the oracle.

[MediaSourceView.xaml:22–99,131–175](../Source/MultiFunPlayer/UI/Controls/Views/MediaSourceView.xaml#L22) supplies retained/non-reloading tabs for visible sources, name/status labels, source show/hide selector, active tab, and common scan delay/interval numeric editors. Both scan editors display ms, minimum 0, interval 100; changing initial scan delay is described as requiring restart.

[EndPointBox.xaml.cs:15–69](../Source/MultiFunPlayer/UI/Controls/EndPointBox.xaml.cs#L15) exposes host/IP and integer port, a two-way-by-default EndPoint dependency property, and reconstructs IP/DNS endpoints on edits. Invalid host yields null. [EndPointBox.xaml:28–51](../Source/MultiFunPlayer/UI/Controls/EndPointBox.xaml#L28) has separate host and port text fields; it declares no endpoint maximum length. [PortToStringConverter:9–32](../Source/MultiFunPlayer/UI/Converters/PortToStringConverter.cs#L9) displays 0 as empty, extracts a digit run from text and clamps 0..65535. This is not the same parser as the shortcut string route.

### Registered source actions and properties

| Registered concrete name | Owner / behavior |
| --- | --- |
| `DeoVR::Connection::Toggle` | Host:215, serialized ToggleConnectAsync |
| `DeoVR::Connection::Connect` | Host:216–222, connect/set current only if current source differs |
| `DeoVR::Connection::Disconnect` | Host:223–229, disconnect only if DeoVR is current |
| `DeoVR::AutoConnectEnabled::Set` | Base:165, bool assignment |
| `DeoVR::AutoConnectEnabled::Toggle` | Base:166, invert flag |
| `DeoVR::Endpoint::Set` | DeoVR:250–254, parse string with NetUtils; assign if parsed |
| Property `DeoVR::Connection::Status` | Base:173, status getter |
| Property `DeoVR::AutoConnectEnabled` | Base:172, bool getter |
| Property `DeoVR::Endpoint` | DeoVR:261, EndPoint getter |

Endpoint shortcut parsing ([NetUtils:23–50,71–72](../Source/MultiFunPlayer/Common/Utils/NetUtils.cs#L23)) accepts an optional `InterNetwork/`, `InterNetworkV6/` or `Unspecified/` prefix, then greedy host plus final numeric port. With a family prefix it constructs a DnsEndPoint without carrying that parsed family through; otherwise it checks host type and constructs IP/DNS endpoint. `int.Parse` and endpoint constructors can throw on invalid range/overflow; `TryParseEndpoint` does not itself catch them. The endpoint action has **no disconnected-only guard**, unlike the WPF editor. Editing it while connected does not retarget the already-created socket; it changes the property used by a subsequent connection (and can change logging text). OHOS may intentionally retire the current owner on endpoint replacement instead.

### Shared media control UI/actions/properties

The source supplies the common media control message channel rather than a special DeoVR transport UI. [ScriptView.xaml:30–54,204–443](../Source/MultiFunPlayer/UI/Controls/Views/ScriptView.xaml#L30) provides common play/pause, open-media-location, repository and path-modifier dialogs, URL-to-local-file mapping, auto-skip enabled/offset, AB clear/start/end/repeat-chapter, read-only resource filename/source, global offset, seekable heatmap and bookmark/chapter markers. The offset auto-skip UI caps at 0 with 0.1 steps; its shortcut accepts an unconstrained Double. The filename display uses MediaResource.Name, not a wire title. Opening the original location starts a browser/shell or Explorer; it is a distinct explicit action, not something receiving a packet does.

The directly relevant registrations in [ScriptViewModel:1412–1506](../Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs#L1412) are:

- `Media::PlayPause::{Set,Toggle}`; Set only toggles when desired observed state differs.
- `Media::Path::Set`; forwards a path-change command, not a local open.
- `Media::Speed::{Offset,Set}` with the rate coercion above.
- `Media::Position::Time::{Offset,Set}`, `Media::Position::Percent::{Offset,Set}`, `Media::Position::SkipToScriptStart`.
- `Media::Loop::Set::FromMediaPositionOffset`, `Media::Loop::Set`, `Media::Loop::CycleSetStartEnd`, `Media::Loop::{Start,End}::Set`, `Media::Loop::Clear`, `Media::Loop::Set::FromCurrentChapter`, `Media::Loop::{Start,End}::Set::FromMediaPosition`.
- `Media::AutoSkipToScriptStartEnabled::{Set,Toggle}` and `Media::AutoSkipToScriptStartOffset::Set`.
- Existing bookmark/chapter seek and gap-skip routes eventually publish through the same seek helper and must obey the remote seek-disarm policy too; they are not independent acknowledged-seek protocols.

Common media property registrations are `Media::Resource`, `Media::PlayPause`, `Media::Speed`, `Media::ScriptOffset`, `Media::Position`, `Media::Duration`, `Media::Loop::{IsValid,Start,End}`, `Media::AutoSkipToScriptStartEnabled`, `Media::AutoSkipToScriptStartOffset` ([2032–2044](../Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs#L2032)).

### Settings saved and restored

- Under `MediaSource`: ContentVisible, ScanDelay, ScanInterval, visible Items as names and ActiveItem as name; settings for every available source are saved even if hidden ([host:65–112](../Source/MultiFunPlayer/UI/Controls/ViewModels/MediaSourceViewModel.cs#L65)). Name restoration is case-insensitive. Neither connected state nor a running connection is serialized.
- Under `MediaSource.DeoVR`: `AutoConnectEnabled` from base ([149–159](../Source/MultiFunPlayer/MediaSource/AbstractMediaSource.cs#L149)); `Endpoint` as `ToUriString()` from DeoVR ([230–243](../Source/MultiFunPlayer/MediaSource/ViewModels/DeoVRMediaSource.cs#L230)). `ToUriString` is plain `address:port`/`host:port` and does not add IPv6 brackets ([Extensions:366–373](../Source/MultiFunPlayer/Common/Extensions.cs#L366)). [EndPointConverter](../Source/MultiFunPlayer/Settings/Converters/EndPointConverter.cs#L7) restores via NetUtils, not a credential or URI authentication store.
- Shared `Script` settings persist path modifiers, SyncSettings, axis settings, GlobalOffset, content/heatmap preferences and auto-skip settings ([ScriptViewModel:64–78,667–710](../Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs#L64)). Sync defaults: duration 4 seconds and all seven listed sync triggers true ([2410–2420](../Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs#L2410)). Resource, observed timeline and live source socket are runtime state, not these persisted settings.
- Script repository settings live separately under `Script.Repositories`, including enabled flags and Local libraries; they must not be mistaken for automatic authorization to open remote packet paths on OHOS.

Original concrete names for this one source cannot close all twelve-source registration templates by themselves. Feature/action classification must continue to state the other absent adapters, stricter domains and unexecuted platform gates.

## 7. OHOS integration requirements derived from the audit

1. Keep source selection/connection, media readiness, processing enablement, output connection and physical Arm distinct. New source bytes never create Connect/Arm intent.
2. Use a source-owned socket abstraction, bounded incremental parser and command queue. Retire ownership synchronously on disconnect, switch, endpoint replacement, reset, resource replacement, background/dispose and any unresolved close. No stale callback/script read/command may mutate the next owner.
3. Treat source path/state partials as observations of those fields only. Do not make an initial complete physical-output snapshot from defaults or freshen currentTime from a path-only packet. Preserve field validity and receive timing independently.
4. Resource replacement must invalidate output and scripts before async matching; respect Lock semantics without rebuilding motion-provider state. The raw remote string is not a filesystem capability. Catalog reads must use already-authorized concrete local identities.
5. Preserve the actual four remote operations where implemented; report send acceptance separately from observed change. An error or uncertain send must not be replayed blindly.
6. Revoke physical Arm before every remote seek. No original field can justify retaining Arm across it. Automatic loop/skip must either obey this same transition or be disabled with an explicit product limitation.
7. Document purposeful differences: finite-only/strict fields, bounds, UTF-8, idle freshness/stall detection, raw-path generation versus Source+Name equality, safe catalog scope, authenticated/trusted-endpoint policy, endpoint editing lifecycle and explicit connection intent. Do not repair an evidence gap by inventing server guarantees.
8. Verify the reachable OHOS application/session/output path, not only this oracle or a codec. Real OHOS sockets, exact player version/update cadence, background/reconnect, remote control and physical output remain separate gates requiring their own authorization and evidence.

## 8. Reproduction and source hashes

Run `python3 ohos/tools/deovr-original-oracle/run.py` from the repository root. It uses the retained official .NET SDK at sibling `mfp-next-design/dotnet-sdk-9.0.319` (or `DOTNET_ROOT`), invokes Roslyn directly with local reference assemblies and bundled Newtonsoft.Json, creates/removes only temporary compiler files, and rewrites its own fixture JSON. No NuGet restore is needed. The initial MSBuild attempt was blocked by the sandbox's read-only NuGet migration directory; direct Roslyn compilation avoids that unrelated first-run write and passed. Source hashes pin the actual extraction input; literal method bodies are not reimplemented in TypeScript or by a handwritten JSON parser.

Oracle modifications are limited to reader/writer visibility and transport parameter types (`TcpClient` → memory-only client flag; `NetworkStream` → `Stream`); logger/event sink/channel are isolated substitutes. `PlayerState`, `TryToObject`, exact-read helper and the resource-builder files retain source logic. Global primitive-relevant serializer formatting/error handling is reproduced; logging and unrelated global converters are omitted. Source connection/disposal, WPF handlers, repository I/O and the production OHOS path are static audit only.

| Retained file, under `Source/MultiFunPlayer/` | SHA-256 |
| --- | --- |
| MediaSource/ViewModels/DeoVRMediaSource.cs | `33620551b1c8cd5feab95b7fd1d39baa47cef517c078975664d3b846561328d5` |
| MediaSource/AbstractMediaSource.cs | `8acf0d420cd05e40ab72ea3f9acd23bb174995a5cd95ab7073b26157a5d9e858` |
| UI/Controls/ViewModels/MediaSourceViewModel.cs | `872657be0878481174c3cacdceeed219a73b928b64b5aa266a1a1a324f6f8078` |
| UI/Controls/ViewModels/ScriptViewModel.cs | `3104cecc1510ef394a786c04239bafc58d33af4465d2b3c04b0409995c19debe` |
| Common/Extensions.cs | `8c275fe3b490b9b100e697abab88a9644d1f70cfa613d0c80ccd02752577ea02` |
| Common/Messages.cs | `8cfd1227c9253eb0bfd00a05d6811e0652e65d261709394fe6a6044b9ea72b47` |
| Common/IConnectable.cs | `0bd33104206e113d2a94127211d46bd951f1a5cbf19acfc637b452a914b7aa8a` |
| Common/Utils/NetUtils.cs | `27add404f9d05a18ded0b313132e0aa1b16f0aaea4b63e7ce969e6f14b3694c1` |
| Bootstrapper.cs | `5d4e3812b0d8101906c00d25cb7ff5a8319873eaa1e45b33d1632228b0ccc7db` |
| MultiFunPlayer.csproj | `a2620172310b16e6979566dc831da976187a1814cd625038faab7a67a94068c9` |
| MediaSource/MediaResource/MediaResourceInfoBuilder.cs | `bea1a8ef4d25fddf96c554f40a64d2df77fced59029cc29cf7351b0450c464e4` |
| MediaSource/MediaResource/MediaResourceInfo.cs | `443b2feac2b58e66eaa61dc54c3ef01606711b2348635b58fc82e84eab7c12bd` |
| MediaSource/MediaResource/Modifier/IMediaPathModifier.cs | `aeb36ff29841a09cadc25e195c629b650666f90607c510f790b154a9509c0c0c` |
| MediaSource/MediaResource/Modifier/ViewModels/DecodeMediaPathModifier.cs | `4149a21b4b42881ba5d8bc2228d3b06ef818d43f6df595617ececc64798014f5` |
| MediaSource/MediaResource/Modifier/ViewModels/FindReplaceMediaPathModifier.cs | `e6c32dce27e900a4c757727d0e1543dfc0bc53718924809381b8d295e6ecddc6` |
| Script/Repository/ScriptRepositoryManager.cs | `1889cf51fbbb6ad97b30a4e51bf5c31425fc46bf255f3be8fc9a0e30a7b4c140` |
| Script/Repository/ViewModels/LocalScriptRepository.cs | `6031808362e33046ace4598e40183924728ead16032d39798eff1ed7342015df` |
| Common/Utils/DeviceAxisUtils.cs | `00a689ddaf204b23a43193dfa4c55fb65ce12839cebdfffc4506daac7002f0da` |
| MediaSource/Views/DeoVRMediaSource.xaml | `3af40453d0283ed6ff77ea4a6459983c7423d2207691bce4cbbeb6c2274f527f` |
| UI/Controls/Views/MediaSourceView.xaml | `8aac4f370029cd3d0e0ea81fe3ae1256d54fae105cb845437fe636b9a17a0975` |
| UI/Controls/Views/ScriptView.xaml | `f42527b6cef4181e2935974f2a275d5eef0d06b976435a6cfd2afb88ebb86336` |
| UI/Controls/EndPointBox.xaml | `a8b77b1551af8aaea4cb7c43f6cc097b327b0b566d6b0e52685b8539edbdead8` |
| UI/Controls/EndPointBox.xaml.cs | `1bb00a819c2e502d0197c7f1ba134d3eba5ee034596642ba16291eef2dfc1065` |
| UI/Converters/PortToStringConverter.cs | `daf92d4b459a24c32d246479e3005b6f20710e5576bbb7af547f88cd0f205e8c` |
| Settings/Converters/EndPointConverter.cs | `988293442b84e9983b89baba49f3e22e9839f2d9af9ea3361db2c22f030c7fd7` |

This ledger is provenance for the examined original chain, not a claim of whole-application semantic equivalence. The stricter source/session safety contract and remaining platform/device gates must remain visible in the 0.18 integration report.
