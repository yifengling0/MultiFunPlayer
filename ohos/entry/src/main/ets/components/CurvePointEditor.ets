import { MfpSelectMaterialModifier, MfpToggleMaterialModifier } from '../presentation/immersive/ImmersiveMaterialModifiers';
import { UiStyle } from '../presentation/UiStyle';
import { DraftLease, SettingsDraftOwner } from '../presentation/SettingsDraftOwner';
import { KeyboardInputSession } from '../app/KeyboardInputSession';
import { MotionCurvePoint, MotionConfigurations } from '../core/MotionConfiguration';
import { CurvePreview, CurvePreviewResult } from '../core/CurvePreview';
import type { InterpolationMode } from '../core/Interpolation';

/** Stateless form/curve rules, also exercised without ArkUI by ui-settings tests. */
export class SettingsNumberLogic {
  static parse(text: string, allowInfinity: boolean = false): number | null {
    const trimmed: string = text.trim();
    if (allowInfinity && (trimmed === '无限制' || trimmed === 'Infinity' || trimmed === '∞')) {
      return Number.POSITIVE_INFINITY;
    }
    if (trimmed.length === 0 || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)) { return null; }
    const value: number = Number(trimmed);
    return Number.isFinite(value) ? value : null;
  }
  static format(value: number): string { return value === Number.POSITIVE_INFINITY ? '无限制' : String(value); }
  static valid(value: number, minimum: number | null, maximum: number | null,
    allowInfinity: boolean = false, integer: boolean = false): boolean {
    if (value === Number.POSITIVE_INFINITY && allowInfinity) { return true; }
    return Number.isFinite(value) && (!integer || Number.isInteger(value)) &&
      (minimum === null || value >= minimum) && (maximum === null || value <= maximum);
  }
}

export class SettingsOption {
  value: string;
  label: string;
  constructor(value: string, label: string = value) { this.value = value; this.label = label; }
}

export class CurveEditRules {
  static copy(points: MotionCurvePoint[]): MotionCurvePoint[] {
    return points.map(point => new MotionCurvePoint(point.x, point.y));
  }
  static replace(points: MotionCurvePoint[], index: number, x: number, y: number,
    minimumX: number | null, maximumX: number | null, minimumY: number, maximumY: number,
    strictX: boolean): MotionCurvePoint[] | null {
    if (index < 0 || index >= points.length || !SettingsNumberLogic.valid(x, minimumX, maximumX) ||
      !SettingsNumberLogic.valid(y, minimumY, maximumY)) { return null; }
    if (strictX && ((index > 0 && x <= points[index - 1].x) ||
      (index + 1 < points.length && x >= points[index + 1].x))) { return null; }
    const result: MotionCurvePoint[] = CurveEditRules.copy(points);
    result[index] = new MotionCurvePoint(x, y);
    return result;
  }
  static add(points: MotionCurvePoint[], x: number, y: number,
    minimumX: number | null, maximumX: number | null, minimumY: number, maximumY: number,
    strictX: boolean, maximumPoints: number): MotionCurvePoint[] | null {
    if (points.length >= maximumPoints || !SettingsNumberLogic.valid(x, minimumX, maximumX) ||
      !SettingsNumberLogic.valid(y, minimumY, maximumY) || (strictX && points.some(point => point.x === x))) { return null; }
    const result: MotionCurvePoint[] = CurveEditRules.copy(points);
    result.push(new MotionCurvePoint(x, y));
    if (strictX) { result.sort((left: MotionCurvePoint, right: MotionCurvePoint) => left.x - right.x); }
    return result;
  }
  static remove(points: MotionCurvePoint[], index: number): MotionCurvePoint[] {
    return CurveEditRules.copy(points).filter((_point: MotionCurvePoint, candidate: number) => candidate !== index);
  }
}

/** Process-local identity only; never persisted or reused after remount. */
export class CurveGeometryOwners {
  private static sequence: number = 0;
  static next(): number {
    if (CurveGeometryOwners.sequence >= Number.MAX_SAFE_INTEGER) { throw new Error('Curve owner identity exhausted.'); }
    return ++CurveGeometryOwners.sequence;
  }
}

@Component
export struct SettingsNumberField {
  private keyboardEditorId: number = KeyboardInputSession.newEditorId();
  draftOwner: SettingsDraftOwner = new SettingsDraftOwner();
  @Prop @Watch('refreshValue') draftScope: string = '';
  @Prop @Watch('refreshValue') draftKey: string = '';
  @Prop @Watch('refreshValue') draftSource: string = '';
  @Prop @Watch('refreshValue') draftEpoch: number = 0;
  draftGuard: () => boolean = (): boolean => true;
  private draftToken: number = 0;
  private leaseOwner: SettingsDraftOwner | null = null;
  private leaseScope: string = '';
  private leaseKey: string = '';
  private leaseEpoch: number = 0;
  private draftMounted: boolean = false;
  aboutToDisappear(): void {
    this.draftMounted = false;
    if (this.leaseOwner !== null) { this.leaseOwner.release(this.draftToken); }
    this.draftToken = 0; KeyboardInputSession.releaseEditor(this.keyboardEditorId);
  }
  @State fieldWidth: number = 0;
  measureField(width: number): void { if (Number.isFinite(width) && width > 0) { this.fieldWidth = width; } }
  @Prop @Watch('refreshValue') label: string = '';
  @Prop @Watch('refreshValue') value: number = 0;
  @Prop @Watch('refreshValue') minimum: number | null = null;
  @Prop @Watch('refreshValue') maximum: number | null = null;
  @Prop @Watch('refreshValue') allowInfinity: boolean = false;
  @Prop @Watch('refreshValue') integer: boolean = false;
  @Prop compact: boolean = false;
  @Prop unit: string = '';
  @Prop @Watch('refreshValue') editable: boolean = true;
  @Prop commitEqualEdits: boolean = false;
  @State private edited: boolean = false;
  @State private focused: boolean = false;
  onCommit: (value: number) => boolean = (_value: number): boolean => true;
  onEdit: () => void = (): void => {};
  @State draft: string = '';
  @State error: boolean = false;
  @State storageError: boolean = false;
  aboutToAppear(): void {
    KeyboardInputSession.releaseEditor(this.keyboardEditorId); this.keyboardEditorId = KeyboardInputSession.newEditorId();
    this.draftMounted = true; this.refreshValue();
  }
  private effectiveDraftKey(): string { return this.draftKey.length > 0 ? this.draftKey : this.label; }
  private currentDraftSource(): string {
    return JSON.stringify([this.draftSource, SettingsNumberLogic.format(this.value), String(this.minimum),
      String(this.maximum), String(this.allowInfinity), String(this.integer)]);
  }
  private draftCurrent(token: number): boolean {
    return this.draftMounted && this.draftGuard() && token === this.draftToken && this.leaseOwner === this.draftOwner &&
      this.leaseScope === this.draftScope && this.leaseKey === this.effectiveDraftKey() && this.leaseEpoch === this.draftEpoch &&
      this.draftOwner.isCurrent(token, this.currentDraftSource());
  }
  private refreshValue(): void {
    if (!this.draftMounted) { return; }
    this.keyboardEditorId = KeyboardInputSession.renewEditor(this.keyboardEditorId);
    if (this.leaseOwner !== null) { this.leaseOwner.release(this.draftToken); }
    this.leaseOwner = this.draftOwner; this.leaseScope = this.draftScope;
    this.leaseKey = this.effectiveDraftKey(); this.leaseEpoch = this.draftEpoch;
    const lease: DraftLease = this.draftOwner.open(this.leaseScope, this.leaseKey, this.currentDraftSource(),
      JSON.stringify([SettingsNumberLogic.format(this.value), '0', '0']));
    this.draftToken = lease.token; this.storageError = lease.sourceId === 0 || lease.overflow;
    const state: string[] = JSON.parse(lease.value) as string[];
    this.draft = state[0]; this.error = state[1] === '1'; this.edited = state[2] === '1' || lease.pending;
  }
  private saveDraft(): void {
    if (this.draftCurrent(this.draftToken)) {
      this.storageError = !this.draftOwner.write(this.draftToken, this.currentDraftSource(), JSON.stringify([this.draft, this.error ? '1' : '0', this.edited ? '1' : '0']), this.edited || this.error);
    }
  }
  private changeHandler(): (text: string) => void {
    const token: number = this.draftToken; const onEdit: () => void = this.onEdit; const guard: () => boolean = this.draftGuard;
    return (text: string): void => {
      if (!this.editable || !this.draftCurrent(token) || onEdit !== this.onEdit || guard !== this.draftGuard) { return; }
      // ArkUI may replay the bound text when the input is re-created. That is
      // not a user edit; only accept an identical text once the input has focus.
      if (!this.focused && text === this.draft) { return; }
      this.draft = text; this.error = false; this.edited = true; this.saveDraft(); this.onEdit();
    };
  }
  private commitHandler(): () => void {
    const token: number = this.draftToken; const guard: () => boolean = this.draftGuard; const callback: (value: number) => boolean = this.onCommit;
    return (): void => { if (this.draftCurrent(token) && guard === this.draftGuard && callback === this.onCommit) { this.commit(); } };
  }
  private cancelHandler(): () => void {
    const token: number = this.draftToken; const guard: () => boolean = this.draftGuard;
    return (): void => {
      if (!this.draftCurrent(token) || guard !== this.draftGuard) { return; }
      this.draft = SettingsNumberLogic.format(this.value); this.error = false; this.edited = false; this.saveDraft();
    };
  }
  private canonicalDraft(): string { return SettingsNumberLogic.format(this.value); }
  private commit(): void {
    if (!this.editable || this.storageError || !this.draftCurrent(this.draftToken)) { return; }
    const value: number | null = SettingsNumberLogic.parse(this.draft, this.allowInfinity);    if (value === null || !SettingsNumberLogic.valid(value, this.minimum, this.maximum, this.allowInfinity, this.integer)) {
      this.error = true; this.saveDraft(); return;
    }
    if (value === this.value && (!this.commitEqualEdits || !this.edited)) {
      this.draft = SettingsNumberLogic.format(value); this.error = false; this.edited = false; this.saveDraft(); return;
    }
    this.error = !this.onCommit(value);
    if (!this.error) { this.draft = SettingsNumberLogic.format(value); this.edited = false; }
    this.saveDraft();
  }
  build() {
    Column({ space: 2 }) {
      Flex({ direction: FlexDirection.Row, wrap: FlexWrap.Wrap, alignItems: ItemAlign.Center }) {
        Text(this.label + (this.unit.length > 0 ? ' · ' + this.unit : '')).fontSize(UiStyle.textFor(this.compact)).fontColor(UiStyle.ink)
          .width(UiStyle.numberLabelWidth(this.fieldWidth, this.label, this.unit, this.compact)).padding({ right: 6, top: 2, bottom: 2 }).textAlign(TextAlign.Start).wordBreak(WordBreak.BREAK_ALL)
        TextInput({ text: this.draft }).fontSize(UiStyle.textFor(this.compact)).fontColor(UiStyle.ink).constraintSize({ minHeight: this.compact ? 38 : 42, maxWidth: '100%' }).borderRadius(UiStyle.radius)
          .padding({ left: 10, right: 10 }).backgroundColor(UiStyle.field).border({ width: 1, color: this.error ? UiStyle.danger : UiStyle.edge })
          .width(UiStyle.numberControlWidth(this.fieldWidth, this.label, this.unit, this.compact)).enabled(this.editable && this.draftToken > 0)
          .responseRegion({ y: -3, width: '100%', height: UiStyle.control })
          .accessibilityText(this.label).onChange(KeyboardInputSession.changeHandler(this.keyboardEditorId, this.changeHandler()))
          .onSubmit(KeyboardInputSession.submitHandler(this.keyboardEditorId, this.commitHandler())).onFocus(KeyboardInputSession.focusHandler(this.keyboardEditorId, true))
          .onBlur(KeyboardInputSession.focusHandler(this.keyboardEditorId, false))
          .onKeyPreIme(KeyboardInputSession.emergencyHandler(this.keyboardEditorId))
          .onTouch((event: TouchEvent) => { if (event.type === TouchType.Down) { this.focused = true; } })
      }.width('100%')
      if (this.edited || this.error) {
        Flex({ direction: FlexDirection.Row, wrap: FlexWrap.Wrap, alignItems: ItemAlign.Center }) {
          Text('未应用').fontSize(UiStyle.helper).fontColor(UiStyle.warning).padding({ right: 12 })
          Button('确认').type(ButtonType.Normal).buttonStyle(ButtonStyleMode.NORMAL).controlSize(ControlSize.NORMAL).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip })
            .constraintSize({ minHeight: UiStyle.controlFor(this.compact), maxWidth: '100%', minWidth: UiStyle.controlFor(this.compact) }).responseRegion({ y: -4, width: '100%', height: UiStyle.control }).fontSize(UiStyle.textFor(this.compact))
            .borderRadius(UiStyle.radius).margin({ right: 8 })
            .enabled(this.editable && !this.storageError).fontColor(UiStyle.field).backgroundColor(UiStyle.accent).border({ width: 1, color: UiStyle.accent })
            .stateStyles({
              focused: { .outline({ width: 2, color: UiStyle.accent }) },
              disabled: { .opacity(UiStyle.disabledOpacity) }
            }).onClick(this.commitHandler())
          Button('取消').type(ButtonType.Normal).buttonStyle(ButtonStyleMode.NORMAL).controlSize(ControlSize.NORMAL).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip })
            .constraintSize({ minHeight: UiStyle.controlFor(this.compact), maxWidth: '100%', minWidth: UiStyle.controlFor(this.compact) }).responseRegion({ y: -4, width: '100%', height: UiStyle.control }).fontSize(UiStyle.textFor(this.compact))
            .borderRadius(UiStyle.radius).fontColor(UiStyle.ink).backgroundColor(UiStyle.field).border({ width: 1, color: UiStyle.edge })
            .stateStyles({
              focused: { .outline({ width: 2, color: UiStyle.accent }) },
              disabled: { .opacity(UiStyle.disabledOpacity) }
            }).onClick(this.cancelHandler())
        }.width('100%')
      }
      if (this.storageError) { Text('草稿空间已满，当前输入未保留。请缩短输入或取消未应用的编辑。').fontSize(UiStyle.helper).fontColor(UiStyle.danger).width('100%') }
      if (this.error) { Text('数值无效或超出允许范围').fontSize(UiStyle.helper).fontColor(UiStyle.danger).width('100%') }
    }.width('100%').margin({ bottom: UiStyle.gap(this.compact) })
      .onAreaChange((_old: Area, area: Area) => this.measureField(Number(area.width)))
  }
}

@Component
export struct SettingsTextField {
  private keyboardEditorId: number = KeyboardInputSession.newEditorId();
  draftOwner: SettingsDraftOwner = new SettingsDraftOwner();
  @Prop @Watch('refreshValue') draftScope: string = '';
  @Prop @Watch('refreshValue') draftKey: string = '';
  @Prop @Watch('refreshValue') draftSource: string = '';
  @Prop @Watch('refreshValue') draftEpoch: number = 0;
  draftGuard: () => boolean = (): boolean => true;
  private draftToken: number = 0;
  private leaseOwner: SettingsDraftOwner | null = null;
  private leaseScope: string = '';
  private leaseKey: string = '';
  private leaseEpoch: number = 0;
  private draftMounted: boolean = false;
  aboutToDisappear(): void {
    this.draftMounted = false;
    if (this.leaseOwner !== null) { this.leaseOwner.release(this.draftToken); }
    this.draftToken = 0; KeyboardInputSession.releaseEditor(this.keyboardEditorId);
  }
  @State fieldWidth: number = 0;
  measureField(width: number): void { if (Number.isFinite(width) && width > 0) { this.fieldWidth = width; } }
  @Prop @Watch('refreshValue') label: string = '';
  @Prop @Watch('refreshValue') value: string = '';
  @Prop placeholder: string = '';
  @Prop compact: boolean = false;
  @Prop @Watch('refreshValue') editable: boolean = true;
  @State private edited: boolean = false;
  @State private focused: boolean = false;
  onCommit: (value: string) => boolean = (_value: string): boolean => true;
  onEdit: () => void = (): void => {};
  @State draft: string = '';
  @State error: boolean = false;
  @State storageError: boolean = false;
  aboutToAppear(): void {
    KeyboardInputSession.releaseEditor(this.keyboardEditorId); this.keyboardEditorId = KeyboardInputSession.newEditorId();
    this.draftMounted = true; this.refreshValue();
  }
  private effectiveDraftKey(): string { return this.draftKey.length > 0 ? this.draftKey : this.label; }
  private currentDraftSource(): string {
    return JSON.stringify([this.draftSource, this.value]);
  }
  private draftCurrent(token: number): boolean {
    return this.draftMounted && this.draftGuard() && token === this.draftToken && this.leaseOwner === this.draftOwner &&
      this.leaseScope === this.draftScope && this.leaseKey === this.effectiveDraftKey() && this.leaseEpoch === this.draftEpoch &&
      this.draftOwner.isCurrent(token, this.currentDraftSource());
  }
  private refreshValue(): void {
    if (!this.draftMounted) { return; }
    this.keyboardEditorId = KeyboardInputSession.renewEditor(this.keyboardEditorId);
    if (this.leaseOwner !== null) { this.leaseOwner.release(this.draftToken); }
    this.leaseOwner = this.draftOwner; this.leaseScope = this.draftScope;
    this.leaseKey = this.effectiveDraftKey(); this.leaseEpoch = this.draftEpoch;
    const lease: DraftLease = this.draftOwner.open(this.leaseScope, this.leaseKey, this.currentDraftSource(),
      JSON.stringify([this.value, '0', '0']));
    this.draftToken = lease.token; this.storageError = lease.sourceId === 0 || lease.overflow;
    const state: string[] = JSON.parse(lease.value) as string[];
    this.draft = state[0]; this.error = state[1] === '1'; this.edited = state[2] === '1' || lease.pending;
  }
  private saveDraft(): void {
    if (this.draftCurrent(this.draftToken)) {
      this.storageError = !this.draftOwner.write(this.draftToken, this.currentDraftSource(), JSON.stringify([this.draft, this.error ? '1' : '0', this.edited ? '1' : '0']), this.edited || this.error);
    }
  }
  private changeHandler(): (text: string) => void {
    const token: number = this.draftToken; const onEdit: () => void = this.onEdit; const guard: () => boolean = this.draftGuard;
    return (text: string): void => {
      if (!this.editable || !this.draftCurrent(token) || onEdit !== this.onEdit || guard !== this.draftGuard) { return; }
      // ArkUI may replay the bound text when the input is re-created. That is
      // not a user edit; only accept an identical text once the input has focus.
      if (!this.focused && text === this.draft) { return; }
      this.draft = text; this.error = false; this.edited = true; this.saveDraft(); this.onEdit();
    };
  }
  private commitHandler(): () => void {
    const token: number = this.draftToken; const guard: () => boolean = this.draftGuard; const callback: (value: string) => boolean = this.onCommit;
    return (): void => { if (this.draftCurrent(token) && guard === this.draftGuard && callback === this.onCommit) { this.commit(); } };
  }
  private cancelHandler(): () => void {
    const token: number = this.draftToken; const guard: () => boolean = this.draftGuard;
    return (): void => {
      if (!this.draftCurrent(token) || guard !== this.draftGuard) { return; }
      this.draft = this.value; this.error = false; this.edited = false; this.saveDraft();
    };
  }
  private canonicalDraft(): string { return this.value; }
  private commit(): void {
    if (!this.editable || this.storageError || !this.draftCurrent(this.draftToken)) { return; }
    if (this.draft === this.value) { this.error = false; this.edited = false; this.saveDraft(); return; }
    this.error = !this.onCommit(this.draft);
    if (!this.error) { this.edited = false; }
    this.saveDraft();
  }
  build() {
    Column({ space: 4 }) {
      Text(this.label).fontSize(UiStyle.textFor(this.compact)).fontColor(UiStyle.ink).width('100%').padding({ top: 2, bottom: 2 }).wordBreak(WordBreak.BREAK_ALL)
      TextInput({ text: this.draft, placeholder: this.placeholder }).constraintSize({ minHeight: this.compact ? 38 : 42, maxWidth: '100%' }).fontSize(UiStyle.textFor(this.compact)).fontColor(UiStyle.ink).borderRadius(UiStyle.radius)
        .padding({ left: 10, right: 10 }).backgroundColor(UiStyle.field).border({ width: 1, color: this.error ? UiStyle.danger : UiStyle.edge }).width('100%')
        .placeholderColor(UiStyle.muted)
        .responseRegion({ y: -3, width: '100%', height: UiStyle.control })
        .enabled(this.editable && this.draftToken > 0).accessibilityText(this.label)
        .onChange(KeyboardInputSession.changeHandler(this.keyboardEditorId, this.changeHandler()))
        .onSubmit(KeyboardInputSession.submitHandler(this.keyboardEditorId, this.commitHandler())).onFocus(KeyboardInputSession.focusHandler(this.keyboardEditorId, true))
          .onBlur(KeyboardInputSession.focusHandler(this.keyboardEditorId, false))
          .onKeyPreIme(KeyboardInputSession.emergencyHandler(this.keyboardEditorId))
          .onTouch((event: TouchEvent) => { if (event.type === TouchType.Down) { this.focused = true; } })
      if (this.edited || this.error) {
        Flex({ direction: FlexDirection.Row, wrap: FlexWrap.Wrap, alignItems: ItemAlign.Center }) {
          Text('未应用').fontSize(UiStyle.helper).fontColor(UiStyle.warning).padding({ right: 12 })
          Button('确认').type(ButtonType.Normal).buttonStyle(ButtonStyleMode.NORMAL).controlSize(ControlSize.NORMAL).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip })
            .constraintSize({ minHeight: UiStyle.controlFor(this.compact), maxWidth: '100%', minWidth: UiStyle.controlFor(this.compact) }).responseRegion({ y: -4, width: '100%', height: UiStyle.control }).fontSize(UiStyle.textFor(this.compact))
            .borderRadius(UiStyle.radius).margin({ right: 8 })
            .enabled(this.editable && !this.storageError).fontColor(UiStyle.field).backgroundColor(UiStyle.accent).border({ width: 1, color: UiStyle.accent })
            .stateStyles({
              focused: { .outline({ width: 2, color: UiStyle.accent }) },
              disabled: { .opacity(UiStyle.disabledOpacity) }
            }).onClick(this.commitHandler())
          Button('取消').type(ButtonType.Normal).buttonStyle(ButtonStyleMode.NORMAL).controlSize(ControlSize.NORMAL).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip })
            .constraintSize({ minHeight: UiStyle.controlFor(this.compact), maxWidth: '100%', minWidth: UiStyle.controlFor(this.compact) }).responseRegion({ y: -4, width: '100%', height: UiStyle.control }).fontSize(UiStyle.textFor(this.compact))
            .borderRadius(UiStyle.radius).fontColor(UiStyle.ink).backgroundColor(UiStyle.field).border({ width: 1, color: UiStyle.edge })
            .stateStyles({
              focused: { .outline({ width: 2, color: UiStyle.accent }) },
              disabled: { .opacity(UiStyle.disabledOpacity) }
            }).onClick(this.cancelHandler())
        }.width('100%')
      }
      if (this.storageError) { Text('草稿空间已满，当前输入未保留。请缩短输入或取消未应用的编辑。').fontSize(UiStyle.helper).fontColor(UiStyle.danger).width('100%') }
      if (this.error) { Text('内容无效，请检查格式或重复名称').fontSize(UiStyle.helper).fontColor(UiStyle.danger).width('100%') }
    }.width('100%').margin({ bottom: UiStyle.gap(this.compact) })
      .onAreaChange((_old: Area, area: Area) => this.measureField(Number(area.width)))
  }
}

@Component
export struct SettingsSwitchField {
  @StorageLink('mfpImmersiveMaterialRevision') materialRevision: number = 0;
  @Prop label: string = '';
  @Prop value: boolean = false;
  @Prop compact: boolean = false;
  @Prop editable: boolean = true;
  onChange: (value: boolean) => void = (_value: boolean): void => {};
  private active: boolean = true;
  aboutToAppear(): void { this.active = true; }
  aboutToDisappear(): void { this.active = false; }
  private changeHandler(): (value: boolean) => void {
    const callback = this.onChange; const label = this.label; const prior = this.value;
    return (value: boolean): void => {
      if (this.active && this.editable && callback === this.onChange && label === this.label && prior === this.value) { callback(value); }
    };
  }
  build() {
    Row({ space: 8 }) {
      Text(this.label).fontSize(UiStyle.textFor(this.compact)).fontColor(UiStyle.ink).layoutWeight(1).wordBreak(WordBreak.BREAK_ALL)
      Toggle({ type: ToggleType.Switch, isOn: this.value }).width(48).height(28).selectedColor(UiStyle.accent).attributeModifier(new MfpToggleMaterialModifier(this.materialRevision)).enabled(this.editable)
        .responseRegion({ x: -2, y: -12, width: UiStyle.control, height: UiStyle.control })
        .accessibilityText(this.label + (this.value ? '，已开启' : '，已关闭')).onChange(this.changeHandler())
    }.width('100%').constraintSize({ minHeight: UiStyle.control }).margin({ bottom: 3 })
  }
}

@Component
export struct SettingsChoiceField {
  @StorageLink('mfpImmersiveMaterialRevision') materialRevision: number = 0;
  @State fieldWidth: number = 0;
  @State detailExpanded: boolean = false;
  measureField(width: number): void { if (Number.isFinite(width) && width > 0) { this.fieldWidth = width; } }
  @Prop label: string = '';
  @Prop selected: string = '';
  @Prop options: SettingsOption[] = [];
  @Prop compact: boolean = false;
  @Prop editable: boolean = true;
  onSelect: (value: string) => void = (_value: string): void => {};
  private active: boolean = true;
  aboutToAppear(): void { this.active = true; }
  aboutToDisappear(): void { this.active = false; }
  private selectHandler(): (index: number) => void {
    const callback = this.onSelect; const label = this.label; const selected = this.selected;
    const source: string = JSON.stringify(this.options);
    const options: SettingsOption[] = this.options.map((option: SettingsOption): SettingsOption => new SettingsOption(option.value, option.label));
    return (index: number): void => {
      if (this.active && this.editable && callback === this.onSelect && label === this.label && selected === this.selected &&
        source === JSON.stringify(this.options) && Number.isInteger(index) && index >= 0 && index < options.length) { callback(options[index].value); }
    };
  }
  private index(): number { return this.options.findIndex(option => option.value === this.selected); }
  private labelText(): string {
    const index: number = this.index();
    return index < 0 ? this.selected + '（不可用，已保留）' : this.options[index].label;
  }
  private detailHandler(): () => void {
    const label: string = this.label; const selected: string = this.selected;
    const source: string = JSON.stringify(this.options);
    return (): void => {
      if (this.active && label === this.label && selected === this.selected && source === JSON.stringify(this.options)) {
        this.detailExpanded = !this.detailExpanded;
      }
    };
  }
  build() {
    Column({ space: 4 }) {
      Text(this.label).fontSize(UiStyle.textFor(this.compact)).fontColor(UiStyle.ink).width('100%').padding({ top: 2, bottom: 2 }).wordBreak(WordBreak.BREAK_ALL)
        .textAlign(TextAlign.Start)
      Row({ space: 6 }) {
        Select(this.options.map((option: SettingsOption): SelectOption => { return { value: option.label }; }))
          .selected(this.index()).value(this.labelText()).optionHeight(UiStyle.control).font({ size: UiStyle.textFor(this.compact) }).optionFont({ size: UiStyle.textFor(this.compact) }).selectedOptionFont({ size: UiStyle.textFor(this.compact) }).fontColor(UiStyle.ink)
          .backgroundColor(UiStyle.field).borderRadius(UiStyle.radius)
          .attributeModifier(new MfpSelectMaterialModifier(this.materialRevision))
          .constraintSize({ minHeight: this.compact ? 38 : 42, maxWidth: '100%' }).layoutWeight(1)
          .enabled(this.editable).accessibilityText(this.label + '：' + this.labelText())
          .onSelect(this.selectHandler())
        Button(this.detailExpanded ? '收起' : '全文').type(ButtonType.Normal).buttonStyle(ButtonStyleMode.NORMAL).controlSize(ControlSize.NORMAL).stateEffect(true)
          .labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).fontSize(UiStyle.textFor(this.compact))
          .padding({ left: 6, right: 6, top: 8, bottom: 8 })
          .width(UiStyle.control).constraintSize({ minHeight: UiStyle.controlFor(this.compact), maxWidth: '100%', minWidth: UiStyle.controlFor(this.compact) }).responseRegion({ y: -4, width: '100%', height: UiStyle.control }).flexShrink(0)
          .accessibilityText((this.detailExpanded ? '收起完整值：' : '查看完整值：') + this.label + '，' + this.labelText())
          .borderRadius(UiStyle.radius).fontColor(UiStyle.muted).backgroundColor(UiStyle.field).border({ width: 1, color: UiStyle.edge })
          .visibility(this.labelText().length > 18 ? Visibility.Visible : Visibility.None)
          .stateStyles({
            focused: { .outline({ width: 2, color: UiStyle.accent }) },
            disabled: { .opacity(UiStyle.disabledOpacity) }
          }).onClick(this.detailHandler())
      }.width('100%')
      // A native Select may elide. Complete text is always available on explicit
      // disclosure, including in read-only mode, and in its accessibility label.
      if (this.detailExpanded) {
        Text(this.labelText()).fontSize(UiStyle.textFor(this.compact)).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
      }
    }.width('100%').margin({ bottom: UiStyle.gap(this.compact) })
      .onAreaChange((_old: Area, area: Area) => this.measureField(Number(area.width)))
  }
}

@Component
export struct SettingsSectionTitle {
  @Prop label: string = '';
  @Prop topLevel: boolean = false;
  build() {
    Row({ space: 8 }) {
      Column().width(4).height(this.topLevel ? 20 : 16).borderRadius(2)
        .backgroundColor(this.topLevel ? UiStyle.accent : UiStyle.muted)
      Text(this.label).fontSize(this.topLevel ? UiStyle.heading : UiStyle.section).fontWeight(FontWeight.Medium).fontColor(UiStyle.ink).layoutWeight(1).wordBreak(WordBreak.BREAK_ALL)
    }.width('100%').alignItems(VerticalAlign.Center)
      .padding({ top: 4, bottom: 8 }).margin({ top: this.topLevel ? 0 : 8, bottom: 8 })
  }
}

@Component
export struct CurvePointEditor {
  draftOwner: SettingsDraftOwner = new SettingsDraftOwner();
  @Prop @Watch('draftBindingChanged') draftScope: string = '';
  @Prop @Watch('draftBindingChanged') draftKey: string = '';
  @Prop @Watch('draftBindingChanged') draftSource: string = '';
  @Prop @Watch('draftBindingChanged') draftEpoch: number = 0;
  private draftToken: number = 0;
  private draftSourceId: number = 0;
  private leaseOwner: SettingsDraftOwner | null = null;
  private leaseScope: string = '';
  private leaseKey: string = '';
  private leaseEpoch: number = 0;
  private leaseSource: string = '';
  @Prop @Watch('bindingChanged') bindingKey: string = '';
  onGeometry: (ownerId: number, width: number, height: number, attached: boolean) => void = (_ownerId: number, _width: number, _height: number, _attached: boolean): void => {};
  private geometryOwner: number = 0;
  @State private editRevision: number = 0;
  private editSnapshot: string = '';
  private geometryMounted: boolean = false;
  private measuredPlotWidth: number = 0;
  private measuredPlotHeight: number = 0;
  aboutToAppear(): void { this.geometryMounted = true; this.bindingChanged(); }
  aboutToDisappear(): void {
    this.geometryMounted = false; this.dragging = false; this.dragCallback = null;
    if (this.leaseOwner !== null) { this.leaseOwner.release(this.draftToken); }
    this.draftToken = 0;
    if (this.geometryOwner > 0) { this.onGeometry(this.geometryOwner, 0, 0, false); }
    this.geometryOwner = 0;
  }
  private bindingChanged(): void {
    if (this.geometryOwner > 0) { this.onGeometry(this.geometryOwner, 0, 0, false); }
    this.geometryOwner = CurveGeometryOwners.next(); this.draftBindingChanged();
    if (this.geometryMounted && this.bindingKey.length > 0) {
      this.onGeometry(this.geometryOwner, this.measuredPlotWidth, this.measuredPlotHeight, true);
    }
  }
  private geometryHandler(owner: number, key: string): (oldArea: Area, area: Area) => void {
    return (_oldArea: Area, area: Area): void => {
      if (!this.geometryMounted || owner !== this.geometryOwner || key !== this.bindingKey) { return; }
      const width: number = Number(area.width); const height: number = Number(area.height);
      if (!Number.isFinite(width) || !Number.isFinite(height) || width < 0 || height < 0) { return; }
      this.canvasWidth = width;
      const plotWidth: number = Math.max(0, width - 24); const plotHeight: number = Math.max(0, height - 24);
      const changed: boolean = plotWidth !== this.measuredPlotWidth || plotHeight !== this.measuredPlotHeight;
      this.measuredPlotWidth = plotWidth; this.measuredPlotHeight = plotHeight;
      if (changed) { this.refreshEditContext(); this.dragging = false; this.dragCallback = null; this.workingPoints = CurveEditRules.copy(this.points); } this.draw();
      if (changed && key.length > 0) { this.onGeometry(owner, plotWidth, plotHeight, true); }
    };
  }
  @Prop @Watch('pointsChanged') points: MotionCurvePoint[] = [];
  @Prop compact: boolean = false;
  @Prop @Watch('pointsChanged') minimumX: number | null = null;
  @Prop @Watch('pointsChanged') maximumX: number | null = null;
  @Prop @Watch('pointsChanged') minimumY: number = 0;
  @Prop @Watch('pointsChanged') maximumY: number = 1;
  @Prop @Watch('pointsChanged') viewMinimumX: number = 0;
  @Prop @Watch('pointsChanged') viewMaximumX: number = 10;
  @Prop @Watch('pointsChanged') strictX: boolean = false;
  @Prop @Watch('pointsChanged') interpolationMode: InterpolationMode = 'linear';
  @Prop @Watch('pointsChanged') isLooping: boolean = false;
  @Prop @Watch('pointsChanged') maximumPoints: number = MotionConfigurations.MAX_POINTS;
  @Prop xLabel: string = '时间（秒）';
  @Prop yLabel: string = '位置（0–1）';
  onChange: (points: MotionCurvePoint[]) => void = (_points: MotionCurvePoint[]): void => {};
  @State selected: number = -1;
  @State draftX: number = 0;
  @State draftY: number = 0;
  @State message: string = '';
  @State previewIssue: string = '';
  @State canvasWidth: number = 240;
  private dragging: boolean = false;
  private dragToken: string = '';
  private dragCallback: ((points: MotionCurvePoint[]) => void) | null = null;
  private workingPoints: MotionCurvePoint[] = [];
  private dragStartPoints: MotionCurvePoint[] = [];
  private canvas: CanvasRenderingContext2D = new CanvasRenderingContext2D(new RenderingContextSettings(true));
  private effectiveDraftKey(): string { return this.draftKey.length > 0 ? this.draftKey : 'curve:' + this.bindingKey; }
  private coordinateDraftScope(): string { return JSON.stringify([this.draftScope, this.effectiveDraftKey(), 'coordinates']); }
  private coordinateDraftSource(): string { return String(this.draftSourceId); }
  private currentDraftSource(): string {
    // Geometry deliberately belongs only to edit/gesture ownership, never draft identity.
    return JSON.stringify([this.draftSource, this.bindingKey, JSON.stringify(this.points),
      [this.minimumX, this.maximumX, this.minimumY, this.maximumY, this.strictX, this.viewMinimumX, this.viewMaximumX,
        this.interpolationMode, this.isLooping, this.maximumPoints].join(',')]);
  }
  private draftCurrent(): boolean {
    return this.geometryMounted && this.leaseOwner === this.draftOwner && this.leaseScope === this.draftScope &&
      this.leaseKey === this.effectiveDraftKey() && this.leaseEpoch === this.draftEpoch &&
      this.draftOwner.isCurrent(this.draftToken, this.currentDraftSource());
  }
  private draftBindingChanged(): void {
    if (!this.geometryMounted) { return; }
    this.dragging = false; this.dragCallback = null;
    this.workingPoints = CurveEditRules.copy(this.points);
    if (this.leaseOwner !== null) { this.leaseOwner.release(this.draftToken); }
    this.leaseOwner = this.draftOwner; this.leaseScope = this.draftScope; this.leaseKey = this.effectiveDraftKey();
    this.leaseEpoch = this.draftEpoch; this.leaseSource = this.currentDraftSource();
    let lease: DraftLease = this.draftOwner.open(this.leaseScope, this.leaseKey, this.leaseSource, '');
    if (lease.sourceChanged) {
      this.draftOwner.clearScope(this.coordinateDraftScope());
      if (lease.sourceId === 0) { lease = this.draftOwner.open(this.leaseScope, this.leaseKey, this.leaseSource, ''); }
    }
    this.draftToken = lease.token; this.draftSourceId = lease.sourceId;
    const state: string[] = lease.value.length > 0 ? JSON.parse(lease.value) as string[] : ['-1', '0', '0', ''];
    this.selected = Number(state[0]); this.draftX = Number(state[1]); this.draftY = Number(state[2]); this.message = state[3];
    if (this.selected >= this.points.length) { this.selected = -1; }
    if (lease.sourceId === 0 || lease.overflow) { this.message = '草稿空间已满，部分输入未保留。请取消其他未应用的编辑。'; }
    // Store the initialized panel state so its stable source anchor cannot be
    // reclaimed while coordinate drafts may still refer to it after remount.
    this.saveDraft(); this.refreshEditContext(); this.draw();
  }
  private saveDraft(): boolean {
    if (!this.draftCurrent()) { return false; }
    if (!this.draftOwner.write(this.draftToken, this.currentDraftSource(),
      JSON.stringify([String(this.selected), String(this.draftX), String(this.draftY), this.message]))) {
      this.message = '草稿空间已满，当前输入未保留。请取消其他未应用的编辑。'; return false;
    }
    return true;
  }
  private pointsChanged(): void {
    if (this.leaseSource !== this.currentDraftSource() || this.leaseOwner !== this.draftOwner ||
      this.leaseScope !== this.draftScope || this.leaseKey !== this.effectiveDraftKey() || this.leaseEpoch !== this.draftEpoch) { this.draftBindingChanged(); }
    this.refreshEditContext();
    if (this.dragging && (!this.dragCurrent() || this.points.length !== this.dragStartPoints.length ||
      this.points.some((point: MotionCurvePoint, index: number) => point.x !== this.dragStartPoints[index].x || point.y !== this.dragStartPoints[index].y))) {
      this.dragging = false;
    }
    if (!this.dragging) { this.workingPoints = CurveEditRules.copy(this.points); }
    if (this.selected >= this.points.length) { this.selected = -1; }
    this.draw();
  }
  private bounds(): number[] {
    let low: number = this.viewMinimumX;
    let high: number = this.viewMaximumX;
    // Keep the source viewport fixed; off-viewport points remain editable in the numeric list.
    if (!(high > low)) { high = low + 1; }
    return [low, high];
  }
  private px(x: number): number {
    const bounds: number[] = this.bounds();
    // Halving before subtraction keeps opposite finite extremes from overflowing.
    const halfSpan: number = bounds[1] / 2 - bounds[0] / 2;
    const fraction: number = halfSpan > 0 ? (x / 2 - bounds[0] / 2) / halfSpan : (x - bounds[0]) / (bounds[1] - bounds[0]);
    return 12 + fraction * Math.max(1, this.canvasWidth - 24);
  }
  private py(y: number): number { return 168 - (y - this.minimumY) / (this.maximumY - this.minimumY) * 156; }
  private draw(): void {
    this.canvas.clearRect(0, 0, this.canvasWidth, 180);
    this.canvas.fillStyle = UiStyle.page; this.canvas.fillRect(0, 0, this.canvasWidth, 180);
    this.canvas.strokeStyle = UiStyle.edge; this.canvas.lineWidth = 1;
    for (let line: number = 0; line <= 4; line++) {
      this.canvas.beginPath(); this.canvas.moveTo(12, 12 + line * 39); this.canvas.lineTo(this.canvasWidth - 12, 12 + line * 39); this.canvas.stroke();
    }
    const points: MotionCurvePoint[] = this.dragging ? this.workingPoints : this.points;
    const bounds: number[] = this.bounds();
    const preview: CurvePreviewResult = CurvePreview.build(points, bounds[0], bounds[1], this.minimumY, this.maximumY,
      this.interpolationMode, this.isLooping);
    this.previewIssue = preview.issue;
    this.canvas.strokeStyle = UiStyle.accent; this.canvas.lineWidth = 2;
    for (const path of preview.paths) {
      this.canvas.beginPath();
      path.forEach((point: MotionCurvePoint, index: number) => {
        if (index === 0) { this.canvas.moveTo(this.px(point.x), this.py(point.y)); }
        else { this.canvas.lineTo(this.px(point.x), this.py(point.y)); }
      });
      this.canvas.stroke();
    }
    points.forEach((point: MotionCurvePoint, index: number) => {
      if (point.x < bounds[0] || point.x > bounds[1]) { return; }
      this.canvas.beginPath(); this.canvas.arc(this.px(point.x), this.py(point.y), index === this.selected ? 7 : 5, 0, Math.PI * 2);
      this.canvas.fillStyle = index === this.selected ? UiStyle.ink : UiStyle.accent; this.canvas.fill();
    });
  }
  private hitPoint(x: number, y: number): number {
    const bounds: number[] = this.bounds();
    // Density must not shrink the draggable touch target (56vp diameter).
    let best: number = 28; let selected: number = -1;
    this.points.forEach((point: MotionCurvePoint, index: number) => {
      if (point.x < bounds[0] || point.x > bounds[1]) { return; }
      const distance: number = Math.hypot(this.px(point.x) - x, this.py(point.y) - y);
      if (distance <= best) { selected = index; best = distance; }
    });
    return selected;
  }
  private beginPoint(x: number, y: number): void {
    const selected: number = this.hitPoint(x, y);
    this.selected = selected; this.saveDraft(); this.dragging = selected >= 0;
    this.dragToken = this.editToken(); this.dragCallback = this.onChange;
    this.dragStartPoints = CurveEditRules.copy(this.points); this.workingPoints = CurveEditRules.copy(this.points); this.draw();
  }
  private dragCurrent(): boolean {
    return this.dragCallback !== null && this.editCurrent(this.dragToken, this.dragCallback);
  }
  private endPoint(): void {
    if (!this.dragging) { return; }
    if (!this.dragCurrent()) { this.cancelPoint(); return; }
    this.dragging = false;
    if (this.workingPoints.some((point: MotionCurvePoint, index: number) => point.x !== this.points[index].x || point.y !== this.points[index].y)) {
      this.onChange(CurveEditRules.copy(this.workingPoints));
    }
    this.draw();
  }
  private cancelPoint(): void { this.dragging = false; this.dragCallback = null; this.pointsChanged(); }
  private movePoint(x: number, y: number): void {
    if (!this.dragging || this.selected < 0) { return; }
    if (!this.dragCurrent()) { this.cancelPoint(); return; }
    const bounds: number[] = this.bounds();
    const fraction: number = Math.max(0, Math.min(1, (x - 12) / Math.max(1, this.canvasWidth - 24)));
    let nextX: number = bounds[0] * (1 - fraction) + bounds[1] * fraction;
    if (this.minimumX !== null) { nextX = Math.max(this.minimumX, nextX); }
    if (this.maximumX !== null) { nextX = Math.min(this.maximumX, nextX); }
    if (this.strictX) {
      const epsilon: number = Math.max(Number.EPSILON, (bounds[1] / 2 - bounds[0] / 2) * 0.000002);
      if (this.selected > 0) { nextX = Math.max(nextX, this.workingPoints[this.selected - 1].x + epsilon); }
      if (this.selected + 1 < this.workingPoints.length) { nextX = Math.min(nextX, this.workingPoints[this.selected + 1].x - epsilon); }
    }
    const nextY: number = this.minimumY + Math.max(0, Math.min(1, (168 - y) / 156)) * (this.maximumY - this.minimumY);
    const edited: MotionCurvePoint[] | null = CurveEditRules.replace(this.workingPoints, this.selected, nextX, nextY,
      this.minimumX, this.maximumX, this.minimumY, this.maximumY, this.strictX);
    if (edited !== null) { this.workingPoints = edited; this.draw(); }
  }
  private judgeGesture(info: GestureInfo, event: BaseGestureEvent): GestureJudgeResult {
    if (info.type !== GestureControl.GestureType.PAN_GESTURE) { return GestureJudgeResult.CONTINUE; }
    if (event.fingerList.length === 0) { return GestureJudgeResult.REJECT; }
    const pan: PanGestureEvent = event as PanGestureEvent;
    const finger: FingerInfo = event.fingerList[0];
    return this.hitPoint(finger.localX - pan.offsetX, finger.localY - pan.offsetY) >= 0 ?
      GestureJudgeResult.CONTINUE : GestureJudgeResult.REJECT;
  }
  private outsideCount(): number {
    const bounds: number[] = this.bounds();
    return this.points.filter(point => point.x < bounds[0] || point.x > bounds[1]).length;
  }
  private panStart(event: GestureEvent): void {
    if (event.fingerList.length === 0) { return; }
    const finger: FingerInfo = event.fingerList[0];
    this.beginPoint(finger.localX - event.offsetX, finger.localY - event.offsetY);
  }
  private pan(event: GestureEvent): void {
    if (event.fingerList.length === 0) { return; }
    const finger: FingerInfo = event.fingerList[0];
    this.movePoint(finger.localX, finger.localY);
  }
  private selectPoint(event: GestureEvent): void {
    if (event.fingerList.length === 0) { return; }
    this.beginPoint(event.fingerList[0].localX, event.fingerList[0].localY);
    this.dragging = false; this.draw();
  }
  private edit(index: number, x: number, y: number): boolean {
    const edited: MotionCurvePoint[] | null = CurveEditRules.replace(this.points, index, x, y,
      this.minimumX, this.maximumX, this.minimumY, this.maximumY, this.strictX);
    if (edited === null) { this.message = this.strictX ? '横坐标必须递增且不能重复。' : '请检查曲线坐标范围。'; this.saveDraft(); return false; }
    this.message = ''; this.saveDraft(); this.onChange(edited); return true;
  }
  private add(): void {
    if (this.draftOwner.hasPending(this.coordinateDraftScope(), 'new:')) {
      this.message = '请先确认或取消新点坐标的未应用编辑，再添加曲线点。'; this.saveDraft(); return;
    }
    const edited: MotionCurvePoint[] | null = CurveEditRules.add(this.points, this.draftX, this.draftY,
      this.minimumX, this.maximumX, this.minimumY, this.maximumY, this.strictX, this.maximumPoints);
    if (edited === null) { this.message = '无法添加：检查坐标、重复横坐标或点数上限。'; this.saveDraft(); return; }
    this.message = ''; this.saveDraft(); this.onChange(edited);
  }
  private currentEditSnapshot(): string {
    return this.geometryOwner + ':' + this.draftToken + ':' + this.draftEpoch + ':' + this.bindingKey + ':' + JSON.stringify(this.points) + ':' +
      [this.minimumX, this.maximumX, this.minimumY, this.maximumY, this.strictX, this.viewMinimumX, this.viewMaximumX,
        this.interpolationMode, this.isLooping, this.maximumPoints, this.canvasWidth, this.measuredPlotHeight].join(',');
  }
  private refreshEditContext(): void {
    const snapshot: string = this.currentEditSnapshot();
    if (snapshot !== this.editSnapshot) { this.editSnapshot = snapshot; this.editRevision++; }
  }
  private editToken(): string { return this.geometryOwner + ':' + this.editRevision; }
  private editCurrent(token: string, callback: (points: MotionCurvePoint[]) => void): boolean {
    // Keep one bounded snapshot, not a full point-list string in every row key.
    // Recheck once per delivered edit, including prop changes before their Watch.
    return this.draftCurrent() && token === this.editToken() && callback === this.onChange &&
      this.editSnapshot === this.currentEditSnapshot();
  }
  private coordinateGuard(): () => boolean {
    const token: string = this.editToken(); const callback: (points: MotionCurvePoint[]) => void = this.onChange;
    return (): boolean => this.editCurrent(token, callback);
  }
  private pointHandler(index: number, coordinate: string): (value: number) => boolean {
    const token: string = this.editToken(); const callback: (points: MotionCurvePoint[]) => void = this.onChange;
    const point: MotionCurvePoint = this.points[index];
    return (value: number): boolean => {
      if (!this.editCurrent(token, callback)) { return false; }
      return this.edit(index, coordinate === 'x' ? value : point.x, coordinate === 'y' ? value : point.y);
    };
  }
  private removeHandler(index: number): () => void {
    const token: string = this.editToken(); const callback: (points: MotionCurvePoint[]) => void = this.onChange;
    return (): void => { if (this.editCurrent(token, callback)) { this.selected = -1; this.saveDraft(); callback(CurveEditRules.remove(this.points, index)); } };
  }
  private draftHandler(coordinate: string): (value: number) => boolean {
    const token: string = this.editToken(); const callback: (points: MotionCurvePoint[]) => void = this.onChange;
    return (value: number): boolean => { if (!this.editCurrent(token, callback)) { return false; }
      const oldX: number = this.draftX; const oldY: number = this.draftY;
      if (coordinate === 'x') { this.draftX = value; } else { this.draftY = value; }
      if (!this.saveDraft()) { this.draftX = oldX; this.draftY = oldY; return false; } return true; };
  }
  private addHandler(): () => void {
    const token: string = this.editToken(); const callback: (points: MotionCurvePoint[]) => void = this.onChange;
    return (): void => { if (this.editCurrent(token, callback)) { this.add(); } };
  }
  private gestureHandler(kind: string): (event: GestureEvent) => void {
    const token: string = this.editToken(); const callback: (points: MotionCurvePoint[]) => void = this.onChange;
    return (event: GestureEvent): void => { if (!this.editCurrent(token, callback)) { return; }
      if (kind === 'start') { this.panStart(event); } else if (kind === 'update') { this.pan(event); }
      else if (kind === 'end') { this.endPoint(); } else if (kind === 'cancel') { this.cancelPoint(); } else { this.selectPoint(event); } };
  }
  build() {
    Column({ space: UiStyle.gap(this.compact) }) {
      Canvas(this.canvas).width('100%').height(180).border({ width: 1, color: UiStyle.edge })
        .onReady(() => this.pointsChanged()).onAreaChange(this.geometryHandler(this.geometryOwner, this.bindingKey))
        .gesture(GestureGroup(GestureMode.Exclusive,
          PanGesture({ direction: PanDirection.All, distance: 1 })
            .onActionStart(this.gestureHandler('start'))
            .onActionUpdate(this.gestureHandler('update'))
            .onActionEnd(this.gestureHandler('end')).onActionCancel(this.gestureHandler('cancel')),
          TapGesture().onAction(this.gestureHandler('select'))))
        .onGestureJudgeBegin((info: GestureInfo, event: BaseGestureEvent): GestureJudgeResult => this.judgeGesture(info, event))
        .accessibilityText('曲线点编辑区；也可用下方数字字段编辑')
      Text(this.xLabel + ' →  /  ' + this.yLabel + ' ↑ · ' + this.interpolationMode.toUpperCase() + (this.isLooping ? ' 循环平铺' : ' 边界保持') + ' · 拖动圆点编辑')
        .fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
      if (this.previewIssue.length > 0) { Text(this.previewIssue).fontSize(UiStyle.helper).fontColor(UiStyle.danger).width('100%') }
      if (this.outsideCount() > 0) { Text(String(this.outsideCount()) + ' 个点在预览范围外，已保留，可在下方修改。').fontSize(UiStyle.helper).fontColor(UiStyle.warning).width('100%') }
      if (this.points.length === 0) { Text('暂无曲线点').fontSize(UiStyle.textFor(this.compact)).fontColor(UiStyle.muted) }
      if (this.points.length > 0) {
        List({ space: 4 }) {
          ForEach(this.points, (point: MotionCurvePoint, index: number) => {
            ListItem() {
              Column() {
                Row() {
                  Text('点 ' + (index + 1) + (index === this.selected ? ' · 已选' : '')).fontSize(UiStyle.textFor(this.compact)).fontColor(UiStyle.ink).layoutWeight(1)
                    .fontWeight(index === this.selected ? FontWeight.Medium : FontWeight.Normal).wordBreak(WordBreak.BREAK_ALL)
                  Button('删除')
                    .type(ButtonType.Normal).buttonStyle(ButtonStyleMode.NORMAL).controlSize(ControlSize.NORMAL).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 12, right: 12, top: 8, bottom: 8 }).constraintSize({ minHeight: UiStyle.controlFor(this.compact), maxWidth: '100%', minWidth: UiStyle.controlFor(this.compact) }).responseRegion({ y: -4, width: '100%', height: UiStyle.control }).fontSize(UiStyle.textFor(this.compact)).borderRadius(UiStyle.radius)
                    .fontColor(UiStyle.danger).backgroundColor(UiStyle.field).border({ width: 1, color: UiStyle.edge })
                    .stateStyles({
                      focused: { .outline({ width: 2, color: UiStyle.accent }) },
                      disabled: { .opacity(UiStyle.disabledOpacity) }
                    }).onClick(this.removeHandler(index))
                }.width('100%')
                SettingsNumberField({ label: this.xLabel, value: point.x, compact: this.compact, minimum: this.minimumX, maximum: this.maximumX,
                  draftOwner: this.draftOwner, draftScope: this.coordinateDraftScope(), draftKey: 'point:' + index + ':x',
                  draftSource: this.coordinateDraftSource(), draftEpoch: this.draftEpoch, draftGuard: this.coordinateGuard(), onCommit: this.pointHandler(index, 'x') })
                SettingsNumberField({ label: this.yLabel, value: point.y, compact: this.compact, minimum: this.minimumY, maximum: this.maximumY,
                  draftOwner: this.draftOwner, draftScope: this.coordinateDraftScope(), draftKey: 'point:' + index + ':y',
                  draftSource: this.coordinateDraftSource(), draftEpoch: this.draftEpoch, draftGuard: this.coordinateGuard(), onCommit: this.pointHandler(index, 'y') })
              }.width('100%').padding({ top: 8, bottom: 8 }).backgroundColor(index === this.selected ? UiStyle.accentSoft : UiStyle.card)
            }
          }, (_point: MotionCurvePoint, index: number): string => this.editToken() + ':' + index)
        }.height(this.compact ? 300 : 360).width('100%').scrollBar(BarState.On)
          .nestedScroll({ scrollForward: NestedScrollMode.SELF_FIRST, scrollBackward: NestedScrollMode.SELF_FIRST })
      }
      ForEach([this.editToken()], (_context: string) => {
      SettingsNumberField({ label: '新点 ' + this.xLabel, value: this.draftX, compact: this.compact, minimum: this.minimumX, maximum: this.maximumX,
        draftOwner: this.draftOwner, draftScope: this.coordinateDraftScope(), draftKey: 'new:x',
        draftSource: this.coordinateDraftSource(), draftEpoch: this.draftEpoch, draftGuard: this.coordinateGuard(), onCommit: this.draftHandler('x') })
      SettingsNumberField({ label: '新点 ' + this.yLabel, value: this.draftY, compact: this.compact, minimum: this.minimumY, maximum: this.maximumY,
        draftOwner: this.draftOwner, draftScope: this.coordinateDraftScope(), draftKey: 'new:y',
        draftSource: this.coordinateDraftSource(), draftEpoch: this.draftEpoch, draftGuard: this.coordinateGuard(), onCommit: this.draftHandler('y') })
      }, (context: string): string => context)
      Button('＋ 添加曲线点')
        .type(ButtonType.Normal).buttonStyle(ButtonStyleMode.NORMAL).controlSize(ControlSize.NORMAL).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 12, right: 12, top: 8, bottom: 8 }).constraintSize({ minHeight: UiStyle.controlFor(this.compact), maxWidth: '100%', minWidth: UiStyle.controlFor(this.compact) }).responseRegion({ y: -4, width: '100%', height: UiStyle.control }).width('100%').fontSize(UiStyle.textFor(this.compact))
        .borderRadius(UiStyle.radius).enabled(this.points.length < this.maximumPoints).fontColor(UiStyle.ink).backgroundColor(UiStyle.field).border({ width: 1, color: UiStyle.edge })
        .stateStyles({
          focused: { .outline({ width: 2, color: UiStyle.accent }) },
          disabled: { .opacity(UiStyle.disabledOpacity) }
        }).onClick(this.addHandler())
      if (this.message.length > 0) { Text(this.message).fontSize(UiStyle.helper).fontColor(UiStyle.danger).width('100%') }
    }.width('100%')
  }
}
