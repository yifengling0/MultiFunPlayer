# 0.30 shared video preview and immersive playback

The requested playback and control experience remains one AVPlayer and one permanently mounted XComponent. Screen, floating-preview and chrome changes never reopen, seek, connect, Arm or change the media session. Existing native adapter / output failure gates remain authoritative.

## Interaction

- A playing video remains visible on the video-library home and the phone control workspace. Expanded preview sits above the list/settings; scrolling past96vp collapses it into a bottom-right floating preview. Explicit “浮窗” also collapses it. “展开” restores the larger preview and returns that list/settings scroll to its top. Floating lists reserve trailing space so final items can scroll above the preview. This is an app-local floating preview, not a separate system PiP window.
- The same preview and its heatmap move together. The heatmap renders the current engine display document, selected axis, duration and position. Existing combine/range/invert settings apply; tap heatmap or drag seek uses the existing guarded transport seek. No independent media clock or player is introduced.
- Fullscreen starts with application controls hidden. Single tap on the video reveals or hides controls; the explicit play/pause button changes playback. This avoids accidentally pausing when only revealing controls. While playing, shown controls hide after3.5seconds without interaction; paused controls stay visible. Slider end/click and heatmap interaction renew the deadline. Back/Escape exits while controls are hidden. Stop remains in the revealed controls and normal header.
- Fullscreen Surface bounds fill the measured application content area regardless of control visibility; controls overlay the video. Normal/floating previews reserve chrome below the Surface. Layout changes retire settings callbacks and preserve unapplied drafts.

## Native bars

Mobile fullscreen now awaits actual landscape geometry before setting immersive layout and hiding status/navigation bars. The previous ordering hid bars before asynchronous rotation settled, allowing rotation to undo the hide. A regression mock reproduces that sequence and verifies the correction. Per-setting ownership, generation cancellation, bounded750ms geometry wait, observed-status verification and rollback remain. This is a reproduced API-sequence race, not a diagnosis proved on the user's hardware.

The OS has no navigation-enabled getter: exit retains the documented visible-navigation app policy and preserves known status/orientation/layout baselines only while owned. Rotation lock, unsupported modes and failed setters remain explicit in-window fallback. Nothing auto-arms output.

## Verification boundary

Official Harmony SDK compilation and Node actual-controller/API-double tests do not establish physical-device bar, rendering, touch, orientation or hardware behavior. No new simulator, Previewer rendering or device screenshot is claimed. The HAP is unsigned and needs official signing/deployment. See LOCAL_TEST_030.md for acceptance steps.
