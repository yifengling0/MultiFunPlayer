#!/usr/bin/env node
/**
 * Device-level UI smoke for MultiFunPlayer OHOS.
 *
 * It drives the real app through hdc/uitest: launch, navigate every tool,
 * expand selected settings editors and check their labels. It does not edit
 * preferences, test persistence, connect outputs, or validate emitted frames.
 * Screenshots and layout dumps are kept as evidence.
 *
 * Usage:
 *   node tools/ui-automation.mjs
 *   HDC_TARGET=192.168.180.76:44945 node tools/ui-automation.mjs
 *   HDC="C:/.../hdc.exe" ARTIFACT_DIR=.hvigor/outputs/ui-automation node tools/ui-automation.mjs
 *
 * This is a real-device acceptance check, not a substitute for the node unit
 * suite: it checks navigation and selected rendered labels on the target.
 * Settings edits/persistence, playback, Pause/Stop and TCP/UDP output require
 * separate device acceptance. No hardware check runs when this module is imported.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const hdc = process.env.HDC || 'C:/Program Files/Huawei/DevEco Studio/sdk/default/openharmony/toolchains/hdc.exe';
const target = process.env.HDC_TARGET || '192.168.180.76:44945';
const bundle = 'com.multifunplayer.ohos';
const artifactDir = resolve(process.env.ARTIFACT_DIR || join(root, '.hvigor/outputs/ui-automation'));
const remoteLayout = '/data/local/tmp/mfp-ui-layout.json';
const remoteShot = '/data/local/tmp/mfp-ui-shot.png';

function run(args, { allowFailure = false } = {}) {
  const result = spawnSync(hdc, ['-t', target, ...args], { encoding: 'utf8', timeout: 30000 });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) {
    throw new Error(`hdc ${args.join(' ')} failed (${result.status}): ${result.stderr || result.stdout}`);
  }
  return (result.stdout || '').trim();
}
function sleep(ms) { return new Promise(resolveWait => setTimeout(resolveWait, ms)); }
function capture(name) {
  run(['shell', 'uitest', 'screenCap', '-p', remoteShot]);
  const local = join(artifactDir, name + '.png');
  run(['file', 'recv', remoteShot, local]);
  return local;
}
function dump(name = 'layout') {
  run(['shell', 'uitest', 'dumpLayout', '-p', remoteLayout, '-a']);
  const local = join(artifactDir, name + '.json');
  run(['file', 'recv', remoteLayout, local]);
  const tree = JSON.parse(readFileSync(local, 'utf8'));
  writeFileSync(join(artifactDir, name + '.nodes.txt'), flatten(tree).map(node =>
    `${node.text || node.accessibilityText || ''}\t${node.bounds}`).filter(line => line.trim().length > 0).join('\n'));
  return tree;
}
function flatten(node, depth = 0, output = []) {
  if (node === null || typeof node !== 'object') return output;
  const attributes = node.attributes || {};
  if (depth <= 60) {
    output.push({ text: attributes.text, accessibilityText: attributes.accessibilityText,
      bounds: attributes.bounds, type: node.type, depth });
  }
  for (const child of node.children || []) flatten(child, depth + 1, output);
  return output;
}
function nodes(tree, needle) {
  const wanted = needle.toLowerCase();
  return flatten(tree).filter(node => {
    const text = `${node.text || ''} ${node.accessibilityText || ''}`.toLowerCase();
    return text.includes(wanted);
  });
}
function parseBounds(bounds) {
  const match = /\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/.exec(bounds || '');
  if (match === null) return null;
  const [x1, y1, x2, y2] = match.slice(1).map(Number);
  return { x1, y1, x2, y2, x: Math.round((x1 + x2) / 2), y: Math.round((y1 + y2) / 2) };
}
function hit(tree, needle) {
  for (const node of nodes(tree, needle)) {
    const bounds = parseBounds(node.bounds);
    if (bounds !== null && bounds.x2 > bounds.x1 && bounds.y2 > bounds.y1) return bounds;
  }
  return null;
}
async function waitFor(needle, { timeout = 9000, label = needle } = {}) {
  const started = Date.now();
  let last = null;
  let attempt = 0;
  while (Date.now() - started < timeout) {
    last = dump('wait-' + label.replace(/[^\w\u4e00-\u9fa5-]+/g, '_') + '-' + attempt);
    if (hit(last, needle) !== null) return last;
    run(['shell', 'uitest', 'uiInput', 'swipe', '100', '2400', '100', '1200', '400']);
    await sleep(500);
    attempt++;
  }
  throw new Error(`Timed out waiting for UI text: ${label}\nVisible nodes:\n` +
    flatten(last || {}).filter(node => node.text).slice(0, 80).map(node => `${node.text} ${node.bounds}`).join('\n'));
}
async function click(needle, { optional = false, label = needle } = {}) {
  for (let attempt = 0; attempt < (optional ? 2 : 10); attempt++) {    const tree = dump('click-' + label.replace(/[^\w\u4e00-\u9fa5-]+/g, '_') + '-' + attempt);
    const bounds = hit(tree, needle);
    if (bounds !== null) {
      run(['shell', 'uitest', 'uiInput', 'click', String(bounds.x), String(bounds.y)]);
      await sleep(900);
      return tree;
    }
    // Content may be below the current viewport. Scroll the inspector and re-dump.
    run(['shell', 'uitest', 'uiInput', 'swipe', '640', '2300', '640', '1200', '350']);
    await sleep(700);
  }
  if (optional) return dump('click-missing-' + label);
  const tree = dump('click-failed-' + label);
  throw new Error(`Cannot find UI text: ${label}\nVisible nodes:\n` +
    flatten(tree).filter(node => node.text).slice(0, 100).map(node => `${node.text} ${node.bounds}`).join('\n'));
}
async function toggleExpand(label) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const tree = dump('expand-' + attempt + '-' + label);
    const collapsed = flatten(tree).find(node => (node.text || '').startsWith(label) && (node.text || '').includes('▾'));
    if (collapsed === undefined) {
      if (flatten(tree).some(node => (node.text || '').startsWith(label) && (node.text || '').includes('▴'))) return true;
      await click(label);
      await sleep(800);
      continue;
    }
    const bounds = parseBounds(collapsed.bounds);
    run(['shell', 'uitest', 'uiInput', 'click', String(bounds.x), String(bounds.y)]);
    await sleep(1000);
    const after = dump('expanded-' + attempt + '-' + label);
    if (flatten(after).some(node => (node.text || '').startsWith(label) && (node.text || '').includes('▴'))) return true;
  }
  throw new Error('Could not expand section: ' + label);
}
// Exact labels prevent a page heading or explanatory text from satisfying a
// missing control's assertion. This checks label presence, not event wiring.
export function assertVisibleLabels(tree, labels) {
  for (const label of labels) {
    const found = flatten(tree).some(node => {
      const bounds = parseBounds(node.bounds);
      return (node.text === label || node.accessibilityText === label) &&
        bounds !== null && bounds.x2 > bounds.x1 && bounds.y2 > bounds.y1;
    });
    if (!found) throw new Error('Missing rendered label: ' + label);
  }
}
async function requireLabels(labels) {
  for (const label of labels) {
    const tree = await waitFor(label);
    assertVisibleLabels(tree, [label]);
    check(true, 'rendered label: ' + label);
  }
}

// Match the active rendered provider, without changing the user's saved choice.
// Order follows MotionSettingsPanel so scrolling forward can reach each field.
const motionFields = {
  'Random': ['速度 · 倍', '输出范围 · RANGE', '最小值 · 0–1 · 控件值', '最大值 · 0–1 · 控件值',
    'Octaves · 叠加层数 · 1–8 · 控件值', 'Persistence · 持续度', 'Lacunarity · 频率倍率'],
  'Pattern': ['波形', '速度 · 倍', '输出范围 · RANGE', '最小值 · 0–1 · 控件值', '最大值 · 0–1 · 控件值'],
  'Custom Curve': ['插值类型', '时长 · 秒', '速度 · 倍', '循环', '结束时同步',
    '输出范围 · RANGE', '最小值 · 0–1 · 控件值', '最大值 · 0–1 · 控件值', '自定义控制点 · CURVE'],
  'Looping Script': ['Download 脚本', '插值类型', '速度 · 倍', '输出范围 · RANGE',
    '最小值 · 0–1 · 控件值', '最大值 · 0–1 · 控件值']
};
export function motionSmokeLabels(tree) {
  const suffix = ' · 生成器参数';
  const titles = new Set(flatten(tree).flatMap(node => {
    const bounds = parseBounds(node.bounds);
    if (bounds === null || bounds.x2 <= bounds.x1 || bounds.y2 <= bounds.y1) return [];
    return [node.text, node.accessibilityText].filter(value => typeof value === 'string' && value.endsWith(suffix));
  }));
  if (titles.size !== 1) throw new Error('Expected exactly one rendered Motion provider title');
  const title = [...titles][0];
  const provider = title.slice(0, -suffix.length);
  if (!Object.hasOwn(motionFields, provider)) throw new Error('Unsupported rendered Motion provider: ' + provider);
  return [title, ...motionFields[provider]];
}

const failures = [];
function check(condition, message) {
  if (!condition) { failures.push(message); console.error('FAIL ' + message); } else { console.log('ok   ' + message); }
}

async function smoke() {
  mkdirSync(artifactDir, { recursive: true });
  console.log(`target=${target}`);
  check(existsSync(hdc), 'hdc exists: ' + hdc);
  run(['shell', 'power-shell', 'wakeup'], { allowFailure: true });
  run(['shell', 'power-shell', 'setmode', '602'], { allowFailure: true });
  run(['shell', 'aa', 'force-stop', bundle], { allowFailure: true });
  await sleep(500);
  const started = run(['shell', 'aa', 'start', '-a', 'EntryAbility', '-b', bundle], { allowFailure: true });
  if (/start ability successfully/.test(started) === false) {
    throw new Error('Cannot start ' + bundle + ': ' + started);
  }
  await sleep(3000);
  check(/start ability successfully/.test(started), 'app starts');
  const pidBefore = run(['shell', 'pidof', bundle], { allowFailure: true });
  check(/^\d+/.test(pidBefore), 'app process is alive: ' + pidBefore);
  capture('01-library');
  check(hit(await dump('01-library'), '视频库') !== null, 'video library renders');

  console.log('STEP workspace');
  await click('控制', { label: 'workspace' });
  await click('收起参数', { optional: true, label: 'collapse-axis' });
  check(hit(await waitFor('运动与曲线'), '运动与曲线') !== null, 'script workspace renders');
  capture('02-script');

  console.log('STEP output');
  await click('连接', { label: 'output' });
  await waitFor('设备连接');
  check(true, 'connection page heading renders');
  capture('03-output');
  await click('＋ 添加', { label: 'add-output' });
  await waitFor('添加设备');
  await requireLabels(['串口 / USB', 'TCP', 'UDP', 'WebSocket']);
  capture('03-add-device');
  await click('‹ 设备列表', { label: 'back-to-output' });
  await waitFor('设备连接');

  console.log('STEP media');
  await click('媒体', { label: 'media' });
  await waitFor('打开视频列表');
  check(true, 'media workspace renders');
  capture('04-media');

  console.log('STEP settings');
  await click('设置', { label: 'settings' });
  await waitFor('通用设置');
  capture('05-settings');

  console.log('STEP general');
  await click('通用设置');
  await waitFor('界面密度');
  check(true, 'general settings editor renders');
  capture('06-general');

  console.log('STEP motion');
  await click('收起通用设置');
  await click('脚本', { label: 'script-again' });
  await toggleExpand('运动与曲线');
  await waitFor('Motion 编辑器');
  const motionTree = await waitFor(' · 生成器参数', { label: 'motion-provider' });
  await requireLabels(motionSmokeLabels(motionTree));
  capture('07-motion');
  await toggleExpand('运动与曲线');

  console.log('STEP motion done');
  const pidAfter = run(['shell', 'pidof', bundle], { allowFailure: true });
  check(/^\d+/.test(pidAfter) && pidAfter === pidBefore, 'same app process survives navigation: ' + pidAfter);
  capture('09-final');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    await smoke();
  } catch (error) {
    failures.push(String(error));
    console.error(error);
  }
  if (failures.length > 0) {
    console.error(`\n${failures.length} UI smoke failure(s). Artifacts: ${artifactDir}`);
    process.exitCode = 1;
  } else {
    console.log(`\nUI smoke passed. Artifacts: ${artifactDir}`);
  }
}
