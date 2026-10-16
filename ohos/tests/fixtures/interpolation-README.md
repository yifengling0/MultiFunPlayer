# Interpolation equivalence evidence

`interpolation-golden.json` contains 1,272 synthetic samples across 44 case/mode
combinations. Regenerate with `python3 ohos/tests/interpolation-reference.py`.
Run with Node 24: `node --test ohos/tests/interpolation.test.mjs`.

## Provenance

The reference is an **independent Python exact-rational transcription**, not output
from an executed C# binary. No .NET/C# runtime was available in this environment.
It uses `fractions.Fraction`, an algebraically reduced PCHIP derivative, and the
expanded cubic Hermite basis. It never imports or executes production TypeScript.
This establishes equation/padding equivalence within floating-point tolerance;
it does not establish C# JIT or HarmonyOS runtime parity.

Pinned source snapshot:
- [MathUtils.cs kernels](https://github.com/yifengling0/MultiFunPlayer/blob/0b81a15dd67c6dda9a21a1f84300326f5cb57c2a/Source/MultiFunPlayer/Common/Utils/MathUtils.cs)
- [KeyframeCollection.cs padding](https://github.com/yifengling0/MultiFunPlayer/blob/0b81a15dd67c6dda9a21a1f84300326f5cb57c2a/Source/MultiFunPlayer/Common/KeyframeCollection.cs)
- [ScriptViewModel.cs final Clamp01](https://github.com/yifengling0/MultiFunPlayer/blob/0b81a15dd67c6dda9a21a1f84300326f5cb57c2a/Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs#L234)

The fixture records source SHA-256 digests and tests verify the current C# source
still matches them. Review changes before regenerating after any upstream update.

## Intentional behavior

- Input milliseconds and 0–100 positions become upstream seconds and 0–1 values.
- Raw interpolation is distinct from the final 0–1 clamp; fixtures store both.
- Preserve upstream's unusual Makima `pm2` argument ordering exactly. Do not
  replace it with a standard-library Akima/Makima edge extrapolation.
- Parsed axes must be sorted, finite, bounded, and have unique timestamps.
- Empty-axis neutral value 50, singleton holds, and outside-timeline holds are
  preview adapter policies. C# `KeyframeCollection.Interpolate` itself requires a
  valid segment and does not specify these cases.
- Exact interior timestamps begin the next segment, including Step. Last point
  and later timestamps hold the last value.
- Nonfinite time or unsupported interpolation mode is rejected.

Tests include nonuniform spacing, plateaus, alternating extrema, actual Makima
overshoot, 0/1/2/3-point inputs, exact timestamps and adjacent fractional samples,
and 1ms gaps near the 24h parser limit. Normal cases use absolute tolerance 1e-9
in preview units. The extreme offset case uses 1e-5 because conversion to seconds
and subtraction lose floating-point precision; observed maximum error against
exact-rational values on Node 24.19.0 was about 1.081e-6 preview units.
