import { common } from '@kit.AbilityKit';
import { fileIo, picker } from '@kit.CoreFileKit';
import { util } from '@kit.ArkTS';
import { systemDateTime } from '@kit.BasicServicesKit';
import { FunscriptParser, FunscriptDocument } from '../core/Funscript';
import { PlaybackEngine } from '../core/PlaybackEngine';
import type { InterpolationMode } from '../core/Interpolation';
import { interpolateAxis } from '../core/Interpolation';
import { AxisMapping } from '../core/AxisMapping';
import { activeChapter, markerMediaPosition } from '../core/MarkerNavigation';

const DEMO: string = '{"actions":[{"at":0,"pos":50},{"at":1000,"pos":15},{"at":2000,"pos":85},{"at":3000,"pos":25},{"at":4000,"pos":75},{"at":5000,"pos":50}],"axes":[{"id":"R0","actions":[{"at":0,"pos":20},{"at":2500,"pos":80},{"at":5000,"pos":20}]}],"metadata":{"chapters":[{"name":"Rise","startTime":"00:00:00","endTime":"00:00:02.500"},{"name":"Return","startTime":"00:00:02.500","endTime":"00:00:05"}],"bookmarks":[{"name":"First low point","time":"00:00:01"},{"name":"Second low point","time":"00:00:03"}]}}';

@Entry
@Component
struct Index {
  @StorageLink('mfpForeground') @Watch('foregroundChanged') foreground: boolean = true;
  @State widthVp: number = 400;
  @State heightVp: number = 800;
  @State playing: boolean = false;
  @State positionMs: number = 0;
  @State durationMs: number = 5000;
  @State axisNames: string[] = ['L0', 'R0'];
  @State axisValues: number[] = [50, 20];
  @State selectedAxis: number = 0;
  @State selectedTab: number = 0;
  @State fileName: string = 'Synthetic demo · 5 seconds';
  @State status: string = 'Simulation only · no device commands';
  @State importing: boolean = false;
  @State interpolationMode: InterpolationMode = 'linear';
  @State playbackSpeed: number = 1;
  @State globalOffsetMs: number = 0;
  @State axisOffsetMs: number = 0;
  @State chapterLabel: string = 'No active chapter';
  @State connected: boolean = true;
  private engine: PlaybackEngine = new PlaybackEngine();
  @State document: FunscriptDocument = FunscriptParser.parse(DEMO);
  private timer: number = -1;
  private lastTick: number = 0;
  private canvas: CanvasRenderingContext2D = new CanvasRenderingContext2D(new RenderingContextSettings(true));

  aboutToAppear(): void {
    this.engine.load(this.document);
    this.engine.setConnected(true);
    this.sync();
    this.lastTick = systemDateTime.getUptime(systemDateTime.TimeType.ACTIVE);
    this.timer = setInterval(() => {
      const now = systemDateTime.getUptime(systemDateTime.TimeType.ACTIVE);
      this.engine.tick(Math.max(0, now - this.lastTick));
      this.lastTick = now;
      this.sync();
    }, 40);
  }
  aboutToDisappear(): void {
    if (this.timer >= 0) { clearInterval(this.timer); this.timer = -1; }
    this.engine.stop();
  }
  foregroundChanged(): void {
    this.engine.setForeground(this.foreground);
    if (!this.foreground) { this.status = 'Paused for safety · press Play to resume'; }
    this.sync();
  }
  sync(): void {
    const state = this.engine.snapshot();
    this.playing = state.state === 'playing';
    this.positionMs = state.positionMs;
    this.durationMs = state.durationMs;
    this.axisNames = this.document.axes.map((axis) => axis.name);
    this.axisValues = this.engine.previewSamples().map((sample) => sample.position);
    this.playbackSpeed = state.speed;
    this.globalOffsetMs = state.globalOffsetMs;
    this.interpolationMode = state.interpolationMode;
    const axisName = this.axisNames[this.selectedAxis] || 'L0';
    this.axisOffsetMs = this.engine.getAxisOffset(axisName);
    const scriptTime = this.engine.getScriptPosition(axisName);
    const chapter = activeChapter(this.document.metadata, scriptTime);
    this.chapterLabel = chapter === undefined ? 'No active chapter' : chapter.name;
    this.drawTrace();
  }
  playPause(): void {
    if (this.importing) { return; }
    if (this.playing) { this.engine.pause(); }
    else {
      if (this.positionMs >= this.durationMs) { this.engine.seek(0); }
      this.lastTick = systemDateTime.getUptime(systemDateTime.TimeType.ACTIVE);
      this.engine.play();
    }
    this.sync();
  }
  stop(): void {
    this.engine.stop();
    this.status = 'Stopped · simulation output disabled';
    this.sync();
  }
  async importScript(): Promise<void> {
    if (this.importing) { return; }
    this.importing = true;
    this.engine.pause();
    this.sync();
    try {
      const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
      const options = new picker.DocumentSelectOptions();
      options.maxSelectNumber = 1;
      const uris = await new picker.DocumentViewPicker(context).select(options);
      if (uris.length === 0) { this.status = 'Import cancelled · playback remains paused'; return; }
      const file = await fileIo.open(uris[0], fileIo.OpenMode.READ_ONLY);
      let contents: string = '';
      try {
        const stat = await fileIo.stat(file.fd);
        if (stat.size < 1 || stat.size > 2 * 1024 * 1024) { throw new Error('Choose a nonempty script below 2 MiB'); }
        const buffer = new ArrayBuffer(stat.size);
        let offset: number = 0;
        while (offset < stat.size) {
          const chunk = new ArrayBuffer(stat.size - offset);
          const count = await fileIo.read(file.fd, chunk);
          if (count <= 0) { throw new Error('Script read ended unexpectedly'); }
          new Uint8Array(buffer).set(new Uint8Array(chunk, 0, count), offset);
          offset += count;
        }
        contents = util.TextDecoder.create('utf-8', { fatal: true }).decodeToString(new Uint8Array(buffer));
      } finally { await fileIo.close(file); }
      let leaf = uris[0].slice(uris[0].lastIndexOf('/') + 1).split('?')[0];
      try { leaf = decodeURIComponent(leaf); } catch (error) { leaf = 'Imported script'; }
      const parsed = AxisMapping.parseScript(contents, leaf);
      this.document = parsed;
      this.engine.load(parsed);
      this.selectedAxis = 0;
      this.fileName = leaf.length > 0 ? leaf : 'Imported script';
      this.status = 'Imported locally · press Play to simulate';
      this.sync();
    } catch (error) {
      this.status = 'Import failed: ' + (error as Error).message;
    } finally { this.importing = false; }
  }
  drawTrace(): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (w <= 0 || h <= 0) { return; }
    this.canvas.clearRect(0, 0, w, h);
    this.canvas.strokeStyle = '#293544';
    this.canvas.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      this.canvas.beginPath(); this.canvas.moveTo(0, i * h / 4); this.canvas.lineTo(w, i * h / 4); this.canvas.stroke();
    }
    if (this.document.axes.length === 0) { return; }
    const axis = this.document.axes[Math.min(this.selectedAxis, this.document.axes.length - 1)];
    this.canvas.strokeStyle = '#56D9CC';
    this.canvas.lineWidth = 2;
    this.canvas.beginPath();
    const samples = Math.max(2, Math.min(1200, Math.ceil(w * 2)));
    for (let i = 0; i <= samples; i++) {
      const mediaTime = i / samples * this.durationMs;
      const scriptTime = mediaTime - this.globalOffsetMs - this.engine.getAxisOffset(axis.name);
      const x = i / samples * w;
      const y = h - interpolateAxis(axis, scriptTime, this.interpolationMode) / 100 * h;
      if (i === 0) { this.canvas.moveTo(x, y); } else { this.canvas.lineTo(x, y); }
    }
    this.canvas.stroke();
    const cursor = this.positionMs / Math.max(1, this.durationMs) * w;
    this.canvas.strokeStyle = '#FFCA80';
    this.canvas.beginPath(); this.canvas.moveTo(cursor, 0); this.canvas.lineTo(cursor, h); this.canvas.stroke();
  }
  @Builder
  heading(title: string, detail: string) {
    Row() {
      Text(title).fontSize(17).fontWeight(FontWeight.Medium).fontColor('#EDF3FA').layoutWeight(1)
      Text(detail).fontSize(12).fontColor('#8FA3B9')
    }.width('100%').margin({ bottom: 14 })
  }
  @Builder
  timeline() {
    Column({ space: 12 }) {
      this.heading('Script timeline', this.interpolationMode.toUpperCase())
      Text(this.fileName).fontSize(13).fontColor('#A9B8CB').width('100%').maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
      Scroll() {
      Row({ space: 8 }) {
        ForEach(this.axisNames, (name: string, index: number) => {
          Button(name).height(48).fontSize(14).backgroundColor(index === this.selectedAxis ? '#216C68' : '#263445')
            .onClick(() => { this.selectedAxis = index; this.sync(); })
        })
      }
      }.width('100%').scrollable(ScrollDirection.Horizontal)
      Canvas(this.canvas).width('100%').height(this.heightVp < 500 ? 100 : 180)
        .onReady(() => this.drawTrace())
      Slider({ value: this.positionMs, min: 0, max: Math.max(1, this.durationMs), step: 1 })
        .selectedColor('#56D9CC').trackColor('#334357').blockColor('#E3F6F4')
        .onChange((value: number) => { this.engine.seek(value); this.sync(); })
      Row() {
        Text((this.positionMs / 1000).toFixed(2) + ' s').fontColor('#EDF3FA')
        Blank()
        Text((this.durationMs / 1000).toFixed(2) + ' s').fontColor('#8FA3B9')
      }.width('100%')
    }.padding(18).backgroundColor('#1A2432').borderRadius(12).width('100%')
  }
  @Builder
  axes() {
    Column({ space: 12 }) {
      this.heading('Axis monitor', '0–100%')
      ForEach(this.axisNames, (name: string, index: number) => {
        Row({ space: 12 }) {
          Text(name).fontColor('#E0E8F2').width(38)
          Progress({ value: this.axisValues[index], total: 100, type: ProgressType.Linear })
            .color('#56D9CC').backgroundColor('#334357').layoutWeight(1)
          Text(this.axisValues[index].toFixed(1)).fontSize(13).fontColor('#A9B8CB').width(46).textAlign(TextAlign.End)
        }.width('100%').height(36)
      })
    }.padding(18).backgroundColor('#1A2432').borderRadius(12).width('100%')
  }
  @Builder
  sourcePanel() {
    Column({ space: 12 }) {
      this.heading('Media source', 'SIMULATED')
      Text('Internal script clock').fontColor('#EDF3FA').width('100%')
      Text('Local script playback. Video and network-player adapters are planned next.').fontSize(13).fontColor('#A9B8CB').width('100%')
      Button(this.importing ? 'Opening…' : 'Import .funscript / JSON').width('100%').height(48).enabled(!this.importing)
        .backgroundColor('#30475F').onClick(() => this.importScript())
      Button('Load synthetic demo').width('100%').height(48).enabled(!this.importing).backgroundColor('#263445').onClick(() => {
        this.document = FunscriptParser.parse(DEMO); this.engine.load(this.document);
        this.selectedAxis = 0; this.fileName = 'Synthetic demo · 5 seconds'; this.status = 'Demo loaded · no physical device'; this.sync();
      })
    }.padding(18).backgroundColor('#1A2432').borderRadius(12).width('100%')
  }
  @Builder
  outputPanel() {
    Column({ space: 12 }) {
      this.heading('Output target', 'SAFE PREVIEW')
      Row() {
        Text('Simulator').fontColor('#EDF3FA').layoutWeight(1)
        Toggle({ type: ToggleType.Switch, isOn: this.connected }).selectedColor('#216C68').onChange((value: boolean) => {
          this.connected = value; this.engine.setConnected(value);
          this.status = value ? 'Simulator connected · press Play' : 'Simulator disconnected · stopped'; this.sync();
        })
      }.width('100%')
      Text('No TCP, UDP, Bluetooth or USB output is enabled in this build.').fontColor('#A9B8CB').fontSize(13).width('100%')
      Text('Background, disconnect and Stop close the output gate. Reconnecting never resumes playback automatically.').fontColor('#8FA3B9').fontSize(12).width('100%')
    }.padding(18).backgroundColor('#1A2432').borderRadius(12).width('100%')
  }
  changeOffset(axisOnly: boolean, delta: number): void {
    if (this.importing || this.axisNames.length === 0) { return; }
    if (axisOnly) { this.engine.setAxisOffset(this.axisNames[this.selectedAxis], Math.max(-60000, Math.min(60000, this.axisOffsetMs + delta))); }
    else { this.engine.setGlobalOffset(Math.max(-60000, Math.min(60000, this.globalOffsetMs + delta))); }
    this.status = 'Offset changed · playback paused. Positive offset delays the script.';
    this.sync();
  }
  jumpChapter(direction: number): void {
    if (this.importing || this.axisNames.length === 0) { return; }
    const axis = this.axisNames[this.selectedAxis];
    const current = this.engine.getScriptPosition(axis);
    const chapters = this.document.metadata.chapters;
    let target: number = -1;
    if (direction > 0) {
      for (const chapter of chapters) { if (chapter.startTimeMs > current + 0.01) { target = chapter.startTimeMs; break; } }
    } else {
      for (let i = chapters.length - 1; i >= 0; i--) { if (chapters[i].startTimeMs < current - 0.01) { target = chapters[i].startTimeMs; break; } }
    }
    this.seekMarker(target, axis);
  }
  jumpBookmark(direction: number): void {
    if (this.importing || this.axisNames.length === 0) { return; }
    const axis = this.axisNames[this.selectedAxis];
    const current = this.engine.getScriptPosition(axis);
    const bookmarks = this.document.metadata.bookmarks;
    let target: number = -1;
    if (direction > 0) {
      for (const bookmark of bookmarks) { if (bookmark.timeMs > current + 0.01) { target = bookmark.timeMs; break; } }
    } else {
      for (let i = bookmarks.length - 1; i >= 0; i--) { if (bookmarks[i].timeMs < current - 0.01) { target = bookmarks[i].timeMs; break; } }
    }
    this.seekMarker(target, axis);
  }
  seekMarker(scriptTime: number, axis: string): void {
    if (scriptTime < 0) { this.status = 'No further marker in that direction'; return; }
    this.engine.pause();
    const target = markerMediaPosition(scriptTime, this.globalOffsetMs, this.engine.getAxisOffset(axis), this.durationMs);
    if (target === undefined) { this.status = 'Marker lies outside the current preview clock'; this.sync(); return; }
    this.engine.seek(target);
    this.status = 'Marker selected · playback paused';
    this.sync();
  }
  @Builder
  syncPanel() {
    Column({ space: 12 }) {
      this.heading('Synchronization', 'SIMULATION')
      Row({ space: 10 }) {
        Text('Curve').fontColor('#A9B8CB').layoutWeight(1)
        Select([{ value: 'Linear' }, { value: 'PCHIP' }, { value: 'Makima' }, { value: 'Step' }])
          .value(this.interpolationMode.toUpperCase()).height(48).enabled(!this.importing)
          .onSelect((index: number) => {
            const modes: InterpolationMode[] = ['linear', 'pchip', 'makima', 'step'];
            this.engine.setInterpolationMode(modes[index]); this.status = 'Curve changed · press Play to resume'; this.sync();
          })
      }.width('100%')
      Row({ space: 10 }) {
        Text('Playback speed').fontColor('#A9B8CB').layoutWeight(1)
        Select([{ value: '0.25×' }, { value: '0.5×' }, { value: '1×' }, { value: '1.5×' }, { value: '2×' }, { value: '4×' }])
          .value(this.playbackSpeed.toString() + '×').height(48).enabled(!this.importing)
          .onSelect((index: number) => { const speeds: number[] = [0.25, 0.5, 1, 1.5, 2, 4]; this.engine.setSpeed(speeds[index]); this.sync(); })
      }.width('100%')
      Text('Global offset: ' + this.globalOffsetMs + ' ms').fontColor('#A9B8CB').width('100%')
      Row({ space: 8 }) {
        Button('−50').height(48).layoutWeight(1).backgroundColor('#263445').onClick(() => this.changeOffset(false, -50))
        Button('Reset').height(48).layoutWeight(1).backgroundColor('#263445').onClick(() => this.changeOffset(false, -this.globalOffsetMs))
        Button('+50').height(48).layoutWeight(1).backgroundColor('#263445').onClick(() => this.changeOffset(false, 50))
      }
      Text((this.axisNames[this.selectedAxis] || 'Axis') + ' offset: ' + this.axisOffsetMs + ' ms').fontColor('#A9B8CB').width('100%')
      Row({ space: 8 }) {
        Button('−50').height(48).layoutWeight(1).backgroundColor('#263445').onClick(() => this.changeOffset(true, -50))
        Button('Reset').height(48).layoutWeight(1).backgroundColor('#263445').onClick(() => this.changeOffset(true, -this.axisOffsetMs))
        Button('+50').height(48).layoutWeight(1).backgroundColor('#263445').onClick(() => this.changeOffset(true, 50))
      }
      Text('Positive offsets delay the script. Offset and curve edits pause playback. Preview clock duration stays unchanged.').fontSize(12).fontColor('#8FA3B9')
    }.padding(18).backgroundColor('#1A2432').borderRadius(12).width('100%')
  }
  @Builder
  markerPanel() {
    if (this.document.metadata.chapters.length > 0 || this.document.metadata.bookmarks.length > 0) {
      Column({ space: 12 }) {
        this.heading('Script markers', 'SELECTED AXIS')
        Text(this.chapterLabel).fontColor('#A9B8CB').width('100%').maxLines(2)
        if (this.document.metadata.chapters.length > 0) {
          Text('Chapters: ' + this.document.metadata.chapters.length).fontColor('#8FA3B9').width('100%')
          Row({ space: 8 }) {
            Button('Previous').height(48).layoutWeight(1).backgroundColor('#263445').onClick(() => this.jumpChapter(-1))
            Button('Next').height(48).layoutWeight(1).backgroundColor('#263445').onClick(() => this.jumpChapter(1))
          }
        }
        if (this.document.metadata.bookmarks.length > 0) {
          Text('Bookmarks: ' + this.document.metadata.bookmarks.length).fontColor('#8FA3B9').width('100%')
          Row({ space: 8 }) {
            Button('Previous').height(48).layoutWeight(1).backgroundColor('#263445').onClick(() => this.jumpBookmark(-1))
            Button('Next').height(48).layoutWeight(1).backgroundColor('#263445').onClick(() => this.jumpBookmark(1))
          }
        }
      }.padding(18).backgroundColor('#1A2432').borderRadius(12).width('100%')
    }
  }
  @Builder
  transport() {
    Row({ space: 12 }) {
      Button(this.playing ? 'Pause' : 'Play').height(52).layoutWeight(1).backgroundColor('#216C68').fontColor('#F1FFFC')
        .enabled(this.connected && this.foreground && !this.importing).onClick(() => this.playPause())
      Button('Stop output').height(52).layoutWeight(1).backgroundColor('#833D46').onClick(() => this.stop())
    }.width('100%')
  }
  build() {
    Column({ space: 12 }) {
      Row({ space: 10 }) {
        Column({ space: 2 }) {
          Text('MultiFunPlayer').fontSize(22).fontWeight(FontWeight.Bold).fontColor('#F3F7FC')
          Text('OHOS · simulation preview').fontSize(12).fontColor('#8FA3B9')
        }.alignItems(HorizontalAlign.Start).layoutWeight(1)
        Text(this.playing ? 'PLAYING' : 'IDLE').fontSize(11).fontColor('#56D9CC')
      }.width('100%')
      if (this.widthVp >= 840) {
        Row({ space: 16 }) {
          Scroll() { Column({ space: 16 }) { this.timeline(); this.axes(); this.markerPanel(); }.width('100%') }.layoutWeight(2).align(Alignment.Top)
          Scroll() { Column({ space: 16 }) { this.sourcePanel(); this.syncPanel(); this.outputPanel(); }.width('100%') }.layoutWeight(1).align(Alignment.Top)
        }.layoutWeight(1).alignItems(VerticalAlign.Top)
      } else if (this.widthVp > this.heightVp && this.widthVp >= 600) {
        Row({ space: 12 }) {
          Scroll() { Column({ space: 12 }) { this.timeline(); this.axes(); this.markerPanel(); }.width('100%') }.layoutWeight(3)
          Scroll() { Column({ space: 12 }) { this.sourcePanel(); this.syncPanel(); this.outputPanel(); }.width('100%') }.layoutWeight(2)
        }.layoutWeight(1).alignItems(VerticalAlign.Top)
      } else {
        Scroll() {
          Column({ space: 12 }) {
            if (this.selectedTab === 0) { this.timeline(); this.axes(); this.markerPanel(); }
            else if (this.selectedTab === 1) { this.sourcePanel(); this.syncPanel(); }
            else { this.outputPanel(); }
          }.width('100%')
        }.layoutWeight(1).align(Alignment.Top)
        Row({ space: 8 }) {
          Button('Timeline').layoutWeight(1).height(48).backgroundColor(this.selectedTab === 0 ? '#30475F' : '#1A2432').onClick(() => { this.selectedTab = 0; })
          Button('Source').layoutWeight(1).height(48).backgroundColor(this.selectedTab === 1 ? '#30475F' : '#1A2432').onClick(() => { this.selectedTab = 1; })
          Button('Output').layoutWeight(1).height(48).backgroundColor(this.selectedTab === 2 ? '#30475F' : '#1A2432').onClick(() => { this.selectedTab = 2; })
        }
      }
      Text(this.status).fontSize(12).fontColor('#A9B8CB').width('100%').maxLines(2)
      this.transport()
    }.padding(16).width('100%').height('100%').backgroundColor('#101822')
      .onAreaChange((_old: Area, area: Area) => { this.widthVp = Number(area.width); this.heightVp = Number(area.height); })
  }
}
