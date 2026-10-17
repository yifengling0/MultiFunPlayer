# 0.20 local test guide

## Supplied artifacts

The recovery archive contains an **unsigned** HAP, complete source/resources/tests/oracles, source/build/HAP hashes, logs, the dedicated network receiver and a runnable browser UI approximation. It includes no SDK, credentials or signing keys. Use your installed official DevEco/SDK workflow to sign and deploy on your own compatible device. The declared compatible SDK6.0.0(20), target/compile26.0.0 and successful compilation do not establish every device's runtime capabilities.

## Readability and playback without a device output

1. Verify version0.20.0. Restored targets must remain disconnected/unarmed. All device classes should default to readable typography and52vp controls; explicit General→Density→Compact changes spacing/body size while keeping touch targets.
2. Check240–390vp narrow/portrait,568–640vp landscape, tablet andPC/narrow windows where supported. Long Chinese/English filenames, target names, selected options and errors should retain full text or a fully wrapping companion. Scroll to the end of every section; try system font enlargement. Screenshots/ArkUI rendering have not been verified in this environment.
3. Use the system Download-managed entry as before. Play video with and without scripts. Confirm aspect ratio, same-Surface layout/fullscreen, visible Stop and timeline access. The integrated title is an app-content treatment; native system fullscreen is capability-dependent.
4. During text/number editing, ordinary shortcuts must not trigger motion. F12 and touch Stop must stay reliable. The72×52vp global Stop stays in the fixed title region without scrolling, including wide tablet/PC mode. Below320vp the title wraps to two rows instead of hiding Stop; fullscreen/error layers retain their visible Stop. Check keyboard/IME, dropdown popup size, curve-point drag versus scrolling, and dialog/snackbar dismissal.
5. Original axis/Motion settings persist; merely editing or restoring settings must not start a preview or Arm. Independent Motion/manual preview still requires its explicit start.

## TCP/UDP actual device-to-computer test

This is an optional **non-motion** diagnostic, independent of output Arm. It must target the supplied dedicated receiver, never a physical motion controller or unknown endpoint.

1. On your own computer, enter the extracted source's `ohos` directory. The receiver needs Node20+ and no packages. For same-computer-only tests run `node tools/network-diagnostics/receiver.mjs`; its default127.0.0.1 cannot be reached from another device.
2. For a device on your trusted LAN, explicitly bind the computer's actual local numeric IP:
   `node tools/network-diagnostics/receiver.mjs --host YOUR_COMPUTER_LAN_IP --allow-lan --protocol both --seconds 120`
   Use the printed port. Decide yourself whether to grant any firewall prompt; do not expose a public port. Ctrl+C cancels; default limits are120seconds and20valid requests.
3. In the app, disconnect **all** ordinary targets and wait for confirmed closure. Open Network output→TCP/UDP round-trip diagnostic. Choose protocol, computer IP and receiver port; explicitly confirm the dedicated receiver and start once. Repeat separately for the other protocol if desired. Endpoints are volatile and edits revoke confirmation before commit/blur.
4. Read the current request ID, phase, bytes, latency, exact-echo status and close confirmation. A matching fresh echo proves this receiver round trip, not authenticated peer identity or device execution. UDP “connected” or a send count alone is insufficient.
5. While a request is pending/closing, normal Connect/Arm, including shortcut routes and other selected targets, must be blocked. Cancel/Stop/F12/background must cancel. Foreground return/page remount must not resend. Unconfirmed close remains quarantined across remounts; a process restart is required before reconsidering that failed owner.
6. Invalid endpoints or later denied requests must keep their visible notice instead of silently reverting to an old success record. Old records are labeled by request ID.

The development fixtures already use the real production encoding/coordinator/session/transport logic over Linux OS TCP/UDP sockets. Their SDK-shaped Node bridge does **not** execute OHOS NetworkKit. This in-app test is the route for establishing the native device backend on your network. WebSocket has no new live-socket evidence in0.20. No physical device or remote player was contacted to build the candidate.

## Optional local design approximation

Open `tools/ui-preview-020/index.html` from the extracted repository in a browser you allow to load local files. Follow its README for viewport/scenario options. It imports the production token/geometry snapshot and contains harmless synthetic fixtures; it does not execute media, network, filesystem or Arm callbacks. No actual screenshots were produced here, and it is not an ArkUI renderer.

## Useful feedback

Record version, device/model/OS, window dimensions/orientation, system font size, the exact control/steps and visible result. For networking add protocol, test-receiver port, byte counts/latency and close state. Redact private paths/hostnames; do not provide credentials. A screenshot from your device is useful for typography/clipping. No final1:1 or hardware execution claim is implied:43original action sites remain partial and35unwired; additional source/protocol/input/General capabilities are still incomplete. File recording remains unintegrated with its special review blocked; Git publication remains paused.
