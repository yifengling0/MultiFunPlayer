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
import { SettingsNumberField, SettingsSwitchField, SettingsChoiceField, SettingsOption } from './CurvePointEditor';

@Component
export struct OutputSettingsPanel {
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
  onConnect: (config: OutputTargetConfig, endpoint: OutputEndpoint, targetGeneration: number) => Promise<number> = async (_config: OutputTargetConfig, _endpoint: OutputEndpoint, _targetGeneration: number): Promise<number> => 0;
  onDraftChange: (draft: OutputSettingsDraft) => void = (_draft: OutputSettingsDraft): void => {};
  onDisconnect: (targetId: string, targetGeneration: number) => void = (_targetId: string, _targetGeneration: number): void => {};
  onArm: (targetId: string, targetGeneration: number) => void = (_targetId: string, _targetGeneration: number): void => {};
  onDisarm: (targetId: string, targetGeneration: number) => void = (_targetId: string, _targetGeneration: number): void => {};
  aboutToAppear(): void { KeyboardInputSession.releaseEditor(this.hostEditorId); KeyboardInputSession.releaseEditor(this.pathEditorId); this.hostEditorId = KeyboardInputSession.newEditorId(); this.pathEditorId = KeyboardInputSession.newEditorId(); this.restoreDraft(); }
  aboutToDisappear(): void { this.connectGeneration++; KeyboardInputSession.releaseEditor(this.hostEditorId); KeyboardInputSession.releaseEditor(this.pathEditorId); }
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
  private canEdit(): boolean { return !this.readOnly && this.identitiesMatch(); }
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
    if (!this.canEdit() || this.busy || !this.isApplied() || this.connection !== 'connected' || this.armed) { return; }
    this.onArm(this.targetId, this.targetGeneration);
  }
  private disarm(): void { if (this.hasTargetInstance()) { this.onDisarm(this.targetId, this.targetGeneration); } }
  private disconnect(): void {
    this.connectGeneration++; this.applicationId = 0;
    if (this.hasTargetInstance()) { this.onDisconnect(this.targetId, this.targetGeneration); }
  }
  private connect(): void {
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
    const current = (): boolean => this.canEdit() && generation === this.connectGeneration &&
      targetId === this.targetId && targetGeneration === this.targetGeneration && profileId === this.draftProfileId && revision === this.editRevision &&
      profileRevision === this.draftProfileRevision && profileRevision === this.profile.revision;
    this.onConnect(this.model.config(this.profile, targetId), endpoint, targetGeneration).then((identity: number) => {
      if (current()) { this.applicationId = Number.isSafeInteger(identity) && identity > 0 ? identity : 0; this.emitDraft(); }
    }).catch(() => { if (current()) { this.applicationId = 0; this.emitDraft(); } });
  }
  private canEditSerial(): boolean { return this.canEdit() && !this.busy && !this.serialBusy && !this.serialProbeBlocked() && this.connection !== 'connected' && this.connection !== 'connecting'; }
  private canConnectDraft(): boolean {
    if (!this.canEdit() || this.busy || this.serialBusy || this.serialProbeBlocked()) { return false; }
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
    Column({ space: UiStyle.gap(this.compact) }) {
      Text(this.model.kind === 'serial' ? '串口输出 · 手动连接' : '网络输出 · 手动连接').fontSize(UiStyle.heading).fontWeight(FontWeight.Bold)
      Text((this.model.kind === 'serial' ? 'Serial · ' : 'TCP / UDP / WebSocket · ') + this.connection + (this.armed ? (this.dispatchSuspended ? ' · 待命，无输出' : ' · 发送门开放') : ' · 未启用发送')).fontSize(UiStyle.body(this.compact))
      Text('本地完成写入 ' + this.completedLocalWrites + ' 次 / ' + this.locallyAcceptedBytes + ' bytes。不是设备执行确认；UDP 连接仅表示本地绑定。').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
      Text('协议 · ' + (this.model.kind === 'webSocket' ? 'WebSocket' : this.model.kind.toUpperCase()) + '（类型固定；需要其他协议时请添加输出）').fontSize(UiStyle.body(this.compact))
      if (this.model.kind === 'serial') {
        Text('串口目前通过本面板连接和编辑范围；串口目标的快捷键/触控动作映射尚未接入，全局停止仍有效。').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%')
        Text('可保存多个串口目标；首版全应用同时只打开一个串口，避免不同后端占用同一硬件。网络目标仍独立。').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%')
        SettingsChoiceField({ compact: this.compact, editable: this.canEditSerial(), label: '串口后端', selected: this.serial.backend, options: [new SettingsOption('ch34xWriteOnly', 'USB CH340/341 · 仅写实验'), new SettingsOption('official26', '系统串口 26 · PC/2in1'), new SettingsOption('official19', '系统串口 19 · PC/2in1'), new SettingsOption('usbCdc', 'USB CDC · 当前不可用')], onSelect: (value: string): void => this.changeSerialBackend(value) })
        Text(this.serialCapabilityText()).fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%')
        Button(this.serialBusy ? '正在刷新本机端口' : '刷新本机串口 / USB 候选').fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.ink).backgroundColor(UiStyle.accentSoft).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).width('100%').enabled(this.canEditSerial()).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).onClick(() => this.refreshSerial())
        if (this.serialPorts.length > 0) {
          SettingsChoiceField({ compact: this.compact, editable: this.canEditSerial(), label: '本次列表端口', selected: this.serial.portName, options: this.serialOptions(), onSelect: (value: string): void => this.selectSerialPort(value) })
        }
        Text(this.serial.portName.length === 0 ? '尚未选择端口' : '保存的端口提示：' + this.serial.portName).fontSize(UiStyle.helper).fontColor(UiStyle.ink).width('100%').wordBreak(WordBreak.BREAK_ALL)
        if (this.serial.backend === 'ch34xWriteOnly') {
          Text('只读识别：授权后仅读 USB 描述符与 ROM；不初始化串口，不发送轴数据。请先断开全部输出。最多等待 15 秒；取消仍需等待真实清理。').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%')
          Button('授权并只读识别设备').fontSize(UiStyle.body(this.compact)).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).width('100%').enabled(this.canEditSerial() && this.serialPorts.some(port => port.backend === this.serial.backend && port.portName === this.serial.portName)).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).onClick(() => this.probeSerial())
          if (this.serialProbeState.busy) { Button('取消识别 · 等待清理').fontSize(UiStyle.body(this.compact)).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).width('100%').stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).onClick(() => this.onCancelSerialProbe()) }
          Text('识别状态：' + this.serialProbeState.phase + ' · ' + this.serialProbeState.diagnosticCode + (this.serialProbeState.quarantined ? '\n关闭未确认，设备连接和发送保持隔离；请结束应用后重新检查。' : '')).fontSize(UiStyle.helper).fontColor(UiStyle.danger).width('100%').wordBreak(WordBreak.BREAK_ALL)
          Text(this.serialProbeNotice).fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%')
          if (this.serialProbeState.report.length > 0) {
            Text(this.serialProbeState.report).fontSize(UiStyle.helper).width('100%').wordBreak(WordBreak.BREAK_ALL)
            Button('复制诊断报告 · 覆盖剪贴板').fontSize(UiStyle.body(this.compact)).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).width('100%').stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).onClick(() => this.onCopySerialProbe())
          }
        }
        Text(this.serialMessage).fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%')
        SettingsNumberField({ compact: this.compact, editable: this.canEditSerial(), label: '波特率', value: this.serial.baudRate, minimum: 1, maximum: 4000000, integer: true, onCommit: (value: number): boolean => { if (!this.canEditSerial()) { return false; } this.serial.baudRate = value; this.changed(); return true; } })
        Text('当前实现 8 data bits / No parity / 1 stop bit / No handshake。原版其他格式尚未接入；不支持的波特率会拒绝连接。').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%')
        SettingsChoiceField({ compact: this.compact, editable: this.canEditSerial(), label: 'DTR', selected: this.serial.dtr === null ? 'os' : this.serial.dtr ? 'on' : 'off', options: [new SettingsOption('on', '启用（原版默认）'), new SettingsOption('off', '关闭'), new SettingsOption('os', '明确接受系统管理')], onSelect: (value: string): void => { if (!this.canEditSerial()) { return; } this.serial.dtr = value === 'os' ? null : value === 'on'; this.changed(); } })
        SettingsChoiceField({ compact: this.compact, editable: this.canEditSerial(), label: 'RTS', selected: this.serial.rts === null ? 'os' : this.serial.rts ? 'on' : 'off', options: [new SettingsOption('on', '启用（原版默认）'), new SettingsOption('off', '关闭'), new SettingsOption('os', '明确接受系统管理')], onSelect: (value: string): void => { if (!this.canEditSerial()) { return; } this.serial.rts = value === 'os' ? null : value === 'on'; this.changed(); } })
        if (this.serial.backend === 'ch34xWriteOnly') { Text('CH 实验后端必须明确选择 DTR/RTS 启用或关闭，不能选系统管理；未明确设置时不允许连接。').fontSize(UiStyle.helper).fontColor(UiStyle.danger).width('100%') }
        if (this.serial.backend === 'official19') { Text('系统串口 19 无法控制 DTR/RTS；两项均须由你明确选择系统管理，才允许连接。').fontSize(UiStyle.helper).fontColor(UiStyle.danger).width('100%') }
        Text('刷新不申请权限或打开。连接时可能显示系统授权；拒绝后不会自动重试。先连接观察状态，明确启用发送前不会发送轴命令；打开/控制线切换仍可能重置外接板。拔插后需要重新连接与 Arm。').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%')
        Text('CH340/341 当前仅写部分实现，设备按钮、轴输入、接收数据与执行 ACK 未接；CH343/CH9102、CP210x、FTDI 不冒充已支持。').fontSize(UiStyle.helper).fontColor(UiStyle.danger).width('100%')
      } else {
      Text('目标主机 / IP · 不含凭据').fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.ink).width('100%')
      TextInput({ text: this.host, placeholder: '目标主机或 IP（不含凭据）' }).fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.ink).backgroundColor(UiStyle.field).border({ width: 1, color: UiStyle.edge }).borderRadius(UiStyle.radius).width('100%').constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).enabled(this.canEdit()).onChange(KeyboardInputSession.changeHandler(this.hostEditorId, (value: string) => { if (!this.canEdit()) { return; } this.host = value; this.changed(); }))
        .onFocus(KeyboardInputSession.focusHandler(this.hostEditorId, true))
        .onBlur(KeyboardInputSession.focusHandler(this.hostEditorId, false))
        .onKeyPreIme(KeyboardInputSession.emergencyHandler(this.hostEditorId))
      SettingsNumberField({ compact: this.compact, editable: this.canEdit(), label: '目标端口', value: this.port, minimum: 1, maximum: 65535, integer: true, onCommit: (value: number): boolean => { if (!this.canEdit()) { return false; } this.port = value; this.changed(); return true; } })
      if (this.model.kind === 'webSocket') {
        SettingsChoiceField({ compact: this.compact, editable: this.canEdit(), label: 'WebSocket scheme', selected: this.scheme, options: [new SettingsOption('ws'), new SettingsOption('wss')], onSelect: (value: string): void => { if (!this.canEdit()) { return; } this.scheme = value; this.changed(); } })
        Text('WebSocket 路径 · 不含 query、token 或认证').fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.ink).width('100%')
        TextInput({ text: this.path, placeholder: '路径 /（无 query、token、认证）' }).fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.ink).backgroundColor(UiStyle.field).border({ width: 1, color: UiStyle.edge }).borderRadius(UiStyle.radius).width('100%').constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).enabled(this.canEdit()).onChange(KeyboardInputSession.changeHandler(this.pathEditorId, (value: string) => { if (!this.canEdit()) { return; } this.path = value; this.changed(); }))
        .onFocus(KeyboardInputSession.focusHandler(this.pathEditorId, true))
        .onBlur(KeyboardInputSession.focusHandler(this.pathEditorId, false))
        .onKeyPreIme(KeyboardInputSession.emergencyHandler(this.pathEditorId))
      } else {
        SettingsChoiceField({ compact: this.compact, editable: this.canEdit(), label: 'IP 地址族', selected: this.family, options: [new SettingsOption('1', 'IPv4'), new SettingsOption('2', 'IPv6')], onSelect: (value: string): void => { if (!this.canEdit()) { return; } this.family = value; this.changed(); } })
      }
      if (this.model.kind === 'udp') {
        SettingsNumberField({ compact: this.compact, editable: this.canEdit(), label: 'UDP 本地端口（0 自动分配）', value: this.localPort, minimum: 0, maximum: 65535, integer: true, onCommit: (value: number): boolean => { if (!this.canEdit()) { return false; } this.localPort = value; this.changed(); return true; } })
      }
      }
      SettingsSwitchField({ compact: this.compact, editable: this.canEdit(), label: 'Polled 事件模式', value: this.model.polled, onChange: (value: boolean): void => { if (!this.canEdit()) { return; } this.model.polled = value; this.changed(); } })
      if (!this.model.polled) {
        SettingsNumberField({ compact: this.compact, editable: this.canEdit(), label: '固定间隔 ms', value: this.model.intervalMs, minimum: this.model.kind === 'webSocket' ? 16 : 3, maximum: this.model.kind === 'webSocket' ? 200 : 33, onCommit: (value: number): boolean => { if (!this.canEdit()) { return false; } this.model.intervalMs = value; this.changed(); return true; } })
        SettingsSwitchField({ compact: this.compact, editable: this.canEdit(), label: '只发送变化值', value: this.model.dirtyOnly, onChange: (value: boolean): void => { if (!this.canEdit()) { return; } this.model.dirtyOnly = value; this.changed(); } })
        SettingsSwitchField({ compact: this.compact, editable: this.canEdit(), label: '设备处理时间（省略 I）', value: this.model.offloadElapsed, onChange: (value: boolean): void => { if (!this.canEdit()) { return; } this.model.offloadElapsed = value; this.changed(); } })
      }
      SettingsSwitchField({ compact: this.compact, editable: this.canEdit(), label: '允许暂停时 Auto Home', value: this.model.pausedAutoHome, onChange: (value: boolean): void => { if (!this.canEdit()) { return; } this.model.pausedAutoHome = value; this.changed(); } })
      SettingsSwitchField({ compact: this.compact, editable: this.canEdit(), label: '允许暂停时 Motion', value: this.model.pausedMotion, onChange: (value: boolean): void => { if (!this.canEdit()) { return; } this.model.pausedMotion = value; this.changed(); } })
      SettingsSwitchField({ compact: this.compact, editable: this.canEdit() && !this.model.polled, label: '暂停手动过渡输出', value: this.model.pausedManual, onChange: (value: boolean): void => { if (!this.canEdit() || this.model.polled) { return; } this.model.pausedManual = value; this.changed(); } })
      if (this.model.polled) {
        Text('暂停手动过渡输出不可用：原版手动 Transition 不产生 Polled 事件，请切换 Fixed 固定间隔模式。').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
      }
      Text('暂停手动过渡需明确预览 / 开始并单独启用发送（Arm）；仅 Set 修改值不会开始，也不会 Arm。与 Motion 权限独立。').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
      Text('手动预览中明确 Arm 可待命，无输出；只有真实手动 Transition 当前帧通过检查后才发送。停止、后台或配置变更会撤销待命。').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
      Text('暂停策略还需当前帧来源授权；无有效来源时始终停止发送。精确睡眠暂不支持。').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
      ForEach(this.model.ranges, (range: AxisRange) => {
        Column({ space: UiStyle.gap(this.compact) }) {
          Text(range.minimum > range.maximum ? '反向映射：输入 0 → ' + range.minimum + '，输入 1 → ' + range.maximum : '正向 / 恒定映射：输入 0 → ' + range.minimum + '，输入 1 → ' + range.maximum).fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
          SettingsSwitchField({ compact: this.compact, editable: this.canEdit(), label: range.axisId + ' 输出', value: range.enabled, onChange: (value: boolean): void => { if (!this.canEdit()) { return; } this.model.setRange(range.axisId, range.minimum, range.maximum, value); this.changed(); } })
          SettingsNumberField({ compact: this.compact, editable: this.canEdit(), label: range.axisId + ' Minimum（输入 0）', value: range.minimum, minimum: 0, maximum: 1, onCommit: (value: number): boolean => { if (!this.canEdit()) { return false; } const ok: boolean = this.model.setRange(range.axisId, value, range.maximum, range.enabled); if (ok) { this.changed(); } return ok; } })
          SettingsNumberField({ compact: this.compact, editable: this.canEdit(), label: range.axisId + ' Maximum（输入 1）', value: range.maximum, minimum: 0, maximum: 1, onCommit: (value: number): boolean => { if (!this.canEdit()) { return false; } const ok: boolean = this.model.setRange(range.axisId, range.minimum, value, range.enabled); if (ok) { this.changed(); } return ok; } })
        }
      }, (range: AxisRange) => range.axisId + ':' + this.editRevision)
      Text('仅启用需要的输出轴；Fixed 模式下每个启用轴都须有已验证来源。').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
      Text('有效配置会保存；恢复不会自动连接或启用发送。编辑会解除发送，连接后需单独启用。').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
      Flex({ direction: FlexDirection.Row, wrap: FlexWrap.Wrap, alignItems: ItemAlign.Center }) {
        Button('连接 / 应用配置').fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.ink).backgroundColor(UiStyle.accentSoft)
          .type(ButtonType.Normal).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 14, right: 14, top: 12, bottom: 12 }).borderRadius(UiStyle.radius).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).margin({ right: 8, bottom: 4 }).enabled(this.canConnectDraft()).fontColor(UiStyle.field).backgroundColor(UiStyle.accent).onClick(() => this.connect())
        Button('断开').fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.ink).backgroundColor(UiStyle.accentSoft)
          .type(ButtonType.Normal).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 14, right: 14, top: 12, bottom: 12 }).borderRadius(UiStyle.radius).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).margin({ bottom: 4 }).fontColor(UiStyle.field).backgroundColor(UiStyle.danger).onClick(() => this.disconnect())
      }
      Flex({ direction: FlexDirection.Row, wrap: FlexWrap.Wrap, alignItems: ItemAlign.Center }) {
        Button('启用发送').fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.ink).backgroundColor(UiStyle.accentSoft)
          .type(ButtonType.Normal).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 14, right: 14, top: 12, bottom: 12 }).borderRadius(UiStyle.radius).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).margin({ right: 8, bottom: 4 }).enabled(this.canEdit() && !this.busy && this.isApplied() && this.connection === 'connected' && !this.armed).fontColor(UiStyle.field).backgroundColor(UiStyle.accent).onClick(() => this.arm())
        Button('解除发送').fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.ink).backgroundColor(UiStyle.accentSoft)
          .type(ButtonType.Normal).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 14, right: 14, top: 12, bottom: 12 }).borderRadius(UiStyle.radius).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).margin({ bottom: 4 }).fontColor(UiStyle.field).backgroundColor(UiStyle.danger).onClick(() => this.disarm())
      }
      if (this.diagnostic.length > 0) { Text(this.diagnostic).fontSize(UiStyle.helper).fontColor(UiStyle.danger) }
      Text('若来源历史持续无效，可刷新 Download 媒体文件夹：停止播放、重建运行时并重置 Motion 相位。之后重选媒体、应用输出配置，再明确启用发送。').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
      Text('File / Handy / Buttplug / Pipe 尚未实现；串口按所选后端能力开放，硬件执行尚未验证。').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
    }.width('100%').padding({ top: UiStyle.padding(this.compact), bottom: UiStyle.padding(this.compact) }).alignItems(HorizontalAlign.Start)
  }
}
