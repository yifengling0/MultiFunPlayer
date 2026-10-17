/** Pure seconds-based port of InternalMediaSource.cs. The host owns Download
 * scanning, resource loading, and transport/output safety. No filesystem paths
 * are opened here. The item association is an opaque managed-library identity. */
export class InternalPlaylistItem {
  readonly name: string;
  readonly fullName: string;
  readonly associationId: string;
  exists: boolean;
  durationSeconds: number;
  constructor(name: string, fullName: string, associationId: string,
    durationSeconds: number, exists: boolean = true) {
    this.name = name; this.fullName = fullName; this.associationId = associationId;
    this.durationSeconds = durationSeconds; this.exists = exists;
  }
}

/** Events preserve forced-seek and reload distinctions (same-item restart does
 * not reload scripts). Hosts drain after each command/tick and adapt seconds. */
export class InternalPlaylistEvent {
  readonly kind: string;
  readonly item: InternalPlaylistItem | null;
  readonly value: number;
  readonly forceSeek: boolean;
  constructor(kind: string, item: InternalPlaylistItem | null = null,
    value: number = Number.NaN, forceSeek: boolean = false) {
    this.kind = kind; this.item = item; this.value = value; this.forceSeek = forceSeek;
  }
}

export class InternalPlaylist {
  private items: InternalPlaylistItem[] | null = null;
  private current: InternalPlaylistItem | null = null;
  private events: InternalPlaylistEvent[] = [];
  private random: () => number;
  private refreshItem: (item: InternalPlaylistItem) => void;
  playlistIndex: number = 0;
  positionSeconds: number = Number.NaN;
  durationSeconds: number = Number.NaN;
  speed: number = 1;
  isPlaying: boolean = false;
  private shuffling: boolean = false;
  private looping: boolean = false;

  constructor(random: () => number = Math.random,
    refreshItem: (item: InternalPlaylistItem) => void = () => {}) {
    this.random = random; this.refreshItem = refreshItem;
  }
  get isShuffling(): boolean { return this.shuffling; }
  get isLooping(): boolean { return this.looping; }
  get currentItem(): InternalPlaylistItem | null { return this.current; }
  get hasPlaylist(): boolean { return this.items !== null; }
  get playlistItems(): InternalPlaylistItem[] { return this.items === null ? [] : this.items.slice(); }
  setShuffling(enabled: boolean): void { this.shuffling = enabled; if (enabled) { this.looping = false; } }
  setLooping(enabled: boolean): void { this.looping = enabled; if (enabled) { this.shuffling = false; } }
  drainEvents(): InternalPlaylistEvent[] { const result = this.events; this.events = []; return result; }
  findIndex(path: string): number {
    const value = path.toLowerCase();
    return this.items === null ? -1 : this.items.findIndex(item =>
      item.name.toLowerCase() === value || item.fullName.toLowerCase() === value);
  }
  private findItem(item: InternalPlaylistItem | null): number {
    return item === null || this.items === null ? -1 : this.items.findIndex(candidate =>
      candidate.name.toLowerCase() === item.name.toLowerCase() ||
      candidate.fullName.toLowerCase() === item.fullName.toLowerCase());
  }
  private valid(index: number): boolean {
    return this.items !== null && Number.isInteger(index) && index >= 0 && index < this.items.length;
  }
  private check(index: number): boolean | null {
    if (!this.valid(index) || this.items === null) { return null; }
    this.refreshItem(this.items[index]); return this.items[index].exists;
  }
  setPlaylist(items: InternalPlaylistItem[] | null): void {
    this.items = items === null ? null : items.filter(item => /\.funscript$/i.test(item.name));
    this.playIndex(-1);
    if (items === null) { this.setPlaying(false); }
  }
  clear(): void { this.setPlaylist(null); }
  /** OHOS host extension: append already resolved Download associations without
   * resetting the current item. Upstream has no append command. Duplicates stay. */
  append(items: InternalPlaylistItem[]): void {
    if (this.items === null) { this.setPlaylist(items); return; }
    this.items.push(...items.filter(item => /\.funscript$/i.test(item.name)));
  }
  refresh(): void { if (this.items !== null) { this.items.forEach(item => this.refreshItem(item)); } }
  cleanup(): void {
    if (this.items === null) { return; }
    this.refresh(); this.items = this.items.filter(item => item.exists);
    this.playIndex(this.findItem(this.current));
  }
  remove(item: InternalPlaylistItem): void {
    if (this.items === null) { return; }
    const index = this.findItem(item);
    const exact = this.items.indexOf(item);
    if (exact < 0) { return; }
    this.items.splice(exact, 1);
    if (index === this.playlistIndex) { this.playIndexOrNextBest(this.playlistIndex); }
    else if (index < this.playlistIndex) { this.playlistIndex--; }
  }
  playAt(index: number): void { if (this.check(index) === true) { this.playIndex(index); } }
  playByName(path: string): void { this.playAt(this.findIndex(path)); }
  next(): void { this.playOffset(1); }
  previous(): void { this.playOffset(-1); }
  private playOffset(offset: number): void {
    if (this.items === null) { return; }
    if (this.looping) { this.playIndex(this.playlistIndex); }
    else if (this.shuffling) { this.playRandom(); }
    else { this.playWithOffset(offset); }
  }
  playRandom(): void {
    if (this.items === null) { return; }
    this.refresh(); const existing = this.items.filter(item => item.exists);
    if (existing.length === 0) { return; }
    const draw = this.random();
    if (!Number.isFinite(draw) || draw < 0 || draw >= 1) { throw new Error('Random must return a number in [0, 1).'); }
    this.playIndex(this.findItem(existing[Math.floor(draw * existing.length)]));
  }
  private playWithOffset(offset: number): void {
    if (this.items === null) { return; }
    let index = this.playlistIndex + offset;
    while (this.check(index) === false) { index += Math.sign(offset); }
    index = Math.max(-1, Math.min(index, this.items.length));
    if (this.current !== null && !this.valid(index)) {
      this.setPlaying(false);
      this.seek(index < 0 ? 0 : this.durationSeconds);
    } else { this.playIndex(index); }
  }
  private playIndexOrNextBest(index: number): void {
    let best = index;
    while (this.check(best) === false) { best++; }
    if (!this.valid(best)) {
      best = index - 1;
      while (this.check(best) === false) { best--; }
    }
    this.playIndex(best);
  }
  private playIndex(index: number): void {
    if (this.items === null) { this.playlistIndex = -1; this.setCurrent(null); return; }
    let item: InternalPlaylistItem | null = this.valid(index) ? this.items[index] : null;
    if (item !== null) { this.refreshItem(item); if (!item.exists) { item = null; } }
    if (this.current !== item) {
      this.playlistIndex = item === null ? -1 : index; this.setCurrent(item);
    } else if (this.current !== null) { this.playlistIndex = index; this.seek(0); }
  }
  private setCurrent(item: InternalPlaylistItem | null): void {
    this.current = item;
    if (item === null || !Number.isFinite(item.durationSeconds)) {
      this.positionSeconds = Number.NaN; this.durationSeconds = Number.NaN; this.isPlaying = false;
      this.events.push(new InternalPlaylistEvent('reset')); return;
    }
    this.durationSeconds = item.durationSeconds;
    this.events.push(new InternalPlaylistEvent('duration', item, this.durationSeconds));
    this.seek(0);
    this.events.push(new InternalPlaylistEvent('load', item));
  }
  /** Reload associated scripts after LoadAdditionalScripts changes. Host resolves
   * companions first, sets the max last-keyframe duration, then invokes reload. */
  reloadCurrent(): void { this.setCurrent(this.current); }
  setPlaying(playing: boolean): void {
    this.isPlaying = playing; this.events.push(new InternalPlaylistEvent('playing', null, playing ? 1 : 0));
  }
  setSpeed(speed: number): void { this.speed = speed; this.events.push(new InternalPlaylistEvent('speed', null, speed)); }
  seek(positionSeconds: number): void {
    if (this.current !== null) { this.setPosition(positionSeconds, true); }
  }
  private setPosition(position: number, force: boolean): void {
    this.positionSeconds = position; this.events.push(new InternalPlaylistEvent('position', null, position, force));
  }
  /** Call on the host's 100ms Internal clock. End detection precedes advancement,
   * runs even paused, and uses strict >, as RunAsync does. */
  tick(elapsedSeconds: number): void {
    if (this.items === null) { return; }
    if (this.current === null) {
      if (this.shuffling) { this.playRandom(); } else { this.playIndexOrNextBest(0); }
    }
    if (this.positionSeconds > this.durationSeconds) {
      if (this.looping) { this.seek(0); }
      else if (this.shuffling) { this.playRandom(); }
      else { this.playWithOffset(1); }
    }
    if (this.isPlaying && this.current !== null) { this.setPosition(this.positionSeconds + elapsedSeconds * this.speed, false); }
  }
}
