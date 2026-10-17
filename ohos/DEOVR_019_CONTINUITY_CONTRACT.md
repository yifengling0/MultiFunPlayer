# 0.19 ordinary DeoVR control continuity contract

Status: implemented and independently reviewed; final aggregate and immutable artifact identity are recorded in VALIDATION.md. The immutable0.18 candidate is unchanged. This stage covers ordinary Play, Pause and Speed; source/path/seek changes do not inherit this permission. No real endpoint/device, File-recording work or Git write is authorized by this contract.

## What can be established

The original protocol has no command ID, correlated ACK, server timestamp or sample sequence. Neither local write completion nor a later matching value proves that the player executed our command. A packet buffered in TCP can still be old at the server even when first received locally later. This contract establishes only a narrowly bounded, mutually compatible sequence of subsequent observations under the same admitted source. It never calls that a remote acknowledgement or invents a new Arm.

The existing sticky current-resource playerStateValid/speedValid fields are insufficient. New evidence must record exact fields present in each actual decoded packet, packet sequence, connection/resource identity, canonical100ns position, first/last receive ingress IDs and original receive times. Fragmented headers/bodies, coalesced frames and opening buffers retain first-byte provenance. Ordinary field events/cache semantics remain unchanged.

A local dispatch boundary is recorded immediately at the actual transport.send invocation, after any queue/heartbeat wait. It contains command identity, generation/resource, packet/ingress floors and local monotonic time. It is not a receipt/ACK. Callback cancellation is rechecked before sending; there is no await between boundary and send invocation. A frame whose first bytes predate this boundary cannot be used, even if it completes later. Send success is never input to state eligibility; send failure cancels.

## Capture and subsequent observations

1. Begin only under a currently admitted, foreground, connected, fresh, healthy DeoVR source with current owned bindings, raw state0/1, no pending seek/reload/control and an already-published current frame. Capture source identity/generation, remote connection/resource, epoch/profile/configuration, control token and start frame/observation. The output owner captures only its existing explicit Arm, connection/configuration/application identity and exact target scope. No existing Arm means no retained intent.
2. Immediately suspend candidates using the existing gateRevision invalidation. Clear latest/fixed/polled queues; late receipts cannot update dirty/completed-write state or pump stale candidates. A partial accepted stream write can fault during suspension, so recheck Arm/connection afterward. Do not call arm() later to recreate intent.
3. Before matching observations, the local dispatch boundary must belong to this exact command/source/resource. Require two distinct subsequent packet sequences in distinct receive ingresses, strictly increasing receive times, after both packet and first-ingress floors. No arbitrary minimum player cadence is asserted. Snapshot reads, heartbeat, duplicate/coalesced timestamps, cached optional fields and command completions cannot satisfy the pair.
4. Play: both packets explicitly raw state0; canonical second position exceeds first and the starting observed position. Pause: both explicitly raw state1, canonical positions equal. Speed: both explicitly equal the finite requested speed and the exact starting raw state0/1; playing positions advance as for Play, paused positions remain equal. Same-speed requests still require new evidence. Any later contradictory/missing evidence before frame publication invalidates or restarts the candidate; it cannot be laundered through old cached fields.
5. Deadline is at most5seconds from begin, without extending existing750ms received/playing-stall freshness. Current clock checks use actual monotonic now, including when no UI tick occurs. Backward position/unexpected seek, malformed/fault/reset, resource/epoch/profile/config/scope/connection change, Stop/background/disconnect/cancel/error/timeout permanently revoke that transaction's retention. Overlapping unfinished ordinary commands do not transfer Arm; use the conservative0.18 behavior.
6. Observation is not frame publication. Dispatch needs a genuinely newer complete pipeline frame carrying the exact current control token and published evidence packet sequence. Existing scalar/event provenance, source-revision, update-kind, target-scope, freshness and per-intent permission checks remain mandatory. No new or retagged frame is created by the command or an observation callback.

## Pause parking

After matching Pause evidence and a new fully validated known frame, retain existing Arm as explicit “paused waiting, no output” when the frame has no activity or the target does not allow the paused intents. Parking never authorizes a scalar/event, never blesses unknown lineage and keeps all candidates empty. A valid new Home/Motion frame may submit only under that target's existing separate permissions; Fixed and Polled retain their separate proof rules.

Parked retention remains bound to the same source/resource/epoch/profile/config/target/connection and fresh explicit raw state1 observations, with an independent expiry check. Stale/error/revoke/contradictory state cancels it. An unsolicited remote Play cannot release parking. A new explicit local Play may capture the already-existing parked Arm, then must satisfy its own observed-state and new-frame checks. Restoring settings, reconnecting, pressing Set, or a packet alone never recreates Arm.

## Clock and scripts

For an eligible continuity transaction, do not optimistically pause the media tracker or reload already-owned scripts on send completion. Numerical state continues to follow actual original source events and the unchanged tracker. If current source/bindings/field evidence cannot satisfy the contract, retain0.18's disarming path. Seek/Path/AB/AutoSkip always revoke Arm; no native seekDone or matching position is accepted as DeoVR ACK.

## Required tests before acceptance

- Positive Play/Pause/Speed and same-speed cases with actual source/core/coordinator, independently armed and unarmed targets, Fixed/Polled, pausedHome/Motion permission combinations and paused parking→explicitPlay.
- Partial pre-boundary frame, coalesced burst, cached fields, duplicate timestamps/positions, delayed old chunks/opening buffers, invalid/raw-other pause states, contradictory later observations and unexpected position jumps.
- Queued command behind heartbeat, overlapping commands, synchronous cancellation in dispatch callback, old/new command failures, timeout with no tick, stale parked state and unsolicited Play.
- Fixed/polled candidate and dirty cache clearing, late full/partial write receipts, removed/recreated target, scope/permission/config/profile/epoch changes, Stop/background/disconnect/reconnect never autoArm.
- Actual Index/controller touch and keyboard routes, visible waiting/timeout/fallback state, original numeric/C# regression, independent review, full actual-.NET aggregate, official clean SDK and immutable evidence archive.

Remaining unavoidable boundary: locally coherent delayed server samples have no timestamp with which to prove server freshness or command causality. This limitation is explicit; real-player interoperability remains untested. No unsupported source/field/state receives inferred permission.


## Implemented refinements verified during independent review

After the first proved observation pair is consumed by a genuine pipeline step, compatible later packets do not invalidate the still-current immutable frame. Authorization retains that frame's original observation time; reading a newer packet never freshens an old frame. This avoids resetting a fixed scheduler on every receive callback. Pending and parked leases independently expire within750ms of real clock/source proof, and pending also has the absolute5s deadline. Renewing an already parked authorized paused frame does not clear that frame or restart its scheduler.

Any source diagnostic, including recoverable malformed JSON, immediately revokes output retention; subsequent good packets never recreate Arm. Raw original player states other than0/1 preserve their numeric nonzero-paused event interpretation, but receive no dispatch permission. Unsupported/missing/malformed evidence remains visible and fails closed.

Connection shortcut ownership is separate from media control retention. Endpoint edits disarm and save an inert draft; current sockets do not silently migrate. A connected Connect command is inert, and any new connection starts unarmed. Pending shortcut connection completion belongs to one exact target generation, draft revision, page/foreground and keyboard/touch dispatch owner. Cancellation may close only that owned request, never a newer manual connection.
