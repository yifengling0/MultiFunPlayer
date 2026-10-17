import { ConfigurationDiagnostic } from '../core/DeviceProfile';
import { validateDeoVrEndpoint } from '../media/deovr/DeoVrTypes';

export type SavedMediaSource = 'internal' | 'deovr' | 'heresphere';

/** Connection preferences only. Never restores a socket, received media path,
 * position, playing state, output permission, or an automatic connection. */
export class DeoVrEndpointConfiguration {
  host: string = '127.0.0.1';
  port: number = 23554;
}

export class HereSphereEndpointConfiguration {
  host: string = '127.0.0.1';
  port: number = 23554;
}

/** Schema 1 gains this section and HereSphere preferences additively on load.
 * Live configurations are complete and exact: credentials/runtime are rejected. */
export class MediaSourceConfiguration {
  static readonly MAX_HOST_LENGTH: number = 253;
  selectedSource: SavedMediaSource = 'internal';
  deoVr: DeoVrEndpointConfiguration = new DeoVrEndpointConfiguration();
  hereSphere: HereSphereEndpointConfiguration = new HereSphereEndpointConfiguration();

  static validate(value: MediaSourceConfiguration): ConfigurationDiagnostic[] {
    try { MediaSourceConfiguration.check(value); return []; }
    catch (error) {
      return [new ConfigurationDiagnostic('mediaSources', 'invalid_media_sources', (error as Error).message)];
    }
  }

  static fromJson(raw: MediaSourceConfiguration | undefined): MediaSourceConfiguration {
    if (raw === undefined) { return new MediaSourceConfiguration(); }
    // Only the newly added section may be absent in an older schema-1 file.
    // A present null, partial or unsafe section must never silently default.
    MediaSourceConfiguration.check(raw, true);
    return MediaSourceConfiguration.copy(raw);
  }

  static clone(value: MediaSourceConfiguration): MediaSourceConfiguration {
    MediaSourceConfiguration.check(value);
    return MediaSourceConfiguration.copy(value);
  }

  private static copy(value: MediaSourceConfiguration): MediaSourceConfiguration {
    const result: MediaSourceConfiguration = new MediaSourceConfiguration();
    result.selectedSource = value.selectedSource;
    result.deoVr.host = value.deoVr.host;
    result.deoVr.port = value.deoVr.port;
    if (value.hereSphere !== undefined) {
      result.hereSphere.host = value.hereSphere.host;
      result.hereSphere.port = value.hereSphere.port;
    }
    return result;
  }

  private static check(value: MediaSourceConfiguration, allowLegacy: boolean = false): void {
    MediaSourceConfiguration.keys(value, ['selectedSource', 'deoVr', 'hereSphere'], 'mediaSources', allowLegacy ? ['hereSphere'] : []);
    if (value.selectedSource !== 'internal' && value.selectedSource !== 'deovr' && value.selectedSource !== 'heresphere') {
      throw new Error('mediaSources.selectedSource must be internal, deovr or heresphere.');
    }
    MediaSourceConfiguration.keys(value.deoVr, ['host', 'port'], 'mediaSources.deoVr');
    validateDeoVrEndpoint({ host: value.deoVr.host, port: value.deoVr.port,
      family: typeof value.deoVr.host === 'string' && value.deoVr.host.indexOf(':') >= 0 ? 2 : 1 });
    if (Object.keys(value).indexOf('hereSphere') >= 0) {
      MediaSourceConfiguration.keys(value.hereSphere, ['host', 'port'], 'mediaSources.hereSphere');
      // Both original players use the same raw TCP endpoint domain. This is
      // validation only; it performs no DNS, connection, playback or output IO.
      validateDeoVrEndpoint({ host: value.hereSphere.host, port: value.hereSphere.port,
        family: typeof value.hereSphere.host === 'string' && value.hereSphere.host.indexOf(':') >= 0 ? 2 : 1 });
    }
  }

  private static keys(value: Object, allowed: string[], path: string, optional: string[] = []): void {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(path + ' must be an object.');
    }
    const keys: string[] = Object.keys(value);
    if (keys.some(key => allowed.indexOf(key) < 0)) {
      throw new Error(path + ' contains an unsupported or unsafe field.');
    }
    if (allowed.some(key => keys.indexOf(key) < 0 && optional.indexOf(key) < 0)) {
      throw new Error(path + ' is missing a required field.');
    }
  }
}
