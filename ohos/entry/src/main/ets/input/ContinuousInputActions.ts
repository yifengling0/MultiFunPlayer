import { MotionConfigurations, MotionProviderConfiguration } from '../core/MotionConfiguration';
import type { OutputRangeValue, OutputRangeActionResult } from './ShortcutOutputRangeActions';
import { ContinuousInputAction, validateContinuousAction } from './ContinuousInputConfiguration';
import { ContinuousGestureData } from './ContinuousDriveEngine';

/** Exact Drive consumers, separate from button Set/Offset bindings. No I/O or
 * authority is granted here. The host resolves captured axis/provider/target
 * ownership and commits via the existing live configuration transaction. */
function normalized(value: number): boolean { return Number.isFinite(value) && value >= 0 && value <= 1; }
function clamp01(value: number): number { return Math.min(1, Math.max(0, value)); }
function clampSafe(value: number, from: number, to: number): number {
  const lower = Math.min(from, to); const upper = Math.max(from, to);
  return Math.min(upper, Math.max(lower, value));
}
function validData(data: ContinuousGestureData): boolean {
  return data !== null && typeof data === 'object' && Number.isFinite(data.valueOrDelta) &&
    Number.isFinite(data.deltaTime) && data.deltaTime >= 0 && typeof data.isAbsolute === 'boolean';
}
export function continuousValue(current: number, data: ContinuousGestureData): number | null {
  if (!validData(data) || !Number.isFinite(current)) { return null; }
  const value = data.isAbsolute ? data.valueOrDelta : current + data.valueOrDelta;
  return Number.isFinite(value) ? value : null;
}
export function applyContinuousMotion(settings: MotionProviderConfiguration, action: ContinuousInputAction,
  data: ContinuousGestureData): MotionProviderConfiguration | null {
  if (!validateContinuousAction(action) || !validData(data) || action.provider !== settings.id) { return null; }
  let next: MotionProviderConfiguration;
  try { next = MotionConfigurations.clone(settings); } catch (_error) { return null; }
  const field = action.id === 'MotionProvider::Speed::Drive' ? 'speed' :
    action.id === 'MotionProvider::Minimum::Drive' ? 'minimum' :
      action.id === 'MotionProvider::Maximum::Drive' ? 'maximum' : '';
  if (field.length === 0) { return null; }
  const before = field === 'speed' ? next.speed : field === 'minimum' ? next.minimum : next.maximum;
  const value = continuousValue(before, data);
  if (value === null) { return null; }
  if (field === 'speed') { next.speed = Math.max(0.01, value); }
  else if (field === 'minimum') { next.minimum = clamp01(value); }
  else { next.maximum = clamp01(value); }
  return MotionConfigurations.validate(next).length === 0 ? next : null;
}
export function applyContinuousRange(range: OutputRangeValue, action: ContinuousInputAction,
  data: ContinuousGestureData): OutputRangeActionResult | null {
  if (!validateContinuousAction(action) || !validData(data) || range === null || typeof range !== 'object' ||
    !normalized(range.minimum) || !normalized(range.maximum) || typeof range.enabled !== 'boolean' ||
    range.axisId !== action.targetAxis) { return null; }
  const lower = action.minimumLimit; const upper = action.maximumLimit;
  const next: OutputRangeValue = { axisId: range.axisId, minimum: range.minimum, maximum: range.maximum, enabled: range.enabled };
  const field = action.id.slice('OutputTarget::Axis::Range::'.length);
  if (field === 'Minimum::Drive') {
    const value = continuousValue(range.minimum, data); if (value === null) { return null; }
    next.minimum = clampSafe(value, lower, range.maximum - 0.01);
  } else if (field === 'Maximum::Drive') {
    const value = continuousValue(range.maximum, data); if (value === null) { return null; }
    next.maximum = clampSafe(value, range.minimum + 0.01, upper);
  } else if (field === 'Middle::Drive') {
    const halfSize = (range.maximum - range.minimum) / 2;
    let middle = continuousValue((range.maximum + range.minimum) / 2, data); if (middle === null) { return null; }
    if (middle + halfSize > upper) { middle = upper - halfSize; }
    else if (middle - halfSize < lower) { middle = lower + halfSize; }
    next.minimum = clampSafe(middle - halfSize, lower, upper - 0.01);
    next.maximum = clampSafe(middle + halfSize, lower + 0.01, upper);
  } else if (field === 'Size::Drive') {
    const middle = (range.maximum + range.minimum) / 2;
    const size = continuousValue(range.maximum - range.minimum, data); if (size === null) { return null; }
    let maximum = middle + size / 2; let minimum = middle - size / 2;
    if (maximum > upper) { minimum -= maximum - upper; }
    if (minimum < lower) { maximum += lower - minimum; }
    next.minimum = clampSafe(minimum, lower, upper - 0.01);
    next.maximum = clampSafe(maximum, lower + 0.01, upper);
  } else { return null; }
  if (!normalized(next.minimum) || !normalized(next.maximum)) { return null; }
  return { range: next, changed: next.minimum !== range.minimum || next.maximum !== range.maximum };
}
