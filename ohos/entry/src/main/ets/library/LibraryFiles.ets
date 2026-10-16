import { fileIo, fileUri } from '@kit.CoreFileKit';
import { util } from '@kit.ArkTS';
import { BusinessError } from '@kit.BasicServicesKit';

export interface LibraryFile {
  // Original picker URI, or an accessible child path. fileIo.open accepts either.
  uri: string;
  name: string;
  relativePath: string;
}

export interface LibraryScanProgress {
  files: LibraryFile[];
  visited: number;
  skipped: number;
}

export interface LibraryScanResult extends LibraryScanProgress {
  truncated: boolean;
  warnings: string[];
}

interface PendingDirectory {
  path: string;
  relativePath: string;
  depth: number;
}

/** Read-only, session-scoped indexing. No broad storage permission or persisted grant is requested. */
export class LibraryFiles {
  private static readonly MAX_ENTRIES: number = 1000;
  private static readonly MAX_DEPTH: number = 4;
  private static readonly CHUNK_SIZE: number = 32;
  private static readonly MAX_SCRIPT_BYTES: number = 2 * 1024 * 1024;
  private static readonly READ_CHUNK_BYTES: number = 64 * 1024;

  static nameOf(uri: string): string {
    try {
      const name = new fileUri.FileUri(uri).name;
      if (name.length > 0) { return name; }
    } catch (error) { /* The provider may expose only an opaque URI. */ }
    return 'Selected file';
  }

  private static checkCurrent(isCurrent: () => boolean): void {
    if (!isCurrent()) { throw new Error('Scan cancelled'); }
  }

  private static emptyResult(): LibraryScanResult {
    return { files: [], visited: 0, skipped: 0, truncated: false, warnings: [] };
  }

  private static snapshot(result: LibraryScanResult): LibraryScanProgress {
    return {
      files: result.files.map((file: LibraryFile): LibraryFile => {
        return { uri: file.uri, name: file.name, relativePath: file.relativePath };
      }),
      visited: result.visited,
      skipped: result.skipped
    };
  }

  private static warn(result: LibraryScanResult, message: string): void {
    // Keep diagnostics bounded even when a whole subtree is inaccessible.
    if (result.warnings.length < 8 && result.warnings.indexOf(message) < 0) { result.warnings.push(message); }
  }

  private static failure(label: string, error: BusinessError): string {
    const detail = error.message || String(error);
    if (error.code === 201 || error.code === 13900001 || error.code === 13900012) {
      return `${label}: permission denied or access expired. Refresh the library and retry. (${error.code})`;
    }
    return `${label}: ${detail}`;
  }

  private static safeLeaf(name: string): boolean {
    // listFile(recursion:false) must return one actual child name. Never accept a path,
    // dot segment or encoded traversal component supplied by an unusual provider.
    return name.length > 0 && name.length <= 1024 && name !== '.' && name !== '..' &&
      name.indexOf('/') < 0 && name.indexOf('\\') < 0 && !/[\u0000-\u001f\u007f-\u009f]/.test(name) &&
      !/%(?:2e|2f|5c|00|25)/i.test(name);
  }

  private static supportedFileName(name: string): boolean {
    const dot = name.lastIndexOf('.');
    if (dot <= 0 || name.slice(0, dot).trim().length === 0) { return false; }
    const extension = name.slice(dot + 1).toLowerCase();
    return extension === 'mp4' || extension === 'mkv' || extension === 'ts' ||
      extension === 'm4v' || extension === 'zip' || extension.endsWith('funscript');
  }

  private static directoryPath(uri: string): string {
    let path = new fileUri.FileUri(uri).path;
    while (path.length > 1 && path.endsWith('/')) { path = path.slice(0, path.length - 1); }
    if (!path.startsWith('/') || /[\u0000-\u001f\u007f-\u009f]/.test(path) || path.indexOf('\\') >= 0 ||
      path.split('/').some((part: string): boolean => part === '.' || part === '..')) {
      throw new Error('The library directory does not expose a usable local path. Refresh the library and retry.');
    }
    return path;
  }

  private static childPath(parent: string, name: string): string {
    return parent === '/' ? `/${name}` : `${parent}/${name}`;
  }

  private static async yieldProgress(result: LibraryScanResult, isCurrent: () => boolean,
    onProgress: (progress: LibraryScanProgress) => void): Promise<void> {
    LibraryFiles.checkCurrent(isCurrent);
    onProgress(LibraryFiles.snapshot(result));
    // Native asynchronous I/O alone need not yield a rendering frame when cached.
    await new Promise<void>((resolve) => { setTimeout(() => resolve(), 0); });
    LibraryFiles.checkCurrent(isCurrent);
  }

  static async scanDirectory(uri: string, isCurrent: () => boolean,
    onProgress: (progress: LibraryScanProgress) => void): Promise<LibraryScanResult> {
    LibraryFiles.checkCurrent(isCurrent);
    const root = LibraryFiles.directoryPath(uri);
    const result = LibraryFiles.emptyResult();
    const queue: PendingDirectory[] = [{ path: root, relativePath: '', depth: 0 }];
    let queueIndex: number = 0;
    while (queueIndex < queue.length && result.visited < LibraryFiles.MAX_ENTRIES) {
      LibraryFiles.checkCurrent(isCurrent);
      const directory = queue[queueIndex++];
      let names: string[] = [];
      try {
        // Recheck immediately before listing as well as before queueing. Never recurse
        // with listFile(recursion:true), which cannot enforce our depth/symlink limit.
        const stat = await fileIo.lstat(directory.path);
        LibraryFiles.checkCurrent(isCurrent);
        if (stat.isSymbolicLink() || !stat.isDirectory()) {
          if (directory.depth === 0) { throw new Error('The library location is not a real directory or is a symbolic link.'); }
          result.skipped++;
          LibraryFiles.warn(result, 'A changed folder or symbolic link was skipped.');
          continue;
        }
        const remaining = LibraryFiles.MAX_ENTRIES - result.visited;
        names = await fileIo.listFile(directory.path, { recursion: false, listNum: remaining });
        LibraryFiles.checkCurrent(isCurrent);
        // listFile has no paging API. At the exact cap, completeness is unknown.
        if (names.length >= remaining) { result.truncated = true; }
      } catch (error) {
        LibraryFiles.checkCurrent(isCurrent);
        const message = LibraryFiles.failure('Cannot read folder', error as BusinessError);
        if (directory.depth === 0) { throw new Error(message); }
        result.skipped++;
        LibraryFiles.warn(result, message);
        continue;
      }
      // Sorting this bounded batch produces a stable order for a stable directory.
      names.sort();
      for (const name of names) {
        LibraryFiles.checkCurrent(isCurrent);
        if (result.visited >= LibraryFiles.MAX_ENTRIES) { result.truncated = true; break; }
        result.visited++;
        if (!LibraryFiles.safeLeaf(name)) {
          result.skipped++;
          LibraryFiles.warn(result, 'Unsafe or unsupported directory entry names were skipped.');
        } else {
          const path = LibraryFiles.childPath(directory.path, name);
          const relativePath = directory.relativePath.length > 0 ? `${directory.relativePath}/${name}` : name;
          try {
            const stat = await fileIo.lstat(path);
            LibraryFiles.checkCurrent(isCurrent);
            if (stat.isSymbolicLink()) { result.skipped++; }
            else if (stat.isDirectory()) {
              if (directory.depth < LibraryFiles.MAX_DEPTH) {
                queue.push({ path: path, relativePath: relativePath, depth: directory.depth + 1 });
              } else {
                result.skipped++; result.truncated = true;
                LibraryFiles.warn(result, 'Folders beyond four subdirectory levels were skipped.');
              }
            } else if (stat.isFile() && LibraryFiles.supportedFileName(name)) {
              result.files.push({ uri: path, name: name, relativePath: relativePath });
            } else { result.skipped++; }
          } catch (error) {
            LibraryFiles.checkCurrent(isCurrent);
            result.skipped++;
            LibraryFiles.warn(result, LibraryFiles.failure('Cannot inspect a folder entry', error as BusinessError));
          }
        }
        if (result.visited % LibraryFiles.CHUNK_SIZE === 0) {
          await LibraryFiles.yieldProgress(result, isCurrent, onProgress);
        }
      }
    }
    if (queueIndex < queue.length) { result.truncated = true; }
    if (result.truncated) {
      LibraryFiles.warn(result, 'Scan is limited to 1,000 entries and four subdirectory levels; this index may be incomplete.');
    }
    await LibraryFiles.yieldProgress(result, isCurrent, onProgress);
    return result;
  }

  static async fromSelectedUris(uris: string[], isCurrent: () => boolean,
    onProgress: (progress: LibraryScanProgress) => void): Promise<LibraryScanResult> {
    const result = LibraryFiles.emptyResult();
    const seen: Set<string> = new Set<string>();
    for (const uri of uris) {
      LibraryFiles.checkCurrent(isCurrent);
      if (result.visited >= LibraryFiles.MAX_ENTRIES) { result.truncated = true; break; }
      result.visited++;
      if (seen.has(uri)) { result.skipped++; }
      else {
        seen.add(uri);
        let opened: fileIo.File | undefined = undefined;
        try {
          if (/[\u0000-\u001f\u007f-\u009f]/.test(uri)) { throw new Error('The selected URI contains control characters.'); }
          const parsed = new fileUri.FileUri(uri);
          const name = parsed.name;
          if (!LibraryFiles.safeLeaf(name)) { throw new Error('This provider does not expose a usable file name.'); }
          if (!LibraryFiles.supportedFileName(name)) { result.skipped++; }
          else {
            // A picker can expose a URI even when a raw path cannot be opened. Use only
            // that exact selected URI; do not try its parent or invent a broader grant.
            opened = await fileIo.open(uri, fileIo.OpenMode.READ_ONLY | fileIo.OpenMode.NOFOLLOW | fileIo.OpenMode.NONBLOCK);
            LibraryFiles.checkCurrent(isCurrent);
            const stat = await fileIo.stat(opened.fd);
            LibraryFiles.checkCurrent(isCurrent);
            if (!stat.isFile()) { throw new Error('Select regular files, not directories or special files.'); }
            // Preserve provider/parent identity so equal names in different folders do
            // not pair accidentally. This is an identity path, not an access grant.
            const localIdentity = parsed.path.replace(/^\/+/, '');
            const parts = localIdentity.split('/');
            if (parts.some((part: string): boolean => !LibraryFiles.safeLeaf(part)) || parts[parts.length - 1] !== name) {
              throw new Error('This provider does not expose a safe parent/file identity.');
            }
            const identityPath = `selected/${encodeURIComponent(parsed.scheme + '@' + parsed.authority)}/${localIdentity}`;
            result.files.push({ uri: uri, name: name, relativePath: identityPath });
          }
        } catch (error) {
          LibraryFiles.checkCurrent(isCurrent);
          result.skipped++;
          LibraryFiles.warn(result, LibraryFiles.failure('Cannot inspect selected file', error as BusinessError));
        } finally {
          if (opened !== undefined) { await fileIo.close(opened); }
        }
      }
      if (result.visited % LibraryFiles.CHUNK_SIZE === 0) {
        await LibraryFiles.yieldProgress(result, isCurrent, onProgress);
      }
    }
    if (result.truncated) { LibraryFiles.warn(result, 'Only the first 1,000 selected entries were indexed.'); }
    await LibraryFiles.yieldProgress(result, isCurrent, onProgress);
    return result;
  }

  static async readScript(uri: string, isCurrent: () => boolean = (): boolean => true): Promise<string> {
    LibraryFiles.checkCurrent(isCurrent);
    let file: fileIo.File;
    try {
      file = await fileIo.open(uri, fileIo.OpenMode.READ_ONLY | fileIo.OpenMode.NOFOLLOW | fileIo.OpenMode.NONBLOCK);
    } catch (error) {
      LibraryFiles.checkCurrent(isCurrent);
      throw new Error(LibraryFiles.failure('Cannot open script', error as BusinessError));
    }
    let contents: string = '';
    try {
      LibraryFiles.checkCurrent(isCurrent);
      const stat = await fileIo.stat(file.fd);
      LibraryFiles.checkCurrent(isCurrent);
      if (!stat.isFile() || !Number.isInteger(stat.size) || stat.size < 1 || stat.size > LibraryFiles.MAX_SCRIPT_BYTES) {
        throw new Error('The script must be a nonempty regular UTF-8 file no larger than 2 MiB.');
      }
      const buffer = new ArrayBuffer(stat.size);
      let offset: number = 0;
      while (offset < stat.size) {
        LibraryFiles.checkCurrent(isCurrent);
        const chunk = new ArrayBuffer(Math.min(LibraryFiles.READ_CHUNK_BYTES, stat.size - offset));
        const count = await fileIo.read(file.fd, chunk);
        LibraryFiles.checkCurrent(isCurrent);
        if (!Number.isInteger(count) || count <= 0 || count > chunk.byteLength) {
          throw new Error('Script read ended unexpectedly. Refresh the library and retry.');
        }
        new Uint8Array(buffer).set(new Uint8Array(chunk, 0, count), offset);
        offset += count;
      }
      // Detect growth instead of silently parsing a truncated prefix of a changing file.
      const extra = new ArrayBuffer(1);
      const extraCount = await fileIo.read(file.fd, extra);
      LibraryFiles.checkCurrent(isCurrent);
      if (extraCount !== 0) { throw new Error('The script changed while being read. Refresh the library and retry.'); }
      contents = util.TextDecoder.create('utf-8', { fatal: true }).decodeToString(new Uint8Array(buffer));
    } catch (error) {
      LibraryFiles.checkCurrent(isCurrent);
      throw new Error(LibraryFiles.failure('Cannot read script', error as BusinessError));
    } finally { await fileIo.close(file); }
    LibraryFiles.checkCurrent(isCurrent);
    return contents;
  }

  static async createPrivateDirectory(filesDir: string): Promise<string> {
    // The caller supplies its UIAbilityContext.filesDir, never a public Download path.
    const path = LibraryFiles.childPath(filesDir, 'MediaLibrary');
    try { await fileIo.mkdir(path); }
    catch (error) {
      if ((error as BusinessError).code !== 13900015) {
        throw new Error(LibraryFiles.failure('Cannot create app-private folder', error as BusinessError));
      }
    }
    const stat = await fileIo.lstat(path);
    if (stat.isSymbolicLink() || !stat.isDirectory()) { throw new Error('The app-private library path is not a real directory.'); }
    return path;
  }
}
