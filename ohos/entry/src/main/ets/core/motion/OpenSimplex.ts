/** Transcription of Common/Utils/MathUtils.cs::OpenSimplex, baseline
 * 36c08fbb99ac9398a63ff1cca1bbf68cd2228a94. This is upstream's 2048-entry
 * lattice/gradient variant, not a generic replacement simplex implementation.
 * SDK26 ArkTS checker and es2abc accept BigInt; use it only during construction.
 */
class Gradient {
  dx: number;
  dy: number;
  constructor(dx: number, dy: number) { this.dx = dx; this.dy = dy; }
}

class LatticePoint {
  xsv: number;
  ysv: number;
  dx: number;
  dy: number;
  constructor(xsv: number, ysv: number) {
    this.xsv = xsv; this.ysv = ysv;
    this.dx = -xsv + (xsv + ysv) * 0.211324865405187;
    this.dy = -ysv + (xsv + ysv) * 0.211324865405187;
  }
}

export class OpenSimplex {
  private static readonly SIZE: number = 2048;
  private static readonly MASK: number = 2047;
  private static readonly lattice: LatticePoint[] = OpenSimplex.createLattice();
  private static readonly gradients: Gradient[] = OpenSimplex.createGradients();
  private readonly permutation: number[] = [];
  private readonly gradients: Gradient[] = [];

  constructor(seed: bigint) {
    const source: number[] = [];
    for (let i: number = 0; i < OpenSimplex.SIZE; i++) { source.push(i); }
    seed = BigInt.asIntN(64, seed);
    for (let i: number = OpenSimplex.SIZE - 1; i >= 0; i--) {
      // Both expressions overflow independently in C# unchecked signed Int64.
      seed = BigInt.asIntN(64, seed * BigInt('6364136223846793005') + BigInt('1442695040888963407'));
      let r: number = Number(BigInt.asIntN(64, seed + BigInt(31)) % BigInt(i + 1));
      if (r < 0) { r += i + 1; }
      this.permutation[i] = source[r];
      this.gradients[i] = OpenSimplex.gradients[this.permutation[i]];
      source[r] = source[i];
    }
  }

  /** Per-instance seed only; update() never consumes random numbers. Not persisted. */
  static randomSeed(): bigint {
    const high: bigint = BigInt(Math.floor(Math.random() * 2147483648));
    const low: bigint = BigInt(Math.floor(Math.random() * 4294967296));
    return (high * BigInt('4294967296') + low) % BigInt('9223372036854775807');
  }

  calculate2D(x: number, y: number): number {
    const s: number = 0.366025403784439 * (x + y);
    return this.calculate2DImpl(x + s, y + s);
  }

  calculateOctaves2D(x: number, y: number, octaves: number, persistence: number, lacunarity: number): number {
    let frequency: number = 1;
    let amplitude: number = 1;
    let totalValue: number = 0;
    let totalAmplitude: number = 0;
    for (let i: number = 0; i < octaves; i++) {
      totalValue += this.calculate2D(x * frequency, y * frequency) * amplitude;
      totalAmplitude += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }
    return totalValue / totalAmplitude;
  }

  private calculate2DImpl(xs: number, ys: number): number {
    let value: number = 0;
    const xsb: number = OpenSimplex.toInt32(Math.floor(xs));
    const ysb: number = OpenSimplex.toInt32(Math.floor(ys));
    const xsi: number = xs - xsb;
    const ysi: number = ys - ysb;
    const a: number = OpenSimplex.toInt32(xsi + ysi);
    const index: number = (a << 2) |
      (OpenSimplex.toInt32(xsi - ysi / 2 + 1 - a / 2) << 3) |
      (OpenSimplex.toInt32(ysi - xsi / 2 + 1 - a / 2) << 4);
    if (index < 0 || index + 3 >= OpenSimplex.lattice.length) {
      throw new RangeError('OpenSimplex lattice index is out of range (upstream IndexOutOfRangeException).');
    }
    const ssi: number = (xsi + ysi) * -0.211324865405187;
    const xi: number = xsi + ssi;
    const yi: number = ysi + ssi;
    for (let i: number = 0; i < 4; i++) {
      const c: LatticePoint = OpenSimplex.lattice[index + i];
      const dx: number = xi + c.dx;
      const dy: number = yi + c.dy;
      let attn: number = 2 / 3 - dx * dx - dy * dy;
      if (attn <= 0) { continue; }
      const pxm: number = (xsb + c.xsv) & OpenSimplex.MASK;
      const pym: number = (ysb + c.ysv) & OpenSimplex.MASK;
      const gradient: Gradient = this.gradients[this.permutation[pxm] ^ pym];
      const extrapolation: number = gradient.dx * dx + gradient.dy * dy;
      attn *= attn;
      value += attn * attn * extrapolation;
    }
    return value;
  }

  /** Baseline targets .NET 9, whose double->Int32 conversion saturates and
   * converts NaN to zero. JS bitwise ToInt32 instead wraps modulo 2^32.
   * The difference matters for extreme coordinates: preserve upstream failure
   * rather than silently producing plausible noise after integer overflow.
   */
  private static toInt32(value: number): number {
    if (Number.isNaN(value)) { return 0; }
    if (value >= 2147483647) { return 2147483647; }
    if (value <= -2147483648) { return -2147483648; }
    return Math.trunc(value);
  }

  private static createLattice(): LatticePoint[] {
    const result: LatticePoint[] = [];
    for (let i: number = 0; i < 8; i++) {
      let i1: number;
      let j1: number;
      let i2: number;
      let j2: number;
      if ((i & 1) === 0) {
        j1 = 0; i2 = 0;
        i1 = (i & 2) === 0 ? -1 : 1;
        j2 = (i & 4) === 0 ? -1 : 1;
      } else {
        j1 = 1; i2 = 1;
        i1 = (i & 2) !== 0 ? 2 : 0;
        j2 = (i & 4) !== 0 ? 2 : 0;
      }
      result.push(new LatticePoint(0, 0), new LatticePoint(1, 1),
        new LatticePoint(i1, j1), new LatticePoint(i2, j2));
    }
    return result;
  }

  private static createGradients(): Gradient[] {
    const n: number = 0.05481866495625118;
    const base: Gradient[] = [
      new Gradient(0.130526192220052 / n, 0.991444861373810 / n),
      new Gradient(0.382683432365090 / n, 0.923879532511287 / n),
      new Gradient(0.608761429008721 / n, 0.793353340291235 / n),
      new Gradient(0.793353340291235 / n, 0.608761429008721 / n),
      new Gradient(0.923879532511287 / n, 0.382683432365090 / n),
      new Gradient(0.991444861373810 / n, 0.130526192220051 / n),
      new Gradient(0.991444861373810 / n, -0.130526192220051 / n),
      new Gradient(0.923879532511287 / n, -0.382683432365090 / n),
      new Gradient(0.793353340291235 / n, -0.608761429008720 / n),
      new Gradient(0.608761429008721 / n, -0.793353340291235 / n),
      new Gradient(0.382683432365090 / n, -0.923879532511287 / n),
      new Gradient(0.130526192220052 / n, -0.991444861373810 / n),
      new Gradient(-0.130526192220052 / n, -0.991444861373810 / n),
      new Gradient(-0.382683432365090 / n, -0.923879532511287 / n),
      new Gradient(-0.608761429008721 / n, -0.793353340291235 / n),
      new Gradient(-0.793353340291235 / n, -0.608761429008721 / n),
      new Gradient(-0.923879532511287 / n, -0.382683432365090 / n),
      new Gradient(-0.991444861373810 / n, -0.130526192220052 / n),
      new Gradient(-0.991444861373810 / n, 0.130526192220051 / n),
      new Gradient(-0.923879532511287 / n, 0.382683432365090 / n),
      new Gradient(-0.793353340291235 / n, 0.608761429008721 / n),
      new Gradient(-0.608761429008721 / n, 0.793353340291235 / n),
      new Gradient(-0.382683432365090 / n, 0.923879532511287 / n),
      new Gradient(-0.130526192220052 / n, 0.991444861373810 / n)
    ];
    const result: Gradient[] = [];
    for (let i: number = 0; i < OpenSimplex.SIZE; i++) { result.push(base[i % base.length]); }
    return result;
  }
}
