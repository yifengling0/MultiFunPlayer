# 0.11 multi-output and persisted target contract

## Source semantics and supported scope

Original OutputTargetViewModel selection changes only the visible editor. Each target owns connection, update context, ranges and send state. Add appends/selects the lowest available per-kind index 0–9; remove disposes that exact target. Items order and selected identity persist. No output clone/rename/reorder action is claimed. All targets share the active device profile; axis ranges and scheduling remain target-local.

This increment exposes the already implemented TCP, UDP and WebSocket target kinds, up to ten of each. It does not create implementations for the other original target types. Original automatic connection/retry is intentionally not executed: restoring, selecting and editing never connect or Arm. Only a per-target explicit Apply/Connect can open a transport, and separate per-target Arm can enable authorized dispatch.

## Runtime ownership

One application-owned collection retains every target coordinator, including unselected targets and unconfirmed-close tombstones. Selection never reuses another target's connection, dirty cache, queue or application identity. Global source refresh/seek/Stop/background/fault and active registry changes reach all targets. Scope and fixed/polled authorization are requested separately for each target. An already armed target may independently retain its own same-source seek intent; an unarmed target cannot gain one.

Remove immediately gates and disposes the exact target, including pending connect. It deletes the item only after original native closure is confirmed. Failure/pending close leaves a visible non-armable entry for explicit retry or process restart; an unknown generation or late callback cannot remove the tombstone. Selecting B while A connects does not relabel A's completion as B. A volatile monotonic target generation distinguishes a removed target from a later reuse of its kind:index ID; every panel edit/action and pending deletion captures it. A separate coordinator request token permanently cancels Apply across disconnect, disarm/edit, Stop, disposal and background, even if foreground returns before old close/open completes. Edits disarm only that target; safety controls remain available while readonly/busy.

## Persistence boundary

SettingsSchema v1 receives an additive outputs object: ordered targets and selectedTargetId. Per-target fields include kind/index, bounded credential-free endpoint, update context, paused policies and per-device axis ranges. Runtime connection/Arm, application IDs, source/profile epochs, native generations, pending work and secrets are excluded. Restoration creates inert coordinators only. Saved profile ranges preserve disabled axes; a new runtime profile revision clears application identity without resetting ranges to 0–1.

Host fields cannot contain URLs/userinfo, and WebSocket paths cannot contain query/fragment/token/authorization fields. There is no credential editor or ordinary-settings secret storage. Profile synchronization revalidates retained unfinished endpoints, and Apply checks the exact submitted endpoint/configuration against the current draft and generation. Invalid/unsafe draft text remains volatile and is visibly unsaved; it must never overwrite the last valid stored target. Unknown schema/recovery/read-only settings still block persistent edits and Arm. Output preference writes do not change axis configuration revisions or pause unrelated targets/media.

## Required evidence

- Two or more actual coordinators with different modes/scopes/ranges dispatch independently; selecting or editing one cannot retag/disarm another.
- Global Stop/background/profile/source invalidation clears every queue and rejects late receipts; all reconnects remain unarmed.
- Pending connect/remove/select races and close rejection retain exact ownership; no orphan socket or silent deletion.
- Cold settings restore, old schema defaults, bounded target counts, unsafe endpoint/secret/runtime field rejection, defensive copies and disabled-axis/profile range round trips.
- Actual Index controlled panel remounts and async target callbacks; all actions remain reachable with 48-vp touch targets on narrow/wide layouts.
- Original numerical/source tests, executable .NET oracle aggregate, official SDK clean HAP, source hashes and immutable recovery archive. No unknown physical target connections or device execution claim.

File recording remains out of this scope. Its blocked specialist review is not retried through another route.
