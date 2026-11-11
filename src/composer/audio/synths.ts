// Synthesised instruments. Each voice is built from Web Audio nodes per note and
// cleaned up automatically when its oscillators stop.

import { midiToFreq } from "../theory";
import { adsr, decay, filter, gain, karplus, noise, osc, shaper, type Ctx } from "./dsp";

export type PlayFn = (ctx: Ctx, out: AudioNode, midi: number, time: number, dur: number, vel: number) => void;

const velCurve = (v: number) => Math.pow(v, 1.6);
// Quantise excitation brightness so Karplus buffers are cached and reused
const quant = (b: number) => Math.round(b * 4) / 4;

// ---------- Keys ----------

/** FM electric piano (Rhodes-style tine): bright bell attack mellowing into a warm sine. */
export const rhodes: PlayFn = (ctx, out, midi, time, dur, vel) => {
  const f = midiToFreq(midi);
  const v = velCurve(vel);
  const carrier = osc(ctx, "sine", f);
  const mod = osc(ctx, "sine", f);
  const modGain = gain(ctx, 0);
  const idx = f * (1.2 + v * 2.2);
  modGain.gain.setValueAtTime(idx, time);
  modGain.gain.setTargetAtTime(f * 0.25, time, 0.25);
  mod.connect(modGain).connect(carrier.frequency);

  // Tine: high-ratio FM click on the attack
  const tine = osc(ctx, "sine", f * 4);
  const tineMod = osc(ctx, "sine", f * 14);
  const tineModGain = gain(ctx, f * 3 * v);
  tineMod.connect(tineModGain).connect(tine.frequency);
  const tineAmp = gain(ctx, 0);
  decay(tineAmp.gain, time, 0.12 * v, 0.001, 0.12);

  const amp = gain(ctx, 0);
  const decayTime = 1.6 + Math.max(0, 72 - midi) * 0.05;
  const end = adsr(amp.gain, time, dur, 0.33 * (0.35 + v), 0.003, decayTime, 0.35, 0.35);

  const warmth = filter(ctx, "lowpass", 2400 + v * 3000, 0.5);
  carrier.connect(amp);
  tine.connect(tineAmp).connect(amp);
  amp.connect(warmth).connect(out);
  for (const o of [carrier, mod, tine, tineMod]) {
    o.start(time);
    o.stop(end);
  }
};

/** Additive piano used while the sampled grand loads (or offline). */
export const synthPiano: PlayFn = (ctx, out, midi, time, dur, vel) => {
  const f = midiToFreq(midi);
  const v = velCurve(vel);
  const B = 0.0004 * Math.pow(f / 261.6, 1.4);
  const master = gain(ctx, 1);
  const bright = filter(ctx, "lowpass", 1800 + v * 7000, 0.5);
  master.connect(bright).connect(out);
  const release = 0.35;
  const sustainEnd = time + Math.max(dur, 0.05);
  const nodes: OscillatorNode[] = [];
  for (let h = 1; h <= 8; h++) {
    const fh = f * h * Math.sqrt(1 + B * h * h);
    if (fh > 16000) break;
    const o = osc(ctx, "sine", fh, (Math.random() - 0.5) * 3);
    const g = gain(ctx, 0);
    const level = (0.22 / Math.pow(h, 1.1)) * (0.4 + v) * (h === 1 ? 1 : 0.7 + v * 0.6);
    const dec = (2.8 + Math.max(0, 70 - midi) * 0.06) / Math.sqrt(h);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(level, time + 0.004);
    g.gain.setTargetAtTime(level * 0.05, time + 0.004, dec / 3);
    g.gain.setTargetAtTime(0.0001, sustainEnd, release / 4);
    o.connect(g).connect(master);
    o.start(time);
    o.stop(sustainEnd + release * 1.5);
    nodes.push(o);
  }
  // Hammer
  const n = noise(ctx, time, 0.04);
  const nf = filter(ctx, "bandpass", f * 3, 1.5);
  const ng = gain(ctx, 0);
  decay(ng.gain, time, 0.05 * v, 0.001, 0.03);
  n.connect(nf).connect(ng).connect(master);
};

/** Classic poly synth: two detuned saws, resonant filter envelope. */
export const polySynth: PlayFn = (ctx, out, midi, time, dur, vel) => {
  const f = midiToFreq(midi);
  const v = velCurve(vel);
  const o1 = osc(ctx, "sawtooth", f, -6);
  const o2 = osc(ctx, "sawtooth", f, 6);
  const o3 = osc(ctx, "square", f / 2);
  const g3 = gain(ctx, 0.25);
  const lp = filter(ctx, "lowpass", 400, 5);
  lp.frequency.setValueAtTime(300, time);
  lp.frequency.linearRampToValueAtTime(1200 + v * 3500, time + 0.01);
  lp.frequency.setTargetAtTime(700, time + 0.01, 0.12);
  const amp = gain(ctx, 0);
  const end = adsr(amp.gain, time, dur, 0.14 * (0.5 + v), 0.004, 0.25, 0.5, 0.15);
  o1.connect(lp);
  o2.connect(lp);
  o3.connect(g3).connect(lp);
  lp.connect(amp).connect(out);
  for (const o of [o1, o2, o3]) {
    o.start(time);
    o.stop(end);
  }
};

// ---------- Plucked / mallets ----------

export const pluck: PlayFn = (ctx, out, midi, time, dur, vel) => {
  const f = midiToFreq(midi);
  const { buffer, rate } = karplus(ctx, f, 2.5, quant(0.35 + vel * 0.5), 0.995);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = rate;
  const body = filter(ctx, "peaking", 250, 1);
  body.gain.value = 3;
  const tone = filter(ctx, "lowpass", 2500 + vel * 5000, 0.6);
  const amp = gain(ctx, 0.9 * velCurve(vel) + 0.1);
  const end = time + Math.min(2.4, dur + 0.8);
  amp.gain.setValueAtTime(amp.gain.value, Math.max(time, end - 0.4));
  amp.gain.linearRampToValueAtTime(0.0001, end);
  src.connect(body).connect(tone).connect(amp).connect(out);
  src.start(time);
  src.stop(end + 0.05);
};

export const marimbaSynth: PlayFn = (ctx, out, midi, time, _dur, vel) => {
  const f = midiToFreq(midi);
  const v = velCurve(vel);
  const partials: [number, number, number][] = [
    [1, 1, 0.9],
    [3.99, 0.35, 0.18],
    [10.65, 0.12, 0.05],
  ];
  for (const [ratio, level, d] of partials) {
    const o = osc(ctx, "sine", f * ratio);
    const g = gain(ctx, 0);
    const end = decay(g.gain, time, level * 0.4 * (0.4 + v), 0.002, d * (1 + Math.max(0, 72 - midi) * 0.02));
    o.connect(g).connect(out);
    o.start(time);
    o.stop(end);
  }
};

/** FM bell / celesta lead — sparkly pop hook sound. */
export const bellLead: PlayFn = (ctx, out, midi, time, dur, vel) => {
  const f = midiToFreq(midi);
  const v = velCurve(vel);
  const car = osc(ctx, "sine", f);
  const mod = osc(ctx, "sine", f * 3.5);
  const mg = gain(ctx, 0);
  mg.gain.setValueAtTime(f * (1.5 + v * 2), time);
  mg.gain.setTargetAtTime(f * 0.2, time, 0.3);
  mod.connect(mg).connect(car.frequency);
  const body = osc(ctx, "triangle", f);
  const bodyGain = gain(ctx, 0);
  adsr(bodyGain.gain, time, dur, 0.09 * (0.5 + v), 0.01, 0.4, 0.5, 0.25);
  const amp = gain(ctx, 0);
  const end = adsr(amp.gain, time, dur, 0.2 * (0.5 + v), 0.002, 0.9, 0.25, 0.5);
  car.connect(amp).connect(out);
  body.connect(bodyGain).connect(out);
  for (const o of [car, mod, body]) {
    o.start(time);
    o.stop(end);
  }
};

/** FM vibraphone with motor tremolo (fallback for the sampled vibes). */
export const vibesSynth: PlayFn = (ctx, out, midi, time, dur, vel) => {
  const f = midiToFreq(midi);
  const v = velCurve(vel);
  const car = osc(ctx, "sine", f);
  const mod = osc(ctx, "sine", f * 4);
  const mg = gain(ctx, 0);
  mg.gain.setValueAtTime(f * 0.8 * v, time);
  mg.gain.setTargetAtTime(0, time, 0.08);
  mod.connect(mg).connect(car.frequency);
  const amp = gain(ctx, 0);
  const end = adsr(amp.gain, time, dur, 0.28 * (0.4 + v), 0.002, 2.2, 0.3, 0.6);
  const trem = osc(ctx, "sine", 5.2);
  const tremDepth = gain(ctx, 0.25);
  const tremAmp = gain(ctx, 0.75);
  trem.connect(tremDepth).connect(tremAmp.gain);
  car.connect(amp).connect(tremAmp).connect(out);
  for (const o of [car, mod, trem]) {
    o.start(time);
    o.stop(end);
  }
};

// ---------- Leads ----------

function vibrato(ctx: Ctx, time: number, targets: AudioParam[], depth = 12, rate = 5.3, delay = 0.25) {
  const lfo = osc(ctx, "sine", rate);
  const g = gain(ctx, 0);
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(0, time + delay);
  g.gain.linearRampToValueAtTime(depth, time + delay + 0.3);
  lfo.connect(g);
  for (const t of targets) g.connect(t);
  return lfo;
}

export const sawLead: PlayFn = (ctx, out, midi, time, dur, vel) => {
  const f = midiToFreq(midi);
  const v = velCurve(vel);
  const o1 = osc(ctx, "sawtooth", f, -8);
  const o2 = osc(ctx, "sawtooth", f, 8);
  const o3 = osc(ctx, "square", f / 2);
  const g3 = gain(ctx, 0.3);
  const lp = filter(ctx, "lowpass", 1000, 2);
  lp.frequency.setValueAtTime(900, time);
  lp.frequency.linearRampToValueAtTime(2800 + v * 3000, time + 0.04);
  lp.frequency.setTargetAtTime(2200, time + 0.05, 0.2);
  const amp = gain(ctx, 0);
  const end = adsr(amp.gain, time, dur, 0.11 * (0.6 + v), 0.008, 0.2, 0.8, 0.18);
  const lfo = vibrato(ctx, time, [o1.detune, o2.detune], 14);
  o1.connect(lp);
  o2.connect(lp);
  o3.connect(g3).connect(lp);
  lp.connect(amp).connect(out);
  for (const o of [o1, o2, o3, lfo]) {
    o.start(time);
    o.stop(end);
  }
};

export const softLead: PlayFn = (ctx, out, midi, time, dur, vel) => {
  const f = midiToFreq(midi);
  const v = velCurve(vel);
  const o1 = osc(ctx, "triangle", f);
  const o2 = osc(ctx, "sine", f * 2, 4);
  const g2 = gain(ctx, 0.12);
  const lp = filter(ctx, "lowpass", 2600, 0.8);
  const amp = gain(ctx, 0);
  const end = adsr(amp.gain, time, dur, 0.25 * (0.5 + v), 0.02, 0.3, 0.75, 0.2);
  const lfo = vibrato(ctx, time, [o1.detune, o2.detune], 10);
  o1.connect(lp);
  o2.connect(g2).connect(lp);
  lp.connect(amp).connect(out);
  for (const o of [o1, o2, lfo]) {
    o.start(time);
    o.stop(end);
  }
};

export const fluteSynth: PlayFn = (ctx, out, midi, time, dur, vel) => {
  const f = midiToFreq(midi);
  const v = velCurve(vel);
  const o1 = osc(ctx, "sine", f);
  const o2 = osc(ctx, "sine", f * 2);
  const g2 = gain(ctx, 0.15);
  const o3 = osc(ctx, "sine", f * 3);
  const g3 = gain(ctx, 0.05);
  const breath = noise(ctx, time, dur + 0.5);
  const bf = filter(ctx, "bandpass", f * 2, 3);
  const bg = gain(ctx, 0);
  adsr(bg.gain, time, dur, 0.05 * (0.5 + v), 0.03, 0.15, 0.4, 0.1);
  const amp = gain(ctx, 0);
  const end = adsr(amp.gain, time, dur, 0.27 * (0.5 + v), 0.06, 0.2, 0.85, 0.15);
  const lfo = vibrato(ctx, time, [o1.detune, o2.detune, o3.detune], 9, 5, 0.3);
  o1.connect(amp);
  o2.connect(g2).connect(amp);
  o3.connect(g3).connect(amp);
  breath.connect(bf).connect(bg).connect(out);
  amp.connect(out);
  for (const o of [o1, o2, o3, lfo]) {
    o.start(time);
    o.stop(end);
  }
};

/** Bowed string section/solo: detuned saws through a body-like filter, slow attack. */
function bowed(voices: number, spread: number, attack: number, level: number, brightness: number): PlayFn {
  return (ctx, out, midi, time, dur, vel) => {
    const f = midiToFreq(midi);
    const v = velCurve(vel);
    const lp = filter(ctx, "lowpass", brightness * (0.6 + v * 0.6), 0.6);
    const body = filter(ctx, "peaking", 1100, 1.2);
    body.gain.value = 4;
    const hp = filter(ctx, "highpass", Math.min(180, f * 0.6), 0.5);
    const amp = gain(ctx, 0);
    const end = adsr(amp.gain, time, dur, level * (0.5 + v * 0.7), attack, 0.4, 0.85, 0.45);
    const oscs: OscillatorNode[] = [];
    for (let i = 0; i < voices; i++) {
      const det = voices === 1 ? 0 : -spread + (2 * spread * i) / (voices - 1);
      const o = osc(ctx, "sawtooth", f, det + (Math.random() - 0.5) * 3);
      o.connect(lp);
      oscs.push(o);
    }
    const lfo = vibrato(ctx, time, oscs.map((o) => o.detune), voices === 1 ? 14 : 6, 5.4, 0.15);
    lp.connect(body).connect(hp).connect(amp).connect(out);
    for (const o of [...oscs, lfo]) {
      o.start(time);
      o.stop(end);
    }
  };
}

export const stringsSynth = bowed(3, 12, 0.25, 0.07, 3200);
export const soloStringSynth = bowed(1, 0, 0.08, 0.16, 4200);
export const celloSynth = bowed(2, 6, 0.06, 0.16, 1800);

export const brassSynth: PlayFn = (ctx, out, midi, time, dur, vel) => {
  const f = midiToFreq(midi);
  const v = velCurve(vel);
  const o1 = osc(ctx, "sawtooth", f, -4);
  const o2 = osc(ctx, "sawtooth", f, 4);
  const lp = filter(ctx, "lowpass", 500, 1.5);
  lp.frequency.setValueAtTime(400, time);
  lp.frequency.linearRampToValueAtTime(1500 + v * 2500, time + 0.07);
  lp.frequency.setTargetAtTime(1300 + v * 1200, time + 0.08, 0.2);
  const amp = gain(ctx, 0);
  const end = adsr(amp.gain, time, dur, 0.11 * (0.5 + v), 0.05, 0.2, 0.8, 0.12);
  const lfo = vibrato(ctx, time, [o1.detune, o2.detune], 8, 5.5, 0.35);
  o1.connect(lp);
  o2.connect(lp);
  lp.connect(amp).connect(out);
  for (const o of [o1, o2, lfo]) {
    o.start(time);
    o.stop(end);
  }
};

// ---------- Pads ----------

function padVoice(opts: { voices: number; spread: number; type: OscillatorType; cutoff: number; attack: number; release: number; level: number; wow?: number }): PlayFn {
  return (ctx, out, midi, time, dur, vel) => {
    const f = midiToFreq(midi);
    const lp = filter(ctx, "lowpass", opts.cutoff * 0.5, 0.8);
    lp.frequency.setValueAtTime(opts.cutoff * 0.4, time);
    lp.frequency.linearRampToValueAtTime(opts.cutoff, time + opts.attack * 1.5);
    const hp = filter(ctx, "highpass", 140, 0.5);
    const amp = gain(ctx, 0);
    const end = adsr(amp.gain, time, dur, opts.level * (0.6 + vel * 0.5), opts.attack, 1, 0.85, opts.release);
    const oscs: OscillatorNode[] = [];
    for (let i = 0; i < opts.voices; i++) {
      const det = opts.voices === 1 ? 0 : -opts.spread + (2 * opts.spread * i) / (opts.voices - 1);
      const o = osc(ctx, opts.type, f, det);
      o.connect(lp);
      oscs.push(o);
    }
    const extra: OscillatorNode[] = [];
    // Slow filter movement
    const fl = osc(ctx, "sine", 0.15 + Math.random() * 0.1);
    const flg = gain(ctx, opts.cutoff * 0.25);
    fl.connect(flg).connect(lp.frequency);
    extra.push(fl);
    if (opts.wow) {
      const w = osc(ctx, "sine", 0.6);
      const wg = gain(ctx, opts.wow);
      w.connect(wg);
      for (const o of oscs) wg.connect(o.detune);
      extra.push(w);
    }
    lp.connect(hp).connect(amp).connect(out);
    for (const o of [...oscs, ...extra]) {
      o.start(time);
      o.stop(end);
    }
  };
}

export const warmPad = padVoice({ voices: 3, spread: 10, type: "sawtooth", cutoff: 1400, attack: 0.6, release: 1.4, level: 0.06 });
export const supersawPad = padVoice({ voices: 6, spread: 28, type: "sawtooth", cutoff: 3800, attack: 0.25, release: 1, level: 0.035 });
export const tapePad = padVoice({ voices: 3, spread: 7, type: "triangle", cutoff: 1800, attack: 0.5, release: 1.2, level: 0.12, wow: 9 });
export const choirSynth = padVoice({ voices: 4, spread: 12, type: "sawtooth", cutoff: 1100, attack: 0.5, release: 1, level: 0.05 });

// ---------- Bass ----------

export const subBass: PlayFn = (ctx, out, midi, time, dur, vel) => {
  const f = midiToFreq(midi);
  const v = velCurve(vel);
  const o1 = osc(ctx, "sine", f);
  const o2 = osc(ctx, "triangle", f);
  const g2 = gain(ctx, 0.35);
  const sat = shaper(ctx, 1.6);
  const lp = filter(ctx, "lowpass", 900, 0.7);
  const amp = gain(ctx, 0);
  const end = adsr(amp.gain, time, dur * 0.95, 0.5 * (0.5 + v * 0.6), 0.006, 0.3, 0.8, 0.08);
  o1.connect(sat);
  o2.connect(g2).connect(sat);
  sat.connect(lp).connect(amp).connect(out);
  for (const o of [o1, o2]) {
    o.start(time);
    o.stop(end);
  }
};

export const analogBass: PlayFn = (ctx, out, midi, time, dur, vel) => {
  const f = midiToFreq(midi);
  const v = velCurve(vel);
  const o1 = osc(ctx, "sawtooth", f);
  const o2 = osc(ctx, "square", f, 7);
  const g2 = gain(ctx, 0.4);
  const sub = osc(ctx, "sine", f / 2);
  const subG = gain(ctx, 0.5);
  const lp = filter(ctx, "lowpass", 200, 7);
  lp.frequency.setValueAtTime(220, time);
  lp.frequency.linearRampToValueAtTime(900 + v * 1600, time + 0.005);
  lp.frequency.setTargetAtTime(260, time + 0.006, 0.08);
  const sat = shaper(ctx, 2.2);
  const amp = gain(ctx, 0);
  const end = adsr(amp.gain, time, dur * 0.95, 0.22 * (0.5 + v), 0.003, 0.2, 0.7, 0.06);
  o1.connect(lp);
  o2.connect(g2).connect(lp);
  lp.connect(sat).connect(amp).connect(out);
  sub.connect(subG).connect(amp);
  for (const o of [o1, o2, sub]) {
    o.start(time);
    o.stop(end);
  }
};

/** Plucked electric bass from a Karplus–Strong string plus a sine fundamental. */
export const fingerBassSynth: PlayFn = (ctx, out, midi, time, dur, vel) => {
  const f = midiToFreq(midi);
  const v = velCurve(vel);
  const { buffer, rate } = karplus(ctx, f, 3, quant(0.25 + v * 0.3), 0.998);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = rate;
  const lp = filter(ctx, "lowpass", 1200 + v * 1000, 0.8);
  const fund = osc(ctx, "sine", f);
  const fg = gain(ctx, 0);
  const end = adsr(fg.gain, time, dur * 0.95, 0.25 * (0.5 + v), 0.005, 0.8, 0.5, 0.08);
  const amp = gain(ctx, 0);
  adsr(amp.gain, time, dur * 0.95, 0.9 * (0.5 + v), 0.002, 1.5, 0.6, 0.08);
  src.connect(lp).connect(amp).connect(out);
  fund.connect(fg).connect(out);
  src.start(time);
  src.stop(end);
  fund.start(time);
  fund.stop(end);
};

export const uprightSynth: PlayFn = (ctx, out, midi, time, dur, vel) => {
  const f = midiToFreq(midi);
  const v = velCurve(vel);
  const o1 = osc(ctx, "triangle", f);
  const o2 = osc(ctx, "sine", f * 2);
  const g2 = gain(ctx, 0.2);
  const lp = filter(ctx, "lowpass", 700, 1);
  const amp = gain(ctx, 0);
  const end = adsr(amp.gain, time, dur * 0.9, 0.4 * (0.5 + v), 0.004, 0.5, 0.35, 0.1);
  const thump = noise(ctx, time, 0.05);
  const tf = filter(ctx, "lowpass", 400, 1);
  const tg = gain(ctx, 0);
  decay(tg.gain, time, 0.15 * v, 0.001, 0.04);
  o1.connect(lp);
  o2.connect(g2).connect(lp);
  lp.connect(amp).connect(out);
  thump.connect(tf).connect(tg).connect(out);
  for (const o of [o1, o2]) {
    o.start(time);
    o.stop(end);
  }
};
