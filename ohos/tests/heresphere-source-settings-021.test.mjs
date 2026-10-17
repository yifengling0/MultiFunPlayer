import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, next) {
  return next(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? specifier + '.ts' : specifier, context);
} });
const { MediaSourceConfiguration, HereSphereEndpointConfiguration } = await import('../entry/src/main/ets/settings/MediaSourceConfiguration.ts');
const { SettingsSchema } = await import('../entry/src/main/ets/settings/SettingsSchema.ts');
const { SettingsStore } = await import('../entry/src/main/ets/settings/SettingsStore.ts');
const endpoint = () => ({ host: '127.0.0.1', port: 23554 });
const raw = () => ({ selectedSource: 'heresphere', deoVr: endpoint(), hereSphere: endpoint() });
const decode = mediaSources => SettingsSchema.decode(JSON.stringify({ schemaVersion: 1, mediaSources }));

test('older schema 1 adds the missing HereSphere section without losing existing preferences', () => {
  for (const selectedSource of ['internal', 'deovr']) {
    const old = { selectedSource, deoVr: { host: 'Existing-Player.local', port: 12345 } };
    const loaded = decode(old); assert.equal(loaded.status, 'valid');
    assert.equal(loaded.configuration.mediaSources.selectedSource, selectedSource);
    assert.deepEqual(JSON.parse(JSON.stringify(loaded.configuration.mediaSources.deoVr)), old.deoVr);
    assert.deepEqual(loaded.configuration.mediaSources.hereSphere, new HereSphereEndpointConfiguration());
    const encoded = JSON.parse(SettingsSchema.encode(loaded.configuration)).mediaSources;
    assert.deepEqual(encoded, { ...old, hereSphere: endpoint() });
    assert.deepEqual(Object.keys(old).sort(), ['deoVr', 'selectedSource']);
  }
});

test('HereSphere selection and both independent endpoints round trip as detached inert configuration', () => {
  const configuration = SettingsSchema.defaults(); configuration.mediaSources.selectedSource = 'heresphere';
  configuration.mediaSources.deoVr.host = 'deo.local'; configuration.mediaSources.deoVr.port = 12345;
  configuration.mediaSources.hereSphere.host = 'sphere.local'; configuration.mediaSources.hereSphere.port = 54321;
  const encoded = SettingsSchema.encode(configuration), cloned = SettingsSchema.clone(configuration);
  const loaded = SettingsSchema.decode(encoded); assert.equal(loaded.status, 'valid');
  assert.deepEqual(loaded.configuration.mediaSources, configuration.mediaSources);
  assert.deepEqual(cloned.mediaSources, configuration.mediaSources);
  assert.notEqual(cloned.mediaSources, configuration.mediaSources);
  assert.notEqual(cloned.mediaSources.hereSphere, configuration.mediaSources.hereSphere);
  assert.notEqual(cloned.mediaSources.deoVr, configuration.mediaSources.deoVr);
  cloned.mediaSources.hereSphere.host = 'changed.local'; cloned.mediaSources.deoVr.port = 1;
  assert.equal(configuration.mediaSources.hereSphere.host, 'sphere.local'); assert.equal(configuration.mediaSources.deoVr.port, 12345);
  const saved = JSON.parse(encoded).mediaSources;
  assert.deepEqual(Object.keys(saved).sort(), ['deoVr', 'hereSphere', 'selectedSource']);
  assert.deepEqual(Object.keys(saved.hereSphere).sort(), ['host', 'port']);
});

test('new in-memory configurations are exact even though legacy files may omit HereSphere', () => {
  const old = { selectedSource: 'deovr', deoVr: endpoint() };
  assert.equal(MediaSourceConfiguration.validate(old).length, 1);
  assert.throws(() => MediaSourceConfiguration.clone(old), /missing/);
  const configuration = SettingsSchema.defaults(); delete configuration.mediaSources.hereSphere;
  assert.throws(() => SettingsSchema.encode(configuration), /missing/);
  for (const value of [undefined, null, [], false, 0, '', {}, { host: 'localhost' }, { port: 23554 }]) {
    const input = { ...raw(), hereSphere: value };
    assert.equal(MediaSourceConfiguration.validate(input).length, 1, JSON.stringify(value));
    assert.throws(() => MediaSourceConfiguration.fromJson(input));
    if (value !== undefined) assert.equal(decode(input).status, 'invalid');
  }
  for (const selectedSource of ['HereSphere', 'hereSphere', 'HERESPHERE', 'remote', '']) {
    assert.equal(decode({ ...raw(), selectedSource }).status, 'invalid');
  }
});

test('HereSphere rejects credentials, runtime fields and unsupported configuration at every boundary', () => {
  for (const key of ['autoConnect', 'connected', 'busy', 'armed', 'playing', 'generation', 'positionSeconds', 'mediaPath', 'future', 'credentials']) {
    assert.equal(decode({ ...raw(), [key]: true }).status, 'invalid', key);
  }
  for (const key of ['family', 'username', 'password', 'token', 'url', 'path', 'autoConnect', 'armed', 'connected', 'future']) {
    assert.equal(decode({ ...raw(), hereSphere: { ...endpoint(), [key]: 'secret' } }).status, 'invalid', key);
  }
  for (const key of ['__proto__', 'constructor', 'prototype', '$type']) {
    const json = `{"schemaVersion":1,"mediaSources":{"selectedSource":"heresphere","deoVr":{"host":"localhost","port":1},"hereSphere":{"host":"localhost","port":2,"${key}":{}}}}`;
    assert.equal(SettingsSchema.decode(json).status, 'invalid');
  }
});

test('HereSphere validates raw bounded IPv4, IPv6 and DNS independently of DeoVR', () => {
  for (const host of ['localhost', 'Player-One.local', '192.168.1.1', '::1', '2001:db8::1', '::ffff:192.168.1.1']) {
    for (const port of [1, 23554, 65535]) assert.equal(decode({ ...raw(), hereSphere: { host, port } }).status, 'valid');
  }
  for (const host of ['', ' host', 'host ', 'https://host', 'user:pass@host', 'host/path', 'host?token=secret', '[::1]', 'host:23554',
    'fe80::1%eth0', '999.1.2.3', '1:::2', 'host\0', 'a'.repeat(254), null, 123]) {
    assert.equal(decode({ ...raw(), hereSphere: { host, port: 23554 } }).status, 'invalid', JSON.stringify(host));
  }
  for (const port of [0, -1, 65536, .5, '23554', false, NaN, Infinity, -Infinity, null]) {
    assert.equal(MediaSourceConfiguration.validate({ ...raw(), hereSphere: { host: 'localhost', port } }).length, 1);
  }
  assert.equal(decode({ ...raw(), deoVr: { host: 'http://invalid', port: 23554 } }).status, 'invalid');
});

test('loading HereSphere preferences never writes, opens connections or creates runtime permission fields', async () => {
  const writes = [], reads = [];
  const store = new SettingsStore({
    async read(slot) { reads.push(slot); return JSON.stringify({ schemaVersion: 1, mediaSources: raw() }); },
    async writeAtomic(...values) { writes.push(values); }
  }, 0);
  const loaded = await store.load(); assert.equal(loaded.readOnly, false); assert.equal(loaded.recoveryRequired, false);
  assert.equal(loaded.configuration.mediaSources.selectedSource, 'heresphere');
  assert.deepEqual(reads, ['primary']); assert.deepEqual(writes, []);
  assert.deepEqual(Object.keys(store.snapshot().mediaSources).sort(), ['deoVr', 'hereSphere', 'selectedSource']);
  const source = readFileSync(new URL('../entry/src/main/ets/settings/MediaSourceConfiguration.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(?:connect|send|arm|play)\s*\(|TCPSocket|WebSocket|setInterval|setTimeout|Session/);
});
