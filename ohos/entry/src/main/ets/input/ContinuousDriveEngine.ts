import { ContinuousInputAction, ContinuousInputConfiguration, ContinuousInputMapping, cloneContinuousAction, cloneContinuousMapping,
  continuousSourceAcceptsComponent } from './ContinuousInputConfiguration';
import type { ContinuousInputComponent, ContinuousInputSource, ContinuousDriveMode, ContinuousOffsetMode } from './ContinuousInputConfiguration';

export type ContinuousTimestampUnit = 'ns' | 'us' | 'ms';

/** Already-normalized local input, not a Windows RawInput/XInput claim. Native
 * timestamp and units are retained for freshness; neither is media time.
 * Touch duration is supplied by the local adapter. Mouse and wheel retain the
 * original action duration of zero. Live touch/pressed mouse is explicit. */
export class ContinuousGesture {
  value: number;
  delta: number;
  deltaTime: number;
  source: ContinuousInputSource;
  component: ContinuousInputComponent;
  pointerId: number;
  contactActive: boolean;
  nativeTimestamp: number;
  nativeTimestampUnit: ContinuousTimestampUnit;
  constructor(value: number, delta: number, deltaTime: number, source: ContinuousInputSource,
    component: ContinuousInputComponent, pointerId: number, contactActive: boolean,
    nativeTimestamp: number = 0, nativeTimestampUnit: ContinuousTimestampUnit = 'ns') {
    this.value = value; this.delta = delta; this.deltaTime = deltaTime; this.source = source; this.component = component;
    this.pointerId = pointerId; this.contactActive = contactActive;
    this.nativeTimestamp = nativeTimestamp; this.nativeTimestampUnit = nativeTimestampUnit;
  }
}

/** Exact AxisInputGestureData.ApplyTo arithmetic. Relative data is an increment,
 * so a consumer must not multiply by deltaTime again. */
export class ContinuousGestureData {
  readonly valueOrDelta: number;
  readonly deltaTime: number;
  readonly isAbsolute: boolean;
  constructor(valueOrDelta: number, deltaTime: number, isAbsolute: boolean) {
    if (!Number.isFinite(valueOrDelta) || !Number.isFinite(deltaTime) || deltaTime < 0 || typeof isAbsolute !== 'boolean') {
      throw new Error('Continuous action data must contain finite values and a nonnegative duration.');
    }
    this.valueOrDelta = valueOrDelta; this.deltaTime = deltaTime; this.isAbsolute = isAbsolute;
  }
  get isRelative(): boolean { return !this.isAbsolute; }
  applyTo(current: number, deltaModifier: number = 1): number {
    return this.isAbsolute ? this.valueOrDelta : current + this.valueOrDelta * deltaModifier;
  }
  static absolute(value: number, deltaTime: number): ContinuousGestureData { return new ContinuousGestureData(value, deltaTime, true); }
  static relative(delta: number, deltaTime: number): ContinuousGestureData { return new ContinuousGestureData(delta, deltaTime, false); }
}

/** Source pin 36c08fb, AxisDriveShortcut.Update: directional admission occurs
 * BEFORE inversion; center/return-to-center joystick input does not invoke. */
export function convertDriveGesture(mode: ContinuousDriveMode, invert: boolean, gesture: ContinuousGesture): ContinuousGestureData | null {
  checkGestureValues(gesture);
  if (typeof invert !== 'boolean') { throw new Error('Drive inversion must be boolean.'); }
  if (mode === 'Absolute') { return ContinuousGestureData.absolute(invert ? 1 - gesture.value : gesture.value, gesture.deltaTime); }
  if (['Relative', 'RelativePositiveOnly', 'RelativeNegativeOnly', 'RelativeJoystick'].indexOf(mode) < 0) {
    throw new Error('Unsupported Drive mode.');
  }
  if ((mode === 'RelativePositiveOnly' && gesture.delta <= 0) || (mode === 'RelativeNegativeOnly' && gesture.delta >= 0) ||
    (mode === 'RelativeJoystick' && !((gesture.value < 0.5 && gesture.delta < 0) || (gesture.value > 0.5 && gesture.delta > 0)))) {
    return null;
  }
  return ContinuousGestureData.relative(gesture.delta * (invert ? -1 : 1), gesture.deltaTime);
}

/** Independent AxisOffsetShortcut algorithm, not a sixth Drive mode. */
export function convertOffsetGesture(mode: ContinuousOffsetMode, speed: number, invert: boolean, gesture: ContinuousGesture): number {
  checkGestureValues(gesture);
  if (!Number.isFinite(speed) || speed < 0 || speed > 1 || typeof invert !== 'boolean') { throw new Error('Invalid Offset speed/inversion.'); }
  if (mode !== 'Absolute' && mode !== 'AbsoluteJoystick') { throw new Error('Unsupported Offset mode.'); }
  const sign = invert ? -1 : 1;
  if (mode === 'Absolute') { return gesture.value * speed * sign; }
  // Keep the source's two Map branches and operation ordering. The lower
  // branch uses 0.5..0 -> 0..-1, not a filtered or absolute joystick delta.
  if (gesture.value > 0.5) { return ((gesture.value - 0.5) / (1 - 0.5)) * speed * sign; }
  if (gesture.value < 0.5) { return ((gesture.value - 0.5) / (0 - 0.5) * -1) * speed * sign; }
  return 0;
}

export class ContinuousOutputIdentity {
  id: string;
  generation: number;
  constructor(id: string, generation: number) { this.id = id; this.generation = generation; }
}
export class ContinuousInputContext {
  foreground: boolean = true;
  focused: boolean = true;
  textInput: boolean = false;
  ime: boolean = false;
  modal: boolean = false;
  readOnly: boolean = false;
  surfaceVisible: boolean = true;
  ownerId: number = 0;
  profileRevision: number = 0;
  /** Admission/mapping revision, NOT the settings revision changed by Drive. */
  controlRevision: number = 0;
  enabledAxes: string[] = [];
  outputTargets: ContinuousOutputIdentity[] = [];
}

export class ContinuousCapture {
  readonly token: number;
  readonly sequence: number;
  readonly ownerId: number;
  readonly pointerId: number;
  readonly source: ContinuousInputSource;
  readonly context: ContinuousInputContext;
  constructor(token: number, sequence: number, ownerId: number, pointerId: number,
    source: ContinuousInputSource, context: ContinuousInputContext) {
    this.token = token; this.sequence = sequence; this.ownerId = ownerId; this.pointerId = pointerId;
    this.source = source; this.context = cloneContext(context);
  }
}
export class ContinuousDispatch {
  readonly mappingId: string;
  readonly mapping: ContinuousInputMapping;
  readonly actions: ContinuousInputAction[];
  readonly data: ContinuousGestureData;
  readonly token: number;
  readonly sequence: number;
  readonly captureSequence: number;
  readonly ownerId: number;
  readonly pointerId: number;
  readonly source: ContinuousInputSource;
  readonly context: ContinuousInputContext;
  constructor(mapping: ContinuousInputMapping, data: ContinuousGestureData, capture: ContinuousCapture, sequence: number) {
    this.mappingId = mapping.id; this.mapping = cloneContinuousMapping(mapping);
    this.actions = mapping.actions.map(action => cloneContinuousAction(action));
    this.data = new ContinuousGestureData(data.valueOrDelta, data.deltaTime, data.isAbsolute);
    this.token = capture.token; this.sequence = sequence; this.captureSequence = capture.sequence;
    this.ownerId = capture.ownerId; this.pointerId = capture.pointerId; this.source = capture.source;
    this.context = cloneContext(capture.context);
  }
}
class ContinuousMappingRuntime {
  mapping: ContinuousInputMapping;
  offset: number = 0;
  deadline: number | null = null;
  scheduled: ContinuousDispatch | null = null;
  constructor(mapping: ContinuousInputMapping) { this.mapping = mapping; }
}

/** No timers, I/O, media, preview, connection or Arm. The host injects one
 * monotonic clock, services nextDeadlineMs, and checks isDispatchCurrent before
 * EACH action and after each await; completeDispatch belongs in finally.
 *
 * Each mapping has at most one in-flight invocation. A due invocation while it
 * is busy is dropped, never queued. Late PeriodicTimer ticks coalesce while
 * retaining the original 100 ms cadence. Source Enabled only gates new gesture
 * updates; UI settings/context/cancel retire reception and existing deadlines.
 * A normal matching release retires contact and pending batch tails but leaves
 * the explicitly enabled surface ready for a NEW physical contact. */
export class ContinuousDriveEngine {
  static readonly OFFSET_PERIOD_MS: number = 100;
  private configuration: ContinuousInputConfiguration;
  private runtime: ContinuousMappingRuntime[] = [];
  private context: ContinuousInputContext = new ContinuousInputContext();
  private token: number = 0;
  private sequence: number = 0;
  private captureSequence: number = 0;
  private capture: ContinuousCapture | null = null;
  private receiving: boolean = false;
  private selectedMappingId: string = '';
  private lastTime: number = -1;
  private lastNativeTimestamp: number = -1;
  private nativeTimestampUnit: string = '';
  private handled: boolean = false;
  private reason: string = 'stopped';

  constructor(configuration: ContinuousInputConfiguration = new ContinuousInputConfiguration()) {
    this.configuration = ContinuousInputConfiguration.clone(configuration);
    this.runtime = this.configuration.mappings.map(mapping => new ContinuousMappingRuntime(mapping));
  }
  configurationSnapshot(): ContinuousInputConfiguration { return ContinuousInputConfiguration.clone(this.configuration); }
  contextSnapshot(): ContinuousInputContext { return cloneContext(this.context); }
  setConfiguration(configuration: ContinuousInputConfiguration): void {
    // Rejected edits also revoke old capture/timers; they cannot leave work live.
    this.cancel('configuration');
    this.configuration = ContinuousInputConfiguration.clone(configuration);
    this.runtime = this.configuration.mappings.map(mapping => new ContinuousMappingRuntime(mapping));
  }
  setContext(context: ContinuousInputContext): void {
    let next: ContinuousInputContext;
    try { next = cloneContext(context); } catch (error) { this.cancel('invalid-context'); throw error; }
    if (!sameContext(next, this.context)) { this.cancel('context'); }
    this.context = next;
  }
  /** Exact source Shortcut::Enabled behavior. This is NOT an editor/restore API. */
  setMappingEnabled(mappingId: string, enabled: boolean): boolean {
    if (typeof enabled !== 'boolean') { throw new Error('Continuous mapping enabled must be boolean.'); }
    const item = this.runtime.find(entry => entry.mapping.id === mappingId);
    if (item === undefined) { return false; }
    item.mapping.enabled = enabled; return true;
  }
  enableReception(ownerId: number, mappingId: string = ''): boolean {
    this.cancel('enable');
    if (ownerId !== this.context.ownerId || !this.contextAllowed() || !this.configuration.enabled || typeof mappingId !== 'string') {
      this.reason = 'blocked-context'; return false;
    }
    const selected = this.runtime.filter(item => item.mapping.enabled && (mappingId === '' || item.mapping.id === mappingId));
    if (selected.length === 0 || selected.some(item => !this.mappingAvailable(item.mapping))) {
      this.reason = 'blocked-target'; return false;
    }
    this.selectedMappingId = mappingId; this.receiving = true; this.reason = 'receiving'; return true;
  }
  cancel(reason: string = 'cancel'): void {
    this.retireCapture(); this.receiving = false; this.selectedMappingId = ''; this.reason = reason;
  }
  reset(reason: string = 'cancel'): void { this.cancel(reason); }
  cancellationToken(): number { return this.token; }
  cancellationReason(): string { return this.reason; }
  isReceiving(): boolean { return this.receiving && this.contextAllowed(); }
  isContactActive(): boolean { return this.isReceiving() && this.capture !== null && this.capture.source !== 'wheel'; }
  lastEventHandled(): boolean { return this.handled; }

  beginCapture(pointerId: number, source: ContinuousInputSource, ownerId: number, nowMs: number,
    contactActive: boolean): ContinuousCapture | null {
    // A stale page must not retire a replacement page's reception or clock.
    if (!this.isReceiving() || ownerId !== this.context.ownerId) { return null; }
    if (!validPointer(pointerId) || ['touch', 'mouse', 'wheel'].indexOf(source) < 0 ||
      typeof contactActive !== 'boolean' || (source !== 'wheel' && !contactActive) || (source === 'wheel' && contactActive)) {
      this.cancel('invalid-contact'); return null;
    }
    if (this.capture !== null) { this.cancel('ambiguous-contact'); return null; }
    if (!this.acceptTime(nowMs)) { return null; }
    if (!this.runtime.some(item => this.selected(item) && item.mapping.enabled && item.mapping.source === source && this.mappingAvailable(item.mapping))) {
      this.reason = 'unmapped-source'; return null;
    }
    this.capture = new ContinuousCapture(this.token, ++this.captureSequence, ownerId, pointerId, source, this.context);
    this.lastNativeTimestamp = -1; this.nativeTimestampUnit = ''; this.reason = source === 'wheel' ? 'receiving' : 'contact-active';
    // The caller cannot mutate our active ownership record through this copy.
    return copyCapture(this.capture);
  }
  isCaptureCurrent(capture: ContinuousCapture): boolean {
    const active = this.capture;
    return this.isReceiving() && active !== null && capture !== null && typeof capture === 'object' &&
      capture.token === this.token && capture.sequence === active.sequence && capture.ownerId === active.ownerId &&
      capture.pointerId === active.pointerId && capture.source === active.source && sameContext(capture.context, this.context);
  }
  releaseCapture(capture: ContinuousCapture, reason: string = 'release'): void {
    if (!this.isCaptureCurrent(capture)) { return; }
    if (reason !== 'release') { this.cancel(reason); return; }
    this.retireCapture(); this.reason = 'receiving';
  }
  gesture(capture: ContinuousCapture, gesture: ContinuousGesture, nowMs: number): ContinuousDispatch[] {
    if (!this.isCaptureCurrent(capture)) { return []; }
    this.handled = false;
    if (!validGesture(gesture) || gesture.pointerId !== capture.pointerId || gesture.source !== capture.source ||
      (gesture.source !== 'wheel' && !gesture.contactActive) || (gesture.source === 'wheel' && gesture.contactActive) ||
      gesture.nativeTimestamp < this.lastNativeTimestamp ||
      (this.nativeTimestampUnit !== '' && gesture.nativeTimestampUnit !== this.nativeTimestampUnit)) {
      this.cancel('invalid-gesture'); return [];
    }
    if (!this.acceptTime(nowMs)) { return []; }
    this.lastNativeTimestamp = gesture.nativeTimestamp; this.nativeTimestampUnit = gesture.nativeTimestampUnit;
    // Deterministic timer-before-input ordering at an equal deadline. Invalid
    // contact or stale native samples are rejected before a due tick can run.
    const result = this.advanceDue(nowMs);
    for (const item of this.runtime) {
      const mapping = item.mapping;
      if (!this.selected(item) || !mapping.enabled || mapping.source !== gesture.source || mapping.component !== gesture.component) { continue; }
      if (!this.mappingAvailable(mapping)) { this.cancel('unavailable-target'); return []; }
      this.handled = true;
      if (mapping.kind === 'drive') {
        const data = convertDriveGesture(mapping.driveMode, mapping.invert, gesture);
        if (data !== null) { this.schedule(item, data, result); }
      } else {
        item.offset = convertOffsetGesture(mapping.offsetMode, mapping.speed, mapping.invert, gesture);
        if (item.offset === 0) { item.deadline = null; }
        else if (item.deadline === null) { item.deadline = nowMs + ContinuousDriveEngine.OFFSET_PERIOD_MS; }
      }
    }
    return result;
  }
  advance(nowMs: number, token: number = this.token): ContinuousDispatch[] {
    // Never let an old timer move the current reception's monotonic clock.
    if (token !== this.token || !this.isReceiving() || this.capture === null || !this.acceptTime(nowMs)) { return []; }
    return this.advanceDue(nowMs);
  }
  nextDeadlineMs(): number | null {
    if (!this.isReceiving() || this.capture === null) { return null; }
    let next: number | null = null;
    for (const item of this.runtime) {
      if (item.deadline !== null && (next === null || item.deadline < next)) { next = item.deadline; }
    }
    return next;
  }
  isDispatchCurrent(dispatch: ContinuousDispatch): boolean {
    if (!this.isReceiving() || this.capture === null || dispatch === null || typeof dispatch !== 'object' ||
      dispatch.token !== this.token || dispatch.captureSequence !== this.capture.sequence ||
      dispatch.ownerId !== this.context.ownerId || dispatch.pointerId !== this.capture.pointerId ||
      dispatch.source !== this.capture.source || !sameContext(dispatch.context, this.context)) { return false; }
    const item = this.runtime.find(entry => entry.mapping.id === dispatch.mappingId);
    return item !== undefined && item.scheduled === dispatch && this.mappingAvailable(item.mapping);
  }
  completeDispatch(dispatch: ContinuousDispatch): void {
    if (dispatch === null || typeof dispatch !== 'object' || dispatch.token !== this.token) { return; }
    const item = this.runtime.find(entry => entry.mapping.id === dispatch.mappingId);
    if (item !== undefined && item.scheduled === dispatch) { item.scheduled = null; }
  }

  private selected(item: ContinuousMappingRuntime): boolean { return this.selectedMappingId === '' || this.selectedMappingId === item.mapping.id; }
  private contextAllowed(): boolean {
    return this.context.ownerId > 0 && this.context.foreground && this.context.focused && this.context.surfaceVisible &&
      !this.context.textInput && !this.context.ime && !this.context.modal && !this.context.readOnly;
  }
  private mappingAvailable(mapping: ContinuousInputMapping): boolean {
    return mapping.actions.length > 0 && mapping.actions.every(action => this.context.enabledAxes.indexOf(action.targetAxis) >= 0 &&
      (action.outputTargetId === '' || this.context.outputTargets.some(target => target.id === action.outputTargetId)));
  }
  private retireCapture(): void {
    this.token++; this.capture = null; this.lastNativeTimestamp = -1; this.nativeTimestampUnit = ''; this.handled = false;
    for (const item of this.runtime) { item.offset = 0; item.deadline = null; item.scheduled = null; }
  }
  private acceptTime(nowMs: number): boolean {
    if (!Number.isFinite(nowMs) || nowMs < 0 || nowMs > Number.MAX_SAFE_INTEGER - ContinuousDriveEngine.OFFSET_PERIOD_MS || nowMs < this.lastTime) {
      this.cancel('invalid-clock'); return false;
    }
    this.lastTime = nowMs; return true;
  }
  private advanceDue(nowMs: number): ContinuousDispatch[] {
    const result: ContinuousDispatch[] = [];
    const due = this.runtime.filter(item => item.deadline !== null && item.deadline <= nowMs);
    due.sort((left, right) => {
      const difference = (left.deadline === null ? Infinity : left.deadline) - (right.deadline === null ? Infinity : right.deadline);
      return difference === 0 ? this.runtime.indexOf(left) - this.runtime.indexOf(right) : difference;
    });
    for (const item of due) {
      if (!this.mappingAvailable(item.mapping)) { this.cancel('unavailable-target'); return []; }
      const deadline = item.deadline;
      if (deadline === null) { continue; }
      item.deadline = deadline + (Math.floor((nowMs - deadline) / ContinuousDriveEngine.OFFSET_PERIOD_MS) + 1) * ContinuousDriveEngine.OFFSET_PERIOD_MS;
      // No mapping.enabled check: the source's PeriodicTimer InvokeOffset does
      // not consult Enabled; only new Update calls do. Local cancellation does.
      this.schedule(item, ContinuousGestureData.relative(item.offset, 0.1), result);
    }
    return result;
  }
  private schedule(item: ContinuousMappingRuntime, data: ContinuousGestureData, result: ContinuousDispatch[]): void {
    if (item.scheduled !== null || this.capture === null || item.mapping.actions.length === 0) { return; }
    const dispatch = new ContinuousDispatch(item.mapping, data, this.capture, ++this.sequence);
    item.scheduled = dispatch; result.push(dispatch);
  }
}

function checkGestureValues(gesture: ContinuousGesture): void {
  if (gesture === null || typeof gesture !== 'object' || !Number.isFinite(gesture.value) || gesture.value < 0 || gesture.value > 1 ||
    !Number.isFinite(gesture.delta) || !Number.isFinite(gesture.deltaTime) || gesture.deltaTime < 0) {
    throw new Error('Continuous input requires a finite normalized value, delta and nonnegative duration.');
  }
}
function validPointer(pointerId: number): boolean { return Number.isSafeInteger(pointerId) && pointerId >= 0; }
function validGesture(gesture: ContinuousGesture): boolean {
  try { checkGestureValues(gesture); } catch (_) { return false; }
  return continuousSourceAcceptsComponent(gesture.source, gesture.component) && validPointer(gesture.pointerId) &&
    typeof gesture.contactActive === 'boolean' && Number.isFinite(gesture.nativeTimestamp) && gesture.nativeTimestamp >= 0 &&
    ['ns', 'us', 'ms'].indexOf(gesture.nativeTimestampUnit) >= 0 && (gesture.source === 'touch' || gesture.deltaTime === 0);
}
function cloneContext(value: ContinuousInputContext): ContinuousInputContext {
  if (value === null || typeof value !== 'object' ||
    [value.foreground, value.focused, value.textInput, value.ime, value.modal, value.readOnly, value.surfaceVisible].some(item => typeof item !== 'boolean') ||
    [value.ownerId, value.profileRevision, value.controlRevision].some(item => !Number.isSafeInteger(item) || item < 0) ||
    !denseArray(value.enabledAxes, 260) ||
    value.enabledAxes.some(axis => typeof axis !== 'string' || !/^[A-Z][0-9]$/.test(axis)) ||
    !denseArray(value.outputTargets, 30) ||
    value.outputTargets.some(target => target === null || typeof target !== 'object' || typeof target.id !== 'string' ||
      !/^(tcp|udp|webSocket):[0-9]$/.test(target.id) || !Number.isSafeInteger(target.generation) || target.generation < 0)) {
    throw new Error('Invalid continuous input owner/context/target snapshot.');
  }
  const result = new ContinuousInputContext();
  result.foreground = value.foreground; result.focused = value.focused; result.textInput = value.textInput;
  result.ime = value.ime; result.modal = value.modal; result.readOnly = value.readOnly; result.surfaceVisible = value.surfaceVisible;
  result.ownerId = value.ownerId; result.profileRevision = value.profileRevision; result.controlRevision = value.controlRevision;
  result.enabledAxes = value.enabledAxes.slice().sort();
  result.outputTargets = value.outputTargets.map(target => new ContinuousOutputIdentity(target.id, target.generation));
  result.outputTargets.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  if (result.enabledAxes.some((axis, index) => index > 0 && axis === result.enabledAxes[index - 1]) ||
    result.outputTargets.some((target, index) => index > 0 && target.id === result.outputTargets[index - 1].id)) {
    throw new Error('Continuous input context must not contain duplicate axes or targets.');
  }
  return result;
}
function sameContext(left: ContinuousInputContext, right: ContinuousInputContext): boolean {
  return left !== null && typeof left === 'object' && denseArray(left.enabledAxes, 260) && denseArray(left.outputTargets, 30) &&
    left.foreground === right.foreground && left.focused === right.focused && left.textInput === right.textInput && left.ime === right.ime &&
    left.modal === right.modal && left.readOnly === right.readOnly && left.surfaceVisible === right.surfaceVisible &&
    left.ownerId === right.ownerId && left.profileRevision === right.profileRevision && left.controlRevision === right.controlRevision &&
    left.enabledAxes.length === right.enabledAxes.length && left.enabledAxes.every((axis, index) => axis === right.enabledAxes[index]) &&
    left.outputTargets.length === right.outputTargets.length && left.outputTargets.every((target, index) =>
      target !== null && typeof target === 'object' && target.id === right.outputTargets[index].id && target.generation === right.outputTargets[index].generation);
}
function copyCapture(value: ContinuousCapture): ContinuousCapture {
  return new ContinuousCapture(value.token, value.sequence, value.ownerId, value.pointerId, value.source, value.context);
}
function denseArray(value: Object[], maximum: number): boolean {
  if (!Array.isArray(value) || value.length > maximum) { return false; }
  const keys = Object.keys(value);
  return keys.length === value.length && keys.every((key, index) => key === index.toString());
}
