import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s, c, n) { return n(s.startsWith('.') && !/\.[a-z]+$/i.test(s) ? s + '.ts' : s, c); } });
const { GeneralConfiguration, defaultGeneralConfiguration, cloneGeneralConfiguration, validateGeneralConfiguration } =
  await import('../entry/src/main/ets/settings/GeneralConfiguration.ts');
const { KeyboardShortcutConfiguration, KeyboardShortcutMapping, ShortcutAction, EMERGENCY_STOP_KEY } =
  await import('../entry/src/main/ets/input/ShortcutConfiguration.ts');
const { SettingsSchema } = await import('../entry/src/main/ets/settings/SettingsSchema.ts');
const { SettingsStore } = await import('../entry/src/main/ets/settings/SettingsStore.ts');
const { SavedOutputTarget, SavedOutputDeviceRanges } = await import('../entry/src/main/ets/settings/OutputConfiguration.ts');

const decode = value => SettingsSchema.decode(JSON.stringify(value));
const encoded = value => JSON.parse(SettingsSchema.encode(value));
const invalidBoth = (section, value) => {
  const config = SettingsSchema.defaults(); config[section] = value;
  assert.equal(decode(config).status, 'invalid');
  assert.throws(() => SettingsSchema.encode(config));
};
const mapping = (id = 'mapping-1') => {
  const result = new KeyboardShortcutMapping(id, '播放 / 暂停');
  result.keys = [2072, 2017]; result.actions = [new ShortcutAction('Media::PlayPause::Toggle')];
  return result;
};
const keyboardWith = (...mappings) => {
  const result = new KeyboardShortcutConfiguration(); result.mappings = mappings; return result;
};

class Port {
  primary = null; backup = null; reads = []; writes = [];
  async read(slot) { this.reads.push(slot); return this[slot]; }
  async writeAtomic(json, previous) {
    this.writes.push({ json, previous });
    if (previous !== null) this.backup = previous;
    this.primary = json;
  }
}

test('schema 1 adds keyboard and General sections without changing version or startup intent', () => {
  const legacy = encoded(SettingsSchema.defaults()); delete legacy.keyboard; delete legacy.general;
  for (const input of [legacy, { schemaVersion: 1 }, {}]) {
    const result = decode(input);
    assert.equal(result.status, 'valid');
    assert.equal(result.configuration.schemaVersion, 1);
    assert.deepEqual(result.configuration.keyboard, new KeyboardShortcutConfiguration());
    assert.deepEqual(result.configuration.general, new GeneralConfiguration());
    assert.deepEqual(result.configuration.keyboard.mappings, []);
    assert.equal(result.configuration.keyboard.enabled, true);
    for (const path of ['keyboard', 'general']) {
      assert.ok(result.diagnostics.some(d => d.path === path && d.code === 'default_added'));
    }
    const again = SettingsSchema.decode(SettingsSchema.encode(result.configuration));
    assert.equal(again.status, 'valid'); assert.deepEqual(again.diagnostics, []);
    assert.equal(again.configuration.playback.internalAutoConnect, false);
    assert.deepEqual(again.configuration.outputs.targets, []);
  }
});

test('each section can be independently missing in an otherwise current snapshot', () => {
  for (const missing of ['keyboard', 'general']) {
    const config = SettingsSchema.defaults(); config.keyboard.enabled = false;
    config.general.appOrientation = 'horizontal'; config.general.errorDisplayType = 'dialog';
    const json = encoded(config); delete json[missing];
    const result = decode(json);
    assert.equal(result.status, 'valid');
    assert.deepEqual(result.configuration[missing], SettingsSchema.defaults()[missing]);
    const retained = missing === 'general' ? 'keyboard' : 'general';
    assert.deepEqual(result.configuration[retained], config[retained]);
  }
});

test('General default is responsive auto with snackbar and contains only implemented preferences', () => {
  const general = defaultGeneralConfiguration();
  assert.equal(general.appOrientation, 'auto');
  assert.equal(general.errorDisplayType, 'snackbar');
  assert.deepEqual(Object.keys(general), ['appOrientation', 'errorDisplayType', 'uiDensity']);
  assert.deepEqual(validateGeneralConfiguration(general), []);
  assert.deepEqual(GeneralConfiguration.fromJson(undefined), general);
  assert.notEqual(GeneralConfiguration.fromJson(undefined), general);
  assert.deepEqual(Object.keys(encoded(SettingsSchema.defaults()).general), ['appOrientation', 'errorDisplayType', 'uiDensity']);
});

test('all nine supported orientation and error-presentation combinations roundtrip exactly', () => {
  for (const appOrientation of ['auto', 'vertical', 'horizontal']) {
    for (const errorDisplayType of ['none', 'dialog', 'snackbar']) {
      const config = SettingsSchema.defaults();
      Object.assign(config.general, { appOrientation, errorDisplayType });
      const clone = SettingsSchema.clone(config);
      assert.deepEqual(clone.general, config.general);
      assert.notEqual(clone.general, config.general);
      assert.deepEqual(GeneralConfiguration.validate(clone.general), []);
      assert.equal(SettingsSchema.encode(clone), SettingsSchema.encode(config));
    }
  }
});

test('General copies detach edits and helper/static APIs share the same strict validation', () => {
  const general = new GeneralConfiguration(); general.appOrientation = 'vertical';
  const clone = cloneGeneralConfiguration(general); clone.errorDisplayType = 'none';
  assert.equal(general.errorDisplayType, 'snackbar');
  assert.equal(clone.appOrientation, 'vertical');
  const restored = GeneralConfiguration.fromJson(general); restored.appOrientation = 'horizontal';
  assert.equal(general.appOrientation, 'vertical');
  for (const invalid of [undefined, null, false, 0, '', [], {}, { appOrientation: 'auto' }, { errorDisplayType: 'snackbar' }]) {
    assert.ok(GeneralConfiguration.validate(invalid).length > 0);
    assert.deepEqual(validateGeneralConfiguration(invalid), GeneralConfiguration.validate(invalid));
    assert.throws(() => cloneGeneralConfiguration(invalid));
    if (invalid !== undefined) assert.throws(() => GeneralConfiguration.fromJson(invalid));
  }
});

test('present General and keyboard sections must be complete recognized objects', () => {
  for (const section of ['general', 'keyboard']) {
    for (const value of [null, [], false, 4, 'settings', {}]) invalidBoth(section, value);
  }
  invalidBoth('keyboard', { enabled: true });
  invalidBoth('keyboard', { mappings: [] });
  invalidBoth('general', { appOrientation: 'auto' });
  invalidBoth('general', { errorDisplayType: 'snackbar' });
});

test('General enum values reject coercion, unknown casing and future values', () => {
  for (const appOrientation of ['', 'Auto', 'Vertical', 'portrait', 'landscape', 'AUTO', 0, 1, true, null, [], {}]) {
    invalidBoth('general', { appOrientation, errorDisplayType: 'snackbar' });
  }
  for (const errorDisplayType of ['', 'None', 'Dialog', 'Snackbar', 'toast', 0, true, null, [], {}]) {
    invalidBoth('general', { appOrientation: 'auto', errorDisplayType });
  }
});

test('unsupported General flags and runtime/window state are rejected instead of persisted as no-ops', () => {
  for (const field of ['alwaysOnTop', 'allowWindowResize', 'rememberWindowLocation', 'nlog', 'logLevel',
    'logToFile', 'logToUi', 'jsonLogging', 'windowBounds', 'rotationLocked', 'playing', 'armed', 'futurePreference']) {
    const general = new GeneralConfiguration(); general[field] = true;
    invalidBoth('general', general);
  }
});

test('keyboard defaults persist enabled false without inventing a mapping or connection intent', () => {
  const config = SettingsSchema.defaults(); config.keyboard.enabled = false;
  const clone = SettingsSchema.clone(config);
  assert.deepEqual(clone.keyboard, config.keyboard);
  assert.notEqual(clone.keyboard, config.keyboard);
  assert.notEqual(clone.keyboard.mappings, config.keyboard.mappings);
  assert.deepEqual(Object.keys(encoded(config).keyboard), ['enabled', 'mappings']);
  for (const field of ['pressedKeys', 'recording', 'captureActive', 'hookInstalled', 'connected', 'armed', 'deviceToken']) {
    const keyboard = new KeyboardShortcutConfiguration(); keyboard[field] = true;
    invalidBoth('keyboard', keyboard);
  }
});

test('keyboard top-level booleans and collection shape reject coercion and over-budget lists', () => {
  for (const enabled of [null, 0, 1, 'true', [], {}]) invalidBoth('keyboard', { enabled, mappings: [] });
  for (const mappings of [null, 'keys', 4, true, {}, Array(65).fill({})]) {
    invalidBoth('keyboard', { enabled: true, mappings });
  }
});

test('all shortcut mapping properties, action values and order survive a stable schema roundtrip', () => {
  const config = SettingsSchema.defaults(); const press = mapping('press');
  press.keys = [2017, 2072]; press.enabled = false; press.handleRepeating = true;
  press.actions.push(new ShortcutAction('Media::Position::Time::Offset', -2.5));
  const release = mapping('release'); release.trigger = 'release'; release.keys = [2050];
  const click = mapping('click'); click.trigger = 'click'; click.clickCount = 3; click.maximumClickIntervalMs = 450;
  click.actions = [new ShortcutAction('App::Stop'), new ShortcutAction('Media::Speed::Set', 1.5)];
  const hold = mapping('hold'); hold.trigger = 'hold'; hold.minimumHoldDurationMs = 125;
  hold.maximumHoldDurationMs = 5000; hold.holdInvoke = 'holding';
  config.keyboard.mappings = [press, release, click, hold]; config.keyboard.enabled = false;
  const restored = SettingsSchema.clone(config);
  assert.deepEqual(restored.keyboard.mappings.map(value => value.id), ['press', 'release', 'click', 'hold']);
  assert.deepEqual(restored.keyboard, KeyboardShortcutConfiguration.clone(config.keyboard));
  assert.equal(restored.keyboard.mappings[3].holdInvoke, 'holding');
  assert.equal(restored.keyboard.mappings[3].maximumHoldDurationMs, 5000);
  assert.equal(restored.keyboard.mappings[0].actions[1].value, -2.5);
  assert.equal(SettingsSchema.encode(restored), SettingsSchema.encode(config));
});

test('schema clones detach mapping arrays, key arrays and action values without retaining pressed state', () => {
  const config = SettingsSchema.defaults(); config.keyboard = keyboardWith(mapping());
  const clone = SettingsSchema.clone(config);
  assert.notEqual(clone.keyboard.mappings, config.keyboard.mappings);
  assert.notEqual(clone.keyboard.mappings[0], config.keyboard.mappings[0]);
  assert.notEqual(clone.keyboard.mappings[0].keys, config.keyboard.mappings[0].keys);
  assert.notEqual(clone.keyboard.mappings[0].actions, config.keyboard.mappings[0].actions);
  assert.notEqual(clone.keyboard.mappings[0].actions[0], config.keyboard.mappings[0].actions[0]);
  clone.keyboard.mappings[0].name = 'Changed'; clone.keyboard.mappings[0].keys.length = 0;
  clone.keyboard.mappings[0].actions[0].id = 'App::Stop'; clone.keyboard.mappings.push(mapping('mapping-2'));
  assert.equal(config.keyboard.mappings.length, 1); assert.equal(config.keyboard.mappings[0].keys.length, 2);
  assert.equal(config.keyboard.mappings[0].name, '播放 / 暂停');
  assert.equal(config.keyboard.mappings[0].actions[0].id, 'Media::PlayPause::Toggle');
  const json = SettingsSchema.encode(config);
  for (const field of ['pressedKeys', 'lastKeyTime', 'clicksObserved', 'holdStarted', 'recording', 'armed']) {
    assert.ok(!json.includes(`"${field}"`));
  }
});

test('empty editable shortcut drafts and maximum bounded mapping collections remain encodable', () => {
  const config = SettingsSchema.defaults();
  config.keyboard = keyboardWith(new KeyboardShortcutMapping('empty'));
  assert.deepEqual(SettingsSchema.clone(config).keyboard, config.keyboard);
  config.keyboard.mappings = Array.from({ length: 64 }, (_, index) => mapping(`mapping-${index}`));
  config.keyboard.mappings[0].keys = [2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007];
  config.keyboard.mappings[0].actions = Array.from({ length: 16 }, () => new ShortcutAction('App::Stop'));
  assert.equal(SettingsSchema.clone(config).keyboard.mappings.length, 64);
  config.keyboard.mappings.push(mapping('over-budget'));
  invalidBoth('keyboard', config.keyboard);
});

test('mapping identifiers, key chords and recognized actions fail closed through the settings codec', () => {
  for (const mutate of [
    value => value.id = '', value => value.id = 'x'.repeat(65),
    value => value.keys = [EMERGENCY_STOP_KEY], value => value.keys = [2017, 2017],
    value => value.keys = [1], value => value.keys = ['2017'],
    value => value.keys = Array.from({ length: 9 }, (_, index) => 2000 + index),
    value => value.actions = Array.from({ length: 17 }, () => new ShortcutAction('App::Stop')),
    value => value.actions = [new ShortcutAction('Device::Arm')],
    value => value.actions = [new ShortcutAction('Media::Speed::Set', 5)],
    value => value.actions = [new ShortcutAction('Media::PlayPause::Set', .5)],
    value => value.actions = [new ShortcutAction('Media::Position::Time::Offset', Infinity)],
    value => value.actions = [new ShortcutAction('Media::Position::Time::Offset', NaN)],
    value => value.actions = [{ id: 'App::Stop', value: 0, runtimeToken: 'secret' }]
  ]) {
    const item = mapping(); mutate(item); invalidBoth('keyboard', keyboardWith(item));
  }
  invalidBoth('keyboard', keyboardWith(mapping(), mapping()));
});

test('mapping timing and trigger fields are validated even when their shortcut is disabled', () => {
  for (const mutate of [
    value => value.enabled = 0, value => value.handleRepeating = 'false',
    value => value.trigger = 'axis', value => value.holdInvoke = 'both',
    value => value.clickCount = 0, value => value.clickCount = 9,
    value => value.maximumClickIntervalMs = -1, value => value.maximumClickIntervalMs = 60001,
    value => value.minimumHoldDurationMs = -1, value => value.minimumHoldDurationMs = .5,
    value => value.maximumHoldDurationMs = -2, value => value.maximumHoldDurationMs = 60001,
    value => value.maximumHoldDurationMs = null, value => value.maximumClickIntervalMs = '200'
  ]) {
    const item = mapping(); item.enabled = false; mutate(item);
    const value = keyboardWith(item); value.enabled = false; invalidBoth('keyboard', value);
  }
});

test('mapping missing fields and unknown trigger state cannot be silently recovered as executable commands', () => {
  for (const field of Object.keys(mapping())) {
    const item = mapping(); delete item[field]; invalidBoth('keyboard', keyboardWith(item));
  }
  for (const field of ['pressedKeys', 'clickTimer', 'holdStart', 'captureActive', 'deviceId', 'outputId']) {
    const item = mapping(); item[field] = 'runtime'; invalidBoth('keyboard', keyboardWith(item));
  }
});

test('new preferences preserve existing playback, output, disabled-axis, sync and motion data', () => {
  const config = SettingsSchema.defaults();
  config.selectedDeviceId = 'TCode-0.2'; config.globalOffsetSeconds = 1.25;
  config.playback.playlistAssociations = ['目录/A.funscript', '目录/A.funscript'];
  config.playback.autoSkipOffsetSeconds = -2.5; config.playback.loadAdditionalScripts = true;
  config.sync.durationSeconds = 1.75; config.sync.syncOnSeek = false;
  config.axisSettingsByDevice[1].axes.find(a => a.axisName === 'A2').settings.offsetSeconds = .75;
  config.motionSettingsByDevice[0].axes[0].providers[0].speed = .9;
  const target = new SavedOutputTarget('tcp', 3); target.host = 'device.local'; target.port = 9000;
  target.rangesByDevice = [new SavedOutputDeviceRanges('TCode-0.3', [
    { axisId: 'A2', minimum: .2, maximum: .6, enabled: false }
  ])];
  config.outputs.targets = [target]; config.outputs.selectedTargetId = target.id;
  const before = encoded(config);
  config.keyboard.enabled = false; config.general.appOrientation = 'horizontal'; config.general.errorDisplayType = 'dialog';
  const after = encoded(SettingsSchema.clone(config));
  delete before.keyboard; delete before.general; delete after.keyboard; delete after.general;
  assert.deepEqual(after, before);
});

test('dangerous serialized keys are rejected even inside an unknown nested new-section field', () => {
  for (const section of ['keyboard', 'general']) {
    for (const field of ['__proto__', 'prototype', 'constructor', '$type']) {
      assert.equal(SettingsSchema.decode(`{"schemaVersion":1,"${section}":{"ignored":{"${field}":{}}}}`).status, 'invalid');
    }
  }
});

test('old snapshots load without IO writes and next explicit save persists both additive sections', async () => {
  const legacy = encoded(SettingsSchema.defaults()); delete legacy.keyboard; delete legacy.general;
  const port = new Port(); port.primary = JSON.stringify(legacy);
  const store = new SettingsStore(port, 0); const loaded = await store.load();
  assert.equal(loaded.source, 'primary'); assert.equal(loaded.recoveryRequired, false);
  assert.equal(loaded.readOnly, false); assert.equal(port.writes.length, 0);
  loaded.configuration.general.appOrientation = 'vertical'; loaded.configuration.keyboard.enabled = false;
  assert.equal((await store.save(loaded.configuration)).status, 'saved');
  assert.equal(port.writes.length, 1);
  const saved = SettingsSchema.decode(port.primary);
  assert.equal(saved.configuration.general.appOrientation, 'vertical');
  assert.equal(saved.configuration.keyboard.enabled, false);
  assert.equal(saved.configuration.schemaVersion, 1);
  assert.deepEqual(saved.diagnostics, []);
});

test('malformed new sections retain corrupt primary and recover backup only with explicit acceptance', async () => {
  for (const section of ['keyboard', 'general']) {
    const port = new Port(); const malformed = encoded(SettingsSchema.defaults());
    malformed[section].futureOrUnknown = 'preserve'; port.primary = JSON.stringify(malformed);
    const corruptPrimary = port.primary;
    const backup = SettingsSchema.defaults(); backup.general.errorDisplayType = 'dialog';
    backup.keyboard.enabled = false; port.backup = SettingsSchema.encode(backup);
    const store = new SettingsStore(port, 0); const loaded = await store.load();
    assert.equal(loaded.source, 'backup'); assert.equal(loaded.recoveryRequired, true);
    assert.equal(port.primary, corruptPrimary); assert.equal(port.writes.length, 0);
    assert.equal(loaded.configuration.general.errorDisplayType, 'dialog');
    assert.equal(loaded.configuration.keyboard.enabled, false);
    assert.equal((await store.save(SettingsSchema.defaults())).status, 'blocked');
    store.acceptRecovery();
    assert.equal((await store.save(loaded.configuration)).status, 'saved');
    assert.equal(SettingsSchema.decode(port.backup).status, 'valid');
    assert.equal(SettingsSchema.decode(port.primary).status, 'valid');
  }
});

test('future versions remain read-only without falling back to an older valid backup', async () => {
  for (const version of [2, 99]) {
    const port = new Port(); port.primary = JSON.stringify({ schemaVersion: version,
      keyboard: { futureHook: 'preserve' }, general: { futureWindow: 'preserve' } });
    port.backup = SettingsSchema.encode(SettingsSchema.defaults());
    const original = port.primary; const store = new SettingsStore(port, 0);
    const loaded = await store.load(); assert.equal(loaded.readOnly, true);
    assert.deepEqual(port.reads, ['primary']); assert.equal(port.writes.length, 0);
    assert.equal((await store.save(SettingsSchema.defaults())).status, 'blocked');
    assert.throws(() => store.acceptRecovery()); assert.equal(port.primary, original);
    assert.equal(SettingsSchema.decode(original).status, 'unsupported');
  }
});


test('readable density is default on restored old General; compact is explicit persisted and strict',()=>{
 const old={appOrientation:'auto',errorDisplayType:'snackbar'};
 assert.equal(GeneralConfiguration.fromJson(old).uiDensity,'readable');
 for(const uiDensity of ['readable','compact']){const cfg=SettingsSchema.defaults();cfg.general.uiDensity=uiDensity;const restored=SettingsSchema.decode(SettingsSchema.encode(cfg));assert.equal(restored.status,'valid');assert.equal(restored.configuration.general.uiDensity,uiDensity);assert.deepEqual(restored.configuration.outputs.targets,[]);}
 for(const uiDensity of [null,undefined,0,true,'Compact','dense','']){assert.ok(GeneralConfiguration.validate({...old,uiDensity}).length>0);}
 assert.equal(GeneralConfiguration.clone(new GeneralConfiguration()).uiDensity,'readable');
});
