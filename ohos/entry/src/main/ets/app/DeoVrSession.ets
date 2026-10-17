import { systemDateTime } from '@kit.BasicServicesKit';
import { DeoVrMediaSource } from '../media/deovr/DeoVrMediaSource';
import { NativeDeoVrTransportFactory } from '../media/deovr/NativeDeoVrTransport';
import type { DeoVrClock, DeoVrSnapshot, DeoVrEvent } from '../media/deovr/DeoVrTypes';

class SourceClock implements DeoVrClock {
  nowMs(): number { return systemDateTime.getUptime(systemDateTime.TimeType.STARTUP, false); }
  scheduleAt(at: number, callback: () => void): number { return setTimeout(callback, Math.max(0, at - this.nowMs())); }
  cancel(handle: number): void { clearTimeout(handle); }
}
/** App-lifetime owner keeps failed native close quarantine across view/Ability
 * recreation. Construction and saved settings restoration perform no network IO. */
export class DeoVrSession {
  private static instance: DeoVrMediaSource | null = null;
  static current(): DeoVrMediaSource {
    if (DeoVrSession.instance === null) { DeoVrSession.instance = new DeoVrMediaSource(new NativeDeoVrTransportFactory(), new SourceClock()); }
    return DeoVrSession.instance;
  }
  static closeIfReady(): void {
    if (DeoVrSession.instance !== null) { DeoVrSession.instance.disconnect().catch(() => {}); }
  }
}
