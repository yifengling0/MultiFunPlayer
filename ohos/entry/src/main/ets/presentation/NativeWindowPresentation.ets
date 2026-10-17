import { window } from '@kit.ArkUI';
import { PresentationSnapshot, PresentationWindow, WindowPresentationController,
  WindowPresentationResult } from './WindowPresentation';

class NativePresentationWindow implements PresentationWindow {
  private handle: window.Window;
  constructor(handle: window.Window) { this.handle = handle; }
  snapshot(): PresentationSnapshot {
    return new PresentationSnapshot(this.handle.getWindowStatus(), this.handle.getImmersiveModeEnabledState());
  }
  enter(): Promise<void> { return this.handle.maximize(window.MaximizePresentation.ENTER_IMMERSIVE); }
  recover(): Promise<void> { return this.handle.recover(); }
  maximizeWindowed(): Promise<void> { return this.handle.maximize(window.MaximizePresentation.EXIT_IMMERSIVE); }
  setImmersive(value: boolean): void { this.handle.setImmersiveModeEnabledState(value); }
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
      await NativeWindowPresentation.controller.attach(new NativePresentationWindow(handle));
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
