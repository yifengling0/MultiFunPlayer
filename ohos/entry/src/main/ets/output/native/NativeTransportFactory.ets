import type { OutputTargetKind } from '../OutputTypes';
import type { TransportPort } from '../TransportPort';
import { registerNativeTransport, releaseNativeTransport } from '../NativeTransportAdmission';
import { NativeTcpTransport, NativePlatformEnvironment, NativeTransportBase, NativeTransportError } from './NativeTcpTransport';
import type { NativeEnvironment, NativeTransportLimits, NativeSocketEndpoint } from './NativeTcpTransport';
import { NativeUdpTransport } from './NativeUdpTransport';
import type { NativeUdpEndpoint } from './NativeUdpTransport';
import { NativeWebSocketTransport } from './NativeWebSocketTransport';
import type { NativeWebSocketEndpoint } from './NativeWebSocketTransport';

export interface NativeTransportCapability {
  kind: OutputTargetKind; available: boolean; diagnostic: string;
  requiredPermission: string; automaticConnection: false; deviceExecutionAck: false;
}
/** Capability inspection never creates a socket, resolves a host, connects,
 * probes a device or grants a permission. Phone/tablet/PC are checked by actual
 * SysCap, not a device-name allowlist. SDK26 manifests list NetStack since
 * phone/tablet API12 and 2in1 API13; this is not real-device validation.
 *
 * Integrator must declare ohos.permission.INTERNET and retain explicit
 * OutputSession connect/arm/provenance gates. Registration below is identity
 * admission only. It performs no I/O and cannot report a device as connected.
 */
export class NativeTransportFactory {
  private readonly environment: NativeEnvironment;
  constructor(environment: NativeEnvironment = new NativePlatformEnvironment()) { this.environment = environment; }
  inspect(kind: OutputTargetKind): NativeTransportCapability {
    const implemented: boolean = kind === 'tcp' || kind === 'udp' || kind === 'webSocket';
    let available: boolean = false;
    let diagnostic: string = 'notImplementedByNetworkFactory';
    if (implemented) {
      try {
        available = this.environment.supports('SystemCapability.Communication.NetStack') &&
          (kind === 'webSocket' || this.environment.supports('SystemCapability.Communication.NetManager.Core'));
        diagnostic = available ? 'availableDisconnected' : 'unsupportedSystemCapability';
      } catch { diagnostic = 'capabilityCheckFailed'; }
    }
    return { kind: kind, available: available, diagnostic: diagnostic, requiredPermission: 'ohos.permission.INTERNET',
      automaticConnection: false, deviceExecutionAck: false };
  }
  /** Call only after owner disposal/close. Disconnect alone retains reconnect admission. */
  release(port: TransportPort): void {
    if (port instanceof NativeTransportBase && !port.canRelease()) { throw new NativeTransportError('closeUnconfirmed'); }
    releaseNativeTransport(port);
  }
  createTcp(endpoint: NativeSocketEndpoint, limits: NativeTransportLimits): NativeTcpTransport {
    const port: NativeTcpTransport = new NativeTcpTransport(endpoint, limits, this.environment);
    registerNativeTransport(port, 'tcp', (): boolean => port.canRelease()); return port;
  }
  createUdp(endpoint: NativeUdpEndpoint, limits: NativeTransportLimits): NativeUdpTransport {
    const port: NativeUdpTransport = new NativeUdpTransport(endpoint, limits, this.environment);
    registerNativeTransport(port, 'udp', (): boolean => port.canRelease()); return port;
  }
  createWebSocket(endpoint: NativeWebSocketEndpoint, limits: NativeTransportLimits): NativeWebSocketTransport {
    const port: NativeWebSocketTransport = new NativeWebSocketTransport(endpoint, limits, this.environment);
    registerNativeTransport(port, 'webSocket', (): boolean => port.canRelease()); return port;
  }
}
