import { ResourceFileEntry, ResourceLibrary } from '../core/ResourceLibrary';
import { FunscriptAction, FunscriptAxis, FunscriptDocument, FunscriptParser } from '../core/Funscript';

class LoopingRawAxis {
  id?: string;
  name?: string;
}
class LoopingRawDocument {
  actions?: FunscriptAction[];
  axes?: LoopingRawAxis[] | Record<string, LoopingRawAxis>;
}

/** Resolve a command's opaque identity ONLY against the current authorized
 * Download catalog. This is not a path parser, a root grant, or a file reader.
 * The host owns catalog/lifecycle freshness both before and after awaited I/O.
 */
export function resolveManagedLoopingSelection(identity: string, catalog: ResourceFileEntry[]): ResourceFileEntry {
  if (!validText(identity) || identity.trim().length === 0) {
    throw new Error('Choose a nonempty script identity from the current Download scan.');
  }
  if (!Array.isArray(catalog) || catalog.length > ResourceLibrary.MAX_FILES) {
    throw new Error('The Download catalog exceeds its entry limit.');
  }
  let selected: ResourceFileEntry | null = null;
  let matches: number = 0;
  let totalText: number = 0;
  for (const file of catalog) {
    if (file === null || typeof file !== 'object' || Array.isArray(file) ||
      !validText(file.uri) || !validText(file.name) || !validText(file.relativePath)) {
      throw new Error('The Download catalog contains an invalid resource identity.');
    }
    totalText += file.uri.length + file.name.length + file.relativePath.length;
    if (totalText > ResourceLibrary.MAX_TOTAL_TEXT_LENGTH) {
      throw new Error('The Download catalog exceeds its text limit.');
    }
    if (file.name.indexOf('/') >= 0 || file.name.indexOf('\\') >= 0 ||
      file.relativePath.indexOf('\\') >= 0 || /^[A-Za-z]:/.test(file.relativePath)) {
      throw new Error('The Download catalog contains an invalid relative filename.');
    }
    const parts: string[] = file.relativePath.split('/');
    if (parts[parts.length - 1] !== file.name || parts.some(part => part.length === 0 || part === '.' || part === '..')) {
      throw new Error('The Download catalog contains an invalid relative filename.');
    }
    // Both identities are compared as opaque complete catalog keys. A relative
    // key never becomes an I/O path. No basename/display-label fallback, case
    // folding, URL decoding, root concatenation or prefix match is permitted.
    if (file.uri === identity || file.relativePath === identity) { matches++; selected = file; }
  }
  if (matches === 0 || selected === null) {
    throw new Error('The script identity is not in the current Download scan.');
  }
  const selectedUri: string = selected.uri;
  if (matches !== 1 || catalog.filter(file => file.uri === selectedUri).length !== 1) {
    throw new Error('The script identity is ambiguous in the current Download scan.');
  }
  if (!selected.name.toLowerCase().endsWith('.funscript') ||
    selected.name.slice(0, -'.funscript'.length).trim().length === 0) {
    throw new Error('Choose a .funscript resource from the current Download scan.');
  }
  // Return catalog-owned fields, never a reconstructed URI from command text.
  // Copying also prevents a caller from changing the live catalog via its result.
  return new ResourceFileEntry(selected.uri, selected.name, selected.relativePath);
}

/** LoopingScriptMotionProvider.OnSourceFileChanged resource selection, distinct
 * from filename-based media companion matching. Input is already-read text.
 * Conventional actions work on the requested axis even when L0 is disabled.
 * Multi-axis input chooses enabled L0, otherwise the first recognized resource
 * in original insertion order. Return only that resource, with its metadata.
 * The bounded parser's stricter malformed-data behavior is deliberate.
 */
export function parseManagedLoopingScript(json: string, targetAxis: string, enabledAxes: string[]): FunscriptDocument {
  if (!Array.isArray(enabledAxes) || enabledAxes.length === 0 || enabledAxes.length > FunscriptParser.MAX_AXES ||
    enabledAxes.some((axis, index) => typeof axis !== 'string' || !/^[A-Z][0-9]$/.test(axis) || enabledAxes.indexOf(axis) !== index) ||
    typeof targetAxis !== 'string' || enabledAxes.indexOf(targetAxis) < 0) {
    throw new Error('The Looping Script target is unavailable or disabled.');
  }
  const document: FunscriptDocument = FunscriptParser.parse(json);
  // FunscriptParser has already checked shape, size, all axes and action limits.
  const raw: LoopingRawDocument = JSON.parse(json) as LoopingRawDocument;
  const hasActions: boolean = raw.actions !== undefined && raw.actions.length > 0;
  const embeddedNames: string[] = [];
  if (Array.isArray(raw.axes)) {
    for (const axis of raw.axes) { embeddedNames.push(typeof axis.id === 'string' ? axis.id : axis.name as string); }
  } else if (raw.axes !== undefined) {
    for (const name of Object.keys(raw.axes)) { embeddedNames.push(name); }
  }
  let selected: FunscriptAxis | undefined;
  if (embeddedNames.length === 0) {
    if (hasActions) {
      const conventional = document.axes.find(axis => axis.name === 'L0');
      if (conventional !== undefined) { selected = new FunscriptAxis(targetAxis, conventional.actions); }
    }
  } else {
    // Empty top-level actions do not insert an L0 entry in FunscriptReader.
    // Embedded L0 overrides top-level actions without changing insertion order.
    const recognized = document.axes.filter(axis => enabledAxes.indexOf(axis.name) >= 0 &&
      (embeddedNames.indexOf(axis.name) >= 0 || (axis.name === 'L0' && hasActions)));
    selected = recognized.find(axis => axis.name === 'L0') ?? recognized[0];
  }
  if (selected === undefined || selected.actions.length === 0) {
    throw new Error('The Looping Script has no usable selected resource for the active axes.');
  }
  return new FunscriptDocument([selected], document.metadata);
}

function validText(value: string): boolean {
  return typeof value === 'string' && value.length > 0 && value.length <= ResourceLibrary.MAX_STRING_LENGTH &&
    !/[\u0000-\u001f\u007f-\u009f]/.test(value);
}
