/** Shared by the ArkUI input plane and the visual integration harness.
 * No playback/output side effects: native events remain the clock authority. */
export type VideoPlaybackIntent = 'blocked' | 'pause' | 'play' | 'replay';
export function videoPlaybackIntent(playing: boolean, intended: boolean, ready: boolean,
  ended: boolean, available: boolean, pending: boolean, startingBlocked: boolean): VideoPlaybackIntent {
  if (!available || pending) { return 'blocked'; }
  // A completed ready source may retain the old play intent. One click replays.
  // During a pending seek/start, intention still exposes a safe cancel/pause.
  if (playing || (intended && (!ended || !ready))) { return 'pause'; }
  if (!ready || startingBlocked) { return 'blocked'; }
  return ended ? 'replay' : 'play';
}
export class VideoDragBounds {
  minX: number; maxX: number; minY: number; maxY: number;
  constructor(width: number, height: number, videoWidth: number, videoHeight: number, header: number) {
    this.minX = Math.min(8, Math.max(0, width - videoWidth));
    this.maxX = Math.max(this.minX, width - videoWidth - 8);
    this.minY = Math.max(0, Math.min(height - videoHeight, header + 8));
    this.maxY = Math.max(this.minY, height - videoHeight - 8);
  }
  x(ratio: number): number { return this.minX + boundedRatio(ratio) * (this.maxX - this.minX); }
  y(ratio: number): number { return this.minY + boundedRatio(ratio) * (this.maxY - this.minY); }
}
function boundedRatio(value: number): number { return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1; }
export class VideoDragSession {
  active: boolean = false; moved: boolean = false;
  xRatio: number = 1; yRatio: number = 1;
  private originX: number = 0; private originY: number = 0;
  begin(x: number, y: number): void {
    this.active = Number.isFinite(x) && Number.isFinite(y); this.moved = false;
    this.originX = x; this.originY = y;
  }
  move(offsetX: number, offsetY: number, bounds: VideoDragBounds): boolean {
    if (!this.active || !Number.isFinite(offsetX) || !Number.isFinite(offsetY)) { return false; }
    if (!this.moved && Math.hypot(offsetX, offsetY) < 8) { return false; }
    this.moved = true;
    this.xRatio = bounds.maxX > bounds.minX ? boundedRatio((this.originX + offsetX - bounds.minX) / (bounds.maxX - bounds.minX)) : 0;
    this.yRatio = bounds.maxY > bounds.minY ? boundedRatio((this.originY + offsetY - bounds.minY) / (bounds.maxY - bounds.minY)) : 0;
    return true;
  }
  cancel(): void { this.active = false; this.moved = false; }
}
