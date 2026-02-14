import { useState, useCallback, useRef } from "react";
import { generateProgression, genres, keys, barOptions, type Genre } from "./cadenceData";
import { chords as allChords } from "./chordData";
import { getAudioContext, playChord } from "./audio";

type ProgressionChord = {
  degree: number;
  chordName: string;
  degreeName: string;
};

export function Cadence() {
  const [selectedKey, setSelectedKey] = useState("C");
  const [selectedGenre, setSelectedGenre] = useState<Genre>("pop");
  const [numBars, setNumBars] = useState(4);
  const [progression, setProgression] = useState<ProgressionChord[]>([]);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const playTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentIndexRef = useRef(0);

  const handleGenerate = useCallback(() => {
    // Stop any current playback
    if (playTimeoutRef.current) {
      clearTimeout(playTimeoutRef.current);
      playTimeoutRef.current = null;
    }
    setIsPlaying(false);
    setPlayingIndex(null);

    const newProgression = generateProgression(selectedKey, selectedGenre, numBars);
    setProgression(newProgression);
  }, [selectedKey, selectedGenre, numBars]);

  const playChordByName = useCallback((chordName: string) => {
    // Find the chord in our chord library
    const chord = allChords.find(c => c.name === chordName);
    if (chord) {
      const ctx = getAudioContext();
      playChord(ctx, chord.frets);
    }
  }, []);

  const handlePlaySingle = useCallback((chordName: string, index: number) => {
    playChordByName(chordName);
    setPlayingIndex(index);
    setTimeout(() => setPlayingIndex(null), 1500);
  }, [playChordByName]);

  const handlePlayAll = useCallback(() => {
    if (progression.length === 0) return;

    // Stop any current playback
    if (playTimeoutRef.current) {
      clearTimeout(playTimeoutRef.current);
    }

    setIsPlaying(true);
    currentIndexRef.current = 0;

    const playNext = () => {
      const index = currentIndexRef.current;
      if (index >= progression.length) {
        setIsPlaying(false);
        setPlayingIndex(null);
        return;
      }

      const chord = progression[index];
      playChordByName(chord.chordName);
      setPlayingIndex(index);

      currentIndexRef.current = index + 1;
      playTimeoutRef.current = setTimeout(playNext, 1500); // 1.5s per bar (~100 BPM feel)
    };

    playNext();
  }, [progression, playChordByName]);

  const handleStop = useCallback(() => {
    if (playTimeoutRef.current) {
      clearTimeout(playTimeoutRef.current);
      playTimeoutRef.current = null;
    }
    setIsPlaying(false);
    setPlayingIndex(null);
  }, []);

  const selectedGenreConfig = genres.find(g => g.id === selectedGenre);

  return (
    <div className="flex flex-col items-center min-h-[calc(100vh-4rem)] p-4 sm:p-6">
      <div className="w-full max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl sm:text-6xl font-black mb-3 bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-500 bg-clip-text text-transparent drop-shadow-2xl tracking-tight">
            CADENCE
          </h1>
          <p className="text-zinc-500 text-sm tracking-wide uppercase">
            Markov chain chord progressions
          </p>
        </div>

        {/* Controls */}
        <div className="backdrop-blur-xl bg-white/5 rounded-2xl border border-white/10 p-4 sm:p-6 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {/* Key Selector */}
            <div>
              <label className="block text-zinc-400 text-sm mb-2 font-medium">Key</label>
              <div className="flex flex-wrap gap-1">
                {keys.map((key) => (
                  <button
                    key={key}
                    onClick={() => setSelectedKey(key)}
                    className={`w-9 h-9 rounded-lg font-bold text-sm transition-all duration-200
                      ${selectedKey === key
                        ? "bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg"
                        : "bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700/50 hover:text-white"
                      }`}
                  >
                    {key}
                  </button>
                ))}
              </div>
            </div>

            {/* Genre Selector */}
            <div>
              <label className="block text-zinc-400 text-sm mb-2 font-medium">Genre</label>
              <div className="space-y-1">
                {genres.map((genre) => (
                  <button
                    key={genre.id}
                    onClick={() => setSelectedGenre(genre.id)}
                    className={`w-full px-3 py-2 rounded-lg text-left text-sm transition-all duration-200
                      ${selectedGenre === genre.id
                        ? "bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg"
                        : "bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700/50 hover:text-white"
                      }`}
                  >
                    <span className="font-medium">{genre.name}</span>
                    <span className="text-xs opacity-70 ml-2">{genre.description}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Bars Selector */}
            <div>
              <label className="block text-zinc-400 text-sm mb-2 font-medium">Bars</label>
              <div className="flex gap-2">
                {barOptions.map((bars) => (
                  <button
                    key={bars}
                    onClick={() => setNumBars(bars)}
                    className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all duration-200
                      ${numBars === bars
                        ? "bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg"
                        : "bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700/50 hover:text-white"
                      }`}
                  >
                    {bars}
                  </button>
                ))}
              </div>

              {/* Generate Button */}
              <button
                onClick={handleGenerate}
                className="w-full mt-4 py-3 rounded-xl font-bold text-lg transition-all duration-300 relative overflow-hidden group
                  bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500 hover:shadow-lg hover:shadow-cyan-500/30"
              >
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                <span className="relative flex items-center justify-center gap-2">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Generate
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Progression Display */}
        {progression.length > 0 && (
          <div className="backdrop-blur-xl bg-white/5 rounded-2xl border border-white/10 p-4 sm:p-6 mb-6">
            {/* Play Controls */}
            <div className="flex justify-center gap-3 mb-6">
              {!isPlaying ? (
                <button
                  onClick={handlePlayAll}
                  className="px-6 py-3 rounded-xl font-bold transition-all duration-300 flex items-center gap-2
                    bg-gradient-to-r from-green-500 to-emerald-500 hover:shadow-lg hover:shadow-green-500/30"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Play All
                </button>
              ) : (
                <button
                  onClick={handleStop}
                  className="px-6 py-3 rounded-xl font-bold transition-all duration-300 flex items-center gap-2
                    bg-gradient-to-r from-red-500 to-rose-500 hover:shadow-lg hover:shadow-red-500/30"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 6h12v12H6z" />
                  </svg>
                  Stop
                </button>
              )}
            </div>

            {/* Info */}
            <div className="text-center mb-4">
              <span className="text-zinc-400 text-sm">
                {selectedKey} {selectedGenreConfig?.name} • {numBars} bars
              </span>
            </div>

            {/* Chord Grid */}
            <div className="grid grid-cols-4 gap-3">
              {progression.map((chord, index) => {
                const isCurrentlyPlaying = playingIndex === index;
                return (
                  <button
                    key={index}
                    onClick={() => handlePlaySingle(chord.chordName, index)}
                    className={`relative p-4 rounded-xl transition-all duration-300 cursor-pointer
                      ${isCurrentlyPlaying
                        ? "bg-gradient-to-br from-cyan-500/30 to-blue-500/30 border-2 border-cyan-400 scale-105 shadow-lg shadow-cyan-500/30"
                        : "bg-zinc-800/50 border border-zinc-700/50 hover:bg-zinc-700/50 hover:scale-102"
                      }`}
                  >
                    {/* Bar number */}
                    <span className="absolute top-1 left-2 text-xs text-zinc-600">{index + 1}</span>

                    {/* Chord name */}
                    <div className={`text-2xl font-black transition-colors ${isCurrentlyPlaying ? "text-cyan-400" : "text-white"}`}>
                      {chord.chordName}
                    </div>

                    {/* Roman numeral */}
                    <div className="text-sm text-zinc-500 mt-1">
                      {chord.degreeName}
                    </div>

                    {/* Playing indicator */}
                    {isCurrentlyPlaying && (
                      <div className="absolute inset-0 rounded-xl border-2 border-cyan-400 animate-pulse" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Progression as text */}
            <div className="mt-6 text-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800/50 rounded-lg">
                <span className="text-zinc-500 text-sm">Progression:</span>
                <span className="text-white font-mono text-sm">
                  {progression.map(c => c.degreeName).join(" → ")}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {progression.length === 0 && (
          <div className="backdrop-blur-xl bg-white/5 rounded-2xl border border-white/10 p-8 text-center">
            <div className="text-6xl mb-4">🎲</div>
            <p className="text-zinc-400 mb-2">No progression yet</p>
            <p className="text-zinc-600 text-sm">Select your options and hit Generate!</p>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-zinc-600 text-xs mt-8 tracking-wide">
          Each genre uses a unique Markov transition matrix for authentic progressions
        </p>
      </div>
    </div>
  );
}
