import { AxisChapter, AxisKeyframe } from '../AxisScriptStore';

/** ScriptViewModel.SeekMediaToTime: command target only, never a clock update. */
export function mediaSeekTarget(timeSeconds: number, durationSeconds: number): number | null {
  if (!Number.isFinite(timeSeconds) || !Number.isFinite(durationSeconds) || durationSeconds < 0) { return null; }
  return Math.max(0, Math.min(timeSeconds, durationSeconds));
}

/** Source-equivalent MediaLoopSegment + ScriptViewModel loop commands.
 * Times are seconds. Invalidating one bound preserves the other; no auto-sort. */
export class MediaLoopControls {
  startPosition: number | null = null;
  endPosition: number | null = null;
  private updateTime: number = 0;
  get isValid(): boolean { return this.startPosition !== null && this.endPosition !== null; }
  clear(): void { this.startPosition = null; this.endPosition = null; }
  setStart(position: number | null, durationSeconds: number): number | null {
    // Comparison precedes finite sanitization in the C# setter, including infinity.
    if (position !== null && this.endPosition !== null && position >= this.endPosition) { this.endPosition = null; }
    this.startPosition = position !== null && Number.isFinite(position) ? position : null;
    return this.seekStart(durationSeconds);
  }
  setEnd(position: number | null, durationSeconds: number): number | null {
    if (position !== null && this.startPosition !== null && position <= this.startPosition) { this.startPosition = null; }
    this.endPosition = position !== null && Number.isFinite(position) ? position : null;
    return this.seekStart(durationSeconds);
  }
  setLoop(start: number, end: number, durationSeconds: number): number | null {
    this.clear(); this.setStart(start, durationSeconds); return this.setEnd(end, durationSeconds);
  }
  cycle(positionSeconds: number, durationSeconds: number): number | null {
    if (this.isValid) { this.clear(); return null; }
    if (this.startPosition === null) { return this.setStart(positionSeconds, durationSeconds); }
    if (this.endPosition === null) { return this.setEnd(positionSeconds, durationSeconds); }
    return null;
  }
  private seekStart(durationSeconds: number): number | null {
    return this.isValid && this.startPosition !== null ? mediaSeekTarget(this.startPosition, durationSeconds) : null;
  }
  /** First non-null axis collection, inclusive endpoints; prefer exact hit over
   * a +/-1 second tolerance hit. Do not use MarkerNavigation's half-open rules. */
  fromCurrentChapter(axisChapters: (AxisChapter[] | null)[], positionSeconds: number,
    durationSeconds: number): number | null {
    const chapters = axisChapters.find(value => value !== null);
    if (chapters === undefined || chapters === null) { return null; }
    const chapter = chapters.find(value => positionSeconds >= value.startTimeSeconds && positionSeconds <= value.endTimeSeconds)
      ?? chapters.find(value => positionSeconds >= value.startTimeSeconds - 1 && positionSeconds <= value.endTimeSeconds + 1);
    return chapter === undefined ? null : this.setLoop(chapter.startTimeSeconds, chapter.endTimeSeconds, durationSeconds);
  }
  /** Feed only a detected seek (force or >1s error) after initial position is
   * finite, per Handle(MediaPositionChangedMessage). Partial loops also clear. */
  onDetectedSeek(positionSeconds: number): void {
    if ((this.startPosition !== null && positionSeconds <= this.startPosition - 1) ||
      (this.endPosition !== null && positionSeconds >= this.endPosition + 1)) { this.clear(); }
  }
  /** UpdateMediaLoop has no playing guard. The 100ms accumulator resets to zero
   * rather than retaining remainder; this returns a seek request, not execution. */
  update(deltaSeconds: number, positionSeconds: number, durationSeconds: number): number | null {
    this.updateTime += deltaSeconds;
    if (this.updateTime < 0.1) { return null; }
    this.updateTime = 0;
    return this.isValid && this.endPosition !== null && positionSeconds >= this.endPosition
      ? this.seekStart(durationSeconds) : null;
  }
}

/** Exact KeyframeCollection.SkipGap(0), including 0.001 position/value epsilon.
 * Empty/singleton collections return null; an all-flat list uses its last point. */
export function scriptStartPosition(keyframes: AxisKeyframe[]): number | null {
  if (keyframes.length < 2) { return null; }
  let index = 0;
  while (index + 1 < keyframes.length &&
    (Math.abs(keyframes[index + 1].value - keyframes[index].value) < 0.001 ||
     Math.abs(keyframes[index + 1].positionSeconds - keyframes[index].positionSeconds) < 0.001)) { index++; }
  return keyframes[index].positionSeconds;
}

export function seekToScriptStart(axisKeyframes: (AxisKeyframe[] | null)[], durationSeconds: number,
  mediaPositionSeconds: number, offsetSeconds: number = -5, onlyWhenBefore: boolean = true): number | null {
  if (!Number.isFinite(durationSeconds) || !Number.isFinite(offsetSeconds)) { return null; }
  // FirstOrDefault follows Select, not filtering null results. An empty FIRST
  // collection intentionally blocks fallback to a later populated collection.
  const keyframes = axisKeyframes.find(value => value !== null);
  if (keyframes === undefined || keyframes === null) { return null; }
  const start = scriptStartPosition(keyframes);
  if (start === null) { return null; }
  const target = Math.max(Math.min(start, durationSeconds) + offsetSeconds, 0);
  if (onlyWhenBefore && target <= mediaPositionSeconds) { return null; }
  return mediaSeekTarget(target, durationSeconds);
}

/** ScheduleAutoSkipToScriptStart: duration-event triggered 1000ms delay with
 * in-flight coalescing, NOT a trailing-edge debounce. Inject monotonic seconds;
 * caller polls after scripts finish loading. Reads latest state at execution. */
export class AutoSkipToScriptStart {
  enabled: boolean = true;
  offsetSeconds: number = -5;
  private dueSeconds: number | null = null;
  get pending(): boolean { return this.dueSeconds !== null; }
  onDurationMessage(nowSeconds: number, hasCancellationToken: boolean = true): void {
    if (!this.enabled || this.pending || !hasCancellationToken) { return; }
    this.dueSeconds = nowSeconds + 1;
  }
  cancel(): void { this.dueSeconds = null; }
  poll(nowSeconds: number, axisKeyframes: (AxisKeyframe[] | null)[], durationSeconds: number,
    mediaPositionSeconds: number): number | null {
    if (this.dueSeconds === null || nowSeconds < this.dueSeconds) { return null; }
    this.dueSeconds = null;
    // Upstream does not recheck Enabled inside the already scheduled task.
    return seekToScriptStart(axisKeyframes, durationSeconds, mediaPositionSeconds, this.offsetSeconds, true);
  }
}
