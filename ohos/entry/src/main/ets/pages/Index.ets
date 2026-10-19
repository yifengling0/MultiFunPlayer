import { videoPlaybackIntent, VideoDragBounds, VideoDragSession } from '../core/VideoInteraction';
import { ContinuousInputConfiguration, ContinuousInputAction } from '../input/ContinuousInputConfiguration';
import { ContinuousDriveEngine, ContinuousInputContext, ContinuousOutputIdentity, ContinuousCapture, ContinuousDispatch, ContinuousGestureData } from '../input/ContinuousDriveEngine';
import { LocalDrivePointer, LocalSurfaceGeometry, LocalTouchPacket, LocalMousePacket, LocalWheelPacket, LocalPointerResult } from '../input/LocalDrivePointer';
import { applyContinuousRange } from '../input/ContinuousInputActions';
import { ContinuousInputPanel } from '../components/ContinuousInputPanel';
import { ImmersiveMaterialManager } from '../presentation/immersive/ImmersiveMaterialManager';
import { MfpSliderMaterialModifier } from '../presentation/immersive/ImmersiveMaterialModifiers';
import { ConfirmationOwner, ConfirmationRequest, ConfirmationActions } from '../presentation/ConfirmationOwner';
import { OwnedConfirmationDialog, ConfirmationDialogGeometry } from '../components/OwnedConfirmationDialog';
import { SettingsDraftOwner } from '../presentation/SettingsDraftOwner';
import { NativeDeviceClipboard } from '../settings/NativeDeviceClipboard';
import { SerialDiagnosticSession, SerialDiagnosticSnapshot } from '../app/SerialDiagnosticSession';
import { NativeSerialFactory } from '../output/serial/NativeSerialFactory';
import type { SavedSerialBackend } from '../settings/SerialOutputPreferences';
import { SerialDiscoveryController, SerialDiscoverySnapshot } from '../output/SerialDiscoveryController';
import type { SerialDiscoveryContext } from '../output/SerialDiscoveryController';
import { SocketDiagnosticSession } from '../app/SocketDiagnosticSession';
import { UiStyle } from '../presentation/UiStyle';
import { applyOutputEndpointAction, isOutputEndpointAction, outputConnectionOperation } from '../input/ShortcutOutputConnectionActions';
import type { DeoVrDispatchBoundary } from '../media/deovr/DeoVrTypes';
import type { DeoVrControlRequest } from '../media/deovr/DeoVrControlEvidence';
import { RemoteMediaSession } from '../app/RemoteMediaSession';
import type { RemoteSourceKind } from '../app/RemoteMediaSession';
import type { DeoVrMediaSource } from '../media/deovr/DeoVrMediaSource';
import { parseMediaSourceShortcut } from '../input/ShortcutSourceActions';
import { DeoVrSourcePanel } from '../components/DeoVrSourcePanel';
import { MediaSourceConfiguration } from '../settings/MediaSourceConfiguration';
import { deoVrScriptMatchHint, parseDeoVrEndpointText } from '../media/deovr/DeoVrScriptMatch';
import type { DeoVrSnapshot, DeoVrEvent } from '../media/deovr/DeoVrTypes';
import { KeyboardInputSession } from '../app/KeyboardInputSession';
import { KeyboardShortcutConfiguration, ShortcutAction, cloneShortcutAction, shortcutActionCatalog, EMERGENCY_STOP_KEY, isShortcutKey } from '../input/ShortcutConfiguration';
import { applyAxisShortcutAction, applySyncShortcutAction } from '../input/ShortcutSettingActions';
import { applyMediaShortcut, shortcutNameEquals } from '../input/ShortcutMediaActions';
import { applyShortcutPointAction, customCurvePointArguments } from '../input/ShortcutPointActions';
import { SettingsOption, SettingsChoiceField, SettingsTextField, SettingsNumberField, SettingsSwitchField } from '../components/CurvePointEditor';
import { resolveManagedLoopingSelection, parseManagedLoopingScript } from '../input/ManagedLoopingSelection';
import { applyOutputRangeAction } from '../input/ShortcutOutputRangeActions';
import type { OutputRangeOperation } from '../input/ShortcutOutputRangeActions';
import { applyMotionShortcutAction, motionShortcutProviderId } from '../input/ShortcutMotionActions';
import { LocalShortcutEngine, ShortcutDispatch, ShortcutKeyEvent } from '../input/LocalShortcutEngine';
import { GeneralConfiguration } from '../settings/GeneralConfiguration';
import { ErrorPresentation, horizontalWorkspace } from '../presentation/GeneralPresentation';
import { InputSettingsPanel } from '../components/InputSettingsPanel';
import { GeneralSettingsPanel } from '../components/GeneralSettingsPanel';
import { NativeWindowPresentation } from '../presentation/NativeWindowPresentation';
import { WindowPresentationResult } from '../presentation/WindowPresentation';
import { OutputSettingsDraft } from '../output/OutputSettingsModel';
import { common } from '@kit.AbilityKit';
import { APP_VERSION_NAME } from '../core/AppVersion';
import { KeyCode } from '@kit.InputKit';
import { systemDateTime } from '@kit.BasicServicesKit';
import { FunscriptParser, FunscriptDocument } from '../core/Funscript';
import { PlaybackSession } from '../app/PlaybackSession';
import { PlaybackConfiguration } from '../settings/SettingsSchema';
import { InternalPlaylist, InternalPlaylistItem, InternalPlaylistEvent } from '../core/playback/InternalPlaylist';
import { InternalSourceLibrary } from '../core/playback/InternalSourceLibrary';
import { PlaylistPresentation, PlaylistPanelSnapshot, PlaylistPanelAction, PlaylistActionContext } from '../core/playback/PlaylistPresentation';
import { InternalPlaylistPanel } from '../components/InternalPlaylistPanel';
import { NativeOutputSession, OutputTargetSummary } from '../app/NativeOutputSession';
import { OutputTargetCollection } from '../output/OutputTargetCollection';
import type { SavedOutputTargetKind } from '../settings/OutputConfiguration';
import { OutputCoordinator, OutputEndpoint } from '../output/OutputCoordinator';
import type { OutputTargetConfig, TCodeProfile } from '../output/OutputTypes';
import { OutputSettingsPanel } from '../components/OutputSettingsPanel';
import { DeviceAxisDefinition, DeviceProfile, DeviceProfiles } from '../core/DeviceProfile';
import { AxisConfiguration, AxisConfigurationEntry, SyncConfiguration } from '../core/AxisConfiguration';
import { AxisScriptBinding } from '../core/AxisScriptStore';
import { MotionProviderConfiguration, MotionConfigurations } from '../core/MotionConfiguration';
import { AxisSettingsPanel } from '../components/AxisSettingsPanel';
import { DeviceSettingsPanel } from '../components/DeviceSettingsPanel';
import { SyncSettingsPanel } from '../components/SyncSettingsPanel';
import { MotionSettingsPanel, ManagedMotionScriptResource } from '../components/MotionSettingsPanel';
import type { InterpolationMode } from '../core/Interpolation';
import { interpolateAxis } from '../core/Interpolation';
import { AxisMapping } from '../core/AxisMapping';
import { activeChapter, markerMediaPosition } from '../core/MarkerNavigation';
import { MediaClockSnapshot } from '../core/MediaClock';
import { ResourceLibrary, ResourceFileEntry, ResourceLibraryItem, ResourceScriptMatch, ResourceScriptCandidate, ResourceLibraryCatalog, ResourceDiscoveryCandidate, ResourceSelectionResult } from '../core/ResourceLibrary';
import { LibraryFiles, LibraryFile, LibraryScanProgress } from '../library/LibraryFiles';
import { ScriptZipFiles } from '../library/ScriptZipFiles';
import { ScriptZipCandidate } from '../core/ScriptZip';
import { Heatmap, HeatmapBucket } from '../core/Heatmap';
import { NativeVideoAdapter } from '../media/NativeVideoAdapter';
import { VideoWorkspaceLayout, videoWorkspaceLayout, applicationWorkspaceLayout } from '../core/VideoLayout';
import { DownloadLibrary } from '../library/DownloadLibrary';
import { t } from '../l10n/Texts';



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
  .buttonStyle(ButtonStyleMode.NORMAL).controlSize(ControlSize.NORMAL)
  .backgroundColor(UiStyle.field).fontColor(UiStyle.ink).borderRadius(UiStyle.radius)
  .padding({ left: 12, right: 12, top: 8, bottom: 8 }).fontSize(UiStyle.glyph)
  .border({ width: 1, color: UiStyle.hairline })
  .labelStyle({ maxLines: 4 }).stateEffect(true)
}

class ShortcutConnectionOwner {
  readonly coordinator: OutputCoordinator; readonly requestId: number;
  constructor(coordinator: OutputCoordinator, requestId: number) { this.coordinator = coordinator; this.requestId = requestId; }
}

@Entry
@Component
struct Index {
  @StorageLink('mfpImmersiveMaterialRevision') @Watch('materialPresentationChanged') materialRevision: number = 0;
  private materialPresentationChanged(): void {}
  private confirmationOwner: ConfirmationOwner | null = null;
  private confirmationController: CustomDialogController | undefined = undefined;
  private confirmationCloseUnconfirmed: boolean = false;
  @State private confirmationErrorId: number = 0;
  @StorageLink('mfpForeground') @Watch('foregroundChanged') foreground: boolean = true;
  @State widthVp: number = 400;
  @State heightVp: number = 800;
  @State playing: boolean = false;
  @State positionMs: number = 0;
  @State durationMs: number = 0;
  @State axisNames: string[] = [];
  @State axisValues: number[] = [];
  @State selectedAxis: number = 0;
  @State selectedTab: number = 0;
  @State fileName: string = 'No video selected';
  @State status: string = 'Preview only · output is disconnected';
  @State importing: boolean = false;
  @State interpolationMode: InterpolationMode = 'pchip';
  @State axisInverted: boolean = false;
  @State axisScale: number = 1;
  @State playbackSpeed: number = 1;
  @State globalOffsetMs: number = 0;
  @State axisOffsetMs: number = 0;
  @State chapterLabel: string = 'No active chapter';
  @State videoMode: boolean = false;
  @State videoFullscreen: boolean = false;
  @State videoControlsVisible: boolean = true;
  @State videoFloating: boolean = false;
  @State floatingXRatio: number = 1;
  @State floatingYRatio: number = 1;
  @State videoActionPending: boolean = false;
  private observedVideo: MediaClockSnapshot | null = null;
  private videoActionEpoch: number = 0;
  private videoDragging: boolean = false;
  private videoDrag: VideoDragSession = new VideoDragSession();
  private videoTapBlockedUntil: number = 0;
  private videoChromeTimer: number = -1;
  private videoChromeEpoch: number = 0;
  private presentationOwner: number = 0;
  @State presentationMode: string = 'windowed';
  @State presentationReason: string = '';
  @State presentationRestorePending: boolean = false;
  @State videoReady: boolean = false;
  @State videoOnly: boolean = false;
  @State videoState: string = 'idle';
  @State videoName: string = 'No video selected';
  @State volume: number = 0.6;
  @State openingVideo: boolean = false;
  @State showPortInfo: boolean = false;
  @State showResources: boolean = true;
  @State resourceFocus: boolean = false;
  private settingsScroller: Scroller = new Scroller();
  private sourceScroller: Scroller = new Scroller();
  @State showSourceSettings: boolean = false;
  @State showOutputSettings: boolean = true;
  /** Connection workspace is a small page flow: list → add → target detail. */
  @State outputPage: string = 'list';
  /** Output/settings use the full inspector height; a ready video is kept alive
   * (not released) and restored when returning to script/media. */
  @State previewAutoCollapsed: boolean = false;
  @State showMediaSettings: boolean = false;
  @State showAxisSettings: boolean = true;
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
  private activeVideoFile: ResourceFileEntry | null = null;
  private scriptReloadRequest: number = 0;
  @State scriptReloadBusy: boolean = false;
  @State scriptReloadStatus: string = '';
  private internalLibrary: InternalSourceLibrary = new InternalSourceLibrary();
  private playlist: InternalPlaylist = new InternalPlaylist(Math.random, (item: InternalPlaylistItem) => this.internalLibrary.refresh(item));
  @State playlistView: PlaylistPanelSnapshot = new PlaylistPanelSnapshot();
  @State internalConnected: boolean = false;
  @State mediaSourceConfiguration: MediaSourceConfiguration = new MediaSourceConfiguration();
  @State deoVrConnected: boolean = false;
  @State deoVrBusy: boolean = false;
  @State deoVrCloseConfirmed: boolean = true;
  @State deoVrStatus: string = '未连接';
  @State deoVrError: string = '';
  @State deoVrPath: string = '';
  @State deoVrPosition: number | null = null;
  @State deoVrDuration: number | null = null;
  @State deoVrPlaying: boolean = false;
  @State deoVrStale: boolean = true;
  private remoteKind: RemoteSourceKind = 'deovr';
  private deoVrActive: boolean = false;
  private deoVrRequest: number = 0;
  private deoVrControlRequest: number = 0;
  private deoVrMatchRequest: number = 0;
  private mediaSettingsRequest: number = 0;
  private deoVrResourceRevision: number = -1;
  private deoVrGeneration: number = -1;
  private deoVrUnsubscribe: (() => void) | null = null;
  private deoVrMatching: boolean = false;
  private internalBusy: boolean = false;
  private internalLoading: boolean = false;
  private internalAwaitingReload: boolean = false;
  @State standaloneMotion: boolean = false;
  @State manualPreview: boolean = false;
  private manualOutputConnections: string[] = [];
  @State runtimeBusy: boolean = false;
  @State runtimeMessage: string = '';
  private runtimeControlRequest: number = 0;
  private internalError: string = '';
  private internalRequest: number = 0;
  private internalLastTick: number = 0;
  private internalRestored: boolean = false;
  private internalAutoConnectAttempted: boolean = false;
  private resumeSeekRequest: number = -1;
  private mediaPlayIntent: boolean = false;
  private libraryRoot: string = '';
  private libraryRequest: number = 0;
  private libraryPicking: boolean = false;
  private pairOpening: boolean = false;
  private engine: PlaybackSession = PlaybackSession.current();
  private output: OutputTargetCollection = NativeOutputSession.current(this.engine);
  @State outputTargets: OutputTargetSummary[] = [];
  @State selectedOutputId: string = '';
  @State outputDeviceId: string = '';
  @State outputSaveDiagnostic: string = '';
  @State outputProfile: TCodeProfile = { precision: 4, revision: 0, axisOrder: [], maximumDurationMs: 10000, maximumPayloadBytes: 1024 };
  @State outputDraft: OutputSettingsDraft = NativeOutputSession.draftSnapshot();
  @State outputApplicationId: number = 0;
  @State outputConnection: string = 'disconnected';
  @State outputArmed: boolean = false;
  @State outputSuspended: boolean = false;
  @State outputSeeking: boolean = false;
  @State outputBusy: boolean = false;
  @State outputWrites: number = 0;
  @State outputBytes: number = 0;
  @State outputDiagnostic: string = '';
  private serialProbeOwner: number = 0;
  private serialProbeFactory: NativeSerialFactory = new NativeSerialFactory();
  private serialProbeContext: string = '';
  @State serialProbeState: SerialDiagnosticSnapshot = new SerialDiagnosticSnapshot();
  @State serialProbeNotice: string = '';
  private serialDiscovery: SerialDiscoveryController = new SerialDiscoveryController(new NativeSerialFactory());
  @State serialDiscoveryState: SerialDiscoverySnapshot = new SerialDiscoverySnapshot();
  @State activeAxes: DeviceAxisDefinition[] = [];
  @State profiles: DeviceProfile[] = [];
  @State selectedProfileId: string = 'TCode-0.3';
  @State selectedAxisDefinition: DeviceAxisDefinition = new DeviceAxisDefinition('L0');
  @State selectedAxisConfiguration: AxisConfiguration = new AxisConfiguration(new DeviceAxisDefinition('L0'));
  @State syncConfiguration: SyncConfiguration = new SyncConfiguration();
  @State motionConfiguration: MotionProviderConfiguration = new MotionProviderConfiguration('Random');
  @State motionEditorId: string = 'Random';
  @State managedMotionScripts: ManagedMotionScriptResource[] = [];
  @State settingsMessage: string = '';
  @State settingsReadOnly: boolean = false;
  @State recoveryRequired: boolean = false;
  @State showDeviceSettings: boolean = false;
  @State showMotionSettings: boolean = false;
  private motionCanvasOwner: number = 0;
  private motionCanvasContext: string = '';
  @State sessionFault: string = '';
  @State axisIndicators: string[] = [];
  private settingsRevision: number = -1;
  private settingsAxis: string = '';
  private settingsProvider: string = '';
  private motionLoadRequests: Map<string, number> = new Map<string, number>();
  @State document: FunscriptDocument = new FunscriptDocument([]);
  private video: NativeVideoAdapter = new NativeVideoAdapter((snapshot: MediaClockSnapshot) => this.videoSnapshot(snapshot));
  private videoSurface: VideoSurfaceController = new VideoSurfaceController((id: string, available: boolean) => this.surfaceChanged(id, available));
  private surfaceId: string = '';
  private pendingVideoUri: string = '';
  private openVideoRequest: number = 0;
  private libraryPlayRequest: number = -1;
  private libraryOpeningRevision: number = -1;
  private screenRevision: number = 0;
  @State currentScreen: string = 'library';
  @State workspacePreviewCollapsed: boolean = false;
  @State librarySearch: string = '';
  private librarySearchEditor: number = KeyboardInputSession.newEditorId();
  @State libraryDetailsId: string = '';
  private settingsDraftOwner: SettingsDraftOwner = new SettingsDraftOwner();
  @State settingsDraftEpoch: number = 0;
  private settingsDraftContext: string = '';
  @State workspaceTool: string = 'script';
  @State showTrace: boolean = false;
  @State showAddOutput: boolean = false;
  @State showAllOutputStates: boolean = false;
  @State showScriptResourceDetails: boolean = false;
  @State showMediaAdvanced: boolean = false;
  private selectScreen(screen: string): void {
    if (!['library', 'player', 'workspace'].some(value => value === screen) || screen === this.currentScreen) { return; }
    if (screen === 'player' && !this.videoMode) { return; }
    this.retireSettingsDrafts(); this.screenRevision++; KeyboardInputSession.setEditorFocus(this.librarySearchEditor, false);
    if (screen !== 'player') { this.cancelLibraryPlayback(); this.setVideoFullscreen(false); }
    this.currentScreen = screen; this.videoFloating = false; this.videoDragging = false;
  }
  private selectWorkspaceTool(tool: string): void {
    if (!['script', 'output', 'media', 'settings'].some(value => value === tool)) { return; }
    const changed = tool !== this.workspaceTool;
    if (this.workspaceTool === 'settings' && this.showInputSettings && changed) { this.cancelKeyboardWork(); this.showInputSettings = false; this.updateKeyboardContext(); }
    this.selectScreen('workspace');
    if (this.videoMode) { this.setVideoFloating(false); }
    if (tool === 'output' || tool === 'settings') {
      if (this.videoMode && !this.workspacePreviewCollapsed) {
        this.workspacePreviewCollapsed = true; this.previewAutoCollapsed = true;
      }
    } else if (this.previewAutoCollapsed) {
      this.workspacePreviewCollapsed = false; this.previewAutoCollapsed = false;
    }
    if (changed) {
      this.retireSettingsDrafts();
      this.workspaceTool = tool;
      if (tool === 'output') { this.outputPage = 'list'; }
    }
    this.settingsScroller.scrollEdge(Edge.Top);
  }
  private visibleLibraryItems(): ResourceLibraryItem[] {
    const query = this.librarySearch.trim().toLocaleLowerCase();
    return this.libraryItems.filter(item => item.videos.length > 0 &&
      (query.length === 0 || item.title.toLocaleLowerCase().indexOf(query) >= 0));
  }
  private librarySearchHandler(): (value: string) => void {
    const owner = this.keyboardOwner; const revision = this.screenRevision;
    return (value: string): void => {
      if (this.viewActive && this.foreground && owner === this.keyboardOwner && KeyboardInputSession.ownsListener(owner) && revision === this.screenRevision && this.currentScreen === 'library') {
        this.librarySearch = value.slice(0, 256); this.libraryLimit = 20;
      }
    };
  }
  private librarySearchFocusHandler(focused: boolean): () => void {
    const revision = this.screenRevision; const editor = this.librarySearchEditor; const owner = this.keyboardOwner;
    return (): void => { if (KeyboardInputSession.ownsListener(owner) && owner === this.keyboardOwner && revision === this.screenRevision && this.currentScreen === 'library' && this.viewActive && this.foreground) { KeyboardInputSession.setEditorFocus(editor, focused); } };
  }
  clearLibrarySearch(): void {
    if (this.currentScreen === 'library' && this.viewActive && this.foreground) { this.librarySearch = ''; this.libraryLimit = 20; }
  }
  private libraryPlayHandler(item: ResourceLibraryItem, manual: boolean = false, originalSearch: boolean = false): () => void {
    const request = this.libraryRequest; const revision = this.screenRevision; const epoch = this.settingsDraftEpoch; const owner = this.keyboardOwner;
    return (): void => {
      if (request !== this.libraryRequest || revision !== this.screenRevision || epoch !== this.settingsDraftEpoch || owner !== this.keyboardOwner || !KeyboardInputSession.ownsListener(owner) ||
        this.currentScreen !== 'library' || !this.viewActive || !this.foreground || !this.libraryItems.some(current => current === item)) { return; }
      if (!manual && item.videos.length > 1) { this.libraryDetailsId = item.id; this.beginMapping(item); }
      else { void this.playLibraryItem(item, manual, originalSearch); }
    };
  }
  private libraryDetailsHandler(item: ResourceLibraryItem): () => void {
    const request = this.libraryRequest; const revision = this.screenRevision; const epoch = this.settingsDraftEpoch; const owner = this.keyboardOwner;
    return (): void => {
      if (request !== this.libraryRequest || revision !== this.screenRevision || epoch !== this.settingsDraftEpoch || owner !== this.keyboardOwner || !KeyboardInputSession.ownsListener(owner) || this.currentScreen !== 'library' || !this.viewActive || !this.foreground ||
        this.libraryBusy || this.openingVideo || this.importing || !this.libraryItems.some(current => current === item)) { return; }
      this.libraryDetailsId = this.libraryDetailsId === item.id ? '' : item.id;
      if (this.libraryDetailsId.length > 0) { this.beginMapping(item); }
    };
  }
  private librarySelectionHandler(item: ResourceLibraryItem, uri: string, script: boolean): () => void {
    const request = this.libraryRequest; const revision = this.screenRevision; const epoch = this.settingsDraftEpoch; const owner = this.keyboardOwner;
    return (): void => {
      if (request !== this.libraryRequest || revision !== this.screenRevision || epoch !== this.settingsDraftEpoch || owner !== this.keyboardOwner || !KeyboardInputSession.ownsListener(owner) || this.currentScreen !== 'library' || this.libraryDetailsId !== item.id ||
        this.manualItemId !== item.id || !this.viewActive || !this.foreground || this.libraryBusy || this.openingVideo || this.importing ||
        !this.libraryItems.some(current => current === item)) { return; }
      if (script && item.scripts.some(match => match.file.uri === uri)) { this.toggleMappedScript(uri); }
      else if (!script && item.videos.some(file => file.uri === uri)) { this.manualVideoUri = uri; }
    };
  }
  private async playLibraryItem(item: ResourceLibraryItem, manual: boolean = false, originalSearch: boolean = false): Promise<void> {
    if (this.currentScreen !== 'library' || this.confirmationCloseUnconfirmed || !this.viewActive || !this.foreground || this.runtimeBusy || this.libraryBusy || this.openingVideo || this.importing ||
      !this.libraryItems.some(current => current === item)) { return; }
    const video = manual ? item.videos.find(file => file.uri === this.manualVideoUri) : item.video;
    if (video === undefined) { this.libraryDetailsId = item.id; this.status = '请选择一个视频'; return; }
    KeyboardInputSession.setEditorFocus(this.librarySearchEditor, false);
    this.retireSettingsDrafts(); this.currentScreen = 'player'; const revision = ++this.screenRevision;
    this.libraryOpeningRevision = revision;
    const request = await this.openLibraryItem(item, manual, originalSearch);
    if (revision !== this.screenRevision || this.currentScreen !== 'player' || !this.viewActive || !this.foreground) { return; }
    if (request < 0 || request !== this.openVideoRequest || !this.videoMode || this.videoState === 'error') { this.libraryOpeningRevision = -1; return; }
    this.libraryPlayRequest = request; this.startLibraryPlayback();
  }
  private cancelLibraryPlayback(): void {
    this.libraryPlayRequest = -1;
    if (this.libraryOpeningRevision < 0) { return; }
    // Opening already completed: a destination/resize change must not release
    // the playing Surface or close output. Only an in-flight preparation is
    // cancellable here; explicit Stop/background owns a completed source.
    if (this.videoMode && this.videoReady && !this.openingVideo && !this.importing) {
      this.libraryOpeningRevision = -1;
      return;
    }
    this.libraryOpeningRevision = -1; this.openVideoRequest++; this.pendingVideoUri = '';
    console.info('[MFP nav] cancelLibraryPlayback releasing video/output/engine');
    this.openingVideo = false; this.importing = false; this.pairOpening = false; this.videoReady = false; this.videoMode = false;
    this.setVideoFullscreen(false); this.video.release(); this.output.stop(); this.engine.stop(); this.engine.clearScripts(); this.engine.useExternalClock(false);
    this.document = new FunscriptDocument([]); this.status = '已取消视频打开'; this.sync();
  }
  private startLibraryPlayback(): void {
    const request = this.libraryPlayRequest;
    if (!KeyboardInputSession.isWindowFocused()) { this.screenRevision++; this.cancelLibraryPlayback(); return; }
    if (request < 0 || request !== this.openVideoRequest || this.currentScreen !== 'player' || !this.viewActive || !this.foreground ||
      !this.videoMode || !this.videoReady || this.openingVideo || this.importing || this.libraryBusy || this.confirmationCloseUnconfirmed) { return; }
    this.libraryPlayRequest = -1; this.libraryOpeningRevision = -1;
    const started: boolean = this.engine.play();
    if (started) { this.mediaPlayIntent = true; this.syncOutput(); this.video.play(); }
  }
  private outputSummary(): string {
    const connected = this.outputTargets.filter(target => target.connection === 'connected').length;
    const armed = this.outputTargets.filter(target => target.armed).length;
    const pending = this.outputTargets.filter(target => target.armed && target.dispatchSuspended).length;
    const faults = this.outputTargets.filter(target => target.connection === 'fault').length;
    return connected + ' 个已连接 · ' + (armed === 0 ? '输出未启用' : armed + ' 个已启用' + (pending > 0 ? ' / ' + pending + ' 个待命' : '')) + (faults > 0 ? ' · ' + faults + ' 个故障' : '');
  }
  private outputConnectedCount(): number { return this.outputTargets.filter(target => target.connection === 'connected').length; }
  private outputArmedCount(): number { return this.outputTargets.filter(target => target.armed).length; }
  private outputFaultCount(): number { return this.outputTargets.filter(target => target.connection === 'fault' || target.removing).length; }
  private selectedOutputName(): string {
    const target = this.outputTargets.find(value => value.id === this.selectedOutputId);
    return target === undefined ? '输出设备' : target.name;
  }
  private selectedOutputExists(): boolean { return this.outputTargets.some(value => value.id === this.selectedOutputId); }
  private selectedOutputKind(): string {
    const target = this.outputTargets.find(value => value.id === this.selectedOutputId);
    return target === undefined ? '输出' : this.outputKindLabel(target.kind);
  }
  private selectedOutputGeneration(): number {
    const target = this.outputTargets.find(value => value.id === this.selectedOutputId);
    return target === undefined ? 0 : target.generation;
  }
  private selectedOutputRemoving(): boolean {
    const target = this.outputTargets.find(value => value.id === this.selectedOutputId);
    return target !== undefined && target.removing;
  }
  private selectedOutputIsSerial(): boolean {
    const target = this.outputTargets.find(value => value.id === this.selectedOutputId);
    return target !== undefined && target.kind === 'serial';
  }
  private outputKindLabel(kind: string): string {
    return kind === 'serial' ? '串口 / USB' : kind === 'webSocket' ? 'WebSocket' : kind.toUpperCase();
  }
  private outputKindShort(kind: string): string {
    return kind === 'serial' ? 'USB' : kind === 'webSocket' ? 'WS' : kind.toUpperCase();
  }
  private outputEndpointLabel(id: string): string {
    const draft = NativeOutputSession.draftSnapshot(id);
    if (draft.model.kind === 'serial') {
      return draft.serial.portName.length > 0 ? draft.serial.portName : '未选择串口';
    }
    if (draft.model.kind === 'webSocket') {
      return draft.scheme + '://' + draft.host + ':' + draft.port + (draft.path.length > 0 ? draft.path : '/');
    }
    return draft.host + ':' + draft.port;
  }
  private outputStatusTone(target: OutputTargetSummary): string {
    if (target.removing || target.connection === 'fault') { return UiStyle.danger; }
    if (target.connection === 'connected') { return UiStyle.success; }
    if (target.connection === 'connecting') { return UiStyle.warning; }
    return UiStyle.muted;
  }
  private outputStatusSoft(target: OutputTargetSummary): string {
    if (target.removing || target.connection === 'fault') { return UiStyle.dangerSoft; }
    if (target.connection === 'connected') { return UiStyle.successSoft; }
    if (target.connection === 'connecting') { return UiStyle.warningSoft; }
    return UiStyle.fill;
  }
  private openOutputTarget(target: OutputTargetSummary): void {
    this.selectOutputTarget(target.id, target.generation);
    this.outputPage = 'detail';
    this.settingsScroller.scrollEdge(Edge.Top);
  }
  private addOutputAndOpen(kind: SavedOutputTargetKind): void {
    const before = this.selectedOutputId;
    this.addOutputTarget(kind);
    if (this.selectedOutputId !== before && this.outputTargets.some(target => target.id === this.selectedOutputId)) {
      this.outputPage = 'detail';
      this.settingsScroller.scrollEdge(Edge.Top);
    }
  }
  private outputBack(): void {
    this.outputPage = 'list';
    this.showAddOutput = false;
    this.settingsScroller.scrollEdge(Edge.Top);
  }
  private wideWorkspace(): boolean {
    return !this.videoFloating && !this.workspacePreviewCollapsed && this.widthVp >= 900 && horizontalWorkspace(this.widthVp, this.heightVp, this.generalConfiguration.appOrientation);
  }
  private toggleWorkspacePreview(): void {
    this.retireSettingsDrafts();
    this.workspacePreviewCollapsed = !this.workspacePreviewCollapsed;
    this.previewAutoCollapsed = false;
  }
  private inspectorWidth(): number {
    const available = this.workspaceLayout().settings.width;
    return !this.workspaceLayout().sideBySide && this.wideWorkspace()
      ? Math.min(480, Math.max(320, available * 0.34)) : available;
  }
  private inspectorHeight(): number {
    const available = this.workspaceLayout().settings.height;
    if (this.workspaceLayout().sideBySide) { return available; }
    return Math.max(0, available - (this.wideWorkspace() ? 32 : 100));
  }
  private outputChoiceHandler(): (value: string) => void {
    const ids: string[] = this.outputTargets.map(target => target.id);
    const generations: number[] = this.outputTargets.map(target => target.generation);
    const epoch = this.settingsDraftEpoch;
    return (value: string): void => {
      const index: number = ids.indexOf(value);
      if (this.viewActive && this.foreground && epoch === this.settingsDraftEpoch && index >= 0) { this.selectOutputTarget(ids[index], generations[index]); }
    };
  }

  private axisScaleHandler(): (value: number) => void {
    const axisName: string = this.axisNames[this.selectedAxis];
    const scope: string = this.settingsScope('axis');
    const epoch: number = this.settingsDraftEpoch;
    const source: string = JSON.stringify([scope, epoch]);
    const token: number = this.settingsDraftOwner.open(scope, '$scaleSlider', source, '').token;
    return (value: number): void => {
      if (axisName === undefined || !this.viewActive || !this.foreground || this.settingsReadOnly || this.recoveryRequired ||
        scope !== this.settingsScope('axis') || epoch !== this.settingsDraftEpoch ||
        !this.settingsDraftOwner.isCurrent(token, source) || !Number.isFinite(value)) { return; }
      const configuration = this.engine.getAxisConfiguration(axisName);
      configuration.scriptScale = value; this.applyAxisSettings(configuration);
    };
  }
  private retireSettingsDrafts(): void { this.cancelContinuousInput('布局或编辑上下文已变化'); this.closeConfirmation(); this.settingsDraftOwner.invalidate(); this.settingsDraftEpoch++; }
  private settingsScope(kind: string): string {
    const registry = this.engine.activeRegistry();
    const profile = registry.profile.id + ':' + registry.revision;
    if (kind === 'axis' || kind === 'motion') { return kind + ':' + profile + ':' + (this.axisNames[this.selectedAxis] || '') + (kind === 'motion' ? ':' + this.motionEditorId : ''); }
    if (kind === 'device') { return kind + ':' + this.selectedProfileId; }
    if (kind === 'output') { return kind + ':' + profile + ':' + this.outputDraft.targetId + ':' + this.outputDraft.targetGeneration; }
    if (kind === 'source') { return kind + ':' + this.mediaSourceConfiguration.selectedSource; }
    return kind + ':' + profile;
  }
  private syncSettingsDraftContext(): void {
    const context = JSON.stringify([this.settingsScope('axis'), this.settingsScope('motion'), this.settingsScope('device'),
      this.settingsScope('output'), this.settingsScope('source'), this.videoMode,
      horizontalWorkspace(this.widthVp, this.heightVp, this.generalConfiguration.appOrientation), this.settingsReadOnly, this.recoveryRequired]);
    if (context !== this.settingsDraftContext) { this.retireSettingsDrafts(); this.settingsDraftContext = context; }
  }
  private viewActive: boolean = false;
  @State keyboardConfiguration: KeyboardShortcutConfiguration = new KeyboardShortcutConfiguration();
  @State generalConfiguration: GeneralConfiguration = new GeneralConfiguration();
  @State showInputSettings: boolean = false;
  @State showGeneralSettings: boolean = false;
  @State keyboardCaptureId: string = '';
  @State keyboardCaptureRevision: number = 0;
  @State keyboardCaptureKeys: number[] = [];
  @State inputMessage: string = '';
  @State inputFocusMessage: string = '';
  @State continuousConfiguration: ContinuousInputConfiguration = new ContinuousInputConfiguration();
  @State continuousMappingId: string = '';
  @State showContinuousInput: boolean = false;
  @State continuousReceiving: boolean = false;
  @State continuousContact: boolean = false;
  @State continuousReceptionRevision: number = 0;
  @State continuousStatus: string = '尚未接收；配置不会连接或 Arm';
  @State continuousLatestValue: number = 0.5;
  @State continuousLatestDelta: number = 0;
  @State continuousLastAction: string = '';
  private continuous: ContinuousDriveEngine = new ContinuousDriveEngine();
  private continuousPointer: LocalDrivePointer = new LocalDrivePointer();
  private continuousCapture: ContinuousCapture | null = null;
  private continuousContactSerial: number = -1;
  private continuousControlRevision: number = 0;
  private continuousTimer: number = -1;
  private continuousExpectedTargets: string = '';
  private keyboard: LocalShortcutEngine = new LocalShortcutEngine();
  private shortcutQueue: Promise<void> = Promise.resolve();
  private shortcutQueueToken: number = -1;
  private shortcutWorkerRevision: number = 0;
  private activeShortcutDispatch: ShortcutDispatch | null = null;
  private shortcutAxes: Map<ShortcutDispatch, string> = new Map<ShortcutDispatch, string>();
  private shortcutProfiles: Map<ShortcutDispatch, number> = new Map<ShortcutDispatch, number>();
  private shortcutConnections: Map<ShortcutDispatch, ShortcutConnectionOwner> = new Map<ShortcutDispatch, ShortcutConnectionOwner>();
  private shortcutOutputOwners: Map<ShortcutDispatch, Map<string, number>> = new Map<ShortcutDispatch, Map<string, number>>();
  private pendingShortcutDispatches: ShortcutDispatch[] = [];
  private keyboardOwner: number = 0;
  private errors: ErrorPresentation = new ErrorPresentation();
  @State errorNoticeId: number = 0;
  @State errorNoticeMode: string = '';
  @State errorNoticeMessage: string = '';
  private diagnosticOwner: number = 0;
  @State diagnosticKind: string = 'tcp';
  @State diagnosticHost: string = '';
  @State diagnosticPort: number = 0;
  @State diagnosticConfirmed: boolean = false;
  @State diagnosticBusy: boolean = false;
  @State diagnosticBlocked: boolean = false;
  @State diagnosticPhase: string = 'idle';
  @State diagnosticNotice: string = '';
  @State diagnosticResult: string = '尚未诊断。请先在自己的电脑启动专用接收脚本。';
  @State showSocketDiagnostic: boolean = false;
  private timer: number = -1;
  private lastTick: number = 0;
  private playerCanvas: CanvasRenderingContext2D = new CanvasRenderingContext2D(new RenderingContextSettings(true));
  private canvas: CanvasRenderingContext2D = new CanvasRenderingContext2D(new RenderingContextSettings(true));

  aboutToAppear(): void {
    this.librarySearchEditor = KeyboardInputSession.renewEditor(this.librarySearchEditor);
    void ImmersiveMaterialManager.initialize();
    this.viewActive = true;
    this.settingsDraftOwner = new SettingsDraftOwner(); this.settingsDraftOwner.setAvailable(this.foreground); this.settingsDraftEpoch++;
    this.diagnosticOwner = SocketDiagnosticSession.claimOwner();
    this.serialProbeOwner = SerialDiagnosticSession.claimOwner();
    this.mediaSourceConfiguration = this.engine.mediaSourceConfiguration();
    this.remoteKind = this.mediaSourceConfiguration.selectedSource === 'heresphere' ? 'heresphere' : 'deovr';
    const deoUnsubscribe = RemoteMediaSession.current('deovr').subscribe((snapshot: DeoVrSnapshot, events: ReadonlyArray<DeoVrEvent>) => this.deoVrSnapshot(snapshot, events, 'deovr'));
    const hereUnsubscribe = RemoteMediaSession.current('heresphere').subscribe((snapshot: DeoVrSnapshot, events: ReadonlyArray<DeoVrEvent>) => this.deoVrSnapshot(snapshot, events, 'heresphere'));
    this.deoVrUnsubscribe = (): void => { deoUnsubscribe(); hereUnsubscribe(); };
    this.deoVrSnapshot(this.remoteSource().snapshot(), [], this.remoteKind);
    this.keyboardConfiguration = this.engine.keyboardConfiguration(); this.generalConfiguration = this.engine.generalConfiguration();
    this.keyboard.setConfiguration(this.keyboardConfiguration);
    this.continuousConfiguration = this.engine.continuousInputConfiguration(); this.continuous.setConfiguration(this.continuousConfiguration);
    this.keyboardOwner = KeyboardInputSession.setListener((_editing: boolean): void => this.updateKeyboardContext(),
      (keyCode: number, pressed: boolean): boolean => this.handleKeyboardKey(keyCode, pressed),
      (): void => this.cancelKeyboardWork());
    this.presentationOwner = NativeWindowPresentation.setListener((result: WindowPresentationResult): void => this.presentationChanged(result));
    this.engine.setForeground(this.foreground);
    NativeOutputSession.setForeground(this.foreground);
    this.engine.setConnected(true);
    const registry = this.engine.activeRegistry();
    NativeOutputSession.restore(this.engine.outputConfiguration(), registry.profile, registry.revision);
    this.sync();
    this.lastTick = systemDateTime.getUptime(systemDateTime.TimeType.STARTUP, false);
    this.timer = setInterval(() => {
      const now = systemDateTime.getUptime(systemDateTime.TimeType.STARTUP, false);
      this.updateKeyboardContext();
      for (const dispatch of this.keyboard.advance(now, this.keyboard.cancellationToken())) { this.runShortcutDispatch(dispatch); }
      this.tickInternal(now);
      this.engine.tick(Math.max(0, now - this.lastTick), now);
      this.processMediaSeekRequests();
      this.finishMediaSeek();
      if (this.engine.fault().length > 0 && this.sessionFault.length === 0 && this.videoMode) { this.video.pause(); }
      this.lastTick = now;
      this.sync();
    }, 40);
    this.scanDownloads();
  }
  aboutToDisappear(): void {
    this.videoActionEpoch++; this.videoActionPending = false; this.videoDragging = false;
    this.libraryPlayRequest = -1; this.libraryOpeningRevision = -1; this.screenRevision++; KeyboardInputSession.releaseEditor(this.librarySearchEditor);
    this.closeConfirmation();
    this.settingsDraftOwner.dispose(); this.settingsDraftEpoch++;
    this.serialDiscovery.cancel();
    SerialDiagnosticSession.releaseOwner(this.serialProbeOwner); this.serialProbeOwner = 0;
    SocketDiagnosticSession.releaseOwner(this.diagnosticOwner); this.diagnosticOwner = 0;
    this.mediaSettingsRequest++;
    this.disconnectDeoVr();
    if (this.deoVrUnsubscribe !== null) { this.deoVrUnsubscribe(); this.deoVrUnsubscribe = null; }
    this.engine.detachMotionCanvas(this.motionCanvasOwner); this.motionCanvasOwner = 0; this.motionCanvasContext = '';
    this.cancelKeyboardWork(); KeyboardInputSession.releaseListener(this.keyboardOwner); this.keyboardOwner = 0; this.errors.cancel();
    this.cancelVideoChromeTimer(); this.videoFullscreen = false; NativeWindowPresentation.releaseOwner(this.presentationOwner); this.presentationOwner = 0;
    this.cancelRuntimeControl(); this.disconnectInternal(); this.cancelMediaSeek(); this.cancelLibrary(); this.viewActive = false; this.openVideoRequest++; this.pendingVideoUri = '';
    this.output.setForeground(false);
    this.video.dispose();
    if (this.timer >= 0) { clearInterval(this.timer); this.timer = -1; }
    this.engine.stop(); this.engine.flush();
  }
  foregroundChanged(): void {
    if (!this.foreground) { this.videoActionEpoch++; this.videoActionPending = false; this.videoDragging = false; this.cancelLibraryPlayback(); this.screenRevision++; KeyboardInputSession.setEditorFocus(this.librarySearchEditor, false); }
    this.closeConfirmation();
    this.settingsDraftOwner.setAvailable(this.foreground); this.settingsDraftEpoch++;
    if (!this.foreground) { this.serialDiscovery.cancel(); }
    if (!this.foreground) { this.mediaSettingsRequest++; this.disconnectDeoVr(); this.cancelKeyboardWork(); this.errors.cancel(); }
    this.updateKeyboardContext();
    NativeOutputSession.setForeground(this.foreground);
    this.engine.setForeground(this.foreground);
    if (!this.foreground) {
      this.setVideoFullscreen(false); this.cancelRuntimeControl(); this.disconnectInternal(); this.cancelMediaSeek();
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
  motionBindingKey(): string {
    if (!this.viewActive || !this.foreground || !this.showMotionSettings || this.settingsReadOnly || this.recoveryRequired ||
      this.engine.hasPendingProfileChanges() || this.axisNames[this.selectedAxis] === undefined) { return ''; }
    return this.engine.activeRegistry().revision + ':' + this.axisNames[this.selectedAxis] + ':' + this.motionEditorId;
  }
  motionCanvasHandler(axisName: string, providerId: string, profileRevision: number, key: string):
    (owner: number, width: number, height: number, attached: boolean) => void {
    return (owner: number, width: number, height: number, attached: boolean): void => {
      if (!attached) {
        this.engine.detachMotionCanvas(owner); if (this.motionCanvasOwner === owner) { this.motionCanvasOwner = 0; } return;
      }
      if (key.length === 0 || key !== this.motionBindingKey() || providerId !== 'Custom Curve' ||
        axisName !== this.axisNames[this.selectedAxis] || profileRevision !== this.engine.activeRegistry().revision) { return; }
      try {
        if (this.engine.attachMotionCanvas(owner, axisName, profileRevision, width, height)) {
          this.motionCanvasOwner = owner; this.motionCanvasContext = key; this.sync();
        }
      } catch (error) { this.status = '曲线绑定未应用：' + (error as Error).message; }
    };
  }
  motionSettingsHandler(axisName: string, providerId: string, profileRevision: number,
    previous: MotionProviderConfiguration): (configuration: MotionProviderConfiguration) => void {
    const expected = JSON.stringify(previous);
    return (configuration: MotionProviderConfiguration): void => {
      if (!this.viewActive || !this.foreground || !this.showMotionSettings || this.settingsReadOnly || this.recoveryRequired ||
        axisName !== this.axisNames[this.selectedAxis] || providerId !== this.motionEditorId || configuration.id !== providerId ||
        profileRevision !== this.engine.activeRegistry().revision || this.engine.hasPendingProfileChanges() ||
        JSON.stringify(this.engine.getMotionConfiguration(axisName, providerId)) !== expected) { return; }
      this.applyMotionSettings(configuration, axisName);
    };
  }
  motionResetHandler(axisName: string, profileRevision: number, previous: MotionProviderConfiguration): () => void {
    const expected: string = JSON.stringify(previous); const key: string = this.motionBindingKey();
    return (): void => {
      if (key.length === 0 || key !== this.motionBindingKey() || this.motionEditorId !== 'Custom Curve' ||
        axisName !== this.axisNames[this.selectedAxis] || profileRevision !== this.engine.activeRegistry().revision ||
        JSON.stringify(this.engine.getMotionConfiguration(axisName, 'Custom Curve')) !== expected) { return; }
      this.engine.resetCustomCurve(axisName); this.sync();
    };
  }
  syncPlaybackDisplay(playing: boolean, positionMs: number, durationMs: number): void {
    // Video UI follows the one native clock, not the output safety gate.
    const media = this.videoMode ? this.observedVideo : null;
    this.playing = media !== null ? media.playing : playing;
    this.positionMs = media !== null ? media.positionMs : positionMs;
    this.durationMs = media !== null ? media.durationMs : durationMs;
  }
  sync(): void {
    const state = this.engine.snapshot();
    this.syncPlaybackDisplay(state.state === 'playing', state.positionMs, state.durationMs);
    this.activeAxes = this.engine.activeRegistry().axes.slice();
    this.axisNames = this.activeAxes.map((axis) => axis.name);
    if (this.selectedAxis >= this.axisNames.length) { this.selectedAxis = 0; }
    this.axisValues = this.engine.previewSamples().map((sample) => sample.position);
    this.playbackSpeed = state.speed;
    this.deoVrStale = this.deoVrActive && !this.engine.deoVrReady();
    this.globalOffsetMs = state.globalOffsetMs;

    this.sessionFault = this.engine.fault();
    this.standaloneMotion = this.engine.isStandaloneMotionActive();
    this.manualPreview = this.engine.isManualPreviewActive();
    this.axisIndicators = this.engine.frame().axisStates.map(axis =>
      (axis.insideScript ? 'S' : '·') + ' ' + (Number.isFinite(axis.motionProviderValue) ? 'M' : '·') + ' ' +
      (axis.isAutoHoming ? 'H' : '·') + ' ' + (axis.isSmartLimited || axis.isSpeedLimited ? 'L' : '·'));
    this.settingsMessage = this.engine.settingsMessage();
    this.settingsReadOnly = this.engine.settingsStatus().readOnly;
    this.recoveryRequired = this.engine.settingsStatus().recoveryRequired;
    if (this.sessionFault.length > 0 || this.settingsReadOnly || this.recoveryRequired) { this.cancelKeyboardWork(); }
    const axisName = this.axisNames[this.selectedAxis] || 'L0';
    const canvasContext = this.motionBindingKey();
    if (canvasContext !== this.motionCanvasContext || canvasContext.length === 0) {
      this.engine.detachMotionCanvas(this.motionCanvasOwner); this.motionCanvasOwner = 0; this.motionCanvasContext = canvasContext;
    }
    if (this.settingsRevision !== this.engine.revision() || this.settingsAxis !== axisName || this.settingsProvider !== this.motionEditorId) {
      const configuration = this.engine.configurationSnapshot();
      this.profiles = configuration.devices; this.selectedProfileId = configuration.selectedDeviceId;
      this.syncConfiguration = configuration.sync; this.mediaSourceConfiguration = configuration.mediaSources;
      if (this.axisNames.length > 0) {
        this.selectedAxisDefinition = this.activeAxes[this.selectedAxis];
        this.selectedAxisConfiguration = this.engine.getAxisConfiguration(axisName);
        this.motionConfiguration = this.engine.getMotionConfiguration(axisName, this.motionEditorId);
      }
      this.settingsRevision = this.engine.revision(); this.settingsAxis = axisName; this.settingsProvider = this.motionEditorId;
    }
    this.axisOffsetMs = this.engine.getAxisOffset(axisName);
    if (this.axisNames.length > 0) {
      const settings = this.engine.getAxisScriptSettings(axisName);
      this.interpolationMode = settings.interpolationMode || 'pchip';
      this.axisInverted = settings.inverted; this.axisScale = settings.scale;
    }
    const scriptTime = this.engine.getScriptPosition(axisName);
    const chapter = activeChapter(this.engine.axisMetadata(axisName), scriptTime);
    this.chapterLabel = chapter === undefined ? 'No active chapter' : chapter.name;
    this.syncPlaylist();
    this.syncOutput();
    this.drawTrace();
    this.syncErrorPresentation();
  }
  private continuousOwnerKey(): string {
    return this.keyboardOwner + ':' + this.engine.activeRegistry().revision + ':' + this.continuousMappingId + ':' + this.continuousControlRevision;
  }
  private continuousTargetStamp(): string {
    const mapping = this.continuousConfiguration.mappings.find(item => item.id === this.continuousMappingId);
    if (mapping === undefined) { return ''; }
    return JSON.stringify(mapping.actions.filter(action => action.outputTargetId.length > 0).map(action => {
      const draft = NativeOutputSession.draftSnapshot(action.outputTargetId);
      const summary = NativeOutputSession.summaries().find(item => item.id === action.outputTargetId);
      return [action.outputTargetId, draft, summary === undefined ? null : [summary.connection, summary.removing]];
    }));
  }
  private updateContinuousContext(): void {
    const context = new ContinuousInputContext(); const registry = this.engine.activeRegistry();
    context.foreground = this.foreground; context.focused = this.viewActive && KeyboardInputSession.ownsListener(this.keyboardOwner) && KeyboardInputSession.isWindowFocused();
    context.textInput = KeyboardInputSession.isEditing(); context.ime = context.textInput;
    context.modal = this.confirmationCloseUnconfirmed || this.errorNoticeMode === 'dialog' || (this.confirmationOwner !== null && this.confirmationOwner.hasPending());
    context.readOnly = this.settingsReadOnly || this.recoveryRequired || this.runtimeBusy || this.engine.fault().length > 0 || this.engine.hasPendingProfileChanges();
    context.surfaceVisible = this.workspaceTool === 'settings' && this.showInputSettings && this.showContinuousInput;
    context.ownerId = this.keyboardOwner; context.profileRevision = registry.revision; context.controlRevision = this.continuousControlRevision;
    context.enabledAxes = registry.axes.map(axis => axis.name);
    context.outputTargets = NativeOutputSession.summaries().filter(target => !target.removing && target.kind !== 'serial')
      .map(target => new ContinuousOutputIdentity(target.id, target.generation));
    const token = this.continuous.cancellationToken(); this.continuous.setContext(context);
    if (token !== this.continuous.cancellationToken() || (this.continuous.isReceiving() && this.continuousExpectedTargets !== this.continuousTargetStamp())) {
      this.cancelContinuousInput('上下文或输出目标已变化，请重新接收');
    }
    this.syncContinuousState();
  }
  private syncContinuousState(): void {
    this.continuousReceiving = this.continuous.isReceiving() && this.continuousPointer.isReceiving();
    this.continuousContact = this.continuous.isContactActive() && this.continuousPointer.isContactActive();
  }
  private clearContinuousTimer(): void { if (this.continuousTimer !== -1) { clearTimeout(this.continuousTimer); this.continuousTimer = -1; } }
  private cancelContinuousInput(reason: string): void {
    const hadWork = this.continuous.isReceiving() || this.continuousPointer.isReceiving() || this.continuousCapture !== null || this.continuousTimer !== -1;
    this.clearContinuousTimer(); this.continuous.cancel(reason); this.continuousPointer.cancel(reason);
    this.continuousCapture = null; this.continuousContactSerial = -1;
    if (hadWork) { this.continuousReceptionRevision++; this.continuousStatus = reason + '；尚未接收'; }
    this.syncContinuousState();
  }
  private toggleContinuousInput(): void {
    this.cancelContinuousInput('已折叠或重新打开'); this.showContinuousInput = !this.showContinuousInput; this.updateContinuousContext();
  }
  private applyContinuousConfiguration(configuration: ContinuousInputConfiguration): void {
    if (!this.viewActive || !this.foreground || this.settingsReadOnly || this.recoveryRequired) { return; }
    this.cancelContinuousInput('映射已修改'); this.continuousControlRevision++;
    try {
      this.engine.changeContinuousInputConfiguration(configuration);
      this.continuousConfiguration = this.engine.continuousInputConfiguration();
      this.continuous.setConfiguration(this.continuousConfiguration);
      if (!this.continuousConfiguration.mappings.some(mapping => mapping.id === this.continuousMappingId)) { this.continuousMappingId = ''; }
      this.continuousStatus = '配置已保存；需显式接收，设备仍需独立 Arm';
    } catch (error) { this.continuousStatus = '未保存：' + (error as Error).message; }
    this.updateContinuousContext();
  }
  private selectContinuousMapping(id: string): void {
    if (!this.continuousConfiguration.mappings.some(mapping => mapping.id === id)) { return; }
    this.cancelContinuousInput('已切换映射'); this.continuousMappingId = id; this.continuousControlRevision++; this.updateContinuousContext();
  }
  private enableContinuousInput(id: string): void {
    if (id !== this.continuousMappingId || this.settingsDraftOwner.hasPending(this.settingsScope('continuous'))) { this.continuousStatus = '请先确认或取消此区未应用的编辑'; return; }
    this.cancelContinuousInput('重新接收'); this.updateContinuousContext();
    const mapping = this.continuousConfiguration.mappings.find(item => item.id === id);
    const now = this.inputNow();
    if (mapping === undefined || !this.continuous.enableReception(this.keyboardOwner, id)) { this.continuousStatus = '当前焦点、设置、目标或映射不可接收'; return; }
    this.continuousReceptionRevision++;
    if (!this.continuousPointer.enable(this.continuousOwnerKey(), this.continuousReceptionRevision, mapping, this.inputNowNs())) {
      this.cancelContinuousInput('输入区尚未取得有效尺寸'); return;
    }
    this.continuousExpectedTargets = this.continuousTargetStamp();
    this.continuousStatus = '正在接收局部输入；配置与接收均不会连接或 Arm'; this.syncContinuousState();
  }
  private continuousScopeCurrent(ownerKey: string, revision: number): boolean {
    return this.viewActive && this.foreground && KeyboardInputSession.ownsListener(this.keyboardOwner) &&
      ownerKey === this.continuousOwnerKey() && revision === this.continuousReceptionRevision;
  }
  private continuousSurfaceChanged(geometry: LocalSurfaceGeometry, ownerKey: string, revision: number): void {
    if (!this.continuousScopeCurrent(ownerKey, revision)) { return; }
    if (this.continuousPointer.setGeometry(geometry)) { this.cancelContinuousInput('输入区尺寸或位置变化'); }
  }
  private continuousCancelHandler(reason: string, ownerKey: string, revision: number): void {
    if (this.continuousScopeCurrent(ownerKey, revision)) { this.cancelContinuousInput(reason); }
  }
  private localContinuousTouch(packet: LocalTouchPacket): boolean {
    if (!this.continuousScopeCurrent(packet.ownerKey, packet.receptionRevision)) { return false; }
    this.updateContinuousContext(); return this.acceptContinuousPointer(this.continuousPointer.touch(packet, this.inputNowNs()));
  }
  private localContinuousMouse(packet: LocalMousePacket): boolean {
    if (!this.continuousScopeCurrent(packet.ownerKey, packet.receptionRevision)) { return false; }
    this.updateContinuousContext(); return this.acceptContinuousPointer(this.continuousPointer.mouse(packet, this.inputNowNs()));
  }
  private localContinuousWheel(packet: LocalWheelPacket): boolean {
    if (!this.continuousScopeCurrent(packet.ownerKey, packet.receptionRevision)) { return false; }
    this.updateContinuousContext(); return this.acceptContinuousPointer(this.continuousPointer.wheel(packet, this.inputNowNs()));
  }
  private acceptContinuousPointer(result: LocalPointerResult): boolean {
    if (result.receptionCancelled) { this.cancelContinuousInput(result.reason); return result.handled; }
    if (result.contactEnded) {
      if (this.continuousCapture !== null) { this.continuous.releaseCapture(this.continuousCapture); }
      this.continuousCapture = null; this.continuousContactSerial = -1; this.clearContinuousTimer(); this.syncContinuousState(); return result.handled;
    }
    const gesture = result.gesture;
    if (!result.handled || gesture === null || !this.continuous.isReceiving()) { return false; }
    const now = this.inputNow();
    // An in-flight wheel dispatch is dropped per the original busy rule;
    // it does not fabricate a new hold or retire otherwise valid reception.
    if (gesture.source === 'wheel' && this.continuousCapture !== null) { return true; }
    if (this.continuousCapture === null) {
      this.continuousCapture = this.continuous.beginCapture(gesture.pointerId, gesture.source, this.keyboardOwner, now, gesture.contactActive);
      this.continuousContactSerial = result.contactSerial;
    }
    if (this.continuousCapture === null || result.contactSerial !== this.continuousContactSerial) { this.cancelContinuousInput('输入所有权不明确'); return false; }
    const capture = this.continuousCapture;
    const dispatches = this.continuous.gesture(capture, gesture, now);
    this.continuousLatestValue = gesture.value; this.continuousLatestDelta = gesture.delta;
    if (gesture.source === 'wheel') {
      // Immediate wheel data has no periodic hold. Release only after its one
      // ordered dispatch settles; an earlier cancelled capture cannot revive it.
      const work = Promise.all(dispatches.map(dispatch => this.enqueueContinuousDispatch(dispatch)));
      work.finally((): void => { if (this.continuousCapture === capture) { this.continuous.releaseCapture(capture); this.continuousCapture = null; this.continuousContactSerial = -1; this.syncContinuousState(); } });
    } else { for (const dispatch of dispatches) { this.enqueueContinuousDispatch(dispatch); } }
    this.scheduleContinuousTick(); this.syncContinuousState(); return true;
  }
  private scheduleContinuousTick(): void {
    this.clearContinuousTimer(); const deadline = this.continuous.nextDeadlineMs();
    if (deadline === null) { return; }
    const token = this.continuous.cancellationToken(); const owner = this.keyboardOwner;
    this.continuousTimer = setTimeout((): void => {
      this.continuousTimer = -1;
      if (token !== this.continuous.cancellationToken() || owner !== this.keyboardOwner || !KeyboardInputSession.ownsListener(owner)) { return; }
      this.updateContinuousContext();
      for (const dispatch of this.continuous.advance(this.inputNow(), token)) { this.enqueueContinuousDispatch(dispatch); }
      this.scheduleContinuousTick();
    }, Math.max(0, deadline - this.inputNow()));
  }
  private async enqueueContinuousDispatch(dispatch: ContinuousDispatch): Promise<void> {
    const work = this.shortcutQueue.then(async (): Promise<void> => {
      try {
        for (const action of dispatch.actions) {
          this.updateContinuousContext();
          if (!this.continuous.isDispatchCurrent(dispatch)) { return; }
          this.continuousLastAction = this.executeContinuousAction(action, dispatch.data, dispatch);
          this.sync();
        }
      } catch (error) { this.continuousStatus = '未执行：' + (error as Error).message; this.cancelContinuousInput('动作失效或失败'); }
      finally { this.continuous.completeDispatch(dispatch); }
    });
    this.shortcutQueue = work.catch((): void => {}); await work;
  }
  private executeContinuousAction(action: ContinuousInputAction, data: ContinuousGestureData, dispatch: ContinuousDispatch): string {
    if (!this.continuous.isDispatchCurrent(dispatch) || this.confirmationCloseUnconfirmed || this.settingsReadOnly || this.recoveryRequired ||
      this.runtimeBusy || !this.viewActive || !this.foreground || dispatch.context.profileRevision !== this.engine.activeRegistry().revision) { throw new Error('连续动作上下文已撤销'); }
    if (!action.id.startsWith('OutputTarget::')) { this.engine.applyContinuousAxisAction(action, data); return action.id + ' · ' + action.targetAxis; }
    const identity = dispatch.context.outputTargets.find(target => target.id === action.outputTargetId);
    if (identity === undefined || !NativeOutputSession.matchesTarget(identity.id, identity.generation) || this.output.isRemoving(identity.id)) { throw new Error('原输出目标已失效'); }
    const draft = NativeOutputSession.draftSnapshot(identity.id);
    const range = draft.model.ranges.find(item => item.axisId === action.targetAxis);
    if (range === undefined) { throw new Error('输出目标不存在该轴'); }
    const result = applyContinuousRange(range, action, data);
    if (result === null) { throw new Error('原范围 Drive 结果无效；未修改配置'); }
    if (result.changed) {
      draft.model.ranges = draft.model.ranges.map(item => item.axisId === action.targetAxis ? result.range : item); draft.editRevision++;
      if (!NativeOutputSession.updateRanges(draft)) { throw new Error('目标草稿或连接已变化，范围未应用'); }
      // A legitimate current Drive commit advances only its own expected source.
      // External edits/disconnect/replacement still retire reception immediately.
      this.continuousExpectedTargets = this.continuousTargetStamp(); this.persistOutputPreferences(); this.syncOutput();
      if (this.outputSaveDiagnostic.length > 0) { throw new Error(this.outputSaveDiagnostic); }
    }
    return identity.id + ' · ' + action.targetAxis + '：' + result.range.minimum + ' → ' + result.range.maximum + (range.enabled ? '' : '（此轴输出仍禁用）');
  }

  private inputNowNs(): number { return systemDateTime.getUptime(systemDateTime.TimeType.STARTUP, true); }
  private inputNow(): number {
    return systemDateTime.getUptime(systemDateTime.TimeType.STARTUP, false);
  }
  updateKeyboardContext(): void {
    if (!KeyboardInputSession.isWindowFocused() && this.libraryOpeningRevision >= 0) { this.screenRevision++; this.cancelLibraryPlayback(); }
    const token = this.keyboard.cancellationToken();
    this.inputFocusMessage = KeyboardInputSession.windowFocusMessage();
    this.keyboard.setContext({ foreground: this.foreground, focused: this.viewActive && KeyboardInputSession.isWindowFocused(),
      textInput: KeyboardInputSession.isEditing(), ime: KeyboardInputSession.isEditing(),
      capturing: this.confirmationCloseUnconfirmed || this.showInputSettings || this.keyboardCaptureId.length > 0 || this.errorNoticeMode === 'dialog' || (this.confirmationOwner !== null && this.confirmationOwner.hasPending()) });
    if (token !== this.keyboard.cancellationToken()) { this.retireShortcutWorker(); }
    this.updateContinuousContext();
  }
  retireShortcutWorker(preserveValid: boolean = false): ShortcutDispatch[] {
    this.cancelManagedReload();
    // Same-token abandonment retires only the invalid active owner: preserve
    // other valid queued mappings in FIFO order. Global cancellation discards all.
    const retained: ShortcutDispatch[] = preserveValid ? this.pendingShortcutDispatches.filter(value => this.keyboard.isDispatchCurrent(value)) : [];
    for (const pending of this.pendingShortcutDispatches) {
      if (retained.indexOf(pending) < 0) { this.keyboard.completeDispatch(pending); }
    }
    for (const entry of this.shortcutConnections.entries()) {
      if (retained.indexOf(entry[0]) < 0) { entry[1].coordinator.cancelOwnedConnection(entry[1].requestId); this.shortcutConnections.delete(entry[0]); }
    }
    for (const dispatch of this.shortcutAxes.keys()) {
      if (retained.indexOf(dispatch) < 0) { this.shortcutAxes.delete(dispatch); this.shortcutProfiles.delete(dispatch); this.shortcutOutputOwners.delete(dispatch); }
    }
    this.pendingShortcutDispatches = []; this.shortcutWorkerRevision++;
    this.shortcutQueue = Promise.resolve(); this.activeShortcutDispatch = null;
    return retained;
  }
  cancelKeyboardWork(): void {
    this.cancelContinuousInput('输入已取消');
    this.keyboard.reset('lifecycle'); this.retireShortcutWorker(); this.keyboardCaptureRevision++; this.keyboardCaptureId = ''; this.keyboardCaptureKeys = [];
  }
  keyboardPreImeHandler(): (event: KeyEvent) => boolean {
    const owner = this.keyboardOwner;
    return (event: KeyEvent): boolean => {
      if (!this.viewActive || !KeyboardInputSession.ownsListener(owner)) { return false; }
      if (event.type !== KeyType.Down && event.type !== KeyType.Up) { this.cancelKeyboardWork(); return false; }
      return event.keyCode === EMERGENCY_STOP_KEY && this.handleKeyboardKey(event.keyCode, event.type === KeyType.Down);
    };
  }
  keyboardDispatchHandler(): (event: KeyEvent) => boolean {
    const owner = this.keyboardOwner;
    return (event: KeyEvent): boolean => {
      if (!this.viewActive || !KeyboardInputSession.ownsListener(owner)) { return false; }
      if (event.type !== KeyType.Down && event.type !== KeyType.Up) { this.cancelKeyboardWork(); return false; }
      if (this.handleKeyboardKey(event.keyCode, event.type === KeyType.Down)) { return true; }
      return KeyboardInputSession.isWindowFocused() && event.type === KeyType.Down && !KeyboardInputSession.isEditing() && this.exitFullscreenWithKey(event.keyCode);
    };
  }
  handleKeyboardKey(keyCode: number, pressed: boolean): boolean {
    this.updateKeyboardContext();
    const now = this.inputNow();
    if (keyCode === EMERGENCY_STOP_KEY) {
      const stop = this.keyboard.keyEvent(new ShortcutKeyEvent(keyCode, pressed), now);
      const handled = this.keyboard.lastEventHandled();
      for (const dispatch of stop) { this.runShortcutDispatch(dispatch); }
      return handled;
    }
    if (!this.foreground || !this.viewActive || !KeyboardInputSession.isWindowFocused()) {
      this.keyboard.keyEvent(new ShortcutKeyEvent(keyCode, pressed), now); return false;
    }
    if (this.errorNoticeMode === 'dialog') {
      this.keyboard.keyEvent(new ShortcutKeyEvent(keyCode, pressed), now);
      // The overlay owns keyboard activation; never activate a previously focused background control.
      if (pressed && (keyCode === 2054 || keyCode === 2070)) { this.dismissErrorNotice(this.errorNoticeId); }
      return true;
    }
    if (this.keyboardCaptureId.length > 0) {
      // Capture is an explicit transient editor operation, never text logging.
      if (pressed && isShortcutKey(keyCode) && this.keyboardCaptureKeys.indexOf(keyCode) < 0 &&
        this.keyboardCaptureKeys.length < KeyboardShortcutConfiguration.MAX_KEYS) {
        this.keyboardCaptureKeys = this.keyboardCaptureKeys.concat([keyCode]).sort((left, right) => left - right);
      }
      this.keyboard.keyEvent(new ShortcutKeyEvent(keyCode, pressed), now);
      return true;
    }
    const dispatches = this.keyboard.keyEvent(new ShortcutKeyEvent(keyCode, pressed), now);
    const handled = this.keyboard.lastEventHandled();
    for (const dispatch of dispatches) { this.runShortcutDispatch(dispatch); }
    return handled;
  }
  captureKeyboard(mappingId: string): void {
    if (this.settingsReadOnly || this.recoveryRequired || !this.foreground || !this.viewActive ||
      !this.keyboardConfiguration.mappings.some(mapping => mapping.id === mappingId)) { return; }
    this.keyboard.reset('capture'); this.keyboardCaptureRevision++; this.keyboardCaptureId = mappingId; this.keyboardCaptureKeys = [];
    this.updateKeyboardContext();
    try { this.getUIContext().getFocusController().clearFocus(); } catch { /* Capture also has catalog-based touch selection. */ }
  }
  cancelKeyboardCapture(expectedRevision?: number): void { if (expectedRevision !== undefined && expectedRevision !== this.keyboardCaptureRevision) { return; } this.cancelKeyboardWork(); this.updateKeyboardContext(); }
  toggleInputSettings(): void {
    this.cancelKeyboardWork(); this.showInputSettings = !this.showInputSettings; this.updateKeyboardContext();
  }
  applyKeyboardSettings(configuration: KeyboardShortcutConfiguration, expectedCaptureRevision?: number): void {
    if (expectedCaptureRevision !== undefined && expectedCaptureRevision !== this.keyboardCaptureRevision) { return; }
    this.cancelKeyboardWork();
    if (this.settingsReadOnly || this.recoveryRequired || !this.foreground || !this.viewActive) { return; }
    try { this.engine.changeKeyboardConfiguration(configuration); this.keyboardConfiguration = this.engine.keyboardConfiguration();
      this.keyboard.setConfiguration(this.keyboardConfiguration); this.inputMessage = '键盘映射已更新；旧按键和待触发动作已取消。'; }
    catch { this.inputMessage = '键盘映射无效或设置不可写；未应用。'; }
    this.updateKeyboardContext();
  }
  applyGeneralSettings(configuration: GeneralConfiguration): void {
    this.cancelKeyboardWork();
    if (this.settingsReadOnly || this.recoveryRequired || !this.foreground || !this.viewActive) { return; }
    try { this.engine.changeGeneralConfiguration(configuration); this.generalConfiguration = this.engine.generalConfiguration(); this.syncSettingsDraftContext(); this.syncErrorPresentation(); }
    catch { this.inputMessage = '通用设置无效或不可写；未应用。'; }
  }
  async touchShortcut(action: ShortcutAction): Promise<void> {
    if (action.id === 'App::Stop') { this.stop(); return; }
    if (!this.foreground || !this.viewActive) { return; }
    if (this.settingsReadOnly || this.recoveryRequired) { this.inputMessage = '未执行：设置只读或等待明确恢复。'; return; }
    this.cancelKeyboardCapture(); this.updateKeyboardContext();
    try {
      const dispatches = this.keyboard.dispatchAction(action);
      if (dispatches.length === 0) { this.inputMessage = '未执行：动作参数无效或界面不可用。'; return; }
      for (const dispatch of dispatches) { await this.runShortcutDispatch(dispatch); }
    }
    catch { this.inputMessage = '动作无效；未执行。'; }
  }
  async runShortcutDispatch(dispatch: ShortcutDispatch): Promise<void> {
    // Engine cancellations can also happen inside keyEvent/advance (bad clocks,
    // unsupported physical keys). Reconcile every accepted invocation, not only focus changes.
    if (!this.keyboard.isDispatchCurrent(dispatch)) { this.keyboard.completeDispatch(dispatch); return; }
    if (this.shortcutQueueToken !== dispatch.token ||
      (this.activeShortcutDispatch !== null && !this.keyboard.isDispatchCurrent(this.activeShortcutDispatch))) {
      const retained = this.retireShortcutWorker(this.shortcutQueueToken === dispatch.token);
      this.shortcutQueueToken = dispatch.token;
      for (const pending of retained) { this.enqueueShortcutDispatch(pending); }
    }
    if (!this.shortcutAxes.has(dispatch)) {
      this.shortcutAxes.set(dispatch, this.axisNames[this.selectedAxis] || '');
      this.shortcutProfiles.set(dispatch, this.engine.activeRegistry().revision);
      const owners = new Map<string, number>();
      for (const action of dispatch.actions) {
        if (action.outputTargetId.length > 0) { owners.set(action.outputTargetId, NativeOutputSession.draftSnapshot(action.outputTargetId).targetGeneration); }
      }
      this.shortcutOutputOwners.set(dispatch, owners);
    }
    // One original-style ordered worker; emergency Stop bypasses every outstanding await.
    if (dispatch.emergency) { await this.performShortcutDispatch(dispatch); return; }
    await this.enqueueShortcutDispatch(dispatch);
  }
  private async enqueueShortcutDispatch(dispatch: ShortcutDispatch): Promise<void> {
    const workerRevision = this.shortcutWorkerRevision;
    this.pendingShortcutDispatches.push(dispatch);
    const work = this.shortcutQueue.then(async (): Promise<void> => {
      if (workerRevision !== this.shortcutWorkerRevision) { return; }
      this.pendingShortcutDispatches = this.pendingShortcutDispatches.filter(value => value !== dispatch);
      await this.performShortcutDispatch(dispatch);
    });
    this.shortcutQueue = work.catch((): void => {}); await work;
  }
  private async performShortcutDispatch(dispatch: ShortcutDispatch): Promise<void> {
    const axis = this.shortcutAxes.get(dispatch) || '';
    if (!dispatch.emergency) { this.activeShortcutDispatch = dispatch; }
    try {
      for (const action of dispatch.actions) {
        if (!this.keyboard.isDispatchCurrent(dispatch) || !this.foreground || !this.viewActive) { return; }
        if (action.id !== 'App::Stop' && (this.settingsReadOnly || this.recoveryRequired || this.runtimeBusy)) {
          this.inputMessage = '未执行：设置只读、等待恢复或运行控制忙。'; return;
        }
        if (action.id !== 'App::Stop' && this.shortcutProfiles.get(dispatch) !== this.engine.activeRegistry().revision) {
          this.inputMessage = '未执行：动作所属设备配置已失效，请重新触发。'; return;
        }
        const result = await this.executeShortcutAction(action, axis, dispatch);
        if (this.keyboard.isDispatchCurrent(dispatch) && result !== undefined) { this.inputMessage = result; }
      }
    } catch (error) { if (this.keyboard.isDispatchCurrent(dispatch)) { this.inputMessage = '未执行：' + (error as Error).message; } }
    finally {
      if (this.activeShortcutDispatch === dispatch) { this.activeShortcutDispatch = null; }
      this.shortcutAxes.delete(dispatch); this.shortcutProfiles.delete(dispatch); this.shortcutOutputOwners.delete(dispatch);
      this.keyboard.completeDispatch(dispatch);
    }
  }
  async executeShortcutAction(rawAction: ShortcutAction, selectedAxis: string, dispatch: ShortcutDispatch | null = null): Promise<string> {
    if (this.confirmationCloseUnconfirmed) { throw new Error('对话框关闭未确认；输入与启动保持禁用，请重启应用。'); }
    const action = cloneShortcutAction(rawAction);
    const spec = shortcutActionCatalog().find(item => item.id === action.id)!;
    const registry = this.engine.activeRegistry();
    const axis = action.targetAxis.length > 0 ? action.targetAxis : selectedAxis;
    const names = registry.axes.map(item => item.name);
    if (spec.targetAxis && names.indexOf(axis) < 0) {
      throw new Error('目标轴 ' + (axis || '（未选择）') + ' 不存在或已禁用；没有替代为当前轴。');
    }
    const label = spec.label + (spec.targetAxis ? ' · ' + axis : '');
    const context = this.playlistContext();
    const mediaAction = action.id.startsWith('Media::Position::') || action.id.startsWith('Media::Loop::') ||
      action.id.startsWith('Media::Chapter::') || action.id.startsWith('Media::Bookmark::');
    const sourceAction = parseMediaSourceShortcut(action);
    if (sourceAction !== null && sourceAction.kind === 'endpoint') {
      const configuration = this.engine.mediaSourceConfiguration();
      const endpoint = sourceAction.endpoint!;
      const target = sourceAction.source === 'heresphere' ? configuration.hereSphere : configuration.deoVr;
      target.host = endpoint.host; target.port = endpoint.port;
      if (!await this.applyMediaSourceSettings(configuration)) { throw new Error(this.deoVrError || '当前状态未保存远端端点。'); }
      return label + '：已保存指定来源端点，需显式连接；未自动 Arm';
    }
    if (sourceAction !== null && sourceAction.kind === 'connection') {
      if (context.busy) { throw new Error('媒体源正在切换，请稍后重试。'); }
      const remote = sourceAction.source !== 'internal';
      const kind: RemoteSourceKind = sourceAction.source === 'heresphere' ? 'heresphere' : 'deovr';
      const connected = remote ? this.remoteKind === kind && this.deoVrConnected : this.internalConnected;
      const disconnect = sourceAction.command === 'disconnect' || (sourceAction.command === 'toggle' && connected);
      if (disconnect) {
        if (remote) { if (this.remoteKind === kind && !await this.disconnectDeoVr()) { throw new Error(this.deoVrError); } }
        else { this.disconnectInternal(); }
      } else if (!connected) { if (remote) { await this.connectDeoVr(kind); } else { await this.connectInternal(); } }
      this.sync(); return label + '：' + ((remote ? this.remoteKind === kind && this.deoVrConnected : this.internalConnected) ? '媒体源已连接，输出未自动 Arm' : '媒体源未连接');
    }
    if (action.id === 'Media::Path::Set') {
      if (!this.deoVrActive || !this.deoVrConnected || context.busy || action.text.length === 0) { throw new Error('此路径命令仅用于已连接的远程媒体源；不会打开任意本地文件。'); }
      const owner = this.deoVrRequest; this.output.stop(); this.engine.beginDeoVrSeek(); this.syncOutput();
      await this.remoteSource().changePath(action.text);
      if (owner !== this.deoVrRequest || !this.deoVrActive) { throw new Error('远端路径请求已取消。'); }
      return label + '：已本地提交，等待远端媒体状态；仅匹配已授权 Download，设备需重新 Arm';
    }
    if (action.id === 'Script::SkipGap') {
      if (context.busy || !(context.connected || context.mediaConnected || this.engine.mediaDurationSeconds() > 0)) { throw new Error('媒体源未就绪或正在加载。'); }
      const position = this.engine.skipGapPosition([axis], action.value);
      if (position === null) { return label + '：原规则没有可跳转候选（按全部绑定轴取最早候选，过期或距离不足会阻止跳转）'; }
      this.seekTransport(position * 1000, true); this.sync();
      return label + '：全部绑定轴的原始脚本时间 ' + position + ' 秒；目标轴参数不筛选原算法';
    }
    if (action.id === 'MotionProvider::Looping Script::Script::Set') {
      return label + '：' + await this.reloadManagedLoopingScript(axis, action.text, dispatch);
    }
    if (spec.targetOutput && !spec.targetAxis) { return label + '：' + await this.executeOutputConnectionAction(action, dispatch); }
    if (spec.targetOutput) {
      if (this.settingsReadOnly || this.recoveryRequired || !this.viewActive || !this.foreground || this.engine.hasPendingProfileChanges()) {
        throw new Error('当前设备或设置状态不允许修改输出范围。');
      }
      const id = action.outputTargetId; const draft = NativeOutputSession.draftSnapshot(id);
      const owner = dispatch === null ? draft.targetGeneration : this.shortcutOutputOwners.get(dispatch)?.get(id);
      if (id.length === 0 || owner === undefined || !NativeOutputSession.matchesTarget(id, owner) || this.output.isRemoving(id)) {
        throw new Error('输出目标未选择或原实例已失效；没有替代为当前输出目标。');
      }
      const range = draft.model.ranges.find(item => item.axisId === axis);
      if (range === undefined) { throw new Error('该输出目标没有此轴配置。'); }
      const operation = action.id.slice('OutputTarget::Axis::Range::'.length) as OutputRangeOperation;
      const offset = operation.endsWith('::Offset');
      const result = applyOutputRangeAction(range, { operation, value: action.value,
        minimumLimit: offset && !operation.startsWith('Maximum::') ? action.secondaryValue : 0,
        maximumLimit: offset ? (operation.startsWith('Maximum::') ? action.secondaryValue :
          operation.startsWith('Minimum::') ? 1 : action.tertiaryValue) : 1 });
      if (result === null) { throw new Error('原范围变换产生非有限或越过 0–1 的结果；未修改配置。'); }
      if (!result.changed) { return label + ' · ' + id + '：范围未改变' + (range.enabled ? '' : '，此轴输出仍禁用'); }
      draft.model.ranges = draft.model.ranges.map(item => item.axisId === axis ? result.range : item); draft.editRevision++;
      if (!NativeOutputSession.updateRanges(draft)) { throw new Error('范围未应用：目标草稿/连接已变化；先应用当前草稿后重新触发。'); }
      this.persistOutputPreferences(); this.syncOutput();
      if (this.outputSaveDiagnostic.length > 0) { throw new Error(this.outputSaveDiagnostic); }
      return label + ' · ' + id + '：输入 0 → ' + result.range.minimum + '，输入 1 → ' + result.range.maximum +
        (result.range.minimum > result.range.maximum ? '（反向）' : '') + (range.enabled ? '；等待下一真实来源帧，未自动 Arm' : '；该轴仍禁用');
    }
    if (action.id === 'MotionProvider::Custom Curve::Points::Set') {
      const argumentsValue = customCurvePointArguments(action);
      if (argumentsValue === null) { throw new Error('Custom Curve 点参数无效。'); }
      try { this.engine.setCustomCurvePoints(axis, argumentsValue.durationSeconds, argumentsValue.interpolationMode, argumentsValue.points); }
      finally { this.sync(); }
      return label + '：已按 Duration → Interpolation → Points Reset 应用；不重置相位';
    }
    if (action.id === 'Axis::SmartLimitPoints::Set') {
      const settings = applyShortcutPointAction(action, this.engine.getAxisConfiguration(axis));
      if (settings === null) { throw new Error('智能限幅点必须在 0–100 范围内，x 严格递增。'); }
      this.engine.changeAxisConfiguration(axis, settings); this.sync(); return label + '：已更新限幅点，不请求通用同步';
    }
    if (action.id === 'Axis::Value::Set' || action.id === 'Axis::Value::Offset') {
      this.engine.setAxisValue(axis, action.value, action.secondaryValue, action.id.endsWith('::Offset')); this.sync();
      return label + '：过渡已设置；优先级/旁路仍有效。' + (this.engine.isManualPreviewActive() ? '预览已明确启动，设备仍需独立权限和 Arm。' : '动作本身不会启动预览或启用设备。');
    }
    if (mediaAction) {
      if (context.busy || !(context.connected || context.mediaConnected || this.engine.mediaDurationSeconds() > 0)) {
        throw new Error('媒体源未就绪或正在加载。');
      }
      const result = applyMediaShortcut(action, context.positionSeconds, context.durationSeconds, this.engine.bindings(), this.engine.mediaLoop);
      if (result === null) { throw new Error('没有可用的媒体动作。'); }
      if (result.seekSeconds !== null) { this.seekTransport(result.seekSeconds * 1000, true); }
      this.sync(); return label + '：' + result.message;
    }
    if (action.id.startsWith('Sync::')) {
      const settings = applySyncShortcutAction(this.engine.configurationSnapshot().sync, action);
      if (settings === null) { throw new Error('同步设置参数无效。'); }
      this.engine.changeSync(settings); this.sync(); return label + '：' + (spec.valueKind === 'boolean' ? (action.value === 1 ? '开启' : '关闭') : action.value.toString());
    }
    if (action.id.startsWith('MotionProvider::')) {
      if (this.engine.hasPendingProfileChanges()) { throw new Error('待生效设备配置已更改，请重启后再修改Motion。'); }
      const providerId = motionShortcutProviderId(action.id);
      if (providerId === null) { throw new Error('Motion动作或provider不可用。'); }
      const result = applyMotionShortcutAction(this.engine.getMotionConfiguration(axis, providerId), action, axis, names);
      if (result === null) { throw new Error('Motion参数无效、溢出或目标轴不可用。'); }
      try {
        if (result.resetCustomCurve) { this.engine.resetCustomCurve(axis, result.resetSync); }
        else if (result.configurationChanged) { this.engine.changeMotionConfiguration(axis, result.settings); }
      } finally { this.sync(); }
      return label + '：' + result.summary;
    }
    if (action.id.startsWith('Shortcut::Enabled::')) {
      const configuration = this.engine.keyboardConfiguration();
      // Original FirstOrDefault + Ordinal: exact case and first duplicate name.
      // The text is a lookup key, never an action ID or callback to execute.
      const target = configuration.mappings.find(mapping => mapping.name === action.text);
      if (target === undefined) { throw new Error('没有完全同名的快捷键映射；未替代其他映射。'); }
      if (!this.keyboard.configurationSnapshot().mappings.some(mapping => mapping.id === target.id)) {
        throw new Error('快捷键运行配置已失效，请重新触发。');
      }
      const enabled = action.id.endsWith('::Toggle') ? !target.enabled : action.value === 1;
      target.enabled = enabled;
      this.engine.changeKeyboardConfiguration(configuration);
      this.keyboard.setMappingEnabled(target.id, enabled);
      this.keyboardConfiguration = this.engine.keyboardConfiguration();
      return label + '：' + (target.name || '（未命名）') + ' → ' + (enabled ? '启用' : '禁用') + '；当前动作组和已排队触发不撤销，立即取消请停止';
    }
    if (action.id.startsWith('Axis::')) {
      if (this.engine.hasPendingProfileChanges()) { throw new Error('待生效设备配置已更改，请重启后再修改轴。'); }
      if (action.id === 'Axis::Sync' || action.id === 'Axis::Sync::Cancel' || action.id === 'Axis::SyncAll' || action.id === 'Axis::SyncAll::Cancel') {
        const all = action.id.startsWith('Axis::SyncAll'); const enabled = !action.id.endsWith('::Cancel');
        if (!this.engine.resetSync(all ? undefined : axis, enabled)) { throw new Error('运行状态不可同步。'); }
        this.syncOutput(); return label + '：' + (all ? names.join(', ') : axis);
      }
      if (action.id === 'Axis::ClearScript') {
        const changed = this.engine.clearAxisScript(axis); this.sync();
        return label + (changed ? '：已清除，媒体继续运行' : '：未改变（已有资源受锁保护，或本来为空）');
      }
      if (action.id === 'Axis::ReloadScript') {
        return label + '：' + await this.reloadManagedAxisScripts([axis], dispatch);
      }
      const affected = action.id.startsWith('Axis::LockAll') ? names : [axis];
      const entries: AxisConfigurationEntry[] = [];
      const reset: string[] = []; const reload: string[] = []; const details: string[] = [];
      for (const name of affected) {
        const before = this.engine.getAxisConfiguration(name);
        const result = applyAxisShortcutAction(before, action, name, names);
        if (result === null) { throw new Error('动作参数、引用轴或目标轴无效。'); }
        entries.push(new AxisConfigurationEntry(name, result.settings));
        if (result.resetSync) { reset.push(name); }
        if (result.reloadScript || before.linkAxis !== result.settings.linkAxis || before.linkAxisHasPriority !== result.settings.linkAxisHasPriority) { reload.push(name); }
        details.push(name + ': ' + result.summary);
      }
      this.engine.changeAxisConfigurations(entries, reload.length > 0);
      for (const name of reset) { this.engine.resetSync(name); }
      if (reload.length > 0) { details.push(await this.reloadManagedAxisScripts(reload, dispatch)); }
      this.sync(); return label + '：' + details.join('；');
    }
    if (action.id.startsWith('Media::AutoSkipToScriptStartEnabled::') || action.id === 'Media::AutoSkipToScriptStartOffset::Set') {
      const settings = this.engine.playbackConfiguration();
      if (action.id === 'Media::AutoSkipToScriptStartOffset::Set') { settings.autoSkipOffsetSeconds = action.value; }
      else { settings.autoSkipEnabled = action.id.endsWith('::Toggle') ? !settings.autoSkipEnabled : action.value === 1; }
      this.engine.changePlaybackConfiguration(settings); this.sync();
      return label + '：' + (action.id === 'Media::AutoSkipToScriptStartOffset::Set' ? settings.autoSkipOffsetSeconds + ' 秒' : settings.autoSkipEnabled ? '开启' : '关闭');
    }
    if (action.id.startsWith('Internal::Shuffle::') || action.id.startsWith('Internal::Looping::') ||
      action.id.startsWith('Internal::AutoConnectEnabled::') || action.id.startsWith('Internal::LoadAdditionalScripts::')) {
      if (context.busy) { throw new Error('媒体源正在加载，请稍后重试。'); }
      const settings = this.engine.playbackConfiguration(); const toggle = action.id.endsWith('::Toggle');
      let enabled = action.value === 1;
      if (action.id.startsWith('Internal::Shuffle::')) {
        enabled = toggle ? !settings.internalShuffling : enabled;
        this.playlist.setShuffling(enabled);
      } else if (action.id.startsWith('Internal::Looping::')) {
        enabled = toggle ? !settings.internalLooping : enabled;
        this.playlist.setLooping(enabled);
      } else if (action.id.startsWith('Internal::AutoConnectEnabled::')) {
        enabled = toggle ? !settings.internalAutoConnect : enabled;
        settings.internalAutoConnect = enabled; this.engine.changePlaybackConfiguration(settings);
      } else {
        enabled = toggle ? !settings.loadAdditionalScripts : enabled;
        await this.playlistAction(new PlaylistPanelAction('loadAdditionalScripts', -1, 0, enabled), dispatch);
      }
      this.persistInternalPlaylist(); this.sync(); return label + '：' + (enabled ? '开启' : '关闭');
    }
    switch (action.id) {
      case 'App::Stop': this.inputMessage = '已停止：全部输出解除启用'; this.stop(); return '已停止';
      case 'Media::PlayPause::Toggle':
        if (context.busy) { throw new Error('媒体源正在加载。'); }
        await this.playPause(dispatch); return label + '：' + (this.playing ? '播放中' : '暂停 / 未就绪');
      case 'Media::PlayPause::Set':
        if (context.busy) { throw new Error('媒体源正在加载。'); }
        if (action.value === 0) {
          this.cancelMediaSeek();
          if (this.internalConnected && !this.videoMode) { this.playlist.setPlaying(false); await this.applyInternalEvents(this.playlist.drainEvents(), false, dispatch); }
          else if (this.deoVrActive) { await this.setDeoVrPlaying(false); }
          else { this.engine.pause(); if (this.videoMode) { await this.video.pause(); } }
          this.sync();
        } else if (!(this.internalConnected && !this.videoMode ? this.playlist.isPlaying : this.mediaPlayIntent || this.playing)) { await this.playPause(dispatch); }
        return label + '：' + (this.playing ? '播放中' : '暂停 / 未就绪');
      case 'Media::ScriptOffset::Set':
      case 'Media::ScriptOffset::Offset': {
        const seconds = action.id.endsWith('::Offset') ? this.engine.configurationSnapshot().globalOffsetSeconds + action.value : action.value;
        this.engine.setGlobalOffsetSeconds(seconds); this.sync(); return label + '：' + seconds + ' 秒';
      }
      case 'Media::Speed::Set':
      case 'Media::Speed::Offset': {
        if (context.busy) { throw new Error('媒体源正在加载。'); }
        const speed = action.id.endsWith('::Offset') ? Math.max(0.25, Math.min(4, this.playbackSpeed + action.value)) : action.value;
        await this.setPlaybackSpeed(speed); return label + '：' + this.engine.snapshot().speed + ' 倍';
      }
      case 'Internal::Playlist::Prev': case 'Internal::Playlist::Next': case 'Internal::Playlist::Clear':
      case 'Internal::Playlist::PlayByIndex': case 'Internal::Playlist::PlayByName': case 'App::Internal::Random': {
        if (!this.internalConnected || context.busy) { throw new Error('Internal 媒体源未连接或正在加载。'); }
        const index = action.id === 'Internal::Playlist::PlayByName' ? this.playlist.playlistItems.findIndex(item =>
          shortcutNameEquals(item.name, action.text) || shortcutNameEquals(item.fullName, action.text)) : action.value;
        if ((action.id === 'Internal::Playlist::PlayByIndex' || action.id === 'Internal::Playlist::PlayByName') &&
          (index < 0 || index >= this.playlist.playlistItems.length)) { throw new Error('播放列表中没有匹配的名称或索引。'); }
        const kind = action.id.endsWith('::Prev') ? 'previous' : action.id.endsWith('::Next') ? 'next' :
          action.id.endsWith('::Clear') ? 'clear' : (action.id.endsWith('::PlayByIndex') || action.id.endsWith('::PlayByName')) ? 'select' : 'random';
        await this.playlistAction(new PlaylistPanelAction(kind, index), dispatch);
        if (this.internalError.length > 0) { throw new Error('Internal 动作失败，请查看媒体源错误。'); }
        return label + '：当前索引 ' + this.playlist.playlistIndex;
      }
      case 'App::Fullscreen::Toggle':
        if (!this.videoMode) { throw new Error('仅视频模式可切换全屏。'); }
        this.setVideoFullscreen(!this.videoFullscreen); return label + '：已请求';
      case 'App::Library::Show': this.showLibrary(); return label + '：已显示';
      default: throw new Error('不支持的动作。');
    }
  }
  shortcutMarker(chapters: boolean, direction: number): void {
    // Original shortcut actions select the first non-null collection, use media
    // position ±1.5s and seek raw marker time, without selected-axis offsets/pause.
    const binding = this.engine.bindings().find(item => item.resource !== null &&
      (chapters ? item.resource.chapters.length > 0 : item.resource.bookmarks.length > 0));
    if (binding === undefined || binding.resource === null) { return; }
    const positions = chapters ? binding.resource.chapters.map(item => item.startTimeSeconds) :
      binding.resource.bookmarks.map(item => item.positionSeconds);
    const position = this.engine.mediaPositionSeconds();
    if (!Number.isFinite(position)) { return; }
    const boundary = position + (direction > 0 ? 1.5 : -1.5);
    let index = positions.findIndex(value => value >= boundary);
    if (index < 0) { index = positions.length; }
    if (direction < 0) { index--; }
    if (index >= 0 && index < positions.length) { this.seekTransport(positions[index] * 1000); }
  }
  private async executeOutputConnectionAction(action: ShortcutAction, dispatch: ShortcutDispatch | null): Promise<string> {
    if (this.settingsReadOnly || this.recoveryRequired || !this.foreground || !this.viewActive || this.runtimeBusy || this.engine.hasPendingProfileChanges()) {
      throw new Error('当前设置、前台或设备配置不允许输出连接操作。');
    }
    const id = action.outputTargetId;
    if (id.length === 0) { throw new Error('未选择输出目标；没有替代为当前目标。'); }
    const draft = NativeOutputSession.draftSnapshot(id);
    const generation = dispatch === null ? draft.targetGeneration : this.shortcutOutputOwners.get(dispatch)?.get(id);
    const target = this.output.get(id);
    if (generation === undefined || target === null || !NativeOutputSession.matchesTarget(id, generation) || this.output.isRemoving(id)) {
      throw new Error('原输出目标实例已失效；未操作替代实例。');
    }
    if (isOutputEndpointAction(action.id)) {
      const result = applyOutputEndpointAction(draft, action);
      if (result === null) { throw new Error('端点或完整目标草稿无效；未保存或连接。'); }
      if (!result.changed) { return id + ' · 端点未改变；连接和 Arm 未改变'; }
      target.disarm();
      if (!NativeOutputSession.saveDraft(result.draft) || NativeOutputSession.draftDiagnostic(id).length > 0) { throw new Error('端点草稿未完整保存。发送已关闭。'); }
      this.persistOutputPreferences(); this.syncOutput();
      if (this.outputSaveDiagnostic.length > 0) { throw new Error(this.outputSaveDiagnostic); }
      return id + ' · 端点已保存；现有连接仍使用旧端点，需明确断开再连接或应用配置；未自动 Arm';
    }
    const operation = outputConnectionOperation(action.id);
    if (operation === null) { throw new Error('不支持此输出连接动作。'); }
    const status = target.status();
    const connected = status !== null && status.connection === 'connected';
    if (target.isBusy() || (status !== null && status.connection === 'connecting')) {
      return id + ' · 连接状态转换中，原动作不重复执行';
    }
    if (operation === 'Connect' && connected) { return id + ' · 已连接，未替换现有连接或更改 Arm'; }
    const disconnect = operation === 'Disconnect' || (operation === 'Toggle' && connected);
    if (disconnect) {
      if (!connected) { return id + ' · 当前未连接；未启动连接'; }
      target.disarm(); const closing = target.disconnect(); this.syncOutput(); await closing;
      if (this.output.get(id) !== target || !NativeOutputSession.matchesTarget(id, generation)) { throw new Error('原目标已被移除。'); }
      const closed = target.status();
      if (closed !== null && !closed.closeConfirmed) { throw new Error('原连接关闭未确认；发送保持禁用。'); }
      if (this.viewActive) { this.syncOutput(); }
      return id + ' · 已确认断开；未更改媒体播放';
    }
    if (status !== null && (status.connection !== 'disconnected' || !status.closeConfirmed)) { throw new Error('原输出仍有故障或关闭未确认，请先明确处理连接。'); }
    const configuration = draft.model.config(this.outputProfile, id); const endpoint = new OutputEndpoint();
    endpoint.host = draft.host; endpoint.port = draft.port; endpoint.family = draft.family === '2' ? 2 : 1;
    endpoint.localPort = draft.localPort; endpoint.scheme = draft.scheme === 'wss' ? 'wss' : 'ws'; endpoint.path = draft.path;
    if (!NativeOutputSession.canConnect(configuration, endpoint, generation)) { throw new Error('完整目标草稿或端点未通过连接验证。'); }
    const request = target.connectOwned(configuration, endpoint);
    if (dispatch !== null) { this.shortcutConnections.set(dispatch, new ShortcutConnectionOwner(target, request.requestId)); }
    this.syncOutput();
    const current = (): boolean => this.viewActive && this.foreground && !this.runtimeBusy && !this.settingsReadOnly && !this.recoveryRequired &&
      this.output.get(id) === target && NativeOutputSession.matchesTarget(id, generation) &&
      (dispatch === null || this.keyboard.isDispatchCurrent(dispatch)) && this.engine.activeRegistry().revision === draft.profileRevision &&
      NativeOutputSession.draftSnapshot(id).editRevision === draft.editRevision;
    try {
      const connectedNow = await request.completion;
      if (!current()) { target.cancelOwnedConnection(request.requestId); throw new Error('原连接动作已取消；不会影响较新的连接。'); }
      if (!connectedNow) { throw new Error(target.message() || '输出连接失败；未自动 Arm。'); }
      const applied = NativeOutputSession.draftSnapshot(id); applied.applicationId = target.appliedConfigurationId();
      if (!NativeOutputSession.saveDraft(applied)) { target.cancelOwnedConnection(request.requestId); throw new Error('连接草稿归属已变化。'); }
      target.releaseOwnedConnection(request.requestId);
      return id + ' · 已连接，仍需明确 Arm；未更改媒体播放';
    } finally {
      if (dispatch !== null && this.shortcutConnections.get(dispatch)?.requestId === request.requestId) { this.shortcutConnections.delete(dispatch); }
      if (this.viewActive) { this.syncOutput(); }
    }
  }
  async setPlaybackSpeed(speed: number): Promise<void> {
    if (!Number.isFinite(speed) || speed < 0.25 || speed > 4 || this.runtimeBusy || this.importing || this.openingVideo || this.libraryBusy) { return; }
    if (Math.abs(1 - speed) < 0.01) { speed = 1; }
    if (this.deoVrActive) { await this.controlDeoVr({ kind: 'speed', speed: speed }); }
    else if (this.videoMode) { await this.video.setRate(speed); }
    else if (this.internalConnected) { this.playlist.setSpeed(speed); await this.applyInternalEvents(this.playlist.drainEvents()); }
    else { this.engine.setSpeed(speed); }
    this.sync();
  }
  private syncErrorPresentation(): void {
    let key = ''; let message = '';
    if (this.sessionFault.length > 0) { key = 'pipeline:' + this.sessionFault; message = '运行错误，输出已关闭。请查看错误状态并明确安全重建。'; }
    else if (this.recoveryRequired) { key = 'settings-recovery'; message = '设置损坏，需要明确选择恢复；当前保持只读。'; }
    else if (this.settingsReadOnly) { key = 'settings-readonly'; message = '设置当前不可写，请查看保存状态。'; }
    else {
      for (const target of this.outputTargets) {
        const state = this.output.get(target.id)?.status();
        if (state !== null && state !== undefined && state.lastErrorCode !== null) { key = target.id + ':' + state.lastErrorCode; message = '输出 ' + target.name + ' 失败：' + state.lastErrorCode + '。发送已关闭。'; break; }
      }
      if (key.length === 0 && this.internalError.length > 0) { key = 'internal:' + this.internalError; message = 'Internal媒体源失败，请查看媒体源状态。'; }
      if (key.length === 0 && this.videoState === 'error') { key = 'video-error'; message = '视频播放失败，请查看媒体状态。'; }
    }
    const notice = this.errors.observe(this.generalConfiguration.errorDisplayType, key, message, this.foreground && this.viewActive, this.inputNow());
    if (notice === null) { this.errorNoticeId = 0; this.errorNoticeMode = ''; this.errorNoticeMessage = ''; }
    else if (notice.id !== this.errorNoticeId) {
      this.errorNoticeId = notice.id; this.errorNoticeMode = notice.mode; this.errorNoticeMessage = notice.message;
      if (notice.mode === 'dialog') {
        this.cancelKeyboardWork();
        const id: number = notice.id;
        this.openConfirmation(new ConfirmationRequest('错误提示', notice.message, '知道了', false,
          (): boolean => this.errorNoticeId === id && this.errorNoticeMode === 'dialog', (): void => this.dismissErrorNotice(id)), id);
      }
    }
    this.updateKeyboardContext();
  }
  errorDismissHandler(id: number): () => void { return (): void => this.dismissErrorNotice(id); }
  dismissErrorNotice(id: number): void { if (this.confirmationErrorId === id) { this.closeConfirmation(); this.errorNoticeId = 0; this.errorNoticeMode = ''; this.errorNoticeMessage = ''; this.syncErrorPresentation(); return; } if (this.errors.dismiss(id)) { this.errorNoticeId = 0; this.errorNoticeMode = ''; this.errorNoticeMessage = ''; this.syncErrorPresentation(); } }
  syncSocketDiagnostic(): void {
    const state = SocketDiagnosticSession.snapshot();
    this.diagnosticBusy = state.busy; this.diagnosticBlocked = SocketDiagnosticSession.blocked(); this.diagnosticPhase = state.phase;
    if (state.requestId > 0) {
      const proof = state.proof === 'exactEcho' ? '已收到本次唯一挑战的完整回显；仅证明接收脚本往返，不证明设备执行' : '尚无完整回显证明';
      this.diagnosticResult = '诊断记录 · 请求 ' + state.requestId + ' · ' + (state.kind || '') + ' · ' + state.phase +
        '\n发送 ' + state.bytesSent + ' B / 接收 ' + state.bytesReceived + ' B' +
        (state.latencyMs === null ? '' : ' · ' + state.latencyMs.toFixed(1) + ' ms') + '\n' + proof +
        '\n' + state.diagnostic + ' · 关闭确认：' + (state.closeConfirmed ? '是' : '否') + (state.quarantined ? '\n关闭未确认：诊断和设备连接保持隔离；请结束应用后重新检查。' : '');
    }
  }
  diagnosticEditable(): boolean {
    return this.viewActive && this.foreground && SocketDiagnosticSession.owns(this.diagnosticOwner) &&
      !SerialDiagnosticSession.blocked() && !SocketDiagnosticSession.blocked() && !this.settingsReadOnly && !this.recoveryRequired;
  }
  invalidateDiagnosticConfirmation(): void {
    if (this.diagnosticEditable()) { this.diagnosticConfirmed = false; this.diagnosticNotice = '端点正在编辑；请完成输入并重新确认专用接收脚本。'; }
  }
  editDiagnosticHost(value: string): boolean {
    if (!this.diagnosticEditable() || value.length > 253) { return false; }
    this.diagnosticHost = value.trim(); this.diagnosticConfirmed = false; this.diagnosticNotice = '地址已编辑；上次诊断结果不证明新端点。'; return true;
  }
  editDiagnosticPort(value: number): boolean {
    if (!this.diagnosticEditable() || !Number.isInteger(value) || value < 1 || value > 65535) { return false; }
    this.diagnosticPort = value; this.diagnosticConfirmed = false; this.diagnosticNotice = '端口已编辑；上次诊断结果不证明新端点。'; return true;
  }
  async startSocketDiagnostic(): Promise<void> {
    if (!this.diagnosticEditable() || !this.diagnosticConfirmed || this.runtimeBusy) { return; }
    if (!SocketDiagnosticSession.outputsQuiet(this.output)) { this.diagnosticNotice = '请先明确断开所有设备输出，并等待关闭确认。'; return; }
    const owner = this.diagnosticOwner;
    this.diagnosticNotice = '';
    try {
      const operation = SocketDiagnosticSession.run(owner, { kind: this.diagnosticKind === 'udp' ? 'udp' : 'tcp',
        host: this.diagnosticHost, port: this.diagnosticPort, dedicatedReceiverConfirmed: this.diagnosticConfirmed }, this.output);
      this.syncSocketDiagnostic();
      const result = await operation;
      if (!this.viewActive || !SocketDiagnosticSession.owns(owner)) { return; }
      this.syncSocketDiagnostic();
      if (result.phase === 'rejected') { this.diagnosticNotice = '诊断未启动：' + result.diagnostic; }
    } catch {
      if (this.viewActive && SocketDiagnosticSession.owns(owner)) { this.diagnosticNotice = '诊断未启动：当前页面、输出或前台状态已变化。'; }
    }
  }
  cancelSocketDiagnostic(): void { SocketDiagnosticSession.cancel(this.diagnosticOwner); this.syncSocketDiagnostic(); }
  syncOutput(): void {
    this.syncSocketDiagnostic();
    const registry = this.engine.activeRegistry();
    if (this.settingsReadOnly || this.recoveryRequired) { this.output.disarm(); }
    if (this.outputProfile.revision !== registry.revision) {
      this.output.disarm();
      NativeOutputSession.synchronizeProfile(registry.profile, registry.revision);
      this.outputDeviceId = registry.profile.id;
      this.outputProfile = { precision: registry.profile.outputPrecision, revision: registry.revision,
        axisOrder: registry.axes.map(axis => axis.name), maximumDurationMs: 10000, maximumPayloadBytes: 1024 };
    }
    this.output.refresh();
    const targets = NativeOutputSession.summaries();
    const connectedIds = targets.filter(target => target.connection === 'connected').map(target => target.id);
    if (this.engine.isManualPreviewActive() && this.manualOutputConnections.some(id => connectedIds.indexOf(id) < 0)) {
      this.engine.revokeManualPreview(); this.output.stop(); this.manualPreview = false;
      this.runtimeMessage = '输出连接已断开或出错，手动预览已撤销；需要重新明确启动与 Arm。';
    }
    this.manualOutputConnections = connectedIds;
    if (JSON.stringify(targets) !== JSON.stringify(this.outputTargets)) { this.outputTargets = targets; }
    this.selectedOutputId = NativeOutputSession.selectedId() || '';
    const draft = NativeOutputSession.draftSnapshot();
    if (draft.targetGeneration !== this.outputDraft.targetGeneration || draft.targetId !== this.outputDraft.targetId || draft.profileId !== this.outputDraft.profileId || draft.editRevision !== this.outputDraft.editRevision || draft.applicationId !== this.outputDraft.applicationId || draft.profileRevision !== this.outputDraft.profileRevision) { this.outputDraft = draft; }
    this.outputApplicationId = this.output.appliedConfigurationId();
    const state = this.output.status();
    this.outputConnection = state === null ? 'disconnected' : state.connection;
    this.outputArmed = state !== null && state.armed;
    this.outputSuspended = state !== null && state.dispatchSuspended;
    this.outputSeeking = state !== null && state.seekPending;
    this.outputBusy = this.output.isBusy();
    this.outputWrites = state === null ? 0 : state.completedLocalWrites;
    this.outputBytes = state === null ? 0 : state.locallyAcceptedBytes;
    this.syncSettingsDraftContext();
    this.syncSerialProbe();
    this.serialDiscovery.synchronize(this.serialDiscoveryContext());
    const serialState = this.serialDiscovery.snapshot();
    if (JSON.stringify(serialState) !== JSON.stringify(this.serialDiscoveryState)) { this.serialDiscoveryState = serialState; }
    this.outputDiagnostic = this.outputSaveDiagnostic || NativeOutputSession.draftDiagnostic() || this.output.message();
    if (state !== null && state.lastErrorCode !== null) { this.outputDiagnostic = 'Output: ' + state.lastErrorCode; }
    if (state !== null && !state.closeConfirmed && state.connection !== 'connected' && state.connection !== 'connecting') {
      this.outputDiagnostic = '关闭未确认；发送已禁用，请重启应用后再连接。已提交的命令无法撤回。';
    }
  }
  private serialProbeIdentity(): string {
    const draft = NativeOutputSession.draftSnapshot();
    return JSON.stringify([draft.targetId, draft.targetGeneration, draft.profileRevision, draft.editRevision, draft.serial.backend, draft.serial.portName]);
  }
  private syncSerialProbe(): void {
    if (this.serialProbeContext.length > 0 && this.serialProbeContext !== this.serialProbeIdentity()) { SerialDiagnosticSession.cancel(this.serialProbeOwner); this.serialProbeContext = ''; }
    const state = SerialDiagnosticSession.snapshot();
    if (JSON.stringify(state) !== JSON.stringify(this.serialProbeState)) { this.serialProbeState = state; }
  }
  async probeSerial(targetId: string, generation: number): Promise<void> {
    const context = this.serialDiscoveryContext(); const draft = NativeOutputSession.draftSnapshot();
    if (!context.allowed || SerialDiagnosticSession.blocked() || !SerialDiagnosticSession.owns(this.serialProbeOwner) ||
      targetId !== draft.targetId || generation !== draft.targetGeneration || draft.serial.backend !== 'ch34xWriteOnly') { return; }
    const selected = this.serialDiscoveryState.ports.find(port => port.backend === draft.serial.backend && port.portName === draft.serial.portName);
    if (selected === undefined) { this.serialProbeNotice = '请先刷新并选择本次 USB 候选。'; return; }
    if (!SocketDiagnosticSession.outputsQuiet(this.output)) { this.serialProbeNotice = '请先明确断开所有设备输出，并等待关闭确认。'; return; }
    const owner = this.serialProbeOwner; const identity = this.serialProbeIdentity(); this.serialProbeContext = identity;
    this.serialProbeNotice = '';
    const current = (): boolean => this.viewActive && this.foreground && !this.settingsReadOnly && !this.recoveryRequired &&
      !this.runtimeBusy && SerialDiagnosticSession.owns(owner) && identity === this.serialProbeIdentity();
    try {
      const pending = SerialDiagnosticSession.run(owner, this.serialProbeFactory,
        { backend: selected.backend, portName: selected.portName, portId: selected.portId }, current, true);
      this.syncOutput(); await pending;
    } catch { if (current()) { this.serialProbeNotice = '当前状态不允许开始诊断。'; } }
    if (this.viewActive && SerialDiagnosticSession.owns(owner)) { this.syncOutput(); }
  }
  cancelSerialProbe(): void { SerialDiagnosticSession.cancel(this.serialProbeOwner); this.syncSerialProbe(); }
  async copySerialProbe(): Promise<void> {
    this.syncSerialProbe();
    if (!this.viewActive || !this.foreground || this.serialProbeState.report.length === 0 || this.serialProbeState.busy) { return; }
    const owner = this.serialProbeOwner; const identity = this.serialProbeIdentity();
    try { await new NativeDeviceClipboard().writeText(this.serialProbeState.report); if (this.viewActive && this.foreground && SerialDiagnosticSession.owns(owner) && identity === this.serialProbeIdentity()) { this.serialProbeNotice = '已复制无设备路径/序列号的诊断报告，原剪贴板已覆盖。'; } }
    catch { if (this.viewActive && SerialDiagnosticSession.owns(owner) && identity === this.serialProbeIdentity()) { this.serialProbeNotice = '复制失败；可截取下面的诊断报告。'; } }
  }
  private serialDiscoveryContext(): SerialDiscoveryContext {
    const draft = NativeOutputSession.draftSnapshot();
    const target = draft.model.kind === 'serial' ? this.output.get(draft.targetId) : null;
    const state = target === null ? null : target.status();
    return { targetId: draft.targetId, targetGeneration: draft.targetGeneration, profileRevision: draft.profileRevision,
      backend: draft.serial.backend, allowed: draft.model.kind === 'serial' && this.viewActive && this.foreground &&
      !this.settingsReadOnly && !this.recoveryRequired && !this.runtimeBusy && !SerialDiagnosticSession.blocked() && !SocketDiagnosticSession.blocked() &&
      target !== null && !target.isBusy() && !this.output.isRemoving(draft.targetId) &&
      (state === null || (state.connection !== 'connected' && state.connection !== 'connecting')) };
  }
  async refreshSerialPorts(targetId: string, generation: number, backend: SavedSerialBackend): Promise<void> {
    const context = this.serialDiscoveryContext();
    if (context.targetId !== targetId || context.targetGeneration !== generation || context.backend !== backend || !context.allowed) { return; }
    const pending = this.serialDiscovery.refresh(context); this.serialDiscoveryState = this.serialDiscovery.snapshot();
    await pending;
    if (this.viewActive) { this.serialDiscovery.synchronize(this.serialDiscoveryContext()); this.serialDiscoveryState = this.serialDiscovery.snapshot(); }
  }
  private persistOutputPreferences(): void {
    try { this.engine.changeOutputConfiguration(NativeOutputSession.configurationSnapshot()); this.outputSaveDiagnostic = ''; }
    catch (error) { this.output.disarm(); this.outputSaveDiagnostic = '输出配置未保存；发送已关闭。请检查设置只读/恢复状态。'; }
  }
  addOutputTarget(kind: SavedOutputTargetKind): void {
    if (this.settingsReadOnly || this.recoveryRequired || !this.viewActive) { return; }
    try { NativeOutputSession.addTarget(kind); this.showAddOutput = false; this.persistOutputPreferences(); this.syncOutput(); }
    catch (error) { this.outputDiagnostic = (error as Error).message; }
  }
  selectOutputTarget(id: string, generation: number = NativeOutputSession.draftSnapshot(id).targetGeneration): void {
    if (!NativeOutputSession.selectTarget(id, generation)) { return; }
    if (!this.settingsReadOnly && !this.recoveryRequired) { this.persistOutputPreferences(); }
    this.syncOutput();
  }
  async removeOutputTarget(id: string, generation: number = NativeOutputSession.draftSnapshot(id).targetGeneration): Promise<void> {
    if (this.settingsReadOnly || this.recoveryRequired || !this.viewActive) { return; }
    const operation = NativeOutputSession.removeTarget(id, generation); this.syncOutput();
    const removed = await operation;
    if (removed) { this.persistOutputPreferences(); }
    if (this.viewActive) { this.syncOutput(); if (!removed) { this.outputDiagnostic = '目标仍保留：原连接关闭尚未确认。发送已禁用，可明确重试删除；隔离失败需重启应用。'; } }
  }
  updateOutputDraft(draft: OutputSettingsDraft): void {
    if (this.settingsReadOnly || this.recoveryRequired) { this.disarmOutput(draft.targetId, draft.targetGeneration); return; }
    if (NativeOutputSession.saveDraft(draft)) { this.persistOutputPreferences(); this.syncOutput(); }
  }
  async applyOutputConfiguration(configuration: OutputTargetConfig, endpoint: OutputEndpoint, generation: number = NativeOutputSession.draftSnapshot(configuration.targetId).targetGeneration): Promise<number> {
    if (!NativeOutputSession.matchesTarget(configuration.targetId, generation)) { return 0; }
    const target = this.output.get(configuration.targetId);
    if (target === null) { return 0; }
    const captured = NativeOutputSession.draftSnapshot(configuration.targetId);
    const connected = await this.connectOutput(configuration, endpoint, generation);
    if (!connected || this.output.get(configuration.targetId) !== target) { return 0; }
    if (!this.viewActive || !this.foreground || this.runtimeBusy || this.settingsReadOnly || this.recoveryRequired) { target.disarm(); return 0; }
    const current = NativeOutputSession.draftSnapshot(configuration.targetId);
    if (current.targetGeneration !== generation || current.editRevision !== captured.editRevision || current.profileRevision !== captured.profileRevision || current.profileId !== captured.profileId) { target.disarm(); return 0; }
    current.applicationId = target.appliedConfigurationId(); NativeOutputSession.saveDraft(current);
    if (this.viewActive) { this.syncOutput(); }
    return current.applicationId;
  }
  async connectOutput(configuration: OutputTargetConfig, endpoint: OutputEndpoint, generation: number = NativeOutputSession.draftSnapshot(configuration.targetId).targetGeneration): Promise<boolean> {
    if (this.confirmationCloseUnconfirmed) { return false; }
    if (!NativeOutputSession.matchesTarget(configuration.targetId, generation)) { return false; }
    if (!this.viewActive || !this.foreground || this.runtimeBusy || this.settingsReadOnly || this.recoveryRequired ||
      NativeOutputSession.draftDiagnostic(configuration.targetId).length > 0 ||
      !NativeOutputSession.canConnect(configuration, endpoint, generation)) { return false; }
    const operation = this.output.connect(configuration, endpoint); this.syncOutput();
    const connected = await operation;
    if (this.viewActive) { this.syncOutput(); }
    return connected;
  }
  armOutput(targetId: string = NativeOutputSession.selectedId() || '', generation: number = NativeOutputSession.draftSnapshot(targetId).targetGeneration): void {
    if (this.confirmationCloseUnconfirmed) { return; }
    if (!NativeOutputSession.matchesTarget(targetId, generation)) { return; }
    const target = this.output.get(targetId);
    if (target === null) { return; }
    if (SerialDiagnosticSession.blocked() || SocketDiagnosticSession.blocked() || !this.viewActive || !this.foreground || this.runtimeBusy || this.settingsReadOnly || this.recoveryRequired) {
      target.disarm(); this.syncOutput(); this.outputDiagnostic = '先确认设置恢复与前台状态，再启用发送。'; return;
    }
    const draft = NativeOutputSession.draftSnapshot(targetId);
    if (draft.applicationId === 0 || draft.applicationId !== target.appliedConfigurationId() || draft.profileRevision !== this.outputProfile.revision ||
      NativeOutputSession.draftDiagnostic(targetId).length > 0 || this.output.isRemoving(targetId)) {
      target.disarm(); this.syncOutput(); this.outputDiagnostic = '当前草稿尚未应用；请连接设备后再启用发送。'; return;
    }
    // Coordinator validates real source authorization, including explicitly allowed paused intents.
    target.arm(); this.syncOutput();
  }
  disarmOutput(targetId: string, generation: number = NativeOutputSession.draftSnapshot(targetId).targetGeneration): void { if (!NativeOutputSession.matchesTarget(targetId, generation)) { return; } const target = this.output.get(targetId); if (target !== null) { target.disarm(); } this.syncOutput(); }
  async disconnectOutput(targetId: string = NativeOutputSession.selectedId() || '', generation: number = NativeOutputSession.draftSnapshot(targetId).targetGeneration): Promise<void> {
    if (!NativeOutputSession.matchesTarget(targetId, generation)) { return; }
    const target = this.output.get(targetId); if (target === null) { return; }
    this.cancelRuntimeControl(); this.engine.revokeManualPreview();
    target.disarm(); const operation = target.disconnect(); this.syncOutput();
    await operation; if (this.viewActive) { this.syncOutput(); }
  }
  playlistContext(): PlaylistActionContext {
    const context = new PlaylistActionContext();
    context.connected = this.internalConnected; context.mediaConnected = (this.videoMode && this.videoReady) || (this.deoVrActive && this.deoVrConnected);
    context.busy = this.deoVrBusy || this.deoVrMatching || this.runtimeBusy || this.libraryBusy || this.internalBusy || this.internalLoading || this.importing || this.openingVideo;
    context.readOnly = this.settingsReadOnly || this.recoveryRequired;
    context.managedItems = this.internalLibrary.items();
    context.positionSeconds = this.engine.mediaPositionSeconds();
    context.durationSeconds = this.engine.mediaDurationSeconds();
    context.axisChapters = this.engine.axisChapters(); context.axisKeyframes = this.engine.axisKeyframes();
    return context;
  }
  syncPlaylist(): void {
    const settings = this.engine.playbackConfiguration();
    const snapshot = PlaylistPresentation.snapshot(this.playlist, this.engine.mediaLoop, this.engine.autoSkip, this.playlistContext());
    snapshot.error = this.internalError; snapshot.autoConnect = settings.internalAutoConnect;
    snapshot.loadAdditionalScripts = settings.loadAdditionalScripts; this.playlistView = snapshot;
  }
  restoreInternalPlaylist(): void {
    if (this.internalRestored) { return; }
    const settings = this.engine.playbackConfiguration();
    this.playlist.setPlaylist(settings.playlistAssociations === null ? null : settings.playlistAssociations.map(id => this.internalLibrary.item(id)));
    this.playlist.setShuffling(settings.internalShuffling); this.playlist.setLooping(settings.internalLooping);
    this.playlist.drainEvents(); this.internalRestored = true;
  }
  persistInternalPlaylist(): void {
    const settings = this.engine.playbackConfiguration();
    settings.playlistAssociations = this.playlist.hasPlaylist ? this.playlist.playlistItems.map(item => item.associationId) : null;
    settings.internalLooping = this.playlist.isLooping; settings.internalShuffling = this.playlist.isShuffling;
    settings.autoSkipEnabled = this.engine.autoSkip.enabled; settings.autoSkipOffsetSeconds = this.engine.autoSkip.offsetSeconds;
    this.engine.changePlaybackConfiguration(settings);
  }
  private remoteSource(): DeoVrMediaSource { return RemoteMediaSession.current(this.remoteKind); }
  private remoteName(): string { return this.remoteKind === 'heresphere' ? 'HereSphere' : 'DeoVR'; }
  async applyMediaSourceSettings(configuration: MediaSourceConfiguration): Promise<boolean> {
    if (this.settingsReadOnly || this.recoveryRequired || !this.viewActive || !this.foreground) { return false; }
    const request = ++this.mediaSettingsRequest; const prior = JSON.stringify(this.engine.mediaSourceConfiguration());
    const next = MediaSourceConfiguration.clone(configuration);
    if (JSON.stringify(next) === JSON.stringify(this.engine.mediaSourceConfiguration())) { return true; }
    const selectionChanged = next.selectedSource !== this.engine.mediaSourceConfiguration().selectedSource;
    if (this.deoVrActive || !RemoteMediaSession.allClosed() || selectionChanged) {
      this.cancelKeyboardWork(); this.output.stop(); this.engine.stop();
      if (!await this.disconnectDeoVr()) { return false; }
      if (selectionChanged && next.selectedSource !== 'internal') { this.disconnectInternal(); if (this.videoMode) { this.closeVideo(); await this.video.release(); } }
    }
    if (!this.viewActive || !this.foreground || this.settingsReadOnly || this.recoveryRequired) { return false; }
    if (request !== this.mediaSettingsRequest || prior !== JSON.stringify(this.engine.mediaSourceConfiguration())) { return false; }
    this.engine.changeMediaSourceConfiguration(next); this.mediaSourceConfiguration = next;
    this.remoteKind = next.selectedSource === 'heresphere' ? 'heresphere' : 'deovr';
    this.deoVrError = ''; this.deoVrSnapshot(this.remoteSource().snapshot(), [], this.remoteKind);
    this.status = '媒体源配置已保存；未连接、未启用输出。'; this.sync(); return true;
  }
  async connectDeoVr(kind: RemoteSourceKind = 'deovr'): Promise<void> {
    if (this.confirmationCloseUnconfirmed) { return; }
    if (!this.viewActive || !this.foreground || this.runtimeBusy || this.libraryBusy || this.importing || this.openingVideo ||
      this.deoVrBusy || this.settingsReadOnly || this.recoveryRequired || !this.libraryLoaded || this.libraryRoot.length === 0) { return; }
    const intent = ++this.mediaSettingsRequest;
    if (kind === this.remoteKind && this.remoteSource().snapshot().status === 'connected') { return; }
    // Retire both source owners before selecting a different one. A failed close
    // cannot be bypassed through the other protocol's independent factory.
    if (this.deoVrActive || !RemoteMediaSession.allClosed()) {
      const closing = this.disconnectDeoVr(); const retiring = this.deoVrRequest;
      if (!await closing || retiring !== this.deoVrRequest) { return; }
    }
    if (intent !== this.mediaSettingsRequest || !this.viewActive || !this.foreground || this.settingsReadOnly || this.recoveryRequired) { return; }
    this.remoteKind = kind; const source = this.remoteSource(); const name = this.remoteName();
    this.cancelKeyboardWork(); this.disconnectInternal(); this.cancelMediaSeek(); this.output.stop(); this.engine.stop();
    this.openVideoRequest++; this.pendingVideoUri = ''; this.videoMode = false; this.videoReady = false; this.setVideoFullscreen(false);
    const request = ++this.deoVrRequest; this.deoVrBusy = true; this.deoVrError = ''; this.deoVrMatchRequest++;
    const current = (): boolean => request === this.deoVrRequest && this.remoteKind === kind && this.viewActive && this.foreground;
    try {
      await this.video.release(); if (!current()) { return; }
      if (this.video.snapshot().failure.length > 0) { throw new Error(this.video.snapshot().failure); }
      if (!RemoteMediaSession.allClosed()) { throw new Error('旧媒体源关闭尚未确认。'); }
      this.engine.clearScripts(); this.document = new FunscriptDocument([]); this.fileName = '等待 ' + name + ' 媒体及受管脚本匹配';
      const configuration = this.engine.mediaSourceConfiguration(); configuration.selectedSource = kind;
      this.engine.changeMediaSourceConfiguration(configuration); this.mediaSourceConfiguration = configuration;
      this.deoVrActive = true; this.deoVrResourceRevision = -1; this.deoVrGeneration = -1;
      const endpoint = kind === 'heresphere' ? configuration.hereSphere : configuration.deoVr;
      await source.connect({ host: endpoint.host, port: endpoint.port, family: endpoint.host.indexOf(':') >= 0 ? 2 : 1 });
      if (!current()) { return; }
      this.status = name + ' TCP 已连接，等待真实媒体状态；输出未自动连接或 Arm。';
    } catch (error) {
      if (current()) { this.deoVrActive = false; this.engine.stop(); this.output.stop(); this.deoVrError = (error as Error).message; this.status = name + ' 连接失败：' + this.deoVrError; }
    } finally { if (current()) { this.deoVrBusy = false; this.deoVrSnapshot(source.snapshot(), [], kind); this.sync(); } }
  }
  async disconnectDeoVr(): Promise<boolean> {
    this.deoVrRequest++; this.deoVrMatchRequest++; this.deoVrMatching = false;
    const owned = this.deoVrActive || this.engine.isDeoVrSource(); this.deoVrActive = false;
    if (owned) {
      this.cancelMediaSeek(); this.cancelManagedReload(); this.output.stop(); this.engine.clearScripts(); this.engine.useExternalClock(false);
      this.document = new FunscriptDocument([]); this.fileName = this.remoteName() + ' 已停止，需显式连接';
    }
    const kind = this.remoteKind; const source = this.remoteSource();
    // Invoke both cancellations synchronously, before awaiting either close.
    const operations = [RemoteMediaSession.current('deovr'), RemoteMediaSession.current('heresphere')].map(owner =>
      owner.disconnect().then((): boolean => owner.snapshot().closeConfirmed).catch((): boolean => false));
    const closed = (await Promise.all(operations)).every(value => value) && RemoteMediaSession.allClosed();
    if (!closed) { this.deoVrError = '媒体源关闭未确认；所有来源切换和重新连接已锁定。'; }
    if (this.viewActive && kind === this.remoteKind) { this.deoVrSnapshot(source.snapshot(), [], kind); }
    return closed;
  }
  deoVrSnapshot(snapshot: DeoVrSnapshot, events: ReadonlyArray<DeoVrEvent>, kind: RemoteSourceKind = 'deovr'): void {
    if (!this.viewActive || kind !== this.remoteKind || (snapshot.sourceKind !== undefined && snapshot.sourceKind !== kind)) { return; }
    this.deoVrConnected = snapshot.status === 'connected'; this.deoVrBusy = snapshot.status === 'connecting' || snapshot.status === 'disconnecting';
    this.deoVrCloseConfirmed = snapshot.closeConfirmed && RemoteMediaSession.allClosed(); this.deoVrStatus = snapshot.status;
    this.deoVrPath = snapshot.path || ''; this.deoVrPosition = snapshot.positionSeconds; this.deoVrDuration = snapshot.durationSeconds;
    this.deoVrPlaying = snapshot.playing;
    if (snapshot.diagnostic !== null) { this.deoVrError = snapshot.diagnostic; }
    if (!this.deoVrActive || !this.foreground) { return; }
    if (snapshot.status === 'connecting' && snapshot.generation !== this.deoVrGeneration) {
      this.deoVrGeneration = snapshot.generation; this.engine.useDeoVrSource(snapshot.generation, kind);
    }
    if (snapshot.generation !== this.deoVrGeneration) { return; }
    if (snapshot.status === 'connected' && snapshot.playerState !== null && snapshot.playerState !== 0 && snapshot.playerState !== 1) { this.status = '远端报告非普通播放/暂停状态，输出权限已撤销；需明确恢复普通状态并重新 Arm。'; }
    const changed = snapshot.path !== null && snapshot.resourceRevision !== this.deoVrResourceRevision;
    if (changed || snapshot.path === null || snapshot.status !== 'connected' || snapshot.diagnostic !== null) {
      this.output.stop(); this.deoVrMatchRequest++; this.deoVrMatching = false;
    }
    this.engine.acceptDeoVrSnapshot(snapshot, events, this.inputNow());
    if (changed) {
      this.deoVrResourceRevision = snapshot.resourceRevision;
      this.document = this.engine.displayDocument(); this.fileName = '正在按受管目录匹配 ' + this.remoteName() + ' 媒体…';
      this.matchDeoVrScripts(snapshot);
    }
    if (snapshot.status === 'fault' || snapshot.status === 'disconnected') { this.engine.stop(); this.deoVrActive = false; }
    this.sync();
  }
  async matchDeoVrScripts(snapshot: DeoVrSnapshot): Promise<void> {
    const request = ++this.deoVrMatchRequest; const owner = this.deoVrRequest; const kind = this.remoteKind; const source = this.remoteSource();
    const root = this.libraryRoot; const catalog = this.mediaCatalog; const libraries = this.scriptLibraries; const libraryRequest = this.libraryRequest;
    const profile = this.engine.activeRegistry().revision;
    const current = (): boolean => request === this.deoVrMatchRequest && owner === this.deoVrRequest && kind === this.remoteKind && source === this.remoteSource() && this.deoVrActive &&
      this.viewActive && this.foreground && this.libraryLoaded && !this.libraryBusy && root.length > 0 && root === this.libraryRoot &&
      catalog === this.mediaCatalog && libraries === this.scriptLibraries && libraryRequest === this.libraryRequest && profile === this.engine.activeRegistry().revision &&
      snapshot.generation === source.snapshot().generation && snapshot.resourceRevision === source.snapshot().resourceRevision;
    this.deoVrMatching = true;
    try {
      if (!current() || snapshot.path === null) { throw new Error('受管目录或远端媒体已失效。'); }
      const media = deoVrScriptMatchHint(snapshot.path, kind);
      const catalogs = [new ResourceLibraryCatalog(root, catalog, true)].concat(
        this.scriptLibraries.map(source => new ResourceLibraryCatalog(source.uri, source.files, source.recursive)));
      const selection = await this.readCompanionSelection(media, [], catalogs, current, true);
      if (!current()) { return; }
      const document = selection.document || new FunscriptDocument([]); let bindings: AxisScriptBinding[] = [];
      for (const item of selection.axisSources) { bindings = bindings.concat(this.engine.resources(item.document, item.file.uri, item.file.name)); }
      if (!this.engine.loadDeoVrBindings(snapshot.generation, snapshot.resourceRevision, document, bindings, kind)) { return; }
      this.document = document; this.fileName = selection.selectedFiles.length > 0 ? selection.selectedFiles.map(item => item.name).join(' + ') : this.remoteName() + ' 媒体无匹配脚本';
      this.status = this.fileName + '；仅接收的媒体时钟有效，输出需单独 Arm。';
    } catch (error) {
      if (current()) { this.output.stop(); this.engine.stop(); this.deoVrError = this.remoteName() + ' 脚本匹配失败：' + (error as Error).message; this.status = this.deoVrError; }
    } finally { if (request === this.deoVrMatchRequest) { this.deoVrMatching = false; if (this.viewActive) { this.sync(); } } }
  }
  async setDeoVrPlaying(playing: boolean): Promise<void> { await this.controlDeoVr({ kind: playing ? 'play' : 'pause' }); }
  private async controlDeoVr(control: DeoVrControlRequest): Promise<void> {
    if (!this.deoVrActive || !this.deoVrConnected || !this.viewActive || !this.foreground) { return; }
    const owner = this.deoVrRequest; const request = ++this.deoVrControlRequest;
    const source = this.remoteSource(); const initial = source.snapshot();
    const current = (): boolean => owner === this.deoVrRequest && request === this.deoVrControlRequest && this.deoVrActive &&
      this.foreground && this.viewActive && initial.generation === source.snapshot().generation &&
      initial.resourceRevision === source.snapshot().resourceRevision;
    const lease = this.engine.beginDeoVrControl(control, initial, this.inputNow());
    if (lease !== null) { this.output.beginSourceControl(); }
    else {
      this.output.stop();
      if (control.kind === 'play') { if (!this.engine.admitDeoVrPlay()) { return; } }
      else if (control.kind === 'pause') { this.engine.requestDeoVrPause(); }
    }
    this.syncOutput();
    const dispatched = (boundary: DeoVrDispatchBoundary): boolean => current() &&
      (lease === null || this.engine.bindDeoVrControl(lease.requestId, boundary, this.inputNow()));
    try {
      if (control.kind === 'speed') { await source.changeSpeed(control.speed!, dispatched); }
      else { await source.playPause(control.kind === 'play', dispatched); }
      if (!current()) { return; }
      this.status = lease === null ? '命令已本地提交；当前条件不足以保留 Arm，收到状态后需明确重新启用。' :
        '命令已本地提交，正在等待同源后续状态与新帧；这不是远端 ACK。';
      if (lease === null && control.kind === 'play' && !this.deoVrMatching) { await this.matchDeoVrScripts(source.snapshot()); }
    } catch (error) {
      if (current()) { this.engine.cancelDeoVrControl(lease === null ? undefined : lease.requestId); this.engine.stop(); this.output.stop(); this.deoVrError = (error as Error).message; }
    }
    if (this.viewActive) { this.sync(); }
  }
  async seekDeoVr(position: number): Promise<void> {
    if (!this.deoVrActive || !this.deoVrConnected || !this.foreground || !this.viewActive || !Number.isFinite(position) || position < 0 || position > this.durationMs) { return; }
    this.cancelMediaSeek(); this.output.stop();
    if (!this.engine.beginDeoVrSeek()) { return; }
    const owner = this.deoVrRequest; const initial = this.remoteSource().snapshot(); const command = ++this.deoVrControlRequest; this.syncOutput();
    const current = (): boolean => owner === this.deoVrRequest && command === this.deoVrControlRequest && this.deoVrActive && initial.generation === this.remoteSource().snapshot().generation && initial.resourceRevision === this.remoteSource().snapshot().resourceRevision;
    try {
      await this.remoteSource().seek(position / 1000);
      if (current()) { this.status = '远端跳转已提交；协议无 seek ACK，设备 Arm 已撤销，收到新状态后需手动重新启用。'; }
    } catch (error) { if (current()) { this.engine.stop(); this.output.stop(); this.deoVrError = (error as Error).message; } }
    if (this.viewActive) { this.sync(); }
  }
  private rememberLocalSource(): void {
    this.mediaSettingsRequest++;
    if (!this.settingsReadOnly && !this.recoveryRequired) {
      const configuration = this.engine.mediaSourceConfiguration();
      if (configuration.selectedSource !== 'internal') { configuration.selectedSource = 'internal'; this.engine.changeMediaSourceConfiguration(configuration); this.mediaSourceConfiguration = configuration; }
    }
  }
  disconnectInternal(): void {
    this.cancelKeyboardWork();
    this.internalRequest++; this.internalBusy = false; this.internalLoading = false; this.internalAwaitingReload = false;
    if (!this.internalConnected) { return; }
    this.internalConnected = false; this.output.stop(); this.cancelMediaSeek();
    this.playlist.setPlaying(false); this.playlist.setPlaylist(this.playlist.hasPlaylist ? this.playlist.playlistItems : null); this.playlist.drainEvents();
    this.engine.clearScripts(); this.engine.useExternalClock(false); this.document = new FunscriptDocument([]); this.fileName = 'No script selected';
  }
  async connectInternal(): Promise<void> {
    if (this.confirmationCloseUnconfirmed) { return; }
    this.cancelKeyboardWork();
    if (!this.viewActive || !this.foreground || this.runtimeBusy || this.libraryBusy || this.internalBusy || this.importing || this.openingVideo ||
      this.settingsReadOnly || this.recoveryRequired) { return; }
    if (this.internalConnected) { this.disconnectInternal(); this.sync(); return; }
    const retiringRequest = ++this.internalRequest; this.internalBusy = true;
    if (this.deoVrActive || !RemoteMediaSession.allClosed()) {
      const closed = await this.disconnectDeoVr();
      if (retiringRequest !== this.internalRequest) { return; }
      if (!closed || !this.viewActive || !this.foreground) { this.internalBusy = false; this.status = this.deoVrError; return; }
    }
    this.rememberLocalSource();
    this.restoreInternalPlaylist(); this.internalBusy = true; this.internalError = '';
    const request = ++this.internalRequest;
    const current = (): boolean => request === this.internalRequest && this.viewActive && this.foreground;
    this.pauseTransport(); this.cancelMediaSeek(); this.openVideoRequest++; this.pendingVideoUri = '';
    this.videoMode = false; this.videoReady = false; this.setVideoFullscreen(false); this.videoOnly = false;
    try {
      await this.video.release(); if (!current()) { return; }
      if (this.video.snapshot().failure.length > 0) { throw new Error(this.video.snapshot().failure); }
      await this.prepareInternalItems(this.playlist.playlistItems, current);
          if (!current()) {
            if (request === this.internalRequest) {
              this.internalBusy = false; this.internalLoading = false; this.internalAwaitingReload = true;
              this.engine.clearScripts(); this.engine.useInternalSource(); this.document = new FunscriptDocument([]); this.sync();
            }
            return;
          }
      // Original Internal connection initializes its clock after a 250ms delay.
      await new Promise<void>(resolve => setTimeout(resolve, 250)); if (!current()) { return; }
      this.engine.clearScripts(); this.engine.useInternalSource(); this.document = new FunscriptDocument([]);
      this.playlist.setPlaylist(this.playlist.hasPlaylist ? this.playlist.playlistItems : null);
      this.playlist.setPlaying(false); this.playlist.setSpeed(1); this.playlist.drainEvents();
      this.internalConnected = true; this.internalLastTick = systemDateTime.getUptime(systemDateTime.TimeType.STARTUP, false);
      this.status = 'Internal connected · choose a script, then press Play · output remains disarmed';
    } catch (error) { if (current()) { this.internalError = 'Internal connection failed: ' + (error as Error).message; this.engine.stop(); } }
    finally { if (current()) { this.internalBusy = false; this.sync(); } }
  }
  cancelManagedReload(): void {
    if (!this.scriptReloadBusy) { return; }
    this.scriptReloadRequest++; this.scriptReloadBusy = false;
    this.engine.cancelScriptReload(); this.output.disarm();
    this.scriptReloadStatus = '重载已取消，发送已解除启用；旧读取不能覆盖当前资源。';
  }
  async reloadManagedLoopingScript(axisName: string, identity: string, shortcut: ShortcutDispatch | null = null,
    configuration?: MotionProviderConfiguration): Promise<string> {
    if (!this.viewActive || !this.foreground || this.runtimeBusy || this.libraryBusy || this.internalBusy ||
      this.internalLoading || this.importing || this.openingVideo || this.settingsReadOnly || this.recoveryRequired || this.scriptReloadBusy || !this.libraryLoaded || this.libraryRoot.length === 0) {
      throw new Error('当前状态不能读取 Looping Script，需完整 Download 目录扫描。');
    }
    let file: ResourceFileEntry;
    try { file = resolveManagedLoopingSelection(identity, this.mediaCatalog); }
    catch (error) { this.output.disarm(); throw new Error((error as Error).message); }
    const request = ++this.scriptReloadRequest; const token = this.engine.beginLoopingScriptReload(axisName);
    const root = this.libraryRoot; const libraryRequest = this.libraryRequest; const catalog = this.mediaCatalog;
    const current = (): boolean => request === this.scriptReloadRequest && this.engine.isScriptReloadCurrent(token) &&
      root === this.libraryRoot && libraryRequest === this.libraryRequest && catalog === this.mediaCatalog &&
      this.viewActive && this.foreground && !this.settingsReadOnly && !this.recoveryRequired &&
      (shortcut === null || this.keyboard.isDispatchCurrent(shortcut));
    this.scriptReloadBusy = true; this.scriptReloadStatus = '正在读取受管 Looping Script；发送暂待新帧，媒体继续。';
    this.syncOutput(); let completed = false;
    try {
      const contents = await LibraryFiles.readScript(file.uri, current);
      if (!current()) { throw new Error('Looping Script 读取已取消。'); }
      const document = parseManagedLoopingScript(contents, axisName, this.engine.activeRegistry().axes.map(axis => axis.name));
      if (!current() || !this.engine.completeLoopingScriptReload(token, document, file.uri, configuration)) {
        throw new Error('Looping Script 所属配置已失效。');
      }
      completed = true; this.scriptReloadStatus = '已重新读取 ' + file.relativePath + '；新资源已重置相位并请求同步，等待下一真实来源帧。';
      return this.scriptReloadStatus;
    } catch (error) {
      if (request === this.scriptReloadRequest) {
        this.engine.cancelScriptReload(token); this.output.disarm();
        this.scriptReloadStatus = 'Looping Script 未应用，保留旧资源；发送已解除启用：' + (error as Error).message;
      }
      throw new Error((error as Error).message);
    } finally {
      if (request === this.scriptReloadRequest) {
        if (!completed) { this.engine.cancelScriptReload(token); this.output.disarm(); }
        this.scriptReloadBusy = false; this.sync();
      }
    }
  }
  async reloadManagedAxisScripts(axisNames: string[], shortcut: ShortcutDispatch | null = null): Promise<string> {
    if (!this.viewActive || !this.foreground || this.runtimeBusy || this.libraryBusy || this.internalBusy ||
      this.internalLoading || this.importing || this.openingVideo || this.settingsReadOnly || this.recoveryRequired) {
      throw new Error('当前状态不能重载资源。');
    }
    if (this.scriptReloadBusy) { throw new Error('另一项资源重载正在进行。'); }
    if (this.videoMode && this.activeVideoFile === null) { throw new Error('当前视频缺少授权目录身份，请重新选择资源。'); }
    const request = ++this.scriptReloadRequest;
    const token = this.engine.beginScriptReload(axisNames);
    const root = this.libraryRoot; const libraryRequest = this.libraryRequest; const catalog = this.mediaCatalog; const libraries = this.scriptLibraries;
    const openRequest = this.openVideoRequest; const internalRequest = this.internalRequest;
    const item = this.internalConnected ? this.playlist.currentItem : null;
    const video = this.videoMode ? this.activeVideoFile : null;
    const remote = this.deoVrActive ? this.remoteSource().snapshot() : null;
    const remoteRequest = this.deoVrRequest;
    const current = (): boolean => request === this.scriptReloadRequest && this.engine.isScriptReloadCurrent(token) &&
      root === this.libraryRoot && libraryRequest === this.libraryRequest && catalog === this.mediaCatalog && libraries === this.scriptLibraries &&
      openRequest === this.openVideoRequest && internalRequest === this.internalRequest &&
      (!this.internalConnected || item === this.playlist.currentItem) &&
      (remote === null || (this.deoVrActive && remoteRequest === this.deoVrRequest && remote.generation === this.remoteSource().snapshot().generation &&
        remote.resourceRevision === this.remoteSource().snapshot().resourceRevision)) && this.viewActive && this.foreground &&
      !this.settingsReadOnly && !this.recoveryRequired && (shortcut === null || this.keyboard.isDispatchCurrent(shortcut));
    this.scriptReloadBusy = true; this.scriptReloadStatus = '正在重新扫描同一Download目录并读取资源；媒体继续，发送暂待新帧。';
    // Suspend all existing targets immediately, before even the first await.
    // Pending preserves only their existing arm intent and clears queued bytes.
    this.syncOutput();
    let completed = false;
    try {
      let bindings: AxisScriptBinding[] = [];
      const search = axisNames.some(name => !this.engine.getAxisConfiguration(name).linkAxisHasPriority);
      let detail = '';
      if (search && (item !== null || video !== null || remote !== null)) {
        if (root.length === 0 || !this.libraryLoaded) { throw new Error('当前源没有可重新读取的已授权Download目录。'); }
        const scan = await LibraryFiles.scanDirectory(root, current, (_progress: LibraryScanProgress) => {});
        if (!current()) { throw new Error('资源重载已取消。'); }
        if (scan.truncated || scan.warnings.length > 0) { throw new Error('目录重索引不完整：' + (scan.warnings[0] || '已达到扫描上限')); }
        const files = scan.files.map(file => new ResourceFileEntry(file.uri, file.name, file.relativePath));
        let selection: ResourceSelectionResult;
        if (item !== null) {
          const library = new InternalSourceLibrary(); library.replace(files, this.engine.activeRegistry().profile);
          const file = library.resolve(item.associationId);
          if (file === undefined) { selection = new ResourceSelectionResult(); }
          else if (!this.engine.playbackConfiguration().loadAdditionalScripts) {
            const contents = await LibraryFiles.readScript(file.uri, current);
            if (!current()) { throw new Error('资源重载已取消。'); }
            selection = InternalSourceLibrary.selectSingle(ResourceLibrary.parseCandidate(contents, file, this.engine.activeRegistry().profile), this.engine.activeRegistry().profile);
          } else { selection = await this.readCompanionSelection(InternalSourceLibrary.companionMedia(file, this.engine.activeRegistry().profile), files, [], current, true); }
        } else if (remote !== null) {
          if (remote.path === null) { throw new Error(this.remoteName() + ' 没有当前媒体路径。'); }
          selection = await this.readCompanionSelection(deoVrScriptMatchHint(remote.path), [], [new ResourceLibraryCatalog(root, files, true)], current, true);
        } else {
          // Match the existing source only by catalog identity. Never form an I/O
          // path from an action name, relative-path parameter, or a guessed URI.
          const media = files.find(file => video !== null && file.uri === video.uri && file.relativePath === video.relativePath);
          if (media === undefined) { throw new Error('当前视频已不在本次Download目录索引中。'); }
          selection = await this.readCompanionSelection(media, files, [], current, true);
        }
        if (!current()) { throw new Error('资源重载已取消。'); }
        for (const source of selection.axisSources) { bindings = bindings.concat(this.engine.resources(source.document, source.file.uri, source.file.name)); }
        const found = bindings.filter(binding => axisNames.indexOf(binding.axisName) >= 0).length;
        detail = '新读取 ' + found + ' 个轴资源' + (scan.truncated ? '；目录索引达到上限' : '') +
          (scan.warnings.length > 0 ? '；' + scan.warnings[0] : '');
      } else { detail = search ? '没有当前媒体源，仅执行原链接回退' : '优先链接轴不搜索脚本'; }
      if (!current() || !this.engine.completeScriptReload(token, bindings)) { throw new Error('资源重载已取消。'); }
      completed = true;
      this.document = this.engine.displayDocument();
      this.scriptReloadStatus = detail + '；搜索缺失时保留原普通资源，锁保护仍生效；发送等待下一真实有效帧。';
      return this.scriptReloadStatus;
    } catch (error) {
      if (request === this.scriptReloadRequest) {
        this.engine.cancelScriptReload(token); this.output.disarm();
        this.scriptReloadStatus = '重载未完成，发送已解除启用：' + (error as Error).message;
      }
      throw new Error((error as Error).message);
    } finally {
      if (request === this.scriptReloadRequest) {
        if (!completed) { this.engine.cancelScriptReload(token); this.output.disarm(); }
        this.scriptReloadBusy = false; this.sync();
      }
    }
  }
  async readInternalSelection(associationId: string, current: () => boolean): Promise<ResourceSelectionResult> {
    const file = this.internalLibrary.resolve(associationId);
    if (file === undefined) { throw new Error('Script is no longer in the current Download catalog.'); }
    const profile = this.engine.activeRegistry().profile;
    if (!this.engine.playbackConfiguration().loadAdditionalScripts) {
      const contents = await LibraryFiles.readScript(file.uri, current);
      if (!current()) { throw new Error('Cancelled'); }
      return InternalSourceLibrary.selectSingle(ResourceLibrary.parseCandidate(contents, file, profile), profile);
    }
    const media = InternalSourceLibrary.companionMedia(file, profile);
    const catalogs = this.scriptLibraries.map(source => new ResourceLibraryCatalog(source.uri, source.files, source.recursive));
    return this.readCompanionSelection(media, this.mediaCatalog, catalogs, current);
  }
  async readCompanionSelection(media: ResourceFileEntry, files: ResourceFileEntry[], catalogs: ResourceLibraryCatalog[],
    current: () => boolean, rejectFailures: boolean = false): Promise<ResourceSelectionResult> {
    const profile = this.engine.activeRegistry().profile;
    const plan = ResourceLibrary.planSearch(media, files, catalogs);
    if (plan.length > 64) { throw new Error('More than 64 companion candidates; narrow the managed library.'); }
    const candidates: ResourceScriptCandidate[] = [];
    let textBudget = 0; let actionBudget = 0;
    for (const step of plan) {
      let inputs: LoadedScriptInput[] = [];
      if (step.kind === 'zip') {
        const zipped = await ScriptZipFiles.readScripts(step.file.uri, current);
        inputs = zipped.map((entry: ScriptZipCandidate, index: number) => new LoadedScriptInput(
          new ResourceFileEntry(entry.sourceUri, entry.name, 'archive/' + index + '/' + entry.name), entry.contents));
      } else {
        try { inputs = [new LoadedScriptInput(step.file, await LibraryFiles.readScript(step.file.uri, current))]; }
        catch (error) { if (!current() || rejectFailures) { throw new Error(step.file.name + ': ' + (error as Error).message); } continue; }
      }
      if (!current()) { throw new Error('Cancelled'); }
      if (inputs.length + candidates.length > 64) { throw new Error('More than 64 expanded companion candidates.'); }
      for (const input of inputs) {
        textBudget += input.contents.length * 2;
        if (textBudget > 8 * 1024 * 1024) { throw new Error('Companion text budget exceeded.'); }
        let candidate: ResourceScriptCandidate;
        try { candidate = ResourceLibrary.parseCandidate(input.contents, input.file, profile); }
        catch (error) { if (rejectFailures) { throw new Error(input.file.name + ': ' + (error as Error).message); } continue; }
        for (const axis of candidate.document.axes) { actionBudget += axis.actions.length; }
        if (actionBudget > FunscriptParser.MAX_ACTIONS) { throw new Error('Companion action budget exceeded.'); }
        candidates.push(candidate);
      }
    }
    return ResourceLibrary.selectDocuments(media.name, candidates, profile);
  }
  async prepareInternalItems(items: InternalPlaylistItem[], current: () => boolean): Promise<void> {
    const prepared: string[] = [];
    for (const item of items) {
      if (!current()) { return; }
      if (prepared.indexOf(item.associationId) < 0 && this.internalLibrary.resolve(item.associationId) !== undefined) {
        prepared.push(item.associationId);
        try {
          const selection = await this.readInternalSelection(item.associationId, current);
          if (!current()) { return; }
          this.internalLibrary.recordDuration(item.associationId, selection.document === undefined ? Number.NaN : selection.document.durationMs / 1000);
        } catch (error) {
          if (!current()) { return; }
          this.internalLibrary.recordDuration(item.associationId, Number.NaN);
          this.internalError = item.name + ': ' + (error as Error).message;
        }
      }
      this.internalLibrary.refresh(item);
    }
  }
  tickInternal(now: number): void {
    if (!this.internalConnected || this.internalLoading || this.internalAwaitingReload || !this.foreground || !this.viewActive) { return; }
    const elapsed = now - this.internalLastTick;
    if (elapsed < 100) { return; }
    this.internalLastTick = now;
    this.playlist.tick(elapsed / 1000);
    this.applyInternalEvents(this.playlist.drainEvents());
  }
  async applyInternalEvents(events: InternalPlaylistEvent[], alreadySeeking: boolean = false, shortcut: ShortcutDispatch | null = null): Promise<void> {
    if (!this.internalConnected || events.length === 0) { return; }
    const load = events.find(event => event.kind === 'load');
    if (load !== undefined && load.item !== null) {
      if (shortcut === null) { this.cancelKeyboardWork(); }
      else if (!this.keyboard.isDispatchCurrent(shortcut)) { return; }
      const item = load.item; const request = ++this.internalRequest;
      const current = (): boolean => request === this.internalRequest && this.internalConnected && this.viewActive && this.foreground && this.playlist.currentItem === item && (shortcut === null || this.keyboard.isDispatchCurrent(shortcut));
      this.internalAwaitingReload = false; this.internalLoading = true; this.internalBusy = false; this.output.stop(); this.engine.pause(); this.cancelMediaSeek();
      try {
        const selection = await this.readInternalSelection(item.associationId, current); if (!current()) { return; }
        const document = selection.document;
        if (document === undefined) { throw new Error('No readable script axes were found.'); }
        this.internalLibrary.recordDuration(item.associationId, document.durationMs / 1000);
        item.durationSeconds = document.durationMs / 1000; this.playlist.durationSeconds = item.durationSeconds;
        this.engine.beginInternalResource(item.associationId);
        for (const event of events) {
          if (event.kind === 'duration') { this.engine.acceptDurationMessage(item.durationSeconds, systemDateTime.getUptime(systemDateTime.TimeType.STARTUP, false)); }
          else if (event.kind === 'position') { this.engine.acceptInternalPosition(event.value, event.forceSeek); }
          else if (event.kind === 'load') {
            let bindings: AxisScriptBinding[] = [];
            for (const source of selection.axisSources) { bindings = bindings.concat(this.engine.resources(source.document, source.file.uri, source.file.name)); }
            this.engine.loadInternalBindings(document, bindings); this.document = document; this.fileName = selection.selectedFiles.map(file => file.name).join(' + ');
          } else if (event.kind === 'speed') { this.engine.setSpeed(event.value); }
          else if (event.kind === 'playing') { this.engine.acceptInternalPlaying(event.value === 1); }
        }
        this.engine.acceptInternalPlaying(this.playlist.isPlaying);
        this.internalError = ''; this.status = this.playlist.isPlaying ? 'Internal playing · new source requires explicit output arm' : 'Internal script loaded · press Play';
      } catch (error) {
        if (current()) {
          this.playlist.setPlaying(false); this.playlist.drainEvents(); this.engine.clearScripts(); this.engine.useInternalSource();
          this.document = new FunscriptDocument([]); this.fileName = 'No readable script'; this.internalError = (error as Error).message;
        }
      } finally {
        if (request === this.internalRequest) {
          if (shortcut !== null && !this.keyboard.isDispatchCurrent(shortcut)) {
            this.playlist.setPlaying(false); this.playlist.drainEvents(); this.internalAwaitingReload = this.playlist.currentItem !== null;
            this.engine.clearScripts(); this.engine.useInternalSource(); this.document = new FunscriptDocument([]);
            this.fileName = 'Cancelled action · press Play to reload';
          }
          this.internalLoading = false; this.internalLastTick = systemDateTime.getUptime(systemDateTime.TimeType.STARTUP, false); this.sync(); }
      }
      return;
    }
    if (this.internalAwaitingReload) {
      if (events.some(event => event.kind === 'reset')) { this.internalAwaitingReload = false; } else { return; }
    }
    for (const event of events) {
      if (event.kind === 'reset') {
        if (shortcut === null) { this.cancelKeyboardWork(); }
        this.output.stop(); this.cancelMediaSeek(); this.engine.clearScripts(); this.engine.useInternalSource();
        this.document = new FunscriptDocument([]); this.fileName = this.playlist.currentItem === null ? 'No script selected' : 'Script is unreadable';
      } else if (event.kind === 'duration') { this.engine.acceptDurationMessage(event.value, systemDateTime.getUptime(systemDateTime.TimeType.STARTUP, false)); }
      else if (event.kind === 'position') {
        if (event.forceSeek && !alreadySeeking) {
          this.engine.beginSeek(systemDateTime.getUptime(systemDateTime.TimeType.STARTUP, false)); this.output.beginSourceSeek();
        }
        this.engine.acceptInternalPosition(event.value, event.forceSeek);
        if (event.forceSeek) { this.engine.acceptInternalPlaying(this.playlist.isPlaying); }
      } else if (event.kind === 'playing') { this.engine.acceptInternalPlaying(event.value === 1); }
      else if (event.kind === 'speed') { this.engine.setSpeed(event.value); }
    }
  }
  async playlistAction(action: PlaylistPanelAction, shortcut: ShortcutDispatch | null = null): Promise<void> {
    if (shortcut === null) { this.cancelKeyboardWork(); }
    else if (!this.keyboard.isDispatchCurrent(shortcut)) { return; }
    if (action.kind === 'cancel') {
      this.cancelRuntimeControl(); this.disconnectInternal(); this.cancelLibrary(); this.cancelMediaSeek(); this.output.stop();
      this.openVideoRequest++; this.pendingVideoUri = ''; this.pairOpening = false; this.openingVideo = false; this.importing = false;
      this.videoMode = false; this.videoReady = false; this.setVideoFullscreen(false); this.video.release();
      this.engine.clearScripts(); this.engine.useExternalClock(false); this.document = new FunscriptDocument([]);
      this.sync(); return;
    }
    const context = this.playlistContext();
    if (context.readOnly || context.busy) { return; }
    try {
      if (action.kind === 'append') {
        if (action.index !== -1 && (!Number.isInteger(action.index) || action.index < 0 || action.index >= context.managedItems.length)) { return; }
        const items = action.index === -1 ? context.managedItems : context.managedItems.filter((_item, index) => index === action.index);
        if (!this.internalConnected || items.length === 0) { return; }
        if (this.playlist.playlistItems.length + items.length > PlaybackConfiguration.MAX_ASSOCIATIONS) { throw new Error('A queue can contain at most 256 scripts.'); }
        this.internalBusy = true; const request = this.internalRequest;
        const current = (): boolean => request === this.internalRequest && this.internalConnected && this.foreground && this.viewActive;
        await this.prepareInternalItems(items, current); if (!current()) { return; }
        this.playlist.append(items); this.internalBusy = false; this.persistInternalPlaylist();
        await this.applyInternalEvents(this.playlist.drainEvents(), false, shortcut); this.sync(); return;
      }
      const result = PlaylistPresentation.dispatch(action, this.playlist, this.engine.mediaLoop, this.engine.autoSkip, context);
      if (!result.accepted) { return; }
      if (result.hostRequest === 'connect') { await this.connectInternal(); return; }
      if (result.hostRequest === 'refresh') { await this.scanDownloads(); return; }
      if (result.hostRequest === 'autoConnect' || result.hostRequest === 'loadAdditionalScripts') {
        const settings = this.engine.playbackConfiguration();
        if (result.hostRequest === 'autoConnect') { settings.internalAutoConnect = action.enabled; }
        else { settings.loadAdditionalScripts = action.enabled; }
        this.engine.changePlaybackConfiguration(settings);
        if (result.hostRequest === 'loadAdditionalScripts' && this.internalConnected) {
          this.internalBusy = true; this.internalLoading = true; this.output.stop(); this.engine.pause();
          const request = ++this.internalRequest;
          const current = (): boolean => request === this.internalRequest && this.internalConnected && this.foreground && this.viewActive && (shortcut === null || this.keyboard.isDispatchCurrent(shortcut));
          await this.prepareInternalItems(this.playlist.playlistItems, current);
          if (!current()) {
            if (request === this.internalRequest) {
              this.internalBusy = false; this.internalLoading = false; this.internalAwaitingReload = true;
              this.engine.clearScripts(); this.engine.useInternalSource(); this.document = new FunscriptDocument([]); this.sync();
            }
            return;
          }
          this.internalBusy = false; this.internalLoading = false; this.playlist.reloadCurrent();
        }
      }
      this.persistInternalPlaylist(); await this.applyInternalEvents(this.playlist.drainEvents(), false, shortcut);
      if (result.seekSeconds !== null) { this.seekTransport(result.seekSeconds * 1000, true); }
    } catch (error) { this.internalBusy = false; this.internalLoading = false; this.internalError = (error as Error).message; }
    this.sync();
  }
  async playPause(shortcut: ShortcutDispatch | null = null): Promise<void> {
    if (this.confirmationCloseUnconfirmed) { return; }
    if (shortcut === null) { this.cancelKeyboardWork(); }
    else if (!this.keyboard.isDispatchCurrent(shortcut)) { return; }
    if (this.runtimeBusy || this.importing || this.openingVideo || this.libraryBusy || this.internalBusy || this.internalLoading) { return; }
    if (this.deoVrActive) { await this.setDeoVrPlaying(!this.deoVrPlaying); return; }
    if (!this.videoMode && !this.internalConnected) { this.status = 'Connect Internal before playing a script.'; return; }
    if (this.resumeSeekRequest >= 0) { this.cancelMediaSeek(); this.pauseTransport(); this.sync(); return; }
    if (this.internalConnected && !this.videoMode) {
      if (this.internalAwaitingReload) {
        this.playlist.reloadCurrent(); this.playlist.setPlaying(true); await this.applyInternalEvents(this.playlist.drainEvents(), false, shortcut); this.sync(); return;
      }
      if (!this.playlist.isPlaying && !this.engine.admitInternalPlay()) { return; }
      if (!this.playlist.isPlaying && this.engine.snapshot().state === 'stopped') { this.playlist.seek(this.playlist.positionSeconds); }
      this.playlist.setPlaying(!this.playlist.isPlaying); await this.applyInternalEvents(this.playlist.drainEvents(), false, shortcut); this.sync(); return;
    }
    if (this.videoMode) {
      if (this.playing) { this.mediaPlayIntent = false; await this.video.pause(); }
      else if (this.videoState === 'completed' || (this.durationMs > 0 && this.positionMs >= this.durationMs)) {
        this.mediaPlayIntent = true; this.seekTransport(0, true);
      } else if (this.engine.play()) { this.mediaPlayIntent = true; this.syncOutput(); await this.video.play(); }      this.syncOutput(); return;
    }
    if (this.playing) { this.engine.pause(); }
    else {
      if (this.positionMs >= this.durationMs) { this.engine.seek(0); }
      this.lastTick = systemDateTime.getUptime(systemDateTime.TimeType.STARTUP, false);
      this.engine.play();
    }
    this.sync();
  }
  stop(): void {
    this.videoActionEpoch++; this.videoActionPending = false; this.videoDragging = false;
    this.libraryPlayRequest = -1; this.libraryOpeningRevision = -1; this.screenRevision++;
    this.closeConfirmation();
    this.serialDiscovery.cancel();
    SerialDiagnosticSession.cancel(this.serialProbeOwner);
    SocketDiagnosticSession.cancel(this.diagnosticOwner);
    this.mediaSettingsRequest++;
    this.disconnectDeoVr();
    this.cancelKeyboardWork();
    this.cancelRuntimeControl(); this.cancelMediaSeek(); this.internalAutoConnectAttempted = true;
    const cancelledVideoOpen = this.openingVideo || this.importing || this.pairOpening || this.pendingVideoUri.length > 0 ||
      (this.videoMode && this.videoState === 'loading');
    if (cancelledVideoOpen) {
      this.openVideoRequest++; this.pendingVideoUri = ''; this.pairOpening = false; this.openingVideo = false; this.importing = false;
      this.videoMode = false; this.videoReady = false; this.setVideoFullscreen(false); this.video.release();
      this.engine.clearScripts(); this.engine.useExternalClock(false); this.document = new FunscriptDocument([]);
      this.fileName = 'Stopped · source opening cancelled';
    }
    const cancelledLoad = this.internalLoading;
    this.internalRequest++; this.internalBusy = false; this.internalLoading = false;
    if (cancelledLoad && this.internalConnected) {
      // The model may already select B while A is still published. Never clock
      // A under B's identity after Stop; only explicit Play may reload B.
      this.internalAwaitingReload = this.playlist.currentItem !== null; this.engine.clearScripts(); this.engine.useInternalSource();
      this.document = new FunscriptDocument([]); this.fileName = 'Stopped · press Play to reload the selected script';
    }
    if (this.internalConnected) { this.playlist.setPlaying(false); this.playlist.seek(0); this.playlist.drainEvents(); }
    this.output.stop();
    if (this.videoMode) { this.pauseTransport(); this.video.seek(0); }
    this.engine.stop();
    this.status = 'Stopped · output disarmed';
    this.sync();
  }
  cancelRuntimeControl(): void {
    if (this.runtimeBusy) { this.runtimeMessage = '操作已取消，发送保持停止；重新开始需要明确操作。'; }
    this.runtimeControlRequest++; this.runtimeBusy = false;
  }
  async resetRuntimeSafely(): Promise<void> { await this.runRuntimeControl(false); }
  async startStandaloneMotion(): Promise<void> { await this.runRuntimeControl(true); }
  async startManualPreview(): Promise<void> { await this.runRuntimeControl(false, true); }
  private async closeOutputsForManualPreview(): Promise<void> {
    const targets: OutputCoordinator[] = [];
    for (const id of this.output.ids()) {
      const target = this.output.get(id); if (target !== null) { targets.push(target); }
    }
    // Close every old connection before granting the new volatile source. A later
    // Apply must not close an old target after manual admission has been granted.
    await Promise.all(targets.map(target => target.disconnect()));
    for (const target of targets) {
      const status = target.status();
      if (target.isBusy() || (status !== null && (!status.closeConfirmed || status.connection !== 'disconnected'))) {
        throw new Error('旧输出连接关闭未确认；手动预览保持停止，请处理目标错误后重试。');
      }
    }
  }
  private async runRuntimeControl(startMotion: boolean, startManual: boolean = false): Promise<void> {
    if (this.confirmationCloseUnconfirmed) { return; }
    this.cancelKeyboardWork();
    if (this.runtimeBusy || !this.viewActive || !this.foreground) { return; }
    if (startMotion && (this.settingsReadOnly || this.recoveryRequired || this.engine.standaloneMotionAxes().length === 0)) {
      this.runtimeMessage = '先为启用轴选择Motion，打开暂停更新与无脚本更新；设置只读/待恢复时不能启动。'; return;
    }
    if (startManual && (this.settingsReadOnly || this.recoveryRequired || this.engine.hasPendingProfileChanges() || this.engine.manualPreviewAxes().length === 0)) {
      this.runtimeMessage = '先启用目标轴的手动过渡，并取消选择或旁路Motion；只读/待恢复/待生效设备不能启动。'; return;
    }
    this.stop(); this.disconnectInternal(); this.cancelLibrary(); this.output.stop();
    if (!await this.disconnectDeoVr()) { this.runtimeMessage = this.deoVrError; return; }
    this.openVideoRequest++; this.pendingVideoUri = ''; this.pairOpening = false; this.openingVideo = false; this.importing = false;
    this.videoMode = false; this.videoReady = false; this.setVideoFullscreen(false); this.videoOnly = false;
    const request = ++this.runtimeControlRequest; this.runtimeBusy = true;
    const current = (): boolean => request === this.runtimeControlRequest && this.viewActive && this.foreground;
    this.runtimeMessage = startManual ? '发送已停止；正在关闭媒体和全部旧输出连接…' : '发送已停止；正在关闭媒体并清理运行状态…';
    // Revoke the old native generation before awaiting its asynchronous close.
    try {
      const cleanup = Promise.all([this.video.release(), startManual ? this.closeOutputsForManualPreview() : Promise.resolve()]);
      if (startMotion || startManual) { this.engine.clearScripts(); this.engine.useExternalClock(false); }
      else { this.engine.resetRuntime(); }
      this.document = new FunscriptDocument([]); this.fileName = 'No script selected'; this.sync();
      await cleanup; if (!current()) { return; }
      if (startManual) { this.syncOutput(); } // Adopt confirmed old closures before the new preview exists.
      if ((startMotion || startManual) && (this.settingsReadOnly || this.recoveryRequired || this.engine.hasPendingProfileChanges())) { throw new Error('启动期间设置变为只读、待恢复或设备配置已改变。'); }
      if (this.video.snapshot().failure.length > 0) { throw new Error(this.video.snapshot().failure); }
      if (this.engine.fault().length > 0) { throw new Error(this.engine.fault()); }
      if (startManual) {
        this.engine.startManualPreview();
        this.runtimeMessage = '手动预览已启动，等待 Value Set/Offset。接着为设备应用当前配置、固定更新、独立“暂停手动过渡”权限，再明确 Arm 待命；Stop/后台/断连后需重新启动。';
      } else if (startMotion) {
        this.engine.startStandaloneMotion();
        this.runtimeMessage = '独立Motion预览运行中（无媒体/暂停时钟）。发送需另行Apply/Connect、允许暂停Motion并明确Arm。';
      } else {
        this.runtimeMessage = '运行状态已重建并停止；参数保留，媒体与Looping已清空。请重新选择源或启动独立Motion，再明确连接/启用输出。';
      }
      this.status = this.runtimeMessage;
    } catch (error) {
      if (current()) { this.engine.stop(); this.output.stop(); this.runtimeMessage = '运行操作未完成，发送保持关闭：' + (error as Error).message; this.status = this.runtimeMessage; }
    } finally { if (current()) { this.runtimeBusy = false; this.sync(); } }
  }
  cancelLibrary(): void {
    this.cancelManagedReload();
    this.libraryRequest++; this.libraryBusy = false; this.libraryPicking = false;
    this.libraryMessage = 'Cancelled · partial results remain available';
  }
  updateLibrary(files: LibraryFile[]): void {
    const entries = files.map((file: LibraryFile) => new ResourceFileEntry(file.uri, file.name, file.relativePath));
    this.mediaCatalog = entries;
    this.managedMotionScripts = entries.filter(file => file.name.toLowerCase().endsWith('.funscript')).map(file => new ManagedMotionScriptResource(file.uri, file.name));
    this.libraryItems = ResourceLibrary.build(entries, this.engine.activeRegistry().profile).items.filter((item: ResourceLibraryItem) => item.videos.length > 0);
  }
  libraryProgress(progress: LibraryScanProgress, request: number): void {
    if (request !== this.libraryRequest || !this.viewActive) { return; }
    this.updateLibrary(progress.files);
    this.libraryMessage = 'Scanned ' + progress.visited + ' entries · ' + progress.skipped + ' skipped';
  }
  async scanDownloads(): Promise<void> {
    this.cancelKeyboardWork();
    if (this.runtimeBusy) { return; }
    if (!this.viewActive || !this.foreground || this.libraryBusy || this.openingVideo || this.importing) { return; }
    const retiringRequest = ++this.libraryRequest; this.libraryBusy = true;
    if (this.deoVrActive || !RemoteMediaSession.allClosed()) {
      const closed = await this.disconnectDeoVr();
      if (retiringRequest !== this.libraryRequest) { return; }
      if (!closed || !this.viewActive || !this.foreground) { this.libraryBusy = false; this.libraryMessage = this.deoVrError; return; }
    }
    this.disconnectInternal(); this.cancelMediaSeek(); this.pauseTransport(); this.libraryBusy = true; this.libraryPicking = false;
    this.libraryLimit = 20; this.manualItemId = ''; this.libraryLoaded = false;
    this.updateLibrary([]); this.internalLibrary.replace([], this.engine.activeRegistry().profile); this.playlist.refresh(); this.libraryRoot = '';
    this.libraryMessage = 'Preparing Download media folder…';
    const request = ++this.libraryRequest;
    const current = (): boolean => request === this.libraryRequest && this.viewActive && this.foreground;
    // Refresh invalidates the old source, not just its catalog. This also closes an
    // already-open descriptor if its pathname was deleted or permissions changed.
    this.openVideoRequest++; this.pendingVideoUri = ''; this.videoMode = false;
    this.videoReady = false; this.setVideoFullscreen(false); this.videoOnly = false;
    this.videoName = 'No video selected'; this.videoState = 'idle';
    this.engine.clearScripts(true); this.document = new FunscriptDocument([]);
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
      await this.restoreLoopingScripts(current);
      if (!current()) { return; }
      this.internalLibrary.replace(this.mediaCatalog, this.engine.activeRegistry().profile);
      this.restoreInternalPlaylist(); this.playlist.refresh(); this.syncPlaylist();
    } catch (error) {
      if (current()) { this.libraryMessage = 'Cannot scan Download media folder: ' + (error as Error).message; }
    } finally {
      if (request === this.libraryRequest) {
        this.libraryBusy = false;
        if (this.libraryLoaded && !this.internalAutoConnectAttempted) {
          this.internalAutoConnectAttempted = true;
          if (this.engine.mediaSourceConfiguration().selectedSource === 'internal' && this.engine.playbackConfiguration().internalAutoConnect && !this.settingsReadOnly && !this.recoveryRequired) { this.connectInternal(); }
        }
        this.syncPlaylist();
      }
    }
  }
  async refreshLibrary(): Promise<void> { await this.scanDownloads(); }
  showLibrary(): void {
    this.selectScreen('library');
    this.setVideoFullscreen(false); this.showResources = true; this.resourceFocus = true; this.sourceScroller.scrollEdge(Edge.Top);
    if (this.workspaceTool === 'media') { this.settingsScroller.scrollEdge(Edge.Top); } else {  }
    if (!this.libraryLoaded) { this.scanDownloads(); }
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
  async openLibraryItem(item: ResourceLibraryItem, manual: boolean = false, originalSearch: boolean = false): Promise<number> {
    if (this.runtimeBusy || this.libraryBusy || this.openingVideo || this.importing) { return -1; }
    const video = manual ? item.videos.find((value: ResourceFileEntry) => value.uri === this.manualVideoUri) : item.video;
    if (video === undefined) { this.libraryMessage = 'Choose one video explicitly.'; return -1; }
    const retiringRequest = ++this.openVideoRequest; this.openingVideo = true;
    if (this.deoVrActive || !RemoteMediaSession.allClosed()) {
      const closed = await this.disconnectDeoVr();
      if (retiringRequest !== this.openVideoRequest) { return -1; }
      if (!closed || !this.viewActive || !this.foreground) { this.openingVideo = false; this.status = this.deoVrError; return -1; }
    }
    this.rememberLocalSource();
    // A valid selection owns the next source immediately. Any matching/read error
    // must leave no previous native source or script that can accidentally resume.
    this.disconnectInternal(); this.cancelMediaSeek(); this.pendingVideoUri = ''; this.pauseTransport(); this.videoReady = false;
    this.openingVideo = true; this.importing = true; this.pairOpening = true;
    this.observedVideo = null; this.videoActionEpoch++; this.videoActionPending = false; this.videoDragging = false;
    this.videoMode = true; this.videoOnly = false; this.videoName = video.name;
    this.activeVideoFile = new ResourceFileEntry(video.uri, video.name, video.relativePath);
    const request = ++this.openVideoRequest;
    const current = (): boolean => request === this.openVideoRequest && this.viewActive && this.foreground;
    try {
      await this.video.release();
      if (!current()) { return -1; }
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
          catch (error) { if (!current()) { return -1; } rejected++; continue; }
        }
        if (!current()) { return -1; }
        if (candidates.length + inputs.length > 64) { throw new Error('More than 64 archive/script candidates. Narrow the selection.'); }
        for (const input of inputs) {
          textBudget += input.contents.length * 2;
          if (textBudget > 8 * 1024 * 1024) { throw new Error('Candidate text budget exceeded. Narrow the selection.'); }
          try {
            const candidate = ResourceLibrary.parseCandidate(input.contents, input.file, this.engine.activeRegistry().profile);
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
        const selection = ResourceLibrary.selectDocuments(video.name, candidates, this.engine.activeRegistry().profile);
        const parsed = selection.document;
        if (parsed === undefined) { throw new Error('No readable matching script. Check the files or choose mapping.'); }
        if (!current()) { return -1; }
        this.document = parsed;
        let bindings: AxisScriptBinding[] = [];
        for (const source of selection.axisSources) { bindings = bindings.concat(this.engine.resources(source.document, source.file.uri, source.file.name)); }
        this.engine.loadBindings(parsed, bindings);
        this.fileName = selection.selectedFiles.map((value: ResourceFileEntry) => value.name).join(' + ');
        this.videoOnly = false;
      }
      this.engine.useExternalClock(true); this.selectedAxis = 0;
      this.videoMode = true; this.videoReady = false; this.videoName = video.name;
      this.pendingVideoUri = video.uri; this.status = this.videoOnly ? 'Video only · no matching script · press Play' :
        'Pair loaded · press Play' + (rejected > 0 ? ' · ' + rejected + ' unreadable/invalid scripts skipped' : '');
      this.openPendingVideo(); this.sync(); return request;
    } catch (error) {
      if (current()) {
        this.pendingVideoUri = ''; this.videoReady = false; this.videoState = 'error';
        this.engine.clearScripts(); this.document = new FunscriptDocument([]);
        this.engine.useExternalClock(true); this.selectedAxis = 0; this.fileName = 'No matching script';
        this.sync();
        this.status = 'Pair could not open: ' + (error as Error).message + ' Check the files and refresh.';
      }
      return -1;
    } finally { if (request === this.openVideoRequest) { this.openingVideo = false; this.importing = false; this.pairOpening = false; } }
  }

  pauseTransport(): void {
    this.cancelMediaSeek();
    if (this.internalConnected) { this.playlist.setPlaying(false); this.playlist.drainEvents(); }
    this.output.stop();
    if (this.deoVrActive) { const owner = this.deoVrRequest; const initial = this.remoteSource().snapshot(); const command = ++this.deoVrControlRequest; this.engine.requestDeoVrPause(); this.remoteSource().playPause(false).catch(() => { if (owner === this.deoVrRequest && command === this.deoVrControlRequest && this.deoVrActive && initial.generation === this.remoteSource().snapshot().generation && initial.resourceRevision === this.remoteSource().snapshot().resourceRevision) { this.output.stop(); this.engine.stop(); } }); }
    else { this.engine.pause(); }
    if (this.videoMode) { this.video.pause(); }
  }
  seekTransport(position: number, preservePlaying: boolean = true): void {
    if (this.runtimeBusy || this.importing || this.openingVideo || this.libraryBusy || this.internalLoading || !Number.isFinite(position)) { return; }
    if (this.deoVrActive) { this.seekDeoVr(position); return; }
    const previousSeek = this.engine.sourceSeekSnapshot();
    const retainedResume = this.resumeSeekRequest >= 0 && previousSeek !== null && previousSeek.requestId === this.resumeSeekRequest && previousSeek.status !== 'cancelled';
    if (this.videoMode && !this.videoReady && (previousSeek === null || previousSeek.status !== 'pending')) { return; }
    const resume = preservePlaying && (this.playing || retainedResume || (this.videoMode && this.mediaPlayIntent && (this.videoState === 'completed' || (this.durationMs > 0 && this.positionMs >= this.durationMs))));
    const now = systemDateTime.getUptime(systemDateTime.TimeType.STARTUP, false);
    if (this.videoMode || this.internalConnected) {
      const request = this.engine.beginSeek(now);
      this.resumeSeekRequest = resume && request >= 0 ? request : -1;
      this.output.beginSourceSeek();
      if (this.videoMode) { this.video.seek(position); }
      else { this.playlist.seek(Math.max(0, Math.min(this.durationMs, position)) / 1000); this.applyInternalEvents(this.playlist.drainEvents(), true); this.finishMediaSeek(); }
    } else { this.output.stop(); this.engine.seek(position); }
    this.sync();
  }
  cancelMediaSeek(): void { this.resumeSeekRequest = -1; this.mediaPlayIntent = false; this.engine.cancelSourceSeek(); }
  finishMediaSeek(): void {
    if (this.resumeSeekRequest < 0) { return; }
    const seek = this.engine.sourceSeekSnapshot();
    if (seek === null || seek.requestId !== this.resumeSeekRequest || seek.status === 'cancelled' || !this.foreground || !this.viewActive) {
      this.resumeSeekRequest = -1; this.mediaPlayIntent = false; return;
    }
    if (seek.status !== 'confirmed') { return; }
    this.resumeSeekRequest = -1;
    if (this.videoMode && this.videoReady) { this.mediaPlayIntent = this.engine.play(); if (this.mediaPlayIntent) { this.video.play(); } }
    else if (this.internalConnected) { this.engine.acceptInternalPlaying(this.playlist.isPlaying); }
  }
  processMediaSeekRequests(): void {
    const requests = this.engine.drainMediaSeekRequests();
    if (requests.length > 0) { this.seekTransport(requests[requests.length - 1], true); }
  }
  videoSnapshot(snapshot: MediaClockSnapshot): void {
    if (!this.viewActive || !this.videoMode) { return; }
    if (this.observedVideo !== null && snapshot.generation < this.observedVideo.generation) { return; }
    if (this.observedVideo === null || snapshot.generation !== this.observedVideo.generation) { this.videoActionEpoch++; this.videoActionPending = false; }
    this.observedVideo = snapshot;
    const wasReady = this.videoReady;
    this.videoReady = snapshot.ready && snapshot.valid && !snapshot.seeking;
    this.videoState = snapshot.state;
    this.engine.acceptNativeSnapshot(snapshot);
    this.finishMediaSeek();
    if (snapshot.rate >= 0.125 && snapshot.rate <= 4) { this.engine.setSpeed(snapshot.rate); }
    if (this.videoReady && !wasReady) { this.video.setVolume(this.volume); }
    if (snapshot.failure.length > 0) { this.libraryPlayRequest = -1; this.status = snapshot.failure; }
    else if (this.videoReady && !wasReady) { this.status = this.videoOnly ? 'Video only · no matching script · press Play' : 'Video ready · press Play'; }
    this.sync(); this.startLibraryPlayback();
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
    this.libraryPlayRequest = -1; this.libraryOpeningRevision = -1; this.screenRevision++; this.currentScreen = 'library';
    this.cancelKeyboardWork();
    this.cancelMediaSeek(); this.output.stop();
    this.openVideoRequest++; this.pendingVideoUri = ''; this.videoMode = false; this.videoReady = false; this.setVideoFullscreen(false); this.videoOnly = false;
    this.video.release(); this.engine.clearScripts(); this.document = new FunscriptDocument([]); this.engine.useExternalClock(false);
    this.lastTick = systemDateTime.getUptime(systemDateTime.TimeType.STARTUP, false);
    this.status = 'Local video closed · connect Internal for script playback'; this.sync();
  }
  workspaceLayout(): VideoWorkspaceLayout {
    const layout = applicationWorkspaceLayout(this.widthVp, this.heightVp, this.currentScreen, this.videoMode && (this.currentScreen !== 'workspace' || !this.workspacePreviewCollapsed), this.videoFullscreen, this.generalConfiguration.appOrientation, this.videoFloating);
    if (this.videoFloating && !this.videoFullscreen && this.currentScreen !== 'player' && layout.video.width > 0) {
      const bounds = new VideoDragBounds(this.widthVp, this.heightVp, layout.video.width, layout.video.height, layout.headerHeight);
      layout.video.x = bounds.x(this.floatingXRatio); layout.video.y = bounds.y(this.floatingYRatio);
    }
    return layout;
  }
  videoPictureHeight(): number {
    return this.videoFullscreen ? this.workspaceLayout().video.height : Math.max(1, this.workspaceLayout().video.height - this.workspaceLayout().controlsHeight);
  }
  videoCommand(): string {
    return videoPlaybackIntent(this.playing, this.mediaPlayIntent, this.videoReady,
      this.videoState === 'completed' || (this.durationMs > 0 && this.positionMs >= this.durationMs),
      this.viewActive && this.foreground && this.videoMode, this.videoActionPending,
      this.runtimeBusy || this.importing || this.openingVideo || this.libraryBusy || this.sessionFault.length > 0);
  }
  videoCanToggle(): boolean { return this.videoCommand() !== 'blocked'; }
  transportPlayEnabled(): boolean {
    return this.videoMode ? this.videoCanToggle() :
      this.foreground && !this.importing && !this.openingVideo && !this.libraryBusy &&
        (this.deoVrActive ? this.deoVrConnected && !this.deoVrBusy : this.internalConnected && this.playlist.currentItem !== null && Number.isFinite(this.playlist.durationSeconds));
  }
  videoPlaybackStatus(): string {
    if (this.videoActionPending) { return '正在处理播放操作…'; }
    if (this.openingVideo || this.importing) { return '正在准备视频…'; }
    if (this.sessionFault.length > 0 || this.videoState === 'error') { return '播放故障 · 输出已停止'; }
    if (!this.videoReady) { return '视频未就绪'; }
    if (this.libraryBusy && !this.playing) { return '正在读取列表，暂不能开始播放'; }
    return this.videoFloating ? '拖动移动 · 单击暂停/继续' : this.playing ? '单击暂停' : '单击播放';
  }
  async videoPlaybackAction(): Promise<void> {
    const command = this.videoCommand();
    if (command === 'blocked') { return; }
    this.cancelVideoChromeTimer(); this.videoControlsVisible = true;
    const epoch = ++this.videoActionEpoch; this.videoActionPending = true;
    try {
      if (command === 'pause') {
        this.cancelMediaSeek(); this.pauseTransport(); await this.video.pause();
      } else if (command === 'replay') {
        // Explicit replay is one seek transaction; only real seekDone may resume.
        this.mediaPlayIntent = true; this.seekTransport(0, true);
      } else { await this.playPause(); }
    } catch (error) {
      if (epoch === this.videoActionEpoch) { this.output.stop(); this.engine.stop(); this.status = '播放操作失败，输出已停止：' + String(error); }
    } finally {
      if (epoch === this.videoActionEpoch) { this.videoActionPending = false; this.sync(); this.scheduleVideoChromeHide(); }
    }
  }
  videoGestureContext(): string {
    return this.screenRevision + ':' + this.openVideoRequest + ':' + this.surfaceId + ':' + this.widthVp + ':' + this.heightVp + ':' + this.videoFloating + ':' + this.videoFullscreen;
  }
  videoGestureHandler(kind: string): (event: GestureEvent) => void {
    const context = this.videoGestureContext();
    return (event: GestureEvent): void => {
      if (!this.viewActive || !this.foreground || !this.videoMode || context !== this.videoGestureContext()) { return; }
      const now = systemDateTime.getUptime(systemDateTime.TimeType.STARTUP, false);
      if (kind === 'tap') {
        if (!this.videoDragging && now >= this.videoTapBlockedUntil) { void this.videoPlaybackAction(); }
        return;
      }
      if (kind === 'start') {
        this.videoDragging = this.videoFloating && !this.videoFullscreen && this.currentScreen !== 'player';
        if (this.videoDragging) { this.videoDrag.begin(this.workspaceLayout().video.x, this.workspaceLayout().video.y); }
      }
      if (this.videoDragging && (kind === 'start' || kind === 'update' || kind === 'end')) {
        const pan = event as PanGestureEvent;
        this.moveFloatingVideo(pan.offsetX, pan.offsetY);
      }
      if (kind === 'end' || kind === 'cancel') {
        this.videoDragging = false; this.videoDrag.cancel(); this.videoTapBlockedUntil = now + 180;
      }
    };
  }
  moveFloatingVideo(offsetX: number, offsetY: number): void {
    if (!this.videoDragging || !Number.isFinite(offsetX) || !Number.isFinite(offsetY)) { return; }
    const layout = this.workspaceLayout();
    const bounds = new VideoDragBounds(this.widthVp, this.heightVp, layout.video.width, layout.video.height, layout.headerHeight);
    if (this.videoDrag.move(offsetX, offsetY, bounds)) { this.floatingXRatio = this.videoDrag.xRatio; this.floatingYRatio = this.videoDrag.yRatio; }
  }
  contentPadding(): number { return UiStyle.contentInset(this.widthVp); }
  /** Tablet/PC landscape keeps the library as a readable column instead of a
   * full-width stretched list; phones keep their normal gutter. */
  libraryContentInset(): number {
    const maximum = 980;
    return Math.max(this.contentPadding(), (this.widthVp - maximum) / 2);
  }
  scriptPaneWidth(): number {
    return Math.max(1, this.inspectorWidth() - 2 * this.contentPadding());
  }
  mediaToolWidth(): string { return UiStyle.toolbarItemWidth(this.scriptPaneWidth(), 6); }
  axisToolWidth(): string { return UiStyle.toolbarItemWidth(this.scriptPaneWidth(), 9); }
  compactControls(): boolean {
    return this.generalConfiguration.uiDensity === 'compact';
  }
  resizeWorkspace(width: number, height: number): void {
    this.videoDragging = false;
    // Geometry retires callbacks, never commits drafts, seeks or reopens a source.
    if ((Number.isFinite(width) && width > 0 && width !== this.widthVp) ||
      (Number.isFinite(height) && height > 0 && height !== this.heightVp)) { this.retireSettingsDrafts(); }
    if (Number.isFinite(width) && width > 0) { this.widthVp = width; }
    if (Number.isFinite(height) && height > 0) { this.heightVp = height; }
  }
  presentationChanged(result: WindowPresentationResult): void {
    if (!this.viewActive) { return; }
    this.presentationMode = result.mode; this.presentationReason = result.reason;
    this.presentationRestorePending = result.restorationPending;
  }
  cancelVideoChromeTimer(): void {
    this.videoChromeEpoch++;
    if (this.videoChromeTimer >= 0) { clearTimeout(this.videoChromeTimer); this.videoChromeTimer = -1; }
  }
  scheduleVideoChromeHide(): void {
    this.cancelVideoChromeTimer();
    if (!this.videoFullscreen || !this.videoControlsVisible) { return; }
    const epoch = this.videoChromeEpoch;
    this.videoChromeTimer = setTimeout(() => {
      if (epoch !== this.videoChromeEpoch || !this.viewActive || !this.foreground || !this.videoFullscreen) { return; }
      this.videoChromeTimer = -1;
      if (this.playing && !this.openingVideo && this.sessionFault.length === 0) { this.videoControlsVisible = false; }
    }, 3500);
  }
  setVideoFloating(value: boolean): void {
    if (!this.viewActive || !this.foreground || !this.videoMode || this.videoFullscreen) { return; }
    if (value !== this.videoFloating) {
      this.retireSettingsDrafts(); this.videoFloating = value; this.videoDragging = false;
      if (!value) {
        if (this.currentScreen === 'library') { this.sourceScroller.scrollEdge(Edge.Top); }
        else { this.settingsScroller.scrollEdge(Edge.Top); }
      }
    }
  }
  setVideoFullscreen(value: boolean): void {
    this.cancelVideoChromeTimer();
    if (value && this.videoMode) { this.selectScreen('player'); }
    this.videoFullscreen = value && this.videoMode && this.foreground && this.viewActive;
    this.videoControlsVisible = !this.videoFullscreen; this.videoFloating = false; this.videoDragging = false;
    // The listener owns observed diagnostics. Never let a late promise rewrite
    // the current page-layout intent or media state.
    NativeWindowPresentation.requestForOwner(this.presentationOwner, this.videoFullscreen);
  }
  onBackPress(): boolean {
    if (this.videoFullscreen || this.presentationRestorePending) { this.setVideoFullscreen(false); return true; }
    if (this.currentScreen === 'workspace' && this.workspaceTool === 'output' && this.outputPage !== 'list') {
      this.outputPage = 'list'; this.showAddOutput = false; return true;
    }
    if (this.currentScreen !== 'library') { this.showLibrary(); return true; }
    return false;
  }
  exitFullscreenWithKey(keyCode: number): boolean {
    if (keyCode !== KeyCode.KEYCODE_ESCAPE || (!this.videoFullscreen && !this.presentationRestorePending)) { return false; }
    this.setVideoFullscreen(false); return true;
  }
  shortcutOutputOptions(): SettingsOption[] {
    return this.outputTargets.filter(target => target.kind === 'tcp' || target.kind === 'udp' || target.kind === 'webSocket').map(target => new SettingsOption(target.id,
      target.name + ' · ' + target.id + (target.removing ? '（移除中，不可执行）' : ' · ' + t(target.connection))));
  }
  shortcutScriptOptions(): SettingsOption[] {
    return this.mediaCatalog.filter(file => file.name.toLowerCase().endsWith('.funscript'))
      .map(file => new SettingsOption(file.relativePath, file.relativePath));
  }
  shortcutActionContextKey(): string {
    return this.libraryRequest + ':' + this.engine.activeRegistry().revision + ':' +
      this.outputTargets.map(target => target.id + ':' + target.generation + ':' + target.removing).join('|');
  }
  private materialStatusLabel(): string {
    if (this.materialRevision < 0) { return '标准清晰样式'; }
    const status = ImmersiveMaterialManager.status();
    if (status.state === 'available') { return '系统沉浸材质已请求 · 控件/菜单/弹窗 · 实际效果由设备和系统档位决定'; }
    if (status.state === 'visual-unconfirmed') { return '材质清理未确认 · 控件保留当前外观，尚未验证设备显示效果'; }
    if (status.state === 'loading' || status.state === 'uninitialized') { return '正在检查系统材质能力'; }
    return '标准清晰样式 · 当前系统未提供可用的沉浸材质';
  }
  private closeConfirmation(): void {
    const errorId: number = this.confirmationErrorId; this.confirmationErrorId = 0;
    if (this.confirmationOwner !== null) { this.confirmationOwner.close(); }
    this.confirmationController = undefined;
    if (errorId > 0) { this.errors.dismiss(errorId); }
  }
  private openConfirmation(request: ConfirmationRequest, errorId: number = 0): void {
    if (this.confirmationCloseUnconfirmed || !this.viewActive || !this.foreground || !request.isCurrent()) { return; }
    this.closeConfirmation();
    if (this.confirmationCloseUnconfirmed) { return; }
    this.cancelKeyboardWork();
    if (this.confirmationOwner === null) { this.confirmationOwner = new ConfirmationOwner(); }
    const pageOwner: number = this.keyboardOwner;
    const epoch: number = this.settingsDraftEpoch;
    const pageCurrent = (): boolean => this.viewActive && this.foreground && this.keyboardOwner === pageOwner && KeyboardInputSession.ownsListener(pageOwner);
    const current = (): boolean => pageCurrent() && epoch === this.settingsDraftEpoch && request.isCurrent();
    let controller: CustomDialogController | undefined = undefined;
    let closeUnconfirmed: boolean = false;
    const actions: ConfirmationActions = this.confirmationOwner.begin(current, request.onConfirm,
      (): void => this.stop(), pageCurrent, (): void => {
        if (this.confirmationController === controller) { this.confirmationController = undefined; }
        if (errorId > 0 && this.confirmationErrorId === errorId) {
          this.confirmationErrorId = 0; this.errors.dismiss(errorId);
          if (this.errorNoticeId === errorId) { this.errorNoticeId = 0; this.errorNoticeMode = ''; this.errorNoticeMessage = ''; }
        }
        if (controller !== undefined) {
          try { controller.close(); }
          catch (_) {
            closeUnconfirmed = true;
            // The native modal may still cover the page. Retire confirmation,
            // hard-stop now, and keep only this page's emergency action alive.
            if (pageCurrent()) {
              this.confirmationCloseUnconfirmed = true;
              this.stop(); this.updateKeyboardContext();
              this.status = '对话框关闭未确认；播放与发送已停止。请重启应用后再操作。';
            }
          }
        }
      });
    const displayedActions = new ConfirmationActions(actions.accept, actions.cancel, (): void => {
      if (closeUnconfirmed) { if (pageCurrent()) { this.stop(); } }
      else { actions.stop(); }
    });
    const width: number = this.widthVp; const height: number = this.heightVp;
    const options: CustomDialogControllerOptions = {
      builder: (): void => { this.confirmationContent(request, displayedActions, width, height); },
      cancel: (): void => { actions.cancel(); if (errorId > 0) { this.dismissErrorNotice(errorId); } },
      autoCancel: true, alignment: DialogAlignment.Center,
      width: ConfirmationDialogGeometry.width(width), customStyle: false,
      onWillDismiss: (action: DismissDialogAction): void => { actions.cancel(); action.dismiss(); if (errorId > 0) { this.dismissErrorNotice(errorId); } }
    };
    try {
      controller = new CustomDialogController(ImmersiveMaterialManager.decorateCustomDialog(options));
      this.confirmationController = controller; this.confirmationErrorId = errorId;
      controller.open();
    } catch (error) {
      this.closeConfirmation();
      this.status = '确认对话框无法打开，未执行操作。';
    }
  }
  private runtimeResetConfirmationHandler(): () => void {
    const epoch: number = this.settingsDraftEpoch;
    const current = (): boolean => this.viewActive && this.foreground && epoch === this.settingsDraftEpoch && !this.runtimeBusy;
    return (): void => { if (current()) { this.openConfirmation(new ConfirmationRequest('停止并重建运行状态？',
      '将关闭输出、清除当前媒体与Motion运行历史。保存参数不变，不会自动播放或Arm；之后需重新选择源或明确启动。',
      '停止并重建', true, current, (): void => { void this.resetRuntimeSafely(); })); } };
  }
  private settingsRecoveryConfirmationHandler(): () => void {
    const epoch: number = this.settingsDraftEpoch; const message: string = this.settingsMessage;
    const current = (): boolean => this.viewActive && this.foreground && epoch === this.settingsDraftEpoch &&
      this.recoveryRequired && !this.settingsReadOnly && this.settingsMessage === message;
    return (): void => { if (current()) { this.openConfirmation(new ConfirmationRequest('保留恢复后的设置？',
      message + '\n此操作允许保存恢复后的配置。取消会保留原文件和当前只读状态。', '使用恢复设置', true,
      current, (): void => { this.engine.acceptSettingsRecovery(); this.sync(); })); } };
  }
  private removeOutputConfirmationHandler(id: string, generation: number): () => void {
    const epoch: number = this.settingsDraftEpoch;
    const current = (): boolean => this.viewActive && this.foreground && !this.settingsReadOnly && !this.recoveryRequired &&
      epoch === this.settingsDraftEpoch && this.selectedOutputId === id &&
      this.outputTargets.some(target => target.id === id && target.generation === generation);
    return (): void => { if (current()) {
      this.openConfirmation(new ConfirmationRequest('停止并删除此输出？',
        '仅在原连接确认关闭后删除保存的配置。关闭失败会保留此目标，不能绕过隔离。', '停止并删除', true,
        current, (): void => { void this.removeOutputTarget(id, generation).then(() => {
          if (this.viewActive && !this.outputTargets.some(target => target.id === id)) { this.outputPage = 'list'; }
        }); }));
    } };
  }
  drawTrace(): void {
    this.drawTraceInto(this.canvas); this.drawTraceInto(this.playerCanvas);
  }
  drawTraceInto(context: CanvasRenderingContext2D): void {
    const w = context.width; const h = context.height;
    if (w <= 0 || h <= 0) { return; }
    context.clearRect(0, 0, w, h);
    context.fillStyle = '#FFFFFF'; context.fillRect(0, 0, w, h);
    const displayDocument = this.engine.displayDocument();
    if (this.heatDocument !== displayDocument || this.heatAxis !== this.selectedAxis ||
      this.heatDuration !== this.durationMs || this.heatCombined !== this.heatCombine) {
      this.heatBuckets = Heatmap.build(displayDocument, this.durationMs, displayDocument.axes.findIndex(axis => axis.name === this.axisNames[this.selectedAxis]), 333, this.heatCombine);
      this.heatDocument = displayDocument; this.heatAxis = this.selectedAxis;
      this.heatDuration = this.durationMs; this.heatCombined = this.heatCombine;
    }
    const buckets = this.heatBuckets;
    if (buckets.length > 1) {
      context.save(); context.beginPath();
      if (this.heatShowRange) {
        for (let i = 0; i < buckets.length; i++) {
          const value = buckets[i].rangeMax;
          const y = Math.max(0, Math.min(1, this.heatInvert ? value : 1 - value)) * h;
          if (i === 0) { context.moveTo(0, y); } else { context.lineTo(i / (buckets.length - 1) * w, y); }
        }
        for (let i = buckets.length - 1; i >= 0; i--) {
          const value = buckets[i].rangeMin;
          const y = Math.max(0, Math.min(1, this.heatInvert ? value : 1 - value)) * h;
          context.lineTo(i / (buckets.length - 1) * w, y);
        }
      } else { context.rect(0, 0, w, h); }
      context.closePath(); context.clip();
      for (let i = 0; i < buckets.length; i++) {
        context.fillStyle = buckets[i].color;
        context.fillRect(i / (buckets.length - 1) * w, 0, w / (buckets.length - 1) + 0.5, h);
      }
      context.restore();
    }
    const cursor = this.positionMs / Math.max(1, this.durationMs) * w;
    context.strokeStyle = UiStyle.ink; context.lineWidth = 1;
    context.beginPath(); context.moveTo(cursor, 0); context.lineTo(cursor, h); context.stroke();
  }
  @Builder
  heading(title: string, detail: string) {
    Column({ space: 6 }) {
      Row({ space: 8 }) {
        Column().width(4).height(22).borderRadius(2).backgroundColor(UiStyle.accent)
        Text(t(title)).fontSize(UiStyle.heading).fontWeight(FontWeight.Bold).fontColor(UiStyle.ink).layoutWeight(1)
      }.width('100%')
      Text(t(detail)).fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%')
    }.width('100%').margin({ bottom: 12 })
  }
  @Builder
  confirmationContent(request: ConfirmationRequest, actions: ConfirmationActions, width: number, height: number) {
    OwnedConfirmationDialog({ title: request.title, message: request.message, confirmLabel: request.confirmLabel, danger: request.danger,
      viewportWidth: width, viewportHeight: height, onConfirm: actions.accept, onCancel: actions.cancel, onStop: actions.stop })
  }
  @Builder
  mediaToolbar() {
    Column({ space: 8 }) {
      Row({ space: 8 }) {
        Button('⌕ 资源').flatButton().layoutWeight(1).height(48).padding({ left: 8, right: 8 }).fontSize(15)
          .accessibilityText(t('Script repositories and resources')).onClick(() => this.showLibrary())
        Button('↻ 刷新').flatButton().layoutWeight(1).height(48).padding({ left: 8, right: 8 }).fontSize(15)
          .accessibilityText(t('Refresh Download media folder')).enabled(!this.libraryBusy && !this.importing && !this.openingVideo).onClick(() => this.refreshLibrary())
        Button('AB 循环').flatButton().layoutWeight(1).height(48).padding({ left: 8, right: 8 }).fontSize(15)
          .enabled(!this.libraryBusy && !this.importing && !this.openingVideo && (this.deoVrActive ? this.deoVrConnected : this.videoMode ? this.videoReady : this.internalConnected) && Number.isFinite(this.engine.mediaPositionSeconds()))
          .accessibilityText(t('Set AB loop start, end, or clear')).onClick(() => { this.playlistAction(new PlaylistPanelAction('loopCycle')); })
      }.width('100%')
      Row({ space: 8 }) {
        Button(this.playing ? 'Ⅱ 暂停' : (this.videoMode && this.durationMs > 0 && this.positionMs >= this.durationMs ? '↶ 重播' : '▶ 播放'))
          .flatButton().layoutWeight(1).height(48).padding({ left: 8, right: 8 }).fontSize(15)
          .fontColor(this.transportPlayEnabled() ? UiStyle.onAccent : UiStyle.muted).fontWeight(FontWeight.Medium)
          .backgroundColor(this.transportPlayEnabled() ? UiStyle.accent : UiStyle.field).border({ width: 0 })
          .accessibilityText(this.playing ? t('Pause') : t('Play or rewind'))
          .enabled(this.videoMode ? this.videoCanToggle() : this.foreground && !this.importing && !this.openingVideo && !this.libraryBusy && (this.deoVrActive ? this.deoVrConnected && !this.deoVrBusy : this.videoMode ? this.videoReady : this.internalConnected && this.playlist.currentItem !== null && Number.isFinite(this.playlist.durationSeconds)))
          .onClick(() => { if (this.videoMode) { void this.videoPlaybackAction(); } else { void this.playPause(); } })
        Button('■ 停止').flatButton().backgroundColor(UiStyle.dangerSoft).fontColor(UiStyle.danger).border({ width: 0 })
          .layoutWeight(1).height(48).padding({ left: 8, right: 8 }).fontSize(15)
          .accessibilityText(t('Stop output')).onClick(() => this.stop())
        Button('同步').flatButton().layoutWeight(1).height(48).padding({ left: 8, right: 8 }).fontSize(15)
          .accessibilityText(t('Media timing settings')).onClick(() => { this.showMediaSettings = true; this.selectWorkspaceTool('script'); })
      }.width('100%')
    }.width('100%').padding(8).backgroundColor(UiStyle.card).borderRadius(UiStyle.radiusCard)
  }
  @Builder
  timeline() {
    Column({ space: 8 }) {
      Canvas(this.canvas).width('100%').height(this.compactControls() ? 64 : 72)
        .borderRadius(UiStyle.radius).clip(true)
        .onReady(() => this.drawTrace())
        .onClick((event: ClickEvent) => this.seekTransport(Math.max(0, Math.min(1, event.x / Math.max(1, this.canvas.width))) * this.durationMs))
      Slider({ value: this.positionMs, min: 0, max: Math.max(1, this.durationMs), step: 1 }).attributeModifier(new MfpSliderMaterialModifier(this.materialRevision))
        .height(UiStyle.control).selectedColor(UiStyle.accent).trackColor(UiStyle.edge).blockColor(UiStyle.accent)
        .onChange((value: number) => this.seekTransport(value))
      Flex({ direction: FlexDirection.Row, wrap: FlexWrap.Wrap, alignItems: ItemAlign.Center }) {
        Text((this.positionMs / 1000).toFixed(2) + ' / ' + (this.durationMs / 1000).toFixed(2) + ' s').fontSize(UiStyle.helper).fontColor(UiStyle.muted)
        Blank()
        Button(this.showHeatSettings ? t('Heatmap ⌃') : t('Heatmap ⌄')).flatButton().constraintSize({ minHeight: 40 }).fontSize(UiStyle.body(this.compactControls())).onClick(() => { this.showHeatSettings = !this.showHeatSettings; })
      }.width('100%')
      if (this.showHeatSettings) {
        SettingsSwitchField({ label: t('Show range'), value: this.heatShowRange, compact: this.compactControls(), onChange: (value: boolean) => { this.heatShowRange = value; this.drawTrace(); } })
        SettingsSwitchField({ label: t('Combine axes'), value: this.heatCombine, compact: this.compactControls(), onChange: (value: boolean) => { this.heatCombine = value; this.drawTrace(); } })
        SettingsSwitchField({ label: t('Invert display Y'), value: this.heatInvert, compact: this.compactControls(), onChange: (value: boolean) => { this.heatInvert = value; this.drawTrace(); } })
      }
    }.width('100%').padding(12).backgroundColor(UiStyle.card).borderRadius(UiStyle.radiusCard)
  }
  @Builder
  axes() {
    Column({ space: 0 }) {
        ForEach(this.axisNames, (name: string, index: number) => {
          Row({ space: 10 }) {
            Text(name).fontSize(UiStyle.body(this.compactControls())).fontColor(UiStyle.ink).fontWeight(FontWeight.Bold).width(38)
            Progress({ value: Number.isFinite(this.axisValues[index]) ? this.axisValues[index] : 0, total: 100, type: ProgressType.Linear }).color(UiStyle.accent).backgroundColor(UiStyle.edge).layoutWeight(1)
            Text(Number.isFinite(this.axisValues[index]) ? this.axisValues[index].toFixed(1) : '—').fontSize(UiStyle.body(this.compactControls())).fontColor(UiStyle.ink).width(64).textAlign(TextAlign.End)
          }.constraintSize({ minHeight: UiStyle.control }).padding({ left: 4, right: 4 })
        })
    }.padding(12).backgroundColor(UiStyle.card).borderRadius(UiStyle.radiusCard).width('100%')
  }
  @Builder
  axisToolbar() {
    Column({ space: 0 }) {
      Scroll() {
      Row({ space: 2 }) {
        ForEach(this.axisNames, (name: string, index: number) => {
          Column({ space: 0 }) {
            Text(name).fontSize(15).fontWeight(FontWeight.Bold).fontColor(index === this.selectedAxis ? UiStyle.accent : UiStyle.muted)
            Text(this.axisIndicators[index] || '· · · ·').fontSize(UiStyle.helper).fontColor(index === this.selectedAxis ? UiStyle.accent : UiStyle.muted).maxLines(1)
              .accessibilityText(t('Script, motion, home and limit state'))
          }.width(64).height(48).justifyContent(FlexAlign.Center)
            .backgroundColor(index === this.selectedAxis ? UiStyle.accentSoft : Color.Transparent)
            .borderRadius(14)
            .onClick(() => { this.selectedAxis = index; this.sync(); })
        })
      }.padding(4).backgroundColor(UiStyle.fill).borderRadius(18)
      }.width('100%').scrollable(ScrollDirection.Horizontal)
      Row({ space: 8 }) {
        Text((this.axisNames[this.selectedAxis] || '轴') + ' · ' + (this.selectedAxisDefinition.friendlyName || '轴控制')).fontSize(18).fontWeight(FontWeight.Bold).fontColor(UiStyle.ink).layoutWeight(1)
        Button(this.showAxisSettings ? '收起参数' : '轴参数').flatButton().constraintSize({ minHeight: 40 })
          .backgroundColor(UiStyle.accentSoft).fontColor(UiStyle.accent).border({ width: 0 })
          .onClick(() => { this.showAxisSettings = !this.showAxisSettings; })
      }.width('100%').margin({ top: 12, bottom: 8 })
      if (this.showAxisSettings) {
        if (this.axisNames.length > 0) {
          AxisSettingsPanel({ draftOwner: this.settingsDraftOwner, draftScope: this.settingsScope('axis'), draftEpoch: this.settingsDraftEpoch, configuration: this.selectedAxisConfiguration, axis: this.selectedAxisDefinition,
            availableAxes: this.engine.activeRegistry().profile.axes.slice(), showTitle: false, compact: this.compactControls(), readOnly: this.settingsReadOnly || this.recoveryRequired,
            onChange: (configuration: AxisConfiguration) => this.applyAxisSettings(configuration) })
          Button(this.showScriptResourceDetails ? '脚本资源详情  ▴' : '脚本资源详情  ▾').flatButton().constraintSize({ minHeight: 44 }).width('100%')
            .backgroundColor(UiStyle.field).border({ width: 1, color: UiStyle.hairline })
            .onClick(() => { this.showScriptResourceDetails = !this.showScriptResourceDetails; })
          if (this.showScriptResourceDetails || this.scriptReloadBusy) {
            Text(t(this.fileName)).fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
          Button(this.scriptReloadBusy ? '取消当前资源重载' : '重新读取当前轴脚本').flatButton().constraintSize({ minHeight: UiStyle.control }).width('100%')
            .enabled(this.scriptReloadBusy || (!this.settingsReadOnly && !this.recoveryRequired && !this.libraryBusy && !this.openingVideo && !this.importing && !this.runtimeBusy))
            .onClick(() => { if (this.scriptReloadBusy) { this.cancelKeyboardWork(); this.cancelManagedReload(); this.syncOutput(); } else { this.touchShortcut(new ShortcutAction('Axis::ReloadScript', 0, this.axisNames[this.selectedAxis])); } })
          if (this.scriptReloadStatus.length > 0) { Text(this.scriptReloadStatus).fontSize(UiStyle.helper).fontColor(UiStyle.ink).width('100%') }
          }

        }
      }
    }.width('100%').padding(12).backgroundColor(UiStyle.card).borderRadius(UiStyle.radiusCard)
  }
  @Builder
  scriptArea() {
    Column({ space: 12 }) {
      this.axisToolbar()
      Row({ space: 8 }) {
        Button(this.showMotionSettings ? '运动与曲线  ▴' : '运动与曲线  ▾').flatButton().layoutWeight(1).constraintSize({ minHeight: 44 })
          .backgroundColor(UiStyle.card).border({ width: 1, color: UiStyle.hairline }).fontWeight(FontWeight.Medium)
          .onClick(() => { this.showMotionSettings = !this.showMotionSettings; this.sync(); })
        Button(this.showMediaSettings ? '同步与时间偏移  ▴' : '同步与时间偏移  ▾').flatButton().layoutWeight(1).constraintSize({ minHeight: 44 })
          .backgroundColor(UiStyle.card).border({ width: 1, color: UiStyle.hairline }).fontWeight(FontWeight.Medium)
          .onClick(() => { this.showMediaSettings = !this.showMediaSettings; })
      }.width('100%')
      if (this.showMotionSettings && this.axisNames.length > 0) { this.motionPanel() }
      if (this.showMediaSettings) { this.syncPanel() }
      Button(this.showAxisValues ? '收起全部轴值' : '查看全部轴值').flatButton().constraintSize({ minHeight: 40 }).width('100%')
        .backgroundColor(UiStyle.card).border({ width: 1, color: UiStyle.hairline }).fontWeight(FontWeight.Medium)
        .onClick(() => { this.showAxisValues = !this.showAxisValues; })
      if (this.showAxisValues) { this.axes() }
      if (this.workspaceLayout().trace.height === 0 && this.videoMode) {
        Button(this.showTrace ? '收起脚本轨迹与标记' : '脚本轨迹与章节 / 书签').flatButton().constraintSize({ minHeight: 40 }).width('100%')
          .backgroundColor(UiStyle.card).border({ width: 1, color: UiStyle.hairline }).fontWeight(FontWeight.Medium)
          .onClick(() => { this.showTrace = !this.showTrace; })
        if (this.showTrace) { this.traceArea() }
      }
    }.width('100%')
  }
  @Builder
  traceArea() {
    Column({ space: 12 }) {
      Row({ space: 8 }) {
        Text('脚本轨迹').fontSize(UiStyle.heading).fontWeight(FontWeight.Bold).fontColor(UiStyle.ink).layoutWeight(1)
        Text(this.axisNames[this.selectedAxis] || '无启用轴').fontSize(UiStyle.helper).fontColor(UiStyle.muted)
      }.width('100%')
      this.timeline()
      Button(this.showMarkerDetails ? '章节 / 书签  ▴' : '章节 / 书签  ▾').flatButton().constraintSize({ minHeight: UiStyle.control }).width('100%')
        .backgroundColor(UiStyle.card).border({ width: 1, color: UiStyle.hairline }).fontWeight(FontWeight.Medium)
        .onClick(() => { this.showMarkerDetails = !this.showMarkerDetails; })
      if (this.showMarkerDetails) { this.markerPanel() }
    }.width('100%')
  }
  @Builder
  playerPreview() {
    Column({ space: 16 }) {
      Text(this.deoVrActive ? this.remoteName() : this.standaloneMotion ? '独立 Motion 预览' : this.manualPreview ? '手动预览' : '本地脚本播放器').fontSize(UiStyle.heading).fontWeight(FontWeight.Bold).fontColor(UiStyle.ink).width('100%')
      Text(t(this.fileName)).fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
      this.transport()
      this.traceArea()
      Button('选择媒体 / 查看 Download').flatButton().constraintSize({ minHeight: UiStyle.control }).width('100%').onClick(() => this.showLibrary())
    }.width('100%')
  }
  @Builder
  videoLibraryScreen() {
    Column({ space: 0 }) {
      Row({ space: 12 }) {
        Column({ space: 4 }) {
          Text('视频库').fontSize(UiStyle.display).fontWeight(FontWeight.Bold).fontColor(UiStyle.ink).width('100%')
          Text(this.libraryBusy ? t(this.libraryMessage) : this.visibleLibraryItems().length + ' 个视频 · 选择卡片开始播放')
            .fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%')
        }.layoutWeight(1).alignItems(HorizontalAlign.Start)
        Button(this.libraryBusy ? '取消' : '↻ 刷新').flatButton().height(44).padding({ left: 16, right: 16 })
          .backgroundColor(this.libraryBusy ? UiStyle.dangerSoft : UiStyle.accentSoft)
          .fontColor(this.libraryBusy ? UiStyle.danger : UiStyle.accent)
          .border({ width: 0 }).fontWeight(FontWeight.Medium)
          .enabled(this.libraryBusy || (!this.importing && !this.openingVideo))
          .onClick(() => { if (this.libraryBusy) { this.cancelLibrary(); } else { this.refreshLibrary(); } })
      }.width('100%').padding({ top: 12, bottom: 12 })

      Row({ space: 0 }) {
        Text('⌕').fontSize(20).fontColor(UiStyle.muted).padding({ left: 16, right: 8 })
        TextInput({ text: this.librarySearch, placeholder: '搜索视频、脚本或 ZIP' }).height(48).layoutWeight(1).fontSize(UiStyle.body(this.compactControls()))
          .backgroundColor(Color.Transparent).borderRadius(0).maxLength(256).padding({ left: 0, right: 8 })
          .onFocus(this.librarySearchFocusHandler(true))
          .onBlur(this.librarySearchFocusHandler(false))
          .onKeyPreIme(KeyboardInputSession.emergencyHandler(this.librarySearchEditor))
          .onChange(KeyboardInputSession.changeHandler(this.librarySearchEditor, this.librarySearchHandler()))
        if (this.librarySearch.length > 0) {
          Button('✕').flatButton().width(40).height(40).margin({ right: 4 })
            .backgroundColor(Color.Transparent).border({ width: 0 }).fontColor(UiStyle.muted)
            .accessibilityText('清除搜索').onClick(() => this.clearLibrarySearch())
        }
      }.width('100%').height(52).backgroundColor(UiStyle.card).borderRadius(UiStyle.radiusPill)
        .border({ width: 1, color: UiStyle.hairline })

      if (this.libraryBusy || this.libraryItems.length === 0) {
        Text(t(this.libraryMessage)).fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').padding({ top: 8, bottom: 8 })
      }
      Scroll(this.sourceScroller) {
        Flex({ direction: FlexDirection.Row, wrap: FlexWrap.Wrap, justifyContent: FlexAlign.SpaceBetween, alignItems: ItemAlign.Start }) {
          if (!this.libraryBusy && this.visibleLibraryItems().length === 0) {
            Column({ space: 10 }) {
              Text('▤').fontSize(40).fontColor(UiStyle.edge)
              Text(this.librarySearch.length > 0 ? '没有找到匹配的视频' : '这里还没有视频').fontSize(UiStyle.section)
                .fontWeight(FontWeight.Medium).fontColor(UiStyle.ink)
              Text('将视频和同名脚本放入 Download/com.multifunplayer.ohos，然后点击刷新。')
                .fontSize(UiStyle.helper).fontColor(UiStyle.muted).textAlign(TextAlign.Center)
            }.width('100%').padding({ top: 48, bottom: 48, left: 24, right: 24 })
              .backgroundColor(UiStyle.card).borderRadius(UiStyle.radiusCard).margin({ bottom: UiStyle.cardGap })
          }
          ForEach(this.visibleLibraryItems().slice(0, this.libraryLimit), (item: ResourceLibraryItem) => {
            Column({ space: 0 }) {
              Row({ space: 8 }) {
                Row({ space: 12 }) {
                  Stack({ alignContent: Alignment.Center }) {
                    Column().width('100%').height('100%')
                      .linearGradient({ angle: 135, colors: [[UiStyle.accent, 0.0], ['#5B94FF', 1.0]] })
                    Text('▶').fontSize(18).fontColor('#FFFFFF')
                  }.width(56).height(56).borderRadius(16).clip(true)
                  Column({ space: 6 }) {
                    Text(item.title).fontSize(UiStyle.body(this.compactControls())).fontColor(UiStyle.ink)
                      .fontWeight(FontWeight.Medium).maxLines(2).textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%')
                    Row({ space: 6 }) {
                      Text(item.videos.length > 1 ? item.videos.length + ' 个视频' : '视频')
                        .fontSize(UiStyle.helper).fontColor(UiStyle.muted).padding({ left: 8, right: 8, top: 2, bottom: 2 })
                        .backgroundColor(UiStyle.fill).borderRadius(10)
                      Text(item.scripts.length + item.archives.length > 0 ? '已配对脚本' : '仅视频')
                        .fontSize(UiStyle.helper).fontColor(item.scripts.length + item.archives.length > 0 ? UiStyle.success : UiStyle.muted)
                        .padding({ left: 8, right: 8, top: 2, bottom: 2 })
                        .backgroundColor(item.scripts.length + item.archives.length > 0 ? UiStyle.successSoft : UiStyle.fill)
                        .borderRadius(10)
                    }.width('100%')
                  }.layoutWeight(1).alignItems(HorizontalAlign.Start)
                }.layoutWeight(1).constraintSize({ minHeight: 64 }).padding({ left: 0, right: 0, top: 4, bottom: 4 })
                  .alignItems(VerticalAlign.Center)
                  .accessibilityText('播放视频 ' + item.title)
                  .onClick(this.libraryPlayHandler(item))
                Button(this.libraryDetailsId === item.id ? '⌃' : '⋮').flatButton().width(40).height(40).padding(0).fontSize(20)
                  .backgroundColor(UiStyle.fill).border({ width: 0 }).fontColor(UiStyle.muted)
                  .accessibilityText('视频详情与脚本配对').onClick(this.libraryDetailsHandler(item))
              }.width('100%')
              if (this.libraryDetailsId === item.id) { this.libraryItemDetails(item) }
            }.width(this.widthVp >= 900 ? '49%' : '100%').backgroundColor(UiStyle.card).borderRadius(UiStyle.radiusCard)
              .padding({ left: 12, right: 12, top: 10, bottom: 10 })
              .margin({ bottom: UiStyle.cardGap })
              .shadow({ radius: 12, color: UiStyle.shadowColor, offsetY: 3 })
              .onClick(this.libraryPlayHandler(item))
          }, (item: ResourceLibraryItem) => item.id)
          if (this.visibleLibraryItems().length > this.libraryLimit) {
            Button('显示更多').flatButton().height(48).width('100%')
              .backgroundColor(UiStyle.card).border({ width: 1, color: UiStyle.hairline })
              .onClick(() => { this.libraryLimit += 20; })
          }
        }.width('100%').padding({ top: 12, bottom: this.videoFloating ? this.workspaceLayout().video.height + 16 : 24 })
      }.layoutWeight(1).width('100%').align(Alignment.Top).scrollBar(BarState.Auto)
    }.padding({ left: this.libraryContentInset(), right: this.libraryContentInset(), top: 8, bottom: 8 })
      .width(this.widthVp).height(this.workspaceLayout().settings.height)
      .position({ x: 0, y: this.workspaceLayout().settings.y })
  }
  @Builder
  libraryItemDetails(item: ResourceLibraryItem) {
    Column({ space: 8 }) {
      Text(t(item.status) + (item.reasons.length > 0 ? ' · ' + item.reasons.join('; ') : '')).fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%')
      if (item.videos.length > 0) { Text('选择视频').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%') }
      ForEach(item.videos, (file: ResourceFileEntry) => {
        Button((this.manualVideoUri === file.uri ? '● ' : '○ ') + file.name).flatButton().constraintSize({ minHeight: 48 }).width('100%')
          .backgroundColor(this.manualVideoUri === file.uri ? UiStyle.accentSoft : UiStyle.field)
          .fontColor(this.manualVideoUri === file.uri ? UiStyle.accent : UiStyle.ink)
          .border({ width: 1, color: this.manualVideoUri === file.uri ? UiStyle.accentSoft : UiStyle.hairline })
          .onClick(this.librarySelectionHandler(item, file.uri, false))
      }, (file: ResourceFileEntry) => file.uri)
      if (item.scripts.length > 0) { Text('脚本配对').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%') }
      ForEach(item.scripts, (match: ResourceScriptMatch) => {
        Button((this.manualScriptUris.indexOf(match.file.uri) >= 0 ? '☑ ' : '☐ ') + match.file.name).flatButton().constraintSize({ minHeight: 48 }).width('100%')
          .backgroundColor(this.manualScriptUris.indexOf(match.file.uri) >= 0 ? UiStyle.accentSoft : UiStyle.field)
          .fontColor(this.manualScriptUris.indexOf(match.file.uri) >= 0 ? UiStyle.accent : UiStyle.ink)
          .border({ width: 1, color: this.manualScriptUris.indexOf(match.file.uri) >= 0 ? UiStyle.accentSoft : UiStyle.hairline })
          .onClick(this.librarySelectionHandler(item, match.file.uri, true))
      }, (match: ResourceScriptMatch) => match.file.uri)
      Flex({ direction: FlexDirection.Row, wrap: FlexWrap.Wrap }) {
        Button('自动配对播放').flatButton().constraintSize({ minHeight: 48 }).layoutWeight(1)
          .backgroundColor(UiStyle.accent).fontColor(UiStyle.onAccent).border({ width: 0 })
          .enabled(!this.libraryBusy && !this.importing && !this.openingVideo).onClick(this.libraryPlayHandler(item, true, true))
        Button('按所选配对播放').flatButton().constraintSize({ minHeight: 48 }).layoutWeight(1)
          .backgroundColor(UiStyle.field).border({ width: 1, color: UiStyle.hairline })
          .enabled(!this.libraryBusy && !this.importing && !this.openingVideo).onClick(this.libraryPlayHandler(item, true))
      }.width('100%')
    }.padding({ top: 8, bottom: 4 }).width('100%')
  }
  @Builder
  libraryPanel() {
    Column({ space: 10 }) {
      this.heading('Local resources', 'AUTHORIZED FILES')
      Button(t('Close resource list')).flatButton().constraintSize({ minHeight: UiStyle.control }).width('100%').onClick(() => { this.showResources = false; this.resourceFocus = false; })
      Text(t(this.libraryFolder)).fontSize(UiStyle.body(this.compactControls())).fontColor(UiStyle.ink).width('100%').copyOption(CopyOptions.InApp)
      Text(t('Place videos and matching scripts or ZIP files in this folder. Scanning never copies videos. Refresh stops playback.')).fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%')
      if (this.libraryBusy) {
        Button(t('Cancel scan')).flatButton().constraintSize({ minHeight: UiStyle.control }).width('100%').onClick(() => this.cancelLibrary())
      } else {
        Button(t('Refresh Download media folder')).flatButton().constraintSize({ minHeight: UiStyle.control }).width('100%').enabled(!this.importing && !this.openingVideo).onClick(() => this.refreshLibrary())
      }
      Text(t(this.libraryMessage)).fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%')
      ForEach(this.libraryItems.slice(0, this.libraryLimit), (item: ResourceLibraryItem) => {
        Column({ space: 8 }) {
          Text(item.title).fontSize(UiStyle.body(this.compactControls())).fontColor(UiStyle.ink).width('100%').wordBreak(WordBreak.BREAK_ALL)
          Text(t(item.status) + ' · ' + item.videos.length + t(' video / ') + item.scripts.length + t(' scripts / ') + item.archives.length + t(' ZIP')).fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%')
          if (item.reasons.length > 0) { Text(item.reasons.join('; ')).fontSize(UiStyle.helper).fontColor(UiStyle.warning).width('100%') }
          if (item.videos.length === 1) {
            Button(t('Play video')).flatButton().constraintSize({ minHeight: UiStyle.control }).width('100%').enabled(!this.libraryBusy && !this.importing && !this.openingVideo).onClick(() => this.openLibraryItem(item))
          }
          if (item.videos.length > 0) {
            Button(t('Choose mapping')).flatButton().constraintSize({ minHeight: UiStyle.control }).width('100%').enabled(!this.libraryBusy && !this.importing && !this.openingVideo).onClick(() => this.beginMapping(item))
          }
          if (this.manualItemId === item.id) {
            Text(t('Select one video and candidate scripts. Original matcher priority chooses each axis.')).fontSize(UiStyle.helper).fontColor(UiStyle.warning)
            ForEach(item.videos, (file: ResourceFileEntry) => {
              Text(file.name).fontSize(UiStyle.body(this.compactControls())).fontColor(UiStyle.ink).width('100%').wordBreak(WordBreak.BREAK_ALL)
              Button((this.manualVideoUri === file.uri ? '● ' : '○ ') + file.name).flatButton().constraintSize({ minHeight: UiStyle.control }).width('100%').onClick(() => { this.manualVideoUri = file.uri; })
            }, (file: ResourceFileEntry) => file.uri)
            ForEach(item.scripts, (match: ResourceScriptMatch) => {
              Text(match.file.name).fontSize(UiStyle.body(this.compactControls())).fontColor(UiStyle.ink).width('100%').wordBreak(WordBreak.BREAK_ALL)
              Button((this.manualScriptUris.indexOf(match.file.uri) >= 0 ? '☑ ' : '☐ ') + match.file.name).flatButton().constraintSize({ minHeight: UiStyle.control }).width('100%').onClick(() => this.toggleMappedScript(match.file.uri))
            }, (match: ResourceScriptMatch) => match.file.uri)
            Button(t('Open selected video · original search')).flatButton().constraintSize({ minHeight: UiStyle.control }).width('100%').enabled(!this.libraryBusy && !this.importing && !this.openingVideo).onClick(() => this.openLibraryItem(item, true, true))
            Button(t('Open selected mapping')).flatButton().constraintSize({ minHeight: UiStyle.control }).width('100%').enabled(!this.libraryBusy && !this.importing && !this.openingVideo).onClick(() => this.openLibraryItem(item, true))
          }
        }.padding({ top: 12, bottom: 12 }).border({ width: { bottom: 1 }, color: UiStyle.edge }).width('100%')
      }, (item: ResourceLibraryItem) => item.id)
      if (this.libraryItems.length > this.libraryLimit) {
        Button(t('Show 20 more')).flatButton().constraintSize({ minHeight: UiStyle.control }).width('100%').onClick(() => { this.libraryLimit += 20; })
      }
    }.padding({ top: 12, bottom: 12 }).border({ width: { bottom: 1 }, color: UiStyle.edge }).width('100%')
  }

  @Builder
  sourcePanel() {
    Column({ space: 10 }) {
      Row({ space: 8 }) {
        Column({ space: 2 }) {
          Text(t('Internal')).fontSize(UiStyle.body(this.compactControls())).fontWeight(FontWeight.Medium)
          Text(this.internalConnected ? t('Connected') : t('Disconnected')).fontSize(UiStyle.helper).fontColor(this.internalConnected ? UiStyle.success : UiStyle.muted)
        }.layoutWeight(1).height(60).justifyContent(FlexAlign.Center)
          .backgroundColor(!this.videoMode && !this.deoVrActive ? UiStyle.accentSoft : UiStyle.field)
          .borderRadius(14).border({ width: 1, color: !this.videoMode && !this.deoVrActive ? UiStyle.accentSoft : UiStyle.hairline })
          .onClick(() => { this.showSourceSettings = true; if (!this.internalConnected) { this.connectInternal(); } })
        Column({ space: 2 }) {
          Text(t('Local video')).fontSize(UiStyle.body(this.compactControls())).fontWeight(FontWeight.Medium)
          Text(t(this.videoMode ? this.videoState : 'Disconnected')).fontSize(UiStyle.helper).fontColor(this.videoReady ? UiStyle.success : UiStyle.danger)
        }.layoutWeight(1).height(60).justifyContent(FlexAlign.Center)
          .backgroundColor(this.videoMode ? UiStyle.accentSoft : UiStyle.field)
          .borderRadius(14).border({ width: 1, color: this.videoMode ? UiStyle.accentSoft : UiStyle.hairline })
          .onClick(() => { this.showLibrary(); })
      }.width('100%')
      Button(this.remoteName() + ' · ' + t(this.deoVrStatus)).flatButton().constraintSize({ minHeight: 44, maxWidth: '100%' }).width('100%')
        .backgroundColor(UiStyle.field).border({ width: 1, color: UiStyle.hairline }).borderRadius(12)
        .onClick(() => { this.showSourceSettings = true; })
      Row({ space: 8 }) {
        Button('资源与脚本库').flatButton().layoutWeight(1).constraintSize({ minHeight: 44 })
          .backgroundColor(UiStyle.accentSoft).fontColor(UiStyle.accent).border({ width: 0 })
          .accessibilityText(t('Resources and script libraries')).onClick(() => this.showLibrary())
        Button(this.showSourceSettings ? '收起来源设置' : '来源设置').flatButton().layoutWeight(1).constraintSize({ minHeight: 44 })
          .backgroundColor(UiStyle.field).border({ width: 1, color: UiStyle.hairline })
          .accessibilityText(t('Source settings')).onClick(() => { this.showSourceSettings = !this.showSourceSettings; })
      }.width('100%')
      Row({ space: 8 }) {
        Text(t(this.videoMode ? this.videoName : this.fileName)).fontSize(UiStyle.helper).fontColor(UiStyle.muted).layoutWeight(1).maxLines(2).wordBreak(WordBreak.BREAK_ALL)
        if (this.videoMode) {
          Button('关闭视频').flatButton().constraintSize({ minHeight: 36 }).fontSize(14)
            .backgroundColor(UiStyle.dangerSoft).fontColor(UiStyle.danger).border({ width: 0 })
            .enabled(!this.importing && !this.openingVideo && !this.libraryBusy)
            .accessibilityText(t('Close local video')).onClick(() => this.closeVideo())
        }
      }.width('100%')
      Button(this.showMediaAdvanced ? '独立预览与运行恢复  ▴' : '独立预览与运行恢复  ▾').flatButton().constraintSize({ minHeight: 44 }).width('100%')
        .backgroundColor(UiStyle.field).border({ width: 1, color: UiStyle.hairline }).onClick(() => { this.showMediaAdvanced = !this.showMediaAdvanced; })
      if (this.showMediaAdvanced) {
      Column({ space: 6 }) {
        Button(this.standaloneMotion ? '停止独立Motion' : '关闭媒体并启动独立Motion').flatButton().constraintSize({ minHeight: UiStyle.control }).width('100%')
          .enabled(this.standaloneMotion || (!this.runtimeBusy && this.foreground && !this.settingsReadOnly && !this.recoveryRequired))
          .onClick(() => { if (this.standaloneMotion) { this.stop(); } else { this.startStandaloneMotion(); } })
        Button(this.manualPreview ? '停止手动预览' : '关闭媒体和输出连接，启动手动预览').flatButton().constraintSize({ minHeight: UiStyle.control }).width('100%')
          .enabled(this.manualPreview || (!this.runtimeBusy && this.foreground && !this.settingsReadOnly && !this.recoveryRequired))
          .onClick(() => { if (this.manualPreview) { this.stop(); } else { this.startManualPreview(); } })
        Text('手动动作：在“输入 / 触控动作 → 轴 · 脚本与插值”选择 Value Set / Offset。编辑参数不执行；停止后不能仅靠 Set 恢复发送。').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%')
        Button('安全重建运行状态').flatButton().constraintSize({ minHeight: UiStyle.control }).width('100%').enabled(!this.runtimeBusy && this.foreground)
          .onClick(this.runtimeResetConfirmationHandler())
        Text(this.runtimeMessage || '独立Motion需要启用轴的“暂停更新”和“无脚本更新”；预览不会自动连接/启用设备。').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%')
      }.padding({ top: 8, bottom: 8 }).width('100%')
      }
      if (this.showSourceSettings) {
        if (this.presentationReason.length > 0) { Text('窗口呈现：' + this.presentationMode + ' · ' + this.presentationReason).fontSize(UiStyle.helper).fontColor(UiStyle.muted).padding(8) }
        DeoVrSourcePanel({ draftOwner: this.settingsDraftOwner, draftScope: this.settingsScope('source'), draftEpoch: this.settingsDraftEpoch, configuration: this.mediaSourceConfiguration, readOnly: this.settingsReadOnly || this.recoveryRequired, compact: this.compactControls(),
          connected: this.deoVrConnected, busy: this.deoVrBusy, closeConfirmed: this.deoVrCloseConfirmed, status: this.deoVrStatus, error: this.deoVrError,
          mediaPath: this.deoVrPath, positionSeconds: this.deoVrPosition, durationSeconds: this.deoVrDuration, playing: this.deoVrPlaying, stale: this.deoVrStale,
          onChange: (configuration: MediaSourceConfiguration) => { this.applyMediaSourceSettings(configuration); },
          onConnect: () => { this.connectDeoVr(this.mediaSourceConfiguration.selectedSource === 'heresphere' ? 'heresphere' : 'deovr'); }, onDisconnect: () => { this.disconnectDeoVr(); } })
        Text('Internal 是独立脚本时钟；本地视频使用原生媒体时钟。DeoVR / HereSphere 仅按接收时间驱动，远端路径只匹配 Download 脚本。连接媒体源不会连接或启用设备输出。').fontSize(UiStyle.helper).fontColor(UiStyle.warning).padding(10)
        InternalPlaylistPanel({ draftOwner: this.settingsDraftOwner, draftScope: this.settingsScope('playlist'), draftEpoch: this.settingsDraftEpoch, snapshot: this.playlistView, compact: this.compactControls(),
          onAction: (action: PlaylistPanelAction) => { this.playlistAction(action); } })
        if (this.videoMode) {
          Row() {
            Text(t('Volume')).fontSize(UiStyle.helper).width(64)
            Slider({ value: this.volume, min: 0, max: 1, step: 0.01 }).attributeModifier(new MfpSliderMaterialModifier(this.materialRevision)).height(UiStyle.control).layoutWeight(1).enabled(this.videoReady)
              .onChange((value: number) => { this.volume = value; this.video.setVolume(value); })
          }.padding({ top: 10, bottom: 10 })
        }
      }
    }.padding(12).backgroundColor(UiStyle.card).borderRadius(UiStyle.radiusCard).width('100%')
  }
  @Builder
  preferencesPanel() {
    Column({ space: 12 }) {
      Flex({ direction: FlexDirection.Row, wrap: FlexWrap.Wrap }) {
        Button(this.showGeneralSettings ? '收起通用设置' : '通用设置').flatButton().constraintSize({ minHeight: 44 }).margin(4)
          .backgroundColor(this.showGeneralSettings ? UiStyle.accentSoft : UiStyle.card).fontColor(this.showGeneralSettings ? UiStyle.accent : UiStyle.ink)
          .border({ width: 1, color: UiStyle.hairline }).onClick(() => { this.showGeneralSettings = !this.showGeneralSettings; })
        Button(this.showInputSettings ? '结束编辑快捷键' : '键盘映射 / 触摸命令').flatButton().constraintSize({ minHeight: 44 }).margin(4)
          .backgroundColor(this.showInputSettings ? UiStyle.accentSoft : UiStyle.card).fontColor(this.showInputSettings ? UiStyle.accent : UiStyle.ink)
          .border({ width: 1, color: UiStyle.hairline }).onClick(() => this.toggleInputSettings())
        Button('停止 · F12').flatButton().backgroundColor(UiStyle.danger).fontColor(UiStyle.onAccent).border({ width: 0 }).height(44).margin(4).onClick(() => this.stop())
      }.width('100%')
      if (this.inputFocusMessage.length > 0) { Text(this.inputFocusMessage).fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%') }
      if (this.inputMessage.length > 0) { Text(this.inputMessage).fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%') }
      if (this.showGeneralSettings) { GeneralSettingsPanel({ draftOwner: this.settingsDraftOwner, draftScope: this.settingsScope('general'), draftEpoch: this.settingsDraftEpoch, compact: this.compactControls(), configuration: this.generalConfiguration, readOnly: this.settingsReadOnly || this.recoveryRequired,
        onChange: (configuration: GeneralConfiguration): void => this.applyGeneralSettings(configuration) }) }
      if (this.showInputSettings) { InputSettingsPanel({ draftOwner: this.settingsDraftOwner, draftScope: this.settingsScope('input'), draftEpoch: this.settingsDraftEpoch, compact: this.compactControls(), configuration: this.keyboardConfiguration, readOnly: this.settingsReadOnly || this.recoveryRequired,
        axisNames: this.engine.activeRegistry().profile.axes.map(axis => axis.name), enabledAxisNames: this.axisNames, selectedAxisName: this.axisNames[this.selectedAxis] || '', actionStatus: this.inputMessage,
        outputOptions: this.shortcutOutputOptions(), managedScriptOptions: this.shortcutScriptOptions(), actionContextKey: this.shortcutActionContextKey(),
        captureId: this.keyboardCaptureId, captureKeys: this.keyboardCaptureKeys, captureRevision: this.keyboardCaptureRevision,
        onChange: (configuration: KeyboardShortcutConfiguration, captureRevision?: number): void => this.applyKeyboardSettings(configuration, captureRevision),
        onCapture: (id: string): void => this.captureKeyboard(id), onCancelCapture: (captureRevision: number): void => this.cancelKeyboardCapture(captureRevision),
        onAction: (action: ShortcutAction): void => { this.touchShortcut(action); }, onStop: (): void => this.stop() }) }
      if (this.showInputSettings) {
        Button(this.showContinuousInput ? '收起高级局部连续输入' : '高级 · 局部连续输入').flatButton().constraintSize({ minHeight: UiStyle.control }).width('100%')
          .onClick(() => this.toggleContinuousInput())
        if (this.showContinuousInput) {
          ContinuousInputPanel({ draftOwner: this.settingsDraftOwner, draftScope: this.settingsScope('continuous'), draftEpoch: this.settingsDraftEpoch,
            compact: this.compactControls(), configuration: this.continuousConfiguration, selectedMappingId: this.continuousMappingId,
            readOnly: this.settingsReadOnly || this.recoveryRequired, ownerKey: this.continuousOwnerKey(), receptionRevision: this.continuousReceptionRevision,
            receiving: this.continuousReceiving, contactActive: this.continuousContact,
            canReceive: this.viewActive && this.foreground && KeyboardInputSession.isWindowFocused() && !this.runtimeBusy && !this.confirmationCloseUnconfirmed,
            status: this.continuousStatus, latestValue: this.continuousLatestValue, latestDelta: this.continuousLatestDelta, lastAction: this.continuousLastAction,
            axisOptions: this.engine.activeRegistry().profile.axes.map(axis => new SettingsOption(axis.name, axis.name + (axis.enabled ? '' : '（已禁用）'))),
            outputOptions: this.shortcutOutputOptions(),
            onChange: (configuration: ContinuousInputConfiguration): void => this.applyContinuousConfiguration(configuration),
            onSelectMapping: (id: string): void => this.selectContinuousMapping(id), onEnable: (id: string): void => this.enableContinuousInput(id),
            onCancel: (reason: string, ownerKey: string, revision: number): void => this.continuousCancelHandler(reason, ownerKey, revision),
            onLocalTouch: (packet: LocalTouchPacket): boolean => this.localContinuousTouch(packet),
            onLocalMouse: (packet: LocalMousePacket): boolean => this.localContinuousMouse(packet),
            onLocalWheel: (packet: LocalWheelPacket): boolean => this.localContinuousWheel(packet),
            onSurfaceChanged: (geometry: LocalSurfaceGeometry, ownerKey: string, revision: number): void => this.continuousSurfaceChanged(geometry, ownerKey, revision) })
        }
      }
    }.width('100%')
  }
  @Builder
  socketDiagnosticPanel() {
    Column({ space: 12 }) {
      Text('专用接收端诊断').fontSize(UiStyle.heading).fontWeight(FontWeight.Bold).width('100%')
      Text('在自己的电脑运行恢复包 tools/network-diagnostics/receiver.mjs。将它显示的地址与端口填在下方；仅连接专用诊断接收脚本，不要填写运动设备端口。诊断发送一次随机挑战，不发送轴值、不自动 Arm。').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%')
      Text('本地开发已验证真实 Linux socket 生产链；此按钮使用 OHOS 原生网络后端，须由你的设备实测。端点不会保存，日志不含随机挑战或接收内容。').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%')
      SettingsChoiceField({ label: '诊断协议', selected: this.diagnosticKind, options: [new SettingsOption('tcp', 'TCP'), new SettingsOption('udp', 'UDP')], compact: this.compactControls(), editable: this.diagnosticEditable(),
        onSelect: (value: string) => { if (this.diagnosticEditable() && (value === 'tcp' || value === 'udp')) { this.diagnosticKind = value; this.diagnosticConfirmed = false; this.diagnosticNotice = '协议已编辑；上次结果不证明本次配置。'; } } })
      SettingsTextField({ draftOwner: this.settingsDraftOwner, draftScope: 'diagnostic', draftKey: 'host', draftEpoch: this.settingsDraftEpoch, label: '专用接收脚本的主机 / IP', value: this.diagnosticHost, compact: this.compactControls(), editable: this.diagnosticEditable(), onEdit: (): void => this.invalidateDiagnosticConfirmation(), onCommit: (value: string): boolean => this.editDiagnosticHost(value) })
      SettingsNumberField({ draftOwner: this.settingsDraftOwner, draftScope: 'diagnostic', draftKey: 'port', draftEpoch: this.settingsDraftEpoch, label: '接收脚本端口', value: this.diagnosticPort, minimum: 1, maximum: 65535, integer: true, compact: this.compactControls(), editable: this.diagnosticEditable(), onEdit: (): void => this.invalidateDiagnosticConfirmation(), onCommit: (value: number): boolean => this.editDiagnosticPort(value) })
      SettingsSwitchField({ label: '我确认这是专用诊断接收脚本，不是设备控制端口', value: this.diagnosticConfirmed, compact: this.compactControls(), editable: this.diagnosticEditable(),
        onChange: (value: boolean) => { if (this.diagnosticEditable()) { this.diagnosticConfirmed = value; } } })
      Button('开始一次往返诊断').flatButton().constraintSize({ minHeight: UiStyle.control }).width('100%')
        .enabled(this.diagnosticEditable() && this.diagnosticConfirmed && !this.runtimeBusy).onClick(() => { this.startSocketDiagnostic(); })
      Button('取消诊断 / 关闭连接').flatButton().constraintSize({ minHeight: UiStyle.control }).width('100%').fontColor(UiStyle.danger)
        .enabled(this.diagnosticBusy).onClick(() => this.cancelSocketDiagnostic())
      if (this.diagnosticNotice.length > 0) { Text(this.diagnosticNotice).fontSize(UiStyle.helper).fontColor(UiStyle.danger).width('100%') }
      Text(this.diagnosticResult).fontSize(UiStyle.helper).fontColor(this.diagnosticBlocked ? UiStyle.danger : UiStyle.ink).width('100%')
      if (this.diagnosticBlocked) { Text('诊断尚未确认关闭：所有设备连接和 Arm 暂不可用。').fontSize(UiStyle.helper).fontColor(UiStyle.danger).width('100%') }
    }.width('100%').padding({ top: 12, bottom: 12 }).border({ width: { bottom: 1 }, color: UiStyle.edge })
  }
  @Builder
  outputPanel() {
    Column({ space: 0 }) {
      if (this.outputPage === 'add') { this.outputAddPage() }
      else if (this.outputPage === 'detail') { this.outputDetailPage() }
      else { this.outputListPage() }
    }.width('100%')
  }
  @Builder
  outputStatCard(label: string, value: number, tone: string, background: string) {
    Column({ space: 3 }) {
      Text(value.toString()).fontSize(22).fontWeight(FontWeight.Bold).fontColor(tone)
      Text(label).fontSize(UiStyle.helper).fontColor(UiStyle.muted).maxLines(1)
    }.layoutWeight(1).height(62).justifyContent(FlexAlign.Center)
      .backgroundColor(background).borderRadius(14)
  }
  @Builder
  outputTargetCard(target: OutputTargetSummary) {
    Button() {
      Row({ space: 10 }) {
        Stack({ alignContent: Alignment.Center }) {
          Text(this.outputKindShort(target.kind)).fontSize(UiStyle.helper).fontWeight(FontWeight.Bold).fontColor(UiStyle.accent)
        }.width(46).height(46).borderRadius(14).backgroundColor(UiStyle.accentSoft)
        Column({ space: 5 }) {
          Text(target.name).fontSize(16).fontWeight(FontWeight.Medium).fontColor(UiStyle.ink).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
          Text(this.outputKindLabel(target.kind) + ' · ' + this.outputEndpointLabel(target.id))
            .fontSize(UiStyle.helper).fontColor(UiStyle.muted).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
          Row({ space: 6 }) {
            Text(t(target.connection)).fontSize(UiStyle.helper).fontColor(this.outputStatusTone(target))
              .padding({ left: 8, right: 8, top: 2, bottom: 2 }).backgroundColor(this.outputStatusSoft(target)).borderRadius(9)
            if (target.armed) {
              Text(target.dispatchSuspended ? '待命' : '已启用').fontSize(UiStyle.helper)
                .fontColor(target.dispatchSuspended ? UiStyle.warning : UiStyle.accent)
                .padding({ left: 8, right: 8, top: 2, bottom: 2 })
                .backgroundColor(target.dispatchSuspended ? UiStyle.warningSoft : UiStyle.accentSoft).borderRadius(9)
            }
            if (target.removing) {
              Text('删除未确认').fontSize(UiStyle.helper).fontColor(UiStyle.danger)
                .padding({ left: 8, right: 8, top: 2, bottom: 2 }).backgroundColor(UiStyle.dangerSoft).borderRadius(9)
            }
          }.width('100%')
        }.layoutWeight(1).alignItems(HorizontalAlign.Start)
        Text('›').fontSize(22).fontColor(UiStyle.muted)
      }.width('100%').padding(12).alignItems(VerticalAlign.Center)
    }.flatButton().width('100%').backgroundColor(UiStyle.card).border({ width: 1, color: UiStyle.hairline })
      .borderRadius(UiStyle.radiusCard).onClick(() => this.openOutputTarget(target))
  }
  @Builder
  outputListPage() {
    Column({ space: 12 }) {
      Row({ space: 10 }) {
        Column({ space: 2 }) {
          Text('设备连接').fontSize(24).fontWeight(FontWeight.Bold).fontColor(UiStyle.ink)
          Text(this.outputTargets.length === 0 ? '添加输出设备后，这里会显示连接状态' :
            '共 ' + this.outputTargets.length + ' 个输出 · 点击卡片配置')
            .fontSize(UiStyle.helper).fontColor(UiStyle.muted)
        }.layoutWeight(1).alignItems(HorizontalAlign.Start)
        Button('＋ 添加').flatButton().height(42).padding({ left: 16, right: 16 })
          .backgroundColor(UiStyle.accent).fontColor(UiStyle.onAccent).border({ width: 0 }).fontWeight(FontWeight.Medium)
          .enabled(!this.settingsReadOnly && !this.recoveryRequired)
          .onClick(() => { this.outputPage = 'add'; this.showAddOutput = true; })
      }.width('100%')
      Row({ space: 8 }) {
        this.outputStatCard('目标', this.outputTargets.length, UiStyle.ink, UiStyle.field)
        this.outputStatCard('已连接', this.outputConnectedCount(), UiStyle.success, UiStyle.successSoft)
        this.outputStatCard('已启用', this.outputArmedCount(), UiStyle.accent, UiStyle.accentSoft)
        if (this.outputFaultCount() > 0) {
          this.outputStatCard('故障', this.outputFaultCount(), UiStyle.danger, UiStyle.dangerSoft)
        }
      }.width('100%')
      if (this.outputTargets.length === 0) {
        Column({ space: 8 }) {
          Text('还没有输出设备').fontSize(UiStyle.section).fontWeight(FontWeight.Medium).fontColor(UiStyle.ink)
          Text('添加 TCP、UDP、WebSocket 或串口设备，然后填写地址/端口并明确连接。').fontSize(UiStyle.helper)
            .fontColor(UiStyle.muted).textAlign(TextAlign.Center)
          Button('添加第一个设备').flatButton().constraintSize({ minHeight: 44 }).margin({ top: 4 })
            .backgroundColor(UiStyle.accent).fontColor(UiStyle.onAccent).border({ width: 0 })
            .enabled(!this.settingsReadOnly && !this.recoveryRequired)
            .onClick(() => { this.outputPage = 'add'; this.showAddOutput = true; })
        }.width('100%').padding({ top: 28, bottom: 28, left: 20, right: 20 })
          .backgroundColor(UiStyle.card).borderRadius(UiStyle.radiusCard)
      } else {
        Column({ space: 8 }) {
          ForEach(this.outputTargets, (target: OutputTargetSummary) => {
            this.outputTargetCard(target)
          }, (target: OutputTargetSummary) => target.id + ':' + target.generation)
        }.width('100%')
      }
      Row({ space: 8 }) {
        Button('停止全部输出').flatButton().layoutWeight(1).constraintSize({ minHeight: 42 })
          .backgroundColor(UiStyle.dangerSoft).fontColor(UiStyle.danger).border({ width: 0 })
          .onClick(() => this.stop())
        Button(this.showSocketDiagnostic ? '收起网络诊断' : '网络诊断').flatButton().layoutWeight(1).constraintSize({ minHeight: 42 })
          .backgroundColor(UiStyle.card).border({ width: 1, color: UiStyle.hairline })
          .onClick(() => { this.showSocketDiagnostic = !this.showSocketDiagnostic; })
      }.width('100%')
      if (this.showSocketDiagnostic) { this.socketDiagnosticPanel() }
      Text('连接和启用发送是两步：先连接，再明确 Arm。恢复配置不会自动连接；每个目标独立发送。')
        .fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%').wordBreak(WordBreak.BREAK_ALL)
    }.width('100%').padding(12).backgroundColor(UiStyle.card).borderRadius(UiStyle.radiusCard)
  }
  @Builder
  outputAddChoice(kind: SavedOutputTargetKind, title: string, detail: string, glyph: string) {
    Row() {
      Row({ space: 12 }) {
        Stack({ alignContent: Alignment.Center }) {
          Text(glyph).fontSize(UiStyle.helper).fontWeight(FontWeight.Bold).fontColor(UiStyle.accent)
        }.width(46).height(46).borderRadius(14).backgroundColor(UiStyle.accentSoft)
        Column({ space: 4 }) {
          Text(title).fontSize(16).fontWeight(FontWeight.Medium).fontColor(UiStyle.ink)
          Text(detail).fontSize(UiStyle.helper).fontColor(UiStyle.muted).maxLines(2).textOverflow({ overflow: TextOverflow.Ellipsis })
        }.layoutWeight(1).alignItems(HorizontalAlign.Start)
        Text('添加 ›').fontSize(UiStyle.helper).fontColor(UiStyle.accent)
      }.width('100%').padding(14).alignItems(VerticalAlign.Center)
    }.width('100%').backgroundColor(UiStyle.card).border({ width: 1, color: UiStyle.hairline })
      .borderRadius(UiStyle.radiusCard).enabled(!this.settingsReadOnly && !this.recoveryRequired)
      .accessibilityText('添加 ' + title)
      .onClick(() => this.addOutputAndOpen(kind))
  }
  @Builder
  outputAddPage() {
    Column({ space: 12 }) {
      Row({ space: 8 }) {
        Button('‹ 设备列表').flatButton().height(40).padding({ left: 12, right: 12 })
          .backgroundColor(UiStyle.fill).border({ width: 0 }).onClick(() => this.outputBack())
        Text('添加设备').fontSize(22).fontWeight(FontWeight.Bold).fontColor(UiStyle.ink).layoutWeight(1)
      }.width('100%')
      Text('先选择协议，进入配置页后填写地址和端口；串口设备则先选择本机端口。')
        .fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%')
      this.outputAddChoice('serial', '串口 / USB', '本机串口，或实验性 CH340/341 仅写后端', 'USB')
      this.outputAddChoice('tcp', 'TCP', '本地或局域网设备，稳定、低延迟；需要地址与端口', 'TCP')
      this.outputAddChoice('udp', 'UDP', '无连接设备或广播端点；需要地址与端口', 'UDP')
      this.outputAddChoice('webSocket', 'WebSocket', 'WebSocket / WSS 端点，可选路径', 'WS')
      Button('取消并返回').flatButton().height(42).width('100%')
        .backgroundColor(UiStyle.fill).border({ width: 0 }).onClick(() => this.outputBack())
    }.width('100%')
  }
  @Builder
  outputDetailPage() {
    Column({ space: 12 }) {
      Row({ space: 8 }) {
        Button('‹ 设备列表').flatButton().height(40).padding({ left: 12, right: 12 })
          .backgroundColor(UiStyle.fill).border({ width: 0 }).onClick(() => this.outputBack())
        Column({ space: 2 }) {
          Text(this.selectedOutputName()).fontSize(20).fontWeight(FontWeight.Bold).fontColor(UiStyle.ink)
            .maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
          Text(this.selectedOutputKind() + ' · ' + t(this.outputConnection)).fontSize(UiStyle.helper)
            .fontColor(this.outputConnection === 'connected' ? UiStyle.success : UiStyle.muted)
        }.layoutWeight(1).alignItems(HorizontalAlign.Start)
        if (this.selectedOutputExists() && !this.settingsReadOnly && !this.recoveryRequired) {
          Button(this.selectedOutputRemoving() ? '重试删除' : '删除').flatButton().height(40)
            .backgroundColor(UiStyle.dangerSoft).fontColor(UiStyle.danger).border({ width: 0 })
            .onClick(this.removeOutputConfirmationHandler(this.selectedOutputId, this.selectedOutputGeneration()))
        }
      }.width('100%')
      if (this.selectedOutputExists()) {
        Column() {
          OutputSettingsPanel({ draftOwner: this.settingsDraftOwner, draftScope: this.settingsScope('output'), draftEpoch: this.settingsDraftEpoch, compact: this.compactControls(), profile: this.outputProfile, profileId: this.outputDeviceId, draft: this.outputDraft,
            readOnly: this.settingsReadOnly || this.recoveryRequired, appliedConfigurationId: this.outputApplicationId,
            onDraftChange: (draft: OutputSettingsDraft): void => this.updateOutputDraft(draft), connection: this.outputConnection, armed: this.outputArmed, dispatchSuspended: this.outputSuspended,
            busy: this.outputBusy || this.diagnosticBlocked, completedLocalWrites: this.outputWrites, locallyAcceptedBytes: this.outputBytes,
            diagnostic: this.outputDiagnostic, serialProbeState: this.serialProbeState, serialProbeNotice: this.serialProbeNotice,
            onProbeSerial: (id: string, generation: number): void => { void this.probeSerial(id, generation); },
            onCancelSerialProbe: (): void => this.cancelSerialProbe(), onCopySerialProbe: (): void => { void this.copySerialProbe(); }, serialPorts: this.serialDiscoveryState.ports, serialCapabilities: this.serialDiscoveryState.capabilities,
            serialBusy: this.serialDiscoveryState.busy, serialMessage: this.serialDiscoveryState.message,
            onRefreshSerial: (targetId: string, generation: number, backend: SavedSerialBackend): void => { this.refreshSerialPorts(targetId, generation, backend); },
            onConnect: (configuration: OutputTargetConfig, endpoint: OutputEndpoint, generation: number): Promise<number> => this.applyOutputConfiguration(configuration, endpoint, generation),
            onDisconnect: (targetId: string, generation: number): void => { this.disconnectOutput(targetId, generation); }, onArm: (targetId: string, generation: number): void => this.armOutput(targetId, generation),
            onDisarm: (targetId: string, generation: number): void => this.disarmOutput(targetId, generation) })
        }.width('100%').padding(12).backgroundColor(UiStyle.card).borderRadius(UiStyle.radiusCard)
        if (!this.showOutputSettings && this.outputDiagnostic.length > 0) {
          Text(this.outputDiagnostic).fontSize(UiStyle.helper).fontColor(UiStyle.danger).width('100%')
        }
      } else {
        Column({ space: 8 }) {
          Text('这个输出已不存在').fontSize(UiStyle.section).fontColor(UiStyle.ink)
          Button('返回设备列表').flatButton().constraintSize({ minHeight: 44 }).onClick(() => this.outputBack())
        }.width('100%').padding(24).backgroundColor(UiStyle.card).borderRadius(UiStyle.radiusCard)
      }
    }.width('100%')
  }

  changeOffset(axisOnly: boolean, delta: number): void {
    if (this.importing || this.axisNames.length === 0 || this.settingsReadOnly || this.recoveryRequired) { return; }
    try {
    if (axisOnly) { this.engine.setAxisOffset(this.axisNames[this.selectedAxis], Math.max(-60000, Math.min(60000, this.axisOffsetMs + delta))); }
    else { this.engine.setGlobalOffset(Math.max(-60000, Math.min(60000, this.globalOffsetMs + delta))); }
    this.status = 'Offset changed · positive offset delays the script';
    } catch (error) { this.status = (error as Error).message; }
    this.sync();
  }
  jumpChapter(direction: number): void {
    if (this.importing || this.axisNames.length === 0) { return; }
    const axis = this.axisNames[this.selectedAxis];
    const current = this.engine.getScriptPosition(axis);
    const chapters = this.engine.axisMetadata(this.axisNames[this.selectedAxis] || '').chapters;
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
    const bookmarks = this.engine.axisMetadata(this.axisNames[this.selectedAxis] || '').bookmarks;
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
  axisDocument(): FunscriptDocument {
    return this.engine.axisDocument(this.axisNames[this.selectedAxis] || '');
  }
  async restoreLoopingScripts(current: () => boolean): Promise<void> {
    const catalog = this.mediaCatalog; const root = this.libraryRoot; const request = this.libraryRequest;
    for (const axis of this.engine.activeRegistry().axes) {
      if (!current() || !this.libraryLoaded || catalog !== this.mediaCatalog || root !== this.libraryRoot) { return; }
      const uri = this.engine.getMotionConfiguration(axis.name, 'Looping Script').sourceUri || '';
      if (uri.length === 0) { continue; }
      let token: number = 0;
      try {
        const file = resolveManagedLoopingSelection(uri, catalog);
        token = this.engine.beginLoopingScriptRestore(axis.name); this.syncOutput();
        const owned = (): boolean => current() && request === this.libraryRequest && catalog === this.mediaCatalog &&
          root === this.libraryRoot && this.viewActive && this.foreground && this.engine.isScriptReloadCurrent(token);
        const json = await LibraryFiles.readScript(file.uri, owned);
        if (!owned()) { return; }
        const document = parseManagedLoopingScript(json, axis.name, this.engine.activeRegistry().axes.map(item => item.name));
        if (!this.engine.completeLoopingScriptRestore(token, document, uri)) { return; }
      } catch (error) {
        if (!current() || request !== this.libraryRequest || catalog !== this.mediaCatalog || root !== this.libraryRoot ||
          (token > 0 && !this.engine.isScriptReloadCurrent(token))) { return; }
        this.status = 'Looping script unavailable in Download: ' + axis.name + ' · ' + (error as Error).message;
      }
      finally { if (token > 0) { this.engine.cancelScriptReload(token); } }
    }
  }
  async applyAxisSettings(configuration: AxisConfiguration): Promise<void> {
    if (!this.viewActive || !this.foreground || this.settingsReadOnly || this.recoveryRequired) { return; }
    this.cancelKeyboardWork();
    const axis = this.axisNames[this.selectedAxis];
    try {
      const previous = this.engine.getAxisConfiguration(axis);
      const reload = previous.linkAxis !== configuration.linkAxis || previous.linkAxisHasPriority !== configuration.linkAxisHasPriority;
      this.engine.changeAxisConfiguration(axis, configuration, reload);
      if (reload) { await this.reloadManagedAxisScripts([axis]); }
    } catch (error) { this.status = (error as Error).message; }
    this.sync();
  }
  applySyncSettings(configuration: SyncConfiguration): void {
    if (!this.viewActive || !this.foreground || this.settingsReadOnly || this.recoveryRequired) { return; }
    this.cancelKeyboardWork();
    try { this.engine.changeSync(configuration); } catch (error) { this.status = (error as Error).message; }
    this.sync();
  }
  async applyMotionSettings(configuration: MotionProviderConfiguration, requestedAxis?: string): Promise<void> {
    this.cancelKeyboardWork();
    const axisName = requestedAxis ?? this.axisNames[this.selectedAxis];
    const motionRequest = (this.motionLoadRequests.get(axisName) || 0) + 1; this.motionLoadRequests.set(axisName, motionRequest);
    try {
      const previous = this.engine.getMotionConfiguration(axisName, configuration.id);
      if (configuration.id === 'Looping Script' && previous.sourceUri !== configuration.sourceUri) {
        const uri = configuration.sourceUri || '';
        if (uri.length === 0) {
          this.engine.changeMotionConfiguration(axisName, configuration); this.engine.setLoopingScript(axisName, null, ''); this.output.disarm();
        } else { await this.reloadManagedLoopingScript(axisName, uri, null, configuration); }
      } else { this.engine.changeMotionConfiguration(axisName, configuration); }
    } catch (error) { this.status = 'Motion settings: ' + (error as Error).message; }
    this.sync();
  }
  editDevice(action: string, profile?: DeviceProfile, id: string = '', name: string = ''): void {
    if (!this.viewActive || !this.foreground || this.settingsReadOnly || this.recoveryRequired) { return; }
    this.cancelKeyboardWork();
    try {
      if (action === 'select') { this.engine.selectProfile(id); }
      else if (action === 'change' && profile !== undefined) { this.engine.changeProfile(profile); }
      else if (action === 'clone') { this.engine.cloneProfile(id, name); }
      else if (action === 'remove') { this.engine.removeProfile(id); }
    } catch (error) { this.status = (error as Error).message; }
    this.sync();
  }
  @Builder
  devicePanel() {
    Column({ space: 8 }) {
      Button(this.showDeviceSettings ? t('Device profiles ⌃') : t('Device profiles ⌄')).flatButton().constraintSize({ minHeight: 44 }).width('100%')
        .backgroundColor(UiStyle.card).border({ width: 1, color: UiStyle.hairline }).borderRadius(14).fontWeight(FontWeight.Medium)
        .onClick(() => { this.showDeviceSettings = !this.showDeviceSettings; })
      Text(this.settingsMessage).fontSize(UiStyle.helper).fontColor(this.settingsReadOnly || this.recoveryRequired ? UiStyle.danger : UiStyle.muted).width('100%')
      if (this.recoveryRequired && !this.settingsReadOnly) {
        Button(t('Review recovered settings before saving')).flatButton().constraintSize({ minHeight: UiStyle.control }).width('100%').onClick(this.settingsRecoveryConfirmationHandler())
      }
      if (this.engine.settingsStatus().lastError !== null && !this.settingsReadOnly && !this.recoveryRequired) {
        Button(t('Retry saving settings')).flatButton().constraintSize({ minHeight: UiStyle.control }).width('100%').onClick(() => { this.engine.retrySettingsSave(); this.sync(); })
      }
      if (this.showDeviceSettings) {
        Text(t('Active now: ') + this.engine.activeRegistry().profile.name + t(' · profile changes apply after restart')).fontSize(UiStyle.helper).fontColor(UiStyle.warning)
        DeviceSettingsPanel({ draftOwner: this.settingsDraftOwner, draftScope: this.settingsScope('device'), draftEpoch: this.settingsDraftEpoch, profiles: this.profiles, selectedProfileId: this.selectedProfileId, activeProfileId: this.engine.activeRegistry().profile.id,
          compact: this.compactControls(), readOnly: this.settingsReadOnly || this.recoveryRequired,
          onRequestConfirmation: (request: ConfirmationRequest): void => this.openConfirmation(request),
          onSelectProfile: (id: string) => this.editDevice('select', undefined, id),
          onChangeProfile: (profile: DeviceProfile) => this.editDevice('change', profile),
          onImportProfile: (profile: DeviceProfile) => { this.engine.importProfile(profile); this.sync(); },
          onCloneProfile: (id: string, name: string) => this.editDevice('clone', undefined, id, name),
          onRemoveProfile: (id: string) => this.editDevice('remove', undefined, id) })
      }
    }.padding({ top: 12, bottom: 12 }).border({ width: { bottom: 1 }, color: UiStyle.edge }).width('100%')
  }
  @Builder
  motionPanel() {
    Column({ space: 8 }) {
      SettingsChoiceField({ label: 'Motion 编辑器', selected: this.motionEditorId, compact: this.compactControls(),
        options: MotionConfigurations.ids().map((id: string): SettingsOption => new SettingsOption(id, id)),
        onSelect: (id: string) => { if (MotionConfigurations.ids().some((value: string): boolean => value === id)) { this.motionEditorId = id; this.sync(); } } })
      ForEach([this.motionBindingKey()], (binding: string) => {
      MotionSettingsPanel({ draftOwner: this.settingsDraftOwner, draftScope: this.settingsScope('motion'), draftEpoch: this.settingsDraftEpoch, configuration: this.motionConfiguration, scriptResources: this.managedMotionScripts,
        compact: this.compactControls(), readOnly: this.settingsReadOnly || this.recoveryRequired,
        bindingKey: binding,
        onReset: this.motionResetHandler(this.axisNames[this.selectedAxis], this.engine.activeRegistry().revision, this.motionConfiguration),
        onGeometry: this.motionCanvasHandler(this.axisNames[this.selectedAxis], this.motionEditorId, this.engine.activeRegistry().revision, this.motionBindingKey()),
        onChange: this.motionSettingsHandler(this.axisNames[this.selectedAxis], this.motionEditorId, this.engine.activeRegistry().revision, this.motionConfiguration) })
      }, (binding: string): string => binding)
    }.width('100%')
  }
  @Builder
  syncPanel() {
    Column({ space: 12 }) {
      this.heading('Synchronization', 'LIVE PIPELINE · OUTPUT PERMISSION IS SEPARATE')
      SyncSettingsPanel({ draftOwner: this.settingsDraftOwner, draftScope: this.settingsScope('sync'), draftEpoch: this.settingsDraftEpoch, configuration: this.syncConfiguration, compact: this.compactControls(), readOnly: this.settingsReadOnly || this.recoveryRequired,
        onChange: (configuration: SyncConfiguration) => this.applySyncSettings(configuration) })
      SettingsChoiceField({ label: (this.axisNames[this.selectedAxis] || t('Axis')) + t(' curve'), selected: this.interpolationMode,
        options: [new SettingsOption('linear', 'Linear'), new SettingsOption('pchip', 'PCHIP'), new SettingsOption('makima', 'Makima'), new SettingsOption('step', 'Step')], compact: this.compactControls(),
        editable: this.axisNames.length > 0 && !this.importing && !this.openingVideo && !this.libraryBusy && !this.settingsReadOnly && !this.recoveryRequired,
        onSelect: (mode: string) => { if (mode === 'linear' || mode === 'pchip' || mode === 'makima' || mode === 'step') {
          const configuration = this.engine.getAxisConfiguration(this.axisNames[this.selectedAxis]); configuration.interpolationType = mode; this.applyAxisSettings(configuration); } } })
      SettingsChoiceField({ label: t('Playback speed'), selected: this.playbackSpeed.toString(), compact: this.compactControls(),
        options: [0.25, 0.5, 1, 1.5, 2, 4].map((value: number): SettingsOption => new SettingsOption(value.toString(), value.toString() + '×')),
        editable: !this.importing && !this.openingVideo && !this.libraryBusy,
        onSelect: (value: string) => { const speed = Number(value); if ([0.25, 0.5, 1, 1.5, 2, 4].indexOf(speed) >= 0) { this.setPlaybackSpeed(speed); } } })
      Text(t('Script scale: ') + Math.round(this.axisScale * 100) + '%').fontSize(UiStyle.body(this.compactControls())).fontColor(UiStyle.muted).width('100%')
      Slider({ value: this.axisScale, min: 0.01, max: 4, step: 0.01 }).attributeModifier(new MfpSliderMaterialModifier(this.materialRevision)).height(UiStyle.control).width('100%')
        .enabled(this.axisNames.length > 0 && !this.importing && !this.openingVideo && !this.libraryBusy && !this.settingsReadOnly && !this.recoveryRequired)
        .onChange(this.axisScaleHandler())
      Text(t('Global offset: ') + this.globalOffsetMs + t(' ms')).fontSize(UiStyle.body(this.compactControls())).fontColor(UiStyle.muted).width('100%')
      Row({ space: 8 }) {
        Button('−50').flatButton().constraintSize({ minHeight: UiStyle.control }).layoutWeight(1).backgroundColor(UiStyle.field).onClick(() => this.changeOffset(false, -50))
        Button(t('Reset')).flatButton().constraintSize({ minHeight: UiStyle.control }).layoutWeight(1).backgroundColor(UiStyle.field).onClick(() => this.changeOffset(false, -this.globalOffsetMs))
        Button('+50').flatButton().constraintSize({ minHeight: UiStyle.control }).layoutWeight(1).backgroundColor(UiStyle.field).onClick(() => this.changeOffset(false, 50))
      }
      Text((this.axisNames[this.selectedAxis] || t('Axis')) + t(' offset: ') + this.axisOffsetMs + t(' ms')).fontSize(UiStyle.body(this.compactControls())).fontColor(UiStyle.muted).width('100%')
      Row({ space: 8 }) {
        Button('−50').flatButton().constraintSize({ minHeight: UiStyle.control }).layoutWeight(1).backgroundColor(UiStyle.field).onClick(() => this.changeOffset(true, -50))
        Button(t('Reset')).flatButton().constraintSize({ minHeight: UiStyle.control }).layoutWeight(1).backgroundColor(UiStyle.field).onClick(() => this.changeOffset(true, -this.axisOffsetMs))
        Button('+50').flatButton().constraintSize({ minHeight: UiStyle.control }).layoutWeight(1).backgroundColor(UiStyle.field).onClick(() => this.changeOffset(true, 50))
      }
      Text(t('Positive offsets delay the script. Axis and motion edits apply live; sync follows the selected rules.')).fontSize(UiStyle.helper).fontColor(UiStyle.muted)
    }.padding({ top: 12, bottom: 12 }).border({ width: { bottom: 1 }, color: UiStyle.edge }).width('100%')
  }
  @Builder
  markerPanel() {
    if (this.engine.axisMetadata(this.axisNames[this.selectedAxis] || '').chapters.length > 0 || this.engine.axisMetadata(this.axisNames[this.selectedAxis] || '').bookmarks.length > 0) {
      Column({ space: 12 }) {
        this.heading('Script markers', 'SELECTED AXIS')
        Text(t(this.chapterLabel)).fontSize(UiStyle.body(this.compactControls())).fontColor(UiStyle.muted).width('100%').maxLines(2)
        if (this.engine.axisMetadata(this.axisNames[this.selectedAxis] || '').chapters.length > 0) {
          Text(t('Chapters: ') + this.engine.axisMetadata(this.axisNames[this.selectedAxis] || '').chapters.length).fontSize(UiStyle.body(this.compactControls())).fontColor(UiStyle.muted).width('100%')
          Row({ space: 8 }) {
            Button(t('Previous')).flatButton().constraintSize({ minHeight: UiStyle.control }).layoutWeight(1).backgroundColor(UiStyle.field).onClick(() => this.jumpChapter(-1))
            Button(t('Next')).flatButton().constraintSize({ minHeight: UiStyle.control }).layoutWeight(1).backgroundColor(UiStyle.field).onClick(() => this.jumpChapter(1))
          }
        }
        if (this.engine.axisMetadata(this.axisNames[this.selectedAxis] || '').bookmarks.length > 0) {
          Text(t('Bookmarks: ') + this.engine.axisMetadata(this.axisNames[this.selectedAxis] || '').bookmarks.length).fontSize(UiStyle.body(this.compactControls())).fontColor(UiStyle.muted).width('100%')
          Row({ space: 8 }) {
            Button(t('Previous')).flatButton().constraintSize({ minHeight: UiStyle.control }).layoutWeight(1).backgroundColor(UiStyle.field).onClick(() => this.jumpBookmark(-1))
            Button(t('Next')).flatButton().constraintSize({ minHeight: UiStyle.control }).layoutWeight(1).backgroundColor(UiStyle.field).onClick(() => this.jumpBookmark(1))
          }
        }
      }.padding({ top: 12, bottom: 12 }).border({ width: { bottom: 1 }, color: UiStyle.edge }).width('100%')
    }
  }
  @Builder
  transport() {
    Row({ space: 8 }) {
      Button(this.playing ? t('Pause') : (this.videoMode && this.durationMs > 0 && this.positionMs >= this.durationMs ? t('Rewind') : t('Play'))).flatButton().height(48).layoutWeight(1)
        .backgroundColor(this.transportPlayEnabled() ? UiStyle.accent : UiStyle.field)
        .fontColor(this.transportPlayEnabled() ? UiStyle.onAccent : UiStyle.muted)
        .border({ width: 0 }).fontWeight(FontWeight.Medium)
        .enabled(this.transportPlayEnabled()).onClick(() => { if (this.videoMode) { void this.videoPlaybackAction(); } else { void this.playPause(); } })
      Button(t('Stop output')).flatButton().height(48).layoutWeight(1)
        .backgroundColor(UiStyle.dangerSoft).fontColor(UiStyle.danger).border({ width: 0 }).fontWeight(FontWeight.Medium)
        .onClick(() => this.stop())
    }.width('100%').padding(8).backgroundColor(UiStyle.card).borderRadius(UiStyle.radiusCard)
  }
  @Builder
  workspaceStatus() {
    Column({ space: 8 }) {
      if (this.videoMode && this.workspacePreviewCollapsed) {
        Row({ space: 8 }) {
          Text('视频预览已收起').fontSize(UiStyle.helper).fontColor(UiStyle.muted).layoutWeight(1)
          Button('显示视频').flatButton().height(40).padding({ left: 14, right: 14 })
            .backgroundColor(UiStyle.accentSoft).fontColor(UiStyle.accent).border({ width: 0 })
            .onClick(() => this.toggleWorkspacePreview())
        }.width('100%')
      }
      if (this.sessionFault.length > 0) {
        Text(t('Playback fault · output closed: ') + this.sessionFault).fontSize(UiStyle.body(this.compactControls())).fontColor(UiStyle.danger).width('100%')
        Button('安全重建运行状态并停止').flatButton().constraintSize({ minHeight: UiStyle.control }).width('100%').enabled(!this.runtimeBusy).onClick(() => { this.resetRuntimeSafely(); })
      }
      Text(t(this.status)).fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%')
    }.padding({ top: 12, bottom: 12 }).width('100%')
  }
  @Builder
  sourceColumn() {
    Column({ space: 20 }) {
      this.workspaceStatus()
      if (this.resourceFocus && this.showResources) { this.libraryPanel() }
      this.sourcePanel()
      if (!this.resourceFocus && this.showResources) { this.libraryPanel() }
      this.outputPanel()
      this.preferencesPanel()
      this.devicePanel()
    }.width('100%')
  }
  @Builder
  videoStage() {
    Stack({ alignContent: Alignment.TopStart }) {
      // This exact Surface is unconditional. Only its bounds change.
      XComponent({ id: 'mfp-native-video', type: 'surface', controller: this.videoSurface })
        .width('100%').height(this.videoPictureHeight()).backgroundColor('#000000')
        .hitTestBehavior(HitTestMode.None).zIndex(0)
        .onLoad(() => this.surfaceChanged(this.videoSurface.getXComponentSurfaceId(), true))
      // Gestures live on ArkUI, never on the native Surface or the chrome parent.
      Column() {
        Row({ space: 6 }) {
          Column().width(6).height(6).borderRadius(3).backgroundColor(this.playing ? UiStyle.success : '#FFFFFFB3')
          Text(this.videoPlaybackStatus())
            .fontSize(14).fontColor('#FFFFFF').maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
        }.padding({ left: 10, right: 12, top: 6, bottom: 6 }).backgroundColor('#99000000').borderRadius(14)
          .visibility(this.videoFloating || this.videoControlsVisible ? Visibility.Visible : Visibility.Hidden)
          .hitTestBehavior(HitTestMode.None)
      }.width('100%').height(this.videoPictureHeight()).justifyContent(FlexAlign.Start)
        .padding({ left: 10, top: 10 })
        .backgroundColor('#00000000').hitTestBehavior(HitTestMode.Block).zIndex(1)
        .accessibilityText('视频画面：单击暂停或继续；浮窗可拖动')
        .gesture(GestureGroup(GestureMode.Exclusive,
          PanGesture({ fingers: 1, direction: PanDirection.All, distance: 8 })
            .onActionStart(this.videoGestureHandler('start')).onActionUpdate(this.videoGestureHandler('update'))
            .onActionEnd(this.videoGestureHandler('end')).onActionCancel(this.videoGestureHandler('cancel')),
          TapGesture({ count: 1, fingers: 1 }).onAction(this.videoGestureHandler('tap'))))
      Column({ space: 0 }) {
        Row({ space: 6 }) {
          Button(this.videoActionPending ? '…' : this.playing ? '暂停' : this.videoState === 'completed' ? '重播' : '播放')
            .flatButton().layoutWeight(1).height(40).responseRegion({ y: -4, width: '100%', height: 48 }).padding({ left: 12, right: 12 }).fontSize(15)
            .backgroundColor(UiStyle.accent).fontColor(UiStyle.onAccent).border({ width: 0 }).fontWeight(FontWeight.Medium)
            .borderRadius(20).enabled(this.videoCanToggle())
            .accessibilityText(this.playing ? '暂停视频' : '播放视频').onClick(() => { void this.videoPlaybackAction(); })
          if (this.videoFloating && !this.videoFullscreen) {
            Button('展开').flatButton().width(72).height(40).responseRegion({ y: -4, width: '100%', height: 48 }).padding(4).fontSize(15)
              .backgroundColor(UiStyle.field).border({ width: 1, color: UiStyle.hairline }).borderRadius(20)
              .onClick(() => this.setVideoFloating(false))
          } else {
            if (this.videoFullscreen) {
              Button('■ 停止').flatButton().width(76).height(40).responseRegion({ y: -4, width: '100%', height: 48 }).padding(4).fontSize(15)
                .backgroundColor(UiStyle.dangerSoft).fontColor(UiStyle.danger).border({ width: 0 }).borderRadius(20)
                .accessibilityText('停止输出和播放').onClick(() => this.stop())
            }
            if (this.currentScreen !== 'player' && this.widthVp >= 300) {
              Button('浮窗').flatButton().width(56).height(40).responseRegion({ y: -4, width: '100%', height: 48 }).padding(4).fontSize(15)
                .backgroundColor(UiStyle.field).border({ width: 1, color: UiStyle.hairline }).borderRadius(20)
                .onClick(() => this.setVideoFloating(true))
            }
            Button(this.videoFullscreen ? '退出' : '全屏').flatButton().width(this.widthVp < 360 ? 52 : 64).height(40).responseRegion({ y: -4, width: '100%', height: 48 }).padding(4).fontSize(15)
              .backgroundColor(UiStyle.field).border({ width: 1, color: UiStyle.hairline }).borderRadius(20)
              .accessibilityText(this.videoFullscreen ? (this.presentationMode === 'native-fullscreen' ? '退出系统全屏' : '退出窗口内全屏') : '全屏')
              .onClick(() => this.setVideoFullscreen(!this.videoFullscreen))
          }
        }.width('100%').height(48).padding({ left: 8, right: 8, top: 4, bottom: 4 }).hitTestBehavior(HitTestMode.Default)
        Canvas(this.playerCanvas).width('100%').height(32).backgroundColor(UiStyle.card)
          .onReady(() => this.drawTrace()).onAreaChange(() => this.drawTrace())
          .onClick((event: ClickEvent) => { this.cancelVideoChromeTimer(); this.seekTransport(Math.max(0, Math.min(1, event.x / Math.max(1, this.playerCanvas.width))) * this.durationMs); this.scheduleVideoChromeHide(); })
        if (this.workspaceLayout().controlsHeight >= 136) {
          Row({ space: 8 }) {
            Slider({ value: this.positionMs, min: 0, max: Math.max(1, this.durationMs), step: 1 }).attributeModifier(new MfpSliderMaterialModifier(this.materialRevision))
              .layoutWeight(1).height(48).selectedColor(UiStyle.accent).trackColor(UiStyle.edge).blockColor(UiStyle.accent)
              .enabled(this.videoReady && !this.importing && !this.openingVideo && !this.libraryBusy)
              .onChange((value: number, mode: SliderChangeMode) => {
                this.cancelVideoChromeTimer(); this.seekTransport(value);
                if (mode === SliderChangeMode.End || mode === SliderChangeMode.Click) { this.scheduleVideoChromeHide(); }
              })
            Text((this.positionMs / 1000).toFixed(1) + ' / ' + (this.durationMs / 1000).toFixed(1) + ' s')
              .fontSize(14).fontColor(UiStyle.muted).maxLines(1)
          }.padding({ left: 8, right: 8 }).width('100%').height(48)
        }
      }.width('100%').height(this.workspaceLayout().controlsHeight).backgroundColor(UiStyle.card)
        .borderRadius({ topLeft: 16, topRight: 16 })
        .shadow({ radius: 18, color: UiStyle.shadowColor, offsetY: -3 })
        .position({ x: 0, y: Math.max(0, this.workspaceLayout().video.height - this.workspaceLayout().controlsHeight) })
        .visibility(!this.videoFullscreen || this.videoControlsVisible ? Visibility.Visible : Visibility.Hidden)
        .hitTestBehavior(HitTestMode.Default).zIndex(2).clip(true)
    }.width(Math.max(1, this.workspaceLayout().video.width)).height(Math.max(1, this.workspaceLayout().video.height))
      .position({ x: this.workspaceLayout().video.x, y: this.workspaceLayout().video.y })
      .visibility(this.videoMode && this.workspaceLayout().video.width > 0 ? Visibility.Visible : Visibility.Hidden)
      .backgroundColor('#000000').zIndex(this.videoFullscreen ? 20 : this.videoFloating ? 10 : 1).clip(true)
  }
  @Builder
  workspaceSettings() {
    Stack({ alignContent: Alignment.TopStart }) {
      if (!this.workspaceLayout().sideBySide) {
        if (this.wideWorkspace()) {
          Row({ space: UiStyle.paneGap }) {
            Scroll(this.sourceScroller) { this.playerPreview() }.layoutWeight(1).height('100%').align(Alignment.Top)
            this.inspector()
          }.padding({ left: this.contentPadding(), right: this.contentPadding(), top: 16, bottom: 16 }).width('100%').height('100%').alignItems(VerticalAlign.Top)
        } else {
          Column({ space: 12 }) {
            this.transport()
            this.inspector()
          }.padding({ left: this.contentPadding(), right: this.contentPadding(), top: 12, bottom: 12 }).width('100%').height('100%')
        }
      } else {
        this.inspector()
      }
    }.width(this.workspaceLayout().settings.width).height(Math.max(1, this.workspaceLayout().settings.height))
      .position({ x: this.workspaceLayout().settings.x, y: this.workspaceLayout().settings.y })
      .visibility(this.currentScreen === 'workspace' && !this.videoFullscreen ? Visibility.Visible : Visibility.Hidden).clip(true)
  }
  @Builder
  inspectorWarning() {
      if (this.diagnosticBlocked || this.serialProbeState.quarantined || this.settingsReadOnly || this.recoveryRequired || this.sessionFault.length > 0) {
        Text(this.sessionFault.length > 0 ? '运行故障 · 输出关闭' : this.settingsReadOnly || this.recoveryRequired ? '设置只读 / 等待恢复' : '诊断清理未确认 · 连接与发送暂不可用').fontSize(UiStyle.helper).fontColor(UiStyle.danger).width('100%').padding({ top: 8, bottom: 8 })
      }
  }
  @Builder
  inspector() {
    Column({ space: 0 }) {
      this.toolNavigation()
      Row({ space: 8 }) {
        Column().width(6).height(6).borderRadius(3)
          .backgroundColor(this.outputTargets.some(target => target.connection === 'fault') ? UiStyle.danger : this.outputTargets.some(target => target.armed) ? UiStyle.success : UiStyle.muted)
        Text(this.outputSummary()).fontSize(UiStyle.helper).fontColor(this.outputTargets.some(target => target.connection === 'fault') ? UiStyle.danger : UiStyle.muted)
          .layoutWeight(1).maxLines(2).wordBreak(WordBreak.BREAK_ALL)
      }.width('100%').padding({ left: 10, right: 10, top: 7, bottom: 7 }).margin({ top: 8, bottom: 4 })
        .backgroundColor(UiStyle.card).borderRadius(12).border({ width: 1, color: UiStyle.hairline })
      if (this.inspectorHeight() >= 220) { this.inspectorWarning() }
      Scroll(this.settingsScroller) {
        Column({ space: 16 }) {
          if (this.inspectorHeight() < 220) { this.inspectorWarning() }
          this.workspaceStatus()
          if (this.workspaceTool === 'script') { this.scriptArea() }
          if (this.workspaceTool === 'output') { this.outputPanel() }
          if (this.workspaceTool === 'media') {
            this.mediaToolbar()
            Button('打开视频列表').flatButton().height(48).width('100%')
              .backgroundColor(UiStyle.card).border({ width: 1, color: UiStyle.hairline }).fontWeight(FontWeight.Medium)
              .onClick(() => this.showLibrary())
            this.sourcePanel()
            Button(this.showResources ? '收起资源详情' : '高级资源详情与手动配对').flatButton().height(48).width('100%')
              .backgroundColor(UiStyle.card).border({ width: 1, color: UiStyle.hairline }).fontWeight(FontWeight.Medium)
              .onClick(() => { this.showResources = !this.showResources; })
            if (this.showResources) { this.libraryPanel() }
          }
          if (this.workspaceTool === 'settings') {
            this.preferencesPanel()
            this.devicePanel()
            Text(this.materialStatusLabel()).fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%')
            Text('旧柚趣播 ' + APP_VERSION_NAME + ' · OHOS').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%')
            if (this.showPortInfo) { Text('需要明确连接和启用发送。本地写成功不等于硬件执行确认；串口 CH 实验仅写。设备视觉、IME 与硬件互通仍需实测。').fontSize(UiStyle.helper).fontColor(UiStyle.muted).width('100%') }
          }
          if (!this.videoMode && !this.wideWorkspace() && this.workspaceTool === 'script') { this.traceArea() }
        }.padding({ top: 12, bottom: this.videoFloating ? this.workspaceLayout().video.height + 24 : 20 }).width('100%')
      }.width('100%').layoutWeight(1).align(Alignment.Top)
    }.width(this.workspaceLayout().sideBySide || !this.wideWorkspace() ? '100%' : this.inspectorWidth()).height(this.inspectorHeight())
      .padding({ left: this.workspaceLayout().sideBySide ? this.contentPadding() : 0, right: this.workspaceLayout().sideBySide ? this.contentPadding() : 0, top: 8 })
  }
  @Builder
  toolNavigation() {
    Row({ space: 2 }) {
      ForEach(['script', 'output', 'media', 'settings'], (tool: string) => {
        Button(tool === 'script' ? '脚本' : tool === 'output' ? '连接' : tool === 'media' ? '媒体' : '设置').flatButton()
          .width('25%').height(40).responseRegion({ y: -4, width: '100%', height: 48 }).padding({ left: 4, right: 4 }).fontSize(15)
          .backgroundColor(this.workspaceTool === tool ? UiStyle.card : Color.Transparent)
          .fontColor(this.workspaceTool === tool ? UiStyle.accent : UiStyle.muted)
          .fontWeight(this.workspaceTool === tool ? FontWeight.Medium : FontWeight.Normal)
          .borderRadius(20).border({ width: 0 })
          .shadow({ radius: this.workspaceTool === tool ? 10 : 0, color: UiStyle.shadowColor, offsetY: this.workspaceTool === tool ? 2 : 0 })
          .accessibilityText((this.workspaceTool === tool ? '当前工具：' : '切换工具：') + (tool === 'script' ? '脚本' : tool === 'output' ? '连接' : tool === 'media' ? '媒体' : '设置'))
          .onClick(() => this.selectWorkspaceTool(tool))
      })
    }.padding(4).width('100%').height(48).borderRadius(UiStyle.radiusPill).backgroundColor(UiStyle.fillStrong)
  }
  @Builder
  wideTrace() {
    if (this.currentScreen === 'workspace' && this.videoMode && !this.videoFullscreen && this.workspaceLayout().trace.height > 0) {
      Scroll(this.sourceScroller) { this.traceArea() }
        .padding({ left: this.contentPadding(), right: this.contentPadding(), top: 16, bottom: 16 })
        .width(this.workspaceLayout().trace.width).height(this.workspaceLayout().trace.height)
        .position({ x: this.workspaceLayout().trace.x, y: this.workspaceLayout().trace.y }).align(Alignment.Top)
    }
  }
  @Builder
  globalStopButton() {
    Button('停止').flatButton().width(64).height(40).flexShrink(0)
      .backgroundColor(UiStyle.danger).fontColor(UiStyle.onAccent).border({ width: 0 }).fontWeight(FontWeight.Medium)
      .responseRegion({ y: -4, width: '100%', height: 48 })
      .accessibilityText('全局停止 · F12')
      .onClick(() => this.stop())
  }
  @Builder
  headerBrand() {
    Row({ space: 8 }) {
      Stack({ alignContent: Alignment.Center }) {
        Column().width('100%').height('100%')
          .linearGradient({ angle: 135, colors: [[UiStyle.accent, 0.0], ['#5B94FF', 1.0]] })
        Text('M').fontSize(18).fontWeight(FontWeight.Bold).fontColor('#FFFFFF')
      }.width(36).height(36).borderRadius(10).clip(true)
      Text(this.widthVp < 520 ? '旧柚' : '旧柚趣播')
        .fontSize(this.widthVp < 520 ? 18 : 20).fontColor(UiStyle.ink).fontWeight(FontWeight.Bold).maxLines(1)
    }.layoutWeight(1).alignItems(VerticalAlign.Center)
  }
  @Builder
  headerNav(label: string, selected: boolean, target: string) {
    Button(label).flatButton().height(40).padding({ left: this.widthVp < 380 ? 10 : 14, right: this.widthVp < 380 ? 10 : 14 })
      .fontSize(15).fontWeight(selected ? FontWeight.Medium : FontWeight.Normal)
      .backgroundColor(selected ? UiStyle.card : Color.Transparent)
      .fontColor(selected ? UiStyle.accent : UiStyle.muted)
      .borderRadius(20).border({ width: 0 })
      .shadow({ radius: selected ? 10 : 0, color: UiStyle.shadowColor, offsetY: selected ? 2 : 0 })
      .onClick(() => { if (target === 'library') { this.showLibrary(); } else { this.selectWorkspaceTool(this.workspaceTool); } })
  }
  @Builder
  headerTools() {
    Button('⚙').flatButton().width(40).height(40).flexShrink(0)
      .backgroundColor(UiStyle.fill).border({ width: 0 }).fontSize(19)
      .accessibilityText('更多 · 通用、输入与设备设置')
      .onClick(() => { this.showPortInfo = true; this.selectWorkspaceTool('settings'); })
  }
  @Builder
  workspaceHeader() {
    Row({ space: this.widthVp < 380 ? 4 : 8 }) {
      if (this.currentScreen === 'player') {
        Button('‹').flatButton().width(40).height(40).fontSize(24)
          .backgroundColor(UiStyle.fill).border({ width: 0 }).accessibilityText('返回视频列表').onClick(() => this.showLibrary())
        Text(this.videoName || '播放器').fontSize(16).fontColor(UiStyle.ink).fontWeight(FontWeight.Medium).layoutWeight(1).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
        Button('设置').flatButton().width(64).height(40).fontSize(15)
          .backgroundColor(UiStyle.fill).border({ width: 0 }).accessibilityText('轴与连接设置').onClick(() => this.selectWorkspaceTool('script'))
      } else {
        this.headerBrand()
        Row({ space: 2 }) {
          this.headerNav('视频', this.currentScreen === 'library', 'library')
          this.headerNav('控制', this.currentScreen === 'workspace', 'workspace')
        }.padding(4).height(48).backgroundColor(UiStyle.fillStrong).borderRadius(UiStyle.radiusPill)
        if (this.videoMode && this.widthVp >= 520 && this.currentScreen === 'workspace') {
          Button('播放页').flatButton().width(64).height(40).fontSize(14)
            .backgroundColor(UiStyle.fill).border({ width: 0 }).accessibilityText('返回播放器').onClick(() => this.selectScreen('player'))
        }
      }
      this.globalStopButton()
    }.padding({ left: 12, right: 12, top: 6, bottom: 6 })
      .width('100%').height(this.workspaceLayout().headerHeight).backgroundColor(UiStyle.headerSurface)
      .backgroundBlurStyle(BlurStyle.COMPONENT_THICK)
      .border({ width: { bottom: 1 }, color: UiStyle.hairline })
      .shadow({ radius: 12, color: UiStyle.shadowColor, offsetY: 4 })
      .visibility(this.videoFullscreen ? Visibility.Hidden : Visibility.Visible)
  }
  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      this.workspaceSettings()
      if (this.currentScreen === 'library') { this.videoLibraryScreen() }
      this.wideTrace()
      // A layout switch only moves/resizes this same surface; no if/else around it.
      this.videoStage()
      this.workspaceHeader()
      if (this.currentScreen === 'player' && (this.openingVideo || this.importing || !this.videoReady || this.sessionFault.length > 0)) {
        Text(this.sessionFault.length > 0 ? '运行故障 · 输出关闭：' + this.sessionFault : this.openingVideo || this.importing ? '正在打开视频…' : t(this.status)).fontSize(14).fontColor('#FFFFFF').padding(12)
          .width('100%').backgroundColor('#B3000000').zIndex(30).position({ x: 0, y: this.workspaceLayout().headerHeight })
      }
      if (this.currentScreen === 'player' && this.videoFullscreen && this.presentationMode === 'in-window' && !this.presentationRestorePending && this.presentationReason.length > 0 && this.videoReady && !this.openingVideo && !this.importing && this.sessionFault.length === 0) {
        Text('当前为窗口内全屏：' + this.presentationReason).fontSize(14).fontColor('#FFFFFF').padding(8)
          .width('100%').backgroundColor('#B3000000').zIndex(30).position({ x: 0, y: this.workspaceLayout().headerHeight })
      }
      if (this.presentationRestorePending) {
        Column({ space: 4 }) {
          Text('窗口尚未恢复：' + this.presentationReason).fontSize(UiStyle.helper).fontColor('#FFFFFF').width('100%')
          Button('重试退出系统全屏').flatButton().constraintSize({ minHeight: UiStyle.control }).width('100%').onClick(() => this.setVideoFullscreen(false))
        }.padding(8).width(Math.max(1, this.widthVp - 16)).constraintSize({ maxWidth: 600 })
          .backgroundColor(UiStyle.danger).zIndex(30).position({ x: 8, y: this.videoFullscreen ? 8 : this.workspaceLayout().headerHeight + 8 })
      }
      if (this.errorNoticeMode === 'snackbar') {
        Column({ space: 8 }) {
          Scroll() { Text(this.errorNoticeMessage).fontSize(UiStyle.body(this.compactControls())).fontColor('#FFFFFF').width('100%') }
            .width('100%').height(Math.max(52, Math.min(120, this.heightVp * 0.22)))
          Row({ space: 8 }) {
            Button('关闭提示').flatButton().constraintSize({ minHeight: UiStyle.control }).layoutWeight(1).onClick(this.errorDismissHandler(this.errorNoticeId))
            Button('全局停止').flatButton().constraintSize({ minHeight: 52 }).layoutWeight(1).fontColor(UiStyle.danger).onClick(() => this.stop())
          }.width('100%')
        }.padding(12).width('100%').backgroundColor(UiStyle.danger).zIndex(30).align(Alignment.Bottom)
      }

    }.width('100%').height('100%').backgroundColor(UiStyle.page).focusable(true)
      .onAreaChange((_old: Area, area: Area) => this.resizeWorkspace(Number(area.width), Number(area.height)))
      .onBlur(() => this.cancelKeyboardWork())
      .onKeyPreIme(this.keyboardPreImeHandler())
      .onKeyEventDispatch(this.keyboardDispatchHandler())
  }
}
