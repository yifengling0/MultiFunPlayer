# 0.27 official immersive-material integration contract

## Scope and source

User supplied the HarmonyOS Samples repository and approved the existing four-tool workspace. The migrated official reference is pinned in HARMONY_SAMPLE_027_SOURCE_PIN.json. The reference application targets API24/min23: it does not prove API20 compatibility. Its MaterialUtil wrapper only applies ordinary color/blur and does not implement the named material styles. MFP will not copy that wrapper and label it native immersive material.

The actual API26 implementation is `uiMaterial.ImmersiveMaterial`, component `systemMaterial`, `Select.menuSystemMaterial`, and dialog option `systemMaterial`. The installed official SDK maps numeric API26 to platform26.0.0 (ets/oh-uni-package.json). Reference HDS Navigation/End Tabs examples are outside this increment. No new Navigation root, conditional video tree, extra Surface, or global material metadata is introduced.

## Runtime compatibility

- The entry point may import only the old-safe manager/modifier contracts. uiMaterial must be a static import only inside the dynamically loaded API26 adapter.
- Read the since-API6 numeric deviceInfo.sdkApiVersion. Invalid/nonintegral/<26 skips dynamic import entirely. >=26 attempts import, then actual isImmersiveMaterialSupported must be true; failure is a readable fallback, never an initialization failure for playback.
- Old API20 never invokes systemMaterial, menuSystemMaterial, or passes new material properties in dialog options. Passing undefined to a new method is not a compatibility guard.
- Select uses REGULAR and Toggle/Slider use ULTRA_THIN, requesting native interactive deformation and white lightEffect; THICK menus/dialogs remain noninteractive. These requests are not proof that a device rendered the effect.
- The system chooses its global EXQUISITE/GENTLE/SMOOTH tier. No desktop/phone assumption, override, or visual-success claim from an API response. Display a truthful requested/unsupported/fallback status.
- Modifier-owned surfaces avoid competing background/border/shadow settings. Selection, disabled state, text, bounds, callback identity and accessibility remain separate. Asynchronous availability only updates presentation revision; it never submits a draft or emits a command.

## Component coverage

| Production surface | Planned behavior |
|---|---|
| Shared SettingsChoiceField, all source/device/axis/output/preferences choices | Native Select surface + its real popup menu when supported; exact existing field/edge fallback otherwise |
| Shared SettingsSwitchField, all Boolean settings | Native Toggle when supported; existing true/false accent and 52vp response region preserved |
| Index seek sliders (both presentations), volume, axis scale | Native Slider when supported, real existing continuous callbacks unchanged; no draft confirmation added |
| Output deletion, device/axis deletion and clipboard-overwrite confirmations | One real cancelable system custom-dialog shell; API26 native dialog material through adapter, old system dialog otherwise; explicit confirm only |
| Body buttons, Stop, connection/Arm actions, list rows, editor cards | Consistent official-style NORMAL/EMPHASIZED secondary/primary roles and approved colors; no native material claim outside documented locations |
| Playlist, managed-library, axis rows | Existing List/rows and selection semantics retained, grouped separators and full-width readable rows; no arbitrary blur layer |

## Confirmation lifecycle

Opening a confirmation captures immutable target/profile/axis identity plus existing draft/page owner. Confirm consumes the request at most once and rechecks current owner, foreground, read-only and source identity immediately before business action. Resize/tool switch/profile/target replacement, page retirement, background or cancel invalidates pending acceptance. Late native callbacks cannot operate on the new selection. Closing a dialog does not apply an editor draft.

A custom confirmation includes a visible >=52vp Stop using the existing hard-stop path, and cancel/back/outside dismissal never synthesizes confirmation. It must remain usable on short screens, with bounded scrollable message content and fixed actions. Existing source/output permission, disconnect, async-close isolation and no-auto-Arm contracts do not change.

If native controller.close throws, acceptance is permanently retired, the current page immediately hard-stops, and all new playback/preview/connect/Arm/shortcut starts remain locked. Keyboard capture remains active. The surviving modal retains only a page-owned emergency Stop; normally closed or retired-page callbacks stay inert. Restart the app to recover; blur/reappear does not silently clear this uncertainty. Already-issued I/O cannot be recalled. The dialog also handles delivered F12 and Escape; no inactive-window global hook is promised.

## Verification matrix before freeze

1. Actual manager/adapter tests: API20/25 never load new module; invalid version;26 supported/unsupported;future numeric version with actual capability; load/query failures; reset during pending import; revision changes without actions; exact callbacks retained by dialog decoration.
2. Actual component controller tests: stale native Select/Toggle callbacks still rejected, draft raw/invalid states survive all four tool transitions/rotation/resize, material readiness never commits; Slider paths stay live and owner guarded.
3. Actual confirmation tests: accept/cancel/Stop once, source/target/profile/background/page changes before native callback, late callbacks, controller close errors, empty/long copy, short-height geometry.
4. Full Node suite with actual .NET oracles, official clean SDK build with adapter truly reachable and no forbidden static import from the old entry graph; final source/HAP hashes and packaged Apache/CH licenses verified independently.
5. API20 and API26 phone/tablet/PC rendering, system tier effects, popup/IME/dismiss/contrast require user device verification. Compile/mock/source inspection do not constitute a screenshot or hardware acceptance. Existing denied browser-render route is not retried.

## No expansion

No new protocol, Drive input, File recording, remote endpoint contact, credential persistence, physical connection, Git operation or layout redesign in this increment. Coverage of original actions remains unchanged.
