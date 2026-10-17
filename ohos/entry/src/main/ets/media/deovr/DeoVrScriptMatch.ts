import { ResourceFileEntry } from '../../core/ResourceLibrary';
import { validateDeoVrEndpoint } from './DeoVrTypes';

/** Metadata hint only. The returned opaque URI is NEVER passed to file IO.
 * Actual reads are exclusively entries returned by the authorized catalog's
 * ResourceLibrary.planSearch. Query/fragment never become a local path. */
export function deoVrScriptMatchHint(path: string): ResourceFileEntry {
  if (typeof path !== 'string' || path.length === 0 || path.length > 4096 || /[\x00-\x1f\x7f-\x9f]/.test(path)) {
    throw new Error('远端媒体路径为空、过长或含控制字符。');
  }
  let text = path;
  const scheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.exec(text);
  if (scheme !== null) {
    const tail = text.slice(scheme[0].length);
    const slash = tail.indexOf('/');
    if (slash < 0) { throw new Error('远端 URL 没有可匹配的媒体文件名。'); }
    text = tail.slice(slash).split(/[?#]/, 1)[0];
    try { text = decodeURIComponent(text); } catch (_) { throw new Error('远端 URL 路径编码无效。'); }
  } else if (/^file:\//i.test(text)) {
    text = text.slice(5).split(/[?#]/, 1)[0];
    try { text = decodeURIComponent(text); } catch (_) { throw new Error('远端文件 URL 编码无效。'); }
  }
  const parts = text.replace(/\\/g, '/').split('/');
  const name = parts[parts.length - 1];
  if (name.length === 0 || name === '.' || name === '..' || name.length > 4096 || /[\x00-\x1f\x7f-\x9f]/.test(name)) {
    throw new Error('远端媒体名称无法用于受管脚本匹配。');
  }
  return new ResourceFileEntry('deovr-metadata-hint', name, name);
}

/** Bounded endpoint action adapter. The original optional address-family prefix
 * is accepted as text; transport family is still derived from the validated host.
 * This performs no DNS, connection or persistent credential creation. */
export function parseDeoVrEndpointText(text: string): { host: string; port: number } {
  if (typeof text !== 'string' || text.length > 280) { throw new Error('DeoVR endpoint is too long.'); }
  const match = /^(?:(?:InterNetwork|InterNetworkV6|Unspecified)\/)?(.+):(\d+)$/.exec(text);
  if (match === null) { throw new Error('请输入 ipOrHost:port。'); }
  let host = match[1];
  if (host.startsWith('[') && host.endsWith(']')) { host = host.slice(1, -1); }
  const port = Number(match[2]);
  const endpoint = validateDeoVrEndpoint({ host, port, family: host.includes(':') ? 2 : 1 });
  return { host: endpoint.host, port: endpoint.port };
}
