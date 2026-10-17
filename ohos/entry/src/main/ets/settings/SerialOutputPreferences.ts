/** Saved preferences are hints only. No portId, enumeration identity, grant,
 * native handle, connection, pending operation or Arm state may be serialized. */
export type SavedSerialBackend = 'official26' | 'official19' | 'ch34xWriteOnly' | 'usbCdc';
export class SerialOutputPreferences {
  backend: SavedSerialBackend = 'official26';
  portName: string = '';
  baudRate: number = 115200;
  dataBits: 8 = 8;
  stopBits: 1 = 1;
  parity: 'none' = 'none';
  handshake: 'none' = 'none';
  /** true matches original defaults; null is an explicit OS-control choice. */
  dtr: boolean | null = true;
  rts: boolean | null = true;
  static clone(value: SerialOutputPreferences): SerialOutputPreferences {
    SerialOutputPreferences.check(value);
    const result = new SerialOutputPreferences();
    result.backend = value.backend; result.portName = value.portName; result.baudRate = value.baudRate;
    result.dtr = value.dtr; result.rts = value.rts;
    return result;
  }
  static check(value: SerialOutputPreferences): void {
    const fields: string[] = ['backend', 'portName', 'baudRate', 'dataBits', 'stopBits', 'parity', 'handshake', 'dtr', 'rts'];
    if (value === null || typeof value !== 'object' || Array.isArray(value)) { throw new Error('Invalid serial preferences.'); }
    const keys: string[] = Object.keys(value);
    if (keys.length !== fields.length || keys.some(key => fields.indexOf(key) < 0)) { throw new Error('Unsupported serial preference field.'); }
    if (value.backend !== 'official26' && value.backend !== 'official19' && value.backend !== 'ch34xWriteOnly' && value.backend !== 'usbCdc') { throw new Error('Unsupported serial backend.'); }
    if (typeof value.portName !== 'string' || value.portName.length > 1024 || /[\x00-\x1f\x7f-\x9f]/.test(value.portName)) { throw new Error('Invalid serial port hint.'); }
    if (!Number.isSafeInteger(value.baudRate) || value.baudRate < 1 || value.baudRate > 4000000 ||
      value.dataBits !== 8 || value.stopBits !== 1 || value.parity !== 'none' || value.handshake !== 'none') { throw new Error('Unsupported serial attributes.'); }
    if ((value.dtr !== null && typeof value.dtr !== 'boolean') || (value.rts !== null && typeof value.rts !== 'boolean')) { throw new Error('Invalid serial control lines.'); }
  }
}
