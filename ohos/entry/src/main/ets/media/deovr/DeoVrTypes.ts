/** DeoVR Remote Control v1 TCP. These are observation/transport contracts, never
 * file-system capabilities or proof that a seek/command reached the player. */
export interface DeoVrEndpoint { host: string; port: number; family: 1 | 2; }
export interface DeoVrClock {
  nowMs(): number;
  scheduleAt(at: number, callback: () => void): number;
  cancel(handle: number): void;
}
export interface DeoVrTransportSink {
  received(bytes: Uint8Array): void;
  closed(): void;
  error(): void;
}
export interface DeoVrTransport {
  connect(): Promise<void>;
  send(bytes: Uint8Array): Promise<void>;
  detach(): void;
  /** Resolve only after pending opens and late-open cleanup are closed. */
  close(): Promise<void>;
}
export interface DeoVrTransportFactory {
  create(endpoint: DeoVrEndpoint, generation: number, sink: DeoVrTransportSink): DeoVrTransport;
}
export type DeoVrStatus = 'disconnected' | 'connecting' | 'connected' | 'disconnecting' | 'fault';
export type DeoVrEventKind = 'path' | 'playing' | 'duration' | 'position' | 'speed' | 'reset';
export interface DeoVrEvent {
  kind: DeoVrEventKind;
  generation: number;
  sequence: number;
  resourceRevision: number;
  /** -1 for lifecycle reset; never mistaken for an actual receive. */
  receivedAtMs: number;
  path?: string;
  playing?: boolean;
  /** Seconds for duration/position; scalar for speed. */
  value?: number;
  reason?: string;
}
/** Exact fields in one complete packet, never sticky field-cache evidence.
 * Receive times are local chronology, not server timestamps or command ACKs. */
export interface DeoVrPacketObservation {
  readonly packetSequence: number;
  readonly generation: number;
  readonly resourceRevision: number;
  readonly path: string;
  readonly positionSeconds: number | null;
  readonly playerState: number | null;
  readonly speed: number | null;
  readonly firstIngressId: number;
  readonly lastIngressId: number;
  readonly firstReceivedAtMs: number;
  readonly receivedAtMs: number;
}
/** Captured locally immediately before the real transport.send invocation. */
export interface DeoVrDispatchBoundary {
  readonly commandId: number;
  readonly generation: number;
  readonly resourceRevision: number;
  readonly packetSequenceFloor: number;
  readonly ingressSequenceFloor: number;
  readonly startedAtMs: number;
}
/** Returning false cancels this queued command without faulting its source. */
export type DeoVrDispatchCallback = (boundary: DeoVrDispatchBoundary) => boolean | void;
export interface DeoVrSnapshot {
  status: DeoVrStatus;
  generation: number;
  endpoint: DeoVrEndpoint | null;
  path: string | null;
  playerState: number | null;
  playing: boolean;
  durationSeconds: number | null;
  positionSeconds: number | null;
  speed: number | null;
  resourceRevision: number;
  eventSequence: number;
  /** Valid received currentTime fields, including repeated equal values. */
  receiptSequence: number;
  /** True only if the latest path-bearing packet contains valid currentTime. */
  currentTimeValid: boolean;
  /** Field evidence belongs to the current resource, even if cached value was unchanged. */
  durationValid: boolean;
  playerStateValid: boolean;
  speedValid: boolean;
  observedAtMs: number;
  /** Only a changed currentTime event advances this timestamp. */
  lastChangedAtMs: number;
  /** Complete valid-path packet receive, not heartbeat or parser rejection. */
  lastReceivedAtMs: number;
  /** A detached immutable copy; reading a snapshot never mints a packet. */
  lastObservation: DeoVrPacketObservation | null;
  diagnostic: string | null;
  closeConfirmed: boolean;
  quarantined: boolean;
}
export interface DeoVrSendReceipt {
  generation: number;
  acceptedBytes: number;
  /** Local transport completion is explicitly not a remote acknowledgement. */
  remoteAcknowledgement: false;
}
export interface DeoVrOptions {
  connectTimeoutMs: number;
  sendTimeoutMs: number;
  closeTimeoutMs: number;
  heartbeatIntervalMs: number;
  maximumQueuedCommands: number;
}
export class DeoVrError extends Error {
  readonly code: string;
  constructor(code: string) { super('DeoVR: ' + code); this.name = 'DeoVrError'; this.code = code; }
}
function validIpv4(host: string): boolean {
  const parts: string[] = host.split('.');
  return parts.length === 4 && parts.every(part => /^(0|[1-9][0-9]{0,2})$/.test(part) && Number(part) <= 255);
}
function validIpv6(host: string): boolean {
  let text: string = host;
  if (text.indexOf('.') >= 0) {
    const lastColon: number = text.lastIndexOf(':');
    if (lastColon < 0 || !validIpv4(text.slice(lastColon + 1))) { return false; }
    text = text.slice(0, lastColon + 1) + '0:0';
  }
  if (!/^[A-Fa-f0-9:]+$/.test(text) || text.indexOf(':::') >= 0) { return false; }
  const compression: number = text.indexOf('::');
  if (compression >= 0 && text.indexOf('::', compression + 2) >= 0) { return false; }
  const groups: string[] = text.split(':').filter(group => group.length > 0);
  if (!groups.every(group => /^[A-Fa-f0-9]{1,4}$/.test(group))) { return false; }
  return compression >= 0 ? groups.length < 8 : groups.length === 8 && !text.startsWith(':') && !text.endsWith(':');
}
/** Raw host only; never a URL, credential, local path, zone, query or fragment. */
export function validateDeoVrEndpoint(endpoint: DeoVrEndpoint): DeoVrEndpoint {
  const host: string = endpoint.host;
  if (typeof host !== 'string' || host.length < 1 || host.length > 253) { throw new DeoVrError('invalidHost'); }
  const ipv6: boolean = host.indexOf(':') >= 0;
  const numeric: boolean = /^[0-9.]+$/.test(host);
  const validHost: boolean = ipv6 ? validIpv6(host) : numeric ? validIpv4(host) : host.split('.').every(label =>
    label.length >= 1 && label.length <= 63 && /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label));
  if (!validHost) { throw new DeoVrError('invalidHost'); }
  if (!Number.isInteger(endpoint.port) || endpoint.port < 1 || endpoint.port > 65535) { throw new DeoVrError('invalidPort'); }
  if ((endpoint.family !== 1 && endpoint.family !== 2) || (ipv6 && endpoint.family !== 2) || (numeric && endpoint.family !== 1)) {
    throw new DeoVrError('invalidAddressFamily');
  }
  return { host: host, port: endpoint.port, family: endpoint.family };
}
