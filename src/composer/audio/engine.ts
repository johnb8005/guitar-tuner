// Mixer graph + look-ahead scheduler.
//
// Each track has a channel strip (insert → pan → fader → sends). The master bus
// runs through gentle EQ, a glue compressor and a limiter. The same graph builder
// is used for live playback and for offline WAV rendering.

import type { Piece } from "../generate";
import { TRACK_IDS, type TrackId } from "../styles";
import { filter, gain, noiseBuffer, reverbImpulse, type Ctx } from "./dsp";
import { kitInsert, playDrum, type KitId } from "./drums";
import { getInstrument, loadInstrument, playNote } from "./instruments";

export type TrackMix = { instrument: string; volume: number; mute: boolean; solo: boolean };
export type Mix = { tracks: Record<TrackId, TrackMix>; reverb: number; delay: number; vinyl: boolean };

const PAN: Record<TrackId, number> = { lead: 0.05, keys: -0.2, pad: 0.15, arp: 0.35, bass: 0, drums: 0 };
const REVERB_SEND: Record<TrackId, number> = { lead: 0.35, keys: 0.25, pad: 0.5, arp: 0.4, bass: 0.03, drums: 0.12 };
const DELAY_SEND: Record<TrackId, number> = { lead: 0.22, keys: 0.04, pad: 0, arp: 0.3, bass: 0, drums: 0 };
const TRACK_GAIN: Record<TrackId, number> = { lead: 0.9, keys: 0.7, pad: 0.55, arp: 0.45, bass: 0.85, drums: 0.8 };

type Channel = { input: GainNode; insertOut: AudioNode; panner: StereoPannerNode; fader: GainNode; kit?: KitId };

export type Graph = {
  ctx: Ctx;
  channels: Record<TrackId, Channel>;
  analyser: AnalyserNode;
  setTempo(bpm: number): void;
  apply(mix: Mix): void;
};

function makeCrackle(ctx: Ctx): AudioBuffer {
  const sr = ctx.sampleRate;
  const buf = ctx.createBuffer(2, sr * 6, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < d.length; i++) {
      lp = lp * 0.85 + (Math.random() * 2 - 1) * 0.15;
      d[i] = lp * 0.08; // soft hiss
      if (Math.random() < 0.00035) {
        const amp = (Math.random() * 0.6 + 0.2) * (Math.random() < 0.5 ? -1 : 1);
        for (let k = 0; k < 30 && i + k < d.length; k++) d[i + k]! += amp * Math.exp(-k / 4);
      }
    }
  }
  return buf;
}

export function buildGraph(ctx: Ctx, mix: Mix, bpm: number, destination: AudioNode = ctx.destination): Graph {
  // Master chain
  const bus = gain(ctx, 1);
  const low = filter(ctx, "lowshelf", 110, 0.7);
  low.gain.value = 1.5;
  const high = filter(ctx, "highshelf", 9000, 0.7);
  high.gain.value = 2;
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -16;
  glue.ratio.value = 2.5;
  glue.knee.value = 6;
  glue.attack.value = 0.02;
  glue.release.value = 0.25;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.ratio.value = 20;
  limiter.knee.value = 0;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.1;
  const out = gain(ctx, 0.95);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.8;
  bus.connect(low).connect(high).connect(glue).connect(limiter).connect(out).connect(analyser).connect(destination);

  // Reverb
  const reverbIn = gain(ctx, 1);
  const verbHp = filter(ctx, "highpass", 220, 0.7);
  const convolver = ctx.createConvolver();
  convolver.buffer = reverbImpulse(ctx);
  const reverbOut = gain(ctx, mix.reverb);
  reverbIn.connect(verbHp).connect(convolver).connect(reverbOut).connect(bus);

  // Ping-pong delay (dotted eighth)
  const delayIn = gain(ctx, 1);
  const dl = ctx.createDelay(2);
  const dr = ctx.createDelay(2);
  const fb = gain(ctx, 0.38);
  const dTone = filter(ctx, "lowpass", 3200, 0.5);
  const merger = ctx.createChannelMerger(2);
  const delayOut = gain(ctx, mix.delay);
  delayIn.connect(dTone).connect(dl);
  dl.connect(merger, 0, 0);
  dl.connect(dr);
  dr.connect(merger, 0, 1);
  dr.connect(fb).connect(dl);
  merger.connect(delayOut).connect(bus);
  delayOut.connect(reverbIn);

  // Vinyl crackle bed
  const crackleGain = gain(ctx, 0);
  const crackle = ctx.createBufferSource();
  crackle.buffer = makeCrackle(ctx);
  crackle.loop = true;
  crackle.connect(filter(ctx, "highpass", 600, 0.5)).connect(crackleGain).connect(bus);
  crackle.start();
  void noiseBuffer(ctx); // warm the noise cache

  const channels = {} as Record<TrackId, Channel>;
  for (const id of TRACK_IDS) {
    const input = gain(ctx, 1);
    const panner = ctx.createStereoPanner();
    panner.pan.value = PAN[id];
    const fader = gain(ctx, 0);
    input.connect(panner).connect(fader).connect(bus);
    const rs = gain(ctx, REVERB_SEND[id]);
    const ds = gain(ctx, DELAY_SEND[id]);
    fader.connect(rs).connect(reverbIn);
    fader.connect(ds).connect(delayIn);
    channels[id] = { input, insertOut: input, panner, fader };
  }

  const setDrumKit = (kit: KitId) => {
    const ch = channels.drums;
    if (ch.kit === kit) return;
    ch.input.disconnect();
    const insert = kitInsert(ctx, kit);
    ch.input.connect(insert.input);
    insert.output.connect(ch.panner);
    ch.kit = kit;
  };

  const graph: Graph = {
    ctx,
    channels,
    analyser,
    setTempo(t) {
      const spb = 60 / t;
      dl.delayTime.value = spb * 0.75;
      dr.delayTime.value = spb * 0.75;
    },
    apply(m) {
      const anySolo = TRACK_IDS.some((id) => m.tracks[id].solo);
      const now = ctx.currentTime;
      for (const id of TRACK_IDS) {
        const t = m.tracks[id];
        const audible = !t.mute && (!anySolo || t.solo);
        const g = audible ? t.volume * TRACK_GAIN[id] : 0;
        channels[id].fader.gain.setTargetAtTime(g, now, 0.02);
      }
      const kit = getInstrument(m.tracks.drums.instrument).kit ?? "acoustic-kit";
      setDrumKit(kit);
      reverbOut.gain.setTargetAtTime(m.reverb, now, 0.05);
      delayOut.gain.setTargetAtTime(m.delay, now, 0.05);
      crackleGain.gain.setTargetAtTime(m.vinyl ? 0.3 : 0, now, 0.1);
    },
  };
  graph.setTempo(bpm);
  graph.apply(mix);
  return graph;
}

type Ev = { time: number; track: TrackId; midi?: number; dur?: number; vel: number; drum?: string };

function flatten(piece: Piece): Ev[] {
  return [
    ...piece.notes.map((n) => ({ time: n.time, track: n.track, midi: n.midi, dur: n.dur, vel: n.vel })),
    ...piece.drums.map((d) => ({ time: d.time, track: "drums" as const, drum: d.drum, vel: d.vel })),
  ].sort((a, b) => a.time - b.time);
}

function scheduleEvent(graph: Graph, gates: Record<TrackId, AudioNode>, mix: Mix, ev: Ev, when: number, spb: number) {
  const out = gates[ev.track];
  const inst = mix.tracks[ev.track].instrument;
  if (ev.track === "drums") {
    const kit = getInstrument(inst).kit ?? "acoustic-kit";
    playDrum(graph.ctx, out, kit, ev.drum as never, when, ev.vel);
  } else {
    playNote(graph.ctx, out, inst, ev.midi!, when, ev.dur! * spb, ev.vel);
  }
}

export class Engine {
  ctx: AudioContext | null = null;
  graph: Graph | null = null;
  private piece: Piece | null = null;
  private events: Ev[] = [];
  private mix: Mix;
  private tempo = 100;
  private cursor = 0;
  private startTime = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private gates: Record<TrackId, GainNode> | null = null;
  private listeners = new Set<() => void>();
  playing = false;
  loop = true;

  constructor(mix: Mix) {
    this.mix = mix;
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() {
    this.listeners.forEach((l) => l());
  }

  ensure(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: "interactive" });
      this.graph = buildGraph(this.ctx, this.mix, this.tempo);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  get spb() {
    return 60 / this.tempo;
  }

  setPiece(piece: Piece) {
    const pos = this.playing ? this.position() : 0;
    this.piece = piece;
    this.events = flatten(piece);
    this.setTempo(piece.settings.tempo);
    if (this.playing) this.seekCursor(pos + 0.25);
  }

  setTempo(bpm: number) {
    if (bpm === this.tempo) return;
    if (this.playing && this.ctx) {
      const pos = this.position();
      this.tempo = bpm;
      this.startTime = this.ctx.currentTime - pos * this.spb;
    } else this.tempo = bpm;
    this.graph?.setTempo(bpm);
  }

  setMix(mix: Mix) {
    this.mix = mix;
    this.graph?.apply(mix);
    if (this.ctx) for (const id of TRACK_IDS) void loadInstrument(mix.tracks[id].instrument, this.ctx);
  }

  preloadInstruments() {
    const ctx = this.ensure();
    return Promise.all(TRACK_IDS.map((id) => loadInstrument(this.mix.tracks[id].instrument, ctx)));
  }

  /** Current playhead in beats. */
  position(): number {
    if (!this.playing || !this.ctx || !this.piece) return 0;
    let p = (this.ctx.currentTime - this.startTime) / this.spb;
    if (p < 0) p += this.piece.beats;
    return Math.max(0, Math.min(this.piece.beats, p));
  }

  private seekCursor(beat: number) {
    this.cursor = this.events.findIndex((e) => e.time >= beat);
    if (this.cursor < 0) this.cursor = this.events.length;
  }

  private newGates() {
    const ctx = this.ctx!;
    const gates = {} as Record<TrackId, GainNode>;
    for (const id of TRACK_IDS) {
      const g = gain(ctx, 1);
      g.connect(this.graph!.channels[id].input);
      gates[id] = g;
    }
    return gates;
  }

  play(fromBeat = 0) {
    if (!this.piece) return;
    const ctx = this.ensure();
    this.stopVoices();
    this.gates = this.newGates();
    this.playing = true;
    this.startTime = ctx.currentTime + 0.08 - fromBeat * this.spb;
    this.seekCursor(fromBeat);
    this.timer = setInterval(() => this.tick(), 25);
    this.tick();
    this.emit();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.playing = false;
    this.stopVoices();
    this.emit();
  }

  toggle() {
    if (this.playing) this.stop();
    else this.play();
  }

  private stopVoices() {
    if (!this.gates || !this.ctx) return;
    const now = this.ctx.currentTime;
    const old = this.gates;
    for (const id of TRACK_IDS) {
      old[id].gain.setTargetAtTime(0, now, 0.03);
    }
    setTimeout(() => TRACK_IDS.forEach((id) => old[id].disconnect()), 400);
    this.gates = null;
  }

  private tick() {
    if (!this.ctx || !this.graph || !this.piece || !this.gates) return;
    const horizon = this.ctx.currentTime + 0.18;
    const spb = this.spb;
    for (;;) {
      if (this.cursor >= this.events.length) {
        const endTime = this.startTime + this.piece.beats * spb;
        if (this.loop) {
          if (endTime > horizon) break;
          this.startTime = endTime;
          this.cursor = 0;
          continue;
        }
        if (this.ctx.currentTime > endTime + 0.1) this.stop();
        break;
      }
      const ev = this.events[this.cursor]!;
      const when = this.startTime + ev.time * spb;
      if (when > horizon) break;
      if (when >= this.ctx.currentTime - 0.05) scheduleEvent(this.graph, this.gates, this.mix, ev, Math.max(when, this.ctx.currentTime), spb);
      this.cursor++;
    }
  }

  /** Audition notes immediately (e.g. clicking a chord). */
  preview(track: TrackId, midis: number[], beats = 2) {
    const ctx = this.ensure();
    const g = this.graph!;
    const now = ctx.currentTime + 0.02;
    midis.forEach((m, i) =>
      playNote(ctx, g.channels[track].input, this.mix.tracks[track].instrument, m, now + i * 0.012, beats * this.spb, 0.7)
    );
  }
}

/** Render the whole piece offline (for WAV export). */
export async function renderOffline(piece: Piece, mix: Mix, sampleRate = 44100): Promise<AudioBuffer> {
  const spb = 60 / piece.settings.tempo;
  const seconds = piece.beats * spb + 3;
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  await Promise.all(TRACK_IDS.map((id) => loadInstrument(mix.tracks[id].instrument, ctx)));
  const graph = buildGraph(ctx, mix, piece.settings.tempo);
  const gates = {} as Record<TrackId, AudioNode>;
  for (const id of TRACK_IDS) gates[id] = graph.channels[id].input;
  for (const ev of flatten(piece)) scheduleEvent(graph, gates, mix, ev, 0.05 + ev.time * spb, spb);
  return ctx.startRendering();
}
