import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s, c, n) { return n(s.startsWith('.') && !/\.[a-z]+$/i.test(s) ? s + '.ts' : s, c); } });
const { ShortcutAction, shortcutActionCatalog, defaultShortcutAction, cloneShortcutAction, validateShortcutAction } =
  await import('../entry/src/main/ets/input/ShortcutConfiguration.ts');
const { OutputSettingsDraft } = await import('../entry/src/main/ets/output/OutputSettingsModel.ts');
const { applyOutputEndpointAction, isOutputEndpointAction, outputConnectionOperation, validateOutputConnectionDraft } =
  await import('../entry/src/main/ets/input/ShortcutOutputConnectionActions.ts');
const ROOT = new URL('../../', import.meta.url);
const endpointIds = {
  tcp: 'OutputTarget::TCP::Endpoint::Set', udp: 'OutputTarget::UDP::Endpoint::Set', webSocket: 'OutputTarget::WebSocket::Uri::Set'
};
const connectionIds = ['Toggle', 'Connect', 'Disconnect'].map(op => 'OutputTarget::Connection::' + op);
const aliases = [...Object.values(endpointIds), ...connectionIds];
function draft(kind = 'tcp') {
  const d = new OutputSettingsDraft(); d.targetId = kind + ':3'; d.targetGeneration = 17; d.profileId = 'TCode-0.3';
  d.profileRevision = 23; d.editRevision = 7; d.applicationId = 11;
  d.model.setKind(kind); d.host = 'device.example'; d.port = kind === 'webSocket' ? 80 : 9000;
  d.localPort = 12345; d.path = '/ws';
  d.model.ranges = [{ axisId: 'L0', minimum: .8, maximum: .2, enabled: true },
    { axisId: 'R0', minimum: .5, maximum: .5, enabled: false }];
  d.model.dirtyOnly = false; d.model.offloadElapsed = true;
  d.model.pausedAutoHome = true; d.model.pausedMotion = true; d.model.pausedManual = true;
  return d;
}
function action(kind = 'tcp', text = 'next.example:9010', id = kind + ':3') {
  const a = new ShortcutAction(endpointIds[kind]); a.text = text; a.outputTargetId = id; return a;
}
const plain = value => structuredClone(value);
function rejected(d, a) {
  const before = plain(d), beforeAction = plain(a);
  assert.equal(applyOutputEndpointAction(d, a), null);
  assert.deepEqual(plain(d), before); assert.deepEqual(plain(a), beforeAction);
}

test('six target-bound aliases have exact original source sites and no axis parameter', () => {
  const specs = shortcutActionCatalog();
  const audit = JSON.parse(readFileSync(new URL('../tools/reference/output-connection-019/source.json', import.meta.url), 'utf8'));
  const mapping = [[72, endpointIds.tcp], [75, endpointIds.udp], [76, endpointIds.webSocket],
    [80, connectionIds[0]], [81, connectionIds[1]], [82, connectionIds[2]]];
  for (const [site, id] of mapping) {
    const spec = specs.find(s => s.id === id), evidence = audit.registrationEvidence.find(row => row.templateIndex === site);
    assert.ok(spec); assert.equal(spec.originalName, evidence.template);
    assert.equal(spec.targetOutput, true); assert.equal(spec.targetAxis, false); assert.equal(spec.category, 'output');
    assert.equal(spec.valueKind, site < 80 ? 'text' : 'none');
    const bytes = readFileSync(new URL(evidence.source.path, ROOT));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), evidence.source.sha256);
    assert.ok(bytes.toString('utf8').replace(/\r\n/g, '\n').includes(evidence.source.registrationSource));
    assert.equal(spec.maximumTextLength, site === 76 ? 1300 : site < 80 ? 280 : 256);
  }
  assert.equal(new Set(specs.map(s => s.id)).size, specs.length);
  for (const id of aliases) assert.equal(specs.filter(spec => spec.id === id).length, 1);
  assert.equal(specs.some(spec => /OutputTarget::.*(?:AutoConnect|Buttplug|Serial|Handy|Pipe|File)/.test(spec.id)), false);
});

test('original endpoint property, disconnected editor bindings and parser inputs remain source-audited', () => {
  const audit = JSON.parse(readFileSync(new URL('../tools/reference/output-connection-019/source.json', import.meta.url), 'utf8'));
  for (const [path, expected] of Object.entries(audit.originalSourceSha256)) {
    const bytes = readFileSync(new URL(path, ROOT));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, path);
  }
  for (const kind of ['Tcp', 'Udp', 'WebSocket']) {
    const model = readFileSync(new URL(`Source/MultiFunPlayer/OutputTarget/ViewModels/${kind}OutputTarget.cs`, ROOT), 'utf8');
    assert.match(model, kind === 'WebSocket' ? /public Uri Uri \{ get; set; \}/ : /public EndPoint Endpoint \{ get; set; \}/);
    const view = readFileSync(new URL(`Source/MultiFunPlayer/OutputTarget/Views/${kind}OutputTarget.xaml`, ROOT), 'utf8');
    assert.match(view, /IsEnabled="\{Binding IsDisconnected\}"/);
    if (kind === 'WebSocket') assert.match(view, /Schemes="ws wss"/);
  }
  // Static original-source evidence is not WPF/Fody or .NET execution.
});

test('connection identifiers resolve exactly, and editor defaults confer no target authority', () => {
  for (const operation of ['Toggle', 'Connect', 'Disconnect']) {
    const id = 'OutputTarget::Connection::' + operation;
    assert.equal(outputConnectionOperation(id), operation); assert.equal(isOutputEndpointAction(id), false);
    const a = defaultShortcutAction(id); assert.equal(a.outputTargetId, ''); assert.equal(validateShortcutAction(a), true);
  }
  for (const id of Object.values(endpointIds)) {
    assert.equal(isOutputEndpointAction(id), true); assert.equal(outputConnectionOperation(id), null);
    rejected(draft(), defaultShortcutAction(id));
  }
  for (const id of ['', 'TCP/0::Connection::Connect', 'OutputTarget::Connection::connect',
    'OutputTarget::TCP::Endpoint::Set::Extra', 'OutputTarget::Buttplug::Endpoint::Set', 'OutputTarget::AutoConnectEnabled::Set']) {
    assert.equal(outputConnectionOperation(id), null); assert.equal(isOutputEndpointAction(id), false);
    assert.equal(validateShortcutAction(new ShortcutAction(id)), false);
  }
});

for (const id of aliases) test(id + ' rejects undeclared arguments and runtime authority', () => {
  const a = defaultShortcutAction(id); a.outputTargetId = 'tcp:3';
  if (isOutputEndpointAction(id)) a.text = id.includes('WebSocket') ? 'ws://device.example/ws' : 'device.example:9000';
  assert.equal(validateShortcutAction(a), true);
  const mutations = [v => v.value = 1, v => v.value = NaN, v => v.value = Infinity, v => v.targetAxis = 'L0',
    v => v.secondaryValue = 1, v => v.secondaryValue = NaN, v => v.tertiaryValue = 1, v => v.tertiaryValue = Infinity,
    v => v.points = [{ x: .5, y: .5 }], v => v.outputTargetId = 'file:0', v => v.outputTargetId = 'tcp:10',
    v => v.outputTargetId = 'TCP/3', v => v.outputTargetId = '*', v => v.targetGeneration = 17,
    v => v.applicationId = 11, v => v.armed = true, v => v.text = '\u0000'];
  if (!isOutputEndpointAction(id)) mutations.push(v => v.text = 'arbitrary');
  for (const mutate of mutations) {
    const invalid = plain(a); mutate(invalid);
    assert.equal(validateShortcutAction(invalid), false); assert.throws(() => cloneShortcutAction(invalid));
  }
});

for (const kind of ['tcp', 'udp']) test(kind + ' standard endpoints and family prefixes produce detached inert drafts', () => {
  for (const [text, host, port, family] of [
    ['127.0.0.1:8080', '127.0.0.1', 8080, '1'], ['tcode.local:65535', 'tcode.local', 65535, '1'],
    ['DEVICE.example:00001', 'device.example', 1, '1'], ['[2001:DB8::1]:9001', '2001:db8::1', 9001, '2'],
    ['2001:db8::1:9001', '2001:db8::1', 9001, '2'], ['[::1]:42', '::1', 42, '2'],
    ['InterNetwork/device.example:9011', 'device.example', 9011, '1'],
    ['InterNetworkV6/device.example:9011', 'device.example', 9011, '1'],
    ['Unspecified/[2001:db8::1]:9011', '2001:db8::1', 9011, '2']
  ]) {
    const d = draft(kind), a = action(kind, text), before = plain(d), beforeAction = plain(a);
    const result = applyOutputEndpointAction(d, a); assert.ok(result, text); assert.equal(result.changed, true);
    assert.deepEqual([result.draft.host, result.draft.port, result.draft.family], [host, port, family], text);
    assert.equal(result.draft.applicationId, 0); assert.equal(result.draft.editRevision, d.editRevision + 1);
    assert.equal(validateOutputConnectionDraft(result.draft), true);
    assert.deepEqual(result.draft.model, d.model); assert.notEqual(result.draft.model, d.model);
    assert.notEqual(result.draft.model.ranges, d.model.ranges); assert.notEqual(result.draft.model.ranges[0], d.model.ranges[0]);
    assert.deepEqual([result.draft.localPort, result.draft.scheme, result.draft.path], [12345, 'ws', '/ws']);
    assert.deepEqual([result.draft.targetId, result.draft.targetGeneration, result.draft.profileId, result.draft.profileRevision],
      [d.targetId, d.targetGeneration, d.profileId, d.profileRevision]);
    assert.deepEqual(plain(d), before); assert.deepEqual(plain(a), beforeAction);
  }
});

test('ws/wss default ports, explicit ports, paths and bracketed IPv6 are bounded and normalized', () => {
  for (const [text, host, port, family, scheme, path] of [
    ['ws://device.example', 'device.example', 80, '1', 'ws', '/'],
    ['wss://DEVICE.example', 'device.example', 443, '1', 'wss', '/'],
    ['WSS://DEVICE.example:0443/ws/v1~stream', 'device.example', 443, '1', 'wss', '/ws/v1~stream'],
    ['ws://127.0.0.1:9001/output_1', '127.0.0.1', 9001, '1', 'ws', '/output_1'],
    ['wss://[2001:DB8::1]/ws', '2001:db8::1', 443, '2', 'wss', '/ws'],
    ['ws://[::1]:65535/', '::1', 65535, '2', 'ws', '/']
  ]) {
    const d = draft('webSocket'), result = applyOutputEndpointAction(d, action('webSocket', text));
    assert.ok(result, text); assert.equal(result.changed, true);
    assert.deepEqual([result.draft.host, result.draft.port, result.draft.family, result.draft.scheme, result.draft.path],
      [host, port, family, scheme, path]);
    assert.deepEqual(result.draft.model, d.model); assert.equal(result.draft.localPort, 12345);
  }
});

test('normalized unchanged endpoint is inert and does not clear an existing application or increment revision', () => {
  for (const kind of ['tcp', 'udp', 'webSocket']) {
    const d = draft(kind); d.host = 'DEVICE.example';
    const text = kind === 'webSocket' ? 'WS://device.example:00080/ws' : 'InterNetwork/device.example:09000';
    const result = applyOutputEndpointAction(d, action(kind, text)); assert.ok(result); assert.equal(result.changed, false);
    assert.deepEqual(result.draft, d); assert.notEqual(result.draft, d); assert.notEqual(result.draft.model, d.model);
    assert.equal(result.draft.applicationId, 11); assert.equal(result.draft.editRevision, 7);
  }
  const d = draft(); d.host = '2001:DB8::1'; d.family = '2';
  const result = applyOutputEndpointAction(d, action('tcp', '[2001:db8::1]:9000'));
  assert.ok(result); assert.equal(result.changed, false); assert.deepEqual(result.draft, d);
});

test('network grammar failures and original broader parser cases are atomic bounded refusals', () => {
  const invalid = ['', 'device.example', ':9000', 'host:0', 'host:65536', 'host:2147483648', 'host:999999999999999999999999999',
    'host:-1', 'host:+1', 'host:1.5', 'host:1e3', 'host:NaN', 'host:Infinity', ' host:9000', 'host:9000 ',
    'http://host:9000', 'user:pass@host:9000', 'host:9000/path', 'host:9000?x=1', 'host:9000#x',
    'host:9000\n', 'host\u0080:9000', 'bad_host:9000', 'host..example:9000', 'host.example.:9000',
    '-host:9000', 'host-:9000', '127.01.0.1:9000', '999.0.0.1:9000', '127.1:9000', '42:9000',
    '[host.example]:9000', '[127.0.0.1]:9000', '[::1%zone]:9000', '[::ffff:127.0.0.1]:9000',
    '[2001:::1]:9000', '[2001:db8::1:9000', '[1:2:3:4:5:6:7:8:9]:9000',
    'InterNetwork/bad_host:9000', 'InterNetworkV6/user@host:9000', 'Unspecified/http://host:9000',
    'Unsupported/host:9000', 'a'.repeat(64) + '.example:9000', 'a'.repeat(281)];
  for (const kind of ['tcp', 'udp']) for (const text of invalid) rejected(draft(kind), action(kind, text));
});

test('URI credentials, query, fragments, escapes, arbitrary schemes and invalid authority are never persisted', () => {
  for (const text of ['', 'http://host/ws', 'https://host/ws', 'file:///tmp/out', 'ftp://host/ws', 'tcp://host:9000',
    '//host/ws', 'ws:host', 'ws:///ws', 'ws://user:pass@host/ws', 'ws://user@host/ws', 'ws://host/ws?x=1',
    'wss://host/ws?token=secret', 'ws://host/#fragment', 'ws://host?query', 'ws://host#fragment',
    'ws://host/%74oken/value', 'ws://host/token/value', 'ws://host/AUTH/key', 'ws://host/api_key/value',
    'ws://host/ws;token=value', 'ws://host/ws=value', 'ws://host\\path', 'ws://host/ws\\path',
    'ws://host:0/ws', 'ws://host:65536/ws', 'ws://host:Infinity/ws', 'ws://host:-1/ws', 'ws://host:1.5/ws',
    'ws://host:/ws', 'ws://[host]/ws', 'ws://::1/ws', 'ws://[::1%zone]/ws', 'ws://[::ffff:127.0.0.1]/ws',
    'ws://host/space here', 'ws://host/\u0080', 'ws://host/' + 'x'.repeat(1024), 'wss://host/' + 'x'.repeat(1300)]) {
    rejected(draft('webSocket'), action('webSocket', text));
  }
});

test('unrelated invalid complete settings reject before copying or committing a valid endpoint', () => {
  const mutations = [d => d.port = NaN, d => d.localPort = NaN, d => d.localPort = Infinity, d => d.localPort = -1,
    d => d.localPort = 65536, d => d.localPort = .5, d => d.scheme = 'https', d => d.path = '/auth/key',
    d => d.path = '/ws?token=value', d => d.model.intervalMs = NaN, d => d.model.intervalMs = Infinity,
    d => d.model.intervalMs = 0, d => d.model.polled = 1, d => d.model.dirtyOnly = 'false',
    d => d.model.offloadElapsed = null, d => d.model.pausedAutoHome = undefined,
    d => d.model.pausedMotion = 1, d => d.model.pausedManual = undefined,
    d => d.model.ranges[0].minimum = NaN, d => d.model.ranges[0].maximum = Infinity,
    d => d.model.ranges[0].minimum = -.1, d => d.model.ranges[0].enabled = 1,
    d => d.model.ranges[0].axisId = '*', d => d.model.ranges.push({ ...d.model.ranges[0] }),
    d => d.model.ranges[0].armed = true, d => delete d.model.ranges[0].enabled,
    d => delete d.model.ranges[0], d => d.model.ranges.extra = true,
    d => d.model.autoConnectPolicy = 'automaticRequested', d => d.connected = true,
    d => d.model.config = () => ({}), d => delete d.model.pausedManual,
    d => d.targetGeneration = 0, d => d.targetGeneration = Infinity, d => d.targetGeneration = .5,
    d => d.editRevision = NaN, d => d.editRevision = -1, d => d.profileRevision = Infinity,
    d => d.applicationId = NaN, d => d.applicationId = -1, d => d.profileId = '', d => d.profileId = 'x\u0000'];
  for (const mutate of mutations) {
    const d = draft(); mutate(d);
    assert.equal(validateOutputConnectionDraft(d), false);
    // A malformed old remote port is intentionally repairable by Endpoint::Set.
    if (Number.isNaN(d.port)) { assert.ok(applyOutputEndpointAction(d, action())); continue; }
    const before = JSON.stringify(d);
    assert.equal(applyOutputEndpointAction(d, action()), null); assert.equal(JSON.stringify(d), before);
  }
});

test('incomplete remote endpoint can be repaired while unrelated family/path/localPort policies are preserved', () => {
  const d = draft(); d.host = ''; d.port = 0; d.family = '1';
  assert.equal(validateOutputConnectionDraft(d), false);
  const result = applyOutputEndpointAction(d, action()); assert.ok(result);
  assert.equal(result.draft.host, 'next.example'); assert.equal(result.draft.applicationId, 0);
  assert.equal(d.host, ''); assert.equal(d.port, 0);
  const ws = draft('webSocket'); ws.host = ''; ws.port = 0; ws.path = 'unfinished'; ws.scheme = 'unfinished';
  assert.ok(applyOutputEndpointAction(ws, action('webSocket', 'wss://next.example/ws')));
});

test('wrong, missing, reused-kind and nonnetwork target identities cannot retarget an endpoint action', () => {
  for (const kind of ['tcp', 'udp', 'webSocket']) {
    const text = kind === 'webSocket' ? 'wss://next.example/ws' : 'next.example:9001';
    for (const target of ['', 'tcp:0', 'udp:0', 'webSocket:0', '*', 'tcp:10', 'serial:3']) rejected(draft(kind), action(kind, text, target));
    for (const other of ['tcp', 'udp', 'webSocket'].filter(value => value !== kind)) {
      rejected(draft(other), action(kind, text, other + ':3'));
    }
    const d = draft(kind); d.targetId = 'tcp:9'; rejected(d, action(kind, text));
  }
  rejected(draft(), new ShortcutAction(connectionIds[1]));
});

test('full draft validation rejects inconsistent IP families but permits explicit DNS-family preference', () => {
  const d = draft(); assert.equal(validateOutputConnectionDraft(d), true);
  d.family = '2'; assert.equal(validateOutputConnectionDraft(d), true);
  d.host = '127.0.0.1'; assert.equal(validateOutputConnectionDraft(d), false);
  d.host = '2001:db8::1'; assert.equal(validateOutputConnectionDraft(d), true);
  d.family = '1'; assert.equal(validateOutputConnectionDraft(d), false);
  for (const value of [null, undefined, {}, [], new OutputSettingsDraft()]) {
    assert.equal(validateOutputConnectionDraft(value), false); assert.equal(applyOutputEndpointAction(value, action()), null);
  }
});

test('endpoint text budgets and revision overflow fail atomically; unchanged max revision remains inert', () => {
  for (const kind of ['tcp', 'udp']) {
    const a = action(kind, 'x'.repeat(281)); assert.equal(validateShortcutAction(a), false); rejected(draft(kind), a);
  }
  const a = action('webSocket', 'x'.repeat(1301)); assert.equal(validateShortcutAction(a), false); rejected(draft('webSocket'), a);
  const d = draft(); d.editRevision = Number.MAX_SAFE_INTEGER;
  rejected(d, action()); const same = applyOutputEndpointAction(d, action('tcp', 'device.example:9000'));
  assert.ok(same); assert.equal(same.changed, false); assert.equal(same.draft.editRevision, Number.MAX_SAFE_INTEGER);
});

test('helper module has no lifecycle, transport, persistence or profile mutation dependency', () => {
  const source = readFileSync(new URL('../entry/src/main/ets/input/ShortcutOutputConnectionActions.ts', import.meta.url), 'utf8');
  for (const forbidden of ['NativeOutputSession', 'OutputCoordinator', 'TransportFactory', 'socket.', '.connect(',
    '.disconnect(', '.arm(', '.disarm(', '.saveDraft(', 'SettingsStore', 'PlaybackEngine']) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});

const oracleBase = new URL('../tools/reference/output-connection-019/', import.meta.url);
const golden = JSON.parse(readFileSync(new URL('endpoint-golden.json', oracleBase), 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function method(text, marker) {
  const start = text.indexOf(marker); assert.ok(start >= 0, marker);
  const opening = text.indexOf('{', start); let depth = 0;
  for (let end = opening; end < text.length; end++) {
    if (text[end] === '{') depth++;
    else if (text[end] === '}' && --depth === 0) return text.slice(start, end + 1);
  }
  throw Error(marker);
}

test('offline .NET endpoint oracle pins unchanged full registrations, auto-properties and generated regex', () => {
  const p = golden.provenance; assert.equal(p.executedOriginalCSharp, true); assert.equal(p.sdk, '9.0.319');
  assert.match(p.compiler, /System.Text.RegularExpressions.Generator/);
  const sources = {};
  for (const [path, expected] of Object.entries(p.sourceSha256)) {
    const bytes = readFileSync(new URL(path, ROOT)); assert.equal(sha(bytes), expected);
    sources[path] = bytes.toString('utf8').replace(/^\uFEFF/, '');
  }
  const snippets = {};
  for (const [key, kind, prop] of [['TCP', 'Tcp', 'public EndPoint Endpoint'], ['UDP', 'Udp', 'public EndPoint Endpoint'],
    ['WS', 'WebSocket', 'public Uri Uri']]) {
    const text = sources[`Source/MultiFunPlayer/OutputTarget/ViewModels/${kind}OutputTarget.cs`];
    snippets[key + '_REGISTER'] = method(text, 'public override void RegisterActions(');
    const start = text.indexOf(prop); snippets[key + '_PROPERTY'] = text.slice(start, text.indexOf('\n', start));
    assert.doesNotMatch(snippets[key + '_REGISTER'], /IsConnected|IsDisconnected|Status/);
  }
  const net = sources['Source/MultiFunPlayer/Common/Utils/NetUtils.cs'];
  snippets.PARSE = method(net, 'public static EndPoint ParseEndpoint(');
  snippets.TRY_PARSE = method(net, 'public static bool TryParseEndpoint(');
  const start = net.indexOf('[GeneratedRegex('), marker = 'private static partial Regex EndpointRegex { get; }';
  snippets.REGEX = net.slice(start, net.indexOf(marker, start) + marker.length);
  const template = readFileSync(new URL('EndpointHost.cs.in', oracleBase), 'utf8');
  let host = template;
  for (const [key, value] of Object.entries(snippets)) {
    assert.equal(sha(value), p.extractedSpanSha256[key], key); host = host.replace('@@' + key + '@@', value);
  }
  assert.equal(Object.keys(snippets).length, 9); assert.equal(host.includes('@@'), false);
  assert.equal(sha(host), p.generatedHostSha256); assert.equal(sha(template), p.hostTemplateSha256);
  assert.equal(sha(readFileSync(new URL('run_endpoint_oracle.py', oracleBase))), p.runnerSha256);
  assert.match(p.shims.join('\n'), /No connection state or lifecycle/);
  assert.match(p.shims.join('\n'), /No DNS, network, transport, WPF, Fody/);
});

test('124 original C# setter/parser rows match declared portable normalization or explicit bounded refusal', () => {
  assert.equal(golden.rows.length, 124);
  let admitted = 0, refused = 0, pathDifferences = 0;
  const inputs = new Set();
  for (const row of golden.rows) {
    const { kind, text } = row.input; const key = JSON.stringify(row.input);
    assert.equal(inputs.has(key), false); inputs.add(key);
    const result = applyOutputEndpointAction(draft(kind), action(kind, text));
    if (result === null) { refused++; continue; }
    admitted++;
    assert.equal(row.error, null, key); assert.equal(row.assignedNewObject, true, key);
    assert.equal(result.draft.host, row.host.replace(/^\[|\]$/g, '').toLowerCase(), key);
    assert.equal(result.draft.port, row.port, key);
    if (kind === 'webSocket') {
      assert.equal(result.draft.scheme, row.scheme, key);
      if (text === 'ws://host/a/../ws') {
        // Deliberate partial difference: the helper retains the saved path
        // spelling; System.Uri collapses these segments at construction.
        assert.equal(result.draft.path, '/a/../ws'); assert.equal(row.path, '/ws'); pathDifferences++;
      } else assert.equal(result.draft.path, row.path, key);
    }
  }
  assert.ok(admitted >= 25); assert.ok(refused > 80); assert.equal(pathDifferences, 1);
});

test('original broad grammar and thrown TryParse failures remain visible rather than advertised as exact parity', () => {
  for (const kind of ['tcp', 'udp']) {
    const find = text => golden.rows.find(row => row.input.kind === kind && row.input.text === text);
    assert.equal(find('host:0').assignedNewObject, true); assert.equal(find('host:0').port, 0);
    assert.equal(find('host:65536').error, 'ArgumentOutOfRangeException');
    assert.equal(find('host:2147483648').error, 'OverflowException');
    assert.equal(find('InterNetwork/user@host:9000').assignedNewObject, true);
    assert.equal(find('InterNetwork/user@host:9000').family, 'Unspecified');
    for (const text of ['host:0', 'host:65536', 'host:2147483648', 'InterNetwork/user@host:9000']) {
      rejected(draft(kind), action(kind, text));
    }
  }
  for (const text of ['http://host/ws', 'ws://user:pass@host/ws', 'ws://host/ws?x=1', 'ws://host/ws#fragment']) {
    const row = golden.rows.find(row => row.input.kind === 'webSocket' && row.input.text === text);
    assert.equal(row.assignedNewObject, true); assert.equal(row.error, null);
    rejected(draft('webSocket'), action('webSocket', text));
  }
});

test('configured existing official .NET SDK reproduces the endpoint oracle offline without restore', () => {
  const root = process.env.MFP_DOTNET_ROOT;
  if (!root || !existsSync(join(root, 'dotnet'))) return;
  const work = mkdtempSync(join(tmpdir(), 'mfp-endpoint-019-test-'));
  try {
    const output = join(work, 'endpoint-golden.json');
    execFileSync('python3', [fileURLToPath(new URL('run_endpoint_oracle.py', oracleBase)), '--sdk-root', root, '--output', output]);
    assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')), golden);
  } finally { rmSync(work, { recursive: true, force: true }); }
});

test('new serial draft subobject is validated without breaking network endpoint actions or accepting forged runtime authority',()=>{
 const d=draft('tcp');const a=action();const valid=applyOutputEndpointAction(d,a);assert.ok(valid);assert.deepEqual(valid.draft.serial,d.serial);valid.draft.serial.portName='detached';assert.equal(d.serial.portName,'');for(const change of [s=>s.armed=true,s=>s.baudRate=NaN,s=>s.portId=3]){const v=plain(d);change(v.serial);assert.equal(applyOutputEndpointAction(v,a),null);}
});
