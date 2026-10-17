import { UiStyle } from '../presentation/UiStyle';
import { KeyboardShortcutConfiguration, KeyboardShortcutMapping, ShortcutAction, ShortcutActionSpec, ShortcutPoint, ShortcutKeySpec, EMERGENCY_STOP_KEY, cloneShortcutConfiguration, cloneShortcutAction, defaultShortcutAction, validateShortcutConfiguration, validateShortcutAction, shortcutActionCatalog, keyCatalog, chordLabel, keyLabel } from '../input/ShortcutConfiguration';
import { MotionCurvePoint } from '../core/MotionConfiguration';
import type { InterpolationMode } from '../core/Interpolation';
import { CurvePointEditor, SettingsNumberField, SettingsTextField, SettingsSwitchField, SettingsChoiceField, SettingsOption, SettingsSectionTitle } from './CurvePointEditor';

/** Detached, validated snapshots only. The page owns dispatch, persistence and capture. */
export class InputSettingsEdits {
  static checked(next: KeyboardShortcutConfiguration): KeyboardShortcutConfiguration | null {
    const result = validateShortcutConfiguration(next);
    return result.valid ? result.configuration : null;
  }
  static enabled(configuration: KeyboardShortcutConfiguration, value: boolean): KeyboardShortcutConfiguration | null {
    const next = cloneShortcutConfiguration(configuration); next.enabled = value;
    return InputSettingsEdits.checked(next);
  }
  static addMapping(configuration: KeyboardShortcutConfiguration): KeyboardShortcutConfiguration | null {
    if (configuration.mappings.length >= KeyboardShortcutConfiguration.MAX_MAPPINGS) { return null; }
    const next = cloneShortcutConfiguration(configuration);
    let sequence: number = 1;
    while (next.mappings.some(mapping => mapping.id === 'shortcut-' + sequence)) { sequence++; }
    next.mappings.push(new KeyboardShortcutMapping('shortcut-' + sequence, '快捷键 ' + sequence));
    return InputSettingsEdits.checked(next);
  }
  static removeMapping(configuration: KeyboardShortcutConfiguration, id: string): KeyboardShortcutConfiguration | null {
    const next = cloneShortcutConfiguration(configuration);
    const index: number = next.mappings.findIndex(mapping => mapping.id === id);
    if (index < 0) { return null; }
    next.mappings.splice(index, 1); return InputSettingsEdits.checked(next);
  }
  static moveMapping(configuration: KeyboardShortcutConfiguration, id: string, direction: number): KeyboardShortcutConfiguration | null {
    const next = cloneShortcutConfiguration(configuration);
    const index: number = next.mappings.findIndex(mapping => mapping.id === id);
    const target: number = index + direction;
    if ((direction !== -1 && direction !== 1) || index < 0 || target < 0 || target >= next.mappings.length) { return null; }
    const mapping: KeyboardShortcutMapping = next.mappings[index];
    next.mappings.splice(index, 1); next.mappings.splice(target, 0, mapping);
    return InputSettingsEdits.checked(next);
  }
  static mappingName(configuration: KeyboardShortcutConfiguration, id: string, value: string): KeyboardShortcutConfiguration | null {
    const next = cloneShortcutConfiguration(configuration);
    const mapping: KeyboardShortcutMapping | undefined = next.mappings.find(candidate => candidate.id === id);
    if (mapping === undefined) { return null; }
    mapping.name = value.trim(); return InputSettingsEdits.checked(next);
  }
  static flag(configuration: KeyboardShortcutConfiguration, id: string, field: string, value: boolean): KeyboardShortcutConfiguration | null {
    const next = cloneShortcutConfiguration(configuration);
    const mapping: KeyboardShortcutMapping | undefined = next.mappings.find(candidate => candidate.id === id);
    if (mapping === undefined) { return null; }
    if (field === 'enabled') { mapping.enabled = value; }
    else if (field === 'handleRepeating') { mapping.handleRepeating = value; }
    else { return null; }
    return InputSettingsEdits.checked(next);
  }
  static choice(configuration: KeyboardShortcutConfiguration, id: string, field: string, value: string): KeyboardShortcutConfiguration | null {
    const next = cloneShortcutConfiguration(configuration);
    const mapping: KeyboardShortcutMapping | undefined = next.mappings.find(candidate => candidate.id === id);
    if (mapping === undefined) { return null; }
    if (field === 'trigger' && (value === 'press' || value === 'release' || value === 'click' || value === 'hold')) {
      mapping.trigger = value;
    } else if (field === 'holdInvoke' && (value === 'release' || value === 'holding')) { mapping.holdInvoke = value; }
    else { return null; }
    return InputSettingsEdits.checked(next);
  }
  static number(configuration: KeyboardShortcutConfiguration, id: string, field: string, value: number): KeyboardShortcutConfiguration | null {
    const next = cloneShortcutConfiguration(configuration);
    const mapping: KeyboardShortcutMapping | undefined = next.mappings.find(candidate => candidate.id === id);
    if (mapping === undefined) { return null; }
    switch (field) {
      case 'clickCount': mapping.clickCount = value; break;
      case 'maximumClickIntervalMs': mapping.maximumClickIntervalMs = value; break;
      case 'minimumHoldDurationMs': mapping.minimumHoldDurationMs = value; break;
      case 'maximumHoldDurationMs': mapping.maximumHoldDurationMs = value; break;
      default: return null;
    }
    return InputSettingsEdits.checked(next);
  }
  static keys(configuration: KeyboardShortcutConfiguration, id: string, value: number[]): KeyboardShortcutConfiguration | null {
    const next = cloneShortcutConfiguration(configuration);
    const mapping: KeyboardShortcutMapping | undefined = next.mappings.find(candidate => candidate.id === id);
    if (mapping === undefined) { return null; }
    mapping.keys = value.slice(); return InputSettingsEdits.checked(next);
  }
  static addKey(configuration: KeyboardShortcutConfiguration, id: string, keyCode: number): KeyboardShortcutConfiguration | null {
    const mapping: KeyboardShortcutMapping | undefined = configuration.mappings.find(candidate => candidate.id === id);
    if (mapping === undefined || mapping.keys.indexOf(keyCode) >= 0) { return null; }
    return InputSettingsEdits.keys(configuration, id, mapping.keys.concat([keyCode]));
  }
  static removeKey(configuration: KeyboardShortcutConfiguration, id: string, keyCode: number): KeyboardShortcutConfiguration | null {
    const mapping: KeyboardShortcutMapping | undefined = configuration.mappings.find(candidate => candidate.id === id);
    if (mapping === undefined || mapping.keys.indexOf(keyCode) < 0) { return null; }
    return InputSettingsEdits.keys(configuration, id, mapping.keys.filter(code => code !== keyCode));
  }
  static spec(id: string): ShortcutActionSpec | null {
    const spec: ShortcutActionSpec | undefined = shortcutActionCatalog().find(candidate => candidate.id === id);
    return spec === undefined ? null : spec;
  }
  static action(configuration: KeyboardShortcutConfiguration, id: string, index: number,
    actionId: string, value: number): KeyboardShortcutConfiguration | null {
    const next = cloneShortcutConfiguration(configuration);
    const mapping: KeyboardShortcutMapping | undefined = next.mappings.find(candidate => candidate.id === id);
    if (mapping === undefined || !Number.isInteger(index) || index < 0 || index >= mapping.actions.length) { return null; }
    const spec: ShortcutActionSpec | null = InputSettingsEdits.spec(actionId);
    if (spec === null) { return null; }
    // Numeric edits retain the complete output/axis/text/limit payload. A new
    // action type starts from its own validated defaults instead of stale fields.
    const action: ShortcutAction = mapping.actions[index].id === actionId ?
      cloneShortcutAction(mapping.actions[index]) : defaultShortcutAction(actionId);
    action.value = value; mapping.actions[index] = action; return InputSettingsEdits.checked(next);
  }
  static actionNumber(configuration: KeyboardShortcutConfiguration, id: string, index: number,
    field: string, value: number): KeyboardShortcutConfiguration | null {
    const next = cloneShortcutConfiguration(configuration);
    const mapping: KeyboardShortcutMapping | undefined = next.mappings.find(candidate => candidate.id === id);
    if (mapping === undefined || !Number.isInteger(index) || index < 0 || index >= mapping.actions.length) { return null; }
    if (field === 'value') { mapping.actions[index].value = value; }
    else if (field === 'secondaryValue') { mapping.actions[index].secondaryValue = value; }
    else if (field === 'tertiaryValue') { mapping.actions[index].tertiaryValue = value; }
    else { return null; }
    return InputSettingsEdits.checked(next);
  }
  static actionText(configuration: KeyboardShortcutConfiguration, id: string, index: number,
    field: string, value: string): KeyboardShortcutConfiguration | null {
    const next = cloneShortcutConfiguration(configuration);
    const mapping: KeyboardShortcutMapping | undefined = next.mappings.find(candidate => candidate.id === id);
    if (mapping === undefined || !Number.isInteger(index) || index < 0 || index >= mapping.actions.length) { return null; }
    if (field === 'text') { mapping.actions[index].text = value; }
    else if (field === 'targetAxis') { mapping.actions[index].targetAxis = value; }
    else if (field === 'outputTargetId') { mapping.actions[index].outputTargetId = value; }
    else { return null; }
    return InputSettingsEdits.checked(next);
  }
  static pointAction(action: ShortcutAction, points: MotionCurvePoint[]): ShortcutAction | null {
    const spec: ShortcutActionSpec | null = InputSettingsEdits.spec(action.id);
    if (spec === null || spec.pointsKind === 'none' || !Array.isArray(points) ||
      points.length > KeyboardShortcutConfiguration.MAX_POINTS_PER_ACTION ||
      Object.keys(points).length !== points.length || points.some(point => point === null || point === undefined ||
        typeof point.x !== 'number' || typeof point.y !== 'number' || Object.keys(point).length !== 2)) { return null; }
    const next: ShortcutAction = cloneShortcutAction(action);
    next.points = points.map(point => new ShortcutPoint(point.x, point.y));
    return validateShortcutAction(next) ? next : null;
  }
  static actionPoints(configuration: KeyboardShortcutConfiguration, id: string, index: number,
    points: MotionCurvePoint[]): KeyboardShortcutConfiguration | null {
    const next = cloneShortcutConfiguration(configuration);
    const mapping: KeyboardShortcutMapping | undefined = next.mappings.find(candidate => candidate.id === id);
    if (mapping === undefined || !Number.isInteger(index) || index < 0 || index >= mapping.actions.length) { return null; }
    const action: ShortcutAction | null = InputSettingsEdits.pointAction(mapping.actions[index], points);
    if (action === null) { return null; }
    mapping.actions[index] = action; return InputSettingsEdits.checked(next);
  }
  static addAction(configuration: KeyboardShortcutConfiguration, id: string, actionId: string): KeyboardShortcutConfiguration | null {
    const next = cloneShortcutConfiguration(configuration);
    const mapping: KeyboardShortcutMapping | undefined = next.mappings.find(candidate => candidate.id === id);
    const spec: ShortcutActionSpec | null = InputSettingsEdits.spec(actionId);
    if (mapping === undefined || mapping.actions.length >= KeyboardShortcutConfiguration.MAX_ACTIONS || spec === null) { return null; }
    mapping.actions.push(defaultShortcutAction(spec.id)); return InputSettingsEdits.checked(next);
  }
  static removeAction(configuration: KeyboardShortcutConfiguration, id: string, index: number): KeyboardShortcutConfiguration | null {
    const next = cloneShortcutConfiguration(configuration);
    const mapping: KeyboardShortcutMapping | undefined = next.mappings.find(candidate => candidate.id === id);
    if (mapping === undefined || !Number.isInteger(index) || index < 0 || index >= mapping.actions.length) { return null; }
    mapping.actions.splice(index, 1); return InputSettingsEdits.checked(next);
  }
  static moveAction(configuration: KeyboardShortcutConfiguration, id: string, index: number, direction: number): KeyboardShortcutConfiguration | null {
    const next = cloneShortcutConfiguration(configuration);
    const mapping: KeyboardShortcutMapping | undefined = next.mappings.find(candidate => candidate.id === id);
    const target: number = index + direction;
    if (mapping === undefined || !Number.isInteger(index) || (direction !== -1 && direction !== 1) ||
      index < 0 || target < 0 || index >= mapping.actions.length || target >= mapping.actions.length) { return null; }
    const action: ShortcutAction = mapping.actions[index];
    mapping.actions.splice(index, 1); mapping.actions.splice(target, 0, action);
    return InputSettingsEdits.checked(next);
  }
  static validAction(action: ShortcutAction): boolean {
    return validateShortcutAction(action);
  }
}

@Component
export struct InputSettingsPanel {
  @Prop compact: boolean = false;
  @Prop @Watch('configurationChanged') configuration: KeyboardShortcutConfiguration = new KeyboardShortcutConfiguration();
  @Prop @Watch('availabilityChanged') readOnly: boolean = false;
  @Prop captureId: string = '';
  @Prop @Watch('captureChanged') captureRevision: number = 0;
  @Prop captureKeys: number[] = [];
  @Prop @Watch('axisContextChanged') axisNames: string[] = [];
  @Prop @Watch('axisContextChanged') enabledAxisNames: string[] = [];
  @Prop selectedAxisName: string = '';
  @Prop @Watch('actionContextChanged') outputOptions: SettingsOption[] = [];
  @Prop @Watch('actionContextChanged') managedScriptOptions: SettingsOption[] = [];
  @Prop @Watch('actionContextChanged') actionContextKey: string = '';
  @Prop actionStatus: string = '';
  onChange: (snapshot: KeyboardShortcutConfiguration, captureRevision?: number) => void = (_snapshot: KeyboardShortcutConfiguration, _captureRevision?: number): void => {};
  onCapture: (mappingId: string) => void = (_mappingId: string): void => {};
  onCancelCapture: (captureRevision: number) => void = (_captureRevision: number): void => {};
  onAction: (action: ShortcutAction) => void = (_action: ShortcutAction): void => {};
  onStop: () => void = (): void => {};
  @State error: string = '';
  @State renderRevision: number = 0;
  private readonly actionCatalog: ShortcutActionSpec[] = shortcutActionCatalog();
  private editEpoch: number = 0;
  private active: boolean = true;
  private touchEpoch: number = 0;
  private axisContextKey: string = '';
  private actionOptionsKey: string = '""|[]|[]';
  @State touchAction: ShortcutAction = new ShortcutAction('Media::PlayPause::Toggle');
  @State appendCategoryIds: string[] = [];
  @State appendCategoryValues: string[] = [];
  private get touchActionId(): string { return this.touchAction.id; }
  private get touchActionValue(): number { return this.touchAction.value; }
  aboutToAppear(): void {
    this.active = true; this.editEpoch++; this.axisContextKey = this.currentAxisContextKey();
    this.actionOptionsKey = this.currentActionOptionsKey();
  }
  aboutToDisappear(): void { this.active = false; this.editEpoch++; }
  private configurationChanged(): void { this.editEpoch++; this.renderRevision++; }
  private availabilityChanged(): void { this.editEpoch++; this.renderRevision++; }
  private captureChanged(): void { this.renderRevision++; }
  private currentAxisContextKey(): string { return this.axisNames.join(',') + '|' + this.enabledAxisNames.join(','); }
  private axisContextChanged(): void {
    const key: string = this.currentAxisContextKey();
    // A host render can create a fresh array with the same axis names. Avoid
    // repeatedly remounting an in-progress editor on unchanged playback frames.
    if (key === this.axisContextKey) { return; }
    this.axisContextKey = key; this.editEpoch++; this.touchEpoch++; this.renderRevision++;
  }
  private currentActionOptionsKey(): string {
    // Include labels as well as values: target enablement can change without
    // changing its ID. Equal host arrays do not retire an in-progress draft.
    return JSON.stringify(this.actionContextKey) + '|' +
      JSON.stringify(this.outputOptions.map(option => [option.value, option.label])) + '|' +
      JSON.stringify(this.managedScriptOptions.map(option => [option.value, option.label]));
  }
  private actionContextChanged(): void {
    const key: string = this.currentActionOptionsKey();
    if (key === this.actionOptionsKey) { return; }
    this.actionOptionsKey = key; this.editEpoch++; this.touchEpoch++; this.renderRevision++;
  }
  private ownsEdit(owner: KeyboardShortcutConfiguration, epoch: number): boolean {
    return this.active && !this.readOnly && this.configuration === owner && this.editEpoch === epoch &&
      this.currentActionOptionsKey() === this.actionOptionsKey;
  }
  // Capture ownership when rendering, not when an old callback eventually runs.
  // Index-based action rows must never retarget a replacement/reordered snapshot.
  private bindEditCommand(handler: () => void): () => void {
    const owner: KeyboardShortcutConfiguration = this.configuration; const epoch: number = this.editEpoch;
    return (): void => { if (this.ownsEdit(owner, epoch)) { handler(); } };
  }
  private bindEditFlag(handler: (value: boolean) => void): (value: boolean) => void {
    const owner: KeyboardShortcutConfiguration = this.configuration; const epoch: number = this.editEpoch;
    return (value: boolean): void => { if (this.ownsEdit(owner, epoch)) { handler(value); } };
  }
  private bindEditChoice(handler: (value: string) => void): (value: string) => void {
    const owner: KeyboardShortcutConfiguration = this.configuration; const epoch: number = this.editEpoch;
    return (value: string): void => { if (this.ownsEdit(owner, epoch)) { handler(value); } };
  }
  private bindEditNumber(handler: (value: number) => boolean): (value: number) => boolean {
    const owner: KeyboardShortcutConfiguration = this.configuration; const epoch: number = this.editEpoch;
    return (value: number): boolean => this.ownsEdit(owner, epoch) && handler(value);
  }
  private bindEditText(handler: (value: string) => boolean): (value: string) => boolean {
    const owner: KeyboardShortcutConfiguration = this.configuration; const epoch: number = this.editEpoch;
    return (value: string): boolean => this.ownsEdit(owner, epoch) && handler(value);
  }
  private mappingPointsHandler(id: string, index: number): (points: MotionCurvePoint[]) => void {
    const owner: KeyboardShortcutConfiguration = this.configuration; const epoch: number = this.editEpoch;
    return (points: MotionCurvePoint[]): void => {
      if (this.ownsEdit(owner, epoch)) { this.actionPoints(id, index, points); }
    };
  }
  private emit(next: KeyboardShortcutConfiguration | null, captureRevision?: number): boolean {
    if (this.readOnly || (captureRevision !== undefined && captureRevision !== this.captureRevision)) { return false; }
    if (next === null) { this.error = '设置无效：请检查按键、动作参数及数量上限。F12 保留给全局停止。'; return false; }
    this.error = ''; this.editEpoch++; this.onChange(next, captureRevision); return true;
  }
  private changeEnabled(value: boolean): void {
    if (!this.readOnly) { this.emit(InputSettingsEdits.enabled(this.configuration, value)); }
  }
  private addMapping(): void {
    if (!this.readOnly) { this.emit(InputSettingsEdits.addMapping(this.configuration)); }
  }
  private removeMapping(id: string): void {
    if (this.readOnly) { return; }
    const revision: number = this.captureRevision;
    if (this.emit(InputSettingsEdits.removeMapping(this.configuration, id)) && this.captureId === id) { this.onCancelCapture(revision); }
  }
  private moveMapping(id: string, direction: number): void {
    if (!this.readOnly) { this.emit(InputSettingsEdits.moveMapping(this.configuration, id, direction)); }
  }
  private changeName(id: string, value: string): boolean {
    return !this.readOnly && this.emit(InputSettingsEdits.mappingName(this.configuration, id, value));
  }
  private changeFlag(id: string, field: string, value: boolean): void {
    if (!this.readOnly) { this.emit(InputSettingsEdits.flag(this.configuration, id, field, value)); }
  }
  private changeChoice(id: string, field: string, value: string): void {
    if (!this.readOnly) { this.emit(InputSettingsEdits.choice(this.configuration, id, field, value)); }
  }
  private changeNumber(id: string, field: string, value: number): boolean {
    return !this.readOnly && this.emit(InputSettingsEdits.number(this.configuration, id, field, value));
  }
  private addKey(id: string, value: string): void {
    if (!this.readOnly && value.length > 0) { this.emit(InputSettingsEdits.addKey(this.configuration, id, Number(value))); }
  }
  private removeKey(id: string, keyCode: number): void {
    if (!this.readOnly) { this.emit(InputSettingsEdits.removeKey(this.configuration, id, keyCode)); }
  }
  private startCapture(id: string): void {
    if (this.readOnly || !this.configuration.mappings.some(mapping => mapping.id === id)) { return; }
    this.error = ''; this.onCapture(id);
  }
  private captureCancelHandler(): () => void {
    const owner: KeyboardShortcutConfiguration = this.configuration; const epoch: number = this.editEpoch;
    const revision: number = this.captureRevision;
    return (): void => { if (this.ownsEdit(owner, epoch)) { this.cancelCapture(revision); } };
  }
  private captureApplyHandler(id: string): () => void {
    const owner: KeyboardShortcutConfiguration = this.configuration; const epoch: number = this.editEpoch;
    const revision: number = this.captureRevision; const keys: number[] = this.captureKeys.slice();
    return (): void => { if (this.ownsEdit(owner, epoch)) { this.applyCapture(id, revision, keys); } };
  }
  private cancelCapture(revision: number = this.captureRevision): void {
    if (!this.readOnly && revision === this.captureRevision) { this.onCancelCapture(revision); }
  }
  private applyCapture(id: string, revision: number = this.captureRevision, keys: number[] = this.captureKeys): void {
    if (this.readOnly || revision !== this.captureRevision || this.captureId !== id || keys.length === 0) { return; }
    // The host must recheck this revision against its current capture session,
    // even when its newer @Prop value has not reached this panel yet.
    if (this.emit(InputSettingsEdits.keys(this.configuration, id, keys), revision)) { this.onCancelCapture(revision); }
  }
  private addAction(id: string, actionId: string): void {
    if (!this.readOnly && actionId.length > 0) { this.emit(InputSettingsEdits.addAction(this.configuration, id, actionId)); }
  }
  private selectAction(id: string, index: number, actionId: string): void {
    if (this.readOnly) { return; }
    const spec: ShortcutActionSpec | null = InputSettingsEdits.spec(actionId);
    if (spec !== null) { this.emit(InputSettingsEdits.action(this.configuration, id, index, actionId, spec.defaultValue)); }
  }
  private actionValue(id: string, index: number, value: number): boolean {
    return this.actionNumber(id, index, 'value', value);
  }
  private actionNumber(id: string, index: number, field: string, value: number): boolean {
    return !this.readOnly && this.emit(InputSettingsEdits.actionNumber(this.configuration, id, index, field, value));
  }
  private actionText(id: string, index: number, field: string, value: string): boolean {
    const mapping: KeyboardShortcutMapping | undefined = this.configuration.mappings.find(candidate => candidate.id === id);
    if (this.readOnly || mapping === undefined || !Number.isInteger(index) || index < 0 || index >= mapping.actions.length ||
      !this.actionChoiceAllowed(mapping.actions[index], field, value)) { return false; }
    return this.emit(InputSettingsEdits.actionText(this.configuration, id, index, field, value));
  }
  private actionChoiceAllowed(action: ShortcutAction, field: string, value: string): boolean {
    if (field === 'outputTargetId') {
      return value.length === 0 || value === action.outputTargetId || this.outputOptions.some(option => option.value === value);
    }
    if (field === 'text' && this.spec(action.id).managedScript) {
      return value.length === 0 || value === action.text || this.managedScriptOptions.some(option => option.value === value);
    }
    return true;
  }
  private actionPoints(id: string, index: number, points: MotionCurvePoint[]): boolean {
    return !this.readOnly && this.emit(InputSettingsEdits.actionPoints(this.configuration, id, index, points));
  }
  private selectActionCategory(id: string, index: number, category: string): void {
    const spec: ShortcutActionSpec | undefined = this.actionCatalog.find(candidate => this.categoryOf(candidate) === category);
    if (spec !== undefined) { this.selectAction(id, index, spec.id); }
  }
  private appendCategory(id: string): string {
    const index: number = this.appendCategoryIds.indexOf(id);
    return index < 0 ? 'media-playback' : this.appendCategoryValues[index];
  }
  private selectAppendCategory(id: string, category: string): void {
    if (this.readOnly || !this.configuration.mappings.some(mapping => mapping.id === id) ||
      !this.actionCatalog.some(spec => this.categoryOf(spec) === category)) { return; }
    const ids: string[] = this.appendCategoryIds.slice(); const values: string[] = this.appendCategoryValues.slice();
    const index: number = ids.indexOf(id);
    if (index < 0) { ids.push(id); values.push(category); } else { values[index] = category; }
    this.appendCategoryIds = ids; this.appendCategoryValues = values;
    this.editEpoch++; this.renderRevision++;
  }
  private removeAction(id: string, index: number): void {
    if (!this.readOnly) { this.emit(InputSettingsEdits.removeAction(this.configuration, id, index)); }
  }
  private moveAction(id: string, index: number, direction: number): void {
    if (!this.readOnly) { this.emit(InputSettingsEdits.moveAction(this.configuration, id, index, direction)); }
  }
  private selectTouchAction(id: string): void {
    if (this.readOnly || InputSettingsEdits.spec(id) === null) { return; }
    this.touchEpoch++; this.touchAction = defaultShortcutAction(id);
  }
  private touchValue(value: number): boolean { return this.touchNumber('value', value); }
  private touchNumber(field: string, value: number): boolean {
    if (this.readOnly) { return false; }
    const action: ShortcutAction = cloneShortcutAction(this.touchAction);
    if (field === 'value') { action.value = value; }
    else if (field === 'secondaryValue') { action.secondaryValue = value; }
    else if (field === 'tertiaryValue') { action.tertiaryValue = value; }
    else { return false; }
    if (!InputSettingsEdits.validAction(action)) { return false; }
    this.touchEpoch++; this.touchAction = action; return true;
  }
  private touchText(field: string, value: string): boolean {
    if (this.readOnly || !this.actionChoiceAllowed(this.touchAction, field, value)) { return false; }
    const action: ShortcutAction = cloneShortcutAction(this.touchAction);
    if (field === 'targetAxis') { action.targetAxis = value; }
    else if (field === 'outputTargetId') { action.outputTargetId = value; }
    else if (field === 'text') { action.text = value; }
    else { return false; }
    if (!InputSettingsEdits.validAction(action)) { return false; }
    this.touchEpoch++; this.touchAction = action; return true;
  }
  private touchPoints(points: MotionCurvePoint[]): boolean {
    if (this.readOnly) { return false; }
    const action: ShortcutAction | null = InputSettingsEdits.pointAction(this.touchAction, points);
    if (action === null) { this.error = '曲线点无效：请检查坐标范围、顺序及点数上限。'; return false; }
    this.error = ''; this.touchEpoch++; this.touchAction = action; return true;
  }
  private touchPointsHandler(): (points: MotionCurvePoint[]) => void {
    const owner: KeyboardShortcutConfiguration = this.configuration; const epoch: number = this.editEpoch;
    const touchEpoch: number = this.touchEpoch;
    return (points: MotionCurvePoint[]): void => {
      if (this.ownsEdit(owner, epoch) && this.touchEpoch === touchEpoch) { this.touchPoints(points); }
    };
  }
  private touchNumberHandler(field: string = 'value'): (value: number) => boolean {
    const owner: KeyboardShortcutConfiguration = this.configuration; const epoch: number = this.editEpoch;
    const touchEpoch: number = this.touchEpoch;
    return (value: number): boolean => this.ownsEdit(owner, epoch) && this.touchEpoch === touchEpoch && this.touchNumber(field, value);
  }
  private touchTextHandler(field: string = 'text'): (value: string) => boolean {
    const owner: KeyboardShortcutConfiguration = this.configuration; const epoch: number = this.editEpoch;
    const touchEpoch: number = this.touchEpoch;
    return (value: string): boolean => this.ownsEdit(owner, epoch) && this.touchEpoch === touchEpoch && this.touchText(field, value);
  }
  private touchChoiceHandler(field: string): (value: string) => void {
    const owner: KeyboardShortcutConfiguration = this.configuration; const epoch: number = this.editEpoch;
    const touchEpoch: number = this.touchEpoch;
    return (value: string): void => {
      if (!this.ownsEdit(owner, epoch) || this.touchEpoch !== touchEpoch) { return; }
      if (field === 'action') { this.selectTouchAction(value); }
      else if (field === 'category') {
        const spec: ShortcutActionSpec | undefined = this.actionCatalog.find(candidate => this.categoryOf(candidate) === value);
        if (spec !== undefined) { this.selectTouchAction(spec.id); }
      } else { this.touchText(field, value); }
    };
  }
  private touchBooleanHandler(): (value: string) => void {
    const commit: (value: number) => boolean = this.touchNumberHandler();
    return (value: string): void => { commit(Number(value)); };
  }
  private touchActionHandler(): () => void {
    const owner: KeyboardShortcutConfiguration = this.configuration; const epoch: number = this.editEpoch;
    const touchEpoch: number = this.touchEpoch;
    const action: ShortcutAction = cloneShortcutAction(this.touchAction);
    return (): void => {
      if (action.id === 'App::Stop') { this.onStop(); return; }
      if (this.ownsEdit(owner, epoch) && this.touchEpoch === touchEpoch) { this.dispatch(action); }
    };
  }
  private dispatch(action: ShortcutAction): void {
    if (action.id === 'App::Stop') { this.onStop(); return; }
    if (!this.readOnly && InputSettingsEdits.validAction(action)) { this.onAction(cloneShortcutAction(action)); }
  }
  private stop(): void { this.onStop(); }
  private actionOptions(add: boolean = false, category: string = ''): SettingsOption[] {
    const options: SettingsOption[] = this.actionCatalog.filter(spec => category.length === 0 || this.categoryOf(spec) === category)
      .map(spec => new SettingsOption(spec.id, spec.label));
    return add ? [new SettingsOption('', '选择要追加的动作…')].concat(options) : options;
  }
  private category(id: string): string { return this.categoryOf(this.spec(id)); }
  private categoryOf(spec: ShortcutActionSpec): string {
    const id: string = spec.id;
    if (spec.category === 'media') {
      if (id.startsWith('Media::Chapter::') || id.startsWith('Media::Bookmark::')) { return 'media-markers'; }
      if (id.startsWith('Media::Loop::')) { return 'media-loop'; }
      if (id.startsWith('Media::ScriptOffset::') || id.startsWith('Media::AutoSkip')) { return 'media-script'; }
      return 'media-playback';
    }
    if (spec.category === 'axis') {
      if (id.startsWith('Axis::Sync') || id.startsWith('Axis::Lock')) { return 'axis-sync-lock'; }
      if (id.startsWith('Axis::SpeedLimit') || id.startsWith('Axis::SmartLimit')) { return 'axis-limit'; }
      if (id.startsWith('Axis::AutoHome')) { return 'axis-home'; }
      if (id.startsWith('Axis::MotionProvider') || id.startsWith('Axis::UpdateMotionProvider')) { return 'axis-motion'; }
      if (id.startsWith('Axis::Bypass') || id.startsWith('Axis::Link')) { return 'axis-link-bypass'; }
      return 'axis-script';
    }
    if (spec.category === 'motion') {
      if (id.startsWith('MotionProvider::Custom Curve::')) { return 'motion-custom'; }
      if (id.startsWith('MotionProvider::Looping Script::')) { return 'motion-looping'; }
      if (id.startsWith('MotionProvider::Pattern::')) { return 'motion-pattern'; }
      return 'motion-random';
    }
    return id === 'App::Internal::Random' ? 'internal' : spec.category;
  }
  private categories(): SettingsOption[] {
    return [new SettingsOption('media-playback', '媒体 · 播放、速度与跳转'), new SettingsOption('media-markers', '媒体 · 章节与书签'),
      new SettingsOption('media-loop', '媒体 · A/B 循环'), new SettingsOption('media-script', '媒体 · 脚本偏移与自动跳转'),
      new SettingsOption('axis-script', '轴 · 脚本与插值'), new SettingsOption('axis-sync-lock', '轴 · 同步与锁定'),
      new SettingsOption('axis-link-bypass', '轴 · 链接与旁路'), new SettingsOption('axis-limit', '轴 · 限速与智能限幅'),
      new SettingsOption('axis-home', '轴 · 自动归位'), new SettingsOption('axis-motion', '轴 · 运动提供器'),
      new SettingsOption('motion-custom', '运动参数 · Custom Curve'), new SettingsOption('motion-looping', '运动参数 · Looping Script'),
      new SettingsOption('motion-pattern', '运动参数 · Pattern'), new SettingsOption('motion-random', '运动参数 · Random'),
      new SettingsOption('sync', '全局同步设置'), new SettingsOption('internal', 'Internal 播放列表'),
      new SettingsOption('shortcut', '快捷键 · 启用状态'), new SettingsOption('output', '输出目标 · 轴范围'),
      new SettingsOption('source', '媒体源 · DeoVR / Internal'), new SettingsOption('app', '应用 · App')].filter(option => this.actionCatalog.some(spec => this.categoryOf(spec) === option.value));
  }
  private axisLabel(name: string): string {
    if (this.axisNames.indexOf(name) < 0) { return name + '（当前配置不存在，已保留）'; }
    return this.enabledAxisNames.indexOf(name) < 0 ? name + '（已禁用，已保留）' : name;
  }
  private targetOptions(selected: string): SettingsOption[] {
    const options: SettingsOption[] = [new SettingsOption('', '当前所选轴（执行时解析）' +
      (this.selectedAxisName.length === 0 ? '' : ' · ' + this.selectedAxisName))];
    for (const name of this.axisNames) { options.push(new SettingsOption(name, '固定轴 · ' + this.axisLabel(name))); }
    if (selected.length > 0 && this.axisNames.indexOf(selected) < 0) { options.push(new SettingsOption(selected, this.axisLabel(selected))); }
    return options;
  }
  private retainedOptions(options: SettingsOption[], selected: string, emptyLabel: string, missingLabel: string): SettingsOption[] {
    const result: SettingsOption[] = options.map(option => new SettingsOption(option.value, option.label));
    if (!result.some(option => option.value.length === 0)) { result.unshift(new SettingsOption('', emptyLabel)); }
    if (selected.length > 0 && !result.some(option => option.value === selected)) {
      result.push(new SettingsOption(selected, selected + '（' + missingLabel + '，已保留）'));
    }
    return result;
  }
  private outputTargetOptions(selected: string): SettingsOption[] {
    return this.retainedOptions(this.outputOptions, selected, '未选择输出目标（不会自动使用当前目标）', '当前目标不存在');
  }
  private managedOptions(selected: string): SettingsOption[] {
    return this.retainedOptions(this.managedScriptOptions, selected, '未选择受管脚本', '当前目录中不存在');
  }
  private outputTargetDescription(action: ShortcutAction): string {
    if (action.outputTargetId.length === 0) { return '输出目标：未选择；执行会拒绝，不会自动替换为当前输出目标。'; }
    const selected: SettingsOption | undefined = this.outputTargetOptions(action.outputTargetId)
      .find(option => option.value === action.outputTargetId);
    return '输出目标：' + (selected === undefined ? action.outputTargetId : selected.label) + ' · ID：' + action.outputTargetId;
  }
  private managedScriptDescription(action: ShortcutAction): string {
    if (action.text.length === 0) { return '受管脚本：未选择；执行会拒绝，不会清除已有脚本。'; }
    const selected: SettingsOption | undefined = this.managedOptions(action.text).find(option => option.value === action.text);
    return '受管脚本：' + (selected === undefined ? action.text : selected.label) + ' · 精确引用：' + action.text;
  }
  private textOptions(action: ShortcutAction): SettingsOption[] {
    const spec: ShortcutActionSpec = this.spec(action.id);
    if (spec.valueKind !== 'axis') { return spec.textOptions.map(option => new SettingsOption(option.value, option.label)); }
    const options: SettingsOption[] = [new SettingsOption('', 'None · 不引用其他轴')];
    const target: string = action.targetAxis.length === 0 ? this.selectedAxisName : action.targetAxis;
    for (const name of this.axisNames) {
      if (name !== target) { options.push(new SettingsOption(name, this.axisLabel(name))); }
      else if (action.text === name) { options.push(new SettingsOption(name, name + '（不可引用目标自身，已保留）')); }
    }
    if (action.text.length > 0 && this.axisNames.indexOf(action.text) < 0) { options.push(new SettingsOption(action.text, this.axisLabel(action.text))); }
    return options;
  }
  private targetDescription(action: ShortcutAction): string {
    if (!this.spec(action.id).targetAxis) { return '作用范围：' + this.spec(action.id).label; }
    const target: string = action.targetAxis.length === 0 ? '目标轴：执行时使用当前所选轴' +
      (this.selectedAxisName.length === 0 ? '（尚未选择）' : ' · ' + this.axisLabel(this.selectedAxisName)) :
      '目标轴：固定 ' + this.axisLabel(action.targetAxis);
    return this.spec(action.id).category === 'motion' ? target + ' · 固定提供器：' + action.id.split('::')[1] : target;
  }
  private executionNote(action: ShortcutAction): string {
    if (this.spec(action.id).targetOutput) {
      if (!this.spec(action.id).targetAxis) {
        if (action.id.indexOf('::Connection::') >= 0) {
          return '连接或断开指定输出目标，不会自动 Arm，也不改变媒体播放。目标缺失或忙碌时不会改用其他目标。';
        }
        return '只修改指定目标的端点草稿；变更会解除 Arm，现有连接仍使用原端点。需明确断开并重新连接以应用，不会自动连接。';
      }
      return '只修改固定输出目标的轴范围；不会连接输出或 Arm。目标及轴缺失、禁用时拒绝执行，不会自动改用其他目标。';
    }
    if (this.spec(action.id).managedScript) {
      return '只可选择当前受管目录中的脚本；按相对路径或 URI 精确匹配。编辑只修改动作参数，执行不会启动运行或 Arm。';
    }
    if (action.id === 'Script::SkipGap') {
      return 'OHOS 先验证所选轴可用；原算法随后忽略选择、扫描全部已绑定脚本轴，不会限定为所选轴。';
    }
    if (action.id === 'Axis::Value::Set' || action.id === 'Axis::Value::Offset') {
      return '执行不会启动运行或 Arm；实际轴值仍遵循原版优先级及旁路规则。需先在主界面手动启动运行。';
    }
    return '';
  }
  private curvePoints(action: ShortcutAction): MotionCurvePoint[] {
    return action.points.map(point => new MotionCurvePoint(point.x, point.y));
  }
  private curveInterpolation(action: ShortcutAction): InterpolationMode {
    return this.spec(action.id).pointsKind === 'customCurve' &&
      (action.text === 'pchip' || action.text === 'makima' || action.text === 'step') ? action.text : 'linear';
  }
  private mappingMaximumPoints(id: string, index: number): number {
    let otherPoints: number = 0;
    this.configuration.mappings.forEach(mapping => mapping.actions.forEach((action: ShortcutAction, actionIndex: number) => {
      if (mapping.id !== id || actionIndex !== index) { otherPoints += action.points.length; }
    }));
    return Math.max(0, Math.min(KeyboardShortcutConfiguration.MAX_POINTS_PER_ACTION,
      KeyboardShortcutConfiguration.MAX_TOTAL_POINTS - otherPoints));
  }
  private textArgumentDescription(action: ShortcutAction): string {
    if (this.spec(action.id).category !== 'shortcut' || this.spec(action.id).textArgumentLabel.length === 0) { return ''; }
    const matches: KeyboardShortcutMapping[] = this.configuration.mappings.filter(mapping => mapping.name === action.text);
    const name: string = action.text.length === 0 ? '未命名映射' : '“' + action.text + '”';
    if (matches.length === 0) { return '目标映射：' + name + '（当前不存在，名称已保留）；执行时按名称精确匹配，区分大小写。'; }
    const first: KeyboardShortcutMapping = matches[0];
    return '目标映射：' + name + ' · ' + (first.enabled ? '已启用' : '已禁用') +
      (matches.length > 1 ? '；同名 ' + matches.length + ' 项，仅影响列表中的第一项。' : '；按名称精确匹配，区分大小写。');
  }
  private keyOptions(mapping: KeyboardShortcutMapping): SettingsOption[] {
    return [new SettingsOption('', '选择并添加一个按键…')].concat(keyCatalog()
      .filter((key: ShortcutKeySpec) => key.keyCode !== EMERGENCY_STOP_KEY && mapping.keys.indexOf(key.keyCode) < 0)
      .map((key: ShortcutKeySpec) => new SettingsOption(String(key.keyCode), key.label)));
  }
  private triggers(): SettingsOption[] {
    return [new SettingsOption('press', 'Press · 按下'), new SettingsOption('release', 'Release · 松开'),
      new SettingsOption('click', 'Click · 连击'), new SettingsOption('hold', 'Hold · 长按')];
  }
  private holdModes(): SettingsOption[] {
    return [new SettingsOption('release', '松开时检查时长并执行'), new SettingsOption('holding', '达到最短时长时执行一次')];
  }
  private booleans(actionId: string = ''): SettingsOption[] {
    if (actionId === 'MotionProvider::Custom Curve::Reset') {
      return [new SettingsOption('0', 'False · 不请求同步'), new SettingsOption('1', 'True · 请求同步')];
    }
    return [new SettingsOption('0', 'False · 关闭 / 停止'), new SettingsOption('1', 'True · 开启 / 播放')];
  }
  private spec(id: string): ShortcutActionSpec {
    const spec: ShortcutActionSpec | undefined = this.actionCatalog.find(candidate => candidate.id === id);
    return spec === undefined ? this.actionCatalog[0] : spec;
  }
  @Builder
  private pointEditor(action: ShortcutAction, maximumPoints: number, onChange: (points: MotionCurvePoint[]) => void) {
    Column({ space: UiStyle.gap(this.compact) }) {
      Text('控制点 · ' + action.points.length + '/' + maximumPoints + '；每动作最多 4096 点，全部键盘映射合计最多 8192 点。')
        .fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
      if (this.spec(action.id).pointsKind === 'smartLimit') {
        Text('OHOS 可移植边界：横纵坐标 0–100%，横坐标严格递增；原版允许的乱序和重复横坐标在此不支持。')
          .fontSize(UiStyle.helper).fontColor(UiStyle.warning).width('100%')
      } else {
        Text('横坐标可为任意有限秒数，保留输入顺序和重复点；纵坐标为 0–1。预览只显示 0 至 Duration，范围外的点仍会保留。')
          .fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
        Text('预览按边界保持绘制；执行后沿用提供器现有循环设置。编辑及预览只修改动作参数，不会启动运行、派发动作或 Arm。')
          .fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
      }
      CurvePointEditor({ points: this.curvePoints(action), compact: this.compact,
        minimumX: this.spec(action.id).pointsKind === 'smartLimit' ? 0 : null,
        maximumX: this.spec(action.id).pointsKind === 'smartLimit' ? 100 : null,
        minimumY: 0, maximumY: this.spec(action.id).pointsKind === 'smartLimit' ? 100 : 1,
        viewMinimumX: 0, viewMaximumX: this.spec(action.id).pointsKind === 'smartLimit' ? 100 : action.value,
        strictX: this.spec(action.id).pointsKind === 'smartLimit', maximumPoints: maximumPoints,
        interpolationMode: this.curveInterpolation(action), isLooping: false,
        xLabel: this.spec(action.id).pointsKind === 'smartLimit' ? '输入（%）' : '时间（秒）',
        yLabel: this.spec(action.id).pointsKind === 'smartLimit' ? '限制因子（%）' : '位置（0–1）', onChange: onChange })
    }.width('100%').enabled(!this.readOnly)
  }
  @Builder
  private triggerEditor(mapping: KeyboardShortcutMapping) {
    SettingsChoiceField({ label: '触发方式', selected: mapping.trigger, options: this.triggers(), editable: !this.readOnly,
        compact: this.compact,
      onSelect: this.bindEditChoice((value: string) => this.changeChoice(mapping.id, 'trigger', value)) })
    if (mapping.trigger === 'press' || mapping.trigger === 'release') {
      SettingsSwitchField({ label: '处理重复按键 · Handle repeating', value: mapping.handleRepeating, editable: !this.readOnly,
        compact: this.compact,
        onChange: this.bindEditFlag((value: boolean) => this.changeFlag(mapping.id, 'handleRepeating', value)) })
    } else if (mapping.trigger === 'click') {
      SettingsNumberField({ label: '连续点击次数', value: mapping.clickCount, minimum: 1, maximum: 8, integer: true,
        compact: this.compact,
        editable: !this.readOnly, onCommit: this.bindEditNumber((value: number): boolean => this.changeNumber(mapping.id, 'clickCount', value)) })
      SettingsNumberField({ label: '最大点击间隔', unit: '毫秒 · 0–60000', value: mapping.maximumClickIntervalMs,
        compact: this.compact,
        minimum: 0, maximum: 60000, integer: true, editable: !this.readOnly,
        onCommit: this.bindEditNumber((value: number): boolean => this.changeNumber(mapping.id, 'maximumClickIntervalMs', value)) })
    } else if (mapping.trigger === 'hold') {
      SettingsNumberField({ label: '最短按住时长', unit: '毫秒 · 0–60000', value: mapping.minimumHoldDurationMs,
        compact: this.compact,
        minimum: 0, maximum: 60000, integer: true, editable: !this.readOnly,
        onCommit: this.bindEditNumber((value: number): boolean => this.changeNumber(mapping.id, 'minimumHoldDurationMs', value)) })
      SettingsNumberField({ label: '最长按住时长', unit: '毫秒 · -1 表示不限制', value: mapping.maximumHoldDurationMs,
        compact: this.compact,
        minimum: -1, maximum: 60000, integer: true, editable: !this.readOnly,
        onCommit: this.bindEditNumber((value: number): boolean => this.changeNumber(mapping.id, 'maximumHoldDurationMs', value)) })
      Text('沿用原版：最长时长不大于最短时长时不设上限。达到阈值执行模式只触发一次。')
        .fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
      SettingsChoiceField({ label: '长按执行时机', selected: mapping.holdInvoke, options: this.holdModes(), editable: !this.readOnly,
        compact: this.compact,
        onSelect: this.bindEditChoice((value: string) => this.changeChoice(mapping.id, 'holdInvoke', value)) })
    }
  }
  @Builder
  private actionRow(mapping: KeyboardShortcutMapping, action: ShortcutAction, index: number) {
    Column({ space: UiStyle.gap(this.compact) }) {
      Text('动作 ' + (index + 1)).fontSize(UiStyle.heading).fontWeight(FontWeight.Bold).width('100%')
      SettingsChoiceField({ label: '动作分类', selected: this.category(action.id), options: this.categories(), editable: !this.readOnly,
        compact: this.compact,
        onSelect: this.bindEditChoice((value: string) => this.selectActionCategory(mapping.id, index, value)) })
      SettingsChoiceField({ label: '动作类型', selected: action.id, options: this.actionOptions(false, this.category(action.id)), editable: !this.readOnly,
        compact: this.compact,
        onSelect: this.bindEditChoice((value: string) => this.selectAction(mapping.id, index, value)) })
      if (this.spec(action.id).targetOutput) {
        SettingsChoiceField({ label: '输出目标', selected: action.outputTargetId, options: this.outputTargetOptions(action.outputTargetId), editable: !this.readOnly,
        compact: this.compact,
          onSelect: this.bindEditChoice((value: string) => { this.actionText(mapping.id, index, 'outputTargetId', value); }) })
        Text(this.outputTargetDescription(action)).fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
      }
      if (this.spec(action.id).targetAxis) {
        SettingsChoiceField({ label: '目标轴', selected: action.targetAxis, options: this.targetOptions(action.targetAxis), editable: !this.readOnly,
        compact: this.compact,
          onSelect: this.bindEditChoice((value: string) => { this.actionText(mapping.id, index, 'targetAxis', value); }) })
        Text(this.targetDescription(action)).fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
      }
      if (this.executionNote(action).length > 0) {
        Text(this.executionNote(action)).fontSize(UiStyle.helper).fontColor(UiStyle.warning).width('100%')
      }
      if (this.spec(action.id).pointsKind === 'customCurve') {
        SettingsChoiceField({ label: 'Interpolation type · 插值', selected: action.text, options: this.textOptions(action), editable: !this.readOnly,
        compact: this.compact,
          onSelect: this.bindEditChoice((value: string) => { this.actionText(mapping.id, index, 'text', value); }) })
      } else if (this.spec(action.id).textArgumentLabel.length > 0) {
        SettingsTextField({ label: this.spec(action.id).textArgumentLabel, value: action.text, editable: !this.readOnly,
        compact: this.compact,
          onCommit: this.bindEditText((value: string): boolean => this.actionText(mapping.id, index, 'text', value)) })
        Text(this.textArgumentDescription(action)).fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
        Text('禁用仅阻止后续新手势；当前动作组和已排队触发按原语义继续。要立即撤销请使用全局停止。')
          .fontSize(UiStyle.helper).fontColor(UiStyle.warning).width('100%')
      }
      if (this.spec(action.id).valueKind === 'number') {
        SettingsNumberField({ label: this.spec(action.id).valueLabel, unit: this.spec(action.id).unit, value: action.value,
        compact: this.compact,
          minimum: this.spec(action.id).minimum, maximum: this.spec(action.id).maximum, integer: this.spec(action.id).integer, editable: !this.readOnly,
          onCommit: this.bindEditNumber((value: number): boolean => this.actionValue(mapping.id, index, value)) })
        Text('允许范围：' + this.spec(action.id).minimum + ' 至 ' + this.spec(action.id).maximum + ' ' + this.spec(action.id).unit)
          .fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
      } else if (this.spec(action.id).valueKind === 'boolean') {
        SettingsChoiceField({ label: this.spec(action.id).valueLabel, selected: String(action.value), options: this.booleans(action.id), editable: !this.readOnly,
        compact: this.compact,
          onSelect: this.bindEditChoice((value: string) => { this.actionValue(mapping.id, index, Number(value)); }) })
      } else if (this.spec(action.id).managedScript) {
        SettingsChoiceField({ label: this.spec(action.id).valueLabel, selected: action.text, options: this.managedOptions(action.text), editable: !this.readOnly,
        compact: this.compact,
          onSelect: this.bindEditChoice((value: string) => { this.actionText(mapping.id, index, 'text', value); }) })
        Text(this.managedScriptDescription(action)).fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
      } else if (this.spec(action.id).valueKind === 'text') {
        SettingsTextField({ label: this.spec(action.id).valueLabel, value: action.text, editable: !this.readOnly,
        compact: this.compact,
          onCommit: this.bindEditText((value: string): boolean => this.actionText(mapping.id, index, 'text', value)) })
      } else if (this.spec(action.id).valueKind === 'enum' || this.spec(action.id).valueKind === 'axis' || this.spec(action.id).valueKind === 'provider') {
        SettingsChoiceField({ label: this.spec(action.id).valueLabel, selected: action.text, options: this.textOptions(action), editable: !this.readOnly,
        compact: this.compact,
          onSelect: this.bindEditChoice((value: string) => { this.actionText(mapping.id, index, 'text', value); }) })
      }
      if (this.spec(action.id).secondaryValueKind === 'number') {
        SettingsNumberField({ label: this.spec(action.id).secondaryLabel, unit: this.spec(action.id).secondaryUnit, value: action.secondaryValue,
        compact: this.compact,
          minimum: this.spec(action.id).secondaryMinimum, maximum: this.spec(action.id).secondaryMaximum, editable: !this.readOnly,
          onCommit: this.bindEditNumber((value: number): boolean => this.actionNumber(mapping.id, index, 'secondaryValue', value)) })
      }
      if (this.spec(action.id).tertiaryValueKind === 'number') {
        SettingsNumberField({ label: this.spec(action.id).tertiaryLabel, unit: this.spec(action.id).tertiaryUnit, value: action.tertiaryValue,
        compact: this.compact,
          minimum: this.spec(action.id).tertiaryMinimum, maximum: this.spec(action.id).tertiaryMaximum, editable: !this.readOnly,
          onCommit: this.bindEditNumber((value: number): boolean => this.actionNumber(mapping.id, index, 'tertiaryValue', value)) })
      }
      if (this.spec(action.id).pointsKind !== 'none') {
        this.pointEditor(action, this.mappingMaximumPoints(mapping.id, index), this.mappingPointsHandler(mapping.id, index))
      }
      Flex({ wrap: FlexWrap.Wrap }) {
        Button('动作上移').fontColor(UiStyle.ink).backgroundColor(UiStyle.accentSoft)
          .type(ButtonType.Normal).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 14, right: 14, top: 12, bottom: 12 }).borderRadius(UiStyle.radius).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).fontSize(UiStyle.body(this.compact)).margin({ right: 6, bottom: 6 })
          .enabled(!this.readOnly && index > 0).onClick(this.bindEditCommand(() => this.moveAction(mapping.id, index, -1)))
        Button('动作下移').fontColor(UiStyle.ink).backgroundColor(UiStyle.accentSoft)
          .type(ButtonType.Normal).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 14, right: 14, top: 12, bottom: 12 }).borderRadius(UiStyle.radius).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).fontSize(UiStyle.body(this.compact)).margin({ right: 6, bottom: 6 })
          .enabled(!this.readOnly && index + 1 < mapping.actions.length).onClick(this.bindEditCommand(() => this.moveAction(mapping.id, index, 1)))
        Button('移除动作').fontColor(UiStyle.ink).backgroundColor(UiStyle.accentSoft)
          .type(ButtonType.Normal).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 14, right: 14, top: 12, bottom: 12 }).borderRadius(UiStyle.radius).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).fontSize(UiStyle.body(this.compact)).margin({ right: 6, bottom: 6 })
          .enabled(!this.readOnly).fontColor(UiStyle.danger).backgroundColor(UiStyle.dangerSoft).onClick(this.bindEditCommand(() => this.removeAction(mapping.id, index)))
      }.width('100%')
    }.width('100%').padding(8).backgroundColor(UiStyle.page).margin({ bottom: 8 })
  }
  @Builder
  private mappingRow(mapping: KeyboardShortcutMapping, index: number) {
    Column({ space: UiStyle.gap(this.compact) }) {
      Text((index + 1) + '. ' + (mapping.name.length > 0 ? mapping.name : '未命名映射'))
        .fontSize(UiStyle.heading).fontWeight(FontWeight.Bold).width('100%')
      SettingsSwitchField({ label: '启用此映射', value: mapping.enabled, editable: !this.readOnly,
        compact: this.compact,
        onChange: this.bindEditFlag((value: boolean) => this.changeFlag(mapping.id, 'enabled', value)) })
      SettingsTextField({ label: '映射名称（最多 80 字符）', value: mapping.name, editable: !this.readOnly,
        compact: this.compact,
        onCommit: this.bindEditText((value: string): boolean => this.changeName(mapping.id, value)) })
      Text('按键组合：' + (mapping.keys.length === 0 ? '未设置' : chordLabel(mapping.keys)))
        .fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.ink).width('100%').wordBreak(WordBreak.BREAK_ALL)
      Flex({ wrap: FlexWrap.Wrap }) {
        ForEach(mapping.keys, (code: number) => {
          Button('移除 ' + keyLabel(code)).fontColor(UiStyle.ink).backgroundColor(UiStyle.accentSoft)
            .type(ButtonType.Normal).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 14, right: 14, top: 12, bottom: 12 }).borderRadius(UiStyle.radius).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).fontSize(UiStyle.body(this.compact))
            .margin({ right: 6, bottom: 6 }).enabled(!this.readOnly).fontColor(UiStyle.danger).backgroundColor(UiStyle.dangerSoft).onClick(this.bindEditCommand(() => this.removeKey(mapping.id, code)))
        }, (code: number) => String(code))
      }.width('100%')
      SettingsChoiceField({ label: '选择组合键成员（最多 8 键）', selected: '', options: this.keyOptions(mapping),
        compact: this.compact,
        editable: !this.readOnly && mapping.keys.length < KeyboardShortcutConfiguration.MAX_KEYS,
        onSelect: this.bindEditChoice((value: string) => this.addKey(mapping.id, value)) })
      if (this.captureId === mapping.id) {
        Text('捕获中：' + (this.captureKeys.length === 0 ? '请按下组合键，然后应用。' : chordLabel(this.captureKeys)))
          .fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.accent).width('100%')
        Flex({ wrap: FlexWrap.Wrap }) {
          Button('应用捕获按键').fontColor(UiStyle.ink).backgroundColor(UiStyle.accentSoft)
            .type(ButtonType.Normal).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 14, right: 14, top: 12, bottom: 12 }).borderRadius(UiStyle.radius).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).fontSize(UiStyle.body(this.compact)).margin({ right: 6, bottom: 6 })
            .enabled(!this.readOnly && this.captureKeys.length > 0).fontColor(UiStyle.field).backgroundColor(UiStyle.accent).onClick(this.captureApplyHandler(mapping.id))
          Button('取消捕获').fontColor(UiStyle.ink).backgroundColor(UiStyle.accentSoft)
            .type(ButtonType.Normal).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 14, right: 14, top: 12, bottom: 12 }).borderRadius(UiStyle.radius).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).fontSize(UiStyle.body(this.compact)).margin({ right: 6, bottom: 6 })
            .enabled(!this.readOnly).onClick(this.captureCancelHandler())
        }.width('100%')
      } else {
        Button('从键盘捕获组合键').fontColor(UiStyle.ink).backgroundColor(UiStyle.accentSoft)
          .type(ButtonType.Normal).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 14, right: 14, top: 12, bottom: 12 }).borderRadius(UiStyle.radius).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).fontSize(UiStyle.body(this.compact)).width('100%')
          .enabled(!this.readOnly).onClick(this.bindEditCommand(() => this.startCapture(mapping.id)))
      }
      this.triggerEditor(mapping)
      Text('按列表顺序执行动作；空按键或空动作列表不会触发。').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
      ForEach(mapping.actions, (action: ShortcutAction, actionIndex: number) => {
        this.actionRow(mapping, action, actionIndex)
      }, (_action: ShortcutAction, actionIndex: number) => mapping.id + ':action:' + actionIndex)
      SettingsChoiceField({ label: '追加动作分类', selected: this.appendCategory(mapping.id), options: this.categories(), editable: !this.readOnly,
        compact: this.compact,
        onSelect: this.bindEditChoice((value: string) => this.selectAppendCategory(mapping.id, value)) })
      SettingsChoiceField({ label: '追加动作（最多 16 项）', selected: '', options: this.actionOptions(true, this.appendCategory(mapping.id)),
        compact: this.compact,
        editable: !this.readOnly && mapping.actions.length < KeyboardShortcutConfiguration.MAX_ACTIONS,
        onSelect: this.bindEditChoice((value: string) => this.addAction(mapping.id, value)) })
      Flex({ wrap: FlexWrap.Wrap }) {
        Button('映射上移').fontColor(UiStyle.ink).backgroundColor(UiStyle.accentSoft)
          .type(ButtonType.Normal).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 14, right: 14, top: 12, bottom: 12 }).borderRadius(UiStyle.radius).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).fontSize(UiStyle.body(this.compact)).margin({ right: 6, bottom: 6 })
          .enabled(!this.readOnly && index > 0).onClick(this.bindEditCommand(() => this.moveMapping(mapping.id, -1)))
        Button('映射下移').fontColor(UiStyle.ink).backgroundColor(UiStyle.accentSoft)
          .type(ButtonType.Normal).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 14, right: 14, top: 12, bottom: 12 }).borderRadius(UiStyle.radius).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).fontSize(UiStyle.body(this.compact)).margin({ right: 6, bottom: 6 })
          .enabled(!this.readOnly && index + 1 < this.configuration.mappings.length).onClick(this.bindEditCommand(() => this.moveMapping(mapping.id, 1)))
        Button('移除此映射').fontColor(UiStyle.ink).backgroundColor(UiStyle.accentSoft)
          .type(ButtonType.Normal).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 14, right: 14, top: 12, bottom: 12 }).borderRadius(UiStyle.radius).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).fontSize(UiStyle.body(this.compact)).margin({ right: 6, bottom: 6 })
          .enabled(!this.readOnly).fontColor(UiStyle.danger).backgroundColor(UiStyle.dangerSoft).onClick(this.bindEditCommand(() => this.removeMapping(mapping.id)))
      }.width('100%')
    }.width('100%').padding(UiStyle.padding(this.compact)).border({ width: 1, color: UiStyle.edge }).borderRadius(UiStyle.radius).margin({ bottom: 12 })
  }
  build() {
    // The workspace owns scrolling; no nested unbounded Scroll or List.
    Column({ space: UiStyle.gap(this.compact) }) {
      SettingsSectionTitle({ label: '输入 · KEYBOARD' })
      Text('本地键盘映射按列表顺序匹配和执行。输入文字、捕获按键或应用进入后台时，普通映射暂停。')
        .fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
      Text('F12 · 全局停止是 OHOS 新增的保留键，不可重新映射；只读和文字输入时仍可停止。')
        .fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.danger).width('100%')
      Button('全局停止 · F12').fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.ink).backgroundColor(UiStyle.accentSoft)
        .type(ButtonType.Normal).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 14, right: 14, top: 12, bottom: 12 }).borderRadius(UiStyle.radius).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).width('100%')
        .fontColor(UiStyle.field).backgroundColor(UiStyle.danger).fontColor(UiStyle.field).backgroundColor(UiStyle.danger).onClick(() => this.stop())
      if (this.readOnly) { Text('当前设置仅可查看。全局停止始终可用。').fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.warning).width('100%') }
      if (this.error.length > 0) { Text(this.error).fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.danger).width('100%') }
      SettingsSwitchField({ label: '启用键盘映射', value: this.configuration.enabled, editable: !this.readOnly,
        compact: this.compact,
        onChange: this.bindEditFlag((value: boolean) => this.changeEnabled(value)) })
      if (this.configuration.mappings.length === 0) {
        Text('暂无自定义映射。默认不分配普通快捷键；可添加映射，或直接使用下方触控动作。')
          .fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL).padding(8)
      }
      ForEach(this.configuration.mappings, (mapping: KeyboardShortcutMapping, index: number) => {
        this.mappingRow(mapping, index)
      }, (mapping: KeyboardShortcutMapping) => mapping.id + ':view:' + this.renderRevision)
      Button('添加键盘映射 · ' + this.configuration.mappings.length + '/64').fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.ink).backgroundColor(UiStyle.accentSoft)
        .type(ButtonType.Normal).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 14, right: 14, top: 12, bottom: 12 }).borderRadius(UiStyle.radius).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).width('100%')
        .enabled(!this.readOnly && this.configuration.mappings.length < KeyboardShortcutConfiguration.MAX_MAPPINGS).onClick(this.bindEditCommand(() => this.addMapping()))
      SettingsSectionTitle({ label: '触控等价动作 · TOUCH' })
      Text('无需键盘。选择动作和参数后执行，使用与键盘相同的受保护命令入口。此处不提供连接输出或 Arm。')
        .fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
      Text('动作目录共 ' + this.actionCatalog.length + ' 项，按分类选择。目标轴会显示为当前所选轴或固定轴。')
        .fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
      // Recreate same-valued fields when the full draft identity changes, so a
      // stale text/number blur cannot commit into a different action or target.
      ForEach([String(this.touchEpoch) + ':' + this.renderRevision], (_identity: string) => {
        SettingsChoiceField({ label: '触控动作分类', selected: this.category(this.touchActionId), options: this.categories(), editable: !this.readOnly,
        compact: this.compact,
          onSelect: this.touchChoiceHandler('category') })
        SettingsChoiceField({ label: '触控动作', selected: this.touchActionId, options: this.actionOptions(false, this.category(this.touchActionId)), editable: !this.readOnly,
        compact: this.compact,
          onSelect: this.touchChoiceHandler('action') })
        if (this.spec(this.touchActionId).targetOutput) {
          SettingsChoiceField({ label: '触控输出目标', selected: this.touchAction.outputTargetId,
        compact: this.compact,
            options: this.outputTargetOptions(this.touchAction.outputTargetId), editable: !this.readOnly,
            onSelect: this.touchChoiceHandler('outputTargetId') })
          Text(this.outputTargetDescription(this.touchAction)).fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
        }
        if (this.spec(this.touchActionId).targetAxis) {
          SettingsChoiceField({ label: '触控目标轴', selected: this.touchAction.targetAxis, options: this.targetOptions(this.touchAction.targetAxis), editable: !this.readOnly,
        compact: this.compact,
            onSelect: this.touchChoiceHandler('targetAxis') })
        }
        Text(this.targetDescription(this.touchAction)).fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.ink).width('100%').wordBreak(WordBreak.BREAK_ALL)
        if (this.executionNote(this.touchAction).length > 0) {
          Text(this.executionNote(this.touchAction)).fontSize(UiStyle.helper).fontColor(UiStyle.warning).width('100%')
        }
        if (this.spec(this.touchActionId).pointsKind === 'customCurve') {
          SettingsChoiceField({ label: 'Interpolation type · 插值', selected: this.touchAction.text,
        compact: this.compact,
            options: this.textOptions(this.touchAction), editable: !this.readOnly, onSelect: this.touchChoiceHandler('text') })
        } else if (this.spec(this.touchActionId).textArgumentLabel.length > 0) {
          SettingsTextField({ label: this.spec(this.touchActionId).textArgumentLabel, value: this.touchAction.text, editable: !this.readOnly,
        compact: this.compact,
            onCommit: this.touchTextHandler() })
          Text(this.textArgumentDescription(this.touchAction)).fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
          Text('禁用仅阻止后续新手势；当前动作组和已排队触发按原语义继续。要立即撤销请使用全局停止。')
            .fontSize(UiStyle.helper).fontColor(UiStyle.warning).width('100%')
        }
        if (this.spec(this.touchActionId).valueKind === 'number') {
          SettingsNumberField({ label: this.spec(this.touchActionId).valueLabel, unit: this.spec(this.touchActionId).unit, value: this.touchActionValue,
        compact: this.compact,
            minimum: this.spec(this.touchActionId).minimum, maximum: this.spec(this.touchActionId).maximum,
            integer: this.spec(this.touchActionId).integer, editable: !this.readOnly,
            onCommit: this.touchNumberHandler() })
          Text('允许范围：' + this.spec(this.touchActionId).minimum + ' 至 ' + this.spec(this.touchActionId).maximum + ' ' + this.spec(this.touchActionId).unit)
            .fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
        } else if (this.spec(this.touchActionId).valueKind === 'boolean') {
          SettingsChoiceField({ label: this.spec(this.touchActionId).valueLabel, selected: String(this.touchActionValue), options: this.booleans(this.touchActionId), editable: !this.readOnly,
        compact: this.compact,
            onSelect: this.touchBooleanHandler() })
        } else if (this.spec(this.touchActionId).managedScript) {
          SettingsChoiceField({ label: this.spec(this.touchActionId).valueLabel, selected: this.touchAction.text,
        compact: this.compact,
            options: this.managedOptions(this.touchAction.text), editable: !this.readOnly, onSelect: this.touchChoiceHandler('text') })
          Text(this.managedScriptDescription(this.touchAction)).fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
        } else if (this.spec(this.touchActionId).valueKind === 'text') {
          SettingsTextField({ label: this.spec(this.touchActionId).valueLabel, value: this.touchAction.text, editable: !this.readOnly,
        compact: this.compact,
            onCommit: this.touchTextHandler() })
        } else if (this.spec(this.touchActionId).valueKind === 'enum' || this.spec(this.touchActionId).valueKind === 'axis' || this.spec(this.touchActionId).valueKind === 'provider') {
          SettingsChoiceField({ label: this.spec(this.touchActionId).valueLabel, selected: this.touchAction.text,
        compact: this.compact,
            options: this.textOptions(this.touchAction), editable: !this.readOnly, onSelect: this.touchChoiceHandler('text') })
        }
        if (this.spec(this.touchActionId).secondaryValueKind === 'number') {
          SettingsNumberField({ label: this.spec(this.touchActionId).secondaryLabel, unit: this.spec(this.touchActionId).secondaryUnit,
        compact: this.compact,
            value: this.touchAction.secondaryValue, minimum: this.spec(this.touchActionId).secondaryMinimum,
            maximum: this.spec(this.touchActionId).secondaryMaximum, editable: !this.readOnly,
            onCommit: this.touchNumberHandler('secondaryValue') })
        }
        if (this.spec(this.touchActionId).tertiaryValueKind === 'number') {
          SettingsNumberField({ label: this.spec(this.touchActionId).tertiaryLabel, unit: this.spec(this.touchActionId).tertiaryUnit,
        compact: this.compact,
            value: this.touchAction.tertiaryValue, minimum: this.spec(this.touchActionId).tertiaryMinimum,
            maximum: this.spec(this.touchActionId).tertiaryMaximum, editable: !this.readOnly,
            onCommit: this.touchNumberHandler('tertiaryValue') })
        }
        if (this.spec(this.touchActionId).pointsKind !== 'none') {
          this.pointEditor(this.touchAction, KeyboardShortcutConfiguration.MAX_POINTS_PER_ACTION, this.touchPointsHandler())
        }
        Button('执行触控动作 · ' + this.spec(this.touchActionId).label).fontColor(UiStyle.ink).backgroundColor(UiStyle.accentSoft)
          .type(ButtonType.Normal).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 14, right: 14, top: 12, bottom: 12 }).borderRadius(UiStyle.radius).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).width('100%').fontSize(UiStyle.body(this.compact))
          .enabled(!this.readOnly || this.touchActionId === 'App::Stop')
          .fontColor(UiStyle.field).backgroundColor(UiStyle.accent).onClick(this.touchActionHandler())
      }, (identity: string) => identity)
      if (this.actionStatus.length > 0) {
        Text('执行结果：' + this.actionStatus).fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.ink).width('100%').wordBreak(WordBreak.BREAK_ALL)
      }
      Text('此版只支持本地键盘按钮手势。模拟轴、鼠标轴与手柄输入尚未适配，不提供占位开关。')
        .fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
    }.width('100%').padding(UiStyle.padding(this.compact)).backgroundColor(UiStyle.card).borderRadius(UiStyle.radius).border({ width: 1, color: UiStyle.edgeLight })
  }
}
