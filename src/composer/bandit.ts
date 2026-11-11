// Learning from listener feedback with linear Thompson sampling.
//
// Every bar of a piece is described by a feature vector φ (harmony, melody and
// rhythm traits). Feedback (+1 / −1) on a bar is a reward r ≈ θ·φ + noise. We keep
// a Bayesian linear regression over θ:
//
//   A = λI + Σ φφᵀ,   b = Σ r φ,   μ = A⁻¹ b,   Cov = v² A⁻¹
//
// When composing, the Markov chains propose several candidates for each musical
// decision. A θ is drawn from the posterior and the candidate with the highest
// θ·φ wins (Thompson sampling), so the composer exploits what you liked while
// still exploring traits it is unsure about.

import type { Rng } from "./random";
import { chordCorePcs, mod, type Chord, CHROMATIC_TOKENS } from "./theory";

export type FeatureGroup = "general" | "harmony" | "melody" | "rhythm";

export const FEATURES: { id: string; label: string; group: FeatureGroup }[] = [
  { id: "bias", label: "Overall liking", group: "general" },
  // Harmony
  { id: "tonic", label: "Tonic (home) chords", group: "harmony" },
  { id: "predominant", label: "Pre-dominant chords", group: "harmony" },
  { id: "dominant", label: "Dominant chords", group: "harmony" },
  { id: "colour", label: "Borrowed / colour chords", group: "harmony" },
  { id: "resolution", label: "Dominant → tonic resolution", group: "harmony" },
  { id: "build", label: "Pre-dominant → dominant", group: "harmony" },
  { id: "deceptive", label: "Surprise moves (deceptive)", group: "harmony" },
  { id: "minor", label: "Minor-quality chords", group: "harmony" },
  { id: "extended", label: "7th / 9th colour", group: "harmony" },
  { id: "changes", label: "Two chords in a bar", group: "harmony" },
  // Melody
  { id: "stepwise", label: "Stepwise melody", group: "melody" },
  { id: "leaps", label: "Big leaps", group: "melody" },
  { id: "repeats", label: "Repeated notes", group: "melody" },
  { id: "chordTones", label: "Notes inside the chord", group: "melody" },
  { id: "high", label: "High register", group: "melody" },
  { id: "span", label: "Wide range in a bar", group: "melody" },
  { id: "rising", label: "Rising contour", group: "melody" },
  // Rhythm
  { id: "density", label: "Busy melody", group: "rhythm" },
  { id: "syncopation", label: "Syncopation", group: "rhythm" },
  { id: "fast", label: "Fast runs (16ths)", group: "rhythm" },
  { id: "long", label: "Long held notes", group: "rhythm" },
  { id: "rests", label: "Space / rests", group: "rhythm" },
];

export const DIM = FEATURES.length;
export const HARMONY_DIMS = FEATURES.map((f, i) =>
  f.group === "harmony" ? i : -1,
).filter((i) => i >= 0);
export const MELODY_DIMS = FEATURES.map((f, i) =>
  f.group === "melody" || f.group === "rhythm" ? i : -1,
).filter((i) => i >= 0);
const IDX = Object.fromEntries(FEATURES.map((f, i) => [f.id, i])) as Record<
  string,
  number
>;

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

// ---------------- Features ----------------

export type FeatureNote = { time: number; dur: number; midi: number };
export type FeatureChord = { time: number; beats: number; chord: Chord };

/** Harmony features for the chords sounding in a bar, given the chord before it. */
export function harmonyFeatures(
  out: number[],
  chords: Chord[],
  prev: Chord | null,
) {
  if (!chords.length) return;
  const n = chords.length;
  for (const c of chords) {
    if (c.func === "tonic") out[IDX.tonic!]! += 1 / n;
    if (c.func === "predominant") out[IDX.predominant!]! += 1 / n;
    if (c.func === "dominant") out[IDX.dominant!]! += 1 / n;
    if (c.func === "color" || CHROMATIC_TOKENS[c.token])
      out[IDX.colour!]! += 1 / n;
    if (c.intervals.includes(3) && !c.intervals.includes(4))
      out[IDX.minor!]! += 1 / n;
    if (c.intervals.some((i) => i === 10 || i === 11 || i >= 13))
      out[IDX.extended!]! += 1 / n;
  }
  const seq = prev ? [prev, ...chords] : chords;
  for (let i = 1; i < seq.length; i++) {
    const a = seq[i - 1]!;
    const b = seq[i]!;
    if (a.token === b.token) continue;
    if (a.func === "dominant" && b.func === "tonic" && b.token === "1")
      out[IDX.resolution!] = 1;
    if (a.func === "predominant" && b.func === "dominant") out[IDX.build!] = 1;
    if (a.func === "dominant" && b.token !== "1") out[IDX.deceptive!] = 1;
  }
  if (n > 1) out[IDX.changes!] = 1;
}

/** Melody & rhythm features for the notes starting in [barStart, barStart + beats). */
export function melodyFeatures(
  out: number[],
  notes: FeatureNote[],
  prevNote: FeatureNote | null,
  chordAt: (t: number) => Chord,
  barStart: number,
  beats: number,
  range: [number, number],
) {
  const n = notes.length;
  out[IDX.density!] = clamp(n / 8, 0, 1);
  if (n === 0) {
    out[IDX.rests!] = 1;
    return;
  }
  const seq = prevNote ? [prevNote, ...notes] : notes;
  let steps = 0;
  let leaps = 0;
  let repeats = 0;
  for (let i = 1; i < seq.length; i++) {
    const d = Math.abs(seq[i]!.midi - seq[i - 1]!.midi);
    if (d === 0) repeats++;
    else if (d <= 2) steps++;
    else if (d >= 5) leaps++;
  }
  const iv = Math.max(1, seq.length - 1);
  out[IDX.stepwise!] = steps / iv;
  out[IDX.leaps!] = leaps / iv;
  out[IDX.repeats!] = repeats / iv;
  let ct = 0;
  let off = 0;
  let fast = 0;
  let longest = 0;
  let sounding = 0;
  let sum = 0;
  let lo = Infinity;
  let hi = -Infinity;
  for (const note of notes) {
    if (chordCorePcs(chordAt(note.time)).includes(mod(note.midi, 12))) ct++;
    const frac = mod(note.time - barStart, 1);
    if (frac > 0.08 && frac < 0.92) off++;
    if (note.dur <= 0.3) fast++;
    longest = Math.max(longest, note.dur);
    sounding += Math.min(note.dur, barStart + beats - note.time);
    sum += note.midi;
    lo = Math.min(lo, note.midi);
    hi = Math.max(hi, note.midi);
  }
  out[IDX.chordTones!] = ct / n;
  out[IDX.syncopation!] = off / n;
  out[IDX.fast!] = fast / n;
  out[IDX.long!] = clamp(longest / 4, 0, 1);
  out[IDX.rests!] = clamp(1 - sounding / beats, 0, 1);
  const center = (range[0] + range[1]) / 2;
  const half = (range[1] - range[0]) / 2;
  out[IDX.high!] = clamp((sum / n - center) / half, -1, 1);
  out[IDX.span!] = clamp((hi - lo) / 12, 0, 1);
  out[IDX.rising!] = clamp((notes[n - 1]!.midi - seq[0]!.midi) / 7, -1, 1);
}

/** Full feature vector of every bar in a piece. */
export function pieceBarFeatures(
  bars: number,
  beatsPerBar: number,
  chords: FeatureChord[],
  lead: FeatureNote[],
  range: [number, number],
): number[][] {
  const chordAt = (t: number) => {
    let c = chords[0]!.chord;
    for (const s of chords) if (s.time <= t + 1e-6) c = s.chord;
    return c;
  };
  const sorted = [...lead].sort((a, b) => a.time - b.time);
  const result: number[][] = [];
  for (let bar = 0; bar < bars; bar++) {
    const start = bar * beatsPerBar;
    const end = start + beatsPerBar;
    const v = new Array(DIM).fill(0);
    v[0] = 1;
    const inBar = chords
      .filter((c) => c.time < end && c.time + c.beats > start)
      .map((c) => c.chord);
    const before = chords.filter((c) => c.time < start);
    harmonyFeatures(
      v,
      inBar,
      before.length ? before[before.length - 1]!.chord : null,
    );
    const notes = sorted.filter(
      (n) => n.time >= start - 1e-6 && n.time < end - 1e-6,
    );
    const prev = sorted.filter((n) => n.time < start - 1e-6);
    melodyFeatures(
      v,
      notes,
      prev.length ? prev[prev.length - 1]! : null,
      chordAt,
      start,
      beatsPerBar,
      range,
    );
    result.push(v);
  }
  return result;
}

// ---------------- Linear algebra (small dense d×d) ----------------

function invert(m: Float64Array, d: number): Float64Array {
  const a = new Float64Array(m);
  const inv = new Float64Array(d * d);
  for (let i = 0; i < d; i++) inv[i * d + i] = 1;
  for (let c = 0; c < d; c++) {
    let p = c;
    for (let r = c + 1; r < d; r++)
      if (Math.abs(a[r * d + c]!) > Math.abs(a[p * d + c]!)) p = r;
    if (p !== c)
      for (let k = 0; k < d; k++) {
        [a[c * d + k], a[p * d + k]] = [a[p * d + k]!, a[c * d + k]!];
        [inv[c * d + k], inv[p * d + k]] = [inv[p * d + k]!, inv[c * d + k]!];
      }
    const piv = a[c * d + c]!;
    for (let k = 0; k < d; k++) {
      a[c * d + k]! /= piv;
      inv[c * d + k]! /= piv;
    }
    for (let r = 0; r < d; r++) {
      if (r === c) continue;
      const f = a[r * d + c]!;
      if (f === 0) continue;
      for (let k = 0; k < d; k++) {
        a[r * d + k]! -= f * a[c * d + k]!;
        inv[r * d + k]! -= f * inv[c * d + k]!;
      }
    }
  }
  return inv;
}

function cholesky(m: Float64Array, d: number): Float64Array {
  const L = new Float64Array(d * d);
  for (let i = 0; i < d; i++) {
    for (let j = 0; j <= i; j++) {
      let s = m[i * d + j]!;
      for (let k = 0; k < j; k++) s -= L[i * d + k]! * L[j * d + k]!;
      L[i * d + j] =
        i === j ? Math.sqrt(Math.max(s, 1e-12)) : s / L[j * d + j]!;
    }
  }
  return L;
}

function gaussian(rng: Rng): number {
  const u = Math.max(1e-12, rng.next());
  const v = rng.next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const dot = (
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  dims?: number[],
) => {
  let s = 0;
  if (dims) for (const i of dims) s += a[i]! * b[i]!;
  else for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
};

// ---------------- Model ----------------

export type FeedbackEvent = {
  at: number;
  take: number;
  bar: number;
  reward: number;
  predicted: number;
  /** Identifies the piece + take the rating belongs to. */
  key?: string;
};

export type ModelJSON = {
  A: number[];
  b: number[];
  n: number;
  history: FeedbackEvent[];
  trace: number[][];
};

export class LinearTS {
  readonly d = DIM;
  A: Float64Array;
  b: Float64Array;
  n = 0;
  history: FeedbackEvent[] = [];
  trace: number[][] = []; // posterior mean after each update, for the evolution chart
  private cache: {
    mean: number[];
    cov: Float64Array;
    chol: Float64Array;
  } | null = null;

  constructor(readonly lambda = 1) {
    this.A = new Float64Array(this.d * this.d);
    for (let i = 0; i < this.d; i++) this.A[i * this.d + i] = lambda;
    this.b = new Float64Array(this.d);
  }

  private solve() {
    if (!this.cache) {
      const cov = invert(this.A, this.d);
      const mean = new Array(this.d).fill(0);
      for (let i = 0; i < this.d; i++)
        for (let j = 0; j < this.d; j++)
          mean[i] += cov[i * this.d + j]! * this.b[j]!;
      this.cache = { mean, cov, chol: cholesky(cov, this.d) };
    }
    return this.cache;
  }

  mean(): number[] {
    return this.solve().mean;
  }

  /** Posterior standard deviation per weight (for exploration scale v). */
  std(v: number): number[] {
    const { cov } = this.solve();
    return Array.from(
      { length: this.d },
      (_, i) => v * Math.sqrt(cov[i * this.d + i]!),
    );
  }

  predict(phi: number[]): number {
    return dot(this.mean(), phi);
  }

  /** Draw θ ~ N(μ, v² A⁻¹). */
  sample(rng: Rng, v: number): number[] {
    const { mean, chol } = this.solve();
    const z = Array.from({ length: this.d }, () => gaussian(rng));
    return mean.map((m, i) => {
      let s = 0;
      for (let k = 0; k <= i; k++) s += chol[i * this.d + k]! * z[k]!;
      return m + v * s;
    });
  }

  update(
    phi: number[],
    reward: number,
    meta: Omit<FeedbackEvent, "reward" | "predicted">,
  ) {
    const predicted = this.predict(phi);
    for (let i = 0; i < this.d; i++) {
      this.b[i]! += reward * phi[i]!;
      for (let j = 0; j < this.d; j++)
        this.A[i * this.d + j]! += phi[i]! * phi[j]!;
    }
    this.n++;
    this.cache = null;
    this.history.push({ ...meta, reward, predicted });
    this.trace.push(this.mean().map((x) => Math.round(x * 1000) / 1000));
    if (this.history.length > 500) this.history.shift();
    if (this.trace.length > 500) this.trace.shift();
  }

  toJSON(): ModelJSON {
    return {
      A: [...this.A],
      b: [...this.b],
      n: this.n,
      history: this.history,
      trace: this.trace,
    };
  }

  static fromJSON(j: ModelJSON): LinearTS {
    const m = new LinearTS();
    if (j.A?.length === m.d * m.d && j.b?.length === m.d) {
      m.A = Float64Array.from(j.A);
      m.b = Float64Array.from(j.b);
      m.n = j.n ?? 0;
      m.history = j.history ?? [];
      m.trace = j.trace ?? [];
    }
    return m;
  }
}

/** What the composer needs from the model: a θ draw per decision. */
/**
 * A snapshot of the learned taste that the composer can draw weight vectors
 * from. `ratings` is how many ratings the model had when the snapshot was
 * taken: the composer ignores a taste with no ratings, so switching learning on
 * changes nothing until you have rated something.
 */
export type Taste = { draw: (rng: Rng) => number[]; ratings: number };

export function tasteFrom(model: LinearTS, exploration: number): Taste {
  return {
    draw: (rng) => model.sample(rng, exploration),
    ratings: model.n,
  };
}
