/** Pure output contracts. No UI, preview engine, native transport or credentials.
 * Readonly snapshots are deep-detached copies, never shared mutable engine data.
 * No Object.freeze: ArkTS disallows it. Session copies every admitted frame. */
/** Active playback includes every verified configured pipeline source. Paused
 * intents require actual current Home/Motion/manual-transition activity, never a pure held value. */
export type DispatchIntent = 'activePlayback' | 'pausedAutoHome' | 'pausedMotion' | 'pausedManual';
export type OutputEventKind = 'script' | 'autoHome' | 'speedLimitedScript';
export type OutputTargetKind = 'memory' | 'tcp' | 'udp' | 'webSocket' | 'serial' | 'file' | 'pipe' | 'buttplug' | 'handy';
/** automaticRequested preserves imported intent; this stage NEVER auto-connects. */
export type AutoConnectPolicy = 'manual' | 'savedDisabled' | 'automaticRequested';
export type OutputErrorCode = 'unsupportedPrecision' | 'invalidAxis' | 'duplicateAxis' | 'invalidValue' |
  'invalidRange' | 'invalidDuration' | 'oversizePayload' | 'invalidConfiguration' | 'invalidClock' |
  'invalidFrame' | 'invalidIntent' | 'queueOverflow' | 'writeExpired' | 'shortMessageWrite' |
  'invalidReceipt' | 'transportError' | 'notConnected' | 'physicalTransportUnavailable';

export class OutputError extends Error {
  readonly code: OutputErrorCode;
  constructor(code: OutputErrorCode, detail: string) { super(detail); this.name = 'OutputError'; this.code = code; }
}
export interface OutputValue { readonly axisId: string; readonly value: number; }
export interface OutputKeyframe { readonly positionSeconds: number; readonly value: number; }
export interface AxisOutputEvent {
  readonly eventId: number;
  readonly epoch: number;
  readonly sourceFrameSequence: number;
  readonly axisId: string;
  readonly kind: OutputEventKind;
  readonly targetValue: number;
  readonly durationSeconds: number;
  readonly from?: OutputKeyframe | null;
  readonly to?: OutputKeyframe | null;
  readonly speedLimitUnitsPerSecond?: number | null;
}
export interface OutputValueFrame {
  readonly sequence: number;
  readonly epoch: number;
  readonly monotonicMs: number;
  readonly mediaPositionMs: number;
  readonly profileRevision: number;
  readonly values: ReadonlyArray<OutputValue>;
  readonly events: ReadonlyArray<AxisOutputEvent>;
}

/** Structural projection accepts the completed ALL-EndUpdate pipeline frame.
 * It cannot access PlaybackEngine and never fabricates a keyframe event.
 */
export interface PipelineAxisSource { readonly axisName: string; readonly value: number; }
export interface PipelineEventSource {
  readonly eventId: number; readonly epoch: number; readonly sourceFrameSequence: number;
  readonly axisName: string; readonly kind: OutputEventKind; readonly targetValue: number;
  readonly durationSeconds: number; readonly from: OutputKeyframe | null; readonly to: OutputKeyframe | null;
  readonly speedLimitUnitsPerSecond: number | null;
}
export interface PipelineFrameSource {
  readonly sequence: number; readonly epoch: number; readonly monotonicMs: number;
  readonly mediaPositionMs: number; readonly profileRevision: number;
  readonly axisStates: ReadonlyArray<PipelineAxisSource>; readonly events: ReadonlyArray<PipelineEventSource>;
}
export function copyEvent(event: AxisOutputEvent): AxisOutputEvent {
  const result: AxisOutputEvent = {
    eventId: event.eventId, epoch: event.epoch, sourceFrameSequence: event.sourceFrameSequence,
    axisId: event.axisId, kind: event.kind, targetValue: event.targetValue, durationSeconds: event.durationSeconds,
    from: event.from === undefined || event.from === null ? null : { positionSeconds: event.from.positionSeconds, value: event.from.value },
    to: event.to === undefined || event.to === null ? null : { positionSeconds: event.to.positionSeconds, value: event.to.value },
    speedLimitUnitsPerSecond: event.speedLimitUnitsPerSecond
  };
  return result;
}
export function copyOutputFrame(frame: OutputValueFrame): OutputValueFrame {
  const result: OutputValueFrame = {
    sequence: frame.sequence, epoch: frame.epoch, monotonicMs: frame.monotonicMs,
    mediaPositionMs: frame.mediaPositionMs, profileRevision: frame.profileRevision,
    values: frame.values.map((value): OutputValue => ({ axisId: value.axisId, value: value.value })),
    events: frame.events.map(copyEvent)
  };
  return result;
}
export function projectOutputFrame(frame: PipelineFrameSource): OutputValueFrame {
  // The source public ScriptViewModel.GetValue accessor clamps final internal
  // transition values. Preserve nonfinite values for the physical-boundary rejection.
  const values: OutputValue[] = frame.axisStates.map((state): OutputValue => ({ axisId: state.axisName,
    value: Number.isFinite(state.value) ? Math.max(0, Math.min(1, state.value)) : state.value }));
  const events: AxisOutputEvent[] = frame.events.map((event): AxisOutputEvent => ({
    eventId: event.eventId, epoch: event.epoch, sourceFrameSequence: event.sourceFrameSequence,
    axisId: event.axisName, kind: event.kind, targetValue: event.targetValue, durationSeconds: event.durationSeconds,
    from: event.from, to: event.to, speedLimitUnitsPerSecond: event.speedLimitUnitsPerSecond
  }));
  return copyOutputFrame({ sequence: frame.sequence, epoch: frame.epoch, monotonicMs: frame.monotonicMs,
    mediaPositionMs: frame.mediaPositionMs, profileRevision: frame.profileRevision, values: values, events: events });
}

/** A coordinator must derive this from verified frame provenance/clock observations.
 * This module cannot infer provenance from final numeric values. A mixed frame
 * must list EVERY active source; every source must pass the current gate.
 */
export interface DispatchAuthorization {
  /** Exact target output scope; source verifies these axes AND their dependencies. */
  readonly authorizedAxes: ReadonlyArray<string>;
  readonly epoch: number;
  readonly sourceFrameSequence: number;
  /** Monotonic source configuration + resource/control revision, independent of frame sequence. */
  readonly sourceConfigurationRevision: number;
  /** Event-only authorization must never be reused for scalar fixed output. */
  readonly updateKind: 'fixed' | 'polled';
  readonly intents: ReadonlyArray<DispatchIntent>;
  readonly clockKind: 'media' | 'monotonic';
  readonly observedMonotonicMs: number;
}
/** Current explicit manual preview admission permits remembering a user's Arm
 * intent only. It authorizes no scalar, event, clock or transport write. */
export interface ManualPreviewAdmission {
  readonly epoch: number;
  readonly profileRevision: number;
  /** Changes on any nonmanual source/configuration/control mutation. */
  readonly admissionRevision: number;
  readonly authorizedAxes: ReadonlyArray<string>;
}
export function copyManualPreviewAdmission(value: ManualPreviewAdmission): ManualPreviewAdmission {
  return { epoch: value.epoch, profileRevision: value.profileRevision,
    admissionRevision: value.admissionRevision, authorizedAxes: value.authorizedAxes.slice() };
}
/** Core-owned same-source seek evidence. It is not an arm authorization.
 * Native confirmation must come from the matching source/seek observation;
 * currentEpoch may increase again when the confirmed position is observed. */
export interface OutputSeekTransition {
  readonly requestId: number;
  readonly sourceIdentity: string;
  readonly sourceGeneration: number;
  readonly previousEpoch: number;
  readonly currentEpoch: number;
  readonly profileRevision: number;
  readonly deadlineMonotonicMs: number;
  readonly status: 'pending' | 'confirmed' | 'cancelled';
}
export function copySeekTransition(value: OutputSeekTransition): OutputSeekTransition {
  return { requestId: value.requestId, sourceIdentity: value.sourceIdentity, sourceGeneration: value.sourceGeneration,
    previousEpoch: value.previousEpoch, currentEpoch: value.currentEpoch, profileRevision: value.profileRevision,
    deadlineMonotonicMs: value.deadlineMonotonicMs, status: value.status };
}
/** Confirmations cannot replace the captured source, request, profile or deadline. */
export function sameSeekTransaction(captured: OutputSeekTransition, value: OutputSeekTransition): boolean {
  return captured.requestId === value.requestId && captured.sourceIdentity === value.sourceIdentity &&
    captured.sourceGeneration === value.sourceGeneration && captured.previousEpoch === value.previousEpoch &&
    captured.profileRevision === value.profileRevision && captured.deadlineMonotonicMs === value.deadlineMonotonicMs &&
    Number.isSafeInteger(value.currentEpoch) && value.currentEpoch >= captured.currentEpoch &&
    (captured.status !== 'confirmed' || (value.status === 'confirmed' && value.currentEpoch === captured.currentEpoch)) &&
    (value.status === 'confirmed' || value.currentEpoch === captured.currentEpoch);
}
export interface TCodeProfile {
  /** Keep imported precision intact. 1–9 encode; 10 fails closed on the source Int32 defect. */
  readonly precision: number;
  readonly revision: number;
  readonly axisOrder: ReadonlyArray<string>;
  readonly maximumDurationMs: number;
  readonly maximumPayloadBytes: number;
}
export interface AxisRange { readonly axisId: string; readonly minimum: number; readonly maximum: number; readonly enabled: boolean; }
export interface FixedContext {
  readonly kind: 'fixed'; readonly intervalMs: number; readonly minimumIntervalMs: number;
  readonly maximumIntervalMs: number; readonly sendDirtyValuesOnly: boolean;
  readonly offloadElapsedTime: boolean; readonly usePreciseSleep: boolean;
}
export interface PolledContext { readonly kind: 'polled'; }
export type UpdateContext = FixedContext | PolledContext;
export interface OutputTargetConfig {
  readonly targetId: string; readonly kind: OutputTargetKind; readonly protocolProfile: TCodeProfile;
  readonly axisRanges: ReadonlyArray<AxisRange>; readonly updateContext: UpdateContext;
  readonly autoConnectPolicy: AutoConnectPolicy;
  readonly allowPausedAutoHome: boolean; readonly allowPausedMotion: boolean;
  /** Additive permission: old configurations omit it and remain denied. */
  readonly allowPausedManual?: boolean;
}
/** Explicit simulation/test limits. These are NOT a guessed hardware safety profile. */
export interface OutputAdmissionPolicy {
  readonly maximumFrameAgeMs: number; readonly maximumClockAgeMs: number;
  readonly maximumEventAgeMs: number; readonly maximumFixedElapsedMs: number;
  readonly writeTimeoutMs: number; readonly maximumPolledQueueLength: number;
  readonly allowZeroInterval: boolean;
}
export function copyProfile(profile: TCodeProfile): TCodeProfile {
  return { precision: profile.precision, revision: profile.revision,
    axisOrder: profile.axisOrder.slice(), maximumDurationMs: profile.maximumDurationMs,
    maximumPayloadBytes: profile.maximumPayloadBytes };
}
export function copyConfig(config: OutputTargetConfig): OutputTargetConfig {
  let context: UpdateContext;
  if (config.updateContext.kind === 'fixed') {
    const c: FixedContext = config.updateContext;
    context = { kind: 'fixed', intervalMs: c.intervalMs, minimumIntervalMs: c.minimumIntervalMs,
      maximumIntervalMs: c.maximumIntervalMs, sendDirtyValuesOnly: c.sendDirtyValuesOnly,
      offloadElapsedTime: c.offloadElapsedTime, usePreciseSleep: c.usePreciseSleep };
  } else { context = { kind: 'polled' }; }
  return { targetId: config.targetId, kind: config.kind, protocolProfile: copyProfile(config.protocolProfile),
    axisRanges: config.axisRanges.map((range): AxisRange => ({ axisId: range.axisId,
      minimum: range.minimum, maximum: range.maximum, enabled: range.enabled })), updateContext: context,
    autoConnectPolicy: config.autoConnectPolicy, allowPausedAutoHome: config.allowPausedAutoHome,
    allowPausedMotion: config.allowPausedMotion,
    allowPausedManual: config.allowPausedManual === undefined ? false : config.allowPausedManual };
}

/** Exact nonempty scope prevents reusing subset authorization on another target. */
export function authorizedAxesMatch(authorized: ReadonlyArray<string> | undefined, enabled: ReadonlyArray<string>): boolean {
  return authorized !== undefined && Array.isArray(authorized) && enabled.length > 0 &&
    authorized.length === enabled.length && authorized.every((axis: string, index: number) =>
      authorized.indexOf(axis) === index && enabled.indexOf(axis) >= 0);
}
