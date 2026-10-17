export interface KeyboardNativeKey { keyCode: number; type: number; }
/** Focus and emergency-key routing only; never stores typed text or key history. */
export class KeyboardInputSession {
  private static sequence: number = 0;
  private static listenerOwner: number = 0;
  private static windowOwner: number = 0;
  private static windowFocused: boolean = false;
  private static windowAvailable: boolean = false;
  private static onCancel: (() => void) | null = null;
  /** Only the native main-window observer may publish window focus. Page life is separate. */
  static claimWindow(): number {
    const owner = ++KeyboardInputSession.sequence; KeyboardInputSession.windowOwner = owner;
    KeyboardInputSession.setWindowFocus(owner, false, false); return owner;
  }
  static ownsWindow(owner: number): boolean { return owner > 0 && owner === KeyboardInputSession.windowOwner; }
  static setWindowFocus(owner: number, focused: boolean, available: boolean = true): void {
    if (!KeyboardInputSession.ownsWindow(owner)) { return; }
    const next = available === true && focused === true;
    const changed = next !== KeyboardInputSession.windowFocused || available !== KeyboardInputSession.windowAvailable;
    KeyboardInputSession.windowFocused = next; KeyboardInputSession.windowAvailable = available;
    if (changed && KeyboardInputSession.onEditing !== null) {
      // Re-evaluate input context even when text-editor focus itself is unchanged.
      KeyboardInputSession.onEditing(KeyboardInputSession.isEditing());
    }
  }
  static releaseWindow(owner: number): void {
    if (!KeyboardInputSession.ownsWindow(owner)) { return; }
    KeyboardInputSession.setWindowFocus(owner, false, false); KeyboardInputSession.windowOwner = 0;
  }
  static isWindowFocused(): boolean { return KeyboardInputSession.windowFocused; }
  static windowFocusMessage(): string {
    if (!KeyboardInputSession.windowAvailable) { return '无法确认主窗口焦点，快捷键已暂停；请重新打开应用窗口。'; }
    return KeyboardInputSession.windowFocused ? '' : '窗口未获焦点，快捷键已暂停；返回后请松开原按键，再重新按下。';
  }
  static ownsListener(owner: number): boolean { return owner > 0 && owner === KeyboardInputSession.listenerOwner; }
  static cancelNativeEvent(): void { if (KeyboardInputSession.onCancel !== null) { KeyboardInputSession.onCancel(); } }

  private static editors: number[] = [];
  private static activeEditors: number[] = [];
  private static onEditing: ((editing: boolean) => void) | null = null;
  private static onEmergency: ((keyCode: number, pressed: boolean) => boolean) | null = null;
  static newEditorId(): number { const id = ++KeyboardInputSession.sequence; KeyboardInputSession.activeEditors.push(id); return id; }
  static renewEditor(id: number): number {
    const focused = KeyboardInputSession.editors.indexOf(id) >= 0;
    const next = KeyboardInputSession.newEditorId();
    KeyboardInputSession.activeEditors = KeyboardInputSession.activeEditors.filter(value => value !== id);
    KeyboardInputSession.editors = KeyboardInputSession.editors.filter(value => value !== id);
    if (focused) { KeyboardInputSession.editors.push(next); }
    return next;
  }
  static changeHandler(id: number, change: (text: string) => void): (text: string) => void {
    return (text: string): void => { if (KeyboardInputSession.activeEditors.indexOf(id) >= 0) { change(text); } };
  }
  static submitHandler(id: number, commit: () => void): () => void {
    return (): void => { if (KeyboardInputSession.activeEditors.indexOf(id) >= 0) { commit(); } };
  }
  static setListener(editing: (value: boolean) => void, emergency: (keyCode: number, pressed: boolean) => boolean, cancel: (() => void) | null = null): number {
    // Replacing the native entry points must also retire the previous page's
    // already-awaiting batch and held deadlines, not only future callbacks.
    const previousCancel = KeyboardInputSession.onCancel; KeyboardInputSession.onCancel = null;
    if (previousCancel !== null) { previousCancel(); }
    const owner = ++KeyboardInputSession.sequence; KeyboardInputSession.listenerOwner = owner;
    KeyboardInputSession.onEditing = editing; KeyboardInputSession.onEmergency = emergency; KeyboardInputSession.onCancel = cancel;
    editing(KeyboardInputSession.isEditing()); return owner;
  }
  static releaseListener(owner: number): void {
    if (owner !== KeyboardInputSession.listenerOwner) { return; }
    KeyboardInputSession.onEditing = null; KeyboardInputSession.onEmergency = null; KeyboardInputSession.onCancel = null; KeyboardInputSession.listenerOwner = 0;
  }
  static setEditorFocus(id: number, focused: boolean): void {
    if (!Number.isSafeInteger(id) || id <= 0 || KeyboardInputSession.activeEditors.indexOf(id) < 0) { return; }
    const previous = KeyboardInputSession.isEditing();
    if (focused && KeyboardInputSession.editors.indexOf(id) < 0) { KeyboardInputSession.editors.push(id); }
    if (!focused) { KeyboardInputSession.editors = KeyboardInputSession.editors.filter(value => value !== id); }
    if (previous !== KeyboardInputSession.isEditing() && KeyboardInputSession.onEditing !== null) {
      KeyboardInputSession.onEditing(KeyboardInputSession.isEditing());
    }
  }
  static releaseEditor(id: number): void { KeyboardInputSession.setEditorFocus(id, false); KeyboardInputSession.activeEditors = KeyboardInputSession.activeEditors.filter(value => value !== id); }
  static focusHandler(id: number, focused: boolean): () => void {
    return (): void => { KeyboardInputSession.setEditorFocus(id, focused); };
  }
  static blurHandler(id: number, commit: () => void): () => void {
    return (): void => {
      if (KeyboardInputSession.activeEditors.indexOf(id) < 0) { return; }
      KeyboardInputSession.setEditorFocus(id, false); commit();
    };
  }
  static emergencyHandler(id: number): (event: KeyboardNativeKey) => boolean {
    const owner = KeyboardInputSession.listenerOwner;
    return (event: KeyboardNativeKey): boolean => {
      if (!KeyboardInputSession.ownsListener(owner) || KeyboardInputSession.activeEditors.indexOf(id) < 0) { return false; }
      // API26 CANCEL and unknown phases retire input without synthesizing Up/Click.
      // Comparing old Down/Up numeric values avoids a new runtime enum dependency.
      if (event.type !== 0 && event.type !== 1) { KeyboardInputSession.cancelNativeEvent(); return false; }
      if (event.keyCode === 2101) { return KeyboardInputSession.handleEmergencyKey(event.keyCode, event.type === 0); }
      // IME may consume the event before root dispatch. Observe physical transitions
      // under the inhibited text context, never keyText, and never consume typing.
      if (KeyboardInputSession.editors.indexOf(id) >= 0 && KeyboardInputSession.onEmergency !== null) {
        KeyboardInputSession.onEmergency(event.keyCode, event.type === 0);
      }
      return false;
    };
  }
  static isEditing(): boolean { return KeyboardInputSession.editors.length > 0; }
  static handleEmergencyKey(keyCode: number, pressed: boolean): boolean {
    // Installed SDK KeyCode.KEYCODE_F12. All other text/IME keys stay private to the field.
    return keyCode === 2101 && KeyboardInputSession.onEmergency !== null && KeyboardInputSession.onEmergency(keyCode, pressed);
  }
}
