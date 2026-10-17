# 0.24 volatile editor draft contract

Scope: retain settings edits across phone rotation, tablet/PC resizing, workspace orientation/video layout changes and panel collapse. This is UI state, not settings persistence, source commands, connect or Arm.

- One page-owned bounded `SettingsDraftOwner` stores strings and independent leases. Explicit scope identifies active profile/axis/provider or output target generation. Fields use stable keys; array fields include actual row identity and semantic source snapshots, never geometry.
- Each input event saves raw text, invalid/error state and edited state immediately. Mount restores only when canonical source value/validation/context still agree. A changed source replaces its draft; no old draft overwrites a newer committed value. Unrelated edits may retain independent drafts.
- Open replaces the previous lease for that exact slot. Disappear retires the lease but never commits. Layout/context changes invalidate all live callbacks before changing the tree; a new render obtains fresh leases. Source equality is checked at delivery, not only in asynchronous ArkUI Watch notifications.
- Background and page destruction revoke delivery permission. Background retains text but never commits it, restores capture or grants media/output permission. A fresh foreground editor may explicitly commit. Page destruction releases all private draft state.
- Numeric/text Enter or a visible 52 vp confirmation explicitly commits; blur only ends focus and retains the unsubmitted draft. Dirty fields expose a cancel/reset-to-current-value action. This is an intentional responsive/mobile interaction adaptation, not a claim of identical WPF focus scheduling. A layout/background retirement rejects late blur, submit, toggle, gesture and asynchronous clipboard callbacks. No model setter, command, socket or persistence is called by draft restore.
- Curve numeric drafts, selected point and add-point coordinates survive compatible resize/remount. An in-progress drag is cancelled; no unfinished gesture is committed or resumed. Geometry attachment remains separate from draft identity and original numeric/coercion semantics remain unchanged.
- Motion effective Range/Octaves control values carry existing coercion history across remount; restoration itself has no writeback.
- Device clone/new-axis text survives. Destructive confirmation state and in-flight clipboard operations are not resumed. Output's existing application-owned configuration draft/application ID remain authoritative; uncommitted numeric text adds no applied/connected/armed state.

Evidence required: actual controller extraction with both old and new components; equal-valued context replacement, late callbacks, invalid numeric text, source edits, background, readonly and repeated layout transitions. Official SDK build is compile evidence only; no ArkUI visual/device result is claimed without a device run.

## Review closure details

- Native Switch/Choice closures capture the rendered callback and option/value identity, so replacing child props cannot forward a stale event into a new panel guard.
- Output guards include the incoming full controlled draft before Watch. Connect completion requires the original owner lease, epoch, source and target identity. Hidden pending inputs have a permanent target-scoped cancel-all action; cancellation performs no configuration setter or output command.
- The real-time axis scale slider captures the actual axis/profile/layout lease. It remains immediate while current; equal-valued axis replacement, resize or background retires it.
- Motion effective control history is stored under stable profile/axis/provider scope, separately from the temporary foreground canvas/admission binding key.
