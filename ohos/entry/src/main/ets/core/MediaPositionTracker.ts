/** Source: ScriptViewModel.UpdateThread (147+) and Handle(MediaPositionChangedMessage).
 * Native observations anchor this tracker. Only an explicitly permitted playing
 * clock advances; frozen/buffering/seek/stale callers must pass playing=false.
 * Reading snapshot never advances time. Units are seconds throughout. */
export class MediaPositionTracker {
  private internal: number = Number.NaN;
  private position: number = Number.NaN;
  reset(): void { this.internal = Number.NaN; this.position = Number.NaN; }
  snapshot(): number { return this.position; }
  internalSnapshot(): number { return this.internal; }
  observe(positionSeconds: number, forceSeek: boolean = false): boolean {
    if (!Number.isFinite(positionSeconds) || positionSeconds < 0) { throw new Error('Invalid confirmed media position.'); }
    if (!Number.isFinite(this.position)) { this.internal = positionSeconds; this.position = positionSeconds; return true; }
    const error: number = Number.isFinite(this.internal) ? positionSeconds - this.internal : 0;
    if (Math.abs(error) > 1 || forceSeek) {
      this.internal = positionSeconds; this.position = positionSeconds; return true;
    }
    this.internal += 0.33 * (positionSeconds - this.internal);
    return false;
  }
  tick(deltaSeconds: number, playbackSpeed: number, playing: boolean): number {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0 || !Number.isFinite(playbackSpeed) || playbackSpeed <= 0) {
      throw new Error('Invalid media clock delta or speed.');
    }
    if (playing && Number.isFinite(this.internal) && Number.isFinite(this.position)) {
      const step: number = deltaSeconds * playbackSpeed;
      this.internal += step;
      this.position += Math.max(step * 0.9, Math.min(step * 1.1, this.internal - this.position));
    }
    return this.position;
  }
}
