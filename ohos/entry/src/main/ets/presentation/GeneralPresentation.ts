export class ErrorNotice {
  id: number;
  mode: 'dialog' | 'snackbar';
  message: string;
  expiresAtMs: number;
  constructor(id: number, mode: 'dialog' | 'snackbar', message: string, expiresAtMs: number) {
    this.id = id; this.mode = mode; this.message = message; this.expiresAtMs = expiresAtMs;
  }
}
/** Optional notifications only. The host retains persistent safety indicators. */
export class ErrorPresentation {
  private sequence: number = 0;
  private lastSignature: string = '';
  private active: ErrorNotice | null = null;
  private queued: ErrorNotice | null = null;
  observe(mode: 'none' | 'dialog' | 'snackbar', key: string, message: string, foreground: boolean, nowMs: number): ErrorNotice | null {
    const signature = mode + ':' + key;
    if (!foreground || !Number.isFinite(nowMs) || nowMs < 0) { this.cancel(); this.lastSignature = signature; return null; }
    if (this.active !== null && this.active.mode === 'snackbar' && nowMs >= this.active.expiresAtMs) { this.active = null; }
    if (mode === 'none' || key.length === 0) { this.queued = null; if (mode === 'none') { this.active = null; } }
    if (signature !== this.lastSignature) {
      this.lastSignature = signature;
      if (mode !== 'none' && key.length > 0) {
        const notice = new ErrorNotice(++this.sequence, mode, message.slice(0, 512), nowMs + 5000);
        if (this.active === null) { this.active = notice; } else { this.queued = notice; }
      }
    }
    if (this.active === null && this.queued !== null) {
      this.active = this.queued; this.queued = null; this.active.expiresAtMs = nowMs + 5000;
    }
    return this.active === null ? null : new ErrorNotice(this.active.id, this.active.mode, this.active.message, this.active.expiresAtMs);
  }
  dismiss(id: number): boolean {
    if (this.active === null || this.active.id !== id) { return false; }
    this.active = null; return true;
  }
  cancel(): void { this.sequence++; this.active = null; this.queued = null; }
}

export function horizontalWorkspace(width: number, height: number, orientation: 'auto' | 'vertical' | 'horizontal'): boolean {
  return orientation !== 'vertical' && width >= 720 && (orientation === 'horizontal' || width >= 1200 || width > height);
}
