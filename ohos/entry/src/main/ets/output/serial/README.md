# Serial backend staging boundary

The 0.22 isolated UI release excludes these modules. The 0.23 shared integration
owns admission and UI wiring for official API19/26 backends; see the release
verification for its build status. CDC remains an **unavailable prototype**. CH34x is an **experimental write-only**
backend with a narrow descriptor/ROM allowlist, not target-device verified.
Constructor/capability inspection does no enumeration, permission request or physical I/O. Only an explicit connection may invoke backend `open`.
No real device, permission dialog or USB port was exercised during development.

## Implemented staging modules

- `SerialTransport.ts`: existing production `TransportPort` contract, exact copied
  bytes, finite native I/O timeouts, partial local receipts, deadline/generation
  checks, received-data events, drain-before-close and permanent quarantine after
  unconfirmed close. A watchdog is not native cancellation. Write success is not
  device acknowledgement. Never replace/release a quarantined instance.
- `OfficialSerial19Backend.ets`: `@ohos.usbManager.serial`, actual syscap and API
  presence checks. 8N1/no handshake, supported baud enum only. API19 cannot set
  DTR/RTS: explicit `null` accepts OS-managed lines; boolean requests are rejected.
  This does not silently preserve C#'s default DTR=true/RTS=true.
- `OfficialSerial26Backend.ets`: `@ohos.busManager.serial`, exact selected port,
  8N1/no flow control, DTR/RTS, received/disconnect callbacks.
- `UsbCdcBackend.ets`: **non-admitted prototype only**. Strict descriptors and
  matching native model, one configuration, no alternate interfaces, CDC header,
  ACM capability and unique union, bulk IN/OUT, force=false. No vendor commands,
  reset or driver takeover. API18 finite submit/cancel and actualLength receipts.
- `NativeSerialFactory.ets`: dynamic imports avoid loading unsupported native
  serial modules. CDC availability is hard false (`cdcShortPacketContractUnverified`).

First supported attribute subset is deliberately 8N1/handshake none. Other C#
parity/data/stop/handshake modes are not claimed. Backend events are raw received
bytes; the C# device gesture parser has not been wired to these events.

## Why CDC is gated

Installed SDK26 `@ohos.usbManager.d.ts` documents `flags=0` as
`USB_TRANSFER_SHORT_NOT_OK`. Arbitrary serial reads naturally end on short packets.
OpenHarmony master currently ignores this flags field, but that is not proof of
commercial HarmonyOS behavior. No production-read availability claim is made.

Primary evidence inspected 2026-10-17:

- OpenHarmony usb_usb_manager commit `d516eeae311ab0e3d0da5e4a07a1a087b4cc53d6`,
  `interfaces/kits/js/napi/src/usb_info.cpp`: flags parsed at 2157–2163, not copied
  by `GetUSBTransferInfo` around 2330. Its legacy bulk completion around 1974–2025
  collapses all failures to -1, so idle timeout cannot be distinguished from detach.
  https://github.com/openharmony/usb_usb_manager/blob/d516eeae311ab0e3d0da5e4a07a1a087b4cc53d6/interfaces/kits/js/napi/src/usb_info.cpp
- OpenHarmony drivers_peripheral `usb/libusb_adapter/src/libusb_adapter.cpp`,
  `FillAndSubmitTransfer`: uses libusb fill/submit and does not set flags.
  `BulkTransferWrite` around 804–843 discards actual transferred length. Therefore
  legacy bulk OUT is not used by this prototype for exact partial receipts.
  https://github.com/openharmony/drivers_peripheral/blob/master/usb/libusb_adapter/src/libusb_adapter.cpp
- libusb explicitly requires checking the transferred count for writes and
  warns that timeout may follow partial I/O:
  https://libusb.sourceforge.io/api-1.0/group__libusb__syncio.html

Required gate to reconsider duplex CDC: documented neutral short-packet behavior
for the target commercial OS, or explicitly authorized target-OS tests proving 1-byte/short/full/multiple
packets, idle timeout, simultaneous OUT, cancellation callback settlement, detach,
and unconfirmed-close quarantine. Do not infer permission to run these tests from
fixtures. They need the user's actual chosen test device and connection action.

## Original C# receive behavior and write-only proposal

`Source/MultiFunPlayer/OutputTarget/ViewModels/SerialOutputTarget.cs:204–259` reads
in both fixed and polled modes, then calls `TCodeInputProcessor.Parse`. Its parser
publishes button/axis gestures from `#button:state`, `@axis:value`, `$axis:value`.
Receive is not an ACK gate for sending, but is real functionality, not mere logging.
A future write-only subset could intentionally use API18 submit for OUT with
SHORT_NOT_OK, exact `actualLength`, finite timeout and failure-close/no retry. It
must explicitly disclose missing device button/axis input and is not full parity.
No write-only production route is enabled here.

## CH340 / CH341 experimental write-only prototype (not admitted)

User's likely hardware is CH340-family, so a separately named vendor backend is
higher priority than broad CDC support. Do not send CDC controls to those chips.

Mature reference pinned for review:
`mik3y/usb-serial-for-android` commit
`6a9c61f1fa16f28c2a75eef76c6383cd1dc518dd`,
`usbSerialForAndroid/src/main/java/com/hoho/android/usbserial/driver/Ch34xSerialDriver.java`.
Its `LICENSE.txt` is MIT; future translated code must retain the license and
Google/Mike Wakerly/Andreas Butti copyright notices. Ch34xProtocol.ts translates the initialization/baud/control-line subset and retains CH34X-LICENSE.txt.
https://github.com/mik3y/usb-serial-for-android/blob/6a9c61f1fa16f28c2a75eef76c6383cd1dc518dd/usbSerialForAndroid/src/main/java/com/hoho/android/usbserial/driver/Ch34xSerialDriver.java
https://github.com/mik3y/usb-serial-for-android/blob/6a9c61f1fa16f28c2a75eef76c6383cd1dc518dd/LICENSE.txt

Proposed narrow first matrix: VID 0x1a86 / PID 0x7523 (CH340) and 0x5523
(CH341A UART). Do not include 0x5512 SPI/programmer mode, CH343, CH9102, CP210x,
FTDI, clones or arbitrary user-overridden VID/PID. PID alone is not proof: match
actual descriptor/interface/bulk endpoints and supported version-response shape
before any mutating vendor request. The prototype accepts one actual vendor-class interface with one bulk IN/OUT pair and optional interrupt IN, no alternates/composite modes. Version 0x30 with second byte 0 is the narrow observed-reference allowlist; it is not proof of all commercial chip variants. ROM 0x27 is rejected: Linux ch341 documents inverted baud bit 7 on some such chips and different pre-0x30 line-control registers. Official WCH and target-device evidence are still required before production claims.

Translated reference sequence under review against WCH documentation:
read vendor version request 0x5f; serial-init 0xa1; read/write registers via
0x95/0x9a; baud register pairs 0x1312/0x0f2c; LCR 0x2518; active-low DTR/RTS
0xa4; hardware flow-control registers 0x2727. The reference includes version and
baud quirks, including 921600/307200 special handling and bit 0x80 to avoid CH341A
buffer-full latency. Do not transplant its force=true/all-interface claims.

The prototype uses native API18 submit actualLength for OUT rather than legacy bulk count. Duplex
IN has the same short-packet contract blocker as CDC. Any proposed initial
write-only CH340 capability must be distinctly labeled and leave received-device
input unsupported. All permission/claim/timeout/stop/quarantine gates remain.

## Verification

Run `node --test ohos/tests/serial-transport.test.mjs` for source-executed mocks.
Run `MFP_SDK_TOOLS=/absolute/command-line-tools node tests/serial-sdk-smoke.mjs`
from `ohos` for an isolated temporary SDK fixture. This forces all native backend and transport modules to
be reachable without changing the shared app Index. Do not run simultaneously
with other SDK builds. A compiled fixture is not a connected-device test and is
not the shipping HAP.

## Ownership and explicit discovery

`listPortsExplicit` is only for a user-initiated refresh, never startup/restore.
Selections carry portName plus an ephemeral portId; 19 revalidates both before
permission/open, 26 re-enumerates by exact name. Names are not stable silicon IDs.
The factory supplies a process-wide lease across all native serial families.
Until cross-backend physical identity can be established, only one serial output
may connect at a time. Construction does not acquire the lease; open does.
Confirmed close releases it; quarantined close never does, even on late cleanup.
A second owner fails before permissions, I/O or cleanup of the first handle.

CH34x protocol compatibility remains a prototype: class 255 plus known VID/PID and
ROM response is not sufficient to certify every vendor subclass/protocol. The MIT reference does not restrict subclass/protocol; these values are diagnostic,
not an invented compatibility gate. Future availability requires explicit experimental
UI disclosure and target-device validation, not a claim of universal clone support.
When distributing these modules, retain the complete CH34X-LICENSE.txt notice in
the HAP resources or accompanying distribution, not just the source repository.

## Explicit read-only CH34x diagnostic

`NativeSerialFactory.probeReadOnly(selection, isCurrent)` is only for a user click.
It acquires the same global serial lease, requests USB permission, checks exact
known VID/PID/raw descriptors, claims with force=false, and sends exactly one
version IN control (0xc0/0x5f, 250ms). It never initializes baud/lines or submits
bulk bytes. The report excludes names/serial numbers. Successful report is only
returned after confirmed release/close. `SerialProbeError` carries diagnosticCode,
closeConfirmed and quarantined; a 15-second watchdog (including permission UI)
quarantines ownership and never pretends to cancel native work. Late completion
cleans up without releasing quarantine. UI must process close evidence even if
the selected target became stale, and must not restore Arm automatically.
