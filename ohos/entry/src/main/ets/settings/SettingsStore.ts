import { ConfigurationDiagnostic } from '../core/DeviceProfile';
import { AppConfiguration, SettingsSchema } from './SettingsSchema';

export type SettingsSlot = 'primary' | 'backup';
/** null means ENOENT only. Permission/read errors must reject. writeAtomic must keep the old primary on failure. */
export interface SettingsStorePort {
  read(slot: SettingsSlot): Promise<string | null>;
  writeAtomic(json: string, previousValidJson: string | null): Promise<void>;
}
export type SettingsLoadSource = 'primary' | 'backup' | 'defaults';
export class SettingsLoadResult {
  configuration: AppConfiguration;
  source: SettingsLoadSource;
  diagnostics: ConfigurationDiagnostic[];
  readOnly: boolean;
  recoveryRequired: boolean;
  constructor(configuration: AppConfiguration, source: SettingsLoadSource, diagnostics: ConfigurationDiagnostic[],
    readOnly: boolean, recoveryRequired: boolean) {
    this.configuration = SettingsSchema.clone(configuration); this.source = source;
    this.diagnostics = diagnostics.map(value => new ConfigurationDiagnostic(value.path, value.code, value.message, value.severity));
    this.readOnly = readOnly; this.recoveryRequired = recoveryRequired;
  }
}
export type SettingsSaveStatus = 'saved' | 'superseded' | 'failed' | 'blocked';
export class SettingsSaveResult {
  revision: number;
  savedRevision: number;
  status: SettingsSaveStatus;
  error: string | null;
  constructor(revision: number, savedRevision: number, status: SettingsSaveStatus, error: string | null = null) {
    this.revision = revision; this.savedRevision = savedRevision; this.status = status; this.error = error;
  }
}
export class SettingsStoreStatus {
  loaded: boolean;
  revision: number;
  savedRevision: number;
  dirty: boolean;
  saving: boolean;
  readOnly: boolean;
  recoveryRequired: boolean;
  lastError: string | null;
  constructor(loaded: boolean, revision: number, savedRevision: number, saving: boolean,
    readOnly: boolean, recoveryRequired: boolean, lastError: string | null) {
    this.loaded = loaded; this.revision = revision; this.savedRevision = savedRevision;
    this.dirty = revision > savedRevision; this.saving = saving;
    this.readOnly = readOnly; this.recoveryRequired = recoveryRequired; this.lastError = lastError;
  }
}
class SaveWaiter {
  revision: number;
  resolve: (result: SettingsSaveResult) => void;
  constructor(revision: number, resolve: (result: SettingsSaveResult) => void) { this.revision = revision; this.resolve = resolve; }
}
class PendingWrite {
  revision: number;
  json: string;
  waiters: SaveWaiter[];
  constructor(revision: number, json: string, waiters: SaveWaiter[]) { this.revision = revision; this.json = json; this.waiters = waiters; }
}

/** One instance per application sandbox. Reads never write, even on repair/default recovery. */
export class SettingsStore {
  private port: SettingsStorePort;
  private debounceMs: number;
  private loaded: boolean = false;
  private loadPromise: Promise<SettingsLoadResult> | null = null;
  private configuration: AppConfiguration = SettingsSchema.defaults();
  private source: SettingsLoadSource = 'defaults';
  private diagnostics: ConfigurationDiagnostic[] = [];
  private readOnly: boolean = false;
  private recoveryRequired: boolean = false;
  private revision: number = 0;
  private savedRevision: number = 0;
  private savedJson: string | null = null;
  private latestJson: string | null = null;
  private lastError: string | null = null;
  private pending: PendingWrite | null = null;
  private draining: boolean = false;
  private timer: number | null = null;
  private flushWaiters: (() => void)[] = [];

  constructor(port: SettingsStorePort, debounceMs: number = 100) {
    if (!Number.isFinite(debounceMs) || debounceMs < 0 || debounceMs > 60000) { throw new Error('Invalid save debounce.'); }
    this.port = port; this.debounceMs = debounceMs;
  }

  async load(): Promise<SettingsLoadResult> {
    if (this.loaded) { return this.loadResult(); }
    if (this.loadPromise === null) {
      this.loadPromise = this.loadOnce().catch((error: Error): SettingsLoadResult => {
        // Unexpected codec/adapter failures must never leave a permanently rejected load
        // promise with an apparently writable or successfully loaded store.
        this.configuration = SettingsSchema.defaults(); this.source = 'defaults';
        this.readOnly = true; this.loaded = true; this.lastError = SettingsStore.failureMessage(error);
        this.diagnostics.push(new ConfigurationDiagnostic('', 'load_failed', this.lastError));
        return this.loadResult();
      });
    }
    await this.loadPromise;
    return this.loadResult();
  }

  snapshot(): AppConfiguration { return SettingsSchema.clone(this.configuration); }
  status(): SettingsStoreStatus {
    return new SettingsStoreStatus(this.loaded, this.revision, this.savedRevision,
      this.draining || this.pending !== null, this.readOnly, this.recoveryRequired, this.lastError);
  }

  /** Call only after presenting recovery diagnostics and the user chooses to keep the recovered/default configuration. */
  acceptRecovery(): void {
    if (!this.loaded || this.readOnly) { throw new Error('This configuration cannot be replaced.'); }
    this.recoveryRequired = false;
  }

  save(configuration: AppConfiguration): Promise<SettingsSaveResult> {
    if (!this.loaded || this.readOnly || this.recoveryRequired) {
      const reason = !this.loaded ? 'Load settings before saving.' : this.readOnly ?
        'Settings are read-only; preserve the original file and resolve the load error.' :
        'Review and accept configuration recovery before saving.';
      return Promise.resolve(new SettingsSaveResult(this.revision, this.savedRevision, 'blocked', reason));
    }
    let json: string;
    try { json = SettingsSchema.encode(configuration); }
    catch (error) {
      this.lastError = SettingsStore.failureMessage(error as Object | null);
      return Promise.resolve(new SettingsSaveResult(this.revision, this.savedRevision, 'failed', this.lastError));
    }
    this.configuration = SettingsSchema.decode(json).configuration as AppConfiguration;
    this.latestJson = json; this.revision++;
    const revision = this.revision;
    return new Promise<SettingsSaveResult>(resolve => {
      const waiter = new SaveWaiter(revision, resolve);
      if (this.pending === null) { this.pending = new PendingWrite(revision, json, [waiter]); }
      else {
        this.pending.revision = revision; this.pending.json = json; this.pending.waiters.push(waiter);
      }
      if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
      if (!this.draining) {
        this.timer = setTimeout(() => { this.timer = null; this.drain(); }, this.debounceMs);
      }
    });
  }

  /** Retries the latest requested snapshot, never the stale snapshot whose IO failed. */
  retry(): Promise<SettingsSaveResult> {
    if (this.latestJson === null) {
      return Promise.resolve(new SettingsSaveResult(this.revision, this.savedRevision, 'blocked', 'No failed or pending save to retry.'));
    }
    const configuration = SettingsSchema.decode(this.latestJson).configuration;
    if (configuration === null) { return Promise.resolve(new SettingsSaveResult(this.revision, this.savedRevision, 'failed', 'Invalid pending snapshot.')); }
    return this.save(configuration);
  }

  /** Bypasses debounce and waits for all currently queued saves and in-flight writes. */
  flush(): Promise<void> {
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
    if (!this.draining && this.pending === null) { return Promise.resolve(); }
    return new Promise<void>(resolve => {
      this.flushWaiters.push(resolve);
      if (!this.draining) { this.drain(); }
    });
  }

  private async loadOnce(): Promise<SettingsLoadResult> {
    let primary: string | null;
    try { primary = await this.port.read('primary'); }
    catch (error) {
      this.readOnly = true; this.lastError = SettingsStore.failureMessage(error as Object | null);
      this.diagnostics.push(new ConfigurationDiagnostic('primary', 'read_failed', this.lastError));
      this.loaded = true; return this.loadResult();
    }
    if (primary !== null) {
      const decoded = SettingsSchema.decode(primary);
      this.diagnostics = decoded.diagnostics;
      if (decoded.status === 'valid' && decoded.configuration !== null) {
        this.configuration = decoded.configuration; this.source = 'primary';
        this.savedJson = SettingsSchema.encode(decoded.configuration);
        this.loaded = true; return this.loadResult();
      }
      if (decoded.status === 'unsupported') {
        this.readOnly = true; this.loaded = true; return this.loadResult();
      }
      this.recoveryRequired = true;
    }
    let backup: string | null;
    try { backup = await this.port.read('backup'); }
    catch (error) {
      this.readOnly = true; this.lastError = SettingsStore.failureMessage(error as Object | null);
      this.diagnostics.push(new ConfigurationDiagnostic('backup', 'read_failed', this.lastError));
      this.loaded = true; return this.loadResult();
    }
    if (backup !== null) {
      const decoded = SettingsSchema.decode(backup);
      this.diagnostics = this.diagnostics.concat(decoded.diagnostics);
      if (decoded.status === 'valid' && decoded.configuration !== null) {
        this.configuration = decoded.configuration; this.source = 'backup';
        this.savedJson = SettingsSchema.encode(decoded.configuration); this.recoveryRequired = true;
        this.diagnostics.push(new ConfigurationDiagnostic('backup', 'backup_recovered', 'Loaded the last valid backup; the primary file has not been changed.', 'warning'));
      } else {
        this.recoveryRequired = true;
        if (decoded.status === 'unsupported') { this.readOnly = true; }
      }
    }
    if (this.source === 'defaults') {
      this.diagnostics.push(new ConfigurationDiagnostic('', primary === null && backup === null ? 'first_run' : 'defaults_recovered',
        primary === null && backup === null ? 'No stored settings; using defaults.' : 'No usable settings; using defaults without changing stored files.', 'warning'));
    }
    this.loaded = true; return this.loadResult();
  }

  private static failureMessage(error: Object | null): string {
    if (error !== null && typeof error === 'object' && typeof (error as Error).message === 'string') {
      return (error as Error).message;
    }
    return String(error);
  }

  private loadResult(): SettingsLoadResult {
    return new SettingsLoadResult(this.configuration, this.source, this.diagnostics, this.readOnly, this.recoveryRequired);
  }

  private async drain(): Promise<void> {
    if (this.draining) { return; }
    this.draining = true;
    while (this.pending !== null) {
      const writing = this.pending;
      this.pending = null;
      try {
        await this.port.writeAtomic(writing.json, this.savedJson);
        this.savedJson = writing.json; this.savedRevision = writing.revision; this.lastError = null;
        for (const waiter of writing.waiters) {
          waiter.resolve(new SettingsSaveResult(waiter.revision, this.savedRevision,
            waiter.revision === writing.revision ? 'saved' : 'superseded'));
        }
      } catch (error) {
        this.lastError = SettingsStore.failureMessage(error as Object | null);
        for (const waiter of writing.waiters) {
          waiter.resolve(new SettingsSaveResult(waiter.revision, this.savedRevision, 'failed', this.lastError));
        }
      }
    }
    this.draining = false;
    const waiting = this.flushWaiters; this.flushWaiters = [];
    for (const resolve of waiting) { resolve(); }
  }
}
