import { FunscriptAxis, FunscriptAction } from './Funscript';

export type InterpolationMode = 'linear' | 'pchip' | 'makima' | 'step';

class Keyframe {
  x: number;
  y: number;
  constructor(x: number, y: number) { this.x = x; this.y = y; }
}

function normalized(point: FunscriptAction): Keyframe {
  return new Keyframe(point.at / 1000, point.pos / 100);
}

/** Exact upstream KeyframeCollection.TakeOrExtrapolate, including Makima's pm2 ordering. */
function takeOrExtrapolate(points: FunscriptAction[], index: number, p0: Keyframe, p1: Keyframe): Keyframe {
  return index >= 0 && index < points.length ? normalized(points[index]) :
    new Keyframe(3 * p1.x - 2 * p0.x, p1.y);
}

function hermite(p0: Keyframe, p1: Keyframe, s0: number, s1: number, x: number): number {
  const d: number = p1.x - p0.x;
  const dx: number = x - p0.x;
  const t: number = dx / d;
  const r: number = 1 - t;
  return r * r * (p0.y * (1 + 2 * t) + s0 * dx) +
    t * t * (p1.y * (3 - 2 * t) - d * s1 * r);
}

function pchipSlope(a: Keyframe, b: Keyframe, c: Keyframe): number {
  const h0: number = b.x - a.x;
  const h1: number = c.x - b.x;
  const d0: number = (b.y - a.y) / h0;
  const d1: number = (c.y - b.y) / h1;
  const w0: number = 2 * h1 + h0;
  const w1: number = h1 + 2 * h0;
  const slope: number = (w0 + w1) / (w0 / d0 + w1 / d1);
  return !Number.isFinite(slope) || d1 * d0 < 0 ? 0 : slope;
}

function secant(a: Keyframe, b: Keyframe): number { return (b.y - a.y) / (b.x - a.x); }

function makimaSlope(m0: number, m1: number, m2: number, m3: number): number {
  const w0: number = Math.abs(m3 - m2) + Math.abs(m3 + m2) / 2;
  const w1: number = Math.abs(m1 - m0) + Math.abs(m1 + m0) / 2;
  const slope: number = (w0 * m1 + w1 * m2) / (w0 + w1);
  return Number.isFinite(slope) ? slope : 0;
}

/**
 * Preview adapter for parsed (sorted, unique, bounded) axes. Input/output: ms / 0–100.
 * MathUtils.cs kernels and KeyframeCollection.cs padding are evaluated in upstream
 * seconds / 0–1 units. Final clamp is the separate ScriptViewModel.cs:234 policy.
 * Empty/single-point axes and holding outside the timeline are preview policies;
 * upstream KeyframeCollection.Interpolate itself requires an existing segment.
 * Exact interior timestamps select the segment beginning at that keyframe (Step too).
 */
export function interpolateAxis(axis: FunscriptAxis, timeMs: number, mode: InterpolationMode): number {
  if (!Number.isFinite(timeMs)) { throw new Error('Time must be finite.'); }
  if (mode !== 'linear' && mode !== 'pchip' && mode !== 'makima' && mode !== 'step') {
    throw new Error('Unsupported interpolation mode.');
  }
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
  const p0: Keyframe = normalized(points[lo]);
  const p1: Keyframe = normalized(points[hi]);
  const x: number = timeMs / 1000;
  let value: number = p0.y;
  if (mode === 'linear') {
    const t: number = Math.max(0, Math.min(1, (x - p0.x) / (p1.x - p0.x)));
    value = p0.y + (p1.y - p0.y) * t;
  } else if (mode === 'pchip' || mode === 'makima') {
    const pm1: Keyframe = takeOrExtrapolate(points, lo - 1, p1, p0);
    const pp1: Keyframe = takeOrExtrapolate(points, lo + 2, p0, p1);
    if (mode === 'pchip') {
      value = hermite(p0, p1, pchipSlope(pm1, p0, p1), pchipSlope(p0, p1, pp1), x);
    } else {
      const pm2: Keyframe = takeOrExtrapolate(points, lo - 2, pm1, p1);
      const pp2: Keyframe = takeOrExtrapolate(points, lo + 3, p1, pp1);
      const m0: number = secant(pm2, pm1);
      const m1: number = secant(pm1, p0);
      const m2: number = secant(p0, p1);
      const m3: number = secant(p1, pp1);
      const m4: number = secant(pp1, pp2);
      value = hermite(p0, p1, makimaSlope(m0, m1, m2, m3), makimaSlope(m1, m2, m3, m4), x);
    }
  }
  return Math.max(0, Math.min(1, value)) * 100;
}
