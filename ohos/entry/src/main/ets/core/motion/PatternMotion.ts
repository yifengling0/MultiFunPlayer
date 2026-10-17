import { MotionProviderConfiguration } from '../MotionConfiguration';
import { MotionProvider } from './MotionProvider';
import type { MotionSyncCallback } from './MotionProvider';

/** Exact PatternMotionProvider.cs Update/Calculate: sample first, then advance. */
export class PatternMotion extends MotionProvider {
  private timeSeconds: number = 0;

  constructor(axisName: string, configuration?: MotionProviderConfiguration, onSyncRequested?: MotionSyncCallback) {
    super(axisName, 'Pattern', configuration, onSyncRequested);
  }

  update(deltaSeconds: number): void {
    const t: number = Math.max(0, Math.min(1, this.timeSeconds % 4 / 4));
    let result: number = 0;
    switch (this.configuration.pattern) {
      case 'triangle': result = Math.abs(Math.abs(t * 2 - 1.5) - 1); break;
      case 'sine': result = -Math.sin(t * Math.PI * 2) / 2 + 0.5; break;
      case 'doubleBounce': {
        const x: number = t * Math.PI * 2 - Math.PI / 4;
        result = -(Math.pow(Math.sin(x), 5) + Math.pow(Math.cos(x), 5)) / 2 + 0.5;
        break;
      }
      case 'sharpBounce': {
        const x: number = (t + 0.41957) * Math.PI / 2;
        const s: number = Math.sin(x) * Math.sin(x);
        const c: number = Math.cos(x) * Math.cos(x);
        result = Math.sqrt(Math.max(c - s, s - c));
        break;
      }
      case 'saw': result = t; break;
      case 'square': result = t < 0.5 ? 1 : 0; break;
    }
    this.writeValue(this.map(result));
    this.timeSeconds += this.configuration.speed * deltaSeconds;
  }
}
