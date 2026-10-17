import { ConfigurationDiagnostic } from '../core/DeviceProfile';
import { validateDeoVrEndpoint } from '../media/deovr/DeoVrTypes';

export type SavedMediaSource = 'internal' | 'deovr';

/** Connection preferences only. Never restores a socket, received media path,
 * position, playing state, output permission, or an automatic connection. */
export class DeoVrEndpointConfiguration {
  host: string = '127.0.0.1';
  port: number = 23554;
}

/** Schema 1 gains this whole section additively. A present section must be
 * complete and exact: future keys, credentials and runtime state are rejected. */
export class MediaSourceConfiguration {
  static readonly MAX_HOST_LENGTH: number = 253;
  selectedSource: SavedMediaSource = 'internal';
  deoVr: DeoVrEndpointConfiguration = new DeoVrEndpointConfiguration();

  static validate(value: MediaSourceConfiguration): ConfigurationDiagnostic[] {
    try { MediaSourceConfiguration.check(value); return []; }
    catch (error) {
      return [new ConfigurationDiagnostic('mediaSources', 'invalid_media_sources', (error as Error).message)];
    }
  }

  static fromJson(raw: MediaSourceConfiguration | undefined): MediaSourceConfiguration {
    return raw === undefined ? new MediaSourceConfiguration() : MediaSourceConfiguration.clone(raw);
  }

  static clone(value: MediaSourceConfiguration): MediaSourceConfiguration {
    MediaSourceConfiguration.check(value);
    const result: MediaSourceConfiguration = new MediaSourceConfiguration();
    result.selectedSource = value.selectedSource;
    result.deoVr.host = value.deoVr.host;
    result.deoVr.port = value.deoVr.port;
    return result;
  }

  private static check(value: MediaSourceConfiguration): void {
    MediaSourceConfiguration.keys(value, ['selectedSource', 'deoVr'], 'mediaSources');
    if (value.selectedSource !== 'internal' && value.selectedSource !== 'deovr') {
      throw new Error('mediaSources.selectedSource must be internal or deovr.');
    }
    MediaSourceConfiguration.keys(value.deoVr, ['host', 'port'], 'mediaSources.deoVr');
    validateDeoVrEndpoint({ host: value.deoVr.host, port: value.deoVr.port,
      family: typeof value.deoVr.host === 'string' && value.deoVr.host.indexOf(':') >= 0 ? 2 : 1 });
  }

  private static keys(value: Object, allowed: string[], path: string): void {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(path + ' must be an object.');
    }
    const keys: string[] = Object.keys(value);
    if (keys.some(key => allowed.indexOf(key) < 0)) {
      throw new Error(path + ' contains an unsupported or unsafe field.');
    }
    if (allowed.some(key => keys.indexOf(key) < 0)) {
      throw new Error(path + ' is missing a required field.');
    }
  }
}
