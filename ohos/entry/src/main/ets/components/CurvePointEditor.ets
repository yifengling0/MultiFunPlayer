import { UiStyle } from '../presentation/UiStyle';
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
  aboutToDisappear(): void { KeyboardInputSession.releaseEditor(this.keyboardEditorId); }
  @Prop label: string = '';
  @Prop @Watch('refreshValue') value: number = 0;
  @Prop minimum: number | null = null;
  @Prop maximum: number | null = null;
  @Prop allowInfinity: boolean = false;
  @Prop integer: boolean = false;
  @Prop compact: boolean = false;
  @Prop unit: string = '';
  @Prop editable: boolean = true;
  @Prop commitEqualEdits: boolean = false;
  private edited: boolean = false;
  onCommit: (value: number) => boolean = (_value: number): boolean => true;
  onEdit: () => void = (): void => {};
  @State draft: string = '';
  @State error: boolean = false;
  aboutToAppear(): void { KeyboardInputSession.releaseEditor(this.keyboardEditorId); this.keyboardEditorId = KeyboardInputSession.newEditorId(); this.refreshValue(); }
  private refreshValue(): void { this.keyboardEditorId = KeyboardInputSession.renewEditor(this.keyboardEditorId); this.draft = SettingsNumberLogic.format(this.value); this.error = false; this.edited = false; }
  private commit(): void {
    if (!this.editable) { return; }
    const value: number | null = SettingsNumberLogic.parse(this.draft, this.allowInfinity);
    if (value === null || !SettingsNumberLogic.valid(value, this.minimum, this.maximum, this.allowInfinity, this.integer)) {
      this.error = true; return;
    }
    if (value === this.value && (!this.commitEqualEdits || !this.edited)) { this.draft = SettingsNumberLogic.format(value); this.error = false; return; }
    this.error = !this.onCommit(value);
    if (!this.error) { this.draft = SettingsNumberLogic.format(value); this.edited = false; }
  }
  build() {
    Column({ space: 2 }) {
      Column({ space: UiStyle.gap(this.compact) }) {
        Text(this.label + (this.unit.length > 0 ? ' · ' + this.unit : '')).fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.ink)
          .width('100%').textAlign(TextAlign.Start)
        TextInput({ text: this.draft }).fontSize(UiStyle.body(this.compact)).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).borderRadius(UiStyle.radius)
          .backgroundColor(UiStyle.field).border({ width: 1, color: this.error ? UiStyle.danger : UiStyle.edge })
          .width('100%').enabled(this.editable)
          .accessibilityText(this.label).onChange(KeyboardInputSession.changeHandler(this.keyboardEditorId, (text: string) => { this.draft = text; this.error = false; this.edited = true; this.onEdit(); }))
          .onSubmit(KeyboardInputSession.submitHandler(this.keyboardEditorId, () => this.commit())).onFocus(KeyboardInputSession.focusHandler(this.keyboardEditorId, true))
          .onBlur(KeyboardInputSession.blurHandler(this.keyboardEditorId, () => this.commit()))
          .onKeyPreIme(KeyboardInputSession.emergencyHandler(this.keyboardEditorId))
      }.width('100%')
      if (this.error) { Text('数值无效或超出允许范围').fontSize(UiStyle.helper).fontColor(UiStyle.danger).width('100%') }
    }.width('100%').margin({ bottom: UiStyle.gap(this.compact) })
  }
}

@Component
export struct SettingsTextField {
  private keyboardEditorId: number = KeyboardInputSession.newEditorId();
  aboutToDisappear(): void { KeyboardInputSession.releaseEditor(this.keyboardEditorId); }
  @Prop label: string = '';
  @Prop @Watch('refreshValue') value: string = '';
  @Prop compact: boolean = false;
  @Prop editable: boolean = true;
  onCommit: (value: string) => boolean = (_value: string): boolean => true;
  onEdit: () => void = (): void => {};
  @State draft: string = '';
  @State error: boolean = false;
  aboutToAppear(): void { KeyboardInputSession.releaseEditor(this.keyboardEditorId); this.keyboardEditorId = KeyboardInputSession.newEditorId(); this.refreshValue(); }
  private refreshValue(): void { this.keyboardEditorId = KeyboardInputSession.renewEditor(this.keyboardEditorId); this.draft = this.value; this.error = false; }
  private commit(): void {
    if (!this.editable || this.draft === this.value) { this.error = false; return; }
    this.error = !this.onCommit(this.draft);
  }
  build() {
    Column({ space: 3 }) {
      Text(this.label).fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.ink).width('100%').wordBreak(WordBreak.BREAK_ALL)
      TextInput({ text: this.draft }).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).fontSize(UiStyle.body(this.compact)).borderRadius(UiStyle.radius)
        .backgroundColor(UiStyle.field).border({ width: 1, color: this.error ? UiStyle.danger : UiStyle.edge }).width('100%')
        .enabled(this.editable).accessibilityText(this.label)
        .onChange(KeyboardInputSession.changeHandler(this.keyboardEditorId, (text: string) => { this.draft = text; this.error = false; this.onEdit(); }))
        .onSubmit(KeyboardInputSession.submitHandler(this.keyboardEditorId, () => this.commit())).onFocus(KeyboardInputSession.focusHandler(this.keyboardEditorId, true))
          .onBlur(KeyboardInputSession.blurHandler(this.keyboardEditorId, () => this.commit()))
          .onKeyPreIme(KeyboardInputSession.emergencyHandler(this.keyboardEditorId))
      if (this.error) { Text('内容无效，请检查格式或重复名称').fontSize(UiStyle.helper).fontColor(UiStyle.danger).width('100%') }
    }.width('100%').margin({ bottom: UiStyle.gap(this.compact) })
  }
}

@Component
export struct SettingsSwitchField {
  @Prop label: string = '';
  @Prop value: boolean = false;
  @Prop compact: boolean = false;
  @Prop editable: boolean = true;
  onChange: (value: boolean) => void = (_value: boolean): void => {};
  build() {
    Row({ space: 8 }) {
      Text(this.label).fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.ink).layoutWeight(1)
      Toggle({ type: ToggleType.Switch, isOn: this.value }).width(60).height(UiStyle.control).selectedColor(UiStyle.accent).enabled(this.editable)
        .accessibilityText(this.label).onChange((value: boolean) => this.onChange(value))
    }.width('100%').constraintSize({ minHeight: UiStyle.control }).margin({ bottom: 3 })
  }
}

@Component
export struct SettingsChoiceField {
  @Prop label: string = '';
  @Prop selected: string = '';
  @Prop options: SettingsOption[] = [];
  @Prop compact: boolean = false;
  @Prop editable: boolean = true;
  onSelect: (value: string) => void = (_value: string): void => {};
  private index(): number { return this.options.findIndex(option => option.value === this.selected); }
  private labelText(): string {
    const index: number = this.index();
    return index < 0 ? this.selected + '（不可用，已保留）' : this.options[index].label;
  }
  build() {
    Column({ space: UiStyle.gap(this.compact) }) {
      Text(this.label).fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.ink).width('100%').wordBreak(WordBreak.BREAK_ALL)
        .textAlign(TextAlign.Start)
      Select(this.options.map((option: SettingsOption): SelectOption => { return { value: option.label }; }))
        .selected(this.index()).value(this.labelText()).optionHeight(UiStyle.control).font({ size: UiStyle.body(this.compact) }).optionFont({ size: UiStyle.body(this.compact) }).selectedOptionFont({ size: UiStyle.body(this.compact) }).fontColor(UiStyle.ink)
        .backgroundColor(UiStyle.accentSoft).borderRadius(UiStyle.radius).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' })
        .width('100%').enabled(this.editable).accessibilityText(this.label)
        .onSelect((index: number) => { if (index >= 0 && index < this.options.length) { this.onSelect(this.options[index].value); } })
      // Select's platform label may elide; this fully wrapping text retains the entire value.
      Text(this.labelText()).fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
    }.width('100%').margin({ bottom: UiStyle.gap(this.compact) })
  }
}

@Component
export struct SettingsSectionTitle {
  @Prop label: string = '';
  build() {
    Text(this.label).fontSize(UiStyle.heading).fontWeight(FontWeight.Bold).fontColor(UiStyle.ink).width('100%').wordBreak(WordBreak.BREAK_ALL)
      .padding({ left: 12, right: 12, top: 12, bottom: 12 }).backgroundColor(UiStyle.accentSoft).borderRadius(UiStyle.radius).border({ width: 1, color: UiStyle.edgeLight }).margin({ top: 12, bottom: 12 })
  }
}

@Component
export struct CurvePointEditor {
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
    this.geometryMounted = false; this.dragging = false;
    if (this.geometryOwner > 0) { this.onGeometry(this.geometryOwner, 0, 0, false); }
    this.geometryOwner = 0;
  }
  private bindingChanged(): void {
    if (this.geometryOwner > 0) { this.onGeometry(this.geometryOwner, 0, 0, false); }
    this.geometryOwner = CurveGeometryOwners.next(); this.dragging = false; this.refreshEditContext();
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
      if (changed) { this.refreshEditContext(); this.dragging = false; } this.draw();
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
  private pointsChanged(): void {
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
    this.canvas.fillStyle = '#FFFFFF'; this.canvas.fillRect(0, 0, this.canvasWidth, 180);
    this.canvas.strokeStyle = '#E0E5E8'; this.canvas.lineWidth = 1;
    for (let line: number = 0; line <= 4; line++) {
      this.canvas.beginPath(); this.canvas.moveTo(12, 12 + line * 39); this.canvas.lineTo(this.canvasWidth - 12, 12 + line * 39); this.canvas.stroke();
    }
    const points: MotionCurvePoint[] = this.dragging ? this.workingPoints : this.points;
    const bounds: number[] = this.bounds();
    const preview: CurvePreviewResult = CurvePreview.build(points, bounds[0], bounds[1], this.minimumY, this.maximumY,
      this.interpolationMode, this.isLooping);
    this.previewIssue = preview.issue;
    this.canvas.strokeStyle = '#087E8B'; this.canvas.lineWidth = 2;
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
      this.canvas.fillStyle = index === this.selected ? '#142D3A' : '#087E8B'; this.canvas.fill();
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
    this.selected = selected; this.dragging = selected >= 0;
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
  private cancelPoint(): void { this.dragging = false; this.pointsChanged(); }
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
    if (edited === null) { this.message = this.strictX ? '横坐标必须递增且不能重复。' : '请检查曲线坐标范围。'; return false; }
    this.message = ''; this.onChange(edited); return true;
  }
  private add(): void {
    const edited: MotionCurvePoint[] | null = CurveEditRules.add(this.points, this.draftX, this.draftY,
      this.minimumX, this.maximumX, this.minimumY, this.maximumY, this.strictX, this.maximumPoints);
    if (edited === null) { this.message = '无法添加：检查坐标、重复横坐标或点数上限。'; return; }
    this.message = ''; this.onChange(edited);
  }
  private currentEditSnapshot(): string {
    return this.geometryOwner + ':' + this.bindingKey + ':' + JSON.stringify(this.points) + ':' +
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
    return this.geometryMounted && token === this.editToken() && callback === this.onChange &&
      this.editSnapshot === this.currentEditSnapshot();
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
    return (): void => { if (this.editCurrent(token, callback)) { this.selected = -1; callback(CurveEditRules.remove(this.points, index)); } };
  }
  private draftHandler(coordinate: string): (value: number) => boolean {
    const token: string = this.editToken(); const callback: (points: MotionCurvePoint[]) => void = this.onChange;
    return (value: number): boolean => { if (!this.editCurrent(token, callback)) { return false; }
      if (coordinate === 'x') { this.draftX = value; } else { this.draftY = value; } return true; };
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
      if (this.points.length === 0) { Text('暂无曲线点').fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.muted) }
      if (this.points.length > 0) {
        List({ space: 4 }) {
          ForEach(this.points, (point: MotionCurvePoint, index: number) => {
            ListItem() {
              Column() {
                Row() {
                  Text('点 ' + (index + 1)).fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.ink).layoutWeight(1)
                  Button('删除').fontColor(UiStyle.ink).backgroundColor(UiStyle.accentSoft)
                    .type(ButtonType.Normal).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 14, right: 14, top: 12, bottom: 12 }).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.danger).backgroundColor(UiStyle.accentSoft).borderRadius(UiStyle.radius)
                    .fontColor(UiStyle.danger).backgroundColor(UiStyle.dangerSoft).onClick(this.removeHandler(index))
                }.width('100%')
                SettingsNumberField({ label: this.xLabel, value: point.x, compact: this.compact, minimum: this.minimumX, maximum: this.maximumX,
                  onCommit: this.pointHandler(index, 'x') })
                SettingsNumberField({ label: this.yLabel, value: point.y, compact: this.compact, minimum: this.minimumY, maximum: this.maximumY,
                  onCommit: this.pointHandler(index, 'y') })
              }.width('100%').padding(8).backgroundColor(index === this.selected ? UiStyle.accentSoft : UiStyle.card)
            }
          }, (_point: MotionCurvePoint, index: number): string => this.editToken() + ':' + index)
        }.height(this.compact ? 300 : 360).width('100%').scrollBar(BarState.On)
          .nestedScroll({ scrollForward: NestedScrollMode.SELF_FIRST, scrollBackward: NestedScrollMode.SELF_FIRST })
      }
      ForEach([this.editToken()], (_context: string) => {
      SettingsNumberField({ label: '新点 ' + this.xLabel, value: this.draftX, compact: this.compact, minimum: this.minimumX, maximum: this.maximumX,
        onCommit: this.draftHandler('x') })
      SettingsNumberField({ label: '新点 ' + this.yLabel, value: this.draftY, compact: this.compact, minimum: this.minimumY, maximum: this.maximumY,
        onCommit: this.draftHandler('y') })
      }, (context: string): string => context)
      Button('＋ 添加曲线点').fontColor(UiStyle.ink).backgroundColor(UiStyle.accentSoft)
        .type(ButtonType.Normal).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 14, right: 14, top: 12, bottom: 12 }).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).width('100%').fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.ink)
        .backgroundColor(UiStyle.accentSoft).borderRadius(UiStyle.radius).enabled(this.points.length < this.maximumPoints).onClick(this.addHandler())
      if (this.message.length > 0) { Text(this.message).fontSize(UiStyle.helper).fontColor(UiStyle.danger).width('100%') }
    }.width('100%')
  }
}
