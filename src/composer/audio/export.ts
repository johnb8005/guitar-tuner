// Export helpers: 16-bit WAV from an AudioBuffer and a Standard MIDI File (type 1).

import type { DrumId, Piece } from "../generate";
import { TRACK_IDS, type TrackId } from "../styles";
import { getInstrument } from "./instruments";
import type { Mix } from "./engine";

export function encodeWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels;
  const length = buffer.length;
  const bytes = 44 + length * channels * 2;
  const view = new DataView(new ArrayBuffer(bytes));
  const str = (o: number, s: string) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  view.setUint32(4, bytes - 8, true);
  str(8, "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  str(36, "data");
  view.setUint32(40, length * channels * 2, true);
  const data = [...Array(channels)].map((_, c) => buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < channels; c++) {
      const s = Math.max(-1, Math.min(1, data[c]![i]!));
      view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([view], { type: "audio/wav" });
}

const GM_DRUMS: Record<DrumId, number> = {
  kick: 36,
  snare: 38,
  rim: 37,
  clap: 39,
  hatClosed: 42,
  hatOpen: 46,
  ride: 51,
  crash: 49,
  tomLow: 45,
  tomMid: 47,
  tomHigh: 50,
  shaker: 70,
};

const TRACK_NAMES: Record<TrackId, string> = { lead: "Melody", keys: "Keys", pad: "Pad", arp: "Arpeggio", bass: "Bass", drums: "Drums" };

function vlq(n: number): number[] {
  const out = [n & 0x7f];
  n >>= 7;
  while (n > 0) {
    out.unshift((n & 0x7f) | 0x80);
    n >>= 7;
  }
  return out;
}

const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16 = (n: number) => [(n >>> 8) & 255, n & 255];
const text = (s: string) => [...s].map((c) => c.charCodeAt(0) & 0x7f);

function chunk(type: string, data: number[]): number[] {
  return [...text(type), ...u32(data.length), ...data];
}

export function exportMidi(piece: Piece, mix: Mix): Blob {
  const PPQ = 480;
  const tracks: number[][] = [];
  const usPerBeat = Math.round(60_000_000 / piece.settings.tempo);
  // Conductor track: tempo, time signature, chord markers
  const conductor: { tick: number; data: number[] }[] = [
    { tick: 0, data: [0xff, 0x51, 0x03, (usPerBeat >> 16) & 255, (usPerBeat >> 8) & 255, usPerBeat & 255] },
    { tick: 0, data: [0xff, 0x58, 0x04, 4, 2, 24, 8] },
    ...piece.chords.map((c) => {
      const t = text(c.chord.symbol);
      return { tick: Math.round(c.time * PPQ), data: [0xff, 0x06, ...vlq(t.length), ...t] };
    }),
  ];
  tracks.push(encodeTrack(conductor));

  let channel = 0;
  for (const id of TRACK_IDS) {
    const isDrums = id === "drums";
    const ch = isDrums ? 9 : channel++;
    if (ch === 9 && !isDrums) channel++;
    const evs: { tick: number; data: number[]; order: number }[] = [];
    const name = text(TRACK_NAMES[id]);
    evs.push({ tick: 0, data: [0xff, 0x03, ...vlq(name.length), ...name], order: 0 });
    if (!isDrums) evs.push({ tick: 0, data: [0xc0 | ch, getInstrument(mix.tracks[id].instrument).gm], order: 0 });
    if (isDrums) {
      for (const d of piece.drums) {
        const tick = Math.round(d.time * PPQ);
        const note = GM_DRUMS[d.drum];
        evs.push({ tick, data: [0x99, note, Math.round(d.vel * 127)], order: 2 });
        evs.push({ tick: tick + 60, data: [0x89, note, 0], order: 1 });
      }
    } else {
      for (const n of piece.notes) {
        if (n.track !== id) continue;
        const tick = Math.round(n.time * PPQ);
        const off = Math.max(tick + 1, Math.round((n.time + n.dur) * PPQ));
        evs.push({ tick, data: [0x90 | ch, n.midi, Math.max(1, Math.round(n.vel * 127))], order: 2 });
        evs.push({ tick: off, data: [0x80 | ch, n.midi, 0], order: 1 });
      }
    }
    evs.sort((a, b) => a.tick - b.tick || a.order - b.order);
    tracks.push(encodeTrack(evs));
  }

  const header = chunk("MThd", [...u16(1), ...u16(tracks.length), ...u16(PPQ)]);
  const bytes = new Uint8Array([...header, ...tracks.flat()]);
  return new Blob([bytes], { type: "audio/midi" });
}

function encodeTrack(events: { tick: number; data: number[] }[]): number[] {
  const out: number[] = [];
  let last = 0;
  for (const e of [...events].sort((a, b) => a.tick - b.tick)) {
    out.push(...vlq(Math.max(0, e.tick - last)), ...e.data);
    last = Math.max(last, e.tick);
  }
  out.push(0, 0xff, 0x2f, 0);
  return chunk("MTrk", out);
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
