import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s, c, n) { return n(s.startsWith('.') && !/\.[a-z]+$/i.test(s) ? s + '.ts' : s, c); } });
const { SettingsSchema, AppConfiguration } = await import('../entry/src/main/ets/settings/SettingsSchema.ts');
const { DeviceProfile, DeviceAxisDefinition } = await import('../entry/src/main/ets/core/DeviceProfile.ts');
const { MotionConfigurations, MotionProviderConfiguration } = await import('../entry/src/main/ets/core/MotionConfiguration.ts');
const raw = () => JSON.parse(SettingsSchema.encode(SettingsSchema.defaults()));
const decode = value => SettingsSchema.decode(JSON.stringify(value));

test('complete source defaults include all profiles and all disabled axes, no warnings on roundtrip', () => {
  const config = SettingsSchema.defaults(); const encoded = SettingsSchema.encode(config);
  const result = SettingsSchema.decode(encoded);
  assert.equal(result.status, 'valid'); assert.deepEqual(result.diagnostics, []);
  assert.equal(result.configuration.selectedDeviceId, 'TCode-0.3');
  assert.deepEqual(result.configuration.axisSettingsByDevice.map(d => d.axes.length), [9, 11]);
  assert.deepEqual(result.configuration.motionSettingsByDevice.map(d => d.axes.length), [9, 11]);
  assert.ok(result.configuration.motionSettingsByDevice.every(d => d.axes.every(a => a.providers.length === 4)));
  assert.equal(SettingsSchema.encode(result.configuration), encoded);
});

test('provider defaults match pinned source and reversed ranges remain legal', () => {
  const providers = MotionConfigurations.defaults();
  assert.deepEqual(providers.map(p => [p.id, p.speed, p.minimum, p.maximum]), [
    ['Random', .3, 0, 1], ['Pattern', 1, 0, 1], ['Custom Curve', 1, 0, 1], ['Looping Script', 1, 0, 1]
  ]);
  assert.deepEqual([providers[0].octaves, providers[0].persistence, providers[0].lacunarity], [1, 1, 1]);
  assert.equal(providers[1].pattern, 'triangle');
  assert.deepEqual(providers[2].points.map(p => [p.x, p.y]), [[0, 0]]);
  assert.deepEqual([providers[2].durationSeconds, providers[2].interpolationMode, providers[2].isLooping, providers[2].syncOnEnd], [10, 'linear', true, true]);
  assert.deepEqual([providers[3].sourceUri, providers[3].interpolationMode], [null, 'pchip']);
  providers[0].minimum = .9; providers[0].maximum = .1;
  assert.deepEqual(MotionConfigurations.validate(providers[0]), []);
});

test('partial schema fills missing values with diagnostics and source device targets', () => {
  const result = decode({ schemaVersion: 1, devices: [
    { id: 'custom', name: 'Custom', axes: [{ name: 'Z9', enabled: true, defaultValue: .2 }] }
  ], selectedDeviceId: 'custom', sync: { syncOnSeek: false } });
  assert.equal(result.status, 'valid'); assert.ok(result.diagnostics.some(d => d.code === 'default_added'));
  assert.equal(result.configuration.sync.durationSeconds, 4); assert.equal(result.configuration.sync.syncOnSeek, false);
  const axis = result.configuration.axisSettingsByDevice.find(d => d.deviceId === 'custom').axes[0].settings;
  assert.equal(axis.autoHomeTargetValue, .2); assert.equal(axis.smartLimitTargetValue, .2);
  assert.equal(result.configuration.devices.length, 3);
});

test('built-ins are canonical and only enabled state is restored', () => {
  const value = raw(); const profile = value.devices[1];
  profile.name = 'tampered'; profile.outputPrecision = 10; profile.isBuiltIn = false;
  profile.axes[0].enabled = false; profile.axes[0].defaultValue = .1; profile.axes[0].funscriptNames = ['evil'];
  const result = decode(value); assert.equal(result.status, 'valid');
  assert.equal(result.configuration.devices[1].name, 'TCode-0.3');
  assert.equal(result.configuration.devices[1].outputPrecision, 4);
  assert.equal(result.configuration.devices[1].axes[0].enabled, false);
  assert.equal(result.configuration.devices[1].axes[0].defaultValue, .5);
  assert.deepEqual(result.configuration.devices[1].axes[0].funscriptNames, ['*','stroke','L0','up']);
  assert.ok(result.diagnostics.some(d => d.code === 'builtin_rebuilt'));
});

test('positive speed-limit Infinity uses explicit tagged codec, every other nonfinite value fails', () => {
  const config = new AppConfiguration(); config.axisSettingsByDevice[0].axes[0].settings.speedLimitUnitsPerSecond = Infinity;
  const encoded = SettingsSchema.encode(config); assert.match(encoded, /"speedLimitUnitsPerSecond":"Infinity"/);
  const result = SettingsSchema.decode(encoded); assert.equal(result.configuration.axisSettingsByDevice[0].axes[0].settings.speedLimitUnitsPerSecond, Infinity);
  for (const value of [NaN, -Infinity]) {
    config.axisSettingsByDevice[0].axes[0].settings.speedLimitUnitsPerSecond = value;
    assert.throws(() => SettingsSchema.encode(config));
  }
  for (const mutate of [c => c.globalOffsetSeconds = Infinity, c => c.sync.durationSeconds = NaN,
    c => c.motionSettingsByDevice[0].axes[0].providers[0].speed = Infinity,
    c => c.devices[0].axes[0].defaultValue = NaN]) {
    const invalid = new AppConfiguration(); mutate(invalid); assert.throws(() => SettingsSchema.encode(invalid));
  }
  assert.equal(SettingsSchema.decode('{"globalOffsetSeconds":1e999}').status, 'invalid');
});

test('all mutable layers deep-clone, runtime/session/secret fields never persist', () => {
  const original = new AppConfiguration();
  original.playing = true; original.armed = true; original.token = 'secret';
  original.motionSettingsByDevice[0].axes[0].providers[0].seed = 'secret-seed';
  const clone = SettingsSchema.clone(original);
  clone.devices[0].axes[0].funscriptNames.push('edited');
  clone.axisSettingsByDevice[0].axes[0].settings.smartLimitPoints[0].y = 9;
  clone.motionSettingsByDevice[0].axes[0].providers[2].points[0].y = .4;
  assert.equal(original.devices[0].axes[0].funscriptNames.length, 4);
  assert.equal(original.axisSettingsByDevice[0].axes[0].settings.smartLimitPoints[0].y, 100);
  assert.equal(original.motionSettingsByDevice[0].axes[0].providers[2].points[0].y, 0);
  const json = SettingsSchema.encode(original);
  for (const forbidden of ['"playing"', '"armed"', 'secret', 'seed', 'connectionGeneration']) assert.ok(!json.includes(forbidden));
});

test('invalid JSON, unknown versions, unsafe keys and excessive sizes are rejected distinctly', () => {
  for (const json of ['{', 'null', '[]', '42', '{"x":{"__proto__":{}}}', '{"x":{"constr\\u0075ctor":{}}}', '{"$type":"anything"}']) {
    assert.equal(SettingsSchema.decode(json).status, 'invalid', json);
  }
  assert.equal(SettingsSchema.decode('{"schemaVersion":2}').status, 'unsupported');
  assert.equal(SettingsSchema.decode('{"schemaVersion":0}').status, 'unsupported');
  assert.equal(SettingsSchema.decode(' '.repeat(SettingsSchema.MAX_JSON_LENGTH + 1)).status, 'invalid');
  assert.equal(SettingsSchema.decode('{"x":' + '['.repeat(33) + '0' + ']'.repeat(33) + '}').status, 'invalid');
});

test('duplicate ids, unknown selection, link cycles and bad provider fields fail rather than coerce', () => {
  for (const mutate of [v => v.devices.push(v.devices[0]), v => v.selectedDeviceId = 'missing',
    v => v.axisSettingsByDevice[0].axes.push(v.axisSettingsByDevice[0].axes[0]),
    v => { const a = v.axisSettingsByDevice[0].axes; a[0].settings.linkAxis = 'L1'; a[1].settings.linkAxis = 'L0'; },
    v => v.motionSettingsByDevice[0].axes[0].providers[0].speed = null,
    v => v.motionSettingsByDevice[0].axes[0].providers[2].points = [{}],
    v => v.motionSettingsByDevice[0].axes[0].providers[3].sourceUri = 'https://host/file?token=secret']) {
    const value = raw(); mutate(value); assert.equal(decode(value).status, 'invalid');
  }
});

test('all provider parameter changes and local URI roundtrip without retaining transient state', () => {
  const config = new AppConfiguration(); const p = config.motionSettingsByDevice[1].axes[8].providers;
  p[0].octaves = 4; p[0].persistence = .5; p[0].lacunarity = 1.8;
  p[1].pattern = 'doubleBounce'; p[2].points = [{x:0,y:.2},{x:2,y:.8}];
  p[2].durationSeconds = 4; p[2].isLooping = false; p[2].syncOnEnd = false; p[2].interpolationMode = 'makima';
  p[3].sourceUri = 'file://docs/storage/curve.funscript';
  const after = SettingsSchema.clone(config).motionSettingsByDevice[1].axes[8].providers;
  assert.equal(after[0].octaves, 4); assert.equal(after[1].pattern, 'doubleBounce');
  assert.equal(after[2].points[1].x, 2); assert.equal(after[2].interpolationMode, 'makima');
  assert.equal(after[3].sourceUri, p[3].sourceUri);
  for (const uri of ['file://docs/a?token=x', 'file://docs/a#secret', 'file://user:pass@docs/a', 'file://docs/a%3Ftoken=x']) {
    p[3].sourceUri = uri; assert.throws(() => SettingsSchema.encode(config));
  }
});

test('persistent provider parameters do not confuse UI bounds with source representation', () => {
  const c = new AppConfiguration(); const providers = c.motionSettingsByDevice[0].axes[0].providers;
  providers[0].octaves = 129; providers[2].durationSeconds = .0001;
  providers[2].points = [{x:2,y:.2},{x:0,y:.1},{x:2,y:.8},{x:-1,y:.3}];
  const after = SettingsSchema.clone(c).motionSettingsByDevice[0].axes[0].providers;
  assert.equal(after[0].octaves,129); assert.equal(after[2].durationSeconds,.0001);
  assert.deepEqual(after[2].points.map(p=>[p.x,p.y]),[[2,.2],[0,.1],[2,.8],[-1,.3]]);
});

test('disabled-axis configuration and references survive roundtrip until active projection', () => {
  const c = new AppConfiguration(); const axes = c.axisSettingsByDevice[1].axes;
  axes.find(a=>a.axisName==='L0').settings.linkAxis='A2';
  axes.find(a=>a.axisName==='A2').settings.offsetSeconds=2;
  const after=SettingsSchema.clone(c).axisSettingsByDevice[1].axes;
  assert.equal(after.find(a=>a.axisName==='L0').settings.linkAxis,'A2');
  assert.equal(after.find(a=>a.axisName==='A2').settings.offsetSeconds,2);
});

test('partial input cannot expand into a valid but unencodable configuration', () => {
  const axes=Array.from({length:32},(_,i)=>({name:String.fromCharCode(65+Math.floor(i/10))+String(i%10)}));
  const devices=Array.from({length:30},(_,i)=>({id:'custom-'+i,axes}));
  const json=JSON.stringify({schemaVersion:1,devices}); assert.ok(json.length<20000);
  const result=SettingsSchema.decode(json); assert.equal(result.status,'invalid'); assert.equal(result.configuration,null);
  assert.ok(result.diagnostics.some(d=>d.message.includes('expand beyond')));
});
