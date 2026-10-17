import { AxisConfiguration, SmartLimitPoint } from '../core/AxisConfiguration';
import type { InterpolationMode } from '../core/Interpolation';
import { MotionCurvePoint } from '../core/MotionConfiguration';
import { ShortcutAction, cloneShortcutAction, validateShortcutAction } from './ShortcutConfiguration';

/** Pure SmartLimitPoints mapping. The caller must first resolve and validate
 * the selected/explicit axis against its current profile. This never applies
 * configuration, resets sync, creates a frame or dispatches device output.
 * Strictly increasing x is the existing OHOS AxisConfiguration requirement;
 * upstream SetFrom does not itself impose that restriction.
 */
export function applyShortcutPointAction(action: ShortcutAction, axisConfig: AxisConfiguration): AxisConfiguration | null {
  if (!validateShortcutAction(action) || action.id !== 'Axis::SmartLimitPoints::Set') { return null; }
  try {
    if (AxisConfiguration.validate(axisConfig).some(error => error.severity === 'error')) { return null; }
    const input: ShortcutAction = cloneShortcutAction(action);
    const result: AxisConfiguration = AxisConfiguration.clone(axisConfig);
    result.smartLimitPoints = input.points.map(point => new SmartLimitPoint(point.x, point.y));
    return AxisConfiguration.validate(result).some(error => error.severity === 'error') ? null : result;
  } catch (_error) { return null; }
}

/** Parameters only. Preserve original list order and duplicate times; the
 * provider separately projects those points into its interpolation keyframes.
 * The caller must apply Duration, InterpolationType, then Points in that source
 * order through the existing provider methods. Generic configure can reorder
 * their collection/sync effects and must not replace this ordered operation.
 */
export class CustomCurvePointArguments {
  durationSeconds: number;
  interpolationMode: InterpolationMode;
  points: MotionCurvePoint[];
  constructor(durationSeconds: number, interpolationMode: InterpolationMode, points: MotionCurvePoint[]) {
    this.durationSeconds = durationSeconds; this.interpolationMode = interpolationMode;
    this.points = points.map(point => new MotionCurvePoint(point.x, point.y));
  }
}

export function customCurvePointArguments(action: ShortcutAction): CustomCurvePointArguments | null {
  if (!validateShortcutAction(action) || action.id !== 'MotionProvider::Custom Curve::Points::Set') { return null; }
  const input: ShortcutAction = cloneShortcutAction(action);
  if (input.text !== 'linear' && input.text !== 'pchip' && input.text !== 'makima' && input.text !== 'step') { return null; }
  return new CustomCurvePointArguments(input.value, input.text, input.points.map(point => new MotionCurvePoint(point.x, point.y)));
}
