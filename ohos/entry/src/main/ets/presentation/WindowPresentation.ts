/** Pure lifecycle coordinator; SDK calls belong to NativeWindowPresentation. */
export type PresentationMode = 'windowed' | 'native-fullscreen' | 'in-window';
export class WindowPresentationResult {
  mode: PresentationMode;
  reason: string;
  restorationPending: boolean;
  constructor(mode: PresentationMode, reason: string = '', restorationPending: boolean = false) {
    this.mode = mode; this.reason = reason; this.restorationPending = restorationPending;
  }
}
export class PresentationSnapshot {
  mode: number;
  immersive: boolean;
  constructor(mode: number, immersive: boolean) { this.mode = mode; this.immersive = immersive; }
}
export interface PresentationWindow {
  snapshot(): PresentationSnapshot;
  enter(): Promise<void>;
  recover(): Promise<void>;
  maximizeWindowed(): Promise<void>;
  setImmersive(value: boolean): void;
}
// Public WindowStatusType values. The native boundary converts enum values to numbers.
const FULLSCREEN = 1;
const MAXIMIZED = 2;
const FLOATING = 4;

export class WindowPresentationController {
  private window: PresentationWindow | undefined = undefined;
  private generation: number = 0;
  private wanted: boolean = false;
  private foreground: boolean = true;
  private queue: Promise<void> = Promise.resolve();
  private baseline: PresentationSnapshot | undefined = undefined;
  private applied: PresentationSnapshot | undefined = undefined;
  private result: WindowPresentationResult = new WindowPresentationResult('windowed');
  private listener: ((result: WindowPresentationResult) => void) | undefined = undefined;

  setListener(listener: ((result: WindowPresentationResult) => void) | undefined): void {
    this.listener = listener;
    if (listener) { listener(this.result); }
  }
  attach(window: PresentationWindow): Promise<WindowPresentationResult> {
    const wanted = this.wanted;
    this.invalidate();
    this.window = window;
    return this.request(wanted);
  }
  /** Called only for a destroyed/replaced stage: never call a dead native handle. */
  invalidate(): void {
    this.generation++; this.window = undefined; this.wanted = false;
    // A destroyed stage must not hold a replacement hostage to an unresolved native promise.
    this.queue = Promise.resolve();
    this.baseline = undefined; this.applied = undefined;
    this.publish(new WindowPresentationResult('windowed'));
  }
  setForeground(value: boolean): Promise<WindowPresentationResult> {
    this.foreground = value;
    return this.request(false);
  }
  request(fullscreen: boolean): Promise<WindowPresentationResult> {
    this.wanted = fullscreen && this.foreground;
    const generation = this.generation;
    this.queue = this.queue.then(async () => {
      if (generation !== this.generation) { return; }
      await this.reconcile(generation);
    }).catch(() => {
      if (generation === this.generation) {
        this.publish(new WindowPresentationResult(this.wanted ? 'in-window' : 'windowed', 'Window operation unavailable'));
      }
    });
    return this.queue.then(() => this.result);
  }
  /** Native mode-change observation: relinquish ownership after an external change. */
  observeMode(mode: number): void {
    if (this.applied && mode !== this.applied.mode) {
      this.baseline = undefined; this.applied = undefined;
      this.publish(new WindowPresentationResult(this.wanted ? 'in-window' : 'windowed', 'Window mode changed by the system or user'));
    }
  }
  private publish(result: WindowPresentationResult): void {
    this.result = result;
    if (this.listener) { this.listener(result); }
  }
  private async reconcile(generation: number): Promise<void> {
    const target = this.window;
    if (!target) {
      this.publish(new WindowPresentationResult(this.wanted ? 'in-window' : 'windowed', this.wanted ? 'Main window unavailable' : ''));
      return;
    }
    if (!this.wanted) { await this.restore(target, generation); return; }
    if (this.applied) { return; }
    const before = target.snapshot();
    // A full-screen window mode alone does not prove hidden mobile system bars.
    // Split-screen, mobile and unknown baselines remain unchanged.
    if (before.mode !== FLOATING && before.mode !== MAXIMIZED) {
      this.publish(new WindowPresentationResult('in-window', 'Native immersive transition is unavailable for this window mode'));
      return;
    }
    this.baseline = before;
    try { await target.enter(); } catch (error) {
      if (generation !== this.generation) { return; }
      // A rejected operation may still have changed native state; inspect below.
    }
    if (generation !== this.generation) { return; }
    const after = target.snapshot();
    if (after.mode === FULLSCREEN) {
      this.applied = after;
      if (!this.wanted) { await this.restore(target, generation); return; }
      this.publish(new WindowPresentationResult('native-fullscreen'));
    } else {
      // No successful fullscreen observation: never promise native fullscreen.
      // Roll back a partial maximization only if its exact observed state persists.
      if (after.mode === MAXIMIZED && before.mode === FLOATING) {
        this.applied = after; await this.restore(target, generation);
        if (generation !== this.generation || this.applied !== undefined) { return; }
      }
      else if (after.mode === before.mode && after.immersive !== before.immersive) {
        target.setImmersive(before.immersive);
      }
      this.baseline = undefined;
      if (this.wanted) { this.publish(new WindowPresentationResult('in-window', 'Platform did not enter native fullscreen')); }
    }
  }
  private async restore(target: PresentationWindow, generation: number): Promise<void> {
    const baseline = this.baseline;
    const applied = this.applied;
    if (!baseline || !applied) { this.publish(new WindowPresentationResult('windowed')); return; }
    const now = target.snapshot();
    if (now.mode !== applied.mode || now.immersive !== applied.immersive) {
      this.baseline = undefined; this.applied = undefined;
      this.publish(new WindowPresentationResult('windowed', 'Newer window settings preserved')); return;
    }
    // Clear before awaiting: mode events during our restore must not create work.
    this.baseline = undefined; this.applied = undefined;
    try {
      if (baseline.mode === FLOATING) { await target.recover(); }
      else if (baseline.mode === MAXIMIZED) { await target.maximizeWindowed(); }
      if (generation !== this.generation) { return; }
      const restored = target.snapshot();
      // A resolved promise may be an unsupported no-op. Keep the same observed
      // state owned for an explicit exit retry, rather than claiming restoration.
      if (restored.mode !== baseline.mode && restored.mode === applied.mode && restored.immersive === applied.immersive) {
        this.baseline = baseline; this.applied = applied;
        this.publish(new WindowPresentationResult(restored.mode === FULLSCREEN ? 'native-fullscreen' : 'in-window',
          'Window restoration not confirmed; retry exit', true));
        return;
      }
      // Do not restore over a new user mode or immersive-setting change.
      if (restored.mode === baseline.mode && (restored.immersive === applied.immersive || (baseline.mode === MAXIMIZED && !restored.immersive)) &&
        restored.immersive !== baseline.immersive) { target.setImmersive(baseline.immersive); }
      this.publish(new WindowPresentationResult('windowed', restored.mode === baseline.mode ? '' : 'Window restoration not confirmed'));
    } catch (error) {
      if (generation === this.generation) {
        // Retain ownership only when the exact applied state is still present, allowing explicit retry.
        const current = target.snapshot();
        if (current.mode === applied.mode && current.immersive === applied.immersive) {
          this.baseline = baseline; this.applied = applied;
          this.publish(new WindowPresentationResult(current.mode === FULLSCREEN ? 'native-fullscreen' : 'in-window',
            'Window restoration failed; retry exit', true));
        } else {
          this.publish(new WindowPresentationResult('windowed', 'Window restoration failed; newer window settings preserved'));
        }
      }
    }
  }
}
