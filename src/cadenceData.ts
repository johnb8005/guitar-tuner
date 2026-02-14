// Cadence generator with Markov transition matrices per genre

// Scale degrees (0-indexed for array access)
// 0=I, 1=ii, 2=iii, 3=IV, 4=V, 5=vi, 6=vii°
export type ScaleDegree = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const degreeNames = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];

// Map scale degree to chord quality for major key
// I=maj, ii=min, iii=min, IV=maj, V=maj, vi=min, vii°=dim
export const degreeQualities: ("major" | "minor" | "dim7")[] = [
  "major", "minor", "minor", "major", "major", "minor", "dim7"
];

// For jazz, we use 7th chords
export const degreeQualities7th: ("maj7" | "m7" | "m7" | "maj7" | "7" | "m7" | "m7b5")[] = [
  "maj7", "m7", "m7", "maj7", "7", "m7", "m7b5"
];

// Chromatic notes for transposition
const chromaticNotes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Major scale intervals (semitones from root)
const majorScaleIntervals = [0, 2, 4, 5, 7, 9, 11];

// Get the root note for a scale degree in a given key
export function getChordRoot(key: string, degree: ScaleDegree): string {
  const keyIndex = chromaticNotes.indexOf(key);
  const noteIndex = (keyIndex + majorScaleIntervals[degree]) % 12;
  return chromaticNotes[noteIndex];
}

// Get full chord name for a scale degree in a key
export function getChordName(key: string, degree: ScaleDegree, use7ths: boolean = false): string {
  const root = getChordRoot(key, degree);
  const quality = use7ths ? degreeQualities7th[degree] : degreeQualities[degree];

  switch (quality) {
    case "major": return root;
    case "minor": return root + "m";
    case "dim7": return root + "dim7";
    case "maj7": return root + "maj7";
    case "m7": return root + "m7";
    case "7": return root + "7";
    case "m7b5": return root + "m7"; // Simplify for available chords
    default: return root;
  }
}

// Markov transition matrices per genre
// Each row is current chord (I, ii, iii, IV, V, vi, vii°)
// Each column is probability of next chord
// Rows must sum to 1.0

export type Genre = "pop" | "jazz" | "blues" | "rock" | "classical";

export const genres: { id: Genre; name: string; description: string; use7ths: boolean }[] = [
  { id: "pop", name: "Pop", description: "I-IV-V-vi progressions", use7ths: false },
  { id: "jazz", name: "Jazz", description: "ii-V-I with 7th chords", use7ths: true },
  { id: "blues", name: "Blues", description: "12-bar dominant feel", use7ths: false },
  { id: "rock", name: "Rock", description: "Power progressions", use7ths: false },
  { id: "classical", name: "Classical", description: "Voice-leading focused", use7ths: false },
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

// Generate a chord progression using Markov chain
export function generateProgression(
  key: string,
  genre: Genre,
  numBars: number
): { degree: ScaleDegree; chordName: string; degreeName: string }[] {
  const matrix = transitionMatrices[genre];
  const startProbs = startingProbabilities[genre];
  const genreConfig = genres.find(g => g.id === genre)!;
  const use7ths = genreConfig.use7ths;

  const progression: { degree: ScaleDegree; chordName: string; degreeName: string }[] = [];

  // Pick starting chord
  let currentDegree = sampleFromDistribution(startProbs) as ScaleDegree;
  progression.push({
    degree: currentDegree,
    chordName: getChordName(key, currentDegree, use7ths),
    degreeName: degreeNames[currentDegree],
  });

  // Generate remaining chords
  for (let i = 1; i < numBars; i++) {
    const nextDegree = sampleFromDistribution(matrix[currentDegree]) as ScaleDegree;
    progression.push({
      degree: nextDegree,
      chordName: getChordName(key, nextDegree, use7ths),
      degreeName: degreeNames[nextDegree],
    });
    currentDegree = nextDegree;
  }

  return progression;
}

export const keys = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const barOptions = [4, 8, 12, 16];
