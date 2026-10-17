/** Platform-independent, bounded funscript model. No transport or filesystem access. */
export class FunscriptAction {
  at: number;
  pos: number;
  constructor(at: number, pos: number) { this.at = at; this.pos = pos; }
}

export class FunscriptAxis {
  name: string;
  actions: FunscriptAction[];
  constructor(name: string, actions: FunscriptAction[]) {
    this.name = name;
    this.actions = actions;
  }
}

/** Metadata is descriptive only; it never changes action positions or duration. */
export class FunscriptChapter {
  name: string;
  startTimeMs: number;
  endTimeMs: number;
  constructor(name: string, startTimeMs: number, endTimeMs: number) {
    this.name = name; this.startTimeMs = startTimeMs; this.endTimeMs = endTimeMs;
  }
}

export class FunscriptBookmark {
  name: string;
  timeMs: number;
  constructor(name: string, timeMs: number) { this.name = name; this.timeMs = timeMs; }
}

export class FunscriptMetadata {
  static readonly MAX_ENTRIES: number = 1000;
  static readonly MAX_NAME_LENGTH: number = 256;
  chapters: FunscriptChapter[];
  bookmarks: FunscriptBookmark[];
  constructor(chapters: FunscriptChapter[] = [], bookmarks: FunscriptBookmark[] = []) {
    this.chapters = chapters; this.bookmarks = bookmarks;
  }

  /** Validate and deep-copy normalized metadata, including programmatic documents. */
  clone(): FunscriptMetadata {
    if (!Array.isArray(this.chapters) || !Array.isArray(this.bookmarks) ||
        this.chapters.length + this.bookmarks.length > FunscriptMetadata.MAX_ENTRIES) {
      throw new Error('Metadata allows at most 1000 total chapters and bookmarks.');
    }
    const chapters: FunscriptChapter[] = [];
    const bookmarks: FunscriptBookmark[] = [];
    for (const chapter of this.chapters) {
      if (chapter === null || typeof chapter !== 'object' || Array.isArray(chapter)) {
        throw new Error('Invalid chapter.');
      }
      FunscriptMetadata.validateName(chapter.name);
      FunscriptMetadata.validateTime(chapter.startTimeMs);
      FunscriptMetadata.validateTime(chapter.endTimeMs);
      if (chapter.endTimeMs < chapter.startTimeMs) { throw new Error('Chapter end precedes start.'); }
      chapters.push(new FunscriptChapter(chapter.name, chapter.startTimeMs, chapter.endTimeMs));
    }
    for (const bookmark of this.bookmarks) {
      if (bookmark === null || typeof bookmark !== 'object' || Array.isArray(bookmark)) {
        throw new Error('Invalid bookmark.');
      }
      FunscriptMetadata.validateName(bookmark.name);
      FunscriptMetadata.validateTime(bookmark.timeMs);
      bookmarks.push(new FunscriptBookmark(bookmark.name, bookmark.timeMs));
    }
    chapters.sort((left: FunscriptChapter, right: FunscriptChapter): number => left.startTimeMs - right.startTimeMs);
    bookmarks.sort((left: FunscriptBookmark, right: FunscriptBookmark): number => left.timeMs - right.timeMs);
    return new FunscriptMetadata(chapters, bookmarks);
  }

  private static validateName(name: string): void {
    if (typeof name !== 'string' || name.length > FunscriptMetadata.MAX_NAME_LENGTH) {
      throw new Error('Metadata names must be strings of at most 256 characters.');
    }
  }

  private static validateTime(timeMs: number): void {
    if (typeof timeMs !== 'number' || !Number.isFinite(timeMs) || timeMs < 0 ||
        timeMs > FunscriptParser.MAX_TIME_MS) { throw new Error('Metadata time is outside 0–24 hours.'); }
  }
}

export class FunscriptDocument {
  axes: FunscriptAxis[];
  durationMs: number;
  metadata: FunscriptMetadata;
  constructor(axes: FunscriptAxis[], metadata: FunscriptMetadata = new FunscriptMetadata()) {
    this.metadata = metadata.clone();
    this.axes = axes;
    this.durationMs = 0;
    for (const axis of axes) {
      if (axis.actions.length > 0) {
        this.durationMs = Math.max(this.durationMs, axis.actions[axis.actions.length - 1].at);
      }
    }
  }
}

class RawAxis {
  id?: string;
  name?: string;
  actions?: FunscriptAction[];
}
class RawChapter {
  name?: string;
  startTime?: string;
  endTime?: string;
}
class RawBookmark {
  name?: string;
  time?: string;
}
class RawMetadata {
  chapters?: RawChapter[];
  bookmarks?: RawBookmark[];
}
class CloneAxesDocument {
  axes: FunscriptAxis[];
  constructor(axes: FunscriptAxis[]) { this.axes = axes; }
}
class RawDocument {
  metadata?: RawMetadata;
  actions?: FunscriptAction[];
  axes?: RawAxis[] | Record<string, RawAxis>;
}

export class FunscriptParser {
  static readonly MAX_JSON_LENGTH: number = 8 * 1024 * 1024;
  static readonly MAX_ACTIONS: number = 100000;
  static readonly MAX_AXES: number = 32;
  static readonly MAX_TIME_MS: number = 24 * 60 * 60 * 1000;

  /** Rejects invalid entries, bounds allocations, sorts timestamps, last duplicate wins. */
  static parse(json: string): FunscriptDocument {
    if (typeof json !== 'string' || json.length > FunscriptParser.MAX_JSON_LENGTH) {
      throw new Error('Funscript exceeds the 8 MiB text limit.');
    }
    let raw: RawDocument;
    try { raw = JSON.parse(json) as RawDocument; }
    catch { throw new Error('Invalid JSON.'); }
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('Funscript must be a JSON object.');
    }
    const axes: FunscriptAxis[] = [];
    let inputActionCount: number = 0;
    const embeddedNames: Set<string> = new Set<string>();
    if (raw.actions !== undefined) {
      axes.push(FunscriptParser.parseAxis('L0', raw.actions));
      inputActionCount += raw.actions.length;
    }
    if (raw.axes !== undefined) {
      if (raw.axes === null || typeof raw.axes !== 'object') {
        throw new Error('Axes must be an array or named object.');
      }
      if (Array.isArray(raw.axes)) {
        if (raw.axes.length > FunscriptParser.MAX_AXES) { throw new Error('Too many axes.'); }
        for (const axis of raw.axes) {
          if (axis === null || typeof axis !== 'object' || Array.isArray(axis)) {
            throw new Error('Each axis must be an object.');
          }
          if ((typeof axis.id !== 'string' && typeof axis.name !== 'string') || axis.actions === undefined) {
            throw new Error('Each axis requires a name and actions.');
          }
          const name: string = typeof axis.id === 'string' ? axis.id : axis.name as string;
          if (embeddedNames.has(name)) { throw new Error('Duplicate embedded axis name: ' + name); }
          embeddedNames.add(name);
          axes.push(FunscriptParser.parseAxis(name, axis.actions));
          inputActionCount += axis.actions.length;
          if (inputActionCount > FunscriptParser.MAX_ACTIONS) { throw new Error('Too many total actions.'); }
        }
      } else {
        const named: Record<string, RawAxis> = raw.axes as Record<string, RawAxis>;
        const names: string[] = Object.keys(named);
        if (names.length > FunscriptParser.MAX_AXES) { throw new Error('Too many axes.'); }
        for (const name of names) {
          const axis: RawAxis = named[name];
          if (axis === null || typeof axis !== 'object' || Array.isArray(axis) || axis.actions === undefined) {
            throw new Error('Each named axis requires an actions array.');
          }
          axes.push(FunscriptParser.parseAxis(name, axis.actions));
          inputActionCount += axis.actions.length;
          if (inputActionCount > FunscriptParser.MAX_ACTIONS) { throw new Error('Too many total actions.'); }
        }
      }
    }
    if (axes.length === 0 || axes.length > FunscriptParser.MAX_AXES) {
      throw new Error('Funscript requires 1 to 32 axes.');
    }
    const unique: FunscriptAxis[] = [];
    for (const axis of axes) {
      const index: number = unique.findIndex(existing => existing.name === axis.name);
      if (index >= 0) { unique[index] = axis; } else { unique.push(axis); }
    }
    // The bounded raw input budget counts overwritten resources too. Original
    // FunscriptReader assigns Resources[axis], so embedded L0 overrides actions.
    if (inputActionCount > FunscriptParser.MAX_ACTIONS) { throw new Error('Too many total actions.'); }
    return new FunscriptDocument(unique, FunscriptParser.parseMetadata(raw.metadata));
  }

  /** Copy programmatic documents without trusting supplied duration or prototypes. */
  static cloneDocument(document: FunscriptDocument): FunscriptDocument {
    if (document === null || typeof document !== 'object' || Array.isArray(document)) {
      throw new Error('Invalid document.');
    }
    if (!Array.isArray(document.axes) || new Set(document.axes.map(axis => axis.name)).size !== document.axes.length) {
      throw new Error('Duplicate or invalid document axes.');
    }
    const copy: FunscriptDocument = FunscriptParser.parse(JSON.stringify(new CloneAxesDocument(document.axes)));
    if (document.metadata !== undefined) {
      const metadata: FunscriptMetadata = document.metadata;
      if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
        throw new Error('Invalid normalized metadata.');
      }
      copy.metadata = new FunscriptMetadata(metadata.chapters, metadata.bookmarks).clone();
    }
    return copy;
  }

  /** Strict C# TimeSpan subset HH:mm:ss[.fffffff], preserving sub-ms precision.
   * Day prefixes, negatives, whitespace, numeric values and malformed fields reject.
   * 24:00:00 is allowed; later times are outside the preview timeline bound.
   */
  static parseTimeSpanMs(value: string): number {
    if (typeof value !== 'string' || !/^[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,7})?$/.test(value)) {
      throw new Error('Metadata times must use HH:mm:ss with an optional 1–7 digit fraction.');
    }
    const hours: number = Number(value.slice(0, 2));
    const minutes: number = Number(value.slice(3, 5));
    const seconds: number = Number(value.slice(6, 8));
    const fractionMs: number = value.length > 8 ? Number('0' + value.slice(8)) * 1000 : 0;
    const timeMs: number = ((hours * 60 + minutes) * 60 + seconds) * 1000 + fractionMs;
    if (minutes > 59 || seconds > 59 || timeMs > FunscriptParser.MAX_TIME_MS) {
      throw new Error('Metadata time is outside 0–24 hours or has invalid clock fields.');
    }
    return timeMs;
  }

  private static parseMetadata(raw: RawMetadata | undefined): FunscriptMetadata {
    if (raw === undefined || raw === null) { return new FunscriptMetadata(); }
    if (typeof raw !== 'object' || Array.isArray(raw)) { throw new Error('Metadata must be an object.'); }
    const sourceChapters: RawChapter[] = raw.chapters === undefined ? [] : raw.chapters;
    const sourceBookmarks: RawBookmark[] = raw.bookmarks === undefined ? [] : raw.bookmarks;
    if (!Array.isArray(sourceChapters) || !Array.isArray(sourceBookmarks) ||
        sourceChapters.length + sourceBookmarks.length > FunscriptMetadata.MAX_ENTRIES) {
      throw new Error('Metadata allows at most 1000 total chapters and bookmarks.');
    }
    const chapters: FunscriptChapter[] = [];
    const bookmarks: FunscriptBookmark[] = [];
    for (const chapter of sourceChapters) {
      if (chapter === null || typeof chapter !== 'object' || Array.isArray(chapter) ||
          typeof chapter.name !== 'string' || typeof chapter.startTime !== 'string' || typeof chapter.endTime !== 'string') {
        throw new Error('Chapter requires name, startTime and endTime.');
      }
      chapters.push(new FunscriptChapter(chapter.name, FunscriptParser.parseTimeSpanMs(chapter.startTime),
        FunscriptParser.parseTimeSpanMs(chapter.endTime)));
    }
    for (const bookmark of sourceBookmarks) {
      if (bookmark === null || typeof bookmark !== 'object' || Array.isArray(bookmark) ||
          typeof bookmark.name !== 'string' || typeof bookmark.time !== 'string') {
        throw new Error('Bookmark requires name and time.');
      }
      bookmarks.push(new FunscriptBookmark(bookmark.name, FunscriptParser.parseTimeSpanMs(bookmark.time)));
    }
    return new FunscriptMetadata(chapters, bookmarks).clone();
  }

  private static parseAxis(name: string, source: FunscriptAction[]): FunscriptAxis {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(name) || name === 'constructor' || name === 'prototype') {
      throw new Error('Invalid axis name.');
    }
    if (!Array.isArray(source) || source.length > FunscriptParser.MAX_ACTIONS) {
      throw new Error('Actions must be an array of at most 100000 points.');
    }
    const unique: Map<number, FunscriptAction> = new Map<number, FunscriptAction>();
    for (const action of source) {
      if (action === null || typeof action !== 'object' || Array.isArray(action) ||
          typeof action.at !== 'number' || !Number.isFinite(action.at) || !Number.isInteger(action.at) ||
          action.at < 0 || action.at > FunscriptParser.MAX_TIME_MS ||
          typeof action.pos !== 'number' || !Number.isFinite(action.pos) || action.pos < 0 || action.pos > 100) {
        throw new Error('Each action needs integer at (0–86400000 ms) and finite pos (0–100).');
      }
      unique.set(action.at, new FunscriptAction(action.at, action.pos));
    }
    const actions: FunscriptAction[] = [];
    unique.forEach((action: FunscriptAction) => { actions.push(action); });
    actions.sort((left: FunscriptAction, right: FunscriptAction): number => left.at - right.at);
    return new FunscriptAxis(name, actions);
  }
}

/** Clamped linear interpolation; an empty axis has neutral preview position 50. */
export function interpolate(axis: FunscriptAxis, timeMs: number): number {
  if (!Number.isFinite(timeMs)) { throw new Error('Time must be finite.'); }
  const points: FunscriptAction[] = axis.actions;
  if (points.length === 0) { return 50; }
  if (timeMs <= points[0].at) { return points[0].pos; }
  if (timeMs >= points[points.length - 1].at) { return points[points.length - 1].pos; }
  let lo: number = 0;
  let hi: number = points.length - 1;
  while (hi - lo > 1) {
    const mid: number = Math.floor((lo + hi) / 2);
    if (points[mid].at <= timeMs) { lo = mid; } else { hi = mid; }
  }
  const a: FunscriptAction = points[lo];
  const b: FunscriptAction = points[hi];
  return a.pos + (b.pos - a.pos) * (timeMs - a.at) / (b.at - a.at);
}
