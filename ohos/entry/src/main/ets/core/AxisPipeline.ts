import { AxisConfiguration, AxisConfigurationEntry, SmartLimitPoint, SyncConfiguration } from './AxisConfiguration';
import { ConfigurationDiagnostic, DeviceAxisDefinition, DeviceProfile, DeviceProfiles } from './DeviceProfile';
import { AxisEvent, AxisFrame, AxisRuntimeState, AXIS_INDEX_AFTER, AXIS_INDEX_BEFORE, AXIS_INDEX_INVALID, axisValueChanged } from './AxisState';
import { AxisKeyframe, AxisKeyframes, AxisScriptBinding, AxisScriptResource, clamp01, lerp } from './AxisScriptStore';
import { AxisTransition } from './AxisTransition';
import { AxisControlInput, AxisControlReference, AxisControlSample, AxisHistoricalAnchor, AxisSourceOrigin, AxisValueDependency, AxisValueProvenance } from './AxisState';
import type { AxisValueSource, AxisExecutedStage, AxisDependencyRole, AxisHistoricalAnchorRole, AxisControlRole, AxisControlInputKind } from './AxisState';

/** The real MotionRegistry and deterministic test doubles implement this port.
 * Gating is here; a skipped update STILL reads the per-axis manager cache.
 */
export interface AxisMotionSampleObservation {
  readonly didWrite: boolean;
  readonly actualProviderId: string | null;
  readonly providerWriteGeneration: number;
  readonly cacheWriteGeneration: number;
  readonly cachedValue: number;
  readonly source: 'fresh' | 'retained' | 'uninitialized' | 'unknown';
  readonly configurationGeneration: number;
  /** Live parameters; last-write identity above is never rewritten after edits. */
  readonly currentConfigurationGeneration?: number;
  readonly resourceGeneration: number;
  readonly resourceId: string | null;
}

export interface AxisMotionProviderPort {
  /** Only source=fresh/didWrite certifies a computed provider sample. A void
   * legacy port remains numerically supported, but its output is unknown. */
  update(axisName: string, providerName: string, deltaSeconds: number): AxisMotionSampleObservation | void;
  getObservation?(axisName: string): AxisMotionSampleObservation;
  getValue(axisName: string): number;
}

/** Registry revision belongs to the session; structural changes need a new
 * pipeline/session, never an in-place half-profile switch. No IO or UI state.
 */
export class AxisPipelineConfiguration {
  readonly profile: DeviceProfile;
  readonly profileRevision: number;
  readonly axes: DeviceAxisDefinition[];
  readonly axisSettings: AxisConfigurationEntry[];
  readonly sync: SyncConfiguration;
  readonly globalOffsetSeconds: number;
  readonly diagnostics: ConfigurationDiagnostic[];

  constructor(profile: DeviceProfile, axisSettings: AxisConfigurationEntry[] = AxisConfiguration.defaultsForProfile(profile),
    sync: SyncConfiguration = new SyncConfiguration(), globalOffsetSeconds: number = 0, profileRevision: number = 0) {
    const resolution = AxisConfiguration.resolveActive(axisSettings, profile);
    const diagnostics: ConfigurationDiagnostic[] = resolution.diagnostics.concat(SyncConfiguration.validate(sync));
    if (diagnostics.some(item => item.severity === 'error')) {
      throw new Error(diagnostics.map(item => item.path + ': ' + item.message).join('; '));
    }
    if (!Number.isFinite(globalOffsetSeconds) || !Number.isSafeInteger(profileRevision) || profileRevision < 0) {
      throw new Error('Invalid global offset or profile revision.');
    }
    this.profile = DeviceProfiles.copy(profile);
    this.profileRevision = profileRevision;
    this.axes = DeviceProfiles.enabledAxes(profile);
    if (resolution.entries.length !== this.axes.length || this.axes.some(axis => !resolution.entries.some(entry => entry.axisName === axis.name))) {
      throw new Error('Every enabled axis must have exactly one configuration.');
    }
    this.axisSettings = resolution.entries.map(entry => new AxisConfigurationEntry(entry.axisName, entry.settings));
    this.diagnostics = diagnostics.map(item => new ConfigurationDiagnostic(item.path, item.code, item.message, item.severity));
    for (const item of this.diagnostics) { Object.freeze(item); }
    Object.freeze(this.diagnostics);
    this.sync = SyncConfiguration.clone(sync);
    this.globalOffsetSeconds = globalOffsetSeconds;
    for (const axis of this.profile.axes.concat(this.axes)) { Object.freeze(axis.funscriptNames); Object.freeze(axis); }
    for (const entry of this.axisSettings) {
      for (const point of entry.settings.smartLimitPoints) { Object.freeze(point); }
      Object.freeze(entry.settings.smartLimitPoints);
      Object.freeze(entry.settings);
      Object.freeze(entry);
    }
    Object.freeze(this.profile.axes);
    Object.freeze(this.profile);
    Object.freeze(this.axes);
    Object.freeze(this.axisSettings);
    Object.freeze(this.sync);
    Object.freeze(this);
  }
}

/** mediaPositionSeconds is supplied by the media clock, never advanced here.
 * monotonicMs is metadata supplied by the session, never used as elapsed delta.
 * playbackSpeed is descriptive: only the MEDIA clock multiplies elapsed by it.
 */
export class AxisStepInput {
  deltaSeconds: number;
  mediaPositionSeconds: number;
  isPlaying: boolean;
  playbackSpeed: number;
  epoch: number;
  monotonicMs: number;
  profileRevision: number;
  constructor(deltaSeconds: number, mediaPositionSeconds: number, isPlaying: boolean,
    playbackSpeed: number = 1, epoch: number = 0, monotonicMs: number = 0, profileRevision: number = 0) {
    this.deltaSeconds = deltaSeconds;
    this.mediaPositionSeconds = mediaPositionSeconds;
    this.isPlaying = isPlaying;
    this.playbackSpeed = playbackSpeed;
    this.epoch = epoch;
    this.monotonicMs = monotonicMs;
    this.profileRevision = profileRevision;
  }
}

/** A rejected tick never becomes an output frame. The narrow provider port
 * cannot undo provider phase/cache, so recovery requires NEW pipeline AND
 * provider instances under a new session epoch, not simply clearing a flag. */
export class AxisPipelineFault {
  readonly epoch: number;
  readonly attemptedSequence: number;
  readonly reason: string;
  readonly recovery: string = 'recreatePipelineAndProviders';
  constructor(epoch: number, attemptedSequence: number, reason: string) {
    this.epoch = epoch;
    this.attemptedSequence = attemptedSequence;
    this.reason = reason;
    Object.freeze(this);
  }
}

/** Internal bounded lineage union. A cap fails closed rather than retaining an
 * unbounded recursive history through sync/speed/home feedback. */
class AxisEvidence {
  primary: AxisValueSource = 'unknown';
  sources: AxisValueSource[] = [];
  origins: AxisSourceOrigin[] = [];
  dependencies: AxisValueDependency[] = [];
  unknown: boolean = false;
  static source(origin: AxisSourceOrigin): AxisEvidence {
    const value: AxisEvidence = new AxisEvidence();
    value.primary = origin.source; value.sources = [origin.source]; value.origins = [origin];
    return value;
  }
  static previous(value: AxisValueProvenance | null, role: AxisDependencyRole): AxisEvidence {
    const result: AxisEvidence = new AxisEvidence();
    if (value === null) { result.unknown = true; result.sources = ['unknown']; return result; }
    result.primary = value.primarySource; result.sources = value.finalSources.slice();
    result.origins = value.origins.slice(); result.dependencies = [new AxisValueDependency(role, value)];
    result.unknown = value.status !== 'known';
    return result;
  }
  static anchor(value: AxisValueProvenance | null, role: AxisHistoricalAnchorRole, sequence: number,
    epoch: number, profileRevision: number, configurationRevision: number): AxisEvidence {
    const result: AxisEvidence = AxisEvidence.previous(value, role);
    if (value !== null) {
      const anchor: AxisHistoricalAnchor = new AxisHistoricalAnchor(role, value, sequence, epoch, profileRevision, configurationRevision);
      // This stage consumes one already-published scalar, not a live read of
      // every historical keyframe/provider/config revision which produced it.
      // Retain its finite/known/profile trust boundary and bounded source-kind
      // summary, but do not recursively expand those old constituent origins.
      result.origins = [new AxisSourceOrigin('historical', value.axisName, value.frameSequence, value.epoch,
        value.profileRevision, value.configurationRevision, value.isPlaying, null, null, null, null,
        value.frameSequence, null, null, null, null, anchor)];
      result.unknown = result.unknown || !anchor.sourceProfileValid || anchor.sourceKinds.length === 0 || anchor.sourceKinds.indexOf('unknown') >= 0;
    }
    return result;
  }
  static held(value: AxisValueProvenance | null, role: AxisDependencyRole): AxisEvidence {
    const evidence: AxisEvidence = AxisEvidence.previous(value, role);
    evidence.primary = 'held';
    if (evidence.sources.indexOf('held') < 0) { evidence.sources.push('held'); }
    return evidence;
  }
  static mix(from: AxisEvidence, to: AxisEvidence, weight: number): AxisEvidence {
    if (weight <= 0) { return from; }
    if (weight >= 1) { return to; }
    return AxisEvidence.union(from, to);
  }
  static union(from: AxisEvidence, to: AxisEvidence): AxisEvidence {
    const result: AxisEvidence = new AxisEvidence();
    result.primary = to.primary;
    result.sources = from.sources.concat(to.sources).filter((item, index, items) => items.indexOf(item) === index);
    const dependencies: AxisValueDependency[] = from.dependencies.concat(to.dependencies).filter((item, index, items) =>
      items.findIndex(other => other.role === item.role && other.axisName === item.axisName && other.frameSequence === item.frameSequence &&
        other.epoch === item.epoch && other.profileRevision === item.profileRevision && other.configurationRevision === item.configurationRevision) === index);
    result.dependencies = dependencies.slice(0, 32);
    result.unknown = from.unknown || to.unknown || dependencies.length > 32;
    for (const origin of from.origins.concat(to.origins)) {
      const index: number = result.origins.findIndex(item => item.source === origin.source && item.axisName === origin.axisName &&
        item.epoch === origin.epoch && item.profileRevision === origin.profileRevision &&
        item.configurationRevision === origin.configurationRevision && item.isPlaying === origin.isPlaying &&
        item.resourceId === origin.resourceId && item.bindingRevision === origin.bindingRevision &&
        item.providerId === origin.providerId && item.providerGeneration === origin.providerGeneration &&
        item.providerConfigurationGeneration === origin.providerConfigurationGeneration &&
        item.providerResourceGeneration === origin.providerResourceGeneration && AxisHistoricalAnchor.same(item.anchor, origin.anchor) && AxisControlInput.same(item.control, origin.control));
      if (index >= 0) {
        const before: AxisSourceOrigin = result.origins[index];
        result.origins[index] = new AxisSourceOrigin(origin.source, origin.axisName,
          Math.min(before.firstFrameSequence, origin.firstFrameSequence), origin.epoch, origin.profileRevision,
          origin.configurationRevision, origin.isPlaying, origin.resourceId, origin.bindingRevision,
          origin.providerId, origin.providerGeneration, Math.max(before.lastFrameSequence, origin.lastFrameSequence),
          origin.providerWriteGeneration === null || before.providerWriteGeneration === null ? null : Math.min(origin.providerWriteGeneration, before.providerWriteGeneration),
          origin.providerConfigurationGeneration, origin.providerResourceGeneration,
          origin.lastProviderWriteGeneration === null || before.lastProviderWriteGeneration === null ? null : Math.max(origin.lastProviderWriteGeneration, before.lastProviderWriteGeneration), origin.anchor);
      } else if (result.origins.length < 64) { result.origins.push(origin); }
      else { result.unknown = true; }
    }
    return result;
  }
}

/** Exact two producer samples for IsDirty and signed Speed, not a recursive
 * value history. The initial none sample explicitly records NaN classification. */
class AxisPriorComparison {
  private readonly from: AxisValueProvenance | null;
  private readonly to: AxisValueProvenance;
  constructor(from: AxisValueProvenance | null, to: AxisValueProvenance) { this.from = from; this.to = to; }
  samples(): AxisValueProvenance[] { return this.from === null ? [this.to] : [this.from, this.to]; }
}

class AxisKnownMotionSample {
  readonly provenance: AxisValueProvenance;
  readonly value: number;
  constructor(provenance: AxisValueProvenance, value: number) { this.provenance = provenance; this.value = value; }
}

class AxisProvenanceTrace {
  stages: AxisExecutedStage[] = [];
  value: AxisEvidence = new AxisEvidence();
  motion: AxisEvidence = new AxisEvidence();
  motionUpdated: boolean = false;
  motionCacheRead: boolean = false;
  motionCacheValidated: boolean = false;
  motionSampleProduced: boolean | null = null;
}

/** Pure source transcription of ScriptViewModel.UpdateThread::UpdateValues.
 * ALL Begin -> ALL Script/Motion/Transition/Final -> ALL End. Cross-axis reads
 * always use this.states (the previous committed frame), never a staged context.
 * Runtime computation does not imply permission to emit a physical command.
 */
export class AxisPipeline {
  private configuration: AxisPipelineConfiguration;
  private readonly providers: AxisMotionProviderPort | null;
  private states: AxisRuntimeState[];
  private transitions: AxisTransition[];
  private bindings: AxisScriptBinding[] = [];
  private staged: AxisRuntimeState[] | null = null;
  private currentEpoch: number;
  private sequence: number = 0;
  private eventId: number = 0;
  private frame: AxisFrame;
  private fault: AxisPipelineFault | null = null;
  private configurationRevision: number = 0;
  private motionGenerations: number[];
  private motionOrigins: (AxisValueProvenance | null)[];
  private knownMotionSamples: AxisKnownMotionSample[][];
  private speedOrigins: (AxisPriorComparison | null)[];
  private activityOrigins: (AxisPriorComparison | null)[];
  private homeStartOrigins: (AxisValueProvenance | null)[];
  private transitionStartOrigins: (AxisValueProvenance | null)[];

  constructor(configuration: AxisPipelineConfiguration, providers: AxisMotionProviderPort | null = null, epoch: number = 0) {
    if (!Number.isSafeInteger(epoch) || epoch < 0) { throw new Error('Invalid session epoch.'); }
    this.configuration = configuration;
    this.providers = providers;
    this.currentEpoch = epoch;
    this.states = configuration.axes.map(axis => new AxisRuntimeState(axis.name));
    this.transitions = configuration.axes.map(() => new AxisTransition());
    this.motionGenerations = configuration.axes.map(() => 0);
    this.motionOrigins = configuration.axes.map(() => null);
    this.knownMotionSamples = configuration.axes.map(() => []);
    this.speedOrigins = configuration.axes.map(() => null);
    this.activityOrigins = configuration.axes.map(() => null);
    this.homeStartOrigins = configuration.axes.map(() => null);
    this.transitionStartOrigins = configuration.axes.map(() => null);
    this.frame = new AxisFrame(0, epoch, 0, Number.NaN, 0, configuration.profileRevision, this.states, [], false,
      this.configurationRevision, this.emptyProvenance(epoch));
  }

  /** Read-only UI observation never advances counters, transitions or providers. */
  snapshot(): AxisFrame { return this.frame; }
  /** Current internal script index includes synchronous configure/invalidation.
   * It is a detached observation, never a new published frame or a sample. */
  inspectAxisRuntime(axisName: string): AxisRuntimeState {
    return Object.freeze(this.states[this.indexOf(axisName)].copy());
  }
  getFault(): AxisPipelineFault | null { return this.fault; }

  /** Source GetValue clamps internal state, including an appended transition
   * whose raw target can exceed the normalized range. NaN remains NaN. */
  getValue(axisName: string): number { return clamp01(this.states[this.indexOf(axisName)].value); }

  /** Advance the session's safety generation without changing source runtime.
   * Confirmed seek then calls invalidateAxes(names, syncOnSeek); prior values,
   * home state and provider/transition phase are retained. snapshot() stays the
   * previous committed frame (and old epoch) until a new step commits, so it
   * cannot accidentally be treated as a fresh frame for the new output epoch.
   * This is not fault recovery and cannot unlock a faulted instance. */
  advanceEpoch(epoch: number): void {
    this.assertIdle();
    if (this.fault !== null) { throw new Error('Fault recovery requires new AxisPipeline and provider instances under a new session epoch.'); }
    if (!Number.isSafeInteger(epoch) || epoch <= this.currentEpoch) { throw new Error('A new session epoch must increase.'); }
    this.currentEpoch = epoch;
  }

  /** Cold start/profile reconstruction only. Seek/media/script invalidation
   * must retain last values and use invalidateAxes/requestSync instead.
   */
  resetRuntime(epoch: number): void {
    this.assertIdle();
    if (this.fault !== null) { throw new Error('Fault recovery requires new AxisPipeline and provider instances under a new session epoch.'); }
    if (!Number.isSafeInteger(epoch) || epoch <= this.currentEpoch) { throw new Error('A new session epoch must increase.'); }
    this.currentEpoch = epoch;
    this.states = this.configuration.axes.map(axis => new AxisRuntimeState(axis.name));
    this.transitions = this.configuration.axes.map(() => new AxisTransition());
    this.bindings = [];
    this.motionOrigins = this.configuration.axes.map(() => null);
    this.knownMotionSamples = this.configuration.axes.map(() => []);
    this.speedOrigins = this.configuration.axes.map(() => null);
    this.activityOrigins = this.configuration.axes.map(() => null);
    this.homeStartOrigins = this.configuration.axes.map(() => null);
    this.transitionStartOrigins = this.configuration.axes.map(() => null);
    this.frame = new AxisFrame(this.sequence, epoch, 0, Number.NaN, 0, this.configuration.profileRevision, this.states, [], false, this.configurationRevision, this.emptyProvenance(epoch));
  }

  /** Call after any out-of-band provider configure/reset/script mutation. This
   * invalidates observation only: no numerical value, phase or sync changes.
   * Retained old-value lineage also becomes unknown until actually replaced. */
  invalidateMotionProvenance(axisNames?: string[]): void {
    this.assertIdle();
    const names: string[] = axisNames === undefined ? this.configuration.axes.map(axis => axis.name) : axisNames;
    const indices: number[] = names.map(name => this.indexOf(name));
    for (const index of indices) { this.motionGenerations[index]++; this.motionOrigins[index] = null; }
  }

  /** Source ResetSyncNoLock; provider end callbacks may call during step. */
  requestSync(axisNames?: string[], enabled: boolean = true): void {
    const targets: AxisRuntimeState[] = this.staged === null ? this.states : this.staged;
    const names: string[] = axisNames === undefined ? this.configuration.axes.map(axis => axis.name) : axisNames;
    for (const name of names) { targets[this.indexOf(name)].syncTimeSeconds = enabled ? this.configuration.sync.durationSeconds : 0; }
  }

  invalidateAxes(axisNames?: string[], requestSync: boolean = true): void {
    this.assertIdle();
    const names: string[] = axisNames === undefined ? this.configuration.axes.map(axis => axis.name) : axisNames;
    for (const name of names) { this.states[this.indexOf(name)].index = AXIS_INDEX_INVALID; }
    if (requestSync) { this.requestSync(names); }
  }

  /** Source SetAxisTransition: append may exceed 0–1 until final-value clamping. */
  setTransition(axisName: string, value: number, durationSeconds: number, offset: boolean = false): void {
    this.assertIdle();
    if (!Number.isFinite(value) || !Number.isFinite(durationSeconds) || durationSeconds < 0) { throw new Error('Invalid transition value or seconds.'); }
    const index: number = this.indexOf(axisName);
    const transition: AxisTransition = this.transitions[index];
    if (offset && transition.isInitialized && !transition.isFinished) { transition.append(value, durationSeconds); }
    else {
      const from: number = Number.isFinite(this.states[index].value) ? this.states[index].value : this.configuration.axes[index].defaultValue;
      transition.set(from, clamp01(offset ? from + value : value), durationSeconds);
      this.transitionStartOrigins[index] = Number.isFinite(this.states[index].value) ? this.previousProvenance(axisName) : null;
    }
  }

  /** Explicit OHOS safety reset, not an upstream transition event. Preserve
   * last computed fields and the immutable published frame until a real tick. */
  clearTransitions(): void {
    this.assertIdle();
    this.transitions = this.configuration.axes.map(() => new AxisTransition());
    this.transitionStartOrigins = this.configuration.axes.map(() => null);
  }

  /** Ordered UI commands adopt settings immediately without sampling/advancing.
   * The last immutable frame keeps its original revision until the next step. */
  configure(configuration: AxisPipelineConfiguration, scriptBindings?: AxisScriptBinding[]): void {
    this.assertIdle();
    if (this.fault !== null) { throw new Error('Faulted pipeline requires reconstruction.'); }
    if (configuration.profileRevision !== this.configuration.profileRevision ||
      JSON.stringify(configuration.profile) !== JSON.stringify(this.configuration.profile)) {
      throw new Error('Profile changes require whole-session reconstruction.');
    }
    this.adoptConfiguration(configuration);
    if (scriptBindings !== undefined) { this.adoptBindings(scriptBindings); }
  }

  /** Errors publish no frame. External providers and transitions can already
   * have advanced before a later axis rejects a tick; they are NOT rollbackable
   * through this narrow port. The session must stop dispatch and reconstruct
   * runtime/provider state after a failure, never silently resume a partial tick.
   * In particular the source stationary speed-limit delta=0 case is rejected
   * explicitly rather than returning a fabricated valid value. */
  step(input: AxisStepInput, configurationSnapshot: AxisPipelineConfiguration = this.configuration,
    scriptBindings: AxisScriptBinding[] = this.bindings): AxisFrame {
    this.assertIdle();
    if (this.fault !== null) { throw new Error('Axis pipeline is faulted: ' + this.fault.reason); }
    // Capture one call boundary before invoking provider callbacks. A caller
    // retaining its mutable input object cannot retag later axes in this tick.
    input = new AxisStepInput(input.deltaSeconds, input.mediaPositionSeconds, input.isPlaying,
      input.playbackSpeed, input.epoch, input.monotonicMs, input.profileRevision);
    this.validateInput(input, configurationSnapshot);
    if (this.providers === null && configurationSnapshot.axisSettings.some(entry =>
      entry.settings.selectedMotionProvider !== null && !entry.settings.bypassMotionProvider)) {
      throw new Error('Selected motion provider requires an explicit provider port.');
    }
    this.adoptConfiguration(configurationSnapshot);
    this.adoptBindings(scriptBindings);
    // BeginUpdate for every axis. These staged counters/values never alias state.
    const contexts: AxisRuntimeState[] = this.states.map(state => {
      const context: AxisRuntimeState = state.copy();
      context.value = Number.NaN;
      context.scriptValue = Number.NaN;
      context.motionProviderValue = Number.NaN;
      context.transitionValue = Number.NaN;
      return context;
    });
    const traces: AxisProvenanceTrace[] = contexts.map(() => new AxisProvenanceTrace());
    this.staged = contexts;
    try {
      for (let index: number = 0; index < contexts.length; index++) {
        const axis: DeviceAxisDefinition = this.configuration.axes[index];
        const settings: AxisConfiguration = this.settings(axis.name);
        const context: AxisRuntimeState = contexts[index];
        const last: AxisRuntimeState = this.states[index];
        const binding: AxisScriptBinding | undefined = this.bindings.find(item => item.axisName === axis.name);
        const resource: AxisScriptResource | null = binding === undefined ? null : binding.resource;
        const trace: AxisProvenanceTrace = traces[index];
        this.updateScript(input, axis, settings, context, resource, trace);
        this.updateMotion(input, axis, settings, context, last, resource, trace);
        if (!settings.bypassTransition) {
          trace.stages.push('transitionUpdate');
          context.transitionValue = this.transitions[index].update(input.deltaSeconds);
        }
        this.calculateFinal(input, axis, settings, context, last, trace);
      }
      // EndUpdate only after every axis update. Event targets use raw keyframes.
      const nextSequence: number = this.sequence + 1;
      const events: AxisEvent[] = [];
      for (let index: number = 0; index < contexts.length; index++) {
        const context: AxisRuntimeState = contexts[index];
        const last: AxisRuntimeState = this.states[index];
        context.isDirty = axisValueChanged(last.value, context.value);
        if (Number.isFinite(context.value) && Number.isFinite(last.value)) {
          context.speed = (last.value - context.value) / input.deltaSeconds;
        }
        const event: AxisEvent | null = this.makeEvent(context, last, nextSequence);
        if (event !== null) { events.push(event); }
      }
      const provenance: AxisValueProvenance[] = contexts.map((context, index) => this.publishProvenance(input, context, traces[index]));
      for (let index: number = 0; index < contexts.length; index++) {
        // Retain only two immutable value summaries. Their flattened union is
        // lazy, since most axes are never used as a motion follow/speed input.
        const comparison: AxisPriorComparison = new AxisPriorComparison(this.previousProvenance(contexts[index].axisName), provenance[index]);
        this.activityOrigins[index] = comparison;
        if (Number.isFinite(contexts[index].value) && Number.isFinite(this.states[index].value)) {
          this.speedOrigins[index] = comparison;
        }
      }
      const frame: AxisFrame = new AxisFrame(nextSequence, input.epoch, input.monotonicMs,
        input.mediaPositionSeconds * 1000, input.deltaSeconds, input.profileRevision, contexts, events,
        input.isPlaying, this.configurationRevision, provenance);
      this.states = contexts;
      this.sequence = nextSequence;
      this.frame = frame;
      return frame;
    } catch (error) {
      const reason: string = error instanceof Error ? error.message : 'Axis tick failed.';
      this.fault = new AxisPipelineFault(this.currentEpoch, this.sequence + 1, reason);
      throw new Error('Axis pipeline fault: ' + reason);
    } finally { this.staged = null; }
  }

  private updateScript(input: AxisStepInput, axis: DeviceAxisDefinition, settings: AxisConfiguration,
    context: AxisRuntimeState, resource: AxisScriptResource | null, trace: AxisProvenanceTrace): void {
    context.insideGap = false;
    if (settings.bypassScript || resource === null || resource.keyframes.length === 0) { return; }
    const points: AxisKeyframe[] = resource.keyframes;
    const position: number = input.mediaPositionSeconds - this.configuration.globalOffsetSeconds - settings.offsetSeconds;
    if (context.invalid || (AxisKeyframes.valid(points, context.index) && points[context.index].positionSeconds > position) ||
      (context.afterScript && points[points.length - 1].positionSeconds > position)) {
      context.index = AxisKeyframes.searchForIndexBefore(points, position);
    }
    if (context.afterScript) { return; }
    const beforeIndex: number = context.index;
    context.index = AxisKeyframes.advanceIndex(points, context.index, position);
    if (this.configuration.sync.syncOnScriptStart && beforeIndex === AXIS_INDEX_BEFORE && context.index >= 0) {
      context.syncTimeSeconds = this.configuration.sync.durationSeconds;
    }
    if (!AxisKeyframes.valid(points, context.index) || !AxisKeyframes.valid(points, context.index + 1)) {
      if (this.configuration.sync.syncOnScriptEnd && context.index + 1 >= points.length) {
        context.index = AXIS_INDEX_AFTER;
        context.syncTimeSeconds = this.configuration.sync.durationSeconds;
      }
      return;
    }
    if (context.beforeScript) { return; }
    context.insideGap = AxisKeyframes.isGap(points, context.index);
    trace.stages.push('script');
    const interpolated: number = clamp01(AxisKeyframes.interpolate(points, context.index, position, settings.interpolationType));
    context.scriptValue = clamp01(axis.defaultValue + (interpolated - axis.defaultValue) * settings.scriptScale);
    if (settings.invertScript) { context.scriptValue = 1 - context.scriptValue; }
  }

  private updateMotion(input: AxisStepInput, axis: DeviceAxisDefinition, settings: AxisConfiguration,
    context: AxisRuntimeState, last: AxisRuntimeState, resource: AxisScriptResource | null, trace: AxisProvenanceTrace): void {
    if (settings.selectedMotionProvider === null || settings.bypassMotionProvider) { return; }
    if (this.providers === null) { throw new Error('Selected motion provider requires an explicit provider port: ' + axis.name); }
    let canFillGap: boolean = false;
    if (settings.motionProviderFillGaps && resource !== null && resource.keyframes.length > 0) {
      const points: AxisKeyframe[] = resource.keyframes;
      if (context.insideGap && AxisKeyframes.gapDuration(points, context.index) >= settings.motionProviderMinimumGapDurationSeconds) {
        if (!last.insideGap) { context.syncTimeSeconds = this.configuration.sync.durationSeconds; }
        canFillGap = true;
      } else if (last.insideGap && AxisKeyframes.gapDuration(points, last.index) >= settings.motionProviderMinimumGapDurationSeconds) {
        context.syncTimeSeconds = this.configuration.sync.durationSeconds;
      }
    }
    let shouldUpdate: boolean = (settings.updateMotionProviderWhenPaused || input.isPlaying) &&
      (canFillGap || settings.updateMotionProviderWithoutScript || context.insideScript);
    if (settings.updateMotionProviderWithAxis !== null) {
      const target: AxisRuntimeState = this.states[this.indexOf(settings.updateMotionProviderWithAxis)];
      if (!target.isDirty || target.isAutoHoming) { shouldUpdate = false; }
    }
    const axisIndex: number = this.indexOf(axis.name);
    let observation: AxisMotionSampleObservation | undefined = undefined;
    if (shouldUpdate) {
      trace.stages.push('motionUpdate'); trace.motionUpdated = true;
      const result: AxisMotionSampleObservation | void = this.providers.update(axis.name, settings.selectedMotionProvider, input.deltaSeconds);
      if (result) { observation = result; }
      trace.motionSampleProduced = observation === undefined ? null : observation.didWrite && observation.source === 'fresh';
    } else if (this.providers.getObservation !== undefined) { observation = this.providers.getObservation(axis.name); }
    trace.stages.push('motionRead'); trace.motionCacheRead = true;
    const sampleValue: number = this.providers.getValue(axis.name);
    if (observation !== undefined) {
      const produced: boolean = this.observeMotion(input, axis.name, settings.selectedMotionProvider, observation, sampleValue, shouldUpdate);
      if (shouldUpdate) { trace.motionSampleProduced = produced; }
      const observed: AxisValueProvenance | null = this.motionOrigins[axisIndex];
      trace.motionCacheValidated = observed !== null && observed.origins[0].providerId === settings.selectedMotionProvider &&
        observed.origins[0].providerGeneration === this.motionGenerations[axisIndex];
    } else { this.motionOrigins[axisIndex] = null; }
    const blend: number = context.insideScript && !canFillGap ? clamp01(settings.motionProviderBlend) : 1;
    const from: number = Number.isFinite(context.scriptValue) ? context.scriptValue : axis.defaultValue;
    const value: number = clamp01(lerp(from, sampleValue, blend));
    if (Number.isFinite(value)) {
      context.motionProviderValue = value;
      trace.stages.push('motionBlend');
      const base: AxisEvidence = this.sourceEvidence(input, axis.name, Number.isFinite(context.scriptValue) ? 'script' : 'default');
      const sample: AxisEvidence = AxisEvidence.previous(this.motionOrigins[axisIndex], 'motionCache');
      trace.motion = AxisEvidence.mix(base, sample, blend);
      trace.motion.primary = 'motion';
      if (settings.updateMotionProviderWithAxis !== null) {
        trace.motion = AxisEvidence.union(this.controlEvidence(input, axis.name, 'motionFollow', 'activity', this.activityOrigins[this.indexOf(settings.updateMotionProviderWithAxis)]?.samples() ?? []), trace.motion);
      }
    }
  }

  private calculateFinal(input: AxisStepInput, axis: DeviceAxisDefinition, settings: AxisConfiguration,
    context: AxisRuntimeState, last: AxisRuntimeState, trace: AxisProvenanceTrace): void {
    context.value = last.value;
    trace.value = AxisEvidence.previous(this.previousProvenance(axis.name), 'held');
    trace.value.primary = 'held';
    if (Number.isFinite(last.value) && trace.value.sources.indexOf('held') < 0) { trace.value.sources.push('held'); }
    const homeAllowed: boolean = Number.isFinite(context.value) && settings.autoHomeEnabled &&
      (settings.autoHomeInsideScript || !context.insideScript || !input.isPlaying) &&
      !axisValueChanged(last.scriptValue, context.scriptValue) && !axisValueChanged(last.motionProviderValue, context.motionProviderValue) &&
      !(axisValueChanged(last.transitionValue, context.transitionValue) && context.invalid && settings.selectedMotionProvider === null);
    if (!homeAllowed) {
      context.autoHomeTimeSeconds = 0;
      context.autoHomeStartValue = Number.NaN;
      context.isAutoHoming = false;
      this.homeStartOrigins[this.indexOf(axis.name)] = null;
    }
    if (Number.isFinite(context.scriptValue)) {
      context.value = context.scriptValue;
      trace.value = this.sourceEvidence(input, axis.name, 'script');
    }
    if (Number.isFinite(context.motionProviderValue)) {
      context.value = context.motionProviderValue;
      trace.value = trace.motion;
      if (settings.motionProviderSpeedLimitWithAxis && settings.updateMotionProviderWithAxis !== null) {
        const maxSpeed: number = Math.abs(this.states[this.indexOf(settings.updateMotionProviderWithAxis)].speed);
        const step: number = context.motionProviderValue - last.value;
        if (Number.isFinite(maxSpeed) && Number.isFinite(step) && Math.abs(step / input.deltaSeconds) > maxSpeed) {
          context.value = clamp01(last.value + maxSpeed * input.deltaSeconds * Math.sign(step));
          trace.stages.push('motionFollowLimit');
          const previous: AxisEvidence = this.anchorEvidence(input, this.previousProvenance(axis.name), 'speedPrevious', maxSpeed * input.deltaSeconds === 0);
          trace.value = maxSpeed * input.deltaSeconds === 0 ? previous : AxisEvidence.union(previous, trace.value);
          trace.value = AxisEvidence.union(this.controlEvidence(input, axis.name, 'motionFollow', 'speed', this.speedOrigins[this.indexOf(settings.updateMotionProviderWithAxis)]?.samples() ?? []), trace.value);
        }
      }
    }
    if (Number.isFinite(context.transitionValue) && (settings.bypassScript || context.invalid) &&
      (settings.bypassMotionProvider || settings.selectedMotionProvider === null)) {
      context.value = context.transitionValue; trace.stages.push('transition');
      trace.value = this.sourceEvidence(input, axis.name, 'transition');
      const start: AxisValueProvenance | null = this.transitionStartOrigins[this.indexOf(axis.name)];
      if (start !== null) { trace.value = AxisEvidence.union(this.anchorEvidence(input, start, 'transitionStart'), trace.value); }
    }
    if (homeAllowed) { this.updateHome(input, axis, settings, context, last, trace); }
    if (this.configuration.sync.syncOnAutoHomeStartEnd && last.isAutoHoming && !context.isAutoHoming) {
      context.syncTimeSeconds = this.configuration.sync.durationSeconds;
    }
    if (context.syncTimeSeconds > 0) {
      const progress: number = clamp01(Math.pow(2, -10 * clamp01(context.syncTimeSeconds / this.configuration.sync.durationSeconds)));
      context.syncTimeSeconds -= input.deltaSeconds;
      if (!context.isAutoHoming && Number.isFinite(context.value)) {
        context.value = clamp01(lerp(Number.isFinite(last.value) ? last.value : axis.defaultValue, context.value, progress));
        trace.stages.push('sync');
        const previous: AxisEvidence = Number.isFinite(last.value) ? this.anchorEvidence(input, this.previousProvenance(axis.name), 'syncPrevious') :
          this.sourceEvidence(input, axis.name, 'default');
        trace.value = AxisEvidence.mix(previous, trace.value, progress);
      }
    }
    context.isSmartLimited = false;
    if (settings.smartLimitInputAxis !== null && Number.isFinite(context.value) && settings.smartLimitPoints.length > 0) {
      const x: number = this.states[this.indexOf(settings.smartLimitInputAxis)].value * 100;
      if (Number.isFinite(x)) {
        const factor: number = this.smartFactor(settings.smartLimitPoints, x) / 100;
        if (settings.smartLimitMode === 'value') {
          context.value = clamp01(lerp(settings.smartLimitTargetValue, context.value, factor));
          trace.stages.push('smartValue');
          trace.value = AxisEvidence.mix(this.sourceEvidence(input, axis.name, 'default'), trace.value, factor);
          trace.value = AxisEvidence.union(this.controlEvidence(input, axis.name, 'smartInput', 'value', [this.previousProvenance(settings.smartLimitInputAxis)!]), trace.value);
        } else if (Number.isFinite(last.value)) {
          context.value = clamp01(lerp(last.value, context.value, Math.pow(factor, 4)));
          trace.stages.push('smartSpeed');
          trace.value = AxisEvidence.mix(this.anchorEvidence(input, this.previousProvenance(axis.name), 'smartPrevious', Math.pow(factor, 4) <= 0), trace.value, Math.pow(factor, 4));
          trace.value = AxisEvidence.union(this.controlEvidence(input, axis.name, 'smartInput', 'value', [this.previousProvenance(settings.smartLimitInputAxis)!]), trace.value);
        }
        context.isSmartLimited = factor < 1;
      }
    }
    context.isSpeedLimited = false;
    const step: number = context.value - last.value;
    if (settings.speedLimitEnabled && Number.isFinite(step)) {
      const speed: number = step / input.deltaSeconds;
      if (!(Math.abs(speed) < settings.speedLimitUnitsPerSecond)) {
        // C# Math.Sign(NaN) throws: zero-delta stationary speed limit is NOT
        // silently coerced. Normal session ticks should supply positive delta.
        if (Number.isNaN(speed)) { throw new Error('Upstream Math.Sign(NaN): stationary speed limit with zero delta.'); }
        context.value = clamp01(last.value + settings.speedLimitUnitsPerSecond * input.deltaSeconds * Math.sign(speed));
        context.isSpeedLimited = true;
        trace.stages.push('speedLimit');
        const previous: AxisEvidence = this.anchorEvidence(input, this.previousProvenance(axis.name), 'speedPrevious', settings.speedLimitUnitsPerSecond * input.deltaSeconds === 0);
        trace.value = settings.speedLimitUnitsPerSecond * input.deltaSeconds === 0 ? previous : AxisEvidence.union(previous, trace.value);
      }
    }
  }

  private updateHome(input: AxisStepInput, axis: DeviceAxisDefinition, settings: AxisConfiguration,
    context: AxisRuntimeState, last: AxisRuntimeState, trace: AxisProvenanceTrace): void {
    context.autoHomeTimeSeconds += input.deltaSeconds;
    const delay: number = settings.autoHomeDelaySeconds;
    const duration: number = settings.autoHomeDurationSeconds;
    let t: number;
    if (delay < 0.001 && duration < 0.001) { t = 1; }
    else if (delay < 0.001) { t = context.autoHomeTimeSeconds / duration; }
    else if (duration < 0.001) { t = context.autoHomeTimeSeconds <= delay ? 0 : 1; }
    else { t = (context.autoHomeTimeSeconds - delay) / duration; }
    context.isAutoHoming = t >= 0;
    if (t <= 0) { trace.stages.push('autoHomeWait'); return; }
    trace.stages.push('autoHome');
    if (t >= 1 && Math.abs(context.value - settings.autoHomeTargetValue) < 0.00001) {
      context.value = settings.autoHomeTargetValue;
      trace.value = this.sourceEvidence(input, axis.name, 'autoHome');
      return;
    }
    if (!Number.isFinite(context.autoHomeStartValue)) {
      context.autoHomeStartValue = Number.isFinite(last.value) ? last.value : axis.defaultValue;
      this.homeStartOrigins[this.indexOf(axis.name)] = Number.isFinite(last.value) ? this.previousProvenance(axis.name) : null;
    }
    t = clamp01(t);
    context.value = clamp01(lerp(context.autoHomeStartValue, settings.autoHomeTargetValue, t * t * (3 - 2 * t)));
    const start: AxisValueProvenance | null = this.homeStartOrigins[this.indexOf(axis.name)];
    const previous: AxisEvidence = start === null ? this.sourceEvidence(input, axis.name, 'default') : this.anchorEvidence(input, start, 'autoHomeStart');
    trace.value = AxisEvidence.mix(previous, this.sourceEvidence(input, axis.name, 'autoHome'), t * t * (3 - 2 * t));
  }

  private smartFactor(points: SmartLimitPoint[], x: number): number {
    if (x < points[0].x) { return points[0].y; }
    for (let index: number = 1; index < points.length; index++) {
      if (x >= points[index - 1].x && x < points[index].x) {
        return lerp(points[index - 1].y, points[index].y, (x - points[index - 1].x) / (points[index].x - points[index - 1].x));
      }
    }
    return points[points.length - 1].y;
  }

  private makeEvent(context: AxisRuntimeState, last: AxisRuntimeState, sequence: number): AxisEvent | null {
    const settings: AxisConfiguration = this.settings(context.axisName);
    if (!last.isAutoHoming && context.isAutoHoming) {
      return new AxisEvent(++this.eventId, this.currentEpoch, sequence, 'autoHome', context.axisName,
        settings.autoHomeTargetValue, settings.autoHomeDurationSeconds);
    }
    if (last.index === context.index) { return null; }
    const binding: AxisScriptBinding | undefined = this.bindings.find(item => item.axisName === context.axisName);
    const points: AxisKeyframe[] = binding === undefined || binding.resource === null ? [] : binding.resource.keyframes;
    const from: AxisKeyframe | null = AxisKeyframes.valid(points, context.index) ? points[context.index] : null;
    const to: AxisKeyframe | null = AxisKeyframes.valid(points, context.index + 1) ? points[context.index + 1] : null;
    let target: number = to === null ? Number.NaN : to.value;
    const duration: number = from === null || to === null ? Number.NaN : to.positionSeconds - from.positionSeconds;
    if (settings.speedLimitEnabled && from !== null && to !== null) {
      const step: number = to.value - from.value;
      const speed: number = step / duration;
      if (Number.isFinite(step) && !(Math.abs(speed) < settings.speedLimitUnitsPerSecond)) {
        if (Number.isNaN(speed)) { throw new Error('Upstream Math.Sign(NaN) in script event.'); }
        target = clamp01(from.value + settings.speedLimitUnitsPerSecond * duration * Math.sign(speed));
      }
    }
    return new AxisEvent(++this.eventId, this.currentEpoch, sequence,
      settings.speedLimitEnabled ? 'speedLimitedScript' : 'script', context.axisName, target, duration,
      from, to, settings.speedLimitEnabled ? settings.speedLimitUnitsPerSecond : null);
  }

  private validateInput(input: AxisStepInput, configuration: AxisPipelineConfiguration): void {
    if (!Number.isFinite(input.deltaSeconds) || input.deltaSeconds < 0 ||
      (!Number.isFinite(input.mediaPositionSeconds) && !Number.isNaN(input.mediaPositionSeconds)) ||
      !Number.isFinite(input.playbackSpeed) || input.playbackSpeed <= 0 || typeof input.isPlaying !== 'boolean' ||
      !Number.isFinite(input.monotonicMs) || input.monotonicMs < 0) { throw new Error('Invalid axis frame input.'); }
    if (input.epoch !== this.currentEpoch) { throw new Error('Stale or uninitialized session epoch.'); }
    if (input.profileRevision !== configuration.profileRevision || configuration.profileRevision !== this.configuration.profileRevision ||
      JSON.stringify(configuration.profile) !== JSON.stringify(this.configuration.profile)) {
      throw new Error('Profile changes require whole-session reconstruction.');
    }
  }

  private adoptConfiguration(next: AxisPipelineConfiguration): void {
    if (next === this.configuration) { return; }
    const previous: AxisPipelineConfiguration = this.configuration;
    if (JSON.stringify(previous.axisSettings) !== JSON.stringify(next.axisSettings) ||
      JSON.stringify(previous.sync) !== JSON.stringify(next.sync) || previous.globalOffsetSeconds !== next.globalOffsetSeconds) {
      this.configurationRevision++;
    }
    this.configuration = next;
    if (previous.globalOffsetSeconds !== next.globalOffsetSeconds) { this.requestSync(); }
    for (const entry of next.axisSettings) {
      const before: AxisConfiguration = previous.axisSettings.find(item => item.axisName === entry.axisName)!.settings;
      const after: AxisConfiguration = entry.settings;
      // OnAxisSettingsPropertyChanged plus the source offset/scale/invert and
      // selected Smart/Motion handlers. Link selection/priority calls ReloadAxes,
      // which resets sync even when equal linked resource content is retained.
      // Unrelated edits do not continually sync.
      if (before.updateMotionProviderWhenPaused !== after.updateMotionProviderWhenPaused ||
        before.updateMotionProviderWithoutScript !== after.updateMotionProviderWithoutScript ||
        before.motionProviderFillGaps !== after.motionProviderFillGaps || before.bypassScript !== after.bypassScript ||
        before.bypassMotionProvider !== after.bypassMotionProvider || before.bypassTransition !== after.bypassTransition ||
        before.autoHomeEnabled !== after.autoHomeEnabled || before.autoHomeTargetValue !== after.autoHomeTargetValue ||
        before.offsetSeconds !== after.offsetSeconds || before.scriptScale !== after.scriptScale || before.invertScript !== after.invertScript ||
        before.smartLimitInputAxis !== after.smartLimitInputAxis || before.updateMotionProviderWithAxis !== after.updateMotionProviderWithAxis ||
        before.selectedMotionProvider !== after.selectedMotionProvider || before.linkAxis !== after.linkAxis ||
        before.linkAxisHasPriority !== after.linkAxisHasPriority) { this.requestSync([entry.axisName]); }
    }
  }

  private adoptBindings(bindings: AxisScriptBinding[]): void {
    if (bindings === this.bindings) { return; }
    const seen: string[] = [];
    const next: AxisScriptBinding[] = [];
    for (const binding of bindings) {
      this.indexOf(binding.axisName);
      if (seen.indexOf(binding.axisName) >= 0) { throw new Error('Duplicate script binding.'); }
      seen.push(binding.axisName);
      const previous: AxisScriptBinding | undefined = this.bindings.find(item => item.axisName === binding.axisName);
      // Immutable class resources can be shared; plain incoming objects are
      // copied before they can become retained state.
      const resource: AxisScriptResource | null = binding.resource === null ? null :
        binding.resource instanceof AxisScriptResource && Object.isFrozen(binding.resource) ? binding.resource : AxisScriptResource.copy(binding.resource);
      const copy: AxisScriptBinding = new AxisScriptBinding(binding.axisName, resource, binding.linkedFromAxis, binding.revision);
      next.push(copy);
      if (previous === undefined ? resource !== null : previous.revision !== copy.revision ||
        previous.resource !== copy.resource) {
        this.invalidateAxes([binding.axisName], this.configuration.sync.syncOnScriptResourceChanged);
      }
    }
    for (const previous of this.bindings) {
      if (seen.indexOf(previous.axisName) < 0 && previous.resource !== null) {
        this.invalidateAxes([previous.axisName], this.configuration.sync.syncOnScriptResourceChanged);
      }
    }
    this.bindings = next;
  }

  private observeMotion(input: AxisStepInput, axisName: string, requestedProvider: string,
    observation: AxisMotionSampleObservation, value: number, didUpdate: boolean): boolean {
    const index: number = this.indexOf(axisName);
    const valid: boolean = observation.actualProviderId !== null && observation.actualProviderId.length > 0 &&
      Number.isSafeInteger(observation.providerWriteGeneration) && observation.providerWriteGeneration > 0 &&
      Number.isSafeInteger(observation.cacheWriteGeneration) && observation.cacheWriteGeneration > 0 &&
      Number.isSafeInteger(observation.configurationGeneration) && observation.configurationGeneration >= 0 &&
      (observation.currentConfigurationGeneration === undefined ||
        observation.currentConfigurationGeneration === observation.configurationGeneration) &&
      Number.isSafeInteger(observation.resourceGeneration) && observation.resourceGeneration >= 0 &&
      Object.is(value, observation.cachedValue) && Number.isFinite(value) &&
      (observation.source === 'fresh' || observation.source === 'retained');
    if (!valid) { this.motionOrigins[index] = null; return false; }
    const prior: AxisKnownMotionSample | undefined = this.knownMotionSamples[index].find(item => item.provenance.origins[0].providerId === observation.actualProviderId);
    const advances: boolean = prior === undefined || observation.providerWriteGeneration > prior.provenance.origins[0].providerWriteGeneration!;
    if (didUpdate && observation.didWrite && observation.source === 'fresh' && observation.actualProviderId === requestedProvider && advances) {
      const provenance: AxisValueProvenance = this.sourceProvenance(input, axisName, 'motion', observation.actualProviderId, observation);
      // Each provider needs only its last known sample; switching back to an
      // older private cached value can be identified, never timestamp-refreshed.
      this.knownMotionSamples[index] = this.knownMotionSamples[index].filter(item => item.provenance.origins[0].providerId !== observation.actualProviderId);
      if (this.knownMotionSamples[index].length >= 64) { this.knownMotionSamples[index].shift(); }
      this.knownMotionSamples[index].push(new AxisKnownMotionSample(provenance, value));
      this.motionOrigins[index] = provenance;
      return true;
    } else {
      this.motionOrigins[index] = this.knownMotionSamples[index].find(item => {
        const origin: AxisSourceOrigin = item.provenance.origins[0];
        return Object.is(item.value, value) && origin.providerId === observation.actualProviderId && origin.providerWriteGeneration === observation.providerWriteGeneration &&
          origin.providerConfigurationGeneration === observation.configurationGeneration && origin.providerResourceGeneration === observation.resourceGeneration &&
          origin.resourceId === observation.resourceId;
      })?.provenance ?? null;
      return false;
    }
  }

  private controlEvidence(input: AxisStepInput, axisName: string, role: AxisControlRole,
    inputKind: AxisControlInputKind, samples: AxisValueProvenance[]): AxisEvidence {
    const evidence: AxisEvidence = new AxisEvidence();
    if (samples.length === 0) { evidence.unknown = true; evidence.sources = ['unknown']; return evidence; }
    const references: AxisControlReference[] = [];
    let complete: boolean = samples.length <= 2;
    for (const sample of samples) {
      // Activity's older nonfinite value contributes only a classification to
      // IsDirty. It is not a numeric/unknown scalar promoted to trusted input.
      for (const origin of sample.origins) {
        let additions: AxisControlReference[] = [];
        if (origin.source === 'script') {
          additions = [new AxisControlReference('script', origin.axisName, origin.resourceId, origin.bindingRevision, null, null, origin.lastFrameSequence, sample.frameSequence)];
        } else if (origin.source === 'motion') {
          // Carry production identity separately from the current eligibility.
          additions = [new AxisControlReference('motion', origin.axisName, origin.resourceId, null, origin.providerId, origin.providerGeneration, origin.lastFrameSequence, sample.frameSequence, sample.motionCacheValidated)];
        } else if (origin.source === 'control') {
          complete = complete && origin.control !== null;
          additions = origin.control === null ? [] : origin.control.references;
        }
        for (const reference of additions) {
          const previousIndex: number = references.findIndex(item => item.kind === reference.kind && item.axisName === reference.axisName);
          if (previousIndex >= 0) {
            const prior: AxisControlReference = references[previousIndex];
            // A later actual production supersedes the earlier reference; a
            // mere re-read never advances producerFrameSequence. This permits
            // a real fresh write to recover eligibility after a held cache.
            if (reference.producerFrameSequence > prior.producerFrameSequence) { references[previousIndex] = reference; }
            else if (reference.producerFrameSequence === prior.producerFrameSequence && reference.requiredFrameSequence > prior.requiredFrameSequence) {
              references[previousIndex] = reference;
            } else if (reference.producerFrameSequence === prior.producerFrameSequence && reference.requiredFrameSequence === prior.requiredFrameSequence) {
              complete = complete && AxisControlReference.same(prior, reference);
            }
          } else if (references.length < 64) { references.push(reference); }
          else { complete = false; }
        }
      }
    }
    const valid: boolean = complete && references.every(reference => this.currentControlReference(reference));
    const control: AxisControlInput = new AxisControlInput(role, inputKind, samples.map(sample => new AxisControlSample(sample)),
      references, valid, this.frame, axisName, this.sequence + 1, input.epoch, input.profileRevision, this.configurationRevision);
    const source: AxisValueProvenance = samples[samples.length - 1];
    evidence.primary = source.primarySource; evidence.sources = control.sourceKinds.slice();
    evidence.origins = [new AxisSourceOrigin('control', source.axisName, source.frameSequence, source.epoch,
      source.profileRevision, source.configurationRevision, source.isPlaying, null, null, null, null,
      source.frameSequence, null, null, null, null, null, control)];
    evidence.dependencies = [new AxisValueDependency(role, source)];
    evidence.unknown = !complete || control.sourceStatus !== 'known';
    return evidence;
  }

  private currentControlReference(reference: AxisControlReference): boolean {
    const index: number = this.configuration.axes.findIndex(axis => axis.name === reference.axisName);
    if (index < 0) { return false; }
    if (reference.kind === 'script') {
      const binding: AxisScriptBinding | undefined = this.bindings.find(item => item.axisName === reference.axisName);
      return binding !== undefined && binding.resource !== null && binding.resource.resourceId === reference.resourceId &&
        binding.revision === reference.bindingRevision;
    }
    return reference.observationValidated && reference.providerGeneration === this.motionGenerations[index] &&
      reference.providerId === this.settings(reference.axisName).selectedMotionProvider;
  }

  private anchorEvidence(input: AxisStepInput, source: AxisValueProvenance | null,
    role: AxisHistoricalAnchorRole, held: boolean = false): AxisEvidence {
    const evidence: AxisEvidence = AxisEvidence.anchor(source, role, this.sequence + 1, input.epoch,
      input.profileRevision, this.configurationRevision);
    if (held) {
      evidence.primary = 'held';
      if (evidence.sources.indexOf('held') < 0) { evidence.sources.push('held'); }
    }
    return evidence;
  }

  private currentTrustedAnchor(origin: AxisSourceOrigin, input: AxisStepInput): boolean {
    const anchor: AxisHistoricalAnchor | null = origin.anchor;
    return anchor !== null && anchor.sourceStatus === 'known' && anchor.sourceProfileValid && anchor.sourceKinds.length > 0 &&
      anchor.sourceKinds.indexOf('unknown') < 0 && anchor.sourceProfileRevision === input.profileRevision &&
      anchor.consumerFrameSequence === this.sequence + 1 && anchor.consumerEpoch === input.epoch &&
      anchor.consumerProfileRevision === input.profileRevision && anchor.consumerConfigurationRevision === this.configurationRevision;
  }

  private emptyProvenance(epoch: number): AxisValueProvenance[] {
    return this.configuration.axes.map(axis => new AxisValueProvenance(axis.name, this.sequence, epoch,
      this.configuration.profileRevision, this.configurationRevision, false));
  }

  private previousProvenance(axisName: string): AxisValueProvenance | null {
    return this.frame.provenance.find(value => value.axisName === axisName) ?? null;
  }

  private sourceEvidence(input: AxisStepInput, axisName: string, source: AxisValueSource,
    providerId: string | null = null, observation: AxisMotionSampleObservation | null = null): AxisEvidence {
    const binding: AxisScriptBinding | undefined = this.bindings.find(value => value.axisName === axisName);
    return AxisEvidence.source(new AxisSourceOrigin(source, axisName, this.sequence + 1, input.epoch,
      input.profileRevision, this.configurationRevision, input.isPlaying,
      source === 'script' && binding !== undefined && binding.resource !== null ? binding.resource.resourceId : observation === null ? null : observation.resourceId,
      source === 'script' && binding !== undefined ? binding.revision : null,
      providerId, source === 'motion' ? this.motionGenerations[this.indexOf(axisName)] : null, this.sequence + 1,
      observation === null ? null : observation.providerWriteGeneration, observation === null ? null : observation.configurationGeneration,
      observation === null ? null : observation.resourceGeneration));
  }

  private sourceProvenance(input: AxisStepInput, axisName: string, source: AxisValueSource,
    providerId: string | null = null, observation: AxisMotionSampleObservation | null = null): AxisValueProvenance {
    const evidence: AxisEvidence = this.sourceEvidence(input, axisName, source, providerId, observation);
    return new AxisValueProvenance(axisName, this.sequence + 1, input.epoch, input.profileRevision,
      this.configurationRevision, input.isPlaying, [], source, evidence.sources, evidence.origins, [], false, false, 'known');
  }

  private publishProvenance(input: AxisStepInput, state: AxisRuntimeState, trace: AxisProvenanceTrace): AxisValueProvenance {
    const evidence: AxisEvidence = trace.value;
    const finite: boolean = Number.isFinite(state.value);
    const staleMotion: boolean = evidence.origins.some(origin => origin.source === 'motion' &&
      origin.providerGeneration !== this.motionGenerations[this.indexOf(origin.axisName)] && !this.currentTrustedAnchor(origin, input));
    const unknown: boolean = evidence.unknown || staleMotion || evidence.origins.length === 0;
    const sources: AxisValueSource[] = finite ? evidence.sources.slice() : [];
    if (finite && unknown && sources.indexOf('unknown') < 0) { sources.push('unknown'); }
    if (finite && evidence.primary === 'held') { trace.stages.push('hold'); }
    return new AxisValueProvenance(state.axisName, this.sequence + 1, input.epoch, input.profileRevision,
      this.configurationRevision, input.isPlaying, trace.stages, evidence.primary, sources,
      finite ? evidence.origins : [], finite ? evidence.dependencies : [], trace.motionUpdated, trace.motionCacheRead,
      finite ? unknown ? 'unknown' : 'known' : 'none',
      finite && evidence.origins.some(origin => origin.epoch !== input.epoch || (origin.control !== null && origin.control.samples.some(sample => sample.epoch !== input.epoch))),
      finite && evidence.origins.some(origin => origin.configurationRevision !== this.configurationRevision || origin.profileRevision !== input.profileRevision ||
        (origin.control !== null && origin.control.samples.some(sample => sample.configurationRevision !== this.configurationRevision || sample.profileRevision !== input.profileRevision))),
      trace.motionSampleProduced,
      finite && evidence.origins.some(origin => origin.source === 'autoHome' && origin.axisName === state.axisName && origin.lastFrameSequence === this.sequence + 1),
      finite && evidence.origins.some(origin => origin.source === 'motion' && origin.axisName === state.axisName && origin.lastFrameSequence === this.sequence + 1),
      trace.motionCacheValidated,
      finite && evidence.origins.some(origin => origin.source === 'transition' && origin.axisName === state.axisName &&
        origin.lastFrameSequence === this.sequence + 1));
  }

  private settings(name: string): AxisConfiguration { return this.configuration.axisSettings.find(entry => entry.axisName === name)!.settings; }
  private indexOf(name: string): number {
    const index: number = this.configuration.axes.findIndex(axis => axis.name === name);
    if (index < 0) { throw new Error('Unknown enabled axis ' + name); }
    return index;
  }
  private assertIdle(): void { if (this.staged !== null) { throw new Error('Axis step is already in progress.'); } }
}
