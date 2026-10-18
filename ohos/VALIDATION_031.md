# 0.31 validation

- Official clean staged build: Harmony26.0.0.851 / SDK26.0.0.105, JDK21, Node24.14.1, .NET9.0.319. 34 tasks executed, 0 up-to-date.
- Pinned original C# compiled from source; full suite3882/3882passed,0failed,0skipped.
- Actual SDK-transformed videoStage builder captured and compared byte-for-byte after final clean compilation. Composition tests exercise actual bindings with recording ArkUI doubles, not native rendering/hit-testing.
- Independent read-only review caught child-blocking hit-test containers and replay completion/endpoint edges; fixed and regression tested. 20/20 final interaction/composition tests passed.
- HAP SHA256 aaa0beddbcffac2787a7bdcdb7848b890597780a1f498cb5f6a933b495d75eca, 8704015 bytes, unsigned.
- One persistent AVPlayer/Surface; sibling picture-input/chrome layout; drag threshold, normalized clamping and lifecycle guards; actual native position/playing display; guarded replay and Stop cancellation. No new automatic Arm behavior.
- Protected remote CI and .gitattributes retained from parent99010c24aea678e57b27b3e64768a50955957061; local originals untouched.
- No device/native rendered frame or real browser input pass. Previewer reaches runtime but preview IPC is unavailable; emulator has no image/KVM; browser cannot reach this isolated local HTTP server. Visual lab is a shared-production-module HTML video adapter, not an ArkUI renderer.
- Existing original functional coverage remains163/188sites,110full-portable+53partial,25unwired;182button IDs/9partial continuous templates.
