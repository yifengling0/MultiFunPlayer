# Independent review: DeoVR 0.19 control continuity

## Decision and scope

**The design below is acceptable for implementation and adversarial testing. It is not a production-code, HAP, real-player or physical-device acceptance.** The only proposed relaxation of 0.18 is retaining an already explicit, target-bound Arm across eligible ordinary Play, Pause and Speed controls. Retaining Arm is not permission to send while a control is unresolved.

Review performed against the retained original C# source and the 0.18 OHOS source on 2026-10-16. No production files were changed by this review. The two executable probes described below used in-memory transports and fake clocks; no real network, player, physical device, File recording or Git operation was used.

The parent and reviewer aligned on two separate incoming observations with strictly increasing local receive times and distinct ingress chunks. There is **no added 40 ms minimum**. The maximum control deadline is 5 seconds; existing 750 ms receipt freshness and playing-position stall limits remain independently binding and can revoke eligibility earlier.

## 1. What the original source can and cannot establish

Original anchors, relative to `Source/MultiFunPlayer/MediaSource/ViewModels/DeoVRMediaSource.cs`:

- Lines 94–171 read framed observations. Path is required; optional state, duration, position and speed are cached independently. Changed fields publish events in that order. Repeating an equal field produces no changed-field event.
- Lines 134–138 map raw state 0 to playing and every other accepted integer to not playing. This does not establish that arbitrary values such as 2 or -1 mean an ordinary pause.
- Lines 173–228 serialize commands. Play sends raw state 0, Pause sends raw state 1, and Speed sends its requested scalar. A successful write is a local transport completion.
- There is no command ID, remote sample timestamp, resource-instance ID or correlated acknowledgement in the protocol. The keepalive is not a sampled-state request.

Therefore the proposed feature may describe only **compatible subsequent observations of the same source**. It must never claim that an observation was caused by a command, that the server sampled it after the command, or that the player/device acknowledged the command. Two observations, TCP ordering and a local dispatch marker cannot close that protocol gap. Bytes delayed in the remote host, network or operating-system buffers can remain indistinguishable from newer server samples.

Seek, Path and source/resource replacement remain outside continuity. Every explicit remote seek, including AB/AutoSkip/shortcut routes, permanently revokes the previous Arm. A later plausible position does not restore it.

## 2. Confirmed 0.18 evidence gaps

### A. Sticky field validity is not per-packet evidence

`DeoVrMediaSource.ts:289–315` sets `playerStateValid` and `speedValid` when their fields occur, but does not clear them when a later packet omits those fields. `receiptSequence` advances for a valid currentTime even when state and speed are absent. These semantics correctly track current-resource evidence but cannot establish what the newest packet contained.

An executed in-memory probe first supplied a complete packet with state 0, speed 2 and position 1. It then supplied only `{ path, currentTime: 1.1 }` at local time 110. The actual snapshot returned:

- receiptSequence 2 and observedAtMs 110
- playerState 0 and playerStateValid true
- speed 2 and speedValid true

Reusing those sticky flags to resolve a control would incorrectly combine a new position receipt with old state/speed evidence.

### B. Completion time alone cannot reject a known pre-control partial frame

`DeoVrFrameDecoder.push()` currently returns only payloads. `DeoVrMediaSource.received()` gives a completed frame the timestamp of the chunk that completed it. It does not retain the ingress identity of the frame's first byte.

An executed in-memory probe supplied all but the last byte of a complete state/speed packet at time 120, invoked a same-speed command at time 130, and supplied the last byte at time 140. The actual source advanced receiptSequence from 2 to 3 and reported observedAtMs 140. Thus a packet-sequence and completion-time floor alone would admit a frame known locally to have begun before the control.

These were direct executions of the 0.18 source classes, not inferred test expectations. The probes did not modify or persist a test file.

## 3. Required observation and dispatch provenance

Keep the existing sticky validity fields and original changed-event semantics unchanged. Add detached, immutable per-packet observation evidence alongside them:

- monotonically increasing complete-packet sequence
- source connection generation and resource revision
- exact path identity
- nullable fields that were actually valid in this packet: raw playerState, canonical position and raw speed
- frame first-ingress sequence and first-receive timestamp
- completion-ingress sequence and completion-receive timestamp

Canonical position is the existing TimeSpan-equivalent position used by the source. A raw double increase that quantizes to an equal canonical position must not count as media progress. Never compare progression against an extrapolated tracker position.

The observed decoder path must preserve first-byte provenance across fragmented headers, fragmented bodies, multiple coalesced frames and buffered opening chunks. Opening buffers keep their original ingress/timing; processing them after connect must not create new receipt times. The existing payload-only decoder API can remain a compatibility wrapper.

An optional source-owned local dispatch callback for Play/Pause/Speed runs at the actual `transport.send` invocation boundary, not on enqueue and not on send completion. It identifies local command ID, source generation/resource, packet floor, ingress floor and local time. No await separates capture from the send invocation. After the callback, the source rechecks current entry/resource ownership before invoking the transport, because a synchronous callback can revoke admission.

This marker is only a local chronology barrier. A queued command cannot use observations that arrived before its own dispatch boundary. A frame with first-ingress at or below that boundary's ingress floor is ineligible, including a later frame in the same already-received coalesced chunk. Public UI values, command receipts and caller-constructed objects cannot fabricate observation or dispatch evidence.

## 4. Transaction capture and isolation

Before eligible control work begins, require a currently admitted, foreground, connected, fresh and ready DeoVR resource, no pending script binding/reload, no source fault and no pending seek. Evaluate freshness against current monotonic time, not merely the core's last tick time.

The immutable control identity binds:

- monotonically increasing control token and local command identity
- application source identity/generation and remote connection generation/resource revision
- current raw path, epoch and protocol profile revision
- current processing/configuration/control revisions
- starting packet/position/state evidence and real source-frame sequence
- local dispatch boundary and maximum deadline

Each output target separately captures only its own existing Arm, connection generation, applied configuration identity, exact enabled-axis scope and source binding. Targets unarmed at the start stay unarmed. A target added, reconnected, reconfigured or explicitly disarmed later cannot inherit this capture. Selection changes do not transfer permission between targets.

Immediately and synchronously close candidate admission before any asynchronous command work. Clear latest fixed frame, pending fixed work and polled queues through the existing session suspension path. Recheck Arm/connection after suspension: invalidating an already accepted partial stream can fault and close the target synchronously. Never restore retention by calling `arm()` internally.

Only one unresolved control may retain intent. Unresolved includes waiting for observations and waiting for the first complete published frame. An overlapping unfinished control revokes retention and falls back to 0.18's explicit-rearm behavior. A completed, currently valid paused-parking state is different: it may be the starting state for a later explicit Play or paused Speed transaction.

An enrolled queued control also retains its enqueue resource identity. The 0.18 queue stores only bytes, so a queued control for resource A can otherwise dispatch after A changes to B. Reject such a stale enrolled command before sending it to B; rejecting its continuity boundary alone would prevent Arm transfer but would still send an obsolete control. The resulting late rejection must not let A's old UI catch handler stop B. The retention deadline begins at initial capture and is not extended by time spent queued or by a later dispatch callback.

## 5. Exact compatible-observation conditions

All controls require two complete valid-path packets from the exact captured generation/resource/path, after their own dispatch boundary. Both packets must have eligible first-ingress provenance and packet sequences above the boundary floor. Their completion ingress identities differ and the second receive timestamp is strictly greater than the first. Both remain within freshness and the transaction deadline. They cannot be synthesized from separate partial packets carrying different fields.

Both observations must also be compatible with the unchanged captured source/epoch/profile/configuration, existing valid positive duration and in-range position. Any detected seek/epoch change cancels retention. A contradictory later observation before publication invalidates the candidate pair.

Use the core's existing tracker/epoch mechanism for detected forward jumps. Do not infer a maximum permitted server motion distance from local receive intervals: those are not remote sample intervals. Pure evidence may conservatively reject backwards canonical positions without changing original numerical events.

| Control | Required fields in each packet | Pair requirement |
| --- | --- | --- |
| Play | raw playerState exactly 0; valid canonical currentTime | Second canonical position is greater than the first and greater than the captured starting position. |
| Pause | raw playerState exactly 1; valid canonical currentTime | The two canonical positions are equal. This is conservative evidence of a stable paused observation, not an acknowledgement. |
| Speed while playing | raw playerState exactly the captured state 0; exact requested valid speed; valid canonical currentTime | Position advances as for Play. |
| Speed while paused | raw playerState exactly the captured state 1; exact requested valid speed; valid canonical currentTime | The two canonical positions are equal. |

Speed retention is unavailable when starting raw state is neither 0 nor 1. A same-speed command still needs two new matching observations; cached equality is never sufficient. State 2/-1, absent state, absent position, absent speed for Speed, mismatched speed, equal playing positions, duplicate snapshots, changed-field event counts and transport completions do not satisfy the respective conditions.

Do not optimistically change observed position/state/rate for eligible transactions. Candidate admission is suspended separately while the original received clock and numerical pipeline continue to consume real observations. Do not reload already-ready same-resource scripts as a side effect of a successful command write. A genuine script/resource reload needing different ownership falls back conservatively.

## 6. A compatible observation is still not an output frame

After the second eligible observation, retain zero candidates until a genuinely subsequent complete pipeline step publishes a new frame:

- source-frame sequence exceeds the captured starting frame
- frame epoch/profile/configuration/control identity remains the captured identity
- publication records the exact current control token and accepted observation sequence
- the frame was produced after consuming that observation, rather than retagging an earlier frame
- enabled axes and their full dependency lineage pass the existing provenance validation
- target intent, update kind, clock kind and freshness still pass normal authorization

The current `publishedRemoteObservedAt` timestamp alone is insufficient to establish which same-time packet a frame consumed; publish observation-sequence/token evidence as well. Pending controls must not be represented as native `OutputSeekTransition` confirmations.

## 7. Paused parking

Parking retains the previously captured Arm while admitting **no output candidate**. It is available only after the Pause/paused-Speed evidence and a new actual frame have passed the source identity and complete known-provenance checks above.

- A validated all-held/no-activity paused frame can park.
- A valid paused activity frame whose intents are not permitted by that target can park without sending.
- A real authorized paused AutoHome/Motion frame can send only with that target's existing explicit permission and normal fixed/polled rules. Polled output still consumes only real eligible events; manual-transition permission is not inferred.
- Unknown scalars, unknown/dead dependencies, missing/currently stale frames or a generic `pendingCurrentFrame` result are not parking proof and cannot be relabeled as a known paused activity.
- A dedicated retain-only parking admission/reason must be separate from `DispatchAuthorization`. Parking does not authorize bytes and cannot be submitted as a frame.

While parked, maintain the exact captured source/target/epoch/profile/configuration/scope, admitted foreground state, current-resource paused evidence and normal receipt freshness. Any source/target revocation, incompatible state, source staleness or other cancellation below removes the retained Arm. An unsolicited remote Play cannot release parking; a new explicit local Play transaction must establish its own observation and frame conditions.

Use current-clock checks and an independently owned expiry mechanism for pending/parked retention. An empty candidate queue has no write deadline, and core monotonic time advances only on a tick; neither fact may allow stale parking to survive indefinitely.

## 8. Queue and receipt safety

Reuse `OutputSession.clearCandidates()` rather than introducing a weaker queue reset. In 0.18 it increments gateRevision, clears fixed/polled candidates, and closes on an invalidated confirmed partial stream (`OutputSession.ts:497–503`). After an old receipt, `sourceValid()` prevents stale completion from updating the successful dirty-value cache or completedLocalWrites (`475–488`). An overdue receipt remains an error even when its source is obsolete.

Bytes already submitted cannot be recalled. Retention must not claim the physical device has stopped. A late complete receipt may still contribute truthful local byte accounting, but it must not reopen admission, update current successful-source cache, mark the control observed or complete a newer control. A late partial receipt closes the stream before any new command can follow it. No blind replay or retry follows uncertain acceptance.

All command/status/error/timeout callbacks must be guarded by exact owner generation and control identity. Old callbacks cannot rematch scripts, change current status, restore a revoked Arm, or affect an unrelated newer owner. No send promise resolution changes the observation state machine.

## 9. Permanent cancellation and retained 0.18 behavior

Permanently cancel captured continuity on Seek, Path, changed resource/source/generation, detected seek/epoch change, Stop, background, view/Ability destruction, source/target disconnect, fault/error, invalid clock, timeout/stall, target removal/replacement, relevant profile/configuration/scope mutation, explicit disarm or overlapping unresolved control. A target-specific failure remains isolated from unrelated targets unless existing owner policy requires a shared stop.

The 5-second control ceiling never overrides the 750 ms source freshness/stall gate, output frame/event deadlines, partial-write safety or close quarantine. A late matching packet cannot resurrect expired/cancelled retention. A new explicit Arm remains necessary after cancellation.

Keep 0.18's conservative path whenever starting readiness, exact provenance, observation pair, real current frame, command ownership or target-bound capture cannot be established. Existing source connection, output connection and explicit Arm remain separate. Source restoration/reconnect and receipt of valid packets never create Arm intent.

## 10. Required implementation verification

The independent production review must cover the real source → core → output owner/coordinator/session → Index touch/shortcut routes, not only new helper classes. At minimum:

1. Two compatible observations and an actual subsequent frame for each eligible Play/Pause/playing-Speed/paused-Speed case; two targets with different paused permissions; unarmed targets stay unarmed.
2. Missing/invalid fields, sticky-cache substitution, same-speed command, state 2/-1, duplicated snapshots, repeated sequence/time, equal playing positions, unstable paused positions and mismatched speed.
3. Delayed old packets, pre-boundary partial header/body, same-chunk coalesced packets, buffered opening packets and queued command dispatch. Explicitly demonstrate the remaining unresolvable server-timestamp limitation.
4. Matching first/second packets followed by a contradictory packet before the frame; repeated core reads and zero-time ticks cannot manufacture the required new frame.
5. Command overlap before send, during observation wait and during frame wait; completed parking → explicit Play is not overlap; timeout and stale-source expiry survive missing UI refresh.
6. Pending and parked Stop/background/disconnect/error/source/path/seek/profile/config/scope changes, target replacement and explicit disarm, followed by late packets/callbacks.
7. Fixed/polled queues clear synchronously; deferred full/partial/overdue output receipts do not revive candidates or dirty caches; partial streams close and remain quarantined where close is unconfirmed.
8. Parking with all-held known data, disallowed genuine paused activity and allowed real AutoHome/Motion; unknown lineage, disabled-scope dependencies and absent current frames never gain authorization.
9. Existing .18 framing/event/wire fixtures, script matching/authorized catalog boundaries, Seek/Path permanent disarm, no-auto-arm and native/source lifecycle tests remain intact.

No fixture pass should be reported as real DeoVR interoperability or physical-device verification. Those remain separate gates.

## 11. Independent implementation review, 2026-10-16

The reviewer inspected the source-owned observation/dispatch branding, decoder ingress provenance, bounded evidence helper, core admission/publication, output coordinator/session retention, and actual Index ordinary-control routes. Production files remained read-only. The reviewer added adversarial cases to `tests/reviewer-deovr-018.test.mjs` using its real source/core/output/Index harness and memory-only transports; no earlier negative assertion was weakened.

The source/evidence layer preserves the original sticky validity and changed-event behavior. Genuine immutable observations and dispatch boundaries are privately branded to their source instance and exact command kind/speed; caller-created clones and another source with equal numeric IDs cannot satisfy the proof. Dispatch rejection revokes the boundary before any transport send. Queued resource-A user controls reject after resource B replaces A, without sending to B or faulting its live connection. The helper's initial raw-change timestamp is safe only in composition with the core's required canonical `remoteClock.ready(actualNow)` prerequisite.

Two independent end-to-end regressions were found, reproduced, reported and fixed:

1. A completed playing control was incorrectly returned to transaction-pending on the next incoming packet, permanently disarming its already-resumed target. Completion and freshness of a pipeline frame are now distinct. First completion still requires the observed pair and a genuinely subsequent frame.
2. Every new paused frame restarted the independent Fixed scheduler. A 200 ms target receiving legitimate paused Motion frames every 50 ms sent nothing. Authorized parked renewal now preserves the running cadence; retain-only/no-permission parking still clears candidates and stops it. Subsequent compatible same-source packets do not discard an otherwise valid immutable frame solely because the newest packet has not been consumed by another tick. Its original publication/observation timestamps and ordinary age limits remain unchanged. Source readiness uses actual callback/current time rather than a core tick time predating the incoming observation.

The raw-state boundary is deliberately narrower than the original numerical mapping: only raw state 0 or 1 can authorize output. Raw 2, -1 or any other unsupported state immediately invalidates dispatch, including after a completed active control. The original numerical nonzero-to-paused mapping and tracker remain unchanged; a later supported state cannot automatically restore the revoked target Arm.

An independent five-file run passed 283/283 tests before the final parse-error regression was added. It covered the source/evidence helper, core/session integration, output retention, existing provenance dispatch, and 13 new Index cases. The new cases exercised completed-control packets, slow paused output cadence, pre-dispatch fragmented data, overlapping queued controls, old deferred output receipts, separate target permissions, paused same-speed controls, pending/parked expiry without UI ticks, and zero-elapsed/read-only frame attempts. Four provenance cases intentionally fault-injected an unknown origin or a disabled-axis unknown dependency into an otherwise real pipeline frame; both Fixed and Polled rejected parking, with no bytes or automatic recovery.

A third error-cancellation gap was found and fixed: after a completed active control, a malformed source packet cleared the last observation and removed the completed lease, but the old normal-frame/clock path retained Arm. The core now denies dispatch while a source diagnostic exists, and Index immediately stops output on a source diagnostic. A later valid packet does not automatically restore Arm. The reviewer independently reran all 14 new Index cases after this fix: 14/14 passed.

**Independent continuity implementation review: no remaining blocking finding in the reviewed source/core/output/Index paths.** This is code and in-memory behavioral acceptance only. It does not certify a built HAP, real-player protocol interoperability or physical output behavior. Later, unrelated output-connection shortcut work is outside this continuity signoff.

## 12. Separate review of six output endpoint/connection actions

The parent separately authorized read-only review of `executeOutputConnectionAction`, owned connection lifecycle, shortcut catalog/validation and the six original-site aliases, plus new `tests/reviewer-output-019.test.mjs`. The reviewer added 13 independent cases. They and the implementation's 10 Index connection cases passed together: **23/23**.

Verified behavior:

- TCP/UDP/WebSocket canonical endpoint no-ops and Connect on an already-connected target preserve its existing Arm without new transport work.
- Endpoint edits synchronously disarm, preserve the established socket's destination, invalidate draft application identity, and persist inert preferences. Explicit reconnect uses the new destination and remains unarmed. An edit during opening retires that opening operation; its late completion cannot apply the newer draft.
- A genuine multi-action keyboard dispatch captures target generations before awaiting. Removing and recreating the same textual ID does not transfer its queued Connect action.
- Stop, focus cancellation, background and disappearance defeat a genuinely deferred memory transport open. Failed close remains quarantined against Connect/Toggle replacement.
- A stale Index continuation/cancellation cannot disarm or close a newer explicitly connected target. This case injects a legal superseding operation at the connection promise boundary to exercise the ownership race deterministically.
- Disconnected Disconnect and invalid endpoint actions do not affect another armed target. A persistence failure is reported and leaves the edited target disarmed, with the old socket retained and no reconnect.

**No remaining blocking ownership finding in these six reviewed actions.** The tests use memory-only destinations and inject lifecycle/storage failures; no real endpoint, device or File output was exercised. Build/signature/runtime-device acceptance remains the release owner's separate responsibility.
