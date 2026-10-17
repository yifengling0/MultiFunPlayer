# Ordinal case oracle: explicit backend provenance

## CI failure and scope of correction

The full-scalar reference scan in CI `caf1a1f` (job `117260058406`) and
`c934309` (job `117266344193`) returned 1448 pairs against the 1453-pair
canonical fixture. The five missing pairs are Unicode 16 additions. The old
claim that pinning only .NET 9.0.21 made this scan portable was incomplete.
The CI logs did not record its actual globalization backend. The discrepancy
has now been reproduced with the same .NET runtime and the official Ubuntu
ICU 74.2 package. The revised CI test prints the actual backend/version; this
will verify, rather than assume, the runner's selection.

This correction changes reference validation and a production **comment**.
It does not change `CASE_PAIRS`, matching algorithms, or the canonical golden:

- `tests/fixtures/ordinal-case-net9.json`: 1453 pairs,
  SHA256 `72c6c1e82bec7ef276a89d25653d61e55a200435f416e08069576fcd709b2c0d`.
- Production `OrdinalCaseMapping.ts` from `const CASE_PAIRS:` to EOF remains
  byte-identical to frozen 0.21, SHA256
  `1b23cc47ae22b71b0cc0153052f1cdb60b6c75e1718df886d3ba3052c54c1b15`.
- The canonical OHOS table is a deliberate deterministic portability policy:
  .NET 9.0.21 / Linux X64 / ICU 76.1 / Unicode 16. It is not a claim that all
  Windows/WPF, NLS, ICU or future .NET environments produce that same table.

## Why .NET alone is insufficient

The original project targets `net9.0-windows` and does not pin an app-local ICU,
NLS mode or invariant globalization in its checked-in project configuration.
Microsoft documents the Windows ICU/NLS selection and OS-dependent casing.
The exact .NET 9.0.21 source uses ICU-backed BMP ordinal casing, while its
supplementary ordinal path uses .NET's own `CharUnicodeInfo` tables. Therefore
this fixture is not even an assertion of every Unicode 16 case equivalence.
The existing negative tests for mappings outside the canonical table remain.
No Windows WPF/NLS execution was available in this verification; that boundary
remains unproven, rather than inferred from Linux or from the .NET version.

Primary evidence:

- [Microsoft globalization and ICU](https://learn.microsoft.com/en-us/dotnet/core/extensions/globalization-icu)
- [.NET 9.0.21 OrdinalCasing.Icu.cs](https://github.com/dotnet/runtime/blob/v9.0.21/src/libraries/System.Private.CoreLib/src/System/Globalization/OrdinalCasing.Icu.cs)
- [.NET 9.0.21 Unix mode](https://github.com/dotnet/runtime/blob/v9.0.21/src/libraries/System.Private.CoreLib/src/System/Globalization/GlobalizationMode.Unix.cs)
- [.NET 9.0.21 Windows mode](https://github.com/dotnet/runtime/blob/v9.0.21/src/libraries/System.Private.CoreLib/src/System/Globalization/GlobalizationMode.Windows.cs)
- [.NET actual ICU version and selection](https://github.com/dotnet/runtime/blob/v9.0.21/src/native/libs/System.Globalization.Native/pal_icushim.c)
- [ICU 74 / Unicode 15.1](https://icu.unicode.org/download/74)
- [ICU 76 / Unicode 16](https://icu.unicode.org/download/76)

## Fail-closed reference profiles

`tests/fixtures/ordinal-oracle-provenance.json` lists only profiles whose **full
scalar scan** was verified, all .NET 9.0.21 / Linux X64:

| Actual backend | Actual ICU / Unicode | Complete expected pairs |
| --- | --- | ---: |
| ICU | 74.2.0.0 / 15.1.0.0 | 1448 |
| ICU | 76.1.0.0 / 16.0.0.0 | 1453 |
| Invariant | no selected ICU | 1448 |

`OrdinalOracle.cs` reads the actual `GlobalizationMode.Invariant`. On Windows
it reads the actual `UseNls` property; Linux's pinned source defines that as
false (the published constant property is trimmed). ICU provenance calls
CoreLib's own `Interop.Globalization.GetICUVersion` stub, preserving its native
resolver. It then identifies the already-loaded matching ICU module and checks
its own `u_getVersion` and `u_getUnicodeVersion` exports. It does not call
`LoadICU`, infer the backend from installed packages, trust an environment
variable, or use the pair count to distinguish ICU from invariant mode.
An unavailable reflection/export/module proof fails the test.

The official complete Unicode 16 `DerivedAge.txt` is included with its license:
[original data](https://www.unicode.org/Public/16.0.0/ucd/DerivedAge.txt), SHA256
`60caa81b99a4dfb0bc5d38440d323073e3f356f46f9ca7869da848cd0715408b`.
For these explicitly verified profiles only, an expected pair is retained if
**both** endpoint code points are no newer than the profile's maximum age.
The invariant profile's age cutoff is an experimentally verified projection,
not a claim that an ICU Unicode version exists in invariant mode. The test
compares the entire actual ordered mapping list with the full derived list.
There is no five-codepoint exception list. Missing, extra, modified, duplicate
and reordered mappings all fail. Unknown runtime, backend, ICU/Unicode version,
architecture or platform also fails. Age filtering is not generalized to other
historical casing changes; new profiles require explicit investigation and a
complete exact scan.

The test always checks all 1453 canonical production mappings. With a configured
SDK it additionally runs the actual host and forced-invariant full scalar scans.
A local run without an SDK may explicitly skip that optional oracle. CI without
`MFP_DOTNET_ROOT` / `DOTNET_ROOT` fails instead of silently skipping it.

## Reproduction and results

On Debian 13 X64 with official SDK 9.0.319 / runtime 9.0.21:

```sh
MFP_DOTNET_ROOT=/path/to/dotnet-sdk-9.0.319 \
  node --test ohos/tests/shortcut-ordinal-oracle.test.mjs
```

The actual host probe reports ICU 76.1 / Unicode 16 / 1453, and the invariant
probe reports invariant / no ICU / 1448. All seven tests pass, zero skips.

The second run uses the official Ubuntu package without installing or replacing
system libraries: `libicu74_74.2-1ubuntu3_amd64.deb`, SHA256
`d29c97a21a3e3254731cfac186e4d4e611e5e67d2c9a0430f6acfbd9acaefa2e`,
verified against the [Ubuntu package page](https://packages.ubuntu.com/noble/amd64/libicu74/download).
After extraction to a temporary directory:

```sh
MFP_DOTNET_ROOT=/path/to/dotnet-sdk-9.0.319 \
LD_LIBRARY_PATH=/temporary/icu74/usr/lib/x86_64-linux-gnu \
CLR_ICU_VERSION_OVERRIDE=74 CI=true \
  node --test ohos/tests/shortcut-ordinal-oracle.test.mjs
```

The real probe reports ICU 74.2 / Unicode 15.1 / 1448; forced invariant reports
1448 with distinct backend proof. Seven tests pass, zero skips. The override is
used only for this isolated reproduction; CI and production are not reconfigured.
The ordinary CI run will print its own selected backend before validating it.
