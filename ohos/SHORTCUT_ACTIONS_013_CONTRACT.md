# 0.13 local action expansion contract

This increment expands executable original commands, not keyboard devices or remote media sources. The baseline 0.12 catalog contains 18 original registration-template matches and four OHOS additions, not 22 original actions. The 188-template audit is the denominator; parameter restrictions and runtime-expanded registrations remain explicit in the coverage ledger.

## Ownership and execution

- Keep the original foreground/local keyboard press/release/click/hold engine and ordered command worker. F12/Stop bypasses pending work. Touch uses the same allowlisted action dispatcher.
- Action DTO adds an explicit target axis, optional second scalar, and bounded plain text/enum argument. Missing fields in old saved mappings normalize to legacy defaults. No arbitrary callbacks, source paths, device addresses, credentials, Connect or Arm actions are introduced.
- Empty target means the selected axis captured when a dispatch is admitted. An explicit target is never replaced by the selected axis. Before execution validate its identity in the current active profile, enabled state, and the dispatch/profile lifetime. Disabled/missing targets and read-only/pending-profile settings produce visible rejection.
- Configuration actions use cloned validated snapshots and the same Session persistence/pipeline paths as the settings panels. Preserve original per-command ResetSync/ReloadAxes side effects, including unchanged-value explicit commands. Ordinary live edits do not pause media or acquire output Arm.
- All-axis commands affect all enabled active axes, atomically validate before commit, preserve disabled-axis stored preferences, and report the affected set. Original all-axis ordering and Toggle semantics are tested.
- Media actions use confirmed session position/duration and the existing seek transaction. No action invents a native clock observation or seek acknowledgement. Original finite/clamp, metadata selection, raw marker time, AB immediate seek and persisted AutoSkip preferences are maintained.
- An unsupported/busy/no-source/no-marker command reports why no action occurred. Success reports the action and concrete affected axis/result. A queued action cannot overwrite a newer Stop/cancellation result after an await.

## Reachable UI

The controlled keyboard/touch editor offers categories, explicit target axes, scalar/boolean/enum/text arguments and second arguments when applicable. All touch commands remain reachable through the main page scroll with 48vp controls and wrapping rows. Unavailable saved axis references are shown without silently normalizing them. Editor focus, capture and stale callbacks retain the 0.12 safety contract.

## Scope boundaries

This increment does not implement analog drive/offset/threshold or global Windows capture. Axis manual transitions, curve-point argument actions, Motion-provider parameter families, output connection/range mutations, remote sources and plugin actions remain separately enumerated until actually integrated. File recording review remains blocked. Directory and individual-video import options remain absent; the managed Download catalog is the entry.

DeoVR/HereSphere feasibility is assessed separately. Their original protocols lack request-correlated seek completion; no native seekDone or automatic Arm restoration may be synthesized.

## Verification required

1. Per-template catalog/source ledger; no supported catalog item without a real handler.
2. Legacy DTO migration; unsafe fields, non-finite/range-invalid values, stale/disabled targets and missing metadata.
3. Actual Index/controller keyboard and touch parity; ordered async commands, Stop, focus/capture/background/source/profile cancellation, no implicit Connect/Arm.
4. Source-equivalent axis/sync Set/Toggle/Offset coercions and persistence; exact explicit command side effects, not generic pause/reset.
5. Mobile narrow-layout structural reachability and SDK compilation, without claiming real-device visual or keyboard/IME verification.
6. Full Node suite with actual optional .NET oracle, official clean SDK HAP, before/after production hashes, immutable source/HAP/log archive and independent review.

## Registered setters and the loaded WPF binding chain

Do not infer “no Sync” from a short registration callback. `AxisSettings` derives from `PropertyChangedBase` (ScriptViewModel.cs:2345) and the project enables PropertyChanged.Fody. The loaded view binds global/axis Offset to `ValueChanged` (:374, :1573), Scale to `ValueChanged` (:1594), Invert to `Checked/Unchecked` (:759–762), LinkPriority to `Checked/Unchecked` (:910–913), and selected references/providers to selection handlers. Those handlers do not require a user-origin event. `UI/Behaviours/ComboBoxAssist.cs` subscribes ordinary `SelectionChanged`, executes its handler, then updates the source. `NonReloadingTabControl` constructs/retains all tab presenters; merely selecting another axis does not remove its bindings.

The candidate therefore keeps the existing loaded-UI configuration side effects. A proposed command-origin exception was rejected after following this complete chain. The independent tests cover the actual OHOS adapter and original C# numeric kernels; WPF dispatcher/binding event scheduling itself was not executed in this Linux environment and is not claimed as verified.

`AxisPipeline.configure(configuration, bindings?)` only adopts validated same-profile configuration/resource changes and their synchronous Sync/Index effects. It publishes no frame, samples no provider and advances no clock. Every session configuration/resource commit still invalidates the corresponding source revision/gate. A later explicit Sync Cancel now remains cancelled after the next true step, including Clear, Reload, Link propagation and awaited Internal Next. Old frame/authorization identity is never upgraded by configure.

## Names and numeric limits

Named markers use a pinned scalar case table generated by an exhaustive scan of the official .NET 9.0.21 reference runtime (1,453 positive simple-case pairs), rather than JavaScript locale/full uppercase. This includes Greek simple-case pairs and avoids accepting new Unicode 17 mappings unavailable in the reference. An optional actual .NET test regenerates and compares the entire table. It is a reproducible reference-runtime contract, not a claim about every future .NET/Unicode version.

New and old seek/script-offset actions accept finite source-range values; arithmetic overflow is rejected rather than persisted as NaN/Infinity. AutoSkip shortcut offset is any finite signed value, as the registration permits. The original regular editor still presents an advance amount ≤0; an existing positive shortcut value is displayed explicitly, not silently rewritten. Playback rate remains limited to the existing OHOS 0.25–4 capability path. Speed-limit reciprocal zero retains the schema's explicit JSON-safe `Infinity` representation.
