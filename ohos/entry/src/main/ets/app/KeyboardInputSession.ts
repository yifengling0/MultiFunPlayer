export interface KeyboardNativeKey { keyCode: number; type: number; }
/** Focus and emergency-key routing only; never stores typed text or key history. */
export class KeyboardInputSession {
  private static sequence: number = 0;
  private static listenerOwner: number = 0;
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
  static setListener(editing: (value: boolean) => void, emergency: (keyCode: number, pressed: boolean) => boolean): number {
    const owner = ++KeyboardInputSession.sequence; KeyboardInputSession.listenerOwner = owner;
    KeyboardInputSession.onEditing = editing; KeyboardInputSession.onEmergency = emergency;
    editing(KeyboardInputSession.isEditing()); return owner;
  }
  static releaseListener(owner: number): void {
    if (owner !== KeyboardInputSession.listenerOwner) { return; }
    KeyboardInputSession.onEditing = null; KeyboardInputSession.onEmergency = null; KeyboardInputSession.listenerOwner = 0;
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
    return (event: KeyboardNativeKey): boolean => {
      if (KeyboardInputSession.activeEditors.indexOf(id) < 0 || (event.type !== 0 && event.type !== 1)) { return false; }
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
