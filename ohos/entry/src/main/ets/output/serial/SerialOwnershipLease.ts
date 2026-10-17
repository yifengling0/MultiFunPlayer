/** API19 numeric IDs, API26 names and USB bus paths do not prove cross-backend
 * physical identity. Until such a mapping is verified, conservatively allow ONE
 * native serial owner process-wide. Network outputs are unaffected. */
export interface SerialOwnership { acquire(): void; releaseConfirmed(): void; }
export class SerialOwnershipLease implements SerialOwnership {
  private static owner: SerialOwnershipLease | null = null;
  acquire(): void {
    if (SerialOwnershipLease.owner !== null && SerialOwnershipLease.owner !== this) { throw new Error('serialAlreadyOwned'); }
    SerialOwnershipLease.owner = this;
  }
  /** Called by SerialTransport only after native cleanup and watchdog confirmation.
   * A late close after quarantine NEVER releases this process-lifetime lock. */
  releaseConfirmed(): void { if (SerialOwnershipLease.owner === this) { SerialOwnershipLease.owner = null; } }
}
