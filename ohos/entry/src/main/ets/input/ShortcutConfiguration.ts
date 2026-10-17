/** Local keyboard configuration only. Source: Shortcut/Button*Shortcut.cs and
 * Input/RawInput/KeyboardGesture.cs. No runtime state or opaque action payloads
 * cross this persistence boundary. App::* actions are OHOS additions. */
export type ShortcutTrigger = 'press' | 'release' | 'click' | 'hold';
export type ShortcutHoldInvoke = 'release' | 'holding';
export type ShortcutValueKind = 'none' | 'number' | 'boolean' | 'text' | 'enum' | 'axis' | 'provider';
export type ShortcutPointsKind = 'none' | 'smartLimit' | 'customCurve';
export type ShortcutActionCategory = 'media' | 'axis' | 'sync' | 'internal' | 'motion' | 'shortcut' | 'output' | 'source' | 'app';
export const EMERGENCY_STOP_KEY: number = 2101; // HarmonyOS KEYCODE_F12.

/** Data only. Smart-limit coordinates are percent; custom-curve x is seconds
 * and y is normalized. They never encode runtime state or executable input. */
export class ShortcutPoint {
  x: number;
  y: number;
  constructor(x: number, y: number) { this.x = x; this.y = y; }
}

export class ShortcutAction {
  id: string;
  value: number;
  /** Empty target means the selected axis at dispatch time; it never means all. */
  targetAxis: string;
  secondaryValue: number;
  text: string;
  points: ShortcutPoint[];
  outputTargetId: string;
  tertiaryValue: number;
  constructor(id: string, value: number = 0, targetAxis: string = '', secondaryValue: number = 0,
    text: string = '', points: ShortcutPoint[] = [], outputTargetId: string = '', tertiaryValue: number = 0) {
    this.id = id; this.value = value; this.targetAxis = targetAxis;
    this.secondaryValue = secondaryValue; this.text = text;
    this.outputTargetId = outputTargetId; this.tertiaryValue = tertiaryValue;
    this.points = points.map(point => new ShortcutPoint(point.x, point.y));
  }
}

export class ShortcutTextOption {
  value: string;
  label: string;
  constructor(value: string, label: string = value) { this.value = value; this.label = label; }
}

export class ShortcutActionSpec {
  id: string;
  label: string;
  valueKind: ShortcutValueKind;
  minimum: number;
  maximum: number;
  step: number;
  defaultValue: number;
  unit: string;
  originalName: string;
  category: ShortcutActionCategory;
  targetAxis: boolean;
  targetOutput: boolean = false;
  managedScript: boolean = false;
  tertiaryValueKind: 'none' | 'number' = 'none';
  tertiaryMinimum: number = 0;
  tertiaryMaximum: number = 0;
  tertiaryStep: number = 0.01;
  tertiaryDefaultValue: number = 0;
  tertiaryLabel: string = '';
  tertiaryUnit: string = '';
  pointsKind: ShortcutPointsKind = 'none';
  valueLabel: string = 'Value';
  integer: boolean = false;
  textOptions: ShortcutTextOption[] = [];
  defaultText: string = '';
  maximumTextLength: number = 256;
  /** A separate named string argument, independent of the scalar value kind.
   * Shortcut::Enabled uses text for the exact target name and value for bool. */
  textArgumentLabel: string = '';
  secondaryValueKind: 'none' | 'number' = 'none';
  secondaryMinimum: number = 0;
  secondaryMaximum: number = 0;
  secondaryStep: number = 1;
  secondaryDefaultValue: number = 0;
  secondaryLabel: string = '';
  secondaryUnit: string = '';
  constructor(id: string, label: string, valueKind: ShortcutValueKind = 'none', minimum: number = 0,
    maximum: number = 0, step: number = 1, defaultValue: number = 0, unit: string = '', originalName: string = id) {
    this.id = id; this.label = label; this.valueKind = valueKind; this.minimum = minimum;
    this.maximum = maximum; this.step = step; this.defaultValue = defaultValue; this.unit = unit;
    this.originalName = originalName;
    this.category = id.startsWith('Axis::') ? 'axis' : id.startsWith('Sync::') ? 'sync' :
      id.startsWith('Internal::') ? 'internal' : id.startsWith('MotionProvider::') ? 'motion' :
        id.startsWith('OutputTarget::') ? 'output' : id.startsWith('Shortcut::') ? 'shortcut' : id.startsWith('App::') ? 'app' : 'media';
    this.targetAxis = id.startsWith('MotionProvider::') ||
      (id.startsWith('Axis::') && !id.startsWith('Axis::SyncAll') && !id.startsWith('Axis::LockAll'));
  }
}

/** Only commands reachable from Index. Explicit media-source Connect never Arms output. No arbitrary filesystem
 * access, opaque action name or executable text. Range commands are target-bound. */
export function shortcutActionCatalog(): ShortcutActionSpec[] {
  const result: ShortcutActionSpec[] = [
    new ShortcutActionSpec('Media::PlayPause::Toggle', '播放 / 暂停'),
    new ShortcutActionSpec('Media::PlayPause::Set', '设置播放状态', 'boolean', 0, 1, 1, 1),
    new ShortcutActionSpec('App::Stop', '全局停止 / 解除输出启用', 'none', 0, 0, 1, 0, '', ''),
    new ShortcutActionSpec('Media::Position::Time::Offset', '相对跳转', 'number', -Number.MAX_VALUE, Number.MAX_VALUE, 1, 5, '秒'),
    new ShortcutActionSpec('Media::ScriptOffset::Offset', '全局脚本偏移增量', 'number', -Number.MAX_VALUE, Number.MAX_VALUE, 0.05, 0.05, '秒'),
    new ShortcutActionSpec('Axis::ScriptOffset::Offset', '所选轴脚本偏移增量', 'number', -Number.MAX_VALUE, Number.MAX_VALUE, 0.05, 0.05, '秒'),
    new ShortcutActionSpec('Media::Chapter::SeekToPrev', '首个章节集：上一章节'),
    new ShortcutActionSpec('Media::Chapter::SeekToNext', '首个章节集：下一章节'),
    new ShortcutActionSpec('Media::Bookmark::SeekToPrev', '首个书签集：上一书签'),
    new ShortcutActionSpec('Media::Bookmark::SeekToNext', '首个书签集：下一书签'),
    new ShortcutActionSpec('Media::Speed::Set', '设置播放速度', 'number', 0.25, 4, 0.25, 1, '倍'),
    new ShortcutActionSpec('Media::Speed::Offset', '播放速度增量', 'number', -4, 4, 0.25, 0.25, '倍'),
    new ShortcutActionSpec('Axis::SyncAll', '重置全部轴同步'),
    new ShortcutActionSpec('Axis::Sync', '重置所选轴同步'),
    new ShortcutActionSpec('Internal::Playlist::Prev', 'Internal 上一项'),
    new ShortcutActionSpec('Internal::Playlist::Next', 'Internal 下一项'),
    new ShortcutActionSpec('App::Internal::Random', 'Internal 随机选择', 'none', 0, 0, 1, 0, '', ''),
    new ShortcutActionSpec('Media::Loop::Start::Set::FromMediaPosition', '设置 A 点'),
    new ShortcutActionSpec('Media::Loop::End::Set::FromMediaPosition', '设置 B 点'),
    new ShortcutActionSpec('Media::Loop::Clear', '清除 A/B 区间'),
    new ShortcutActionSpec('App::Fullscreen::Toggle', '切换全屏', 'none', 0, 0, 1, 0, '', ''),
    new ShortcutActionSpec('App::Library::Show', '显示资源列表', 'none', 0, 0, 1, 0, '', '')
  ];
  appendMediaActions(result);
  appendAxisActions(result);
  appendSyncActions(result);
  appendInternalActions(result);
  appendMotionActions(result);
  appendShortcutActions(result);
  appendManagedOutputActions(result);
  appendOutputConnectionActions(result);
  const endpoint = textSpec('DeoVR::Endpoint::Set', '设置 DeoVR 端点（不连接）', 'text', 'Endpoint · ipOrHost:port');
  endpoint.maximumTextLength = 280; endpoint.category = 'source'; result.push(endpoint);
  for (const source of ['Internal', 'DeoVR']) {
    for (const command of ['Toggle', 'Connect', 'Disconnect']) {
      const spec = new ShortcutActionSpec(source + '::Connection::' + command,
        source + ' 媒体源' + (command === 'Toggle' ? '连接切换' : command === 'Connect' ? '连接' : '断开'));
      spec.category = 'source'; result.push(spec);
    }
  }
  const path = textSpec('Media::Path::Set', '设置远端媒体路径（DeoVR / HereSphere）', 'text', 'Media path');
  path.maximumTextLength = 4096; path.category = 'source'; result.push(path);
  const hereSphereEndpoint = textSpec('HereSphere::Endpoint::Set', '设置 HereSphere 端点（不连接）', 'text', 'Endpoint · ipOrHost:port');
  hereSphereEndpoint.maximumTextLength = 280; hereSphereEndpoint.category = 'source'; result.push(hereSphereEndpoint);
  for (const command of ['Toggle', 'Connect', 'Disconnect']) {
    const spec = new ShortcutActionSpec('HereSphere::Connection::' + command,
      'HereSphere 媒体源' + (command === 'Toggle' ? '连接切换' : command === 'Connect' ? '连接' : '断开'));
    spec.category = 'source'; result.push(spec);
  }
  return result;
}

/** The original numeric editor defaults to Double.Min/MaxValue, interval 1,
 * and coerces default(T) to its minimum. This finite sentinel is the JS bound.
 * The v0.12 seek/offset caps are widened to the actual finite source bounds;
 * existing saved arguments stay valid. Their 5s/.05s convenience defaults stay
 * unchanged. Media speed retains the native OHOS capability range (0.25–4),
 * rather than advertising the original source's 0.01+ range without support.
 */
const UNBOUNDED: number = Number.MAX_VALUE;
function numeric(id: string, label: string, minimum: number = -UNBOUNDED,
  maximum: number = UNBOUNDED, step: number = 1, unit: string = '', valueLabel: string = 'Value',
  defaultValue: number = Math.max(0, minimum)): ShortcutActionSpec {
  const spec = new ShortcutActionSpec(id, label, 'number', minimum, maximum, step, defaultValue, unit);
  spec.valueLabel = valueLabel; return spec;
}
function switches(result: ShortcutActionSpec[], prefix: string, label: string, originalLabel: string): void {
  const set = new ShortcutActionSpec(prefix + '::Set', '设置' + label, 'boolean', 0, 1);
  set.valueLabel = originalLabel; result.push(set);
  result.push(new ShortcutActionSpec(prefix + '::Toggle', '切换' + label));
}
function textSpec(id: string, label: string, kind: ShortcutValueKind, valueLabel: string,
  options: ShortcutTextOption[] = [], defaultText: string = ''): ShortcutActionSpec {
  const spec = new ShortcutActionSpec(id, label, kind);
  spec.valueLabel = valueLabel; spec.textOptions = options; spec.defaultText = defaultText; return spec;
}
function appendMediaActions(result: ShortcutActionSpec[]): void {
  result.push(numeric('Media::Position::Time::Set', '跳转到时间', 0, UNBOUNDED, 1, '秒'));
  result.push(numeric('Media::Position::Percent::Set', '跳转到进度', 0, 1, 0.01, '比例'));
  result.push(numeric('Media::Position::Percent::Offset', '相对进度跳转', -1, 1, 0.01, '比例', 'Value offset'));
  result.push(numeric('Media::Position::SkipToScriptStart', '跳转到脚本开始', -UNBOUNDED, UNBOUNDED, 1, '秒', 'Offset'));
  // The original name is Script::SkipGap. Its implementation scans all script
  // axes even when the source UI supplied one target; do not invent a scoped seek.
  const gap = numeric('Script::SkipGap', '跳过间隙（原算法检查全部轴）', 0, UNBOUNDED, 1, '秒', 'Minimum skip', 2);
  gap.targetAxis = true; result.push(gap);
  result.push(numeric('Media::ScriptOffset::Set', '设置全局脚本偏移', -UNBOUNDED, UNBOUNDED, 1, '秒'));
  const loop = numeric('Media::Loop::Set', '设置 A/B 区间', 0, UNBOUNDED, 1, '秒', 'Start position');
  loop.secondaryValueKind = 'number'; loop.secondaryMaximum = UNBOUNDED;
  loop.secondaryLabel = 'End position'; loop.secondaryUnit = '秒'; result.push(loop);
  const around = numeric('Media::Loop::Set::FromMediaPositionOffset', '相对当前位置设置 A/B', -UNBOUNDED, UNBOUNDED, 1, '秒', 'Start offset');
  around.secondaryValueKind = 'number'; around.secondaryMinimum = -UNBOUNDED; around.secondaryMaximum = UNBOUNDED;
  around.secondaryLabel = 'End offset'; around.secondaryUnit = '秒'; result.push(around);
  result.push(numeric('Media::Loop::Start::Set', '设置 A 点时间', 0, UNBOUNDED, 1, '秒', 'Position'));
  result.push(numeric('Media::Loop::End::Set', '设置 B 点时间', 0, UNBOUNDED, 1, '秒', 'Position'));
  result.push(new ShortcutActionSpec('Media::Loop::CycleSetStartEnd', '依次设置 A / B / 清除'));
  result.push(new ShortcutActionSpec('Media::Loop::Set::FromCurrentChapter', '当前章节设为 A/B 区间'));
  switches(result, 'Media::AutoSkipToScriptStartEnabled', '自动跳转到脚本开始', 'Auto-skip to script start enabled');
  result.push(numeric('Media::AutoSkipToScriptStartOffset::Set', '设置自动跳转偏移', -UNBOUNDED, UNBOUNDED, 1, '秒'));
  for (const kind of ['Bookmark', 'Chapter']) {
    const label: string = kind === 'Bookmark' ? '书签' : '章节';
    result.push(textSpec('Media::' + kind + '::SeekToByName', '首个' + label + '集：按名称跳转', 'text', kind + ' name'));
    const index = numeric('Media::' + kind + '::SeekToByIndex', '首个' + label + '集：按索引跳转', 0, 2147483647, 1, '', kind + ' index');
    index.integer = true; result.push(index);
  }
}
function appendAxisActions(result: ShortcutActionSpec[]): void {
  for (const operation of ['Set', 'Offset']) {
    const manual = numeric('Axis::Value::' + operation, operation === 'Set' ? '手动设置轴值' : '手动轴值增量',
      operation === 'Set' ? 0 : -1, 1, 0.01, '比例', operation === 'Set' ? 'Value' : 'Value offset');
    manual.secondaryValueKind = 'number'; manual.secondaryMaximum = UNBOUNDED;
    manual.secondaryLabel = 'Duration'; manual.secondaryUnit = '秒'; result.push(manual);
  }
  const smartPoints = new ShortcutActionSpec('Axis::SmartLimitPoints::Set', '设置智能限幅点');
  smartPoints.pointsKind = 'smartLimit'; result.push(smartPoints);
  result.push(new ShortcutActionSpec('Axis::Sync::Cancel', '取消所选轴同步'));
  result.push(new ShortcutActionSpec('Axis::SyncAll::Cancel', '取消全部轴同步'));
  result.push(new ShortcutActionSpec('Axis::ClearScript', '清除目标轴脚本'));
  result.push(new ShortcutActionSpec('Axis::ReloadScript', '重新加载目标轴脚本'));
  switches(result, 'Axis::Lock', '目标轴锁定', 'Lock axis');
  switches(result, 'Axis::LockAll', '全部轴锁定', 'Lock axes');
  switches(result, 'Axis::Bypass::All', '目标轴全部旁路', 'Bypass all');
  switches(result, 'Axis::Bypass::Script', '脚本旁路', 'Bypass script');
  switches(result, 'Axis::Bypass::MotionProvider', '运动提供器旁路', 'Bypass motion provider');
  switches(result, 'Axis::Bypass::Transition', '手动过渡旁路', 'Bypass custom transition');
  switches(result, 'Axis::InvertScript', '反转脚本', 'Invert script');
  switches(result, 'Axis::LinkPriority', '链接优先', 'Link has priority');
  switches(result, 'Axis::SpeedLimitEnabled', '轴限速', 'Speed limit enabled');
  switches(result, 'Axis::AutoHomeEnabled', '自动归位', 'Auto home enabled');
  switches(result, 'Axis::AutoHomeInsideScript', '脚本内自动归位', 'Auto home inside script');
  switches(result, 'Axis::MotionProviderFillGaps', '运动提供器填补间隙', 'Fill gaps');
  switches(result, 'Axis::UpdateMotionProviderWhenPaused', '暂停时更新运动提供器', 'Update motion providers when paused');
  switches(result, 'Axis::UpdateMotionProviderWithoutScript', '无脚本时更新运动提供器', 'Update motion providers without script');
  const linear = [new ShortcutTextOption('linear', 'Linear'), new ShortcutTextOption('pchip', 'Pchip'),
    new ShortcutTextOption('makima', 'Makima'), new ShortcutTextOption('step', 'Step')];
  result.push(textSpec('Axis::InterpolationType::Set', '设置脚本插值', 'enum', 'Interpolation', linear, 'linear'));
  result.push(textSpec('Axis::SmartLimitMode::Set', '设置智能限幅模式', 'enum', 'Smart limit mode',
    [new ShortcutTextOption('value', 'Value'), new ShortcutTextOption('speed', 'Speed')], 'value'));
  result.push(textSpec('Axis::LinkAxis::Set', '设置脚本链接轴', 'axis', 'Target axis'));
  result.push(textSpec('Axis::SmartLimitInputAxis::Set', '设置智能限幅输入轴', 'axis', 'Input axis'));
  result.push(textSpec('Axis::UpdateMotionProviderWithAxis::Set', '设置运动提供器跟随轴', 'axis', 'Input axis'));
  result.push(textSpec('Axis::MotionProvider::Set', '设置运动提供器', 'provider', 'Motion provider', [
    new ShortcutTextOption('', '无'), new ShortcutTextOption('Pattern'), new ShortcutTextOption('Random'),
    new ShortcutTextOption('Custom Curve'), new ShortcutTextOption('Looping Script')]));
  for (const setting of ['SmartLimitTargetValue', 'AutoHomeTargetValue', 'MotionProviderBlend']) {
    const label: string = setting === 'SmartLimitTargetValue' ? '智能限幅目标值' : setting === 'AutoHomeTargetValue' ? '归位目标值' : '运动提供器混合';
    result.push(numeric('Axis::' + setting + '::Set', '设置' + label, 0, 1, 0.01, '比例'));
    result.push(numeric('Axis::' + setting + '::Offset', label + '增量', -1, 1, 0.01, '比例', 'Value offset'));
  }
  for (const setting of ['AutoHomeDelay', 'AutoHomeDuration', 'MotionProviderMinimumGapDuration']) {
    const label: string = setting === 'AutoHomeDelay' ? '归位延迟' : setting === 'AutoHomeDuration' ? '归位时长' : '填补最小间隙';
    result.push(numeric('Axis::' + setting + '::Set', '设置' + label, 0, UNBOUNDED, 1, '秒'));
    result.push(numeric('Axis::' + setting + '::Offset', label + '增量', -UNBOUNDED, UNBOUNDED, 1, '秒', 'Value offset'));
  }
  result.push(numeric('Axis::ScriptOffset::Set', '设置目标轴脚本偏移', -UNBOUNDED, UNBOUNDED, 1, '秒'));
  result.push(numeric('Axis::ScriptScale::Set', '设置脚本缩放', 0.01, 4, 0.01, '倍'));
  result.push(numeric('Axis::ScriptScale::Offset', '脚本缩放增量', -4, 4, 0.01, '倍', 'Value offset'));
  for (const setting of ['SpeedLimitSecondsPerUnit', 'SpeedLimitUnitsPerSecond']) {
    const unit: string = setting === 'SpeedLimitSecondsPerUnit' ? '秒 / 单位' : '单位 / 秒';
    result.push(numeric('Axis::' + setting + '::Set', '设置轴限速（' + unit + '）', 0, UNBOUNDED, 1, unit));
    result.push(numeric('Axis::' + setting + '::Offset', '轴限速增量（' + unit + '）', -UNBOUNDED, UNBOUNDED, 1, unit, 'Value offset'));
  }
}
function appendSyncActions(result: ShortcutActionSpec[]): void {
  result.push(numeric('Sync::Duration::Set', '设置同步时长', 0.5, 8, 0.5, '秒', 'Value', 4));
  const ids: string[] = ['SyncOnMediaResourceChanged', 'SyncOnScriptResourceChanged', 'SyncOnMediaPlayPause', 'SyncOnSeek', 'SyncOnAutoHomeStartEnd'];
  const labels: string[] = ['媒体资源变化时同步', '脚本资源变化时同步', '播放 / 暂停时同步', '跳转时同步', '归位开始 / 结束时同步'];
  const originals: string[] = ['Sync on media resource changed enabled', 'Sync on script resource changed enabled',
    'Sync on media play/pause enabled', 'Sync on media seek enabled', 'Sync on auto-home start/end enabled'];
  for (let index: number = 0; index < ids.length; index++) {
    const spec = new ShortcutActionSpec('Sync::' + ids[index] + '::Set', '设置' + labels[index], 'boolean', 0, 1);
    spec.valueLabel = originals[index]; result.push(spec);
  }
}
function appendInternalActions(result: ShortcutActionSpec[]): void {
  result.push(new ShortcutActionSpec('Internal::Playlist::Clear', '清空 Internal 播放列表'));
  const index = numeric('Internal::Playlist::PlayByIndex', '播放 Internal 指定索引', 0, 2147483647, 1, '', 'Index');
  index.integer = true; result.push(index);
  const byName = textSpec('Internal::Playlist::PlayByName', '按名称播放 Internal 项目', 'text', 'Name');
  byName.maximumTextLength = 4096; result.push(byName);
  switches(result, 'Internal::Shuffle', 'Internal 随机顺序', 'Enable shuffle');
  switches(result, 'Internal::Looping', 'Internal 循环', 'Enable looping');
  switches(result, 'Internal::LoadAdditionalScripts', 'Internal 附加脚本', 'Enable load additional scripts');
  // This is a media-source preference only. It never connects or arms outputs.
  switches(result, 'Internal::AutoConnectEnabled', 'Internal 自动连接偏好', 'Enable auto connect');
}

/** 16 scalar registration templates expand to 34 concrete actions: six
 * AbstractMotionProvider scalar registrations for each of the four actual
 * providers, plus ten provider-specific registrations. The additional original
 * Points::Set has a bounded data payload. Drive and Script::Set remain separate
 * analog/file workflows. */
function appendMotionActions(result: ShortcutActionSpec[]): void {
  for (const provider of ['Custom Curve', 'Looping Script', 'Pattern', 'Random']) {
    const prefix: string = 'MotionProvider::' + provider + '::';
    result.push(numeric(prefix + 'Speed::Offset', provider + ' 速度增量', -UNBOUNDED, UNBOUNDED, 0.01, '倍', 'Value offset'));
    result.push(numeric(prefix + 'Speed::Set', '设置 ' + provider + ' 速度', 0.01, UNBOUNDED, 0.01, '倍'));
    for (const property of ['Minimum', 'Maximum']) {
      const label: string = property === 'Minimum' ? '最小值' : '最大值';
      result.push(numeric(prefix + property + '::Offset', provider + ' ' + label + '增量', -1, 1, 0.01, '比例', 'Value offset'));
      result.push(numeric(prefix + property + '::Set', '设置 ' + provider + ' ' + label, 0, 1, 0.01, '比例'));
    }
  }
  const interpolations: ShortcutTextOption[] = [new ShortcutTextOption('linear', 'Linear'), new ShortcutTextOption('pchip', 'Pchip'),
    new ShortcutTextOption('makima', 'Makima'), new ShortcutTextOption('step', 'Step')];
  const curvePoints = numeric('MotionProvider::Custom Curve::Points::Set', '设置 Custom Curve 点', 1, 60, 1, '秒', 'Duration', 1);
  curvePoints.pointsKind = 'customCurve'; curvePoints.textArgumentLabel = 'Interpolation type';
  curvePoints.textOptions = interpolations.map(item => new ShortcutTextOption(item.value, item.label));
  curvePoints.defaultText = 'linear'; result.push(curvePoints);
  result.push(textSpec('MotionProvider::Custom Curve::InterpolationType::Set', '设置 Custom Curve 插值', 'enum',
    'Interpolation type', interpolations.map(item => new ShortcutTextOption(item.value, item.label)), 'linear'));
  result.push(numeric('MotionProvider::Custom Curve::Duration::Set', '设置 Custom Curve 时长', 1, 60, 1, '秒', 'Duration'));
  switches(result, 'MotionProvider::Custom Curve::IsLooping', ' Custom Curve 循环', 'Enable looping');
  const reset = new ShortcutActionSpec('MotionProvider::Custom Curve::Reset', '重置 Custom Curve 播放', 'boolean', 0, 1, 1, 1);
  reset.valueLabel = 'Request sync'; result.push(reset);
  result.push(textSpec('MotionProvider::Looping Script::Interpolation::Set', '设置 Looping Script 插值', 'enum',
    'Interpolation type', interpolations, 'linear'));
  result.push(textSpec('MotionProvider::Pattern::Pattern::Set', '设置 Pattern 波形', 'enum', 'Pattern', [
    new ShortcutTextOption('triangle', 'Triangle'), new ShortcutTextOption('sine', 'Sine'),
    new ShortcutTextOption('doubleBounce', 'DoubleBounce'), new ShortcutTextOption('sharpBounce', 'SharpBounce'),
    new ShortcutTextOption('saw', 'Saw'), new ShortcutTextOption('square', 'Square')], 'triangle'));
  const octaves = numeric('MotionProvider::Random::Octaves::Set', '设置 Random 叠加层数', 1, 2147483647, 1, '', 'Octaves');
  octaves.integer = true; result.push(octaves);
  result.push(numeric('MotionProvider::Random::Persistence::Set', '设置 Random 持续度', 0.01, UNBOUNDED, 0.01, '', 'Persistence'));
  result.push(numeric('MotionProvider::Random::Lacunarity::Set', '设置 Random 频率倍率', 0.1, 2, 0.01, '', 'Lacunarity'));
}

function appendShortcutActions(result: ShortcutActionSpec[]): void {
  const set = new ShortcutActionSpec('Shortcut::Enabled::Set', '设置指定快捷键启用状态', 'boolean', 0, 1);
  set.valueLabel = 'Enabled'; set.textArgumentLabel = 'Target shortcut name'; result.push(set);
  const toggle = new ShortcutActionSpec('Shortcut::Enabled::Toggle', '切换指定快捷键启用状态');
  toggle.textArgumentLabel = 'Target shortcut name'; result.push(toggle);
}

function appendManagedOutputActions(result: ShortcutActionSpec[]): void {
  const looping = new ShortcutActionSpec('MotionProvider::Looping Script::Script::Set',
    '从 Download 目录设置 / 重读 Looping Script', 'text');
  looping.valueLabel = 'Script · 受管脚本'; looping.managedScript = true; looping.maximumTextLength = 4096; result.push(looping);
  for (const field of ['Minimum', 'Maximum', 'Middle', 'Size']) {
    for (const operation of ['Set', 'Offset']) {
      const spec = new ShortcutActionSpec('OutputTarget::Axis::Range::' + field + '::' + operation,
        '输出范围 ' + field + ' ' + operation, 'number', operation === 'Set' ? 0 : -1, 1, 0.01,
        0, '', '{Identifier}::Axis::Range::' + field + '::' + operation);
      spec.targetAxis = true; spec.targetOutput = true;
      if (operation === 'Offset') {
        spec.secondaryValueKind = 'number'; spec.secondaryMinimum = 0; spec.secondaryMaximum = 1;
        spec.secondaryStep = 0.01; spec.secondaryDefaultValue = field === 'Maximum' ? 1 : 0;
        spec.secondaryLabel = field === 'Maximum' ? 'Maximum limit' : 'Minimum limit';
        if (field === 'Middle' || field === 'Size') {
          spec.tertiaryValueKind = 'number'; spec.tertiaryMinimum = 0; spec.tertiaryMaximum = 1;
          spec.tertiaryDefaultValue = 1; spec.tertiaryLabel = 'Maximum limit';
        }
      }
      result.push(spec);
    }
  }
}

/** Six original registration sites, represented by target-bound aliases rather
 * than fabricated literal instance names. A saved target ID is not runtime
 * authority: the dispatcher must capture and check that owner's generation. */
function appendOutputConnectionActions(result: ShortcutActionSpec[]): void {
  for (const kind of ['TCP', 'UDP', 'WebSocket']) {
    const field: string = kind === 'WebSocket' ? 'Uri' : 'Endpoint';
    const spec = new ShortcutActionSpec('OutputTarget::' + kind + '::' + field + '::Set',
      '设置 ' + kind + ' 输出端点草稿（不连接）', 'text', 0, 0, 1, 0, '', '{Identifier}::' + field + '::Set');
    spec.targetOutput = true; spec.targetAxis = false;
    spec.valueLabel = kind === 'WebSocket' ? 'Uri · ws/wss，无 query、凭据' : 'Endpoint · ipOrHost:port';
    spec.maximumTextLength = kind === 'WebSocket' ? 1300 : 280; result.push(spec);
  }
  for (const command of ['Toggle', 'Connect', 'Disconnect']) {
    const spec = new ShortcutActionSpec('OutputTarget::Connection::' + command,
      '目标输出' + (command === 'Toggle' ? '连接切换' : command === 'Connect' ? '连接（不启用发送）' : '断开'),
      'none', 0, 0, 1, 0, '', '{target.Identifier}::Connection::' + command);
    spec.targetOutput = true; spec.targetAxis = false; result.push(spec);
  }
}

export function defaultShortcutAction(id: string): ShortcutAction {
  const spec: ShortcutActionSpec | undefined = shortcutActionCatalog().find(item => item.id === id);
  if (spec === undefined) { throw new Error('keyboard.action is unavailable or unsafe.'); }
  const points: ShortcutPoint[] = spec.pointsKind === 'smartLimit' ? [new ShortcutPoint(50, 50)] :
    spec.pointsKind === 'customCurve' ? [new ShortcutPoint(0.5, 0.5)] : [];
  return new ShortcutAction(id, spec.defaultValue, '', spec.secondaryDefaultValue, spec.defaultText, points, '', spec.tertiaryDefaultValue);
}


export class ShortcutKeySpec {
  keyCode: number;
  label: string;
  constructor(keyCode: number, label: string) { this.keyCode = keyCode; this.label = label; }
}

/** Numeric constants audited against HarmonyOS @ohos.multimodalInput.keyCode.
 * No SDK import is needed by the pure engine. Left/right modifiers stay distinct
 * as in upstream WPF RawInput; chords are sets, not an ordered key sequence. */
export function keyCatalog(): ShortcutKeySpec[] {
  const result: ShortcutKeySpec[] = [];
  for (let index: number = 0; index < 10; index++) { result.push(new ShortcutKeySpec(2000 + index, index.toString())); }
  for (let index: number = 0; index < 26; index++) { result.push(new ShortcutKeySpec(2017 + index, String.fromCharCode(65 + index))); }
  result.push(new ShortcutKeySpec(2012, '↑')); result.push(new ShortcutKeySpec(2013, '↓'));
  result.push(new ShortcutKeySpec(2014, '←')); result.push(new ShortcutKeySpec(2015, '→'));
  result.push(new ShortcutKeySpec(2045, 'Left Alt')); result.push(new ShortcutKeySpec(2046, 'Right Alt'));
  result.push(new ShortcutKeySpec(2047, 'Left Shift')); result.push(new ShortcutKeySpec(2048, 'Right Shift'));
  result.push(new ShortcutKeySpec(2049, 'Tab')); result.push(new ShortcutKeySpec(2050, 'Space'));
  result.push(new ShortcutKeySpec(2054, 'Enter')); result.push(new ShortcutKeySpec(2055, 'Backspace'));
  result.push(new ShortcutKeySpec(2068, 'Page Up')); result.push(new ShortcutKeySpec(2069, 'Page Down'));
  result.push(new ShortcutKeySpec(2070, 'Escape')); result.push(new ShortcutKeySpec(2071, 'Delete'));
  result.push(new ShortcutKeySpec(2072, 'Left Ctrl')); result.push(new ShortcutKeySpec(2073, 'Right Ctrl'));
  result.push(new ShortcutKeySpec(2081, 'Home')); result.push(new ShortcutKeySpec(2082, 'End'));
  for (let index: number = 0; index < 12; index++) { result.push(new ShortcutKeySpec(2090 + index, 'F' + (index + 1).toString())); }
  return result;
}
export function isShortcutKey(keyCode: number): boolean {
  return Number.isInteger(keyCode) && keyCatalog().some(key => key.keyCode === keyCode);
}
export function keyLabel(keyCode: number): string {
  const key = keyCatalog().find(item => item.keyCode === keyCode);
  return key === undefined ? 'Unsupported key' : key.label;
}
export function chordLabel(keys: number[]): string {
  return keys.slice().sort((left, right) => left - right).map(key => keyLabel(key)).join(' + ');
}

export class KeyboardShortcutMapping {
  id: string;
  name: string;
  enabled: boolean = true;
  keys: number[] = [];
  trigger: ShortcutTrigger = 'press';
  handleRepeating: boolean = false;
  clickCount: number = 1;
  maximumClickIntervalMs: number = 200;
  minimumHoldDurationMs: number = 1000;
  maximumHoldDurationMs: number = -1;
  holdInvoke: ShortcutHoldInvoke = 'release';
  actions: ShortcutAction[] = [];
  constructor(id: string = '', name: string = '') { this.id = id; this.name = name; }
}

export class KeyboardShortcutConfiguration {
  static readonly MAX_MAPPINGS: number = 64;
  static readonly MAX_KEYS: number = 8;
  static readonly MAX_ACTIONS: number = 16;
  /** Local resource budgets, not upstream collection limits. */
  static readonly MAX_POINTS_PER_ACTION: number = 4096;
  static readonly MAX_TOTAL_POINTS: number = 8192;
  static readonly MAX_DURATION_MS: number = 60000;
  enabled: boolean = true;
  mappings: KeyboardShortcutMapping[] = [];

  static validate(value: KeyboardShortcutConfiguration): string[] {
    try { checkConfiguration(value); return []; }
    catch (error) { return [(error as Error).message]; }
  }
  static fromJson(value: KeyboardShortcutConfiguration | undefined): KeyboardShortcutConfiguration {
    return value === undefined ? new KeyboardShortcutConfiguration() : KeyboardShortcutConfiguration.clone(value);
  }
  static clone(value: KeyboardShortcutConfiguration): KeyboardShortcutConfiguration {
    checkConfiguration(value);
    const result = new KeyboardShortcutConfiguration(); result.enabled = value.enabled;
    result.mappings = value.mappings.map(mapping => cloneMapping(mapping)); return result;
  }
}
export class ShortcutConfigurationValidation {
  valid: boolean;
  errors: string[];
  configuration: KeyboardShortcutConfiguration | null;
  constructor(errors: string[], configuration: KeyboardShortcutConfiguration | null) {
    this.valid = errors.length === 0; this.errors = errors; this.configuration = configuration;
  }
}
export function defaultShortcutConfiguration(): KeyboardShortcutConfiguration { return new KeyboardShortcutConfiguration(); }
export function cloneShortcutConfiguration(value: KeyboardShortcutConfiguration): KeyboardShortcutConfiguration {
  return KeyboardShortcutConfiguration.clone(value);
}
export function validateShortcutConfiguration(value: KeyboardShortcutConfiguration): ShortcutConfigurationValidation {
  const errors = KeyboardShortcutConfiguration.validate(value);
  return new ShortcutConfigurationValidation(errors, errors.length === 0 ? KeyboardShortcutConfiguration.clone(value) : null);
}
export function cloneShortcutAction(value: ShortcutAction): ShortcutAction {
  checkAction(value); return new ShortcutAction(value.id, value.value, value.targetAxis === undefined ? '' : value.targetAxis,
    value.secondaryValue === undefined ? 0 : value.secondaryValue, value.text === undefined ? '' : value.text,
    value.points === undefined ? [] : value.points, value.outputTargetId === undefined ? '' : value.outputTargetId,
    value.tertiaryValue === undefined ? 0 : value.tertiaryValue);
}
export function validateShortcutAction(value: ShortcutAction): boolean {
  try { checkAction(value); return true; } catch (_) { return false; }
}
function cloneMapping(value: KeyboardShortcutMapping): KeyboardShortcutMapping {
  const result = new KeyboardShortcutMapping(value.id, value.name);
  result.enabled = value.enabled; result.keys = value.keys.slice().sort((left, right) => left - right);
  result.trigger = value.trigger; result.handleRepeating = value.handleRepeating;
  result.clickCount = value.clickCount; result.maximumClickIntervalMs = value.maximumClickIntervalMs;
  result.minimumHoldDurationMs = value.minimumHoldDurationMs; result.maximumHoldDurationMs = value.maximumHoldDurationMs;
  result.holdInvoke = value.holdInvoke; result.actions = value.actions.map(action => cloneShortcutAction(action)); return result;
}
function requireKeys(value: Object, allowed: string[], path: string): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) { throw new Error(path + ' must be an object.'); }
  const keys = Object.keys(value);
  if (keys.some(key => allowed.indexOf(key) < 0)) { throw new Error(path + ' contains an unsupported or unsafe field.'); }
  if (allowed.some(key => keys.indexOf(key) < 0)) { throw new Error(path + ' is missing a required field.'); }
}
function boundedInteger(value: number, minimum: number, maximum: number, path: string): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) { throw new Error(path + ' is outside its integer bounds.'); }
}
function checkAction(value: ShortcutAction): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) { throw new Error('keyboard.action must be an object.'); }
  const keys: string[] = Object.keys(value);
  const allowed: string[] = ['id', 'value', 'targetAxis', 'secondaryValue', 'text', 'points', 'outputTargetId', 'tertiaryValue'];
  if (keys.some(key => allowed.indexOf(key) < 0) || keys.indexOf('id') < 0 || keys.indexOf('value') < 0) {
    throw new Error('keyboard.action contains an unsupported or unsafe field, or is incomplete.');
  }
  const action = shortcutActionCatalog().find(item => item.id === value.id);
  if (action === undefined) { throw new Error('keyboard.action is unavailable or unsafe.'); }
  if (typeof value.value !== 'number' || !Number.isFinite(value.value) || value.value < action.minimum || value.value > action.maximum ||
    (action.valueKind === 'boolean' && value.value !== 0 && value.value !== 1) || (action.integer && !Number.isInteger(value.value))) {
    throw new Error('keyboard.action.value is outside the supported action bounds.');
  }
  const target: string = value.targetAxis === undefined ? '' : value.targetAxis;
  const secondary: number = value.secondaryValue === undefined ? 0 : value.secondaryValue;
  const text: string = value.text === undefined ? '' : value.text;
  const output: string = value.outputTargetId === undefined ? '' : value.outputTargetId;
  const tertiary: number = value.tertiaryValue === undefined ? 0 : value.tertiaryValue;
  if (typeof output !== 'string' || (output !== '' && (!action.targetOutput || !/^(tcp|udp|webSocket):[0-9]$/.test(output)))) {
    throw new Error('keyboard.action.outputTargetId must identify a configured supported target.');
  }
  if (typeof tertiary !== 'number' || !Number.isFinite(tertiary) || tertiary < action.tertiaryMinimum || tertiary > action.tertiaryMaximum) {
    throw new Error('keyboard.action.tertiaryValue is outside the supported action bounds.');
  }
  if (typeof target !== 'string' || (target !== '' && (!action.targetAxis || !/^[A-Z][0-9]$/.test(target)))) {
    throw new Error('keyboard.action.targetAxis must be an axis name or the selected-axis sentinel.');
  }
  if (typeof secondary !== 'number' || !Number.isFinite(secondary) || secondary < action.secondaryMinimum || secondary > action.secondaryMaximum) {
    throw new Error('keyboard.action.secondaryValue is outside the supported action bounds.');
  }
  if (typeof text !== 'string' || text.length > action.maximumTextLength || /[\x00-\x1f\x7f]/.test(text)) {
    throw new Error('keyboard.action.text must be bounded plain text.');
  }
  if (action.valueKind === 'enum' || action.valueKind === 'provider' || action.pointsKind === 'customCurve') {
    if (!action.textOptions.some(option => option.value === text)) { throw new Error('keyboard.action.text is not an available option.'); }
  } else if (action.valueKind === 'axis') {
    if (text !== '' && !/^[A-Z][0-9]$/.test(text)) { throw new Error('keyboard.action.text must be an axis name or empty.'); }
  } else if (action.valueKind !== 'text' && action.textArgumentLabel === '' && text !== '') {
    throw new Error('keyboard.action does not accept text.');
  }
  checkPoints(value.points === undefined ? [] : value.points, action.pointsKind);
}

function checkPoints(points: ShortcutPoint[], kind: ShortcutPointsKind): void {
  if (!Array.isArray(points) || points.length > KeyboardShortcutConfiguration.MAX_POINTS_PER_ACTION) {
    throw new Error('keyboard.action.points must be an array of at most 4096 points.');
  }
  const pointKeys: string[] = Object.keys(points);
  if (pointKeys.length !== points.length || pointKeys.some((key, index) => key !== index.toString())) {
    throw new Error('keyboard.action.points must be a dense array without additional fields.');
  }
  if (kind === 'none' && points.length !== 0) { throw new Error('keyboard.action does not accept points.'); }
  let previousX: number = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    requireKeys(point, ['x', 'y'], 'keyboard.action.point');
    if (typeof point.x !== 'number' || !Number.isFinite(point.x) || typeof point.y !== 'number' || !Number.isFinite(point.y) ||
      point.y < 0 || point.y > (kind === 'smartLimit' ? 100 : 1) ||
      (kind === 'smartLimit' && (point.x < 0 || point.x > 100))) {
      throw new Error('keyboard.action.point coordinates are outside the supported bounds.');
    }
    // This is the existing OHOS AxisConfiguration boundary, not an upstream
    // SetFrom restriction. Never silently sort, merge or drop supplied points.
    if (kind === 'smartLimit' && point.x <= previousX) {
      throw new Error('keyboard.action smart-limit point x values must be strictly increasing on OHOS.');
    }
    previousX = point.x;
  }
}

function checkConfiguration(value: KeyboardShortcutConfiguration): void {
  requireKeys(value, ['enabled', 'mappings'], 'keyboard');
  if (typeof value.enabled !== 'boolean') { throw new Error('keyboard.enabled must be boolean.'); }
  if (!Array.isArray(value.mappings) || value.mappings.length > KeyboardShortcutConfiguration.MAX_MAPPINGS) { throw new Error('keyboard.mappings must contain at most 64 entries.'); }
  const ids: string[] = [];
  let totalPoints: number = 0;
  for (const mapping of value.mappings) {
    requireKeys(mapping, ['id', 'name', 'enabled', 'keys', 'trigger', 'handleRepeating', 'clickCount', 'maximumClickIntervalMs',
      'minimumHoldDurationMs', 'maximumHoldDurationMs', 'holdInvoke', 'actions'], 'keyboard.mapping');
    if (typeof mapping.id !== 'string' || !/^[A-Za-z0-9_.-]{1,64}$/.test(mapping.id) || ids.indexOf(mapping.id) >= 0) {
      throw new Error('keyboard.mapping.id must be a unique bounded identifier.');
    }
    ids.push(mapping.id);
    if (typeof mapping.name !== 'string' || mapping.name.length > 80 || /[\x00-\x1f\x7f]/.test(mapping.name)) { throw new Error('keyboard.mapping.name must be bounded plain text.'); }
    if (typeof mapping.enabled !== 'boolean' || typeof mapping.handleRepeating !== 'boolean') { throw new Error('keyboard.mapping switches must be boolean.'); }
    if (!Array.isArray(mapping.keys) || mapping.keys.length > KeyboardShortcutConfiguration.MAX_KEYS) { throw new Error('keyboard.mapping.keys must contain at most 8 keys.'); }
    const seen: number[] = [];
    for (const key of mapping.keys) {
      if (!isShortcutKey(key) || key === EMERGENCY_STOP_KEY || seen.indexOf(key) >= 0) { throw new Error('keyboard.mapping.keys contains an unsupported, repeated or reserved key.'); }
      seen.push(key);
    }
    if (['press', 'release', 'click', 'hold'].indexOf(mapping.trigger) < 0) { throw new Error('keyboard.mapping.trigger is unsupported for local keyboard input.'); }
    if (mapping.holdInvoke !== 'release' && mapping.holdInvoke !== 'holding') { throw new Error('keyboard.mapping.holdInvoke is unsupported.'); }
    boundedInteger(mapping.clickCount, 1, 8, 'keyboard.mapping.clickCount');
    boundedInteger(mapping.maximumClickIntervalMs, 0, 60000, 'keyboard.mapping.maximumClickIntervalMs');
    boundedInteger(mapping.minimumHoldDurationMs, 0, 60000, 'keyboard.mapping.minimumHoldDurationMs');
    boundedInteger(mapping.maximumHoldDurationMs, -1, 60000, 'keyboard.mapping.maximumHoldDurationMs');
    if (!Array.isArray(mapping.actions) || mapping.actions.length > KeyboardShortcutConfiguration.MAX_ACTIONS) { throw new Error('keyboard.mapping.actions must contain at most 16 actions.'); }
    for (const action of mapping.actions) {
      checkAction(action); totalPoints += action.points === undefined ? 0 : action.points.length;
      if (totalPoints > KeyboardShortcutConfiguration.MAX_TOTAL_POINTS) {
        throw new Error('keyboard.actions may contain at most 8192 points in total.');
      }
    }
  }
}
