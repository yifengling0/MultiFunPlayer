# 0.17 managed Looping resource and target Range commands

Implementation contract, pending final evidence. The immutable0.16 archive is unchanged.

## Source/identity boundaries

- Add the exact Looping Script Script::Set route and eight original per-target Range Set/Offset templates. A portable output-template ID carries an explicit saved output target identity; this is not an invented original concrete instance name. No implicit current-target fallback or all-axis wildcard is added.
- Looping text/selection can resolve only an exact identity from the current authorized Download catalog. The string is never used as an I/O path. Missing/ambiguous identity, malformed/oversize JSON and revoked catalog/source/profile/command ownership fail explicitly. No new directory or single-video import exists.
- Repeated same-resource commands perform a real new read and install a new resource identity. Use the original direct-reader semantics, not filename companion-axis remapping. Preserve manager cache versus phase/reset behavior and source-requested sync. Failures retain old configuration/resource with an error but revoke output eligibility; they are never reported as success.

## Output range semantics

- Exact source Minimum/Maximum/Middle/Size Set/Offset arithmetic, including Middle::Set subtracting half-width (not current midpoint), Size::Set through OffsetSize, and ClampSafe ordering of independent limits. Finite0..1 reversed endpoints are permitted and shown as reversed mapping; never silently sort them. Values and limits retain original editor domains, with nonfinite/overflow rejection.
- Range-only changes cannot enable an axis, alter target identity/protocol/update mode/paused permissions/profile, connect a transport or Arm. A saved target's reusable ID is combined with volatile instance generation; queued callbacks capture it. Removed/recreated targets cannot inherit old work.
- A connected, already-applied exact target may update range mapping in place. Immediately invalidate old candidates/fixed and polled queues/receipt authority, and wait for a genuinely newer source frame. Preserve only a previously explicit Arm with unchanged source/profile/scope/permissions and no Stop/background/disconnect/fault/cancel. An unarmed target stays unarmed. A disconnected target only saves settings.
- Fixed dirty checking retains the last successfully written unquantized range-mapped values, and polled event identity/timing retain original semantics; no synthetic event or clock is minted by a range change. Already-submitted bytes cannot be recalled. Late completion cannot dirty a new range generation or replay old queued commands.

## UI and persistence

- Explicit controlled target and managed-resource choices, source-limit arguments and result/rejection feedback are available to phone touch and keyboard mappings through the same dispatcher. Editor changes do not execute actions. Read-only/recovery and stale editor contexts remain guarded.
- Schema additions are bounded/additive; old actions/configuration retain defaults. Runtime generation, pending/Arm state and credentials are never persisted. Restore never connects or Arms.
- Source audits and actual method oracles must distinguish Windows binding/scheduler uncertainty, managed-resource narrowing and supported output-family expansion. Do not upgrade partials or count static template aliases as original concrete names.

Final verification requires independent review, all tests with actual.NET oracles, official clean SDK, input hashes, immutable source/HAP and recovery ZIP. Git, blocked File review and unknown physical endpoint connections remain outside scope.

## Closed review findings

The integrated route rejects incomplete catalogs (`libraryLoaded=false`). Catalog restore also uses a dedicated core ownership token, including its exception path: Stop/source/configuration invalidation returns before another axis is read and cannot replace the Stop message. Normal command and restore reads close stale output candidates before awaiting bytes. Repeated same-URI read installs a genuinely new resource; no provider cache or last frame is relabeled as a fresh observation. The independent retained 19-case review plus 28 main transaction cases cover these fixes and real multi-target owners with MemoryTransport.
