import { OutputError } from './OutputTypes';
import type { AxisOutputEvent, OutputValue, TCodeProfile } from './OutputTypes';

/** Precision 1–9 preserves the original Int32 maximum. Precision 10 is retained
 * by configuration but fails closed: the source casts 9999999999 to Int32,
 * and its dirty threshold subsequently overflows. No portable device-safe
 * precision-10 policy has been established; never substitute precision 9/4.
 */
function validatePrecision(precision: number): void {
  if (precision === 10) {
    throw new OutputError('unsupportedPrecision', 'Precision 10 source defect: Int32 maximum conversion and dirty-threshold overflow require an explicit verified compatibility policy.');
  }
  if (!Number.isInteger(precision) || precision < 1 || precision > 9) {
    throw new OutputError('unsupportedPrecision', 'TCode precision must be an integer from 1 to 9; precision 10 is blocked by a source defect.');
  }
}
export function validateTCodeProfile(profile: TCodeProfile): void {
  validatePrecision(profile.precision);
  if (!Number.isSafeInteger(profile.revision) || profile.revision < 0 ||
    !Number.isSafeInteger(profile.maximumPayloadBytes) || profile.maximumPayloadBytes < 1 ||
    !Number.isFinite(profile.maximumDurationMs) || profile.maximumDurationMs < 0 || profile.maximumDurationMs > 2147483647) {
    throw new OutputError('invalidConfiguration', 'Invalid profile revision, payload limit or duration limit.');
  }
  const seen: string[] = [];
  for (const axis of profile.axisOrder) {
    if (!/^[A-Z][0-9]$/.test(axis)) { throw new OutputError('invalidAxis', 'Invalid TCode axis: ' + axis); }
    if (seen.indexOf(axis) >= 0) { throw new OutputError('duplicateAxis', 'Duplicate TCode axis: ' + axis); }
    seen.push(axis);
  }
}
export function validateNormalizedValue(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new OutputError('invalidValue', 'Output values must be finite and normalized to 0–1.');
  }
}
export function intervalMilliseconds(milliseconds: number, maximum: number): number {
  if (!Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > maximum) {
    throw new OutputError('invalidDuration', 'Duration is outside the explicit profile limit.');
  }
  const interval: number = Math.floor(milliseconds + 0.75);
  if (!Number.isSafeInteger(interval) || interval > 2147483647) {
    throw new OutputError('invalidDuration', 'Duration does not fit the TCode interval integer.');
  }
  return interval;
}

/** .NET custom all-zero double formatting first produces 15 significant decimal
 * digits, then rounds the decimal buffer away from zero at the integer boundary.
 * Sources: https://github.com/dotnet/runtime/blob/v9.0.10/src/libraries/System.Private.CoreLib/src/System/Number.Formatting.cs
 * (FormatFloat) and the adjacent Double.cs::MaxPrecisionCustomFormat (15). Tested against linked upstream
 * DeviceAxis under .NET 9.0.21, including the representable neighbors of midpoints.
 * Do not replace with Math.round(value * maximum): it disagrees at 1-ULP edges.
 * Domain: nonnegative scaled values <=999999999 (precision 1–9). Around every
 * integer half boundary the 15-digit decimal grid is at least 10^-15 and at
 * most 10^-6, finer than .5 yet wider than binary64 spacing. Parsing that grid
 * cannot cross a half boundary. A digit-15 tie affecting integer rounding is
 * immediately below x.5; its upper decimal neighbor ends in zero, so both
 * ties-to-even (.NET) and ties-up (toPrecision) select it. Other digit-15 ties
 * remain on the same side of x.5. Values below .5 and decade transitions obey
 * the same argument; subnormals round to zero. Differential fixtures cover
 * all precisions, decimal decades, half-boundary neighbors and seeded values.
 */
export function formatTCodeValue(value: number, precision: number): string {
  validatePrecision(precision);
  validateNormalizedValue(value);
  const maximum: number = Math.pow(10, precision) - 1;
  const decimal: number = Number((value * maximum).toPrecision(15));
  const whole: number = Math.floor(decimal);
  const rounded: number = decimal - whole >= 0.5 ? whole + 1 : whole;
  return rounded.toString().padStart(precision, '0');
}
function validateAxis(axisId: string, profile: TCodeProfile): void {
  if (profile.axisOrder.indexOf(axisId) < 0) { throw new OutputError('invalidAxis', 'Axis is absent from the profile: ' + axisId); }
}
function boundedPayload(payload: string, profile: TCodeProfile): string {
  // Every permitted token is ASCII; code units and UTF-8 bytes have equal length.
  if (payload.length > profile.maximumPayloadBytes) { throw new OutputError('oversizePayload', 'Encoded payload exceeds the profile limit.'); }
  return payload;
}
export function encodeFixed(profile: TCodeProfile, mappedValues: ReadonlyArray<OutputValue>, elapsedMs: number, offloadElapsedTime: boolean): string {
  validateTCodeProfile(profile);
  const interval: number = intervalMilliseconds(elapsedMs, profile.maximumDurationMs);
  const seen: string[] = [];
  for (const value of mappedValues) {
    validateAxis(value.axisId, profile);
    if (seen.indexOf(value.axisId) >= 0) { throw new OutputError('duplicateAxis', 'Duplicate fixed value: ' + value.axisId); }
    seen.push(value.axisId); validateNormalizedValue(value.value);
  }
  const commands: string[] = [];
  for (const axis of profile.axisOrder) {
    const entry: OutputValue | undefined = mappedValues.find(value => value.axisId === axis);
    if (entry !== undefined) { commands.push(axis + formatTCodeValue(entry.value, profile.precision) + (offloadElapsedTime ? '' : 'I' + interval)); }
  }
  return boundedPayload(commands.length === 0 ? '' : commands.join(' ') + '\n', profile);
}
export function encodeEvent(profile: TCodeProfile, mappedEvent: AxisOutputEvent): string {
  validateTCodeProfile(profile); validateAxis(mappedEvent.axisId, profile); validateNormalizedValue(mappedEvent.targetValue);
  const interval: number = intervalMilliseconds(mappedEvent.durationSeconds * 1000, profile.maximumDurationMs);
  return boundedPayload(mappedEvent.axisId + formatTCodeValue(mappedEvent.targetValue, profile.precision) + 'I' + interval + '\n', profile);
}
export function asciiBytes(payload: string): Uint8Array {
  const bytes: Uint8Array = new Uint8Array(payload.length);
  for (let index: number = 0; index < payload.length; index++) {
    const code: number = payload.charCodeAt(index);
    if (code > 127) { throw new OutputError('invalidValue', 'TCode payload must contain only ASCII.'); }
    bytes[index] = code;
  }
  return bytes;
}
