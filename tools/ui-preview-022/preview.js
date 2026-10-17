/* Representative browser mirror only. Production callbacks are never executed. */
(() => {
const M=window.PREVIEW, q=new URLSearchParams(location.search), scene=q.get('scene')||'workspace';
const vp=M.viewports.find(v=>v.id===q.get('viewport'))||M.viewports.find(v=>v.width===innerWidth&&v.height===innerHeight);
if(!vp) throw Error('Use one of the generated viewport sizes.');
const compact=q.get('density')==='compact';
const tokens={...M.tokens,body:compact?M.tokens.compactBody:M.tokens.body,gap:compact?M.tokens.compactGap:M.tokens.gap,padding:compact?M.tokens.compactPadding:M.tokens.padding};
for(const [key,value] of Object.entries(tokens)) document.documentElement.style.setProperty('--'+key,typeof value==='number'?value+'px':value);
document.body.dataset.density=compact?'compact':'readable';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sourced=[]; const missing=[];
const S=s=>{ sourced.push(s); if(!M.sourceStrings.includes(s)) missing.push(s); return esc(s); };
const F=s=>esc(s); // Explicit synthetic runtime data, not a quoted production label.
const p=(s,cls='helper',source=true)=>`<p class="${cls}" ${source?'data-source="literal"':'data-fixture="runtime"'}>${source?S(s):F(s)}</p>`;
const btn=(s,cls='',source=true,attrs='')=>`<button class="${cls}" ${source?'data-source="literal"':'data-fixture="runtime"'} ${attrs}>${source?S(s):F(s)}</button>`;
const title=s=>`<h2 class="section-title" data-source="literal">${S(s)}</h2>`;
const field=(label,value,kind='number',sourceLabel=true)=>`<div class="field"><label ${sourceLabel?'data-source="literal"':'data-fixture="dynamic-label"'}>${sourceLabel?S(label):F(label)}</label><input type="${kind==='number'?'text':kind}" value="${F(value)}" aria-label="${F(label)}" ${kind==='number'?'inputmode="decimal"':''}></div>`;
const choice=(label,value,sourceValue=true)=>`<div class="field"><label data-source="literal">${S(label)}</label><button class="select-display" aria-label="${F(label)}"><span ${sourceValue?'data-source="literal"':'data-fixture="runtime"'}>${sourceValue?S(value):F(value)}</span><span aria-hidden="true">⌄</span></button><p class="selected-value">${sourceValue?S(value):F(value)}</p></div>`;
const toggle=(label,on=false)=>`<div class="switch-field"><label data-source="literal">${S(label)}</label><button role="switch" aria-checked="${on}" aria-label="${F(label)}" class="switch ${on?'on':''}"></button></div>`;
const card=(id,content)=>`<section id="${id}" class="card">${content}</section>`;
const longName='超长中文资源名称_用于验证手机窄屏和横屏的播放状态与脚本对应关系_第一章_最终确认版本_3840x2160.mp4';
const longPath='Download/带有很长名称的已授权媒体文件夹/课程与示例资源/完整中文资源名称和对应的多轴脚本包/'+longName;
const longError=('媒体资源读取失败：当前 Download 目录中的脚本与视频关联已失效。为了避免继续使用过期的来源状态，所有输出已停止发送。请检查授权目录、文件名称及当前来源，刷新后重新选择媒体，再明确连接并启用需要的目标。连接完成与本地写入均不代表设备已执行。错误标识：resource_generation_mismatch_2026_10_16；详细路径：'+longPath+'。').repeat(3).slice(0,512);
function sourcePanel(expanded=false) {
return card('source', `<div class="actions">${btn('内部','source-choice selected',true)}${btn('本地视频','source-choice',true)}${btn('DeoVR · 未连接','source-choice',false)}</div>`+
 p(longName,'filename',false)+
 (expanded?title('媒体来源 · MEDIA SOURCE')+choice('来源','Internal · 内部时钟 / Download 视频')+
 p('Internal 包含内部脚本时钟和已授权 Download 视频。选择来源不会自动播放或启用物理输出。')+
 choice('来源','DeoVR · 远程播放器')+field('DeoVR 主机 / IP · 不含凭据','192.0.2.123','text',false)+field('TCP 端口','23554')+
 p('仅保存来源选择和端点。恢复设置不会自动连接、播放或启用输出。连接期间请先断开，再修改来源或端点。')+
 btn('连接 DeoVR','block-button primary',false)+p('连接状态：等待连接；未启用任何物理输出','helper',false)+
 p('尚未确认底层连接已关闭；重新连接和编辑继续锁定。','helper error-text')+
 p('收到的媒体路径：'+longPath,'helper',false)+
 p('播放 / 暂停和速度控制会先暂停输出；只有原已 Arm 的目标可在后续同源状态与新合法帧确认后继续。TCP 发送完成不是播放器确认；无法确认或超时需重新 Arm。跳转仍解除 Arm。远程路径仅作为媒体标识，不授予本地文件访问权。'):'')+
 btn('关闭媒体并启动独立Motion','block-button')+btn('关闭媒体和输出连接，启动手动预览','block-button')+
 p('独立Motion需要启用轴的“暂停更新”和“无脚本更新”；预览不会自动连接/启用设备。')+
 (expanded?title('本地资源')+p('应用 Download 目录')+p(longPath,'helper',false)+btn('刷新 Download 媒体目录','block-button')+p('请把视频和同名脚本或 ZIP 文件放入此目录。扫描不会复制视频。')+btn('打开所选视频 · 按上游顺序搜索','block-button'):'')
); }
function scriptPanel(expanded=false) {
const toolLabels=[['⌕','资源与脚本库'],['↻','刷新 Download 媒体目录'],['AB','AB 循环'],['▶','播放'],['■','停止输出'],['⌄','媒体时序设置']];
return card('script', `<div class="toolbar">${toolLabels.map(([g,l])=>btn(g,g==='■'?'danger':'',false,`aria-label="${F(l)}"`)).join('')}</div>`+
 `<div class="heatmap" style="height:${compact?M.uiMetrics.heatmapCompact:M.uiMetrics.heatmapReadable}px" role="img" aria-label="示例热力图"></div><input type="range" class="range" min="0" max="100" value="38" aria-label="媒体位置"><div class="row"><span class="helper grow">125.50 / 3600.00 s</span>${btn('热力图 ⌄')}</div>`+
 `<div class="axis-tabs">${['L0','L1','L2','R0','R1','R2'].map((s,i)=>`<button class="${i===0?'selected':''}" data-fixture="axis">${s}<small>● ◇ ○</small></button>`).join('')}</div>`+
 `<div class="toolbar axis-tools">${['▣','↕','Ⅱ','↗','≋','⌁','◴','∿','⌂'].map(s=>btn(s,'',false)).join('')}</div>`+
 p(longName,'filename',false)+btn('重新读取当前轴脚本','block-button')+
 (expanded?title('运动生成器 · MOTION')+choice('生成器','Custom Curve',false)+field('运动生成器混合比例','0.75')+toggle('媒体暂停时继续',true)+toggle('无脚本时继续',true)+title('速度限制 · SPEED LIMIT')+field('每次全行程用时（0 = 无限制）','0')+btn('设为无限制（0 秒 / 全行程）','block-button')+title('智能限制 · SMART LIMIT')+choice('限制模式','Value · 位置')+
 `<svg class="plot" viewBox="0 0 400 136" preserveAspectRatio="none" role="img" aria-label="示例曲线预览"><path d="M0 102H400M0 68H400M0 34H400" stroke="#c6d8df"/><path d="M0 116C60 116 50 18 110 30S180 120 230 82S330 18 400 12" stroke="${tokens.accent}" stroke-width="3" fill="none"/></svg>`+
 field('输入（%）','25')+field('限制因子（%）','75'):'')+
 p('Positive offsets delay the script. Axis and motion edits apply live; sync follows the selected rules.')
); }
function mediaPanel() {
return card('media',choice('播放速度','1.5×',false)+p('脚本幅度：100%','',false)+
 '<input type="range" class="range" min="1" max="400" value="100" aria-label="脚本幅度">'+
 p('全局偏移：+250 ms','',false)+`<div class="actions full">${btn('−50')}${btn('重置')}${btn('+50')}</div>`+
 p('L0 偏移：-50 ms','',false)+`<div class="actions full">${btn('−50')}${btn('重置')}${btn('+50')}</div>`+
 title('AB · 媒体片段循环')+p('A 00:25.500 → B 00:48.000','',false)+
 `<div class="actions">${['设 A 起点','设 B 终点','循环当前章节','循环设置 A / B / 清除','清除 AB'].map(x=>btn(x)).join('')}</div>`+
 title('自动跳转到脚本开始')+toggle('启用自动跳转',true)+field('提前偏移','-0.5')+btn('跳到脚本开始','block-button'));
}
function diagnosticPanel() {
return card('diagnostic', title('专用接收端诊断')+
 p('在自己的电脑运行恢复包 tools/network-diagnostics/receiver.mjs。将它显示的地址与端口填在下方；仅连接专用诊断接收脚本，不要填写运动设备端口。诊断发送一次随机挑战，不发送轴值、不自动 Arm。')+
 choice('诊断协议','TCP')+field('专用接收脚本的主机 / IP','192.0.2.123','text')+field('接收脚本端口','50505')+
 toggle('我确认这是专用诊断接收脚本，不是设备控制端口')+
 btn('开始一次往返诊断','block-button',true,'disabled')+btn('取消诊断 / 关闭连接','block-button danger')+
 p('诊断尚未确认关闭：所有设备连接和 Arm 暂不可用。','helper error-text')+
 p(longError,'helper error-text',false));
}
function outputPanel(expanded=false) {
return card('output', `<h2>${S('网络输出 · 手动连接')}</h2>`+
 p('未启用发送 · 媒体播放与预览独立运行')+
 `<div class="actions">${btn('+ TCP')}${btn('+ UDP')}${btn('+ WebSocket')}${btn('停止全部输出','danger')}</div>`+
 ['TCP · 长名称目标_一号控制器 · disconnected','WebSocket · 超长中文设备名称_需要确认关闭的远端连接 · closing'].map(t=>`<div class="target-row">${btn('● '+t,'target-button selected',false)}${btn('删除','remove danger')}</div>`).join('')+
 p('每类最多10个；切换只选择编辑器，各目标独立发送。恢复配置保持断开，每个目标需明确连接及Arm。')+
 (expanded?p('本地完成写入 123456 次 / 987654321 bytes。不是设备执行确认；UDP 连接仅表示本地绑定。','helper',false)+
 field('目标主机或 IP（不含凭据）','192.0.2.123','text')+field('目标端口','10000')+choice('WebSocket scheme','wss')+field('路径 /（无 query、token、认证）','/motion/device','text')+field('UDP 本地端口（0 自动分配）','0')+
 toggle('Polled 事件模式')+field('固定间隔 ms','16')+toggle('只发送变化值',true)+toggle('设备处理时间（省略 I）')+toggle('允许暂停时 Auto Home')+toggle('允许暂停时 Motion')+toggle('暂停手动过渡输出')+
 p('暂停手动过渡需明确预览 / 开始并单独启用发送（Arm）；仅 Set 修改值不会开始，也不会 Arm。与 Motion 权限独立。')+
 p('手动预览中明确 Arm 可待命，无输出；只有真实手动 Transition 当前帧通过检查后才发送。停止、后台或配置变更会撤销待命。')+
 `<div class="actions full">${btn('连接 / 应用配置','primary')}${btn('断开')}</div><div class="actions full">${btn('启用发送')}${btn('解除发送','danger')}</div>`+
 p(longError,'helper error-text',false)+
 p('若来源历史持续无效，可刷新 Download 媒体文件夹：停止播放、重建运行时并重置 Motion 相位。之后重选媒体、应用输出配置，再明确启用发送。')+
 p('Serial / File / Handy / Buttplug / Pipe 尚未实现；硬件执行尚未验证。'):'')
); }
function preferencesPanel() {
return card('preferences',title('通用 · GENERAL')+
 choice('应用排列方向 · App Orientation','自动 · 跟随可用窗口尺寸')+
 p('控制窗口内面板的排列；不改变系统屏幕旋转锁定。自动模式按窗口尺寸调整；强制横向也保留窄屏触控入口。')+
 choice('界面密度 · UI Density',compact?'紧凑间距 · 手动选择':'舒适易读 · 默认')+
 p('所有设备默认使用舒适易读尺寸。紧凑模式仅收紧间距和正文字号；按钮、开关与输入区域仍至少 52 vp。')+
 choice('错误展示 · Show errors as','底部提示条')+
 p('“不弹出”只关闭错误弹层。持久状态、停止和安全门控始终有效。')+
 title('输入 · KEYBOARD')+toggle('启用键盘映射',true)+field('映射名称（最多 80 字符）','播放控制与输出安全停止','text')+choice('选择组合键成员（最多 8 键）','Control + Shift + Space',false)+choice('触发方式','Hold · 长按',false)+field('最长按住时长','-1')+title('触控等价动作 · TOUCH')+choice('触控动作分类','输出 · 单目标参数与范围',false)+choice('触控输出目标','WebSocket · 超长目标名称_已断开但保留原始配置_第三台设备',false)+choice('触控动作','Output::Range::Maximum::Offset',false)+btn('停止 · F12','block-button danger')+
 title('同步过渡 · SYNC')+field('过渡时长','0.25')+toggle('媒体播放 / 暂停',true)+toggle('自动归位开始 / 结束',true)
); }
const video=q.get('video')==='1'||scene==='video';
const geometry=M.metrics[vp.id][video?'video':'plain'];
const horizontal=!video&&M.metrics[vp.id].horizontal;
document.documentElement.style.setProperty('--inset',(video?M.metrics[vp.id].videoInset:M.metrics[vp.id].plainInset)+'px');
let source=sourcePanel(scene==='source'), script=scriptPanel(scene==='axis')+(scene==='media'?mediaPanel():''), output=outputPanel(scene==='output')+(scene==='diagnostic'?diagnosticPanel():''), prefs=preferencesPanel();
const status='<p class="status">预览状态：输出已关闭；端点未连接。修改参数不代表播放、连接或启用发送。</p>';
let left,right;
if(horizontal) { left=status+source+output+prefs; right=script; }
else { left=status+(video?script+source:source+script)+output+prefs; right=''; }
function pane(content,id) { return `<div class="scroll-pane" id="${id}" tabindex="0" aria-label="${id==='source-pane'?'来源与设置滚动区域':'脚本参数滚动区域'}"><div class="content">${content}<p class="preview-marker" data-audit-end="${id}">预览内容末尾 · 所有下方控件可滚动访问</p></div></div>`; }
const headerTools=`${btn('⌕','icon-button',false,'aria-label="资源与脚本库"')}${btn('?','icon-button',false,'aria-label="移植状态与限制"')}`;
const globalStop=btn('停止','global-stop danger',false,'aria-label="全局停止 · F12"');
const header=vp.width<320?`<header class="app-header wrapped" style="height:${geometry.headerHeight}px"><div class="header-row"><h1 style="font-size:22px">MultiFunPlayer</h1>${globalStop}</div><div class="header-row">${headerTools}${vp.width>=240?`<span class="version">${F(M.version)} OHOS</span>`:''}</div></header>`:`<header class="app-header" style="height:${geometry.headerHeight}px"><h1 style="font-size:${vp.width<400?22:24}px">${vp.width<400?'MultiFun<br>Player':'MultiFunPlayer'}</h1>${vp.width>=520?`<span class="version">${F(M.version)} OHOS</span>`:''}${globalStop}${headerTools}</header>`;
const styleRect=r=>`left:${r.x}px;top:${r.y}px;width:${r.width}px;height:${r.height}px`;
const controls=video?`<section class="video" style="${styleRect(geometry.video)}"><div class="video-surface"><span>原生视频区域占位<br>浏览器不播放、不连接设备</span></div><div class="video-controls" style="height:${geometry.controlsHeight}px"><div class="video-main">${btn('▶','icon-button',false,'aria-label="播放或回到开头"')}${btn('■','icon-button danger',false,'aria-label="停止输出"')}${geometry.video.width>=360?`<span class="video-name" title="${F(longName)}">${F(longName)}</span>`:''}${btn('全屏','',true)}</div>${geometry.controlsHeight>=104?'<div class="video-seek"><input class="range" type="range" value="38" aria-label="视频进度"><span>125.5 / 3600.0 s</span></div>':''}</div></section>`:'';
const overlay=scene==='dialog'?`<div class="overlay"><section class="dialog" style="height:${Math.max(200,Math.min(620,vp.height-24))}px" role="dialog" aria-label="错误"><h2>错误</h2><p class="message" tabindex="0" data-fixture="512-character-error">${F(longError)}</p><div class="dialog-actions">${btn('知道了','',true,'data-dismiss')}${btn('全局停止 · F12','danger',true,'data-dismiss')}</div></section></div>`:scene==='snackbar'?`<section class="snackbar"><p class="message" style="height:${Math.max(52,Math.min(120,vp.height*.22))}px" tabindex="0" data-fixture="512-character-error">${F(longError)}</p><div class="snack-actions">${btn('关闭提示','',true,'data-dismiss')}${btn('全局停止','danger',true,'data-dismiss')}</div></section>`:'';
document.getElementById('app').innerHTML=`${header}<main class="workspace" style="${styleRect(geometry.settings)}"><div class="panes ${horizontal?'horizontal':''}">${pane(left,'source-pane')}${right?pane(right,'script-pane'):''}</div>${!video&&(vp.width<840||vp.height<500)?`<div class="transport">${btn('播放','primary')}${btn('停止输出','danger')}</div>`:''}</main>${controls}${overlay}<span class="preview-watermark">浏览器布局近似 · 非原生截图</span>`;
for(const b of document.querySelectorAll('[data-dismiss]')) b.addEventListener('click',()=>b.closest('.overlay,.snackbar').remove());
for(const b of document.querySelectorAll('[role="switch"]')) b.addEventListener('click',()=>{b.classList.toggle('on');b.setAttribute('aria-checked',String(b.classList.contains('on')))});
if(['source','axis','media','output','diagnostic','forms'].includes(scene)) {
  const id={source:'source',axis:'script',media:'media',output:'output',diagnostic:'diagnostic',forms:'preferences'}[scene];
  document.getElementById(id)?.scrollIntoView({block:'start'});
}
window.previewAudit={scene,viewport:vp,compact,video,geometry,horizontal,sourcedLabels:sourced.length,
  missingSourceLabels:[...new Set(missing)],fixtureErrorLength:longError.length,caveats:M.caveats};
})();
