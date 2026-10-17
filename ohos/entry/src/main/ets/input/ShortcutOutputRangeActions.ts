/** Exact bounded Set/Offset actions from AbstractOutputTarget.RegisterActions.
 * This module has no catalog, selection, persistence, lifecycle or I/O effects.
 * The caller must resolve one current target instance and one explicit axis,
 * validate the whole prospective output configuration, and commit atomically.
 */
export type OutputRangeOperation = 'Minimum::Set' | 'Minimum::Offset' | 'Maximum::Set' | 'Maximum::Offset' |
  'Middle::Set' | 'Middle::Offset' | 'Size::Set' | 'Size::Offset';
export interface OutputRangeAction {
  operation: OutputRangeOperation;
  value: number;
  minimumLimit: number;
  maximumLimit: number;
}
export interface OutputRangeValue {
  axisId: string;
  minimum: number;
  maximum: number;
  enabled: boolean;
}
export interface OutputRangeActionResult { range: OutputRangeValue; changed: boolean; }

function normalized(value: number): boolean { return Number.isFinite(value) && value >= 0 && value <= 1; }
function validRange(range: OutputRangeValue): boolean {
  return range !== null && typeof range === 'object' && typeof range.axisId === 'string' && /^[A-Z][0-9]$/.test(range.axisId) &&
    normalized(range.minimum) && normalized(range.maximum) && typeof range.enabled === 'boolean';
}
/** MathUtils.ClampSafe sorts its two bounds; it does not repair the settings. */
function clampSafe(value: number, from: number, to: number): number {
  const lower: number = from <= to ? from : to;
  const upper: number = from <= to ? to : from;
  return value < lower ? lower : value > upper ? upper : value;
}
function offsetMiddle(range: OutputRangeValue, offset: number, lower: number, upper: number): void {
  if (offset > 0 && range.maximum + offset > upper) { offset = Math.min(offset, upper - range.maximum); }
  else if (offset < 0 && range.minimum + offset < lower) { offset = Math.max(offset, lower - range.minimum); }
  range.minimum = clampSafe(range.minimum + offset, lower, upper - 0.01);
  range.maximum = clampSafe(range.maximum + offset, lower + 0.01, upper);
}
function offsetSize(range: OutputRangeValue, offset: number, lower: number, upper: number): void {
  const middle: number = (range.maximum + range.minimum) / 2;
  const size: number = clampSafe(range.maximum - range.minimum + offset, 0.01, upper - lower);
  let maximum: number = middle + size / 2;
  let minimum: number = middle - size / 2;
  if (maximum > upper) { minimum -= maximum - upper; }
  if (minimum < lower) { maximum += lower - minimum; }
  range.minimum = clampSafe(minimum, lower, upper - 0.01);
  range.maximum = clampSafe(maximum, lower + 0.01, upper);
}
/** No interval rounding and no invented minimum-width validation. The original
 * can produce reversed settings from independently legal limits; reversal is
 * preserved exactly. Out-of-[0,1] results are refused, never normalized. Equal
 * bounds remain valid when the source produces them. Unused limits must have
 * their canonical defaults so a hidden DTO field cannot change a Set action.
 */
export function applyOutputRangeAction(range: OutputRangeValue, action: OutputRangeAction): OutputRangeActionResult | null {
  if (!validRange(range) || action === null || typeof action !== 'object' ||
    !Number.isFinite(action.value) || !normalized(action.minimumLimit) || !normalized(action.maximumLimit)) { return null; }
  const operation: string = action.operation;
  if (typeof operation !== 'string') { return null; }
  const isSet: boolean = operation.endsWith('::Set');
  if (action.value < (isSet ? 0 : -1) || action.value > 1 ||
    (isSet && (action.minimumLimit !== 0 || action.maximumLimit !== 1)) ||
    (operation === 'Minimum::Offset' && action.maximumLimit !== 1) ||
    (operation === 'Maximum::Offset' && action.minimumLimit !== 0)) { return null; }
  const next: OutputRangeValue = { axisId: range.axisId, minimum: range.minimum, maximum: range.maximum, enabled: range.enabled };
  switch (operation) {
    case 'Minimum::Set': next.minimum = clampSafe(action.value, 0, next.maximum - 0.01); break;
    case 'Minimum::Offset': next.minimum = clampSafe(next.minimum + action.value, action.minimumLimit, next.maximum - 0.01); break;
    case 'Maximum::Set': next.maximum = clampSafe(action.value, next.minimum + 0.01, 1); break;
    case 'Maximum::Offset': next.maximum = clampSafe(next.maximum + action.value, next.minimum + 0.01, action.maximumLimit); break;
    // Keep the source binding's half-WIDTH subtraction, not a midpoint correction.
    case 'Middle::Set': offsetMiddle(next, action.value - (next.maximum - next.minimum) / 2, 0, 1); break;
    case 'Middle::Offset': offsetMiddle(next, action.value, action.minimumLimit, action.maximumLimit); break;
    // Set enters OffsetSize in the source; this includes its .01 range clamp.
    case 'Size::Set': offsetSize(next, action.value - (next.maximum - next.minimum), 0, 1); break;
    case 'Size::Offset': offsetSize(next, action.value, action.minimumLimit, action.maximumLimit); break;
    default: return null;
  }
  if (!validRange(next)) { return null; }
  return { range: next, changed: next.minimum !== range.minimum || next.maximum !== range.maximum };
}
