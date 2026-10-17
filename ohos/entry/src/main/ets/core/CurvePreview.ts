import { AxisKeyframe, AxisKeyframes } from './AxisScriptStore';
import { MotionCurvePoint } from './MotionConfiguration';
import type { InterpolationMode } from './Interpolation';

/** Pure editor preview; no provider instance, clock, output cache or persisted state.
 * Source: UI/Controls/DraggablePointCanvas.xaml.cs::RefreshLine and
 * MotionProvider/ViewModels/CustomCurveMotionProvider.cs::Update (36c08fbb99ac).
 * Reuses the SAME AxisKeyframes interpolation kernels as CustomCurveMotion.
 * Preview refreshes immediately on interpolation/loop changes, as the source UI
 * does; this is not a claim about a running provider's delayed keyframe refresh.
 */
export class CurvePreviewResult {
  keyframes: AxisKeyframe[] = [];
  paths: MotionCurvePoint[][] = [];
  tileCount: number = 0;
  issue: string = '';
}

export class CurvePreview {
  static build(points: MotionCurvePoint[], minimumX: number, maximumX: number,
    minimumY: number, maximumY: number, interpolation: InterpolationMode = 'linear',
    isLooping: boolean = false, sampleCount: number = 100): CurvePreviewResult {
    const result: CurvePreviewResult = new CurvePreviewResult();
    const width: number = maximumX - minimumX;
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(minimumX) || !Number.isFinite(maximumX) ||
      !Number.isFinite(minimumY) || !Number.isFinite(maximumY) || minimumY >= maximumY ||
      !Number.isInteger(sampleCount) || sampleCount < 2 || sampleCount > 4096 ||
      (interpolation !== 'linear' && interpolation !== 'pchip' && interpolation !== 'makima' && interpolation !== 'step')) {
      result.issue = '曲线预览范围或插值参数无效。'; return result;
    }
    if (points.length === 0) { return result; }
    for (const point of points) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) { result.issue = '曲线含非有限坐标，无法预览。'; return result; }
    }
    if (isLooping && points.length > 1) {
      const minimum: number = interpolation === 'makima' ? 3 : interpolation === 'pchip' ? 2 : 1;
      result.tileCount = Math.ceil(Math.max(0, (minimum - points.length) / points.length)) + 1;
      const takeCount: number = Math.min(minimum, points.length);
      for (let tile: number = result.tileCount; tile >= 1; tile--) {
        for (const point of points.slice(points.length - takeCount)) { CurvePreview.add(result, point.x - tile * width, point.y); }
      }
      for (const point of points) { CurvePreview.add(result, point.x, point.y); }
      for (let tile: number = 1; tile <= result.tileCount; tile++) {
        for (const point of points.slice(0, takeCount)) { CurvePreview.add(result, point.x + tile * width, point.y); }
      }
    } else {
      // KeyframeCollection.Add keeps the first equal time; endpoint anchors are
      // inserted in exactly source order, even if points are unsorted/duplicated.
      CurvePreview.add(result, minimumX, points[0].y);
      for (const point of points) { CurvePreview.add(result, point.x, point.y); }
      CurvePreview.add(result, maximumX, points[points.length - 1].y);
    }
    if (result.issue.length > 0) { result.keyframes = []; return result; }
    const coordinates: number[] = [minimumX, maximumX];
    for (const point of result.keyframes) {
      if (point.positionSeconds > minimumX && point.positionSeconds < maximumX) { coordinates.push(point.positionSeconds); }
    }
    if (interpolation === 'pchip' || interpolation === 'makima') {
      for (let index: number = 1; index + 1 < sampleCount; index++) {
        coordinates.push(minimumX + width * (index / (sampleCount - 1)));
      }
    }
    coordinates.sort((left: number, right: number) => left - right);
    const times: number[] = coordinates.filter((time: number, index: number) => index === 0 || time !== coordinates[index - 1]);
    let path: MotionCurvePoint[] = [];
    for (const time of times) {
      const value: number | null = CurvePreview.valueAt(result.keyframes, time, interpolation, minimumY, maximumY);
      if (value === null) {
        if (path.length > 0) { result.paths.push(path); path = []; }
        result.issue = '部分曲线超出可计算范围；缺失区段未绘制。'; continue;
      }
      if (interpolation === 'step' && path.length > 0) {
        // Preserve true discontinuities: do not turn Step into short ramps.
        path.push(new MotionCurvePoint(time, path[path.length - 1].y));
      }
      path.push(new MotionCurvePoint(time, value));
    }
    if (path.length > 0) { result.paths.push(path); }
    return result;
  }

  static valueAt(keyframes: AxisKeyframe[], time: number, interpolation: InterpolationMode,
    minimumY: number = 0, maximumY: number = 1): number | null {
    if (!Number.isFinite(time) || keyframes.length < 2) { return null; }
    let index: number = AxisKeyframes.searchForIndexBefore(keyframes, time);
    index = AxisKeyframes.advanceIndex(keyframes, index, time);
    if (index === keyframes.length - 1 && time === keyframes[index].positionSeconds) { index--; }
    if (!AxisKeyframes.valid(keyframes, index) || !AxisKeyframes.valid(keyframes, index + 1)) { return null; }
    const value: number = AxisKeyframes.interpolate(keyframes, index, time, interpolation);
    return Number.isFinite(value) ? Math.max(minimumY, Math.min(maximumY, value)) : null;
  }

  private static add(result: CurvePreviewResult, x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) { result.issue = '平铺坐标超出可计算范围，未绘制曲线。'; return; }
    const index: number = AxisKeyframes.searchForIndexBefore(result.keyframes, x) + 1;
    if (AxisKeyframes.valid(result.keyframes, index) && result.keyframes[index].positionSeconds === x) { return; }
    result.keyframes.splice(index, 0, new AxisKeyframe(x, y));
  }
}
