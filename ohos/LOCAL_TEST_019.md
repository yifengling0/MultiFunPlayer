# 0.19 local user test guide

## What is supplied

The recovery archive includes an **unsigned** HarmonyOS HAP, full source/resources/tests/oracles, official build logs, production/source/compiled-module/HAP-entry SHA256 manifests and reproduction instructions. It contains no SDK or signing key. Use an installed official SDK/DevEco workflow to sign and deploy to your own compatible device. The project declares HarmonyOS compatibleSdkVersion6.0.0(20), target/compile26.0.0; this declaration and a successful build do not establish every device's capabilities.

The TCP, UDP and WebSocket production adapters call native OHOS APIs. They are not simulation-only buttons. This candidate's verification uses injected SDK/Memory transports, so real network/device interoperability has **not** been established. A local write receipt means system submission/completion, never device motion or command execution. No real endpoint was contacted while creating this archive.

## First tests without an output device

1. Start with default disconnected targets. Verify the displayed version is0.19.0 and settings restoration does not connect any target or Arm.
2. Put your media/scripts in the existing system Download-managed entry and refresh. Play a video with and without a companion script. Check playback, aspect ratio, rotation, same-Surface fullscreen, resource selection and touch/keyboard Stop; record any clipping or unreadably small text. Native phone/tablet/PC visual acceptance is still pending.
3. Edit axis/Motion/Sync settings during preview and verify configuration persists after restarting. Test independent Motion/manual preview only through their explicit start controls. Set/Offset/editing alone must not start processing or Arm.
4. Open input mappings. Six new output actions require an explicit target instance; editing their arguments must not execute. Missing/removed targets must show a useful failure instead of selecting a different target.

## Optional tests only against a known test endpoint

Use only a user-owned/authorized test server and an appropriate protocol; do not point motion output at an unknown device. An address of127.0.0.1 on the phone means that phone, not the development computer. No endpoint/credentials are bundled or inferred by this guide.

- Connect a TCP/UDP/WebSocket target while media is playing. Connection must not Arm or pause media. UDP local connection readiness does not prove a listening peer.
- For endpoint Set, a changed draft must disarm but retain an established old socket until explicit Disconnect/reconnect or Apply. Connected Connect is inert. Verify the applied configuration indicator before any explicit Arm.
- Cancel a pending connection with Stop, background or removal. A late completion must not leave a new connection or Arm. A failed close must show unconfirmed/quarantined state instead of pretending disconnection succeeded.
- For DeoVR, enable its actual supported remote control service on your known player, enter that endpoint and connect explicitly. Received path/state/time should be visible. Remote paths are metadata and cannot read arbitrary phone files.
- If you explicitly Arm an appropriate output, Play/Pause/Speed first show waiting/no dispatch. Continuation requires compatible actual observations and a new valid frame. No prior Arm means no automatic Arm. Seek/Path/AB/AutoSkip still revoke. Stop/background/error/timeout require renewed explicit admission.

Do not treat a local send count, TCP success or matching remote position as an ACK. The protocol lacks server timestamps and correlated command acknowledgements. The included mock and C# tests cannot certify physical execution.

## Reporting useful results

Record device/model/OS, portrait or landscape/window dimensions, version, source mode, target protocol, whether the endpoint is a test server, visible status and exact reproduction steps. Redact private hostnames/paths and never include connection secrets. Font/spacing improvement and production-chain loopback diagnostics are the next requested stage; this0.19 package preserves the already-reviewed current UI rather than claiming that work is done.
