import { decodeDeoVrDocument, decodeDeoVrPlayerFields, encodeDeoVrCommand, DEOVR_MAXIMUM_PATH_LENGTH } from '../deovr/DeoVrProtocol';
import { validateDeoVrEndpoint } from '../deovr/DeoVrTypes';
import type { DeoVrCommand, DeoVrPlayerPacket, DeoVrProtocolStrategy } from '../deovr/DeoVrProtocol';

/** Bounded, inert identifier metadata. This deliberately accepts only explicit
 * absolute URI syntax, not .NET's implicit filesystem-path URI conversion.
 * The original spelling is retained; nothing opens, resolves or logs this URI. */
export function hereSphereSceneUri(value: Object): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > DEOVR_MAXIMUM_PATH_LENGTH ||
    /[\u0000-\u0020\u007f\\<>"{}|^`]/.test(value) || /%(?![0-9a-fA-F]{2})/.test(value)) { return null; }
  const match: RegExpMatchArray | null = value.match(/^([A-Za-z][A-Za-z0-9+.-]*):(.*)$/);
  if (match === null || match[1].length < 2 || match[2].length === 0) { return null; }
  const scheme: string = match[1].toLowerCase();
  const rest: string = match[2];
  if (['http', 'https', 'ftp', 'ws', 'wss'].indexOf(scheme) >= 0 && !rest.startsWith('//')) { return null; }
  if (rest.startsWith('//')) {
    const authority: string = rest.slice(2).split(/[/?#]/)[0];
    // Keep context conservative. Credentials have no role in scene identity;
    // rejecting them also avoids leaking them into a future display consumer.
    if (authority.length === 0) { return scheme === 'file' && rest.startsWith('///') ? value : null; }
    if (authority.indexOf('@') >= 0) { return null; }
    const parts: RegExpMatchArray | null = authority.match(/^(?:\[([0-9A-Fa-f:.]+)\]|([A-Za-z0-9.-]+))(?::([0-9]{1,5}))?$/);
    if (parts === null) { return null; }
    const ipv6: boolean = typeof parts[1] === 'string';
    try {
      validateDeoVrEndpoint({ host: ipv6 ? parts[1] : parts[2],
        port: parts[3] === undefined ? 1 : Number(parts[3]), family: ipv6 ? 2 : 1 });
    } catch { return null; }
  }
  return value;
}

/** HereSphere resource precedence follows its original ReadAsync. A present
 * blank string resets before all optional fields; null/unconvertible resource
 * falls back to path. As in the bounded DeoVR adapter, numeric/bool-to-string
 * and numeric-string coercions are intentionally excluded. */
export function decodeHereSpherePacket(bytes: Uint8Array): DeoVrPlayerPacket {
  const object: Record<string, Object> = decodeDeoVrDocument(bytes);
  const resource: Object = object['resource'];
  const selectedResource: boolean = typeof resource === 'string';
  const selected: Object = selectedResource ? resource : object['path'];
  const packet: DeoVrPlayerPacket = decodeDeoVrPlayerFields(object, selected);
  // .NET whitespace includes NEL (U+0085), which JavaScript trim omits.
  if (typeof selected === 'string' && /^[\s\u0085]*$/.test(selected)) { packet.path = null; }
  packet.sceneUri = selectedResource && packet.path !== null ? hereSphereSceneUri(object['identifier']) : null;
  return packet;
}

/** The extracted C# writer and PlayerState layout are identical to DeoVR:
 * four-byte little-endian UTF-8 length, same five fields and null inclusion. */
export class HereSphereProtocol implements DeoVrProtocolStrategy {
  readonly sourceKind: 'deovr' | 'heresphere' = 'heresphere';
  decodePacket(bytes: Uint8Array): DeoVrPlayerPacket { return decodeHereSpherePacket(bytes); }
  encodeCommand(command: DeoVrCommand): Uint8Array { return encodeDeoVrCommand(command); }
}
