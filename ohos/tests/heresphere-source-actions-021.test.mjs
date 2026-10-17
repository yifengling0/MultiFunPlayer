import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, next) {
  return next(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? specifier + '.ts' : specifier, context);
} });
const { ShortcutAction, shortcutActionCatalog, validateShortcutAction, KeyboardShortcutConfiguration, KeyboardShortcutMapping } =
  await import('../entry/src/main/ets/input/ShortcutConfiguration.ts');
const { parseMediaSourceShortcut } = await import('../entry/src/main/ets/input/ShortcutSourceActions.ts');
const { LocalShortcutEngine } = await import('../entry/src/main/ets/input/LocalShortcutEngine.ts');
const { SettingsSchema } = await import('../entry/src/main/ets/settings/SettingsSchema.ts');
const readOriginal = path => readFileSync(new URL('../../Source/MultiFunPlayer/' + path, import.meta.url), 'utf8');

test('0.21 adds exactly four HereSphere action names with original source registrations', () => {
  const expected = ['HereSphere::Endpoint::Set', ...['Toggle', 'Connect', 'Disconnect'].map(command => 'HereSphere::Connection::' + command)];
  const catalog = shortcutActionCatalog(); assert.equal(catalog.length, 182); assert.equal(new Set(catalog.map(item => item.id)).size, 182);
  assert.deepEqual(catalog.filter(item => item.id.startsWith('HereSphere::')).map(item => item.id), expected);
  for (const spec of catalog.filter(item => expected.includes(item.id))) {
    assert.equal(spec.originalName, spec.id); assert.equal(spec.category, 'source');
    assert.equal(spec.targetAxis, false); assert.equal(spec.targetOutput, false); assert.equal(spec.pointsKind, 'none');
    assert.equal(spec.managedScript, false); assert.equal(spec.valueKind, spec.id.includes('Endpoint') ? 'text' : 'none');
  }
  const endpoint = readOriginal('MediaSource/ViewModels/HereSphereMediaSource.cs');
  assert.ok(endpoint.includes('[DisplayName("HereSphere")]'));
  assert.ok(endpoint.includes('public EndPoint Endpoint { get; set; } = new IPEndPoint(IPAddress.Loopback, 23554)'));
  assert.ok(endpoint.includes('s.RegisterAction<string>($"{Name}::Endpoint::Set"'));
  assert.match(endpoint, /if \(NetUtils\.TryParseEndpoint\(endpointString, out var endpoint\)\)\s+Endpoint = endpoint;/);
  const connections = readOriginal('UI/Controls/ViewModels/MediaSourceViewModel.cs');
  assert.ok(connections.includes('foreach (var source in AvailableSources)'));
  for (const command of ['Toggle', 'Connect', 'Disconnect']) {
    assert.ok(connections.includes('s.RegisterAction($"{source.Name}::Connection::' + command + '"'));
  }
  assert.match(connections, /Connection::Toggle", async \(\) => await ToggleConnectAsync\(source\)/);
  assert.match(connections, /Connection::Connect"[\s\S]*?if \(_currentSource != source\)\s+await ConnectAndSetAsCurrentSourceAsync\(source, token\)/);
  assert.match(connections, /Connection::Disconnect"[\s\S]*?if \(_currentSource == source\)\s+await DisconnectCurrentSourceAsync\(token\)/);
});

test('every source connection action parses to an exact explicit source and command without endpoint fallback', () => {
  for (const [prefix, source] of [['Internal', 'internal'], ['DeoVR', 'deovr'], ['HereSphere', 'heresphere']]) {
    for (const command of ['Toggle', 'Connect', 'Disconnect']) {
      const action = new ShortcutAction(prefix + '::Connection::' + command); assert.equal(validateShortcutAction(action), true);
      assert.deepEqual(JSON.parse(JSON.stringify(parseMediaSourceShortcut(action))), {
        kind: 'connection', source, command: command.toLowerCase(), endpoint: null
      });
    }
  }
  assert.equal(parseMediaSourceShortcut(new ShortcutAction('Media::PlayPause::Toggle')), null);
  assert.equal(parseMediaSourceShortcut(new ShortcutAction('App::Stop')), null);
});

test('HereSphere and DeoVR endpoint parsing returns only a validated detached endpoint intent', () => {
  for (const [prefix, source] of [['DeoVR', 'deovr'], ['HereSphere', 'heresphere']]) {
    for (const [text, expected] of [['sphere.local:23554', { host: 'sphere.local', port: 23554 }],
      ['127.0.0.1:1', { host: '127.0.0.1', port: 1 }], ['[::1]:65535', { host: '::1', port: 65535 }],
      ['InterNetworkV6/[2001:db8::1]:34567', { host: '2001:db8::1', port: 34567 }]]) {
      const action = new ShortcutAction(prefix + '::Endpoint::Set', 0, '', 0, text);
      const parsed = parseMediaSourceShortcut(action); action.text = 'changed.local:12345';
      assert.deepEqual(JSON.parse(JSON.stringify(parsed)), { kind: 'endpoint', source, command: null, endpoint: expected });
    }
  }
});

test('unsupported auto-connect and forged source identities cannot enter the action boundary', () => {
  for (const id of ['HereSphere::AutoConnectEnabled::Set', 'HereSphere::AutoConnectEnabled::Toggle', 'HereSphere::Arm',
    'HereSphere::Connection::connect', 'heresphere::Connection::Connect', 'HereSphere::Endpoint::Offset', 'Internal::Endpoint::Set']) {
    const action = new ShortcutAction(id); assert.equal(validateShortcutAction(action), false); assert.throws(() => parseMediaSourceShortcut(action));
  }
  for (const property of ['source', 'selectedSource', 'connected', 'armed', 'credentials']) {
    const action = new ShortcutAction('HereSphere::Connection::Connect'); action[property] = 'deovr';
    assert.equal(validateShortcutAction(action), false); assert.throws(() => parseMediaSourceShortcut(action));
  }
  for (const text of ['https://host:23554', 'user:password@host:23554', 'host/path:23554', 'host?token=secret:23554',
    'host:0', 'host:65536', 'host:1.5', ' host:23554', 'host:23554\n', 'host', 'x'.repeat(281)]) {
    assert.throws(() => parseMediaSourceShortcut(new ShortcutAction('HereSphere::Endpoint::Set', 0, '', 0, text)), text);
  }
});

test('HereSphere keyboard mapping round trips inertly and emits only an explicit original action', () => {
  const configuration = SettingsSchema.defaults(); configuration.mediaSources.selectedSource = 'deovr';
  const mapping = new KeyboardShortcutMapping('here-connect', 'HereSphere explicit connect'); mapping.keys = [2017];
  mapping.actions = [new ShortcutAction('HereSphere::Connection::Connect')]; configuration.keyboard.mappings = [mapping];
  const decoded = SettingsSchema.decode(SettingsSchema.encode(configuration)); assert.equal(decoded.status, 'valid');
  assert.equal(decoded.configuration.mediaSources.selectedSource, 'deovr');
  const keyboard = new LocalShortcutEngine(KeyboardShortcutConfiguration.clone(decoded.configuration.keyboard));
  assert.equal(keyboard.nextDeadlineMs(), null);
  const dispatch = keyboard.keyEvent({ keyCode: 2017, pressed: true }, 0); assert.equal(dispatch.length, 1);
  assert.equal(parseMediaSourceShortcut(dispatch[0].actions[0]).source, 'heresphere');
  assert.equal(configuration.mediaSources.selectedSource, 'deovr');
  keyboard.reset('stop'); assert.equal(keyboard.isDispatchCurrent(dispatch[0]), false);
  const source = readFileSync(new URL('../entry/src/main/ets/input/ShortcutSourceActions.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /selectedSource|\b(?:connect|send|arm|play)\s*\(|TCPSocket|WebSocket|setInterval|setTimeout|Session/);
});
