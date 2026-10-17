# 0.25 统一视觉验收清单

依据用户已认可的既有预览；不另创风格。此文件只读审查用，未改生产代码。

## P0：不能以好看换掉行为
- [ ] 示例图的「已连接、输出未启用、配置已保存、6个轴、L0、100%、0ms、示例文件」全部从真实state派生，不能照搬常量。
- [ ] 连接、启用、待命、正在输出、断开、故障、恢复只读分别显示真实状态；不能用绿点或选中项替代状态判断。
- [ ] 全局Stop常驻；全屏亦可到达；52vp热区，不受表单滚动/弹层/软键盘挤出。
- [ ] Video/XComponent唯一宿主不因tab、方向、折叠而重挂。使用原比例contain，不裁切、不拉伸。
- [ ] tab/折叠不自动播放、连接、Arm、清草稿或跳时钟；0.24 draftOwner、scope、epoch、回调所有权不退化。
- [ ] 原来的所有操作都有入口，尤其高级字段、失败重试、只读恢复和停止取消，不通过删按钮静默删能力。

## P1：统一tokens和按钮
- [ ] UiStyle统一 page/card #F5F6F8，field #FFFFFF，ink #1C2937，muted #647181，edge #DFE4EA，accent #236B73，accentSoft #E7F0F0，danger #B4434A，dangerSoft #F9EBED。
- [ ] 告警/成功沿语义色，若采用现有色亦统一；深色视频文字/图表多轴颜色等必要语义例外允许，不把所有hardcode机械替换成一种色。
- [ ] 页面/分区同背景，以线与间距分组，不恢复卡片套娃；单层pane padding，内容填充剩余宽度。
- [ ] 18正文、14辅助、20–22分组、22–24页头。不能为手机自动开启compact或缩到小字。
- [ ] 52vp交互尺寸；圆角12；仅当前主操作实色；次级白底边；三级文字/图标；选中柔色+文字/线；危险红色。
- [ ] 停止保持醒目，删除局部低权重；不要每个目标一整行红色删除。
- [ ] 顶栏与工作面融合，版本说明移入详情；不显示花哨色带、强外发光、大片霓虹。
- [ ] 所有按钮有pressed/disabled/focus区分；选中状态不只靠颜色，使用线/字重/图标及无障碍状态。

## P1：所有页面和组件均覆盖
- [ ] Index.workspaceHeader/globalStopButton/headerTools/workspaceStatus：精简标题和真实摘要，停止/更多；严重错误不藏起来。
- [ ] Index.videoStage/transport/timeline/markerPanel：统一播放、全屏、时码；轨迹、显示设置、章节、书签仍可达。
- [ ] Index.scriptArea/axisToolbar/axes：轴条；去掉重复模糊九宫格符号入口，改语义分组；实时轴值仍可查。
- [ ] AxisSettingsPanel：全部29字段保留，强度/偏移/反转优先，其余分组折叠。插值、链接优先级、混合、间隙、智能限幅、速度限制、自动归位不能遗漏。
- [ ] MotionSettingsPanel：每个provider、曲线/点表、增删改、单位、验证可达。
- [ ] SyncSettingsPanel：时长与全部事件触发开关可达。
- [ ] OutputSettingsPanel + Index.outputPanel：目标选择/独立状态/当前目标详情；所有原协议、串口USB扫描、连接、启用、断开、删除、范围设置仍可达。
- [ ] socketDiagnosticPanel：诊断开始/取消/结果、阻断连接和Arm状态可达；技术说明折叠不削弱必要警告。
- [ ] DeoVrSourcePanel + Index.sourcePanel：所有当前外部源、配置、重试及对应来源状态保留；不把不支持的源伪装可用。
- [ ] InternalPlaylistPanel + libraryPanel：Download/包名自动扫描与刷新；当前媒体/队列/匹配冲突/脚本库配置保留；不增加目录/视频导入入口。
- [ ] GeneralSettingsPanel：全部通用选项与真实偏好状态保留。
- [ ] InputSettingsPanel：快捷键/输入映射及关联编辑保留。
- [ ] DeviceSettingsPanel：配置、轴定义、导入导出/剪贴板等既有动作、恢复只读保护保留。
- [ ] CurvePointEditor的SettingsNumberField/TextField/ChoiceField/SwitchField/SectionTitle：共用风格。表单无重复已选值堆叠；长值完整查看/无障碍仍在；字段确认/取消保留。

## P1：响应式（代码测试≠视觉实测）
- [ ] 320/390vp手机竖屏：标题和Stop不撞；视频+transport之外有可用设置区；长中文/文件名不挤出操作。
- [ ] 手机横屏和低高度：不能沿竖排把设置压没；左右分区合理；按钮/输入在滚动可达范围。
- [ ] 平板竖/横：视频与Inspector同屏；右栏不会全宽表单拉得像广告条。
- [ ] PC窄/宽/窗口缩放：不固定窄max-width造成大空白；Inspector合理限宽，剩余给视频和轨迹。
- [ ] 软键盘和字体放大：当前编辑、确认/取消、全局停止可达；无裁切假装通过。
- [ ] 无视频/无脚本/无设备/加载/错误/只读恢复/草稿未保存场景都使用同一视觉语法。
- [ ] 实际ArkUI截图与真机状态另验；概念图只定风格，图中视频和滚动区比例不是断点正确的证据。

## 审查输出规则
实现后报告：阻断项、视觉偏差、已覆盖面板、未能验证项。引用代码文件与行号。只读审查，不改共享生产源码。没有真机截图就明确仍欠视觉实机验收。
