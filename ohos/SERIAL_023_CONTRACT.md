# 0.23 串口接线合同（实现与验收合同）

## 原版证据和范围

原版 `Source/MultiFunPlayer/OutputTarget/ViewModels/SerialOutputTarget.cs`：端口按 DeviceID 选择；默认 115200 / 8N1 / Handshake.None / DTR=true / RTS=true；读写 timeout=250ms，读写 buffer=4096/2048。连接真实 Open 成功后才 Connected。Fixed / Polled 使用现有 TCode 格式和逐轴范围，接收另交 TCodeInputProcessor。保存端口和参数，不保存句柄。对应 `Views/SerialOutputTarget.xaml` 限制连接期间换端口与更新方式。

本阶段沿用已验证的共享编码、范围、Fixed/Polled、逐目标身份与 Connect→Arm 门控。后端独立实现，只有审查与真实可达 SDK 编译通过的能力可接线。没有实际 USB 硬件验收，也不把本地 acceptedBytes 当设备执行 ACK。

## 后端及能力

- `official26`：实际 `SystemCapability.BusManager.Serial`，SDK26，主要 PC/2in1；原生端口、DTR/RTS 可设置。
- `official19`：实际 `SystemCapability.USB.USBManager.Serial`，API19，主要 PC/2in1；无 DTR/RTS 设置。保留默认 true 后必须拒绝不支持的请求。用户明确选“接受系统管理”才存 null，不静默降级。
- `ch34xWriteOnly`：用户主要需求。只接受已证明的 CH340/341 VID/PID、接口/端点、版本与初始化序列。实验性仅写部分实现；IN 未证明而禁用，不能宣布完整串口/芯片通用支持。已按独立审查与明确授权开放窄白名单实验仅写：VID1a86/PID7523或5523、单class255接口/无alt、配对端点、ROM0x30。pinned MIT实现并不要求额外subclass/protocol白名单，不臆造未证实前置。仍不以PC后端代替手机USB需求。
- `usbCdc`：短包/IN 语义仍未证明，保持不可连接，并显示原因。
- 不把 CH343、CH9102、CP210x、FTDI 或任意 bulk 设备当已支持 UART；未知设备不列为可连接候选；无匹配时保留空列表与支持范围说明，可由用户提供系统 USB 信息。只读探针仅覆盖本次支持 ID 的候选，不声称枚举诊断所有 USB 芯片。

## 共享合同与归属

后端 owner 独占 `output/serial/**` 与 `tests/serial-*`。主集成人拥有 OutputCoordinator/NativeTransportAdmission/NativeOutputCoordinator、settings/OutputConfiguration、NativeOutputSession、输出面板、Index 和集成测试。

后端 `NativeSerialFactory` 提供：

- `inspectAll()`：仅检查本机 syscap，不枚举、授权、开句柄或发送。
- `listPortsExplicit(backend)`：只能由用户主动刷新调用。返回有界 `SerialPortOption { backend, portName, portId, label, vendorId, productId, writeOnly, controlLines }`，不请求权限、不打开。
- `create(selection, attributes, limits)`：可以异步导入模块，但只创建 inert TransportPort。权限/打开必须在该 port 的 `open` 内。
- 创建后由集成 factory 注册 `serial` 原生 admission，绑定 `canRelease()`；任意伪 marker 不获放行。

`OutputPortFactory.create` 兼容同步/异步结果。Coordinator 在 await 前复制配置与 endpoint；返回后重新检查请求/前台/源状态，取消的迟到结果不得 open、自动 arm 或替换当前目标。惰性创建必须没有原生资源；已创建 port 按 identity 释放。权限等待期间的取消、真实已发 I/O、失败关闭继续由后端隔离，不能把 JS timeout 当 abort。

## 配置、枚举和 UI

- 每种目标最多10个；serial:index 独立目标。目标切换只切 UI，不改变其他已连接目标。
- 保存 backend、portName 提示、baudRate、8N1、no-handshake、DTR/RTS（nullable）。不保存 portId、枚举 token、权限、句柄、connected、armed 或后台恢复资格。
- schema1 additive：旧网络配置缺 serial 字段仍按原值读取；未知字段/非有限/超范围拒绝。端口只是有界提示，不是文件路径读取权限。没有任意路径输入读取或新增导入。
- 恢复配置只创建 inert owner 和草稿。不得枚举、申请权限、连接或 arm。
- 用户刷新后选择本机列表；Connect 重新枚举并精确匹配当前端口。19同名+本轮id在 open 前再核对；26 exact portName。相同名称可被拔插复用，不能伪称已获得稳定物理设备身份。
- 修改 backend/端口/串口参数/目标 scope 立即 disarm、清旧候选与应用身份；连接时参数编辑需重新应用。刷新/迟到列表不能改另一 target generation 的草稿。
- 手机/平板/PC全宽、52vp控件、固定全局Stop；不添加目录/单视频导入，不声称已确认 HMOS 工坊具体参考。
- 状态明确：不支持 / 未枚举 / 未选端口 / 待系统授权 / 已打开但未启用发送 / 待命无输出 / 发送门开放 / 拔出或错误 / 关闭未确认。只展示有据可判状态，不从 Promise pending 猜测系统弹窗。
- 接收字节不接快捷键或其他动作，尤其 CH 的 IN 保持禁用；原 TCode input 链仍为明确 partial。

## 必测矩阵

1. 旧 schema 网络配置、serial 参数深复制与严格范围、恢复零 IO/零 Arm。
2. 实际共享 TCode encoder→OutputSession→registered SerialTransport→mock SDK，部分写、0字节、固定/轮询、反向范围、脏值、deadline。
3. 异步 factory / 枚举 / 权限 / open / write / close 的 Stop、后台、删除/重加目标、target/profile/scope变化、旧回调；新连接从不自动 Arm。
4. 多目标同端口冲突不能同时持有或错误释放他人句柄；关闭不确认保留 exact owner/tombstone，重连不绕过。
5. 19 无能力/无控制线、26能力分支、CH仅支持描述符/初始化、CDC未证实拒绝；错误不记录端口原始敏感数据或读入文本。
6. SDK强制三后端/CH可达；无真机时清楚标明mock证据，并给用户本机USB探针/最小无运动连接与日志步骤。

原默认自动枚举/自动连接、全部参数矩阵、TCode输入动作、Windows DeviceID 与 OHOS端口身份均未由本合同宣称1:1。本阶段不会为了统计目录数量增加假按钮。

## 只读探针与互锁

NativeSerialFactory.probeReadOnly只由显式点击调用；全局serial lease在授权前获取。仅GET_VERSION(0xc0/0x5f IN)及raw descriptor，force=false，无vendor初始化/串口OUT。原生控制超时250ms，总15s watchdog含授权等待；JS超时不声称取消已发原生请求，未确认关闭保留隔离。SerialProbeError提供白名单diagnosticCode与closeConfirmed/quarantined；UI不复制原生Error.message。

应用级SerialDiagnosticSession绑定页面owner、前台、请求和target generation/profile/edit/backend/name。开始前全部输出已确认断开；同步关闭Connect/Arm互锁。Stop/后台/换目标/编辑/页面释放撤销后续步骤和晚到报告，但等待真实清理；unknown close跨重建保留。成功报告只含脱敏硬件字段，目标变化清报告；显式复制覆盖剪贴板。不会从报告恢复连接或Arm。

MIT完整许可随rawfile/licenses/CH34X-LICENSE.txt进入HAP，发行需逐字验证该成员。读取接收内容不触发任何动作；未知/部分/失败OUT不猜已发前缀，不重试运动命令。
