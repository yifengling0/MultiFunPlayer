# Isolated immersive material adapter (0.27)

## Integration contract

- Call `ImmersiveMaterialManager.initialize()` during page initialization. It is idempotent and returns a status snapshot.
- Observe `mfpImmersiveMaterialRevision` with `@StorageLink` and pass its numeric value to `MfpSelectMaterialModifier`, `MfpToggleMaterialModifier`, and `MfpSliderMaterialModifier`.
- Modifiers own only the visual surface. Keep the existing components, values, callbacks, enabled/focused state, accessibility, 52vp target sizing, and media tree. Do not put competing background/border/shadow attributes outside the Select modifier.
- The native Select body uses REGULAR and its native option menu uses THICK. Toggle and Slider use ULTRA_THIN. REGULAR/ULTRA_THIN request the SDK's native interactive deformation and white light-sensing feedback; THICK menus/dialogs remain noninteractive. The ordinary Select field/edge/radius and Toggle selected accent are retained on fallback. Slider track/thumb and caller colors remain unchanged.
- `decorateCustomDialog(options)` and `decorateDialog(options)` accept a **fresh, caller-owned** options object, assign only `systemMaterial`, and return that same object. Do not reuse decorated options. Builder and callback identity are preserved; no callback is executed, wrapped, or copied.
- Explicit dialog background, blur/effect, border, shadow, or material customization wins: the options are returned untouched. A custom dialog builder must not paint an opaque background over the native dialog surface.
- `reset()` is lifecycle/test invalidation, not a setting toggle. It invalidates late initialization and does not change business or playback state.

## Compatibility and evidence

The API-20-safe manager imports only `@ohos.deviceInfo`. The SDK declares `sdkApiVersion` as a numeric API level since API 6. Installed SDK `ets/oh-uni-package.json` states `apiVersion: "26"` and `platformVersion: "26.0.0"`. Only finite integer levels >=26 may dynamically import `NativeImmersiveMaterialApi26.ets`; invalid/older levels never resolve that module or `@ohos.arkui.uiMaterial`.

The native module requires `isImmersiveMaterialSupported() === true` and one of the actual `getGlobalMaterialLevel()` enum values. It never chooses or sets a device performance tier, enables global metadata, or simulates native material with blur. Import, capability, construction, and binding failures fail closed.

Official SDK declarations:

- `ets/api/@ohos.deviceInfo.d.ts`: `sdkApiVersion`, since 6
- `ets/api/@ohos.arkui.uiMaterial.d.ts`: native support probe, global material level, ImmersiveMaterial and Material.empty, since 26.0.0
- `ets/component/common.d.ts`: `systemMaterial`, since 26.0.0; avoid simultaneous opaque backgrounds/borders/shadows
- `ets/component/select.d.ts`: `menuSystemMaterial`, since 26.0.0
- `ets/component/custom_dialog_controller.d.ts` and `alert_dialog.d.ts`: `systemMaterial` option

Source-level modifier transition expectation comes from the official engine:

- [ArkComponent.ts](https://github.com/openharmony/arkui_ace_engine/blob/master/frameworks/bridge/declarative_frontend/ark_component/src/ArkComponent.ts): `cleanStageValue` clears staged attributes; `ModifierWithKey.applyStage` resets omitted attributes; `applyModifierPatch` commits them.
- [pu_view.ts](https://github.com/openharmony/arkui_ace_engine/blob/master/frameworks/bridge/declarative_frontend/state_mgmt/src/lib/partial_update/pu_view.ts): `observeComponentCreation2` calls `cleanStageValue` after component updates.

Native application exceptions explicitly clear attempted material with `Material.empty` before allowing ordinary fallback. If clearing throws, status becomes `visual-unconfirmed`; the affected attribute instance receives neither another material attempt nor a conflicting fallback overlay. Other controls retain fallback. Failure publishes only once, avoiding revision loops. This catches adapter-call failures; native rendering/commit failures outside the modifier callback still require device validation.

## Verification boundary

`node --test ohos/tests/immersive-material-adapter-027.test.mjs` executes the production manager, modifier, and native adapter source through mocked SDK boundaries. It verifies no API26 module load on older versions, actual modifier calls, all system levels, exceptions, late initialization, callback identity, override conflicts, and cleanup failure handling. The staged-diff test is an explicitly labeled source-derived model, not a real ArkUI render.

`MFP_SDK_TOOLS=/absolute/path/to/command-line-tools node ohos/tests/immersive-material-adapter-027-sdk-probe.mjs` verifies the numeric SDK mapping and performs a focused official declaration/ArkTS lint check. It is not an assembled HAP, device, screenshot, visual, focus, or touch acceptance test.
