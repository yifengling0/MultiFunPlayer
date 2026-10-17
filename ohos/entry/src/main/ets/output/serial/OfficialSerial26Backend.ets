import busSerial from '@ohos.busManager.serial';
import type { SerialPortOption } from './SerialDiscoveryTypes';
import type { BusinessError } from '@kit.BasicServicesKit';
import type { SerialAttributes, SerialBackend, SerialSink } from './SerialTransport';
export class OfficialSerial26Backend implements SerialBackend {
  private readonly portName: string; private port: busSerial.SerialPort | null = null; private stopped: boolean = true;
  private uncertainOpen: boolean = false;
  private onData: ((bytes: Uint8Array) => void) | null = null; private onDisconnect: (() => void) | null = null;
  constructor(portName: string) { this.portName = portName; }
  async open(attributes: SerialAttributes, sink: SerialSink, timeoutMs: number): Promise<void> {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) { throw new Error('invalidSerialTimeout'); }
    if (typeof busSerial.getSerialPortList !== 'function') { throw new Error('serialApi26Unavailable'); }
    this.stopped = false;
    const ports: busSerial.SerialPort[] = await busSerial.getSerialPortList();
    if (this.stopped || !sink.live()) { throw new Error('cancelled'); }
    const matches: busSerial.SerialPort[] = ports.filter(port => port.portInfo.portName === this.portName);
    if (matches.length !== 1) { throw new Error('serialPortUnavailable'); }
    this.port = matches[0];
    this.uncertainOpen = true;
    try { await this.port.open({ baudRate: attributes.baudRate, dataBits: busSerial.DataBits.EIGHT, stopBits: busSerial.StopBits.ONE,
      parity: busSerial.Parity.NONE, rtscts: false, xon: false, xoff: false, xany: false }); }
    catch (error) {
      const code: number = (error as BusinessError).code;
      if ([35700002, 35700003, 35700004, 35700007].includes(code)) { this.port = null; this.uncertainOpen = false; }
      throw new Error('serialOpenFailed');
    }
    this.uncertainOpen = false;
    if (this.stopped || !sink.live()) { throw new Error('cancelled'); }
    if (attributes.dtr !== null) { await this.port.setDtr(attributes.dtr); }
    if (this.stopped || !sink.live()) { throw new Error('cancelled'); }
    if (attributes.rts !== null) { await this.port.setRts(attributes.rts); }
    if (this.stopped || !sink.live()) { throw new Error('cancelled'); }
    this.onData = (bytes: Uint8Array): void => { if (!this.stopped && sink.live()) { sink.received(bytes); } };
    this.onDisconnect = (): void => { if (!this.stopped && sink.live()) { sink.fault('serialDeviceDisconnected'); } };
    this.port.onDataRead(this.onData); this.port.onDisconnect(this.onDisconnect);
  }
  write(bytes: Uint8Array, timeoutMs: number): Promise<number> { if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) { return Promise.reject(new Error('invalidSerialTimeout')); } if (this.stopped || this.port === null) { return Promise.reject(new Error('closed')); } return this.port.write(bytes, timeoutMs); }
  stop(): void { this.stopped = true; }
  async close(): Promise<void> {
    this.stop();
    if (this.uncertainOpen) { throw new Error('serialOpenOwnershipUnconfirmed'); }
    const port: busSerial.SerialPort | null = this.port;
    if (port !== null) {
      if (this.onData !== null) { try { port.offDataRead(this.onData); } catch { /* close must still run. */ } }
      if (this.onDisconnect !== null) { try { port.offDisconnect(this.onDisconnect); } catch { /* close must still run. */ } }
      await port.close(); this.port = null; this.onData = null; this.onDisconnect = null;
    }
  }
}

export async function listOfficial26Ports(): Promise<SerialPortOption[]> {
  if (typeof busSerial.getSerialPortList !== 'function') { throw new Error('serialApi26Unavailable'); }
  const ports: busSerial.SerialPort[] = await busSerial.getSerialPortList();
  return ports.map((port): SerialPortOption => ({ backend: 'official26', portName: port.portInfo.portName, portId: -1, label: port.portInfo.portName, vendorId: port.portInfo.vendorId === undefined ? null : port.portInfo.vendorId, productId: port.portInfo.productId === undefined ? null : port.portInfo.productId, writeOnly: false, controlLines: true }));
}
