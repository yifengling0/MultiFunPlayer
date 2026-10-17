# Native video window presentation (0.10 reachable integration)

## Supported behavior

The player remains one XComponent/AVPlayer with SCALED_ASPECT. This adapter never owns playback, orientation or video geometry.

- Floating and maximized main windows: attempt the public `maximize(ENTER_IMMERSIVE)` API. Report `native-fullscreen` only after `getWindowStatus()` observes FULL_SCREEN. This supports capable freeform/2-in-1 environments; a successful promise alone is insufficient.
- Exit from an originally floating window: `recover()`, preserving the OS's previous position/size. Exit from an originally maximized window: `maximize(EXIT_IMMERSIVE)`, never `recover()`.
- Phone/pad normal mode, split-screen, minimized/unknown mode, rejected operations and silent unsupported no-ops: report `in-window`. The page can still expand its video pane within the existing app window. This is **not a claim of native immersive fullscreen on all devices**.
- No guessed system-bar policy: public bar-property getters do not expose both enabled states. No hide-all/show-all reset, decor changes, forced rotation, orientation-lock override, or system-only APIs. Unchanged bars mean the existing safe content area is retained.
- A future app-owned mobile system-bar policy needs an explicit baseline design; it is not implemented here.

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
