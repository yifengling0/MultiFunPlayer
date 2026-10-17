import { DeoVrMediaSource } from '../deovr/DeoVrMediaSource';
import type { DeoVrClock, DeoVrOptions, DeoVrTransportFactory } from '../deovr/DeoVrTypes';
import { HereSphereProtocol } from './HereSphereProtocol';

/** A separate source instance with HereSphere wire semantics. The proven TCP
 * lifecycle, receive provenance, queue and fail-closed cleanup are shared.
 * Construction remains inert and each instance owns its own private evidence. */
export class HereSphereMediaSource extends DeoVrMediaSource {
  constructor(factory: DeoVrTransportFactory, clock: DeoVrClock, options?: DeoVrOptions) {
    super(factory, clock, options, new HereSphereProtocol());
  }
}
