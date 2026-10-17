/** Executes the repository's production ArkTS classes unchanged after type erasure.
 * Kit imports are inert sentinels: a test must inject its NativeEnvironment.
 * This cannot validate the OHOS SDK backend or device permissions. */
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const networkKit = 'data:text/javascript,' + encodeURIComponent(`
  const unavailable = () => { throw new Error('OHOS SDK backend is unavailable in Node; inject NativeEnvironment'); };
  export const socket = { constructTCPSocketInstance: unavailable, constructUDPSocketInstance: unavailable };
  export const connection = { getAddressesByName: unavailable };
  export const webSocket = { createWebSocket: unavailable };
`);
const basicKit = 'data:text/javascript,' + encodeURIComponent(`export const systemDateTime = { TimeType: { STARTUP: 1 }, getUptime() { throw new Error('Inject a monotonic clock'); } };`);
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === '@kit.ArkTS') return { url: 'data:text/javascript,export const util = {};', shortCircuit: true };
    if (specifier === '@kit.NetworkKit') return { url: networkKit, shortCircuit: true };
    if (specifier === '@kit.BasicServicesKit') return { url: basicKit, shortCircuit: true };
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      for (const extension of ['.ts', '.ets']) {
        const candidate = new URL(specifier + extension, context.parentURL);
        if (existsSync(fileURLToPath(candidate))) return next(candidate.href, context);
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('.ets')) return { format: 'module', source: stripTypeScriptTypes(readFileSync(new URL(url), 'utf8')), shortCircuit: true };
    return next(url, context);
  }
});
