// Music theory primitives: pitch classes, scales, diatonic chords, chord symbols,
// roman numerals and voice leading. Everything works on MIDI numbers.

export const SHARP_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];
export const FLAT_NAMES = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "Gb",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
];

export const KEY_NAMES = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "F#",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
];

export type ScaleId =
  | "ionian"
  | "dorian"
  | "phrygian"
  | "lydian"
  | "mixolydian"
  | "aeolian"
  | "locrian"
  | "harmonicMinor"
  | "melodicMinor";

export type ScaleDef = {
  id: ScaleId;
  name: string;
  mood: string;
  steps: number[]; // 7 semitone offsets from the tonic
  // Offset of this mode from its parent major scale, used for spelling (sharps vs flats)
  parentOffset: number;
};

export const SCALES: ScaleDef[] = [
  {
    id: "ionian",
    name: "Major",
    mood: "Bright, resolved",
    steps: [0, 2, 4, 5, 7, 9, 11],
    parentOffset: 0,
  },
  {
    id: "aeolian",
    name: "Natural minor",
    mood: "Melancholic",
    steps: [0, 2, 3, 5, 7, 8, 10],
    parentOffset: 9,
  },
  {
    id: "dorian",
    name: "Dorian",
    mood: "Soulful minor",
    steps: [0, 2, 3, 5, 7, 9, 10],
    parentOffset: 2,
  },
  {
    id: "mixolydian",
    name: "Mixolydian",
    mood: "Bluesy, open",
    steps: [0, 2, 4, 5, 7, 9, 10],
    parentOffset: 7,
  },
  {
    id: "lydian",
    name: "Lydian",
    mood: "Dreamy, floating",
    steps: [0, 2, 4, 6, 7, 9, 11],
    parentOffset: 5,
  },
  {
    id: "phrygian",
    name: "Phrygian",
    mood: "Dark, Spanish",
    steps: [0, 1, 3, 5, 7, 8, 10],
    parentOffset: 4,
  },
  {
    id: "harmonicMinor",
    name: "Harmonic minor",
    mood: "Dramatic, classical",
    steps: [0, 2, 3, 5, 7, 8, 11],
    parentOffset: 9,
  },
  {
    id: "melodicMinor",
    name: "Melodic minor",
    mood: "Jazzy, bittersweet",
    steps: [0, 2, 3, 5, 7, 9, 11],
    parentOffset: 9,
  },
  {
    id: "locrian",
    name: "Locrian",
    mood: "Unstable, tense",
    steps: [0, 1, 3, 5, 6, 8, 10],
    parentOffset: 11,
  },
];

export function getScale(id: ScaleId): ScaleDef {
  return SCALES.find((s) => s.id === id) ?? SCALES[0]!;
}

export const mod = (n: number, m: number) => ((n % m) + m) % m;

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Major keys that are conventionally spelled with flats
const FLAT_MAJOR_PCS = new Set([5, 10, 3, 8, 1, 6]);

export function prefersFlats(tonicPc: number, scale: ScaleId): boolean {
  const parent = mod(tonicPc - getScale(scale).parentOffset, 12);
  return FLAT_MAJOR_PCS.has(parent);
}

export function pcName(pc: number, flats: boolean): string {
  return (flats ? FLAT_NAMES : SHARP_NAMES)[mod(pc, 12)]!;
}

export function midiName(midi: number, flats = false): string {
  return `${pcName(midi, flats)}${Math.floor(midi / 12) - 1}`;
}

/** A key = tonic pitch class + scale. */
export type Key = { tonic: number; scale: ScaleId };

/** MIDI note of scale degree `deg` (any integer, wraps across octaves) relative to a base octave. */
export function degreeToMidi(key: Key, deg: number, baseMidi = 60): number {
  const steps = getScale(key.scale).steps;
  const octave = Math.floor(deg / 7);
  const idx = mod(deg, 7);
  return baseMidi + key.tonic + octave * 12 + steps[idx]!;
}

/** Scale degree index (0..6) of a pitch class, or -1 if chromatic. */
export function pcToDegree(key: Key, pc: number): number {
  const steps = getScale(key.scale).steps;
  return steps.indexOf(mod(pc - key.tonic, 12));
}

/** Absolute diatonic step number for a MIDI note in key (for melodic interval math). */
export function midiToStep(key: Key, midi: number): number {
  const rel = midi - key.tonic;
  const octave = Math.floor(rel / 12);
  const pc = mod(rel, 12);
  const steps = getScale(key.scale).steps;
  // Snap chromatic notes down to the nearest scale step
  let idx = 0;
  for (let i = 0; i < 7; i++) if (steps[i]! <= pc) idx = i;
  return octave * 7 + idx;
}

export function stepToMidi(key: Key, step: number): number {
  return degreeToMidi(key, step, 0);
}

// ---------- Chords ----------

export type Chord = {
  token: string; // harmony token used by the Markov chain, e.g. "5" or "bVII"
  root: number; // pitch class
  intervals: number[]; // semitones above root (sorted, unique, < 24)
  symbol: string; // e.g. "Am7"
  roman: string; // e.g. "vi7"
  func: "tonic" | "predominant" | "dominant" | "color";
};

export type Extension = "triad" | "seventh" | "ninth";

/** Chromatic (non-diatonic) harmony tokens: root offset from tonic + fixed intervals. */
export const CHROMATIC_TOKENS: Record<
  string,
  { offset: number; intervals: number[]; func: Chord["func"] }
> = {
  bVII: { offset: 10, intervals: [0, 4, 7], func: "color" },
  bVI: { offset: 8, intervals: [0, 4, 7], func: "predominant" },
  bIII: { offset: 3, intervals: [0, 4, 7], func: "color" },
  iv: { offset: 5, intervals: [0, 3, 7], func: "predominant" },
  "V/V": { offset: 2, intervals: [0, 4, 7, 10], func: "predominant" },
  "V/vi": { offset: 4, intervals: [0, 4, 7, 10], func: "dominant" },
  "V/ii": { offset: 9, intervals: [0, 4, 7, 10], func: "dominant" },
  V7: { offset: 7, intervals: [0, 4, 7, 10], func: "dominant" },
  bII: { offset: 1, intervals: [0, 4, 7], func: "predominant" },
};

const DEGREE_FUNC: Chord["func"][] = [
  "tonic",
  "predominant",
  "tonic",
  "predominant",
  "dominant",
  "tonic",
  "dominant",
];

export function chordQualitySuffix(intervals: number[]): string {
  const set = new Set(intervals.map((i) => mod(i, 12)));
  const has = (n: number) => set.has(n);
  let triad = "";
  if (has(4) && has(7)) triad = "";
  else if (has(3) && has(7)) triad = "m";
  else if (has(3) && has(6)) triad = "dim";
  else if (has(4) && has(8)) triad = "aug";
  else if (has(5) && has(7)) triad = "sus4";
  else if (has(2) && has(7)) triad = "sus2";
  else if (has(4)) triad = "";
  else if (has(3)) triad = "m";

  const hasNinth = intervals.some((i) => i === 14 || i === 13 || i === 15);
  const ninth = intervals.includes(14)
    ? "9"
    : intervals.includes(13)
      ? "b9"
      : "";

  if (has(10)) {
    if (triad === "dim") return hasNinth ? "m9b5" : "m7b5";
    if (triad === "m") return ninth === "9" ? "m9" : "m7";
    if (triad === "") return ninth === "9" ? "9" : ninth === "b9" ? "7b9" : "7";
    return `${triad}7`;
  }
  if (has(11)) {
    if (triad === "m") return "m(maj7)";
    if (triad === "") return ninth === "9" ? "maj9" : "maj7";
    return `${triad}maj7`;
  }
  if (has(9) && triad === "dim") return "dim7";
  if (hasNinth) return `${triad}${triad === "" ? "add9" : "(add9)"}`;
  return triad;
}

const ROMAN = [
  "I",
  "bII",
  "II",
  "bIII",
  "III",
  "IV",
  "#IV",
  "V",
  "bVI",
  "VI",
  "bVII",
  "VII",
];

export function romanFor(rootOffset: number, intervals: number[]): string {
  const base = ROMAN[mod(rootOffset, 12)]!;
  const suffix = chordQualitySuffix(intervals);
  const minorish = suffix.startsWith("m") && !suffix.startsWith("maj");
  const dim = suffix.startsWith("dim") || suffix.includes("b5");
  const accidental = base.match(/^[b#]/)?.[0] ?? "";
  const numeral = base.slice(accidental.length);
  const cased = minorish || dim ? numeral.toLowerCase() : numeral;
  let tail = "";
  if (suffix === "m7b5") tail = "ø7";
  else if (suffix === "dim") tail = "°";
  else if (suffix === "dim7") tail = "°7";
  else if (suffix === "aug") tail = "+";
  else tail = suffix.replace(/^m(?!aj)/, "").replace("(add9)", "add9");
  return `${accidental}${cased}${tail}`;
}

/** Build the chord for a harmony token in a key. */
export function buildChord(key: Key, token: string, ext: Extension): Chord {
  const flats = prefersFlats(key.tonic, key.scale);
  const chrom = CHROMATIC_TOKENS[token];
  let rootOffset: number;
  let intervals: number[];
  let func: Chord["func"];

  if (chrom) {
    rootOffset = chrom.offset;
    intervals = [...chrom.intervals];
    func = chrom.func;
    if (ext !== "triad" && intervals.length === 3) {
      // add a diatonic-ish seventh: major chords get maj7 unless dominant function
      intervals.push(intervals[1] === 3 ? 10 : func === "dominant" ? 10 : 11);
    }
    if (ext === "ninth") intervals.push(14);
  } else {
    const d = Number(token) - 1;
    const steps = getScale(key.scale).steps;
    const at = (n: number) => {
      const idx = d + n;
      return steps[mod(idx, 7)]! + Math.floor(idx / 7) * 12;
    };
    rootOffset = steps[d]!;
    const stack =
      ext === "triad"
        ? [0, 2, 4]
        : ext === "seventh"
          ? [0, 2, 4, 6]
          : [0, 2, 4, 6, 8];
    intervals = stack.map((n) => at(n) - rootOffset);
    // avoid harsh b9 extensions: replace with plain 7th chord
    if (intervals.includes(13)) intervals = intervals.filter((i) => i !== 13);
    func = DEGREE_FUNC[d] ?? "color";
  }

  const root = mod(key.tonic + rootOffset, 12);
  const useFlats =
    flats ||
    (chrom !== undefined && /^b/.test(token)) ||
    (chrom !== undefined && token === "iv");
  const symbol = `${pcName(root, useFlats)}${chordQualitySuffix(intervals)}`;
  return {
    token,
    root,
    intervals,
    symbol,
    roman: romanFor(rootOffset, intervals),
    func,
  };
}

/** Pitch classes in a chord. */
export function chordPcs(chord: Chord): number[] {
  return [...new Set(chord.intervals.map((i) => mod(chord.root + i, 12)))];
}

/** Core chord tones (root, 3rd, 5th, 7th) — excludes 9ths. */
export function chordCorePcs(chord: Chord): number[] {
  return chord.intervals
    .filter((i) => i < 12)
    .map((i) => mod(chord.root + i, 12));
}

/**
 * Voice-led voicing: choose the inversion/octave placement of `chord` within [low, high]
 * minimising total movement from `prev` (common tones stay put).
 */
export function voiceLead(
  chord: Chord,
  prev: number[] | null,
  low: number,
  high: number,
  maxVoices = 4,
): number[] {
  let pcs = chordPcs(chord);
  // Drop the 5th first when we have too many voices (it's the least defining)
  if (pcs.length > maxVoices) {
    const fifth = mod(chord.root + 7, 12);
    pcs = pcs.filter((p) => p !== fifth);
  }
  if (pcs.length > maxVoices) pcs = pcs.slice(0, maxVoices);

  const candidates: number[][] = [];
  const n = pcs.length;
  for (let rot = 0; rot < n; rot++) {
    const order = [...pcs.slice(rot), ...pcs.slice(0, rot)];
    for (let base = low - 12; base <= high; base++) {
      if (mod(base, 12) !== order[0]) continue;
      const v: number[] = [base];
      for (let i = 1; i < n; i++) {
        let m = v[i - 1]! + 1;
        while (mod(m, 12) !== order[i]) m++;
        v.push(m);
      }
      if (v[0]! >= low && v[v.length - 1]! <= high) candidates.push(v);
    }
  }
  if (candidates.length === 0) {
    // fallback: simple close position
    const base = low + mod(chord.root - low, 12);
    return pcs.map((p) => base + mod(p - chord.root, 12));
  }
  const center = (low + high) / 2;
  const cost = (v: number[]) => {
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    let c = Math.abs(mean - center) * 0.35;
    if (prev && prev.length) {
      for (const note of v)
        c += Math.min(...prev.map((p) => Math.abs(p - note)));
      for (const p of prev)
        c += Math.min(...v.map((note) => Math.abs(p - note))) * 0.5;
    }
    return c;
  };
  let best = candidates[0]!;
  let bestCost = Infinity;
  for (const c of candidates) {
    const k = cost(c);
    if (k < bestCost) {
      bestCost = k;
      best = c;
    }
  }
  return best;
}

/** Nearest MIDI note with pitch class `pc` to `target`, clamped to [low, high]. */
export function nearestPc(
  pc: number,
  target: number,
  low = 0,
  high = 127,
): number {
  let best = target;
  let bestDist = Infinity;
  for (let m = low; m <= high; m++) {
    if (mod(m, 12) !== mod(pc, 12)) continue;
    const d = Math.abs(m - target);
    if (d < bestDist) {
      bestDist = d;
      best = m;
    }
  }
  return best;
}
