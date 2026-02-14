import { useState, useCallback, useRef, useEffect } from "react";
import { generateProgression, generateMelody, generateBassLine, getScaleDegreeFrequency, genres, keys, barOptions, modes, getChordName, type Genre, type Mode, type ProgressionBar, type ScaleDegree, type BarChord, type MelodyBar, type BassBar } from "./cadenceData";
import { chords as allChords } from "./chordData";
import { getAudioContext, playChord, playStrings, playHammond, playPiano, playMelodyNote, playBassNote } from "./audio";

export type Instrument = "guitar" | "strings" | "hammond" | "piano";

// Position for editing: which bar and chord within that bar
type EditingPosition = { bar: number; chord: number } | null;

// Track which chord is playing: [barIndex, chordIndex within bar]
type PlayingPosition = { bar: number; chord: number } | null;

// ============ DRUM SOUNDS ============

// Kick drum - low frequency punch
function playKick(ctx: AudioContext, time: number, volume: number = 0.7) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(150, time);
  osc.frequency.exponentialRampToValueAtTime(40, time + 0.1);

  gain.gain.setValueAtTime(volume, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(time);
  osc.stop(time + 0.3);
}

// Snare drum - noise burst with body
function playSnare(ctx: AudioContext, time: number, volume: number = 0.5) {
  // Noise component
  const bufferSize = Math.floor(ctx.sampleRate * 0.15);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = "highpass";
  noiseFilter.frequency.value = 1000;

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(volume * 0.8, time);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(ctx.destination);

  // Body component
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.value = 180;
  oscGain.gain.setValueAtTime(volume * 0.5, time);
  oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);

  osc.connect(oscGain);
  oscGain.connect(ctx.destination);

  noise.start(time);
  noise.stop(time + 0.15);
  osc.start(time);
  osc.stop(time + 0.08);
}

// Hi-hat - high frequency noise
function playHiHat(ctx: AudioContext, time: number, open: boolean = false, volume: number = 0.3) {
  const bufferSize = Math.floor(ctx.sampleRate * (open ? 0.3 : 0.05));
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 7000;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + (open ? 0.3 : 0.05));

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  noise.start(time);
  noise.stop(time + (open ? 0.3 : 0.05));
}

// Ride cymbal - for jazz
function playRide(ctx: AudioContext, time: number, volume: number = 0.25) {
  const bufferSize = Math.floor(ctx.sampleRate * 0.4);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 5000;
  filter.Q.value = 1;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  noise.start(time);
  noise.stop(time + 0.4);
}

// Brush sound - for jazz
function playBrush(ctx: AudioContext, time: number, volume: number = 0.15) {
  const bufferSize = Math.floor(ctx.sampleRate * 0.2);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 3000;
  filter.Q.value = 0.5;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, time);
  gain.gain.linearRampToValueAtTime(0, time + 0.2);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  noise.start(time);
  noise.stop(time + 0.2);
}

// ============ DRUM PATTERNS PER GENRE ============
// Pattern arrays: 8 steps per bar (8th notes)
// Values: 0 = off, 1 = hit

type DrumPattern = {
  name: string;
  kick: number[];
  snare: number[];
  hihat: number[];
  ride: number[];
};

type GenrePatterns = {
  patterns: DrumPattern[];
};

const drumPatternsByGenre: Record<Genre, GenrePatterns> = {
  pop: {
    patterns: [
      { name: "Basic", kick: [1,0,0,0,1,0,0,0], snare: [0,0,1,0,0,0,1,0], hihat: [1,1,1,1,1,1,1,1], ride: [0,0,0,0,0,0,0,0] },
      { name: "Four on floor", kick: [1,0,1,0,1,0,1,0], snare: [0,0,1,0,0,0,1,0], hihat: [1,1,1,1,1,1,1,1], ride: [0,0,0,0,0,0,0,0] },
      { name: "Ballad", kick: [1,0,0,0,0,0,1,0], snare: [0,0,1,0,0,0,0,1], hihat: [1,0,1,0,1,0,1,0], ride: [0,0,0,0,0,0,0,0] },
      { name: "Syncopated", kick: [1,0,0,1,0,0,1,0], snare: [0,0,1,0,0,1,0,0], hihat: [1,1,1,1,1,1,1,1], ride: [0,0,0,0,0,0,0,0] },
    ]
  },
  rock: {
    patterns: [
      { name: "Basic", kick: [1,0,0,0,1,0,0,0], snare: [0,0,1,0,0,0,1,0], hihat: [1,1,1,1,1,1,1,1], ride: [0,0,0,0,0,0,0,0] },
      { name: "Driving", kick: [1,0,1,0,1,0,1,0], snare: [0,0,1,0,0,0,1,0], hihat: [1,1,1,1,1,1,1,1], ride: [0,0,0,0,0,0,0,0] },
      { name: "Half-time", kick: [1,0,0,0,0,0,0,0], snare: [0,0,0,0,1,0,0,0], hihat: [1,1,1,1,1,1,1,1], ride: [0,0,0,0,0,0,0,0] },
      { name: "Punk", kick: [1,1,1,1,1,1,1,1], snare: [0,0,1,0,0,0,1,0], hihat: [1,1,1,1,1,1,1,1], ride: [0,0,0,0,0,0,0,0] },
    ]
  },
  jazz: {
    patterns: [
      { name: "Swing", kick: [1,0,0,0,0,0,0,0], snare: [0,0,0,0,0,0,0,0], hihat: [0,0,0,0,1,0,0,0], ride: [1,0,1,1,0,1,1,0] },
      { name: "Bossa", kick: [1,0,0,0,0,0,1,0], snare: [0,0,0,1,0,0,0,0], hihat: [1,0,1,0,1,0,1,0], ride: [0,0,0,0,0,0,0,0] },
      { name: "Brushes", kick: [1,0,0,0,0,0,0,0], snare: [0,0,1,0,0,0,1,0], hihat: [0,0,0,0,0,0,0,0], ride: [1,1,1,1,1,1,1,1] },
      { name: "Fast swing", kick: [1,0,0,0,1,0,0,0], snare: [0,0,0,0,0,0,0,0], hihat: [0,0,1,0,0,0,1,0], ride: [1,0,1,1,1,0,1,1] },
    ]
  },
  blues: {
    patterns: [
      { name: "Shuffle", kick: [1,0,0,1,0,0,1,0], snare: [0,0,1,0,0,1,0,0], hihat: [1,0,1,1,0,1,1,0], ride: [0,0,0,0,0,0,0,0] },
      { name: "Slow blues", kick: [1,0,0,0,0,0,1,0], snare: [0,0,0,0,1,0,0,0], hihat: [1,0,1,0,1,0,1,0], ride: [0,0,0,0,0,0,0,0] },
      { name: "Chicago", kick: [1,0,1,0,1,0,0,0], snare: [0,0,1,0,0,0,1,1], hihat: [1,1,1,1,1,1,1,1], ride: [0,0,0,0,0,0,0,0] },
      { name: "Texas", kick: [1,0,0,1,0,1,0,0], snare: [0,0,1,0,0,0,1,0], hihat: [1,0,1,1,0,1,1,0], ride: [0,0,0,0,0,0,0,0] },
    ]
  },
  classical: {
    patterns: [
      { name: "Tick", kick: [0,0,0,0,0,0,0,0], snare: [0,0,0,0,0,0,0,0], hihat: [0,0,0,0,0,0,0,0], ride: [1,0,0,0,1,0,0,0] },
      { name: "Waltz", kick: [1,0,0,0,0,0,0,0], snare: [0,0,0,1,0,0,1,0], hihat: [0,0,0,0,0,0,0,0], ride: [0,0,0,0,0,0,0,0] },
      { name: "March", kick: [1,0,1,0,1,0,1,0], snare: [0,0,1,0,0,0,1,0], hihat: [0,0,0,0,0,0,0,0], ride: [0,0,0,0,0,0,0,0] },
      { name: "Silent", kick: [0,0,0,0,0,0,0,0], snare: [0,0,0,0,0,0,0,0], hihat: [0,0,0,0,0,0,0,0], ride: [0,0,0,0,0,0,0,0] },
    ]
  },
};

// Simple click sound for metronome
function playClick(ctx: AudioContext, time: number, accent: boolean = false) {
  const bufferSize = Math.floor(ctx.sampleRate * 0.02);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = accent ? 3500 : 2500;
  filter.Q.value = 5;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(accent ? 0.5 : 0.3, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.015);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  source.start(time);
  source.stop(time + 0.02);
}

// Schedule metronome clicks for a bar
function scheduleClicks(ctx: AudioContext, duration: number, beatsPerBar: number) {
  const now = ctx.currentTime;
  const beatDuration = (duration / 1000) / beatsPerBar;

  for (let i = 0; i < beatsPerBar; i++) {
    playClick(ctx, now + i * beatDuration, i === 0);
  }
}

// Schedule drum pattern for a bar
function scheduleDrums(ctx: AudioContext, duration: number, pattern: DrumPattern, genre: Genre) {
  const now = ctx.currentTime;
  const stepsPerBar = 8;
  const stepDuration = (duration / 1000) / stepsPerBar;

  for (let step = 0; step < stepsPerBar; step++) {
    const time = now + step * stepDuration;

    if (pattern.kick[step]) {
      playKick(ctx, time, 0.6);
    }
    if (pattern.snare[step]) {
      playSnare(ctx, time, 0.4);
    }
    if (pattern.hihat[step]) {
      playHiHat(ctx, time, false, 0.25);
    }
    if (pattern.ride[step]) {
      if (genre === "jazz") {
        playRide(ctx, time, 0.2);
        if (step === 0) playBrush(ctx, time, 0.1);
      } else {
        playHiHat(ctx, time, false, 0.15);
      }
    }
  }
}

export function Cadence() {
  const [selectedKey, setSelectedKey] = useState("C");
  const [selectedGenre, setSelectedGenre] = useState<Genre>("pop");
  const [selectedMode, setSelectedMode] = useState<Mode>("ionian");
  const [numBars, setNumBars] = useState(4);
  const [progression, setProgression] = useState<ProgressionBar[]>([]);
  const [playingPosition, setPlayingPosition] = useState<PlayingPosition>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpm] = useState(100);
  const [rhythmMode, setRhythmMode] = useState<"off" | "click" | "drums">("off");
  const [drumPatternIndex, setDrumPatternIndex] = useState(0);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [beatsPerBar, setBeatsPerBar] = useState(4);
  const [enabledInstruments, setEnabledInstruments] = useState<Set<Instrument>>(new Set(["guitar"]));
  const [editingPosition, setEditingPosition] = useState<EditingPosition>(null);
  const [melodyEnabled, setMelodyEnabled] = useState(false);
  const [bassEnabled, setBassEnabled] = useState(false);
  const [melody, setMelody] = useState<MelodyBar[]>([]);
  const [bassLine, setBassLine] = useState<BassBar[]>([]);
  const playTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playQueueRef = useRef<{ barIndex: number; chordIndex: number }[]>([]);
  const queueIndexRef = useRef(0);
  const loopEnabledRef = useRef(false);
  const rhythmModeRef = useRef<"off" | "click" | "drums">("off");
  const drumPatternIndexRef = useRef(0);
  const bpmRef = useRef(100);
  const beatsPerBarRef = useRef(4);

  const selectedGenreRef = useRef<Genre>(selectedGenre);
  const selectedModeRef = useRef<Mode>(selectedMode);
  const selectedKeyRef = useRef(selectedKey);
  const melodyEnabledRef = useRef(false);
  const bassEnabledRef = useRef(false);
  const melodyRef = useRef<MelodyBar[]>([]);
  const bassLineRef = useRef<BassBar[]>([]);

  // Reset pattern index when genre changes
  useEffect(() => { setDrumPatternIndex(0); }, [selectedGenre]);

  // Keep refs in sync with state
  useEffect(() => { loopEnabledRef.current = loopEnabled; }, [loopEnabled]);
  useEffect(() => { rhythmModeRef.current = rhythmMode; }, [rhythmMode]);
  useEffect(() => { drumPatternIndexRef.current = drumPatternIndex; }, [drumPatternIndex]);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { beatsPerBarRef.current = beatsPerBar; }, [beatsPerBar]);
  useEffect(() => { selectedGenreRef.current = selectedGenre; }, [selectedGenre]);
  useEffect(() => { selectedModeRef.current = selectedMode; }, [selectedMode]);
  useEffect(() => { selectedKeyRef.current = selectedKey; }, [selectedKey]);
  useEffect(() => { melodyEnabledRef.current = melodyEnabled; }, [melodyEnabled]);
  useEffect(() => { bassEnabledRef.current = bassEnabled; }, [bassEnabled]);
  useEffect(() => { melodyRef.current = melody; }, [melody]);
  useEffect(() => { bassLineRef.current = bassLine; }, [bassLine]);

  const handleGenerate = useCallback(() => {
    // Stop any current playback
    if (playTimeoutRef.current) {
      clearTimeout(playTimeoutRef.current);
      playTimeoutRef.current = null;
    }
    setIsPlaying(false);
    setPlayingPosition(null);

    const newProgression = generateProgression(selectedKey, selectedGenre, numBars, selectedMode);
    setProgression(newProgression);

    // Generate melody and bass line
    const newMelody = generateMelody(newProgression, selectedKey, selectedMode, selectedGenre, beatsPerBar);
    const newBassLine = generateBassLine(newProgression, selectedKey, selectedMode, selectedGenre, beatsPerBar);
    setMelody(newMelody);
    setBassLine(newBassLine);
  }, [selectedKey, selectedGenre, numBars, selectedMode, beatsPerBar]);

  const toggleInstrument = useCallback((instrument: Instrument) => {
    setEnabledInstruments(prev => {
      const next = new Set(prev);
      if (next.has(instrument)) {
        next.delete(instrument);
      } else {
        next.add(instrument);
      }
      return next;
    });
  }, []);

  // Update a chord in the progression
  const updateChord = useCallback((barIndex: number, chordIndex: number, newChordName: string) => {
    setProgression(prev => {
      const updated = [...prev];
      const bar = { ...updated[barIndex] };
      const chords = [...bar.chords];
      chords[chordIndex] = {
        ...chords[chordIndex],
        chordName: newChordName,
        degreeName: chords[chordIndex].degreeName // keep original degree name
      };
      bar.chords = chords;
      updated[barIndex] = bar;
      return updated;
    });
    setEditingPosition(null);
  }, []);

  // Add a new bar at the end
  const addBar = useCallback(() => {
    const defaultChordName = getChordName(selectedKey, 0 as ScaleDegree, false);
    const newBar: ProgressionBar = {
      degree: 0 as ScaleDegree,
      chords: [{ chordName: defaultChordName, degreeName: "I" }]
    };
    setProgression(prev => [...prev, newBar]);
  }, [selectedKey]);

  // Remove a bar
  const removeBar = useCallback((barIndex: number) => {
    setProgression(prev => prev.filter((_, i) => i !== barIndex));
    setEditingPosition(null);
  }, []);

  // Split a bar into two chords or merge back to one
  const toggleSplitBar = useCallback((barIndex: number) => {
    setProgression(prev => {
      const updated = [...prev];
      const bar = { ...updated[barIndex] };
      if (bar.chords.length === 1) {
        // Split: duplicate the chord
        bar.chords = [bar.chords[0], { ...bar.chords[0] }];
      } else {
        // Merge: keep only first chord
        bar.chords = [bar.chords[0]];
      }
      updated[barIndex] = bar;
      return updated;
    });
  }, []);

  const playChordByName = useCallback((chordName: string, duration: number = 2.5) => {
    const ctx = getAudioContext();

    // Play guitar if enabled (uses chord library for fingering)
    if (enabledInstruments.has("guitar")) {
      const chord = allChords.find(c => c.name === chordName);
      if (chord) {
        playChord(ctx, chord.frets);
      }
    }

    // Play synth instruments (use chord name directly)
    if (enabledInstruments.has("strings")) {
      playStrings(ctx, chordName, duration);
    }
    if (enabledInstruments.has("hammond")) {
      playHammond(ctx, chordName, duration);
    }
    if (enabledInstruments.has("piano")) {
      playPiano(ctx, chordName, duration);
    }
  }, [enabledInstruments]);

  const handlePlaySingle = useCallback((chordName: string, barIndex: number, chordIndex: number) => {
    playChordByName(chordName);
    setPlayingPosition({ bar: barIndex, chord: chordIndex });
    setTimeout(() => setPlayingPosition(null), 1000);
  }, [playChordByName]);

  const handlePlayAll = useCallback(() => {
    if (progression.length === 0) return;

    // Stop any current playback
    if (playTimeoutRef.current) {
      clearTimeout(playTimeoutRef.current);
    }

    // Build a queue of all chords to play
    const queue: { barIndex: number; chordIndex: number }[] = [];
    progression.forEach((bar, barIndex) => {
      bar.chords.forEach((_, chordIndex) => {
        queue.push({ barIndex, chordIndex });
      });
    });

    playQueueRef.current = queue;
    queueIndexRef.current = 0;
    setIsPlaying(true);

    const playNext = () => {
      const idx = queueIndexRef.current;
      if (idx >= playQueueRef.current.length) {
        // Check if loop is enabled (use ref for current value)
        if (loopEnabledRef.current) {
          queueIndexRef.current = 0;
          playNext();
          return;
        }
        setIsPlaying(false);
        setPlayingPosition(null);
        return;
      }

      const { barIndex, chordIndex } = playQueueRef.current[idx];
      const bar = progression[barIndex];
      const chord = bar.chords[chordIndex];

      // Timing based on BPM: beatsPerBar beats per bar
      const currentBpm = bpmRef.current;
      const currentBeatsPerBar = beatsPerBarRef.current;
      const timePerBar = (60 / currentBpm) * currentBeatsPerBar * 1000;
      const duration = bar.chords.length > 1 ? timePerBar / 2 : timePerBar;

      // Schedule rhythm (only on first chord of bar)
      const ctx = getAudioContext();
      if (chordIndex === 0) {
        const mode = rhythmModeRef.current;
        if (mode === "click") {
          scheduleClicks(ctx, timePerBar, currentBeatsPerBar);
        } else if (mode === "drums") {
          const genre = selectedGenreRef.current;
          const patternIdx = drumPatternIndexRef.current;
          const pattern = drumPatternsByGenre[genre].patterns[patternIdx];
          scheduleDrums(ctx, timePerBar, pattern, genre);
        }

        // Schedule melody notes for this bar
        if (melodyEnabledRef.current && melodyRef.current[barIndex]) {
          const barMelody = melodyRef.current[barIndex];
          const key = selectedKeyRef.current;
          const modeConfig = selectedModeRef.current;
          const beatDuration = (timePerBar / 1000) / currentBeatsPerBar;

          barMelody.forEach(note => {
            const freq = getScaleDegreeFrequency(key, note.scaleDegree, modeConfig, note.octave);
            const noteStartTime = ctx.currentTime + note.beat * beatDuration;
            const noteDuration = note.duration * beatDuration;
            playMelodyNote(ctx, freq, noteDuration, noteStartTime);
          });
        }

        // Schedule bass notes for this bar
        if (bassEnabledRef.current && bassLineRef.current[barIndex]) {
          const barBass = bassLineRef.current[barIndex];
          const key = selectedKeyRef.current;
          const modeConfig = selectedModeRef.current;
          const beatDuration = (timePerBar / 1000) / currentBeatsPerBar;

          barBass.forEach(note => {
            const freq = getScaleDegreeFrequency(key, note.scaleDegree, modeConfig, note.octave);
            const noteStartTime = ctx.currentTime + note.beat * beatDuration;
            const noteDuration = note.duration * beatDuration;
            playBassNote(ctx, freq, noteDuration, noteStartTime);
          });
        }
      }

      playChordByName(chord.chordName, duration / 1000);
      setPlayingPosition({ bar: barIndex, chord: chordIndex });

      queueIndexRef.current = idx + 1;

      playTimeoutRef.current = setTimeout(playNext, duration);
    };

    playNext();
  }, [progression, playChordByName]);

  const handleStop = useCallback(() => {
    if (playTimeoutRef.current) {
      clearTimeout(playTimeoutRef.current);
      playTimeoutRef.current = null;
    }
    setIsPlaying(false);
    setPlayingPosition(null);
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
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

            {/* Mode Selector */}
            <div>
              <label className="block text-zinc-400 text-sm mb-2 font-medium">Mode</label>
              <div className="grid grid-cols-2 gap-1">
                {modes.map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => setSelectedMode(mode.id)}
                    className={`px-2 py-1.5 rounded-lg text-left text-xs transition-all duration-200
                      ${selectedMode === mode.id
                        ? "bg-gradient-to-r from-violet-500 to-purple-500 text-white shadow-lg"
                        : "bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700/50 hover:text-white"
                      }`}
                  >
                    <span className="font-medium">{mode.name}</span>
                    <span className="block text-[10px] opacity-70">{mode.character}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
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
            {/* Playback Controls */}
            <div className="flex flex-col sm:flex-row items-center gap-4 mb-6">
              {/* BPM Slider */}
              <div className="flex items-center gap-3 flex-1">
                <span className="text-zinc-400 text-sm font-medium w-12">BPM</span>
                <input
                  type="range"
                  min="40"
                  max="200"
                  value={bpm}
                  onChange={(e) => setBpm(Number(e.target.value))}
                  className="flex-1 h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
                <span className="text-white font-mono text-sm w-10 text-right">{bpm}</span>
              </div>

              {/* Rhythm Mode Toggle */}
              <div className="flex items-center gap-1 bg-zinc-800/50 rounded-lg p-1">
                {(["off", "click", "drums"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setRhythmMode(mode)}
                    className={`px-3 py-1.5 rounded-md font-medium text-xs transition-all duration-200
                      ${rhythmMode === mode
                        ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md"
                        : "text-zinc-400 hover:text-white"
                      }`}
                  >
                    {mode === "off" ? "No Beat" : mode === "click" ? "Click" : "Drums"}
                  </button>
                ))}
              </div>

              {/* Beats per bar selector (when click mode) */}
              {rhythmMode === "click" && (
                <div className="flex items-center gap-1 bg-zinc-800/50 rounded-lg p-1">
                  {[2, 3, 4, 6].map((beats) => (
                    <button
                      key={beats}
                      onClick={() => setBeatsPerBar(beats)}
                      className={`w-7 h-7 rounded-md font-medium text-xs transition-all duration-200
                        ${beatsPerBar === beats
                          ? "bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-md"
                          : "text-zinc-400 hover:text-white"
                        }`}
                    >
                      {beats}
                    </button>
                  ))}
                </div>
              )}

              {/* Pattern selector (when drums mode) */}
              {rhythmMode === "drums" && (
                <select
                  value={drumPatternIndex}
                  onChange={(e) => setDrumPatternIndex(Number(e.target.value))}
                  className="px-3 py-2 rounded-lg bg-zinc-800/50 text-white text-sm border border-zinc-700 focus:border-cyan-500 focus:outline-none"
                >
                  {drumPatternsByGenre[selectedGenre].patterns.map((pattern, idx) => (
                    <option key={idx} value={idx}>
                      {pattern.name}
                    </option>
                  ))}
                </select>
              )}

              {/* Loop Toggle */}
              <button
                onClick={() => setLoopEnabled(!loopEnabled)}
                className={`px-3 py-2 rounded-lg font-medium text-sm transition-all duration-200 flex items-center gap-2
                  ${loopEnabled
                    ? "bg-gradient-to-r from-violet-500 to-purple-500 text-white shadow-lg"
                    : "bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700/50 hover:text-white"
                  }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Loop
              </button>
            </div>

            {/* Instrument Toggles */}
            <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
              <span className="text-zinc-500 text-xs mr-1">Chords:</span>
              {(["guitar", "piano", "strings", "hammond"] as Instrument[]).map((instrument) => (
                <button
                  key={instrument}
                  onClick={() => toggleInstrument(instrument)}
                  className={`px-3 py-1.5 rounded-lg font-medium text-xs transition-all duration-200
                    ${enabledInstruments.has(instrument)
                      ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md"
                      : "bg-zinc-800/50 text-zinc-500 hover:bg-zinc-700/50 hover:text-white"
                    }`}
                >
                  {instrument.charAt(0).toUpperCase() + instrument.slice(1)}
                </button>
              ))}
            </div>

            {/* Melody & Bass Toggles */}
            <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
              <span className="text-zinc-500 text-xs mr-1">Extra:</span>
              <button
                onClick={() => setMelodyEnabled(!melodyEnabled)}
                className={`px-3 py-1.5 rounded-lg font-medium text-xs transition-all duration-200 flex items-center gap-1.5
                  ${melodyEnabled
                    ? "bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-md"
                    : "bg-zinc-800/50 text-zinc-500 hover:bg-zinc-700/50 hover:text-white"
                  }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
                Melody
              </button>
              <button
                onClick={() => setBassEnabled(!bassEnabled)}
                className={`px-3 py-1.5 rounded-lg font-medium text-xs transition-all duration-200 flex items-center gap-1.5
                  ${bassEnabled
                    ? "bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-md"
                    : "bg-zinc-800/50 text-zinc-500 hover:bg-zinc-700/50 hover:text-white"
                  }`}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                </svg>
                Bass
              </button>
            </div>

            {/* Play/Stop Button */}
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
                {selectedKey} {modes.find(m => m.id === selectedMode)?.name} • {selectedGenreConfig?.name} • {numBars} bars
              </span>
            </div>

            {/* Chord Grid */}
            <div className="grid grid-cols-4 gap-3">
              {progression.map((bar, barIndex) => {
                const isSplitBar = bar.chords.length > 1;
                const isBarPlaying = playingPosition?.bar === barIndex;

                return (
                  <div
                    key={barIndex}
                    className={`relative rounded-xl transition-all duration-300 overflow-visible group
                      ${isBarPlaying
                        ? "scale-105 shadow-lg shadow-cyan-500/30"
                        : ""
                      }`}
                  >
                    {/* Bar number & controls */}
                    <div className="absolute -top-1 left-1 right-1 flex justify-between items-center z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-[10px] text-zinc-500 bg-zinc-900/80 px-1 rounded">{barIndex + 1}</span>
                      {!isPlaying && (
                        <div className="flex gap-0.5">
                          <button
                            onClick={() => toggleSplitBar(barIndex)}
                            className="w-5 h-5 flex items-center justify-center text-zinc-500 hover:text-white bg-zinc-900/80 rounded text-[10px]"
                            title={isSplitBar ? "Merge" : "Split"}
                          >
                            {isSplitBar ? "1" : "2"}
                          </button>
                          {progression.length > 1 && (
                            <button
                              onClick={() => removeBar(barIndex)}
                              className="w-5 h-5 flex items-center justify-center text-zinc-500 hover:text-red-400 bg-zinc-900/80 rounded"
                              title="Remove bar"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {isSplitBar ? (
                      /* Split bar - two chords */
                      <div className="flex h-full">
                        {bar.chords.map((chord, chordIndex) => {
                          const isChordPlaying = isBarPlaying && playingPosition?.chord === chordIndex;
                          const isEditing = editingPosition?.bar === barIndex && editingPosition?.chord === chordIndex;
                          return (
                            <div key={chordIndex} className={`flex-1 relative ${chordIndex === 0 ? "" : ""}`}>
                              <button
                                onClick={() => {
                                  if (isPlaying) {
                                    handlePlaySingle(chord.chordName, barIndex, chordIndex);
                                  } else {
                                    setEditingPosition(isEditing ? null : { bar: barIndex, chord: chordIndex });
                                  }
                                }}
                                className={`w-full py-3 px-1 transition-all duration-300 cursor-pointer border flex flex-col items-center justify-center min-h-[70px]
                                  ${isChordPlaying
                                    ? "bg-gradient-to-br from-cyan-500/30 to-blue-500/30 border-cyan-400"
                                    : isEditing
                                    ? "bg-gradient-to-br from-amber-500/20 to-orange-500/20 border-amber-400"
                                    : "bg-zinc-800/50 border-zinc-700/50 hover:bg-zinc-700/50"
                                  }
                                  ${chordIndex === 0 ? "rounded-l-xl border-r-0" : "rounded-r-xl"}`}
                              >
                                <div className={`text-sm sm:text-base font-black transition-colors truncate max-w-full px-1 ${isChordPlaying ? "text-cyan-400" : isEditing ? "text-amber-400" : "text-white"}`}>
                                  {chord.chordName}
                                </div>
                                <div className="text-[10px] sm:text-xs text-zinc-500 truncate max-w-full">
                                  {chord.degreeName}
                                </div>
                              </button>
                              {/* Chord selector popup */}
                              {isEditing && (
                                <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl p-2 max-h-48 overflow-y-auto">
                                  <div className="grid grid-cols-4 gap-1">
                                    {allChords.slice(0, 40).map(c => (
                                      <button
                                        key={c.name}
                                        onClick={() => updateChord(barIndex, chordIndex, c.name)}
                                        className={`px-1.5 py-1 text-xs rounded transition-colors ${
                                          c.name === chord.chordName
                                            ? "bg-amber-500 text-white"
                                            : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                                        }`}
                                      >
                                        {c.name}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      /* Single chord bar */
                      <div className="relative">
                        <button
                          onClick={() => {
                            if (isPlaying) {
                              handlePlaySingle(bar.chords[0].chordName, barIndex, 0);
                            } else {
                              const isEditing = editingPosition?.bar === barIndex && editingPosition?.chord === 0;
                              setEditingPosition(isEditing ? null : { bar: barIndex, chord: 0 });
                            }
                          }}
                          className={`w-full p-4 rounded-xl transition-all duration-300 cursor-pointer border min-h-[70px] flex flex-col items-center justify-center
                            ${isBarPlaying
                              ? "bg-gradient-to-br from-cyan-500/30 to-blue-500/30 border-cyan-400"
                              : editingPosition?.bar === barIndex && editingPosition?.chord === 0
                              ? "bg-gradient-to-br from-amber-500/20 to-orange-500/20 border-amber-400"
                              : "bg-zinc-800/50 border-zinc-700/50 hover:bg-zinc-700/50"
                            }`}
                        >
                          <div className={`text-xl sm:text-2xl font-black transition-colors ${isBarPlaying ? "text-cyan-400" : editingPosition?.bar === barIndex ? "text-amber-400" : "text-white"}`}>
                            {bar.chords[0].chordName}
                          </div>
                          <div className="text-xs sm:text-sm text-zinc-500">
                            {bar.chords[0].degreeName}
                          </div>
                        </button>
                        {/* Chord selector popup */}
                        {editingPosition?.bar === barIndex && editingPosition?.chord === 0 && (
                          <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl p-2 max-h-48 overflow-y-auto">
                            <div className="grid grid-cols-4 gap-1">
                              {allChords.slice(0, 40).map(c => (
                                <button
                                  key={c.name}
                                  onClick={() => updateChord(barIndex, 0, c.name)}
                                  className={`px-1.5 py-1 text-xs rounded transition-colors ${
                                    c.name === bar.chords[0].chordName
                                      ? "bg-amber-500 text-white"
                                      : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                                  }`}
                                >
                                  {c.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Playing indicator */}
                    {isBarPlaying && (
                      <div className="absolute inset-0 rounded-xl border-2 border-cyan-400 animate-pulse pointer-events-none" />
                    )}
                  </div>
                );
              })}

              {/* Add bar button */}
              {!isPlaying && (
                <button
                  onClick={addBar}
                  className="min-h-[70px] rounded-xl border-2 border-dashed border-zinc-700 flex items-center justify-center text-zinc-500 hover:text-white hover:border-zinc-500 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              )}
            </div>

            {/* Progression as text */}
            <div className="mt-6 text-center">
              <div className="inline-flex flex-wrap items-center justify-center gap-2 px-4 py-2 bg-zinc-800/50 rounded-lg">
                <span className="text-zinc-500 text-sm">Progression:</span>
                <span className="text-white font-mono text-sm">
                  {progression.map(bar =>
                    bar.chords.length > 1
                      ? `(${bar.chords.map(c => c.degreeName).join("→")})`
                      : bar.chords[0].degreeName
                  ).join(" → ")}
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
