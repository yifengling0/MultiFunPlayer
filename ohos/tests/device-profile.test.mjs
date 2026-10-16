import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? specifier + '.ts' : specifier, context);
} });

const { DeviceAxisDefinition, DeviceProfile, DeviceProfiles } = await import('../entry/src/main/ets/core/DeviceProfile.ts');
const { AxisMapping } = await import('../entry/src/main/ets/core/AxisMapping.ts');

// Independent literals transcribed from pinned Source/MultiFunPlayer/Common/
// DeviceSettings.cs, not derived from the implementation or another port module.
const common = [
  ['L0', 'Up/Down', ['*', 'stroke', 'L0', 'up'], true, 0.5],
  ['L1', 'Forward/Backward', ['surge', 'L1', 'forward'], true, 0.5],
  ['L2', 'Left/Right', ['sway', 'L2', 'left'], true, 0.5],
  ['R0', 'Twist', ['twist', 'R0', 'yaw'], true, 0.5],
  ['R1', 'Roll', ['roll', 'R1'], true, 0.5],
  ['R2', 'Pitch', ['pitch', 'R2'], true, 0.5],
  ['V0', 'Vibrate', ['vib', 'V0'], false, 0]
];
const expected02 = [...common,
  ['V1', 'Pump', ['pump', 'lube', 'V1'], false, 0],
  ['L3', 'Suction', ['suck', 'valve', 'L3'], false, 0]
];
const expected03 = [...common,
  ['V1', 'Pump', ['pump', 'V1'], false, 0],
  ['A0', 'Valve', ['valve', 'A0'], false, 0],
  ['A1', 'Suction', ['suck', 'A1'], false, 0],
  ['A2', 'Lube', ['lube', 'A2'], false, 0]
];
const values = profile => profile.axes.map(axis =>
  [axis.name, axis.friendlyName, axis.funscriptNames, axis.enabled, axis.defaultValue]);

test('both built-in profiles preserve every upstream field and ordering', () => {
  const profiles = DeviceProfiles.builtInProfiles();
  assert.deepEqual(profiles.map(p => [p.id, p.name, p.isBuiltIn, p.outputPrecision]), [
    ['TCode-0.2', 'TCode-0.2', true, 3], ['TCode-0.3', 'TCode-0.3', true, 4]
  ]);
  assert.deepEqual(values(profiles[0]), expected02);
  assert.deepEqual(values(profiles[1]), expected03);
  for (const profile of profiles) {
    assert.deepEqual(DeviceProfiles.validate(profile), []);
    assert.deepEqual(DeviceProfiles.enabledAxes(profile).map(axis => axis.name), ['L0', 'L1', 'L2', 'R0', 'R1', 'R2']);
  }
  assert.equal(DeviceProfiles.getBuiltIn().id, 'TCode-0.3');
  assert.throws(() => DeviceProfiles.getBuiltIn('unknown'), /Unknown built-in/);
});

test('unconfigured custom axes keep source defaults rather than invented neutral values', () => {
  const axis = new DeviceAxisDefinition('Z9');
  assert.deepEqual([axis.friendlyName, axis.funscriptNames, axis.enabled, axis.defaultValue], [null, [], false, 0]);
  const custom = new DeviceProfile('my-device', 'My device');
  assert.equal(custom.outputPrecision, 3);
  assert.equal(custom.isBuiltIn, false);
  assert.deepEqual(custom.axes, []);
  assert.deepEqual(DeviceProfiles.validate(custom), []);
});

test('constructors, built-ins, custom clones and snapshots isolate nested alias arrays', () => {
  const aliases = ['z'];
  const axis = new DeviceAxisDefinition('Z9', 'Custom', aliases, true, 0.3);
  const profile = new DeviceProfile('z', 'Z', false, 5, [axis]);
  aliases.push('external');
  axis.funscriptNames.push('axis edit');
  assert.deepEqual(profile.axes[0].funscriptNames, ['z']);
  const source = DeviceProfiles.getBuiltIn();
  const clone = DeviceProfiles.clone(source, 'custom-1', 'My custom device');
  const snapshot = DeviceProfiles.copy(source);
  const enabled = DeviceProfiles.enabledAxes(source);
  clone.axes[0].funscriptNames.length = 0;
  clone.axes[0].defaultValue = 0;
  snapshot.axes[1].name = 'X0';
  enabled[0].funscriptNames[0] = 'changed';
  assert.equal(clone.id, 'custom-1');
  assert.equal(clone.name, 'My custom device');
  assert.equal(clone.isBuiltIn, false);
  assert.equal(snapshot.isBuiltIn, true);
  assert.deepEqual(values(source), expected03);
  source.axes[0].funscriptNames.length = 0;
  assert.deepEqual(values(DeviceProfiles.getBuiltIn()), expected03);
});

test('upstream enabled-name filtering keeps the first exact valid axis', () => {
  const profile = new DeviceProfile('test', 'Test', false, 3, [
    new DeviceAxisDefinition('L0', 'First', ['first'], true, 0.5),
    new DeviceAxisDefinition('L0', 'Second', ['second'], true, 0.1),
    new DeviceAxisDefinition('l0', 'Lowercase invalid', [], true),
    new DeviceAxisDefinition('R10', 'Too long', [], true),
    new DeviceAxisDefinition('V0', 'Disabled', [], false),
    new DeviceAxisDefinition('Z9', 'Valid custom', [], true)
  ]);
  assert.deepEqual(DeviceProfiles.enabledAxes(profile).map(axis => [axis.name, axis.friendlyName]),
    [['L0', 'First'], ['Z9', 'Valid custom']]);
  const errors = DeviceProfiles.validate(profile).map(diagnostic => [diagnostic.path, diagnostic.code]);
  assert.deepEqual(errors, [
    ['axes[1].name', 'duplicate_axis_name'],
    ['axes[2].name', 'invalid_axis_name'], ['axes[2].name', 'duplicate_axis_name'],
    ['axes[3].name', 'invalid_axis_name']
  ]);
});

test('profile validation diagnoses malformed values without rewriting them', () => {
  for (const outputPrecision of [0, 11, 1.5, NaN, Infinity, -Infinity, '4', null]) {
    const profile = DeviceProfiles.getBuiltIn();
    profile.outputPrecision = outputPrecision;
    assert.equal(DeviceProfiles.validate(profile)[0].path, 'outputPrecision');
    assert.ok(Object.is(profile.outputPrecision, outputPrecision));
  }
  for (const outputPrecision of [1, 10]) {
    const profile = DeviceProfiles.getBuiltIn(); profile.outputPrecision = outputPrecision;
    assert.deepEqual(DeviceProfiles.validate(profile), []);
  }
  for (const defaultValue of [NaN, Infinity, -0.01, 1.01, '0.5', null]) {
    const profile = DeviceProfiles.getBuiltIn(); profile.axes[0].defaultValue = defaultValue;
    assert.equal(DeviceProfiles.validate(profile)[0].path, 'axes[0].defaultValue');
    assert.ok(Object.is(profile.axes[0].defaultValue, defaultValue));
  }
  const malformed = DeviceProfiles.getBuiltIn();
  malformed.id = ''; malformed.name = ' '; malformed.isBuiltIn = 1;
  malformed.axes[0].enabled = 'false';
  malformed.axes[0].friendlyName = 1;
  malformed.axes[0].funscriptNames = ['', null];
  malformed.axes.push(null);
  assert.deepEqual(DeviceProfiles.validate(malformed).map(d => d.path), [
    'id', 'name', 'isBuiltIn', 'axes[0].friendlyName', 'axes[0].enabled',
    'axes[0].funscriptNames[0]', 'axes[0].funscriptNames[1]', 'axes[11]'
  ]);
  for (const malformed of [null, undefined, [], 2]) {
    assert.equal(DeviceProfiles.validate(malformed)[0].code, 'invalid_object');
  }
  const noAxes = DeviceProfiles.getBuiltIn(); noAxes.axes = null;
  assert.equal(DeviceProfiles.validate(noAxes)[0].path, 'axes');
  assert.throws(() => DeviceProfiles.clone(DeviceProfiles.getBuiltIn(), '', 'Invalid'));
});

test('alias overlap remains legal and mappings stay compatible before integration', () => {
  const profile = DeviceProfiles.getBuiltIn();
  profile.axes[1].funscriptNames.push('stroke');
  assert.deepEqual(DeviceProfiles.validate(profile), []);
  for (const id of ['TCode-0.2', 'TCode-0.3']) {
    const legacy = AxisMapping.defaultAxes(id);
    assert.deepEqual(DeviceProfiles.getBuiltIn(id).axes.map(axis =>
      [axis.name, axis.friendlyName, axis.funscriptNames, axis.enabled]),
    legacy.map(axis => [axis.name, axis.friendlyName, axis.funscriptNames, axis.enabled]));
  }
  assert.deepEqual(AxisMapping.findAxesMatchingName('movie.lube.funscript', 'TCode-0.2', true).map(a => a.name), ['V1']);
  assert.deepEqual(AxisMapping.findAxesMatchingName('movie.lube.funscript', 'TCode-0.3', true).map(a => a.name), ['A2']);
});
