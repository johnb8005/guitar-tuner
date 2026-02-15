import { type BassBar, type Mode } from "./cadenceData";

// Bass string tunings (MIDI note numbers) - Standard 4-string: E-A-D-G
const BASS_STRINGS = [
  { name: "G", midi: 43 }, // G2
  { name: "D", midi: 38 }, // D2
  { name: "A", midi: 33 }, // A1
  { name: "E", midi: 28 }, // E1 (lowest)
];

// Key to semitone offset from C
const KEY_OFFSETS: Record<string, number> = {
  "C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3,
  "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8,
  "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11,
};

// Mode intervals (semitones from root)
const MODE_INTERVALS: Record<Mode, number[]> = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
};

// Convert scale degree to MIDI note
// Bass octave is -1 in the data, maps to bass range (E1=28 to ~E3=52)
// Reference: E1=28, A1=33, D2=38, G2=43, C2=36
function scaleDegreeToMidi(
  key: string,
  degree: number,
  mode: Mode,
  octave: number
): number {
  const keyOffset = KEY_OFFSETS[key] || 0;
  const intervals = MODE_INTERVALS[mode];
  const semitone = intervals[degree % 7];
  // C2 = MIDI 36, this is a good bass register
  // For key of C, root should be C2 (fret 3 on A string)
  // For key of E, root should be E2 (open E string or fret 2 on D)
  const baseMidi = 36; // C2 as reference point
  const keyRoot = baseMidi + keyOffset; // Root note of the key
  return keyRoot + semitone + ((octave + 1) * 12);
}

// Find best fret position for a MIDI note on bass
function midiToFret(midi: number): { string: number; fret: number } | null {
  for (let stringIdx = 0; stringIdx < BASS_STRINGS.length; stringIdx++) {
    const stringMidi = BASS_STRINGS[stringIdx].midi;
    const fret = midi - stringMidi;
    if (fret >= 0 && fret <= 12) {
      return { string: stringIdx, fret };
    }
  }
  for (let stringIdx = 0; stringIdx < BASS_STRINGS.length; stringIdx++) {
    const stringMidi = BASS_STRINGS[stringIdx].midi;
    const fret = midi - stringMidi;
    if (fret >= 0 && fret <= 24) {
      return { string: stringIdx, fret };
    }
  }
  return null;
}

type Props = {
  bassLine: BassBar[];
  currentBar: number;
  currentBeat: number;
  isPlaying: boolean;
  selectedKey: string;
  mode: Mode;
  beatsPerBar: number;
};

export function BassTab({
  bassLine,
  currentBar,
  currentBeat,
  isPlaying,
  selectedKey,
  mode,
  beatsPerBar,
}: Props) {
  // Layout constants
  const labelWidth = 30;
  const beatWidth = 50;
  const barWidth = beatsPerBar * beatWidth;
  const stringSpacing = 20;
  const topPadding = 20;
  const bottomPadding = 40;
  const totalBars = bassLine.length;

  const svgWidth = labelWidth + (totalBars * barWidth) + 20;
  const svgHeight = topPadding + (BASS_STRINGS.length - 1) * stringSpacing + bottomPadding;

  // Cursor position
  const cursorX = isPlaying
    ? labelWidth + (currentBar * barWidth) + (currentBeat * beatWidth)
    : -100;

  return (
    <div className="bg-zinc-900/50 rounded-xl p-4 overflow-x-auto">
      <div className="text-xs text-zinc-500 mb-3 flex items-center gap-2">
        <span className="font-medium">Bass Tablature</span>
        {isPlaying && (
          <span className="text-cyan-400">Bar {currentBar + 1}</span>
        )}
      </div>

      <svg
        width={svgWidth}
        height={svgHeight}
        className="font-mono"
      >
        {/* Background */}
        <rect x="0" y="0" width={svgWidth} height={svgHeight} fill="transparent" />

        {/* String labels */}
        {BASS_STRINGS.map((string, idx) => (
          <text
            key={`label-${string.name}`}
            x={labelWidth - 8}
            y={topPadding + idx * stringSpacing + 5}
            fill="#71717a"
            fontSize="14"
            fontWeight="bold"
            textAnchor="end"
          >
            {string.name}
          </text>
        ))}

        {/* Tab lines (strings) */}
        {BASS_STRINGS.map((string, idx) => (
          <line
            key={`string-${string.name}`}
            x1={labelWidth}
            y1={topPadding + idx * stringSpacing}
            x2={labelWidth + totalBars * barWidth}
            y2={topPadding + idx * stringSpacing}
            stroke="#3f3f46"
            strokeWidth="1"
          />
        ))}

        {/* Bar lines */}
        {Array.from({ length: totalBars + 1 }).map((_, idx) => (
          <line
            key={`bar-${idx}`}
            x1={labelWidth + idx * barWidth}
            y1={topPadding}
            x2={labelWidth + idx * barWidth}
            y2={topPadding + (BASS_STRINGS.length - 1) * stringSpacing}
            stroke="#52525b"
            strokeWidth={idx === 0 || idx === totalBars ? 2 : 1}
          />
        ))}

        {/* Beat markers (vertical dashed lines) */}
        {bassLine.map((_, barIdx) => (
          Array.from({ length: beatsPerBar - 1 }).map((_, beatIdx) => (
            <line
              key={`beat-${barIdx}-${beatIdx}`}
              x1={labelWidth + barIdx * barWidth + (beatIdx + 1) * beatWidth}
              y1={topPadding}
              x2={labelWidth + barIdx * barWidth + (beatIdx + 1) * beatWidth}
              y2={topPadding + (BASS_STRINGS.length - 1) * stringSpacing}
              stroke="#27272a"
              strokeWidth="1"
              strokeDasharray="2,4"
            />
          ))
        ))}

        {/* Notes */}
        {bassLine.map((bar, barIdx) => (
          bar.map((note, noteIdx) => {
            const midi = scaleDegreeToMidi(selectedKey, note.scaleDegree, mode, note.octave);
            const pos = midiToFret(midi);
            if (!pos) return null;

            const x = labelWidth + barIdx * barWidth + note.beat * beatWidth;
            const y = topPadding + pos.string * stringSpacing;

            const isCurrentNote = isPlaying &&
              barIdx === currentBar &&
              currentBeat >= note.beat &&
              currentBeat < note.beat + note.duration;

            // Note duration visualization (horizontal line)
            const durationWidth = note.duration * beatWidth - 8;

            return (
              <g key={`note-${barIdx}-${noteIdx}`}>
                {/* Duration line */}
                {note.duration > 0.5 && (
                  <line
                    x1={x + 10}
                    y1={y}
                    x2={x + durationWidth}
                    y2={y}
                    stroke={isCurrentNote ? "#22d3ee" : "#6b7280"}
                    strokeWidth="3"
                    strokeLinecap="round"
                    opacity={0.5}
                  />
                )}
                {/* Fret number background */}
                <rect
                  x={x - 8}
                  y={y - 10}
                  width="16"
                  height="20"
                  fill="#18181b"
                  rx="3"
                />
                {/* Fret number */}
                <text
                  x={x}
                  y={y + 5}
                  fill={isCurrentNote ? "#22d3ee" : "#ffffff"}
                  fontSize="14"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {pos.fret}
                </text>
              </g>
            );
          })
        ))}

        {/* Playback cursor */}
        {isPlaying && (
          <g>
            <line
              x1={cursorX}
              y1={topPadding - 10}
              x2={cursorX}
              y2={topPadding + (BASS_STRINGS.length - 1) * stringSpacing + 10}
              stroke="#22d3ee"
              strokeWidth="2"
              opacity="0.8"
            />
            <polygon
              points={`${cursorX - 6},${topPadding - 10} ${cursorX + 6},${topPadding - 10} ${cursorX},${topPadding - 2}`}
              fill="#22d3ee"
            />
          </g>
        )}

        {/* Bar numbers */}
        {bassLine.map((_, barIdx) => (
          <text
            key={`barnum-${barIdx}`}
            x={labelWidth + barIdx * barWidth + barWidth / 2}
            y={svgHeight - 10}
            fill={isPlaying && barIdx === currentBar ? "#22d3ee" : "#52525b"}
            fontSize="11"
            textAnchor="middle"
          >
            {barIdx + 1}
          </text>
        ))}

        {/* Beat numbers */}
        {bassLine.map((_, barIdx) => (
          Array.from({ length: beatsPerBar }).map((_, beatIdx) => (
            <text
              key={`beatnum-${barIdx}-${beatIdx}`}
              x={labelWidth + barIdx * barWidth + beatIdx * beatWidth + beatWidth / 2}
              y={svgHeight - 22}
              fill={isPlaying && barIdx === currentBar && Math.floor(currentBeat) === beatIdx ? "#22d3ee" : "#3f3f46"}
              fontSize="9"
              textAnchor="middle"
            >
              {beatIdx + 1}
            </text>
          ))
        ))}
      </svg>
    </div>
  );
}
