import { window } from '@kit.ArkUI';
import { deviceInfo } from '@kit.BasicServicesKit';
import { PresentationSnapshot, PresentationWindow, WindowPresentationController,
  WindowPresentationResult, MobilePresentationSnapshot } from './WindowPresentation';

class NativePresentationWindow implements PresentationWindow {
  private handle: window.Window;
  private mobile: boolean;
  private isAttached: () => boolean;
  constructor(handle: window.Window, isAttached: () => boolean) {
    this.handle = handle;
    this.isAttached = isAttached;
    this.mobile = deviceInfo.deviceType === 'phone' || deviceInfo.deviceType === 'tablet';
  }
  snapshot(): PresentationSnapshot {
    const mode = this.handle.getWindowStatus();
    if (this.mobile) {
      const properties = this.handle.getWindowProperties();
      return new PresentationSnapshot(mode, this.handle.getImmersiveModeEnabledState(),
        new MobilePresentationSnapshot(properties.isLayoutFullScreen, properties.isFullScreen,
          this.handle.getPreferredOrientation(), properties.windowRect.width > properties.windowRect.height));
    }
    return new PresentationSnapshot(mode, this.handle.getImmersiveModeEnabledState());
  }
  enter(): Promise<void> { return this.handle.maximize(window.MaximizePresentation.ENTER_IMMERSIVE); }
  recover(): Promise<void> { return this.handle.recover(); }
  maximizeWindowed(): Promise<void> { return this.handle.maximize(window.MaximizePresentation.EXIT_IMMERSIVE); }
  setImmersive(value: boolean): void { this.handle.setImmersiveModeEnabledState(value); }
  waitForMobileLandscape(shouldWait: () => boolean): Promise<void> {
    if (!this.isAttached() || !shouldWait()) { return Promise.resolve(); }
    return new Promise<void>((resolve: () => void): void => {
      let finished = false;
      let timer: number = -1;
      let poll: number = -1;
      const finish = (): void => {
        if (finished) { return; }
        finished = true;
        if (timer >= 0) { clearTimeout(timer); }
        if (poll >= 0) { clearInterval(poll); }
        // A destroyed handle must never be touched, even to remove a listener.
        if (this.isAttached()) {
          try { this.handle.off('windowSizeChange', onSize); } catch (error) {}
        }
        resolve();
      };
      const check = (): void => {
        if (finished) { return; }
        if (!this.isAttached() || !shouldWait()) { finish(); return; }
        try {
          const rect = this.handle.getWindowProperties().windowRect;
          if (rect.width > rect.height) { finish(); }
        } catch (error) { finish(); }
      };
      const onSize = (_size: window.Size): void => { check(); };
      try { this.handle.on('windowSizeChange', onSize); } catch (error) {
        // Bounded polling also supports runtimes without size-change events.
      }
      if (finished) { return; }
      timer = setTimeout(finish, 750);
      // The event is the fast path; polling observes cancellation promptly and
      // catches a resize that raced listener registration or is not delivered.
      poll = setInterval(check, 25);
      check();
    });
  }
  setMobileOrientation(value: number): Promise<void> { return this.handle.setPreferredOrientation(value); }
  setMobileLayout(value: boolean): Promise<void> { return this.handle.setWindowLayoutFullScreen(value); }
  setMobileBars(status: boolean, navigation: boolean): Promise<void> {
    const names: Array<'status' | 'navigation'> = [];
    if (status) { names.push('status'); }
    if (navigation) { names.push('navigation'); }
    return this.handle.setWindowSystemBarEnable(names);
  }
}

/** One owner for the actual EntryAbility main window; never use getLastWindow. */
export class NativeWindowPresentation {
  private static controller: WindowPresentationController = new WindowPresentationController();
  private static stageGeneration: number = 0;
  private static handle: window.Window | undefined = undefined;
  private static ownerToken: number = 0;
  private static listener: ((result: WindowPresentationResult) => void) | undefined = undefined;
  private static currentResult: WindowPresentationResult = new WindowPresentationResult('windowed');
  private static observingResults: boolean = false;
  private static observeResults(): void {
    if (NativeWindowPresentation.observingResults) { return; }
    NativeWindowPresentation.observingResults = true;
    NativeWindowPresentation.controller.setListener((result: WindowPresentationResult): void => {
      NativeWindowPresentation.currentResult = result;
      const listener = NativeWindowPresentation.listener;
      if (listener !== undefined) { listener(result); }
    });
  }
  static async attachStage(stage: window.WindowStage): Promise<void> {
    NativeWindowPresentation.destroyStage();
    const generation = NativeWindowPresentation.stageGeneration;
    try {
      const handle = await stage.getMainWindow();
      if (generation !== NativeWindowPresentation.stageGeneration) { return; }
      NativeWindowPresentation.handle = handle;
      await NativeWindowPresentation.controller.attach(new NativePresentationWindow(handle, (): boolean => generation === NativeWindowPresentation.stageGeneration));
      if (generation !== NativeWindowPresentation.stageGeneration) { return; }
      try { handle.on('windowStatusDidChange', (mode: window.WindowStatusType): void => {
        if (generation === NativeWindowPresentation.stageGeneration) {
          try {
            // Ignore a delayed event superseded by a newer native transition.
            if (handle.getWindowStatus() === mode) { NativeWindowPresentation.controller.observeMode(mode); }
          } catch (error) {}
        }
      }); } catch (error) {
        // Exit still compares the actual native state before any restoration.
      }
    } catch (error) { console.warn('MultiFunPlayer main window presentation unavailable'); }
  }
  /** A new page supersedes every older page token, including its late cleanup. */
  static setListener(listener: ((result: WindowPresentationResult) => void) | undefined): number {
    NativeWindowPresentation.observeResults();
    const token = ++NativeWindowPresentation.ownerToken;
    NativeWindowPresentation.listener = listener;
    if (listener !== undefined) { listener(NativeWindowPresentation.currentResult); }
    return token;
  }
  static requestForOwner(token: number, fullscreen: boolean): Promise<WindowPresentationResult> {
    NativeWindowPresentation.observeResults();
    if (token !== NativeWindowPresentation.ownerToken || NativeWindowPresentation.listener === undefined) {
      return Promise.resolve(NativeWindowPresentation.currentResult);
    }
    return NativeWindowPresentation.request(fullscreen);
  }
  /** Only the active page may release presentation; never detach a newer page. */
  static releaseOwner(token: number): Promise<WindowPresentationResult> {
    NativeWindowPresentation.observeResults();
    if (token !== NativeWindowPresentation.ownerToken || NativeWindowPresentation.listener === undefined) {
      return Promise.resolve(NativeWindowPresentation.currentResult);
    }
    NativeWindowPresentation.ownerToken++;
    NativeWindowPresentation.listener = undefined;
    return NativeWindowPresentation.request(false);
  }
  /** Unscoped lifecycle/compatibility API. Page controls use requestForOwner. */
  static request(fullscreen: boolean): Promise<WindowPresentationResult> {
    NativeWindowPresentation.observeResults();
    return NativeWindowPresentation.controller.request(fullscreen);
  }
  static setForeground(value: boolean): Promise<WindowPresentationResult> {
    NativeWindowPresentation.observeResults();
    return NativeWindowPresentation.controller.setForeground(value);
  }
  /** OnWindowStageDestroy: the window is already unusable; only invalidate. */
  static destroyStage(): void {
    NativeWindowPresentation.observeResults();
    NativeWindowPresentation.stageGeneration++;
    NativeWindowPresentation.ownerToken++;
    NativeWindowPresentation.listener = undefined;
    NativeWindowPresentation.handle = undefined;
    NativeWindowPresentation.controller.invalidate();
  }
}
