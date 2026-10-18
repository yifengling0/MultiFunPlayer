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
  readonly expected: ReadonlyArray<number>;
}

export function usbVendorChip(vendorId: number, productId: number): UsbVendorChip | null {
  if (vendorId === 0x1a86 && (productId === 0x7523 || productId === 0x5523)) { return 'ch34x'; }
  if (vendorId === 0x10c4 && (productId === 0xea60 || productId === 0xea70 || productId === 0xea71 || productId === 0xea80)) { return 'cp210x'; }
  if (vendorId === 0x0403 && [0x6001, 0x6010, 0x6011, 0x6014, 0x6015].indexOf(productId) >= 0) { return 'ftdi'; }
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

function command(requestType: number, request: number, value: number, index: number = 0, expected: number[] = []): UsbVendorControl {
  return { requestType, request, value, index, expected };
}

export function usbVendorInitialization(chip: UsbVendorChip, attributes: SerialAttributes): UsbVendorControl[] {
  validate(attributes);
  if (chip === 'ch34x') { throw new Error('ch34xUsesDedicatedBackend'); }
  const lines: number = (attributes.dtr ? 1 : 0) | (attributes.rts ? 2 : 0);
  if (chip === 'cp210x') {
    // CP210x vendor requests are host-to-interface. SET_BAUDRATE splits the
    // 32-bit rate across wValue (low) and wIndex (high); 8N1 is 0x0008.
    return [
      command(0x41, 0x00, 0x0001),                 // IFC_ENABLE
      command(0x41, 0x1e, attributes.baudRate & 0xffff, attributes.baudRate >>> 16),
      command(0x41, 0x03, 0x0008),                 // 8 data bits, no parity, 1 stop
      command(0x41, 0x07, lines | 0x0300),          // DTR/RTS + masks
      command(0x41, 0x13, 0x0000)                   // no flow control
    ];
  }
  // FTDI FT232R/FT2232: 3 MHz base clock, integer divisor (approximate baud).
  const divisor: number = attributes.baudRate >= 3000000 ? 0 : Math.max(1, Math.round(3000000 / attributes.baudRate));
  return [
    command(0x40, 0x00, 0x0000),                   // RESET
    command(0x40, 0x03, divisor),                  // SET_BAUD_RATE
    command(0x40, 0x04, 0x0008),                   // SET_DATA 8N1
    command(0x40, 0x02, 0x0000),                   // no flow control
    command(0x40, 0x01, lines),                    // MODEM_CTRL DTR/RTS
    command(0x40, 0x09, 16)                        // latency timer
  ];
}
