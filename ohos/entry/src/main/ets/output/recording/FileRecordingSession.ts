import type { AxisRange, DispatchAuthorization } from '../OutputTypes';
import type { OutputSourcePort, OutputDispatchSource } from '../OutputCoordinator';
import type { MonotonicClock } from '../UpdateContext';
import { authorizedAxesMatch, projectOutputFrame } from '../OutputTypes';
import { validateRange } from '../RangeModel';
import type { RecordingFormat } from './RecordingCodec';
import { invariantDouble, recordingDirty, recordingHeader, recordingFooter, recordingRow } from './RecordingCodec';
import type { RecordingRootCapability, RecordingFile } from './RecordingPort';
import { RecordingPublicationError, writeRecordingText } from './RecordingPort';

export interface RecordingOptions { readonly format: RecordingFormat; readonly axisRanges: ReadonlyArray<AxisRange>; readonly name: string; }
export interface RecordingFreshnessPolicy { readonly maximumFrameAgeMs: number; readonly maximumObservationAgeMs: number; readonly allowPausedAutoHome: boolean; readonly allowPausedMotion: boolean; }
export type RecordingState = 'idle' | 'opening' | 'recording' | 'stopping' | 'completed' | 'failed';
export interface RecordingStatus { state: RecordingState; elapsedSeconds: number; samplesWritten: number; files: string[]; partialFiles: string[]; error: string; }
interface AxisWriter { axis: string; minimum: number; maximum: number; file: RecordingFile; last: number; first: boolean; }
/** Explicit-start only. No constructor I/O, reconnect, media-position clock,
 * transport, TCode quantization or preview fallback. Caller awaits each sample;
 * concurrent samples are rejected rather than growing an unbounded queue.
 * Reads final ALL-EndUpdate frames atomically from the existing source port.
 * Source owns pipeline authorization; recorder enforces identity, freshness and
 * foreground/current-intent gates. Caller owns only the default 20ms scheduler.
 * Elapsed is actual monotonic time since the preceding tick, in seconds.
 */
export class FileRecordingSession {
  static readonly defaultIntervalMs: number = 20;
  private state: RecordingState = 'idle';
  private root: RecordingRootCapability | null = null;
  private writers: AxisWriter[] = [];
  private format: RecordingFormat = 'funscript';
  private elapsed: number = 0;
  private written: number = 0;
  private error: string = '';
  private files: string[] = [];
  private partialFiles: string[] = [];
  private pending: Promise<void> | null = null;
  private stopPending: Promise<RecordingStatus> | null = null;
  private epoch: number = -1;
  private sequence: number = -1;
  private sourceRevision: number = -1;
  private profileRevision: number = -1;
  private identity: string = '';
  private lastNow: number = -1;
  private lastFrameTime: number = -1;
  private lastObservationTime: number = -1;
  private readonly source: OutputSourcePort;
  private readonly clock: MonotonicClock;
  private readonly policy: RecordingFreshnessPolicy;
  constructor(source: OutputSourcePort, clock: MonotonicClock, policy: RecordingFreshnessPolicy) {
    if (!Number.isFinite(policy.maximumFrameAgeMs) || policy.maximumFrameAgeMs < 0 ||
      !Number.isFinite(policy.maximumObservationAgeMs) || policy.maximumObservationAgeMs < 0 ||
      typeof policy.allowPausedAutoHome !== 'boolean' || typeof policy.allowPausedMotion !== 'boolean') {
      throw new Error('Invalid recording freshness policy.');
    }
    this.source = source; this.clock = clock;
    this.policy = { maximumFrameAgeMs: policy.maximumFrameAgeMs, maximumObservationAgeMs: policy.maximumObservationAgeMs,
      allowPausedAutoHome: policy.allowPausedAutoHome, allowPausedMotion: policy.allowPausedMotion };
  }
  snapshot(): RecordingStatus { return { state: this.state, elapsedSeconds: this.elapsed, samplesWritten: this.written, files: this.files.slice(), partialFiles: this.partialFiles.slice(), error: this.error }; }
  async start(root: RecordingRootCapability, options: RecordingOptions): Promise<void> {
    if (this.state !== 'idle' || this.stopPending !== null) { throw new Error('Use a new recording session for each explicit start.'); }
    this.state = 'opening'; this.root = root;
    try {
      if (options.format !== 'csv' && options.format !== 'funscript') { throw new Error('Unsupported recording format.'); }
      if (!/^[A-Za-z0-9_-]{1,96}$/.test(options.name)) { throw new Error('Invalid recording basename.'); }
      const ranges: AxisRange[] = options.axisRanges.filter((range: AxisRange): boolean => range.enabled).map((range: AxisRange): AxisRange =>
        ({ axisId: range.axisId, minimum: range.minimum, maximum: range.maximum, enabled: true }));
      if (ranges.length === 0 || ranges.length > 64) { throw new Error('Enable between one and 64 recording axes.'); }
      const seen: string[] = [];
      for (const range of ranges) {
        validateRange(range);
        if (!/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(range.axisId) || seen.indexOf(range.axisId) >= 0) { throw new Error('Invalid or duplicate recording axis.'); }
        seen.push(range.axisId);
      }
      this.format = options.format;
      await root.validate();
      for (const range of ranges) {
        const file: RecordingFile = await root.createPartial(options.name + '.' + range.axisId + '.' + options.format);
        this.writers.push({ axis: range.axisId, minimum: range.minimum, maximum: range.maximum, file: file, last: NaN, first: true });
        await writeRecordingText(file, recordingHeader(this.format));
      }
      this.state = 'recording';
    } catch (error) { await this.fail('Cannot start recording: ' + String(error)); throw new Error(this.error); }
  }
  sample(elapsedSeconds: number): Promise<void> {
    if (this.state !== 'recording') { return Promise.reject(new Error('Recording is not active.')); }
    if (this.pending !== null) { return Promise.reject(new Error('Recording backpressure: await the preceding sample.')); }
    // Read authoritative current source and copy all admitted scalars before awaits.
    const values: number[] = [];
    try {
      const axes: string[] = this.writers.map((writer: AxisWriter): string => writer.axis);
      const source: OutputDispatchSource = this.source.dispatchSource(axes, 'fixed');
      const authorization: DispatchAuthorization | null = source.authorization;
      const now: number = this.clock.nowMs();
      if (!Number.isFinite(now) || now < 0 || now < this.lastNow || !Number.isFinite(elapsedSeconds) ||
        elapsedSeconds < 0 || !Number.isFinite(this.elapsed + elapsedSeconds)) { throw new Error('Invalid recorder elapsed time or clock.'); }
      if (source.faulted || !source.foreground || source.mediaState === 'stopped' || source.availability === 'invalidated') {
        throw new Error('Current source is invalidated, stopped or backgrounded.');
      }
      // A source-confirmed pending new frame is not permission to reuse old data.
      // Recorder wall time continues across this gap; no scalar is emitted.
      if (source.availability === 'pendingCurrentFrame' && authorization === null) {
        this.elapsed += elapsedSeconds; this.lastNow = now; return Promise.resolve();
      }
      if (authorization === null || (source.availability !== undefined && source.availability !== 'ready')) { throw new Error('Current source has no authorization.'); }
      const frame = projectOutputFrame(source.frame);
      if (!Number.isFinite(now) || now < 0 || now < this.lastNow ||
        !Number.isFinite(frame.monotonicMs) || frame.monotonicMs < 0 || frame.monotonicMs < this.lastFrameTime || frame.monotonicMs > now || now - frame.monotonicMs > this.policy.maximumFrameAgeMs ||
        !Number.isFinite(authorization.observedMonotonicMs) || authorization.observedMonotonicMs < 0 || authorization.observedMonotonicMs < this.lastObservationTime || authorization.observedMonotonicMs > now ||
        now - authorization.observedMonotonicMs > this.policy.maximumObservationAgeMs ||
        !Number.isSafeInteger(frame.profileRevision) || frame.profileRevision < 0 || (this.profileRevision >= 0 && frame.profileRevision !== this.profileRevision) ||
        !Number.isSafeInteger(authorization.sourceConfigurationRevision) || authorization.sourceConfigurationRevision < 0 || authorization.sourceConfigurationRevision < this.sourceRevision ||
        !Number.isFinite(frame.mediaPositionMs) || frame.mediaPositionMs < 0 || !this.intentsAllowed(source, authorization)) {
        throw new Error('Recording source clock, revision or current intent is invalid or stale.');
      }
      if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0 || !Number.isFinite(this.elapsed + elapsedSeconds)) { throw new Error('Invalid recorder elapsed time.'); }
      if (!Number.isSafeInteger(frame.sequence) || frame.sequence < 0 || frame.sequence < this.sequence ||
        !Number.isSafeInteger(frame.epoch) || frame.epoch < 0 || (this.epoch >= 0 && frame.epoch !== this.epoch) ||
        authorization.updateKind !== 'fixed' || authorization.epoch !== frame.epoch || authorization.sourceFrameSequence !== frame.sequence ||
        !authorizedAxesMatch(authorization.authorizedAxes, this.writers.map((writer: AxisWriter): string => writer.axis)) || authorization.intents.length === 0) {
        throw new Error('Recording requires current final-frame authorization; epoch changes require explicit stop/start.');
      }
      const rawValues: number[] = [];
      for (const writer of this.writers) {
        const matches = frame.values.filter(value => value.axisId === writer.axis);
        if (matches.length !== 1 || !Number.isFinite(matches[0].value)) { throw new Error('Missing, duplicate or nonfinite recording axis.'); }
        const raw = source.frame.axisStates.find(axis => axis.axisName === writer.axis);
        if (raw === undefined) { throw new Error('Missing source axis identity.'); }
        rawValues.push(raw.value);
        // Source GetValues clamps the input before target-specific range mapping.
        values.push(writer.minimum + (writer.maximum - writer.minimum) * Math.max(0, Math.min(1, matches[0].value)));
      }
      const identity: string = [frame.epoch, frame.sequence, frame.profileRevision, frame.monotonicMs, frame.mediaPositionMs,
        authorization.sourceConfigurationRevision, authorization.observedMonotonicMs].join('|') + '|' +
        authorization.clockKind + '|' + authorization.intents.slice().sort().join(',') + '|' + source.mediaState + '|' + rawValues.map((value: number): string => invariantDouble(value)).join(',');
      if (frame.sequence === this.sequence && identity !== this.identity) { throw new Error('A repeated frame identity changed content or authorization.'); }
      this.identity = identity; this.sourceRevision = authorization.sourceConfigurationRevision; this.profileRevision = frame.profileRevision;
      this.lastFrameTime = frame.monotonicMs; this.lastObservationTime = authorization.observedMonotonicMs;
      this.lastNow = now; this.epoch = frame.epoch; this.sequence = frame.sequence; this.elapsed += elapsedSeconds;
    } catch (error) {
      this.state = 'stopping';
      this.pending = this.fail('Recording rejected frame: ' + String(error)).then((): void => { throw new Error(this.error); });
      return this.pending;
    }
    this.pending = this.writeSample(values).finally((): void => { this.pending = null; });
    return this.pending;
  }
  private intentsAllowed(source: OutputDispatchSource, authorization: DispatchAuthorization): boolean {
    if (authorization.intents.length === 0) { return false; }
    return authorization.intents.every((intent): boolean => {
      if (intent === 'activePlayback') { return source.mediaState === 'playing' && authorization.clockKind === 'media'; }
      if (intent === 'pausedAutoHome') { return source.mediaState === 'paused' && authorization.clockKind === 'monotonic' && this.policy.allowPausedAutoHome; }
      if (intent === 'pausedMotion') { return source.mediaState === 'paused' && authorization.clockKind === 'monotonic' && this.policy.allowPausedMotion; }
      return false;
    });
  }
  private async writeSample(values: number[]): Promise<void> {
    try {
      for (let i: number = 0; i < this.writers.length; i++) {
        const writer: AxisWriter = this.writers[i];
        if (!recordingDirty(values[i], writer.last)) { continue; }
        await writeRecordingText(writer.file, recordingRow(this.format, this.elapsed, values[i], writer.first));
        writer.last = values[i]; writer.first = false; this.written++;
      }
    } catch (error) { await this.fail('Recording write failed: ' + String(error)); throw new Error(this.error); }

  }
  stop(): Promise<RecordingStatus> {
    if (this.stopPending !== null) { return this.stopPending; }
    if (this.state === 'opening') { return Promise.reject(new Error('Await recording start before stopping.')); }
    if (this.state === 'recording') { this.state = 'stopping'; }
    this.stopPending = this.finish(); return this.stopPending;
  }
  private async finish(): Promise<RecordingStatus> {
    try {
      if (this.pending !== null) { await this.pending; }
      if (this.state !== 'stopping') { return this.snapshot(); }
      for (const writer of this.writers) { await writeRecordingText(writer.file, recordingFooter(this.format)); await writer.file.flush(); await writer.file.close(); }
      if (this.root === null) { throw new Error('Recording root is absent.'); }
      this.files = (await this.root.commit(this.writers.map((writer: AxisWriter): RecordingFile => writer.file))).slice();
      if (this.files.length !== this.writers.length) { throw new Error('Incomplete recording publication receipt.'); }
      this.state = 'completed';
    } catch (error) { if (error instanceof RecordingPublicationError) { this.partialFiles = error.publishedFiles.slice(); } if (this.state !== 'failed') { await this.fail('Recording finalization failed: ' + String(error)); } }
    return this.snapshot();
  }
  private async fail(message: string): Promise<void> {
    this.state = 'failed'; this.error = message; this.files = [];
    for (const writer of this.writers) { try { await writer.file.close(); } catch (error) { this.error += '; close: ' + String(error); } }
    if (this.root !== null) {
      try { await this.root.abort(this.writers.map((writer: AxisWriter): RecordingFile => writer.file)); }
      catch (error) { this.error += '; cleanup incomplete: ' + String(error); }
    }
  }
}
