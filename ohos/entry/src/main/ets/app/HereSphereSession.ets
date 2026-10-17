import { systemDateTime } from '@kit.BasicServicesKit';
import { HereSphereMediaSource } from '../media/heresphere/HereSphereMediaSource';
import { NativeDeoVrTransportFactory } from '../media/deovr/NativeDeoVrTransport';
import type { DeoVrClock, DeoVrSnapshot, DeoVrEvent } from '../media/deovr/DeoVrTypes';

class SourceClock implements DeoVrClock {
  nowMs(): number { return systemDateTime.getUptime(systemDateTime.TimeType.STARTUP, false); }
  scheduleAt(at: number, callback: () => void): number { return setTimeout(callback, Math.max(0, at - this.nowMs())); }
  cancel(handle: number): void { clearTimeout(handle); }
}
/** App-lifetime owner keeps failed native close quarantine across view/Ability
 * recreation. Construction and saved settings restoration perform no network IO. */
export class HereSphereSession {
  private static instance: HereSphereMediaSource | null = null;
  static current(): HereSphereMediaSource {
    if (HereSphereSession.instance === null) { HereSphereSession.instance = new HereSphereMediaSource(new NativeDeoVrTransportFactory(), new SourceClock()); }
    return HereSphereSession.instance;
  }
  static closeIfReady(): void {
    if (HereSphereSession.instance !== null) { HereSphereSession.instance.disconnect().catch(() => {}); }
  }
}
