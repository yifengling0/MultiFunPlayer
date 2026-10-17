import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';

const folder = new URL('../entry/src/main/ets/presentation/immersive/', import.meta.url);
const contexts = new Map();
let serial = 0;
globalThis.__mfpMaterialTestContexts = contexts;
globalThis.Color = { Transparent: '#00000000', White: '#FFFFFFFF' };
const storage = new Map(), revisions = [];
globalThis.AppStorage = { setOrCreate(key, value) { storage.set(key, value); revisions.push([key, value]); } };

registerHooks({
  resolve(specifier, context, next) {
    const parent = context.parentURL ? new URL(context.parentURL) : undefined;
    const id = parent?.searchParams.get('case');
    if (specifier === '@ohos.deviceInfo' || specifier === '@ohos.arkui.uiMaterial') {
      const name = specifier === '@ohos.deviceInfo' ? 'device' : 'native';
      const state = contexts.get(id);
      if (name === 'native') state.nativeModuleLoads++;
      return { url: `data:text/javascript,${encodeURIComponent(`export default globalThis.__mfpMaterialTestContexts.get('${id}').${name};`)}`, shortCircuit: true };
    }
    if (specifier.startsWith('.') && parent?.pathname.includes('/presentation/')) {
      const url = new URL(specifier, parent);
      if (!/\.(ets|ts)$/.test(url.pathname)) url.pathname += url.pathname.endsWith('/UiStyle') ? '.ts' : '.ets';
      if (id && url.pathname.includes('/immersive/')) url.searchParams.set('case', id);
      if (url.pathname.endsWith('/NativeImmersiveMaterialApi26.ets')) {
        const state = contexts.get(id);
        state.adapterImports++;
        if (state.importFailure) throw Error('Simulated missing native module');
      }
      return { url: url.href, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('.ets')) {
      let source = fs.readFileSync(parsed, 'utf8')
        .replace(/ImmersiveMaterialAdapter, /g, '');
      if (parsed.pathname.endsWith('/NativeImmersiveMaterialApi26.ets')) {
        source = `await globalThis.__mfpMaterialTestContexts.get('${parsed.searchParams.get('case')}').gate;\n` + source;
      }
      return { format: 'module', source: stripTypeScriptTypes(source), shortCircuit: true };
    }
    return next(url, context);
  }
});

async function setup(api, extra = {}) {
  const id = String(++serial), state = { adapterImports: 0, nativeModuleLoads: 0, constructed: [],
    support: true, level: 0, gate: undefined, ...extra };
  state.device = { get sdkApiVersion() { if (state.deviceError) throw Error('device'); return api; } };
  state.native = {
    Material: { empty: { empty: true } },
    MaterialLevel: { EXQUISITE: 0, GENTLE: 1, SMOOTH: 2 },
    ImmersiveStyle: { ULTRA_THIN: 0, THIN: 1, REGULAR: 2, THICK: 3, ULTRA_THICK: 4 },
    isImmersiveMaterialSupported() { if (state.supportError) throw Error('support'); return state.support; },
    getGlobalMaterialLevel() { if (state.levelError) throw Error('level'); return state.level; },
    ImmersiveMaterial: class { constructor(options) { if (state.constructorError) throw Error('material');
      this.options = options; state.constructed.push(this); } }
  };
  contexts.set(id, state);
  const managerUrl = new URL('ImmersiveMaterialManager.ets?case=' + id, folder);
  const module = await import(managerUrl.href);
  const modifiers = await import(new URL('ImmersiveMaterialModifiers.ets?case=' + id, folder).href);
  return { ...module, ...modifiers, state, manager: module.ImmersiveMaterialManager };
}
function attributes(native = false, fail = '') {
  const calls = [], instance = { calls };
  for (const method of ['backgroundColor', 'border', 'borderRadius', 'menuBackgroundColor', 'selectedColor',
    ...(native ? ['systemMaterial', 'menuSystemMaterial'] : [])]) {
    instance[method] = function(value) { calls.push([method, value]); if (method === fail && !value?.empty) throw Error(method); return instance; };
  }
  for (const method of ['onChange', 'onSelect', 'enabled', 'value', 'onClick']) {
    instance[method] = () => { throw Error('Unexpected behavioral change: ' + method); };
  }
  return instance;
}
const names = calls => calls.map(call => call[0]);
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { resolve, promise }; };

for (const api of [20, 25, 0, -1, NaN, Infinity, 26.5, '26', undefined, null]) {
  test('API ' + String(api) + ' never imports or invokes API26 module/bindings', async () => {
    const { manager, state, MfpSelectMaterialModifier, MfpToggleMaterialModifier, MfpSliderMaterialModifier } = await setup(api);
    assert.equal((await manager.initialize()).state, 'unsupported-runtime');
    assert.equal(state.adapterImports, 0); assert.equal(state.nativeModuleLoads, 0);
    const select = attributes(), toggle = attributes(), slider = attributes();
    new MfpSelectMaterialModifier(1).applyNormalAttribute(select);
    new MfpToggleMaterialModifier(1).applyNormalAttribute(toggle);
    new MfpSliderMaterialModifier(1).applyNormalAttribute(slider);
    assert.deepEqual(select.calls, [['backgroundColor', '#FFFFFF'], ['border', { width: 1, color: '#DFE4EA' }],
      ['borderRadius', 8], ['menuBackgroundColor', '#FFFFFF']]);
    assert.deepEqual(toggle.calls, [['selectedColor', '#236B73']]); assert.deepEqual(slider.calls, []);
    for (const method of ['decorateDialog', 'decorateCustomDialog']) {
      const options = { title: 'Confirm', builder() {}, cancel() {}, onWillDismiss() {}, buttons: [{ action() {} }] };
      assert.equal(manager[method](options), options); assert.equal('systemMaterial' in options, false);
    }
  });
}

for (const api of [26, 27]) for (const level of [0, 1, 2]) {
  test(`API${api} supports actual native modifiers at unmodified system level ${level}`, async () => {
    const { manager, state, MfpSelectMaterialModifier, MfpToggleMaterialModifier, MfpSliderMaterialModifier } = await setup(api, { level });
    const first = manager.initialize(); assert.equal(manager.initialize(), first);
    const status = await first; assert.equal(status.state, 'available'); assert.equal(status.materialLevel, level);
    assert.equal(state.adapterImports, 1); assert.equal(state.nativeModuleLoads, 1);
    assert.equal(state.constructed.length, 3);
    for (const material of state.constructed) {
      assert.equal(material.options.materialColor, '#00000000');
      assert.equal(material.options.colorInvert, false);
      if (material.options.style === 3) {
        assert.equal(material.options.interactive, false); assert.equal('lightEffect' in material.options, false);
      } else {
        assert.equal(material.options.interactive, true);
        assert.deepEqual(material.options.lightEffect, { color: '#FFFFFFFF' });
      }
      assert.equal('materialLevel' in material.options, false);
    }
    const select = attributes(true), toggle = attributes(true), slider = attributes(true);
    new MfpSelectMaterialModifier(1).applyNormalAttribute(select);
    new MfpToggleMaterialModifier(1).applyNormalAttribute(toggle);
    new MfpSliderMaterialModifier(1).applyNormalAttribute(slider);
    assert.deepEqual(names(select.calls), ['systemMaterial', 'menuSystemMaterial', 'borderRadius']);
    assert.equal(select.calls[0][1].options.style, 2); assert.equal(select.calls[1][1].options.style, 3);
    assert.deepEqual(names(toggle.calls), ['systemMaterial']); assert.equal(toggle.calls[0][1].options.style, 0);
    assert.deepEqual(names(slider.calls), ['systemMaterial']); assert.equal(slider.calls[0][1].options.style, 0);
    assert.equal(state.level, level);
    assert.equal(storage.has('mfpImmersiveMaterialRevision'), true);
  });
}

for (const [extra, expected] of [[{ support: false }, 'unsupported-device'], [{ support: 'true' }, 'unsupported-device'],
  [{ support: 1 }, 'unsupported-device'], [{ level: 99 }, 'unsupported-device'],
  [{ level: '0' }, 'unsupported-device'], [{ supportError: true }, 'unavailable'],
  [{ levelError: true }, 'unavailable'], [{ constructorError: true }, 'unavailable'],
  [{ importFailure: true }, 'unavailable'], [{ deviceError: true }, 'unsupported-runtime']]) {
  test('capability/import failure falls back: ' + JSON.stringify(extra), async () => {
    const { manager, MfpSelectMaterialModifier } = await setup(26, extra);
    assert.equal((await manager.initialize()).state, expected);
    const select = attributes(); new MfpSelectMaterialModifier(0).applyNormalAttribute(select);
    assert.deepEqual(names(select.calls), ['backgroundColor', 'border', 'borderRadius', 'menuBackgroundColor']);
  });
}

test('late import completion after reset cannot restore stale material or revision', async () => {
  const wait = deferred(); const { manager, state, MfpSelectMaterialModifier } = await setup(26, { gate: wait.promise });
  const pending = manager.initialize(); manager.reset(); const afterReset = revisions.length;
  wait.resolve(); await pending;
  assert.equal(manager.status().state, 'uninitialized'); assert.equal(revisions.length, afterReset);
  const select = attributes(); new MfpSelectMaterialModifier(1).applyNormalAttribute(select);
  assert.equal(names(select.calls).includes('systemMaterial'), false);
  assert.equal((await manager.initialize()).state, 'available');
  assert.equal(state.adapterImports, 2);
});

test('loading remains safe, then revision reapplies material without behavioral callbacks', async () => {
  const wait = deferred(); const { manager, MfpSelectMaterialModifier } = await setup(26, { gate: wait.promise });
  const pending = manager.initialize(); const old = attributes();
  new MfpSelectMaterialModifier(0).applyNormalAttribute(old);
  assert.equal(old.calls[0][0], 'backgroundColor');
  wait.resolve(); await pending; const current = attributes(true);
  new MfpSelectMaterialModifier(storage.get(manager.revisionKey)).applyNormalAttribute(current);
  assert.deepEqual(names(current.calls), ['systemMaterial', 'menuSystemMaterial', 'borderRadius']);
});

for (const method of ['decorateDialog', 'decorateCustomDialog']) {
  test(method + ' adds only material and preserves every callback/object identity', async () => {
    const { manager } = await setup(26); await manager.initialize();
    let effects = 0; const callback = () => { effects++; }, buttons = [{ value: 'Apply', action: callback }];
    const options = { title: 'Confirm', builder: callback, cancel: callback, onWillDismiss: callback,
      onDidAppear: callback, onDidDisappear: callback, autoCancel: false, buttons };
    const original = { ...options };
    const result = manager[method](options);
    assert.equal(result, options); assert.equal(result.systemMaterial.options.style, 3);
    assert.deepEqual(Object.keys(result).sort(), [...Object.keys(original), 'systemMaterial'].sort());
    for (const key of Object.keys(original)) assert.equal(result[key], original[key]);
    assert.equal(effects, 0);
  });
  test(method + ' frozen options fail safely with no callback invocation', async () => {
    const { manager } = await setup(26); await manager.initialize();
    let effects = 0; const options = Object.freeze({ builder() { effects++; }, cancel() { effects++; } });
    assert.equal(manager[method](options), options); assert.equal('systemMaterial' in options, false);
    assert.equal(effects, 0); assert.equal(manager.status().state, 'unavailable');
    assert.equal((await manager.initialize()).state, 'unavailable', 'resolved loading promise cannot mask a later failure');
  });
  for (const field of ['backgroundColor', 'backgroundBlurStyle', 'backgroundBlurStyleOptions', 'backgroundEffect',
    'borderWidth', 'borderColor', 'shadow', 'systemMaterial']) {
    test(method + ' respects explicit conflicting ' + field, async () => {
      const { manager } = await setup(26); await manager.initialize();
      const options = { builder() {}, cancel() {}, [field]: 0 };
      assert.equal(manager[method](options), options);
    });
  }
}

test('missing Select menu binding touches no new API before safe fallback', async () => {
  const { manager, MfpSelectMaterialModifier } = await setup(26); await manager.initialize();
  const select = attributes(true); delete select.menuSystemMaterial;
  new MfpSelectMaterialModifier(0).applyNormalAttribute(select);
  assert.deepEqual(names(select.calls), ['backgroundColor', 'border', 'borderRadius', 'menuBackgroundColor']);
  assert.equal(manager.status().state, 'unavailable');
});
test('partial Select native exception clears material in API26 island before fallback', async () => {
  const { manager, MfpSelectMaterialModifier } = await setup(26); await manager.initialize();
  const select = attributes(true, 'menuSystemMaterial');
  new MfpSelectMaterialModifier(0).applyNormalAttribute(select);
  assert.deepEqual(names(select.calls), ['systemMaterial', 'menuSystemMaterial', 'systemMaterial', 'menuSystemMaterial',
    'backgroundColor', 'border', 'borderRadius', 'menuBackgroundColor']);
  assert.equal(select.calls[2][1].empty, true); assert.equal(select.calls[3][1].empty, true);
  const next = attributes(); new MfpSelectMaterialModifier(1).applyNormalAttribute(next);
  assert.equal(names(next.calls).includes('systemMaterial'), false);
});
for (const kind of ['Toggle', 'Slider']) test(kind + ' exception clears API26 effect without behavior', async () => {
  const context = await setup(26); await context.manager.initialize();
  const instance = attributes(true, 'systemMaterial');
  new context['Mfp' + kind + 'MaterialModifier'](1).applyNormalAttribute(instance);
  assert.equal(instance.calls[1][0], 'systemMaterial'); assert.equal(instance.calls[1][1].empty, true);
  assert.equal(context.manager.status().state, 'unavailable');
});

for (const kind of ['Select', 'Toggle', 'Slider']) test(kind + ' cleanup failure reports unconfirmed and never overlays fallback or loops publication', async () => {
  const context = await setup(26); await context.manager.initialize();
  const instance = attributes(true);
  const failingMethod = kind === 'Select' ? 'menuSystemMaterial' : 'systemMaterial';
  instance[failingMethod] = value => { instance.calls.push([failingMethod, value]); throw Error('always fails'); };
  new context['Mfp' + kind + 'MaterialModifier'](1).applyNormalAttribute(instance);
  assert.equal(context.manager.status().state, 'visual-unconfirmed');
  assert.ok(instance.calls.every(([name]) => ['systemMaterial', 'menuSystemMaterial'].includes(name)));
  const publicationCount = revisions.length, callCount = instance.calls.length;
  for (let i = 0; i < 5; i++) new context['Mfp' + kind + 'MaterialModifier'](i + 2).applyNormalAttribute(instance);
  assert.equal(revisions.length, publicationCount); assert.equal(instance.calls.length, callCount);
  assert.equal((await context.manager.initialize()).state, 'visual-unconfirmed');
  const unaffected = attributes(); new context.MfpSelectMaterialModifier(2).applyNormalAttribute(unaffected);
  assert.equal(unaffected.calls[0][0], 'backgroundColor', 'a new unrelated control still gets the safe style');
});

test('successful cleanup publishes failure only once across following modifier updates', async () => {
  const { manager, MfpSelectMaterialModifier } = await setup(26); await manager.initialize();
  const failed = attributes(true, 'menuSystemMaterial'); new MfpSelectMaterialModifier(1).applyNormalAttribute(failed);
  const publicationCount = revisions.length;
  for (let i = 0; i < 5; i++) new MfpSelectMaterialModifier(i + 2).applyNormalAttribute(attributes());
  assert.equal(revisions.length, publicationCount); assert.equal(manager.status().state, 'unavailable');
});

test('official-engine-derived staged modifier model removes fallback surface on the same control', async () => {
  // Model only: ArkComponent cleanStageValue/applyStage plus ViewPU post-update cleanup.
  // This exercises the production modifier branches but does not claim real rendering.
  const wait = deferred(); const context = await setup(26, { gate: wait.promise });
  const pending = context.manager.initialize(); const instance = attributes(true);
  const committed = new Map(), stage = new Map();
  for (const name of ['backgroundColor', 'border', 'borderRadius', 'menuBackgroundColor', 'selectedColor', 'systemMaterial', 'menuSystemMaterial']) {
    instance[name] = value => { stage.set(name, value); return instance; };
  }
  const patch = () => {
    for (const key of committed.keys()) if (!stage.has(key)) committed.delete(key);
    for (const [key, value] of stage) committed.set(key, value);
    stage.clear();
  };
  new context.MfpSelectMaterialModifier(0).applyNormalAttribute(instance); patch();
  assert.equal(committed.get('backgroundColor'), '#FFFFFF');
  wait.resolve(); await pending;
  new context.MfpSelectMaterialModifier(1).applyNormalAttribute(instance); patch();
  assert.equal(committed.has('backgroundColor'), false); assert.equal(committed.has('border'), false);
  assert.equal(committed.has('menuBackgroundColor'), false); assert.equal(committed.has('systemMaterial'), true);
});

test('source confines every new binding/import to the dynamically loaded island', () => {
  for (const file of ['ImmersiveMaterialContract.ets', 'ImmersiveMaterialManager.ets', 'ImmersiveMaterialModifiers.ets']) {
    const text = fs.readFileSync(new URL(file, folder), 'utf8');
    assert.doesNotMatch(text, /from ['"]@ohos\.arkui\.uiMaterial/);
    assert.doesNotMatch(text, /\.systemMaterial\(|\.menuSystemMaterial\(|\.apiAvailable\(/);
  }
  const manager = fs.readFileSync(new URL('ImmersiveMaterialManager.ets', folder), 'utf8');
  assert.match(manager, /await import\('\.\/NativeImmersiveMaterialApi26'\)/);
  assert.match(manager, /deviceInfo\.sdkApiVersion/);
  const native = fs.readFileSync(new URL('NativeImmersiveMaterialApi26.ets', folder), 'utf8');
  assert.doesNotMatch(native, /setGlobalMaterialLevel|onClick\(|onChange\(|\.action\(|\.cancel\(|\.builder\(/);
});
