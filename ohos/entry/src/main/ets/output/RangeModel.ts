import { OutputError, copyEvent } from './OutputTypes';
import type { AxisOutputEvent, AxisRange, OutputValue, TCodeProfile } from './OutputTypes';
import { intervalMilliseconds, validateNormalizedValue, validateTCodeProfile } from './TCodeEncoder';

export function validateRange(range: AxisRange): void {
  if (!Number.isFinite(range.minimum) || !Number.isFinite(range.maximum) || range.minimum < 0 ||
    range.minimum > 1 || range.maximum < 0 || range.maximum > 1 || typeof range.enabled !== 'boolean') {
    throw new OutputError('invalidRange', 'Range endpoints must each be finite and within 0 through 1; reversed ranges are preserved.');
  }
}
/** Imported zero-width ranges are preserved and explicitly diagnosable. Editing
 * uses the upstream 0.01 width rules; importing is not an editing operation.
 */
export function rangeDiagnostic(range: AxisRange): string | null {
  validateRange(range);
  return range.minimum === range.maximum ? 'degenerateRange: output is constant; imported range was preserved.' :
    range.minimum > range.maximum ? 'reversedRange: output direction is inverted; endpoint order was preserved.' : null;
}
export function validateRanges(ranges: ReadonlyArray<AxisRange>, profile: TCodeProfile): void {
  validateTCodeProfile(profile);
  const seen: string[] = [];
  for (const range of ranges) {
    if (profile.axisOrder.indexOf(range.axisId) < 0) { throw new OutputError('invalidAxis', 'Unknown range axis: ' + range.axisId); }
    if (seen.indexOf(range.axisId) >= 0) { throw new OutputError('duplicateAxis', 'Duplicate range: ' + range.axisId); }
    seen.push(range.axisId); validateRange(range);
  }
  if (profile.axisOrder.some(axis => seen.indexOf(axis) < 0)) { throw new OutputError('invalidRange', 'Every profile axis needs an explicit range.'); }
}
export function mapFixed(values: ReadonlyArray<OutputValue>, ranges: ReadonlyArray<AxisRange>, profile: TCodeProfile): OutputValue[] {
  validateRanges(ranges, profile);
  const seen: string[] = [];
  for (const value of values) {
    if (profile.axisOrder.indexOf(value.axisId) < 0) { throw new OutputError('invalidAxis', 'Unknown value axis: ' + value.axisId); }
    if (seen.indexOf(value.axisId) >= 0) { throw new OutputError('duplicateAxis', 'Duplicate value axis: ' + value.axisId); }
    seen.push(value.axisId);
  }
  const mapped: OutputValue[] = [];
  for (const axis of profile.axisOrder) {
    const range: AxisRange | undefined = ranges.find(item => item.axisId === axis);
    if (range === undefined || !range.enabled) { continue; }
    const source: OutputValue | undefined = values.find(item => item.axisId === axis);
    if (source === undefined) { throw new OutputError('invalidValue', 'Missing enabled source axis: ' + axis); }
    validateNormalizedValue(source.value);
    mapped.push({ axisId: axis, value: range.minimum + (range.maximum - range.minimum) * source.value });
  }
  return mapped;
}
export function mapEvent(event: AxisOutputEvent, range: AxisRange, profile: TCodeProfile): AxisOutputEvent | null {
  validateTCodeProfile(profile); validateRange(range);
  if (event.axisId !== range.axisId || profile.axisOrder.indexOf(event.axisId) < 0) { throw new OutputError('invalidAxis', 'Event/range axis is absent or mismatched.'); }
  if (!range.enabled) { return null; }
  validateNormalizedValue(event.targetValue);
  intervalMilliseconds(event.durationSeconds * 1000, profile.maximumDurationMs);
  const mapped: AxisOutputEvent = { eventId: event.eventId, epoch: event.epoch,
    sourceFrameSequence: event.sourceFrameSequence, axisId: event.axisId, kind: event.kind,
    targetValue: range.minimum + (range.maximum - range.minimum) * event.targetValue,
    durationSeconds: event.durationSeconds, from: event.from, to: event.to,
    speedLimitUnitsPerSecond: event.speedLimitUnitsPerSecond };
  return copyEvent(mapped);
}
/** DeviceAxis.IsValueDirty compares UNQUANTIZED, already range-mapped doubles. */
export function isTCodeDirty(mappedValue: number, lastWritten: number, precision: number): boolean {
  if (!Number.isInteger(precision) || precision < 1 || precision > 10) { throw new OutputError('unsupportedPrecision', 'Invalid dirty precision.'); }
  return Math.abs(lastWritten - mappedValue) * Math.pow(10, precision) >= 1 || Number.isFinite(lastWritten) !== Number.isFinite(mappedValue);
}

/** Compatibility reference ONLY. Production RangeModel/OutputSession never call
 * this: source Fixed GetValue falls back to the axis default for nonfinite data.
 * Source Polled skips nonfinite targets instead. Missing axes still throw here.
 */
export class LegacyReferenceProjector {
  static fixedValue(value: number, defaultValue: number): number { return Number.isFinite(value) ? value : defaultValue; }
  static polledTarget(value: number): number | null { return Number.isFinite(value) ? value : null; }
}
function clampSafe(value: number, a: number, b: number): number { return Math.max(Math.min(a, b), Math.min(Math.max(a, b), value)); }
function edited(range: AxisRange, minimum: number, maximum: number): AxisRange {
  return { axisId: range.axisId, minimum: minimum, maximum: maximum, enabled: range.enabled };
}
function checkEdit(range: AxisRange, value: number, lower: number, upper: number): void {
  validateRange(range);
  if (!Number.isFinite(value) || !Number.isFinite(lower) || !Number.isFinite(upper) || lower < 0 || upper > 1 || upper - lower < 0.01) {
    throw new OutputError('invalidRange', 'Range edit requires finite values and limits at least 0.01 apart.');
  }
}
/** Source AbstractOutputTarget.RegisterActions, each operation kept independent. */
export class RangeEditor {
  static setMinimum(range: AxisRange, value: number, minimumLimit: number = 0): AxisRange {
    checkEdit(range, value, minimumLimit, 1);
    return edited(range, clampSafe(value, minimumLimit, range.maximum - 0.01), range.maximum);
  }
  static setMaximum(range: AxisRange, value: number, maximumLimit: number = 1): AxisRange {
    checkEdit(range, value, 0, maximumLimit);
    return edited(range, range.minimum, clampSafe(value, range.minimum + 0.01, maximumLimit));
  }
  static offsetMinimum(range: AxisRange, offset: number, minimumLimit: number = 0): AxisRange { return RangeEditor.setMinimum(range, range.minimum + offset, minimumLimit); }
  static offsetMaximum(range: AxisRange, offset: number, maximumLimit: number = 1): AxisRange { return RangeEditor.setMaximum(range, range.maximum + offset, maximumLimit); }
  static setMiddle(range: AxisRange, middle: number, minimumLimit: number = 0, maximumLimit: number = 1): AxisRange {
    checkEdit(range, middle, minimumLimit, maximumLimit);
    const half: number = (range.maximum - range.minimum) / 2;
    if (middle + half > maximumLimit) { middle = maximumLimit - half; }
    else if (middle - half < minimumLimit) { middle = minimumLimit + half; }
    return edited(range, clampSafe(middle - half, minimumLimit, maximumLimit - 0.01), clampSafe(middle + half, minimumLimit + 0.01, maximumLimit));
  }
  /** Preserve the ORIGINAL shortcut action binding separately from the normal
   * setMiddle/Drive helper. Source line 306 subtracts half WIDTH rather than
   * the current middle, so a nonzero minimum produces a shifted result. This
   * source defect must not silently redefine a new UI's ordinary middle editor.
   */
  static setMiddleAction(range: AxisRange, value: number): AxisRange {
    return RangeEditor.offsetMiddle(range, value - (range.maximum - range.minimum) / 2, 0, 1);
  }
  static offsetMiddle(range: AxisRange, offset: number, minimumLimit: number = 0, maximumLimit: number = 1): AxisRange {
    checkEdit(range, offset, minimumLimit, maximumLimit);
    if (offset > 0 && range.maximum + offset > maximumLimit) { offset = Math.min(offset, maximumLimit - range.maximum); }
    else if (offset < 0 && range.minimum + offset < minimumLimit) { offset = Math.max(offset, minimumLimit - range.minimum); }
    return edited(range, clampSafe(range.minimum + offset, minimumLimit, maximumLimit - 0.01), clampSafe(range.maximum + offset, minimumLimit + 0.01, maximumLimit));
  }
  static setSize(range: AxisRange, size: number, minimumLimit: number = 0, maximumLimit: number = 1): AxisRange {
    checkEdit(range, size, minimumLimit, maximumLimit);
    return RangeEditor.middleAndSize(range, (range.minimum + range.maximum) / 2, size, minimumLimit, maximumLimit);
  }
  static offsetSize(range: AxisRange, offset: number, minimumLimit: number = 0, maximumLimit: number = 1): AxisRange {
    checkEdit(range, offset, minimumLimit, maximumLimit);
    return RangeEditor.middleAndSize(range, (range.minimum + range.maximum) / 2,
      clampSafe(range.maximum - range.minimum + offset, 0.01, maximumLimit - minimumLimit), minimumLimit, maximumLimit);
  }
  private static middleAndSize(range: AxisRange, middle: number, size: number, lower: number, upper: number): AxisRange {
    let maximum: number = middle + size / 2;
    let minimum: number = middle - size / 2;
    if (maximum > upper) { minimum -= maximum - upper; }
    if (minimum < lower) { maximum += lower - minimum; }
    return edited(range, clampSafe(minimum, lower, upper - 0.01), clampSafe(maximum, lower + 0.01, upper));
  }
}
