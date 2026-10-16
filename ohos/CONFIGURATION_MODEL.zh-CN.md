# 共享配置与持久层（核心中间阶段）

这是完整功能移植的基础模块，**此阶段尚未绑定设置界面和播放会话，不代表应用已经具备完整配置功能**。应用可测试包仍以 `VALIDATION.md` 中对应版本为准。

## 单一配置来源

- `core/DeviceProfile.ts`：原版 TCode-0.2（9轴、3位）与 TCode-0.3（11轴、4位），自定义档案、轴启用/别名/默认值、深克隆与诊断。
- `core/AxisConfiguration.ts`：原版29项轴设置、8项同步设置、明确秒单位、源码范围、JSON编解码。
- `core/MotionConfiguration.ts`：Random、Pattern、Custom Curve、Looping Script的持久参数；不包含相位、随机种子或当前值。
- `settings/SettingsSchema.ts`：版本化配置，设备/每轴/同步/全局偏移/Motion使用同一模型，不再各自维护一份隐含默认值。

持久数据保留禁用轴及其引用。激活时通过 `resolveActive` 深克隆，仅启用有效轴，并把指向禁用轴的Link/Smart/Motion引用解析为null与警告，符合原DeviceAxisConverter的实际行为；不会删除磁盘中的原引用。

`speedLimitUnitsPerSecond=+Infinity` 是原版“每单位0秒”的可表达语义，使用明确字符串 `"Infinity"` 保存和恢复。其他非有限配置数值不借助JSON的null转换静默保存。运行态NaN、播放/armed/连接成功状态、当前轴值和凭据不会落盘。

## 保存与恢复

`SettingsStore` 是单写入者、revision有序保存；`NativeSettingsStore` 使用应用私有目录。完整数据在序列化和默认展开后再次检查容量，不能接受输入小但展开后无法保存的“有效”配置。

- 加载不写文件，不自动覆盖坏主文件。
- 主文件坏时可读有效备份或默认值，但设置 `recoveryRequired`；界面必须显示诊断，用户接受恢复后才能保存。
- 未知新schema、权限/读取错误保持只读，不能用旧版程序破坏未来配置。
- 临时文件写入、同步后同目录rename；备份来源为上次已验证快照，不能用损坏主文件污染备份。
- 直接调用原生写入边界也会重新生成白名单配置，不能绕过上层写入armed、token等任意字段。
- close失败不盲目重试可能已复用的FD；保留原始及清理错误。设备断电时目录项耐久性、rename及close异常行为仍需真机验证。

普通资源URI只是资源引用，不能当成仍持有权限的证明。Looping Script资源重启后须由会话重新验证/读取。

## 验证范围

- 仓库内配置专项60项通过；独立故障/边界专项6项通过。
- 300组随机配置往返、禁用轴保留/投影、80组交错保存/故障、默认展开超限已验证。
- Linux真实文件系统上的短读写、rename失败恢复、symlink拒绝验证通过。
- 官方SDK对原NativeSettingsStore.ets及依赖检查：0类型诊断、0 ArkTS lint诊断。

上述不是手机、平板或PC真机持久化验收，也不是本模块已经接入完整HAP的证据。

## 集成接口

创建 `NativeSettingsStore(context.filesDir)` 后 `await load()`，先处理 `readOnly`、`recoveryRequired`、`diagnostics`，再建立registry和会话。仅用户接受恢复时调用 `acceptRecovery()`。保存/重试/等待完成分别使用 `save()`、`retry()`、`flush()`；`status()` 用于显示真实保存状态。

修改配置的原版副作用（ResetSync、重新绑定脚本等）属于播放会话，持久层不会擅自播放、连接设备或改变轴运行状态。当前只读/损坏恢复的UI尚待接入。
