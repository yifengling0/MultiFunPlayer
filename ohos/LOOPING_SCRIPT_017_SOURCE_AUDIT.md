# 0.17 managed Looping Script command: source audit and adaptation boundary

Audit date: 2026-10-16. This is a source-chain audit and a pure catalog/parser implementation, not a Windows/WPF execution or complete application-validation claim. This slice owns this document, `entry/src/main/ets/input/ManagedLoopingSelection.ts`, and `tests/managed-looping-selection-017.test.mjs`. The application/session transaction is integrated and validated separately. No Git operation, physical endpoint interaction, or File-output behavior review was performed.

## 1. Exact command and evidence

The exact original name is **`MotionProvider::Looping Script::Script::Set`**. It is one original registration template, one concrete command, and no runtime family expansion: template **49** of the existing **188** literal built-in-registration denominator. `MotionProvider/ViewModels/LoopingScriptMotionProvider.cs:14,83–99` combines `[DisplayName("Looping Script")]` with `$"MotionProvider::{name}::Script::Set"`. The callback is `(axis, script) => UpdateProperty(axis, p => p.SourceFile = new FileInfo(script))`.

Original paths below are relative to `Source/MultiFunPlayer`. The existing source manifest identifies baseline `36c08fbb99ac9398a63ff1cca1bbf68cd2228a94`; no Git command was used to establish it. The eleven files below were byte-compared successfully against the frozen `../mfp-release-artifacts/0.14.0-1c0a8d3a333ddb69/source/Source/MultiFunPlayer` copy. Entries present in the existing reference manifest also matched its hashes.

| Source | SHA-256 |
|---|---|
| `MotionProvider/ViewModels/LoopingScriptMotionProvider.cs` | `6b44886577814558b494916579e37e3e6af98f5557185e7e2c3571aa50c2925f` |
| `MotionProvider/AbstractMotionProvider.cs` | `f970c36b3d6ad042c60bb393d9a8e7344c68ce22985d10dced85fa1783209f28` |
| `MotionProvider/IMotionProviderManager.cs` | `609d3a02b8b0dc07304389385c041dbaa063357f686ae56c81da59e7981164cd` |
| `Script/IScriptReader.cs` | `0cb5afad94b0cbf9c80a190366308b12785fa99a1307b931e2e4c6f3ecc86be5` |
| `Script/IScriptResource.cs` | `99d37b6fbd23d861ebf6545ac25591a485deac52e72357ab2c4ef9c816db05d3` |
| `Common/DeviceAxis.cs` | `c3d8f2193e68871e54b7889415dad681f01c9bbcbc947eabd8cccccaab3d4537` |
| `Common/KeyframeCollection.cs` | `28c26086eb35826d2a408530a82da726244bb3f1474b4ca549f5c60d80609045` |
| `UI/Controls/ViewModels/ScriptViewModel.cs` | `3104cecc1510ef394a786c04239bafc58d33af4465d2b3c04b0409995c19debe` |
| `Shortcut/IShortcutAction.cs` | `b8949cfa2bfc3cd4c3b7115c5f523ce3dfe32dfd19005556dfae6feae44dbe7d` |
| `Shortcut/IShortcutSettingBuilder.cs` | `da4ead76f5c1691fdcf32c000bd1e2b7f2410bbd7e971f1cace3808e63f4e36c` |
| `FodyWeavers.xml` | `c6eac35ef5dd5f819fe937753918c7ded13bce873889a7d749e0c03442961194` |

The project enables PropertyChanged.Fody. The property/callback chain below is source-described under that weaving, not a disassembled or executed woven assembly. Exact notification count/order, exception timing inside generated setters, WPF binding behavior, and dispatcher/thread interleaving remain unexecuted. The existing C# provider oracle substitutes its own safe `SetResource` helper and does not exercise `FileInfo`, the reader, or Fody; its numeric tests are not proof of this command chain.

## 2. Original registration, invocation, and path/name meaning

1. Arguments are `DeviceAxis` and `string`; labels are “Target axis” and “Script path”. Neither declares an explicit default. `Shortcut/IShortcutSettingBuilder.cs:37–74` therefore gives null axis and null string. ItemsSource does not choose the first axis or validate membership at invocation.
2. `Shortcut/IShortcutAction.cs:44–52,80–89` checks argument count/types. Null reference arguments are accepted by this typed boundary. It does not validate existence, extension, absolute/relative form, emptiness, or path safety.
3. The provider-specific `UpdateProperty` helper looks up **Looping Script on the supplied axis**, then invokes only if that provider exists. `MotionProvider/IMotionProviderManager.cs:38–60` creates all providers for each enabled axis and returns null for a null axis. Thus null axis is a no-op before `FileInfo` construction. Unknown non-null dictionary keys may throw. It does not retarget to the selected UI axis.
4. For a valid target, a new `FileInfo(script)` is assigned to `SourceFile`. The command has no directory restriction, extension restriction, repository search, filename-alias search, or selection dialog. Invalid/null/empty path arguments are not a supported clear operation; constructor or file-system failures may throw. Relative paths are handled by the platform `FileInfo` API, not by a library lookup.
5. The separate provider `SelectScript()` button (`LoopingScriptMotionProvider.cs:68–81`) opens `OpenFileDialog`, checks path/file existence, and filters `*.funscript`. Cancelling that dialog returns without mutation. These dialog checks do **not** constrain the shortcut callback.
6. `SourceFile` is a serialized setting; loaded `Script` is runtime data. Loading saved provider settings populates the existing provider (`IMotionProviderManager.cs:74–99`) and can follow the same setter/reader path. A saved source reference is not equivalent to an authorization grant on OHOS.

The provider may be unselected: the command still changes its Looping Script instance. It does not select that provider, enable the axis, alter `LockScript`, or call normal axis-resource reload. Lock protection on companion scripts does not protect this independent provider resource.

## 3. Original file reader and exact resource selection

`OnSourceFileChanged()` (`LoopingScriptMotionProvider.cs:29–42`) calls `FunscriptReader.Default.FromFileInfo(SourceFile)` synchronously. `Script/IScriptReader.cs:49–61` checks `file.Exists`, returns a failure result if absent, otherwise opens a read stream and calls `FromStream(file.Name, file.DirectoryName, stream)`. Consequently the resource Name is the file's actual leaf name and Source is its containing directory. The read-only provider display binds `Script.Name` and `Script.Source` (`MotionProvider/Views/LoopingScriptMotionProvider.xaml:36–42`). No filename alias affects selection here.

Reader behavior (`IScriptReader.cs:90–140,169–185`):

- No nonempty top-level Actions and no nonempty Axes list gives failure.
- Conventional top-level Actions with no nonempty Axes list yield one `result.Resource`, regardless of whether enabled axis L0 exists. This resource can drive any target provider.
- With a nonempty Axes list, top-level nonempty Actions first insert L0 **only if L0 is enabled/recognized**. Each recognized embedded axis then assigns its resource into the dictionary, in input enumeration order; unknown axes are skipped. Embedded L0 overrides top-level actions. Replacing an existing dictionary value does not intentionally re-sort keys.
- `DeviceAxis.All` and its case-sensitive lookup contain the enabled configured axes (`Common/DeviceAxis.cs:39–43,59–72`). The provider chooses L0 if it exists and its resource is present; otherwise `Resources.Values.FirstOrDefault()`. It does not choose the target axis, profile-order first axis, first filename match, or first nonempty resource.
- `ScriptReaderResult.IsMultiAxis` means `Resources?.Count > 0`, not merely that JSON had an Axes member. If all embedded axes are unknown and no recognized L0 was inserted, the empty-dictionary success-shaped result has no `Resource`, so the provider selects null.
- Keyframes are created from action time `/1000`; negative positions are skipped, values clamp into 0–1. `KeyframeCollection.Add` sorts by time and retains the **first** inserted value at an exact duplicate time (`Common/KeyframeCollection.cs:13–21`). There is no portable finite/24-hour/action-count budget in this chain.
- Chapters/bookmarks are attached to every resource. Invalid JSON/deserialization/keyframe construction exceptions inside `FunscriptReader.FromStream` are caught and produce failure. `FileInfo.OpenRead` occurs outside that catch and may throw.

Empty keyframes need particular care: `CreateKeyframeCollection` returns null for absent/empty Actions; nonempty input containing only skipped negative timestamps can produce an empty collection. A recognized resource can therefore exist with null/empty keyframes. The provider immediately indexes `Script?.Keyframes[0]` and `[^1]`; `?.` protects only null Script, not null/empty Keyframes. That path can throw after assigning Script. It is not a reliable “skip this resource and choose another” contract.

## 4. Setters, phase, cached values, ResetSync, and the next tick

After selecting/assigning `Script`, `OnSourceFileChanged` performs `_scriptIndex = -1`, `_scriptStart = first position or NaN`, `_scriptEnd = last position or NaN`, `_time = _scriptStart`. **It does not write provider Value.** Assigning a new `FileInfo` for the same textual path is a new command; there is no source-level string-equality or content-hash early return. Under the expected normal weaving it reloads and resets phase again. Exact woven comparison/notification behavior is not executed here and should not be overclaimed.

`AbstractMotionProvider.cs:20,34–43` marks Value `DoNotNotify`; ordinary property notifications request `SyncRequestMessage(target)` before base notification. Looping Script has no override filtering those notifications. SourceFile and changed Script notifications therefore request axis sync. `ScriptViewModel.cs:712–716` calls `ResetSync(true, axes)`; `:790–819` sets that axis's SyncTime to configured Duration unless sync bypass is active. ResetSync does not itself reset media position, play/pause, provider phase, script index, manual transition, auto-home counters, or output Value. Phase reset comes specifically from `OnSourceFileChanged`, not from ResetSync.

Two caches must remain separate:

- Provider `Value` starts at zero and survives resource assignment/clear.
- `MotionProviderManager._values[axis]` starts at NaN. Only `Update(axis, providerName, deltaTime)` calls provider Update then copies that provider Value (`IMotionProviderManager.cs:62–72`). A command does not copy the cache immediately. Calling Update that returns without a new Value assignment still copies the retained provider Value.

`LoopingScriptMotionProvider.Update` (`:44–65`) returns for null Script/null or empty Keyframes. At/past the end it resets index/time to the start, discarding overshoot. It advances the index at the current time and requires both current and next keyframes. A one-point resource never produces a new value or advances time. Otherwise it interpolates using the configured mode (default Pchip), clamps, maps to Minimum/Maximum, assigns Value, then adds `Speed * deltaTime`. It samples **before** advancing time and does not emit a terminal endpoint just because phase crossed it.

Normal pipeline gates remain (`ScriptViewModel.cs:243–302`): selected provider, bypass flag, pause eligibility, script/gap eligibility, follow-axis dirty/home state, then cache/blend. The command does not bypass these gates, force Update, or manufacture a fresh sample. Retained finite cached values are source behavior; whether they are authorized for physical dispatch is a separate OHOS safety decision.

Failure is not transactional upstream. A missing file or caught parse failure assigns Script=null and resets phase to NaN while retaining numeric Value/cache. Open failures or null/empty selected keyframes can interrupt the setter with some new state already assigned. Portable adaptation intentionally does not reproduce these partially mutated exception states.

## 5. Existing OHOS boundaries inspected before 0.17 integration

- `core/ResourceLibrary.ts`: `ResourceFileEntry.uri` is opaque, `name` is a leaf, `relativePath` includes that leaf relative to one supplied root. Grouping is descriptive. Companion `parseCandidate`/`selectDocuments` have media-name/axis-association rules and are not the direct Looping reader contract. MAX_FILES=2000, each identity string <=4096, aggregate text <=2 MiB.
- `library/DownloadLibrary.ets`: obtains only the system-returned app `Download/<bundle>` directory via DOWNLOAD save mode, validates it, verifies a real non-symlink directory, and probes access. It does not infer a grant from a bundle name/constructed root, import UI, or a saved path.
- `library/LibraryFiles.ets`: the current scan is bounded to 1000 visited entries/four subdirectory levels, avoids symlinks, and returns exact child identities. `readScript` opens only its supplied URI/path with READ_ONLY/NOFOLLOW/NONBLOCK, checks regular-file size 1 byte–2 MiB, reads bounded chunks, detects short read/growth, decodes fatal UTF-8, checks cancellation around awaits, and closes in finally. This reader alone does not prove catalog membership; the host must resolve first.
- `core/PlaybackSessionCore.ts::setLoopingScript`: installs already-parsed data through `resources` and `MotionRegistry.setScriptResources`, cancels seek, invalidates motion provenance and dispatch control. It has no filesystem authorization check and does not update persisted sourceUri by itself.
- `core/motion/LoopingScriptMotion.ts`: `setScriptResource` copies resource, advances resource generation, resets index/start/end/time, requests sync, and retains numeric Value. A sourceUri change in configuration clears the current resource pending a newly supplied one. `MotionRegistry` retains the separate per-axis cache until Update.
- Pre-integration `Index.ets::applyMotionSettings` rereads only when sourceUri differs, calls `pauseTransport`, checks only view/foreground/library request/profile revision/per-axis request while awaiting, then calls configuration/resource setters. It therefore cannot be reused unchanged as a same-identity command. Its lack of Stop/source ownership permits a late setting commit after those changes; the command path needs stronger ownership.
- Pre-integration `restoreLoopingScripts` revalidates saved URI against the new catalog and reads it; saved URI alone never grants access. It used `AxisMapping.parseScript`, which remaps conventional actions by filename and then filters enabled axes. In particular conventional L0 actions can be lost if L0 is disabled and filename mapping finds no enabled replacement. Direct Looping selection must ignore filename aliases.
- The existing managed **companion** reload transaction (`Index.ets::reloadManagedAxisScripts`, core begin/isCurrent/complete/cancelScriptReload) demonstrates current root/catalog/library request, source/video/Internal item, profile/epoch/configuration/control, foreground/view, and shortcut-dispatch ownership. It suspends dispatch before awaits and retires stale work. Its link/lock/repository semantics must not accidentally be used as Looping resource semantics.

## 6. Pure managed selection/parser delivered here

`input/ManagedLoopingSelection.ts` contains no native APIs, filesystem/network access, directory scan, UI, persistent state, output command, or authorization grant.

`resolveManagedLoopingSelection(identity, catalog)`:

1. Accept only a nonempty bounded string and a bounded well-formed catalog. Null, undefined, blank, control characters, oversized strings, malformed relative identities and budget overflow reject.
2. Compare the string **exactly and case-sensitively** with each current entry's complete URI **or complete relativePath**. A root-level filename may equal its complete relativePath; this is not a basename fallback for nested files. Do not trim, decode, normalize separators, case-fold, join a root, search another root, expand a ZIP, or retry the input as a path.
3. Reject no match, multiple matching entries, cross-namespace ambiguity (one entry URI equals another relativePath), and a selected URI appearing more than once anywhere in the catalog. A single entry matching both keys counts once.
4. Require a nonempty basename and exact `.funscript` extension (case-insensitive extension only). Do not treat `.mfunscript`, ZIP, video, or arbitrary JSON extensions as permitted files.
5. Return a detached `ResourceFileEntry` whose URI/name/relativePath are copied from the catalog. Only this returned URI may reach the reader. A relative key never becomes an I/O path. This function cannot prove the caller supplied a current authorized catalog; host ownership is mandatory.

`parseManagedLoopingScript(json, targetAxis, enabledAxes)`:

1. Require a current enabled target and a bounded, distinct valid enabled-axis list. Parse with the existing strict `FunscriptParser` before dropping unknown axes, so malformed data in an unknown resource cannot evade validation.
2. Nonempty conventional actions with no nonempty embedded-axes collection become one resource on targetAxis, even if L0 is disabled. No filename enters this API.
3. Embedded resources retain parsed insertion order. A top-level empty Actions list does not introduce an L0 resource. Top-level nonempty actions can supply enabled L0; embedded L0 overrides them. Choose enabled L0 if present, otherwise the first recognized resource. Do not prefer targetAxis or profile order.
4. Return only the selected resource and its metadata. Reject absent/unrecognized/empty selected resource without falling through to a later nonempty resource. A one-point resource is valid data and remains one point; it must not authorize a fresh provider output.
5. Strict parser differences remain: 8 MiB text, 32 axes, 100000 aggregate input actions including overwritten resources, 24-hour integer milliseconds, finite values in 0–100, last duplicate timestamp wins, duplicate embedded IDs reject, all unknown-axis data still validates. Named-object axes are a portable extension. Parser budgets do not enlarge the native reader's 2 MiB file limit.

## 7. Required host transaction and failure/ownership semantics

This section is the integration contract, not proof that every listed case passed. The session/Index owner must test its final implementation.

- Resolve target from the dispatch's captured active profile/selected-axis context; empty UI target means the captured selected axis, never all axes. Reject disabled/absent targets without retargeting. This differs from upstream's null-axis no-op and is an existing portable shortcut convention.
- Resolve the identity using only the completed/current authorized Download catalog. A stale saved URI/relative key grants nothing. An exact relative key may resolve to a refreshed catalog URI; install/persist the returned catalog identity, never a joined root plus user text. No new file picker/import/root UI is introduced.
- Before the first awaited read, establish one current transaction and suspend old dispatch evidence/queued bytes. Preserve media clock/play state and ongoing numeric provider calculations; do not call `pauseTransport`, Stop, reset runtime, seek, force tick, select provider, enable axis, Connect, or Arm as command side effects.
- Capture/check the command owner, per-axis competing load generation, active engine/runtime epoch, active profile revision plus pending-profile changes, source generation, relevant configuration/control revision, Download root, catalog object/generation, library request, foreground/view state, current source/video/Internal item and dispatch cancellation token. Check before read, after every await, and immediately before one atomic commit. Edit/restore paths that share the provider must not bypass this ownership.
- Stop, background, view disappearance, source switch/close, profile switch/rebuild, Download refresh/replacement, mapping disable/remove/replacement, newer conflicting command, and explicit cancellation permanently retire the old transaction. Returning to the same foreground/source/axis/catalog strings does not resurrect it. Stale success/failure cannot overwrite newer configuration/resource/status or disarm a newer completed owner.
- Commit only after bounded read/parse succeed and ownership still holds. Repeated selection of the same identity rereads and reinstalls the resource, resetting phase. Preserve unrelated speed/range/interpolation, selected provider and all other axes. Either cancel on concurrent scalar edits or obtain the latest settings at the guarded commit; never overwrite a newer scalar edit with the old captured object.
- Core `changed()` already cancels generic script reload; `changeMotionConfiguration` calls it. `setLoopingScript` increments dispatch control. Thus naively calling both setters and then validating a generic preexisting reload token self-invalidates. Use an atomic dedicated completion contract or an explicitly owned sequence, not a bypass of token checks.
- Successful install requests original axis sync, preserves numeric provider/manager Value, resets only the new Looping resource phase, invalidates old motion proof, and leaves dispatch waiting for a genuinely current eligible frame. It must not synthesize a sample from the retained value or restore a stopped/expired admission. Unselected provider edits do not select it.
- Null/empty/blank command is **reject, not clear**. Missing catalog entry, ambiguous key, unreadable/disappeared file, malformed/unsupported/empty selected resource are visible failures; preserve prior committed source setting/resource. If the transaction had begun, release only its pending state and revoke/disarm its old dispatch admission. This transactional retention deliberately differs from upstream null-Script and partial-failure mutation.
- Cancellation releases pending ownership without adopting a loaded result and without automatic Play/Arm. Success can preserve already-existing valid arm intent through a pending gate; it never creates intent. Failure/cancel behavior must be checked with the production output coordinator, not inferred from resolver tests.

## 8. Classification and verification

**Keep template 49 partial.** The managed command preserves direct Looping provider selection, conventional/multi resource choice, same-identity reread intent, phase reset, numeric cache retention, and axis ResetSync within a bounded current Download catalog. It does not reproduce arbitrary Windows paths, FileInfo path resolution, arbitrary file extensions, WPF dialog behavior, unbounded/permissive reader input, Fody notification ordering, filesystem race behavior, or partially mutated failing setters. A working controlled selector plus these tests is not full original-platform parity.

Executed for this isolated slice:

- `node --test ohos/tests/managed-looping-selection-017.test.mjs`: **15/15 passed**. Covers detached exact URI/relative selection, ambiguity, duplicate identities, missing/null/empty, non-funscript, traversal-shaped/catalog corruption, text/entry budgets, no I/O imports, conventional target with L0 disabled, multi-axis L0 override/insertion order, empty top-level actions, unknown/malformed axes, empty selected resource, one-point data, limits, metadata and duplicate timestamps.
- `node --test ohos/tests/managed-looping-selection-017.test.mjs ohos/tests/motion-providers.test.mjs ohos/tests/motion-observation.test.mjs`: **52/52 passed**. Adjacent provider/cache/generation tests pass; they are not host async ownership or physical-device tests.
- The eleven original-chain files match the frozen 0.14 source copy; applicable hashes match the existing source manifest.

Not run by this slice: full aggregate suite, ArkTS/HAP build, final Index command integration, native filesystem cancellation on an OHOS device, Windows/WPF/Fody execution, or physical endpoint tests. Final application-level evidence belongs to the integrating task, especially delayed success/rejection after Stop/background/source/profile/catalog changes, competing edits/restores, same-identity reload, and safety re-admission after failure.
