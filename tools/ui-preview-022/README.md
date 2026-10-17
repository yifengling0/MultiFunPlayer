# 0.22 full-width workspace approximation

This local HTML preview is runnable by the user. It imports current production
style tokens and actual workspace geometry, uses source labels, and records all
source SHA256 fingerprints. It has no device/network/Arm callbacks.

Build/check from the repository root:

```
node tools/ui-preview-022/build-preview.mjs
node tools/ui-preview-022/audit-static.mjs
node --test tools/ui-preview-022/source-contract.test.mjs
```

Open `index.html?viewport=phone-320&scene=forms` in your own supported browser;
other fixture viewport names are in generated/manifest.json. The actual browser
window should match the chosen fixture size. Scenes include workspace, forms,
axis, output, diagnostic, video, dialog and snackbar. `density=compact` is explicit.
The approximation covers 240–1920 px, single and double panes, neutral full-width
sections, balanced media/axis tools, and measured-container field columns.

No screenshot or ArkUI render has been generated in this stage. The previously
denied render route was not retried or bypassed. Source/geometry/markup checks
cannot prove actual glyph clipping, hit testing, safe-area, IME or native Scroll
behavior. Phone/tablet/PC screenshots and input tests remain device acceptance.
The requested HMOS code workshop reference link remains unspecified.
