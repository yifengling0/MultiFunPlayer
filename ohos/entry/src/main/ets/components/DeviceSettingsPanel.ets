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
  private cloneEditorId: number = KeyboardInputSession.newEditorId();
  private axisEditorId: number = KeyboardInputSession.newEditorId();
  aboutToAppear(): void { KeyboardInputSession.releaseEditor(this.cloneEditorId); KeyboardInputSession.releaseEditor(this.axisEditorId); this.cloneEditorId = KeyboardInputSession.newEditorId(); this.axisEditorId = KeyboardInputSession.newEditorId(); }
  aboutToDisappear(): void { KeyboardInputSession.releaseEditor(this.cloneEditorId); KeyboardInputSession.releaseEditor(this.axisEditorId); }
  @Prop profiles: DeviceProfile[] = DeviceProfiles.builtInProfiles();
  @Prop @Watch('selectionChanged') selectedProfileId: string = DeviceProfiles.getBuiltIn().id;
  @Prop activeProfileId: string = '';
  @Prop compact: boolean = false;
  @Prop readOnly: boolean = false;
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
  private selectionChanged(): void { this.cloneEditorId = KeyboardInputSession.renewEditor(this.cloneEditorId); this.axisEditorId = KeyboardInputSession.renewEditor(this.axisEditorId); this.confirmExport = false; this.confirmRemoveProfile = false; this.confirmRemoveAxis = -1; this.error = ''; }
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
  private removeProfile(): void {
    if (this.readOnly || !this.selectedExists() || this.selected().isBuiltIn) { return; }
    this.confirmRemoveProfile = false; this.onRemoveProfile(this.selectedProfileId);
  }
  private removeAxis(index: number): void {
    if (this.emit(DeviceSettingsEdits.removeAxis(this.selected(), index))) { this.confirmRemoveAxis = -1; }
  }
  private async importClipboard(): Promise<void> {
    if (this.readOnly || this.transferBusy) { return; }
    this.transferBusy = true; this.error = ''; this.transferStatus = '';
    try {
      const profile: DeviceProfile = await new DeviceProfileClipboard(new NativeDeviceClipboard()).importProfile(this.profiles);
      if (this.readOnly) { throw new Error('配置已变为只读，未导入。'); }
      this.onImportProfile(profile);
      this.transferStatus = '已添加自定义设备「' + profile.name + '」。如需使用，请选择为下次启动设备并保存。';
    } catch (error) { this.error = '导入失败或已取消：' + (error as Error).message; }
    finally { this.transferBusy = false; }
  }
  private async exportClipboard(): Promise<void> {
    if (this.transferBusy || !this.selectedExists() || this.selected().isBuiltIn) { return; }
    this.confirmExport = false; this.transferBusy = true; this.error = ''; this.transferStatus = '';
    try {
      await new DeviceProfileClipboard(new NativeDeviceClipboard()).exportProfile(this.selected());
      this.transferStatus = '已复制原版兼容设备 JSON 到剪贴板。';
    } catch (error) { this.error = '导出失败或已取消：' + (error as Error).message; }
    finally { this.transferBusy = false; }
  }
  @Builder
  clipboardFields() {
    Column({ space: UiStyle.gap(this.compact) }) {
      SettingsSectionTitle({ label: '剪贴板导入 / 导出' })
      Text('导入原版设备 JSON：点击下方粘贴按钮读取。仅新增自定义设备，不覆盖已有设备或切换当前会话。')
        .fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
      PasteButton({ icon: PasteIconStyle.LINES, text: PasteDescription.PASTE, buttonType: ButtonType.Normal })
        .fontSize(UiStyle.body(this.compact)).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).enabled(!this.readOnly && !this.transferBusy)
        .onClick((_event: ClickEvent, result: PasteButtonOnClickResult) => {
          if (result === PasteButtonOnClickResult.SUCCESS) { this.importClipboard(); }
          else { this.error = '已取消粘贴或未取得剪贴板读取授权；未导入设备。'; }
        })
      if (this.confirmExport) {
        Text('导出会替换剪贴板现有内容，是否继续？').fontSize(UiStyle.helper).fontColor(UiStyle.warning).width('100%')
        Flex({ wrap: FlexWrap.Wrap }) {
          Button('确认复制并替换').fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.ink).backgroundColor(UiStyle.accentSoft)
            .type(ButtonType.Normal).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 14, right: 14, top: 12, bottom: 12 }).borderRadius(UiStyle.radius).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).margin({ right: 8, bottom: 8 }).onClick(() => this.exportClipboard())
          Button('取消').fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.ink).backgroundColor(UiStyle.accentSoft)
            .type(ButtonType.Normal).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 14, right: 14, top: 12, bottom: 12 }).borderRadius(UiStyle.radius).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).margin({ right: 8, bottom: 8 }).onClick(() => { this.confirmExport = false; this.transferStatus = '已取消导出。'; })
        }.enabled(!this.transferBusy)
      } else {
        Button('导出所选设备 JSON').fontColor(UiStyle.ink).backgroundColor(UiStyle.accentSoft)
          .type(ButtonType.Normal).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 14, right: 14, top: 12, bottom: 12 }).width('100%').constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).fontSize(UiStyle.body(this.compact))
          .fontColor(UiStyle.ink).backgroundColor(UiStyle.accentSoft).borderRadius(UiStyle.radius)
          .enabled(!this.transferBusy && this.selectedExists() && !this.selected().isBuiltIn).onClick(() => { this.confirmExport = true; })
      }
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
        onChange: (value: boolean) => { this.emit(DeviceSettingsEdits.axisFlag(this.selected(), index, value)); } })
      if (!axis.enabled) { Text('已禁用；该轴的脚本和运动设置保留。').fontSize(UiStyle.helper).fontColor(UiStyle.warning).width('100%') }
      SettingsTextField({ label: '轴名称', value: axis.name, compact: this.compact, editable: !this.selected().isBuiltIn,
        onCommit: (value: string): boolean => this.emit(DeviceSettingsEdits.axisText(this.selected(), index, 'name', value)) })
      SettingsTextField({ label: '显示名称', value: axis.friendlyName ?? '', compact: this.compact, editable: !this.selected().isBuiltIn,
        onCommit: (value: string): boolean => this.emit(DeviceSettingsEdits.axisText(this.selected(), index, 'friendlyName', value)) })
      SettingsTextField({ label: 'Funscript 别名（英文逗号分隔）', value: axis.funscriptNames.join(', '), compact: this.compact,
        editable: !this.selected().isBuiltIn,
        onCommit: (value: string): boolean => this.emit(DeviceSettingsEdits.axisText(this.selected(), index, 'funscriptNames', value)) })
      SettingsNumberField({ label: '默认位置', value: axis.defaultValue, unit: '0–1', compact: this.compact, editable: !this.selected().isBuiltIn,
        onCommit: (value: number): boolean => this.emit(DeviceSettingsEdits.axisDefault(this.selected(), index, value)) })
      if (!this.selected().isBuiltIn) {
        if (this.confirmRemoveAxis === index) {
          Text('确认移除 ' + axis.name + '？保存后下次启动生效。').fontSize(UiStyle.helper).fontColor(UiStyle.danger).width('100%')
          Flex({ wrap: FlexWrap.Wrap }) {
            Button('确认移除').fontColor(UiStyle.ink).backgroundColor(UiStyle.accentSoft)
              .type(ButtonType.Normal).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 14, right: 14, top: 12, bottom: 12 }).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.danger).backgroundColor(UiStyle.accentSoft).borderRadius(UiStyle.radius).margin({ right: 8, bottom: 8 })
              .fontColor(UiStyle.danger).backgroundColor(UiStyle.dangerSoft).onClick(() => this.removeAxis(index))
            Button('取消').fontColor(UiStyle.ink).backgroundColor(UiStyle.accentSoft)
              .type(ButtonType.Normal).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 14, right: 14, top: 12, bottom: 12 }).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.ink).backgroundColor(UiStyle.accentSoft).borderRadius(UiStyle.radius).margin({ right: 8, bottom: 8 })
              .onClick(() => { this.confirmRemoveAxis = -1; })
          }.width('100%')
        } else {
          Button('移除此轴').fontColor(UiStyle.ink).backgroundColor(UiStyle.accentSoft)
            .type(ButtonType.Normal).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 14, right: 14, top: 12, bottom: 12 }).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.danger).backgroundColor(UiStyle.accentSoft).borderRadius(UiStyle.radius)
            .fontColor(UiStyle.danger).backgroundColor(UiStyle.dangerSoft).onClick(() => { this.confirmRemoveAxis = index; })
        }
      }
    }.width('100%')
  }
  build() {
    // The containing workspace owns vertical scrolling; this panel sizes to content.
    Column() {
      Column() {
        SettingsSectionTitle({ label: '设备设置 · DEVICE' })
        Text('当前生效设备：' + this.activeName()).fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.ink).width('100%').wordBreak(WordBreak.BREAK_ALL)
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
            Text('新设备名称').fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.ink).width('100%')
            TextInput({ text: this.cloneName, placeholder: '新设备名称' }).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).fontSize(UiStyle.body(this.compact))
              .onFocus(KeyboardInputSession.focusHandler(this.cloneEditorId, true))
              .onBlur(KeyboardInputSession.focusHandler(this.cloneEditorId, false))
              .onKeyPreIme(KeyboardInputSession.emergencyHandler(this.cloneEditorId))
              .borderRadius(UiStyle.radius).backgroundColor(UiStyle.field).fontColor(UiStyle.ink).border({ width: 1, color: UiStyle.edge }).width('100%').onChange(KeyboardInputSession.changeHandler(this.cloneEditorId, (value: string) => { this.cloneName = value; }))
              .accessibilityText('克隆设备名称')
            Button('克隆所选设备').fontColor(UiStyle.ink).backgroundColor(UiStyle.accentSoft)
              .type(ButtonType.Normal).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 14, right: 14, top: 12, bottom: 12 }).width('100%').constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.ink)
              .backgroundColor(UiStyle.accentSoft).borderRadius(UiStyle.radius).margin({ top: 6, bottom: 6 }).onClick(() => this.cloneProfile())
            if (!this.selected().isBuiltIn) {
              SettingsTextField({ label: '设备名称', value: this.selected().name, compact: this.compact,
                onCommit: (value: string): boolean => this.emit(DeviceSettingsEdits.rename(this.selected(), value)) })
              if (this.confirmRemoveProfile) {
                Text('确认移除此自定义设备？').fontSize(UiStyle.helper).fontColor(UiStyle.danger).width('100%')
                Flex({ wrap: FlexWrap.Wrap }) {
                  Button('确认移除').fontColor(UiStyle.ink).backgroundColor(UiStyle.accentSoft)
                    .type(ButtonType.Normal).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 14, right: 14, top: 12, bottom: 12 }).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.danger).backgroundColor(UiStyle.accentSoft).borderRadius(UiStyle.radius)
                    .fontColor(UiStyle.danger).backgroundColor(UiStyle.dangerSoft).onClick(() => this.removeProfile())
                  Button('取消').fontColor(UiStyle.ink).backgroundColor(UiStyle.accentSoft)
                    .type(ButtonType.Normal).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 14, right: 14, top: 12, bottom: 12 }).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.ink).backgroundColor(UiStyle.accentSoft).borderRadius(UiStyle.radius)
                    .onClick(() => { this.confirmRemoveProfile = false; })
                }.width('100%')
              } else {
                Button('移除此自定义设备').fontColor(UiStyle.ink).backgroundColor(UiStyle.accentSoft)
                  .type(ButtonType.Normal).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 14, right: 14, top: 12, bottom: 12 }).width('100%').constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.danger)
                  .backgroundColor(UiStyle.accentSoft).borderRadius(UiStyle.radius).fontColor(UiStyle.danger).backgroundColor(UiStyle.dangerSoft).onClick(() => { this.confirmRemoveProfile = true; })
              }
            }
            SettingsSectionTitle({ label: '输出精度 · PRECISION' })
            SettingsNumberField({ label: '输出精度', value: this.selected().outputPrecision, compact: this.compact, integer: true,
              minimum: DeviceProfiles.MIN_OUTPUT_PRECISION, maximum: DeviceProfiles.MAX_OUTPUT_PRECISION, editable: !this.selected().isBuiltIn,
              onCommit: (value: number): boolean => this.emit(DeviceSettingsEdits.precision(this.selected(), value)) })
            ForEach(this.selected().axes, (axis: DeviceAxisDefinition, index: number) => { this.axisFields(axis, index) },
              (axis: DeviceAxisDefinition, index: number): string => this.selectedProfileId + ':' + index + ':' + axis.name)
            if (!this.selected().isBuiltIn) {
              SettingsSectionTitle({ label: '添加设备轴' })
              Text('新轴名称').fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.ink).width('100%')
              TextInput({ text: this.newAxisName, placeholder: '轴名称，例如 L3' }).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).fontSize(UiStyle.body(this.compact))
              .onFocus(KeyboardInputSession.focusHandler(this.axisEditorId, true))
              .onBlur(KeyboardInputSession.focusHandler(this.axisEditorId, false))
              .onKeyPreIme(KeyboardInputSession.emergencyHandler(this.axisEditorId))
                .borderRadius(UiStyle.radius).backgroundColor(UiStyle.field).fontColor(UiStyle.ink).border({ width: 1, color: UiStyle.edge }).width('100%').onChange(KeyboardInputSession.changeHandler(this.axisEditorId, (value: string) => { this.newAxisName = value; }))
                .accessibilityText('新轴名称')
              Button('＋ 添加轴').fontColor(UiStyle.ink).backgroundColor(UiStyle.accentSoft)
                .type(ButtonType.Normal).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 14, right: 14, top: 12, bottom: 12 }).width('100%').constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.ink).backgroundColor(UiStyle.accentSoft)
                .borderRadius(UiStyle.radius).margin({ top: 6 }).onClick(() => { this.emit(DeviceSettingsEdits.addAxis(this.selected(), this.newAxisName)); })
            }
          }
        }.width('100%').enabled(!this.readOnly)
        this.clipboardFields()
        if (this.error.length > 0) { Text(this.error).fontSize(UiStyle.helper).fontColor(UiStyle.danger).width('100%').margin({ top: 8 }) }
      }.width('100%').padding({ top: UiStyle.padding(this.compact), bottom: UiStyle.padding(this.compact) })
    }.width('100%')
  }
}
