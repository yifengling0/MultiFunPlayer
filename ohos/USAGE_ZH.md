# MultiFunPlayer OHOS 版 · 使用说明

面向：拿到这份代码后要在本机编译、装到设备上跑起来、并知道每个控件干什么。
本文保留了 0.5.1 的本地实测记录（HUAWEI MatePad Mini，MLR-AL10，HarmonyOS 7.0.0.109 / API26）。**0.6.0 的视频布局与自动目录扫描是本轮新改动，尚待真机复测；旧版记录不能代替新版验证。**

0.6.0：把视频与同名脚本放到系统 `Download/com.multifunplayer.ohos`，应用自动建立列表；不再提供逐个导入视频、脚本或选择目录的主界面入口。同名脚本 ZIP 仍可自动匹配。见 [新版测试清单](DEVICE_TEST_PLAN.md) 与 [完整功能差距](FEATURE_PARITY_MATRIX.zh-CN.md)。

---

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

工程零第三方依赖（`oh-package.json5` 的 dependencies 为空），**不需要 `ohpm install`**。

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
