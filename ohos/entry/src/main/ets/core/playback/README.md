# Pure Internal playlist and media controls

These are pure models used by the 0.9 candidate’s real Index/PlaybackSessionCore integration. The models themselves perform no I/O, networking, native playback, output, settings persistence, timers, or permissions. Host behavior and validation boundaries are documented in `ohos/PLAYBACK_INTEGRATION.md`. All positions, durations, clock inputs, keyframes and chapter bounds use **seconds**.

## InternalPlaylist host contract

1. Resolve scripts through the existing Download-managed library. Construct `InternalPlaylistItem(name, fullName, associationId, durationSeconds, exists)`. `associationId` is the opaque library identity used to retrieve already-managed script resources; it is never interpreted as a path. `fullName` is used for original case-insensitive playlist lookup only. Duration is the maximum last-keyframe time of successfully resolved axes. `NaN` represents no successfully readable scripts, yielding a reset when selected.
2. `new InternalPlaylist(random, refreshItem)` accepts synchronous injected dependencies. `random()` returns `[0,1)` and defaults to `Math.random`. `refreshItem(item)` updates availability and resolved duration from the host's current scan/cache, without doing asynchronous I/O in this model. No asynchronous races or disk access are hidden here.
3. `setPlaylist(items)` replaces the queue and clears the current item. `clear()` uses a null playlist. Empty versus absent queues are distinct. Only names ending in `.funscript` (case-insensitive) enter the queue. `append(items)` adds already-associated managed resources while preserving playback; this is a clearly identified OHOS extension, not an original desktop command.
4. Call `tick(elapsedSeconds)` on the Internal source's ~100ms clock, **only when connected**. Host queues/executes control calls before a tick as desktop RunAsync does. `playAt`, `playByName`, `next`, `previous`, `playRandom`, `setLooping`, `setShuffling`, `remove`, `cleanup`, `refresh`, `setPlaying`, `setSpeed`, and `seek` implement the corresponding pure transitions.
5. Drain `drainEvents()` after each operation. Event kinds: `reset`, `duration` (seconds in `value`), `position` (seconds, with `forceSeek`), `load` (selected item's association), `playing` (1/0), and `speed`. Events are sequential: a different successfully readable item emits duration → forced position zero → load. Same-item restart emits only forced position zero. Reset closes playback state and clears time/duration to NaN. These events do **not** authorize reopening physical output or pretending a native seek succeeded.
6. LoadAdditionalScripts companion search remains a host responsibility. Resolve associated axes using the existing source-faithful repository/matching policy, set the item's maximum duration, then `reloadCurrent()`; this preserves the selected item and restarts the timeline as upstream does.
7. Persist queue associations and shuffle/loop via the host's approved schema. The model does not implement desktop `.txt` path resolution, file existence calls, shortcut registration, startup connection delays or settings migration. Do not add import pickers to wire this API.

### Important original semantics

- End detection is strict `position > duration`, before that tick's advancement. It still runs when paused. Next/previous past queue boundaries pause at duration/zero; queues do not wrap.
- Shuffle can select the same item; loop repeats the current item. Enabling one disables the other. Even manual next/previous honor these modes.
- Valid-item transitions preserve the playing flag; selecting an unreadable script resets it. Selecting an item does not implicitly start playing.
- Cleanup restarts a retained current item. Removing current selects next valid, otherwise previous valid; removing earlier only decrements index. Lost current after cleanup is reset, and a subsequent tick selects the first valid item.
- Name/path lookup is case-insensitive and returns the first match, including the original same-filename/different-directory ambiguity. Duplicates are intentionally preserved.

## MediaControls host contract

`MediaLoopControls`:
- `setStart`, `setEnd`, `setLoop`, `cycle` and `fromCurrentChapter` return a requested seek target (`number | null`). Execute it through the existing seek pipeline, never by setting confirmed native time directly.
- `clear`, `startPosition`, `endPosition`, `isValid` expose loop state. Crossing/equal bounds clears the opposite bound; no auto-sort. Nonfinite bounds become null. Original comparisons happen before finite sanitization, including infinities.
- `update(deltaSeconds, mediaPositionSeconds, durationSeconds)` implements the original 100ms check; seek when position `>= end`, even paused, resetting accumulated time rather than retaining excess.
- `onDetectedSeek(newPosition)` must only be called after the existing position tracker classifies a seek and the prior media position is finite. It clears on `<= start - 1` or `>= end + 1`, including partially specified loops. Media reset must call `clear()`.
- `fromCurrentChapter(axisChapterCollections, position, duration)` takes the first non-null axis collection, seeks the first **inclusive** exact hit, otherwise first hit within ±1s. Empty first collection blocks fallback. Do not substitute `MarkerNavigation.activeChapter`, which has different half-open semantics. Arrays should reflect the original ChapterCollection's ordering/normalization.

`AutoSkipToScriptStart`:
- Defaults: enabled, offset -5 seconds. Call `onDurationMessage(monotonicSeconds, hasCancellationToken)` for **every** duration message, even unchanged duration. This starts a one-second delay only when no task is pending.
- Call `poll(now, axisKeyframeCollections, latestDuration, latestPosition)` with current ordered axis resources; execute any returned seek request. This is leading-edge task coalescing, **not** trailing debounce. Inputs and offset are read at execution time. Disabling after scheduling does not cancel the original task; `cancel()` is for cancellation/disposal, not a new policy.
- `seekToScriptStart` also exposes the manual command (`onlyWhenBefore=false`). `scriptStartPosition` ports SkipGap(0), using both value/position `<0.001` tests. Empty/singleton yields no target; all-flat uses last keyframe.
- It uses the **first non-null keyframe collection**, not earliest start across axes; an empty first collection blocks later axes. The target calculation is `max(min(scriptStart, duration) + offset, 0)`, then only-before comparison, then final seek clamp. Offsets/settings do not alter the raw script start here.

## Source references and verification

Pinned upstream baseline: `36c08fbb99ac9398a63ff1cca1bbf68cd2228a94`.

- `Source/MultiFunPlayer/MediaSource/ViewModels/InternalMediaSource.cs`: RunAsync (message order, end threshold/tick order), CheckIndexAndRefresh, PlayWithOffset, PlayRandom, PlayIndexOrNextBest, PlayIndex, SetPlaylist, SetCurrentItem, CleanupPlaylist, OnRemoveItem, mutually exclusive mode change callbacks, nested Playlist.FindIndex and constructor filtering.
- `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs`: UpdateMediaLoop around 521–533; duration handler around 589–599; seek detection/loop clearing around 614–643; SeekMediaToTime and ScheduleAutoSkipToScriptStart/SeekMediaToScriptStart around 1046–1092; loop commands/current chapter around 1094–1128; CycleSetStartEnd around 1477–1485; MediaLoopSegment around 2423–2474.
- `Source/MultiFunPlayer/Common/KeyframeCollection.cs`: SkipGap at 87–96 and IsGapInternal at 123–132.
- `Source/MultiFunPlayer/Script/ChapterCollection.cs`: TryFindIntersecting with epsilon, exact-first inclusive comparison.

`tests/playlist-internal.test.mjs` and `tests/media-controls-parity.test.mjs` exercise source-described behavior (not execution of C#). `tests/media-controls-csharp.test.mjs` actually extracts and executes the unchanged original C# MediaLoopSegment and SkipGap/IsGapInternal methods in an in-memory .NET 9 host: 200 setter frames and 100 gap cases. Run with `DOTNET_ROOT` pointing at an installed official .NET 9 SDK; otherwise that differential test explicitly skips. This differential scope does not claim C# execution of the whole playlist, scheduling, WPF/Fody, or native I/O.

Strict TypeScript compilation and pure tests are necessary but not native device evidence. The 0.9 candidate imports these models in the real host and has official Harmony SDK compilation and mocked lifecycle/native-observation controller tests. Real device playback, touch interaction, and hardware output still need device verification.
