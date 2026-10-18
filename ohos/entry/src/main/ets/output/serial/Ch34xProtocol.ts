/** CH340/CH341A UART narrow experimental protocol. Derived from
 * mik3y/usb-serial-for-android Ch34xSerialDriver.java, commit 6a9c61f1fa16f28c2a75eef76c6383cd1dc518dd.
 * Copyright 2014 Andreas Butti; MIT, see CH34X-LICENSE.txt.
 * No device I/O in this module. Never dispatch these requests to unknown IDs.
 */
export interface Ch34xSelection { configuration: number; interfaceId: number; inputAddress: number; outputAddress: number; inputPacketSize: number; outputPacketSize: number; }
export interface Ch34xControl { input: boolean; request: number; value: number; index: number; expected: number[]; }
export function isCh34xUart(vendor: number, product: number): boolean { return vendor === 0x1a86 && (product === 0x7523 || product === 0x5523); }
export function parseCh34xUart(bytes: Uint8Array, vendor: number, product: number): Ch34xSelection {
  if (!isCh34xUart(vendor, product)) { throw new Error('unsupportedSerialChip'); }
  let deviceSeen: boolean = false; let configuration: number = -1; let end: number = 0; let iface: number = -1;
  let endpointCount: number = 0; let expectedEndpoints: number = 0;
  let input: number = 0; let output: number = 0; let inputSize: number = 0; let outputSize: number = 0;
  const addresses: number[] = [];
  for (let offset: number = 0; offset < bytes.length;) {
    const length: number = bytes[offset]; const type: number = bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length || (configuration >= 0 && offset + length > end)) { throw new Error('malformedCh34xDescriptor'); }
    if (type === 1) {
      if (deviceSeen || offset !== 0 || length !== 18 || bytes[offset + 17] !== 1 ||
        bytes[offset + 8] + 256 * bytes[offset + 9] !== vendor || bytes[offset + 10] + 256 * bytes[offset + 11] !== product) { throw new Error('ch34xDeviceMismatch'); }
      deviceSeen = true;
    } else if (type === 2) {
      if (!deviceSeen || configuration >= 0 || length !== 9 || bytes[offset + 4] !== 1 || bytes[offset + 5] === 0) { throw new Error('unsupportedCh34xConfiguration'); }
      configuration = bytes[offset + 5]; end = offset + bytes[offset + 2] + 256 * bytes[offset + 3];
      if (end !== bytes.length) { throw new Error('ambiguousCh34xConfiguration'); }
    } else if (type === 4) {
      // Narrower than reference driver's last-interface strategy: no composite,
      // alternate setting or class-mode fallback. Vendor class must be actual.
      if (configuration < 0 || iface >= 0 || length !== 9 || bytes[offset + 3] !== 0 || bytes[offset + 5] !== 255) { throw new Error('unsupportedCh34xInterface'); }
      iface = bytes[offset + 2]; expectedEndpoints = bytes[offset + 4];
      if (expectedEndpoints < 2 || expectedEndpoints > 3) { throw new Error('unsupportedCh34xEndpoints'); }
    } else if (type === 5) {
      if (iface < 0 || length < 7) { throw new Error('malformedCh34xEndpoint'); }
      const address: number = bytes[offset + 2]; const transfer: number = bytes[offset + 3] & 3;
      const size: number = bytes[offset + 4] + 256 * bytes[offset + 5];
      if ((address & 0x70) !== 0 || (address & 15) === 0 || addresses.includes(address) || size < 1 || size > 64) { throw new Error('invalidCh34xEndpoint'); }
      addresses.push(address); endpointCount++;
      if (transfer === 2) {
        if ((address & 128) !== 0) { if (input !== 0) { throw new Error('ambiguousCh34xBulk'); } input = address; inputSize = size; }
        else { if (output !== 0) { throw new Error('ambiguousCh34xBulk'); } output = address; outputSize = size; }
      } else if (transfer !== 3 || (address & 128) === 0) { throw new Error('unsupportedCh34xEndpoint'); }
    } else { throw new Error('unsupportedCh34xDescriptor'); }
    offset += length;
  }
  if (!deviceSeen || configuration < 0 || iface < 0 || endpointCount !== expectedEndpoints || input === 0 || output === 0) { throw new Error('incompleteCh34xDescriptor'); }
  return { configuration: configuration, interfaceId: iface, inputAddress: input, outputAddress: output, inputPacketSize: inputSize, outputPacketSize: outputSize };
}
function out(request: number, value: number, index: number): Ch34xControl { return { input: false, request: request, value: value, index: index, expected: [] }; }
function input(request: number, value: number, expected: number[]): Ch34xControl { return { input: true, request: request, value: value, index: 0, expected: expected }; }
export function ch34xBaudControls(baudRate: number): Ch34xControl[] {
  // Deliberate first subset of reference-supported/common MFP rates.
  const rates: number[] = [2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];
  if (!rates.includes(baudRate)) { throw new Error('unsupportedCh34xBaudRate'); }
  let divisor: number = 3; let factor: number;
  if (baudRate === 921600) { divisor = 7; factor = 0xf300; }
  else {
    factor = Math.floor(1532620800 / baudRate);
    while (factor > 0xfff0 && divisor > 0) { factor = Math.floor(factor / 8); divisor--; }
    if (factor > 0xfff0) { throw new Error('unsupportedCh34xBaudRate'); }
    factor = 0x10000 - factor;
  }
  divisor |= 0x80;
  return [out(0x9a, 0x1312, (factor & 0xff00) | divisor), out(0x9a, 0x0f2c, factor & 0xff)];
}
export function ch34xControlLines(dtr: boolean, rts: boolean): Ch34xControl { return out(0xa4, (~((dtr ? 0x20 : 0) | (rts ? 0x40 : 0))) & 0xffff, 0); }
export function ch34xVersionSupported(bytes: Uint8Array): boolean {
  // 0x30 is the reference ROM; common genuine CH340 boards report 0x31 with the
  // same 0x9a/0x95/0xa4 line-coding sequence. Pre-0x30 clones stay excluded.
  return bytes.length === 2 && (bytes[0] === 0x30 || bytes[0] === 0x31) && bytes[1] === 0;
}
export function ch34xInitialization(baudRate: number, dtr: boolean, rts: boolean): Ch34xControl[] {
  const initial: Ch34xControl[] = [out(0xa1, 0, 0)];
  initial.push(...ch34xBaudControls(9600));
  initial.push(input(0x95, 0x2518, [-1, 0]), out(0x9a, 0x2518, 0xc3), input(0x95, 0x0706, [-1, -1]), out(0xa1, 0x501f, 0xd90a));
  initial.push(...ch34xBaudControls(9600));
  initial.push(ch34xControlLines(false, false), input(0x95, 0x0706, [-1, -1]));
  initial.push(...ch34xBaudControls(baudRate));
  initial.push(out(0x9a, 0x2518, 0xc3), out(0x9a, 0x2727, 0), ch34xControlLines(dtr, rts));
  return initial;
}
