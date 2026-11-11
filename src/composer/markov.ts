// Variable-order Markov chain with back-off, trained on token sequences.
//
// The chain learns n-gram counts (orders 1..N) from a corpus. When sampling, it
// blends the distributions of every order it has evidence for (higher orders
// weigh more), so rare contexts gracefully fall back to shorter ones. A `bias`
// callback lets music theory reshape the distribution at sampling time, and
// `temperature` controls how adventurous the choices are.

import type { Rng } from "./random";

export const START = "^";
export const END = "$";

export type Distribution = Map<string, number>;

export class MarkovChain {
  readonly order: number;
  private counts: Map<string, Map<string, number>>[] = [];
  readonly vocabulary = new Set<string>();

  constructor(order: number) {
    this.order = order;
    for (let i = 0; i <= order; i++) this.counts.push(new Map());
  }

  train(sequence: string[], weight = 1): this {
    const seq = [...Array(this.order).fill(START), ...sequence, END];
    for (let i = this.order; i < seq.length; i++) {
      const next = seq[i]!;
      if (next !== END) this.vocabulary.add(next);
      for (let k = 0; k <= this.order; k++) {
        const ctx = seq.slice(i - k, i).join(" ");
        const table = this.counts[k]!;
        let row = table.get(ctx);
        if (!row) table.set(ctx, (row = new Map()));
        row.set(next, (row.get(next) ?? 0) + weight);
      }
    }
    return this;
  }

  trainAll(sequences: string[][], weight = 1): this {
    for (const s of sequences) this.train(s, weight);
    return this;
  }

  /** Blended next-token distribution for a history (most recent token last). */
  distribution(history: string[], opts: { allowEnd?: boolean } = {}): Distribution {
    const padded = [...Array(this.order).fill(START), ...history];
    const result: Distribution = new Map();
    let totalWeight = 0;
    for (let k = this.order; k >= 0; k--) {
      const ctx = padded.slice(padded.length - k).join(" ");
      const row = this.counts[k]!.get(ctx);
      if (!row) continue;
      let sum = 0;
      for (const [tok, c] of row) if (opts.allowEnd || tok !== END) sum += c;
      if (sum === 0) continue;
      // Higher orders dominate; confidence grows with evidence.
      const w = Math.pow(4, k) * (sum / (sum + 2));
      totalWeight += w;
      for (const [tok, c] of row) {
        if (!opts.allowEnd && tok === END) continue;
        result.set(tok, (result.get(tok) ?? 0) + (w * c) / sum);
      }
    }
    if (totalWeight > 0) for (const [t, p] of result) result.set(t, p / totalWeight);
    return result;
  }

  /** Sample a token with optional theory bias and temperature. */
  sample(
    history: string[],
    rng: Rng,
    opts: { temperature?: number; bias?: (token: string, p: number) => number; candidates?: string[] } = {}
  ): string {
    const dist = shape(this.distribution(history), opts);
    if (dist.size === 0) {
      const vocab = opts.candidates ?? [...this.vocabulary];
      return rng.pick(vocab);
    }
    return rng.weighted([...dist.keys()], [...dist.values()]);
  }

  /** Top-k transitions for display. */
  top(history: string[], k = 5): { token: string; p: number }[] {
    return [...this.distribution(history)]
      .map(([token, p]) => ({ token, p }))
      .sort((a, b) => b.p - a.p)
      .slice(0, k);
  }

  /** First-order transition matrix for visualisation. */
  matrix(tokens: string[]): number[][] {
    return tokens.map((from) => {
      const row = this.counts[1]!.get(from);
      const sum = row ? [...row.entries()].filter(([t]) => tokens.includes(t)).reduce((a, [, c]) => a + c, 0) : 0;
      return tokens.map((to) => (row && sum ? (row.get(to) ?? 0) / sum : 0));
    });
  }
}

/** Apply bias, candidate filtering and temperature to a distribution, renormalised. */
export function shape(
  dist: Distribution,
  opts: { temperature?: number; bias?: (token: string, p: number) => number; candidates?: string[] }
): Distribution {
  const t = Math.max(0.05, opts.temperature ?? 1);
  const out: Distribution = new Map();
  const source: Distribution = new Map(dist);
  // Candidates the chain has never seen still get a small floor so theory can pick them.
  if (opts.candidates) {
    for (const c of opts.candidates) if (!source.has(c)) source.set(c, 0.004);
    for (const k of [...source.keys()]) if (!opts.candidates.includes(k)) source.delete(k);
  }
  let total = 0;
  for (const [tok, p] of source) {
    let v = p;
    if (opts.bias) v = opts.bias(tok, v);
    if (v <= 0) continue;
    v = Math.pow(v, 1 / t);
    out.set(tok, v);
    total += v;
  }
  if (total > 0) for (const [k, v] of out) out.set(k, v / total);
  return out;
}
