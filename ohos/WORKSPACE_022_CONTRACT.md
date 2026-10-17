# 0.22 workspace adaptation contract

User feedback: the page does not fit the device, has too many nested background
layers, and leaves controls inside narrow content regions. The named HMOS code
workshop reference has not yet been identified; this change does not claim to
reproduce an unknown project or screenshot.

## Structure

- Use the app's measured safe content area, not the physical screen size.
- Remove the normal page's 600-vp single-column / 1220-vp two-column width caps.
  Settings and source regions consume the available pane width. Modal dialogs
  may retain their independent readability limit.
- One horizontal gutter per scrolling pane. Child settings panels have vertical
  spacing but no second outer horizontal inset. Nested mapping/action groups use
  separators rather than successively narrower filled cards.
- Page, title bar and section backgrounds use one neutral surface. Inputs and
  meaningful selected/error states retain their own contrast. Remove decorative
  nested card borders/shadows, keeping clear button borders and pressed feedback.
- Numeric/text/select fields stack on narrow panes, and align label/control in
  two columns when the *field's actual measured width* is at least 600 vp.
  The same input node remains mounted across this geometry change; no draft,
  focus owner, callback, media clock or output state is reset by this same-instance
  field-width change. The existing whole-workspace single/two-pane branches can
  remount local fields; preserving every uncommitted draft or IME focus across
  those branch changes is not established. Output drafts retain their existing
  application-owned persistence.
- Six media tools distribute evenly across available width. Use six columns
  when each can remain at least 52 vp, otherwise balanced three/two/one columns;
  avoid the old five-plus-one wrap at 320 vp. Axis commands wrap instead of
  requiring horizontal discovery; all action touch heights remain at least52.
- Preserve the fixed global Stop, original callback/permission gates, single
  stable video Surface, safe-area and fullscreen lifecycle. No new connect or
  arm behavior is introduced by layout, remount, rotation or restored settings.

## Acceptance evidence

Test 240/280/320/360/400/568/800/1280/1920 vp, portrait/landscape, video on/off,
explicit vertical/horizontal preference, readable and compact preference.
Verify full pane coverage, no min-touch shrink, no cumulative horizontal insets,
long labels/filenames, field draft ownership across width changes, and unchanged
media/output lifecycle. Run existing real-controller regressions and official
SDK compilation. A runnable browser approximation can document visual intent;
it is not an ArkUI screenshot or a device render. The previously denied browser
route remains unused. Final visual/device confirmation still needs a supported
renderer or user device screenshots.

USB serial is an independent backend integration. Adding a style or a label
never claims serial hardware support; only implemented capability-gated native
backends may expose a connect action.
