import { ConfirmationRequest } from '../presentation/ConfirmationOwner';
import { SettingsDraftOwner } from '../presentation/SettingsDraftOwner';
import { UiStyle } from '../presentation/UiStyle';
import { KeyboardInputSession } from '../app/KeyboardInputSession';
import { DeviceProfileClipboard } from '../core/DeviceProfileTransfer';
import { NativeDeviceClipboard } from '../settings/NativeDeviceClipboard';
import { DeviceProfile, DeviceAxisDefinition, DeviceProfiles } from '../core/DeviceProfile';
import { SettingsNumberField, SettingsTextField, SettingsSwitchField, SettingsChoiceField, SettingsOption, SettingsSectionTitle } from './CurvePointEditor';

/** Copy-on-edit only. Enabling/disabling an axis never removes its stored axis settings. */
export class DeviceSettingsEdits {
  /** Exact upstream FunscriptNameListToStringConverter: final dotted segment, case-insensitive distinct. */
  static aliases(value: string): string[] {
    const result: string[] = [];
    for (const item of value.split(',')) {
      const segments: string[] = item.split('.').map(segment => segment.trim()).filter(segment => segment.length > 0);
      if (segments.length === 0) { continue; }
      const alias: string = segments[segments.length - 1];
      if (!result.some(previous => previous.toLowerCase() === alias.toLowerCase())) { result.push(alias); }
    }
    return result;
  }
  static precision(profile: DeviceProfile, value: number): DeviceProfile | null {
    if (profile.isBuiltIn) { return null; }
    const next: DeviceProfile = DeviceProfiles.copy(profile); next.outputPrecision = value;
    return DeviceProfiles.validate(next).length === 0 ? next : null;
  }
  static rename(profile: DeviceProfile, name: string): DeviceProfile | null {
    if (profile.isBuiltIn || name.trim().length === 0) { return null; }
    const next: DeviceProfile = DeviceProfiles.copy(profile); next.name = name.trim();
    return DeviceProfiles.validate(next).length === 0 ? next : null;
  }
  static axisFlag(profile: DeviceProfile, index: number, enabled: boolean): DeviceProfile | null {
    if (index < 0 || index >= profile.axes.length) { return null; }
    const next: DeviceProfile = DeviceProfiles.copy(profile); next.axes[index].enabled = enabled;
    return DeviceProfiles.validate(next).length === 0 ? next : null;
  }
  static axisText(profile: DeviceProfile, index: number, field: string, value: string): DeviceProfile | null {
    if (profile.isBuiltIn || index < 0 || index >= profile.axes.length) { return null; }
    const next: DeviceProfile = DeviceProfiles.copy(profile);
    switch (field) {
      case 'name': next.axes[index].name = value.trim(); break;
      case 'friendlyName': next.axes[index].friendlyName = value.trim().length === 0 ? null : value.trim(); break;
      case 'funscriptNames': next.axes[index].funscriptNames = DeviceSettingsEdits.aliases(value); break;
      default: return null;
    }
    return DeviceProfiles.validate(next).length === 0 ? next : null;
  }
  static axisDefault(profile: DeviceProfile, index: number, value: number): DeviceProfile | null {
    if (profile.isBuiltIn || index < 0 || index >= profile.axes.length) { return null; }
    const next: DeviceProfile = DeviceProfiles.copy(profile); next.axes[index].defaultValue = value;
    return DeviceProfiles.validate(next).length === 0 ? next : null;
  }
  static addAxis(profile: DeviceProfile, name: string): DeviceProfile | null {
    if (profile.isBuiltIn) { return null; }
    const next: DeviceProfile = DeviceProfiles.copy(profile); next.axes.push(new DeviceAxisDefinition(name.trim()));
    return DeviceProfiles.validate(next).length === 0 ? next : null;
  }
  static removeAxis(profile: DeviceProfile, index: number): DeviceProfile | null {
    if (profile.isBuiltIn || index < 0 || index >= profile.axes.length) { return null; }
    const next: DeviceProfile = DeviceProfiles.copy(profile); next.axes.splice(index, 1);
    return DeviceProfiles.validate(next).length === 0 ? next : null;
  }
}

/** Draft configuration. The session owns saving, custom ids, deletion and restart activation. */
@Component
export struct DeviceSettingsPanel {
  // Reference ownership is page-local; @Prop would deep-copy and split the draft store.
  draftOwner: SettingsDraftOwner = new SettingsDraftOwner();
  @Prop @Watch('restoreEditorDraft') draftScope: string = '';
  @Prop @Watch('restoreEditorDraft') draftEpoch: number = 0;
  private cloneEditorId: number = KeyboardInputSession.newEditorId();
  private axisEditorId: number = KeyboardInputSession.newEditorId();
  aboutToAppear(): void { KeyboardInputSession.releaseEditor(this.cloneEditorId); KeyboardInputSession.releaseEditor(this.axisEditorId); this.cloneEditorId = KeyboardInputSession.newEditorId(); this.axisEditorId = KeyboardInputSession.newEditorId(); this.draftActive = true; this.restoreEditorDraft(); }
  aboutToDisappear(): void { this.draftActive = false; this.draftOwner.release(this.editorToken); this.draftOwner.release(this.interactionLease); KeyboardInputSession.releaseEditor(this.cloneEditorId); KeyboardInputSession.releaseEditor(this.axisEditorId); }
  @Prop profiles: DeviceProfile[] = DeviceProfiles.builtInProfiles();
  @Prop @Watch('selectionChanged') selectedProfileId: string = DeviceProfiles.getBuiltIn().id;
  @Prop activeProfileId: string = '';
  @Prop compact: boolean = false;
  @Prop readOnly: boolean = false;
  onRequestConfirmation: (request: ConfirmationRequest) => void = (_request: ConfirmationRequest): void => {};
  onSelectProfile: (id: string) => void = (_id: string): void => {};
  onChangeProfile: (snapshot: DeviceProfile) => void = (_snapshot: DeviceProfile): void => {};
  onCloneProfile: (sourceId: string, name: string) => void = (_sourceId: string, _name: string): void => {};
  onRemoveProfile: (id: string) => void = (_id: string): void => {};
  onImportProfile: (profile: DeviceProfile) => void = (_profile: DeviceProfile): void => { throw new Error('设备导入尚未绑定配置。'); };
  @State transferBusy: boolean = false;
  @State transferStatus: string = '';
  @State confirmExport: boolean = false;
  @State cloneName: string = '';
  @State newAxisName: string = '';
  @State error: string = '';
  @State confirmRemoveProfile: boolean = false;
  @State confirmRemoveAxis: number = -1;
  private selectionChanged(): void { this.restoreEditorDraft(); this.cloneEditorId = KeyboardInputSession.renewEditor(this.cloneEditorId); this.axisEditorId = KeyboardInputSession.renewEditor(this.axisEditorId); this.confirmExport = false; this.confirmRemoveProfile = false; this.confirmRemoveAxis = -1; this.error = ''; }
  private draftActive: boolean = true;
  private editorToken: number = 0;
  private editorSource: string = '';
  private interactionLease: number = 0;
  private restoreEditorDraft(): void {
    this.draftOwner.release(this.editorToken); this.draftOwner.release(this.interactionLease); this.interactionLease = 0;
    this.cloneEditorId = KeyboardInputSession.renewEditor(this.cloneEditorId); this.axisEditorId = KeyboardInputSession.renewEditor(this.axisEditorId);
    this.confirmExport = false; this.confirmRemoveProfile = false; this.confirmRemoveAxis = -1; this.transferBusy = false;
    this.editorSource = this.selectedProfileId;
    const lease = this.draftOwner.open(this.draftScope, '$names', this.editorSource, '["",""]'); this.editorToken = lease.token;
    try { const values: string[] = JSON.parse(lease.value) as string[];
      this.cloneName = typeof values[0] === 'string' ? values[0] : ''; this.newAxisName = typeof values[1] === 'string' ? values[1] : '';
    } catch { this.cloneName = ''; this.newAxisName = ''; }
  }
  private saveEditorDraft(): void {
    if (!this.draftOwner.write(this.editorToken, this.editorSource, JSON.stringify([this.cloneName, this.newAxisName]))) {
      this.error = '草稿已失效或超过保留上限，请重新编辑。';
    }
  }
  private interactionSource(): string { return JSON.stringify([this.draftScope, this.draftEpoch, this.selectedProfileId, this.readOnly, this.profiles]); }
  private interactionToken(source: string): number {
    if (!this.draftOwner.isCurrent(this.interactionLease, source)) { this.interactionLease = this.draftOwner.open(this.draftScope, '$panel', source, '').token; }
    return this.interactionLease;
  }
  private ownsInteraction(token: number, source: string): boolean {
    return this.draftActive && source === this.interactionSource() && this.draftOwner.isCurrent(token, source);
  }
  private guardedText(action: (value: string) => boolean): (value: string) => boolean {
    const source = this.interactionSource(); const token = this.interactionToken(source);
    return (value: string): boolean => this.ownsInteraction(token, source) && !this.readOnly && action(value);
  }
  private guardedNumber(action: (value: number) => boolean): (value: number) => boolean {
    const source = this.interactionSource(); const token = this.interactionToken(source);
    return (value: number): boolean => this.ownsInteraction(token, source) && !this.readOnly && action(value);
  }
  private guardedFlag(action: (value: boolean) => void): (value: boolean) => void {
    const source = this.interactionSource(); const token = this.interactionToken(source);
    return (value: boolean): void => { if (this.ownsInteraction(token, source) && !this.readOnly) { action(value); } };
  }
  private guardedChoice(action: (value: string) => void): (value: string) => void {
    const source = this.interactionSource(); const token = this.interactionToken(source);
    return (value: string): void => { if (this.ownsInteraction(token, source) && !this.readOnly) { action(value); } };
  }
  private guardedAction(action: () => void): () => void {
    const source = this.interactionSource(); const token = this.interactionToken(source);
    return (): void => { if (this.ownsInteraction(token, source)) { action(); } };
  }
  private pasteHandler(): (event: ClickEvent, result: PasteButtonOnClickResult) => void {
    const source = this.interactionSource(); const token = this.interactionToken(source);
    return (_event: ClickEvent, result: PasteButtonOnClickResult): void => {
      if (!this.ownsInteraction(token, source) || this.readOnly) { return; }
      if (result === PasteButtonOnClickResult.SUCCESS) { this.importClipboard(); }
      else { this.error = '已取消粘贴或未取得剪贴板读取授权；未导入设备。'; }
    };
  }
  private selected(): DeviceProfile {
    const profile: DeviceProfile | undefined = this.profiles.find(profile => profile.id === this.selectedProfileId);
    return profile === undefined ? DeviceProfiles.getBuiltIn() : profile;
  }
  private selectedExists(): boolean { return this.profiles.some(profile => profile.id === this.selectedProfileId); }
  private activeName(): string {
    const profile: DeviceProfile | undefined = this.profiles.find(profile => profile.id === this.activeProfileId);
    return profile === undefined ? (this.activeProfileId.length > 0 ? this.activeProfileId : '由播放会话决定') : profile.name;
  }
  private options(): SettingsOption[] {
    return this.profiles.map(profile => new SettingsOption(profile.id, profile.name + (profile.isBuiltIn ? '（内置）' : '')));
  }
  private emit(next: DeviceProfile | null): boolean {
    if (this.readOnly || !this.selectedExists()) { return false; }
    if (next === null) { this.error = '设置无效。轴名需为大写字母加一位数字且不能重复；请检查数值范围。'; return false; }
    this.error = ''; this.onChangeProfile(next); return true;
  }
  private cloneProfile(): void {
    if (this.readOnly || !this.selectedExists()) { return; }
    const name: string = this.cloneName.trim();
    if (name.length === 0) { this.error = '请输入新设备名称。'; return; }
    this.error = ''; this.onCloneProfile(this.selectedProfileId, name);
  }
  private requestConfirmation(kind: string, index: number = -1): void {
    const source: string = this.interactionSource(); const token: number = this.interactionToken(source);
    const profile: DeviceProfile = this.selected();
    if (!this.selectedExists() || profile.isBuiltIn || this.transferBusy || (kind !== 'export' && this.readOnly)) { return; }
    if (kind === 'axis' && (index < 0 || index >= profile.axes.length)) { return; }
    const current = (): boolean => this.ownsInteraction(token, source) && !this.transferBusy &&
      this.selectedExists() && !this.selected().isBuiltIn && (kind === 'export' || !this.readOnly);
    const title: string = kind === 'export' ? '替换剪贴板内容？' : kind === 'axis' ? '移除轴 ' + profile.axes[index].name + '？' : '移除此自定义设备？';
    const message: string = kind === 'export' ? '将所选设备 JSON 复制到剪贴板，替换剪贴板现有内容。' :
      kind === 'axis' ? '仅修改此设备配置，保存后下次启动生效。当前播放会话不会切换。' : '将移除所选自定义设备配置。当前生效设备不会在本次会话中自动切换。';
    this.onRequestConfirmation(new ConfirmationRequest(title, message, kind === 'export' ? '确认复制并替换' : '确认移除', kind !== 'export', current,
      (): void => { if (kind === 'export') { void this.exportClipboard(); } else if (kind === 'axis') { this.removeAxis(index); } else { this.removeProfile(); } }));
  }
  private removeProfile(): void {
    if (this.readOnly || !this.selectedExists() || this.selected().isBuiltIn) { return; }
    this.confirmRemoveProfile = false; this.onRemoveProfile(this.selectedProfileId);
  }
  private removeAxis(index: number): void {
    if (this.emit(DeviceSettingsEdits.removeAxis(this.selected(), index))) { this.confirmRemoveAxis = -1; }
  }
  private async importClipboard(): Promise<void> {
    if (this.readOnly || this.transferBusy) { return; }
    const source = this.interactionSource(); const token = this.interactionToken(source);
    this.transferBusy = true; this.error = ''; this.transferStatus = '';
    try {
      const profile: DeviceProfile = await new DeviceProfileClipboard(new NativeDeviceClipboard()).importProfile(this.profiles);
      if (!this.ownsInteraction(token, source) || this.readOnly) { return; }
      this.transferBusy = false;
      this.onImportProfile(profile);
      this.transferStatus = '已添加自定义设备「' + profile.name + '」。如需使用，请选择为下次启动设备并保存。';
    } catch (error) { if (this.ownsInteraction(token, source)) { this.error = '导入失败或已取消：' + (error as Error).message; } }
    finally { if (this.ownsInteraction(token, source)) { this.transferBusy = false; } }
  }
  private async exportClipboard(): Promise<void> {
    if (this.transferBusy || !this.selectedExists() || this.selected().isBuiltIn) { return; }
    const source = this.interactionSource(); const token = this.interactionToken(source);
    this.confirmExport = false; this.transferBusy = true; this.error = ''; this.transferStatus = '';
    try {
      await new DeviceProfileClipboard(new NativeDeviceClipboard()).exportProfile(this.selected());
      if (this.ownsInteraction(token, source)) { this.transferStatus = '已复制原版兼容设备 JSON 到剪贴板。'; }
    } catch (error) { if (this.ownsInteraction(token, source)) { this.error = '导出失败或已取消：' + (error as Error).message; } }
    finally { if (this.ownsInteraction(token, source)) { this.transferBusy = false; } }
  }
  @Builder
  clipboardFields() {
    Column({ space: UiStyle.gap(this.compact) }) {
      SettingsSectionTitle({ label: '剪贴板导入 / 导出' })
      Text('导入原版设备 JSON：点击下方粘贴按钮读取。仅新增自定义设备，不覆盖已有设备或切换当前会话。')
        .fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
      PasteButton({ icon: PasteIconStyle.LINES, text: PasteDescription.PASTE, buttonType: ButtonType.Normal })
        .fontSize(UiStyle.textFor(this.compact)).fontColor(UiStyle.ink).iconColor(UiStyle.ink).backgroundColor(UiStyle.field)
        .borderWidth(1).borderColor(UiStyle.edge).borderRadius(UiStyle.radius)
        .constraintSize({ minHeight: UiStyle.control, maxWidth: '100%', minWidth: UiStyle.control }).enabled(!this.readOnly && !this.transferBusy)
        .onClick(this.pasteHandler())
      
        Button('导出所选设备 JSON')
          .type(ButtonType.Normal).buttonStyle(ButtonStyleMode.NORMAL).controlSize(ControlSize.NORMAL).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 12, right: 12, top: 8, bottom: 8 }).width('100%').constraintSize({ minHeight: UiStyle.controlFor(this.compact), maxWidth: '100%', minWidth: UiStyle.controlFor(this.compact) }).responseRegion({ y: -4, width: '100%', height: UiStyle.control }).fontSize(UiStyle.textFor(this.compact))
          .borderRadius(UiStyle.radius)
          .enabled(!this.transferBusy && this.selectedExists() && !this.selected().isBuiltIn).fontColor(UiStyle.ink).backgroundColor(UiStyle.field).border({ width: 1, color: UiStyle.edge })
          .stateStyles({
            focused: { .outline({ width: 2, color: UiStyle.accent }) },
            disabled: { .opacity(UiStyle.disabledOpacity) }
          }).onClick(this.guardedAction(() => { this.requestConfirmation('export'); }))
      
      if (this.selectedExists() && this.selected().isBuiltIn) {
        Text('原版仅导出自定义设备；请先克隆内置设备。').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
      }
      if (this.transferBusy) { Text('正在处理剪贴板…').fontSize(UiStyle.helper).width('100%') }
      if (this.transferStatus.length > 0) { Text(this.transferStatus).fontSize(UiStyle.helper).fontColor(UiStyle.success).width('100%') }
    }.width('100%').margin({ top: 10 })
  }
  @Builder
  axisFields(axis: DeviceAxisDefinition, index: number) {
    Column() {
      SettingsSectionTitle({ label: axis.name + ' · ' + (axis.friendlyName === null ? '自定义轴' : axis.friendlyName) })
      SettingsSwitchField({ label: '启用该轴', value: axis.enabled, compact: this.compact,
        onChange: this.guardedFlag((value: boolean) => { this.emit(DeviceSettingsEdits.axisFlag(this.selected(), index, value)); })})
      if (!axis.enabled) { Text('已禁用；该轴的脚本和运动设置保留。').fontSize(UiStyle.helper).fontColor(UiStyle.warning).width('100%') }
      SettingsTextField({ draftOwner: this.draftOwner, draftScope: this.draftScope, draftEpoch: this.draftEpoch, draftKey: 'axis:' + axis.name + ':name', label: '轴名称', value: axis.name, compact: this.compact, editable: !this.readOnly && !this.selected().isBuiltIn,
        onCommit: this.guardedText((value: string): boolean => this.emit(DeviceSettingsEdits.axisText(this.selected(), index, 'name', value)))})
      SettingsTextField({ draftOwner: this.draftOwner, draftScope: this.draftScope, draftEpoch: this.draftEpoch, draftKey: 'axis:' + axis.name + ':friendlyName', label: '显示名称', value: axis.friendlyName ?? '', compact: this.compact, editable: !this.readOnly && !this.selected().isBuiltIn,
        onCommit: this.guardedText((value: string): boolean => this.emit(DeviceSettingsEdits.axisText(this.selected(), index, 'friendlyName', value)))})
      SettingsTextField({ draftOwner: this.draftOwner, draftScope: this.draftScope, draftEpoch: this.draftEpoch, draftKey: 'axis:' + axis.name + ':aliases', label: 'Funscript 别名（英文逗号分隔）', value: axis.funscriptNames.join(', '), compact: this.compact,
        editable: !this.readOnly && !this.selected().isBuiltIn,
        onCommit: this.guardedText((value: string): boolean => this.emit(DeviceSettingsEdits.axisText(this.selected(), index, 'funscriptNames', value)))})
      SettingsNumberField({ draftOwner: this.draftOwner, draftScope: this.draftScope, draftEpoch: this.draftEpoch, draftKey: 'axis:' + axis.name + ':defaultValue', label: '默认位置', value: axis.defaultValue, unit: '0–1', compact: this.compact, editable: !this.readOnly && !this.selected().isBuiltIn,
        onCommit: this.guardedNumber((value: number): boolean => this.emit(DeviceSettingsEdits.axisDefault(this.selected(), index, value)))})
      if (!this.selected().isBuiltIn) {
        
          Button('移除此轴')
            .type(ButtonType.Normal).buttonStyle(ButtonStyleMode.NORMAL).controlSize(ControlSize.NORMAL).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 12, right: 12, top: 8, bottom: 8 }).constraintSize({ minHeight: UiStyle.controlFor(this.compact), maxWidth: '100%', minWidth: UiStyle.controlFor(this.compact) }).responseRegion({ y: -4, width: '100%', height: UiStyle.control }).fontSize(UiStyle.textFor(this.compact)).borderRadius(UiStyle.radius)
            .fontColor(UiStyle.danger).backgroundColor(UiStyle.field).border({ width: 1, color: UiStyle.edge })
            .stateStyles({
              focused: { .outline({ width: 2, color: UiStyle.accent }) },
              disabled: { .opacity(UiStyle.disabledOpacity) }
            }).onClick(this.guardedAction(() => { this.requestConfirmation('axis', index); }))
        
      }
    }.width('100%')
  }
  build() {
    // The containing workspace owns vertical scrolling; this panel sizes to content.
    Column() {
      Column() {
        SettingsSectionTitle({ label: '设备设置 · DEVICE', topLevel: true })
        Text('当前生效设备：' + this.activeName()).fontSize(UiStyle.textFor(this.compact)).fontColor(UiStyle.ink).width('100%').wordBreak(WordBreak.BREAK_ALL)
        Text('以下编辑为启动配置。保存后下次启动生效；当前播放会话不会热切换。').fontSize(UiStyle.helper).fontColor(UiStyle.warning)
          .width('100%').padding({ top: 8, bottom: 8 })
        if (this.readOnly) { Text('配置为只读，请先处理设置加载或恢复问题。').fontSize(UiStyle.helper).fontColor(UiStyle.danger).width('100%') }
        Column() {
          SettingsChoiceField({ label: '下次启动使用的设备', selected: this.selectedProfileId, options: this.options(), compact: this.compact,
            onSelect: (id: string) => { if (!this.readOnly) { this.onSelectProfile(id); } } })
          if (!this.selectedExists()) { Text('所选设备不存在；请重新选择。').fontSize(UiStyle.helper).fontColor(UiStyle.danger).width('100%') }
          if (this.selectedExists()) {
            if (this.selected().isBuiltIn) {
              Text('内置设备允许启用 / 禁用轴。克隆为自定义设备后可修改其他字段。').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
            }
            SettingsSectionTitle({ label: '克隆为自定义设备' })
            Text('新设备名称').fontSize(UiStyle.textFor(this.compact)).fontColor(UiStyle.ink).width('100%')
            TextInput({ text: this.cloneName, placeholder: '新设备名称' }).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).fontSize(UiStyle.textFor(this.compact))
              .onFocus(KeyboardInputSession.focusHandler(this.cloneEditorId, true))
              .onBlur(KeyboardInputSession.focusHandler(this.cloneEditorId, false))
              .onKeyPreIme(KeyboardInputSession.emergencyHandler(this.cloneEditorId))
              .borderRadius(UiStyle.radius).backgroundColor(UiStyle.field).fontColor(UiStyle.ink).border({ width: 1, color: UiStyle.edge }).width('100%').onChange(KeyboardInputSession.changeHandler(this.cloneEditorId, this.guardedChoice((value: string) => { this.cloneName = value; this.saveEditorDraft(); })))
              .accessibilityText('克隆设备名称')
            Button('克隆所选设备')
              .type(ButtonType.Normal).buttonStyle(ButtonStyleMode.NORMAL).controlSize(ControlSize.NORMAL).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 12, right: 12, top: 8, bottom: 8 }).width('100%').constraintSize({ minHeight: UiStyle.controlFor(this.compact), maxWidth: '100%', minWidth: UiStyle.controlFor(this.compact) }).responseRegion({ y: -4, width: '100%', height: UiStyle.control }).fontSize(UiStyle.textFor(this.compact))
              .borderRadius(UiStyle.radius).margin({ top: 6, bottom: 6 }).fontColor(UiStyle.ink).backgroundColor(UiStyle.field).border({ width: 1, color: UiStyle.edge })
              .stateStyles({
                focused: { .outline({ width: 2, color: UiStyle.accent }) },
                disabled: { .opacity(UiStyle.disabledOpacity) }
              }).onClick(this.guardedAction(() => this.cloneProfile()))
            if (!this.selected().isBuiltIn) {
              SettingsTextField({ draftOwner: this.draftOwner, draftScope: this.draftScope, draftEpoch: this.draftEpoch, draftKey: 'name', editable: !this.readOnly, label: '设备名称', value: this.selected().name, compact: this.compact,
                onCommit: this.guardedText((value: string): boolean => this.emit(DeviceSettingsEdits.rename(this.selected(), value)))})
              
                Button('移除此自定义设备')
                  .type(ButtonType.Normal).buttonStyle(ButtonStyleMode.NORMAL).controlSize(ControlSize.NORMAL).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 12, right: 12, top: 8, bottom: 8 }).width('100%').constraintSize({ minHeight: UiStyle.controlFor(this.compact), maxWidth: '100%', minWidth: UiStyle.controlFor(this.compact) }).responseRegion({ y: -4, width: '100%', height: UiStyle.control }).fontSize(UiStyle.textFor(this.compact))
                  .borderRadius(UiStyle.radius).fontColor(UiStyle.danger).backgroundColor(UiStyle.field).border({ width: 1, color: UiStyle.edge })
                  .stateStyles({
                    focused: { .outline({ width: 2, color: UiStyle.accent }) },
                    disabled: { .opacity(UiStyle.disabledOpacity) }
                  }).onClick(this.guardedAction(() => { this.requestConfirmation('profile'); }))
              
            }
            SettingsSectionTitle({ label: '输出精度 · PRECISION' })
            SettingsNumberField({ draftOwner: this.draftOwner, draftScope: this.draftScope, draftEpoch: this.draftEpoch, draftKey: 'precision', label: '输出精度', value: this.selected().outputPrecision, compact: this.compact, integer: true,
              minimum: DeviceProfiles.MIN_OUTPUT_PRECISION, maximum: DeviceProfiles.MAX_OUTPUT_PRECISION, editable: !this.readOnly && !this.selected().isBuiltIn,
              onCommit: this.guardedNumber((value: number): boolean => this.emit(DeviceSettingsEdits.precision(this.selected(), value)))})
            ForEach(this.selected().axes, (axis: DeviceAxisDefinition, index: number) => { this.axisFields(axis, index) },
              (axis: DeviceAxisDefinition, index: number): string => this.selectedProfileId + ':' + index + ':' + axis.name)
            if (!this.selected().isBuiltIn) {
              SettingsSectionTitle({ label: '添加设备轴' })
              Text('新轴名称').fontSize(UiStyle.textFor(this.compact)).fontColor(UiStyle.ink).width('100%')
              TextInput({ text: this.newAxisName, placeholder: '轴名称，例如 L3' }).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).fontSize(UiStyle.textFor(this.compact))
              .onFocus(KeyboardInputSession.focusHandler(this.axisEditorId, true))
              .onBlur(KeyboardInputSession.focusHandler(this.axisEditorId, false))
              .onKeyPreIme(KeyboardInputSession.emergencyHandler(this.axisEditorId))
                .borderRadius(UiStyle.radius).backgroundColor(UiStyle.field).fontColor(UiStyle.ink).border({ width: 1, color: UiStyle.edge }).width('100%').onChange(KeyboardInputSession.changeHandler(this.axisEditorId, this.guardedChoice((value: string) => { this.newAxisName = value; this.saveEditorDraft(); })))
                .accessibilityText('新轴名称')
              Button('＋ 添加轴')
                .type(ButtonType.Normal).buttonStyle(ButtonStyleMode.NORMAL).controlSize(ControlSize.NORMAL).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 12, right: 12, top: 8, bottom: 8 }).width('100%').constraintSize({ minHeight: UiStyle.controlFor(this.compact), maxWidth: '100%', minWidth: UiStyle.controlFor(this.compact) }).responseRegion({ y: -4, width: '100%', height: UiStyle.control }).fontSize(UiStyle.textFor(this.compact))
                .borderRadius(UiStyle.radius).margin({ top: 6 }).fontColor(UiStyle.ink).backgroundColor(UiStyle.field).border({ width: 1, color: UiStyle.edge })
                .stateStyles({
                  focused: { .outline({ width: 2, color: UiStyle.accent }) },
                  disabled: { .opacity(UiStyle.disabledOpacity) }
                }).onClick(this.guardedAction(() => { this.emit(DeviceSettingsEdits.addAxis(this.selected(), this.newAxisName)); }))
            }
          }
        }.width('100%').enabled(!this.readOnly)
        this.clipboardFields()
        if (this.error.length > 0) { Text(this.error).fontSize(UiStyle.helper).fontColor(UiStyle.danger).width('100%').margin({ top: 8 }) }
      }.width('100%')
    }.width('100%').padding(UiStyle.cardPadding).backgroundColor(UiStyle.card).borderRadius(UiStyle.radiusCard)
  }
}
