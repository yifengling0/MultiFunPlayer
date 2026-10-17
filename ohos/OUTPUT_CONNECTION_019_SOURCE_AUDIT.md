# Output connection/action source audit for a possible 0.19 stage

Audit snapshot: **2026-10-16T22:36:22Z**. Retained original: `36c08fbb99ac9398a63ff1cca1bbf68cd2228a94`. Baseline: [ACTION_COVERAGE_018.md](ACTION_COVERAGE_018.md), its [source ledger](tools/reference/action-coverage-018-source.json), and the historical [remaining dependency inventory](REMAINING_ORIGINAL_DEPENDENCIES_017.md).

**Recommendation: implement at most six of the remaining thirteen registration sites in the existing owned network stack: 72, 75, 76, 80, 81 and 82. All six remain partial. Leave 55, 56, 69, 70, 71, 73 and 74 unwired.** This is an implementation contract/source audit, not a declaration that any new shortcut is wired. No production/shared tests/existing documents/Git state were changed; no File recording, DNS/network endpoint, player, account or device was exercised. The other ongoing 0.19 work can change runtime files and invalidate this snapshot.

Companion [read-only auditor](tools/reference/output-connection-019/audit.py) and [evidence snapshot](tools/reference/output-connection-019/source.json) retain all thirteen exact registration/callback records, raw hashes of thirty original and fifteen runtime sources, and the selected baseline execution. The original registration bytes and hashes were independently rechecked, rather than trusting the displayed callback names.

## 1. Exact thirteen-site inventory and counting

Every identifier below is an instance-bound original name. `Identifier = $"{Name}/{InstanceIndex}"`; `Name` is the target type's DisplayName, not a user nickname. For index zero the original prefixes are `TCP/0`, `UDP/0`, `WebSocket/0`, `Buttplug.io/0`, `Serial/0`, `Pipe/0`, `The Handy/0`, `File/0`. Common registrations apply to all eight classes through inheritance and the output host. They are counted once per original source call site, not once per target, supported protocol, UI row, or index.

| Original site | Exact name expression / types | Setter or dependent route | Recommended stage |
|---|---|---|---|
| 55 | `$"{Identifier}::AutoConnectEnabled::Set"`; `bool enabled` | `AutoConnectEnabled = enabled` | Unwired: operational scheduler absent |
| 56 | `$"{Identifier}::AutoConnectEnabled::Toggle"`; no args | `AutoConnectEnabled = !AutoConnectEnabled` | Unwired: same scheduler |
| 69 | `$"{Identifier}::Endpoint::Set"`; `string endpointString` | Buttplug: `NetUtils.TryParseEndpoint` then `Endpoint = endpoint` | Unwired: Buttplug protocol/discovery absent |
| 70 | `$"{Identifier}::PipeName::Set"`; `string pipeName` | `PipeName = pipeName` | Unwired: local named-pipe owner absent |
| 71 | `$"{Identifier}::SerialPort::Set"`; `string` Device ID | Method group `SelectSerialPortByDeviceId` | Unwired: enumeration/serial owner absent |
| 72 | `$"{Identifier}::Endpoint::Set"`; `string endpointString` | TCP: `NetUtils.TryParseEndpoint` then `Endpoint = endpoint` | Candidate partial |
| 73 | `$"{Identifier}::ConnectionKey::Set"`; `string connectionKey` | `ConnectionKey = connectionKey` | Unwired: authenticated Handy owner absent |
| 74 | `$"{Identifier}::SourceAxis::Set"`; `DeviceAxis axis` | `SourceAxis = axis`, Fody change callback and polled owner | Unwired: Handy source-axis lifecycle absent |
| 75 | `$"{Identifier}::Endpoint::Set"`; `string endpointString` | UDP: `NetUtils.TryParseEndpoint` then `Endpoint = endpoint` | Candidate partial |
| 76 | `$"{Identifier}::Uri::Set"`; `string uriString` | `Uri.TryCreate(uriString, UriKind.Absolute, out var uri)` then `Uri = uri` | Candidate partial |
| 80 | `$"{target.Identifier}::Connection::Toggle"`; no args | `async () => await ToggleConnectAsync(target)` | Candidate partial, three network classes only |
| 81 | `$"{target.Identifier}::Connection::Connect"`; no args | Per-target semaphore, connect only when Disconnected, `ConnectionType.Manual` | Candidate partial, three network classes only |
| 82 | `$"{target.Identifier}::Connection::Disconnect"`; no args | Per-target semaphore, disconnect only when Connected | Candidate partial, three network classes only |

Source locations: `OutputTarget/AbstractOutputTarget.cs:255–256`; `ViewModels/ButtplugOutputTarget.cs:409–413`, `PipeOutputTarget.cs:158`, `SerialOutputTarget.cs:319`, `TcpOutputTarget.cs:181–185`, `TheHandyOutputTarget.cs:202,206`, `UdpOutputTarget.cs:180–184`, `WebSocketOutputTarget.cs:186–190`; `UI/Controls/ViewModels/OutputTargetViewModel.cs:212–226`, all under `Source/MultiFunPlayer`.

String builders default to null, with labels Endpoint, Pipe name, Device ID, Connection key or Uri and descriptions `ipOrHost:port` / `websocket uri`; there is no original string length limit. Site 55 defaults false. Site 74 uses `WithItemsSource(DeviceAxis.All)` and defaults null. Unlike the range helper's null-axis no-op, Handy's callback directly assigns null. There are no numeric arguments or trigger-supplied gesture types in these thirteen sites. There is no target-selector argument in the original callback: its closure already owns one object. See `Shortcut/IShortcutSettingBuilder.cs:38–42` and the exact builder records in the companion JSON.

`OutputTargetViewModel.AddItem(Type)` finds the smallest unused nonnegative index for that type; the factory permits indices 0–9 except Buttplug, which permits only 0. Add registers target actions and then the three host connection actions. Remove waits for the captured target to become idle/disconnected, unregisters all actions/properties, then disposes it (`OutputTargetViewModel.cs:43–98,206–239`; `OutputTarget/IOutputTargetFactory.cs:14–36`). A removed identifier may later be reused. Saved IDs alone therefore cannot protect queued work from a replacement instance.

Suggested normalized portable aliases, if one alias per original site is desired:

- `OutputTarget::TCP::Endpoint::Set` → 72
- `OutputTarget::UDP::Endpoint::Set` → 75
- `OutputTarget::WebSocket::Uri::Set` → 76
- `OutputTarget::Connection::{Toggle,Connect,Disconnect}` → 80–82

These proposed names are not installed by this audit. Each requires a nonempty existing `outputTargetId`, with runtime generation captured on dispatch; kind-specific aliases reject a different target kind. This yields six new aliases, not literal original instance names. If all six pass, and no other actions change, the accounting would be **178 IDs = 160 original concrete names + 14 aliases + 4 extensions**, mapping **153/188 sites**, with **110 full-portable, 43 partial, 35 unwired**. This is conditional arithmetic only. A generic Endpoint alias serving TCP and UDP needs an explicitly many-to-one ledger; never count it as two unique IDs. Neither choice earns Buttplug's visually identical Endpoint row.

## 2. Complete original connection route

The chain is registered closure → `OutputTargetViewModel` per-object semaphore → target `ConnectAsync(Manual)` / `DisconnectAsync()` → actual thread/async backend → status wait. The UI's selected output tab is not consulted by that closure.

`ToggleConnectAsync` does nothing for null, then acquires `_semaphores[target]`; Connected disconnects, Disconnected connects, Connecting/Disconnecting do nothing. Explicit Connect/Disconnect use the same two state predicates. The helper releases `_scanIntervalSemaphore` on either transition and waits for `WaitForIdle` or `WaitForDisconnect`. Those extension methods wait for `{Connected,Disconnected}` or `{Disconnected}` respectively (`Common/Extensions.cs:18–24`). The original callbacks release their semaphore after the await without a finally; do not copy that cancellation/exception hazard into the portable implementation.

`AbstractOutputTarget.ConnectAsync` accepts only Disconnected, sets Connecting, optionally delays for AutoConnect, runs `OnConnectingAsync`, then starts the backend. `DisconnectAsync` changes to Disconnecting, delays 250 ms, awaits backend shutdown and then marks Disconnected (`AbstractOutputTarget.cs:57–119`). Thread targets cancel their source and join their thread; async targets cancel and await their task. Their completion invokes DisconnectAsync (`:384–439,522–575`). `WaitForStatus` observes PropertyChanged and channels; Windows/Fody/dispatcher timing remains a separate unexecuted dependency.

TCP and UDP validate non-null Endpoint; WebSocket validates non-null Uri. Their established clients are local variables, and writes use those clients. They publish a SyncRequestMessage after connecting and begin fixed/polled loops; original connection is not split from a separate Arm gate. Portable connection must continue to require a later explicit Arm and current source evidence. This deliberate safety boundary alone prevents unrestricted original runtime equivalence.

- TCP `Run`: manual `TcpClient.Connect(Endpoint)`; auto BeginConnect with a 500 ms wait; then stream fixed/polled TCode (`TcpOutputTarget.cs:37–156`).
- UDP `Run`: Windows socket IOControl, `UdpClient.Connect(Endpoint)`, fixed/polled datagrams and incoming TCode parsing (`UdpOutputTarget.cs:39–154`). Portable UDP readiness means a local bound transport, not peer existence or device execution. Portable received bytes are deliberately not interpreted as controls (`OutputSession.ts:556–561`). This missing reverse-input route stays explicit.
- WebSocket `RunAsync`: `ClientWebSocket.ConnectAsync(Uri)`, auto timeout 500 ms, paired read/write tasks and CloseOutput (`WebSocketOutputTarget.cs:36–160`). Ordinary outgoing TCode is Text. No original arbitrary WebSocket URI can be assumed safe in the current stricter adapter.

## 3. Endpoint and Uri semantics, including live bindings

### Original command and parser

TCP/UDP/Buttplug expose plain auto-properties. A successful shortcut parse assigns the property regardless of connection state; it does not close, reconnect, reset dirty values, change ranges, or ask for a source sync. WebSocket's setter has the same property-only behavior. An already-connected TCP/UDP socket or WebSocket object retains the destination used at connection. Later log messages read the new property, so displayed/logged text can differ from the live destination. Edits racing the backend's initial endpoint read are not atomically isolated in the original. The next explicit/automatic connection reads the newly assigned property.

`Common/Utils/NetUtils.cs:23–50,71–72` parses the whole `[(InterNetwork|InterNetworkV6|Unspecified)/]host:digits` expression. It uses greedy host text and Int32.Parse for port. With a family prefix, it immediately constructs **DnsEndPoint without forwarding that named family and without normal host-type checking**. Without a prefix it uses `Uri.CheckHostName`, IPAddress.TryParse or DnsEndPoint. Ordinary invalid formats may return null, but overflow and out-of-range constructors can throw: `TryParseEndpoint` does not catch exceptions. Port zero is admitted by the .NET endpoint types. No DNS lookup occurs during parsing. Do not infer strict parsing merely from the method's Try name.

`Uri.TryCreate(...Absolute...)` admits more than ws/wss: absolute non-WebSocket schemes, user-info, query/fragment and Uri normalization are possible; transport rejection occurs later. The original WebSocket default is `ws://127.0.0.1/ws` with implicit port, while TCP defaults to loopback:8080 and UDP to tcode.local:8000. Current saved network targets instead start with empty host/zero port, which intentionally never implies a connection.

### WPF binding route

The TCP/UDP/Buttplug `EndPointBox` and WebSocket `UriBox` sit inside `IsEnabled="{Binding IsDisconnected}"` containers. Buttons bind ToggleConnectAsync and CanToggleConnect; auto-connect toggles bind AutoConnectEnabled. Thus a disabled original endpoint editor does **not** mean the corresponding shortcut rejects live edits.

`EndPointBox.xaml.cs` registers a two-way-by-default EndPoint dependency property. Source changes transfer IP/DNS host and port to two text fields; Fody calls UpdateEndPoint after host/port changes. UpdateEndPoint uses Uri.CheckHostName and constructs a fresh endpoint or null. The port converter accepts the first digit run and clamps 0–65535 (`PortToStringConverter.cs`), a distinct route from shortcut Int32.Parse. Initial binding transfers, possible intermediate property updates and reentrancy are not executed in Node.

`UriBox.xaml.cs` likewise has a two-way-by-default Uri property. GuardUpdate prevents recursive updates; available schemes are set by `Schemes="ws wss"` in the WebSocket view. UpdateUri requires scheme/host and port 1–65535, ensures a leading slash, and constructs an absolute Uri from its fields. UpdateFromUri copies host, port, PathAndQuery and an allowed scheme. The UI's scheme list does not constrain the registered shortcut's Uri.TryCreate call. Hidden/retained controls, Fody notifications and initial WPF control order are not reproduced here.

### Recommended bounded portable policy

A complete endpoint action can be implemented now without adding another transport. It must choose and disclose one live policy. **Recommended narrow policy: validate a candidate completely, then synchronously disarm/invalidate only its exact owner, save the inert endpoint draft, and retain an already-established old socket until explicit Disconnect or application of the new draft.** This matches the original destination-retention behavior while deliberately revoking physical output authorization. Existing ordinary OutputSettingsPanel edits use this pattern: changed() clears applicationId, calls onDisarm (which also cancels a pending connect), increments editRevision and emits the draft (`OutputSettingsPanel.ets:108–110`).

Alternatively, a stricter contract may explicitly disconnect and require close confirmation before committing a changed endpoint. That is safe if correctly fenced but is a documented semantic difference from the original, including persistence on failed close. Do not silently implement auto-reconnect or call the generic Connect/Apply UI method from Endpoint::Set. Rejecting all connected endpoint changes is another narrower partial contract, not original parity.

For the recommended draft-only policy:

1. Resolve explicit ID plus captured generation and exact kind; reject missing, retired, reused, background, stale profile or unavailable owner. Never fall back to selected target, create a target, or broadcast.
2. Parse raw text and validate a detached complete candidate before any mutation. TCP/UDP admit bounded raw DNS/IPv4/IPv6 and 1–65535; derive IPv6 family from the validated host or explicitly document any retained DNS-family setting. Retain unrelated endpoint fields (including UDP localPort) and all range/protocol/pause permissions. Family-prefix acceptance must not bypass host validation.
3. WebSocket admits only ws/wss, bounded host, explicit or deliberately normalized default port, and the current credential-free path subset. Reject user-info, credentials, query, fragment, encoded escape tricks, unsupported schemes and authentication-bearing path segments before persisting. Do not infer authorization to save any secret from a text action. Use full OutputConfiguration validation, not the lower-level adapter's looser character regex alone.
4. An equal canonical endpoint should succeed inertly without disconnect/reconnect/re-Arm, range change or dirty-cache clearing. A changed endpoint clears draft applicationId, increments editRevision, calls the exact coordinator's disarm, and persists only validated data. The old connection remains unarmed; no stale draft is allowed to recover its application identity.
5. Disarm cancels a currently pending owner connect via connectRequest. Late opening is closed with its own transport generation. If a close fails, the quarantined owner remains reserved. Storing a new inert draft must not delete that tombstone, claim closure, or enable replacement; later Connect still must pass the existing close-confirmed barrier.
6. Check the persisted result: NativeOutputSession.saveDraft returns true even when it retained only an invalid volatile edit and set a diagnostic. Validate first and verify expected draft/settings revision and persistence diagnostic. A true return alone is not proof the endpoint was saved. Existing persistOutputPreferences failure disarms outputs; do not report successful persistence after that failure.

## 4. Current ownership stack and required integration deltas

The relevant runtime source is in `ohos/entry/src/main/ets`:

- `NativeOutputSession.restore` constructs inert collection entries only; selectedTargetId and endpoints grant no authority. draftFrom issues a process-local targetGeneration; successful remove/re-add obtains a new generation. matchesTarget, canConnect, exact config/endpoint comparison, draft profile/edit revisions and applicationId already supply the required checks (`app/NativeOutputSession.ets:56–133,184–239`).
- `OutputTargetCollection.connect` routes by config.targetId, captures its entry token, and checks entry identity and actual final connected status. Removal reserves a retired entry until disconnect plus dispose plus closeConfirmed succeed. Selection is only a UI facade. **Its zero-argument disconnect() acts on selected target and must not be used by a target-bound shortcut** (`output/OutputTargetCollection.ts:73–87,109–151`).
- `OutputCoordinator.connect` retires an existing session, requires confirmed close and successful native admission release, and only then creates a replacement; request cancellation is checked after awaits. It is an **apply/replacement operation**, not idempotent original Connect. Guard already-connected at the action layer before calling it (`OutputCoordinator.ts:93–146`).
- disarm/stop cancel pending connect; foreground false, disconnect and dispose also invalidate request and ownership. These do not authorize a replacement. `OutputSession.closeConnection` clears the gate before cleanup, retains pending-open/flight identities, and exposes closeConfirmed only after actual retained ownership is released (`OutputSession.ts:124–151,515–553`).
- NativeTransportFactory creates only TCP/UDP/WebSocket and registers real port identity. The native adapter registry is not equivalent to an arbitrary `native=true` property. NativeTransportBase retains failed/timed-out close generations permanently in quarantine and handles late open cleanup. Do not free that identity or replace it to make a shortcut retry appear to work.
- Index.applyOutputConfiguration binds successful connection to target, generation, profile and exact editRevision before assigning applicationId. Use that application-owner route with an action lease, not direct socket construction. Index.disconnectOutput accepts explicit ID/generation and closes only that coordinator, but also revokes shared manual preview; terminal manual-preview safety can stop every manual target. Do not falsely promise complete isolation of the shared manual-preview authorization while preserving independent media target ownership.

### Connection action state contract

- Connect: current healthy connected owner is an inert success, including when already armed; do not replace it or restore applicationId for unapplied endpoint edits. Disconnected clean owner applies the current validated draft and connects, never Arms. Busy/connecting/removing/unconfirmed-close/fault state is not healthy Disconnected; either reject with an honest diagnostic or use an explicitly defined safe fault-recovery route. Do not turn a close fault into an automatic replacement.
- Disconnect: clean disconnected owner is an inert success. Connected owner synchronously loses sending permission before awaiting exact closure. A deliberate safety extension can also cancel a pending connection or retry unconfirmed close; label those differences from the original Connected-only callback. After await, inspect closeConfirmed/fault state before saying disconnected/closed, because the session records some close errors instead of rejecting the promise.
- Toggle: use actual target state, not selected target, cached UI label, draft.applicationId, or whether it is armed. Connected disconnects; clean disconnected connects. Original transition states no-op; do not interpret every non-connected state as permission to connect.
- No connection action may create source playback, a manual preview, an output Arm, or a saved auto-connect policy. On fresh connection, zero payloads until explicit Arm plus a new admitted frame/event. UDP or local write completion never claims remote acknowledgement.

### Shortcut cancellation is a real missing integration piece

Index.runShortcutDispatch already captures target generations per dispatch; performShortcutDispatch validates token, foreground/view, settings and profile. However, the existing broad `if (spec.targetOutput)` branch assumes every target action is a range action requiring an axis; new connection/endpoint actions must be distinguished before entering that branch. Reuse strict clone/argument validation and both touch/keyboard editors rather than exposing strings only.

`retireShortcutWorker()` currently cancels managed reload and queue bookkeeping, with no active output-connect lease. Merely checking dispatch validity after await is insufficient: a cancelled shortcut can still finish opening its socket. Add a bounded operation identity containing dispatch/token + captured target object/generation + expected draft/profile revisions + connect request identity. Cancellation must invalidate or close only the request it owns, synchronously before waiting. Delayed cancellation cleanup must not disconnect a newer manual/UI connection on the same retained coordinator. A per-target serialized request owner or request-scoped coordinator cancellation API is safer than calling a generic disconnect from a stale finally block. Stop, focus/IME/capture cancellation, mapping edit, profile change, foreground loss, page disposal, endpoint edit and target removal need explicit tests. A live target selection change alone is not cancellation and must not retarget the operation.

## 5. Why seven sites stay unwired

- **55–56 AutoConnect:** original flags default false, persist, and are consumed by ScanAsync after view load (default initial delay 2500 ms, interval 5000 ms). The scan acquires each target semaphore and calls AutoConnect when not Connected; explicit transitions wake the scan interval. Manual Disconnect does not clear AutoConnectEnabled and can be followed by reconnect. Original restore can resume this behavior. Current OutputSettingsModel emits only manual; automaticRequested is diagnostic-only and never schedules. Under the required inert restore policy, a future scheduler needs fresh explicit runtime opt-in, bounded retry/backoff, foreground/draft/generation ownership, shutdown and close quarantine; no saved flag can confer connection or Arm. Do not add preference-only placeholders to claim these rows.
- **69 Buttplug:** Endpoint feeds a ButtplugClient with its JSON converter, events for DeviceAdded/Removed, per-device actuators/settings, orphan-device StopAsync, and StartScanning/StopScanning lifecycle (initial scan and bounded 30-second scan). A TCode WebSocket client is a different protocol. Endpoint text alone cannot implement the action's dependent target.
- **70 Pipe:** PipeName feeds NamedPipeClientStream(".", PipeName, Out), then fixed/polled writes. Existing TCP is not a local named pipe or an authorized new bridge. Changing the property while connected does not reopen the original stream.
- **71 Serial:** argument is an exact ordinal device ID. SelectSerialPortByDeviceId chooses the first current discovered entry; if absent it retains the requested DeviceId for later refresh. Fody's OnSelectedSerialPortChanged updates the saved ID for actual selection. OnConnecting refreshes missing selection via Windows WMI Win32_PnPEntity, then opens System.IO.Ports.SerialPort with baud/parity/stop/data/handshake/DTR/RTS/buffer/timeouts. The editor is disconnected-only, but the shortcut method has no such guard. Current network targets supply none of this discovery/permission/native serial ownership.
- **73–74 Handy:** ConnectionKey becomes X-Connection-Key on an HTTP client, with original protected-string persistence; connection checks connected/firmware, changes device mode, performs 30 timing probes, then sends polled HDSP requests. SourceAxis has a Fody OnSourceAxisChanged callback that publishes a sync request when connected/non-null. The polled waiter captures its initial axis while callback code also reads current SourceAxis, so a live shortcut axis change is more than a generic range edit and needs dedicated analysis. The UI disables both controls while connected; shortcut callbacks can still mutate them. Secure key storage, authenticated API, device-mode changes and timing/axis ownership are absent and out of scope. No current vendor API compatibility is asserted.

File inherits common actions too, although its view lacks an AutoConnect toggle and Run returns immediately for AutoConnect. Manual File connection opens actual script writers. Existing separate recording support is not evidence for these original instance shortcut aliases, and this audit performs no recording work.

## 6. Executable evidence and oracle options

Executed **199/199 selected existing Node tests**, zero failures/skips, Node 24.19.0. Command, selected source/test input hashes and captured output hash are in the companion JSON; this is not a complete transitive-import lockfile. The thirty original files, fifteen named runtime files and five test files were unchanged over the recorded run.

```
python3 ohos/tools/reference/output-connection-019/audit.py --run-baseline
node --test ohos/tests/output-target-collection.test.mjs \
  ohos/tests/output-coordinator.test.mjs ohos/tests/multi-output-intent.test.mjs \
  ohos/tests/multi-output-lifecycle.test.mjs ohos/tests/output-native-network.test.mjs
```

This executes real collection/coordinator/session and extracted application/native-adapter code with memory transports and SDK mocks. It proves useful existing ownership infrastructure, not a new action route or a hardware/network pass. The source verifier rechecks the thirteen exact registrations against the immutable 0.18 ledger and records complete source SHA-256. It changes no production source.

Before implementing, available independent original-oracle options are:

1. **Original action/delegate host:** extract entire TCP/UDP/WebSocket RegisterActions methods, the abstract RegisterActions, and the host RegisterActions/ToggleConnectAsync/ConnectAsync/DisconnectAsync methods unchanged. Compile with the existing official .NET 9 SDK and typed inert shortcut builders plus fake IOutputTarget state owners. Capture original Func<ValueTask> overloads rather than turning async callbacks into async-void. Exercise all four original statuses, three operations, two targets, duplicate invocation, semaphore ordering, cancellation and removed/reused identity. Clearly label fake target IO/status/notification boundaries.
2. **Original parser oracle:** compile exact NetUtils ParseEndpoint/TryParseEndpoint and its generated regex using the installed official regex generator; execute actual Uri.TryCreate. Cover null/empty, IPv4/DNS/IPv6/brackets, all family prefixes, port 0/65535/65536/Int32 overflow, malformed numeric text, URLs/credentials/zones/trailing-dot DNS, ws/wss default ports/path/query/fragment/escape normalization, and absolute unsupported schemes. Compare only the declared portable subset; preserve expected refusals and original throws. This needs no network, package restore or endpoint access.
3. **Original binding evidence:** retain exact control/XAML/property/Fody call chain. A shim cannot certify actual WPF transfer/reentrancy. Windows control tests would be a separate gate, not something to infer from .NET callback success.
4. **Portable end-to-end action fixture:** reuse the current actual Index/NativeOutputSession extraction and fake native environment to invoke every new alias via touch and keyboard. Assert argument budgets and kind checks, original-source count mapping, persistence/reload inertness, target generation capture and failed-close retention. Neither a static catalog test nor a direct model call is enough.

Minimum new behavior matrix:

| Area | Required observations |
|---|---|
| Identity | Explicit existing target, unknown/empty ID, wrong kind, removal/re-add of same ID, queued operation versus selection change; no fallback/broadcast |
| Arguments | No-arg actions reject text/axis/numbers/points; endpoint actions require only their bounded text plus ID; unknown DTO fields and forged runtime authority refused |
| Endpoint edits | Disconnected, connected-unarmed, connected-armed, pending open, failed close, same-value inert edit, invalid candidate atomic refusal, stale edit/profile, unrelated ranges/permissions unchanged |
| Connection | Connect repeat inert; both Toggle directions; disconnected Disconnect inert; busy/fault/unconfirmed-close states honest; successful connect never Arm/send |
| Cancellation | Deferred native open/close/resolve, Stop, focus/IME/capture, map/profile/endpoint edits, background-return, page disposal; old completion cannot mutate/reopen/disconnect a new request |
| Persistence | Settings save failure never reports saved; restored target selection/endpoints create no socket; no runtime generation/applicationId/Arm/auto-connect authority in saved DTO |
| Quarantine | Close reject/timeout, late open after close, native registry release refusal, duplicate remove; no new socket/reused-ID replacement until exact owner is safely retired |
| Output | Other target ownership/ranges remain independent; shared manual-preview revocation tested explicitly; prior queued writes cannot resume; fresh Arm and source admission required |

No fresh .NET oracle, full aggregate, SDK/HAP build, WPF/Fody runtime, device screen/input, live socket, File recording or physical motion pass is claimed by this audit. The existing `.NET output-range` or unrelated source oracle does not certify these six new action registrations. Implementation and final coverage promotion require their own frozen-source evidence.

## Implemented candidate addendum (0.19)

The six recommended sites now have actual Index/target-owner routes and remain partial. The later current ledger is ACTION_COVERAGE_019.md; this audit's earlier runtime hashes describe its original design snapshot. Final build-time hashes are supplied separately in the immutable candidate manifest. The pure helper, original-source124-row endpoint oracle and actual-controller independent review are in `ShortcutOutputConnectionActions.ts`, `tools/reference/output-connection-019/endpoint-golden.json`, `tests/output-connection-arguments-019.test.mjs`, `tests/reviewer-output-019.test.mjs` and DEOVR_019_CONTRACT_REVIEW.md.

Current WS parsing preserves a literal path such as `/a/../ws`, whereas original System.Uri normalizes it to `/ws`. Other explicitly rejected domains include credentials, query/fragment, unsupported schemes and unsafe numeric/endpoint shapes. This is a documented bounded partial adapter, not unrestricted original URI equivalence. No existing connected socket is silently retargeted, and changed drafts revoke only their target's Arm.
