# MultiFunPlayer for OHOS — 0.23.0 serial candidate

## Current scope (0.23.0 / code24)

The actual output UI now supports explicit serial targets alongside TCP/UDP/WebSocket. Each target persists bounded endpoint hints, baud/8N1/no-handshake and DTR/RTS preferences, ranges, fixed/polled settings and paused permissions. Restoring settings performs no enumeration, authorization, open or Arm. Connect re-enumerates and verifies the selected hint; successful open still requires explicit Arm and a valid current source frame.

- Official serial API26 and API19 use runtime capability checks. These services target PC/2in1 in the installed SDK; they are not assumed available on phones/tablets. API19 cannot set DTR/RTS, so both must explicitly accept OS management before connection.
- Standard USB Host supports an **experimental CH340/CH341 write-only subset**: VID1a86, PID7523/5523, one validated vendor interface without alternates, paired endpoints and ROM0x30. Unknown chips/ROM/descriptors fail closed. IN, device buttons/axis-input actions and execution ACK are not implemented. No physical CH device has been tested. CDC remains unavailable pending short-packet/IN evidence; CP210x/FTDI/CH343/CH9102 are not claimed.
- A user-clicked read-only CH identification probe requests system authorization, reads descriptors and ROM only, then closes. It performs no UART initialization or motion write. Its copyable report excludes device path/product strings/serial numbers. All ordinary outputs must first be confirmed disconnected. Stop/background/target edits cancel continuation; unfinished or unconfirmed cleanup blocks Connect/Arm across remounts.
- Serial ownership is conservatively limited to **one live serial handle application-wide**, across backend kinds and targets. Network targets remain independent. Failed or timed-out closure retains quarantine; reconnect never Arms automatically. Local write counts are not hardware execution proof.

The full-width0.22 layout, readable default52vp controls, fixed global Stop and single video Surface remain. There are no new device/browser screenshots or physical interoperability claims. Existing whole-workspace branch remounts may still reset local uncommitted editors; output drafts themselves remain controlled.

Validation details and exact final counts are in [VALIDATION](VALIDATION.md). See [serial contract](SERIAL_023_CONTRACT.md), [user test steps](LOCAL_TEST_023.md), [Chinese usage](USAGE_ZH.md). The bundled MIT CH34x notice is included as a raw resource in the HAP. Original action coverage remains182IDs /154of188sites (110full-portable,44partial,34unwired): this stage connects a transport, not new shortcut catalog names. Original serial auto-connect, full parameter combinations, serial-target shortcut actions and input processing are still incomplete. File recording remains unintegrated and its blocked review has not been retried.

## Historical record

# MultiFunPlayer for OHOS — 0.22.0 UI candidate

## Current scope (0.22.0 / code 23)

This update addresses device fit rather than adding action names. Normal workspaces
no longer stop at 600 vp per column or 1220 vp overall: single/two-pane content uses
the available safe window area. One outer gutter replaces cumulative nested
padding; page/title/sections use one neutral background, with clear input and
selected/error surfaces. Nested cards, repeated outlines and button shadows are
removed. The media toolbar distributes all six actions across the pane, using a
balanced3×2 at320vp instead of5+1; axis tools wrap and keep52vp touch targets.

Within a field's existing instance, measured widths≥600vp align labels/controls
40/60; narrower fields stack. The same input node, draft and keyboard owner remain
through that local layout change. Existing whole-workspace single/two-pane branch
changes can still remount local uncommitted editors; universal draft/IME retention
across those branches is **not** established. Application-owned output drafts and
existing source/output lifecycle guards remain. The fixed global Stop and single
native video Surface are unchanged.

Validation: 3193/3193 actual-.NET aggregate tests pass, zero skips; official clean SDK26 build passes all33 tasks in24.274s, with137 exact source/config inputs verified unchanged. An independent97-test UI review found no new
unsafe action path. The new local browser approximation imports current tokens
and geometry, covers14viewports240–1920, and passes6source-contract/static tests.
No ArkUI/browser screenshot or phone/tablet/PC visual acceptance was obtained;
the denied render route was not retried. The named HMOS code-workshop reference
link is still unspecified, so no exact-reference style claim is made.

Serial remains **unavailable in this UI candidate**. Independent PC/USB-CDC backend
work is still under review and is explicitly excluded from this frozen source and
build; no unknown USB-UART chipset or hardware support is claimed. Original action
coverage stays182IDs /154of188sites (110full-portable,44partial,34unwired). File
recording remains unintegrated and its blocked review was not retried. See
[UI contract](WORKSPACE_022_CONTRACT.md), [local checks](LOCAL_TEST_022.md),
[usage](USAGE_ZH.md), [validation](VALIDATION.md) and
[unchanged coverage ledger](ACTION_COVERAGE_021.md).

The separately published ordinal-CI correction records actual .NET/ICU/invariant
backend provenance and keeps the original1453-pair production table unchanged;
see [portability evidence](ORDINAL_ORACLE_PORTABILITY.md).

## Historical record

# MultiFunPlayer for OHOS — 0.21.0 local candidate

## Current scope (0.21.0 / code 22)

HereSphere is now a second independently owned remote media source alongside DeoVR and Internal/local AVPlayer. Source choice and separate validated endpoints persist inertly. The actual app connects explicitly, receives framed TCP JSON, tracks resource/legacy-path identity and observed time/state/duration/rate, matches scripts only in the authorized Download catalog, and routes common play/pause/speed/seek/path/AB/AutoSkip controls to the exact current source. Source callbacks, clock proof and asynchronous script reads include source kind, connection and resource identity; equal numeric generations cannot cross owners.

Switching retires both old source owners and requires confirmed closure before replacement. Stop, background, page/Stage/Ability teardown, failed close and stale operations close dispatch and revoke intent. Restored configuration never connects or Arms. HereSphere resource identifiers are inert context, never a network fetch or filesystem capability. No new directory or single-video import is added.

The original187-assertion HereSphere reader/writer oracle executes under .NET9. Three real127.0.0.1 socket fixtures exercise HereSphere → production native TCP adapter logic → an injected Node SDK bridge, including fragmentation, command bytes, reset, timeout, late write and cleanup. The official clean SDK build and3163/3163 aggregate pass. This is not actual HereSphere-player or OHOS-NetworkKit-device interoperability; local signing/deployment and authorized device testing remain necessary.

The protocol has no causal command ACK/server timestamp. Play/pause/speed reuse bounded compatible-observation continuity only for targets already explicitly Armed; writes alone prove nothing. Seek/path/source changes revoke Arm and require explicit reauthorization. Strict bounded parser/endpoint domains, missing Windows process checks and missing source auto-connect remain declared portable differences.

All0.20 readable defaults,≥52vp controls, fixed global Stop, same native video Surface, output independence and one-shot network diagnostics remain. No new rendered UI screenshots were generated. Coverage is **182 IDs=164 literal original+14 aliases+4 OHOS;154/188 sites=110 full-portable+44 partial;34 unwired**. Four concrete HereSphere names add only one original site. This is still incomplete1:1 parity. See [usage](USAGE_ZH.md), [local tests](LOCAL_TEST_021.md), [exact coverage](ACTION_COVERAGE_021.md), [validation](VALIDATION.md) and [remaining priorities](NEXT_PARITY_STEPS.md). File recording remains unintegrated; its blocked review was not retried. Git publication is not part of this candidate freeze.

## Historical record

# MultiFunPlayer for OHOS — 0.20.0 local candidate

## Current scope (0.20.0 / code 21)

This stage addresses practical readability and real connectivity rather than inflating action coverage. All phone/tablet/PC layouts default to22–24vp headings,18vp body,14vp helper text and≥52vp controls. General settings can explicitly select compact spacing/body16; controls stay52. Shared muted surfaces, edge highlights and pressed feedback replace the small dense treatment. The title integrates visually with the workspace (72vp, or128vp/two rows below320vp); it does not claim platform-wide immersive-system-bar support. Long selected values, target names, errors and source labels have wrapping/full-text paths. The single native video Surface stays mounted; controls remain outside it, including visible Stop in narrow landscape. A fixed72×52vp global Stop is always outside workspace scrolling on phone/tablet/PC, invokes the existing hard-stop path and stays enabled; fullscreen/error layers keep a visible Stop.

Ten settings panels and Index use shared UiStyle. Narrow settings stack labels/fields; scroll ownership, read-only/stale callback guards, actual source/output identities and original numerical behavior remain.9 representative geometries and contrast/source contracts are checked. The [runnable browser approximation](../tools/ui-preview-020/README.md) imports production tokens/geometry, but **no actual screenshots were produced**: permitted rendering routes were blocked and stopped. Static checks are not native visual, IME, popup, touch or font-scaling acceptance.

The existing TCP/UDP output chain now runs over **actual Linux sockets** in bounded loopback fixtures: production OutputCoordinator→OutputSession→TCode→NativeTransportFactory/adapters→Node-backed SDK-shaped environment→real127.0.0.1 sockets and production receive handling. Both protocols delivered exactly22bytes in two expected TCode commands. This proves shared encoding/ownership/send/receive logic; the injected Linux bridge is not the OHOS NetworkKit runtime. WebSocket remains native code plus prior injected tests, without new live-socket evidence here.

“Network output → TCP / UDP round-trip diagnostic” is now reachable in the actual app. It uses NativeSocketDiagnostic, production OHOS adapters and a fresh native128-bit random challenge. Only an explicit dedicated-receiver confirmation starts one bounded request. All normal targets must be idle, disarmed and confirmed disconnected. Normal UI/shortcut Connect and Arm are blocked until diagnostic closure is confirmed; failed close remains quarantined across remounts. Stop/F12, background, page/stage/Ability teardown cancel; foreground and settings restoration never retry or Arm. Endpoint drafts are volatile, and editing revokes confirmation immediately. The [receiver and guide](tools/network-diagnostics/README.md) provide the user-run LAN test; no unknown endpoint or physical device was contacted.

Exact echo proves a fresh challenge returned by the configured receiver, not authenticated identity or hardware execution. Local write acceptance alone is not success. Redacted request ID/protocol/phase/byte counts/latency and close state remain visible; a later denied request cannot be hidden by an earlier successful record. The unsigned HAP requires official local signing/deployment; its real OHOS networking/display remains to be tested on a compatible user-owned device.

Coverage remains **178 catalog IDs=160 literal original names+14 aliases+4OHOS additions**, mapping **153/188 original sites=110full-portable+43partial;35unwired**. This diagnostic is a platform test facility, not an invented completion of the original remaining debug action. Other players/repositories, continuous Drive/mouse/gamepad input, serial/pipe/Buttplug/Handy, output auto-connect and General/WPF/runtime/device acceptance gaps remain. File recording is unintegrated and its blocked review was not retried; Git publication remains paused. See [validation](VALIDATION.md), [188-site ledger](ACTION_COVERAGE_019.md) and [remaining priorities](NEXT_PARITY_STEPS.md).

## Historical record

# MultiFunPlayer for OHOS — 0.19.0 local candidate

## Current scope (0.19.0 / code 20)

Ordinary DeoVR Play, Pause and Speed can retain an already-explicit output Arm through a tightly owned control transaction. Dispatch closes immediately and clears old candidates; two genuine compatible post-boundary observations plus a new complete authorized pipeline frame are required before output can continue. No existing Arm means none is created. Pause can retain “waiting, no output”; separately permitted current Home/Motion follows its own scalar/event proof. Stop, background, disconnect, error, timeout, changed source/profile/configuration/target or unexpected seek permanently cancel retention. Seek/Path/AB/AutoSkip still revoke Arm.

The protocol has no correlated ACK, server timestamp or sequence. Local TCP completion never proves execution. First-byte ingress ownership rejects locally pre-boundary fragments, but a coherent sequence buffered at the server cannot be proved current or causal. This boundary remains explicit, and no real-player interoperability is claimed. The original tracker and numerical pipeline are unchanged. See [continuity contract](DEOVR_019_CONTINUITY_CONTRACT.md) and [independent review](DEOVR_019_CONTRACT_REVIEW.md).

Six new original output registration sites now have touch/keyboard routes: TCP/UDP Endpoint Set, WebSocket Uri Set, and explicit-instance Connect/Disconnect/Toggle. Endpoint changes save a complete validated inert draft and revoke only that target's Arm; an established socket retains its old destination until explicit reconnection/application. Connected Connect is inert. Connections never Arm or change media playback. Stop/focus/background/removal and stale draft/dispatch ownership cancel only their own pending connection; failed native close remains quarantined. The original setter/parser oracle executes124 distinct cases; strict finite endpoint/URI domains and the extra Arm gate keep these routes partial. See [original audit](OUTPUT_CONNECTION_019_SOURCE_AUDIT.md).

**178 catalog IDs =160 literal original names +14 explicit-instance aliases +4 OHOS additions**, mapped to **153/188 registration sites:110 full-portable,43 partial,35 unwired**. The six new aliases cover six original sites, without promoting old partials. The remaining35 group into18 media-source/lifecycle routes,9 continuous Drive routes,7 output scheduler/protocol routes and1 diagnostic route. The complete ledger is [ACTION_COVERAGE_019.md](ACTION_COVERAGE_019.md); priorities and broader functional gaps are in [NEXT_PARITY_STEPS.md](NEXT_PARITY_STEPS.md).

This candidate includes real local AVPlayer/playlist/AB/AutoSkip, managed scripts, axis/Motion pipeline, explicit independent previews, multi-target TCP/UDP/WebSocket and one remote DeoVR source. It is not the full Windows product: other remote players/repositories, continuous mouse/gamepad/Drive input, serial/pipe/Buttplug/Handy, output auto-connect, several General/WPF binding behaviors and true device/layout acceptance remain. File recording is not integrated and its blocked special review was not retried. Package presence of dormant source or a native library is not feature acceptance.

The provided unsigned HAP can be signed/deployed through the official local SDK workflow; full source/tests/oracles and hashes support reproduction. No signing, installation, Git publication, real endpoint connection, physical-device ACK, Windows dispatcher, or phone/tablet/PC visual/IME/touch acceptance is implied. Validation counts and exact candidate identity are in [VALIDATION.md](VALIDATION.md).

## Historical record

# MultiFunPlayer for OHOS — 0.18.0 local candidate

## Current scope (0.18.0 / code 19)

DeoVR is now a real native TCP media source: explicit endpoint connection, length-prefixed UTF-8 JSON reception, original five-field commands and heartbeat, observed remote playback state, bounded receipt freshness, managed script matching, asynchronous source retirement and mobile-accessible controls. The actual Index, session, native adapter and panel are connected; this is no longer a protocol-only model.

Source selection and endpoint persist inertly. Selecting or restoring DeoVR does not connect or Arm any output. Media and physical outputs remain separate. Received currentTime anchors the unchanged original internal/public tracker; commands, send completion, heartbeat and snapshot reads never invent a position or a seek acknowledgement. This first adapter also disarms on explicit play/pause/speed commands, a conservative difference from original live controls. Every remote seek, including AB/AutoSkip, revokes all output Arm intent and queued candidates. Fresh observations may resume preview; output needs a new explicit Arm. Stop revokes local processing immediately and asynchronously closes the source; TCP close is not proof that the remote player stopped.

Remote metadata paths and URLs are matching hints only. Actual script reads use entries from the existing authorized Download/catalog boundary. No arbitrary local path, URL download, directory or single-video import is added. Same-resource Lock and original event ordering are retained. New-resource position/state/duration proof, 750-ms freshness, bounded parser/queue limits and close quarantine are explicit safety differences from the original reader.

**172 catalog IDs =160 original concrete names +8 explicit-instance output-template adapters +4 OHOS additions**, mapped to **147/188 original registration sites:110 full-portable,37 partial,41 unwired**. The eight new IDs cover five original registration sites, because source connection templates expand per source. Existing partials are not silently promoted. See [complete ledger](ACTION_COVERAGE_018.md), [original source audit](DEOVR_018_SOURCE_AUDIT.md), [contract](DEOVR_018_CONTRACT.md), [validation](VALIDATION.md) and [Chinese usage](USAGE_ZH.md).

Validation uses injected native APIs and local protocol fixtures, plus actual original C# methods, actual page-controller methods and official SDK packaging. No real DeoVR endpoint, physical output device, Windows UI scheduler, native phone/tablet/PC display, keyboard/IME or touch has been exercised. Other remote protocols, continuous Drive inputs and unsupported output protocols remain incomplete. File recording is not integrated; its blocked special review was not retried. Git publication, signing and installation remain outside this candidate.

## Historical record

# MultiFunPlayer for OHOS — 0.17.0 local candidate

## Current scope (0.17.0 / code 18)

**164 unique catalog IDs =152 original concrete names +8 explicit-instance output-template adapters +4 OHOS additions.** They map to **142/188 original registration sites:110 full-portable,32 partial,46 unwired**. The nine newly reachable templates remain partial within their declared managed-resource/supported-target/finite-domain boundaries. No old partial is promoted. See [the complete action ledger](ACTION_COVERAGE_017.md) and [all 55 baseline gaps with dependencies](REMAINING_ORIGINAL_DEPENDENCIES_017.md).

Looping Script Set resolves an exact current Download relative path or URI, then reads the catalog-owned URI. The same selection is genuinely reread and produces a new resource identity, resets the provider phase/index and requests sync while retaining its cached value until a real update. Selection follows the original direct reader rather than filename companion aliases. Media continues; pending reads close output dispatch and clear old queues. Source/profile/configuration/catalog/foreground/Stop/cancellation ownership is checked again before commit. Failure retains old configuration/resource and disarms instead of reporting success. Startup restoration has the same late-read protection and never connects or arms output.

Eight output Range Set/Offset templates now address one explicit stable target instance and one active axis from both controlled touch and keyboard mapping UI. Original Minimum/Maximum/Middle/Size formulas and independent limits are preserved, including Middle Set's half-width subtraction. Finite normalized reversed endpoints are supported through storage, mapping and both encoders; the UI labels their direction. Commands cannot enable disabled axes, change scope, modes or permissions, connect or Arm. A live edit of the currently applied target clears queued/old-receipt candidates immediately and waits for a new real source frame; only pre-existing valid Arm intent can remain. Other targets stay independent. Mapped successful dirty history is retained; Polled needs an actual new event.

Read [contract](SHORTCUT_ACTIONS_017_CONTRACT.md), [Looping source audit](LOOPING_SCRIPT_017_SOURCE_AUDIT.md), [range source/oracle audit](OUTPUT_RANGE_017_SOURCE_AUDIT.md), [validation](VALIDATION.md) and [usage](USAGE_ZH.md). Range numeric/encoded behavior is compared against compiled original C# delegates. Controller and real SDK verification do not establish Windows binding scheduling, physical-device ACK or native phone/tablet/PC touch acceptance. Existing48-vp controls and shared scrolling are retained.

Major remaining dependencies are23 external-source/lifecycle/media-switch registrations,9 continuous input Drive registrations,13 output ownership/discovery/protocol registrations and1 diagnostic registration. DeoVR is the next recommended major player loop, currently **unimplemented**: its original protocol has no correlated seek ACK, so a future seek must revoke physical Arm. Download remains the media entry; arbitrary directory/single-video import is not added. File recording remains unintegrated and its blocked special review was not retried. Git publication, signing, installation and real-device tests are not part of this candidate.

## Historical 0.16 candidate

# MultiFunPlayer for OHOS — 0.16.0 local candidate

## Current scope (0.16.0 / code 17)

This is dependency work on existing actions, not catalog expansion. The evaluated catalog remains **155 concrete IDs =151 original names +4 OHOS additions**, mapped to **133/188 original templates:110 full-portable,23 partial,55 unwired**. [The new ledger](ACTION_COVERAGE_016.md) corrects the previous assumed Range/Octaves write-back gap and records what actually remains partial.

Custom Curve now has a real mounted-editor/axis/profile owner and measured plot dimensions. Attachment synchronizes and round-trips the point collection; subsequent Duration changes invoke viewport pruning before size checks, while point Reset synchronizes without unconditional pruning. Commands preserve Duration(old collection) → Interpolation → Reset(incoming collection). Duplicate ordering, same-content Reset, phase and original point-only no-sync behavior are retained. All effects validate before mutation, invalidate stale output evidence, and publish no frame or Arm.

The four providers’ minimum/maximum controls and Random Octaves now maintain separate raw model and effective control values. Pinned MahApps/WPF source proves ordinary source-to-target coercion does **not** rewrite provider values. Explicit user edits, including typing the same displayed value, use the proved commit path; untouched blur/attach/restore do not. Differences are displayed clearly. Provider reversed ranges and Random’s128 activation budget remain. Numeric touch fields are the portable equivalent; Windows dual-thumb dragging/initial binding scheduling is not claimed.

Current axis/profile/provider/read-only context remounts controlled editors atomically. Point callbacks and numeric drafts bind to the source snapshot, and active drags keep their original bounds/geometry/source identity. Switching axes with equal values, an external edit to the other coordinate, Duration/size changes, background and destruction cannot retarget an old edit. Phone/tablet controls retain48-vp touch targets and the shared workspace scroll owner. Controller/structural tests and SDK builds are not visual or physical touch acceptance.

Read [contract](BOUND_CONTROLS_016_CONTRACT.md), [Canvas source/oracle audit](POINT_CANVAS_016_SOURCE_AUDIT.md), [Range/Octaves source/oracle audit](RANGE_OCTAVES_016_SOURCE_AUDIT.md), [validation](VALIDATION.md), [usage](USAGE_ZH.md), and [remaining work](NEXT_PARITY_STEPS.md). Windows cached-tab lifetime, first-binding/dispatcher/Fody scheduling, Smart point domain and runtime budgets remain partial. Download remains the media entry. File recording remains unintegrated; its blocked special review was not retried. No signing, installation or physical output acceptance is implied.

## Historical 0.15 candidate

# MultiFunPlayer for OHOS — 0.15.0 local candidate

## Current candidate scope (0.15.0 / code 16)

The catalog now has **155 concrete actions = 151 original names plus four OHOS additions**, mapped to **133/188 original registration templates**: **110 full within the portable contract, 23 partial, 55 unwired**. The five new original routes are Custom Curve Points::Set, SmartLimitPoints::Set, Axis Value Set/Offset and Script::SkipGap. Existing 21 partial entries were not upgraded by increasing catalog size. See [the complete coverage ledger](ACTION_COVERAGE_015.md).

Point actions use bounded structured arguments, a touch point-list/canvas editor, an explicit Execute button, defensive copies and stale-edit ownership. Custom commands apply Duration → Interpolation → collection Reset in original order. Point-only changes do not request sync; equal-content Reset still refreshes derived tiles and preserves phase. Smart points remain strictly increasing in x under the current portable schema; this is narrower than the original collection. Limits: 4096 points/action, 8192/configuration and the existing settings byte budget.

Manual values use the original transition state machine, including the pre-first-tick Append time=-1 arithmetic and zero-duration one-frame target. Editing and Set/Offset do not start processing or Arm. Explicit manual preview closes media and leaves outputs unarmed. Fixed-mode targets independently opt into default-off paused manual output and explicitly Arm waiting; “待命，无输出” is distinct from dispatch. Only a genuine current surviving Transition frame can send. Stop/background/disconnect/source or admission changes revoke the old intent; commands or restored settings never rebuild it. Raw transition state is not rewritten by the output clamp, and finite-input append overflow is rejected atomically. Original transitions emit no polled event; none is fabricated.

SkipGap follows the actual extracted C# behavior: the original selector does not filter its all-bound-axis scan; the earliest stale/near candidate blocks later candidates; indices reflect offsets but candidates use raw script seconds; duration clamping happens only after threshold selection. OHOS requires a valid enabled selected target and a finite ready media clock. All seeks use the existing real/confirmed source transaction.

Verification and exact artifact identity are in [VALIDATION.md](VALIDATION.md). Local mock/controller, numerical oracle and SDK evidence does not certify real touch/keyboard/IME behavior, loaded WPF notification ordering, physical devices, remote acknowledgements or runtime capability on every device. Download remains the automatic source entry. Other input families, remote players/protocols and General omissions remain open. File recording remains unintegrated; its blocked special review was not retried.

See [contract](SHORTCUT_ACTIONS_015_CONTRACT.md), [source audit](SHORTCUT_ACTIONS_015_SOURCE_AUDIT.md), [usage](USAGE_ZH.md) and [next dependency priorities](NEXT_PARITY_STEPS.md). Historical candidate evidence follows.

## Historical 0.14 candidate

# MultiFunPlayer for OHOS — 0.14.0 local candidate

## Current candidate scope (0.14.0 / code 15)

The real keyboard/touch catalog has **150 concrete actions: 146 upstream-named actions plus four OHOS additions**. They map to **128 of 188 original registration templates**. The conservative ledger records **107 full within the portable contract, 21 partial and 60 unwired**; provider-expanded actions are not counted as extra original templates. See [all 188 records](ACTION_COVERAGE_014.md).

This increment wires 16 Motion templates (34 concrete provider actions), Internal PlayByName and two named Shortcut Enabled commands. Scalar/enum edits use the existing provider algorithms and sync behavior; Custom Curve shortcut Reset exposes the original Request sync argument, while the curve UI Reset retains its different source behavior. Disabling a mapping blocks future gestures but preserves its already-admitted batch/timers. Stop/F12, focus/IME, background and ordinary editor changes still cancel work. Eighteen bounded touch groups expose every catalog entry with explicit target/parameter/result feedback.

Axis Reload and Link now perform real bounded reindex/read inside the same authorized Download root. New files can be discovered. Original sync-before-search, Lock, no-match retention, priority/fallback links and fresh resource identity remain. Successful reload suspends dispatch while media/Motion continue, then waits for a genuine new frame; only pre-existing, unchanged target arm intent can resume. Failed/incomplete reads or cancellation retain old resources with an error, revoke the epoch and disarm. Source/profile/catalog changes and late callbacks cannot publish stale results. There is a 48-vp reload/cancel control in axis settings; no directory or individual-video import is added.

Final validation: **1731/1731 tests**, actual .NET/C# oracles enabled, zero failures/skips; official SDK26 clean HAP passed (33 tasks in total: 32 executed, 1 up-to-date; 25 s 789 ms ). All **111 production/build inputs** matched before/after. Unsigned HAP **6,253,404 bytes**, SHA256 `1c0a8d3a333ddb69dcd4b95c01639f2273a316ffd288cacb5ab626ee3c010187`. Independent review passed 44 Motion/named-command cases and 44 Reload cases, with 82 and 59 focused checks respectively; stage 1 was rerun after Reload integration. No device, physical output ACK or visual acceptance is inferred.

Known partials remain explicit: mounted WPF RangeSlider/Duration/Octaves effects, bounded/null name domains, local rate bounds, Internal-only common AutoConnect expansion and Download-only repository scope. Sixty templates, analog/toggle input families, six desktop General settings, remote sources and other protocols remain unwired. [Next steps](NEXT_PARITY_STEPS.md) prioritizes actual core-backed actions; DeoVR remains an assessment. File recording remains unconnected and its blocked special review was not retried.

See [0.14 contract](SHORTCUT_ACTIONS_014_CONTRACT.md), [source/binding audit](SHORTCUT_ACTIONS_014_SOURCE_AUDIT.md), [usage](USAGE_ZH.md), and [validation](VALIDATION.md). Historical candidate evidence follows.

## Historical 0.13.0 local candidate

### Historical scope (0.13.0 / code 14)

The actual keyboard/touch dispatcher now exposes **113 actions: 109 original registration-template matches and four OHOS additions**. The frozen 0.12 catalog had 18 original matches plus four additions; its “22 actions” did not mean 22 original templates. The complete 188-template ledger classifies the current implementation as **97 locally complete, 12 partial, and 79 missing**. Complete means the current local implementation and tests cover the original template; it is not hardware or whole-application 1:1 acceptance. See [per-template coverage](ACTION_COVERAGE_013.md).

The increment adds explicit axis selection, source-derived Axis/Sync Set/Toggle/Offset commands, absolute/percent/script-start seeks, named/indexed chapter and bookmark navigation, AB commands, and persisted Internal/AutoSkip preferences. Thirteen touch categories expose the same dispatcher with arguments and concrete result/rejection feedback. Disabled or unavailable axes never silently fall back to the selected axis. Configuration and resource setters adopt their synchronous effects before a following Sync Cancel, without manufacturing a frame or preserving old output authorization. Existing Stop, focus/IME, background and stale-callback cancellation remain active; no shortcut connects or Arms output.

Final validation: **1514/1514 tests**, actual .NET/C# oracles enabled, zero skips/failures; official SDK26 clean HAP passed (33 tasks, all executed, 24.750 seconds). All **110 production/build inputs** matched before and after. Unsigned HAP **6,178,586 bytes**, SHA256 `b484dd7bd188a4cda206c72d403cf54ffef97f727894426464bd367003b0a6f3`. Independent review also passed 16 controller cases, 226 focused regressions, and reference ordinal-name comparisons. WPF binding scheduling and real-device keyboard/IME/touch/visual behavior were not executed.

Remaining partial behavior includes bounded OHOS playback rates and marker text, catalog-cached script reloads/additional scripts, and common media AutoConnect commands expanded only for Internal. Motion-provider parameter/curve actions, manual axis transitions, analog/toggle input families, output-mutation shortcuts, remote sources and six desktop General settings remain open. [Next steps](NEXT_PARITY_STEPS.md) prioritizes these; [remote assessment](REMOTE_SOURCE_FEASIBILITY.md) recommends DeoVR as the next source, without implementing or inventing its missing correlated seek acknowledgement. Download remains the managed media entry. File recording remains unconnected and its blocked review was not retried.

See [0.13 contract](SHORTCUT_ACTIONS_013_CONTRACT.md), [input/General contract](INPUT_GENERAL_CONTRACT.md), [usage](USAGE_ZH.md), and [validation](VALIDATION.md). Historical candidate records follow.

## Historical 0.12.0 local candidate


### Historical scope (0.12.0 / code 13)

The real settings page now exposes persistent local keyboard mappings and equivalent touch commands. The original empty mapping default is preserved. Press/Release, delayed Click and both Hold modes use source-derived boundaries; 22 bounded real actions share one ordered, cancellable dispatcher. Internal Next→Play and reload Play→Pause await source completion. F12 is an explicitly labeled OHOS global Stop addition and bypasses pending work; shortcuts never Connect or Arm output.

Text/IME focus, shortcut editing, Stop, background, source replacement and settings changes retire pending work. Physical key edges consumed by IME remain quarantined until release, without reading typed text. Field, mapping/action and capture-session identities reject stale callbacks after remount/reorder/cancel. General offers real automatic/vertical/horizontal workspace layout and None/Dialog/Snackbar notifications, preserving the single video Surface and persistent safety indicators. The other six desktop General settings are shown as unavailable, without ineffective toggles.

Final validation: **1277/1277 tests**, including actual .NET/C# oracles, zero skips/failures; official SDK26 clean HAP passed (33 tasks, 32 executed, 26.636 seconds). All 107 production/build inputs matched before and after. Unsigned HAP 5,949,267 bytes, SHA256 `d00b7110ffd797d4b0e55b3b08411bd975d2d71505f7a078efed8e0911353895`. The new input trigger/controller expectations are source-derived tests; the executable C# oracles cover the existing numeric/media/output models, not a physical keyboard.

See [input/General contract](INPUT_GENERAL_CONTRACT.md), [complete original WPF inventory](INPUT_GENERAL_SOURCE_AUDIT.md) and [validation](VALIDATION.md). The inventory covers all 188 registered action templates, ten trigger kinds and both eight-setting sections; it is not a claim those all work on OHOS. Windows-global RawInput, toggle/axis gestures, controller/mouse/TCode input, arbitrary action parameters, the six desktop logging/window settings and device-specific keyboard/IME/visual behavior remain unimplemented or unverified. Download remains the only managed media entry. File review remains blocked and no alternate review route was attempted.

## Historical 0.11 candidate scope (code 12)

The real output page now owns multiple independent TCP, UDP and WebSocket targets, up to ten per kind. Add selects the lowest free original per-kind index; selecting another target changes only its editor. Each target retains its own endpoint, ranges, fixed/polled scheduler, paused permissions, connection, queue and applied identity. Ordered targets, selection, credential-free endpoints and per-device ranges persist. Disabled/temporarily hidden axis ranges survive profile changes. Cold restore creates inert targets, never connections or an Arm.

Apply/Connect and Arm remain separate explicit actions for each target. Editing disarms only that target. Global Stop, background, source invalidation and runtime/profile reset reach every target, including unselected ones; same-source seeks preserve only each target's pre-existing arm. Removal keeps a failed-close target visible and isolated until closure is confirmed. Target-generation and connection-request tokens reject late work after deletion/re-addition, cancellation, readonly/recovery or a background return. Unsafe unfinished endpoints stay visibly unsaved, and submitted endpoints/configurations are revalidated against the exact current draft.

Final validation: **1084/1084 tests**, including actual .NET/C# oracles, zero skips/failures; official SDK26 clean HAP passed (33 tasks, 32 executed, 23.536 seconds). All 99 production/build inputs matched before and after. Unsigned HAP 5,562,473 bytes, SHA256 `fea00f0565b244c79bbec5c4ee16cdcba3f61bf7fe14e40bd6cc0833f30293a2`.

See [multi-output contract](MULTI_OUTPUT_CONTRACT.md), [original source audit](MULTI_OUTPUT_SOURCE_AUDIT.md) and [validation](VALIDATION.md). Original automatic connection/retry is intentionally not enabled. Other output types, automatic retry, remote sources and full visual parity remain incomplete. File recording is not connected or released; its specialist review was blocked and was not retried. No physical device connection, device acknowledgement, signing, installation or phone/tablet/PC visual/touch validation is claimed.

## Historical 0.10 candidate scope (code 11)

0.10 adds an always-reachable **safe runtime rebuild** action and an explicit **standalone no-media Motion Start**. Rebuild stops/disarms, cancels media/seek work, creates new pipeline/provider/registry identities, clears loaded scripts and preserves saved configuration. It does not accept damaged-settings recovery or automatically reload, play, connect or Arm. Standalone Start closes media and uses the unchanged paused/NaN pipeline; configure both paused and without-script updates first. Target paused-Motion permission, a fresh surviving sample and explicit Apply/Connect/Arm remain separate requirements. Generic pause, late media callbacks and foreground return cannot reopen processing after Stop. See [runtime contract](RUNTIME_CONTROL_CONTRACT.md).

The real Ability/Index now owns the native-window adapter. Capable floating/maximized windows can enter observed system fullscreen and restore their original window mode. Unsupported phone/tablet/window modes keep in-window video fullscreen. One AVPlayer/Surface, aspect ratio and system rotation lock remain unchanged. Failed restore/no-op is visible with an always-reachable retry; page/stage owner tokens reject late callbacks. No general mobile system-bar immersive policy is claimed. See [window contract](WINDOW_PRESENTATION.md).

Final validation: **973/973 tests, including actual .NET/C# oracles, zero skips/failures**; official SDK26 clean HAP passed (33 tasks, 32 executed, 19.509 seconds). All 97 production/build inputs matched before and after. Unsigned HAP 5,422,323 bytes, SHA256 `2a8b9e01b05194454817d779d79e07ab4adebea619f2cd6f14adf66ebac4c5be`. Details are recorded in [VALIDATION.md](VALIDATION.md). File recording remains unconnected and is awaiting specialist review. Physical output acknowledgements and real phone/tablet/PC visual/touch/window behavior remain unverified. The 0.9 feature set below is preserved; its counts and hashes describe the immutable 0.9 archive. See [remaining priorities](NEXT_PARITY_STEPS.md).

## Historical 0.9 candidate scope (code 10)

The actual Index page now connects guarded native settings, the active device/axis registry, complete AxisPipeline, four Motion providers, editable settings and profile clipboard transfer. TCP/UDP/WebSocket targets have explicit Apply/Connect and Arm controls, source-qualified fixed/polled output and fail-closed native cleanup. Media playback remains independent of output connection. Preview values and local write completion are not device acknowledgements.

0.9 adds the real Internal script source and playlist, AB loops and AutoSkip for Internal and local AVPlayer video, plus persisted queue identities/source preferences. Internal reads only current authorized Download catalog entries. Connect initializes paused, then select/append and explicitly Play. Startup AutoConnect affects only Internal source connection, never playback or physical output. Queue identities/order/duplicates and source preferences persist; AB, current position, playing/armed intent do not.

Same-source seek transactions can retain an already explicit arm: pending immediately clears dispatch queues and invalidates receipts; actual native seekDone (or actual Internal forced position), the current source token/epoch and a newly authorized frame are required before output resumes. A paused seek never acquires play intent or an arm. Stop/background/disconnect/error/timeout/source replacement revoke recovery. A full source-mode/runtime reset changes registry identity and requires applying the current output configuration again before explicit Arm. Different Internal items disarm output; same-item/AB seeks retain only existing intent.

Final validation: **921/921 Node tests including executable original-C# oracles, 0 failures/skips**; clean official SDK26 ArkTS/HAP build, 33 tasks (32 executed), 97 production/configuration inputs identical before and after build. Unsigned HAP: 5,357,388 bytes; SHA256 `24b61740e4717c55598ce2f6304680239d7df7b4e19257243ff863963d1aa748`. See [validation](VALIDATION.md) and [playback semantics](PLAYBACK_INTEGRATION.md). No signing/install, physical device, network hardware acknowledgement or phone/tablet/PC visual/touch validation is claimed.

Incomplete in 0.9 (the two runtime controls and native-window integration are added above in 0.10): File recording UI, desktop playlist file/drag-drop import, remote player/repository adapters, other output types, multiple concurrent targets, complete shortcuts/input/general/theme settings and plugins/platform alternatives. Some independent models/native modules are present but do not establish a reachable feature. See [prioritized next steps](NEXT_PARITY_STEPS.md).

## Historical 0.6 baseline and earlier notes

The following sections preserve the delivered 0.6 baseline and older behavior descriptions. Statements such as “no physical output”, “edits pause”, “seek requires manual resume” and “playlist missing” below describe those older versions, not the 0.9 candidate above. They remain historical evidence rather than current scope. The historical matrix likewise records its original baseline and is not a blanket full-parity claim.

## Included

- Automatic media list from the system-assigned `Download/com.multifunplayer.ohos` directory. No individual video/script import or folder-picker entry in the main UI; no broad Downloads access. Refresh after copying resources.
- Existing ZIP-before-loose script matching and bounded ZIP32 parsing are preserved. ZIP support is for companion scripts, not generic video-archive extraction. See [matching scope and differences](LIBRARY_MATCHING.md).

- Native AVPlayer with explicit SCALED_ASPECT (complete original ratio, black bars), a stable XComponent, same-window video fullscreen and video/settings co-display, play/pause, seek, volume and 0.25–4× rate controls.
- Script synchronization follows confirmed native media time, including video lengths different from scripts.
- Stage app declares phone, tablet and 2-in-1 PC support.
- Source-led compact vertical source/script/axis/output stack; horizontal source/output-left and script/axis-right layout; touch-sized phone controls.
- Automatically matched local UTF-8 `.funscript` / JSON companion files with bounded reading; no extra script-import UI.
- Single/multi-axis keyframes, bounded validation, linear/PCHIP/makima/step interpolation, timeline and axis monitor.
- Chapters/bookmarks, playback/pause/seek/stop and simulator disconnect. Automatic scanning clears the initial demonstration rather than leaving stale content playable.
- Original heatmap velocity/range computation, 0.25–4× UI speed, global/per-axis 50 ms offset controls.
- Selected-axis interpolation, script inversion and 1–400% scaling around the default TCode neutral position; the UI defaults to upstream PCHIP.
- Chapter/bookmark previous/next navigation and native filename-to-axis aliases (TCode 0.3 defaults).
- Foreground lifecycle safety gate, no automatic resume after background/disconnect.
- 48 vp phone principal buttons, compact desktop controls, persistent phone transport and monotonic elapsed clock.

This is a functional interface/core prototype, not full feature or visual parity with the desktop application. The original layout/control inventory and required phone adaptations are recorded in [UI parity audit](UI_PARITY_AUDIT.md); the first main-window structural pass is implemented, but many original controls and exact visual parity remain outstanding. Disabled original axis tools are visibly unavailable, not pretend controls. PC means HarmonyOS PC. Window layout is driven by available width/height, including split-screen and resizing, rather than a device-name check.

## Safety and limitations

There is **no physical output transport** in this version: no network, USB, serial or Bluetooth commands. Axis bars are preview values, not proof of emitted commands. Stop/interruptions close the simulator gate. Physical-device safety and hardware watchdog behavior remain future work.

Not implemented: remote media-player control, TCP/UDP/WebSocket output, axis limits/soft-start, C# plugins, Windows named pipes, USB drivers, config migration. Descriptive chapters/bookmarks are parsed; metadata fields such as `inverted`, `range` and `version` do not alter output. The parser is intentionally stricter than upstream: invalid/out-of-range points are rejected instead of clamped/skipped. The heatmap transcribes upstream segment velocity accumulation and selected-axis range, independently of the interpolator; core evaluation uses all validated keyframes. Exact upstream PCHIP/makima kernels and unusual boundary padding are retained. Golden fixtures use an independent exact-rational Python reference transcription of pinned C# source, not execution of C#; see tests/fixtures/interpolation-README.md.

The media directory comes from the platform DOWNLOAD save mode, then is checked by actual I/O; unsupported or denied access is reported rather than treated as an empty library. Companion scripts retain JSON/size validation. Resources are never uploaded. Invalid matched scripts leave playback paused; videos with no companion script use an explicitly cleared, video-only state. Reading and JSON parsing remain on the UI flow; larger-file worker parsing is future work.

## Build

Use an official HarmonyOS SDK/DevEco command-line-tools installation with API26 and JDK21. Configuration targets SDK26 and declares minimum compatible version 6.0.0(API20); this declaration is not evidence of testing on API20 devices. No SDK, credentials or signing material is included.

```sh
export HARMONY_TOOLS_HOME=/path/to/command-line-tools
export JAVA_HOME=/path/to/jdk-21
bash ohos/tools/build.sh
```

For pure core tests only, Node24 supports the TypeScript source directly:

```sh
cd ohos
node --test tests/*.test.mjs
```

The build produces `entry/build/default/outputs/default/entry-default-unsigned.hap`. It is **unsigned**, not an install-ready release. Signing, device pairing and installation require the appropriate account/device authorization. No signing keys or persistent credentials are generated by the build script. GitHub CI covers pure core tests only; it does not silently claim an SDK/HAP build.

## Validation still required

Real phone portrait/landscape, tablet split-screen, PC free-window sizing; automatic directory creation/read failure; refresh and resource cancellation; invalid/large files; app background/foreground during playback/scanning; navigation and slider gestures; large fonts/safe areas/software keyboard; supported OS/device combinations. Build checks do not replace UI/device testing.

The full implementation inventory and missing features are tracked in [FEATURE_PARITY_MATRIX.zh-CN.md](FEATURE_PARITY_MATRIX.zh-CN.md).

See [PORT_PLAN_ZH.md](PORT_PLAN_ZH.md) for architecture, phased implementation and dependency audit. The root [MIT license](../LICENSE.md) applies; retain upstream attribution.

## Synchronization semantics

Script time equals media-clock position minus global offset minus axis offset, matching upstream. Positive offsets delay the script. In this simulator, media-clock duration remains the original script duration; endpoint values hold when shifted outside the script. Offset or interpolation changes pause playback and never open the output gate; rate changes affect only subsequent elapsed time. Per-axis offsets reset on a new script; global offset, speed and curve mode stay as user settings.

Metadata accepts bounded `HH:mm:ss` strings with up to seven fractional digits, up to 24 hours; 1,000 combined markers, names at most 256 characters. It is sorted for navigation and never changes script duration. The parser is a strict subset of .NET TimeSpan, not all .NET date/time syntax. Filename inference applies only to top-level single-axis actions without embedded axes; embedded axis IDs win. Unknown or disabled aliases retain L0. Matching uses the scanned filename and parent identity; opaque provider identities must not be guessed into a different file.

## Native video scope

Uses the platform AVPlayer rather than bundling FFmpeg. MP4 (H.264/AAC) is the first recommended device-validation case; the library can list MKV, MPEG-TS and M4V, but container/codec support and hardware decoding depend on the device. Unsupported sources fail closed. No format or hardware-acceleration guarantee is made.

Seeking pauses output and uses actual `currentTime` after `seekDone`, not the requested timestamp. Playback must be explicitly resumed after seeking, buffering or audio interruption. After completion, Rewind returns to zero; press Play once ready. Backgrounding or surface destruction releases the source; reopen the file to continue. Layout branches share one video surface, but real-device rotation, multi-window, interruptions and automatic-directory access still require testing. Video playback does not advance from a synthetic timer; stale observations close the simulation gate.

The app keeps the selected read-only file descriptor alive until native player release completes. It requests no broad storage/media permission, copies no video and uploads nothing. The 0.6.0 changes have not yet been validated on a device or emulator; earlier 0.5.1 local testing is documented separately in USAGE_ZH.md.


### Axis script controls (0.5.1)

`ScriptViewModel.UpdateScript` evaluates and clamps interpolation, scales around the device default, clamps again, then inverts. The same order now applies to both preview and simulator samples. Curve/scale/inversion apply separately per axis. Edits pause playback; no edit opens the output gate. The UI starts with upstream PCHIP, while the pure engine retains its existing linear default for backward compatibility. Per-file settings reset on load; original persistent device-axis configuration is not implemented. Default TCode movement axes center at 50 and V/A auxiliary axes at zero; arbitrary custom profiles are not supported.

This ports the script-value transform only. Upstream gap/end-of-script state, synchronization transitions, motion blending, bypass, limits and auto-home still require the full original state pipeline. Current endpoint-holding preview behavior is unchanged and must not be described as complete output equivalence.

### Constrained build runners

`tools/build.sh` uses the official `hvigorw` wrapper by default. If the runner's global wrapper cache is not writable, use a writable application-local tool home and `HVIGOR_DIRECT_CLI=1`. This invokes the same already-installed official Hvigor JavaScript entry, with temporary links to its installed vendor packages; it does not modify the SDK, install a substitute compiler, or alter filesystem permissions.

```sh
export HARMONY_TOOLS_HOME=/path/to/command-line-tools
export HOME="$PWD/.tool-home"
export HVIGOR_USER_HOME="$HOME/.hvigor"
mkdir -p "$HVIGOR_USER_HOME"
HVIGOR_DIRECT_CLI=1 bash ohos/tools/build.sh
```

The directory layout of the selected SDK is checked; a missing vendor entry/package is an error, not an automatic download. Use the supplied SDK's Node runtime. New native recording declarations are a local file dependency. Normal DevEco workflows may resolve them with official `ohpm install`; the isolated fixed-SDK smoke build resolves the project metadata directly. Both methods still require an actual compile/package check.
