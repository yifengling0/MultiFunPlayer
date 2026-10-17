# Original clipboard evidence and translation

Pinned upstream: 36c08fbb99ac9398a63ff1cca1bbf68cd2228a94.

- `Source/MultiFunPlayer/Common/DeviceSettings.cs`: opt-in Newtonsoft JSON fields are `Name`, `IsDefault`, `OutputPrecision`, `Axes`; axis fields are `Name`, `FriendlyName`, `FunscriptNames`, `DefaultValue`, `Enabled`.
- `Source/MultiFunPlayer/UI/Controls/ViewModels/DeviceSettingsViewModel.cs`, `OnExportSelectedDevice`: JObject.FromObject, removes IsDefault, indented clipboard text. `OnImportDevice`: parses one object, removes IsDefault, appends device.
- `source-custom.json` is an independently transcribed source-format fixture, using source L0 values plus disabled A2/null display-name coverage. It is not represented as a captured desktop execution.

OHOS exports those same field names and no wrapper, ID, IsDefault, runtime state, credentials, or motion settings. Whitespace is JSON-equivalent (Newtonsoft may emit integral doubles as `0.0`; JavaScript emits `0`). Enabled flags, alias ordering/case/duplicates, default positions and precision are preserved without normalization.

Import permits unknown ordinary fields but never copies them. IsDefault and identity-looking fields are ignored; every imported profile receives a new available `custom-N` ID and is custom even when its name matches a built-in. No existing profile, selected next-start device, active registry, or session is overwritten. User selection and configuration save remain separate. Missing optional fields receive source constructor defaults. A missing/blank device or axis name is rejected rather than imported as null.

Deliberate bounded validation beyond desktop: 64 Ki text characters, depth 16, 32 axes (matching OHOS configuration schema), 64 aliases/axis, 256 characters/name/alias. Axis names must be uppercase letter + digit and unique; enabled is boolean, default is finite 0–1, precision integer 1–10. Null arrays and wrong field types are rejected. Prototype/constructor/$type keys are rejected anywhere, including unknown subtrees. No .NET type activation or arbitrary object assignment is performed.

Native adapter uses installed official SDK 26 `@kit.BasicServicesKit` pasteboard getData/getPrimaryText/createData/setData. UI uses official secure PasteButton and reads only on SUCCESS, avoiding general READ_PASTEBOARD permission. Construction/startup performs no clipboard read. Empty text, API errors, rejected/cancelled authorization and callback errors are visible. Export asks before replacing existing clipboard content. As with upstream CanExportSelectedDevice, the UI exports custom profiles only; built-ins must first be cloned. Tests use fake ports only; no developer/user clipboard is accessed during tests.

Hardware follow-up: validate secure PasteButton temporary authorization, clipboard cancellation/busy errors, copy-to-desktop interoperability, and rotary/touch access on target devices. SDK build is not a substitute for these device checks.
