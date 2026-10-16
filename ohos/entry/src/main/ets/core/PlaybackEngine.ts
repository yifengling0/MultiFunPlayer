import { FunscriptDocument, FunscriptParser, interpolate } from './Funscript';

export type PlaybackState = 'stopped' | 'playing' | 'paused' | 'ended';
export class AxisSample {
  name: string;
  position: number;
  constructor(name: string, position: number) { this.name = name; this.position = position; }
}
export class PlaybackSnapshot {
  state: PlaybackState;
  positionMs: number;
  durationMs: number;
  safetyGateOpen: boolean;
  outputs: AxisSample[];
  constructor(state: PlaybackState, positionMs: number, durationMs: number,
    safetyGateOpen: boolean, outputs: AxisSample[]) {
    this.state = state; this.positionMs = positionMs; this.durationMs = durationMs;
    this.safetyGateOpen = safetyGateOpen; this.outputs = outputs;
  }
}

/** Simulation only. No physical I/O exists. Every interruption requires explicit play. */
export class PlaybackEngine {
  private document: FunscriptDocument = new FunscriptDocument([]);
  private state: PlaybackState = 'stopped';
  private positionMs: number = 0;
  private foreground: boolean = true;
  private connected: boolean = false;

  load(document: FunscriptDocument): void {
    this.stop();
    this.document = new FunscriptDocument([]);
    // Public constructors permit programmatic documents: revalidate at this boundary,
    // and copy via parser so caller mutation cannot alter the loaded timeline.
    this.document = FunscriptParser.parse(JSON.stringify(document));
  }
  play(): boolean {
    if (!this.foreground || !this.connected || this.document.durationMs <= 0) { return false; }
    if (this.positionMs >= this.document.durationMs) { return false; }
    this.state = 'playing';
    return true;
  }
  pause(): void {
    if (this.state === 'playing') { this.state = 'paused'; }
  }
  seek(timeMs: number): void {
    if (!Number.isFinite(timeMs)) { throw new Error('Seek time must be finite.'); }
    this.positionMs = Math.min(this.document.durationMs, Math.max(0, timeMs));
    // Seeking never opens a closed gate; seeking to the end always closes it.
    if (this.positionMs >= this.document.durationMs && this.state === 'playing') { this.state = 'ended'; }
    if (this.positionMs < this.document.durationMs && this.state === 'ended') { this.state = 'paused'; }
  }
  stop(): void { this.state = 'stopped'; this.positionMs = 0; }
  setForeground(value: boolean): void {
    this.foreground = value;
    if (!value) { this.state = 'stopped'; }
  }
  setConnected(value: boolean): void {
    this.connected = value;
    if (!value) { this.state = 'stopped'; }
  }
  /** Supply monotonic elapsed time from the platform, not wall-clock timestamps. */
  tick(elapsedMs: number): void {
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) { throw new Error('Elapsed time must be finite and nonnegative.'); }
    if (this.state !== 'playing' || !this.foreground || !this.connected) { return; }
    this.positionMs = Math.min(this.document.durationMs, this.positionMs + elapsedMs);
    if (this.positionMs >= this.document.durationMs) { this.state = 'ended'; }
  }
  snapshot(): PlaybackSnapshot {
    const gate: boolean = this.state === 'playing' && this.foreground && this.connected;
    const outputs: AxisSample[] = [];
    if (gate) {
      for (const axis of this.document.axes) {
        if (axis.actions.length > 0) { outputs.push(new AxisSample(axis.name, interpolate(axis, this.positionMs))); }
      }
    }
    return new PlaybackSnapshot(this.state, this.positionMs, this.document.durationMs, gate, outputs);
  }
}
