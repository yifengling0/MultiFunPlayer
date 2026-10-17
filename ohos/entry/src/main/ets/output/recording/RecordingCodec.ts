/** Original IScriptWriter.cs: UTF-8 without BOM, literal LF for CSV. */
export type RecordingFormat = 'funscript' | 'csv';
export function recordingDirty(value: number, last: number): boolean {
  return Math.abs(last - value) >= 1E-10 || Number.isFinite(value) !== Number.isFinite(last);
}
export function roundEven(value: number): number {
  const floor: number = Math.floor(value);
  const fraction: number = value - floor;
  return fraction < 0.5 ? floor : fraction > 0.5 ? floor + 1 : floor % 2 === 0 ? floor : floor + 1;
}
/** .NET modern invariant general format: shortest round-trip, exponent for
 * exponents < -4 or >= 17, uppercase E, explicit sign and two-digit exponent. */
export function invariantDouble(value: number): string {
  if (Number.isNaN(value)) { return 'NaN'; }
  if (value === Infinity) { return 'Infinity'; }
  if (value === -Infinity) { return '-Infinity'; }
  if (Object.is(value, -0)) { return '-0'; }
  const text: string = value.toString();
  if (value === 0) { return text; }
  const exponent: number = Number(value.toExponential().split('e')[1]);
  if (exponent < -4 || exponent >= 17) {
    const parts: string[] = value.toExponential().split('e');
    const power: number = Number(parts[1]);
    return parts[0] + 'E' + (power >= 0 ? '+' : '-') + Math.abs(power).toString().padStart(2, '0');
  }
  return text;
}
export function recordingHeader(format: RecordingFormat): string { return format === 'csv' ? 'position;value\n' : '{ "actions": ['; }
export function recordingFooter(format: RecordingFormat): string { return format === 'csv' ? '' : ']}'; }
export function recordingRow(format: RecordingFormat, seconds: number, value: number, first: boolean): string {
  if (!Number.isFinite(seconds) || seconds < 0 || !Number.isFinite(value)) { throw new Error('Recording requires finite elapsed time and values.'); }
  if (format === 'csv') { return invariantDouble(seconds) + ';' + invariantDouble(value) + '\n'; }
  const at: number = roundEven(seconds * 1000);
  if (at > 2147483647) { throw new Error('Recording exceeds original Int32 timestamp range.'); }
  return (first ? '' : ',') + '{"at":' + at.toString() + ',"pos":' + invariantDouble(value * 100 < 0 ? 0 : value * 100 > 100 ? 100 : value * 100) + '}';
}
/** Reference only: AbstractOutputTarget.GetValue then MathUtils.Lerp. */
export function originalRecordingValue(value: number, defaultValue: number, minimum: number, maximum: number): number {
  const finite: number = Number.isFinite(value) ? value : defaultValue;
  return minimum + (maximum - minimum) * Math.max(0, Math.min(1, finite));
}
