# MFP shared-production-logic visual lab

Status as of 2026-10-18: implementation and nine nonvisual smoke checks pass. No screenshot, browser interaction recording, ArkUI rendering pass, or emulator boot is claimed.

## Reproduce

From the repository root after integration (Node 24+):

```
node ohos/visual-lab/build-standalone.mjs
node --test ohos/visual-lab/smoke.mjs
node ohos/visual-lab/server.mjs
```

Open http://localhost:8765 in a browser in the same network namespace. A supported environment-provided HTTP mapping is required to use the cloud CUA browser from this execution sandbox. The server only serves the lab files, synthetic sample video, and three production modules; it does not expose the repository as a static file tree.

`server.mjs` reads and strips types from the real production files on each request:
- `MultiFunPlayer-ohos/ohos/entry/src/main/ets/core/VideoLayout.ts`
- `MultiFunPlayer-ohos/ohos/entry/src/main/ets/core/VideoInteraction.ts`
- `MultiFunPlayer-ohos/ohos/entry/src/main/ets/core/Heatmap.ts`

`build-standalone.mjs` creates an offline HTML artifact with those exact modules and SHA-256 hashes. Regenerate after production changes. `smoke.mjs` rejects stale hashes. No production source files were changed by this lab.

## What is real and what is adapted

Real shared production behavior: layout rectangles, play/pause/replay/blocked classification, drag origin, 8-vp threshold, clamped normalized placement, cancellation. The video element decodes and plays a synthetic 20-second WebM test pattern through browser media APIs. Browser pointer events call the shared drag session. The DOM composition and placeholder settings panel are a test adapter, not the ArkUI page. The canvas uses actual `Heatmap.build` bucket colors and range values from two synthetic axes (L0/R0), with a cursor sourced from the same video element currentTime. Clicking the heatmap seeks that element. The browser canvas painter remains an adapter, not proof of the production ArkUI Canvas renderer. Heatmap’s type-only FunscriptDocument import is removed only during adapter transpilation; the original source hash is retained and production is unchanged.

Required visual checks once HTTP browser reachability is restored:
1. Tap picture to start, then tap again to pause; verify advancing/stable media position.
2. Click the explicit pause button with start-blocked enabled while playing; it must still pause.
3. Drag picture above 8 pixels; verify position changes without a play/pause transition.
4. Drag beyond each edge; verify clamping; cancel gesture and repeat.
5. Switch 400×760, 568×320, 1100×700; verify floated bounds and controls remain accessible.
6. Scroll the settings pane beyond 96 pixels to float. Expand returns to large preview and resets settings scroll to zero; it does not enter fullscreen. The separate fullscreen button enters/exits player mode without replacing the video node.
7. Select either synthetic axis or combined heat; click the heatmap and verify cursor position follows the same media clock.
8. Repeat layout, full-screen, and floating transitions; check unintended taps and blocked startup feedback.

These checks still cannot establish native Surface z-order/hit testing, ArkUI gestures, system-bar restoration, AVPlayer codecs, or device output behavior. Those require an official working Previewer/emulator or a HarmonyOS device.

## Official Previewer investigation

Installed official command-line tools: 26.0.0.851. The Linux `Previewer` initially failed dynamic loading because `libshared_libz.so` and `libhilog.so` were not resolved. `previewer.sh` uses only existing official SDK libraries:
- Private compat symlink `libshared_libz.so` → bundled emulator `libz.so.1.3.2`
- LD_LIBRARY_PATH includes SDK `hms/toolchains/lib` (provides `libhilog.so`) and Previewer common bin

No system library, SDK binary, or security setting was modified. This is a local compatibility experiment, not a vendor-certified package repair. `ldd` reports no unresolved libraries and `previewer.sh --help` reaches Previewer's `main`; see `logs/previewer-help.log`. The tool does not implement conventional --help and then reports missing app path and fails IPC socket creation. A valid preview-build asset directory, resource directory, and supported IDE/preview IPC transport remain required. No rendered frame was produced.

## Emulator and environment evidence

- Official `Emulator -help` works and supports `-noWindow`, image listing/install, screenshot, click and slide commands.
- `Emulator -list -details` returned `[Empty]`.
- `Emulator -imageList -downloaded true` found no matching images; netlink socket operations were denied by the sandbox.
- `/dev/kvm` and `/dev/dri` are absent in the execution sandbox.
- Free disk at initial check was 362 MB. No large image was downloaded, no user files removed.
- Huawei's official 26.0 release notes explicitly add Linux emulator support: https://developer.huawei.com/consumer/en/doc/harmonyos-releases/deveco-studio-new-features-2600
- No emulator license acceptance was attempted. Any new explicit legal agreement must be reviewed/approved before acceptance.

## Exact current browser blocker

The server responds successfully from the same sandbox command (`/manifest.json` verified), but separate commands and cloud CUA browser cannot reach that command's network namespace. CUA returns `net::ERR_CONNECTION_REFUSED` for http://localhost:8765. Standard elevated server launch failed before Node execution with `bwrap: Can't create file /home/agent/.codex/sessions: Read-only file system`.

The browser's `file:` URL policy explicitly rejected the standalone artifact (only http/https allowed). That path was stopped; no data URL, alternate native browser path, or security change was used to bypass it. The needed environment capability is a supported browser-reachable HTTP test server/port mapping. Until restored, this lab is implemented and nonvisually verified, not visually validated.

## Repository integration

The lab may be copied to `ohos/visual-lab/`. `source-root.mjs` resolves either that location or the current sibling workspace location; override with `MFP_CORE_DIR` if needed. Set `HARMONY_TOOLS_HOME` for Previewer/environment scripts in a different checkout. Do not commit the absolute compatibility symlink or generated logs/bundle; `.gitignore` excludes them. The synthetic sample clip is 450 KiB and contains no user media.

`check-environment.sh` is read-only. Headless Chromium through a different automation route was not attempted: the active computer-use policy requires CUA for UI actions, and the rejected file-URL route must not be bypassed.

Nine automated checks include real Heatmap selected-axis/combined results, adapter scroll threshold and expand semantics, clock-driven cursor drawing and heatmap seek with a stub DOM/canvas. These are executed JavaScript handler tests, not browser input or raster validation.
