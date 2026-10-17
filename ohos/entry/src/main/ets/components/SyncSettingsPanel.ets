import { SettingsDraftOwner } from '../presentation/SettingsDraftOwner';
import { UiStyle } from '../presentation/UiStyle';
import { SyncConfiguration, ConfigurationNumberRange } from '../core/AxisConfiguration';
import { SettingsNumberField, SettingsSwitchField, SettingsSectionTitle } from './CurvePointEditor';

export class SyncSettingsEdits {
  static duration(configuration: SyncConfiguration, seconds: number): SyncConfiguration | null {
    const next: SyncConfiguration = SyncConfiguration.clone(configuration);
    next.durationSeconds = seconds;
    return SyncConfiguration.validate(next).length === 0 ? next : null;
  }
  static flag(configuration: SyncConfiguration, field: string, value: boolean): SyncConfiguration | null {
    const next: SyncConfiguration = SyncConfiguration.clone(configuration);
    switch (field) {
      case 'syncOnMediaResourceChanged': next.syncOnMediaResourceChanged = value; break;
      case 'syncOnScriptResourceChanged': next.syncOnScriptResourceChanged = value; break;
      case 'syncOnScriptStart': next.syncOnScriptStart = value; break;
      case 'syncOnScriptEnd': next.syncOnScriptEnd = value; break;
      case 'syncOnMediaPlayPause': next.syncOnMediaPlayPause = value; break;
      case 'syncOnSeek': next.syncOnSeek = value; break;
      case 'syncOnAutoHomeStartEnd': next.syncOnAutoHomeStartEnd = value; break;
      default: return null;
    }
    return SyncConfiguration.validate(next).length === 0 ? next : null;
  }
}

/** Controlled snapshot. ResetSync events and persistence belong to the session. */
@Component
export struct SyncSettingsPanel {
  // Reference ownership is page-local; @Prop would deep-copy and split the draft store.
  draftOwner: SettingsDraftOwner = new SettingsDraftOwner();
  @Prop @Watch('draftContextChanged') draftScope: string = '';
  @Prop @Watch('draftContextChanged') draftEpoch: number = 0;
  @Prop configuration: SyncConfiguration = new SyncConfiguration();
  @Prop compact: boolean = false;
  @Prop readOnly: boolean = false;
  onChange: (snapshot: SyncConfiguration) => void = (_snapshot: SyncConfiguration): void => {};
  private draftToken: number = 0;
  private draftActive: boolean = true;
  aboutToAppear(): void { this.draftActive = true; this.draftContextChanged(); }
  aboutToDisappear(): void { this.draftActive = false; this.draftOwner.release(this.draftToken); }
  private interactionSource(): string { return this.draftScope + ':' + this.draftEpoch + ':' + this.readOnly + ':' + JSON.stringify(this.configuration); }
  private draftContextChanged(): void { this.draftOwner.release(this.draftToken); this.draftToken = 0; }
  private interactionToken(source: string): number {
    if (!this.draftOwner.isCurrent(this.draftToken, source)) { this.draftToken = this.draftOwner.open(this.draftScope, '$panel', source, '').token; }
    return this.draftToken;
  }
  private ownsInteraction(token: number, source: string): boolean {
    return this.draftActive && !this.readOnly && source === this.interactionSource() && this.draftOwner.isCurrent(token, source);
  }
  private guardedNumber(action: (value: number) => boolean): (value: number) => boolean {
    const source = this.interactionSource(); const token = this.interactionToken(source);
    return (value: number): boolean => this.ownsInteraction(token, source) && action(value);
  }
  private guardedFlag(action: (value: boolean) => void): (value: boolean) => void {
    const source = this.interactionSource(); const token = this.interactionToken(source);
    return (value: boolean): void => { if (this.ownsInteraction(token, source)) { action(value); } };
  }
  private guardedChoice(action: (value: string) => void): (value: string) => void {
    const source = this.interactionSource(); const token = this.interactionToken(source);
    return (value: string): void => { if (this.ownsInteraction(token, source)) { action(value); } };
  }
  private range(): ConfigurationNumberRange { return SyncConfiguration.numberRanges()[0]; }
  private changeDuration(value: number): boolean {
    if (this.readOnly) { return false; }
    const next: SyncConfiguration | null = SyncSettingsEdits.duration(this.configuration, value);
    if (this.readOnly) { return false; }
    if (next === null) { return false; } this.onChange(next); return true;
  }
  private changeFlag(field: string, value: boolean): void {
    if (this.readOnly) { return; }
    const next: SyncConfiguration | null = SyncSettingsEdits.flag(this.configuration, field, value);
    if (next !== null) { this.onChange(next); }
  }
  build() {
    // The containing workspace owns vertical scrolling; this panel sizes to content.
    Column() {
      Column() {
        SettingsSectionTitle({ label: '同步过渡 · SYNC', topLevel: true })
        SettingsNumberField({ editable: !this.readOnly, draftOwner: this.draftOwner, draftScope: this.draftScope, draftEpoch: this.draftEpoch, draftKey: 'duration', label: '过渡时长', unit: '秒', value: this.configuration.durationSeconds,
          minimum: this.range().minimum, maximum: this.range().maximum, compact: this.compact,
          onCommit: this.guardedNumber((value: number): boolean => this.changeDuration(value))})
        Text('发生所选事件时，按过渡时长重新同步。参数修改不会直接暂停媒体。')
          .fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL).margin({ bottom: 8 })
        SettingsSectionTitle({ label: '触发同步的事件' })
        SettingsSwitchField({ label: '媒体资源变化', value: this.configuration.syncOnMediaResourceChanged, compact: this.compact,
          onChange: this.guardedFlag((value: boolean) => this.changeFlag('syncOnMediaResourceChanged', value))})
        SettingsSwitchField({ label: '脚本资源变化', value: this.configuration.syncOnScriptResourceChanged, compact: this.compact,
          onChange: this.guardedFlag((value: boolean) => this.changeFlag('syncOnScriptResourceChanged', value))})
        SettingsSwitchField({ label: '脚本开始', value: this.configuration.syncOnScriptStart, compact: this.compact,
          onChange: this.guardedFlag((value: boolean) => this.changeFlag('syncOnScriptStart', value))})
        SettingsSwitchField({ label: '脚本结束', value: this.configuration.syncOnScriptEnd, compact: this.compact,
          onChange: this.guardedFlag((value: boolean) => this.changeFlag('syncOnScriptEnd', value))})
        SettingsSwitchField({ label: '媒体播放 / 暂停', value: this.configuration.syncOnMediaPlayPause, compact: this.compact,
          onChange: this.guardedFlag((value: boolean) => this.changeFlag('syncOnMediaPlayPause', value))})
        SettingsSwitchField({ label: '媒体跳转', value: this.configuration.syncOnSeek, compact: this.compact,
          onChange: this.guardedFlag((value: boolean) => this.changeFlag('syncOnSeek', value))})
        SettingsSwitchField({ label: '自动归位开始 / 结束', value: this.configuration.syncOnAutoHomeStartEnd, compact: this.compact,
          onChange: this.guardedFlag((value: boolean) => this.changeFlag('syncOnAutoHomeStartEnd', value))})
      }.width('100%').padding({ top: UiStyle.padding(this.compact), bottom: UiStyle.padding(this.compact) }).enabled(!this.readOnly)
    }.width('100%')
  }
}
