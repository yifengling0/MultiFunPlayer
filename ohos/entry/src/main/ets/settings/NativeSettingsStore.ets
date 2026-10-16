import { fileIo } from '@kit.CoreFileKit';
import { util } from '@kit.ArkTS';
import { BusinessError } from '@kit.BasicServicesKit';
import { SettingsSchema } from './SettingsSchema';
import { SettingsStore, SettingsStorePort, SettingsSlot } from './SettingsStore';

/** Application sandbox only. Supply UIAbilityContext.filesDir; never a picker or public directory URI. */
export class NativeSettingsStorePort implements SettingsStorePort {
  private directory: string;
  private writing: boolean = false;
  constructor(filesDir: string) {
    if (typeof filesDir !== 'string' || !filesDir.startsWith('/') || filesDir === '/' ||
      /[\u0000-\u001f\u007f\\?#]/.test(filesDir) ||
      filesDir.split('/').some(part => part === '.' || part === '..')) {
      throw new Error('Settings require the application context filesDir.');
    }
    this.directory = filesDir.endsWith('/') ? filesDir.slice(0, -1) : filesDir;
  }

  private path(slot: SettingsSlot): string {
    return this.directory + (slot === 'primary' ? '/configuration.json' : '/configuration.backup.json');
  }

  async read(slot: SettingsSlot): Promise<string | null> {
    let file: fileIo.File;
    try {
      file = await fileIo.open(this.path(slot), fileIo.OpenMode.READ_ONLY | fileIo.OpenMode.NOFOLLOW | fileIo.OpenMode.NONBLOCK);
    } catch (error) {
      if ((error as BusinessError).code === 13900002) { return null; }
      throw new Error(NativeSettingsStorePort.failure('Cannot open ' + slot + ' settings', error as BusinessError));
    }
    let contents: string = '';
    let failed: string | null = null;
    try {
      const stat = await fileIo.stat(file.fd);
      if (!stat.isFile() || !Number.isInteger(stat.size) || stat.size < 0 || stat.size > SettingsSchema.MAX_JSON_LENGTH * 4) {
        throw new Error('Settings must be a bounded regular UTF-8 file.');
      }
      const buffer = new ArrayBuffer(stat.size);
      let position: number = 0;
      while (position < stat.size) {
        const chunk = new ArrayBuffer(Math.min(65536, stat.size - position));
        const count = await fileIo.read(file.fd, chunk);
        if (!Number.isInteger(count) || count < 1 || count > chunk.byteLength) { throw new Error('Settings file ended during read.'); }
        new Uint8Array(buffer).set(new Uint8Array(chunk, 0, count), position); position += count;
      }
      if (await fileIo.read(file.fd, new ArrayBuffer(1)) !== 0) { throw new Error('Settings file changed during read.'); }
      contents = util.TextDecoder.create('utf-8', { fatal: true }).decodeToString(new Uint8Array(buffer));
    } catch (error) {
      failed = NativeSettingsStorePort.failure('Cannot read ' + slot + ' settings', error as BusinessError);
    } finally {
      try { await fileIo.close(file); }
      catch (error) { failed = (failed === null ? '' : failed + ' ') + NativeSettingsStorePort.failure('Cannot confirm settings read-handle cleanup', error as BusinessError); }
    }
    if (failed !== null) { throw new Error(failed); }
    return contents;
  }

  async writeAtomic(json: string, previousValidJson: string | null): Promise<void> {
    if (this.writing) { throw new Error('Settings must use a single writer.'); }
    const next = SettingsSchema.decode(json);
    const previous = previousValidJson === null ? null : SettingsSchema.decode(previousValidJson);
    if (next.status !== 'valid' || next.configuration === null ||
      (previous !== null && (previous.status !== 'valid' || previous.configuration === null))) {
      throw new Error('Refusing to persist invalid configuration.');
    }
    // Enforce the whitelist at the native boundary too, even when used without SettingsStore.
    const canonical = SettingsSchema.encode(next.configuration);
    const canonicalPrevious = previous === null || previous.configuration === null ? null : SettingsSchema.encode(previous.configuration);
    this.writing = true;
    try {
      // Never copy the on-disk primary to the backup: it might be the damaged file
      // from which recovery was requested. The store supplies the last validated snapshot.
      if (canonicalPrevious !== null) { await this.replace('backup', canonicalPrevious); }
      await this.replace('primary', canonical);
    } finally { this.writing = false; }
  }

  private async replace(slot: SettingsSlot, json: string): Promise<void> {
    const target = this.path(slot);
    const temporary = target + '.pending';
    let file: fileIo.File | null = null;
    let staged: boolean = false;
    let failed: string | null = null;
    try {
      file = await fileIo.open(temporary, fileIo.OpenMode.WRITE_ONLY | fileIo.OpenMode.CREATE |
        fileIo.OpenMode.TRUNC | fileIo.OpenMode.NOFOLLOW | fileIo.OpenMode.NONBLOCK);
      staged = true;
      if (!(await fileIo.stat(file.fd)).isFile()) { throw new Error('Settings temporary path must be a regular file.'); }
      const bytes = new util.TextEncoder().encodeInto(json);
      let offset: number = 0;
      while (offset < bytes.byteLength) {
        const chunk = bytes.slice(offset, Math.min(bytes.byteLength, offset + 65536));
        const count = await fileIo.write(file.fd, chunk.buffer as ArrayBuffer);
        if (!Number.isInteger(count) || count <= 0 || count > chunk.byteLength) { throw new Error('Settings write was incomplete.'); }
        offset += count;
      }
      await fileIo.fsync(file.fd);
      const closing = file; file = null; await fileIo.close(closing);
      // Same-directory rename replaces atomically on the supported sandbox filesystem.
      // If the platform rejects replacement, surface that failure; never unlink the old target.
      await fileIo.rename(temporary, target); staged = false;
      // File contents were fsynced before rename. Directory-entry durability across power loss
      // and actual platform replacement semantics still require device fault-injection tests.
    } catch (error) {
      failed = NativeSettingsStorePort.failure('Cannot save ' + slot + ' settings', error as BusinessError);
    } finally {
      if (file !== null) {
        // A rejected close has an indeterminate FD outcome. Do not retry a possibly
        // closed/reused descriptor; still finish temporary-file cleanup below.
        try { await fileIo.close(file); }
        catch (error) { failed = (failed === null ? '' : failed + ' ') + NativeSettingsStorePort.failure('Cannot confirm settings handle cleanup', error as BusinessError); }
      }
      if (staged) {
        // Only the exact application-owned staging file is cleaned up; no directory scan.
        try { await fileIo.unlink(temporary); }
        catch (error) { failed = (failed === null ? '' : failed + ' ') + NativeSettingsStorePort.failure('Cannot remove settings temporary file', error as BusinessError); }
      }
    }
    if (failed !== null) { throw new Error(failed); }
  }

  private static failure(action: string, error: BusinessError): string {
    const permission = error.code === 201 || error.code === 13900001 || error.code === 13900012;
    return action + ': ' + (permission ? 'permission denied' : (error.message || 'IO error')) +
      (typeof error.code === 'number' ? ' (' + error.code + ')' : '') + '. Settings have not been reported as saved.';
  }
}

export class NativeSettingsStore extends SettingsStore {
  constructor(filesDir: string, debounceMs: number = 100) {
    super(new NativeSettingsStorePort(filesDir), debounceMs);
  }
}
