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
/** Only phone/tablet FULLSCREEN windows use this path. Navigation visibility
 * is not observable in the public SDK; it is never represented as verified. */
export class MobilePresentationSnapshot {
  layoutFullScreen: boolean;
  fullScreen: boolean;
  orientation: number;
  landscape: boolean;
  constructor(layoutFullScreen: boolean, fullScreen: boolean, orientation: number, landscape: boolean) {
    this.layoutFullScreen = layoutFullScreen; this.fullScreen = fullScreen;
    this.orientation = orientation; this.landscape = landscape;
  }
}
export class PresentationSnapshot {
  mode: number;
  immersive: boolean;
  mobile: MobilePresentationSnapshot | undefined;
  constructor(mode: number, immersive: boolean, mobile: MobilePresentationSnapshot | undefined = undefined) {
    this.mode = mode; this.immersive = immersive; this.mobile = mobile;
  }
}
export interface PresentationWindow {
  snapshot(): PresentationSnapshot;
  enter(): Promise<void>;
  recover(): Promise<void>;
  maximizeWindowed(): Promise<void>;
  setImmersive(value: boolean): void;
  setMobileOrientation(value: number): Promise<void>;
  setMobileLayout(value: boolean): Promise<void>;
  setMobileBars(status: boolean, navigation: boolean): Promise<void>;
  waitForMobileLandscape(shouldWait: () => boolean): Promise<void>;
}
// Public WindowStatusType values. The native boundary converts enum values to numbers.
const FULLSCREEN = 1;
const MAXIMIZED = 2;
const FLOATING = 4;
const LANDSCAPE = 2;

export class WindowPresentationController {
  private window: PresentationWindow | undefined = undefined;
  private generation: number = 0;
  private wanted: boolean = false;
  private foreground: boolean = true;
  private queue: Promise<void> = Promise.resolve();
  private baseline: PresentationSnapshot | undefined = undefined;
  private applied: PresentationSnapshot | undefined = undefined;
  private mobileOrientationOwned: boolean = false;
  private mobileLayoutOwned: boolean = false;
  private mobileBarsOwned: boolean = false;
  private mobileUnverifiedOperation: string = '';
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
    this.clearOwnership();
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
        const pending = this.baseline !== undefined && this.baseline.mobile !== undefined &&
          (this.mobileOrientationOwned || this.mobileLayoutOwned || this.mobileBarsOwned);
        this.publish(new WindowPresentationResult(pending ? 'in-window' :
          (this.wanted ? 'in-window' : 'windowed'), pending ?
          'Mobile window state unavailable; retry exit' : 'Window operation unavailable', pending));
      }
    });
    return this.queue.then(() => this.result);
  }
  /** Native mode-change observation: relinquish ownership after an external change. */
  observeMode(mode: number): void {
    if (this.applied && mode !== this.applied.mode) {
      this.clearOwnership();
      this.publish(new WindowPresentationResult(this.wanted ? 'in-window' : 'windowed', 'Window mode changed by the system or user'));
    }
  }
  private clearOwnership(): void {
    this.baseline = undefined; this.applied = undefined;
    this.mobileOrientationOwned = false; this.mobileLayoutOwned = false; this.mobileBarsOwned = false;
    this.mobileUnverifiedOperation = '';
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
    if (before.mobile !== undefined) {
      if (before.mode === FULLSCREEN) { await this.enterMobile(target, generation, before); }
      else { this.publish(new WindowPresentationResult('in-window', 'Mobile fullscreen requires a full-screen main window')); }
      return;
    }
    // A full-screen window mode alone does not prove hidden mobile system bars.
    // Split-screen and unknown-device baselines remain unchanged.
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
  private mobileObservedMode(snapshot: PresentationSnapshot | undefined): PresentationMode {
    return snapshot !== undefined && snapshot.mode === FULLSCREEN && snapshot.mobile !== undefined &&
      snapshot.mobile.layoutFullScreen && snapshot.mobile.fullScreen ? 'native-fullscreen' : 'in-window';
  }
  private observeMobileMutation(observed: PresentationSnapshot, changed: string): void {
    const previous = this.applied;
    if (previous !== undefined && previous.mobile !== undefined && observed.mobile !== undefined) {
      if (changed !== 'orientation' && observed.mobile.orientation !== previous.mobile.orientation) {
        this.mobileOrientationOwned = false;
      }
      if (changed !== 'layout' && observed.mobile.layoutFullScreen !== previous.mobile.layoutFullScreen) {
        this.mobileLayoutOwned = false; this.mobileBarsOwned = false;
      } else if (changed !== 'layout' && changed !== 'bars' &&
        observed.mobile.fullScreen !== previous.mobile.fullScreen) { this.mobileBarsOwned = false; }
    }
    this.applied = observed;
    this.mobileUnverifiedOperation = '';
  }
  private async enterMobile(target: PresentationWindow, generation: number, before: PresentationSnapshot): Promise<void> {
    const mobile = before.mobile;
    if (mobile === undefined) { return; }
    this.baseline = before;
    // A distinct expected state also survives a read failure after a partial setter.
    this.applied = new PresentationSnapshot(before.mode, before.immersive,
      new MobilePresentationSnapshot(mobile.layoutFullScreen, mobile.fullScreen, mobile.orientation, mobile.landscape));
    let failed = false;
    if (mobile.orientation !== LANDSCAPE) {
      this.mobileOrientationOwned = true;
      this.applied.mobile!.orientation = LANDSCAPE;
      this.mobileUnverifiedOperation = 'orientation';
      try { await target.setMobileOrientation(LANDSCAPE); } catch (error) { failed = true; }
      if (generation !== this.generation || this.baseline !== before) { return; }
      const observed = target.snapshot();
      if (observed.mobile !== undefined && observed.mobile.orientation !== LANDSCAPE &&
        observed.mobile.orientation !== mobile.orientation) { this.mobileOrientationOwned = false; }
      this.observeMobileMutation(observed, 'orientation');
      failed = failed || observed.mobile === undefined || observed.mobile.orientation !== LANDSCAPE;
    }
    if (!failed && this.wanted && this.applied.mode === before.mode && !mobile.layoutFullScreen) {
      this.mobileLayoutOwned = true;
      this.applied.mobile!.layoutFullScreen = true;
      this.mobileUnverifiedOperation = 'layout';
      try { await target.setMobileLayout(true); } catch (error) { failed = true; }
      if (generation !== this.generation || this.baseline !== before) { return; }
      this.observeMobileMutation(target.snapshot(), 'layout');
      failed = failed || this.applied.mobile === undefined || !this.applied.mobile.layoutFullScreen ||
        this.applied.mobile.orientation !== LANDSCAPE;
    }
    if (!failed && this.wanted && this.applied.mode === before.mode) {
      this.mobileBarsOwned = true;
      this.applied.mobile!.fullScreen = true;
      this.mobileUnverifiedOperation = 'bars';
      try { await target.setMobileBars(false, false); } catch (error) { failed = true; }
      if (generation !== this.generation || this.baseline !== before) { return; }
      this.observeMobileMutation(target.snapshot(), 'bars');
    }
    if (!failed && this.wanted && this.applied.mode === FULLSCREEN && this.applied.mobile !== undefined &&
      this.applied.mobile.orientation === LANDSCAPE && !this.applied.mobile.landscape) {
      // The orientation setter acknowledges a request before a window resize.
      // Give its actual geometry a bounded event-driven chance to settle.
      await target.waitForMobileLandscape((): boolean => generation === this.generation &&
        this.baseline === before && this.wanted);
      if (generation !== this.generation || this.baseline !== before) { return; }
      this.observeMobileMutation(target.snapshot(), '');
    }
    const after = this.applied;
    const actual = after.mobile;
    if (!failed && this.wanted && after.mode === FULLSCREEN && actual !== undefined &&
      actual.layoutFullScreen && actual.fullScreen && actual.orientation === LANDSCAPE && actual.landscape) {
      this.publish(new WindowPresentationResult('native-fullscreen',
        'Landscape and hidden status bar confirmed; navigation visibility is not observable'));
      return;
    }
    await this.restoreMobile(target, generation);
    if (generation !== this.generation || this.applied !== undefined) { return; }
    if (this.wanted) { this.publish(new WindowPresentationResult('in-window',
      'Mobile fullscreen or landscape not confirmed; restored app window policy')); }
  }
  /** Navigation has no visibility getter. The app owns a visible-navigation exit
   * policy, not an exact restoration of an unknown prior navigation preference.
   * A status bar known to have been hidden in immersive layout stays hidden;
   * otherwise the normal app policy shows it. Restore bars before layout so a
   * silent status-bar no-op remains observable. Orientation is restored exactly. */
  private async restoreMobile(target: PresentationWindow, generation: number): Promise<void> {
    const baseline = this.baseline;
    const applied = this.applied;
    if (baseline === undefined || applied === undefined || baseline.mobile === undefined || applied.mobile === undefined) {
      this.clearOwnership(); this.publish(new WindowPresentationResult('windowed')); return;
    }
    const original = baseline.mobile;
    const expected = applied.mobile;
    let current = target.snapshot();
    if (current.mode !== baseline.mode || current.mobile === undefined) {
      this.clearOwnership();
      this.publish(new WindowPresentationResult('windowed', 'Newer window settings preserved')); return;
    }
    // If a read failed after our setter, its observed baseline/target value is
    // still ours to reconcile. Do not mislabel a partial effect as an external
    // change and abandon the normal bar policy or exact saved orientation.
    if (this.mobileUnverifiedOperation === 'orientation' &&
      (current.mobile.orientation === LANDSCAPE || current.mobile.orientation === original.orientation)) {
      expected.orientation = current.mobile.orientation;
    } else if (this.mobileUnverifiedOperation === 'layout') {
      expected.layoutFullScreen = current.mobile.layoutFullScreen;
      expected.fullScreen = current.mobile.fullScreen;
    } else if (this.mobileUnverifiedOperation === 'bars') {
      expected.fullScreen = current.mobile.fullScreen;
    }
    this.mobileUnverifiedOperation = '';
    let preserved = false;
    let failed = false;
    // Relinquish only the changed setting, so an external rotation does not
    // strand our hidden bars or immersive layout on exit.
    if (current.mobile.orientation !== expected.orientation) { this.mobileOrientationOwned = false; preserved = true; }
    if (current.mobile.layoutFullScreen !== expected.layoutFullScreen) {
      this.mobileLayoutOwned = false; this.mobileBarsOwned = false; preserved = true;
    } else if (current.mobile.fullScreen !== expected.fullScreen) { this.mobileBarsOwned = false; preserved = true; }
    if (this.mobileBarsOwned) {
      const showStatus = !(original.layoutFullScreen && original.fullScreen);
      let rejected = false;
      this.mobileUnverifiedOperation = 'bars';
      try { await target.setMobileBars(showStatus, true); } catch (error) { rejected = true; }
      if (generation !== this.generation || this.baseline !== baseline) { return; }
      current = target.snapshot();
      this.mobileUnverifiedOperation = '';
      if (current.mode !== baseline.mode || current.mobile === undefined) {
        this.clearOwnership(); this.publish(new WindowPresentationResult('windowed', 'Newer window settings preserved')); return;
      }
      // Update only the setting this operation owns, preserving comparisons for
      // orientation/layout changes that may have happened while it was pending.
      expected.fullScreen = current.mobile.fullScreen;
      if (!rejected && (!current.mobile.layoutFullScreen || current.mobile.fullScreen === !showStatus)) {
        this.mobileBarsOwned = false;
      } else if (rejected) { failed = true; }
    }
    if (this.mobileLayoutOwned) {
      if (current.mobile!.layoutFullScreen !== expected.layoutFullScreen) {
        this.mobileLayoutOwned = false; preserved = true;
      } else if (current.mobile!.layoutFullScreen === original.layoutFullScreen) {
        this.mobileLayoutOwned = false;
      } else {
        this.mobileUnverifiedOperation = 'layout';
        try { await target.setMobileLayout(original.layoutFullScreen); } catch (error) { failed = true; }
        if (generation !== this.generation || this.baseline !== baseline) { return; }
        current = target.snapshot();
        this.mobileUnverifiedOperation = '';
        if (current.mode !== baseline.mode || current.mobile === undefined) {
          this.clearOwnership(); this.publish(new WindowPresentationResult('windowed', 'Newer window settings preserved')); return;
        }
        expected.layoutFullScreen = current.mobile.layoutFullScreen;
        expected.fullScreen = current.mobile.fullScreen;
        applied.immersive = current.immersive;
        if (current.mobile.layoutFullScreen === original.layoutFullScreen) { this.mobileLayoutOwned = false; }
      }
    }
    if (this.mobileOrientationOwned) {
      if (current.mobile!.orientation !== expected.orientation) {
        this.mobileOrientationOwned = false; preserved = true;
      } else if (current.mobile!.orientation === original.orientation) {
        this.mobileOrientationOwned = false;
      } else {
        this.mobileUnverifiedOperation = 'orientation';
        try { await target.setMobileOrientation(original.orientation); } catch (error) { failed = true; }
        if (generation !== this.generation || this.baseline !== baseline) { return; }
        current = target.snapshot();
        this.mobileUnverifiedOperation = '';
        if (current.mode !== baseline.mode || current.mobile === undefined) {
          this.clearOwnership(); this.publish(new WindowPresentationResult('windowed', 'Newer window settings preserved')); return;
        }
        expected.orientation = current.mobile.orientation;
        expected.landscape = current.mobile.landscape;
        if (current.mobile.orientation === original.orientation) { this.mobileOrientationOwned = false; }
      }
    }
    const pending = this.mobileOrientationOwned || this.mobileLayoutOwned || this.mobileBarsOwned;
    if (pending) {
      this.publish(new WindowPresentationResult(this.mobileObservedMode(current), failed ?
        'Mobile window restoration failed; retry exit' : 'Mobile window restoration not confirmed; retry exit', true));
      return;
    }
    this.clearOwnership();
    this.publish(new WindowPresentationResult('windowed', preserved ? 'Newer window settings preserved' :
      'Orientation/layout restored; visible-navigation app policy requested (visibility is not observable)'));
  }
  private async restore(target: PresentationWindow, generation: number): Promise<void> {
    const baseline = this.baseline;
    const applied = this.applied;
    if (!baseline || !applied) { this.publish(new WindowPresentationResult('windowed')); return; }
    if (baseline.mobile !== undefined) { await this.restoreMobile(target, generation); return; }
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
