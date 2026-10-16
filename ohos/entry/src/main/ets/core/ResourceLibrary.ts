import { AxisMapping, AxisDefinition } from './AxisMapping';
import { FunscriptAction, FunscriptAxis, FunscriptDocument, FunscriptParser } from './Funscript';

/** Read-only picker/catalog information. relativePath includes the filename and
 * is relative to one selected root. URI is opaque; this module never opens it. */
export class ResourceFileEntry {
  uri: string;
  name: string;
  relativePath: string;
  constructor(uri: string, name: string, relativePath: string = name) {
    this.uri = uri; this.name = name; this.relativePath = relativePath;
  }
}

/** Files supplied by the IO layer from one user-authorized library root.
 * rootIdentity is opaque and never treated as a filesystem path. Each file path
 * is relative to that root; recursive=false admits only direct root children. */
export class ResourceLibraryCatalog {
  rootIdentity: string;
  files: ResourceFileEntry[];
  recursive: boolean;
  constructor(rootIdentity: string, files: ResourceFileEntry[], recursive: boolean = false) {
    this.rootIdentity = rootIdentity; this.files = files; this.recursive = recursive;
  }
}

export type ResourceDiscoveryKind = 'zip' | 'script';
export type ResourceDiscoverySource = 'media' | 'library';

/** One read operation in source discovery order. Expand ZIPs in their existing
 * entry order at this position; do not sort their contents or the final list. */
export class ResourceDiscoveryCandidate {
  file: ResourceFileEntry;
  kind: ResourceDiscoveryKind;
  rootIdentity: string;
  source: ResourceDiscoverySource;
  libraryIndex: number;
  constructor(file: ResourceFileEntry, kind: ResourceDiscoveryKind, rootIdentity: string,
    source: ResourceDiscoverySource, libraryIndex: number) {
    this.file = file; this.kind = kind; this.rootIdentity = rootIdentity;
    this.source = source; this.libraryIndex = libraryIndex;
  }
}

export class ResourceScriptMatch {
  file: ResourceFileEntry;
  axisName: string;
  enabled: boolean;
  isBase: boolean;
  constructor(file: ResourceFileEntry, axisName: string, enabled: boolean, isBase: boolean) {
    this.file = file; this.axisName = axisName; this.enabled = enabled; this.isBase = isBase;
  }
}

export type ResourceLibraryStatus = 'paired' | 'video-only' | 'script-only' | 'ambiguous';

export class ResourceLibraryItem {
  id: string;
  title: string;
  parentPath: string;
  videos: ResourceFileEntry[] = [];
  scripts: ResourceScriptMatch[] = [];
  archives: ResourceFileEntry[] = [];
  status: ResourceLibraryStatus = 'script-only';
  reasons: string[] = [];
  /** Available only when there is one video and no filename ambiguity. */
  video?: ResourceFileEntry;
  constructor(id: string, title: string, parentPath: string) {
    this.id = id; this.title = title; this.parentPath = parentPath;
  }
}

export class ResourceLibraryResult {
  items: ResourceLibraryItem[];
  ignoredFiles: ResourceFileEntry[];
  constructor(items: ResourceLibraryItem[], ignoredFiles: ResourceFileEntry[]) {
    this.items = items; this.ignoredFiles = ignoredFiles;
  }
}

/** Parsed source identity is kept separate from filename hints. */
export class ResourceScriptCandidate {
  file: ResourceFileEntry;
  document: FunscriptDocument;
  isMultiAxis: boolean;
  hasSingleAxis: boolean;
  resourceAxes: string[];
  constructor(file: ResourceFileEntry, document: FunscriptDocument, isMultiAxis: boolean,
    hasSingleAxis: boolean, resourceAxes: string[]) {
    this.file = file; this.document = document; this.isMultiAxis = isMultiAxis;
    this.hasSingleAxis = hasSingleAxis; this.resourceAxes = resourceAxes;
  }
}

export class ResourceSelectionResult {
  document?: FunscriptDocument;
  selectedFiles: ResourceFileEntry[] = [];
  blockedAxes: string[] = [];
}

class RawResourceAxis {
  id?: string;
  name?: string;
}
class RawResourceDocument {
  actions?: FunscriptAction[];
  axes?: RawResourceAxis[] | Record<string, RawResourceAxis>;
}

class ParsedResourceFile {
  file: ResourceFileEntry;
  parentPath: string;
  stem: string;
  extension: string;
  constructor(file: ResourceFileEntry, parentPath: string, stem: string, extension: string) {
    this.file = file; this.parentPath = parentPath; this.stem = stem; this.extension = extension;
  }
}

/** Pure filename discovery, never proof of script contents or video support.
 * Filenames, extensions and aliases are case-insensitive. Parent paths remain
 * case-sensitive to avoid joining distinct directories. Separators normalize to
 * '/'; paths must be relative, have no empty/dot/traversal components and agree
 * exactly with name. No URL decoding, Unicode normalization or URI inference.
 * Duplicate videos/URI identities are ambiguous. Competing scripts remain
 * candidates: selection follows upstream priorities, never a merge of aliases.
 * build() groups same-parent files for display. planSearch() orders only the
 * supplied authorized media/library catalogs; ZIP reads and filesystem access
 * belong to a separate IO layer. Neither method derives paths from a root URI.
 * Ordering uses ordinal full relative paths, not upstream culture-sensitive
 * .NET OrderBy; this intentional deterministic boundary is not locale parity.
 */
export class ResourceLibrary {
  static readonly MAX_FILES: number = 2000;
  static readonly MAX_LIBRARIES: number = 8;
  static readonly MAX_STRING_LENGTH: number = 4096;
  static readonly MAX_TOTAL_TEXT_LENGTH: number = 2 * 1024 * 1024;

  static build(entries: ResourceFileEntry[], profile: string = 'TCode-0.3'): ResourceLibraryResult {
    AxisMapping.defaultAxes(profile); // Validate even an empty catalog's profile.
    if (!Array.isArray(entries) || entries.length > ResourceLibrary.MAX_FILES) {
      throw new Error('A resource library allows at most 2000 file entries.');
    }
    const files: ParsedResourceFile[] = [];
    const uriCounts: Map<string, number> = new Map<string, number>();
    let textLength: number = 0;
    for (const entry of entries) {
      const file: ParsedResourceFile = ResourceLibrary.validateEntry(entry);
      textLength += file.file.uri.length + file.file.name.length + file.file.relativePath.length;
      if (textLength > ResourceLibrary.MAX_TOTAL_TEXT_LENGTH) {
        throw new Error('Resource library filenames and URIs exceed the 2 MiB text limit.');
      }
      files.push(file);
      uriCounts.set(file.file.uri, (uriCounts.get(file.file.uri) || 0) + 1);
    }
    files.sort((left: ParsedResourceFile, right: ParsedResourceFile): number =>
      ResourceLibrary.compareFiles(left.file, right.file));
    const groups: Map<string, ResourceLibraryItem> = new Map<string, ResourceLibraryItem>();
    const ignoredFiles: ResourceFileEntry[] = [];
    for (const file of files) {
      if (ResourceLibrary.isVideo(file.extension)) {
        const item: ResourceLibraryItem = ResourceLibrary.getGroup(groups, file.parentPath, file.stem);
        item.videos.push(file.file);
        ResourceLibrary.checkDuplicateUri(item, file.file, uriCounts);
      } else if (file.extension === 'zip') {
        const item: ResourceLibraryItem = ResourceLibrary.getGroup(groups, file.parentPath, file.stem);
        item.archives.push(file.file);
        ResourceLibrary.checkDuplicateUri(item, file.file, uriCounts);
      } else if (!file.extension.endsWith('funscript')) {
        ignoredFiles.push(file.file);
      }
    }
    for (const file of files) {
      if (!file.extension.endsWith('funscript')) { continue; }
      let matched: boolean = false;
      groups.forEach((item: ResourceLibraryItem): void => {
        if (item.videos.length === 0 || item.parentPath !== file.parentPath) { return; }
        const videoStem: string = ResourceLibrary.fileStem(item.videos[0].name);
        // LocalScriptRepository searches "<media stem>.*funscript" BEFORE
        // inspecting contents; unknown suffixes can contain multi-axis data.
        if (file.file.name.toLowerCase().startsWith(videoStem.toLowerCase() + '.')) {
          ResourceLibrary.addScript(item, file, file.stem.toLowerCase() === videoStem.toLowerCase(), profile, uriCounts);
          matched = true;
        }
      });
      if (!matched) {
        const suffix: string = ResourceLibrary.knownSuffix(file.stem);
        const baseStem: string = suffix.length > 0 ? file.stem.slice(0, -suffix.length) : file.stem;
        const item: ResourceLibraryItem = ResourceLibrary.getGroup(groups, file.parentPath, baseStem);
        ResourceLibrary.addScript(item, file, suffix.length === 0, profile, uriCounts);
      }
    }
    const items: ResourceLibraryItem[] = [];
    groups.forEach((item: ResourceLibraryItem): void => {
      ResourceLibrary.finishItem(item);
      items.push(item);
    });
    items.sort((left: ResourceLibraryItem, right: ResourceLibraryItem): number =>
      ResourceLibrary.compareText(left.id, right.id));
    return new ResourceLibraryResult(items, ignoredFiles);
  }

  /** LocalScriptRepository discovery at upstream 36c08fbb:
   * media same-stem ZIP, sorted same-parent loose scripts, then each configured
   * library in caller order (sorted ZIPs before sorted loose scripts). Library
   * sorting is by full root-relative path, equivalent within one root; ordinal
   * order intentionally replaces .NET's culture-sensitive ordering.
   * ZIP entries are not inspected here. The caller expands each ZIP in archive
   * order and skips failed reads/parses individually before selectDocuments().
   * Unknown loose suffixes remain candidates because content may be multi-axis.
   * Input roots are never combined, URI-decoded or used to infer other files.
   * Limits apply across all supplied catalogs, even files which do not match.
   */
  static planSearch(media: ResourceFileEntry, mediaFiles: ResourceFileEntry[],
    libraries: ResourceLibraryCatalog[], mediaRootIdentity: string = 'media'): ResourceDiscoveryCandidate[] {
    const checkedMedia: ParsedResourceFile = ResourceLibrary.validateEntry(media);
    if (!Array.isArray(mediaFiles) || !Array.isArray(libraries) || libraries.length > ResourceLibrary.MAX_LIBRARIES) {
      throw new Error('Search requires file catalogs and at most 8 configured libraries.');
    }
    const catalogs: ResourceLibraryCatalog[] = [new ResourceLibraryCatalog(mediaRootIdentity, mediaFiles)];
    for (const library of libraries) {
      if (library === null || typeof library !== 'object' || Array.isArray(library)) {
        throw new Error('Each configured library must be a catalog.');
      }
      catalogs.push(library);
    }
    const result: ResourceDiscoveryCandidate[] = [];
    const mediaStem: string = checkedMedia.stem.toLowerCase();
    let fileCount: number = 0;
    let textLength: number = checkedMedia.file.uri.length + checkedMedia.file.name.length +
      checkedMedia.file.relativePath.length;
    for (let index: number = 0; index < catalogs.length; index++) {
      const catalog: ResourceLibraryCatalog = catalogs[index];
      if (typeof catalog.rootIdentity !== 'string' || catalog.rootIdentity.length === 0 ||
          catalog.rootIdentity.length > ResourceLibrary.MAX_STRING_LENGTH ||
          /[\u0000-\u001f\u007f]/.test(catalog.rootIdentity) ||
          typeof catalog.recursive !== 'boolean' || !Array.isArray(catalog.files)) {
        throw new Error('Invalid library root identity, recursion flag or file catalog.');
      }
      fileCount += catalog.files.length;
      if (fileCount > ResourceLibrary.MAX_FILES) {
        throw new Error('Search catalogs exceed 2000 total files; narrow the selected folders.');
      }
      textLength += catalog.rootIdentity.length;
      if (textLength > ResourceLibrary.MAX_TOTAL_TEXT_LENGTH) {
        throw new Error('Search catalog names and URIs exceed the 2 MiB text limit.');
      }
      const files: ParsedResourceFile[] = [];
      for (const entry of catalog.files) {
        const file: ParsedResourceFile = ResourceLibrary.validateEntry(entry);
        textLength += file.file.uri.length + file.file.name.length + file.file.relativePath.length;
        if (textLength > ResourceLibrary.MAX_TOTAL_TEXT_LENGTH) {
          throw new Error('Search catalog names and URIs exceed the 2 MiB text limit.');
        }
        if (index === 0 ? file.parentPath !== checkedMedia.parentPath :
          !catalog.recursive && file.parentPath.length > 0) { continue; }
        files.push(file);
      }
      files.sort((left: ParsedResourceFile, right: ParsedResourceFile): number =>
        ResourceLibrary.compareFiles(left.file, right.file));
      const archives: ResourceDiscoveryCandidate[] = [];
      const scripts: ResourceDiscoveryCandidate[] = [];
      const origin: ResourceDiscoverySource = index === 0 ? 'media' : 'library';
      for (const file of files) {
        if (file.extension === 'zip' && file.stem.toLowerCase() === mediaStem) {
          archives.push(new ResourceDiscoveryCandidate(file.file, 'zip', catalog.rootIdentity, origin, index - 1));
        } else if (file.extension.endsWith('funscript') && file.file.name.toLowerCase().startsWith(mediaStem + '.')) {
          scripts.push(new ResourceDiscoveryCandidate(file.file, 'script', catalog.rootIdentity, origin, index - 1));
        }
      }
      for (const archive of archives) { result.push(archive); }
      for (const script of scripts) { result.push(script); }
    }
    return result;
  }

  /** Follows FunscriptReader's distinction between a conventional source and
   * embedded axis resources. The existing OHOS parser remains stricter than
   * upstream for malformed data, duplicate IDs and out-of-range actions. */
  static parseCandidate(json: string, file: ResourceFileEntry, profile: string = 'TCode-0.3'): ResourceScriptCandidate {
    const checkedFile: ResourceFileEntry = ResourceLibrary.validateEntry(file).file;
    const document: FunscriptDocument = FunscriptParser.parse(json);
    const raw: RawResourceDocument = JSON.parse(json) as RawResourceDocument;
    const hasActions: boolean = raw.actions !== undefined && raw.actions.length > 0;
    const embeddedNames: string[] = [];
    if (Array.isArray(raw.axes)) {
      for (const axis of raw.axes) {
        embeddedNames.push(typeof axis.id === 'string' ? axis.id : axis.name as string);
      }
    } else if (raw.axes !== undefined) {
      for (const name of Object.keys(raw.axes)) { embeddedNames.push(name); }
    }
    if (!hasActions && embeddedNames.length === 0) { throw new Error('The script has no actions or embedded axes.'); }
    const resourceAxes: string[] = [];
    for (const axis of AxisMapping.defaultAxes(profile)) {
      if (axis.enabled && (embeddedNames.indexOf(axis.name) >= 0 || (axis.name === 'L0' && hasActions))) {
        resourceAxes.push(axis.name);
      }
    }
    const hasAxes: boolean = embeddedNames.length > 0;
    return new ResourceScriptCandidate(checkedFile, document, hasAxes && resourceAxes.length > 0,
      !hasAxes && hasActions, resourceAxes);
  }

  /** LocalScriptRepository selection at upstream 36c08fbb:
   * 1. The FIRST successfully parsed multi-axis source wins globally. Missing
   *    enabled axes are blocked; single-axis sources never fill these holes.
   * 2. Otherwise, each axis tries its aliases in device order, then source names
   *    and same-name sources in found order; the first match wins (TryAdd).
   * Caller provides discovery order from planSearch() after ZIP expansion.
   * This function neither re-sorts nor guesses source priority.
   * The aggregate preview can hold one metadata set: use selected L0 metadata,
   * otherwise the first selected axis. Upstream retains metadata per resource.
   */
  static selectDocuments(mediaName: string, candidates: ResourceScriptCandidate[],
    profile: string = 'TCode-0.3'): ResourceSelectionResult {
    ResourceLibrary.validateMediaName(mediaName);
    const definitions: AxisDefinition[] = AxisMapping.defaultAxes(profile);
    if (!Array.isArray(candidates) || candidates.length > ResourceLibrary.MAX_FILES) {
      throw new Error('Too many script candidates.');
    }
    const checked: ResourceScriptCandidate[] = [];
    let totalActions: number = 0;
    for (const candidate of candidates) {
      if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate) ||
          typeof candidate.isMultiAxis !== 'boolean' || typeof candidate.hasSingleAxis !== 'boolean' ||
          !Array.isArray(candidate.resourceAxes) || candidate.resourceAxes.length > FunscriptParser.MAX_AXES) {
        throw new Error('Invalid script candidate.');
      }
      const document: FunscriptDocument = FunscriptParser.cloneDocument(candidate.document);
      for (const axis of document.axes) { totalActions += axis.actions.length; }
      if (totalActions > FunscriptParser.MAX_ACTIONS) { throw new Error('Candidate scripts exceed the total action limit.'); }
      for (const name of candidate.resourceAxes) {
        if (typeof name !== 'string' || !document.axes.some((axis: FunscriptAxis): boolean => axis.name === name)) {
          throw new Error('A candidate resource axis is absent from its document.');
        }
      }
      checked.push(new ResourceScriptCandidate(ResourceLibrary.validateEntry(candidate.file).file,
        document, candidate.isMultiAxis, candidate.hasSingleAxis, candidate.resourceAxes.slice()));
    }
    const result: ResourceSelectionResult = new ResourceSelectionResult();
    const selectedAxes: FunscriptAxis[] = [];
    let metadataSource: FunscriptDocument | undefined = undefined;
    const multi: ResourceScriptCandidate | undefined = checked.find((candidate: ResourceScriptCandidate): boolean => candidate.isMultiAxis);
    if (multi !== undefined) {
      result.selectedFiles.push(multi.file);
      metadataSource = multi.document;
      for (const definition of definitions) {
        if (!definition.enabled) { continue; }
        const axis: FunscriptAxis | undefined = multi.document.axes.find((value: FunscriptAxis): boolean =>
          value.name === definition.name && multi.resourceAxes.indexOf(value.name) >= 0);
        if (axis !== undefined) { selectedAxes.push(axis); }
        else { result.blockedAxes.push(definition.name); }
      }
    } else {
      for (const definition of definitions) {
        if (!definition.enabled) { continue; }
        let winner: ResourceScriptCandidate | undefined = undefined;
        for (const alias of definition.funscriptNames) {
          winner = checked.find((candidate: ResourceScriptCandidate): boolean =>
            ResourceLibrary.matchesAlias(candidate.file.name, mediaName, alias));
          if (winner !== undefined) { break; }
        }
        if (winner === undefined) { continue; }
        const winnerFile: ResourceFileEntry = winner.file;
        if (!result.selectedFiles.some((file: ResourceFileEntry): boolean =>
          file.uri === winnerFile.uri && file.relativePath === winnerFile.relativePath)) {
          result.selectedFiles.push(winner.file);
        }
        if (!winner.hasSingleAxis) {
          result.blockedAxes.push(definition.name);
          continue;
        }
        selectedAxes.push(new FunscriptAxis(definition.name, winner.document.axes[0].actions));
        if (metadataSource === undefined) { metadataSource = winner.document; }
      }
    }
    if (selectedAxes.length > 0 && metadataSource !== undefined) {
      result.document = FunscriptParser.cloneDocument(new FunscriptDocument(selectedAxes, metadataSource.metadata));
    }
    return result;
  }

  /** Merge validated content after selection; filenames cannot establish actual
   * axis IDs because scripts may embed multiple axes. First document supplies
   * all metadata (pass the base script first); metadata is never merged/guessed.
   * Every input and the combined axis/action limits are checked and deep copied.
   */
  static mergeDocuments(documents: FunscriptDocument[]): FunscriptDocument {
    if (!Array.isArray(documents) || documents.length === 0 || documents.length > FunscriptParser.MAX_AXES) {
      throw new Error('Select between 1 and 32 script documents.');
    }
    const first: FunscriptDocument = FunscriptParser.cloneDocument(documents[0]);
    const axes: FunscriptAxis[] = [];
    const names: Set<string> = new Set<string>();
    let actionCount: number = 0;
    for (let index: number = 0; index < documents.length; index++) {
      const document: FunscriptDocument = index === 0 ? first : FunscriptParser.cloneDocument(documents[index]);
      for (const axis of document.axes) {
        if (names.has(axis.name)) { throw new Error('Duplicate script axis: ' + axis.name); }
        names.add(axis.name);
        axes.push(axis);
        actionCount += axis.actions.length;
        if (axes.length > FunscriptParser.MAX_AXES || actionCount > FunscriptParser.MAX_ACTIONS) {
          throw new Error('Combined scripts exceed the axis or total action limit.');
        }
      }
    }
    return FunscriptParser.cloneDocument(new FunscriptDocument(axes, first.metadata));
  }

  private static validateEntry(entry: ResourceFileEntry): ParsedResourceFile {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error('Each resource file must be an object.');
    }
    for (const text of [entry.uri, entry.name, entry.relativePath]) {
      if (typeof text !== 'string' || text.length === 0 || text.length > ResourceLibrary.MAX_STRING_LENGTH ||
          /[\u0000-\u001f\u007f]/.test(text)) { throw new Error('Invalid resource filename, path or URI.'); }
    }
    if (entry.name.indexOf('/') >= 0 || entry.name.indexOf('\\') >= 0) {
      throw new Error('Resource name must be a filename without directories.');
    }
    const path: string = entry.relativePath.replace(/\\/g, '/');
    const parts: string[] = path.split('/');
    if (/^[A-Za-z]:/.test(path) || parts[parts.length - 1] !== entry.name) {
      throw new Error('Resource relative path must agree with its filename.');
    }
    for (const part of parts) {
      if (part.length === 0 || part === '.' || part === '..') { throw new Error('Invalid relative resource path.'); }
    }
    const dot: number = entry.name.lastIndexOf('.');
    const extension: string = dot >= 0 ? entry.name.slice(dot + 1).toLowerCase() : '';
    const stem: string = dot >= 0 ? entry.name.slice(0, dot) : entry.name;
    if (stem.length === 0) { throw new Error('Resource filename requires a nonempty basename.'); }
    const parentPath: string = parts.slice(0, -1).join('/');
    return new ParsedResourceFile(new ResourceFileEntry(entry.uri, entry.name, path), parentPath, stem, extension);
  }

  private static isVideo(extension: string): boolean {
    return extension === 'mp4' || extension === 'mkv' || extension === 'ts' || extension === 'm4v';
  }

  private static validateMediaName(name: string): void {
    if (typeof name !== 'string' || name.length === 0 || name.length > ResourceLibrary.MAX_STRING_LENGTH ||
        /[\u0000-\u001f\u007f]/.test(name)) { throw new Error('Invalid media filename.'); }
  }

  private static fileStem(name: string): string {
    const leaf: string = name.replace(/\\/g, '/').split('/').pop() as string;
    const dot: number = leaf.lastIndexOf('.');
    return dot >= 0 ? leaf.slice(0, dot) : leaf;
  }

  private static matchesAlias(scriptName: string, mediaName: string, alias: string): boolean {
    const stem: string = ResourceLibrary.fileStem(scriptName).toLowerCase();
    const suffix: string = ResourceLibrary.knownSuffix(stem);
    const base: string = suffix.length > 0 ? stem.slice(0, -suffix.length) : stem;
    const media: string = ResourceLibrary.fileStem(mediaName).toLowerCase();
    if (base !== media) { return false; }
    return (alias === '*' && stem === media) || stem.endsWith('.' + alias.toLowerCase());
  }

  private static key(parentPath: string, stem: string): string {
    return parentPath.length > 0 ? parentPath + '/' + stem.toLowerCase() : stem.toLowerCase();
  }

  private static getGroup(groups: Map<string, ResourceLibraryItem>, parentPath: string,
    stem: string): ResourceLibraryItem {
    const key: string = ResourceLibrary.key(parentPath, stem);
    const existing: ResourceLibraryItem | undefined = groups.get(key);
    if (existing !== undefined) { return existing; }
    const item: ResourceLibraryItem = new ResourceLibraryItem(key, stem, parentPath);
    groups.set(key, item);
    return item;
  }

  private static knownSuffix(stem: string): string {
    const lower: string = stem.toLowerCase();
    for (const profile of ['TCode-0.2', 'TCode-0.3']) {
      for (const axis of AxisMapping.defaultAxes(profile)) {
        for (const alias of axis.funscriptNames) {
          const suffix: string = '.' + alias.toLowerCase();
          if (alias !== '*' && lower.endsWith(suffix) && stem.length > suffix.length) { return suffix; }
        }
      }
    }
    return '';
  }

  private static addScript(item: ResourceLibraryItem, file: ParsedResourceFile, isBase: boolean,
    profile: string, uriCounts: Map<string, number>): void {
    let axisName: string = 'L0';
    let enabled: boolean = true;
    if (!isBase || item.videos.length > 0) {
      const axes: AxisDefinition[] = AxisMapping.findAxesMatchingName(file.file.name, profile, true,
        item.videos.length > 0 ? item.videos[0].name : undefined);
      axisName = axes.length === 1 ? axes[0].name : '';
      enabled = axes.length === 1 && axes[0].enabled;
    }
    item.scripts.push(new ResourceScriptMatch(file.file, axisName, enabled, isBase));
    ResourceLibrary.checkDuplicateUri(item, file.file, uriCounts);
  }

  private static checkDuplicateUri(item: ResourceLibraryItem, file: ResourceFileEntry,
    uriCounts: Map<string, number>): void {
    if ((uriCounts.get(file.uri) || 0) > 1) {
      ResourceLibrary.addReason(item, 'The same resource URI occurs more than once.');
    }
  }

  private static finishItem(item: ResourceLibraryItem): void {
    if (item.videos.length > 1) { ResourceLibrary.addReason(item, 'More than one video has this basename.'); }
    // Keep discovery order for the first multi-axis choice. Aliases are ordered
    // in selectDocuments, not by these display hints or by input selection order.
    item.scripts.sort((left: ResourceScriptMatch, right: ResourceScriptMatch): number =>
      ResourceLibrary.compareFiles(left.file, right.file));
    item.reasons.sort((left: string, right: string): number => ResourceLibrary.compareText(left, right));
    item.status = item.reasons.length > 0 ? 'ambiguous' :
      item.videos.length === 0 ? 'script-only' :
        item.scripts.length === 0 && item.archives.length === 0 ? 'video-only' : 'paired';
    if (item.videos.length === 1 && item.status !== 'ambiguous') { item.video = item.videos[0]; }
  }

  private static addReason(item: ResourceLibraryItem, reason: string): void {
    if (item.reasons.indexOf(reason) < 0) { item.reasons.push(reason); }
  }

  private static compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
  }

  private static compareFiles(left: ResourceFileEntry, right: ResourceFileEntry): number {
    const exact: number = ResourceLibrary.compareText(left.relativePath, right.relativePath);
    return exact !== 0 ? exact : ResourceLibrary.compareText(left.uri, right.uri);
  }
}
