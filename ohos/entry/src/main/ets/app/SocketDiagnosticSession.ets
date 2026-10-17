import { NativeSocketDiagnostic } from '../output/diagnostics/NativeSocketDiagnostic';
import type { SocketDiagnosticRequest, SocketDiagnosticSnapshot } from '../output/diagnostics/SocketDiagnostic';
import { OutputTargetCollection } from '../output/OutputTargetCollection';

/** Process-wide owner: a page remount cannot forget an unconfirmed socket close.
 * Page ownership and foreground are volatile; nothing starts on restoration. */
export class SocketDiagnosticSession {
  private static instance: NativeSocketDiagnostic | null = null;
  private static foreground: boolean = true;
  private static sequence: number = 0;
  private static owner: number = 0;
  private static current(): NativeSocketDiagnostic {
    if (SocketDiagnosticSession.instance === null) {
      SocketDiagnosticSession.instance = new NativeSocketDiagnostic();
      SocketDiagnosticSession.instance.setForeground(SocketDiagnosticSession.foreground);
    }
    return SocketDiagnosticSession.instance;
  }
  static claimOwner(): number {
    SocketDiagnosticSession.cancelIfReady();
    SocketDiagnosticSession.owner = ++SocketDiagnosticSession.sequence;
    return SocketDiagnosticSession.owner;
  }
  static owns(owner: number): boolean { return owner > 0 && owner === SocketDiagnosticSession.owner; }
  static releaseOwner(owner: number): void {
    if (!SocketDiagnosticSession.owns(owner)) { return; }
    SocketDiagnosticSession.cancelIfReady(); SocketDiagnosticSession.owner = 0;
  }
  static snapshot(): SocketDiagnosticSnapshot { return SocketDiagnosticSession.current().snapshot(); }
  static blocked(): boolean {
    if (SocketDiagnosticSession.instance === null) { return false; }
    const state = SocketDiagnosticSession.instance.snapshot();
    return state.busy || !state.closeConfirmed || state.quarantined;
  }
  static outputsQuiet(outputs: OutputTargetCollection): boolean {
    for (const id of outputs.ids()) {
      const target = outputs.get(id);
      if (target === null || outputs.isRemoving(id) || target.isBusy()) { return false; }
      const state = target.status();
      if (state !== null && (state.connection !== 'disconnected' || state.armed || !state.closeConfirmed)) { return false; }
    }
    return true;
  }
  static async run(owner: number, request: SocketDiagnosticRequest, outputs: OutputTargetCollection): Promise<SocketDiagnosticSnapshot> {
    if (!SocketDiagnosticSession.owns(owner) || !SocketDiagnosticSession.foreground ||
      !SocketDiagnosticSession.outputsQuiet(outputs)) {
      throw new Error('诊断需要当前前台页面，且所有设备输出已确认断开。');
    }
    // run() closes the interlock synchronously before its first asynchronous I/O.
    return SocketDiagnosticSession.current().run(request);
  }
  static cancel(owner: number): void { if (SocketDiagnosticSession.owns(owner)) { SocketDiagnosticSession.cancelIfReady(); } }
  static cancelIfReady(): void { if (SocketDiagnosticSession.instance !== null) { void SocketDiagnosticSession.instance.cancel(); } }
  static setForeground(value: boolean): void {
    SocketDiagnosticSession.foreground = value;
    if (SocketDiagnosticSession.instance !== null) { SocketDiagnosticSession.instance.setForeground(value); }
  }
}
