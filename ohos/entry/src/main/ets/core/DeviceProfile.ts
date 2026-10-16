/**
 * Configuration only; this module never formats or emits device commands.
 * Upstream baseline: 36c08fbb99ac9398a63ff1cca1bbf68cd2228a94.
 * Evidence: Source/MultiFunPlayer/Common/DeviceSettings.cs (DefaultDevices,
 * DeviceSettings.Clone and DeviceAxisSettings.Clone); Common/DeviceAxis.cs
 * (InitializeFromDevice); UI/Controls/Views/DeviceSettingsView.xaml (UI ranges).
 * id is an OHOS stable identifier; isBuiltIn corresponds to upstream IsDefault,
 * not to which profile is currently selected. The two built-in ids equal names.
 */

export type ConfigurationDiagnosticSeverity = 'error' | 'warning';

export class ConfigurationDiagnostic {
  path: string;
  code: string;
  message: string;
  severity: ConfigurationDiagnosticSeverity;

  constructor(path: string, code: string, message: string,
    severity: ConfigurationDiagnosticSeverity = 'error') {
    this.path = path;
    this.code = code;
    this.message = message;
    this.severity = severity;
  }
}

export class DeviceAxisDefinition {
  name: string;
  friendlyName: string | null;
  funscriptNames: string[];
  enabled: boolean;
  defaultValue: number;

  /** The optional defaults are DeviceAxisSettings defaults, not movement defaults. */
  constructor(name: string, friendlyName: string | null = null,
    funscriptNames: string[] = [], enabled: boolean = false, defaultValue: number = 0) {
    this.name = name;
    this.friendlyName = friendlyName;
    this.funscriptNames = funscriptNames.slice();
    this.enabled = enabled;
    this.defaultValue = defaultValue;
  }
}

export class DeviceProfile {
  id: string;
  name: string;
  isBuiltIn: boolean;
  outputPrecision: number;
  axes: DeviceAxisDefinition[];

  constructor(id: string, name: string, isBuiltIn: boolean = false,
    outputPrecision: number = 3, axes: DeviceAxisDefinition[] = []) {
    this.id = id;
    this.name = name;
    this.isBuiltIn = isBuiltIn;
    this.outputPrecision = outputPrecision;
    this.axes = axes.map(axis => DeviceProfiles.copyAxis(axis));
  }
}

export class DeviceProfiles {
  /** Source UI permits 1–10. No int32 output conversion is performed here. */
  static readonly MIN_OUTPUT_PRECISION: number = 1;
  static readonly MAX_OUTPUT_PRECISION: number = 10;

  static builtInProfiles(): DeviceProfile[] {
    return [DeviceProfiles.getBuiltIn('TCode-0.2'), DeviceProfiles.getBuiltIn('TCode-0.3')];
  }

  /** Fresh objects on every call; callers cannot alter future built-in defaults. */
  static getBuiltIn(id: string = 'TCode-0.3'): DeviceProfile {
    if (id !== 'TCode-0.2' && id !== 'TCode-0.3') {
      throw new Error('Unknown built-in device profile: ' + id);
    }
    const axes: DeviceAxisDefinition[] = [
      new DeviceAxisDefinition('L0', 'Up/Down', ['*', 'stroke', 'L0', 'up'], true, 0.5),
      new DeviceAxisDefinition('L1', 'Forward/Backward', ['surge', 'L1', 'forward'], true, 0.5),
      new DeviceAxisDefinition('L2', 'Left/Right', ['sway', 'L2', 'left'], true, 0.5),
      new DeviceAxisDefinition('R0', 'Twist', ['twist', 'R0', 'yaw'], true, 0.5),
      new DeviceAxisDefinition('R1', 'Roll', ['roll', 'R1'], true, 0.5),
      new DeviceAxisDefinition('R2', 'Pitch', ['pitch', 'R2'], true, 0.5),
      new DeviceAxisDefinition('V0', 'Vibrate', ['vib', 'V0'], false, 0)
    ];
    if (id === 'TCode-0.2') {
      axes.push(new DeviceAxisDefinition('V1', 'Pump', ['pump', 'lube', 'V1'], false, 0));
      axes.push(new DeviceAxisDefinition('L3', 'Suction', ['suck', 'valve', 'L3'], false, 0));
    } else {
      axes.push(new DeviceAxisDefinition('V1', 'Pump', ['pump', 'V1'], false, 0));
      axes.push(new DeviceAxisDefinition('A0', 'Valve', ['valve', 'A0'], false, 0));
      axes.push(new DeviceAxisDefinition('A1', 'Suction', ['suck', 'A1'], false, 0));
      axes.push(new DeviceAxisDefinition('A2', 'Lube', ['lube', 'A2'], false, 0));
    }
    return new DeviceProfile(id, id, true, id === 'TCode-0.2' ? 3 : 4, axes);
  }

  static copyAxis(axis: DeviceAxisDefinition): DeviceAxisDefinition {
    return new DeviceAxisDefinition(axis.name, axis.friendlyName, axis.funscriptNames,
      axis.enabled, axis.defaultValue);
  }

  /** An identity-preserving snapshot, distinct from creating a custom clone. */
  static copy(profile: DeviceProfile): DeviceProfile {
    return new DeviceProfile(profile.id, profile.name, profile.isBuiltIn,
      profile.outputPrecision, profile.axes);
  }

  /** Upstream Clone resets IsDefault; the caller supplies a new stable OHOS id. */
  static clone(profile: DeviceProfile, id: string, name: string): DeviceProfile {
    const cloned: DeviceProfile = new DeviceProfile(id, name, false,
      profile.outputPrecision, profile.axes);
    const diagnostics: ConfigurationDiagnostic[] = DeviceProfiles.validate(cloned);
    if (diagnostics.some(diagnostic => diagnostic.severity === 'error')) {
      throw new Error(diagnostics.map(diagnostic => diagnostic.path + ': ' + diagnostic.message).join('; '));
    }
    return cloned;
  }

  /**
   * DeviceAxis.InitializeFromDevice filters enabled valid names and keeps the
   * first occurrence. It does not uppercase invalid names or enable extra axes.
   * Inspect validate() separately before adopting an edited/imported profile.
   */
  static enabledAxes(profile: DeviceProfile): DeviceAxisDefinition[] {
    const result: DeviceAxisDefinition[] = [];
    for (const axis of profile.axes) {
      if (axis.enabled !== true || typeof axis.name !== 'string' || !/^[A-Z][0-9]$/.test(axis.name)) { continue; }
      if (result.some(previous => previous.name.toLowerCase() === axis.name.toLowerCase())) { continue; }
      result.push(DeviceProfiles.copyAxis(axis));
    }
    return result;
  }

  /**
   * Source loading does not validate every property. OHOS reports malformed
   * persisted data rather than silently coercing, clamping or dropping it.
   * Alias overlap is allowed: upstream can deliberately match several axes.
   */
  static validate(profile: DeviceProfile): ConfigurationDiagnostic[] {
    const diagnostics: ConfigurationDiagnostic[] = [];
    if (profile === null || typeof profile !== 'object' || Array.isArray(profile)) {
      return [new ConfigurationDiagnostic('', 'invalid_object', 'A device profile object is required.')];
    }
    for (const field of ['id', 'name']) {
      const value: string = field === 'id' ? profile.id : profile.name;
      if (typeof value !== 'string' || value.trim().length === 0) {
        diagnostics.push(new ConfigurationDiagnostic(field, 'invalid_string', 'A non-empty string is required.'));
      }
    }
    if (typeof profile.isBuiltIn !== 'boolean') {
      diagnostics.push(new ConfigurationDiagnostic('isBuiltIn', 'invalid_boolean', 'A boolean is required.'));
    }
    if (!Number.isInteger(profile.outputPrecision) || profile.outputPrecision < 1 || profile.outputPrecision > 10) {
      diagnostics.push(new ConfigurationDiagnostic('outputPrecision', 'invalid_precision', 'Output precision must be an integer from 1 to 10.'));
    }
    if (!Array.isArray(profile.axes)) {
      diagnostics.push(new ConfigurationDiagnostic('axes', 'invalid_array', 'An axis array is required.'));
      return diagnostics;
    }
    const names: string[] = [];
    for (let index: number = 0; index < profile.axes.length; index++) {
      const axis: DeviceAxisDefinition = profile.axes[index];
      const path: string = 'axes[' + index + ']';
      if (axis === null || typeof axis !== 'object' || Array.isArray(axis)) {
        diagnostics.push(new ConfigurationDiagnostic(path, 'invalid_object', 'An axis object is required.'));
        continue;
      }
      if (typeof axis.name !== 'string' || !/^[A-Z][0-9]$/.test(axis.name)) {
        diagnostics.push(new ConfigurationDiagnostic(path + '.name', 'invalid_axis_name', 'Use one uppercase ASCII letter followed by one digit.'));
      }
      if (typeof axis.name === 'string') {
        const canonical: string = axis.name.toLowerCase();
        if (names.indexOf(canonical) >= 0) {
          diagnostics.push(new ConfigurationDiagnostic(path + '.name', 'duplicate_axis_name', 'Axis names must be unique ignoring case.'));
        }
        names.push(canonical);
      }
      if (axis.friendlyName !== null && typeof axis.friendlyName !== 'string') {
        diagnostics.push(new ConfigurationDiagnostic(path + '.friendlyName', 'invalid_string', 'A string or null is required.'));
      }
      if (typeof axis.enabled !== 'boolean') {
        diagnostics.push(new ConfigurationDiagnostic(path + '.enabled', 'invalid_boolean', 'A boolean is required.'));
      }
      if (!Number.isFinite(axis.defaultValue) || axis.defaultValue < 0 || axis.defaultValue > 1) {
        diagnostics.push(new ConfigurationDiagnostic(path + '.defaultValue', 'out_of_range', 'Default value must be finite and between 0 and 1.'));
      }
      if (!Array.isArray(axis.funscriptNames)) {
        diagnostics.push(new ConfigurationDiagnostic(path + '.funscriptNames', 'invalid_array', 'An alias array is required.'));
      } else {
        for (let aliasIndex: number = 0; aliasIndex < axis.funscriptNames.length; aliasIndex++) {
          const alias: string = axis.funscriptNames[aliasIndex];
          if (typeof alias !== 'string' || alias.trim().length === 0) {
            diagnostics.push(new ConfigurationDiagnostic(path + '.funscriptNames[' + aliasIndex + ']',
              'invalid_string', 'An alias must be a non-empty string.'));
          }
        }
      }
    }
    return diagnostics;
  }
}
