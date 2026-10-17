import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { videoWorkspaceLayout } from '../entry/src/main/ets/core/VideoLayout.ts';

function inBounds(rect, width, height) {
  for (const n of [rect.x, rect.y, rect.width, rect.height]) assert.ok(Number.isFinite(n) && n >= 0);
  assert.ok(rect.x + rect.width <= width + 1e-8);
  assert.ok(rect.y + rect.height <= height + 1e-8);
}

test('phone portrait keeps a pinned video above independently scrolling parameters', () => {
  const layout = videoWorkspaceLayout(400, 800, true, false);
  assert.equal(layout.sideBySide, false);
  assert.deepEqual([layout.video.x, layout.video.width], [0, 400]);
  assert.ok(layout.video.height >= 280);
  assert.ok(layout.settings.height >= 400);
  assert.ok(layout.settings.y >= layout.video.y + layout.video.height);
  assert.equal(layout.controlsHeight, 104);
});

test('phone landscape, tablet landscape and 2in1 place parameters beside the video', () => {
  for (const [width, height] of [[600, 320], [640, 360], [800, 360], [1024, 768], [1366, 900], [1920, 1080]]) {
    const layout = videoWorkspaceLayout(width, height, true, false);
    assert.equal(layout.sideBySide, true);
    assert.equal(layout.video.y, 72);
    assert.equal(layout.settings.y, 72);
    assert.ok(layout.settings.width >= 320 && layout.settings.width <= 520);
    assert.ok(layout.settings.x >= layout.video.x + layout.video.width);
    assert.ok(layout.video.height - layout.controlsHeight >= 180);
  }
});

test('portrait tablet and narrow floating window use vertical split without breaking bounds', () => {
  for (const [width, height] of [[800, 1280], [600, 900], [360, 640], [320, 480], [480, 640]]) {
    const layout = videoWorkspaceLayout(width, height, true, false);
    assert.equal(layout.sideBySide, false);
    assert.ok(layout.settings.height > 100);
    inBounds(layout.video, width, height);
    inBounds(layout.settings, width, height);
  }
});

test('fullscreen uses the current safe window with controls outside the native frame', () => {
  for (const [width, height] of [[400, 800], [800, 360], [1366, 900]]) {
    const layout = videoWorkspaceLayout(width, height, true, true);
    assert.equal(layout.headerHeight, 0);
    assert.deepEqual([layout.video.x, layout.video.y, layout.video.width, layout.video.height], [0, 0, width, height]);
    assert.equal(layout.settings.height, 0);
    assert.equal(layout.controlsHeight, 104);
    assert.ok(layout.video.height - layout.controlsHeight > 0);
    assert.deepEqual(videoWorkspaceLayout(width, height, true, false), videoWorkspaceLayout(width, height, true, false));
  }
});

test('layout is bounded through breakpoints, rotation, multiwindow and transient tiny sizes', () => {
  for (const width of [1, 80, 320, 400, 600, 719, 720, 800, 999, 1000, 1200, 1920]) {
    for (const height of [1, 80, 240, 360, 600, 800, 1280]) {
      for (const visible of [false, true]) for (const fullscreen of [false, true]) {
        const layout = videoWorkspaceLayout(width, height, visible, fullscreen);
        inBounds(layout.video, width, height);
        inBounds(layout.settings, width, height);
        assert.ok(layout.controlsHeight <= layout.video.height);
        if (!visible) assert.equal(layout.settings.y, layout.headerHeight);
      }
    }
  }
  for (const value of [NaN, Infinity, -10, 0]) {
    const layout = videoWorkspaceLayout(value, value, true, true);
    inBounds(layout.video, 1, 1);
  }
});

const source = readFileSync(new URL('../entry/src/main/ets/pages/Index.ets', import.meta.url), 'utf8');
const methodStart = source.indexOf('  workspaceLayout():');
const methodEnd = source.indexOf('  drawTrace():', methodStart);
const LayoutController = new Function('videoWorkspaceLayout', 'KeyCode', 'NativeWindowPresentation', stripTypeScriptTypes(
  'class LayoutController {' + source.slice(methodStart, methodEnd) + '}') + '; return LayoutController;')(
  videoWorkspaceLayout, { KEYCODE_ESCAPE: 2070 }, { requestForOwner() {} });

test('actual fullscreen, system Back, Escape and resize methods leave player, clock and script intact', () => {
  const page = new LayoutController();
  Object.assign(page, { generalConfiguration: {appOrientation:'auto'}, foreground: true, viewActive: true, widthVp: 400, heightVp: 800, videoMode: true, videoFullscreen: false,
    positionMs: 45212, durationMs: 90000, playbackSpeed: 1.5, globalOffsetMs: 250,
    axisOffsetMs: -50, axisScale: 1.4, selectedAxis: 2, surfaceId: 'same-surface',
    document: { id: 'same-script' }, playing: true });
  const noTouch = new Proxy({}, { get() { throw Error('layout must not call a player or engine method'); } });
  page.video = noTouch; page.engine = noTouch;
  const document = page.document;
  for (let repeat = 0; repeat < 10; repeat++) {
    page.setVideoFullscreen(true);
    assert.equal(page.videoFullscreen, true);
    page.resizeWorkspace(800, 400);
    assert.equal(page.workspaceLayout().video.width, 800);
    assert.equal(page.exitFullscreenWithKey(1), false);
    assert.equal(page.exitFullscreenWithKey(2070), true);
    assert.equal(page.videoFullscreen, false);
    page.setVideoFullscreen(true);
    assert.equal(page.onBackPress(), true);
    assert.equal(page.onBackPress(), false);
    page.resizeWorkspace(400, 800);
  }
  assert.equal(page.document, document);
  assert.equal(page.surfaceId, 'same-surface');
  assert.equal(page.positionMs, 45212);
  assert.equal(page.durationMs, 90000);
  assert.equal(page.playing, true);
  assert.equal(page.playbackSpeed, 1.5);
  assert.equal(page.globalOffsetMs, 250);
  assert.equal(page.axisOffsetMs, -50);
  assert.equal(page.axisScale, 1.4);
  assert.equal(page.selectedAxis, 2);
  page.videoMode = false; page.setVideoFullscreen(true);
  assert.equal(page.videoFullscreen, false);
});

test('one permanent native surface exists outside conditional responsive/fullscreen branches', () => {
  assert.equal((source.match(/XComponent\(\{/g) || []).length, 1);
  const stage = source.slice(source.indexOf('  videoStage() {'), source.indexOf('  workspaceSettings() {'));
  const prefix = stage.slice(0, stage.indexOf('XComponent({'));
  assert.doesNotMatch(prefix, /\bif\s*\(/);
  assert.match(stage, /\.width\('100%'\)\.layoutWeight\(1\)/);
  assert.doesNotMatch(stage, /\.setXComponentSurface(?:Rect|Size)\(/);
  const build = source.slice(source.indexOf('  build() {'));
  assert.match(build, /this\.workspaceSettings\(\)[\s\S]*this\.videoStage\(\)[\s\S]*Row\(/);
  assert.match(build, /exitFullscreenWithKey\(event\.keyCode\)/);
  assert.doesNotMatch(build, /\.release\(|\.open\(|\.load\(|\.seek\(/);
});

test('568-vp landscape phones retain a real video surface and a 320-vp settings pane', () => {
  for (const [width, height] of [[568, 320], [599, 360], [600, 320]]) {
    const layout = videoWorkspaceLayout(width, height, true, false);
    assert.equal(layout.sideBySide, true);
    assert.ok(layout.video.width >= 240);
    assert.ok(layout.video.height - layout.controlsHeight >= 188);
    assert.ok(layout.settings.width >= 320);
    assert.ok(layout.settings.height >= 248);
    assert.equal(layout.controlsHeight, 52);
  }
});

test('sub-568 landscape uses a compact control row without starving settings or video', () => {
  for (const [width, height] of [[480, 320], [540, 320], [567, 320], [567, 360]]) {
    const layout = videoWorkspaceLayout(width, height, true, false);
    assert.equal(layout.sideBySide, false);
    assert.equal(layout.controlsHeight, 52);
    assert.ok(layout.video.height - layout.controlsHeight >= 104);
    assert.ok(layout.settings.height >= 80);
    assert.ok(layout.settings.width >= 320);
  }
});

function separated(a, b) {
  return a.width === 0 || a.height === 0 || b.width === 0 || b.height === 0 ||
    a.x + a.width <= b.x + 1e-8 || b.x + b.width <= a.x + 1e-8 ||
    a.y + a.height <= b.y + 1e-8 || b.y + b.height <= a.y + 1e-8;
}

test('dense dimensions and fractional breakpoint neighbors never overlap or exceed safe content', () => {
  const widths = [1, 47.9, 48, 80, 319.9, 320, 567.9, 568, 568.1, 599.9, 600, 999.9, 1000, 1000.1];
  const heights = [1, 47.9, 48, 48.1, 80, 131.9, 132, 319.9, 320, 567.9, 568, 568.1, 999.9, 1000];
  for (let w = 240; w <= 2048; w += 17) widths.push(w);
  for (let h = 200; h <= 1536; h += 19) heights.push(h);
  for (const width of widths) for (const height of heights) {
    for (const visible of [false, true]) for (const fullscreen of [false, true]) {
      const layout = videoWorkspaceLayout(width, height, visible, fullscreen);
      inBounds(layout.video, width, height);
      inBounds(layout.settings, width, height);
      assert.ok(separated(layout.video, layout.settings), `${width}x${height}`);
      assert.ok(layout.controlsHeight >= 0 && layout.controlsHeight <= layout.video.height);
    }
  }
});

test('resizing is locally continuous within each split mode; discrete mode boundaries remain bounded', () => {
  // Responsive row/column switches are deliberately discrete; do not confuse
  // those with unstable jumps while resizing inside the same layout regime.
  for (const [width, height] of [[400, 800], [540, 320], [568.1, 320], [599.9, 360],
    [799.9, 360], [800, 1280], [999.9, 768], [1000.1, 1280], [1299.9, 900], [1920, 1080]]) {
    const a = videoWorkspaceLayout(width, height, true, false);
    const b = videoWorkspaceLayout(width + 0.01, height + 0.01, true, false);
    assert.equal(a.sideBySide, b.sideBySide);
    for (const key of ['video', 'settings']) for (const dimension of ['x', 'y', 'width', 'height']) {
      assert.ok(Math.abs(a[key][dimension] - b[key][dimension]) <= 0.021, `${width}x${height}: ${key}.${dimension}`);
    }
  }
  for (const [w, h] of [[567.99, 320], [568, 320], [568, 567.99], [568, 568], [999.99, 1280], [1000, 1280]]) {
    const layout = videoWorkspaceLayout(w, h, true, false);
    inBounds(layout.video, w, h); inBounds(layout.settings, w, h);
    assert.ok(separated(layout.video, layout.settings));
    assert.ok(layout.video.height - layout.controlsHeight >= 104);
    assert.ok(layout.settings.height >= 80 && layout.settings.width >= 320);
  }
});
