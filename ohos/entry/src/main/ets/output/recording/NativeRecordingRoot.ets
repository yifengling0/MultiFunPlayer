import { common } from '@kit.AbilityKit';
import { fileIo } from '@kit.CoreFileKit';
import { BusinessError } from '@kit.BasicServicesKit';
import native from 'libmfp_recording.so';
import { DownloadLibrary } from '../../library/DownloadLibrary';
import type { RecordingRootCapability, RecordingFile } from './RecordingPort';
import { RecordingPublicationError } from './RecordingPort';

class NativeRecordingFile implements RecordingFile {
  readonly name: string;
  readonly token: string;
  private closed: boolean = false;
  constructor(name: string, token: string) { this.name = name; this.token = token; }
  write(bytes: Uint8Array): Promise<number> {
    if (this.closed) { return Promise.reject(new Error('Recording file is closed.')); }
    return native.write(this.token, bytes);
  }
  flush(): Promise<void> { return native.flush(this.token); }
  async close(): Promise<void> { if (!this.closed) { await native.close(this.token); this.closed = true; } }
}
/** Capability is created ONLY by the system Download service. No import picker,
 * arbitrary path constructor, broad Download scan, or guessed public path.
 * Native bridge pins no-follow directory FDs, checks namespace ownership and
 * mode, creates O_EXCL .partial files, and publishes with no-replace linkat.
 */
export class NativeRecordingRoot implements RecordingRootCapability {
  readonly displayPath: string;
  private path: string;
  private owned: NativeRecordingFile[] = [];
  private constructor(path: string, displayPath: string) { this.path = path; this.displayPath = displayPath; }
  static async prepare(context: common.UIAbilityContext): Promise<NativeRecordingRoot> {
    const directory = await DownloadLibrary.prepare(context);
    // Native mkdirat runs only after no-follow validation of the system root.
    const path: string = await native.prepareRoot(directory.path);
    const root = new NativeRecordingRoot(path, directory.displayPath + '/recordings');
    await root.validate(); return root;
  }
  async validate(): Promise<void> {
    const stat = await fileIo.lstat(this.path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) { throw new Error('Recording namespace must be a real directory.'); }
    // Native create independently verifies every component and root ownership;
    // lstat alone never authorizes opening a filename.
  }
  async createPartial(name: string): Promise<RecordingFile> {
    if (!/^[A-Za-z0-9_-]{1,96}\.[A-Za-z][A-Za-z0-9_-]{0,31}\.(csv|funscript)$/.test(name)) { throw new Error('Invalid recording filename.'); }
    const file = new NativeRecordingFile(name, await native.create(this.path, name));
    this.owned.push(file); return file;
  }
  private checked(files: ReadonlyArray<RecordingFile>): NativeRecordingFile[] {
    const result: NativeRecordingFile[] = [];
    for (const file of files) {
      const owned = this.owned.find((candidate: NativeRecordingFile): boolean => candidate === file);
      if (owned === undefined || result.indexOf(owned) >= 0) { throw new Error('Recording handle does not belong to this root.'); }
      result.push(owned);
    }
    return result;
  }
  async commit(files: ReadonlyArray<RecordingFile>): Promise<ReadonlyArray<string>> {
    const owned = this.checked(files);
    const published: string[] = [];
    for (const file of owned) {
      try { await native.finalize(file.token); published.push(this.displayPath + '/' + file.name); }
      catch (error) {
        // EUCLEAN explicitly means link publication succeeded before cleanup or
        // directory sync failed. Report this actual file, never retry finalize.
        if (String((error as BusinessError).code) === '117') { published.push(this.displayPath + '/' + file.name); }
        throw new RecordingPublicationError('Recording publication failed; completed files may coexist with .partial files: ' + String(error), published);
      }
    }
    for (const file of owned) {
      try { await native.release(file.token); }
      catch (error) { throw new RecordingPublicationError('Files published but handle release failed: ' + String(error), published); }
    }
    this.owned = this.owned.filter((file: NativeRecordingFile): boolean => owned.indexOf(file) < 0);
    return published;
  }
  async abort(files: ReadonlyArray<RecordingFile>): Promise<void> {
    const owned = this.checked(files);
    let failure: string = '';
    for (const file of owned) {
      try { await native.abort(file.token); }
      catch (error) { failure += String(error) + '; '; }
    }
    this.owned = this.owned.filter((file: NativeRecordingFile): boolean => owned.indexOf(file) < 0);
    if (failure.length > 0) { throw new Error('Recording handle cleanup failed; partial files retained: ' + failure); }
  }
}
