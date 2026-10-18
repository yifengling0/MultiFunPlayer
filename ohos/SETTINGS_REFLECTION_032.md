# 0.32 设置映射与自动化检查

## 目标

“每个设定都要能反应上去”被拆成两层验证：

1. **有入口**：真实配置类中的每个持久化字段，必须在对应的设置面板（或页面级目标选择器）中被引用；
   不允许悄悄删掉控件而保留字段。
2. **能往返**：设置经 `SettingsSchema.encode → decode` 后仍是用户选择的值；运行时状态
   （连接、Arm、播放位置、token、generation 等）不得写进配置文件。

## 覆盖表（`tests/settings-reflection-032.test.mjs`）

| 设置面板 | 配置来源 | 字段数 |
| --- | --- | ---: |
| 通用 | `GeneralConfiguration` | 3 |
| 同步 | `SyncConfiguration` | 8 |
| DeoVR / HereSphere 来源 | `MediaSourceConfiguration` + 两个端点类 | 7 |
| 轴参数 | `AxisConfigurationFields` + `AxisConfiguration` | 29 |
| Motion 生成器 | `MotionProviderConfiguration` | 14 |
| 键盘 / 触摸命令 | `KeyboardShortcutConfiguration` + `KeyboardShortcutMapping` | 14 |
| 局部连续输入 | `ContinuousInputConfiguration` + `ContinuousInputMapping` | 14 |
| 输出目标 | `SavedOutputTarget` | 19 |
| Internal 播放列表 | `PlaybackConfiguration` | 7 |
| **合计** | | **115** |

唯一记录的“间接字段”是 `SavedOutputTarget.rangesByDevice`：它是输出范围编辑器的嵌套容器，
不会作为一个单独标签出现；编辑仍通过范围的 Minimum/Maximum/Enabled 完成，测试中显式保留这一例外。

## 往返覆盖

- General：密度、排列方向、错误展示方式。
- Sync：过渡时长 + 7 个触发事件开关。
- Playback：循环/随机/自动连接/附加脚本/自动跳过 + 偏移。
- Media sources：Internal/DeoVR/HereSphere 选择与两个端点的主机、端口。
- Keyboard / Continuous：配置总数、映射名、点击次数、速度、反向。
- Output：目标标识、名称、主机、端口、轮询、间隔、dirty-only、暂停语义；运行时字段不出现。
- Axis：脚本强度、偏移、反转、自动归位开关与延时。
- Motion：速度/范围/波形/噪声参数/曲线点/插值/循环/同步由既有 Motion 测试覆盖，字段入口由本表审计。

## 运行

```powershell
$env:PYTHON = 'C:\path\to\python.exe'   # Windows 上 source-snapshot 测试需要
node --test tests/settings-reflection-032.test.mjs
node --test tests/*.test.mjs
```

真机 UI 冒烟见 `tools/ui-automation.mjs` 与 [UI_REFRESH_032_CONTRACT.md](UI_REFRESH_032_CONTRACT.md)。

## 已知边界

- 静态审计证明“字段仍有控件引用”，不证明每个控件在任意设备尺寸下都可点到；真机冒烟覆盖导航和
  关键面板渲染，平板/PC/深色模式仍需补充。
- 部分字段受运行时资格限制（例如只读、串口能力、已连接时锁定端点）。这些限制由既有生命周期测试
  覆盖，不是本审计的替代。
- 本审计不执行会改变硬件/网络状态的连接或 Arm 操作。
