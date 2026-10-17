import { KeyboardShortcutMapping } from './ShortcutConfiguration';

/** Deterministic projection of upstream ButtonPress/Release/Click/HoldShortcut.
 * The host advances a monotonic clock; this class owns no OS timer. At an equal
 * timestamp the host services a due timer before processing a key transition.
 * Null (rather than Environment.TickCount == 0) allows a clock starting at zero. */
export class ButtonShortcutState {
  private mapping: KeyboardShortcutMapping;
  private lastPressed: boolean = false;
  private stateCounter: number = 0;
  private pressTime: number | null = null;
  private deadline: number | null = null;
  constructor(mapping: KeyboardShortcutMapping) { this.mapping = mapping; }

  update(pressed: boolean, nowMs: number): boolean {
    if (this.mapping.trigger === 'press') {
      const wasPressed = !this.lastPressed && pressed; this.lastPressed = pressed;
      return pressed && (this.mapping.handleRepeating || wasPressed);
    }
    if (this.mapping.trigger === 'release') {
      const wasReleased = this.lastPressed && !pressed; this.lastPressed = pressed;
      return !pressed && (this.mapping.handleRepeating || wasReleased);
    }
    if (this.mapping.trigger === 'click') {
      if (pressed && this.stateCounter % 2 === 0) { this.stateCounter++; this.deadline = null; }
      else if (!pressed && this.stateCounter % 2 === 1) {
        // Once the requested count is exceeded it cannot match until timeout.
        // Saturation preserves parity without unbounded state accumulation.
        this.stateCounter = Math.min(this.stateCounter + 1, 2 * this.mapping.clickCount + 2);
        this.deadline = nowMs + this.mapping.maximumClickIntervalMs;
      }
      return false;
    }
    if (pressed && this.pressTime === null) {
      this.pressTime = nowMs;
      if (this.mapping.holdInvoke === 'holding') { this.deadline = nowMs + this.mapping.minimumHoldDurationMs; }
    } else if (!pressed && this.pressTime !== null) {
      const duration = nowMs - this.pressTime; this.pressTime = null;
      if (this.mapping.holdInvoke === 'holding') { this.deadline = null; }
      else {
        return duration >= this.mapping.minimumHoldDurationMs &&
          !(this.mapping.maximumHoldDurationMs > this.mapping.minimumHoldDurationMs && duration > this.mapping.maximumHoldDurationMs);
      }
    }
    return false;
  }
  advance(nowMs: number): boolean {
    if (this.deadline === null || nowMs < this.deadline) { return false; }
    this.deadline = null;
    if (this.mapping.trigger === 'click') {
      const invoke = this.stateCounter === 2 * this.mapping.clickCount; this.stateCounter = 0; return invoke;
    }
    // WhileHolding is a single delayed call, not a repeating action. Upstream
    // intentionally does not apply MaximumHoldDuration to this invocation mode.
    return this.mapping.trigger === 'hold' && this.mapping.holdInvoke === 'holding' && this.pressTime !== null;
  }
  nextDeadlineMs(): number | null { return this.deadline; }
  reset(): void { this.lastPressed = false; this.stateCounter = 0; this.pressTime = null; this.deadline = null; }
}
