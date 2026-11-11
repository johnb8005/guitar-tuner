// Small DSP helpers shared by synths, drums and effects.

export type Ctx = BaseAudioContext;

const noiseCache = new WeakMap<Ctx, AudioBuffer>();
export function noiseBuffer(ctx: Ctx): AudioBuffer {
  let buf = noiseCache.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, buf);
  }
  return buf;
}

export function noise(
  ctx: Ctx,
  time: number,
  dur: number,
): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  src.start(time, Math.random() * 1.5);
  src.stop(time + dur);
  return src;
}

const curveCache = new Map<number, Float32Array>();
export function saturationCurve(drive: number): Float32Array {
  let c = curveCache.get(drive);
  if (!c) {
    c = new Float32Array(1024);
    const norm = Math.tanh(drive);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      c[i] = Math.tanh(x * drive) / norm;
    }
    curveCache.set(drive, c);
  }
  return c;
}

export function shaper(ctx: Ctx, drive: number): WaveShaperNode {
  const ws = ctx.createWaveShaper();
  ws.curve = saturationCurve(drive) as Float32Array<ArrayBuffer>;
  ws.oversample = "2x";
  return ws;
}

export function osc(
  ctx: Ctx,
  type: OscillatorType,
  freq: number,
  detune = 0,
): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = detune;
  return o;
}

export function gain(ctx: Ctx, value = 1): GainNode {
  const g = ctx.createGain();
  g.gain.value = value;
  return g;
}

export function filter(
  ctx: Ctx,
  type: BiquadFilterType,
  freq: number,
  q = 0.7,
): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

/**
 * ADSR on an AudioParam. Holds sustain until `time + dur`, then releases.
 * Returns the time the voice is fully silent.
 */
export function adsr(
  param: AudioParam,
  time: number,
  dur: number,
  peak: number,
  a: number,
  d: number,
  s: number,
  r: number,
): number {
  const sustain = Math.max(0.0001, peak * s);
  param.cancelScheduledValues(time);
  param.setValueAtTime(0.0001, time);
  const attackEnd = time + a;
  const noteEnd = Math.max(time + dur, time + 0.01);
  if (noteEnd <= attackEnd) {
    // Short note: release from wherever the attack got to
    const reached = 0.0001 + (peak - 0.0001) * ((noteEnd - time) / a);
    param.linearRampToValueAtTime(reached, noteEnd);
    param.setTargetAtTime(0.0001, noteEnd, r / 4);
    return noteEnd + r * 1.2;
  }
  param.linearRampToValueAtTime(peak, attackEnd);
  param.setTargetAtTime(sustain, attackEnd, Math.max(0.001, d / 3));
  param.setTargetAtTime(0.0001, noteEnd, r / 4);
  return noteEnd + r * 1.2;
}

/** Percussive decay envelope (exponential), returns end time. */
export function decay(
  param: AudioParam,
  time: number,
  peak: number,
  attack: number,
  decayTime: number,
): number {
  param.cancelScheduledValues(time);
  param.setValueAtTime(0.0001, time);
  param.linearRampToValueAtTime(peak, time + attack);
  param.exponentialRampToValueAtTime(0.0001, time + attack + decayTime);
  return time + attack + decayTime + 0.02;
}

export function stopAll(
  nodes: (AudioScheduledSourceNode | null | undefined)[],
  time: number,
) {
  for (const n of nodes) n?.stop(time);
}

/** Procedural stereo reverb impulse with darkening tail and early reflections. */
export function reverbImpulse(
  ctx: Ctx,
  seconds = 2.8,
  decaySpeed = 2.4,
  predelay = 0.018,
): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const ir = ctx.createBuffer(2, length, rate);
  const pre = Math.floor(predelay * rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < length; i++) {
      const t = (i - pre) / rate;
      // One-pole lowpass whose cutoff falls over time → darker tail like a real room
      const coeff = Math.min(0.92, 0.15 + t * 0.35);
      const n = Math.random() * 2 - 1;
      lp = lp * coeff + n * (1 - coeff);
      data[i] = lp * Math.exp(-t * decaySpeed) * 1.6;
    }
    const reflections = [0.007, 0.013, 0.019, 0.027, 0.041, 0.053];
    reflections.forEach((r, k) => {
      const idx = pre + Math.floor((r + ch * 0.0023) * rate);
      if (idx < length)
        data[idx] =
          (data[idx] ?? 0) + (k % 2 ? -1 : 1) * 0.5 * Math.exp(-k * 0.35);
    });
  }
  return ir;
}

/**
 * Pre-render a Karplus–Strong plucked string into a buffer (cached).
 * The loop length is an integer number of samples, so we return the playbackRate
 * that corrects the tiny tuning error.
 */
const ksCache = new WeakMap<
  Ctx,
  Map<string, { buffer: AudioBuffer; rate: number }>
>();
export function karplus(
  ctx: Ctx,
  freq: number,
  seconds: number,
  brightness = 0.5,
  damping = 0.996,
) {
  let map = ksCache.get(ctx);
  if (!map) ksCache.set(ctx, (map = new Map()));
  const key = `${freq.toFixed(2)}:${seconds}:${brightness}:${damping}`;
  const cached = map.get(key);
  if (cached) return cached;
  const sr = ctx.sampleRate;
  // y[n] = ½(y[n-L] + y[n-L+1]) has an effective period of L − ½ samples
  const L = Math.max(2, Math.round(sr / freq + 0.5));
  const actual = sr / (L - 0.5);
  const buffer = ctx.createBuffer(1, Math.floor(sr * seconds), sr);
  const data = buffer.getChannelData(0);
  const line = new Float32Array(L);
  let prev = 0;
  for (let i = 0; i < L; i++) {
    const n = Math.random() * 2 - 1;
    prev = prev + (n - prev) * (0.2 + brightness * 0.8);
    line[i] = prev;
  }
  // Remove DC from the excitation
  const mean = line.reduce((a, b) => a + b, 0) / L;
  for (let i = 0; i < L; i++) line[i]! -= mean;
  // Higher notes lose energy faster, like real strings
  const loss = Math.min(
    0.9995,
    damping + (1 - damping) * Math.min(1, 110 / freq) * 0.5,
  );
  let idx = 0;
  for (let i = 0; i < data.length; i++) {
    const a = line[idx]!;
    const b = line[(idx + 1) % L]!;
    data[i] = a;
    line[idx] = (a + b) * 0.5 * loss;
    idx = (idx + 1) % L;
  }
  const fade = Math.floor(sr * 0.05);
  for (let i = 0; i < fade; i++) data[data.length - 1 - i]! *= i / fade;
  const result = { buffer, rate: freq / actual };
  map.set(key, result);
  return result;
}
