import usbManager from '@ohos.usbManager';
import type { BusinessError } from '@kit.BasicServicesKit';
import { parseCdcAcm, cdcLineCoding } from './CdcDescriptors';
import type { CdcFunction } from './CdcDescriptors';
import type { SerialAttributes, SerialBackend, SerialSink } from './SerialTransport';
/** Non-admitted CDC prototype: NativeSerialFactory deliberately blocks production
 * creation pending SDK short-packet semantics verification. Direct construction
 * is reserved for the isolated mock/compile fixture.
 * Standard CDC ACM only. No vendor-ID heuristic, driver detach, force claim,
 * configuration reset, probing writes or vendor requests. Requires API18 transfers. */
export class UsbCdcBackend implements SerialBackend {
  private readonly deviceName: string;
  private pipe: usbManager.USBDevicePipe | null = null;
  private claimed: usbManager.USBInterface[] = [];
  private output: usbManager.USBEndpoint | null = null;
  private stopped: boolean = true;
  private readPending: Promise<void> | null = null;
  private transfer: usbManager.UsbDataTransferParams | null = null;
  private writeTransfer: usbManager.UsbDataTransferParams | null = null;
  constructor(deviceName: string) { this.deviceName = deviceName; }
  async open(attributes: SerialAttributes, sink: SerialSink, timeoutMs: number): Promise<void> {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) { throw new Error('invalidSerialTimeout'); }
    if (typeof usbManager.usbSubmitTransfer !== 'function' || typeof usbManager.usbCancelTransfer !== 'function') { throw new Error('usbApi18TransfersUnavailable'); }
    if (attributes.dtr === null || attributes.rts === null) { throw new Error('cdcControlLinesMustBeExplicit'); }
    this.stopped = false;
    const matches: usbManager.USBDevice[] = usbManager.getDevices().filter(device => device.name === this.deviceName);
    if (matches.length !== 1 || matches[0].configs.length !== 1) { throw new Error('usbDeviceUnavailableOrAmbiguous'); }
    const device: usbManager.USBDevice = matches[0];
    // Do not request permission for vendor-class devices hoping they are serial.
    if (!device.configs[0].interfaces.some(iface => iface.clazz === 2 && iface.subClass === 2)) { throw new Error('unsupportedVendorSerialProtocol'); }
    if (!usbManager.hasRight(device.name) && !await usbManager.requestRight(device.name)) { throw new Error('usbPermissionDenied'); }
    if (this.stopped || !sink.live()) { throw new Error('cancelled'); }
    this.pipe = usbManager.connectDevice(device);
    const selection: CdcFunction = parseCdcAcm(usbManager.getRawDescriptor(this.pipe));
    if (device.configs[0].id !== selection.configuration) { throw new Error('usbDescriptorMismatch'); }
    const interfaces: usbManager.USBInterface[] = device.configs[0].interfaces;
    if (interfaces.some((iface, index) => interfaces.some((other, otherIndex) => index !== otherIndex && iface.id === other.id))) { throw new Error('ambiguousUsbInterfaces'); }
    const control: usbManager.USBInterface | undefined = device.configs[0].interfaces.find(iface => iface.id === selection.controlInterface && iface.alternateSetting === 0 && iface.clazz === 2 && iface.subClass === 2 && (iface.protocol === 0 || iface.protocol === 1));
    const data: usbManager.USBInterface | undefined = device.configs[0].interfaces.find(iface => iface.id === selection.dataInterface && iface.alternateSetting === 0 && iface.clazz === 10 && iface.subClass === 0 && iface.protocol === 0);
    if (control === undefined || data === undefined) { throw new Error('usbDescriptorMismatch'); }
    const input: usbManager.USBEndpoint | undefined = data.endpoints.find(endpoint => endpoint.address === selection.inputAddress && endpoint.direction === 128 && endpoint.interfaceId === data.id && endpoint.type === 2 && (endpoint.attributes & 3) === 2 && endpoint.number === (endpoint.address & 15) && endpoint.maxPacketSize === selection.inputPacketSize);
    const output: usbManager.USBEndpoint | undefined = data.endpoints.find(endpoint => endpoint.address === selection.outputAddress && endpoint.direction === 0 && endpoint.interfaceId === data.id && endpoint.type === 2 && (endpoint.attributes & 3) === 2 && endpoint.number === (endpoint.address & 15) && endpoint.maxPacketSize === selection.outputPacketSize);
    if (input === undefined || output === undefined) { throw new Error('usbDescriptorMismatch'); }
    if (usbManager.claimInterface(this.pipe, control, false) !== 0) { throw new Error('usbInterfaceBusy'); } this.claimed.push(control);
    if (usbManager.claimInterface(this.pipe, data, false) !== 0) { throw new Error('usbInterfaceBusy'); } this.claimed.push(data);
    this.output = output;
    const lineCoding: Uint8Array = cdcLineCoding(attributes.baudRate);
    const configured: number = await usbManager.usbControlTransfer(this.pipe, { bmRequestType: 0x21, bRequest: 0x20,
      wValue: 0, wIndex: control.id, wLength: 7, data: lineCoding }, timeoutMs);
    if (configured !== 7) { throw new Error('cdcLineCodingFailed'); }
    if (this.stopped || !sink.live()) { throw new Error('cancelled'); }
    // Both control lines must be explicit for CDC, whose request sets both bits.
    if (attributes.dtr === null || attributes.rts === null) { throw new Error('cdcControlLinesMustBeExplicit'); }
    const lines: number = (attributes.dtr ? 1 : 0) | (attributes.rts ? 2 : 0);
    const controlResult: number = await usbManager.usbControlTransfer(this.pipe, { bmRequestType: 0x21, bRequest: 0x22,
      wValue: lines, wIndex: control.id, wLength: 0, data: new Uint8Array(0) }, timeoutMs);
    if (controlResult !== 0) { throw new Error('cdcControlLinesFailed'); }
    if (this.stopped || !sink.live()) { throw new Error('cancelled'); }
    this.readPending = this.readLoop(sink, input, timeoutMs);
  }
  private readOnce(input: usbManager.USBEndpoint, timeoutMs: number, sink: SerialSink): Promise<void> {
    const pipe: usbManager.USBDevicePipe | null = this.pipe;
    if (pipe === null) { return Promise.reject(new Error('closed')); }
    return new Promise<void>((resolve, reject): void => {
      const buffer: Uint8Array = new Uint8Array(input.maxPacketSize);
      const transfer: usbManager.UsbDataTransferParams = { devPipe: pipe, flags: 0,
        endpoint: input.address, type: usbManager.UsbEndpointTransferType.TRANSFER_TYPE_BULK,
        timeout: timeoutMs, length: buffer.length, userData: new Uint8Array(0), buffer: buffer, isoPacketCount: 0,
        callback: (error: BusinessError, result: usbManager.SubmitTransferCallback): void => {
          this.transfer = null;
          if (error || result === undefined || !Number.isSafeInteger(result.actualLength) || result.actualLength < 0 || result.actualLength > buffer.length) { reject(new Error('usbReadFailed')); return; }
          if (result.status === usbManager.UsbTransferStatus.TRANSFER_COMPLETED || result.status === usbManager.UsbTransferStatus.TRANSFER_TIMED_OUT) {
            if (!this.stopped && sink.live() && result.actualLength > 0) { sink.received(buffer.slice(0, result.actualLength)); } resolve();
          } else if (this.stopped && result.status === usbManager.UsbTransferStatus.TRANSFER_CANCELED) { resolve(); }
          else { reject(new Error('usbReadFailed')); }
        } };
      this.transfer = transfer;
      try { usbManager.usbSubmitTransfer(transfer); } catch { this.transfer = null; reject(new Error('usbSubmitFailed')); }
    });
  }
  private async readLoop(sink: SerialSink, input: usbManager.USBEndpoint, timeoutMs: number): Promise<void> {
    while (!this.stopped && sink.live()) {
      try { await this.readOnce(input, timeoutMs, sink); }
      catch { if (!this.stopped) { sink.fault('usbReadFailedOrDetached'); } return; }
      if (!this.stopped) { await new Promise<void>(resolve => { setTimeout(resolve, 1); }); }
    }
  }
  write(bytes: Uint8Array, timeoutMs: number): Promise<number> { if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) { return Promise.reject(new Error('invalidSerialTimeout')); }
    if (this.stopped || this.pipe === null || this.output === null) { return Promise.reject(new Error('closed')); }
    const pipe: usbManager.USBDevicePipe = this.pipe;
    const output: usbManager.USBEndpoint = this.output;
    return new Promise<number>((resolve, reject): void => {
      const transfer: usbManager.UsbDataTransferParams = { devPipe: pipe,
        // Intentionally fail short OUT transfers; never infer an accepted prefix
        // after ERROR. Unlike legacy bulkTransfer, callback exposes actualLength.
        flags: usbManager.UsbTransferFlags.USB_TRANSFER_SHORT_NOT_OK,
        endpoint: output.address, type: usbManager.UsbEndpointTransferType.TRANSFER_TYPE_BULK,
        timeout: timeoutMs, length: bytes.length, buffer: bytes, userData: new Uint8Array(0), isoPacketCount: 0,
        callback: (error: BusinessError, result: usbManager.SubmitTransferCallback): void => {
          this.writeTransfer = null;
          if (error || result === undefined || result.status !== usbManager.UsbTransferStatus.TRANSFER_COMPLETED ||
            !Number.isSafeInteger(result.actualLength) || result.actualLength < 1 || result.actualLength > bytes.length) {
            reject(new Error('usbWriteFailedOrPartialUnknown')); return;
          }
          resolve(result.actualLength);
        } };
      this.writeTransfer = transfer;
      try { usbManager.usbSubmitTransfer(transfer); } catch { this.writeTransfer = null; reject(new Error('usbSubmitFailed')); }
    });
  }
  stop(): void {
    this.stopped = true;
    if (this.writeTransfer !== null) { try { usbManager.usbCancelTransfer(this.writeTransfer); } catch { /* Native callback is still required. */ } }
    if (this.transfer !== null) { try { usbManager.usbCancelTransfer(this.transfer); } catch { /* Wait for native callback; never claim cancellation succeeded. */ } }
  }
  async close(): Promise<void> {
    this.stop(); if (this.readPending !== null) { await this.readPending; this.readPending = null; }
    const pipe: usbManager.USBDevicePipe | null = this.pipe;
    if (pipe === null) { return; }
    let failed: boolean = false;
    for (const iface of this.claimed.slice().reverse()) { try { if (usbManager.releaseInterface(pipe, iface) !== 0) { failed = true; } } catch { failed = true; } }
    this.claimed = [];
    if (usbManager.closePipe(pipe) !== 0) { throw new Error('usbCloseFailed'); }
    this.pipe = null; this.output = null;
    if (failed) { throw new Error('usbReleaseUnconfirmed'); }
  }
}
