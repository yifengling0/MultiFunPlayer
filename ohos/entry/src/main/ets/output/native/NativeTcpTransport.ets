import { socket, connection, webSocket } from '@kit.NetworkKit';
import { systemDateTime } from '@kit.BasicServicesKit';
import type { BusinessError } from '@kit.BasicServicesKit';
import type { OutputTargetConfig } from '../OutputTypes';
import type { TransportPort, TransportEvent, WriteRequest, WriteReceipt, WriteSemantics } from '../TransportPort';

/** SDK26 contract: send(void) means local acceptance, never delivery/execution ACK.
 * Primary API: https://github.com/openharmony/docs/blob/master/en/application-dev/reference/apis-network-kit/js-apis-socket.md
 * Factory-created adapters have an identity admission record; this is not
 * connection readiness, arm permission, or a device ACK. Run on one
 * owner/worker with the same STARTUP monotonic clock as the admission coordinator.
 */
export type NativeNetworkKind = 'tcp' | 'udp' | 'webSocket';
export interface NativeTransportLimits {
  connectTimeoutMs: number; writeTimeoutMs: number; closeTimeoutMs: number;
  maximumPayloadBytes: number; maximumReceiveBytes: number;
}
export interface NativeSocketEndpoint { host: string; port: number; family: 1 | 2; }
export interface NativeEnvironment {
  nowMs(): number;
  scheduleAt(at: number, callback: () => void): number;
  cancel(handle: number): void;
  supports(capability: string): boolean;
  resolveHost(host: string): Promise<connection.NetAddress[]>;
  createTcp(): socket.TCPSocket;
  createUdp(): socket.UDPSocket;
  createWebSocket(): webSocket.WebSocket;
}
export class NativePlatformEnvironment implements NativeEnvironment {
  nowMs(): number { return systemDateTime.getUptime(systemDateTime.TimeType.STARTUP, false); }
  scheduleAt(at: number, callback: () => void): number { return setTimeout(callback, Math.max(0, at - this.nowMs())); }
  cancel(handle: number): void { clearTimeout(handle); }
  supports(capability: string): boolean { return canIUse(capability); }
  async resolveHost(host: string): Promise<connection.NetAddress[]> {
    try { return await connection.getAddressesByName(host); } catch (error) { throw nativeFailure('resolveFailed', error as BusinessError); }
  }
  createTcp(): socket.TCPSocket { return socket.constructTCPSocketInstance(); }
  createUdp(): socket.UDPSocket { return socket.constructUDPSocketInstance(); }
  createWebSocket(): webSocket.WebSocket { return webSocket.createWebSocket(); }
}
export class NativeTransportError extends Error {
  readonly code: string;
  constructor(code: string) { super('Native output: ' + code); this.name = 'NativeTransportError'; this.code = code; }
}
/** Do not include native messages, URL, query, user-info, payload, or close reason. */
export function nativeFailure(operation: string, error: BusinessError): NativeTransportError {
  const code: number = error === undefined || error === null ? 0 : error.code;
  return new NativeTransportError(operation + (Number.isSafeInteger(code) ? ':' + code.toString() : ''));
}
export function validateNativeHost(host: string): void {
  // Raw host only. Authentication, URL syntax, scope IDs and escaped secrets are unsupported.
  if (typeof host !== 'string' || host.length < 1 || host.length > 253 ||
    (!/^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(host) && !/^[A-Fa-f0-9:]+$/.test(host))) {
    throw new NativeTransportError('invalidHost');
  }
}
export function validateNativePort(port: number, allowZero: boolean = false): void {
  if (!Number.isInteger(port) || port < (allowZero ? 0 : 1) || port > 65535) { throw new NativeTransportError('invalidPort'); }
}
export function copyNativeEndpoint(endpoint: NativeSocketEndpoint): NativeSocketEndpoint {
  validateNativeHost(endpoint.host); validateNativePort(endpoint.port);
  if (endpoint.family !== 1 && endpoint.family !== 2) { throw new NativeTransportError('invalidAddressFamily'); }
  return { host: endpoint.host, port: endpoint.port, family: endpoint.family };
}
export async function resolveNativeAddress(environment: NativeEnvironment, endpoint: NativeSocketEndpoint): Promise<socket.NetAddress> {
  const addresses: connection.NetAddress[] = await environment.resolveHost(endpoint.host);
  const address: connection.NetAddress | undefined = addresses.find(value => (value.family === undefined ? 1 : value.family) === endpoint.family);
  if (address === undefined) { throw new NativeTransportError('addressFamilyUnavailable'); }
  return { address: address.address, family: endpoint.family, port: endpoint.port };
}
export interface NativeChannelSink {
  live: () => boolean;
  opening: () => void;
  lateOpen: () => void;
  received: (bytes: Uint8Array) => void;
  fault: (error: NativeTransportError) => void;
  closed: () => void;
}
export interface NativeChannel {
  connect(): Promise<void>;
  send(bytes: Uint8Array): Promise<void>;
  detach(): void;
  close(): Promise<void>;
}
class NativeGeneration {
  generation: number;
  channel: NativeChannel | null = null;
  active: boolean = true;
  ready: boolean = false;
  writing: boolean = false;
  maximumPayloadBytes: number;
  cancelOperations: Array<(error: NativeTransportError) => void> = [];
  closePromise: Promise<void> | null = null;
  closeConfirmed: boolean = false;
  quarantined: boolean = false;
  nativeOpenStarted: boolean = false;
  openInFlight: boolean = false;
  openSettled: Promise<void> | null = null;
  finishOpening: (() => void) | null = null;
  needsLateClose: boolean = false;
  lateCleanupStarted: boolean = false;
  constructor(generation: number, maximumPayloadBytes: number) {
    this.generation = generation; this.maximumPayloadBytes = maximumPayloadBytes;
  }
}
export interface NativeTransportStatus {
  kind: NativeNetworkKind; state: 'disconnected' | 'connecting' | 'ready' | 'fault';
  connectionGeneration: number; diagnostic: string | null;
  /** UDP ready means locally bound, not that a peer exists. */
  remoteAcknowledgement: false;
  closeConfirmed: boolean; quarantined: boolean;
}
export abstract class NativeTransportBase implements TransportPort {
  readonly simulationOnly: boolean = false;
  readonly nativeNetworkKind: NativeNetworkKind;
  readonly writeSemantics: WriteSemantics;
  protected readonly environment: NativeEnvironment;
  protected readonly limits: NativeTransportLimits;
  private readonly kind: NativeNetworkKind;
  private current: NativeGeneration | null = null;
  private highestGeneration: number = -1;
  private confirmedThroughGeneration: number = -1;
  private entries: Map<number, NativeGeneration> = new Map<number, NativeGeneration>();
  private listeners: Array<(event: TransportEvent) => void> = [];
  private state: 'disconnected' | 'connecting' | 'ready' | 'fault' = 'disconnected';
  private diagnostic: string | null = null;
  protected constructor(kind: NativeNetworkKind, semantics: WriteSemantics, limits: NativeTransportLimits, environment: NativeEnvironment) {
    const values: number[] = [limits.connectTimeoutMs, limits.writeTimeoutMs, limits.closeTimeoutMs, limits.maximumPayloadBytes, limits.maximumReceiveBytes];
    if (values.some(value => !Number.isSafeInteger(value) || value <= 0 || value > 2147483647)) {
      throw new NativeTransportError('invalidLimits');
    }
    this.kind = kind; this.nativeNetworkKind = kind; this.writeSemantics = semantics; this.environment = environment;
    this.limits = { connectTimeoutMs: limits.connectTimeoutMs, writeTimeoutMs: limits.writeTimeoutMs,
      closeTimeoutMs: limits.closeTimeoutMs, maximumPayloadBytes: limits.maximumPayloadBytes, maximumReceiveBytes: limits.maximumReceiveBytes };
  }
  protected abstract createChannel(sink: NativeChannelSink): NativeChannel;
  protected needsResolver(): boolean { return true; }
  status(): NativeTransportStatus {
    return { kind: this.kind, state: this.state, connectionGeneration: this.highestGeneration,
      diagnostic: this.diagnostic, remoteAcknowledgement: false,
      closeConfirmed: this.entries.size === 0,
      quarantined: Array.from(this.entries.values()).some(entry => entry.quarantined) };
  }
  /** Fault policy: failed/timed-out closes retain one bounded lifetime record.
   * Do not unregister or replace it. Only process teardown can clear quarantine;
   * late cleanup is best effort and never silently restores output admission.
   */
  canRelease(): boolean { return this.entries.size === 0; }
  subscribe(listener: (event: TransportEvent) => void): () => void {
    this.listeners.push(listener);
    return (): void => { this.listeners = this.listeners.filter(value => value !== listener); };
  }
  private emit(event: TransportEvent): void {
    for (const listener of this.listeners.slice()) { try { listener(event); } catch { /* Observer cannot prevent cleanup. */ } }
  }
  private live(entry: NativeGeneration): boolean { return entry.active && this.current === entry; }
  private now(): number {
    const value: number = this.environment.nowMs();
    if (!Number.isFinite(value) || value < 0) { throw new NativeTransportError('invalidMonotonicClock'); }
    return value;
  }
  async open(config: OutputTargetConfig, generation: number): Promise<void> {
    if (config.kind !== this.kind || !Number.isSafeInteger(generation) || generation < 0 || generation <= this.highestGeneration ||
      !Number.isSafeInteger(config.protocolProfile.maximumPayloadBytes) || config.protocolProfile.maximumPayloadBytes < 1) {
      throw new NativeTransportError('invalidOpenConfiguration');
    }
    if (!this.environment.supports('SystemCapability.Communication.NetStack') ||
      (this.needsResolver() && !this.environment.supports('SystemCapability.Communication.NetManager.Core'))) {
      this.diagnostic = 'unsupportedSystemCapability'; throw new NativeTransportError(this.diagnostic);
    }
    // Never accumulate new sockets behind unconfirmed closure. Closing is bounded;
    // failure retains the exact old handle and permanently locks this adapter.
    if (this.current !== null && this.current.active) {
      this.state = 'disconnected'; this.retire(this.current, new NativeTransportError('superseded'));
    }
    if (this.current !== null && this.entries.has(this.current.generation) && this.current.closePromise !== null) {
      await this.current.closePromise;
    }
    if (this.entries.size !== 0) { throw new NativeTransportError('priorCloseUnconfirmed'); }
    this.highestGeneration = generation; this.state = 'connecting'; this.diagnostic = null;
    const entry: NativeGeneration = new NativeGeneration(generation, Math.min(config.protocolProfile.maximumPayloadBytes, this.limits.maximumPayloadBytes));
    this.current = entry; this.entries.set(generation, entry);
    const sink: NativeChannelSink = {
      live: (): boolean => this.live(entry),
      opening: (): void => { entry.nativeOpenStarted = true; },
      lateOpen: (): void => this.lateOpen(entry),
      received: (bytes: Uint8Array): void => {
        if (!this.live(entry) || !entry.ready) { return; }
        if (bytes.byteLength > this.limits.maximumReceiveBytes) { this.fail(entry, new NativeTransportError('receiveTooLarge')); return; }
        this.emit({ kind: 'received', connectionGeneration: generation, bytes: bytes.slice() });
      },
      fault: (error: NativeTransportError): void => this.fail(entry, error),
      closed: (): void => {
        if (!this.live(entry)) { return; }
        this.state = 'disconnected'; this.retire(entry, new NativeTransportError('peerClosed'));
        this.emit({ kind: 'closed', connectionGeneration: generation, detail: 'Native peer closed.' });
      }
    };
    try {
      entry.channel = this.createChannel(sink);
      const channel: NativeChannel = entry.channel;
      await this.operation(entry, (): Promise<void> => channel.connect(), this.now() + this.limits.connectTimeoutMs, 'open');
      if (!this.live(entry)) { throw new NativeTransportError('cancelled'); }
      entry.ready = true; this.state = 'ready';
    } catch (error) {
      const failure: NativeTransportError = error instanceof NativeTransportError ? error : nativeFailure('openFailed', error as BusinessError);
      this.fail(entry, failure); throw failure;
    }
  }
  async write(request: WriteRequest): Promise<WriteReceipt> {
    const entry: NativeGeneration | null = this.current;
    if (entry === null || !this.live(entry) || !entry.ready || request.connectionGeneration !== entry.generation || entry.channel === null) {
      throw new NativeTransportError('notConnected');
    }
    if (entry.writing) { throw new NativeTransportError('concurrentWrite'); }
    if (request.bytes.byteLength < 1 || request.bytes.byteLength > entry.maximumPayloadBytes) { throw new NativeTransportError('invalidPayloadSize'); }
    const now: number = this.now();
    if (!Number.isFinite(request.deadlineMonotonicMs) || request.deadlineMonotonicMs <= now) { throw new NativeTransportError('writeExpired'); }
    const bytes: Uint8Array = request.bytes.slice();
    const channel: NativeChannel = entry.channel;
    entry.writing = true;
    try {
      await this.operation(entry, (): Promise<void> => channel.send(bytes), Math.min(request.deadlineMonotonicMs, now + this.limits.writeTimeoutMs), 'write');
      // Full local SDK acceptance, no invented count and no retry after unknown failure.
      return { acceptedBytes: bytes.byteLength, connectionGeneration: entry.generation };
    } finally { entry.writing = false; }
  }
  private operation(entry: NativeGeneration, action: () => Promise<void>, deadline: number, operation: string): Promise<void> {
    return new Promise<void>((resolve, reject): void => {
      let settled: boolean = false;
      let handle: number | null = null;
      const finish = (error: NativeTransportError | null): void => {
        if (settled) { return; }
        settled = true;
        if (handle !== null) { this.environment.cancel(handle); }
        entry.cancelOperations = entry.cancelOperations.filter(value => value !== cancel);
        if (error === null) { resolve(); } else { reject(error); }
      };
      const cancel = (error: NativeTransportError): void => finish(error);
      entry.cancelOperations.push(cancel);
      try {
        handle = this.environment.scheduleAt(deadline, (): void => this.fail(entry, new NativeTransportError(operation + 'Timeout')));
        if (operation === 'open') {
          entry.openInFlight = true;
          entry.openSettled = new Promise<void>((resolve): void => { entry.finishOpening = resolve; });
        }
        action().then((): void => {
          if (operation === 'open') {
            if (!this.live(entry)) { this.lateOpen(entry); }
            this.finishOpen(entry);
          }
          if (!this.live(entry)) { finish(new NativeTransportError('cancelled')); return; }
          if (this.now() >= deadline) { this.fail(entry, new NativeTransportError(operation + 'Timeout')); return; }
          finish(null);
        }).catch((error: BusinessError): void => {
          if (operation === 'open') { this.finishOpen(entry); }
          const failure: NativeTransportError = error instanceof NativeTransportError ? error : nativeFailure(operation + 'Failed', error);
          if (this.live(entry)) { this.fail(entry, failure); } else { finish(failure); }
        });
      } catch (error) {
        if (operation === 'open') { this.finishOpen(entry); }
        this.fail(entry, nativeFailure(operation + 'Failed', error as BusinessError));
      }
    });
  }
  private fail(entry: NativeGeneration, error: NativeTransportError): void {
    if (!this.live(entry)) { return; }
    this.state = 'fault'; this.diagnostic = error.code; this.retire(entry, error);
    this.emit({ kind: 'error', connectionGeneration: entry.generation, detail: error.message });
  }
  private retire(entry: NativeGeneration, error: NativeTransportError): void {
    if (!entry.active) { return; }
    entry.active = false; entry.ready = false;
    for (const cancel of entry.cancelOperations.slice()) { cancel(error); }
    if (entry.channel !== null) { entry.channel.detach(); }
    entry.closePromise = this.closeChannel(entry).then((): void => {
      // A timeout/failure is a permanent quarantine even if native cleanup later
      // completes. Never let a late completion silently unlock a replacement.
      if (!entry.quarantined) {
        entry.closeConfirmed = true; this.entries.delete(entry.generation);
        this.confirmedThroughGeneration = Math.max(this.confirmedThroughGeneration, entry.generation);
      }
    }).catch((error: NativeTransportError): void => {
      entry.quarantined = true;
      if (this.current === entry) { this.state = 'fault'; this.diagnostic = error.code; }
      throw error;
    });
    void entry.closePromise.catch((): void => {});
  }
  private finishOpen(entry: NativeGeneration): void {
    entry.openInFlight = false;
    if (entry.finishOpening !== null) { entry.finishOpening(); entry.finishOpening = null; }
  }
  private lateOpen(entry: NativeGeneration): void {
    entry.needsLateClose = true;
    if (entry.closeConfirmed) {
      // A captured/queued open callback must not erase uncertain ownership or
      // mutate a newer generation. Keep this exact old handle quarantined.
      entry.closeConfirmed = false; entry.quarantined = true;
      if (this.current === entry) { this.state = 'fault'; this.diagnostic = 'lateOpenAfterClose'; }
      this.entries.set(entry.generation, entry);
      entry.closePromise = Promise.reject(new NativeTransportError('lateOpenAfterClose'));
      void entry.closePromise.catch((): void => {});
    }
    if (entry.quarantined && !entry.lateCleanupStarted) {
      entry.lateCleanupStarted = true;
      void this.closeChannel(entry).catch((): void => {});
    }
  }
  private async finishNativeClose(entry: NativeGeneration): Promise<void> {
    const channel: NativeChannel | null = entry.channel;
    if (channel === null) { return; }
    await channel.close();
    // DNS completion is harmless after gate closure because each channel checks
    // live() before issuing its first native open. Already-issued opens are not.
    if (entry.nativeOpenStarted && entry.openInFlight && entry.openSettled !== null) { await entry.openSettled; }
    if (entry.needsLateClose) { entry.needsLateClose = false; await channel.close(); }
  }
  private closeChannel(entry: NativeGeneration): Promise<void> {
    const channel: NativeChannel | null = entry.channel;
    if (channel === null) { return Promise.resolve(); }
    return new Promise<void>((resolve, reject): void => {
      let settled: boolean = false;
      let handle: number | null = null;
      const finish = (error: NativeTransportError | null): void => {
        if (settled) { return; } settled = true;
        if (handle !== null) { this.environment.cancel(handle); }
        if (error === null) { resolve(); } else { reject(error); }
      };
      try {
        handle = this.environment.scheduleAt(this.now() + this.limits.closeTimeoutMs, (): void => finish(new NativeTransportError('closeTimeout')));
        this.finishNativeClose(entry).then((): void => finish(null)).catch((error: BusinessError): void => finish(nativeFailure('closeFailed', error)));
      } catch (error) { finish(nativeFailure('closeFailed', error as BusinessError)); }
    });
  }
  async close(_reason: string, generation: number): Promise<void> {
    const entry: NativeGeneration | undefined = this.entries.get(generation);
    if (entry === undefined) {
      if (Number.isSafeInteger(generation) && generation >= 0 && generation <= this.confirmedThroughGeneration) { return; }
      if (this.entries.size !== 0) { throw new NativeTransportError('unknownCloseGeneration'); }
      return;
    }
    if (this.current === entry && !entry.quarantined) { this.state = 'disconnected'; }
    this.retire(entry, new NativeTransportError('cancelled'));
    if (entry.closePromise !== null) { await entry.closePromise; }
    if (this.entries.size !== 0) { throw new NativeTransportError('closeUnconfirmed'); }
  }
}
class NativeTcpChannel implements NativeChannel {
  private readonly nativeSocket: socket.TCPSocket;
  private readonly environment: NativeEnvironment;
  private readonly endpoint: NativeSocketEndpoint;
  private readonly sink: NativeChannelSink;
  private readonly timeoutMs: number;
  private readonly onMessage: (message: socket.SocketMessageInfo) => void;
  private readonly onError: (error: BusinessError) => void;
  private readonly onClose: () => void;
  constructor(environment: NativeEnvironment, endpoint: NativeSocketEndpoint, sink: NativeChannelSink, timeoutMs: number) {
    this.environment = environment; this.endpoint = endpoint; this.sink = sink; this.timeoutMs = timeoutMs;
    this.nativeSocket = environment.createTcp();
    this.onMessage = (message: socket.SocketMessageInfo): void => sink.received(new Uint8Array(message.message));
    this.onError = (error: BusinessError): void => sink.fault(nativeFailure('socketError', error));
    this.onClose = (): void => sink.closed();
  }
  async connect(): Promise<void> {
    this.nativeSocket.on('message', this.onMessage); this.nativeSocket.on('error', this.onError); this.nativeSocket.on('close', this.onClose);
    if (!this.sink.live()) { throw new NativeTransportError('cancelled'); }
    const address: socket.NetAddress = await resolveNativeAddress(this.environment, this.endpoint);
    if (!this.sink.live()) { throw new NativeTransportError('cancelled'); }
    this.sink.opening();
    await this.nativeSocket.connect({ address: address, timeout: this.timeoutMs });
    if (!this.sink.live()) { return; }
    await this.nativeSocket.setExtraOptions({ TCPNoDelay: true });
  }
  async send(bytes: Uint8Array): Promise<void> {
    // API returns void, not a byte count. Rejection can mean partial TCP output;
    // never guess an offset or retransmit a whole motion command.
    const result: void = await this.nativeSocket.send({ data: bytes.buffer as ArrayBuffer });
    if (result !== undefined) { throw new NativeTransportError('unexpectedSendResult'); }
  }
  detach(): void {
    try { this.nativeSocket.off('message', this.onMessage); } catch { /* Continue cleanup. */ }
    try { this.nativeSocket.off('error', this.onError); } catch { /* Continue cleanup. */ }
    try { this.nativeSocket.off('close', this.onClose); } catch { /* Continue cleanup. */ }
  }
  close(): Promise<void> { return this.nativeSocket.close(); }
}
export class NativeTcpTransport extends NativeTransportBase {
  private readonly endpoint: NativeSocketEndpoint;
  constructor(endpoint: NativeSocketEndpoint, limits: NativeTransportLimits, environment: NativeEnvironment = new NativePlatformEnvironment()) {
    super('tcp', 'stream', limits, environment); this.endpoint = copyNativeEndpoint(endpoint);
  }
  protected createChannel(sink: NativeChannelSink): NativeChannel {
    return new NativeTcpChannel(this.environment, this.endpoint, sink, this.limits.connectTimeoutMs);
  }
}
