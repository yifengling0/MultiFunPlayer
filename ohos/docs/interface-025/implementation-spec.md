# MultiFunPlayer Harmony 视觉方案（待用户审批）

本文件为设计规范，不表示 ArkUI 实机验收或功能完成。预览为手写 SVG 经 Inkscape 转 PNG；未调用浏览器或改变生产源码。预览中的媒体、连接、保存与数值状态为示例。

## 判断

现状的问题不只是颜色。Index.workspaceSettings 把全部功能连续堆叠；axisToolbar 有九个类似权重图标，多个点击却展开同一区域；outputPanel 每个目标重复全宽选择、ID、删除；SettingsChoiceField 无条件再显示一次已选值。较大文字和触控尺寸在这种结构上放大了拥挤。不能通过缩字体、缩热区或删除功能修复。

## 视觉 tokens

- page/surface：#F5F6F8，同一连续工作面。只有可编辑字段用 #FFFFFF。避免面板内再套卡片。
- ink #1C2937；muted #647181；divider #DFE4EA。
- accent #236B73；accentSoft #E7F0F0。只用于当前主动作、选中态和有效轨迹。避免每个选择器都填 accentSoft。
- danger #B4434A；dangerSoft #F9EBED。全局停止使用实色；删除等局部破坏操作用红色文字，在相应目标详情/菜单内，保持确认逻辑。
- 主按钮可用极轻纵向渐变 #337C83 → #23636D，1px 顶部高光，不能大面积外发光。暗色/高对比适配单独验收，首轮只做本稿明亮基线。
- 正文18vp、辅助14vp、组标题20–22vp、顶栏22–24vp。密度只能是明确用户偏好，不随手机自动缩字。
- 点击热区至少52×52vp；图标24vp；Toggle视觉48×28vp但整行至少52vp。静态例图不能代表交互热区已验收。
- 单工作区内边距：手机16vp（窄于360可12），平板/桌面24vp；内部间隔8/12/16；组间24；左右面板分隔线1vp，别双倍padding。
- 按钮圆角12vp；输入框10–12vp；选中轴10vp。顶栏沿用工作面，没有彩色横幅。
- Primary：当前任务的播放/连接/启用之一（播放与设备启用不同语义，可各处一枚）；Secondary：白底薄边；Tertiary：文字/图标；Selected：柔色底+文字/线；Danger：只用于停止/明确破坏动作。

## 信息架构与现有代码映射

Index 保留唯一视频宿主。由 workspaceHeader + 播放器工作区 + Inspector 工具区构成。

| 入口 | 保留的现有组件/逻辑 | 展示改造 |
|---|---|---|
| 全局顶栏 | workspaceHeader/globalStopButton/headerTools/workspaceStatus | 简短应用标题、连接/输出摘要、常驻停止、更多。版本/移植说明/完整诊断移入关于/诊断。故障或未保存警告不能藏到更多。 |
| 播放区 | videoStage/transport/timeline/markerPanel | 维持视频实例与原始比例；播放、时码、拖动、全屏；宽屏视频下是轨迹和章节/书签。避免顶栏与播放器重复大停止按钮，但全屏仍必须有可见可达停止。 |
| 脚本 | scriptArea/axisToolbar/axes/AxisSettingsPanel | 轴名称条保留；替换九个模糊符号按钮。默认展开强度、偏移、反转与当前值。完整29字段进入明确分组：脚本与插值、轴链接与优先级、运动混合与间隙、安全限速、自动归位。完整轴值列表可展开。 |
| 脚本→运动 | motionPanel/MotionSettingsPanel/CurvePointEditor | 按provider展示相关参数、曲线点表和增删编辑，保留全部provider与验证；不要同屏展示无关provider字段。 |
| 脚本→同步 | syncPanel/SyncSettingsPanel | 顶部仅全局偏移摘要，展开过渡时长、触发事件。必须保留全部触发开关。 |
| 输出 | outputPanel/OutputSettingsPanel | 一行目标选择含名称、协议、连接/启用状态。先选择目标再显示详情。四种新增协议归到「添加输出」菜单（不能删串口/USB/TCP/UDP/WebSocket选项）；当前目标详情提供连接、明确启用，危险删除放详情更多。所有目标独立状态可见，不能以选中代表已启用。 |
| 输出→诊断 | socketDiagnosticPanel | 诊断子区，地址/端口、说明、开始/取消、结果按原语义保留。诊断阻断连接/Arm时需全局高优先级提示。 |
| 媒体 | sourcePanel/DeoVrSourcePanel/InternalPlaylistPanel/libraryPanel | 本地与外部来源选择；Download/包名自动扫描+刷新；媒体列表选片和自动脚本配对。不增加目录选择或视频导入。高级配对冲突/脚本库优先级保留在资源详情；列表当前项明显。 |
| 设置 | preferencesPanel/GeneralSettingsPanel/InputSettingsPanel/devicePanel/DeviceSettingsPanel | 通用、输入快捷键、设备配置三个子区；恢复配置/只读保护/失败重试保留显式状态。输入映射等不能因视觉简化删除。 |

所有程序状态与安全机制复用，不能用视觉状态替代。输出“连接成功”不等于“正在输出”，本地写入不等于硬件执行。图中“已连接·未启用”仅说明二者应区分。

## 表单组件改造

- CurvePointEditor.ets 的 SettingsNumberField/SettingsTextField：横向有足够空间时标签左、值右；否则上下排。保持 draftOwner/draftScope/draftEpoch、guarded callback、focus/keyboard handler 与当前确认/取消语义。
- 编辑后才出现局部「未应用 / 确认 / 取消」；未经确认不改变提交方式。改标签、间距不能把待提交值悄悄提交。
- SettingsChoiceField：白底选择器；重复值文本改成仅长值无法完整呈现时的展开详情，或始终完整换行显示选中值而不重复。未知/不可用但保留的值及无障碍完整值不能丢失。
- SettingsSwitchField：标签+开关单行，长标签换行；一行≥52vp，不让开关变成满行大按钮。
- SettingsSectionTitle：默认20vp适度字重+分隔线。顶层22vp；避免每两三个字段都像新页面标题。
- Accordion：行标题+状态摘要+箭头，明确选中/展开；进入页默认只展开高频部分。展开组需要保存状态，切换轴/工具不能错用其他轴草稿。

## 响应式与安全边界

1. 宽>=1000vp且高>=600vp：播放器与Inspector左右并列，Inspector宽度约34%，下限360，上限可到480；其余宽度给视频/轨迹。无整页最大宽度导致的空白窄列。Inspector独立滚动，视频不随表单走。
2. 中等宽度/平板竖屏：播放器上、Inspector下。保留四入口，设置滚动；视频高度参考原比例但需要max-height确保表单可用，视频在其stage中contain（不能拉伸裁切）。
3. 手机竖屏：如图。顶栏+视频+transport保持稳定，下面工具内容滚动。轨迹可在脚本首个分区按需展开；不能删除。小窗口/软键盘出现时可压缩视频stage并contain，而非挤没当前输入与停止。
4. 手机横屏/低高度：即使宽<1000也优先左右结构。Inspector至少300vp，视频用剩余区域contain；不足容纳时提供清楚的区域切换，顶栏停止和当前编辑可达。不要单凭方向直接放大所有控件。
5. 全屏：复用同一视频实例（移动/改尺寸，不能if/else重挂）；播放、停止、退出全屏维持52vp热区。若原生全屏不支持所需常驻安全入口，必须保留可验证退出与停止路线，不宣称已达标。
6. 导航/折叠只改变展示，不可触发播放、连接、Arm、源切换或时间重置；与0.24 draftOwner工作协调。读写保护、上下文epoch、关闭视图令牌等不动。
7. 长文件名、18vp中文、字体放大、320vp宽、窗口缩放、软键盘、高对比、错误banner应专门验收。禁止通过clip掩盖溢出。

## 实施次序

先用户确认本稿大方向。确认后先tokens及共享表单，再Index布局/入口，再面板分组；拆分提交，每步保留原行为。提供320/390/横屏手机/平板横竖/PC的真实ArkUI截图后才说视觉验收通过。目前只有SVG静态预览，无真机观测。
