# 0.28 continuous-input action coverage

The existing button catalog remains182 IDs. The separate continuous catalog has9 template IDs (2 original literal names,7 explicit-provider/target aliases). They expose exactly9 previously unwired registration sites, all partial: **163/188 exposed =110full-portable+53partial;25unwired**. No inherited partial is promoted and no mode/provider/protocol expansion is counted as an extra registration site. This is action-route accounting, not product completion.

| Original site | Continuous template | Status |
|---|---|---|
| 36 | MotionProvider::Speed::Drive | unwired → partial |
| 39 | MotionProvider::Minimum::Drive | unwired → partial |
| 42 | MotionProvider::Maximum::Drive | unwired → partial |
| 59 | OutputTarget::Axis::Range::Minimum::Drive | unwired → partial |
| 62 | OutputTarget::Axis::Range::Maximum::Drive | unwired → partial |
| 65 | OutputTarget::Axis::Range::Middle::Drive | unwired → partial |
| 68 | OutputTarget::Axis::Range::Size::Drive | unwired → partial |
| 118 | Axis::Value::Drive | unwired → partial |
| 171 | Axis::MotionProviderBlend::Drive | unwired → partial |

The machine-readable delta pins the immutable0.21 ledger, records these transitions, retains the full25 remaining rows and hashes implementation/oracle evidence: [delta](tools/reference/action-coverage-028-source.json). All44 prior partial qualifications remain through that baseline chain.

- Motion sites36/39/42 use four named providers. Existing WPF notification, RangeSlider source-transfer/write-back and canvas lifetime qualifications remain; Drive does not change Duration/Points or justify a canvas reset.
- Output sites59/62/65/68 use explicit TCP/UDP/WebSocket instances only. Serial target Drive, other original protocols, physical timing and WPF binding equivalence are not proven. Original Middle/Size Drive formulas are distinct from button Set; reverse/equal ranges and independent limits are retained, unsupported normalized-domain results reject.
- Axis118/171 use actual local native-event controller paths and real session transitions/settings. They do not establish Windows global RawInput/XInput equivalence.
- Drive's5 modes and independent100ms Offset transform data for the same9 consumers. Local touch/mouse use component-vp spans; wheel uses explicit native-axis calibration. Native/physical delivery, global hooks, gamepad normalization and TCode IN remain unverified/unimplemented.

Remaining25 sites: **17 external source/lifecycle** (5–8,21–33), **7 output ownership/protocol** (55,56,69,70,71,73,74), **1 diagnostic** (1). Continuous templates have no remaining unwired registration, but all9 are explicitly partial. See [source audit](CONTINUOUS_DRIVE_028_SOURCE_AUDIT.md) and [device test guide](LOCAL_TEST_028.md).
