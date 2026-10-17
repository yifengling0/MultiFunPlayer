/** Effective editor values, separate from provider configuration and runtime.
 * MahApps.Metro 2.4.9 CoerceLowerValue/CoerceUpperValue/CoerceValue are the
 * source of the arithmetic. See RANGE_OCTAVES_016_SOURCE_AUDIT.md.
 * No source transfer commits a model write. No provider, seed, clock or sync
 * object is held here. This is not a WPF dispatcher or XAML lifecycle emulator.
 */
export type MotionControlField = 'minimum' | 'maximum' | 'octaves';

export interface MotionControlRawValues {
  minimum: number;
  maximum: number;
  octaves?: number;
}

export class MotionControlValues {
  minimum: number = 0;
  maximum: number = 1;
  octaves: number = 1;
  sourceMinimum: number = 0;
  sourceMaximum: number = 1;
  sourceOctaves: number = 1;
}

export class MotionControlValueChange {
  field: MotionControlField;
  previous: number;
  value: number;
  constructor(field: MotionControlField, previous: number, value: number) {
    this.field = field; this.previous = previous; this.value = value;
  }
}

export class MotionControlCommit {
  field: MotionControlField;
  value: number;
  constructor(field: MotionControlField, value: number) { this.field = field; this.value = value; }
}

export class MotionControlResult {
  state: MotionControlValues;
  /** Effective DP changes, not WPF routed event or PropertyChanged counts. */
  valueChanges: MotionControlValueChange[] = [];
  /** Empty for transfers; explicit editor commits only. Caller owns setter. */
  commits: MotionControlCommit[] = [];
  constructor(state: MotionControlValues) { this.state = state; }
}

/** Declared portable starting point with fixed [0,1] limits and MinRange=.01.
 * This is a settled default, not a reconstruction of XAML attribute execution.
 */
export function createMotionControlValues(): MotionControlValues { return new MotionControlValues(); }

function copyValues(value: MotionControlValues): MotionControlValues {
  const copy: MotionControlValues = new MotionControlValues();
  copy.minimum = value.minimum; copy.maximum = value.maximum; copy.octaves = value.octaves;
  copy.sourceMinimum = value.sourceMinimum; copy.sourceMaximum = value.sourceMaximum;
  copy.sourceOctaves = value.sourceOctaves;
  return copy;
}

function lowerValue(state: MotionControlValues, value: number): number {
  if (value < 0 || state.maximum - 0.01 < 0) { return 0; }
  if (value > state.maximum - 0.01) { return state.maximum - 0.01; }
  return value;
}

function upperValue(state: MotionControlValues, value: number): number {
  if (value > 1 || state.minimum + 0.01 > 1) { return 1; }
  if (value < state.minimum + 0.01) { return state.minimum + 0.01; }
  return value;
}

function octaveValue(value: number): number {
  if (value < 1) { return 1; }
  if (value > 8) { return 8; }
  return value;
}

function validField(field: MotionControlField): boolean {
  return field === 'minimum' || field === 'maximum' || field === 'octaves';
}

function validateRaw(raw: MotionControlRawValues): void {
  if (!Number.isFinite(raw.minimum) || !Number.isFinite(raw.maximum) ||
    (raw.octaves !== undefined && (!Number.isInteger(raw.octaves) ||
      raw.octaves < -2147483648 || raw.octaves > 2147483647))) {
    throw new Error('Motion control values require finite endpoints and Int32 octaves.');
  }
}

/** One DP effective-value invalidation. Re-entry follows the pinned callback:
 * RangesChanged -> CoerceValue(Lower) -> CoerceValue(Upper), including retained
 * source bases for an endpoint that is still visually coerced.
 */
function coerceField(result: MotionControlResult, field: MotionControlField): void {
  const state: MotionControlValues = result.state;
  const previous: number = field === 'minimum' ? state.minimum : field === 'maximum' ? state.maximum : state.octaves;
  const value: number = field === 'minimum' ? lowerValue(state, state.sourceMinimum) :
    field === 'maximum' ? upperValue(state, state.sourceMaximum) : octaveValue(state.sourceOctaves);
  if (previous === value) { return; }
  if (field === 'minimum') { state.minimum = value; }
  else if (field === 'maximum') { state.maximum = value; }
  else { state.octaves = value; }
  result.valueChanges.push(new MotionControlValueChange(field, previous, value));
  if (field !== 'octaves') {
    coerceField(result, 'minimum');
    coerceField(result, 'maximum');
  }
}

/** Pass fields in the observed source-notification order. When omitted, only
 * changed bases transfer, in the declared portable minimum/maximum/octaves
 * order. No-op refreshes preserve coercion history. A caller must retain state
 * for the same editor identity and must not re-create it on each render.
 */
export function transferMotionControlValues(current: MotionControlValues, raw: MotionControlRawValues,
  changedFields?: MotionControlField[]): MotionControlResult {
  validateRaw(raw);
  const fields: MotionControlField[] = [];
  if (changedFields !== undefined) {
    for (const field of changedFields) {
      if (!validField(field) || (field === 'octaves' && raw.octaves === undefined)) {
        throw new Error('Unknown or missing motion control transfer field.');
      }
      fields.push(field);
    }
  } else {
    if (raw.minimum !== current.sourceMinimum) { fields.push('minimum'); }
    if (raw.maximum !== current.sourceMaximum) { fields.push('maximum'); }
    if (raw.octaves !== undefined && raw.octaves !== current.sourceOctaves) { fields.push('octaves'); }
  }
  const result: MotionControlResult = new MotionControlResult(copyValues(current));
  for (const field of fields) {
    if (field === 'minimum') { result.state.sourceMinimum = raw.minimum; }
    else if (field === 'maximum') { result.state.sourceMaximum = raw.maximum; }
    else if (raw.octaves !== undefined) { result.state.sourceOctaves = raw.octaves; }
    coerceField(result, field);
  }
  return result;
}

/** Explicit, finite, single-endpoint editor commit. The input is constrained
 * before asking the caller to invoke its real setter. This is a portable edit
 * contract, not full MahApps mouse geometry, two-thumb movement or rounding.
 * Same-effective-value edits still commit: WPF SetValue/SetCurrentValue reaches
 * a TwoWay binding before the DP effective-value equality check. Focus/blur,
 * redraw, transfer, disabled buttons and cancelled edits MUST NOT call this.
 */
export function userEditMotionControlValue(current: MotionControlValues, field: MotionControlField,
  proposed: number): MotionControlResult {
  if (!validField(field) || !Number.isFinite(proposed) ||
    (field === 'octaves' && !Number.isInteger(proposed))) {
    throw new Error('Invalid explicit motion control edit.');
  }
  const value: number = field === 'minimum' ? lowerValue(current, proposed) :
    field === 'maximum' ? upperValue(current, proposed) : octaveValue(proposed);
  const raw: MotionControlRawValues = {
    minimum: field === 'minimum' ? value : current.sourceMinimum,
    maximum: field === 'maximum' ? value : current.sourceMaximum,
    octaves: field === 'octaves' ? value : current.sourceOctaves
  };
  const result: MotionControlResult = transferMotionControlValues(current, raw, [field]);
  result.commits.push(new MotionControlCommit(field, value));
  return result;
}
