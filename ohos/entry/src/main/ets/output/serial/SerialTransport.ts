import type { SerialOwnership } from './SerialOwnershipLease';
import type { OutputTargetConfig } from '../OutputTypes';
import type { TransportPort, TransportEvent, WriteRequest, WriteReceipt, WriteSemantics } from '../TransportPort';
export interface SerialAttributes {
  baudRate: number; dataBits: 8; stopBits: 1; parity: 'none'; handshake: 'none';
  /** null explicitly accepts OS-controlled lines (API19 cannot set DTR/RTS). */
  dtr: boolean | null; rts: boolean | null;
}
export interface SerialLimits { operationTimeoutMs: number; closeTimeoutMs: number; maximumPayloadBytes: number; maximumReceiveBytes: number; }
export interface SerialClock { nowMs(): number; schedule(callback: () => void, delayMs: number): number; cancel(id: number): void; }
export interface SerialSink { live(): boolean; received(bytes: Uint8Array): void; fault(code: string): void; }
/** Implementations MUST use finite native I/O timeout. stop() gates future calls;
 * close() waits issued I/O settlement before releasing handles. A JS watchdog is
 * only quarantine detection, never proof of native cancellation. */
export interface SerialBackend {
  open(attributes: SerialAttributes, sink: SerialSink, timeoutMs: number): Promise<void>;
  write(bytes: Uint8Array, timeoutMs: number): Promise<number>;
  stop(): void;
  close(): Promise<void>;
}
export interface SerialStatus { state: 'disconnected' | 'connecting' | 'ready' | 'fault'; connectionGeneration: number; closeConfirmed: boolean; quarantined: boolean; remoteAcknowledgement: false; diagnostic: string | null; }
export class SerialTransport implements TransportPort {
  readonly simulationOnly: boolean = false; readonly writeSemantics: WriteSemantics = 'stream';
  private readonly backend: SerialBackend; private readonly attributes: SerialAttributes;
  private readonly ownership: SerialOwnership | null;
  private readonly limits: SerialLimits; private readonly clock: SerialClock;
  private generation: number = -1; private active: boolean = false; private owned: boolean = false;
  private quarantined: boolean = false; private state: 'disconnected' | 'connecting' | 'ready' | 'fault' = 'disconnected';
  private diagnostic: string | null = null; private maximumPayload: number = 0;
  private opening: Promise<void> | null = null; private writing: Promise<number> | null = null; private closing: Promise<void> | null = null;
  private listeners: Array<(event: TransportEvent) => void> = [];
  constructor(backend: SerialBackend, attributes: SerialAttributes, limits: SerialLimits, clock: SerialClock, ownership: SerialOwnership | null = null) {
    if ([limits.operationTimeoutMs, limits.closeTimeoutMs, limits.maximumPayloadBytes, limits.maximumReceiveBytes].some(value => !Number.isSafeInteger(value) || value < 1 || value > 300000)) { throw new Error('invalidSerialLimits'); }
    if (!Number.isSafeInteger(attributes.baudRate) || attributes.baudRate < 1 || attributes.baudRate > 4000000 || attributes.dataBits !== 8 || attributes.stopBits !== 1 || attributes.parity !== 'none' || attributes.handshake !== 'none') { throw new Error('unsupportedSerialAttributes'); }
    if ((attributes.dtr !== null && typeof attributes.dtr !== 'boolean') || (attributes.rts !== null && typeof attributes.rts !== 'boolean')) { throw new Error('invalidControlLines'); }
    this.backend = backend; this.clock = clock; this.ownership = ownership;
    this.attributes = { baudRate: attributes.baudRate, dataBits: 8, stopBits: 1, parity: 'none', handshake: 'none', dtr: attributes.dtr, rts: attributes.rts };
    this.limits = { operationTimeoutMs: limits.operationTimeoutMs, closeTimeoutMs: limits.closeTimeoutMs, maximumPayloadBytes: limits.maximumPayloadBytes, maximumReceiveBytes: limits.maximumReceiveBytes };
  }
  status(): SerialStatus { return { state: this.state, connectionGeneration: this.generation, closeConfirmed: !this.owned, quarantined: this.quarantined, remoteAcknowledgement: false, diagnostic: this.diagnostic }; }
  canRelease(): boolean { return !this.owned && !this.quarantined; }
  subscribe(listener: (event: TransportEvent) => void): () => void { this.listeners.push(listener); return (): void => { this.listeners = this.listeners.filter(value => value !== listener); }; }
  private emit(event: TransportEvent): void { for (const listener of this.listeners.slice()) { try { listener(event); } catch { /* Observer isolation. */ } } }
  private now(): number { const value: number = this.clock.nowMs(); if (!Number.isFinite(value) || value < 0) { throw new Error('invalidClock'); } return value; }
  private fault(code: string): void {
    if (!this.active) { return; } this.active = false; this.state = 'fault'; this.diagnostic = code; this.backend.stop();
    this.emit({ kind: 'error', connectionGeneration: this.generation, detail: code });
    void this.close('', this.generation).catch((): void => {});
  }
  private bounded<T>(operation: Promise<T>, timeout: number): Promise<T> {
    return new Promise<T>((resolve, reject): void => {
      let settled: boolean = false;
      const timer: number = this.clock.schedule((): void => {
        if (settled) { return; } settled = true; this.quarantined = true; this.fault('nativeOperationUnsettled'); reject(new Error('nativeOperationUnsettled'));
      }, timeout);
      operation.then((value: T): void => { if (!settled) { settled = true; this.clock.cancel(timer); resolve(value); } }).catch((): void => {
        if (!settled) { settled = true; this.clock.cancel(timer); reject(new Error('serialOperationFailed')); }
      });
    });
  }
  async open(config: OutputTargetConfig, generation: number): Promise<void> {
    if (config.kind !== 'serial' || !Number.isSafeInteger(generation) || generation <= this.generation || generation < 0 || !Number.isSafeInteger(config.protocolProfile.maximumPayloadBytes) || config.protocolProfile.maximumPayloadBytes < 1) { throw new Error('invalidSerialOpen'); }
    if (!this.canRelease()) { throw new Error('closeUnconfirmed'); }
    if (this.ownership !== null) { this.ownership.acquire(); }
    this.generation = generation; this.active = true; this.owned = true; this.closing = null; this.state = 'connecting'; this.diagnostic = null;
    this.maximumPayload = Math.min(config.protocolProfile.maximumPayloadBytes, this.limits.maximumPayloadBytes);
    const sink: SerialSink = { live: (): boolean => this.active && this.generation === generation,
      received: (bytes: Uint8Array): void => {
        if (!this.active || this.generation !== generation) { return; }
        if (bytes.length > this.limits.maximumReceiveBytes) { this.fault('receiveOverflow'); return; }
        if (bytes.length > 0) { this.emit({ kind: 'received', connectionGeneration: generation, bytes: bytes.slice() }); }
      }, fault: (code: string): void => { if (this.generation === generation) { this.fault(code); } } };
    this.opening = Promise.resolve().then((): Promise<void> => {
      if (!sink.live()) { throw new Error('cancelled'); }
      return this.backend.open(this.attributes, sink, this.limits.operationTimeoutMs);
    });
    // Permission dialogs intentionally have no fabricated timeout; cancellation
    // gates the post-permission open. close watchdog quarantines unsettled dialogs.
    try { await this.opening; if (!sink.live()) { throw new Error('cancelled'); } this.state = 'ready'; }
    catch { this.fault('serialOpenFailed'); throw new Error('serialOpenFailed'); }
    finally { this.opening = null; }
  }
  async write(request: WriteRequest): Promise<WriteReceipt> {
    if (!this.active || this.state !== 'ready' || request.connectionGeneration !== this.generation) { throw new Error('notConnected'); }
    if (this.writing !== null) { throw new Error('concurrentWrite'); }
    if (request.bytes.length < 1 || request.bytes.length > this.maximumPayload) { throw new Error('invalidPayloadSize'); }
    const remaining: number = Math.floor(request.deadlineMonotonicMs - this.now());
    if (!Number.isFinite(remaining) || remaining < 1) { throw new Error('writeExpired'); }
    const timeout: number = Math.min(remaining, this.limits.operationTimeoutMs);
    // Return exact partial acceptance. OutputSession owns remaining-byte offset;
    // rejection never guesses a prefix or retries an uncertain physical write.
    const bytes: Uint8Array = request.bytes.slice(0, Math.min(4096, request.bytes.length));
    this.writing = Promise.resolve().then((): Promise<number> => {
      if (!this.active || request.connectionGeneration !== this.generation) { throw new Error('cancelled'); }
      const left: number = Math.floor(request.deadlineMonotonicMs - this.now());
      if (left < 1) { throw new Error('writeExpired'); }
      return this.backend.write(bytes, Math.min(timeout, left));
    });
    try {
      const count: number = await this.bounded(this.writing, timeout + this.limits.closeTimeoutMs);
      if (!this.active || request.connectionGeneration !== this.generation) { throw new Error('cancelled'); }
      if (this.now() > request.deadlineMonotonicMs) { throw new Error('writeExpired'); }
      if (!Number.isSafeInteger(count) || count < 1 || count > bytes.length) { throw new Error('invalidSerialReceipt'); }
      return { acceptedBytes: count, connectionGeneration: this.generation };
    } catch { this.fault('serialWriteFailed'); throw new Error('serialWriteFailed'); }
    finally { this.writing = null; }
  }
  async close(_reason: string, generation: number): Promise<void> {
    if (generation !== this.generation) { if (this.owned) { throw new Error('unknownCloseGeneration'); } return; }
    if (!this.owned) { return; }
    if (this.closing === null) {
      this.active = false; this.backend.stop();
      const opening: Promise<void> | null = this.opening; const writing: Promise<number> | null = this.writing;
      const cleanup = async (): Promise<void> => {
        if (opening !== null) { try { await opening; } catch { /* Still close partially acquired handle. */ } }
        if (writing !== null) { try { await writing; } catch { /* Native operation settled, not necessarily zero bytes. */ } }
        await this.backend.close();
      };
      this.closing = this.bounded(cleanup(), this.limits.closeTimeoutMs).then((): void => {
        if (this.quarantined) { throw new Error('closeUnconfirmed'); } this.owned = false;
        if (this.ownership !== null) { this.ownership.releaseConfirmed(); }
        if (this.state !== 'fault') { this.state = 'disconnected'; }
        this.emit({ kind: 'closed', connectionGeneration: generation });
      }).catch((): void => { this.quarantined = true; this.state = 'fault'; this.diagnostic = 'closeUnconfirmed'; throw new Error('closeUnconfirmed'); });
    }
    await this.closing;
  }
}
