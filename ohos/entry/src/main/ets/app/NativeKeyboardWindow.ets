import { window } from '@kit.ArkUI';
import { KeyboardInputSession } from './KeyboardInputSession';

/** Observes only this Ability's main window. No input hook, capture, media or output side effects. */
export class NativeKeyboardWindow {
  private static owner: number = 0;
  private static foreground: boolean = false;
  private static handle: window.Window | undefined = undefined;
  private static callback: ((event: window.WindowEventType) => void) | undefined = undefined;

  static claimStage(foreground: boolean): number {
    NativeKeyboardWindow.releaseStage(NativeKeyboardWindow.owner);
    const owner = KeyboardInputSession.claimWindow();
    NativeKeyboardWindow.owner = owner; NativeKeyboardWindow.foreground = foreground; return owner;
  }
  static bindStage(owner: number, stage: window.WindowStage): void {
    if (NativeKeyboardWindow.current(owner)) { NativeKeyboardWindow.acquire(stage, owner); }
  }
  static attachStage(stage: window.WindowStage, foreground: boolean): number {
    const owner = NativeKeyboardWindow.claimStage(foreground); NativeKeyboardWindow.bindStage(owner, stage); return owner;
  }
  private static current(owner: number): boolean {
    return owner > 0 && owner === NativeKeyboardWindow.owner && KeyboardInputSession.ownsWindow(owner);
  }
  private static async acquire(stage: window.WindowStage, owner: number): Promise<void> {
    try {
      const handle = await stage.getMainWindow();
      if (!NativeKeyboardWindow.current(owner)) { return; }
      NativeKeyboardWindow.handle = handle;
      const callback = (event: window.WindowEventType): void => {
        if (!NativeKeyboardWindow.current(owner) || NativeKeyboardWindow.handle !== handle) { return; }
        if (event === window.WindowEventType.WINDOW_DESTROYED) {
          NativeKeyboardWindow.releaseStage(owner);
        } else if (event === window.WindowEventType.WINDOW_INACTIVE || event === window.WindowEventType.WINDOW_HIDDEN) {
          KeyboardInputSession.setWindowFocus(owner, false);
        } else if (event === window.WindowEventType.WINDOW_ACTIVE || event === window.WindowEventType.WINDOW_SHOWN) {
          NativeKeyboardWindow.observe(owner);
        }
      };
      // Subscribe before querying to avoid an unobserved focus transition during setup.
      handle.on('windowEvent', callback); NativeKeyboardWindow.callback = callback;
      NativeKeyboardWindow.observe(owner);
    } catch {
      if (NativeKeyboardWindow.current(owner)) { KeyboardInputSession.setWindowFocus(owner, false, false); }
    }
  }
  private static observe(owner: number): void {
    if (!NativeKeyboardWindow.current(owner)) { return; }
    const handle = NativeKeyboardWindow.handle;
    if (!NativeKeyboardWindow.foreground) { KeyboardInputSession.setWindowFocus(owner, false); return; }
    if (handle === undefined || NativeKeyboardWindow.callback === undefined) { KeyboardInputSession.setWindowFocus(owner, false, false); return; }
    try { KeyboardInputSession.setWindowFocus(owner, handle.isFocused()); }
    catch { KeyboardInputSession.setWindowFocus(owner, false, false); }
  }
  static setForeground(owner: number, foreground: boolean): void {
    if (!NativeKeyboardWindow.current(owner)) { return; }
    NativeKeyboardWindow.foreground = foreground; NativeKeyboardWindow.observe(owner);
  }
  static releaseStage(owner: number): void {
    if (!NativeKeyboardWindow.current(owner)) { return; }
    const handle = NativeKeyboardWindow.handle; const callback = NativeKeyboardWindow.callback;
    // Revoke ownership BEFORE invoking SDK cleanup; queued callbacks cannot revive it.
    NativeKeyboardWindow.owner = 0; NativeKeyboardWindow.handle = undefined;
    NativeKeyboardWindow.callback = undefined; NativeKeyboardWindow.foreground = false;
    KeyboardInputSession.releaseWindow(owner);
    if (handle !== undefined && callback !== undefined) { try { handle.off('windowEvent', callback); } catch {} }
  }
}
