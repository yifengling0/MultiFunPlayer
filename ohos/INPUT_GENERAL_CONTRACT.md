> Historical 0.12 input/General baseline. Its trigger/lifecycle contract remains active; 0.13 action coverage, parameter domains and current limits are recorded in [SHORTCUT_ACTIONS_013_CONTRACT.md](SHORTCUT_ACTIONS_013_CONTRACT.md) and [ACTION_COVERAGE_013.md](ACTION_COVERAGE_013.md). Older 22-action/offset-limit statements below describe 0.12.

# 0.12 local keyboard, touch commands and General contract

The complete source inventory is in INPUT_GENERAL_SOURCE_AUDIT.md. The original shortcut list starts empty; this port does not silently install a collection of invented default bindings. Original Windows-global RawInput, XInput/TCode input, toggle/axis gesture types and all 188 registered action templates are not claimed as implemented by local keyboard support.

## Input and dispatch

- Persist bounded ordered keyboard mappings and ordered typed action lists. Implement original button Press/Release repeat behavior, delayed Click counting and Hold release/while-held boundaries. Restore no pressed keys, timers, pending captures or in-flight action state.
- Handle only keys delivered to the foreground active application. Input editing/IME, shortcut editor/capture, configuration changes, Stop, view removal and background cancel transient state. Held keys must be released before regaining eligibility; returning foreground cannot execute an old delayed action.
- F12 is an explicit OHOS emergency Stop addition, available before input-method handling and independent of configurable mapping enablement. It invokes the existing global Stop path, including every output target. It does not replace hardware/device emergency-stop protection and cannot intercept keys the OS does not deliver.
- Exact key-set matching and original first-key-up release behavior are explicit. Mapping invocation owns a token; ordered actions execute only while current, and a cancellation between actions prevents the remainder. Pending click/hold uses the existing monotonic update loop, with no background shortcut timer. A mapping cannot re-enter until its actions complete.
- Touch commands invoke the same validated dispatcher. No shortcut can Connect or Arm physical output. Media play/pause/seek, script offset, chapter/bookmark, sync, Internal navigation/AB and window actions use existing real control paths and their safety gates. Unimplemented actions are absent from the selectable action catalog, rather than accepted no-ops.

## General

Only real presentation preferences are exposed: automatic/vertical/horizontal workspace organization and None/Dialog/Snackbar error notifications. Auto responsive layout is an OHOS default divergence from original Vertical; horizontal preference falls back when available pane dimensions cannot preserve usable content. It never rotates the OS, resizes a system window or recreates the video Surface. General changes persist without altering numeric axis configuration or acquiring output intent.

None suppresses optional error notifications, never persistent safety/fault/readonly/close-quarantine indicators. Dialog is serialized, deduplicated and lifecycle-owned; Snackbar uses a visible transient in-app notification. Both derive from real reported failures, not arbitrary native exception strings or endpoints. Six desktop General settings (AlwaysOnTop, AllowWindowResize, RememberWindowLocation, NLog level, UI logging, JSON logging) remain explicitly unsupported, without no-op switches.

## Evidence and boundaries

Required: source-derived trigger tests, strict additive schema tests, actual page/field focus and pre-IME Stop controller tests, delayed/cancel/late callback and action-order tests, touch/keyboard equivalence, narrow/wide layout geometry, actual SDK build and immutable source/HAP hashes. No physical output connection or phone/tablet/PC visual/keyboard-device test is inferred from mocks.

The authorized Download catalog remains the media entry. No folder chooser or individual video import is restored. File recording specialist review stays blocked and is not retried through another route. Git publication remains paused.

## Reviewed timing, ownership and intentional limits

The action runner is one sequential cancellable worker across mappings as well as within each mapping. F12 bypasses an awaited action immediately. Stop retires the worker token and pending queue; a subsequent explicit command does not wait forever for an obsolete native operation. Already-submitted native calls cannot be undone, but existing media/source generations and desired-play gates prevent a canceled late completion from publishing/resuming. Owned `[Next, Play]` awaits script publication; external source changes cancel the invocation. Owned loads canceled by focus/settings require explicit reload rather than reusing old script identity.

All six native text fields observe bounded physical key-code down/up edges before IME consumption while the text context is inhibited. They never inspect keyText or retain typed text. Ordinary keys still return unhandled to the field; F12 alone is consumed. This is necessary to quarantine an IME-consumed key held across blur. Focus, change, submit and blur handlers capture a renewable editor identity; retired callback events cannot edit or blur a replacement field. Shortcut panel edits additionally bind exact configuration and lifecycle identity. Capture Apply/Cancel carry a separate host-checked session revision, including when a newer controlled prop has not arrived.

Original chapter/bookmark action IDs use the first available metadata collection, a media-position ±1.5-second search boundary, inclusive-next/exclusive-previous lower-bound semantics and raw marker time. They do not use the old selected-axis manual marker offset/pause path. Under valid accepted Funscript inputs, absent/empty metadata maps to original null; malformed all-negative metadata is rejected rather than preserving the original non-null empty artifact. Speed values within 0.01 of one snap to one, as upstream. This candidate bounds speed to 0.25–4 and script offsets to ±60 seconds; native AVPlayer may quantize rates to supported values. Arbitrary original action parameters, optional axis arguments and all 188 action templates are not claimed.

The capture editor offers explicit Apply/Cancel instead of upstream's automatic five-second dialog. Original timer callbacks could survive disable/editor/removal; this port deliberately cancels them. An abandoned smaller chord is canceled on superset release rather than left with a live hold timer. Unsupported physical keys inhibit configured dispatch instead of disappearing from the chord. These are documented safety/UI adaptations, not claims of unmodified Windows RawInput behavior.

The worker also tracks engine-internal cancellation, not only focus changes: unsupported keys and invalid time retire the old chain before a valid fresh invocation. Smaller-chord abandonment can invalidate only the active dispatch without changing the engine token; in that case still-valid queued mappings are transferred in FIFO order before the new invocation. A worker revision prevents old closures from replaying or completing those transferred leases, and active identity prevents an old finally block from clearing a replacement owner. Global Stop/context/settings cancellation still discards the whole old queue.
