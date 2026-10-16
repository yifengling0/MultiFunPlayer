# Validation — 2026-10-16

Validated the simulation milestone on the official Linux HarmonyOS CLI:

- Node 24.14.1; Hvigor 6.26.8; ohpm 26.0.0.630; ETS SDK 26.0.0.105 (API26); JDK21.
- `node --test tests/core.test.mjs`: **22 passed, 0 failed**.
- Final `tools/build.sh`: **exit 0**, actual ArkTS compile, HAP packaging and packing check passed; 33 tasks (17 executed, 16 up to date), final build 12.138 seconds.
- ZIP CRC, nonempty `ets/modules.abc`, bundle `com.multifunplayer.ohos`, device types `phone`, `tablet`, `2in1`: passed.
- Unsigned HAP: **114644 bytes**.
- SHA256: `46fdb2735888f5efed2593381f579b4515a6843dc2b803c8eb65f35668d2a4e2`.
- Original `Source/`, root README and MIT license unchanged.

Earlier compilation needed a low-memory configuration (single worker, memory optimization, 512MB V8 heap), now captured in the project/build script. The final expected build warning is that no signingConfig exists.

Not performed: signing, installation, emulator/phone/tablet/PC runtime or screenshot tests, real file-picker permission tests, physical device output, performance/battery tests, or Windows regression build. This HAP is an unsigned development artifact, not an install-ready release. Responsive UI code compiling is not a claim that three-device UI testing passed. GitHub CI is separately scoped to core tests only.

Independent code review found no blocker for simulation scope. Follow-up fixes disable Play throughout asynchronous imports (also guarded in its handler) and catch rejected main-window load promises. Core tests and HAP build were rerun after these edits; actual delayed-picker/error UI scenarios still need device testing.

## M2 — 0.2.0 synchronization milestone

- 98 Node tests pass, including 1,272 independently generated reference samples across 44 interpolation datasets. Python exact-rational oracle transcribes pinned upstream kernels; the C# application was not executed.
- Official SDK build passed: 33 tasks (17 executed, 16 up-to-date), 12.502 seconds. Actual ArkTS compilation, packaging and package metadata checks passed.
- HAP: 208085 bytes; SHA256 `9a2c96308cc492f5dad13ecc49c3f70f3e0bfc206bd6888bd4025add928c366e`.
- Metadata parsing/defensive copy, filename axis aliases, offset sign/addition, speed scaling, lifecycle gates and interpolation selection covered. Device-native controls and actual rendering remain untested.
- No physical transport, signing or video playback added in this milestone.

M2 independent review: no safety blocker; adjacent-chapter boundary labels now use half-open intervals, and unreachable shifted markers are reported instead of silently clamped. Three targeted regression tests pass. HAP source map lists only the M2 core/UI modules (no unfinished video adapter).

## M3 — 0.3.0 native video milestone

- **124 Node tests passed, 0 failed**. Includes media-clock/engine invariants and seven tests exercising the actual type-stripped adapter with mocked native APIs. These mocks do not establish device playback correctness.
- Official SDK **clean build passed**, with actual ArkTS compilation, resource compilation, HAP packaging and package checks: 33 tasks (32 executed, 1 up-to-date).
- HAP: **289730 bytes**; SHA256 `3f840b2a1f349c4065479492a48c4719e75a1202e3684d311b604c46b172626a`.
- Native source selection, AVPlayer lifecycle, stable XComponent, actual-time synchronization, seek confirmation, volume and rate controls compile. Runtime AVPlayer capability guard handles unavailable devices; compiler still warns about device-dependent multimedia APIs. Missing signingConfig is expected.
- Independent review found two P2 issues, both fixed: retain/retry failed player/FD cleanup ownership; completed playback presents explicit Rewind then Play. No P1 issue found in that review.
- Cleanup rejection, exactly-once successful release/close, stale source callbacks, source-generation rejection, missing capability, stale media time, buffering gates and completion/rewind are covered by pure/mocked tests.
- First pre-final build process exited 255 after ArkTS compilation; low-memory retry and final clean build succeeded. HAP ZIP timestamps may change hashes across rebuilds; this hash identifies the delivered clean-build artifact.
- **Not tested:** on-device video/audio playback, actual picker access, rotation/multi-window, seek accuracy, codec compatibility, hardware decoding, battery/performance, signing or installation. See DEVICE_TEST_PLAN.md.
- No physical device outputs or network permissions were added. Original Windows sources remain unchanged.
