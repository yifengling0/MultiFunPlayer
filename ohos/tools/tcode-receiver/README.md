# PC TCode TCP/UDP receiver

A zero-dependency Node.js simulator for checking what MultiFunPlayer OHOS sends
over TCP or UDP. It parses real TCode frames, tracks per-axis values/ranges and
frame rate, and serves a live dashboard.

This is a **receiver simulator**, not a hardware emulator. A locally accepted
write proves that the phone reached this PC and sent syntactically valid TCode;
it does not prove that a physical device moved.

## Run

Requires Node.js 20 or newer.

```powershell
cd ohos/tools/tcode-receiver
node receiver.mjs --tcp 8000 --udp 8001 --http 8099
```

or on Windows:

```powershell
.\start.ps1
```

Open <http://127.0.0.1:8099/> for the live dashboard, or read JSON at
<http://127.0.0.1:8099/stats.json>. `GET /reset` clears the counters.

The receiver prints the PC LAN addresses to use on the phone. Allow Node.js on
Private networks in Windows Firewall (or add inbound rules for TCP 8000 and UDP
8001). The phone and PC must be on the same reachable network.

## Phone setup

1. In the app open **控制 → 连接 → 添加**.
2. Choose **TCP** (or **UDP**).
3. Set **目标主机 / IP** to the PC address printed by the receiver, for example
   `192.168.1.50`.
4. Set the port to `8000` for TCP or `8001` for UDP.
5. Tap **连接设备**, confirm the app shows **已连接**, then tap **启用发送**.
6. Start a video/script or standalone Motion so the app has an authorized source
   frame. The arm operation intentionally rejects a source with no current frame.

For a second transport, add the other target in the same list. The dashboard
shows TCP and UDP packet counts separately.

## What is checked

- TCP line framing across arbitrary chunk boundaries, with a bounded buffer.
- UDP datagrams that contain one or many newline-separated frames.
- Axis commands such as `L05000I16` (value precision inferred from the digits)
  and multi-axis lines such as `L09999 R15000 I16`.
- Invalid/unknown tokens are counted; they do not crash the receiver.
- Per-axis count, last value, minimum and maximum, frame rate and recent frames.
- No unbounded memory growth: recent frames are a fixed ring and the TCP buffer
  is capped.

## Self-test

```powershell
node receiver.mjs --self-test
node send-test.mjs                 # send 9 TCP + 5 UDP sample frames
```

`--self-test` uses ephemeral ports and exits non-zero if parsing, both transports
or range accounting regress. `send-test.mjs` is a deterministic traffic source
for the dashboard. Both only test the PC receiver; they do not pretend to be the
phone integration test.

## Current device verification (2026-10-18)

- PC receiver: self-test passed with 5 frames and axes `L0,R1,V0`; local TCP/UDP
  send-test produced 14 frames and valid per-axis ranges.
- Phone VYG-AL00: TCP connection to the PC receiver succeeded
  (`[tcp] client connected 192.168.180.76:...`).
- **No TCode frames were emitted by the app in this run.** Pressing **启用发送**
  on both a playing local video and standalone Motion returned:
  `No current authorized playback frame. Start playback or an explicitly
  allowed paused source first.` The app stayed connected but reported
  `输出未启用`. This is an app source-authorization blocker, not a receiver
  failure; the receiver is ready to capture frames once that gate is resolved.

## Files

- `receiver.mjs` — TCP/UDP/HTTP servers, dashboard, self-test.
- `protocol.mjs` — TCode parser and bounded statistics.
- `send-test.mjs` — deterministic local traffic generator.
- `start.ps1` — Windows launcher.
