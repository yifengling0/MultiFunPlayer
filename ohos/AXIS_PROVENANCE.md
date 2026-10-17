# Axis frame provenance (runtime evidence)

`AxisPipeline.step()` publishes one deeply immutable `AxisFrame`. Numeric behavior
is still the pinned MFP algorithm. The additional evidence does **not** authorize
hardware output; the session/output coordinator owns arming, target selection,
permissions, freshness clocks, and generation checks. `snapshot()` never ticks.

## Consumer fields

- Frame: `sequence`, `epoch`, `profileRevision`, `configurationRevision`,
  `isPlaying`, clock metadata, `axisStates`, original `events`, and `provenance`.
- One `AxisValueProvenance` per enabled axis, with matching frame stamps.
- `status`: `none` means the final scalar is nonfinite; `unknown` means incomplete,
  invalidated, unproved or capacity-truncated lineage; `known` means observed
  lineage, **not** permission or freshness. Default-deny none/unknown.
- `primarySource`: final assigning source (`script`, `motion`, `autoHome`,
  `transition`, `held`, `default`, `unknown`). `default` covers a neutral or
  configured SmartLimit target scalar, not a motion permission. `finalSources` includes historical
  and control dependencies as well. A Home interpolation can therefore contain
  both `autoHome` and its old `script`/`motion` starting source.
- `stages`: actually executed source branches. `transitionUpdate` can execute
  with no transition value; `motionUpdate` is an attempted update;
  `autoHomeWait` is the source's `t <= 0` branch, even when its numeric
  `isAutoHoming` flag is true. An observation is not necessarily a surviving
  final contribution: later stages can replace earlier values.
- `autoHomeApplied` / `motionApplied`: this axis has a surviving contribution
  actually produced by that source **in this frame**. Historical origins alone
  do not set these flags. An overwritten Motion sample and a zero-speed-cap
  carried value do not count as newly applied Motion.
- `motionUpdated`: an update was attempted. `motionSampleProduced`: `true` only
  for a validated actual provider write; `false` for a proved non-write or
  invalid proof; `null` for no update or an unsupported legacy proof API.
  `motionCacheRead` records a read, never fresh production. `motionCacheValidated`
  certifies that THIS read supplied matching observation metadata and exactly the
  scalar saved at the previously observed actual write; selected provider and
  pipeline-local invalidation generation must also match. A missing read-proof
  API, retagged write, changed scalar under the same write identity, or invalidation
  cannot produce this receipt. A valid retained read is still not a fresh sample.
- `origins`: source and axis, first/last producing frame sequences, epoch,
  profile/config revision, playing state at production, raw script resource ID
  and binding revision, actual cached provider ID, pipeline-local provider
  generation, provider write-generation range, and provider configuration/resource
  generations captured at the original write. Equal identities coalesce ranges;
  old timestamps/generations are never rewritten to look current.
- `dependencies`: bounded **direct** summaries with roles `held`, `motionCache`,
  `syncPrevious`, `autoHomeStart`, `transitionStart`, `motionFollow`, `smartInput`,
  `smartPrevious`, `speedPrevious`, `speedCurrent`. Full contributing origins
  are flattened or explicitly summarized as historical scalar anchors above, not recursively embedded. Follow speed/dirty comparisons
  include both relevant prior values, independent of axis iteration order.
- `crossEpoch` / `crossConfiguration`: at least one retained contributor belongs
  to another generation. Configuration revision is pipeline-local and increases
  only for an actual axis/sync/global-offset snapshot change, not a repeated clone.
  Script resource changes retain separate resource ID/binding revision identity.

A paused output policy must look for current applied Home/Motion, then audit all
selected axes and their source/dependency closure. A finite scalar, `isPlaying`,
`isAutoHoming`, historical Motion origin, or provider update invocation alone is
insufficient. Mixed paths retain all contributing sources so policy can require
both paused permissions where applicable. A script re-evaluated while paused is
still `script`, not inferred `held` merely because its number is unchanged.

## Explicit historical scalar anchors

Cross-generation flags are descriptive, not a blanket rejection rule. The source
algorithm intentionally soft-syncs a new Script/Motion/Home/Transition value from
its previous scalar. Each origin now has `anchor: AxisHistoricalAnchor | null` to
make that exact use distinguishable from reading old cache or simply holding it.

An anchor contains `role`, `sourceAxisName`, `sourceFrameSequence`, `sourceEpoch`,
`sourceProfileRevision`, `sourceConfigurationRevision`, `sourceStatus`, and
`consumerFrameSequence`, `consumerEpoch`, `consumerProfileRevision`,
`consumerConfigurationRevision`. It also contains `sourceKinds` (a flat, deduplicated
set of original contribution kinds, never recursively `historical`) and
`sourceProfileValid` (preserving profile-boundary validity through summaries).

Only actual numeric reads through `syncPrevious`, `autoHomeStart`,
`transitionStart`, `smartPrevious` (only Smart-speed's actual last-value read), or `speedPrevious` create one. Such a read consumes ONE already
published scalar, so it creates ONE `historical` origin stamped with that scalar's
frame identity. It does not retain every old keyframe, provider write or configuration
revision which once contributed to that scalar. This is a bounded scalar summary,
not a recursively expanded origin tree or a larger budget. `finalSources` keeps the
flat contribution-kind summary for policy; direct/cache origins remain separate.
An unknown, empty-kind, unknown-kind or profile-invalid scalar never becomes known
through compaction. A known scalar already containing summaries may be explicitly
consumed again; only that actual current stage creates the new consumer stamps.

A coordinator may accept a historical contributor only with an allowed anchor
role, known source scalar, matching active profile, and consumer stamps exactly
matching the current published frame. It must additionally require a fresh,
surviving current-frame/current-generation source. This permits the first real
soft-sync frame after live edit, reload or seek instead of imposing a four-second
output blackout. It grants no permission to emit an old snapshot or callback.

The same old Motion sample used both as a Sync anchor and as a direct cached
sample remains two separate paths: a `historical` scalar summary and the actual
unanchored cache origin. The
unanchored cache needs its own current validated read/blend receipt. Known,
current-generation retained cache may participate in current active playback,
without changing its producer stamps or creating current activity. Invalidated or
unproved cache still fails the audit. A held value only carries its old
anchor unchanged, never a new consumer stamp. Provider invalidation is tolerated
inside a current trusted historical scalar anchor, but never for a direct/cache
use of that same invalidated sample. Neither an anchor nor a historical source
sets `motionApplied` or `autoHomeApplied` by itself.

## Previous-frame cross-axis control reads

`origin.source === 'control'` has an `AxisControlInput` in `origin.control`,
separate from a positional anchor. Only the actual Smart input or Follow branch
creates it. Roles are `smartInput` / `motionFollow`; `inputKind` is `value`,
`activity` (dirty/Home gate), or `speed` (the signed-speed limit).

It records source axis and exact field-producing frame/epoch/profile/config,
`readFrameSequence` and read-generation stamps for the immediately preceding
committed frame, and consumer axis plus all current frame stamps. Value/activity
production matches the read frame; a retained speed field keeps its actual older
production frame. `samples` contains one value sample or at most two exact inputs
to the dirty/speed comparison. The older activity sample may have `status=none`
for the explicitly observed initial NaN classification. Value/speed samples and
the latest activity sample must be known. Unknown finite inputs never become known.

`sourceKinds` is flat; `sourceProfileValid` preserves profile boundaries.
`sourceStatus` is a provenance fact; `sourceCurrentValid` independently certifies
current reference eligibility. An invalidated/cleared reference can therefore
remain a known scalar while being rejected for this control read. It is not
converted into a recursively sticky unknown. The coordinator must check BOTH.

`references` carries bounded script binding/resource identities and Motion
selected-provider/invalidation-generation identities, including inherited control
references. Each has actual `producerFrameSequence` and `requiredFrameSequence`
(the consuming sample frame) for audit. A valid retained read does not need a new
write each tick: the producer need not equal the consuming frame. Motion references
also retain `observationValidated`; missing or inconsistent cache-read metadata
never obtains current eligibility. References are rechecked against current
bindings/provider generations on each control consumption. Later actual production
can supersede an older reference; a re-read does not rewrite its producer frame.
Reference truncation or contradictory identities remain unknown, not just ineligible.

The coordinator checks the role against the consumer axis's current referenced
axis, exact previous read frame, sample identities, known/profile validity and
current eligibility. Control evidence never counts as direct current output
activity. Legitimate previous-frame controls can cross a global axis-configuration
revision; old callbacks and direct unproved cache cannot use this exception.
Cyclic Smart/Follow dependencies use the same all-axis previous frame and bounded
summaries, so independent real scripts can start them without axis-order dependence.

## Provider observation boundary

`AxisMotionProviderPort.update()` may return `AxisMotionSampleObservation`; the
optional read-only `getObservation()` supplies the manager cache's actual identity.
The real registry records only actual provider Value assignments as fresh writes.
No-resource/invalid-segment/finished-provider early returns retain old write
identity, even when the manager copies that old value into its shared axis cache.
Switching provider can expose that provider's private old sample; only a previously
observed matching write can retain its original lineage. Legacy void ports work
numerically but remain unknown for output authorization. Proof must match the
returned scalar and a valid, advancing write generation.

Session calls `invalidateMotionProvenance(axisNames?)` after out-of-band provider
configuration, reset, or Looping resource changes. This changes evidence only:
no phase, cache scalar, transition or sync mutation. Unanchored retained old/cache lineage becomes unknown until replaced by actual
new samples. Explicit known historical scalar anchors follow the rule above. Merely rereading or
copying old provider cache does not clear invalidation. The immutable already
published snapshot cannot change, so the coordinator must block that old candidate
immediately and wait for a current frame. The registry must not be independently
ticked outside this observation contract.

`advanceEpoch()` retains numeric runtime and the old committed frame; subsequent
steps expose old-generation dependencies. `resetRuntime()` publishes empty/none
runtime evidence. A computation/provider exception latches the pipeline fault,
publishes no frame or provenance, and leaves `snapshot()` at the last commit.
Faulted instances cannot reset or advance: recreate pipeline **and** provider
registry under a newer session epoch. This includes the pinned source's exact
stationary speed-limit / zero-delta arithmetic exception boundary.

## Recovery after a genuinely unknown historical scalar

Valid retained cache and genuinely unknown finite lineage are different cases.
Clearing a Looping resource can introduce an unproved finite cached value. A later
valid replacement proves new provider samples, but cannot retroactively prove the
old scalar if Smart-speed, active speed limiting, or a cross-axis feedback cycle
continues consuming it. Such unknown ancestry may persist indefinitely, even in a
one-way Smart-speed path. There is no timer or epsilon that silently marks it known.

An explicit recovery may construct a NEW pipeline AND provider registry under a
new epoch, restore the intended configuration and re-inject valid resources, and
wait for new known output. Old frames remain immutable and rejected. The session
must also clear queued output and leave physical output disarmed; recovery does
not automatically re-arm. This is an intentional runtime reset, not an invisible
resource-load side effect, and changes phase/state as any fresh manager does.
The core regression proves 150 frames of persistent unknown after replacement,
followed by known new-epoch output after explicit reconstruction. Independent
session checks additionally exercise its existing explicit recovery/reload route.

## Bounds and verification

Origins cap at 64, direct dependencies at 32, unique source tags at 7. Exceeding an
origin/dependency budget marks evidence unknown rather than dropping evidence and
claiming success. Per-provider cache histories retain only the latest observed
sample, capped at 64 provider identities per axis. Control summaries have at most two samples and 64 deduplicated active references;
references carry scalar identities, never nested control trees. Two-frame speed/dirty
records retain only their two immutable value summaries; no recursive frame trees. Immutable
class instances can be shared safely across independent frame consumers.

`axis-pipeline-provenance.test.mjs` covers no source, pause, hold, old epoch/config,
actual/retained/unproved samples, provider switches, external invalidation, Home
boundaries/overrides, Sync mixing, two-frame cross-axis dependencies, zero speed,
fault/no publication, replayed/mismatched proof, Link/Lock and mutation isolation.
The 43 provenance tests include 2,000 continuous live edits each for ordinary
Sync, low SpeedLimit, Smart Value, Smart Speed and cyclic Pattern follow;
cyclic Smart in reversed axis orders, read/producer identity, reference
clear/replace/invalidation, unknown finite controls, and validated-cache receipts.
The existing 25 original-C#-source scenarios / 306 frames remain numerical/event
comparisons, including recorded source hashes and host-shim limits. These are not
an execution of the complete Windows/WPF application.

Run the reproducible six-axis stress test:

```sh
node --expose-gc --test ohos/tests/axis-pipeline-provenance-stress.test.mjs
```

It warms 5,000 frames, then runs 100,000 normal and 100,000 linked/Sync/Smart/Speed/
Motion frames, asserts hard bounds, reports mean/p95/p99 and post-GC heap samples.
`MFP_AXIS_BENCH_CORE_ROOT` can point to the frozen source's `core/` directory for
read-only baseline comparison. `MFP_AXIS_STRESS_FRAMES` can increase the count.

For allocation/GC diagnosis, collect a separate run (tracing changes timing):

```sh
node --expose-gc --trace-gc --trace-gc-nvp --test \
  ohos/tests/axis-pipeline-provenance-stress.test.mjs > axis-gc.log 2>&1
```

Use normal timing runs for latency comparisons; inspect `axis-gc.log` separately
for allocation, pause and post-collection heap records. The retained-heap samples
in the test's JSON report are available without verbose V8 GC tracing. A large
shared-host step outlier must not be attributed to the algorithm without a trace.
Harmony-device CPU/allocation/GC/cadence profiling remains an explicit follow-up.

Host Node v24.19.0 baseline (same container, separate sequential processes; no device or
real-time guarantee): frozen 0.7.0 normal mean 0.0192 ms / p99 0.142 ms;
current bounded evidence mean 0.0434 / p99 0.257 ms. Complex mean 0.0197 /
p99 0.126 ms versus 0.1217 / p99 0.481 ms. Added mean cost is approximately
0.0242 / 0.1020 ms (2.3x / 6.2x total). Scalar checksums match exactly.
Maximum observed origins/dependencies were 1/0 normal and 5/3 complex;
control references/samples were at most 1/1 in this benchmark. Dedicated cyclic
Follow tests exercise larger references and two samples. Final-half post-GC
heap growth was below 0.32 MiB, including the benchmark's own growing duration
sample array. Maximum steps in this run were 4.08 / 9.23 ms; an earlier expanded
lineage run had a 294.7 ms shared-host outlier. These are observations, not an
attribution to the algorithm or a real-time guarantee. Actual Harmony-device CPU,
allocation, GC and cadence profiling remain required. Official API-26 HAP compilation
accepts these modules in existing `.ts` interoperability mode; this is not a claim
of strict `.ets` lint compliance.
