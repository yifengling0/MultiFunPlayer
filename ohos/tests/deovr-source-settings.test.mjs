import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, next) {
  return next(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? specifier + '.ts' : specifier, context);
} });
const { MediaSourceConfiguration, DeoVrEndpointConfiguration } = await import('../entry/src/main/ets/settings/MediaSourceConfiguration.ts');
const { SettingsSchema } = await import('../entry/src/main/ets/settings/SettingsSchema.ts');
const { SettingsStore } = await import('../entry/src/main/ets/settings/SettingsStore.ts');
const raw = () => ({ selectedSource: 'internal', deoVr: { host: '127.0.0.1', port: 23554 } });
const decode = mediaSources => SettingsSchema.decode(JSON.stringify({ schemaVersion: 1, mediaSources }));

test('schema 1 gains only inert media source defaults when the whole section is absent', () => {
  for (const json of ['{}', '{"schemaVersion":1}', JSON.stringify({ schemaVersion: 1, playback: { internalAutoConnect: true } })]) {
    const result = SettingsSchema.decode(json);
    assert.equal(result.status, 'valid');
    assert.deepEqual(result.configuration.mediaSources, new MediaSourceConfiguration());
    assert.deepEqual(JSON.parse(JSON.stringify(new DeoVrEndpointConfiguration())), { host: '127.0.0.1', port: 23554 });
    assert.ok(result.diagnostics.some(d => d.path === 'mediaSources' && d.code === 'default_added'));
    assert.equal(SettingsSchema.decode(SettingsSchema.encode(result.configuration)).status, 'valid');
  }
});

test('source and endpoint round trip exactly as detached preferences without runtime state', () => {
  const value = SettingsSchema.defaults(); value.mediaSources.selectedSource = 'deovr';
  value.mediaSources.deoVr.host = 'Player-One.local'; value.mediaSources.deoVr.port = 45678;
  const encoded = SettingsSchema.encode(value); const cloned = SettingsSchema.clone(value);
  assert.deepEqual(JSON.parse(encoded).mediaSources, JSON.parse(JSON.stringify(value.mediaSources)));
  assert.deepEqual(cloned.mediaSources, value.mediaSources);
  assert.notEqual(cloned.mediaSources, value.mediaSources); assert.notEqual(cloned.mediaSources.deoVr, value.mediaSources.deoVr);
  cloned.mediaSources.deoVr.host = 'other.local'; cloned.mediaSources.selectedSource = 'internal';
  assert.equal(value.mediaSources.deoVr.host, 'Player-One.local'); assert.equal(value.mediaSources.selectedSource, 'deovr');
  assert.deepEqual(Object.keys(JSON.parse(encoded).mediaSources).sort(), ['deoVr', 'hereSphere', 'selectedSource']);
  assert.deepEqual(Object.keys(JSON.parse(encoded).mediaSources.deoVr).sort(), ['host', 'port']);
});

test('present mediaSources is complete, exact and rejects runtime, credential and future fields', () => {
  for (const value of [null, [], false, '', 1, {}, { selectedSource: 'deovr' }, { deoVr: raw().deoVr }]) {
    assert.equal(decode(value).status, 'invalid', JSON.stringify(value));
  }
  for (const selectedSource of ['DeoVR', 'native', 'download', '', null, 0, true]) {
    assert.equal(decode({ ...raw(), selectedSource }).status, 'invalid');
  }
  for (const field of ['autoConnect', 'connected', 'busy', 'armed', 'playing', 'positionSeconds', 'mediaPath', 'generation', 'credentials', 'future']) {
    assert.equal(decode({ ...raw(), [field]: true }).status, 'invalid', field);
  }
  for (const deoVr of [null, [], '', 1, {}, { host: '127.0.0.1' }, { port: 23554 }]) {
    assert.equal(decode({ ...raw(), deoVr }).status, 'invalid');
  }
  for (const field of ['family', 'password', 'token', 'username', 'url', 'path', 'connected', 'autoConnect', 'future']) {
    assert.equal(decode({ ...raw(), deoVr: { ...raw().deoVr, [field]: 'secret' } }).status, 'invalid', field);
  }
});

test('host accepts bounded raw hostnames and IPv4/IPv6 while rejecting URL/credential/invalid address forms', () => {
  for (const host of ['localhost', 'Player-One.local', '192.168.1.25', '0.0.0.0', '255.255.255.255', '::1', '2001:db8::1',
    '1:2:3:4:5:6:7:8', '::ffff:192.168.1.1', 'a'.repeat(63) + '.' + 'b'.repeat(63) + '.' + 'c'.repeat(63) + '.' + 'd'.repeat(61)]) {
    assert.equal(decode({ ...raw(), deoVr: { host, port: 23554 } }).status, 'valid', host);
  }
  for (const host of ['', ' localhost', 'localhost ', 'host\n', 'host\0', 'https://host', 'tcp://host', 'user:pass@host',
    'host:23554', '[::1]', 'fe80::1%eth0', 'host/path', 'host?token=secret', 'host#secret', '../host', 'host\\path',
    '-host', 'host-', 'host..local', 'host.-bad', 'host.bad-', 'a'.repeat(64) + '.local', 'a'.repeat(254),
    '999.1.2.3', '1.2.3', '1.2.3.4.5', '1:::2', '::::', '1:2:3', '1:2:3:4:5:6:7:8:9', '1:2:3:4:5:6:7:8::',
    '::ffff:999.1.2.3', '凭据.local', null, 123]) {
    assert.equal(decode({ ...raw(), deoVr: { host, port: 23554 } }).status, 'invalid', JSON.stringify(host));
  }
});

test('ports reject coercion, fractions and nonfinite values before serialization', () => {
  for (const port of [1, 23554, 65535]) assert.equal(decode({ ...raw(), deoVr: { host: 'localhost', port } }).status, 'valid');
  for (const port of [0, -1, 65536, .5, null, '23554', false, NaN, Infinity, -Infinity]) {
    const configuration = SettingsSchema.defaults(); configuration.mediaSources.deoVr.port = port;
    assert.ok(MediaSourceConfiguration.validate(configuration.mediaSources).length > 0);
    assert.throws(() => SettingsSchema.encode(configuration));
  }
});

test('prototype pollution is rejected throughout mediaSources without producing a writable snapshot', () => {
  for (const key of ['__proto__', 'constructor', 'prototype', '$type']) {
    const json = `{"schemaVersion":1,"mediaSources":{"selectedSource":"internal","deoVr":{"host":"127.0.0.1","port":23554,"${key}":{}}}}`;
    assert.equal(SettingsSchema.decode(json).status, 'invalid');
  }
});

class Port {
  primary = null; backup = null; reads = []; writes = []; failRead = false;
  async read(slot) { this.reads.push(slot); if (this.failRead) throw Error('read denied'); return this[slot]; }
  async writeAtomic(json, previous) { this.writes.push({ json, previous }); this.primary = json; }
}

test('restoring DeoVR selection or old schema never writes and does not invent any runtime field', async () => {
  for (const mediaSources of [undefined, { ...raw(), selectedSource: 'deovr' }]) {
    const port = new Port(); port.primary = JSON.stringify({ schemaVersion: 1, mediaSources });
    const store = new SettingsStore(port, 0); const loaded = await store.load();
    assert.equal(loaded.readOnly, false); assert.equal(loaded.recoveryRequired, false);
    assert.equal(loaded.configuration.mediaSources.selectedSource, mediaSources?.selectedSource ?? 'internal');
    assert.deepEqual(port.writes, []); assert.deepEqual(port.reads, ['primary']);
    assert.deepEqual(Object.keys(store.snapshot().mediaSources).sort(), ['deoVr', 'hereSphere', 'selectedSource']);
  }
});

test('future schema and unreadable files retain existing read-only preservation behavior', async () => {
  for (const denied of [false, true]) {
    const port = new Port(); port.primary = '{"schemaVersion":99,"mediaSources":{"future":"preserve"}}'; port.failRead = denied;
    const original = port.primary; const store = new SettingsStore(port, 0); const loaded = await store.load();
    assert.equal(loaded.readOnly, true); assert.equal((await store.save(SettingsSchema.defaults())).status, 'blocked');
    assert.throws(() => store.acceptRecovery()); assert.deepEqual(port.reads, ['primary']);
    assert.deepEqual(port.writes, []); assert.equal(port.primary, original);
  }
  const future = SettingsSchema.defaults(); future.schemaVersion = 2;
  assert.equal(SettingsSchema.decode(JSON.stringify(future)).status, 'unsupported');
  assert.throws(() => SettingsSchema.encode(future), /Unsupported/);
});

test('malformed new section recovers only with existing explicit recovery acceptance', async () => {
  const port = new Port(); port.primary = JSON.stringify({ schemaVersion: 1, mediaSources: { ...raw(), autoConnect: true } });
  const original = port.primary; const store = new SettingsStore(port, 0); const loaded = await store.load();
  assert.equal(loaded.recoveryRequired, true); assert.equal(loaded.readOnly, false);
  assert.equal((await store.save(SettingsSchema.defaults())).status, 'blocked');
  assert.equal(port.primary, original); assert.deepEqual(port.writes, []);
});
