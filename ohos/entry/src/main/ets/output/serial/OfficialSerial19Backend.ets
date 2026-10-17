import legacySerial from '@ohos.usbManager.serial';
import type { SerialPortOption } from './SerialDiscoveryTypes';
import type { BusinessError } from '@kit.BasicServicesKit';
import type { SerialAttributes, SerialBackend, SerialSink } from './SerialTransport';
/** Selection is obtained by an explicitly invoked picker, never constructor I/O. */
export class OfficialSerial19Backend implements SerialBackend {
  private readonly portId: number; private readonly expectedName: string; private opened: boolean = false; private stopped: boolean = true;
  private uncertainOpen: boolean = false;
  private readPending: Promise<void> | null = null;
  constructor(portId: number, expectedName: string) { this.portId = portId; this.expectedName = expectedName; }
  async open(attributes: SerialAttributes, sink: SerialSink, timeoutMs: number): Promise<void> {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) { throw new Error('invalidSerialTimeout'); }
    if (typeof legacySerial.getPortList !== 'function' || typeof legacySerial.write !== 'function') { throw new Error('serialApi19Unavailable'); }
    if (attributes.dtr !== null || attributes.rts !== null) { throw new Error('api19ControlLinesUnsupported'); }
    const baudRates: number[] = [50,75,110,134,150,200,300,600,1200,1800,2400,4800,9600,19200,38400,57600,115200,230400,460800,500000,576000,921600,1000000,1152000,1500000,2000000,2500000,3000000,3500000,4000000];
    if (!baudRates.includes(attributes.baudRate)) { throw new Error('api19BaudRateUnsupported'); }
    const matches: Readonly<legacySerial.SerialPort>[] = legacySerial.getPortList().filter(port => port.portId === this.portId && port.deviceName === this.expectedName);
    if (matches.length !== 1) { throw new Error('serialSelectionStale'); }
    this.stopped = false;
    if (!legacySerial.hasSerialRight(this.portId) && !await legacySerial.requestSerialRight(this.portId)) { throw new Error('serialPermissionDenied'); }
    if (!sink.live() || this.stopped) { throw new Error('cancelled'); }
    this.uncertainOpen = true;
    try { legacySerial.open(this.portId); }
    catch (error) {
      const code: number = (error as BusinessError).code;
      if ([401, 31400002, 31400003, 31400004].includes(code)) { this.uncertainOpen = false; }
      throw new Error('serialOpenFailed');
    }
    this.opened = true; this.uncertainOpen = false;
    legacySerial.setAttribute(this.portId, { baudRate: attributes.baudRate as legacySerial.BaudRates,
      dataBits: legacySerial.DataBits.DATABIT_8, parity: legacySerial.Parity.PARITY_NONE, stopBits: legacySerial.StopBits.STOPBIT_1 });
    this.readPending = this.readLoop(sink, timeoutMs);
  }
  private async readLoop(sink: SerialSink, timeoutMs: number): Promise<void> {
    while (!this.stopped && sink.live()) {
      const buffer: Uint8Array = new Uint8Array(4096);
      try {
        const count: number = await legacySerial.read(this.portId, buffer, timeoutMs);
        if (!Number.isSafeInteger(count) || count < 0 || count > buffer.length) { throw new Error('invalidReadCount'); }
        if (!this.stopped && sink.live() && count > 0) { sink.received(buffer.slice(0, count)); }
      } catch (error) {
        if ((error as BusinessError).code !== 31400006) { if (!this.stopped) { sink.fault('serialReadFailed'); } return; }
      }
      // Yield even if native returns an empty buffer immediately.
      if (!this.stopped) { await new Promise<void>(resolve => { setTimeout(resolve, 1); }); }
    }
  }
  write(bytes: Uint8Array, timeoutMs: number): Promise<number> { if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) { return Promise.reject(new Error('invalidSerialTimeout')); } if (this.stopped || !this.opened) { return Promise.reject(new Error('closed')); } return legacySerial.write(this.portId, bytes, timeoutMs); }
  stop(): void { this.stopped = true; }
  async close(): Promise<void> {
    this.stop();
    if (this.uncertainOpen) { throw new Error('serialOpenOwnershipUnconfirmed'); }
    if (this.readPending !== null) { await this.readPending; this.readPending = null; }
    if (this.opened) { legacySerial.close(this.portId); this.opened = false; }
  }
}

export function listOfficial19Ports(): SerialPortOption[] {
  if (typeof legacySerial.getPortList !== 'function') { throw new Error('serialApi19Unavailable'); }
  return legacySerial.getPortList().map((port): SerialPortOption => ({ backend: 'official19', portName: port.deviceName, portId: port.portId, label: port.deviceName, vendorId: null, productId: null, writeOnly: false, controlLines: false }));
}
