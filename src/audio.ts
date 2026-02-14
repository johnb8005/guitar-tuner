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
