# Resource library scope and upstream matching

The current media flow automatically scans the application's Download directory. It is **not** acceptance of desktop UI parity; full control behavior and device screenshot comparison remain outstanding.

## Access boundary

Startup and Refresh use `DocumentViewPicker.save()` with `DocumentPickerMode.DOWNLOAD`. This is the system's download-directory provisioning mode, without a file/folder selection UI. The system creates `Download/<current bundle name>` when needed. For the current application this is `Download/com.multifunplayer.ohos`; put videos, loose scripts and matching script ZIPs there. There are no manual video-import, folder-selection or script-import controls in the normal media flow. Videos remain in place; opening uses a read-only descriptor.

`DownloadLibrary.prepare()` obtains the installed bundle identity at runtime, validates the system-returned document URI, and checks the actual directory with `lstat` and a bounded `listFile` probe. Only the returned app-directory path is scanned. It never constructs a filesystem path from a bundle name, calls `Environment.getUserDownloadDir()`, requests whole-Download/media access, or scans parent directories. Invalid/empty responses, unsupported capability, missing directories and denied access are failures with explicit status; none is reported as a successful empty library. Refresh makes one new system provisioning attempt, with cancellation checks throughout and no automatic retry loop.

The index is session-only. DOWNLOAD-mode directory access is documented as persistent by the platform, but the application reacquires and revalidates it for each scan rather than trusting cached access. The directory is public user storage, **not an isolated private app sandbox**; do not store private application data in it. If this mode is unavailable on a device, the interface reports the limitation and offers retry. It does not silently substitute a private directory or reopen a selector.

Refresh first closes the previous video descriptor and clears its scripts, including when preparation later fails or the scan is cancelled. Select a video again after scanning; refresh never resumes the old source. The visible list contains videos while the matching catalog retains the root's script and ZIP candidates. A video with no matching candidates opens in video-only mode with no simulated axes. Unreadable/invalid candidates remain errors rather than being silently treated as absent.

The checked SDK26 declarations expose DOWNLOAD mode since API12 under `SystemCapability.FileManagement.UserFileService`, not the optional `FolderSelection` capability. The declared phone/tablet/2in1 targets therefore use the same narrow route, gated by capability and real I/O. In contrast, the unrelated whole-public-directory Environment APIs support PC/2in1, and Tablet from API26, with separate directory-access requirements; obtaining their path alone never grants access. No real-device Download-mode execution was performed in this change.

Primary API evidence: [OpenHarmony saving files to the Download directory](https://github.com/openharmony/docs/blob/master/en/application-dev/file-management/save-user-file.md#saving-files-to-the-download-directory), [official picker API](https://github.com/openharmony/docs/blob/master/zh-cn/application-dev/reference/apis-core-file-kit/js-apis-file-picker.md), and [Huawei Environment device constraints](https://developer.huawei.com/consumer/cn/doc/doccenter-capabilities/api/capi-oh-environment-h). Local SDK types were checked in SDK26 `@ohos.file.picker.d.ts`, `@ohos.file.fileuri.d.ts` and `@ohos.bundle.bundleManager.d.ts`.

Directory traversal is asynchronous, bounded to 1,000 encountered entries and depth 4, skips symlinks, validates child names and supports cancellation. Partial scan results are previews; opening is disabled until scanning finishes or is cancelled. Unsupported files and failed child reads are reported. A bounded list shows 20 groups at a time. Opening also limits candidates to 64, cumulative UTF-16 source text to 8 MiB, and parsed actions to 100,000 before retaining additional candidates; excess requires a narrower manual mapping.

## Upstream authority

Pinned baseline: `36c08fbb99ac9398a63ff1cca1bbf68cd2228a94`.

- `Source/MultiFunPlayer/Script/Repository/ViewModels/LocalScriptRepository.cs`: discovery order, first-result behavior, multi-axis priority.
- `Source/MultiFunPlayer/Common/Utils/DeviceAxisUtils.cs`: suffix stripping, case-insensitive names, per-axis alias preference order.
- `Source/MultiFunPlayer/Common/DeviceSettings.cs`: default axis aliases.
- `Source/MultiFunPlayer/Script/Repository/ScriptRepositoryManager.cs`: repository sequencing.

The resource list discovers same-directory candidates and same-name script ZIPs inside the provisioned root. Search follows media-directory ZIP, media-directory loose files, then each configured library in order: sorted matching ZIPs followed by sorted loose files. The lower-level configured-library matching model and its tests are retained; the simplified UI does not add external script-library folders. ZIP entries retain central-directory order. Opening parses candidates before applying the upstream local selection rules; filename pairing alone cannot determine multi-axis priority. Invalid/unreadable scripts are skipped and counted. The first multi-axis document takes priority, including blocking single-axis fallback for absent axes. Otherwise each axis uses its alias order, then the first matching candidate in source order. Explicit manual mapping narrows the candidate set and uses the same selection rules.

## Explicit differences and remaining work

- ZIP support means automatic matching and in-memory reading of script archives, not general video ZIP import or playback from an archive. ZIP32 stored/DEFLATE entries are read with CRC and structural checks; there is no extraction. Limits: archive 32 MiB, 256 entries, each entry 2 MiB and total expanded data 8 MiB. ZIP64, encryption, non-UTF-8 non-ASCII legacy names, symlinks, unsafe paths, unsupported flags/methods and prefixed/self-extracting archives are rejected. Every entry, including non-script entries, is bounded and CRC-checked; Windows only opens script entries. These deliberate restrictions differ from the Windows ZIP reader. A malformed ZIP fails the open operation; invalid script JSON is skipped and counted.
- Upstream remote repositories and custom device profiles are not implemented. Defaults use TCode 0.3 aliases.
- Windows directory ordering uses .NET's default culture comparer; the portable catalog uses a deterministic string order. Locale-sensitive ties require explicit comparison tests before claiming exact Windows ordering parity.
- The catalog presents multiple same-stem videos for explicit choice, since there is no already-selected external-player media identity. Original script alias priority remains unchanged after selecting the video.
- The merged preview document uses selected L0 metadata, otherwise the first selected enabled axis. Upstream keeps metadata on each script resource.
- Metadata handling follows the existing OHOS parser, which is stricter than upstream. Script contents with unsupported representation or out-of-range data may be rejected.
- Directory limits, case-sensitive parent identities and permission checks are OHOS safety boundaries, not original Windows search behavior.

Tests compare transcribed source rules against fixed cases; the Windows C# application has not been executed here. Mocked Download preparation and controller tests cover returned-path scope, actual access failures, missing directories, unsupported devices, cancellation, stale completion, retry, successful empty scans and no retry loop. System directory creation/recreation, real grants, file-provider behavior and on-device traversal remain runtime tests.

The public filesystem APIs do not provide descriptor-relative traversal here. A hostile concurrent replacement of an ancestor directory cannot be made race-proof by lstat plus path operations. Platform URI grants remain the security boundary; symlink skipping and final NOFOLLOW/regular-file checks are defensive checks, not a claim of race-free containment.
