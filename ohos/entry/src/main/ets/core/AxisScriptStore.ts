import { AxisConfiguration, AxisConfigurationEntry } from './AxisConfiguration';
import type { InterpolationMode } from './Interpolation';

/** All script-resource coordinates are seconds / normalized 0–1. */
export class AxisKeyframe {
  readonly positionSeconds: number;
  readonly value: number;
  constructor(positionSeconds: number, value: number) {
    this.positionSeconds = positionSeconds;
    this.value = value;
    Object.freeze(this);
  }
}

export class AxisChapter {
  readonly name: string;
  readonly startTimeSeconds: number;
  readonly endTimeSeconds: number;
  constructor(name: string, startTimeSeconds: number, endTimeSeconds: number) {
    this.name = name;
    this.startTimeSeconds = startTimeSeconds;
    this.endTimeSeconds = endTimeSeconds;
    Object.freeze(this);
  }
}

export class AxisBookmark {
  readonly name: string;
  readonly positionSeconds: number;
  constructor(name: string, positionSeconds: number) {
    this.name = name;
    this.positionSeconds = positionSeconds;
    Object.freeze(this);
  }
}

/** Immutable owned resource. Readers/adapters convert their units BEFORE this
 * boundary; no funscript-ms conversion or media I/O is hidden in the pipeline.
 * Like KeyframeCollection(IEnumerable), sorting is stable, duplicates keep first.
 * Malformed/non-normalized input is rejected rather than silently repaired.
 */
export class AxisScriptResource {
  readonly resourceId: string;
  readonly name: string;
  readonly source: string;
  readonly keyframes: AxisKeyframe[];
  readonly chapters: AxisChapter[];
  readonly bookmarks: AxisBookmark[];
  constructor(resourceId: string, name: string, source: string, keyframes: AxisKeyframe[],
    chapters: AxisChapter[] = [], bookmarks: AxisBookmark[] = []) {
    if (resourceId.length === 0) { throw new Error('Resource identity is required.'); }
    this.resourceId = resourceId;
    this.name = name;
    this.source = source;
    const sorted: AxisKeyframe[] = keyframes.map(point => {
      if (!Number.isFinite(point.positionSeconds) || point.positionSeconds < 0 ||
        !Number.isFinite(point.value) || point.value < 0 || point.value > 1) {
        throw new Error('Keyframes must have finite nonnegative seconds and normalized values.');
      }
      return new AxisKeyframe(point.positionSeconds, point.value);
    }).sort((a, b) => a.positionSeconds - b.positionSeconds);
    this.keyframes = sorted.filter((point, index) => index === 0 || sorted[index - 1].positionSeconds !== point.positionSeconds);
    this.chapters = chapters.map(chapter => {
      if (!Number.isFinite(chapter.startTimeSeconds) || chapter.startTimeSeconds < 0 ||
        !Number.isFinite(chapter.endTimeSeconds) || chapter.endTimeSeconds < chapter.startTimeSeconds) {
        throw new Error('Chapter times must be finite nonnegative seconds in order.');
      }
      return new AxisChapter(chapter.name, chapter.startTimeSeconds, chapter.endTimeSeconds);
    });
    this.bookmarks = bookmarks.map(bookmark => {
      if (!Number.isFinite(bookmark.positionSeconds) || bookmark.positionSeconds < 0) {
        throw new Error('Bookmark time must be finite nonnegative seconds.');
      }
      return new AxisBookmark(bookmark.name, bookmark.positionSeconds);
    });
    Object.freeze(this.keyframes);
    Object.freeze(this.chapters);
    Object.freeze(this.bookmarks);
    Object.freeze(this);
  }

  static copy(resource: AxisScriptResource): AxisScriptResource {
    return new AxisScriptResource(resource.resourceId, resource.name, resource.source,
      resource.keyframes, resource.chapters, resource.bookmarks);
  }
}

export class AxisScriptBinding {
  readonly axisName: string;
  readonly resource: AxisScriptResource | null;
  readonly linkedFromAxis: string | null;
  readonly revision: number;
  constructor(axisName: string, resource: AxisScriptResource | null = null,
    linkedFromAxis: string | null = null, revision: number = 0) {
    this.axisName = axisName;
    this.resource = resource;
    this.linkedFromAxis = linkedFromAxis;
    this.revision = revision;
    Object.freeze(this);
  }
}

/** Source: ScriptViewModel::{SetScript,UpdateLinkedScriptsTo,UpdateLinkScriptFor,
 * ReloadAxes}. Link shares ORIGINAL immutable resources, not computed values.
 * Lock protects every existing resource, including one with zero keyframes.
 */
export class AxisScriptStore {
  private readonly axisNames: string[];
  private settings: AxisConfigurationEntry[] = [];
  private bindings: AxisScriptBinding[];
  private revision: number = 0;

  constructor(axisNames: string[], settings: AxisConfigurationEntry[]) {
    if (new Set(axisNames).size !== axisNames.length) { throw new Error('Duplicate axis name.'); }
    this.axisNames = axisNames.slice();
    this.bindings = axisNames.map(name => new AxisScriptBinding(name));
    this.setConfiguration(settings);
  }

  setConfiguration(settings: AxisConfigurationEntry[], deferLinks: boolean = false): void {
    const copied: AxisConfigurationEntry[] = settings.map(entry =>
      new AxisConfigurationEntry(entry.axisName, AxisConfiguration.clone(entry.settings)));
    for (const name of this.axisNames) {
      if (copied.filter(entry => entry.axisName === name).length !== 1) { throw new Error('Exactly one setting is required for ' + name); }
    }
    for (const entry of copied) {
      if (this.axisNames.indexOf(entry.axisName) < 0) { throw new Error('Unknown axis ' + entry.axisName); }
      const visited: string[] = [entry.axisName];
      let target: string | null = entry.settings.linkAxis;
      while (target !== null) {
        if (visited.indexOf(target) >= 0) { throw new Error('Circular script link.'); }
        visited.push(target);
        const targetEntry: AxisConfigurationEntry | undefined = copied.find(candidate => candidate.axisName === target);
        if (targetEntry === undefined) { throw new Error('Unknown linked axis ' + target); }
        target = targetEntry.settings.linkAxis;
      }
    }
    const relink: string[] = copied.filter(entry => {
      const previous: AxisConfigurationEntry | undefined = this.settings.find(item => item.axisName === entry.axisName);
      return previous === undefined || previous.settings.linkAxis !== entry.settings.linkAxis ||
        previous.settings.linkAxisHasPriority !== entry.settings.linkAxisHasPriority;
    }).map(entry => entry.axisName);
    this.settings = copied;
    // Re-adopting an identical settings snapshot is not a source ReloadAxes.
    // In particular, unlocking alone does not reload a previously locked script.
    if (!deferLinks) { for (const name of relink) { this.updateLink(name); } }
  }

  snapshot(): AxisScriptBinding[] {
    const result: AxisScriptBinding[] = this.bindings.slice();
    Object.freeze(result);
    return result;
  }

  getBinding(axisName: string): AxisScriptBinding { return this.bindings[this.axisIndex(axisName)]; }

  setScript(axisName: string, resource: AxisScriptResource | null): boolean {
    const owned: AxisScriptResource | null = resource === null ? null :
      resource instanceof AxisScriptResource && Object.isFrozen(resource) ? resource : AxisScriptResource.copy(resource);
    return this.assign(axisName, owned, null);
  }

  clear(axisNames: string[] = this.axisNames): void {
    for (const name of axisNames) { this.setScript(name, null); }
  }

  /** Repository results exclude priority-linked axes, matching ReloadAxes. */
  reload(discovered: AxisScriptBinding[], axisNames: string[] = this.axisNames): void {
    for (const name of axisNames) {
      const settings: AxisConfiguration = this.configuration(name);
      if (settings.linkAxisHasPriority) { continue; }
      const result: AxisScriptBinding | undefined = discovered.find(binding => binding.axisName === name);
      if (result === undefined) { this.updateLink(name); }
    }
    for (const result of discovered) {
      if (axisNames.indexOf(result.axisName) >= 0 && !this.configuration(result.axisName).linkAxisHasPriority) {
        this.setScript(result.axisName, result.resource);
      }
    }
    for (const name of axisNames) {
      if (this.configuration(name).linkAxisHasPriority) { this.updateLink(name); }
    }
  }

  updateLinks(): void {
    // Recursion in assign propagates changed resources through the validated DAG.
    for (const name of this.axisNames) { this.updateLink(name); }
  }

  private axisIndex(name: string): number {
    const index: number = this.axisNames.indexOf(name);
    if (index < 0) { throw new Error('Unknown axis ' + name); }
    return index;
  }

  private configuration(name: string): AxisConfiguration {
    this.axisIndex(name);
    return this.settings.find(entry => entry.axisName === name)!.settings;
  }

  private updateLink(name: string): void {
    const current: AxisScriptBinding = this.getBinding(name);
    const settings: AxisConfiguration = this.configuration(name);
    if (!settings.linkAxisHasPriority && current.resource !== null && current.linkedFromAxis === null) { return; }
    const resource: AxisScriptResource | null = settings.linkAxis === null ? null : this.getBinding(settings.linkAxis).resource;
    this.assign(name, resource, resource === null ? null : settings.linkAxis, resource !== null);
  }

  private assign(name: string, resource: AxisScriptResource | null, linkedFrom: string | null,
    newLinkedWrapper: boolean = false): boolean {
    const index: number = this.axisIndex(name);
    const current: AxisScriptBinding = this.bindings[index];
    if (this.configuration(name).lockScript && current.resource !== null) { return false; }
    // SetScript's operands are statically IScriptResource, so == uses REFERENCE
    // identity, not ScriptResource record content equality. A new resource with
    // identical keyframes still invalidates. LinkTo creates a NEW wrapper on
    // each relink, while its original immutable keyframes/resource are shared.
    if (!newLinkedWrapper && current.resource === resource && current.linkedFromAxis === linkedFrom) { return false; }
    this.revision++;
    this.bindings[index] = new AxisScriptBinding(name, resource, linkedFrom, this.revision);
    for (const entry of this.settings) {
      if (entry.axisName !== name && entry.settings.linkAxis === name) { this.updateLink(entry.axisName); }
    }
    return true;
  }
}

/** Source kernels: Common/KeyframeCollection.cs and Common/Utils/MathUtils.cs.
 * Unlike interpolateAxis preview, these helpers have NO endpoint-holding policy.
 */
export class AxisKeyframes {
  static valid(points: AxisKeyframe[], index: number): boolean { return index >= 0 && index < points.length; }
  static searchForIndexBefore(points: AxisKeyframe[], positionSeconds: number): number {
    let low: number = 0;
    let high: number = points.length;
    while (low < high) {
      const middle: number = Math.floor((low + high) / 2);
      if (points[middle].positionSeconds < positionSeconds) { low = middle + 1; } else { high = middle; }
    }
    return low - 1;
  }
  static advanceIndex(points: AxisKeyframe[], index: number, positionSeconds: number): number {
    while (AxisKeyframes.valid(points, index + 1) && points[index + 1].positionSeconds <= positionSeconds) { index++; }
    return index;
  }
  static isGap(points: AxisKeyframe[], index: number): boolean {
    return AxisKeyframes.valid(points, index) && AxisKeyframes.valid(points, index + 1) &&
      (Math.abs(points[index + 1].value - points[index].value) < 0.001 ||
      Math.abs(points[index + 1].positionSeconds - points[index].positionSeconds) < 0.001);
  }
  static gapDuration(points: AxisKeyframe[], index: number): number {
    if (!AxisKeyframes.valid(points, index) || !AxisKeyframes.valid(points, index + 1)) { return -1; }
    let end: number = index;
    while (AxisKeyframes.isGap(points, end)) { end++; }
    return end === index ? -1 : points[end].positionSeconds - points[index].positionSeconds;
  }
  static interpolate(points: AxisKeyframe[], index: number, positionSeconds: number, mode: InterpolationMode): number {
    const p0: AxisKeyframe = points[index];
    const p1: AxisKeyframe = points[index + 1];
    if (p0 === undefined || p1 === undefined) { throw new Error('Interpolation requires an existing segment.'); }
    if (mode === 'step') { return p0.value; }
    if (mode === 'linear') { return lerp(p0.value, p1.value, (positionSeconds - p0.positionSeconds) / (p1.positionSeconds - p0.positionSeconds)); }
    const pm1: AxisKeyframe = AxisKeyframes.take(points, index - 1, p1, p0);
    const pp1: AxisKeyframe = AxisKeyframes.take(points, index + 2, p0, p1);
    if (mode === 'pchip') {
      return AxisKeyframes.hermite(p0, p1, AxisKeyframes.pchipSlope(pm1, p0, p1), AxisKeyframes.pchipSlope(p0, p1, pp1), positionSeconds);
    }
    if (mode !== 'makima') { throw new Error('Unsupported interpolation.'); }
    const pm2: AxisKeyframe = AxisKeyframes.take(points, index - 2, pm1, p1);
    const pp2: AxisKeyframe = AxisKeyframes.take(points, index + 3, p1, pp1);
    const m0: number = AxisKeyframes.secant(pm2, pm1);
    const m1: number = AxisKeyframes.secant(pm1, p0);
    const m2: number = AxisKeyframes.secant(p0, p1);
    const m3: number = AxisKeyframes.secant(p1, pp1);
    const m4: number = AxisKeyframes.secant(pp1, pp2);
    return AxisKeyframes.hermite(p0, p1, AxisKeyframes.makimaSlope(m0, m1, m2, m3), AxisKeyframes.makimaSlope(m1, m2, m3, m4), positionSeconds);
  }
  private static take(points: AxisKeyframe[], index: number, p0: AxisKeyframe, p1: AxisKeyframe): AxisKeyframe {
    return AxisKeyframes.valid(points, index) ? points[index] : new AxisKeyframe(3 * p1.positionSeconds - 2 * p0.positionSeconds, p1.value);
  }
  private static secant(a: AxisKeyframe, b: AxisKeyframe): number { return (b.value - a.value) / (b.positionSeconds - a.positionSeconds); }
  private static pchipSlope(a: AxisKeyframe, b: AxisKeyframe, c: AxisKeyframe): number {
    const h0: number = b.positionSeconds - a.positionSeconds;
    const h1: number = c.positionSeconds - b.positionSeconds;
    const d0: number = AxisKeyframes.secant(a, b);
    const d1: number = AxisKeyframes.secant(b, c);
    const w0: number = 2 * h1 + h0;
    const w1: number = h1 + 2 * h0;
    const slope: number = (w0 + w1) / (w0 / d0 + w1 / d1);
    return !Number.isFinite(slope) || d0 * d1 < 0 ? 0 : slope;
  }
  private static makimaSlope(m0: number, m1: number, m2: number, m3: number): number {
    const w0: number = Math.abs(m3 - m2) + Math.abs(m3 + m2) / 2;
    const w1: number = Math.abs(m1 - m0) + Math.abs(m1 + m0) / 2;
    const slope: number = (w0 * m1 + w1 * m2) / (w0 + w1);
    return Number.isFinite(slope) ? slope : 0;
  }
  private static hermite(a: AxisKeyframe, b: AxisKeyframe, s0: number, s1: number, x: number): number {
    const d: number = b.positionSeconds - a.positionSeconds;
    const dx: number = x - a.positionSeconds;
    const t: number = dx / d;
    const r: number = 1 - t;
    return r * r * (a.value * (1 + 2 * t) + s0 * dx) + t * t * (b.value * (3 - 2 * t) - d * s1 * r);
  }
}

export function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }
export function lerp(from: number, to: number, t: number): number { return from + (to - from) * clamp01(t); }
