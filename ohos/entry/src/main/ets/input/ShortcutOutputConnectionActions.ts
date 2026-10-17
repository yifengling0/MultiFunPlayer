import { SerialOutputPreferences } from '../settings/SerialOutputPreferences';
import { ShortcutAction, cloneShortcutAction } from './ShortcutConfiguration';
import { OutputSettingsDraft } from '../output/OutputSettingsModel';
import { OutputConfiguration, SavedOutputTarget, SavedOutputDeviceRanges } from '../settings/OutputConfiguration';
import { parseDeoVrEndpointText } from '../media/deovr/DeoVrScriptMatch';

export type OutputConnectionOperation = 'Toggle' | 'Connect' | 'Disconnect';
export interface OutputEndpointActionResult { draft: OutputSettingsDraft; changed: boolean; }

/** Exact aliases of original sites 72, 75 and 76. No selection fallback. */
export function isOutputEndpointAction(id: string): boolean {
  return id === 'OutputTarget::TCP::Endpoint::Set' || id === 'OutputTarget::UDP::Endpoint::Set' ||
    id === 'OutputTarget::WebSocket::Uri::Set';
}
/** Original sites 80–82 capture one target object. The caller resolves a current
 * explicit ID/generation and implements its state predicates and async lease. */
export function outputConnectionOperation(id: string): OutputConnectionOperation | null {
  switch (id) {
    case 'OutputTarget::Connection::Toggle': return 'Toggle';
    case 'OutputTarget::Connection::Connect': return 'Connect';
    case 'OutputTarget::Connection::Disconnect': return 'Disconnect';
    default: return null;
  }
}

function exactKeys(value: Object, allowed: string[]): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) { return false; }
  const keys: string[] = Object.keys(value);
  return keys.length === allowed.length && keys.every(key => allowed.indexOf(key) >= 0);
}
function counter(value: number): boolean { return Number.isSafeInteger(value) && value >= 0; }
/** Reject malformed inputs before copy() can silently discard a forged field or
 * normalize an omitted permission. These are process-local drafts, not imports. */
function validDraftShape(draft: OutputSettingsDraft): boolean {
  if (!exactKeys(draft, ['targetId', 'targetGeneration', 'profileId', 'model', 'host', 'port', 'family', 'localPort',
    'scheme', 'path', 'serial', 'editRevision', 'profileRevision', 'applicationId']) ||
    !exactKeys(draft.model, ['kind', 'polled', 'intervalMs', 'dirtyOnly', 'offloadElapsed', 'pausedAutoHome',
      'pausedMotion', 'pausedManual', 'ranges']) || typeof draft.targetId !== 'string' ||
    !/^(tcp|udp|webSocket):[0-9]$/.test(draft.targetId) || !counter(draft.targetGeneration) || draft.targetGeneration === 0 ||
    !counter(draft.editRevision) || !counter(draft.profileRevision) || !counter(draft.applicationId) ||
    typeof draft.profileId !== 'string' || draft.profileId.trim().length === 0 || draft.profileId.length > 256 ||
    /[\x00-\x1f\x7f-\x9f]/.test(draft.profileId) || typeof draft.model.polled !== 'boolean' ||
    typeof draft.model.dirtyOnly !== 'boolean' || typeof draft.model.offloadElapsed !== 'boolean' ||
    typeof draft.model.pausedAutoHome !== 'boolean' || typeof draft.model.pausedMotion !== 'boolean' ||
    typeof draft.model.pausedManual !== 'boolean') { return false; }
  SerialOutputPreferences.check(draft.serial);
  const ranges = draft.model.ranges;
  if (!Array.isArray(ranges) || ranges.length > OutputConfiguration.MAX_AXES) { return false; }
  const keys: string[] = Object.keys(ranges);
  return keys.length === ranges.length && keys.every((key, index) => key === index.toString()) &&
    ranges.every(range => exactKeys(range, ['axisId', 'minimum', 'maximum', 'enabled']));
}

/** Full settings validation, including otherwise unrelated ranges, pause
 * permissions, interval, local UDP port and retained path. This does not prove
 * current profile/instance ownership; only the application owner can do that. */
export function validateOutputConnectionDraft(draft: OutputSettingsDraft): boolean {
  try {
    if (!validDraftShape(draft) || (draft.model.kind !== 'tcp' && draft.model.kind !== 'udp' && draft.model.kind !== 'webSocket') ||
      draft.targetId.split(':')[0] !== draft.model.kind || (draft.family !== '1' && draft.family !== '2') ||
      (draft.scheme !== 'ws' && draft.scheme !== 'wss') || typeof draft.host !== 'string' || draft.host.length === 0 ||
      !Number.isInteger(draft.port) || draft.port < 1 || draft.port > 65535) { return false; }
    // Reuse the existing bounded host validator, then the stricter saved output
    // validator below. Neither parser performs DNS or opens a transport.
    const parsed = parseDeoVrEndpointText((draft.host.includes(':') ? '[' + draft.host + ']' : draft.host) + ':' + draft.port.toString());
    if ((parsed.host.includes(':') && draft.family !== '2') || (/^[0-9.]+$/.test(parsed.host) && draft.family !== '1')) { return false; }
    const target = new SavedOutputTarget(draft.model.kind, Number(draft.targetId.split(':')[1]));
    target.host = draft.host; target.port = draft.port; target.family = draft.family === '2' ? 2 : 1;
    target.localPort = draft.localPort; target.scheme = draft.scheme; target.path = draft.path;
    target.polled = draft.model.polled; target.intervalMs = draft.model.intervalMs;
    target.dirtyOnly = draft.model.dirtyOnly; target.offloadElapsed = draft.model.offloadElapsed;
    target.pausedAutoHome = draft.model.pausedAutoHome; target.pausedMotion = draft.model.pausedMotion;
    target.pausedManual = draft.model.pausedManual;
    target.rangesByDevice = [new SavedOutputDeviceRanges(draft.profileId, draft.model.ranges)];
    return OutputConfiguration.validateTarget(target).length === 0;
  } catch (_) { return false; }
}

function setEndpoint(draft: OutputSettingsDraft, text: string): void {
  const raw: string = text.replace(/^(?:InterNetwork|InterNetworkV6|Unspecified)\//, '');
  // Brackets are only an IPv6 spelling, never an escape around a DNS name.
  if (raw.startsWith('[') && !/^\[[^\]]*:[^\]]*\]:[0-9]+$/.test(raw)) { throw new Error('Unsupported endpoint.'); }
  const endpoint = parseDeoVrEndpointText(text);
  draft.host = endpoint.host.toLowerCase(); draft.port = endpoint.port;
  // A prefix is accepted only as source text; it never bypasses host validation.
  // Raw IPv6 derives family 2, DNS/IPv4 derives family 1, as for DeoVR.
  draft.family = draft.host.includes(':') ? '2' : '1';
}
function setUri(draft: OutputSettingsDraft, text: string): void {
  // Deliberately not System.Uri equivalence. Only credential-free ws/wss,
  // bracketed IPv6 or DNS/IPv4, an optional port, and the saved path subset.
  // Query, fragment, user-info, backslashes, escapes and other schemes fail.
  const match = /^(ws|wss):\/\/(\[[^\]]+\]|[^/:?#@]+)(?::([0-9]+))?(\/.*)?$/i.exec(text);
  if (match === null) { throw new Error('Unsupported WebSocket URI.'); }
  const scheme: string = match[1].toLowerCase();
  const port: string = match[3] === undefined ? (scheme === 'wss' ? '443' : '80') : match[3];
  setEndpoint(draft, match[2] + ':' + port);
  draft.scheme = scheme; draft.path = match[4] === undefined ? '/' : match[4];
}

/** Pure bounded endpoint action. Original setters update a property even while
 * connected; an established socket retains its old destination. The caller
 * must synchronously disarm/cancel only this owner's pending connect, commit
 * this inert draft and verify persistence. No socket, connection, Arm, source,
 * selection or dirty-value cache is touched here. Invalid input is atomic.
 *
 * This is a partial port: .NET NetUtils admits zero ports and broader prefixed
 * hosts and can throw; Uri.TryCreate admits unsupported schemes/credentials.
 * We normalize host case, brackets, numeric ports and ws/wss default ports only;
 * alternate IPv6 compression/path spellings are not .NET canonicalized.
 */
export function applyOutputEndpointAction(draft: OutputSettingsDraft, action: ShortcutAction): OutputEndpointActionResult | null {
  try {
    const checked = cloneShortcutAction(action);
    if (!isOutputEndpointAction(checked.id) || !validDraftShape(draft) || checked.outputTargetId.length === 0 ||
      checked.outputTargetId !== draft.targetId) { return null; }
    const kind: string = checked.id === 'OutputTarget::TCP::Endpoint::Set' ? 'tcp' :
      checked.id === 'OutputTarget::UDP::Endpoint::Set' ? 'udp' : 'webSocket';
    if (draft.model.kind !== kind || draft.targetId.split(':')[0] !== kind) { return null; }
    const next = OutputSettingsDraft.copy(draft);
    if (kind === 'webSocket') { setUri(next, checked.text); } else { setEndpoint(next, checked.text); }
    if (!validateOutputConnectionDraft(next)) { return null; }
    const changed: boolean = typeof draft.host !== 'string' || next.host !== draft.host.toLowerCase() ||
      next.port !== draft.port || next.family !== draft.family || next.scheme !== draft.scheme || next.path !== draft.path;
    if (!changed) { return { draft: OutputSettingsDraft.copy(draft), changed: false }; }
    if (draft.editRevision === Number.MAX_SAFE_INTEGER) { return null; }
    next.applicationId = 0; next.editRevision++;
    return { draft: next, changed: true };
  } catch (_) { return null; }
}
