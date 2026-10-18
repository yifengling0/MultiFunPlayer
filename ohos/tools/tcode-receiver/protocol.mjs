/** TCode frame parsing shared by the receiver and its tests.
 *
 * MultiFunPlayer encodes one or more commands separated by spaces, terminated
 * by '\n'. An axis command is `<A-Z><axis digit><value digits>` and an optional
 * `I<milliseconds>` follows each axis command. Precision is inferred from the
 * value digit count, so both `L00500I16` (precision 4) and `L050I16`
 * (precision 3) are accepted; no value is clamped or rewritten.
 */
export class TCodeAxisValue {
  constructor(name, raw, digits, value) {
    this.name = name;
    this.raw = raw;
    this.digits = digits;
    this.value = value;
    this.normalized = value / (Math.pow(10, digits) - 1);
  }
}

export class TCodeFrame {
  constructor(raw, axes, intervals, unknown) {
    this.raw = raw;
    this.axes = axes;
    this.intervals = intervals;
    this.unknown = unknown;
    this.intervalMs = intervals.length > 0 ? intervals[intervals.length - 1] : null;
  }
  get axisNames() { return this.axes.map(axis => axis.name); }
}

const AXIS = /^([A-Z])([0-9])([0-9]+)$/;
const INTERVAL = /^I([0-9]+)$/;

export function parseTCodeLine(line) {
  const raw = line.replace(/\r$/, '');
  const axes = [];
  const intervals = [];
  const unknown = [];
  const tokens = raw.trim().length === 0 ? [] : raw.trim().split(/\s+/);
  for (const token of tokens) {
    const interval = INTERVAL.exec(token);
    if (interval !== null) {
      intervals.push(Number(interval[1]));
      continue;
    }
    // encodeFixed/encodeEvent append the interval directly to the last axis
    // command: L09999I16. Split that suffix before parsing the axis token.
    let axisToken = token;
    const attached = /^(.+?)I([0-9]+)$/.exec(token);
    if (attached !== null && AXIS.test(attached[1])) {
      axisToken = attached[1];
      intervals.push(Number(attached[2]));
    }
    const axis = AXIS.exec(axisToken);
    if (axis === null) {
      unknown.push(token);
      continue;
    }
    const digits = axis[3];
    axes.push(new TCodeAxisValue(axis[1] + axis[2], axisToken, digits.length, Number(digits)));
  }
  return new TCodeFrame(raw, axes, intervals, unknown);
}

export function parseTCodePayload(payload) {
  return String(payload).split('\n').filter(line => line.trim().length > 0).map(parseTCodeLine);
}

/** Bounded, process-local statistics. No frame text is retained beyond the
 * explicit recent-frame ring; counts stay finite even on hostile input. */
export class ReceiverStats {
  constructor(maximumRecent = 200) {
    this.maximumRecent = maximumRecent;
    this.startedAt = Date.now();
    this.packets = 0;
    this.bytes = 0;
    this.frames = 0;
    this.invalidFrames = 0;
    this.connections = 0;
    this.peakConnections = 0;
    this.activeConnections = 0;
    this.axes = new Map();
    this.recent = [];
    this.lastFrameAt = 0;
    this.lastPayload = '';
    this.transports = { tcp: 0, udp: 0 };
    this.bucketStart = Date.now();
    this.bucketFrames = 0;
    this.rateHz = 0;
  }
  connectionOpened() {
    this.connections++;
    this.activeConnections++;
    this.peakConnections = Math.max(this.peakConnections, this.activeConnections);
  }
  connectionClosed() {
    this.activeConnections = Math.max(0, this.activeConnections - 1);
  }
  record(transport, bytes, payload) {
    this.packets++;
    this.bytes += bytes;
    this.transports[transport] = (this.transports[transport] || 0) + 1;
    this.lastPayload = String(payload).slice(0, 4096);
    const frames = parseTCodePayload(payload);
    for (const frame of frames) {
      if (frame.axes.length === 0 || frame.unknown.length > 0) {
        this.invalidFrames++;
      } else {
        this.frames++;
        this.bucketFrames++;
        this.lastFrameAt = Date.now();
        for (const axis of frame.axes) {
          const current = this.axes.get(axis.name) || { count: 0, last: null, minimum: null, maximum: null };
          current.count++;
          current.last = axis.normalized;
          current.minimum = current.minimum === null ? axis.normalized : Math.min(current.minimum, axis.normalized);
          current.maximum = current.maximum === null ? axis.normalized : Math.max(current.maximum, axis.normalized);
          this.axes.set(axis.name, current);
        }
        this.recent.push({
          at: new Date().toISOString(),
          transport,
          raw: frame.raw.slice(0, 4096),
          axes: frame.axes.map(axis => ({ name: axis.name, value: axis.value, normalized: axis.normalized })),
          intervalMs: frame.intervalMs,
          unknown: frame.unknown
        });
        if (this.recent.length > this.maximumRecent) this.recent.splice(0, this.recent.length - this.maximumRecent);
      }
    }
    this.refreshRate();
  }
  refreshRate() {
    const now = Date.now();
    const elapsed = now - this.bucketStart;
    const idle = this.lastFrameAt === 0 || now - this.lastFrameAt >= 1000;
    if (idle) this.rateHz = 0;
    if (elapsed >= 1000) {
      this.rateHz = idle ? 0 :
        Math.round((this.bucketFrames * 1000 / elapsed) * 10) / 10;
      this.bucketStart = now;
      this.bucketFrames = 0;
    }
  }
  reset() {
    this.startedAt = Date.now(); this.packets = 0; this.bytes = 0; this.frames = 0;
    this.invalidFrames = 0; this.connections = this.activeConnections; this.peakConnections = this.activeConnections;
    this.axes.clear(); this.recent.length = 0;
    this.lastFrameAt = 0; this.lastPayload = ''; this.transports = { tcp: 0, udp: 0 };
    this.bucketStart = Date.now(); this.bucketFrames = 0; this.rateHz = 0;
  }
  snapshot() {
    // Refresh even when no new packets arrive (pause, Stop, or disconnect).
    this.refreshRate();
    return {
      startedAt: new Date(this.startedAt).toISOString(),
      uptimeSeconds: Math.round((Date.now() - this.startedAt) / 100) / 10,
      packets: this.packets,
      bytes: this.bytes,
      frames: this.frames,
      invalidFrames: this.invalidFrames,
      connections: this.connections,
      activeConnections: this.activeConnections,
      peakConnections: this.peakConnections,
      transports: { ...this.transports },
      rateHz: this.rateHz,
      lastFrameAt: this.lastFrameAt === 0 ? null : new Date(this.lastFrameAt).toISOString(),
      lastPayload: this.lastPayload,
      axes: [...this.axes.entries()].map(([name, value]) => ({ name, ...value })).sort((a, b) => a.name.localeCompare(b.name)),
      recent: this.recent.slice(-50)
    };
  }
}
