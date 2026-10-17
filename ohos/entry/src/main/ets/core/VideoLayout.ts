/** Geometry only, in vp. Layout changes never own or restart the native player. */
export class WorkspaceRect {
  x: number;
  y: number;
  width: number;
  height: number;
  constructor(x: number, y: number, width: number, height: number) {
    this.x = x; this.y = y; this.width = width; this.height = height;
  }
}

export class VideoWorkspaceLayout {
  headerHeight: number;
  video: WorkspaceRect;
  settings: WorkspaceRect;
  sideBySide: boolean;
  controlsHeight: number;
  trace: WorkspaceRect;
  constructor(headerHeight: number, video: WorkspaceRect, settings: WorkspaceRect,
    sideBySide: boolean, controlsHeight: number) {
    this.headerHeight = headerHeight; this.video = video; this.settings = settings;
    this.sideBySide = sideBySide; this.controlsHeight = controlsHeight;
    this.trace = new WorkspaceRect(0, 0, 0, 0);
  }
}

/** Split inside the app's measured safe content area; do not use physical screen size.
 * Native VIDEO_SCALE_TYPE_SCALED_ASPECT handles source aspect ratio inside video.
 * Reserving controls below the surface means they cannot cover/crop a video frame.
 */
export function videoWorkspaceLayout(width: number, height: number,
  videoVisible: boolean, fullscreen: boolean, orientation: 'auto' | 'vertical' | 'horizontal' = 'auto'): VideoWorkspaceLayout {
  const w = Number.isFinite(width) && width > 0 ? width : 1;
  const h = Number.isFinite(height) && height > 0 ? height : 1;
  // Short title below360vp keeps the52vp Stop and More on one safe row.
  const header = Math.min(72, h);
  const available = Math.max(0, h - header);
  const empty = new WorkspaceRect(0, header, 0, 0);
  if (!videoVisible) {
    return new VideoWorkspaceLayout(header, empty, new WorkspaceRect(0, header, w, available), false, 0);
  }
  if (fullscreen) {
    return new VideoWorkspaceLayout(0, new WorkspaceRect(0, 0, w, h),
      new WorkspaceRect(0, h, w, 0), false, Math.min(104, h));
  }
  // 240 vp of native video + 8 vp separation + 320 vp settings.
  // A 600-vp breakpoint unnecessarily collapsed 568-vp landscape phones.
  const beside = orientation !== 'vertical' && w >= 568 && (orientation === 'horizontal' || w > h || w >= 1000);
  if (beside) {
    const gap = 8;
    const settingsWidth = Math.max(320, Math.min(480, w * 0.34));
    const videoWidth = w - settingsWidth - gap;
    const traceHeight = w >= 1000 && h >= 600 ? Math.min(264, available * 0.34) : 0;
    const layout = new VideoWorkspaceLayout(header, new WorkspaceRect(0, header, videoWidth, available - traceHeight),
      new WorkspaceRect(videoWidth + gap, header, settingsWidth, available), true, Math.min(available < 320 ? 52 : 104, available));
    if (traceHeight > 0) { layout.trace = new WorkspaceRect(0, header + available - traceHeight, videoWidth, traceHeight); }
    return layout;
  }
  // A portrait phone/tablet retains a usable independently scrolling settings area.
  // Extremely narrow landscape windows cannot fit both panes horizontally.
  // Use the existing compact control row (seek remains in the settings pane)
  // rather than consume most of the native surface with 104 vp of controls.
  const narrowLandscape = w > h;
  const controls = narrowLandscape || available < 500 ? 52 : 104;
  const fraction = narrowLandscape ? 0.63 : 0.43;
  // The four-tool navigation and real output summary are fixed above the scroll.
  // Reserve usable inspector space even in a short forced-vertical window.
  // Such windows show a smaller video preview; fullscreen remains available.
  const inspectorBudget = Math.min(156, available);
  const videoBudget = Math.max(0, available - inspectorBudget - Math.min(8, available - inspectorBudget));
  const videoHeight = Math.min(videoBudget, Math.max(narrowLandscape ? 0 : 132,
    Math.min(w * 9 / 16 + controls, available * fraction)));
  const gap = Math.min(8, Math.max(0, available - videoHeight));
  return new VideoWorkspaceLayout(header, new WorkspaceRect(0, header, w, videoHeight),
    new WorkspaceRect(0, header + videoHeight + gap, w, Math.max(0, available - videoHeight - gap)),
    false, Math.min(controls, videoHeight));
}

/** Three destinations share one permanently mounted Surface. Library and phone
 * controls hide that surface; the player owns all content below its small bar. */
export function applicationWorkspaceLayout(width: number, height: number, screen: string,
  videoVisible: boolean, fullscreen: boolean, orientation: 'auto' | 'vertical' | 'horizontal' = 'auto'): VideoWorkspaceLayout {
  const w = Number.isFinite(width) && width > 0 ? width : 1;
  const h = Number.isFinite(height) && height > 0 ? height : 1;
  if (screen === 'player' && videoVisible) {
    const header = fullscreen ? 0 : Math.min(60, h);
    const available = Math.max(0, h - header);
    return new VideoWorkspaceLayout(header, new WorkspaceRect(0, header, w, available),
      new WorkspaceRect(0, h, w, 0), false, Math.min(100, available));
  }
  if (screen === 'workspace' && videoVisible && w >= 900) {
    return videoWorkspaceLayout(w, h, true, false, orientation);
  }
  const header = Math.min(60, h);
  return new VideoWorkspaceLayout(header, new WorkspaceRect(0, header, 0, 0),
    new WorkspaceRect(0, header, w, Math.max(0, h - header)), false, 0);
}
