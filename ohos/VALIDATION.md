# Validation — 2026-10-16

Validated the simulation milestone on the official Linux HarmonyOS CLI:

- Node 24.14.1; Hvigor 6.26.8; ohpm 26.0.0.630; ETS SDK 26.0.0.105 (API26); JDK21.
- `node --test tests/core.test.mjs`: **22 passed, 0 failed**.
- Final `tools/build.sh`: **exit 0**, actual ArkTS compile, HAP packaging and packing check passed; 33 tasks (17 executed, 16 up to date), final build 8.364 seconds.
- ZIP CRC, nonempty `ets/modules.abc`, bundle `com.multifunplayer.ohos`, device types `phone`, `tablet`, `2in1`: passed.
- Unsigned HAP: **114017 bytes**.
- SHA256: `f031bb07b15275305d522be24f491763395b31064796330b22b7b7ab101269bb`.
- Original `Source/`, root README and MIT license unchanged.

Earlier compilation needed a low-memory configuration (single worker, memory optimization, 512MB V8 heap), now captured in the project/build script. The final expected build warning is that no signingConfig exists.

Not performed: signing, installation, emulator/phone/tablet/PC runtime or screenshot tests, real file-picker permission tests, physical device output, performance/battery tests, or Windows regression build. This HAP is an unsigned development artifact, not an install-ready release. Responsive UI code compiling is not a claim that three-device UI testing passed. GitHub CI is separately scoped to core tests only.
