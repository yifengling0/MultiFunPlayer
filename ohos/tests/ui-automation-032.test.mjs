import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertVisibleLabels } from '../tools/ui-automation.mjs';

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

test('motion label assertions fail if individual fields disappear', () => {
  const fields = ['速度 · 倍', 'Random · 生成器参数'];
  assert.doesNotThrow(() => assertVisibleLabels(tree(fields), fields));
  for (const missing of fields) {
    assert.throws(() => assertVisibleLabels(tree(['Motion 编辑器', ...fields.filter(x => x !== missing)]), fields), /Missing rendered label/);
  }
});

test('descriptions and empty bounds cannot substitute for a label', () => {
  assert.throws(() => assertVisibleLabels(tree(['choose TCP']), ['TCP']));
  assert.throws(() => assertVisibleLabels({ attributes: { text: 'TCP', bounds: '[0,0][0,0]' } }, ['TCP']));
});

test('device smoke wires concrete checks and has no settings mutation helper', () => {
  const source = readFileSync(new URL('../tools/ui-automation.mjs', import.meta.url), 'utf8');
  assert.match(source, /await requireLabels\(\['串口 \/ USB', 'TCP', 'UDP', 'WebSocket'\]\)/);
  assert.match(source, /await requireLabels\(\['速度 · 倍', 'Random · 生成器参数'\]\)/);
  assert.doesNotMatch(source, /tapSwitch/);
  assert.match(source, /pidAfter === pidBefore/);
});
