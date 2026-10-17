import { AxisConfiguration, SyncConfiguration } from '../core/AxisConfiguration';
import { ShortcutAction, cloneShortcutAction, validateShortcutAction } from './ShortcutConfiguration';

/** Exact scalar action reducers from ScriptViewModel.RegisterActions (0.13).
 * They only clone configuration. The caller owns active-profile validation,
 * atomic persistence, runtime reconfiguration and the explicit source effects.
 * A valid action can produce a source value outside a later configuration guard
 * (e.g. finite + finite overflow). Never silently clamp to an invented bound.
 */
export class AxisShortcutResult {
  settings: AxisConfiguration;
  resetSync: boolean = false;
  reloadScript: boolean = false;
  summary: string = '';
  constructor(settings: AxisConfiguration) { this.settings = settings; }
}

/** axisName is the already resolved selected/explicit target. An unavailable or
 * mismatched explicit target is refused; there is no selected-axis fallback.
 * Empty reference text means null/clear, never the selected axis. Link cycles
 * require whole-profile validation by the caller before atomic application.
 * LockAll is reducible per active axis but must be committed as one operation.
 */
export function applyAxisShortcutAction(settings: AxisConfiguration, action: ShortcutAction,
  axisName: string, availableAxisNames: string[]): AxisShortcutResult | null {
  if (!validateShortcutAction(action) || availableAxisNames.indexOf(axisName) < 0) { return null; }
  const input: ShortcutAction = cloneShortcutAction(action);
  if (input.targetAxis !== '' && input.targetAxis !== axisName) { return null; }
  const result = new AxisShortcutResult(AxisConfiguration.clone(settings));
  const next: AxisConfiguration = result.settings;
  const value: number = input.value;
  const enabled: boolean = value === 1;
  const offset: boolean = input.id.endsWith('::Offset');
  switch (input.id) {
    case 'Axis::Lock::Set': case 'Axis::LockAll::Set': next.lockScript = enabled; break;
    case 'Axis::Lock::Toggle': case 'Axis::LockAll::Toggle': next.lockScript = !next.lockScript; break;
    case 'Axis::Bypass::All::Set':
      next.bypassScript = enabled; next.bypassMotionProvider = enabled; next.bypassTransition = enabled; break;
    case 'Axis::Bypass::All::Toggle': {
      const bypass: boolean = !(next.bypassScript || next.bypassMotionProvider || next.bypassTransition);
      next.bypassScript = bypass; next.bypassMotionProvider = bypass; next.bypassTransition = bypass; break;
    }
    case 'Axis::Bypass::Script::Set': next.bypassScript = enabled; break;
    case 'Axis::Bypass::Script::Toggle': next.bypassScript = !next.bypassScript; break;
    case 'Axis::Bypass::MotionProvider::Set': next.bypassMotionProvider = enabled; break;
    case 'Axis::Bypass::MotionProvider::Toggle': next.bypassMotionProvider = !next.bypassMotionProvider; break;
    case 'Axis::Bypass::Transition::Set': next.bypassTransition = enabled; break;
    case 'Axis::Bypass::Transition::Toggle': next.bypassTransition = !next.bypassTransition; break;
    case 'Axis::InvertScript::Set': next.invertScript = enabled; break;
    case 'Axis::InvertScript::Toggle': next.invertScript = !next.invertScript; break;
    case 'Axis::LinkPriority::Set': next.linkAxisHasPriority = enabled; break;
    case 'Axis::LinkPriority::Toggle': next.linkAxisHasPriority = !next.linkAxisHasPriority; break;
    case 'Axis::SpeedLimitEnabled::Set': next.speedLimitEnabled = enabled; break;
    case 'Axis::SpeedLimitEnabled::Toggle': next.speedLimitEnabled = !next.speedLimitEnabled; break;
    case 'Axis::AutoHomeEnabled::Set': next.autoHomeEnabled = enabled; break;
    case 'Axis::AutoHomeEnabled::Toggle': next.autoHomeEnabled = !next.autoHomeEnabled; break;
    case 'Axis::AutoHomeInsideScript::Set': next.autoHomeInsideScript = enabled; break;
    case 'Axis::AutoHomeInsideScript::Toggle': next.autoHomeInsideScript = !next.autoHomeInsideScript; break;
    case 'Axis::MotionProviderFillGaps::Set': next.motionProviderFillGaps = enabled; break;
    case 'Axis::MotionProviderFillGaps::Toggle': next.motionProviderFillGaps = !next.motionProviderFillGaps; break;
    case 'Axis::UpdateMotionProviderWhenPaused::Set': next.updateMotionProviderWhenPaused = enabled; break;
    case 'Axis::UpdateMotionProviderWhenPaused::Toggle': next.updateMotionProviderWhenPaused = !next.updateMotionProviderWhenPaused; break;
    case 'Axis::UpdateMotionProviderWithoutScript::Set': next.updateMotionProviderWithoutScript = enabled; break;
    case 'Axis::UpdateMotionProviderWithoutScript::Toggle': next.updateMotionProviderWithoutScript = !next.updateMotionProviderWithoutScript; break;
    case 'Axis::InterpolationType::Set':
      if (input.text === 'linear' || input.text === 'pchip' || input.text === 'makima' || input.text === 'step') {
        next.interpolationType = input.text;
      } else { return null; }
      break;
    case 'Axis::SmartLimitMode::Set':
      if (input.text === 'value' || input.text === 'speed') { next.smartLimitMode = input.text; }
      else { return null; }
      break;
    case 'Axis::LinkAxis::Set': case 'Axis::SmartLimitInputAxis::Set': case 'Axis::UpdateMotionProviderWithAxis::Set': {
      const reference: string | null = input.text === '' ? null : input.text;
      if (reference === axisName || (reference !== null && availableAxisNames.indexOf(reference) < 0)) { return null; }
      if (input.id === 'Axis::LinkAxis::Set') { next.linkAxis = reference; result.reloadScript = true; }
      else if (input.id === 'Axis::SmartLimitInputAxis::Set') { next.smartLimitInputAxis = reference; result.resetSync = true; }
      else { next.updateMotionProviderWithAxis = reference; result.resetSync = true; }
      break;
    }
    case 'Axis::MotionProvider::Set': next.selectedMotionProvider = input.text === '' ? null : input.text; break;
    case 'Axis::SmartLimitTargetValue::Set': case 'Axis::SmartLimitTargetValue::Offset':
      next.smartLimitTargetValue = clamp01(offset ? next.smartLimitTargetValue + value : value); break;
    case 'Axis::AutoHomeTargetValue::Set': case 'Axis::AutoHomeTargetValue::Offset':
      next.autoHomeTargetValue = clamp01(offset ? next.autoHomeTargetValue + value : value); break;
    case 'Axis::MotionProviderBlend::Set': case 'Axis::MotionProviderBlend::Offset':
      next.motionProviderBlend = clamp01(offset ? next.motionProviderBlend + value : value); break;
    case 'Axis::AutoHomeDelay::Set': case 'Axis::AutoHomeDelay::Offset':
      next.autoHomeDelaySeconds = Math.max(0, offset ? next.autoHomeDelaySeconds + value : value); break;
    case 'Axis::AutoHomeDuration::Set': case 'Axis::AutoHomeDuration::Offset':
      next.autoHomeDurationSeconds = Math.max(0, offset ? next.autoHomeDurationSeconds + value : value); break;
    case 'Axis::MotionProviderMinimumGapDuration::Set': case 'Axis::MotionProviderMinimumGapDuration::Offset':
      next.motionProviderMinimumGapDurationSeconds = Math.max(0, offset ? next.motionProviderMinimumGapDurationSeconds + value : value); break;
    case 'Axis::ScriptOffset::Set': case 'Axis::ScriptOffset::Offset':
      next.offsetSeconds = offset ? next.offsetSeconds + value : value; break;
    case 'Axis::ScriptScale::Set': case 'Axis::ScriptScale::Offset':
      next.scriptScale = Math.min(4, Math.max(0.01, offset ? next.scriptScale + value : value)); break;
    case 'Axis::SpeedLimitSecondsPerUnit::Set': case 'Axis::SpeedLimitSecondsPerUnit::Offset':
      next.speedLimitUnitsPerSecond = normalizeSpeedUnits(invertSpeedUnits(offset ? invertSpeedUnits(next.speedLimitUnitsPerSecond) + value : value)); break;
    case 'Axis::SpeedLimitUnitsPerSecond::Set': case 'Axis::SpeedLimitUnitsPerSecond::Offset':
      next.speedLimitUnitsPerSecond = normalizeSpeedUnits(offset ? next.speedLimitUnitsPerSecond + value : value); break;
    default: return null;
  }
  result.summary = axisSummary(input.id, next);
  return result;
}

/** The six original Sync registrations. Script-start/end fields exist in the
 * configuration but have no matching shortcut registrations; do not invent any.
 */
export function applySyncShortcutAction(settings: SyncConfiguration, action: ShortcutAction): SyncConfiguration | null {
  if (!validateShortcutAction(action)) { return null; }
  const next: SyncConfiguration = SyncConfiguration.clone(settings);
  const enabled: boolean = action.value === 1;
  switch (action.id) {
    case 'Sync::Duration::Set': next.durationSeconds = Math.min(8, Math.max(0.5, action.value)); break;
    case 'Sync::SyncOnMediaResourceChanged::Set': next.syncOnMediaResourceChanged = enabled; break;
    case 'Sync::SyncOnScriptResourceChanged::Set': next.syncOnScriptResourceChanged = enabled; break;
    case 'Sync::SyncOnMediaPlayPause::Set': next.syncOnMediaPlayPause = enabled; break;
    case 'Sync::SyncOnSeek::Set': next.syncOnSeek = enabled; break;
    case 'Sync::SyncOnAutoHomeStartEnd::Set': next.syncOnAutoHomeStartEnd = enabled; break;
    default: return null;
  }
  return next;
}

function clamp01(value: number): number { return Math.min(1, Math.max(0, value)); }
function invertSpeedUnits(value: number): number {
  return value <= 0 ? Number.POSITIVE_INFINITY : value === Number.POSITIVE_INFINITY ? 0 : 1 / value;
}
/** Math.Round(value, 2) uses MidpointRounding.ToEven, not JS Math.round.
 * .NET leaves magnitudes >= 1e16 (including +Infinity) unchanged.
 */
function normalizeSpeedUnits(value: number): number {
  const positive: number = Math.max(0, value);
  if (positive >= 1e16) { return positive; }
  const scaled: number = positive * 100;
  const lower: number = Math.floor(scaled);
  const fraction: number = scaled - lower;
  const rounded: number = fraction < 0.5 ? lower : fraction > 0.5 ? lower + 1 : lower % 2 === 0 ? lower : lower + 1;
  return rounded / 100;
}

/** Explicit result feedback, not a generic property serializer. */
function axisSummary(id: string, settings: AxisConfiguration): string {
  const field: string = id.split('::')[1];
  switch (field) {
    case 'Lock': case 'LockAll': return settings.lockScript ? '已锁定' : '未锁定';
    case 'Bypass':
      return '脚本=' + settings.bypassScript + '，提供器=' + settings.bypassMotionProvider + '，过渡=' + settings.bypassTransition;
    case 'InvertScript': return settings.invertScript ? '已反转' : '未反转';
    case 'LinkPriority': return settings.linkAxisHasPriority ? '链接优先' : '自动加载优先';
    case 'SpeedLimitEnabled': return settings.speedLimitEnabled ? '限速已启用' : '限速已禁用';
    case 'AutoHomeEnabled': return settings.autoHomeEnabled ? '归位已启用' : '归位已禁用';
    case 'AutoHomeInsideScript': return settings.autoHomeInsideScript ? '脚本内归位已启用' : '脚本内归位已禁用';
    case 'MotionProviderFillGaps': return settings.motionProviderFillGaps ? '填补间隙已启用' : '填补间隙已禁用';
    case 'UpdateMotionProviderWhenPaused': return settings.updateMotionProviderWhenPaused ? '暂停更新已启用' : '暂停更新已禁用';
    case 'UpdateMotionProviderWithoutScript': return settings.updateMotionProviderWithoutScript ? '无脚本更新已启用' : '无脚本更新已禁用';
    case 'InterpolationType': return settings.interpolationType;
    case 'SmartLimitMode': return settings.smartLimitMode;
    case 'LinkAxis': return settings.linkAxis === null ? '无链接轴' : settings.linkAxis;
    case 'SmartLimitInputAxis': return settings.smartLimitInputAxis === null ? '无输入轴' : settings.smartLimitInputAxis;
    case 'UpdateMotionProviderWithAxis': return settings.updateMotionProviderWithAxis === null ? '无跟随轴' : settings.updateMotionProviderWithAxis;
    case 'MotionProvider': return settings.selectedMotionProvider === null ? '无运动提供器' : settings.selectedMotionProvider;
    case 'SmartLimitTargetValue': return settings.smartLimitTargetValue.toString();
    case 'AutoHomeTargetValue': return settings.autoHomeTargetValue.toString();
    case 'MotionProviderBlend': return settings.motionProviderBlend.toString();
    case 'AutoHomeDelay': return settings.autoHomeDelaySeconds + ' 秒';
    case 'AutoHomeDuration': return settings.autoHomeDurationSeconds + ' 秒';
    case 'MotionProviderMinimumGapDuration': return settings.motionProviderMinimumGapDurationSeconds + ' 秒';
    case 'ScriptOffset': return settings.offsetSeconds + ' 秒';
    case 'ScriptScale': return settings.scriptScale + ' 倍';
    case 'SpeedLimitSecondsPerUnit': case 'SpeedLimitUnitsPerSecond':
      return settings.speedLimitUnitsPerSecond === Number.POSITIVE_INFINITY ? 'Infinity 单位 / 秒（0 秒 / 单位）' : settings.speedLimitUnitsPerSecond + ' 单位 / 秒';
    default: return '';
  }
}
