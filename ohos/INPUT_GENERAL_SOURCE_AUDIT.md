> Historical 0.12 input/General baseline. Its trigger/lifecycle contract remains active; 0.13 action coverage, parameter domains and current limits are recorded in [SHORTCUT_ACTIONS_013_CONTRACT.md](SHORTCUT_ACTIONS_013_CONTRACT.md) and [ACTION_COVERAGE_013.md](ACTION_COVERAGE_013.md). Older 22-action/offset-limit statements below describe 0.12.

# General, input and shortcut source audit for OHOS 0.12

Audit date: 2026-10-16. This is a source inventory and implementation contract, not a claim of device verification. Only this document was changed by this audit. No Git, network or physical-device operations were performed. Directory/video-import UI restoration is outside scope. File-recording specialist review remains excluded and was not retried.

## Implementation conclusions

1. WPF exposes **8 General settings**, **8 processor settings**, **10 shortcut trigger types**, and **188 built-in action registration templates**. The latter expand at runtime for media sources, motion-provider names and output instances; third-party plugins can add arbitrary actions. A source registration is not proof that an OHOS action is implemented.
2. The source has **no default shortcut bindings**: `Shortcut/IShortcutManager.cs:77–83` initializes an empty list. A convenient pre-bound keyboard scheme would be an explicit OHOS addition, preferably opt-in; do not describe it as the original default.
3. A useful first portable scope is foreground/local keyboard Button Press and Button Release plus explicit touch controls, with configured action arguments, enabled state and persistence. Click/hold can follow only with lifecycle cancellation. Mouse axes, joystick-axis drive, XInput, Windows global capture and TCode input require separate providers, not settings that merely appear active.
4. Route shortcuts through the same session/media/output command paths as normal controls. `Media::PlayPause::Set(false)` is pause, and `Media::PlayPause::Toggle` can resume playback. Neither is an emergency Stop. The original registration catalog has no universal Stop; OHOS's stronger Stop is an intentional safety extension.
5. Suppress repeated keydown by default; do not trigger playback while a text/numeric field, dialog or binding editor owns input. Clear pressed-key state and cancel pending click/hold/axis-repeat work on blur, background, capture entry, disable/removal, profile/source changes, Stop and teardown. Reject a stale delayed callback even if cancellation raced with execution.
6. Preserve source semantics where meaningful, not source bugs: source `Both` axis-threshold mode fires on non-crossing events; mouse Y uses X accumulation; removing/disabling shortcuts does not cancel timers. Details below.

All abbreviated source references in sections 1–6 are relative to `Source/MultiFunPlayer/`. The appendix gives exact repository-relative paths and registration line ranges. Current checkout source was read directly; no external SDK behavior is asserted.

## 1. General settings: complete inventory

All eight values are saved as **root JSON keys** using the exact property names below, not under a `General` object. `UI/Controls/ViewModels/GeneralSettingsViewModel.cs:106–139` is the save/load handler. Missing keys preserve initial defaults. `Bootstrapper.cs:41,224–226,246–253` uses `MultiFunPlayer.config.json`, loads on startup and writes on window close. Startup migration can also write (`Bootstrapper.cs:130–134`). Settings changes affect live state first; this is not a per-toggle durable-write contract.

| Root JSON key | Default / choices | Source and live effect | OHOS treatment |
|---|---|---|---|
| `AlwaysOnTop` | `false` | General VM:32,47–54; sets `MainWindow.Topmost`. Reapplied after window creation:142–146. View:15–23. | Window-system feature. Expose only with a verified implementation; unsupported should be visibly unavailable. |
| `AllowWindowResize` | `false` | VM:31,59–75; true = `CanResize` + manual sizing, false = `CanMinimize` + height-to-content. View:25–34. | Desktop-window feature; capability-gate. |
| `RememberWindowLocation` | `false` | VM:35; view:36–45; `RootViewModel.cs:64–87,107–151` chooses manual versus centered startup, saves last non-minimized `WindowLeft`/`WindowTop` and `WindowHeight`, bounds coordinates against virtual desktop. | Desktop-window feature; mobile persistence must not claim to restore arbitrary screen position. |
| `AppOrientation` | `Vertical`; `Vertical`/`Horizontal` | VM:34,77–87 fixes width/min/max to 600 or 1200; `RootView.xaml:150–180` changes stack to two 600-wide columns. View:47–56. | This is application layout orientation, not device-rotation lock. A responsive single/two-column layout is a portable equivalent. |
| `ErrorDisplayType` | `Snackbar`; `None`/`Dialog`/`Snackbar` | VM:12–17,33; view:58–67. `UI/DialogHelper.cs:32–49`: None suppresses presentation, Dialog opens details, Snackbar lasts 5 s with Show action for details. | Implement actual error routing. Never hide persistent safety/fault state merely because optional toast/dialog is disabled. |
| `LogLevel` | `Info`; NLog `AllLevels` | VM:28,44,89–104; application rule minimum through Fatal, debug rule minimum is at most Debug while debugger attached, then reconfigure loggers. View:69–79. | Filter a real local logger; explicitly map supported severities. Do not imply NLog integration. |
| `EnableUILogging` | `false` | VM:29,57; toggles Stylet logger manager. View:81–90. | Only portable if backed by real UI diagnostics. WPF/Stylet logging is platform-specific. |
| `EnableJsonLogging` | `false` | VM:30,56; toggles Newtonsoft logger manager; serializer attaches trace writer in `Bootstrapper.cs:256–282`. View:92–101. | Only portable if backed by real JSON diagnostics. Avoid logging secrets or raw complete settings. |

There are no General shortcut action registrations in `GeneralSettingsViewModel`; changing these values via shortcuts would be a new OHOS feature. Related root persistence `DisablePopup`, `WindowHeight`, `WindowLeft`, `WindowTop` belongs to `RootViewModel.cs:107–139`, not the eight General controls.

## 2. Input settings and native processor behavior

`UI/Controls/ViewModels/InputSettingsViewModel.cs:10–15,18–37` sorts registered settings by name and saves/loads `Input.<processor name>`. `Input/IInputProcessorSettings.cs:13–22` uses opt-in JSON properties; `Name` comes from `DisplayName` and is not another persisted setting. There is no global enable/disable, local-only flag or configurable polling interval in this settings UI.

| Processor/key | Default | UI range/units | Runtime side effect and reference |
|---|---|---|---|
| `Input.RawInput.VirtualMouseWidth` | `500` | minimum 1 px | Horizontal mouse delta denominator; `Input/RawInput/RawInputProcessor.cs:19,155–160`; Input view:57–66. |
| `Input.RawInput.VirtualMouseHeight` | `500` | minimum 1 px | Vertical mouse delta denominator; same file:20,161–166; view:68–77. |
| `Input.RawInput.VirtualWheelWidth` | `10` | minimum 1 wheel step | Horizontal wheel delta / `(120 * width)`; same file:21,146–150; view:79–88. |
| `Input.RawInput.VirtualWheelHeight` | `20` | minimum 1 wheel step | Vertical wheel delta / `(120 * height)`; same file:22,140–144; view:90–99. |
| `Input.RawInput.MaximumMouseAxisUpdateRate` | `125` Hz | 30–1000 Hz | Accumulates mouse deltas, emits at rate limit; same file:23,174–189; view:101–111. Wheel events bypass this mouse-axis throttle. |
| `Input.XInput.RightThumbDeadZone` | `Gamepad.RightThumbDeadZone / 32767d` | 0–1, 0.01 step, P2 display | Thumbstick normalization; `Input/XInput/XInputProcessor.cs:14,105–123,141–142`; view:17–28. External-library constant is left as the source expression rather than guessed. |
| `Input.XInput.LeftThumbDeadZone` | `Gamepad.LeftThumbDeadZone / 32767d` | 0–1, 0.01 step, P2 display | Left thumbstick normalization; same file:15,144–145; view:30–40. |
| `Input.XInput.TriggerDeadZone` | `Gamepad.TriggerThreshold / 255d` | 0–1, 0.01 step, P2 display | Trigger normalization; same file:16,126–148; view:42–52. |

### Gesture providers

- **Keyboard:** `RawInput/KeyboardGesture.cs:5–25` represents a sorted, distinct set of WPF `Key` values, with set equality. `RawInputProcessor.cs:78–111` maps physical scan codes to distinguish Shift/Ctrl/Alt variants, adds every keydown to the held set (including OS repeats), publishes the whole chord, and on *any* keyup publishes the full chord released then clears the entire set. This is not ordinary incremental modifier release tracking. Left/right keys are distinct. It does not prevent an earlier partial chord from already having triggered.
- **Mouse buttons:** left/right/middle/X1/X2, single-button descriptors; source uses ordered `else if` chains per up/down group (`RawInputProcessor.cs:120–134`, `MouseButtonGesture.cs:5–16`). Simultaneous flags can lose lower-priority buttons.
- **Mouse axes:** X, Y, wheel, horizontal wheel (`MouseAxisGesture.cs:3–22`). Values initialize to 0.5 and clamp to 0–1, deltas normalize and clamp before accumulation; absolute-pointer packets use prior coordinates. Source line 172 assigns Y from `_mouseXAxis + deltaY`, an apparent bug. Mouse/scroll `DeltaTime` is 0.
- **Windows capture scope:** `RawInputProcessor.cs:192–206` installs an HWND WM_INPUT hook and registers keyboard and mouse with `ExInputSink`. Both processors are instantiated at launch (`Bootstrapper.cs:216–217`). There is no foreground/text-field filtering in this processor. OHOS local key events do not reproduce Windows global capture.
- **XInput gamepad:** four user slots polled at approximately 30 Hz (`XInputProcessor.cs:34–42,45–82`), buttons accumulate down/repeat and release clears all (`86–101`), axis updates require changed packet and changed normalized value (`103–149`). Six axes: left/right triggers and left/right thumb X/Y (`GamepadAxisGesture.cs:3–15`). Source has one shared pressed-button set for all four users, although `GamepadButtonGestureDescriptor.Equals` correctly compares both UserIndex and button sets (`GamepadButtonGesture.cs:5–21`). Keep held-button state separately per device in a new adapter; the shared set can combine events from distinct controllers.
- **TCode input:** no settings class/UI. `TCodeInputProcessor.cs:12–65` buffers newline-separated input, parses `#name:0|1` buttons, `@name:digits` unsigned axes, `$name:signedDigits` signed axes. Axis state is retained by name, unchanged values are ignored, value/delta are normalized with `MathUtils.UnLerp`, DeltaTime=0. Signed-delta normalization uses the signed range directly; validate intended delta semantics before porting. A network/serial input provider is separate work and is not authorized by enabling local shortcuts.
- **Toggle:** `IInputGesture.cs:13–17,35–43` and `IInputGestureData.cs:6–10,27–39` carry state plus `IsInitialState`. No concrete built-in toggle input producer was found under `Source/MultiFunPlayer`; the three toggle shortcuts are extension-ready abstractions, not keyboard toggles.
- All providers publish on the `InputProcessor` event-aggregator channel (`Input/IInputProcessor.cs:5–13`). No touch producer exists in the WPF source. Local touch buttons/sliders are OHOS adapters or direct commands, not WPF trigger parity by themselves.

## 3. Shortcut configuration and trigger inventory

### Persistence, editor and dispatch contract

- Common fields: Name defaults null, Enabled defaults true, Gesture is a typed descriptor, ordered configurations persist under `Actions`; runtime output-data type is ignored (`Shortcut/IShortcut.cs:44–54`). New shortcuts initially have no actions.
- `ShortcutSettingsViewModel.cs:19–39,249–269` saves only its opted-in `Shortcuts` under `Shortcut.Shortcuts`, with .NET `$type` metadata on shortcut objects and descriptors. `Settings/Converters/ShortcutConverter.cs:14–28` instantiates a shortcut and populates its saved properties.
- Each action persists Name plus Settings as typed values (`Settings/Converters/ShortcutActionConfigurationConverter.cs:11–28`), not executable code. Missing registrations are kept as placeholders/missing-action configurations and can recover on later registration (`IShortcutManager.cs:238–300`). OHOS should use a versioned explicit allowlist schema and stable IDs; never load arbitrary type names or execute imported strings.
- The editor captures unique descriptors for 5 seconds, resetting the deadline on each newly seen descriptor (`ShortcutSettingsViewModel.cs:107–159`); filters trigger types by accepted gesture and actions by accepted output data (`56–85`). It supports name/enabled editing, add/remove, action argument dialog, ordered action move up/down and action unbinding (`162–237`; view bindings continue below line 400).
- Opening/activating the Shortcut editor sets manager `HandleGestures=false`; leaving sets true (`98–99`). This gate suppresses incoming gestures only. The source has no transient-state reset there.
- Button/threshold triggers output empty data; toggle triggers output toggle data; drive/offset triggers output axis data. Axis data can bind only actions explicitly consuming it; empty/toggle data can invoke ordinary parameterized/no-parameter actions (`IShortcutAction.cs:22–41`). Axis `ApplyTo` is absolute replacement or `old + delta * modifier` (`Input/IInputGestureData.cs:41–66`).
- Action invocation queues one item per shortcut at a time, coalescing/dropping additional triggers while that shortcut is scheduled (`IShortcut.cs:56–69`). A single worker executes each shortcut's actions sequentially and awaits them (`IShortcutActionRunner.cs:32–55,136–151`). Thus connection work or a slow plugin can delay unrelated controls, including a hypothetical queued Stop. OHOS emergency Stop must bypass/cooperatively invalidate ordinary queued motion actions.

| Trigger class (all under `Shortcut/`) | Persisted options/defaults | Exact trigger behavior / source |
|---|---|---|
| `ButtonPressShortcut` | `HandleRepeating=false` | On false→true; if repeating enabled, any true event. 10–23. |
| `ButtonReleaseShortcut` | `HandleRepeating=false` | On true→false; if repeating enabled, any false event. 10–23. |
| `ButtonClickShortcut` | `ClickCount=1`, `MaximumClickInterval=200` ms | Count alternating down/up. After release, wait interval; invoke only when accumulated transitions equal twice configured click count, then reset. Next press cancels pending timer. 10–32. UI minimum count/interval=1: view114–145. A single click has the interval delay. |
| `ButtonHoldShortcut` | `MinimumHoldDuration=1000` ms; `MaximumHoldDuration=-1`; `InvokeType=OnRelease` | OnRelease fires when release duration reaches minimum; maximum enforced only when maximum>minimum. WhileHolding schedules one invocation at minimum, canceled on release; it does not periodically repeat. 10–50. UI minimum duration=1, maximum minimum=-1; maximum disabled for WhileHolding: view54–112. |
| `AxisDriveShortcut` | `DriveMode=Relative`, `Invert=false` | Absolute, Relative, RelativePositiveOnly, RelativeNegativeOnly, RelativeJoystick. Joystick emits only movement away from 0.5; inversion applied after eligibility. 10–37. UI mode/invert: view155–181. |
| `AxisOffsetShortcut` | `OffsetMode=AbsoluteJoystick`, `Speed=0.1`, `Invert=false` | Absolute maps value to signed speed; joystick maps displacement from center to ±speed; repeats relative offset every 0.1 s until offset reaches zero. It emits `_offset` every tick, not `_offset * 0.1`; data DeltaTime=0.1. 11–41. UI speed 0–1: view218–260. |
| `AxisThresholdShortcut` | `Threshold=0.5`, `TriggerMode=Rising` | Rising: positive delta and crossing threshold upward; Falling: negative delta and crossing downward. Both branch currently returns true even when neither crossing occurred. 11–38. UI threshold 0–1: view183–216. Correct crossing semantics should be deliberate, tested OHOS behavior. |
| `ToggleEnableShortcut` | No extra fields | Invoke each incoming true state; forwards `IsInitialState` unchanged, with no initial-event suppression. 7–14. |
| `ToggleDisableShortcut` | No extra fields | Invoke each incoming false state; same initial-event behavior. 7–14. |
| `ToggleFlipShortcut` | No extra fields | Invoke every incoming toggle event, not a locally stored on/off inversion. 7–10. |

### Timer/lifecycle hazards to test rather than copy

`IShortcut.cs:71–124` owns delay/repeat timers; `Enabled` is checked only at input update (`128–134`), not in `Invoke`, delayed callback or repeat callback. Disable therefore does not stop already-scheduled work. Only disposal cancels all timers (`137–148`), while `IShortcutManager.cs:109–112` removes/clears without calling disposal; `Common/ObservableConcurrentCollection.cs:101–106,142–155` confirms collection removal itself does not dispose items. Capture suppression has the same issue. Losing a physical keyup or gamepad neutral packet can leave a hold/offset state active. Reset both timer handles and state fields; cancellation should never synthesize a normal Release action that itself could start motion.

## 4. Configurable action semantics and persistence

### Argument defaults apply to every appendix entry

`Shortcut/IShortcutSettingBuilder.cs:37–74` starts from `default(T)` unless `WithDefaultValue` supplies a value/factory, then clamps numeric defaults through the numeric template. Consequently booleans start false, numbers start 0 (raised to any minimum), strings/reference selections start null, and enums start zero unless overridden. An `ItemsSource` does not itself select its first item. `IShortcutSettingTemplateContext.cs:12–23` clamps int/double to configured min/max. Imported saved values are type-checked and coerced (`IShortcutActionConfiguration.cs:54–82`). Builder labels, ranges, units and every explicit default are retained verbatim in the appendix.

Important explicit overrides: Debug::Log uses Info; Script::SkipGap minimum=2 s; Sync::Duration::Set=4 s; output minimum limits=0 and maximum limits=1; SmartLimitPoints::Set=[(50,50)]; Custom Curve Reset request-sync=true; Custom Curve Points::Set creates [(0.5,0.5)], duration 1, Linear (`CustomCurveMotionProvider.cs:251–257`). These are **new action argument defaults**, not the current runtime values of the settings they may change.

### Families and consequential effects

| Family | Runtime effect, persistence, and guard considerations |
|---|---|
| `Debug::Log` | Calls logger with configured level/message (`Bootstrapper.cs:117–120`). Binding persists; log entry is an immediate side effect. |
| `Media::PlayPause`, `Path`, `Speed`, `Position` | Publish source-control messages or call source seek helper (`ScriptViewModel.cs:1412–1463`). Time/percent seek requires finite duration/value and clamps to duration (`1037–1052`). Speed minimum 0.01; snaps within 0.01 of 1 to 1. Live play state, path, time and speed are not among Script's saved opted-in fields. Path changing is not permission to add a new file-import UI. |
| `Media::ScriptOffset` | Changes persistent `Script.GlobalOffset`, default 0 seconds (`ScriptViewModel.cs:68,1444–1447`). |
| `Media::Loop` | Loop endpoints/cycle/current chapter, clear and position-derived operations (`1466–1492`). Completing a valid loop immediately seeks to its start (`1094–1127`). Loop segment is runtime-only in Script serialization. |
| `Media::AutoSkipToScriptStart*` | Changes saved enabled/offset fields; runtime defaults true and -5 s (`77–78,1495–1506`); scheduled auto-skip waits 1 second and seeks only when still before target (`1054–1092`). |
| `Media::Bookmark`, `Media::Chapter` | Search first axis with metadata; by name/index or next/previous with 1.5 s tolerance; then seek (`1509–1590`). No new bookmarks/chapters are created. |
| `Script::SkipGap` | Select axis or null to check all, minimum skip default 2 seconds (`1593–1597`). Source/readiness guards remain relevant. |
| `Axis::Value`, `Sync`, `SyncAll` | Create runtime transitions or start/cancel sync (`1600–1626`). Values clamp 0–1 in `SetAxisTransition` (`1217–1235`); transitions are not output transport calls. |
| `Axis::Lock`, `LockAll`, `Bypass::*` | Mutate saved axis settings (`1630–1701`). Bypass All sets all three bypass flags together; Toggle computes OR then flips all together. Lock/Bypass must not be represented as Stop. |
| `Axis::ClearScript`, `ReloadScript` | Clears/reloads current axis resource (`1704–1711`). These are commands, not import UI. |
| `Axis::InterpolationType`, `InvertScript`, `LinkPriority`, `SmartLimit*`, `LinkAxis` | Mutate saved axis processing configuration (`1714–1794`). Input-axis changes request sync; link changes reload axes; self-link is rejected, but the shortcut callback lacks the UI's longer-cycle check (`1248–1275`), so port must use the validated configuration path. |
| `Axis::SpeedLimit*` | Persist enabled and speed. Units/s clamps nonnegative and rounds to 2 decimals. Seconds/unit is reciprocal with zero/infinity cases (`1797–1831`). Validate finite portable serialization rather than accidentally persisting infinity. |
| `Axis::AutoHome*`, `ScriptOffset`, `ScriptScale` | Saved configuration changes (`1834–1911`). Delay/duration clamp nonnegative, target 0–1, scale 0.01–4; auto-home may continue physical motion while source is paused. |
| `Axis::MotionProvider*`, `UpdateMotionProvider*` | Saved selection/blend/gap/clock/activity configuration (`1914–1993`). Selection resolves registered names; blend 0–1; minimum gap nonnegative; input-axis switch requests sync. UpdateWhenPaused/WithoutScript can intentionally continue generated motion. |
| `Sync::*` | Saved duration 0.5–8 and five trigger toggles (`1996–2024`). Runtime SyncSettings default duration=4 and all trigger flags=true (`2411–2420`); there are no shortcut registrations for SyncOnScriptStart/End even though those properties exist. |
| `MotionProvider::{name}::*` | Each axis has providers named Custom Curve, Looping Script, Pattern, Random. All have Speed/Minimum/Maximum Offset/Set/Drive (speed min0.01, limits0–1). Each concrete provider adds its source-registered fields. `AbstractMotionProvider.cs:34–43` requests sync on property change; Custom Curve excludes Time. Provider settings save under `MotionProvider` per axis/type (`IMotionProviderManager.cs:74–100`). |
| `{media source name}::*` | Every source has AutoConnectEnabled Set/Toggle and Connection Toggle/Connect/Disconnect. Current source changes are serialized by a semaphore and may disconnect the previous source (`MediaSourceViewModel.cs:210–230`). Specialized actions set validated endpoints/URIs, credentials, selected remote device/client, MPV arguments, or Internal playlist settings/commands. Internal playlist commands require Connected. Configuration lives under `MediaSource.<Name>` (`65–110`); connection status is runtime-only. Do not expose arbitrary process arguments or credential mutation in the local keyboard subset. |
| `{output Identifier}::*` | Identifier is `Name/InstanceIndex`, e.g. UDP/0 (`AbstractOutputTarget.cs:22–24`). Per-instance connection commands; AutoConnect flag; range Minimum/Maximum/Middle/Size Offset/Set/Drive; specialized endpoint/URI/pipe/serial/Handy key/source-axis setters. Range limits keep 0.01 minimum spacing (`190–332`), but Middle::Set source callback subtracts half-range instead of actual midpoint: review before porting. Output mutation requires precise instance identity; removing output unregisters actions (`OutputTargetViewModel.cs:62–97,206–235`). Saved axis ranges/autoconnect live with output-instance settings (`AbstractOutputTarget.cs:156–188`). File-recording behavior is excluded from this audit. |
| `Shortcut::Enabled::{Set,Toggle}` | Finds first exact ordinal matching shortcut Name, no-op if absent, changes saved Enabled (`ShortcutSettingsViewModel.cs:273–290`). Duplicate names are ambiguous; OHOS stable IDs should avoid this. Cancellation safety is additional to merely changing the flag. |

Script persistence details: `ScriptViewModel.cs:64–78,667–709`; axis defaults at `2344–2401`, sync defaults at `2410–2420`. Not every UI property has a registered action. Plugins may register additional names through `Plugin/PluginBase.cs:76–133`; those dynamic third-party registrations cannot be enumerated from this built-in catalog and are not supported by an OHOS static allowlist by implication.

## 5. Practical OHOS scope and safe adapter contract

### Implementable local subset

- Model a binding with stable ID, label, enabled, supported local trigger, key/chord descriptor, repeat policy and ordered allowlisted action configurations. Normalize enum/ranges during load, keep unknown imported bindings disabled with a reason, and serialize no transient pressed/timer/connection/arming state.
- Local keyboard: initially one discrete press/release, exact modifiers, no OS-global capture claim. Ignore unrelated keys, IME/typing and editor/dialog focus; process only accepted foreground key events. Repeated keydown must not turn Play/Pause into rapid toggle. Deduplicate a single physical event delivered by both child and root handlers.
- Touch: explicit Play, Pause, Stop, ±seek, ±script offset, sync/cancel-sync and loop controls can call the same command dispatcher. A configurable on-screen shortcut button can dispatch one allowed action list. A touch tap is not raw global mouse input; do not expose Windows-only settings for it.
- Use the existing `PlaybackSession`/`PlaybackSessionCore` and active media-source coordinator command surface. In this checkout `core/PlaybackSessionCore.ts` exposes play/pause/stop, foreground/connection gates, speed, seek, axis/global offset/configuration and source seek fencing. UI integration should go through the public owning layer so persistence, pending media seek routing, output fencing and errors remain intact. References to the evolving OHOS files here are integration guidance, not a frozen API guarantee.
- Keep connection/autoconnect, endpoint/credential edits, arbitrary source paths, and direct physical axis drive out of the first keyboard subset unless separately implemented with equivalent readiness/instance/safety checks. Existing UI capability labels should state support accurately.

### Stop, focus and repeat acceptance checklist

1. Held Play/Pause key invokes once by default; keyup re-arms it. Invalid/unknown keys and duplicate dispatch do nothing.
2. Text-input edits, number edits, dropdowns, dialogs and binding capture never invoke ordinary movement/playback actions. Dedicated visible Stop remains accessible through the established safety path.
3. Background/blur cancels outstanding hold/click/axis timers and clears held state. Return to foreground does not synthesize press/release/click or restore arming.
4. Disabling/removing/changing a binding cancels its pending work; no old callback can mutate state after cancellation. A runtime generation/token rejects callbacks already queued.
5. Stop dominates a same-event or earlier queued Play/seek/transition. Clear/cancel pending action chains before executing Stop and invalidate stale continuations. Any later motion needs a fresh deliberate user command and normal arming/readiness.
6. Pause remains distinct from Stop because configured providers/autohome can update when paused; do not market pause or bypass as an emergency device halt.
7. Config changes persist with existing schema/recovery behavior, but pressed state and timers do not. Unknown/deleted action targets produce an unavailable reason, never fallback to another output instance.
8. Clamp finite numeric arguments and reject unsupported action-data type combinations. Seek tests include no media, unknown duration, pending source seek, source switch and Stop during seek.
9. Multi-action order is deterministic. An error is reported and cannot silently skip into a dangerous later action or revive movement after Stop; the chosen chain-abort policy should be explicit.
10. Keyboard tests are unit tests until actual OHOS key/focus events have been verified on a device. Windows RawInput/XInput are unsupported provider dependencies, not blockers for local touch/keyboard UI.

## 6. Registration appendix

The following appendix inventories all 188 built-in literal/interpolated `RegisterAction` call sites outside registration-framework/plugin-wrapper code. Each entry retains argument types, every configuration builder (label/default/range/units/source) and the actual callback, with source line range. `IAxisInputGestureData` is supplied by the trigger, not a user-edited argument. Read the common argument-default rule above for builders without `WithDefaultValue`.

Dynamic expansions:
- Media source `{Name}` / `{source.Name}` = DeoVR, Emby, HereSphere, Internal, Jellyfin, MPC-HC, MPV, OFS, Plex, PotPlayer, VLC, Whirligig. PotPlayer uses inherited/common actions only.
- Motion provider `{name}` = Custom Curve, Looping Script, Pattern, Random. The 9 abstract-provider registrations run for each; concrete additions are separate entries.
- Output `{Identifier}` / `{target.Identifier}` = actual registered instance `Name/InstanceIndex`, not just output protocol. Registration count changes with instances. Specialized file-recording behavior is outside this audit; the generic base registrations are documented without reviewing it.
- No default bindings, fixed hotkey list, universal Stop registration, or finite catalog of third-party plugin actions is implied by this appendix.

### Source/MultiFunPlayer/Bootstrapper.cs

- **"Debug::Log"** — `Source/MultiFunPlayer/Bootstrapper.cs:117–120`
  - Types: `LogLevel, string`.
  - Config: `s => s.WithLabel("Log level").WithDefaultValue(LogLevel.Info).WithItemsSource(LogLevel.AllLoggingLevels)`; `s => s.WithLabel("Message")`.
  - Effect: `Logger.Log`.

### Source/MultiFunPlayer/MediaSource/AbstractMediaSource.cs

- **$"{Name}::AutoConnectEnabled::Set"** — `Source/MultiFunPlayer/MediaSource/AbstractMediaSource.cs:165–165`
  - Types: `bool`.
  - Config: `s => s.WithLabel("Enable auto connect")`.
  - Effect: `enabled => AutoConnectEnabled = enabled`.

- **$"{Name}::AutoConnectEnabled::Toggle"** — `Source/MultiFunPlayer/MediaSource/AbstractMediaSource.cs:166–166`
  - Types: `none`.
  - Config: none.
  - Effect: `() => AutoConnectEnabled = !AutoConnectEnabled`.

### Source/MultiFunPlayer/MediaSource/ViewModels/DeoVRMediaSource.cs

- **$"{Name}::Endpoint::Set"** — `Source/MultiFunPlayer/MediaSource/ViewModels/DeoVRMediaSource.cs:250–254`
  - Types: `string`.
  - Config: `s => s.WithLabel("Endpoint").WithDescription("ipOrHost:port")`.
  - Effect: `endpointString => { if (NetUtils.TryParseEndpoint(endpointString, out var endpoint)) Endpoint = endpoint; }`.

### Source/MultiFunPlayer/MediaSource/ViewModels/EmbyMediaSource.cs

- **$"{Name}::ServerBaseUri::Set"** — `Source/MultiFunPlayer/MediaSource/ViewModels/EmbyMediaSource.cs:333–337`
  - Types: `string`.
  - Config: `s => s.WithLabel("Endpoint").WithDescription("schema://ipOrHost:port")`.
  - Effect: `serverBaseUri => { if (Uri.TryCreate(serverBaseUri, UriKind.Absolute, out var uri)) ServerBaseUri = uri; }`.

- **$"{Name}::ApiKey::Set"** — `Source/MultiFunPlayer/MediaSource/ViewModels/EmbyMediaSource.cs:341–341`
  - Types: `string`.
  - Config: `s => s.WithLabel("Api key")`.
  - Effect: `apiKey => ApiKey = apiKey`.

- **$"{Name}::Device::SetByName"** — `Source/MultiFunPlayer/MediaSource/ViewModels/EmbyMediaSource.cs:345–351`
  - Types: `string`.
  - Config: `s => s.WithLabel("Name")`.
  - Effect: `name => { var devcie = Devices.FirstOrDefault(p => string.Equals(p.Name, name, StringComparison.Ordinal)); if (devcie == null) return; SelectDeviceById(devcie.Id); }`.

- **$"{Name}::RefreshDevices"** — `Source/MultiFunPlayer/MediaSource/ViewModels/EmbyMediaSource.cs:355–355`
  - Types: `none`.
  - Config: none.
  - Effect: `async () => { if (CanRefreshDevices) await RefreshDevices(); }`.

### Source/MultiFunPlayer/MediaSource/ViewModels/HereSphereMediaSource.cs

- **$"{Name}::Endpoint::Set"** — `Source/MultiFunPlayer/MediaSource/ViewModels/HereSphereMediaSource.cs:275–279`
  - Types: `string`.
  - Config: `s => s.WithLabel("Endpoint").WithDescription("ipOrHost:port")`.
  - Effect: `endpointString => { if (NetUtils.TryParseEndpoint(endpointString, out var endpoint)) Endpoint = endpoint; }`.

### Source/MultiFunPlayer/MediaSource/ViewModels/InternalMediaSource.cs

- **$"{Name}::Shuffle::Set"** — `Source/MultiFunPlayer/MediaSource/ViewModels/InternalMediaSource.cs:423–423`
  - Types: `bool`.
  - Config: `s => s.WithLabel("Enable shuffle")`.
  - Effect: `enabled => IsShuffling = enabled`.

- **$"{Name}::Shuffle::Toggle"** — `Source/MultiFunPlayer/MediaSource/ViewModels/InternalMediaSource.cs:424–424`
  - Types: `none`.
  - Config: none.
  - Effect: `() => IsShuffling = !IsShuffling`.

- **$"{Name}::Looping::Set"** — `Source/MultiFunPlayer/MediaSource/ViewModels/InternalMediaSource.cs:428–428`
  - Types: `bool`.
  - Config: `s => s.WithLabel("Enable looping")`.
  - Effect: `enabled => IsLooping = enabled`.

- **$"{Name}::Looping::Toggle"** — `Source/MultiFunPlayer/MediaSource/ViewModels/InternalMediaSource.cs:429–429`
  - Types: `none`.
  - Config: none.
  - Effect: `() => IsLooping = !IsLooping`.

- **$"{Name}::LoadAdditionalScripts::Set"** — `Source/MultiFunPlayer/MediaSource/ViewModels/InternalMediaSource.cs:433–433`
  - Types: `bool`.
  - Config: `s => s.WithLabel("Enable load additional scripts")`.
  - Effect: `enabled => LoadAdditionalScripts = enabled`.

- **$"{Name}::LoadAdditionalScripts::Toggle"** — `Source/MultiFunPlayer/MediaSource/ViewModels/InternalMediaSource.cs:434–434`
  - Types: `none`.
  - Config: none.
  - Effect: `() => LoadAdditionalScripts = !LoadAdditionalScripts`.

- **$"{Name}::Playlist::Clear"** — `Source/MultiFunPlayer/MediaSource/ViewModels/InternalMediaSource.cs:438–438`
  - Types: `none`.
  - Config: none.
  - Effect: `() => WhenConnected(ClearPlaylist)`.

- **$"{Name}::Playlist::Prev"** — `Source/MultiFunPlayer/MediaSource/ViewModels/InternalMediaSource.cs:439–439`
  - Types: `none`.
  - Config: none.
  - Effect: `() => WhenConnected(PlayPrevious)`.

- **$"{Name}::Playlist::Next"** — `Source/MultiFunPlayer/MediaSource/ViewModels/InternalMediaSource.cs:440–440`
  - Types: `none`.
  - Config: none.
  - Effect: `() => WhenConnected(PlayNext)`.

- **$"{Name}::Playlist::PlayByIndex"** — `Source/MultiFunPlayer/MediaSource/ViewModels/InternalMediaSource.cs:441–443`
  - Types: `int`.
  - Config: `s => s.WithLabel("Index").AsNumericUpDown(minimum: 0)`.
  - Effect: `index => WhenConnected(() => WriteMessage(new PlayScriptAtIndexMessage(index)))`.

- **$"{Name}::Playlist::PlayByName"** — `Source/MultiFunPlayer/MediaSource/ViewModels/InternalMediaSource.cs:444–453`
  - Types: `string`.
  - Config: `s => s.WithLabel("File name/path")`.
  - Effect: `name => WhenConnected(() => { var playlist = ScriptPlaylist; if (playlist == null) return; var index = playlist.FindIndex(name); if (index >= 0) WriteMessage(new PlayScriptAtIndexMessage(index)); })`.

### Source/MultiFunPlayer/MediaSource/ViewModels/JellyfinMediaSource.cs

- **$"{Name}::ServerBaseUri::Set"** — `Source/MultiFunPlayer/MediaSource/ViewModels/JellyfinMediaSource.cs:342–346`
  - Types: `string`.
  - Config: `s => s.WithLabel("Endpoint").WithDescription("scheme://ipOrHost:port")`.
  - Effect: `serverBaseUri => { if (Uri.TryCreate(serverBaseUri, UriKind.Absolute, out var uri)) ServerBaseUri = uri; }`.

- **$"{Name}::ApiKey::Set"** — `Source/MultiFunPlayer/MediaSource/ViewModels/JellyfinMediaSource.cs:350–350`
  - Types: `string`.
  - Config: `s => s.WithLabel("Api key")`.
  - Effect: `apiKey => ApiKey = apiKey`.

- **$"{Name}::Device::SetByName"** — `Source/MultiFunPlayer/MediaSource/ViewModels/JellyfinMediaSource.cs:354–360`
  - Types: `string`.
  - Config: `s => s.WithLabel("Name")`.
  - Effect: `name => { var devcie = Devices.FirstOrDefault(p => string.Equals(p.Name, name, StringComparison.Ordinal)); if (devcie == null) return; SelectDeviceById(devcie.Id); }`.

- **$"{Name}::RefreshDevices"** — `Source/MultiFunPlayer/MediaSource/ViewModels/JellyfinMediaSource.cs:364–364`
  - Types: `none`.
  - Config: none.
  - Effect: `async () => { if (CanRefreshDevices) await RefreshDevices(); }`.

### Source/MultiFunPlayer/MediaSource/ViewModels/MpcMediaSource.cs

- **$"{Name}::Endpoint::Set"** — `Source/MultiFunPlayer/MediaSource/ViewModels/MpcMediaSource.cs:222–226`
  - Types: `string`.
  - Config: `s => s.WithLabel("Endpoint").WithDescription("ipOrHost:port")`.
  - Effect: `endpointString => { if (NetUtils.TryParseEndpoint(endpointString, out var endpoint)) Endpoint = endpoint; }`.

### Source/MultiFunPlayer/MediaSource/ViewModels/MpvMediaSource.cs

- **$"{Name}::Arguments::Set"** — `Source/MultiFunPlayer/MediaSource/ViewModels/MpvMediaSource.cs:351–351`
  - Types: `string`.
  - Config: `s => s.WithLabel("Arguments")`.
  - Effect: `arguments => Arguments = arguments`.

### Source/MultiFunPlayer/MediaSource/ViewModels/OfsMediaSource.cs

- **$"{Name}::Uri::Set"** — `Source/MultiFunPlayer/MediaSource/ViewModels/OfsMediaSource.cs:234–238`
  - Types: `string`.
  - Config: `s => s.WithLabel("Uri").WithDescription("ofs websocket uri")`.
  - Effect: `uriString => { if (Uri.TryCreate(uriString, UriKind.Absolute, out var uri)) Uri = uri; }`.

### Source/MultiFunPlayer/MediaSource/ViewModels/PlexMediaSource.cs

- **$"{Name}::ServerBaseUri::Set"** — `Source/MultiFunPlayer/MediaSource/ViewModels/PlexMediaSource.cs:447–451`
  - Types: `string`.
  - Config: `s => s.WithLabel("Endpoint").WithDescription("scheme://ipOrHost:port")`.
  - Effect: `serverBaseUri => { if (Uri.TryCreate(serverBaseUri, UriKind.Absolute, out var uri)) ServerBaseUri = uri; }`.

- **$"{Name}::PlexToken::Set"** — `Source/MultiFunPlayer/MediaSource/ViewModels/PlexMediaSource.cs:455–455`
  - Types: `string`.
  - Config: `s => s.WithLabel("Token")`.
  - Effect: `token => PlexToken = token`.

- **$"{Name}::Client::SetByName"** — `Source/MultiFunPlayer/MediaSource/ViewModels/PlexMediaSource.cs:459–465`
  - Types: `string`.
  - Config: `s => s.WithLabel("Name")`.
  - Effect: `name => { var client = Clients.FirstOrDefault(p => string.Equals(p.Name, name, StringComparison.Ordinal)); if (client == null) return; SelectClientByMachineIdentifier(client.MachineIdentifier); }`.

- **$"{Name}::RefreshClients"** — `Source/MultiFunPlayer/MediaSource/ViewModels/PlexMediaSource.cs:469–469`
  - Types: `none`.
  - Config: none.
  - Effect: `async () => { if (CanRefreshClients) await RefreshClients(); }`.

### Source/MultiFunPlayer/MediaSource/ViewModels/VlcMediaSource.cs

- **$"{Name}::Endpoint::Set"** — `Source/MultiFunPlayer/MediaSource/ViewModels/VlcMediaSource.cs:284–288`
  - Types: `string`.
  - Config: `s => s.WithLabel("Endpoint").WithDescription("ipOrHost:port")`.
  - Effect: `endpointString => { if (NetUtils.TryParseEndpoint(endpointString, out var endpoint)) Endpoint = endpoint; }`.

### Source/MultiFunPlayer/MediaSource/ViewModels/WhirligigMediaSource.cs

- **$"{Name}::Endpoint::Set"** — `Source/MultiFunPlayer/MediaSource/ViewModels/WhirligigMediaSource.cs:142–146`
  - Types: `string`.
  - Config: `s => s.WithLabel("Endpoint").WithDescription("ipOrHost:port")`.
  - Effect: `endpointString => { if (NetUtils.TryParseEndpoint(endpointString, out var endpoint)) Endpoint = endpoint; }`.

### Source/MultiFunPlayer/MotionProvider/AbstractMotionProvider.cs

- **$"MotionProvider::{name}::Speed::Offset"** — `Source/MultiFunPlayer/MotionProvider/AbstractMotionProvider.cs:55–58`
  - Types: `DeviceAxis, double`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Value offset").AsNumericUpDown(interval: 0.01, stringFormat: "{0:P0}")`.
  - Effect: `(axis, offset) => UpdateProperty(axis, p => p.Speed = Math.Max(0.01, p.Speed + offset))`.

- **$"MotionProvider::{name}::Speed::Set"** — `Source/MultiFunPlayer/MotionProvider/AbstractMotionProvider.cs:60–63`
  - Types: `DeviceAxis, double`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Value").AsNumericUpDown(minimum: 0.01, interval: 0.01, stringFormat: "{0:P0}")`.
  - Effect: `(axis, value) => UpdateProperty(axis, p => p.Speed = Math.Max(0.01, value))`.

- **$"MotionProvider::{name}::Speed::Drive"** — `Source/MultiFunPlayer/MotionProvider/AbstractMotionProvider.cs:65–67`
  - Types: `IAxisInputGestureData, DeviceAxis`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`.
  - Effect: `(data, axis) => UpdateProperty(axis, p => p.Speed = Math.Max(0.01, data.ApplyTo(p.Speed)))`.

- **$"MotionProvider::{name}::Minimum::Offset"** — `Source/MultiFunPlayer/MotionProvider/AbstractMotionProvider.cs:71–74`
  - Types: `DeviceAxis, double`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Value offset").AsNumericUpDown(-1, 1, 0.01, "{0:P0}")`.
  - Effect: `(axis, offset) => UpdateProperty(axis, p => p.Minimum = MathUtils.Clamp01(p.Minimum + offset))`.

- **$"MotionProvider::{name}::Minimum::Set"** — `Source/MultiFunPlayer/MotionProvider/AbstractMotionProvider.cs:76–79`
  - Types: `DeviceAxis, double`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Value").AsNumericUpDown(0, 1, 0.01, "{0:P0}")`.
  - Effect: `(axis, value) => UpdateProperty(axis, p => p.Minimum = MathUtils.Clamp01(value))`.

- **$"MotionProvider::{name}::Minimum::Drive"** — `Source/MultiFunPlayer/MotionProvider/AbstractMotionProvider.cs:81–83`
  - Types: `IAxisInputGestureData, DeviceAxis`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`.
  - Effect: `(data, axis) => UpdateProperty(axis, p => p.Minimum = MathUtils.Clamp01(data.ApplyTo(p.Minimum)))`.

- **$"MotionProvider::{name}::Maximum::Offset"** — `Source/MultiFunPlayer/MotionProvider/AbstractMotionProvider.cs:87–90`
  - Types: `DeviceAxis, double`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Value offset").AsNumericUpDown(-1, 1, 0.01, "{0:P0}")`.
  - Effect: `(axis, offset) => UpdateProperty(axis, p => p.Maximum = MathUtils.Clamp01(p.Maximum + offset))`.

- **$"MotionProvider::{name}::Maximum::Set"** — `Source/MultiFunPlayer/MotionProvider/AbstractMotionProvider.cs:92–95`
  - Types: `DeviceAxis, double`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Value").AsNumericUpDown(0, 1, 0.01, "{0:P0}")`.
  - Effect: `(axis, value) => UpdateProperty(axis, p => p.Maximum = MathUtils.Clamp01(value))`.

- **$"MotionProvider::{name}::Maximum::Drive"** — `Source/MultiFunPlayer/MotionProvider/AbstractMotionProvider.cs:97–99`
  - Types: `IAxisInputGestureData, DeviceAxis`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`.
  - Effect: `(data, axis) => UpdateProperty(axis, p => p.Maximum = MathUtils.Clamp01(data.ApplyTo(p.Maximum)))`.

### Source/MultiFunPlayer/MotionProvider/ViewModels/CustomCurveMotionProvider.cs

- **$"MotionProvider::{name}::InterpolationType::Set"** — `Source/MultiFunPlayer/MotionProvider/ViewModels/CustomCurveMotionProvider.cs:181–184`
  - Types: `DeviceAxis, InterpolationType`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Interpolation type").WithItemsSource(Enum.GetValues<InterpolationType>())`.
  - Effect: `(axis, interpolationType) => UpdateProperty(axis, p => p.InterpolationType = interpolationType)`.

- **$"MotionProvider::{name}::Duration::Set"** — `Source/MultiFunPlayer/MotionProvider/ViewModels/CustomCurveMotionProvider.cs:188–191`
  - Types: `DeviceAxis, double`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Duration").AsNumericUpDown(1, 60, 1, "{0:F2}s")`.
  - Effect: `(axis, duration) => UpdateProperty(axis, p => p.Duration = duration)`.

- **$"MotionProvider::{name}::IsLooping::Set"** — `Source/MultiFunPlayer/MotionProvider/ViewModels/CustomCurveMotionProvider.cs:195–198`
  - Types: `DeviceAxis, bool`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Enable looping")`.
  - Effect: `(axis, enabled) => UpdateProperty(axis, p => p.IsLooping = enabled)`.

- **$"MotionProvider::{name}::IsLooping::Toggle"** — `Source/MultiFunPlayer/MotionProvider/ViewModels/CustomCurveMotionProvider.cs:200–202`
  - Types: `DeviceAxis`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`.
  - Effect: `axis => UpdateProperty(axis, p => p.IsLooping = !p.IsLooping)`.

- **$"MotionProvider::{name}::Reset"** — `Source/MultiFunPlayer/MotionProvider/ViewModels/CustomCurveMotionProvider.cs:206–213`
  - Types: `DeviceAxis, bool`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Request sync").WithDefaultValue(true)`.
  - Effect: `(axis, sync) => UpdateProperty(axis, p => { if (sync) p.RequestSync(); p.ResetState(true); })`.

- **$"MotionProvider::{name}::Points::Set"** — `Source/MultiFunPlayer/MotionProvider/ViewModels/CustomCurveMotionProvider.cs:217–227`
  - Types: `DeviceAxis, PointsActionSettingsViewModel`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithDefaultValue(() => new PointsActionSettingsViewModel()) .WithTemplateName("CustomCurveMotionProviderPointsTemplate") .WithCustomToString(vm => $"Points({vm.Points.Count})")`.
  - Effect: `(axis, vm) => UpdateProperty(axis, p => { p.Duration = vm.Duration; p.InterpolationType = vm.InterpolationType; p.Points.SetFrom(vm.Points); })`.

### Source/MultiFunPlayer/MotionProvider/ViewModels/LoopingScriptMotionProvider.cs

- **$"MotionProvider::{name}::Script::Set"** — `Source/MultiFunPlayer/MotionProvider/ViewModels/LoopingScriptMotionProvider.cs:96–99`
  - Types: `DeviceAxis, string`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Script path")`.
  - Effect: `(axis, script) => UpdateProperty(axis, p => p.SourceFile = new FileInfo(script))`.

- **$"MotionProvider::{name}::Interpolation::Set"** — `Source/MultiFunPlayer/MotionProvider/ViewModels/LoopingScriptMotionProvider.cs:103–106`
  - Types: `DeviceAxis, InterpolationType`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Interpolation type").WithItemsSource(Enum.GetValues<InterpolationType>())`.
  - Effect: `(axis, interpolation) => UpdateProperty(axis, p => p.InterpolationType = interpolation)`.

### Source/MultiFunPlayer/MotionProvider/ViewModels/PatternMotionProvider.cs

- **$"MotionProvider::{name}::Pattern::Set"** — `Source/MultiFunPlayer/MotionProvider/ViewModels/PatternMotionProvider.cs:73–76`
  - Types: `DeviceAxis, PatternType`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Pattern").WithItemsSource(Enum.GetValues<PatternType>())`.
  - Effect: `(axis, pattern) => UpdateProperty(axis, p => p.Pattern = pattern)`.

### Source/MultiFunPlayer/MotionProvider/ViewModels/RandomMotionProvider.cs

- **$"MotionProvider::{name}::Octaves::Set"** — `Source/MultiFunPlayer/MotionProvider/ViewModels/RandomMotionProvider.cs:49–52`
  - Types: `DeviceAxis, int`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Octaves").AsNumericUpDown(minimum: 1)`.
  - Effect: `(axis, octaves) => UpdateProperty(axis, p => p.Octaves = octaves)`.

- **$"MotionProvider::{name}::Persistence::Set"** — `Source/MultiFunPlayer/MotionProvider/ViewModels/RandomMotionProvider.cs:56–59`
  - Types: `DeviceAxis, double`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Persistence").AsNumericUpDown(minimum: 0.01, interval: 0.01)`.
  - Effect: `(axis, persistence) => UpdateProperty(axis, p => p.Persistence = persistence)`.

- **$"MotionProvider::{name}::Lacunarity::Set"** — `Source/MultiFunPlayer/MotionProvider/ViewModels/RandomMotionProvider.cs:63–66`
  - Types: `DeviceAxis, double`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Lacunarity").AsNumericUpDown(minimum: 0.1, maximum: 2, interval: 0.01)`.
  - Effect: `(axis, lacunarity) => UpdateProperty(axis, p => p.Lacunarity = lacunarity)`.

### Source/MultiFunPlayer/OutputTarget/AbstractOutputTarget.cs

- **$"{Identifier}::AutoConnectEnabled::Set"** — `Source/MultiFunPlayer/OutputTarget/AbstractOutputTarget.cs:255–255`
  - Types: `bool`.
  - Config: `s => s.WithLabel("Enable auto connect")`.
  - Effect: `enabled => AutoConnectEnabled = enabled`.

- **$"{Identifier}::AutoConnectEnabled::Toggle"** — `Source/MultiFunPlayer/OutputTarget/AbstractOutputTarget.cs:256–256`
  - Types: `none`.
  - Config: none.
  - Effect: `() => AutoConnectEnabled = !AutoConnectEnabled`.

- **$"{Identifier}::Axis::Range::Minimum::Offset"** — `Source/MultiFunPlayer/OutputTarget/AbstractOutputTarget.cs:260–264`
  - Types: `DeviceAxis, double, double`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Value offset").AsNumericUpDown(-1, 1, 0.01, "{0:P0}")`; `s => s.WithDefaultValue(0).WithLabel("Value limit").AsNumericUpDown(0, 1, 0.01, "{0:P0}")`.
  - Effect: `(axis, offset, limit) => UpdateSettings(axis, s => SetMinimum(s, s.Minimum + offset, limit))`.

- **$"{Identifier}::Axis::Range::Minimum::Set"** — `Source/MultiFunPlayer/OutputTarget/AbstractOutputTarget.cs:266–269`
  - Types: `DeviceAxis, double`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Value").AsNumericUpDown(0, 1, 0.01, "{0:P0}")`.
  - Effect: `(axis, value) => UpdateSettings(axis, s => SetMinimum(s, value, 0))`.

- **$"{Identifier}::Axis::Range::Minimum::Drive"** — `Source/MultiFunPlayer/OutputTarget/AbstractOutputTarget.cs:271–274`
  - Types: `IAxisInputGestureData, DeviceAxis, double`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithDefaultValue(0).WithLabel("Value limit").AsNumericUpDown(0, 1, 0.01, "{0:P0}")`.
  - Effect: `(data, axis, limit) => UpdateSettings(axis, s => SetMinimum(s, data.ApplyTo(s.Minimum), limit))`.

- **$"{Identifier}::Axis::Range::Maximum::Offset"** — `Source/MultiFunPlayer/OutputTarget/AbstractOutputTarget.cs:278–282`
  - Types: `DeviceAxis, double, double`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Value offset").AsNumericUpDown(-1, 1, 0.01, "{0:P0}")`; `s => s.WithDefaultValue(1).WithLabel("Value limit").AsNumericUpDown(0, 1, 0.01, "{0:P0}")`.
  - Effect: `(axis, offset, limit) => UpdateSettings(axis, s => SetMaximum(s, s.Maximum + offset, limit))`.

- **$"{Identifier}::Axis::Range::Maximum::Set"** — `Source/MultiFunPlayer/OutputTarget/AbstractOutputTarget.cs:284–287`
  - Types: `DeviceAxis, double`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Value").AsNumericUpDown(0, 1, 0.01, "{0:P0}")`.
  - Effect: `(axis, value) => UpdateSettings(axis, s => SetMaximum(s, value, 1))`.

- **$"{Identifier}::Axis::Range::Maximum::Drive"** — `Source/MultiFunPlayer/OutputTarget/AbstractOutputTarget.cs:289–292`
  - Types: `IAxisInputGestureData, DeviceAxis, double`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithDefaultValue(1).WithLabel("Value limit").AsNumericUpDown(0, 1, 0.01, "{0:P0}")`.
  - Effect: `(gesture, axis, limit) => UpdateSettings(axis, s => SetMaximum(s, gesture.ApplyTo(s.Maximum), limit))`.

- **$"{Identifier}::Axis::Range::Middle::Offset"** — `Source/MultiFunPlayer/OutputTarget/AbstractOutputTarget.cs:296–301`
  - Types: `DeviceAxis, double, double, double`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Value offset").AsNumericUpDown(-1, 1, 0.01, "{0:P0}")`; `s => s.WithDefaultValue(0).WithLabel("Minimum limit").AsNumericUpDown(0, 1, 0.01, "{0:P0}")`; `s => s.WithDefaultValue(1).WithLabel("Maximium limit").AsNumericUpDown(0, 1, 0.01, "{0:P0}")`.
  - Effect: `(axis, offset, minimumLimit, maximumLimit) => UpdateSettings(axis, s => OffsetMiddle(s, offset, minimumLimit, maximumLimit))`.

- **$"{Identifier}::Axis::Range::Middle::Set"** — `Source/MultiFunPlayer/OutputTarget/AbstractOutputTarget.cs:303–306`
  - Types: `DeviceAxis, double`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Value").AsNumericUpDown(0, 1, 0.01, "{0:P0}")`.
  - Effect: `(axis, value) => UpdateSettings(axis, s => OffsetMiddle(s, value - (s.Maximum - s.Minimum) / 2, 0, 1))`.

- **$"{Identifier}::Axis::Range::Middle::Drive"** — `Source/MultiFunPlayer/OutputTarget/AbstractOutputTarget.cs:308–312`
  - Types: `IAxisInputGestureData, DeviceAxis, double, double`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithDefaultValue(0).WithLabel("Minimum limit").AsNumericUpDown(0, 1, 0.01, "{0:P0}")`; `s => s.WithDefaultValue(1).WithLabel("Maximium limit").AsNumericUpDown(0, 1, 0.01, "{0:P0}")`.
  - Effect: `(data, axis, minimumLimit, maximumLimit) => UpdateSettings(axis, s => SetMiddle(s, data, minimumLimit, maximumLimit))`.

- **$"{Identifier}::Axis::Range::Size::Offset"** — `Source/MultiFunPlayer/OutputTarget/AbstractOutputTarget.cs:316–321`
  - Types: `DeviceAxis, double, double, double`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Value offset").AsNumericUpDown(-1, 1, 0.01, "{0:P0}")`; `s => s.WithDefaultValue(0).WithLabel("Minimum limit").AsNumericUpDown(0, 1, 0.01, "{0:P0}")`; `s => s.WithDefaultValue(1).WithLabel("Maximium limit").AsNumericUpDown(0, 1, 0.01, "{0:P0}")`.
  - Effect: `(axis, offset, minimumLimit, maximumLimit) => UpdateSettings(axis, s => OffsetSize(s, offset, minimumLimit, maximumLimit))`.

- **$"{Identifier}::Axis::Range::Size::Set"** — `Source/MultiFunPlayer/OutputTarget/AbstractOutputTarget.cs:323–326`
  - Types: `DeviceAxis, double`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Value").AsNumericUpDown(0, 1, 0.01, "{0:P0}")`.
  - Effect: `(axis, value) => UpdateSettings(axis, s => OffsetSize(s, value - (s.Maximum - s.Minimum), 0, 1))`.

- **$"{Identifier}::Axis::Range::Size::Drive"** — `Source/MultiFunPlayer/OutputTarget/AbstractOutputTarget.cs:328–332`
  - Types: `IAxisInputGestureData, DeviceAxis, double, double`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithDefaultValue(0).WithLabel("Minimum limit").AsNumericUpDown(0, 1, 0.01, "{0:P0}")`; `s => s.WithDefaultValue(1).WithLabel("Maximium limit").AsNumericUpDown(0, 1, 0.01, "{0:P0}")`.
  - Effect: `(data, axis, minimumLimit, maximumLimit) => UpdateSettings(axis, s => SetSize(s, data, minimumLimit, maximumLimit))`.

### Source/MultiFunPlayer/OutputTarget/ViewModels/ButtplugOutputTarget.cs

- **$"{Identifier}::Endpoint::Set"** — `Source/MultiFunPlayer/OutputTarget/ViewModels/ButtplugOutputTarget.cs:409–413`
  - Types: `string`.
  - Config: `s => s.WithLabel("Endpoint").WithDescription("ipOrHost:port")`.
  - Effect: `endpointString => { if (NetUtils.TryParseEndpoint(endpointString, out var endpoint)) Endpoint = endpoint; }`.

### Source/MultiFunPlayer/OutputTarget/ViewModels/PipeOutputTarget.cs

- **$"{Identifier}::PipeName::Set"** — `Source/MultiFunPlayer/OutputTarget/ViewModels/PipeOutputTarget.cs:158–158`
  - Types: `string`.
  - Config: `s => s.WithLabel("Pipe name")`.
  - Effect: `pipeName => PipeName = pipeName`.

### Source/MultiFunPlayer/OutputTarget/ViewModels/SerialOutputTarget.cs

- **$"{Identifier}::SerialPort::Set"** — `Source/MultiFunPlayer/OutputTarget/ViewModels/SerialOutputTarget.cs:319–319`
  - Types: `string`.
  - Config: `s => s.WithLabel("Device ID")`.
  - Effect: `SelectSerialPortByDeviceId`.

### Source/MultiFunPlayer/OutputTarget/ViewModels/TcpOutputTarget.cs

- **$"{Identifier}::Endpoint::Set"** — `Source/MultiFunPlayer/OutputTarget/ViewModels/TcpOutputTarget.cs:181–185`
  - Types: `string`.
  - Config: `s => s.WithLabel("Endpoint").WithDescription("ipOrHost:port")`.
  - Effect: `endpointString => { if (NetUtils.TryParseEndpoint(endpointString, out var endpoint)) Endpoint = endpoint; }`.

### Source/MultiFunPlayer/OutputTarget/ViewModels/TheHandyOutputTarget.cs

- **$"{Identifier}::ConnectionKey::Set"** — `Source/MultiFunPlayer/OutputTarget/ViewModels/TheHandyOutputTarget.cs:202–202`
  - Types: `string`.
  - Config: `s => s.WithLabel("Connection key")`.
  - Effect: `connectionKey => ConnectionKey = connectionKey`.

- **$"{Identifier}::SourceAxis::Set"** — `Source/MultiFunPlayer/OutputTarget/ViewModels/TheHandyOutputTarget.cs:206–206`
  - Types: `DeviceAxis`.
  - Config: `s => s.WithLabel("Source axis").WithItemsSource(DeviceAxis.All)`.
  - Effect: `axis => SourceAxis = axis`.

### Source/MultiFunPlayer/OutputTarget/ViewModels/UdpOutputTarget.cs

- **$"{Identifier}::Endpoint::Set"** — `Source/MultiFunPlayer/OutputTarget/ViewModels/UdpOutputTarget.cs:180–184`
  - Types: `string`.
  - Config: `s => s.WithLabel("Endpoint").WithDescription("ipOrHost:port")`.
  - Effect: `endpointString => { if (NetUtils.TryParseEndpoint(endpointString, out var endpoint)) Endpoint = endpoint; }`.

### Source/MultiFunPlayer/OutputTarget/ViewModels/WebSocketOutputTarget.cs

- **$"{Identifier}::Uri::Set"** — `Source/MultiFunPlayer/OutputTarget/ViewModels/WebSocketOutputTarget.cs:186–190`
  - Types: `string`.
  - Config: `s => s.WithLabel("Uri").WithDescription("websocket uri")`.
  - Effect: `uriString => { if (Uri.TryCreate(uriString, UriKind.Absolute, out var uri)) Uri = uri; }`.

### Source/MultiFunPlayer/UI/Controls/ViewModels/MediaSourceViewModel.cs

- **$"{source.Name}::Connection::Toggle"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/MediaSourceViewModel.cs:215–215`
  - Types: `none`.
  - Config: none.
  - Effect: `async () => await ToggleConnectAsync(source)`.

- **$"{source.Name}::Connection::Connect"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/MediaSourceViewModel.cs:216–222`
  - Types: `none`.
  - Config: none.
  - Effect: `async () => { await _semaphore.WaitAsync(token); if (_currentSource != source) await ConnectAndSetAsCurrentSourceAsync(source, token); _semaphore.Release(); }`.

- **$"{source.Name}::Connection::Disconnect"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/MediaSourceViewModel.cs:223–229`
  - Types: `none`.
  - Config: none.
  - Effect: `async () => { await _semaphore.WaitAsync(token); if (_currentSource == source) await DisconnectCurrentSourceAsync(token); _semaphore.Release(); }`.

### Source/MultiFunPlayer/UI/Controls/ViewModels/OutputTargetViewModel.cs

- **$"{target.Identifier}::Connection::Toggle"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/OutputTargetViewModel.cs:212–212`
  - Types: `none`.
  - Config: none.
  - Effect: `async () => await ToggleConnectAsync(target)`.

- **$"{target.Identifier}::Connection::Connect"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/OutputTargetViewModel.cs:213–219`
  - Types: `none`.
  - Config: none.
  - Effect: `async () => { await _semaphores[target].WaitAsync(token); if (target.Status == ConnectionStatus.Disconnected) await ConnectAsync(target, ConnectionType.Manual, token); _semaphores[target].Release(); }`.

- **$"{target.Identifier}::Connection::Disconnect"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/OutputTargetViewModel.cs:220–226`
  - Types: `none`.
  - Config: none.
  - Effect: `async () => { await _semaphores[target].WaitAsync(token); if (target.Status == ConnectionStatus.Connected) await DisconnectAsync(target, token); _semaphores[target].Release(); }`.

### Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs

- **"Media::PlayPause::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1413–1418`
  - Types: `bool`.
  - Config: `s => s.WithLabel("Play")`.
  - Effect: `play => { if (play && !IsPlaying) OnPlayPauseClick(); else if (!play && IsPlaying) OnPlayPauseClick(); }`.

- **"Media::PlayPause::Toggle"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1420–1420`
  - Types: `none`.
  - Config: none.
  - Effect: `OnPlayPauseClick`.

- **"Media::Path::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1424–1424`
  - Types: `string`.
  - Config: `s => s.WithLabel("Media path")`.
  - Effect: `path => _eventAggregator.Publish(new MediaChangePathMessage(path))`.

- **"Media::Speed::Offset"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1428–1430`
  - Types: `double`.
  - Config: `s => s.WithLabel("Value offset").AsNumericUpDown(interval: 0.01, stringFormat: "{0:P0}")`.
  - Effect: `offset => _eventAggregator.Publish(new MediaChangeSpeedMessage(CoerceMediaSpeed(PlaybackSpeed + offset)))`.

- **"Media::Speed::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1431–1433`
  - Types: `double`.
  - Config: `s => s.WithLabel("Value").AsNumericUpDown(minimum: 0.01, interval: 0.01, stringFormat: "{0:P0}")`.
  - Effect: `value => _eventAggregator.Publish(new MediaChangeSpeedMessage(CoerceMediaSpeed(value)))`.

- **"Media::ScriptOffset::Offset"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1444–1445`
  - Types: `double`.
  - Config: `s => s.WithLabel("Value offset").AsNumericUpDown(stringFormat: "{0:F2}s")`.
  - Effect: `offset => GlobalOffset += offset`.

- **"Media::ScriptOffset::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1446–1447`
  - Types: `double`.
  - Config: `s => s.WithLabel("Value").AsNumericUpDown(stringFormat: "{0:F2}s")`.
  - Effect: `value => GlobalOffset = value`.

- **"Media::Position::Time::Offset"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1451–1452`
  - Types: `double`.
  - Config: `s => s.WithLabel("Value offset").AsNumericUpDown(stringFormat: "{0:F2}s")`.
  - Effect: `offset => SeekMediaToTime(MediaPosition + offset)`.

- **"Media::Position::Time::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1453–1454`
  - Types: `double`.
  - Config: `s => s.WithLabel("Value").AsNumericUpDown(minimum: 0, stringFormat: "{0:F2}s")`.
  - Effect: `SeekMediaToTime`.

- **"Media::Position::Percent::Offset"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1456–1458`
  - Types: `double`.
  - Config: `s => s.WithLabel("Value offset").AsNumericUpDown(-1, 1, 0.01, stringFormat: "{0:P0}")`.
  - Effect: `offset => SeekMediaToPercent(MediaPosition / MediaDuration + offset)`.

- **"Media::Position::Percent::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1459–1460`
  - Types: `double`.
  - Config: `s => s.WithLabel("Value").AsNumericUpDown(0, 1, 0.01, "{0:P0}")`.
  - Effect: `SeekMediaToPercent`.

- **"Media::Position::SkipToScriptStart"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1462–1463`
  - Types: `double`.
  - Config: `s => s.WithLabel("Offset").AsNumericUpDown(stringFormat: "{0:F2}s")`.
  - Effect: `offset => SeekMediaToScriptStart(offset, onlyWhenBefore: false)`.

- **"Media::Loop::Set::FromMediaPositionOffset"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1467–1470`
  - Types: `double, double`.
  - Config: `s => s.WithLabel("Start offset").AsNumericUpDown(stringFormat: "{0:F2}s").WithDescription("Seconds before current media position")`; `s => s.WithLabel("End offset").AsNumericUpDown(stringFormat: "{0:F2}s").WithDescription("Seconds after current media position")`.
  - Effect: `(startOffset, endOffset) => SetMediaLoop(MediaPosition - startOffset, MediaPosition + endOffset)`.

- **"Media::Loop::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1472–1475`
  - Types: `double, double`.
  - Config: `s => s.WithLabel("Start position").AsNumericUpDown(minimum: 0, stringFormat: "{0:F2}s")`; `s => s.WithLabel("End position").AsNumericUpDown(minimum: 0, stringFormat: "{0:F2}s")`.
  - Effect: `SetMediaLoop`.

- **"Media::Loop::CycleSetStartEnd"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1477–1485`
  - Types: `none`.
  - Config: none.
  - Effect: `() => { if (MediaLoopSegment.IsValid) ClearMediaLoop(); else if (MediaLoopSegment.StartPosition == null) SetMediaLoopStartFromMediaPosition(); else if (MediaLoopSegment.EndPosition == null) SetMediaLoopEndFromMediaPosition(); }`.

- **"Media::Loop::Start::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1487–1487`
  - Types: `double`.
  - Config: `s => s.WithLabel("Position").AsNumericUpDown(minimum: 0, stringFormat: "{0:F2}s")`.
  - Effect: `SetMediaLoopStart`.

- **"Media::Loop::End::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1488–1488`
  - Types: `double`.
  - Config: `s => s.WithLabel("Position").AsNumericUpDown(minimum: 0, stringFormat: "{0:F2}s")`.
  - Effect: `SetMediaLoopEnd`.

- **"Media::Loop::Clear"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1489–1489`
  - Types: `none`.
  - Config: none.
  - Effect: `ClearMediaLoop`.

- **"Media::Loop::Set::FromCurrentChapter"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1490–1490`
  - Types: `none`.
  - Config: none.
  - Effect: `SetMediaLoopFromCurrentChapter`.

- **"Media::Loop::Start::Set::FromMediaPosition"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1491–1491`
  - Types: `none`.
  - Config: none.
  - Effect: `SetMediaLoopStartFromMediaPosition`.

- **"Media::Loop::End::Set::FromMediaPosition"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1492–1492`
  - Types: `none`.
  - Config: none.
  - Effect: `SetMediaLoopEndFromMediaPosition`.

- **"Media::AutoSkipToScriptStartEnabled::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1496–1497`
  - Types: `bool`.
  - Config: `s => s.WithLabel("Auto-skip to script start enabled")`.
  - Effect: `enabled => AutoSkipToScriptStartEnabled = enabled`.

- **"Media::AutoSkipToScriptStartEnabled::Toggle"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1499–1500`
  - Types: `none`.
  - Config: none.
  - Effect: `() => AutoSkipToScriptStartEnabled = !AutoSkipToScriptStartEnabled`.

- **"Media::AutoSkipToScriptStartOffset::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1504–1506`
  - Types: `double`.
  - Config: `s => s.WithLabel("Value").AsNumericUpDown(stringFormat: "{0:F2}s").WithDescription("Offset from script start")`.
  - Effect: `offset => AutoSkipToScriptStartOffset = offset`.

- **"Media::Bookmark::SeekToByName"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1516–1521`
  - Types: `string`.
  - Config: `s => s.WithLabel("Bookmark name")`.
  - Effect: `name => { if (TryGetFirstBookmarks(out var bookmarks) && bookmarks.TryFindByName(name, out var bookmark)) SeekMediaToTime(bookmark.Position); }`.

- **"Media::Bookmark::SeekToByIndex"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1523–1528`
  - Types: `int`.
  - Config: `s => s.WithLabel("Bookmark index").AsNumericUpDown(minimum: 0)`.
  - Effect: `index => { if (TryGetFirstBookmarks(out var bookmarks) && bookmarks.ValidateIndex(index)) SeekMediaToTime(bookmarks[index].Position); }`.

- **"Media::Bookmark::SeekToNext"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1530–1538`
  - Types: `none`.
  - Config: none.
  - Effect: `() => { if (!TryGetFirstBookmarks(out var bookmarks)) return; var index = bookmarks.SearchForIndexAfter(MediaPosition + 1.5); if (bookmarks.ValidateIndex(index)) SeekMediaToTime(bookmarks[index].Position); }`.

- **"Media::Bookmark::SeekToPrev"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1540–1548`
  - Types: `none`.
  - Config: none.
  - Effect: `() => { if (!TryGetFirstBookmarks(out var bookmarks)) return; var index = bookmarks.SearchForIndexBefore(MediaPosition - 1.5); if (bookmarks.ValidateIndex(index)) SeekMediaToTime(bookmarks[index].Position); }`.

- **"Media::Chapter::SeekToByName"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1558–1563`
  - Types: `string`.
  - Config: `s => s.WithLabel("Chapter name")`.
  - Effect: `name => { if (TryGetFirstChapters(out var chapters) && chapters.TryFindByName(name, out var chapter)) SeekMediaToTime(chapter.StartPosition); }`.

- **"Media::Chapter::SeekToByIndex"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1565–1570`
  - Types: `int`.
  - Config: `s => s.WithLabel("Chapter index").AsNumericUpDown(minimum: 0)`.
  - Effect: `index => { if (TryGetFirstChapters(out var chapters) && chapters.ValidateIndex(index)) SeekMediaToTime(chapters[index].StartPosition); }`.

- **"Media::Chapter::SeekToNext"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1572–1580`
  - Types: `none`.
  - Config: none.
  - Effect: `() => { if (!TryGetFirstChapters(out var chapters)) return; var index = chapters.SearchForIndexAfter(MediaPosition + 1.5); if (chapters.ValidateIndex(index)) SeekMediaToTime(chapters[index].StartPosition); }`.

- **"Media::Chapter::SeekToPrev"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1582–1590`
  - Types: `none`.
  - Config: none.
  - Effect: `() => { if (!TryGetFirstChapters(out var chapters)) return; var index = chapters.SearchForIndexBefore(MediaPosition - 1.5); if (chapters.ValidateIndex(index)) SeekMediaToTime(chapters[index].StartPosition); }`.

- **"Script::SkipGap"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1594–1597`
  - Types: `DeviceAxis, double`.
  - Config: `s => s.WithLabel("Target").WithItemsSource(DeviceAxis.All).WithDescription("Target axis script to check for gaps\nEmpty to check all scripts")`; `s => s.WithLabel("Minimum skip").WithDefaultValue(2).AsNumericUpDown(minimum: 0, stringFormat: "{0:F2}s")`.
  - Effect: `(axis, minimumSkip) => SkipGap(minimumSkip, axis)`.

- **"Axis::Value::Offset"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1601–1605`
  - Types: `DeviceAxis, double, double`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Value offset").AsNumericUpDown(-1, 1, 0.01, "{0:P0}")`; `s => s.WithLabel("Duration").AsNumericUpDown(minimum: 0, stringFormat: "{0:F2}s")`.
  - Effect: `(axis, offset, duration) => SetAxisTransition(axis, offset, duration, offset: true)`.

- **"Axis::Value::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1607–1611`
  - Types: `DeviceAxis, double, double`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Value").AsNumericUpDown(0, 1, 0.01, "{0:P0}")`; `s => s.WithLabel("Duration").AsNumericUpDown(minimum: 0, stringFormat: "{0:F2}s")`.
  - Effect: `(axis, value, duration) => SetAxisTransition(axis, value, duration)`.

- **"Axis::Value::Drive"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1613–1615`
  - Types: `IAxisInputGestureData, DeviceAxis`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`.
  - Effect: `(data, axis) => SetAxisTransition(axis, data.ValueOrDelta, data.DeltaTime, offset: data.IsRelative)`.

- **"Axis::Sync"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1619–1620`
  - Types: `DeviceAxis`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`.
  - Effect: `axis => { if (axis != null) ResetSync(true, axis); }`.

- **"Axis::Sync::Cancel"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1622–1623`
  - Types: `DeviceAxis`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`.
  - Effect: `axis => { if (axis != null) ResetSync(false, axis); }`.

- **"Axis::SyncAll"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1625–1625`
  - Types: `none`.
  - Config: none.
  - Effect: `() => ResetSync(true, null)`.

- **"Axis::SyncAll::Cancel"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1626–1626`
  - Types: `none`.
  - Config: none.
  - Effect: `() => ResetSync(false, null)`.

- **"Axis::Lock::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1630–1633`
  - Types: `DeviceAxis, bool`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Lock axis")`.
  - Effect: `(axis, enabled) => UpdateSettings(axis, s => s.LockScript = enabled)`.

- **"Axis::Lock::Toggle"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1635–1636`
  - Types: `DeviceAxis`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`.
  - Effect: `axis => UpdateSettings(axis, s => s.LockScript = !s.LockScript)`.

- **"Axis::LockAll::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1638–1640`
  - Types: `bool`.
  - Config: `s => s.WithLabel("Lock axes")`.
  - Effect: `enabled => UpdateAllSettings(s => s.LockScript = enabled)`.

- **"Axis::LockAll::Toggle"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1642–1642`
  - Types: `none`.
  - Config: none.
  - Effect: `() => UpdateAllSettings(s => s.LockScript = !s.LockScript)`.

- **"Axis::Bypass::All::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1646–1658`
  - Types: `DeviceAxis, bool`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Bypass all")`.
  - Effect: `(axis, enabled) => { if (axis == null) return; var settings = AxisSettings[axis]; settings.BypassScript = enabled; settings.BypassMotionProvider = enabled; settings.BypassTransition = enabled; }`.

- **"Axis::Bypass::All::Toggle"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1660–1671`
  - Types: `DeviceAxis`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`.
  - Effect: `axis => { if (axis == null) return; var settings = AxisSettings[axis]; var state = settings.BypassScript || settings.BypassMotionProvider || settings.BypassTransition; settings.BypassScript = !state; settings.BypassMotionProvider = !state; settings.BypassTransition = !state; }`.

- **"Axis::Bypass::Script::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1675–1678`
  - Types: `DeviceAxis, bool`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Bypass script")`.
  - Effect: `(axis, enabled) => UpdateSettings(axis, s => s.BypassScript = enabled)`.

- **"Axis::Bypass::Script::Toggle"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1680–1681`
  - Types: `DeviceAxis`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`.
  - Effect: `axis => UpdateSettings(axis, s => s.BypassScript = !s.BypassScript)`.

- **"Axis::Bypass::MotionProvider::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1685–1688`
  - Types: `DeviceAxis, bool`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Bypass motion provider")`.
  - Effect: `(axis, enabled) => UpdateSettings(axis, s => s.BypassMotionProvider = enabled)`.

- **"Axis::Bypass::MotionProvider::Toggle"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1690–1691`
  - Types: `DeviceAxis`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`.
  - Effect: `axis => UpdateSettings(axis, s => s.BypassMotionProvider = !s.BypassMotionProvider)`.

- **"Axis::Bypass::Transition::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1695–1698`
  - Types: `DeviceAxis, bool`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Bypass custom transition")`.
  - Effect: `(axis, enabled) => UpdateSettings(axis, s => s.BypassTransition = enabled)`.

- **"Axis::Bypass::Transition::Toggle"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1700–1701`
  - Types: `DeviceAxis`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`.
  - Effect: `axis => UpdateSettings(axis, s => s.BypassTransition = !s.BypassTransition)`.

- **"Axis::ClearScript"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1705–1706`
  - Types: `DeviceAxis`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`.
  - Effect: `axis => { if (axis != null) OnAxisClear(axis); }`.

- **"Axis::ReloadScript"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1710–1711`
  - Types: `DeviceAxis`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`.
  - Effect: `axis => { if (axis != null) OnAxisReload(axis); }`.

- **"Axis::InterpolationType::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1715–1718`
  - Types: `DeviceAxis, InterpolationType`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Interpolation").WithItemsSource(Enum.GetValues<InterpolationType>())`.
  - Effect: `(axis, type) => UpdateSettings(axis, s => s.InterpolationType = type)`.

- **"Axis::InvertScript::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1722–1725`
  - Types: `DeviceAxis, bool`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Invert script")`.
  - Effect: `(axis, enabled) => UpdateSettings(axis, s => s.InvertScript = enabled)`.

- **"Axis::InvertScript::Toggle"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1727–1728`
  - Types: `DeviceAxis`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`.
  - Effect: `axis => UpdateSettings(axis, s => s.InvertScript = !s.InvertScript)`.

- **"Axis::LinkPriority::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1732–1735`
  - Types: `DeviceAxis, bool`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Link has priority").WithDescription("When enabled the link has priority\nover automatically loaded scripts")`.
  - Effect: `(axis, enabled) => UpdateSettings(axis, s => s.LinkAxisHasPriority = enabled)`.

- **"Axis::LinkPriority::Toggle"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1737–1738`
  - Types: `DeviceAxis`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`.
  - Effect: `axis => UpdateSettings(axis, s => s.LinkAxisHasPriority = !s.LinkAxisHasPriority)`.

- **"Axis::SmartLimitInputAxis::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1742–1752`
  - Types: `DeviceAxis, DeviceAxis`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Input axis").WithItemsSource(DeviceAxis.All)`.
  - Effect: `(source, input) => { if (source == null || source == input) return; ResetSync(true, source); AxisSettings[source].SmartLimitInputAxis = input; }`.

- **"Axis::SmartLimitMode::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1756–1759`
  - Types: `DeviceAxis, SmartLimitMode`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Smart limit mode").WithItemsSource(Enum.GetValues<SmartLimitMode>())`.
  - Effect: `(axis, mode) => UpdateSettings(axis, s => s.SmartLimitMode = mode)`.

- **"Axis::SmartLimitTargetValue::Offset"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1763–1766`
  - Types: `DeviceAxis, double`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Value offset").AsNumericUpDown(-1, 1, 0.01, "{0:P0}")`.
  - Effect: `(axis, offset) => UpdateSettings(axis, s => s.SmartLimitTargetValue = MathUtils.Clamp01(s.SmartLimitTargetValue + offset))`.

- **"Axis::SmartLimitTargetValue::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1768–1771`
  - Types: `DeviceAxis, double`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Value").AsNumericUpDown(0, 1, 0.01, "{0:P0}")`.
  - Effect: `(axis, value) => UpdateSettings(axis, s => s.SmartLimitTargetValue = MathUtils.Clamp01(value))`.

- **"Axis::SmartLimitPoints::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1775–1780`
  - Types: `DeviceAxis, ObservableConcurrentCollection<Point>`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithDefaultValue([new(50, 50)]) .WithTemplateName("SmartLimitPointsTemplate") .WithCustomToString(x => $"Points({x.Count})")`.
  - Effect: `(axis, points) => UpdateSettings(axis, s => s.SmartLimitPoints.SetFrom(points))`.

- **"Axis::LinkAxis::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1784–1794`
  - Types: `DeviceAxis, DeviceAxis`.
  - Config: `s => s.WithLabel("Source axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`.
  - Effect: `(source, target) => { if (source == null || source == target) return; AxisSettings[source].LinkAxis = target; ReloadAxes(source); }`.

- **"Axis::SpeedLimitEnabled::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1798–1801`
  - Types: `DeviceAxis, bool`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Speed limit enabled")`.
  - Effect: `(axis, enabled) => UpdateSettings(axis, s => s.SpeedLimitEnabled = enabled)`.

- **"Axis::SpeedLimitEnabled::Toggle"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1803–1804`
  - Types: `DeviceAxis`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`.
  - Effect: `axis => UpdateSettings(axis, s => s.SpeedLimitEnabled = !s.SpeedLimitEnabled)`.

- **"Axis::SpeedLimitSecondsPerUnit::Offset"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1811–1814`
  - Types: `DeviceAxis, double`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Value offset").AsNumericUpDown(stringFormat: "{0:F3} s/unit")`.
  - Effect: `(axis, offset) => UpdateSettings(axis, s => s.SpeedLimitUnitsPerSecond = NormalizeSpeedUnits(InvertSpeedUnits(InvertSpeedUnits(s.SpeedLimitUnitsPerSecond) + offset)))`.

- **"Axis::SpeedLimitSecondsPerUnit::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1816–1819`
  - Types: `DeviceAxis, double`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Value").AsNumericUpDown(minimum: 0, stringFormat: "{0:F3} s/unit")`.
  - Effect: `(axis, value) => UpdateSettings(axis, s => s.SpeedLimitUnitsPerSecond = NormalizeSpeedUnits(InvertSpeedUnits(value)))`.

- **"Axis::SpeedLimitUnitsPerSecond::Offset"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1823–1826`
  - Types: `DeviceAxis, double`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Value offset").AsNumericUpDown(stringFormat: "{0:F2} units/s")`.
  - Effect: `(axis, offset) => UpdateSettings(axis, s => s.SpeedLimitUnitsPerSecond = NormalizeSpeedUnits(s.SpeedLimitUnitsPerSecond + offset))`.

- **"Axis::SpeedLimitUnitsPerSecond::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1828–1831`
  - Types: `DeviceAxis, double`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Value").AsNumericUpDown(minimum: 0, stringFormat: "{0:F2} units/s")`.
  - Effect: `(axis, value) => UpdateSettings(axis, s => s.SpeedLimitUnitsPerSecond = NormalizeSpeedUnits(value))`.

- **"Axis::AutoHomeEnabled::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1835–1838`
  - Types: `DeviceAxis, bool`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Auto home enabled")`.
  - Effect: `(axis, enabled) => UpdateSettings(axis, s => s.AutoHomeEnabled = enabled)`.

- **"Axis::AutoHomeEnabled::Toggle"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1840–1841`
  - Types: `DeviceAxis`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`.
  - Effect: `axis => UpdateSettings(axis, s => s.AutoHomeEnabled = !s.AutoHomeEnabled)`.

- **"Axis::AutoHomeDelay::Offset"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1845–1848`
  - Types: `DeviceAxis, double`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Value offset").AsNumericUpDown(stringFormat: "{0:F2}s")`.
  - Effect: `(axis, offset) => UpdateSettings(axis, s => s.AutoHomeDelay = Math.Max(0, s.AutoHomeDelay + offset))`.

- **"Axis::AutoHomeDelay::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1850–1853`
  - Types: `DeviceAxis, double`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Value").AsNumericUpDown(minimum: 0, stringFormat: "{0:F2}s")`.
  - Effect: `(axis, value) => UpdateSettings(axis, s => s.AutoHomeDelay = Math.Max(0, value))`.

- **"Axis::AutoHomeInsideScript::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1857–1860`
  - Types: `DeviceAxis, bool`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Auto home inside script")`.
  - Effect: `(axis, enabled) => UpdateSettings(axis, s => s.AutoHomeInsideScript = enabled)`.

- **"Axis::AutoHomeInsideScript::Toggle"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1862–1863`
  - Types: `DeviceAxis`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`.
  - Effect: `axis => UpdateSettings(axis, s => s.AutoHomeInsideScript = !s.AutoHomeInsideScript)`.

- **"Axis::AutoHomeDuration::Offset"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1867–1870`
  - Types: `DeviceAxis, double`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Value offset").AsNumericUpDown(stringFormat: "{0:F2}s")`.
  - Effect: `(axis, offset) => UpdateSettings(axis, s => s.AutoHomeDuration = Math.Max(0, s.AutoHomeDuration + offset))`.

- **"Axis::AutoHomeDuration::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1872–1875`
  - Types: `DeviceAxis, double`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Value").AsNumericUpDown(minimum: 0, stringFormat: "{0:F2}s")`.
  - Effect: `(axis, value) => UpdateSettings(axis, s => s.AutoHomeDuration = Math.Max(0, value))`.

- **"Axis::AutoHomeTargetValue::Offset"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1879–1882`
  - Types: `DeviceAxis, double`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Value offset").AsNumericUpDown(-1, 1, 0.01, "{0:P0}")`.
  - Effect: `(axis, offset) => UpdateSettings(axis, s => s.AutoHomeTargetValue = MathUtils.Clamp01(s.AutoHomeTargetValue + offset))`.

- **"Axis::AutoHomeTargetValue::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1884–1887`
  - Types: `DeviceAxis, double`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Value").AsNumericUpDown(0, 1, 0.01, "{0:P0}")`.
  - Effect: `(axis, value) => UpdateSettings(axis, s => s.AutoHomeTargetValue = MathUtils.Clamp01(value))`.

- **"Axis::ScriptOffset::Offset"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1891–1894`
  - Types: `DeviceAxis, double`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Value offset").AsNumericUpDown(stringFormat: "{0:F2}s")`.
  - Effect: `(axis, offset) => UpdateSettings(axis, s => s.Offset += offset)`.

- **"Axis::ScriptOffset::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1896–1899`
  - Types: `DeviceAxis, double`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Value").AsNumericUpDown(stringFormat: "{0:F2}s")`.
  - Effect: `(axis, value) => UpdateSettings(axis, s => s.Offset = value)`.

- **"Axis::ScriptScale::Offset"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1903–1906`
  - Types: `DeviceAxis, double`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Value offset").AsNumericUpDown(-4, 4, 0.01, "{0:P0}")`.
  - Effect: `(axis, offset) => UpdateSettings(axis, s => s.ScriptScale = Math.Clamp(s.ScriptScale + offset, 0.01, 4))`.

- **"Axis::ScriptScale::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1908–1911`
  - Types: `DeviceAxis, double`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Value").AsNumericUpDown(0.01, 4, 0.01, "{0:P0}")`.
  - Effect: `(axis, value) => UpdateSettings(axis, s => s.ScriptScale = Math.Clamp(value, 0.01, 4))`.

- **"Axis::MotionProvider::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1916–1919`
  - Types: `DeviceAxis, string`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Motion provider").WithItemsSource(motionProviderNames)`.
  - Effect: `(axis, motionProviderName) => UpdateSettings(axis, s => s.SelectedMotionProvider = motionProviderNames.Contains(motionProviderName) ? motionProviderName : null)`.

- **"Axis::MotionProviderBlend::Offset"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1925–1928`
  - Types: `DeviceAxis, double`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Value offset").AsNumericUpDown(-1, 1, 0.01, "{0:P0}")`.
  - Effect: `(axis, offset) => UpdateSettings(axis, s => s.MotionProviderBlend = MathUtils.Clamp01(s.MotionProviderBlend + offset))`.

- **"Axis::MotionProviderBlend::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1930–1933`
  - Types: `DeviceAxis, double`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Value").AsNumericUpDown(0, 1, 0.01, "{0:P0}")`.
  - Effect: `(axis, value) => UpdateSettings(axis, s => s.MotionProviderBlend = MathUtils.Clamp01(value))`.

- **"Axis::MotionProviderBlend::Drive"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1935–1937`
  - Types: `IAxisInputGestureData, DeviceAxis`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`.
  - Effect: `(data, axis) => UpdateSettings(axis, s => s.MotionProviderBlend = MathUtils.Clamp01(data.ApplyTo(s.MotionProviderBlend)))`.

- **"Axis::MotionProviderFillGaps::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1941–1944`
  - Types: `DeviceAxis, bool`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Fill gaps")`.
  - Effect: `(axis, enabled) => UpdateSettings(axis, s => s.MotionProviderFillGaps = enabled)`.

- **"Axis::MotionProviderFillGaps::Toggle"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1946–1947`
  - Types: `DeviceAxis`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`.
  - Effect: `axis => UpdateSettings(axis, s => s.MotionProviderFillGaps = !s.MotionProviderFillGaps)`.

- **"Axis::MotionProviderMinimumGapDuration::Offset"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1951–1954`
  - Types: `DeviceAxis, double`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Value offset").AsNumericUpDown(stringFormat: "{0:F2}s")`.
  - Effect: `(axis, offset) => UpdateSettings(axis, s => s.MotionProviderMinimumGapDuration = Math.Max(0, s.MotionProviderMinimumGapDuration + offset))`.

- **"Axis::MotionProviderMinimumGapDuration::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1956–1959`
  - Types: `DeviceAxis, double`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Value").AsNumericUpDown(minimum: 0, stringFormat: "{0:F2}s")`.
  - Effect: `(axis, value) => UpdateSettings(axis, s => s.MotionProviderMinimumGapDuration = Math.Max(0, value))`.

- **"Axis::UpdateMotionProviderWithAxis::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1963–1973`
  - Types: `DeviceAxis, DeviceAxis`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Input axis").WithItemsSource(DeviceAxis.All)`.
  - Effect: `(source, input) => { if (source == null || source == input) return; ResetSync(true, source); AxisSettings[source].UpdateMotionProviderWithAxis = input; }`.

- **"Axis::UpdateMotionProviderWhenPaused::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1977–1980`
  - Types: `DeviceAxis, bool`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Update motion providers when paused")`.
  - Effect: `(axis, enabled) => UpdateSettings(axis, s => s.UpdateMotionProviderWhenPaused = enabled)`.

- **"Axis::UpdateMotionProviderWhenPaused::Toggle"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1982–1983`
  - Types: `DeviceAxis`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`.
  - Effect: `axis => UpdateSettings(axis, s => s.UpdateMotionProviderWhenPaused = !s.UpdateMotionProviderWhenPaused)`.

- **"Axis::UpdateMotionProviderWithoutScript::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1987–1990`
  - Types: `DeviceAxis, bool`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`; `s => s.WithLabel("Update motion providers without script")`.
  - Effect: `(axis, enabled) => UpdateSettings(axis, s => s.UpdateMotionProviderWithoutScript = enabled)`.

- **"Axis::UpdateMotionProviderWithoutScript::Toggle"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1992–1993`
  - Types: `DeviceAxis`.
  - Config: `s => s.WithLabel("Target axis").WithItemsSource(DeviceAxis.All)`.
  - Effect: `axis => UpdateSettings(axis, s => s.UpdateMotionProviderWithoutScript = !s.UpdateMotionProviderWithoutScript)`.

- **"Sync::Duration::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:1997–1999`
  - Types: `double`.
  - Config: `s => s.WithLabel("Value").WithDefaultValue(4).AsNumericUpDown(0.5, 8, 0.5, "{0:F1}")`.
  - Effect: `value => SyncSettings.Duration = Math.Clamp(value, 0.5, 8)`.

- **"Sync::SyncOnMediaResourceChanged::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:2003–2004`
  - Types: `bool`.
  - Config: `s => s.WithLabel("Sync on media resource changed enabled")`.
  - Effect: `value => SyncSettings.SyncOnMediaResourceChanged = value`.

- **"Sync::SyncOnScriptResourceChanged::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:2008–2009`
  - Types: `bool`.
  - Config: `s => s.WithLabel("Sync on script resource changed enabled")`.
  - Effect: `value => SyncSettings.SyncOnScriptResourceChanged = value`.

- **"Sync::SyncOnMediaPlayPause::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:2013–2014`
  - Types: `bool`.
  - Config: `s => s.WithLabel("Sync on media play/pause enabled")`.
  - Effect: `value => SyncSettings.SyncOnMediaPlayPause = value`.

- **"Sync::SyncOnSeek::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:2018–2019`
  - Types: `bool`.
  - Config: `s => s.WithLabel("Sync on media seek enabled")`.
  - Effect: `value => SyncSettings.SyncOnSeek = value`.

- **"Sync::SyncOnAutoHomeStartEnd::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs:2023–2024`
  - Types: `bool`.
  - Config: `s => s.WithLabel("Sync on auto-home start/end enabled")`.
  - Effect: `value => SyncSettings.SyncOnAutoHomeStartEnd = value`.

### Source/MultiFunPlayer/UI/Controls/ViewModels/ShortcutSettingsViewModel.cs

- **"Shortcut::Enabled::Set"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ShortcutSettingsViewModel.cs:283–286`
  - Types: `string, bool`.
  - Config: `s => s.WithLabel("Target shortcut name")`; `s => s.WithLabel("Enabled")`.
  - Effect: `(shortcutName, enabled) => UpdateSettings(shortcutName, s => s.Enabled = enabled)`.

- **"Shortcut::Enabled::Toggle"** — `Source/MultiFunPlayer/UI/Controls/ViewModels/ShortcutSettingsViewModel.cs:288–290`
  - Types: `string`.
  - Config: `s => s.WithLabel("Target shortcut name")`.
  - Effect: `shortcutName => UpdateSettings(shortcutName, s => s.Enabled = !s.Enabled)`.

