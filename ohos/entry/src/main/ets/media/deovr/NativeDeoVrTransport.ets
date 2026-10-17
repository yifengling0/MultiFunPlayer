import { socket, connection } from '@kit.NetworkKit';
import { systemDateTime } from '@kit.BasicServicesKit';
import type { BusinessError } from '@kit.BasicServicesKit';
import { DeoVrError, validateDeoVrEndpoint } from './DeoVrTypes';
import type { DeoVrClock, DeoVrEndpoint, DeoVrTransport, DeoVrTransportFactory, DeoVrTransportSink } from './DeoVrTypes';

/** Official SDK26 TCP/DNS only. Received bytes belong to the DeoVR stream
 * decoder; this adapter has no TCode/output admission or filesystem capability.
 * https://github.com/openharmony/docs/blob/master/en/application-dev/reference/apis-network-kit/js-apis-socket.md
 */
export interface NativeDeoVrEnvironment extends DeoVrClock {
  supports(capability: string): boolean;
  resolveHost(host: string): Promise<connection.NetAddress[]>;
  createTcp(): socket.TCPSocket;
}
export class NativeDeoVrPlatformEnvironment implements NativeDeoVrEnvironment {
  nowMs(): number { return systemDateTime.getUptime(systemDateTime.TimeType.STARTUP, false); }
  scheduleAt(at: number, callback: () => void): number { return setTimeout(callback, Math.max(0, at - this.nowMs())); }
  cancel(handle: number): void { clearTimeout(handle); }
  supports(capability: string): boolean { return canIUse(capability); }
  async resolveHost(host: string): Promise<connection.NetAddress[]> {
    try { return await connection.getAddressesByName(host); }
    catch (error) { throw nativeDeoVrFailure('nativeResolveFailed', error as BusinessError); }
  }
  createTcp(): socket.TCPSocket { return socket.constructTCPSocketInstance(); }
}
export interface NativeDeoVrLimits {
  connectTimeoutMs: number;
  closeTimeoutMs: number;
  maximumSendBytes: number;
  maximumReceiveBytes: number;
}
export function defaultNativeDeoVrLimits(): NativeDeoVrLimits {
  return { connectTimeoutMs: 5000, closeTimeoutMs: 1500,
    maximumSendBytes: 1048580, maximumReceiveBytes: 1048580 };
}
export interface NativeDeoVrTransportStatus {
  generation: number;
  state: 'idle' | 'connecting' | 'connected' | 'closing' | 'closed' | 'fault';
  diagnostic: string | null;
  closeConfirmed: boolean;
  quarantined: boolean;
  remoteAcknowledgement: false;
}
export interface NativeDeoVrCapability {
  available: boolean;
  diagnostic: string;
  requiredPermission: string;
  automaticConnection: false;
}
function nativeDeoVrFailure(operation: string, error: BusinessError): DeoVrError {
  if (error instanceof DeoVrError) { return error; }
  const code: number = error === undefined || error === null ? 0 : error.code;
  // Never forward native messages: they can contain endpoint/credential data.
  return new DeoVrError(operation + (Number.isSafeInteger(code) ? ':' + code.toString() : ''));
}
function copyNativeDeoVrLimits(limits: NativeDeoVrLimits): NativeDeoVrLimits {
  const values: number[] = [limits.connectTimeoutMs, limits.closeTimeoutMs, limits.maximumSendBytes, limits.maximumReceiveBytes];
  if (values.some(value => !Number.isSafeInteger(value) || value <= 0 || value > 2147483647)) {
    throw new DeoVrError('nativeInvalidLimits');
  }
  return { connectTimeoutMs: limits.connectTimeoutMs, closeTimeoutMs: limits.closeTimeoutMs,
    maximumSendBytes: limits.maximumSendBytes, maximumReceiveBytes: limits.maximumReceiveBytes };
}

/** Keep this factory for the source lifetime. Creating another adapter cannot
 * clear failed/timed-out closure. Only process teardown clears quarantine.
 * Inspection, construction and create() are inert: only connect() performs I/O.
 */
export class NativeDeoVrTransportFactory implements DeoVrTransportFactory {
  private readonly environment: NativeDeoVrEnvironment;
  private readonly limits: NativeDeoVrLimits;
  private current: NativeDeoVrTransport | null = null;
  private highestGeneration: number = -1;
  private quarantined: boolean = false;
  constructor(environment: NativeDeoVrEnvironment = new NativeDeoVrPlatformEnvironment(),
    limits: NativeDeoVrLimits = defaultNativeDeoVrLimits()) {
    this.environment = environment; this.limits = copyNativeDeoVrLimits(limits);
  }
  inspect(): NativeDeoVrCapability {
    let available: boolean = false;
    let diagnostic: string = 'nativeCapabilityCheckFailed';
    try {
      available = this.environment.supports('SystemCapability.Communication.NetStack') &&
        this.environment.supports('SystemCapability.Communication.NetManager.Core');
      diagnostic = available ? 'availableDisconnected' : 'nativeUnsupportedSystemCapability';
    } catch { /* No endpoint or native exception details in diagnostics. */ }
    if (this.quarantined) { available = false; diagnostic = 'nativePriorCloseUnconfirmed'; }
    return { available: available, diagnostic: diagnostic, requiredPermission: 'ohos.permission.INTERNET', automaticConnection: false };
  }
  create(endpoint: DeoVrEndpoint, generation: number, sink: DeoVrTransportSink): NativeDeoVrTransport {
    const copy: DeoVrEndpoint = validateDeoVrEndpoint(endpoint);
    if (!Number.isSafeInteger(generation) || generation < 0 || generation <= this.highestGeneration) {
      throw new DeoVrError('nativeInvalidGeneration');
    }
    if (this.quarantined || (this.current !== null && !this.current.canRelease())) {
      throw new DeoVrError('nativePriorCloseUnconfirmed');
    }
    const transport: NativeDeoVrTransport = new NativeDeoVrTransport(copy, generation, sink, this.environment, this.limits,
      (owner: NativeDeoVrTransport): void => {
        this.quarantined = true;
        // An unexpected captured late-connect event cannot leave a newer socket
        // looking healthy while old handle ownership has become unknown.
        if (this.current !== null && this.current !== owner) { this.current.priorGenerationUnknown(); }
      });
    this.highestGeneration = generation; this.current = transport;
    return transport;
  }
}

/** One immutable generation, one native handle, no retry/reopen. Core deadlines
 * can detach immediately; pending native connect ownership remains here until
 * asynchronous close (including a second close after a late open) is proved.
 */
export class NativeDeoVrTransport implements DeoVrTransport {
  private readonly endpoint: DeoVrEndpoint;
  private readonly generation: number;
  private readonly sink: DeoVrTransportSink;
  private readonly environment: NativeDeoVrEnvironment;
  private readonly limits: NativeDeoVrLimits;
  private readonly onQuarantine: (owner: NativeDeoVrTransport) => void;
  private nativeSocket: socket.TCPSocket | null = null;
  private active: boolean = true;
  private ready: boolean = false;
  private started: boolean = false;
  private writing: boolean = false;
  private state: 'idle' | 'connecting' | 'connected' | 'closing' | 'closed' | 'fault' = 'idle';
  private diagnostic: string | null = null;
  private closeConfirmed: boolean = false;
  private quarantined: boolean = false;
  private closePromise: Promise<void> | null = null;
  private nativeOpenStarted: boolean = false;
  private openInFlight: boolean = false;
  private openSettled: Promise<void> | null = null;
  private finishOpening: (() => void) | null = null;
  private needsLateClose: boolean = false;
  private lateCleanupStarted: boolean = false;
  private cancelOperations: Array<(error: DeoVrError) => void> = [];
  private readonly onMessage: (message: socket.SocketMessageInfo) => void;
  private readonly onError: (error: BusinessError) => void;
  private readonly onClose: () => void;
  private readonly onConnect: () => void;
  constructor(endpoint: DeoVrEndpoint, generation: number, sink: DeoVrTransportSink,
    environment: NativeDeoVrEnvironment, limits: NativeDeoVrLimits,
    onQuarantine: (owner: NativeDeoVrTransport) => void) {
    this.endpoint = validateDeoVrEndpoint(endpoint); this.generation = generation; this.sink = sink;
    this.environment = environment; this.limits = copyNativeDeoVrLimits(limits); this.onQuarantine = onQuarantine;
    this.onMessage = (message: socket.SocketMessageInfo): void => this.receive(message);
    this.onError = (error: BusinessError): void => this.fail(nativeDeoVrFailure('nativeSocketError', error));
    this.onClose = (): void => {
      if (!this.active) { return; }
      this.invalidate(new DeoVrError('nativePeerClosed')); void this.close().catch((): void => {});
      try { this.sink.closed(); } catch { /* Observer cannot prevent cleanup. */ }
    };
    this.onConnect = (): void => { if (!this.active) { this.lateOpen(); } };
  }
  status(): NativeDeoVrTransportStatus {
    return { generation: this.generation, state: this.state, diagnostic: this.diagnostic,
      closeConfirmed: this.closeConfirmed, quarantined: this.quarantined, remoteAcknowledgement: false };
  }
  canRelease(): boolean { return this.closeConfirmed && !this.quarantined; }
  priorGenerationUnknown(): void { this.fail(new DeoVrError('nativePriorCloseUnconfirmed')); }
  connect(): Promise<void> {
    if (this.started || !this.active) { return Promise.reject(new DeoVrError('nativeConnectAlreadyUsed')); }
    this.started = true; this.state = 'connecting';
    return this.ownedOperation((): Promise<void> => this.openNative());
  }
  private async openNative(): Promise<void> {
    if (!this.environment.supports('SystemCapability.Communication.NetStack') ||
      !this.environment.supports('SystemCapability.Communication.NetManager.Core')) {
      throw new DeoVrError('nativeUnsupportedSystemCapability');
    }
    const nativeSocket: socket.TCPSocket = this.environment.createTcp(); this.nativeSocket = nativeSocket;
    nativeSocket.on('message', this.onMessage); nativeSocket.on('error', this.onError);
    nativeSocket.on('close', this.onClose); nativeSocket.on('connect', this.onConnect);
    const addresses: connection.NetAddress[] = await this.environment.resolveHost(this.endpoint.host);
    if (!this.active) { throw new DeoVrError('nativeCancelled'); }
    const address: connection.NetAddress | undefined = addresses.find(value =>
      (value.family === undefined ? 1 : value.family) === this.endpoint.family);
    if (address === undefined) { throw new DeoVrError('nativeAddressFamilyUnavailable'); }
    const remote: socket.NetAddress = { address: address.address, family: this.endpoint.family, port: this.endpoint.port };
    this.nativeOpenStarted = true; this.openInFlight = true;
    this.openSettled = new Promise<void>((resolve): void => { this.finishOpening = resolve; });
    try {
      await nativeSocket.connect({ address: remote, timeout: this.limits.connectTimeoutMs });
      if (!this.active) { this.lateOpen(); }
    } finally {
      this.openInFlight = false;
      if (this.finishOpening !== null) { this.finishOpening(); this.finishOpening = null; }
    }
    if (!this.active) { throw new DeoVrError('nativeCancelled'); }
    await nativeSocket.setExtraOptions({ TCPNoDelay: true });
    if (!this.active) { throw new DeoVrError('nativeCancelled'); }
    this.ready = true; this.state = 'connected';
  }
  async send(bytes: Uint8Array): Promise<void> {
    const nativeSocket: socket.TCPSocket | null = this.nativeSocket;
    if (!this.active || !this.ready || nativeSocket === null) { throw new DeoVrError('nativeNotConnected'); }
    if (this.writing) { throw new DeoVrError('nativeConcurrentSend'); }
    if (bytes.byteLength < 1 || bytes.byteLength > this.limits.maximumSendBytes) { throw new DeoVrError('nativeInvalidSendSize'); }
    const copy: Uint8Array = bytes.slice(); this.writing = true;
    try {
      await this.ownedOperation(async (): Promise<void> => {
        const result: void = await nativeSocket.send({ data: copy.buffer as ArrayBuffer });
        // Promise<void> is local acceptance only. Unknown/partial failure is
        // never retried; no fabricated byte count or remote acknowledgement.
        if (result !== undefined) { throw new DeoVrError('nativeUnexpectedSendResult'); }
      });
    } finally { this.writing = false; }
  }
  private ownedOperation(action: () => Promise<void>): Promise<void> {
    return new Promise<void>((resolve, reject): void => {
      let settled: boolean = false;
      const finish = (error: DeoVrError | null): void => {
        if (settled) { return; } settled = true;
        this.cancelOperations = this.cancelOperations.filter(value => value !== cancel);
        if (error === null) { resolve(); } else { reject(error); }
      };
      const cancel = (error: DeoVrError): void => finish(error);
      this.cancelOperations.push(cancel);
      try {
        action().then((): void => finish(this.active ? null : new DeoVrError('nativeCancelled')))
          .catch((error: BusinessError): void => {
            const failure: DeoVrError = nativeDeoVrFailure('nativeOperationFailed', error);
            finish(failure); this.fail(failure);
          });
      } catch (error) {
        const failure: DeoVrError = nativeDeoVrFailure('nativeOperationFailed', error as BusinessError);
        finish(failure); this.fail(failure);
      }
    });
  }
  private receive(message: socket.SocketMessageInfo): void {
    if (!this.active || !this.nativeOpenStarted) { return; }
    if (!(message.message instanceof ArrayBuffer) || message.message.byteLength > this.limits.maximumReceiveBytes) {
      this.fail(new DeoVrError('nativeInvalidReceiveSize')); return;
    }
    if (message.message.byteLength === 0) { return; }
    const bytes: Uint8Array = new Uint8Array(message.message).slice();
    // Deliver during opening too. The core buffers with the actual monotonic
    // receive timestamp; buffering here would falsely freshen an older packet
    // when connect/options eventually completes. It never establishes readiness.
    this.deliver(bytes);
  }
  private deliver(bytes: Uint8Array): void {
    try { this.sink.received(bytes); } catch { this.fail(new DeoVrError('nativeReceiverFailed')); }
  }
  private fail(error: DeoVrError): void {
    if (!this.active) { return; }
    this.diagnostic = error.code; this.invalidate(error); void this.close().catch((): void => {});
    try { this.sink.error(); } catch { /* Observer cannot prevent cleanup. */ }
  }
  private invalidate(error: DeoVrError): void {
    this.active = false; this.ready = false;
    for (const cancel of this.cancelOperations.slice()) { cancel(error); }
    const nativeSocket: socket.TCPSocket | null = this.nativeSocket;
    if (nativeSocket === null) { return; }
    try { nativeSocket.off('message', this.onMessage); } catch { /* Keep closing. */ }
    try { nativeSocket.off('error', this.onError); } catch { /* Keep closing. */ }
    try { nativeSocket.off('close', this.onClose); } catch { /* Keep closing. */ }
    // Keep the private connect listener until pending-open cleanup is confirmed.
  }
  detach(): void { this.invalidate(new DeoVrError('nativeCancelled')); }
  private quarantine(error: DeoVrError): void {
    this.quarantined = true; this.closeConfirmed = false; this.state = 'fault'; this.diagnostic = error.code;
    this.onQuarantine(this);
    // Failure and a late connect may settle in either microtask order.
    if (this.needsLateClose) { this.cleanupLateOpen(); }
  }
  private lateOpen(): void {
    this.needsLateClose = true;
    if (this.closeConfirmed) { this.quarantine(new DeoVrError('nativeLateConnectAfterClose')); }
    if (this.quarantined) { this.cleanupLateOpen(); }
  }
  private cleanupLateOpen(): void {
    if (!this.lateCleanupStarted && this.nativeSocket !== null) {
      this.lateCleanupStarted = true;
      const nativeSocket: socket.TCPSocket = this.nativeSocket;
      // Best effort affects only the original handle, never clears quarantine.
      try { void nativeSocket.close().catch((): void => {}); } catch { /* Permanently quarantined. */ }
    }
  }
  private async finishNativeClose(): Promise<void> {
    const nativeSocket: socket.TCPSocket | null = this.nativeSocket;
    if (nativeSocket === null) { return; }
    const result: void = await nativeSocket.close();
    if (result !== undefined) { throw new DeoVrError('nativeUnexpectedCloseResult'); }
    // A completed DNS query cannot open after invalidation. An already-issued
    // native connect can; wait for its actual settlement, then close again.
    if (this.nativeOpenStarted && this.openInFlight && this.openSettled !== null) { await this.openSettled; }
    if (this.needsLateClose) {
      this.needsLateClose = false;
      const lateResult: void = await nativeSocket.close();
      if (lateResult !== undefined) { throw new DeoVrError('nativeUnexpectedCloseResult'); }
    }
  }
  close(): Promise<void> {
    if (this.quarantined) { return Promise.reject(new DeoVrError('nativeCloseUnconfirmed')); }
    if (this.closePromise !== null) { return this.closePromise; }
    this.invalidate(new DeoVrError('nativeCancelled')); this.state = 'closing';
    this.closePromise = new Promise<void>((resolve, reject): void => {
      let settled: boolean = false;
      let handle: number | null = null;
      let deadline: number = 0;
      let startedAt: number = 0;
      const finish = (error: DeoVrError | null): void => {
        if (settled) { return; } settled = true;
        if (handle !== null) { try { this.environment.cancel(handle); } catch { /* Settled guards stale timers. */ } }
        if (this.nativeSocket !== null) {
          try { this.nativeSocket.off('connect', this.onConnect); } catch { /* Captured callback remains generation-owned. */ }
        }
        if (error === null && !this.quarantined) {
          this.closeConfirmed = true; this.state = this.diagnostic === null ? 'closed' : 'fault'; resolve();
        } else {
          const failure: DeoVrError = error === null ? new DeoVrError('nativeCloseUnconfirmed') : error;
          this.quarantine(failure); reject(failure);
        }
      };
      try {
        const now: number = this.environment.nowMs();
        if (!Number.isFinite(now) || now < 0) { throw new DeoVrError('nativeInvalidMonotonicClock'); }
        startedAt = now; deadline = now + this.limits.closeTimeoutMs;
        if (!Number.isFinite(deadline) || deadline <= now) { throw new DeoVrError('nativeInvalidMonotonicClock'); }
        handle = this.environment.scheduleAt(deadline, (): void => finish(new DeoVrError('nativeCloseTimeout')));
        this.finishNativeClose().then((): void => {
          const now: number = this.environment.nowMs();
          finish(!Number.isFinite(now) || now < startedAt ? new DeoVrError('nativeInvalidMonotonicClock') :
            now >= deadline ? new DeoVrError('nativeCloseTimeout') : null);
        }).catch((error: BusinessError): void => finish(nativeDeoVrFailure('nativeCloseFailed', error)));
      } catch (error) {
        // Clock/scheduler failure must not skip best-effort handle cleanup.
        // It still cannot prove bounded close, so quarantine is permanent.
        try { void this.finishNativeClose().catch((): void => {}); } catch { /* Retain ownership. */ }
        finish(nativeDeoVrFailure('nativeCloseFailed', error as BusinessError));
      }
    });
    void this.closePromise.catch((): void => {});
    return this.closePromise;
  }
}
