import { OutputError } from './OutputTypes';
import type { FixedContext } from './OutputTypes';

export interface MonotonicClock { nowMs(): number; }
/** Owner-provided scheduler. No global timers, busy wait or wall clock in core. */
export interface EventScheduler {
  scheduleAt(monotonicMs: number, callback: () => void): number;
  cancel(handle: number): void;
}
export function defaultFixedContext(webSocket: boolean = false): FixedContext {
  return { kind: 'fixed', intervalMs: webSocket ? 16 : 10, minimumIntervalMs: webSocket ? 16 : 3,
    maximumIntervalMs: webSocket ? 200 : 33, sendDirtyValuesOnly: true, offloadElapsedTime: false, usePreciseSleep: false };
}
export function validateFixedContext(context: FixedContext): void {
  if (!Number.isFinite(context.minimumIntervalMs) || !Number.isFinite(context.maximumIntervalMs) ||
    !Number.isFinite(context.intervalMs) || context.minimumIntervalMs <= 0 ||
    context.maximumIntervalMs < context.minimumIntervalMs || context.intervalMs < context.minimumIntervalMs ||
    context.intervalMs > context.maximumIntervalMs || typeof context.sendDirtyValuesOnly !== 'boolean' ||
    typeof context.offloadElapsedTime !== 'boolean' || context.usePreciseSleep !== false) {
    throw new OutputError('invalidConfiguration', 'Invalid fixed interval; precise sleep is retained but not supported on this platform.');
  }
}
function copyFixedContext(context: FixedContext): FixedContext {
  return { kind: 'fixed', intervalMs: context.intervalMs, minimumIntervalMs: context.minimumIntervalMs,
    maximumIntervalMs: context.maximumIntervalMs, sendDirtyValuesOnly: context.sendDirtyValuesOnly,
    offloadElapsedTime: context.offloadElapsedTime, usePreciseSleep: context.usePreciseSleep };
}
function roundToEven(value: number): number {
  const floor: number = Math.floor(value);
  const remainder: number = value - floor;
  if (remainder < 0.5) { return floor; }
  if (remainder > 0.5) { return floor + 1; }
  return floor % 2 === 0 ? floor : floor + 1;
}
export interface FixedStatistics { readonly averageUpdateRate: number; readonly updateRateJitter: number; readonly measuredTicks: number; }
/** Source cadence statistics, explicitly NOT transport success or device rate. */
export class FixedStats {
  private timeSeconds: number = 0;
  private count: number = 0;
  private jitter: number = -2147483648;
  private average: number = 0;
  private publishedJitter: number = 0;
  private ticks: number = 0;
  update(elapsedMs: number, intervalMs: number): void {
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) { throw new OutputError('invalidClock', 'Invalid statistics elapsed.'); }
    this.timeSeconds += elapsedMs / 1000; this.count++; this.ticks++;
    // .NET 9 conversion saturates +Infinity at Int32.MaxValue for the initial I0 tick.
    const diff: number = elapsedMs === 0 ? 2147483647 : Math.min(2147483647, roundToEven(Math.abs(1000 / intervalMs - 1000 / elapsedMs)));
    this.jitter = Math.max(this.jitter, diff);
    if (this.timeSeconds > 0.25) {
      this.average = Math.min(2147483647, roundToEven(this.count / this.timeSeconds));
      this.publishedJitter = this.jitter;
      this.timeSeconds = 0; this.count = 0; this.jitter = -2147483648;
    }
  }
  snapshot(): FixedStatistics { return { averageUpdateRate: this.average, updateRateJitter: this.publishedJitter, measuredTicks: this.ticks }; }
}
interface AxisPolledStats { axisId: string; previousDurationSeconds: number; previousMonotonicMs: number; }
export class PolledStats {
  private axes: AxisPolledStats[] = [];
  private errorsSeconds: number[] = [];
  update(axisId: string, durationSeconds: number, monotonicMs: number): void {
    let axis: AxisPolledStats | undefined = this.axes.find(item => item.axisId === axisId);
    if (axis !== undefined && Number.isFinite(axis.previousDurationSeconds)) {
      this.errorsSeconds.push((monotonicMs - axis.previousMonotonicMs) / 1000 - axis.previousDurationSeconds);
      if (this.errorsSeconds.length > 25) { this.errorsSeconds.shift(); }
    }
    if (axis === undefined) {
      axis = { axisId: axisId, previousDurationSeconds: durationSeconds, previousMonotonicMs: monotonicMs }; this.axes.push(axis);
    } else { axis.previousDurationSeconds = durationSeconds; axis.previousMonotonicMs = monotonicMs; }
  }
  get averageUpdateErrorMs(): number {
    if (this.errorsSeconds.length === 0) { return 0; }
    return this.errorsSeconds.reduce((sum, value) => sum + value, 0) / this.errorsSeconds.length * 1000;
  }
  get retainedErrorCount(): number { return this.errorsSeconds.length; }
}

/** Independent monotonic output clock, immediate first tick (elapsed 0), no
 * burst catch-up. A late wake executes once and advances the next deadline past
 * now. The injected owner's control events must run before queued timer work.
 */
export class FixedScheduler {
  private readonly clock: MonotonicClock;
  private readonly events: EventScheduler;
  private readonly tick: (elapsedMs: number) => void;
  private readonly fault: (error: OutputError) => void;
  private context: FixedContext;
  private running: boolean = false;
  private handle: number | null = null;
  private lastTickMonotonicMs: number = 0;
  private deadline: number = 0;
  private token: number = 0;
  readonly stats: FixedStats = new FixedStats();
  constructor(clock: MonotonicClock, events: EventScheduler, context: FixedContext,
    tick: (elapsedMs: number) => void, fault: (error: OutputError) => void) {
    validateFixedContext(context); this.clock = clock; this.events = events;
    this.context = copyFixedContext(context); this.tick = tick; this.fault = fault;
  }
  start(): void {
    if (this.running) { return; }
    const now: number = this.clock.nowMs();
    if (!Number.isFinite(now) || now < 0) { this.fault(new OutputError('invalidClock', 'Invalid monotonic start.')); return; }
    this.running = true; this.lastTickMonotonicMs = now; this.deadline = now; this.token++;
    this.run(this.token);
  }
  stop(): void { this.running = false; this.token++; if (this.handle !== null) { this.events.cancel(this.handle); this.handle = null; } }
  updateContext(context: FixedContext): void {
    validateFixedContext(context); this.context = copyFixedContext(context);
    if (!this.running) { return; }
    if (this.handle !== null) { this.events.cancel(this.handle); }
    this.token++; this.deadline = this.clock.nowMs() + context.intervalMs;
    const token: number = this.token;
    this.handle = this.events.scheduleAt(this.deadline, () => this.run(token));
  }
  private run(token: number): void {
    if (!this.running || token !== this.token) { return; }
    this.handle = null;
    const now: number = this.clock.nowMs();
    const elapsedMs: number = now - this.lastTickMonotonicMs;
    if (!Number.isFinite(now) || elapsedMs < 0) { this.stop(); this.fault(new OutputError('invalidClock', 'Monotonic clock moved backwards.')); return; }
    this.lastTickMonotonicMs = now;
    this.stats.update(elapsedMs, this.context.intervalMs);
    this.tick(elapsedMs);
    if (!this.running || token !== this.token) { return; }
    this.deadline += this.context.intervalMs;
    if (this.deadline <= now) { this.deadline = now + this.context.intervalMs; }
    this.handle = this.events.scheduleAt(this.deadline, () => this.run(token));
  }
}
