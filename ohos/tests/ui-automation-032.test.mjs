import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertVisibleLabels, motionSmokeLabels } from '../tools/ui-automation.mjs';

const tree = labels => ({ children: labels.map(text => ({
  attributes: { text, bounds: '[0,0][120,48]' }
})) });
const protocols = ['串口 / USB', 'TCP', 'UDP', 'WebSocket'];

test('navigation smoke requires every protocol label, not just a heading', () => {
  assert.doesNotThrow(() => assertVisibleLabels(tree(protocols), protocols));
  for (const missing of protocols) {
    assert.throws(() => assertVisibleLabels(tree(['添加设备', ...protocols.filter(x => x !== missing)]), protocols), /Missing rendered label/);
  }
});

const providerFields = {
  'Random': ['速度 · 倍', '输出范围 · RANGE', '最小值 · 0–1 · 控件值', '最大值 · 0–1 · 控件值',
    'Octaves · 叠加层数 · 1–8 · 控件值', 'Persistence · 持续度', 'Lacunarity · 频率倍率'],
  'Pattern': ['波形', '速度 · 倍', '输出范围 · RANGE', '最小值 · 0–1 · 控件值', '最大值 · 0–1 · 控件值'],
  'Custom Curve': ['插值类型', '时长 · 秒', '速度 · 倍', '循环', '结束时同步',
    '输出范围 · RANGE', '最小值 · 0–1 · 控件值', '最大值 · 0–1 · 控件值', '自定义控制点 · CURVE'],
  'Looping Script': ['Download 脚本', '插值类型', '速度 · 倍', '输出范围 · RANGE',
    '最小值 · 0–1 · 控件值', '最大值 · 0–1 · 控件值']
};
for (const [provider, fields] of Object.entries(providerFields)) {
  test('motion smoke recognizes saved ' + provider + ' and requires every applicable field', () => {
    const title = provider + ' · 生成器参数';
    const labels = motionSmokeLabels(tree([title]));
    assert.deepEqual(labels, [title, ...fields]);
    assert.doesNotThrow(() => assertVisibleLabels(tree(labels), labels));
    for (const missing of labels) {
      assert.throws(() => assertVisibleLabels(tree(labels.filter(x => x !== missing)), labels), /Missing rendered label/);
    }
    // Separate viewport dumps are valid: every field is still checked exactly.
    for (const label of labels) assert.doesNotThrow(() => assertVisibleLabels(tree([label]), [label]));
  });
}
test('provider detection rejects missing, unknown, ambiguous and zero-size headings', () => {
  for (const labels of [[], ['Motion 编辑器'], ['Unknown · 生成器参数'],
    ['Random · 生成器参数', 'Pattern · 生成器参数']]) {
    assert.throws(() => motionSmokeLabels(tree(labels)));
  }
  assert.throws(() => motionSmokeLabels({ attributes: { text: 'Random · 生成器参数', bounds: '[0,0][0,0]' } }));
  const duplicate = { attributes: { text: 'Pattern · 生成器参数', accessibilityText: 'Pattern · 生成器参数', bounds: '[0,0][120,48]' } };
  assert.equal(motionSmokeLabels(duplicate)[0], 'Pattern · 生成器参数');
});
test('expected field labels match production numeric composition and supported providers', () => {
  const panel = readFileSync(new URL('../entry/src/main/ets/components/MotionSettingsPanel.ets', import.meta.url), 'utf8');
  const shared = readFileSync(new URL('../entry/src/main/ets/components/CurvePointEditor.ets', import.meta.url), 'utf8');
  const model = readFileSync(new URL('../entry/src/main/ets/core/MotionConfiguration.ts', import.meta.url), 'utf8');
  const providerType = model.match(/export type MotionProviderId = (.*);/)[1];
  assert.deepEqual([...providerType.matchAll(/'([^']+)'/g)].map(m => m[1]).sort(), Object.keys(providerFields).sort());
  assert.ok(shared.includes("this.label + (this.unit.length > 0 ? ' · ' + this.unit : '')"));
  const numericLabels = [...panel.matchAll(/this.numberField\('[^']+', '([^']+)', .*?, '([^']*)'\)/g)]
    .map(m => m[1] + (m[2] ? ' · ' + m[2] : ''));
  for (const label of ['速度 · 倍', '最小值 · 0–1 · 控件值', '最大值 · 0–1 · 控件值']) {
    assert.ok(numericLabels.includes(label), label);
    for (const fields of Object.values(providerFields)) assert.ok(fields.includes(label));
  }
});

test('descriptions and empty bounds cannot substitute for a label', () => {
  assert.throws(() => assertVisibleLabels(tree(['choose TCP']), ['TCP']));
  assert.throws(() => assertVisibleLabels({ attributes: { text: 'TCP', bounds: '[0,0][0,0]' } }, ['TCP']));
});

test('device smoke wires concrete checks and has no settings mutation helper', () => {
  const source = readFileSync(new URL('../tools/ui-automation.mjs', import.meta.url), 'utf8');
  assert.match(source, /await requireLabels\(\['串口 \/ USB', 'TCP', 'UDP', 'WebSocket'\]\)/);
  assert.match(source, /await requireLabels\(motionSmokeLabels\(motionTree\)\)/);
  assert.match(source, /const motionTree = await waitFor\(' · 生成器参数'/);
  assert.doesNotMatch(source, /await requireLabels\(\['速度 · 倍', 'Random/);
  assert.doesNotMatch(source, /tapSwitch/);
  assert.match(source, /pidAfter === pidBefore/);
});
