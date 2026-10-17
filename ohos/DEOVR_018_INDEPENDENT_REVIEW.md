# 0.18 DeoVR independent source, clock, controller and output review

## Scope

Reviewed the retained original `Source/MultiFunPlayer/MediaSource/ViewModels/DeoVRMediaSource.cs`, `DEOVR_018_CONTRACT.md`, production framed protocol/source/native transport, `RemoteMediaClock`, remote paths in `PlaybackSessionCore`, app-lifetime `DeoVrSession`, `EntryAbility`, and actual `Index` controller methods. Reviewer changed only `tests/reviewer-deovr-018.test.mjs` and this review note. No production edit, repository-history action, File recording work, real DNS, player endpoint or physical output was performed.

Executed production TypeScript directly; executed the real ArkTS controller and native/session/lifecycle classes with only platform interfaces and authorized catalog IO replaced by in-memory mocks. Output checks use the actual target collection/coordinators with `MemoryTransport`, not controller source-pattern assertions. Rendering, device event delivery and real network interoperability remain unverified.

## Findings and resolutions

1. **Resolved: native opening buffer could freshen old position evidence.** Opening bytes were previously retained until native connect/options completed. Native now delivers opening bytes to the source immediately, allowing its timestamped opening buffer to preserve the actual receive time. The combined native adapter/source/core regression receives at 100 ms and completes opening at 1600 ms; observedAt remains 100 ms and dispatch is invalidated.
2. **Resolved: managed catalog removal did not retire an in-flight remote match.** The executed regression paused a read from a configured managed catalog, removed that catalog through the actual controller, and then completed the read. Initially the removed script became current. `matchDeoVrScripts` now includes managed-catalog identity in ownership; the old result cannot install.
3. **Resolved during integration: asynchronous source retirement introduced a repeated-refresh admission gap.** The reviewer called out the new await before busy reservation. Final controller regression admits at most one Download preparation. Related late source-settings/connection guards are reviewed in the final pass.
4. **Verified additional hardening: a late old pause rejection cannot stop a new source generation.** The controller binds the error continuation to its original request owner. A delayed native-video retirement likewise cannot start a source connection after Stop.

## Reviewer test coverage

The independent file contains 59 executed positive and negative cases, including:

- Split headers, split UTF-8, coalesced packets/reset frames; frame/receive caps; malformed JSON, invalid UTF-8, nonfinite/unsafe trees.
- Original field order and optional-cache retention, separated from current-resource state/duration/position evidence.
- Command five-property wire shape, local-submission-only receipts, heartbeat/snapshot non-observation behavior.
- Genuine monotonic receipt timestamps, independent duplicate-playing stale limit, current-resource paused Motion proof, and no fabricated seek position/token.
- Source Stop/background/disconnect/change ownership, queued/in-flight command cancellation, late callbacks, and permanent close quarantine.
- Actual catalog-owned IO and metadata-only remote URL/Windows/file paths.
- Actual Index connection/matching, no implicit physical connection or Arm, and TCP/UDP/WebSocket remote seek disarm with queue clearing and rejected late write receipts.
- Actual AB and AutoSkip requests through the same disarming remote-seek path.
- Pending-match cancellation by Stop/background/view destruction/endpoint/new path/managed catalog removal; remote Reload cancellation on new resource.
- Inert restoration/read-only rejection, close-failure blocking Internal/Download/reconnect, app-lifetime source ownership and Ability lifecycle revocation.

## Verification ledger

Pre-freeze focused remote suites: 189 passed, 0 failed, 0 skipped.
Pre-freeze adjacent Internal/library/managed-Reload controller suites: 90 passed, 0 failed, 0 skipped.
Final frozen-source verification completed at 2026-10-16 22:20 UTC:

- `node --test tests/reviewer-deovr-018.test.mjs`: **59 passed, 0 failed, 0 skipped**, exit 0.
- `node --test tests/deovr-core.test.mjs tests/deovr-native-transport.test.mjs tests/deovr-session-018.test.mjs tests/deovr-source-settings.test.mjs tests/deovr-source-panel.test.mjs tests/internal-source-integration.test.mjs tests/managed-reload-ui.test.mjs tests/library-ui-flow.test.mjs`: **231 passed, 0 failed, 0 skipped**, exit 0.
- Final additions verify rejected direct standalone/manual preview under a remote owner, runtime reset retiring remote ownership, generic Play waiting for a future received observation, and unchanged Endpoint Set succeeding without a send/reconnect or disturbing existing explicit Arm.
- All 102 production `.ts`/`.ets` inputs were SHA-256 enumerated before and after both runs; byte-for-byte manifest comparison passed. The reviewer did not change any production input. Manifest SHA-256: `65113ec61085b5aae98fc18f3c2167591222ddbe67cc4aafdd778aacf411307c`.
- Evidence retained in `/tmp/mfp018-independent-review/`: `reviewer.log`, `focused-adjacent.log`, `production-before.sha256`, `production-after.sha256`.

**Review result:** no unresolved blocking finding in the reviewed frozen production candidate. This is a focused independent safety/controller review; the full aggregate and official SDK build remain separate integration gates.

No result here establishes real-player interoperability, a server-correlated seek acknowledgement, physical-device acceptance, ArkUI visual/touch acceptance, signing, installation or publication.
