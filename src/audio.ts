// Shared audio utilities

// Standard tuning open string frequencies (low to high: E A D G B E)
export const openStringFrequencies = [82.41, 110.0, 146.83, 196.0, 246.94, 329.63];

// Calculate frequency for a fretted note
export function getFretFrequency(stringIndex: number, fret: number): number {
  if (fret < 0) return 0; // muted string
  const openFreq = openStringFrequencies[stringIndex];
  return openFreq * Math.pow(2, fret / 12);
}

// Karplus-Strong algorithm for realistic plucked string synthesis
export function createPluckedString(
  ctx: AudioContext,
  frequency: number,
  duration: number = 2
): { source: AudioBufferSourceNode; gainNode: GainNode } {
  const sampleRate = ctx.sampleRate;
  const bufferSize = Math.round(sampleRate / frequency);
  const outputSamples = Math.round(sampleRate * duration);

  const buffer = ctx.createBuffer(1, outputSamples, sampleRate);
  const output = buffer.getChannelData(0);

  const delayLine = new Float32Array(bufferSize);
  for (let i = 0; i < bufferSize; i++) {
    const noise = Math.random() * 2 - 1;
    const triangle = 1 - Math.abs((i / bufferSize) * 2 - 1);
    delayLine[i] = noise * 0.7 + triangle * 0.3;
  }

  let index = 0;
  const damping = 0.996;
  const smoothing = 0.5;

  for (let i = 0; i < outputSamples; i++) {
    output[i] = delayLine[index];
    const nextIndex = (index + 1) % bufferSize;
    const averaged = smoothing * delayLine[index] + (1 - smoothing) * delayLine[nextIndex];
    delayLine[index] = averaged * damping;
    index = nextIndex;
  }

  for (let i = 0; i < outputSamples; i++) {
    const t = i / sampleRate;
    const envelope = Math.exp(-t * 1.5);
    output[i] *= envelope;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const bodyFilter = ctx.createBiquadFilter();
  bodyFilter.type = "peaking";
  bodyFilter.frequency.value = 200;
  bodyFilter.Q.value = 1;
  bodyFilter.gain.value = 3;

  const highShelf = ctx.createBiquadFilter();
  highShelf.type = "highshelf";
  highShelf.frequency.value = 4000;
  highShelf.gain.value = -3;

  const gainNode = ctx.createGain();
  gainNode.gain.value = 0.4;

  source.connect(bodyFilter);
  bodyFilter.connect(highShelf);
  highShelf.connect(gainNode);

  return { source, gainNode };
}

// Play a chord with strum effect
export function playChord(
  ctx: AudioContext,
  frets: number[],
  strumDelay: number = 30
): void {
  const now = ctx.currentTime;

  // Play from low string to high (index 0 is low E)
  frets.forEach((fret, stringIndex) => {
    if (fret < 0) return; // skip muted strings

    const frequency = getFretFrequency(stringIndex, fret);
    const { source, gainNode } = createPluckedString(ctx, frequency, 2.5);

    gainNode.connect(ctx.destination);
    source.start(now + stringIndex * (strumDelay / 1000));
  });
}

let audioContext: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
  return audioContext;
}

// Note frequencies for synth instruments (C3 = middle C area)
export const noteFrequencies: Record<string, number> = {
  "C": 130.81, "C#": 138.59, "D": 146.83, "D#": 155.56, "E": 164.81,
  "F": 174.61, "F#": 185.00, "G": 196.00, "G#": 207.65, "A": 220.00,
  "A#": 233.08, "B": 246.94
};

// Get frequency for a note name with octave offset (0 = C3, 1 = C4, etc.)
export function getNoteFrequency(noteName: string, octaveOffset: number = 0): number {
  const baseFreq = noteFrequencies[noteName] || 130.81;
  return baseFreq * Math.pow(2, octaveOffset);
}

// Parse chord name to get root note and type
function parseChordName(name: string): { root: string; type: string } {
  const match = name.match(/^([A-G]#?)(.*)$/);
  if (!match) return { root: "C", type: "" };
  return { root: match[1], type: match[2] };
}

// Get frequencies for chord notes
export function getChordFrequencies(chordName: string): number[] {
  const { root, type } = parseChordName(chordName);
  const rootFreq = noteFrequencies[root] || 130.81;

  // Intervals in semitones for different chord types
  let intervals: number[];
  if (type.includes("dim")) {
    intervals = [0, 3, 6]; // diminished
  } else if (type.includes("m7")) {
    intervals = [0, 3, 7, 10]; // minor 7
  } else if (type.includes("maj7")) {
    intervals = [0, 4, 7, 11]; // major 7
  } else if (type.includes("7")) {
    intervals = [0, 4, 7, 10]; // dominant 7
  } else if (type.includes("m")) {
    intervals = [0, 3, 7]; // minor
  } else if (type.includes("sus2")) {
    intervals = [0, 2, 7]; // sus2
  } else if (type.includes("sus4")) {
    intervals = [0, 5, 7]; // sus4
  } else {
    intervals = [0, 4, 7]; // major
  }

  return intervals.map(i => rootFreq * Math.pow(2, i / 12));
}

// Strings pad sound - filtered sawtooth with slow attack
export function playStrings(ctx: AudioContext, chordName: string, duration: number = 2.5): void {
  const frequencies = getChordFrequencies(chordName);
  const now = ctx.currentTime;

  frequencies.forEach((freq, i) => {
    // Two detuned oscillators for richness
    [-4, 4].forEach(detune => {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      osc.detune.value = detune;

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 800;
      filter.Q.value = 1;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.3); // slow attack
      gain.gain.setValueAtTime(0.08, now + duration - 0.5);
      gain.gain.linearRampToValueAtTime(0, now + duration);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + duration);
    });
  });
}

// Hammond organ sound - multiple harmonics (drawbars)
export function playHammond(ctx: AudioContext, chordName: string, duration: number = 2.5): void {
  const frequencies = getChordFrequencies(chordName);
  const now = ctx.currentTime;

  // Hammond drawbar harmonics: fundamental, 2nd, 3rd, 4th, etc.
  const drawbars = [1, 2, 3, 4, 6, 8];
  const drawbarLevels = [0.8, 0.6, 0.4, 0.3, 0.2, 0.15];

  frequencies.forEach(freq => {
    drawbars.forEach((harmonic, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq * harmonic;

      const gain = ctx.createGain();
      const level = (drawbarLevels[i] || 0.1) * 0.06;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(level, now + 0.02); // quick attack
      gain.gain.setValueAtTime(level, now + duration - 0.1);
      gain.gain.linearRampToValueAtTime(0, now + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + duration);
    });
  });
}

// Piano sound - percussive with harmonics
export function playPiano(ctx: AudioContext, chordName: string, duration: number = 2.5): void {
  const frequencies = getChordFrequencies(chordName);
  const now = ctx.currentTime;

  frequencies.forEach((freq, noteIndex) => {
    // Multiple harmonics with decreasing amplitude
    [1, 2, 3, 4, 5].forEach((harmonic, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq * harmonic;

      // Slight inharmonicity for realism
      if (harmonic > 1) {
        osc.detune.value = harmonic * 2;
      }

      const gain = ctx.createGain();
      const baseLevel = 0.12 / Math.pow(harmonic, 0.7);

      // Percussive envelope
      gain.gain.setValueAtTime(baseLevel, now + noteIndex * 0.02);
      gain.gain.exponentialRampToValueAtTime(baseLevel * 0.3, now + noteIndex * 0.02 + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + noteIndex * 0.02);
      osc.stop(now + duration);
    });
  });
}

// ============ MELODY SYNTH ============
// Sine wave with slight vibrato for clear, singing melody

export function playMelodyNote(
  ctx: AudioContext,
  frequency: number,
  duration: number,
  startTime: number,
  volume: number = 0.2
): void {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = frequency;

  // Slight vibrato for expressiveness
  const vibrato = ctx.createOscillator();
  const vibratoGain = ctx.createGain();
  vibrato.frequency.value = 5; // 5Hz vibrato rate
  vibratoGain.gain.value = 3; // 3 cents depth
  vibrato.connect(vibratoGain);
  vibratoGain.connect(osc.detune);
  vibrato.start(startTime);
  vibrato.stop(startTime + duration);

  // Smooth envelope
  const gain = ctx.createGain();
  const attackTime = Math.min(0.05, duration * 0.1);
  const releaseTime = Math.min(0.1, duration * 0.2);

  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(volume, startTime + attackTime);
  gain.gain.setValueAtTime(volume, startTime + duration - releaseTime);
  gain.gain.linearRampToValueAtTime(0, startTime + duration);

  // Gentle high-pass to remove mud
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 200;

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  osc.start(startTime);
  osc.stop(startTime + duration + 0.01);
}

// ============ BASS SYNTH ============
// Warm triangle wave with low-pass filter

export function playBassNote(
  ctx: AudioContext,
  frequency: number,
  duration: number,
  startTime: number,
  volume: number = 0.35
): void {
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = frequency;

  // Sub oscillator for extra low end
  const subOsc = ctx.createOscillator();
  subOsc.type = "sine";
  subOsc.frequency.value = frequency / 2;

  // Low-pass filter for warmth
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 400;
  filter.Q.value = 1;

  // Main gain envelope
  const gain = ctx.createGain();
  const attackTime = 0.02;
  const releaseTime = Math.min(0.15, duration * 0.3);

  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(volume, startTime + attackTime);
  gain.gain.setValueAtTime(volume, startTime + duration - releaseTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  // Sub gain
  const subGain = ctx.createGain();
  subGain.gain.setValueAtTime(0, startTime);
  subGain.gain.linearRampToValueAtTime(volume * 0.5, startTime + attackTime);
  subGain.gain.setValueAtTime(volume * 0.5, startTime + duration - releaseTime);
  subGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  subOsc.connect(subGain);
  subGain.connect(ctx.destination);

  osc.start(startTime);
  osc.stop(startTime + duration + 0.01);
  subOsc.start(startTime);
  subOsc.stop(startTime + duration + 0.01);
}
