import { useState, useCallback } from "react";
import {
  chords,
  baseNotes,
  categories,
  categoryOrder,
  type Chord,
} from "../data/chordData";
import { getAudioContext, playChord } from "../lib/audio";

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
          <rect
            x={stringSpacing - 2}
            y={topPadding - 3}
            width={stringSpacing * stringCount + 4}
            height={4}
            fill="white"
            rx={2}
          />
        ) : (
          <text
            x={8}
            y={topPadding + fretSpacing / 2}
            fill="#a1a1aa"
            fontSize="10"
            textAnchor="middle"
          >
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
          const barreY =
            topPadding + (barreFret - chord.baseFret + 0.5) * fretSpacing;
          const startString = chord.frets.findIndex((f) => f === barreFret);
          const endString =
            chord.frets.length -
            1 -
            [...chord.frets].reverse().findIndex((f) => f === barreFret);
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
              <text
                key={stringIndex}
                x={x}
                y={topPadding - 10}
                fill="#ef4444"
                fontSize="12"
                textAnchor="middle"
                fontWeight="bold"
              >
                ×
              </text>
            );
          }

          if (fret === 0) {
            // Open string
            return (
              <circle
                key={stringIndex}
                cx={x}
                cy={topPadding - 10}
                r={4}
                fill="none"
                stroke="#4ade80"
                strokeWidth={2}
              />
            );
          }

          // Fretted note
          const y = topPadding + (fret - chord.baseFret + 0.5) * fretSpacing;
          const isBarre = chord.barres.includes(fret);

          if (isBarre && chord.frets.indexOf(fret) !== stringIndex) {
            return null; // Skip rendering individual dots for barre notes (except first)
          }

          return (
            <circle
              key={stringIndex}
              cx={x}
              cy={y}
              r={6}
              fill={isBarre ? "#f59e0b" : "#f59e0b"}
            />
          );
        })}
      </svg>
    </div>
  );
}

export function Chords() {
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [noteFilter, setNoteFilter] = useState<string | null>(null);
  const [openChordsOnly, setOpenChordsOnly] = useState<boolean>(true);
  const [playingChord, setPlayingChord] = useState<string | null>(null);

  const handlePlayChord = useCallback((chord: Chord) => {
    const ctx = getAudioContext();
    playChord(ctx, chord.frets);
    setPlayingChord(chord.name);
    setTimeout(() => setPlayingChord(null), 2000);
  }, []);

  const filteredChords = chords.filter((chord) => {
    if (categoryFilter !== "all" && chord.category !== categoryFilter)
      return false;
    if (noteFilter && chord.baseNote !== noteFilter) return false;
    if (openChordsOnly && chord.barres.length > 0) return false;
    return true;
  });

  // Sort: by base note first, then by category order
  const sortedChords = [...filteredChords].sort((a, b) => {
    const noteCompare =
      baseNotes.indexOf(a.baseNote) - baseNotes.indexOf(b.baseNote);
    if (noteCompare !== 0) return noteCompare;
    return (
      categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category)
    );
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
          {/* Open Chords Toggle */}
          <div className="flex justify-center mb-4">
            <button
              onClick={() => setOpenChordsOnly(!openChordsOnly)}
              className={`px-6 py-2 rounded-xl font-medium text-sm transition-all duration-300 flex items-center gap-2
                ${
                  openChordsOnly
                    ? "bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg"
                    : "bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700/50 hover:text-white"
                }`}
            >
              <span
                className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${openChordsOnly ? "border-white bg-white/20" : "border-zinc-500"}`}
              >
                {openChordsOnly && (
                  <span className="text-white text-xs">✓</span>
                )}
              </span>
              Open Chords Only
            </button>
          </div>

          {/* Category Filter */}
          <div className="flex flex-wrap justify-center gap-2 mb-4">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategoryFilter(cat.id)}
                className={`px-4 py-2 rounded-xl font-medium text-sm transition-all duration-300
                  ${
                    categoryFilter === cat.id
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
                ${
                  noteFilter === null
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
                  ${
                    noteFilter === note
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
          {sortedChords.map((chord) => {
            const isPlaying = playingChord === chord.name;
            return (
              <div
                key={chord.name}
                onClick={() => handlePlayChord(chord)}
                className={`backdrop-blur-xl bg-white/5 rounded-2xl border p-4 transition-all duration-300 cursor-pointer
                  ${
                    isPlaying
                      ? "bg-amber-500/20 border-amber-500/50 scale-105 shadow-lg shadow-amber-500/20"
                      : "border-white/10 hover:bg-white/10 hover:scale-105"
                  }`}
              >
                <div className="text-center mb-2">
                  <h3
                    className={`text-2xl font-black transition-colors ${isPlaying ? "text-amber-400" : "text-white"}`}
                  >
                    {chord.name}
                  </h3>
                  <p className="text-xs text-zinc-500">{chord.fullName}</p>
                </div>
                <ChordDiagram chord={chord} />
              </div>
            );
          })}
        </div>

        {/* Empty State */}
        {sortedChords.length === 0 && (
          <div className="text-center py-12">
            <p className="text-zinc-500">
              No chords found with current filters
            </p>
            <button
              onClick={() => setOpenChordsOnly(false)}
              className="mt-4 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm text-zinc-300 transition-colors"
            >
              Show barre chords too
            </button>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-zinc-600 text-xs mt-8 tracking-wide">
          {sortedChords.length} chords • Click to play
        </p>
      </div>
    </div>
  );
}
