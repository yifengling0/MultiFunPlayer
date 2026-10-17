# 0.18 DeoVR integration contract

This candidate adds one real media source, with a native TCP receiver and actual framed commands. No device or remote player endpoint is contacted during validation. The retained original source and exact executable vectors are audited separately in DEOVR_018_SOURCE_AUDIT.md.

## Ownership and clocks

- Restored source selection and endpoint are preferences only. Connect is explicit; it does not connect or arm any output target.
- One active media owner: Download/native video, Internal script clock, or DeoVR. Switching retires the previous asynchronous source before admitting another. Every connection, packet, script match, command and close belongs to its connection/resource generation.
- DeoVR observations are not AVPlayer snapshots. Received currentTime anchors the existing original MediaPositionTracker; its original internal/public smoothing remains unchanged. Snapshot reads, commands, heartbeats and send completions never produce observations.
- Original message order is path, playing, duration, position, speed. Changed fields emit original messages; unchanged accepted currentTime still provides a separately identified receipt. The media tracker does not repeatedly smooth toward a duplicated observation.
- A new remote path invalidates old output and pending script reads before matching. Remote path text is metadata only. Only catalog entries from the existing authorized Download root and configured managed script catalogs may be read. No remote path, URL, basename or endpoint grants local filesystem access.
- Freshness is local receipt evidence, not a claim of a server timestamp. A playing position that stops changing is independently gated; merely receiving duplicate packets cannot advance the clock indefinitely. These bounded safety checks are a disclosed difference from the original unbounded stream reader.

## Controls and safety

- Play/pause, speed, seek and path commands serialize the original five-property JSON shape. Successful send only means local submission; the UI waits for actual incoming state.
- This first remote adapter also stops/disarms output on explicit play, pause and speed commands; those commands do not retain prior Arm. This is a conservative difference from original live controls and requires a new explicit Arm after valid received state.
- Every remote seek immediately stops/disarms physical outputs and retires queued fixed/polled frames and receipts. No native seek confirmation or resumable OutputSeekTransition is fabricated. A later fresh source frame can be previewed; output requires another explicit Arm. AB and AutoSkip route through this same rule.
- Stop synchronously revokes processing and all output admission before asynchronous remote close work. Later packets or command completion cannot undo Stop. Explicit Play or Connect is required to resume preview; reconnect never restores physical Arm.
- Background, view/stage destruction, source change, reset, connection failure and uncertain cleanup revoke output and media admission. An unconfirmed native close is quarantined, preserving exact socket identity and refusing replacement rather than reporting a false disconnection.
- Live settings edits and restoration cannot implicitly connect, send commands or arm. Endpoint changes retire the old source. Read-only recovery settings remain visible; mutation is refused.

## Verification gates

Source audit and pure framed-stream fixtures; chunk/coalescing/UTF-8/size/invalid JSON checks; original C# field and wire comparisons; real core/session and extracted ArkUI controller tests; delayed connect/read/send/close cancellation and late callbacks; target scope/epoch/source revision and no-auto-arm regression; source matching through real catalog parser; independent review; full .NET-enabled Node aggregate and official clean SDK HAP; immutable source/artifact/hash evidence.

Not included: other remote-player protocols, server-correlated seek acknowledgements, real-player/physical-device interoperability claims, File recording, Git publication, extra directory or single-video import flows.

## Declared parity boundaries

The portable packet domain is deliberately stricter than Json.NET coercion: bounded strict UTF-8/JSON, exact primitive types, finite time/speed and endpoint/path validation. Original numeric-string and boolean-path coercions, nonfinite acceptance, unbounded allocations and negative direct seeks are not reproduced. Oracle command-byte comparisons run under the retained Linux .NET runtime with LF formatting; they do not prove Windows CRLF bytes or WPF scheduling. These differences and the complete original source chain are itemized in the source audit.

Connection commands have a real controlled touch and keyboard route, but restoring source preferences remains inert, endpoint edits retire an existing connection, and source changes cancel pending shortcut batches. The original Windows process check/automatic connection and every source-template expansion are not claimed. Current generic media-speed UI remains in its existing 0.25–4 range; valid received source speed is represented independently. Remote Reload is bounded to the current authorized Download catalog; it does not grant a remote path or broaden directory access.
