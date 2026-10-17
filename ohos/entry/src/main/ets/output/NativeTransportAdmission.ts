import type { OutputTargetKind } from './OutputTypes';
import type { TransportPort } from './TransportPort';

interface RegisteredNativePort { port: TransportPort; kind: OutputTargetKind; canRelease: (() => boolean) | null; }
// Module-private identity registry, populated only by the native factory. This
// is an internal integration boundary, not a security boundary against app code.
const registered: RegisteredNativePort[] = [];
/** NativeTransportFactory only. A boolean/property on an arbitrary port is insufficient. */
export function registerNativeTransport(port: TransportPort, kind: OutputTargetKind, canRelease: (() => boolean) | null = null): void {
  if (port.simulationOnly || (kind !== 'tcp' && kind !== 'udp' && kind !== 'webSocket' && kind !== 'serial')) { throw new Error('Unsupported native transport registration.'); }
  if (!registered.some(entry => entry.port === port)) { registered.push({ port: port, kind: kind, canRelease: canRelease }); }
}
export function isRegisteredNativeTransport(port: TransportPort, kind: OutputTargetKind): boolean {
  return !port.simulationOnly && registered.some(entry => entry.port === port && entry.kind === kind);
}
export function nativeTransportCanRelease(port: TransportPort): boolean {
  const entry: RegisteredNativePort | undefined = registered.find(item => item.port === port);
  return entry === undefined || entry.canRelease === null || entry.canRelease();
}
export function releaseNativeTransport(port: TransportPort): boolean {
  if (!nativeTransportCanRelease(port)) { return false; }
  const index: number = registered.findIndex(entry => entry.port === port);
  if (index >= 0) { registered.splice(index, 1); }
  return true;
}
