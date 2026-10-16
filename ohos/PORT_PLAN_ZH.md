# MultiFunPlayer OHOS 移植方案（只读预研）

核实日期：2026-10-16。上游：Yoooi0/MultiFunPlayer；master提交：36c08fbb99ac9398a63ff1cca1bbf68cd2228a94。用户已完成fork：https://github.com/yifengling0/MultiFunPlayer。已核实parent和基线；开发在feature/ohos-port分支，保留原Windows工程。本文保留预研过程，当前实现和验证状态以README及实际构建记录为准。

## 结论与边界

这是原生重写与行为兼容移植，不是给现有WPF工程换一个目标即可编译。源码.csproj为net9.0-windows、win-x64、UseWPF=true；README中.NET8说明不能替代当前源码事实。建议保留原Source目录与MIT声明，新建ohos/目录承载ArkTS/ArkUI Stage工程。PC在此暂指运行HarmonyOS的PC，不包含新增Windows/macOS/Linux版本。系统最低API须以用户实际设备版本决定，不能由本机API26 SDK倒推出所有设备兼容。

## 依赖与迁移判定

| 原组件 | 已核实依赖/行为 | OHOS路线 |
|---|---|---|
| WPF XAML、Stylet、MahApps.Metro、MaterialDesignThemes | 绑定、事件聚合器、36px工具按钮、卡片与展开面板 | ArkUI原生组件重建布局和交互；保留视觉层级，不搬Windows程序集 |
| Script/FunscriptReader | actions、axes、章节/书签；at毫秒转秒；pos/100钳制；无效负时间忽略 | ArkTS解析器，严格大小/数量/数值校验；与上游测试对照 |
| Keyframe、插值、轴映射、运动限速 | C#纯算法夹杂应用类型 | 优先ArkTS纯逻辑模块；性能证据不足时不先引入C++，必要时再N-API |
| InternalMediaSource | 脚本播放列表和100ms时间源；不是视频解码器 | 独立单调时钟+播放器状态模型，测试模拟时间源 |
| MpvMediaSource、PotPlayer等 | mpv.exe进程启动、Windows命名管道/进程能力 | Windows本机集成不承诺兼容；网络播放器按协议另写适配器 |
| 本地视频 | 需新增OHOS播放承载 | AVPlayer+XComponent/原生画面，按SDK实际支持校验格式/状态事件 |
| TCP/UDP/WebSocket TCode输出 | .NET Socket、线程更新上下文、Stylet耦合 | 协议编码独立；Network Kit传输重新实现，默认仅模拟 |
| 串口、命名管道 | System.IO.Ports、Windows IPC | 命名管道不支持；USB串口另阶段调查设备型号、驱动和授权，不能假定任意COM设备可用 |
| Buttplug.Net | .NET库及协议版本约束 | 后续独立协议适配/兼容服务器方案；先定义受支持版本，不能拿套接字连通当功能兼容 |
| RawInput、XInput、System.Management | Windows专属 | ArkUI触摸/鼠标/键盘输入；游戏手柄能力另测 |
| C#动态插件 | Roslyn编译与.NET运行时 | 首版明确不支持；未来受限扩展接口，不下载执行未知脚本 |
| 文件、配置、受保护字符串 | Windows路径、Newtonsoft.Json等 | 系统文件选择器/授权URI、沙箱配置迁移；令牌不写日志 |
| MIT许可证 | Copyright (c) 2020 Yoooi | 保留LICENSE和版权；另审新加入依赖的许可证 |

## 三端交互方案

基于窗口可用宽高和输入能力响应，而非只看设备类别；平板分屏/PC窄窗口也进入紧凑布局。600vp、840vp可作为初始设计断点，最终以实测调整，不当作系统硬性标准。

- 平板/PC宽窗：复刻现有卡片、折叠面板、轴轨迹、媒体源与输出设置的视觉语言和信息层级；双栏/多栏并排，鼠标悬停可有提示，但关键操作必须触摸可达。保留键盘快捷键、焦点边框、可调整面板比例。
- 手机竖屏：单栏。上方当前媒体/进度，中间当前轴轨迹和主要参数；底部常驻播放/暂停、停止输出与页签。设备、轴、更多设置进入页签或底部面板，不把桌面所有控件缩小塞进屏幕。
- 手机横屏：低高度优先；轨迹/媒体与紧凑参数左右分栏，播放和停止始终可见；不强迫旋转，不能因横屏把动作按钮挤到屏外。
- 所有模式：主要触控目标建议至少48vp；拖动和滚动手势分离；滑条支持数值输入和微调；面板打开/关闭、键盘弹出、安全区及大字体均纳入测试。
- 旋转/窗口缩放只换布局，不重建时钟、解析器或输出会话；选择轴、未提交参数、播放位置和页面状态保持。前后台切换是安全事件，不能简单等同旋转。

## MVP架构与安全规则

建议目录：ohos/entry（Stage能力与页面）、ohos/core（Script/Timeline/Interpolation/Axis）、ohos/adapters（模拟、媒体、输出）、ohos/tests、ohos/docs。首阶段不引入重型跨平台运行时。

数据流：脚本解析 -> 标准化关键帧 -> 媒体位置/倍速/seek -> 插值 -> 轴范围与速度约束 -> 输出安全门 -> 模拟适配器。UI观察状态，不直接调Socket。

- 启动时模拟模式，物理输出未解锁；无自动连接和启动后恢复运动。
- 播放、连接、物理输出授权是三个不同状态；UI显示当前实际模式与连接状态。
- 暂停、后台、断连、异常、失去心跳均使输出安全门关闭，取消待发送队列。重新前台/重连不得自动恢复。
- “停止输出”立即停止发出新运动命令；若协议/设备支持，发送已验证的停止指令。不能声称断网后软件仍能让硬件停下，需设备端看门狗验证。不能默认发送回中指令，因为回中本身是运动。
- 限制每轴范围、速度、更新频率，软启动；seek/脚本切换清理历史插值和发送队列，禁止时间跳跃造成瞬时大幅度输出。
- 首版验收完全使用合成关键帧和模拟接收器，不拉取示例成人媒体，不驱动真实硬件。

## 里程碑及退出条件

M0：fork核验。确认fork.owner、parent、默认分支与基线SHA；在fork创建独立feature分支后才写代码。保留上游可更新关系。

M1：可构建离线模拟HAP。原生三端响应壳、合成脚本播放、暂停/seek、线性插值、单轴图表、模拟输出、安全状态机；保留MIT与构建说明。退出条件：核心测试通过、ArkTS编译及unsigned HAP打包通过、包内modules.abc/resource/module校验通过。unsigned HAP不是可安装签名包，也不代表真机运行。

M2：脚本与同步兼容。文件选择导入、多轴axes、元数据、轴映射、偏移/倍速、PCHIP/makima按原算法和黄金向量验证；大文件/异常文件有界处理。退出条件：对照测试覆盖重复时间、乱序、空数据、越界、非有限值、seek边界及多轴差异。

M3：一个网络输出和一个媒体适配器。先选用户实际使用设备/播放器；TCP/UDP/WS不同时铺开。模拟接收器验证帧格式、节拍、断线、重连后必须重新解锁。真实设备测试需明确设备及操作授权。

M4：OHOS本地视频与真实机型。AVPlayer状态同步、文件权限、音视频倍速/seek/结束；手机横竖屏、平板分屏、PC自由缩放、鼠标键盘。覆盖实际设备最低系统版本、CPU架构、字体、软键盘及后台限制。

M5：扩展与发布。其他网络播放器、协议、USB可行性；性能长测、签名、分发。签名账号/证书/配对需用户按系统流程授权，不能自动生成持续访问凭据。

## 构建与兼容性范围

使用官方HarmonyOS CLI26 / API26 SDK；Node24、Hvigor6.26.8、JDK21。实际构建记录见VALIDATION.md。低内存环境建议单worker、memory优化，项目已保存对应配置。未生成签名密钥、未安装或启动真机应用。最低兼容API20配置不代表已实测所有API20设备。Windows原工程保持不变。

## 核实来源

- https://github.com/Yoooi0/MultiFunPlayer/blob/36c08fbb99ac9398a63ff1cca1bbf68cd2228a94/Source/MultiFunPlayer/MultiFunPlayer.csproj
- https://github.com/Yoooi0/MultiFunPlayer/blob/36c08fbb99ac9398a63ff1cca1bbf68cd2228a94/LICENSE.md
- https://github.com/Yoooi0/MultiFunPlayer/blob/36c08fbb99ac9398a63ff1cca1bbf68cd2228a94/Source/MultiFunPlayer/Script/IScriptReader.cs
- https://github.com/Yoooi0/MultiFunPlayer/blob/36c08fbb99ac9398a63ff1cca1bbf68cd2228a94/Source/MultiFunPlayer/MediaSource/ViewModels/InternalMediaSource.cs
- https://github.com/Yoooi0/MultiFunPlayer/blob/36c08fbb99ac9398a63ff1cca1bbf68cd2228a94/Source/MultiFunPlayer/MediaSource/ViewModels/MpvMediaSource.cs
- https://github.com/Yoooi0/MultiFunPlayer/blob/36c08fbb99ac9398a63ff1cca1bbf68cd2228a94/Source/MultiFunPlayer/OutputTarget/ViewModels/TcpOutputTarget.cs
- https://github.com/Yoooi0/MultiFunPlayer/blob/36c08fbb99ac9398a63ff1cca1bbf68cd2228a94/Source/MultiFunPlayer/UI/Controls/Views/ScriptView.xaml
- https://developer.huawei.com/consumer/en/doc/harmonyos-guides-V14/multi-window-layout-adapt-V14

本方案中的断点、MVP范围和工程分层为设计建议，不是已完成实现。
