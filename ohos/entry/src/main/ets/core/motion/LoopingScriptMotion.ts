import { AxisKeyframe, AxisKeyframes, AxisScriptResource } from '../AxisScriptStore';
import type { InterpolationMode } from '../Interpolation';
import { MotionProviderConfiguration } from '../MotionConfiguration';
import { MotionProvider } from './MotionProvider';
import type { MotionSyncCallback } from './MotionProvider';

/** LoopingScriptMotionProvider.cs timing; resource loading is an external adapter.
 * No URI access, filesystem, directory picker or implicit permission is here.
 */
export class LoopingScriptMotion extends MotionProvider {
  private script: AxisScriptResource | null = null;
  private timeSeconds: number = 0;
  private scriptStart: number = 0;
  private scriptEnd: number = 0;
  private scriptIndex: number = 0;
  private resourceGeneration: number = 0;

  constructor(axisName: string, configuration?: MotionProviderConfiguration, onSyncRequested?: MotionSyncCallback) {
    super(axisName, 'Looping Script', configuration, onSyncRequested);
  }

  getTimeSeconds(): number { return this.timeSeconds; }
  getScriptResource(): AxisScriptResource | null { return this.script; }

  setScriptResource(resource: AxisScriptResource | null): void {
    this.script = resource === null ? null : AxisScriptResource.copy(resource);
    this.advanceResourceGeneration();
    this.scriptIndex = -1;
    const points: AxisKeyframe[] = this.script === null ? [] : this.script.keyframes;
    this.scriptStart = points.length === 0 ? NaN : points[0].positionSeconds;
    this.scriptEnd = points.length === 0 ? NaN : points[points.length - 1].positionSeconds;
    this.timeSeconds = this.scriptStart;
    // Script/SourceFile setters upstream request sync, but do NOT reset Value.
    this.requestSync();
  }

  protected onConfigurationChanged(previous: MotionProviderConfiguration): void {
    if (previous.sourceUri !== this.configuration.sourceUri) {
      // Changing the reference cannot retain playback from a different file.
      // The authorized adapter must explicitly supply the newly loaded resource.
      this.script = null; this.scriptIndex = -1;
      this.advanceResourceGeneration();
      this.scriptStart = NaN; this.scriptEnd = NaN; this.timeSeconds = NaN;
    }
  }

  update(deltaSeconds: number): void {
    if (this.script === null || this.script.keyframes.length === 0) { return; }
    const points: AxisKeyframe[] = this.script.keyframes;
    if (this.timeSeconds >= this.scriptEnd || this.scriptIndex + 1 >= points.length) {
      this.scriptIndex = -1; this.timeSeconds = this.scriptStart;
    }
    this.scriptIndex = AxisKeyframes.advanceIndex(points, this.scriptIndex, this.timeSeconds);
    if (!AxisKeyframes.valid(points, this.scriptIndex) || !AxisKeyframes.valid(points, this.scriptIndex + 1)) { return; }
    const value: number = Math.max(0, Math.min(1, AxisKeyframes.interpolate(points, this.scriptIndex,
      this.timeSeconds, this.configuration.interpolationMode as InterpolationMode)));
    this.writeValue(this.map(value), this.resourceGeneration, this.script.resourceId);
    this.timeSeconds += this.configuration.speed * deltaSeconds;
  }

  private advanceResourceGeneration(): void {
    // Unsafe generation marks later evidence unknown instead of changing the
    // original resource/reset/value behavior or recycling an old identity.
    this.resourceGeneration = Number.isSafeInteger(this.resourceGeneration) &&
      this.resourceGeneration < Number.MAX_SAFE_INTEGER ? this.resourceGeneration + 1 : NaN;
  }
}
