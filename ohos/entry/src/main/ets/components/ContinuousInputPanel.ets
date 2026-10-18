import { UiStyle } from '../presentation/UiStyle';
import { SettingsDraftOwner } from '../presentation/SettingsDraftOwner';
import { ContinuousInputConfiguration, ContinuousInputMapping, ContinuousInputAction, ContinuousActionSpec, continuousActionCatalog } from '../input/ContinuousInputConfiguration';
import { LocalInputPhase, LocalNativeSource, LocalAxisTool, LocalTouchPoint, LocalTouchPacket, LocalMousePacket, LocalWheelPacket, LocalSurfaceGeometry } from '../input/LocalDrivePointer';
import { SettingsNumberField, SettingsTextField, SettingsSwitchField, SettingsChoiceField, SettingsOption, SettingsSectionTitle } from './CurvePointEditor';
import { t } from '../l10n/Texts';

/** Detached validated edits only. No gesture, reception or output state is saved. */
export class ContinuousInputEdits {
  static checked(next: ContinuousInputConfiguration): ContinuousInputConfiguration | null {
    return ContinuousInputConfiguration.validate(next).length === 0 ? next : null;
  }
  static mapping(configuration: ContinuousInputConfiguration, id: string,
    edit: (mapping: ContinuousInputMapping) => void): ContinuousInputConfiguration | null {
    const next = ContinuousInputConfiguration.clone(configuration);
    const mapping = next.mappings.find(item => item.id === id);
    if (mapping === undefined) { return null; }
    edit(mapping); return ContinuousInputEdits.checked(next);
  }
  static add(configuration: ContinuousInputConfiguration, axis: string): ContinuousInputConfiguration | null {
    if (configuration.mappings.length >= ContinuousInputConfiguration.MAX_MAPPINGS) { return null; }
    const next = ContinuousInputConfiguration.clone(configuration); let index: number = 1;
    while (next.mappings.some(item => item.id === 'local-' + index)) { index++; }
    const mapping = new ContinuousInputMapping('local-' + index, '本地输入 ' + index);
    if (/^[A-Z][0-9]$/.test(axis)) { mapping.actions.push(new ContinuousInputAction('Axis::Value::Drive', axis)); }
    next.mappings.push(mapping); return ContinuousInputEdits.checked(next);
  }
  static remove(configuration: ContinuousInputConfiguration, id: string): ContinuousInputConfiguration | null {
    const next = ContinuousInputConfiguration.clone(configuration);
    next.mappings = next.mappings.filter(item => item.id !== id); return ContinuousInputEdits.checked(next);
  }
  static source(configuration: ContinuousInputConfiguration, id: string, value: string): ContinuousInputConfiguration | null {
    if (value !== 'touch' && value !== 'mouse' && value !== 'wheel') { return null; }
    return ContinuousInputEdits.mapping(configuration, id, mapping => {
      mapping.source = value; mapping.component = value === 'wheel' ? 'wheelY' : 'x';
      if (value === 'wheel') { mapping.kind = 'drive'; }
    });
  }
  static action(configuration: ContinuousInputConfiguration, id: string, index: number,
    edit: (action: ContinuousInputAction) => void): ContinuousInputConfiguration | null {
    const current = configuration.mappings.find(item => item.id === id);
    if (current === undefined || !Number.isInteger(index) || index < 0 || index >= current.actions.length) { return null; }
    return ContinuousInputEdits.mapping(configuration, id, mapping => { edit(mapping.actions[index]); });
  }
}

/** Embedded in the parent's collapsed Input advanced section. Parent owns the
 * LocalDrivePointer and engine across status renders; this component only copies
 * native input synchronously and forwards guarded, scoped DTOs. */
@Component
export struct ContinuousInputPanel {
  draftOwner: SettingsDraftOwner = new SettingsDraftOwner();
  @Prop @Watch('contextChanged') draftScope: string = '';
  @Prop @Watch('contextChanged') draftEpoch: number = 0;
  @Prop compact: boolean = false;
  @Prop @Watch('contextChanged') configuration: ContinuousInputConfiguration = new ContinuousInputConfiguration();
  @Prop @Watch('contextChanged') selectedMappingId: string = '';
  @Prop @Watch('contextChanged') readOnly: boolean = false;
  @Prop @Watch('contextChanged') ownerKey: string = '';
  @Prop @Watch('contextChanged') receptionRevision: number = 0;
  @Prop receiving: boolean = false;
  @Prop contactActive: boolean = false;
  @Prop canReceive: boolean = false;
  @Prop status: string = '';
  @Prop latestValue: number = 0.5;
  @Prop latestDelta: number = 0;
  @Prop lastAction: string = '';
  @Prop axisOptions: SettingsOption[] = [];
  @Prop outputOptions: SettingsOption[] = [];
  onChange: (configuration: ContinuousInputConfiguration) => void = (_configuration: ContinuousInputConfiguration): void => {};
  onSelectMapping: (id: string) => void = (_id: string): void => {};
  onEnable: (id: string) => void = (_id: string): void => {};
  onCancel: (reason: string, ownerKey: string, receptionRevision: number) => void = (_reason: string, _ownerKey: string, _receptionRevision: number): void => {};
  onLocalTouch: (packet: LocalTouchPacket) => boolean = (_packet: LocalTouchPacket): boolean => false;
  onLocalMouse: (packet: LocalMousePacket) => boolean = (_packet: LocalMousePacket): boolean => false;
  onLocalWheel: (packet: LocalWheelPacket) => boolean = (_packet: LocalWheelPacket): boolean => false;
  onSurfaceChanged: (geometry: LocalSurfaceGeometry, ownerKey: string, receptionRevision: number) => void = (_geometry: LocalSurfaceGeometry, _ownerKey: string, _receptionRevision: number): void => {};
  @State error: string = '';
  @State renderRevision: number = 0;
  private active: boolean = true;
  private editEpoch: number = 0;
  private mountedOwnerKey: string = '';
  private mountedRevision: number = 0;
  private mountedCancel: (reason: string, ownerKey: string, receptionRevision: number) => void = (_reason: string, _ownerKey: string, _receptionRevision: number): void => {};
  aboutToAppear(): void {
    this.active = true; this.editEpoch++; this.rememberOwner();
  }
  aboutToDisappear(): void {
    this.active = false; this.editEpoch++;
    this.mountedCancel('surface-disappeared', this.mountedOwnerKey, this.mountedRevision);
  }
  private rememberOwner(): void {
    this.mountedOwnerKey = this.ownerKey; this.mountedRevision = this.receptionRevision; this.mountedCancel = this.onCancel;
  }
  private contextChanged(): void { this.editEpoch++; this.renderRevision++; this.rememberOwner(); }
  private mapping(): ContinuousInputMapping | null {
    const result = this.configuration.mappings.find(item => item.id === this.selectedMappingId);
    return result === undefined ? null : result;
  }
  private selectedMappings(): ContinuousInputMapping[] {
    return this.configuration.mappings.filter(item => item.id === this.selectedMappingId);
  }
  private guardKey(): string {
    return JSON.stringify([this.ownerKey, this.receptionRevision, this.draftScope, this.draftEpoch,
      this.selectedMappingId, this.readOnly, this.configuration, this.axisOptions, this.outputOptions]);
  }
  private owns(key: string, epoch: number): boolean {
    return this.active && !this.readOnly && this.editEpoch === epoch && this.guardKey() === key;
  }
  private editGuard(): () => boolean {
    const key: string = this.guardKey(); const epoch: number = this.editEpoch;
    const change = this.onChange; const cancel = this.onCancel;
    const configuration = this.configuration; const draftOwner = this.draftOwner;
    return (): boolean => this.owns(key, epoch) && configuration === this.configuration && draftOwner === this.draftOwner &&
      change === this.onChange && cancel === this.onCancel;
  }
  private command(handler: () => void): () => void {
    const guard = this.editGuard(); return (): void => { if (guard()) { handler(); } };
  }
  private choice(handler: (value: string) => void): (value: string) => void {
    const guard = this.editGuard(); return (value: string): void => { if (guard()) { handler(value); } };
  }
  private flag(handler: (value: boolean) => void): (value: boolean) => void {
    const guard = this.editGuard(); return (value: boolean): void => { if (guard()) { handler(value); } };
  }
  private number(handler: (value: number) => boolean): (value: number) => boolean {
    const guard = this.editGuard(); return (value: number): boolean => guard() && handler(value);
  }
  private text(handler: (value: string) => boolean): (value: string) => boolean {
    const guard = this.editGuard(); return (value: string): boolean => guard() && handler(value);
  }
  private cancelHandler(reason: string): () => void {
    const key: string = this.guardKey(); const epoch: number = this.editEpoch; const callback = this.onCancel;
    const configuration = this.configuration;
    const owner: string = this.ownerKey; const revision: number = this.receptionRevision;
    return (): void => {
      if (this.active && this.editEpoch === epoch && this.guardKey() === key && configuration === this.configuration && callback === this.onCancel) {
        callback(reason, owner, revision);
      }
    };
  }
  private emit(next: ContinuousInputConfiguration | null): boolean {
    if (this.readOnly || next === null) { this.error = '设置无效，请检查动作目标、参数和数量。'; return false; }
    this.onCancel('configuration-edit', this.ownerKey, this.receptionRevision);
    this.error = ''; this.editEpoch++; this.onChange(next); return true;
  }
  private changeMapping(id: string, edit: (mapping: ContinuousInputMapping) => void): boolean {
    return this.emit(ContinuousInputEdits.mapping(this.configuration, id, edit));
  }
  private changeAction(id: string, index: number, edit: (action: ContinuousInputAction) => void): boolean {
    return this.emit(ContinuousInputEdits.action(this.configuration, id, index, edit));
  }
  private selectHandler(): (id: string) => void {
    const guard = this.editGuard(); const callback = this.onSelectMapping;
    return (id: string): void => {
      if (guard() && callback === this.onSelectMapping && this.configuration.mappings.some(item => item.id === id)) {
        this.onCancel('mapping-selection', this.ownerKey, this.receptionRevision); callback(id);
      }
    };
  }
  private addMapping(): void {
    const axis: string = this.axisOptions.length > 0 ? this.axisOptions[0].value : '';
    const next = ContinuousInputEdits.add(this.configuration, axis);
    if (next !== null && this.emit(next)) { this.onSelectMapping(next.mappings[next.mappings.length - 1].id); }
  }
  private mappingSource(mapping: ContinuousInputMapping): string { return JSON.stringify(mapping); }
  private pendingDraft(): boolean { return this.draftOwner.hasPending(this.draftScope); }
  private available(): boolean {
    const mapping = this.mapping();
    return this.active && !this.readOnly && this.canReceive && this.configuration.enabled && mapping !== null &&
      mapping.enabled && mapping.actions.length > 0 && !this.pendingDraft() && ContinuousInputConfiguration.validate(this.configuration).length === 0;
  }
  private enableHandler(): () => void {
    const guard = this.editGuard(); const callback = this.onEnable; const id: string = this.selectedMappingId;
    return (): void => { if (guard() && callback === this.onEnable && this.available() && !this.receiving) { callback(id); } };
  }
  private nativeSource(source: SourceType): LocalNativeSource {
    return source === SourceType.TouchScreen ? 'touch' : source === SourceType.Mouse ? 'mouse' : 'unknown';
  }
  private touchPhase(type: TouchType): LocalInputPhase {
    return type === TouchType.Down ? 'begin' : type === TouchType.Move ? 'update' : type === TouchType.Up ? 'end' : type === TouchType.Cancel ? 'cancel' : 'unknown';
  }
  private mousePhase(action: MouseAction): LocalInputPhase {
    return action === MouseAction.Press ? 'begin' : action === MouseAction.Move ? 'update' : action === MouseAction.Release ? 'end' : action === MouseAction.CANCEL ? 'cancel' : 'unknown';
  }
  private axisPhase(action: AxisAction): LocalInputPhase {
    return action === AxisAction.BEGIN ? 'begin' : action === AxisAction.UPDATE ? 'update' : action === AxisAction.END ? 'end' : action === AxisAction.CANCEL ? 'cancel' : 'unknown';
  }
  private touchHandler(): (event: TouchEvent) => void {
    const guard = this.editGuard(); const callback = this.onLocalTouch;
    const owner: string = this.ownerKey; const revision: number = this.receptionRevision;
    return (event: TouchEvent): void => {
      // onTouch also receives converted left-mouse events. Only its native
      // touchscreen source is admitted; mouse owns the separate onMouse path.
      if (!guard() || !this.receiving || callback !== this.onLocalTouch || event.source !== SourceType.TouchScreen) { return; }
      const packet = new LocalTouchPacket(owner, revision, this.touchPhase(event.type), event.timestamp,
        event.source, event.sourceTool, this.nativeSource(event.source),
        event.touches.map((point: TouchObject): LocalTouchPoint => new LocalTouchPoint(point.id, point.x, point.y)),
        event.changedTouches.map((point: TouchObject): LocalTouchPoint => new LocalTouchPoint(point.id, point.x, point.y)));
      if (callback(packet)) { event.stopPropagation(); }
    };
  }
  private mouseHandler(): (event: MouseEvent) => void {
    const guard = this.editGuard(); const callback = this.onLocalMouse;
    const owner: string = this.ownerKey; const revision: number = this.receptionRevision;
    return (event: MouseEvent): void => {
      if (!guard() || !this.receiving || callback !== this.onLocalMouse || event.source !== SourceType.Mouse) { return; }
      const pressed: boolean | null = event.pressedButtons === undefined ? null : event.pressedButtons.indexOf(MouseButton.Left) >= 0;
      const packet = new LocalMousePacket(owner, revision, this.mousePhase(event.action), event.timestamp,
        event.source, event.sourceTool, this.nativeSource(event.source), event.x, event.y, event.button === MouseButton.Left, pressed);
      if (callback(packet)) { event.stopPropagation(); }
    };
  }
  private wheelHandler(): (event: AxisEvent) => void {
    const guard = this.editGuard(); const callback = this.onLocalWheel;
    const owner: string = this.ownerKey; const revision: number = this.receptionRevision;
    return (event: AxisEvent): void => {
      let handled: boolean = false;
      try {
        if (guard() && this.receiving && callback === this.onLocalWheel && event.source === SourceType.Mouse) {
          const tool: LocalAxisTool = event.sourceTool === SourceTool.MOUSE ? 'mouse' : event.sourceTool === SourceTool.TOUCHPAD ? 'touchpad' : 'unknown';
          const packet = new LocalWheelPacket(owner, revision, this.axisPhase(event.action), event.timestamp,
            event.source, event.sourceTool, this.nativeSource(event.source), tool, event.x, event.y,
            event.getHorizontalAxisValue(), event.getVerticalAxisValue());
          handled = callback(packet);
        }
      } finally {
        // ArkUI defaults axis events to consumed. Disabled/stale/unmatched paths
        // must synchronously release propagation, including terminal/no-op data.
        if (!handled) { event.propagation(); }
      }
    };
  }
  private areaHandler(): (oldArea: Area, area: Area) => void {
    const key: string = this.guardKey(); const epoch: number = this.editEpoch; const callback = this.onSurfaceChanged;
    const configuration = this.configuration;
    const owner: string = this.ownerKey; const revision: number = this.receptionRevision;
    return (_oldArea: Area, area: Area): void => {
      if (this.active && this.editEpoch === epoch && this.guardKey() === key && configuration === this.configuration && callback === this.onSurfaceChanged) {
        callback(new LocalSurfaceGeometry(Number(area.width), Number(area.height),
          Number(area.globalPosition.x), Number(area.globalPosition.y)), owner, revision);
      }
    };
  }
  private hoverHandler(): (hovering: boolean) => void {
    const cancel = this.cancelHandler('left-region');
    return (hovering: boolean): void => { if (!hovering && this.receiving) { cancel(); } };
  }
  private editorTouchHandler(): (event: TouchEvent) => void {
    const cancel = this.cancelHandler('editor-opened');
    return (event: TouchEvent): void => { if (this.receiving && event.type === TouchType.Down) { cancel(); } };
  }
  private editorMouseHandler(): (event: MouseEvent) => void {
    const cancel = this.cancelHandler('editor-opened');
    return (event: MouseEvent): void => { if (this.receiving && event.action === MouseAction.Press) { cancel(); } };
  }
  private spec(id: string): ContinuousActionSpec {
    const spec = continuousActionCatalog().find(item => item.id === id);
    return spec === undefined ? new ContinuousActionSpec('', '不可用动作') : spec;
  }
  private actionOptions(): SettingsOption[] { return continuousActionCatalog().map(item => new SettingsOption(item.id, item.label)); }
  private mappings(): SettingsOption[] { return this.configuration.mappings.map(item => new SettingsOption(item.id, item.name || item.id)); }
  private sources(): SettingsOption[] { return [new SettingsOption('touch', '本地触屏'), new SettingsOption('mouse', '按住鼠标左键'), new SettingsOption('wheel', '本地滚轮 / 触控板轴')]; }
  private components(mapping: ContinuousInputMapping): SettingsOption[] {
    return mapping.source === 'wheel' ? [new SettingsOption('wheelX', '横向轴'), new SettingsOption('wheelY', '纵向轴')] :
      [new SettingsOption('x', '水平位置 / 位移'), new SettingsOption('y', '垂直位置 / 位移')];
  }
  private kinds(mapping: ContinuousInputMapping): SettingsOption[] {
    return mapping.source === 'wheel' ? [new SettingsOption('drive', 'Drive · 即时')] :
      [new SettingsOption('drive', 'Drive · 即时'), new SettingsOption('offset', 'Offset · 接触时每 100 ms')];
  }
  private modes(mapping: ContinuousInputMapping): SettingsOption[] {
    return mapping.kind === 'offset' ? [new SettingsOption('Absolute', 'Absolute'), new SettingsOption('AbsoluteJoystick', 'AbsoluteJoystick')] :
      [new SettingsOption('Absolute', 'Absolute'), new SettingsOption('Relative', 'Relative'), new SettingsOption('RelativePositiveOnly', 'RelativePositiveOnly'),
        new SettingsOption('RelativeNegativeOnly', 'RelativeNegativeOnly'), new SettingsOption('RelativeJoystick', 'RelativeJoystick')];
  }
  private changeMode(id: string, value: string): void {
    this.changeMapping(id, mapping => {
      if (mapping.kind === 'offset' && (value === 'Absolute' || value === 'AbsoluteJoystick')) { mapping.offsetMode = value; }
      else if (value === 'Absolute' || value === 'Relative' || value === 'RelativePositiveOnly' || value === 'RelativeNegativeOnly' || value === 'RelativeJoystick') { mapping.driveMode = value; }
    });
  }
  private replaceAction(id: string, index: number, actionId: string): void {
    const spec = this.spec(actionId);
    this.changeMapping(id, mapping => {
      const old = mapping.actions[index]; if (old === undefined) { return; }
      const output: string = old.outputTargetId.length > 0 ? old.outputTargetId : this.outputOptions.length > 0 ? this.outputOptions[0].value : '';
      mapping.actions[index] = new ContinuousInputAction(actionId, old.targetAxis,
        spec.targetProvider ? old.provider || 'Pattern' : '', spec.targetOutput ? output : '');
    });
  }
  private addAction(id: string): void {
    if (this.axisOptions.length === 0) { this.error = '请先配置目标轴。'; return; }
    this.changeMapping(id, mapping => {
      if (mapping.actions.length < ContinuousInputConfiguration.MAX_ACTIONS) {
        mapping.actions.push(new ContinuousInputAction('Axis::Value::Drive', this.axisOptions[0].value));
      }
    });
  }
  @Builder
  private actionEditor(mapping: ContinuousInputMapping, action: ContinuousInputAction, index: number) {
    Column({ space: UiStyle.gap(this.compact) }) {
      SettingsChoiceField({ label: '动作 ' + (index + 1), selected: action.id, options: this.actionOptions(), compact: this.compact, editable: !this.readOnly,
        onSelect: this.choice((value: string) => this.replaceAction(mapping.id, index, value)) })
      SettingsChoiceField({ label: '明确目标轴', selected: action.targetAxis, options: this.axisOptions, compact: this.compact, editable: !this.readOnly,
        onSelect: this.choice((value: string) => { this.changeAction(mapping.id, index, item => { item.targetAxis = value; }); }) })
      if (this.spec(action.id).targetProvider) {
        SettingsChoiceField({ label: '命名提供器', selected: action.provider, compact: this.compact, editable: !this.readOnly,
          options: [new SettingsOption('Pattern'), new SettingsOption('Random'), new SettingsOption('Custom Curve'), new SettingsOption('Looping Script')],
          onSelect: this.choice((value: string) => { this.changeAction(mapping.id, index, item => { item.provider = value; }); }) })
      }
      if (this.spec(action.id).targetOutput) {
        SettingsChoiceField({ label: '明确输出目标', selected: action.outputTargetId, options: this.outputOptions, compact: this.compact, editable: !this.readOnly,
          onSelect: this.choice((value: string) => { this.changeAction(mapping.id, index, item => { item.outputTargetId = value; }); }) })
        if (action.id !== 'OutputTarget::Axis::Range::Maximum::Drive') {
          SettingsNumberField({ label: '最小限制', unit: '0–1', value: action.minimumLimit, minimum: 0, maximum: 1, compact: this.compact, editable: !this.readOnly,
            draftOwner: this.draftOwner, draftScope: this.draftScope, draftKey: 'continuous:' + mapping.id + ':action:' + index + ':minimum',
            draftSource: this.mappingSource(mapping), draftEpoch: this.draftEpoch, draftGuard: this.editGuard(), onEdit: this.cancelHandler('text-edit'),
            onCommit: this.number((value: number): boolean => this.changeAction(mapping.id, index, item => { item.minimumLimit = value; })) })
        }
        if (action.id !== 'OutputTarget::Axis::Range::Minimum::Drive') {
          SettingsNumberField({ label: '最大限制', unit: '0–1', value: action.maximumLimit, minimum: 0, maximum: 1, compact: this.compact, editable: !this.readOnly,
            draftOwner: this.draftOwner, draftScope: this.draftScope, draftKey: 'continuous:' + mapping.id + ':action:' + index + ':maximum',
            draftSource: this.mappingSource(mapping), draftEpoch: this.draftEpoch, draftGuard: this.editGuard(), onEdit: this.cancelHandler('text-edit'),
            onCommit: this.number((value: number): boolean => this.changeAction(mapping.id, index, item => { item.maximumLimit = value; })) })
        }
      }
      Button('移除动作').type(ButtonType.Normal).buttonStyle(ButtonStyleMode.NORMAL).controlSize(ControlSize.NORMAL).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip })
        .constraintSize({ minHeight: UiStyle.controlFor(this.compact), maxWidth: '100%', minWidth: UiStyle.controlFor(this.compact) }).responseRegion({ y: -4, width: '100%', height: UiStyle.control }).fontSize(UiStyle.textFor(this.compact)).borderRadius(UiStyle.radius)
        .fontColor(UiStyle.danger).backgroundColor(UiStyle.field).border({ width: 1, color: UiStyle.edge }).enabled(!this.readOnly)
        .onClick(this.command(() => { this.changeMapping(mapping.id, item => { item.actions.splice(index, 1); }); }))
    }.width('100%').padding({ top: 8, bottom: 8 })
  }
  @Builder
  private mappingEditor(mapping: ContinuousInputMapping) {
    Column({ space: UiStyle.gap(this.compact) }) {
      SettingsSwitchField({ label: '配置中启用此映射', value: mapping.enabled, compact: this.compact, editable: !this.readOnly,
        onChange: this.flag((value: boolean) => { this.changeMapping(mapping.id, item => { item.enabled = value; }); }) })
      SettingsTextField({ label: '映射名称', value: mapping.name, compact: this.compact, editable: !this.readOnly,
        draftOwner: this.draftOwner, draftScope: this.draftScope, draftKey: 'continuous:' + mapping.id + ':name',
        draftSource: this.mappingSource(mapping), draftEpoch: this.draftEpoch, draftGuard: this.editGuard(), onEdit: this.cancelHandler('text-edit'),
        onCommit: this.text((value: string): boolean => this.changeMapping(mapping.id, item => { item.name = value.trim(); })) })
      SettingsChoiceField({ label: '本地来源', selected: mapping.source, options: this.sources(), compact: this.compact, editable: !this.readOnly,
        onSelect: this.choice((value: string) => { this.emit(ContinuousInputEdits.source(this.configuration, mapping.id, value)); }) })
      SettingsChoiceField({ label: '输入分量', selected: mapping.component, options: this.components(mapping), compact: this.compact, editable: !this.readOnly,
        onSelect: this.choice((value: string) => { this.changeMapping(mapping.id, item => {
          if (value === 'x' || value === 'y' || value === 'wheelX' || value === 'wheelY') { item.component = value; }
        }); }) })
      SettingsChoiceField({ label: '转换类型', selected: mapping.kind, options: this.kinds(mapping), compact: this.compact, editable: !this.readOnly,
        onSelect: this.choice((value: string) => { this.changeMapping(mapping.id, item => { if (value === 'drive' || value === 'offset') { item.kind = value; } }); }) })
      SettingsChoiceField({ label: '转换模式', selected: mapping.kind === 'drive' ? mapping.driveMode : mapping.offsetMode,
        options: this.modes(mapping), compact: this.compact, editable: !this.readOnly, onSelect: this.choice((value: string) => this.changeMode(mapping.id, value)) })
      SettingsSwitchField({ label: 'Invert · 反向', value: mapping.invert, compact: this.compact, editable: !this.readOnly,
        onChange: this.flag((value: boolean) => { this.changeMapping(mapping.id, item => { item.invert = value; }); }) })
      if (mapping.kind === 'offset') {
        SettingsNumberField({ label: 'Offset Speed', unit: '0–1', value: mapping.speed, minimum: 0, maximum: 1, compact: this.compact, editable: !this.readOnly,
          draftOwner: this.draftOwner, draftScope: this.draftScope, draftKey: 'continuous:' + mapping.id + ':speed',
          draftSource: this.mappingSource(mapping), draftEpoch: this.draftEpoch, draftGuard: this.editGuard(), onEdit: this.cancelHandler('text-edit'),
          onCommit: this.number((value: number): boolean => this.changeMapping(mapping.id, item => { item.speed = value; })) })
      }
      if (mapping.source === 'wheel') {
        SettingsNumberField({ label: '本地滚动校准跨度', unit: '原生轴值 · 1–4096', value: mapping.wheelSpan, minimum: 1, maximum: 4096, compact: this.compact, editable: !this.readOnly,
          draftOwner: this.draftOwner, draftScope: this.draftScope, draftKey: 'continuous:' + mapping.id + ':wheelSpan',
          draftSource: this.mappingSource(mapping), draftEpoch: this.draftEpoch, draftGuard: this.editGuard(), onEdit: this.cancelHandler('text-edit'),
          onCommit: this.number((value: number): boolean => this.changeMapping(mapping.id, item => { item.wheelSpan = value; })) })
        Text('滚轮只即时 Drive；虚拟位置从 0.5 开始。公开 API 标为 vp，实际滚轮刻度需设备校准，不使用 Windows 120 计数换算。')
          .fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%')
      }
      ForEach(mapping.actions, (action: ContinuousInputAction, index: number) => { this.actionEditor(mapping, action, index) },
        (_action: ContinuousInputAction, index: number) => mapping.id + ':' + index + ':' + this.renderRevision)
      Flex({ wrap: FlexWrap.Wrap }) {
        Button('添加动作').type(ButtonType.Normal).buttonStyle(ButtonStyleMode.NORMAL).controlSize(ControlSize.NORMAL).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip })
          .constraintSize({ minHeight: UiStyle.controlFor(this.compact), maxWidth: '100%', minWidth: UiStyle.controlFor(this.compact) }).responseRegion({ y: -4, width: '100%', height: UiStyle.control }).fontSize(UiStyle.textFor(this.compact)).borderRadius(UiStyle.radius)
          .fontColor(UiStyle.ink).backgroundColor(UiStyle.field).border({ width: 1, color: UiStyle.edge }).margin({ right: 8, bottom: 8 })
          .enabled(!this.readOnly && mapping.actions.length < ContinuousInputConfiguration.MAX_ACTIONS).onClick(this.command(() => this.addAction(mapping.id)))
        Button('移除此映射').type(ButtonType.Normal).buttonStyle(ButtonStyleMode.NORMAL).controlSize(ControlSize.NORMAL).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip })
          .constraintSize({ minHeight: UiStyle.controlFor(this.compact), maxWidth: '100%', minWidth: UiStyle.controlFor(this.compact) }).responseRegion({ y: -4, width: '100%', height: UiStyle.control }).fontSize(UiStyle.textFor(this.compact)).borderRadius(UiStyle.radius)
          .fontColor(UiStyle.danger).backgroundColor(UiStyle.field).border({ width: 1, color: UiStyle.edge }).enabled(!this.readOnly)
          .onClick(this.command(() => { this.emit(ContinuousInputEdits.remove(this.configuration, mapping.id)); }))
      }.width('100%')
    }.width('100%').onTouch(this.editorTouchHandler()).onMouse(this.editorMouseHandler())
  }
  build() {
    Column({ space: UiStyle.gap(this.compact) }) {
      SettingsSectionTitle({ label: '本地连续输入' })
      Text('配置、接收输入和物理输出 Arm 分别控制；编辑不会启动播放、预览、连接或输出。')
        .fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%')
      SettingsSwitchField({ label: '启用连续输入配置', value: this.configuration.enabled, compact: this.compact, editable: !this.readOnly,
        onChange: this.flag((value: boolean) => { const next = ContinuousInputConfiguration.clone(this.configuration); next.enabled = value; this.emit(next); }) })
      SettingsChoiceField({ label: '当前映射', selected: this.selectedMappingId, options: this.mappings(), compact: this.compact, editable: !this.readOnly,
        onSelect: this.selectHandler() }).onTouch(this.editorTouchHandler()).onMouse(this.editorMouseHandler())
      Button('添加本地映射').type(ButtonType.Normal).buttonStyle(ButtonStyleMode.NORMAL).controlSize(ControlSize.NORMAL).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip })
        .constraintSize({ minHeight: UiStyle.controlFor(this.compact), maxWidth: '100%', minWidth: UiStyle.controlFor(this.compact) }).responseRegion({ y: -4, width: '100%', height: UiStyle.control }).fontSize(UiStyle.textFor(this.compact)).borderRadius(UiStyle.radius).width('100%')
        .fontColor(UiStyle.ink).backgroundColor(UiStyle.field).border({ width: 1, color: UiStyle.edge })
        .enabled(!this.readOnly && this.configuration.mappings.length < ContinuousInputConfiguration.MAX_MAPPINGS).onClick(this.command(() => this.addMapping()))
      ForEach(this.selectedMappings(), (mapping: ContinuousInputMapping) => { this.mappingEditor(mapping) },
        (mapping: ContinuousInputMapping) => mapping.id + ':' + this.renderRevision)
      Text(this.receiving ? (this.contactActive ? '接收输入 · 接触中' : '接收输入 · 等待新接触') : '输入接收已停止')
        .fontSize(UiStyle.textFor(this.compact)).fontColor(this.receiving ? UiStyle.accent : UiStyle.muted).width('100%')
      if (this.status.length > 0) { Text(this.status).fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%') }
      if (this.error.length > 0) { Text(this.error).fontSize(UiStyle.helper).fontColor(UiStyle.danger).width('100%') }
      Text(t('Value ' + this.latestValue.toFixed(3) + ' · Delta ' + this.latestDelta.toFixed(3)) + (this.lastAction.length > 0 ? ' · 最近动作：' + this.lastAction : ''))
        .fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
      Flex({ wrap: FlexWrap.Wrap }) {
        Button('明确启用本地接收').type(ButtonType.Normal).buttonStyle(ButtonStyleMode.NORMAL).controlSize(ControlSize.NORMAL).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip })
          .constraintSize({ minHeight: UiStyle.controlFor(this.compact), maxWidth: '100%', minWidth: UiStyle.controlFor(this.compact) }).responseRegion({ y: -4, width: '100%', height: UiStyle.control }).fontSize(UiStyle.textFor(this.compact)).borderRadius(UiStyle.radius)
          .fontColor(UiStyle.field).backgroundColor(UiStyle.accent).margin({ right: 8, bottom: 8 }).enabled(this.available() && !this.receiving)
          .onClick(this.enableHandler())
        Button('取消本地接收').type(ButtonType.Normal).buttonStyle(ButtonStyleMode.NORMAL).controlSize(ControlSize.NORMAL).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip })
          .constraintSize({ minHeight: UiStyle.controlFor(this.compact), maxWidth: '100%', minWidth: UiStyle.controlFor(this.compact) }).responseRegion({ y: -4, width: '100%', height: UiStyle.control }).fontSize(UiStyle.textFor(this.compact)).borderRadius(UiStyle.radius)
          .fontColor(UiStyle.danger).backgroundColor(UiStyle.field).border({ width: 1, color: UiStyle.edge }).enabled(this.receiving)
          .onClick(this.cancelHandler('user-cancel'))
      }.width('100%')
      Column() {
        Text(this.receiving ? '在此区域触摸、按住左键移动，或使用所选滚动轴' : '先选择映射并明确启用接收')
          .fontSize(UiStyle.textFor(this.compact)).fontColor(UiStyle.muted).textAlign(TextAlign.Center).padding(16)
      }.width('100%').height(180).justifyContent(FlexAlign.Center).borderRadius(UiStyle.radius)
        .backgroundColor(this.receiving ? UiStyle.accentSoft : UiStyle.field).border({ width: 1, color: UiStyle.edge })
        .focusable(true).focusOnTouch(true).accessibilityText('本地连续输入接收区域')
        .onTouch(this.touchHandler()).onMouse(this.mouseHandler()).onAxisEvent(this.wheelHandler())
        .onHover(this.hoverHandler()).onBlur(this.cancelHandler('surface-blur')).onAreaChange(this.areaHandler())
      Text('触屏 / 鼠标使用区域 vp 位置与相邻位移归一化，动作时长为 0；离开、失焦或尺寸变化后需重新启用。输出仍受独立 Arm 与预览许可约束。')
        .fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%')
    }.width('100%').padding(UiStyle.cardPadding).backgroundColor(UiStyle.card).borderRadius(UiStyle.radiusCard)
  }
}
