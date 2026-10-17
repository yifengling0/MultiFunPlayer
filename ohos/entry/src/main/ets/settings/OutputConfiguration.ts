import { ConfigurationDiagnostic } from '../core/DeviceProfile';
import type { AxisRange } from '../output/OutputTypes';
import { defaultFixedContext } from '../output/UpdateContext';

/** Saved network preferences only. These identifiers never grant a connection,
 * application, profile revision, output scope, or permission to Arm. */
export type SavedOutputTargetKind = 'tcp' | 'udp' | 'webSocket';

export class SavedOutputDeviceRanges {
  deviceId: string;
  ranges: AxisRange[];
  constructor(deviceId: string, ranges: AxisRange[] = []) {
    this.deviceId = deviceId;
    this.ranges = ranges.map((range): AxisRange => ({ axisId: range.axisId,
      minimum: range.minimum, maximum: range.maximum, enabled: range.enabled }));
  }
}

export class SavedOutputTarget {
  id: string;
  name: string;
  kind: SavedOutputTargetKind;
  index: number;
  host: string = '';
  port: number = 0;
  family: 1 | 2 = 1;
  localPort: number = 0;
  scheme: 'ws' | 'wss' = 'ws';
  path: string = '/';
  polled: boolean = false;
  intervalMs: number;
  dirtyOnly: boolean = true;
  offloadElapsed: boolean = false;
  pausedAutoHome: boolean = false;
  pausedMotion: boolean = false;
  pausedManual: boolean = false;
  rangesByDevice: SavedOutputDeviceRanges[] = [];
  constructor(kind: SavedOutputTargetKind = 'tcp', index: number = 0) {
    this.kind = kind; this.index = index; this.id = kind + ':' + index.toString();
    this.name = (kind === 'webSocket' ? 'WebSocket' : kind.toUpperCase()) + ' #' + index.toString();
    this.intervalMs = defaultFixedContext(kind === 'webSocket').intervalMs;
  }
}

/** Pure, bounded DTO. Empty host/zero port are an unfinished endpoint, never a
 * connection request. Other invalid edits remain volatile in the UI. Restoring
 * this object must not restore any live runtime state or auto-connect policy. */
export class OutputConfiguration {
  static readonly MAX_TARGETS: number = 30;
  static readonly MAX_TARGETS_PER_KIND: number = 10;
  static readonly MAX_NAME_LENGTH: number = 80;
  static readonly MAX_ID_LENGTH: number = 64;
  static readonly MAX_DEVICES: number = 32;
  static readonly MAX_AXES: number = 32;
  static readonly MAX_HOST_LENGTH: number = 253;
  static readonly MAX_PATH_LENGTH: number = 1024;
  targets: SavedOutputTarget[] = [];
  selectedTargetId: string | null = null;

  static validate(value: OutputConfiguration): ConfigurationDiagnostic[] {
    try { OutputConfiguration.check(value); return []; }
    catch (error) { return [new ConfigurationDiagnostic('outputs', 'invalid_outputs', (error as Error).message)]; }
  }

  static validateTarget(value: SavedOutputTarget): ConfigurationDiagnostic[] {
    try { OutputConfiguration.checkTarget(value, 'outputs.target'); return []; }
    catch (error) { return [new ConfigurationDiagnostic('outputs.target', 'invalid_output_target', (error as Error).message)]; }
  }

  /** Missing schema-1 outputs and additive pausedManual permission default safely.
   * All prior fields remain required; unknown or malformed fields are rejected. */
  static fromJson(raw: OutputConfiguration | undefined): OutputConfiguration {
    return raw === undefined ? new OutputConfiguration() : OutputConfiguration.clone(raw);
  }

  static clone(value: OutputConfiguration): OutputConfiguration {
    OutputConfiguration.check(value);
    const result = new OutputConfiguration();
    result.targets = value.targets.map(target => OutputConfiguration.copyTarget(target));
    result.selectedTargetId = value.selectedTargetId;
    return result;
  }

  static cloneTarget(value: SavedOutputTarget): SavedOutputTarget {
    OutputConfiguration.checkTarget(value, 'outputs.target');
    return OutputConfiguration.copyTarget(value);
  }

  private static copyTarget(value: SavedOutputTarget): SavedOutputTarget {
    const result = new SavedOutputTarget(value.kind, value.index);
    result.id = value.id; result.name = value.name;
    result.host = value.host; result.port = value.port; result.family = value.family;
    result.localPort = value.localPort; result.scheme = value.scheme; result.path = value.path;
    result.polled = value.polled; result.intervalMs = value.intervalMs;
    result.dirtyOnly = value.dirtyOnly; result.offloadElapsed = value.offloadElapsed;
    result.pausedAutoHome = value.pausedAutoHome; result.pausedMotion = value.pausedMotion;
    result.pausedManual = value.pausedManual === undefined ? false : value.pausedManual;
    result.rangesByDevice = value.rangesByDevice.map(device => new SavedOutputDeviceRanges(device.deviceId, device.ranges));
    return result;
  }

  private static check(value: OutputConfiguration): void {
    OutputConfiguration.keys(value, ['targets', 'selectedTargetId'], 'outputs');
    OutputConfiguration.array(value.targets, OutputConfiguration.MAX_TARGETS, 'outputs.targets');
    const ids: string[] = [];
    let tcp: number = 0; let udp: number = 0; let webSocket: number = 0;
    for (let index: number = 0; index < value.targets.length; index++) {
      const target = value.targets[index];
      OutputConfiguration.checkTarget(target, 'outputs.targets[' + index.toString() + ']');
      if (ids.indexOf(target.id) >= 0) { throw new Error('Output target identifiers must be unique.'); }
      ids.push(target.id);
      if (target.kind === 'tcp') { tcp++; }
      else if (target.kind === 'udp') { udp++; }
      else { webSocket++; }
    }
    if (tcp > OutputConfiguration.MAX_TARGETS_PER_KIND || udp > OutputConfiguration.MAX_TARGETS_PER_KIND ||
      webSocket > OutputConfiguration.MAX_TARGETS_PER_KIND) { throw new Error('At most ten targets of each kind may be saved.'); }
    if (value.selectedTargetId !== null && (typeof value.selectedTargetId !== 'string' || ids.indexOf(value.selectedTargetId) < 0)) {
      throw new Error('Selected output must be null or a saved target identifier.');
    }
  }

  private static checkTarget(value: SavedOutputTarget, path: string): void {
    OutputConfiguration.keys(value, ['id', 'name', 'kind', 'index', 'host', 'port', 'family', 'localPort', 'scheme', 'path',
      'polled', 'intervalMs', 'dirtyOnly', 'offloadElapsed', 'pausedAutoHome', 'pausedMotion', 'pausedManual', 'rangesByDevice'], path, ['pausedManual']);
    if (value.kind !== 'tcp' && value.kind !== 'udp' && value.kind !== 'webSocket') {
      throw new Error(path + '.kind must be a supported network kind.');
    }
    if (!Number.isInteger(value.index) || value.index < 0 || value.index >= OutputConfiguration.MAX_TARGETS_PER_KIND ||
      typeof value.id !== 'string' || value.id.length > OutputConfiguration.MAX_ID_LENGTH ||
      value.id !== value.kind + ':' + value.index.toString()) {
      throw new Error(path + ' must use a stable kind:index identifier with index 0 through 9.');
    }
    if (typeof value.name !== 'string' || value.name.trim().length === 0 || value.name.length > OutputConfiguration.MAX_NAME_LENGTH ||
      /[\x00-\x1f\x7f-\x9f]/.test(value.name)) { throw new Error(path + '.name must be a bounded display label.'); }
    if (typeof value.host !== 'string' || value.host.length > OutputConfiguration.MAX_HOST_LENGTH ||
      (value.host.length > 0 && !OutputConfiguration.host(value.host))) {
      throw new Error(path + '.host must be empty or a raw hostname/IP without URL syntax or credentials.');
    }
    OutputConfiguration.port(value.port, path + '.port'); OutputConfiguration.port(value.localPort, path + '.localPort');
    if (value.family !== 1 && value.family !== 2) { throw new Error(path + '.family must be 1 or 2.'); }
    if (value.scheme !== 'ws' && value.scheme !== 'wss') { throw new Error(path + '.scheme must be ws or wss.'); }
    // Conservative subset of native endpointUrl: no query/fragment, escaping,
    // user-info, parameter assignments or authentication-bearing path fields.
    if (typeof value.path !== 'string' || value.path.length > OutputConfiguration.MAX_PATH_LENGTH ||
      !/^\/[A-Za-z0-9_./~-]*$/.test(value.path) ||
      /(?:^|\/)(?:auth|authorization|password|passwd|token|access_token|refresh_token|api_key|apikey|secret|credential|credentials)(?:\/|$)/i.test(value.path)) {
      throw new Error(path + '.path must be an absolute credential-free path without query or fragment.');
    }
    if (typeof value.polled !== 'boolean' || typeof value.dirtyOnly !== 'boolean' || typeof value.offloadElapsed !== 'boolean' ||
      typeof value.pausedAutoHome !== 'boolean' || typeof value.pausedMotion !== 'boolean' ||
      (Object.keys(value).indexOf('pausedManual') >= 0 && typeof value.pausedManual !== 'boolean')) {
      throw new Error(path + ' output switches must be boolean.');
    }
    const context = defaultFixedContext(value.kind === 'webSocket');
    if (!Number.isFinite(value.intervalMs) || value.intervalMs < context.minimumIntervalMs || value.intervalMs > context.maximumIntervalMs) {
      throw new Error(path + '.intervalMs must be within the fixed interval bounds for its kind.');
    }
    OutputConfiguration.array(value.rangesByDevice, OutputConfiguration.MAX_DEVICES, path + '.rangesByDevice');
    const devices: string[] = [];
    for (const device of value.rangesByDevice) {
      OutputConfiguration.keys(device, ['deviceId', 'ranges'], path + '.rangesByDevice');
      if (typeof device.deviceId !== 'string' || device.deviceId.trim().length === 0 || device.deviceId.length > 256 ||
        /[\x00-\x1f\x7f-\x9f]/.test(device.deviceId) || devices.indexOf(device.deviceId) >= 0) {
        throw new Error(path + ' ranges require unique bounded device identifiers.');
      }
      devices.push(device.deviceId);
      OutputConfiguration.array(device.ranges, OutputConfiguration.MAX_AXES, path + '.ranges');
      const axes: string[] = [];
      for (const range of device.ranges) {
        OutputConfiguration.keys(range, ['axisId', 'minimum', 'maximum', 'enabled'], path + '.range');
        if (typeof range.axisId !== 'string' || !/^[A-Z][0-9]$/.test(range.axisId) || axes.indexOf(range.axisId) >= 0) {
          throw new Error(path + ' ranges require unique uppercase letter/digit axis identifiers.');
        }
        axes.push(range.axisId);
        if (!Number.isFinite(range.minimum) || !Number.isFinite(range.maximum) || range.minimum < 0 ||
          range.minimum > 1 || range.maximum < 0 || range.maximum > 1 || typeof range.enabled !== 'boolean') {
          throw new Error(path + ' range endpoints must each be within 0 through 1 and have boolean enabled state; endpoint order is preserved.');
        }
      }
    }
  }

  private static keys(value: Object, allowed: string[], path: string, optional: string[] = []): void {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) { throw new Error(path + ' must be an object.'); }
    const keys = Object.keys(value);
    if (keys.some(key => allowed.indexOf(key) < 0)) { throw new Error(path + ' contains an unsupported or unsafe field.'); }
    if (allowed.some(key => optional.indexOf(key) < 0 && keys.indexOf(key) < 0)) { throw new Error(path + ' is missing a required field.'); }
  }

  private static array(value: Object[], maximum: number, path: string): void {
    if (!Array.isArray(value) || value.length > maximum) { throw new Error(path + ' must be a bounded array.'); }
  }

  private static port(value: number, path: string): void {
    if (!Number.isInteger(value) || value < 0 || value > 65535) { throw new Error(path + ' must be an integer from 0 through 65535.'); }
  }

  private static host(value: string): boolean {
    if (value.includes(':')) {
      // Raw IPv6 only; native transport deliberately rejects zone IDs, brackets
      // and dotted embedded IPv4. A compressed address omits at least one group.
      if (!/^[A-Fa-f0-9:]+$/.test(value)) { return false; }
      const halves = value.split('::');
      if (halves.length > 2) { return false; }
      const groups: string[] = [];
      for (const half of halves) {
        if (half.length > 0) { groups.push(...half.split(':')); }
      }
      if (groups.some(group => !/^[A-Fa-f0-9]{1,4}$/.test(group))) { return false; }
      return halves.length === 2 ? groups.length < 8 : groups.length === 8;
    }
    if (/^[0-9.]+$/.test(value) && value.includes('.')) {
      const octets = value.split('.');
      return octets.length === 4 && octets.every(octet => /^(?:0|[1-9][0-9]{0,2})$/.test(octet) && Number(octet) <= 255);
    }
    return value.split('.').every(label => label.length <= 63 && /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label));
  }
}
