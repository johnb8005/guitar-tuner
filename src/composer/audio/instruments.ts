// Instrument catalogue: synthesised voices plus multi-sampled instruments that
// stream real recordings (Salamander Grand Piano, FluidR3 GM soundfont) on demand.
// Sampled instruments play their synth fallback until samples have loaded.

import { midiToFreq } from "../theory";
import type { Ctx } from "./dsp";
import { filter, gain } from "./dsp";
import * as S from "./synths";
import type { PlayFn } from "./synths";
import type { KitId } from "./drums";

export type Family = "keys" | "lead" | "pad" | "pluck" | "bass" | "drums";

export type SampleSource = {
  urls: Record<number, string>; // midi → url
  release: number;
  attack?: number;
  sustain: boolean; // sustained (bowed/blown) vs. decaying (struck/plucked)
  gain: number;
};

export type InstrumentDef = {
  id: string;
  name: string;
  family: Family;
  kind: "synth" | "sampled" | "kit";
  synth?: PlayFn; // synth voice (or fallback for sampled)
  sample?: SampleSource;
  gm: number; // General MIDI program for MIDI export
  kit?: KitId;
};

const NOTE_SHARP_S = ["C", "Cs", "D", "Ds", "E", "F", "Fs", "G", "Gs", "A", "As", "B"];
const NOTE_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const octave = (m: number) => Math.floor(m / 12) - 1;

function salamander(): Record<number, string> {
  const urls: Record<number, string> = {};
  // Every minor third from A0..C8; we load the playable middle range.
  for (let m = 33; m <= 96; m += 3) {
    urls[m] = `https://tonejs.github.io/audio/salamander/${NOTE_SHARP_S[m % 12]}${octave(m)}.mp3`;
  }
  return urls;
}

function fluid(instrument: string, low: number, high: number, step = 3): Record<number, string> {
  const urls: Record<number, string> = {};
  for (let m = low; m <= high; m += step) {
    urls[m] = `https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/${instrument}-mp3/${NOTE_FLAT[m % 12]}${octave(m)}.mp3`;
  }
  return urls;
}

export const INSTRUMENTS: InstrumentDef[] = [
  // Keys
  { id: "grand-piano", name: "Grand Piano", family: "keys", kind: "sampled", synth: S.synthPiano, gm: 0, sample: { urls: salamander(), release: 0.45, sustain: false, gain: 1.1 } },
  { id: "rhodes", name: "Electric Piano (FM)", family: "keys", kind: "synth", synth: S.rhodes, gm: 4 },
  { id: "sampled-ep", name: "Electric Piano (sampled)", family: "keys", kind: "sampled", synth: S.rhodes, gm: 4, sample: { urls: fluid("electric_piano_1", 36, 96), release: 0.35, sustain: false, gain: 1.2 } },
  { id: "synth-piano", name: "Additive Piano", family: "keys", kind: "synth", synth: S.synthPiano, gm: 0 },
  { id: "poly-synth", name: "Poly Synth", family: "keys", kind: "synth", synth: S.polySynth, gm: 90 },
  { id: "nylon-guitar", name: "Nylon Guitar", family: "pluck", kind: "sampled", synth: S.pluck, gm: 24, sample: { urls: fluid("acoustic_guitar_nylon", 40, 88), release: 0.3, sustain: false, gain: 1.3 } },
  // Plucks & mallets
  { id: "pluck", name: "String Pluck (Karplus)", family: "pluck", kind: "synth", synth: S.pluck, gm: 46 },
  { id: "harp", name: "Concert Harp", family: "pluck", kind: "sampled", synth: S.pluck, gm: 46, sample: { urls: fluid("orchestral_harp", 36, 96), release: 0.6, sustain: false, gain: 1.2 } },
  { id: "marimba", name: "Marimba", family: "pluck", kind: "sampled", synth: S.marimbaSynth, gm: 12, sample: { urls: fluid("marimba", 48, 96), release: 0.2, sustain: false, gain: 1.2 } },
  { id: "marimba-synth", name: "Marimba (modal)", family: "pluck", kind: "synth", synth: S.marimbaSynth, gm: 12 },
  // Leads
  { id: "bell-lead", name: "FM Bell Lead", family: "lead", kind: "synth", synth: S.bellLead, gm: 8 },
  { id: "vibraphone", name: "Vibraphone", family: "lead", kind: "sampled", synth: S.vibesSynth, gm: 11, sample: { urls: fluid("vibraphone", 48, 96), release: 0.6, sustain: false, gain: 1.2 } },
  { id: "saw-lead", name: "Saw Lead", family: "lead", kind: "synth", synth: S.sawLead, gm: 81 },
  { id: "soft-lead", name: "Soft Lead", family: "lead", kind: "synth", synth: S.softLead, gm: 80 },
  { id: "flute", name: "Flute", family: "lead", kind: "sampled", synth: S.fluteSynth, gm: 73, sample: { urls: fluid("flute", 60, 96), release: 0.2, attack: 0.03, sustain: true, gain: 1.1 } },
  { id: "strings-solo", name: "Solo Violin", family: "lead", kind: "sampled", synth: S.soloStringSynth, gm: 40, sample: { urls: fluid("violin", 55, 96), release: 0.3, attack: 0.05, sustain: true, gain: 1.1 } },
  { id: "trumpet", name: "Trumpet", family: "lead", kind: "sampled", synth: S.brassSynth, gm: 56, sample: { urls: fluid("trumpet", 54, 84), release: 0.15, attack: 0.02, sustain: true, gain: 1 } },
  // Pads
  { id: "warm-pad", name: "Warm Analog Pad", family: "pad", kind: "synth", synth: S.warmPad, gm: 89 },
  { id: "supersaw-pad", name: "Supersaw Pad", family: "pad", kind: "synth", synth: S.supersawPad, gm: 90 },
  { id: "tape-pad", name: "Tape Pad", family: "pad", kind: "synth", synth: S.tapePad, gm: 88 },
  { id: "string-ensemble", name: "String Ensemble", family: "pad", kind: "sampled", synth: S.stringsSynth, gm: 48, sample: { urls: fluid("string_ensemble_1", 36, 96), release: 0.6, attack: 0.15, sustain: true, gain: 0.9 } },
  { id: "synth-strings", name: "Synth Strings", family: "pad", kind: "synth", synth: S.stringsSynth, gm: 50 },
  { id: "choir", name: "Choir", family: "pad", kind: "sampled", synth: S.choirSynth, gm: 52, sample: { urls: fluid("choir_aahs", 48, 84), release: 0.6, attack: 0.2, sustain: true, gain: 0.9 } },
  // Bass
  { id: "finger-bass", name: "Finger Bass", family: "bass", kind: "sampled", synth: S.fingerBassSynth, gm: 33, sample: { urls: fluid("electric_bass_finger", 28, 60), release: 0.12, sustain: false, gain: 1.3 } },
  { id: "upright-bass", name: "Upright Bass", family: "bass", kind: "sampled", synth: S.uprightSynth, gm: 32, sample: { urls: fluid("acoustic_bass", 28, 60), release: 0.12, sustain: false, gain: 1.4 } },
  { id: "sub-bass", name: "Sub Bass", family: "bass", kind: "synth", synth: S.subBass, gm: 38 },
  { id: "analog-bass", name: "Analog Bass", family: "bass", kind: "synth", synth: S.analogBass, gm: 39 },
  { id: "pluck-bass", name: "Plucked Bass (Karplus)", family: "bass", kind: "synth", synth: S.fingerBassSynth, gm: 33 },
  { id: "cello-bass", name: "Cello", family: "bass", kind: "sampled", synth: S.celloSynth, gm: 42, sample: { urls: fluid("cello", 36, 72), release: 0.3, attack: 0.04, sustain: true, gain: 1.1 } },
  // Drum kits
  { id: "acoustic-kit", name: "Studio Kit", family: "drums", kind: "kit", kit: "acoustic-kit", gm: 0 },
  { id: "lofi-kit", name: "Dusty Lo-fi Kit", family: "drums", kind: "kit", kit: "lofi-kit", gm: 0 },
  { id: "jazz-kit", name: "Brush & Ride Kit", family: "drums", kind: "kit", kit: "jazz-kit", gm: 0 },
  { id: "electro-kit", name: "808 Electro Kit", family: "drums", kind: "kit", kit: "electro-kit", gm: 0 },
  { id: "taiko-kit", name: "Taiko Ensemble", family: "drums", kind: "kit", kit: "taiko-kit", gm: 0 },
];

export function getInstrument(id: string): InstrumentDef {
  return INSTRUMENTS.find((i) => i.id === id) ?? INSTRUMENTS[0]!;
}

// ---------------- Sample loading ----------------

export type LoadState = "idle" | "loading" | "ready" | "error";
type SampleBank = { state: LoadState; buffers: Map<number, AudioBuffer>; progress: number; promise?: Promise<void> };

const banks = new Map<string, SampleBank>();
const listeners = new Set<() => void>();
export const onSampleState = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const notify = () => listeners.forEach((l) => l());

export function sampleState(id: string): { state: LoadState; progress: number } {
  const def = getInstrument(id);
  if (def.kind !== "sampled") return { state: "ready", progress: 1 };
  const b = banks.get(id);
  return b ? { state: b.state, progress: b.progress } : { state: "idle", progress: 0 };
}

export function loadInstrument(id: string, ctx: BaseAudioContext): Promise<void> {
  const def = getInstrument(id);
  if (def.kind !== "sampled" || !def.sample) return Promise.resolve();
  let bank = banks.get(id);
  if (bank?.promise && bank.state !== "error") return bank.promise;
  bank = { state: "loading", buffers: new Map(), progress: 0 };
  banks.set(id, bank);
  notify();
  const entries = Object.entries(def.sample.urls);
  let done = 0;
  const b = bank;
  b.promise = Promise.all(
    entries.map(async ([midi, url]) => {
      try {
        const res = await fetch(url, { mode: "cors" });
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.arrayBuffer();
        const buf = await ctx.decodeAudioData(data);
        b.buffers.set(Number(midi), buf);
      } catch {
        /* missing sample: neighbours will cover it */
      } finally {
        done++;
        b.progress = done / entries.length;
        notify();
      }
    })
  ).then(() => {
    // Usable if most of the zones loaded
    b.state = b.buffers.size >= entries.length * 0.6 ? "ready" : "error";
    notify();
  });
  return b.promise;
}

/** Offset into the sample where sound actually starts (some soundfont mp3s have padding). */
const onsetCache = new WeakMap<AudioBuffer, number>();
function soundStart(buf: AudioBuffer): number {
  let v = onsetCache.get(buf);
  if (v === undefined) {
    const d = buf.getChannelData(0);
    let i = 0;
    const limit = Math.min(d.length, Math.floor(buf.sampleRate * 0.1));
    while (i < limit && Math.abs(d[i]!) < 0.003) i++;
    v = Math.max(0, i / buf.sampleRate - 0.002);
    onsetCache.set(buf, v);
  }
  return v;
}

function playSample(ctx: Ctx, out: AudioNode, def: InstrumentDef, bank: SampleBank, midi: number, time: number, dur: number, vel: number) {
  const s = def.sample!;
  let best = -1;
  let bestDist = Infinity;
  for (const m of bank.buffers.keys()) {
    const d = Math.abs(m - midi);
    if (d < bestDist || (d === bestDist && m > midi)) {
      bestDist = d;
      best = m;
    }
  }
  const buffer = bank.buffers.get(best);
  if (!buffer) return def.synth?.(ctx, out, midi, time, dur, vel);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = Math.pow(2, (midi - best) / 12);
  // Velocity → loudness and brightness (fakes multiple velocity layers)
  const v = Math.pow(vel, 1.4);
  const tone = filter(ctx, "lowpass", 1200 + v * 12000 + Math.max(0, midi - 60) * 80, 0.5);
  const amp = gain(ctx, 0);
  const peak = s.gain * (0.15 + v * 0.85) * 0.55;
  const attack = s.attack ?? 0.003;
  const start = soundStart(buffer);
  const available = (buffer.duration - start) / src.playbackRate.value;
  const noteEnd = time + Math.min(Math.max(dur, 0.05), available);
  amp.gain.setValueAtTime(0.0001, time);
  amp.gain.linearRampToValueAtTime(peak, time + attack);
  if (s.sustain) amp.gain.setValueAtTime(peak, noteEnd);
  amp.gain.setTargetAtTime(0.0001, noteEnd, s.release / 4);
  src.connect(tone).connect(amp).connect(out);
  src.start(time, start);
  src.stop(Math.min(noteEnd + s.release * 1.5, time + available));
}

export function playNote(ctx: Ctx, out: AudioNode, id: string, midi: number, time: number, dur: number, vel: number) {
  const def = getInstrument(id);
  if (def.kind === "sampled") {
    const bank = banks.get(id);
    if (bank && bank.state === "ready") return playSample(ctx, out, def, bank, midi, time, dur, vel);
  }
  def.synth?.(ctx, out, midi, time, dur, vel);
}

export { midiToFreq };
