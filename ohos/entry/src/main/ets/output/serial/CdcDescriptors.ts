/** Strict CDC ACM selection from actual configuration descriptors, never VID guesses.
 * Unknown/vendor protocols, ambiguous functions and alternate settings are rejected.
 */
export interface CdcFunction {
  configuration: number; controlInterface: number; dataInterface: number;
  inputAddress: number; outputAddress: number; inputPacketSize: number; outputPacketSize: number;
}
class DescriptorInterface {
  id: number; clazz: number; subClass: number; protocol: number; alternate: number;
  unionSlave: number = -1; acmCapabilities: number = 0; input: number = 0; output: number = 0;
  inputSize: number = 0; outputSize: number = 0; endpointCount: number = 0; expectedEndpoints: number; acmSeen: boolean = false; headerSeen: boolean = false;
  constructor(bytes: Uint8Array, offset: number) {
    this.expectedEndpoints = bytes[offset + 4]; this.id = bytes[offset + 2]; this.alternate = bytes[offset + 3]; this.clazz = bytes[offset + 5];
    this.subClass = bytes[offset + 6]; this.protocol = bytes[offset + 7];
  }
}
export function parseCdcAcm(bytes: Uint8Array): CdcFunction {
  let configuration: number = -1; let end: number = 0; let expectedInterfaces: number = 0;
  const interfaces: DescriptorInterface[] = []; let current: DescriptorInterface | null = null;
  for (let offset: number = 0; offset < bytes.length;) {
    const length: number = bytes[offset]; const type: number = bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) { throw new Error('malformedUsbDescriptor'); }
    if (configuration >= 0 && (offset >= end || offset + length > end)) { throw new Error('descriptorOutsideConfiguration'); }
    if (type === 2) {
      if (length < 9 || configuration !== -1) { throw new Error('ambiguousUsbConfiguration'); }
      configuration = bytes[offset + 5]; expectedInterfaces = bytes[offset + 4];
      if (configuration === 0 || expectedInterfaces < 2) { throw new Error('invalidUsbConfiguration'); }
      end = offset + bytes[offset + 2] + bytes[offset + 3] * 256;
      if (end > bytes.length || end < offset + length) { throw new Error('truncatedUsbConfiguration'); }
    } else if (type === 4) {
      if (configuration < 0 || offset >= end || length < 9) { throw new Error('malformedUsbInterface'); }
      const parsed: DescriptorInterface = new DescriptorInterface(bytes, offset);
      current = parsed;
      if (parsed.alternate !== 0) { throw new Error('alternateInterfaceUnsupported'); }
      if (interfaces.some(value => value.id === parsed.id && value.alternate === parsed.alternate)) { throw new Error('duplicateUsbInterface'); }
      interfaces.push(current);
    } else if (type === 0x24 && current !== null) {
      if (length < 3 || current.clazz !== 2 || current.subClass !== 2) { throw new Error('malformedCdcDescriptor'); }
      if (bytes[offset + 2] === 0) {
        const version: number = bytes[offset + 3] + bytes[offset + 4] * 256;
        if (length !== 5 || current.headerSeen || version < 0x110 || version > 0x120) { throw new Error('unsupportedCdcHeader'); }
        current.headerSeen = true;
      } else if (bytes[offset + 2] === 6) {
        if (length !== 5 || current.unionSlave !== -1 || bytes[offset + 3] !== current.id) { throw new Error('ambiguousCdcUnion'); }
        current.unionSlave = bytes[offset + 4];
      } else if (bytes[offset + 2] === 2) {
        if (length !== 4 || current.acmSeen) { throw new Error('malformedCdcAcm'); } current.acmSeen = true; current.acmCapabilities = bytes[offset + 3];
      }
    } else if (type === 5 && current !== null) {
      if (length < 7 || (bytes[offset + 2] & 0x70) !== 0) { throw new Error('malformedUsbEndpoint'); }
      current.endpointCount++;
      if ((bytes[offset + 3] & 3) === 2) {
        const address: number = bytes[offset + 2]; const size: number = bytes[offset + 4] + bytes[offset + 5] * 256;
        if ((address & 15) === 0 || size < 1 || size > 1024) { throw new Error('invalidBulkEndpoint'); }
        if ((address & 128) !== 0) {
          if (current.input !== 0) { throw new Error('ambiguousBulkEndpoint'); } current.input = address; current.inputSize = size;
        } else {
          if (current.output !== 0) { throw new Error('ambiguousBulkEndpoint'); } current.output = address; current.outputSize = size;
        }
      }
    }
    offset += length;
  }
  if (interfaces.length !== expectedInterfaces || interfaces.some(value => value.endpointCount !== value.expectedEndpoints)) { throw new Error('usbDescriptorCountMismatch'); }
  const controls: DescriptorInterface[] = interfaces.filter(value => value.headerSeen && value.clazz === 2 && value.subClass === 2 && (value.protocol === 0 || value.protocol === 1) && value.alternate === 0 && (value.acmCapabilities & 2) !== 0 && value.unionSlave >= 0);
  if (controls.length !== 1) { throw new Error('unsupportedOrAmbiguousCdcAcm'); }
  const control: DescriptorInterface = controls[0];
  const data: DescriptorInterface[] = interfaces.filter(value => value.id === control.unionSlave && value.alternate === 0 && value.clazz === 10 && value.subClass === 0 && value.protocol === 0 && value.input !== 0 && value.output !== 0);
  if (data.length !== 1 || data[0].id === control.id) { throw new Error('invalidCdcDataInterface'); }
  return { configuration: configuration, controlInterface: control.id, dataInterface: data[0].id,
    inputAddress: data[0].input, outputAddress: data[0].output, inputPacketSize: data[0].inputSize, outputPacketSize: data[0].outputSize };
}
export function cdcLineCoding(baudRate: number): Uint8Array {
  if (!Number.isSafeInteger(baudRate) || baudRate < 1 || baudRate > 4000000) { throw new Error('invalidBaudRate'); }
  return new Uint8Array([baudRate & 255, (baudRate >>> 8) & 255, (baudRate >>> 16) & 255, (baudRate >>> 24) & 255, 0, 0, 8]);
}
