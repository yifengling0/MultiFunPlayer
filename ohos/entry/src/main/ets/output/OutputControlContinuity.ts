/** Retain-only identity for an already explicit Arm during ordinary source
 * controls. The source/coordinator owns observation and publication evidence;
 * this lease alone never authorizes a scalar, event, write or a new Arm. */
export interface OutputControlLease {
  readonly requestId: number;
  readonly sourceIdentity: string;
  readonly sourceGeneration: number;
  readonly epoch: number;
  readonly profileRevision: number;
  readonly startFrameSequence: number;
  readonly startSourceConfigurationRevision: number;
  readonly deadlineMonotonicMs: number;
}

export function copyControlLease(value: OutputControlLease): OutputControlLease {
  return { requestId: value.requestId, sourceIdentity: value.sourceIdentity,
    sourceGeneration: value.sourceGeneration, epoch: value.epoch,
    profileRevision: value.profileRevision, startFrameSequence: value.startFrameSequence,
    startSourceConfigurationRevision: value.startSourceConfigurationRevision,
    deadlineMonotonicMs: value.deadlineMonotonicMs };
}

/** No field may change while an identity is retained, including its deadline. */
export function sameControlLease(captured: OutputControlLease, value: OutputControlLease): boolean {
  return captured.requestId === value.requestId && captured.sourceIdentity === value.sourceIdentity &&
    captured.sourceGeneration === value.sourceGeneration && captured.epoch === value.epoch &&
    captured.profileRevision === value.profileRevision && captured.startFrameSequence === value.startFrameSequence &&
    captured.startSourceConfigurationRevision === value.startSourceConfigurationRevision &&
    captured.deadlineMonotonicMs === value.deadlineMonotonicMs;
}
