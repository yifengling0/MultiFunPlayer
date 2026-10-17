# 0.28 continuous Drive: approved preparation contract

Status: implemented in the 0.28.0 / code29 candidate after exact0.27 source restoration. Local controller, pure scheduler, real session/output and pinned C# oracle tests execute; official final clean SDK and immutable validation are recorded in VALIDATION.md. This is not native-device input or visual acceptance. Git publication remains separately paused.

The restored original snapshot is retained unchanged. The user's subsequent six-file translation change was reconciled into this working candidate without replacing the0.24–27 lifecycle or material changes.

## Approved scope

Retain the approved0.25 four-tool layout and0.27 material adapters. Add one collapsed advanced section under Settings > Input, using existing controlled draft ownership and52vp actions. It is a local input surface, not a global hook or a fake scalar slider. Configuration, explicit input reception and physical output Arm are three separate states. Editing/restoring mappings does not start reception, playback, preview, connection or output.

The source scope is real local touch contact, held mouse movement and local wheel axis events where public API20-compatible definitions prove units and phases. Do not infer gamepad axisMap normalization, raw Windows HID counts, TCode IN/button feedback or background input. The restored official SDK26 declarations are audited separately from the pinned public OpenHarmony declarations; see LOCAL_INPUT_028_PLATFORM.md. Native component-local coordinates provide the normalization span. Mouse rawDelta is not used.

## Original pin and nine registration templates

Original repo: https://github.com/Yoooi0/MultiFunPlayer
Pin:36c08fbb99ac9398a63ff1cca1bbf68cd2228a94
The retained original Source tree and tools/reference/continuous-drive-028/source-manifest.json pin exact source bytes. The runner compiles eight complete unchanged files and thirteen exact spans; its3194 numerical rows are actually replayed with official.NET9.0.319. CONTINUOUS_DRIVE_028_SOURCE_AUDIT.md distinguishes this oracle from source-only platform and WPF scheduling claims.

1. Axis::Value::Drive: ScriptViewModel.cs1613-1615 calls SetAxisTransition(valueOrDelta,deltaTime,offset=isRelative).
2. Axis::MotionProviderBlend::Drive: ScriptViewModel.cs1935-1937 applies absolute/relative then Clamp01 through normal settings updates.
3–5. MotionProvider::{name}::Speed/Minimum/Maximum::Drive: AbstractMotionProvider.cs65-99. Speed has lower bound0.01; min/max Clamp01. Apply to the actual named provider instance, not whichever provider happens to be selected later. Preserve the complete existing setter/canvas/range side-effect chain.
6–9. {outputIdentifier}::Axis::Range::Minimum/Maximum/Middle/Size::Drive: AbstractOutputTarget.cs271-332. Preserve selected output identity+generation, axis and user limits. Middle and Size use their exact original Drive helpers; they are not aliases for the Set shortcut helpers.

These are nine original registration templates, not nine protocol implementations or a count of all expanded runtime IDs. Porting their action paths does not prove Windows global RawInput/XInput equivalence. Coverage must remain qualified by source/platform and existing partial setter boundaries.

## Exact gesture conversion

Input DTO carries finite normalized Value in[0,1], finite Delta, gesture DeltaTime, source kind and stable pointer/capture identity. Raw native timestamp and units are separately retained for local freshness/audit; never use them as media time.

Drive has five modes, default Relative, plus Invert=false:
- Absolute: Value; Invert changes it to1-Value.
- Relative: Delta; Invert changes only its sign.
- RelativePositiveOnly/NegativeOnly: admit only original Delta>0/<0, then apply Invert. Do not filter the inverted result.
- RelativeJoystick: admit only Value<.5 with Delta<0 or Value>.5 with Delta>0. Center/equal/returning-toward-center produces no invocation. Invert is applied after this test.

AxisInputGestureData.ApplyTo(current,deltaModifier=1) is Absolute?ValueOrDelta:current+ValueOrDelta*deltaModifier. Do not multiply relative data by time again.

AxisOffset is independent, not a sixth Drive mode. It defaults to AbsoluteJoystick, Speed=.1, Invert=false. Its UI Speed domain is[0,1]. Absolute computes Value*Speed*sign; AbsoluteJoystick maps.5..1 to0..1 and.5..0 to0..-1, then multiplies Speed*sign. Exactly zero cancels repeat. Nonzero starts a100ms PeriodicTimer only if no repeat already runs. First invocation is after100ms, not immediately. Each invocation is Relative(offset,.1); late scheduler ticks coalesce rather than burst-catch-up. A newer gesture replaces the offset used by later ticks without resetting an already-running period. At most one scheduled invocation per shortcut is allowed; while its action batch is in flight, another invocation is dropped, not piled into an unbounded queue.

Original RawInput mouse/wheel DTOs use DeltaTime=0; Offset uses.1. Preserve those source action durations. For the new local touch port, explicitly document its normalization/duration contract rather than pretending to be raw mouse or XInput. The original RawInput virtual cursor begins at.5 and uses500-count dimensions, wheel120*10/20 count divisors; these are not vp. It also assigns its Y accumulator from the updated X accumulator. Do not silently claim a vp local surface reproduces those Windows hardware quirks. Native vp deltas use explicit local span calibration and remain labeled as such.

## Input ownership and admission

Reception begins only after the user selects a valid mapping/axis/target and explicitly enables the local surface. A visible state shows stopped/receiving/contact active/blocked, the actual source value/delta and last accepted action. Do not display an invented connection or device acknowledgement.

A capture binds page/listener owner, mapping revision, profile revision, enabled-axis identity, output target id/generation where applicable, control revision and pointer id. Recheck before each event,100ms repeat, batch action and asynchronous completion. Reject nonfinite/invalid dimensions, timestamps, deltas and incompatible sources. Reject stale/later-delivered callbacks for a replaced capture. Configuration changes retire reception and old callbacks without applying pending text.

Touch/mouse Offset requires demonstrable live contact/pressed ownership. Wheel is admitted as immediate Drive data only in this increment; it cannot start an indefinite Offset timer. Even public BEGIN/END/CANCEL declarations do not prove every actual OS/device emits a reliable end sequence. No invented release/center sample on cancellation.

A normal matching UP releases that contact and cancels its repeat/queued tails, while retaining explicit reception for a new contact. CANCEL, pointer ownership ambiguity, leaving the accepted region, collapse/tool change, rotation/resize, text editing/modal opening, readonly/recovery change, profile/axis/target replacement, real window blur, background, page/stage replacement and Stop retire sampling, repeat deadlines and queued/unexecuted batch tails. Returning focus/reopening a section requires fresh explicit reception and a new physical contact. A capture/timer/held state is volatile and is never restored from settings.

Ordinary blur only cancels input work, matching0.26; it does not arbitrarily stop already-running media/output. Stop always uses the existing global hard-stop path and revokes capture/preview/output admission. Completed side effects cannot be undone; already-started operations remain subject to their existing request/generation/Stop/background cancellation.

## Action and physical-output boundary

- Axis Value Drive reuses real transition scheduling and provenance. It must not start manual preview, media or output. Paused manual movement still requires explicit manual preview and the target's separate pausedManual permission and explicit Arm/wait admission. A setter never fabricates a pipeline frame; only a real pipeline tick can become eligible.
- Blend/Motion Drive follows normal configuration ordering and persistence, with appropriate immediate source/control invalidation; output waits for a genuinely current legal frame. Existing known historical anchors and retained-cache audits remain intact.
- Output Range Drive uses the existing per-target configuration/scope/generation transaction. Old fixed/polled candidates and write completions cannot pass under a new range. Limits, reverse ranges and dirty semantics must follow the existing original-backed core, without silently enlarging authorization or auto-Arm.
- Invalid/disabled/missing axes, read-only state and retired targets produce explicit feedback; no fallback to another selected axis or provider.

## Implementation boundaries

Prefer a pure continuous-input model/normalizer and an actual native local-surface adapter. Keep Index/session/shared output under the integration owner. Add schema configuration only after reconciling the restored0.27 settings model. No capture/held/timer state in persistent settings. Reuse existing action dispatch and editor components without introducing a new global visual hierarchy.

Before writing the consumer, compile original Drive/Offset/AxisInputGestureData and the nine action transformations into a small exact-source oracle. In particular, prove sign-before-Invert, center boundaries, fixed.1 Offset data and Middle/Size Drive formulas. Do not infer WPF property/binding feedback from registration text alone; retain documented partials if not demonstrable.

## Required tests and acceptance (results in VALIDATION.md)

1. Original C# numerical oracle: all five modes x inversion x signs/zero/center boundaries; independent Offset modes/speeds; ApplyTo; all nine template transformations/limits/reverse ranges.
2. Fake-clock scheduling:99/100/200ms, offset changes during repeat, zero cancel, held/in-flight drop, no delayed burst, Stop/focus/CANCEL/replaced page and late completion, fresh reception required.
3. Actual native handler/controller: touch vs mouse duplicate prevention, pointer identity, real vp coordinate/delta conversion, wheel phases, event consumption, invalid dimensions/timestamps; new capture cannot receive old callbacks.
4. Actual session/output: no implicit preview/connect/Arm; manual duration0 and .1 transitions; all targets independently scoped; range change invalidates old queued data; readonly/disabled targets and recovery errors explicit. Existing Smart/Follow/live-tuning and Stop-bypass regressions remain.
5. UI route/draft tests: advanced fold remains reachable on phone/tablet/PC; no automatic commit on collapse/resize/material update; global52vp Stop and single video Surface remain. Native visual/input delivery still requires user devices.
6. Full aggregate with actual.NET oracles, official clean SDK, final source/HAP/Apache+MIT hashes and independent review. No live target, File review or Git publication is authorized by this contract.

## Verified manual-preview boundary

A Value Drive while stopped may update a real held scalar on a subsequent runtime tick, but never grants preview or Arm. Starting a new manual-preview epoch afterwards cannot use that old held scalar to establish idle Arm-wait. This existing provenance boundary is retained: set up a fresh explicit manual preview before driving, or use the existing explicit runtime-rebuild recovery and then begin preview/Arm again. No automatic reset or provenance relaxation is added. The actual session tests separately exercise fresh preview→explicit allowed-target Arm-wait→real Transition tick→write and the old-held-epoch rejection.
