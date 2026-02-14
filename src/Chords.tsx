import { useState } from "react";

type Chord = {
  name: string;
  fullName: string;
  category: "major" | "minor" | "7" | "sus" | "other";
  baseNote: string;
  frets: number[]; // -1 = muted, 0 = open, 1-12 = fret
  fingers: number[];
  baseFret: number;
  barres: number[];
};

const chords: Chord[] = [
  // C chords
  { name: "C", fullName: "C Major", category: "major", baseNote: "C", frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0], baseFret: 1, barres: [] },
  { name: "Cm", fullName: "C Minor", category: "minor", baseNote: "C", frets: [-1, 3, 5, 5, 4, 3], fingers: [0, 1, 3, 4, 2, 1], baseFret: 3, barres: [3] },
  { name: "C7", fullName: "C Dominant 7", category: "7", baseNote: "C", frets: [-1, 3, 2, 3, 1, 0], fingers: [0, 3, 2, 4, 1, 0], baseFret: 1, barres: [] },
  { name: "Csus4", fullName: "C Suspended 4", category: "sus", baseNote: "C", frets: [-1, 3, 3, 0, 1, 1], fingers: [0, 3, 4, 0, 1, 1], baseFret: 1, barres: [] },

  // D chords
  { name: "D", fullName: "D Major", category: "major", baseNote: "D", frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2], baseFret: 1, barres: [] },
  { name: "Dm", fullName: "D Minor", category: "minor", baseNote: "D", frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1], baseFret: 1, barres: [] },
  { name: "D7", fullName: "D Dominant 7", category: "7", baseNote: "D", frets: [-1, -1, 0, 2, 1, 2], fingers: [0, 0, 0, 2, 1, 3], baseFret: 1, barres: [] },
  { name: "Dsus4", fullName: "D Suspended 4", category: "sus", baseNote: "D", frets: [-1, -1, 0, 2, 3, 3], fingers: [0, 0, 0, 1, 2, 3], baseFret: 1, barres: [] },

  // E chords
  { name: "E", fullName: "E Major", category: "major", baseNote: "E", frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0], baseFret: 1, barres: [] },
  { name: "Em", fullName: "E Minor", category: "minor", baseNote: "E", frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0], baseFret: 1, barres: [] },
  { name: "E7", fullName: "E Dominant 7", category: "7", baseNote: "E", frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0], baseFret: 1, barres: [] },
  { name: "Esus4", fullName: "E Suspended 4", category: "sus", baseNote: "E", frets: [0, 2, 2, 2, 0, 0], fingers: [0, 2, 3, 4, 0, 0], baseFret: 1, barres: [] },

  // F chords
  { name: "F", fullName: "F Major", category: "major", baseNote: "F", frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1], baseFret: 1, barres: [1] },
  { name: "Fm", fullName: "F Minor", category: "minor", baseNote: "F", frets: [1, 3, 3, 1, 1, 1], fingers: [1, 3, 4, 1, 1, 1], baseFret: 1, barres: [1] },
  { name: "F7", fullName: "F Dominant 7", category: "7", baseNote: "F", frets: [1, 3, 1, 2, 1, 1], fingers: [1, 3, 1, 2, 1, 1], baseFret: 1, barres: [1] },
  { name: "Fsus4", fullName: "F Suspended 4", category: "sus", baseNote: "F", frets: [1, 3, 3, 3, 1, 1], fingers: [1, 2, 3, 4, 1, 1], baseFret: 1, barres: [1] },

  // G chords
  { name: "G", fullName: "G Major", category: "major", baseNote: "G", frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, 0, 0, 0, 3], baseFret: 1, barres: [] },
  { name: "Gm", fullName: "G Minor", category: "minor", baseNote: "G", frets: [3, 5, 5, 3, 3, 3], fingers: [1, 3, 4, 1, 1, 1], baseFret: 3, barres: [3] },
  { name: "G7", fullName: "G Dominant 7", category: "7", baseNote: "G", frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1], baseFret: 1, barres: [] },
  { name: "Gsus4", fullName: "G Suspended 4", category: "sus", baseNote: "G", frets: [3, 3, 0, 0, 1, 3], fingers: [2, 3, 0, 0, 1, 4], baseFret: 1, barres: [] },

  // A chords
  { name: "A", fullName: "A Major", category: "major", baseNote: "A", frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0], baseFret: 1, barres: [] },
  { name: "Am", fullName: "A Minor", category: "minor", baseNote: "A", frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0], baseFret: 1, barres: [] },
  { name: "A7", fullName: "A Dominant 7", category: "7", baseNote: "A", frets: [-1, 0, 2, 0, 2, 0], fingers: [0, 0, 1, 0, 2, 0], baseFret: 1, barres: [] },
  { name: "Asus4", fullName: "A Suspended 4", category: "sus", baseNote: "A", frets: [-1, 0, 2, 2, 3, 0], fingers: [0, 0, 1, 2, 3, 0], baseFret: 1, barres: [] },

  // B chords
  { name: "B", fullName: "B Major", category: "major", baseNote: "B", frets: [-1, 2, 4, 4, 4, 2], fingers: [0, 1, 2, 3, 4, 1], baseFret: 2, barres: [2] },
  { name: "Bm", fullName: "B Minor", category: "minor", baseNote: "B", frets: [-1, 2, 4, 4, 3, 2], fingers: [0, 1, 3, 4, 2, 1], baseFret: 2, barres: [2] },
  { name: "B7", fullName: "B Dominant 7", category: "7", baseNote: "B", frets: [-1, 2, 1, 2, 0, 2], fingers: [0, 2, 1, 3, 0, 4], baseFret: 1, barres: [] },
  { name: "Bsus4", fullName: "B Suspended 4", category: "sus", baseNote: "B", frets: [-1, 2, 4, 4, 5, 2], fingers: [0, 1, 2, 3, 4, 1], baseFret: 2, barres: [2] },
];

const baseNotes = ["C", "D", "E", "F", "G", "A", "B"];
const categories = [
  { id: "all", label: "All" },
  { id: "major", label: "Major" },
  { id: "minor", label: "Minor" },
  { id: "7", label: "7th" },
  { id: "sus", label: "Sus" },
];

function ChordDiagram({ chord }: { chord: Chord }) {
  const stringCount = 6;
  const fretCount = 4;
  const width = 100;
  const height = 120;
  const stringSpacing = width / (stringCount + 1);
  const fretSpacing = (height - 30) / fretCount;
  const topPadding = 25;

  const minFret = Math.min(...chord.frets.filter((f) => f > 0));
  const showBaseFret = minFret > 1 && chord.baseFret > 1;

  return (
    <div className="relative">
      <svg width={width} height={height} className="mx-auto">
        {/* Nut or fret indicator */}
        {!showBaseFret ? (
          <rect x={stringSpacing - 2} y={topPadding - 3} width={stringSpacing * stringCount + 4} height={4} fill="white" rx={2} />
        ) : (
          <text x={8} y={topPadding + fretSpacing / 2} fill="#a1a1aa" fontSize="10" textAnchor="middle">
            {chord.baseFret}fr
          </text>
        )}

        {/* Frets */}
        {Array.from({ length: fretCount + 1 }).map((_, i) => (
          <line
            key={`fret-${i}`}
            x1={stringSpacing}
            y1={topPadding + i * fretSpacing}
            x2={stringSpacing * stringCount}
            y2={topPadding + i * fretSpacing}
            stroke="rgba(255,255,255,0.3)"
            strokeWidth={i === 0 ? 2 : 1}
          />
        ))}

        {/* Strings */}
        {Array.from({ length: stringCount }).map((_, i) => (
          <line
            key={`string-${i}`}
            x1={stringSpacing * (i + 1)}
            y1={topPadding}
            x2={stringSpacing * (i + 1)}
            y2={topPadding + fretCount * fretSpacing}
            stroke="rgba(255,255,255,0.5)"
            strokeWidth={1 + i * 0.15}
          />
        ))}

        {/* Barres */}
        {chord.barres.map((barreFret) => {
          const barreY = topPadding + (barreFret - chord.baseFret + 0.5) * fretSpacing;
          const startString = chord.frets.findIndex((f) => f === barreFret);
          const endString = chord.frets.length - 1 - [...chord.frets].reverse().findIndex((f) => f === barreFret);
          return (
            <rect
              key={`barre-${barreFret}`}
              x={stringSpacing * (startString + 1) - 6}
              y={barreY - 6}
              width={stringSpacing * (endString - startString) + 12}
              height={12}
              fill="#f59e0b"
              rx={6}
            />
          );
        })}

        {/* Finger positions */}
        {chord.frets.map((fret, stringIndex) => {
          const x = stringSpacing * (stringIndex + 1);

          if (fret === -1) {
            // Muted string
            return (
              <text key={stringIndex} x={x} y={topPadding - 10} fill="#ef4444" fontSize="12" textAnchor="middle" fontWeight="bold">
                ×
              </text>
            );
          }

          if (fret === 0) {
            // Open string
            return (
              <circle key={stringIndex} cx={x} cy={topPadding - 10} r={4} fill="none" stroke="#4ade80" strokeWidth={2} />
            );
          }

          // Fretted note
          const y = topPadding + (fret - chord.baseFret + 0.5) * fretSpacing;
          const isBarre = chord.barres.includes(fret);

          if (isBarre && chord.frets.indexOf(fret) !== stringIndex) {
            return null; // Skip rendering individual dots for barre notes (except first)
          }

          return (
            <circle key={stringIndex} cx={x} cy={y} r={6} fill={isBarre ? "#f59e0b" : "#f59e0b"} />
          );
        })}
      </svg>
    </div>
  );
}

export function Chords() {
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [noteFilter, setNoteFilter] = useState<string | null>(null);

  const filteredChords = chords.filter((chord) => {
    if (categoryFilter !== "all" && chord.category !== categoryFilter) return false;
    if (noteFilter && chord.baseNote !== noteFilter) return false;
    return true;
  });

  // Sort: by base note first, then by category order
  const categoryOrder = ["major", "minor", "7", "sus", "other"];
  const sortedChords = [...filteredChords].sort((a, b) => {
    const noteCompare = baseNotes.indexOf(a.baseNote) - baseNotes.indexOf(b.baseNote);
    if (noteCompare !== 0) return noteCompare;
    return categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category);
  });

  return (
    <div className="flex flex-col items-center min-h-[calc(100vh-4rem)] p-4 sm:p-6">
      <div className="w-full max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl sm:text-6xl font-black mb-3 bg-gradient-to-r from-violet-400 via-purple-400 to-fuchsia-500 bg-clip-text text-transparent drop-shadow-2xl tracking-tight">
            CHORDS
          </h1>
          <p className="text-zinc-500 text-sm tracking-wide uppercase">
            Guitar chord library
          </p>
        </div>

        {/* Filters */}
        <div className="backdrop-blur-xl bg-white/5 rounded-2xl border border-white/10 p-4 mb-6">
          {/* Category Filter */}
          <div className="flex flex-wrap justify-center gap-2 mb-4">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategoryFilter(cat.id)}
                className={`px-4 py-2 rounded-xl font-medium text-sm transition-all duration-300
                  ${categoryFilter === cat.id
                    ? "bg-gradient-to-r from-violet-500 to-purple-500 text-white shadow-lg"
                    : "bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700/50 hover:text-white"
                  }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Base Note Filter */}
          <div className="flex flex-wrap justify-center gap-2">
            <button
              onClick={() => setNoteFilter(null)}
              className={`w-10 h-10 rounded-xl font-bold text-sm transition-all duration-300
                ${noteFilter === null
                  ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg"
                  : "bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700/50 hover:text-white"
                }`}
            >
              All
            </button>
            {baseNotes.map((note) => (
              <button
                key={note}
                onClick={() => setNoteFilter(note)}
                className={`w-10 h-10 rounded-xl font-bold text-sm transition-all duration-300
                  ${noteFilter === note
                    ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg"
                    : "bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700/50 hover:text-white"
                  }`}
              >
                {note}
              </button>
            ))}
          </div>
        </div>

        {/* Chords Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {sortedChords.map((chord) => (
            <div
              key={chord.name}
              className="backdrop-blur-xl bg-white/5 rounded-2xl border border-white/10 p-4 hover:bg-white/10 transition-all duration-300 hover:scale-105 cursor-pointer"
            >
              <div className="text-center mb-2">
                <h3 className="text-2xl font-black text-white">{chord.name}</h3>
                <p className="text-xs text-zinc-500">{chord.fullName}</p>
              </div>
              <ChordDiagram chord={chord} />
            </div>
          ))}
        </div>

        {/* Empty State */}
        {sortedChords.length === 0 && (
          <div className="text-center py-12">
            <p className="text-zinc-500">No chords found with current filters</p>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-zinc-600 text-xs mt-8 tracking-wide">
          Click on a chord to hear it (coming soon)
        </p>
      </div>
    </div>
  );
}
