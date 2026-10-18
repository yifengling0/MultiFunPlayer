import usbManager from '@ohos.usbManager';
import type { SerialPortOption } from './SerialDiscoveryTypes';
import type { BusinessError } from '@kit.BasicServicesKit';
import { isCh34xUart, parseCh34xUart, ch34xVersionSupported, ch34xInitialization } from './Ch34xProtocol';
import type { Ch34xControl, Ch34xSelection } from './Ch34xProtocol';
import type { SerialAttributes, SerialBackend, SerialSink } from './SerialTransport';
/** Experimental, explicitly write-only. Does NOT receive TCode device gestures,
 * monitor CTS/DSR, or claim device execution ACK. No factory production admission
 * until integration review and explicit UI disclosure. */
export class Ch34xWriteOnlyBackend implements SerialBackend {
  private readonly deviceName: string;
  private pipe: usbManager.USBDevicePipe | null = null;
  private iface: usbManager.USBInterface | null = null;
  private endpoint: number = 0;
  private stopped: boolean = true;
  private transfer: usbManager.UsbDataTransferParams | null = null;
  private pending: Promise<number> | null = null;
  private writes: number = 0;
  constructor(deviceName: string) { this.deviceName = deviceName; }
  async open(attributes: SerialAttributes, sink: SerialSink, timeoutMs: number): Promise<void> {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) { throw new Error('invalidSerialTimeout'); }
    if (typeof usbManager.usbSubmitTransfer !== 'function' || typeof usbManager.usbCancelTransfer !== 'function') { throw new Error('usbApi18TransfersUnavailable'); }
    if (attributes.dtr === null || attributes.rts === null || attributes.dataBits !== 8 || attributes.stopBits !== 1 || attributes.parity !== 'none' || attributes.handshake !== 'none') { throw new Error('unsupportedCh34xAttributes'); }
    const commands: Ch34xControl[] = ch34xInitialization(attributes.baudRate, attributes.dtr, attributes.rts);
    this.stopped = false;
    const matches: usbManager.USBDevice[] = usbManager.getDevices().filter(device => device.name === this.deviceName && isCh34xCandidate(device));
    if (matches.length !== 1 || matches[0].configs.length !== 1 || matches[0].configs[0].interfaces.length !== 1) { throw new Error('unsupportedCh34xDevice'); }
    const device: usbManager.USBDevice = matches[0];
    const candidate: usbManager.USBInterface = device.configs[0].interfaces[0];
    if (candidate.clazz !== 255 || candidate.alternateSetting !== 0) { throw new Error('unsupportedCh34xInterface'); }
    if (!usbManager.hasRight(device.name) && !await usbManager.requestRight(device.name)) { throw new Error('usbPermissionDenied'); }
    this.requireLive(sink);
    this.pipe = usbManager.connectDevice(device);
    let selection: Ch34xSelection;
    try { selection = parseCh34xUart(usbManager.getRawDescriptor(this.pipe), device.vendorId, device.productId); }
    catch (error) { console.info('[MFP ch34x] descriptor rejected ' + String(error)); throw new Error('ch34xDescriptorRejected'); }
    if (selection.configuration !== device.configs[0].id || candidate.id !== selection.interfaceId || candidate.endpoints.length < 2 || candidate.endpoints.length > 3) { throw new Error('ch34xDescriptorMismatch'); }
    const input: usbManager.USBEndpoint[] = candidate.endpoints.filter(ep => ep.address === selection.inputAddress && ep.direction === 128 && ep.interfaceId === candidate.id && ep.type === 2 && (ep.attributes & 3) === 2 && ep.number === (ep.address & 15) && ep.maxPacketSize === selection.inputPacketSize);
    const output: usbManager.USBEndpoint[] = candidate.endpoints.filter(ep => ep.address === selection.outputAddress && ep.direction === 0 && ep.interfaceId === candidate.id && ep.type === 2 && (ep.attributes & 3) === 2 && ep.number === (ep.address & 15) && ep.maxPacketSize === selection.outputPacketSize);
    if (input.length !== 1 || output.length !== 1) { throw new Error('ch34xDescriptorMismatch'); }
    if (usbManager.claimInterface(this.pipe, candidate, false) !== 0) { throw new Error('usbInterfaceBusy'); }
    this.iface = candidate; this.endpoint = selection.outputAddress;
    // Read-only vendor version query comes after exact model/descriptor/permission.
    let version: Uint8Array;
    try { version = await this.control({ input: true, request: 0x5f, value: 0, index: 0, expected: [-1, 0] }, timeoutMs); }
    catch (error) { console.info('[MFP ch34x] version query failed ' + String(error)); throw new Error('ch34xVersionQueryFailed'); }
    console.info('[MFP ch34x] version ' + Array.from(version).join(','));
    if (!ch34xVersionSupported(version)) { throw new Error('unsupportedCh34xVersion'); }
    console.info('[MFP ch34x] init commands=' + commands.length + ' live=' + sink.live());
    try {
      for (const command of commands) {
        this.requireLive(sink);
        try { await this.control(command, timeoutMs); }
        catch (error) { console.info('[MFP ch34x] init failed request=' + command.request + ' ' + String(error)); throw new Error('ch34xInitFailed'); }
      }
      this.requireLive(sink);
      console.info('[MFP ch34x] initialized');
    } catch (error) {
      const text: string = String(error);
      console.info('[MFP ch34x] init sequence error ' + text);
      if (text.indexOf('cancelled') >= 0) { throw new Error('cancelled'); }
      throw new Error('ch34xInitSequenceFailed');
    }
  }
  private requireLive(sink: SerialSink): void { if (this.stopped || !sink.live()) { throw new Error('cancelled'); } }
  private async control(command: Ch34xControl, timeoutMs: number): Promise<Uint8Array> {
    if (this.pipe === null || this.stopped || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) { throw new Error('invalidCh34xControl'); }
    const buffer: Uint8Array = new Uint8Array(command.expected.length);
    const count: number = await usbManager.usbControlTransfer(this.pipe, { bmRequestType: command.input ? 0xc0 : 0x40,
      bRequest: command.request, wValue: command.value, wIndex: command.index, wLength: buffer.length, data: buffer }, timeoutMs);
    if (count !== buffer.length || command.expected.some((value, index) => value >= 0 && value !== buffer[index])) { throw new Error('ch34xControlVerificationFailed'); }
    return buffer;
  }
  write(bytes: Uint8Array, timeoutMs: number): Promise<number> {
    if (this.stopped || this.pipe === null || this.iface === null || this.pending !== null || bytes.length < 1 || bytes.length > 4096 || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) { return Promise.reject(new Error('invalidCh34xWrite')); }
    const pipe: usbManager.USBDevicePipe = this.pipe;
    const copy: Uint8Array = bytes.slice();
    const operation: Promise<number> = new Promise<number>((resolve, reject): void => {
      const transfer: usbManager.UsbDataTransferParams = { devPipe: pipe,
        flags: usbManager.UsbTransferFlags.USB_TRANSFER_SHORT_NOT_OK,
        endpoint: this.endpoint, type: usbManager.UsbEndpointTransferType.TRANSFER_TYPE_BULK,
        timeout: timeoutMs, length: copy.length, buffer: copy, userData: new Uint8Array(0), isoPacketCount: 0,
        callback: (error: BusinessError, result: usbManager.SubmitTransferCallback): void => {
          this.transfer = null;
          if (error || result === undefined || result.status !== usbManager.UsbTransferStatus.TRANSFER_COMPLETED || !Number.isSafeInteger(result.actualLength) || result.actualLength < 1 || result.actualLength > copy.length) { reject(new Error('ch34xWriteFailedUnknownPrefix')); return; }
          this.writes++;
          if (this.writes === 1 || this.writes % 100 === 0) { console.info('[MFP ch34x] writes=' + this.writes + ' last=' + result.actualLength); }
          resolve(result.actualLength);
        } };
      this.transfer = transfer;
      try { usbManager.usbSubmitTransfer(transfer); } catch { this.transfer = null; reject(new Error('usbSubmitFailed')); }
    });
    this.pending = operation;
    return operation.finally((): void => { this.pending = null; });
  }
  stop(): void { this.stopped = true; if (this.transfer !== null) { try { usbManager.usbCancelTransfer(this.transfer); } catch { /* Cancellation request is not settlement. */ } } }
  async close(): Promise<void> {
    this.stop(); if (this.pending !== null) { try { await this.pending; } catch { /* Wait for actual callback, never assume zero output. */ } }
    const pipe: usbManager.USBDevicePipe | null = this.pipe;
    if (pipe === null) { return; }
    let releaseFailed: boolean = false;
    if (this.iface !== null) { try { releaseFailed = usbManager.releaseInterface(pipe, this.iface) !== 0; } catch { releaseFailed = true; } }
    if (usbManager.closePipe(pipe) !== 0) { throw new Error('usbCloseUnconfirmed'); }
    this.pipe = null; this.iface = null; this.endpoint = 0;
    if (releaseFailed) { throw new Error('usbReleaseUnconfirmed'); }
  }
}

function isCh34xCandidate(device: usbManager.USBDevice): boolean {
  if (!isCh34xUart(device.vendorId, device.productId) || device.configs.length !== 1 || device.configs[0].interfaces.length !== 1) { return false; }
  const iface: usbManager.USBInterface = device.configs[0].interfaces[0];
  if (iface.clazz !== 255 || iface.alternateSetting !== 0 || iface.endpoints.length < 2 || iface.endpoints.length > 3) { return false; }
  const bulk: usbManager.USBEndpoint[] = iface.endpoints.filter(endpoint => endpoint.type === 2 && (endpoint.attributes & 3) === 2 && endpoint.interfaceId === iface.id && endpoint.number === (endpoint.address & 15) && (endpoint.address & 0x70) === 0 && endpoint.number > 0 && endpoint.maxPacketSize > 0 && endpoint.maxPacketSize <= 64);
  return bulk.filter(endpoint => endpoint.direction === 128 && (endpoint.address & 128) !== 0).length === 1 &&
    bulk.filter(endpoint => endpoint.direction === 0 && (endpoint.address & 128) === 0).length === 1;
}
export function listCh34xPorts(): SerialPortOption[] {
  return usbManager.getDevices().filter(isCh34xCandidate)
    .map((device): SerialPortOption => ({ backend: 'ch34xWriteOnly', portName: device.name, portId: -1, label: device.productName.length > 0 ? device.productName : device.name, vendorId: device.vendorId, productId: device.productId, writeOnly: true, controlLines: true }));
}

export function ch34xTransfersAvailable(): boolean { return typeof usbManager.usbSubmitTransfer === 'function' && typeof usbManager.usbCancelTransfer === 'function'; }
