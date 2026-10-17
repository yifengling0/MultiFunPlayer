import type { OutputTargetConfig } from './OutputTypes';

export type WriteSemantics = 'stream' | 'message';
export interface WriteRequest {
  readonly bytes: Uint8Array;
  readonly epoch: number;
  readonly connectionGeneration: number;
  readonly profileRevision: number;
  readonly deadlineMonotonicMs: number;
}
/** Local acceptance only. This is NEVER proof of motion or remote delivery. */
export interface WriteReceipt { readonly acceptedBytes: number; readonly connectionGeneration: number; }
export type TransportEventKind = 'error' | 'closed' | 'received';
export interface TransportEvent {
  readonly kind: TransportEventKind; readonly connectionGeneration: number;
  readonly bytes?: Uint8Array; readonly detail?: string;
}
export interface TransportPort {
  readonly simulationOnly: boolean;
  readonly writeSemantics: WriteSemantics;
  open(config: OutputTargetConfig, generation: number): Promise<void>;
  write(request: WriteRequest): Promise<WriteReceipt>;
  close(reason: string, generation: number): Promise<void>;
  subscribe(listener: (event: TransportEvent) => void): () => void;
}
/** TCP/UDP/WebSocket implementations exist. This is NOT runtime registration,
 * device availability or execution ACK. Native factory identity, capability,
 * INTERNET permission, app source/UI wiring, explicit connect and arm are still required. */
export const NATIVE_NETWORK_ADAPTER_IMPLEMENTATIONS_AVAILABLE: boolean = true;
