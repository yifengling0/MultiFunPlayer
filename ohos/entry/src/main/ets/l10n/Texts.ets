import { i18n } from '@kit.LocalizationKit';
import { hilog } from '@kit.PerformanceAnalysisKit';

const DOMAIN: number = 0x4D46;

// Keys are the English source strings already present in the UI layer, so adding a
// locale never requires touching call sites again. Short keys are only replaced on an
// exact whole-string match; phrase keys may also substitute inside a longer runtime
// message, which is how the concatenated status/library texts stay translatable.
const ENTRIES: string[][] = [
  ['Refresh stops playback. Choose a video again after scanning.', '刷新会停止播放。扫描后请重新选择视频。'],
  ['Refresh stops playback.', '刷新会停止播放。'],
  ['Application Download folder', '应用 Download 目录'],
  ['Fullscreen in window', '窗口内全屏'],
  ['Exit fullscreen', '退出全屏'],
  ['Play video', '播放视频'],
  ['No matching script', '未匹配脚本'],
  ['Video only · no matching script · press Play', '仅视频 · 未匹配脚本 · 点击播放'],
  ['Preparing Download media folder…', '正在准备 Download 媒体目录…'],
  ['Scanning Download media folder…', '正在扫描 Download 媒体目录…'],
  ['Refresh Download media folder', '刷新 Download 媒体目录'],
  ['Place videos and matching scripts or ZIP files in this folder. Scanning never copies videos.', '请把视频和同名脚本或 ZIP 文件放入此目录。扫描不会复制视频。'],
  ['No media found. Put videos and matching scripts or ZIP files in this folder, then refresh.', '未找到媒体。请把视频和同名脚本或 ZIP 文件放入此目录，再点击刷新。'],
  ['Cannot scan Download media folder: ', '无法扫描 Download 媒体目录：'],
  ['Check the files and refresh.', '请检查文件后刷新。'],
  ['No readable matching script. Check the files or choose mapping.', '匹配的脚本无法读取。请检查文件或选择映射。'],
  ['Internal', '内部'],
  ['Local video', '本地视频'],
  ['Simulator', '模拟器'],
  ['Connected', '已连接'],
  ['Disconnected', '已断开'],
  ['Inactive', '未激活'],
  ['No physical commands', '不会发出任何硬件指令'],
  ['Synthetic demo · 5 seconds', '内置演示 · 5 秒'],
  ['No video selected', '未选择视频'],
  ['No active chapter', '当前无章节'],
  ['Import .funscript / JSON', '导入 .funscript / JSON'],
  ['Open local video', '打开本地视频'],
  ['Load script', '载入脚本'],
  ['Import script', '导入脚本'],
  ['Close local video', '关闭本地视频'],
  ['Script settings', '脚本设置'],
  ['Invert selected script', '反转所选脚本'],
  ['Interpolation settings', '插值设置'],
  ['Resources and script libraries', '资源与脚本库'],
  ['Script repositories and resources', '脚本仓库与资源'],
  ['Refresh selected resource directory', '刷新所选资源目录'],
  ['Refresh selected folder', '刷新所选文件夹'],
  ['AB loop is not ported yet', 'AB 循环尚未移植'],
  ['Media timing settings', '媒体时序设置'],
  ['Source settings', '素材设置'],
  ['Output settings', '输出设置'],
  ['Expand source settings', '展开拓展设置'],
  ['Toggle simulator connection', '切换模拟器连接'],
  ['Stop output', '停止输出'],
  ['Play', '播放'],
  ['Pause', '暂停'],
  ['Rewind', '回到开头'],
  ['Play or rewind', '播放或回到开头'],
  ['Port status and limitations', '移植状态与限制'],
  ['Physical output adapters are not implemented', '尚未实现物理输出适配器'],
  ['Axis bypass not ported', '轴旁路尚未移植'],
  ['Axis linking not ported', '轴联动尚未移植'],
  ['Motion provider not ported', '运动提供方尚未移植'],
  ['Smart limit not ported', '智能限位尚未移植'],
  ['Speed limit not ported', '速度限制尚未移植'],
  ['Auto home not ported', '自动归位尚未移植'],
  ['Link, motion, speed and smart-limit indicators not yet ported', '联动、运动、限速与智能限位指示尚未移植'],
  ['Synchronization', '同步'],
  ['SIMULATION', '模拟'],
  ['Script scale: ', '脚本幅度：'],
  ['Global offset: ', '全局偏移：'],
  [' offset: ', ' 偏移：'],
  ['Axis', '轴'],
  [' curve', ' 曲线'],
  ['Playback speed', '播放速度'],
  ['Volume', '音量'],
  ['Reset', '重置'],
  ['Positive offsets delay the script. Offset and curve edits pause playback. Preview clock duration stays unchanged.',
    '正值的偏移会让脚本延后。修改偏移或曲线会暂停播放。预览时钟长度保持不变。'],
  ['Grey controls are not implemented yet. Curve, inversion, scale and axis offset apply to the selected script axis.',
    '置灰的控件尚未实现。曲线、反转、幅度与轴偏移只作用于当前选中的脚本轴。'],
  ['AXIS VALUES', '轴数值'],
  ['Heatmap ⌄', '热力图 ⌄'],
  ['Heatmap ⌃', '热力图 ⌃'],
  ['Show range', '显示行程'],
  ['Combine axes', '合并各轴'],
  ['Invert display Y', '纵向翻转'],
  ['Markers ⌄', '标记 ⌄'],
  ['Markers ⌃', '标记 ⌃'],
  ['Script markers', '脚本标记'],
  ['SELECTED AXIS', '当前选中轴'],
  ['Chapters: ', '章节：'],
  ['Bookmarks: ', '书签：'],
  ['Previous', '上一个'],
  ['Next', '下一个'],
  ['Local resources', '本地资源'],
  ['AUTHORIZED FILES', '已授权文件'],
  ['Session library · original ZIP-first script search. No video copies. Choose Downloads through the system picker if it offers access.',
    '会话内资源库 · 沿用上游“先查 ZIP 再查散文件”的顺序。不会复制视频。若系统选择器允许，可通过它授权“下载”目录。'],
  ['Select folder', '选择文件夹'],
  ['Select a folder or video + script files. Files stay in their original location.',
    '请选择一个文件夹，或同时选择视频与脚本文件。文件保持在原位置，不会被复制。'],
  ['Select files', '选择文件'],
  ['Cancel scan', '取消扫描'],
  ['Script libraries', '脚本库'],
  ['SEARCH ORDER', '搜索顺序'],
  ['Media location first, then these libraries. Each location searches ZIP before loose scripts. Session-only access.',
    '先搜媒体所在目录，再按下列顺序搜脚本库。每个位置都是 ZIP 优先于散文件。授权仅在会话内有效。'],
  ['+ Add authorized script folder', '＋ 添加已授权的脚本文件夹'],
  ['Recursive', '递归'],
  ['Show 20 more', '再显示 20 项'],
  ['Open video + scripts', '打开视频与配套脚本'],
  ['Choose mapping', '手动指定配对'],
  ['Open selected video · original search', '打开所选视频 · 按上游顺序搜索'],
  ['Open selected mapping', '打开所选配对'],
  ['Select one video and candidate scripts. Original matcher priority chooses each axis.',
    '请选择一个视频与候选脚本。各轴由上游匹配器的优先级决定。'],
  ['Choose one video explicitly.', '请明确选择一个视频。'],
  ['No script candidates. Add a script library or choose files.', '没有候选脚本。请添加脚本库或选择文件。'],
  ['More than 64 candidates. Use Choose mapping or narrow the libraries.',
    '候选超过 64 个。请使用“手动指定配对”或缩小脚本库范围。'],
  ['More than 64 archive/script candidates. Narrow the selection.', '压缩包/脚本候选超过 64 个。请缩小选择范围。'],
  ['Candidate text budget exceeded. Narrow the selection.', '候选文本超出上限。请缩小选择范围。'],
  ['Candidate action budget exceeded. Narrow the selection.', '候选关键帧总数超出上限。请缩小选择范围。'],
  ['This script library is already listed.', '该脚本库已在列表中。'],
  ['Script library added after media-directory search', '脚本库将在媒体目录搜索之后被搜索'],
  ['Script library refreshed', '脚本库已刷新'],
  ['Library search order changed · open a resource again to apply', '脚本库搜索顺序已改变 · 需重新打开资源才生效'],
  ['Simulation only. TCP/UDP, serial, Bluetooth, per-output ranges and update protocols are not ported yet.',
    '仅模拟。TCP/UDP、串口、蓝牙、各输出通道行程与更新协议均未移植。'],
  ['Local video is an OHOS addition. External-player adapters and the full Internal playlist are not ported yet.',
    '本地视频是 OHOS 版新增能力。外部播放器适配器与完整的内部播放列表尚未移植。'],
  ['Source-led main layout in progress. Grey tools are unavailable. No physical output. ZIP32 local search is bounded; device playback and visual parity are not yet validated.',
    '以素材为主线的布局仍在移植中。置灰工具不可用。没有物理输出。ZIP32 本地搜索有上限。真机播放与视觉还原度尚未验证。'],
  // Runtime status and library messages. The English prefix or suffix stays in the
  // composed message, so these keys also match as substrings.
  ['Simulation only · no device commands', '仅模拟 · 不会向设备发送指令'],
  ['Import cancelled · playback remains paused', '已取消导入 · 播放保持暂停'],
  ['Import failed: ', '导入失败：'],
  ['Imported locally · press Play to simulate', '已在本地导入 · 按播放键开始模拟'],
  ['Curve changed · press Play to resume', '曲线已更改 · 按播放键继续'],
  ['Offset changed · playback paused. Positive offset delays the script.',
    '偏移已更改 · 播放已暂停。正值的偏移会让脚本延后。'],
  ['Paused for safety · press Play to resume', '出于安全已暂停 · 按播放键继续'],
  ['Stopped · simulation output disabled', '已停止 · 模拟输出已关闭'],
  ['Simulator selected · press Play', '已选择模拟器 · 按播放键'],
  ['Marker selected · playback paused', '已定位到标记 · 播放已暂停'],
  ['No further marker in that direction', '该方向上没有更多标记'],
  ['Marker lies outside the current preview clock', '该标记超出当前预览时钟范围'],
  ['Rewinding · press Play when ready', '正在回到开头 · 就绪后按播放键'],
  ['Video ready · press Play', '视频已就绪 · 按播放键'],
  ['Preparing native video · playback starts only when you press Play',
    '正在准备原生视频 · 只有你按播放键才会开始播放'],
  ['Video released in background · reopen the file to continue', '退到后台已释放视频 · 需重新打开文件才能继续'],
  ['Video surface closed · reopen the file to continue', '视频渲染面已关闭 · 需重新打开文件才能继续'],
  ['Video selection failed: ', '选择视频失败：'],
  ['Pair loaded · press Play', '配对已载入 · 按播放键'],
  ['Pair could not open: ', '该配对无法打开：'],
  [' Reselect files if access expired.', ' 若授权已失效请重新选择文件。'],
  ['No readable matching script. Reselect access or choose mapping.', '没有可读的匹配脚本。请重新授权或手动指定配对。'],
  ['Search could not start: ', '搜索无法开始：'],
  ['Cannot read selection: ', '无法读取所选项：'],
  [' Reselect or use Select files.', ' 请重新选择，或改用“选择文件”。'],
  ['Folder access expired or unavailable. Select the folder again. ', '文件夹授权已失效或不可访问。请重新选择该文件夹。'],
  ['Folder selection is unavailable. Use Select files instead.', '该设备不支持选择文件夹。请改用“选择文件”。'],
  ['Folder selection unavailable. Select individual video/script files instead.',
    '无法选择文件夹。请逐个选择视频与脚本文件。'],
  ['Library access failed: ', '访问脚本库失败：'],
  ['Library unavailable. Remove and reselect it: ', '脚本库不可用。请移除后重新选择：'],
  ['Scanned ', '已扫描 '],
  [' entries · ', ' 项 · '],
  [' skipped', ' 项已跳过'],
  [' entries', ' 项'],
  ['Indexing script library: ', '正在建立脚本库索引：'],
  ['Refreshing script library: ', '正在刷新脚本库：'],
  ['Refreshing selected folder…', '正在刷新所选文件夹…'],
  ['Scanning selected resources…', '正在扫描所选资源…'],
  ['Cancelled · partial results remain available', '已取消 · 已有部分结果仍可用'],
  [' video / ', ' 个视频 / '],
  [' scripts / ', ' 个脚本 / '],
  [' ZIP', ' 个压缩包'],
  [' ms', ' 毫秒'],
  ['paired', '已配对'],
  ['video-only', '仅有视频'],
  ['script-only', '仅有脚本'],
  ['ambiguous', '需手动配对'],
  ['idle', '空闲'],
  ['disconnected', '未连接'],
  ['connecting', '连接中'],
  ['connected', '已连接'],
  ['fault', '故障'],
  ['Device profiles ⌄', '设备档案 ⌄'],
  ['Device profiles ⌃', '设备档案 ⌃'],
  [' · profile changes apply after restart', ' · 设备档案更改需重启后生效'],
  ['Active now: ', '当前生效：'],
  ['Retry saving settings', '重试保存设置'],
  ['Review recovered settings before saving', '保存前请先检查已恢复的设置'],
  ['Close resource list', '关闭资源列表'],
  ['Script, motion, home and limit state', '脚本、运动、归位与限位状态'],
  ['Axis script links', '轴脚本联动'],
  ['Axis bypass and transitions', '轴旁路与过渡'],
  ['Motion provider settings', '运动提供方设置'],
  ['Smart limit settings', '智能限位设置'],
  ['Speed limit settings', '速度限制设置'],
  ['Auto home settings', '自动归位设置'],
  ['Set AB loop start, end, or clear', '设置 AB 循环的起点、终点或清除'],
  ['Playback fault · output closed: ', '播放故障 · 输出已关闭：'],
  ['prepared', '已就绪'],
  ['playing', '播放中'],
  ['paused', '已暂停'],
  ['completed', '已播完'],
  ['stopped', '已停止'],
  ['released', '已释放'],
  ['error', '出错']
];

class Texts {
  private static exact: Map<string, string> | undefined = undefined;
  private static phrases: string[] = [];
  private static chinese: boolean = false;
  private static ready: boolean = false;

  private static init(): void {
    const map: Map<string, string> = new Map<string, string>();
    const phrases: string[] = [];
    for (const row of ENTRIES) {
      map.set(row[0], row[1]);
      if (row[0].length >= 6 && (row[0].includes(' ') || row[0].includes(':'))) { phrases.push(row[0]); }
    }
    phrases.sort((a: string, b: string): number => b.length - a.length);
    Texts.exact = map;
    Texts.phrases = phrases;
    let language: string = 'default';
    try { language = i18n.System.getAppPreferredLanguage(); } catch (error) { language = 'default'; }
    Texts.chinese = language.startsWith('zh');
    Texts.ready = true;
    hilog.info(DOMAIN, 'mfp', 'language=%{public}s chinese=%{public}s keys=%{public}d',
      language, String(Texts.chinese), map.size);
  }

  static translate(source: string): string {
    if (!Texts.ready) { Texts.init(); }
    if (!Texts.chinese || source.length === 0) { return source; }
    const exact = Texts.exact as Map<string, string>;
    const direct: string | undefined = exact.get(source);
    if (direct !== undefined) { return direct; }
    let result: string = source;
    for (const key of Texts.phrases) {
      if (result.includes(key)) { result = result.split(key).join(exact.get(key) as string); }
    }
    return result;
  }
}

export function t(source: string): string { return Texts.translate(source); }
