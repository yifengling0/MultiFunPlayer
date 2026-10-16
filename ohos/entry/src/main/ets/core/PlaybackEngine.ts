import { FunscriptDocument, FunscriptParser } from './Funscript';
import type { InterpolationMode } from './Interpolation';
import { interpolateAxis } from './Interpolation';

export type PlaybackState = 'stopped' | 'playing' | 'paused' | 'ended';
export class AxisSample {
  name: string;
  position: number;
  constructor(name: string, position: number) { this.name = name; this.position = position; }
}
export class AxisOffset {
  name: string;
  offsetMs: number;
  constructor(name: string, offsetMs: number) { this.name = name; this.offsetMs = offsetMs; }
}
export class PlaybackSnapshot {
  state: PlaybackState;
  positionMs: number;
  durationMs: number;
  safetyGateOpen: boolean;
  outputs: AxisSample[];
  speed: number;
  globalOffsetMs: number;
  interpolationMode: InterpolationMode;
  constructor(state: PlaybackState, positionMs: number, durationMs: number,
    safetyGateOpen: boolean, outputs: AxisSample[], speed: number = 1,
    globalOffsetMs: number = 0, interpolationMode: InterpolationMode = 'linear') {
    this.state = state; this.positionMs = positionMs; this.durationMs = durationMs;
    this.safetyGateOpen = safetyGateOpen; this.outputs = outputs;
    this.speed = speed; this.globalOffsetMs = globalOffsetMs; this.interpolationMode = interpolationMode;
  }
}

/** Simulation only. No physical I/O exists. Every interruption requires explicit play. */
export class PlaybackEngine {
  private document: FunscriptDocument = new FunscriptDocument([]);
  private state: PlaybackState = 'stopped';
  private positionMs: number = 0;
  private foreground: boolean = true;
  private connected: boolean = false;
  private speed: number = 1;
  private globalOffsetMs: number = 0;
  private interpolationMode: InterpolationMode = 'linear';
  private axisOffsets: AxisOffset[] = [];

  load(document: FunscriptDocument): void {
    this.stop();
    this.document = new FunscriptDocument([]);
    this.axisOffsets = [];
    // Revalidate typed data too; callers can construct or mutate documents directly.
    this.document = FunscriptParser.cloneDocument(document);
  }
  play(): boolean {
    if (!this.foreground || !this.connected || this.document.durationMs <= 0) { return false; }
    if (this.positionMs >= this.document.durationMs) { return false; }
    this.state = 'playing';
    return true;
  }
  pause(): void { if (this.state === 'playing') { this.state = 'paused'; } }
  seek(timeMs: number): void {
    if (!Number.isFinite(timeMs)) { throw new Error('Seek time must be finite.'); }
    this.positionMs = Math.min(this.document.durationMs, Math.max(0, timeMs));
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
  setSpeed(value: number): void {
    if (!Number.isFinite(value) || value < 0.01 || value > 4) {
      throw new Error('Simulation speed must be from 0.01 to 4.');
    }
    this.speed = value;
  }
  setInterpolationMode(mode: InterpolationMode): void {
    if (mode !== 'linear' && mode !== 'pchip' && mode !== 'makima' && mode !== 'step') {
      throw new Error('Unknown interpolation mode.');
    }
    this.pause();
    this.interpolationMode = mode;
  }
  setGlobalOffset(offsetMs: number): void {
    this.validateOffset(offsetMs);
    this.pause();
    this.globalOffsetMs = offsetMs;
  }
  setAxisOffset(name: string, offsetMs: number): void {
    this.validateOffset(offsetMs);
    if (!this.document.axes.some((axis) => axis.name === name)) { throw new Error('Unknown script axis.'); }
    this.pause();
    const entry = this.axisOffsets.find((axis) => axis.name === name);
    if (entry !== undefined) { entry.offsetMs = offsetMs; }
    else { this.axisOffsets.push(new AxisOffset(name, offsetMs)); }
  }
  getAxisOffset(name: string): number {
    const entry = this.axisOffsets.find((axis) => axis.name === name);
    return entry === undefined ? 0 : entry.offsetMs;
  }
  private validateOffset(offsetMs: number): void {
    if (!Number.isFinite(offsetMs) || Math.abs(offsetMs) > FunscriptParser.MAX_TIME_MS) {
      throw new Error('Offset must be finite and within 24 hours.');
    }
  }
  /** Upstream convention: script time = media time - global offset - axis offset. */
  getScriptPosition(name: string): number {
    return this.positionMs - this.globalOffsetMs - this.getAxisOffset(name);
  }
  /** Monotonic elapsed time; speed does not alter timestamps stored in the script. */
  tick(elapsedMs: number): void {
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) { throw new Error('Elapsed time must be finite and nonnegative.'); }
    if (this.state !== 'playing' || !this.foreground || !this.connected) { return; }
    this.positionMs = Math.min(this.document.durationMs, this.positionMs + elapsedMs * this.speed);
    if (this.positionMs >= this.document.durationMs) { this.state = 'ended'; }
  }
  /** UI inspection values, not commands; available while the output gate is closed. */
  previewSamples(): AxisSample[] {
    const samples: AxisSample[] = [];
    for (const axis of this.document.axes) {
      samples.push(new AxisSample(axis.name,
        interpolateAxis(axis, this.getScriptPosition(axis.name), this.interpolationMode)));
    }
    return samples;
  }
  snapshot(): PlaybackSnapshot {
    const gate: boolean = this.state === 'playing' && this.foreground && this.connected;
    const outputs: AxisSample[] = [];
    if (gate) {
      for (const axis of this.document.axes) {
        if (axis.actions.length > 0) {
          outputs.push(new AxisSample(axis.name,
            interpolateAxis(axis, this.getScriptPosition(axis.name), this.interpolationMode)));
        }
      }
    }
    return new PlaybackSnapshot(this.state, this.positionMs, this.document.durationMs,
      gate, outputs, this.speed, this.globalOffsetMs, this.interpolationMode);
  }
}
