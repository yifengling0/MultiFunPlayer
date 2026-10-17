import type { DeoVrDispatchBoundary, DeoVrPacketObservation, DeoVrSnapshot } from './DeoVrTypes';
import { DEOVR_MAXIMUM_SPEED } from './DeoVrProtocol';
import { isDeoVrDispatchBoundaryForObservation, isDeoVrPacketObservation, sameDeoVrObservationSource } from './DeoVrMediaSource';

export type DeoVrControlKind = 'play' | 'pause' | 'speed';
export interface DeoVrControlRequest { kind: DeoVrControlKind; speed?: number; }
export type DeoVrControlEvidenceStatus = 'pending' | 'observed' | 'cancelled';
export interface DeoVrControlEvidenceSnapshot {
  readonly status: DeoVrControlEvidenceStatus;
  readonly requestId: number;
  readonly kind: DeoVrControlKind;
  readonly generation: number;
  readonly resourceRevision: number;
  readonly startedAtMs: number;
  readonly deadlineMs: number;
  readonly commandId: number;
  /** Second/latest compatible actual packet; -1 while no pair is established. */
  readonly packetSequence: number;
  readonly observedAtMs: number;
}

/** A bounded sidecar proof of compatible subsequent local observations only.
 * There are no correlated remote ACKs or server timestamps in this protocol.
 * This class neither integrates media time nor publishes a frame/Arm/permission.
 * Begin only after the unchanged core clock is canonical-position ready at the
 * actual current time; the source's raw changed-event timestamp is not that gate.
 * The caller must independently revoke on epoch/configuration/seek changes and
 * consume the exact evidence sequence in a genuinely new pipeline frame. */
export class DeoVrControlEvidence {
  static readonly DEADLINE_MS: number = 5000;
  static readonly STALE_MS: number = 750;
  private readonly requestId: number;
  private readonly kind: DeoVrControlKind;
  private readonly requestedSpeed: number | undefined;
  private readonly initial: DeoVrPacketObservation | null;
  private readonly generation: number;
  private readonly resourceRevision: number;
  private readonly path: string | null;
  private readonly startedAtMs: number;
  private readonly deadlineMs: number;
  private readonly startPosition: number;
  private readonly startState: number | null;
  private status: DeoVrControlEvidenceStatus = 'pending';
  private boundary: DeoVrDispatchBoundary | null = null;
  private candidate: DeoVrPacketObservation | null = null;
  private lastSequence: number = -1;
  private lastIngress: number = -1;
  private lastReceiveAt: number = -1;
  private lastFreshAt: number = -1;
  private lastProgressAt: number = -1;
  private lastPosition: number = Number.NaN;
  private lastPlaying: boolean = false;
  private lastNow: number;

  constructor(requestId: number, request: DeoVrControlRequest, initial: DeoVrSnapshot, nowMs: number) {
    this.requestId = requestId; this.kind = request.kind; this.requestedSpeed = request.speed;
    this.initial = initial.lastObservation ?? null; this.generation = initial.generation;
    this.resourceRevision = initial.resourceRevision; this.path = initial.path;
    this.startedAtMs = nowMs; this.deadlineMs = nowMs + DeoVrControlEvidence.DEADLINE_MS; this.lastNow = nowMs;
    this.startPosition = this.initial === null ? Number.NaN : this.initial.positionSeconds ?? Number.NaN;
    this.startState = this.initial === null ? null : this.initial.playerState;
    this.lastPosition = this.startPosition; this.lastProgressAt = initial.lastChangedAtMs;
    this.lastPlaying = this.startState === 0;
    if (this.initial !== null) {
      this.lastSequence = this.initial.packetSequence; this.lastIngress = this.initial.lastIngressId;
      this.lastReceiveAt = this.initial.receivedAtMs; this.lastFreshAt = this.initial.receivedAtMs;
    }
    if (!Number.isSafeInteger(requestId) || requestId < 0 || !Number.isFinite(nowMs) || nowMs < 0 ||
      (request.kind !== 'play' && request.kind !== 'pause' && request.kind !== 'speed') ||
      (request.kind === 'speed' && (typeof request.speed !== 'number' || !Number.isFinite(request.speed) ||
        request.speed <= 0 || request.speed > DEOVR_MAXIMUM_SPEED)) ||
      (this.startState !== 0 && this.startState !== 1) || !this.validSource(initial) ||
      !initial.currentTimeValid || !initial.playerStateValid || !this.validPosition(this.startPosition, initial) ||
      initial.positionSeconds !== this.startPosition || initial.playerState !== this.startState ||
      initial.playing !== (this.startState === 0)) { this.cancel(); }
    this.checkTime(nowMs);
  }

  /** Called synchronously by the source's genuine dispatch callback only.
   * Queue waiting never shifts the transaction's original five-second ceiling. */
  bindDispatch(boundary: DeoVrDispatchBoundary, nowMs: number): boolean {
    if (!this.checkTime(nowMs)) { return false; }
    if (this.boundary !== null || this.initial === null || !isDeoVrDispatchBoundaryForObservation(boundary, this.initial, this.kind, this.requestedSpeed) ||
      boundary.generation !== this.generation || boundary.resourceRevision !== this.resourceRevision ||
      !Number.isSafeInteger(boundary.commandId) || boundary.commandId < 1 ||
      !Number.isFinite(boundary.startedAtMs) || boundary.startedAtMs < this.startedAtMs || boundary.startedAtMs > nowMs ||
      boundary.startedAtMs >= this.deadlineMs || boundary.packetSequenceFloor < this.lastSequence ||
      boundary.ingressSequenceFloor < this.lastIngress) { this.cancel(); return false; }
    this.boundary = boundary; this.clearCandidate(); return true;
  }

  observe(snapshot: DeoVrSnapshot, nowMs: number): void {
    // Evaluate the old deadline/freshness before consuming a newly arrived packet:
    // a late receipt cannot revive a transaction that expired without a UI tick.
    if (!this.checkTime(nowMs)) { return; }
    if (!this.validSource(snapshot)) { this.cancel(); return; }
    const observation: DeoVrPacketObservation = snapshot.lastObservation as DeoVrPacketObservation;
    if (observation.packetSequence < this.lastSequence) { this.clearCandidate(); return; }
    if (observation.packetSequence === this.lastSequence) { return; }
    if (observation.lastIngressId < this.lastIngress || observation.receivedAtMs < this.lastReceiveAt ||
      observation.receivedAtMs > nowMs || observation.firstReceivedAtMs > nowMs) { this.cancel(); return; }
    this.lastSequence = observation.packetSequence; this.lastIngress = observation.lastIngressId;
    this.lastReceiveAt = observation.receivedAtMs;
    if (observation.positionSeconds !== null) {
      if (!this.validPosition(observation.positionSeconds, snapshot) || observation.positionSeconds < this.lastPosition) { this.cancel(); return; }
      if (observation.positionSeconds > this.lastPosition) { this.lastProgressAt = observation.receivedAtMs; }
      this.lastPosition = observation.positionSeconds; this.lastFreshAt = observation.receivedAtMs;
    }
    if (observation.playerState !== null) {
      if (observation.playerState !== 0 && observation.playerState !== 1) { this.cancel(); return; }
      this.lastPlaying = observation.playerState === 0;
    }
    if (!this.checkTime(nowMs)) { return; }
    const boundary: DeoVrDispatchBoundary | null = this.boundary;
    if (boundary === null || observation.packetSequence <= boundary.packetSequenceFloor ||
      observation.firstIngressId <= boundary.ingressSequenceFloor || observation.firstReceivedAtMs < boundary.startedAtMs ||
      nowMs - observation.firstReceivedAtMs > DeoVrControlEvidence.STALE_MS || !this.matches(observation)) {
      this.clearCandidate(); return;
    }
    const prior: DeoVrPacketObservation | null = this.candidate;
    if (prior === null) { this.candidate = observation; return; }
    const distinct: boolean = observation.packetSequence > prior.packetSequence &&
      observation.lastIngressId > prior.lastIngressId &&
      observation.receivedAtMs > prior.receivedAtMs;
    const progressing: boolean = this.kind === 'play' || (this.kind === 'speed' && this.startState === 0);
    const position: number = observation.positionSeconds as number;
    const previousPosition: number = prior.positionSeconds as number;
    const compatible: boolean = progressing ? position > previousPosition && position > this.startPosition : position === previousPosition;
    if (distinct && compatible && nowMs - prior.firstReceivedAtMs <= DeoVrControlEvidence.STALE_MS) {
      this.status = 'observed'; this.candidate = observation;
    } else {
      // A duplicate timestamp/chunk or contradictory position cannot preserve an
      // earlier pair. This actual packet may start a new pair, never complete it.
      this.status = 'pending'; this.candidate = observation;
    }
  }

  cancel(): void { this.status = 'cancelled'; this.candidate = null; }
  snapshot(nowMs: number): DeoVrControlEvidenceSnapshot {
    this.checkTime(nowMs);
    const proof: DeoVrPacketObservation | null = this.status === 'observed' ? this.candidate : null;
    return Object.freeze({ status: this.status, requestId: this.requestId, kind: this.kind,
      generation: this.generation, resourceRevision: this.resourceRevision, startedAtMs: this.startedAtMs,
      deadlineMs: this.deadlineMs, commandId: this.boundary === null ? -1 : this.boundary.commandId,
      packetSequence: proof === null ? -1 : proof.packetSequence, observedAtMs: proof === null ? -1 : proof.receivedAtMs });
  }
  private clearCandidate(): void { if (this.status !== 'cancelled') { this.status = 'pending'; this.candidate = null; } }
  private validSource(snapshot: DeoVrSnapshot): boolean {
    const observation: DeoVrPacketObservation | null = snapshot.lastObservation ?? null;
    return snapshot.status === 'connected' && !snapshot.quarantined && snapshot.diagnostic === null &&
      snapshot.generation === this.generation && snapshot.resourceRevision === this.resourceRevision &&
      snapshot.path === this.path && this.path !== null && snapshot.durationValid &&
      snapshot.durationSeconds !== null && Number.isFinite(snapshot.durationSeconds) && snapshot.durationSeconds > 0 &&
      observation !== null && isDeoVrPacketObservation(observation) && this.initial !== null &&
      sameDeoVrObservationSource(this.initial, observation) && observation.generation === this.generation &&
      observation.resourceRevision === this.resourceRevision && observation.path === this.path &&
      Number.isSafeInteger(observation.packetSequence) && observation.packetSequence > 0 &&
      Number.isSafeInteger(observation.firstIngressId) && observation.firstIngressId > 0 &&
      observation.lastIngressId >= observation.firstIngressId && Number.isFinite(observation.firstReceivedAtMs) &&
      observation.firstReceivedAtMs >= 0 && observation.receivedAtMs >= observation.firstReceivedAtMs;
  }
  private validPosition(position: number, snapshot: DeoVrSnapshot): boolean {
    return Number.isFinite(position) && position >= 0 && snapshot.durationSeconds !== null && position <= snapshot.durationSeconds;
  }
  private matches(observation: DeoVrPacketObservation): boolean {
    if (observation.positionSeconds === null) { return false; }
    if (this.kind === 'play') { return observation.playerState === 0; }
    if (this.kind === 'pause') { return observation.playerState === 1; }
    return observation.playerState === this.startState && observation.speed === this.requestedSpeed;
  }
  private checkTime(nowMs: number): boolean {
    if (this.status === 'cancelled') { return false; }
    if ((this.boundary !== null && (this.initial === null ||
      !isDeoVrDispatchBoundaryForObservation(this.boundary, this.initial, this.kind, this.requestedSpeed))) ||
      !Number.isFinite(nowMs) || nowMs < 0 || nowMs < this.lastNow || nowMs >= this.deadlineMs ||
      this.lastFreshAt < 0 || nowMs < this.lastFreshAt || nowMs - this.lastFreshAt > DeoVrControlEvidence.STALE_MS ||
      (this.lastPlaying && (this.lastProgressAt < 0 || nowMs < this.lastProgressAt || nowMs - this.lastProgressAt > DeoVrControlEvidence.STALE_MS))) {
      this.cancel(); return false;
    }
    this.lastNow = nowMs; return true;
  }
}
