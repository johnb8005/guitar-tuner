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

    gainNode.connect(getMasterOutput());
    source.start(now + stringIndex * (strumDelay / 1000));
  });
}

let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let masterGain: GainNode | null = null;
let compressor: DynamicsCompressorNode | null = null;
let reverbSend: GainNode | null = null;
let reverbReturn: GainNode | null = null;
let convolver: ConvolverNode | null = null;

// Generate impulse response for reverb procedurally (no file loading!)
function createReverbImpulse(ctx: AudioContext, duration: number = 2.0, decay: number = 2.5): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = sampleRate * duration;
  const impulse = ctx.createBuffer(2, length, sampleRate);
  const leftChannel = impulse.getChannelData(0);
  const rightChannel = impulse.getChannelData(1);

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    // Exponential decay with some early reflections
    const envelope = Math.exp(-t * decay);
    // Add some diffusion with noise
    const noise = (Math.random() * 2 - 1);
    // Stereo decorrelation - slightly different for each channel
    leftChannel[i] = noise * envelope * (1 + Math.sin(i * 0.01) * 0.1);
    rightChannel[i] = noise * envelope * (1 + Math.cos(i * 0.01) * 0.1);
  }

  // Add early reflections for more realistic room sound
  const earlyReflections = [0.01, 0.02, 0.035, 0.05, 0.07];
  earlyReflections.forEach((time, idx) => {
    const samplePos = Math.floor(time * sampleRate);
    const level = 0.5 * Math.exp(-idx * 0.5);
    if (samplePos < length) {
      leftChannel[samplePos] += level * (Math.random() > 0.5 ? 1 : -1);
      rightChannel[samplePos] += level * (Math.random() > 0.5 ? 1 : -1);
    }
  });

  return impulse;
}

export function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();

    // Create analyser for visualization
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;

    // === EFFECTS CHAIN ===

    // 1. Master gain (input for all sounds)
    masterGain = audioContext.createGain();
    masterGain.gain.value = 1.0;

    // 2. Compressor - glues the mix, adds punch
    compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = -18;  // Start compressing at -18dB
    compressor.knee.value = 8;         // Soft knee for smoother compression
    compressor.ratio.value = 4;        // 4:1 ratio
    compressor.attack.value = 0.005;   // Fast attack for transients
    compressor.release.value = 0.15;   // Medium release

    // 3. Reverb send/return (parallel processing)
    reverbSend = audioContext.createGain();
    reverbSend.gain.value = 0.3;  // 30% wet signal

    reverbReturn = audioContext.createGain();
    reverbReturn.gain.value = 0.8;

    // Create convolver with procedural impulse
    convolver = audioContext.createConvolver();
    convolver.buffer = createReverbImpulse(audioContext, 2.2, 2.0);

    // Pre-reverb filter - cut low frequencies going into reverb (cleaner sound)
    const reverbHighpass = audioContext.createBiquadFilter();
    reverbHighpass.type = "highpass";
    reverbHighpass.frequency.value = 200;

    // Post-reverb filter - darken the reverb tail slightly
    const reverbLowpass = audioContext.createBiquadFilter();
    reverbLowpass.type = "lowpass";
    reverbLowpass.frequency.value = 6000;

    // === SIGNAL ROUTING ===
    // Dry path: masterGain → compressor → analyser → destination
    // Wet path: masterGain → reverbSend → highpass → convolver → lowpass → reverbReturn → compressor

    masterGain.connect(compressor);
    masterGain.connect(reverbSend);

    reverbSend.connect(reverbHighpass);
    reverbHighpass.connect(convolver);
    convolver.connect(reverbLowpass);
    reverbLowpass.connect(reverbReturn);
    reverbReturn.connect(compressor);

    compressor.connect(analyser);
    analyser.connect(audioContext.destination);
  }
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
  return audioContext;
}

// Control reverb amount (0-1)
export function setReverbAmount(amount: number): void {
  if (reverbSend) {
    reverbSend.gain.value = Math.max(0, Math.min(1, amount));
  }
}

// Get analyser node for visualizations
export function getAnalyser(): AnalyserNode | null {
  return analyser;
}

// Get master gain node - all sounds should connect to this instead of destination
export function getMasterOutput(): GainNode {
  getAudioContext(); // Ensure initialized
  return masterGain!;
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

// Strings pad sound - lush with chorus and filtering
export function playStrings(ctx: AudioContext, chordName: string, duration: number = 2.5): void {
  const frequencies = getChordFrequencies(chordName);
  const now = ctx.currentTime;

  frequencies.forEach((freq) => {
    // 4 detuned oscillators for thick chorus effect
    [-12, -4, 4, 12].forEach((detune, idx) => {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      osc.detune.value = detune;

      // Slow LFO modulation on each voice for movement
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 0.3 + idx * 0.15; // Slightly different rates
      lfoGain.gain.value = 6; // Subtle pitch wobble
      lfo.connect(lfoGain);
      lfoGain.connect(osc.detune);
      lfo.start(now);
      lfo.stop(now + duration + 0.1);

      // Multi-stage filtering for warmth
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = 1200;
      lowpass.Q.value = 0.7;

      // Filter envelope - opens slightly over time
      lowpass.frequency.setValueAtTime(400, now);
      lowpass.frequency.linearRampToValueAtTime(1400, now + 0.5);
      lowpass.frequency.setValueAtTime(1200, now + duration - 0.3);
      lowpass.frequency.linearRampToValueAtTime(300, now + duration);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.045, now + 0.4); // Slow attack
      gain.gain.setValueAtTime(0.04, now + duration - 0.6);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.connect(lowpass);
      lowpass.connect(gain);
      gain.connect(getMasterOutput());

      osc.start(now);
      osc.stop(now + duration + 0.1);
    });
  });
}

// Hammond organ sound - with rotary speaker simulation
export function playHammond(ctx: AudioContext, chordName: string, duration: number = 2.5): void {
  const frequencies = getChordFrequencies(chordName);
  const now = ctx.currentTime;

  // Hammond drawbar harmonics (classic jazz registration)
  const drawbars = [0.5, 1, 2, 3, 4, 6, 8]; // Sub-fundamental adds warmth
  const drawbarLevels = [0.5, 1.0, 0.7, 0.5, 0.3, 0.2, 0.15];

  // Create shared rotary speaker effect (Leslie simulation)
  const rotarySpeed = 5.5; // Hz - "chorale" speed

  frequencies.forEach(freq => {
    // Slight per-note detune for richness
    const noteDetune = (Math.random() - 0.5) * 4;

    drawbars.forEach((harmonic, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq * harmonic;
      osc.detune.value = noteDetune;

      // Rotary pitch modulation (doppler effect)
      const tremoloLFO = ctx.createOscillator();
      const tremoloGain = ctx.createGain();
      tremoloLFO.frequency.value = rotarySpeed + (i * 0.1); // Slightly different per harmonic
      tremoloGain.gain.value = 8 + (harmonic * 2); // Higher harmonics wobble more
      tremoloLFO.connect(tremoloGain);
      tremoloGain.connect(osc.detune);
      tremoloLFO.start(now);
      tremoloLFO.stop(now + duration + 0.1);

      // Amplitude modulation (rotary speaker)
      const ampLFO = ctx.createOscillator();
      const ampLFOGain = ctx.createGain();
      ampLFO.frequency.value = rotarySpeed;
      ampLFOGain.gain.value = 0.15; // Subtle tremolo

      const gain = ctx.createGain();
      const level = (drawbarLevels[i] || 0.1) * 0.055;

      ampLFO.connect(ampLFOGain);
      ampLFOGain.connect(gain.gain);
      ampLFO.start(now);
      ampLFO.stop(now + duration + 0.1);

      // Envelope
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(level, now + 0.015); // Snappy attack
      gain.gain.setValueAtTime(level, now + duration - 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      // Slight overdrive via waveshaper
      const waveshaper = ctx.createWaveShaper();
      const curve = new Float32Array(256);
      for (let j = 0; j < 256; j++) {
        const x = (j / 128) - 1;
        curve[j] = Math.tanh(x * 1.5); // Soft saturation
      }
      waveshaper.curve = curve;

      osc.connect(waveshaper);
      waveshaper.connect(gain);
      gain.connect(getMasterOutput());

      osc.start(now);
      osc.stop(now + duration + 0.1);
    });
  });
}

// Piano sound - realistic with hammer strike, string resonance, and natural decay
export function playPiano(ctx: AudioContext, chordName: string, duration: number = 2.5): void {
  const frequencies = getChordFrequencies(chordName);
  const now = ctx.currentTime;

  frequencies.forEach((freq, noteIndex) => {
    const noteStart = now + noteIndex * 0.025;

    // Piano inharmonicity - higher partials are sharper (string stiffness)
    const inharmonicity = 0.0005 * Math.pow(freq / 261.63, 1.5);

    // Harmonics with realistic inharmonicity and amplitude rolloff
    [1, 2, 3, 4, 5, 6, 7, 8].forEach((harmonic) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";

      // Inharmonic frequency calculation
      const harmonicFreq = freq * harmonic * Math.sqrt(1 + inharmonicity * harmonic * harmonic);
      osc.frequency.value = harmonicFreq;

      // Per-partial decay - higher harmonics decay faster
      const partialDecay = 2.5 + (1 / harmonic) * 3;

      // Amplitude decreases for higher partials (with slight randomness)
      const baseLevel = (0.09 / Math.pow(harmonic, 0.85)) * (0.9 + Math.random() * 0.2);

      const gain = ctx.createGain();

      // Percussive envelope with proper ADSR
      gain.gain.setValueAtTime(0, noteStart);
      gain.gain.linearRampToValueAtTime(baseLevel, noteStart + 0.003); // Very fast attack
      gain.gain.exponentialRampToValueAtTime(baseLevel * 0.6, noteStart + 0.08); // Quick initial decay
      gain.gain.exponentialRampToValueAtTime(baseLevel * 0.15, noteStart + 0.5); // Sustain level
      gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + Math.min(duration, partialDecay));

      osc.connect(gain);
      gain.connect(getMasterOutput());

      osc.start(noteStart);
      osc.stop(noteStart + duration + 0.1);
    });

    // Add "hammer thunk" - brief noise burst for attack transient
    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseData.length; i++) {
      noiseData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.008));
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = freq * 2;
    noiseFilter.Q.value = 2;

    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.04;

    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(getMasterOutput());

    noiseSource.start(noteStart);
    noiseSource.stop(noteStart + 0.05);
  });
}

// ============ MELODY SYNTH ============
// Warm, expressive lead - think Rhodes or soft synth lead

export function playMelodyNote(
  ctx: AudioContext,
  frequency: number,
  duration: number,
  startTime: number,
  volume: number = 0.15
): void {
  // Main oscillator - triangle for warmth
  const osc1 = ctx.createOscillator();
  osc1.type = "triangle";
  osc1.frequency.value = frequency;

  // Second oscillator - sine an octave up for shimmer
  const osc2 = ctx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.value = frequency * 2;
  osc2.detune.value = 5;

  // Third oscillator - slight detune for thickness
  const osc3 = ctx.createOscillator();
  osc3.type = "sine";
  osc3.frequency.value = frequency;
  osc3.detune.value = -8;

  // Expressive vibrato (delayed onset - more natural)
  const vibrato = ctx.createOscillator();
  const vibratoGain = ctx.createGain();
  vibrato.frequency.value = 5.0;
  vibratoGain.gain.setValueAtTime(0, startTime);
  vibratoGain.gain.linearRampToValueAtTime(0, startTime + Math.min(0.15, duration * 0.3));
  vibratoGain.gain.linearRampToValueAtTime(6, startTime + Math.min(0.35, duration * 0.5));
  vibrato.connect(vibratoGain);
  vibratoGain.connect(osc1.detune);
  vibratoGain.connect(osc3.detune);
  vibrato.start(startTime);
  vibrato.stop(startTime + duration + 0.15);

  // Filter with envelope - opens up on attack
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 1.5;
  filter.frequency.setValueAtTime(800, startTime);
  filter.frequency.linearRampToValueAtTime(2500, startTime + 0.05);
  filter.frequency.exponentialRampToValueAtTime(1800, startTime + 0.2);

  // Main envelope with smooth curves
  const gain = ctx.createGain();
  const attackTime = Math.min(0.04, duration * 0.1);
  const releaseTime = Math.min(0.12, duration * 0.2);

  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(volume, startTime + attackTime);
  gain.gain.setValueAtTime(volume * 0.8, startTime + duration - releaseTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  // Octave shimmer gain (quieter, fades in)
  const gain2 = ctx.createGain();
  gain2.gain.setValueAtTime(0, startTime);
  gain2.gain.linearRampToValueAtTime(volume * 0.15, startTime + 0.1);
  gain2.gain.setValueAtTime(volume * 0.12, startTime + duration - releaseTime);
  gain2.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  // Detune layer gain
  const gain3 = ctx.createGain();
  gain3.gain.setValueAtTime(0, startTime);
  gain3.gain.linearRampToValueAtTime(volume * 0.35, startTime + attackTime);
  gain3.gain.setValueAtTime(volume * 0.3, startTime + duration - releaseTime);
  gain3.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  // Connect main voice through filter
  osc1.connect(filter);
  filter.connect(gain);
  gain.connect(getMasterOutput());

  // Connect shimmer (bypasses main filter, has its own high cut)
  const shimmerFilter = ctx.createBiquadFilter();
  shimmerFilter.type = "lowpass";
  shimmerFilter.frequency.value = 4000;
  osc2.connect(shimmerFilter);
  shimmerFilter.connect(gain2);
  gain2.connect(getMasterOutput());

  // Connect detune layer
  osc3.connect(filter);

  osc1.start(startTime);
  osc1.stop(startTime + duration + 0.15);
  osc2.start(startTime);
  osc2.stop(startTime + duration + 0.15);
  osc3.start(startTime);
  osc3.stop(startTime + duration + 0.15);
}

// ============ BASS SYNTH ============
// Punchy, warm bass with sub and harmonic content

export function playBassNote(
  ctx: AudioContext,
  frequency: number,
  duration: number,
  startTime: number,
  volume: number = 0.32
): void {
  // Main oscillator - sawtooth for harmonic content
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.value = frequency;

  // Sub oscillator - pure sine one octave down
  const subOsc = ctx.createOscillator();
  subOsc.type = "sine";
  subOsc.frequency.value = frequency / 2;

  // Second harmonic for presence
  const osc2 = ctx.createOscillator();
  osc2.type = "triangle";
  osc2.frequency.value = frequency;
  osc2.detune.value = 3; // Slight detune for thickness

  // Filter with envelope - gives the "bwow" attack
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 4; // Resonant for character
  filter.frequency.setValueAtTime(800, startTime);
  filter.frequency.linearRampToValueAtTime(350, startTime + 0.08);
  filter.frequency.setValueAtTime(300, startTime + duration * 0.5);

  // Soft saturation for warmth
  const waveshaper = ctx.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = (i / 128) - 1;
    curve[i] = Math.tanh(x * 2);
  }
  waveshaper.curve = curve;

  // Main gain envelope - punchy attack
  const gain = ctx.createGain();
  const attackTime = 0.008;
  const releaseTime = Math.min(0.1, duration * 0.2);

  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(volume, startTime + attackTime);
  gain.gain.linearRampToValueAtTime(volume * 0.7, startTime + 0.05);
  gain.gain.setValueAtTime(volume * 0.65, startTime + duration - releaseTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  // Sub gain - slower attack, sustains longer
  const subGain = ctx.createGain();
  subGain.gain.setValueAtTime(0, startTime);
  subGain.gain.linearRampToValueAtTime(volume * 0.6, startTime + 0.02);
  subGain.gain.setValueAtTime(volume * 0.55, startTime + duration - releaseTime);
  subGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  // Second osc gain
  const gain2 = ctx.createGain();
  gain2.gain.setValueAtTime(0, startTime);
  gain2.gain.linearRampToValueAtTime(volume * 0.25, startTime + attackTime);
  gain2.gain.setValueAtTime(volume * 0.2, startTime + duration - releaseTime);
  gain2.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  // Route main osc through filter and saturation
  osc.connect(filter);
  osc2.connect(filter);
  filter.connect(waveshaper);
  waveshaper.connect(gain);
  gain.connect(getMasterOutput());

  // Sub goes direct (clean low end)
  const subFilter = ctx.createBiquadFilter();
  subFilter.type = "lowpass";
  subFilter.frequency.value = 120; // Only the fundamental
  subOsc.connect(subFilter);
  subFilter.connect(subGain);
  subGain.connect(getMasterOutput());

  osc.start(startTime);
  osc.stop(startTime + duration + 0.05);
  osc2.start(startTime);
  osc2.stop(startTime + duration + 0.05);
  subOsc.start(startTime);
  subOsc.stop(startTime + duration + 0.05);
}
