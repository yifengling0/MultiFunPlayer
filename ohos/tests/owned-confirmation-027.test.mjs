import test from 'node:test';
import assert from 'node:assert/strict';
import { ConfirmationActions, ConfirmationOwner, ConfirmationRequest } from '../entry/src/main/ets/presentation/ConfirmationOwner.ts';

test('request defaults fail closed and request/actions cannot be rebound', () => {
  const request = new ConfirmationRequest();
  assert.equal(request.isCurrent(), false); assert.equal(request.danger, false);
  assert.equal(request.confirmLabel, '确认'); assert.equal(request.title, ''); assert.equal(request.message, '');
  assert.equal(request.onConfirm(), undefined); assert.equal(Object.isFrozen(request), true);
  const owner = new ConfirmationOwner(); const actions = owner.begin(request.isCurrent, request.onConfirm, () => {});
  assert.ok(actions instanceof ConfirmationActions); assert.equal(Object.isFrozen(actions), true);
  assert.throws(() => { actions.accept = () => assert.fail('rebound'); }, TypeError);
  assert.throws(() => { request.onConfirm = () => assert.fail('rebound'); }, TypeError);
  actions.accept(); assert.equal(owner.hasPending(), false);
});

for (const first of ['accept', 'cancel', 'stop']) test(`${first} consumes exactly once across all late native actions`, () => {
  const events = [], owner = new ConfirmationOwner();
  const actions = owner.begin(() => true, () => events.push('confirm'), () => events.push('stop'),
    () => true, () => { assert.equal(owner.hasPending(), false); events.push('dismiss'); });
  assert.equal(owner.hasPending(), true); assert.deepEqual(events, []);
  actions[first](); actions.accept(); actions.cancel(); actions.stop(); actions[first](); owner.close();
  assert.deepEqual(events, first === 'cancel' ? ['dismiss'] : ['dismiss', first === 'accept' ? 'confirm' : 'stop']);
  assert.equal(owner.hasPending(), false);
});

test('replacement dismisses only the previous controller and leaves all of its captured callbacks inert', () => {
  const events = [], owner = new ConfirmationOwner();
  const old = owner.begin(() => true, () => events.push('old-confirm'), () => events.push('old-stop'),
    () => true, () => events.push('old-dismiss'));
  const current = owner.begin(() => true, () => events.push('new-confirm'), () => events.push('new-stop'),
    () => true, () => events.push('new-dismiss'));
  old.accept(); old.cancel(); old.stop(); assert.equal(owner.hasPending(), true);
  assert.deepEqual(events, ['old-dismiss']); current.accept();
  assert.deepEqual(events, ['old-dismiss', 'new-dismiss', 'new-confirm']);
});

for (const change of ['source', 'target', 'profile', 'axis', 'foreground', 'page', 'readOnly', 'draftOwner', 'draftEpoch', 'tool', 'width', 'height']) {
  test(`captured ${change} replacement before a native callback cannot confirm`, () => {
    const owner = new ConfirmationOwner(), state = { source: 'one', target: 'one', profile: 'one', axis: 'L0', foreground: true,
      page: {}, readOnly: false, draftOwner: {}, draftEpoch: 1, tool: 'settings', width: 320, height: 240 };
    const snapshot = { ...state }, events = [];
    const current = () => Object.keys(snapshot).every(key => state[key] === snapshot[key]);
    const actions = owner.begin(current, () => events.push('confirm'), () => events.push('stop'),
      () => state.page === snapshot.page && state.foreground, () => events.push('dismiss'));
    state[change] = typeof state[change] === 'boolean' ? !state[change] : typeof state[change] === 'number' ? state[change] + 1 : 'replacement';
    actions.accept(); assert.deepEqual(events, ['dismiss']);
    Object.assign(state, snapshot); actions.accept(); actions.stop(); assert.deepEqual(events, ['dismiss']);
  });
}

test('Stop independently uses its page guard after target replacement and clears pending confirmation', () => {
  const owner = new ConfirmationOwner(); let targetCurrent = true, pageCurrent = true; const events = [];
  const actions = owner.begin(() => targetCurrent, () => events.push('confirm'), () => events.push('stop'),
    () => pageCurrent, () => events.push('dismiss'));
  targetCurrent = false; actions.stop(); targetCurrent = true; actions.accept();
  assert.deepEqual(events, ['dismiss', 'stop']); assert.equal(owner.hasPending(), false);
  const retiredPage = owner.begin(() => true, () => events.push('confirm'), () => events.push('stop'), () => pageCurrent);
  pageCurrent = false; retiredPage.stop(); assert.deepEqual(events, ['dismiss', 'stop']);
});

test('default Stop guard fails closed with the original request guard', () => {
  const owner = new ConfirmationOwner(); let current = true, stops = 0;
  const actions = owner.begin(() => current, () => assert.fail('confirm'), () => stops++);
  current = false; actions.stop(); current = true; actions.stop(); assert.equal(stops, 0);
});

test('lifecycle close retires before native cancellation and tolerates a throwing close', () => {
  const owner = new ConfirmationOwner(); let actions, closes = 0, checks = 0;
  actions = owner.begin(() => { checks++; return true; }, () => assert.fail('confirm'), () => assert.fail('stop'),
    () => { checks++; return true; }, () => {
      closes++; assert.equal(owner.hasPending(), false); actions.accept(); actions.stop(); actions.cancel();
      throw new Error('native controller already closed');
    });
  assert.doesNotThrow(() => owner.close()); actions.accept(); actions.stop(); actions.cancel(); owner.close();
  assert.equal(closes, 1); assert.equal(checks, 0); assert.equal(owner.hasPending(), false);
});

for (const action of ['accept', 'stop']) test(`${action} checks ownership after a failing native close`, () => {
  const owner = new ConfirmationOwner(); const events = []; let current = true, actions;
  actions = owner.begin(() => current, () => events.push('confirm'), () => events.push('stop'), () => current, () => {
    events.push('dismiss'); actions.accept(); actions.stop(); current = false; throw new Error('native close');
  });
  assert.doesNotThrow(() => actions[action]()); current = true; actions[action](); assert.deepEqual(events, ['dismiss']);
});

test('valid captured action still executes once when native close alone throws', () => {
  for (const action of ['accept', 'stop']) {
    const events = [], owner = new ConfirmationOwner();
    const actions = owner.begin(() => true, () => events.push('confirm'), () => events.push('stop'), () => true,
      () => { events.push('dismiss'); throw new Error('close failed'); });
    assert.doesNotThrow(() => actions[action]()); actions[action]();
    assert.deepEqual(events, ['dismiss', action === 'accept' ? 'confirm' : 'stop']);
  }
});

test('dismissal opening a replacement request prevents the consumed request from executing', () => {
  const owner = new ConfirmationOwner(); const events = []; let replacement;
  const old = owner.begin(() => true, () => assert.fail('old-confirm'), () => assert.fail('old-stop'), () => true, () => {
    replacement = owner.begin(() => true, () => events.push('new-confirm'), () => events.push('new-stop'));
  });
  old.accept(); assert.equal(owner.hasPending(), true); replacement.accept(); assert.deepEqual(events, ['new-confirm']);
});

test('reentrant begin while replacing an old dialog does not revive or leak the intermediate request', () => {
  const owner = new ConfirmationOwner(); const events = []; let latest;
  owner.begin(() => true, () => assert.fail('old-confirm'), () => assert.fail('old-stop'), () => true, () => {
    events.push('old-dismiss');
    latest = owner.begin(() => true, () => events.push('latest-confirm'), () => assert.fail('latest-stop'));
  });
  const intermediate = owner.begin(() => true, () => assert.fail('intermediate-confirm'), () => assert.fail('intermediate-stop'),
    () => true, () => events.push('intermediate-dismiss'));
  intermediate.accept(); intermediate.stop(); intermediate.cancel(); latest.accept();
  assert.deepEqual(events, ['old-dismiss', 'intermediate-dismiss', 'latest-confirm']);
});

for (const boundary of ['dismiss', 'guard']) test(`reentrant close in ${boundary} cancels acceptance even when no dialog remains active`, () => {
  const owner = new ConfirmationOwner(); let confirmed = 0;
  const actions = owner.begin(() => { if (boundary === 'guard') owner.close(); return true; }, () => confirmed++, () => {},
    () => true, () => { if (boundary === 'dismiss') owner.close(); });
  actions.accept(); assert.equal(confirmed, 0); assert.equal(owner.hasPending(), false);
});

for (const action of ['accept', 'stop']) test(`throwing ${action} guard consumes safely without a business callback`, () => {
  const owner = new ConfirmationOwner(); const throws = () => { throw new Error('retired owner'); };
  const actions = owner.begin(throws, () => assert.fail('confirm'), () => assert.fail('stop'), throws);
  assert.doesNotThrow(() => actions[action]()); assert.equal(owner.hasPending(), false);
});

test('business failure cannot restore or repeat the consumed confirmation', () => {
  const owner = new ConfirmationOwner(); let attempts = 0;
  const actions = owner.begin(() => true, () => { attempts++; throw new Error('operation failed'); }, () => assert.fail('stop'));
  assert.throws(() => actions.accept(), /operation failed/); assert.equal(owner.hasPending(), false);
  actions.accept(); actions.cancel(); actions.stop(); assert.equal(attempts, 1);
});

test('cancel, replacement, layout close and Stop never apply retained 0.24 draft payloads', async () => {
  const { SettingsDraftOwner } = await import('../entry/src/main/ets/presentation/SettingsDraftOwner.ts');
  for (const action of ['cancel', 'stop', 'close', 'replace']) {
    const drafts = new SettingsDraftOwner(), lease = drafts.open('profile:A', 'port', 'baseline:8080', '8080');
    assert.equal(drafts.write(lease.token, 'baseline:8080', '1e-', true), true);
    const owner = new ConfirmationOwner(); let commits = 0, stops = 0;
    const actions = owner.begin(() => true, () => commits++, () => stops++);
    if (action === 'close') owner.close();
    else if (action === 'replace') owner.begin(() => false, () => commits++, () => stops++);
    else actions[action]();
    actions.accept(); assert.equal(commits, 0); assert.equal(stops, action === 'stop' ? 1 : 0);
    assert.equal(drafts.read(lease.token, 'baseline:8080'), '1e-'); assert.equal(drafts.hasPending('profile:A'), true);
  }
});
