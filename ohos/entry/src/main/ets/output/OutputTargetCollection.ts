import { OutputCoordinator } from './OutputCoordinator';
import type { OutputCapability, OutputEndpoint } from './OutputCoordinator';
import type { OutputSessionSnapshot } from './OutputSession';
import type { OutputTargetConfig, OutputTargetKind } from './OutputTypes';

class OutputTargetEntry {
  readonly id: string;
  readonly coordinator: OutputCoordinator;
  token: number = 0;
  retired: boolean = false;
  removal: Promise<boolean> | null = null;
  constructor(id: string, coordinator: OutputCoordinator) { this.id = id; this.coordinator = coordinator; }
}

/** Independent target ownership. Selection only chooses the UI facade; it never
 * changes another target's connection, arm, configuration or dispatch scope.
 * The factory must construct an inert coordinator. Saved targets do not connect.
 */
export class OutputTargetCollection {
  private readonly factory: (id: string) => OutputCoordinator;
  private entries: OutputTargetEntry[] = [];
  private selection: string | null = null;
  private foreground: boolean = true;
  private disposed: boolean = false;
  constructor(factory: (id: string) => OutputCoordinator) { this.factory = factory; }

  add(id: string): void {
    if (this.disposed) { throw new Error('The output collection has been disposed.'); }
    if (id.trim().length === 0) { throw new Error('An output target requires a stable identifier.'); }
    // In particular, never replace a retained close-failure tombstone.
    if (this.entry(id) !== null) { return; }
    const coordinator: OutputCoordinator = this.factory(id);
    if (this.entries.some(item => item.coordinator === coordinator)) {
      throw new Error('Each output target requires its own coordinator.');
    }
    coordinator.setForeground(this.foreground);
    this.entries.push(new OutputTargetEntry(id, coordinator));
    if (this.selection === null) { this.selection = id; }
  }
  select(id: string): boolean {
    if (this.entry(id) === null) { return false; }
    this.selection = id; return true;
  }
  ids(): string[] { return this.entries.map(item => item.id); }
  selectedId(): string | null { return this.selection; }
  selected(): OutputCoordinator | null { return this.selection === null ? null : this.get(this.selection); }
  get(id: string): OutputCoordinator | null { const item: OutputTargetEntry | null = this.entry(id); return item === null ? null : item.coordinator; }
  /** Includes retained removal failures, which must stay inert and visible. */
  isRemoving(id: string): boolean { const item: OutputTargetEntry | null = this.entry(id); return item !== null && item.retired; }
  private entry(id: string): OutputTargetEntry | null { return this.entries.find(item => item.id === id) ?? null; }
  private selectedEntry(): OutputTargetEntry | null { return this.selection === null ? null : this.entry(this.selection); }

  status(): OutputSessionSnapshot | null { const target: OutputCoordinator | null = this.selected(); return target === null ? null : target.status(); }
  message(): string {
    const item: OutputTargetEntry | null = this.selectedEntry();
    if (item === null) { return ''; }
    if (item.retired) {
      return item.removal !== null ? 'Closing output target.' : 'Output target remains reserved until closure is confirmed. Retry removal.';
    }
    return item.coordinator.message();
  }
  isBusy(): boolean { const item: OutputTargetEntry | null = this.selectedEntry(); return item !== null && (item.retired || item.coordinator.isBusy()); }
  appliedConfigurationId(): number { const item: OutputTargetEntry | null = this.selectedEntry(); return item === null || item.retired ? 0 : item.coordinator.appliedConfigurationId(); }
  configuration(): OutputTargetConfig | null { const target: OutputCoordinator | null = this.selected(); return target === null ? null : target.configuration(); }
  inspect(kind: OutputTargetKind): OutputCapability {
    const target: OutputCoordinator | null = this.selected();
    return target === null ? { available: false, diagnostic: 'Select an output target first.' } : target.inspect(kind);
  }
  arm(): boolean {
    const item: OutputTargetEntry | null = this.selectedEntry();
    return item !== null && !item.retired && !this.disposed && this.foreground && item.coordinator.arm();
  }
  /** Route by stable configuration identity, never by a mutable UI selection. */
  async connect(config: OutputTargetConfig, endpoint: OutputEndpoint): Promise<boolean> {
    const item: OutputTargetEntry | null = this.entry(config.targetId);
    if (item === null || item.retired || this.disposed || !this.foreground) { return false; }
    const token: number = item.token;
    try {
      const connected: boolean = await item.coordinator.connect(config, endpoint);
      const status: OutputSessionSnapshot | null = item.coordinator.status();
      return connected && !this.disposed && this.foreground && !item.retired && item.token === token &&
        this.entry(item.id) === item && status !== null && status.connection === 'connected';
    } catch { this.closeGate(item.coordinator); return false; }
  }
  async disconnect(): Promise<void> {
    const target: OutputCoordinator | null = this.selected();
    if (target !== null) { await target.disconnect(); }
  }

  refresh(): void { this.fanOut(target => { target.refresh(); }); }
  stop(): void { this.fanOut(target => { target.stop(); }); }
  disarm(): void { this.fanOut(target => { target.disarm(); }); }
  setForeground(value: boolean): void {
    this.foreground = value;
    this.fanOut(target => { target.setForeground(value); });
  }
  beginSourceControl(): void { this.fanOut(target => { target.beginSourceControl(); }); }
  beginSourceSeek(): void { this.fanOut(target => { target.beginSourceSeek(); }); }
  private fanOut(action: (target: OutputCoordinator) => void): void {
    for (const item of this.entries.slice()) {
      try { action(item.coordinator); } catch { this.closeGate(item.coordinator); }
    }
  }
  private closeGate(target: OutputCoordinator): void {
    // One bad source/target must not prevent the other targets from closing.
    try { target.disarm(); } catch { /* Continue the independent safety gates. */ }
    try { target.stop(); } catch { /* The caller still fans out to other targets. */ }
  }

  /** A failed or still-pending close retains this exact disposed coordinator.
   * A later explicit retry may delete it only after real close confirmation.
   * Duplicate removes share one operation; no completion can delete a new entry.
   */
  remove(id: string): Promise<boolean> {
    const item: OutputTargetEntry | null = this.entry(id);
    if (item === null) { return Promise.resolve(false); }
    if (item.removal !== null) { return item.removal; }
    item.retired = true; item.token++;
    const token: number = item.token;
    let complete: (value: boolean) => void = () => {};
    const operation: Promise<boolean> = new Promise<boolean>(resolve => { complete = resolve; });
    // Publish the gate before calling a target, including synchronous callbacks.
    item.removal = operation;
    void this.removeEntry(item, token).then(result => { complete(result); });
    return operation;
  }
  private async closeOperation(action: () => Promise<void>): Promise<boolean> {
    try { await action(); return true; } catch { return false; }
  }
  private async removeEntry(item: OutputTargetEntry, token: number): Promise<boolean> {
    try {
      try { item.coordinator.setForeground(false); } catch { this.closeGate(item.coordinator); }
      // Start both before awaiting: dispose permanently denies a new connect
      // even while an old connection/replacement/transport close is suspended.
      const disconnection: Promise<boolean> = this.closeOperation(() => item.coordinator.disconnect());
      const disposal: Promise<boolean> = this.closeOperation(() => item.coordinator.dispose());
      const disconnected: boolean = await disconnection;
      const disposed: boolean = await disposal;
      const status: OutputSessionSnapshot | null = item.coordinator.status();
      if (!disconnected || !disposed || item.coordinator.isBusy() ||
        (status !== null && !status.closeConfirmed) || item.token !== token || this.entry(item.id) !== item) { return false; }
      this.entries = this.entries.filter(current => current !== item);
      if (this.selection === item.id) { this.selection = this.entries.length === 0 ? null : this.entries[0].id; }
      return true;
    } catch { return false; }
    finally { if (item.token === token) { item.removal = null; } }
  }
  async dispose(): Promise<boolean> {
    this.disposed = true;
    const removals: Promise<boolean>[] = this.ids().map(id => this.remove(id));
    const results: boolean[] = await Promise.all(removals);
    return results.every(value => value) && this.entries.length === 0;
  }
}
