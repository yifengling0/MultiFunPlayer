# 0.21 local user-test guide

The recovery archive contains source, tests, retained original oracle drivers, hashes, build/review logs and an **unsigned** HAP. Use the official compatible Harmony SDK/JDK and normal local signing/deployment to your own device. It is not a pre-signed universal installer. The archive has no SDK, signing secrets, dependency caches or .cxx outputs. Follow REPRODUCE.txt to restore the retained upstream Git object pack needed by original-method tests.

## Source-only checks first

- Keep all physical output targets disconnected. Confirm the fixed global Stop is visible on your phone/tablet/PC and after rotation/narrow-window changes.
- Source selection includes Internal, DeoVR, HereSphere. Edit each endpoint, switch away/back and restart; each draft should survive separately. Restoring must not connect any source/output.
- On your own explicitly chosen compatible HereSphere endpoint, connect manually. Confirm the actual observed media name/time/duration/state/rate; no valid packet or stale position must leave output unavailable. The default127.0.0.1 is the OHOS device itself, not your desktop.
- Check original resource preference and legacy path fallback with managed Download scripts. No remote path/identifier must open an outside file or fetch a URL. Ambiguous/missing matches should be visible; video playback itself remains independent.
- Test play/pause/speed, seek, AB/AutoSkip and Path Set only against your intended player. Do not interpret TCP write completion as confirmation. Seek/path/source changes must disarm outputs; reconnection must never Arm.
- Switch HereSphere↔DeoVR↔Internal while connecting/loading; Stop/background/disconnect must prevent late reactivation. A failed close must block replacement, not silently report disconnected.
- Check touch actions and external-keyboard equivalents; text editing must not fire device actions. Confirm≥52vp controls, complete long labels, source errors, scroll reachability, real font scaling/IME and popup behavior. No native screenshot/visual acceptance has been performed here.

For a non-motion TCP/UDP connectivity check, use the existing [dedicated receiver and in-app one-shot diagnostic](tools/network-diagnostics/README.md), not a motion-device port. This is separate from the HereSphere protocol. No HereSphere server is bundled; the automated fixtures bind temporary local127.0.0.1 sockets only.

## Reproducible automated checks

From the source repository with Node24 and official .NET9 available:

```sh
export DOTNET_ROOT=/path/to/dotnet9
export MFP_DOTNET_ROOT=$DOTNET_ROOT
python3 ohos/tools/heresphere-original-oracle/run.py
node --experimental-strip-types --test ohos/tests/heresphere-core.test.mjs ohos/tests/heresphere-control-evidence.test.mjs ohos/tests/heresphere-loopback-021.test.mjs ohos/tests/reviewer-heresphere-021.test.mjs
```

The aggregate tools/build.sh and official clean SDK build are described in REPRODUCE.txt/VALIDATION.md. Linux socket tests reuse production algorithm/adapter code through a Node SDK bridge; they are not actual OHOS NetworkKit or real-player execution.
