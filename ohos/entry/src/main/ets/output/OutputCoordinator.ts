import { copyControlLease, sameControlLease } from './OutputControlContinuity';
import type { OutputControlLease } from './OutputControlContinuity';
import { OutputSession } from './OutputSession';
import type { OutputSessionSnapshot, MediaDispatchState, FrameAdmission } from './OutputSession';
import { copyConfig, projectOutputFrame, authorizedAxesMatch, copySeekTransition, sameSeekTransaction, copyManualPreviewAdmission } from './OutputTypes';
import type { AxisRange, OutputTargetConfig, OutputAdmissionPolicy, PipelineFrameSource, DispatchAuthorization, OutputTargetKind, OutputSeekTransition, ManualPreviewAdmission } from './OutputTypes';
import type { TransportPort } from './TransportPort';
import type { MonotonicClock, EventScheduler } from './UpdateContext';
import { releaseNativeTransport } from './NativeTransportAdmission';

export class OutputEndpoint {
  host: string = '';
  port: number = 0;
  family: 1 | 2 = 1;
  localPort: number = 0;
  scheme: 'ws' | 'wss' = 'ws';
  path: string = '/';
}
export interface OwnedOutputConnection { readonly requestId: number; readonly completion: Promise<boolean>; }
export interface OutputCapability { available: boolean; diagnostic: string; }
export interface OutputPortFactory {
  inspect(kind: OutputTargetKind): OutputCapability;
  create(config: OutputTargetConfig, endpoint: OutputEndpoint): TransportPort;
}
/** Supplied atomically by PlaybackSessionCore, never assembled from preview UI.
 * null authorization means provenance/clock/configuration is not current.
 */
export interface OutputSourceControl {
  readonly lease: OutputControlLease;
  readonly status: 'pending' | 'published' | 'cancelled';
  readonly paused: boolean;
  readonly frameCurrent: boolean;
  readonly packetSequence: number;
  readonly observedAtMs: number;
  readonly freshUntilMs: number;
  /** Full current scalar audit passed; retain-only, never frame authorization. */
  readonly pausedFrameKnown: boolean;
}
export interface OutputDispatchSource {
  readonly sourceControl?: OutputSourceControl | null;
  readonly frame: PipelineFrameSource;
  readonly authorization: DispatchAuthorization | null;
  readonly mediaState: MediaDispatchState;
  readonly foreground: boolean;
  readonly faulted: boolean;
  /** Missing means fail-closed on null authorization; pending never grants a new arm. */
  readonly availability?: 'ready' | 'pendingCurrentFrame' | 'invalidated';
  /** Required for trusted same-source seeks; absent legacy sources cannot hand off an arm. */
  readonly sourceIdentity?: string;
  readonly sourceGeneration?: number;
  readonly seekTransition?: OutputSeekTransition | null;
  /** Separate explicit-preview evidence. Never substitute this for frame authorization. */
  readonly manualPreviewAdmission?: ManualPreviewAdmission | null;
}
export interface OutputSourcePort {
  dispatchSource(enabledAxisNames?: ReadonlyArray<string>, updateKind?: 'fixed' | 'polled'): OutputDispatchSource;
  /** Application-level manual preview is shared by targets, unlike media output failures. */
  isManualPreviewActive?(): boolean;
  revokeManualPreview?(): void;
}

/** One owner, one target. No network work in construction, refresh or arm.
 * Changing configuration destroys the old session only after close confirmation.
 */
export class OutputCoordinator {
  private session: OutputSession | null = null;
  private transport: TransportPort | null = null;
  private config: OutputTargetConfig | null = null;
  private busy: boolean = false;
  private disposed: boolean = false;
  private foreground: boolean = true;
  private diagnostic: string = '';
  private applicationSequence: number = 0;
  private connectRequest: number = 0;
  private ownedConnectSequence: number = 0;
  private ownedConnectRequest: number = -1;
  private sourceSeek: OutputSeekTransition | null = null;
  private sourceControl: OutputControlLease | null = null;
  private sourceControlFrame: number = -1;
  private manualPreviewAdmission: ManualPreviewAdmission | null = null;
  private manualFrameSequence: number = -1;
  private armedSourceIdentity: string | undefined = undefined;
  private armedSourceGeneration: number | undefined = undefined;
  private terminalGateObserver: (() => void) | null = null;
  private readonly factory: OutputPortFactory;
  private readonly source: OutputSourcePort;
  private readonly policy: OutputAdmissionPolicy;
  private readonly clock: MonotonicClock;
  private readonly timers: EventScheduler;
  constructor(factory: OutputPortFactory, source: OutputSourcePort, policy: OutputAdmissionPolicy, clock: MonotonicClock, timers: EventScheduler) {
    this.factory = factory; this.source = source; this.policy = policy; this.clock = clock; this.timers = timers;
  }
  /** Installed by the application owner, never by preview/UI frame data. */
  setTerminalGateObserver(observer: () => void): void { this.terminalGateObserver = observer; }
  inspect(kind: OutputTargetKind): OutputCapability { return this.factory.inspect(kind); }
  status(): OutputSessionSnapshot | null { return this.session === null ? null : this.session.snapshot(); }
  message(): string { return this.diagnostic; }
  isBusy(): boolean { return this.busy; }
  appliedConfigurationId(): number { return this.session !== null && this.session.snapshot().connection === 'connected' ? this.applicationSequence : 0; }
  configuration(): OutputTargetConfig | null { return this.config === null ? null : copyConfig(this.config); }
  updateRanges(ranges: ReadonlyArray<AxisRange>, expectedApplicationId: number): boolean {
    if (this.session === null || this.config === null || this.busy || this.disposed || !this.foreground ||
      expectedApplicationId <= 0 || expectedApplicationId !== this.appliedConfigurationId() || this.sourceSeek !== null || this.sourceControl !== null) { return false; }
    const source = this.source.dispatchSource(this.enabledAxes(), this.config.updateContext.kind);
    if (!source.foreground || source.faulted || source.frame.profileRevision !== this.config.protocolProfile.revision) { return false; }
    this.synchronize(source);
    if (!this.session.updateRanges(ranges, source.frame.epoch, source.frame.sequence)) { return false; }
    this.config = { ...copyConfig(this.config), axisRanges: ranges.map(range => ({ axisId: range.axisId, minimum: range.minimum, maximum: range.maximum, enabled: range.enabled })) };
    this.applicationSequence++; this.diagnostic = '范围已更新，等待新的真实来源帧；未自动启用发送。';
    return true;
  }
  connect(config: OutputTargetConfig, endpoint: OutputEndpoint): Promise<boolean> {
    return this.connectInternal(config, endpoint, -1);
  }
  /** A shortcut owns only this operation, never a later manual connection. */
  connectOwned(config: OutputTargetConfig, endpoint: OutputEndpoint): OwnedOutputConnection {
    const requestId = ++this.ownedConnectSequence;
    return { requestId, completion: this.connectInternal(config, endpoint, requestId) };
  }
  releaseOwnedConnection(requestId: number): void { if (this.ownedConnectRequest === requestId) { this.ownedConnectRequest = -1; } }
  cancelOwnedConnection(requestId: number): void {
    if (this.ownedConnectRequest !== requestId) { return; }
    const session = this.session;
    this.disarm();
    if (session !== null) { void session.disconnect('cancelled shortcut connection'); }
  }
  private async connectInternal(config: OutputTargetConfig, endpoint: OutputEndpoint, ownedRequest: number): Promise<boolean> {
    if (this.disposed || this.busy || !this.foreground || !this.source.dispatchSource(config.axisRanges.filter(range => range.enabled).map(range => range.axisId), config.updateContext.kind).foreground) { return false; }
    this.ownedConnectRequest = ownedRequest;
    this.sourceSeek = null; this.sourceControl = null; this.clearManualPreview(); this.armedSourceIdentity = undefined; this.armedSourceGeneration = undefined;
    const request: number = ++this.connectRequest;
    this.busy = true; this.diagnostic = '';
    try {
      if (this.session !== null) {
        await this.session.disconnect('replace target');
        if (!this.connectIsCurrent(request, config)) { return false; }
        if (!this.session.snapshot().closeConfirmed) { this.diagnostic = 'Previous connection close is unconfirmed. Restart the app before replacing it.'; return false; }
        await this.session.dispose();
        if (!this.connectIsCurrent(request, config)) { return false; }
        if (!this.session.snapshot().closeConfirmed) { this.diagnostic = 'Previous connection close is unconfirmed. Restart the app before replacing it.'; return false; }
        if (this.transport !== null && !releaseNativeTransport(this.transport)) {
          this.diagnostic = 'Previous native handle remains quarantined. Restart the app before replacing it.'; return false;
        }
        this.session = null; this.transport = null; this.config = null;
      }
      if (!this.connectIsCurrent(request, config)) { return false; }
      const capability: OutputCapability = this.factory.inspect(config.kind);
      if (!capability.available) { this.diagnostic = capability.diagnostic; return false; }
      this.transport = this.factory.create(config, endpoint);
      const session: OutputSession = new OutputSession(config, this.policy, this.transport, this.clock, this.timers, () => {
        // A retired session must not revoke a newer preview or replacement connection.
        if (this.session !== session) { return; }
        this.clearManualPreview(); this.armedSourceIdentity = undefined; this.armedSourceGeneration = undefined;
        if (this.terminalGateObserver !== null) { this.terminalGateObserver(); }
      });
      this.session = session;
      this.config = copyConfig(config);
      this.session.setForeground(this.foreground);
      const connectingSession: OutputSession = this.session;
      const connected = await connectingSession.connect();
      if (!this.connectIsCurrent(request, config) || this.session !== connectingSession) {
        await connectingSession.disconnect('cancelled connection request'); return false;
      }
      if (connected) { this.applicationSequence++; }
      return connected;
    } catch {
      // Never expose endpoint/credentials/native exception strings to UI or logs.
      this.diagnostic = 'Output configuration or connection failed. Check the explicit endpoint and supported settings.';
      if (this.transport !== null && this.session === null && releaseNativeTransport(this.transport)) { this.transport = null; }
      return false;
    } finally { this.busy = false; }
  }
  private connectIsCurrent(request: number, config: OutputTargetConfig): boolean {
    return request === this.connectRequest && !this.disposed && this.foreground &&
      this.source.dispatchSource(config.axisRanges.filter(range => range.enabled).map(range => range.axisId), config.updateContext.kind).foreground;
  }
  /** Revocation survives a later foreground return or another UI selection. */
  private cancelConnect(): void {
    this.ownedConnectRequest = -1; this.connectRequest++;
    if (this.busy && this.session !== null) { void this.session.disconnect('cancelled connection request'); }
  }
  private enabledAxes(): string[] {
    return this.config === null ? [] : this.config.axisRanges.filter(range => range.enabled).map(range => range.axisId);
  }
  arm(): boolean {
    if (this.session === null || this.busy) { return false; }
    const source: OutputDispatchSource = this.source.dispatchSource(this.enabledAxes(), this.config === null ? 'fixed' : this.config.updateContext.kind);
    if (this.sourceSeek !== null && !this.session.snapshot().seekPending) { this.sourceSeek = null; this.sourceControl = null; }
    if (this.sourceSeek !== null || this.sourceControl !== null) { return false; }
    if (source.seekTransition?.status === 'pending' || source.sourceControl?.status === 'pending') { this.disarm(); return false; }
    this.synchronize(source);
    this.manualPreviewAdmission = null; this.manualFrameSequence = -1;
    const preview: ManualPreviewAdmission | null | undefined = source.manualPreviewAdmission;
    if (preview !== null && preview !== undefined && this.manualAdmissionValid(source)) {
      const armed: boolean = this.session.arm(preview.epoch, preview.profileRevision);
      if (armed) {
        this.manualPreviewAdmission = copyManualPreviewAdmission(preview);
        this.armedSourceIdentity = source.sourceIdentity; this.armedSourceGeneration = source.sourceGeneration;
        // Explicit Arm remembers intent only. Even an already-ready frame must
        // be admitted again by refresh before the fixed scheduler can use it.
        this.session.suspendCandidates(); this.diagnostic = '待命，无输出：等待真实手动过渡当前帧。';
      }
      return armed;
    }
    if ((source.authorization !== null && source.authorization.intents.indexOf('pausedManual') >= 0 &&
      (this.config === null || this.config.allowPausedManual !== true || this.config.updateContext.kind !== 'fixed' ||
        (source.manualPreviewAdmission !== undefined && !this.manualAdmissionValid(source)))) ||
      (source.availability !== undefined && source.availability !== 'ready') || source.authorization === null || this.config === null || source.authorization.updateKind !== this.config.updateContext.kind || !authorizedAxesMatch(source.authorization.authorizedAxes, this.enabledAxes()) || source.faulted || !source.foreground || source.mediaState === 'stopped') {
      this.session.disarm();
      this.diagnostic = 'No current authorized playback frame. Start playback or an explicitly allowed paused source first.'; return false;
    }
    this.diagnostic = '';
    const armed: boolean = this.session.arm(source.frame.epoch, source.frame.profileRevision);
    if (armed) { this.armedSourceIdentity = source.sourceIdentity; this.armedSourceGeneration = source.sourceGeneration; }
    return armed;
  }
  private clearManualPreview(): void {
    if (this.manualPreviewAdmission !== null) { this.diagnostic = ''; }
    this.manualPreviewAdmission = null; this.manualFrameSequence = -1;
  }
  private manualAdmissionValid(source: OutputDispatchSource): boolean {
    const preview: ManualPreviewAdmission | null | undefined = source.manualPreviewAdmission;
    return preview !== undefined && preview !== null && this.config !== null &&
      this.config.updateContext.kind === 'fixed' && this.config.allowPausedManual === true &&
      this.foreground && source.foreground && !this.disposed && !source.faulted && source.mediaState === 'paused' &&
      source.availability !== 'invalidated' && source.seekTransition?.status !== 'pending' &&
      typeof source.sourceIdentity === 'string' && source.sourceIdentity.length > 0 &&
      source.sourceGeneration !== undefined && Number.isSafeInteger(source.sourceGeneration) && source.sourceGeneration >= 0 &&
      Number.isSafeInteger(preview.epoch) && preview.epoch >= 0 && preview.epoch === source.frame.epoch &&
      Number.isSafeInteger(preview.profileRevision) && preview.profileRevision === source.frame.profileRevision &&
      preview.profileRevision === this.config.protocolProfile.revision &&
      Number.isSafeInteger(preview.admissionRevision) && preview.admissionRevision >= 0 &&
      authorizedAxesMatch(preview.authorizedAxes, this.enabledAxes());
  }
  /** A held/unknown initial scalar cannot send. The explicit preview admission
   * merely keeps this user's bound Arm intent alive until a real transition. */
  private refreshManualPreview(source: OutputDispatchSource): FrameAdmission {
    if (this.session === null || this.manualPreviewAdmission === null) { return 'ignored'; }
    const captured: ManualPreviewAdmission = this.manualPreviewAdmission;
    const preview: ManualPreviewAdmission | null | undefined = source.manualPreviewAdmission;
    const current: OutputSessionSnapshot = this.session.snapshot();
    if (!current.armed || current.connection !== 'connected' || !this.manualAdmissionValid(source) ||
      preview === undefined || preview === null || preview.epoch !== captured.epoch ||
      preview.profileRevision !== captured.profileRevision || preview.admissionRevision !== captured.admissionRevision ||
      !authorizedAxesMatch(preview.authorizedAxes, captured.authorizedAxes) ||
      source.sourceIdentity !== this.armedSourceIdentity || source.sourceGeneration !== this.armedSourceGeneration) {
      this.disarm(); return 'ignored';
    }
    if (source.authorization === null) {
      this.session.suspendCandidates();
      if (!this.session.snapshot().armed) { this.disarm(); }
      else { this.diagnostic = '待命，无输出：等待真实手动过渡当前帧。'; }
      return 'ignored';
    }
    if ((source.availability !== undefined && source.availability !== 'ready') ||
      source.authorization.intents.indexOf('pausedManual') < 0 || source.authorization.updateKind !== 'fixed' ||
      source.authorization.clockKind !== 'monotonic') { this.disarm(); return 'ignored'; }
    const admission: FrameAdmission = this.session.submitFrame(projectOutputFrame(source.frame), source.authorization);
    if (admission === 'accepted') { this.manualFrameSequence = source.frame.sequence; this.diagnostic = ''; }
    else if (admission === 'rejected' || source.frame.sequence !== this.manualFrameSequence) { this.disarm(); }
    return admission;
  }
  disarm(): void { this.cancelConnect(); this.sourceSeek = null; this.sourceControl = null; this.clearManualPreview(); this.armedSourceIdentity = undefined; this.armedSourceGeneration = undefined; if (this.session !== null) { this.session.disarm(); } }
  stop(): void { this.cancelConnect(); this.sourceSeek = null; this.sourceControl = null; this.clearManualPreview(); this.armedSourceIdentity = undefined; this.armedSourceGeneration = undefined; if (this.session !== null) { this.session.stop(); } }
  /** Call immediately after core.beginSeek(), before starting asynchronous seek.
   * A pending snapshot observed only through refresh cannot capture intent. */
  beginSourceSeek(): boolean {
    if (this.sourceControl !== null) { this.disarm(); return false; }
    if (this.manualPreviewAdmission !== null) { this.disarm(); return false; }
    if (this.session === null || this.config === null || this.busy || this.disposed) { return false; }
    const source: OutputDispatchSource = this.source.dispatchSource(this.enabledAxes(), this.config.updateContext.kind);
    const transition: OutputSeekTransition | null | undefined = source.seekTransition;
    if (transition === undefined || transition === null || transition.status !== 'pending' ||
      !this.foreground || !source.foreground || source.faulted || source.mediaState === 'stopped' ||
      source.sourceIdentity === undefined || source.sourceIdentity !== this.armedSourceIdentity ||
      source.sourceGeneration === undefined || source.sourceGeneration !== this.armedSourceGeneration ||
      source.sourceIdentity !== transition.sourceIdentity || source.sourceGeneration !== transition.sourceGeneration ||
      source.frame.profileRevision !== transition.profileRevision) { this.disarm(); return false; }
    if (this.sourceSeek !== null) {
      const now: number = this.clock.nowMs();
      if (!this.session.snapshot().seekPending || !Number.isFinite(now) || now < 0 || now >= this.sourceSeek.deadlineMonotonicMs) {
        this.disarm(); return false;
      }
      if (transition.requestId <= this.sourceSeek.requestId) {
        if (transition.requestId === this.sourceSeek.requestId && !sameSeekTransaction(this.sourceSeek, transition)) { this.disarm(); }
        return false;
      }
    }
    if (!this.session.beginSourceSeek(transition)) { if (!this.session.snapshot().seekPending) { this.sourceSeek = null; this.sourceControl = null; } return false; }
    this.sourceSeek = copySeekTransition(transition); return true;
  }
  /** Capture only existing explicit Arm, synchronously before command dispatch. */
  beginSourceControl(): boolean {
    if (this.session === null || this.config === null || this.busy || this.disposed || this.sourceSeek !== null || this.manualPreviewAdmission !== null) { return false; }
    const source = this.source.dispatchSource(this.enabledAxes(), this.config.updateContext.kind);
    const proof = source.sourceControl;
    if (proof === undefined || proof === null || proof.status !== 'pending' || !this.foreground || !source.foreground || source.faulted ||
      source.mediaState === 'stopped' || source.sourceIdentity !== this.armedSourceIdentity || source.sourceGeneration !== this.armedSourceGeneration ||
      proof.lease.sourceIdentity !== source.sourceIdentity || proof.lease.sourceGeneration !== source.sourceGeneration ||
      proof.lease.epoch !== source.frame.epoch || proof.lease.profileRevision !== source.frame.profileRevision) { this.disarm(); return false; }
    if (!this.session.beginSourceControl(proof.lease)) { this.sourceControl = null; return false; }
    if (!this.session.renewSourceControl(proof.lease, proof.freshUntilMs)) { this.disarm(); return false; }
    this.sourceControl = copyControlLease(proof.lease); this.sourceControlFrame = -1;
    this.diagnostic = '等待远端后续状态与新帧；保留既有 Arm，当前无输出。';
    return true;
  }
  private refreshSourceControl(source: OutputDispatchSource): FrameAdmission {
    if (this.session === null || this.sourceControl === null || this.config === null) { return 'ignored'; }
    const captured = this.sourceControl; const proof = source.sourceControl; const current = this.session.snapshot();
    const now = this.clock.nowMs();
    if (!current.armed || current.connection !== 'connected' || (!current.controlPending && !current.controlParked) ||
      !this.foreground || !source.foreground || source.faulted || source.mediaState === 'stopped' ||
      source.sourceIdentity !== captured.sourceIdentity || source.sourceGeneration !== captured.sourceGeneration ||
      source.frame.epoch !== captured.epoch || source.frame.profileRevision !== captured.profileRevision ||
      !Number.isFinite(now) || now < 0 || (!current.controlParked && now >= captured.deadlineMonotonicMs) ||
      proof === undefined || proof === null || !sameControlLease(captured, proof.lease) || proof.status === 'cancelled' ||
      proof.observedAtMs < 0 || proof.observedAtMs > now || now - proof.observedAtMs >= 750 ||
      !Number.isFinite(proof.freshUntilMs) || now >= proof.freshUntilMs || proof.freshUntilMs > now + 750) { this.disarm(); return 'ignored'; }
    if (proof.status === 'pending') {
      if (current.controlPending && !this.session.renewSourceControl(captured, proof.freshUntilMs)) { this.disarm(); return 'ignored'; }
      this.session.suspendCandidates();
      this.diagnostic = '等待远端后续状态与新帧；保留既有 Arm，当前无输出。'; return 'ignored';
    }
    if (proof.status === 'published' && !proof.frameCurrent && source.availability === 'pendingCurrentFrame') { this.session.suspendCandidates(); return 'ignored'; }
    if (source.frame.sequence <= captured.startFrameSequence || source.availability === 'invalidated') { this.disarm(); return 'ignored'; }
    this.session.setMediaState(source.mediaState);
    if (proof.paused) {
      if (source.mediaState !== 'paused' || !proof.pausedFrameKnown) { this.disarm(); return 'ignored'; }
      if (current.controlParked && source.frame.sequence === this.sourceControlFrame) { return 'ignored'; }
      const authorization = source.authorization;
      const permitted = authorization !== null &&
        !(authorization.intents.indexOf('pausedAutoHome') >= 0 && !this.config.allowPausedAutoHome) &&
        !(authorization.intents.indexOf('pausedMotion') >= 0 && !this.config.allowPausedMotion);
      const renewed = current.controlParked && permitted ? this.session.renewParkedSourceControl(captured, proof.freshUntilMs) :
        this.session.parkSourceControl(captured, proof.freshUntilMs);
      if (!renewed) { this.disarm(); return 'ignored'; }
      this.sourceControlFrame = source.frame.sequence;
      this.diagnostic = '暂停待命，无输出；继续播放需新的明确播放操作与状态观测。';
      if (!permitted || authorization === null) { return 'ignored'; }
      const admission = this.session.submitSourceControlFrame(captured, projectOutputFrame(source.frame), authorization);
      if (admission === 'accepted') { this.diagnostic = '保留既有 Arm：仅发送已许可的当前暂停活动。'; }
      return admission;
    }
    if (source.mediaState !== 'playing' || source.authorization === null || source.availability !== 'ready') {
      if (source.availability === 'pendingCurrentFrame') { this.session.suspendCandidates(); return 'ignored'; }
      this.disarm(); return 'ignored';
    }
    const admission = this.session.completeSourceControl(captured, projectOutputFrame(source.frame), source.authorization);
    if (!this.session.snapshot().controlPending) { this.sourceControl = null; this.diagnostic = ''; }
    return admission;
  }
  private refreshSourceSeek(source: OutputDispatchSource): FrameAdmission {
    if (this.session === null || this.sourceSeek === null) { return 'ignored'; }
    const captured: OutputSeekTransition = this.sourceSeek;
    const current: OutputSessionSnapshot = this.session.snapshot();
    const transition: OutputSeekTransition | null | undefined = source.seekTransition;
    const now: number = this.clock.nowMs();
    if (!this.foreground || !source.foreground) { this.session.setForeground(false); }
    if (source.faulted || source.mediaState === 'stopped') { this.session.stop(); }
    if (!current.armed || !current.seekPending || current.connection !== 'connected' ||
      !this.foreground || !source.foreground || source.faulted || source.mediaState === 'stopped' ||
      source.sourceIdentity !== captured.sourceIdentity || source.sourceGeneration !== captured.sourceGeneration ||
      source.frame.profileRevision !== captured.profileRevision || !Number.isFinite(now) || now < 0 || now >= captured.deadlineMonotonicMs ||
      transition === null || transition === undefined) { this.disarm(); return 'ignored'; }
    // A late confirmation cannot complete or revoke a newer explicit transaction.
    if (transition.requestId < captured.requestId) { return 'ignored'; }
    if (!sameSeekTransaction(captured, transition) || transition.status === 'cancelled') { this.disarm(); return 'ignored'; }
    if (transition.status === 'pending') {
      if (source.frame.epoch > transition.currentEpoch) { this.disarm(); }
      return 'ignored';
    }
    if (transition.status !== 'confirmed' || source.frame.epoch > transition.currentEpoch ||
      !this.session.confirmSourceSeek(transition)) { this.disarm(); return 'ignored'; }
    this.sourceSeek = copySeekTransition(transition);
    // Confirmation and publication of its first complete source frame are separate.
    // Never retag the previous frame, even if its numeric value looks plausible.
    if (source.frame.epoch < transition.currentEpoch ||
      (source.availability === 'pendingCurrentFrame' && source.authorization === null)) { return 'ignored'; }
    if (source.availability !== 'ready' || source.authorization === null) { this.disarm(); return 'ignored'; }
    this.session.setMediaState(source.mediaState);
    const admission: FrameAdmission = this.session.completeSourceSeek(transition, projectOutputFrame(source.frame), source.authorization);
    if (!this.session.snapshot().seekPending) { this.sourceSeek = null; this.sourceControl = null; }
    return admission;
  }
  setForeground(value: boolean): void {
    this.foreground = value;
    if (!value) { this.cancelConnect(); this.sourceSeek = null; this.sourceControl = null; this.clearManualPreview(); this.armedSourceIdentity = undefined; this.armedSourceGeneration = undefined; }
    if (this.session !== null) { this.session.setForeground(value); }
  }
  private synchronize(source: OutputDispatchSource): void {
    if (this.session === null) { return; }
    const current: OutputSessionSnapshot = this.session.snapshot();
    // Old source callbacks cannot invalidate a newer session or lower its epoch.
    if (source.frame.epoch < current.epoch || source.frame.profileRevision < current.profileRevision) { return; }
    if (this.armedSourceIdentity !== undefined && (source.sourceIdentity !== this.armedSourceIdentity ||
      source.sourceGeneration !== this.armedSourceGeneration)) { this.disarm(); }
    this.session.setForeground(this.foreground && source.foreground);
    if (source.faulted) { this.session.stop(); return; }
    if (source.frame.epoch > current.epoch) { this.session.invalidateEpoch(source.frame.epoch); }
    if (source.frame.profileRevision !== current.profileRevision) { this.session.disarm(); }
    this.session.setMediaState(source.mediaState);
  }
  /** Call after a complete session tick, and immediately after stop/seek/error changes. */
  refresh(): FrameAdmission {
    if (this.session === null) { return 'ignored'; }
    const source: OutputDispatchSource = this.source.dispatchSource(this.enabledAxes(), this.config === null ? 'fixed' : this.config.updateContext.kind);
    if (this.sourceControl !== null) { return this.refreshSourceControl(source); }
    if (source.sourceControl?.status === 'pending') { this.disarm(); return 'ignored'; }
    if (this.manualPreviewAdmission !== null) { return this.refreshManualPreview(source); }
    if (this.sourceSeek !== null) { return this.refreshSourceSeek(source); }
    if (source.seekTransition?.status === 'pending') { this.disarm(); return 'ignored'; }
    this.synchronize(source);
    const current: OutputSessionSnapshot = this.session.snapshot();
    if (source.frame.epoch < current.epoch || source.frame.profileRevision < current.profileRevision) { return 'ignored'; }
    if (source.faulted || source.availability === 'invalidated') { this.session.disarm(); return 'ignored'; }
    if (source.authorization === null) {
      if (source.availability === 'pendingCurrentFrame' && source.foreground && this.foreground &&
        source.mediaState !== 'stopped' && source.frame.epoch === current.epoch &&
        source.frame.profileRevision === current.profileRevision) { this.session.suspendCandidates(); }
      else { this.session.disarm(); }
      return 'ignored';
    }
    if (source.availability === 'pendingCurrentFrame') { this.session.disarm(); return 'ignored'; }
    return this.session.submitFrame(projectOutputFrame(source.frame), source.authorization);
  }
  async disconnect(): Promise<void> { this.cancelConnect(); this.sourceSeek = null; this.sourceControl = null; this.clearManualPreview(); this.armedSourceIdentity = undefined; this.armedSourceGeneration = undefined; if (this.session !== null) { await this.session.disconnect(); } }
  async dispose(): Promise<void> {
    this.cancelConnect(); this.disposed = true; this.sourceSeek = null; this.sourceControl = null; this.clearManualPreview(); this.armedSourceIdentity = undefined; this.armedSourceGeneration = undefined;
    if (this.session !== null) { await this.session.dispose(); }
    if (this.transport !== null && this.session !== null && this.session.snapshot().closeConfirmed) { releaseNativeTransport(this.transport); }
  }
}
