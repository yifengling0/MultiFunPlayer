import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? specifier + '.ts' : specifier, context);
} });
const { DeviceAxisDefinition, DeviceProfiles } = await import('../entry/src/main/ets/core/DeviceProfile.ts');
const { AxisConfiguration, AxisConfigurationEntry, SyncConfiguration } = await import('../entry/src/main/ets/core/AxisConfiguration.ts');
const profile = () => DeviceProfiles.getBuiltIn();
const enabled = () => ['L0', 'L1', 'L2', 'R0', 'R1', 'R2'];
const axis = (name = 'L0') => profile().axes.find(axis => axis.name === name);
const settings = (name = 'L0') => new AxisConfiguration(axis(name), enabled());
const plain = value => JSON.parse(JSON.stringify(value));
const paths = diagnostics => diagnostics.map(diagnostic => diagnostic.path);

// Independent literals transcribed from pinned ScriptViewModel.cs::AxisSettings
// and SyncSettings. No production factory derives these expected values.
const expectedMovement = {
  linkAxisHasPriority: false, linkAxis: null,
  smartLimitInputAxis: null, smartLimitPoints: [{ x: 25, y: 100 }, { x: 90, y: 0 }],
  smartLimitMode: 'value', smartLimitTargetValue: 0.5, interpolationType: 'pchip',
  autoHomeEnabled: true, autoHomeDelaySeconds: 5, autoHomeDurationSeconds: 3,
  autoHomeTargetValue: 0.5, autoHomeInsideScript: false, invertScript: false,
  offsetSeconds: 0, scriptScale: 1, lockScript: false,
  bypassScript: false, bypassMotionProvider: false, bypassTransition: false,
  motionProviderBlend: 0, motionProviderFillGaps: false,
  motionProviderMinimumGapDurationSeconds: 5, motionProviderSpeedLimitWithAxis: true,
  updateMotionProviderWhenPaused: false, updateMotionProviderWithoutScript: false,
  updateMotionProviderWithAxis: null, selectedMotionProvider: null,
  speedLimitEnabled: false, speedLimitUnitsPerSecond: 10
};
const expectedSync = {
  durationSeconds: 4, syncOnMediaResourceChanged: true, syncOnScriptResourceChanged: true,
  syncOnScriptStart: true, syncOnScriptEnd: true, syncOnMediaPlayPause: true,
  syncOnSeek: true, syncOnAutoHomeStartEnd: true
};

test('all 29 axis defaults and all 8 synchronization defaults match independent source literals', () => {
  assert.equal(Object.keys(expectedMovement).length, 29);
  assert.equal(Object.keys(expectedSync).length, 8);
  for (const name of ['L0', 'L1', 'L2']) assert.deepEqual(plain(settings(name)), expectedMovement);
  assert.deepEqual(plain(new SyncConfiguration()), expectedSync);
  assert.deepEqual(SyncConfiguration.validate(new SyncConfiguration()), []);
  for (const name of ['L0', 'L1', 'L2', 'R0', 'R1', 'R2', 'V0', 'V1', 'A0', 'A1', 'A2']) {
    assert.deepEqual(AxisConfiguration.validate(settings(name), axis(name), enabled()), []);
  }
});

test('rotation defaults select Random and follow only an enabled exact L0', () => {
  for (const name of ['R0', 'R1', 'R2']) {
    assert.deepEqual(plain(settings(name)), { ...expectedMovement, selectedMotionProvider: 'Random',
      updateMotionProviderWithoutScript: true, updateMotionProviderWithAxis: 'L0' });
    for (const names of [[], ['L1'], ['l0']]) {
      const config = new AxisConfiguration(axis(name), names);
      assert.equal(config.updateMotionProviderWithAxis, null);
      assert.equal(config.selectedMotionProvider, 'Random');
    }
  }
  const custom = new AxisConfiguration(new DeviceAxisDefinition('R9', 'Custom', [], true, 0.7), enabled());
  assert.equal(custom.selectedMotionProvider, null);
  assert.equal(custom.updateMotionProviderWithoutScript, false);
});

test('V-digit axes home in 0s delay/1s; other auxiliary axes retain 5s/3s', () => {
  for (const name of ['V0', 'V1', 'V9']) {
    const config = new AxisConfiguration(new DeviceAxisDefinition(name, 'Custom', [], true, 0.2), enabled());
    assert.deepEqual(plain(config), { ...expectedMovement, smartLimitTargetValue: 0.2,
      autoHomeTargetValue: 0.2, autoHomeDelaySeconds: 0, autoHomeDurationSeconds: 1 });
  }
  for (const name of ['A0', 'A1', 'A2']) {
    assert.deepEqual(plain(settings(name)), { ...expectedMovement, smartLimitTargetValue: 0, autoHomeTargetValue: 0 });
  }
  const valve = DeviceProfiles.getBuiltIn('TCode-0.2').axes.find(axis => axis.name === 'L3');
  assert.deepEqual(plain(new AxisConfiguration(valve, enabled())), { ...expectedMovement,
    smartLimitTargetValue: 0, autoHomeTargetValue: 0 });
});

test('custom targets use actual device defaults rather than name-based neutral guesses', () => {
  for (const name of ['L0', 'R0', 'V0', 'A0', 'Z9']) {
    const config = new AxisConfiguration(new DeviceAxisDefinition(name, null, [], true, 0.37), enabled());
    assert.equal(config.smartLimitTargetValue, 0.37); assert.equal(config.autoHomeTargetValue, 0.37);
  }
  for (const value of [NaN, Infinity, -0.001, 1.001, '0.5', null]) {
    assert.throws(() => new AxisConfiguration(new DeviceAxisDefinition('Z9', null, [], true, value)));
  }
});

test('profile runtime defaults preserve enabled order and never follow disabled L0', () => {
  const p = profile();
  assert.deepEqual(AxisConfiguration.defaultsForProfile(p).map(entry => entry.axisName), enabled());
  p.axes[0].enabled = false; p.axes.find(axis => axis.name === 'V1').enabled = true;
  const entries = AxisConfiguration.defaultsForProfile(p);
  assert.deepEqual(entries.map(entry => entry.axisName), ['L1', 'L2', 'R0', 'R1', 'R2', 'V1']);
  assert.equal(entries.find(entry => entry.axisName === 'R0').settings.updateMotionProviderWithAxis, null);
  assert.equal(entries.find(entry => entry.axisName === 'V1').settings.autoHomeDurationSeconds, 1);
  assert.deepEqual(AxisConfiguration.validateEntries(entries, p), []);
});

test('persistent mode retains disabled-axis settings and references without inventing enabled defaults', () => {
  const p = profile(); p.axes[0].enabled = false;
  const entries = AxisConfiguration.defaultsForProfile(p, true);
  assert.deepEqual(entries.map(entry => entry.axisName), p.axes.map(axis => axis.name));
  assert.equal(entries.find(entry => entry.axisName === 'R0').settings.updateMotionProviderWithAxis, null);
  entries.find(entry => entry.axisName === 'L1').settings.smartLimitInputAxis = 'A2';
  assert.deepEqual(AxisConfiguration.validateEntries(entries, p, true), []);
  assert.ok(AxisConfiguration.validateEntries(entries, p).length > 0);
  const names = DeviceProfiles.enabledAxes(p).map(axis => axis.name);
  const allNames = p.axes.map(axis => axis.name);
  const decoded = AxisConfiguration.fromJson({ smartLimitInputAxis: 'A2' }, axis('R0'), names, allNames);
  assert.equal(decoded.smartLimitInputAxis, 'A2');
  assert.equal(decoded.updateMotionProviderWithAxis, null);
  assert.throws(() => AxisConfiguration.fromJson({ smartLimitInputAxis: 'A2' }, axis('R0'), names));
});

test('clones, entries, defaults and DTOs deeply isolate point arrays and objects', () => {
  const source = settings(); const clone = AxisConfiguration.clone(source);
  const entry = new AxisConfigurationEntry('L0', source);
  const dto = AxisConfiguration.toJson(source);
  const decoded = AxisConfiguration.fromJson(dto, axis(), enabled());
  clone.smartLimitPoints[0].x = 1; entry.settings.smartLimitPoints[0].y = 2;
  dto.smartLimitPoints[1].y = 3; decoded.smartLimitPoints.length = 0;
  assert.deepEqual(plain(source.smartLimitPoints), [{ x: 25, y: 100 }, { x: 90, y: 0 }]);
  const first = AxisConfiguration.defaultsForProfile(profile()); first[0].settings.smartLimitPoints[0].x = 0;
  assert.equal(first[1].settings.smartLimitPoints[0].x, 25);
  assert.equal(AxisConfiguration.defaultsForProfile(profile())[0].settings.smartLimitPoints[0].x, 25);
  const sync = new SyncConfiguration(); const other = SyncConfiguration.clone(sync);
  other.durationSeconds = 1; assert.equal(sync.durationSeconds, 4);
});

const numericRanges = [
  ['smartLimitTargetValue', 0, 1, 'normalized', false],
  ['autoHomeDelaySeconds', 0, null, 'seconds', false],
  ['autoHomeDurationSeconds', 0, null, 'seconds', false],
  ['autoHomeTargetValue', 0, 1, 'normalized', false],
  ['offsetSeconds', null, null, 'seconds', false],
  ['scriptScale', 0.01, 4, 'factor', false],
  ['motionProviderBlend', 0, 1, 'factor', false],
  ['motionProviderMinimumGapDurationSeconds', 0, null, 'seconds', false],
  ['speedLimitUnitsPerSecond', 0, null, 'normalized/second', true],
  ['smartLimitPoints.x', 0, 100, 'percent', false],
  ['smartLimitPoints.y', 0, 100, 'percent', false]
];

test('source numeric boundaries are exact; absent limits remain null', () => {
  assert.deepEqual(AxisConfiguration.numberRanges().map(range =>
    [range.field, range.minimum, range.maximum, range.unit, range.allowPositiveInfinity]), numericRanges);
  assert.deepEqual(SyncConfiguration.numberRanges().map(range =>
    [range.field, range.minimum, range.maximum, range.unit]), [['durationSeconds', 0.5, 8, 'seconds']]);
  const ranges = AxisConfiguration.numberRanges(); ranges[0].maximum = 7;
  assert.equal(AxisConfiguration.numberRanges()[0].maximum, 1);
  for (const [field, minimum, maximum] of numericRanges.slice(0, 9)) {
    for (const value of [minimum, maximum].filter(value => value !== null)) {
      const config = settings(); config[field] = value;
      assert.deepEqual(AxisConfiguration.validate(config), [], `${field} accepts ${value}`);
    }
    for (const value of [minimum === null ? null : minimum - 0.001,
      maximum === null ? null : maximum + 0.001].filter(value => value !== null)) {
      const config = settings(); config[field] = value;
      assert.deepEqual(paths(AxisConfiguration.validate(config)), [field]); assert.equal(config[field], value);
    }
  }
});

test('source-unbounded durations and offsets have no fabricated 24-hour cap', () => {
  const config = settings();
  for (const field of ['autoHomeDelaySeconds', 'autoHomeDurationSeconds', 'motionProviderMinimumGapDurationSeconds', 'speedLimitUnitsPerSecond']) {
    config[field] = Number.MAX_VALUE;
  }
  config.offsetSeconds = -Number.MAX_VALUE; assert.deepEqual(AxisConfiguration.validate(config), []);
  config.offsetSeconds = Number.MAX_VALUE; assert.deepEqual(AxisConfiguration.validate(config), []);
});

test('all numeric fields reject NaN/coercion; only speed allows positive Infinity', () => {
  for (const [field] of numericRanges.slice(0, 9)) {
    for (const invalid of [NaN, -Infinity, '0', null, undefined, true]) {
      const config = settings(); config[field] = invalid;
      assert.deepEqual(paths(AxisConfiguration.validate(config)), [field]);
    }
    const config = settings(); config[field] = Infinity;
    assert.deepEqual(paths(AxisConfiguration.validate(config)), field === 'speedLimitUnitsPerSecond' ? [] : [field]);
  }
});

test('all boolean and enum fields reject truthy/string coercion', () => {
  const fields = Object.keys(expectedMovement).filter(field => typeof expectedMovement[field] === 'boolean');
  assert.equal(fields.length, 13);
  for (const field of fields) for (const invalid of [0, 1, 'false', null, undefined]) {
    const config = settings(); config[field] = invalid;
    assert.deepEqual(paths(AxisConfiguration.validate(config)), [field]);
  }
  for (const mode of ['linear', 'pchip', 'makima', 'step']) {
    const config = settings(); config.interpolationType = mode; assert.deepEqual(AxisConfiguration.validate(config), []);
  }
  for (const mode of ['value', 'speed']) {
    const config = settings(); config.smartLimitMode = mode; assert.deepEqual(AxisConfiguration.validate(config), []);
  }
  const config = settings(); config.interpolationType = 'Pchip'; config.smartLimitMode = 'Value';
  assert.deepEqual(paths(AxisConfiguration.validate(config)), ['interpolationType', 'smartLimitMode']);
});

test('reference errors distinguish missing, disabled, malformed and self targets', () => {
  for (const field of ['linkAxis', 'smartLimitInputAxis', 'updateMotionProviderWithAxis']) {
    for (const [value, code] of [['L0', 'self_reference'], ['A0', 'unknown_axis_reference'],
      ['Z9', 'unknown_axis_reference'], ['l1', 'invalid_axis_reference'], ['', 'invalid_axis_reference'],
      [undefined, 'invalid_axis_reference'], [1, 'invalid_axis_reference']]) {
      const config = settings(); config[field] = value;
      assert.deepEqual(AxisConfiguration.validate(config, axis(), enabled()).map(d => [d.path, d.code]), [[field, code]]);
    }
    const config = settings(); config[field] = 'L1'; assert.deepEqual(AxisConfiguration.validate(config, axis(), enabled()), []);
    config[field] = null; assert.deepEqual(AxisConfiguration.validate(config, axis(), enabled()), []);
  }
});

test('Link cycles fail while cross-axis Smart/Motion cycles remain legal', () => {
  const entries = AxisConfiguration.defaultsForProfile(profile());
  entries[0].settings.linkAxis = 'L1'; entries[1].settings.linkAxis = 'L2';
  assert.deepEqual(AxisConfiguration.validateEntries(entries, profile()), []);
  entries[2].settings.linkAxis = 'L0';
  assert.deepEqual(AxisConfiguration.validateEntries(entries, profile()).map(d => d.code), ['link_cycle', 'link_cycle', 'link_cycle']);
  for (const entry of entries) entry.settings.linkAxis = null;
  entries[0].settings.smartLimitInputAxis = 'L1'; entries[1].settings.smartLimitInputAxis = 'L0';
  entries[0].settings.updateMotionProviderWithAxis = 'L1'; entries[1].settings.updateMotionProviderWithAxis = 'L0';
  assert.deepEqual(AxisConfiguration.validateEntries(entries, profile()), []);
  entries.push(new AxisConfigurationEntry('L0', settings()));
  assert.ok(AxisConfiguration.validateEntries(entries, profile()).some(d => d.code === 'duplicate_axis_name'));
});

test('smart-limit percent points and invalid order are diagnosed without rewriting', () => {
  for (const points of [[], [{ x: 0, y: 0 }], [{ x: 0, y: 100 }, { x: 100, y: 0 }]]) {
    const config = settings(); config.smartLimitPoints = points; assert.deepEqual(AxisConfiguration.validate(config), []);
  }
  for (const [points, expectedPaths] of [
    [null, ['smartLimitPoints']], [[null], ['smartLimitPoints[0]']],
    [[{ x: NaN, y: Infinity }], ['smartLimitPoints[0].x', 'smartLimitPoints[0].y']],
    [[{ x: -1, y: 101 }], ['smartLimitPoints[0].x', 'smartLimitPoints[0].y']],
    [[{ x: 50, y: 100 }, { x: 25, y: 0 }], ['smartLimitPoints[1].x']],
    [[{ x: 25, y: 100 }, { x: 25, y: 0 }], ['smartLimitPoints[1].x']]
  ]) {
    const config = settings(); config.smartLimitPoints = points; const before = structuredClone(points);
    assert.deepEqual(paths(AxisConfiguration.validate(config)), expectedPaths); assert.deepEqual(points, before);
  }
});

test('unknown provider names survive for registry diagnostics; malformed names fail', () => {
  const config = settings(); config.selectedMotionProvider = 'Future plugin provider';
  assert.deepEqual(AxisConfiguration.validate(config), []);
  assert.equal(AxisConfiguration.fromJson(AxisConfiguration.toJson(config), axis(), enabled()).selectedMotionProvider, 'Future plugin provider');
  for (const invalid of ['', ' ', undefined, 2]) {
    config.selectedMotionProvider = invalid; assert.deepEqual(paths(AxisConfiguration.validate(config)), ['selectedMotionProvider']);
  }
});

test('Infinity speed from 0 seconds/unit has a lossless explicit JSON tag', () => {
  const config = settings(); config.speedLimitEnabled = true; config.speedLimitUnitsPerSecond = Infinity;
  const dto = AxisConfiguration.toJson(config); assert.equal(dto.speedLimitUnitsPerSecond, 'Infinity');
  const json = JSON.stringify(dto); assert.ok(json.includes('"speedLimitUnitsPerSecond":"Infinity"'));
  const result = AxisConfiguration.fromJson(JSON.parse(json), axis(), enabled());
  assert.equal(result.speedLimitUnitsPerSecond, Infinity); assert.equal(result.speedLimitEnabled, true);
  assert.equal(config.speedLimitUnitsPerSecond, Infinity);
  assert.equal(JSON.parse(JSON.stringify(config)).speedLimitUnitsPerSecond, 'Infinity');
  for (const invalid of [NaN, -Infinity, -1, null, 'NaN', '-Infinity', 'unlimited']) {
    const invalidDto = AxisConfiguration.toJson(settings()); invalidDto.speedLimitUnitsPerSecond = invalid;
    assert.throws(() => AxisConfiguration.fromJson(invalidDto, axis(), enabled()));
  }
  const raw = AxisConfiguration.toJson(settings()); raw.speedLimitUnitsPerSecond = Infinity;
  assert.throws(() => AxisConfiguration.fromJson(raw, axis(), enabled()), /Infinity tag/);
});

test('missing codec fields use axis defaults and present invalid fields are rejected', () => {
  const config = AxisConfiguration.fromJson({ invertScript: true, offsetSeconds: 0.25 }, axis('R1'), enabled());
  assert.equal(config.selectedMotionProvider, 'Random'); assert.equal(config.updateMotionProviderWithAxis, 'L0');
  assert.equal(config.invertScript, true); assert.equal(config.offsetSeconds, 0.25);
  const custom = new DeviceAxisDefinition('V7', 'V7', [], true, 0.3);
  const restored = AxisConfiguration.fromJson({}, custom, ['V7']);
  assert.equal(restored.autoHomeTargetValue, 0.3); assert.equal(restored.autoHomeDelaySeconds, 0);
  assert.equal(restored.autoHomeDurationSeconds, 1);
  for (const dto of [null, [], 1, { autoHomeTargetValue: null }, { invertScript: undefined }, { scriptScale: Infinity }]) {
    assert.throws(() => AxisConfiguration.fromJson(dto, axis(), enabled()));
  }
  for (const config of [null, undefined, [], 1]) assert.equal(AxisConfiguration.validate(config)[0].code, 'invalid_object');
});

test('runtime state and prototype keys cannot enter persisted configuration', () => {
  const config = settings(); config.value = NaN; config.syncTime = 4; config.connected = true;
  for (const object of [AxisConfiguration.clone(config), AxisConfiguration.toJson(config)]) {
    for (const key of ['value', 'syncTime', 'connected']) assert.equal(Object.hasOwn(object, key), false);
  }
  for (const dto of [{ value: NaN }, { armed: true }, { durationSeconds: 1 },
    JSON.parse('{"__proto__":{"polluted":true}}'), { constructor: {} }, { prototype: {} }]) {
    assert.throws(() => AxisConfiguration.fromJson(dto, axis(), enabled()), /Unknown axis configuration field/);
  }
  const inherited = Object.create({ invertScript: true });
  assert.equal(AxisConfiguration.fromJson(inherited, axis(), enabled()).invertScript, false);
  assert.equal({}.polluted, undefined);
});

test('every sync toggle and duration validates exact source limits', () => {
  for (const duration of [0.5, 4, 8]) {
    const sync = new SyncConfiguration(); sync.durationSeconds = duration; assert.deepEqual(SyncConfiguration.validate(sync), []);
  }
  for (const duration of [0, 0.499, 8.001, NaN, Infinity, -Infinity, '4', null]) {
    const sync = new SyncConfiguration(); sync.durationSeconds = duration;
    assert.deepEqual(paths(SyncConfiguration.validate(sync)), ['durationSeconds']);
  }
  for (const field of Object.keys(expectedSync).filter(field => field !== 'durationSeconds')) {
    const sync = new SyncConfiguration(); sync[field] = 'true';
    assert.deepEqual(paths(SyncConfiguration.validate(sync)), [field]);
    sync[field] = false; assert.deepEqual(SyncConfiguration.validate(sync), []);
  }
  for (const malformed of [null, undefined, [], 2]) assert.equal(SyncConfiguration.validate(malformed)[0].code, 'invalid_object');
});

test('active resolution mirrors source disabled-reference nulling without deleting stored settings', () => {
  const p = profile();
  const stored = AxisConfiguration.defaultsForProfile(p, true);
  const l0 = stored.find(entry => entry.axisName === 'L0').settings;
  l0.linkAxis = 'A0'; l0.smartLimitInputAxis = 'A1'; l0.updateMotionProviderWithAxis = 'A2';
  stored.find(entry => entry.axisName === 'V0').settings.offsetSeconds = 8;
  const resolution = AxisConfiguration.resolveActive(stored, p);
  assert.deepEqual(resolution.entries.map(entry => entry.axisName), enabled());
  assert.deepEqual(resolution.diagnostics.map(d => [d.path, d.code, d.severity]), [
    ['axes.L0.settings.linkAxis', 'inactive_axis_reference', 'warning'],
    ['axes.L0.settings.smartLimitInputAxis', 'inactive_axis_reference', 'warning'],
    ['axes.L0.settings.updateMotionProviderWithAxis', 'inactive_axis_reference', 'warning']
  ]);
  const active = resolution.entries[0].settings;
  assert.equal(active.linkAxis, null); assert.equal(active.smartLimitInputAxis, null);
  assert.equal(active.updateMotionProviderWithAxis, null);
  assert.equal(l0.linkAxis, 'A0'); assert.equal(l0.smartLimitInputAxis, 'A1');
  assert.equal(l0.updateMotionProviderWithAxis, 'A2');
  active.smartLimitPoints[0].x = 0; assert.equal(l0.smartLimitPoints[0].x, 25);
  for (const axis of p.axes) axis.enabled = true;
  const reenabled = AxisConfiguration.resolveActive(stored, p);
  assert.deepEqual(reenabled.diagnostics, []);
  assert.equal(reenabled.entries[0].settings.linkAxis, 'A0');
  assert.equal(reenabled.entries.find(entry => entry.axisName === 'V0').settings.offsetSeconds, 8);
});

test('active resolution fills missing source entries and fails closed for invalid stored settings', () => {
  const p = profile(); p.axes[0].enabled = false;
  const fresh = AxisConfiguration.resolveActive([], p);
  assert.deepEqual(fresh.diagnostics, []);
  assert.equal(fresh.entries.find(entry => entry.axisName === 'R0').settings.updateMotionProviderWithAxis, null);
  const stored = AxisConfiguration.defaultsForProfile(profile(), true);
  stored[0].settings.linkAxis = 'Z9';
  const invalid = AxisConfiguration.resolveActive(stored, profile());
  assert.deepEqual(invalid.entries, []);
  assert.ok(invalid.diagnostics.some(d => d.code === 'unknown_axis_reference' && d.severity === 'error'));
});
