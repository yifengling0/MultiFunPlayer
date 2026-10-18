# USB serial on HarmonyOS NEXT

Status: investigated against the bundled API 19–23 reference and verified with a
real CH340 board on the connected VYG-AL00 phone on 2026-10-18. CP210x, FTDI and
CDC have code paths but no attached hardware.

## What HarmonyOS documents

`@ohos.usbManager.serial` is a public serial manager introduced in **API 19**:

```ets
import { serialManager } from '@kit.BasicServicesKit';

serialManager.getPortList(): Readonly<SerialPort>[]
serialManager.hasSerialRight(portId): boolean
serialManager.requestSerialRight(portId): Promise<boolean>
serialManager.open(portId): void
serialManager.setAttribute(portId, attribute): void
serialManager.read(portId, buffer, timeout?): Promise<number>
serialManager.write(portId, buffer, timeout?): Promise<number>
serialManager.close(portId): void
serialManager.cancelSerialRight(portId): void
```

- System capability: `SystemCapability.USB.USBManager.Serial`.
- Defaults when `setAttribute` is not called: 9600 baud, 8 data bits, no
  parity, 1 stop bit.
- `open` can fail with `31400002` (no user authorization), `31400003`
  (portId missing), `31400004` (occupied) or `31400001` (manager exception).
- The permission is per app run; the app must call `requestSerialRight` after
  each launch and may ask the user.
- The serial API does **not** expose DTR/RTS. Those lines are OS-managed.

Documentation path in the local reference:

`harmony-next/references/JsEtsAPIReference/modules/ohos/@ohos.usbManager.serial (串口管理).md`

## What this project already has

- `OfficialSerial19Backend.ets` — uses `@ohos.usbManager.serial`; enumerates
  ports, requests permission, opens, sets 8/N/1, reads with timeout, writes,
  closes.
- `OfficialSerial26Backend.ets` — uses `@ohos.busManager.serial` for devices
  exposing `SystemCapability.BusManager.Serial`.
- `UsbCdcBackend.ets` — standard CDC-ACM read/write, now enabled as an
  experimental backend.
- `UsbVendorWriteOnlyBackend.ets` — raw `usbManager` output for CP210x and
  FTDI, experimental write-only.
- `UsbVendorProtocol.ts` — CP210x/FTDI control-request profiles.
- `Ch34xWriteOnlyBackend.ets` — raw `@ohos.usbManager` bulk/control transfers
  for CH340/CH341 write-only, experimental.
- `NativeSerialFactory` chooses the backend and checks `canIUse` before use.

So the API route the user asked about is **already implemented**, not missing.

## Measured capability on the connected phone

After refreshing the serial picker, the app logged:

```text
[MFP serial] official26=false official19=false ch34xWriteOnly=true usbCdc=false
```

This log was captured before the raw CDC backend was enabled. Interpretation for
the VYG-AL00 phone:

| Route | Available | Meaning |
| --- | --- | --- |
| `busManager.serial` (API 26) | no | do not select “系统串口 26” |
| `usbManager.serial` (API 19) | no | the high-level serial manager is not exposed by this phone |
| raw `usbManager` CH340/CP210x/FTDI | yes | experimental write-only output; no device ACK |
| raw `usbManager` CDC-ACM | yes (experimental) | read/write, but short-packet and firmware compatibility unverified |

The phone has the raw USB host capability, but not the high-level serial syscap.
Therefore “use usbManager.serial” cannot work on this phone even though the API
is documented; on a PC/2in1 or tablet that exposes
`SystemCapability.USB.USBManager.Serial`, the same backend should work.

## Real CH340 result

A `USB Serial` device with VID/PID `1a86:7523` was connected to the phone:

1. The app listed it under **USB CH340/CP210x/FTDI · 实验**.
2. The system showed **USB 访问授权**; after Allow, DTR/RTS were set explicitly.
3. CH340 initialization completed at 115200 8N1. The ROM query returned
   `49,0` (`0x31,0`), which the original whitelist rejected. Adding genuine
   `0x31` alongside `0x30` fixed initialization.
4. The app reached **已连接** and logged
   `[MFP output] connected generation=1`.

Arm initially failed with `source=axisValueNonFinite=L1`: L1 has no script/provider in
this video. Disabling the L1 output range switch, then disconnecting and
reconnecting the serial target (to apply the new range set), made Arm succeed.
The UI reached **1 个已启用** and the CH340 write counter advanced:

```text
[MFP ch34x] writes=1 last=50
[MFP ch34x] writes=100 last=50
[MFP ch34x] writes=200 last=50
[MFP ch34x] writes=300 last=50
```

That is a real serial write path with 50-byte TCode payloads at the configured
10 ms cadence. It still does not prove the target device executed the commands:
the CH340 backend is write-only and has no execution ACK.

## Practical choices by device

1. **PC/2in1 or tablet with `SystemCapability.USB.USBManager.Serial`**
   - Choose **系统串口 19 · usbManager**.
   - Let the app request permission.
   - DTR/RTS must be OS-managed; the UI now sets both to “系统管理” when
     switching to this backend.
2. **Phone with only raw `SystemCapability.USB.USBManager`**
   - `usbManager.serial` is unavailable.
   - Choose **USB CH340/CP210x/FTDI · 实验** for CH340/CH341, CP210x or FTDI;
     set DTR/RTS explicitly. It is write-only and not hardware-verified.
   - Choose **USB CDC · 实验** for standard CDC-ACM; it is read/write but its
     short-packet and firmware behavior is not hardware-verified.
   - CH343/CH9102 and other clones, plus non-standard vendor protocols, are not
     claimed.
3. **USB CDC-ACM (experimental)**
   - Implemented with control + bulk endpoints and standard ACM line coding.
   - It is selectable as **USB CDC · 实验**, requires explicit DTR/RTS, and is
     read/write. Short-packet and firmware compatibility are still unverified;
     do not treat it as a production guarantee.

## Remaining acceptance work

- CP210x, FTDI and CDC-ACM still need their own boards and VID/PID tests; only
  CH340 has completed enumeration, permission and vendor initialization.
- A real TCode write still requires resolving the source-authorization gate.
  After that, verify bytes on the target device at 115200 8N1 and, for CP210x/
  FTDI, the actual divisor/line-coding behavior.
- Do not claim every HarmonyOS phone/tablet exposes USB host mode or the same
  power budget.
