import { ContinuousInputConfiguration, ContinuousInputAction, validateContinuousAction } from '../input/ContinuousInputConfiguration';
import { ContinuousGestureData } from '../input/ContinuousDriveEngine';
import { applyContinuousMotion, continuousValue } from '../input/ContinuousInputActions';
import { RemoteMediaClock } from './RemoteMediaClock';
import { DeoVrControlEvidence } from '../media/deovr/DeoVrControlEvidence';
import type { DeoVrControlRequest } from '../media/deovr/DeoVrControlEvidence';
import { sameDeoVrObservationSource } from '../media/deovr/DeoVrMediaSource';
import type { OutputControlLease } from '../output/OutputControlContinuity';
import type { OutputSourceControl } from '../output/OutputCoordinator';
import type { DeoVrSnapshot, DeoVrEvent, DeoVrDispatchBoundary } from '../media/deovr/DeoVrTypes';
import { MediaSourceConfiguration } from '../settings/MediaSourceConfiguration';
import { PointCanvasEffects, PointCanvasGeometry, PointCanvasEffectResult } from './PointCanvasEffects';
import type { PointCanvasEvent } from './PointCanvasEffects';
import { KeyboardShortcutConfiguration } from '../input/ShortcutConfiguration';
import { GeneralConfiguration } from '../settings/GeneralConfiguration';
import { OutputConfiguration } from '../settings/OutputConfiguration';
import { DeviceAxisDefinition, DeviceProfile, DeviceProfiles } from './DeviceProfile';
import { AxisConfiguration, AxisConfigurationEntry, SyncConfiguration } from './AxisConfiguration';
import { AxisPipeline, AxisPipelineConfiguration, AxisStepInput } from './AxisPipeline';
import { AxisFrame, AxisSourceOrigin } from './AxisState';
import { AxisBookmark, AxisChapter, AxisKeyframe, AxisKeyframes, AxisScriptBinding, AxisScriptResource, AxisScriptStore } from './AxisScriptStore';
import { MotionRegistry } from './motion/MotionRegistry';
import { AxisMotionConfiguration, DeviceMotionConfiguration, MotionConfigurations, MotionProviderConfiguration, MotionCurvePoint } from './MotionConfiguration';
import { AppConfiguration, DeviceAxisConfiguration, PlaybackConfiguration, SettingsSchema } from '../settings/SettingsSchema';
import { FunscriptAction, FunscriptAxis, FunscriptDocument, FunscriptParser, FunscriptMetadata, FunscriptChapter, FunscriptBookmark } from './Funscript';
import { MediaClockSnapshot } from './MediaClock';
import { MediaPositionTracker } from './MediaPositionTracker';
import { MediaLoopControls, AutoSkipToScriptStart } from './playback/MediaControls';
import { AxisSample, AxisScriptSettings, PlaybackSnapshot } from './PlaybackEngine';
import type { PlaybackState } from './PlaybackEngine';
import type { InterpolationMode } from './Interpolation';
import type { OutputDispatchSource } from '../output/OutputCoordinator';
import type { DispatchAuthorization, DispatchIntent, PipelineFrameSource, OutputSeekTransition, ManualPreviewAdmission } from '../output/OutputTypes';

/** One immutable, ordered active profile shared by matching, parsing, UI and pipeline. */
export class DeviceRegistry {
  readonly profile: DeviceProfile;
  readonly axes: DeviceAxisDefinition[];
  readonly revision: number;
  constructor(profile: DeviceProfile, revision: number) {
    this.profile = DeviceProfiles.copy(profile); this.axes = DeviceProfiles.enabledAxes(profile); this.revision = revision;
    for (const axis of this.profile.axes.concat(this.axes)) { Object.freeze(axis.funscriptNames); Object.freeze(axis); }
    Object.freeze(this.profile.axes); Object.freeze(this.profile); Object.freeze(this.axes); Object.freeze(this);
  }
}

class MotionCanvasBinding {
  readonly owner: number; readonly axisName: string; readonly profileRevision: number;
  readonly width: number; readonly height: number;
  constructor(owner: number, axisName: string, profileRevision: number, width: number, height: number) {
    this.owner = owner; this.axisName = axisName; this.profileRevision = profileRevision;
    this.width = width; this.height = height;
  }
}

/** Session policy and configuration adapter, with no ArkUI, native IO or physical transport.
 * Runtime state is deliberately excluded from persisted settings. */
export class PlaybackSessionCore {
  protected configuration: AppConfiguration;
  private registry: DeviceRegistry;
  private pipelineConfiguration: AxisPipelineConfiguration;
  private activeSettings: AxisConfigurationEntry[];
  private activeMotionSettings: DeviceMotionConfiguration;
  private pipeline: AxisPipeline;
  private motion: MotionRegistry;
  private motionCanvas: MotionCanvasBinding | null = null;
  private latestMotionCanvasOwner: number = 0;
  private scripts: AxisScriptStore;
  private discovered: AxisScriptBinding[] = [];
  private scriptReloadSequence: number = 0;
  private scriptReloadToken: number = 0;
  private scriptReloadAxes: string[] = [];
  private scriptReloadKind: 'axis' | 'looping' = 'axis';
  private scriptReloadEpoch: number = -1;
  private scriptReloadProfile: number = -1;
  private scriptReloadSource: number = -1;
  private scriptReloadConfiguration: number = -1;
  private scriptReloadControl: number = -1;
  private tracker: MediaPositionTracker = new MediaPositionTracker();
  private document: FunscriptDocument = new FunscriptDocument([]);
  private state: PlaybackState = 'stopped';
  private processingEnabled: boolean = false;
  private standaloneMotionActive: boolean = false;
  private manualPreviewActive: boolean = false;
  private manualCommandCount: number = 0;
  private speed: number = 1;
  private externalClock: boolean = false;
  private internalSourceClock: boolean = false;
  private remoteSourceClock: boolean = false;
  private remoteSourceKind: 'deovr' | 'heresphere' = 'deovr';
  private remoteClock: RemoteMediaClock = new RemoteMediaClock();
  private remoteBindingsPending: boolean = false;
  private remoteEventSequence: number = -1;
  private remoteSnapshot: DeoVrSnapshot | null = null;
  private remoteControl: DeoVrControlEvidence | null = null;
  private remoteControlLease: OutputControlLease | null = null;
  private remoteControlSequence: number = 0;
  private remoteControlConfiguration: number = -1;
  private remoteControlPublished: boolean = false;
  private remoteControlPaused: boolean = false;
  private remoteControlNow: number = 0;
  private publishedRemotePacket: number = -1;
  private publishedRemoteControl: number = -1;
  private publishedRemoteGeneration: number = -1;
  private publishedRemoteResource: number = -1;
  private publishedRemoteObservedAt: number = -1;
  private sourceIdentity: string = 'preview';
  private sourceGeneration: number = 1;
  private seekRequestId: number = 0;
  private seekTransition: OutputSeekTransition | null = null;
  private seekNativeGeneration: number = -1;
  private seekNativeSequence: number = -1;
  private nativeDurationGeneration: number = -1;
  private nativeDurationValue: number = -1;
  readonly mediaLoop: MediaLoopControls = new MediaLoopControls();
  readonly autoSkip: AutoSkipToScriptStart = new AutoSkipToScriptStart();
  private mediaSeekRequests: number[] = [];
  private mediaDurationMs: number = 0;
  private foreground: boolean = true;
  private connected: boolean = false;
  private armed: boolean = false;
  private nativeGate: boolean = false;
  private nativeSourceAdmission: boolean = false;
  private nativeReadyForPaused: boolean = false;
  private nativePlaying: boolean = false;
  private dispatchControlRevision: number = 0;
  private publishedDispatchControlRevision: number = -1;
  private publishedNativeGeneration: number = -1;
  private publishedNativeObservedAt: number = -1;
  private pendingNativePlay: boolean = false;
  private nativeGeneration: number = -1;
  private nativeObservation: number = -1;
  private nativeSeek: number = -1;
  private nativeObservedAt: number = -1;
  private epoch: number = 1;
  private monotonicMs: number = 0;
  private failure: string = '';
  private configurationRevision: number = 0;
  private publishedConfigurationRevision: number = -1;
  private displayedBindings: AxisScriptBinding[] = [];
  private displayedDocument: FunscriptDocument = new FunscriptDocument([]);
  private onConfigurationChanged: (() => void) | null = null;

  constructor(configuration: AppConfiguration = SettingsSchema.defaults()) {
    this.configuration = SettingsSchema.clone(configuration);
    this.applyPlaybackPreferences();
    this.registry = new DeviceRegistry(this.configuration.devices.find(profile => profile.id === this.configuration.selectedDeviceId)!, 1);
    this.activeSettings = this.configuration.axisSettingsByDevice.find(device => device.deviceId === this.registry.profile.id)!.axes;
    this.activeMotionSettings = this.configuration.motionSettingsByDevice.find(device => device.deviceId === this.registry.profile.id)!;
    this.pipelineConfiguration = this.makePipelineConfiguration();
    this.motion = this.makeMotion();
    this.pipeline = new AxisPipeline(this.pipelineConfiguration, this.motion, this.epoch);
    this.scripts = new AxisScriptStore(this.registry.axes.map(axis => axis.name), this.pipelineConfiguration.axisSettings);
  }
  activeRegistry(): DeviceRegistry { return this.registry; }
  mediaSourceConfiguration(): MediaSourceConfiguration { return MediaSourceConfiguration.clone(this.configuration.mediaSources); }
  changeMediaSourceConfiguration(value: MediaSourceConfiguration): void {
    this.assertConfigurationWritable(); const next = MediaSourceConfiguration.clone(value);
    if (JSON.stringify(next) === JSON.stringify(this.configuration.mediaSources)) { return; }
    this.configuration.mediaSources = next;
    if (this.onConfigurationChanged !== null) { this.onConfigurationChanged(); }
  }
  playbackConfiguration(): PlaybackConfiguration { return PlaybackConfiguration.clone(this.configuration.playback); }
  changePlaybackConfiguration(value: PlaybackConfiguration): void {
    this.assertConfigurationWritable(); const next = PlaybackConfiguration.clone(value);
    if (JSON.stringify(next) === JSON.stringify(this.configuration.playback)) { return; }
    this.configuration.playback = next;
    this.applyPlaybackPreferences(); this.changed();
  }
  private applyPlaybackPreferences(): void {
    this.autoSkip.enabled = this.configuration.playback.autoSkipEnabled;
    this.autoSkip.offsetSeconds = this.configuration.playback.autoSkipOffsetSeconds;
  }
  private sourceChanged(identity: string, resetMediaControls: boolean = true): void {
    this.cancelScriptReload(); this.cancelSourceSeek(); this.processingEnabled = false; this.standaloneMotionActive = false; this.manualPreviewActive = false; this.nativeSourceAdmission = false; this.sourceIdentity = identity; this.sourceGeneration++;
    if (resetMediaControls) { this.mediaLoop.clear(); this.autoSkip.cancel(); this.mediaSeekRequests = []; }
  }
  cancelSourceSeek(): void {
    this.cancelDeoVrControl();
    if (this.seekTransition !== null && this.seekTransition.status !== 'cancelled') {
      this.seekTransition = Object.freeze({ ...this.seekTransition, status: 'cancelled' });
    }
  }
  sourceSeekSnapshot(): OutputSeekTransition | null { return this.seekTransition; }
  private confirmSourceSeek(): void {
    const seek = this.seekTransition;
    if (seek === null || seek.status !== 'pending' || seek.sourceIdentity !== this.sourceIdentity ||
      seek.sourceGeneration !== this.sourceGeneration || this.monotonicMs >= seek.deadlineMonotonicMs ||
      !this.foreground || !this.connected || this.failure.length > 0) { this.cancelSourceSeek(); return; }
    this.seekTransition = Object.freeze({ ...seek, currentEpoch: this.epoch, status: 'confirmed' });
  }
  mediaPositionSeconds(): number { return this.tracker.snapshot(); }
  mediaDurationSeconds(): number { return this.externalClock || this.internalSourceClock || this.remoteSourceClock ? this.mediaDurationMs / 1000 : this.document.durationMs / 1000; }
  axisKeyframes(): (AxisKeyframe[] | null)[] { return this.bindings().map(binding => binding.resource === null ? null : binding.resource.keyframes.slice()); }
  axisChapters(): (AxisChapter[] | null)[] { return this.bindings().map(binding => binding.resource === null ? null : binding.resource.chapters.slice()); }
  drainMediaSeekRequests(): number[] { const requests = this.mediaSeekRequests; this.mediaSeekRequests = []; return requests; }
  acceptDurationMessage(durationSeconds: number, nowMs: number = this.monotonicMs): void {
    if (!Number.isFinite(durationSeconds) || durationSeconds < 0 || !Number.isFinite(nowMs)) { throw new Error('Invalid media duration observation.'); }
    this.mediaDurationMs = durationSeconds * 1000;
    this.autoSkip.onDurationMessage(nowMs / 1000, this.foreground);
  }
  /** The Internal source emits actual 100ms clock observations. The tracker still
   * performs the original internal/public smoothing at the pipeline cadence. */
  useInternalSource(): void { this.useExternalClock(false); this.internalSourceClock = true; this.sourceChanged('internal'); }
  beginInternalResource(association: string): void {
    if (!this.internalSourceClock) { throw new Error('Internal source is not selected.'); }
    this.pause(); this.sourceChanged('internal:' + association, false);
    this.pipeline.advanceEpoch(++this.epoch);
  }
  acceptInternalPosition(positionSeconds: number, forceSeek: boolean = false): boolean {
    if (!this.internalSourceClock || this.failure.length > 0) { return false; }
    const first = !Number.isFinite(this.tracker.snapshot());
    const detected = this.tracker.observe(positionSeconds, forceSeek);
    if (first) { this.pipeline.requestSync(); }
    else if (detected) {
      this.mediaLoop.onDetectedSeek(positionSeconds);
      this.pipeline.advanceEpoch(++this.epoch); this.pipeline.invalidateAxes(undefined, this.configuration.sync.syncOnSeek);
    }
    if (forceSeek && this.seekTransition !== null && this.seekTransition.status === 'pending') { this.confirmSourceSeek(); }
    return !first && detected;
  }
  /** A distinct received clock. Commands and send receipts never enter this API. */
  useDeoVrSource(generation: number, kind: 'deovr' | 'heresphere' = 'deovr'): void {
    if (kind !== 'deovr' && kind !== 'heresphere') { throw new Error('Unsupported remote source.'); }
    this.remoteSourceKind = kind;
    this.useExternalClock(false); this.remoteSourceClock = true; this.remoteClock.begin(generation);
    this.processingEnabled = true; this.remoteBindingsPending = false; this.remoteEventSequence = -1;
    this.sourceIdentity = this.remoteSourceKind + ':' + generation; this.state = 'paused';
  }
  /** Captures only an already running/fresh source. This neither plays nor arms. */
  beginDeoVrControl(request: DeoVrControlRequest, snapshot: DeoVrSnapshot, nowMs: number): OutputControlLease | null {
    const previous = this.remoteControlLease;
    if (previous !== null && !this.remoteControlPublished) { this.cancelDeoVrControl(); return null; }
    if (previous !== null && this.remoteControlPaused && !this.remoteControlCurrent(nowMs)) { this.cancelDeoVrControl(); return null; }
    const frame = this.frame();
    if (!this.remoteSourceClock || !this.processingEnabled || !this.connected || !this.foreground || this.failure.length > 0 ||
      !this.remoteClock.ready(nowMs) || this.remoteBindingsPending || this.scriptReloadToken !== 0 || this.seekTransition?.status === 'pending' ||
      (snapshot.sourceKind ?? 'deovr') !== this.remoteSourceKind || this.remoteSnapshot === null || snapshot.lastObservation === null || this.remoteSnapshot.lastObservation === null ||
      !sameDeoVrObservationSource(snapshot.lastObservation, this.remoteSnapshot.lastObservation) ||
      snapshot.lastObservation.packetSequence !== this.remoteSnapshot.lastObservation.packetSequence ||
      this.publishedRemotePacket !== snapshot.lastObservation.packetSequence ||
      snapshot.generation !== this.remoteClock.generation || snapshot.resourceRevision !== this.remoteClock.resourceRevision ||
      frame.sequence <= 0 || frame.epoch !== this.epoch || frame.profileRevision !== this.registry.revision ||
      this.publishedConfigurationRevision !== this.configurationRevision || this.publishedDispatchControlRevision !== this.dispatchControlRevision ||
      frame.isPlaying !== (this.state === 'playing')) { this.cancelDeoVrControl(); return null; }
    const evidence = new DeoVrControlEvidence(++this.remoteControlSequence, request, this.remoteSnapshot, nowMs);
    const proof = evidence.snapshot(nowMs);
    if (proof.status === 'cancelled') { this.cancelDeoVrControl(); return null; }
    this.remoteControl = evidence; this.remoteControlConfiguration = this.configurationRevision;
    this.remoteControlPublished = false; this.remoteControlPaused = request.kind === 'pause' || (request.kind === 'speed' && snapshot.playerState === 1);
    this.remoteControlNow = nowMs;
    this.remoteControlLease = Object.freeze({ requestId: proof.requestId, sourceIdentity: this.sourceIdentity,
      sourceGeneration: this.sourceGeneration, epoch: this.epoch, profileRevision: this.registry.revision,
      startFrameSequence: frame.sequence, startSourceConfigurationRevision: this.configurationRevision + this.dispatchControlRevision,
      deadlineMonotonicMs: proof.deadlineMs });
    this.dispatchControlRevision++;
    return this.remoteControlLease;
  }
  bindDeoVrControl(requestId: number, boundary: DeoVrDispatchBoundary, nowMs: number): boolean {
    if (this.remoteControlLease?.requestId !== requestId || this.remoteControl === null || !this.remoteControlCurrent(nowMs)) { return false; }
    const accepted = this.remoteControl.bindDispatch(boundary, nowMs);
    if (!accepted) { this.cancelDeoVrControl(requestId); }
    return accepted;
  }
  cancelDeoVrControl(requestId?: number): void {
    if (requestId !== undefined && this.remoteControlLease?.requestId !== requestId) { return; }
    if (this.remoteControl !== null) { this.remoteControl.cancel(); }
    this.remoteControlLease = null; this.remoteControl = null; this.remoteControlPublished = false;
  }
  private remoteControlCurrent(nowMs: number): boolean {
    const lease = this.remoteControlLease; const snapshot = this.remoteSnapshot;
    if (lease === null || this.remoteControl === null || snapshot === null || !Number.isFinite(nowMs) || nowMs < this.remoteControlNow ||
      !this.remoteSourceClock || !this.processingEnabled || !this.connected || !this.foreground || this.failure.length > 0 ||
      lease.sourceIdentity !== this.sourceIdentity || lease.sourceGeneration !== this.sourceGeneration || lease.epoch !== this.epoch ||
      lease.profileRevision !== this.registry.revision || this.remoteControlConfiguration !== this.configurationRevision ||
      this.remoteBindingsPending || this.scriptReloadToken !== 0 || (snapshot.playerState !== 0 && snapshot.playerState !== 1) || !this.remoteClock.ready(nowMs)) { return false; }
    this.remoteControlNow = nowMs;
    if (!this.remoteControlPublished) { return this.remoteControl.snapshot(nowMs).status !== 'cancelled'; }
    if (!this.remoteControlPaused) { return true; }
    const observation = snapshot.lastObservation;
    return observation !== null && observation.playerState === 1 && observation.positionSeconds !== null &&
      observation.receivedAtMs <= nowMs && nowMs - observation.receivedAtMs <= 750;
  }
  private remoteControlProof(knownPaused: boolean = false): OutputSourceControl | null {
    const lease = this.remoteControlLease; const snapshot = this.remoteSnapshot;
    if (lease === null || this.remoteControl === null || snapshot === null) { return null; }
    const nowMs = Math.max(this.monotonicMs, this.remoteControlNow);
    if (!this.remoteControlCurrent(nowMs)) { return Object.freeze({ lease, status: 'cancelled', paused: this.remoteControlPaused,
      packetSequence: -1, observedAtMs: -1, freshUntilMs: -1, frameCurrent: false, pausedFrameKnown: false }); }
    const evidence = this.remoteControlPublished ? null : this.remoteControl.snapshot(nowMs);
    const packet = snapshot.lastObservation;
    const published = this.remoteControlPublished && this.publishedRemoteControl === lease.requestId && packet !== null &&
      this.frame().sequence > lease.startFrameSequence;
    return Object.freeze({ lease, status: this.remoteControlPublished ? 'published' : evidence?.status === 'cancelled' ? 'cancelled' : 'pending', frameCurrent: published,
      paused: this.remoteControlPaused, packetSequence: packet === null ? -1 : packet.packetSequence,
      observedAtMs: packet === null ? -1 : packet.receivedAtMs,
      freshUntilMs: Math.min(this.remoteClock.observedAtMs + 750, this.remoteClock.playing ? this.remoteClock.lastChangedAtMs + 750 : Number.POSITIVE_INFINITY,
        !this.remoteControlPublished ? lease.deadlineMonotonicMs : Number.POSITIVE_INFINITY), pausedFrameKnown: published && this.remoteControlPaused && knownPaused });
  }
  isDeoVrSource(): boolean { return this.remoteSourceClock; }
  deoVrReady(nowMs: number = this.monotonicMs): boolean { return this.remoteSourceClock && this.remoteClock.ready(nowMs); }
  admitDeoVrPlay(): boolean {
    this.cancelDeoVrControl();
    if (!this.remoteSourceClock || !this.remoteClock.connected || !this.foreground || !this.connected || this.failure.length > 0) { return false; }
    this.remoteClock.admit(); this.processingEnabled = true; this.dispatchControlRevision++; return true;
  }
  requestDeoVrPause(): void { this.cancelDeoVrControl(); if (this.remoteSourceClock) { this.remoteClock.requestPause(); this.pausePlayback(); } }
  beginDeoVrSeek(): boolean {
    if (!this.remoteSourceClock || !this.remoteClock.connected || !this.foreground || this.failure.length > 0) { return false; }
    this.cancelSourceSeek(); this.remoteClock.seek(); this.pausePlayback();
    this.pipeline.advanceEpoch(++this.epoch); this.pipeline.invalidateAxes(undefined, this.configuration.sync.syncOnSeek);
    return true; // No resumable seek token: this protocol has no correlated ACK.
  }
  acceptDeoVrSnapshot(snapshot: DeoVrSnapshot, events: ReadonlyArray<DeoVrEvent>, nowMs: number = Math.max(this.monotonicMs, snapshot.lastReceivedAtMs)): void {
    if (!this.remoteSourceClock || (snapshot.sourceKind ?? 'deovr') !== this.remoteSourceKind || snapshot.generation !== this.remoteClock.generation || this.failure.length > 0 ||
      snapshot.resourceRevision < this.remoteClock.resourceRevision || snapshot.eventSequence < this.remoteEventSequence) { return; }
    const priorSnapshot = this.remoteSnapshot;
    if (this.remoteControl !== null && this.remoteControlLease !== null) {
      if (priorSnapshot?.lastObservation === null || priorSnapshot === null || snapshot.lastObservation === null ||
        !sameDeoVrObservationSource(priorSnapshot.lastObservation!, snapshot.lastObservation)) { this.cancelDeoVrControl(); }
      else if (!this.remoteControlPublished) { this.remoteControl.observe(snapshot, nowMs); }
    }
    this.remoteSnapshot = snapshot;
    this.remoteControlNow = Math.max(this.remoteControlNow, nowMs);
    const changedResource = snapshot.resourceRevision !== this.remoteClock.resourceRevision;
    const receipt = this.remoteClock.accept(snapshot);
    if (snapshot.status !== 'connected' || snapshot.path === null) {
      this.cancelSourceSeek(); this.armed = false;
      if (this.processingEnabled) { this.setPlaying(false); }
      if (snapshot.status === 'fault' || snapshot.status === 'disconnected' || snapshot.status === 'disconnecting') {
        this.remoteClock.stop(); this.processingEnabled = false; this.state = 'stopped';
      }
      this.remoteBindingsPending = false; this.dispatchControlRevision++; return;
    }
    if (changedResource) {
      const admitted = this.remoteClock.admitted;
      this.sourceChanged(this.remoteSourceKind + ':' + snapshot.generation + ':' + snapshot.resourceRevision);
      this.processingEnabled = admitted; this.armed = false; this.tracker.reset(); this.mediaDurationMs = 0;
      this.mediaLoop.clear(); this.autoSkip.cancel(); this.pipeline.advanceEpoch(++this.epoch);
      this.document = new FunscriptDocument([]); this.discovered = [];
      this.scripts.reload(this.registry.axes.map(axis => new AxisScriptBinding(axis.name, null)));
      this.pipeline.configure(this.pipelineConfiguration, this.scripts.snapshot());
      if (this.configuration.sync.syncOnMediaResourceChanged) { this.pipeline.requestSync(); }
      this.remoteBindingsPending = true; this.dispatchControlRevision++;
    }
    // Original event order is retained. A new identity with an unchanged raw
    // currentTime still has a real first receipt, but no fabricated changed event.
    let positioned = false;
    for (const event of events) {
      if (event.generation !== snapshot.generation || event.resourceRevision !== snapshot.resourceRevision || event.sequence <= this.remoteEventSequence) { continue; }
      if (event.kind === 'playing' && this.processingEnabled) { this.setPlaying(event.playing === true); }
      else if (event.kind === 'duration' && event.value !== undefined) { this.acceptDurationMessage(event.value, event.receivedAtMs); }
      else if (event.kind === 'position' && event.value !== undefined) { this.observeDeoVrPosition(event.value); positioned = true; }
      else if (event.kind === 'speed' && event.value !== undefined) { this.speed = event.value; }
    }
    this.remoteEventSequence = snapshot.eventSequence;
    if (receipt && !positioned && !Number.isFinite(this.tracker.snapshot())) { this.observeDeoVrPosition(this.remoteClock.positionSeconds); }
    if (Number.isFinite(this.remoteClock.durationSeconds)) { this.mediaDurationMs = this.remoteClock.durationSeconds * 1000; }
    this.speed = this.remoteClock.speed;
    if (this.processingEnabled) {
      this.armed = this.remoteClock.ready(Math.max(this.monotonicMs, snapshot.observedAtMs)) && this.remoteClock.playing;
      this.setPlaying(this.armed);
    }
  }
  private observeDeoVrPosition(positionSeconds: number): void {
    const first = !Number.isFinite(this.tracker.snapshot());
    const seek = this.tracker.observe(positionSeconds);
    if (first) { this.pipeline.requestSync(); }
    else if (seek) {
      this.cancelSourceSeek(); this.mediaLoop.onDetectedSeek(positionSeconds);
      this.pipeline.advanceEpoch(++this.epoch); this.pipeline.invalidateAxes(undefined, this.configuration.sync.syncOnSeek);
    }
  }
  loadDeoVrBindings(generation: number, resourceRevision: number, document: FunscriptDocument, bindings: AxisScriptBinding[], kind: 'deovr' | 'heresphere' = 'deovr'): boolean {
    if (!this.remoteSourceClock || kind !== this.remoteSourceKind || generation !== this.remoteClock.generation || resourceRevision !== this.remoteClock.resourceRevision ||
      !this.remoteClock.admitted || !this.processingEnabled || !this.foreground || this.failure.length > 0) { return false; }
    this.document = FunscriptParser.cloneDocument(document); this.discovered = bindings.slice();
    this.scripts.reload(this.registry.axes.map(axis => bindings.find(binding => binding.axisName === axis.name) ?? new AxisScriptBinding(axis.name, null)));
    this.pipeline.configure(this.pipelineConfiguration, this.scripts.snapshot());
    this.cancelDeoVrControl(); this.remoteBindingsPending = false; this.dispatchControlRevision++; return true;
  }
  /** Explicit host Play command, separate from source observations. */
  admitInternalPlay(): boolean {
    if (!this.internalSourceClock || this.document.durationMs <= 0 || this.failure.length > 0 || !this.foreground || !this.connected) { return false; }
    this.processingEnabled = true; this.dispatchControlRevision++; return true;
  }
  acceptInternalPlaying(playing: boolean): void {
    if (!this.internalSourceClock || this.failure.length > 0) { return; }
    this.armed = playing && this.processingEnabled && this.foreground && this.connected && Number.isFinite(this.tracker.snapshot());
    this.setPlaying(this.armed);
  }
  /** ChangeScript follows duration and position messages, without resetting the
   * confirmed clock or provider phase. Locks/priority links keep store semantics. */
  loadInternalBindings(document: FunscriptDocument, bindings: AxisScriptBinding[]): void {
    if (!this.internalSourceClock || this.failure.length > 0) { throw new Error('Internal source is unavailable.'); }
    this.document = FunscriptParser.cloneDocument(document); this.discovered = bindings.slice();
    const complete = this.registry.axes.map(axis => bindings.find(binding => binding.axisName === axis.name) ?? new AxisScriptBinding(axis.name, null));
    this.scripts.reload(complete); this.pipeline.configure(this.pipelineConfiguration, this.scripts.snapshot()); this.processingEnabled = true; this.dispatchControlRevision++;
  }
  configurationSnapshot(): AppConfiguration { return SettingsSchema.clone(this.configuration); }
  outputConfiguration(): OutputConfiguration { return OutputConfiguration.clone(this.configuration.outputs); }
  changeOutputConfiguration(value: OutputConfiguration): void {
    this.assertConfigurationWritable(); const next = OutputConfiguration.clone(value);
    if (JSON.stringify(next) === JSON.stringify(this.configuration.outputs)) { return; }
    this.configuration.outputs = next;
    // Target preferences are not axis processing configuration. Editing one
    // output must not invalidate another target's source frame or seek intent.
    if (this.onConfigurationChanged !== null) { this.onConfigurationChanged(); }
  }
  continuousInputConfiguration(): ContinuousInputConfiguration { return ContinuousInputConfiguration.clone(this.configuration.continuousInput); }
  changeContinuousInputConfiguration(value: ContinuousInputConfiguration): void {
    this.assertConfigurationWritable(); const next = ContinuousInputConfiguration.clone(value);
    if (JSON.stringify(next) === JSON.stringify(this.configuration.continuousInput)) { return; }
    this.configuration.continuousInput = next;
    // Input preferences do not imply reception, media state or output authority.
    if (this.onConfigurationChanged !== null) { this.onConfigurationChanged(); }
  }
  /** Current local Drive data only; input reception and physical Arm remain host-owned.
   * Consumer order is the same normal setter path as the original registrations. */
  applyContinuousAxisAction(action: ContinuousInputAction, data: ContinuousGestureData): void {
    this.assertConfigurationWritable();
    if (!validateContinuousAction(action) || !this.foreground || this.failure.length > 0 || this.hasPendingProfileChanges() ||
      !this.registry.axes.some(axis => axis.name === action.targetAxis)) { throw new Error('Continuous target is unavailable.'); }
    if (action.id === 'Axis::Value::Drive') {
      if (continuousValue(0, data) === null) { throw new Error('Invalid continuous value.'); }
      this.setContinuousAxisTransition(action.targetAxis, data.valueOrDelta, data.deltaTime, !data.isAbsolute); return;
    }
    if (action.id === 'Axis::MotionProviderBlend::Drive') {
      const settings = this.getAxisConfiguration(action.targetAxis);
      const value = continuousValue(settings.motionProviderBlend, data);
      if (value === null) { throw new Error('Invalid continuous blend.'); }
      settings.motionProviderBlend = Math.max(0, Math.min(1, value));
      this.changeAxisConfiguration(action.targetAxis, settings); return;
    }
    if (action.id.startsWith('MotionProvider::')) {
      const settings = applyContinuousMotion(this.getMotionConfiguration(action.targetAxis, action.provider), action, data);
      if (settings === null) { throw new Error('Invalid continuous Motion configuration.'); }
      this.changeMotionConfiguration(action.targetAxis, settings); return;
    }
    throw new Error('Continuous action is not an axis consumer.');
  }
  keyboardConfiguration(): KeyboardShortcutConfiguration { return KeyboardShortcutConfiguration.clone(this.configuration.keyboard); }
  generalConfiguration(): GeneralConfiguration { return GeneralConfiguration.clone(this.configuration.general); }
  changeKeyboardConfiguration(value: KeyboardShortcutConfiguration): void {
    this.assertConfigurationWritable(); const next = KeyboardShortcutConfiguration.clone(value);
    if (JSON.stringify(next) === JSON.stringify(this.configuration.keyboard)) { return; }
    this.configuration.keyboard = next;
    if (this.onConfigurationChanged !== null) { this.onConfigurationChanged(); }
  }
  changeGeneralConfiguration(value: GeneralConfiguration): void {
    this.assertConfigurationWritable(); const next = GeneralConfiguration.clone(value);
    if (JSON.stringify(next) === JSON.stringify(this.configuration.general)) { return; }
    this.configuration.general = next;
    if (this.onConfigurationChanged !== null) { this.onConfigurationChanged(); }
  }
  resetSync(axisName?: string, enabled: boolean = true): boolean {
    if (this.failure.length > 0 || (axisName !== undefined && !this.registry.axes.some(axis => axis.name === axisName))) { return false; }
    this.dispatchControlRevision++;
    this.pipeline.requestSync(axisName === undefined ? undefined : [axisName], enabled); return true;
  }
  revision(): number { return this.configurationRevision; }
  frame(): AxisFrame { return this.pipeline.snapshot(); }
  fault(): string { return this.failure; }
  hasPendingProfileChanges(): boolean {
    const selected = this.configuration.devices.find(profile => profile.id === this.configuration.selectedDeviceId);
    return selected === undefined || JSON.stringify(selected) !== JSON.stringify(this.registry.profile);
  }
  protected observeConfigurationChanges(callback: () => void): void { this.onConfigurationChanged = callback; }
  protected assertConfigurationWritable(): void {}
  private changed(): void { this.cancelScriptReload(); this.cancelSourceSeek(); this.configurationRevision++; if (this.onConfigurationChanged !== null) { this.onConfigurationChanged(); } }
  private makePipelineConfiguration(): AxisPipelineConfiguration {
    return new AxisPipelineConfiguration(this.registry.profile, this.activeSettings, this.configuration.sync,
      this.configuration.globalOffsetSeconds, this.registry.revision);
  }
  private makeMotion(): MotionRegistry {
    try {
      return new MotionRegistry(this.registry.axes.map(axis => axis.name), this.activeMotionSettings,
        (axisName: string) => { if (this.pipeline !== undefined) { this.pipeline.requestSync([axisName]); } });
    } catch (error) {
      this.failure = 'Motion configuration cannot activate: ' + (error as Error).message;
      return new MotionRegistry(this.registry.axes.map(axis => axis.name));
    }
  }

  private rebuildRuntime(recreateMotion: boolean = true): void {
    this.motionCanvas = null;
    this.epoch++; this.registry = new DeviceRegistry(this.registry.profile, this.registry.revision + 1);
    this.pipelineConfiguration = this.makePipelineConfiguration();
    if (recreateMotion) { this.motion = this.makeMotion(); }
    this.pipeline = new AxisPipeline(this.pipelineConfiguration, this.motion, this.epoch);
    this.scripts = new AxisScriptStore(this.registry.axes.map(axis => axis.name), this.pipelineConfiguration.axisSettings);
  }
  /** Explicit volatile recovery; settings and native close quarantine are untouched. */
  resetRuntime(): void {
    this.sourceChanged('preview'); this.stop(); this.failure = ''; this.rebuildRuntime(); this.document = new FunscriptDocument([]); this.discovered = [];
    this.externalClock = false; this.internalSourceClock = false; this.remoteSourceClock = false; this.remoteClock.close(); this.mediaDurationMs = 0; this.nativeGate = false; this.tracker.reset();
    this.nativeReadyForPaused = false; this.nativePlaying = false; this.pendingNativePlay = false;
    this.nativeGeneration = -1; this.nativeObservation = -1; this.nativeSeek = -1; this.nativeObservedAt = -1;
    this.nativeDurationGeneration = -1; this.nativeDurationValue = -1;
  }
  recoverFault(): void { this.resetRuntime(); }
  standaloneMotionAxes(): string[] {
    return this.registry.axes.filter(axis => {
      const settings = this.getAxisConfiguration(axis.name);
      return settings.selectedMotionProvider !== null && MotionConfigurations.ids().some(id => id === settings.selectedMotionProvider) &&
        !settings.bypassMotionProvider && settings.updateMotionProviderWhenPaused && settings.updateMotionProviderWithoutScript;
    }).map(axis => axis.name);
  }
  isStandaloneMotionActive(): boolean { return this.standaloneMotionActive && this.processingEnabled; }
  /** No media observation is invented: this is the original paused/NaN pipeline. */
  startStandaloneMotion(): void {
    this.assertConfigurationWritable();
    if (!this.foreground || !this.connected || this.failure.length > 0) { throw new Error('Foreground, connected preview and a healthy runtime are required.'); }
    if (this.externalClock || this.internalSourceClock || this.remoteSourceClock || this.document.axes.length > 0) { throw new Error('Close the media source before starting standalone Motion.'); }
    if (this.standaloneMotionAxes().length === 0) { throw new Error('Configure an enabled Motion axis with UpdateWhenPaused and UpdateWithoutScript first.'); }
    this.sourceChanged('standalone-motion'); this.stop(); this.processingEnabled = true; this.standaloneMotionActive = true;
    this.state = 'paused'; this.dispatchControlRevision++;
  }
  manualPreviewAxes(): string[] {
    return this.registry.axes.filter(axis => {
      const settings = this.getAxisConfiguration(axis.name);
      return !settings.bypassTransition && (settings.bypassMotionProvider || settings.selectedMotionProvider === null);
    }).map(axis => axis.name);
  }
  isManualPreviewActive(): boolean { return this.manualPreviewActive && this.processingEnabled; }
  /** Explicit volatile admission, not a media play command or physical Arm. */
  startManualPreview(): void {
    this.assertConfigurationWritable();
    if (!this.foreground || !this.connected || this.failure.length > 0 || this.hasPendingProfileChanges()) {
      throw new Error('Foreground, a healthy writable preview and the active device profile are required.');
    }
    if (this.externalClock || this.internalSourceClock || this.remoteSourceClock || this.document.axes.length > 0) { throw new Error('Close media before starting manual preview.'); }
    if (this.manualPreviewAxes().length === 0) { throw new Error('Enable transition and bypass or deselect Motion on at least one enabled axis.'); }
    this.sourceChanged('manual-preview'); this.stop(); this.pipeline.clearTransitions();
    this.processingEnabled = true; this.manualPreviewActive = true; this.state = 'paused'; this.dispatchControlRevision++;
  }
  /** Disconnect is not permission to resume the same paused transition later. */
  revokeManualPreview(): void { if (this.manualPreviewActive) { this.stop(); } }
  setAxisValue(axisName: string, value: number, durationSeconds: number, offset: boolean = false): void {
    // Numeric button/editor arguments are bounded by their original UI contract.
    if (!Number.isFinite(value) || value < (offset ? -1 : 0) || value > 1) { throw new Error('Invalid manual editor value.'); }
    this.setContinuousAxisTransition(axisName, value, durationSeconds, offset);
  }
  private setContinuousAxisTransition(axisName: string, value: number, durationSeconds: number, offset: boolean): void {
    this.assertConfigurationWritable();
    if (!this.foreground || !this.connected || this.failure.length > 0 || this.hasPendingProfileChanges() ||
      !this.registry.axes.some(axis => axis.name === axisName)) { throw new Error('Manual target is unavailable, disabled or not in a healthy foreground session.'); }
    // Original aggregated RawInput deltas may exceed one; the transition owns
    // clamping/append semantics. Continuous Drive must not inherit button bounds.
    if (!Number.isFinite(value) || !Number.isFinite(durationSeconds) || durationSeconds < 0) { throw new Error('Invalid manual transition value or duration.'); }
    this.cancelScriptReload(); this.cancelSourceSeek(); this.dispatchControlRevision++;
    this.pipeline.setTransition(axisName, value, durationSeconds, offset); this.manualCommandCount++;
  }
  /** Source SkipGap semantics: the supplied nonempty axis set does not filter
   * the original dictionary enumeration. Return raw script seconds only. */
  skipGapPosition(axisNames: string[], minimumSkipSeconds: number = 2): number | null {
    if (axisNames.length === 0 || axisNames.some(name => !this.registry.axes.some(axis => axis.name === name)) ||
      !Number.isFinite(minimumSkipSeconds) || minimumSkipSeconds < 0 || this.failure.length > 0) { return null; }
    const position = this.position() / 1000;
    const duration = this.mediaDurationSeconds();
    if (!Number.isFinite(this.tracker.snapshot()) || !Number.isFinite(position) || position < 0 || !Number.isFinite(duration) || duration <= 0) { return null; }
    let candidate: number = Number.POSITIVE_INFINITY;
    for (const binding of this.scripts.snapshot()) {
      if (binding.resource === null) { continue; }
      const points = binding.resource.keyframes;
      const state = this.pipeline.inspectAxisRuntime(binding.axisName);
      const start = state.insideScript ? state.index : 0;
      if (!AxisKeyframes.valid(points, start) || !AxisKeyframes.valid(points, start + 1)) { continue; }
      let index = start;
      while (index + 1 < points.length && AxisKeyframes.isGap(points, index)) { index++; }
      if (index === start && state.insideScript) { continue; }
      if (AxisKeyframes.valid(points, index)) { candidate = Math.min(candidate, points[index].positionSeconds); }
    }
    if (!Number.isFinite(candidate) || position >= candidate || candidate - position <= minimumSkipSeconds || candidate < 0) { return null; }
    // Original SeekMediaToTime clamps only after candidate/threshold selection.
    return Math.min(candidate, duration);
  }
  private fail(error: Error): void { this.cancelScriptReload(); this.cancelSourceSeek(); this.processingEnabled = false; this.standaloneMotionActive = false; this.manualPreviewActive = false; this.failure = error.message || 'Axis pipeline failed.'; this.armed = false; this.nativeGate = false; this.state = 'paused'; }
  clearScripts(invalidateMotionResources: boolean = false): void {
    this.sourceChanged('preview'); this.stop(); this.document = new FunscriptDocument([]); this.discovered = []; this.mediaDurationMs = 0;
    // Companion scripts clear even when locked. Independent Motion resources and
    // provider phase survive normal media changes; a Download refresh revokes them.
    if (this.failure.length === 0) { this.rebuildRuntime(invalidateMotionResources); }
  }
  load(document: FunscriptDocument): void {
    if (this.failure.length > 0) { throw new Error('Reset the faulted runtime before loading a source.'); }
    const checked = FunscriptParser.cloneDocument(document);
    this.sourceChanged('script'); this.stop(); this.document = checked;
    this.scripts.clear();
    this.discovered = this.resources(checked, 'current-script', 'Loaded script'); this.scripts.reload(this.discovered); this.pipeline.configure(this.pipelineConfiguration, this.scripts.snapshot()); this.processingEnabled = true;
    if (this.configuration.sync.syncOnMediaResourceChanged) { this.pipeline.requestSync(); }
  }
  resources(document: FunscriptDocument, resourceId: string, name: string): AxisScriptBinding[] {
    return document.axes.filter(axis => this.registry.axes.some(definition => definition.name === axis.name)).map(axis =>
      new AxisScriptBinding(axis.name, new AxisScriptResource(resourceId + '#' + axis.name, name, resourceId,
        axis.actions.map(point => new AxisKeyframe(point.at / 1000, point.pos / 100)),
        document.metadata.chapters.map(chapter => new AxisChapter(chapter.name, chapter.startTimeMs / 1000, chapter.endTimeMs / 1000)),
        document.metadata.bookmarks.map(bookmark => new AxisBookmark(bookmark.name, bookmark.timeMs / 1000)))));
  }
  bindings(): AxisScriptBinding[] { return this.scripts.snapshot(); }
  /** Stable, immutable UI document derived from ACTUAL locked/linked bindings. */
  displayDocument(): FunscriptDocument {
    const bindings = this.scripts.snapshot();
    if (bindings.length === this.displayedBindings.length && bindings.every((binding, index) =>
      binding.revision === this.displayedBindings[index].revision && binding.resource === this.displayedBindings[index].resource)) { return this.displayedDocument; }
    const axes: FunscriptAxis[] = [];
    for (const binding of bindings) {
      if (binding.resource === null) { continue; }
      const actions = binding.resource.keyframes.map(point => new FunscriptAction(point.positionSeconds * 1000, point.value * 100));
      for (const action of actions) { Object.freeze(action); } Object.freeze(actions);
      const axis = new FunscriptAxis(binding.axisName, actions); Object.freeze(axis); axes.push(axis);
    }
    this.displayedDocument = new FunscriptDocument(axes); Object.freeze(axes);
    Object.freeze(this.displayedDocument.metadata.chapters); Object.freeze(this.displayedDocument.metadata.bookmarks);
    Object.freeze(this.displayedDocument.metadata); Object.freeze(this.displayedDocument);
    this.displayedBindings = bindings; return this.displayedDocument;
  }
  axisMetadata(axisName: string): FunscriptMetadata {
    const binding = this.scripts.snapshot().find(item => item.axisName === axisName);
    if (binding === undefined || binding.resource === null) { return new FunscriptMetadata(); }
    const resource = binding.resource;
    return new FunscriptMetadata(resource.chapters.map(chapter => new FunscriptChapter(chapter.name, chapter.startTimeSeconds * 1000, chapter.endTimeSeconds * 1000)),
      resource.bookmarks.map(bookmark => new FunscriptBookmark(bookmark.name, bookmark.positionSeconds * 1000)));
  }
  axisDocument(axisName: string): FunscriptDocument {
    const binding = this.scripts.snapshot().find(item => item.axisName === axisName);
    if (binding === undefined || binding.resource === null) { return new FunscriptDocument([]); }
    const resource = binding.resource;
    return new FunscriptDocument([new FunscriptAxis(axisName, resource.keyframes.map(point => new FunscriptAction(point.positionSeconds * 1000, point.value * 100)))],
      new FunscriptMetadata(resource.chapters.map(chapter => new FunscriptChapter(chapter.name, chapter.startTimeSeconds * 1000, chapter.endTimeSeconds * 1000)),
        resource.bookmarks.map(bookmark => new FunscriptBookmark(bookmark.name, bookmark.positionSeconds * 1000))));
  }
  loadBindings(document: FunscriptDocument, bindings: AxisScriptBinding[]): void {
    if (this.failure.length > 0) { throw new Error('Reset the faulted runtime before loading a source.'); }
    const checked = FunscriptParser.cloneDocument(document);
    this.sourceChanged('script'); this.stop(); this.document = checked; this.scripts.clear(); this.discovered = bindings.slice(); this.scripts.reload(this.discovered); this.pipeline.configure(this.pipelineConfiguration, this.scripts.snapshot()); this.processingEnabled = true;
    if (this.configuration.sync.syncOnMediaResourceChanged) { this.pipeline.requestSync(); }
  }
  setLoopingScript(axisName: string, document: FunscriptDocument | null, sourceUri: string): void {
    this.cancelSourceSeek();
    this.motion.setScriptResources(axisName, document === null ? [] : this.resources(FunscriptParser.cloneDocument(document), sourceUri, sourceUri));
    this.pipeline.invalidateMotionProvenance([axisName]); this.dispatchControlRevision++;
  }
  resetCustomCurve(axisName: string, requestSync: boolean = false): void {
    this.cancelSourceSeek();
    this.motion.resetCustomCurve(axisName, requestSync);
    this.pipeline.invalidateMotionProvenance([axisName]); this.dispatchControlRevision++;
  }
  getAxisConfiguration(name: string): AxisConfiguration {
    const entry = this.activeSettings.find(item => item.axisName === name);
    if (entry === undefined) { throw new Error('Unknown configured axis.'); }
    return AxisConfiguration.clone(entry.settings);
  }
  changeAxisConfiguration(name: string, settings: AxisConfiguration, deferScriptReload: boolean = false): void {
    this.changeAxisConfigurations([new AxisConfigurationEntry(name, settings)], deferScriptReload);
  }
  /** Validate the whole command before committing any axis; all-axis shortcuts
   * preserve disabled stored settings and cannot leave a partially edited set. */
  changeAxisConfigurations(entries: AxisConfigurationEntry[], deferScriptReload: boolean = false): void {
    this.assertConfigurationWritable();
    if (this.hasPendingProfileChanges()) { throw new Error('Restart to apply the pending device profile before changing axis settings.'); }
    const next = this.configurationSnapshot();
    const device = next.axisSettingsByDevice.find(item => item.deviceId === this.registry.profile.id)!;
    const seen: string[] = [];
    for (const change of entries) {
      if (seen.indexOf(change.axisName) >= 0) { throw new Error('Duplicate axis update.'); }
      seen.push(change.axisName);
      const entry = device.axes.find(item => item.axisName === change.axisName);
      if (entry === undefined) { throw new Error('Unknown configured axis.'); }
      entry.settings = AxisConfiguration.clone(change.settings);
    }
    const checked = SettingsSchema.clone(next);
    const pipelineConfiguration = new AxisPipelineConfiguration(this.registry.profile,
      checked.axisSettingsByDevice.find(item => item.deviceId === this.registry.profile.id)!.axes,
      checked.sync, checked.globalOffsetSeconds, this.registry.revision);
    const reload = entries.filter(change => {
      const before = this.getAxisConfiguration(change.axisName);
      return before.linkAxis !== change.settings.linkAxis || before.linkAxisHasPriority !== change.settings.linkAxisHasPriority;
    }).map(change => change.axisName);
    this.scripts.setConfiguration(pipelineConfiguration.axisSettings, deferScriptReload);
    if (!deferScriptReload && reload.length > 0) { this.scripts.reload(this.discovered, reload); }
    this.configuration = checked; this.activeSettings = checked.axisSettingsByDevice.find(item => item.deviceId === this.registry.profile.id)!.axes;
    this.pipelineConfiguration = pipelineConfiguration; this.pipeline.configure(this.pipelineConfiguration, this.scripts.snapshot()); this.changed();
  }
  /** Resource commands use already authorized immutable catalog resources. They
   * never reopen arbitrary paths or rebuild Motion/clock/runtime state. */
  clearAxisScript(name: string): boolean {
    if (this.failure.length > 0 || !this.registry.axes.some(axis => axis.name === name)) { return false; }
    const before = this.scripts.getBinding(name);
    this.scripts.clear([name]);
    if (this.scripts.getBinding(name) === before) { return false; }
    this.cancelSourceSeek(); this.dispatchControlRevision++; this.pipeline.configure(this.pipelineConfiguration, this.scripts.snapshot()); return true;
  }
  /** Legacy pure-core cache re-adoption used by isolated model callers. The
   * actual UI/shortcut Reload and Link commands must use the host transaction
   * below, which performs current authorized repository I/O. */
  reloadAxisScript(name: string): boolean {
    if (this.failure.length > 0 || !this.registry.axes.some(axis => axis.name === name)) { return false; }
    this.cancelSourceSeek(); this.dispatchControlRevision++;
    this.pipeline.requestSync([name]); this.scripts.reload(this.discovered, [name]); this.pipeline.configure(this.pipelineConfiguration, this.scripts.snapshot()); return true;
  }
  /** Host-owned bounded repository read. Sync is requested before search; a
   * pending read does not stop media/provider ticks or publish a replacement.
   * Only the matching transaction can install freshly parsed resources. */
  beginScriptReload(axisNames: string[]): number {
    this.assertConfigurationWritable();
    if (this.failure.length > 0 || !this.foreground || this.hasPendingProfileChanges() || axisNames.length === 0 ||
      axisNames.some((name, index) => axisNames.indexOf(name) !== index || !this.registry.axes.some(axis => axis.name === name))) {
      throw new Error('Script reload targets or runtime are unavailable.');
    }
    this.cancelScriptReload(); this.cancelSourceSeek(); this.pipeline.requestSync(axisNames); this.dispatchControlRevision++;
    this.scriptReloadKind = 'axis'; this.scriptReloadToken = ++this.scriptReloadSequence; this.scriptReloadAxes = axisNames.slice();
    this.scriptReloadEpoch = this.epoch; this.scriptReloadProfile = this.registry.revision;
    this.scriptReloadSource = this.sourceGeneration; this.scriptReloadConfiguration = this.configurationRevision;
    this.scriptReloadControl = this.dispatchControlRevision;
    return this.scriptReloadToken;
  }
  beginLoopingScriptReload(axisName: string): number {
    this.assertConfigurationWritable(); return this.beginLoopingRead(axisName);
  }
  beginLoopingScriptRestore(axisName: string): number { return this.beginLoopingRead(axisName); }
  private beginLoopingRead(axisName: string): number {
    if (this.failure.length > 0 || !this.foreground || this.hasPendingProfileChanges() ||
      !this.registry.axes.some(axis => axis.name === axisName)) { throw new Error('Looping target is unavailable.'); }
    this.cancelScriptReload(); this.cancelSourceSeek(); this.dispatchControlRevision++;
    this.scriptReloadKind = 'looping'; this.scriptReloadToken = ++this.scriptReloadSequence; this.scriptReloadAxes = [axisName];
    this.scriptReloadEpoch = this.epoch; this.scriptReloadProfile = this.registry.revision;
    this.scriptReloadSource = this.sourceGeneration; this.scriptReloadConfiguration = this.configurationRevision;
    this.scriptReloadControl = this.dispatchControlRevision;
    return this.scriptReloadToken;
  }
  completeLoopingScriptRestore(token: number, document: FunscriptDocument, sourceUri: string): boolean {
    if (!this.isScriptReloadCurrent(token) || this.scriptReloadKind !== 'looping') { return false; }
    const axisName = this.scriptReloadAxes[0]; const checked = FunscriptParser.cloneDocument(document);
    if (this.getMotionConfiguration(axisName, 'Looping Script').sourceUri !== sourceUri || checked.axes.length !== 1 ||
      checked.axes[0].actions.length === 0 || !this.registry.axes.some(axis => axis.name === checked.axes[0].name)) { return false; }
    this.scriptReloadToken = 0; this.scriptReloadAxes = []; this.setLoopingScript(axisName, checked, sourceUri); return true;
  }
  completeLoopingScriptReload(token: number, document: FunscriptDocument, sourceUri: string,
    configuration?: MotionProviderConfiguration): boolean {
    if (!this.isScriptReloadCurrent(token) || this.scriptReloadKind !== 'looping') { return false; }
    this.assertConfigurationWritable();
    const axisName = this.scriptReloadAxes[0]; const checked = FunscriptParser.cloneDocument(document);
    const next = MotionConfigurations.clone(configuration === undefined ? this.getMotionConfiguration(axisName, 'Looping Script') : configuration);
    if (next.id !== 'Looping Script' || checked.axes.length !== 1 || checked.axes[0].actions.length === 0 ||
      !this.registry.axes.some(axis => axis.name === checked.axes[0].name)) { throw new Error('Invalid managed Looping resource.'); }
    next.sourceUri = sourceUri; MotionConfigurations.clone(next);
    // Retire this token before the synchronous setter chain; changed() must not
    // mistake our own commit for external cancellation and advance the epoch.
    this.scriptReloadToken = 0; this.scriptReloadAxes = [];
    this.changeMotionConfiguration(axisName, next);
    this.setLoopingScript(axisName, checked, sourceUri);
    return true;
  }
  isScriptReloadCurrent(token: number): boolean {
    return token > 0 && token === this.scriptReloadToken && this.failure.length === 0 && this.foreground &&
      this.scriptReloadEpoch === this.epoch && this.scriptReloadProfile === this.registry.revision &&
      this.scriptReloadSource === this.sourceGeneration && this.scriptReloadConfiguration === this.configurationRevision &&
      this.scriptReloadControl === this.dispatchControlRevision;
  }
  cancelScriptReload(token?: number): void {
    if (this.scriptReloadToken === 0 || (token !== undefined && token !== this.scriptReloadToken)) { return; }
    this.scriptReloadToken = 0; this.scriptReloadAxes = []; this.dispatchControlRevision++;
    // Cancellation revokes pre-existing output admission even if a coordinator
    // misses the intermediate snapshot. Numeric values and Motion phase survive.
    this.epoch++; if (this.pipeline.getFault() === null) { this.pipeline.advanceEpoch(this.epoch); }
  }
  completeScriptReload(token: number, discovered: AxisScriptBinding[]): boolean {
    if (!this.isScriptReloadCurrent(token) || this.scriptReloadKind !== 'axis') { return false; }
    this.assertConfigurationWritable();
    const axes = this.scriptReloadAxes.slice();
    const found = discovered.filter(binding => axes.indexOf(binding.axisName) >= 0);
    if (found.some((binding, index) => found.findIndex(other => other.axisName === binding.axisName) !== index)) {
      throw new Error('Duplicate reloaded axis resource.');
    }
    this.scripts.reload(found, axes);
    this.discovered = this.discovered.filter(binding => axes.indexOf(binding.axisName) < 0).concat(found);
    this.pipeline.configure(this.pipelineConfiguration, this.scripts.snapshot());
    this.scriptReloadToken = 0; this.scriptReloadAxes = []; this.dispatchControlRevision++;
    return true;
  }
  changeSync(configuration: SyncConfiguration): void {
    this.assertConfigurationWritable(); const next = this.configurationSnapshot(); next.sync = SyncConfiguration.clone(configuration);
    this.configuration = SettingsSchema.clone(next); this.pipelineConfiguration = this.makePipelineConfiguration(); this.pipeline.configure(this.pipelineConfiguration, this.scripts.snapshot()); this.changed();
  }
  getMotionConfiguration(axisName: string, providerId: string): MotionProviderConfiguration {
    const axis = this.activeMotionSettings.axes.find(item => item.axisName === axisName);
    const provider = axis?.providers.find(item => item.id === providerId);
    if (provider === undefined) { throw new Error('Unknown motion configuration.'); }
    return MotionConfigurations.clone(provider);
  }
  detachMotionCanvas(owner?: number): void {
    if (owner === undefined || this.motionCanvas?.owner === owner) { this.motionCanvas = null; }
  }
  /** Current UI identity only. Attachment does not guess an initial Viewport event. */
  attachMotionCanvas(owner: number, axisName: string, profileRevision: number, width: number, height: number): boolean {
    this.assertConfigurationWritable();
    if (!this.foreground || this.failure.length > 0 || this.hasPendingProfileChanges() ||
      !Number.isSafeInteger(owner) || owner <= 0 || profileRevision !== this.registry.revision ||
      !this.registry.axes.some(axis => axis.name === axisName)) { return false; }
    if (owner < this.latestMotionCanvasOwner || (owner === this.latestMotionCanvasOwner && this.motionCanvas === null)) { return false; }
    if (this.motionCanvas !== null && this.motionCanvas.owner === owner) {
      if (this.motionCanvas.axisName !== axisName || this.motionCanvas.profileRevision !== profileRevision) { return false; }
      if (this.motionCanvas.width === width && this.motionCanvas.height === height) { return true; }
    }
    const configuration = this.getMotionConfiguration(axisName, 'Custom Curve');
    const result = PointCanvasEffects.apply(configuration.points ?? [],
      new PointCanvasGeometry(true, width, height, configuration.durationSeconds as number, 1), 'synchronize');
    const next = MotionConfigurations.clone(configuration); next.points = result.points.map(point => new MotionCurvePoint(point.x, point.y));
    MotionConfigurations.clone(next); // Validate all derived coordinates before adopting owner or mutating runtime.
    this.latestMotionCanvasOwner = owner; this.motionCanvas = new MotionCanvasBinding(owner, axisName, profileRevision, width, height);
    if (result.pointWriteBackCount > 0) {
      const copy = this.motion.replaceCustomCurvePointsFromCanvas(axisName, next.points ?? []);
      this.commitMotionConfiguration(axisName, copy, true);
    }
    return true;
  }
  private curveCanvasEffect(axisName: string, duration: number, points: MotionCurvePoint[], event: PointCanvasEvent): PointCanvasEffectResult | null {
    const binding = this.motionCanvas;
    if (binding === null || !this.foreground || binding.axisName !== axisName || binding.profileRevision !== this.registry.revision) { return null; }
    return PointCanvasEffects.apply(points, new PointCanvasGeometry(true, binding.width, binding.height, duration, 1), event);
  }
  private commitMotionConfiguration(axisName: string, copy: MotionProviderConfiguration, invalidate: boolean): void {
    if (invalidate) { this.pipeline.invalidateMotionProvenance([axisName]); this.dispatchControlRevision++; }
    const device = this.configuration.motionSettingsByDevice.find(item => item.deviceId === this.registry.profile.id)!;
    const axis = device.axes.find(item => item.axisName === axisName)!;
    axis.providers = axis.providers.map(item => item.id === copy.id ? copy : item);
    this.activeMotionSettings = device; this.changed();
  }
  changeMotionConfiguration(axisName: string, provider: MotionProviderConfiguration): void {
    this.assertConfigurationWritable();
    if (this.hasPendingProfileChanges()) { throw new Error('Restart to apply the pending device profile before changing motion settings.'); }
    let copy = MotionConfigurations.clone(provider);
    const previous = this.getMotionConfiguration(axisName, copy.id);
    let collectionChanged: boolean = false;
    if (copy.id === 'Custom Curve') {
      const pointsChanged = JSON.stringify(previous.points) !== JSON.stringify(copy.points);
      if (previous.durationSeconds !== copy.durationSeconds) {
        const viewport = this.curveCanvasEffect(axisName, copy.durationSeconds as number, previous.points ?? [], 'viewport-change');
        if (viewport !== null) {
          collectionChanged = viewport.removedPointCount + viewport.pointWriteBackCount > 0;
          if (!pointsChanged) { copy.points = viewport.points.map(point => new MotionCurvePoint(point.x, point.y)); }
        }
      }
      if (pointsChanged) {
        const reset = this.curveCanvasEffect(axisName, copy.durationSeconds as number, copy.points ?? [], 'collection-reset');
        if (reset !== null) { copy.points = reset.points.map(point => new MotionCurvePoint(point.x, point.y)); collectionChanged = true; }
      }
      copy = MotionConfigurations.clone(copy);
    }
    const changedProvider = JSON.stringify(previous) !== JSON.stringify(copy);
    try {
      this.motion.configureProvider(axisName, copy);
      if (collectionChanged) { copy = this.motion.replaceCustomCurvePointsFromCanvas(axisName, copy.points ?? []); }
    } catch (error) { this.fail(error as Error); throw error; }
    this.commitMotionConfiguration(axisName, copy, changedProvider || collectionChanged);
  }
  setCustomCurvePoints(axisName: string, durationSeconds: number, interpolationMode: InterpolationMode, points: MotionCurvePoint[]): void {
    this.assertConfigurationWritable();
    if (this.hasPendingProfileChanges() || !this.registry.axes.some(axis => axis.name === axisName)) { throw new Error('Active motion axis is unavailable.'); }
    const previous = this.getMotionConfiguration(axisName, 'Custom Curve');
    let oldPoints: MotionCurvePoint[] | undefined;
    if (previous.durationSeconds !== durationSeconds) {
      const viewport = this.curveCanvasEffect(axisName, durationSeconds, previous.points ?? [], 'viewport-change');
      if (viewport !== null) { oldPoints = viewport.points.map(point => new MotionCurvePoint(point.x, point.y)); }
    }
    const reset = this.curveCanvasEffect(axisName, durationSeconds, points, 'collection-reset');
    const incoming = reset === null ? points : reset.points.map(point => new MotionCurvePoint(point.x, point.y));
    let copy: MotionProviderConfiguration;
    try { copy = this.motion.setCustomCurvePoints(axisName, durationSeconds, interpolationMode, incoming, oldPoints); }
    catch (error) { this.fail(error as Error); throw error; }
    this.commitMotionConfiguration(axisName, copy, true);
  }

  selectProfile(id: string): void {
    this.assertConfigurationWritable(); if (!this.configuration.devices.some(profile => profile.id === id)) { throw new Error('Unknown device profile.'); }
    this.configuration.selectedDeviceId = id; this.changed();
  }
  changeProfile(profile: DeviceProfile): void {
    this.assertConfigurationWritable(); const next = this.configurationSnapshot();
    const previous = next.devices.find(item => item.id === profile.id);
    if (previous === undefined) { throw new Error('Unknown device profile.'); }
    next.devices = next.devices.map(item => item.id === profile.id ? DeviceProfiles.copy(profile) : item);
    // Preserve every existing disabled-axis setting; missing new axes are defaulted by codec.
    const names = profile.axes.map(axis => axis.name);
    const axes = next.axisSettingsByDevice.find(item => item.deviceId === profile.id)!;
    axes.axes = axes.axes.filter(item => names.indexOf(item.axisName) >= 0);
    const motion = next.motionSettingsByDevice.find(item => item.deviceId === profile.id)!;
    motion.axes = motion.axes.filter(item => names.indexOf(item.axisName) >= 0);
    this.configuration = SettingsSchema.clone(next); this.changed();
  }
  /** Import adds a validated custom definition only. It neither selects it nor
   * changes the immutable active registry; per-axis/Motion defaults are detached. */
  importProfile(profile: DeviceProfile): void {
    this.assertConfigurationWritable();
    if (profile.isBuiltIn || this.configuration.devices.some(item => item.id === profile.id)) {
      throw new Error('Imported profile must have a new custom id.');
    }
    const diagnostics = DeviceProfiles.validate(profile);
    if (diagnostics.some(item => item.severity === 'error')) {
      throw new Error(diagnostics.map(item => item.path + ': ' + item.message).join('; '));
    }
    const imported = DeviceProfiles.copy(profile);
    const next = this.configurationSnapshot(); next.devices.push(imported);
    next.axisSettingsByDevice.push(new DeviceAxisConfiguration(imported.id, AxisConfiguration.defaultsForProfile(imported, true)));
    next.motionSettingsByDevice.push(MotionConfigurations.defaultsForProfile(imported));
    this.configuration = SettingsSchema.clone(next); this.changed();
  }
  cloneProfile(sourceId: string, name: string): void {
    this.assertConfigurationWritable(); const source = this.configuration.devices.find(profile => profile.id === sourceId);
    if (source === undefined) { throw new Error('Unknown device profile.'); }
    let suffix: number = 1; while (this.configuration.devices.some(profile => profile.id === 'custom-' + suffix)) { suffix++; }
    const profile = DeviceProfiles.clone(source, 'custom-' + suffix, name);
    const next = this.configurationSnapshot(); next.devices.push(profile);
    const axes = next.axisSettingsByDevice.find(item => item.deviceId === sourceId)!;
    next.axisSettingsByDevice.push(new DeviceAxisConfiguration(profile.id, axes.axes));
    const motion = next.motionSettingsByDevice.find(item => item.deviceId === sourceId)!;
    next.motionSettingsByDevice.push(new DeviceMotionConfiguration(profile.id, motion.axes));
    this.configuration = SettingsSchema.clone(next); this.changed();
  }
  removeProfile(id: string): void {
    this.assertConfigurationWritable(); const profile = this.configuration.devices.find(item => item.id === id);
    if (profile === undefined || profile.isBuiltIn || id === this.registry.profile.id || id === this.configuration.selectedDeviceId) {
      throw new Error('Built-in, active and selected profiles cannot be removed.');
    }
    this.configuration.devices = this.configuration.devices.filter(item => item.id !== id);
    this.configuration.axisSettingsByDevice = this.configuration.axisSettingsByDevice.filter(item => item.deviceId !== id);
    this.configuration.motionSettingsByDevice = this.configuration.motionSettingsByDevice.filter(item => item.deviceId !== id); this.changed();
  }
  play(): boolean {
    if (this.remoteSourceClock) { return this.admitDeoVrPlay(); }
    if (this.failure.length > 0 || !this.foreground || !this.connected) { return false; }
    if (this.externalClock) { this.processingEnabled = true; this.dispatchControlRevision++; this.armed = true; this.pendingNativePlay = true; return true; }
    if (this.document.durationMs <= 0 || this.position() >= this.document.durationMs) { return false; }
    if (!Number.isFinite(this.tracker.snapshot())) { this.tracker.observe(0, true); }
    this.processingEnabled = true; this.dispatchControlRevision++; this.armed = true; this.setPlaying(true); return true;
  }
  private setPlaying(playing: boolean): void {
    if ((this.state === 'playing') !== playing) { this.dispatchControlRevision++; }
    if ((this.state === 'playing') !== playing && this.configuration.sync.syncOnMediaPlayPause) { this.pipeline.requestSync(); }
    this.state = playing ? 'playing' : 'paused';
  }
  pause(): void { this.cancelSourceSeek(); this.pausePlayback(); }
  private pausePlayback(): void { this.dispatchControlRevision++; this.armed = false; this.pendingNativePlay = false; this.nativeGate = false; this.setPlaying(false); }
  stop(): void {
    this.remoteClock.stop(); this.remoteBindingsPending = false;
    this.cancelScriptReload();
    this.processingEnabled = false; this.standaloneMotionActive = false; this.manualPreviewActive = false; this.nativeSourceAdmission = false; this.pause(); this.state = 'stopped'; this.tracker.reset(); this.mediaLoop.clear(); this.autoSkip.cancel(); this.mediaSeekRequests = [];
    if (this.failure.length === 0) { this.pipeline.clearTransitions(); this.pipeline.advanceEpoch(++this.epoch); }
  }
  setForeground(value: boolean): void { this.foreground = value; if (!value) { this.motionCanvas = null; this.stop(); } }
  setConnected(value: boolean): void { this.connected = value; if (!value) { this.stop(); } }
  setSpeed(value: number): void {
    if (!Number.isFinite(value) || value < 0.01 || value > 4) { throw new Error('Playback speed must be from 0.01 to 4.'); }
    if (this.speed !== value) { this.cancelSourceSeek(); this.dispatchControlRevision++; } this.speed = value;
  }
  useExternalClock(enabled: boolean): void {
    this.remoteSourceClock = false; this.remoteClock.close();
    this.sourceChanged(enabled ? 'native' : 'preview'); this.stop(); this.externalClock = enabled; this.processingEnabled = enabled; this.nativeSourceAdmission = enabled; this.internalSourceClock = false; this.mediaDurationMs = 0;
    this.nativeDurationGeneration = -1; this.nativeDurationValue = -1;
    this.nativeReadyForPaused = false; this.nativePlaying = false; this.nativeGeneration = -1; this.nativeObservation = -1; this.nativeSeek = -1; this.nativeObservedAt = -1;
  }
  beginSeek(nowMs: number = this.monotonicMs): number {
    this.cancelSourceSeek(); const previousEpoch = this.epoch; this.pausePlayback();
    if (this.failure.length > 0 || !this.foreground || !this.connected || !Number.isFinite(nowMs) || nowMs < this.monotonicMs) { return -1; }
    this.pipeline.advanceEpoch(++this.epoch);
    this.seekNativeGeneration = this.nativeGeneration; this.seekNativeSequence = this.nativeSeek + 1;
    this.seekTransition = Object.freeze({ requestId: ++this.seekRequestId, sourceIdentity: this.sourceIdentity,
      sourceGeneration: this.sourceGeneration, previousEpoch, currentEpoch: this.epoch,
      profileRevision: this.registry.revision, deadlineMonotonicMs: nowMs + 5000, status: 'pending' });
    return this.seekRequestId;
  }
  seek(timeMs: number): void {
    if (this.remoteSourceClock) { throw new Error('Send the remote seek; no local target is a confirmed observation.'); }
    if (this.externalClock) { throw new Error('Seek the native player and wait for confirmation.'); }
    if (!Number.isFinite(timeMs)) { throw new Error('Invalid seek.'); }
    this.pause(); const previous = this.tracker.snapshot();
    const target = Math.min(this.document.durationMs, Math.max(0, timeMs)) / 1000;
    this.tracker.observe(target, true); if (Number.isFinite(previous)) { this.mediaLoop.onDetectedSeek(target); }
    this.pipeline.advanceEpoch(++this.epoch);
    this.pipeline.invalidateAxes(undefined, this.configuration.sync.syncOnSeek);
  }
  acceptNativeSnapshot(snapshot: MediaClockSnapshot): void {
    if (!this.externalClock || snapshot.generation < this.nativeGeneration || this.failure.length > 0) { return; }
    if (snapshot.generation !== this.nativeGeneration) {
      // A native open first retires its old player (idle generation), then
      // starts loading in another generation. Only the explicit, unconsumed
      // open admission may span those unprepared transitions. Stop revokes it.
      const admittedOpen = this.nativeSourceAdmission && this.processingEnabled;
      this.sourceChanged('native'); this.processingEnabled = admittedOpen; this.nativeSourceAdmission = admittedOpen; this.nativeGeneration = snapshot.generation; this.nativeObservation = -1; this.nativeSeek = -1; this.tracker.reset(); this.nativeGate = false;
    }
    this.mediaDurationMs = snapshot.durationMs;
    if (snapshot.ready && (this.nativeDurationGeneration !== snapshot.generation || this.nativeDurationValue !== snapshot.durationMs)) {
      this.nativeDurationGeneration = snapshot.generation; this.nativeDurationValue = snapshot.durationMs;
      this.acceptDurationMessage(snapshot.durationMs / 1000, Math.max(this.monotonicMs, snapshot.observedMonotonicMs));
    }
    if (this.speed !== snapshot.rate) { this.cancelSourceSeek(); this.dispatchControlRevision++; } this.speed = snapshot.rate;
    if (snapshot.valid && snapshot.observationSequence !== this.nativeObservation) {
      const first = !Number.isFinite(this.tracker.snapshot());
      const forceSeek = this.nativeSeek >= 0 && snapshot.seekSequence !== this.nativeSeek;
      const seek = this.tracker.observe(snapshot.positionMs / 1000, forceSeek);
      if (first) { this.pipeline.requestSync(); }
      else if (seek) { this.mediaLoop.onDetectedSeek(snapshot.positionMs / 1000); this.pipeline.advanceEpoch(++this.epoch); this.pipeline.invalidateAxes(undefined, this.configuration.sync.syncOnSeek); }
      this.nativeObservation = snapshot.observationSequence; this.nativeSeek = snapshot.seekSequence;
      this.nativeObservedAt = snapshot.observedMonotonicMs;
      if (this.seekTransition !== null && snapshot.observedMonotonicMs >= this.seekTransition.deadlineMonotonicMs) { this.cancelSourceSeek(); }
      if (this.seekTransition !== null && this.seekTransition.status === 'pending' &&
        snapshot.generation === this.seekNativeGeneration && snapshot.seekSequence === this.seekNativeSequence &&
        !snapshot.seeking && snapshot.observedMonotonicMs < this.seekTransition.deadlineMonotonicMs) { this.confirmSourceSeek(); }
    }
    if (snapshot.failure.length > 0) { this.cancelSourceSeek(); this.processingEnabled = false; this.nativeSourceAdmission = false; }
    if (snapshot.ready) { this.nativeSourceAdmission = false; }
    this.nativePlaying = snapshot.playing;
    this.nativeReadyForPaused = snapshot.ready && snapshot.valid && !snapshot.seeking && snapshot.failure.length === 0;
    this.nativeGate = snapshot.safetyGateOpen && snapshot.valid && !snapshot.seeking && snapshot.failure.length === 0;
    if (!this.nativeGate && (snapshot.seeking || !snapshot.valid || (!snapshot.playing && !this.pendingNativePlay))) { this.armed = false; }
    if (this.nativeGate) { this.pendingNativePlay = false; }
    this.setPlaying(this.nativeGate && this.armed && this.foreground && this.connected);
    if (snapshot.state === 'completed') { this.state = 'ended'; this.armed = false; }
  }
  tick(elapsedMs: number, monotonicMs: number = this.monotonicMs + elapsedMs): void {
    if (this.failure.length > 0) { return; }
    try {
      if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || !Number.isFinite(monotonicMs) || monotonicMs < this.monotonicMs) { throw new Error('Invalid session clock.'); }
      this.monotonicMs = monotonicMs;
      if (this.remoteControlLease !== null && !this.remoteControlCurrent(monotonicMs)) { this.cancelDeoVrControl(); }
      if (this.seekTransition !== null && this.seekTransition.status === 'pending' && monotonicMs >= this.seekTransition.deadlineMonotonicMs) { this.cancelSourceSeek(); }
      if (this.externalClock && this.state === 'playing' && (this.nativeObservedAt < 0 || monotonicMs < this.nativeObservedAt || monotonicMs - this.nativeObservedAt > 750)) { this.pause(); }
      if (this.remoteSourceClock && this.processingEnabled) {
        this.armed = this.remoteClock.ready(monotonicMs) && this.remoteClock.playing;
        this.setPlaying(this.armed);
      }
      if (!this.foreground || elapsedMs === 0) { return; }
      const position = this.tracker.tick(elapsedMs / 1000, this.speed, this.state === 'playing');
      const duration = this.externalClock || this.internalSourceClock || this.remoteSourceClock ? this.mediaDurationMs : this.document.durationMs;
      if (!this.internalSourceClock && Number.isFinite(position) && duration > 0 && position * 1000 >= duration) { this.state = 'ended'; this.armed = false; }
      this.pipeline.step(new AxisStepInput(elapsedMs / 1000, position, this.state === 'playing', this.speed,
        this.epoch, monotonicMs, this.registry.revision), this.pipelineConfiguration, this.scripts.snapshot());
      this.publishedConfigurationRevision = this.configurationRevision;
      this.publishedDispatchControlRevision = this.dispatchControlRevision;
      this.publishedNativeGeneration = this.nativeGeneration;
      this.publishedNativeObservedAt = this.nativeObservedAt;
      this.publishedRemoteGeneration = this.remoteClock.generation;
      this.publishedRemoteResource = this.remoteClock.resourceRevision;
      this.publishedRemoteObservedAt = this.remoteClock.observedAtMs;
      this.publishedRemotePacket = this.remoteSnapshot?.lastObservation?.packetSequence ?? -1;
      if (this.remoteControlLease !== null && this.remoteControl !== null &&
        (this.remoteControlPublished || this.remoteControl.snapshot(monotonicMs).status === 'observed')) {
        this.remoteControlPublished = true; this.publishedRemoteControl = this.remoteControlLease.requestId;
      } else { this.publishedRemoteControl = -1; }
      if (this.state !== 'stopped' && (this.remoteControlLease === null || this.remoteControlPublished) && (this.seekTransition === null || this.seekTransition.status !== 'pending')) {
        const loopSeek = this.mediaLoop.update(elapsedMs / 1000, position, duration / 1000);
        const skipSeek = this.autoSkip.poll(monotonicMs / 1000, this.axisKeyframes(), duration / 1000, position);
        if (loopSeek !== null) { this.mediaSeekRequests.push(loopSeek * 1000); }
        if (skipSeek !== null) { this.mediaSeekRequests.push(skipSeek * 1000); }
      }
    } catch (error) { this.fail(error as Error); }
  }
  private position(): number { return Number.isFinite(this.tracker.snapshot()) ? this.tracker.snapshot() * 1000 : 0; }
  getAxisOffset(name: string): number { return this.registry.axes.some(axis => axis.name === name) ? this.getAxisConfiguration(name).offsetSeconds * 1000 : 0; }
  getScriptPosition(name: string): number { return this.position() - this.configuration.globalOffsetSeconds * 1000 - this.getAxisOffset(name); }
  getAxisScriptSettings(name: string): AxisScriptSettings {
    const settings = this.getAxisConfiguration(name); const result = new AxisScriptSettings(name);
    result.inverted = settings.invertScript; result.scale = settings.scriptScale; result.interpolationMode = settings.interpolationType; return result;
  }
  setAxisOffset(name: string, offsetMs: number): void { const settings = this.getAxisConfiguration(name); settings.offsetSeconds = offsetMs / 1000; this.changeAxisConfiguration(name, settings); }
  setAxisScale(name: string, scale: number): void { const settings = this.getAxisConfiguration(name); settings.scriptScale = scale; this.changeAxisConfiguration(name, settings); }
  setAxisInverted(name: string, inverted: boolean): void { const settings = this.getAxisConfiguration(name); settings.invertScript = inverted; this.changeAxisConfiguration(name, settings); }
  setAxisInterpolationMode(name: string, mode: InterpolationMode): void { const settings = this.getAxisConfiguration(name); settings.interpolationType = mode; this.changeAxisConfiguration(name, settings); }
  setGlobalOffset(offsetMs: number): void { this.setGlobalOffsetSeconds(offsetMs / 1000); }
  setGlobalOffsetSeconds(seconds: number): void {
    this.assertConfigurationWritable(); if (!Number.isFinite(seconds)) { throw new Error('Offset must be finite.'); }
    this.configuration.globalOffsetSeconds = seconds; this.pipelineConfiguration = this.makePipelineConfiguration(); this.pipeline.configure(this.pipelineConfiguration, this.scripts.snapshot()); this.changed();
  }
  /** Atomic output view. Reading it never ticks, samples providers or invents events.
   * The target selects output axes; their full dependency lineage still must be
   * known. Disabled target axes cannot grant permission through an unknown dependency. */
  dispatchSource(enabledAxisNames?: ReadonlyArray<string>, updateKind: 'fixed' | 'polled' = 'fixed'): OutputDispatchSource {
    const original = this.frame();
    const names = enabledAxisNames === undefined ? this.registry.axes.map(axis => axis.name) : enabledAxisNames.slice();
    const frame: PipelineFrameSource = Object.freeze({
      sequence: original.sequence, epoch: original.epoch, monotonicMs: original.monotonicMs,
      mediaPositionMs: original.mediaPositionMs, profileRevision: original.profileRevision,
      axisStates: Object.freeze(original.axisStates.filter(axis => names.indexOf(axis.axisName) >= 0)),
      events: Object.freeze(original.events.filter(event => names.indexOf(event.axisName) >= 0 &&
        (this.state === 'playing' || (event.kind === 'autoHome' && (updateKind === 'polled' || original.provenance.some(value =>
          value.axisName === event.axisName && value.autoHomeApplied && value.stages.indexOf('autoHome') >= 0))))))
    });
    const invalid = (reason: string = 'unknown'): OutputDispatchSource => this.dispatchResult(frame, null, 'invalidated', updateKind, false, reason);
    const pending = (reason: string = 'pending'): OutputDispatchSource => this.dispatchResult(frame, null, 'pendingCurrentFrame', updateKind, false, reason);
    if ((updateKind !== 'fixed' && updateKind !== 'polled') || names.length === 0 || names.some((name, index) => names.indexOf(name) !== index ||
      !this.registry.axes.some(axis => axis.name === name)) || frame.axisStates.length !== names.length) { return invalid('axisShape names=' + names.length + ' states=' + frame.axisStates.length); }
    if (!this.processingEnabled || this.failure.length > 0 || !this.foreground || !this.connected || this.state === 'stopped' || this.state === 'ended' ||
      original.sequence <= 0 || original.epoch !== this.epoch || original.profileRevision !== this.registry.revision) {
      return invalid('runtime processing=' + this.processingEnabled + ' failure=' + this.failure.length + ' fg=' + this.foreground +
        ' connected=' + this.connected + ' state=' + this.state + ' seq=' + original.sequence + ' epoch=' + original.epoch + '/' + this.epoch +
        ' profile=' + original.profileRevision + '/' + this.registry.revision);
    }
    const playing = this.state === 'playing';
    const control = this.remoteControlProof();
    if (control !== null && control.status === 'cancelled') { return invalid('controlCancelled'); }
    if (control !== null && (control.status === 'pending' || !control.frameCurrent)) { return pending(); }
    if (this.remoteSourceClock && (this.remoteSnapshot?.diagnostic !== null || (this.remoteSnapshot?.playerState !== 0 && this.remoteSnapshot?.playerState !== 1) || !this.remoteClock.ready(Math.max(this.monotonicMs, this.remoteControlNow)) ||
      this.publishedRemoteGeneration !== this.remoteClock.generation || this.publishedRemoteResource !== this.remoteClock.resourceRevision)) { return invalid(); }
    if (this.remoteSourceClock && this.remoteBindingsPending) { return pending(); }
    if (this.externalClock && (this.publishedNativeGeneration !== this.nativeGeneration ||
      (playing ? !this.nativeGate || !this.armed || this.nativeObservedAt < 0 ||
        this.monotonicMs - this.nativeObservedAt > 750 : !this.nativeReadyForPaused))) {
      return invalid('native generation=' + this.publishedNativeGeneration + '/' + this.nativeGeneration + ' gate=' + this.nativeGate +
        ' armed=' + this.armed + ' observed=' + this.nativeObservedAt + ' now=' + this.monotonicMs);
    }
    if (playing && !this.armed) { return invalid('engineArmed=false playing=true'); }
    if (this.scriptReloadToken !== 0) { return this.isScriptReloadCurrent(this.scriptReloadToken) ? pending('scriptReloadPending') : invalid('scriptReloadStale'); }
    if (this.externalClock && !playing && (this.nativePlaying || this.pendingNativePlay)) { return pending(); }
    // A live edit/pause does not relabel the previous frame with the new config.
    // The coordinator may suspend candidates while retaining an existing arm.
    if (this.publishedConfigurationRevision !== this.configurationRevision ||
      this.publishedDispatchControlRevision !== this.dispatchControlRevision || original.isPlaying !== playing) { return pending(); }
    if (updateKind === 'polled') {
      // These are the original immutable prospective commands produced by this
      // complete step, not a claim that its final scalar has already moved.
      if (frame.events.some(event => event.epoch !== original.epoch || event.sourceFrameSequence !== original.sequence ||
        !Number.isFinite(event.targetValue) || !Number.isFinite(event.durationSeconds) || event.durationSeconds < 0 ||
        (event.kind === 'autoHome' ? !this.getAxisConfiguration(event.axisName).autoHomeEnabled ||
          !original.axisStates.some(axis => axis.axisName === event.axisName && axis.isAutoHoming) ||
          event.targetValue !== this.getAxisConfiguration(event.axisName).autoHomeTargetValue ||
          event.durationSeconds !== this.getAxisConfiguration(event.axisName).autoHomeDurationSeconds :
          event.from === null || event.to === null))) { return invalid(); }
      if (playing || frame.events.length > 0) {
        // A playing zero-event frame safely allows explicit arm/wait: polled
        // consumes no scalars. Later events need their own current authorization.
        if (!playing && control !== null) {
          const scalar = this.dispatchSource(names, 'fixed');
          if (scalar.sourceControl?.pausedFrameKnown !== true) { return scalar.availability === 'invalidated' ? invalid() : pending(); }
        }
        return this.readyDispatch(frame, original, [playing ? 'activePlayback' : 'pausedAutoHome'], playing, updateKind);
      }
    }
    const provenance = original.provenance.filter(value => names.indexOf(value.axisName) >= 0);
    if (provenance.length !== names.length) { return invalid('provenance=' + provenance.length + '/' + names.length); }
    if (frame.axisStates.some(axis => !Number.isFinite(axis.value))) {
      // A fresh explicit preview can be armed waiting with no scalar at all.
      // This admission cannot authorize a write; true unknown lineage stays invalid.
      const invalidAxes: string = frame.axisStates.filter(axis => !Number.isFinite(axis.value)).map(axis => axis.axisName).join(',');
      return this.manualAdmission(frame, updateKind) !== null ? pending('manualAdmissionNoScalar') : invalid('axisValueNonFinite=' + invalidAxes);
    }
    if (provenance.some(value => value.frameSequence !== original.sequence || value.epoch !== original.epoch ||
      value.profileRevision !== original.profileRevision || value.configurationRevision !== original.configurationRevision ||
      value.isPlaying !== original.isPlaying || value.status !== 'known' ||
      value.finalSources.indexOf('unknown') >= 0 || value.origins.length === 0 ||
      value.origins.some(origin => origin.profileRevision !== original.profileRevision ||
        (origin.source === 'historical' && !this.currentHistoricalAnchor(origin, original)) ||
        (origin.source === 'control' && !this.currentControlInput(origin, original, value.axisName)) ||
        (origin.source === 'motion' && value.motionCacheRead && value.stages.indexOf('motionBlend') >= 0 &&
          !this.currentMotionCacheUse(origin, original, value.axisName)) ||
        ((origin.epoch !== original.epoch || origin.configurationRevision !== original.configurationRevision) &&
          !this.currentHistoricalAnchor(origin, original) && !this.currentControlInput(origin, original, value.axisName) &&
          !this.currentMotionCacheUse(origin, original, value.axisName))) ||
      value.dependencies.some(dependency => dependency.status !== 'known' || dependency.profileRevision !== original.profileRevision ||
        ((dependency.epoch !== original.epoch || dependency.configurationRevision !== original.configurationRevision) &&
          !value.origins.some(origin => (dependency.role === 'motionCache' && this.currentMotionCacheUse(origin, original, value.axisName) &&
            origin.axisName === dependency.axisName && origin.lastFrameSequence === dependency.frameSequence &&
            origin.epoch === dependency.epoch && origin.configurationRevision === dependency.configurationRevision) ||
            (this.currentControlInput(origin, original, value.axisName) && origin.control !== null &&
            origin.control.role === dependency.role && origin.control.sourceAxisName === dependency.axisName &&
            origin.control.sourceFrameSequence === dependency.frameSequence && origin.control.sourceEpoch === dependency.epoch &&
            origin.control.sourceConfigurationRevision === dependency.configurationRevision) ||
            (this.currentHistoricalAnchor(origin, original) && origin.anchor !== null &&
            origin.anchor.role === dependency.role && origin.anchor.sourceAxisName === dependency.axisName &&
            origin.anchor.sourceFrameSequence === dependency.frameSequence && origin.anchor.sourceEpoch === dependency.epoch &&
            origin.anchor.sourceConfigurationRevision === dependency.configurationRevision)))))) { return invalid('provenanceAuditFailed'); }
    const intents: DispatchIntent[] = [];
    if (playing) {
      // Current configured activity may intentionally consume known historic
      // scalars through audited Sync/Home/Transition/Speed anchors. It never
      // makes a held/cache-only frame a new activity or blesses a stale callback.
      const active = provenance.some(value => value.origins.some(origin => origin.anchor === null &&
        origin.axisName === value.axisName && origin.lastFrameSequence === original.sequence &&
        origin.epoch === original.epoch && origin.profileRevision === original.profileRevision &&
        origin.configurationRevision === original.configurationRevision &&
        (origin.source === 'script' || origin.source === 'autoHome' || origin.source === 'transition' ||
          (origin.source === 'motion' && value.motionSampleProduced === true && value.motionApplied))));
      if (!active) { return pending('noActivePlaybackOrigin'); }
      intents.push('activePlayback');
    }
    else {
      for (const value of provenance) {
        const home = value.autoHomeApplied && value.stages.indexOf('autoHome') >= 0;
        const motion = value.motionApplied && value.motionUpdated && value.motionSampleProduced === true &&
          this.getAxisConfiguration(value.axisName).updateMotionProviderWhenPaused;
        const manual = this.manualPreviewActive && updateKind === 'fixed' && value.transitionApplied && value.stages.indexOf('transition') >= 0;
        if (manual && intents.indexOf('pausedManual') < 0) { intents.push('pausedManual'); }
        if (home && intents.indexOf('pausedAutoHome') < 0) { intents.push('pausedAutoHome'); }
        if (motion && intents.indexOf('pausedMotion') < 0) { intents.push('pausedMotion'); }
        // A genuine same-epoch held value can accompany activity on another
        // selected axis, but cannot itself create an activity authorization.
        if (!home && !motion && !manual && value.primarySource !== 'held') { return this.dispatchResult(frame, null, 'pendingCurrentFrame', updateKind, true); }
      }
      // Manual-preview Arm waits for actual manual activity. The original
      // numerical Home stage may later modify the held value, but a pure Home
      // or Motion frame cannot replace this user's waiting-manual permission.
      // Mixed frames retain all their additional per-intent requirements.
      if (intents.length === 0 || (this.manualPreviewActive && updateKind === 'fixed' && intents.indexOf('pausedManual') < 0)) { return this.dispatchResult(frame, null, 'pendingCurrentFrame', updateKind, true); }
    }
    return this.readyDispatch(frame, original, intents, playing, updateKind);
  }
  private readyDispatch(frame: PipelineFrameSource, original: AxisFrame, intents: DispatchIntent[], playing: boolean,
    updateKind: 'fixed' | 'polled'): OutputDispatchSource {
    const observedAt = playing && this.remoteSourceClock ? this.publishedRemoteObservedAt :
      playing && this.externalClock ? this.publishedNativeObservedAt : original.monotonicMs;
    if (observedAt < 0 || observedAt > original.monotonicMs ||
      (playing && (this.externalClock || this.remoteSourceClock) && original.monotonicMs - observedAt > 750)) {
      return this.dispatchResult(frame, null, 'invalidated', updateKind, false,
        'observedAt=' + observedAt + ' monotonic=' + original.monotonicMs + ' publishedNative=' + this.publishedNativeObservedAt +
        ' native=' + this.nativeObservedAt + ' external=' + this.externalClock + ' playing=' + playing);
    }
    const authorization: DispatchAuthorization = Object.freeze({ epoch: original.epoch,
      sourceFrameSequence: original.sequence, updateKind,
      // Both counters only increase. Resource/reset/play-control mutations must
      // invalidate queued sources even if no consumer observed the pending frame.
      sourceConfigurationRevision: this.configurationRevision + this.dispatchControlRevision,
      authorizedAxes: Object.freeze(frame.axisStates.map(axis => axis.axisName)),
      intents: Object.freeze(intents), clockKind: playing ? 'media' : 'monotonic', observedMonotonicMs: observedAt });
    return this.dispatchResult(frame, authorization, 'ready', updateKind, !playing);
  }
  private currentHistoricalAnchor(origin: AxisSourceOrigin, frame: AxisFrame): boolean {
    const anchor = origin.anchor;
    return anchor !== null && anchor.sourceStatus === 'known' && anchor.sourceProfileValid &&
      anchor.sourceKinds.length > 0 && anchor.sourceKinds.every(kind => kind === 'script' || kind === 'motion' ||
        kind === 'autoHome' || kind === 'transition' || kind === 'held' || kind === 'default') &&
      (anchor.role === 'syncPrevious' || anchor.role === 'autoHomeStart' || anchor.role === 'transitionStart' || anchor.role === 'speedPrevious' || anchor.role === 'smartPrevious') &&
      anchor.sourceProfileRevision === frame.profileRevision && anchor.sourceFrameSequence > 0 &&
      anchor.sourceFrameSequence < frame.sequence && anchor.consumerFrameSequence === frame.sequence &&
      anchor.consumerEpoch === frame.epoch && anchor.consumerProfileRevision === frame.profileRevision &&
      anchor.consumerConfigurationRevision === frame.configurationRevision;
  }
  private currentMotionCacheUse(origin: AxisSourceOrigin, frame: AxisFrame, axisName: string): boolean {
    // The pipeline validates its manager observation and provider generation on
    // this actual read. This is use of a retained sample, never a new write.
    const value = frame.provenance.find(item => item.axisName === axisName);
    const settings = this.getAxisConfiguration(axisName);
    return value !== undefined && value.status === 'known' && value.motionCacheRead && value.motionCacheValidated &&
      value.stages.indexOf('motionRead') >= 0 && value.stages.indexOf('motionBlend') >= 0 &&
      origin.source === 'motion' && origin.anchor === null && origin.control === null && origin.axisName === axisName &&
      origin.profileRevision === frame.profileRevision && !settings.bypassMotionProvider &&
      origin.providerId !== null && origin.providerId === settings.selectedMotionProvider &&
      origin.providerGeneration !== null && origin.providerWriteGeneration !== null && origin.lastProviderWriteGeneration !== null &&
      origin.providerConfigurationGeneration !== null && origin.providerResourceGeneration !== null &&
      value.dependencies.some(dependency => dependency.role === 'motionCache' && dependency.status === 'known' &&
        dependency.axisName === axisName && dependency.frameSequence === origin.lastFrameSequence &&
        dependency.epoch === origin.epoch && dependency.profileRevision === origin.profileRevision &&
        dependency.configurationRevision === origin.configurationRevision);
  }
  private currentControlInput(origin: AxisSourceOrigin, frame: AxisFrame, axisName: string): boolean {
    const control = origin.control;
    if (origin.source !== 'control' || control === null || control.sourceStatus !== 'known' ||
      !control.sourceProfileValid || !control.sourceCurrentValid || control.sourceKinds.length === 0 ||
      !control.sourceKinds.every(kind => kind === 'script' || kind === 'motion' || kind === 'autoHome' ||
        kind === 'transition' || kind === 'held' || kind === 'default') ||
      control.consumerAxisName !== axisName || control.consumerFrameSequence !== frame.sequence ||
      control.consumerEpoch !== frame.epoch || control.consumerProfileRevision !== frame.profileRevision ||
      control.consumerConfigurationRevision !== frame.configurationRevision ||
      control.readFrameSequence !== frame.sequence - 1 || control.readProfileRevision !== frame.profileRevision ||
      control.sourceProfileRevision !== frame.profileRevision || origin.axisName !== control.sourceAxisName ||
      origin.lastFrameSequence !== control.sourceFrameSequence || origin.epoch !== control.sourceEpoch ||
      origin.configurationRevision !== control.sourceConfigurationRevision || control.sourceFrameSequence <= 0 ||
      control.sourceFrameSequence > control.readFrameSequence ||
      (control.inputKind !== 'speed' && (control.sourceFrameSequence !== control.readFrameSequence ||
        control.sourceEpoch !== control.readEpoch || control.sourceConfigurationRevision !== control.readConfigurationRevision)) ||
      control.samples.length === 0 || control.samples.length > 2 ||
      (control.inputKind === 'value' && control.samples.length !== 1)) { return false; }
    const settings = this.getAxisConfiguration(axisName);
    const evidence = frame.provenance.find(value => value.axisName === axisName);
    if (evidence === undefined) { return false; }
    if (control.role === 'smartInput') {
      if (control.inputKind !== 'value' || settings.smartLimitInputAxis !== control.sourceAxisName ||
        evidence.stages.indexOf(settings.smartLimitMode === 'value' ? 'smartValue' : 'smartSpeed') < 0) { return false; }
    } else if (control.role === 'motionFollow') {
      if ((control.inputKind !== 'activity' && control.inputKind !== 'speed') || settings.updateMotionProviderWithAxis !== control.sourceAxisName ||
        (control.inputKind === 'speed' && !settings.motionProviderSpeedLimitWithAxis) ||
        evidence.stages.indexOf(control.inputKind === 'speed' ? 'motionFollowLimit' : 'motionBlend') < 0) { return false; }
    } else { return false; }
    return control.samples.every((sample, index) => sample.axisName === control.sourceAxisName &&
      sample.profileRevision === frame.profileRevision && sample.sourceProfileValid &&
      sample.frameSequence <= control.sourceFrameSequence &&
      (sample.status === 'known' || (control.inputKind === 'activity' && index < control.samples.length - 1 && sample.status === 'none')) &&
      sample.sourceKinds.indexOf('unknown') < 0) &&
      control.samples[control.samples.length - 1].frameSequence === control.sourceFrameSequence &&
      control.samples[control.samples.length - 1].epoch === control.sourceEpoch &&
      control.samples[control.samples.length - 1].configurationRevision === control.sourceConfigurationRevision;
  }
  private manualAdmission(frame: PipelineFrameSource, updateKind: 'fixed' | 'polled'): ManualPreviewAdmission | null {
    if (updateKind !== 'fixed' || !this.manualPreviewActive || !this.processingEnabled || this.state !== 'paused' ||
      !this.foreground || !this.connected || this.failure.length > 0 || this.hasPendingProfileChanges() ||
      this.externalClock || this.internalSourceClock || frame.sequence <= 0 || frame.epoch !== this.epoch ||
      frame.profileRevision !== this.registry.revision || frame.axisStates.length === 0) { return null; }
    const names = frame.axisStates.map(axis => axis.axisName);
    if (names.some((name, index) => names.indexOf(name) !== index || !this.registry.axes.some(axis => axis.name === name))) { return null; }
    const evidence = this.frame().provenance.filter(value => names.indexOf(value.axisName) >= 0);
    if (evidence.length !== names.length || evidence.some(value => value.status === 'unknown' || value.finalSources.indexOf('unknown') >= 0)) { return null; }
    return Object.freeze({ epoch: this.epoch, profileRevision: this.registry.revision,
      admissionRevision: this.configurationRevision + this.dispatchControlRevision - this.manualCommandCount,
      authorizedAxes: Object.freeze(names) });
  }
  private dispatchResult(frame: PipelineFrameSource, authorization: DispatchAuthorization | null,
    availability: 'ready' | 'pendingCurrentFrame' | 'invalidated', updateKind: 'fixed' | 'polled' = 'fixed', knownPaused: boolean = false,
    reason: string = ''): OutputDispatchSource {
    const mediaState: 'playing' | 'paused' | 'stopped' = this.state === 'playing' ? 'playing' : this.state === 'paused' ? 'paused' : 'stopped';
    const result = { frame, authorization, availability, mediaState, sourceControl: this.remoteControlProof(knownPaused), manualPreviewAdmission: this.manualAdmission(frame, updateKind), foreground: this.foreground, faulted: this.failure.length > 0,
      reason, sourceIdentity: this.sourceIdentity, sourceGeneration: this.sourceGeneration, seekTransition: this.seekTransition ?? undefined };
    return Object.freeze(result);
  }
  previewSamples(): AxisSample[] { return this.frame().axisStates.map(axis => new AxisSample(axis.axisName, axis.value * 100)); }
  snapshot(): PlaybackSnapshot {
    const frame = this.frame();
    const currentFrame = frame.sequence > 0 && frame.epoch === this.epoch && frame.profileRevision === this.registry.revision &&
      this.publishedConfigurationRevision === this.configurationRevision &&
      this.publishedDispatchControlRevision === this.dispatchControlRevision && this.scriptReloadToken === 0;
    const gate = this.processingEnabled && currentFrame && this.failure.length === 0 && this.state === 'playing' && this.foreground && this.connected && this.armed && (!this.externalClock || this.nativeGate);
    return new PlaybackSnapshot(this.state, this.position(), this.externalClock || this.internalSourceClock || this.remoteSourceClock ? this.mediaDurationMs : this.document.durationMs,
      gate, gate ? this.previewSamples().filter(sample => Number.isFinite(sample.position)) : [], this.speed,
      this.configuration.globalOffsetSeconds * 1000, 'pchip');
  }
}
