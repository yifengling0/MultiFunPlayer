# PlaybackSession → OutputCoordinator 授权合同

本文描述 0.8.0 网络输出集成。原冻结的 0.7.0 HAP 不包含这些接线且保持原样。当前 Index 已接 TCP / UDP / WebSocket；本文不代表真机或物理设备验证。

## 读取、帧与目标范围

`PlaybackSessionCore.dispatchSource(enabledAxisNames?, updateKind="fixed")` 是只读操作，不推进媒体钟、Motion、轴流水线或事件序号。它返回已完成的同一帧身份，以及目标启用轴的真实轴值和原始事件子集。缺省范围为当前设备全部启用轴。空范围、重复轴、未知轴和设备禁用轴不产生授权。

授权包含与目标精确绑定的 `updateKind`（fixed / polled）、`sourceConfigurationRevision`（单调递增的 session 配置与资源/控制变更总 revision）和 `authorizedAxes`，输出层要求其集合精确等于目标配置的启用轴集合。目标禁用轴本身不能阻断其他有效输出；但所选轴实际使用的 Smart Limit、Follow、Sync、Home 起点等跨轴/历史依赖仍必须已知，不能因依赖轴没有输出就跳过检查。不会为缺失或非有限值制造默认输出。

已提交帧的 epoch、profile revision、pipeline configuration revision、session configuration/control revision 必须对应当前状态。换源、seek、stop、后台、恢复均不能给旧帧重新贴上新身份。Fault 恢复仍要求新 pipeline、Motion registry、设备 registry 和 epoch。

## 来源证据

`AxisFrame.provenance` 记录实际执行分支、最后赋值来源、实际参与的历史/控制依赖及来源代次。中间 `scriptValue` / `motionProviderValue`、最终数值相等或 `isAutoHoming` 标记本身不是发送授权。

- `activePlayback`：当前真实 playing 状态下，已配置完整流水线的已知来源，包括 Script、Motion、Home、Transition。
- `pausedAutoHome`：本帧 Home 实际赋值且其贡献保留至最终值。原版 t=0 时 `isAutoHoming=true`、但未实际写入的边界不会产生该授权。
- `pausedMotion`：本帧调用了 provider，并由真实 provider 写入观察确认产生样本，且 Motion 贡献保留至最终值、该轴配置允许暂停更新。
- 仅持有同 epoch 旧值不单独产生新的活动授权。未知来源、失效的直接 provider cache 或未知依赖均关闭授权。当前帧身份必须是当前 epoch；只有下述经证实的原算法历史标量锚点可以跨媒体 epoch。

`provider.update()` 调用不等于产生新样本。Looping 缺资源、空脚本/无双点，以及 Custom Curve 空点/已结束等 no-op 路径不能把旧 cache 变成新来源。Session 对配置、Looping 资源注入/清除、Custom Reset 做来源失效通知；该通知不改变原数值、phase、cache 或 ResetSync 副作用。

## 已知历史标量锚点

默认 Sync 为 4 秒，但 live edit 不会因此停发 4 秒。当前原算法明确执行 Sync、Home 起点、Transition 起点、SpeedLimit/SmartSpeed 旧值分支时，pipeline 在每个来源上附加 `AxisHistoricalAnchor`，保留实际已知标量的来源 axis/frame/epoch/profile/config 与本次消费者 frame/epoch/profile/config。Session 逐项核验明确允许的 position role、sourceStatus=known、同 active profile 与当前消费者身份；跨 epoch/config 的直接依赖必须与具体锚点身份匹配。

已知历史标量在明确消费分支压缩为一个 historical 摘要，保存标量原 frame/epoch/profile/config、扁平 sourceKinds 与 sourceProfileValid，不递归展开每次 slider 旧配置。连续编辑因此不会耗尽 origins 预算。摘要只能通过当前可信 anchor 使用，不能单独充当当前活动；direct/cache 的未知、代次和配置证明保持原样，未知标量不能压成可信摘要。

这允许当前有效 Script/Motion/Home/Transition 活动沿原软同步轨迹继续输出，包括 seek/reload 后的首个当前帧。旧帧本身仍不可授权；旧 callback、无锚点的旧 cache、过期锚点和未知源不会被升级。同一来源同时作为缓存和数值锚点时保留两条路径，失效缓存仍使授权失败。仅有 held/cache 不产生新的 activePlayback 意图；暂停仍须真实 Home 或已确认新 Motion 样本。新 profile 不允许借用这些锚点。

## 上一帧控制输入与保留 Motion 样本

Smart Value/Speed 和 Motion Follow 的跨轴控制读使用独立 `AxisControlInput`，不冒充 position anchor。记录实际引用轴、上一完整 read frame、value/activity/speed 的原生产样本、当前 consumer 轴与完整戳；当前配置必须确实引用该轴。控制源必须 known、同 profile，且当前 script binding / resource / selected provider generation 仍有效。dirty 比较较旧的初始 none 只证明非有限分类，不变成已知数值。摘要有界，双方真实脚本的循环引用按上一完整帧启动，不递归请求本帧授权。

原 Follow 门控合法 skip provider update 时，可以在当前实际 read/blend 中继续消费已知 retained cache。必须有本次 `motionCacheValidated`，证明 observation/cachedValue/provider/config/resource/write generation 与记录完全匹配，并匹配本帧 motionCache 依赖。生产帧和写入 generation 保持原值，读缓存不会刷新生产时间。跨轴控制引用同样重验真实身份，不要求正常保留值每帧重写。失效引用或未知缓存不能通过重读恢复资格。

control 与 retained cache 本身都不提供本轴新活动；playing 仍需当前真实活动来源，paused Motion 仍需已确认新 sample，Stop/后台仍关门。来源无效后恢复数值资格也不会自动 arm。

## Fixed 标量与 Polled prospective event 分离

Fixed 继续要求最终标量的完整来源证明。Polled 消费的是本帧 pipeline 真正产生的原始 prospective event：逐项核验当前 epoch/sequence、启用目标轴、有限目标/时长；Home 另核验当前轴已进入 Home、当前配置 target/duration 完全一致。t=0 时标量尚未移动，但原版唯一 Home 命令已经产生，因此 Polled 可在原时刻发送该事件，Fixed 此时仍不产生 Home 活动授权。暂停 Polled 只保留真实 Home 事件，并受目标 pausedAutoHome 政策限制。

Polled playing 无事件帧可以供用户明确 arm 等待，输出为空，不读取其标量；之后每个新事件仍须自身当前帧授权。暂停未知 Motion cache 且没有真实事件不会制造 Home 授权。事件保持原对象身份、序号、目标、时长，不缓存改戳补发或从最终轴值伪造。OutputSession 和 Coordinator 验证 updateKind，Polled-only 许可不能用于 Fixed 或 File scalar 记录。

## 时钟

原生视频的 playing 授权捕获本次实际 step 使用的已确认 AVPlayer 观测时间，且要求当前 native gate 有效。后来的观测和 watchdog snapshot 不能给旧帧更新授权时间。Seek、buffer、无效观测、错误和 stale 门控继续生效。

内部脚本播放器的实际 tick 是该内部媒体钟的观测。暂停 Home/Motion 使用本帧实际 monotonic tick，不要求已暂停的视频继续发送时间观测；原生暂停须先确认，等待 play/pause 切换时不发送。OutputSession 在真正写入前再次按其显式 frame/clock age 预算检查新鲜度。

## 暂停候选与解除 armed 的区别

`availability` 区分三种情况：

- `ready`：具有当前帧、当前范围授权。连接和显式 armed 仍须分别满足。
- `pendingCurrentFrame`：仅限已知同 epoch/profile 的暂时等待，例如 live edit 后尚未提交当前配置帧、控制切换待当前帧，或暂停但暂时没有真正 Home/Motion 活动；原 Follow 的 maxSpeed=0 把所有当前活动贡献覆盖为上一标量时也属于纯 hold。Coordinator 清除旧 latest/pending/event 候选并使旧发送代次失效，保留既有显式 armed；不允许用户在无授权时新 arm。下一合法帧可继续，不需因每次 slider 编辑重新 arm。
- `invalidated`：未知/失效来源、错 epoch/profile、Stop、Fault、后台、失效 native 状态等。解除 armed；之后出现合法帧也不自动重新 armed。

即使资源变更与后续 tick 之间没有调用 refresh，有效 source revision 变化也会清除旧候选、递增 gateRevision；旧回执不能提交 lastWritten 缓存或重新泵出旧 pending。没有 availability 的旧调用方按 invalidated 处理。`pendingCurrentFrame` 不是继续发送旧值的许可。若流式写入已有确认前缀、却未完成整条命令，失效候选仍保守关闭连接，不能在半条命令后拼接新命令；不能承诺设备已经停止。

## 0.9 同源 seek 的 armed 意图事务

普通 epoch 失效仍解除 armed。仅显式同源 seek 允许有界的特殊交接：Core 先 `beginSeek(nowMs)`，同步发布 `OutputSeekTransition`；调用方随即、在启动异步播放器 seek 前调用 `OutputCoordinator.beginSourceSeek()`。事务绑定严格递增 `requestId`、Core 所有的 `sourceIdentity/sourceGeneration`、`previousEpoch/currentEpoch`、profile revision 与有限单调 `deadlineMonotonicMs`。Coordinator 还核验这些来源与最初显式 Arm 的来源一致。缺少来源绑定的旧调用方不能使用此交接。

- begin 只保留已存在的明确 armed 意图，不调用 Arm，也不能从未 armed、Stop 或已撤销状态获得 armed。只在 refresh 看到 pending 或只有 confirmed 证明，不足以捕获意图。重复 request 不改变事务；同源更高 request 的新显式 begin 可替换尚有效事务，旧确认不能完成新事务。
- pending 立即清空 fixed latest/pending 与 polled 队列，递增 gate revision、清 dirty cache 并暂停 fixed scheduler。`seekPending` 表示 armed 意图仍在、但输出门关闭。所有 submit、tick、pump 均不能发送；已提交传输的旧回执不能提交 lastWritten 或恢复旧候选。已提交字节无法撤回，完整/短写回执仍按原规则核算和处理，未知超时或半条 stream 命令仍关闭连接。
- pending 内仅暂时容忍 seek 本身造成的旧帧/媒体证明失效，仍核验前台、无故障、未 Stop、同 source/generation/profile、同 request 与原 deadline。原生 `seekDone` 必须由 Core 按真实 native generation/seek sequence 确认；内部时钟仅在真实设置目标位置后确认。输出层不能用 seek promise 返回、数值相等或旧帧推断确认。
- confirmed 的 epoch 可因真实 native 位置观察再增加一次，但首次确认后被冻结；同 request 不能退回 pending 或再次换 epoch。确认本身仍不发送：需要 `availability=ready`、确认 epoch 的完整新帧，以及精确 enabled axes/updateKind/sourceConfigurationRevision、真实来源/时钟/新鲜度与目标暂停政策全部通过。只允许旧帧或 `pendingCurrentFrame` 暂待新完整帧，不能给旧帧改戳。恢复通过 Session 的既有意图交接，绝不重新调用 Arm。
- Stop、Disarm、Disconnect、后台、换源/来源代次、profile 变化、Fault、cancel 或超时永久撤销该次意图；晚到确认和后来合法帧不能复活它。Session 独立按原 deadline 定时撤销，不依赖 UI refresh；确认但还没有新帧也不能延长 deadline。过期后用户仍可对当前合法帧重新明确 Arm。

此事务不改变 `pendingCurrentFrame` 的同 epoch live-edit 合同、不放宽 exact authorizedAxes/updateKind 或 source revision gate、不绕过旧连接 generation 的关闭隔离。Fixed 恢复重新起算调度间隔，seek 等待时间不会变成长运动时长；Polled 只消费当前新帧的真实原始事件。

`tests/output-seek-transaction.test.mjs` 以 MemoryTransport 覆盖 fixed/polled 队列清理、旧回执、未 Arm、显式/隐式 begin、双重 epoch、快速重复 seek、旧/重复/篡改确认、生命周期撤销、deadline、范围/revision 和 stream 部分提交。它不证明原生播放准确性、网络或物理设备成功。

## 验证边界

`tests/playback-session-dispatch.test.mjs` 覆盖真实 Session 来源、原生观测代次、暂停 Home/Motion、no-op cache、依赖、范围、配置/控制/epoch 变更，并使用真实 OutputCoordinator + MemoryTransport 验证 live edit 暂停发送后恢复与 Stop 必须重新 arm。Index 已使用真实 NativeOutputCoordinator 与 OutputSettingsPanel。Node 验证实际页面 controller、Ability 生命周期及原生 SDK mocks；单元测试与 SDK 编译不构成实际网络、真机播放或物理设备执行成功证明。


## 原生关闭确认

OutputSession 将实际 open/handle generation 与用于失效回调的逻辑 generation 分开保存。失败后的 close 重试始终指向原句柄；不能用从未打开的新 token 得到虚假的关闭成功。取消 pending open 后，必须等待 open 终结并再次清理原句柄，才可确认关闭或创建下一连接。

原生 close 失败/超时保留隔离记录，后续同代或未知代 close 均不能抹掉该事实；当前适配器要求重启应用后再连接。Session、Coordinator 和 factory 身份注销均检查真实 canRelease/closeConfirmed。成功本地关闭也不意味着已提交的字节被撤回或物理设备停止。


## 应用与界面接线

媒体播放、来源准备与网络输出连接独立。未连接设备仍可看视频/脚本预览；断开网络只解除输出，不调用媒体 pause。连接与 arm 都是单独的明确操作，输入目标默认为空，无自动连接/恢复 armed。输出连接、写入次数/字节来自实际 coordinator，UDP connected 仅表示本地绑定。INTERNET 为普通声明权限，没有添加文件/剪贴板宽泛权限。

EntryAbility 后台或销毁先同步关 output gate，不等待界面 Storage watcher。正常 Ability 在同进程重建时保留一个已关门 coordinator，允许用户在真实 close 确认后重新连接；不抹掉 quarantine，也不自动重连。页面消失同样关门。设置 readonly/recoveryRequired 时拒绝 arm。所有预算是应用准入策略，不是硬件安全认证。

输出草稿保存在应用进程内单一 owner，面板只接收受控快照并回传编辑；宽窄布局、视频模式和旋转重建不清空端点、禁用轴范围或 updateContext，重复 appear 不重设 ranges。真实应用身份由 coordinator 成功连接后签发的递增 configuration ID 决定，界面与父级 arm 都核验当前草稿 ID；不用组件本地 applied 布尔冒充成功。异步旧面板回调不能覆盖较新编辑。草稿不持久化，进程退出后重填。折叠使用 visibility，不把打开面板当作编辑而 disarm。目标协议/range/paused 策略实际编辑会解除发送，应用后需再明确 arm。源/epoch变化和故障也会解除发送，profile revision变化还需重新应用目标配置。File记录/playlist/原生窗口全屏仍是独立后续接线阶段，不因模型或库已存在就视作当前UI功能。

独立无媒体/无脚本 Motion 入口仍属下一阶段：Stopped 状态下单独 arm 不会启动 Pattern/Random；未来需独立明确动作进入运动会话，不能靠暂停策略或后台恢复绕过 Stop。当前 provider 数值与会话内 Motion 已接，不代表该独立启动流程已验收。

### 真实 unknown 历史的显式恢复

真正 unknown 的旧标量若持续参与 SmartSpeed/限速或循环控制混合，换回有效资源也可能持续无授权；不能为了恢复发送把它洗成 known。这不限于循环。Stop、普通重新打开媒体保留数值历史，不能保证清除此状态。

0.8 已可达的显式恢复是“刷新 Download 媒体文件夹”：先 Stop 输出/清候选，再清源并重建 MotionRegistry、AxisPipeline、registry revision 和 epoch，重新扫描/验证 Looping 资源。刷新会重置 provider 相位，是已披露的安全差异。之后须重选媒体、明确 Play、重新应用输出配置并 Arm；不会自动恢复发送。故障面板另有 Reset runtime and clear source，但普通来源无授权时不显示该面板。后续可增加更直接的独立重置入口，当前不隐式重建。
