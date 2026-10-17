import { socket } from '@kit.NetworkKit';
import type { BusinessError } from '@kit.BasicServicesKit';
import { NativeTransportBase, NativePlatformEnvironment, NativeTransportError, copyNativeEndpoint, validateNativePort, resolveNativeAddress, nativeFailure } from './NativeTcpTransport';
import type { NativeEnvironment, NativeTransportLimits, NativeSocketEndpoint, NativeChannel, NativeChannelSink } from './NativeTcpTransport';

export interface NativeUdpEndpoint extends NativeSocketEndpoint { localPort: number; }
class NativeUdpChannel implements NativeChannel {
  private readonly nativeSocket: socket.UDPSocket;
  private readonly environment: NativeEnvironment;
  private readonly endpoint: NativeUdpEndpoint;
  private readonly sink: NativeChannelSink;
  private address: socket.NetAddress | null = null;
  private readonly onMessage: (message: socket.SocketMessageInfo) => void;
  private readonly onError: (error: BusinessError) => void;
  private readonly onClose: () => void;
  constructor(environment: NativeEnvironment, endpoint: NativeUdpEndpoint, sink: NativeChannelSink) {
    this.environment = environment; this.endpoint = endpoint; this.sink = sink;
    this.nativeSocket = environment.createUdp();
    this.onMessage = (message: socket.SocketMessageInfo): void => {
      // An unconnected UDP socket receives arbitrary senders. Only diagnostics
      // from the explicitly resolved peer are forwarded, never control commands.
      if (this.address !== null && message.remoteInfo.address === this.address.address && message.remoteInfo.port === this.address.port) {
        sink.received(new Uint8Array(message.message));
      }
    };
    this.onError = (error: BusinessError): void => sink.fault(nativeFailure('socketError', error));
    this.onClose = (): void => sink.closed();
  }
  async connect(): Promise<void> {
    this.nativeSocket.on('message', this.onMessage); this.nativeSocket.on('error', this.onError); this.nativeSocket.on('close', this.onClose);
    if (!this.sink.live()) { throw new NativeTransportError('cancelled'); }
    this.address = await resolveNativeAddress(this.environment, this.endpoint);
    if (!this.sink.live()) { throw new NativeTransportError('cancelled'); }
    this.sink.opening();
    await this.nativeSocket.bind({ address: this.endpoint.family === 2 ? '::' : '0.0.0.0', family: this.endpoint.family, port: this.endpoint.localPort });
    if (!this.sink.live()) { return; }
  }
  async send(bytes: Uint8Array): Promise<void> {
    if (this.address === null) { throw new NativeTransportError('notConnected'); }
    // Exactly one send per request, preserving the full datagram boundary.
    const result: void = await this.nativeSocket.send({ data: bytes.buffer as ArrayBuffer, address: this.address });
    if (result !== undefined) { throw new NativeTransportError('unexpectedSendResult'); }
  }
  detach(): void {
    try { this.nativeSocket.off('message', this.onMessage); } catch { /* Continue cleanup. */ }
    try { this.nativeSocket.off('error', this.onError); } catch { /* Continue cleanup. */ }
    try { this.nativeSocket.off('close', this.onClose); } catch { /* Continue cleanup. */ }
  }
  close(): Promise<void> { return this.nativeSocket.close(); }
}
export class NativeUdpTransport extends NativeTransportBase {
  private readonly endpoint: NativeUdpEndpoint;
  constructor(endpoint: NativeUdpEndpoint, limits: NativeTransportLimits, environment: NativeEnvironment = new NativePlatformEnvironment()) {
    super('udp', 'message', limits, environment);
    const address: NativeSocketEndpoint = copyNativeEndpoint(endpoint); validateNativePort(endpoint.localPort, true);
    if (limits.maximumPayloadBytes > 65507) { throw new NativeTransportError('udpPayloadLimit'); }
    this.endpoint = { host: address.host, port: address.port, family: address.family, localPort: endpoint.localPort };
  }
  protected createChannel(sink: NativeChannelSink): NativeChannel { return new NativeUdpChannel(this.environment, this.endpoint, sink); }
}
