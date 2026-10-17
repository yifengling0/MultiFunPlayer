import { SettingsDraftOwner } from '../presentation/SettingsDraftOwner';
import { UiStyle } from '../presentation/UiStyle';
import { MotionProviderConfiguration, MotionConfigurations, MotionCurvePoint } from '../core/MotionConfiguration';
import { MotionControlValues, MotionControlField, MotionControlResult, createMotionControlValues, transferMotionControlValues, userEditMotionControlValue } from '../core/MotionControlValues';
import { CurvePointEditor, SettingsNumberField, SettingsSwitchField, SettingsChoiceField, SettingsOption, SettingsSectionTitle } from './CurvePointEditor';

/** Only existing managed Download scripts may be supplied. This component never opens files. */
export class ManagedMotionScriptResource {
  uri: string;
  name: string;
  constructor(uri: string, name: string) { this.uri = uri; this.name = name; }
}

export class MotionSettingsEdits {
  static number(configuration: MotionProviderConfiguration, field: string, value: number): MotionProviderConfiguration | null {
    const next: MotionProviderConfiguration = MotionConfigurations.clone(configuration);
    switch (field) {
      case 'speed': next.speed = value; break;
      case 'minimum': next.minimum = value; break;
      case 'maximum': next.maximum = value; break;
      case 'octaves': if (next.id !== 'Random') { return null; } next.octaves = value; break;
      case 'persistence': if (next.id !== 'Random') { return null; } next.persistence = value; break;
      case 'lacunarity': if (next.id !== 'Random') { return null; } next.lacunarity = value; break;
      case 'durationSeconds': if (next.id !== 'Custom Curve') { return null; } next.durationSeconds = value; break;
      default: return null;
    }
    return MotionConfigurations.validate(next).length === 0 ? next : null;
  }
  static flag(configuration: MotionProviderConfiguration, field: string, value: boolean): MotionProviderConfiguration | null {
    if (configuration.id !== 'Custom Curve') { return null; }
    const next: MotionProviderConfiguration = MotionConfigurations.clone(configuration);
    if (field === 'isLooping') { next.isLooping = value; }
    else if (field === 'syncOnEnd') { next.syncOnEnd = value; }
    else { return null; }
    return next;
  }
  static choice(configuration: MotionProviderConfiguration, field: string, value: string): MotionProviderConfiguration | null {
    const next: MotionProviderConfiguration = MotionConfigurations.clone(configuration);
    if (field === 'pattern' && next.id === 'Pattern') {
      if (value !== 'triangle' && value !== 'sine' && value !== 'doubleBounce' && value !== 'sharpBounce' && value !== 'saw' && value !== 'square') { return null; }
      next.pattern = value;
    } else if (field === 'interpolationMode' && (next.id === 'Custom Curve' || next.id === 'Looping Script')) {
      if (value !== 'linear' && value !== 'pchip' && value !== 'makima' && value !== 'step') { return null; }
      next.interpolationMode = value;
    } else { return null; }
    return next;
  }
  static resource(configuration: MotionProviderConfiguration, uri: string,
    resources: ManagedMotionScriptResource[]): MotionProviderConfiguration | null {
    if (configuration.id !== 'Looping Script' || (uri.length > 0 && !resources.some(resource => resource.uri === uri))) { return null; }
    const next: MotionProviderConfiguration = MotionConfigurations.clone(configuration);
    next.sourceUri = uri.length > 0 ? uri : null;
    return MotionConfigurations.validate(next).length === 0 ? next : null;
  }
  static curve(configuration: MotionProviderConfiguration, points: MotionCurvePoint[]): MotionProviderConfiguration | null {
    if (configuration.id !== 'Custom Curve') { return null; }
    const next: MotionProviderConfiguration = MotionConfigurations.clone(configuration);
    next.points = points.map(point => new MotionCurvePoint(point.x, point.y));
    return MotionConfigurations.validate(next).length === 0 ? next : null;
  }
}

@Component
export struct MotionSettingsPanel {
  // Reference ownership is page-local; @Prop would deep-copy and split the draft store.
  draftOwner: SettingsDraftOwner = new SettingsDraftOwner();
  @Prop @Watch('draftContextChanged') draftScope: string = '';
  @Prop @Watch('draftContextChanged') draftEpoch: number = 0;
  @Prop @Watch('configurationChanged') configuration: MotionProviderConfiguration = new MotionProviderConfiguration('Random');
  @Prop scriptResources: ManagedMotionScriptResource[] = [];
  @Prop compact: boolean = false;
  @Prop @Watch('availabilityChanged') readOnly: boolean = false;
  @Prop @Watch('bindingChanged') bindingKey: string = '';
  onGeometry: (ownerId: number, width: number, height: number, attached: boolean) => void = (_ownerId: number, _width: number, _height: number, _attached: boolean): void => {};
  onChange: (snapshot: MotionProviderConfiguration) => void = (_snapshot: MotionProviderConfiguration): void => {};
  onReset?: () => void;
  @State error: string = '';
  @State renderRevision: number = 0;
  @State controlValues: MotionControlValues | null = null;
  private controlDraftToken: number = 0;
  private controlDraftSource: string = '';
  private active: boolean = true;
  private editEpoch: number = 0;
  private observedBindingKey: string = '';
  private observedProvider: string = '';
  private observedSnapshot: string = '';
  aboutToAppear(): void { this.active = true; this.resetControls(); }
  aboutToDisappear(): void { this.active = false; this.draftOwner.release(this.controlDraftToken); this.retireEdits(); }
  private draftContextChanged(): void {
    this.retireEdits();
    if (this.active) { this.restoreControlDraft(this.controlValues === null ? transferMotionControlValues(createMotionControlValues(), this.configuration).state : this.controlValues); }
  }
  private restoreControlDraft(initial: MotionControlValues): void {
    this.draftOwner.release(this.controlDraftToken);
    this.controlDraftSource = this.draftScope + ':' + JSON.stringify(this.configuration);
    const lease = this.draftOwner.open(this.draftScope, '$controlValues', this.controlDraftSource, JSON.stringify(initial));
    this.controlDraftToken = lease.token;
    try { this.controlValues = JSON.parse(lease.value) as MotionControlValues; }
    catch { this.controlValues = initial; }
  }
  private saveControlDraft(): void {
    if (this.controlValues !== null && !this.draftOwner.write(this.controlDraftToken, this.controlDraftSource, JSON.stringify(this.controlValues))) {
      this.error = '控件草稿已失效，请重新编辑。';
    }
  }
  private retireEdits(): void { this.editEpoch++; this.renderRevision++; }
  private resetControls(): void {
    this.retireEdits(); this.error = '';
    this.observedBindingKey = this.bindingKey; this.observedProvider = this.configuration.id;
    this.observedSnapshot = JSON.stringify(this.configuration);
    // Portable initial order is minimum -> maximum -> octaves. WPF first-binding
    // and retained-popup scheduling remain unproved; attachment never writes back.
    this.restoreControlDraft(transferMotionControlValues(createMotionControlValues(), this.configuration).state);
  }
  private bindingChanged(): void { if (this.active) { this.resetControls(); } }
  private availabilityChanged(): void { this.retireEdits(); }
  private configurationChanged(): void {
    if (!this.active) { return; }
    if (this.controlValues === null || this.observedBindingKey !== this.bindingKey ||
      this.observedProvider !== this.configuration.id) { this.resetControls(); return; }
    const snapshot: string = JSON.stringify(this.configuration);
    if (snapshot === this.observedSnapshot) { return; }
    this.observedSnapshot = snapshot; this.retireEdits(); this.error = '';
    // Retain coercion history across source notifications. The pure transfer
    // changes only differing source fields; identical render snapshots are inert.
    this.restoreControlDraft(transferMotionControlValues(this.controlValues, this.configuration).state);
  }
  private ownsEdit(key: string, snapshot: string, epoch: number): boolean {
    return this.active && !this.readOnly && this.draftOwner.isCurrent(this.controlDraftToken, this.controlDraftSource) &&
      this.controlDraftSource === this.draftScope + ':' + JSON.stringify(this.configuration) && key === this.bindingKey && epoch === this.editEpoch &&
      this.observedBindingKey === key && this.observedProvider === this.configuration.id &&
      this.observedSnapshot === snapshot && snapshot === JSON.stringify(this.configuration);
  }
  private numberHandler(field: string): (value: number) => boolean {
    const key: string = this.bindingKey; const snapshot: string = JSON.stringify(this.configuration);
    const epoch: number = this.editEpoch;
    return (value: number): boolean => this.ownsEdit(key, snapshot, epoch) && this.changeNumber(field, value);
  }
  private changeNumber(field: string, value: number): boolean {
    if (!this.active || this.readOnly) { return false; }
    if (field !== 'minimum' && field !== 'maximum' && field !== 'octaves') {
      return this.emit(MotionSettingsEdits.number(this.configuration, field, value));
    }
    if (this.controlValues === null || (field === 'octaves' && this.configuration.id !== 'Random')) { return false; }
    let result: MotionControlResult;
    try { result = userEditMotionControlValue(this.controlValues, field as MotionControlField, value); }
    catch (_error) { return this.emit(null); }
    let next: MotionProviderConfiguration | null = this.configuration;
    for (const commit of result.commits) {
      if (next !== null) { next = MotionSettingsEdits.number(next, commit.field, commit.value); }
    }
    const key: string = this.bindingKey; const provider: string = this.configuration.id;
    const expectedEpoch: number = this.editEpoch + 1;
    const committedSnapshot: string = JSON.stringify(next);
    if (!this.emit(next)) { return false; }
    // onChange returns void, not acceptance. Adopt only an already accepted
    // snapshot; otherwise its watched host echo will transfer later. A rejected
    // edit leaves the old effective state intact. Never overwrite newer context.
    if (this.active && !this.readOnly && this.bindingKey === key && this.configuration.id === provider &&
      this.editEpoch === expectedEpoch && JSON.stringify(this.configuration) === committedSnapshot) { this.controlValues = result.state; this.saveControlDraft(); }
    return true;
  }
  private choiceHandler(field: string): (value: string) => void {
    const key: string = this.bindingKey; const snapshot: string = JSON.stringify(this.configuration);
    const epoch: number = this.editEpoch;
    return (value: string): void => {
      if (!this.ownsEdit(key, snapshot, epoch)) { return; }
      this.emit(field === 'sourceUri' ? MotionSettingsEdits.resource(this.configuration, value, this.scriptResources) :
        MotionSettingsEdits.choice(this.configuration, field, value));
    };
  }
  private flagHandler(field: string): (value: boolean) => void {
    const key: string = this.bindingKey; const snapshot: string = JSON.stringify(this.configuration);
    const epoch: number = this.editEpoch;
    return (value: boolean): void => { if (this.ownsEdit(key, snapshot, epoch)) { this.emit(MotionSettingsEdits.flag(this.configuration, field, value)); } };
  }
  private curveHandler(): (points: MotionCurvePoint[]) => void {
    const key: string = this.bindingKey; const snapshot: string = JSON.stringify(this.configuration);
    const epoch: number = this.editEpoch;
    return (points: MotionCurvePoint[]): void => { if (this.ownsEdit(key, snapshot, epoch)) { this.emit(MotionSettingsEdits.curve(this.configuration, points)); } };
  }
  private resetHandler(): () => void {
    const key: string = this.bindingKey; const snapshot: string = JSON.stringify(this.configuration);
    const epoch: number = this.editEpoch;
    return (): void => { if (this.ownsEdit(key, snapshot, epoch)) { this.resetCurve(); } };
  }
  private effectiveValue(field: MotionControlField): number {
    if (field === 'minimum') { return this.controlValues === null ? this.configuration.minimum : this.controlValues.minimum; }
    if (field === 'maximum') { return this.controlValues === null ? this.configuration.maximum : this.controlValues.maximum; }
    return this.controlValues === null ? this.optionalNumber('octaves') : this.controlValues.octaves;
  }
  private rangeDifference(): string {
    const minimum: number = this.effectiveValue('minimum'); const maximum: number = this.effectiveValue('maximum');
    if (minimum === this.configuration.minimum && maximum === this.configuration.maximum) { return ''; }
    return '模型范围：[' + this.configuration.minimum + ', ' + this.configuration.maximum + ']；控件范围：[' + minimum + ', ' + maximum + ']。';
  }
  private octavesDifference(): string {
    const actual: number = this.optionalNumber('octaves'); const effective: number = this.effectiveValue('octaves');
    return actual === effective ? '' : '模型 Octaves：' + actual + '；控件值：' + effective + '。仅明确编辑才更新模型。';
  }
  private resetCurve(): void {
    if (this.active && !this.readOnly && this.configuration.id === 'Custom Curve' && this.onReset !== undefined) { this.onReset(); }
  }
  private emit(next: MotionProviderConfiguration | null): boolean {
    if (!this.active || this.readOnly) { return false; }
    if (next === null) { this.error = '参数超出该生成器允许范围，或脚本不在已管理的 Download 列表中。'; return false; }
    this.error = ''; this.retireEdits(); this.onChange(next); return true;
  }
  private resources(): SettingsOption[] {
    return [new SettingsOption('', '无脚本')].concat(this.scriptResources.map(resource => new SettingsOption(resource.uri, resource.name)));
  }
  private patterns(): SettingsOption[] {
    return [new SettingsOption('triangle', 'Triangle · 三角'), new SettingsOption('sine', 'Sine · 正弦'),
      new SettingsOption('doubleBounce', 'Double bounce · 双弹跳'), new SettingsOption('sharpBounce', 'Sharp bounce · 尖弹跳'),
      new SettingsOption('saw', 'Saw · 锯齿'), new SettingsOption('square', 'Square · 方波')];
  }
  private interpolations(): SettingsOption[] {
    return [new SettingsOption('linear', 'Linear'), new SettingsOption('pchip', 'PCHIP'), new SettingsOption('makima', 'Makima'), new SettingsOption('step', 'Step')];
  }
  private optionalNumber(field: string): number {
    const defaults: MotionProviderConfiguration = new MotionProviderConfiguration(this.configuration.id);
    if (field === 'octaves') { return this.configuration.octaves ?? defaults.octaves ?? 0; }
    if (field === 'persistence') { return this.configuration.persistence ?? defaults.persistence ?? 0; }
    if (field === 'lacunarity') { return this.configuration.lacunarity ?? defaults.lacunarity ?? 0; }
    return this.configuration.durationSeconds ?? defaults.durationSeconds ?? 0;
  }
  @Builder
  numberField(field: string, label: string, value: number, unit: string) {
    // A source/context change remounts numeric drafts even if its effective value
    // is unchanged. An old focus/blur/submit can never retarget a newer context.
    ForEach([field + ':' + this.renderRevision], (_identity: string) => {
      SettingsNumberField({ draftOwner: this.draftOwner, draftScope: this.draftScope, draftEpoch: this.draftEpoch, draftKey: field, label: label, value: value, unit: unit, compact: this.compact, editable: !this.readOnly,
        integer: field === 'octaves', commitEqualEdits: field === 'minimum' || field === 'maximum' || field === 'octaves',
        onCommit: this.numberHandler(field) })
    }, (identity: string) => identity)
  }
  build() {
    // The containing workspace owns vertical scrolling; this panel sizes to content.
    Column() {
      Column() {
        SettingsSectionTitle({ label: this.configuration.id + ' · 生成器参数', topLevel: true })
        if (this.configuration.id === 'Pattern') {
          SettingsChoiceField({ label: '波形', selected: this.configuration.pattern ?? '', options: this.patterns(), compact: this.compact,
            onSelect: this.choiceHandler('pattern') })
        }
        if (this.configuration.id === 'Looping Script') {
          SettingsChoiceField({ label: 'Download 脚本', selected: this.configuration.sourceUri ?? '', options: this.resources(), compact: this.compact,
            onSelect: this.choiceHandler('sourceUri') })
          if (this.scriptResources.length === 0) {
            Text('暂无可选脚本。将脚本放入应用 Download 目录，再在资源列表中刷新。').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
          }
          if (this.configuration.sourceUri !== null && this.configuration.sourceUri !== undefined &&
            !this.scriptResources.some(resource => resource.uri === this.configuration.sourceUri)) {
            Text('已保存的脚本当前不可用，引用仍被保留。').fontSize(UiStyle.helper).fontColor(UiStyle.warning).width('100%')
          }
        }
        if (this.configuration.id === 'Custom Curve' || this.configuration.id === 'Looping Script') {
          SettingsChoiceField({ label: '插值类型', selected: this.configuration.interpolationMode ?? '', options: this.interpolations(), compact: this.compact,
            onSelect: this.choiceHandler('interpolationMode') })
        }
        if (this.configuration.id === 'Custom Curve') {
          this.numberField('durationSeconds', '时长', this.optionalNumber('durationSeconds'), '秒')
        }
        this.numberField('speed', '速度', this.configuration.speed, '倍')
        if (this.configuration.id === 'Custom Curve') {
          SettingsSwitchField({ label: '循环', value: this.configuration.isLooping ?? false, compact: this.compact,
            onChange: this.flagHandler('isLooping') })
          if (this.onReset !== undefined) {
            Button('重置曲线播放 · RESET')
              .type(ButtonType.Normal).buttonStyle(ButtonStyleMode.NORMAL).controlSize(ControlSize.NORMAL).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 14, right: 14, top: 12, bottom: 12 }).width('100%').constraintSize({ minHeight: UiStyle.control, maxWidth: '100%', minWidth: UiStyle.control }).fontSize(UiStyle.body(this.compact))
              .borderRadius(UiStyle.radius).fontColor(UiStyle.ink).backgroundColor(UiStyle.field).border({ width: 1, color: UiStyle.edge })
              .stateStyles({
                focused: { .outline({ width: 2, color: UiStyle.accent }) },
                disabled: { .opacity(UiStyle.disabledOpacity) }
              }).onClick(this.resetHandler())
          }
          SettingsSwitchField({ label: '结束时同步', value: this.configuration.syncOnEnd ?? false, compact: this.compact,
            onChange: this.flagHandler('syncOnEnd') })
        }
        SettingsSectionTitle({ label: '输出范围 · RANGE' })
        this.numberField('minimum', '最小值', this.effectiveValue('minimum'), '0–1 · 控件值')
        this.numberField('maximum', '最大值', this.effectiveValue('maximum'), '0–1 · 控件值')
        if (this.rangeDifference().length > 0) { Text(this.rangeDifference()).fontSize(UiStyle.helper).fontColor(UiStyle.warning).width('100%') }
        Text('控件保留最小间距 0.01；模型可保留反向范围。显示或打开面板不回写模型。').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
        if (this.configuration.id === 'Random') {
          SettingsSectionTitle({ label: '高级设置 · ADVANCED' })
          this.numberField('octaves', 'Octaves · 叠加层数', this.effectiveValue('octaves'), '1–8 · 控件值')
          if (this.octavesDifference().length > 0) { Text(this.octavesDifference()).fontSize(UiStyle.helper).fontColor(UiStyle.warning).width('100%') }
          this.numberField('persistence', 'Persistence · 持续度', this.optionalNumber('persistence'), '')
          this.numberField('lacunarity', 'Lacunarity · 频率倍率', this.optionalNumber('lacunarity'), '')
        }
        if (this.configuration.id === 'Custom Curve') {
          SettingsSectionTitle({ label: '自定义控制点 · CURVE' })
          CurvePointEditor({ draftOwner: this.draftOwner, draftScope: this.draftScope, draftKey: 'curve', draftEpoch: this.draftEpoch, points: this.configuration.points ?? [], compact: this.compact, bindingKey: this.bindingKey, onGeometry: this.onGeometry,
            viewMaximumX: this.optionalNumber('durationSeconds'), maximumPoints: MotionConfigurations.MAX_POINTS,
            interpolationMode: this.configuration.interpolationMode ?? 'linear', isLooping: this.configuration.isLooping ?? false,
            xLabel: '时间（秒）', yLabel: '位置（0–1）',
            onChange: this.curveHandler() })
        }
        if (this.error.length > 0) { Text(this.error).fontSize(UiStyle.helper).fontColor(UiStyle.danger).width('100%').margin({ top: 8 }) }
      }.width('100%').padding({ top: UiStyle.padding(this.compact), bottom: UiStyle.padding(this.compact) }).enabled(!this.readOnly)
    }.width('100%')
  }
}
