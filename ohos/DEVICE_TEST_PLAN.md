# 0.3 native video acceptance checklist

Status: **not executed on a device or emulator**. An unsigned HAP requires an appropriate developer signing/install workflow. Test with non-sensitive local fixtures; no real hardware output is implemented.

## Basic playback

- Start with a short H.264/AAC MP4 and a synthetic funscript. Open either order. File selection must not autoplay.
- Play/pause, volume 0 and 1, rates 0.25/0.5/1/1.5/2/4. Verify audible/rendered playback and the actual accepted rate.
- Seek repeatedly while playing and paused. Output preview may move only to confirmed native time; output stays paused until Play. Seek near end; after completion Rewind must return to zero and require Play.
- Use video shorter and longer than the script. The timeline follows video duration; script endpoint behavior holds its first/last value. Test positive/negative global and per-axis offsets.
- Empty/unreadable files, misleading extensions, unsupported codecs, cancelled picker, and source replacement must leave output closed and show an understandable result.

## Lifecycle and layouts

- Phone portrait/landscape, tablet, and HarmonyOS PC wide/narrow windows. Timeline and transport controls remain reachable; verify actual surfaces and text wrapping.
- Rotate and resize while playing. A preserved surface should continue correctly; destroyed/replaced surfaces must release and require reopening without stale callbacks restarting playback.
- Background, lock/unlock, route/audio interruption, and split-screen/window switching. Background release must stop playback/output; reopening requires explicit Play.
- Trigger buffering with a supported local document provider where feasible. No automatic output recovery or backlog emission.
- Open the picker, background during selection, cancel, repeat rapidly, and replace source while seek/prepare is pending.
- Toggle simulator connection off during playback and reconnect: paused output, no automatic resume.

## Resource and timing checks

- Trace native callbacks against displayed media time around seeks/rate changes; a 750 ms observation watchdog must close the simulation gate without integrating a guessed clock.
- Monitor file descriptors and native-player instances through repeated opens/background transitions and errors. Inject release/close failures if a platform test harness permits; retry cleanup before opening a new source.
- Measure CPU, memory, dropped frames, and battery for intended resolutions. Native AVPlayer is not a guarantee of hardware decode on every device.

Record device model, OS/API, video container/codecs/resolution, orientation/window size, result and reproduction steps. Passing Node mocks or an SDK package build does not satisfy these runtime checks.
