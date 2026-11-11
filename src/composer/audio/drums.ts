// Synthesised drum kits. Every hit is generated from oscillators and noise, so
// kits work offline and render identically in WAV export.

import type { DrumId } from "../generate";
import { decay, filter, gain, noise, osc, shaper, type Ctx } from "./dsp";

export type KitId = "acoustic-kit" | "lofi-kit" | "jazz-kit" | "electro-kit" | "taiko-kit";

type KitParams = {
  kick: { start: number; end: number; sweep: number; decay: number; click: number; drive: number };
  snare: { tone: number; noiseDecay: number; toneDecay: number; noiseLevel: number; brushy?: boolean };
  hatFreq: number;
  hatDecay: number;
  toms: [number, number, number];
  tomDecay: number;
};

const KITS: Record<KitId, KitParams> = {
  "acoustic-kit": {
    kick: { start: 130, end: 52, sweep: 0.06, decay: 0.42, click: 0.5, drive: 1.5 },
    snare: { tone: 190, noiseDecay: 0.2, toneDecay: 0.09, noiseLevel: 0.55 },
    hatFreq: 8500,
    hatDecay: 0.05,
    toms: [98, 130, 175],
    tomDecay: 0.45,
  },
  "lofi-kit": {
    kick: { start: 110, end: 48, sweep: 0.07, decay: 0.38, click: 0.25, drive: 2.5 },
    snare: { tone: 175, noiseDecay: 0.16, toneDecay: 0.08, noiseLevel: 0.45 },
    hatFreq: 7000,
    hatDecay: 0.04,
    toms: [95, 125, 165],
    tomDecay: 0.35,
  },
  "jazz-kit": {
    kick: { start: 95, end: 55, sweep: 0.05, decay: 0.3, click: 0.15, drive: 1 },
    snare: { tone: 210, noiseDecay: 0.28, toneDecay: 0.05, noiseLevel: 0.35, brushy: true },
    hatFreq: 9000,
    hatDecay: 0.06,
    toms: [110, 145, 190],
    tomDecay: 0.4,
  },
  "electro-kit": {
    kick: { start: 160, end: 44, sweep: 0.09, decay: 0.75, click: 0.35, drive: 2.8 },
    snare: { tone: 200, noiseDecay: 0.32, toneDecay: 0.12, noiseLevel: 0.7 },
    hatFreq: 9500,
    hatDecay: 0.035,
    toms: [90, 120, 160],
    tomDecay: 0.5,
  },
  "taiko-kit": {
    kick: { start: 90, end: 40, sweep: 0.1, decay: 0.9, click: 0.3, drive: 1.3 },
    snare: { tone: 160, noiseDecay: 0.2, toneDecay: 0.15, noiseLevel: 0.3 },
    hatFreq: 7000,
    hatDecay: 0.05,
    toms: [62, 85, 120],
    tomDecay: 1.1,
  },
};

// Inharmonic square cluster (808-style metal) for hats, rides and crashes
const METAL = [1, 1.342, 1.2312, 1.6532, 1.9523, 2.1523];

function metal(ctx: Ctx, out: AudioNode, time: number, base: number, hp: number, bp: number, level: number, decayTime: number) {
  const mix = gain(ctx, 0);
  const end = decay(mix.gain, time, level, 0.001, decayTime);
  const band = filter(ctx, "bandpass", bp, 0.9);
  const high = filter(ctx, "highpass", hp, 0.7);
  for (const r of METAL) {
    const o = osc(ctx, "square", base * r);
    o.connect(band);
    o.start(time);
    o.stop(end);
  }
  // A little noise for air
  const n = noise(ctx, time, end - time);
  const ng = gain(ctx, 0.35);
  n.connect(ng).connect(band);
  band.connect(high).connect(mix).connect(out);
}

export function playDrum(ctx: Ctx, out: AudioNode, kitId: KitId, drum: DrumId, time: number, vel: number) {
  const kit = KITS[kitId] ?? KITS["acoustic-kit"];
  const v = Math.pow(vel, 1.3);
  switch (drum) {
    case "kick": {
      const k = kit.kick;
      const o = osc(ctx, "sine", k.start);
      o.frequency.setValueAtTime(k.start * 2.2, time);
      o.frequency.exponentialRampToValueAtTime(k.start, time + 0.008);
      o.frequency.exponentialRampToValueAtTime(k.end, time + k.sweep);
      const g = gain(ctx, 0);
      const end = decay(g.gain, time, 0.95 * v, 0.002, k.decay);
      const sat = shaper(ctx, k.drive);
      o.connect(g).connect(sat).connect(out);
      o.start(time);
      o.stop(end);
      const c = noise(ctx, time, 0.02);
      const cf = filter(ctx, "highpass", 2500, 0.7);
      const cg = gain(ctx, 0);
      decay(cg.gain, time, k.click * 0.25 * v, 0.0005, 0.012);
      c.connect(cf).connect(cg).connect(out);
      break;
    }
    case "snare":
    case "clap":
    case "rim": {
      const s = kit.snare;
      if (drum === "rim") {
        const o = osc(ctx, "square", 1650);
        const bp = filter(ctx, "bandpass", 1650, 6);
        const g = gain(ctx, 0);
        const end = decay(g.gain, time, 0.35 * v, 0.0005, 0.03);
        o.connect(bp).connect(g).connect(out);
        o.start(time);
        o.stop(end);
        const o2 = osc(ctx, "triangle", 420);
        const g2 = gain(ctx, 0);
        decay(g2.gain, time, 0.2 * v, 0.0005, 0.04);
        o2.connect(g2).connect(out);
        o2.start(time);
        o2.stop(end + 0.02);
        break;
      }
      if (drum === "clap") {
        const bp = filter(ctx, "bandpass", 1150, 1.2);
        const g = gain(ctx, 0);
        g.gain.setValueAtTime(0.0001, time);
        for (let i = 0; i < 3; i++) {
          g.gain.setValueAtTime(0.5 * v, time + i * 0.011);
          g.gain.exponentialRampToValueAtTime(0.05, time + i * 0.011 + 0.009);
        }
        g.gain.setValueAtTime(0.4 * v, time + 0.034);
        g.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);
        const n = noise(ctx, time, 0.25);
        n.connect(bp).connect(g).connect(out);
        break;
      }
      const n = noise(ctx, time, s.noiseDecay + 0.05);
      const hp = filter(ctx, "highpass", s.brushy ? 2500 : 1400, 0.7);
      const bp = filter(ctx, "peaking", 5000, 1);
      bp.gain.value = 4;
      const ng = gain(ctx, 0);
      if (s.brushy) {
        ng.gain.setValueAtTime(0.0001, time);
        ng.gain.linearRampToValueAtTime(s.noiseLevel * v, time + 0.025);
        ng.gain.exponentialRampToValueAtTime(0.0001, time + s.noiseDecay);
      } else decay(ng.gain, time, s.noiseLevel * v, 0.001, s.noiseDecay);
      n.connect(hp).connect(bp).connect(ng).connect(out);
      const o = osc(ctx, "triangle", s.tone);
      o.frequency.setValueAtTime(s.tone * 1.5, time);
      o.frequency.exponentialRampToValueAtTime(s.tone, time + 0.02);
      const og = gain(ctx, 0);
      const end = decay(og.gain, time, (s.brushy ? 0.2 : 0.55) * v, 0.001, s.toneDecay);
      o.connect(og).connect(out);
      o.start(time);
      o.stop(end);
      break;
    }
    case "hatClosed":
      metal(ctx, out, time, 40 * 8.2, kit.hatFreq * 0.85, kit.hatFreq, 0.28 * v, kit.hatDecay);
      break;
    case "hatOpen":
      metal(ctx, out, time, 40 * 8.2, kit.hatFreq * 0.8, kit.hatFreq, 0.22 * v, 0.32);
      break;
    case "shaker": {
      const n = noise(ctx, time, 0.1);
      const bp = filter(ctx, "bandpass", 6500, 1.5);
      const g = gain(ctx, 0);
      g.gain.setValueAtTime(0.0001, time);
      g.gain.linearRampToValueAtTime(0.12 * v, time + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.07);
      n.connect(bp).connect(g).connect(out);
      break;
    }
    case "ride":
      metal(ctx, out, time, 52 * 7.3, 3500, 5200, 0.12 * v, 1.1);
      {
        const ping = osc(ctx, "sine", 3150);
        const pg = gain(ctx, 0);
        const end = decay(pg.gain, time, 0.035 * v, 0.001, 0.6);
        ping.connect(pg).connect(out);
        ping.start(time);
        ping.stop(end);
      }
      break;
    case "crash": {
      metal(ctx, out, time, 47 * 7.7, 3000, 6500, 0.18 * v, 1.8);
      const n = noise(ctx, time, 2);
      const hp = filter(ctx, "highpass", 4500, 0.6);
      const g = gain(ctx, 0);
      decay(g.gain, time, 0.18 * v, 0.002, 1.9);
      n.connect(hp).connect(g).connect(out);
      break;
    }
    case "tomLow":
    case "tomMid":
    case "tomHigh": {
      const f = kit.toms[drum === "tomLow" ? 0 : drum === "tomMid" ? 1 : 2];
      const o = osc(ctx, "sine", f);
      o.frequency.setValueAtTime(f * 1.6, time);
      o.frequency.exponentialRampToValueAtTime(f, time + 0.03);
      o.frequency.exponentialRampToValueAtTime(f * 0.8, time + kit.tomDecay);
      const g = gain(ctx, 0);
      const end = decay(g.gain, time, 0.75 * v, 0.002, kit.tomDecay);
      const sat = shaper(ctx, 1.4);
      o.connect(g).connect(sat).connect(out);
      o.start(time);
      o.stop(end);
      const n = noise(ctx, time, 0.08);
      const lp = filter(ctx, "lowpass", kitId === "taiko-kit" ? 900 : 2500, 0.7);
      const ng = gain(ctx, 0);
      decay(ng.gain, time, (kitId === "taiko-kit" ? 0.5 : 0.2) * v, 0.001, 0.06);
      n.connect(lp).connect(ng).connect(out);
      break;
    }
  }
}

/** Per-kit channel colouring (inserted before the drum channel fader). */
export function kitInsert(ctx: Ctx, kitId: KitId): { input: AudioNode; output: AudioNode } {
  const input = gain(ctx, 1);
  if (kitId === "lofi-kit") {
    const lp = filter(ctx, "lowpass", 4200, 0.8);
    const sat = shaper(ctx, 2);
    const out = gain(ctx, 0.8);
    input.connect(lp).connect(sat).connect(out);
    return { input, output: out };
  }
  if (kitId === "electro-kit") {
    const sat = shaper(ctx, 1.3);
    input.connect(sat);
    return { input, output: sat };
  }
  return { input, output: input };
}
