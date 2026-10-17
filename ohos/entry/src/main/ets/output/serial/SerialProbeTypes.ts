/** Safe to display/copy: no device path, product string, or serial number. */
export interface SerialProbeReport {
  status: 'success'; closeConfirmed: true; quarantined: false; diagnosticCode: null;
  readOnly: true; vendorId: number; productId: number; configuration: number;
  interfaceId: number; interfaceClass: number; interfaceSubclass: number; interfaceProtocol: number;
  inputAddress: number; outputAddress: number; inputPacketSize: number; outputPacketSize: number;
  version: number; versionExtra: number; versionSupported: boolean; api18TransfersPresent: boolean;
}

export class SerialProbeError extends Error {
  readonly closeConfirmed: boolean;
  readonly quarantined: boolean;
  readonly diagnosticCode: string;
  constructor(code: string, closeConfirmed: boolean) {
    super(code); this.diagnosticCode = code; this.closeConfirmed = closeConfirmed; this.quarantined = !closeConfirmed;
  }
}
