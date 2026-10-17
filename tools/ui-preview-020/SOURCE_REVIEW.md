# Independent 0.20 source/layout review

## Verification level

Static source review, imported geometry and numeric color contrast only. No browser screenshot, ArkUI render, touch/IME or native visual acceptance was obtained. The rendering blockers and the future reproducible renderer are documented in README.md. The screenshots directory is intentionally empty.

## Findings corrected in the reviewed production snapshot

- Index title uses the page surface and a 72-vp header; at widths below 360 the title is intentionally two lines. Header action targets are 52 vp.
- Default density is readable on every device. Compact is only selected by the explicit persisted preference. Body text is 18/16, helper text 14, section headings 22, shared controls at least 52.
- Output targets use stacked, full-width selection and delete controls. Long output and fault status text remains inside the main vertical scroll owner.
- Dialog and snackbar error text has its own bounded scroll region; dismiss and global Stop are outside that text region.
- Remaining low-contrast inactive-axis/disconnected labels were replaced with shared readable colors. Nine intended text/background pairs pass 4.5:1; the minimum tested ratio is white on accent, 4.808:1.
- Heatmap/axis-values/marker action labels no longer reduce to helper text size. The three direct Index selectors were replaced with shared SettingsChoiceField. Shared selectors expose a fully wrapping companion value.
- Heatmap switches are stacked shared fields. Volume, timeline and scale sliders have 52-vp interaction regions. The clickable heatmap is 72 vp, or 64 only in explicit compact mode. Axis numeric values have 64-vp width.
- The 568×320 layout reserves a 240×196 video surface, 52-vp toolbar and 320×248 settings pane. The Play and Stop buttons are 52 each; narrow-video titles are hidden and the fullscreen label is shortened, while its accessible name retains the precise operation. This is a geometry budget review, not native glyph or hit-test proof.
- Nine source geometry cases are in bounds: 320/360/390 phone portrait, 568/640 landscape, 768/1024 tablet, 1280 PC and 320×480 narrow window. Static bounds do not prove every child can render without clipping.

## Residual limitations

- Index flatButton still caps button text at four lines; integration now supplies separate fully wrapping text for library titles, each mapping filename and each target name/identity. This addresses the identified missing full-text path at the source level. Actual native glyph measurement, system font scaling and scrolling still need device acceptance.
- Browser wrapping, font fallback, Select measurement, safe areas and scroll physics differ from ArkUI. No physical output, native diagnostic endpoint, video decoding or device acknowledgement was exercised by this review.
- The preview is a representative mirror, not an ArkUI transpiler. Its purpose is reproducibility and future visual inspection, not substituting HTML screenshots for native acceptance.

## Reproducibility

The generated manifest includes SHA256 for all 17 production source files read by the preview. Run build-preview.mjs, the six source-contract tests and audit-static.mjs after any production edit. Preserve the distinction between those passing static checks and the unexecuted rendered acceptance suite.
