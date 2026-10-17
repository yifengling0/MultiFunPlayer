import { PlaybackSessionCore } from '../core/PlaybackSessionCore';
import { NativeSettingsStore } from '../settings/NativeSettingsStore';
import { SettingsLoadResult, SettingsStoreStatus } from '../settings/SettingsStore';

/** Cold-start barrier: EntryAbility awaits native load before constructing Index. */
export class PlaybackSession extends PlaybackSessionCore {
  private static instance: PlaybackSession | null = null;
  private static initialization: Promise<PlaybackSession> | null = null;
  private store: NativeSettingsStore;
  private loadResult: SettingsLoadResult;
  private saveMessage: string = '';
  private constructor(store: NativeSettingsStore, result: SettingsLoadResult) {
    super(result.configuration); this.store = store; this.loadResult = result;
    this.observeConfigurationChanges(() => this.persist());
  }
  static initialize(filesDir: string): Promise<PlaybackSession> {
    if (PlaybackSession.instance !== null) { return Promise.resolve(PlaybackSession.instance); }
    if (PlaybackSession.initialization === null) { PlaybackSession.initialization = PlaybackSession.create(filesDir); }
    return PlaybackSession.initialization;
  }
  private static async create(filesDir: string): Promise<PlaybackSession> {
    const store = new NativeSettingsStore(filesDir);
    const result = await store.load();
    const session = new PlaybackSession(store, result);
    PlaybackSession.instance = session; return session;
  }
  static current(): PlaybackSession {
    if (PlaybackSession.instance === null) { throw new Error('Settings must load before creating the playback interface.'); }
    return PlaybackSession.instance;
  }
  static flushIfReady(): void { if (PlaybackSession.instance !== null) { PlaybackSession.instance.flush(); } }
  settingsStatus(): SettingsStoreStatus { return this.store.status(); }
  settingsMessage(): string {
    const state = this.store.status();
    if (state.readOnly) { return 'Settings are read-only. The original file is preserved. ' + this.loadResult.diagnostics.map(item => item.message).join(' '); }
    if (state.recoveryRequired) { return 'Settings recovery needs your review (' + this.loadResult.source + '). ' + this.loadResult.diagnostics.map(item => item.message).join(' '); }
    if (state.lastError !== null) { return 'Settings not saved: ' + state.lastError; }
    if (state.dirty || state.saving) { return 'Saving settings…'; }
    return this.saveMessage || 'Settings loaded · output needs explicit connect and arm';
  }
  protected assertConfigurationWritable(): void {
    const status = this.store.status();
    if (status.readOnly || status.recoveryRequired) { throw new Error(this.settingsMessage()); }
  }
  /** Called only from an explicit, visible recovery confirmation in the UI. */
  acceptSettingsRecovery(): void { this.store.acceptRecovery(); this.persist(); }
  retrySettingsSave(): void { this.store.retry().then(result => { this.saveMessage = result.status === 'saved' ? 'Settings saved' : result.error || 'Settings not saved'; }); }
  flush(): void { this.store.flush().catch((error: Error) => { this.saveMessage = 'Settings not saved: ' + error.message; }); }
  private persist(): void {
    this.store.save(this.configurationSnapshot()).then(result => {
      if (result.status === 'saved') { this.saveMessage = 'Settings saved' + (this.hasPendingProfileChanges() ? ' · restart to apply the device profile' : ''); }
      else if (result.status !== 'superseded') { this.saveMessage = result.error || 'Settings not saved'; }
    });
  }
}
