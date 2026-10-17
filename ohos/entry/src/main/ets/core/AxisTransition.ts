/** Source: ScriptViewModel.cs::AxisValueTransition (upstream 36c08fbb).
 * Seconds and normalized values throughout; this is not an output command.
 */
export class AxisTransition {
  private currentValue: number = Number.NaN;
  private fromValue: number = Number.NaN;
  private toValue: number = Number.NaN;
  private durationSeconds: number = 0;
  private timeSeconds: number = -1;
  private initialized: boolean = false;

  get isInitialized(): boolean { return this.initialized; }
  get isFinished(): boolean {
    return this.initialized && this.timeSeconds >= 0 && this.timeSeconds >= this.durationSeconds;
  }

  update(deltaSeconds: number): number {
    if (!this.initialized || this.isFinished) { return Number.NaN; }
    const nextTime: number = this.timeSeconds < 0 ? deltaSeconds : this.timeSeconds + deltaSeconds;
    const isEnd: boolean = this.timeSeconds < this.durationSeconds && nextTime >= this.durationSeconds;
    this.timeSeconds = nextTime;
    if (isEnd) {
      this.initialized = false;
      return this.toValue;
    }
    const t: number = Math.max(0, Math.min(1, this.timeSeconds / this.durationSeconds));
    this.currentValue = this.fromValue + (this.toValue - this.fromValue) * t;
    return this.currentValue;
  }

  set(fromValue: number, toValue: number, durationSeconds: number): void {
    this.initialized = true;
    this.currentValue = fromValue;
    this.fromValue = fromValue;
    this.toValue = toValue;
    this.durationSeconds = durationSeconds;
    this.timeSeconds = -1;
  }

  /** Upstream includes the initial -1 sentinel in remaining-duration arithmetic. */
  append(offset: number, durationSeconds: number): void {
    if (!this.initialized) { return; }
    const target: number = this.toValue + offset;
    const duration: number = this.durationSeconds + (durationSeconds - this.timeSeconds);
    // Portable safety bound: finite arguments may still overflow the original
    // append arithmetic. Reject atomically rather than creating an endless or
    // non-finite transition that could be mistaken for a valid output source.
    if (!Number.isFinite(offset) || !Number.isFinite(durationSeconds) || durationSeconds < 0 ||
      !Number.isFinite(target) || !Number.isFinite(duration)) { throw new Error('Manual transition append overflow.'); }
    this.fromValue = this.currentValue;
    this.toValue = target;
    this.durationSeconds = duration;
    this.timeSeconds = -1;
  }
}
