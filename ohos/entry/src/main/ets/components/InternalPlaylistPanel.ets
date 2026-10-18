import { UiStyle } from '../presentation/UiStyle';
import { SettingsDraftOwner } from '../presentation/SettingsDraftOwner';
import { PlaylistPanelAction, PlaylistPanelSnapshot, PlaylistPanelRow, PlaylistPresentation } from '../core/playback/PlaylistPresentation';
import { SettingsNumberField, SettingsSwitchField, SettingsSectionTitle } from './CurvePointEditor';

/** Controlled Internal source view. Parent owns scrolling, scanning, session,
 * cancellation and all clocks. Density is an explicit preference on every device. */
@Component
export struct InternalPlaylistPanel {
  draftOwner: SettingsDraftOwner = new SettingsDraftOwner();
  @Prop draftScope: string = '';
  @Prop draftEpoch: number = 0;
  @Prop snapshot: PlaylistPanelSnapshot = new PlaylistPanelSnapshot();
  @Prop compact: boolean = false;
  onAction: (action: PlaylistPanelAction) => void = (_action: PlaylistPanelAction): void => {};
  private editable(): boolean { return !this.snapshot.readOnly && !this.snapshot.busy; }
  private active(): boolean { return this.editable() && this.snapshot.connected; }
  private timed(): boolean { return this.editable() && (this.snapshot.connected || this.snapshot.mediaConnected) && Number.isFinite(this.snapshot.positionSeconds) && Number.isFinite(this.snapshot.durationSeconds); }
  private emit(kind: string, index: number = -1, value: number = 0, enabled: boolean = false): void {
    if (this.snapshot.readOnly || (this.snapshot.busy && kind !== 'cancel')) { return; }
    this.onAction(new PlaylistPanelAction(kind, index, value, enabled));
  }
  @Builder
  private command(label: string, kind: string, enabled: boolean) {
    Button(label)
      .type(ButtonType.Normal).buttonStyle(ButtonStyleMode.NORMAL).controlSize(ControlSize.NORMAL).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 12, right: 12, top: 8, bottom: 8 }).constraintSize({ minHeight: UiStyle.controlFor(this.compact), maxWidth: '100%', minWidth: UiStyle.controlFor(this.compact) }).responseRegion({ y: -4, width: '100%', height: UiStyle.control })
      .fontSize(UiStyle.textFor(this.compact)).borderRadius(UiStyle.radius).margin({ right: 6, bottom: 6 })
      .enabled(enabled).accessibilityText(label).fontColor(kind === 'connect' && !this.snapshot.connected ? UiStyle.field : kind === 'connect' || kind === 'clear' || kind === 'cleanup' ? UiStyle.danger : UiStyle.ink).backgroundColor(kind === 'connect' && !this.snapshot.connected ? UiStyle.accent : UiStyle.field).border({ width: 1, color: kind === 'connect' && !this.snapshot.connected ? UiStyle.accent : UiStyle.edge })
      .stateStyles({
        focused: { .outline({ width: 2, color: UiStyle.accent }) },
        disabled: { .opacity(UiStyle.disabledOpacity) }
      }).onClick(() => this.emit(kind))
  }
  @Builder
  private playlistRow(row: PlaylistPanelRow) {
    Column({ space: UiStyle.gap(this.compact) }) {
      Text((row.index + 1) + '. ' + row.name + (row.exists ? '' : ' · 已缺失'))
        .fontSize(UiStyle.textFor(this.compact)).fontColor(row.exists ? UiStyle.ink : UiStyle.danger).width('100%').wordBreak(WordBreak.BREAK_ALL)
      Button(row.index === this.snapshot.currentIndex ? '▶ 当前脚本' : '选择此脚本')
        .type(ButtonType.Normal).buttonStyle(ButtonStyleMode.NORMAL).controlSize(ControlSize.NORMAL).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 12, right: 12, top: 8, bottom: 8 }).borderRadius(UiStyle.radius)
        .width('100%').constraintSize({ minHeight: UiStyle.controlFor(this.compact), maxWidth: '100%', minWidth: UiStyle.controlFor(this.compact) }).responseRegion({ y: -4, width: '100%', height: UiStyle.control }).fontSize(UiStyle.textFor(this.compact))
        .enabled(this.active() && row.exists).accessibilityText((row.index === this.snapshot.currentIndex ? '当前脚本：' : '选择脚本：') + row.name)
        .fontColor(!row.exists ? UiStyle.danger : row.index === this.snapshot.currentIndex ? UiStyle.accent : UiStyle.ink).backgroundColor(row.index === this.snapshot.currentIndex ? UiStyle.accentSoft : UiStyle.field).border({ width: 1, color: row.index === this.snapshot.currentIndex ? UiStyle.accent : UiStyle.edge }).fontWeight(row.index === this.snapshot.currentIndex ? FontWeight.Medium : FontWeight.Normal)
        .stateStyles({
          focused: { .outline({ width: 2, color: UiStyle.accent }) },
          disabled: { .opacity(UiStyle.disabledOpacity) }
        }).onClick(() => this.emit('select', row.index))
      Button('移除')
        .type(ButtonType.Normal).buttonStyle(ButtonStyleMode.NORMAL).controlSize(ControlSize.NORMAL).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 12, right: 12, top: 8, bottom: 8 }).borderRadius(UiStyle.radius).constraintSize({ minHeight: UiStyle.controlFor(this.compact), maxWidth: '100%', minWidth: UiStyle.controlFor(this.compact) }).responseRegion({ y: -4, width: '100%', height: UiStyle.control }).fontSize(UiStyle.textFor(this.compact))
        .enabled(this.active()).accessibilityText('从队列移除 ' + row.name)
        .fontColor(UiStyle.danger).backgroundColor(UiStyle.field).border({ width: 1, color: UiStyle.edge })
        .stateStyles({
          focused: { .outline({ width: 2, color: UiStyle.accent }) },
          disabled: { .opacity(UiStyle.disabledOpacity) }
        }).onClick(() => this.emit('remove', row.index))
    }.width('100%').padding({ top: 8, bottom: 8 }).margin({ bottom: 8 }).border({ width: { bottom: 1 }, color: UiStyle.edge })
  }
  build() {
    Column({ space: UiStyle.gap(this.compact) }) {
      SettingsSectionTitle({ label: 'INTERNAL · 脚本播放列表', topLevel: true })
      Text(this.snapshot.connected ? '已连接 · ' + Math.max(0, this.snapshot.currentIndex + 1) + ' / ' + this.snapshot.rows.length : '未连接 Internal')
        .fontSize(UiStyle.textFor(this.compact)).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
      if (this.snapshot.readOnly) {
        Text('当前设置版本仅可查看；列表仍可滚动。').fontSize(UiStyle.textFor(this.compact)).fontColor(UiStyle.warning).width('100%')
      }
      if (this.snapshot.busy) {
        Flex({ wrap: FlexWrap.Wrap, alignItems: ItemAlign.Center }) {
          LoadingProgress().width(24).height(24)
          Text('正在刷新或加载脚本…').fontSize(UiStyle.textFor(this.compact)).width('100%')
          Button('取消').fontSize(UiStyle.textFor(this.compact))
            .type(ButtonType.Normal).buttonStyle(ButtonStyleMode.NORMAL).controlSize(ControlSize.NORMAL).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 12, right: 12, top: 8, bottom: 8 }).borderRadius(UiStyle.radius).constraintSize({ minHeight: UiStyle.controlFor(this.compact), maxWidth: '100%', minWidth: UiStyle.controlFor(this.compact) }).responseRegion({ y: -4, width: '100%', height: UiStyle.control }).enabled(!this.snapshot.readOnly).fontColor(UiStyle.ink).backgroundColor(UiStyle.field).border({ width: 1, color: UiStyle.edge })
            .stateStyles({
              focused: { .outline({ width: 2, color: UiStyle.accent }) },
              disabled: { .opacity(UiStyle.disabledOpacity) }
            }).onClick(() => this.emit('cancel'))
        }.width('100%')
      }
      if (this.snapshot.error.length > 0) {
        Text(this.snapshot.error).fontSize(UiStyle.textFor(this.compact)).fontColor(UiStyle.danger).width('100%')
      }
      Flex({ wrap: FlexWrap.Wrap }) {
        this.command(this.snapshot.connected ? '断开 Internal' : '连接 Internal', 'connect', this.editable())
        this.command('刷新托管脚本', 'refresh', this.editable())
        this.command('清理缺失项', 'cleanup', this.active() && this.snapshot.hasPlaylist)
        this.command('清空队列', 'clear', this.active() && this.snapshot.hasPlaylist)
      }.width('100%')
      Column() {
        SettingsSwitchField({ label: '自动连接', value: this.snapshot.autoConnect, compact: this.compact,
          onChange: (enabled: boolean) => this.emit('autoConnect', -1, 0, enabled) })
        SettingsSwitchField({ label: '加载附加多轴脚本', value: this.snapshot.loadAdditionalScripts, compact: this.compact,
          onChange: (enabled: boolean) => this.emit('loadAdditionalScripts', -1, 0, enabled) })
      }.width('100%').enabled(this.editable())
      Column() {
        SettingsSwitchField({ label: '循环当前项', value: this.snapshot.looping, compact: this.compact,
          onChange: (enabled: boolean) => this.emit('loop', -1, 0, enabled) })
        SettingsSwitchField({ label: '随机播放', value: this.snapshot.shuffling, compact: this.compact,
          onChange: (enabled: boolean) => this.emit('shuffle', -1, 0, enabled) })
      }.width('100%').enabled(this.active())
      Text(this.snapshot.looping ? '循环当前项：上一项 / 下一项均从当前项开头重播。' :
        this.snapshot.shuffling ? '随机模式：上一项 / 下一项随机选取，可能再次选中当前项。' : '顺序模式：到达列表边界时暂停，不首尾循环。')
        .fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
      Flex({ wrap: FlexWrap.Wrap }) {
        this.command('上一项', 'previous', this.active() && this.snapshot.hasPlaylist)
        this.command('下一项', 'next', this.active() && this.snapshot.hasPlaylist)
        this.command('随机一项', 'random', this.active() && this.snapshot.hasPlaylist)
      }.width('100%')
      if (this.snapshot.rows.length === 0) {
        Text('队列为空。Download 扫描中的托管脚本可在下方加入。')
          .fontSize(UiStyle.textFor(this.compact)).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL).padding(12)
      } else {
        List({ space: 2 }) {
          ForEach(this.snapshot.rows, (row: PlaylistPanelRow) => {
            ListItem() { this.playlistRow(row) }
          }, (row: PlaylistPanelRow) => row.index + ':' + row.associationId)
        }.width('100%').height(Math.min(this.snapshot.rows.length * 180, 360)).nestedScroll({ scrollForward: NestedScrollMode.SELF_FIRST, scrollBackward: NestedScrollMode.SELF_FIRST })
      }
      SettingsSectionTitle({ label: '可加入队列的托管脚本' })
      if (this.snapshot.managedRows.length === 0) {
        Text('暂无托管脚本。请将脚本放入 Download 后刷新；无需导入选择器。')
          .fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
      } else {
        this.command('全部追加到队列', 'append', this.active())
        List({ space: 4 }) {
          ForEach(this.snapshot.managedRows, (row: PlaylistPanelRow) => {
            ListItem() {
              Column({ space: UiStyle.gap(this.compact) }) {
                Text(row.name).fontSize(UiStyle.textFor(this.compact)).fontColor(UiStyle.ink).width('100%').wordBreak(WordBreak.BREAK_ALL)
                Button('＋ 加入队列')
                .type(ButtonType.Normal).buttonStyle(ButtonStyleMode.NORMAL).controlSize(ControlSize.NORMAL).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 12, right: 12, top: 8, bottom: 8 }).borderRadius(UiStyle.radius).width('100%').constraintSize({ minHeight: UiStyle.controlFor(this.compact), maxWidth: '100%', minWidth: UiStyle.controlFor(this.compact) }).responseRegion({ y: -4, width: '100%', height: UiStyle.control })
                .fontSize(UiStyle.textFor(this.compact)).enabled(this.active() && row.exists).accessibilityText('加入队列 ' + row.name)
                .fontColor(UiStyle.ink).backgroundColor(UiStyle.field).border({ width: 1, color: UiStyle.edge })
                  .stateStyles({
                    focused: { .outline({ width: 2, color: UiStyle.accent }) },
                    disabled: { .opacity(UiStyle.disabledOpacity) }
                  }).onClick(() => this.emit('append', row.index))
              }.width('100%').padding({ top: 8, bottom: 8 }).border({ width: { bottom: 1 }, color: UiStyle.edge })
            }
          }, (row: PlaylistPanelRow) => row.index + ':' + row.associationId)
        }.width('100%').height(Math.min(this.snapshot.managedRows.length * 96, 320)).nestedScroll({ scrollForward: NestedScrollMode.SELF_FIRST, scrollBackward: NestedScrollMode.SELF_FIRST })
      }
      SettingsSectionTitle({ label: 'AB · 媒体片段循环' })
      Text('A ' + PlaylistPresentation.time(this.snapshot.loopStart) + '  →  B ' + PlaylistPresentation.time(this.snapshot.loopEnd))
        .fontSize(UiStyle.textFor(this.compact)).fontColor(this.snapshot.loopStart !== null && this.snapshot.loopEnd !== null ? UiStyle.success : UiStyle.muted).width('100%')
      Flex({ wrap: FlexWrap.Wrap }) {
        this.command('设 A 起点', 'loopStart', this.timed())
        this.command('设 B 终点', 'loopEnd', this.timed())
        this.command('循环当前章节', 'loopChapter', this.timed())
        this.command('循环设置 A / B / 清除', 'loopCycle', this.timed())
        this.command('清除 AB', 'loopClear', this.editable() && (this.snapshot.connected || this.snapshot.mediaConnected) && (this.snapshot.loopStart !== null || this.snapshot.loopEnd !== null))
      }.width('100%')
      SettingsSectionTitle({ label: '自动跳转到脚本开始' })
      Column() {
        SettingsSwitchField({ label: '启用自动跳转', value: this.snapshot.autoSkipEnabled, compact: this.compact,
          onChange: (enabled: boolean) => this.emit('autoSkip', -1, 0, enabled) })
        if (this.snapshot.autoSkipOffset > 0) { Text('当前快捷键偏移：+' + this.snapshot.autoSkipOffset.toString() + ' 秒（原快捷键允许正值；下方编辑器仅设置提前量）').fontSize(UiStyle.helper).width('100%') }
        SettingsNumberField({ draftOwner: this.draftOwner, draftScope: this.draftScope, draftKey: 'autoSkipOffset',
          draftEpoch: this.draftEpoch, label: '提前偏移', unit: '秒 ≤ 0', value: this.snapshot.autoSkipOffset,
          maximum: 0, compact: this.compact, editable: this.editable(),
          onCommit: (value: number): boolean => { this.emit('autoSkipOffset', -1, value); return this.editable(); } })
      }.width('100%').enabled(this.editable())
      if (this.snapshot.autoSkipPending) { Text('自动跳转等待脚本加载…').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL) }
      this.command('跳到脚本开始', 'seekScriptStart', this.timed())
    }.width('100%').padding({ top: UiStyle.padding(this.compact), bottom: UiStyle.padding(this.compact) })
  }
}
