import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';

registerHooks({ resolve(specifier, context, next) {
  return next(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? specifier + '.ts' : specifier, context);
} });
const { OutputSettingsModel, OutputSettingsDraft } = await import('../entry/src/main/ets/output/OutputSettingsModel.ts');
const { OutputEndpoint } = await import('../entry/src/main/ets/output/OutputCoordinator.ts');
const { KeyboardInputSession } = await import('../entry/src/main/ets/app/KeyboardInputSession.ts');
const source = readFileSync(new URL('../entry/src/main/ets/components/OutputSettingsPanel.ets', import.meta.url), 'utf8');
const controller = ('class Panel {' + source.slice(source.indexOf('export struct OutputSettingsPanel {') +
  'export struct OutputSettingsPanel {'.length, source.indexOf('  build() {')) + '}')
  .replace(/@Prop\s*@Watch\([^)]*\)\s*/g, '').replace(/@Prop\s*|@State\s*/g, '');
const Panel = new Function('OutputSettingsModel', 'OutputSettingsDraft', 'OutputEndpoint', 'KeyboardInputSession',
  stripTypeScriptTypes(controller) + '; return Panel;')(OutputSettingsModel, OutputSettingsDraft, OutputEndpoint, KeyboardInputSession);
const profile = { precision: 4, revision: 7, axisOrder: ['L0', 'R0'], maximumDurationMs: 10000, maximumPayloadBytes: 1024 };
const range = (axisId, minimum = 0, maximum = 1, enabled = true) => ({ axisId, minimum, maximum, enabled });
function draft(targetId = 'output-A', profileId = 'device-A', targetGeneration = 1) {
  const value = new OutputSettingsDraft();
  value.targetId = targetId; value.targetGeneration = targetGeneration; value.profileId = profileId; value.profileRevision = profile.revision;
  value.host = targetId + '.local'; value.port = 2345;
  value.model.ranges = [range('L0', .2, .8, false), range('R0', .1, .9)];
  return value;
}
function mounted(value = draft(), options = {}) {
  const panel = new Panel(); const calls = []; const emitted = [];
  panel.profile = options.profile ?? profile; panel.profileId = options.profileId ?? value.profileId;
  panel.readOnly = options.readOnly ?? false; panel.draft = OutputSettingsDraft.copy(value);
  panel.onDraftChange = next => emitted.push(next);
  panel.onConnect = async (config, endpoint, generation) => { calls.push(['connect', config, endpoint, generation]); return 31; };
  panel.onArm = (targetId, generation) => calls.push(['arm', targetId, generation]);
  panel.onDisarm = (targetId, generation) => calls.push(['disarm', targetId, generation]);
  panel.onDisconnect = (targetId, generation) => calls.push(['disconnect', targetId, generation]);
  panel.aboutToAppear(); return { panel, calls, emitted };
}
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function settled() { await Promise.resolve(); await Promise.resolve(); }
function restore(panel, value) { panel.draft = OutputSettingsDraft.copy(value); panel.restoreDraft(); }

test('draft IDs and every mutable range are copied; config uses the supplied stable target ID', () => {
  const original = draft(); const copy = OutputSettingsDraft.copy(original);
  assert.equal(new OutputSettingsDraft().targetId, ''); assert.equal(new OutputSettingsDraft().targetGeneration, 0); assert.equal(new OutputSettingsDraft().profileId, '');
  assert.equal(copy.targetId, 'output-A'); assert.equal(copy.targetGeneration, 1); copy.targetGeneration = 2; assert.equal(original.targetGeneration, 1); assert.equal(copy.profileId, 'device-A');
  copy.model.ranges[0].minimum = .5; copy.targetId = 'output-B'; copy.profileId = 'device-B';
  assert.equal(original.model.ranges[0].minimum, .2); assert.equal(original.targetId, 'output-A'); assert.equal(original.profileId, 'device-A');
  assert.equal(original.model.config(profile).targetId, 'manual-network');
  const config = original.model.config(profile, 'stable-output-42'); assert.equal(config.targetId, 'stable-output-42');
  config.axisRanges[0].minimum = .7; assert.equal(original.model.ranges[0].minimum, .2);
});

test('restoring saved settings never connects or arms and retains exact application identity', () => {
  const value = draft(); value.applicationId = 19; const { panel, calls, emitted } = mounted(value);
  panel.appliedConfigurationId = 19;
  assert.equal(panel.targetId, value.targetId); assert.equal(panel.draftProfileId, value.profileId);
  assert.equal(panel.host, value.host); assert.equal(panel.isApplied(), true);
  assert.deepEqual(calls, []); assert.deepEqual(emitted, []);
});

test('successful explicit connect uses restored target ID and emits that target/profile pair', async () => {
  const { panel, calls, emitted } = mounted(); panel.connect(); await settled();
  assert.equal(calls[0][3], 1); assert.equal(calls[0][1].targetId, 'output-A'); assert.equal(calls[0][2].host, 'output-A.local');
  assert.equal(panel.applicationId, 31); assert.equal(emitted.at(-1).targetId, 'output-A');
  assert.equal(emitted.at(-1).targetGeneration, 1); assert.equal(emitted.at(-1).profileId, 'device-A'); assert.equal(calls.some(([kind]) => kind === 'arm'), false);
});

for (const outcome of ['resolve', 'reject']) test('pending A connect ' + outcome + ' cannot change selected B with equal revisions', async () => {
  const { panel, emitted } = mounted(); const pending = deferred(); panel.onConnect = () => pending.promise;
  panel.connect(); const next = draft('output-B'); next.applicationId = 23; restore(panel, next);
  const before = OutputSettingsDraft.copy(panel.draft); const count = emitted.length;
  if (outcome === 'resolve') pending.resolve(99); else pending.reject(Error('old failure'));
  await settled(); assert.equal(panel.targetId, 'output-B'); assert.equal(panel.applicationId, 23);
  assert.deepEqual(panel.draft, before); assert.equal(emitted.length, count);
});

test('A to B to A and a disappearing panel invalidate pending callbacks despite identical saved revisions', async () => {
  for (const transition of ['roundtrip', 'disappear']) {
    const { panel, emitted } = mounted(); const pending = deferred(); panel.onConnect = () => pending.promise; panel.connect();
    if (transition === 'roundtrip') { restore(panel, draft('output-B')); restore(panel, draft()); }
    else panel.aboutToDisappear();
    const count = emitted.length; pending.resolve(72); await settled();
    assert.equal(panel.applicationId, 0, transition); assert.equal(emitted.length, count, transition);
  }
});

test('newer edits and profile registry revisions invalidate pending connect success', async () => {
  for (const transition of ['edit', 'revision', 'profile']) {
    const { panel, emitted } = mounted(); const pending = deferred(); panel.onConnect = () => pending.promise; panel.connect();
    if (transition === 'edit') { panel.host = 'edited.local'; panel.changed(); }
    else if (transition === 'revision') { panel.profile = { ...profile, revision: 8 }; panel.profileChanged(); }
    else { panel.profileId = 'device-B'; panel.profileChanged(); }
    const count = emitted.length; pending.resolve(72); await settled();
    assert.equal(panel.applicationId, 0, transition); assert.equal(emitted.length, count, transition);
  }
});

test('pending success cannot apply after read-only is enabled, and direct connect/edit/arm are guarded', async () => {
  const { panel, calls, emitted } = mounted(); const pending = deferred(); panel.onConnect = () => { calls.push(['connect']); return pending.promise; };
  panel.connect(); panel.readOnly = true; pending.resolve(93); await settled();
  assert.equal(panel.applicationId, 0); assert.equal(emitted.length, 0);
  panel.applicationId = 7; panel.appliedConfigurationId = 7; panel.connection = 'connected';
  panel.connect(); panel.changed(); panel.arm();
  assert.deepEqual(calls, [['connect']]); assert.equal(emitted.length, 0);
  panel.disarm(); panel.disconnect(); assert.deepEqual(calls.slice(1), [['disarm', 'output-A', 1], ['disconnect', 'output-A', 1]]);
});

test('safety callbacks always use the restored target, including when a new controlled draft awaits restoration', () => {
  const { panel, calls, emitted } = mounted(); panel.draft = draft('output-B');
  panel.changed(); panel.connect(); panel.arm(); assert.deepEqual(calls, []); assert.deepEqual(emitted, []);
  panel.busy = true; panel.readOnly = true; panel.disarm(); panel.disconnect();
  assert.deepEqual(calls, [['disarm', 'output-A', 1], ['disconnect', 'output-A', 1]]);
});

test('same-device registry changes preserve axis ranges and disabled flags, add defaults, and emit visible axes only', () => {
  const value = draft(); value.model.ranges.push(range('V0', .3, .6, false));
  const { panel, calls, emitted } = mounted(value); assert.deepEqual(panel.model.ranges, value.model.ranges.slice(0, 2));
  panel.profile = { ...profile, revision: 8, axisOrder: ['R0', 'L0', 'A0'] }; panel.profileChanged();
  assert.deepEqual(panel.model.ranges, [range('R0', .1, .9), range('L0', .2, .8, false), range('A0')]);
  assert.deepEqual(emitted.at(-1).model.ranges, panel.model.ranges); assert.deepEqual(calls, [['disarm', 'output-A', 1]]);
  assert.deepEqual(value.model.ranges[2], range('V0', .3, .6, false));
});

test('hidden-axis ranges remain recoverable in parent-owned full ranges and preserve disabled values when re-enabled', () => {
  const saved = draft(); saved.model.ranges.push(range('V0', .35, .65, false));
  const { panel, emitted } = mounted(saved);
  panel.model.setRange('L0', .25, .75, false); panel.changed();
  const visible = emitted.at(-1).model.ranges;
  saved.model.ranges = saved.model.ranges.map(old => visible.find(next => next.axisId === old.axisId) ?? old);
  panel.profile = { ...profile, revision: 8, axisOrder: ['L0', 'V0'] };
  const restored = OutputSettingsDraft.copy(saved); restored.profileRevision = 8; restore(panel, restored);
  assert.deepEqual(panel.model.ranges, [range('L0', .25, .75, false), range('V0', .35, .65, false)]);
});

for (const order of ['profile-first', 'draft-first']) test('profile identity switch ' + order + ' never copies previous-device ranges', () => {
  const old = draft(); old.applicationId = 29; const { panel, emitted } = mounted(old);
  const next = draft('output-A', 'device-B'); next.applicationId = 29; next.model.ranges = [range('L0', .4, .55, true), range('R0', .3, .6, false)];
  if (order === 'profile-first') { panel.profileId = 'device-B'; panel.profileChanged(); assert.equal(panel.applicationId, 0); assert.equal(emitted.length, 0); restore(panel, next); }
  else { restore(panel, next); assert.equal(panel.applicationId, 0); assert.equal(emitted.length, 0); panel.profileId = 'device-B'; panel.profileChanged(); }
  assert.equal(panel.applicationId, 0); assert.deepEqual(panel.model.ranges, next.model.ranges);
  assert.equal(emitted.at(-1).profileId, 'device-B'); assert.equal(emitted.at(-1).targetId, 'output-A');
});

test('all profile ID, registry and draft watcher orders retain the new device-only axis range', () => {
  for (const order of [['id', 'profile', 'draft'], ['id', 'draft', 'profile'], ['profile', 'id', 'draft'],
    ['profile', 'draft', 'id'], ['draft', 'id', 'profile'], ['draft', 'profile', 'id']]) {
    const { panel } = mounted();
    const next = draft('output-A', 'device-B'); next.profileRevision = 8;
    next.model.ranges = [range('L0', .4, .6, false), range('V0', .3, .7, false)];
    for (const step of order) {
      if (step === 'id') { panel.profileId = 'device-B'; panel.profileChanged(); }
      else if (step === 'profile') { panel.profile = { ...profile, revision: 8, axisOrder: ['L0', 'V0'] }; panel.profileChanged(); }
      else restore(panel, next);
    }
    assert.deepEqual(panel.model.ranges, next.model.ranges, order.join(' → '));
    assert.equal(panel.applicationId, 0, order.join(' → '));
  }
});

test('old-panel drafts carry their captured identities so parent selection guards reject them', () => {
  const { panel } = mounted(); let current = draft('output-B', 'device-B'); let rejected = 0;
  panel.onDraftChange = incoming => { if (incoming.targetId !== current.targetId || incoming.profileId !== current.profileId) { rejected++; return; } current = incoming; };
  panel.host = 'old-panel-edit.local'; panel.changed();
  assert.equal(rejected, 1); assert.equal(current.targetId, 'output-B'); assert.equal(current.host, 'output-B.local');
});

test('explicit arm requires live applied configuration and stays bound to the restored target', () => {
  const { panel, calls } = mounted(); panel.connection = 'connected'; panel.applicationId = 4; panel.appliedConfigurationId = 5; panel.arm();
  panel.appliedConfigurationId = 4; panel.busy = true; panel.arm(); panel.busy = false; panel.arm();
  panel.armed = true; panel.arm(); assert.deepEqual(calls, [['arm', 'output-A', 1]]);
});

test('UI preserves 52vp wrapped controls, guards mutations, and explains durable explicit-only restore', () => {
  assert.match(source, /@Prop readOnly: boolean = false/);
  assert.match(source, /@Prop @Watch\('profileChanged'\) profileId: string = ''/);
  assert.match(source, /有效配置.*保存|有效设置.*保存/); assert.match(source, /恢复.*不会.*连接.*启用/);
  assert.ok((source.match(/wrap: FlexWrap\.Wrap/g) ?? []).length >= 2);
  for (const label of ['连接 / 应用配置', '断开', '启用发送', '解除发送']) {
    const start = source.indexOf("Button('" + label + "')");
    assert.ok(start >= 0, label);
    const button = source.slice(start, source.indexOf('.onClick(', start));
    assert.match(button, /constraintSize\(\{ minHeight: UiStyle\.control/, label);
    assert.match(button, /stateEffect\(true\)/, label);
  }
  const callbacks = source.split('  build() {')[1].split(/onChange:|onSelect:|onCommit:|\.onChange\(/).slice(1);
  assert.ok(callbacks.length >= 15);
  for (const callback of callbacks) assert.match(callback.slice(0, callback.indexOf('}')), /this\.canEdit\(\)/);
  assert.doesNotMatch(source, /配置仅在本次应用进程保留|this\.model\.setKind/);
  assert.match(source, /类型固定/);
});

for (const outcome of ['resolve', 'reject']) test('same-ID replacement generation rejects old connect ' + outcome + ' with unchanged profile and edit revisions', async () => {
  const { panel, emitted } = mounted(draft('tcp:0', 'device-A', 41));
  const pending = deferred(); let observedGeneration;
  panel.onConnect = (_config, _endpoint, generation) => { observedGeneration = generation; return pending.promise; };
  panel.connect(); assert.equal(observedGeneration, 41);
  const replacement = draft('tcp:0', 'device-A', 42); replacement.applicationId = 23;
  restore(panel, replacement); const count = emitted.length;
  if (outcome === 'resolve') pending.resolve(99); else pending.reject(Error('deleted target failed'));
  await settled(); assert.equal(panel.targetId, 'tcp:0'); assert.equal(panel.targetGeneration, 42);
  assert.equal(panel.applicationId, 23); assert.equal(emitted.length, count);
});

test('a queued same-ID generation update blocks old edits, connect and arm before restore, and safety callbacks retain old generation', async () => {
  const { panel, calls, emitted } = mounted(draft('tcp:0', 'device-A', 41));
  const pending = deferred(); panel.onConnect = () => pending.promise; panel.connect();
  panel.draft = draft('tcp:0', 'device-A', 42);
  panel.applicationId = 9; panel.appliedConfigurationId = 9; panel.connection = 'connected';
  panel.changed(); panel.connect(); panel.arm(); assert.equal(emitted.length, 0); assert.deepEqual(calls, []);
  pending.resolve(88); await settled(); assert.equal(panel.applicationId, 9); assert.equal(emitted.length, 0);
  panel.disarm(); panel.disconnect(); assert.deepEqual(calls, [['disarm', 'tcp:0', 41], ['disconnect', 'tcp:0', 41]]);
});

test('a retained old panel cannot grant edits, completion or safety actions to a recreated same-ID parent target', async () => {
  const { panel } = mounted(draft('tcp:0', 'device-A', 41));
  let current = draft('tcp:0', 'device-A', 42); const accepted = []; const rejected = [];
  const admit = (action, targetId, generation) => {
    (targetId === current.targetId && generation === current.targetGeneration ? accepted : rejected).push([action, targetId, generation]);
  };
  panel.onDraftChange = value => { admit('draft', value.targetId, value.targetGeneration); if (value.targetGeneration === current.targetGeneration) current = value; };
  panel.onArm = (id, generation) => admit('arm', id, generation);
  panel.onDisarm = (id, generation) => admit('disarm', id, generation);
  panel.onDisconnect = (id, generation) => admit('disconnect', id, generation);
  const pending = deferred(); panel.onConnect = (config, _endpoint, generation) => { admit('connect', config.targetId, generation); return pending.promise; };
  panel.connect(); pending.resolve(77); await settled();
  panel.appliedConfigurationId = 77; panel.connection = 'connected'; panel.arm();
  panel.host = 'stale-edit.local'; panel.changed(); panel.disarm(); panel.disconnect();
  assert.deepEqual(accepted, []); assert.ok(rejected.some(([action]) => action === 'draft'));
  for (const action of ['connect', 'arm', 'disarm', 'disconnect']) assert.ok(rejected.some(([name]) => name === action), action);
  assert.ok(rejected.every(([, id, generation]) => id === 'tcp:0' && generation === 41));
  assert.equal(current.targetGeneration, 42); assert.equal(current.host, 'tcp:0.local'); assert.equal(current.applicationId, 0);
});

test('zero or invalid generation grants no editing, connection, arm, disarm or disconnect callbacks', () => {
  for (const generation of [0, -1, NaN, Infinity, 1.5]) {
    const { panel, calls, emitted } = mounted(draft('tcp:0', 'device-A', generation));
    panel.applicationId = 9; panel.appliedConfigurationId = 9; panel.connection = 'connected';
    panel.changed(); panel.connect(); panel.arm(); panel.disarm(); panel.disconnect();
    assert.deepEqual(calls, [], String(generation)); assert.deepEqual(emitted, [], String(generation));
  }
});
