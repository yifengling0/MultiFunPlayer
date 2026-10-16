import { ConfigurationDiagnostic, DeviceAxisDefinition, DeviceProfile, DeviceProfiles } from './DeviceProfile';
import type { InterpolationMode } from './Interpolation';

/**
 * Persistent settings only. Runtime NaN values, final/script/provider values,
 * counters, phase and device connection/arming state do not belong in this model.
 * Upstream baseline: 36c08fbb99ac9398a63ff1cca1bbf68cd2228a94.
 * Evidence: Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs,
 * AxisSettings/SyncSettings (2344–2422), actions (1705–1999), plus
 * UI/Controls/Views/ScriptView.xaml and UI/Controls/DraggablePointCanvas.xaml.cs.
 * Seconds suffixes make source time units explicit; values use 0–1 except
 * SmartLimitPoint x/y, whose original percent units are retained (0–100).
 */
export type SmartLimitMode = 'value' | 'speed';

export class SmartLimitPoint {
  x: number;
  y: number;
  constructor(x: number, y: number) { this.x = x; this.y = y; }
}

/** null bounds mean no source-specified limit, not an invented UI cap. */
export class ConfigurationNumberRange {
  field: string;
  minimum: number | null;
  maximum: number | null;
  unit: string;
  allowPositiveInfinity: boolean;
  constructor(field: string, minimum: number | null, maximum: number | null,
    unit: string, allowPositiveInfinity: boolean = false) {
    this.field = field; this.minimum = minimum; this.maximum = maximum;
    this.unit = unit; this.allowPositiveInfinity = allowPositiveInfinity;
  }
}

/** Shared scalar fields; targets are replaced by the actual device defaults. */
class AxisConfigurationFields {
  linkAxisHasPriority: boolean = false;
  linkAxis: string | null = null;
  smartLimitInputAxis: string | null = null;
  smartLimitPoints: SmartLimitPoint[] = [new SmartLimitPoint(25, 100), new SmartLimitPoint(90, 0)];
  smartLimitMode: SmartLimitMode = 'value';
  smartLimitTargetValue: number = 0;
  interpolationType: InterpolationMode = 'pchip';
  autoHomeEnabled: boolean = true;
  autoHomeDelaySeconds: number = 5;
  autoHomeDurationSeconds: number = 3;
  autoHomeTargetValue: number = 0;
  autoHomeInsideScript: boolean = false;
  invertScript: boolean = false;
  offsetSeconds: number = 0;
  scriptScale: number = 1;
  lockScript: boolean = false;
  bypassScript: boolean = false;
  bypassMotionProvider: boolean = false;
  bypassTransition: boolean = false;
  motionProviderBlend: number = 0;
  motionProviderFillGaps: boolean = false;
  motionProviderMinimumGapDurationSeconds: number = 5;
  motionProviderSpeedLimitWithAxis: boolean = true;
  updateMotionProviderWhenPaused: boolean = false;
  updateMotionProviderWithoutScript: boolean = false;
  updateMotionProviderWithAxis: string | null = null;
  selectedMotionProvider: string | null = null;
  speedLimitEnabled: boolean = false;
}

/** JSON-safe DTO. Only the speed-limit field admits the literal "Infinity".
 * Use AxisConfiguration.toJson before JSON.stringify; never stringify settings
 * directly, because native JSON silently turns +Infinity into null.
 */
export class AxisConfigurationJson extends AxisConfigurationFields {
  speedLimitUnitsPerSecond: number | 'Infinity' = 10;
}

function copyFields(source: AxisConfigurationFields, target: AxisConfigurationFields): void {
  target.linkAxisHasPriority = source.linkAxisHasPriority;
  target.linkAxis = source.linkAxis;
  target.smartLimitInputAxis = source.smartLimitInputAxis;
  target.smartLimitPoints = source.smartLimitPoints.map(point => new SmartLimitPoint(point.x, point.y));
  target.smartLimitMode = source.smartLimitMode;
  target.smartLimitTargetValue = source.smartLimitTargetValue;
  target.interpolationType = source.interpolationType;
  target.autoHomeEnabled = source.autoHomeEnabled;
  target.autoHomeDelaySeconds = source.autoHomeDelaySeconds;
  target.autoHomeDurationSeconds = source.autoHomeDurationSeconds;
  target.autoHomeTargetValue = source.autoHomeTargetValue;
  target.autoHomeInsideScript = source.autoHomeInsideScript;
  target.invertScript = source.invertScript;
  target.offsetSeconds = source.offsetSeconds;
  target.scriptScale = source.scriptScale;
  target.lockScript = source.lockScript;
  target.bypassScript = source.bypassScript;
  target.bypassMotionProvider = source.bypassMotionProvider;
  target.bypassTransition = source.bypassTransition;
  target.motionProviderBlend = source.motionProviderBlend;
  target.motionProviderFillGaps = source.motionProviderFillGaps;
  target.motionProviderMinimumGapDurationSeconds = source.motionProviderMinimumGapDurationSeconds;
  target.motionProviderSpeedLimitWithAxis = source.motionProviderSpeedLimitWithAxis;
  target.updateMotionProviderWhenPaused = source.updateMotionProviderWhenPaused;
  target.updateMotionProviderWithoutScript = source.updateMotionProviderWithoutScript;
  target.updateMotionProviderWithAxis = source.updateMotionProviderWithAxis;
  target.selectedMotionProvider = source.selectedMotionProvider;
  target.speedLimitEnabled = source.speedLimitEnabled;
}

function copyPresentFields(source: AxisConfigurationJson, target: AxisConfiguration): void {
  if (Object.prototype.hasOwnProperty.call(source, 'linkAxisHasPriority')) { target.linkAxisHasPriority = source.linkAxisHasPriority; }
  if (Object.prototype.hasOwnProperty.call(source, 'linkAxis')) { target.linkAxis = source.linkAxis; }
  if (Object.prototype.hasOwnProperty.call(source, 'smartLimitInputAxis')) { target.smartLimitInputAxis = source.smartLimitInputAxis; }
  if (Object.prototype.hasOwnProperty.call(source, 'smartLimitPoints')) { target.smartLimitPoints = source.smartLimitPoints; }
  if (Object.prototype.hasOwnProperty.call(source, 'smartLimitMode')) { target.smartLimitMode = source.smartLimitMode; }
  if (Object.prototype.hasOwnProperty.call(source, 'smartLimitTargetValue')) { target.smartLimitTargetValue = source.smartLimitTargetValue; }
  if (Object.prototype.hasOwnProperty.call(source, 'interpolationType')) { target.interpolationType = source.interpolationType; }
  if (Object.prototype.hasOwnProperty.call(source, 'autoHomeEnabled')) { target.autoHomeEnabled = source.autoHomeEnabled; }
  if (Object.prototype.hasOwnProperty.call(source, 'autoHomeDelaySeconds')) { target.autoHomeDelaySeconds = source.autoHomeDelaySeconds; }
  if (Object.prototype.hasOwnProperty.call(source, 'autoHomeDurationSeconds')) { target.autoHomeDurationSeconds = source.autoHomeDurationSeconds; }
  if (Object.prototype.hasOwnProperty.call(source, 'autoHomeTargetValue')) { target.autoHomeTargetValue = source.autoHomeTargetValue; }
  if (Object.prototype.hasOwnProperty.call(source, 'autoHomeInsideScript')) { target.autoHomeInsideScript = source.autoHomeInsideScript; }
  if (Object.prototype.hasOwnProperty.call(source, 'invertScript')) { target.invertScript = source.invertScript; }
  if (Object.prototype.hasOwnProperty.call(source, 'offsetSeconds')) { target.offsetSeconds = source.offsetSeconds; }
  if (Object.prototype.hasOwnProperty.call(source, 'scriptScale')) { target.scriptScale = source.scriptScale; }
  if (Object.prototype.hasOwnProperty.call(source, 'lockScript')) { target.lockScript = source.lockScript; }
  if (Object.prototype.hasOwnProperty.call(source, 'bypassScript')) { target.bypassScript = source.bypassScript; }
  if (Object.prototype.hasOwnProperty.call(source, 'bypassMotionProvider')) { target.bypassMotionProvider = source.bypassMotionProvider; }
  if (Object.prototype.hasOwnProperty.call(source, 'bypassTransition')) { target.bypassTransition = source.bypassTransition; }
  if (Object.prototype.hasOwnProperty.call(source, 'motionProviderBlend')) { target.motionProviderBlend = source.motionProviderBlend; }
  if (Object.prototype.hasOwnProperty.call(source, 'motionProviderFillGaps')) { target.motionProviderFillGaps = source.motionProviderFillGaps; }
  if (Object.prototype.hasOwnProperty.call(source, 'motionProviderMinimumGapDurationSeconds')) { target.motionProviderMinimumGapDurationSeconds = source.motionProviderMinimumGapDurationSeconds; }
  if (Object.prototype.hasOwnProperty.call(source, 'motionProviderSpeedLimitWithAxis')) { target.motionProviderSpeedLimitWithAxis = source.motionProviderSpeedLimitWithAxis; }
  if (Object.prototype.hasOwnProperty.call(source, 'updateMotionProviderWhenPaused')) { target.updateMotionProviderWhenPaused = source.updateMotionProviderWhenPaused; }
  if (Object.prototype.hasOwnProperty.call(source, 'updateMotionProviderWithoutScript')) { target.updateMotionProviderWithoutScript = source.updateMotionProviderWithoutScript; }
  if (Object.prototype.hasOwnProperty.call(source, 'updateMotionProviderWithAxis')) { target.updateMotionProviderWithAxis = source.updateMotionProviderWithAxis; }
  if (Object.prototype.hasOwnProperty.call(source, 'selectedMotionProvider')) { target.selectedMotionProvider = source.selectedMotionProvider; }
  if (Object.prototype.hasOwnProperty.call(source, 'speedLimitEnabled')) { target.speedLimitEnabled = source.speedLimitEnabled; }
}

function rangeDiagnostic(path: string, value: number, range: ConfigurationNumberRange): ConfigurationDiagnostic | null {
  if (range.allowPositiveInfinity && value === Number.POSITIVE_INFINITY) { return null; }
  if (!Number.isFinite(value)) { return new ConfigurationDiagnostic(path, 'non_finite', 'A finite number is required.'); }
  if ((range.minimum !== null && value < range.minimum) || (range.maximum !== null && value > range.maximum)) {
    return new ConfigurationDiagnostic(path, 'out_of_range', 'Value is outside the source UI/action range.');
  }
  return null;
}

function assertValid(diagnostics: ConfigurationDiagnostic[]): void {
  const errors: ConfigurationDiagnostic[] = diagnostics.filter(diagnostic => diagnostic.severity === 'error');
  if (errors.length > 0) { throw new Error(errors.map(diagnostic => diagnostic.path + ': ' + diagnostic.message).join('; ')); }
}

export class AxisConfiguration extends AxisConfigurationFields {
  speedLimitUnitsPerSecond: number = 10;

  constructor(axis: DeviceAxisDefinition, enabledAxisNames: string[] = []) {
    super();
    if (axis === null || typeof axis !== 'object' || !Number.isFinite(axis.defaultValue) ||
      axis.defaultValue < 0 || axis.defaultValue > 1) {
      throw new Error('A device axis with a finite normalized default value is required.');
    }
    this.smartLimitTargetValue = axis.defaultValue;
    this.autoHomeTargetValue = axis.defaultValue;
    if (axis.name === 'R0' || axis.name === 'R1' || axis.name === 'R2') {
      // Source RandomMotionProvider.cs has [DisplayName("Random")].
      this.selectedMotionProvider = 'Random';
      this.updateMotionProviderWithoutScript = true;
      this.updateMotionProviderWithAxis = enabledAxisNames.indexOf('L0') >= 0 ? 'L0' : null;
    } else if (/^V[0-9]$/.test(axis.name)) {
      this.autoHomeDelaySeconds = 0;
      this.autoHomeDurationSeconds = 1;
    }
  }

  /** Persistence may retain disabled axes so toggling Enabled cannot erase their
   * settings. Runtime callers keep the default enabled-only view.
   */
  static defaultsForProfile(profile: DeviceProfile, includeDisabled: boolean = false): AxisConfigurationEntry[] {
    assertValid(DeviceProfiles.validate(profile));
    const enabled: DeviceAxisDefinition[] = DeviceProfiles.enabledAxes(profile);
    const axes: DeviceAxisDefinition[] = includeDisabled ? profile.axes : enabled;
    const names: string[] = enabled.map(axis => axis.name);
    return axes.map(axis => new AxisConfigurationEntry(axis.name, new AxisConfiguration(axis, names)));
  }

  static clone(settings: AxisConfiguration): AxisConfiguration {
    // This neutral construction is completely overwritten below; no axis is
    // inferred or registered. All persisted fields are copied explicitly.
    const clone: AxisConfiguration = new AxisConfiguration(new DeviceAxisDefinition('Z0'));
    copyFields(settings, clone);
    clone.speedLimitUnitsPerSecond = settings.speedLimitUnitsPerSecond;
    return clone;
  }

  /** Exact source UI/action bounds. No finite upper bound exists for delay,
   * home duration, gap duration, speed or offset. Point order is diagnosed,
   * never rewritten. Source speed actions allow +Infinity for 0 seconds/unit.
   */
  static numberRanges(): ConfigurationNumberRange[] {
    return [
      new ConfigurationNumberRange('smartLimitTargetValue', 0, 1, 'normalized'),
      new ConfigurationNumberRange('autoHomeDelaySeconds', 0, null, 'seconds'),
      new ConfigurationNumberRange('autoHomeDurationSeconds', 0, null, 'seconds'),
      new ConfigurationNumberRange('autoHomeTargetValue', 0, 1, 'normalized'),
      new ConfigurationNumberRange('offsetSeconds', null, null, 'seconds'),
      new ConfigurationNumberRange('scriptScale', 0.01, 4, 'factor'),
      new ConfigurationNumberRange('motionProviderBlend', 0, 1, 'factor'),
      new ConfigurationNumberRange('motionProviderMinimumGapDurationSeconds', 0, null, 'seconds'),
      new ConfigurationNumberRange('speedLimitUnitsPerSecond', 0, null, 'normalized/second', true),
      new ConfigurationNumberRange('smartLimitPoints.x', 0, 100, 'percent'),
      new ConfigurationNumberRange('smartLimitPoints.y', 0, 100, 'percent')
    ];
  }

  /** Reports errors without coercing input. Optional context validates references
   * against the selected enabled registry. Cross-axis Smart/Motion cycles are
   * valid (the pipeline reads the previous frame); Link cycles are checked by
   * validateEntries. Source loading is less strict than this diagnostic layer.
   */
  static validate(settings: AxisConfiguration, axis?: DeviceAxisDefinition,
    enabledAxisNames?: string[]): ConfigurationDiagnostic[] {
    const diagnostics: ConfigurationDiagnostic[] = [];
    if (settings === null || typeof settings !== 'object' || Array.isArray(settings)) {
      return [new ConfigurationDiagnostic('', 'invalid_object', 'An axis configuration object is required.')];
    }
    if (typeof settings.linkAxisHasPriority !== 'boolean') {
      diagnostics.push(new ConfigurationDiagnostic('linkAxisHasPriority', 'invalid_boolean', 'A boolean is required.'));
    }
    if (typeof settings.autoHomeEnabled !== 'boolean') {
      diagnostics.push(new ConfigurationDiagnostic('autoHomeEnabled', 'invalid_boolean', 'A boolean is required.'));
    }
    if (typeof settings.autoHomeInsideScript !== 'boolean') {
      diagnostics.push(new ConfigurationDiagnostic('autoHomeInsideScript', 'invalid_boolean', 'A boolean is required.'));
    }
    if (typeof settings.invertScript !== 'boolean') {
      diagnostics.push(new ConfigurationDiagnostic('invertScript', 'invalid_boolean', 'A boolean is required.'));
    }
    if (typeof settings.lockScript !== 'boolean') {
      diagnostics.push(new ConfigurationDiagnostic('lockScript', 'invalid_boolean', 'A boolean is required.'));
    }
    if (typeof settings.bypassScript !== 'boolean') {
      diagnostics.push(new ConfigurationDiagnostic('bypassScript', 'invalid_boolean', 'A boolean is required.'));
    }
    if (typeof settings.bypassMotionProvider !== 'boolean') {
      diagnostics.push(new ConfigurationDiagnostic('bypassMotionProvider', 'invalid_boolean', 'A boolean is required.'));
    }
    if (typeof settings.bypassTransition !== 'boolean') {
      diagnostics.push(new ConfigurationDiagnostic('bypassTransition', 'invalid_boolean', 'A boolean is required.'));
    }
    if (typeof settings.motionProviderFillGaps !== 'boolean') {
      diagnostics.push(new ConfigurationDiagnostic('motionProviderFillGaps', 'invalid_boolean', 'A boolean is required.'));
    }
    if (typeof settings.motionProviderSpeedLimitWithAxis !== 'boolean') {
      diagnostics.push(new ConfigurationDiagnostic('motionProviderSpeedLimitWithAxis', 'invalid_boolean', 'A boolean is required.'));
    }
    if (typeof settings.updateMotionProviderWhenPaused !== 'boolean') {
      diagnostics.push(new ConfigurationDiagnostic('updateMotionProviderWhenPaused', 'invalid_boolean', 'A boolean is required.'));
    }
    if (typeof settings.updateMotionProviderWithoutScript !== 'boolean') {
      diagnostics.push(new ConfigurationDiagnostic('updateMotionProviderWithoutScript', 'invalid_boolean', 'A boolean is required.'));
    }
    if (typeof settings.speedLimitEnabled !== 'boolean') {
      diagnostics.push(new ConfigurationDiagnostic('speedLimitEnabled', 'invalid_boolean', 'A boolean is required.'));
    }
    if (settings.interpolationType !== 'linear' && settings.interpolationType !== 'pchip' &&
      settings.interpolationType !== 'makima' && settings.interpolationType !== 'step') {
      diagnostics.push(new ConfigurationDiagnostic('interpolationType', 'invalid_enum', 'Unsupported interpolation mode.'));
    }
    if (settings.smartLimitMode !== 'value' && settings.smartLimitMode !== 'speed') {
      diagnostics.push(new ConfigurationDiagnostic('smartLimitMode', 'invalid_enum', 'Use value or speed.'));
    }
    const values: number[] = [settings.smartLimitTargetValue, settings.autoHomeDelaySeconds,
      settings.autoHomeDurationSeconds, settings.autoHomeTargetValue, settings.offsetSeconds,
      settings.scriptScale, settings.motionProviderBlend, settings.motionProviderMinimumGapDurationSeconds,
      settings.speedLimitUnitsPerSecond];
    const ranges: ConfigurationNumberRange[] = AxisConfiguration.numberRanges();
    for (let index: number = 0; index < values.length; index++) {
      const diagnostic: ConfigurationDiagnostic | null = rangeDiagnostic(ranges[index].field, values[index], ranges[index]);
      if (diagnostic !== null) { diagnostics.push(diagnostic); }
    }
    const referenceFields: string[] = ['linkAxis', 'smartLimitInputAxis', 'updateMotionProviderWithAxis'];
    const references: (string | null)[] = [settings.linkAxis, settings.smartLimitInputAxis, settings.updateMotionProviderWithAxis];
    for (let index: number = 0; index < references.length; index++) {
      const reference: string | null = references[index];
      if (reference === null) { continue; }
      if (typeof reference !== 'string' || !/^[A-Z][0-9]$/.test(reference)) {
        diagnostics.push(new ConfigurationDiagnostic(referenceFields[index], 'invalid_axis_reference', 'An axis name or null is required.'));
      } else if (axis !== undefined && reference === axis.name) {
        diagnostics.push(new ConfigurationDiagnostic(referenceFields[index], 'self_reference', 'An axis cannot refer to itself.'));
      } else if (enabledAxisNames !== undefined && enabledAxisNames.indexOf(reference) < 0) {
        diagnostics.push(new ConfigurationDiagnostic(referenceFields[index], 'unknown_axis_reference', 'The referenced axis is not enabled in this profile.'));
      }
    }
    if (settings.selectedMotionProvider !== null &&
      (typeof settings.selectedMotionProvider !== 'string' || settings.selectedMotionProvider.trim().length === 0)) {
      diagnostics.push(new ConfigurationDiagnostic('selectedMotionProvider', 'invalid_string', 'A provider name or null is required.'));
    }
    // Provider existence belongs to the provider registry, not this model. An
    // unknown non-empty name must survive roundtrip for explicit UI diagnostics.
    if (!Array.isArray(settings.smartLimitPoints)) {
      diagnostics.push(new ConfigurationDiagnostic('smartLimitPoints', 'invalid_array', 'A point array is required.'));
    } else {
      let previousX: number = Number.NEGATIVE_INFINITY;
      for (let index: number = 0; index < settings.smartLimitPoints.length; index++) {
        const point: SmartLimitPoint = settings.smartLimitPoints[index];
        const path: string = 'smartLimitPoints[' + index + ']';
        if (point === null || typeof point !== 'object' || Array.isArray(point)) {
          diagnostics.push(new ConfigurationDiagnostic(path, 'invalid_object', 'A point object is required.'));
          continue;
        }
        const xDiagnostic: ConfigurationDiagnostic | null = rangeDiagnostic(path + '.x', point.x, ranges[9]);
        const yDiagnostic: ConfigurationDiagnostic | null = rangeDiagnostic(path + '.y', point.y, ranges[10]);
        if (xDiagnostic !== null) { diagnostics.push(xDiagnostic); }
        if (yDiagnostic !== null) { diagnostics.push(yDiagnostic); }
        if (Number.isFinite(point.x)) {
          if (point.x <= previousX) {
            diagnostics.push(new ConfigurationDiagnostic(path + '.x', 'unordered_points', 'Point x values must be strictly increasing.'));
          }
          previousX = point.x;
        }
      }
    }
    return diagnostics;
  }

  static validateEntries(entries: AxisConfigurationEntry[], profile: DeviceProfile,
    includeDisabled: boolean = false): ConfigurationDiagnostic[] {
    const diagnostics: ConfigurationDiagnostic[] = DeviceProfiles.validate(profile);
    if (diagnostics.some(diagnostic => diagnostic.severity === 'error')) { return diagnostics; }
    if (!Array.isArray(entries)) {
      return [new ConfigurationDiagnostic('axes', 'invalid_array', 'An axis settings array is required.')];
    }
    const axes: DeviceAxisDefinition[] = includeDisabled ? profile.axes : DeviceProfiles.enabledAxes(profile);
    const names: string[] = axes.map(axis => axis.name);
    const seen: string[] = [];
    for (let index: number = 0; index < entries.length; index++) {
      const entry: AxisConfigurationEntry = entries[index];
      const path: string = 'axes[' + index + ']';
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
        diagnostics.push(new ConfigurationDiagnostic(path, 'invalid_object', 'An axis settings entry is required.'));
        continue;
      }
      const axis: DeviceAxisDefinition | undefined = axes.find(candidate => candidate.name === entry.axisName);
      if (axis === undefined) {
        diagnostics.push(new ConfigurationDiagnostic(path + '.axisName', 'unknown_axis_reference',
          includeDisabled ? 'The axis does not exist in this profile.' : 'The axis is not enabled in this profile.'));
      }
      if (seen.indexOf(entry.axisName) >= 0) {
        diagnostics.push(new ConfigurationDiagnostic(path + '.axisName', 'duplicate_axis_name', 'Only one configuration per axis is allowed.'));
      }
      seen.push(entry.axisName);
      for (const diagnostic of AxisConfiguration.validate(entry.settings, axis, names)) {
        diagnostics.push(new ConfigurationDiagnostic(path + '.settings' + (diagnostic.path ? '.' + diagnostic.path : ''),
          diagnostic.code, diagnostic.message, diagnostic.severity));
      }
    }
    // Check Link separately: Smart/Motion references intentionally are not a DAG.
    if (diagnostics.some(diagnostic => diagnostic.severity === 'error')) { return diagnostics; }
    for (let index: number = 0; index < entries.length; index++) {
      const visited: string[] = [entries[index].axisName];
      let target: string | null = entries[index].settings.linkAxis;
      while (target !== null) {
        if (visited.indexOf(target) >= 0) {
          diagnostics.push(new ConfigurationDiagnostic('axes[' + index + '].settings.linkAxis',
            'link_cycle', 'Linked scripts must not contain a cycle.'));
          break;
        }
        visited.push(target);
        const next: AxisConfigurationEntry | undefined = entries.find(entry => entry.axisName === target);
        target = next === undefined ? null : next.settings.linkAxis;
      }
    }
    return diagnostics;
  }

  /**
   * Source Settings/Converters/DeviceAxisConverter.cs::ReadJson resolves only
   * DeviceAxis.All, so a stored reference to a disabled axis becomes null.
   * ScriptViewModel.cs::Handle (682–689) also skips disabled axis settings.
   * OHOS preserves those stored settings for later re-enabling, and resolves a
   * separate active copy with explicit warnings instead of erasing stored data.
   */
  static resolveActive(storedEntries: AxisConfigurationEntry[], profile: DeviceProfile): AxisConfigurationResolution {
    const result: AxisConfigurationResolution = new AxisConfigurationResolution();
    result.diagnostics = AxisConfiguration.validateEntries(storedEntries, profile, true);
    if (result.diagnostics.some(diagnostic => diagnostic.severity === 'error')) { return result; }
    const axes: DeviceAxisDefinition[] = DeviceProfiles.enabledAxes(profile);
    const names: string[] = axes.map(axis => axis.name);
    for (const axis of axes) {
      const stored: AxisConfigurationEntry | undefined = storedEntries.find(entry => entry.axisName === axis.name);
      const settings: AxisConfiguration = stored === undefined ? new AxisConfiguration(axis, names) :
        AxisConfiguration.clone(stored.settings);
      const fields: string[] = ['linkAxis', 'smartLimitInputAxis', 'updateMotionProviderWithAxis'];
      const references: (string | null)[] = [settings.linkAxis, settings.smartLimitInputAxis, settings.updateMotionProviderWithAxis];
      for (let index: number = 0; index < references.length; index++) {
        const reference: string | null = references[index];
        if (reference === null || names.indexOf(reference) >= 0) { continue; }
        if (index === 0) { settings.linkAxis = null; }
        else if (index === 1) { settings.smartLimitInputAxis = null; }
        else { settings.updateMotionProviderWithAxis = null; }
        result.diagnostics.push(new ConfigurationDiagnostic('axes.' + axis.name + '.settings.' + fields[index],
          'inactive_axis_reference', 'Reference to disabled axis ' + reference + ' is inactive; the stored value is retained.', 'warning'));
      }
      result.entries.push(new AxisConfigurationEntry(axis.name, settings));
    }
    return result;
  }

  static toJson(settings: AxisConfiguration): AxisConfigurationJson {
    assertValid(AxisConfiguration.validate(settings));
    const dto: AxisConfigurationJson = new AxisConfigurationJson();
    copyFields(settings, dto);
    dto.speedLimitUnitsPerSecond = settings.speedLimitUnitsPerSecond === Number.POSITIVE_INFINITY ?
      'Infinity' : settings.speedLimitUnitsPerSecond;
    return dto;
  }

  /** Defense in depth for native JSON.stringify on a model instance. The
   * persistence boundary must still call toJson explicitly for plain objects.
   */
  toJSON(): AxisConfigurationJson {
    return AxisConfiguration.toJson(this);
  }

  /** Missing fields retain axis-specific defaults, matching upstream Populate.
   * Present invalid/null values produce errors instead of silently defaulting.
   * A whitelist prevents runtime state and prototype keys entering configuration.
   */
  static fromJson(dto: AxisConfigurationJson, axis: DeviceAxisDefinition,
    enabledAxisNames: string[] = [], referenceAxisNames: string[] = enabledAxisNames): AxisConfiguration {
    if (dto === null || typeof dto !== 'object' || Array.isArray(dto)) {
      throw new Error('An axis configuration JSON object is required.');
    }
    const allowed: string[] = Object.keys(new AxisConfigurationJson());
    for (const field of Object.keys(dto)) {
      if (allowed.indexOf(field) < 0) { throw new Error('Unknown axis configuration field: ' + field); }
    }
    const settings: AxisConfiguration = new AxisConfiguration(axis, enabledAxisNames);
    copyPresentFields(dto, settings);
    if (Object.prototype.hasOwnProperty.call(dto, 'speedLimitUnitsPerSecond')) {
      if (dto.speedLimitUnitsPerSecond === 'Infinity') {
        settings.speedLimitUnitsPerSecond = Number.POSITIVE_INFINITY;
      } else {
        // Raw non-finite numbers are not valid JSON, even though the runtime
        // settings model permits positive Infinity in this one field.
        if (!Number.isFinite(dto.speedLimitUnitsPerSecond)) { throw new Error('Invalid JSON speed limit; use the Infinity tag.'); }
        settings.speedLimitUnitsPerSecond = dto.speedLimitUnitsPerSecond;
      }
    }
    assertValid(AxisConfiguration.validate(settings, axis, referenceAxisNames));
    return AxisConfiguration.clone(settings);
  }
}

export class AxisConfigurationEntry {
  axisName: string;
  settings: AxisConfiguration;
  constructor(axisName: string, settings: AxisConfiguration) {
    this.axisName = axisName;
    this.settings = AxisConfiguration.clone(settings);
  }
}

export class AxisConfigurationResolution {
  entries: AxisConfigurationEntry[] = [];
  diagnostics: ConfigurationDiagnostic[] = [];
}

export class SyncConfiguration {
  durationSeconds: number = 4;
  syncOnMediaResourceChanged: boolean = true;
  syncOnScriptResourceChanged: boolean = true;
  syncOnScriptStart: boolean = true;
  syncOnScriptEnd: boolean = true;
  syncOnMediaPlayPause: boolean = true;
  syncOnSeek: boolean = true;
  syncOnAutoHomeStartEnd: boolean = true;

  static clone(settings: SyncConfiguration): SyncConfiguration {
    const clone: SyncConfiguration = new SyncConfiguration();
    clone.durationSeconds = settings.durationSeconds;
    clone.syncOnMediaResourceChanged = settings.syncOnMediaResourceChanged;
    clone.syncOnScriptResourceChanged = settings.syncOnScriptResourceChanged;
    clone.syncOnScriptStart = settings.syncOnScriptStart;
    clone.syncOnScriptEnd = settings.syncOnScriptEnd;
    clone.syncOnMediaPlayPause = settings.syncOnMediaPlayPause;
    clone.syncOnSeek = settings.syncOnSeek;
    clone.syncOnAutoHomeStartEnd = settings.syncOnAutoHomeStartEnd;
    return clone;
  }

  static numberRanges(): ConfigurationNumberRange[] {
    return [new ConfigurationNumberRange('durationSeconds', 0.5, 8, 'seconds')];
  }

  static validate(settings: SyncConfiguration): ConfigurationDiagnostic[] {
    if (settings === null || typeof settings !== 'object' || Array.isArray(settings)) {
      return [new ConfigurationDiagnostic('', 'invalid_object', 'A sync configuration object is required.')];
    }
    const diagnostics: ConfigurationDiagnostic[] = [];
    const durationDiagnostic: ConfigurationDiagnostic | null = rangeDiagnostic('durationSeconds', settings.durationSeconds,
      SyncConfiguration.numberRanges()[0]);
    if (durationDiagnostic !== null) { diagnostics.push(durationDiagnostic); }
    if (typeof settings.syncOnMediaResourceChanged !== 'boolean') {
      diagnostics.push(new ConfigurationDiagnostic('syncOnMediaResourceChanged', 'invalid_boolean', 'A boolean is required.'));
    }
    if (typeof settings.syncOnScriptResourceChanged !== 'boolean') {
      diagnostics.push(new ConfigurationDiagnostic('syncOnScriptResourceChanged', 'invalid_boolean', 'A boolean is required.'));
    }
    if (typeof settings.syncOnScriptStart !== 'boolean') {
      diagnostics.push(new ConfigurationDiagnostic('syncOnScriptStart', 'invalid_boolean', 'A boolean is required.'));
    }
    if (typeof settings.syncOnScriptEnd !== 'boolean') {
      diagnostics.push(new ConfigurationDiagnostic('syncOnScriptEnd', 'invalid_boolean', 'A boolean is required.'));
    }
    if (typeof settings.syncOnMediaPlayPause !== 'boolean') {
      diagnostics.push(new ConfigurationDiagnostic('syncOnMediaPlayPause', 'invalid_boolean', 'A boolean is required.'));
    }
    if (typeof settings.syncOnSeek !== 'boolean') {
      diagnostics.push(new ConfigurationDiagnostic('syncOnSeek', 'invalid_boolean', 'A boolean is required.'));
    }
    if (typeof settings.syncOnAutoHomeStartEnd !== 'boolean') {
      diagnostics.push(new ConfigurationDiagnostic('syncOnAutoHomeStartEnd', 'invalid_boolean', 'A boolean is required.'));
    }
    return diagnostics;
  }
}
