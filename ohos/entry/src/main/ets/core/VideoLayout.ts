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
  constructor(headerHeight: number, video: WorkspaceRect, settings: WorkspaceRect,
    sideBySide: boolean, controlsHeight: number) {
    this.headerHeight = headerHeight; this.video = video; this.settings = settings;
    this.sideBySide = sideBySide; this.controlsHeight = controlsHeight;
  }
}

/** Split inside the app's measured safe content area; do not use physical screen size.
 * Native VIDEO_SCALE_TYPE_SCALED_ASPECT handles source aspect ratio inside video.
 * Reserving controls below the surface means they cannot cover/crop a video frame.
 */
export function videoWorkspaceLayout(width: number, height: number,
  videoVisible: boolean, fullscreen: boolean): VideoWorkspaceLayout {
  const w = Number.isFinite(width) && width > 0 ? width : 1;
  const h = Number.isFinite(height) && height > 0 ? height : 1;
  const header = Math.min(48, h);
  const available = Math.max(0, h - header);
  const empty = new WorkspaceRect(0, header, 0, 0);
  if (!videoVisible) {
    return new VideoWorkspaceLayout(header, empty, new WorkspaceRect(0, header, w, available), false, 0);
  }
  if (fullscreen) {
    return new VideoWorkspaceLayout(0, new WorkspaceRect(0, 0, w, h),
      new WorkspaceRect(0, h, w, 0), false, Math.min(84, h));
  }
  const beside = w >= 600 && (w > h || w >= 1000);
  if (beside) {
    const gap = 8;
    const settingsWidth = Math.max(320, Math.min(520, w * 0.4));
    const videoWidth = w - settingsWidth - gap;
    return new VideoWorkspaceLayout(header, new WorkspaceRect(0, header, videoWidth, available),
      new WorkspaceRect(videoWidth + gap, header, settingsWidth, available), true, Math.min(84, available));
  }
  // A portrait phone/tablet retains a usable independently scrolling settings area.
  const videoHeight = Math.min(available, Math.max(132, Math.min(w * 9 / 16 + 84, available * 0.44)));
  const gap = Math.min(8, Math.max(0, available - videoHeight));
  return new VideoWorkspaceLayout(header, new WorkspaceRect(0, header, w, videoHeight),
    new WorkspaceRect(0, header + videoHeight + gap, w, Math.max(0, available - videoHeight - gap)),
    false, Math.min(84, videoHeight));
}
