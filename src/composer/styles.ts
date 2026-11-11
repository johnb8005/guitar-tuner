// Style definitions: training corpora for the Markov chains plus arrangement choices.

import type { Extension, ScaleId } from "./theory";

export type TrackId = "lead" | "keys" | "pad" | "arp" | "bass" | "drums";
export const TRACK_IDS: TrackId[] = ["lead", "keys", "pad", "arp", "bass", "drums"];

export type StyleId = "pop" | "lofi" | "jazz" | "cinematic" | "classical" | "synthwave";

export type BassStyle = "pop8" | "walking" | "lofi" | "sustain" | "classical" | "octaves";
export type CompStyle = "pop" | "block" | "jazz" | "lofi" | "alberti" | "arp8" | "pulse";
export type ArpStyle = "up16" | "ostinato8" | "cascade";
export type DrumKit = "pop" | "lofi" | "jazz" | "synthwave" | "cinematic" | "none";

export type StyleDef = {
  id: StyleId;
  name: string;
  blurb: string;
  gradient: string; // tailwind gradient classes for the style card
  scale: ScaleId;
  tempo: number;
  swing: number; // 0..1
  swingUnit: 8 | 16;
  extension: Extension;
  splitBarChance: number; // probability a bar holds two chords
  raiseLeadingTone: boolean; // use a major V at cadences in minor keys
  progressions: string[];
  rhythms: string[]; // bars of 4 beat-cells
  cadenceRhythms: string[];
  melodyRange: [number, number];
  leadOctave: number; // MIDI base for scale degree 0
  bass: BassStyle;
  comp: CompStyle;
  arp: ArpStyle | null;
  drums: DrumKit;
  instruments: Record<TrackId, string>;
};

// Beat-cells used by the rhythm chain (onset, duration) within one beat.
export const RHYTHM_CELLS: Record<string, [number, number][]> = {
  q: [[0, 1]],
  ee: [[0, 0.5], [0.5, 0.5]],
  er: [[0, 0.5]],
  re: [[0.5, 0.5]],
  "e.s": [[0, 0.75], [0.75, 0.25]],
  sse: [[0, 0.25], [0.25, 0.25], [0.5, 0.5]],
  ess: [[0, 0.5], [0.5, 0.25], [0.75, 0.25]],
  ssss: [[0, 0.25], [0.25, 0.25], [0.5, 0.25], [0.75, 0.25]],
  t: [[0, 1 / 3], [1 / 3, 1 / 3], [2 / 3, 1 / 3]],
  "-": [], // tie: extend the previous note
  r: [], // rest
};

const BASE_RHYTHMS = [
  "q q q q",
  "q - ee q",
  "ee ee q q",
  "q ee q -",
  "re ee q q",
  "q q ee ee",
  "e.s ee q q",
  "q - q q",
  "ee q ee q",
  "q ee ee q",
];

export const STYLES: StyleDef[] = [
  {
    id: "pop",
    name: "Pop",
    blurb: "Catchy hooks, four-chord loops",
    gradient: "from-pink-500 to-orange-400",
    scale: "ionian",
    tempo: 104,
    swing: 0,
    swingUnit: 16,
    extension: "triad",
    splitBarChance: 0.12,
    raiseLeadingTone: false,
    progressions: [
      "1 5 6 4", "6 4 1 5", "1 6 4 5", "4 1 5 6", "1 4 6 5", "1 5 4 5",
      "6 5 4 5", "1 3 4 5", "4 5 3 6", "2 4 1 5", "1 4 1 5", "4 5 6 6",
      "1 5 6 3 4 1 4 5", "6 4 5 1", "1 bVII 4 1",
    ],
    rhythms: [...BASE_RHYTHMS, "re ee ee q", "ee ee ee q", "q re ee q", "re q ee q", "e.s e.s q q"],
    cadenceRhythms: ["q - - r", "ee q - r", "q q - r", "re ee q -"],
    melodyRange: [62, 81],
    leadOctave: 72,
    bass: "pop8",
    comp: "pop",
    arp: "cascade",
    drums: "pop",
    instruments: { lead: "bell-lead", keys: "grand-piano", pad: "warm-pad", arp: "pluck", bass: "finger-bass", drums: "acoustic-kit" },
  },
  {
    id: "lofi",
    name: "Lo-fi",
    blurb: "Dusty sevenths, lazy swing",
    gradient: "from-amber-400 to-rose-500",
    scale: "ionian",
    tempo: 80,
    swing: 0.55,
    swingUnit: 16,
    extension: "ninth",
    splitBarChance: 0.08,
    raiseLeadingTone: false,
    progressions: [
      "2 5 1 6", "4 3 2 1", "4 3 6 5", "1 6 2 5", "2 5 1 1", "4 4 3 6",
      "6 2 5 1", "1 3 4 iv", "4 iv 3 6", "2 3 4 5", "1 4 1 4", "1 7 4 4",
    ],
    rhythms: [...BASE_RHYTHMS, "re ee - q", "q - re ee", "r ee q q", "re e.s q -", "ee - q q"],
    cadenceRhythms: ["q - - -", "re ee q -", "r q - -"],
    melodyRange: [62, 79],
    leadOctave: 72,
    bass: "lofi",
    comp: "lofi",
    arp: null,
    drums: "lofi",
    instruments: { lead: "vibraphone", keys: "rhodes", pad: "tape-pad", arp: "pluck", bass: "sub-bass", drums: "lofi-kit" },
  },
  {
    id: "jazz",
    name: "Jazz",
    blurb: "ii–V–I's, walking bass, ride",
    gradient: "from-sky-400 to-indigo-500",
    scale: "ionian",
    tempo: 132,
    swing: 0.65,
    swingUnit: 8,
    extension: "ninth",
    splitBarChance: 0.35,
    raiseLeadingTone: true,
    progressions: [
      "2 5 1 1", "1 6 2 5", "3 6 2 5", "1 V/ii 2 5", "2 5 3 6", "4 bVII 1 1",
      "1 V/vi 6 V/V 2 5 1 1", "3 V/ii 2 5 1", "1 1 V/V V/V 2 5 1 1", "4 iv 3 6 2 5 1",
    ],
    rhythms: [...BASE_RHYTHMS, "ee ee ee ee", "t q ee q", "re ee ee q", "q t ee q", "ee ee t q"],
    cadenceRhythms: ["q - - r", "ee q - r", "t q - r"],
    melodyRange: [62, 82],
    leadOctave: 72,
    bass: "walking",
    comp: "jazz",
    arp: null,
    drums: "jazz",
    instruments: { lead: "vibraphone", keys: "grand-piano", pad: "warm-pad", arp: "pluck", bass: "upright-bass", drums: "jazz-kit" },
  },
  {
    id: "cinematic",
    name: "Cinematic",
    blurb: "Epic minor, strings & ostinato",
    gradient: "from-emerald-400 to-teal-600",
    scale: "aeolian",
    tempo: 76,
    swing: 0,
    swingUnit: 16,
    extension: "triad",
    splitBarChance: 0.05,
    raiseLeadingTone: true,
    progressions: [
      "1 6 3 7", "1 4 6 5", "6 7 1 1", "1 7 6 7", "1 6 4 5", "4 6 1 7",
      "1 3 7 4", "6 3 7 1", "1 6 7 5", "6 4 1 5", "1 bII 1 V7",
    ],
    rhythms: ["q - q q", "q - - -", "q q q q", "q - ee q", "ee q q -", "q - q -", "e.s q q -"],
    cadenceRhythms: ["q - - -", "q q - -"],
    melodyRange: [60, 79],
    leadOctave: 72,
    bass: "sustain",
    comp: "block",
    arp: "ostinato8",
    drums: "cinematic",
    instruments: { lead: "strings-solo", keys: "grand-piano", pad: "string-ensemble", arp: "pluck", bass: "cello-bass", drums: "taiko-kit" },
  },
  {
    id: "classical",
    name: "Classical",
    blurb: "Functional harmony, Alberti bass",
    gradient: "from-violet-400 to-fuchsia-500",
    scale: "ionian",
    tempo: 96,
    swing: 0,
    swingUnit: 16,
    extension: "triad",
    splitBarChance: 0.3,
    raiseLeadingTone: true,
    progressions: [
      "1 4 5 1", "1 2 5 1", "1 6 2 5 1", "1 4 1 5", "1 V/V 5 1", "1 5 6 3 4 1 4 5",
      "1 6 4 5", "4 5 1 6", "1 2 V7 1", "1 4 2 5 1", "6 2 5 1", "1 V/vi 6 4 5 1",
    ],
    rhythms: [...BASE_RHYTHMS, "ssss q q q", "q ssss q q", "ee ee ssss q", "q q t q"],
    cadenceRhythms: ["q q - r", "ee q - r", "q - - r"],
    melodyRange: [64, 86],
    leadOctave: 72,
    bass: "classical",
    comp: "alberti",
    arp: null,
    drums: "none",
    instruments: { lead: "flute", keys: "grand-piano", pad: "string-ensemble", arp: "harp", bass: "cello-bass", drums: "acoustic-kit" },
  },
  {
    id: "synthwave",
    name: "Synthwave",
    blurb: "Neon arps, gated snares",
    gradient: "from-fuchsia-500 to-cyan-400",
    scale: "aeolian",
    tempo: 112,
    swing: 0,
    swingUnit: 16,
    extension: "seventh",
    splitBarChance: 0.06,
    raiseLeadingTone: false,
    progressions: [
      "1 6 3 7", "1 7 6 7", "6 7 1 1", "1 6 7 7", "1 3 7 6", "4 6 7 1",
      "6 4 1 5", "1 1 6 7", "1 4 6 7", "6 7 3 3",
    ],
    rhythms: [...BASE_RHYTHMS, "q - - ee", "ee ee ee ee", "q re ee q"],
    cadenceRhythms: ["q - - -", "ee q - -", "q q - r"],
    melodyRange: [62, 81],
    leadOctave: 72,
    bass: "octaves",
    comp: "pulse",
    arp: "up16",
    drums: "synthwave",
    instruments: { lead: "saw-lead", keys: "poly-synth", pad: "supersaw-pad", arp: "pluck", bass: "analog-bass", drums: "electro-kit" },
  },
];

export function getStyle(id: StyleId): StyleDef {
  return STYLES.find((s) => s.id === id) ?? STYLES[0]!;
}

// Public-domain folk melodies written as 0-based scale degrees. The melody chain
// learns its interval statistics from these (contour, step/leap balance, gap-fill).
export const MELODY_CORPUS: number[][] = [
  // Ode to Joy
  [2, 2, 3, 4, 4, 3, 2, 1, 0, 0, 1, 2, 2, 1, 1, 2, 2, 3, 4, 4, 3, 2, 1, 0, 0, 1, 2, 1, 0, 0],
  // Twinkle Twinkle
  [0, 0, 4, 4, 5, 5, 4, 3, 3, 2, 2, 1, 1, 0, 4, 4, 3, 3, 2, 2, 1, 4, 4, 3, 3, 2, 2, 1],
  // Frère Jacques
  [0, 1, 2, 0, 0, 1, 2, 0, 2, 3, 4, 2, 3, 4, 4, 5, 4, 3, 2, 0, 4, 5, 4, 3, 2, 0, 0, -3, 0, 0, -3, 0],
  // Amazing Grace
  [-3, 0, 2, 0, 2, 1, 0, -2, -3, -3, 0, 2, 0, 2, 1, 4, 2, 4, 2, 4, 2, 0, -3, -2, 0, 0, -2, -3, -3, 0, 2, 0, 2, 1, 0],
  // Greensleeves
  [0, 2, 3, 4, 5, 4, 3, 1, -1, 0, 1, 2, 0, 0, -1, 0, 1, -1, -3, 0, 2, 3, 4, 5, 4, 3, 1, -1, 0, 1, 2, 1, 0, -1, -2, -1, 0, 0],
  // Auld Lang Syne
  [-3, 0, 0, 0, 2, 1, 0, 1, 2, 0, 0, 2, 4, 5, 5, 4, 2, 2, 0, 1, 0, 1, 2, 0, -2, -2, -3, 0],
  // When the Saints
  [0, 2, 3, 4, 0, 2, 3, 4, 0, 2, 3, 4, 2, 0, 2, 1, 2, 2, 1, 0, 0, 2, 4, 4, 3, 2, 3, 4, 2, 0, 1, 0],
  // Scarborough Fair (dorian)
  [0, 0, 4, 4, 1, 2, 1, 0, 2, 4, 7, 6, 4, 5, 4, 4, 4, 2, 3, 2, 1, 0, -1, 0, 1, 0],
  // Simple Gifts
  [-3, -3, 0, 0, 1, 2, 0, 2, 3, 4, 4, 3, 2, 1, 0, 1, 1, 1, 1, 0, 1, 2, 1, -1, -3],
  // Sequences and arpeggios that idiomatic melodies use
  [0, 1, 2, 3, 4, 3, 2, 1, 0],
  [0, 2, 4, 2, 1, 3, 5, 3, 2, 4, 6, 4, 7],
  [4, 2, 0, 2, 4, 7, 4, 5, 4, 2, 1, 0],
  [7, 6, 5, 4, 5, 4, 3, 2, 3, 2, 1, 0],
  [0, 4, 3, 2, 1, 2, 0, -1, 0],
];

export const SECTION_FORMS: Record<number, { label: string; kind: "A" | "A'" | "B" | "B'"; energy: number }[]> = {
  8: [
    { label: "A", kind: "A", energy: 0.6 },
    { label: "A′", kind: "A'", energy: 0.85 },
  ],
  16: [
    { label: "A", kind: "A", energy: 0.35 },
    { label: "A′", kind: "A'", energy: 0.6 },
    { label: "B", kind: "B", energy: 0.85 },
    { label: "A″", kind: "A'", energy: 1 },
  ],
  32: [
    { label: "A", kind: "A", energy: 0.3 },
    { label: "A′", kind: "A'", energy: 0.5 },
    { label: "B", kind: "B", energy: 0.7 },
    { label: "B′", kind: "B'", energy: 0.8 },
    { label: "A", kind: "A", energy: 0.75 },
    { label: "A′", kind: "A'", energy: 0.9 },
    { label: "B", kind: "B'", energy: 1 },
    { label: "Coda", kind: "A'", energy: 0.6 },
  ],
};
