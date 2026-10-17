import { UiStyle } from '../presentation/UiStyle';
import { t } from '../l10n/Texts';
import { MediaSourceConfiguration } from '../settings/MediaSourceConfiguration';
import { SettingsChoiceField, SettingsNumberField, SettingsOption, SettingsSectionTitle, SettingsTextField } from './CurvePointEditor';

/** Pure copies only. An edit is never a connect or playback command. */
export class DeoVrSourceEdits {
  static source(configuration: MediaSourceConfiguration, value: string): MediaSourceConfiguration | null {
    if (value !== 'internal' && value !== 'deovr' && value !== 'heresphere') { return null; }
    const next: MediaSourceConfiguration = MediaSourceConfiguration.clone(configuration);
    next.selectedSource = value;
    return next;
  }
  static host(configuration: MediaSourceConfiguration, value: string): MediaSourceConfiguration | null {
    if (configuration.selectedSource === 'internal') { return null; }
    const next: MediaSourceConfiguration = MediaSourceConfiguration.clone(configuration);
    if (next.selectedSource === 'heresphere') { next.hereSphere.host = value; }
    else { next.deoVr.host = value; }
    return MediaSourceConfiguration.validate(next).length === 0 ? next : null;
  }
  static port(configuration: MediaSourceConfiguration, value: number): MediaSourceConfiguration | null {
    if (configuration.selectedSource === 'internal') { return null; }
    const next: MediaSourceConfiguration = MediaSourceConfiguration.clone(configuration);
    if (next.selectedSource === 'heresphere') { next.hereSphere.port = value; }
    else { next.deoVr.port = value; }
    return MediaSourceConfiguration.validate(next).length === 0 ? next : null;
  }
}

@Component
export struct DeoVrSourcePanel {
  @Prop @Watch('ownerChanged') configuration: MediaSourceConfiguration = new MediaSourceConfiguration();
  @Prop @Watch('ownerChanged') readOnly: boolean = false;
  @Prop compact: boolean = false;
  @Prop @Watch('runtimeChanged') connected: boolean = false;
  @Prop @Watch('runtimeChanged') busy: boolean = false;
  @Prop @Watch('runtimeChanged') closeConfirmed: boolean = true;
  @Prop @Watch('runtimeChanged') status: string = '未连接';
  @Prop @Watch('runtimeChanged') error: string = '';
  @Prop mediaPath: string = '';
  @Prop positionSeconds: number | null = null;
  @Prop durationSeconds: number | null = null;
  @Prop playing: boolean = false;
  @Prop stale: boolean = true;
  onChange: (configuration: MediaSourceConfiguration) => void = (_configuration: MediaSourceConfiguration): void => {};
  onConnect: () => void = (): void => {};
  onDisconnect: () => void = (): void => {};
  @State private pendingRequest: string = '';
  private interactionEpoch: number = 0;
  private active: boolean = true;

  aboutToAppear(): void { this.active = true; this.interactionEpoch++; }
  aboutToDisappear(): void { this.active = false; this.interactionEpoch++; }
  private ownerChanged(): void { this.interactionEpoch++; }
  private runtimeChanged(): void { this.pendingRequest = ''; this.interactionEpoch++; }
  private canEdit(): boolean {
    return this.active && !this.readOnly && !this.busy && !this.connected && this.closeConfirmed && this.pendingRequest === '';
  }
  private canEditEndpoint(): boolean { return this.canEdit() && this.configuration.selectedSource !== 'internal'; }
  private canConnect(): boolean {
    return this.canEditEndpoint() && MediaSourceConfiguration.validate(this.configuration).length === 0;
  }
  private canDisconnect(): boolean {
    // Cancelling an opening socket or closing a live one remains available even
    // when durable settings are read-only or endpoint input is invalid.
    return this.active && this.pendingRequest !== 'disconnect' &&
      (this.busy || this.connected || !this.closeConfirmed || this.pendingRequest === 'connect');
  }
  private emit(next: MediaSourceConfiguration | null): boolean {
    if (next === null || !this.canEdit()) { return false; }
    this.interactionEpoch++;
    this.onChange(next);
    return true;
  }
  private selectSource(value: string): void {
    if (this.canEdit()) { this.emit(DeoVrSourceEdits.source(this.configuration, value)); }
  }
  private commitHost(value: string): boolean {
    return this.canEditEndpoint() && this.emit(DeoVrSourceEdits.host(this.configuration, value));
  }
  private commitPort(value: number): boolean {
    return this.canEditEndpoint() && this.emit(DeoVrSourceEdits.port(this.configuration, value));
  }
  private sourceHandler(): (value: string) => void {
    const owner: MediaSourceConfiguration = this.configuration; const epoch: number = this.interactionEpoch;
    return (value: string): void => {
      if (this.configuration === owner && this.interactionEpoch === epoch) { this.selectSource(value); }
    };
  }
  private hostHandler(): (value: string) => boolean {
    const owner: MediaSourceConfiguration = this.configuration; const epoch: number = this.interactionEpoch;
    return (value: string): boolean => this.configuration === owner && this.interactionEpoch === epoch && this.commitHost(value);
  }
  private portHandler(): (value: number) => boolean {
    const owner: MediaSourceConfiguration = this.configuration; const epoch: number = this.interactionEpoch;
    return (value: number): boolean => this.configuration === owner && this.interactionEpoch === epoch && this.commitPort(value);
  }
  private connectionHandler(disconnect: boolean): () => void {
    const owner: MediaSourceConfiguration = this.configuration; const epoch: number = this.interactionEpoch;
    return (): void => {
      if (this.configuration !== owner || this.interactionEpoch !== epoch) { return; }
      if (disconnect) { this.disconnect(); } else { this.connect(); }
    };
  }
  private connect(): void {
    if (!this.canConnect()) { return; }
    this.pendingRequest = 'connect'; this.interactionEpoch++;
    this.onConnect();
  }
  private disconnect(): void {
    if (!this.canDisconnect()) { return; }
    this.pendingRequest = 'disconnect'; this.interactionEpoch++;
    this.onDisconnect();
  }
  private sources(): SettingsOption[] {
    return [new SettingsOption('internal', 'Internal · 内部时钟 / Download 视频'),
      new SettingsOption('deovr', 'DeoVR · 远程播放器'), new SettingsOption('heresphere', 'HereSphere · 远程播放器')];
  }
  private sourceLabel(): string {
    return this.configuration.selectedSource === 'heresphere' ? 'HereSphere' :
      this.configuration.selectedSource === 'deovr' ? 'DeoVR' : 'Internal';
  }
  private endpointHost(): string {
    return this.configuration.selectedSource === 'heresphere' ? this.configuration.hereSphere.host : this.configuration.deoVr.host;
  }
  private endpointPort(): number {
    return this.configuration.selectedSource === 'heresphere' ? this.configuration.hereSphere.port : this.configuration.deoVr.port;
  }
  private seconds(value: number | null): string {
    return value !== null && Number.isFinite(value) && value >= 0 ? value.toFixed(2) + ' 秒' : '未知';
  }
  private freshness(): string {
    if (!this.connected) { return '未连接 · 不使用远程时钟'; }
    return this.stale ? '远程状态已过期 · 禁止按旧状态发送' : '远程状态有效';
  }
  private connectionLabel(): string {
    if (this.pendingRequest === 'disconnect') { return '正在取消 / 断开…'; }
    if (this.busy || this.pendingRequest === 'connect') { return '取消连接 / 断开'; }
    if (!this.connected && !this.closeConfirmed) { return '重试断开'; }
    return '断开 ' + this.sourceLabel();
  }
  build() {
    // The parent workspace owns scrolling and passes the saved density choice.
    // Both densities retain at least 52vp touch targets in a narrow pane.
    Column({ space: UiStyle.gap(this.compact) }) {
      SettingsSectionTitle({ label: '媒体来源 · MEDIA SOURCE' })
      if (this.readOnly) {
        Text('当前设置仅可查看；已有连接仍可取消或断开。').fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.warning).width('100%')
      }
      SettingsChoiceField({ label: '来源', selected: this.configuration.selectedSource, options: this.sources(),
        compact: this.compact, editable: this.canEdit(), onSelect: this.sourceHandler() })
      if (this.configuration.selectedSource === 'internal') {
        Text('Internal 包含内部脚本时钟和已授权 Download 视频。选择来源不会自动播放或启用物理输出。')
          .fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
      } else {
        SettingsTextField({ label: this.sourceLabel() + ' 主机 / IP · 不含凭据', value: this.endpointHost(),
          compact: this.compact, editable: this.canEditEndpoint(), onCommit: this.hostHandler() })
        SettingsNumberField({ label: 'TCP 端口', value: this.endpointPort(), minimum: 1, maximum: 65535,
          integer: true, compact: this.compact, editable: this.canEditEndpoint(), onCommit: this.portHandler() })
        Text('仅保存来源选择和端点。恢复设置不会自动连接、播放或启用输出。连接期间请先断开，再修改来源或端点。')
          .fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
        Button('连接 ' + this.sourceLabel()).fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.ink).backgroundColor(UiStyle.accentSoft)
          .type(ButtonType.Normal).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 14, right: 14, top: 12, bottom: 12 }).borderRadius(UiStyle.radius).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).width('100%').enabled(this.canConnect())
          .accessibilityText('显式连接 ' + this.sourceLabel()).fontColor(UiStyle.field).backgroundColor(UiStyle.accent).onClick(this.connectionHandler(false))
      }
      if (this.busy || this.connected || !this.closeConfirmed || this.pendingRequest !== '') {
        Button(this.connectionLabel()).fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.ink).backgroundColor(UiStyle.accentSoft)
          .type(ButtonType.Normal).stateEffect(true).labelStyle({ maxLines: 10, overflow: TextOverflow.Clip }).padding({ left: 14, right: 14, top: 12, bottom: 12 }).borderRadius(UiStyle.radius).constraintSize({ minHeight: UiStyle.control, maxWidth: '100%' }).width('100%').enabled(this.canDisconnect())
          .accessibilityText('取消连接或断开 ' + this.sourceLabel()).fontColor(UiStyle.field).backgroundColor(UiStyle.danger).onClick(this.connectionHandler(true))
      }
      if (this.configuration.selectedSource !== 'internal' || this.connected || this.busy || !this.closeConfirmed) {
        Text('连接状态：' + t(this.status)).fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.ink).width('100%').wordBreak(WordBreak.BREAK_ALL)
        Text(this.freshness()).fontSize(UiStyle.body(this.compact)).fontColor(this.stale ? UiStyle.warning : UiStyle.success).width('100%')
        if (!this.closeConfirmed && !this.connected && !this.busy) {
          Text('尚未确认底层连接已关闭；重新连接和编辑继续锁定。').fontSize(UiStyle.helper).fontColor(UiStyle.warning).width('100%')
        }
        if (this.error.length > 0) { Text(this.error).fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.danger).width('100%') }
        Text('收到的媒体路径：' + (this.mediaPath.length > 0 ? this.mediaPath : '无'))
          .fontSize(UiStyle.helper).fontColor(UiStyle.ink).width('100%').wordBreak(WordBreak.BREAK_ALL)
        Text('位置：' + this.seconds(this.positionSeconds) + ' / 时长：' + this.seconds(this.durationSeconds))
          .fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.ink).width('100%').wordBreak(WordBreak.BREAK_ALL)
        Text('收到的播放状态：' + (this.playing ? '播放中' : '暂停 / 未开始'))
          .fontSize(UiStyle.body(this.compact)).fontColor(UiStyle.ink).width('100%').wordBreak(WordBreak.BREAK_ALL)
        Text('播放 / 暂停和速度控制会先暂停输出；只有原已 Arm 的目标可在后续同源状态与新合法帧确认后继续。TCP 发送完成不是播放器确认；无法确认或超时需重新 Arm。跳转仍解除 Arm。远程路径仅作为媒体标识，不授予本地文件访问权。')
          .fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
      }
    }.width('100%').padding({ top: UiStyle.padding(this.compact), bottom: UiStyle.padding(this.compact) })
  }
}
