# Continuous Drive original-C# oracle (0.28)

This offline bundle compiles the original MFP source at
`36c08fbb99ac9398a63ff1cca1bbf68cd2228a94`. It does not translate the algorithms
into a second handwritten implementation and call that an oracle.

```sh
MFP_DOTNET_ROOT=/path/to/existing/dotnet-sdk-9.0.319 \
  python3 ohos/tools/reference/continuous-drive-028/run.py --output /tmp/drive-golden.json
MFP_DOTNET_ROOT=/path/to/existing/dotnet-sdk-9.0.319 \
  node --test ohos/tests/continuous-drive-oracle-*.test.mjs
```

The required official SDK is 9.0.319, reference/runtime 9.0.21. No package
restore, install, download, browser, native event, media source or physical
output is used. Without `MFP_DOTNET_ROOT`, the live-execution test is explicitly
skipped; fixture/provenance/consumer tests still run. A full release gate must
supply it. The runner writes compilation products only into an automatically
removed temporary directory; no compiled assembly is committed.

`source-manifest.json` pins 25 original application source files by Git blob
SHA-1, SHA-256 and byte count. Every file was compared against the original Git
commit before this manifest was written. The runner refuses changed bytes.
`golden.json` also hashes the runner, host template, generated host and thirteen
unchanged source spans. Eight original source files compile whole and unchanged.

The 3,194 numerical rows contain:

- 700 Drive cases: five modes × two inversion states × seven value/center
  boundaries × five delta/sign values × two source durations
- 140 independent Offset cases: two modes, inversions, five speeds and seven
  value/center boundaries; fixed relative `.1` action duration
- 240 `ApplyTo` cases including positive/negative/zero modifiers
- 2,106 action rows spanning all nine registration templates: 108 Axis Value,
  54 Blend, 162 base Motion callbacks, 1,782 output range callbacks
- Eight original Middle/Size Set contrasts

A separate deterministic probe executes the original `Invoke`/`OnInvoked`
code to prove in-flight dropping and retry after refused scheduling. The repeat
shim merely stores the original requested period and callback, then calls that
callback explicitly; it is not a fake execution of `PeriodicTimer`. Original
wait-before-first-invocation and sequential batch behavior are source-audited;
the portable engine's fake-clock/lifecycle tests prove its own schedule.

Consumer tests call the actual converter, DTO, output-range reducer, all four
named Motion models, and `PlaybackSessionCore.applyContinuousAxisAction`.
Out-of-normalized final output ranges and pre-existing invalid Motion/settings
states have explicitly tested refusals. Reversed/equal valid ranges are kept.

No WPF/Fody/Stylet binding scheduler, live control attachment, native SDK event
delivery, hardware acknowledgement, connection or Arm is established by this
oracle. See [the source audit](../../../CONTINUOUS_DRIVE_028_SOURCE_AUDIT.md).
