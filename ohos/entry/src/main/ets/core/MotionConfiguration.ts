import { ConfigurationDiagnostic, DeviceProfile } from './DeviceProfile';
import type { InterpolationMode } from './Interpolation';

export type MotionProviderId = 'Random' | 'Pattern' | 'Custom Curve' | 'Looping Script';
export type MotionPattern = 'triangle' | 'sine' | 'doubleBounce' | 'sharpBounce' | 'saw' | 'square';

export class MotionCurvePoint {
  x: number;
  y: number;
  constructor(x: number = 0, y: number = 0) { this.x = x; this.y = y; }
}

/** Parameters only. Provider clocks, output caches, seed and play state are deliberately absent. */
export class MotionProviderConfiguration {
  id: MotionProviderId;
  speed: number = 1;
  minimum: number = 0;
  maximum: number = 1;
  pattern?: MotionPattern;
  octaves?: number;
  persistence?: number;
  lacunarity?: number;
  points?: MotionCurvePoint[];
  interpolationMode?: InterpolationMode;
  durationSeconds?: number;
  isLooping?: boolean;
  syncOnEnd?: boolean;
  /** A reference only, never proof of a persisted file-access grant. */
  sourceUri?: string | null;

  constructor(id: MotionProviderId) {
    this.id = id;
    if (id === 'Random') {
      this.speed = 0.3; this.octaves = 1; this.persistence = 1; this.lacunarity = 1;
    } else if (id === 'Pattern') {
      this.pattern = 'triangle';
    } else if (id === 'Custom Curve') {
      this.points = [new MotionCurvePoint()]; this.interpolationMode = 'linear';
      this.durationSeconds = 10; this.isLooping = true; this.syncOnEnd = true;
    } else if (id === 'Looping Script') {
      this.sourceUri = null; this.interpolationMode = 'pchip';
    }
  }
}

export class AxisMotionConfiguration {
  axisName: string;
  providers: MotionProviderConfiguration[];
  constructor(axisName: string, providers: MotionProviderConfiguration[] = MotionConfigurations.defaults()) {
    this.axisName = axisName;
    this.providers = providers.map(provider => MotionConfigurations.clone(provider));
  }
}

export class DeviceMotionConfiguration {
  deviceId: string;
  axes: AxisMotionConfiguration[];
  constructor(deviceId: string, axes: AxisMotionConfiguration[] = []) {
    this.deviceId = deviceId;
    this.axes = axes.map(axis => new AxisMotionConfiguration(axis.axisName, axis.providers));
  }
}

export class MotionConfigurations {
  static readonly MAX_POINTS: number = 4096;
  static ids(): MotionProviderId[] { return ['Random', 'Pattern', 'Custom Curve', 'Looping Script']; }
  static defaults(): MotionProviderConfiguration[] {
    return MotionConfigurations.ids().map(id => new MotionProviderConfiguration(id));
  }
  static defaultsForProfile(profile: DeviceProfile): DeviceMotionConfiguration {
    return new DeviceMotionConfiguration(profile.id,
      profile.axes.map(axis => new AxisMotionConfiguration(axis.name)));
  }

  /** Whitelist copy also fills missing parameters with source defaults. Invalid supplied values survive for validation. */
  static fromJson(raw: MotionProviderConfiguration): MotionProviderConfiguration {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw) ||
      MotionConfigurations.ids().indexOf(raw.id) < 0) { throw new Error('Unknown motion provider.'); }
    const result = new MotionProviderConfiguration(raw.id);
    if (raw.speed !== undefined) { result.speed = raw.speed; }
    if (raw.minimum !== undefined) { result.minimum = raw.minimum; }
    if (raw.maximum !== undefined) { result.maximum = raw.maximum; }
    if (raw.id === 'Random') {
      if (raw.octaves !== undefined) { result.octaves = raw.octaves; }
      if (raw.persistence !== undefined) { result.persistence = raw.persistence; }
      if (raw.lacunarity !== undefined) { result.lacunarity = raw.lacunarity; }
    } else if (raw.id === 'Pattern') {
      if (raw.pattern !== undefined) { result.pattern = raw.pattern; }
    } else if (raw.id === 'Custom Curve') {
      if (raw.points !== undefined) {
        if (!Array.isArray(raw.points)) { throw new Error('Motion points must be an array.'); }
        result.points = raw.points.map(point => {
          if (point === null || typeof point !== 'object' || Array.isArray(point) || typeof point.x !== 'number' || typeof point.y !== 'number') {
            throw new Error('Motion curve point must be an object.');
          }
          return new MotionCurvePoint(point.x, point.y);
        });
      }
      if (raw.interpolationMode !== undefined) { result.interpolationMode = raw.interpolationMode; }
      if (raw.durationSeconds !== undefined) { result.durationSeconds = raw.durationSeconds; }
      if (raw.isLooping !== undefined) { result.isLooping = raw.isLooping; }
      if (raw.syncOnEnd !== undefined) { result.syncOnEnd = raw.syncOnEnd; }
    } else if (raw.id === 'Looping Script') {
      if (raw.sourceUri !== undefined) { result.sourceUri = raw.sourceUri; }
      if (raw.interpolationMode !== undefined) { result.interpolationMode = raw.interpolationMode; }
    }
    const errors = MotionConfigurations.validate(result);
    if (errors.length > 0) { throw new Error(errors.map(error => error.path + ': ' + error.message).join('; ')); }
    return result;
  }

  static clone(configuration: MotionProviderConfiguration): MotionProviderConfiguration {
    return MotionConfigurations.fromJson(configuration);
  }

  static validate(value: MotionProviderConfiguration): ConfigurationDiagnostic[] {
    const errors: ConfigurationDiagnostic[] = [];
    if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      MotionConfigurations.ids().indexOf(value.id) < 0) {
      return [new ConfigurationDiagnostic('id', 'invalid_provider', 'A known motion provider is required.')];
    }
    MotionConfigurations.number(errors, 'speed', value.speed, 0.01, Number.MAX_VALUE);
    MotionConfigurations.number(errors, 'minimum', value.minimum, 0, 1);
    MotionConfigurations.number(errors, 'maximum', value.maximum, 0, 1);
    // Upstream allows reversed ranges; minimum and maximum are validated independently.
    if (value.id === 'Random') {
      // Source shortcut accepts any positive Int32; the UI's 1–8 range is not a storage limit.
      MotionConfigurations.number(errors, 'octaves', value.octaves, 1, 2147483647);
      if (!Number.isInteger(value.octaves)) { errors.push(new ConfigurationDiagnostic('octaves', 'invalid_integer', 'Octaves must be an integer.')); }
      MotionConfigurations.number(errors, 'persistence', value.persistence, 0.01, Number.MAX_VALUE);
      MotionConfigurations.number(errors, 'lacunarity', value.lacunarity, 0.1, 2);
    } else if (value.id === 'Pattern') {
      if (value.pattern === undefined || ['triangle', 'sine', 'doubleBounce', 'sharpBounce', 'saw', 'square'].indexOf(value.pattern) < 0) {
        errors.push(new ConfigurationDiagnostic('pattern', 'invalid_pattern', 'A known pattern is required.'));
      }
    } else if (value.id === 'Custom Curve') {
      MotionConfigurations.number(errors, 'durationSeconds', value.durationSeconds, Number.MIN_VALUE, Number.MAX_VALUE);
      if (typeof value.isLooping !== 'boolean' || typeof value.syncOnEnd !== 'boolean') {
        errors.push(new ConfigurationDiagnostic('isLooping/syncOnEnd', 'invalid_boolean', 'Curve switches must be booleans.'));
      }
      if (!Array.isArray(value.points) || value.points.length > MotionConfigurations.MAX_POINTS) {
        errors.push(new ConfigurationDiagnostic('points', 'invalid_points', 'At most 4096 curve points are supported.'));
      } else {
        // Preserve original order and duplicate times. The provider's KeyframeCollection
        // projection sorts and keeps the first duplicate; persistence must not rewrite the user's points.
        for (let i: number = 0; i < value.points.length; i++) {
          const point = value.points[i];
          if (point === null || typeof point !== 'object' || Array.isArray(point)) {
            errors.push(new ConfigurationDiagnostic('points[' + i + ']', 'invalid_point', 'A point object is required.')); continue;
          }
          MotionConfigurations.number(errors, 'points[' + i + '].x', point.x, -Number.MAX_VALUE, Number.MAX_VALUE);
          MotionConfigurations.number(errors, 'points[' + i + '].y', point.y, 0, 1);
        }
      }
    } else if (value.id === 'Looping Script' && value.sourceUri !== null) {
      // Resource references cannot become a vehicle for tokens, signatures, passwords or remote fetching.
      if (typeof value.sourceUri !== 'string' || value.sourceUri.length === 0 || value.sourceUri.length > 4096 ||
        /[\u0000-\u001f\u007f?#]/.test(value.sourceUri) ||
        !(/^(file|datashare):\/\//.test(value.sourceUri) || value.sourceUri.startsWith('/')) ||
        /%3[fF]|%23|%00/.test(value.sourceUri) || /:\/\/[^/]*@/.test(value.sourceUri)) {
        errors.push(new ConfigurationDiagnostic('sourceUri', 'unsafe_resource_reference', 'Use a local file reference without credentials, query or fragment.'));
      }
    }
    if (value.id === 'Custom Curve' || value.id === 'Looping Script') {
      if (value.interpolationMode === undefined || ['linear', 'pchip', 'makima', 'step'].indexOf(value.interpolationMode) < 0) {
        errors.push(new ConfigurationDiagnostic('interpolationMode', 'invalid_interpolation', 'A supported interpolation mode is required.'));
      }
    }
    return errors;
  }

  private static number(errors: ConfigurationDiagnostic[], path: string, value: number | undefined,
    minimum: number, maximum: number): void {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
      errors.push(new ConfigurationDiagnostic(path, 'invalid_number', 'A finite number in the supported range is required.'));
    }
  }
}
