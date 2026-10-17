/** A delivered canvas callback, never an instruction to infer WPF attachment. */
export type PointCanvasEvent = 'collection-reset' | 'viewport-change' | 'synchronize';

export class PointCanvasPoint {
  x: number;
  y: number;
  constructor(x: number, y: number) { this.x = x; this.y = y; }
}

/** Both audited source bindings use a zero-origin viewport. */
export class PointCanvasGeometry {
  attached: boolean;
  actualWidth: number;
  actualHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  constructor(attached: boolean, actualWidth: number, actualHeight: number,
    viewportWidth: number, viewportHeight: number) {
    this.attached = attached;
    this.actualWidth = actualWidth;
    this.actualHeight = actualHeight;
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
  }
}

export class PointCanvasEffectResult {
  points: PointCanvasPoint[] = [];
  /** null means this event did not synchronize elements; previous elements are unknown. */
  canvasPoints: PointCanvasPoint[] | null = null;
  collectionResetCount: number = 0;
  removedPointCount: number = 0;
  pointWriteBackCount: number = 0;
  countNotificationCount: number = 0;
  itemNotificationCount: number = 0;
}

class OrderedCanvasPoint {
  point: PointCanvasPoint;
  ordinal: number;
  constructor(point: PointCanvasPoint, ordinal: number) { this.point = point; this.ordinal = ordinal; }
}

/**
 * Pure, bounded projection of DraggablePointCanvas's collection effects.
 * Original: UpdateViewport, SynchronizeElementsFromPoints,
 * SynchronizePointsFromElements, ToCanvas/FromCanvas (36c08fbb99ac).
 *
 * The caller supplies an actually delivered event and attachment/measurement.
 * synchronize is the common numeric part of Points DP binding and SizeChanged.
 * A same-value Duration assignment is not itself a viewport-change event.
 * collection-reset means SetFrom has already supplied this incoming list;
 * its Reset is counted even when empty/equal/detached. Only viewport-change
 * prunes. Measured synchronization preserves duplicate X and writes every
 * coordinate, including equal values, back through the original indexer.
 *
 * This does not emulate WPF, its dispatcher, Fody, element lifetime, line
 * rendering, drag clamping, provider refresh/sync or persistent collections.
 * No current model is changed. Validate the result before an owning adapter
 * commits it; collection identity and lifecycle remain that adapter's job.
 */
export class PointCanvasEffects {
  static readonly MAX_POINTS: number = 4096;

  static apply(points: PointCanvasPoint[], geometry: PointCanvasGeometry,
    event: PointCanvasEvent): PointCanvasEffectResult {
    if (event !== 'collection-reset' && event !== 'viewport-change' && event !== 'synchronize') {
      throw new Error('Unknown point canvas event.');
    }
    PointCanvasEffects.validateGeometry(geometry);
    if (!Array.isArray(points) || points.length > PointCanvasEffects.MAX_POINTS) {
      throw new Error('Point canvas requires at most 4096 points.');
    }
    const result: PointCanvasEffectResult = new PointCanvasEffectResult();
    for (let index: number = 0; index < points.length; index++) {
      const point: PointCanvasPoint = points[index];
      if (point === null || typeof point !== 'object' || Array.isArray(point)) {
        throw new Error('Point canvas requires dense point objects.');
      }
      PointCanvasEffects.finite(point.x);
      PointCanvasEffects.finite(point.y);
      result.points.push(new PointCanvasPoint(point.x, point.y));
    }
    result.collectionResetCount = event === 'collection-reset' ? 1 : 0;
    if (geometry.attached) {
      if (event === 'viewport-change') {
        // Source Rect.Contains includes every edge. Both audited Rects start at 0.
        const retained: PointCanvasPoint[] = [];
        for (const point of result.points) {
          if (point.x >= 0 && point.x <= geometry.viewportWidth &&
            point.y >= 0 && point.y <= geometry.viewportHeight) {
            retained.push(point);
          } else { result.removedPointCount++; }
        }
        result.points = retained;
      }
      if (geometry.actualWidth !== 0 && geometry.actualHeight !== 0) {
        const ordered: OrderedCanvasPoint[] = result.points.map((point: PointCanvasPoint, index: number) =>
          new OrderedCanvasPoint(point, index));
        ordered.sort(PointCanvasEffects.compare);
        const pixels: OrderedCanvasPoint[] = ordered.map((entry: OrderedCanvasPoint, index: number) =>
          new OrderedCanvasPoint(PointCanvasEffects.toCanvas(entry.point, geometry), index));
        // The second stable sort matters when distinct model X values round to one pixel X.
        pixels.sort(PointCanvasEffects.compare);
        result.canvasPoints = pixels.map((entry: OrderedCanvasPoint) =>
          new PointCanvasPoint(entry.point.x, entry.point.y));
        result.points = pixels.map((entry: OrderedCanvasPoint) => PointCanvasEffects.fromCanvas(entry.point, geometry));
        result.pointWriteBackCount = result.points.length;
      }
    }
    const notifications: number = result.collectionResetCount + result.removedPointCount + result.pointWriteBackCount;
    result.countNotificationCount = notifications;
    result.itemNotificationCount = notifications;
    return result;
  }

  private static compare(left: OrderedCanvasPoint, right: OrderedCanvasPoint): number {
    return left.point.x < right.point.x ? -1 : left.point.x > right.point.x ? 1 : left.ordinal - right.ordinal;
  }

  private static toCanvas(point: PointCanvasPoint, geometry: PointCanvasGeometry): PointCanvasPoint {
    const x: number = PointCanvasEffects.finite(point.x / geometry.viewportWidth);
    const y: number = PointCanvasEffects.finite(point.y / geometry.viewportHeight);
    const flippedY: number = PointCanvasEffects.finite(1 - y);
    return new PointCanvasPoint(PointCanvasEffects.finite(x * geometry.actualWidth),
      PointCanvasEffects.finite(flippedY * geometry.actualHeight));
  }

  private static fromCanvas(point: PointCanvasPoint, geometry: PointCanvasGeometry): PointCanvasPoint {
    const x: number = PointCanvasEffects.finite(point.x / geometry.actualWidth);
    const y: number = PointCanvasEffects.finite(point.y / geometry.actualHeight);
    const flippedY: number = PointCanvasEffects.finite(1 - y);
    return new PointCanvasPoint(PointCanvasEffects.finite(x * geometry.viewportWidth),
      PointCanvasEffects.finite(flippedY * geometry.viewportHeight));
  }

  private static validateGeometry(geometry: PointCanvasGeometry): void {
    if (geometry === null || typeof geometry !== 'object' || Array.isArray(geometry) ||
      typeof geometry.attached !== 'boolean') { throw new Error('Point canvas geometry is invalid.'); }
    PointCanvasEffects.finite(geometry.actualWidth);
    PointCanvasEffects.finite(geometry.actualHeight);
    PointCanvasEffects.finite(geometry.viewportWidth);
    PointCanvasEffects.finite(geometry.viewportHeight);
    if (geometry.actualWidth < 0 || geometry.actualHeight < 0 ||
      geometry.viewportWidth <= 0 || geometry.viewportHeight <= 0) {
      throw new Error('Point canvas sizes must be nonnegative with a positive viewport.');
    }
  }

  private static finite(value: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error('Point canvas coordinates and calculations must be finite.');
    }
    return value;
  }
}
