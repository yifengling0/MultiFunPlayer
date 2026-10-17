import { AxisKeyframe } from './AxisScriptStore';

/** ScriptViewModel.cs::AxisState sentinel values, not preview endpoint holding. */
export const AXIS_INDEX_INVALID: number = -2147483648;
export const AXIS_INDEX_BEFORE: number = -1;
export const AXIS_INDEX_AFTER: number = 2147483647;

/** Owned mutable runtime internally; published instances are frozen copies. */
export class AxisRuntimeState {
  axisName: string;
  index: number = AXIS_INDEX_INVALID;
  value: number = Number.NaN;
  scriptValue: number = Number.NaN;
  motionProviderValue: number = Number.NaN;
  transitionValue: number = Number.NaN;
  speed: number = Number.NaN;
  insideGap: boolean = false;
  syncTimeSeconds: number = 0;
  autoHomeTimeSeconds: number = 0;
  autoHomeStartValue: number = Number.NaN;
  isDirty: boolean = false;
  isAutoHoming: boolean = false;
  isSmartLimited: boolean = false;
  isSpeedLimited: boolean = false;

  constructor(axisName: string) { this.axisName = axisName; }
  get invalid(): boolean { return this.index === AXIS_INDEX_INVALID; }
  get beforeScript(): boolean { return this.index === AXIS_INDEX_BEFORE; }
  get afterScript(): boolean { return this.index === AXIS_INDEX_AFTER; }
  get insideScript(): boolean { return this.index >= 0 && !this.afterScript; }

  copy(): AxisRuntimeState {
    const copy: AxisRuntimeState = new AxisRuntimeState(this.axisName);
    copy.index = this.index;
    copy.value = this.value;
    copy.scriptValue = this.scriptValue;
    copy.motionProviderValue = this.motionProviderValue;
    copy.transitionValue = this.transitionValue;
    copy.speed = this.speed;
    copy.insideGap = this.insideGap;
    copy.syncTimeSeconds = this.syncTimeSeconds;
    copy.autoHomeTimeSeconds = this.autoHomeTimeSeconds;
    copy.autoHomeStartValue = this.autoHomeStartValue;
    copy.isDirty = this.isDirty;
    copy.isAutoHoming = this.isAutoHoming;
    copy.isSmartLimited = this.isSmartLimited;
    copy.isSpeedLimited = this.isSpeedLimited;
    return copy;
  }
}

export type AxisEventKind = 'script' | 'autoHome' | 'speedLimitedScript';

/** DeviceAxisValueEvent / DeviceAxisScriptEvent / DeviceAxisSpeedLimitedScriptEvent.
 * targetValue is the ORIGINAL event target (possibly speed wrapped), never the
 * final pipeline value. Missing segments retain NaN target/duration.
 */
export class AxisEvent {
  readonly eventId: number;
  readonly epoch: number;
  readonly sourceFrameSequence: number;
  readonly kind: AxisEventKind;
  readonly axisName: string;
  readonly targetValue: number;
  readonly durationSeconds: number;
  readonly from: AxisKeyframe | null;
  readonly to: AxisKeyframe | null;
  readonly speedLimitUnitsPerSecond: number | null;

  constructor(eventId: number, epoch: number, sourceFrameSequence: number, kind: AxisEventKind,
    axisName: string, targetValue: number, durationSeconds: number,
    from: AxisKeyframe | null = null, to: AxisKeyframe | null = null,
    speedLimitUnitsPerSecond: number | null = null) {
    this.eventId = eventId;
    this.epoch = epoch;
    this.sourceFrameSequence = sourceFrameSequence;
    this.kind = kind;
    this.axisName = axisName;
    this.targetValue = targetValue;
    this.durationSeconds = durationSeconds;
    this.from = from === null ? null : new AxisKeyframe(from.positionSeconds, from.value);
    this.to = to === null ? null : new AxisKeyframe(to.positionSeconds, to.value);
    this.speedLimitUnitsPerSecond = speedLimitUnitsPerSecond;
    Object.freeze(this);
  }
}

/** Observations only, never output authorization. A final scalar can contain
 * several sources through blends or previous-frame dependencies. */
export type AxisValueSource = 'script' | 'motion' | 'autoHome' | 'transition' | 'held' | 'default' | 'unknown' | 'historical' | 'control';
export type AxisExecutedStage = 'script' | 'motionUpdate' | 'motionRead' | 'motionBlend' |
  'motionFollowLimit' | 'transitionUpdate' | 'transition' | 'autoHomeWait' | 'autoHome' |
  'sync' | 'smartValue' | 'smartSpeed' | 'speedLimit' | 'hold';
export type AxisDependencyRole = 'held' | 'motionCache' | 'syncPrevious' | 'autoHomeStart' |
  'transitionStart' | 'motionFollow' | 'smartInput' | 'smartPrevious' | 'speedPrevious' | 'speedCurrent';
export type AxisProvenanceStatus = 'none' | 'known' | 'unknown';

export type AxisHistoricalAnchorRole = 'syncPrevious' | 'autoHomeStart' | 'transitionStart' | 'speedPrevious' | 'smartPrevious';

/** An explicit current-stage read of a previously published finite scalar.
 * This is not freshness for the scalar's original sources, nor permission.
 * Anchor and direct/cache uses of an otherwise identical origin stay distinct. */
export class AxisHistoricalAnchor {
  readonly role: AxisHistoricalAnchorRole;
  readonly sourceAxisName: string;
  readonly sourceFrameSequence: number;
  readonly sourceEpoch: number;
  readonly sourceProfileRevision: number;
  readonly sourceConfigurationRevision: number;
  readonly sourceStatus: AxisProvenanceStatus;
  readonly sourceKinds: AxisValueSource[];
  readonly sourceProfileValid: boolean;
  readonly consumerFrameSequence: number;
  readonly consumerEpoch: number;
  readonly consumerProfileRevision: number;
  readonly consumerConfigurationRevision: number;
  constructor(role: AxisHistoricalAnchorRole, source: AxisValueProvenance, consumerFrameSequence: number,
    consumerEpoch: number, consumerProfileRevision: number, consumerConfigurationRevision: number,
    sourceProfileValid?: boolean) {
    this.role = role; this.sourceAxisName = source.axisName; this.sourceFrameSequence = source.frameSequence;
    this.sourceEpoch = source.epoch; this.sourceProfileRevision = source.profileRevision;
    this.sourceConfigurationRevision = source.configurationRevision; this.sourceStatus = source.status;
    this.sourceKinds = source.finalSources.filter((kind, index, kinds) => kind !== 'historical' && kind !== 'control' && kinds.indexOf(kind) === index);
    this.sourceProfileValid = sourceProfileValid === undefined ? source.origins.every(origin =>
      origin.profileRevision === source.profileRevision && (origin.control === null || origin.control.sourceProfileValid) && (origin.anchor === null ||
        (origin.anchor.sourceProfileValid && origin.anchor.sourceProfileRevision === source.profileRevision))) : sourceProfileValid;
    Object.freeze(this.sourceKinds);
    this.consumerFrameSequence = consumerFrameSequence; this.consumerEpoch = consumerEpoch;
    this.consumerProfileRevision = consumerProfileRevision; this.consumerConfigurationRevision = consumerConfigurationRevision;
    Object.freeze(this);
  }
  static same(left: AxisHistoricalAnchor | null, right: AxisHistoricalAnchor | null): boolean {
    return left === right || (left !== null && right !== null && left.role === right.role &&
      left.sourceAxisName === right.sourceAxisName && left.sourceFrameSequence === right.sourceFrameSequence &&
      left.sourceEpoch === right.sourceEpoch && left.sourceProfileRevision === right.sourceProfileRevision &&
      left.sourceConfigurationRevision === right.sourceConfigurationRevision && left.sourceStatus === right.sourceStatus &&
      left.sourceProfileValid === right.sourceProfileValid && left.sourceKinds.length === right.sourceKinds.length &&
      left.sourceKinds.every((kind, index) => kind === right.sourceKinds[index]) &&
      left.consumerFrameSequence === right.consumerFrameSequence && left.consumerEpoch === right.consumerEpoch &&
      left.consumerProfileRevision === right.consumerProfileRevision && left.consumerConfigurationRevision === right.consumerConfigurationRevision);
  }
  static copy(value: AxisHistoricalAnchor): AxisHistoricalAnchor {
    if (value instanceof AxisHistoricalAnchor && Object.isFrozen(value)) { return value; }
    return new AxisHistoricalAnchor(value.role, new AxisValueProvenance(value.sourceAxisName, value.sourceFrameSequence,
      value.sourceEpoch, value.sourceProfileRevision, value.sourceConfigurationRevision, false, [], 'unknown', value.sourceKinds, [], [],
      false, false, value.sourceStatus), value.consumerFrameSequence, value.consumerEpoch,
      value.consumerProfileRevision, value.consumerConfigurationRevision, value.sourceProfileValid);
  }
}

/** One immutable, nonrecursive observation used by a cross-axis control read.
 * A none sample is an observed nonfinite classification, allowed ONLY as the
 * older input of dirty/activity comparison; it is never a finite source. */
export class AxisControlSample {
  static copy(value: AxisControlSample): AxisControlSample {
    if (value instanceof AxisControlSample && Object.isFrozen(value)) { return value; }
    return new AxisControlSample(new AxisValueProvenance(value.axisName, value.frameSequence, value.epoch,
      value.profileRevision, value.configurationRevision, false, [], 'unknown', value.sourceKinds, [], [],
      false, false, value.status), value.sourceProfileValid);
  }
  readonly axisName: string;
  readonly frameSequence: number;
  readonly epoch: number;
  readonly profileRevision: number;
  readonly configurationRevision: number;
  readonly status: AxisProvenanceStatus;
  readonly sourceKinds: AxisValueSource[];
  readonly sourceProfileValid: boolean;
  constructor(value: AxisValueProvenance, sourceProfileValid?: boolean) {
    this.axisName = value.axisName; this.frameSequence = value.frameSequence; this.epoch = value.epoch;
    this.profileRevision = value.profileRevision; this.configurationRevision = value.configurationRevision;
    this.status = value.status;
    this.sourceKinds = value.finalSources.filter(kind => kind !== 'historical' && kind !== 'control');
    this.sourceProfileValid = sourceProfileValid === undefined ? value.origins.every(origin => origin.profileRevision === value.profileRevision &&
      (origin.anchor === null || (origin.anchor.sourceProfileValid && origin.anchor.sourceProfileRevision === value.profileRevision)) &&
      (origin.control === null || (origin.control.sourceProfileValid && origin.control.sourceProfileRevision === value.profileRevision))) : sourceProfileValid;
    Object.freeze(this.sourceKinds); Object.freeze(this);
  }
}

/** Active references only. Historical positional scalars deliberately do not
 * retain live resource references. Conflicting identities fail closed. */
export class AxisControlReference {
  readonly kind: 'script' | 'motion';
  readonly axisName: string;
  readonly resourceId: string | null;
  readonly bindingRevision: number | null;
  readonly providerId: string | null;
  readonly providerGeneration: number | null;
  readonly producerFrameSequence: number;
  readonly requiredFrameSequence: number;
  readonly observationValidated: boolean;
  constructor(kind: 'script' | 'motion', axisName: string, resourceId: string | null,
    bindingRevision: number | null, providerId: string | null, providerGeneration: number | null,
    producerFrameSequence: number, requiredFrameSequence: number, observationValidated: boolean = true) {
    this.kind = kind; this.axisName = axisName; this.resourceId = resourceId;
    this.bindingRevision = bindingRevision; this.providerId = providerId; this.providerGeneration = providerGeneration;
    this.producerFrameSequence = producerFrameSequence; this.requiredFrameSequence = requiredFrameSequence;
    this.observationValidated = observationValidated;
    Object.freeze(this);
  }
  static same(a: AxisControlReference, b: AxisControlReference): boolean {
    return a.kind === b.kind && a.axisName === b.axisName && a.resourceId === b.resourceId &&
      a.bindingRevision === b.bindingRevision && a.providerId === b.providerId && a.providerGeneration === b.providerGeneration &&
      a.producerFrameSequence === b.producerFrameSequence && a.requiredFrameSequence === b.requiredFrameSequence && a.observationValidated === b.observationValidated;
  }
}

export type AxisControlRole = 'smartInput' | 'motionFollow';
export type AxisControlInputKind = 'value' | 'activity' | 'speed';

/** A real current-stage read of a previous committed axis field. Unlike a
 * positional anchor, this carries exact sample and live-reference identities.
 * It cannot certify current output activity or a fresh provider cache value. */
export class AxisControlInput {
  static copy(value: AxisControlInput): AxisControlInput {
    if (value instanceof AxisControlInput && Object.isFrozen(value)) { return value; }
    return new AxisControlInput(value.role, value.inputKind, value.samples, value.references, value.sourceCurrentValid,
      new AxisFrame(value.readFrameSequence, value.readEpoch, 0, 0, 0, value.readProfileRevision, [], [], false,
        value.readConfigurationRevision), value.consumerAxisName, value.consumerFrameSequence, value.consumerEpoch,
      value.consumerProfileRevision, value.consumerConfigurationRevision);
  }
  readonly role: AxisControlRole;
  readonly inputKind: AxisControlInputKind;
  readonly sourceAxisName: string;
  readonly sourceFrameSequence: number;
  readonly sourceEpoch: number;
  readonly sourceProfileRevision: number;
  readonly sourceConfigurationRevision: number;
  readonly sourceStatus: AxisProvenanceStatus;
  readonly sourceKinds: AxisValueSource[];
  readonly sourceProfileValid: boolean;
  readonly sourceCurrentValid: boolean;
  readonly samples: AxisControlSample[];
  readonly references: AxisControlReference[];
  readonly readFrameSequence: number;
  readonly readEpoch: number;
  readonly readProfileRevision: number;
  readonly readConfigurationRevision: number;
  readonly consumerAxisName: string;
  readonly consumerFrameSequence: number;
  readonly consumerEpoch: number;
  readonly consumerProfileRevision: number;
  readonly consumerConfigurationRevision: number;
  constructor(role: AxisControlRole, inputKind: AxisControlInputKind, samples: AxisControlSample[],
    references: AxisControlReference[], sourceCurrentValid: boolean, read: AxisFrame, consumerAxisName: string,
    consumerFrameSequence: number, consumerEpoch: number, consumerProfileRevision: number, consumerConfigurationRevision: number) {
    const source: AxisControlSample = samples[samples.length - 1];
    this.role = role; this.inputKind = inputKind; this.samples = samples.map(sample => AxisControlSample.copy(sample));
    this.references = references.map(reference => reference instanceof AxisControlReference && Object.isFrozen(reference) ? reference :
      new AxisControlReference(reference.kind, reference.axisName, reference.resourceId, reference.bindingRevision, reference.providerId, reference.providerGeneration, reference.producerFrameSequence, reference.requiredFrameSequence, reference.observationValidated));
    this.sourceAxisName = source.axisName; this.sourceFrameSequence = source.frameSequence; this.sourceEpoch = source.epoch;
    this.sourceProfileRevision = source.profileRevision; this.sourceConfigurationRevision = source.configurationRevision;
    this.sourceKinds = samples.flatMap(sample => sample.sourceKinds).filter((kind, index, kinds) => kinds.indexOf(kind) === index);
    this.sourceProfileValid = samples.every(sample => sample.sourceProfileValid && sample.profileRevision === consumerProfileRevision);
    this.sourceStatus = samples.every((sample, index) => sample.status === 'known' ||
      (inputKind === 'activity' && index < samples.length - 1 && sample.status === 'none')) &&
      this.sourceProfileValid && this.sourceKinds.length > 0 && this.sourceKinds.indexOf('unknown') < 0 ? 'known' : 'unknown';
    this.sourceCurrentValid = sourceCurrentValid && this.sourceStatus === 'known';
    this.readFrameSequence = read.sequence; this.readEpoch = read.epoch; this.readProfileRevision = read.profileRevision;
    this.readConfigurationRevision = read.configurationRevision; this.consumerAxisName = consumerAxisName;
    this.consumerFrameSequence = consumerFrameSequence; this.consumerEpoch = consumerEpoch;
    this.consumerProfileRevision = consumerProfileRevision; this.consumerConfigurationRevision = consumerConfigurationRevision;
    Object.freeze(this.samples); Object.freeze(this.references); Object.freeze(this.sourceKinds); Object.freeze(this);
  }
  static same(a: AxisControlInput | null, b: AxisControlInput | null): boolean {
    return a === b || (a !== null && b !== null && a.role === b.role && a.inputKind === b.inputKind &&
      a.sourceAxisName === b.sourceAxisName && a.sourceFrameSequence === b.sourceFrameSequence &&
      a.readFrameSequence === b.readFrameSequence && a.consumerFrameSequence === b.consumerFrameSequence &&
      a.consumerAxisName === b.consumerAxisName && a.consumerEpoch === b.consumerEpoch &&
      a.consumerProfileRevision === b.consumerProfileRevision && a.consumerConfigurationRevision === b.consumerConfigurationRevision &&
      a.sourceStatus === b.sourceStatus && a.sourceCurrentValid === b.sourceCurrentValid);
  }
}

/** One bounded, nonrecursive lineage entry. Equal identities coalesce frame
 * ranges; timestamps are never rewritten to make an old sample look current. */
export class AxisSourceOrigin {
  static withAnchor(origin: AxisSourceOrigin, anchor: AxisHistoricalAnchor): AxisSourceOrigin {
    return new AxisSourceOrigin(origin.source, origin.axisName, origin.firstFrameSequence, origin.epoch,
      origin.profileRevision, origin.configurationRevision, origin.isPlaying, origin.resourceId, origin.bindingRevision,
      origin.providerId, origin.providerGeneration, origin.lastFrameSequence, origin.providerWriteGeneration,
      origin.providerConfigurationGeneration, origin.providerResourceGeneration, origin.lastProviderWriteGeneration, anchor);
  }
  readonly anchor: AxisHistoricalAnchor | null;
  readonly control: AxisControlInput | null;
  readonly source: AxisValueSource;
  readonly axisName: string;
  readonly firstFrameSequence: number;
  readonly lastFrameSequence: number;
  readonly epoch: number;
  readonly profileRevision: number;
  readonly configurationRevision: number;
  readonly isPlaying: boolean;
  readonly resourceId: string | null;
  readonly bindingRevision: number | null;
  readonly providerId: string | null;
  readonly providerGeneration: number | null;
  readonly providerWriteGeneration: number | null;
  readonly lastProviderWriteGeneration: number | null;
  readonly providerConfigurationGeneration: number | null;
  readonly providerResourceGeneration: number | null;
  constructor(source: AxisValueSource, axisName: string, firstFrameSequence: number, epoch: number,
    profileRevision: number, configurationRevision: number, isPlaying: boolean,
    resourceId: string | null = null, bindingRevision: number | null = null,
    providerId: string | null = null, providerGeneration: number | null = null,
    lastFrameSequence: number = firstFrameSequence, providerWriteGeneration: number | null = null,
    providerConfigurationGeneration: number | null = null, providerResourceGeneration: number | null = null,
    lastProviderWriteGeneration: number | null = providerWriteGeneration, anchor: AxisHistoricalAnchor | null = null,
    control: AxisControlInput | null = null) {
    this.anchor = anchor === null ? null : AxisHistoricalAnchor.copy(anchor);
    this.control = control === null ? null : AxisControlInput.copy(control);
    this.source = source; this.axisName = axisName; this.firstFrameSequence = firstFrameSequence;
    this.lastFrameSequence = lastFrameSequence; this.epoch = epoch; this.profileRevision = profileRevision;
    this.configurationRevision = configurationRevision; this.isPlaying = isPlaying;
    this.resourceId = resourceId; this.bindingRevision = bindingRevision;
    this.providerWriteGeneration = providerWriteGeneration;
    this.lastProviderWriteGeneration = lastProviderWriteGeneration;
    this.providerConfigurationGeneration = providerConfigurationGeneration;
    this.providerResourceGeneration = providerResourceGeneration;
    this.providerId = providerId; this.providerGeneration = providerGeneration;
    Object.freeze(this);
  }
}

/** Direct dependency summary, deliberately not a recursively retained frame. */
export class AxisValueDependency {
  static copy(value: AxisValueDependency): AxisValueDependency {
    if (value instanceof AxisValueDependency && Object.isFrozen(value) && Object.isFrozen(value.sources)) { return value; }
    return new AxisValueDependency(value.role, new AxisValueProvenance(value.axisName, value.frameSequence,
      value.epoch, value.profileRevision, value.configurationRevision, false, [], 'unknown', value.sources, [], [], false, false, value.status));
  }
  readonly role: AxisDependencyRole;
  readonly axisName: string;
  readonly frameSequence: number;
  readonly epoch: number;
  readonly profileRevision: number;
  readonly configurationRevision: number;
  readonly sources: AxisValueSource[];
  readonly status: AxisProvenanceStatus;
  constructor(role: AxisDependencyRole, value: AxisValueProvenance) {
    this.role = role; this.axisName = value.axisName; this.frameSequence = value.frameSequence;
    this.epoch = value.epoch; this.profileRevision = value.profileRevision;
    this.configurationRevision = value.configurationRevision;
    this.sources = value.finalSources.slice(); this.status = value.status;
    Object.freeze(this.sources); Object.freeze(this);
  }
}

/** Deep immutable evidence for ONE published value. status=known means its
 * lineage was observed, not that it is fresh/authorized: inspect generations,
 * dependency roles, cached reads and source kinds. none means nonfinite output.
 * configurationRevision is pipeline-local; reconstructing starts a new epoch.
 * primarySource records the last assigning source; finalSources also includes
 * actual numeric/control dependencies (e.g. Home's previous starting value).
 */
export class AxisValueProvenance {
  static copy(value: AxisValueProvenance): AxisValueProvenance {
    if (value instanceof AxisValueProvenance && Object.isFrozen(value)) { return value; }
    return new AxisValueProvenance(value.axisName, value.frameSequence, value.epoch, value.profileRevision,
      value.configurationRevision, value.isPlaying, value.stages, value.primarySource, value.finalSources,
      value.origins, value.dependencies, value.motionUpdated, value.motionCacheRead, value.status,
      value.crossEpoch, value.crossConfiguration, value.motionSampleProduced, value.autoHomeApplied, value.motionApplied, value.motionCacheValidated, value.transitionApplied);
  }
  readonly axisName: string;
  readonly frameSequence: number;
  readonly epoch: number;
  readonly profileRevision: number;
  readonly configurationRevision: number;
  readonly isPlaying: boolean;
  readonly stages: AxisExecutedStage[];
  readonly primarySource: AxisValueSource;
  readonly finalSources: AxisValueSource[];
  readonly origins: AxisSourceOrigin[];
  readonly dependencies: AxisValueDependency[];
  readonly motionUpdated: boolean;
  readonly motionCacheRead: boolean;
  readonly motionCacheValidated: boolean;
  readonly motionSampleProduced: boolean | null;
  readonly autoHomeApplied: boolean;
  readonly motionApplied: boolean;
  /** Own-axis transition contribution surviving in this frame's final value. */
  readonly transitionApplied: boolean;
  readonly status: AxisProvenanceStatus;
  readonly crossEpoch: boolean;
  readonly crossConfiguration: boolean;
  constructor(axisName: string, frameSequence: number, epoch: number, profileRevision: number,
    configurationRevision: number, isPlaying: boolean, stages: AxisExecutedStage[] = [],
    primarySource: AxisValueSource = 'unknown', finalSources: AxisValueSource[] = [],
    origins: AxisSourceOrigin[] = [], dependencies: AxisValueDependency[] = [],
    motionUpdated: boolean = false, motionCacheRead: boolean = false,
    status: AxisProvenanceStatus = 'none', crossEpoch: boolean = false, crossConfiguration: boolean = false,
    motionSampleProduced: boolean | null = null, autoHomeApplied: boolean = false, motionApplied: boolean = false, motionCacheValidated: boolean = false,
    transitionApplied: boolean = false) {
    this.axisName = axisName; this.frameSequence = frameSequence; this.epoch = epoch;
    this.profileRevision = profileRevision; this.configurationRevision = configurationRevision;
    this.isPlaying = isPlaying; this.stages = stages.slice(); this.primarySource = primarySource;
    this.finalSources = finalSources.slice();
    this.origins = origins.map(origin => origin instanceof AxisSourceOrigin && Object.isFrozen(origin) ? origin : new AxisSourceOrigin(origin.source, origin.axisName, origin.firstFrameSequence,
      origin.epoch, origin.profileRevision, origin.configurationRevision, origin.isPlaying, origin.resourceId,
      origin.bindingRevision, origin.providerId, origin.providerGeneration, origin.lastFrameSequence,
      origin.providerWriteGeneration, origin.providerConfigurationGeneration, origin.providerResourceGeneration, origin.lastProviderWriteGeneration, origin.anchor ?? null, origin.control ?? null));
    this.dependencies = dependencies.map(value => AxisValueDependency.copy(value));
    this.autoHomeApplied = autoHomeApplied; this.motionApplied = motionApplied;
    this.transitionApplied = transitionApplied;
    this.motionSampleProduced = motionSampleProduced;
    this.motionUpdated = motionUpdated; this.motionCacheRead = motionCacheRead; this.motionCacheValidated = motionCacheValidated;
    this.status = status; this.crossEpoch = crossEpoch; this.crossConfiguration = crossConfiguration;
    Object.freeze(this.stages); Object.freeze(this.finalSources); Object.freeze(this.origins);
    Object.freeze(this.dependencies); Object.freeze(this);
  }
}

export class AxisFrame {
  readonly sequence: number;
  readonly epoch: number;
  readonly monotonicMs: number;
  readonly mediaPositionMs: number;
  readonly deltaSeconds: number;
  readonly profileRevision: number;
  readonly axisStates: AxisRuntimeState[];
  readonly isPlaying: boolean;
  readonly configurationRevision: number;
  readonly provenance: AxisValueProvenance[];
  readonly events: AxisEvent[];

  constructor(sequence: number, epoch: number, monotonicMs: number, mediaPositionMs: number,
    deltaSeconds: number, profileRevision: number, axisStates: AxisRuntimeState[], events: AxisEvent[],
    isPlaying: boolean = false, configurationRevision: number = 0, provenance: AxisValueProvenance[] = []) {
    this.isPlaying = isPlaying;
    this.configurationRevision = configurationRevision;
    this.provenance = provenance.map(value => AxisValueProvenance.copy(value));
    Object.freeze(this.provenance);
    this.sequence = sequence;
    this.epoch = epoch;
    this.monotonicMs = monotonicMs;
    this.mediaPositionMs = mediaPositionMs;
    this.deltaSeconds = deltaSeconds;
    this.profileRevision = profileRevision;
    this.axisStates = axisStates.map(state => Object.freeze(state.copy()));
    this.events = events.map(event => new AxisEvent(event.eventId, event.epoch, event.sourceFrameSequence,
      event.kind, event.axisName, event.targetValue, event.durationSeconds, event.from, event.to, event.speedLimitUnitsPerSecond));
    Object.freeze(this.axisStates);
    Object.freeze(this.events);
    Object.freeze(this);
  }
}

/** ScriptViewModel.cs::AxisStateUpdateContext.ValueChanged, including finite XOR. */
export function axisValueChanged(last: number, current: number): boolean {
  return Math.abs(last - current) > 0.000001 || Number.isFinite(last) !== Number.isFinite(current);
}
