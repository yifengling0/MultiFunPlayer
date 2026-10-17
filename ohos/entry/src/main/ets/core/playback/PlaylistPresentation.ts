import { InternalPlaylist, InternalPlaylistItem } from './InternalPlaylist';
import { MediaLoopControls, AutoSkipToScriptStart, seekToScriptStart } from './MediaControls';
import { AxisChapter, AxisKeyframe } from '../AxisScriptStore';

/** Immutable-by-convention view DTO; the host replaces it after every command. */
export class PlaylistPanelRow {
  index: number;
  name: string;
  associationId: string;
  exists: boolean;
  durationSeconds: number;
  constructor(item: InternalPlaylistItem, index: number) {
    this.index = index; this.name = item.name; this.associationId = item.associationId;
    this.exists = item.exists; this.durationSeconds = item.durationSeconds;
  }
}
export class PlaylistPanelSnapshot {
  rows: PlaylistPanelRow[] = [];
  managedRows: PlaylistPanelRow[] = [];
  currentIndex: number = -1;
  hasPlaylist: boolean = false;
  connected: boolean = false;
  mediaConnected: boolean = false;
  busy: boolean = false;
  readOnly: boolean = false;
  error: string = '';
  looping: boolean = false;
  shuffling: boolean = false;
  positionSeconds: number = Number.NaN;
  durationSeconds: number = Number.NaN;
  loopStart: number | null = null;
  loopEnd: number | null = null;
  autoSkipEnabled: boolean = true;
  autoSkipOffset: number = -5;
  autoSkipPending: boolean = false;
  loadAdditionalScripts: boolean = false;
  autoConnect: boolean = false;
}
export class PlaylistPanelAction {
  kind: string;
  index: number;
  value: number;
  enabled: boolean;
  constructor(kind: string, index: number = -1, value: number = 0, enabled: boolean = false) {
    this.kind = kind; this.index = index; this.value = value; this.enabled = enabled;
  }
}
export class PlaylistActionResult {
  accepted: boolean = false;
  seekSeconds: number | null = null;
  /** Host-only requests never perform I/O in this adapter. */
  hostRequest: string = '';
}
export class PlaylistActionContext {
  connected: boolean = false;
  mediaConnected: boolean = false;
  busy: boolean = false;
  readOnly: boolean = false;
  managedItems: InternalPlaylistItem[] = [];
  positionSeconds: number = Number.NaN;
  durationSeconds: number = Number.NaN;
  axisChapters: (AxisChapter[] | null)[] = [];
  axisKeyframes: (AxisKeyframe[] | null)[] = [];
}
/** Pure controller. Host executes requested seeks via its existing pipeline and
 * drains playlist events itself, preserving load ordering and association IDs.
 * No clocks, disk access, persistence, outputs or independent media position. */
export class PlaylistPresentation {
  static snapshot(playlist: InternalPlaylist, loop: MediaLoopControls,
    autoSkip: AutoSkipToScriptStart, context: PlaylistActionContext): PlaylistPanelSnapshot {
    const view = new PlaylistPanelSnapshot();
    view.rows = playlist.playlistItems.map((item, index) => new PlaylistPanelRow(item, index));
    view.managedRows = context.managedItems.map((item, index) => new PlaylistPanelRow(item, index));
    view.hasPlaylist = playlist.hasPlaylist;
    view.currentIndex = playlist.playlistIndex; view.connected = context.connected;
    view.mediaConnected = context.mediaConnected; view.busy = context.busy; view.readOnly = context.readOnly;
    view.looping = playlist.isLooping; view.shuffling = playlist.isShuffling;
    view.positionSeconds = context.positionSeconds; view.durationSeconds = context.durationSeconds;
    view.loopStart = loop.startPosition; view.loopEnd = loop.endPosition;
    view.autoSkipEnabled = autoSkip.enabled; view.autoSkipOffset = autoSkip.offsetSeconds;
    view.autoSkipPending = autoSkip.pending;
    return view;
  }
  static dispatch(action: PlaylistPanelAction, playlist: InternalPlaylist,
    loop: MediaLoopControls, autoSkip: AutoSkipToScriptStart, context: PlaylistActionContext): PlaylistActionResult {
    const result = new PlaylistActionResult();
    if (context.readOnly) { return result; }
    if (action.kind === 'cancel') {
      autoSkip.cancel(); loop.clear(); result.accepted = true; result.hostRequest = 'cancel'; return result;
    }
    if (context.busy) { return result; }
    if (['refresh', 'connect', 'autoConnect', 'loadAdditionalScripts'].indexOf(action.kind) >= 0) {
      result.accepted = true; result.hostRequest = action.kind; return result;
    }
    if (action.kind === 'autoSkip') { autoSkip.enabled = action.enabled; result.accepted = true; return result; }
    if (action.kind === 'autoSkipOffset') {
      if (Number.isFinite(action.value) && action.value <= 0) { autoSkip.offsetSeconds = action.value; result.accepted = true; }
      return result;
    }
    const mediaAction = ['loopClear', 'loopStart', 'loopEnd', 'loopCycle', 'loopChapter', 'seekScriptStart'].indexOf(action.kind) >= 0;
    if (mediaAction ? !context.connected && !context.mediaConnected : !context.connected) { return result; }
    const position = context.positionSeconds;
    const duration = context.durationSeconds;
    switch (action.kind) {
      case 'append':
        if (action.index === -1) { playlist.append(context.managedItems); }
        else if (Number.isInteger(action.index) && action.index >= 0 && action.index < context.managedItems.length) {
          playlist.append([context.managedItems[action.index]]);
        } else { return result; }
        break;
      case 'select':
      case 'remove': {
        const items = playlist.playlistItems;
        if (!Number.isInteger(action.index) || action.index < 0 || action.index >= items.length) { return result; }
        if (action.kind === 'select') { playlist.playAt(action.index); } else { playlist.remove(items[action.index]); }
        break;
      }
      case 'clear': playlist.clear(); loop.clear(); autoSkip.cancel(); break;
      case 'cleanup': playlist.cleanup(); break;
      case 'previous': playlist.previous(); break;
      case 'next': playlist.next(); break;
      case 'random': playlist.playRandom(); break;
      case 'loop': playlist.setLooping(action.enabled); break;
      case 'shuffle': playlist.setShuffling(action.enabled); break;
      case 'loopClear': loop.clear(); break;
      case 'loopStart':
      case 'loopEnd':
      case 'loopCycle':
      case 'loopChapter':
      case 'seekScriptStart':
        if (!Number.isFinite(position) || !Number.isFinite(duration)) { return result; }
        if (action.kind === 'loopStart') { result.seekSeconds = loop.setStart(position, duration); }
        if (action.kind === 'loopEnd') { result.seekSeconds = loop.setEnd(position, duration); }
        if (action.kind === 'loopCycle') { result.seekSeconds = loop.cycle(position, duration); }
        if (action.kind === 'loopChapter') { result.seekSeconds = loop.fromCurrentChapter(context.axisChapters, position, duration); }
        if (action.kind === 'seekScriptStart') { result.seekSeconds = seekToScriptStart(context.axisKeyframes, duration, position, autoSkip.offsetSeconds, false); }
        break;
      default: return result;
    }
    result.accepted = true; return result;
  }
  static time(seconds: number | null): string {
    if (seconds === null || !Number.isFinite(seconds)) { return '—'; }
    return seconds.toFixed(1) + 's';
  }
}
