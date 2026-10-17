/** AVPlayer observations only: never integrates elapsed time or requested seek targets. */
export class MediaClockSnapshot {
  state: string = 'idle';
  positionMs: number = 0;
  durationMs: number = 0;
  rate: number = 1;
  ready: boolean = false;
  playing: boolean = false;
  seeking: boolean = false;
  valid: boolean = false;
  failure: string = '';
  generation: number = 0;
  safetyGateOpen: boolean = false;
  observationSequence: number = 0;
  observedMonotonicMs: number = -1;
  seekSequence: number = 0;
}

export class MediaClock {
  private value: MediaClockSnapshot = new MediaClockSnapshot();
  private intent: boolean = false;
  private buffering: boolean = false;
  private lastObservation: number = -1;

  reset(state: string = 'idle'): number {
    const generation = this.value.generation + 1;
    this.value = new MediaClockSnapshot();
    this.value.generation = generation;
    this.value.state = state;
    this.intent = false; this.buffering = false; this.lastObservation = -1;
    return generation;
  }
  accepts(generation: number): boolean { return generation === this.value.generation; }
  prepared(generation: number, durationMs: number, positionMs: number, now: number): void {
    if (!this.accepts(generation)) { return; }
    this.value.durationMs = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0;
    this.value.ready = this.value.durationMs > 0;
    this.value.state = 'prepared'; this.intent = false; this.value.playing = false;
    this.observe(generation, positionMs, now);
  }
  observe(generation: number, positionMs: number, now: number): void {
    if (!this.accepts(generation) || this.value.seeking) { return; }
    if (!this.value.ready || !Number.isFinite(positionMs) || positionMs < 0 ||
      positionMs > this.value.durationMs || !Number.isFinite(now) || now < 0) {
      this.value.valid = false; this.intent = false; this.updateGate(); return;
    }
    this.value.positionMs = positionMs; this.lastObservation = now;
    this.value.observationSequence++; this.value.observedMonotonicMs = now;
    this.value.valid = true; this.updateGate();
  }
  requestPlay(): boolean {
    this.intent = this.value.ready && this.value.valid && !this.value.seeking &&
      !this.buffering && this.value.positionMs < this.value.durationMs;
    this.updateGate(); return this.intent;
  }
  pause(): void { this.intent = false; this.value.playing = false; this.updateGate(); }
  stateChanged(generation: number, state: string): void {
    if (!this.accepts(generation)) { return; }
    this.value.state = state; this.value.playing = state === 'playing';
    if (state !== 'playing') { this.intent = false; }
    if (state === 'error' || state === 'released') { this.value.ready = false; this.value.valid = false; }
    this.updateGate();
  }
  beginSeek(): void { this.pause(); this.value.seeking = true; this.value.valid = false; this.updateGate(); }
  endSeek(generation: number, actualPositionMs: number, now: number): void {
    if (!this.accepts(generation)) { return; }
    this.value.seeking = false; this.value.seekSequence++; this.observe(generation, actualPositionMs, now);
  }
  setBuffering(generation: number, buffering: boolean): void {
    if (!this.accepts(generation)) { return; }
    this.buffering = buffering;
    if (buffering) { this.pause(); this.value.valid = false; }
    this.updateGate();
  }
  rateChanged(generation: number, rate: number): void {
    if (!this.accepts(generation)) { return; }
    if (Number.isFinite(rate) && rate >= 0.125 && rate <= 4) { this.value.rate = rate; }
    else { this.fail('Invalid native playback rate.'); }
  }
  checkFreshness(now: number, timeoutMs: number = 750): boolean {
    if (!Number.isFinite(now) || now < 0 || !Number.isFinite(timeoutMs) || timeoutMs < 0 ||
      (this.value.playing && (now < this.lastObservation || now - this.lastObservation > timeoutMs))) {
      this.pause(); this.value.valid = false; this.updateGate(); return false;
    }
    return true;
  }
  fail(message: string): void {
    this.pause(); this.value.failure = message; this.value.state = 'error';
    this.value.valid = false; this.value.ready = false; this.updateGate();
  }
  snapshot(): MediaClockSnapshot {
    const copy = new MediaClockSnapshot();
    copy.state = this.value.state; copy.positionMs = this.value.positionMs;
    copy.durationMs = this.value.durationMs; copy.rate = this.value.rate;
    copy.ready = this.value.ready; copy.playing = this.value.playing;
    copy.seeking = this.value.seeking; copy.valid = this.value.valid;
    copy.failure = this.value.failure; copy.generation = this.value.generation;
    copy.safetyGateOpen = this.value.safetyGateOpen;
    copy.observationSequence = this.value.observationSequence; copy.observedMonotonicMs = this.value.observedMonotonicMs;
    copy.seekSequence = this.value.seekSequence; return copy;
  }
  private updateGate(): void {
    this.value.safetyGateOpen = this.intent && this.value.playing && this.value.ready &&
      this.value.valid && !this.value.seeking && !this.buffering && this.value.failure.length === 0 &&
      this.value.positionMs < this.value.durationMs;
  }
}
