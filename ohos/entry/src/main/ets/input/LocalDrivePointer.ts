import { ContinuousInputMapping, cloneContinuousMapping } from './ContinuousInputConfiguration';
import { ContinuousGesture } from './ContinuousDriveEngine';

export type LocalInputPhase = 'begin' | 'update' | 'end' | 'cancel' | 'unknown';
export type LocalNativeSource = 'touch' | 'mouse' | 'unknown';
export type LocalAxisTool = 'mouse' | 'touchpad' | 'unknown';

/** Component-local coordinates and dimensions are vp. The window origin is
 * retained only to detect relocation; it is never used as input displacement. */
export class LocalSurfaceGeometry {
  widthVp: number; heightVp: number; windowXVp: number; windowYVp: number;
  constructor(widthVp: number = 0, heightVp: number = 0, windowXVp: number = 0, windowYVp: number = 0) {
    this.widthVp = widthVp; this.heightVp = heightVp; this.windowXVp = windowXVp; this.windowYVp = windowYVp;
  }
}
export class LocalTouchPoint {
  id: number; xVp: number; yVp: number;
  constructor(id: number, xVp: number, yVp: number) { this.id = id; this.xVp = xVp; this.yVp = yVp; }
}
/** No native event object or callback survives the synchronous ArkUI handler. */
export class LocalTouchPacket {
  ownerKey: string; receptionRevision: number; phase: LocalInputPhase; eventTimestampNs: number;
  sourceType: number; sourceTool: number; source: LocalNativeSource;
  touches: LocalTouchPoint[]; changedTouches: LocalTouchPoint[];
  constructor(ownerKey: string, receptionRevision: number, phase: LocalInputPhase, eventTimestampNs: number,
    sourceType: number, sourceTool: number, source: LocalNativeSource,
    touches: LocalTouchPoint[], changedTouches: LocalTouchPoint[]) {
    this.ownerKey = ownerKey; this.receptionRevision = receptionRevision; this.phase = phase;
    this.eventTimestampNs = eventTimestampNs; this.sourceType = sourceType; this.sourceTool = sourceTool;
    this.source = source; this.touches = touches; this.changedTouches = changedTouches;
  }
}
export class LocalMousePacket {
  ownerKey: string; receptionRevision: number; phase: LocalInputPhase; eventTimestampNs: number;
  sourceType: number; sourceTool: number; source: LocalNativeSource;
  xVp: number; yVp: number; leftButton: boolean; pressedLeft: boolean | null;
  constructor(ownerKey: string, receptionRevision: number, phase: LocalInputPhase, eventTimestampNs: number,
    sourceType: number, sourceTool: number, source: LocalNativeSource,
    xVp: number, yVp: number, leftButton: boolean, pressedLeft: boolean | null) {
    this.ownerKey = ownerKey; this.receptionRevision = receptionRevision; this.phase = phase;
    this.eventTimestampNs = eventTimestampNs; this.sourceType = sourceType; this.sourceTool = sourceTool;
    this.source = source; this.xVp = xVp; this.yVp = yVp; this.leftButton = leftButton; this.pressedLeft = pressedLeft;
  }
}
export class LocalWheelPacket {
  ownerKey: string; receptionRevision: number; phase: LocalInputPhase; eventTimestampNs: number;
  sourceType: number; sourceTool: number; source: LocalNativeSource; tool: LocalAxisTool;
  xVp: number; yVp: number; horizontalAxisValue: number; verticalAxisValue: number;
  constructor(ownerKey: string, receptionRevision: number, phase: LocalInputPhase, eventTimestampNs: number,
    sourceType: number, sourceTool: number, source: LocalNativeSource, tool: LocalAxisTool,
    xVp: number, yVp: number, horizontalAxisValue: number, verticalAxisValue: number) {
    this.ownerKey = ownerKey; this.receptionRevision = receptionRevision; this.phase = phase;
    this.eventTimestampNs = eventTimestampNs; this.sourceType = sourceType; this.sourceTool = sourceTool;
    this.source = source; this.tool = tool; this.xVp = xVp; this.yVp = yVp;
    this.horizontalAxisValue = horizontalAxisValue; this.verticalAxisValue = verticalAxisValue;
  }
}
export class LocalPointerResult {
  handled: boolean; gesture: ContinuousGesture | null; contactEnded: boolean;
  receptionCancelled: boolean; reason: string; contactSerial: number;
  constructor(handled: boolean = false, gesture: ContinuousGesture | null = null, contactEnded: boolean = false,
    receptionCancelled: boolean = false, reason: string = '', contactSerial: number = 0) {
    this.handled = handled; this.gesture = gesture; this.contactEnded = contactEnded;
    this.receptionCancelled = receptionCancelled; this.reason = reason; this.contactSerial = contactSerial;
  }
}

/** Page-owned volatile adapter. Re-rendering status must not replace this object.
 * Touch and held mouse use position/span and local position differences/span;
 * their action duration is explicitly 0, never native timestamp differences.
 * SDK26 rawDelta has hardware-dependent units, so it is deliberately not used.
 * Axis getter values remain unchanged in packets, then use explicit wheelSpan
 * calibration. Wheel virtual position starts at .5; it never supplies a hold.
 */
export class LocalDrivePointer {
  private geometry: LocalSurfaceGeometry = new LocalSurfaceGeometry();
  private mapping: ContinuousInputMapping | null = null;
  private ownerKey: string = '';
  private revision: number = -1;
  private enabled: boolean = false;
  private pointerId: number = -1;
  private xVp: number = 0;
  private yVp: number = 0;
  private enabledAtNs: number = 0;
  private lastTimestampNs: number = -1;
  private serial: number = 0;
  private wheelValue: number = 0.5;

  isReceiving(): boolean { return this.enabled; }
  isContactActive(): boolean { return this.enabled && this.pointerId >= 0; }
  private validGeometry(value: LocalSurfaceGeometry): boolean {
    return Number.isFinite(value.widthVp) && value.widthVp > 0 && Number.isFinite(value.heightVp) && value.heightVp > 0 &&
      Number.isFinite(value.windowXVp) && Number.isFinite(value.windowYVp);
  }
  setGeometry(value: LocalSurfaceGeometry): boolean {
    const changed: boolean = value.widthVp !== this.geometry.widthVp || value.heightVp !== this.geometry.heightVp ||
      value.windowXVp !== this.geometry.windowXVp || value.windowYVp !== this.geometry.windowYVp;
    if (changed || !this.validGeometry(value)) { this.cancel('surface-changed'); }
    this.geometry = new LocalSurfaceGeometry(value.widthVp, value.heightVp, value.windowXVp, value.windowYVp);
    return changed;
  }
  enable(ownerKey: string, receptionRevision: number, mapping: ContinuousInputMapping, nowNs: number): boolean {
    this.cancel('replaced');
    if (ownerKey.length === 0 || !Number.isSafeInteger(receptionRevision) || receptionRevision < 0 ||
      !this.validGeometry(this.geometry) || !Number.isFinite(nowNs) || nowNs < 0 || !mapping.enabled) { return false; }
    try { this.mapping = cloneContinuousMapping(mapping); } catch (_) { return false; }
    this.ownerKey = ownerKey; this.revision = receptionRevision; this.enabledAtNs = nowNs;
    this.lastTimestampNs = -1; this.wheelValue = 0.5; this.enabled = true; return true;
  }
  cancel(reason: string): LocalPointerResult {
    const active: boolean = this.enabled; const contact: boolean = this.pointerId >= 0;
    this.enabled = false; this.pointerId = -1; this.mapping = null;
    return new LocalPointerResult(false, null, contact, active, reason, this.serial);
  }
  private matches(ownerKey: string, revision: number): boolean {
    return this.enabled && this.mapping !== null && this.ownerKey === ownerKey && this.revision === revision;
  }
  private fresh(timestampNs: number, nowNs: number): boolean {
    // Both clocks are startup ns. Duplicate timestamps are valid, backward and
    // queued pre-enable events are not. No integer-precision assumption is made.
    return Number.isFinite(timestampNs) && Number.isFinite(nowNs) && timestampNs >= this.enabledAtNs &&
      timestampNs >= this.lastTimestampNs && timestampNs <= nowNs + 1000000 && nowNs - timestampNs <= 500000000;
  }
  private inside(xVp: number, yVp: number): boolean {
    return this.validGeometry(this.geometry) && Number.isFinite(xVp) && Number.isFinite(yVp) &&
      xVp >= 0 && yVp >= 0 && xVp <= this.geometry.widthVp && yVp <= this.geometry.heightVp;
  }
  private finish(): LocalPointerResult {
    this.pointerId = -1;
    return new LocalPointerResult(true, null, true, false, 'release', this.serial);
  }
  private sample(xVp: number, yVp: number, timestampNs: number, beginning: boolean): LocalPointerResult {
    const mapping = this.mapping;
    if (mapping === null) { return new LocalPointerResult(); }
    const vertical: boolean = mapping.component === 'y';
    const span: number = vertical ? this.geometry.heightVp : this.geometry.widthVp;
    const value: number = (vertical ? yVp : xVp) / span;
    const delta: number = beginning ? 0 : ((vertical ? yVp - this.yVp : xVp - this.xVp) / span);
    if (!Number.isFinite(value) || !Number.isFinite(delta)) { return this.cancel('invalid-displacement'); }
    this.xVp = xVp; this.yVp = yVp; this.lastTimestampNs = timestampNs;
    const gesture = new ContinuousGesture(value, delta, 0, mapping.source, mapping.component,
      this.pointerId, true, timestampNs, 'ns');
    return new LocalPointerResult(true, gesture, false, false, '', this.serial);
  }
  touch(packet: LocalTouchPacket, nowNs: number): LocalPointerResult {
    if (!this.matches(packet.ownerKey, packet.receptionRevision) || this.mapping?.source !== 'touch' || packet.source !== 'touch') {
      return new LocalPointerResult();
    }
    if (packet.phase === 'cancel') { return this.cancel('native-cancel'); }
    if (!this.fresh(packet.eventTimestampNs, nowNs)) { return this.cancel('stale-native-time'); }
    if (packet.phase === 'end') {
      if (this.pointerId < 0) { return new LocalPointerResult(); }
      if (packet.changedTouches.length !== 1 || packet.changedTouches[0].id !== this.pointerId) { return this.cancel('pointer-ownership'); }
      this.lastTimestampNs = packet.eventTimestampNs; return this.finish();
    }
    if (packet.phase !== 'begin' && packet.phase !== 'update') { return new LocalPointerResult(); }
    if (packet.phase === 'update' && this.pointerId < 0) { return new LocalPointerResult(); }
    if (packet.touches.length !== 1 || packet.changedTouches.length !== 1) { return this.cancel('pointer-ambiguity'); }
    const point = packet.changedTouches[0];
    if (!Number.isSafeInteger(point.id) || point.id < 0 || packet.touches[0].id !== point.id) { return this.cancel('pointer-ownership'); }
    if (!this.inside(point.xVp, point.yVp)) { return this.cancel('left-region'); }
    if (packet.phase === 'begin') {
      if (this.pointerId >= 0) { return this.cancel('pointer-ambiguity'); }
      this.pointerId = point.id; this.serial++;
    } else if (this.pointerId !== point.id) { return this.cancel('pointer-ownership'); }
    return this.sample(point.xVp, point.yVp, packet.eventTimestampNs, packet.phase === 'begin');
  }
  mouse(packet: LocalMousePacket, nowNs: number): LocalPointerResult {
    if (!this.matches(packet.ownerKey, packet.receptionRevision) || this.mapping?.source !== 'mouse' || packet.source !== 'mouse') {
      return new LocalPointerResult();
    }
    if (packet.phase === 'cancel') { return this.cancel('native-cancel'); }
    if (!this.fresh(packet.eventTimestampNs, nowNs)) { return this.cancel('stale-native-time'); }
    if (packet.phase === 'end') {
      if (this.pointerId < 0) { return new LocalPointerResult(); }
      if (!packet.leftButton) { return this.cancel('button-ownership'); }
      this.lastTimestampNs = packet.eventTimestampNs; return this.finish();
    }
    if (packet.phase !== 'begin' && packet.phase !== 'update') { return new LocalPointerResult(); }
    if (packet.phase === 'update' && this.pointerId < 0) { return new LocalPointerResult(); }
    if (packet.pressedLeft === false) { return this.cancel('button-released'); }
    if (!this.inside(packet.xVp, packet.yVp)) { return this.cancel('left-region'); }
    if (packet.phase === 'begin') {
      if (!packet.leftButton) { return new LocalPointerResult(); }
      if (this.pointerId >= 0) { return this.cancel('button-ownership'); }
      this.pointerId = 0; this.serial++;
    }
    return this.sample(packet.xVp, packet.yVp, packet.eventTimestampNs, packet.phase === 'begin');
  }
  wheel(packet: LocalWheelPacket, nowNs: number): LocalPointerResult {
    const mapping = this.mapping;
    if (!this.matches(packet.ownerKey, packet.receptionRevision) || mapping === null || mapping.source !== 'wheel' ||
      mapping.kind !== 'drive' || packet.source !== 'mouse' || (packet.tool !== 'mouse' && packet.tool !== 'touchpad')) {
      return new LocalPointerResult();
    }
    if (packet.phase === 'cancel') { return this.cancel('native-cancel'); }
    if (!this.fresh(packet.eventTimestampNs, nowNs)) { return this.cancel('stale-native-time'); }
    if (!this.inside(packet.xVp, packet.yVp)) { return this.cancel('left-region'); }
    if (packet.phase === 'end') { this.lastTimestampNs = packet.eventTimestampNs; return new LocalPointerResult(); }
    if (packet.phase !== 'begin' && packet.phase !== 'update') { return new LocalPointerResult(); }
    if (!Number.isFinite(packet.horizontalAxisValue) || !Number.isFinite(packet.verticalAxisValue)) { return this.cancel('invalid-axis-sample'); }
    const delta: number = (mapping.component === 'wheelX' ? packet.horizontalAxisValue : packet.verticalAxisValue) / mapping.wheelSpan;
    if (!Number.isFinite(delta)) { return this.cancel('invalid-axis-sample'); }
    this.lastTimestampNs = packet.eventTimestampNs;
    if (delta === 0) { return new LocalPointerResult(); }
    this.wheelValue = Math.max(0, Math.min(1, this.wheelValue + delta)); this.serial++;
    return new LocalPointerResult(true, new ContinuousGesture(this.wheelValue, delta, 0, 'wheel', mapping.component,
      0, false, packet.eventTimestampNs, 'ns'), false, false, '', this.serial);
  }
}
