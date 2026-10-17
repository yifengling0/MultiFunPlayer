import type { TransportPort, TransportEvent } from '../TransportPort';
import type { OutputTargetConfig } from '../OutputTypes';
import type { MonotonicClock, EventScheduler } from '../UpdateContext';

export type SocketDiagnosticKind = 'tcp' | 'udp';
export type SocketDiagnosticPhase = 'idle' | 'connecting' | 'awaitingEcho' | 'closing' | 'succeeded' | 'failed' | 'cancelled' | 'rejected';
export type SocketDiagnosticEvidenceLayer = 'nativeSDK' | 'nodeBridge';
export interface SocketDiagnosticRequest {
  readonly kind: SocketDiagnosticKind;
  readonly host: string;
  readonly port: number;
  /** User confirmed this endpoint is the dedicated diagnostic receiver. */
  readonly dedicatedReceiverConfirmed: boolean;
}
export interface SocketDiagnosticSnapshot {
  readonly requestId: number;
  readonly connectionGeneration: number;
  readonly kind: SocketDiagnosticKind | null;
  readonly phase: SocketDiagnosticPhase;
  readonly busy: boolean;
  readonly closeConfirmed: boolean;
  readonly quarantined: boolean;
  readonly bytesSent: number;
  readonly bytesReceived: number;
  readonly latencyMs: number | null;
  readonly diagnostic: string;
  readonly proof: 'none' | 'exactEcho';
  readonly evidenceLayer: SocketDiagnosticEvidenceLayer;
  readonly deviceExecutionAck: false;
}
export interface SocketDiagnosticFactory {
  create(request: SocketDiagnosticRequest): TransportPort;
  canRelease(port: TransportPort): boolean;
  release(port: TransportPort): void;
}
export interface SocketDiagnosticNonceSource { nextNonce(): string; }
export interface SocketDiagnosticLimits { timeoutMs: number; closeTimeoutMs: number; }
class DiagnosticRun {
  readonly requestId: number;
  readonly generation: number;
  readonly kind: SocketDiagnosticKind;
  readonly expected: Uint8Array;
  readonly deadline: number;
  readonly completion: Promise<SocketDiagnosticSnapshot>;
  resolve: ((snapshot: SocketDiagnosticSnapshot) => void) | null = null;
  port: TransportPort | null = null;
  unsubscribe: (() => void) | null = null;
  timer: number | null = null;
  active: boolean = true;
  writeIssued: boolean = false;
  writeConfirmed: boolean = false;
  echoMatched: boolean = false;
  sentAt: number = 0;
  received: number = 0;
  finalPhase: 'succeeded' | 'failed' | 'cancelled' = 'failed';
  finalDiagnostic: string = 'transportFailure';
  constructor(requestId: number, generation: number, kind: SocketDiagnosticKind, expected: Uint8Array, deadline: number) {
    this.requestId = requestId; this.generation = generation; this.kind = kind; this.expected = expected; this.deadline = deadline;
    this.completion = new Promise<SocketDiagnosticSnapshot>((resolve): void => { this.resolve = resolve; });
  }
}
/** One owner and one explicit request at a time. Never Arms, consumes motion
 * frames, restores endpoints, or reconnects on foreground. Nonces and received
 * payloads are private and never included in snapshots/logs. A full exact echo
 * proves only this request's receiver round trip, not device execution.
 *
 * The application owner must interlock ALL normal-output connect/arm paths until
 * busy=false AND closeConfirmed=true AND quarantined=false. The same owner must
 * retain this object across page remounts, including a quarantined failure.
 */
export class SocketDiagnostic {
  private readonly factory: SocketDiagnosticFactory;
  private readonly clock: MonotonicClock;
  private readonly timers: EventScheduler;
  private readonly nonces: SocketDiagnosticNonceSource;
  private readonly evidence: SocketDiagnosticEvidenceLayer;
  private readonly limits: SocketDiagnosticLimits;
  private foreground: boolean = true;
  private disposed: boolean = false;
  private requestSequence: number = 0;
  private generationSequence: number = 0;
  private lastNonce: string = '';
  private current: DiagnosticRun | null = null;
  private state: SocketDiagnosticSnapshot;
  constructor(factory: SocketDiagnosticFactory, clock: MonotonicClock, timers: EventScheduler,
    nonces: SocketDiagnosticNonceSource, evidence: SocketDiagnosticEvidenceLayer,
    limits: SocketDiagnosticLimits = { timeoutMs: 3000, closeTimeoutMs: 1500 }) {
    if (!Number.isSafeInteger(limits.timeoutMs) || limits.timeoutMs < 10 || limits.timeoutMs > 10000 ||
      !Number.isSafeInteger(limits.closeTimeoutMs) || limits.closeTimeoutMs < 10 || limits.closeTimeoutMs > 3000) {
      throw new Error('Invalid diagnostic timeout limits.');
    }
    this.factory = factory; this.clock = clock; this.timers = timers; this.nonces = nonces; this.evidence = evidence;
    this.limits = { timeoutMs: limits.timeoutMs, closeTimeoutMs: limits.closeTimeoutMs };
    this.state = { requestId: 0, connectionGeneration: 0, kind: null, phase: 'idle', busy: false,
      closeConfirmed: true, quarantined: false, bytesSent: 0, bytesReceived: 0, latencyMs: null,
      diagnostic: 'idle', proof: 'none', evidenceLayer: evidence, deviceExecutionAck: false };
  }
  snapshot(): SocketDiagnosticSnapshot { return { ...this.state }; }
  private rejected(reason: string): Promise<SocketDiagnosticSnapshot> {
    return Promise.resolve({ ...this.state, phase: 'rejected', diagnostic: reason, proof: 'none', bytesSent: 0, bytesReceived: 0, latencyMs: null });
  }
  run(request: SocketDiagnosticRequest): Promise<SocketDiagnosticSnapshot> {
    if (this.disposed) { return this.rejected('disposed'); }
    if (!this.foreground) { return this.rejected('background'); }
    if (this.state.busy) { return this.rejected('busy'); }
    if (!this.state.closeConfirmed || this.state.quarantined) { return this.rejected('closeUnconfirmed'); }
    if (request.dedicatedReceiverConfirmed !== true) { return this.rejected('dedicatedReceiverConfirmationRequired'); }
    if ((request.kind !== 'tcp' && request.kind !== 'udp') || typeof request.host !== 'string' ||
      request.host.length < 1 || request.host.length > 253 ||
      (!/^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(request.host) && !/^[A-Fa-f0-9:]+$/.test(request.host)) ||
      !Number.isInteger(request.port) || request.port < 1 || request.port > 65535) { return this.rejected('invalidEndpoint'); }
    const now: number = this.clock.nowMs();
    if (!Number.isFinite(now) || now < 0) { return this.rejected('invalidClock'); }
    let nonce: string;
    try { nonce = this.nonces.nextNonce(); } catch { return this.rejected('nonceUnavailable'); }
    if (!/^[a-f0-9]{32}$/.test(nonce) || nonce === this.lastNonce) { return this.rejected('nonceUnavailable'); }
    if (!Number.isSafeInteger(this.requestSequence + 1) || !Number.isSafeInteger(this.generationSequence + 1)) { return this.rejected('identityExhausted'); }
    this.lastNonce = nonce;
    const requestId: number = ++this.requestSequence;
    const generation: number = ++this.generationSequence;
    const line: string = 'MFP_DIAG/1 ' + requestId.toString() + ' ' + generation.toString() + ' ' + nonce + '\n';
    const bytes: Uint8Array = new Uint8Array(line.length);
    for (let index: number = 0; index < line.length; index++) { bytes[index] = line.charCodeAt(index); }
    const run: DiagnosticRun = new DiagnosticRun(requestId, generation, request.kind, bytes, now + this.limits.timeoutMs);
    this.current = run;
    this.state = { requestId: requestId, connectionGeneration: generation, kind: request.kind, phase: 'connecting', busy: true,
      closeConfirmed: false, quarantined: false, bytesSent: 0, bytesReceived: 0, latencyMs: null,
      diagnostic: 'connecting', proof: 'none', evidenceLayer: this.evidence, deviceExecutionAck: false };
    // Copy before any asynchronous operation; endpoint edits cannot retarget it.
    const captured: SocketDiagnosticRequest = { kind: request.kind, host: request.host, port: request.port, dedicatedReceiverConfirmed: true };
    try {
      run.timer = this.timers.scheduleAt(run.deadline, (): void => { void this.finish(run, 'failed', 'timeout'); });
      run.port = this.factory.create(captured);
      run.unsubscribe = run.port.subscribe(event => this.onEvent(run, event));
      void this.execute(run);
    } catch { void this.finish(run, 'failed', 'transportUnavailable'); }
    return run.completion;
  }
  private live(run: DiagnosticRun): boolean { return this.current === run && run.active && !this.disposed && this.foreground; }
  private inTime(run: DiagnosticRun): boolean {
    const now: number = this.clock.nowMs(); return Number.isFinite(now) && now >= 0 && now < run.deadline;
  }
  private async execute(run: DiagnosticRun): Promise<void> {
    const port: TransportPort | null = run.port;
    if (port === null) { return; }
    // This minimal config is used only to open the production transport. No
    // OutputSession, encoder, axis values, playback source, or Arm participates.
    const config: OutputTargetConfig = { targetId: 'dedicated-socket-diagnostic', kind: run.kind,
      protocolProfile: { precision: 4, revision: 0, axisOrder: [], maximumDurationMs: 0, maximumPayloadBytes: 128 },
      axisRanges: [], updateContext: { kind: 'polled' }, autoConnectPolicy: 'manual', allowPausedAutoHome: false, allowPausedMotion: false };
    try {
      await port.open(config, run.generation);
      if (!this.live(run)) { return; }
      if (!this.inTime(run)) { void this.finish(run, 'failed', 'timeout'); return; }
      run.writeIssued = true; run.sentAt = this.clock.nowMs();
      this.state = { ...this.state, phase: 'awaitingEcho', diagnostic: 'awaitingExactEcho' };
      const receipt = await port.write({ bytes: run.expected.slice(), epoch: 0, profileRevision: 0,
        connectionGeneration: run.generation, deadlineMonotonicMs: run.deadline });
      if (!this.live(run)) { return; }
      if (!this.inTime(run)) { void this.finish(run, 'failed', 'timeout'); return; }
      if (receipt.connectionGeneration !== run.generation || receipt.acceptedBytes !== run.expected.length) {
        void this.finish(run, 'failed', 'invalidWriteReceipt'); return;
      }
      run.writeConfirmed = true; this.state = { ...this.state, bytesSent: receipt.acceptedBytes };
      if (run.echoMatched) { void this.finish(run, 'succeeded', 'exactEcho'); }
    } catch { if (this.live(run)) { void this.finish(run, 'failed', 'transportFailure'); } }
  }
  private onEvent(run: DiagnosticRun, event: TransportEvent): void {
    if (!this.live(run) || event.connectionGeneration !== run.generation) { return; }
    if (!this.inTime(run)) { void this.finish(run, 'failed', 'timeout'); return; }
    if (event.kind !== 'received') { void this.finish(run, 'failed', event.kind === 'closed' ? 'peerClosed' : 'transportFailure'); return; }
    const bytes: Uint8Array | undefined = event.bytes;
    if (!run.writeIssued || bytes === undefined || bytes.length === 0 || run.echoMatched ||
      (run.kind === 'udp' && bytes.length !== run.expected.length) || run.received + bytes.length > run.expected.length) {
      void this.finish(run, 'failed', 'unexpectedEcho'); return;
    }
    for (let index: number = 0; index < bytes.length; index++) {
      if (bytes[index] !== run.expected[run.received + index]) { void this.finish(run, 'failed', 'echoMismatch'); return; }
    }
    run.received += bytes.length; this.state = { ...this.state, bytesReceived: run.received };
    if (run.received === run.expected.length) {
      run.echoMatched = true; this.state = { ...this.state, latencyMs: Math.max(0, this.clock.nowMs() - run.sentAt) };
      if (run.writeConfirmed) { void this.finish(run, 'succeeded', 'exactEcho'); }
    }
  }
  private closeBounded(run: DiagnosticRun): Promise<boolean> {
    const port: TransportPort | null = run.port;
    if (port === null) { return Promise.resolve(true); }
    return new Promise<boolean>((resolve): void => {
      let settled: boolean = false;
      let timer: number | null = null;
      const finish = (confirmed: boolean): void => {
        if (settled) { return; } settled = true;
        if (timer !== null) { this.timers.cancel(timer); } resolve(confirmed);
      };
      try {
        timer = this.timers.scheduleAt(this.clock.nowMs() + this.limits.closeTimeoutMs, (): void => finish(false));
        port.close('dedicated diagnostic finished', run.generation).then((): void => {
          try { finish(this.factory.canRelease(port)); } catch { finish(false); }
        }).catch((): void => finish(false));
      } catch { finish(false); }
    });
  }
  private async finish(run: DiagnosticRun, phase: 'succeeded' | 'failed' | 'cancelled', diagnostic: string): Promise<void> {
    if (this.current !== run) { return; }
    if (!run.active) {
      if (this.state.busy && phase === 'cancelled') { run.finalPhase = 'cancelled'; run.finalDiagnostic = 'cancelled'; }
      return;
    }
    run.active = false; run.finalPhase = phase; run.finalDiagnostic = diagnostic;
    if (run.timer !== null) { this.timers.cancel(run.timer); run.timer = null; }
    if (run.unsubscribe !== null) { run.unsubscribe(); run.unsubscribe = null; }
    this.state = { ...this.state, phase: 'closing', busy: true, diagnostic: diagnostic, proof: 'none' };
    let confirmed: boolean = await this.closeBounded(run);
    if (confirmed && run.port !== null) {
      try { this.factory.release(run.port); } catch { confirmed = false; }
    }
    // Retain the exact old run/port when closure is uncertain. No background
    // completion or late event may clear quarantine or unlock replacement.
    this.state = { ...this.state, phase: confirmed ? run.finalPhase : 'failed', busy: false,
      closeConfirmed: confirmed, quarantined: !confirmed, diagnostic: confirmed ? run.finalDiagnostic : 'closeUnconfirmed',
      proof: confirmed && run.finalPhase === 'succeeded' ? 'exactEcho' : 'none' };
    if (run.resolve !== null) { run.resolve(this.snapshot()); run.resolve = null; }
  }
  cancel(): Promise<SocketDiagnosticSnapshot> {
    const run: DiagnosticRun | null = this.current;
    if (run === null || !this.state.busy) { return Promise.resolve(this.snapshot()); }
    void this.finish(run, 'cancelled', 'cancelled'); return run.completion;
  }
  setForeground(value: boolean): void {
    this.foreground = value;
    if (!value) { void this.cancel(); }
  }
  dispose(): Promise<SocketDiagnosticSnapshot> { this.disposed = true; return this.cancel(); }
}
