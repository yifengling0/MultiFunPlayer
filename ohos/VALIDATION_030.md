# 0.30 validation

- Final clean staged source: official Harmony26.0.0.851 / SDK26.0.0.105, JDK21, Node24.14.1, .NET9.0.319.
- Actual pinned original C# compiled with tools/reference/compile.py. Full suite3862/3862passed,0failed,0skipped.
- Official build.sh:34tasks executed,0up-to-date; BUILD SUCCESSFUL. No preexisting generated/.cxx/build caches in the source stage.
- Independent read-only review:95/95focused actual-controller/window/geometry tests; no remaining must-fix found.
- Unsigned HAP SHA256:2d5f0aee2d7da7022275c8666c501b85d0b84713ac461e0863629a39865939d7 (8,673,009bytes).
- Regressions cover rotation resetting bars; timeout with no layout/bar mutations; lifecycle cancellation; fullscreen chrome epochs; stable media and Surface identity; adaptive geometry; actual painter axis/document/position updates; existing fail-closed output suite.
- Remote baseline31bec2f573b1eceea5a1dee47d30adda0e99b3ac retained, including text=auto binary-protection fix. Protected remote CI/.gitattributes copied verbatim into staged source; original local files untouched.
- No connected device, simulator image or working Previewer verified. No screenshot, physical bar/orientation/touch/IME or transport acceptance is claimed. HAP requires official signing/deployment.
- Local playback layout release only: original coverage unchanged163/188sites,110full-portable+53partial,25unwired;182button IDs/9partial continuous templates.
