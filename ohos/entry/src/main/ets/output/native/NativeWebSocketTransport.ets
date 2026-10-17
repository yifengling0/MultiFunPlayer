import { webSocket } from '@kit.NetworkKit';
import { util } from '@kit.ArkTS';
import type { BusinessError } from '@kit.BasicServicesKit';
import { NativeTransportBase, NativePlatformEnvironment, NativeTransportError, validateNativeHost, validateNativePort, nativeFailure } from './NativeTcpTransport';
import type { NativeEnvironment, NativeTransportLimits, NativeChannel, NativeChannelSink } from './NativeTcpTransport';

/** No URL string, user-info, query, authentication header, cookie, custom CA or
 * client certificate surface in this first adapter. Never load saved secrets.
 * All fields, including port and path, must be supplied explicitly.
 */
export interface NativeWebSocketEndpoint { scheme: 'ws' | 'wss'; host: string; port: number; path: string; }
function endpointUrl(endpoint: NativeWebSocketEndpoint): string {
  validateNativeHost(endpoint.host); validateNativePort(endpoint.port);
  if ((endpoint.scheme !== 'ws' && endpoint.scheme !== 'wss') || typeof endpoint.path !== 'string' ||
    endpoint.path.length > 1024 || !/^\/[A-Za-z0-9_./~!$&'()*+,;=:@-]*$/.test(endpoint.path)) {
    throw new NativeTransportError('invalidWebSocketEndpoint');
  }
  const host: string = endpoint.host.includes(':') ? '[' + endpoint.host + ']' : endpoint.host;
  return endpoint.scheme + '://' + host + ':' + endpoint.port.toString() + endpoint.path;
}
class NativeWebSocketChannel implements NativeChannel {
  private readonly nativeSocket: webSocket.WebSocket;
  private readonly url: string;
  private readonly sink: NativeChannelSink;
  private readonly maximumReceiveBytes: number;
  private openResolve: (() => void) | null = null;
  private openReject: ((error: NativeTransportError) => void) | null = null;
  private readonly onOpen: (error: BusinessError, value: Object) => void;
  private readonly onMessage: (error: BusinessError, value: string | ArrayBuffer) => void;
  private readonly onError: (error: BusinessError) => void;
  private readonly onClose: (error: BusinessError, value: webSocket.CloseResult) => void;
  constructor(environment: NativeEnvironment, url: string, sink: NativeChannelSink, maximumReceiveBytes: number) {
    this.nativeSocket = environment.createWebSocket(); this.url = url; this.sink = sink; this.maximumReceiveBytes = maximumReceiveBytes;
    this.onOpen = (error: BusinessError, _value: Object): void => {
      if (!sink.live()) { sink.lateOpen(); return; }
      if (error && error.code !== 0) { sink.fault(nativeFailure('webSocketOpenError', error)); return; }
      if (this.openResolve !== null) { this.openResolve(); this.clearOpen(); }
    };
    this.onMessage = (error: BusinessError, value: string | ArrayBuffer): void => {
      if (!sink.live()) { return; }
      if (error && error.code !== 0) { sink.fault(nativeFailure('webSocketReceiveError', error)); return; }
      if (typeof value === 'string') {
        if (value.length > this.maximumReceiveBytes) { sink.fault(new NativeTransportError('receiveTooLarge')); return; }
        sink.received(new util.TextEncoder().encodeInto(value));
      } else { sink.received(new Uint8Array(value)); }
    };
    this.onError = (error: BusinessError): void => sink.fault(nativeFailure('webSocketError', error));
    this.onClose = (_error: BusinessError, _value: webSocket.CloseResult): void => sink.closed();
  }
  private clearOpen(): void { this.openResolve = null; this.openReject = null; }
  async connect(): Promise<void> {
    // Register BEFORE connect. connect(true) only means the request was created.
    // https://github.com/openharmony/docs/blob/master/en/application-dev/reference/apis-network-kit/js-apis-webSocket.md
    this.nativeSocket.on('open', this.onOpen); this.nativeSocket.on('message', this.onMessage);
    this.nativeSocket.on('error', this.onError); this.nativeSocket.on('close', this.onClose);
    if (!this.sink.live()) { throw new NativeTransportError('cancelled'); }
    const opened: Promise<void> = new Promise<void>((resolve, reject): void => { this.openResolve = resolve; this.openReject = reject; });
    // Attach both rejection handlers immediately, even when connect never settles.
    const started: Promise<void> = Promise.resolve().then((): Promise<boolean> => this.requestConnection()).then((created: boolean): void => {
      if (created !== true) { throw new NativeTransportError('webSocketConnectRejected'); }
      if (!this.sink.live()) { this.sink.lateOpen(); }
    });
    // Observe rejection immediately but keep channel.connect pending until the
    // actual native request settles; Promise.all would discard that lifetime.
    void opened.catch((): void => {});
    await started;
    await opened;
  }
  private async requestConnection(): Promise<boolean> {
    if (!this.sink.live()) { throw new NativeTransportError('cancelled'); }
    this.sink.opening();
    try { return await this.nativeSocket.connect(this.url); } catch (error) { throw nativeFailure('webSocketConnectFailed', error as BusinessError); }
  }
  async send(bytes: Uint8Array): Promise<void> {
    // SDK string => Text frame; ArrayBuffer => Binary. TCode MUST be Text.
    // Strict decoding rejects malformed UTF-8 rather than silently changing bytes.
    const text: string = util.TextDecoder.create('utf-8', { fatal: true, ignoreBOM: true }).decodeToString(bytes);
    try {
      if (await this.nativeSocket.send(text) !== true) { throw new NativeTransportError('webSocketSendRejected'); }
    } catch (error) {
      if (error instanceof NativeTransportError) { throw error; }
      throw nativeFailure('webSocketSendFailed', error as BusinessError);
    }
  }
  detach(): void {
    if (this.openReject !== null) { this.openReject(new NativeTransportError('cancelled')); this.clearOpen(); }
    try { this.nativeSocket.off('open', this.onOpen); } catch { /* Continue cleanup. */ }
    try { this.nativeSocket.off('message', this.onMessage); } catch { /* Continue cleanup. */ }
    try { this.nativeSocket.off('error', this.onError); } catch { /* Continue cleanup. */ }
    try { this.nativeSocket.off('close', this.onClose); } catch { /* Continue cleanup. */ }
  }
  async close(): Promise<void> {
    try {
      if (await this.nativeSocket.close({ code: 1000, reason: 'Output closed' }) !== true) { throw new NativeTransportError('webSocketCloseRejected'); }
    } catch (error) { throw nativeFailure('webSocketCloseFailed', error as BusinessError); }
  }
}
export class NativeWebSocketTransport extends NativeTransportBase {
  private readonly url: string;
  constructor(endpoint: NativeWebSocketEndpoint, limits: NativeTransportLimits, environment: NativeEnvironment = new NativePlatformEnvironment()) {
    super('webSocket', 'message', limits, environment); this.url = endpointUrl(endpoint);
  }
  protected needsResolver(): boolean { return false; }
  protected createChannel(sink: NativeChannelSink): NativeChannel {
    return new NativeWebSocketChannel(this.environment, this.url, sink, this.limits.maximumReceiveBytes);
  }
}
