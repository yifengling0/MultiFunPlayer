/** Persisted local-surface configuration. Runtime reception, pointer ownership,
 * deadlines and output admission deliberately have no representation here. */
export type ContinuousInputSource = 'touch' | 'mouse' | 'wheel';
export type ContinuousInputComponent = 'x' | 'y' | 'wheelX' | 'wheelY';
export type ContinuousInputKind = 'drive' | 'offset';
export type ContinuousDriveMode = 'Absolute' | 'Relative' | 'RelativePositiveOnly' | 'RelativeNegativeOnly' | 'RelativeJoystick';
export type ContinuousOffsetMode = 'Absolute' | 'AbsoluteJoystick';

/** Nine registration templates, with the named provider and output instance
 * represented separately. There is no selected-axis/provider/target sentinel. */
export class ContinuousInputAction {
  id: string;
  targetAxis: string;
  provider: string;
  outputTargetId: string;
  minimumLimit: number;
  maximumLimit: number;
  constructor(id: string, targetAxis: string, provider: string = '', outputTargetId: string = '',
    minimumLimit: number = 0, maximumLimit: number = 1) {
    this.id = id; this.targetAxis = targetAxis; this.provider = provider; this.outputTargetId = outputTargetId;
    this.minimumLimit = minimumLimit; this.maximumLimit = maximumLimit;
  }
}

export class ContinuousActionSpec {
  id: string;
  label: string;
  targetProvider: boolean;
  targetOutput: boolean;
  constructor(id: string, label: string, targetProvider: boolean = false, targetOutput: boolean = false) {
    this.id = id; this.label = label; this.targetProvider = targetProvider; this.targetOutput = targetOutput;
  }
}

export function continuousActionCatalog(): ContinuousActionSpec[] {
  return [
    new ContinuousActionSpec('Axis::Value::Drive', '轴值'),
    new ContinuousActionSpec('Axis::MotionProviderBlend::Drive', '运动提供器混合'),
    new ContinuousActionSpec('MotionProvider::Speed::Drive', '命名提供器速度', true),
    new ContinuousActionSpec('MotionProvider::Minimum::Drive', '命名提供器下限', true),
    new ContinuousActionSpec('MotionProvider::Maximum::Drive', '命名提供器上限', true),
    new ContinuousActionSpec('OutputTarget::Axis::Range::Minimum::Drive', '目标输出下限', false, true),
    new ContinuousActionSpec('OutputTarget::Axis::Range::Maximum::Drive', '目标输出上限', false, true),
    new ContinuousActionSpec('OutputTarget::Axis::Range::Middle::Drive', '目标输出中点', false, true),
    new ContinuousActionSpec('OutputTarget::Axis::Range::Size::Drive', '目标输出宽度', false, true)
  ];
}

export class ContinuousInputMapping {
  id: string;
  name: string;
  enabled: boolean = true;
  source: ContinuousInputSource = 'touch';
  component: ContinuousInputComponent = 'x';
  kind: ContinuousInputKind = 'drive';
  driveMode: ContinuousDriveMode = 'Relative';
  offsetMode: ContinuousOffsetMode = 'AbsoluteJoystick';
  speed: number = 0.1;
  /** Explicit local wheel calibration; not an upstream RawInput count divisor. */
  wheelSpan: number = 100;
  invert: boolean = false;
  actions: ContinuousInputAction[] = [];
  constructor(id: string = '', name: string = '') { this.id = id; this.name = name; }
}

export class ContinuousInputConfiguration {
  static readonly MAX_MAPPINGS: number = 64;
  static readonly MAX_ACTIONS: number = 16;
  enabled: boolean = true;
  mappings: ContinuousInputMapping[] = [];

  static validate(value: ContinuousInputConfiguration): string[] {
    try { checkConfiguration(value); return []; }
    catch (error) { return [(error as Error).message]; }
  }
  static fromJson(value: ContinuousInputConfiguration | undefined): ContinuousInputConfiguration {
    return value === undefined ? new ContinuousInputConfiguration() : ContinuousInputConfiguration.clone(value);
  }
  static clone(value: ContinuousInputConfiguration): ContinuousInputConfiguration {
    checkConfiguration(value);
    const result = new ContinuousInputConfiguration(); result.enabled = value.enabled;
    result.mappings = value.mappings.map(mapping => cloneContinuousMapping(mapping)); return result;
  }
}

export function cloneContinuousAction(value: ContinuousInputAction): ContinuousInputAction {
  checkAction(value);
  return new ContinuousInputAction(value.id, value.targetAxis, value.provider, value.outputTargetId,
    value.minimumLimit, value.maximumLimit);
}
export function validateContinuousAction(value: ContinuousInputAction): boolean {
  try { checkAction(value); return true; } catch (_) { return false; }
}
export function cloneContinuousMapping(value: ContinuousInputMapping): ContinuousInputMapping {
  checkMapping(value);
  const result = new ContinuousInputMapping(value.id, value.name);
  result.enabled = value.enabled; result.source = value.source; result.component = value.component;
  result.kind = value.kind; result.driveMode = value.driveMode; result.offsetMode = value.offsetMode;
  result.speed = value.speed; result.wheelSpan = value.wheelSpan; result.invert = value.invert;
  result.actions = value.actions.map(action => cloneContinuousAction(action)); return result;
}
export function continuousSourceAcceptsComponent(source: ContinuousInputSource, component: ContinuousInputComponent): boolean {
  return source === 'wheel' ? component === 'wheelX' || component === 'wheelY' :
    (source === 'touch' || source === 'mouse') && (component === 'x' || component === 'y');
}

function requireKeys(value: Object, allowed: string[], path: string): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) { throw new Error(path + ' must be an object.'); }
  const keys = Object.keys(value);
  if (keys.length !== allowed.length || keys.some(key => allowed.indexOf(key) < 0)) {
    throw new Error(path + ' contains unsupported runtime/unsafe fields or is incomplete.');
  }
}
function requireDenseArray(value: Object[], maximum: number, path: string): void {
  if (!Array.isArray(value) || value.length > maximum) { throw new Error(path + ' exceeds its local resource bound.'); }
  const keys = Object.keys(value);
  if (keys.length !== value.length || keys.some((key, index) => key !== index.toString())) {
    throw new Error(path + ' must be dense and contain no additional fields.');
  }
}
function checkAction(value: ContinuousInputAction): void {
  requireKeys(value, ['id', 'targetAxis', 'provider', 'outputTargetId', 'minimumLimit', 'maximumLimit'], 'continuous.action');
  const spec = continuousActionCatalog().find(item => item.id === value.id);
  if (spec === undefined) { throw new Error('continuous.action is not one of the nine Drive templates.'); }
  if (typeof value.targetAxis !== 'string' || !/^[A-Z][0-9]$/.test(value.targetAxis)) {
    throw new Error('continuous.action requires an explicit target axis.');
  }
  if (typeof value.provider !== 'string' || (spec.targetProvider ?
    ['Pattern', 'Random', 'Custom Curve', 'Looping Script'].indexOf(value.provider) < 0 : value.provider !== '')) {
    throw new Error('continuous.action requires the exact supported provider, only for provider actions.');
  }
  if (typeof value.outputTargetId !== 'string' || (spec.targetOutput ?
    !/^(tcp|udp|webSocket):[0-9]$/.test(value.outputTargetId) : value.outputTargetId !== '')) {
    throw new Error('continuous.action requires an explicit supported output target, only for range actions.');
  }
  for (const limit of [value.minimumLimit, value.maximumLimit]) {
    if (typeof limit !== 'number' || !Number.isFinite(limit) || limit < 0 || limit > 1) {
      throw new Error('continuous.action range limits must be finite values in [0, 1].');
    }
  }
  // The source permits reverse limits/ranges. Do not reorder them. Unused
  // arguments must retain their defaults rather than carry hidden payloads.
  if ((!spec.targetOutput && (value.minimumLimit !== 0 || value.maximumLimit !== 1)) ||
    (value.id === 'OutputTarget::Axis::Range::Minimum::Drive' && value.maximumLimit !== 1) ||
    (value.id === 'OutputTarget::Axis::Range::Maximum::Drive' && value.minimumLimit !== 0)) {
    throw new Error('continuous.action contains an argument not used by its template.');
  }
}
function checkMapping(value: ContinuousInputMapping): void {
  requireKeys(value, ['id', 'name', 'enabled', 'source', 'component', 'kind', 'driveMode', 'offsetMode', 'speed', 'wheelSpan', 'invert', 'actions'], 'continuous.mapping');
  if (typeof value.id !== 'string' || !/^[A-Za-z0-9_.-]{1,64}$/.test(value.id)) {
    throw new Error('continuous.mapping.id must be a bounded identifier.');
  }
  if (typeof value.name !== 'string' || value.name.length > 80 || /[\x00-\x1f\x7f]/.test(value.name)) {
    throw new Error('continuous.mapping.name must be bounded plain text.');
  }
  if (typeof value.enabled !== 'boolean' || typeof value.invert !== 'boolean') {
    throw new Error('continuous.mapping switches must be boolean.');
  }
  if (!continuousSourceAcceptsComponent(value.source, value.component)) { throw new Error('continuous.mapping source/component is unsupported.'); }
  if (value.kind !== 'drive' && value.kind !== 'offset') { throw new Error('continuous.mapping kind is unsupported.'); }
  if (value.source === 'wheel' && value.kind === 'offset') { throw new Error('Local wheel input supports Drive only; contact cannot be proven for Offset.'); }
  if (['Absolute', 'Relative', 'RelativePositiveOnly', 'RelativeNegativeOnly', 'RelativeJoystick'].indexOf(value.driveMode) < 0 ||
    ['Absolute', 'AbsoluteJoystick'].indexOf(value.offsetMode) < 0) { throw new Error('continuous.mapping mode is unsupported.'); }
  if (typeof value.speed !== 'number' || !Number.isFinite(value.speed) || value.speed < 0 || value.speed > 1) {
    throw new Error('continuous.mapping Offset speed must be finite and in [0, 1].');
  }
  if (typeof value.wheelSpan !== 'number' || !Number.isFinite(value.wheelSpan) || value.wheelSpan < 1 || value.wheelSpan > 4096) {
    throw new Error('continuous.mapping wheelSpan must be finite and in [1, 4096].');
  }
  requireDenseArray(value.actions, ContinuousInputConfiguration.MAX_ACTIONS, 'continuous.mapping.actions');
  for (const action of value.actions) { checkAction(action); }
}
function checkConfiguration(value: ContinuousInputConfiguration): void {
  requireKeys(value, ['enabled', 'mappings'], 'continuous');
  if (typeof value.enabled !== 'boolean') { throw new Error('continuous.enabled must be boolean.'); }
  requireDenseArray(value.mappings, ContinuousInputConfiguration.MAX_MAPPINGS, 'continuous.mappings');
  const ids: string[] = [];
  for (const mapping of value.mappings) {
    checkMapping(mapping);
    if (ids.indexOf(mapping.id) >= 0) { throw new Error('continuous.mapping.id must be unique.'); }
    ids.push(mapping.id);
  }
}
