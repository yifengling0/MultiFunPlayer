import { DeoVrSession } from './DeoVrSession';
import { HereSphereSession } from './HereSphereSession';
import { DeoVrMediaSource } from '../media/deovr/DeoVrMediaSource';

export type RemoteSourceKind = 'deovr' | 'heresphere';
/** Distinct process-lifetime sources/factories. Restoring or inspecting this
 * selector is inert; a failed close in either owner blocks source replacement. */
export class RemoteMediaSession {
  static current(kind: RemoteSourceKind): DeoVrMediaSource {
    return kind === 'heresphere' ? HereSphereSession.current() : DeoVrSession.current();
  }
  static allClosed(): boolean {
    return DeoVrSession.current().snapshot().closeConfirmed && HereSphereSession.current().snapshot().closeConfirmed;
  }
  static closeIfReady(): void { DeoVrSession.closeIfReady(); HereSphereSession.closeIfReady(); }
}
