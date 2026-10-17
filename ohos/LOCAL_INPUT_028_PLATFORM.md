# Installed SDK26 reconciliation, 0.28

The workspace and official tools were restored after the following preparation audit. Installed CLI26.0.0.851/SDK26.0.0.105 declarations were re-read and compiled with the actual application. `sdk/default/openharmony/ets/component/common.d.ts` SHA256 is `2662a40432b2fa6efcfe387c3bc4bdc79ac9a993de1e415042b37a78d6315614`. Its MouseEvent rawDeltaX/Y documentation (lines8998–9024) explicitly changes to raw hardware movement in API26; these fields are **not used**. Production computes component-local x/y differences over measured vp width/height. Touch/held mouse action duration is0, Offset action duration.1; native timestamps remain boot-ns for freshness only. Scheduler/media clocks remain separate.

The production surface uses API-compatible onTouch/onMouse/onHover/onAxisEvent. Local hoverfalse/leave/cancel terminates capture; no system pointer-capture claim or global hook is made. The SDK provides axis getters, but the public/native implementation evidence below leaves physical wheel unit calibration unresolved. The UI therefore labels a native-axis calibration span and allows immediate Drive only; it never starts an unbounded Offset repeat.

Actual native input delivery, touch-to-mouse duplication, contact exit behavior, wheel/touchpad scale and minAPI20 event delivery require local device checks. SDK compilation and injected controller packets do not prove hardware behavior. The historical missing-checkout/SDK statements below describe the earlier preparation moment only.

## Preserved preparation audit

# 0.28 Local Continuous Input: Public Platform Evidence

Date: 2026-10-17 UTC. Scope: read-only public declaration/source audit and proposed DTO. No production code, repository, build, device, or Git state was changed.

## Result and evidence limitation

API20 can support a real local ArkUI touch/mouse surface and local wheel/touchpad axis samples without a global hook. Public declarations prove contact phases, local coordinates, optional raw mouse displacement, window focus lifecycle, and local event propagation control.

This is NOT verification against the requested installed Harmony SDK 26.0.0.851. In the current executor the application checkout, that SDK directory, and mfp-next-design/CONTINUOUS_INPUT_026_AUDIT.md are all absent. Therefore the requested 0.26 audit could not be read. The parent-approved CONTINUOUS_DRIVE_028_CONTRACT.md was read and used to align this report. Restore the exact checkout/SDK and recheck declarations/compilation before implementation.

Pinned public sources:
- interface_sdk-js, OpenHarmony-6.0-Release, commit 1f243d38e62f186f286ca2f418c45626198e30e0.
- docs, OpenHarmony-6.0-Release, commit 442679e8594d9c9c9b2a4bdc9a25a47f1035d6cb.
- arkui_ace_engine, OpenHarmony-6.0-Release, commit 36e564869291f147d2675c1098dae483eca47ba5.

These are separate repository pins on a public release branch; they are not proof of the exact commercial Harmony SDK/runtime implementation. All statements about earliest API refer to ArkTS 1.1 unless explicitly stated otherwise. Several declarations additionally support ArkTS 1.2 starting at API20. That annotation does not raise the ArkTS 1.1 minimum version.

LOCAL_INPUT_PLATFORM_PROVENANCE.json records exact source paths, commits, Git blob SHAs and snapshot/excerpt paths. platform-evidence/ retains five full public documentation snapshots plus line-numbered declaration/implementation excerpts. No source was fetched from a guessed gamepad mapping.

## 1. Usable input contract at API20

### Touch: real local position and contact

The public declaration exposes:
- CommonMethod.onTouch(event: (event: TouchEvent) => void): T, since API7.
- TouchEvent extends BaseEvent: type, touches, changedTouches, stopPropagation().
- TouchObject: id, type, x, y; x/y are component-local vp coordinates.
- TouchType.Down, Up, Move, Cancel; Cancel exists since API7.
- Optional pressedTime since API15 is ns, not milliseconds.

Use changedTouches and a stable selected id for transitions. Do not assume either array is nonempty, or use touches[0] as a stable pointer. A terminal Cancel must retire the capture even when no usable contact sample is present. Up for the owned id retires it; another finger must never silently replace it.

There is no TouchObject rawDeltaX/Y in this pinned interface. A touch delta must be explicitly derived from consecutive x/y positions of the same contact in the same component coordinate frame. First Down has no displacement. Resize, rotation, component relocation, capture replacement and pointer ambiguity reset/cancel the baseline.

Important duplicate-delivery rule: ArkUI onTouch also receives converted mouse left-button events. A separate onMouse adapter must own mouse events; the onTouch adapter must reject mouse-source events before invoking Drive, or one physical motion can invoke twice. SourceType and sourceTool should be copied from BaseEvent without guessing numeric values.

Sources:
- [Touch declarations](https://github.com/openharmony/interface_sdk-js/blob/1f243d38e62f186f286ca2f418c45626198e30e0/api/@internal/component/ets/common.d.ts#L13068-L13783)
- [onTouch signature](https://github.com/openharmony/interface_sdk-js/blob/1f243d38e62f186f286ca2f418c45626198e30e0/api/@internal/component/ets/common.d.ts#L24840-L24868)
- [TouchType](https://github.com/openharmony/interface_sdk-js/blob/1f243d38e62f186f286ca2f418c45626198e30e0/api/@internal/component/ets/enums.d.ts#L1235-L1335)
- [Touch documentation, including mouse conversion and vp units](https://github.com/openharmony/docs/blob/442679e8594d9c9c9b2a4bdc9a25a47f1035d6cb/en/application-dev/reference/apis-arkui/arkui-ts/ts-universal-events-touch.md#L19-L117)
- [Touch bridge converts local coordinates from px to vp](https://github.com/openharmony/arkui_ace_engine/blob/36e564869291f147d2675c1098dae483eca47ba5/frameworks/bridge/declarative_frontend/engine/functions/js_touch_function.cpp#L25-L115)

### Mouse: real local position, optional raw displacement, pressed ownership

The public declaration exposes:
- CommonMethod.onMouse(event: (event: MouseEvent) => void): T, since API8.
- MouseEvent.x/y component-local vp, button, action, stopPropagation().
- rawDeltaX?: number, rawDeltaY?: number since API15, documented vp.
- pressedButtons?: MouseButton[] since API15, all currently pressed buttons.
- MouseAction.Press, Release, Move, Hover; MouseAction.CANCEL = 13 since API18.

CANCEL is available at the API20 floor and must be handled. Do not invent MouseAction.Cancel with different casing, or assume only Press/Release/Move exist.

For a relative mouse mapping prefer a finite pair of rawDeltaX/Y. If they are absent, a documented fallback is the difference of consecutive local positions while the same owned capture is active. Mark its provenance as local-difference; it is not equivalent to native raw displacement, especially near screen edges. Do not silently replace undefined with 0 or mix raw X with local-difference Y in one sample.

A Press of the configured button inside the enabled local surface establishes local held ownership. Release/CANCEL cancels it. When pressedButtons is present and omits the owned button, cancel rather than keep a stale hold. A Move or Hover without owned Press is not held-input proof. A missing pressedButtons property is unknown, not an empty array.

The pinned mouse bridge explicitly applies Px2VpWithCurrentDensity both to local coordinates and rawDeltaX/Y. This corroborates the vp contract for this public implementation.

Sources:
- [MouseEvent fields](https://github.com/openharmony/interface_sdk-js/blob/1f243d38e62f186f286ca2f418c45626198e30e0/api/@internal/component/ets/common.d.ts#L12693-L12932)
- [onMouse signature](https://github.com/openharmony/interface_sdk-js/blob/1f243d38e62f186f286ca2f418c45626198e30e0/api/@internal/component/ets/common.d.ts#L24820-L24838)
- [MouseAction, including CANCEL API18](https://github.com/openharmony/interface_sdk-js/blob/1f243d38e62f186f286ca2f418c45626198e30e0/api/@internal/component/ets/enums.d.ts#L1614-L1720)
- [Mouse documentation](https://github.com/openharmony/docs/blob/442679e8594d9c9c9b2a4bdc9a25a47f1035d6cb/en/application-dev/reference/apis-arkui/arkui-ts/ts-universal-mouse-key.md#L19-L61)
- [Mouse bridge, including vp conversion and pressedButtons](https://github.com/openharmony/arkui_ace_engine/blob/36e564869291f147d2675c1098dae483eca47ba5/frameworks/bridge/declarative_frontend/engine/functions/js_click_function.cpp#L145-L189)

### Wheel / touchpad axis: real samples, not a held button

The public declaration exposes:
- onAxisEvent(event: Callback<AxisEvent>): T since API17.
- AxisEvent extends BaseEvent: action; local x/y, windowX/Y, displayX/Y; optional scrollStep; propagation(); getHorizontalAxisValue(); getVerticalAxisValue().
- AxisAction.NONE=0, BEGIN=1, UPDATE=2, END=3, CANCEL=4, all since API17.
- The docs label horizontal/vertical getter values vp. Local cursor positions are also vp.
- scrollStep is an optional wheel-only configuration value in [0,65535]. It is not proof of per-event displacement, elapsed time, direction, a repeat count or a continuous held state.

Preserve each getter result unchanged as the platform sample. Do not apply Windows WHEEL_DELTA=120, the original 120*10/20 divisors, mouse 500-count calibration, or a guessed global HID conversion to vp. Use an explicitly labelled local calibration if mapping an axis sample to normalized Delta/Value.

Nuance requiring device validation: the pinned axis bridge converts cursor coordinates by density, but getHorizontalAxisValue/getVerticalAxisValue directly return AxisInfo values. The MMI converter copies incoming scroll-axis values directly. Another internal path, AxisEvent::ConvertToOffset, uses LINE_HEIGHT_DESKTOP / MOUSE_WHEEL_DEGREES for mouse wheel input. Thus the public documentation's vp unit label is verified, while actual physical-wheel notch-to-vp scaling/equivalence to touchpad displacement is not established by these inspected lines. Preserve original numeric axis values and flag this as an on-device calibration question; do not add an unproven extra density conversion.

BEGIN/UPDATE/END/CANCEL prove a defined sequence, not guaranteed complete delivery on every real OS/device. End and Cancel are terminal. A single wheel sample, even BEGIN, does not prove a continuing contact. For approved 0.28, wheel is immediate Drive only and cannot start/refresh an indefinite Offset repeat. No synthetic centering/release value is sent when cancelling.

API20 must not use later master-only getPinchAxisScaleValue (API21) or hasAxis (API22). The pinned API20-compatible AxisEvent ends after the two axis getters. This report does not normalize or enable gamepad axisMap.

Sources:
- [Axis declarations](https://github.com/openharmony/interface_sdk-js/blob/1f243d38e62f186f286ca2f418c45626198e30e0/api/@internal/component/ets/common.d.ts#L13632-L13783)
- [onAxisEvent](https://github.com/openharmony/interface_sdk-js/blob/1f243d38e62f186f286ca2f418c45626198e30e0/api/@internal/component/ets/common.d.ts#L24963-L24973)
- [AxisAction phases](https://github.com/openharmony/interface_sdk-js/blob/1f243d38e62f186f286ca2f418c45626198e30e0/api/@internal/component/ets/enums.d.ts#L10950-L11013)
- [Pinned axis docs: vp / scrollStep / propagation](https://github.com/openharmony/docs/blob/442679e8594d9c9c9b2a4bdc9a25a47f1035d6cb/en/application-dev/reference/apis-arkui/arkui-ts/ts-universal-events-axis.md#L9-L93)
- [Axis bridge](https://github.com/openharmony/arkui_ace_engine/blob/36e564869291f147d2675c1098dae483eca47ba5/frameworks/bridge/declarative_frontend/engine/jsi/nativeModule/arkts_native_common_bridge.cpp#L10639-L10705)
- [Getters return original axis fields](https://github.com/openharmony/arkui_ace_engine/blob/36e564869291f147d2675c1098dae483eca47ba5/frameworks/bridge/declarative_frontend/engine/jsi/nativeModule/arkts_utils.cpp#L2529-L2549)
- [MMI scroll fields copied without local calibration](https://github.com/openharmony/arkui_ace_engine/blob/36e564869291f147d2675c1098dae483eca47ba5/adapter/ohos/entrance/mmi_event_convertor.cpp#L549-L600)
- [Separate internal wheel offset conversion](https://github.com/openharmony/arkui_ace_engine/blob/36e564869291f147d2675c1098dae483eca47ba5/frameworks/core/event/axis_event.cpp#L82-L100)

## 2. Time contract: freshness, not media time

BaseEvent.timestamp is a number. The public BaseEvent docs define it as time since system boot, in ns. Touch, MouseEvent and AxisEvent inherit it. The corresponding bridges emit the native time_since_epoch().count(); the MMI converter constructs its timestamp from the input action time.

Store eventTimestampNs separately. Any diagnostic delta in milliseconds is (newNs-oldNs)/1e6, only between compatible events in the same active capture. Do not compare it directly to Date.now(), use it as epoch wall time, or feed it into the media/transition clock. Duplicate timestamps are not automatically invalid; reject backward or nonfinite samples according to capture ordering. A number-valued ns field should not require exact integer precision forever.

Use a separately injected/verified monotonic scheduler clock for deadlines. Native event timestamps and locally observed scheduler time remain separate domains. Lifecycle cancellation callbacks have no native input timestamp and must not invent one.

Parent-confirmed original semantic constraints remain unchanged: original RawInput mouse/wheel gesture DeltaTime=0; Offset emits DeltaTime=.1 with first tick after 100 ms. The new local touch policy should explicitly choose and document its duration; this DTO does not derive or silently assign transition duration from native event time.

Sources:
- [BaseEvent timestamp declaration](https://github.com/openharmony/interface_sdk-js/blob/1f243d38e62f186f286ca2f418c45626198e30e0/api/@internal/component/ets/common.d.ts#L11685-L11720)
- [BaseEvent ns/since-boot documentation](https://github.com/openharmony/docs/blob/442679e8594d9c9c9b2a4bdc9a25a47f1035d6cb/en/application-dev/reference/apis-arkui/arkui-ts/ts-gesture-customize-judge.md#L39-L58)

## 3. Consumption is local and synchronous

Touch/mouse:
- Call stopPropagation() only for a handled, explicitly admitted local mapping.
- It prevents event propagation in the ArkUI response chain. It does not establish an OS/global hook or guarantee that every native/default component interaction is suppressed.
- TouchEvent.preventDefault() is not a generic cancel API: the pinned documentation limits it to Hyperlink and warns of exceptions on unsupported components. Do not call it on the local input surface.
- Mouse-originated touch filtering is still required; do not assume stopPropagation alone removes all cross-event conversion.

Axis:
- Unlike touch/mouse, the native AxisEventTarget sets stopPropagation=true before the callback.
- AxisEvent.propagation() invokes JsPropagation, setting it false.
- Therefore an installed onAxisEvent handler must call propagation() on every unhandled path: disabled reception, unmatched source/mapping, rejected sample, etc. An empty callback can otherwise swallow scroll.
- Decide handling synchronously in the callback; consume only the active local surface's admitted input. Do not retain AxisEvent or its native callback methods for timers/asynchronous work. The source object wraps a pointer to callback-scoped AxisInfo; copy finite scalar DTO data before returning.

Sources:
- [Default axis consumption and terminal-sequence checks](https://github.com/openharmony/arkui_ace_engine/blob/36e564869291f147d2675c1098dae483eca47ba5/frameworks/core/event/axis_event.cpp#L303-L355)
- [JsStopPropagation / JsPropagation](https://github.com/openharmony/arkui_ace_engine/blob/36e564869291f147d2675c1098dae483eca47ba5/frameworks/bridge/declarative_frontend/engine/js_types.cpp#L24-L44)
- [Touch preventDefault restriction](https://github.com/openharmony/docs/blob/442679e8594d9c9c9b2a4bdc9a25a47f1035d6cb/en/application-dev/reference/apis-arkui/arkui-ts/ts-universal-events-touch.md#L49-L53)

## 4. Cancel / loss of ownership / focus boundary

Supported terminals:
1. TouchType.Up / Cancel for the owned touch.
2. MouseAction.Release / CANCEL, or present pressedButtons no longer containing the owned button.
3. AxisAction.END / CANCEL for axis sequencing; these never authorize an Offset hold.
4. onHover(false), or coordinates outside the accepted local region, conservatively retire mouse ownership. Leaving the region is not permission to capture globally.
5. CommonMethod.onBlur cancels focus-owned local input. It only reports the component losing focus; a never-focused surface cannot rely on it as a whole-window loss detector.
6. WindowStage.on('windowStageEvent', callback) and WindowStageEventType.INACTIVE / HIDDEN cover window-stage focus/background changes. This API is public since API9. INACTIVE=3 and HIDDEN=4 are declared; use enum names in code.
7. UIAbility.onBackground() and page/component teardown also retire input/repeat state. Register/deregister lifecycle ownership; callbacks from an old page/stage must not act on a replacement.

The application additionally cancels for collapse, Stop, edits/modal/text input, resize/rotation, profile/mapping/target revision changes and read-only/recovery transitions as required by CONTINUOUS_DRIVE_028_CONTRACT.md. These are application rules, not extra platform promises. Do not send a fake zero/center sample or resume the old hold on focus regain. Fresh explicit reception and physical contact are required.

Component/window blur cancels input work; it does not itself redefine media Stop or physical-output permissions. The existing global Stop path remains authoritative.

Sources:
- [onBlur](https://github.com/openharmony/interface_sdk-js/blob/1f243d38e62f186f286ca2f418c45626198e30e0/api/@internal/component/ets/common.d.ts#L25065-L25092)
- [WindowStage focus/background enum](https://github.com/openharmony/interface_sdk-js/blob/1f243d38e62f186f286ca2f418c45626198e30e0/api/@ohos.window.d.ts#L10877-L10981)
- [WindowStage on/off registration](https://github.com/openharmony/interface_sdk-js/blob/1f243d38e62f186f286ca2f418c45626198e30e0/api/@ohos.window.d.ts#L11766-L11858)
- [UIAbility.onBackground](https://github.com/openharmony/interface_sdk-js/blob/1f243d38e62f186f286ca2f418c45626198e30e0/api/@ohos.app.ability.UIAbility.d.ts#L664-L691)

## 5. Proposed DTOs and conversion boundary

This is a compile-to-verify design sketch, not production code. Enums avoid unbounded string/numeric interpretation. Native event objects/functions are intentionally absent.

```ts
enum LocalSource { Touch, Mouse, WheelAxis, TouchpadAxis, UnknownAxis }
enum LocalPhase { Begin, Update, End, Cancel }
enum DeltaBasis { None, NativeRawVp, LocalPositionDifferenceVp, AxisApiDocumentedVp }
enum HoldProof { None, OwnedTouchContact, OwnedMouseButton }
enum CancelReason {
  NativeCancel, Release, LeftRegion, FocusLost, Background,
  SurfaceChanged, ConfigurationChanged, Stop, OwnershipLost
}

interface LocalSampleDto {
  captureId: number;
  sequence: number;
  ownerRevision: number;
  source: LocalSource;
  phase: LocalPhase;
  eventTimestampNs: number;
  sourceType: number;
  sourceTool: number;
  deviceId?: number;
  pointerId?: number;
  ownedMouseButton?: number;
  localXVp: number;
  localYVp: number;
  deltaXVp?: number;
  deltaYVp?: number;
  horizontalAxisValue?: number;
  verticalAxisValue?: number;
  axisValueUnit?: string; // literal documented-vp; original numeric value retained
  scrollStep?: number;
  deltaBasis: DeltaBasis;
  holdProof: HoldProof;
}

interface LocalCancelDto {
  captureId: number;
  ownerRevision: number;
  reason: CancelReason;
  eventTimestampNs?: number; // absent for lifecycle/configuration cancellation
}

interface LocalDriveDataDto {
  captureId: number;
  ownerRevision: number;
  value: number;          // finite [0,1]
  delta: number;          // finite; no extra time multiplication
  gestureDeltaTimeSeconds: number; // explicit source policy, never timestamp delta
  holdProof: HoldProof;
}
```

Design rules:
- captureId/ownerRevision must identify the full owner state (page, mapping/profile revision, axis and target generation), not merely a pointer number. Parent contract defines that identity.
- Construct point data only when finite, from an admitted native source. A terminal with missing contact coordinates uses LocalCancelDto rather than inventing a sample.
- Match source/sourceTool using SDK enum names. Unknown axis provenance is not relabelled wheel or gamepad. Keep both numeric enum values only for diagnostics.
- Position normalization may use clamp(localXVp / surfaceWidthVp,0,1) and the selected Y counterpart only after a finite positive layout span is verified. Direction/inversion are explicit mapping policy.
- Relative normalization uses the actual selected vp displacement / explicit local calibrated span. Absolute position and relative displacement remain distinct.
- Do not clamp individual relative increments to [0,1] merely because Value is normalized; downstream original action bounds remain authoritative.
- Axis values are copied without density/120/500 conversion. The normalization/calibration layer may accumulate a local virtual value if that is the explicitly selected local-surface policy; label it as local, not Windows RawInput equivalence.
- An owned Touch Down or Mouse Press can maintain HoldProof until a terminal/cancel. Pointer stillness does not imply release. Hover/movement alone, wheel/touchpad axis phases, elapsed time and a nonzero last delta do not create HoldProof.
- The Offset scheduler may run only under a current owned touch/mouse capture and the parent's original-backed nonzero Offset calculation. Every 100 ms tick rechecks capture, reception, revisions and target validity. Repeated delta data is not integrated again. Wheel never starts or renews Offset.
- onAxisEvent can synchronously produce a handled boolean for the adapter: false => event.propagation(); true => leave default consumption. Touch/mouse true => stopPropagation(). DTO processing must not delay that decision past callback return.

## 6. Still unproven / required restoration and device checks

1. Exact commercial SDK 26.0.0.851 declaration parity, imports, ArkTS compileability, manifest/API floor, and actual restored application's lifecycle wiring.
2. The unread 0.26 audit's detailed findings and reconciliation with current code.
3. Actual wheel/touchpad units, magnitude, direction preferences, notch scaling and reliable BEGIN/END/CANCEL delivery on the target devices. Public docs plus source do not close these.
4. Mouse capture/release delivery outside the component/window, under occlusion, window movement, device disconnection or accessibility redirection. The conservative leave/focus cancellation policy must be exercised.
5. Simultaneous touch/mouse source tags, left-button synthetic touch deduplication, multi-touch pointer ownership and cancel with empty arrays.
6. Event consumption versus nested Scroll/Button/text/gesture handlers, including disabled/unhandled axis passthrough. Never infer that stopPropagation equals a global preventDefault.
7. Scheduler liveness under UI/background throttling. Tests must verify no burst catch-up, first 100 ms tick, no post-cancel invocation, and no resume from stale lifecycle callbacks.
8. Gamepad axes, Windows raw HID units, global input capture and output/device acknowledgements are outside this evidence and must not be claimed.

Recommended bounded acceptance after restoration: compile API20 handlers; fake-clock controller tests; run actual phone/tablet/PC input matrix with density/resize/edge/cancel/focus cases; record native phase/unit observations; then run the parent contract's session/output and original-source numerical tests. No live device access was performed for this report.

