# Resource library scope and upstream matching

This milestone adds a usable resource-selection flow to the functional prototype. It is **not** acceptance of desktop UI parity. The first source-led compact layout is implemented; full control behavior and device screenshot comparison remain outstanding.

## Access boundary

Choose a folder through the system document picker, or select video and script files together. If the system picker offers Downloads, the user can choose it there. No public Download path is guessed, no broad storage permission is requested, and selecting individual files does not authorize scanning their parents. Videos remain in their original location; opening uses a read-only descriptor.

The library is session-only. Remembering a URI is not proof of persistent permission. Refresh reuses the selected root only while the platform still permits access; failed/revoked access asks for reselection. API26 supports single-folder selection on phones, but device capability and actual returned directory access are checked. Multi-file selection remains available on all declared form factors. Older supported API versions may lack phone folder selection.

Directory traversal is asynchronous, bounded to 1,000 encountered entries and depth 4, skips symlinks, validates child names and supports cancellation. Partial scan results are previews; opening is disabled until scanning finishes or is cancelled. Unsupported files and failed child reads are reported. A bounded list shows 20 groups at a time. Opening also limits candidates to 64, cumulative UTF-16 source text to 8 MiB, and parsed actions to 100,000 before retaining additional candidates; excess requires a narrower manual mapping.

## Upstream authority

Pinned baseline: `36c08fbb99ac9398a63ff1cca1bbf68cd2228a94`.

- `Source/MultiFunPlayer/Script/Repository/ViewModels/LocalScriptRepository.cs`: discovery order, first-result behavior, multi-axis priority.
- `Source/MultiFunPlayer/Common/Utils/DeviceAxisUtils.cs`: suffix stripping, case-insensitive names, per-axis alias preference order.
- `Source/MultiFunPlayer/Common/DeviceSettings.cs`: default axis aliases.
- `Source/MultiFunPlayer/Script/Repository/ScriptRepositoryManager.cs`: repository sequencing.

The resource list discovers authorized same-directory candidates and same-name ZIPs. Up to eight separately authorized script libraries can be ordered, refreshed, removed and marked recursive. Search follows media-directory ZIP, media-directory loose files, then each configured library in order: sorted matching ZIPs followed by sorted loose files. ZIP entries retain central-directory order. Opening parses candidates before applying the upstream local selection rules; filename pairing alone cannot determine multi-axis priority. Invalid/unreadable scripts are skipped and counted. The first multi-axis document takes priority, including blocking single-axis fallback for absent axes. Otherwise each axis uses its alias order, then the first matching candidate in source order. Explicit manual mapping narrows the candidate set and uses the same selection rules.

## Explicit differences and remaining work

- ZIP32 stored/DEFLATE entries are read in memory with CRC and structural checks; there is no extraction. Limits: archive 32 MiB, 256 entries, each entry 2 MiB and total expanded data 8 MiB. ZIP64, encryption, non-UTF-8 non-ASCII legacy names, symlinks, unsafe paths, unsupported flags/methods and prefixed/self-extracting archives are rejected. Every entry, including non-script entries, is bounded and CRC-checked; Windows only opens script entries. These deliberate restrictions differ from the Windows ZIP reader. A malformed ZIP fails the open operation; invalid script JSON is skipped and counted.
- Upstream remote repositories and custom device profiles are not implemented. Defaults use TCode 0.3 aliases.
- Windows directory ordering uses .NET's default culture comparer; the portable catalog uses a deterministic string order. Locale-sensitive ties require explicit comparison tests before claiming exact Windows ordering parity.
- The catalog presents multiple same-stem videos for explicit choice, since there is no already-selected external-player media identity. Original script alias priority remains unchanged after selecting the video.
- The merged preview document uses selected L0 metadata, otherwise the first selected enabled axis. Upstream keeps metadata on each script resource.
- Metadata handling follows the existing OHOS parser, which is stricter than upstream. Script contents with unsupported representation or out-of-range data may be rejected.
- Directory limits, case-sensitive parent identities and permission checks are OHOS safety boundaries, not original Windows search behavior.

Tests compare transcribed source rules against fixed cases; the Windows C# application has not been executed here. Real picker grants, file-provider behavior and on-device directory traversal remain runtime tests.

The public filesystem APIs do not provide descriptor-relative traversal here. A hostile concurrent replacement of an ancestor directory cannot be made race-proof by lstat plus path operations. Platform URI grants remain the security boundary; symlink skipping and final NOFOLLOW/regular-file checks are defensive checks, not a claim of race-free containment.
