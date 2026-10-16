# MultiFunPlayer upstream UI parity audit

Date: 2026-10-16. Scope: read-only inspection of upstream `Source/`, `README.md`, and the actual pixels of `Assets/screenshot.png` in the fork checkout. No Windows application was launched and no GUI automation was used. The audit did not change application code; this report is retained with the port.

Checkout HEAD at inspection: `820d6bfc8fbef2c673b5b41288dcc0bff0684492`. Latest commit affecting the inspected upstream source/README/screenshot set reported by git: `36c08fb` (`Merge branch 'develop'`). The README screenshot itself displays `v1.32.0.ed66f79`; it is a visual reference, not proof that every current source state matches that historical image.

All paths below are relative to the repository root. `UI/…`, `MediaSource/…`, `OutputTarget/…`, `MotionProvider/…`, `Common/…`, and `Script/…` abbreviate `Source/MultiFunPlayer/…`. Line references refer to this inspected source snapshot.

## 1. Result and fidelity contract

The original is a compact, dense Material/WPF control surface with tab strips, narrow icon toolbars, collapsible settings, a script heatmap, a chapter/bookmark strip, axis status indicators, and output range controls. A spacious dark teal dashboard with large standalone source/library/sync/output cards does not reproduce its layout or interaction model.

Faithful tablet/PC implementation should preserve the original group order, horizontal-mode column assignment, icon/action order, status semantics, theme tokens, tab behavior, and progressive disclosure. Phone support should rearrange those same components and make mouse-only actions touch-accessible. It should not omit panels or replace the original control model with a different dashboard.

Evidence levels used here:
- **S: source-proven** — XAML, code, bindings, or defaults in this checkout.
- **V: image-observed** — visible in the bundled README screenshot, which was inspected directly.
- **R: runtime verification needed** — exact visual/interaction behavior cannot honestly be claimed without running the Windows reference or target device.
- **P: proposed adaptation** — recommended touch/layout behavior; not represented as something the Windows original already does.

### Main-screen priorities

1. **P0, recognizable shell:** restore original vertical stack and horizontal grouping, blue-grey/light default, compact title bar, source/output tabs, original two toolbar rows, heatmap, marker strip, axis tabs/dots, axis-values expander.
2. **P0, truthful interaction:** tabs select actual persistent instances; connect/play are distinct; controls show disabled/busy/connected states; a visual control never pretends an unsupported backend works.
3. **P1, complete main panels:** every axis popup, file/offset/scale fields, source settings, output range grid/update settings, repositories and path modifiers.
4. **P1, touch equivalence:** explicit access to heatmap options/axis selection/preview, marker details, numeric editing, curve-point actions, close/back, drag-and-drop alternatives.
5. **P2, global settings and ancillary panels:** General, Device, Theme, Input, Shortcuts, Plugins, Information; platform-specific capabilities require real implementation or clearly identified limitations, not silent removal.
6. **Release gate:** static matching is not final UI parity. Compare Windows reference captures and OHOS captures in matched states, then test touch/keyboard/mouse and state preservation.

## 2. Original window and main layout

### 2.1 Window shell (S + V)

`RootView.xaml:9–31,33–148`:
- Title is MultiFunPlayer, with play logo, a separator, version, plugin/power-plug button, settings/cog, information/help, then native window controls.
- Default window width is 600 logical WPF units; minimum height 300; content sizes to height; default resize mode permits minimizing. Body font size is 13, regular weight, MaterialDesign font family and body color.
- Background is `MaterialDesignPaper`; border thickness is 1; no fading of content when inactive.
- Help/update icon pulses opacity and size when an update is available (`RootView.xaml:80–119`).
- Root uses a dialog host, scroll viewer, and snackbar (`149–199`). There is no embedded video viewport in the upstream root screen. Native OHOS video playback may be a useful port addition, but should be identified and placed as such rather than taken as upstream appearance.

`UI/Controls/ViewModels/GeneralSettingsViewModel.cs:77–86` sets the full window width/min/max to 600 in Vertical and 1200 in Horizontal mode. General allows resizing separately. Do not confuse the fixed source defaults with arbitrary fluid desktop cards.

### 2.2 Vertical mode (S)

`RootView.xaml:160–165`: one stack, outer margin 10, in this exact order:
1. Plugin content, when present
2. Media sources
3. Script area, itself comprising media toolbar, heatmap, marker strip, axis tab/toolbar/settings, and axis values
4. Output targets

Source card bottom gap is 20 (`MediaSourceView.xaml:20`); script outer bottom gap is 20 (`ScriptView.xaml:26`); media toolbar card bottom gap is 10 (`27`); heatmap height 36 with gap 4 (`380–393`); marker strip height 18 with bottom gap 20 (`436–443`); axis card gap to values is 10 (`444`); major cards use shallow Depth1 shadows.

### 2.3 Horizontal mode (S)

`RootView.xaml:169–188`: two 600-unit columns. Left column contains Plugin → MediaSource → OutputTarget, with margin 10. Right column contains Script, with margin 10. This is important: putting timeline/axes on the left and source/output on the right reverses the original layout.

### 2.4 Bundled screenshot (V)

`README.md:5` references `Assets/screenshot.png`, inspected as a 600 × 480 image.
- Light paper background, modest rounded cards/shadows, blue-grey title bar, monochrome compact icons.
- Top source tabs HereSphere, Internal, MPV; status shown under each name. HereSphere/Internal are red Disconnected, MPV green Connected; MPV selected with pale blue-grey fill/underline.
- Media toolbar has folder, repository, path-modifier, map-path, auto-skip, AB controls left; green Play and sync indicator right; chevron at far right.
- Thin, full-width heatmap and colored chapter strip sit between transport and axes.
- Axis tabs show L0, R0, R1, R2, A1, A2 with tiny status dots. These are the screenshot's enabled/configured axes, **not the complete supported axis set**.
- Axis toolbar ends with friendly label UP/DOWN and expansion chevron.
- Collapsed AXIS VALUES row.
- Bottom tabs Serial and UDP; selected Serial shows instance index 0 and close button; Add and common-settings cog stay on the right.
- The screenshot does not establish expanded settings geometry, dark-mode styling, empty startup states, or phone behavior.

## 3. Source, transport, timeline, axes, and output components

### 3.1 Media-source tab group (S)

`UI/Controls/Views/MediaSourceView.xaml:20–186`:
- A `NonReloadingTabControl` binds Items and ActiveItem. Each tab's name sits over a 10px status label, in a 75-unit-wide content stack with 10-unit side margins.
- Plus opens **Toggle media source**, listing all available sources. Existing visible sources are highlighted and action tooltip changes from Show to Hide (`45–99`). This differs from output Add, which creates new instances.
- Common-settings cog opens **Media source settings**: scan delay and scan interval in milliseconds; initial delay notes that restart is required (`101–184`).
- Tab-strip scrolling is horizontal, not wrapping by default; additional Add/settings content is docked to the right (`UI/Themes/TabControl.xaml:117–160`). The non-reloading control preserves view instances across tab switches (`UI/Controls/NonReloadingTabControl.cs`).

Every source view exposes a distinct connection button, which changes Play to Stop and Connect to Disconnect; busy progress overlays the button and availability is bound to CanToggleConnect. Most expose an auto-connect toggle, then source settings behind the far-right expander. Example: `MediaSource/Views/DeoVRMediaSource.xaml:15–91`.

Source-specific settings inventory:

| Source | Controls beyond shared connect/auto-connect | Evidence |
|---|---|---|
| DeoVR, HereSphere, MPC, Whirligig | Endpoint editor | Corresponding `MediaSource/Views/*MediaSource.xaml`, endpoint rows near 78–89 |
| VLC | Endpoint and password | `VlcMediaSource.xaml:77–105` |
| MPV | Auto-start; executable path selection; Download MPV action; arguments | `MpvMediaSource.xaml:78–145` |
| PotPlayer | Auto-start | `PotPlayerMediaSource.xaml:78–99` |
| OpenFunscripter | Endpoint; Force seek switch/help | `OfsMediaSource.xaml:79–129` |
| Plex | Endpoint; refresh clients; client dropdown with name, device class, product, address and port; token input | `PlexMediaSource.xaml:77–184` |
| Emby, Jellyfin | Endpoint; refresh devices; dropdown with name/app/version; API key | `EmbyMediaSource.xaml:77–173`, `JellyfinMediaSource.xaml:77–173` |
| Internal | Script playlist, not an embedded movie player | `InternalMediaSource.xaml:18–431` |

Internal details (`InternalMediaSource.xaml`): connect, auto-connect, load additional scripts, loop, shuffle, previous, next (`67–181`); refresh playlist, remove missing entries, clear playlist (`38–64`); playlist current/total badges; drop-scripts empty state; per-row play, index, name and remove (`185–429`). Expander is enabled only while Connected (`18–33`). Port needs a system-file-picker equivalent for dropping scripts and must retain the playlist controls.

### 3.2 Global media/transport toolbar (S)

`UI/Controls/Views/ScriptView.xaml:27–378`. Toolbar height 36; expander opens **File** (read-only name, source hint) and **Offset** (global offset in seconds, numeric step 0.1, displayed 2 decimals; `347–375`). This is separate from per-axis offset.

Left-to-right actions:
1. **Open media location** — FolderOpen icon; disabled without media.
2. **Script repositories** — DatabaseSearch; manager dialog.
3. **Media path modifiers** — FileReplaceOutline; ordered modifier dialog.
4. **Map media path to file** — LinkPlus; enabled only for media URLs.
5. **Auto-skip** — SkipForward popup: Enabled and Offset, non-positive seconds, 0.1 step.
6. **Media loop** — AB menu: Clear, Set start, Set end, Repeat chapter. AB turns green when a valid start/end pair exists.

Right:
- **Play/Pause** (`35–66`): green Play when stopped, red Pause when playing. This is media playback, not connection.
- **Sync settings** (`68–202`): fast-forward inside circular progress; primary color normally, red while syncing. Duration slider 0.5–8 seconds, 0.5 increments. Seven toggles: media resource changed, script resource changed, script start, script end, media play/pause, media seek, auto-home start/end. Help warns this prevents sudden unwanted motion and settings are advanced.
- Expansion chevron, supplied by expander theme.

Defaults in `UI/Controls/ViewModels/ScriptViewModel.cs:68–78,2411–2420`: media, axis, values settings collapsed; global offset 0; auto-skip enabled with -5s offset; sync duration 4s with all seven triggers enabled. Preserved user settings may change initial state.

### 3.3 Heatmap and markers (S)

`ScriptView.xaml:380–443` and `UI/Controls/KeyframesHeatmap.xaml`:
- Heatmap is a 36-unit range polygon filled with heat gradient; alternate mode is a filled rectangle. Background is a checkerboard. A 4-unit bordered playhead tracks media position.
- Source heat ramp: `#244b5c → #75b9d1 → #efce62 → #f39944 → #f53e2e`; source computes gradient from keyframes, rather than a decorative waveform. `KeyframesHeatmap.xaml.cs:223–235,304–398`.
- Click seeks proportionally to media duration, only with valid duration/dimensions (`256–265`).
- Mouse wheel selects a heatmap preview axis independently via `_selectedAxisIndex`; it is **not zoom** (`267–276`).
- Hover displays time and optional script preview for selected axis (`238–301`; `KeyframesHeatmapToolTip.xaml`).
- Context menu: Show script range, Enable script preview, Combine script heat, Invert Y, and Quality bucket-count slider 100–500 (`KeyframesHeatmap.xaml.cs:19`) (`ScriptView.xaml:394–433`). Defaults range/preview/combine true, 333 buckets, invert false (`ScriptViewModel.cs:72–76`).
- Markers: separate 18-unit chapter/bookmark strip, same checkerboard style, colored chapter spans and bookmarks. Hover reveals name and millisecond-formatted time or start/end range. Chapter-start edge, chapter-end edge, and bookmark click seek to exact positions (`MarkersPreview.xaml:41–196`; `.xaml.cs:216–255`). Chapter edge hit regions are only 6 units in original, unsuitable unchanged for touch.
- Chapter colors cycle through `#d94452`, `#e86c3f`, `#f5ba45`, `#8ac045`, `#35bb9b`, `#5690dc`, `#967ada` (`MarkersPreview.xaml.cs:135–150`).
- Current marker code takes first available non-null chapter/bookmark collection (`MarkersPreview.xaml.cs:147–213`); do not claim it simultaneously displays every axis's markers without checking behavior.

### 3.4 Axis tabs and live status (S)

`ScriptView.xaml:444–686`:
- Axis models populate a horizontal tab strip; each tab content is 46 × 36 units.
- Label is disabled-colored without script, bold theme foreground when script loaded, red when bypassing script or when locked with a script.
- Four 6-unit dots, in order: **Link axis**, **Motion provider**, **Speed limit**, **Smart limit**.
- Dots are neutral when disabled, green when enabled, red for override/active limiting as appropriate. Motion bypass returns its dot to neutral. Hover text explains Disabled/Enabled/Override/Bypass/Active (`480–680`).
- Source has a small inconsistency worth preserving or explicitly deciding: the link toolbar icon stays green for priority, while the link dot and tooltip use red for priority/Override (`881–885` vs `502–505,604–605`). Do not flatten the different meanings into a universal “green active” badge.
- Friendly axis name appears at the right of the action strip, uppercase-small-caps style, theme foreground (`695–704`).
- Axis sets derive from selected device. TCode 0.2 and 0.3 profiles contain L0/L1/L2/R0/R1/R2 and additional V/A axes, some disabled by default; custom profiles can alter names and enable axes (`Common/DeviceSettings.cs:22–62`). Do not hard-code only the screenshot's six tabs or assume only six axes are supported.

### 3.5 Axis action strip and popup inventory (S)

`ScriptView.xaml:687–1604`. Nine actions in exact order:

| Action / source icon | Fields and behavior | Source lines |
|---|---|---|
| **Script / File** | Open folder; Load; Clear; Reload; Lock/Unlock. Loading/reloading require a media resource; folder/clear require a script. Locked action is red. | 706–756 |
| **Invert script / FlipVertical** | Direct toggle; green when inverted, muted normally. | 758–773 |
| **Bypass / MotionPauseOutline** | Bypass all; Disable all; separate Script, Motion provider, Custom transition toggles. Toolbar icon turns red when any bypass is on. | 775–866 |
| **Link script / LinkVariant** | Clearable target axis selector and Priority. Help explains precedence. | 868–934 |
| **Motion / Motion** | Clearable provider selector, collapsible Common settings, plus provider-specific UI. Common fields: blend Script↔Provider, gap fill, minimum gap duration, match selected axis speed, update when media paused, when own axis has no script, and when selected axis is moving. | 936–1160 |
| **Smart limit / ChartSnakeyVariant** | Clearable input axis, editable point curve with animated preview, mode Value/Speed, conditional target value, explanatory live input/output percentage text. | 1163–1344 |
| **Speed limit / CarSpeedLimiter** | Enabled, unit-per-second limit and reciprocal s/unit display; help. | 1347–1419 |
| **Interpolation / ChartBellCurve** | 160 × 80 interpolation preview and Type selector. Enum is Linear, Pchip, Makima, Step. | 1423–1452; `Common/Utils/MathUtils.cs:26–32` |
| **Auto-home / Home** | Enabled, Auto-home inside script, Delay, Duration, Target value. | 1454–1535 |

Expanded axis detail (`1540–1598`): read-only File with source hint and script drag-and-drop; numeric Offset in seconds (0.1 step, 2 decimals); Scale slider 1%–400%, 1% increments, numeric percentage display; double click resets scale to 100%. Do not replace these with only a global curve selector and ±50ms buttons. Those are not equivalent.

Axis values (`1606–1662`): separate expander, 3-column grid of axis label plus 155 × 10 linear progress bar, 0–100%, live value, no transition animation; distinct appearance outside a script. These are readouts, not manual sliders.

Motion-specific views:
- Random: speed, dual-ended range, noise preview, advanced octaves/persistence/lacunarity (`MotionProvider/Views/RandomMotionProvider.xaml`).
- Pattern: Triangle, Sine, DoubleBounce, SharpBounce, Saw, Square; speed and range (`PatternMotionProvider.xaml`; `MotionProvider/ViewModels/PatternMotionProvider.cs:11–19`).
- Looping Script: file selector/name, interpolation, speed, range (`LoopingScriptMotionProvider.xaml`).
- Custom Curve: interpolation, duration, speed, loop, reset, sync-on-end, range, editable 150-high point canvas and playhead (`CustomCurveMotionProvider.xaml:19–143`).
- Curve edit primitives are functional: drag a point, double-click point to delete while retaining at least one, double-click canvas to add; coordinates shown during interaction (`UI/Controls/DraggablePointCanvas.xaml.cs:193–259`). Smart limit uses this same editable primitive (`SmartLimitPreview.xaml:70–76`). A static line image does not provide parity.

### 3.6 Output targets and common controls (S)

`UI/Controls/Views/OutputTargetView.xaml:18–198`:
- Non-reloading, selectable instance tabs; each name above connection status.
- Selected tab shows instance index and small close/remove button (`23–61`).
- Plus means **Add output**, creating a new instance of selected available output type (`73–109`). Multiple outputs of the same type are explicitly supported; a single simulator switch is not equivalent.
- Common-settings dialog has scan delay/interval in ms, including restart note (`111–194`).

Typical output view (`OutputTarget/Views/UdpOutputTarget.xaml:25–227`):
- 36-high toolbar with connect/disconnect, busy progress, auto-connect, update-settings/timer-cog, far-right expander.
- Endpoint editable while disconnected.
- **Output Range**: 3-column per-axis grid. Each has an enabled toggle labeled with axis code and a dual-ended range slider bound to per-output minimum/maximum. Range 0–1; minimum span .01; lower/upper/range drag tooltips display percentages (`153–221`). A read-only axis progress bar does not replace this.
- Update popup selects supported update type, then renders its settings/diagnostics; type can be disabled depending on connection state (`88–127`).

Output-specific inventory:

| Output | Additional settings | Evidence |
|---|---|---|
| TCP, UDP | Endpoint, update type, per-axis ranges | `OutputTarget/Views/TcpOutputTarget.xaml`, `UdpOutputTarget.xaml` |
| WebSocket | URI endpoint, update type, per-axis ranges | `WebSocketOutputTarget.xaml` |
| Named pipe | Pipe-name entry, update type, per-axis ranges | `PipeOutputTarget.xaml` |
| Serial | Serial-port selector with device/manufacturer/device-ID details; Refresh; Advanced settings: baud, parity, stop/data bits, handshake, DTR/RTS, read/write timeouts, read/write buffer sizes; update type; per-axis ranges | `SerialOutputTarget.xaml:135–422` |
| Buttplug | Endpoint; Toggle scan; Fixed and Polled update settings; per-axis ranges; Device map with axis→device/actuator/index assignments, per-mapping update type, add/remove | `ButtplugOutputTarget.xaml:93–463` |
| File | Connect/Disconnect toolbar (starts/stops file output); output format; directory picker; fixed-update settings; per-axis ranges | `FileOutputTarget.xaml:27–218`; `OutputTarget/ViewModels/FileOutputTarget.cs:45–91` |
| The Handy | Explicit experimental warning; source axis; connection key; polled update settings; output range | `TheHandyOutputTarget.xaml:88–220` |

Update context templates (`OutputTarget/Views/UpdateContextTemplates.xaml`):
- Polled Thread/Async: average update error in milliseconds (`5–23`).
- Fixed Thread/Async: update-rate slider/display, average Hz and jitter; Thread includes precise-sleep toggle (`25–153`).
- TCode Fixed Thread/Async: same plus offload elapsed time and send dirty axes only; Thread includes precise sleep (`155–403`).
- Preserve units and conditional fields. Showing a static connected label or nominal Hz while backend cannot supply diagnostics is not parity.

## 4. Dialogs and settings

### 4.1 Settings container (S)

`UI/Controls/Views/SettingsView.xaml`: title/color-zone, Close, horizontally tabbed content. `UI/Controls/ViewModels/SettingsViewModel.cs:8–22` explicitly orders **General → Device → Theme → Input → Shortcut**.

| Settings tab | Required controls | Evidence |
|---|---|---|
| General | Always on top; Allow window resize; Remember window location; App Orientation; Show errors as; Log level; Enable UI logging; Enable JSON logging | `GeneralSettingsView.xaml:14–102` |
| Device | Device selector; remove, rename, export to clipboard, create from clipboard, clone; default-profile indicator; clone-to-customize notice; output precision; add axis; grid: Name, Friendly name, Funscript names, Default value, Enabled, Remove | `DeviceSettingsView.xaml:40–305` |
| Theme | Primary color picker; Light/Mid/Dark swatch preview; Dark mode; Color adjustments; Contrast; Contrast ratio 1–20; Reset | `ThemeSettingsView.xaml:14–104` |
| Input | Input processor tabs; gamepad left/right-thumb dead zones; mouse/wheel virtual zone width/height; mouse-axis update rate | `InputSettingsView.xaml:15–137` |
| Shortcut | Gesture capture/progress and captured-gesture choice; shortcut type and Add; shortcut list with enable/remove/name/gesture/action count; Actions and Settings sub-tabs; assign/configure/remove/reorder actions | `ShortcutSettingsView.xaml:470–978` |

Device nuances: the UI explicitly warns “All changes require application restart to apply” (`DeviceSettingsView.xaml:39`). Stock profile metadata fields are locked until cloned; enabled flags have their own editing path. Funscript-name matching list is ordered, and `*` matches without a funscript suffix (`DeviceSettingsView.xaml:191–279`). Defaults include profiles TCode-0.2 (precision 3) and TCode-0.3 (precision 4), plus customizable axes (`Common/DeviceSettings.cs`).

Shortcut-specific templates (`ShortcutSettingsView.xaml:16–460`): repeated press/release handling; hold minimum/maximum duration and invoke type; click count/maximum interval; axis drive mode/invert; axis threshold; axis offset mode/speed/invert; keyboard/mouse/gamepad descriptors. Action configuration dialog supports booleans, numeric values, strings, selections and a custom curve (`UI/Dialogs/Views/ShortcutActionConfigurationDialog.xaml:35–146`). Touch-only phones still need a defined way to manage supported external-input shortcuts, rather than hiding the category.

### 4.2 Script repositories (S)

`UI/Dialogs/Views/ScriptRepositoryManagerDialog.xaml`: named tabs with repository Enabled switch and Close.
- Local: add directory, remove, open location, recurse-subdirectories toggle, full path (`Script/Repository/Views/LocalScriptRepository.xaml`).
- XBVR: endpoint, Local match type, DMS match type with descriptions (`XBVRScriptRepository.xaml`).
- Stash: endpoint, API key, Local match type, DMS match type, conditional DMS match axis (`StashScriptRepository.xaml`).

A session-local file library may be a helpful OHOS addition, but does not cover these repository settings. Import/picker constraints should be explained inside the relevant control flow, not used to delete the original workflow.

### 4.3 Media path modifiers (S)

`UI/Dialogs/Views/MediaPathModifiersDialog.xaml`: add modifier type; ordered modifier list; move up/down; remove; close.
- Find/Replace: find string, replacement, case-match, regex (`MediaSource/MediaResource/Modifier/Views/FindReplaceMediaPathModifier.xaml`).
- Decode: decode type (`DecodeMediaPathModifier.xaml`).

### 4.4 Plugins, information, and feedback (S)

- `PluginView.xaml:14–40`: optional main card appears only with plugin views; plugin tabs have display name and optional custom status, and embed the plugin's UI.
- `PluginStatusView.xaml`: Plugins dialog; file list; compile action; Idle/Compiling/Running/Stopping/Stopped/Faulted status icons/colors, fault exception information. C# arbitrary plugin views are a real platform-porting issue and cannot be honestly equated to a decorative Plugins icon.
- `InformationView.xaml`: app/version/author, update information, Patreon, Documentation, GitHub, Close.
- `ErrorMessageDialog.xaml`: error message and Dismiss. `MessageBoxDialog.xaml`: conditional OK/Yes/No/Cancel. `TextInputMessageDialog.xaml`: label/input/confirm/cancel. Root snackbar and configurable error presentation also exist.
- Endpoint and URI controls are structured custom inputs with validation/focus styling (`UI/Controls/EndPointBox.xaml`, `UriBox.xaml`). Port should preserve invalid-input feedback and connected-state editing constraints.

## 5. Visual resources and exact source tokens

### Source-proven theme

`App.xaml:11–21,40–55` combines MahApps + MaterialDesign Light and BlueGrey, plus local color/button/card/expander/menu/popup/range-slider/scroll/tab/slider/text/tooltip/window resources. Packages pinned in `.csproj:39–41` include MahApps.Metro 2.4.9, MaterialDesignThemes 4.7.0 and MaterialDesignThemes.MahApps 0.2.6.

`UI/Controls/ViewModels/ThemeSettingsViewModel.cs:18–22,42–50` defaults:
- Primary color `#718792`
- Light theme; color adjustment disabled
- Contrast Medium, target contrast ratio 4.5
- Reset returns these values

`UI/Themes/Color.xaml:4–11` stock accent palette: `#cfd8dc`, `#b0bec5`, `#78909c`, `#455a64`. Primary shades at runtime are generated by the theme helper from chosen PrimaryColor; do not assume every resource always equals these stock accent entries.

| Semantic token | Light | Dark |
|---|---|---|
| Error | `#F00018` | `#FF4F52` |
| Pending | `#D6810B` | `#FFAF59` |
| Warning | `#FFD300` | `#FFD957` |
| Success | `#008C1A` | `#6ECC52` |
| Checkerboard | `#FFF` / `#F8F8F8` | `#282828` / `#202020` |
| Disabled body | `#80000000` | `#60FFFFFF` |
| Card hover | `#FFEBEBEB` | `#FF575757` |
| Card selected | `#FFDBDBDB` | `#FF6B6B6B` |

Evidence: `UI/Themes/Color.Light.xaml:2–18`, `Color.Dark.xaml:2–18`. Connection-state mapping explicitly uses green Connected, red Disconnected, pending color Connecting/Disconnecting (`TextBlock.xaml:2–16`).

### Component vocabulary

- Dense 36 × 36 toolbar hit boxes and 19–24-ish icon glyphs (`UI/Themes/Button.xaml`; views). Tablet/phone touch hit boxes may grow, while icon size, hierarchy, and order stay recognizable.
- Material icons are named in the XAML. Reuse equivalent vector paths for those names instead of emoji or unrelated icon families; exact stroke/fill appearance should be checked against Windows package rendering.
- Small elevation, compact radius, thin separators, selected-tab underline/highlight, muted inactive state, green/red semantic state. Avoid introducing large gradients, oversized headings, chips, or decorative statistics into the baseline screen.
- Expanded form margins commonly 20; popup interiors 10. Forms use labeled numeric inputs, switches, clearable combos, range sliders, and preview charts, rather than one universal large-button style.
- Desktop status is both textual and colored. Do not reduce status to color alone on touch.

## 6. Faithful tablet/PC and phone adaptation proposal (P)

### 6.1 Tablet/PC baseline

- Provide the original Vertical and Horizontal layouts as modes. At width sufficient for two original panels, use source/output left and script right. Preserve per-panel tab selection, expand/collapse, scroll positions, and model instances through orientation/size changes.
- On desktop with mouse/keyboard, retain right-click heatmap options, hover previews, wheel preview-axis selection, drag/drop loading, numeric-wheel editing, scale double-click reset, and point editing where supported.
- Scale spacing/hit targets for touch tablets without replacing the design. “Same UI” does not require shrinking controls until unusable.
- Keep version/help/settings/plugins in compact app chrome. Native PC window buttons may remain OS-provided; phone does not need fake minimize/maximize buttons.
- If local video is present as a port-specific source, place its preview within an appropriately labeled source expansion or explicit player mode so it does not displace the recognizable baseline without intent.

### 6.2 Phone portrait

- Use the original vertical stack as primary mental model: source tabs → media toolbar → heatmap/markers → axes → values → outputs. Small title bar and persistent compact transport visibility are acceptable touch additions; duplicate transport only if action/state remains synchronized.
- Source/output/axis tab strips scroll horizontally, with Add/settings visibly pinned for source/output. Keep selected connection state visible and give nonselected tab status a readable detail action.
- Increase tap targets to approximately 44–48 logical units as a design target, while preserving small icon visual size and compact cards. Wrap the axis toolbar into two ordered rows if necessary; do not remove less-common controls. Keep axis friendly name and selected axis unambiguous.
- Present popups as anchored sheets or full-height detail sheets when the original 195–250-unit popup would collide with keyboard/safe area. Preserve title, order, field labels, units, preview, disabled state, and Close/Back semantics.
- Expanded axis File takes a full row; Offset and Scale may stack. Axis values/output range grids use 1 or 2 columns as width demands. All axes remain available; do not cap at six.
- A device-profile DataGrid becomes list rows with complete axis-detail editor on portrait; landscape/tablet can retain the full grid. All fields and clone/import/export actions remain accessible.
- If supplemental navigation jumps to Source/Script/Output sections, it should be a convenience over these same components, not a separate reduced set of screens with hidden functionality.

### 6.3 Phone landscape

- If two readable compact columns fit, keep the original side assignment: source/output left, script right. Use independent vertical scrolling only after checking interactions against the reference; source desktop uses one root scroll container.
- If the usable height/width cannot support this, keep a single-column original-layout mode with section navigation rather than squeezing two unusable panels. Do not use orientation alone as evidence that 600+600 logical units fit a phone.
- Preserve active sheet, selected axis, fields, connection sessions, playback state and scroll context during rotation. Rotation must not reconnect outputs or restart media.

### 6.4 Required mouse→touch equivalents

| Original interaction | Touch-equivalent proposal |
|---|---|
| Hover toolbar tooltip | Press-and-hold label/help plus accessible name; actions remain one-tap |
| Heatmap hover preview | Press/hold or dedicated Preview mode with time/axis overlay; drag to inspect; clear distinction between preview and committing seek |
| Heatmap mouse wheel chooses axis | Explicit preview-axis selector or previous/next-axis affordance |
| Heatmap right-click options | Visible overflow/options button; long-press can be secondary access |
| 6-unit chapter edges | Tappable marker/details sheet with Start, End and Repeat chapter actions; retain exact times |
| Drop script onto axis | File picker from Script → Load and selected-axis File action; preserve axis destination |
| Drop Internal playlist scripts | Add files/folder picker in same playlist workflow |
| Numeric mouse wheel | Direct numeric keyboard plus stepper controls; show units and constraints |
| Scale double-click reset | Explicit Reset to 100% in scale context; double-tap optional |
| Curve double-click add/delete, drag | Large invisible handles; tap-select; explicit Add/Delete and numeric coordinate editor; drag retained |
| Dual-ended range thumb/range drag | Larger hit targets; clear lower/upper labels; direct numeric minimum/maximum entry for precision |
| Small close × on output tab | Accessible Remove action with clear target identity, preserving multi-instance model |
| Window/modal Close | Consistent close button and system Back closes topmost layer, retaining parent state |

These are proposed equivalents, not source-proven behavior. Test for collisions between vertical scrolling, heatmap seeking, horizontal tab swipes, range dragging, and long-press previews.

## 7. Current OHOS skeleton: concrete mismatch snapshot

A brief read-only look at `ohos/entry/src/main/ets/pages/Index.ets` during this audit confirms the stated “functional skeleton” classification. That file was already modified by other work, so these line references describe only this inspection moment and are not a full diff audit.

- Current visual theme is hard-coded navy/teal: root `#101822`, cards `#1A2432` with radius 12, active teal `#216C68`/`#56D9CC`; original defaults are light/blue-grey with source-defined semantic colors. (`Index.ets:380–424,617–657`.)
- Large “MultiFunPlayer / OHOS · simulation preview” title, always-large buttons, and Timeline/Source/Output bottom navigation are a new design. Original uses compact chrome and stacked cards/tab strips.
- Wide layouts put timeline/axes left and source/library/sync/output right (`632–640`), opposite source horizontal mode.
- Current separate library/source/sync cards and Stop output bar can remain useful implementation scaffolding or safety affordances, but do not substitute for original menus, tabs, expanders and per-axis action popups.
- Output panel explicitly says no TCP/UDP/Bluetooth/USB backend in this build (`494–507`). Preserve this truth while restoring UI structure; a UI-faithful disabled output chooser is not implementation parity.
- Current global interpolation/offset controls and chapter/bookmark previous-next buttons cover some functionality, but not the original per-axis interpolation/scale/offset, marker details/endpoints, AB loop menu, or heatmap preview/settings interactions.

Recommended sequence: implement source-shaped reusable components first, attach existing core state/actions, then complete missing panels and backend behavior. Do not spend another iteration polishing the invented dashboard as though it were an original-faithful milestone.

## 8. What still needs running Windows observation (R)

Static evidence is strong for structure, controls and declared settings, but it does not establish:
1. Exact computed font, primary/light/dark shades after MaterialDesign's palette calculation, card radius/elevation, glyph contours, ripple/focus effects, DPI rounding, popup anchoring, and scrollbar behavior.
2. Actual startup configuration and empty states; persistence/reloading effects; connected/disconnected/busy/error visibility at runtime.
3. Popup behavior on switching axis/source/output, clicking outside, keyboard Escape/Tab, opening nested dialogs, and window deactivation.
4. Dynamic axis-dot timing and active limiter state; synchronization progress; multi-axis heat aggregation and preview rendering with real files.
5. Drag/drop acceptance, playlist row states and selection transitions; malformed/unsupported script behavior.
6. Detailed source-specific live state and actual capabilities of media controls across providers.
7. Multi-output tab creation/removal while connected, backend error handling, ranges changing during playback, and update diagnostics accuracy.
8. Device-profile edits and import/export validation, complete shortcut action catalogue at runtime, and arbitrary plugin-generated views.
9. Whether source bindings intentionally share expansion state across all source/output/axis tabs in all transitions; bindings suggest shared state, but switching behavior should be recorded.
10. Target OHOS safe areas, keyboard occlusion, gesture contention, accessibility order, large text, background/resume and rotation behavior.

### Reference capture matrix

Capture matched Windows and OHOS states using the same safe synthetic media/script fixtures:
- Vertical collapsed, Vertical all-main-panels-expanded, Horizontal collapsed/expanded
- Light default, Dark default, changed primary color
- Empty media/script; loaded one axis; all enabled axes; mixed linked/provider/limited/bypass/locked state
- Sources: none/shown; disconnected/connecting/connected/error; at least Internal and one remote source
- Internal playlist empty/populated/playing, loop/shuffle/additional-scripts toggles
- Outputs: zero/one/multiple including duplicate type, selected-tab close/index, expanded range grid, update popup
- Every media menu and nine axis actions; all four motion providers; Smart limit and curve editing
- Settings five tabs including device-restart warning; repositories; path modifiers; Plugins/Information/error/confirmation dialogs
- Phone portrait and landscape with touch targets visible for QA; soft keyboard open; long file names; many tabs/axes; large system font

### Completion criteria

- A control-by-control traceability list marks every source feature as implemented/tested, platform-limited with explanation, or explicitly deferred. Nothing silently disappears because the screen is narrow.
- Visual diff review checks aligned panels and states, not only a screenshot of the initial screen.
- Behavior tests cover click/drag/hold, keyboard/mouse where supported, popup cancel/back, tab switching, repeated connect/disconnect, and rotation without playback/session reset.
- UI status reflects actual model/backend state; unsupported operations cannot be made to look connected or successful.
- Retain independent transport/output safety gates already required by the port. Source appearance is not a reason to remove a working stop/disconnect safeguard; placement can be integrated without redesigning the entire screen.

## 9. Reusable implementation units derived from upstream

Proposed component boundaries to reduce divergence:
1. AppChrome + source-compatible ThemeTokens
2. ConnectionTabStrip (source visibility toggle versus output instance add/remove are separate policies)
3. ConnectionToolbar + source/output expandable details
4. MediaToolbar + media-file/global-offset detail
5. Heatmap + PreviewOverlay + MarkerStrip/MarkerDetails
6. AxisTabStrip + four-status indicator
7. AxisToolbar + nine action sheets/popups
8. AxisFileOffsetScale + AxisValues
9. OutputRangeGrid + UpdateSettings
10. SettingsDialog and five tabs
11. RepositoryManager, PathModifierManager, PluginStatus, Information and feedback dialogs

Each component should consume shared state and actions, with desktop/tablet/phone presentations layered over it. That allows touch rearrangement while preserving source-defined behavior and avoids duplicate playback/connection state across layouts.

## 0.5 implemented structural pass (2026-10-16)

Source-led main-window structure now follows the pinned screenshot/XAML: blue-grey header, light compact surfaces, vertical source → script/heatmap → axis tools/values → output ordering; horizontal layout places source/output on the left and script/axes on the right. Phone controls remain touch-sized and portrait/landscape rearrange these same functions. The native video surface remains stable outside conditional layout branches.

Implemented interactions: internal/local-video source switching, actual simulator connection and transport, heatmap click/slider seeking, axis selection, range/combined/inverted heatmap display options, source/axis/output disclosure panels, resource selection, authorized script-library ordering/refresh/recursion, chapter/bookmark navigation. Heatmap velocity accumulation, 5-degree cutoff, selected-axis range, palette and bucket normalization are transcribed from KeyframesHeatmap.xaml.cs and covered by pure tests.

Original nine axis-tool slots are represented in source order. Script and interpolation open actual existing controls; inversion, bypass, linking, motion, smart limit, speed limit and auto-home remain disabled. Their original menus and behavior are not yet implemented. Four axis status dots are neutral/unavailable, not invented live status. External-player source tabs, physical-output tabs/configuration, complete Internal playlist, shortcuts, native menus, original chapter-strip visuals and hover behavior also remain outstanding. Existing interpolation/offset settings are not a complete port of each original axis popup.

This is a source-led structural implementation, not visual acceptance. No OHOS device/emulator screenshot or Windows runtime interaction was captured. Layout compilation cannot establish pixel equality, clipping, focus/keyboard behavior, touch ergonomics, font/icon metrics or multi-window lifecycle behavior. These require real runtime comparison, in addition to continuing the unported controls above.


### 0.5.1 enabled axis controls

The selected-axis inversion button now performs the original post-scale inversion; scale slider range/step is 0.01–4/0.01 as in ScriptView.xaml. Curve selection now applies per axis and the page initializes PCHIP, matching original AxisSettings. Six rather than seven tool slots remain disabled. Control edits pause the simulator/native transport and never reopen its gate. Original popup geometry, graph preview, persistent axis settings and the remaining state pipeline are still unported.
