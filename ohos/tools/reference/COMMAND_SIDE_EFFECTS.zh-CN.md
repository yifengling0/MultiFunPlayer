# 原版命令副作用与 PlaybackSession 集成合同

依据固定上游提交 `36c08fbb99ac9398a63ff1cca1bbf68cd2228a94`。本表是源码调用关系审核；并未运行 WPF/Fody、事件路由或媒体后端。数值流水线/媒体处理函数的实际 C# 执行范围见 `README.md` 与 `source-manifest.json`。

## 1. 统一原则

- 原 `ResetSync` 只设置对应轴 `SyncTime = SyncSettings.Duration`，取消则置 0；不清除轴最终值、索引、Home 计时或 Transition（`ScriptViewModel.cs:790–819`）。
- 下列设置修改的 handler 不发布暂停媒体命令。实际播放/暂停是 `OnPlayPauseClick:1011–1014` 发布 `MediaPlayPauseMessage`，确认状态后 `Handle(MediaPlayingChangedMessage):576–587` 同步。因此应允许视频与参数同屏 live edit；不能继续以“修改任何参数就暂停”宣称 1:1。
- 同一不可变配置 revision 只 adopt 一次；比较实际值，只处理改变的字段。每帧 configure/resetSync 会使同步永远无法收敛。持久化 debounce 与运行态变化分离。
- 配置修改不是 seek、cold reset 或 stop。危险 profile/物理输出范围修改的 disarm 是 OHOS 的额外安全策略，单独记录；不能改变普通轴参数的媒体播放语义。

## 2. 全部 29 个 AxisSettings 字段

`SVM` 为 `Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs`。本表列显式 property 回调和 WPF UI handler 效果。除资源真正替换的行外，均不直接 invalidate index 或清除 Transition。

| 原字段 | 显式效果与证据 |
|---|---|
| `UpdateMotionProviderWhenPaused`, `UpdateMotionProviderWithoutScript`, `MotionProviderFillGaps` | property changed → 单轴 ResetSync，SVM1133–1153 |
| `BypassScript`, `BypassMotionProvider`, `BypassTransition` | property changed → 单轴 ResetSync；Bypass all 是逐一设这三个字段，SVM1324–1346 |
| `AutoHomeEnabled`, `AutoHomeTargetValue` | property changed → 单轴 ResetSync，SVM1133–1153 |
| `LinkAxis` | UI `OnSelectedLinkAxisChanged` 检查循环引用，恢复被拒值，再 `ReloadAxes(axis)`；Reload 无条件先单轴 ResetSync；异步发现/链接资源后走 SetScript，SVM1249–1276、932–953 |
| `LinkAxisHasPriority` | UI `OnLinkAxisPriorityChanged` → ReloadAxes；同上，SVM1237–1246 |
| `SmartLimitInputAxis` | UI 禁止自引用，然后单轴 ResetSync，SVM1279–1289；快捷动作也有显式 reset，1741–1752 |
| `UpdateMotionProviderWithAxis` | UI 禁止自引用，然后单轴 ResetSync，SVM1292–1302；快捷动作也显式 reset，1962–1973 |
| `SelectedMotionProvider` | UI preview selection change → 单轴 ResetSync，SVM1305–1312；不重建所有 provider phase/cache |
| `Offset` | UI `OnOffsetValueChanged`：轴上下文 reset 本轴，全局上下文 reset 全部轴，SVM824–837；索引由后续脚本更新自行修正 |
| `ScriptScale` | UI slider ValueChanged → 单轴 ResetSync，SVM1315–1322 |
| `InvertScript` | UI Checked/Unchecked handler 先单轴 ResetSync，再赋值，SVM1349–1359；XAML759–762 是单向绑定加显式 handler |
| `InterpolationType` | 无通用 property reset；UI仅 SelectedItem binding，`ScriptView.xaml:1447–1448`，快捷动作直接赋值 SVM1715–1718 |
| `SmartLimitPoints`, `SmartLimitMode`, `SmartLimitTargetValue` | 不在 property reset switch；UI/动作无单独通用 reset，下一次计算使用新参数 |
| `AutoHomeDelay`, `AutoHomeDuration`, `AutoHomeInsideScript` | 不在 property reset switch；不因编辑自动清 Home 计时，下一次计算使用新参数 |
| `LockScript` | 仅影响后续 SetScript 是否准许替换/清空；不主动重载、reset 或 pause |
| `MotionProviderBlend`, `MotionProviderMinimumGapDuration`, `MotionProviderSpeedLimitWithAxis` | 不在 property reset switch；下次计算使用新参数 |
| `SpeedLimitEnabled`, `SpeedLimitUnitsPerSecond` | 不在 property reset switch；下次计算使用新参数。`+Infinity` 是合法 unlimited；不得以 JSON null 丢失 |

### UI 与快捷动作的证据边界

`RegisterActions` 的 `UpdateSettings` 只调用 setter，没有统一 reset。例如 Invert SVM1725/1728、LinkPriority1735/1738、Offset1894/1899、Scale1906/1911、SelectedProvider1919 的动作没有额外显式 reset/reload；但已挂载 WPF 控件可能因绑定值变化间接发 ValueChanged/Checked/SelectionChanged。未执行 WPF，不能断言其最终运行时不会间接触发。OHOS 应明确实现上表的 UI 命令语义，并为快捷动作独立记录能力/差异，不能依赖虚构的 WPF 通知。

### Reload / resource / transition

- `ReloadAxes` 无论查到资源是否相等、Lock 是否挡住，都先 ResetSync。资源 store 只负责选择/传播；session 显式请求 reset。Link 配置确实变化时 pipeline 的 adopt 可合并此请求。
- `SetScript:886–918` 若 Lock 且已有非空资源，直接拒绝；同一引用资源也直接返回（两侧静态类型 IScriptResource，`==` 是引用相等，不能以 record.Equals 内容相等代替）。真正替换时才按 `SyncOnScriptResourceChanged` reset、`state.Index=InvalidIndex`，保留最终值，并传播 Link。新资源即使内容相等也不满足该引用相等早退；`ScriptResource.LinkTo` 每次产生新 wrapper，可导致替换、invalidate 与 Sync。`resource-identity` 模式以真实原类型实证接口比较false、record比较true。
- `SetAxisTransition:1213–1234` 从 finite 当前最终值或轴 default 起步，目标 clamp01，设置 transition；不是 cold reset，也不暂停媒体。

## 3. SyncSettings 全部 8 字段

`Duration` + 七个 `SyncOnMediaResourceChanged / ScriptResourceChanged / ScriptStart / ScriptEnd / MediaPlayPause / Seek / AutoHomeStartEnd` 没有统一 change handler。UI只有 Value/IsChecked binding（`ScriptView.xaml:134,168–198`），动作1994+同样直接赋值。

- 修改 Duration 不自动将所有计时重新设为新 duration；下一 tick 使用现有 SyncTime 与新 duration 计算进度。
- 七个开关改变未来对应事件的行为，不是立即 reset。
- 显式 Sync/Cancel/SyncAll/CancelAll 命令分别 `ResetSync(true/false, axes)`，SVM1617–1626。
- Home 开关名不能代替读代码：原 `SyncOnAutoHomeStartEnd` 当前数值实现是在退出 Home 时 reset；进入 Home 发 Home event，并非同样 reset。

## 4. Motion 参数与相位

`MotionProvider/AbstractMotionProvider.cs:34–44` 的 `OnPropertyChanged` 默认向目标轴发布 `SyncRequestMessage`。`Value` 有 `DoNotNotify`，不会逐帧重同步。`ScriptViewModel.Handle(SyncRequestMessage):713–716` reset 被请求轴。

| 参数/命令 | Sync 与 runtime 效果 |
|---|---|
| 共有 `Speed`, `Minimum`, `Maximum` | property changed 请求目标轴 Sync；不重置 phase。Minimum>Maximum 可反向映射 |
| Random `Octaves`, `Persistence`, `Lacunarity` | property changed 请求 Sync；保留 seed/noise 实例与 phase。seed 非持久配置 |
| Pattern `Pattern` | property changed 请求 Sync；保留 `_time` |
| Custom `Points` 属性替换 | 基类请求 Sync；`OnPointsChanged` 设置 pending refresh，下一 Update 重建关键帧；不重置 Time |
| Custom Points 集合内容增删 | `OnPointsCollectionChanged` 只置 refresh flag，没有显式 RequestSync；不能把集合内容修改与属性替换完全混同 |
| Custom `Duration` | property changed 请求 Sync；DependsOn Viewport → refresh；不直接重置 Time |
| Custom `InterpolationType` | 请求 Sync；没有设置 refresh。插值公式立即改变，已建 tiles 不因此重建 |
| Custom `IsLooping` | 请求 Sync；`OnIsLoopingChanged` 仅在 true 时恢复 `_playing`；没有 refresh，不重建 tiles |
| Custom `SyncOnEnd` | 请求 Sync；后续非 loop 结束是否发 Sync 由该值控制 |
| Custom `Reset()` | 原 ResetState(true) 将 Time=0、index=-1、playing=true；Time 的通知被 `ShouldSyncOnPropertyChanged` 排除，无直接 RequestSync |
| Custom 运行结束 | 非 loop 时 ResetState(false)、按 SyncOnEnd RequestSync、Value=NaN；本 oracle 已执行 |
| Looping `SourceFile` | property changed 请求 Sync；读取资源后 index=-1、time=scriptStart；文件加载/多轴选择未由本 oracle 执行 |
| Looping `InterpolationType` | property changed 请求 Sync，不重置 time/index |

依赖 WPF/Fody 的 property 通知只按源码移植；oracle 的 provider 宿主仅模拟必要 refresh，计数只覆盖 Update 里显式 RequestSync。不能把它的计数当作参数通知全链路已执行。

## 5. 集成命令 API 的最小职责

1. `applyConfiguration(next, changedFields)`：校验/active resolve；按表生成一次性 effects，再运行 adopt；不发 media pause。
2. `setScriptResource/reload`：先按命令语义 sync，资源引用有真实变化才 invalidate；Link store 不持有 pipeline runtime。
3. `observeNativePosition/observePlaying/observeSpeed`：交给有锚的 MediaPositionTracker；媒体命令与确认观测分离。
4. `step` 抛错（已验证 `dt=0` 下 speed limit Math.Sign(NaN) 源异常）时保留上一已发布 frame，关输出 gate，并在恢复前重置 private runtime；不要继续使用可能部分更新的内部轴状态。
5. `pause` 不等于 stop。已 armed 且用户明确允许 paused AutoHome/Motion 时可继续对应 intent；暂停动作默认权限关闭。Stop/Disarm/后台/断线/失效才统一清 arm。
