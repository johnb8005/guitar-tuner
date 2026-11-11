// The composer: turns settings + a seed into a full multi-track piece.
//
// Pipeline
//   1. Form       – sections (A, A′, B, …) with an energy curve.
//   2. Harmony    – order-2 Markov chain over harmony tokens trained on the style's
//                   progression corpus, constrained to start on the tonic and to land
//                   on half / authentic cadences at section ends.
//   3. Melody     – rhythm chain (beat-cells) + interval chain (trained on folk
//                   melodies) reshaped by theory: chord tones on strong beats, range
//                   gravity, gap-fill after leaps, tendency tones, cadence targets,
//                   and motif repetition / sequence between bars and sections.
//   4. Parts      – voice-led keys & pad, bass lines, arpeggios and drums per style.

import { MarkovChain } from "./markov";
import {
  DIM,
  dot,
  harmonyFeatures,
  MELODY_DIMS,
  melodyFeatures,
  pieceBarFeatures,
  type Taste,
} from "./bandit";
import { createRng, deriveSeed, type Rng } from "./random";
import {
  buildChord,
  chordCorePcs,
  chordPcs,
  degreeToMidi,
  getScale,
  midiToStep,
  mod,
  nearestPc,
  pcToDegree,
  voiceLead,
  type Chord,
  type Extension,
  type Key,
  type ScaleId,
} from "./theory";
import {
  getStyle,
  MELODY_CORPUS,
  RHYTHM_CELLS,
  SECTION_FORMS,
  type StyleDef,
  type StyleId,
  type TrackId,
} from "./styles";

export type DrumId =
  | "kick"
  | "snare"
  | "rim"
  | "clap"
  | "hatClosed"
  | "hatOpen"
  | "ride"
  | "crash"
  | "tomLow"
  | "tomMid"
  | "tomHigh"
  | "shaker";

export type NoteEvent = {
  track: Exclude<TrackId, "drums">;
  time: number;
  dur: number;
  midi: number;
  vel: number;
};
export type DrumEvent = {
  track: "drums";
  time: number;
  drum: DrumId;
  vel: number;
};

export type ChordSlot = {
  index: number;
  time: number;
  beats: number;
  chord: Chord;
  section: number;
  cadence?: "half" | "authentic";
};
export type Section = {
  label: string;
  kind: "A" | "A'" | "B" | "B'";
  startBar: number;
  bars: number;
  energy: number;
};

export type Settings = {
  style: StyleId;
  tonic: number;
  scale: ScaleId;
  bars: 8 | 16 | 32;
  tempo: number;
  creativity: number; // 0..1 → Markov temperature
  extension: Extension;
  swing: number;
  seed: number;
  partSeeds: Partial<
    Record<"harmony" | "melody" | "bass" | "comp" | "drums", number>
  >;
  overrides: Record<number, string>; // chord slot index → harmony token
};

export type Piece = {
  settings: Settings;
  key: Key;
  style: StyleDef;
  sections: Section[];
  chords: ChordSlot[];
  notes: NoteEvent[];
  drums: DrumEvent[];
  beats: number;
  beatsPerBar: number;
  take: number;
  /** Feature vector of every bar (for learning from feedback). */
  barFeatures: number[][];
};

export const BEATS_PER_BAR = 4;

export type ComposeOptions = {
  /** Learned taste: when present, candidates are chosen by Thompson sampling. */
  taste?: Taste;
  /** Take number: each take re-rolls the parts, so a loop can evolve. */
  take?: number;
};

/** Seed of a part, varied per take. */
function partSeed(
  settings: Settings,
  part: keyof Settings["partSeeds"],
  take: number,
) {
  const base = settings.partSeeds[part] ?? deriveSeed(settings.seed, part);
  return take ? deriveSeed(base, `take${take}`) : base;
}

/** Candidates per decision when a taste model is steering. */
const TASTE_CANDIDATES = 6;
/** How strongly the learned taste weighs against Markov likelihood (per chord). */
const TASTE_WEIGHT = 3;

export function defaultSettings(style: StyleId = "pop", seed = 1): Settings {
  const s = getStyle(style);
  return {
    style,
    tonic: 0,
    scale: s.scale,
    bars: 16,
    tempo: s.tempo,
    creativity: 0.5,
    extension: s.extension,
    swing: s.swing,
    seed,
    partSeeds: {},
    overrides: {},
  };
}

// ---------------- Chains (trained once per style) ----------------

const harmonyChains = new Map<StyleId, MarkovChain>();
export function harmonyChain(style: StyleId): MarkovChain {
  let chain = harmonyChains.get(style);
  if (!chain) {
    chain = new MarkovChain(2);
    for (const p of getStyle(style).progressions) {
      const toks = p.split(" ");
      // Train on the loop twice so the chain also learns the wrap-around.
      chain.train([...toks, ...toks]);
    }
    harmonyChains.set(style, chain);
  }
  return chain;
}

const rhythmChains = new Map<StyleId, MarkovChain>();
function rhythmChain(style: StyleId): MarkovChain {
  let chain = rhythmChains.get(style);
  if (!chain) {
    chain = new MarkovChain(2);
    for (const bar of getStyle(style).rhythms) chain.train(bar.split(" "));
    rhythmChains.set(style, chain);
  }
  return chain;
}

let melodyChainCache: MarkovChain | null = null;
export function melodyChain(): MarkovChain {
  if (!melodyChainCache) {
    const chain = new MarkovChain(2);
    for (const tune of MELODY_CORPUS) {
      const intervals: string[] = [];
      for (let i = 1; i < tune.length; i++)
        intervals.push(String(tune[i]! - tune[i - 1]!));
      chain.train(intervals);
    }
    melodyChainCache = chain;
  }
  return melodyChainCache;
}

const temperatureFor = (creativity: number) => 0.55 + creativity * 1.25;

// ---------------- Harmony ----------------

type Slot = {
  time: number;
  beats: number;
  token: string;
  cadence?: "half" | "authentic";
};

const isMinorish = (scale: ScaleId) => getScale(scale).steps[2] === 3;

function cadenceTargets(kind: "half" | "authentic"): string[] {
  return kind === "authentic" ? ["1"] : ["5", "V7"];
}

/**
 * Draw several constrained candidates and keep a likely one: the chain's own
 * log-likelihood rewards idiomatic movement and repeated chords are penalised.
 * Higher temperature flattens the choice between candidates too.
 */
function sampleChordSequence(
  chain: MarkovChain,
  rng: Rng,
  n: number,
  opts: {
    start: "tonic" | "away" | "free";
    end: "half" | "authentic";
    temperature: number;
    prefix?: string[];
    judge?: (seq: string[]) => number;
  },
): string[] {
  const candidates: { seq: string[]; score: number }[] = [];
  for (let k = 0; k < 16; k++) {
    const seq = sampleChordCandidate(chain, rng, n, opts);
    const full = [...(opts.prefix ?? []), ...seq];
    let score = 0;
    const offset = full.length - seq.length;
    for (let i = offset; i < full.length; i++) {
      const p =
        chain.distribution(full.slice(Math.max(0, i - 2), i)).get(full[i]!) ??
        0;
      score += Math.log(p + 0.01);
      if (i > 0 && full[i] === full[i - 1]) score -= 2.5;
    }
    if (opts.start === "away" && seq[0] === "1") score -= 3;
    if (opts.judge) score += TASTE_WEIGHT * seq.length * opts.judge(seq);
    candidates.push({ seq, score });
  }
  const best = Math.max(...candidates.map((c) => c.score));
  return rng.weighted(
    candidates.map((c) => c.seq),
    candidates.map((c) => Math.exp((c.score - best) / opts.temperature)),
  );
}

function sampleChordCandidate(
  chain: MarkovChain,
  rng: Rng,
  n: number,
  opts: {
    start: "tonic" | "away" | "free";
    end: "half" | "authentic";
    temperature: number;
    prefix?: string[];
  },
): string[] {
  const vocab = [...chain.vocabulary];
  const targets = cadenceTargets(opts.end).filter(
    (t) => vocab.includes(t) || t === "1" || t === "5",
  );
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const history = [...(opts.prefix ?? []), ...out].slice(-2);
    const last = out[out.length - 1];
    const isLast = i === n - 1;
    const isPenult = i === n - 2;
    const token = chain.sample(history, rng, {
      temperature: opts.temperature,
      candidates: isLast ? targets : vocab,
      bias: (tok, p) => {
        let w = p;
        if (i === 0 && !opts.prefix?.length) {
          if (opts.start === "tonic") w *= tok === "1" ? 30 : 0.3;
          if (opts.start === "away")
            w *= tok === "1" ? 0.05 : ["4", "6", "2"].includes(tok) ? 2.5 : 1;
        }
        if (tok === last) w *= 0.12;
        if (isPenult) {
          // Look ahead: how likely does this chord lead to the cadence target?
          const next = chain.distribution([...history.slice(-1), tok]);
          const reach = targets.reduce((a, t) => a + (next.get(t) ?? 0), 0);
          w *= 0.05 + reach * 3;
          if (targets.includes(tok)) w *= 0.2;
          if (opts.end === "authentic" && ["5", "V7", "7"].includes(tok))
            w *= 2.5;
        }
        return w;
      },
    });
    out.push(token);
  }
  return out;
}

function phraseSlotLayout(
  rng: Rng,
  bars: number,
  splitChance: number,
): { time: number; beats: number }[] {
  const slots: { time: number; beats: number }[] = [];
  for (let b = 0; b < bars; b++) {
    const t = b * BEATS_PER_BAR;
    // Cadence bars split more often (e.g. ii–V or V–I in one bar)
    const p =
      b === bars - 1
        ? splitChance * 0.8
        : b === bars - 2
          ? splitChance * 1.4
          : splitChance;
    if (b > 0 && rng.chance(p)) {
      slots.push({ time: t, beats: 2 }, { time: t + 2, beats: 2 });
    } else slots.push({ time: t, beats: BEATS_PER_BAR });
  }
  return slots;
}

function generateHarmony(
  settings: Settings,
  style: StyleDef,
  sections: Section[],
  take: number,
  taste?: Taste,
): Slot[][] {
  const rng = createRng(partSeed(settings, "harmony", take));
  const tasteRng = createRng(
    deriveSeed(partSeed(settings, "harmony", take), "taste"),
  );
  const key: Key = { tonic: settings.tonic, scale: settings.scale };
  // Thompson sampling: one θ draw per section decision, scored on harmony traits.
  const judgeFor = (prefix: string[]) => {
    if (!taste) return undefined;
    const theta = taste.draw(tasteRng);
    return (seq: string[]) => {
      const chords = [...prefix.slice(-1), ...seq].map((t) =>
        buildChord(key, t, settings.extension),
      );
      let total = 0;
      for (let i = prefix.length ? 1 : 0; i < chords.length; i++) {
        const v = new Array(DIM).fill(0);
        harmonyFeatures(v, [chords[i]!], i > 0 ? chords[i - 1]! : null);
        total += dot(theta, v);
      }
      return total / seq.length;
    };
  };
  const chain = harmonyChain(style.id);
  const temperature = temperatureFor(settings.creativity);
  const memory = new Map<string, Slot[]>();
  const result: Slot[][] = [];

  for (const section of sections) {
    const isLastSection = section === sections[sections.length - 1];
    const end: "half" | "authentic" =
      section.kind === "A'" || isLastSection ? "authentic" : "half";
    const baseKind =
      section.kind === "A'" ? "A" : section.kind === "B'" ? "B" : section.kind;
    const remembered = memory.get(baseKind);
    let slots: Slot[];
    if (remembered) {
      // Repeat the material, re-writing only the cadence when needed.
      slots = remembered.map((s) => ({ ...s }));
      const cadenceOf = slots[slots.length - 1]!.cadence;
      if (cadenceOf !== end) {
        const keep = slots.slice(0, -2).map((s) => s.token);
        const tail = sampleChordSequence(chain, rng, 2, {
          start: "free",
          end,
          temperature,
          prefix: keep,
          judge: judgeFor(keep),
        });
        slots[slots.length - 2]!.token = tail[0]!;
        slots[slots.length - 1]!.token = tail[1]!;
      }
    } else {
      const layout = phraseSlotLayout(rng, section.bars, style.splitBarChance);
      const tokens = sampleChordSequence(chain, rng, layout.length, {
        start: baseKind === "A" ? "tonic" : "away",
        end,
        temperature,
        judge: judgeFor([]),
      });
      slots = layout.map((l, i) => ({ ...l, token: tokens[i]! }));
    }
    slots[slots.length - 1]!.cadence = end;
    // Minor keys: a raised leading tone (major V) gives cadences real pull.
    if (style.raiseLeadingTone && isMinorish(settings.scale)) {
      const cadIdx = end === "half" ? slots.length - 1 : slots.length - 2;
      if (slots[cadIdx]?.token === "5") slots[cadIdx]!.token = "V7";
    }
    if (!memory.has(baseKind))
      memory.set(
        baseKind,
        slots.map((s) => ({ ...s })),
      );
    // A chord repeated inside the same bar is just one longer chord
    for (let i = slots.length - 1; i > 0; i--) {
      const a = slots[i - 1]!;
      const b = slots[i]!;
      if (
        a.token === b.token &&
        Math.floor(a.time / BEATS_PER_BAR) ===
          Math.floor(b.time / BEATS_PER_BAR)
      ) {
        a.beats += b.beats;
        a.cadence = b.cadence ?? a.cadence;
        slots.splice(i, 1);
      }
    }
    result.push(slots);
  }
  return result;
}

// ---------------- Melody ----------------

type Onset = { time: number; dur: number; strong: boolean };

function sampleRhythmBar(
  chain: MarkovChain,
  rng: Rng,
  energy: number,
  temperature: number,
): string[] {
  const cells: string[] = [];
  for (let i = 0; i < 4; i++) {
    const tok = chain.sample(cells.slice(-2), rng, {
      temperature,
      bias: (t, p) => {
        const notes = RHYTHM_CELLS[t]?.length ?? 0;
        let w = p * (1 + (energy - 0.5) * notes * 0.35);
        if (i === 0 && (t === "-" || t === "r")) w *= 0.15; // start bars with a note
        return Math.max(w, 0.0001);
      },
    });
    cells.push(tok);
  }
  return cells;
}

function cellsToOnsets(bars: string[][], chordTimes: Set<number>): Onset[] {
  const onsets: Onset[] = [];
  bars.forEach((cells, b) => {
    cells.forEach((cell, beat) => {
      const t0 = b * BEATS_PER_BAR + beat;
      if (cell === "-") {
        const prev = onsets[onsets.length - 1];
        if (prev && prev.time + prev.dur >= t0 - 0.51)
          prev.dur = t0 + 1 - prev.time;
        return;
      }
      for (const [on, dur] of RHYTHM_CELLS[cell] ?? []) {
        const time = t0 + on;
        const strong =
          (on === 0 && (beat === 0 || beat === 2)) || chordTimes.has(time);
        onsets.push({ time, dur, strong });
      }
    });
  });
  return onsets;
}

function chordAt(slots: ChordSlot[], time: number): Chord {
  let c = slots[0]!.chord;
  for (const s of slots) if (s.time <= time + 1e-6) c = s.chord;
  return c;
}

type MelodyCtx = {
  key: Key;
  rng: Rng;
  chain: MarkovChain;
  temperature: number;
  low: number;
  high: number;
  center: number;
};

const toMidi = (key: Key, step: number) => degreeToMidi(key, step, 60);
const fromMidi = (key: Key, midi: number) => midiToStep(key, midi - 60);

function isChordTone(chord: Chord, midi: number, core = true) {
  return (core ? chordCorePcs(chord) : chordPcs(chord)).includes(mod(midi, 12));
}

function scoreStep(
  ctx: MelodyCtx,
  chord: Chord,
  strong: boolean,
  prevStep: number,
  prevInterval: number | null,
  repeatCount: number,
  candStep: number,
): number {
  const { key, low, high, center } = ctx;
  const midi = toMidi(key, candStep);
  const iv = candStep - prevStep;
  let w = 1;
  if (midi < low || midi > high) w *= 1e-5;
  const spread = (high - low) / 2;
  w *= Math.exp(-Math.pow((midi - center) / spread, 2) * 0.8);
  const chordTone = isChordTone(chord, midi);
  const color = !chordTone && isChordTone(chord, midi, false);
  if (strong) w *= chordTone ? 4 : color ? 1.2 : 0.18;
  else w *= chordTone ? 1.4 : 1;
  // Gap-fill: after a leap, step back the other way.
  if (prevInterval !== null && Math.abs(prevInterval) >= 3) {
    if (
      Math.sign(iv) === -Math.sign(prevInterval) &&
      Math.abs(iv) <= 2 &&
      iv !== 0
    )
      w *= 2.5;
    else if (Math.sign(iv) === Math.sign(prevInterval) && Math.abs(iv) >= 2)
      w *= 0.25;
  }
  // Tendency tones
  const prevDeg = mod(prevStep, 7);
  const steps = getScale(key.scale).steps;
  if (prevDeg === 6 && steps[6] === 11 && iv === 1) w *= 2.5;
  if (prevDeg === 3 && iv === -1) w *= 1.5;
  // Avoid tritone leaps and too many repeated notes
  const semis = Math.abs(midi - toMidi(key, prevStep));
  if (semis === 6) w *= 0.15;
  if (iv === 0 && repeatCount >= 2) w *= 0.15;
  if (Math.abs(iv) > 5) w *= 0.2;
  return w;
}

function generatePhraseMelody(
  ctx: MelodyCtx,
  slots: ChordSlot[],
  rhythm: string[][],
  phraseStart: number,
  startStep: number,
  ending: "half" | "authentic",
  motif: { useSequence: boolean },
): { time: number; dur: number; step: number; strong: boolean }[] {
  const { key, rng, chain, temperature } = ctx;
  const chordTimes = new Set(slots.map((s) => s.time - phraseStart));
  const onsets = cellsToOnsets(rhythm, chordTimes);
  const notes: { time: number; dur: number; step: number; strong: boolean }[] =
    [];
  const bar0 = onsets.filter((o) => o.time < BEATS_PER_BAR);
  const intervals: number[] = [];
  let step = startStep;
  let repeat = 0;

  onsets.forEach((o, i) => {
    const chord = chordAt(slots, phraseStart + o.time);
    const isLast = i === onsets.length - 1;
    const bar = Math.floor(o.time / BEATS_PER_BAR);
    let next: number;

    if (i === 0) {
      // Start on a chord tone near the requested step.
      const cands = [-3, -2, -1, 0, 1, 2, 3].map((d) => startStep + d);
      next = rng.weighted(
        cands,
        cands.map(
          (s) =>
            (isChordTone(chord, toMidi(key, s)) ? 3 : 0.2) *
            Math.exp(-Math.abs(s - startStep) * 0.5),
        ),
      );
    } else if (isLast) {
      // Cadence: tonic for authentic endings, a dominant chord tone for half cadences.
      const cands: number[] = [];
      for (let d = -5; d <= 5; d++) cands.push(step + d);
      next = rng.weighted(
        cands,
        cands.map((s) => {
          const deg = mod(s, 7);
          const midi = toMidi(key, s);
          let w = Math.exp(-Math.abs(s - step) * 0.7);
          if (midi < ctx.low || midi > ctx.high) w *= 0.02;
          if (ending === "authentic") w *= deg === 0 ? 1000 : 0.01;
          else
            w *= isChordTone(chord, midi)
              ? deg === 1 || deg === 4
                ? 12
                : 5
              : 0.05;
          return w;
        }),
      );
    } else if (motif.useSequence && bar === 2 && notes.length >= bar0.length) {
      // Sequence: replay bar 1's contour from a new chord tone.
      const j = onsets.filter(
        (x) => x.time >= 2 * BEATS_PER_BAR && x.time < o.time,
      ).length;
      const refIv = j === 0 ? 0 : notes[j]!.step - notes[j - 1]!.step;
      if (j === 0) {
        const cands = [-2, -1, 0, 1, 2].map(
          (d) => notes[0]!.step + d + (rng.chance(0.5) ? 1 : -1),
        );
        next = rng.weighted(
          cands,
          cands.map((s) => (isChordTone(chord, toMidi(key, s)) ? 3 : 0.3)),
        );
      } else next = step + refIv;
      if (o.strong && !isChordTone(chord, toMidi(key, next)))
        next += isChordTone(chord, toMidi(key, next + 1)) ? 1 : -1;
    } else {
      const history = intervals.slice(-2).map(String);
      const prevIv = intervals.length ? intervals[intervals.length - 1]! : null;
      const cands: string[] = [];
      for (let d = -7; d <= 7; d++) cands.push(String(d));
      const nearEnd = i === onsets.length - 2;
      const iv = chain.sample(history, rng, {
        temperature,
        candidates: cands,
        bias: (tok, p) => {
          const d = Number(tok);
          let w =
            (p + 0.003) *
            scoreStep(ctx, chord, o.strong, step, prevIv, repeat, step + d);
          if (nearEnd && Math.abs(d) > 2) w *= 0.4; // approach the cadence smoothly
          return w;
        },
      });
      next = step + Number(iv);
    }

    // Keep the line inside the instrument's range
    while (toMidi(key, next) > ctx.high && !isLast) next -= 7;
    while (toMidi(key, next) < ctx.low && !isLast) next += 7;
    if (i > 0) intervals.push(next - step);
    repeat = next === step ? repeat + 1 : 0;
    step = next;
    notes.push({ time: o.time, dur: o.dur, step, strong: o.strong });
  });
  return notes;
}

// ---------------- Accompaniment ----------------

function bassRoot(chord: Chord, prev: number): number {
  return nearestPc(chord.root, prev, 31, 52);
}

function generateBass(
  piece: Piece,
  rng: Rng,
  style: StyleDef,
  activeFrom: number,
) {
  const out: NoteEvent[] = [];
  let prev = 40;
  const slots = piece.chords;
  slots.forEach((slot, i) => {
    const section = piece.sections[slot.section]!;
    if (section.energy < activeFrom) return;
    const { chord } = slot;
    const root = bassRoot(chord, prev);
    const fifth =
      root +
      (chord.intervals.includes(6) && !chord.intervals.includes(7) ? 6 : 7);
    const third = root + (chord.intervals.includes(3) ? 3 : 4);
    const nextChord = slots[i + 1]?.chord ?? slots[0]!.chord;
    const nextRoot = bassRoot(nextChord, root);
    const v = 0.75 + section.energy * 0.2;
    const add = (t: number, d: number, m: number, vel = v) =>
      out.push({
        track: "bass",
        time: slot.time + t,
        dur: d,
        midi: m,
        vel: Math.min(1, vel + (rng.next() - 0.5) * 0.08),
      });
    const B = slot.beats;

    switch (style.bass) {
      case "pop8": {
        for (let t = 0; t < B; t += 0.5) {
          const lastEighth = t === B - 0.5;
          const m =
            lastEighth && rng.chance(0.5)
              ? nextRoot > root
                ? nextRoot - 2
                : nextRoot + 1
              : t === B - 1 && rng.chance(0.3)
                ? fifth
                : root;
          add(t, 0.45, m, t % 1 === 0 ? v : v * 0.8);
        }
        break;
      }
      case "walking": {
        const tones = [root, third, fifth, root + 12, fifth - 12].filter(
          (m) => m >= 28 && m <= 55,
        );
        for (let t = 0; t < B; t++) {
          let m: number;
          if (t === 0) m = root;
          else if (t === B - 1)
            m = nextRoot + (rng.chance(0.5) ? 1 : -1); // chromatic approach
          else m = rng.pick(tones);
          add(t, 0.95, m, t === 0 ? v : v * 0.85);
        }
        break;
      }
      case "lofi": {
        add(0, Math.min(1.5, B), root);
        if (B >= 4) {
          add(1.75, 0.25, root, v * 0.6);
          add(2.5, 1, rng.chance(0.5) ? fifth : root + 12, v * 0.8);
          if (rng.chance(0.5))
            add(3.5, 0.5, nextRoot + (nextRoot > root ? -1 : 1), v * 0.7);
        } else add(1, 1, fifth, v * 0.75);
        break;
      }
      case "sustain": {
        add(0, B, root);
        if (section.energy > 0.7) add(0, B, root + 12, v * 0.5);
        break;
      }
      case "classical": {
        if (B >= 4) {
          add(0, 2, root);
          add(
            2,
            2,
            rng.chance(0.6) ? (fifth - 12 >= 31 ? fifth - 12 : fifth) : third,
            v * 0.85,
          );
        } else add(0, B, root);
        break;
      }
      case "octaves": {
        for (let t = 0; t < B; t += 0.5)
          add(
            t,
            0.42,
            t % 1 === 0 ? root : root + 12,
            t % 1 === 0 ? v : v * 0.75,
          );
        break;
      }
    }
    prev = root;
  });
  return out;
}

function generateComp(piece: Piece, rng: Rng, style: StyleDef) {
  const keys: NoteEvent[] = [];
  const pads: NoteEvent[] = [];
  let prevKeys: number[] | null = null;
  let prevPad: number[] | null = null;
  for (const slot of piece.chords) {
    const section = piece.sections[slot.section]!;
    const { chord, beats: B } = slot;
    const voicing = voiceLead(chord, prevKeys, 52, 76, 4);
    prevKeys = voicing;
    const v = 0.5 + section.energy * 0.25;
    const hit = (t: number, d: number, notes: number[], vel = v, strum = 0) =>
      notes.forEach((m, i) =>
        keys.push({
          track: "keys",
          time: slot.time + t + i * strum,
          dur: d,
          midi: m,
          vel: vel * (0.92 + rng.next() * 0.12),
        }),
      );

    switch (style.comp) {
      case "pop":
        hit(0, 1.5, voicing);
        if (B >= 4) {
          hit(1.5, 1, voicing, v * 0.8);
          hit(2.5, 1.5, voicing, v * 0.85);
        } else hit(1.5, 0.5, voicing, v * 0.75);
        break;
      case "block":
        hit(0, B, voicing, v * 0.9, 0.015);
        break;
      case "jazz": {
        const patterns =
          B >= 4
            ? [
                [
                  [0, 0.75],
                  [1.5, 0.5],
                ],
                [
                  [1, 0.5],
                  [2.5, 0.5],
                ],
                [
                  [0.5, 0.5],
                  [2, 1],
                ],
                [
                  [0, 1],
                  [2.5, 0.5],
                  [3.5, 0.5],
                ],
                [
                  [1.5, 1],
                  [3, 0.5],
                ],
              ]
            : [
                [[0, 0.75]],
                [[0.5, 1]],
                [
                  [0, 0.5],
                  [1.5, 0.5],
                ],
              ];
        for (const [t, d] of rng.pick(patterns))
          hit(t!, d!, voicing, v * (0.75 + rng.next() * 0.25));
        break;
      }
      case "lofi":
        hit(0, Math.min(B, 2.5), voicing, v, 0.025);
        if (B >= 4 && rng.chance(0.7)) hit(3.5, 0.5, voicing, v * 0.6, 0.012);
        break;
      case "alberti": {
        const low = voicing[0]!;
        const mid = voicing[1] ?? low + 4;
        const top = voicing[2] ?? low + 7;
        const pattern = [low, top, mid, top];
        for (let t = 0; t < B; t += 0.5) {
          const m = pattern[(t * 2) % 4]!;
          keys.push({
            track: "keys",
            time: slot.time + t,
            dur: 0.48,
            midi: m,
            vel: v * (t % 1 === 0 ? 0.85 : 0.7),
          });
        }
        break;
      }
      case "arp8": {
        const seq = [...voicing, voicing[0]! + 12];
        for (let t = 0, i = 0; t < B; t += 0.5, i++) {
          keys.push({
            track: "keys",
            time: slot.time + t,
            dur: 0.9,
            midi: seq[i % seq.length]!,
            vel: v * 0.8,
          });
        }
        break;
      }
      case "pulse":
        for (let t = 0; t < B; t += 0.5)
          hit(t, 0.3, voicing, v * (t % 1 === 0 ? 0.65 : 0.5));
        break;
    }

    // Pad: wide sustained voicing in a higher register
    const pad = voiceLead(chord, prevPad, 55, 79, 4);
    prevPad = pad;
    pad.forEach((m) =>
      pads.push({
        track: "pad",
        time: slot.time,
        dur: B,
        midi: m,
        vel: 0.45 + section.energy * 0.2,
      }),
    );
    // Low fifth anchor for fullness
    if (section.energy > 0.6)
      pads.push({
        track: "pad",
        time: slot.time,
        dur: B,
        midi: nearestPc(chord.root, 48, 43, 54),
        vel: 0.35,
      });
  }
  return { keys, pads };
}

function generateArp(piece: Piece, style: StyleDef) {
  const out: NoteEvent[] = [];
  if (!style.arp) return out;
  let prev: number[] | null = null;
  for (const slot of piece.chords) {
    const section = piece.sections[slot.section]!;
    const voicing = voiceLead(slot.chord, prev, 60, 79, 4);
    prev = voicing;
    const v = 0.45 + section.energy * 0.25;
    if (style.arp === "up16") {
      const seq = [...voicing, voicing[0]! + 12, ...voicing.slice(1).reverse()];
      for (let t = 0, i = 0; t < slot.beats; t += 0.25, i++)
        out.push({
          track: "arp",
          time: slot.time + t,
          dur: 0.22,
          midi: seq[i % seq.length]!,
          vel: v * (i % 4 === 0 ? 1 : 0.75),
        });
    } else if (style.arp === "ostinato8") {
      const root = nearestPc(slot.chord.root, 60, 55, 66);
      const fifth = root + 7;
      const seq = [
        root,
        fifth,
        root + 12,
        fifth,
        root + 12 + (slot.chord.intervals.includes(3) ? 3 : 4),
        fifth,
      ];
      for (let t = 0, i = 0; t < slot.beats; t += 0.5, i++)
        out.push({
          track: "arp",
          time: slot.time + t,
          dur: 0.45,
          midi: seq[i % seq.length]!,
          vel: v * (i % 2 === 0 ? 0.95 : 0.75),
        });
    } else if (style.arp === "cascade") {
      const seq = [voicing[0]! + 12, ...voicing.slice(1).map((m) => m + 12)];
      const times = [0, 0.75, 1.5, 2.5];
      times.forEach((t, i) => {
        if (t < slot.beats)
          out.push({
            track: "arp",
            time: slot.time + t,
            dur: 0.7,
            midi: seq[i % seq.length]!,
            vel: v * 0.8,
          });
      });
    }
  }
  return out;
}

// ---------------- Drums ----------------

type DrumPattern = Partial<Record<DrumId, string>>;

const DRUM_PATTERNS: Record<
  string,
  { full: DrumPattern; light: DrumPattern; fills: DrumPattern[] }
> = {
  pop: {
    full: {
      kick: "x-----x-x-------",
      snare: "----X-------X---",
      hatClosed: "x-o-x-o-x-o-x-oo",
      hatOpen: "--------------x-",
    },
    light: {
      kick: "x-------x-------",
      rim: "----x-------x---",
      hatClosed: "x-o-x-o-x-o-x-o-",
    },
    fills: [
      { snare: "----X-------xooX", tomMid: "------------" },
      {
        snare: "----X-------x---",
        tomHigh: "-------------x--",
        tomMid: "--------------x-",
        tomLow: "---------------x",
      },
    ],
  },
  lofi: {
    full: {
      kick: "x------x--x-----",
      snare: "----X-------X---",
      hatClosed: "x-oxx-o-x-oxx-o-",
      shaker: "-o-o-o-o-o-o-o-o",
    },
    light: {
      kick: "x---------x-----",
      rim: "----x-------x---",
      hatClosed: "x-o-x-o-x-o-x-o-",
    },
    fills: [{ snare: "----X-------X-gx" }],
  },
  jazz: {
    full: {
      ride: "X---x-xoX---x-xo",
      hatClosed: "----x-------x---",
      kick: "g---g---g---g---",
    },
    light: { ride: "x---o-ogx---o-og", hatClosed: "----x-------x---" },
    fills: [{ snare: "------g---x-o-xX" }],
  },
  synthwave: {
    full: {
      kick: "X---x---X---x---",
      snare: "----X-------X---",
      clap: "----x-------x---",
      hatClosed: "o-x-o-x-o-x-o-x-",
      hatOpen: "--o---o---o---o-",
    },
    light: { kick: "x---x---x---x---", hatClosed: "--x---x---x---x-" },
    fills: [
      { snare: "----X---x-x-xxxx" },
      {
        tomHigh: "--------x-x-----",
        tomMid: "------------x-x-",
        snare: "----X-----------",
      },
    ],
  },
  cinematic: {
    full: {
      tomLow: "X-----x-x-------",
      tomMid: "----x-------x-x-",
      snare: "------------g-g-",
    },
    light: { tomLow: "x-------x-------" },
    fills: [{ tomLow: "X---x---x-x-xxxx", tomMid: "--x---x---x-x---" }],
  },
};

const VEL: Record<string, number> = { X: 1, x: 0.8, o: 0.5, g: 0.25 };

function generateDrums(piece: Piece, rng: Rng, style: StyleDef): DrumEvent[] {
  const out: DrumEvent[] = [];
  const kit = DRUM_PATTERNS[style.drums];
  if (!kit) return out;
  const { sections } = piece;
  sections.forEach((section, si) => {
    if (section.energy < 0.45) return;
    const pattern = section.energy >= 0.7 ? kit.full : kit.light;
    for (let bar = 0; bar < section.bars; bar++) {
      const barTime = (section.startBar + bar) * BEATS_PER_BAR;
      const isFillBar =
        bar === section.bars - 1 &&
        si < sections.length - 1 &&
        section.energy >= 0.55;
      let pat: DrumPattern = pattern;
      if (isFillBar) {
        const fill = rng.pick(kit.fills);
        pat = { ...pattern };
        for (const [drum, line] of Object.entries(fill)) {
          const base = (pat[drum as DrumId] ?? "----------------").slice(0, 8);
          pat[drum as DrumId] = base + line!.slice(8);
        }
        // Thin the hats under the fill
        if (pat.hatClosed)
          pat.hatClosed = pat.hatClosed.slice(0, 8) + "--------";
      }
      for (const [drum, line] of Object.entries(pat)) {
        for (let s = 0; s < 16; s++) {
          const ch = line![s];
          if (!ch || ch === "-") continue;
          if (ch === "g" && rng.chance(0.4)) continue;
          out.push({
            track: "drums",
            time: barTime + s * 0.25,
            drum: drum as DrumId,
            vel: VEL[ch]! * (0.9 + rng.next() * 0.15),
          });
        }
      }
      // Jazz: improvised snare comping
      if (style.drums === "jazz" && section.energy >= 0.7 && !isFillBar) {
        for (let s = 2; s < 16; s += 4)
          if (rng.chance(0.25))
            out.push({
              track: "drums",
              time: barTime + s * 0.25,
              drum: "snare",
              vel: 0.2 + rng.next() * 0.25,
            });
      }
    }
    if (si > 0 && section.energy >= 0.6 && style.drums !== "jazz")
      out.push({
        track: "drums",
        time: section.startBar * BEATS_PER_BAR,
        drum: "crash",
        vel: 0.8,
      });
    if (style.drums === "jazz" && si > 0)
      out.push({
        track: "drums",
        time: section.startBar * BEATS_PER_BAR,
        drum: "crash",
        vel: 0.5,
      });
  });
  return out;
}

// ---------------- Swing & humanise ----------------

function swingTime(t: number, amount: number, unit: 8 | 16): number {
  if (amount <= 0) return t;
  const grid = unit === 8 ? 1 : 0.5;
  const pos = mod(t, grid) / grid; // 0..1 within the pair
  const base = t - pos * grid;
  // Piecewise-linear warp: the off-beat (0.5) moves to 0.5 + amount/6
  const off = 0.5 + amount / 6;
  const warped =
    pos <= 0.5 ? (pos / 0.5) * off : off + ((pos - 0.5) / 0.5) * (1 - off);
  return base + warped * grid;
}

// ---------------- Main ----------------

export function buildSections(bars: number): Section[] {
  const form = SECTION_FORMS[bars] ?? SECTION_FORMS[16]!;
  const per = bars / form.length;
  return form.map((f, i) => ({ ...f, startBar: i * per, bars: per }));
}

export function compose(settings: Settings, opts: ComposeOptions = {}): Piece {
  const take = opts.take ?? 0;
  const taste = opts.taste;
  const style = getStyle(settings.style);
  const key: Key = { tonic: settings.tonic, scale: settings.scale };
  const sections = buildSections(settings.bars);

  // Harmony
  const harmony = generateHarmony(settings, style, sections, take, taste);
  const chords: ChordSlot[] = [];
  harmony.forEach((slots, si) => {
    const offset = sections[si]!.startBar * BEATS_PER_BAR;
    for (const s of slots) {
      const index = chords.length;
      const token = settings.overrides[index] ?? s.token;
      chords.push({
        index,
        time: offset + s.time,
        beats: s.beats,
        chord: buildChord(key, token, settings.extension),
        section: si,
        cadence: s.cadence,
      });
    }
  });

  const piece: Piece = {
    settings,
    key,
    style,
    sections,
    chords,
    notes: [],
    drums: [],
    beats: settings.bars * BEATS_PER_BAR,
    beatsPerBar: BEATS_PER_BAR,
    take,
    barFeatures: [],
  };

  // Melody
  const melRng = createRng(partSeed(settings, "melody", take));
  const melTasteRng = createRng(
    deriveSeed(partSeed(settings, "melody", take), "taste"),
  );
  const temperature = temperatureFor(settings.creativity);
  const [low, high] = style.melodyRange;
  const rChain = rhythmChain(style.id);
  const memory = new Map<string, { rhythm: string[][] }>();
  let lastStep = fromMidi(key, nearestPc(key.tonic, (low + high) / 2));
  const lead: NoteEvent[] = [];

  const chordAtTime = (t: number) => chordAt(chords, t);
  const sectionMelody = (section: Section, si: number, startStep: number) => {
    const baseKind =
      section.kind === "A'" ? "A" : section.kind === "B'" ? "B" : section.kind;
    const phraseStart = section.startBar * BEATS_PER_BAR;
    const slots = chords.filter((c) => c.section === si);
    const isB = baseKind === "B";
    const shift = isB ? 3 : 0;
    const ctx: MelodyCtx = {
      key,
      rng: melRng,
      chain: melodyChain(),
      temperature,
      low: low + (isB ? 2 : 0),
      high: high + (isB ? 2 : 0),
      center: (low + high) / 2 + shift,
    };
    const ending = slots[slots.length - 1]!.cadence ?? "half";
    let step = startStep;

    // Rhythm: reuse the section's remembered rhythm (motif identity), new cadence bar.
    const remembered = memory.get(baseKind);
    let rhythm: string[][];
    if (remembered) {
      rhythm = remembered.rhythm.map((b) => [...b]);
      if (section.kind !== baseKind)
        rhythm[rhythm.length - 1] = melRng
          .pick(style.cadenceRhythms)
          .split(" ");
    } else {
      rhythm = [];
      for (let b = 0; b < section.bars; b++) {
        const isPhraseEnd = (b + 1) % 4 === 0;
        if (isPhraseEnd)
          rhythm.push(melRng.pick(style.cadenceRhythms).split(" "));
        else if (b % 4 === 2 && melRng.chance(0.6))
          rhythm.push([...rhythm[b - 2]!]); // rhythmic repetition
        else
          rhythm.push(
            sampleRhythmBar(rChain, melRng, section.energy, temperature),
          );
      }
    }

    // Pitches, phrase by phrase (4 bars)
    const notes: NoteEvent[] = [];
    for (let p = 0; p < section.bars; p += 4) {
      const pStart = phraseStart + p * BEATS_PER_BAR;
      const pSlots = slots.filter(
        (s) => s.time >= pStart && s.time < pStart + 4 * BEATS_PER_BAR,
      );
      const isSectionEnd = p + 4 >= section.bars;
      const startTarget = isB
        ? step + 2
        : fromMidi(key, nearestPc(key.tonic, ctx.center)) +
          melRng.pick([0, 2, 4]);
      const phrase = generatePhraseMelody(
        ctx,
        pSlots.length ? pSlots : slots,
        rhythm.slice(p, p + 4),
        pStart,
        startTarget,
        isSectionEnd ? ending : "half",
        { useSequence: melRng.chance(0.55) },
      );
      for (const n of phrase) {
        notes.push({
          track: "lead",
          time: pStart + n.time,
          dur: n.dur * 0.94,
          midi: toMidi(key, n.step),
          vel:
            (n.strong ? 0.82 : 0.68) * (0.85 + section.energy * 0.15) +
            (melRng.next() - 0.5) * 0.08,
        });
        step = n.step;
      }
    }
    return { notes, rhythm, step, baseKind, remembered: !!remembered };
  };

  sections.forEach((section, si) => {
    // Without a taste model there is one candidate; with one, Thompson sampling
    // picks the candidate whose bars score highest under a fresh θ draw.
    const count = taste ? TASTE_CANDIDATES : 1;
    const theta = taste?.draw(melTasteRng);
    let best: ReturnType<typeof sectionMelody> | null = null;
    let bestScore = -Infinity;
    for (let k = 0; k < count; k++) {
      const cand = sectionMelody(section, si, lastStep);
      let score = 0;
      if (theta) {
        const prevLead = lead[lead.length - 1] ?? null;
        for (let b = 0; b < section.bars; b++) {
          const start = (section.startBar + b) * BEATS_PER_BAR;
          const inBar = cand.notes.filter(
            (n) =>
              n.time >= start - 1e-6 && n.time < start + BEATS_PER_BAR - 1e-6,
          );
          const before = cand.notes.filter((n) => n.time < start - 1e-6);
          const v = new Array(DIM).fill(0);
          melodyFeatures(
            v,
            inBar,
            before.length ? before[before.length - 1]! : prevLead,
            chordAtTime,
            start,
            BEATS_PER_BAR,
            style.melodyRange,
          );
          score += dot(theta, v, MELODY_DIMS);
        }
      }
      if (score > bestScore) {
        bestScore = score;
        best = cand;
      }
    }
    const chosen = best!;
    if (!chosen.remembered)
      memory.set(chosen.baseKind, { rhythm: chosen.rhythm });
    lead.push(...chosen.notes);
    lastStep = chosen.step;
  });

  piece.barFeatures = pieceBarFeatures(
    settings.bars,
    BEATS_PER_BAR,
    chords,
    lead,
    style.melodyRange,
  );

  // Accompaniment
  const compRng = createRng(partSeed(settings, "comp", take));
  const bassRng = createRng(partSeed(settings, "bass", take));
  const drumRng = createRng(partSeed(settings, "drums", take));
  const { keys, pads } = generateComp(piece, compRng, style);
  const bass = generateBass(piece, bassRng, style, 0.3);
  const arp = generateArp(piece, style).filter(
    (n) => piece.sections[sectionIndexAt(piece, n.time)]!.energy >= 0.7,
  );
  const padFiltered = pads.filter(
    (n) => piece.sections[sectionIndexAt(piece, n.time)]!.energy >= 0.5,
  );
  const drums = generateDrums(piece, drumRng, style);

  // Swing + humanise
  const humanRng = createRng(deriveSeed(settings.seed, "human"));
  const loose = style.id === "lofi" || style.id === "jazz" ? 0.012 : 0.004;
  const sw = (t: number) => swingTime(t, settings.swing, style.swingUnit);
  const human = (t: number) => Math.max(0, t + (humanRng.next() - 0.5) * loose);
  piece.notes = [...lead, ...keys, ...padFiltered, ...arp, ...bass]
    .map((n) => {
      const start = sw(n.time);
      const end = sw(n.time + n.dur);
      return {
        ...n,
        time: n.track === "pad" ? start : human(start),
        dur: Math.max(0.05, end - start),
        vel: clamp01(n.vel),
      };
    })
    .sort((a, b) => a.time - b.time);
  piece.drums = drums
    .map((d) => ({ ...d, time: human(sw(d.time)), vel: clamp01(d.vel) }))
    .sort((a, b) => a.time - b.time);
  return piece;
}

function sectionIndexAt(piece: Piece, time: number): number {
  const bar = Math.floor(time / BEATS_PER_BAR);
  const idx = piece.sections.findIndex(
    (s) => bar >= s.startBar && bar < s.startBar + s.bars,
  );
  return idx < 0 ? 0 : idx;
}

const clamp01 = (v: number) => Math.max(0.02, Math.min(1, v));

/** Markov suggestions for replacing the chord at slot `index`. */
export function chordSuggestions(piece: Piece, index: number, k = 6) {
  const chain = harmonyChain(piece.style.id);
  const history = piece.chords
    .slice(Math.max(0, index - 2), index)
    .map((c) => c.chord.token);
  const next = piece.chords[index + 1]?.chord.token;
  const dist = chain.distribution(history);
  const vocab = [...chain.vocabulary];
  const scored = vocab.map((tok) => {
    // Square roots soften the order-2 chain so that alternatives remain visible
    let p = Math.sqrt((dist.get(tok) ?? 0) + 0.002);
    if (next)
      p *= Math.sqrt(
        (chain.distribution([...history.slice(-1), tok]).get(next) ?? 0) + 0.05,
      );
    return { token: tok, p };
  });
  const total = scored.reduce((a, s) => a + s.p, 0);
  return scored
    .map((s) => ({
      ...s,
      p: s.p / total,
      chord: buildChord(piece.key, s.token, piece.settings.extension),
    }))
    .sort((a, b) => b.p - a.p)
    .slice(0, k);
}

export { pcToDegree };
