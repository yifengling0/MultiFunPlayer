import { MotionConfigurations, MotionProviderConfiguration } from '../MotionConfiguration';
import type { MotionProviderId } from '../MotionConfiguration';

export type MotionSyncCallback = (axisName: string) => void;
export type MotionObservationSource = 'fresh' | 'retained' | 'uninitialized' | 'unknown';

/** Evidence for the last actual provider Value assignment, not its latest
 * Update invocation or current settings/resource. Never persisted. */
export class MotionProviderWriteState {
  readonly value: number;
  readonly writeGeneration: number;
  readonly configurationGeneration: number;
  readonly resourceGeneration: number;
  readonly resourceId: string | null;
  readonly known: boolean;
  constructor(value: number, writeGeneration: number, configurationGeneration: number,
    resourceGeneration: number, resourceId: string | null, known: boolean) {
    this.value = value; this.writeGeneration = writeGeneration;
    this.configurationGeneration = configurationGeneration;
    this.resourceGeneration = resourceGeneration; this.resourceId = resourceId; this.known = known;
    Object.freeze(this);
  }
}

/** Structurally matches AxisMotionSampleObservation without importing the
 * pipeline. This is evidence, never authorization to send a device command.
 * cacheWriteGeneration counts copies; only didWrite proves a new sample.
 * configuration/resource generations describe the LAST WRITE, not live state.
 */
export class MotionUpdateObservation {
  readonly didWrite: boolean;
  readonly actualProviderId: string | null;
  readonly providerWriteGeneration: number;
  readonly cacheWriteGeneration: number;
  readonly cachedValue: number;
  readonly source: MotionObservationSource;
  readonly configurationGeneration: number;
  readonly resourceGeneration: number;
  readonly resourceId: string | null;
  /** Live configuration at this observation; the cached write keeps its stamp. */
  readonly currentConfigurationGeneration: number;
  constructor(didWrite: boolean, actualProviderId: string | null, providerWriteGeneration: number,
    cacheWriteGeneration: number, cachedValue: number, source: MotionObservationSource,
    configurationGeneration: number = 0, resourceGeneration: number = 0, resourceId: string | null = null,
    currentConfigurationGeneration: number = configurationGeneration) {
    this.didWrite = didWrite; this.actualProviderId = actualProviderId;
    this.providerWriteGeneration = providerWriteGeneration; this.cacheWriteGeneration = cacheWriteGeneration;
    this.cachedValue = cachedValue; this.source = source; this.configurationGeneration = configurationGeneration;
    this.resourceGeneration = resourceGeneration; this.resourceId = resourceId;
    this.currentConfigurationGeneration = currentConfigurationGeneration;
    Object.freeze(this);
  }
}

/** Runtime only. The upstream AbstractMotionProvider.Value is initially zero;
 * the manager's separate per-axis cache is initially NaN. Do not conflate them.
 * Source: MotionProvider/AbstractMotionProvider.cs at baseline 36c08fbb99ac.
 */
export abstract class MotionProvider {
  readonly axisName: string;
  readonly id: MotionProviderId;
  protected outputValue: number = 0;
  protected configuration: MotionProviderConfiguration;
  private writeGeneration: number = 0;
  private configurationGeneration: number = 1;
  private provenanceValid: boolean = true;
  private lastWrite: MotionProviderWriteState = new MotionProviderWriteState(0, 0, 0, 0, null, false);
  private readonly onSyncRequested?: MotionSyncCallback;

  constructor(axisName: string, id: MotionProviderId, configuration?: MotionProviderConfiguration,
    onSyncRequested?: MotionSyncCallback) {
    this.axisName = axisName;
    this.id = id;
    this.configuration = MotionConfigurations.clone(configuration ?? new MotionProviderConfiguration(id));
    if (this.configuration.id !== id) { throw new Error('Motion provider configuration has the wrong id.'); }
    this.onSyncRequested = onSyncRequested;
  }

  getConfiguration(): MotionProviderConfiguration { return MotionConfigurations.clone(this.configuration); }
  get value(): number { return this.outputValue; }
  getWriteState(): MotionProviderWriteState { return this.lastWrite; }
  getConfigurationGeneration(): number { return this.provenanceValid ? this.configurationGeneration : Number.NaN; }

  /** Changing parameters preserves phase and cached output, as upstream property setters do. */
  configure(configuration: MotionProviderConfiguration): void {
    const next: MotionProviderConfiguration = MotionConfigurations.clone(configuration);
    if (next.id !== this.id) { throw new Error('Motion provider configuration has the wrong id.'); }
    this.applyValidatedConfiguration(next);
  }

  /** The caller validates the entire command before its first mutation.
   * A collection Reset may force refresh without changing serialized points. */
  protected applyValidatedConfiguration(next: MotionProviderConfiguration, sync: boolean = true, force: boolean = false): void {
    if (!force && JSON.stringify(this.configuration) === JSON.stringify(next)) { return; }
    const previous: MotionProviderConfiguration = this.configuration;
    this.configuration = next;
    if (this.configurationGeneration < Number.MAX_SAFE_INTEGER) { this.configurationGeneration++; }
    else { this.provenanceValid = false; }
    this.onConfigurationChanged(previous);
    if (sync) { this.requestSync(); }
  }

  protected onConfigurationChanged(_previous: MotionProviderConfiguration): void {}
  /** Call ONLY at source Value assignment sites. Equal values and NaN are real
   * writes too; early returns, Reset, resource loads and parameter edits aren't.
   * A counter exhaustion only invalidates evidence; it never alters source math.
   */
  protected writeValue(value: number, resourceGeneration: number = 0, resourceId: string | null = null): void {
    this.outputValue = value;
    if (this.writeGeneration < Number.MAX_SAFE_INTEGER) { this.writeGeneration++; }
    else { this.provenanceValid = false; }
    const known: boolean = this.provenanceValid && Number.isSafeInteger(resourceGeneration) && resourceGeneration >= 0;
    this.lastWrite = new MotionProviderWriteState(value, this.writeGeneration, this.configurationGeneration,
      resourceGeneration, resourceId, known);
  }
  protected requestSync(): void { if (this.onSyncRequested) { this.onSyncRequested(this.axisName); } }
  protected map(value: number, from: number = 0, to: number = 1): number {
    const t: number = Math.max(0, Math.min(1, (value - from) / (to - from)));
    return this.configuration.minimum + (this.configuration.maximum - this.configuration.minimum) * t;
  }

  abstract update(deltaSeconds: number): void;
}
