import { cryptoFramework } from '@kit.CryptoArchitectureKit';
import { NativeTransportFactory } from '../native/NativeTransportFactory';
import { NativePlatformEnvironment, NativeTransportBase } from '../native/NativeTcpTransport';
import type { NativeTransportLimits } from '../native/NativeTcpTransport';
import type { TransportPort } from '../TransportPort';
import { SocketDiagnostic } from './SocketDiagnostic';
import type { SocketDiagnosticRequest, SocketDiagnosticFactory, SocketDiagnosticNonceSource } from './SocketDiagnostic';

class NativeDiagnosticNonceSource implements SocketDiagnosticNonceSource {
  nextNonce(): string {
    const bytes: Uint8Array = cryptoFramework.createRandom().generateRandomSync(16).data;
    let nonce: string = '';
    for (let index: number = 0; index < bytes.length; index++) { nonce += bytes[index].toString(16).padStart(2, '0'); }
    return nonce;
  }
}
class NativeDiagnosticFactory implements SocketDiagnosticFactory {
  private readonly factory: NativeTransportFactory;
  private readonly limits: NativeTransportLimits = { connectTimeoutMs: 2000, writeTimeoutMs: 1000,
    closeTimeoutMs: 1000, maximumPayloadBytes: 128, maximumReceiveBytes: 128 };
  constructor(environment: NativePlatformEnvironment) { this.factory = new NativeTransportFactory(environment); }
  create(request: SocketDiagnosticRequest): TransportPort {
    const family: 1 | 2 = request.host.indexOf(':') >= 0 ? 2 : 1;
    if (request.kind === 'tcp') { return this.factory.createTcp({ host: request.host, port: request.port, family: family }, this.limits); }
    return this.factory.createUdp({ host: request.host, port: request.port, family: family, localPort: 0 }, this.limits);
  }
  canRelease(port: TransportPort): boolean { return port instanceof NativeTransportBase && port.canRelease(); }
  release(port: TransportPort): void { this.factory.release(port); }
}
/** Actual OHOS SDK environment. Constructor is inert, including nonce creation.
 * Keep one application-owned instance; never replace it to clear quarantine. */
export class NativeSocketDiagnostic extends SocketDiagnostic {
  constructor() {
    const environment: NativePlatformEnvironment = new NativePlatformEnvironment();
    super(new NativeDiagnosticFactory(environment), environment, environment, new NativeDiagnosticNonceSource(), 'nativeSDK');
  }
}
