import { DeoVrError, validateDeoVrEndpoint } from './DeoVrTypes';
import type { DeoVrClock, DeoVrDispatchBoundary, DeoVrDispatchCallback, DeoVrEndpoint, DeoVrEvent, DeoVrEventKind, DeoVrOptions, DeoVrPacketObservation,
  DeoVrSendReceipt, DeoVrSnapshot, DeoVrTransport, DeoVrTransportFactory, DeoVrTransportSink } from './DeoVrTypes';
import type { DeoVrCommand, DeoVrObservedFrame, DeoVrPlayerPacket, DeoVrProtocolStrategy } from './DeoVrProtocol';
import { DeoVrFrameDecoder, DEOVR_MAXIMUM_RECEIVE_BYTES,
  DeoVrProtocol, deoVrTimeSpanSeconds } from './DeoVrProtocol';

// Private source ownership cannot be supplied through a public metadata factory.
// Frozen detached copies remain genuine; a spread/handmade object does not.
const observationOwners: WeakMap<DeoVrPacketObservation, DeoVrMediaSource> = new WeakMap<DeoVrPacketObservation, DeoVrMediaSource>();
const dispatchOwners: WeakMap<DeoVrDispatchBoundary, DeoVrMediaSource> = new WeakMap<DeoVrDispatchBoundary, DeoVrMediaSource>();
const dispatchCommands: WeakMap<DeoVrDispatchBoundary, DeoVrCommand> = new WeakMap<DeoVrDispatchBoundary, DeoVrCommand>();
export function isDeoVrPacketObservation(observation: DeoVrPacketObservation): boolean { return observationOwners.has(observation); }
export function sameDeoVrObservationSource(first: DeoVrPacketObservation, second: DeoVrPacketObservation): boolean {
  return observationOwners.has(first) && observationOwners.get(first) === observationOwners.get(second);
}
export function isDeoVrDispatchBoundaryForObservation(boundary: DeoVrDispatchBoundary, observation: DeoVrPacketObservation,
  kind: 'play' | 'pause' | 'speed', speed?: number): boolean {
  const command: DeoVrCommand | undefined = dispatchCommands.get(boundary);
  return dispatchOwners.has(boundary) && dispatchOwners.get(boundary) === observationOwners.get(observation) && command !== undefined &&
    (kind === 'speed' ? command.kind === 'speed' && command.value === speed : command.kind === 'playPause' && command.playing === (kind === 'play'));
}
interface DeoVrOpeningChunk { bytes: Uint8Array; receivedAtMs: number; ingressId: number; }
interface DeoVrQueuedCommand {
  bytes: Uint8Array;
  command: DeoVrCommand;
  commandId: number;
  resourceRevision: number;
  onDispatch: DeoVrDispatchCallback | null;
  resolve: (receipt: DeoVrSendReceipt) => void;
  reject: (error: DeoVrError) => void;
}
class DeoVrGeneration {
  generation: number;
  active: boolean = true;
  connected: boolean = false;
  transport: DeoVrTransport | null = null;
  decoder: DeoVrFrameDecoder = new DeoVrFrameDecoder();
  openingBytes: DeoVrOpeningChunk[] = [];
  openingByteCount: number = 0;
  allocatedState: boolean = false;
  ingressSequence: number = 0;
  packetSequence: number = 0;
  rawDurationSeconds: number | null = null;
  rawPositionSeconds: number | null = null;
  writing: boolean = false;
  queue: DeoVrQueuedCommand[] = [];
  operations: Array<(error: DeoVrError) => void> = [];
  heartbeat: number | null = null;
  openInFlight: boolean = false;
  openSettled: Promise<void> | null = null;
  finishOpen: (() => void) | null = null;
  needsLateClose: boolean = false;
  closePromise: Promise<void> | null = null;
  closeConfirmed: boolean = false;
  quarantined: boolean = false;
  constructor(generation: number) { this.generation = generation; }
}
function defaultOptions(): DeoVrOptions {
  return { connectTimeoutMs: 5000, sendTimeoutMs: 2000, closeTimeoutMs: 1500, heartbeatIntervalMs: 1000, maximumQueuedCommands: 64 };
}
function initialSnapshot(): DeoVrSnapshot {
  return { status: 'disconnected', generation: 0, endpoint: null, path: null, playerState: null, playing: false,
    durationSeconds: null, positionSeconds: null, speed: null, resourceRevision: 0, eventSequence: 0,
    receiptSequence: 0, currentTimeValid: false, durationValid: false, playerStateValid: false, speedValid: false,
    observedAtMs: -1, lastChangedAtMs: -1, lastReceivedAtMs: -1, lastObservation: null,
    diagnostic: null, closeConfirmed: true, quarantined: false };
}

/** Explicitly connected source. Construction, settings restoration, snapshot and
 * subscriptions are inert. This class never reads a path, advances a clock from
 * elapsed time, arms output, or treats a successful command as player state. */
export class DeoVrMediaSource {
  private readonly factory: DeoVrTransportFactory;
  private readonly clock: DeoVrClock;
  private readonly options: DeoVrOptions;
  private readonly decodePacket: (bytes: Uint8Array) => DeoVrPlayerPacket;
  private readonly encodeCommand: (command: DeoVrCommand) => Uint8Array;
  private value: DeoVrSnapshot = initialSnapshot();
  private current: DeoVrGeneration | null = null;
  private listeners: Array<(snapshot: DeoVrSnapshot, events: ReadonlyArray<DeoVrEvent>) => void> = [];
  private lastNow: number = -1;
  private commandSequence: number = 0;
  constructor(factory: DeoVrTransportFactory, clock: DeoVrClock, options: DeoVrOptions = defaultOptions(),
    protocol: DeoVrProtocolStrategy = new DeoVrProtocol()) {
    const values: number[] = [options.connectTimeoutMs, options.sendTimeoutMs, options.closeTimeoutMs, options.heartbeatIntervalMs, options.maximumQueuedCommands];
    if (values.some(value => !Number.isSafeInteger(value) || value <= 0 || value > 2147483647) || options.maximumQueuedCommands > 1024) {
      throw new DeoVrError('invalidOptions');
    }
    const sourceKind: 'deovr' | 'heresphere' = protocol.sourceKind;
    if ((sourceKind !== 'deovr' && sourceKind !== 'heresphere') ||
      typeof protocol.decodePacket !== 'function' || typeof protocol.encodeCommand !== 'function') { throw new DeoVrError('invalidProtocol'); }
    this.factory = factory; this.clock = clock; this.value.sourceKind = sourceKind;
    // Capture dispatch once; later external strategy-object edits cannot swap
    // protocol identity or parsing/encoding functions in a live source.
    this.decodePacket = protocol.decodePacket.bind(protocol); this.encodeCommand = protocol.encodeCommand.bind(protocol);
    if (sourceKind === 'heresphere') { this.value.sceneUri = null; }
    this.options = { connectTimeoutMs: options.connectTimeoutMs, sendTimeoutMs: options.sendTimeoutMs,
      closeTimeoutMs: options.closeTimeoutMs, heartbeatIntervalMs: options.heartbeatIntervalMs, maximumQueuedCommands: options.maximumQueuedCommands };
  }
  snapshot(): DeoVrSnapshot { return this.copySnapshot(this.value); }
  private copySnapshot(value: DeoVrSnapshot): DeoVrSnapshot {
    const copy: DeoVrSnapshot = { sourceKind: value.sourceKind, status: value.status, generation: value.generation,
      endpoint: value.endpoint === null ? null : { host: value.endpoint.host, port: value.endpoint.port, family: value.endpoint.family },
      path: value.path, playerState: value.playerState, playing: value.playing, durationSeconds: value.durationSeconds,
      positionSeconds: value.positionSeconds, speed: value.speed, resourceRevision: value.resourceRevision,
      eventSequence: value.eventSequence, receiptSequence: value.receiptSequence, currentTimeValid: value.currentTimeValid,
      durationValid: value.durationValid, playerStateValid: value.playerStateValid, speedValid: value.speedValid,
      observedAtMs: value.observedAtMs, lastChangedAtMs: value.lastChangedAtMs, lastReceivedAtMs: value.lastReceivedAtMs,
      lastObservation: value.lastObservation === null ? null : this.copyObservation(value.lastObservation),
      diagnostic: value.diagnostic, closeConfirmed: value.closeConfirmed, quarantined: value.quarantined };
    if (value.sceneUri !== undefined) { copy.sceneUri = value.sceneUri; }
    return copy;
  }
  private copyObservation(value: DeoVrPacketObservation): DeoVrPacketObservation {
    const copy: DeoVrPacketObservation = Object.freeze({ packetSequence: value.packetSequence, generation: value.generation,
      resourceRevision: value.resourceRevision, path: value.path, positionSeconds: value.positionSeconds,
      playerState: value.playerState, speed: value.speed, firstIngressId: value.firstIngressId, lastIngressId: value.lastIngressId,
      firstReceivedAtMs: value.firstReceivedAtMs, receivedAtMs: value.receivedAtMs });
    observationOwners.set(copy, this); return copy;
  }
  subscribe(listener: (snapshot: DeoVrSnapshot, events: ReadonlyArray<DeoVrEvent>) => void): () => void {
    this.listeners.push(listener);
    return (): void => { this.listeners = this.listeners.filter(value => value !== listener); };
  }
  private notify(events: DeoVrEvent[] = []): void {
    const snapshot: DeoVrSnapshot = this.snapshot();
    for (const listener of this.listeners.slice()) {
      // Each observer receives its own detached copy and cannot corrupt the
      // next observer's ordered event batch or prevent resource cleanup.
      const copies: DeoVrEvent[] = events.map(event => {
        const copy: DeoVrEvent = { kind: event.kind, generation: event.generation, sequence: event.sequence,
          resourceRevision: event.resourceRevision, receivedAtMs: event.receivedAtMs, path: event.path,
          playing: event.playing, value: event.value, reason: event.reason };
        if (event.sceneUri !== undefined) { copy.sceneUri = event.sceneUri; }
        return copy;
      });
      try { listener(this.copySnapshot(snapshot), copies); } catch { /* Observer failure cannot revive a generation. */ }
    }
  }
  private now(): number {
    const value: number = this.clock.nowMs();
    if (!Number.isFinite(value) || value < 0 || value < this.lastNow) { throw new DeoVrError('invalidMonotonicClock'); }
    this.lastNow = value; return value;
  }
  private live(entry: DeoVrGeneration): boolean { return entry.active && this.current === entry; }
  async connect(endpoint: DeoVrEndpoint): Promise<void> {
    const copy: DeoVrEndpoint = validateDeoVrEndpoint(endpoint);
    if (this.current !== null && this.current.active) { throw new DeoVrError('alreadyConnectingOrConnected'); }
    if (this.current !== null && this.current.closePromise !== null) { await this.current.closePromise; }
    if (this.current !== null && (!this.current.closeConfirmed || this.current.quarantined)) { throw new DeoVrError('priorCloseUnconfirmed'); }
    // No await between checking admission and reserving this generation.
    const entry: DeoVrGeneration = new DeoVrGeneration(this.value.generation + 1);
    this.current = entry; this.value.generation = entry.generation; this.value.endpoint = copy;
    this.value.status = 'connecting'; this.value.diagnostic = null; this.value.closeConfirmed = false; this.value.quarantined = false;
    this.notify();
    if (!this.live(entry)) { throw new DeoVrError('cancelled'); }
    const sink: DeoVrTransportSink = {
      received: (bytes: Uint8Array): void => this.received(entry, bytes),
      closed: (): void => this.fail(entry, new DeoVrError('peerClosed')),
      error: (): void => this.fail(entry, new DeoVrError('transportError'))
    };
    try {
      entry.transport = this.factory.create(copy, entry.generation, sink);
      const transport: DeoVrTransport = entry.transport;
      await this.operation(entry, (): Promise<void> => transport.connect(), this.options.connectTimeoutMs, 'connect');
      if (!this.live(entry)) { throw new DeoVrError('cancelled'); }
      entry.connected = true; this.value.status = 'connected'; this.notify();
      const opening: DeoVrOpeningChunk[] = entry.openingBytes;
      entry.openingBytes = []; entry.openingByteCount = 0;
      for (const chunk of opening) { this.received(entry, chunk.bytes, chunk.receivedAtMs, chunk.ingressId); }
      if (!this.live(entry)) { throw new DeoVrError('cancelled'); }
      this.scheduleHeartbeat(entry);
    } catch (error) {
      const failure: DeoVrError = error instanceof DeoVrError ? error : new DeoVrError('connectFailed');
      this.fail(entry, failure); throw failure;
    }
  }
  /** Closes the local admission gate synchronously, before awaiting native close. */
  async disconnect(): Promise<void> {
    const entry: DeoVrGeneration | null = this.current;
    if (entry === null) { return; }
    if (entry.active) {
      this.value.status = 'disconnecting';
      this.retire(entry, new DeoVrError('cancelled'));
    }
    if (entry.closePromise !== null) { await entry.closePromise; }
    if (!entry.closeConfirmed || entry.quarantined) { throw new DeoVrError('priorCloseUnconfirmed'); }
    if (this.current === entry) { this.value.status = 'disconnected'; this.notify(); }
  }
  playPause(playing: boolean, onDispatch?: DeoVrDispatchCallback): Promise<DeoVrSendReceipt> {
    return this.command({ kind: 'playPause', playing: playing }, onDispatch);
  }
  seek(seconds: number): Promise<DeoVrSendReceipt> { return this.command({ kind: 'seek', value: seconds }); }
  changePath(path: string): Promise<DeoVrSendReceipt> { return this.command({ kind: 'path', path: path }); }
  changeSpeed(speed: number, onDispatch?: DeoVrDispatchCallback): Promise<DeoVrSendReceipt> {
    return this.command({ kind: 'speed', value: speed }, onDispatch);
  }
  private async command(command: DeoVrCommand, onDispatch?: DeoVrDispatchCallback): Promise<DeoVrSendReceipt> {
    const bytes: Uint8Array = this.encodeCommand(command);
    const entry: DeoVrGeneration | null = this.current;
    if (entry === null || !this.live(entry) || !entry.connected || this.value.status !== 'connected') { throw new DeoVrError('notConnected'); }
    if (entry.queue.length >= this.options.maximumQueuedCommands) { throw new DeoVrError('commandQueueFull'); }
    return new Promise<DeoVrSendReceipt>((resolve, reject): void => {
      entry.queue.push({ bytes: bytes, command: command, commandId: ++this.commandSequence, resourceRevision: this.value.resourceRevision,
        onDispatch: onDispatch ?? null, resolve: resolve, reject: reject });
      this.cancelHeartbeat(entry); void this.pump(entry);
    });
  }
  private async pump(entry: DeoVrGeneration): Promise<void> {
    if (!this.live(entry) || !entry.connected || entry.writing || entry.transport === null) { return; }
    const transport: DeoVrTransport = entry.transport;
    entry.writing = true;
    try {
      while (this.live(entry) && entry.queue.length > 0) {
        const command: DeoVrQueuedCommand = entry.queue.shift() as DeoVrQueuedCommand;
        try {
          if (command.resourceRevision !== this.value.resourceRevision) { command.reject(new DeoVrError('staleResource')); continue; }
          await this.operation(entry, (): Promise<void> => {
            if (command.resourceRevision !== this.value.resourceRevision) { throw new DeoVrError('staleResource'); }
            let boundary: DeoVrDispatchBoundary | null = null;
            try {
              if (command.onDispatch !== null) {
                boundary = Object.freeze({ commandId: command.commandId, generation: entry.generation,
                  resourceRevision: command.resourceRevision, packetSequenceFloor: entry.packetSequence,
                  ingressSequenceFloor: entry.ingressSequence, startedAtMs: this.now() });
                dispatchOwners.set(boundary, this); dispatchCommands.set(boundary, command.command);
                if (command.onDispatch(boundary) === false) { throw new DeoVrError('cancelled'); }
              }
              // Callback may synchronously disconnect, replace resource or throw.
              // Nothing asynchronous separates this check from the real invocation.
              if (!this.live(entry) || !entry.connected || entry.transport !== transport || this.value.status !== 'connected') { throw new DeoVrError('cancelled'); }
              if (command.resourceRevision !== this.value.resourceRevision) { throw new DeoVrError('staleResource'); }
              return transport.send(command.bytes);
            } catch (error) {
              if (boundary !== null) { dispatchOwners.delete(boundary); dispatchCommands.delete(boundary); }
              throw error instanceof DeoVrError ? error : new DeoVrError('sendFailed');
            }
          }, this.options.sendTimeoutMs, 'send');
          if (!this.live(entry)) { throw new DeoVrError('cancelled'); }
          command.resolve({ generation: entry.generation, acceptedBytes: command.bytes.byteLength, remoteAcknowledgement: false });
        } catch (error) {
          const failure: DeoVrError = error instanceof DeoVrError ? error : new DeoVrError('sendFailed');
          if (failure.code === 'staleResource' || (failure.code === 'cancelled' && this.live(entry))) { command.reject(failure); continue; }
          command.reject(failure); this.fail(entry, failure); break;
        }
      }
    } finally { entry.writing = false; if (this.live(entry)) { this.scheduleHeartbeat(entry); } }
  }
  private cancelHeartbeat(entry: DeoVrGeneration): void {
    if (entry.heartbeat !== null) {
      const handle: number = entry.heartbeat; entry.heartbeat = null;
      try { this.clock.cancel(handle); } catch { /* Gate ownership still revokes queued timer callbacks. */ }
    }
  }
  private scheduleHeartbeat(entry: DeoVrGeneration): void {
    this.cancelHeartbeat(entry);
    if (!this.live(entry) || !entry.connected || entry.writing) { return; }
    try {
      entry.heartbeat = this.clock.scheduleAt(this.now() + this.options.heartbeatIntervalMs, (): void => {
        entry.heartbeat = null;
        if (!this.live(entry) || !entry.connected || entry.writing || entry.transport === null) { return; }
        const transport: DeoVrTransport = entry.transport;
        entry.writing = true;
        void this.operation(entry, (): Promise<void> => transport.send(new Uint8Array(4)), this.options.sendTimeoutMs, 'send')
          .catch((error: DeoVrError): void => this.fail(entry, error))
          .finally((): void => {
            entry.writing = false;
            if (!this.live(entry)) { return; }
            if (entry.queue.length > 0) { void this.pump(entry); } else { this.scheduleHeartbeat(entry); }
          });
      });
    } catch { this.fail(entry, new DeoVrError('invalidMonotonicClock')); }
  }
  private operation(entry: DeoVrGeneration, action: () => Promise<void>, timeoutMs: number, kind: string): Promise<void> {
    return new Promise<void>((resolve, reject): void => {
      let settled: boolean = false; let timer: number | null = null;
      const finish = (error: DeoVrError | null): void => {
        if (settled) { return; } settled = true;
        if (timer !== null) { try { this.clock.cancel(timer); } catch { /* Stale timer is guarded. */ } }
        entry.operations = entry.operations.filter(value => value !== cancel);
        if (error === null) { resolve(); } else { reject(error); }
      };
      const cancel = (error: DeoVrError): void => finish(error);
      entry.operations.push(cancel);
      try {
        if (!this.live(entry)) { finish(new DeoVrError('cancelled')); return; }
        const deadline: number = this.now() + timeoutMs;
        timer = this.clock.scheduleAt(deadline, (): void => {
          if (settled || !this.live(entry)) { return; }
          this.fail(entry, new DeoVrError(kind + 'Timeout'));
        });
        if (kind === 'connect') {
          entry.openInFlight = true;
          entry.openSettled = new Promise<void>((resolve): void => { entry.finishOpen = resolve; });
        }
        action().then((): void => {
          if (kind === 'connect') {
            if (!this.live(entry)) { entry.needsLateClose = true; }
            this.finishOpening(entry);
          }
          if (settled) { return; }
          if (!this.live(entry)) { finish(new DeoVrError('cancelled')); return; }
          try {
            if (this.now() >= deadline) { this.fail(entry, new DeoVrError(kind + 'Timeout')); return; }
            finish(null);
          } catch { this.fail(entry, new DeoVrError('invalidMonotonicClock')); }
        }).catch((): void => {
          if (kind === 'connect') { this.finishOpening(entry); }
          if (settled) { return; }
          if (this.live(entry)) { this.fail(entry, new DeoVrError(kind + 'Failed')); } else { finish(new DeoVrError('cancelled')); }
        });
      } catch (error) {
        if (kind === 'connect') { this.finishOpening(entry); }
        if (error instanceof DeoVrError && (error.code === 'staleResource' || error.code === 'cancelled')) { finish(error); return; }
        this.fail(entry, new DeoVrError(kind + 'Failed'));
      }
    });
  }
  private received(entry: DeoVrGeneration, bytes: Uint8Array, originalReceivedAt: number | null = null, originalIngressId: number | null = null): void {
    if (!this.live(entry)) { return; }
    if (bytes.byteLength > DEOVR_MAXIMUM_RECEIVE_BYTES) { this.fail(entry, new DeoVrError('receiveTooLarge')); return; }
    let receivedAt: number;
    try { receivedAt = originalReceivedAt === null ? this.now() : originalReceivedAt; }
    catch { this.fail(entry, new DeoVrError('invalidMonotonicClock')); return; }
    const ingressId: number = originalIngressId === null ? ++entry.ingressSequence : originalIngressId;
    if (!entry.connected) {
      entry.openingByteCount += bytes.byteLength;
      if (entry.openingByteCount > DEOVR_MAXIMUM_RECEIVE_BYTES || entry.openingBytes.length >= 1024) { this.fail(entry, new DeoVrError('openingReceiveTooLarge')); return; }
      entry.openingBytes.push({ bytes: bytes.slice(), receivedAtMs: receivedAt, ingressId: ingressId }); return;
    }
    try {
      const frames: DeoVrObservedFrame[] = entry.decoder.pushObserved(bytes, { ingressId: ingressId, receivedAtMs: receivedAt });
      for (const frame of frames) {
        if (!this.live(entry)) { break; }
        entry.packetSequence++;
        if (frame.payload === null) { this.resetMedia(entry, receivedAt, 'emptyFrame', false); continue; }
        entry.allocatedState = true;
        let packet: DeoVrPlayerPacket;
        try { packet = this.decodePacket(frame.payload); }
        catch (error) {
          this.value.currentTimeValid = false; this.value.lastObservation = null;
          this.value.diagnostic = error instanceof DeoVrError ? error.code : 'invalidPacket'; this.notify(); continue;
        }
        if (packet.path === null) { this.resetMedia(entry, receivedAt, 'missingPath', false); continue; }
        this.applyPacket(entry, packet, frame);
      }
    } catch (error) { this.fail(entry, error instanceof DeoVrError ? error : new DeoVrError('receiveFailed')); }
  }
  private event(entry: DeoVrGeneration, kind: DeoVrEventKind, receivedAt: number): DeoVrEvent {
    return { kind: kind, generation: entry.generation, sequence: ++this.value.eventSequence,
      resourceRevision: this.value.resourceRevision, receivedAtMs: receivedAt };
  }
  private clearResourceEvidence(): void {
    this.value.currentTimeValid = false; this.value.durationValid = false; this.value.playerStateValid = false; this.value.speedValid = false;
    this.value.observedAtMs = -1; this.value.lastChangedAtMs = -1; this.value.lastReceivedAtMs = -1;
    this.value.lastObservation = null;
  }
  private applyPacket(entry: DeoVrGeneration, packet: DeoVrPlayerPacket, frame: DeoVrObservedFrame): void {
    const receivedAt: number = frame.receivedAtMs;
    const events: DeoVrEvent[] = [];
    // The original reader retains optional field cache on changed paths. Keep
    // those equality semantics, but revoke current-resource evidence separately.
    if (packet.path !== this.value.path) {
      this.value.path = packet.path; this.value.resourceRevision++; this.clearResourceEvidence();
      const event: DeoVrEvent = this.event(entry, 'path', receivedAt); event.path = packet.path as string;
      if (packet.sceneUri !== undefined) { this.value.sceneUri = packet.sceneUri; event.sceneUri = packet.sceneUri; }
      events.push(event);
    }
    if (packet.playerState !== null) {
      this.value.playerStateValid = true;
      if (packet.playerState !== this.value.playerState) {
        this.value.playerState = packet.playerState; this.value.playing = packet.playerState === 0;
        const event: DeoVrEvent = this.event(entry, 'playing', receivedAt); event.playing = this.value.playing; event.value = packet.playerState; events.push(event);
      }
    }
    if (packet.durationSeconds !== null) {
      this.value.durationValid = true;
      if (packet.durationSeconds !== entry.rawDurationSeconds) {
        entry.rawDurationSeconds = packet.durationSeconds; this.value.durationSeconds = deoVrTimeSpanSeconds(packet.durationSeconds);
        const event: DeoVrEvent = this.event(entry, 'duration', receivedAt); event.value = this.value.durationSeconds; events.push(event);
      }
    }
    this.value.currentTimeValid = packet.positionSeconds !== null;
    if (packet.positionSeconds !== null) {
      this.value.receiptSequence++; this.value.observedAtMs = receivedAt;
      if (packet.positionSeconds !== entry.rawPositionSeconds) {
        entry.rawPositionSeconds = packet.positionSeconds; this.value.positionSeconds = deoVrTimeSpanSeconds(packet.positionSeconds); this.value.lastChangedAtMs = receivedAt;
        const event: DeoVrEvent = this.event(entry, 'position', receivedAt); event.value = this.value.positionSeconds; events.push(event);
      }
    }
    if (packet.speed !== null) {
      this.value.speedValid = true;
      if (packet.speed !== this.value.speed) {
        this.value.speed = packet.speed;
        const event: DeoVrEvent = this.event(entry, 'speed', receivedAt); event.value = packet.speed; events.push(event);
      }
    }
    this.value.lastObservation = this.copyObservation({ packetSequence: entry.packetSequence, generation: entry.generation,
      resourceRevision: this.value.resourceRevision, path: packet.path as string,
      positionSeconds: packet.positionSeconds === null ? null : deoVrTimeSpanSeconds(packet.positionSeconds),
      playerState: packet.playerState, speed: packet.speed, firstIngressId: frame.firstIngressId, lastIngressId: frame.lastIngressId,
      firstReceivedAtMs: frame.firstReceivedAtMs, receivedAtMs: receivedAt });
    this.value.lastReceivedAtMs = receivedAt; this.value.diagnostic = null; this.notify(events);
  }
  private resetMedia(entry: DeoVrGeneration, receivedAt: number, reason: string, force: boolean): void {
    if (!entry.allocatedState && !force) { return; }
    entry.allocatedState = false; entry.rawDurationSeconds = null; entry.rawPositionSeconds = null; this.value.resourceRevision++;
    this.value.path = null; this.value.playerState = null; this.value.playing = false;
    if (this.value.sceneUri !== undefined) { this.value.sceneUri = null; }
    this.value.durationSeconds = null; this.value.positionSeconds = null; this.value.speed = null; this.clearResourceEvidence();
    const event: DeoVrEvent = this.event(entry, 'reset', receivedAt); event.reason = reason; this.notify([event]);
  }
  private fail(entry: DeoVrGeneration, error: DeoVrError): void {
    if (!this.live(entry)) { return; }
    this.value.status = 'fault'; this.value.diagnostic = error.code; this.retire(entry, error);
  }
  private retire(entry: DeoVrGeneration, error: DeoVrError): void {
    if (!entry.active) { return; }
    entry.active = false; this.cancelHeartbeat(entry);
    for (const cancel of entry.operations.slice()) { cancel(error); }
    for (const command of entry.queue) { command.reject(error); } entry.queue = [];
    entry.decoder.reset(); entry.openingBytes = []; entry.openingByteCount = 0;
    this.resetMedia(entry, -1, error.code, entry.connected);
    entry.connected = false;
    let detachFailed: boolean = false;
    if (entry.transport !== null) { try { entry.transport.detach(); } catch { detachFailed = true; } }
    entry.closePromise = this.closeTransport(entry).then((): void => {
      if (detachFailed) { throw new DeoVrError('detachFailed'); }
      if (entry.quarantined) { throw new DeoVrError('priorCloseUnconfirmed'); }
      entry.closeConfirmed = true;
      if (this.current === entry) { this.value.closeConfirmed = true; this.notify(); }
    }).catch((error: DeoVrError): void => {
      entry.quarantined = true;
      if (this.current === entry) {
        this.value.status = 'fault'; this.value.quarantined = true; this.value.closeConfirmed = false;
        this.value.diagnostic = error instanceof DeoVrError ? error.code : 'closeFailed'; this.notify();
      }
      throw error;
    });
    void entry.closePromise.catch((): void => {}); this.notify();
  }
  private finishOpening(entry: DeoVrGeneration): void {
    entry.openInFlight = false;
    if (entry.finishOpen !== null) { entry.finishOpen(); entry.finishOpen = null; }
  }
  private async finishTransportClose(entry: DeoVrGeneration, transport: DeoVrTransport): Promise<void> {
    await transport.close();
    if (entry.openInFlight && entry.openSettled !== null) { await entry.openSettled; }
    if (entry.needsLateClose) { entry.needsLateClose = false; await transport.close(); }
  }
  private closeTransport(entry: DeoVrGeneration): Promise<void> {
    const transport: DeoVrTransport | null = entry.transport;
    if (transport === null) { return Promise.resolve(); }
    return new Promise<void>((resolve, reject): void => {
      let settled: boolean = false; let timer: number | null = null;
      const finish = (error: DeoVrError | null): void => {
        if (settled) { return; } settled = true;
        if (timer !== null) { try { this.clock.cancel(timer); } catch { /* Stale completion is ignored. */ } }
        if (error === null) { resolve(); } else { entry.quarantined = true; reject(error); }
      };
      try {
        const deadline: number = this.now() + this.options.closeTimeoutMs;
        timer = this.clock.scheduleAt(deadline, (): void => finish(new DeoVrError('closeTimeout')));
        this.finishTransportClose(entry, transport).then((): void => {
          try { finish(this.now() >= deadline ? new DeoVrError('closeTimeout') : null); }
          catch { finish(new DeoVrError('invalidMonotonicClock')); }
        }).catch((): void => finish(new DeoVrError('closeFailed')));
      } catch {
        // Invalid clock/scheduler still requires an immediate best-effort close.
        try { void transport.close().catch((): void => {}); } catch { /* Quarantine retains ownership. */ }
        finish(new DeoVrError('closeFailed'));
      }
    });
  }
}
