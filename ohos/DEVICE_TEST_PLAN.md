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

## 0.4 resource-library checks (not executed on device)

- Put synthetic `film.mp4`, `film.funscript`, `film.pitch.funscript` in a directory with `.nomedia`, `.DS_Store` and unrelated documents. Select the folder; one video group should appear and unsupported entries should be counted, not abort indexing.
- Select just video and scripts through the multi-file picker. Verify equal filenames from different parents do not pair, no parent is scanned, and videos are not copied.
- Open the pair; no autoplay. Confirm base L0 plus pitch R2. Add competing aliases and an embedded multi-axis script, then check source-rule fixtures and the selected filenames.
- Two same-stem videos must require explicit video selection. Manual candidate selection still uses original script priority.
- Cancel during scan, select a newer source, background during script reading, and reopen another pair. Stale work must never replace the latest source or resume playback.
- Refresh after moving/removing files or revoking access. Clearly request reselection; do not silently widen access.
- Verify 1,000-entry/depth-4 truncation and 64-candidate/text/action budgets produce clear messages. Try a symbolic-link entry and nonregular file; neither should be followed/opened for playback.
- API20 devices may lack phone folder selection: multi-file selection must remain usable. API26 phone/tablet/2in1 single-folder support still needs device confirmation.
- Close/restart the application: session library is not restored and no persistent grant is claimed.

## 0.5 library and compact UI checks

1. Select a small authorized directory containing film.mp4, film.zip and film.funscript. Confirm ZIP candidate priority and no automatic playback after opening. Repeat with a multi-axis ZIP entry and missing axes.
2. Add two authorized script-library folders; move their order, toggle recursion and refresh. Confirm that missing media-local axes follow the original search order. Revoke access and confirm the clear reselection error.
3. Try a corrupt ZIP, unsafe entry name, encrypted/ZIP64 archive and oversized archive. Confirm failure without extracting files, loading partial results or opening video.
4. Rotate a phone and resize a tablet/PC window while paused and playing. Confirm the native surface remains stable, compact source/output and script columns rearrange, and all enabled controls perform their displayed action.
5. Compare heatmap range/combine/invert settings and selected-axis heat against the pinned Windows source/application. Record native screenshots at matched dimensions; do not count build success as visual acceptance.
6. Verify background/cancellation during ZIP read, folder refresh and video open. Old callbacks must not replace a newer selection or resume output.
