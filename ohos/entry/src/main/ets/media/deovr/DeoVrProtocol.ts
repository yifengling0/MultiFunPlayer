import { DeoVrError } from './DeoVrTypes';

export const DEOVR_MAXIMUM_FRAME_BYTES: number = 65536;
export const DEOVR_MAXIMUM_RECEIVE_BYTES: number = 262144;
export const DEOVR_MAXIMUM_PATH_LENGTH: number = 8192;
/** Finite, exactly representable millisecond values; ten years is a safety cap. */
export const DEOVR_MAXIMUM_TIME_SECONDS: number = 315576000;
export const DEOVR_MAXIMUM_SPEED: number = 1000;
export interface DeoVrPlayerPacket {
  path: string | null;
  playerState: number | null;
  durationSeconds: number | null;
  positionSeconds: number | null;
  speed: number | null;
  /** Inert HereSphere identifier metadata. Never a path/network capability. */
  sceneUri?: string | null;
}
export type DeoVrCommandKind = 'playPause' | 'seek' | 'path' | 'speed';
export interface DeoVrCommand { kind: DeoVrCommandKind; playing?: boolean; value?: number; path?: string; }
/** Only wire field interpretation varies. Lifecycle, framing and provenance stay
 * in the source core; implementations never receive transport/file capabilities. */
export interface DeoVrProtocolStrategy {
  readonly sourceKind: 'deovr' | 'heresphere';
  decodePacket(bytes: Uint8Array): DeoVrPlayerPacket;
  encodeCommand(command: DeoVrCommand): Uint8Array;
}
export class DeoVrProtocol implements DeoVrProtocolStrategy {
  readonly sourceKind: 'deovr' | 'heresphere' = 'deovr';
  decodePacket(bytes: Uint8Array): DeoVrPlayerPacket { return decodeDeoVrPacket(bytes); }
  encodeCommand(command: DeoVrCommand): Uint8Array { return encodeDeoVrCommand(command); }
}
export interface DeoVrReceiveIngress { ingressId: number; receivedAtMs: number; }
export interface DeoVrObservedFrame {
  payload: Uint8Array | null;
  firstIngressId: number;
  lastIngressId: number;
  firstReceivedAtMs: number;
  receivedAtMs: number;
}

/** Incremental signed int32 little-endian length framing. A nonpositive length
 * is the original reset/keep-alive frame, including negative lengths. */
export class DeoVrFrameDecoder {
  private header: Uint8Array = new Uint8Array(4);
  private headerUsed: number = 0;
  private body: Uint8Array | null = null;
  private bodyUsed: number = 0;
  private firstIngressId: number = -1;
  private firstReceivedAtMs: number = -1;
  reset(): void {
    this.headerUsed = 0; this.body = null; this.bodyUsed = 0;
    this.firstIngressId = -1; this.firstReceivedAtMs = -1;
  }
  push(bytes: Uint8Array): Array<Uint8Array | null> {
    return this.pushObserved(bytes, { ingressId: -1, receivedAtMs: -1 }).map(frame => frame.payload);
  }
  /** First-byte provenance includes the header and survives every fragment.
   * Payload-only callers keep their original framing behavior via push(). */
  pushObserved(bytes: Uint8Array, ingress: DeoVrReceiveIngress): DeoVrObservedFrame[] {
    if (bytes.byteLength > DEOVR_MAXIMUM_RECEIVE_BYTES) { throw new DeoVrError('receiveTooLarge'); }
    const frames: DeoVrObservedFrame[] = [];
    let offset: number = 0;
    while (offset < bytes.byteLength) {
      if (frames.length >= 1024) { throw new DeoVrError('tooManyFrames'); }
      if (this.body === null) {
        if (this.headerUsed === 0) {
          this.firstIngressId = ingress.ingressId; this.firstReceivedAtMs = ingress.receivedAtMs;
        }
        const count: number = Math.min(4 - this.headerUsed, bytes.byteLength - offset);
        this.header.set(bytes.subarray(offset, offset + count), this.headerUsed);
        this.headerUsed += count; offset += count;
        if (this.headerUsed !== 4) { continue; }
        const length: number = this.header[0] | (this.header[1] << 8) | (this.header[2] << 16) | (this.header[3] << 24);
        this.headerUsed = 0;
        if (length <= 0) { frames.push(this.observedFrame(null, ingress)); continue; }
        if (length > DEOVR_MAXIMUM_FRAME_BYTES) { throw new DeoVrError('frameTooLarge'); }
        this.body = new Uint8Array(length); this.bodyUsed = 0;
      }
      const body: Uint8Array = this.body;
      const count: number = Math.min(body.byteLength - this.bodyUsed, bytes.byteLength - offset);
      body.set(bytes.subarray(offset, offset + count), this.bodyUsed);
      this.bodyUsed += count; offset += count;
      if (this.bodyUsed === body.byteLength) { frames.push(this.observedFrame(body, ingress)); this.body = null; this.bodyUsed = 0; }
    }
    return frames;
  }
  private observedFrame(payload: Uint8Array | null, ingress: DeoVrReceiveIngress): DeoVrObservedFrame {
    return { payload: payload, firstIngressId: this.firstIngressId, lastIngressId: ingress.ingressId,
      firstReceivedAtMs: this.firstReceivedAtMs, receivedAtMs: ingress.receivedAtMs };
  }
}

/** Strict platform-independent UTF-8, rejecting replacement decoding, overlong
 * sequences, surrogate encodings, truncation and code points above U+10FFFF. */
export function decodeDeoVrUtf8(bytes: Uint8Array): string {
  const chunks: string[] = [];
  let chunk: string = '';
  for (let offset: number = 0; offset < bytes.byteLength;) {
    const first: number = bytes[offset++];
    let code: number = first; let count: number = 0; let minimum: number = 0;
    if (first >= 0xc2 && first <= 0xdf) { code = first & 0x1f; count = 1; minimum = 0x80; }
    else if (first >= 0xe0 && first <= 0xef) { code = first & 0x0f; count = 2; minimum = 0x800; }
    else if (first >= 0xf0 && first <= 0xf4) { code = first & 7; count = 3; minimum = 0x10000; }
    else if (first >= 0x80) { throw new DeoVrError('invalidUtf8'); }
    if (offset + count > bytes.byteLength) { throw new DeoVrError('invalidUtf8'); }
    for (let index: number = 0; index < count; index++) {
      const next: number = bytes[offset++];
      if ((next & 0xc0) !== 0x80) { throw new DeoVrError('invalidUtf8'); }
      code = (code << 6) | (next & 0x3f);
    }
    if (code < minimum || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) { throw new DeoVrError('invalidUtf8'); }
    chunk += code <= 0xffff ? String.fromCharCode(code) : String.fromCharCode(0xd800 + ((code - 0x10000) >>> 10), 0xdc00 + ((code - 0x10000) & 0x3ff));
    if (chunk.length >= 8192) { chunks.push(chunk); chunk = ''; }
  }
  chunks.push(chunk); return chunks.join('');
}
function validUnicode(text: string): boolean {
  for (let index: number = 0; index < text.length; index++) {
    const code: number = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      if (++index >= text.length || text.charCodeAt(index) < 0xdc00 || text.charCodeAt(index) > 0xdfff) { return false; }
    } else if (code >= 0xdc00 && code <= 0xdfff) { return false; }
  }
  return true;
}
export function encodeDeoVrUtf8(text: string): Uint8Array {
  if (!validUnicode(text)) { throw new DeoVrError('invalidUnicode'); }
  const output: number[] = [];
  for (let index: number = 0; index < text.length; index++) {
    let code: number = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) { code = 0x10000 + ((code - 0xd800) << 10) + text.charCodeAt(++index) - 0xdc00; }
    if (code < 0x80) { output.push(code); }
    else if (code < 0x800) { output.push(0xc0 | (code >>> 6), 0x80 | (code & 63)); }
    else if (code < 0x10000) { output.push(0xe0 | (code >>> 12), 0x80 | ((code >>> 6) & 63), 0x80 | (code & 63)); }
    else { output.push(0xf0 | (code >>> 18), 0x80 | ((code >>> 12) & 63), 0x80 | ((code >>> 6) & 63), 0x80 | (code & 63)); }
  }
  return new Uint8Array(output);
}
function guardJson(value: Object | null, depth: number, budget: number[]): void {
  if (depth > 16 || --budget[0] < 0) { throw new DeoVrError('jsonTooComplex'); }
  if (typeof value === 'number' && !Number.isFinite(value)) { throw new DeoVrError('nonfiniteJson'); }
  if (typeof value === 'string' && !validUnicode(value)) { throw new DeoVrError('invalidUnicode'); }
  if (value === null || typeof value !== 'object') { return; }
  if (Array.isArray(value)) {
    if (value.length > 1024) { throw new DeoVrError('jsonTooComplex'); }
    for (const child of value) { guardJson(child, depth + 1, budget); }
  } else {
    const object: Record<string, Object> = value as Record<string, Object>;
    for (const key of Object.keys(object)) {
      if (key.length > 256 || key === '__proto__' || key === 'prototype' || key === 'constructor' || key === '$type') { throw new DeoVrError('unsafeJsonKey'); }
      guardJson(object[key], depth + 1, budget);
    }
  }
}
function timeValue(value: Object): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= DEOVR_MAXIMUM_TIME_SECONDS ? value : null;
}
export function validDeoVrPath(path: string): boolean {
  return typeof path === 'string' && path.length <= DEOVR_MAXIMUM_PATH_LENGTH && path.trim().length > 0 && validUnicode(path) && path.indexOf('\u0000') < 0;
}
/** Invalid JSON throws; missing/blank path is a distinct source reset. Unknown
 * fields are ignored after the bounded tree/prototype-safety check. */
export function decodeDeoVrDocument(bytes: Uint8Array): Record<string, Object> {
  if (bytes.byteLength < 1 || bytes.byteLength > DEOVR_MAXIMUM_FRAME_BYTES) { throw new DeoVrError('invalidFrameLength'); }
  const text: string = decodeDeoVrUtf8(bytes);
  let raw: Object;
  try { raw = JSON.parse(text) as Object; } catch { throw new DeoVrError('invalidJson'); }
  guardJson(raw, 0, [2048]);
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) { throw new DeoVrError('invalidJsonObject'); }
  return raw as Record<string, Object>;
}
/** Shared bounded primitive field semantics; callers use the guarded document. */
export function decodeDeoVrPlayerFields(object: Record<string, Object>, path: Object): DeoVrPlayerPacket {
  const state: Object = object['playerState']; const speed: Object = object['playbackSpeed'];
  return {
    path: typeof path === 'string' && validDeoVrPath(path) ? path : null,
    playerState: typeof state === 'number' && Number.isInteger(state) && state >= -2147483648 && state <= 2147483647 ? state : null,
    durationSeconds: timeValue(object['duration']), positionSeconds: timeValue(object['currentTime']),
    speed: typeof speed === 'number' && Number.isFinite(speed) && speed > 0 && speed <= DEOVR_MAXIMUM_SPEED ? speed : null
  };
}
export function decodeDeoVrPacket(bytes: Uint8Array): DeoVrPlayerPacket {
  const object: Record<string, Object> = decodeDeoVrDocument(bytes);
  return decodeDeoVrPlayerFields(object, object['path']);
}
/** Json.NET emits integral doubles with .0; JSON readers treat this identically. */
function doubleJson(value: number): string {
  if (Number.isInteger(value)) { return value.toString() + '.0'; }
  // .NET invariant round-trip formatting uses scientific notation below 1e-4,
  // with an uppercase E and at least two exponent digits. Allowed upper bounds
  // remain below its positive-exponent switch point.
  if (Math.abs(value) < 0.0001) {
    const parts: string[] = value.toExponential().split('e');
    const exponent: number = Number(parts[1]);
    const digits: string = Math.abs(exponent).toString().padStart(2, '0');
    return parts[0] + 'E' + (exponent < 0 ? '-' : '+') + digits;
  }
  return value.toString();
}
/** TimeSpan.FromSeconds(double).TotalSeconds in the retained net9 source.
 * Input is already finite/nonnegative and capped below exact integer tick range. */
export function deoVrTimeSpanSeconds(seconds: number): number { return Math.trunc(seconds * 10000000) / 10000000; }
export function encodeDeoVrCommand(command: DeoVrCommand): Uint8Array {
  let path: string = 'null'; let position: string = 'null'; let speed: string = 'null'; let state: string = 'null';
  if (command.kind === 'playPause') {
    if (typeof command.playing !== 'boolean') { throw new DeoVrError('invalidCommand'); }
    state = command.playing ? '0' : '1';
  } else if (command.kind === 'seek') {
    if (typeof command.value !== 'number' || timeValue(command.value) === null) { throw new DeoVrError('invalidSeek'); }
    // MediaSeekMessage stores TimeSpan before the original writer obtains
    // TotalSeconds, so sub-100ns fractions are truncated, never observed.
    position = doubleJson(deoVrTimeSpanSeconds(command.value));
  } else if (command.kind === 'speed') {
    if (typeof command.value !== 'number' || !Number.isFinite(command.value) || command.value <= 0 || command.value > DEOVR_MAXIMUM_SPEED) { throw new DeoVrError('invalidSpeed'); }
    speed = doubleJson(command.value);
  } else if (command.kind === 'path') {
    if (typeof command.path !== 'string' || !validDeoVrPath(command.path)) { throw new DeoVrError('invalidPath'); }
    path = JSON.stringify(command.path);
  } else { throw new DeoVrError('invalidCommand'); }
  // PlayerState declaration order and null inclusion from the original source.
  // LF is Json.NET's platform newline on OHOS; whitespace has no wire semantics.
  const text: string = '{\n  "path": ' + path + ',\n  "currentTime": ' + position + ',\n  "playbackSpeed": ' + speed + ',\n  "playerState": ' + state + ',\n  "duration": null\n}';
  return frameDeoVrPayload(encodeDeoVrUtf8(text));
}
export function frameDeoVrPayload(payload: Uint8Array): Uint8Array {
  if (payload.byteLength > DEOVR_MAXIMUM_FRAME_BYTES) { throw new DeoVrError('frameTooLarge'); }
  const bytes: Uint8Array = new Uint8Array(payload.byteLength + 4);
  const length: number = payload.byteLength;
  bytes[0] = length & 255; bytes[1] = (length >>> 8) & 255; bytes[2] = (length >>> 16) & 255; bytes[3] = (length >>> 24) & 255;
  bytes.set(payload, 4); return bytes;
}
