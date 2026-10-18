import usbManager from '@ohos.usbManager';
import type { BusinessError } from '@kit.BasicServicesKit';
import { usbVendorChip, usbVendorInitialization } from './UsbVendorProtocol';
import type { UsbVendorChip, UsbVendorControl } from './UsbVendorProtocol';
import type { SerialPortOption } from './SerialDiscoveryTypes';
import type { SerialAttributes, SerialBackend, SerialSink } from './SerialTransport';

/** Experimental write-only transport for CP210x and FTDI. CH340/CH341 stays in
 * Ch34xWriteOnlyBackend because it has an additional descriptor/version check.
 * No reads, CTS/DSR or device ACK are claimed. */
export class UsbVendorWriteOnlyBackend implements SerialBackend {
  private readonly deviceName: string;
  private pipe: usbManager.USBDevicePipe | null = null;
  private iface: usbManager.USBInterface | null = null;
  private endpoint: number = 0;
  private stopped: boolean = true;
  private transfer: usbManager.UsbDataTransferParams | null = null;
  private pending: Promise<number> | null = null;
  private chip: UsbVendorChip;
  constructor(deviceName: string, chip: UsbVendorChip) { this.deviceName = deviceName; this.chip = chip; }
  async open(attributes: SerialAttributes, sink: SerialSink, timeoutMs: number): Promise<void> {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) { throw new Error('invalidSerialTimeout'); }
    if (typeof usbManager.usbSubmitTransfer !== 'function' || typeof usbManager.usbCancelTransfer !== 'function') { throw new Error('usbApi18TransfersUnavailable'); }
    usbVendorInitialization(this.chip, attributes); // Validate before permission or device I/O.
    this.stopped = false;
    const matches: usbManager.USBDevice[] = usbManager.getDevices().filter(device => device.name === this.deviceName);
    if (matches.length !== 1) { throw new Error('usbDeviceUnavailableOrAmbiguous'); }
    const device: usbManager.USBDevice = matches[0];
    if (usbVendorChip(device.vendorId, device.productId) !== this.chip || device.configs.length !== 1 || device.configs[0].interfaces.length !== 1) {
      throw new Error('usbVendorDescriptorMismatch');
    }
    const iface: usbManager.USBInterface = device.configs[0].interfaces[0];
    const output: usbManager.USBEndpoint[] = iface.endpoints.filter(endpoint => endpoint.direction === 0 && endpoint.interfaceId === iface.id &&
      endpoint.type === 2 && (endpoint.attributes & 3) === 2 && endpoint.number === (endpoint.address & 15) && (endpoint.address & 0x80) === 0 && endpoint.maxPacketSize > 0 && endpoint.maxPacketSize <= 64 && endpoint.number > 0);
    if (iface.clazz !== 255 || iface.alternateSetting !== 0 || output.length !== 1) { throw new Error('usbVendorDescriptorMismatch'); }
    const commands: UsbVendorControl[] = usbVendorInitialization(this.chip, attributes, iface.id);
    if (!usbManager.hasRight(device.name) && !await usbManager.requestRight(device.name)) { throw new Error('usbPermissionDenied'); }
    if (this.stopped || !sink.live()) { throw new Error('cancelled'); }
    const pipe: usbManager.USBDevicePipe = usbManager.connectDevice(device);
    if (pipe === undefined || pipe === null) { throw new Error('usbConnectFailed'); }
    this.pipe = pipe;
    const raw: Uint8Array = usbManager.getRawDescriptor(pipe);
    if (raw.length < 18 || raw[0] !== 18 || raw[1] !== 1 || raw[17] !== 1 ||
      raw[8] + 256 * raw[9] !== device.vendorId || raw[10] + 256 * raw[11] !== device.productId) {
      throw new Error('usbVendorDescriptorMismatch');
    }
    if (this.chip === 'ftdi' && (raw[12] !== 0 || raw[13] !== 6)) { throw new Error('unsupportedFtdiVariant'); }
    if (usbManager.claimInterface(this.pipe, iface, false) !== 0) { throw new Error('usbInterfaceBusy'); }
    this.iface = iface; this.endpoint = output[0].address;
    if (this.chip === 'cp210x') {
      // Read-only Silicon Labs GET_PARTNUM, before any UART configuration.
      const part: Uint8Array = new Uint8Array(1);
      const count: number = await usbManager.usbControlTransfer(pipe, { bmRequestType: 0xc0,
        bRequest: 0xff, wValue: 0x370b, wIndex: iface.id, wLength: 1, data: part }, timeoutMs);
      if (count !== 1 || part[0] !== 2) { throw new Error('unsupportedCp210xVariant'); }
    }
    for (const command of commands) {
      if (this.stopped || !sink.live()) { throw new Error('cancelled'); }
      await this.control(command, timeoutMs);
    }
    if (this.stopped || !sink.live()) { throw new Error('cancelled'); }
  }
  private async control(command: UsbVendorControl, timeoutMs: number): Promise<void> {
    if (this.pipe === null || this.stopped) { throw new Error('closed'); }
    const count: number = await usbManager.usbControlTransfer(this.pipe, {
      bmRequestType: command.requestType, bRequest: command.request,
      wValue: command.value, wIndex: command.index, wLength: command.data.length, data: new Uint8Array(command.data)
    }, timeoutMs);
    if (count !== command.data.length) { throw new Error('usbVendorControlFailed'); }
  }
  write(bytes: Uint8Array, timeoutMs: number): Promise<number> {
    if (this.stopped || this.pipe === null || this.iface === null || this.pending !== null ||
      bytes.length < 1 || bytes.length > 4096 || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) {
      return Promise.reject(new Error('invalidUsbVendorWrite'));
    }
    const pipe: usbManager.USBDevicePipe = this.pipe;
    const copy: Uint8Array = bytes.slice();
    const operation: Promise<number> = new Promise<number>((resolve, reject): void => {
      const transfer: usbManager.UsbDataTransferParams = { devPipe: pipe,
        flags: usbManager.UsbTransferFlags.USB_TRANSFER_SHORT_NOT_OK,
        endpoint: this.endpoint, type: usbManager.UsbEndpointTransferType.TRANSFER_TYPE_BULK,
        timeout: timeoutMs, length: copy.length, buffer: copy, userData: new Uint8Array(0), isoPacketCount: 0,
        callback: (error: BusinessError, result: usbManager.SubmitTransferCallback): void => {
          this.transfer = null;
          if (error || result === undefined || result.status !== usbManager.UsbTransferStatus.TRANSFER_COMPLETED ||
            !Number.isSafeInteger(result.actualLength) || result.actualLength < 1 || result.actualLength > copy.length) {
            reject(new Error('usbVendorWriteFailedUnknownPrefix')); return;
          }
          resolve(result.actualLength);
        } };
      this.transfer = transfer;
      try { usbManager.usbSubmitTransfer(transfer); } catch { this.transfer = null; reject(new Error('usbSubmitFailed')); }
    });
    this.pending = operation;
    return operation.finally((): void => { this.pending = null; });
  }
  stop(): void { this.stopped = true; if (this.transfer !== null) { try { usbManager.usbCancelTransfer(this.transfer); } catch { /* cancellation is not settlement. */ } } }
  async close(): Promise<void> {
    this.stop(); if (this.pending !== null) { try { await this.pending; } catch { /* wait for callback. */ } }
    const pipe: usbManager.USBDevicePipe | null = this.pipe;
    if (pipe === null) { return; }
    let releaseFailed: boolean = false;
    if (this.iface !== null) { try { releaseFailed = usbManager.releaseInterface(pipe, this.iface) !== 0; } catch { releaseFailed = true; } }
    if (usbManager.closePipe(pipe) !== 0) { throw new Error('usbCloseUnconfirmed'); }
    this.pipe = null; this.iface = null; this.endpoint = 0;
    if (releaseFailed) { throw new Error('usbReleaseUnconfirmed'); }
  }
}

function isVendorCandidate(device: usbManager.USBDevice): boolean {
  const chip = usbVendorChip(device.vendorId, device.productId);
  if (chip !== 'cp210x' && chip !== 'ftdi') { return false; }
  if (device.configs.length !== 1 || device.configs[0].interfaces.length !== 1) { return false; }
  const iface = device.configs[0].interfaces[0];
  if (iface.clazz !== 255 || iface.alternateSetting !== 0) { return false; }
  return iface.endpoints.filter(endpoint => endpoint.direction === 0 && endpoint.type === 2 && (endpoint.attributes & 3) === 2 &&
    endpoint.interfaceId === iface.id && endpoint.number === (endpoint.address & 15) && endpoint.maxPacketSize > 0 && endpoint.maxPacketSize <= 64).length === 1;
}

export function listUsbVendorPorts(): SerialPortOption[] {
  return usbManager.getDevices().filter(isVendorCandidate).map((device): SerialPortOption => {
    const chip = usbVendorChip(device.vendorId, device.productId);
    return { backend: 'ch34xWriteOnly', portName: device.name, portId: -1,
      label: (chip === 'cp210x' ? 'CP210x ' : 'FTDI ') + (device.productName.length > 0 ? device.productName : device.name),
      vendorId: device.vendorId, productId: device.productId, writeOnly: true, controlLines: true };
  });
}

export function usbVendorBackendChip(portName: string): UsbVendorChip | null {
  const matches = usbManager.getDevices().filter(device => device.name === portName);
  if (matches.length !== 1) { return null; }
  const chip = usbVendorChip(matches[0].vendorId, matches[0].productId);
  return chip === 'cp210x' || chip === 'ftdi' ? chip : null;
}
