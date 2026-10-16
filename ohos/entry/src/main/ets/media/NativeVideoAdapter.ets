import { media } from '@kit.MediaKit';
import { fileIo } from '@kit.CoreFileKit';
import { systemDateTime } from '@kit.BasicServicesKit';
import { MediaClock, MediaClockSnapshot } from '../core/MediaClock';

class CleanupResource {
  player: media.AVPlayer | undefined;
  file: fileIo.File | undefined;
  operation: Promise<string> | undefined = undefined;
  constructor(player: media.AVPlayer | undefined, file: fileIo.File | undefined) {
    this.player = player; this.file = file;
  }
}

/** One source, one caller-owned FD. No device transport and no synthetic video clock. */
export class NativeVideoAdapter {
  private cleanupResources: CleanupResource[] = [];
  private clock: MediaClock = new MediaClock();
  private player: media.AVPlayer | undefined = undefined;
  private file: fileIo.File | undefined = undefined;
  private surface: string = '';
  private desiredPlay: boolean = false;
  private preparing: boolean = false;
  private pauseOperation: Promise<void> | undefined = undefined;
  private pendingSeek: number = -1;
  private seekInFlight: boolean = false;
  private watchdog: number = -1;
  private onSnapshot: (snapshot: MediaClockSnapshot) => void;

  constructor(onSnapshot: (snapshot: MediaClockSnapshot) => void) { this.onSnapshot = onSnapshot; }
  snapshot(): MediaClockSnapshot { return this.clock.snapshot(); }
  private now(): number { return systemDateTime.getUptime(systemDateTime.TimeType.STARTUP, false); }
  private emit(): void { this.onSnapshot(this.clock.snapshot()); }

  async open(uri: string, surfaceId: string): Promise<void> {
    const cleanup = this.release();
    const generation = this.clock.reset('loading');
    this.surface = surfaceId; this.emit();
    await cleanup;
    if (!this.clock.accepts(generation)) { return; }
    if (this.cleanupResources.length > 0) {
      this.clock.fail('Previous video cleanup is unresolved. Close the video again to retry.'); this.emit(); return;
    }
    if (!canIUse('SystemCapability.Multimedia.Media.AVPlayer')) {
      this.clock.fail('Native video playback is unavailable on this device.'); this.emit(); return;
    }
    if (uri.length === 0 || surfaceId.length === 0) {
      this.clock.fail('Select a video and wait for the video surface.'); this.emit(); return;
    }
    let opened: fileIo.File | undefined = undefined;
    let created: media.AVPlayer | undefined = undefined;
    try {
      opened = await fileIo.open(uri, fileIo.OpenMode.READ_ONLY | fileIo.OpenMode.NOFOLLOW | fileIo.OpenMode.NONBLOCK);
      if (!this.clock.accepts(generation)) { await this.destroy(created, opened); return; }
      const sourceStat = await fileIo.stat(opened.fd);
      if (!this.clock.accepts(generation)) { await this.destroy(created, opened); return; }
      if (!sourceStat.isFile() || !Number.isFinite(sourceStat.size) || sourceStat.size <= 0) {
        throw new Error('The selected video is empty or has an invalid length.');
      }
      created = await media.createAVPlayer();
      if (!this.clock.accepts(generation)) { await this.destroy(created, opened); return; }
      const player = created; const descriptor = opened.fd;
      this.player = created; this.file = opened;
      // Transfer ownership before callbacks or fdSrc can throw. Only release() owns these now.
      created = undefined; opened = undefined;
      this.bind(player, generation);
      player.fdSrc = { fd: descriptor, offset: 0, length: sourceStat.size };
      this.watchdog = setInterval(() => {
        if (!this.clock.accepts(generation)) { return; }
        if (!this.clock.checkFreshness(this.now())) { this.desiredPlay = false; this.pause(); }
        this.emit();
      }, 100);
    } catch (error) {
      await this.destroy(created, opened);
      if (this.clock.accepts(generation)) {
        await this.failure(generation, `Cannot open video: ${error}`);
      }
    }
  }
  async setSurface(surfaceId: string): Promise<void> {
    if (surfaceId === this.surface) { return; }
    // A replaced/destroyed surface invalidates every pending native operation.
    this.surface = surfaceId; await this.release();
  }
  async play(): Promise<void> {
    const player = this.player; const generation = this.snapshot().generation;
    if (player === undefined || this.pauseOperation !== undefined) { return; }
    this.clock.observe(generation, player.currentTime, this.now());
    if (!this.clock.requestPlay()) { this.emit(); return; }
    this.desiredPlay = true; this.emit();
    try {
      await player.play();
      if (this.clock.accepts(generation) && !this.desiredPlay && player.state === 'playing') { await player.pause(); }
    } catch (error) { await this.failure(generation, `Playback failed: ${error}`); }
  }
  async pause(): Promise<void> {
    this.desiredPlay = false; this.clock.pause(); this.emit();
    const player = this.player; const generation = this.snapshot().generation;
    if (this.pauseOperation !== undefined) { await this.pauseOperation; return; }
    if (player === undefined || player.state !== 'playing') { return; }
    const operation = this.pausePlayer(player, generation);
    this.pauseOperation = operation; await operation;
    if (this.pauseOperation === operation) { this.pauseOperation = undefined; }
  }
  private async pausePlayer(player: media.AVPlayer, generation: number): Promise<void> {
    try { await player.pause(); }
    catch (error) { await this.failure(generation, `Pause failed: ${error}`); }
  }
  async seek(positionMs: number): Promise<void> {
    if (!Number.isFinite(positionMs) || !this.snapshot().ready) { return; }
    const generation = this.snapshot().generation;
    this.pendingSeek = Math.round(Math.max(0, Math.min(this.snapshot().durationMs, positionMs)));
    this.clock.beginSeek(); this.emit();
    await this.pause();
    if (this.clock.accepts(generation)) { this.issueSeek(); }
  }
  private issueSeek(): void {
    const player = this.player;
    if (player === undefined || this.seekInFlight || this.pendingSeek < 0) { return; }
    const target = this.pendingSeek; this.pendingSeek = -1; this.seekInFlight = true;
    try { player.seek(target, media.SeekMode.SEEK_CLOSEST); }
    catch (error) { this.failure(this.snapshot().generation, `Seek failed: ${error}`); }
  }
  async setRate(rate: number): Promise<void> {
    if (!Number.isFinite(rate) || rate < 0.125 || rate > 4 || !this.snapshot().ready) { return; }
    const player = this.player; const generation = this.snapshot().generation;
    try { if (player !== undefined) { player.setPlaybackRate(rate); } }
    catch (error) { await this.failure(generation, `Speed failed: ${error}`); }
  }
  async setVolume(volume: number): Promise<void> {
    if (!Number.isFinite(volume) || volume < 0 || volume > 1 || !this.snapshot().ready) { return; }
    const player = this.player; const generation = this.snapshot().generation;
    try { if (player !== undefined) { player.setVolume(volume); } }
    catch (error) { await this.failure(generation, `Volume failed: ${error}`); }
  }
  async release(): Promise<void> {
    this.desiredPlay = false; const generation = this.clock.reset();
    this.preparing = false; this.pauseOperation = undefined; this.pendingSeek = -1; this.seekInFlight = false;
    if (this.watchdog >= 0) { clearInterval(this.watchdog); this.watchdog = -1; }
    const player = this.player; const file = this.file;
    this.player = undefined; this.file = undefined; this.emit();
    if (player !== undefined || file !== undefined) { this.cleanupResources.push(new CleanupResource(player, file)); }
    const failure = await this.retryCleanup();
    if (failure.length > 0 && this.clock.accepts(generation)) { this.clock.fail(failure); this.emit(); }
  }
  async dispose(): Promise<void> { await this.release(); }
  private async destroy(player: media.AVPlayer | undefined, file: fileIo.File | undefined): Promise<string> {
    if (player === undefined && file === undefined) { return ''; }
    const resource = new CleanupResource(player, file);
    this.cleanupResources.push(resource);
    const failure = await this.cleanupResource(resource);
    if (failure.length > 0) {
      this.desiredPlay = false; this.clock.fail(failure); this.emit();
    }
    return failure;
  }
  private async retryCleanup(): Promise<string> {
    let failure = '';
    const resources = this.cleanupResources.slice();
    for (const resource of resources) {
      const result = await this.cleanupResource(resource);
      if (result.length > 0) { failure = result; }
    }
    return failure;
  }
  private async cleanupResource(resource: CleanupResource): Promise<string> {
    if (resource.operation !== undefined) { return resource.operation; }
    const operation = this.performCleanup(resource);
    resource.operation = operation;
    const result = await operation;
    resource.operation = undefined;
    if (resource.player === undefined && resource.file === undefined) {
      this.cleanupResources = this.cleanupResources.filter((item: CleanupResource) => item !== resource);
    }
    return result;
  }
  private async performCleanup(resource: CleanupResource): Promise<string> {
    try {
      // Retain each owner until its operation succeeds; close can be retried without releasing twice.
      if (resource.player !== undefined) { await resource.player.release(); resource.player = undefined; }
      if (resource.file !== undefined) { await fileIo.close(resource.file); resource.file = undefined; }
      return '';
    } catch (error) { return `Video cleanup failed: ${error}. Close the video again to retry.`; }
  }
  private async failure(generation: number, message: string): Promise<void> {
    if (!this.clock.accepts(generation)) { return; }
    const cleanup = this.release();
    const releasedGeneration = this.snapshot().generation;
    try { await cleanup; }
    catch (error) { message += `; cleanup failed: ${error}`; }
    // Release invalidates callbacks before awaiting native destruction.
    if (this.clock.accepts(releasedGeneration)) { this.clock.fail(message); this.emit(); }
  }
  private bind(player: media.AVPlayer, generation: number): void {
    player.on('stateChange', async (state: string) => {
      if (!this.clock.accepts(generation)) { return; }
      try {
        if (state === 'initialized') {
          if (this.preparing || this.surface.length === 0) { return; }
          this.preparing = true; player.surfaceId = this.surface; await player.prepare(); return;
        }
        if (state === 'prepared') {
          this.clock.prepared(generation, player.duration, player.currentTime, this.now());
        } else {
          this.clock.stateChanged(generation, state);
          if (state === 'playing' && !this.desiredPlay) { await this.pause(); }
          if (state === 'completed' || state === 'paused' || state === 'stopped') { this.desiredPlay = false; }
        }
        this.emit();
      } catch (error) { await this.failure(generation, `Video state failed: ${error}`); }
    });
    player.on('timeUpdate', (position: number) => {
      if (!this.clock.accepts(generation)) { return; }
      this.clock.observe(generation, position, this.now()); this.emit();
    });
    player.on('seekDone', (_requestedPosition: number) => {
      if (!this.clock.accepts(generation)) { return; }
      this.seekInFlight = false;
      if (this.pendingSeek >= 0) { this.issueSeek(); return; }
      this.clock.endSeek(generation, player.currentTime, this.now()); this.emit();
    });
    player.on('playbackRateDone', (rate: number) => { this.clock.rateChanged(generation, rate); this.emit(); });
    player.on('bufferingUpdate', (type: media.BufferingInfoType) => {
      if (!this.clock.accepts(generation)) { return; }
      if (type === media.BufferingInfoType.BUFFERING_START) {
        this.clock.setBuffering(generation, true); this.pause();
      } else if (type === media.BufferingInfoType.BUFFERING_END) {
        this.clock.setBuffering(generation, false); this.clock.observe(generation, player.currentTime, this.now()); this.emit();
      }
    });
    player.on('audioInterrupt', () => { if (this.clock.accepts(generation)) { this.pause(); } });
    player.on('error', (error) => { this.failure(generation, `Native video error: ${error.message}`); });
  }
}
