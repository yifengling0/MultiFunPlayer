# Original output range action oracle

Run with an existing official .NET 9 SDK; the runner never downloads, restores packages, or contacts an endpoint:

```
MFP_DOTNET_ROOT=/path/to/dotnet-sdk python3 ohos/tools/reference/output-range-017/run.py
MFP_DOTNET_ROOT=/path/to/dotnet-sdk node --test ohos/tests/output-range-017-source-oracle.test.mjs
```

The host extracts the whole original AbstractOutputTarget.RegisterActions method. It captures the delegates through a structural manager and invokes the actual original binding expressions for all eight Set/Offset commands. DeviceAxisSettings.cs is compiled unchanged, with inert JSON attributes/Stylet base. Source DeviceAxis identity registration, UI controls, WPF, Fody and transport are not executed. Empty/unknown input names map to null in the declared host shim.

Separate original source spans execute Lerp, DeviceAxis fixed/event TCode formatting and mapped-value dirty comparison. Numeric command output and mapped/encoded output have independent fixtures. The generated-host, exact source spans, source files, runner and template have SHA-256 provenance. The unchanged original code's callback inputs intentionally include reversed/equal endpoints and independently crossed/equal limits. The production reducer rejects only unsupported editor-domain/malformed input or out-of-[0,1] final endpoints, while preserving normalized reversed ranges exactly.

The fixture holds 2,804 callback rows (2,780 numeric cases + 24 selection-shim cases) and 432 mapping/encoding/dirty rows. See `../../../OUTPUT_RANGE_017_SOURCE_AUDIT.md` for the complete boundary and source references.
