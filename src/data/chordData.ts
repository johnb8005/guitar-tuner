export type Chord = {
  name: string;
  fullName: string;
  category:
    | "major"
    | "minor"
    | "7"
    | "maj7"
    | "m7"
    | "mMaj7"
    | "dim7"
    | "sus2"
    | "sus4";
  baseNote: string;
  frets: number[]; // -1 = muted, 0 = open, 1-12 = fret
  fingers: number[];
  baseFret: number;
  barres: number[];
};

export const baseNotes = [
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

// Barre chord shapes - defined once, applied to all notes
// Frets are relative to barre position (0 = barre fret)
type BarreShape = {
  category: Chord["category"];
  nameSuffix: string;
  fullNameSuffix: string;
  // Frets relative to barre: -1 = muted, 0 = barre fret, positive = offset from barre
  relativeFrets: number[];
  fingers: number[];
  barreStrings: number[]; // which strings are barred (0-indexed)
};

// E-shape barre chords (root on 6th string, like F)
// Base fret for each note: F=1, F#=2, G=3, G#=4, A=5, A#=6, B=7, C=8, C#=9, D=10, D#=11, E=12
const eShapeBaseFrets: Record<string, number> = {
  F: 1,
  "F#": 2,
  G: 3,
  "G#": 4,
  A: 5,
  "A#": 6,
  B: 7,
  C: 8,
  "C#": 9,
  D: 10,
  "D#": 11,
};

const eShapeChords: BarreShape[] = [
  {
    category: "major",
    nameSuffix: "",
    fullNameSuffix: "Major",
    relativeFrets: [0, 2, 2, 1, 0, 0],
    fingers: [1, 3, 4, 2, 1, 1],
    barreStrings: [0, 4, 5],
  },
  {
    category: "minor",
    nameSuffix: "m",
    fullNameSuffix: "Minor",
    relativeFrets: [0, 2, 2, 0, 0, 0],
    fingers: [1, 3, 4, 1, 1, 1],
    barreStrings: [0, 3, 4, 5],
  },
  {
    category: "7",
    nameSuffix: "7",
    fullNameSuffix: "Dominant 7",
    relativeFrets: [0, 2, 0, 1, 0, 0],
    fingers: [1, 3, 1, 2, 1, 1],
    barreStrings: [0, 2, 4, 5],
  },
  {
    category: "maj7",
    nameSuffix: "maj7",
    fullNameSuffix: "Major 7",
    relativeFrets: [0, 2, 1, 1, 0, 0],
    fingers: [1, 4, 2, 3, 1, 1],
    barreStrings: [0, 4, 5],
  },
  {
    category: "m7",
    nameSuffix: "m7",
    fullNameSuffix: "Minor 7",
    relativeFrets: [0, 2, 0, 0, 0, 0],
    fingers: [1, 3, 1, 1, 1, 1],
    barreStrings: [0, 2, 3, 4, 5],
  },
  {
    category: "mMaj7",
    nameSuffix: "mMaj7",
    fullNameSuffix: "Minor Major 7",
    relativeFrets: [0, 2, 1, 0, 0, 0],
    fingers: [1, 4, 2, 1, 1, 1],
    barreStrings: [0, 3, 4, 5],
  },
  {
    category: "dim7",
    nameSuffix: "dim7",
    fullNameSuffix: "Diminished 7",
    relativeFrets: [0, 1, 2, 0, 2, 0],
    fingers: [1, 2, 3, 1, 4, 1],
    barreStrings: [0, 3, 5],
  },
  {
    category: "sus2",
    nameSuffix: "sus2",
    fullNameSuffix: "Suspended 2",
    relativeFrets: [0, 2, 4, 4, 0, 0],
    fingers: [1, 2, 3, 4, 1, 1],
    barreStrings: [0, 4, 5],
  },
  {
    category: "sus4",
    nameSuffix: "sus4",
    fullNameSuffix: "Suspended 4",
    relativeFrets: [0, 2, 2, 2, 0, 0],
    fingers: [1, 2, 3, 4, 1, 1],
    barreStrings: [0, 4, 5],
  },
];

// A-shape barre chords (root on 5th string, like B)
// Base fret for each note: A#=1, B=2, C=3, C#=4, D=5, D#=6, E=7, F=8, F#=9, G=10, G#=11
const aShapeBaseFrets: Record<string, number> = {
  "A#": 1,
  B: 2,
  C: 3,
  "C#": 4,
  D: 5,
  "D#": 6,
  F: 8,
  "F#": 9,
  G: 10,
  "G#": 11,
};

const aShapeChords: BarreShape[] = [
  {
    category: "major",
    nameSuffix: "",
    fullNameSuffix: "Major",
    relativeFrets: [-1, 0, 2, 2, 2, 0],
    fingers: [0, 1, 2, 3, 4, 1],
    barreStrings: [1, 5],
  },
  {
    category: "minor",
    nameSuffix: "m",
    fullNameSuffix: "Minor",
    relativeFrets: [-1, 0, 2, 2, 1, 0],
    fingers: [0, 1, 3, 4, 2, 1],
    barreStrings: [1, 5],
  },
  {
    category: "7",
    nameSuffix: "7",
    fullNameSuffix: "Dominant 7",
    relativeFrets: [-1, 0, 2, 0, 2, 0],
    fingers: [0, 1, 3, 1, 4, 1],
    barreStrings: [1, 3, 5],
  },
  {
    category: "maj7",
    nameSuffix: "maj7",
    fullNameSuffix: "Major 7",
    relativeFrets: [-1, 0, 2, 1, 2, 0],
    fingers: [0, 1, 3, 2, 4, 1],
    barreStrings: [1, 5],
  },
  {
    category: "m7",
    nameSuffix: "m7",
    fullNameSuffix: "Minor 7",
    relativeFrets: [-1, 0, 2, 0, 1, 0],
    fingers: [0, 1, 3, 1, 2, 1],
    barreStrings: [1, 3, 5],
  },
  {
    category: "mMaj7",
    nameSuffix: "mMaj7",
    fullNameSuffix: "Minor Major 7",
    relativeFrets: [-1, 0, 2, 1, 1, 0],
    fingers: [0, 1, 4, 2, 3, 1],
    barreStrings: [1, 5],
  },
  {
    category: "dim7",
    nameSuffix: "dim7",
    fullNameSuffix: "Diminished 7",
    relativeFrets: [-1, 0, 1, 2, 1, 2],
    fingers: [0, 1, 2, 4, 3, 4],
    barreStrings: [],
  },
  {
    category: "sus2",
    nameSuffix: "sus2",
    fullNameSuffix: "Suspended 2",
    relativeFrets: [-1, 0, 2, 2, 0, 0],
    fingers: [0, 1, 3, 4, 1, 1],
    barreStrings: [1, 4, 5],
  },
  {
    category: "sus4",
    nameSuffix: "sus4",
    fullNameSuffix: "Suspended 4",
    relativeFrets: [-1, 0, 2, 2, 3, 0],
    fingers: [0, 1, 2, 3, 4, 1],
    barreStrings: [1, 5],
  },
];

// Generate barre chord from shape
function generateBarreChord(
  note: string,
  baseFret: number,
  shape: BarreShape,
): Chord {
  const frets = shape.relativeFrets.map((f) => (f === -1 ? -1 : f + baseFret));
  const barres = shape.barreStrings.length > 0 ? [baseFret] : [];

  return {
    name: note + shape.nameSuffix,
    fullName: note + " " + shape.fullNameSuffix,
    category: shape.category,
    baseNote: note,
    frets,
    fingers: shape.fingers,
    baseFret,
    barres,
  };
}

// Open chords - defined explicitly (no barres)
const openChords: Chord[] = [
  // C chords
  {
    name: "C",
    fullName: "C Major",
    category: "major",
    baseNote: "C",
    frets: [-1, 3, 2, 0, 1, 0],
    fingers: [0, 3, 2, 0, 1, 0],
    baseFret: 1,
    barres: [],
  },
  {
    name: "C7",
    fullName: "C Dominant 7",
    category: "7",
    baseNote: "C",
    frets: [-1, 3, 2, 3, 1, 0],
    fingers: [0, 3, 2, 4, 1, 0],
    baseFret: 1,
    barres: [],
  },
  {
    name: "Cmaj7",
    fullName: "C Major 7",
    category: "maj7",
    baseNote: "C",
    frets: [-1, 3, 2, 0, 0, 0],
    fingers: [0, 3, 2, 0, 0, 0],
    baseFret: 1,
    barres: [],
  },
  {
    name: "Csus2",
    fullName: "C Suspended 2",
    category: "sus2",
    baseNote: "C",
    frets: [-1, 3, 0, 0, 1, 3],
    fingers: [0, 2, 0, 0, 1, 3],
    baseFret: 1,
    barres: [],
  },
  {
    name: "Csus4",
    fullName: "C Suspended 4",
    category: "sus4",
    baseNote: "C",
    frets: [-1, 3, 3, 0, 1, 1],
    fingers: [0, 3, 4, 0, 1, 2],
    baseFret: 1,
    barres: [],
  },

  // D chords
  {
    name: "D",
    fullName: "D Major",
    category: "major",
    baseNote: "D",
    frets: [-1, -1, 0, 2, 3, 2],
    fingers: [0, 0, 0, 1, 3, 2],
    baseFret: 1,
    barres: [],
  },
  {
    name: "Dm",
    fullName: "D Minor",
    category: "minor",
    baseNote: "D",
    frets: [-1, -1, 0, 2, 3, 1],
    fingers: [0, 0, 0, 2, 3, 1],
    baseFret: 1,
    barres: [],
  },
  {
    name: "D7",
    fullName: "D Dominant 7",
    category: "7",
    baseNote: "D",
    frets: [-1, -1, 0, 2, 1, 2],
    fingers: [0, 0, 0, 2, 1, 3],
    baseFret: 1,
    barres: [],
  },
  {
    name: "Dmaj7",
    fullName: "D Major 7",
    category: "maj7",
    baseNote: "D",
    frets: [-1, -1, 0, 2, 2, 2],
    fingers: [0, 0, 0, 1, 2, 3],
    baseFret: 1,
    barres: [],
  },
  {
    name: "Dm7",
    fullName: "D Minor 7",
    category: "m7",
    baseNote: "D",
    frets: [-1, -1, 0, 2, 1, 1],
    fingers: [0, 0, 0, 2, 1, 1],
    baseFret: 1,
    barres: [],
  },
  {
    name: "DmMaj7",
    fullName: "D Minor Major 7",
    category: "mMaj7",
    baseNote: "D",
    frets: [-1, -1, 0, 2, 2, 1],
    fingers: [0, 0, 0, 2, 3, 1],
    baseFret: 1,
    barres: [],
  },
  {
    name: "Ddim7",
    fullName: "D Diminished 7",
    category: "dim7",
    baseNote: "D",
    frets: [-1, -1, 0, 1, 0, 1],
    fingers: [0, 0, 0, 1, 0, 2],
    baseFret: 1,
    barres: [],
  },
  {
    name: "Dsus2",
    fullName: "D Suspended 2",
    category: "sus2",
    baseNote: "D",
    frets: [-1, -1, 0, 2, 3, 0],
    fingers: [0, 0, 0, 1, 2, 0],
    baseFret: 1,
    barres: [],
  },
  {
    name: "Dsus4",
    fullName: "D Suspended 4",
    category: "sus4",
    baseNote: "D",
    frets: [-1, -1, 0, 2, 3, 3],
    fingers: [0, 0, 0, 1, 2, 3],
    baseFret: 1,
    barres: [],
  },

  // E chords
  {
    name: "E",
    fullName: "E Major",
    category: "major",
    baseNote: "E",
    frets: [0, 2, 2, 1, 0, 0],
    fingers: [0, 2, 3, 1, 0, 0],
    baseFret: 1,
    barres: [],
  },
  {
    name: "Em",
    fullName: "E Minor",
    category: "minor",
    baseNote: "E",
    frets: [0, 2, 2, 0, 0, 0],
    fingers: [0, 2, 3, 0, 0, 0],
    baseFret: 1,
    barres: [],
  },
  {
    name: "E7",
    fullName: "E Dominant 7",
    category: "7",
    baseNote: "E",
    frets: [0, 2, 0, 1, 0, 0],
    fingers: [0, 2, 0, 1, 0, 0],
    baseFret: 1,
    barres: [],
  },
  {
    name: "Emaj7",
    fullName: "E Major 7",
    category: "maj7",
    baseNote: "E",
    frets: [0, 2, 1, 1, 0, 0],
    fingers: [0, 3, 1, 2, 0, 0],
    baseFret: 1,
    barres: [],
  },
  {
    name: "Em7",
    fullName: "E Minor 7",
    category: "m7",
    baseNote: "E",
    frets: [0, 2, 0, 0, 0, 0],
    fingers: [0, 1, 0, 0, 0, 0],
    baseFret: 1,
    barres: [],
  },
  {
    name: "EmMaj7",
    fullName: "E Minor Major 7",
    category: "mMaj7",
    baseNote: "E",
    frets: [0, 2, 1, 0, 0, 0],
    fingers: [0, 2, 1, 0, 0, 0],
    baseFret: 1,
    barres: [],
  },
  {
    name: "Edim7",
    fullName: "E Diminished 7",
    category: "dim7",
    baseNote: "E",
    frets: [0, 1, 2, 0, 2, 0],
    fingers: [0, 1, 2, 0, 3, 0],
    baseFret: 1,
    barres: [],
  },
  {
    name: "Esus2",
    fullName: "E Suspended 2",
    category: "sus2",
    baseNote: "E",
    frets: [0, 2, 4, 4, 0, 0],
    fingers: [0, 1, 3, 4, 0, 0],
    baseFret: 1,
    barres: [],
  },
  {
    name: "Esus4",
    fullName: "E Suspended 4",
    category: "sus4",
    baseNote: "E",
    frets: [0, 2, 2, 2, 0, 0],
    fingers: [0, 2, 3, 4, 0, 0],
    baseFret: 1,
    barres: [],
  },

  // G chords
  {
    name: "G",
    fullName: "G Major",
    category: "major",
    baseNote: "G",
    frets: [3, 2, 0, 0, 0, 3],
    fingers: [2, 1, 0, 0, 0, 3],
    baseFret: 1,
    barres: [],
  },
  {
    name: "G7",
    fullName: "G Dominant 7",
    category: "7",
    baseNote: "G",
    frets: [3, 2, 0, 0, 0, 1],
    fingers: [3, 2, 0, 0, 0, 1],
    baseFret: 1,
    barres: [],
  },
  {
    name: "Gmaj7",
    fullName: "G Major 7",
    category: "maj7",
    baseNote: "G",
    frets: [3, 2, 0, 0, 0, 2],
    fingers: [3, 1, 0, 0, 0, 2],
    baseFret: 1,
    barres: [],
  },
  {
    name: "Gsus2",
    fullName: "G Suspended 2",
    category: "sus2",
    baseNote: "G",
    frets: [3, 0, 0, 0, 3, 3],
    fingers: [1, 0, 0, 0, 2, 3],
    baseFret: 1,
    barres: [],
  },
  {
    name: "Gsus4",
    fullName: "G Suspended 4",
    category: "sus4",
    baseNote: "G",
    frets: [3, 3, 0, 0, 1, 3],
    fingers: [2, 3, 0, 0, 1, 4],
    baseFret: 1,
    barres: [],
  },

  // A chords
  {
    name: "A",
    fullName: "A Major",
    category: "major",
    baseNote: "A",
    frets: [-1, 0, 2, 2, 2, 0],
    fingers: [0, 0, 1, 2, 3, 0],
    baseFret: 1,
    barres: [],
  },
  {
    name: "Am",
    fullName: "A Minor",
    category: "minor",
    baseNote: "A",
    frets: [-1, 0, 2, 2, 1, 0],
    fingers: [0, 0, 2, 3, 1, 0],
    baseFret: 1,
    barres: [],
  },
  {
    name: "A7",
    fullName: "A Dominant 7",
    category: "7",
    baseNote: "A",
    frets: [-1, 0, 2, 0, 2, 0],
    fingers: [0, 0, 1, 0, 2, 0],
    baseFret: 1,
    barres: [],
  },
  {
    name: "Amaj7",
    fullName: "A Major 7",
    category: "maj7",
    baseNote: "A",
    frets: [-1, 0, 2, 1, 2, 0],
    fingers: [0, 0, 2, 1, 3, 0],
    baseFret: 1,
    barres: [],
  },
  {
    name: "Am7",
    fullName: "A Minor 7",
    category: "m7",
    baseNote: "A",
    frets: [-1, 0, 2, 0, 1, 0],
    fingers: [0, 0, 2, 0, 1, 0],
    baseFret: 1,
    barres: [],
  },
  {
    name: "AmMaj7",
    fullName: "A Minor Major 7",
    category: "mMaj7",
    baseNote: "A",
    frets: [-1, 0, 2, 1, 1, 0],
    fingers: [0, 0, 3, 1, 2, 0],
    baseFret: 1,
    barres: [],
  },
  {
    name: "Adim7",
    fullName: "A Diminished 7",
    category: "dim7",
    baseNote: "A",
    frets: [-1, 0, 1, 2, 1, 2],
    fingers: [0, 0, 1, 3, 2, 4],
    baseFret: 1,
    barres: [],
  },
  {
    name: "Asus2",
    fullName: "A Suspended 2",
    category: "sus2",
    baseNote: "A",
    frets: [-1, 0, 2, 2, 0, 0],
    fingers: [0, 0, 1, 2, 0, 0],
    baseFret: 1,
    barres: [],
  },
  {
    name: "Asus4",
    fullName: "A Suspended 4",
    category: "sus4",
    baseNote: "A",
    frets: [-1, 0, 2, 2, 3, 0],
    fingers: [0, 0, 1, 2, 3, 0],
    baseFret: 1,
    barres: [],
  },

  // B7 open voicing
  {
    name: "B7",
    fullName: "B Dominant 7",
    category: "7",
    baseNote: "B",
    frets: [-1, 2, 1, 2, 0, 2],
    fingers: [0, 2, 1, 3, 0, 4],
    baseFret: 1,
    barres: [],
  },
];

// Generate all barre chords, avoiding duplicates (prefer lower fret positions)
function generateBarreChords(): Chord[] {
  const chordMap = new Map<string, Chord>();

  // E-shape barre chords first
  for (const [note, baseFret] of Object.entries(eShapeBaseFrets)) {
    for (const shape of eShapeChords) {
      const chord = generateBarreChord(note, baseFret, shape);
      // Only add if we don't have this chord yet, or if this position is lower
      const existing = chordMap.get(chord.name);
      if (!existing || baseFret < existing.baseFret) {
        chordMap.set(chord.name, chord);
      }
    }
  }

  // A-shape barre chords (will only add if lower position or not exists)
  for (const [note, baseFret] of Object.entries(aShapeBaseFrets)) {
    for (const shape of aShapeChords) {
      const chord = generateBarreChord(note, baseFret, shape);
      const existing = chordMap.get(chord.name);
      if (!existing || baseFret < existing.baseFret) {
        chordMap.set(chord.name, chord);
      }
    }
  }

  return Array.from(chordMap.values());
}

// Combine open and barre chords, removing duplicates (prefer open voicings)
const barreChords = generateBarreChords();
const openChordNames = new Set(openChords.map((c) => c.name));

export const chords: Chord[] = [
  ...openChords,
  ...barreChords.filter((c) => !openChordNames.has(c.name)),
];

export const categories = [
  { id: "all", label: "All" },
  { id: "major", label: "Major" },
  { id: "minor", label: "Minor" },
  { id: "7", label: "7" },
  { id: "maj7", label: "Maj7" },
  { id: "m7", label: "m7" },
  { id: "mMaj7", label: "mMaj7" },
  { id: "dim7", label: "dim7" },
  { id: "sus2", label: "Sus2" },
  { id: "sus4", label: "Sus4" },
];

export const categoryOrder = [
  "major",
  "minor",
  "7",
  "maj7",
  "m7",
  "mMaj7",
  "dim7",
  "sus2",
  "sus4",
];
