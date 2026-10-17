# File output recording contract

Source: `Source/MultiFunPlayer/OutputTarget/ViewModels/FileOutputTarget.cs`,
`OutputTarget/AbstractOutputTarget.cs`, `Common/DeviceAxis.cs`, and
`Script/IScriptWriter.cs`.

- Explicit start and stop only. Default fixed interval 20 ms. No auto-connect.
- Construct `FileRecordingSession(source, clock, freshnessPolicy)` with the real
  `OutputSourcePort` (normally `PlaybackSessionCore`), its monotonic time domain,
  explicit maximum frame/observation ages and allowed paused intents. Each
  `sample(actualElapsedSeconds)` atomically calls
  `source.dispatchSource(enabledAxes, 'fixed')` itself. Callers cannot submit
  arbitrary frame/authorization pairs or preview snapshots.
- Source owns pipeline provenance, dependency/anchor validation, current
  configuration/control revision and fixed-versus-polled authorization. Recorder
  does not recreate those algorithms. Core owns exact enabled scope, fixed-mode,
  current media/foreground/intent checks, monotonic freshness, revision rollback
  protection and immutable identity checks. Same committed sequence may be
  sampled repeatedly while fresh only if raw enabled values, frame metadata and
  authorization identity are unchanged. Repeated polling advances elapsed time
  without duplicate unchanged rows. Same-sequence mutation fails closed even if
  both raw values would clamp to the same final percentage.
- `sample(actualElapsedSeconds)` accumulates recorder elapsed time, not media
  position. A source-confirmed `pendingCurrentFrame` with null authorization keeps
  this recorder clock running but emits no stale scalar. The next current frame
  therefore reflects the recording-time gap. Invalidated/stopped/background
  sources fail and close explicitly; caller should stop/finalize before deliberate
  lifecycle transitions when it wants a complete file. Epoch/profile changes
  require explicit stop/restart. Seeking cannot reset or relabel recorder time.
- Target range mapping uses source clamped Lerp. Dirty comparison is the original
  unquantized `abs(last-value) >= 1e-10 || finite XOR`, initial NaN last value.
  Source nonfinite input falls back to the axis default before mapping;
  `originalRecordingValue` preserves that reference behavior. Production rejects
  nonfinite input and aborts instead of silently recording a fallback.
- Funscript uses banker-rounded integer milliseconds and floating clamped
  percentage; it does not round percentage to an integer. CSV uses invariant
  doubles and `position;value\n`. Both source writers explicitly encode UTF-8
  without BOM; the newline is a literal LF, including on Windows.
- `FileRecordingSession.start(root, {format, axisRanges, name})` opens all enabled
  axis writers before reporting recording state. Await start before stop.
  Await each sample: concurrent samples reject rather than queue in RAM. Memory
  is O(axis count), including after hours. Stop waits the in-flight sample,
  writes JSON footer, flushes and closes every file before publication.
- Root is an injected capability. Production `NativeRecordingRoot.prepare(context)`
  uses the existing system DOWNLOAD service, verifies the app namespace and uses
  only its `recordings` child. It never selects a media import directory or accepts
  user paths. Native bridge checks canonical components without following links,
  directory ownership/mode and exclusive creation. Unsupported ownership or
  permissions fail closed; there is no broad-storage fallback.
- No-overwrite is original behavior (`FileMode.CreateNew`), retained by native
  O_EXCL and no-replace publication. The caller supplies a unique safe basename
  (timestamp plus random suffix recommended); collisions fail rather than replace.
- Safety variation: writes use explicit `.partial` files. Footer/flush/close must
  succeed before final filename publication. Multi-axis publication is NOT atomic.
  If publication fails halfway, status is failed with `files: []` and actual
  `partialFiles` listing already published complete axis files. Partial files are
  retained for recovery; cleanup closes owned handles, never deletes a potentially
  externally replaced final file. An incomplete set is never reported successful.

Tests: `node --test tests/file-output*.test.mjs`. The C# fixture executes the
unmodified writer source with only the `Keyframe` type shim, using the existing
.NET 9.0.319 SDK / 9.0.21 runtime and files in `/tmp`. Source hash is checked.
This is codec and fake-port coverage, not a physical-device storage claim.

To reproduce codec fixtures using an already installed official SDK:
`MFP_DOTNET_ROOT=/path/to/dotnet-sdk node tests/file-output-oracle.generate.mjs`.
The generator compiles unmodified C# directly with Roslyn/ref packs and performs
no NuGet restore or software download. Negative-zero fixture inputs are preserved.
Funscript timestamps beyond the source signed Int32 range fail closed instead of
reproducing platform-dependent unchecked overflow. Native `prepareRoot` creates
`recordings` via no-follow-verified directory-relative operations, not JS mkdir.

## Isolated SDK reachability evidence

`MFP_SDK_TOOLS=/path/to/command-line-tools node tests/file-output-sdk-smoke.mjs`
creates a fresh temporary project with a minimal fixture Index that actually
imports and invokes the production recorder and native adapter. It does not edit
or add recording UI to the shared application's Index. The SDK 26.0.0.851 smoke
passed CompileArkTS and full unsigned HAP packaging, including native libraries
for arm64-v8a and x86_64. Source maps include all four recording modules.
The initial fixture HAP SHA-256 (before source-owned admission hardening) was
`f1a3aa612a343c80badc4e8acc2c7d5ba226a8cef843c4be027dc4f9d895e2d6`.
Warnings: SDK defers NAPI module verification, directory stat calls may throw,
and no signing configuration. No physical device execution has been performed.

## Source-owned admission hardening

The recorder source contract is integration-tested against real
`PlaybackSessionCore`: faster immutable-frame polls, live-config pending gaps,
seek/stop/background invalidation and expiry with an injected monotonic clock.
Fault-injected async writes also verify that explicit stop and write-failure
cleanup never flush/close/abort before the in-flight write settles. These are
ordinary correctness tests, not a claim that an independent review completed.
