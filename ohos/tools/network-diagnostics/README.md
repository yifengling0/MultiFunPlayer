# TCP / UDP diagnostics, version 0.20

## What has actually been verified

The focused Linux tests execute the repository's production classes:

`OutputCoordinator → OutputSession → TCodeEncoder → NativeTransportFactory → NativeTcpTransport / NativeUdpTransport → injected Node net/dgram environment → real operating-system loopback socket → receiver → production receive callback`.

For both TCP and UDP, the receiver obtained these exact ASCII bytes, totaling 22 bytes in two local writes:

```text
L07499I125
L02500I125
```

The test checks explicit Connect and Arm, source authorization, absence of writes before Arm, provenance/background revocation, confirmed close, and explicit reconnect without restored Arm. UDP additionally preserves the two datagram boundaries. TCP is checked as a byte stream, without assuming packet or chunk boundaries. Timeout/cancellation/reuse cases exercise the same native classes; fault cases that delay SDK completion explicitly identify that injected condition.

All executed socket tests bind or connect only to `127.0.0.1`, using ephemeral local/listener ports. The Node bridge narrows the production UDP wildcard bind to loopback. The ArkTS loader erases types and provides inert Kit import sentinels; it does not replace the production transport algorithms, encoder, session, coordinator, or admission registry.

**Evidence boundary:** these runs establish shared production logic over real Linux OS sockets (`nodeBridge`). They do **not** establish the actual OHOS NetworkKit backend, installed-app INTERNET permission, a phone/tablet/PC's network reachability, or physical-device execution. No external or physical motion endpoint was contacted. A successful send receipt is only local acceptance.

Run the focused tests from `ohos/` using Node 24:

```sh
node --test tests/socket-loopback-020-*.test.mjs
```

## Dedicated receiver

Requirements: Node.js 20+ for the receiver, no packages to install.

The receiver accepts only one bounded `MFP_DIAG/1` challenge per TCP connection or UDP datagram and echoes that exact line. It refuses motion/TCode, malformed/non-ASCII, extra, and over-128-byte messages. It has no motion decoder, credentials, persistence, file recording, or outbound connection initiation. Logs contain only status, protocol, byte counts, and the user-selected bind address/port; no nonce or payload. TCP clients, runtime, request count, and log count are bounded.

### Local-only default

```sh
node tools/network-diagnostics/receiver.mjs
```

The first JSON log shows `bindHost`, ephemeral `port`, `protocol`, and `scope`. Defaults are `127.0.0.1`, both TCP and UDP on the displayed port, at most 20 valid requests, and 120 seconds. A device's `127.0.0.1` means that device itself; it cannot reach a receiver on another computer through that address.

### Explicit LAN test from an OHOS device

Run this yourself on the computer that will receive the diagnostic, substituting that computer's actual local IP:

```sh
node tools/network-diagnostics/receiver.mjs --host YOUR_COMPUTER_LAN_IP --allow-lan --protocol both --seconds 120
```

`--host` requires a numeric address assigned to the receiver computer. A non-loopback bind is rejected unless `--allow-lan` is present. The receiver prints the bind address and port. If you choose a wildcard such as `0.0.0.0`, the app must use the computer's reachable LAN IP, not the wildcard. Use a trusted local network and the displayed endpoint only. Configure any required firewall permission yourself. Stop the receiver with Ctrl+C; it also stops at its time/request limit.

In the app's diagnostic UI:

1. Disconnect all normal outputs and wait for confirmed closure. Keep them disarmed.
2. Enter TCP or UDP, the receiver computer's reachable IP, and the displayed port.
3. Confirm that this endpoint runs this dedicated receiver, then explicitly start the one-shot diagnostic.
4. A successful result must say `exactEcho`, include byte counts and latency, and show `closeConfirmed`. It proves only that this fresh challenge was returned by the configured receiver.
5. Cancel or leave the foreground to close the diagnostic. Returning to the foreground never reconnects it. Run a new explicit request to test again.

Never enter a physical motion controller's endpoint for this diagnostic. The challenge is intentionally separate from TCode, but arbitrary hardware cannot be assumed to interpret unfamiliar input safely. It belongs only at the dedicated receiver. TCP/UDP echo is unauthenticated and is not identity verification, device ACK, or a guarantee that later motion commands will execute.

Options:

```text
--protocol tcp|udp|both
--host NUMERIC_LOCAL_IP
--port 0..65535
--allow-lan
--max-requests 1..100
--seconds 1..300
--help
```

## Application integration contract

`output/diagnostics/NativeSocketDiagnostic.ets` exposes the actual OHOS-backed class. Its constructor is inert. It uses the existing production transports, the STARTUP monotonic clock, and a fresh native cryptographic 128-bit nonce for each explicit request.

```ts
const result = await diagnostic.run({
  kind: 'tcp', host: receiverHost, port: receiverPort,
  dedicatedReceiverConfirmed: true
});
```

The owner can call `snapshot()`, `cancel()`, `setForeground(boolean)`, and `dispose()`. The request owns a copied endpoint, increasing request/generation IDs, and nonce. TCP accumulates a bounded exact prefix until the full challenge is matched; UDP requires one exact datagram from the production adapter's resolved peer. Neither path accepts unrelated, stale, mismatched, oversized, or trailing data. Proof is withheld until both the local write receipt and exact echo match. Cancellation remains effective while a would-be success is awaiting closure.

The overall connect/write/echo deadline is 3 seconds, followed by bounded closure. No retries or periodic sends occur. Unconfirmed close permanently quarantines that owner, even if a late close subsequently completes. Only restarting the app should replace an owner whose old native ownership is uncertain.

The application owner must:

- Keep one instance across page remounts so quarantine cannot be bypassed.
- Invoke Run only from an explicit user action after the dedicated-receiver confirmation. Reset confirmation on protocol/address/port edits.
- Require every normal output to be disconnected, close-confirmed, idle, and disarmed before starting.
- Block every normal Connect/Arm path, including shortcuts, while diagnostic `busy` is true, `closeConfirmed` is false, or `quarantined` is true. UI button disabling alone is insufficient.
- Cancel on Stop, emergency stop, page/stage/Ability teardown, and foreground loss. Returning foreground is inert.
- Keep media playback independent; never Arm, restore/connect normal targets, or feed playback values through the diagnostic.
- Render only snapshots or similarly redacted bounded status. Do not store or log challenge nonces or raw receive data.

Snapshot fields are `requestId`, `connectionGeneration`, `kind`, `phase`, `busy`, `closeConfirmed`, `quarantined`, `bytesSent`, `bytesReceived`, `latencyMs`, `diagnostic`, `proof`, `evidenceLayer`, and `deviceExecutionAck: false`. `evidenceLayer: nativeSDK` describes which backend an explicitly executed in-app diagnostic used; constructing the native class is not proof that a diagnostic ran or passed. Linux tests explicitly label their injected backend `nodeBridge`.
