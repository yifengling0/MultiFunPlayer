# 0.20 readable UI preview and independent audit

## Evidence status

This is a reproducible **browser design/layout approximation**, not an ArkUI render and not a native device screenshot. **No screenshots were generated in this environment.** The installed Chromium could not start because its local socket operations were restricted. The separately approved execution route failed during environment setup. The cloud browser rejected the local file URL. Those routes were stopped; no alternative bypass was attempted.

The delivered evidence consists of the runnable HTML/CSS/JS preview, actual imported production tokens and layout geometry, source fingerprints, representative long-label/runtime fixtures, six source-contract tests, and static color/geometry results. It must not be reported as visual acceptance or a passing screenshot suite.

## Read-only production adapter

Run from the repository root:

```sh
node tools/ui-preview-020/build-preview.mjs
node --test tools/ui-preview-020/source-contract.test.mjs
node tools/ui-preview-020/audit-static.mjs
```

The generator imports the actual `UiStyle`, `videoWorkspaceLayout`, and `horizontalWorkspace` functions. It does not copy their numeric values into a separate test model. The generated manifest fingerprints Index, General configuration, localization and all panel files; tests fail when production has changed since generation.

All writes are under this preview directory. No production callbacks run, no media is opened, no output is armed, no network device is contacted, and no package is installed. Endpoint fields use documentation-only `192.0.2.123`. Filenames, target names and the 512-character Chinese error are explicit synthetic fixtures.

The HTML mirrors representative source, script/axis, output, General/input/sync and error builders. It deliberately includes long full selected values, output diagnostics and scrolling content. It is not an automatic ArkUI transpiler or a pixel-identical replica. Native Select labels may elide; the production companion text is represented as a fully wrapping value below the selector.

## Open the preview on an authorized machine

Open `index.html` in an ordinary browser that permits local files, using one of the generated viewport IDs, for example:

```text
index.html?viewport=phone-320&scene=source
index.html?viewport=landscape-568&scene=video
index.html?viewport=pc-1280&scene=output
index.html?viewport=window-320&scene=dialog
index.html?viewport=tablet-768&scene=forms&density=compact
```

Set the browser content viewport to the size corresponding to the ID. The watermark always says “浏览器布局近似 · 非原生截图”. Buttons only simulate harmless local switch and dismissal interactions. Connect, Arm, media and filesystem callbacks are not wired.

| ID | CSS-pixel viewport, approximating vp |
|---|---|
| phone-320 | 320 × 568 |
| phone-360 | 360 × 640 |
| phone-390 | 390 × 844 |
| landscape-568 | 568 × 320 |
| landscape-640 | 640 × 360 |
| tablet-768 | 768 × 1024 |
| tablet-1024 | 1024 × 768 |
| pc-1280 | 1280 × 800 |
| window-320 | 320 × 480 |

Scenes are `workspace`, `source`, `axis`, `media`, `output`, `diagnostic`, `forms`, `video`, `dialog` and `snackbar`. Readable density is always the default at every viewport. Only `density=compact` explicitly selects compact text/spacing; minimum controls stay 52.

## Optional rendered audit in a supported environment

The renderer requires already-installed Python Playwright, Pillow and Chromium at `/usr/bin/chromium`. It performs no dependency installation. It is supplied for an authorized environment in which local browser execution works:

```sh
python tools/ui-preview-020/render-audit.py --quick
python tools/ui-preview-020/render-audit.py
```

The full matrix produces 117 PNG screenshots (ten scenarios, output-diagnostic and scroll-bottom screenshots, and explicit compact mode at nine viewports), eleven contact sheets and `generated/audit.json`. It checks actual browser DOM control overflow, control dimensions, scroll-to-end reachability, selected-value wrapping, dialog/snackbar scrolling, source-label provenance, token contrast and default density. The `--quick` run covers 320 phone, 568 landscape and 1280 PC.

These browser results must be inspected visually with an image viewer before acceptance. No completed image review is recorded now. A source-contract test, passing geometry arithmetic, or a generated HTML file does not imply that the renderer succeeded.

## Remaining native acceptance

On phone, tablet and PC/multiwindow hardware, verify 320/360/390 portrait and 568/640 landscape; scaling and safe areas; 52-vp hit targets; 18-vp body/14-vp helper/22-vp section headings; long CJK strings and input cursor behavior; full selection companion values; scroll reachability through all expanded panels; bottom errors without obscuring Close/Stop; and video Play/Stop/Fullscreen fit at 240 vp. Confirm resize/fullscreen retains the same XComponent and playback session, and that preview changes never connect or arm outputs.
