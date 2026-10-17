import { MotionProviderConfiguration } from '../MotionConfiguration';
import { MotionProvider } from './MotionProvider';
import type { MotionSyncCallback } from './MotionProvider';
import { OpenSimplex } from './OpenSimplex';

/** RandomMotionProvider.cs: deterministic continuous noise after one seed draw. */
export class RandomMotion extends MotionProvider {
  /** Activation budget, NOT a persisted schema limit or silent octave clamp.
   * The session must surface this error and keep its output gate closed.
   * Source permits Int32 parameters; billions of octave evaluations cannot run
   * on the UI/tick thread. Stored larger values remain intact for user editing.
   */
  static readonly MAX_RUNTIME_OCTAVES: number = 128;
  private readonly noise: OpenSimplex;
  private timeSeconds: number = 0;

  constructor(axisName: string, configuration?: MotionProviderConfiguration,
    onSyncRequested?: MotionSyncCallback, seed?: bigint) {
    super(axisName, 'Random', configuration, onSyncRequested);
    RandomMotion.validateRuntimeConfiguration(this.configuration);
    this.noise = new OpenSimplex(seed ?? OpenSimplex.randomSeed());
  }

  static validateRuntimeConfiguration(configuration: MotionProviderConfiguration): void {
    if (configuration.id === 'Random' && (configuration.octaves as number) > RandomMotion.MAX_RUNTIME_OCTAVES) {
      throw new Error('Random motion activation refused: octaves=' + configuration.octaves +
        ' exceeds the per-update runtime budget of ' + RandomMotion.MAX_RUNTIME_OCTAVES +
        '. The stored configuration has not been clamped or changed.');
    }
  }

  configure(configuration: MotionProviderConfiguration): void {
    RandomMotion.validateRuntimeConfiguration(configuration);
    super.configure(configuration);
  }

  update(deltaSeconds: number): void {
    const value: number = this.noise.calculateOctaves2D(this.timeSeconds, this.timeSeconds,
      this.configuration.octaves as number, this.configuration.persistence as number,
      this.configuration.lacunarity as number);
    this.writeValue(this.map(value, -1, 1));
    this.timeSeconds += this.configuration.speed * deltaSeconds;
  }
}
