import { AxisKeyframe, AxisKeyframes } from '../AxisScriptStore';
import type { InterpolationMode } from '../Interpolation';
import { MotionConfigurations, MotionCurvePoint, MotionProviderConfiguration } from '../MotionConfiguration';
import { MotionProvider } from './MotionProvider';
import type { MotionSyncCallback } from './MotionProvider';

/** Source: MotionProvider/ViewModels/CustomCurveMotionProvider.cs.
 * Loop boundaries discard overshoot. Completion emits NaN once and pauses.
 * Source only refreshes tiled keyframes after points/duration changes, not after
 * interpolation/loop switches; retain this subtle property-setter behavior.
 */
export class CustomCurveMotion extends MotionProvider {
  private index: number = -1;
  private keyframes: AxisKeyframe[] = [];
  private playing: boolean = true;
  private pendingRefresh: boolean = true;
  private timeSeconds: number = 0;

  constructor(axisName: string, configuration?: MotionProviderConfiguration, onSyncRequested?: MotionSyncCallback) {
    super(axisName, 'Custom Curve', configuration, onSyncRequested);
  }

  getTimeSeconds(): number { return this.timeSeconds; }
  isPlaying(): boolean { return this.playing; }

  /** UI point edits mutate the existing collection, so they refresh without a
   * Points property notification/RequestSync. Scalar configure behavior stays
   * separate; an identical DTO does not by itself identify a collection event. */
  configure(configuration: MotionProviderConfiguration): void {
    const next: MotionProviderConfiguration = MotionConfigurations.clone(configuration);
    if (next.id !== this.id) { throw new Error('Motion provider configuration has the wrong id.'); }
    const scalarChange: boolean = next.speed !== this.configuration.speed || next.minimum !== this.configuration.minimum ||
      next.maximum !== this.configuration.maximum || next.durationSeconds !== this.configuration.durationSeconds ||
      next.interpolationMode !== this.configuration.interpolationMode || next.isLooping !== this.configuration.isLooping ||
      next.syncOnEnd !== this.configuration.syncOnEnd;
    this.applyValidatedConfiguration(next, scalarChange);
  }

  /** Source Points::Set: Duration, then InterpolationType, then Points.SetFrom.
   * Validate first, preserve phase/playing/cache, and always observe collection
   * Reset even for identical points. Duration/Viewport notification resets are
   * coalesced; this models numeric sync, not woven Fody callback counts. */
  setPoints(durationSeconds: number, interpolationMode: InterpolationMode, points: MotionCurvePoint[], oldPointsAfterViewport?: MotionCurvePoint[]): MotionProviderConfiguration {
    if (!Number.isFinite(durationSeconds) || durationSeconds < 1 || durationSeconds > 60 ||
      ['linear', 'pchip', 'makima', 'step'].indexOf(interpolationMode) < 0 || !Array.isArray(points)) {
      throw new Error('Invalid Custom Curve points command.');
    }
    const candidate: MotionProviderConfiguration = this.getConfiguration();
    candidate.durationSeconds = durationSeconds;
    candidate.interpolationMode = interpolationMode;
    candidate.points = points;
    const next: MotionProviderConfiguration = MotionConfigurations.clone(candidate);
    const duration: MotionProviderConfiguration = this.getConfiguration();
    duration.durationSeconds = next.durationSeconds;
    if (oldPointsAfterViewport !== undefined) { duration.points = oldPointsAfterViewport; }
    const checkedDuration: MotionProviderConfiguration = MotionConfigurations.clone(duration);
    this.applyValidatedConfiguration(checkedDuration);
    const interpolation: MotionProviderConfiguration = this.getConfiguration();
    interpolation.interpolationMode = next.interpolationMode;
    this.applyValidatedConfiguration(interpolation);
    this.applyValidatedConfiguration(next, false, true);
    this.pendingRefresh = true;
    return this.getConfiguration();
  }

  /** Measured canvas indexer/removal effects mutate the existing collection.
   * Preserve phase/cache and refresh even when a write returns equal coordinates. */
  replacePointsFromCanvas(points: MotionCurvePoint[]): MotionProviderConfiguration {
    const next: MotionProviderConfiguration = this.getConfiguration(); next.points = points;
    this.applyValidatedConfiguration(MotionConfigurations.clone(next), false, true);
    this.pendingRefresh = true; return this.getConfiguration();
  }

  reset(requestSync: boolean = false): void {
    if (requestSync) { this.requestSync(); }
    this.resetState(true);
  }

  protected onConfigurationChanged(previous: MotionProviderConfiguration): void {
    if (previous.durationSeconds !== this.configuration.durationSeconds ||
      JSON.stringify(previous.points) !== JSON.stringify(this.configuration.points)) { this.pendingRefresh = true; }
    if (!previous.isLooping && this.configuration.isLooping) { this.playing = true; }
  }

  update(deltaSeconds: number): void {
    const points: MotionCurvePoint[] = this.configuration.points as MotionCurvePoint[];
    if (points.length === 0) { return; }
    const needsRefresh: boolean = this.pendingRefresh;
    if (needsRefresh) { this.pendingRefresh = false; this.refresh(points); }
    if (!this.playing) { return; }
    if (needsRefresh) { this.index = AxisKeyframes.searchForIndexBefore(this.keyframes, this.timeSeconds); }
    if (this.timeSeconds >= (this.configuration.durationSeconds as number) || this.index + 1 >= this.keyframes.length) {
      this.resetState(this.configuration.isLooping as boolean);
      if (!this.configuration.isLooping) {
        if (this.configuration.syncOnEnd) { this.requestSync(); }
        this.writeValue(NaN);
        return;
      }
    }
    this.index = AxisKeyframes.advanceIndex(this.keyframes, this.index, this.timeSeconds);
    if (!AxisKeyframes.valid(this.keyframes, this.index) || !AxisKeyframes.valid(this.keyframes, this.index + 1)) { return; }
    const value: number = Math.max(0, Math.min(1, AxisKeyframes.interpolate(this.keyframes, this.index,
      this.timeSeconds, this.configuration.interpolationMode as InterpolationMode)));
    this.writeValue(this.map(value));
    this.timeSeconds += this.configuration.speed * deltaSeconds;
  }

  private resetState(playing: boolean): void {
    this.timeSeconds = 0; this.index = -1; this.playing = playing;
  }

  private refresh(points: MotionCurvePoint[]): void {
    this.keyframes = [];
    const duration: number = this.configuration.durationSeconds as number;
    if (this.configuration.isLooping && points.length !== 1) {
      const minimum: number = this.configuration.interpolationMode === 'makima' ? 3 :
        this.configuration.interpolationMode === 'pchip' ? 2 : 1;
      const tileCount: number = Math.ceil(Math.max(0, (minimum - points.length) / points.length)) + 1;
      const takeCount: number = Math.min(minimum, points.length);
      for (let tile: number = tileCount; tile >= 1; tile--) {
        for (const point of points.slice(points.length - takeCount)) { this.add(point.x - tile * duration, point.y); }
      }
      for (const point of points) { this.add(point.x, point.y); }
      for (let tile: number = 1; tile <= tileCount; tile++) {
        for (const point of points.slice(0, takeCount)) { this.add(point.x + tile * duration, point.y); }
      }
    } else {
      this.add(0, points[0].y);
      for (const point of points) { this.add(point.x, point.y); }
      this.add(duration, points[points.length - 1].y);
    }
  }

  /** KeyframeCollection.Add inserts sorted and keeps the FIRST equal position. */
  private add(positionSeconds: number, value: number): void {
    const before: number = AxisKeyframes.searchForIndexBefore(this.keyframes, positionSeconds);
    const index: number = before + 1;
    if (AxisKeyframes.valid(this.keyframes, index) && this.keyframes[index].positionSeconds === positionSeconds) { return; }
    this.keyframes.splice(index, 0, new AxisKeyframe(positionSeconds, value));
  }
}
