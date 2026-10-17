# 有锚媒体位置跟踪：原算法与 OHOS 边界

固定上游 `ScriptViewModel.cs:147–156,576–587,601–651,1030–1036` 的方法体已原样抽取并在 .NET 9 执行。`generate_clock_cases.py` 生成独立 `clock-golden.json`；区别于指定位置采样的 pipeline oracle，该模式不在调用前抵消源帧推进。

## 原算法（全部秒）

- 首次有效位置观测时，public position 非 finite：ResetSync(all)，将 internal 与 public 同设观测值。初始 NaN 在没有观测时保持 NaN，不应凭 timer 自造媒体起点。
- playing tick：`internal += deltaSeconds * playbackSpeed`；`error=internal-public`；`public += clamp(error,deltaSeconds*speed*0.9,deltaSeconds*speed*1.1)`。每次轴取样使用推进后的 public。
- 原位置消息为 TimeSpan，先取 TotalSeconds。已有 public 时 `error = finite(internal) ? observed-internal : 0`。
- `abs(error)>1.0` 或 ForceSeek 才是 seek；恰好 1 秒不算。seek 按 SyncOnSeek 请求同步，并直接同时替换两条位置；落在 loopStart−1 或 loopEnd+1 及以外会清 loop。
- 普通小误差观测只 `internal += 0.33*(observed-internal)`，不直接覆写 public。下一 playing tick 用 0.9–1.1 速度区间渐进追赶。
- playing 值真正改变时才按 SyncOnMediaPlayPause 同步；重复同值无作用。暂停不推进 public；暂停期间小误差观测仍可修正 internal。
- speed 观测只更新 speed，无 ResetSync。

## 单一集成者合同

`MediaPositionTracker` 纯逻辑拥有 internal/public 秒值、confirmed anchor、单调观测时间、generation；`PlaybackSession` 负责播放器状态/配置effects/输出 gate。外层继续用明确 `...Ms` 字段，进入 tracker/pipeline adapter 唯一除以1000；source speed 不得又乘一遍。

推荐 `observe({generation,positionSeconds,observedMonotonicMs,forceSeek})` / `setPlaying(confirmed)` / `setSpeed(confirmed)` / `advance(deltaSeconds)` 返回 public 秒值及 sync/seek effects。仅确认 native 观测建立 anchor；本地 seek 请求先清旧 generation 的可用性，等待对应确认，不用目标位置伪装确认。source auto-detected seek 的效果与 UI seek 的请求门控分别处理。

OHOS 安全差异须单独保留：无 anchor、buffering、seek pending、后台、播放器失败、过期 native 观测不得继续授权 scriptPlayback 输出。短观测间隔允许原算法平滑；超过既定 stale 阈值关 gate，不能无锚自走。暂停 Home/Motion 的新鲜度来自单调引擎时钟及可用媒体会话，不要求暂停的 native position 持续移动。断线/后台/Stop/Disarm 使 arm 失效；Pause 不自动等于总 stop。

禁止把现有只 hold 最新 native position 的 MediaClock 直接接完整流水线后称时钟1:1。此文件提供移植与回归合同，不修改现有播放 Surface/下载逻辑。

## Oracle 边界

原 source 内部算法与三个消息 handler 确实执行，连同原 ResetSync、SetMediaPositionInternal。宿主用 TimeSpan.FromSeconds 构造消息，提供 fake loop start/end/clear、静默日志与 property 通知；无 AVPlayer、WPF事件循环、墙钟采样、buffer/stale/background或物理输出。11个场景涵盖 NaN初始、稀疏观测、小正负误差、精确1秒阈值、seek/forceSeek、倍率、暂停/恢复、重复状态、关同步、loop边界。结论只能覆盖这些已执行算法。
