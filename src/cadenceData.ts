// Cadence generator with Markov transition matrices per genre

// Scale degrees (0-indexed for array access)
export type ScaleDegree = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// Chromatic notes for transposition
const chromaticNotes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// ============ MODES ============
export type Mode = "ionian" | "dorian" | "phrygian" | "lydian" | "mixolydian" | "aeolian" | "locrian";

export type ModeConfig = {
  id: Mode;
  name: string;
  character: string;
  intervals: number[]; // semitones from root
  qualities: ("major" | "minor" | "dim")[];
  degreeNames: string[];
};

export const modes: ModeConfig[] = [
  {
    id: "ionian",
    name: "Major (Ionian)",
    character: "Happy, bright",
    intervals: [0, 2, 4, 5, 7, 9, 11],
    qualities: ["major", "minor", "minor", "major", "major", "minor", "dim"],
    degreeNames: ["I", "ii", "iii", "IV", "V", "vi", "vii°"],
  },
  {
    id: "dorian",
    name: "Dorian",
    character: "Minor, jazzy",
    intervals: [0, 2, 3, 5, 7, 9, 10],
    qualities: ["minor", "minor", "major", "major", "minor", "dim", "major"],
    degreeNames: ["i", "ii", "III", "IV", "v", "vi°", "VII"],
  },
  {
    id: "phrygian",
    name: "Phrygian",
    character: "Spanish, dark",
    intervals: [0, 1, 3, 5, 7, 8, 10],
    qualities: ["minor", "major", "major", "minor", "dim", "major", "minor"],
    degreeNames: ["i", "II", "III", "iv", "v°", "VI", "vii"],
  },
  {
    id: "lydian",
    name: "Lydian",
    character: "Dreamy, bright",
    intervals: [0, 2, 4, 6, 7, 9, 11],
    qualities: ["major", "major", "minor", "dim", "major", "minor", "minor"],
    degreeNames: ["I", "II", "iii", "iv°", "V", "vi", "vii"],
  },
  {
    id: "mixolydian",
    name: "Mixolydian",
    character: "Bluesy, rock",
    intervals: [0, 2, 4, 5, 7, 9, 10],
    qualities: ["major", "minor", "dim", "major", "minor", "minor", "major"],
    degreeNames: ["I", "ii", "iii°", "IV", "v", "vi", "VII"],
  },
  {
    id: "aeolian",
    name: "Minor (Aeolian)",
    character: "Sad, natural minor",
    intervals: [0, 2, 3, 5, 7, 8, 10],
    qualities: ["minor", "dim", "major", "minor", "minor", "major", "major"],
    degreeNames: ["i", "ii°", "III", "iv", "v", "VI", "VII"],
  },
  {
    id: "locrian",
    name: "Locrian",
    character: "Unstable, tense",
    intervals: [0, 1, 3, 5, 6, 8, 10],
    qualities: ["dim", "major", "minor", "minor", "major", "major", "minor"],
    degreeNames: ["i°", "II", "iii", "iv", "V", "VI", "vii"],
  },
];

// Get mode config by id
export function getModeConfig(mode: Mode): ModeConfig {
  return modes.find(m => m.id === mode) || modes[0];
}

// Legacy exports for backward compatibility
export const degreeNames = modes[0].degreeNames;
export const degreeQualities = modes[0].qualities;

// For jazz, we use 7th chords (based on Ionian)
export const degreeQualities7th: ("maj7" | "m7" | "m7" | "maj7" | "7" | "m7" | "m7b5")[] = [
  "maj7", "m7", "m7", "maj7", "7", "m7", "m7b5"
];

// Get the root note for a scale degree in a given key and mode
export function getChordRoot(key: string, degree: ScaleDegree, mode: Mode = "ionian"): string {
  const keyIndex = chromaticNotes.indexOf(key);
  const modeConfig = getModeConfig(mode);
  const noteIndex = (keyIndex + modeConfig.intervals[degree]) % 12;
  return chromaticNotes[noteIndex];
}

// Chord variant types
export type ChordVariant = "base" | "7" | "maj7" | "m7" | "dim7";

// Get full chord name for a scale degree in a key with optional variant
export function getChordName(
  key: string,
  degree: ScaleDegree,
  use7ths: boolean = false,
  variant?: ChordVariant,
  mode: Mode = "ionian"
): string {
  const root = getChordRoot(key, degree, mode);
  const modeConfig = getModeConfig(mode);
  const baseQuality = modeConfig.qualities[degree];

  // If a specific variant is requested
  if (variant && variant !== "base") {
    if (variant === "7") {
      // Dominant 7 - works on major chords
      if (baseQuality === "major") return root + "7";
      if (baseQuality === "minor") return root + "m7";
      return root + "dim7";
    }
    if (variant === "maj7") return root + "maj7";
    if (variant === "m7") return root + "m7";
    if (variant === "dim7") return root + "dim7";
  }

  // For 7ths, derive from base quality
  if (use7ths) {
    if (baseQuality === "major") {
      // I and IV get maj7, V gets dom7
      return degree === 4 ? root + "7" : root + "maj7";
    }
    if (baseQuality === "minor") return root + "m7";
    if (baseQuality === "dim") return root + "dim7";
  }

  // Default - just the triad
  switch (baseQuality) {
    case "major": return root;
    case "minor": return root + "m";
    case "dim": return root + "dim7";
    default: return root;
  }
}

// Markov transition matrices per genre
// Each row is current chord (I, ii, iii, IV, V, vi, vii°)
// Each column is probability of next chord
// Rows must sum to 1.0

export type Genre = "pop" | "jazz" | "blues" | "rock" | "classical";

export type GenreConfig = {
  id: Genre;
  name: string;
  description: string;
  use7ths: boolean;
  embellishmentChance: number; // 0-1, chance to embellish any given bar
  phraseEndBonus: number; // Additional chance at phrase endings (bar 4, 8, etc.)
  dominantAlways7: boolean; // V chord always becomes V7
};

export const genres: GenreConfig[] = [
  { id: "pop", name: "Pop", description: "I-IV-V-vi progressions", use7ths: false, embellishmentChance: 0.15, phraseEndBonus: 0.3, dominantAlways7: false },
  { id: "jazz", name: "Jazz", description: "ii-V-I with 7th chords", use7ths: true, embellishmentChance: 0.4, phraseEndBonus: 0.4, dominantAlways7: true },
  { id: "blues", name: "Blues", description: "12-bar dominant feel", use7ths: false, embellishmentChance: 0.5, phraseEndBonus: 0.3, dominantAlways7: true },
  { id: "rock", name: "Rock", description: "Power progressions", use7ths: false, embellishmentChance: 0.1, phraseEndBonus: 0.2, dominantAlways7: false },
  { id: "classical", name: "Classical", description: "Voice-leading focused", use7ths: false, embellishmentChance: 0.2, phraseEndBonus: 0.4, dominantAlways7: true },
];

// Transition matrices: transitionMatrix[from][to] = probability
export const transitionMatrices: Record<Genre, number[][]> = {
  // Pop: Very predictable, lots of I-IV-V-vi
  pop: [
    //  I     ii    iii   IV    V     vi    vii°
    [0.05, 0.10, 0.05, 0.35, 0.25, 0.20, 0.00], // from I
    [0.15, 0.05, 0.05, 0.15, 0.45, 0.15, 0.00], // from ii
    [0.10, 0.10, 0.05, 0.35, 0.10, 0.30, 0.00], // from iii
    [0.30, 0.10, 0.05, 0.05, 0.35, 0.15, 0.00], // from IV
    [0.50, 0.05, 0.05, 0.15, 0.05, 0.20, 0.00], // from V
    [0.15, 0.15, 0.10, 0.35, 0.20, 0.05, 0.00], // from vi
    [0.60, 0.10, 0.05, 0.10, 0.10, 0.05, 0.00], // from vii°
  ],

  // Jazz: ii-V-I dominant, more complex movements
  jazz: [
    //  I     ii    iii   IV    V     vi    vii°
    [0.05, 0.30, 0.10, 0.20, 0.10, 0.20, 0.05], // from I
    [0.10, 0.05, 0.05, 0.10, 0.60, 0.05, 0.05], // from ii (strongly to V)
    [0.10, 0.15, 0.05, 0.15, 0.15, 0.35, 0.05], // from iii
    [0.20, 0.20, 0.10, 0.05, 0.25, 0.15, 0.05], // from IV
    [0.55, 0.15, 0.05, 0.10, 0.05, 0.05, 0.05], // from V (strongly to I)
    [0.15, 0.40, 0.05, 0.15, 0.15, 0.05, 0.05], // from vi (often to ii)
    [0.50, 0.15, 0.10, 0.10, 0.10, 0.05, 0.00], // from vii°
  ],

  // Blues: I-IV-V with some variations, dominant feel
  blues: [
    //  I     ii    iii   IV    V     vi    vii°
    [0.20, 0.05, 0.00, 0.50, 0.20, 0.05, 0.00], // from I (often stays or goes to IV)
    [0.30, 0.05, 0.00, 0.20, 0.40, 0.05, 0.00], // from ii
    [0.30, 0.10, 0.05, 0.30, 0.20, 0.05, 0.00], // from iii
    [0.40, 0.05, 0.00, 0.15, 0.35, 0.05, 0.00], // from IV
    [0.55, 0.05, 0.00, 0.30, 0.05, 0.05, 0.00], // from V
    [0.30, 0.10, 0.00, 0.25, 0.30, 0.05, 0.00], // from vi
    [0.50, 0.10, 0.00, 0.20, 0.20, 0.00, 0.00], // from vii°
  ],

  // Rock: More dramatic, uses bVII conceptually mapped to V, power chord feel
  rock: [
    //  I     ii    iii   IV    V     vi    vii°
    [0.10, 0.05, 0.05, 0.40, 0.30, 0.10, 0.00], // from I
    [0.25, 0.05, 0.05, 0.25, 0.30, 0.10, 0.00], // from ii
    [0.20, 0.10, 0.05, 0.30, 0.20, 0.15, 0.00], // from iii
    [0.35, 0.05, 0.05, 0.10, 0.35, 0.10, 0.00], // from IV
    [0.50, 0.05, 0.05, 0.25, 0.05, 0.10, 0.00], // from V
    [0.20, 0.10, 0.10, 0.35, 0.20, 0.05, 0.00], // from vi
    [0.45, 0.10, 0.05, 0.20, 0.15, 0.05, 0.00], // from vii°
  ],

  // Classical: More voice-leading, secondary dominants
  classical: [
    //  I     ii    iii   IV    V     vi    vii°
    [0.05, 0.15, 0.10, 0.30, 0.20, 0.15, 0.05], // from I
    [0.15, 0.05, 0.10, 0.15, 0.45, 0.05, 0.05], // from ii
    [0.15, 0.15, 0.05, 0.25, 0.15, 0.20, 0.05], // from iii
    [0.25, 0.15, 0.10, 0.05, 0.30, 0.10, 0.05], // from IV
    [0.55, 0.10, 0.05, 0.10, 0.05, 0.10, 0.05], // from V
    [0.15, 0.25, 0.15, 0.20, 0.15, 0.05, 0.05], // from vi
    [0.60, 0.10, 0.05, 0.10, 0.10, 0.05, 0.00], // from vii°
  ],
};

// Starting chord probabilities per genre
export const startingProbabilities: Record<Genre, number[]> = {
  pop: [0.60, 0.05, 0.05, 0.15, 0.05, 0.10, 0.00],
  jazz: [0.40, 0.30, 0.05, 0.10, 0.05, 0.10, 0.00],
  blues: [0.80, 0.05, 0.00, 0.10, 0.05, 0.00, 0.00],
  rock: [0.65, 0.05, 0.05, 0.15, 0.05, 0.05, 0.00],
  classical: [0.50, 0.15, 0.10, 0.15, 0.05, 0.05, 0.00],
};

// Sample from a probability distribution
function sampleFromDistribution(probabilities: number[]): number {
  const random = Math.random();
  let cumulative = 0;
  for (let i = 0; i < probabilities.length; i++) {
    cumulative += probabilities[i];
    if (random < cumulative) return i;
  }
  return probabilities.length - 1;
}

// A single chord in a bar
export type BarChord = {
  chordName: string;
  degreeName: string;
};

// A bar can have 1 or 2 chords (base + embellishment)
export type ProgressionBar = {
  degree: ScaleDegree;
  chords: BarChord[]; // 1 chord = full bar, 2 chords = split bar
};

// Determine if a bar should be embellished
function shouldEmbellish(
  barIndex: number,
  numBars: number,
  genreConfig: GenreConfig
): boolean {
  const isPhraseEnd = (barIndex + 1) % 4 === 0; // Bar 4, 8, 12, etc.
  const isLastBar = barIndex === numBars - 1;

  let chance = genreConfig.embellishmentChance;
  if (isPhraseEnd || isLastBar) {
    chance += genreConfig.phraseEndBonus;
  }

  return Math.random() < chance;
}

// Get embellishment for a chord based on context
function getEmbellishment(
  key: string,
  degree: ScaleDegree,
  nextDegree: ScaleDegree | null,
  genreConfig: GenreConfig,
  mode: Mode = "ionian"
): BarChord | null {
  const modeConfig = getModeConfig(mode);
  const baseQuality = modeConfig.qualities[degree];
  const degreeName = modeConfig.degreeNames[degree];

  // V going to I - classic V7 -> I (works in most modes where V is major)
  if (degree === 4 && nextDegree === 0 && baseQuality === "major") {
    const root = getChordRoot(key, degree, mode);
    return { chordName: root + "7", degreeName: degreeName + "7" };
  }

  // Any major chord can become dominant 7 (especially at phrase ends)
  if (baseQuality === "major") {
    const root = getChordRoot(key, degree, mode);
    return { chordName: root + "7", degreeName: degreeName + "7" };
  }

  // Minor chords can become m7
  if (baseQuality === "minor") {
    const root = getChordRoot(key, degree, mode);
    return { chordName: root + "m7", degreeName: degreeName + "7" };
  }

  return null;
}

// Generate a chord progression using Markov chain with embellishments
export function generateProgression(
  key: string,
  genre: Genre,
  numBars: number,
  mode: Mode = "ionian"
): ProgressionBar[] {
  const matrix = transitionMatrices[genre];
  const genreConfig = genres.find(g => g.id === genre)!;
  const modeConfig = getModeConfig(mode);
  const use7ths = genreConfig.use7ths;

  // First pass: generate base progression
  // Always start on I (tonic) to establish the mode
  const degrees: ScaleDegree[] = [0];

  let currentDegree: ScaleDegree = 0;
  for (let i = 1; i < numBars; i++) {
    const nextDegree = sampleFromDistribution(matrix[currentDegree]) as ScaleDegree;
    degrees.push(nextDegree);
    currentDegree = nextDegree;
  }

  // Second pass: apply embellishments
  const progression: ProgressionBar[] = [];

  for (let i = 0; i < degrees.length; i++) {
    const degree = degrees[i];
    const nextDegree = i < degrees.length - 1 ? degrees[i + 1] : null;

    const baseChordName = getChordName(key, degree, use7ths, undefined, mode);
    const baseDegreeName = modeConfig.degreeNames[degree];
    const baseQuality = modeConfig.qualities[degree];

    // Check if V should always be V7 for this genre (only if V is major in this mode)
    if (degree === 4 && genreConfig.dominantAlways7 && !use7ths && baseQuality === "major") {
      const root = getChordRoot(key, degree, mode);
      progression.push({
        degree,
        chords: [{ chordName: root + "7", degreeName: modeConfig.degreeNames[4] + "7" }],
      });
      continue;
    }

    // Check for embellishment
    if (shouldEmbellish(i, numBars, genreConfig)) {
      const embellishment = getEmbellishment(key, degree, nextDegree, genreConfig, mode);
      if (embellishment && embellishment.chordName !== baseChordName) {
        progression.push({
          degree,
          chords: [
            { chordName: baseChordName, degreeName: baseDegreeName },
            embellishment,
          ],
        });
        continue;
      }
    }

    // No embellishment - single chord for the bar
    progression.push({
      degree,
      chords: [{ chordName: baseChordName, degreeName: baseDegreeName }],
    });
  }

  return progression;
}

export const keys = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const barOptions = [4, 8, 12, 16];

// ============ MELODY & BASS GENERATION ============

// Note within a melody or bass line
export type MelodyNote = {
  scaleDegree: number; // 0-6 for scale degrees
  octave: number; // octave offset (melody: 1-2, bass: -1)
  beat: number; // beat position within bar (0-based)
  duration: number; // in beats (0.5 = eighth, 1 = quarter, etc.)
};

export type MelodyBar = MelodyNote[];
export type BassBar = MelodyNote[];

// Get frequency for a scale degree in a key/mode
export function getScaleDegreeFrequency(
  key: string,
  degree: number,
  mode: Mode,
  octaveOffset: number = 0
): number {
  const keyIndex = chromaticNotes.indexOf(key);
  const modeConfig = getModeConfig(mode);
  const normalizedDegree = ((degree % 7) + 7) % 7; // Handle negative degrees
  const octaveFromDegree = Math.floor(degree / 7);
  const noteIndex = (keyIndex + modeConfig.intervals[normalizedDegree]) % 12;

  // Base frequency for C3 is 130.81 Hz
  const baseFrequencies: Record<string, number> = {
    "C": 130.81, "C#": 138.59, "D": 146.83, "D#": 155.56, "E": 164.81,
    "F": 174.61, "F#": 185.00, "G": 196.00, "G#": 207.65, "A": 220.00,
    "A#": 233.08, "B": 246.94
  };

  const noteName = chromaticNotes[noteIndex];
  const baseFreq = baseFrequencies[noteName];
  return baseFreq * Math.pow(2, octaveOffset + octaveFromDegree);
}

// Melody Markov matrices - probability of moving to next scale degree
// Rows: current degree (0-6), Columns: next degree (0-6)
const melodyMatrices: Record<Genre, number[][]> = {
  pop: [
    // Stepwise motion, simple patterns
    [0.15, 0.25, 0.15, 0.10, 0.15, 0.10, 0.10], // from 0
    [0.25, 0.10, 0.25, 0.15, 0.10, 0.10, 0.05], // from 1
    [0.15, 0.25, 0.10, 0.25, 0.10, 0.10, 0.05], // from 2
    [0.15, 0.15, 0.25, 0.10, 0.20, 0.10, 0.05], // from 3
    [0.20, 0.10, 0.10, 0.20, 0.10, 0.20, 0.10], // from 4
    [0.15, 0.10, 0.10, 0.15, 0.25, 0.10, 0.15], // from 5
    [0.30, 0.10, 0.10, 0.10, 0.15, 0.20, 0.05], // from 6
  ],
  jazz: [
    // More leaps, chromatic approach
    [0.10, 0.20, 0.15, 0.15, 0.20, 0.10, 0.10], // from 0
    [0.20, 0.10, 0.20, 0.15, 0.15, 0.10, 0.10], // from 1
    [0.15, 0.20, 0.10, 0.20, 0.15, 0.10, 0.10], // from 2
    [0.15, 0.15, 0.20, 0.10, 0.20, 0.10, 0.10], // from 3
    [0.20, 0.10, 0.15, 0.20, 0.10, 0.15, 0.10], // from 4
    [0.15, 0.10, 0.15, 0.15, 0.20, 0.10, 0.15], // from 5
    [0.25, 0.15, 0.10, 0.15, 0.15, 0.15, 0.05], // from 6
  ],
  blues: [
    // Pentatonic focus (degrees 0, 2, 3, 4, 6)
    [0.15, 0.05, 0.25, 0.20, 0.15, 0.05, 0.15], // from 0
    [0.25, 0.05, 0.25, 0.20, 0.15, 0.05, 0.05], // from 1
    [0.20, 0.05, 0.10, 0.25, 0.20, 0.05, 0.15], // from 2
    [0.20, 0.05, 0.20, 0.10, 0.25, 0.05, 0.15], // from 3
    [0.25, 0.05, 0.15, 0.25, 0.10, 0.05, 0.15], // from 4
    [0.20, 0.10, 0.20, 0.20, 0.20, 0.05, 0.05], // from 5
    [0.30, 0.05, 0.20, 0.20, 0.15, 0.05, 0.05], // from 6
  ],
  rock: [
    // Root/5th emphasis
    [0.20, 0.10, 0.15, 0.15, 0.25, 0.10, 0.05], // from 0
    [0.30, 0.10, 0.20, 0.15, 0.15, 0.05, 0.05], // from 1
    [0.20, 0.20, 0.10, 0.20, 0.20, 0.05, 0.05], // from 2
    [0.20, 0.15, 0.20, 0.10, 0.25, 0.05, 0.05], // from 3
    [0.30, 0.10, 0.15, 0.20, 0.10, 0.10, 0.05], // from 4
    [0.20, 0.15, 0.15, 0.15, 0.25, 0.05, 0.05], // from 5
    [0.40, 0.10, 0.15, 0.15, 0.15, 0.05, 0.00], // from 6
  ],
  classical: [
    // Voice leading rules
    [0.10, 0.25, 0.20, 0.15, 0.15, 0.10, 0.05], // from 0
    [0.25, 0.05, 0.25, 0.15, 0.15, 0.10, 0.05], // from 1
    [0.15, 0.25, 0.05, 0.25, 0.15, 0.10, 0.05], // from 2
    [0.15, 0.15, 0.25, 0.05, 0.25, 0.10, 0.05], // from 3
    [0.20, 0.10, 0.15, 0.25, 0.05, 0.20, 0.05], // from 4
    [0.15, 0.10, 0.15, 0.15, 0.25, 0.05, 0.15], // from 5
    [0.35, 0.15, 0.10, 0.10, 0.15, 0.15, 0.00], // from 6
  ],
};

// Bass patterns per genre - each pattern is [scaleDegree, beat] pairs
// These define typical bass movements within a bar
type BassPattern = { degrees: number[]; beats: number[] };

const bassPatterns: Record<Genre, BassPattern[]> = {
  pop: [
    { degrees: [0, 0, 4, 4], beats: [0, 2, 2.5, 3] }, // root-root-5th-5th
    { degrees: [0, 4, 0, 4], beats: [0, 1, 2, 3] }, // alternating root-5th
    { degrees: [0, 0, 0, 0], beats: [0, 1, 2, 3] }, // simple root
  ],
  jazz: [
    { degrees: [0, 2, 4, 6], beats: [0, 1, 2, 3] }, // walking up
    { degrees: [0, 4, 2, -1], beats: [0, 1, 2, 3] }, // root-5th-3rd-approach
    { degrees: [0, 2, 4, 2], beats: [0, 1, 2, 3] }, // 1-3-5-3
  ],
  blues: [
    { degrees: [0, 0, 4, 4], beats: [0, 1.5, 2, 3.5] }, // shuffle root-5th
    { degrees: [0, 2, 4, 6], beats: [0, 1, 2, 3] }, // walking
    { degrees: [0, 4, 0, -1], beats: [0, 1, 2, 3] }, // root-5th-root-approach
  ],
  rock: [
    { degrees: [0, 0, 0, 0], beats: [0, 1, 2, 3] }, // driving root
    { degrees: [0, 0, 4, 4], beats: [0, 1, 2, 3] }, // root-root-5th-5th
    { degrees: [0, 0, 0, 4], beats: [0, 0.5, 1, 1.5] }, // eighth note drive (half bar)
  ],
  classical: [
    { degrees: [0, 4, 2, 4], beats: [0, 1, 2, 3] }, // arpeggiated
    { degrees: [0, 0, 4, 0], beats: [0, 1, 2, 3] }, // waltz-like
    { degrees: [0, 2, 4, 2], beats: [0, 1, 2, 3] }, // alberti-ish
  ],
};

// Get chord tones for a scale degree (root=0, 3rd=2, 5th=4 relative to chord root)
function getChordTones(chordDegree: ScaleDegree): number[] {
  // Return scale degrees that are chord tones
  // For chord on degree X: root is X, third is X+2, fifth is X+4
  return [chordDegree, (chordDegree + 2) % 7, (chordDegree + 4) % 7];
}

// Generate melody for a progression
export function generateMelody(
  progression: ProgressionBar[],
  key: string,
  mode: Mode,
  genre: Genre,
  beatsPerBar: number = 4
): MelodyBar[] {
  const matrix = melodyMatrices[genre];
  const melody: MelodyBar[] = [];

  // Start on the root of the first chord
  let currentDegree = progression[0]?.degree ?? 0;

  for (let barIdx = 0; barIdx < progression.length; barIdx++) {
    const bar = progression[barIdx];
    const barMelody: MelodyNote[] = [];
    const chordTones = getChordTones(bar.degree);

    // Number of notes per bar varies by genre
    const notesPerBar = genre === "jazz" ? 8 : genre === "blues" ? 6 : 4;
    const noteDuration = beatsPerBar / notesPerBar;

    for (let noteIdx = 0; noteIdx < notesPerBar; noteIdx++) {
      const beat = noteIdx * noteDuration;
      const isStrongBeat = beat % 1 === 0 && (beat === 0 || beat === 2);

      // On strong beats, prefer chord tones
      if (isStrongBeat && Math.random() < 0.7) {
        // Pick a chord tone
        currentDegree = chordTones[Math.floor(Math.random() * chordTones.length)];
      } else {
        // Use Markov chain for next note
        const nextDegree = sampleFromDistribution(matrix[currentDegree]);
        currentDegree = nextDegree;
      }

      barMelody.push({
        scaleDegree: currentDegree,
        octave: 1, // One octave above bass
        beat,
        duration: noteDuration,
      });
    }

    melody.push(barMelody);
  }

  return melody;
}

// Generate bass line for a progression
export function generateBassLine(
  progression: ProgressionBar[],
  key: string,
  mode: Mode,
  genre: Genre,
  beatsPerBar: number = 4
): BassBar[] {
  const patterns = bassPatterns[genre];
  const bassLine: BassBar[] = [];

  for (let barIdx = 0; barIdx < progression.length; barIdx++) {
    const bar = progression[barIdx];
    const nextBar = progression[barIdx + 1];
    const barBass: MelodyNote[] = [];

    // Pick a random pattern for this bar
    const pattern = patterns[Math.floor(Math.random() * patterns.length)];

    for (let i = 0; i < pattern.degrees.length; i++) {
      let degree = pattern.degrees[i];
      const beat = pattern.beats[i];

      // If beat is beyond beatsPerBar, skip
      if (beat >= beatsPerBar) continue;

      // Approach note (-1 means approach next chord root from below)
      if (degree === -1 && nextBar) {
        degree = (nextBar.degree - 1 + 7) % 7;
      } else if (degree === -1) {
        degree = (bar.degree - 1 + 7) % 7;
      }

      // Transpose to chord root
      const absoluteDegree = (bar.degree + degree) % 7;

      // Calculate duration to next note
      const nextBeat = pattern.beats[i + 1] ?? beatsPerBar;
      const duration = nextBeat - beat;

      barBass.push({
        scaleDegree: absoluteDegree,
        octave: -1, // One octave below melody reference
        beat,
        duration,
      });
    }

    bassLine.push(barBass);
  }

  return bassLine;
}
