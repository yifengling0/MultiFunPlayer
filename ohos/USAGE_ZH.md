# 0.20.0 / code21：更易读的界面与真实网络诊断

1. 手机、平板、PC默认均使用易读布局：标题22–24、正文18、辅助文字14，控件至少52vp。需要更密集排布时，在“通用设置 → 界面密度”明确选择紧凑；字号降到16、间距缩小，触摸目标仍保持52。旧配置默认易读。浅色分层、边缘光和按下反馈已应用；标题栏与工作区融合，系统全屏能力仍受现有平台限制。
2. 长目标名、下拉选中项、状态与错误可换行；长错误在弹层内滚动，关闭与全局停止保留。窄横屏的视频栏保留播放、停止和全屏；若省略重复的视频进度行，可在设置区时间线定位。标题栏固定提供72×52vp“停止”，手机、平板和PC均无需滚动或键盘即可点击；宽度小于320vp时标题栏改两行，停止不消失。全屏和错误弹层仍保留停止入口。媒体与设备输出继续独立。Download自动目录仍是资源入口。
3. 已用生产编码、会话、TCP/UDP适配器和真实Linux回环socket收发验证；这不等于鸿蒙设备已互通。设备上的实际后端通过下面“一次往返诊断”验证。WebSocket这轮没有新增真实socket联通证据。
4. 从恢复包的源码目录进入ohos，在自己电脑运行 `node tools/network-diagnostics/receiver.mjs`。默认只监听电脑本机127.0.0.1，不能用它跨设备测试。要从OHOS设备连接，先确认可信局域网，再自己运行 `node tools/network-diagnostics/receiver.mjs --host 你的电脑实际局域网IP --allow-lan --protocol both --seconds 120`，记录输出的端口；自行处理系统防火墙提示。不要开放公网端口。无需安装Node依赖，接收脚本需要Node20或更新版本。
5. App里先断开所有普通设备目标并等待关闭确认，打开“网络输出 → TCP / UDP真实往返诊断”。填电脑地址及脚本显示端口，选TCP或UDP，确认“这是专用接收脚本”，再点开始。**不要填写运动设备的控制端口。** 修改协议/地址/端口会撤销确认；端点不持久保存。每次只发一个随机挑战，不发送轴值，不自动Arm。
6. 只有本次完整回显且本地关闭确认后才显示成功，并列请求ID、收发字节和耗时。成功证明接收脚本往返，不能证明设备动作执行或远端身份。超时、错误、关闭未确认均明确显示；关闭隔离不会因页面重建或再次前台而消失。诊断未确认关闭期间，全部普通Connect/Arm被阻止。Stop/F12、后台或离开页面取消本次诊断；重新前台不会自动发起。接收脚本最多运行120秒/20次有效请求，可Ctrl+C结束。详细选项见[接收端指南](tools/network-diagnostics/README.md)。
7. 恢复包内 `tools/ui-preview-020/index.html` 是可本地打开的浏览器设计近似，用于对比手机横竖屏/平板/PC。当前执行环境没有生成真实截图，不把静态预览当ArkUI验收。请在自己的实际设备检查长中文标签、系统字体放大、弹出选择项、键盘/IME、滚动末尾及全屏/Stop可达性。
8. 当前仍是可本地测试的未签名候选包，须通过官方SDK签名/部署。不是最终1:1版：原动作覆盖保持153/188（110完整可移植、43部分、35未接），其它播放器/协议/连续输入及平台实测仍缺。File审查与Git发布边界不变。

## Historical record

# 0.19.0 / code20：DeoVR 连续控制与逐目标连接动作

1. 仍从系统 Download 自动目录扫描开始。DeoVR 端点只在明确连接后使用；恢复设置不会连接或 Arm。远端路径只用于匹配当前受管目录脚本，不授权任意路径读取或网络下载。
2. 正常播放、暂停、速度操作先关闭发送门并清旧队列。只有操作前已经明确 Arm 的目标能保留待命意图；随后必须收到两次符合条件的同源真实状态，并产生新合法流水线帧，才继续发送。“发送完成”不是播放器执行确认。状态超时、错误或条件不足会解除 Arm，需要重新明确授权。
3. 暂停后可显示“待命，无输出”；不会凭保留 Arm 自动制造动作。暂停 Home/Motion 仍需各目标单独许可和真正当前来源。已发送给系统的字节无法撤回；设备是否物理执行未由本地回执证明。远端协议没有服务器时间戳/命令ACK，真实设备互通仍待验证。
4. 时间定位、AB、AutoSkip、Path Set、换源仍解除 Arm；Stop/F12、后台、断开和错误永久撤销当前控制事务。迟到数据或重新连接不会自动恢复。若开始时没有 Arm，任何控制完成都不会替你 Arm。
5. “输入设置 → 输出连接”可选择固定目标和 Connect / Disconnect / Toggle；TCP、UDP、WebSocket 均有真实操作路径。目标未选择、已移除、忙碌或关闭未确认会明确拒绝，不会借用当前选中目标。已连接目标执行 Connect 是无操作，不重建连接或改变其已有状态。输出连接/断开不影响媒体播放，连接成功仍需明确 Arm。
6. Endpoint Set / Uri Set 只改指定目标的草稿。不同值会解除该目标 Arm，但原连接仍使用原地址；先明确断开再连接，或用面板应用新配置。相同值不触发副作用。输入编辑不执行动作，触摸执行和键盘触发使用相同验证；文本焦点和 F12 防误触规则保留。
7. 当前178个ID对应153/188原模板：110完整可移植、43部分、35未接。其他播放器、连续Drive输入、额外输出协议、部分General/WPF行为以及真机布局/IME/触摸仍未完成；这不是最终1:1版。未签名HAP用于本地官方SDK签名、部署和测试；源码恢复包可重建。File录制与Git发布仍未完成本轮授权/验收。

## Historical record

# 0.18.0 / code19：DeoVR 真实媒体源

1. 先完成现有系统 Download 自动目录扫描，把对应脚本放入受管目录。打开“媒体源”，选择 DeoVR，填写已知端点并明确点击连接。默认127.0.0.1:23554只是原默认值，不会在启动或恢复设置时连接。切源会先关闭旧源；关闭未确认时拒绝替换并显示隔离错误。
2. 面板显示实际连接状态、远端媒体名称、接收位置/时长、播放状态和陈旧提示。播放、暂停、速度、时间定位及 Media Path Set 发送原协议命令；“发送完成”不代表播放器已经执行。界面和脚本时钟依赖随后真实收到的数据。位置持续不变或超过750ms未收到有效位置时关闭发送门，不凭本地计时一直推进。
3. 远端Windows路径、file URL和普通URL只用于片名匹配。应用只读取当前授权目录索引里的脚本URI；远端路径不会变成本地权限、下载请求或目录导入。无匹配脚本时远端播放器仍可工作，原配置的Motion/Home是否可输出仍由本轴来源和目标许可决定。
4. 首版DeoVR的播放、暂停、速度命令也会撤销已有物理Arm，这是比原版live控制保守的边界；收到有效状态后如需输出请重新Arm。远端seek没有相关ACK，时间定位、AB、AutoSkip和Path Set都会先解除物理Arm并清候选队列。收到新合法帧后可以继续预览；如需输出须再次明确Arm。不能把刚好相同的位置当作确认，也不会使用本地AVPlayer seekDone冒充远端确认。
5. Stop/F12、后台、页面/Stage销毁、换源和错误会立即撤销处理与输出，再异步关闭远端连接。TCP关闭不是远端播放器已停止的证据；普通暂停才发送原暂停命令。迟到包、读取或发送完成不能恢复Arm。关闭失败保留隔离，需要处理错误，不能靠重连绕过。
6. “输入设置 → 媒体源 · DeoVR / Internal”提供8个新增触摸/键盘动作：DeoVR端点Set、两源各自连接Toggle/Connect/Disconnect、Media Path Set。改参数不执行；连接不Arm；端点同值Set是合法无副作用操作。源连接会取消旧排队动作，停止始终可达。媒体源面板和触摸动作保持48vp，平板/PC有同语义键盘入口。
7. 当前172个具体ID映射147/188原模板，其中110完整可移植、37部分、41未接。DeoVR的受管文件域、数值/流量预算、显式生命周期与无ACK策略有意标为部分适配；没有将本地fixture成功当成实机互通。其余协议、Drive输入、File及实体设备验证仍缺。

## Historical record

# 0.17.0：受管 Looping 与逐目标输出范围

1. 仍从系统 Download 自动目录开始，把文件放入应用媒体文件夹并完成刷新。输入设置内选择“Motion / Looping Script”中的 Script Set，在受管脚本下拉框选择完整相对路径。不会根据任意文字打开新目录；未选择、文件不存在、重名身份或读失败会明确提示。再次执行同一路径会真正重新读取内容并重置循环相位，不是缓存命中。
2. 在“输出范围”动作组选择目标实例（例如 TCP/0 对应 tcp:0）、轴、Minimum/Maximum/Middle/Size 的 Set 或 Offset 以及限值。目标没有选择时不会借用当前输出；目标被移除后重建也不会接收旧排队动作。轴已禁用/不存在会拒绝，目标内禁用的输出轴可以保存范围但不会被启用。
3. Middle Set 保留原注册公式，不是将绝对中心直接设为输入值。最小/最大限值独立，合法命令可能产生反向范围；输出面板显示“输入0→Minimum、输入1→Maximum”与方向，保存时不排序。非有限或越过0–1的结果原子拒绝。
4. 端点/模式/权限草稿仍走“连接 / 应用配置”。范围动作只对当前已经应用的同一目标允许实时更新；存在未应用草稿时先提示应用，不会夹带端点/权限改动。未连接时只保存设置，不连接。动作本身不 Arm。
5. 已明确 Arm 的目标在范围更新或成功 Looping 读取时会先停止候选发送，下一真实合法帧才可继续；界面区分“待命，无输出”。旧排队 Fixed/Polled 与迟到回执不会重新灌入队列。已提交给传输的字节不能撤回。其他目标的权限和发送状态独立；Stop、后台、断开、错误与取消仍撤销相应意图。
6. 两组新动作都有48-vp触摸等价入口和键盘映射编辑；修改参数不会执行动作，需点执行或触发映射。输入框/IME/编辑捕获期间维持键盘防误触，F12与触摸Stop可立即取消待处理读取。
7. 真正 unknown 历史仍参与 Smart/限速计算时可能继续拒绝输出，请使用现有明确安全运行时重建，再明确开始和Arm；不能靠读到新文件洗白旧来源。桌面全部协议、外部播放器、Drive输入和部分WPF控件生命周期仍有缺项，详见剩余依赖清单。没有新增目录或单视频导入。

## 历史使用说明

# 0.16.0 / code17 本地候选：画布附着副作用与 Motion 控件

1. 打开当前轴的 Motion 参数，选择 Custom Curve。只有当前实际挂载的编辑器登记画布尺寸；首次附着排序/坐标往返，不猜测 WPF 首次 Viewport 事件。之后修改 Duration 会按原视区事件删除旧集合中界外点（边界点保留），即便画布尚未测量也执行该删除。关闭/切换编辑器后不对隐藏 provider 无条件裁点。
2. Custom Points 动作仍先 Duration，再插值，再替换点集合。新输入的视区外点在 Reset 时会被保留；已测量时会稳定排序及坐标往返。点重复仍保留。只是改点不会额外请求同步或重置相位，同值集合 Reset 仍刷新。现有严格 Smart 点域与 WPF 缓存页调度差异继续列为部分适配。
3. 四种 provider 的 Minimum/Maximum 与 Random Octaves 显示“控件值”，当它与实际“模型值”不同，会同时说明。例如原始反向范围可继续留在模型里；Octaves12可显示8。仅打开、刷新、失焦不会把控件约束偷偷写回模型。明确输入并提交会更新对应模型字段，即使输入值与显示值相同。Random128运行预算不因显示8而被绕过。
4. 切轴/provider、只读恢复、外部坐标变化和旋转重测会取消过期数字草稿/拖动。新坐标、删除、添加及拖动都校验原编辑身份。触控数字与点列表保持48vp，外层页面负责滚动；空白画布拖动让出给页面。
5. 这些操作只修改受控参数；不启动媒体、独立Motion或手动预览，也不连接或Arm输出。既有明确启动、独立目标许可、Stop/后台/错误撤销规则不变。无需增加文件夹或单视频导入，继续使用Download受管列表。

本轮动作数量没有增加：155具体项目，133/188原模板已接，其中110完整可移植、23部分、55未接。执行证据见VALIDATION.md；本地C#方法/控制器/SDK验证不等于Windows事件循环、手机/平板/PC视觉、触摸/键盘或实体设备验收。

## 历史0.15使用说明

# 0.15.0 / code 16 本地候选：点参数、手动过渡与原版 SkipGap

1. 输入设置的键盘与触控动作现有155个具体项目、18组。Custom Curve Points可编辑Duration、插值及点列表/曲线；SmartLimitPoints可编辑0–100点。编辑、拖动和预览不会执行动作，只有明确执行/键盘触发才提交。只读及过期编辑回调不能修改。单动作4096点、全部映射8192点；Smart的x必须严格递增，Custom保留原顺序、重复时间和有限视区外x。
2. Custom点动作按原Duration→Interpolation→集合Reset顺序应用。只改点不请求同步，同值点仍刷新，不重置相位；现有曲线面板的纯点编辑也按这一规则运行。严格Smart点域、已加载WPF画布/控件回流差异仍标为部分适配。
3. 无媒体手动操作：先点“关闭媒体和输出连接，启动手动预览”。启动会先确认全部旧输出连接关闭，失败或取消就保持停止；重复启动也不会保留旧连接或Arm。目标轴必须开启手动过渡，且没有未旁路的选中Motion。接着应用/连接当前输出配置，选择Fixed固定更新，单独打开“暂停手动过渡输出”，再明确Arm。等待状态显示“待命，无输出”。随后在触控动作中选Axis Value Set/Offset，填写值和Duration并执行；0秒也只在下一真实pipeline帧取得有效过渡授权。Set本身不会启动或Arm，Polled没有原始手动事件，不能冒充支持。
4. Manual Set替换过渡；未结束的Offset追加原始target/剩余时长，保留原首次tick前time=-1的额外1秒算术。脚本/Motion优先级、Transition旁路、Home/Sync/Smart/限速仍按原流水线作用，不暗改配置。有限参数造成追加算术溢出时原子拒绝。
5. Stop/F12、后台、断连、换源、错误以及权限/范围变化撤销待命或发送；恢复连接、恢复设置或新Set不会自动Arm。新的手动预览会清旧过渡并保持未Arm。默认Home数值仍可按原算法更新，但没有真正手动贡献时继续待命，不因等待超过5秒自动发出Home或失去待命；未知来源仍拒绝。收到任一手动目标的断连/错误通知会同步关闭全部手动目标队列，不等待下一UI计时帧。已提交SDK的字节无法撤回，不等于设备已经物理停止。
6. Script::SkipGap会先验证所选轴可用，随后保留原版扫描全部绑定轴的行为。原始最早候选若已过期或距离不足，会阻止后面候选；不偷偷选另一个。候选是原始脚本时间，超过duration时在阈值通过后才钳位。没有合格候选会明确反馈；真实seek仍要等待当前来源确认。

统计：133/188原模板有执行路径，110完整可移植、23部分、55未接；151个原具体名称加4个OHOS扩展不等于155个原模板。验证结果、SDK、未签名HAP与源码hash见VALIDATION.md。手机48vp操作与PC键盘同执行器已做控制器/布局结构测试，仍无真机视觉/触控/IME验收。File记录未接入、未发布，受阻审查不改道重试。以下保留历史记录。

## 历史0.14候选

# 0.14.0 / code 15 本地候选：Motion动作与真实资源重载

1. “键盘映射 / 触摸命令”现有150个具体动作，按18组浏览。可选目标轴；禁用/失效轴会明确拒绝，不替代成当前轴。四种Motion的已接标量/枚举动作共34项；它们修改指定provider，不自动切换当前provider或Arm。Custom Curve快捷Reset可选“请求同步”（默认开启）；曲线面板Reset按原UI不请求同步。
2. Internal按名播放在当前队列中首个名称或完整关联名按原OrdinalIgnoreCase匹配，仍走受管Download读取。不同项按原事件次序载入，并保留原播放/暂停状态；相同项回到开头，不重复读取。名称不是任意文件路径或目录授权。
3. “Shortcut Enabled”按大小写完全相同的首个映射名称修改启用状态。禁用不取消当前动作组和已排队触发；立即取消请用停止/F12。失焦、文本/IME编辑、后台和普通映射编辑仍取消；重启只恢复设置，不恢复按键、计时器或队列。
4. 轴设置可“重新读取当前轴脚本”，进行中可取消。Reload/Link会在已授权的同一Download根重新扫描并读取，能发现刚加入的同名脚本；不重新打开视频，也不清除全部Motion相位。锁住的非空资源仍受保护；真正无匹配时保留原普通资源并显示0结果，优先链接不搜索脚本。
5. 读取/解析/ZIP失败、扫描不完整或权限错误会显示具体失败、保留旧资源并解除发送启用；修复文件后明确重载及重新Arm。取消、Stop、换源/目录快照/设备配置、后台或失焦不能被迟到读取覆盖。成功重载只保留之前已Arm且未改变的目标意图，等待真实新帧后才可继续；未Arm、断开、重连或范围变化的目标不会自动启用。
6. 48vp触摸等价操作与停止仍可达。完整统计为128/188原模板有接线，其中107完整可移植、21部分、60未接；150是provider展开后的具体项。WPF已加载RangeSlider、Duration画布裁点、Octaves编辑器回流和有界名称/目录范围仍有明确差异。原其它输入设备/模拟量/动作、远程源、General缺项与真机视觉验证未完成。

验证：1731/1731（实际.NET oracle，0 skip/fail），官方SDK26 clean HAP通过，111份生产/构建输入前后SHA一致。包未签名、安装或实连物理设备。Download自动目录仍为入口；File记录未接入/发布，受阻特殊审查未改道重试。详细证据见VALIDATION.md，下列内容保留历史范围。

## 历史0.13.0 / code 14 本地候选：完整参数快捷动作增量

1. “键盘映射 / 触摸命令”现分13组，113项动作走同一个真实执行器。统计为109个原版注册模板加4个OHOS扩展；原188模板中97项本地完整接线、12项部分适配、79项仍缺，逐项见 ACTION_COVERAGE_013.md。不是全部原版功能完成。
2. 轴动作可以选“执行时选中轴”或固定轴。选中轴在一组命令入队时固定；禁用、已删除、待重启设备或只读状态会明确拒绝，绝不偷偷换轴。全轴动作只处理当前启用轴，保存时保留禁用轴参数。结果区显示实际动作、轴和参数或拒绝原因。
3. 支持轴/同步的Set、Toggle、Offset参数，以及按时间/百分比/脚本开头定位、按名称/索引的章节与书签、AB设置和Internal/AutoSkip偏好。动作参数按原C#边界验证；非有限值和计算溢出拒绝。AutoSkip快捷动作可保存正偏移，界面明确显示，不改成负数。普通提前量编辑器仍显示其原有非正范围。
4. 设置/清除/缓存重载后再执行“取消同步”，不会在下一帧被迟到的配置采纳重新开启同步。真正下一帧发生的脚本开始等事件仍可按配置触发同步。配置提交本身不采样、不伪造媒体时间或新输出帧。媒体live edit继续工作。
5. 全轴命令、异步Internal切换/附加脚本和后续播放有明确顺序；停止、失焦、捕获、后台、换源或配置撤销会阻止旧后续动作和迟到回调。F12/触摸停止仍直接停止全部目标。快捷键不会连接或Arm输出；Internal AutoConnect只修改媒体源偏好。
6. 手机触摸执行器使用48vp控件与换行，全部分类共享主滚动区；平板/PC可用外接键盘同语义。已做真实控制器、结构和SDK验证，尚无新版手机/平板/PC截图、触摸、硬件键盘或IME实测。
7. 当前速度范围仍是OHOS的0.25–4倍，名称最多256字，脚本重载只用已授权catalog缓存。其余Motion参数/曲线动作、手动轴过渡、模拟量输入、其他输出动作和远端源仍缺。DeoVR本轮仅做协议评估。媒体仍只从系统Download自动目录进入；没有重新加入目录或单视频导入。File记录未接入/发布。

验证：1514/1514（实际.NET oracle，0 skip/fail），官方SDK26 clean HAP通过，110份生产/构建输入前后SHA一致。包未签名、安装或实连物理设备；详细证据见 VALIDATION.md。下列旧版内容保留历史范围。

## 历史0.12.0 / code 13 本地候选：键盘、触摸命令与通用设置

1. 在主设置区域打开“键盘映射 / 触摸命令”。初始没有快捷键，按原版空列表开始；添加映射、选键或明确捕获，再添加按顺序执行的动作。支持按下、释放、延迟点击计数、松开时或按住时触发。编辑器打开、文本框/输入法有焦点时停用普通映射；结束编辑后松开旧按键，再重新按下。
2. F12 调用现有全局停止，停止媒体并解除所有输出目标的启用，不等待正在加载的上一动作。手机用同页48vp“停止”和触摸动作执行器；触摸与键盘走同一验证/执行路径。F12是明确标注的OHOS安全新增，只能处理系统投递到应用的按键，不能代替硬件急停。
3. 动作列表只有已接入的22项。播放、暂停、相对跳转、偏移、速度、章节/书签、同步、Internal上/下/随机、AB、全屏和资源列表都走真实控制路径。配置可以保存，不保存按住状态、计时器或未完成动作。快捷键不能连接设备、不能Arm；重新连接、后台回来或重建后仍需明确操作。
4. 多动作和同一按键的多个映射按顺序执行。“下一项→播放”等待新脚本读完；中途停止、换源、失焦或改配置会取消后续动作，迟到加载不能恢复播放。章节/书签快捷键按原版首个可用标记集和媒体时间±1.5秒边界跳转，不等同旧的所选轴手动标记按钮。
5. 通用设置支持自动/纵向/横向布局及无提示/对话框/Snackbar错误提示。横向偏好在空间不足时退回可用布局，不旋转系统、不重建Surface。关闭提示不会隐藏输出故障、设置只读或未确认关闭状态。对话框内Enter/Esc可确认，F12仍停止。
6. Windows全局RawInput、手柄/鼠标/TCode输入、toggle/axis触发、其余原版动作参数，以及置顶/窗口尺寸与位置记忆/三项日志设置没有接入。界面明确标识；未做外接键盘、输入法和手机/平板/PC真机视觉验收。捕获用明确应用/取消，不模拟原版五秒自动关闭。
7. 媒体仍从系统授权的 Download/com.multifunplayer.ohos 列表进入，不提供目录/单视频导入。File记录未发布，专项审查被阻止后未改道重试。以下保留历史候选记录。

验证：1277/1277测试（含实际.NET C# oracle，零skip/fail），官方SDK26 clean HAP通过，107份生产/构建输入前后hash一致。未签名、安装、实连设备或进行真机键盘/IME/视觉验收。

# MultiFunPlayer OHOS 版 · 使用说明

## 历史0.11.0 / code 12 候选

1. 网络输出区可分别添加 TCP、UDP、WebSocket，每种最多10个。编号沿用原版各类型最低空闲编号；选中只切换编辑器，不会断开或关闭其他目标。各目标连接/启用状态始终显示，添加和“停止全部输出”支持窄屏换行与48vp触摸目标。
2. 每个目标单独编辑主机、端口、WebSocket路径、轴范围、fixed/polled方式和暂停权限。先“连接 / 应用配置”，再明确“启用发送”；只修改A会关闭A的发送，B继续按自己的有效配置处理。预览、本地写入次数不是物理设备执行确认。
3. 有效端点、目标顺序/选择、各设备配置下的范围与禁用状态会保存。重启恢复列表时全部断开、未Arm；不会执行原版自动重连。不能输入URL用户信息、查询参数或认证路径来保存凭据。非法草稿会显示“未保存”，只保留本次内存文本，磁盘仍是上次有效配置。
4. 删除会先停止目标并确认原连接关闭。关闭失败保留该目标和“重试删除”，不能靠切换、删后重加或重连绕过隔离。等待Apply时断开、Stop、后台、只读/恢复或编辑会永久撤销该次请求；回到前台不会继续旧连接，也不会自动Arm。
5. 全局Stop/后台/源失效/runtime重建会关闭所有目标的发送。AB/同源seek只分别保留此前已Arm的目标；未Arm目标不会因别的目标恢复而被启用。断开输出不停止媒体。

本候选1084/1084测试（实际.NET/C# oracle，0 skip/fail）与官方SDK26 clean HAP通过；99份生产/构建输入SHA前后一致。具体结果见 [VALIDATION.md](VALIDATION.md)。多目标测试使用真实控制器/核心与模拟传输，未连接未知物理设备。File记录未接入或发布，受阻的特殊审查未换路线重试。下列旧候选记录保留其原有范围。

## 历史0.10.0 / code 11 候选

1. 媒体源卡片始终显示“安全重建运行状态”。确认后立即停止发送、解除Arm，关闭媒体并清空脚本/Looping资源、旧运行历史；已保存参数和待下次启动的设备选择保留。之后重新选择源，或明确启动独立Motion，再Apply/Connect、Arm。这个操作不会接受坏配置恢复，也不会消除原生输出关闭失败的隔离状态。
2. 无视频/脚本时，可配置启用轴的Motion，开启“暂停更新”和“无脚本更新”，然后点击“关闭媒体并启动独立Motion”。它只启动预览/处理，仍使用原版暂停时钟与无媒体位置；发送另需目标允许暂停Motion、新鲜有效样本及手动Arm。Stop、后台、错误后必须明确重新开始，不会因为pause、配置变化或迟到媒体回调重新启动。
3. 视频“全屏”仍保留同一Surface。支持的浮动/最大化窗口尝试系统全屏；其他设备只扩大窗口内视频区域，按钮会区分实际模式。Back/Escape退出；如果系统恢复失败，会显示“重试退出系统全屏”。窗口状态不会控制媒体播放或输出Arm，不更改系统旋转锁。
4. phone/tablet仍使用48vp主操作；上述入口在窄屏、横屏、平板/PC共享布局可达。编译和控制器/几何测试不是实际触摸或系统窗口验收。

本候选973/973测试（含实际.NET C# oracle，零skip/fail）及官方SDK26 clean HAP通过；97份生产/构建输入前后hash一致。归档证据见 [VALIDATION.md](VALIDATION.md)。File记录尚未接线/验收，网络物理设备与新版真机体验尚未验证。下列0.9/更早记录保留历史上下文。

## 历史0.9.0 / code 10 候选说明

本节记录0.9状态；下文保留旧版操作/实测记录，不把旧版“没有网络输出、没有播放列表、改参数自动暂停、seek必须重新按播放”当作本候选行为。0.9尚未签名、安装或实机验收。

1. 视频仍放在系统授权的 `Download/com.multifunplayer.ohos`，在媒体列表打开；即使未连接任何输出，也能看视频。没有同名脚本时清空旧轴，仍可播放视频。
2. 只播放脚本：展开媒体源的 Internal，明确连接，选择当前 Download 脚本加入队列，再按播放。上/下一项、随机、Loop、Shuffle、移除/清空/清理、附加轴脚本开关已连接真实模型。不同条目成功加载保留媒体播放意图，但输出要重新明确 Arm。读取失败清掉旧脚本，不能假装成功。
3. 队列最多256项，按授权目录的相对身份保存；重启后缺失文件保留缺失状态，不把字符串拼成任意路径读取。队列/Loop/Shuffle/AutoConnect/附加脚本/AutoSkip偏好持久；AB、当前曲目位置、播放状态和输出Arm不持久。AutoConnect只连接Internal源，不自动播放、不连接设备、不Arm。
4. AB可在Internal和本地视频中设置A/B或按章节选择；到B后请求回A。AutoSkip在真实duration消息后约1秒检查当前绑定脚本的开头空白，采用当前偏移（默认−5秒）。已排队任务按原版语义不会因后来关闭开关而撤销；Stop/取消/后台会撤销。
5. 网络输出单独配置TCP/UDP/WebSocket端点、轴范围及fixed/polled模式，先Apply/Connect，再明确Arm。轴条只是预览；本地写入完成也不是设备ACK。后台、Stop、断开、源替换或错误会关闭输出；重新连接不会自动Arm。
6. 同一源的seek/AB只能保留此前已明确Arm的意图。seek期间立即禁止发送、清旧队列；只有实际seekDone落点及新有效帧才能恢复。原先暂停的媒体不会因seek自己开始播放；超时、Stop、后台、配置撤销等使旧确认永久失效。完整runtime/源模式重建后需重新Apply/Connect当前输出配置再Arm。
7. Stop会取消还在读取的选曲、配对和视频打开。若Internal已选中但尚未读完，旧脚本被清空，界面提示按Play重新读取该条目；Clear之后可以重新加入队列。后台不会自动恢复播放或设备输出。

设备/轴/同步/Motion面板已真实接线，live edit保留原命令副作用与软同步；参数不会因换视频而清除。未知schema/权限拒绝只读，坏配置恢复需明确接受，不会自动覆盖。phone/tablet默认48vp主控件；紧凑模式只对真实2-in-1且面板尺寸足够时启用。结构/几何与控制器测试不代替触摸和截图验收。

验证：921/921（含实际.NET C# oracle）通过；官方SDK26 clean HAP通过；97份生产/构建输入前后hash一致。包与证据见 [VALIDATION.md](VALIDATION.md)。File记录、native-window全屏、独立无媒体Motion启动、远程播放器和其他输出仍未完整接入，见 [下一阶段差距](NEXT_PARITY_STEPS.md)。

---

面向：拿到这份代码后要在本机编译、装到设备上跑起来、并知道每个控件干什么。
本文保留了 0.5.1 的本地实测记录（HUAWEI MatePad Mini，MLR-AL10，HarmonyOS 7.0.0.109 / API26）。**0.6.0 的视频布局与自动目录扫描是本轮新改动，尚待真机复测；旧版记录不能代替新版验证。**

0.6.0：把视频与同名脚本放到系统 `Download/com.multifunplayer.ohos`，应用自动建立列表；不再提供逐个导入视频、脚本或选择目录的主界面入口。同名脚本 ZIP 仍可自动匹配。见 [新版测试清单](DEVICE_TEST_PLAN.md) 与 [完整功能差距](FEATURE_PARITY_MATRIX.zh-CN.md)。

---

## 当前开发中的完整参数界面

后续 P1 代码已接入设备、轴、同步和 Motion 设置，仍待本轮代码发布及真机复验；不能用旧版截图或单元测试认定三端界面已经验收。

- 参数修改会保存并在下一有效处理帧生效；切换视频不清空轴设置。设备配置的结构变化会明确提示下次启动生效。
- 如果配置文件损坏，先显示恢复来源，再由用户确认是否采用；未来版本配置或读取权限错误时保持只读，不能静默覆盖。
- Looping Script 从已扫描且验证过的 Download 资源选择；不提供任意路径读取。普通媒体切换保留其独立脚本；刷新资源目录会重新验证。
- Custom Curve 支持实际插值曲线、数值增删、拖点与重置。曲线显示的是编辑配置，尚无运行时播放位置光标。
- 手机上、平板上默认保持可触摸尺寸；只有确认的 2-in-1 且参数区域足够宽才采用紧凑控件。视频全屏仍保持原比例。
- 当前没有完成物理设备输出端到端验收；模拟数值不能当成已发送命令。

## 0. 一分钟版

```sh
# 1) 编译（在仓库根目录下）
bash ohos/tools/build.sh            # 需要 HARMONY_TOOLS_HOME；没有命令行工具就看第 2 节

# 2) 装到设备并启动
hdc install -r ./ohos/entry/build/default/outputs/default/entry-default-signed.hap
hdc shell aa start -a EntryAbility -b com.multifunplayer.ohos
```

应用会自动准备系统分配的 Download/包名目录并扫描。选择列表中的视频即可打开并自动匹配脚本；只有视频时明确显示无脚本，不沿用上一条资源的脚本。列表刷新按钮用于复制文件后的重新扫描。空目录时不会自动播放旧演示或上一个资源。

---

## 1. 环境要求

| 项目 | 要求 | 本机实测值 |
| --- | --- | --- |
| DevEco Studio | 含 API 26 SDK | 26.0.0.851 |
| HarmonyOS SDK | `compileSdkVersion 26.0.0` | HarmonyOS 26.0.0 / API 26 |
| JDK | 21 及以上 | DevEco 自带 JBR 25 |
| Node | 24（纯核心测试可直接跑 `.ts`） | v24.14.1 |
| 最低兼容 | 声明 `6.0.0(20)` | 仅是声明，未在 API 20 设备验证过 |

项目未引入第三方运行库；新增本地 `libmfp_recording.so` 类型依赖后，正常 DevEco/命令行工作流建议运行官方 `ohpm install` 解析本地模块。固定官方 CLI 的独立构建测试可以直接从项目元数据解析这些类型，因此不能把安装步骤说成所有环境的硬性要求。原生库使用随官方 SDK 安装的 CMake/Clang 构建，不需要另外下载编译器。

---

## 2. 第一个坑：Windows 上 clone 完测试会红 31 个

仓库里原本没有 `.gitattributes`，而 Git for Windows 在系统级配置了 `core.autocrlf=true`，checkout 会把工作树转成 CRLF。OHOS 的测试有两处按 **LF 字节**写死：

- `tests/*.test.mjs` 用 `/^import .*;\n/gm` 剥掉 `.ets` 的 import 再用 `new Function` 求值 —— CRLF 下正则不匹配，残留 `import` 语句，抛 `SyntaxError: Cannot use import statement outside a module`；
- `tests/fixtures/interpolation-golden.json` 用 SHA256 锁定 `MathUtils.cs` / `KeyframeCollection.cs` / `ScriptViewModel.cs` 三个上游 C# 文件 —— CRLF 后哈希对不上。

表现为 **31/207 失败**，且都不是代码缺陷。仓库根目录已加 `.gitattributes` 把这些路径钉成 `eol=lf`。

已经 clone 过的话，重新归一化一次即可：

```sh
git ls-files -z -- ohos \
  Source/MultiFunPlayer/Common/Utils/MathUtils.cs \
  Source/MultiFunPlayer/Common/KeyframeCollection.cs \
  Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs \
  | xargs -0 git -c core.autocrlf=false checkout-index -f --
git status --short      # 应为空
```

验收：

```sh
cd ohos && node --test tests/*.test.mjs
# ℹ tests 207  ℹ pass 207  ℹ fail 0
```

---

## 3. 编译

### 3.1 有官方命令行工具

```sh
export HARMONY_TOOLS_HOME=/path/to/command-line-tools
export JAVA_HOME=/path/to/jdk-21
bash ohos/tools/build.sh
```

该脚本依次做三件事：跑当前全部核心测试 → `hvigorw assembleHap`（debug）→ `tools/check_hap.py` 校验包体。

### 3.2 只有 DevEco Studio（本机走这条）

DevEco 自带 node / JBR / hvigor，不必装命令行工具：

```sh
cd ohos
V="/c/Program Files/Huawei/DevEco Studio"
export JAVA_HOME="$V/jbr" DEVECO_SDK_HOME="$V/sdk" NODE_HOME="$V/tools/node"
export PATH="$V/tools/node:$V/jbr/bin:$PATH"
node --max-old-space-size=512 "$V/tools/hvigor/bin/hvigorw.js" \
  --mode module -p product=default -p buildMode=debug assembleHap \
  --no-daemon --no-parallel --optimization-strategy memory
```

产物：`entry/build/default/outputs/default/entry-default-unsigned.hap`。

编译期只有 2 类警告，可以忽略但值得知道：
- `Function may throw exceptions`（`LibraryFiles.ets` / `ScriptZipFiles.ets`，ArkTS 对未声明 `throws` 的提示）；
- `The system capacity of this api 'media' is not supported on all devices`（`NativeVideoAdapter.ets`，AVPlayer 在部分设备不可用，代码已按失败即关闭处理）。

---

## 4. 签名（真机必需）

未签名 HAP 装不上真机。签名材料不能用别人的：调试 profile 里写死了 `bundle-name`，与安装包不一致会被拒绝安装。

1. DevEco Studio 打开 `ohos/` 目录，登录华为账号；
2. `File → Project Structure → Project → Signing Configs`，勾选 **Automatically generate signature** → OK。
   DevEco 会在 `~/.ohos/config/` 生成 `.p12/.cer/.p7b`，并把 `signingConfigs` 写进 `ohos/build-profile.json5`；
3. **检查 `products[0]` 里有没有 `"signingConfig": "default"`。** 实测 DevEco 只写了 `signingConfigs` 数组、漏掉这行关联，导致 hvigor 一直报 `No signingConfig found for product default`、只出 unsigned 包。手动补：

```json5
"products": [
  {
    "name": "default",
    "signingConfig": "default",   // ← 缺这行就永远不签名
    "compatibleSdkVersion": "6.0.0(20)",
    ...
  }
]
```

4. 重新执行第 3 节编译，出现 `Finished :entry:default@SignHap`，产物变成 `entry-default-signed.hap`。

校验 profile 是否真的对得上（`bundle-name` 要等于 `com.multifunplayer.ohos`，`device-ids` 要含你的设备）：

```sh
openssl smime -verify -inform DER -in "<你的>.p7b" -noverify | python -m json.tool
hdc shell bm get --udid          # 拿设备 UDID 去比对
```

---

## 5. 安装、启动、看日志

```sh
hdc list targets -v                                   # 只看 Connected
hdc -t <SN> shell param get const.product.name        # 设备型号
hdc -t <SN> install -r ./entry/build/default/outputs/default/entry-default-signed.hap
hdc -t <SN> shell aa start -a EntryAbility -b com.multifunplayer.ohos
```

踩过的两个坑：

- **`hdc install` 的包路径要写相对路径**。传 `F:/...` 绝对路径会被拼成 `cwd + 绝对路径` 而报 `no such file`。
- **Git Bash 会把 `/data/...` 改写成 `C:/Program Files/Git/data/...`**。所有带设备绝对路径的命令前加 `export MSYS_NO_PATHCONV=1`。

调试取证：

```sh
export MSYS_NO_PATHCONV=1
hdc -t <SN> shell hilog -r                                             # 清缓冲
hdc -t <SN> shell "hilog -x | grep -i multifunplayer | tail -50"       # 看运行日志
hdc -t <SN> shell aa dump -l                                           # 前台 Ability
hdc -t <SN> shell uitest dumpLayout -p /data/local/tmp/ui.json         # 控件树
hdc -t <SN> file recv /data/local/tmp/ui.json ./ui.json
hdc -t <SN> shell uitest screenCap -p /data/local/tmp/s.png            # 截图
hdc -t <SN> shell uitest uiInput click <x> <y>                         # 按 bounds 中心点点击
```

`dumpLayout` 的 JSON 里每个节点带 `bounds`，用它算中心点再 `uiInput click`，不要靠屏幕坐标盲点。

---

## 6. 界面怎么用（0.6.0）

视频使用保持原比例的完整显示模式：不拉伸，也不为了填满而裁剪。画面周围出现黑边是正常的。

### 6.1 资源列表

- 默认目录是系统分配给应用的 `Download/com.multifunplayer.ohos`，不是整个公共 Download 的任意读写权限。
- 系统 DOWNLOAD 接口负责创建/返回目录；应用验证返回 URI 和读取结果后扫描。不再让用户选择目录或逐个导入视频/脚本。
- 视频、同名 `.funscript` / JSON 或同名脚本 ZIP 放在相同目录中；原有 ZIP 优先匹配规则保留。
- 点击刷新会停止并关闭当前视频、清除旧脚本和配对，再重新扫描；完成后重新选择视频。读取失败会显示错误，不能把权限失败当成空列表。
- 无配套脚本的视频可单独播放并清除旧脚本。存在配套脚本但损坏时保持错误/暂停，不能当作成功配对。
- ZIP 支持的是原有有界脚本 ZIP，不是大型视频压缩包的通用解压导入。

### 6.2 视频与设置

- 同屏模式：竖屏视频在上、设置在下；宽屏/横屏按可用窗口重排，视频和设置一起可见。
- 视频全屏：视频占据当前应用窗口，参数面板隐藏；明确的退出操作或返回键恢复同屏。
- 全屏/同屏切换与尺寸变化复用同一个 XComponent，不通过重新打开文件切换布局。
- 方向采用 `auto_rotation_restricted`，尊重系统旋转锁；窗口缩放与分屏也按实际尺寸重排。不强制将用户的竖屏锁改成横屏。
- “全屏”指当前应用窗口的视频专注布局，不等于强制 PC 窗口最大化或隐藏所有系统栏。
- 播放、暂停、seek、速度和时间同步继续以 AVPlayer 实际反馈为准。
- 输出仍只有模拟预览，物理设备指令尚未实现，不能把轴数值变化理解为已发指令。

### 6.3 Synchronization 面板

| 控件 | 范围 | 说明 |
| --- | --- | --- |
| `L0 curve` | linear / **PCHIP** / makima / step | 当前选中轴的插值方式，默认 PCHIP（与上游一致） |
| `Playback speed` | 0.25× ~ 4× | 播放速率 |
| `Script scale` 滑杆 | 1% ~ 400%，默认 **100%** | 围绕 TCode 中位（50）做缩放，仅影响选中轴 |
| `Global offset` `−50 / Reset / +50` | 毫秒 | 全局偏移，正值让脚本**延后** |
| `L0 offset` `−50 / Reset / +50` | 毫秒 | 当前轴偏移；换脚本会重置 |

改曲线/缩放/偏移都会**自动暂停**播放，且绝不打开输出闸门。全局偏移、倍速、曲线模式当作用户设置保留，各轴偏移换脚本后清零。

### 6.4 时间轴与下方区

- 折线画布 = 当前脚本的曲线预览，红色越深表示该处速度越高（Heatmap 的速度着色）；
- 下方长滑杆 = 进度条，可拖动 seek；`0.00 / 5.00 s` 是已播/总时长；
- `Heatmap ⌄` 展开热力图参数；中间显示当前**章节名**（演示脚本是 `Rise` → `Return`）；`Markers ⌄` 是章节/书签列表，可前后跳转；
- `L0` `R0` 是轴选择器，下面 4 个小圆点对应该轴的关键点分布；
- 轴工具排：`▣` 脚本设置、`↕` 反转当前轴、`∿` 插值设置可用；`Ⅱ`(bypass)、`↗`(轴联动)、`≋`(motion provider)、`⌁`(smart limit)、`◴`(speed limit)、`⌂`(auto home) **均未移植，故意置灰**，不是假按钮；
- `AXIS VALUES` 展开后看每轴实时数值。

### 6.5 状态栏

左下角一行文字是当前动作结果，例如 `Simulation only · no device commands`、`Import cancelled · playback remains paused`、`Curve changed · press Play to resume`。

---

## 7. 能力边界（很重要）

**这一版没有任何物理输出**：无网络、USB、串口、蓝牙指令。轴上的数值只是预览，不代表真的驱动了设备。

未实现：远程播放器控制、TCP/UDP/WebSocket 输出、轴限位与软启动、C# 插件、Windows 命名管道、USB 驱动、配置迁移、AB 循环、轴 bypass/联动/auto home。

已知差异与限制：
- 解析器比上游**更严格**：越界/非法关键点是直接拒绝，不是裁剪或跳过；
- 视频用平台 AVPlayer，不内封 FFmpeg。MP4(H.264/AAC) 是首推验证格式，MKV/MPEG-TS/M4V 能否放取决于设备硬解；
- seek 用 `seekDone` 后的**真实** `currentTime`，不是请求值；seek/缓冲/音频打断后必须**手动**再按播放；
- 退到后台或渲染面被销毁会释放视频源，要重新打开文件；
- 读取和 JSON 解析在 UI 线程，大文件会卡（worker 解析是后续工作）；
- 元数据里的 `inverted`、`range`、`version` 会被解析但**不改变输出**。

---

## 8. 常见问题

**Q：测试 31 个失败，全是 `Cannot use import statement outside a module`。**
A：工作树被转成 CRLF 了，见第 2 节。

**Q：编译成功但只有 unsigned 包。**
A：`products[0]` 缺 `"signingConfig": "default"`，见第 4 节第 3 步。

**Q：`hdc install` 报 `no such file or directory`。**
A：用了绝对路径，改成相对当前目录的路径。

**Q：`uitest dumpLayout` / `screenCap` 报路径不存在，且路径前多了 `C:/Program Files/Git`。**
A：Git Bash 路径改写，命令前加 `export MSYS_NO_PATHCONV=1`。

**Q：装不上，提示签名/包名不一致。**
A：profile 的 `bundle-name` 不是 `com.multifunplayer.ohos`，或设备 UDID 不在 `device-ids` 里。重做一次自动签名。

**Q：按 ▶ 没反应。**
A：Simulator 未连接、应用不在前台、或正在打开视频/扫描资源（此时传输操作暂时禁用）。

**Q：设备内存吃紧导致编译被杀。**
A：保留 `--optimization-strategy memory --no-parallel --max-old-space-size 512` 和 `JAVA_TOOL_OPTIONS=-Xmx256m`。

---

架构与移植阶段见 [PORT_PLAN_ZH.md](PORT_PLAN_ZH.md)，脚本匹配规则见 [LIBRARY_MATCHING.md](LIBRARY_MATCHING.md)，界面还原度缺口清单见 [UI_PARITY_AUDIT.md](UI_PARITY_AUDIT.md)，真机待测项见 [DEVICE_TEST_PLAN.md](DEVICE_TEST_PLAN.md)。
