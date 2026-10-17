export type SerialBackendKind = 'official26' | 'official19' | 'usbCdc' | 'ch34xWriteOnly';
/** portId is ephemeral and MUST NOT be persisted as current hardware identity.
 * portName is a selection hint, not proof that reattached hardware is identical. */
export interface SerialPortOption {
  backend: SerialBackendKind; portName: string; portId: number; label: string;
  vendorId: number | null; productId: number | null; writeOnly: boolean; controlLines: boolean;
}
export interface SerialSelection { backend: SerialBackendKind; portName: string; portId: number; }
