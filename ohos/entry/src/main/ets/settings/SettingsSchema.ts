import { ConfigurationDiagnostic, DeviceAxisDefinition, DeviceProfile, DeviceProfiles } from '../core/DeviceProfile';
import { AxisConfiguration, AxisConfigurationEntry, AxisConfigurationJson, SyncConfiguration } from '../core/AxisConfiguration';
import { AxisMotionConfiguration, DeviceMotionConfiguration, MotionConfigurations, MotionProviderConfiguration } from '../core/MotionConfiguration';
import { OutputConfiguration } from './OutputConfiguration';
import { GeneralConfiguration } from './GeneralConfiguration';
import { MediaSourceConfiguration } from './MediaSourceConfiguration';
import { KeyboardShortcutConfiguration } from '../input/ShortcutConfiguration';

export class DeviceAxisConfiguration {
  deviceId: string;
  axes: AxisConfigurationEntry[];
  constructor(deviceId: string, axes: AxisConfigurationEntry[] = []) {
    this.deviceId = deviceId;
    this.axes = axes.map(axis => new AxisConfigurationEntry(axis.axisName, AxisConfiguration.clone(axis.settings)));
  }
}

/** Playback preferences only. Associations are case-sensitive relative paths in a
 * freshly authorized Download catalog, never URIs, grants, or openable paths.
 * internalAutoConnect concerns only the internal script clock source; restoring
 * it MUST NOT connect a device/network output or arm/resume physical playback.
 * A/B bounds, current item, position, playing and connections are session-only. */
export class PlaybackConfiguration {
  static readonly MAX_ASSOCIATIONS: number = 256;
  static readonly MAX_ASSOCIATION_LENGTH: number = 4096;
  static readonly MIN_AUTO_SKIP_OFFSET_SECONDS: number = -86400;
  playlistAssociations: string[] | null = null;
  internalLooping: boolean = false;
  internalShuffling: boolean = false;
  internalAutoConnect: boolean = false;
  loadAdditionalScripts: boolean = false;
  autoSkipEnabled: boolean = true;
  autoSkipOffsetSeconds: number = -5;

  static validate(value: PlaybackConfiguration): ConfigurationDiagnostic[] {
    const diagnostics: ConfigurationDiagnostic[] = [];
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return [new ConfigurationDiagnostic('playback', 'invalid_playback', 'Playback must be an object.')];
    }
    if (value.playlistAssociations !== null) {
      if (!Array.isArray(value.playlistAssociations) || value.playlistAssociations.length > PlaybackConfiguration.MAX_ASSOCIATIONS) {
        diagnostics.push(new ConfigurationDiagnostic('playback.playlistAssociations', 'invalid_associations', 'Playlist must be null or an array of at most 256 associations.'));
      } else {
        for (const id of value.playlistAssociations) {
          if (typeof id !== 'string' || id.length === 0 || id.length > PlaybackConfiguration.MAX_ASSOCIATION_LENGTH ||
            /[\x00-\x1f\x7f-\x9f\\:]/.test(id) || id.split('/').some(part => part === '' || part === '.' || part === '..')) {
            diagnostics.push(new ConfigurationDiagnostic('playback.playlistAssociations', 'invalid_association', 'Associations must be bounded relative catalog identities, never absolute paths or URIs.'));
            break;
          }
        }
      }
    }
    if (typeof value.internalLooping !== 'boolean' || typeof value.internalShuffling !== 'boolean' ||
      typeof value.internalAutoConnect !== 'boolean' || typeof value.loadAdditionalScripts !== 'boolean' ||
      typeof value.autoSkipEnabled !== 'boolean') {
      diagnostics.push(new ConfigurationDiagnostic('playback', 'invalid_boolean', 'Playback switches must be boolean.'));
    }
    if (typeof value.autoSkipOffsetSeconds !== 'number' || !Number.isFinite(value.autoSkipOffsetSeconds)) {
      diagnostics.push(new ConfigurationDiagnostic('playback.autoSkipOffsetSeconds', 'invalid_offset', 'Auto-skip offset must be finite; original shortcut actions permit either sign.'));
    }
    return diagnostics;
  }

  /** Defensive, whitelisted copy. Upstream restores shuffle first, then loop. */
  static clone(value: PlaybackConfiguration): PlaybackConfiguration {
    const errors = PlaybackConfiguration.validate(value);
    if (errors.length > 0) { throw new Error(errors.map(error => error.message).join('; ')); }
    const result = new PlaybackConfiguration();
    result.playlistAssociations = value.playlistAssociations === null ? null : value.playlistAssociations.slice();
    result.internalLooping = value.internalLooping;
    result.internalShuffling = value.internalShuffling && !value.internalLooping;
    result.internalAutoConnect = value.internalAutoConnect;
    result.loadAdditionalScripts = value.loadAdditionalScripts;
    result.autoSkipEnabled = value.autoSkipEnabled;
    result.autoSkipOffsetSeconds = value.autoSkipOffsetSeconds;
    return result;
  }
}

export class AppConfiguration {
  schemaVersion: number = 1;
  playback: PlaybackConfiguration = new PlaybackConfiguration();
  outputs: OutputConfiguration = new OutputConfiguration();
  keyboard: KeyboardShortcutConfiguration = new KeyboardShortcutConfiguration();
  general: GeneralConfiguration = new GeneralConfiguration();
  mediaSources: MediaSourceConfiguration = new MediaSourceConfiguration();
  selectedDeviceId: string = 'TCode-0.3';
  devices: DeviceProfile[];
  axisSettingsByDevice: DeviceAxisConfiguration[];
  sync: SyncConfiguration = new SyncConfiguration();
  globalOffsetSeconds: number = 0;
  motionSettingsByDevice: DeviceMotionConfiguration[];
  constructor() {
    this.devices = DeviceProfiles.builtInProfiles();
    this.axisSettingsByDevice = this.devices.map(profile =>
      new DeviceAxisConfiguration(profile.id, AxisConfiguration.defaultsForProfile(profile, true)));
    this.motionSettingsByDevice = this.devices.map(profile => MotionConfigurations.defaultsForProfile(profile));
  }
}

class JsonAxisEntry {
  axisName: string;
  settings: AxisConfigurationJson;
  constructor(axisName: string, settings: AxisConfigurationJson) { this.axisName = axisName; this.settings = settings; }
}
class JsonDeviceAxes {
  deviceId: string;
  axes: JsonAxisEntry[];
  constructor(deviceId: string, axes: JsonAxisEntry[]) { this.deviceId = deviceId; this.axes = axes; }
}
class JsonAppConfiguration {
  schemaVersion: number = 1;
  playback: PlaybackConfiguration = new PlaybackConfiguration();
  outputs: OutputConfiguration = new OutputConfiguration();
  keyboard: KeyboardShortcutConfiguration = new KeyboardShortcutConfiguration();
  general: GeneralConfiguration = new GeneralConfiguration();
  mediaSources: MediaSourceConfiguration = new MediaSourceConfiguration();
  selectedDeviceId: string = 'TCode-0.3';
  devices: DeviceProfile[] = [];
  axisSettingsByDevice: JsonDeviceAxes[] = [];
  sync: SyncConfiguration = new SyncConfiguration();
  globalOffsetSeconds: number = 0;
  motionSettingsByDevice: DeviceMotionConfiguration[] = [];
}

export type SettingsDecodeStatus = 'valid' | 'invalid' | 'unsupported';
export class SettingsDecodeResult {
  status: SettingsDecodeStatus;
  configuration: AppConfiguration | null;
  diagnostics: ConfigurationDiagnostic[];
  constructor(status: SettingsDecodeStatus, configuration: AppConfiguration | null,
    diagnostics: ConfigurationDiagnostic[]) {
    this.status = status; this.configuration = configuration; this.diagnostics = diagnostics;
  }
}

/** Versioned, bounded and whitelisted. No WPF $type deserialization or runtime session data. */
export class SettingsSchema {
  static readonly VERSION: number = 1;
  static readonly MAX_JSON_LENGTH: number = 1024 * 1024;
  static readonly MAX_DEVICES: number = 32;
  static readonly MAX_AXES: number = 32;

  static defaults(): AppConfiguration { return new AppConfiguration(); }

  static decode(json: string): SettingsDecodeResult {
    const diagnostics: ConfigurationDiagnostic[] = [];
    try {
      if (typeof json !== 'string' || json.length > SettingsSchema.MAX_JSON_LENGTH) {
        throw new Error('Configuration exceeds the 1 MiB text limit.');
      }
      const raw = JSON.parse(json) as JsonAppConfiguration;
      SettingsSchema.object(raw, 'configuration');
      // A newer schema is never migrated, recovered over, or written by this application.
      if (raw.schemaVersion !== undefined && raw.schemaVersion !== SettingsSchema.VERSION) {
        return new SettingsDecodeResult('unsupported', null,
          [new ConfigurationDiagnostic('schemaVersion', 'unsupported_schema', 'This configuration version is not supported; the original file must be preserved.')]);
      }
      SettingsSchema.guard(raw, 0);
      const result = new AppConfiguration();
      SettingsSchema.missing(raw, new JsonAppConfiguration(), '', diagnostics);
      if (raw.devices !== undefined) { result.devices = SettingsSchema.devices(raw.devices, diagnostics); }
      if (raw.selectedDeviceId !== undefined) {
        if (typeof raw.selectedDeviceId !== 'string' || !result.devices.some(profile => profile.id === raw.selectedDeviceId)) {
          throw new Error('selectedDeviceId must refer to a configured device.');
        }
        result.selectedDeviceId = raw.selectedDeviceId;
      }
      if (raw.globalOffsetSeconds !== undefined) {
        if (!Number.isFinite(raw.globalOffsetSeconds)) { throw new Error('globalOffsetSeconds must be finite.'); }
        result.globalOffsetSeconds = raw.globalOffsetSeconds;
      }
      result.playback = SettingsSchema.playback(raw.playback, diagnostics);
      result.outputs = OutputConfiguration.fromJson(raw.outputs);
      result.keyboard = KeyboardShortcutConfiguration.fromJson(raw.keyboard);
      result.general = GeneralConfiguration.fromJson(raw.general);
      result.mediaSources = MediaSourceConfiguration.fromJson(raw.mediaSources);
      result.sync = SettingsSchema.sync(raw.sync, diagnostics);
      result.axisSettingsByDevice = SettingsSchema.axisSettings(raw.axisSettingsByDevice, result.devices, diagnostics);
      result.motionSettingsByDevice = SettingsSchema.motionSettings(raw.motionSettingsByDevice, result.devices, diagnostics);
      // A small partial input can expand substantially when every axis/provider receives defaults.
      // A valid decoded snapshot must always remain encodable and cloneable within the same bound.
      if (JSON.stringify(SettingsSchema.toJson(result)).length > SettingsSchema.MAX_JSON_LENGTH) {
        throw new Error('Configuration defaults expand beyond the 1 MiB text limit.');
      }
      return new SettingsDecodeResult('valid', result, diagnostics);
    } catch (error) {
      diagnostics.push(new ConfigurationDiagnostic('', 'invalid_configuration', (error as Error).message));
      return new SettingsDecodeResult('invalid', null, diagnostics);
    }
  }

  static encode(configuration: AppConfiguration): string {
    // toJson performs numeric validation before JSON.stringify can turn nonfinite numbers into null.
    const json = JSON.stringify(SettingsSchema.toJson(configuration));
    const checked = SettingsSchema.decode(json);
    if (checked.status !== 'valid' || checked.configuration === null) {
      throw new Error(checked.diagnostics.map(diagnostic => diagnostic.message).join('; '));
    }
    return JSON.stringify(SettingsSchema.toJson(checked.configuration));
  }

  static clone(configuration: AppConfiguration): AppConfiguration {
    const decoded = SettingsSchema.decode(SettingsSchema.encode(configuration));
    if (decoded.configuration === null) { throw new Error('Cannot clone invalid configuration.'); }
    return decoded.configuration;
  }

  private static toJson(configuration: AppConfiguration): JsonAppConfiguration {
    SettingsSchema.object(configuration, 'configuration');
    if (configuration.schemaVersion !== 1) { throw new Error('Unsupported configuration version; refusing to overwrite.'); }
    SettingsSchema.array(configuration.devices, SettingsSchema.MAX_DEVICES, 'devices');
    SettingsSchema.array(configuration.axisSettingsByDevice, SettingsSchema.MAX_DEVICES, 'axisSettingsByDevice');
    SettingsSchema.array(configuration.motionSettingsByDevice, SettingsSchema.MAX_DEVICES, 'motionSettingsByDevice');
    if (!Number.isFinite(configuration.globalOffsetSeconds)) { throw new Error('globalOffsetSeconds must be finite.'); }
    const result = new JsonAppConfiguration();
    result.playback = PlaybackConfiguration.clone(configuration.playback);
    result.outputs = OutputConfiguration.clone(configuration.outputs);
    result.keyboard = KeyboardShortcutConfiguration.clone(configuration.keyboard);
    result.general = GeneralConfiguration.clone(configuration.general);
    result.mediaSources = MediaSourceConfiguration.clone(configuration.mediaSources);
    result.selectedDeviceId = configuration.selectedDeviceId;
    result.globalOffsetSeconds = configuration.globalOffsetSeconds;
    result.devices = configuration.devices.map(profile => {
      SettingsSchema.errors(DeviceProfiles.validate(profile)); return DeviceProfiles.copy(profile);
    });
    SettingsSchema.errors(SyncConfiguration.validate(configuration.sync));
    result.sync = SyncConfiguration.clone(configuration.sync);
    result.axisSettingsByDevice = configuration.axisSettingsByDevice.map(device => {
      SettingsSchema.object(device, 'axis device');
      SettingsSchema.array(device.axes, SettingsSchema.MAX_AXES, 'device.axes');
      return new JsonDeviceAxes(device.deviceId, device.axes.map(axis => {
        SettingsSchema.object(axis, 'axis entry');
        return new JsonAxisEntry(axis.axisName, AxisConfiguration.toJson(axis.settings));
      }));
    });
    result.motionSettingsByDevice = configuration.motionSettingsByDevice.map(device => {
      SettingsSchema.object(device, 'motion device');
      SettingsSchema.array(device.axes, SettingsSchema.MAX_AXES, 'motion axes');
      return new DeviceMotionConfiguration(device.deviceId, device.axes.map(axis => {
        SettingsSchema.object(axis, 'motion axis');
        SettingsSchema.array(axis.providers, 4, 'providers');
        return new AxisMotionConfiguration(axis.axisName, axis.providers.map(provider => MotionConfigurations.clone(provider)));
      }));
    });
    return result;
  }

  private static playback(raw: PlaybackConfiguration | undefined,
    diagnostics: ConfigurationDiagnostic[]): PlaybackConfiguration {
    const result = new PlaybackConfiguration();
    if (raw === undefined) { return result; }
    SettingsSchema.object(raw, 'playback'); SettingsSchema.missing(raw, result, 'playback', diagnostics);
    if (raw.playlistAssociations !== undefined) { result.playlistAssociations = raw.playlistAssociations; }
    if (raw.internalLooping !== undefined) { result.internalLooping = raw.internalLooping; }
    if (raw.internalShuffling !== undefined) { result.internalShuffling = raw.internalShuffling; }
    if (raw.internalAutoConnect !== undefined) { result.internalAutoConnect = raw.internalAutoConnect; }
    if (raw.loadAdditionalScripts !== undefined) { result.loadAdditionalScripts = raw.loadAdditionalScripts; }
    if (raw.autoSkipEnabled !== undefined) { result.autoSkipEnabled = raw.autoSkipEnabled; }
    if (raw.autoSkipOffsetSeconds !== undefined) { result.autoSkipOffsetSeconds = raw.autoSkipOffsetSeconds; }
    SettingsSchema.errors(PlaybackConfiguration.validate(result));
    if (result.internalLooping && result.internalShuffling) {
      SettingsSchema.warning(diagnostics, 'playback.internalShuffling', 'loop_precedes_shuffle', 'Looping takes precedence over shuffle, matching upstream restore order.');
    }
    return PlaybackConfiguration.clone(result);
  }

  private static devices(raw: DeviceProfile[], diagnostics: ConfigurationDiagnostic[]): DeviceProfile[] {
    SettingsSchema.array(raw, SettingsSchema.MAX_DEVICES, 'devices');
    const result: DeviceProfile[] = [];
    for (const device of raw) {
      SettingsSchema.object(device, 'device');
      if (typeof device.id !== 'string' || device.id.length === 0 || device.id.length > 256 ||
        result.some(existing => existing.id === device.id)) { throw new Error('Device identifiers must be unique nonempty strings.'); }
      if (device.id === 'TCode-0.2' || device.id === 'TCode-0.3') {
        const canonical = DeviceProfiles.getBuiltIn(device.id);
        if (device.axes !== undefined) {
          SettingsSchema.array(device.axes, SettingsSchema.MAX_AXES, 'builtin.axes');
          const seen: string[] = [];
          for (const axis of device.axes) {
            SettingsSchema.object(axis, 'builtin axis');
            if (seen.indexOf(axis.name) >= 0) { throw new Error('Duplicate built-in axis override.'); }
            seen.push(axis.name);
            const target = canonical.axes.find(defined => defined.name === axis.name);
            if (target !== undefined && axis.enabled !== undefined) {
              if (typeof axis.enabled !== 'boolean') { throw new Error('Axis enabled must be boolean.'); }
              target.enabled = axis.enabled;
            }
          }
        }
        if (JSON.stringify(device) !== JSON.stringify(canonical)) {
          SettingsSchema.warning(diagnostics, 'devices.' + device.id, 'builtin_rebuilt', 'Built-in definitions were rebuilt; only enabled flags were restored.');
        }
        result.push(canonical);
      } else {
        if (device.isBuiltIn !== undefined && typeof device.isBuiltIn !== 'boolean') {
          throw new Error('Custom device isBuiltIn must be boolean.');
        }
        if (device.isBuiltIn === true) { throw new Error('Unknown built-in device id.'); }
        const complete = new DeviceProfile(device.id, device.name === undefined ? device.id : device.name,
          false, device.outputPrecision === undefined ? 3 : device.outputPrecision, []);
        SettingsSchema.missing(device, complete, 'devices.' + device.id, diagnostics);
        if (device.axes !== undefined) {
          SettingsSchema.array(device.axes, SettingsSchema.MAX_AXES, 'custom.axes');
          complete.axes = device.axes.map(axis => {
            SettingsSchema.object(axis, 'custom axis');
            const defaults = new DeviceAxisDefinition(axis.name);
            SettingsSchema.missing(axis, defaults, 'devices.' + device.id + '.' + axis.name, diagnostics);
            return new DeviceAxisDefinition(axis.name,
              axis.friendlyName === undefined ? null : axis.friendlyName,
              axis.funscriptNames === undefined ? [] : axis.funscriptNames,
              axis.enabled === undefined ? false : axis.enabled,
              axis.defaultValue === undefined ? 0 : axis.defaultValue);
          });
        }
        SettingsSchema.errors(DeviceProfiles.validate(complete)); result.push(complete);
      }
    }
    for (const canonical of DeviceProfiles.builtInProfiles()) {
      if (!result.some(device => device.id === canonical.id)) {
        result.push(canonical);
        SettingsSchema.warning(diagnostics, 'devices.' + canonical.id, 'default_added', 'Missing built-in device restored.');
      }
    }
    if (result.length > SettingsSchema.MAX_DEVICES) { throw new Error('Too many devices including built-in defaults.'); }
    return result;
  }

  private static sync(raw: SyncConfiguration | undefined, diagnostics: ConfigurationDiagnostic[]): SyncConfiguration {
    const result = new SyncConfiguration();
    if (raw === undefined) { return result; }
    SettingsSchema.object(raw, 'sync'); SettingsSchema.missing(raw, result, 'sync', diagnostics);
    if (raw.durationSeconds !== undefined) { result.durationSeconds = raw.durationSeconds; }
    if (raw.syncOnMediaResourceChanged !== undefined) { result.syncOnMediaResourceChanged = raw.syncOnMediaResourceChanged; }
    if (raw.syncOnScriptResourceChanged !== undefined) { result.syncOnScriptResourceChanged = raw.syncOnScriptResourceChanged; }
    if (raw.syncOnScriptStart !== undefined) { result.syncOnScriptStart = raw.syncOnScriptStart; }
    if (raw.syncOnScriptEnd !== undefined) { result.syncOnScriptEnd = raw.syncOnScriptEnd; }
    if (raw.syncOnMediaPlayPause !== undefined) { result.syncOnMediaPlayPause = raw.syncOnMediaPlayPause; }
    if (raw.syncOnSeek !== undefined) { result.syncOnSeek = raw.syncOnSeek; }
    if (raw.syncOnAutoHomeStartEnd !== undefined) { result.syncOnAutoHomeStartEnd = raw.syncOnAutoHomeStartEnd; }
    SettingsSchema.errors(SyncConfiguration.validate(result)); return result;
  }

  private static axisSettings(raw: JsonDeviceAxes[] | undefined, devices: DeviceProfile[],
    diagnostics: ConfigurationDiagnostic[]): DeviceAxisConfiguration[] {
    if (raw !== undefined) { SettingsSchema.validateDeviceEntries(raw, devices, diagnostics); }
    const result: DeviceAxisConfiguration[] = [];
    for (const device of devices) {
      const supplied = raw === undefined ? undefined : raw.find(entry => entry.deviceId === device.id);
      const entries: AxisConfigurationEntry[] = [];
      const enabled = DeviceProfiles.enabledAxes(device).map(axis => axis.name);
      for (const axis of device.axes) {
        const entry = supplied === undefined ? undefined : supplied.axes.find(value => value.axisName === axis.name);
        const defaults = new AxisConfiguration(axis, enabled);
        const path = 'axisSettingsByDevice.' + device.id + '.' + axis.name;
        if (entry === undefined) {
          entries.push(new AxisConfigurationEntry(axis.name, defaults));
          if (raw !== undefined) { SettingsSchema.warning(diagnostics, path, 'default_added', 'Missing axis settings restored.'); }
        } else {
          SettingsSchema.object(entry.settings, path);
          SettingsSchema.missing(entry.settings, AxisConfiguration.toJson(defaults), path, diagnostics);
          entries.push(new AxisConfigurationEntry(axis.name, AxisConfiguration.fromJson(entry.settings, axis, enabled, device.axes.map(value => value.name))));
        }
      }
      SettingsSchema.errors(AxisConfiguration.validateEntries(entries, device, true));
      result.push(new DeviceAxisConfiguration(device.id, entries));
    }
    return result;
  }

  private static motionSettings(raw: DeviceMotionConfiguration[] | undefined, devices: DeviceProfile[],
    diagnostics: ConfigurationDiagnostic[]): DeviceMotionConfiguration[] {
    if (raw !== undefined) { SettingsSchema.validateMotionEntries(raw, devices, diagnostics); }
    return devices.map(device => {
      const supplied = raw === undefined ? undefined : raw.find(entry => entry.deviceId === device.id);
      const axes = device.axes.map(axis => {
        const entry = supplied === undefined ? undefined : supplied.axes.find(value => value.axisName === axis.name);
        const path = 'motionSettingsByDevice.' + device.id + '.' + axis.name;
        if (entry === undefined) {
          if (raw !== undefined) { SettingsSchema.warning(diagnostics, path, 'default_added', 'Missing motion settings restored.'); }
          return new AxisMotionConfiguration(axis.name);
        }
        SettingsSchema.array(entry.providers, 4, path + '.providers');
        const ids: string[] = [];
        for (const provider of entry.providers) {
          SettingsSchema.object(provider, path);
          if (ids.indexOf(provider.id) >= 0 || MotionConfigurations.ids().indexOf(provider.id) < 0) {
            throw new Error('Duplicate or unknown motion provider.');
          }
          ids.push(provider.id);
        }
        const providers = MotionConfigurations.ids().map(id => {
          const provider = entry.providers.find(value => value.id === id);
          if (provider === undefined) {
            SettingsSchema.warning(diagnostics, path + '.' + id, 'default_added', 'Missing provider restored.');
            return new MotionProviderConfiguration(id);
          }
          SettingsSchema.missing(provider, new MotionProviderConfiguration(id), path + '.' + id, diagnostics);
          return MotionConfigurations.fromJson(provider);
        });
        return new AxisMotionConfiguration(axis.name, providers);
      });
      return new DeviceMotionConfiguration(device.id, axes);
    });
  }

  private static validateDeviceEntries(raw: JsonDeviceAxes[], devices: DeviceProfile[],
    diagnostics: ConfigurationDiagnostic[]): void {
    SettingsSchema.array(raw, SettingsSchema.MAX_DEVICES, 'axisSettingsByDevice');
    const ids: string[] = [];
    for (const device of raw) {
      SettingsSchema.object(device, 'axis settings');
      SettingsSchema.validateEntryId(device.deviceId, ids);
      SettingsSchema.array(device.axes, SettingsSchema.MAX_AXES, 'axis settings axes');
      const profile = devices.find(value => value.id === device.deviceId);
      const names: string[] = [];
      for (const axis of device.axes) {
        SettingsSchema.object(axis, 'axis settings entry');
        SettingsSchema.validateEntryId(axis.axisName, names);
        if (profile === undefined || !profile.axes.some(value => value.name === axis.axisName)) {
          SettingsSchema.warning(diagnostics, device.deviceId + '.' + axis.axisName, 'unknown_axis_skipped', 'Settings for an unknown device or axis were skipped.');
        }
      }
    }
  }

  private static validateMotionEntries(raw: DeviceMotionConfiguration[], devices: DeviceProfile[],
    diagnostics: ConfigurationDiagnostic[]): void {
    SettingsSchema.array(raw, SettingsSchema.MAX_DEVICES, 'motionSettingsByDevice');
    const ids: string[] = [];
    for (const device of raw) {
      SettingsSchema.object(device, 'motion settings'); SettingsSchema.validateEntryId(device.deviceId, ids);
      SettingsSchema.array(device.axes, SettingsSchema.MAX_AXES, 'motion settings axes');
      const profile = devices.find(value => value.id === device.deviceId);
      const names: string[] = [];
      for (const axis of device.axes) {
        SettingsSchema.object(axis, 'motion settings entry'); SettingsSchema.validateEntryId(axis.axisName, names);
        if (profile === undefined || !profile.axes.some(value => value.name === axis.axisName)) {
          SettingsSchema.warning(diagnostics, device.deviceId + '.' + axis.axisName, 'unknown_axis_skipped', 'Motion settings for an unknown device or axis were skipped.');
        }
      }
    }
  }

  private static validateEntryId(id: string, seen: string[]): void {
    if (typeof id !== 'string' || id.length === 0 || id.length > 256 || seen.indexOf(id) >= 0) {
      throw new Error('Configuration entries need unique nonempty identifiers.');
    }
    seen.push(id);
  }

  private static errors(diagnostics: ConfigurationDiagnostic[]): void {
    if (diagnostics.some(value => value.severity === 'error')) {
      throw new Error(diagnostics.filter(value => value.severity === 'error').map(value => value.path + ': ' + value.message).join('; '));
    }
  }

  private static object(value: Object, path: string): void {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) { throw new Error(path + ' must be an object.'); }
  }
  private static array(value: Object[], maximum: number, path: string): void {
    if (!Array.isArray(value) || value.length > maximum) { throw new Error(path + ' must be a bounded array.'); }
  }

  private static missing(raw: Object, defaults: Object, path: string, diagnostics: ConfigurationDiagnostic[]): void {
    const present = Object.keys(raw);
    const known = Object.keys(defaults).filter(key => (defaults as Record<string, Object>)[key] !== undefined);
    for (const key of known) {
      if (present.indexOf(key) < 0) {
        SettingsSchema.warning(diagnostics, path.length > 0 ? path + '.' + key : key,
          'default_added', 'Missing configuration field restored to its default.');
      }
    }
    for (const key of present) {
      if (known.indexOf(key) < 0) { SettingsSchema.warning(diagnostics, path + '.' + key, 'unknown_field_skipped', 'Unknown or runtime-only field was not restored.'); }
    }
  }
  private static warning(diagnostics: ConfigurationDiagnostic[], path: string, code: string, message: string): void {
    if (diagnostics.length < 256) { diagnostics.push(new ConfigurationDiagnostic(path, code, message, 'warning')); }
  }

  /** Reject prototype pollution anywhere, even in ignored fields. Avoid recursive-unbounded JSON trees. */
  private static guard(value: Object | null, depth: number): void {
    if (depth > 32) { throw new Error('Configuration is nested too deeply.'); }
    if (typeof value === 'number' && !Number.isFinite(value)) { throw new Error('Nonfinite JSON number.'); }
    if (value === null || typeof value !== 'object') { return; }
    if (Array.isArray(value)) {
      if (value.length > 4096) { throw new Error('Configuration array is too large.'); }
      for (const child of value) { SettingsSchema.guard(child, depth + 1); }
    } else {
      const object = value as Record<string, Object>;
      for (const key of Object.keys(object)) {
        if (key === '__proto__' || key === 'prototype' || key === 'constructor' || key === '$type') {
          throw new Error('Unsafe configuration key.');
        }
        SettingsSchema.guard(object[key], depth + 1);
      }
    }
  }
}
