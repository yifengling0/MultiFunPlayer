import { SerialOutputPreferences } from '../settings/SerialOutputPreferences';
import type { OutputTargetConfig, OutputTargetKind, AxisRange, TCodeProfile, UpdateContext } from './OutputTypes';
import { defaultFixedContext } from './UpdateContext';

/** Editable output configuration. The owning session validates and persists safe settings;
 * restoring this model never connects or arms a target. */
export class OutputSettingsModel {
  kind: OutputTargetKind = 'tcp';
  polled: boolean = false;
  intervalMs: number = 10;
  dirtyOnly: boolean = true;
  offloadElapsed: boolean = false;
  pausedAutoHome: boolean = false;
  pausedMotion: boolean = false;
  pausedManual: boolean = false;
  ranges: AxisRange[] = [];
  setKind(kind: OutputTargetKind): void {
    if (kind !== 'tcp' && kind !== 'udp' && kind !== 'webSocket' && kind !== 'serial') { throw new Error('Unsupported output kind.'); }
    this.kind = kind; this.intervalMs = defaultFixedContext(kind === 'webSocket').intervalMs;
  }
  setRange(axisId: string, minimum: number, maximum: number, enabled: boolean): boolean {
    if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum < 0 || minimum > 1 || maximum < 0 || maximum > 1 || typeof enabled !== 'boolean') { return false; }
    if (!this.ranges.some(range => range.axisId === axisId)) { return false; }
    this.ranges = this.ranges.map((range): AxisRange => range.axisId === axisId ?
      { axisId: axisId, minimum: minimum, maximum: maximum, enabled: enabled } : range);
    return true;
  }
  config(profile: TCodeProfile, targetId: string = 'manual-network'): OutputTargetConfig {
    const defaults = defaultFixedContext(this.kind === 'webSocket');
    const context: UpdateContext = this.polled ? { kind: 'polled' } : { kind: 'fixed', intervalMs: this.intervalMs,
      minimumIntervalMs: defaults.minimumIntervalMs, maximumIntervalMs: defaults.maximumIntervalMs,
      sendDirtyValuesOnly: this.dirtyOnly, offloadElapsedTime: this.offloadElapsed, usePreciseSleep: false };
    return { targetId: targetId, kind: this.kind, protocolProfile: profile,
      axisRanges: this.ranges.map((range): AxisRange => ({ axisId: range.axisId, minimum: range.minimum, maximum: range.maximum, enabled: range.enabled })),
      updateContext: context, autoConnectPolicy: 'manual', allowPausedAutoHome: this.pausedAutoHome, allowPausedMotion: this.pausedMotion,
      allowPausedManual: this.pausedManual };
  }
}

/** Process-local controlled draft. Application identity is issued by the real
 * coordinator after successful connect, never inferred from a local boolean. */
export class OutputSettingsDraft {
  targetId: string = '';
  /** Runtime instance identity; never persisted with reusable kind:index IDs. */
  targetGeneration: number = 0;
  profileId: string = '';
  model: OutputSettingsModel = new OutputSettingsModel();
  host: string = '';
  port: number = 0;
  family: string = '1';
  localPort: number = 0;
  scheme: string = 'ws';
  path: string = '/';
  serial: SerialOutputPreferences = new SerialOutputPreferences();
  editRevision: number = 0;
  profileRevision: number = 0;
  applicationId: number = 0;
  static copy(source: OutputSettingsDraft): OutputSettingsDraft {
    const result = new OutputSettingsDraft();
    result.targetId = source.targetId; result.targetGeneration = source.targetGeneration; result.profileId = source.profileId;
    result.host = source.host; result.port = source.port; result.family = source.family;
    result.localPort = source.localPort; result.scheme = source.scheme; result.path = source.path;
    result.serial = SerialOutputPreferences.clone(source.serial === undefined ? new SerialOutputPreferences() : source.serial);
    result.editRevision = source.editRevision; result.profileRevision = source.profileRevision; result.applicationId = source.applicationId;
    result.model.kind = source.model.kind; result.model.polled = source.model.polled;
    result.model.intervalMs = source.model.intervalMs; result.model.dirtyOnly = source.model.dirtyOnly;
    result.model.offloadElapsed = source.model.offloadElapsed;
    result.model.pausedAutoHome = source.model.pausedAutoHome; result.model.pausedMotion = source.model.pausedMotion;
    result.model.pausedManual = source.model.pausedManual === undefined ? false : source.model.pausedManual;
    result.model.ranges = source.model.ranges.map((range): AxisRange => ({ axisId: range.axisId, minimum: range.minimum, maximum: range.maximum, enabled: range.enabled }));
    return result;
  }
}
