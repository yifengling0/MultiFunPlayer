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

export class FunscriptDocument {
  axes: FunscriptAxis[];
  durationMs: number;
  constructor(axes: FunscriptAxis[]) {
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
class RawDocument {
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
    const seen: Set<string> = new Set<string>();
    let count: number = 0;
    for (const axis of axes) {
      if (seen.has(axis.name)) { throw new Error('Duplicate axis name: ' + axis.name); }
      seen.add(axis.name);
      count += axis.actions.length;
    }
    if (count > FunscriptParser.MAX_ACTIONS) { throw new Error('Too many total actions.'); }
    return new FunscriptDocument(axes);
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
