import type { DeoVrSnapshot } from '../media/deovr/DeoVrTypes';

/** Local receipt evidence for DeoVR. This does not estimate positions, confirm a
 * command, or claim a remote timestamp. The original MediaPositionTracker owns
 * numerical integration. Every resource must establish its own observations. */
export class RemoteMediaClock {
  static readonly STALE_MS: number = 750;
  generation: number = -1;
  resourceRevision: number = -1;
  receiptSequence: number = -1;
  observedAtMs: number = -1;
  lastChangedAtMs: number = -1;
  positionSeconds: number = Number.NaN;
  durationSeconds: number = Number.NaN;
  speed: number = 1;
  playing: boolean = false;
  path: string = '';
  connected: boolean = false;
  admitted: boolean = false;
  private pauseRequested: boolean = false;
  private receiptFloor: number = -1;
  private resourceObserved: boolean = false;
  private stateObserved: boolean = false;
  private durationObserved: boolean = false;

  begin(generation: number): void {
    if (!Number.isSafeInteger(generation) || generation < 0) { throw new Error('Invalid remote generation.'); }
    this.generation = generation; this.resourceRevision = -1; this.receiptSequence = -1;
    this.receiptFloor = -1; this.pauseRequested = false; this.connected = false; this.admitted = true; this.clearResource();
  }
  stop(): void { this.admitted = false; this.receiptFloor = this.receiptSequence; }
  admit(): void { this.pauseRequested = false; this.admitted = true; this.receiptFloor = this.receiptSequence; }
  requestPause(): void { this.pauseRequested = true; }
  seek(): void { this.receiptFloor = this.receiptSequence; }
  close(): void { this.stop(); this.connected = false; this.clearResource(); }
  private clearResource(): void {
    this.observedAtMs = -1; this.lastChangedAtMs = -1; this.positionSeconds = Number.NaN;
    this.durationSeconds = Number.NaN; this.speed = 1; this.playing = false; this.path = '';
    this.resourceObserved = false; this.stateObserved = false; this.durationObserved = false;
  }
  /** Returns whether a genuinely new currentTime receipt was consumed. */
  accept(snapshot: DeoVrSnapshot): boolean {
    if (snapshot.generation !== this.generation || snapshot.resourceRevision < this.resourceRevision ||
      snapshot.receiptSequence < this.receiptSequence) { return false; }
    this.connected = snapshot.status === 'connected' && !snapshot.quarantined;
    if (!this.connected) { this.playing = false; return false; }
    if (snapshot.resourceRevision !== this.resourceRevision) {
      this.clearResource(); this.resourceRevision = snapshot.resourceRevision;
    }
    if (snapshot.path === null) { this.clearResource(); return false; }
    this.path = snapshot.path;
    if (snapshot.playerStateValid) { this.stateObserved = true; this.playing = snapshot.playing; if (!this.playing) { this.pauseRequested = false; } }
    if (snapshot.durationValid && snapshot.durationSeconds !== null && Number.isFinite(snapshot.durationSeconds) && snapshot.durationSeconds >= 0) {
      this.durationObserved = true; this.durationSeconds = snapshot.durationSeconds;
    }
    if (snapshot.speedValid && snapshot.speed !== null && Number.isFinite(snapshot.speed) && snapshot.speed > 0) { this.speed = snapshot.speed; }
    if (snapshot.receiptSequence === this.receiptSequence || !snapshot.currentTimeValid ||
      snapshot.positionSeconds === null || !Number.isFinite(snapshot.positionSeconds) || snapshot.positionSeconds < 0 ||
      !Number.isFinite(snapshot.observedAtMs) || snapshot.observedAtMs < 0 || snapshot.observedAtMs < this.observedAtMs) { return false; }
    const changed = !this.resourceObserved || snapshot.positionSeconds !== this.positionSeconds;
    this.receiptSequence = snapshot.receiptSequence; this.observedAtMs = snapshot.observedAtMs;
    if (changed) { this.lastChangedAtMs = snapshot.observedAtMs; }
    this.positionSeconds = snapshot.positionSeconds; this.resourceObserved = true; return true;
  }
  ready(nowMs: number): boolean {
    return !this.pauseRequested && this.admitted && this.connected && this.path.length > 0 && this.resourceObserved && this.stateObserved && this.durationObserved &&
      this.receiptSequence > this.receiptFloor && Number.isFinite(nowMs) && nowMs >= this.observedAtMs &&
      nowMs - this.observedAtMs <= RemoteMediaClock.STALE_MS && this.durationSeconds > 0 && this.positionSeconds <= this.durationSeconds &&
      (!this.playing || (nowMs >= this.lastChangedAtMs && nowMs - this.lastChangedAtMs <= RemoteMediaClock.STALE_MS));
  }
}
