import { DeviceAxisDefinition, DeviceProfile, DeviceProfiles } from './DeviceProfile';

/** Wire names follow upstream DeviceSettings.cs and OnExportSelectedDevice exactly. */
class ClipboardAxis {
  Name: string = '';
  FriendlyName: string | null = null;
  FunscriptNames: string[] = [];
  DefaultValue: number = 0;
  Enabled: boolean = false;
}
class ClipboardDevice {
  Name: string = '';
  OutputPrecision: number = 3;
  Axes: ClipboardAxis[] = [];
}

/** Clipboard-only interchange, never an app configuration or a live-session restore. */
export class DeviceProfileTransfer {
  static readonly MAX_TEXT: number = 65536;
  static readonly MAX_AXES: number = 32;
  static readonly MAX_ALIASES: number = 64;
  static readonly MAX_STRING: number = 256;

  static decode(text: string, existing: DeviceProfile[]): DeviceProfile {
    if (typeof text !== 'string' || text.trim().length === 0) { throw new Error('剪贴板没有设备 JSON 文本。'); }
    if (text.length > DeviceProfileTransfer.MAX_TEXT) { throw new Error('设备 JSON 超过 64 Ki 字符限制。'); }
    const raw = JSON.parse(text) as ClipboardDevice;
    DeviceProfileTransfer.guard(raw, 0);
    DeviceProfileTransfer.object(raw);
    DeviceProfileTransfer.string(raw.Name, false);
    const precision: number = raw.OutputPrecision === undefined ? 3 : raw.OutputPrecision;
    const axes: ClipboardAxis[] = raw.Axes === undefined ? [] : raw.Axes;
    if (!Array.isArray(axes) || axes.length > DeviceProfileTransfer.MAX_AXES) { throw new Error('设备轴必须为数组，最多 32 个。'); }
    const definitions: DeviceAxisDefinition[] = axes.map(axis => {
      DeviceProfileTransfer.object(axis);
      DeviceProfileTransfer.string(axis.Name, false);
      const friendly: string | null = axis.FriendlyName === undefined ? null : axis.FriendlyName;
      if (friendly !== null) { DeviceProfileTransfer.string(friendly, true); }
      const aliases: string[] = axis.FunscriptNames === undefined ? [] : axis.FunscriptNames;
      if (!Array.isArray(aliases) || aliases.length > DeviceProfileTransfer.MAX_ALIASES) { throw new Error('每轴最多 64 个脚本别名。'); }
      for (const alias of aliases) { DeviceProfileTransfer.string(alias, false); }
      return new DeviceAxisDefinition(axis.Name, friendly, aliases,
        axis.Enabled === undefined ? false : axis.Enabled,
        axis.DefaultValue === undefined ? 0 : axis.DefaultValue);
    });
    let suffix: number = 1;
    while (existing.some(profile => profile.id === 'custom-' + suffix)) { suffix++; }
    const profile = new DeviceProfile('custom-' + suffix, raw.Name, false, precision, definitions);
    DeviceProfileTransfer.validate(profile);
    return profile;
  }

  static encode(profile: DeviceProfile): string {
    DeviceProfileTransfer.validate(profile);
    const wire = new ClipboardDevice();
    wire.Name = profile.name; wire.OutputPrecision = profile.outputPrecision;
    wire.Axes = profile.axes.map(axis => {
      const value = new ClipboardAxis();
      value.Name = axis.name; value.FriendlyName = axis.friendlyName;
      value.FunscriptNames = axis.funscriptNames.slice(); value.DefaultValue = axis.defaultValue;
      value.Enabled = axis.enabled; return value;
    });
    const text: string = JSON.stringify(wire, null, 2);
    if (text.length > DeviceProfileTransfer.MAX_TEXT) { throw new Error('设备 JSON 超过 64 Ki 字符限制。'); }
    return text;
  }

  private static validate(profile: DeviceProfile): void {
    const errors = DeviceProfiles.validate(profile);
    if (errors.length > 0) { throw new Error(errors.map(error => error.path + ': ' + error.message).join('; ')); }
    DeviceProfileTransfer.string(profile.name, false);
    if (profile.axes.length > DeviceProfileTransfer.MAX_AXES) { throw new Error('设备最多 32 个轴。'); }
    for (const axis of profile.axes) {
      if (axis.friendlyName !== null) { DeviceProfileTransfer.string(axis.friendlyName, true); }
      if (axis.funscriptNames.length > DeviceProfileTransfer.MAX_ALIASES) { throw new Error('每轴最多 64 个脚本别名。'); }
      for (const alias of axis.funscriptNames) { DeviceProfileTransfer.string(alias, false); }
    }
  }
  private static string(value: string, empty: boolean): void {
    if (typeof value !== 'string' || value.length > DeviceProfileTransfer.MAX_STRING || (!empty && value.trim().length === 0)) {
      throw new Error('设备名称、显示名称和别名需为有效文本，最长 256 字符。');
    }
  }
  private static object(value: Object): void {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) { throw new Error('设备与轴需为 JSON 对象。'); }
  }
  private static guard(value: Object | null, depth: number): void {
    if (depth > 16) { throw new Error('设备 JSON 嵌套过深。'); }
    if (typeof value === 'number' && !Number.isFinite(value)) { throw new Error('设备 JSON 数值无效。'); }
    if (value === null || typeof value !== 'object') { return; }
    if (Array.isArray(value)) {
      if (value.length > 256) { throw new Error('设备 JSON 数组过大。'); }
      for (const child of value) { DeviceProfileTransfer.guard(child, depth + 1); }
    } else {
      const object = value as Record<string, Object>;
      for (const key of Object.keys(object)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype' || key === '$type') { throw new Error('设备 JSON 含不安全字段。'); }
        DeviceProfileTransfer.guard(object[key], depth + 1);
      }
    }
  }
}

export interface DeviceClipboardPort {
  readText(): Promise<string>;
  writeText(text: string): Promise<void>;
}

/** Construction does no I/O. Call import/export only from explicit UI gestures. */
export class DeviceProfileClipboard {
  private port: DeviceClipboardPort;
  constructor(port: DeviceClipboardPort) { this.port = port; }
  async importProfile(existing: DeviceProfile[]): Promise<DeviceProfile> {
    return DeviceProfileTransfer.decode(await this.port.readText(), existing);
  }
  async exportProfile(profile: DeviceProfile): Promise<void> {
    const text: string = DeviceProfileTransfer.encode(profile);
    await this.port.writeText(text);
  }
}
