# Approved Harmony-style interface contract —0.25

## Scope and evidence
The user approved the complete light/teal concept on2026-10-17. This release applies its hierarchy consistently rather than claiming an unspecified HMOS workshop reference was inspected. The concept is an illustrative mockup, never a screenshot of ArkUI execution. Native visual acceptance remains separate.

## Visual and layout rules
Page/card#F5F6F8,field#FFFFFF,ink#1C2937,muted#647181,edge#DFE4EA,accent#236B73,accentSoft#E7F0F0,danger#B4434A. Body18/default or16/explicit compact;support14;section20;heading22–24. Ordinary actions retain52vp minimum height. Secondary buttons use white/edge; primary operations teal; destructive local actions red text; global Stop red fill. Groups use separators rather than nested background slabs.

The measured safe content area owns layout. Header72vp retains72×52Stop and52More, with short MFP title below360vp. Existing horizontal threshold568vp and single positioned native Surface remain. Wide video layouts reserve a separate left timeline while inspector is320–480vp; narrower layouts stack. Non-video vertical inspector height subtracts transport52+gap12+padding24; wide non-video subtracts32vertical padding. Scroll owns the remaining inspector height, not a clipped100%child below transport. Stacked video reserves156vp for the inspector when that space exists; in short forced-vertical windows this intentionally reduces the video preview (480×320:32vp native surface plus52vp controls). Fullscreen remains available. Below220vp inspector height, extra fault/readonly warning details move to the top of its Scroll rather than consuming the fixed remaining height; real output summary remains above it. Empty target rows are filtered before ForEach, preserving id:generation keys.

## Functional map
| Tool | Preserved reachable features |
|---|---|
| 脚本 | Axis strip;scale/offset/invert;all29fields in five groups;Motion/curve;sync;resource reload;all-axis values;trace/heatmap/chapters/bookmarks |
| 输出 | Current target selector;serial/TCP/UDP/WS add;each target settings/ranges;Connect/Arm/disarm/disconnect;other-target states;remove;socket diagnostic;serial read-only probe |
| 媒体 | Download catalog/matching;Internal/local video/DeoVR/HereSphere;playlist/AB/AutoSkip;independent Motion/manual preview;runtime rebuild;volume |
| 设置 | General;keyboard/touch actions;device/profile/import/export;version/about |

All summaries derive from actual state. Connected is not armed, and suspended armed intent is explicitly waiting with no output. Fault counts remain visible above the scroll. Sync navigation opens the real script sync section. No new original action registration or protocol is claimed.

## Editor and lifecycle invariants
The page-owned SettingsDraftOwner remains bounded and volatile. Tool changes invalidate leases, preserve compatible raw text, and never call setters/output commands. Leaving shortcut editing cancels active capture. Axis groups preserve expansion and raw pending fields by profile/axis scope. Same-valued replacements, incoming-before-Watch updates, target generations, background and async completions retain0.24guards. Numeric fields use the same TextInput regardless of inline/stacked width; estimate only affects label/control widths. Long choice disclosure changes no selection. Existing realtime Slider callbacks remain separately guarded and immediate.

## Validation boundary
Tests execute actual controller methods and verify routing, source tokens, target identities, pending drafts, panel groups, exact palette and bounded geometry. SDK compiles the reachable complete application. These do not prove native text measurement, OS font scaling, IME composition/caret/focus, popup geometry, touch response, AVPlayer appearance or physical USB/network acceptance. The permitted device test path is documented in LOCAL_TEST_025.md; no previously denied renderer route is retried.
