/** Write-only raw-USB serial profiles for chips that do not expose a native
 * tty: CH340/CH341, CP210x and FTDI. These are output transports only; reads,
 * CTS/DSR and device execution ACK are not claimed. All values are validated
 * before any control transfer.
 */
import type { SerialAttributes } from './SerialTransport';

export type UsbVendorChip = 'ch34x' | 'cp210x' | 'ftdi';

export interface UsbVendorControl {
  readonly requestType: number;
  readonly request: number;
  readonly value: number;
  readonly index: number;
  readonly data: ReadonlyArray<number>;
}

export function usbVendorChip(vendorId: number, productId: number): UsbVendorChip | null {
  if (vendorId === 0x1a86 && (productId === 0x7523 || productId === 0x5523)) { return 'ch34x'; }
  if (vendorId === 0x10c4 && productId === 0xea60) { return 'cp210x'; }
  if (vendorId === 0x0403 && productId === 0x6001) { return 'ftdi'; }
  return null;
}

function validate(attributes: SerialAttributes): void {
  if (attributes.dataBits !== 8 || attributes.stopBits !== 1 || attributes.parity !== 'none' || attributes.handshake !== 'none') {
    throw new Error('unsupportedUsbVendorAttributes');
  }
  if (!Number.isSafeInteger(attributes.baudRate) || attributes.baudRate < 300 || attributes.baudRate > 4000000) {
    throw new Error('unsupportedUsbVendorBaudRate');
  }
  if (attributes.dtr === null || attributes.rts === null) { throw new Error('usbVendorControlLinesMustBeExplicit'); }
}

// Protocol references: Linux drivers/usb/serial/{cp210x.c,ftdi_sio.c,ftdi_sio.h}.
// The backend verifies CP2102 part number / FT232R bcdDevice before UART writes.
function command(requestType: number, request: number, value: number, index: number, data: number[] = []): UsbVendorControl {
  return { requestType, request, value, index, data };
}
function littleEndian32(value: number): number[] {
  return [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255];
}
export function ftdiRBaudDivisor(baudRate: number): number {
  if (!Number.isSafeInteger(baudRate) || baudRate < 300 || baudRate > 3000000) { throw new Error('unsupportedUsbVendorBaudRate'); }
  // FT232R supports divisors 1, 1.5, and 2..16383 in eighth steps.
  const candidates: number[] = [8, 12, Math.max(16, Math.min(131071, Math.round(24000000 / baudRate)))];
  let eighths: number = candidates[0];
  for (const candidate of candidates) {
    if (Math.abs(24000000 / candidate - baudRate) < Math.abs(24000000 / eighths - baudRate)) { eighths = candidate; }
  }
  if (Math.abs(24000000 / eighths - baudRate) / baudRate > 0.015) { throw new Error('unsupportedUsbVendorBaudError'); }
  if (eighths === 8) { return 0; }
  if (eighths === 12) { return 1; }
  const fractionBits: number[] = [0, 3, 2, 4, 1, 5, 6, 7];
  return Math.floor(eighths / 8) | (fractionBits[eighths % 8] << 14);
}
export function usbVendorInitialization(chip: UsbVendorChip, attributes: SerialAttributes, interfaceId: number = 0): UsbVendorControl[] {
  validate(attributes);
  if (!Number.isSafeInteger(interfaceId) || interfaceId < 0 || interfaceId > 255) { throw new Error('invalidUsbVendorInterface'); }
  if (chip === 'ch34x') { throw new Error('ch34xUsesDedicatedBackend'); }
  const lines: number = (attributes.dtr ? 1 : 0) | (attributes.rts ? 2 : 0);
  if (chip === 'cp210x') {
    // Narrow legacy CP2102 rates; CP2102N and multiport variants are not admitted.
    if (![300, 600, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600].includes(attributes.baudRate)) {
      throw new Error('unsupportedUsbVendorBaudRate');
    }
    // Four little-endian DWORDs: manual DTR, manual RTS, XON/XOFF limits.
    // No CTS/DSR/DCD handshake or software flow control. Preserve chosen lines.
    const flow: number[] = [...littleEndian32(attributes.dtr ? 1 : 0),
      ...littleEndian32(attributes.rts ? 0x40 : 0), ...littleEndian32(0), ...littleEndian32(0)];
    return [
      command(0x41, 0x00, 1, interfaceId),
      command(0x41, 0x1e, 0, interfaceId, littleEndian32(attributes.baudRate)),
      command(0x41, 0x03, 0x0800, interfaceId),
      command(0x41, 0x13, 0, interfaceId, flow),
      command(0x41, 0x07, lines | 0x0300, interfaceId)
    ];
  }
  if (interfaceId !== 0) { throw new Error('unsupportedFtdiInterface'); }
  const divisor: number = ftdiRBaudDivisor(attributes.baudRate);
  return [
    command(0x40, 0x00, 0, 0),
    command(0x40, 0x03, divisor & 0xffff, divisor >>> 16),
    command(0x40, 0x04, 0x0008, 0),
    command(0x40, 0x02, 0, 0),
    command(0x40, 0x01, lines | 0x0300, 0),
    command(0x40, 0x09, 16, 0)
  ];
}
