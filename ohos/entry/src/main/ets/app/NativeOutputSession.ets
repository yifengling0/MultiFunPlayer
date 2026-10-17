import { SocketDiagnosticSession } from './SocketDiagnosticSession';
import { OutputSettingsDraft } from '../output/OutputSettingsModel';
import { createNativeOutputCoordinator } from '../output/NativeOutputCoordinator';
import { OutputTargetCollection } from '../output/OutputTargetCollection';
import type { OutputSourcePort, OutputEndpoint } from '../output/OutputCoordinator';
import type { AxisRange, OutputTargetConfig, TCodeProfile } from '../output/OutputTypes';
import { DeviceProfile } from '../core/DeviceProfile';
import { OutputConfiguration, SavedOutputTarget, SavedOutputDeviceRanges } from '../settings/OutputConfiguration';
import type { SavedOutputTargetKind } from '../settings/OutputConfiguration';

class OutputDraftEntry {
  id: string;
  draft: OutputSettingsDraft;
  diagnostic: string = '';
  constructor(id: string, draft: OutputSettingsDraft) { this.id = id; this.draft = draft; }
}
export class OutputTargetSummary {
  id: string; name: string; kind: string; connection: string; armed: boolean; dispatchSuspended: boolean; removing: boolean; generation: number;
  constructor(id: string, name: string, kind: string, connection: string, armed: boolean, removing: boolean, generation: number, dispatchSuspended: boolean = false) {
    this.id = id; this.name = name; this.kind = kind; this.connection = connection; this.armed = armed; this.dispatchSuspended = dispatchSuspended; this.removing = removing; this.generation = generation;
  }
}

/** Application owner. Restoring preferences creates only inert coordinators.
 * Failed-close owners survive page/Ability recreation and cannot be forgotten. */
export class NativeOutputSession {
  private static instance: OutputTargetCollection | null = null;
  private static foreground: boolean = true;
  private static restored: boolean = false;
  private static nextTargetGeneration: number = 0;
  private static saved: OutputConfiguration = new OutputConfiguration();
  private static drafts: OutputDraftEntry[] = [];
  private static profile: DeviceProfile | null = null;
  private static profileRevision: number = 0;
  static current(source: OutputSourcePort): OutputTargetCollection {
    if (NativeOutputSession.instance === null) {
      NativeOutputSession.instance = new OutputTargetCollection((_id: string) => {
        const coordinator = createNativeOutputCoordinator(source, {
          maximumFrameAgeMs: 200, maximumClockAgeMs: 750, maximumEventAgeMs: 200,
          maximumFixedElapsedMs: 1000, writeTimeoutMs: 1000, maximumPolledQueueLength: 64, allowZeroInterval: true
        }, { connectTimeoutMs: 10000, writeTimeoutMs: 1000, closeTimeoutMs: 2000,
          maximumPayloadBytes: 1024, maximumReceiveBytes: 1024 });
        coordinator.setTerminalGateObserver(() => {
          if (source.isManualPreviewActive === undefined || source.revokeManualPreview === undefined ||
            !source.isManualPreviewActive()) { return; }
          // Terminal transport callbacks must close every manual target before
          // another fixed deadline. Do not wait for UI refresh or native close ACK.
          try { source.revokeManualPreview(); }
          finally { if (NativeOutputSession.instance !== null) { NativeOutputSession.instance.stop(); } }
        });
        return coordinator;
      });
      NativeOutputSession.instance.setForeground(NativeOutputSession.foreground);
    }
    return NativeOutputSession.instance;
  }
  static restore(configuration: OutputConfiguration, profile: DeviceProfile, revision: number): void {
    if (NativeOutputSession.instance === null) { throw new Error('Initialize output ownership before restoring settings.'); }
    if (!NativeOutputSession.restored) {
      const checked = OutputConfiguration.clone(configuration);
      NativeOutputSession.saved = checked;
      for (const target of checked.targets) { NativeOutputSession.instance.add(target.id); }
      if (checked.selectedTargetId !== null) { NativeOutputSession.instance.select(checked.selectedTargetId); }
      NativeOutputSession.restored = true;
    }
    NativeOutputSession.synchronizeProfile(profile, revision);
  }
  private static draftFrom(target: SavedOutputTarget, profile: DeviceProfile, revision: number): OutputSettingsDraft {
    const draft = new OutputSettingsDraft();
    draft.targetGeneration = ++NativeOutputSession.nextTargetGeneration; draft.targetId = target.id; draft.profileId = profile.id; draft.profileRevision = revision;
    draft.host = target.host; draft.port = target.port; draft.family = target.family.toString(); draft.localPort = target.localPort;
    draft.scheme = target.scheme; draft.path = target.path;
    draft.model.kind = target.kind; draft.model.polled = target.polled; draft.model.intervalMs = target.intervalMs;
    draft.model.dirtyOnly = target.dirtyOnly; draft.model.offloadElapsed = target.offloadElapsed;
    draft.model.pausedAutoHome = target.pausedAutoHome; draft.model.pausedMotion = target.pausedMotion;
    draft.model.pausedManual = target.pausedManual;
    const device = target.rangesByDevice.find(item => item.deviceId === profile.id);
    draft.model.ranges = profile.axes.filter(axis => axis.enabled).map((axis): AxisRange => {
      const saved = device === undefined ? undefined : device.ranges.find(range => range.axisId === axis.name);
      return saved === undefined ? { axisId: axis.name, minimum: 0, maximum: 1, enabled: true } :
        { axisId: axis.name, minimum: saved.minimum, maximum: saved.maximum, enabled: saved.enabled };
    });
    return draft;
  }
  static synchronizeProfile(profile: DeviceProfile, revision: number): void {
    if (NativeOutputSession.profile !== null && NativeOutputSession.profile.id === profile.id && NativeOutputSession.profileRevision === revision) { return; }
    if (NativeOutputSession.instance !== null) { NativeOutputSession.instance.disarm(); }
    NativeOutputSession.profile = profile; NativeOutputSession.profileRevision = revision;
    NativeOutputSession.drafts = NativeOutputSession.saved.targets.map(target => {
      const old = NativeOutputSession.drafts.find(entry => entry.id === target.id);
      const draft = NativeOutputSession.draftFrom(target, profile, revision);
      if (old !== undefined) {
        // Keep unfinished endpoint edits volatile, but never reuse an applied identity.
        draft.targetGeneration = old.draft.targetGeneration; draft.host = old.draft.host; draft.port = old.draft.port; draft.family = old.draft.family;
        draft.localPort = old.draft.localPort; draft.scheme = old.draft.scheme; draft.path = old.draft.path;
        draft.editRevision = old.draft.editRevision + 1;
      }
      const entry = new OutputDraftEntry(target.id, draft);
      try { NativeOutputSession.savedDraft(target, draft); }
      catch { entry.diagnostic = NativeOutputSession.invalidDraftMessage(); }
      return entry;
    });
  }
  static selectedId(): string | null { return NativeOutputSession.instance === null ? null : NativeOutputSession.instance.selectedId(); }
  static configurationSnapshot(): OutputConfiguration { return OutputConfiguration.clone(NativeOutputSession.saved); }
  static draftSnapshot(id: string | null = NativeOutputSession.selectedId()): OutputSettingsDraft {
    const entry = NativeOutputSession.drafts.find(item => item.id === id);
    return entry === undefined ? new OutputSettingsDraft() : OutputSettingsDraft.copy(entry.draft);
  }
  static draftDiagnostic(id: string | null = NativeOutputSession.selectedId()): string {
    const entry = NativeOutputSession.drafts.find(item => item.id === id); return entry === undefined ? '' : entry.diagnostic;
  }
  static saveDraft(value: OutputSettingsDraft): boolean {
    const entry = NativeOutputSession.drafts.find(item => item.id === value.targetId);
    const target = NativeOutputSession.saved.targets.find(item => item.id === value.targetId);
    if (entry === undefined || target === undefined || NativeOutputSession.profile === null ||
      value.targetGeneration !== entry.draft.targetGeneration || value.profileId !== NativeOutputSession.profile.id || value.profileRevision !== NativeOutputSession.profileRevision ||
      value.editRevision < entry.draft.editRevision || NativeOutputSession.instance?.isRemoving(value.targetId)) { return false; }
    if (value.editRevision === entry.draft.editRevision) {
      const previous = OutputSettingsDraft.copy(entry.draft); const incoming = OutputSettingsDraft.copy(value);
      previous.applicationId = 0; incoming.applicationId = 0;
      if (JSON.stringify(previous) !== JSON.stringify(incoming)) { return false; }
    }
    entry.draft = OutputSettingsDraft.copy(value);
    try {
      const checked = NativeOutputSession.savedDraft(target, value);
      NativeOutputSession.saved.targets = NativeOutputSession.saved.targets.map(item => item.id === checked.id ? checked : item);
      entry.diagnostic = '';
    } catch (error) {
      // No user endpoint text or exception text is copied into persistent diagnostics.
      entry.diagnostic = NativeOutputSession.invalidDraftMessage();
    }
    return true;
  }
  /** Transactional range-only command. A connected target must still own the
   * exact applied draft; unrelated unapplied endpoint/policy edits never leak. */
  static updateRanges(value: OutputSettingsDraft): boolean {
    const entry = NativeOutputSession.drafts.find(item => item.id === value.targetId);
    const target = NativeOutputSession.saved.targets.find(item => item.id === value.targetId);
    if (entry === undefined || target === undefined || NativeOutputSession.instance === null ||
      !NativeOutputSession.matchesTarget(value.targetId, value.targetGeneration) ||
      NativeOutputSession.instance.isRemoving(value.targetId) || value.editRevision !== entry.draft.editRevision + 1) { return false; }
    const previous = OutputSettingsDraft.copy(entry.draft); const comparison = OutputSettingsDraft.copy(value);
    comparison.model.ranges = previous.model.ranges; comparison.editRevision = previous.editRevision;
    if (JSON.stringify(comparison) !== JSON.stringify(previous) || value.model.ranges.length !== previous.model.ranges.length ||
      value.model.ranges.some((range, index) => range.axisId !== previous.model.ranges[index].axisId || range.enabled !== previous.model.ranges[index].enabled)) { return false; }
    let checked: SavedOutputTarget;
    try { checked = NativeOutputSession.savedDraft(target, value); } catch { return false; }
    const coordinator = NativeOutputSession.instance.get(value.targetId);
    if (coordinator === null || coordinator.isBusy()) { return false; }
    const status = coordinator.status(); const next = OutputSettingsDraft.copy(value);
    if (status !== null && status.connection === 'connected') {
      if (previous.applicationId <= 0 || previous.applicationId !== coordinator.appliedConfigurationId() ||
        !coordinator.updateRanges(value.model.ranges, previous.applicationId)) { return false; }
      next.applicationId = coordinator.appliedConfigurationId();
    } else { next.applicationId = 0; }
    entry.draft = next; entry.diagnostic = '';
    NativeOutputSession.saved.targets = NativeOutputSession.saved.targets.map(item => item.id === checked.id ? checked : item);
    return true;
  }
  private static invalidDraftMessage(): string {
    return '草稿未保存：仅支持有界、无凭据的主机/端口/路径与有效目标参数。上次有效配置保留。';
  }
  private static savedDraft(target: SavedOutputTarget, value: OutputSettingsDraft): SavedOutputTarget {
      const next = OutputConfiguration.cloneTarget(target);
      next.host = value.host; next.port = value.port;
      if (value.family !== '1' && value.family !== '2') { throw new Error('Invalid family'); }
      if (value.scheme !== 'ws' && value.scheme !== 'wss') { throw new Error('Invalid scheme'); }
      if (value.model.kind !== next.kind) { throw new Error('Target kind is fixed; add another target kind.'); }
      next.family = value.family === '2' ? 2 : 1; next.localPort = value.localPort; next.scheme = value.scheme; next.path = value.path;
      next.polled = value.model.polled; next.intervalMs = value.model.intervalMs; next.dirtyOnly = value.model.dirtyOnly;
      next.offloadElapsed = value.model.offloadElapsed; next.pausedAutoHome = value.model.pausedAutoHome; next.pausedMotion = value.model.pausedMotion;
      next.pausedManual = value.model.pausedManual;
      const previous = next.rangesByDevice.find(device => device.deviceId === value.profileId);
      const ranges: AxisRange[] = previous === undefined ? [] : previous.ranges.slice();
      for (const range of value.model.ranges) {
        const index = ranges.findIndex(old => old.axisId === range.axisId);
        const copy: AxisRange = { axisId: range.axisId, minimum: range.minimum, maximum: range.maximum, enabled: range.enabled };
        if (index < 0) { ranges.push(copy); } else { ranges[index] = copy; }
      }
      next.rangesByDevice = next.rangesByDevice.filter(device => device.deviceId !== value.profileId);
      next.rangesByDevice.push(new SavedOutputDeviceRanges(value.profileId, ranges));
      return OutputConfiguration.cloneTarget(next);
  }
  /** Validate the exact current intent again, rather than treating a cached UI
   * diagnostic or a target identifier as authority to submit another endpoint. */
  static canConnect(configuration: OutputTargetConfig, endpoint: OutputEndpoint, generation: number): boolean {
    if (SocketDiagnosticSession.blocked() || !NativeOutputSession.matchesTarget(configuration.targetId, generation) || NativeOutputSession.profile === null ||
      NativeOutputSession.instance?.isRemoving(configuration.targetId)) { return false; }
    const entry = NativeOutputSession.drafts.find(item => item.id === configuration.targetId);
    const target = NativeOutputSession.saved.targets.find(item => item.id === configuration.targetId);
    if (entry === undefined || target === undefined) { return false; }
    const draft = entry.draft;
    try {
      NativeOutputSession.savedDraft(target, draft);
      const profile: TCodeProfile = { precision: NativeOutputSession.profile.outputPrecision,
        revision: NativeOutputSession.profileRevision,
        axisOrder: NativeOutputSession.profile.axes.filter(axis => axis.enabled).map(axis => axis.name),
        maximumDurationMs: 10000, maximumPayloadBytes: 1024 };
      return draft.profileId === NativeOutputSession.profile.id && draft.profileRevision === NativeOutputSession.profileRevision &&
        JSON.stringify(configuration) === JSON.stringify(draft.model.config(profile, draft.targetId)) &&
        endpoint.host === draft.host && endpoint.port === draft.port && endpoint.family.toString() === draft.family &&
        endpoint.localPort === draft.localPort && endpoint.scheme === draft.scheme && endpoint.path === draft.path;
    } catch { entry.diagnostic = NativeOutputSession.invalidDraftMessage(); return false; }
  }
  static addTarget(kind: SavedOutputTargetKind): string {
    if (NativeOutputSession.instance === null || NativeOutputSession.profile === null) { throw new Error('Output owner is not ready.'); }
    let index = 0;
    while (index < 10 && NativeOutputSession.saved.targets.some(target => target.kind === kind && target.index === index)) { index++; }
    if (index >= 10) { throw new Error('每种输出最多10个目标。'); }
    const target = OutputConfiguration.cloneTarget(new SavedOutputTarget(kind, index));
    NativeOutputSession.instance.add(target.id); NativeOutputSession.instance.select(target.id);
    NativeOutputSession.saved.targets.push(target); NativeOutputSession.saved.selectedTargetId = target.id;
    NativeOutputSession.drafts.push(new OutputDraftEntry(target.id, NativeOutputSession.draftFrom(target, NativeOutputSession.profile, NativeOutputSession.profileRevision)));
    return target.id;
  }
  static matchesTarget(id: string, generation: number): boolean {
    const entry = NativeOutputSession.drafts.find(item => item.id === id);
    return entry !== undefined && generation > 0 && entry.draft.targetGeneration === generation;
  }
  static selectTarget(id: string, generation: number = NativeOutputSession.draftSnapshot(id).targetGeneration): boolean {
    if (!NativeOutputSession.matchesTarget(id, generation)) { return false; }
    if (NativeOutputSession.instance === null || !NativeOutputSession.instance.select(id)) { return false; }
    NativeOutputSession.saved.selectedTargetId = id; return true;
  }
  static async removeTarget(id: string, generation: number = NativeOutputSession.draftSnapshot(id).targetGeneration): Promise<boolean> {
    if (!NativeOutputSession.matchesTarget(id, generation)) { return false; }
    if (NativeOutputSession.instance === null) { return false; }
    const removed = await NativeOutputSession.instance.remove(id);
    if (!removed || !NativeOutputSession.matchesTarget(id, generation)) { return false; }
    NativeOutputSession.saved.targets = NativeOutputSession.saved.targets.filter(target => target.id !== id);
    NativeOutputSession.drafts = NativeOutputSession.drafts.filter(entry => entry.id !== id);
    NativeOutputSession.saved.selectedTargetId = NativeOutputSession.instance.selectedId(); return true;
  }
  static summaries(): OutputTargetSummary[] {
    return NativeOutputSession.saved.targets.map(target => {
      const coordinator = NativeOutputSession.instance?.get(target.id);
      const status = coordinator === undefined || coordinator === null ? null : coordinator.status();
      return new OutputTargetSummary(target.id, target.name, target.kind, status === null ? 'disconnected' : status.connection,
        status !== null && status.armed, NativeOutputSession.instance !== null && NativeOutputSession.instance.isRemoving(target.id), NativeOutputSession.draftSnapshot(target.id).targetGeneration, status !== null && status.dispatchSuspended);
    });
  }
  static setForeground(value: boolean): void {
    NativeOutputSession.foreground = value;
    SocketDiagnosticSession.setForeground(value);
    if (NativeOutputSession.instance !== null) { NativeOutputSession.instance.setForeground(value); }
  }
  static closeIfReady(): void { NativeOutputSession.setForeground(false); }
}
