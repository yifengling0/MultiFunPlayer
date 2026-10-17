# Native video window presentation (0.30)

## Supported behavior

The player remains one XComponent/AVPlayer with SCALED_ASPECT. This adapter owns window presentation, never playback/output.

- Floating/maximized desktop windows retain the observed maximize/recover transaction and OS hover escape.
- Phone/tablet fullscreen-window baselines request landscape, wait up to750ms for actual landscape geometry, then apply immersive layout and hide status/navigation bars. Rotation is settled before hiding bars because asynchronous rotation can restore them.
- Success requires observed layout, hidden status and landscape, not only fulfilled API promises. Unsupported/split modes, timeouts, rejected or silent no-op setters roll back and report in-window fallback.
- Restoration preserves the saved orientation/layout/status only while the controller still owns each setting. The SDK exposes no navigation-enabled getter; exit applies the documented app-visible navigation policy. External setting changes are not blindly overwritten.
- Fullscreen application chrome is separate: tap video to reveal; Back/Escape can exit hidden chrome. The Surface stays mounted and fills the same bounds when chrome hides.

## Integration contract

Import `NativeWindowPresentation` from `presentation/NativeWindowPresentation`.

1. EntryAbility `onWindowStageCreate`: await `attachStage(windowStage)` before/around loading Index. It obtains the actual `getMainWindow()` handle. It never searches for the last window.
2. Index: save the owner token returned by `setListener(result => ...)`; expose `result.mode`, `result.reason` and `result.restorationPending` truthfully. Enter/exit/retry use `requestForOwner(token, value)`. Page pane layout is separately owned by Index. On disappear call `releaseOwner(token)`. An old page cannot clear a replacement listener or change its fullscreen request. Leaving video/settings exits the page intent; a failed native restore remains visible in a global 48-vp retry overlay, even if settings/video are hidden.
3. `onBackground`: `setForeground(false)` queues restoration, including after an in-flight enter. `onForeground`: `setForeground(true)` keeps the windowed state; fullscreen requires a fresh user action.
4. `onWindowStageDestroy`: `destroyStage()` invalidates acquisitions, queued work and the destroyed handle. Do not attempt native restoration after destruction. Native subscriptions die with that window; generation checks ignore late callbacks. For a deliberate teardown while still alive, await `request(false)` first.

The controller serializes operations per stage, restores only observed changes while its applied state still matches, relinquishes restoration ownership on external mode changes, and never lets an unresolved destroyed-stage promise block a replacement. Failed restoration is reported and an explicit exit can retry if the original applied state remains. Native presentation cannot prevent an OS/user change during an already-issued asynchronous window operation; it checks the latest observable state and never forces a new fullscreen request in response to such a change.

## Validation

- `node --test tests/window-presentation*.test.mjs tests/window-ui-integration.test.mjs`: lifecycle coordinator plus real `.ets` boundary running with mocked SDK imports. Covers supported and unsupported modes, no-op/rejected/partial operations, original-mode restoration, rapid clicks, pending acquisition, background, destruction/replacement, old callbacks, and newer user settings.
- `MFP_SDK_TOOLS=/absolute/path/to/command-line-tools node tests/window-presentation-sdk-smoke.mjs`: isolated SDK26 unsigned HAP with actual EntryAbility/Index imports. Checks source-map reachability of both modules. This fixture is not the deliverable application. The 0.10 shipping Index/EntryAbility now also import this adapter; final whole-app SDK evidence is recorded in VALIDATION.md.
- Physical phone/pad/PC fullscreen, bar behavior, hover escape, rotation lock and video aspect still require device acceptance. Compilation and mocks are not device verification.

## Primary references checked against SDK26

[OpenHarmony Window API](https://github.com/openharmony/docs/blob/master/en/application-dev/reference/apis-arkui/arkts-apis-window-Window.md): `maximize`, `recover`, `getWindowStatus`, `setWindowLayoutFullScreen`, `setWindowSystemBarEnable`, `getWindowSystemBarProperties`, `setImmersiveModeEnabledState`, `getImmersiveModeEnabledState`, and `getWindowDecorVisible`.

[Window enums](https://github.com/openharmony/docs/blob/master/en/application-dev/reference/apis-arkui/arkts-apis-window-e.md): `WindowStatusType` and `MaximizePresentation`.

The SDK declaration and current public docs distinguish immersive layout from fullscreen window mode. `setWindowLayoutFullScreen` does not turn a floating PC window into fullscreen. `recover` returns to floating, not an arbitrary previous mode. `ENTER_IMMERSIVE` intentionally retains OS title/dock hover escape rather than disabling it.
