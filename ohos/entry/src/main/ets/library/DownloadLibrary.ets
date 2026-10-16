import { bundleManager, common } from '@kit.AbilityKit';
import { fileIo, fileUri, picker } from '@kit.CoreFileKit';
import { BusinessError } from '@kit.BasicServicesKit';

export interface DownloadLibraryDirectory {
  uri: string;
  path: string;
  displayPath: string;
}

/** Prepares only the current application's public Download subdirectory.
 * DOWNLOAD mode creates that directory without a file/folder selection UI.
 * Never infer an access grant from a bundle name or a constructed filesystem path.
 * No media is opened here and no broad storage permission is requested.
 */
export class DownloadLibrary {
  private static checkCurrent(isCurrent: () => boolean): void {
    if (!isCurrent()) { throw new Error('Scan cancelled'); }
  }

  private static describeFailure(operation: string, error: BusinessError): string {
    if (error.code === 801) {
      return `${operation}: this device does not support the Download directory service (801).`;
    }
    if (error.code === 201 || error.code === 13900001 || error.code === 13900012) {
      return `${operation}: permission denied or access expired (${error.code}). Retry the library scan.`;
    }
    if (error.code === 13900002) {
      return `${operation}: the system did not provide an existing Download directory (13900002). Retry the library scan.`;
    }
    const code = typeof error.code === 'number' ? ` (${error.code})` : '';
    return `${operation}: ${error.message || String(error)}${code}`;
  }

  private static validateDirectory(uri: string, bundleName: string): DownloadLibraryDirectory {
    // Validate the system's actual URI before any file I/O. An unexpected response
    // must not turn into a scan of all Downloads, another bundle, or a private root.
    if (uri.length === 0 || uri.length > 4096 || !uri.startsWith('file://docs/') ||
      /[\u0000-\u0020\u007f-\u009f\\?#]/.test(uri) || /%(?:2e|2f|5c|00|25)/i.test(uri) ||
      uri.split('/').some((part: string): boolean => part === '.' || part === '..')) {
      throw new Error('The Download service returned an unsupported directory URI.');
    }
    const parsed = new fileUri.FileUri(uri);
    let path = parsed.path;
    while (path.length > 1 && path.endsWith('/')) { path = path.slice(0, path.length - 1); }
    const parts = path.split('/');
    if (!path.startsWith('/') || /[\u0000-\u001f\u007f-\u009f\\]/.test(path) ||
      parts.slice(1).some((part: string): boolean => part.length === 0 || part === '.' || part === '..') ||
      parts.length < 3 || parts[parts.length - 2] !== 'Download' || parts[parts.length - 1] !== bundleName) {
      throw new Error('The Download service did not return this application\'s Download directory.');
    }
    return { uri: uri, path: path, displayPath: `Download/${bundleName}` };
  }

  static async prepare(context: common.UIAbilityContext,
    isCurrent: () => boolean = (): boolean => true): Promise<DownloadLibraryDirectory> {
    DownloadLibrary.checkCurrent(isCurrent);
    if (!canIUse('SystemCapability.FileManagement.UserFileService')) {
      throw new Error('This device does not support the Download directory service.');
    }
    let bundleName: string;
    try {
      bundleName = bundleManager.getBundleInfoForSelfSync(bundleManager.BundleFlag.GET_BUNDLE_INFO_DEFAULT).name;
      if (bundleName.length > 255 || !/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/.test(bundleName)) {
        throw new Error('The application bundle name is invalid.');
      }
    } catch (error) {
      throw new Error(DownloadLibrary.describeFailure('Cannot identify the application', error as BusinessError));
    }
    DownloadLibrary.checkCurrent(isCurrent);
    let uris: string[];
    try {
      const options = new picker.DocumentSaveOptions();
      options.pickerMode = picker.DocumentPickerMode.DOWNLOAD;
      // The system creates/recreates Download/<bundle>. Do not mkdir a guessed
      // public path, call select(), request whole-Download access, or loop on failure.
      uris = await new picker.DocumentViewPicker(context).save(options);
    } catch (error) {
      DownloadLibrary.checkCurrent(isCurrent);
      throw new Error(DownloadLibrary.describeFailure('Cannot prepare the Download library', error as BusinessError));
    }
    DownloadLibrary.checkCurrent(isCurrent);
    if (uris.length !== 1) {
      throw new Error('The Download service returned no single application directory. Retry the library scan.');
    }
    const directory = DownloadLibrary.validateDirectory(uris[0], bundleName);
    try {
      const stat = await fileIo.lstat(directory.path);
      DownloadLibrary.checkCurrent(isCurrent);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new Error('The returned Download location is not a real directory.');
      }
      // URI conversion is not proof of access. Probe only this returned directory;
      // the bounded LibraryFiles scanner will build the actual index separately.
      await fileIo.listFile(directory.path, { recursion: false, listNum: 1 });
      DownloadLibrary.checkCurrent(isCurrent);
    } catch (error) {
      DownloadLibrary.checkCurrent(isCurrent);
      throw new Error(DownloadLibrary.describeFailure(`Cannot read ${directory.displayPath}`, error as BusinessError));
    }
    return directory;
  }
}
