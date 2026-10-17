import { ButtonShortcutState } from './ButtonShortcutState';
import { KeyboardShortcutConfiguration, KeyboardShortcutMapping, ShortcutAction, EMERGENCY_STOP_KEY,
  cloneShortcutAction, isShortcutKey, validateShortcutAction } from './ShortcutConfiguration';

export class ShortcutInputContext {
  foreground: boolean = true;
  focused: boolean = true;
  textInput: boolean = false;
  ime: boolean = false;
  capturing: boolean = false;
}
export class ShortcutKeyEvent {
  keyCode: number;
  pressed: boolean;
  constructor(keyCode: number, pressed: boolean) { this.keyCode = keyCode; this.pressed = pressed; }
}
export class ShortcutDispatch {
  readonly mappingId: string;
  readonly actions: ShortcutAction[];
  readonly token: number;
  readonly sequence: number;
  readonly emergency: boolean;
  constructor(mappingId: string, actions: ShortcutAction[], token: number, sequence: number, emergency: boolean = false) {
    this.mappingId = mappingId; this.actions = actions.map(action => cloneShortcutAction(action));
    this.token = token; this.sequence = sequence; this.emergency = emergency;
  }
}
class MappingRuntime {
  mapping: KeyboardShortcutMapping;
  trigger: ButtonShortcutState;
  scheduledSequence: number = -1;
  constructor(mapping: KeyboardShortcutMapping) { this.mapping = mapping; this.trigger = new ButtonShortcutState(mapping); }
}

/** Pure local keyboard adapter. RawInput parity: key-down adds to the exact
 * descriptor set (including repeats); FIRST key-up emits the entire descriptor
 * as released then clears it. It is not a physical-key subset matcher.
 *
 * Host contract: keyEvent and advance receive one injected monotonic clock.
 * Await each dispatch's actions in order and check isDispatchCurrent before
 * EACH action. Call completeDispatch in finally. At most one invocation for a
 * mapping is outstanding, matching AbstractShortcut._isScheduled. reset/Stop,
 * focus/context/settings changes invalidate outstanding dispatch tokens.
 * This engine performs no I/O, SDK calls, timers, or output connection/arming. */
export class LocalShortcutEngine {
  private configuration: KeyboardShortcutConfiguration;
  private runtime: MappingRuntime[] = [];
  private context: ShortcutInputContext = new ShortcutInputContext();
  private pressedKeys: number[] = [];
  private physicallyDown: number[] = [];
  private blockedUntilUp: number[] = [];
  private token: number = 0;
  private sequence: number = 0;
  private lastTime: number = -1;
  private handled: boolean = false;
  private physicalOverflow: boolean = false;
  private static readonly MAX_PHYSICAL_KEYS: number = 128;

  constructor(configuration: KeyboardShortcutConfiguration = new KeyboardShortcutConfiguration()) {
    this.configuration = KeyboardShortcutConfiguration.clone(configuration);
    this.runtime = this.configuration.mappings.map(mapping => new MappingRuntime(mapping));
  }
  configurationSnapshot(): KeyboardShortcutConfiguration { return KeyboardShortcutConfiguration.clone(this.configuration); }
  setConfiguration(configuration: KeyboardShortcutConfiguration): void {
    // Even rejected settings edits cannot leave a delayed action armed.
    this.reset('settings');
    this.configuration = KeyboardShortcutConfiguration.clone(configuration);
    this.runtime = this.configuration.mappings.map(mapping => new MappingRuntime(mapping));
  }
  /** Source Shortcut::Enabled changes only admission of NEW gesture updates.
   * Existing callbacks and the current ordered batch remain owned by the same
   * token. Ordinary editor setConfiguration, Stop and context retirement still
   * cancel them. Do not use this method to restore runtime state from storage. */
  setMappingEnabled(mappingId: string, enabled: boolean): boolean {
    if (typeof enabled !== 'boolean') { throw new Error('Invalid shortcut enabled value.'); }
    const item = this.runtime.find(entry => entry.mapping.id === mappingId);
    if (item === undefined) { return false; }
    item.mapping.enabled = enabled;
    return true;
  }
  setContext(context: ShortcutInputContext): void {
    const changed = context.foreground !== this.context.foreground || context.focused !== this.context.focused ||
      context.textInput !== this.context.textInput || context.ime !== this.context.ime || context.capturing !== this.context.capturing;
    if (changed) { this.reset('context'); }
    // Copy, do not retain a caller's mutable focus state object.
    this.context.foreground = context.foreground === true; this.context.focused = context.focused === true;
    this.context.textInput = context.textInput !== false; this.context.ime = context.ime !== false;
    this.context.capturing = context.capturing !== false;
  }
  reset(_reason: string = 'cancel'): void {
    this.token++; this.pressedKeys = []; this.handled = false;
    this.blockedUntilUp = this.physicallyDown.slice();
    for (const item of this.runtime) { item.trigger.reset(); item.scheduledSequence = -1; }
  }
  cancellationToken(): number { return this.token; }
  lastEventHandled(): boolean { return this.handled; }
  isDispatchCurrent(dispatch: ShortcutDispatch): boolean {
    if (dispatch.token !== this.token || !this.context.foreground || !this.context.focused) { return false; }
    if (dispatch.mappingId.length === 0 || dispatch.emergency) { return true; }
    const item = this.runtime.find(entry => entry.mapping.id === dispatch.mappingId);
    return this.keyboardAllowed() && item !== undefined && item.scheduledSequence === dispatch.sequence;
  }
  completeDispatch(dispatch: ShortcutDispatch): void {
    if (dispatch.token !== this.token) { return; }
    const item = this.runtime.find(entry => entry.mapping.id === dispatch.mappingId);
    if (item !== undefined && item.scheduledSequence === dispatch.sequence) { item.scheduledSequence = -1; }
  }
  nextDeadlineMs(): number | null {
    if (!this.keyboardAllowed()) { return null; }
    let result: number | null = null;
    for (const item of this.runtime) {
      const deadline = item.trigger.nextDeadlineMs();
      if (deadline !== null && (result === null || deadline < result)) { result = deadline; }
    }
    return result;
  }
  keyEvent(event: ShortcutKeyEvent, nowMs: number): ShortcutDispatch[] {
    this.handled = false;
    if (event === null || typeof event !== 'object' || typeof event.pressed !== 'boolean') { return []; }
    if (event.keyCode === EMERGENCY_STOP_KEY) {
      // Reserved even when mappings are disabled, text/IME/capture is active,
      // or a caller supplied an invalid clock. Never queue a safety stop.
      this.handled = true;
      if (!event.pressed || !this.context.foreground || !this.context.focused) { return []; }
      this.reset('emergency'); this.handled = true;
      return [this.makeDispatch('', [new ShortcutAction('App::Stop')], true)];
    }
    if (!Number.isInteger(event.keyCode) || event.keyCode < 0 || event.keyCode > 65535) {
      this.reset('invalid-key'); return [];
    }
    const wasBlocked = this.blockedUntilUp.indexOf(event.keyCode) >= 0;
    // Remember physical state BEFORE rejecting the clock. Otherwise a key first
    // seen with NaN time could be mistaken for a fresh press on its next repeat.
    if (event.pressed) {
      if (this.physicallyDown.indexOf(event.keyCode) < 0) {
        if (this.physicallyDown.length >= LocalShortcutEngine.MAX_PHYSICAL_KEYS) {
          // Fail closed until a fresh engine lifecycle; never keep growing state
          // for an impossible/malformed keyboard stream. F12 remains available.
          this.physicalOverflow = true; this.reset('physical-overflow'); return [];
        }
        this.physicallyDown.push(event.keyCode);
      }
    } else {
      this.physicallyDown = this.physicallyDown.filter(key => key !== event.keyCode);
      this.blockedUntilUp = this.blockedUntilUp.filter(key => key !== event.keyCode);
    }
    if (!this.acceptTime(nowMs)) { return []; }
    if (!isShortcutKey(event.keyCode)) {
      // Unsupported physical keys cannot disappear from the descriptor and turn
      // a superset into a mapped chord. Cancel and quarantine known held keys.
      this.reset('unsupported-key'); return [];
    }
    if (!this.keyboardAllowed()) {
      if (event.pressed && !wasBlocked) { this.blockedUntilUp.push(event.keyCode); }
      return [];
    }
    if (wasBlocked) { return []; }
    let descriptor: number[];
    if (event.pressed) {
      if (this.pressedKeys.indexOf(event.keyCode) < 0) { this.pressedKeys.push(event.keyCode); this.pressedKeys.sort((left, right) => left - right); }
      // Bound descriptor memory independently of the allowed configuration size.
      // More than eight keys cannot match any saved mapping.
      if (this.pressedKeys.length > KeyboardShortcutConfiguration.MAX_KEYS) { this.reset('too-many-keys'); return []; }
      descriptor = this.pressedKeys;
    } else {
      descriptor = this.pressedKeys; this.pressedKeys = [];
      // Explicit OHOS safety divergence: upstream exact-descriptor routing can
      // strand a smaller chord's hold timer/press latch after a superset release.
      // Cancel abandoned smaller states without synthesizing Release or Click.
      // Invalidate their outstanding sequence only, not unrelated mappings.
      for (const item of this.runtime) {
        if (item.mapping.keys.length > 0 && item.mapping.keys.length < descriptor.length &&
          item.mapping.keys.every(key => descriptor.indexOf(key) >= 0)) {
          item.trigger.reset(); item.scheduledSequence = -1;
        }
      }
    }
    const result = this.advanceDue(nowMs);
    if (descriptor.length === 0) { return result; }
    for (const item of this.runtime) {
      if (!item.mapping.enabled || item.mapping.keys.length === 0 || !this.equalKeys(item.mapping.keys, descriptor)) { continue; }
      // A configured chord owns its key event even when an action is delayed,
      // incomplete (empty action list), or already scheduled. Do not activate a
      // focused ArkUI button via an incidental Space/Enter fallback.
      this.handled = true;
      if (item.trigger.update(event.pressed, nowMs)) { this.schedule(item, result); }
    }
    return result;
  }
  advance(nowMs: number, token: number = this.token): ShortcutDispatch[] {
    // A late external timer from a prior context must not mutate the new clock.
    if (token !== this.token || !this.acceptTime(nowMs) || !this.keyboardAllowed()) { return []; }
    return this.advanceDue(nowMs);
  }
  /** Explicit UI action bypasses keyboard-editor/text inhibition. It first
   * cancels pending keyboard sequences. Foreground and focus remain mandatory. */
  dispatchAction(action: ShortcutAction): ShortcutDispatch[] {
    if (!validateShortcutAction(action) || !this.context.foreground || !this.context.focused) { return []; }
    this.reset('touch-action');
    return [this.makeDispatch('', [action], action.id === 'App::Stop')];
  }
  private keyboardAllowed(): boolean {
    return this.configuration.enabled && !this.physicalOverflow &&
      this.physicallyDown.every(key => isShortcutKey(key)) && this.context.foreground && this.context.focused &&
      !this.context.textInput && !this.context.ime && !this.context.capturing;
  }
  private acceptTime(nowMs: number): boolean {
    if (!Number.isFinite(nowMs) || nowMs < 0 || nowMs > Number.MAX_SAFE_INTEGER - KeyboardShortcutConfiguration.MAX_DURATION_MS || nowMs < this.lastTime) {
      this.reset('invalid-clock'); return false;
    }
    this.lastTime = nowMs; return true;
  }
  private equalKeys(left: number[], right: number[]): boolean {
    return left.length === right.length && left.every((key, index) => key === right[index]);
  }
  private advanceDue(nowMs: number): ShortcutDispatch[] {
    const result: ShortcutDispatch[] = [];
    // Preserve timer deadline order after a late host tick, with configured
    // mapping order as the deterministic tie-breaker. One callback per mapping;
    // no catch-up repeat burst exists in any upstream keyboard trigger.
    const due = this.runtime.filter(item => item.trigger.nextDeadlineMs() !== null);
    due.sort((left, right) => {
      const leftTime = left.trigger.nextDeadlineMs(); const rightTime = right.trigger.nextDeadlineMs();
      const difference = (leftTime === null ? Infinity : leftTime) - (rightTime === null ? Infinity : rightTime);
      return difference === 0 ? this.runtime.indexOf(left) - this.runtime.indexOf(right) : difference;
    });
    for (const item of due) {
      if (item.trigger.advance(nowMs)) { this.schedule(item, result); }
    }
    return result;
  }
  private schedule(item: MappingRuntime, result: ShortcutDispatch[]): void {
    if (item.scheduledSequence !== -1 || item.mapping.actions.length === 0) { return; }
    const dispatch = this.makeDispatch(item.mapping.id, item.mapping.actions);
    item.scheduledSequence = dispatch.sequence; result.push(dispatch);
  }
  private makeDispatch(mappingId: string, actions: ShortcutAction[], emergency: boolean = false): ShortcutDispatch {
    return new ShortcutDispatch(mappingId, actions, this.token, ++this.sequence, emergency);
  }
}
