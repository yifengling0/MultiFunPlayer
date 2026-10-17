import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s, c, n) { return n(s.startsWith('.') && !/\.[a-z]+$/i.test(s) ? s + '.ts' : s, c); } });
const { OutputConfiguration, SavedOutputTarget, SavedOutputDeviceRanges } =
  await import('../entry/src/main/ets/settings/OutputConfiguration.ts');
const { SettingsSchema } = await import('../entry/src/main/ets/settings/SettingsSchema.ts');
const { SettingsStore } = await import('../entry/src/main/ets/settings/SettingsStore.ts');

const axis = (axisId = 'L0', minimum = 0, maximum = 1, enabled = true) => ({ axisId, minimum, maximum, enabled });
const output = (kind = 'tcp', index = 0) => new SavedOutputTarget(kind, index);
const config = (...targets) => {
  const value = SettingsSchema.defaults(); value.outputs.targets = targets;
  value.outputs.selectedTargetId = targets[0]?.id ?? null; return value;
};
const decode = value => SettingsSchema.decode(JSON.stringify(value));
const encoded = value => JSON.parse(SettingsSchema.encode(value));
const badTarget = mutate => { const target = output(); mutate(target); return config(target); };
const invalidBoth = value => {
  assert.equal(decode(value).status, 'invalid');
  assert.throws(() => SettingsSchema.encode(value));
};

// The additive field must not change first-run behavior or settings recovery.
test('schema 1 additive outputs defaults to empty and selected null without any connection intent', () => {
  const before = encoded(SettingsSchema.defaults()); delete before.outputs;
  const loaded = decode(before);
  assert.equal(loaded.status, 'valid');
  assert.deepEqual(loaded.configuration.outputs, new OutputConfiguration());
  assert.ok(loaded.diagnostics.some(d => d.path === 'outputs' && d.code === 'default_added'));
  const current = SettingsSchema.decode(SettingsSchema.encode(loaded.configuration));
  assert.equal(current.status, 'valid'); assert.deepEqual(current.diagnostics, []);
  assert.deepEqual(Object.keys(current.configuration.outputs), ['targets', 'selectedTargetId']);
  assert.deepEqual(OutputConfiguration.fromJson(undefined), new OutputConfiguration());
});

test('target constructors supply safe empty endpoint drafts and source fixed-rate defaults', () => {
  for (const kind of ['tcp', 'udp', 'webSocket']) {
    const target = output(kind, 4);
    assert.equal(target.kind, kind); assert.equal(target.index, 4); assert.equal(target.id, `${kind}:4`);
    assert.equal(target.intervalMs, kind === 'webSocket' ? 16 : 10);
    assert.deepEqual([target.host, target.port, target.family, target.localPort, target.scheme, target.path], ['', 0, 1, 0, 'ws', '/']);
    assert.deepEqual(OutputConfiguration.validateTarget(target), []);
    assert.deepEqual([target.polled, target.dirtyOnly, target.offloadElapsed, target.pausedAutoHome, target.pausedMotion], [false, true, false, false, false]);
    assert.deepEqual(target.rangesByDevice, []);
    assert.deepEqual(encoded(config(target)).outputs.targets[0], JSON.parse(JSON.stringify(target)));
  }
});

test('all whitelisted target preferences roundtrip with insertion order and UI selection preserved', () => {
  const tcp = output('tcp', 7); tcp.host = '192.168.1.2'; tcp.port = 9000;
  const udp = output('udp', 2); udp.host = '2001:db8::3'; udp.port = 9001; udp.family = 2; udp.localPort = 9999;
  udp.polled = true; udp.intervalMs = 3; udp.dirtyOnly = false; udp.offloadElapsed = true;
  const ws = output('webSocket', 9); ws.name = '客厅 WebSocket'; ws.host = 'device.example'; ws.port = 443;
  ws.scheme = 'wss'; ws.path = '/output/v1~stream'; ws.pausedAutoHome = true; ws.pausedMotion = true; ws.intervalMs = 200;
  ws.rangesByDevice = [new SavedOutputDeviceRanges('TCode-0.3', [axis('L0', .2, .8), axis('A2', .4, .4, false)])];
  const value = config(tcp, udp, ws); value.outputs.selectedTargetId = ws.id;
  const roundtrip = SettingsSchema.clone(value);
  assert.deepEqual(roundtrip.outputs, value.outputs);
  assert.deepEqual(roundtrip.outputs.targets.map(t => t.id), ['tcp:7', 'udp:2', 'webSocket:9']);
  assert.equal(SettingsSchema.encode(roundtrip), SettingsSchema.encode(value));
  assert.equal(JSON.stringify(roundtrip.outputs).includes('autoConnect'), false);
});

test('clone and constructors deeply detach range data without adding any runtime identity', () => {
  const ranges = [axis('A2', .25, .75, false)];
  const target = output(); target.rangesByDevice = [new SavedOutputDeviceRanges('TCode-0.3', ranges)];
  ranges[0].minimum = .1;
  assert.equal(target.rangesByDevice[0].ranges[0].minimum, .25);
  const value = config(target); const cloned = OutputConfiguration.clone(value.outputs);
  cloned.targets[0].name = 'Edited'; cloned.targets[0].rangesByDevice[0].ranges[0].minimum = .2;
  cloned.targets[0].rangesByDevice.push(new SavedOutputDeviceRanges('TCode-0.2', [axis()]));
  assert.notEqual(target.name, 'Edited'); assert.equal(target.rangesByDevice.length, 1);
  assert.equal(target.rangesByDevice[0].ranges[0].minimum, .25);
  const targetCopy = OutputConfiguration.cloneTarget(target); targetCopy.rangesByDevice[0].ranges.length = 0;
  assert.equal(target.rangesByDevice[0].ranges.length, 1);
  const parsed = OutputConfiguration.fromJson(value.outputs); parsed.targets.length = 0;
  assert.equal(value.outputs.targets.length, 1);
  for (const runtime of ['armed', 'connected', 'socket', 'profileRevision', 'applicationId', 'editRevision', 'cache', 'autoConnectPolicy']) {
    assert.equal(JSON.stringify(value.outputs).includes(`"${runtime}"`), false);
  }
});

test('limits admit thirty targets, ten per kind, and retain indices rather than renumbering', () => {
  const targets = ['tcp', 'udp', 'webSocket'].flatMap(kind => Array.from({ length: 10 }, (_, i) => output(kind, i)));
  const value = config(...targets); value.outputs.selectedTargetId = 'webSocket:9';
  assert.equal(SettingsSchema.clone(value).outputs.targets.length, 30);
  value.outputs.targets.push(output()); invalidBoth(value);
  for (const index of [-1, 10, .5, NaN, Infinity, '1', null]) invalidBoth(badTarget(t => t.index = index));
  invalidBoth(badTarget(t => t.id = 'tcp:1'));
  invalidBoth(badTarget(t => { t.index = 1; t.id = 'TCP:1'; }));
  invalidBoth(config(output(), output()));
  const noncontiguous = config(output('tcp', 8), output('udp', 9));
  assert.deepEqual(SettingsSchema.clone(noncontiguous).outputs.targets.map(t => t.index), [8, 9]);
});

test('selection may be null but never reference an absent or fabricated target', () => {
  const value = config(output()); value.outputs.selectedTargetId = null;
  assert.equal(SettingsSchema.clone(value).outputs.selectedTargetId, null);
  for (const selected of ['', 'tcp:1', 'manual-network', 0, {}, 'tcp:0\n']) {
    value.outputs.selectedTargetId = selected; invalidBoth(value);
  }
  const empty = config(); empty.outputs.selectedTargetId = 'tcp:0'; invalidBoth(empty);
});

test('display labels and IDs are bounded and unambiguous', () => {
  const target = output(); target.name = 'n'.repeat(80);
  assert.equal(SettingsSchema.clone(config(target)).outputs.targets[0].name.length, 80);
  for (const name of ['', ' ', 'n'.repeat(81), '\nlabel', 'label\u0085', null, 4]) invalidBoth(badTarget(t => t.name = name));
  for (const id of ['', 'a'.repeat(65), 'tcp:０', 'tcp:0\u0000', 'tcp:00', null]) invalidBoth(badTarget(t => t.id = id));
});

test('raw hostname, IPv4 and IPv6 endpoint forms persist without URL parsing or IO', () => {
  const hosts = ['', 'localhost', 'device-1.local', 'UPPER.example', '127.0.0.1', '0.0.0.0', '255.255.255.255',
    '::', '::1', '2001:db8::1', '1:2:3:4:5:6:7:8', 'a'.repeat(63) + '.local'];
  for (const host of hosts) {
    const target = output(); target.host = host;
    assert.equal(SettingsSchema.clone(config(target)).outputs.targets[0].host, host);
  }
  const maximum = 'a'.repeat(63) + '.' + 'b'.repeat(63) + '.' + 'c'.repeat(63) + '.' + 'd'.repeat(61);
  assert.equal(maximum.length, 253);
  const target = output(); target.host = maximum;
  assert.deepEqual(OutputConfiguration.validateTarget(target), []);
  target.host += 'e'; assert.notDeepEqual(OutputConfiguration.validateTarget(target), []);
});

test('malformed hosts and endpoint credential carriers fail instead of being saved as drafts', () => {
  const hosts = ['ws://host', 'https://user:pass@host', 'user@host', 'host:1234', '[::1]', 'fe80::1%eth0',
    'host/path', 'host?token=secret', 'host#secret', 'host%3Fsecret', 'host\n', 'host name', '-host',
    'host-', 'a..b', '.host', 'host.', '256.0.0.1', '1.2.3', '01.2.3.4', 'a'.repeat(64),
    ':', ':1', '1:', ':::1', '1::2::3', '1:2:3:4:5:6:7', '1:2:3:4:5:6:7:8:9',
    '1:2:3:4:5:6:7::8', '12345::1', '::ffff:192.168.1.1', '☃.example', null, 4];
  for (const host of hosts) invalidBoth(badTarget(t => t.host = host));
});

test('ports and address family reject coercion, nonfinite values and out-of-range drafts', () => {
  for (const port of [0, 1, 65535]) {
    const target = output(); target.port = port; target.localPort = port;
    assert.deepEqual(OutputConfiguration.validateTarget(target), []);
  }
  for (const field of ['port', 'localPort']) {
    for (const value of [-1, 65536, .5, NaN, Infinity, '80', null, true]) invalidBoth(badTarget(t => t[field] = value));
  }
  for (const family of [0, 3, '1', null, NaN]) invalidBoth(badTarget(t => t.family = family));
  for (const scheme of ['', 'http', 'wss://', 'WS', null]) invalidBoth(badTarget(t => t.scheme = scheme));
});

test('WebSocket paths remain a native-compatible bounded credential-free subset', () => {
  for (const path of ['/', '/a-b_c.d/~channel', '/' + 'x'.repeat(1023)]) {
    const target = output('webSocket'); target.path = path;
    assert.equal(SettingsSchema.clone(config(target)).outputs.targets[0].path, path);
    assert.match(path, /^\/[A-Za-z0-9_./~!$&'()*+,;=:@-]*$/);
  }
  for (const path of ['', 'relative', '/' + 'x'.repeat(1024), '/?token=secret', '/#secret', '/%3Ftoken', '/%252F',
    'ws://host/path', '/user:pass@host', '/token/secret', '/TOKEN/secret', '/password/value', '/access_token/value',
    '/api_key/value', '/auth/session', '/stream;token=secret', '/a\r\nAuthorization:secret', '/a\\b', '/white space', null]) {
    invalidBoth(badTarget(t => t.path = path));
  }
});

test('fixed policy intervals retain source bounds even when polled mode is selected', () => {
  for (const kind of ['tcp', 'udp', 'webSocket']) {
    const min = kind === 'webSocket' ? 16 : 3; const max = kind === 'webSocket' ? 200 : 33;
    for (const intervalMs of [min, (min + max) / 2, max]) {
      const target = output(kind); target.intervalMs = intervalMs; target.polled = true;
      assert.equal(SettingsSchema.clone(config(target)).outputs.targets[0].intervalMs, intervalMs);
    }
    for (const intervalMs of [0, min - .1, max + .1, NaN, Infinity, '16', null]) {
      const target = output(kind); target.intervalMs = intervalMs; target.polled = true; invalidBoth(config(target));
    }
  }
  for (const field of ['polled', 'dirtyOnly', 'offloadElapsed', 'pausedAutoHome', 'pausedMotion']) {
    for (const value of [0, 1, null, 'true']) invalidBoth(badTarget(t => t[field] = value));
  }
});

test('per-device ranges preserve disabled and degenerate entries across profile selection', () => {
  const target = output(); target.rangesByDevice = [
    new SavedOutputDeviceRanges('TCode-0.2', [axis('L0', .25, .25, true)]),
    new SavedOutputDeviceRanges('TCode-0.3', [axis('L0', .2, .8), axis('A2', .1, .7, false)])
  ];
  const value = config(target); value.devices[1].axes.find(a => a.name === 'A2').enabled = false;
  value.selectedDeviceId = 'TCode-0.2';
  const result = SettingsSchema.clone(value);
  assert.deepEqual(result.outputs.targets[0].rangesByDevice, target.rangesByDevice);
  result.selectedDeviceId = 'TCode-0.3';
  assert.deepEqual(SettingsSchema.clone(result).outputs.targets[0].rangesByDevice, target.rangesByDevice);
});

test('per-target range arrays are bounded to 32 devices and 32 unique axes', () => {
  const ranges = Array.from({ length: 32 }, (_, i) => axis(String.fromCharCode(65 + Math.floor(i / 10)) + i % 10));
  const target = output(); target.rangesByDevice = Array.from({ length: 32 }, (_, i) => new SavedOutputDeviceRanges(`device-${i}`, ranges));
  assert.deepEqual(OutputConfiguration.validateTarget(target), []);
  assert.equal(SettingsSchema.clone(config(target)).outputs.targets[0].rangesByDevice.length, 32);
  target.rangesByDevice.push(new SavedOutputDeviceRanges('overflow')); invalidBoth(config(target));
  target.rangesByDevice.pop(); target.rangesByDevice[0].ranges.push(axis('Z9')); invalidBoth(config(target));
  target.rangesByDevice[0].ranges.pop(); target.rangesByDevice[1].deviceId = target.rangesByDevice[0].deviceId; invalidBoth(config(target));
});

test('malformed ranges are rejected without clamping, coercion, or dropping disabled data', () => {
  const targetWithRange = mutate => {
    const target = output(); target.rangesByDevice = [new SavedOutputDeviceRanges('TCode-0.3', [axis('A2', .2, .8, false)])];
    mutate(target.rangesByDevice[0]); return config(target);
  };
  for (const deviceId of ['', ' ', 'x'.repeat(257), 'device\n', null]) invalidBoth(targetWithRange(d => d.deviceId = deviceId));
  for (const axisId of ['', 'l0', 'A10', 'AB', 'A0\n', null]) invalidBoth(targetWithRange(d => d.ranges[0].axisId = axisId));
  for (const mutate of [r => r.minimum = -.1, r => r.maximum = 1.1, r => r.minimum = 1.1, r => r.maximum = -.1,
    r => r.minimum = NaN, r => r.maximum = Infinity, r => r.minimum = '0', r => r.enabled = 0]) {
    invalidBoth(targetWithRange(d => mutate(d.ranges[0])));
  }
  invalidBoth(targetWithRange(d => d.ranges.push(axis('A2'))));
  invalidBoth(targetWithRange(d => d.ranges = null));
});

test('all nested output objects reject unknown, runtime-only and secret fields on both import and save', () => {
  const fields = ['autoConnect', 'autoConnectPolicy', 'armed', 'connected', 'socket', 'cache', 'applicationId', 'editRevision',
    'profileRevision', 'connectionGeneration', 'token', 'password', 'headers', 'authorization', 'credentials', 'futureField'];
  for (const field of fields) {
    const value = config(output()); value.outputs.targets[0][field] = 'must-not-persist'; invalidBoth(value);
    const root = config(); root.outputs[field] = 'must-not-persist'; invalidBoth(root);
  }
  for (const level of ['device', 'range']) {
    const target = output(); target.rangesByDevice = [new SavedOutputDeviceRanges('TCode-0.3', [axis()])];
    (level === 'device' ? target.rangesByDevice[0] : target.rangesByDevice[0].ranges[0]).profileRevision = 12;
    invalidBoth(config(target));
  }
  const value = config(output()); value.outputs.targets[0].password = 'very-sensitive';
  const result = decode(value); assert.equal(result.status, 'invalid');
  assert.equal(JSON.stringify(result.diagnostics).includes('very-sensitive'), false);
});

test('prototype keys and malformed or incomplete output objects fail closed', () => {
  for (const section of [null, [], 42, {}, { targets: [] }, { selectedTargetId: null }, { targets: {}, selectedTargetId: null }]) {
    const value = config(); value.outputs = section; invalidBoth(value);
  }
  for (const target of [null, [], 42, {}, { kind: 'tcp', id: 'tcp:0', index: 0 }, { ...output(), rangesByDevice: [null] }]) {
    invalidBoth(config(target));
  }
  for (const key of ['__proto__', 'prototype', 'constructor', '$type']) {
    const value = config(output());
    const raw = JSON.stringify(value).replace('"host":""', `"host":"","${key}":{}`);
    assert.equal(SettingsSchema.decode(raw).status, 'invalid');
  }
  assert.notDeepEqual(OutputConfiguration.validate(null), []);
  assert.notDeepEqual(OutputConfiguration.validateTarget(null), []);
});

test('unsupported schema protection takes precedence over output decoding and backup recovery', async () => {
  const source = JSON.stringify({ schemaVersion: 99, outputs: { token: 'untouched-future-data' } });
  assert.equal(SettingsSchema.decode(source).status, 'unsupported');
  const port = { reads: [], writes: [], async read(slot) { this.reads.push(slot); return slot === 'primary' ? source : SettingsSchema.encode(config(output())); },
    async writeAtomic(...args) { this.writes.push(args); } };
  const store = new SettingsStore(port, 0); const result = await store.load();
  assert.equal(result.readOnly, true); assert.deepEqual(port.reads, ['primary']); assert.equal(port.writes.length, 0);
  assert.equal((await store.save(config(output()))).status, 'blocked'); assert.equal(port.writes.length, 0);
});

test('unsafe output primary recovers backup without writes until explicit recovery acceptance', async () => {
  const primary = JSON.stringify(badTarget(t => t.headers = { authorization: 'must-not-persist' }));
  const backup = SettingsSchema.encode(config(output('udp', 4)));
  const port = { writes: [], async read(slot) { return slot === 'primary' ? primary : backup; }, async writeAtomic(...args) { this.writes.push(args); } };
  const store = new SettingsStore(port, 0); const loaded = await store.load();
  assert.equal(loaded.source, 'backup'); assert.equal(loaded.recoveryRequired, true);
  assert.equal(loaded.configuration.outputs.targets[0].id, 'udp:4'); assert.equal(port.writes.length, 0);
  assert.equal((await store.save(config(output()))).status, 'blocked'); assert.equal(port.writes.length, 0);
  store.acceptRecovery(); assert.equal((await store.save(config(output('tcp', 2)))).status, 'saved');
  assert.equal(port.writes.length, 1); assert.equal(JSON.stringify(port.writes).includes('must-not-persist'), false);
});

test('pre-0.15 target settings omit only additive pausedManual and restore it false', () => {
  const previous = config(output()); delete previous.outputs.targets[0].pausedManual;
  const loaded = decode(previous); assert.equal(loaded.status, 'valid');
  assert.equal(loaded.configuration.outputs.targets[0].pausedManual, false);
  assert.equal(OutputConfiguration.clone(previous.outputs).targets[0].pausedManual, false);
  assert.equal(OutputConfiguration.cloneTarget(previous.outputs.targets[0]).pausedManual, false);
  assert.equal(encoded(loaded.configuration).outputs.targets[0].pausedManual, false);
  assert.equal(Object.hasOwn(previous.outputs.targets[0], 'pausedManual'), false);
});

test('pausedManual is a separate false-by-default persisted boolean with strict malformed rejection', () => {
  assert.equal(output().pausedManual, false);
  for (const pausedManual of [false, true]) {
    const target = output(); target.pausedManual = pausedManual;
    const loaded = decode(config(target)); assert.equal(loaded.status, 'valid');
    assert.equal(loaded.configuration.outputs.targets[0].pausedManual, pausedManual);
    assert.equal(loaded.configuration.outputs.targets[0].pausedMotion, false);
    assert.equal(loaded.configuration.outputs.targets[0].pausedAutoHome, false);
    assert.equal(encoded(config(target)).outputs.targets[0].pausedManual, pausedManual);
  }
  for (const value of [null, 0, 1, 'true', 'false', {}, []]) invalidBoth(badTarget(t => t.pausedManual = value));
  const undefinedField = output(); undefinedField.pausedManual = undefined;
  assert.throws(() => OutputConfiguration.cloneTarget(undefinedField), /boolean/);
});

test('adding pausedManual never makes any pre-existing target field optional', () => {
  const fields = Object.keys(output()).filter(field => field !== 'pausedManual');
  for (const field of fields) {
    const value = badTarget(t => { delete t[field]; delete t.pausedManual; });
    assert.equal(decode(value).status, 'invalid', field);
    assert.throws(() => SettingsSchema.encode(value), undefined, field);
  }
});
