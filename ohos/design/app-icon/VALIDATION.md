# Icon validation — 2026-10-20

Base: `55efe5e73cd345fbe92923eb04515061b55a9d57` on `origin/feature/ohos-port`.

## Passed

- `python3 ohos/tools/export-app-icon.py --check`: source/export byte parity, PNG sizes, alpha, visible-source bounds, no hidden clipping, circular-mask translation checks.
- `cd ohos && node --test tests/app-icon.test.mjs`: 6 passed, 0 failed.
- `cd ohos && node --test tests/*.test.mjs`: 3936 total, 3929 passed, 0 failed, 7 skipped; ~20.9 seconds. Skips are pre-existing optional live .NET C# oracle checks; golden-data tests still run.
- `git diff --check`: passed.
- Actual-pixel review: 16–128px exports plus circular, squircle and rounded-square masks. Upright player, cable, hardware module and mascot remain consistent with the approved sixth version. At 16–24px fine hardware/face details naturally simplify.
- Original accepted bitmap is unchanged, SHA-256 `118710e9b06baa068d2d523abc383b9f22f047864fd3084b17e8b3f3f0e7938e`.

## Not passed / not verified

- Actual `bash ohos/tools/build.sh` attempt at 01:36:54 UTC exited 1 immediately: `HARMONY_TOOLS_HOME` is unset and the required installed official HarmonyOS command-line tools/API 26 SDK are unavailable in this execution environment. No HAP was produced.
- Existing OHOS core GitHub workflow runs Node/original-C# tests, not an SDK build. A successful core workflow must not be described as a successful HarmonyOS compilation.
- No device/launcher installation, icon-cache behavior, startup or live adaptive transform acceptance was performed.

Run the repository's standard build and HAP check in a configured official toolchain environment before treating native compilation as verified. Static resource checks do not substitute for this stage.
