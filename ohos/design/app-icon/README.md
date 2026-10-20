# 旧柚趣播图标 / Connected Pixel Player

## 设计

2026-10-20，基于 `feature/ohos-port` 的 `55efe5e73cd345fbe92923eb04515061b55a9d57`。

- 保留用户确认的第六版：左上探头的棕发丸子头女孩、黄绿发饰、奶油黄正面播放器、珊瑚红屏幕、白色播放三角及右下长影。
- 短线把播放器与右侧硬件滑块模块连接，两设备竖直、底部齐平。表达媒体与硬件联动，不使用柚子、游戏手柄或手机轮廓。
- 相比第六版预览，位图布局从680px放大到896px，线性增加约32%。实际主体由画布约54%×56%增至约71%×74%，接近普通旧柚的视觉占比。
- 原始位图未旋转、重绘或重采样保存；放大与定位只在SVG布局中修改。上游Windows图标未改动。

实际查看的参考：MultiFunPlayer根目录`Assets/icon.svg`和`Assets/icon-256.png`；普通VintagePomelo仓库`yifengling0/lsohos`的`AppScope/resources/base/media/foreground.png`（Git blob `752b4523ea29122d19fa9993039109aefaf3c68b`）；用户补充的两张像素女孩参考。普通旧柚图本身不透明，主体占比约72%×84%为视觉估计，不能用透明边界直接测量。未独立核实“旧柚混音”发布图标归属。VintagePomeloPro的银白游戏环没有用于这套暖色家族设计。

## 源文件与资源

- `icon.svg`：可编辑浅黄背景、前景大小、位置与边缘裁切，无网络依赖。
- `foreground-art.png`：1254×1254透明位图原稿。由内置图像编辑工具逐版根据用户参考与反馈生成，保留第六版原始输出；不是逐像素提取，也不是纯矢量插画。
- `imagegen-prompt.txt`：生成第六版原稿的准确提示词。输入为第五版暖色播放器与硬件模块图，透明背景开启。
- `exports.json`：源与原稿SHA-256、PNG导出SHA-256及静态检查参数。
- `../../AppScope/resources/base/media/app_icon.png`：1024×1024 RGB完整图标。
- 同目录`app_icon_foreground.png`：1024×1024 RGBA透明前景。
- 同目录`app_icon_background.png`：1024×1024 RGB不透明背景。
- 同目录`app_icon_layered.json`：前后景索引，app与EntryAbility一致使用。启动窗口使用透明前景及匹配浅黄背景。

只维护一套AppScope图标资源，避免模块同名资源覆盖造成漂移。资源结构依据[OpenHarmony官方分层图标文档](https://github.com/openharmony/docs/blob/master/en/application-dev/quick-start/layered-image.md)。

## 大小与遮罩

旧预览采用的半径400安全区只是项目自行选择的保守值，不是已核实的平台强制规范；此次按用户反馈增大。当前可见原稿（alpha≥64）均处于半径500内，实际最大半径约499px；圆形遮罩及水平/垂直±8px静态偏移不裁切可见主体。半径508裁切仅用于最外层微弱透明杂点，导出器额外检查未裁切原稿，避免把主体损失藏在裁切后结果中。Inkscape的裁切合成可产生1–2级alpha舍入差异。

这些是本项目的静态QA参数，不代表已经验证所有HarmonyOS启动器的动态缩放、位移或裁切规则。

## 导出与检查

需要已安装的Inkscape1.4与Python Pillow，本工具不下载依赖、不修改SDK。

```sh
python3 ohos/tools/export-app-icon.py
python3 ohos/tools/export-app-icon.py --check
python3 ohos/tools/export-app-icon.py --check --preview /tmp/mfp-icon-preview.png
(cd ohos && node --test tests/app-icon.test.mjs)
(cd ohos && node --test tests/*.test.mjs)
```

检查覆盖源/导出逐字节一致、1024px PNG、真实透明前景、不透明背景、可见主体未被裁切、PNG体积及索引唯一性。预览覆盖16/24/32/48/64/96/128px和圆形/圆角方形遮罩。

正式编译使用仓库`ohos/tools/build.sh`，需要官方HarmonyOS工具链/API26 SDK；Node测试和现有GitHub Actions的OHOS core测试不是SDK编译。真机还需检查桌面、应用详情、最近任务、冷启动及图标缓存。本次提交的具体构建结果见任务交付说明，不把静态检查当作真机或HAP验收。
