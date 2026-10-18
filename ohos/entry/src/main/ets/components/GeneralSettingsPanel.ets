import { UiStyle } from '../presentation/UiStyle';
import { SettingsDraftOwner } from '../presentation/SettingsDraftOwner';
import { GeneralConfiguration } from '../settings/GeneralConfiguration';
import { SettingsChoiceField, SettingsOption, SettingsSectionTitle } from './CurvePointEditor';

/** Only implemented preferences can cross this controlled editor boundary. */
export class GeneralSettingsEdits {
  static choice(configuration: GeneralConfiguration, field: string, value: string): GeneralConfiguration | null {
    const next: GeneralConfiguration = GeneralConfiguration.clone(configuration);
    if (field === 'appOrientation' && (value === 'auto' || value === 'vertical' || value === 'horizontal')) {
      next.appOrientation = value;
    } else if (field === 'errorDisplayType' && (value === 'none' || value === 'dialog' || value === 'snackbar')) {
      next.errorDisplayType = value;
    } else if (field === 'uiDensity' && (value === 'readable' || value === 'compact')) {
      next.uiDensity = value;
    } else { return null; }
    return GeneralConfiguration.validate(next).length === 0 ? next : null;
  }
}

@Component
export struct GeneralSettingsPanel {
  draftOwner: SettingsDraftOwner = new SettingsDraftOwner();
  @Prop @Watch('ownerChanged') draftScope: string = '';
  @Prop @Watch('ownerChanged') draftEpoch: number = 0;
  @Prop compact: boolean = false;
  @Prop @Watch('ownerChanged') configuration: GeneralConfiguration = new GeneralConfiguration();
  @Prop @Watch('ownerChanged') readOnly: boolean = false;
  onChange: (snapshot: GeneralConfiguration) => void = (_snapshot: GeneralConfiguration): void => {};
  private editEpoch: number = 0;
  private active: boolean = true;
  private deliveryLease: number = 0;
  private deliverySource(): string { return JSON.stringify([this.draftScope, this.draftEpoch, this.readOnly]); }
  private deliveryToken(source: string): number {
    if (!this.draftOwner.isCurrent(this.deliveryLease, source)) { this.deliveryLease = this.draftOwner.open(this.draftScope, '$delivery', source, '').token; }
    return this.deliveryLease;
  }
  private deliveryCurrent(token: number, source: string): boolean {
    return this.active && source === this.deliverySource() && this.draftOwner.isCurrent(token, source);
  }

  aboutToAppear(): void { this.active = true; this.editEpoch++; }
  aboutToDisappear(): void { this.draftOwner.release(this.deliveryLease); this.active = false; this.editEpoch++; }
  private ownerChanged(): void { this.draftOwner.release(this.deliveryLease); this.editEpoch++; }
  private choiceHandler(field: string): (value: string) => void {
    const owner: GeneralConfiguration = this.configuration; const epoch: number = this.editEpoch;
    const source = this.deliverySource(); const token = this.deliveryToken(source);
    return (value: string): void => {
      if (this.deliveryCurrent(token, source) && !this.readOnly && this.configuration === owner && this.editEpoch === epoch) {
        this.change(field, value);
      }
    };
  }
  private change(field: string, value: string): void {
    if (this.readOnly) { return; }
    const next: GeneralConfiguration | null = GeneralSettingsEdits.choice(this.configuration, field, value);
    if (next !== null) { this.editEpoch++; this.onChange(next); }
  }
  private orientations(): SettingsOption[] {
    return [new SettingsOption('auto', '自动 · 跟随可用窗口尺寸'), new SettingsOption('vertical', '纵向排列'),
      new SettingsOption('horizontal', '横向排列')];
  }
  private errors(): SettingsOption[] {
    return [new SettingsOption('none', '不弹出'), new SettingsOption('dialog', '对话框'),
      new SettingsOption('snackbar', '底部提示条')];
  }
  private densities(): SettingsOption[] {
    return [new SettingsOption('readable', '舒适易读 · 默认'), new SettingsOption('compact', '紧凑间距 · 手动选择')];
  }
  build() {
    // The workspace owns scrolling. Keep this content reachable in a narrow pane.
    Column({ space: UiStyle.gap(this.compact) }) {
      SettingsSectionTitle({ label: '通用 · GENERAL', topLevel: true })
      if (this.readOnly) {
        Text('当前设置仅可查看。').fontSize(UiStyle.textFor(this.compact)).fontColor(UiStyle.warning).width('100%')
      }
      SettingsChoiceField({ label: '界面密度 · UI Density', selected: this.configuration.uiDensity,
        options: this.densities(), compact: this.compact, editable: !this.readOnly,
        onSelect: this.choiceHandler('uiDensity') })
      Text('所有设备默认使用舒适易读尺寸。紧凑模式仅收紧间距和正文字号；按钮、开关与输入区域仍至少 52 vp。')
        .fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
      SettingsChoiceField({ label: '应用排列方向 · App Orientation', selected: this.configuration.appOrientation,
        options: this.orientations(), compact: this.compact, editable: !this.readOnly,
        onSelect: this.choiceHandler('appOrientation') })
      Text('控制窗口内面板的排列；不改变系统屏幕旋转锁定。自动模式按窗口尺寸调整；强制横向也保留窄屏触控入口。')
        .fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
      SettingsChoiceField({ label: '错误展示 · Show errors as', selected: this.configuration.errorDisplayType,
        options: this.errors(), compact: this.compact, editable: !this.readOnly,
        onSelect: this.choiceHandler('errorDisplayType') })
      Text('“不弹出”只关闭错误弹层。持久状态、停止和安全门控始终有效。')
        .fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
      SettingsSectionTitle({ label: '原版桌面选项 · 此平台暂不支持' })
      Text('窗口置顶 · AlwaysOnTop\n暂无 OHOS 窗口置顶适配。')
        .fontSize(UiStyle.textFor(this.compact)).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
      Text('允许窗口调整大小 · AllowWindowResize\n窗口能否调整大小由系统窗口模式决定，应用暂不提供开关。')
        .fontSize(UiStyle.textFor(this.compact)).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
      Text('记住窗口位置 · RememberWindowLocation\n暂无窗口坐标保存与恢复适配。')
        .fontSize(UiStyle.textFor(this.compact)).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
      Text('日志级别 · LogLevel\n尚未移植原版 NLog 日志级别控制。')
        .fontSize(UiStyle.textFor(this.compact)).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
      Text('界面日志 · EnableUILogging\n尚未移植原版 UI 日志收集。')
        .fontSize(UiStyle.textFor(this.compact)).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
      Text('JSON 日志 · EnableJsonLogging\n尚未移植原版 JSON 日志输出。')
        .fontSize(UiStyle.textFor(this.compact)).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
    }.width('100%').padding(UiStyle.cardPadding).backgroundColor(UiStyle.card).borderRadius(UiStyle.radiusCard)
  }
}
