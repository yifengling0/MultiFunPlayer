import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
registerHooks({ resolve(s, c, next) { return next(s.startsWith('.') && !/\.[a-z]+$/i.test(s) ? s + '.ts' : s, c); } });
const { SettingsDraftOwner } = await import('../entry/src/main/ets/presentation/SettingsDraftOwner.ts');
const { KeyboardInputSession } = await import('../entry/src/main/ets/app/KeyboardInputSession.ts');
const { OutputSettingsModel, OutputSettingsDraft } = await import('../entry/src/main/ets/output/OutputSettingsModel.ts');
const { OutputEndpoint } = await import('../entry/src/main/ets/output/OutputCoordinator.ts');
const { SerialOutputPreferences } = await import('../entry/src/main/ets/settings/SerialOutputPreferences.ts');
const { SerialDiagnosticSnapshot } = await import('../entry/src/main/ets/app/SerialDiagnosticSession.ts');
const read = name => readFileSync(new URL('../entry/src/main/ets/components/' + name + '.ets', import.meta.url), 'utf8');
const source = read('OutputSettingsPanel'), view = source.slice(source.indexOf('  build() {'));
const fieldsSource = read('CurvePointEditor');
const helpers = fieldsSource.split('@Component')[0].replace(/^import .*;\n/gm, '').replace(/export class/g, 'class');
const { SettingsOption, SettingsNumberLogic } = new Function(stripTypeScriptTypes(helpers) + ';return {SettingsOption,SettingsNumberLogic};')();
const deps = { SettingsDraftOwner, KeyboardInputSession, OutputSettingsModel, OutputSettingsDraft, OutputEndpoint, SerialOutputPreferences, SerialDiagnosticSnapshot, SettingsOption, SettingsNumberLogic };
function controller(text, name) {
  const start = text.indexOf('export struct ' + name), end = text.indexOf('  build()', start);
  const body = text.slice(start, end).replace('export struct', 'class').replace(/@(Prop|State|Watch)(\([^)]*\))?\s*/g, '') + '\n}';
  return new Function(...Object.keys(deps), stripTypeScriptTypes(body) + ';return ' + name + ';')(...Object.values(deps));
}
const Panel = controller(source, 'OutputSettingsPanel');
const NumberField = controller(fieldsSource, 'SettingsNumberField');
const TextField = controller(fieldsSource, 'SettingsTextField');
const profile = { precision: 4, revision: 7, axisOrder: ['L0', 'R0'], maximumDurationMs: 10000, maximumPayloadBytes: 1024 };
function fixture(kind = 'tcp') {
  const owner = new SettingsDraftOwner(), calls = [];
  let draft = new OutputSettingsDraft();
  Object.assign(draft, { targetId: kind + ':0', targetGeneration: 9, profileId: 'device', profileRevision: 7, host: '192.168.1.20', port: 9999 });
  draft.model.setKind(kind); draft.model.ranges = profile.axisOrder.map(axisId => ({ axisId, minimum: 0, maximum: 1, enabled: true }));
  function mount() {
    const p = new Panel();
    Object.assign(p, { draftOwner: owner, draftScope: 'output:device:7:' + kind + ':0:9', draft: OutputSettingsDraft.copy(draft), profileId: 'device', profile });
    p.onDraftChange = d => { draft = OutputSettingsDraft.copy(d); p.draft = OutputSettingsDraft.copy(d); calls.push(['draft']); };
    p.onDisarm = (...args) => calls.push(['disarm', ...args]);
    p.onDisconnect = (...args) => calls.push(['disconnect', ...args]);
    p.onArm = (...args) => calls.push(['arm', ...args]);
    p.onConnect = async (...args) => { calls.push(['connect', ...args]); return 41; };
    p.onRefreshSerial = (...args) => calls.push(['refresh', ...args]);
    p.onProbeSerial = (...args) => calls.push(['probe', ...args]);
    p.aboutToAppear(); return p;
  }
  return { owner, calls, mount, saved: () => OutputSettingsDraft.copy(draft) };
}
// Evaluate the actual field props and callback closures from ArkUI source. No parallel edit implementation.
function balanced(text, start, open = '(', close = ')') {
  let depth = 0, quote = '', escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (quote) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === quote) quote = ''; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === open) depth++; else if (ch === close && --depth === 0) return i;
  }
  throw new Error('unbalanced source');
}
function props(p, component, marker, range = p.model.ranges[0]) {
  let start = 0;
  while ((start = view.indexOf(component + '(', start)) >= 0) {
    const open = start + component.length, end = balanced(view, open), expr = view.slice(open + 1, end);
    start = end + 1;
    if (!expr.includes(marker)) continue;
    return new Function('SettingsOption', 'range', stripTypeScriptTypes('const result = ' + expr + ';') + 'return result;').call(p, SettingsOption, range);
  }
  throw new Error('field not found: ' + marker);
}
function field(p, key, component = 'SettingsNumberField') {
  const f = new (component === 'SettingsTextField' ? TextField : NumberField)();
  Object.assign(f, props(p, component, "draftKey: '" + key + "'")); f.aboutToAppear(); return f;
}
function block(marker) {
  const start = view.indexOf(marker); assert.ok(start >= 0, marker);
  const open = view.indexOf('{', start); return view.slice(open + 1, balanced(view, open, '{', '}'));
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

for (const kind of ['tcp', 'udp', 'webSocket']) {
  test(`actual ${kind} host/IP and port inputs commit to the real controlled draft; connect never arms`, async () => {
    const f = fixture(kind), p = f.mount();
    const host = field(p, 'host', 'SettingsTextField');
    host.changeHandler()('10.0.0.42'); assert.equal(p.host, '192.168.1.20'); host.commitHandler()();
    assert.equal(p.host, '10.0.0.42'); assert.equal(f.saved().host, p.host);
    const port = field(p, 'port'); port.changeHandler()('12000'); port.commitHandler()();
    assert.equal(f.saved().port, 12000); assert.equal(p.applicationId, 0);
    p.connectFromPanel(); await flush();
    const [, config, endpoint, generation] = f.calls.find(c => c[0] === 'connect');
    assert.equal(config.targetId, p.draft.targetId); assert.equal(generation, 9);
    assert.equal(endpoint.host, '10.0.0.42'); assert.equal(endpoint.port, 12000);
    assert.equal(f.calls.some(c => c[0] === 'arm'), false); assert.equal(p.applicationId, 41);
  });
}

test('connected/connecting endpoint props explain locking and require confirmed disconnect before editing or reconnecting', async () => {
  const f = fixture(), p = f.mount();
  const oldHost = props(p, 'SettingsTextField', "draftKey: 'host'").onCommit;
  const oldPort = props(p, 'SettingsNumberField', "draftKey: 'port'").onCommit;
  for (const state of ['connecting', 'connected']) {
    p.connection = state;
    assert.equal(props(p, 'SettingsTextField', "draftKey: 'host'").editable, false);
    assert.equal(props(p, 'SettingsNumberField', "draftKey: 'port'").editable, false);
    assert.match(p.editingBlockReason(), /断开 \/ 编辑连接/);
    assert.equal(oldHost('unsafe-live-swap'), false); assert.equal(oldPort(1), false);
    p.connectFromPanel(); assert.equal(f.calls.length, 0);
  }
  p.guardedAction(() => p.disconnect())();
  assert.deepEqual(f.calls, [['disconnect', 'tcp:0', 9]]);
  assert.equal(p.canEditEndpoint(), false, 'clicking Disconnect does not invent a native disconnect result');
  p.connection = 'disconnected'; const host = field(p, 'host', 'SettingsTextField'); host.changeHandler()('new-device'); host.commitHandler()();
  p.connectFromPanel(); await flush(); assert.equal(f.saved().host, 'new-device');
  assert.equal(f.calls.some(c => c[0] === 'arm'), false);
  p.connection = 'connected'; p.appliedConfigurationId = 41; p.arm(); assert.equal(f.calls.filter(c => c[0] === 'arm').length, 1);
});

test('every advanced endpoint field uses the same disconnected edit gate', () => {
  for (const kind of ['tcp', 'udp', 'webSocket']) {
    const f = fixture(kind), p = f.mount(); p.disclosureHandler('connection')(); p.connection = 'connected';
    const checks = kind === 'webSocket' ? [['SettingsChoiceField', "label: 'WebSocket scheme'", 'wss'], ['SettingsTextField', "draftKey: 'path'", '/new']]
      : [['SettingsChoiceField', "label: 'IP 地址族'", '2'], ...(kind === 'udp' ? [['SettingsNumberField', "draftKey: 'localPort'", 1000]] : [])];
    for (const [component, marker, value] of checks) {
      const v = props(p, component, marker); assert.equal(v.editable, false); (v.onCommit ?? v.onSelect)(value);
    }
    assert.equal(f.calls.length, 0); assert.equal(p.family, '1'); assert.equal(p.path, '/'); assert.equal(p.localPort, 0);
  }
});

test('serial port and baud use actual selection/draft callbacks; refresh and CH read-only probe remain explicitly separate', () => {
  const f = fixture('serial'), p = f.mount();
  p.serialPorts = [{ backend: 'official26', portName: 'tty0', label: 'tty0', vendorId: null, productId: null }];
  p.serialCapabilities = [{ backend: 'official26', available: true, diagnostic: '' }];
  props(p, 'SettingsChoiceField', "label: '串口端口'").onSelect('tty0');
  const baud = field(p, 'baudRate'); baud.changeHandler()('115200'); baud.commitHandler()();
  assert.equal(f.saved().serial.portName, 'tty0'); assert.equal(f.saved().serial.baudRate, 115200);
  p.refreshSerial(); assert.equal(f.calls.filter(c => c[0] === 'refresh').length, 1);
  assert.equal(f.calls.some(c => c[0] === 'connect' || c[0] === 'probe' || c[0] === 'arm'), false);
  p.connection = 'connected'; assert.equal(p.canEditSerial(), false); assert.equal(p.commitBaud(9600), false); assert.match(p.editingBlockReason(), /已锁定/);
  p.connection = 'disconnected'; p.disclosureHandler('connection')();
  props(p, 'SettingsChoiceField', "label: '串口后端'").onSelect('ch34xWriteOnly');
  p.serialCapabilities = [{ backend: 'ch34xWriteOnly', available: true, diagnostic: '' }];
  p.serialPorts = [{ backend: 'ch34xWriteOnly', portName: 'usb1', label: 'CH', vendorId: 0x1a86, productId: 0x7523 }];
  props(p, 'SettingsChoiceField', "label: '串口端口'").onSelect('usb1');
  p.serial.dtr = null; assert.equal(p.canConnectDraft(), false); assert.match(p.connectionBlockReason(), /DTR \/ RTS/);
  props(p, 'SettingsChoiceField', "label: 'DTR'").onSelect('on');
  props(p, 'SettingsChoiceField', "label: 'RTS'").onSelect('off'); assert.equal(p.canConnectDraft(), true);
  p.probeSerial(); assert.equal(f.calls.filter(c => c[0] === 'probe').length, 1);
  p.serialProbeState.quarantined = true; assert.equal(p.canConnectDraft(), false); assert.match(p.connectionBlockReason(), /关闭尚未确认/);
});

test('folds start closed and do not persist, disarm, connect, acquire permission, or clear raw drafts', () => {
  const f = fixture(), p = f.mount(); const baseline = f.saved();
  for (const section of ['connection', 'timing', 'ranges', 'help']) {
    assert.equal(p.disclosureOpen(section), false); p.disclosureHandler(section)(); assert.equal(p.disclosureOpen(section), true);
  }
  assert.deepEqual(f.calls, []); assert.deepEqual(f.saved(), baseline);
  p.aboutToDisappear(); const remount = f.mount();
  for (const section of ['connection', 'timing', 'ranges', 'help']) assert.equal(remount.disclosureOpen(section), false);
  assert.deepEqual(f.saved(), baseline); assert.deepEqual(f.calls, []);
});

test('invalid folded numeric draft survives collapse and phone/pad/PC remount while old raw/commit callbacks retire before disappearance', () => {
  const f = fixture(); let p = f.mount(); p.disclosureHandler('timing')();
  let input = field(p, 'intervalMs'); input.changeHandler()('1e-'); input.commitHandler()(); assert.equal(input.error, true);
  const oldChange = input.changeHandler(), oldCommit = input.commitHandler();
  p.disclosureHandler('timing')(); oldChange('20'); oldCommit();
  assert.equal(input.draft, '1e-'); assert.equal(f.calls.length, 0); assert.equal(p.unappliedInputs(), true);
  assert.match(p.connectionBlockReason(), /折叠项/); p.connectFromPanel(); assert.equal(f.calls.length, 0);
  input.aboutToDisappear();
  for (const layout of ['phone-portrait', 'phone-landscape', 'pad', 'PC']) {
    p.aboutToDisappear(); p = f.mount(); p.disclosureHandler('timing')(); input = field(p, 'intervalMs');
    assert.equal(input.draft, '1e-', layout); assert.equal(input.error, true); oldChange('22'); oldCommit();
    assert.equal(f.calls.length, 0); input.aboutToDisappear();
  }
  p.disclosureHandler('help')(); p.guardedAction(() => p.cancelUnappliedInputs(), 'help')();
  assert.equal(p.unappliedInputs(), false); assert.equal(f.calls.length, 0);
});

test('folded choice/range callbacks are retired on collapse and cannot revive on reopen', () => {
  const f = fixture(), p = f.mount(); p.disclosureHandler('ranges')();
  const staleRange = props(p, 'SettingsNumberField', "draftKey: 'range:'").onCommit;
  p.disclosureHandler('ranges')(); assert.equal(staleRange(.4), false); p.disclosureHandler('ranges')(); assert.equal(staleRange(.4), false);
  props(p, 'SettingsNumberField', "draftKey: 'range:'").onCommit(.4); assert.equal(p.model.ranges[0].minimum, .4);
  p.disclosureHandler('timing')(); const oldChoice = props(p, 'SettingsSwitchField', "label: 'Polled 事件模式'").onChange;
  p.disclosureHandler('timing')(); oldChoice(true); assert.equal(p.model.polled, false);
});

test('folding during an actual in-flight Connect does not discard valid completion or automatically Arm', async () => {
  const f = fixture(), p = f.mount(); let resolve;
  p.onConnect = () => new Promise(r => { resolve = r; }); p.connectFromPanel();
  for (const section of ['connection', 'timing', 'ranges', 'help']) p.disclosureHandler(section)();
  resolve(55); await flush(); assert.equal(p.applicationId, 55); assert.equal(f.saved().applicationId, 55);
  assert.equal(f.calls.some(c => c[0] === 'arm' || c[0] === 'disarm'), false);
});

for (const replacement of ['before-Watch-target', 'before-Watch-profile', 'before-Watch-draft', 'read-only', 'background', 'remount']) {
  test(`endpoint and disclosure callbacks reject ${replacement}; late Connect cannot restore application identity`, async () => {
    const f = fixture(), p = f.mount();
    const old = props(p, 'SettingsTextField', "draftKey: 'host'").onCommit, toggle = p.disclosureHandler('connection');
    let resolve; p.onConnect = () => new Promise(r => { resolve = r; }); p.connectFromPanel();
    if (replacement === 'before-Watch-target') p.draft = Object.assign(OutputSettingsDraft.copy(p.draft), { targetGeneration: 10 });
    if (replacement === 'before-Watch-profile') p.profile = { ...profile, revision: 8 };
    if (replacement === 'before-Watch-draft') p.draft = Object.assign(OutputSettingsDraft.copy(p.draft), { host: 'new-owner' });
    if (replacement === 'read-only') p.readOnly = true;
    if (replacement === 'background') f.owner.setAvailable(false);
    if (replacement === 'remount') { p.aboutToDisappear(); f.mount(); }
    assert.equal(old('late-host'), false); toggle(); assert.equal(p.connectionDetailsExpanded, false);
    resolve(71); await flush(); assert.equal(f.saved().host, '192.168.1.20'); assert.equal(f.saved().applicationId, 0); assert.equal(f.calls.length, 0);
  });
}

test('read-only still permits inspecting folds and explicit disconnect, without enabling any endpoint edit', () => {
  const f = fixture(), p = f.mount(); p.readOnly = true;
  p.disclosureHandler('connection')(); assert.equal(p.connectionDetailsExpanded, true);
  assert.match(p.editingBlockReason(), /只读/); assert.equal(field(p, 'port').editable, false);
  p.guardedAction(() => p.disconnect())(); assert.deepEqual(f.calls, [['disconnect', 'tcp:0', 9]]);
});

test('visible destination/action hierarchy and every existing advanced control remain reachable; live errors never hide in folds', () => {
  const firstFold = view.indexOf('if (this.connectionDetailsExpanded)'), visible = view.slice(0, firstFold);
  for (const marker of ["draftKey: 'host'", "draftKey: 'port'", "draftKey: 'baudRate'", "label: '串口端口'", "Button('连接 / 应用配置')", "Button('断开 / 编辑连接')", "Button('启用发送')", "Button('解除发送')", 'Text(this.diagnostic)', 'Text(this.editNotice)', 'Text(this.serialMessage)', "Button('取消识别 · 等待清理')", "Text('识别状态："]) assert.ok(visible.includes(marker), marker);
  assert.ok(visible.indexOf("draftKey: 'host'") < visible.indexOf("Button('连接 / 应用配置')"));
  for (const [section, markers] of [
    ['connectionDetailsExpanded', ["label: '串口后端'", "label: 'DTR'", "label: 'RTS'", "draftKey: 'path'", "label: 'IP 地址族'", "draftKey: 'localPort'", "Button('授权并只读识别设备')", "Button('复制诊断报告 · 覆盖剪贴板')"]],
    ['timingExpanded', ["label: 'Polled 事件模式'", "draftKey: 'intervalMs'", "label: '只发送变化值'", "label: '设备处理时间（省略 I）'", "label: '允许暂停时 Auto Home'", "label: '允许暂停时 Motion'", "label: '暂停手动过渡输出'"]],
    ['rangesExpanded', ["draftKey: 'range:'", "' Minimum（输入 0）'", "' Maximum（输入 1）'"]],
    ['helpExpanded', ["Button('取消本目标全部未应用输入')", '不是设备执行确认', '刷新 Download 媒体文件夹']]
  ]) {
    const content = block('if (this.' + section + ')'); for (const marker of markers) assert.ok(content.includes(marker), section + ': ' + marker);
  }
  assert.equal((view.match(/\.onClick\(this.disclosureHandler\(/g) ?? []).length, 4);
  assert.match(view, /连接 ≠ 启用发送/); assert.doesNotMatch(view, /\bScroll\(/);
  for (const match of view.matchAll(/\bButton\(/g)) {
    const control = view.slice(match.index, view.indexOf('.onClick(', match.index));
    assert.match(control, /minHeight: UiStyle.control, maxWidth: '100%'/); assert.match(control, /stateEffect\(true\)/);
  }
});
