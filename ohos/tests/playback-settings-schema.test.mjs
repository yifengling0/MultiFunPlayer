import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s, c, n) { return n(s.startsWith('.') && !/\.[a-z]+$/i.test(s) ? s + '.ts' : s, c); } });
const { SettingsSchema, PlaybackConfiguration } = await import('../entry/src/main/ets/settings/SettingsSchema.ts');
const decode = playback => SettingsSchema.decode(JSON.stringify({ schemaVersion: 1, playback }));

test('legacy schema 1 and unversioned snapshots migrate additively to safe playback defaults', () => {
  for (const input of ['{}', '{"schemaVersion":1}', '{"schemaVersion":1,"playback":{}}']) {
    const result = SettingsSchema.decode(input);
    assert.equal(result.status, 'valid');
    assert.deepEqual(result.configuration.playback, new PlaybackConfiguration());
    assert.ok(result.diagnostics.some(d => d.code === 'default_added'));
    assert.equal(SettingsSchema.decode(SettingsSchema.encode(result.configuration)).status, 'valid');
  }
});

test('playlist associations retain null versus empty, order, duplicates and unicode case', () => {
  for (const ids of [null, [], ['目录/A.funscript', 'a.funscript', '目录/A.funscript']]) {
    const config = SettingsSchema.defaults();
    Object.assign(config.playback, { playlistAssociations: ids, internalShuffling: true,
      internalAutoConnect: true, loadAdditionalScripts: true, autoSkipEnabled: false, autoSkipOffsetSeconds: -2.25 });
    const cloned = SettingsSchema.clone(config);
    assert.deepEqual(cloned.playback, config.playback);
    if (ids !== null) {
      assert.notEqual(cloned.playback.playlistAssociations, ids);
      cloned.playback.playlistAssociations.push('other.funscript');
      assert.notDeepEqual(cloned.playback.playlistAssociations, ids);
    }
  }
});

test('conflicting loop and shuffle restore in upstream order with loop winning', () => {
  const result = decode({ internalLooping: true, internalShuffling: true });
  assert.equal(result.status, 'valid');
  assert.equal(result.configuration.playback.internalLooping, true);
  assert.equal(result.configuration.playback.internalShuffling, false);
  assert.ok(result.diagnostics.some(d => d.code === 'loop_precedes_shuffle'));
  const value = new PlaybackConfiguration(); value.internalLooping = value.internalShuffling = true;
  assert.equal(PlaybackConfiguration.clone(value).internalShuffling, false);
  assert.equal(value.internalShuffling, true);
});

test('association budgets reject paths or URIs and preserve exact catalog identity without decoding', () => {
  for (const id of ['', '/absolute.funscript', '//host/file', 'file://a', 'https://a', 'C:/a', 'a\\b',
    '../a', './a', 'a/../b', 'a//b', 'a/', 'a\n', 'a\0', 'a\u0085', 'x'.repeat(4097), 1, null, {}]) {
    assert.equal(decode({ playlistAssociations: [id] }).status, 'invalid', JSON.stringify(id));
  }
  for (const ids of ['a', {}, 42, Array(257).fill('a')]) {
    assert.equal(decode({ playlistAssociations: ids }).status, 'invalid');
  }
  assert.equal(decode({ playlistAssociations: Array(256).fill('a') }).status, 'valid');
  assert.equal(decode({ playlistAssociations: ['a'.repeat(4096)] }).status, 'valid');
  // Percent sequences remain opaque and must only match catalog identities, never be URI-decoded/opened.
  const ids = ['%2e%2e/script.funscript'];
  assert.deepEqual(decode({ playlistAssociations: ids }).configuration.playback.playlistAssociations, ids);
});

test('playback validation rejects coercion, nonfinite offset and malformed objects before serialization', () => {
  for (const raw of [null, [], false, 'x', 1]) { assert.equal(decode(raw).status, 'invalid'); }
  for (const field of ['internalLooping', 'internalShuffling', 'internalAutoConnect', 'loadAdditionalScripts', 'autoSkipEnabled']) {
    for (const value of [null, 0, 1, 'false', [], {}]) {
      assert.equal(decode({ [field]: value }).status, 'invalid', field);
    }
  }
  for (const value of [null, '0', NaN, Infinity, -Infinity]) {
    const config = SettingsSchema.defaults(); config.playback.autoSkipOffsetSeconds = value;
    assert.throws(() => SettingsSchema.encode(config));
    assert.ok(PlaybackConfiguration.validate(config.playback).length > 0);
  }
  for (const value of [-Number.MAX_VALUE, -86401, -86400, -5, -.001, 0, 1, Number.MAX_VALUE]) {
    assert.equal(decode({ autoSkipOffsetSeconds: value }).status, 'valid');
  }
});

test('runtime fields and grants are not restored or emitted; forbidden keys rejected even in ignored fields', () => {
  const result = decode({ internalAutoConnect: true, connected: true, playing: true, armed: true,
    currentIndex: 2, positionSeconds: 55, abStart: 1, abEnd: 3, sourceUri: 'file:///secret', output: { enabled: true } });
  assert.equal(result.status, 'valid');
  const encoded = SettingsSchema.encode(result.configuration);
  for (const field of ['connected', 'playing', 'armed', 'currentIndex', 'positionSeconds', 'abStart', 'abEnd', 'output']) {
    assert.ok(!Object.hasOwn(JSON.parse(encoded).playback, field));
  }
  assert.equal(result.configuration.playback.internalAutoConnect, true);
  assert.ok(!encoded.includes('secret'));
  for (const field of ['__proto__', 'prototype', 'constructor', '$type']) {
    assert.equal(SettingsSchema.decode(`{"playback":{"ignored":{"${field}":{}}}}`).status, 'invalid');
  }
});

test('future schema stays unsupported with no migrated configuration or writable snapshot', () => {
  for (const version of [2, 99]) {
    const result = SettingsSchema.decode(JSON.stringify({ schemaVersion: version, playback: { internalAutoConnect: true } }));
    assert.equal(result.status, 'unsupported'); assert.equal(result.configuration, null);
    const config = SettingsSchema.defaults(); config.schemaVersion = version;
    assert.throws(() => SettingsSchema.encode(config), /Unsupported/);
  }
});
