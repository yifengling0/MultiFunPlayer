import { t } from '../l10n/Texts';
import { SettingsDraftOwner } from '../presentation/SettingsDraftOwner';
import { SerialDiagnosticSnapshot } from '../app/SerialDiagnosticSession';
import { SerialOutputPreferences } from '../settings/SerialOutputPreferences';
import type { SavedSerialBackend } from '../settings/SerialOutputPreferences';
import type { SerialPortOption } from '../output/serial/SerialDiscoveryTypes';
import type { SerialDiscoveryCapability } from '../output/SerialDiscoveryController';
import { UiStyle } from '../presentation/UiStyle';
import { KeyboardInputSession } from '../app/KeyboardInputSession';
import { OutputEndpoint } from '../output/OutputCoordinator';
import { OutputSettingsModel, OutputSettingsDraft } from '../output/OutputSettingsModel';
import type { OutputTargetConfig, TCodeProfile, AxisRange } from '../output/OutputTypes';
import { SettingsNumberField, SettingsTextField, SettingsSwitchField, SettingsChoiceField, SettingsOption } from './CurvePointEditor';

@Component
export struct OutputSettingsPanel {
  // Reference ownership is page-local; @Prop would deep-copy and split the draft store.
  draftOwner: SettingsDraftOwner = new SettingsDraftOwner();
  @Prop @Watch('draftContextChanged') draftScope: string = '';
  @Prop @Watch('draftContextChanged') draftEpoch: number = 0;
  @Prop compact: boolean = false;
  private hostEditorId: number = KeyboardInputSession.newEditorId();
  private pathEditorId: number = KeyboardInputSession.newEditorId();
  @Prop @Watch('profileChanged') profile: TCodeProfile = { precision: 4, revision: 1, axisOrder: [], maximumDurationMs: 10000, maximumPayloadBytes: 1024 };
  @Prop @Watch('profileChanged') profileId: string = '';
  @Prop readOnly: boolean = false;
  @Prop @Watch('restoreDraft') draft: OutputSettingsDraft = new OutputSettingsDraft();
  @Prop appliedConfigurationId: number = 0;
  @Prop connection: string = 'disconnected';
  @Prop armed: boolean = false;
  @Prop dispatchSuspended: boolean = false;
  @Prop busy: boolean = false;
  @Prop completedLocalWrites: number = 0;
  @Prop locallyAcceptedBytes: number = 0;
  @Prop diagnostic: string = '';
  @Prop serialPorts: SerialPortOption[] = [];
  @Prop serialCapabilities: SerialDiscoveryCapability[] = [];
  @Prop serialBusy: boolean = false;
  @Prop serialMessage: string = '';
  @Prop serialProbeState: SerialDiagnosticSnapshot = new SerialDiagnosticSnapshot();
  @Prop serialProbeNotice: string = '';
  onProbeSerial: (targetId: string, generation: number) => void = (_targetId: string, _generation: number): void => {};
  onCancelSerialProbe: () => void = (): void => {};
  onCopySerialProbe: () => void = (): void => {};
  @State serial: SerialOutputPreferences = new SerialOutputPreferences();
  onRefreshSerial: (targetId: string, targetGeneration: number, backend: SavedSerialBackend) => void = (_targetId: string, _targetGeneration: number, _backend: SavedSerialBackend): void => {};
  @State model: OutputSettingsModel = new OutputSettingsModel();
  @State host: string = '';
  @State port: number = 0;
  @State family: string = '1';
  @State localPort: number = 0;
  @State scheme: string = 'ws';
  @State path: string = '/';
  @State applicationId: number = 0;
  private targetId: string = '';
  private targetGeneration: number = 0;
  private draftProfileId: string = '';
  private draftProfileRevision: number = 0;
  private observedProfileId: string = '';
  private observedProfileRevision: number = 0;
  private profileInitialized: boolean = false;
  private pendingProfileChange: boolean = false;
  private connectGeneration: number = 0;
  @State editRevision: number = 0;
  @State editNotice: string = '';
  @State rawDraftEpoch: number = 0;
  @State connectionDetailsExpanded: boolean = false;
  @State timingExpanded: boolean = false;
  @State rangesExpanded: boolean = false;
  @State helpExpanded: boolean = false;
  private disclosureRevision: number = 0;
  private disclosureOpen(section: string): boolean {
    if (section === 'connection') { return this.connectionDetailsExpanded; }
    if (section === 'timing') { return this.timingExpanded; }
    if (section === 'ranges') { return this.rangesExpanded; }
    if (section === 'help') { return this.helpExpanded; }
    return false;
  }
  private disclosureCurrent(section: string, revision: number): boolean {
    return section.length === 0 || (revision === this.disclosureRevision && this.disclosureOpen(section));
  }
  private disclosureHandler(section: string): () => void {
    const revision: number = this.disclosureRevision;
    return this.guardedAction(() => {
      if (revision !== this.disclosureRevision) { return; }
      if (section === 'connection') { this.connectionDetailsExpanded = !this.connectionDetailsExpanded; }
      else if (section === 'timing') { this.timingExpanded = !this.timingExpanded; }
      else if (section === 'ranges') { this.rangesExpanded = !this.rangesExpanded; }
      else if (section === 'help') { this.helpExpanded = !this.helpExpanded; }
      else { return; }
      // Retire hidden controls immediately, before their disappearance callback.
      // Do not release the shared draft owner or invalidate an in-flight Connect.
      this.disclosureRevision++;
    });
  }
  private disclosureDraftGuard(section: string): () => boolean {
    const source: string = this.interactionSource(); const token: number = this.interactionToken(source);
    const revision: number = this.disclosureRevision;
    return (): boolean => this.ownsInteraction(token, source) && this.disclosureCurrent(section, revision);
  }
  private editingBlockReason(): string {
    if (this.readOnly) { return '当前配置只读，不能编辑主机/IP、端口或发送设置；仍可点击“断开”结束连接。'; }
    if (!this.canEdit()) { return '正在等待当前目标配置，请稍后编辑。'; }
    if (this.connection === 'connected' || this.connection === 'connecting') {
      return '已连接或正在连接，连接地址 / 端口已锁定。先点击“断开 / 编辑连接”，再修改并重新连接；发送需重新启用。';
    }
    if (this.model.kind === 'serial' && (this.busy || this.serialBusy || this.serialProbeBlocked())) {
      return '串口操作或设备清理尚未完成，端口与波特率暂不能编辑。';
    }
    return '';
  }
  private connectionBlockReason(): string {
    if (!this.canEdit()) { return this.editingBlockReason(); }
    if (this.busy) { return '正在处理连接，请等待完成；需要取消时可点击“断开”。'; }
    if (this.serialBusy) { return '正在刷新串口，请等待本次列表。'; }
    if (this.serialProbeBlocked()) { return '设备识别或关闭尚未确认，连接保持禁用；请查看下方识别状态。'; }
    if (this.unappliedInputs()) { return '有未应用输入（可能在折叠项内）。请确认输入，或展开“说明 / 输入管理”全部取消。'; }
    if (this.model.kind !== 'serial') {
      return this.host.trim().length === 0 || this.port <= 0 ? '填写目标主机/IP 和端口，确认输入后即可连接。' : '';
    }
    const capability = this.serialCapabilities.find(item => item.backend === this.serial.backend);
    if (capability === undefined || !capability.available) { return this.serialCapabilityText(); }
    if (this.serial.portName.length === 0) { return '刷新候选列表并选择串口；切换后端请展开“连接设置”。'; }
    if (this.serial.backend === 'official19' && (this.serial.dtr !== null || this.serial.rts !== null)) {
      return '连接前需展开“连接设置”，将 DTR / RTS 都明确设为系统管理。';
    }
    if (this.serial.backend === 'ch34xWriteOnly' && (this.serial.dtr === null || this.serial.rts === null)) {
      return '连接前需展开“连接设置”，明确选择 DTR / RTS 启用或关闭。';
    }
    return '';
  }
  private canEditEndpoint(): boolean { return this.canEdit() && !this.busy && this.connection !== 'connected' && this.connection !== 'connecting'; }
  private connectFromPanel(): void { if (this.canEditEndpoint()) { this.connect(); } }
  private commitHost(value: string): boolean { if (!this.canEditEndpoint()) { return false; } this.host = value; this.changed(); return true; }
  private commitPort(value: number): boolean { if (!this.canEditEndpoint()) { return false; } this.port = value; this.changed(); return true; }
  private commitBaud(value: number): boolean { if (!this.canEditSerial()) { return false; } this.serial.baudRate = value; this.changed(); return true; }
  private cancelUnappliedInputs(): void {
    if (!this.canEdit()) { return; }
    this.draftOwner.clearScope(this.draftScope); this.rawDraftEpoch++; this.draftContextChanged();
    this.editNotice = '已取消本目标所有未应用输入；已确认配置未改变。';
  }
  private unappliedInputs(): boolean { return this.draftOwner.hasPending(this.draftScope); }
  onConnect: (config: OutputTargetConfig, endpoint: OutputEndpoint, targetGeneration: number) => Promise<number> = async (_config: OutputTargetConfig, _endpoint: OutputEndpoint, _targetGeneration: number): Promise<number> => 0;
  onDraftChange: (draft: OutputSettingsDraft) => void = (_draft: OutputSettingsDraft): void => {};
  onDisconnect: (targetId: string, targetGeneration: number) => void = (_targetId: string, _targetGeneration: number): void => {};
  onArm: (targetId: string, targetGeneration: number) => void = (_targetId: string, _targetGeneration: number): void => {};
  onDisarm: (targetId: string, targetGeneration: number) => void = (_targetId: string, _targetGeneration: number): void => {};
  aboutToAppear(): void { KeyboardInputSession.releaseEditor(this.hostEditorId); KeyboardInputSession.releaseEditor(this.pathEditorId); this.hostEditorId = KeyboardInputSession.newEditorId(); this.pathEditorId = KeyboardInputSession.newEditorId(); this.draftActive = true; this.restoreDraft(); this.draftContextChanged(); }
  aboutToDisappear(): void { this.draftActive = false; this.draftOwner.release(this.panelToken); this.connectGeneration++; KeyboardInputSession.releaseEditor(this.hostEditorId); KeyboardInputSession.releaseEditor(this.pathEditorId); }
  private panelToken: number = 0;
  private draftActive: boolean = true;
  private draftContextChanged(): void {
    this.draftOwner.release(this.panelToken); this.panelToken = 0; this.connectGeneration++;
    this.hostEditorId = KeyboardInputSession.renewEditor(this.hostEditorId); this.pathEditorId = KeyboardInputSession.renewEditor(this.pathEditorId);
  }
  private interactionSource(): string {
    return JSON.stringify([this.draftScope, this.draftEpoch, this.targetId, this.targetGeneration, this.draftProfileId,
      this.draftProfileRevision, this.profileId, this.profile.revision, this.editRevision, this.readOnly, this.rawDraftEpoch, this.draft]);
  }
  private interactionToken(source: string): number {
    if (!this.draftOwner.isCurrent(this.panelToken, source)) { this.panelToken = this.draftOwner.open(this.draftScope, '$panel', source, '').token; }
    return this.panelToken;
  }
  private ownsInteraction(token: number, source: string): boolean {
    return this.draftActive && source === this.interactionSource() && this.draftOwner.isCurrent(token, source);
  }
  private guardedNumber(action: (value: number) => boolean, section: string = ''): (value: number) => boolean {
    const source = this.interactionSource(); const token = this.interactionToken(source); const revision: number = this.disclosureRevision;
    return (value: number): boolean => this.ownsInteraction(token, source) && this.disclosureCurrent(section, revision) && action(value);
  }
  private guardedText(action: (value: string) => boolean, section: string = ''): (value: string) => boolean {
    const source = this.interactionSource(); const token = this.interactionToken(source); const revision: number = this.disclosureRevision;
    return (value: string): boolean => this.ownsInteraction(token, source) && this.disclosureCurrent(section, revision) && action(value);
  }
  private guardedChoice(action: (value: string) => void, section: string = ''): (value: string) => void {
    const source = this.interactionSource(); const token = this.interactionToken(source); const revision: number = this.disclosureRevision;
    return (value: string): void => { if (this.ownsInteraction(token, source) && this.disclosureCurrent(section, revision)) { action(value); } };
  }
  private guardedFlag(action: (value: boolean) => void, section: string = ''): (value: boolean) => void {
    const source = this.interactionSource(); const token = this.interactionToken(source); const revision: number = this.disclosureRevision;
    return (value: boolean): void => { if (this.ownsInteraction(token, source) && this.disclosureCurrent(section, revision)) { action(value); } };
  }
  private guardedAction(action: () => void, section: string = ''): () => void {
    const source = this.interactionSource(); const token = this.interactionToken(source); const revision: number = this.disclosureRevision;
    return (): void => { if (this.ownsInteraction(token, source) && this.disclosureCurrent(section, revision)) { action(); } };
  }
  private restoreDraft(): void {
    const value = OutputSettingsDraft.copy(this.draft);
    const targetChanged: boolean = this.targetId !== value.targetId || this.targetGeneration !== value.targetGeneration;
    const profileChanged: boolean = this.draftProfileId !== value.profileId;
    if (targetChanged || profileChanged) { this.connectGeneration++; this.hostEditorId = KeyboardInputSession.renewEditor(this.hostEditorId); this.pathEditorId = KeyboardInputSession.renewEditor(this.pathEditorId); }
    if (!targetChanged && profileChanged && this.profileInitialized) { this.pendingProfileChange = true; }
    this.targetId = value.targetId; this.targetGeneration = value.targetGeneration; this.draftProfileId = value.profileId;
    this.model = value.model; this.host = value.host; this.port = value.port; this.family = value.family;
    this.localPort = value.localPort; this.scheme = value.scheme; this.path = value.path;
    this.serial = SerialOutputPreferences.clone(value.serial);
    this.editRevision = value.editRevision; this.draftProfileRevision = value.profileRevision; this.applicationId = value.applicationId;
    this.profileChanged();
  }
  private profileChanged(): void {
    const runtimeChanged: boolean = this.profileInitialized &&
      (this.observedProfileId !== this.profileId || this.observedProfileRevision !== this.profile.revision);
    this.observedProfileId = this.profileId; this.observedProfileRevision = this.profile.revision;
    this.profileInitialized = true;
    if (runtimeChanged) { this.pendingProfileChange = true; this.connectGeneration++; }
    // Prop watchers can arrive in either order. Wait for the owner's matching
    // device draft rather than relabeling or copying the previous device's ranges.
    if (this.draftProfileId !== this.profileId || this.draftProfileRevision > this.profile.revision) {
      this.applicationId = 0; return;
    }
    const revisionChanged: boolean = this.draftProfileRevision !== this.profile.revision;
    const invalidate: boolean = this.pendingProfileChange || revisionChanged;
    const wasInitialized: boolean = this.draftProfileRevision !== 0;
    this.pendingProfileChange = false;
    this.draftProfileRevision = this.profile.revision;
    this.model.ranges = this.profile.axisOrder.map((axis): AxisRange => {
      const saved: AxisRange | undefined = this.model.ranges.find(range => range.axisId === axis);
      return saved === undefined ? { axisId: axis, minimum: 0, maximum: 1, enabled: true } :
        { axisId: axis, minimum: saved.minimum, maximum: saved.maximum, enabled: saved.enabled };
    });
    if (!invalidate) { return; }
    this.applicationId = 0; this.editRevision++; this.connectGeneration++;
    if (wasInitialized) { this.disarm(); }
    if (!this.readOnly) { this.emitDraft(); }
  }
  private hasTargetInstance(): boolean {
    return this.targetId.length > 0 && Number.isSafeInteger(this.targetGeneration) && this.targetGeneration > 0;
  }
  private identitiesMatch(): boolean {
    return this.hasTargetInstance() && this.targetId === this.draft.targetId &&
      this.targetGeneration === this.draft.targetGeneration &&
      this.draftProfileId === this.draft.profileId && this.draftProfileId === this.profileId &&
      this.draftProfileRevision === this.profile.revision;
  }
  private canEdit(): boolean { return this.draftActive && !this.readOnly && this.identitiesMatch(); }
  private emitDraft(): void {
    if (!this.canEdit()) { return; }
    const value = new OutputSettingsDraft();
    value.targetId = this.targetId; value.targetGeneration = this.targetGeneration; value.profileId = this.draftProfileId;
    value.model = this.model; value.host = this.host; value.port = this.port; value.family = this.family;
    value.localPort = this.localPort; value.scheme = this.scheme; value.path = this.path;
    value.serial = SerialOutputPreferences.clone(this.serial);
    value.editRevision = this.editRevision; value.profileRevision = this.draftProfileRevision; value.applicationId = this.applicationId;
    this.onDraftChange(OutputSettingsDraft.copy(value));
  }
  private isApplied(): boolean {
    return this.identitiesMatch() && this.applicationId > 0 && this.applicationId === this.appliedConfigurationId;
  }
  private changed(): void {
    if (!this.canEdit()) { return; }
    this.applicationId = 0; this.onDisarm(this.targetId, this.targetGeneration); this.editRevision++; this.emitDraft();
  }
  private arm(): void {
    if (this.unappliedInputs()) { this.editNotice = '先确认或取消标为未应用的输入，再启用发送。'; return; }
    this.editNotice = '';
    if (!this.canEdit() || this.busy || !this.isApplied() || this.connection !== 'connected' || this.armed) { return; }
    this.onArm(this.targetId, this.targetGeneration);
  }
  private disarm(): void { if (this.hasTargetInstance()) { this.onDisarm(this.targetId, this.targetGeneration); } }
  private disconnect(): void {
    this.connectGeneration++; this.applicationId = 0;
    if (this.hasTargetInstance()) { this.onDisconnect(this.targetId, this.targetGeneration); }
  }
  private connect(): void {
    if (this.unappliedInputs()) { this.editNotice = '先确认或取消标为未应用的输入，再连接。'; return; }
    this.editNotice = '';
    if (!this.canEdit() || this.busy || (this.model.kind === 'serial' && !this.canConnectDraft())) { return; }
    const endpoint: OutputEndpoint = new OutputEndpoint();
    endpoint.host = this.host.trim(); endpoint.port = this.port; endpoint.family = this.family === '2' ? 2 : 1;
    endpoint.localPort = this.localPort; endpoint.scheme = this.scheme === 'wss' ? 'wss' : 'ws'; endpoint.path = this.path;
    endpoint.serial = this.model.kind === 'serial' ? SerialOutputPreferences.clone(this.serial) : null;
    const targetId: string = this.targetId;
    const targetGeneration: number = this.targetGeneration;
    const profileId: string = this.draftProfileId;
    const revision: number = this.editRevision;
    const profileRevision: number = this.draftProfileRevision;
    const generation: number = ++this.connectGeneration;
    const deliverySource: string = this.interactionSource();
    const deliveryToken: number = this.interactionToken(deliverySource);
    const current = (): boolean => this.ownsInteraction(deliveryToken, deliverySource) && this.canEdit() && generation === this.connectGeneration &&
      targetId === this.targetId && targetGeneration === this.targetGeneration && profileId === this.draftProfileId && revision === this.editRevision &&
      profileRevision === this.draftProfileRevision && profileRevision === this.profile.revision;
    this.onConnect(this.model.config(this.profile, targetId), endpoint, targetGeneration).then((identity: number) => {
      if (current()) { this.applicationId = Number.isSafeInteger(identity) && identity > 0 ? identity : 0; this.emitDraft(); }
    }).catch(() => { if (current()) { this.applicationId = 0; this.emitDraft(); } });
  }
  private canEditSerial(): boolean { return this.canEdit() && !this.busy && !this.serialBusy && !this.serialProbeBlocked() && this.connection !== 'connected' && this.connection !== 'connecting'; }
  private canConnectDraft(): boolean {
    if (!this.canEdit() || this.busy || this.serialBusy || this.serialProbeBlocked() || this.unappliedInputs()) { return false; }
    if (this.model.kind !== 'serial') { return this.host.trim().length > 0 && this.port > 0; }
    const capability = this.serialCapabilities.find(item => item.backend === this.serial.backend);
    return capability !== undefined && capability.available && this.serial.portName.length > 0 &&
      (this.serial.backend !== 'official19' || (this.serial.dtr === null && this.serial.rts === null)) &&
      (this.serial.backend !== 'ch34xWriteOnly' || (this.serial.dtr !== null && this.serial.rts !== null));
  }
  private changeSerialBackend(value: string): void {
    if (!this.canEditSerial() || (value !== 'official26' && value !== 'official19' && value !== 'ch34xWriteOnly' && value !== 'usbCdc')) { return; }
    if (this.serial.backend === value) { return; }
    this.serial.backend = value; this.serial.portName = ''; this.changed();
  }
  private selectSerialPort(value: string): void {
    if (!this.canEditSerial() || !this.serialPorts.some(port => port.backend === this.serial.backend && port.portName === value)) { return; }
    this.serial.portName = value; this.changed();
  }
  private serialProbeBlocked(): boolean { return this.serialProbeState.busy || !this.serialProbeState.closeConfirmed || this.serialProbeState.quarantined; }
  private probeSerial(): void { if (this.canEditSerial() && this.serial.backend === 'ch34xWriteOnly' && this.serialPorts.some(port => port.backend === this.serial.backend && port.portName === this.serial.portName)) { this.onProbeSerial(this.targetId, this.targetGeneration); } }
  private refreshSerial(): void { if (this.canEditSerial()) { this.onRefreshSerial(this.targetId, this.targetGeneration, this.serial.backend); } }
  private serialOptions(): SettingsOption[] {
    return this.serialPorts.filter(port => port.backend === this.serial.backend).map(port => new SettingsOption(port.portName,
      port.label + (port.vendorId === null || port.productId === null ? '' : ' · VID ' + port.vendorId.toString(16) + ' / PID ' + port.productId.toString(16)) + (port.writeOnly ? ' · 仅写实验' : '')));
  }
  private serialCapabilityText(): string {
    const capability = this.serialCapabilities.find(item => item.backend === this.serial.backend);
    if (capability === undefined) { return '尚未检查能力，请明确刷新本机端口。'; }
    if (capability.available && this.serial.backend === 'ch34xWriteOnly') { return '实验性 CH340/CH341 仅写：仅 VID 1a86 / PID 7523 或 5523，严格描述符与 ROM 0x30。尚未真机验收，不保证所有克隆芯片兼容。'; }
    if (capability.available) { return '本机有此后端能力，硬件收发仍未验收；本地写成功不是设备执行确认。'; }
    if (capability.diagnostic === 'cdcShortPacketContractUnverified') { return 'CDC 的短包与接收语义未证明，当前不可连接。'; }
    return '此设备没有该原生串口能力。19/26 服务主要面向 PC/2in1；手机和平板请选择 USB 后端并核对支持状态。';
  }
  build() {
    Column({ space: 6 }) {
      Text(this.model.kind === 'serial' ? '串口输出 · 手动连接' : '网络输出 · 手动连接').fontSize(UiStyle.section).fontWeight(FontWeight.Medium).fontColor(UiStyle.ink).width('100%')
      Text((this.model.kind === 'serial' ? 'Serial · ' : 'TCP / UDP / WebSocket · ') + t(this.connection) + (this.armed ? (this.dispatchSuspended ? ' · 待命，无输出' : ' · 发送门开放') : ' · 未启用发送')).fontSize(UiStyle.body(this.compact))
      // Connection destination is always first and never hidden in an accordion.
      Column({ space: 4 }) {
        if (this.model.kind === 'serial') {
          if (this.serialOptions().length > 0) {
            SettingsChoiceField({ compact: this.compact, editable: this.canEditSerial(), label: '串口端口', selected: this.serial.portName, options: this.serialOptions(), onSelect: this.guardedChoice((value: string): void => this.selectSerialPort(value))})
          }
          Text(this.serial.portName.length === 0 ? '尚未选择端口' : '保存的端口提示：' + this.serial.portName).fontSize(UiStyle.helper).fontColor(UiStyle.ink).width('100%').wordBreak(WordBreak.BREAK_ALL)
          SettingsNumberField({ draftOwner: this.draftOwner, draftScope: this.draftScope, draftEpoch: this.draftEpoch + this.rawDraftEpoch, compact: this.compact, editable: this.canEditSerial(), draftKey: 'baudRate', draftSource: this.model.kind + ':' + this.serial.backend, label: '波特率', value: this.serial.baudRate, minimum: 1, maximum: 4000000, integer: true, onCommit: this.guardedNumber((value: number): boolean => this.commitBaud(value))})
          Button(this.serialBusy ? '正在刷新本机端口' : '刷新本机串口 / USB 候选').fontSize(UiStyle.body(this.compact)).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%', minWidth: UiStyle.control }).width('100%').enabled(this.canEditSerial()).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).type(ButtonType.Normal).borderRadius(UiStyle.radius).fontColor(UiStyle.ink).backgroundColor(UiStyle.field).border({ width: 1, color: UiStyle.edge })
            .stateStyles({
              focused: { .outline({ width: 2, color: UiStyle.accent }) },
              disabled: { .opacity(UiStyle.disabledOpacity) }
            }).onClick(this.guardedAction(() => this.refreshSerial()))
        } else {
          SettingsTextField({ draftOwner: this.draftOwner, draftScope: this.draftScope, draftKey: 'host', draftEpoch: this.draftEpoch + this.rawDraftEpoch,
            label: '目标主机 / IP · 不含凭据', value: this.host, compact: this.compact, editable: this.canEditEndpoint(),
            onCommit: this.guardedText((value: string): boolean => this.commitHost(value)) })
          SettingsNumberField({ draftOwner: this.draftOwner, draftScope: this.draftScope, draftEpoch: this.draftEpoch + this.rawDraftEpoch, compact: this.compact, editable: this.canEditEndpoint(), draftKey: 'port', draftSource: this.model.kind + ':' + this.serial.backend, label: '目标端口', value: this.port, minimum: 1, maximum: 65535, integer: true, onCommit: this.guardedNumber((value: number): boolean => this.commitPort(value))})
        }
      }.width('100%').padding({ top: 4, bottom: 4 })
      if (this.editingBlockReason().length > 0) { Text(this.editingBlockReason()).fontSize(UiStyle.helper).fontColor(UiStyle.warning).width('100%').wordBreak(WordBreak.BREAK_ALL) }
      Flex({ direction: FlexDirection.Row, wrap: FlexWrap.Wrap, alignItems: ItemAlign.Center }) {
        Button('连接 / 应用配置').fontSize(UiStyle.body(this.compact))
          .type(ButtonType.Normal).buttonStyle(ButtonStyleMode.NORMAL).controlSize(ControlSize.NORMAL).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 14, right: 14, top: 6, bottom: 6 }).borderRadius(UiStyle.radius).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%', minWidth: UiStyle.control }).margin({ right: 8, bottom: 4 }).enabled(this.canEditEndpoint() && this.canConnectDraft()).fontColor(UiStyle.field).backgroundColor(UiStyle.accent).border({ width: 1, color: UiStyle.accent })
          .stateStyles({
            focused: { .outline({ width: 2, color: UiStyle.accent }) },
            disabled: { .opacity(UiStyle.disabledOpacity) }
          }).onClick(this.guardedAction(() => this.connectFromPanel()))
        Button('断开 / 编辑连接').fontSize(UiStyle.body(this.compact))
          .type(ButtonType.Normal).buttonStyle(ButtonStyleMode.NORMAL).controlSize(ControlSize.NORMAL).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 14, right: 14, top: 6, bottom: 6 }).borderRadius(UiStyle.radius).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%', minWidth: UiStyle.control }).margin({ bottom: 4 }).fontColor(UiStyle.danger).backgroundColor(UiStyle.field).border({ width: 1, color: UiStyle.edge })
          .stateStyles({
            focused: { .outline({ width: 2, color: UiStyle.accent }) },
            disabled: { .opacity(UiStyle.disabledOpacity) }
          }).onClick(this.guardedAction(() => this.disconnect()))
        Button('启用发送').fontSize(UiStyle.body(this.compact))
          .type(ButtonType.Normal).buttonStyle(ButtonStyleMode.NORMAL).controlSize(ControlSize.NORMAL).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 14, right: 14, top: 6, bottom: 6 }).borderRadius(UiStyle.radius).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%', minWidth: UiStyle.control }).margin({ right: 8, bottom: 4 }).enabled(!this.unappliedInputs() && this.canEdit() && !this.busy && this.isApplied() && this.connection === 'connected' && !this.armed).fontColor(UiStyle.field).backgroundColor(UiStyle.accent).border({ width: 1, color: UiStyle.accent })
          .stateStyles({
            focused: { .outline({ width: 2, color: UiStyle.accent }) },
            disabled: { .opacity(UiStyle.disabledOpacity) }
          }).onClick(this.guardedAction(() => this.arm()))
        Button('解除发送').fontSize(UiStyle.body(this.compact))
          .type(ButtonType.Normal).buttonStyle(ButtonStyleMode.NORMAL).controlSize(ControlSize.NORMAL).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 14, right: 14, top: 6, bottom: 6 }).borderRadius(UiStyle.radius).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%', minWidth: UiStyle.control }).margin({ bottom: 4 }).fontColor(UiStyle.danger).backgroundColor(UiStyle.field).border({ width: 1, color: UiStyle.edge })
          .stateStyles({
            focused: { .outline({ width: 2, color: UiStyle.accent }) },
            disabled: { .opacity(UiStyle.disabledOpacity) }
          }).onClick(this.guardedAction(() => this.disarm()))
      }
      Text('连接 ≠ 启用发送；地址和数字输入请按确认或 Enter。').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%')
      if (this.connectionBlockReason().length > 0 && this.connectionBlockReason() !== this.editingBlockReason()) { Text(this.connectionBlockReason()).fontSize(UiStyle.helper).fontColor(UiStyle.warning).width('100%').wordBreak(WordBreak.BREAK_ALL) }
      if (this.editNotice.length > 0) { Text(this.editNotice).fontSize(UiStyle.helper).fontColor(UiStyle.warning).width('100%') }
      if (this.diagnostic.length > 0) { Text(this.diagnostic).fontSize(UiStyle.helper).fontColor(UiStyle.danger) }
      // Active errors and cleanup/cancel remain reachable with every section closed.
      if (this.model.kind === 'serial') {
        if (this.serialMessage.length > 0) { Text(this.serialMessage).fontSize(UiStyle.helper).fontColor(UiStyle.warning).width('100%').wordBreak(WordBreak.BREAK_ALL) }
        if (this.serialProbeState.phase !== 'idle' || this.serialProbeState.diagnosticCode.length > 0 || this.serialProbeBlocked()) {
          Text('识别状态：' + t(this.serialProbeState.phase) + ' · ' + this.serialProbeState.diagnosticCode + (this.serialProbeState.quarantined ? '\n关闭未确认，设备连接和发送保持隔离；请结束应用后重新检查。' : '')).fontSize(UiStyle.helper).fontColor(UiStyle.danger).width('100%').wordBreak(WordBreak.BREAK_ALL)
        }
        if (this.serialProbeNotice.length > 0) { Text(this.serialProbeNotice).fontSize(UiStyle.helper).fontColor(UiStyle.warning).width('100%') }
        if (this.serialProbeState.busy) {
          Button('取消识别 · 等待清理').fontSize(UiStyle.body(this.compact)).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%', minWidth: UiStyle.control }).width('100%').stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).type(ButtonType.Normal).borderRadius(UiStyle.radius).fontColor(UiStyle.ink).backgroundColor(UiStyle.field).border({ width: 1, color: UiStyle.edge })
            .stateStyles({
              focused: { .outline({ width: 2, color: UiStyle.accent }) },
              disabled: { .opacity(UiStyle.disabledOpacity) }
            }).onClick(this.guardedAction(() => this.onCancelSerialProbe()))
        }
      }
      Button((this.connectionDetailsExpanded ? '⌃ ' : '⌄ ') + (this.model.kind === 'serial' ? '连接设置 · 后端 / 控制线 / 识别' : '连接设置 · ' + (this.model.kind === 'webSocket' ? 'WS / WSS / 路径' : this.model.kind === 'udp' ? '地址族 / 本地端口' : '地址族'))).fontSize(UiStyle.body(this.compact)).fontWeight(FontWeight.Medium)
        .constraintSize({ minHeight: UiStyle.control, maxWidth: '100%', minWidth: UiStyle.control }).width('100%').stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip })
        .type(ButtonType.Normal).borderRadius(UiStyle.radius).fontColor(UiStyle.ink).backgroundColor(UiStyle.field).border({ width: 1, color: UiStyle.edge })
        .accessibilityText(((this.model.kind === 'serial' ? '连接设置 · 后端 / 控制线 / 识别' : '连接设置 · ' + (this.model.kind === 'webSocket' ? 'WS / WSS / 路径' : this.model.kind === 'udp' ? '地址族 / 本地端口' : '地址族'))) + (this.connectionDetailsExpanded ? '，已展开，点击收起' : '，已收起，点击展开'))
        .stateStyles({
          focused: { .outline({ width: 2, color: UiStyle.accent }) },
          disabled: { .opacity(UiStyle.disabledOpacity) }
        }).onClick(this.disclosureHandler('connection'))
      if (this.connectionDetailsExpanded) {
        Column({ space: 4 }) {
          if (this.model.kind === 'serial') {
            SettingsChoiceField({ compact: this.compact, editable: this.canEditSerial(), label: '串口后端', selected: this.serial.backend, options: [new SettingsOption('ch34xWriteOnly', 'USB CH340/341 · 仅写实验'), new SettingsOption('official26', '系统串口 26 · PC/2in1'), new SettingsOption('official19', '系统串口 19 · PC/2in1'), new SettingsOption('usbCdc', 'USB CDC · 当前不可用')], onSelect: this.guardedChoice((value: string): void => this.changeSerialBackend(value), 'connection')})
            Text(this.serialCapabilityText()).fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%')
            Text('当前实现 8 data bits / No parity / 1 stop bit / No handshake。原版其他格式尚未接入；不支持的波特率会拒绝连接。').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%')
            SettingsChoiceField({ compact: this.compact, editable: this.canEditSerial(), label: 'DTR', selected: this.serial.dtr === null ? 'os' : this.serial.dtr ? 'on' : 'off', options: [new SettingsOption('on', '启用（原版默认）'), new SettingsOption('off', '关闭'), new SettingsOption('os', '明确接受系统管理')], onSelect: this.guardedChoice((value: string): void => { if (!this.canEditSerial()) { return; } this.serial.dtr = value === 'os' ? null : value === 'on'; this.changed(); }, 'connection')})
            SettingsChoiceField({ compact: this.compact, editable: this.canEditSerial(), label: 'RTS', selected: this.serial.rts === null ? 'os' : this.serial.rts ? 'on' : 'off', options: [new SettingsOption('on', '启用（原版默认）'), new SettingsOption('off', '关闭'), new SettingsOption('os', '明确接受系统管理')], onSelect: this.guardedChoice((value: string): void => { if (!this.canEditSerial()) { return; } this.serial.rts = value === 'os' ? null : value === 'on'; this.changed(); }, 'connection')})
            if (this.serial.backend === 'ch34xWriteOnly') { Text('CH 实验后端必须明确选择 DTR/RTS 启用或关闭，不能选系统管理；未明确设置时不允许连接。').fontSize(UiStyle.helper).fontColor(UiStyle.danger).width('100%') }
            if (this.serial.backend === 'official19') { Text('系统串口 19 无法控制 DTR/RTS；两项均须由你明确选择系统管理，才允许连接。').fontSize(UiStyle.helper).fontColor(UiStyle.danger).width('100%') }
            if (this.serial.backend === 'ch34xWriteOnly') {
              Text('只读识别：授权后仅读 USB 描述符与 ROM；不初始化串口，不发送轴数据。请先断开全部输出。最多等待 15 秒；取消仍需等待真实清理。').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%')
              Button('授权并只读识别设备').fontSize(UiStyle.body(this.compact)).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%', minWidth: UiStyle.control }).width('100%').enabled(this.canEditSerial() && this.serialPorts.some(port => port.backend === this.serial.backend && port.portName === this.serial.portName)).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).type(ButtonType.Normal).borderRadius(UiStyle.radius).fontColor(UiStyle.ink).backgroundColor(UiStyle.field).border({ width: 1, color: UiStyle.edge })
                .stateStyles({
                  focused: { .outline({ width: 2, color: UiStyle.accent }) },
                  disabled: { .opacity(UiStyle.disabledOpacity) }
                }).onClick(this.guardedAction(() => this.probeSerial(), 'connection'))
              if (this.serialProbeState.report.length > 0) {
                Text(this.serialProbeState.report).fontSize(UiStyle.helper).width('100%').wordBreak(WordBreak.BREAK_ALL)
                Button('复制诊断报告 · 覆盖剪贴板').fontSize(UiStyle.body(this.compact)).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%', minWidth: UiStyle.control }).width('100%').stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).type(ButtonType.Normal).borderRadius(UiStyle.radius).fontColor(UiStyle.ink).backgroundColor(UiStyle.field).border({ width: 1, color: UiStyle.edge })
                  .stateStyles({
                    focused: { .outline({ width: 2, color: UiStyle.accent }) },
                    disabled: { .opacity(UiStyle.disabledOpacity) }
                  }).onClick(this.guardedAction(() => this.onCopySerialProbe(), 'connection'))
              }
            }
            Text('刷新不申请权限或打开。连接时可能显示系统授权；拒绝后不会自动重试。先连接观察状态，明确启用发送前不会发送轴命令；打开/控制线切换仍可能重置外接板。拔插后需要重新连接与 Arm。').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%')
            Text('CH340/341 当前仅写部分实现，设备按钮、轴输入、接收数据与执行 ACK 未接；CH343/CH9102、CP210x、FTDI 不冒充已支持。').fontSize(UiStyle.helper).fontColor(UiStyle.danger).width('100%')
          } else {
            if (this.model.kind === 'webSocket') {
              SettingsChoiceField({ compact: this.compact, editable: this.canEditEndpoint(), label: 'WebSocket scheme', selected: this.scheme, options: [new SettingsOption('ws'), new SettingsOption('wss')], onSelect: this.guardedChoice((value: string): void => { if (!this.canEditEndpoint()) { return; } this.scheme = value; this.changed(); }, 'connection')})
              SettingsTextField({ draftGuard: this.disclosureDraftGuard('connection'), draftOwner: this.draftOwner, draftScope: this.draftScope, draftKey: 'path', draftEpoch: this.draftEpoch + this.rawDraftEpoch,
                label: 'WebSocket 路径 · 不含 query、token 或认证', value: this.path, compact: this.compact, editable: this.canEditEndpoint(),
                onCommit: this.guardedText((value: string): boolean => { if (!this.canEditEndpoint()) { return false; } this.path = value; this.changed(); return true; }, 'connection') })
            } else {
              SettingsChoiceField({ compact: this.compact, editable: this.canEditEndpoint(), label: 'IP 地址族', selected: this.family, options: [new SettingsOption('1', 'IPv4'), new SettingsOption('2', 'IPv6')], onSelect: this.guardedChoice((value: string): void => { if (!this.canEditEndpoint()) { return; } this.family = value; this.changed(); }, 'connection')})
            }
            if (this.model.kind === 'udp') {
              SettingsNumberField({ draftGuard: this.disclosureDraftGuard('connection'), draftOwner: this.draftOwner, draftScope: this.draftScope, draftEpoch: this.draftEpoch + this.rawDraftEpoch, compact: this.compact, editable: this.canEditEndpoint(), draftKey: 'localPort', draftSource: this.model.kind + ':' + this.serial.backend, label: 'UDP 本地端口（0 自动分配）', value: this.localPort, minimum: 0, maximum: 65535, integer: true, onCommit: this.guardedNumber((value: number): boolean => { if (!this.canEditEndpoint()) { return false; } this.localPort = value; this.changed(); return true; }, 'connection')})
            }
          }
        }.width('100%').padding({ top: 4, bottom: 8 })
      }
      Button((this.timingExpanded ? '⌃ ' : '⌄ ') + ('发送时序 / 暂停权限 · ' + (this.model.polled ? 'Polled' : 'Fixed ' + this.model.intervalMs + ' ms'))).fontSize(UiStyle.body(this.compact)).fontWeight(FontWeight.Medium)
        .constraintSize({ minHeight: UiStyle.control, maxWidth: '100%', minWidth: UiStyle.control }).width('100%').stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip })
        .type(ButtonType.Normal).borderRadius(UiStyle.radius).fontColor(UiStyle.ink).backgroundColor(UiStyle.field).border({ width: 1, color: UiStyle.edge })
        .accessibilityText((('发送时序 / 暂停权限 · ' + (this.model.polled ? 'Polled' : 'Fixed ' + this.model.intervalMs + ' ms'))) + (this.timingExpanded ? '，已展开，点击收起' : '，已收起，点击展开'))
        .stateStyles({
          focused: { .outline({ width: 2, color: UiStyle.accent }) },
          disabled: { .opacity(UiStyle.disabledOpacity) }
        }).onClick(this.disclosureHandler('timing'))
      if (this.timingExpanded) {
        Column({ space: 4 }) {
          SettingsSwitchField({ compact: this.compact, editable: this.canEdit(), label: 'Polled 事件模式', value: this.model.polled, onChange: this.guardedFlag((value: boolean): void => { if (!this.canEdit()) { return; } this.model.polled = value; this.changed(); }, 'timing')})
          if (!this.model.polled) {
            SettingsNumberField({ draftGuard: this.disclosureDraftGuard('timing'), draftOwner: this.draftOwner, draftScope: this.draftScope, draftEpoch: this.draftEpoch + this.rawDraftEpoch, compact: this.compact, editable: this.canEdit(), draftKey: 'intervalMs', draftSource: this.model.kind + ':' + this.serial.backend, label: '固定间隔 ms', value: this.model.intervalMs, minimum: this.model.kind === 'webSocket' ? 16 : 3, maximum: this.model.kind === 'webSocket' ? 200 : 33, onCommit: this.guardedNumber((value: number): boolean => { if (!this.canEdit()) { return false; } this.model.intervalMs = value; this.changed(); return true; }, 'timing')})
            SettingsSwitchField({ compact: this.compact, editable: this.canEdit(), label: '只发送变化值', value: this.model.dirtyOnly, onChange: this.guardedFlag((value: boolean): void => { if (!this.canEdit()) { return; } this.model.dirtyOnly = value; this.changed(); }, 'timing')})
            SettingsSwitchField({ compact: this.compact, editable: this.canEdit(), label: '设备处理时间（省略 I）', value: this.model.offloadElapsed, onChange: this.guardedFlag((value: boolean): void => { if (!this.canEdit()) { return; } this.model.offloadElapsed = value; this.changed(); }, 'timing')})
          }
          SettingsSwitchField({ compact: this.compact, editable: this.canEdit(), label: '允许暂停时 Auto Home', value: this.model.pausedAutoHome, onChange: this.guardedFlag((value: boolean): void => { if (!this.canEdit()) { return; } this.model.pausedAutoHome = value; this.changed(); }, 'timing')})
          SettingsSwitchField({ compact: this.compact, editable: this.canEdit(), label: '允许暂停时 Motion', value: this.model.pausedMotion, onChange: this.guardedFlag((value: boolean): void => { if (!this.canEdit()) { return; } this.model.pausedMotion = value; this.changed(); }, 'timing')})
          SettingsSwitchField({ compact: this.compact, editable: this.canEdit() && !this.model.polled, label: '暂停手动过渡输出', value: this.model.pausedManual, onChange: this.guardedFlag((value: boolean): void => { if (!this.canEdit() || this.model.polled) { return; } this.model.pausedManual = value; this.changed(); }, 'timing')})
          if (this.model.polled) {
            Text('暂停手动过渡输出不可用：原版手动 Transition 不产生 Polled 事件，请切换 Fixed 固定间隔模式。').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
          }
          Text('暂停手动过渡需明确预览 / 开始并单独启用发送（Arm）；仅 Set 修改值不会开始，也不会 Arm。与 Motion 权限独立。').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
          Text('手动预览中明确 Arm 可待命，无输出；只有真实手动 Transition 当前帧通过检查后才发送。停止、后台或配置变更会撤销待命。').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
          Text('暂停策略还需当前帧来源授权；无有效来源时始终停止发送。精确睡眠暂不支持。').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
        }.width('100%').padding({ top: 4, bottom: 8 })
      }
      Button((this.rangesExpanded ? '⌃ ' : '⌄ ') + ('输出范围 · ' + this.model.ranges.filter(range => range.enabled).length + ' / ' + this.model.ranges.length + ' 轴启用')).fontSize(UiStyle.body(this.compact)).fontWeight(FontWeight.Medium)
        .constraintSize({ minHeight: UiStyle.control, maxWidth: '100%', minWidth: UiStyle.control }).width('100%').stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip })
        .type(ButtonType.Normal).borderRadius(UiStyle.radius).fontColor(UiStyle.ink).backgroundColor(UiStyle.field).border({ width: 1, color: UiStyle.edge })
        .accessibilityText((('输出范围 · ' + this.model.ranges.filter(range => range.enabled).length + ' / ' + this.model.ranges.length + ' 轴启用')) + (this.rangesExpanded ? '，已展开，点击收起' : '，已收起，点击展开'))
        .stateStyles({
          focused: { .outline({ width: 2, color: UiStyle.accent }) },
          disabled: { .opacity(UiStyle.disabledOpacity) }
        }).onClick(this.disclosureHandler('ranges'))
      if (this.rangesExpanded) {
        Column({ space: 4 }) {
          ForEach(this.model.ranges, (range: AxisRange) => {
            Column({ space: UiStyle.gap(this.compact) }) {
              Text(range.minimum > range.maximum ? '反向映射：输入 0 → ' + range.minimum + '，输入 1 → ' + range.maximum : '正向 / 恒定映射：输入 0 → ' + range.minimum + '，输入 1 → ' + range.maximum).fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
              SettingsSwitchField({ compact: this.compact, editable: this.canEdit(), label: range.axisId + ' 输出', value: range.enabled, onChange: this.guardedFlag((value: boolean): void => { if (!this.canEdit()) { return; } this.model.setRange(range.axisId, range.minimum, range.maximum, value); this.changed(); }, 'ranges')})
              SettingsNumberField({ draftGuard: this.disclosureDraftGuard('ranges'), draftOwner: this.draftOwner, draftScope: this.draftScope, draftEpoch: this.draftEpoch + this.rawDraftEpoch, compact: this.compact, editable: this.canEdit(), draftKey: 'range:' + range.axisId + ':minimum', label: range.axisId + ' Minimum（输入 0）', value: range.minimum, minimum: 0, maximum: 1, onCommit: this.guardedNumber((value: number): boolean => { if (!this.canEdit()) { return false; } const ok: boolean = this.model.setRange(range.axisId, value, range.maximum, range.enabled); if (ok) { this.changed(); } return ok; }, 'ranges')})
              SettingsNumberField({ draftGuard: this.disclosureDraftGuard('ranges'), draftOwner: this.draftOwner, draftScope: this.draftScope, draftEpoch: this.draftEpoch + this.rawDraftEpoch, compact: this.compact, editable: this.canEdit(), draftKey: 'range:' + range.axisId + ':maximum', label: range.axisId + ' Maximum（输入 1）', value: range.maximum, minimum: 0, maximum: 1, onCommit: this.guardedNumber((value: number): boolean => { if (!this.canEdit()) { return false; } const ok: boolean = this.model.setRange(range.axisId, range.minimum, value, range.enabled); if (ok) { this.changed(); } return ok; }, 'ranges')})
            }
          }, (range: AxisRange) => range.axisId + ':' + this.editRevision)
          Text('仅启用需要的输出轴；Fixed 模式下每个启用轴都须有已验证来源。').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
        }.width('100%').padding({ top: 4, bottom: 8 })
      }
      Button((this.helpExpanded ? '⌃ ' : '⌄ ') + '说明 / 输入管理').fontSize(UiStyle.body(this.compact)).fontWeight(FontWeight.Medium)
        .constraintSize({ minHeight: UiStyle.control, maxWidth: '100%', minWidth: UiStyle.control }).width('100%').stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip })
        .type(ButtonType.Normal).borderRadius(UiStyle.radius).fontColor(UiStyle.ink).backgroundColor(UiStyle.field).border({ width: 1, color: UiStyle.edge })
        .accessibilityText(('说明 / 输入管理') + (this.helpExpanded ? '，已展开，点击收起' : '，已收起，点击展开'))
        .stateStyles({
          focused: { .outline({ width: 2, color: UiStyle.accent }) },
          disabled: { .opacity(UiStyle.disabledOpacity) }
        }).onClick(this.disclosureHandler('help'))
      if (this.helpExpanded) {
        Column({ space: 4 }) {
          Text('本地完成写入 ' + this.completedLocalWrites + ' 次 / ' + this.locallyAcceptedBytes + ' bytes。不是设备执行确认；UDP 连接仅表示本地绑定。').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
          Text('协议 · ' + t(this.model.kind === 'webSocket' ? 'WebSocket' : this.model.kind.toUpperCase()) + '（类型固定；需要其他协议时请添加输出）').fontSize(UiStyle.body(this.compact))
          if (this.model.kind === 'serial') {
            Text('串口目前通过本面板连接和编辑范围；串口目标的快捷键/触控动作映射尚未接入，全局停止仍有效。').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%')
            Text('可保存多个串口目标；首版全应用同时只打开一个串口，避免不同后端占用同一硬件。网络目标仍独立。').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%')
          }
          Text('有效配置会保存；恢复不会自动连接或启用发送。编辑会解除发送，连接后需单独启用。').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
          Text('文字与数字输入需按确认或 Enter；未应用时不会保存，连接与启用发送会等待确认或取消。').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%')
          Text('若来源历史持续无效，可刷新 Download 媒体文件夹：停止播放、重建运行时并重置 Motion 相位。之后重选媒体、应用输出配置，再明确启用发送。').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
          Text('File / Handy / Buttplug / Pipe 尚未实现；串口按所选后端能力开放，硬件执行尚未验证。').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
          Column({ space: 4 }) {
            Text('未应用输入（含选项切换后隐藏的字段）不会连接或发送；可逐项确认，或在此全部取消。').fontSize(UiStyle.helper).fontColor(UiStyle.danger).width('100%')
            Button('取消本目标全部未应用输入').fontSize(UiStyle.body(this.compact)).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%', minWidth: UiStyle.control }).width('100%').enabled(this.canEdit()).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).type(ButtonType.Normal).borderRadius(UiStyle.radius).fontColor(UiStyle.ink).backgroundColor(UiStyle.field).border({ width: 1, color: UiStyle.edge })
              .stateStyles({
                focused: { .outline({ width: 2, color: UiStyle.accent }) },
                disabled: { .opacity(UiStyle.disabledOpacity) }
              }).onClick(this.guardedAction(() => this.cancelUnappliedInputs(), 'help'))
          }
        }.width('100%').padding({ top: 4, bottom: 8 })
      }
    }.width('100%').padding({ top: 4, bottom: 8 }).alignItems(HorizontalAlign.Start)
  }
}
