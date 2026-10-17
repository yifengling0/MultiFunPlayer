# 0.22 local UI acceptance

The HAP is unsigned: use the official compatible HarmonyOS SDK/IDE to sign and
deploy on your own phone, tablet or2in1. Begin with every output disconnected.
No physical device test endpoint is preconfigured or contacted automatically.

1. Open the normal workspace at320/360/400vp,800vp portrait and landscape,
   1280/1920vp desktop and narrow floating windows. Verify that content fills
   each region rather than ending at600/1220vp; only one horizontal gutter is
   visible. Labels and controls should not hide or overlap.
2. Expand Input mapping/actions, Device, Output, Axis, Motion and playlist. Check
   one neutral page/section background, useful field/selection/error contrast,
   long CJK filenames and status text, and scroll access to every action.
3. At320vp check the six media tools form3×2; at360vp check six across. Axis tools
   wrap without reducing their52vp touch height. Global Stop remains fixed and
   enabled. Check it also in video fullscreen and error overlays.
4. In a single field instance, type an unsubmitted value and resize its pane
   across599/600vp: the input should keep its text/focus and not submit. Whole
   workspace single/two-pane tree switches have a separate existing remount
   boundary; universal unsubmitted-field/IME retention there is not yet proven.
   Output drafts remain centrally owned and must retain endpoint/range edits.
5. Play a video without outputs. Rotate/resize/fullscreen: the same Surface and
   media session remain, and no connection/Arm occurs. Verify actual safe areas,
   font scaling, keyboard overlap and pointer/touch reachability on your device.
6. Serial is not present yet in this build. The separately reviewed PC/USB CDC
   backend work and its test are excluded. Do not infer generic USB-UART support.

Optional local design approximation (no network/device callbacks):
`tools/ui-preview-022/index.html?viewport=phone-320&scene=forms`.
Read its README for14fixture sizes/scenes and fresh source fingerprints. It is
not an ArkUI screenshot; no renderer success is claimed for this environment.
The named HMOS code-workshop source link remains to be provided.

The previous dedicated socket receiver/diagnostic remains available for a
user-owned test receiver; use the0.20/0.21 network instructions. No new physical
network/device interoperability or execution ACK is claimed by this UI change.
