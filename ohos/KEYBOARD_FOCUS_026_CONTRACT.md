# 0.26 keyboard focus and cancellation contract

This increment fixes existing discrete-keyboard lifecycle behavior. It does not add continuous Drive/Axis Offset controls, gamepad normalization, protocol input, or alter the approved0.25 visual hierarchy. Version0.26.0/code27.

## Window versus page ownership

`NativeKeyboardWindow` observes only the EntryAbility main window returned by its `WindowStage.getMainWindow()`. A synchronous stage claim closes keyboard admission before settings/main-window awaits. Registering `windowEvent` precedes `isFocused()`. The SDK declares these at API10/API12, below the app minimum API20. Failed acquisition/subscription/query remains closed with a visible message in Input settings. No `getLastWindow`, global hook, permission addition or injected input is used.

Window INACTIVE/HIDDEN closes input; DESTROYED retires that native owner. ACTIVE/SHOWN only rechecks actual focus and foreground. Background cannot be overridden by a late native ACTIVE. Subscription cleanup uses the same callback; failures cannot revive a retired token. Native callbacks, asynchronous acquisitions and old cleanup are tied to exact stage ownership. A second Ability also replaces a process-wide lifecycle owner, so an old Ability's foreground/background/destroy or awaited continuation cannot alter new global foreground, media/output or presentation. Construction without stage creation does not acquire this authority. A normal StageDestroy→Destroy still closes its own resources.

Index is input-focused only when page-alive AND observed-window-focused. Replacing the page listener first retires the old held timers/queued work/awaiting batch before installing new callbacks. Root and field native handlers capture listener ownership, preventing an old callback from acting on a new page. Input observation stores no text or key history beyond the existing bounded runtime state.

## Cancellation and side effects

- Native CANCEL/any unsupported key phase retires held trigger deadlines, capture, queued dispatches and the unexecuted tail of an awaiting ordered batch. It never synthesizes Up, Release or Click.
- Source comparisons reference only old Down/Up enum members (field boundary numeric0/1). KeyType.CANCEL itself is API26; it is not accessed on API20. Older runtimes that do not deliver it rely on real window/lifecycle cancellation. Tests intentionally provide no CANCEL enum member.
- Return to foreground/focus does not replay input, recreate deadlines or Arm anything. Known held keys remain blocked until Up followed by fresh Down. OS key-repeat is not accepted as a new engagement after cancellation. F12 remains immediate while a focused app actually receives it, including text/IME/capture; this is not a global inactive-window hook. The fixed touch Stop is unchanged.
- Ordinary window focus loss cancels input work; it does not pause existing video, disconnect output or clear unrelated current output Arm. Application background/Stop retains its existing stronger shutdown policy.
- Already executed side effects cannot be recalled. Existing ordinary media-source connect operations already started by a shortcut follow their independent Stop/background/source-request lifecycle; this patch does not cancel them solely on window blur. It does cancel later actions in that keyboard batch. Existing output `connectOwned` and managed reload cancellations retain their dispatch ownership. No late completion may undo their own Stop/background/source replacement guard.
- No settings/schema change, permission expansion, auto-connect, auto-Arm, new input mapping or visual restructuring. The original182 action IDs /154of188 sites (110full-portable,44partial,34unwired) are unchanged.

## Verification scope

Actual `.ets` controller/native-boundary tests use mocked SDK window calls and a fake monotonic clock. They cover initial closed state, focus query failures, background/lateACTIVE, destroyed handles, stage replacement/late acquisition/cleanup, two actual instances of the same Ability class, uncreated Ability, normal final close, delayed old settings/load failure, native/root/preIME/editor Cancel, stale page handlers, same-window listener replacement, hold cancellation/fresh press, queued batch tail and F12. This proves application state handling, not OS event delivery.

Final official SDK build/source hashes and complete tests are recorded in VALIDATION.md and the frozen manifest. API20 and26 physical event delivery, phone/tablet/PC multiwindow/focus, IME, real USB/network/player behavior and rendered visual acceptance remain user-device validation. No physical device was connected for this increment.
