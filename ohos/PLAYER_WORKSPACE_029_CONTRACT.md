# 0.29 library, player and compact control workspace

## Evidence and scope

The user supplied the original MultiFunPlayer1.31.3 desktop screenshot on2026-10-17. It is a visual reference, not an OHOS screenshot. Image SHA256: `b01bcb48290f06ad7996fb2dfb138ff04caf491309a74a88e7752b9610bb68e0`.
Original source remains pinned to `36c08fbb99ac9398a63ff1cca1bbf68cd2228a94`.
`Source/MultiFunPlayer/UI/Controls/Views/ScriptView.xaml` supplies the axis-tab/compact-command/expander hierarchy, and `OutputTargetView.xaml` the target selection/connection configuration hierarchy. This change translates that hierarchy to touch and responsive panes; it does not claim pixel-identical WPF rendering. The existing light/teal palette and supported API26 material paths remain.

## Destinations and ownership

- Default video library shows videos, search and refresh, with row details/manual script pairing behind a disclosure. Download remains the sole managed local entry; no new directory or single-file import is introduced. Internal scripts/playlist, external media sources and all advanced tools remain under Control → Media/Settings.
- A current library-row tap is an explicit Play intent. It must name the exact current catalog object and pass captured page/screen/catalog/editor epoch checks. The lower-level open method returns its successful request token. Playback starts once, only after that token’s real AVPlayer readiness; no output Connect or Arm is synthesized.
- Back, tool navigation, Stop, background, actual window focus loss, source replacement, failed reads and native failure revoke pending tap/open/prepare work. Reentering, regaining focus and late callbacks cannot revive it. Back from established playback only navigates; explicit Stop remains the hard stop. Refresh still closes old playback before scanning.
- There is exactly one unconditional XComponent node. Library/player/workspace/fullscreen only change its bounds and visibility. The native adapter retains scaled-aspect presentation; no second Surface, setSurfaceSize or new video timer is added.
- Player occupies the safe content area, with no axis/output editor in it. Fullscreen removes application navigation/settings. Loading, error and pipeline-fault messages remain visible; Back and52vp Stop remain reachable.
- Phone controls are portrait-friendly; video player supports landscape. Wide tablet/PC workspaces retain a preview and inspector, with an explicit collapse action. Collapse, resize and destination changes retire editor callbacks and retain raw unapplied drafts, without committing or connecting.

## Native fullscreen

Desktop floating/maximized windows retain the existing observed maximize/recover transaction. Phone/tablet FULLSCREEN-window baselines use public since9/12 APIs for preferred orientation, immersive layout and status/navigation-bar requests. Actual window properties and landscape geometry are checked, including a bounded750ms size wait. Promise success alone is not native-fullscreen proof. Split/floating phone windows and unsupported operations retain an explicit in-window fallback.

The saved preferred orientation and immersive layout are restored only while still owned. Every awaited native step compares generation and per-setting ownership; newer user/system settings are preserved. Partial failure and unconfirmed restore remain observable and retryable. Background, page replacement and stage destruction cannot revive an old request.

The SDK exposes status-bar/full-layout state but no navigation-bar-enabled getter. Mobile exit therefore applies the documented app normal visible-bars policy. It does not claim exact restoration of an unobservable prior navigation preference, nor removal of system-controlled gesture affordances. Hardware/platform restrictions remain subject to device verification.

## Compact settings

Ordinary shared controls have48vp targets,16px default text (15px explicit compact),14px helper text and smaller spacing. Header navigation has44–48vp targets. Emergency/global/modal Stop stays52vp. All29axis fields remain, with a one-open-at-a-time advanced accordion and all-closed support. Folding keeps drafts and rejects hidden editor callbacks.

Connection settings expose host/IP+port or selected serial port+baud before optional detail folds. A connected/connecting endpoint is locked with an explicit Disconnect/Edit path. Changes require disconnect → apply/reconnect → fresh Arm. Field editing never silently changes the published physical endpoint. Per-target generations, permissions, validation, persisted drafts, cleanup quarantine and CH experimental write-only disclosures remain intact. This release adds no protocol/hardware support claim.

## Validation boundary

Node actual-controller tests and mocked official-window API tests cover lifecycle/identity/restore races. Official SDK compiles the actual reachable ArkUI code. There is no connected hdc target in this environment; installed Previewer startup fails on its absent vendor `libshared_libz.so`, and no emulator image is installed. No rendered ArkUI screenshot or physical transport acceptance is claimed. The previous denied browser route is not used.

Original action coverage is unchanged:163/188sites,110full-portable+53partial,25unwired;182button IDs and9partial continuous templates. This is a usability/lifecycle release, not additional protocol coverage.
