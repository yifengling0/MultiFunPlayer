import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';

registerHooks({ resolve(specifier, context, next) {
  return next(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? specifier + '.ts' : specifier, context);
} });
const { MediaSourceConfiguration } = await import('../entry/src/main/ets/settings/MediaSourceConfiguration.ts');
const source = readFileSync(new URL('../entry/src/main/ets/components/DeoVrSourcePanel.ets', import.meta.url), 'utf8');
const pure = source.split('@Component')[0].replace(/^import .*;\n/gm, '').replace('export class ', 'class ');
const DeoVrSourceEdits = new Function('MediaSourceConfiguration', stripTypeScriptTypes(pure) + '\nreturn DeoVrSourceEdits;')(MediaSourceConfiguration);
const start = source.indexOf('export struct DeoVrSourcePanel');
const controller = source.slice(start, source.indexOf('  build()', start)).replace('export struct', 'class')
  .replace(/@(Prop|State|Watch)(\([^)]*\))?\s*/g, '') + '\n}';
class SettingsOption { constructor(value, label) { this.value = value; this.label = label; } }
const Panel = new Function('MediaSourceConfiguration', 'DeoVrSourceEdits', 'SettingsOption',
  stripTypeScriptTypes(controller) + '\nreturn DeoVrSourcePanel;')(MediaSourceConfiguration, DeoVrSourceEdits, SettingsOption);
function mounted(selectedSource = 'deovr') {
  const panel = new Panel(); panel.configuration.selectedSource = selectedSource;
  const calls = []; const changes = [];
  panel.onConnect = () => calls.push('connect'); panel.onDisconnect = () => calls.push('disconnect');
  panel.onChange = next => { changes.push(next); panel.configuration = next; panel.ownerChanged(); };
  panel.aboutToAppear(); return { panel, calls, changes };
}
function runtime(panel, patch) { Object.assign(panel, patch); panel.runtimeChanged(); }

test('defaults and every lifecycle restore are inert with parent-owned runtime state', () => {
  const panel = new Panel(); assert.equal(panel.configuration.selectedSource, 'internal'); assert.equal(panel.compact, false);
  assert.equal(panel.connected, false); assert.equal(panel.busy, false); assert.equal(panel.closeConfirmed, true);
  assert.equal(panel.stale, true); assert.equal(panel.positionSeconds, null); assert.equal(panel.durationSeconds, null);
  const { panel: mountedPanel, calls, changes } = mounted();
  mountedPanel.ownerChanged(); mountedPanel.aboutToDisappear(); mountedPanel.aboutToAppear();
  runtime(mountedPanel, { connected: true, playing: true });
  assert.deepEqual(calls, []); assert.deepEqual(changes, []);
});

test('actual edit methods produce validated detached snapshots and never connect or arm', () => {
  const { panel, calls, changes } = mounted(); const original = panel.configuration;
  assert.equal(panel.commitHost('Player-One.local'), true); assert.equal(panel.commitPort(45678), true);
  assert.equal(panel.configuration.deoVr.host, 'Player-One.local'); assert.equal(panel.configuration.deoVr.port, 45678);
  assert.equal(original.deoVr.host, '127.0.0.1'); assert.equal(original.deoVr.port, 23554);
  assert.notEqual(changes[0].deoVr, original.deoVr);
  for (const host of ['', ' user@host', 'http://host', 'host/path', 'host:23554']) assert.equal(panel.commitHost(host), false);
  for (const port of [0, 65536, .5, NaN, Infinity]) assert.equal(panel.commitPort(port), false);
  panel.selectSource('native'); assert.equal(changes.length, 2);
  panel.selectSource('internal'); assert.equal(panel.configuration.selectedSource, 'internal');
  assert.equal(panel.commitHost('ignored.local'), false); assert.equal(panel.commitPort(2), false);
  assert.deepEqual(calls, []);
});

test('read-only, busy, connected and unconfirmed close block direct edits and connection handlers', () => {
  for (const patch of [{ readOnly: true }, { busy: true }, { connected: true }, { closeConfirmed: false }]) {
    const { panel, calls, changes } = mounted(); Object.assign(panel, patch);
    assert.equal(panel.commitHost('other.local'), false); assert.equal(panel.commitPort(12345), false);
    panel.selectSource('internal'); panel.connect(); panel.connectionHandler(false)();
    assert.deepEqual(calls, []); assert.deepEqual(changes, []); assert.equal(panel.canConnect(), false);
  }
});

test('explicit connect has no optimistic runtime changes and synchronous repeats cannot duplicate requests', () => {
  const { panel, calls, changes } = mounted(); const click = panel.connectionHandler(false);
  click(); click(); panel.connect();
  assert.deepEqual(calls, ['connect']); assert.deepEqual(changes, []);
  assert.equal(panel.connected, false); assert.equal(panel.playing, false); assert.equal(panel.canConnect(), false);
  assert.equal(panel.commitHost('other.local'), false); assert.equal(panel.canDisconnect(), true);
  runtime(panel, { busy: true, status: 'connecting' }); panel.connect();
  assert.deepEqual(calls, ['connect']); assert.equal(panel.canDisconnect(), true);
});

test('cancel remains available during a pending connect or read-only live connection and repeats deduplicate', () => {
  for (const phase of ['pending', 'opening', 'live', 'unconfirmed']) {
    const { panel, calls } = mounted();
    if (phase === 'pending') panel.connect();
    else runtime(panel, phase === 'opening' ? { busy: true } : phase === 'live' ? { connected: true } : { closeConfirmed: false });
    panel.readOnly = true; const cancel = panel.connectionHandler(true); cancel(); cancel(); panel.disconnect();
    assert.equal(calls.filter(call => call === 'disconnect').length, 1, phase);
    assert.equal(panel.pendingRequest, 'disconnect'); assert.equal(panel.canDisconnect(), false);
  }
});

test('closing fault permits explicit close retry, while reconnect requires confirmed closure', () => {
  const { panel, calls } = mounted(); runtime(panel, { closeConfirmed: false, status: 'fault', error: 'close failed' });
  assert.equal(panel.canConnect(), false); assert.equal(panel.canEdit(), false); assert.equal(panel.connectionLabel(), '重试断开');
  panel.disconnect(); runtime(panel, { error: 'retry failed' }); panel.disconnect();
  assert.deepEqual(calls, ['disconnect', 'disconnect']);
  runtime(panel, { closeConfirmed: true, status: 'disconnected', error: '' });
  assert.equal(panel.canConnect(), true); panel.connect(); assert.equal(calls.at(-1), 'connect');
});

test('stale captured controls cannot affect a replacement owner, later state, or a remounted panel', () => {
  for (const change of ['replacement', 'readOnly', 'runtime', 'disappear', 'remount', 'edit']) {
    const { panel, calls, changes } = mounted();
    const host = panel.hostHandler(); const port = panel.portHandler(); const choice = panel.sourceHandler(); const connect = panel.connectionHandler(false);
    if (change === 'replacement') panel.configuration = MediaSourceConfiguration.clone(panel.configuration);
    if (change === 'readOnly') { panel.readOnly = true; panel.ownerChanged(); panel.readOnly = false; }
    if (change === 'runtime') runtime(panel, { status: 'changed' });
    if (change === 'disappear') panel.aboutToDisappear();
    if (change === 'remount') { panel.aboutToDisappear(); panel.aboutToAppear(); }
    if (change === 'edit') panel.commitPort(23456);
    const before = changes.length; assert.equal(host('stale.local'), false); assert.equal(port(54321), false); choice('internal'); connect();
    assert.equal(changes.length, before, change); assert.deepEqual(calls, [], change);
  }
});

test('old disconnect callback cannot terminate a replacement connection and disappeared panels cannot act', () => {
  const { panel, calls } = mounted(); runtime(panel, { connected: true }); const oldDisconnect = panel.connectionHandler(true);
  runtime(panel, { connected: false }); runtime(panel, { connected: true }); oldDisconnect();
  assert.deepEqual(calls, []); panel.aboutToDisappear(); panel.disconnect(); panel.connect();
  assert.deepEqual(calls, []);
});

test('status formatting distinguishes unknown data, stale clock and unconfirmed closure without guessing', () => {
  const { panel } = mounted();
  for (const value of [null, NaN, Infinity, -1]) assert.equal(panel.seconds(value), '未知');
  assert.equal(panel.seconds(0), '0.00 秒'); assert.equal(panel.seconds(2.345), '2.35 秒');
  assert.match(panel.freshness(), /未连接/); runtime(panel, { connected: true }); assert.match(panel.freshness(), /过期/);
  panel.stale = false; assert.match(panel.freshness(), /有效/);
  assert.deepEqual(panel.sources().map(option => option.value), ['internal', 'deovr']);
});

test('layout is parent-scrolled touch-friendly content with explicit capabilities and no fake player controls', () => {
  assert.match(source, /Column\(\{ space: UiStyle\.gap\(this\.compact\) \}\)/); assert.doesNotMatch(source, /\bScroll\(|nestedScroll|\bList\(/);
  assert.match(source, /@Prop compact: boolean = false/); assert.match(source, /constraintSize\(\{ minHeight: UiStyle\.control, maxWidth: \'100%\' \}\)/);
  for (const field of ['SettingsChoiceField', 'SettingsTextField', 'SettingsNumberField']) {
    const control = source.slice(source.indexOf(field + '({')); assert.match(control.slice(0, control.indexOf('})')), /compact: this\.compact/);
  }
  for (const text of ['恢复设置不会自动连接', '收到的媒体路径', '位置：', '时长：', '状态已过期', '跳转仍解除 Arm', '不授予本地文件访问权', 'TCP 发送完成不是播放器确认']) assert.ok(source.includes(text), text);
  assert.doesNotMatch(source, /onArm|onSeek|onPlayPause|new WebSocket|TCPSocket|setInterval|setTimeout/);
});
