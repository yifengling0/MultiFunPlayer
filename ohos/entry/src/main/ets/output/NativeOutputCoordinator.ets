import { NativeSerialFactory } from './serial/NativeSerialFactory';
import { SerialOutputPreferences } from '../settings/SerialOutputPreferences';
import { registerNativeTransport } from './NativeTransportAdmission';
import { OutputCoordinator, OutputEndpoint } from './OutputCoordinator';
import type { OutputPortFactory, OutputSourcePort, OutputCapability } from './OutputCoordinator';
import type { OutputTargetConfig, OutputTargetKind, OutputAdmissionPolicy } from './OutputTypes';
import type { TransportPort } from './TransportPort';
import { NativeTransportFactory } from './native/NativeTransportFactory';
import { NativePlatformEnvironment } from './native/NativeTcpTransport';
import type { NativeTransportLimits } from './native/NativeTcpTransport';

class NativeOutputPortFactory implements OutputPortFactory {
  private factory: NativeTransportFactory = new NativeTransportFactory();
  private serialFactory: NativeSerialFactory = new NativeSerialFactory();
  private readonly limits: NativeTransportLimits;
  constructor(limits: NativeTransportLimits) { this.limits = limits; }
  inspect(kind: OutputTargetKind): OutputCapability {
    if (kind === 'serial') {
      const available: boolean = this.serialFactory.inspectAll().some(capability => capability.available);
      return { available: available, diagnostic: available ? '串口能力可用；仍需选择端口、系统授权与明确启用发送。' : '当前串口后端不可连接，请查看端口能力与限制。' };
    }
    return this.factory.inspect(kind);
  }
  create(config: OutputTargetConfig, endpoint: OutputEndpoint): TransportPort | Promise<TransportPort> {
    if (config.kind === 'serial') { return this.createSerial(endpoint); }
    if (config.kind === 'tcp') { return this.factory.createTcp({ host: endpoint.host, port: endpoint.port, family: endpoint.family }, this.limits); }
    if (config.kind === 'udp') { return this.factory.createUdp({ host: endpoint.host, port: endpoint.port, family: endpoint.family, localPort: endpoint.localPort }, this.limits); }
    if (config.kind === 'webSocket') { return this.factory.createWebSocket({ host: endpoint.host, port: endpoint.port, scheme: endpoint.scheme, path: endpoint.path }, this.limits); }
    throw new Error('Unsupported native output kind.');
  }
  private async createSerial(endpoint: OutputEndpoint): Promise<TransportPort> {
    if (endpoint.serial === null || endpoint.serial === undefined) { throw new Error('Missing serial selection.'); }
    const preferences = SerialOutputPreferences.clone(endpoint.serial);
    if (preferences.portName.length === 0 || !this.serialFactory.inspect(preferences.backend).available) { throw new Error('Serial selection unavailable.'); }
    // Explicit Connect re-enumerates. Persisted portName never supplies a native id.
    const ports = await this.serialFactory.listPortsExplicit(preferences.backend);
    const matches = ports.filter(port => port.backend === preferences.backend && port.portName === preferences.portName);
    if (matches.length !== 1) { throw new Error('Serial selection absent or ambiguous.'); }
    const port = await this.serialFactory.create({ backend: preferences.backend, portName: matches[0].portName, portId: matches[0].portId }, preferences,
      { operationTimeoutMs: 250, closeTimeoutMs: this.limits.closeTimeoutMs,
        maximumPayloadBytes: this.limits.maximumPayloadBytes, maximumReceiveBytes: this.limits.maximumReceiveBytes });
    registerNativeTransport(port, 'serial', (): boolean => port.canRelease());
    return port;
  }
}
/** Limits are explicit app admission budgets, not certified hardware safety limits. */
export function createNativeOutputCoordinator(source: OutputSourcePort, policy: OutputAdmissionPolicy,
  limits: NativeTransportLimits): OutputCoordinator {
  const environment: NativePlatformEnvironment = new NativePlatformEnvironment();
  return new OutputCoordinator(new NativeOutputPortFactory(limits), source, policy, environment, environment);
}
