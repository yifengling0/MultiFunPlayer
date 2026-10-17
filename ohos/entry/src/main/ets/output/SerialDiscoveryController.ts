import type { SerialBackendKind, SerialPortOption } from './serial/SerialDiscoveryTypes';
export interface SerialDiscoveryCapability { backend: SerialBackendKind; available: boolean; controlLines: boolean; diagnostic: string; automaticConnection: false; deviceExecutionAck: false; }
export interface SerialDiscoveryPort {
  inspectAll(): SerialDiscoveryCapability[];
  listPortsExplicit(backend: SerialBackendKind): Promise<SerialPortOption[]>;
}
export interface SerialDiscoveryContext {
  targetId: string; targetGeneration: number; profileRevision: number; backend: SerialBackendKind; allowed: boolean;
}
export class SerialDiscoverySnapshot {
  ports: SerialPortOption[] = [];
  capabilities: SerialDiscoveryCapability[] = [];
  busy: boolean = false;
  message: string = '请明确刷新本机端口；恢复设置不会自动枚举或连接。';
}
/** No constructor/snapshot enumeration. Results never select a port, mutate a
 * target draft, apply a configuration, request permission or open a handle. */
export class SerialDiscoveryController {
  private readonly port: SerialDiscoveryPort;
  private token: number = 0;
  private context: string = '';
  private state: SerialDiscoverySnapshot = new SerialDiscoverySnapshot();
  constructor(port: SerialDiscoveryPort) { this.port = port; }
  private key(value: SerialDiscoveryContext): string {
    return value.targetId + ':' + value.targetGeneration + ':' + value.profileRevision + ':' + value.backend + ':' + value.allowed;
  }
  synchronize(value: SerialDiscoveryContext): void {
    const next: string = this.key(value);
    if (next === this.context) { return; }
    this.cancel(); this.context = next;
  }
  cancel(): void {
    this.token++; this.state.busy = false; this.state.ports = [];
    this.state.message = '端口列表已失效；请明确刷新，连接仍需单独操作。';
  }
  snapshot(): SerialDiscoverySnapshot {
    const result = new SerialDiscoverySnapshot(); result.busy = this.state.busy; result.message = this.state.message;
    result.ports = this.state.ports.map(p => ({ backend: p.backend, portName: p.portName, portId: p.portId, label: p.label,
      vendorId: p.vendorId, productId: p.productId, writeOnly: p.writeOnly, controlLines: p.controlLines }));
    result.capabilities = this.state.capabilities.map(p => ({ backend: p.backend, available: p.available, controlLines: p.controlLines,
      diagnostic: p.diagnostic, automaticConnection: false, deviceExecutionAck: false }));
    return result;
  }
  async refresh(value: SerialDiscoveryContext): Promise<boolean> {
    this.synchronize(value);
    if (!value.allowed || value.targetId.length === 0 || !Number.isSafeInteger(value.targetGeneration) || value.targetGeneration < 1 || this.state.busy) { return false; }
    const token: number = ++this.token; const context: string = this.context;
    this.state.busy = true; this.state.ports = []; this.state.message = '正在枚举本机端口；未请求授权、未打开、未发送。';
    try {
      this.state.capabilities = this.port.inspectAll();
      const result: SerialPortOption[] = await this.port.listPortsExplicit(value.backend);
      if (token !== this.token || context !== this.context) { return false; }
      if (!Array.isArray(result) || result.length > 64 || result.some(p => p.backend !== value.backend || typeof p.portName !== 'string' || p.portName.length < 1 || p.portName.length > 1024 || /[\x00-\x1f\x7f-\x9f]/.test(p.portName))) { throw new Error('invalidPortList'); }
      const names: string[] = [];
      if (result.some(p => { if (names.indexOf(p.portName) >= 0) { return true; } names.push(p.portName); return false; })) { throw new Error('ambiguousPortList'); }
      this.state.ports = result;
      this.state.message = result.length === 0 ? '未发现此后端的可列出端口；不会自动换后端或申请权限。' : '已列出 ' + result.length + ' 个端口；选择后仍需明确连接。';
      return true;
    } catch {
      if (token === this.token && context === this.context) { this.state.ports = []; this.state.message = '端口枚举失败或列表无法验证；未打开任何连接。'; }
      return false;
    } finally { if (token === this.token && context === this.context) { this.state.busy = false; } }
  }
}
