# MultiFunPlayer for OHOS — 0.6.0 aspect-correct video and automatic media library

Native ArkTS/ArkUI port in progress. Original Windows application is unchanged.
Upstream baseline: `36c08fbb99ac9398a63ff1cca1bbf68cd2228a94`.

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
