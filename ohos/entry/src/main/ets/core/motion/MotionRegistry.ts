import { AxisScriptBinding, AxisScriptResource } from '../AxisScriptStore';
import { AxisMotionConfiguration, DeviceMotionConfiguration, MotionConfigurations, MotionCurvePoint, MotionProviderConfiguration } from '../MotionConfiguration';
import type { InterpolationMode } from '../Interpolation';
import { MotionProvider, MotionProviderWriteState, MotionUpdateObservation } from './MotionProvider';
import type { MotionSyncCallback } from './MotionProvider';
import { PatternMotion } from './PatternMotion';
import { RandomMotion } from './RandomMotion';
import { CustomCurveMotion } from './CustomCurveMotion';
import { LoopingScriptMotion } from './LoopingScriptMotion';

export type MotionSeedSource = (axisName: string) => bigint;

/** MotionProvider/IMotionProviderManager.cs::MotionProviderManager.
 * Provider state is per (axis,id); output cache is per AXIS. No update means no
 * cache change, including a selected-provider change or parameter/resource edit.
 * Playing/follow-axis/dirty/gap gates belong solely to AxisPipeline.
 */
export class MotionRegistry {
  private readonly providers: Map<string, Map<string, MotionProvider>> = new Map<string, Map<string, MotionProvider>>();
  private readonly values: Map<string, number> = new Map<string, number>();
  private readonly observations: Map<string, MotionUpdateObservation> = new Map<string, MotionUpdateObservation>();

  constructor(axisNames: string[], configuration?: DeviceMotionConfiguration,
    onSyncRequested?: MotionSyncCallback, seedSource?: MotionSeedSource) {
    for (const name of axisNames) {
      if (this.providers.has(name)) { throw new Error('Duplicate motion axis: ' + name); }
      const providers: Map<string, MotionProvider> = new Map<string, MotionProvider>();
      providers.set('Pattern', new PatternMotion(name, undefined, onSyncRequested));
      providers.set('Random', new RandomMotion(name, undefined, onSyncRequested, seedSource ? seedSource(name) : undefined));
      providers.set('Custom Curve', new CustomCurveMotion(name, undefined, onSyncRequested));
      providers.set('Looping Script', new LoopingScriptMotion(name, undefined, onSyncRequested));
      this.providers.set(name, providers);
      this.values.set(name, NaN);
      this.observations.set(name, new MotionUpdateObservation(false, null, 0, 0, NaN, 'uninitialized'));
    }
    if (configuration !== undefined) { this.configure(configuration); }
  }

  getProvider(axisName: string, providerId: string): MotionProvider | undefined {
    return this.providers.get(axisName)?.get(providerId);
  }

  update(axisName: string, providerId: string, deltaSeconds: number): MotionUpdateObservation {
    const provider: MotionProvider | undefined = this.getProvider(axisName, providerId);
    if (provider === undefined) { return this.markUnknown(axisName); }
    const before: MotionProviderWriteState | null = this.readWriteState(provider);
    try { provider.update(deltaSeconds); }
    catch (error) {
      // Original manager does not copy Value when Update throws. Preserve that
      // scalar behavior, invalidate evidence, then let the pipeline latch fault.
      this.markUnknown(axisName);
      throw error as Error;
    }
    this.values.set(axisName, provider.value);
    const write: MotionProviderWriteState | null = this.readWriteState(provider);
    const previous: MotionUpdateObservation | undefined = this.observations.get(axisName);
    const previousCacheGeneration: number = previous === undefined ? 0 : previous.cacheWriteGeneration;
    const cacheGeneration: number = previousCacheGeneration < Number.MAX_SAFE_INTEGER ? previousCacheGeneration + 1 : NaN;
    if (write === null || before === null) {
      const unknown: MotionUpdateObservation = new MotionUpdateObservation(false, provider.id,
        write === null ? 0 : write.writeGeneration, cacheGeneration, provider.value, 'unknown',
        write === null ? 0 : write.configurationGeneration, write === null ? 0 : write.resourceGeneration,
        write === null ? null : write.resourceId, provider.getConfigurationGeneration());
      this.observations.set(axisName, unknown);
      return unknown;
    }
    const didWrite: boolean = write.writeGeneration > before.writeGeneration;
    const valueMatches: boolean = this.sameValue(provider.value, write.value);
    // A retained write has an unchanged snapshot. Regressing/reused counters or
    // retagged metadata are contradictory evidence, even when Value is equal.
    const continuous: boolean = didWrite ? write.writeGeneration === before.writeGeneration + 1 &&
      write.configurationGeneration >= before.configurationGeneration && write.resourceGeneration >= before.resourceGeneration :
      write.writeGeneration === before.writeGeneration && this.sameValue(write.value, before.value) &&
      write.configurationGeneration === before.configurationGeneration && write.resourceGeneration === before.resourceGeneration &&
      write.resourceId === before.resourceId && write.known === before.known;
    const known: boolean = write.known && valueMatches && continuous && Number.isSafeInteger(cacheGeneration) &&
      write.writeGeneration > 0 && write.configurationGeneration > 0 &&
      (provider.id !== 'Looping Script' || (write.resourceId !== null && write.resourceGeneration > 0));
    const observation: MotionUpdateObservation = new MotionUpdateObservation(didWrite && known, provider.id,
      write.writeGeneration, cacheGeneration, provider.value,
      known ? didWrite ? 'fresh' : 'retained' : write.writeGeneration === 0 && valueMatches && continuous &&
        Number.isSafeInteger(cacheGeneration) ? 'uninitialized' : 'unknown',
      write.configurationGeneration, write.resourceGeneration, write.resourceId, provider.getConfigurationGeneration());
    this.observations.set(axisName, observation);
    return observation;
  }

  getValue(axisName: string): number { return this.values.get(axisName) ?? NaN; }

  /** A read cannot be fresh: last Update's fresh flag is deliberately removed.
   * A selected-provider change without Update keeps the actual cached provider;
   * updating a different, stopped provider copies THAT provider's old lineage.
   */
  getObservation(axisName: string): MotionUpdateObservation {
    const previous: MotionUpdateObservation | undefined = this.observations.get(axisName);
    if (previous === undefined) { return new MotionUpdateObservation(false, null, 0, 0, this.getValue(axisName), 'unknown'); }
    const value: number = this.getValue(axisName);
    return new MotionUpdateObservation(false, previous.actualProviderId, previous.providerWriteGeneration,
      previous.cacheWriteGeneration, value, this.sameValue(value, previous.cachedValue) ?
        previous.source === 'fresh' ? 'retained' : previous.source : 'unknown',
      previous.configurationGeneration, previous.resourceGeneration, previous.resourceId,
      previous.actualProviderId === null ? 0 : this.getProvider(axisName, previous.actualProviderId)?.getConfigurationGeneration() ?? Number.NaN);
  }

  private markUnknown(axisName: string): MotionUpdateObservation {
    const previous: MotionUpdateObservation = this.getObservation(axisName);
    const observation: MotionUpdateObservation = new MotionUpdateObservation(false, previous.actualProviderId,
      previous.providerWriteGeneration, previous.cacheWriteGeneration, this.getValue(axisName), 'unknown',
      previous.configurationGeneration, previous.resourceGeneration, previous.resourceId, previous.currentConfigurationGeneration);
    if (this.providers.has(axisName)) { this.observations.set(axisName, observation); }
    return observation;
  }

  private sameValue(first: number, second: number): boolean {
    return first === second ? first !== 0 || 1 / first === 1 / second : Number.isNaN(first) && Number.isNaN(second);
  }

  private readWriteState(provider: MotionProvider): MotionProviderWriteState | null {
    try {
      const write: MotionProviderWriteState = provider.getWriteState();
      if (!(write instanceof MotionProviderWriteState) || typeof write.value !== 'number' ||
        typeof write.known !== 'boolean' || !Number.isSafeInteger(write.writeGeneration) || write.writeGeneration < 0 ||
        !Number.isSafeInteger(write.configurationGeneration) || write.configurationGeneration < 0 ||
        !Number.isSafeInteger(write.resourceGeneration) || write.resourceGeneration < 0 ||
        (write.resourceId !== null && typeof write.resourceId !== 'string')) { return null; }
      return write;
    } catch (_error) { return null; }
  }

  configure(configuration: DeviceMotionConfiguration): void {
    // Validate all parameter copies before applying any; never retain mutable DTOs.
    const axes: AxisMotionConfiguration[] = configuration.axes.map(axis => new AxisMotionConfiguration(axis.axisName, axis.providers));
    for (const axis of axes) {
      if (this.providers.has(axis.axisName)) {
        for (const parameters of axis.providers) { RandomMotion.validateRuntimeConfiguration(parameters); }
      }
    }
    for (const axis of axes) {
      for (const parameters of axis.providers) { this.getProvider(axis.axisName, parameters.id)?.configure(parameters); }
    }
  }

  configureProvider(axisName: string, configuration: MotionProviderConfiguration): void {
    const provider: MotionProvider | undefined = this.getProvider(axisName, configuration.id);
    if (provider === undefined) { throw new Error('Unknown motion axis or provider.'); }
    provider.configure(configuration);
  }

  /** Dedicated collection command, distinct from generic scalar configuration. */
  setCustomCurvePoints(axisName: string, durationSeconds: number, interpolationMode: InterpolationMode,
    points: MotionCurvePoint[], oldPointsAfterViewport?: MotionCurvePoint[]): MotionProviderConfiguration {
    const provider: MotionProvider | undefined = this.getProvider(axisName, 'Custom Curve');
    if (!(provider instanceof CustomCurveMotion)) { throw new Error('Unknown motion axis.'); }
    return provider.setPoints(durationSeconds, interpolationMode, points, oldPointsAfterViewport);
  }

  replaceCustomCurvePointsFromCanvas(axisName: string, points: MotionCurvePoint[]): MotionProviderConfiguration {
    const provider: MotionProvider | undefined = this.getProvider(axisName, 'Custom Curve');
    if (!(provider instanceof CustomCurveMotion)) { throw new Error('Unknown motion axis.'); }
    return provider.replacePointsFromCanvas(points);
  }

  configurationSnapshot(deviceId: string): DeviceMotionConfiguration {
    const axes: AxisMotionConfiguration[] = [];
    this.providers.forEach((providers: Map<string, MotionProvider>, axisName: string): void => {
      const parameters: MotionProviderConfiguration[] = [];
      for (const id of MotionConfigurations.ids()) {
        const provider: MotionProvider | undefined = providers.get(id);
        if (provider !== undefined) { parameters.push(provider.getConfiguration()); }
      }
      axes.push(new AxisMotionConfiguration(axisName, parameters));
    });
    return new DeviceMotionConfiguration(deviceId, axes);
  }

  setScriptResource(axisName: string, resource: AxisScriptResource | null): void {
    const provider: MotionProvider | undefined = this.getProvider(axisName, 'Looping Script');
    if (!(provider instanceof LoopingScriptMotion)) { throw new Error('Unknown motion axis.'); }
    provider.setScriptResource(resource);
  }

  /** Already-loaded multi-axis input: enabled L0 first, otherwise first resource. */
  setScriptResources(axisName: string, resources: AxisScriptBinding[]): void {
    let selected: AxisScriptResource | null = null;
    if (this.providers.has('L0')) {
      const stroke: AxisScriptBinding | undefined = resources.find(binding => binding.axisName === 'L0' && binding.resource !== null);
      if (stroke !== undefined) { selected = stroke.resource; }
    }
    if (selected === null) {
      const first: AxisScriptBinding | undefined = resources.find(binding => binding.resource !== null);
      if (first !== undefined) { selected = first.resource; }
    }
    this.setScriptResource(axisName, selected);
  }

  resetCustomCurve(axisName: string, requestSync: boolean = true): void {
    const provider: MotionProvider | undefined = this.getProvider(axisName, 'Custom Curve');
    if (!(provider instanceof CustomCurveMotion)) { throw new Error('Unknown motion axis.'); }
    provider.reset(requestSync);
  }
}
