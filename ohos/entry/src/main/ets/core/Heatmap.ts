import { FunscriptDocument } from './Funscript';

export class HeatmapBucket {
  heat: number = 0;
  rangeMin: number = 0.5;
  rangeMax: number = 0.5;
  hasRange: boolean = false;
  color: string = '#000000';
}
/** Source-led transcription of KeyframesHeatmap.UpdateHeat/UpdateRange at 36c08fb.
 * Times are seconds and positions 0..1 as in upstream. No interpolation/offset
 * is applied to the keyframe range envelope. Runtime rendering remains separate.
 */
export class Heatmap {
  static build(document: FunscriptDocument, durationMs: number, selected: number,
    count: number = 333, combine: boolean = true): HeatmapBucket[] {
    if (!Number.isInteger(count) || count < 2 || count > 500) { throw new Error('Heatmap buckets must be 2–500.'); }
    if (!Number.isFinite(durationMs) || durationMs <= 0) { return []; }
    const result: HeatmapBucket[] = [];
    for (let i = 0; i < count; i++) { result.push(new HeatmapBucket()); }
    const size = durationMs / 1000 / count;
    for (let axisIndex = 0; axisIndex < document.axes.length; axisIndex++) {
      const actions = document.axes[axisIndex].actions;
      for (let j = 1; j < actions.length; j++) {
        const from = actions[j - 1].at / 1000;
        const to = actions[j].at / 1000;
        const low = actions[j - 1].pos / 100;
        const high = actions[j].pos / 100;
        const dx = to - from;
        const dy = Math.abs(high - low);
        if (dx <= 0) { continue; }
        const heated = (combine || axisIndex === selected) && dy >= 0.001 &&
          Math.atan2(dy, dx) * 180 / 3.1415927410125732 >= 5;
        const first = Math.max(0, Math.floor(from / size));
        const last = Math.min(count - 1, Math.floor(to / size));
        for (let i = first; i <= last; i++) {
          const a = Math.max(i * size, from);
          const b = Math.min((i + 1) * size, to);
          if (heated) { result[i].heat += dy * (b - a) / dx; }
          if (axisIndex === selected) {
            const va = low + (a - from) / dx * (high - low);
            const vb = low + (b - from) / dx * (high - low);
            const bucket = result[i];
            bucket.rangeMin = bucket.hasRange ? Math.min(bucket.rangeMin, va, vb) : Math.min(va, vb);
            bucket.rangeMax = bucket.hasRange ? Math.max(bucket.rangeMax, va, vb) : Math.max(va, vb);
            bucket.hasRange = true;
          }
        }
      }
    }
    let maximum = 0;
    for (const bucket of result) { maximum = Math.max(maximum, bucket.heat); }
    const colors = ['#244b5c', '#75b9d1', '#efce62', '#f39944', '#f53e2e'];
    for (const bucket of result) {
      const normalized = maximum > 0 ? Math.max(0, Math.min(1, bucket.heat / maximum)) : 0;
      const value = normalized * 4;
      const floor = Math.floor(value);
      const rounded = value - floor === 0.5 ? (floor % 2 === 0 ? floor : floor + 1) : Math.round(value);
      bucket.color = normalized < 0.001 ? '#000000' : colors[rounded];
    }
    return result;
  }
}
