import { OutputCoordinator, OutputEndpoint } from './OutputCoordinator';
import type { OutputPortFactory, OutputSourcePort, OutputCapability } from './OutputCoordinator';
import type { OutputTargetConfig, OutputTargetKind, OutputAdmissionPolicy } from './OutputTypes';
import type { TransportPort } from './TransportPort';
import { NativeTransportFactory } from './native/NativeTransportFactory';
import { NativePlatformEnvironment } from './native/NativeTcpTransport';
import type { NativeTransportLimits } from './native/NativeTcpTransport';

class NativeOutputPortFactory implements OutputPortFactory {
  private factory: NativeTransportFactory = new NativeTransportFactory();
  private readonly limits: NativeTransportLimits;
  constructor(limits: NativeTransportLimits) { this.limits = limits; }
  inspect(kind: OutputTargetKind): OutputCapability { return this.factory.inspect(kind); }
  create(config: OutputTargetConfig, endpoint: OutputEndpoint): TransportPort {
    if (config.kind === 'tcp') { return this.factory.createTcp({ host: endpoint.host, port: endpoint.port, family: endpoint.family }, this.limits); }
    if (config.kind === 'udp') { return this.factory.createUdp({ host: endpoint.host, port: endpoint.port, family: endpoint.family, localPort: endpoint.localPort }, this.limits); }
    if (config.kind === 'webSocket') { return this.factory.createWebSocket({ host: endpoint.host, port: endpoint.port, scheme: endpoint.scheme, path: endpoint.path }, this.limits); }
    throw new Error('Unsupported native output kind.');
  }
}
/** Limits are explicit app admission budgets, not certified hardware safety limits. */
export function createNativeOutputCoordinator(source: OutputSourcePort, policy: OutputAdmissionPolicy,
  limits: NativeTransportLimits): OutputCoordinator {
  const environment: NativePlatformEnvironment = new NativePlatformEnvironment();
  return new OutputCoordinator(new NativeOutputPortFactory(limits), source, policy, environment, environment);
}
