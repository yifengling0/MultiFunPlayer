import { MotionConfigurations, MotionProviderConfiguration } from '../core/MotionConfiguration';
import type { MotionProviderId } from '../core/MotionConfiguration';
import { ShortcutAction, cloneShortcutAction, shortcutActionCatalog, validateShortcutAction } from './ShortcutConfiguration';

/** Pure result only. The caller owns profile validation, persistence and runtime
 * application through changeMotionConfiguration / MotionRegistry. Scalar edits
 * request sync through the existing provider configure path; do not request it
 * again merely because resetSync is true here. Reset is a separate ordered
 * runtime effect (optional sync before phase reset), with no configuration edit.
 */
export class MotionShortcutResult {
  settings: MotionProviderConfiguration;
  configurationChanged: boolean = false;
  resetCustomCurve: boolean = false;
  resetSync: boolean = false;
  summary: string = '';
  constructor(settings: MotionProviderConfiguration) { this.settings = settings; }
}

/** Exact catalog identities only. Never resolve a misspelled or unsupported
 * provider/action to the currently selected provider. */
export function motionShortcutProviderId(id: string): MotionProviderId | null {
  if (!shortcutActionCatalog().some(spec => spec.id === id && spec.category === 'motion')) { return null; }
  const provider: string = id.split('::')[1];
  if (provider === 'Custom Curve' || provider === 'Looping Script' || provider === 'Pattern' || provider === 'Random') {
    return provider;
  }
  return null;
}

/** Original AbstractMotionProvider and concrete RegisterActions setters.
 * axisName has already resolved the selected-axis sentinel. Both unavailable
 * and mismatched explicit axes fail closed, rather than falling back.
 *
 * The accepted local DTO domain follows the original numeric editor bounds;
 * upstream action Invoke itself does not enforce every editor bound. This
 * strict persistence boundary is deliberate, not a claim about arbitrary
 * externally constructed C# actions. Numeric editor intervals are not rounding
 * or quantization rules. Minimum
 * and Maximum clamp independently, allowing reversed ranges. A derived
 * nonfinite speed is rejected, never silently clamped to a fabricated cap.
 * Int32 octaves remain intact; existing RandomMotion activation budget is the
 * runtime authority and must run before committing this configuration.
 *
 * Duration preserves points, as the headless provider setter does. The Windows
 * view's bound DraggablePointCanvas can separately remove out-of-viewport
 * points; that loaded-view mutation is not a provider/shortcut setter effect.
 */
export function applyMotionShortcutAction(settings: MotionProviderConfiguration, action: ShortcutAction,
  axisName: string, availableAxisNames: string[]): MotionShortcutResult | null {
  if (!validateShortcutAction(action) || availableAxisNames.indexOf(axisName) < 0) { return null; }
  const input: ShortcutAction = cloneShortcutAction(action);
  const provider: MotionProviderId | null = motionShortcutProviderId(input.id);
  if (provider === null || (input.targetAxis !== '' && input.targetAxis !== axisName)) { return null; }
  let current: MotionProviderConfiguration;
  try { current = MotionConfigurations.clone(settings); } catch (_error) { return null; }
  if (current.id !== provider) { return null; }
  const result = new MotionShortcutResult(MotionConfigurations.clone(current));
  const next: MotionProviderConfiguration = result.settings;
  const command: string = input.id.substring(('MotionProvider::' + provider + '::').length);
  switch (command) {
    case 'Speed::Offset': next.speed = Math.max(0.01, next.speed + input.value); break;
    case 'Speed::Set': next.speed = Math.max(0.01, input.value); break;
    case 'Minimum::Offset': next.minimum = clamp01(next.minimum + input.value); break;
    case 'Minimum::Set': next.minimum = clamp01(input.value); break;
    case 'Maximum::Offset': next.maximum = clamp01(next.maximum + input.value); break;
    case 'Maximum::Set': next.maximum = clamp01(input.value); break;
    case 'InterpolationType::Set': case 'Interpolation::Set':
      if (input.text === 'linear' || input.text === 'pchip' || input.text === 'makima' || input.text === 'step') {
        next.interpolationMode = input.text;
      } else { return null; }
      break;
    case 'Duration::Set': next.durationSeconds = input.value; break;
    case 'IsLooping::Set': next.isLooping = input.value === 1; break;
    case 'IsLooping::Toggle': next.isLooping = !next.isLooping; break;
    case 'Reset':
      result.resetCustomCurve = true; result.resetSync = input.value === 1;
      result.summary = result.resetSync ? '重置曲线播放并请求同步' : '重置曲线播放';
      return result;
    case 'Pattern::Set':
      if (input.text === 'triangle' || input.text === 'sine' || input.text === 'doubleBounce' ||
        input.text === 'sharpBounce' || input.text === 'saw' || input.text === 'square') {
        next.pattern = input.text;
      } else { return null; }
      break;
    case 'Octaves::Set': next.octaves = input.value; break;
    case 'Persistence::Set': next.persistence = input.value; break;
    case 'Lacunarity::Set': next.lacunarity = input.value; break;
    default: return null;
  }
  if (MotionConfigurations.validate(next).length > 0) { return null; }
  result.configurationChanged = JSON.stringify(current) !== JSON.stringify(next);
  result.resetSync = result.configurationChanged;
  result.summary = motionSummary(command, next);
  return result;
}

function clamp01(value: number): number { return Math.min(1, Math.max(0, value)); }
function motionSummary(command: string, settings: MotionProviderConfiguration): string {
  switch (command.split('::')[0]) {
    case 'Speed': return settings.speed + ' 倍';
    case 'Minimum': return '最小值 ' + settings.minimum;
    case 'Maximum': return '最大值 ' + settings.maximum;
    case 'InterpolationType': case 'Interpolation': return settings.interpolationMode ?? '';
    case 'Duration': return settings.durationSeconds + ' 秒';
    case 'IsLooping': return settings.isLooping ? '循环已启用' : '循环已禁用';
    case 'Pattern': return settings.pattern ?? '';
    case 'Octaves': return 'Octaves ' + settings.octaves;
    case 'Persistence': return 'Persistence ' + settings.persistence;
    case 'Lacunarity': return 'Lacunarity ' + settings.lacunarity;
    default: return '';
  }
}
