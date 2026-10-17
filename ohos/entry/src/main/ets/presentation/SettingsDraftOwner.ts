/** A volatile edit lease. sourceId survives remounts of an unchanged baseline. */
export class DraftLease {
  token: number;
  value: string;
  sourceId: number;
  sourceChanged: boolean;
  pending: boolean;
  overflow: boolean;
  constructor(token: number, value: string, sourceId: number, sourceChanged: boolean = false, pending: boolean = false, overflow: boolean = false) {
    this.token = token; this.value = value; this.sourceId = sourceId; this.sourceChanged = sourceChanged; this.pending = pending; this.overflow = overflow;
  }
}

class SettingsDraftEntry {
  scope: string;
  key: string;
  pending: boolean = false;
  overflow: boolean = false;
  source: string;
  value: string;
  sourceId: number;
  initial: string;
  token: number = 0;
  constructor(scope: string, key: string, source: string, value: string, sourceId: number) {
    this.scope = scope; this.key = key;
    this.source = source; this.value = value; this.initial = value; this.sourceId = sourceId;
  }
  characters(): number { return this.source.length + this.value.length + this.initial.length; }
}

/**
 * Presentation-only, bounded, process-local drafts. Never writes settings or performs I/O.
 * Opening a field retires its previous render's callbacks. Lifecycle invalidation retires
 * every callback but deliberately retains text, validation state and other draft payloads.
 */
export class SettingsDraftOwner {
  private entries: Map<string, SettingsDraftEntry> = new Map<string, SettingsDraftEntry>();
  private tokens: Map<number, string> = new Map<number, string>();
  private sequence: number = 0;
  private characters: number = 0;
  private available: boolean = true;
  private disposed: boolean = false;
  private maximumEntries: number;
  private maximumCharacters: number;
  constructor(maximumEntries: number = 16384, maximumCharacters: number = 16 * 1024 * 1024) {
    this.maximumEntries = Number.isSafeInteger(maximumEntries) && maximumEntries > 0 ? maximumEntries : 16384;
    this.maximumCharacters = Number.isSafeInteger(maximumCharacters) && maximumCharacters > 0 ? maximumCharacters : 16 * 1024 * 1024;
  }
  private next(): number {
    if (this.sequence >= Number.MAX_SAFE_INTEGER) { throw new Error('Settings draft identity exhausted.'); }
    return ++this.sequence;
  }
  private forget(key: string): void {
    const entry: SettingsDraftEntry | undefined = this.entries.get(key);
    if (entry === undefined) { return; }
    this.tokens.delete(entry.token); this.characters -= key.length + entry.characters(); this.entries.delete(key);
  }
  private makeRoom(characters: number, entries: number, protectedKey: string = ''): boolean {
    if (this.characters + characters <= this.maximumCharacters && this.entries.size + entries <= this.maximumEntries) { return true; }
    // Never silently evict an unapplied edit, nor a live control's lease.
    const reclaimable: string[] = [];
    this.entries.forEach((entry: SettingsDraftEntry, key: string) => {
      if (key !== protectedKey && entry.token === 0 && !entry.pending && entry.value === entry.initial) { reclaimable.push(key); }
    });
    for (const key of reclaimable) {
      this.forget(key);
      if (this.characters + characters <= this.maximumCharacters && this.entries.size + entries <= this.maximumEntries) { return true; }
    }
    return false;
  }
  open(scope: string, key: string, source: string, initial: string): DraftLease {
    if (this.disposed) { return new DraftLease(0, initial, 0); }
    const identity: string = JSON.stringify([scope, key]);
    let entry: SettingsDraftEntry | undefined = this.entries.get(identity);
    const sourceChanged: boolean = entry !== undefined && entry.source !== source;
    if (sourceChanged) { this.forget(identity); entry = undefined; }
    if (entry === undefined) {
      // Oversized values remain local to the live component; no unbounded owner cache.
      if (!this.makeRoom(identity.length + source.length + initial.length * 2, 1)) { return new DraftLease(0, initial, 0, sourceChanged); }
      entry = new SettingsDraftEntry(scope, key, source, initial, this.next());
      this.characters += identity.length + entry.characters();
    } else { this.tokens.delete(entry.token); this.entries.delete(identity); }
    entry.token = this.available ? this.next() : 0;
    this.entries.set(identity, entry);
    if (entry.token > 0) { this.tokens.set(entry.token, identity); }
    return new DraftLease(entry.token, entry.value, entry.sourceId, sourceChanged, entry.pending, entry.overflow);
  }
  isCurrent(token: number, source: string): boolean {
    if (!this.available || this.disposed || token <= 0) { return false; }
    const identity: string | undefined = this.tokens.get(token);
    if (identity === undefined) { return false; }
    const entry: SettingsDraftEntry | undefined = this.entries.get(identity);
    return entry !== undefined && entry.token === token && entry.source === source;
  }
  read(token: number, source: string): string | null {
    if (!this.isCurrent(token, source)) { return null; }
    const identity: string | undefined = this.tokens.get(token);
    const entry: SettingsDraftEntry | undefined = identity === undefined ? undefined : this.entries.get(identity);
    return entry === undefined ? null : entry.value;
  }
  write(token: number, source: string, value: string, pending: boolean = false): boolean {
    if (!this.isCurrent(token, source)) { return false; }
    const identity: string | undefined = this.tokens.get(token);
    if (identity === undefined) { return false; }
    const entry: SettingsDraftEntry | undefined = this.entries.get(identity);
    if (entry === undefined) { return false; }
    if (!this.makeRoom(value.length - entry.value.length, 0, identity)) {
      // A rejected oversized edit must still inhibit actions using its stale canonical value.
      if (pending) { entry.pending = true; } entry.overflow = true;
      return false;
    }
    entry.pending = pending; entry.overflow = false;
    this.characters += value.length - entry.value.length; entry.value = value;
    this.entries.delete(identity); this.entries.set(identity, entry);
    return this.isCurrent(token, source);
  }
  peek(scope: string, key: string): string | null {
    const entry: SettingsDraftEntry | undefined = this.entries.get(JSON.stringify([scope, key]));
    return entry === undefined ? null : entry.value;
  }
  hasPending(scope: string, keyPrefix: string = ''): boolean {
    let pending: boolean = false;
    this.entries.forEach((entry: SettingsDraftEntry) => {
      if (entry.scope === scope && entry.key.startsWith(keyPrefix) && entry.pending) { pending = true; }
    });
    return pending;
  }
  release(token: number): void {
    const identity: string | undefined = this.tokens.get(token);
    if (identity === undefined) { return; }
    const entry: SettingsDraftEntry | undefined = this.entries.get(identity);
    if (entry !== undefined && entry.token === token) { entry.token = 0; }
    this.tokens.delete(token);
  }
  invalidate(): void { this.tokens.clear(); this.entries.forEach((entry: SettingsDraftEntry) => { entry.token = 0; }); }
  setAvailable(available: boolean): void {
    if (this.disposed || this.available === available) { return; }
    this.available = available; this.invalidate();
  }
  clearScope(scope: string, keyPrefix: string = ''): void {
    const removed: string[] = [];
    this.entries.forEach((entry: SettingsDraftEntry, identity: string) => {
      if (entry.scope === scope && entry.key.startsWith(keyPrefix)) { removed.push(identity); }
    });
    for (const identity of removed) { this.forget(identity); }
  }
  clear(): void { this.invalidate(); this.entries.clear(); this.characters = 0; }
  dispose(): void { this.clear(); this.available = false; this.disposed = true; }
}
