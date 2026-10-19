# 0.33.0 / code34 本地验证说明

本轮基于 8574448852b46225655d9196ecfe62f1034f3981，只修已确认问题，不恢复自动滚动浮窗、不隐式调整输出轴。

## 已修改
- CP2102 控制请求使用正确的数据阶段、实际接口号、8N1及flow结构；FT232R使用正确DTR/RTS更新mask和分数波特率编码。
- 未知USB变体拒绝初始化：CP仅10c4:ea60且GET_PARTNUM=2；FTDI仅0403:6001且bcdDevice=0x0600、interface0。这不是硬件认证；不在名单的设备应报告unsupported，不能自行猜测兼容。
- 轴栏恢复横向滚动；视频与工具栏40vp视觉按钮补48vp命中；修正transport占高导致的底部裁切。
- 暂停视频时Arm交给真实coordinator授权。显式允许pausedMotion/Home的既有功能恢复；无来源、Stop、seek、未授权帧仍不能输出。
- receiver无帧时速率归零，混合坏token计无效，reset保留存活连接数。
- UI自动化只声称导航/标签检查，真实断言四协议和Motion字段；不声称已验证设置保存。

## 本轮已做 / 未做
- host Node全套：3925 tests，3918 pass，0 fail，7 skip。7项均因本环境没有官方.NET9，原C#实时oracle未重跑，静态golden/provenance仍运行。
- USB专项50/50，实际Index+Session+Coordinator暂停授权5/5；未调用真实USB/网络/设备脚本。
- 本环境没有HarmonyOS SDK/DevEco和.NET SDK，未做新ArkTS官方编译、未生成HAP。请本地使用官方SDK构建，勿安装旧0.32包误判新代码。
- video-stage fixture沿用官方SDK基线，只手工映射新增responseRegion属性，metadata明确声明；仅用于host绑定回归。不能称本轮SDK产物。完成本地官方构建后运行 python tools/capture-video-composition.py 重新捕获，再跑测试。

## 本地构建
1. 使用本地已安装官方HarmonyOS SDK，确认AppScope版本0.33.0/code34。
2. 在ohos目录运行 node --test tests/*.test.mjs；若有.NET9，设置MFP_DOTNET_ROOT并先运行 python tools/reference/compile.py，消除7项oracle跳过。
3. 按既有DevEco/hvigor流程assembleHap，签名后安装新包。
4. 构建后运行 python tools/capture-video-composition.py，再跑video-composition测试。

## 真机回归（先断开运动硬件或使用安全测试接收器）
- 手机横向滚动轴栏，逐一选择所有轴；pad/PC侧栏同样检查。视频播放/暂停/展开/全屏Stop及工具导航48vp命中不得穿透。
- 视频暂停：默认暂停输出权限关闭时不能发送；明确允许pausedMotion/Home时只能按相应授权发送。Stop后等待已开始write结算，随后持续无新帧；不以界面“已Arm”代替实际帧检查。
- CP2102/FT232R真实控制返回长度、线路电平、波特率；未知型号应明确拒绝。CDC本轮未改，短IN、ZLP、cancel/detach仍未设备验证。
- TCP/UDP receiver分别接收应用生产编码帧，核对轴集合/精度/I间隔；TCP拆分token和换行重组后应exactly-once。Pause/Stop看frames/lastFrameAt变化，而非仅看rateHz。
- 无脚本轴出现axisValueNonFinite时，先检查脚本或获准Motion/Home来源。确实不用的轴需明确关闭输出范围、断开重连应用再Arm；本轮不自动排除、不补0、不绕过安全门控。
- 自动滚动浮窗仍保持0.32的关闭行为，仅手动“浮窗”。恢复该产品行为另行确认，不混入本轮协议修复。

## 冒烟脚本增量修正（89a15ff 后）
- 脚本读取当前显示的生成器标题，支持 Random、Pattern、Custom Curve、Looping Script；不切换生成器，不修改已保存配置。
- 每种生成器都检查速度、输出范围标题、最小值和最大值的完整组合标签，并按页面顺序检查该生成器专有字段。未知、缺失或歧义标题直接失败，不按 Random 猜测。
- 本地验收：分别手动选择四种生成器后运行冒烟脚本，确认均可通过，且配置未被脚本改变；字段缺失必须报失败。此检查只验证导航及标签，不验证字段编辑、保存、播放或真实输出帧。
- 脚本仍使用特定设备的固定滑动坐标，换分辨率/横屏/pad/PC 需先核实坐标；本次未执行 hdc 真机冒烟。新增 host 回归只证明标题识别、字段清单与断言逻辑。
