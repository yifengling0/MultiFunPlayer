# 0.32 validation

## Build

- Host: Windows, DevEco Studio SDK 26.0.0.105, Node 24.14.0, JDK from DevEco Studio.
- Command used directly against the installed vendor CLI:
  `hvigorw --mode module -p module=entry@default -p product=default -p buildMode=debug assembleHap --no-daemon --no-parallel`
- Result: `BUILD SUCCESSFUL`; signed debug HAP produced at
  `entry/build/default/outputs/default/entry-default-signed.hap`.
- HAP: 8,999,426 bytes, SHA-256
  `57d6bbebf1de5f604e0ea9958683c36e022c266e70ffe4d5af2e0a2de602c0a0`.
- Manifest: versionName 0.32.0, versionCode 33, compatible 20, target 26.
- `tools/capture-video-composition.py` was re-run against the SDK-transformed current `videoStage`
  builder; the recorded fixture hash now matches
  `bec315b019cacd4fe0a0c1a38d892a14fa7a018a9caa7d01f7cbd2470f73160c`.

## Logic and presentation tests

Command:

```powershell
$env:PYTHON = '<python.exe>'
$env:PATH = '<python3 shim dir>;' + $env:PATH
node --test tests/*.test.mjs
```

Result: **3903 tests, 3896 passed, 0 failed, 7 skipped**.

The 7 skips are pre-existing SDK/device probes that require their own environment; no new test was
skipped. New coverage:

- `tests/ui-refresh-032.test.mjs` — palette contrast, compact/48vp geometry, header/segmented
  navigation, rounded video chrome, library card structure, white card settings shells, and absence
  of the old low-contrast palette.
- `tests/settings-reflection-032.test.mjs` — 115 persisted fields across nine setting families have a
  visible editing surface; representative General/Sync/Playback/Media/Keyboard/Continuous/Output/Axis
  values roundtrip through `SettingsSchema.encode → decode`; runtime state never persists.
- `tools/ui-automation.mjs` — real-device navigation/rendering smoke with screenshots and layout JSON.

## Device acceptance performed

- Phone: HUAWEI Mate 80 / VYG-AL00, HarmonyOS `7.0.0.109(SP6C00E105R3P4)`, API 26, 1280×2832.
- Tablet / landscape proxy: HUAWEI MatePad Mini / MLR-AL10, HarmonyOS
  `7.0.0.109(SP6C00E105R1P2)`, API 26, 2560×1600, running a PC-like desktop environment.
- Signed HAP installed over hdc on both targets; app launched from a cold force-stop.
- Phone navigation verified: video library → 控制 → 脚本 → 连接 → 媒体 → 设置 → 通用设置 → 运动与曲线.
- Tablet verified: library centers to a 980vp column and uses two card columns; wide workspace keeps
  the video preview and the 320–480vp inspector side by side with intact compact fields.
- Connection flow verified on the phone: device list with target/connected/armed counters, add page
  with four protocol cards, TCP detail page with a full-width address field and a `1–65535` port field.
  The address field focuses and accepts keyboard text on the real device; fully automated text entry
  was limited by the device IME, so the full-address commit is left as a manual check.

### USB serial capability

- Docs: `@ohos.usbManager.serial` is public from API 19 and provides
  `getPortList` / `requestSerialRight` / `open` / `setAttribute` / `read` /
  `write` / `close`; system capability `SystemCapability.USB.USBManager.Serial`.
- The project already contains `OfficialSerial19Backend` using this API.
- Measured on VYG-AL00 after refreshing the serial picker:
  `official26=false official19=false` (high-level serial syscaps absent). Raw
  `SystemCapability.USB.USBManager` is present.
- **Real CH340 output succeeded:** after turning off the L1 range switch (L1 has
  no script/provider and stayed non-finite), disconnecting/reconnecting the
  serial target to apply the new 5/6 range set, and pressing Arm, the UI reached
  **1 个已启用**. CH34x wrote 50-byte TCode payloads continuously:
  `writes=1/100/200/300 last=50` at the 10 ms cadence.
  This proves the serial write path, not device execution (no ACK in write-only
  CH340 backend).
- Implemented/updated experimental raw-USB output backends: CH340/CH341 (ROM
  0x30/0x31), CP210x and FTDI write-only; CDC-ACM read/write. CP210x/FTDI/CDC
  were not connected to hardware. Details: [USB_SERIAL_032.md](USB_SERIAL_032.md).

### PC TCP/UDP receiver (`tools/tcode-receiver`)

- Receiver self-test passed: 5 frames across TCP and UDP, axes `L0,R1,V0`, attached intervals such as
  `L09999I16` parsed correctly.
- Local `send-test.mjs` produced 14 frames (9 TCP / 5 UDP), with per-axis ranges and no invalid frames.
- Phone TCP connectivity passed: the PC receiver logged
  `[tcp] client connected 192.168.180.76:...` after connecting a real TCP target.
- **The arm refusal was resolved on the real device.** Entering 控制/设置 no
  longer releases a completed video via `cancelLibraryPlayback`; the engine
  remains `playing`. The last blocker was `source=axisValueNonFinite=L1`: L1 had
  no script/provider and stayed NaN. Disabling the L1 output-range switch,
  disconnecting/reconnecting to apply the 5/6 range set, then Arm made the
  output reach **1 个已启用** and started 50-byte CH34x writes at 10 ms cadence.
  No execution ACK is claimed for the write-only CH340 path.
- While a video is playing, entering 连接/设置 cancels floating preview and keeps the video docked
  at the top; options scroll below it instead of overlaying it. Auto-float on scroll was removed, so
  only the explicit 浮窗 action can create an overlay. The video stop action now reads “■ 停止” and
  is only shown in fullscreen, where the fixed header is hidden; otherwise the header “停止” is the
  single stop action.
- Screenshots captured in `.hvigor/outputs/ui-automation/` and `.hvigor/outputs/ui-refresh/`;
  stable copies are in `docs/ui-032/` (library, script-axis, media, general, tablet-library,
  tablet-workspace).
- Player screen verified with a real local video: single Surface, status chip, compact control card,
  heatmap, seek slider, system status bar, and the fixed header Stop.
- App process survived the entire smoke; no crash/ANR banner was observed.
- `uitest dumpLayout` on the sync panel can stall for a long time on this device. The application
  remains operable; the smoke intentionally stops before that panel and uses the unit-level
  reflection suite for sync fields.

## Not validated

- 2in1/PC window resizing, system font scaling, dark mode, and hardware output devices.
- Real DeoVR / HereSphere peers and native `uiMaterial` pixel output (still system-decided).
- Long-duration playback stability, audio/video sync under thermal load, and physical TCode devices.
