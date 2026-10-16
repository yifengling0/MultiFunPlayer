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

## M4 — 0.4.0 authorized resource library

- **170 Node tests passed, 0 failed**, including 22 resource-selection tests, 17 mocked file-I/O tests (with real catalog-boundary integration), and 6 tests executing actual extracted Index controller methods with mocked dependencies. These cover stale picker/scan completion, background-cancelled pair replacement, and count/text/action budgets.
- Final application source passed an official SDK **clean build**: 33 tasks (32 executed, 1 up-to-date), 8.774 seconds. Actual ArkTS/resource compilation, HAP packaging and checks succeeded. The six additional controller regression tests were then run in the final 170-test suite without changing application code.
- HAP: **429610 bytes**; SHA256 `0b276aa4f33b249f3b9ed8476115bbe61effc9dd0e401fb08334598c8dc6fa74`. Metadata confirms version 0.4.0 and phone/tablet/2in1.
- Two preliminary builds exited 255 during compilation/packaging under limited memory. Setting the Java packaging heap to 256 MiB resolved this; tools/build.sh now sets that default unless the caller supplies JAVA_TOOL_OPTIONS. ArkTS remains one worker/512 MiB.
- Review findings fixed: multi-file provider identity mismatch; cumulative candidate memory bounds; actual-background cancellation of pair loading; unsupported dotfiles aborting an index; final video open now rejects nonregular files and uses NOFOLLOW/NONBLOCK.
- Remaining compiler warnings concern native multimedia capability availability and filesystem APIs that may throw. I/O callers catch and report failures; signingConfig remains absent by design.
- Source-led matching covers loose files, multi-axis priority/blocking and ordered axis aliases. **ZIP archives, configured cross-directory/remote repositories and full visual parity are not implemented.** See LIBRARY_MATCHING.md and UI_PARITY_AUDIT.md for exact differences.
- **Not performed:** real folder/file-picker grants, Download provider access, revoked permissions on a device, video/audio playback, installation/signing, phone/tablet/PC screenshot comparison or Windows C# execution.
- Public path APIs cannot guarantee race-free traversal against hostile concurrent ancestor replacement. Platform grants remain the access boundary; no broad storage permission or physical output was added.

## M5 — 0.5.0 source-led layout, ZIP and configured libraries

- 201 Node tests pass, including 29 library cases, 18 ZIP/native-adapter mock cases, 8 actual page-controller flow cases and 4 heatmap cases.
- Clean official SDK build succeeded in 10.386 seconds: 33 tasks, 32 executed, 1 up-to-date. Actual ArkTS compilation, HAP packaging, CRC and metadata checks passed. Prior clean step also succeeded.
- Unsigned HAP: 611336 bytes. SHA256 `7839dd52fb2090a15b9cd2b5fd3dc86c46be2f86d09a93dfcf88f65ea46d8320`.
- ZIP/core search tests exercise original priority, configured-library order, recursion, entry order, safety limits, cancellation, CRC/structural rejection, stored/DEFLATE and native cleanup mocks. UI-controller tests confirm ZIP-before-loose candidate forwarding and malformed ZIP failure without partial video opening.
- Native zlib streaming API signatures (`createZip`, `inflateInit2`, `getZStream`) are marked since API12 in the installed official SDK, below the declared API20 minimum. This is compile/API evidence, not a device execution result.
- Main-window structural layout and heatmap source transcription implemented; full UI/control parity remains incomplete. See UI_PARITY_AUDIT.md for implemented and disabled controls.
- No device/native DEFLATE execution, signing, installation, screenshots, rendering/keyboard/touch validation or physical outputs were performed. Tests of native APIs use mocks. Windows application was not executed.

## M6 — 0.5.1 selected-axis script settings

- 207 Node tests pass. Six added cases cover exact scale→clamp→invert order, neutral positions, independent interpolation, defensive settings copies/reset, bounds, internal/native safety gates and preview/output equivalence.
- Actual SDK build succeeded in 9.168 seconds: 33 tasks (17 executed, 16 up-to-date), including ArkTS compilation and HAP packaging/metadata checks.
- HAP 624353 bytes, SHA256 `2652760ade2b196858f07980cbf996d7d60696ca6373df26851359c2554ccc84`.
- Source authority: ScriptViewModel.cs UpdateScript and AxisSettings; ScriptView.xaml scale slider; DeviceSettings default neutral values. Only script transforms are ported, not the complete mixed-output state pipeline.
- No signing, device runtime, screenshot acceptance or physical commands. The 0.5.0 clean build remains the prior clean baseline; this patch was incrementally rebuilt with changed ArkTS compiled.

## M7 — 0.6.0 aspect-correct video and automatic Download library

- Base: `587209fa917f4c1508b1d31b3b111930a02cb23b`; preserved the user's LF normalization and Chinese dictionary updates.
- Final **244/244 Node tests passed**, no remaining review blockers; independent controller/core/parser/catalog checks and 480 layout-boundary combinations passed. Native filesystem/player calls in these tests are mocked, not physical device evidence.
- Final official SDK clean build succeeded in **13.844 seconds**, 33 tasks (32 executed, 1 up-to-date), including ArkTS/resource compilation, unsigned HAP packaging, CRC, version, device and orientation checks.
- Unsigned HAP: **660028 bytes**; SHA-256 `a027179206013541aee9487fae0226158ee9218c67352f3c9c604741857a0e5e`; version 0.6.0 / code7; phone/tablet/2in1; `auto_rotation_restricted`.
- Explicit native SCALED_ASPECT after prepared replaces default stretched FIT. Fullscreen is within the existing application window; stable single XComponent and actual AVPlayer clock are retained.
- System DOWNLOAD directory preparation replaces all manual video/script/folder import UI. Existing ZIP-before-loose script matching is preserved; no broad storage permission or physical output transport was added.
- Review fixes: clear script state through a controlled engine method instead of parsing an empty document; no stale source on bad pairing; manual refresh releases old video/axes before scanning; cleanup failure is visible; no old-source recovery from stale callbacks; controls remain reachable in low-height landscape.
- Still **not verified on device**: actual aspect-ratio rendering, fullscreen/rotation/keyboard behavior, automatic public Download access, codec/audio/video behavior and signing/install. See DEVICE_TEST_PLAN.md. The 90-item parity matrix remains open; this does not establish full upstream parity.
