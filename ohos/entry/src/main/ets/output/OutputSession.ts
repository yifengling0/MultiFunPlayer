import { isRegisteredNativeTransport, releaseNativeTransport, nativeTransportCanRelease } from './NativeTransportAdmission';
import { OutputError, copyConfig, copyOutputFrame, authorizedAxesMatch, copySeekTransition, sameSeekTransaction } from './OutputTypes';
import type { AxisOutputEvent, DispatchAuthorization, DispatchIntent, FixedContext, OutputAdmissionPolicy,
  AxisRange, OutputTargetConfig, OutputValue, OutputValueFrame, OutputSeekTransition } from './OutputTypes';
import { asciiBytes, encodeEvent, encodeFixed, intervalMilliseconds } from './TCodeEncoder';
import { isTCodeDirty, mapEvent, mapFixed, rangeDiagnostic, validateRanges } from './RangeModel';
import { FixedScheduler, PolledStats, validateFixedContext } from './UpdateContext';
import type { EventScheduler, MonotonicClock } from './UpdateContext';
import type { TransportEvent, TransportPort, WriteReceipt, WriteRequest } from './TransportPort';
import { copyControlLease, sameControlLease } from './OutputControlContinuity';
import type { OutputControlLease } from './OutputControlContinuity';

export type SessionConnectionState = 'disconnected' | 'connecting' | 'connected' | 'fault';
export type MediaDispatchState = 'stopped' | 'playing' | 'paused';
export type FrameAdmission = 'accepted' | 'ignored' | 'rejected';
interface FrameCandidate { frame: OutputValueFrame; authorization: DispatchAuthorization; gateRevision: number; generation: number; controlRequestId: number | null; }
interface FixedCandidate { source: FrameCandidate; elapsedMs: number; }
interface PolledCandidate { source: FrameCandidate; event: AxisOutputEvent; }
interface Flight {
  bytes: Uint8Array; offset: number; values: OutputValue[]; source: FrameCandidate;
  deadlineMonotonicMs: number; timeoutHandle: number | null;
}
export interface OutputSessionSnapshot {
  readonly targetId: string; readonly simulationOnly: boolean; readonly connection: SessionConnectionState;
  readonly connectionGeneration: number; readonly epoch: number; readonly profileRevision: number;
  readonly armed: boolean; readonly dispatchSuspended: boolean; readonly seekPending: boolean; readonly foreground: boolean; readonly mediaState: MediaDispatchState;
  readonly controlPending: boolean; readonly controlParked: boolean;
  readonly inFlight: boolean; readonly pendingFixed: boolean; readonly queuedEvents: number;
  readonly completedLocalWrites: number; readonly locallyAcceptedBytes: number;
  readonly writeCalls: number; readonly droppedExpired: number; readonly coalescedFixed: number;
  readonly lastWritten: ReadonlyArray<OutputValue>;
  readonly lastErrorCode: string | null; readonly lastErrorDetail: string | null;
  readonly closeConfirmed: boolean;
  readonly configurationDiagnostics: ReadonlyArray<string>;
}

/** Serialized single-owner state machine. Invoke all methods, timer callbacks and
 * transport events on ONE owner. Gate changes are synchronous in that owner;
 * this does not promise zero UI-to-worker latency or a physical device stop.
 * Native ports require a matching factory-registered identity. Source/clock
 * provenance and explicit UI authorization remain mandatory.
 */
export class OutputSession {
  private config: OutputTargetConfig;
  private readonly policy: OutputAdmissionPolicy;
  private readonly transport: TransportPort;
  private readonly clock: MonotonicClock;
  private readonly timers: EventScheduler;
  private readonly unsubscribe: () => void;
  private readonly onTerminalGateRevoked: () => void;
  private scheduler: FixedScheduler | null = null;
  private connection: SessionConnectionState = 'disconnected';
  private generation: number = 0;
  /** Actual handle/open-attempt identity; never replaced by an invalidation token. */
  private transportGeneration: number | null = null;
  private pendingOpen: boolean = false;
  private closeAttempt: Promise<void> | null = null;
  private currentEpoch: number = 0;
  private sourceConfigurationRevision: number = -1;
  private gateRevision: number = 0;
  private armed: boolean = false;
  private sourceSeek: OutputSeekTransition | null = null;
  private seekTimeoutHandle: number | null = null;
  private lastSeekRequestId: number = 0;
  private sourceControl: OutputControlLease | null = null;
  private controlPendingUntil: number | null = null;
  private controlParkedUntil: number | null = null;
  private controlTimeoutHandle: number | null = null;
  private controlTimerToken: number = 0;
  private controlLastMonotonicMs: number = 0;
  private lastControlRequestId: number = 0;
  private foreground: boolean = true;
  private mediaState: MediaDispatchState = 'stopped';
  private closing: boolean = false;
  private closeConfirmed: boolean = true;
  private lastError: OutputError | null = null;
  private latestFrame: FrameCandidate | null = null;
  private pendingFixed: FixedCandidate | null = null;
  private queue: PolledCandidate[] = [];
  private flight: Flight | null = null;
  private lastSequence: number = -1;
  private rangeEpoch: number = -1;
  private rangeFrameFloor: number = -1;
  private lastEventId: number = -1;
  private lastWritten: OutputValue[] = [];
  private completedLocalWrites: number = 0;
  private locallyAcceptedBytes: number = 0;
  private writeCalls: number = 0;
  private droppedExpired: number = 0;
  private coalescedFixed: number = 0;
  private disposed: boolean = false;
  readonly polledStats: PolledStats = new PolledStats();

  constructor(config: OutputTargetConfig, policy: OutputAdmissionPolicy, transport: TransportPort,
    clock: MonotonicClock, timers: EventScheduler, onTerminalGateRevoked: () => void = (): void => {}) {
    OutputSession.validateConfig(config);
    OutputSession.validatePolicy(policy);
    if (!(transport.simulationOnly && config.kind === 'memory') && !isRegisteredNativeTransport(transport, config.kind)) {
      throw new OutputError('physicalTransportUnavailable', 'Transport must be memory simulation or a matching registered native factory instance.');
    }
    this.config = copyConfig(config); this.policy = {
      maximumFrameAgeMs: policy.maximumFrameAgeMs, maximumClockAgeMs: policy.maximumClockAgeMs,
      maximumEventAgeMs: policy.maximumEventAgeMs, maximumFixedElapsedMs: policy.maximumFixedElapsedMs,
      writeTimeoutMs: policy.writeTimeoutMs, maximumPolledQueueLength: policy.maximumPolledQueueLength,
      allowZeroInterval: policy.allowZeroInterval };
    this.transport = transport; this.clock = clock; this.timers = timers; this.onTerminalGateRevoked = onTerminalGateRevoked;
    this.unsubscribe = transport.subscribe(event => this.onTransportEvent(event));
    this.rebuildScheduler();
  }
  private static validateConfig(config: OutputTargetConfig): void {
    if (config.targetId.length === 0 || config.targetId.length > 128 || typeof config.allowPausedAutoHome !== 'boolean' ||
      typeof config.allowPausedMotion !== 'boolean' ||
      (config.allowPausedManual !== undefined && typeof config.allowPausedManual !== 'boolean') || (config.autoConnectPolicy !== 'manual' && config.autoConnectPolicy !== 'savedDisabled' && config.autoConnectPolicy !== 'automaticRequested')) {
      throw new OutputError('invalidConfiguration', 'Invalid target identity or explicit paused policies.');
    }
    validateRanges(config.axisRanges, config.protocolProfile);
    if (config.updateContext.kind === 'fixed') { validateFixedContext(config.updateContext); }
    else if (config.updateContext.kind !== 'polled') { throw new OutputError('invalidConfiguration', 'Unknown update context.'); }
  }
  private static validatePolicy(policy: OutputAdmissionPolicy): void {
    const limits: number[] = [policy.maximumFrameAgeMs, policy.maximumClockAgeMs, policy.maximumEventAgeMs,
      policy.maximumFixedElapsedMs, policy.writeTimeoutMs];
    if (limits.some(value => !Number.isFinite(value) || value <= 0) ||
      !Number.isSafeInteger(policy.maximumPolledQueueLength) || policy.maximumPolledQueueLength < 1 ||
      typeof policy.allowZeroInterval !== 'boolean') {
      throw new OutputError('invalidConfiguration', 'Provide explicit positive simulation admission limits.');
    }
  }
  private rebuildScheduler(): void {
    if (this.scheduler !== null) { this.scheduler.stop(); }
    this.scheduler = this.config.updateContext.kind === 'fixed' ? new FixedScheduler(this.clock, this.timers,
      this.config.updateContext, elapsed => this.onFixedTick(elapsed), error => this.fail(error)) : null;
  }
  /** Explicit connection only. Saved configuration and foreground never call it. */
  async connect(): Promise<boolean> {
    if (this.disposed || !this.foreground || this.closing || this.pendingOpen || this.connection === 'connecting') { return false; }
    if (this.connection === 'connected') { return true; }
    if (this.transportGeneration !== null || !this.closeConfirmed || !nativeTransportCanRelease(this.transport)) { return false; }
    this.clearGate(true); this.generation++; const generation: number = this.generation;
    this.transportGeneration = generation; this.pendingOpen = true;
    this.connection = 'connecting'; this.lastError = null; this.closeConfirmed = false;
    try {
      await this.transport.open(this.config, generation);
      if (generation !== this.generation || this.connection !== 'connecting' || !this.foreground || this.disposed) {
        await this.closeStaleOpen(generation); return false;
      }
      this.pendingOpen = false; this.connection = 'connected'; return true;
    } catch (error) {
      if (generation === this.generation) {
        this.pendingOpen = false;
        this.fail(new OutputError('transportError', 'Open failed: ' + OutputSession.errorText(error as Error)));
      } else { await this.closeStaleOpen(generation); }
      return false;
    }
  }
  private async closeStaleOpen(generation: number): Promise<void> {
    // Keep reconnect blocked until the cancelled open has settled and its exact
    // handle has been retired again. An earlier close may precede late creation.
    if (this.closeAttempt !== null) { await this.closeAttempt; }
    this.pendingOpen = false; this.transportGeneration = generation;
    await this.closeConnection('stale open completion', false);
  }
  /** Explicit arm binds a particular engine epoch/profile. No saved armed state. */
  arm(epoch: number, profileRevision: number): boolean {
    if (this.disposed || !this.foreground || this.connection !== 'connected' || this.closing || this.flight !== null || this.sourceSeek !== null || this.sourceControl !== null) { return false; }
    if (!Number.isSafeInteger(epoch) || epoch < this.currentEpoch || profileRevision !== this.config.protocolProfile.revision) { return false; }
    this.clearGate(true); this.currentEpoch = epoch; this.sourceConfigurationRevision = -1; this.lastSequence = -1; this.lastEventId = -1;
    this.armed = true;
    if (this.scheduler !== null) { this.scheduler.start(); }
    return this.armed;
  }
  /** Preserve an existing explicit arm across one trusted seek, never create it.
   * The gate is closed synchronously before the caller starts native work. */
  beginSourceSeek(transition: OutputSeekTransition): boolean {
    // Seek never inherits ordinary-control retention, including completed parking.
    if (this.sourceControl !== null) { this.disarm(); return false; }
    const now: number = this.clock.nowMs();
    if (this.sourceSeek !== null && (!Number.isFinite(now) || now < 0 || now >= this.sourceSeek.deadlineMonotonicMs)) {
      this.disarm(); return false;
    }
    if (transition.requestId <= this.lastSeekRequestId) {
      // A true duplicate keeps the already-closed seek gate. A consumed/reused
      // request must not leave a normal frame candidate sending during a seek.
      if (this.sourceSeek === null || !sameSeekTransaction(this.sourceSeek, transition) ||
        this.sourceSeek.status !== 'pending' || transition.status !== 'pending') { this.disarm(); }
      return false;
    }
    if (Number.isSafeInteger(transition.requestId)) { this.lastSeekRequestId = transition.requestId; }
    if (!this.armed || this.disposed || !this.foreground || this.connection !== 'connected' || this.closing ||
      this.mediaState === 'stopped' || transition.status !== 'pending' ||
      !Number.isSafeInteger(transition.requestId) || transition.requestId < 1 ||
      typeof transition.sourceIdentity !== 'string' || transition.sourceIdentity.length === 0 || !Number.isSafeInteger(transition.sourceGeneration) || transition.sourceGeneration < 0 ||
      transition.previousEpoch !== this.currentEpoch || !Number.isSafeInteger(transition.currentEpoch) || transition.currentEpoch <= this.currentEpoch ||
      transition.profileRevision !== this.config.protocolProfile.revision || !Number.isFinite(now) || now < 0 ||
      !Number.isFinite(transition.deadlineMonotonicMs) || transition.deadlineMonotonicMs <= now ||
      (this.sourceSeek !== null && (transition.sourceIdentity !== this.sourceSeek.sourceIdentity ||
        transition.sourceGeneration !== this.sourceSeek.sourceGeneration))) {
      this.disarm(); return false;
    }
    this.clearCandidates();
    if (!this.armed || this.connection !== 'connected') { return false; }
    this.clearSeekTransaction();
    if (this.scheduler !== null) { this.scheduler.stop(); }
    this.currentEpoch = transition.currentEpoch; this.lastSequence = -1; this.lastEventId = -1; this.lastWritten = [];
    const captured: OutputSeekTransition = copySeekTransition(transition); this.sourceSeek = captured;
    this.seekTimeoutHandle = this.timers.scheduleAt(captured.deadlineMonotonicMs, () => {
      if (this.sourceSeek !== null && this.sourceSeek.requestId === captured.requestId) { this.disarm(); }
    });
    return true;
  }
  /** Record native/source confirmation without permitting any frame dispatch. */
  confirmSourceSeek(transition: OutputSeekTransition): boolean {
    const captured: OutputSeekTransition | null = this.sourceSeek;
    if (captured === null || !this.armed || this.connection !== 'connected' || !this.foreground || this.disposed) { return false; }
    const now: number = this.clock.nowMs();
    if (!sameSeekTransaction(captured, transition) || transition.status !== 'confirmed' ||
      !Number.isFinite(now) || now < 0 || now >= captured.deadlineMonotonicMs) { this.disarm(); return false; }
    this.currentEpoch = transition.currentEpoch; this.sourceSeek = copySeekTransition(transition); return true;
  }
  /** The one authorized epoch handoff. Validation happens before reopening the
   * dispatch gate; source revision, scope, intent and freshness still apply. */
  completeSourceSeek(transition: OutputSeekTransition, frame: OutputValueFrame, authorization: DispatchAuthorization): FrameAdmission {
    if (!this.confirmSourceSeek(transition)) { return 'ignored'; }
    const captured: OutputSeekTransition | null = this.sourceSeek;
    if (captured === null) { return 'ignored'; }
    if (frame.epoch !== transition.currentEpoch ||
      frame.profileRevision !== captured.profileRevision || authorization.sourceConfigurationRevision < this.sourceConfigurationRevision) {
      this.disarm(); return 'ignored';
    }
    try {
      this.validateFrame(frame, authorization);
      const candidate: FrameCandidate = { frame: frame, authorization: authorization, gateRevision: this.gateRevision, generation: this.generation, controlRequestId: null };
      if (!this.intentAllowed(authorization) || !this.fresh(candidate, this.config.updateContext.kind === 'polled')) { this.disarm(); return 'ignored'; }
    } catch (error) { this.fail(OutputSession.asError(error as Error)); return 'rejected'; }
    this.clearSeekTransaction();
    // Starting before admission avoids treating seek wait time as movement time.
    if (this.scheduler !== null) { this.scheduler.start(); }
    return this.submitFrame(frame, authorization);
  }
  private clearSeekTransaction(): void {
    if (this.seekTimeoutHandle !== null) { this.timers.cancel(this.seekTimeoutHandle); }
    this.seekTimeoutHandle = null; this.sourceSeek = null;
  }
  /** Preserve only this target's existing Arm while its owner establishes new
   * ordinary-control observations. No command receipt can complete this gate. */
  beginSourceControl(lease: OutputControlLease): boolean {
    const previousRequestId: number = this.lastControlRequestId;
    // An unarmed/invalid target cannot later adopt the same request after the
    // user arms it. A rejected attempt consumes its monotonic identity too.
    if (Number.isSafeInteger(lease.requestId) && lease.requestId > this.lastControlRequestId) { this.lastControlRequestId = lease.requestId; }
    const previous: OutputControlLease | null = this.sourceControl;
    if (previous !== null && (!this.controlLive() || this.controlParkedUntil === null ||
      previous.sourceIdentity !== lease.sourceIdentity || previous.sourceGeneration !== lease.sourceGeneration)) {
      this.disarm(); return false;
    }
    const now: number = this.clock.nowMs();
    if (!this.armed || this.disposed || !this.foreground || this.connection !== 'connected' || this.closing ||
      this.sourceSeek !== null || this.mediaState === 'stopped' ||
      !Number.isSafeInteger(lease.requestId) || lease.requestId <= previousRequestId ||
      typeof lease.sourceIdentity !== 'string' || lease.sourceIdentity.length === 0 ||
      !Number.isSafeInteger(lease.sourceGeneration) || lease.sourceGeneration < 0 ||
      lease.epoch !== this.currentEpoch || lease.profileRevision !== this.config.protocolProfile.revision ||
      !Number.isSafeInteger(lease.startFrameSequence) || lease.startFrameSequence < 0 || lease.startFrameSequence < this.lastSequence ||
      !Number.isSafeInteger(lease.startSourceConfigurationRevision) || lease.startSourceConfigurationRevision < 0 ||
      lease.startSourceConfigurationRevision < this.sourceConfigurationRevision ||
      !Number.isFinite(now) || now < 0 || !Number.isFinite(lease.deadlineMonotonicMs) ||
      lease.deadlineMonotonicMs <= now || lease.deadlineMonotonicMs > now + 5000) {
      this.disarm(); return false;
    }
    this.clearCandidates();
    // Invalidating an already accepted stream prefix can synchronously fault.
    if (!this.armed || this.connection !== 'connected' || this.closing) { return false; }
    this.clearControlTransaction();
    if (this.scheduler !== null) { this.scheduler.stop(); }
    this.sourceConfigurationRevision = lease.startSourceConfigurationRevision;
    this.sourceControl = copyControlLease(lease); this.controlLastMonotonicMs = now;
    this.controlPendingUntil = Math.min(lease.deadlineMonotonicMs, now + 750);
    this.scheduleControlExpiry(this.controlPendingUntil);
    return true;
  }
  /** Renew only a still-live pending control from fresh source-owned evidence.
   * The owner initially shortens this to the captured source's actual freshness
   * deadline, then renews only for new observations. No frame is admitted here. */
  renewSourceControl(lease: OutputControlLease, expiryMonotonicMs: number): boolean {
    if (!this.matchLiveControl(lease) || this.controlParkedUntil !== null) { return false; }
    const now: number = this.clock.nowMs();
    if (!Number.isFinite(expiryMonotonicMs) || expiryMonotonicMs <= now ||
      expiryMonotonicMs > now + 750 || expiryMonotonicMs > lease.deadlineMonotonicMs) {
      this.disarm(); return false;
    }
    if (!this.matchLiveControl(lease)) { return false; }
    this.controlPendingUntil = expiryMonotonicMs;
    this.scheduleControlExpiry(expiryMonotonicMs);
    return true;
  }
  /** A normal, genuinely newer playing frame is required before the original
   * Arm may resume. Paused controls use retain-only parking instead. */
  completeSourceControl(lease: OutputControlLease, frame: OutputValueFrame,
    authorization: DispatchAuthorization): FrameAdmission {
    if (!this.matchLiveControl(lease)) { return 'ignored'; }
    if (this.controlParkedUntil !== null || this.mediaState !== 'playing') { this.disarm(); return 'ignored'; }
    const admission: FrameAdmission = this.validateControlFrame(lease, frame, authorization);
    if (admission !== 'accepted') { return admission; }
    if (!this.matchLiveControl(lease)) { return 'ignored'; }
    this.clearControlTransaction();
    // Avoid treating the suspended observation wait as movement duration.
    if (this.scheduler !== null) { this.scheduler.start(); }
    return this.submitFrame(frame, authorization);
  }
  /** The owner must first verify a new current known paused frame and fresh
   * explicit paused source evidence. This is retain-only, never authorization.
   * Renewal must precede the existing expiry and carries at most 750 ms proof. */
  parkSourceControl(lease: OutputControlLease, expiryMonotonicMs: number): boolean {
    if (!this.matchLiveControl(lease)) { return false; }
    const now: number = this.clock.nowMs();
    if (this.mediaState !== 'paused' || !Number.isFinite(expiryMonotonicMs) ||
      expiryMonotonicMs <= now || expiryMonotonicMs > now + 750) { this.disarm(); return false; }
    this.clearCandidates();
    if (!this.armed || this.connection !== 'connected' || this.closing) { return false; }
    if (!this.matchLiveControl(lease)) { return false; }
    if (this.scheduler !== null) { this.scheduler.stop(); }
    this.controlParkedUntil = expiryMonotonicMs;
    this.scheduleControlExpiry(expiryMonotonicMs);
    return true;
  }
  /** A new, separately authorized paused activity frame may renew freshness
   * without resetting its existing output cadence. The owner uses retain-only
   * parkSourceControl instead when activity or target permission is absent. */
  renewParkedSourceControl(lease: OutputControlLease, expiryMonotonicMs: number): boolean {
    if (!this.matchLiveControl(lease) || this.controlParkedUntil === null) { return false; }
    const now: number = this.clock.nowMs();
    if (!Number.isFinite(expiryMonotonicMs) || expiryMonotonicMs <= now || expiryMonotonicMs > now + 750) {
      this.disarm(); return false;
    }
    if (!this.matchLiveControl(lease)) { return false; }
    this.controlParkedUntil = expiryMonotonicMs;
    this.scheduleControlExpiry(expiryMonotonicMs);
    return true;
  }
  /** Only a real, normally authorized paused Home/Motion frame may send while
   * parking remains active. Ordinary submitFrame cannot bypass this identity. */
  submitSourceControlFrame(lease: OutputControlLease, frame: OutputValueFrame,
    authorization: DispatchAuthorization): FrameAdmission {
    if (!this.matchLiveControl(lease)) { return 'ignored'; }
    if (this.controlParkedUntil === null || this.mediaState !== 'paused' ||
      authorization.intents.some(intent => intent !== 'pausedAutoHome' && intent !== 'pausedMotion')) {
      this.disarm(); return 'ignored';
    }
    const admission: FrameAdmission = this.validateControlFrame(lease, frame, authorization);
    if (admission !== 'accepted') { return admission; }
    if (!this.matchLiveControl(lease)) { return 'ignored'; }
    if (this.scheduler !== null) { this.scheduler.start(); }
    return this.admitFrame(frame, authorization, lease.requestId);
  }
  private validateControlFrame(lease: OutputControlLease, frame: OutputValueFrame,
    authorization: DispatchAuthorization): FrameAdmission {
    if (frame.sequence <= lease.startFrameSequence || frame.sequence <= this.lastSequence ||
      (frame.epoch === this.rangeEpoch && frame.sequence <= this.rangeFrameFloor)) { return 'ignored'; }
    if (frame.epoch !== lease.epoch || frame.profileRevision !== lease.profileRevision ||
      authorization.sourceConfigurationRevision < lease.startSourceConfigurationRevision ||
      authorization.sourceConfigurationRevision < this.sourceConfigurationRevision) { this.disarm(); return 'ignored'; }
    try {
      this.validateFrame(frame, authorization);
      const source: FrameCandidate = { frame: frame, authorization: authorization,
        gateRevision: this.gateRevision, generation: this.generation, controlRequestId: lease.requestId };
      if (!this.intentAllowed(authorization) || !this.fresh(source, this.config.updateContext.kind === 'polled')) {
        this.disarm(); return 'ignored';
      }
      // Validate payload before releasing pending retention or starting a timer.
      if (this.config.updateContext.kind === 'fixed') { mapFixed(frame.values, this.config.axisRanges, this.config.protocolProfile); }
      else {
        for (const event of frame.events) {
          const range: AxisRange | undefined = this.config.axisRanges.find(item => item.axisId === event.axisId);
          if (range === undefined) { throw new OutputError('invalidAxis', 'Unknown event axis.'); }
          mapEvent(event, range, this.config.protocolProfile);
        }
      }
      return 'accepted';
    } catch (error) { this.fail(OutputSession.asError(error as Error)); return 'rejected'; }
  }
  private matchLiveControl(lease: OutputControlLease): boolean {
    const captured: OutputControlLease | null = this.sourceControl;
    if (captured === null || !this.controlLive()) { return false; }
    // An old callback cannot revoke an unrelated newer owner's transaction.
    if (Number.isSafeInteger(lease.requestId) && lease.requestId < captured.requestId) { return false; }
    if (!sameControlLease(captured, lease)) { this.disarm(); return false; }
    return true;
  }
  private controlLive(): boolean {
    const captured: OutputControlLease | null = this.sourceControl;
    if (captured === null) { return false; }
    const now: number = this.clock.nowMs();
    const expiry: number = this.controlParkedUntil === null ?
      (this.controlPendingUntil === null ? captured.deadlineMonotonicMs : this.controlPendingUntil) : this.controlParkedUntil;
    if (!this.armed || !this.foreground || this.disposed || this.connection !== 'connected' || this.closing ||
      this.sourceSeek !== null || captured.epoch !== this.currentEpoch || captured.profileRevision !== this.config.protocolProfile.revision ||
      this.mediaState === 'stopped' || (this.controlParkedUntil !== null && this.mediaState !== 'paused') ||
      !Number.isFinite(now) || now < this.controlLastMonotonicMs || now >= expiry) {
      this.disarm(); return false;
    }
    this.controlLastMonotonicMs = now; return true;
  }
  private scheduleControlExpiry(expiryMonotonicMs: number): void {
    if (this.controlTimeoutHandle !== null) { this.timers.cancel(this.controlTimeoutHandle); }
    const token: number = ++this.controlTimerToken;
    this.controlTimeoutHandle = this.timers.scheduleAt(expiryMonotonicMs, () => {
      if (this.sourceControl !== null && token === this.controlTimerToken) { this.disarm(); }
    });
  }
  private clearControlTransaction(): void {
    if (this.controlTimeoutHandle !== null) { this.timers.cancel(this.controlTimeoutHandle); }
    this.controlTimeoutHandle = null; this.controlTimerToken++;
    this.sourceControl = null; this.controlPendingUntil = null; this.controlParkedUntil = null;
  }
  setMediaState(state: MediaDispatchState): void {
    if (state !== 'playing' && state !== 'paused' && state !== 'stopped') { this.fail(new OutputError('invalidIntent', 'Unknown media state.')); return; }
    if (state === 'stopped') { this.stop(); return; }
    if (this.sourceControl !== null && this.controlParkedUntil !== null && state !== 'paused') { this.disarm(); }
    if (state !== this.mediaState) { this.clearCandidates(); }
    this.mediaState = state;
  }
  /** Pause preserves an explicit arm. It only permits separately allowed source
   * intents; Stop always disarms, even when paused motion/home are enabled.
   */
  pause(): void { this.setMediaState('paused'); }
  stop(): void { this.mediaState = 'stopped'; this.disarm(); }
  disarm(): void { this.clearGate(true); }
  /** Suppress every old candidate without granting/revoking the user's arm.
   * In-flight bytes already submitted cannot be recalled. An incomplete stream
   * still faults/closes through clearCandidates/receipt validation. */
  suspendCandidates(): void { this.clearCandidates(); }
  invalidateEpoch(epoch: number): void {
    if (!Number.isSafeInteger(epoch) || epoch <= this.currentEpoch) { this.fail(new OutputError('invalidFrame', 'Epoch invalidation must increase the epoch.')); return; }
    this.clearGate(true); this.currentEpoch = epoch; this.sourceConfigurationRevision = -1; this.lastSequence = -1; this.lastEventId = -1;
  }
  /** Exact range-only live edit: no scope/policy change, no new Arm, no stale
   * frame reuse. Preserve the original successful mapped dirty-value cache. */
  updateRanges(ranges: ReadonlyArray<AxisRange>, epoch: number, sequence: number): boolean {
    if (this.disposed || this.closing || this.connection !== 'connected' || !this.foreground || this.sourceSeek !== null || this.sourceControl !== null ||
      !Number.isSafeInteger(epoch) || epoch < this.currentEpoch || !Number.isSafeInteger(sequence) || sequence < 0 ||
      ranges.length !== this.config.axisRanges.length || ranges.some((range, index) =>
        range.axisId !== this.config.axisRanges[index].axisId || range.enabled !== this.config.axisRanges[index].enabled)) { return false; }
    const next: OutputTargetConfig = { ...copyConfig(this.config), axisRanges: ranges.map(range => ({ axisId: range.axisId, minimum: range.minimum, maximum: range.maximum, enabled: range.enabled })) };
    try { OutputSession.validateConfig(next); } catch { return false; }
    this.clearCandidates();
    if (this.connection !== 'connected' || this.closing) { return false; }
    this.config = next; this.rangeEpoch = epoch; this.rangeFrameFloor = Math.max(sequence, this.lastSequence);
    return true;
  }
  reconfigure(config: OutputTargetConfig): void {
    this.clearGate(true);
    try {
      OutputSession.validateConfig(config);
      if (config.targetId !== this.config.targetId || config.kind !== this.config.kind ||
        config.protocolProfile.revision <= this.config.protocolProfile.revision) {
        throw new OutputError('invalidConfiguration', 'Configuration changes require a higher profile revision and the same target and transport kind.');
      }
      this.config = copyConfig(config); this.sourceConfigurationRevision = -1; this.lastSequence = -1; this.lastEventId = -1; this.rebuildScheduler();
    } catch (error) { this.fail(OutputSession.asError(error as Error)); }
  }
  setForeground(value: boolean): void {
    this.foreground = value;
    if (!value) { this.mediaState = 'stopped'; void this.disconnect('background'); }
  }
  async disconnect(reason: string = 'explicit disconnect'): Promise<void> { await this.closeConnection(reason, false); }
  async dispose(): Promise<void> {
    this.disposed = true; this.unsubscribe();
    await this.disconnect('dispose');
    if (this.closeConfirmed) { releaseNativeTransport(this.transport); }
  }

  submitFrame(frame: OutputValueFrame, authorization: DispatchAuthorization): FrameAdmission {
    if (this.sourceControl !== null) { this.controlLive(); return 'ignored'; }
    return this.admitFrame(frame, authorization, null);
  }
  private admitFrame(frame: OutputValueFrame, authorization: DispatchAuthorization, controlRequestId: number | null): FrameAdmission {
    if (!this.armed || this.sourceSeek !== null || this.connection !== 'connected' || !this.foreground || this.disposed) { return 'ignored'; }
    if (frame.epoch === this.rangeEpoch && frame.sequence <= this.rangeFrameFloor) { return 'ignored'; }
    // Old epoch/profile callbacks must not tear down a newer valid session.
    if (frame.epoch < this.currentEpoch || frame.profileRevision < this.config.protocolProfile.revision) { return 'ignored'; }
    if (frame.epoch === this.currentEpoch && frame.profileRevision === this.config.protocolProfile.revision && frame.sequence <= this.lastSequence) { return 'ignored'; }
    try {
      this.validateFrame(frame, authorization);
      if (authorization.sourceConfigurationRevision < this.sourceConfigurationRevision) { return 'ignored'; }
      if (authorization.sourceConfigurationRevision !== this.sourceConfigurationRevision) {
        this.clearCandidates(); this.sourceConfigurationRevision = authorization.sourceConfigurationRevision;
        if (!this.armed || this.connection !== 'connected') { return 'ignored'; }
      }
      const source: FrameCandidate = { frame: copyOutputFrame(frame), authorization: { epoch: authorization.epoch,
        sourceFrameSequence: authorization.sourceFrameSequence, updateKind: authorization.updateKind, sourceConfigurationRevision: authorization.sourceConfigurationRevision, authorizedAxes: authorization.authorizedAxes.slice(), intents: authorization.intents.slice(),
        clockKind: authorization.clockKind, observedMonotonicMs: authorization.observedMonotonicMs },
        gateRevision: this.gateRevision, generation: this.generation, controlRequestId: controlRequestId };
      this.lastSequence = frame.sequence;
      if (!this.intentAllowed(source.authorization)) { this.clearCandidates(); return 'ignored'; }
      if (!this.fresh(source, false)) { this.clearCandidates(); this.droppedExpired++; return 'ignored'; }
      if (this.config.updateContext.kind === 'fixed') {
        // Validate the WHOLE enabled batch even if no dirty axis will be emitted.
        mapFixed(source.frame.values, this.config.axisRanges, this.config.protocolProfile);
        this.latestFrame = source;
      } else {
        const additions: PolledCandidate[] = [];
        for (const event of source.frame.events) {
          if (event.eventId <= this.lastEventId) { continue; }
          this.lastEventId = event.eventId;
          if (!this.eventIntentAllowed(event, source.authorization)) { continue; }
          const range = this.config.axisRanges.find(item => item.axisId === event.axisId);
          if (range === undefined) { throw new OutputError('invalidAxis', 'Unknown event axis.'); }
          const mapped: AxisOutputEvent | null = mapEvent(event, range, this.config.protocolProfile);
          if (mapped !== null) { additions.push({ source: source, event: mapped }); }
        }
        if (this.queue.length + additions.length > this.policy.maximumPolledQueueLength) {
          throw new OutputError('queueOverflow', 'Bounded event queue overflow; stale motion is not replayed.');
        }
        this.queue = this.queue.concat(additions); this.pump();
      }
      return 'accepted';
    } catch (error) { this.fail(OutputSession.asError(error as Error)); return 'rejected'; }
  }
  private validateFrame(frame: OutputValueFrame, authorization: DispatchAuthorization): void {
    if (!Number.isSafeInteger(frame.sequence) || frame.sequence < 0 || frame.epoch !== this.currentEpoch ||
      frame.profileRevision !== this.config.protocolProfile.revision || !Number.isFinite(frame.monotonicMs) || frame.monotonicMs < 0 ||
      frame.monotonicMs > this.clock.nowMs() || (authorization.clockKind === 'media' && (!Number.isFinite(frame.mediaPositionMs) || frame.mediaPositionMs < 0))) {
      throw new OutputError('invalidFrame', 'Invalid frame identity, revision or timestamp.');
    }
    if (authorization.epoch !== frame.epoch || authorization.sourceFrameSequence !== frame.sequence ||
      authorization.updateKind !== this.config.updateContext.kind ||
      !Number.isSafeInteger(authorization.sourceConfigurationRevision) || authorization.sourceConfigurationRevision < 0 ||
      !Number.isFinite(authorization.observedMonotonicMs) || authorization.observedMonotonicMs < 0 ||
      authorization.observedMonotonicMs > this.clock.nowMs() || authorization.intents.length === 0 ||
      authorization.intents.some(intent => intent !== 'activePlayback' && intent !== 'pausedAutoHome' && intent !== 'pausedMotion' && intent !== 'pausedManual') ||
      (authorization.clockKind !== 'media' && authorization.clockKind !== 'monotonic')) {
      throw new OutputError('invalidIntent', 'Missing or mismatched explicit dispatch provenance.');
    }
    const enabled: string[] = this.config.axisRanges.filter(range => range.enabled).map(range => range.axisId);
    if (!authorizedAxesMatch(authorization.authorizedAxes, enabled)) {
      throw new OutputError('invalidIntent', 'Authorization must cover exactly the enabled target axes.');
    }
    let previousEventId: number = -1;
    for (const event of frame.events) {
      if (!Number.isSafeInteger(event.eventId) || event.eventId < 0 || event.eventId <= previousEventId ||
        event.epoch !== frame.epoch || event.sourceFrameSequence !== frame.sequence ||
        (event.kind !== 'script' && event.kind !== 'autoHome' && event.kind !== 'speedLimitedScript')) {
        throw new OutputError('invalidFrame', 'Events must retain their original frame/epoch and increasing IDs.');
      }
      previousEventId = event.eventId;
    }
  }
  private intentAllowed(authorization: DispatchAuthorization): boolean {
    if (this.mediaState === 'stopped') { return false; }
    return authorization.intents.every((intent: DispatchIntent) => {
      if (intent === 'activePlayback') { return this.mediaState === 'playing' && authorization.clockKind === 'media'; }
      if (intent === 'pausedAutoHome') { return this.mediaState === 'paused' && this.config.allowPausedAutoHome && authorization.clockKind === 'monotonic'; }
      if (intent === 'pausedMotion') { return this.mediaState === 'paused' && this.config.allowPausedMotion && authorization.clockKind === 'monotonic'; }
      // Original manual Transition changes fixed values but emits no polled event.
      if (intent === 'pausedManual') { return this.mediaState === 'paused' && this.config.allowPausedManual === true &&
        authorization.clockKind === 'monotonic' && authorization.updateKind === 'fixed' && this.config.updateContext.kind === 'fixed'; }
      return false;
    });
  }
  private eventIntentAllowed(event: AxisOutputEvent, authorization: DispatchAuthorization): boolean {
    if (this.mediaState === 'playing') { return authorization.intents.indexOf('activePlayback') >= 0; }
    return event.kind === 'autoHome' && authorization.intents.indexOf('pausedAutoHome') >= 0;
  }
  private sourceValid(source: FrameCandidate): boolean {
    if (this.sourceControl !== null) {
      if (!this.controlLive() || this.controlParkedUntil === null || source.controlRequestId !== this.sourceControl.requestId) { return false; }
    } else if (source.controlRequestId !== null) { return false; }
    return this.armed && this.sourceSeek === null && this.foreground && this.connection === 'connected' && !this.disposed &&
      source.generation === this.generation && source.gateRevision === this.gateRevision &&
      source.frame.epoch === this.currentEpoch && source.authorization.sourceConfigurationRevision === this.sourceConfigurationRevision && source.frame.profileRevision === this.config.protocolProfile.revision &&
      this.intentAllowed(source.authorization);
  }
  private fresh(source: FrameCandidate, event: boolean): boolean {
    const now: number = this.clock.nowMs();
    const frameAge: number = now - source.frame.monotonicMs;
    const clockAge: number = now - source.authorization.observedMonotonicMs;
    if (!Number.isFinite(now) || frameAge < 0 || clockAge < 0) { throw new OutputError('invalidClock', 'Monotonic clock is invalid or moved backwards.'); }
    return frameAge <= this.policy.maximumFrameAgeMs && clockAge <= this.policy.maximumClockAgeMs &&
      (!event || frameAge <= this.policy.maximumEventAgeMs);
  }
  private onFixedTick(elapsedMs: number): void {
    if (!this.armed || this.sourceSeek !== null || this.latestFrame === null || this.config.updateContext.kind !== 'fixed') { return; }
    if (elapsedMs > this.policy.maximumFixedElapsedMs) { this.fail(new OutputError('invalidDuration', 'Long stalled tick cannot become a long movement.')); return; }
    try {
      if (!this.sourceValid(this.latestFrame)) { return; }
      if (!this.fresh(this.latestFrame, false)) { this.droppedExpired++; this.latestFrame = null; return; }
      if (this.pendingFixed !== null) { this.coalescedFixed++; }
      this.pendingFixed = { source: this.latestFrame, elapsedMs: elapsedMs };
      this.pump();
    } catch (error) { this.fail(OutputSession.asError(error as Error)); }
  }
  private pump(): void {
    if (this.flight !== null || !this.armed || this.sourceSeek !== null || this.connection !== 'connected') { return; }
    try {
      if (this.config.updateContext.kind === 'fixed') {
        const pending: FixedCandidate | null = this.pendingFixed; this.pendingFixed = null;
        if (pending === null || !this.sourceValid(pending.source)) { return; }
        if (!this.fresh(pending.source, false)) { this.droppedExpired++; return; }
        const context: FixedContext = this.config.updateContext;
        const mapped: OutputValue[] = mapFixed(pending.source.frame.values, this.config.axisRanges, this.config.protocolProfile);
        const values: OutputValue[] = context.sendDirtyValuesOnly ? mapped.filter(value => {
          const previous: OutputValue | undefined = this.lastWritten.find(item => item.axisId === value.axisId);
          return isTCodeDirty(value.value, previous === undefined ? Number.NaN : previous.value, this.config.protocolProfile.precision);
        }) : mapped;
        const text: string = encodeFixed(this.config.protocolProfile, values, pending.elapsedMs, context.offloadElapsedTime);
        if (text.length === 0) { return; }
        if (!context.offloadElapsedTime && !this.policy.allowZeroInterval && intervalMilliseconds(pending.elapsedMs, this.config.protocolProfile.maximumDurationMs) === 0) {
          throw new OutputError('invalidDuration', 'Admission policy does not allow I0.');
        }
        this.beginWrite(text, values, pending.source, false);
      } else {
        while (this.queue.length > 0 && this.flight === null) {
          const pending: PolledCandidate | undefined = this.queue.shift();
          if (pending === undefined || !this.sourceValid(pending.source)) { continue; }
          if (!this.fresh(pending.source, true)) { this.droppedExpired++; continue; }
          const text: string = encodeEvent(this.config.protocolProfile, pending.event);
          if (!this.policy.allowZeroInterval && intervalMilliseconds(pending.event.durationSeconds * 1000, this.config.protocolProfile.maximumDurationMs) === 0) {
            throw new OutputError('invalidDuration', 'Admission policy does not allow I0.');
          }
          this.polledStats.update(pending.event.axisId, pending.event.durationSeconds, this.clock.nowMs());
          this.beginWrite(text, [{ axisId: pending.event.axisId, value: pending.event.targetValue }], pending.source, true);
        }
      }
    } catch (error) { this.fail(OutputSession.asError(error as Error)); }
  }
  private beginWrite(text: string, values: OutputValue[], source: FrameCandidate, event: boolean): void {
    if (text.length === 0) { return; }
    const now: number = this.clock.nowMs();
    let deadline: number = Math.min(now + this.policy.writeTimeoutMs,
      source.frame.monotonicMs + this.policy.maximumFrameAgeMs,
      source.authorization.observedMonotonicMs + this.policy.maximumClockAgeMs);
    if (event) { deadline = Math.min(deadline, source.frame.monotonicMs + this.policy.maximumEventAgeMs); }
    if (deadline <= now) { this.droppedExpired++; return; }
    const flight: Flight = { bytes: asciiBytes(text), offset: 0, values: values, source: source,
      deadlineMonotonicMs: deadline, timeoutHandle: null };
    this.flight = flight;
    flight.timeoutHandle = this.timers.scheduleAt(deadline, () => {
      if (this.flight === flight) { this.fail(new OutputError('writeExpired', 'Write receipt deadline expired; acceptance may be unknown.')); }
    });
    void this.performWrite(flight);
  }
  private async performWrite(flight: Flight): Promise<void> {
    try {
      while (flight.offset < flight.bytes.length) {
        // Last validation immediately before calling the transport, with no await between.
        if (this.flight !== flight || !this.sourceValid(flight.source)) { return; }
        if (this.clock.nowMs() >= flight.deadlineMonotonicMs) { throw new OutputError('writeExpired', 'Write expired before local submission.'); }
        const request: WriteRequest = { bytes: flight.bytes.slice(flight.offset), epoch: flight.source.frame.epoch,
          connectionGeneration: flight.source.generation, profileRevision: flight.source.frame.profileRevision,
          deadlineMonotonicMs: flight.deadlineMonotonicMs };
        this.writeCalls++;
        const receipt: WriteReceipt = await this.transport.write(request);
        if (this.flight !== flight || flight.source.generation !== this.generation) { return; }
        if (receipt.connectionGeneration !== flight.source.generation || !Number.isSafeInteger(receipt.acceptedBytes) ||
          receipt.acceptedBytes < 0 || receipt.acceptedBytes > request.bytes.length) {
          throw new OutputError('invalidReceipt', 'Transport returned an invalid generation or byte count.');
        }
        this.locallyAcceptedBytes += receipt.acceptedBytes;
        if (this.transport.writeSemantics === 'message' && receipt.acceptedBytes !== request.bytes.length) {
          throw new OutputError('shortMessageWrite', 'Message short write cannot be resumed or replayed.');
        }
        flight.offset += receipt.acceptedBytes;
        // Deadline remains binding even after a seek invalidates the source.
        // A delayed timer must not be cancelled by an overdue stale receipt.
        if (this.clock.nowMs() >= flight.deadlineMonotonicMs) { throw new OutputError('writeExpired', 'Receipt arrived after deadline.'); }
        if (!this.sourceValid(flight.source)) {
          if (this.transport.writeSemantics === 'stream' && flight.offset > 0 && flight.offset < flight.bytes.length) {
            throw new OutputError('transportError', 'Invalidated partial stream command requires closing its handle.');
          }
          return;
        }
        if (receipt.acceptedBytes === 0) { throw new OutputError('invalidReceipt', 'Zero-progress stream write; not retried.'); }
      }
      if (this.sourceValid(flight.source) && this.flight === flight) {
        for (const value of flight.values) {
          this.lastWritten = this.lastWritten.filter(previous => previous.axisId !== value.axisId);
          this.lastWritten.push({ axisId: value.axisId, value: value.value });
        }
        this.completedLocalWrites++;
      }
    } catch (error) {
      if (this.flight === flight && flight.source.generation === this.generation) { this.fail(OutputSession.asError(error as Error)); }
    } finally {
      if (flight.timeoutHandle !== null) { this.timers.cancel(flight.timeoutHandle); }
      if (this.flight === flight) { this.flight = null; this.pump(); }
    }
  }
  private clearCandidates(): void {
    this.gateRevision++; this.latestFrame = null; this.pendingFixed = null; this.queue = [];
    // A confirmed prefix already submitted to a stream cannot be abandoned then
    // followed by a fresh command on the same stream. Close conservatively.
    if (this.flight !== null && this.transport.writeSemantics === 'stream' && this.flight.offset > 0 && this.flight.offset < this.flight.bytes.length) {
      this.fail(new OutputError('transportError', 'Partial stream invalidated; closing before any further command.'));
    }
  }
  private clearGate(resetCache: boolean): void {
    this.clearSeekTransaction();
    this.clearControlTransaction();
    this.armed = false; if (this.scheduler !== null) { this.scheduler.stop(); }
    // Inline clear avoids recursive fail() when a partial write is invalidated.
    this.gateRevision++; this.latestFrame = null; this.pendingFixed = null; this.queue = [];
    if (resetCache) { this.lastWritten = []; }
  }
  private fail(error: OutputError): void {
    this.lastError = error; void this.closeConnection(error.code, true);
  }
  private async closeConnection(reason: string, fault: boolean): Promise<void> {
    const notifyOwner: boolean = this.connection === 'connected' || this.connection === 'connecting';
    this.clearGate(true);
    if (this.closeAttempt !== null) { await this.closeAttempt; return; }
    const actualGeneration: number | null = this.transportGeneration;
    this.generation++; const closedGeneration: number = this.generation;
    this.connection = fault ? 'fault' : 'disconnected'; this.closeConfirmed = false;
    // Notify only after this gate closes, before native cleanup or any await.
    // The application may synchronously revoke a shared manual-preview admission.
    if (notifyOwner) {
      try { this.onTerminalGateRevoked(); } catch { /* Cleanup must still retire this handle. */ }
    }
    const oldFlight: Flight | null = this.flight;
    if (oldFlight !== null && oldFlight.timeoutHandle !== null) { this.timers.cancel(oldFlight.timeoutHandle); }
    this.closing = true;
    const attempt: Promise<void> = this.performClose(reason, actualGeneration, closedGeneration, oldFlight).finally(() => {
      if (this.closeAttempt === attempt) { this.closeAttempt = null; }
    });
    this.closeAttempt = attempt; await attempt;
  }
  private async performClose(reason: string, actualGeneration: number | null, closedGeneration: number,
    oldFlight: Flight | null): Promise<void> {
    try {
      if (actualGeneration !== null) { await this.transport.close(reason, actualGeneration); }
      if (this.generation === closedGeneration) {
        // A cancelled open can still finish later. It must close the same handle
        // again before the app may claim confirmed close or connect another one.
        if (!this.pendingOpen && this.transportGeneration === actualGeneration) { this.transportGeneration = null; }
        this.closeConfirmed = this.transportGeneration === null && !this.pendingOpen && nativeTransportCanRelease(this.transport);
        this.closing = !this.closeConfirmed;
        if (this.closeConfirmed && this.flight === oldFlight) { this.flight = null; }
      }
    } catch (error) {
      if (this.generation === closedGeneration) {
        this.lastError = new OutputError('transportError', 'Close failed; device stop is unconfirmed: ' + OutputSession.errorText(error as Error));
        this.closeConfirmed = false; this.closing = true; this.connection = 'fault';
        // Retain actualGeneration, including when a native adapter holds a
        // permanent failure tombstone. A retry must never close a never-opened token.
      }
    }
  }
  private onTransportEvent(event: TransportEvent): void {
    if (event.connectionGeneration !== this.generation || this.disposed) { return; }
    if (event.kind === 'error' || event.kind === 'closed') {
      this.fail(new OutputError('transportError', event.detail === undefined ? 'Transport closed or failed.' : event.detail));
    }
    // Received bytes are deliberately not interpreted as controls. Input support is pending.
  }
  configurationDiagnostics(): string[] {
    const diagnostics: string[] = [];
    for (const range of this.config.axisRanges) {
      const diagnostic: string | null = rangeDiagnostic(range);
      if (diagnostic !== null) { diagnostics.push(range.axisId + ': ' + diagnostic); }
    }
    if (this.config.autoConnectPolicy === 'automaticRequested') {
      diagnostics.push('automaticConnectionPending: imported request retained; this stage requires explicit connect.');
    }
    if (this.config.allowPausedManual === true && this.config.updateContext.kind === 'polled') {
      diagnostics.push('pausedManualUnavailable: manual Transition emits no polled event; use fixed mode for paused manual output.');
    }
    return diagnostics;
  }
  snapshot(): OutputSessionSnapshot {
    if (this.sourceControl !== null) { this.controlLive(); }
    // sourceValid can expire retention using actual now. Evaluate it before
    // copying armed/state so one snapshot cannot straddle a timer boundary.
    const validFlight: boolean = this.flight !== null && this.sourceValid(this.flight.source);
    return { targetId: this.config.targetId, simulationOnly: this.transport.simulationOnly, connection: this.connection,
      connectionGeneration: this.generation, epoch: this.currentEpoch, profileRevision: this.config.protocolProfile.revision,
      armed: this.armed, dispatchSuspended: this.armed && this.latestFrame === null && this.queue.length === 0 &&
        !validFlight, seekPending: this.sourceSeek !== null,
      controlPending: this.sourceControl !== null && this.controlParkedUntil === null,
      controlParked: this.sourceControl !== null && this.controlParkedUntil !== null, foreground: this.foreground, mediaState: this.mediaState,
      inFlight: this.flight !== null, pendingFixed: this.pendingFixed !== null, queuedEvents: this.queue.length,
      completedLocalWrites: this.completedLocalWrites, locallyAcceptedBytes: this.locallyAcceptedBytes,
      writeCalls: this.writeCalls, droppedExpired: this.droppedExpired, coalescedFixed: this.coalescedFixed,
      lastWritten: this.lastWritten.map((value): OutputValue => ({ axisId: value.axisId, value: value.value })),
      lastErrorCode: this.lastError === null ? null : this.lastError.code,
      lastErrorDetail: this.lastError === null ? null : this.lastError.message, closeConfirmed: this.closeConfirmed && nativeTransportCanRelease(this.transport),
      configurationDiagnostics: this.configurationDiagnostics() };
  }
  private static errorText(error: Error): string { return error instanceof Error ? error.message : 'Unknown error'; }
  private static asError(error: Error): OutputError {
    return error instanceof OutputError ? error : new OutputError('transportError', OutputSession.errorText(error as Error));
  }
}
