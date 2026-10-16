import { common } from '@kit.AbilityKit';
import { KeyCode } from '@kit.InputKit';
import { systemDateTime } from '@kit.BasicServicesKit';
import { FunscriptParser, FunscriptDocument } from '../core/Funscript';
import { PlaybackEngine } from '../core/PlaybackEngine';
import type { InterpolationMode } from '../core/Interpolation';
import { interpolateAxis } from '../core/Interpolation';
import { AxisMapping } from '../core/AxisMapping';
import { activeChapter, markerMediaPosition } from '../core/MarkerNavigation';
import { MediaClockSnapshot } from '../core/MediaClock';
import { ResourceLibrary, ResourceFileEntry, ResourceLibraryItem, ResourceScriptMatch, ResourceScriptCandidate, ResourceLibraryCatalog, ResourceDiscoveryCandidate } from '../core/ResourceLibrary';
import { LibraryFiles, LibraryFile, LibraryScanProgress } from '../library/LibraryFiles';
import { ScriptZipFiles } from '../library/ScriptZipFiles';
import { ScriptZipCandidate } from '../core/ScriptZip';
import { Heatmap, HeatmapBucket } from '../core/Heatmap';
import { NativeVideoAdapter } from '../media/NativeVideoAdapter';
import { VideoWorkspaceLayout, videoWorkspaceLayout } from '../core/VideoLayout';
import { DownloadLibrary } from '../library/DownloadLibrary';
import { t } from '../l10n/Texts';

const DEMO: string = '{"actions":[{"at":0,"pos":50},{"at":1000,"pos":15},{"at":2000,"pos":85},{"at":3000,"pos":25},{"at":4000,"pos":75},{"at":5000,"pos":50}],"axes":[{"id":"R0","actions":[{"at":0,"pos":20},{"at":2500,"pos":80},{"at":5000,"pos":20}]}],"metadata":{"chapters":[{"name":"Rise","startTime":"00:00:00","endTime":"00:00:02.500"},{"name":"Return","startTime":"00:00:02.500","endTime":"00:00:05"}],"bookmarks":[{"name":"First low point","time":"00:00:01"},{"name":"Second low point","time":"00:00:03"}]}}';

class ScriptLibrarySource {
  uri: string;
  name: string;
  recursive: boolean = false;
  files: ResourceFileEntry[];
  constructor(uri: string, name: string, files: ResourceFileEntry[]) {
    this.uri = uri; this.name = name; this.files = files;
  }
}
class LoadedScriptInput {
  file: ResourceFileEntry;
  contents: string;
  constructor(file: ResourceFileEntry, contents: string) { this.file = file; this.contents = contents; }
}

class VideoSurfaceController extends XComponentController {
  private changed: (id: string, available: boolean) => void;
  constructor(changed: (id: string, available: boolean) => void) { super(); this.changed = changed; }
  onSurfaceCreated(surfaceId: string): void { this.changed(surfaceId, true); }
  onSurfaceDestroyed(surfaceId: string): void { this.changed(surfaceId, false); }
}

@Extend(Button)
function flatButton() {
  .backgroundColor('#F5F5F5').fontColor('#263238').borderRadius(0).padding(0).fontSize(13)
}

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
  @State fileName: string = 'No video selected';
  @State status: string = 'Simulation only · no device commands';
  @State importing: boolean = false;
  @State interpolationMode: InterpolationMode = 'pchip';
  @State axisInverted: boolean = false;
  @State axisScale: number = 1;
  @State playbackSpeed: number = 1;
  @State globalOffsetMs: number = 0;
  @State axisOffsetMs: number = 0;
  @State chapterLabel: string = 'No active chapter';
  @State connected: boolean = true;
  @State videoMode: boolean = false;
  @State videoFullscreen: boolean = false;
  @State videoReady: boolean = false;
  @State videoOnly: boolean = false;
  @State videoState: string = 'idle';
  @State videoName: string = 'No video selected';
  @State volume: number = 0.6;
  @State openingVideo: boolean = false;
  @State showPortInfo: boolean = false;
  @State showResources: boolean = true;
  @State showSourceSettings: boolean = false;
  @State showOutputSettings: boolean = false;
  @State showMediaSettings: boolean = false;
  @State showAxisSettings: boolean = false;
  @State showAxisValues: boolean = false;
  @State showMarkerDetails: boolean = false;
  @State showHeatSettings: boolean = false;
  @State heatShowRange: boolean = true;
  @State heatCombine: boolean = true;
  @State heatInvert: boolean = false;
  private heatBuckets: HeatmapBucket[] = [];
  private heatDocument: FunscriptDocument | undefined = undefined;
  private heatAxis: number = -1;
  private heatDuration: number = -1;
  private heatCombined: boolean = false;
  @State libraryItems: ResourceLibraryItem[] = [];
  @State libraryBusy: boolean = false;
  @State libraryMessage: string = 'Preparing Download media folder…';
  @State libraryFolder: string = 'Application Download folder';
  @State libraryLoaded: boolean = false;
  @State libraryLimit: number = 20;
  @State manualItemId: string = '';
  @State manualVideoUri: string = '';
  @State manualScriptUris: string[] = [];
  @State scriptLibraries: ScriptLibrarySource[] = [];
  private mediaCatalog: ResourceFileEntry[] = [];
  private libraryRoot: string = '';
  private libraryRequest: number = 0;
  private libraryPicking: boolean = false;
  private pairOpening: boolean = false;
  private engine: PlaybackEngine = new PlaybackEngine();
  @State document: FunscriptDocument = FunscriptParser.parse(DEMO);
  private video: NativeVideoAdapter = new NativeVideoAdapter((snapshot: MediaClockSnapshot) => this.videoSnapshot(snapshot));
  private videoSurface: VideoSurfaceController = new VideoSurfaceController((id: string, available: boolean) => this.surfaceChanged(id, available));
  private surfaceId: string = '';
  private pendingVideoUri: string = '';
  private openVideoRequest: number = 0;
  private viewActive: boolean = false;
  private timer: number = -1;
  private lastTick: number = 0;
  private canvas: CanvasRenderingContext2D = new CanvasRenderingContext2D(new RenderingContextSettings(true));

  aboutToAppear(): void {
    this.viewActive = true;
    if (this.document.axes.length > 0) { this.engine.load(this.document); }
    else { this.engine.clearScripts(); }
    this.engine.setInterpolationMode('pchip');
    this.engine.setConnected(true);
    this.sync();
    this.lastTick = systemDateTime.getUptime(systemDateTime.TimeType.ACTIVE);
    this.timer = setInterval(() => {
      const now = systemDateTime.getUptime(systemDateTime.TimeType.ACTIVE);
      if (!this.videoMode) { this.engine.tick(Math.max(0, now - this.lastTick)); }
      this.lastTick = now;
      this.sync();
    }, 40);
    this.scanDownloads();
  }
  aboutToDisappear(): void {
    this.cancelLibrary(); this.viewActive = false; this.openVideoRequest++; this.pendingVideoUri = '';
    this.video.dispose();
    if (this.timer >= 0) { clearInterval(this.timer); this.timer = -1; }
    this.engine.stop();
  }
  foregroundChanged(): void {
    this.engine.setForeground(this.foreground);
    if (!this.foreground) {
      if (this.libraryBusy && !this.libraryPicking) { this.cancelLibrary(); }
      if (this.pairOpening) {
        this.openVideoRequest++; this.pairOpening = false; this.openingVideo = false; this.importing = false;
      }
      if (!this.openingVideo) { this.openVideoRequest++; this.pendingVideoUri = ''; }
      if (this.videoMode) { this.video.release(); this.videoReady = false; this.status = 'Video released in background · reopen the file to continue'; }
      else { this.status = 'Paused for safety · press Play to resume'; }
    }
    if (this.foreground) { this.openPendingVideo(); }
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

    const axisName = this.axisNames[this.selectedAxis] || 'L0';
    this.axisOffsetMs = this.engine.getAxisOffset(axisName);
    if (this.axisNames.length > 0) {
      const settings = this.engine.getAxisScriptSettings(axisName);
      this.interpolationMode = settings.interpolationMode || 'pchip';
      this.axisInverted = settings.inverted; this.axisScale = settings.scale;
    }
    const scriptTime = this.engine.getScriptPosition(axisName);
    const chapter = activeChapter(this.document.metadata, scriptTime);
    this.chapterLabel = chapter === undefined ? 'No active chapter' : chapter.name;
    this.drawTrace();
  }
  playPause(): void {
    if (this.importing || this.openingVideo || this.libraryBusy) { return; }
    if (this.videoMode) {
      if (this.playing) { this.video.pause(); }
      else if (this.durationMs > 0 && this.positionMs >= this.durationMs) {
        this.video.seek(0); this.status = 'Rewinding · press Play when ready';
      } else { this.video.play(); }
      return;
    }
    if (this.playing) { this.engine.pause(); }
    else {
      if (this.positionMs >= this.durationMs) { this.engine.seek(0); }
      this.lastTick = systemDateTime.getUptime(systemDateTime.TimeType.ACTIVE);
      this.engine.play();
    }
    this.sync();
  }
  stop(): void {
    if (this.videoMode) { this.pauseTransport(); this.video.seek(0); } else { this.engine.stop(); }
    this.status = 'Stopped · simulation output disabled';
    this.sync();
  }
  cancelLibrary(): void {
    this.libraryRequest++; this.libraryBusy = false; this.libraryPicking = false;
    this.libraryMessage = 'Cancelled · partial results remain available';
  }
  updateLibrary(files: LibraryFile[]): void {
    const entries = files.map((file: LibraryFile) => new ResourceFileEntry(file.uri, file.name, file.relativePath));
    this.mediaCatalog = entries;
    this.libraryItems = ResourceLibrary.build(entries).items.filter((item: ResourceLibraryItem) => item.videos.length > 0);
  }
  libraryProgress(progress: LibraryScanProgress, request: number): void {
    if (request !== this.libraryRequest || !this.viewActive) { return; }
    this.updateLibrary(progress.files);
    this.libraryMessage = 'Scanned ' + progress.visited + ' entries · ' + progress.skipped + ' skipped';
  }
  async scanDownloads(): Promise<void> {
    if (!this.viewActive || !this.foreground || this.libraryBusy || this.openingVideo || this.importing) { return; }
    this.pauseTransport(); this.libraryBusy = true; this.libraryPicking = false;
    this.libraryLimit = 20; this.manualItemId = ''; this.libraryLoaded = false;
    this.updateLibrary([]); this.libraryRoot = '';
    this.libraryMessage = 'Preparing Download media folder…';
    const request = ++this.libraryRequest;
    const current = (): boolean => request === this.libraryRequest && this.viewActive && this.foreground;
    // Refresh invalidates the old source, not just its catalog. This also closes an
    // already-open descriptor if its pathname was deleted or permissions changed.
    this.openVideoRequest++; this.pendingVideoUri = ''; this.videoMode = false;
    this.videoReady = false; this.videoFullscreen = false; this.videoOnly = false;
    this.videoName = 'No video selected'; this.videoState = 'idle';
    this.engine.clearScripts(); this.document = new FunscriptDocument([]);
    this.engine.useExternalClock(false); this.selectedAxis = 0; this.fileName = 'No matching script';
    this.status = 'Refresh stops playback. Choose a video again after scanning.'; this.sync();
    try {
      await this.video.release();
      if (!current()) { return; }
      const cleanupFailure = this.video.snapshot().failure;
      if (cleanupFailure.length > 0) { throw new Error(cleanupFailure); }
      const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
      const directory = await DownloadLibrary.prepare(context, current);
      if (!current()) { return; }
      this.libraryRoot = directory.uri; this.libraryFolder = directory.displayPath;
      this.updateLibrary([]); this.libraryMessage = 'Scanning Download media folder…';
      const result = await LibraryFiles.scanDirectory(directory.uri, current,
        (progress: LibraryScanProgress) => this.libraryProgress(progress, request));
      if (!current()) { return; }
      this.updateLibrary(result.files); this.libraryLoaded = true;
      this.libraryMessage = this.libraryItems.length === 0 ? 'No media found. Put videos and matching scripts or ZIP files in this folder, then refresh.' :
        this.libraryItems.length + ' groups · ' + result.skipped + ' skipped';
      if (result.truncated) { this.libraryMessage += ' · scan limit reached'; }
      if (result.warnings.length > 0) { this.libraryMessage += ' · ' + result.warnings[0]; }
    } catch (error) {
      if (current()) { this.libraryMessage = 'Cannot scan Download media folder: ' + (error as Error).message; }
    } finally { if (request === this.libraryRequest) { this.libraryBusy = false; } }
  }
  async refreshLibrary(): Promise<void> { await this.scanDownloads(); }
  showLibrary(): void {
    this.showResources = !this.showResources;
    if (this.showResources && !this.libraryLoaded) { this.scanDownloads(); }
  }
  async refreshScriptLibrary(index: number): Promise<void> {
    if (this.libraryBusy || this.importing || this.openingVideo || index < 0 || index >= this.scriptLibraries.length) { return; }
    this.pauseTransport(); this.libraryBusy = true;
    const source = this.scriptLibraries[index];
    const request = ++this.libraryRequest;
    const current = (): boolean => request === this.libraryRequest && this.viewActive;
    try {
      const result = await LibraryFiles.scanDirectory(source.uri, current, (progress: LibraryScanProgress) => {
        if (current()) { this.libraryMessage = 'Refreshing script library: ' + progress.visited + ' entries'; }
      });
      if (!current()) { return; }
      const replacement = new ScriptLibrarySource(source.uri, source.name,
        result.files.map((file: LibraryFile) => new ResourceFileEntry(file.uri, file.name, file.relativePath)));
      replacement.recursive = source.recursive;
      this.scriptLibraries = this.scriptLibraries.map((entry: ScriptLibrarySource, position: number) => position === index ? replacement : entry);
      this.libraryMessage = 'Script library refreshed' + (result.truncated ? ' · index incomplete' : '');
    } catch (error) { if (current()) { this.libraryMessage = 'Library unavailable. Remove and reselect it: ' + (error as Error).message; } }
    finally { if (current()) { this.libraryBusy = false; } }
  }
  editScriptLibrary(index: number, action: string): void {
    if (this.libraryBusy || this.importing || this.openingVideo) { return; }
    if (index < 0 || index >= this.scriptLibraries.length) { return; }
    const sources = this.scriptLibraries.slice();
    if (action === 'remove') { sources.splice(index, 1); }
    else if (action === 'recursive') {
      const source = sources[index];
      const replacement = new ScriptLibrarySource(source.uri, source.name, source.files);
      replacement.recursive = !source.recursive; sources[index] = replacement;
    } else {
      const target = index + (action === 'up' ? -1 : 1);
      if (target < 0 || target >= sources.length) { return; }
      const source = sources[index]; sources[index] = sources[target]; sources[target] = source;
    }
    this.pauseTransport(); this.scriptLibraries = sources;
    this.libraryMessage = 'Library search order changed · open a resource again to apply';
  }

  beginMapping(item: ResourceLibraryItem): void {
    this.manualItemId = item.id; this.manualVideoUri = item.videos.length === 1 ? item.videos[0].uri : '';
    this.manualScriptUris = [];
  }
  toggleMappedScript(uri: string): void {
    this.manualScriptUris = this.manualScriptUris.indexOf(uri) >= 0 ?
      this.manualScriptUris.filter((value: string) => value !== uri) : this.manualScriptUris.concat([uri]);
  }
  async openLibraryItem(item: ResourceLibraryItem, manual: boolean = false, originalSearch: boolean = false): Promise<void> {
    if (this.libraryBusy || this.openingVideo || this.importing) { return; }
    const video = manual ? item.videos.find((value: ResourceFileEntry) => value.uri === this.manualVideoUri) : item.video;
    if (video === undefined) { this.libraryMessage = 'Choose one video explicitly.'; return; }
    // A valid selection owns the next source immediately. Any matching/read error
    // must leave no previous native source or script that can accidentally resume.
    this.pendingVideoUri = ''; this.pauseTransport(); this.videoReady = false;
    this.openingVideo = true; this.importing = true; this.pairOpening = true;
    this.videoMode = true; this.videoOnly = false; this.videoName = video.name;
    const request = ++this.openVideoRequest;
    const current = (): boolean => request === this.openVideoRequest && this.viewActive && this.foreground;
    try {
      await this.video.release();
      if (!current()) { return; }
      const cleanupFailure = this.video.snapshot().failure;
      if (cleanupFailure.length > 0) { throw new Error(cleanupFailure); }
      const scripts = manual ? item.scripts.filter((value: ResourceScriptMatch) => this.manualScriptUris.indexOf(value.file.uri) >= 0) : item.scripts;
      let plan: ResourceDiscoveryCandidate[] = [];
      if (manual && !originalSearch) {
        plan = scripts.map((match: ResourceScriptMatch) => new ResourceDiscoveryCandidate(match.file, 'script', 'manual', 'media', -1));
      } else {
        const catalogs = this.scriptLibraries.map((source: ScriptLibrarySource) => new ResourceLibraryCatalog(source.uri, source.files, source.recursive));
        plan = ResourceLibrary.planSearch(video, this.mediaCatalog, catalogs);
      }
      if (plan.length > 64) { throw new Error('More than 64 candidates. Use Choose mapping or narrow the libraries.'); }
      const candidates: ResourceScriptCandidate[] = [];
      let rejected: number = 0;
      let textBudget: number = 0;
      let actionBudget: number = 0;
      for (const step of plan) {
        let inputs: LoadedScriptInput[] = [];
        if (step.kind === 'zip') {
          const zipped = await ScriptZipFiles.readScripts(step.file.uri, current);
          inputs = zipped.map((entry: ScriptZipCandidate, index: number) => new LoadedScriptInput(
            new ResourceFileEntry(entry.sourceUri, entry.name, 'archive/' + index + '/' + entry.name), entry.contents));
        } else {
          try { inputs = [new LoadedScriptInput(step.file, await LibraryFiles.readScript(step.file.uri, current))]; }
          catch (error) { if (!current()) { return; } rejected++; continue; }
        }
        if (!current()) { return; }
        if (candidates.length + inputs.length > 64) { throw new Error('More than 64 archive/script candidates. Narrow the selection.'); }
        for (const input of inputs) {
          textBudget += input.contents.length * 2;
          if (textBudget > 8 * 1024 * 1024) { throw new Error('Candidate text budget exceeded. Narrow the selection.'); }
          try {
            const candidate = ResourceLibrary.parseCandidate(input.contents, input.file);
            for (const axis of candidate.document.axes) { actionBudget += axis.actions.length; }
            if (actionBudget <= FunscriptParser.MAX_ACTIONS) { candidates.push(candidate); }
          } catch (error) { rejected++; }
          if (actionBudget > FunscriptParser.MAX_ACTIONS) { throw new Error('Candidate action budget exceeded. Narrow the selection.'); }
        }
      }
      if (plan.length === 0) {
        // Absence is different from unreadable/invalid matching scripts. Never reuse
        // a previous video's scripts, and never relax the external script parser.
        this.engine.clearScripts(); this.document = new FunscriptDocument([]);
        this.fileName = 'No matching script'; this.videoOnly = true;
      } else {
        const selection = ResourceLibrary.selectDocuments(video.name, candidates);
        const parsed = selection.document;
        if (parsed === undefined) { throw new Error('No readable matching script. Check the files or choose mapping.'); }
        if (!current()) { return; }
        this.document = parsed; this.engine.load(parsed);
        this.fileName = selection.selectedFiles.map((value: ResourceFileEntry) => value.name).join(' + ');
        this.videoOnly = false;
      }
      this.engine.useExternalClock(true); this.selectedAxis = 0;
      this.videoMode = true; this.videoReady = false; this.videoName = video.name;
      this.pendingVideoUri = video.uri; this.status = this.videoOnly ? 'Video only · no matching script · press Play' :
        'Pair loaded · press Play' + (rejected > 0 ? ' · ' + rejected + ' unreadable/invalid scripts skipped' : '');
      this.openPendingVideo(); this.sync();
    } catch (error) {
      if (current()) {
        this.pendingVideoUri = ''; this.videoReady = false; this.videoState = 'error';
        this.engine.clearScripts(); this.document = new FunscriptDocument([]);
        this.engine.useExternalClock(true); this.selectedAxis = 0; this.fileName = 'No matching script';
        this.sync();
        this.status = 'Pair could not open: ' + (error as Error).message + ' Check the files and refresh.';
      }
    } finally { if (request === this.openVideoRequest) { this.openingVideo = false; this.importing = false; this.pairOpening = false; } }
  }

  pauseTransport(): void {
    this.engine.pause();
    if (this.videoMode) { this.video.pause(); }
  }
  seekTransport(position: number): void {
    if (this.importing || this.openingVideo || this.libraryBusy) { return; }
    if (this.videoMode) { this.engine.pause(); this.video.seek(position); }
    else { this.engine.seek(position); }
    this.sync();
  }
  videoSnapshot(snapshot: MediaClockSnapshot): void {
    if (!this.viewActive || !this.videoMode) { return; }
    const wasReady = this.videoReady;
    this.videoReady = snapshot.ready && snapshot.valid && !snapshot.seeking;
    this.videoState = snapshot.state;
    if (snapshot.valid) { this.engine.acceptMediaClock(snapshot.positionMs, snapshot.durationMs, snapshot.safetyGateOpen); }
    else { this.engine.pause(); }
    if (snapshot.rate >= 0.125 && snapshot.rate <= 4) { this.engine.setSpeed(snapshot.rate); }
    if (this.videoReady && !wasReady) { this.video.setVolume(this.volume); }
    if (snapshot.failure.length > 0) { this.status = snapshot.failure; }
    else if (this.videoReady && !wasReady) { this.status = this.videoOnly ? 'Video only · no matching script · press Play' : 'Video ready · press Play'; }
    this.sync();
  }
  surfaceChanged(id: string, available: boolean): void {
    if (available) {
      if (id.length === 0 || id === this.surfaceId) { return; }
      if (this.surfaceId.length > 0) { this.pendingVideoUri = ''; this.pauseTransport(); this.video.release(); }
      this.surfaceId = id;
      if (this.pendingVideoUri.length > 0 && this.foreground) {
        const uri = this.pendingVideoUri; this.pendingVideoUri = ''; this.video.open(uri, id);
      }
    } else if (id === this.surfaceId) {
      this.surfaceId = '';
      if (this.viewActive && this.videoMode) {
        this.pendingVideoUri = ''; this.engine.pause(); this.video.release();
        this.status = 'Video surface closed · reopen the file to continue';
      }
    }
  }
  openPendingVideo(): void {
    if (this.viewActive && this.videoMode && this.foreground && this.surfaceId.length > 0 && this.pendingVideoUri.length > 0) {
      const uri = this.pendingVideoUri; this.pendingVideoUri = ''; this.video.open(uri, this.surfaceId);
    }
  }
  closeVideo(): void {
    this.openVideoRequest++; this.pendingVideoUri = ''; this.videoMode = false; this.videoReady = false; this.videoFullscreen = false; this.videoOnly = false;
    this.video.release(); this.engine.useExternalClock(false);
    this.lastTick = systemDateTime.getUptime(systemDateTime.TimeType.ACTIVE);
    this.status = 'Simulator selected · press Play'; this.sync();
  }
  workspaceLayout(): VideoWorkspaceLayout {
    return videoWorkspaceLayout(this.widthVp, this.heightVp, this.videoMode, this.videoFullscreen);
  }
  resizeWorkspace(width: number, height: number): void {
    // Geometry only. Do not seek, release, re-open a source or reload its script.
    if (Number.isFinite(width) && width > 0) { this.widthVp = width; }
    if (Number.isFinite(height) && height > 0) { this.heightVp = height; }
  }
  setVideoFullscreen(value: boolean): void {
    this.videoFullscreen = this.videoMode && value;
  }
  onBackPress(): boolean {
    if (!this.videoFullscreen) { return false; }
    this.setVideoFullscreen(false); return true;
  }
  exitFullscreenWithKey(keyCode: number): boolean {
    if (keyCode !== KeyCode.KEYCODE_ESCAPE || !this.videoFullscreen) { return false; }
    this.setVideoFullscreen(false); return true;
  }
  drawTrace(): void {
    const w = this.canvas.width; const h = this.canvas.height;
    if (w <= 0 || h <= 0) { return; }
    this.canvas.clearRect(0, 0, w, h);
    this.canvas.fillStyle = '#FFFFFF'; this.canvas.fillRect(0, 0, w, h);
    if (this.heatDocument !== this.document || this.heatAxis !== this.selectedAxis ||
      this.heatDuration !== this.durationMs || this.heatCombined !== this.heatCombine) {
      this.heatBuckets = Heatmap.build(this.document, this.durationMs, this.selectedAxis, 333, this.heatCombine);
      this.heatDocument = this.document; this.heatAxis = this.selectedAxis;
      this.heatDuration = this.durationMs; this.heatCombined = this.heatCombine;
    }
    const buckets = this.heatBuckets;
    if (buckets.length > 1) {
      this.canvas.save(); this.canvas.beginPath();
      if (this.heatShowRange) {
        for (let i = 0; i < buckets.length; i++) {
          const value = buckets[i].rangeMax;
          const y = Math.max(0, Math.min(1, this.heatInvert ? value : 1 - value)) * h;
          if (i === 0) { this.canvas.moveTo(0, y); } else { this.canvas.lineTo(i / (buckets.length - 1) * w, y); }
        }
        for (let i = buckets.length - 1; i >= 0; i--) {
          const value = buckets[i].rangeMin;
          const y = Math.max(0, Math.min(1, this.heatInvert ? value : 1 - value)) * h;
          this.canvas.lineTo(i / (buckets.length - 1) * w, y);
        }
      } else { this.canvas.rect(0, 0, w, h); }
      this.canvas.closePath(); this.canvas.clip();
      for (let i = 0; i < buckets.length; i++) {
        this.canvas.fillStyle = buckets[i].color;
        this.canvas.fillRect(i / (buckets.length - 1) * w, 0, w / (buckets.length - 1) + 0.5, h);
      }
      this.canvas.restore();
    }
    const cursor = this.positionMs / Math.max(1, this.durationMs) * w;
    this.canvas.strokeStyle = '#455A64'; this.canvas.lineWidth = 1;
    this.canvas.beginPath(); this.canvas.moveTo(cursor, 0); this.canvas.lineTo(cursor, h); this.canvas.stroke();
  }
  @Builder
  heading(title: string, detail: string) {
    Row() {
      Text(t(title)).fontSize(13).fontWeight(FontWeight.Medium).fontColor('#37474F').layoutWeight(1)
      Text(t(detail)).fontSize(12).fontColor('#607D8B')
    }.width('100%').margin({ bottom: 6 })
  }
  @Builder
  mediaToolbar() {
    Row({ space: 2 }) {
      Button('⌕').flatButton().width(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).fontSize(22).accessibilityText(t('Script repositories and resources')).onClick(() => this.showLibrary())
      Button('↻').flatButton().width(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).fontSize(22).accessibilityText(t('Refresh Download media folder')).enabled(!this.libraryBusy && !this.importing && !this.openingVideo).onClick(() => this.refreshLibrary())
      Button('AB').flatButton().width(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).enabled(false).accessibilityText(t('AB loop is not ported yet'))
      Blank()
      Button(this.playing ? 'Ⅱ' : (this.videoMode && this.durationMs > 0 && this.positionMs >= this.durationMs ? '↶' : '▶')).flatButton()
        .width(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).fontColor('#008A19').fontSize(22).accessibilityText(this.playing ? t('Pause') : t('Play or rewind'))
        .enabled(this.connected && this.foreground && !this.importing && !this.openingVideo && !this.libraryBusy && (this.videoMode ? this.videoReady : this.durationMs > 0)).onClick(() => this.playPause())
      Button('■').flatButton().width(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).fontSize(20).accessibilityText(t('Stop output')).onClick(() => this.stop())
      Button(this.showMediaSettings ? '⌃' : '⌄').flatButton().width(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).accessibilityText(t('Media timing settings')).onClick(() => { this.showMediaSettings = !this.showMediaSettings; })
    }.width('100%').backgroundColor('#F5F5F5').borderRadius(3)
  }
  @Builder
  timeline() {
    Column({ space: 3 }) {
      Canvas(this.canvas).width('100%').height(this.widthVp < 600 ? 48 : 36)
        .onReady(() => this.drawTrace())
        .onClick((event: ClickEvent) => this.seekTransport(Math.max(0, Math.min(1, event.x / Math.max(1, this.canvas.width))) * this.durationMs))
      Slider({ value: this.positionMs, min: 0, max: Math.max(1, this.durationMs), step: 1 })
        .height(20).selectedColor('#607D8B').trackColor('#D8DFE3').blockColor('#455A64')
        .onChange((value: number) => this.seekTransport(value))
      Row() {
        Text((this.positionMs / 1000).toFixed(2) + ' / ' + (this.durationMs / 1000).toFixed(2) + ' s').fontSize(11).fontColor('#546E7A')
        Blank()
        Button(this.showHeatSettings ? t('Heatmap ⌃') : t('Heatmap ⌄')).flatButton().height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).fontSize(12).onClick(() => { this.showHeatSettings = !this.showHeatSettings; })
      }.width('100%')
      if (this.showHeatSettings) {
        Row() {
          Text(t('Show range')).fontSize(12).layoutWeight(1)
          Toggle({ type: ToggleType.Switch, isOn: this.heatShowRange }).onChange((value: boolean) => { this.heatShowRange = value; this.drawTrace(); })
          Text(t('Combine axes')).fontSize(12).layoutWeight(1)
          Toggle({ type: ToggleType.Switch, isOn: this.heatCombine }).onChange((value: boolean) => { this.heatCombine = value; this.drawTrace(); })
        }.height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48)
        Row() {
          Text(t('Invert display Y')).fontSize(12).layoutWeight(1)
          Toggle({ type: ToggleType.Switch, isOn: this.heatInvert }).onChange((value: boolean) => { this.heatInvert = value; this.drawTrace(); })
        }.height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48)
      }
    }.width('100%').backgroundColor('#FFFFFF').borderRadius(3)
  }
  @Builder
  axes() {
    Column({ space: 0 }) {
      Button((this.showAxisValues ? '⌃  ' : '⌄  ') + t('AXIS VALUES')).flatButton().height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).width('100%').fontSize(12).onClick(() => { this.showAxisValues = !this.showAxisValues; })
      if (this.showAxisValues) {
        ForEach(this.axisNames, (name: string, index: number) => {
          Row({ space: 10 }) {
            Text(name).fontColor('#455A64').fontWeight(FontWeight.Bold).width(38)
            Progress({ value: this.axisValues[index], total: 100, type: ProgressType.Linear }).color('#607D8B').backgroundColor('#CFD8DC').layoutWeight(1)
            Text(this.axisValues[index].toFixed(1)).fontSize(13).fontColor('#455A64').width(46).textAlign(TextAlign.End)
          }.height(36).padding({ left: 10, right: 10 })
        })
      }
    }.backgroundColor('#F5F5F5').borderRadius(3).width('100%')
  }
  @Builder
  axisToolbar() {
    Column({ space: 0 }) {
      Scroll() {
        Row({ space: 0 }) {
          ForEach(this.axisNames, (name: string, index: number) => {
            Column({ space: 0 }) {
              Text(name).fontSize(13).fontWeight(FontWeight.Bold).fontColor(index === this.selectedAxis ? '#455A64' : '#78909C')
              Text('○ ○ ○ ○').fontSize(8).fontColor('#B0BEC5').accessibilityText(t('Link, motion, speed and smart-limit indicators not yet ported'))
            }.width(52).height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).justifyContent(FlexAlign.Center).backgroundColor(index === this.selectedAxis ? '#E1E6E8' : '#F5F5F5')
              .onClick(() => { this.selectedAxis = index; this.sync(); })
          })
        }
      }.width('100%').scrollable(ScrollDirection.Horizontal)
      Scroll() {
        Row({ space: 0 }) {
          Button('▣').flatButton().width(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).accessibilityText(t('Script settings')).onClick(() => { this.showAxisSettings = !this.showAxisSettings; })
          Button('↕').flatButton().width(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).enabled(this.axisNames.length > 0 && !this.importing && !this.openingVideo && !this.libraryBusy).backgroundColor(this.axisInverted ? '#CFD8DC' : '#F5F5F5').accessibilityText(t('Invert selected script')).onClick(() => { this.pauseTransport(); this.engine.setAxisInverted(this.axisNames[this.selectedAxis], !this.axisInverted); this.sync(); })
          Button('Ⅱ').flatButton().width(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).enabled(false).accessibilityText(t('Axis bypass not ported'))
          Button('↗').flatButton().width(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).enabled(false).accessibilityText(t('Axis linking not ported'))
          Button('≋').flatButton().width(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).enabled(false).accessibilityText(t('Motion provider not ported'))
          Button('⌁').flatButton().width(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).enabled(false).accessibilityText(t('Smart limit not ported'))
          Button('◴').flatButton().width(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).enabled(false).accessibilityText(t('Speed limit not ported'))
          Button('∿').flatButton().width(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).accessibilityText(t('Interpolation settings')).onClick(() => { this.showAxisSettings = !this.showAxisSettings; })
          Button('⌂').flatButton().width(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).enabled(false).accessibilityText(t('Auto home not ported'))
        }
      }.width('100%').scrollable(ScrollDirection.Horizontal)
      if (this.showAxisSettings) {
        Text(t(this.fileName)).fontSize(12).fontColor('#455A64').width('100%').padding(10)
        this.syncPanel()
        Text(t('Grey controls are not implemented yet. Curve, inversion, scale and axis offset apply to the selected script axis.')).fontSize(11).fontColor('#795548').padding(10)
      }
    }.width('100%').backgroundColor('#F5F5F5').borderRadius(3)
  }
  @Builder
  scriptArea() {
    Column({ space: 10 }) {
      this.mediaToolbar()
      if (this.showMediaSettings) { this.syncPanel() }
      this.timeline()
      Row() {
        Text(t(this.chapterLabel)).fontSize(12).fontColor('#455A64').layoutWeight(1).maxLines(1)
        Button(this.showMarkerDetails ? t('Markers ⌃') : t('Markers ⌄')).flatButton().height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).fontSize(12).onClick(() => { this.showMarkerDetails = !this.showMarkerDetails; })
      }.width('100%').backgroundColor('#ECEFF1')
      if (this.showMarkerDetails) { this.markerPanel() }
      this.axisToolbar()
      this.axes()
    }.width('100%')
  }

  @Builder
  libraryPanel() {
    Column({ space: 10 }) {
      this.heading('Local resources', 'AUTHORIZED FILES')
      Text(t(this.libraryFolder)).fontSize(13).fontColor('#37474F').width('100%').copyOption(CopyOptions.InApp)
      Text(t('Place videos and matching scripts or ZIP files in this folder. Scanning never copies videos. Refresh stops playback.')).fontSize(12).fontColor('#546E7A').width('100%')
      if (this.libraryBusy) {
        Button(t('Cancel scan')).flatButton().height(48).width('100%').onClick(() => this.cancelLibrary())
      } else {
        Button(t('Refresh Download media folder')).flatButton().height(48).width('100%').enabled(!this.importing && !this.openingVideo).onClick(() => this.refreshLibrary())
      }
      Text(t(this.libraryMessage)).fontSize(12).fontColor('#546E7A').width('100%')
      ForEach(this.libraryItems.slice(0, this.libraryLimit), (item: ResourceLibraryItem) => {
        Column({ space: 8 }) {
          Text(item.title).fontColor('#37474F').width('100%').maxLines(2)
          Text(t(item.status) + ' · ' + item.videos.length + t(' video / ') + item.scripts.length + t(' scripts / ') + item.archives.length + t(' ZIP')).fontSize(12).fontColor('#546E7A').width('100%')
          if (item.reasons.length > 0) { Text(item.reasons.join('; ')).fontSize(12).fontColor('#795548').width('100%') }
          if (item.videos.length === 1) {
            Button(t('Play video')).flatButton().height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).width('100%').enabled(!this.libraryBusy && !this.importing && !this.openingVideo).onClick(() => this.openLibraryItem(item))
          }
          if (item.videos.length > 0) {
            Button(t('Choose mapping')).flatButton().height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).width('100%').enabled(!this.libraryBusy && !this.importing && !this.openingVideo).onClick(() => this.beginMapping(item))
          }
          if (this.manualItemId === item.id) {
            Text(t('Select one video and candidate scripts. Original matcher priority chooses each axis.')).fontSize(12).fontColor('#795548')
            ForEach(item.videos, (file: ResourceFileEntry) => {
              Button((this.manualVideoUri === file.uri ? '● ' : '○ ') + file.name).flatButton().height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).width('100%').onClick(() => { this.manualVideoUri = file.uri; })
            }, (file: ResourceFileEntry) => file.uri)
            ForEach(item.scripts, (match: ResourceScriptMatch) => {
              Button((this.manualScriptUris.indexOf(match.file.uri) >= 0 ? '☑ ' : '☐ ') + match.file.name).flatButton().height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).width('100%').onClick(() => this.toggleMappedScript(match.file.uri))
            }, (match: ResourceScriptMatch) => match.file.uri)
            Button(t('Open selected video · original search')).flatButton().height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).width('100%').enabled(!this.libraryBusy && !this.importing && !this.openingVideo).onClick(() => this.openLibraryItem(item, true, true))
            Button(t('Open selected mapping')).flatButton().height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).width('100%').enabled(!this.libraryBusy && !this.importing && !this.openingVideo).onClick(() => this.openLibraryItem(item, true))
          }
        }.padding(12).backgroundColor('#ECEFF1').borderRadius(3).width('100%')
      }, (item: ResourceLibraryItem) => item.id)
      if (this.libraryItems.length > this.libraryLimit) {
        Button(t('Show 20 more')).flatButton().height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).width('100%').onClick(() => { this.libraryLimit += 20; })
      }
    }.padding(10).backgroundColor('#F5F5F5').borderRadius(3).width('100%')
  }

  @Builder
  sourcePanel() {
    Column({ space: 0 }) {
      Row({ space: 0 }) {
        Column({ space: 2 }) {
          Text(t('Internal')).fontSize(13).fontWeight(FontWeight.Bold)
          Text(!this.videoMode ? t('Connected') : t('Inactive')).fontSize(10).fontColor(!this.videoMode ? '#008000' : '#757575')
        }.width(88).height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).justifyContent(FlexAlign.Center).backgroundColor(!this.videoMode ? '#E1E6E8' : '#F5F5F5')
          .onClick(() => { if (!this.importing && !this.openingVideo && !this.libraryBusy) { this.closeVideo(); } })
        Column({ space: 2 }) {
          Text(t('Local video')).fontSize(13).fontWeight(FontWeight.Bold)
          Text(t(this.videoMode ? this.videoState : 'Disconnected')).fontSize(10).fontColor(this.videoReady ? '#008000' : '#D32F2F')
        }.width(100).height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).justifyContent(FlexAlign.Center).backgroundColor(this.videoMode ? '#E1E6E8' : '#F5F5F5')
          .onClick(() => { this.showResources = true; if (!this.libraryLoaded) { this.scanDownloads(); } })
        Blank()
        Button('⌕').flatButton().height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).width(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).accessibilityText(t('Resources and script libraries')).onClick(() => this.showLibrary())
        Button(this.showSourceSettings ? '⌃' : '⚙').flatButton().height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).width(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).accessibilityText(t('Source settings')).onClick(() => { this.showSourceSettings = !this.showSourceSettings; })
      }.width('100%')
      Divider().color('#B0BEC5')
      Row() {
        Button(this.videoMode ? '■' : '⌕').flatButton().width(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).accessibilityText(this.videoMode ? t('Close local video') : t('Resources and script libraries')).enabled(!this.importing && !this.openingVideo && !this.libraryBusy)
          .onClick(() => { if (this.videoMode) { this.closeVideo(); } else { this.showResources = true; if (!this.libraryLoaded) { this.scanDownloads(); } } })
        Text(t(this.videoMode ? this.videoName : this.fileName)).fontSize(12).fontColor('#546E7A').layoutWeight(1).maxLines(1)
        Button(this.showSourceSettings ? '⌃' : '⌄').flatButton().width(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).accessibilityText(t('Expand source settings')).onClick(() => { this.showSourceSettings = !this.showSourceSettings; })
      }
      if (this.showSourceSettings) {
        Text(t('Local video is an OHOS addition. External-player adapters and the full Internal playlist are not ported yet.')).fontSize(12).fontColor('#795548').padding(10)
        if (this.videoMode) {
          Row() {
            Text(t('Volume')).fontSize(12).width(64)
            Slider({ value: this.volume, min: 0, max: 1, step: 0.01 }).layoutWeight(1).enabled(this.videoReady)
              .onChange((value: number) => { this.volume = value; this.video.setVolume(value); })
          }.padding(10)
        }
      }
    }.backgroundColor('#F5F5F5').borderRadius(3).width('100%')
  }
  @Builder
  outputPanel() {
    Column({ space: 0 }) {
      Row() {
        Column({ space: 2 }) {
          Text(t('Simulator')).fontSize(13).fontWeight(FontWeight.Bold)
          Text(this.connected ? t('Connected') : t('Disconnected')).fontSize(10).fontColor(this.connected ? '#008000' : '#D32F2F')
        }.width(100).height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).justifyContent(FlexAlign.Center).backgroundColor('#E1E6E8')
        Blank()
        Button('+').flatButton().width(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).enabled(false).accessibilityText(t('Physical output adapters are not implemented'))
        Button('⚙').flatButton().width(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).accessibilityText(t('Output settings')).onClick(() => { this.showOutputSettings = !this.showOutputSettings; })
      }.width('100%')
      Divider().color('#B0BEC5')
      Row() {
        Button(this.connected ? '■' : '▶').flatButton().width(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).accessibilityText(t('Toggle simulator connection')).onClick(() => {
          this.connected = !this.connected; this.pauseTransport(); this.engine.setConnected(this.connected); this.sync();
        })
        Text(t('No physical commands')).fontSize(12).fontColor('#546E7A').layoutWeight(1)
        Button(this.showOutputSettings ? '⌃' : '⌄').flatButton().width(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).onClick(() => { this.showOutputSettings = !this.showOutputSettings; })
      }
      if (this.showOutputSettings) {
        Text(t('Simulation only. TCP/UDP, serial, Bluetooth, per-output ranges and update protocols are not ported yet.')).fontSize(12).fontColor('#795548').padding(10)
      }
    }.backgroundColor('#F5F5F5').borderRadius(3).width('100%')
  }

  changeOffset(axisOnly: boolean, delta: number): void {
    if (this.importing || this.axisNames.length === 0) { return; }
    this.pauseTransport();
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
    this.pauseTransport();
    const target = markerMediaPosition(scriptTime, this.globalOffsetMs, this.engine.getAxisOffset(axis), this.durationMs);
    if (target === undefined) { this.status = 'Marker lies outside the current preview clock'; this.sync(); return; }
    this.seekTransport(target);
    this.status = 'Marker selected · playback paused';
    this.sync();
  }
  @Builder
  syncPanel() {
    Column({ space: 12 }) {
      this.heading('Synchronization', 'SIMULATION')
      Row({ space: 10 }) {
        Text((this.axisNames[this.selectedAxis] || t('Axis')) + t(' curve')).fontColor('#546E7A').layoutWeight(1)
        Select([{ value: 'Linear' }, { value: 'PCHIP' }, { value: 'Makima' }, { value: 'Step' }])
          .value(this.interpolationMode.toUpperCase()).height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).enabled(this.axisNames.length > 0 && !this.importing && !this.openingVideo && !this.libraryBusy)
          .onSelect((index: number) => {
            const modes: InterpolationMode[] = ['linear', 'pchip', 'makima', 'step'];
            this.pauseTransport(); this.engine.setAxisInterpolationMode(this.axisNames[this.selectedAxis], modes[index]); this.status = 'Curve changed · press Play to resume'; this.sync();
          })
      }.width('100%')
      Row({ space: 10 }) {
        Text(t('Playback speed')).fontColor('#546E7A').layoutWeight(1)
        Select([{ value: '0.25×' }, { value: '0.5×' }, { value: '1×' }, { value: '1.5×' }, { value: '2×' }, { value: '4×' }])
          .value(this.playbackSpeed.toString() + '×').height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).enabled(!this.importing && !this.openingVideo && !this.libraryBusy)
          .onSelect((index: number) => { const speeds: number[] = [0.25, 0.5, 1, 1.5, 2, 4]; if (this.videoMode) { this.video.setRate(speeds[index]); } else { this.engine.setSpeed(speeds[index]); } this.sync(); })
      }.width('100%')
      Text(t('Script scale: ') + Math.round(this.axisScale * 100) + '%').fontColor('#546E7A').width('100%')
      Slider({ value: this.axisScale, min: 0.01, max: 4, step: 0.01 }).width('100%')
        .enabled(this.axisNames.length > 0 && !this.importing && !this.openingVideo && !this.libraryBusy)
        .onChange((value: number) => { this.pauseTransport(); this.engine.setAxisScale(this.axisNames[this.selectedAxis], value); this.sync(); })
      Text(t('Global offset: ') + this.globalOffsetMs + t(' ms')).fontColor('#546E7A').width('100%')
      Row({ space: 8 }) {
        Button('−50').flatButton().height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).layoutWeight(1).backgroundColor('#ECEFF1').onClick(() => this.changeOffset(false, -50))
        Button(t('Reset')).flatButton().height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).layoutWeight(1).backgroundColor('#ECEFF1').onClick(() => this.changeOffset(false, -this.globalOffsetMs))
        Button('+50').flatButton().height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).layoutWeight(1).backgroundColor('#ECEFF1').onClick(() => this.changeOffset(false, 50))
      }
      Text((this.axisNames[this.selectedAxis] || t('Axis')) + t(' offset: ') + this.axisOffsetMs + t(' ms')).fontColor('#546E7A').width('100%')
      Row({ space: 8 }) {
        Button('−50').flatButton().height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).layoutWeight(1).backgroundColor('#ECEFF1').onClick(() => this.changeOffset(true, -50))
        Button(t('Reset')).flatButton().height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).layoutWeight(1).backgroundColor('#ECEFF1').onClick(() => this.changeOffset(true, -this.axisOffsetMs))
        Button('+50').flatButton().height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).layoutWeight(1).backgroundColor('#ECEFF1').onClick(() => this.changeOffset(true, 50))
      }
      Text(t('Positive offsets delay the script. Offset and curve edits pause playback. Preview clock duration stays unchanged.')).fontSize(12).fontColor('#607D8B')
    }.padding(10).backgroundColor('#F5F5F5').borderRadius(3).width('100%')
  }
  @Builder
  markerPanel() {
    if (this.document.metadata.chapters.length > 0 || this.document.metadata.bookmarks.length > 0) {
      Column({ space: 12 }) {
        this.heading('Script markers', 'SELECTED AXIS')
        Text(t(this.chapterLabel)).fontColor('#546E7A').width('100%').maxLines(2)
        if (this.document.metadata.chapters.length > 0) {
          Text(t('Chapters: ') + this.document.metadata.chapters.length).fontColor('#607D8B').width('100%')
          Row({ space: 8 }) {
            Button(t('Previous')).flatButton().height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).layoutWeight(1).backgroundColor('#ECEFF1').onClick(() => this.jumpChapter(-1))
            Button(t('Next')).flatButton().height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).layoutWeight(1).backgroundColor('#ECEFF1').onClick(() => this.jumpChapter(1))
          }
        }
        if (this.document.metadata.bookmarks.length > 0) {
          Text(t('Bookmarks: ') + this.document.metadata.bookmarks.length).fontColor('#607D8B').width('100%')
          Row({ space: 8 }) {
            Button(t('Previous')).flatButton().height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).layoutWeight(1).backgroundColor('#ECEFF1').onClick(() => this.jumpBookmark(-1))
            Button(t('Next')).flatButton().height(this.widthVp >= 840 && this.heightVp >= 600 ? 34 : 48).layoutWeight(1).backgroundColor('#ECEFF1').onClick(() => this.jumpBookmark(1))
          }
        }
      }.padding(10).backgroundColor('#F5F5F5').borderRadius(3).width('100%')
    }
  }
  @Builder
  transport() {
    Row({ space: 12 }) {
      Button(this.playing ? t('Pause') : (this.videoMode && this.durationMs > 0 && this.positionMs >= this.durationMs ? t('Rewind') : t('Play'))).flatButton().height(52).layoutWeight(1).backgroundColor('#607D8B').fontColor('#FFFFFF')
        .enabled(this.connected && this.foreground && !this.importing && !this.openingVideo && !this.libraryBusy && (this.videoMode ? this.videoReady : this.durationMs > 0)).onClick(() => this.playPause())
      Button(t('Stop output')).flatButton().height(52).layoutWeight(1).backgroundColor('#833D46').onClick(() => this.stop())
    }.width('100%')
  }
  @Builder
  sourceColumn() {
    Column({ space: 20 }) {
      this.sourcePanel()
      if (this.showResources) { this.libraryPanel() }
      this.outputPanel()
    }.width('100%')
  }
  @Builder
  videoStage() {
    Column({ space: 0 }) {
      // Keep this exact node mounted. The SDK's default SurfaceRect follows these
      // actual XComponent bounds; do not pin it with setXComponentSurfaceSize.
      XComponent({ id: 'mfp-native-video', type: 'surface', controller: this.videoSurface })
        .width('100%').layoutWeight(1).backgroundColor('#000000')
        .onLoad(() => this.surfaceChanged(this.videoSurface.getXComponentSurfaceId(), true))
      Column({ space: 0 }) {
        Row({ space: 4 }) {
          Button(this.playing ? 'Ⅱ' : (this.videoMode && this.durationMs > 0 && this.positionMs >= this.durationMs ? '↶' : '▶'))
            .flatButton().width(48).height(Math.min(48, this.workspaceLayout().controlsHeight)).fontSize(22).backgroundColor('#263238').fontColor('#FFFFFF')
            .accessibilityText(this.playing ? t('Pause') : t('Play or rewind'))
            .enabled(this.connected && this.foreground && !this.importing && !this.openingVideo && !this.libraryBusy && this.videoReady)
            .onClick(() => this.playPause())
          Text(this.videoName).fontSize(12).fontColor('#FFFFFF').layoutWeight(1).maxLines(1)
          Button(this.videoFullscreen ? t('Exit fullscreen') : t('Fullscreen in window')).flatButton().height(Math.min(48, this.workspaceLayout().controlsHeight)).padding({ left: 10, right: 10 })
            .backgroundColor('#37474F').fontColor('#FFFFFF').onClick(() => this.setVideoFullscreen(!this.videoFullscreen))
        }.width('100%').height(Math.min(48, this.workspaceLayout().controlsHeight))
        Row({ space: 8 }) {
          Slider({ value: this.positionMs, min: 0, max: Math.max(1, this.durationMs), step: 1 })
            .layoutWeight(1).height(32).selectedColor('#B0BEC5').trackColor('#546E7A').blockColor('#ECEFF1')
            .enabled(this.videoReady && !this.importing && !this.openingVideo && !this.libraryBusy)
            .onChange((value: number) => this.seekTransport(value))
          Text((this.positionMs / 1000).toFixed(1) + ' / ' + (this.durationMs / 1000).toFixed(1) + ' s')
            .fontSize(11).fontColor('#CFD8DC').maxLines(1)
        }.padding({ left: 8, right: 10 }).width('100%').height(36)
          .visibility(this.workspaceLayout().controlsHeight >= 84 ? Visibility.Visible : Visibility.None)
      }.width('100%').height(this.workspaceLayout().controlsHeight).backgroundColor('#263238').clip(true)
    }.width(Math.max(1, this.workspaceLayout().video.width)).height(Math.max(1, this.workspaceLayout().video.height))
      .position({ x: this.workspaceLayout().video.x, y: this.workspaceLayout().video.y })
      .visibility(this.videoMode ? Visibility.Visible : Visibility.Hidden).backgroundColor('#000000').clip(true)
  }
  @Builder
  workspaceSettings() {
    Column({ space: 0 }) {
      if (this.showPortInfo) {
        Text(t('Source-led main layout in progress. Grey tools are unavailable. No physical output. ZIP32 local search is bounded; device playback and visual parity are not yet validated.')).fontSize(12).fontColor('#795548').padding(10)
      }
      if (!this.videoMode && (this.widthVp >= 1200 || (this.widthVp > this.heightVp && this.widthVp >= 720))) {
        Row({ space: 20 }) {
          Scroll() { this.sourceColumn() }.layoutWeight(1).constraintSize({ maxWidth: 600 }).align(Alignment.Top)
          Scroll() { this.scriptArea() }.layoutWeight(1).constraintSize({ maxWidth: 600 }).align(Alignment.Top)
        }.padding(10).width('100%').constraintSize({ maxWidth: 1220 }).layoutWeight(1).alignItems(VerticalAlign.Top)
      } else {
        Scroll() {
          Column({ space: 12 }) {
            if (this.videoMode) { this.scriptArea() }
            this.sourcePanel()
            if (this.showResources) { this.libraryPanel() }
            if (!this.videoMode) { this.scriptArea() }
            this.outputPanel()
          }.padding(10).width('100%').constraintSize({ maxWidth: 600 })
        }.width('100%').layoutWeight(1).align(Alignment.Top)
      }
      Text(t(this.status)).fontSize(11).fontColor('#546E7A').width('100%').padding({ left: 10, right: 10, top: 4, bottom: 4 }).maxLines(2)
      if (!this.videoMode && (this.widthVp < 840 || this.heightVp < 500)) { this.transport() }
    }.width(this.workspaceLayout().settings.width).height(Math.max(1, this.workspaceLayout().settings.height))
      .position({ x: this.workspaceLayout().settings.x, y: this.workspaceLayout().settings.y })
      .visibility(this.videoFullscreen ? Visibility.Hidden : Visibility.Visible).clip(true)
  }
  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      this.workspaceSettings()
      // A layout switch only moves/resizes this same surface; no if/else around it.
      this.videoStage()
      Row({ space: 8 }) {
        Text('▶').fontSize(20).fontColor('#FFFFFF')
        Text('MultiFunPlayer').fontSize(14).fontColor('#FFFFFF').fontWeight(FontWeight.Medium).layoutWeight(1).maxLines(1)
        if (this.widthVp >= 420) { Text('0.6.0 OHOS').fontSize(12).fontColor('#CFD8DC') }
        Button('⌕').flatButton().width(48).height(48).fontColor('#FFFFFF').backgroundColor('#455A64').accessibilityText(t('Resources and script libraries')).onClick(() => this.showLibrary())
        Button('?').flatButton().width(48).height(48).fontColor('#FFFFFF').backgroundColor('#455A64').accessibilityText(t('Port status and limitations')).onClick(() => { this.showPortInfo = !this.showPortInfo; })
      }.padding({ left: 10, right: 4 }).width('100%').height(48).backgroundColor('#455A64')
        .visibility(this.videoFullscreen ? Visibility.Hidden : Visibility.Visible)
    }.width('100%').height('100%').backgroundColor('#FAFAFA').focusable(true)
      .onAreaChange((_old: Area, area: Area) => this.resizeWorkspace(Number(area.width), Number(area.height)))
      .onKeyEvent((event: KeyEvent) => {
        if (event.type === KeyType.Down && this.exitFullscreenWithKey(event.keyCode)) { event.stopPropagation(); }
      })
  }
}
