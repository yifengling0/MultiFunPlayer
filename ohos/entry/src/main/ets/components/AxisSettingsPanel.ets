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
  @Prop configuration: AxisConfiguration = new AxisConfiguration(DeviceProfiles.getBuiltIn().axes[0]);
  @Prop axis: DeviceAxisDefinition = DeviceProfiles.getBuiltIn().axes[0];
  @Prop availableAxes: DeviceAxisDefinition[] = DeviceProfiles.getBuiltIn().axes;
  @Prop compact: boolean = false;
  @Prop readOnly: boolean = false;
  onChange: (snapshot: AxisConfiguration) => void = (_snapshot: AxisConfiguration): void => {};
  @State error: string = '';
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
    SettingsNumberField({ label: label, unit: unit, value: value, compact: this.compact,
      minimum: this.range(field).minimum, maximum: this.range(field).maximum,
      allowInfinity: this.range(field).allowPositiveInfinity,
      onCommit: (value: number): boolean => this.emit(AxisSettingsEdits.number(this.configuration, field, value)) })
  }
  @Builder
  switchField(field: string, label: string, value: boolean) {
    SettingsSwitchField({ label: label, value: value, compact: this.compact,
      onChange: (value: boolean) => { this.emit(AxisSettingsEdits.flag(this.configuration, field, value)); } })
  }
  @Builder
  referenceField(field: string, label: string, value: string | null) {
    SettingsChoiceField({ label: label, selected: value === null ? '' : value, options: this.referenceOptions(), compact: this.compact,
      onSelect: (value: string) => { this.emit(AxisSettingsEdits.choice(this.configuration, field, value)); } })
  }
  build() {
    // The containing workspace owns vertical scrolling; this panel sizes to content.
    Column() {
      Column() {
        SettingsSectionTitle({ label: this.axis.name + ' · ' + (this.axis.friendlyName === null ? '轴设置' : this.axis.friendlyName) })
        if (!this.axis.enabled) { Text('此轴已禁用；设置仍被保留，可继续编辑。').fontSize(UiStyle.helper).fontColor(UiStyle.warning).width('100%') }
        SettingsSectionTitle({ label: '脚本 · SCRIPT' })
        this.switchField('lockScript', '锁定脚本', this.configuration.lockScript)
        this.switchField('invertScript', '反转脚本', this.configuration.invertScript)
        this.numberField('offsetSeconds', '脚本偏移', this.configuration.offsetSeconds, '秒')
        this.numberField('scriptScale', '脚本缩放', this.configuration.scriptScale, '倍')
        SettingsChoiceField({ label: '插值类型', selected: this.configuration.interpolationType, options: this.interpolationOptions(), compact: this.compact,
          onSelect: (value: string) => { this.emit(AxisSettingsEdits.choice(this.configuration, 'interpolationType', value)); } })
        SettingsSectionTitle({ label: '跳过处理 · BYPASS' })
        this.switchField('bypassScript', '跳过脚本', this.configuration.bypassScript)
        this.switchField('bypassMotionProvider', '跳过运动生成器', this.configuration.bypassMotionProvider)
        this.switchField('bypassTransition', '跳过自定义过渡', this.configuration.bypassTransition)
        SettingsSectionTitle({ label: '脚本链接 · LINK' })
        this.referenceField('linkAxis', '链接目标轴', this.configuration.linkAxis)
        this.switchField('linkAxisHasPriority', '优先使用链接轴脚本', this.configuration.linkAxisHasPriority)
        SettingsSectionTitle({ label: '运动生成器 · MOTION' })
        SettingsChoiceField({ label: '生成器', selected: this.configuration.selectedMotionProvider === null ? '' : this.configuration.selectedMotionProvider,
          options: this.providers(), compact: this.compact,
          onSelect: (value: string) => { this.emit(AxisSettingsEdits.choice(this.configuration, 'selectedMotionProvider', value)); } })
        this.numberField('motionProviderBlend', '运动生成器混合比例', this.configuration.motionProviderBlend, '0–1')
        this.switchField('motionProviderFillGaps', '填补脚本间隙', this.configuration.motionProviderFillGaps)
        this.numberField('motionProviderMinimumGapDurationSeconds', '最小填补间隙', this.configuration.motionProviderMinimumGapDurationSeconds, '秒')
        this.switchField('motionProviderSpeedLimitWithAxis', '匹配关联轴速度', this.configuration.motionProviderSpeedLimitWithAxis)
        this.switchField('updateMotionProviderWhenPaused', '媒体暂停时继续', this.configuration.updateMotionProviderWhenPaused)
        this.switchField('updateMotionProviderWithoutScript', '无脚本时继续', this.configuration.updateMotionProviderWithoutScript)
        this.referenceField('updateMotionProviderWithAxis', '仅关联轴运动时更新', this.configuration.updateMotionProviderWithAxis)
        SettingsSectionTitle({ label: '智能限制 · SMART LIMIT' })
        this.referenceField('smartLimitInputAxis', '输入轴', this.configuration.smartLimitInputAxis)
        SettingsChoiceField({ label: '限制模式', selected: this.configuration.smartLimitMode,
          options: [new SettingsOption('value', 'Value · 位置'), new SettingsOption('speed', 'Speed · 速度')], compact: this.compact,
          onSelect: (value: string) => { this.emit(AxisSettingsEdits.choice(this.configuration, 'smartLimitMode', value)); } })
        this.numberField('smartLimitTargetValue', '限制目标值', this.configuration.smartLimitTargetValue, '0–1')
        CurvePointEditor({ bindingKey: 'smart:' + this.axis.name + ':' + this.readOnly, points: this.configuration.smartLimitPoints.map(point => new MotionCurvePoint(point.x, point.y)),
          compact: this.compact, strictX: true, minimumX: this.range('smartLimitPoints.x').minimum,
          maximumX: this.range('smartLimitPoints.x').maximum, minimumY: this.range('smartLimitPoints.y').minimum ?? 0,
          maximumY: this.range('smartLimitPoints.y').maximum ?? 100, viewMinimumX: this.range('smartLimitPoints.x').minimum ?? 0,
          viewMaximumX: this.range('smartLimitPoints.x').maximum ?? 100,
          xLabel: '输入（%）', yLabel: '限制因子（%）',
          onChange: (points: MotionCurvePoint[]) => { this.emit(AxisSettingsEdits.curve(this.configuration, points)); } })
        SettingsSectionTitle({ label: '速度限制 · SPEED LIMIT' })
        this.switchField('speedLimitEnabled', '启用速度限制', this.configuration.speedLimitEnabled)
        this.numberField('speedLimitUnitsPerSecond', '每秒完整行程', this.configuration.speedLimitUnitsPerSecond, 'units/s')
        if (this.configuration.speedLimitUnitsPerSecond === Number.POSITIVE_INFINITY) {
          Text('无限制 · 0 秒 / 全行程').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
        } else if (this.configuration.speedLimitUnitsPerSecond === 0) {
          Text('速度为 0：限制为保持当前位置。').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
        }
        if (this.configuration.speedLimitUnitsPerSecond > 0) {
          SettingsNumberField({ label: '每次全行程用时（0 = 无限制）', unit: '秒',
            value: this.configuration.speedLimitUnitsPerSecond === Number.POSITIVE_INFINITY ? 0 : 1 / this.configuration.speedLimitUnitsPerSecond,
            minimum: 0, compact: this.compact,
            onCommit: (value: number): boolean => this.emit(AxisSettingsEdits.speedFromSeconds(this.configuration, value)) })
        }
        Button('设为无限制（0 秒 / 全行程）').fontColor(UiStyle.ink).backgroundColor(UiStyle.accentSoft)
          .type(ButtonType.Normal).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 14, right: 14, top: 12, bottom: 12 }).width('100%').constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).fontSize(UiStyle.body(this.compact))
          .fontColor(UiStyle.ink).backgroundColor(UiStyle.accentSoft).borderRadius(UiStyle.radius)
          .onClick(() => { this.emit(AxisSettingsEdits.speedFromSeconds(this.configuration, 0)); })
        SettingsSectionTitle({ label: '自动归位 · AUTO HOME' })
        this.switchField('autoHomeEnabled', '启用自动归位', this.configuration.autoHomeEnabled)
        this.switchField('autoHomeInsideScript', '允许脚本内部自动归位', this.configuration.autoHomeInsideScript)
        this.numberField('autoHomeDelaySeconds', '归位等待', this.configuration.autoHomeDelaySeconds, '秒')
        this.numberField('autoHomeDurationSeconds', '归位时长', this.configuration.autoHomeDurationSeconds, '秒')
        this.numberField('autoHomeTargetValue', '归位目标', this.configuration.autoHomeTargetValue, '0–1')
        if (this.error.length > 0) { Text(this.error).fontSize(UiStyle.helper).fontColor(UiStyle.danger).width('100%').margin({ top: 8 }) }
      }.width('100%').padding({ top: UiStyle.padding(this.compact), bottom: UiStyle.padding(this.compact) }).enabled(!this.readOnly)
    }.width('100%')
  }
}
