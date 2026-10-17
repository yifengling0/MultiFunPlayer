import { SerialProbeError } from '../output/serial/SerialProbeTypes';
import type { SerialProbeReport } from '../output/serial/SerialProbeTypes';
import type { SerialSelection } from '../output/serial/SerialDiscoveryTypes';

export interface SerialProbePort {
  probeReadOnly(selection: SerialSelection, isCurrent: () => boolean): Promise<SerialProbeReport>;
}
export class SerialDiagnosticSnapshot {
  busy: boolean = false;
  closeConfirmed: boolean = true;
  quarantined: boolean = false;
  phase: string = 'idle';
  diagnosticCode: string = '';
  report: string = '';
}
/** Volatile process owner. Cancel invalidates permission to continue, never
 * pretends an issued native request was aborted or its handle was closed. */
export class SerialDiagnosticSession {
  private static owner: number = 0;
  private static ownerSequence: number = 0;
  private static request: number = 0;
  private static foreground: boolean = true;
  private static state: SerialDiagnosticSnapshot = new SerialDiagnosticSnapshot();
  static claimOwner(): number { this.cancelIfReady(); this.owner = ++this.ownerSequence; return this.owner; }
  static owns(owner: number): boolean { return owner > 0 && owner === this.owner; }
  static releaseOwner(owner: number): void { if (this.owns(owner)) { this.cancelIfReady(); this.owner = 0; } }
  static snapshot(): SerialDiagnosticSnapshot { return Object.assign(new SerialDiagnosticSnapshot(), this.state); }
  static blocked(): boolean { return this.state.busy || !this.state.closeConfirmed || this.state.quarantined; }
  static cancel(owner: number): void { if (this.owns(owner)) { this.cancelIfReady(); } }
  static cancelIfReady(): void { this.request++; if (this.state.busy) { this.state.phase = 'cancelling'; } else if (this.state.report.length > 0) { this.state.phase = 'cancelled'; } this.state.report = ''; }
  static setForeground(value: boolean): void { this.foreground = value; if (!value) { this.cancelIfReady(); } }
  static async run(owner: number, port: SerialProbePort, selection: SerialSelection,
    isCurrent: () => boolean, outputsQuiet: boolean): Promise<SerialDiagnosticSnapshot> {
    if (!this.owns(owner) || !this.foreground || this.blocked() || !outputsQuiet || !isCurrent() ||
      selection.backend !== 'ch34xWriteOnly') { throw new Error('serialProbeNotAdmitted'); }
    const saved: SerialSelection = { backend: selection.backend, portName: selection.portName, portId: selection.portId };
    const request = ++this.request;
    this.state = new SerialDiagnosticSnapshot(); this.state.busy = true;
    this.state.closeConfirmed = false; this.state.phase = 'probing';
    const current = (): boolean => request === this.request && this.owns(owner) && this.foreground && isCurrent();
    try {
      const report = await port.probeReadOnly(saved, current);
      if (report.closeConfirmed !== true || report.quarantined !== false || report.readOnly !== true || report.status !== 'success') {
        throw new SerialProbeError('invalidSerialProbeResult', false);
      }
      this.state.closeConfirmed = true;
      this.state.phase = current() ? 'completed' : 'cancelled';
      if (current()) { this.state.report = JSON.stringify(report, null, 2); }
    } catch (error) {
      const confirmed = error instanceof SerialProbeError && error.closeConfirmed && !error.quarantined;
      this.state.closeConfirmed = confirmed; this.state.quarantined = !confirmed;
      this.state.phase = !confirmed ? 'quarantined' : current() ? 'failed' : 'cancelled';
      this.state.diagnosticCode = error instanceof SerialProbeError ? error.diagnosticCode : 'serialProbeUnconfirmed';
      this.state.report = '';
    } finally { this.state.busy = false; }
    return this.snapshot();
  }
}
