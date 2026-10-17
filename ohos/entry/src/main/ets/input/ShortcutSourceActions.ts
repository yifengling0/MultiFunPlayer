import { ShortcutAction, cloneShortcutAction } from './ShortcutConfiguration';
import type { SavedMediaSource } from '../settings/MediaSourceConfiguration';
import { parseDeoVrEndpointText } from '../media/deovr/DeoVrScriptMatch';

export type MediaSourceShortcutKind = 'endpoint' | 'connection';
export type MediaSourceConnectionCommand = 'toggle' | 'connect' | 'disconnect';
export interface MediaSourceShortcutEndpoint { host: string; port: number; }

/** Intent only. The owner still checks lifecycle, exact source and connection
 * state, and waits for retirement before activating another source. No IO. */
export class MediaSourceShortcut {
  readonly kind: MediaSourceShortcutKind;
  readonly source: SavedMediaSource;
  readonly command: MediaSourceConnectionCommand | null;
  readonly endpoint: MediaSourceShortcutEndpoint | null;
  constructor(kind: MediaSourceShortcutKind, source: SavedMediaSource,
    command: MediaSourceConnectionCommand | null = null, endpoint: MediaSourceShortcutEndpoint | null = null) {
    this.kind = kind; this.source = source; this.command = command;
    this.endpoint = endpoint === null ? null : { host: endpoint.host, port: endpoint.port };
  }
}

/** Concrete names from HereSphere/DeoVR endpoint registration and the original
 * MediaSourceViewModel per-source connection callbacks. The source is encoded
 * in the exact action ID; never infer it from the currently selected source. */
export function parseMediaSourceShortcut(rawAction: ShortcutAction): MediaSourceShortcut | null {
  const action: ShortcutAction = cloneShortcutAction(rawAction);
  switch (action.id) {
    case 'DeoVR::Endpoint::Set':
      return new MediaSourceShortcut('endpoint', 'deovr', null, parseDeoVrEndpointText(action.text));
    case 'HereSphere::Endpoint::Set':
      return new MediaSourceShortcut('endpoint', 'heresphere', null, parseDeoVrEndpointText(action.text));
    case 'Internal::Connection::Toggle': return new MediaSourceShortcut('connection', 'internal', 'toggle');
    case 'Internal::Connection::Connect': return new MediaSourceShortcut('connection', 'internal', 'connect');
    case 'Internal::Connection::Disconnect': return new MediaSourceShortcut('connection', 'internal', 'disconnect');
    case 'DeoVR::Connection::Toggle': return new MediaSourceShortcut('connection', 'deovr', 'toggle');
    case 'DeoVR::Connection::Connect': return new MediaSourceShortcut('connection', 'deovr', 'connect');
    case 'DeoVR::Connection::Disconnect': return new MediaSourceShortcut('connection', 'deovr', 'disconnect');
    case 'HereSphere::Connection::Toggle': return new MediaSourceShortcut('connection', 'heresphere', 'toggle');
    case 'HereSphere::Connection::Connect': return new MediaSourceShortcut('connection', 'heresphere', 'connect');
    case 'HereSphere::Connection::Disconnect': return new MediaSourceShortcut('connection', 'heresphere', 'disconnect');
    default: return null;
  }
}
