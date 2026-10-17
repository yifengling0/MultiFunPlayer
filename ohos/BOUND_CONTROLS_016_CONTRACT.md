# 0.16 bound-control contract (implemented portable slice)

This slice closes proved UI dependency behavior, not the whole WPF scheduler. The 0.15 archive stays immutable. No new action catalog entries are planned.

## Evidence gates

- Pinned MahApps2.4.9 and official WPF binding source distinguish effective control coercion from model mutation. Source→target transfers do not write a coerced value back to the provider. Do not globally clamp Minimum/Maximum or Octaves merely because a panel is shown. Preserve independent model setters, reversed ranges, original sync behavior and Random's128 activation budget.
- Range and Numeric effective values will have their own bounded control state. Explicit user edits may write only the proved changed effective property through existing configuration ownership; programmatic transfer, render, attach and restore never masquerade as user edits. Display both actual model value and effective UI value when they differ.
- Original DraggablePointCanvas differs: it mutates the shared point collection directly. Its viewport event prunes outside points inclusively before checking measured size. Collection Reset, point binding and size synchronization sort/round-trip when measured; Reset alone does not prune. Stable duplicate ordering is retained. Exact extracted methods plus explicit structural shims prove numbers/collection events, not Windows event scheduling.

## Portable attachment ownership

- Only a genuinely mounted OHOS curve editor can register an owner, active axis/provider/profile and actual plot dimensions. Hidden/unmounted or stale owners cannot change another axis; background, readonly/recovery, pending profile and page destruction revoke mutation authority.
- Initial attachment invokes the proved point-binding/measurement synchronization. It does not guess whether WPF first transferred Viewport or Points. Subsequent actual viewport changes and collection mutations use distinct proved events. Measured geometry is volatile and never persisted.
- A current attached Custom Curve command preserves Duration→Interpolation→collection Reset order. Duration may affect the old collection; incoming points are then reset and synchronized without unconditional viewport pruning. Detached providers preserve their existing headless behavior. No extra phase reset or generic sync is added for point-only collection changes.
- Effects validate the entire bounded result before committing, preserve4096/8192 point and finite-arithmetic limits, and keep configuration/output revision invalidation. No synthetic sample/frame or output Arm is produced by an editor event.
- Existing touch numeric/point editing remains48vp on phone/tablet and shares the same controlled execution path. Old callbacks, field-focus cancellation, dragging cancellation, rotate/remount, switching axes/providers and repeated open/close require actual controller tests.

## Explicit remaining differences

WPF popup/tab retention, exact first-binding order, dispatcher/Fody event timing and native device interaction are not proven by a Linux method oracle or SDK build. These remain partial where material. Do not change counts simply because a helper or label exists. Final classification must follow actual UI→core routes and evidence.

Git publication, File special review and physical device connections remain outside this stage.

## Review-driven ownership rules

A captured old handler is not the only stale path: a surviving numeric component can call a new handler with an old draft, and a new gesture end can finish an old drag. Numeric point rows/new-point fields therefore remount on the full owner/point/bounds context. Drag start retains its own context and callback identity, checked even by newly installed move/end handlers. Motion panels remount on the complete active axis/profile/provider/availability key, avoiding separate-prop initialization order assumptions.

Original canvas source has no IsVisible/IsLoaded gate on collection synchronization; cached hidden WPF controls may still receive events. The OHOS current-mounted-owner rule is an explicit portable lifecycle boundary, not a claim that hidden WPF equals detached.
