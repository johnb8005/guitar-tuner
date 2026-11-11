import { useEffect, useRef } from "react";
import type { Piece } from "../generate";
import type { TrackId } from "../styles";
import { TRACK_META } from "./state";
import { midiName, prefersFlats, SCALES } from "../theory";

type Props = {
  piece: Piece;
  getPosition: () => number;
  playing: boolean;
  hidden: Set<TrackId>;
  onSeek: (beat: number) => void;
  /** Model's predicted liking per bar (drawn as a strip under the section labels). */
  barScores?: number[];
  /** Ratings given on this take. */
  marks?: { bar: number; reward: number }[];
};

const DRUM_ROWS = [
  "crash",
  "ride",
  "hatOpen",
  "hatClosed",
  "shaker",
  "clap",
  "snare",
  "rim",
  "tomHigh",
  "tomMid",
  "tomLow",
  "kick",
];

export function PianoRoll({
  piece,
  getPosition,
  playing,
  hidden,
  onSeek,
  barScores,
  marks,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    let raf = 0;
    let width = 0;
    const height = 340;
    const drumLane = 54;
    const flats = prefersFlats(piece.key.tonic, piece.key.scale);

    const notes = piece.notes.filter((n) => !hidden.has(n.track));
    const pitches = notes.map((n) => n.midi);
    const lo = Math.min(...pitches, 48) - 2;
    const hi = Math.max(...pitches, 72) + 2;

    const resize = () => {
      width = wrap.clientWidth;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvas.getContext("2d")!.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = () => {
      const g = canvas.getContext("2d")!;
      const pos = getPosition();
      const gutter = 34;
      const top = 22;
      const rollH = height - drumLane - top - 6;
      const pxBeat = (width - gutter) / piece.beats;
      const x = (beat: number) => gutter + beat * pxBeat;
      const rowH = rollH / (hi - lo + 1);
      const y = (midi: number) => top + (hi - midi) * rowH;

      g.clearRect(0, 0, width, height);
      // Pitch rows: highlight scale tones
      for (let m = lo; m <= hi; m++) {
        const pc = (m - piece.key.tonic + 120) % 12;
        const inScale = isInScale(piece, m);
        g.fillStyle =
          pc === 0
            ? "rgba(251,191,36,0.06)"
            : inScale
              ? "rgba(255,255,255,0.025)"
              : "rgba(0,0,0,0.15)";
        g.fillRect(gutter, y(m), width - gutter, rowH);
        if (pc === 0) {
          g.fillStyle = "rgba(255,255,255,0.35)";
          g.font = "9px ui-sans-serif, system-ui";
          g.fillText(midiName(m, flats), 2, y(m) + rowH - 1);
        }
      }
      // Sections & bars
      piece.sections.forEach((s, i) => {
        const sx = x(s.startBar * piece.beatsPerBar);
        const ex = x((s.startBar + s.bars) * piece.beatsPerBar);
        g.fillStyle = i % 2 ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0)";
        g.fillRect(sx, 0, ex - sx, height);
        g.fillStyle = "rgba(255,255,255,0.55)";
        g.font = "600 11px ui-sans-serif, system-ui";
        g.fillText(s.label, sx + 6, 14);
      });
      // Taste: predicted liking per bar + ratings given on this take
      if (barScores) {
        const lim = Math.max(0.25, ...barScores.map(Math.abs));
        barScores.forEach((sc, bar) => {
          const bx = x(bar * piece.beatsPerBar) + 1;
          const bw = piece.beatsPerBar * pxBeat - 2;
          const a = Math.min(1, Math.abs(sc) / lim) * 0.75 + 0.05;
          g.fillStyle =
            sc >= 0 ? `rgba(52,211,153,${a})` : `rgba(251,113,133,${a})`;
          g.fillRect(bx, 17, bw, 3);
        });
      }
      if (marks) {
        const count = new Map<number, number>();
        for (const mk of marks) {
          const k = count.get(mk.bar) ?? 0;
          count.set(mk.bar, k + 1);
          const cx = x((mk.bar + 1) * piece.beatsPerBar) - 8 - k * 9;
          g.fillStyle = mk.reward > 0 ? "#34d399" : "#fb7185";
          g.beginPath();
          if (mk.reward > 0) {
            g.moveTo(cx, 5);
            g.lineTo(cx + 4, 12);
            g.lineTo(cx - 4, 12);
          } else {
            g.moveTo(cx, 12);
            g.lineTo(cx + 4, 5);
            g.lineTo(cx - 4, 5);
          }
          g.closePath();
          g.fill();
        }
      }
      for (let b = 0; b <= piece.beats; b++) {
        const isBar = b % piece.beatsPerBar === 0;
        g.strokeStyle = isBar
          ? "rgba(255,255,255,0.12)"
          : "rgba(255,255,255,0.04)";
        g.beginPath();
        g.moveTo(Math.round(x(b)) + 0.5, top);
        g.lineTo(Math.round(x(b)) + 0.5, height);
        g.stroke();
      }
      // Notes (pad first so it sits behind)
      const order: TrackId[] = ["pad", "keys", "arp", "bass", "lead"];
      for (const track of order) {
        if (hidden.has(track)) continue;
        const color = TRACK_META[track].color;
        for (const n of notes) {
          if (n.track !== track) continue;
          const nx = x(n.time);
          const w = Math.max(2, n.dur * pxBeat - 1);
          const active = playing && pos >= n.time && pos < n.time + n.dur;
          g.globalAlpha =
            track === "pad" ? 0.22 : active ? 1 : 0.35 + n.vel * 0.45;
          g.fillStyle = color;
          if (active) {
            g.shadowColor = color;
            g.shadowBlur = 12;
          }
          roundRect(
            g,
            nx,
            y(n.midi) + 0.5,
            w,
            Math.max(2, rowH - 1),
            Math.min(3, rowH / 2),
          );
          g.fill();
          g.shadowBlur = 0;
        }
      }
      g.globalAlpha = 1;
      // Drum lane
      const laneTop = height - drumLane;
      g.fillStyle = "rgba(0,0,0,0.25)";
      g.fillRect(gutter, laneTop, width - gutter, drumLane);
      g.fillStyle = "rgba(255,255,255,0.35)";
      g.font = "9px ui-sans-serif, system-ui";
      g.fillText("DRUMS", 2, laneTop + 12);
      if (!hidden.has("drums")) {
        const dh = drumLane / DRUM_ROWS.length;
        for (const d of piece.drums) {
          const row = DRUM_ROWS.indexOf(d.drum);
          const active = playing && pos >= d.time && pos < d.time + 0.2;
          g.globalAlpha = active ? 1 : 0.25 + d.vel * 0.5;
          g.fillStyle =
            d.drum === "kick"
              ? "#fb7185"
              : d.drum === "snare" || d.drum === "clap"
                ? "#fbbf24"
                : "#d4d4d8";
          g.fillRect(
            x(d.time),
            laneTop + row * dh + 0.5,
            Math.max(2, pxBeat * 0.18),
            Math.max(1.5, dh - 1),
          );
        }
        g.globalAlpha = 1;
      }
      // Playhead
      if (playing) {
        const px = x(pos);
        const grad = g.createLinearGradient(px - 40, 0, px, 0);
        grad.addColorStop(0, "rgba(251,191,36,0)");
        grad.addColorStop(1, "rgba(251,191,36,0.12)");
        g.fillStyle = grad;
        g.fillRect(px - 40, top, 40, height - top);
        g.fillStyle = "#fbbf24";
        g.fillRect(px - 1, top, 2, height - top);
      }
    };

    const loop = () => {
      draw();
      if (playing) raf = requestAnimationFrame(loop);
    };
    resize();
    loop();
    const ro = new ResizeObserver(() => {
      resize();
      draw();
    });
    ro.observe(wrap);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [piece, playing, hidden, getPosition, barScores, marks]);

  return (
    <div ref={wrapRef} className="relative w-full">
      <canvas
        ref={canvasRef}
        className="block w-full cursor-crosshair rounded-xl"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const gutter = 34;
          const beat =
            ((e.clientX - rect.left - gutter) / (rect.width - gutter)) *
            piece.beats;
          if (beat >= 0)
            onSeek(Math.floor(beat / piece.beatsPerBar) * piece.beatsPerBar);
        }}
        aria-label="Piano roll of the generated piece. Click to play from a bar."
        role="img"
      />
    </div>
  );
}

function isInScale(piece: Piece, midi: number) {
  const steps = SCALE_CACHE.get(piece.key.scale) ?? [];
  return steps.includes((midi - piece.key.tonic + 120) % 12);
}

const SCALE_CACHE = new Map(SCALES.map((s) => [s.id, s.steps]));

function roundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
