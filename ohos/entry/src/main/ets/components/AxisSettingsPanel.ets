import { DraftLease, SettingsDraftOwner } from '../presentation/SettingsDraftOwner';
import { UiStyle } from '../presentation/UiStyle';
import { AxisConfiguration, ConfigurationNumberRange, SmartLimitPoint } from '../core/AxisConfiguration';
import { DeviceAxisDefinition, DeviceProfiles, ConfigurationDiagnostic } from '../core/DeviceProfile';
import { MotionConfigurations, MotionCurvePoint } from '../core/MotionConfiguration';
import { CurvePointEditor, SettingsNumberField, SettingsSwitchField, SettingsChoiceField, SettingsOption, SettingsSectionTitle } from './CurvePointEditor';

export class AxisSettingsEdits {
  static number(configuration: AxisConfiguration, field: string, value: number): AxisConfiguration | null {
    const next: AxisConfiguration = AxisConfiguration.clone(configuration);
    switch (field) {
      case 'offsetSeconds': next.offsetSeconds = value; break;
      case 'scriptScale': next.scriptScale = value; break;
      case 'motionProviderBlend': next.motionProviderBlend = value; break;
      case 'motionProviderMinimumGapDurationSeconds': next.motionProviderMinimumGapDurationSeconds = value; break;
      case 'smartLimitTargetValue': next.smartLimitTargetValue = value; break;
      case 'speedLimitUnitsPerSecond': next.speedLimitUnitsPerSecond = value; break;
      case 'autoHomeDelaySeconds': next.autoHomeDelaySeconds = value; break;
      case 'autoHomeDurationSeconds': next.autoHomeDurationSeconds = value; break;
      case 'autoHomeTargetValue': next.autoHomeTargetValue = value; break;
      default: return null;
    }
    return AxisConfiguration.validate(next).length === 0 ? next : null;
  }
  static flag(configuration: AxisConfiguration, field: string, value: boolean): AxisConfiguration | null {
    const next: AxisConfiguration = AxisConfiguration.clone(configuration);
    switch (field) {
      case 'lockScript': next.lockScript = value; break;
      case 'invertScript': next.invertScript = value; break;
      case 'bypassScript': next.bypassScript = value; break;
      case 'bypassMotionProvider': next.bypassMotionProvider = value; break;
      case 'bypassTransition': next.bypassTransition = value; break;
      case 'linkAxisHasPriority': next.linkAxisHasPriority = value; break;
      case 'motionProviderFillGaps': next.motionProviderFillGaps = value; break;
      case 'motionProviderSpeedLimitWithAxis': next.motionProviderSpeedLimitWithAxis = value; break;
      case 'updateMotionProviderWhenPaused': next.updateMotionProviderWhenPaused = value; break;
      case 'updateMotionProviderWithoutScript': next.updateMotionProviderWithoutScript = value; break;
      case 'speedLimitEnabled': next.speedLimitEnabled = value; break;
      case 'autoHomeEnabled': next.autoHomeEnabled = value; break;
      case 'autoHomeInsideScript': next.autoHomeInsideScript = value; break;
      default: return null;
    }
    return AxisConfiguration.validate(next).length === 0 ? next : null;
  }
  static choice(configuration: AxisConfiguration, field: string, value: string): AxisConfiguration | null {
    const next: AxisConfiguration = AxisConfiguration.clone(configuration);
    switch (field) {
      case 'linkAxis': next.linkAxis = value.length === 0 ? null : value; break;
      case 'smartLimitInputAxis': next.smartLimitInputAxis = value.length === 0 ? null : value; break;
      case 'updateMotionProviderWithAxis': next.updateMotionProviderWithAxis = value.length === 0 ? null : value; break;
      case 'selectedMotionProvider':
        if (value.length > 0 && !MotionConfigurations.ids().some(id => id === value)) { return null; }
        next.selectedMotionProvider = value.length === 0 ? null : value; break;
      case 'interpolationType':
        if (value !== 'linear' && value !== 'pchip' && value !== 'makima' && value !== 'step') { return null; }
        next.interpolationType = value; break;
      case 'smartLimitMode':
        if (value !== 'value' && value !== 'speed') { return null; }
        next.smartLimitMode = value; break;
      default: return null;
    }
    return AxisConfiguration.validate(next).length === 0 ? next : null;
  }
  static curve(configuration: AxisConfiguration, points: MotionCurvePoint[]): AxisConfiguration | null {
    const next: AxisConfiguration = AxisConfiguration.clone(configuration);
    next.smartLimitPoints = points.map(point => new SmartLimitPoint(point.x, point.y));
    return AxisConfiguration.validate(next).length === 0 ? next : null;
  }
  static speedFromSeconds(configuration: AxisConfiguration, seconds: number): AxisConfiguration | null {
    if (!Number.isFinite(seconds) || seconds < 0) { return null; }
    return AxisSettingsEdits.number(configuration, 'speedLimitUnitsPerSecond', seconds === 0 ? Number.POSITIVE_INFINITY : 1 / seconds);
  }
}

/** All 29 AxisSettings fields. Configuration changes never call play/pause/reset clocks. */
@Component
export struct AxisSettingsPanel {
  // Reference ownership is page-local; @Prop would deep-copy and split the draft store.
  draftOwner: SettingsDraftOwner = new SettingsDraftOwner();
  @Prop @Watch('draftContextChanged') draftScope: string = '';
  @Prop @Watch('draftContextChanged') draftEpoch: number = 0;
  @Prop configuration: AxisConfiguration = new AxisConfiguration(DeviceProfiles.getBuiltIn().axes[0]);
  @Prop @Watch('draftContextChanged') axis: DeviceAxisDefinition = DeviceProfiles.getBuiltIn().axes[0];
  @Prop availableAxes: DeviceAxisDefinition[] = DeviceProfiles.getBuiltIn().axes;
  @Prop compact: boolean = false;
  @Prop showTitle: boolean = true;
  @Prop readOnly: boolean = false;
  onChange: (snapshot: AxisConfiguration) => void = (_snapshot: AxisConfiguration): void => {};
  @State error: string = '';
  private draftToken: number = 0;
  private draftActive: boolean = true;
  @State expandedGroups: string[] = [];
  @State groupStorageError: boolean = false;
  private groupToken: number = 0;
  private groupRevision: number = 0;
  private groupSource: string = '';
  private groupEpoch: number = -1;
  private groupOwner: SettingsDraftOwner | null = null;
  aboutToAppear(): void { this.draftActive = true; this.draftContextChanged(); }
  aboutToDisappear(): void {
    this.draftActive = false; this.draftOwner.release(this.draftToken);
    if (this.groupOwner !== null) { this.groupOwner.release(this.groupToken); }
    this.groupToken = 0;
  }
  private interactionSource(): string { return this.draftScope + ':' + this.draftEpoch + ':' + this.readOnly + this.axis.name + ':' + JSON.stringify(this.configuration); }
  private draftContextChanged(): void {
    this.draftOwner.release(this.draftToken); this.draftToken = 0;
    this.restoreGroupDraft();
  }
  private groupNames(): string[] { return ['script', 'link', 'motion', 'safety', 'home']; }
  private currentGroupSource(): string { return JSON.stringify([this.draftScope, this.axis.name]); }
  private restoreGroupDraft(): void {
    this.groupRevision++;
    if (this.groupOwner !== null) { this.groupOwner.release(this.groupToken); }
    this.groupOwner = this.draftOwner; this.groupSource = this.currentGroupSource(); this.groupEpoch = this.draftEpoch;
    // Expansion belongs only to the page's volatile owner. Epoch/configuration changes
    // retire callbacks without replacing this axis/profile's presentation preference.
    const lease: DraftLease = this.draftOwner.open(this.draftScope, '$axisInspectorGroups:' + this.axis.name, this.groupSource, '[]');
    this.groupToken = lease.token; this.groupStorageError = lease.sourceId === 0 || lease.overflow;
    const retained: string[] = JSON.parse(lease.value) as string[];
    // Older mounts could retain several open sections. Keep their most recently
    // opened valid section; an intentionally closed inspector stays closed.
    this.expandedGroups = retained.filter((group: string): boolean => this.groupNames().indexOf(group) >= 0).slice(-1);
  }
  private groupCurrent(token: number, source: string, epoch: number, owner: SettingsDraftOwner): boolean {
    return this.draftActive && owner === this.draftOwner && owner === this.groupOwner &&
      source === this.groupSource && source === this.currentGroupSource() && epoch === this.draftEpoch &&
      owner.isCurrent(token, source);
  }
  private groupExpanded(group: string): boolean {
    return this.groupSource === this.currentGroupSource() && this.expandedGroups.indexOf(group) >= 0;
  }
  private groupToggleHandler(group: string): () => void {
    // Rendering a header is read-only: only lifecycle/context changes reopen its lease.
    const token: number = this.groupToken; const source: string = this.groupSource;
    const epoch: number = this.groupEpoch; const owner: SettingsDraftOwner = this.draftOwner;
    return (): void => {
      if (!this.groupCurrent(token, source, epoch, owner) || this.groupNames().indexOf(group) < 0) { return; }
      const next: string[] = this.groupExpanded(group) ? [] : [group];
      // No field lease is cleared/released here. A collapsed editor keeps its raw
      // unconfirmed value and validation state, ready for the next mount.
      this.groupStorageError = !owner.write(token, source, JSON.stringify(next));
      if (!this.groupStorageError) { this.groupRevision++; this.expandedGroups = next; }
    };
  }
  private groupHasPending(group: string): boolean {
    let keys: string[] = [];
    if (group === 'motion') { keys = ['motionProviderBlend', 'motionProviderMinimumGapDurationSeconds']; }
    if (group === 'safety') { keys = ['smartLimitTargetValue', 'speedLimitUnitsPerSecond', 'speedSeconds']; }
    if (group === 'home') { keys = ['autoHomeDelaySeconds', 'autoHomeDurationSeconds', 'autoHomeTargetValue']; }
    return keys.some((key: string): boolean => this.draftOwner.hasPending(this.draftScope, key)) ||
      (group === 'safety' && this.draftOwner.hasPending(JSON.stringify([this.draftScope, 'curve', 'coordinates'])));
  }
  private groupSummary(group: string): string {
    const value: AxisConfiguration = this.configuration;
    let summary: string = '';
    if (group === 'script') {
      const option: SettingsOption | undefined = this.interpolationOptions().find((item: SettingsOption): boolean => item.value === value.interpolationType);
      summary = (option === undefined ? value.interpolationType : option.label) + (value.lockScript ? ' · 已锁定' : '') +
        (value.bypassScript ? ' · 跳过脚本' : '') + (value.bypassTransition ? ' · 跳过过渡' : '');
    } else if (group === 'link') {
      summary = value.linkAxis === null ? '未链接' : value.linkAxis + (value.linkAxisHasPriority ? ' · 链接轴优先' : ' · 本轴脚本优先');
    } else if (group === 'motion') {
      summary = (value.selectedMotionProvider === null ? '未选择生成器' : value.selectedMotionProvider + ' · 混合 ' + value.motionProviderBlend) +
        (value.bypassMotionProvider ? ' · 已跳过' : '') + (value.motionProviderFillGaps ? ' · 填补间隙' : '');
    } else if (group === 'safety') {
      summary = value.speedLimitEnabled ? '速度限制 ' + (value.speedLimitUnitsPerSecond === Number.POSITIVE_INFINITY ? '无限制' : value.speedLimitUnitsPerSecond + ' units/s') : '速度限制未启用';
      summary += value.smartLimitInputAxis === null ? ' · 无智能限制输入轴' : ' · 智能限制输入 ' + value.smartLimitInputAxis + (value.smartLimitMode === 'value' ? '（位置）' : '（速度）');
    } else if (group === 'home') {
      summary = value.autoHomeEnabled ? '等待 ' + value.autoHomeDelaySeconds + ' 秒 · 归位 ' + value.autoHomeDurationSeconds + ' 秒' : '未启用';
    }
    return summary + (this.groupHasPending(group) ? ' · 有未应用输入' : '');
  }
  private currentSummary(): string {
    // Applied configuration only. Never substitute a synthetic axis value or
    // imply a script, device or generator is currently running.
    return '已应用 · 强度 ' + this.configuration.scriptScale + '× · 偏移 ' + this.configuration.offsetSeconds +
      ' 秒 · ' + (this.configuration.invertScript ? '反转' : '正向');
  }
  private interactionToken(source: string): number {
    if (!this.draftOwner.isCurrent(this.draftToken, source)) { this.draftToken = this.draftOwner.open(this.draftScope, '$panel', source, '').token; }
    return this.draftToken;
  }
  private ownsInteraction(token: number, source: string): boolean {
    return this.draftActive && !this.readOnly && source === this.interactionSource() && this.draftOwner.isCurrent(token, source);
  }
  private guardedNumber(action: (value: number) => boolean): (value: number) => boolean {
    const source = this.interactionSource(); const token = this.interactionToken(source);
    const revision: number = this.groupRevision;
    return (value: number): boolean => revision === this.groupRevision && this.ownsInteraction(token, source) && action(value);
  }
  private guardedFlag(action: (value: boolean) => void): (value: boolean) => void {
    const source = this.interactionSource(); const token = this.interactionToken(source);
    const revision: number = this.groupRevision;
    return (value: boolean): void => { if (revision === this.groupRevision && this.ownsInteraction(token, source)) { action(value); } };
  }
  private guardedChoice(action: (value: string) => void): (value: string) => void {
    const source = this.interactionSource(); const token = this.interactionToken(source);
    const revision: number = this.groupRevision;
    return (value: string): void => { if (revision === this.groupRevision && this.ownsInteraction(token, source)) { action(value); } };
  }
  private fieldGuard(): () => boolean {
    const source = this.interactionSource(); const token = this.interactionToken(source);
    const revision: number = this.groupRevision;
    return (): boolean => revision === this.groupRevision && this.ownsInteraction(token, source);
  }
  private guardedAction(action: () => void): () => void {
    const source = this.interactionSource(); const token = this.interactionToken(source);
    const revision: number = this.groupRevision;
    return (): void => { if (revision === this.groupRevision && this.ownsInteraction(token, source)) { action(); } };
  }
  private range(field: string): ConfigurationNumberRange {
    const ranges: ConfigurationNumberRange[] = AxisConfiguration.numberRanges();
    const found: ConfigurationNumberRange | undefined = ranges.find(range => range.field === field);
    return found === undefined ? new ConfigurationNumberRange(field, null, null, '') : found;
  }
  private emit(next: AxisConfiguration | null): boolean {
    if (this.readOnly) { return false; }
    if (next === null) { this.error = '设置无效，请检查数值或选项。'; return false; }
    const errors: ConfigurationDiagnostic[] = AxisConfiguration.validate(next, this.axis, this.availableAxes.map(axis => axis.name));
    if (errors.length > 0) { this.error = errors.map(error => error.path + ': ' + error.message).join('；'); return false; }
    this.error = ''; this.onChange(next); return true;
  }
  private curveHandler(): (points: MotionCurvePoint[]) => void {
    const source = this.interactionSource(); const token = this.interactionToken(source);
    const revision: number = this.groupRevision;
    return (points: MotionCurvePoint[]): void => { if (revision === this.groupRevision && this.ownsInteraction(token, source)) { this.emit(AxisSettingsEdits.curve(this.configuration, points)); } };
  }
  private referenceOptions(): SettingsOption[] {
    const options: SettingsOption[] = [new SettingsOption('', '无')];
    for (const axis of this.availableAxes) {
      if (axis.name !== this.axis.name) { options.push(new SettingsOption(axis.name, axis.name + (axis.enabled ? '' : '（已禁用，设置保留）'))); }
    }
    return options;
  }
  private providers(): SettingsOption[] {
    return [new SettingsOption('', '无')].concat(MotionConfigurations.ids().map(id => new SettingsOption(id)));
  }
  private interpolationOptions(): SettingsOption[] {
    return [new SettingsOption('linear', 'Linear'), new SettingsOption('pchip', 'PCHIP'), new SettingsOption('makima', 'Makima'), new SettingsOption('step', 'Step')];
  }
  @Builder
  numberField(field: string, label: string, value: number, unit: string) {
    SettingsNumberField({ editable: !this.readOnly, draftOwner: this.draftOwner, draftScope: this.draftScope, draftEpoch: this.draftEpoch, draftKey: field, draftGuard: this.fieldGuard(), label: label, unit: unit, value: value, compact: this.compact,
      minimum: this.range(field).minimum, maximum: this.range(field).maximum,
      allowInfinity: this.range(field).allowPositiveInfinity,
      onCommit: this.guardedNumber((value: number): boolean => this.emit(AxisSettingsEdits.number(this.configuration, field, value)))})
  }
  @Builder
  switchField(field: string, label: string, value: boolean) {
    SettingsSwitchField({ label: label, value: value, compact: this.compact,
      onChange: this.guardedFlag((value: boolean) => { this.emit(AxisSettingsEdits.flag(this.configuration, field, value)); })})
  }
  @Builder
  referenceField(field: string, label: string, value: string | null) {
    SettingsChoiceField({ label: label, selected: value === null ? '' : value, options: this.referenceOptions(), compact: this.compact,
      onSelect: this.guardedChoice((value: string) => { this.emit(AxisSettingsEdits.choice(this.configuration, field, value)); })})
  }
  @Builder
  groupHeader(group: string, label: string) {
    Button() {
      Row({ space: 8 }) {
        Column({ space: 2 }) {
          Text(label).fontSize(UiStyle.body(this.compact)).fontWeight(FontWeight.Medium).fontColor(this.groupExpanded(group) ? UiStyle.accent : UiStyle.ink).width('100%')
            .textAlign(TextAlign.Start).wordBreak(WordBreak.BREAK_ALL)
          Text(this.groupSummary(group)).fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%')
            .textAlign(TextAlign.Start).wordBreak(WordBreak.BREAK_ALL)
        }.layoutWeight(1).alignItems(HorizontalAlign.Start)
        Text(this.groupExpanded(group) ? '−' : '+').fontSize(20).fontColor(UiStyle.accent).width(24).textAlign(TextAlign.Center)
      }.width('100%')
    }.type(ButtonType.Normal).buttonStyle(ButtonStyleMode.NORMAL).controlSize(ControlSize.NORMAL).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip })
      .constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).width('100%')
      .padding({ left: 0, right: 0, top: 6, bottom: 6 }).backgroundColor(UiStyle.card).borderRadius(0)
      .border({ width: { bottom: 1 }, color: UiStyle.edge })
      .accessibilityText(label + '，' + this.groupSummary(group) + (this.groupExpanded(group) ? '，已展开' : '，已折叠'))
      .onClick(this.groupToggleHandler(group))
  }
  build() {
    // The containing workspace owns vertical scrolling; this panel sizes to content.
    Column() {
      if (this.showTitle) {
        SettingsSectionTitle({ label: this.axis.name + ' · ' + (this.axis.friendlyName === null ? '轴设置' : this.axis.friendlyName) })
      }
      if (!this.axis.enabled) { Text(this.readOnly ? '此轴已禁用；设置仍被保留。' : '此轴已禁用；设置仍被保留，可继续编辑。').fontSize(UiStyle.helper).fontColor(UiStyle.warning).width('100%') }
      if (this.readOnly) { Text('只读模式，可展开查看设置。').fontSize(UiStyle.helper).fontColor(UiStyle.warning).width('100%') }
      Text(this.currentSummary()).fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
      Column() {
        this.numberField('scriptScale', '脚本强度', this.configuration.scriptScale, '倍')
        this.numberField('offsetSeconds', '脚本偏移', this.configuration.offsetSeconds, '秒')
        this.switchField('invertScript', '反转脚本', this.configuration.invertScript)
      }.width('100%').enabled(!this.readOnly).margin({ top: 6, bottom: 6 })

      this.groupHeader('script', '脚本与插值')
      if (this.groupExpanded('script')) {
        Column() {
          this.switchField('lockScript', '锁定脚本', this.configuration.lockScript)
          SettingsChoiceField({ label: '插值类型', selected: this.configuration.interpolationType, options: this.interpolationOptions(), compact: this.compact,
            onSelect: this.guardedChoice((value: string) => { this.emit(AxisSettingsEdits.choice(this.configuration, 'interpolationType', value)); })})
          this.switchField('bypassScript', '跳过脚本', this.configuration.bypassScript)
          this.switchField('bypassTransition', '跳过自定义过渡', this.configuration.bypassTransition)
        }.width('100%').enabled(!this.readOnly).margin({ top: 6, bottom: 8 })
      }
      this.groupHeader('link', '轴链接与优先级')
      if (this.groupExpanded('link')) {
        Column() {
          this.referenceField('linkAxis', '链接目标轴', this.configuration.linkAxis)
          this.switchField('linkAxisHasPriority', '优先使用链接轴脚本', this.configuration.linkAxisHasPriority)
        }.width('100%').enabled(!this.readOnly).margin({ top: 6, bottom: 8 })
      }
      this.groupHeader('motion', '运动混合与间隙')
      if (this.groupExpanded('motion')) {
        Column() {
          SettingsChoiceField({ label: '生成器', selected: this.configuration.selectedMotionProvider === null ? '' : this.configuration.selectedMotionProvider,
            options: this.providers(), compact: this.compact,
            onSelect: this.guardedChoice((value: string) => { this.emit(AxisSettingsEdits.choice(this.configuration, 'selectedMotionProvider', value)); })})
          this.numberField('motionProviderBlend', '运动生成器混合比例', this.configuration.motionProviderBlend, '0–1')
          this.switchField('bypassMotionProvider', '跳过运动生成器', this.configuration.bypassMotionProvider)
          this.switchField('motionProviderFillGaps', '填补脚本间隙', this.configuration.motionProviderFillGaps)
          this.numberField('motionProviderMinimumGapDurationSeconds', '最小填补间隙', this.configuration.motionProviderMinimumGapDurationSeconds, '秒')
          this.switchField('motionProviderSpeedLimitWithAxis', '匹配关联轴速度', this.configuration.motionProviderSpeedLimitWithAxis)
          this.switchField('updateMotionProviderWhenPaused', '媒体暂停时继续', this.configuration.updateMotionProviderWhenPaused)
          this.switchField('updateMotionProviderWithoutScript', '无脚本时继续', this.configuration.updateMotionProviderWithoutScript)
          this.referenceField('updateMotionProviderWithAxis', '仅关联轴运动时更新', this.configuration.updateMotionProviderWithAxis)
        }.width('100%').enabled(!this.readOnly).margin({ top: 6, bottom: 8 })
      }
      this.groupHeader('safety', '安全限速与智能限制')
      if (this.groupExpanded('safety')) {
        Column() {
          SettingsSectionTitle({ label: '速度限制' })
          this.switchField('speedLimitEnabled', '启用速度限制', this.configuration.speedLimitEnabled)
          this.numberField('speedLimitUnitsPerSecond', '每秒完整行程', this.configuration.speedLimitUnitsPerSecond, 'units/s')
          if (this.configuration.speedLimitUnitsPerSecond === Number.POSITIVE_INFINITY) {
            Text('无限制 · 0 秒 / 全行程').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
          } else if (this.configuration.speedLimitUnitsPerSecond === 0) {
            Text('速度为 0：限制为保持当前位置。').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
          }
          if (this.configuration.speedLimitUnitsPerSecond > 0) {
            SettingsNumberField({ editable: !this.readOnly, draftOwner: this.draftOwner, draftScope: this.draftScope, draftEpoch: this.draftEpoch, draftKey: 'speedSeconds', draftGuard: this.fieldGuard(), label: '每次全行程用时（0 = 无限制）', unit: '秒',
              value: this.configuration.speedLimitUnitsPerSecond === Number.POSITIVE_INFINITY ? 0 : 1 / this.configuration.speedLimitUnitsPerSecond,
              minimum: 0, compact: this.compact,
              onCommit: this.guardedNumber((value: number): boolean => this.emit(AxisSettingsEdits.speedFromSeconds(this.configuration, value)))})
          }
          Button('设为无限制').type(ButtonType.Normal).buttonStyle(ButtonStyleMode.NORMAL).controlSize(ControlSize.NORMAL).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip })
            .padding({ left: 12, right: 12, top: 6, bottom: 6 }).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).fontSize(UiStyle.body(this.compact))
            .accessibilityText('设为无限制，0 秒每次全行程')
            .fontColor(UiStyle.ink).backgroundColor(UiStyle.field).border({ width: 1, color: UiStyle.edge }).borderRadius(UiStyle.radius)
            .onClick(this.guardedAction(() => { this.emit(AxisSettingsEdits.speedFromSeconds(this.configuration, 0)); }))
          SettingsSectionTitle({ label: '智能限制' })
          this.referenceField('smartLimitInputAxis', '输入轴', this.configuration.smartLimitInputAxis)
          SettingsChoiceField({ label: '限制模式', selected: this.configuration.smartLimitMode,
            options: [new SettingsOption('value', 'Value · 位置'), new SettingsOption('speed', 'Speed · 速度')], compact: this.compact,
            onSelect: this.guardedChoice((value: string) => { this.emit(AxisSettingsEdits.choice(this.configuration, 'smartLimitMode', value)); })})
          this.numberField('smartLimitTargetValue', '限制目标值', this.configuration.smartLimitTargetValue, '0–1')
          CurvePointEditor({ draftOwner: this.draftOwner, draftScope: this.draftScope, draftKey: 'curve', draftEpoch: this.draftEpoch, bindingKey: 'smart:' + this.axis.name + ':' + this.readOnly, points: this.configuration.smartLimitPoints.map(point => new MotionCurvePoint(point.x, point.y)),
            compact: this.compact, strictX: true, minimumX: this.range('smartLimitPoints.x').minimum,
            maximumX: this.range('smartLimitPoints.x').maximum, minimumY: this.range('smartLimitPoints.y').minimum ?? 0,
            maximumY: this.range('smartLimitPoints.y').maximum ?? 100, viewMinimumX: this.range('smartLimitPoints.x').minimum ?? 0,
            viewMaximumX: this.range('smartLimitPoints.x').maximum ?? 100,
            xLabel: '输入（%）', yLabel: '限制因子（%）',
            onChange: this.curveHandler() })
        }.width('100%').alignItems(HorizontalAlign.Start).enabled(!this.readOnly).margin({ top: 6, bottom: 8 })
      }
      this.groupHeader('home', '自动归位')
      if (this.groupExpanded('home')) {
        Column() {
          this.switchField('autoHomeEnabled', '启用自动归位', this.configuration.autoHomeEnabled)
          this.switchField('autoHomeInsideScript', '允许脚本内部自动归位', this.configuration.autoHomeInsideScript)
          this.numberField('autoHomeDelaySeconds', '归位等待', this.configuration.autoHomeDelaySeconds, '秒')
          this.numberField('autoHomeDurationSeconds', '归位时长', this.configuration.autoHomeDurationSeconds, '秒')
          this.numberField('autoHomeTargetValue', '归位目标', this.configuration.autoHomeTargetValue, '0–1')
        }.width('100%').enabled(!this.readOnly).margin({ top: 6, bottom: 8 })
      }
      if (this.groupStorageError) { Text('展开状态暂时无法保留，请重新打开此设置区后重试。').fontSize(UiStyle.helper).fontColor(UiStyle.warning).width('100%').margin({ top: 8 }) }
      if (this.error.length > 0) { Text(this.error).fontSize(UiStyle.helper).fontColor(UiStyle.danger).width('100%').margin({ top: 8 }) }
    }.width('100%').padding({ top: UiStyle.padding(this.compact), bottom: UiStyle.padding(this.compact) })
  }
}
