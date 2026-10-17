# 0.10 runtime-control integration contract

## Explicit safe rebuild

The always-reachable control is a separate runtime operation, not configuration recovery acceptance. It immediately stops/disarms output, invalidates pending source/seek/selection operations, clears scheduled media requests and closes native media. It then replaces AxisPipeline, MotionRegistry, DeviceRegistry and epoch; no faulted instance is reused. Active persistent settings and pending restart-profile choice remain unchanged. Scripts and independently loaded Looping resources are cleared; no automatic rescan/reload/play/connect/arm occurs. Existing native-output close quarantine is never reset or bypassed. New runtime identity requires an explicit output Apply/Connect and Arm.

This operation is allowed in settings read-only mode because it changes only volatile state. It never accepts damaged-settings recovery or rewrites unknown-schema files. Native cleanup failure remains visible, leaves output stopped and blocks starting another source. Repeated clicks serialize; Stop/background/source replacement while awaiting cleanup revoke continuation.

## Standalone no-media Motion

A dedicated user Start action disconnects Internal and closes native video, clears media bindings, then starts the ordinary paused pipeline with media position NaN and no media duration. It does not synthesize play or a media observation. Existing provider configuration is not silently enabled or edited. At least one enabled axis must have a selected provider, no Motion bypass, and both UpdateWhenPaused and UpdateWithoutScript configured; actual follow/blend/provider evidence may still make its output unavailable.

The mode is preview/processing only. Physical output requires the separately applied target, explicit Arm, fixed-update scalar authorization, enabled-axis scope, allowPausedMotion and a real current provider sample that survives the final pipeline. A held provider cache cannot create pausedMotion permission. AutoHome remains an independent configured stage/target policy; a prospective event cannot authorize a fixed scalar. No arbitrary source file is read: Looping remains limited to explicitly loaded current managed resources.

A volatile processing admission is independent of media's playing/paused enum. Default/Stop/background/disconnect/fault have no processing admission. Generic pause or late native callbacks cannot re-enable it. Explicit source load/open, valid Internal selection/Play, or standalone Start can admit processing. Stop closes the gate, clears standalone admission and requires a fresh explicit start; foreground return, reconnect and configuration edits never acquire Arm or standalone permission. Pure numerical paused ticks remain source-equivalent and are not themselves authorization.

## Verification matrix

- Start from empty/NaN source with Pattern/Random/Custom/authorized Looping, compare values with the unchanged direct paused AxisPipeline.
- Reject no eligible configuration, invalid provider/unknown cache, zero/irrelevant target scopes and forbidden paused policy. Preserve no-IO resource limits and persistence/read-only barriers.
- Real Index Start → Core current frame → MemoryTransport target requires explicit Apply/Connect/Arm; no initial arm/no current frame/no fresh sample means no write.
- Stop → pause/native callback/config edit/timer/reconnect remains closed; explicit new Start never restores prior physical Arm. Background/disconnect/fault/rebuild tests also cover queued candidates and late receipts.
- True unknown scalar history recovers only through explicit full rebuild plus separately loaded valid resources; immutable old frames cannot acquire the new registry/epoch.
- Controls remain in parent-owned source settings in narrow/wide layouts, with touch-sized buttons and guarded callbacks. Device visual/touch and physical execution remain unverified.

Native-window presentation is connected through an independently tested owner-token adapter; see WINDOW_PRESENTATION.md. File recording is outside this candidate integration scope.
