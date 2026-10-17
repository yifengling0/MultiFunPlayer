import { OutputError } from './OutputTypes';
import type { OutputTargetConfig } from './OutputTypes';
import type { TransportEvent, TransportPort, WriteReceipt, WriteRequest, WriteSemantics } from './TransportPort';
import type { MonotonicClock } from './UpdateContext';

export interface MemoryWriteRecord extends WriteRequest { readonly startedMonotonicMs: number; }
export interface MemoryCloseRecord { readonly reason: string; readonly connectionGeneration: number; }
export interface MemoryWritePlan {
  readonly kind: 'accept' | 'defer' | 'reject';
  readonly acceptedBytes?: number;
  readonly receiptGeneration?: number;
}
interface PendingWrite { request: WriteRequest; resolve: (receipt: WriteReceipt) => void; reject: (error: Error) => void; }
interface PendingOpen { generation: number; resolve: () => void; reject: (error: Error) => void; }
/** In-process test double. No socket, file, USB, discovery or default endpoint. */
export class MemoryTransport implements TransportPort {
  readonly simulationOnly: boolean = true;
  readonly writeSemantics: WriteSemantics;
  private readonly clock: MonotonicClock;
  private listeners: ((event: TransportEvent) => void)[] = [];
  private writes: MemoryWriteRecord[] = [];
  private closes: MemoryCloseRecord[] = [];
  private opens: number[] = [];
  private plans: MemoryWritePlan[] = [];
  private pendingWrites: PendingWrite[] = [];
  private pendingOpens: PendingOpen[] = [];
  private activeGenerations: number[] = [];
  deferOpen: boolean = false;
  rejectOpen: boolean = false;
  rejectClose: boolean = false;
  constructor(clock: MonotonicClock, semantics: WriteSemantics = 'stream') { this.clock = clock; this.writeSemantics = semantics; }
  planWrite(plan: MemoryWritePlan): void { this.plans.push({ kind: plan.kind, acceptedBytes: plan.acceptedBytes, receiptGeneration: plan.receiptGeneration }); }
  open(config: OutputTargetConfig, generation: number): Promise<void> {
    if (config.kind !== 'memory') { return Promise.reject(new OutputError('physicalTransportUnavailable', 'Only simulated memory output is available.')); }
    this.opens.push(generation);
    if (this.rejectOpen) { return Promise.reject(new Error('Simulated open failure.')); }
    if (this.deferOpen) {
      return new Promise<void>((resolve, reject) => this.pendingOpens.push({ generation: generation, resolve: resolve, reject: reject }));
    }
    this.activeGenerations.push(generation); return Promise.resolve();
  }
  resolveNextOpen(): void {
    const item: PendingOpen | undefined = this.pendingOpens.shift();
    if (item === undefined) { throw new Error('No pending open.'); }
    this.activeGenerations.push(item.generation); item.resolve();
  }
  rejectNextOpen(): void {
    const item: PendingOpen | undefined = this.pendingOpens.shift();
    if (item === undefined) { throw new Error('No pending open.'); }
    item.reject(new Error('Simulated delayed open failure.'));
  }
  write(request: WriteRequest): Promise<WriteReceipt> {
    if (this.activeGenerations.indexOf(request.connectionGeneration) < 0) { return Promise.reject(new Error('Simulated handle is closed.')); }
    const copy: MemoryWriteRecord = { bytes: request.bytes.slice(), epoch: request.epoch,
      connectionGeneration: request.connectionGeneration, profileRevision: request.profileRevision,
      deadlineMonotonicMs: request.deadlineMonotonicMs, startedMonotonicMs: this.clock.nowMs() };
    this.writes.push(copy);
    const plan: MemoryWritePlan | undefined = this.plans.shift();
    if (plan !== undefined && plan.kind === 'reject') { return Promise.reject(new Error('Simulated write failure; accepted byte count unknown.')); }
    if (plan !== undefined && plan.kind === 'defer') {
      return new Promise<WriteReceipt>((resolve, reject) => this.pendingWrites.push({ request: copy, resolve: resolve, reject: reject }));
    }
    return Promise.resolve<WriteReceipt>({ acceptedBytes: plan === undefined || plan.acceptedBytes === undefined ? copy.bytes.length : plan.acceptedBytes,
      connectionGeneration: plan === undefined || plan.receiptGeneration === undefined ? request.connectionGeneration : plan.receiptGeneration });
  }
  resolveNextWrite(acceptedBytes?: number, generation?: number): void {
    const item: PendingWrite | undefined = this.pendingWrites.shift();
    if (item === undefined) { throw new Error('No pending write.'); }
    item.resolve({ acceptedBytes: acceptedBytes === undefined ? item.request.bytes.length : acceptedBytes,
      connectionGeneration: generation === undefined ? item.request.connectionGeneration : generation });
  }
  rejectNextWrite(): void {
    const item: PendingWrite | undefined = this.pendingWrites.shift();
    if (item === undefined) { throw new Error('No pending write.'); }
    item.reject(new Error('Simulated delayed write failure.'));
  }
  close(reason: string, generation: number): Promise<void> {
    this.closes.push({ reason: reason, connectionGeneration: generation });
    this.activeGenerations = this.activeGenerations.filter(item => item !== generation);
    if (this.rejectClose) { return Promise.reject(new Error('Simulated close failure; device stop unconfirmed.')); }
    return Promise.resolve();
  }
  subscribe(listener: (event: TransportEvent) => void): () => void {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter(item => item !== listener); };
  }
  emit(event: TransportEvent): void {
    for (const listener of this.listeners.slice()) {
      listener({ kind: event.kind, connectionGeneration: event.connectionGeneration, detail: event.detail,
        bytes: event.bytes === undefined ? undefined : event.bytes.slice() });
    }
  }
  writeRecords(): MemoryWriteRecord[] { return this.writes.map((item): MemoryWriteRecord => ({ bytes: item.bytes.slice(), epoch: item.epoch,
    connectionGeneration: item.connectionGeneration, profileRevision: item.profileRevision,
    deadlineMonotonicMs: item.deadlineMonotonicMs, startedMonotonicMs: item.startedMonotonicMs })); }
  openRecords(): number[] { return this.opens.slice(); }
  closeRecords(): MemoryCloseRecord[] { return this.closes.map((item): MemoryCloseRecord => ({ reason: item.reason, connectionGeneration: item.connectionGeneration })); }
  get pendingWriteCount(): number { return this.pendingWrites.length; }
}
