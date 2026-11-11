import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { chordSuggestions, harmonyChain, type ChordSlot, type Piece } from "../generate";
import { buildChord, chordPcs, voiceLead } from "../theory";
import { TRACK_IDS, type TrackId } from "../styles";
import { INSTRUMENTS, getInstrument, onSampleState, sampleState, type Family } from "../audio/instruments";
import type { Mix, TrackMix } from "../audio/engine";
import { TRACK_META } from "./state";

// ---------- primitives ----------

export function Panel({ title, action, children, className = "" }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-white/[0.07] bg-zinc-900/60 backdrop-blur-sm ${className}`}>
      {title && (
        <header className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">{title}</h2>
          {action}
        </header>
      )}
      <div className="px-4 pb-4">{children}</div>
    </section>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-lg bg-zinc-950/60 p-0.5 ring-1 ring-white/5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition ${
            o.value === value ? "bg-zinc-700 text-white shadow" : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({ label, value, min, max, step = 1, onChange, format, hint }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string; hint?: [string, string] }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between text-xs">
        <span className="text-zinc-400">{label}</span>
        <span className="font-mono tabular-nums text-zinc-200">{format ? format(value) : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="range w-full"
        style={{ "--pct": `${pct}%` } as React.CSSProperties}
      />
      {hint && (
        <div className="mt-0.5 flex justify-between text-[10px] text-zinc-500">
          <span>{hint[0]}</span>
          <span>{hint[1]}</span>
        </div>
      )}
    </label>
  );
}

export function IconButton({ label, onClick, children, active, className = "" }: { label: string; onClick: () => void; children: ReactNode; active?: boolean; className?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`grid size-8 place-items-center rounded-lg text-sm transition ${active ? "bg-white/15 text-white" : "text-zinc-400 hover:bg-white/10 hover:text-white"} ${className}`}
    >
      {children}
    </button>
  );
}

export const Dice = () => (
  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
    <circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" />
    <circle cx="15.5" cy="15.5" r="1.2" fill="currentColor" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
  </svg>
);

// ---------- Chord timeline ----------

const FUNC_COLOR: Record<string, string> = {
  tonic: "bg-emerald-400",
  predominant: "bg-sky-400",
  dominant: "bg-rose-400",
  color: "bg-violet-400",
};

export function ChordTimeline({ piece, currentIndex, onReplace, onPreview }: { piece: Piece; currentIndex: number; onReplace: (index: number, token: string) => void; onPreview: (midis: number[]) => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const suggestions = useMemo(() => (open === null ? [] : chordSuggestions(piece, open)), [piece, open]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open === null) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(null);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const voicing = (slot: { chord: ChordSlot["chord"] }) => voiceLead(slot.chord, null, 52, 74, 5);

  return (
    <div ref={ref} className="relative">
      <div className="flex flex-wrap gap-y-3">
        {piece.sections.map((section, si) => {
          const slots = piece.chords.filter((c) => c.section === si);
          return (
            <div key={si} className="w-full min-w-0 px-0.5 md:w-1/2">
              <div className="mb-1 flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                <span>{section.label}</span>
                <span className="h-px flex-1 bg-white/5" />
                <span className="font-normal normal-case tracking-normal">{slots[slots.length - 1]?.cadence === "authentic" ? "→ cadence" : "→ half cadence"}</span>
              </div>
              <div className="flex gap-0.5">
                {slots.map((slot) => {
                  const active = slot.index === currentIndex;
                  const edited = piece.settings.overrides[slot.index] !== undefined;
                  return (
                    <button
                      key={slot.index}
                      onClick={() => {
                        setOpen(open === slot.index ? null : slot.index);
                        onPreview(voicing(slot));
                      }}
                      style={{ flex: slot.beats }}
                      className={`group relative min-w-0 rounded-lg border px-1.5 py-1.5 text-left transition ${
                        active
                          ? "border-amber-400/70 bg-amber-400/15 shadow-[0_0_20px_-4px_rgba(251,191,36,0.5)]"
                          : open === slot.index
                            ? "border-white/30 bg-white/10"
                            : "border-white/[0.06] bg-zinc-950/40 hover:border-white/20 hover:bg-white/5"
                      }`}
                    >
                      <div className={`truncate font-semibold text-white ${slot.beats < 4 ? "text-xs" : "text-sm"}`}>{slot.chord.symbol}</div>
                      <div className="flex items-center gap-1 text-[10px] text-zinc-400">
                        <span className={`size-1.5 shrink-0 rounded-full ${FUNC_COLOR[slot.chord.func]}`} />
                        <span className="truncate font-serif italic">{slot.chord.roman}</span>
                        {edited && <span className="ml-auto text-amber-300" title="Edited">•</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {open !== null && (
        <div className="absolute left-1/2 top-full z-30 mt-2 w-72 -translate-x-1/2 rounded-xl border border-white/10 bg-zinc-900/95 p-3 shadow-2xl backdrop-blur-xl">
          <div className="mb-2 text-xs text-zinc-400">
            Markov suggestions for chord {open + 1} — given{" "}
            <span className="text-zinc-200">{piece.chords.slice(Math.max(0, open - 2), open).map((c) => c.chord.roman).join(" → ") || "the start"}</span>
            {piece.chords[open + 1] && (
              <>
                {" "}and leading to <span className="text-zinc-200">{piece.chords[open + 1]!.chord.roman}</span>
              </>
            )}
          </div>
          <ul className="space-y-1">
            {suggestions.map((s) => {
              const current = s.token === piece.chords[open]!.chord.token;
              return (
                <li key={s.token}>
                  <button
                    onMouseEnter={() => onPreview(voiceLead(s.chord, null, 52, 74, 5))}
                    onClick={() => {
                      onReplace(open, s.token);
                      setOpen(null);
                    }}
                    className={`relative flex w-full items-center gap-2 overflow-hidden rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-white/10 ${current ? "ring-1 ring-amber-400/50" : ""}`}
                  >
                    <span className="absolute inset-y-0 left-0 bg-amber-400/10" style={{ width: `${Math.max(3, s.p * 100)}%` }} />
                    <span className="relative w-14 font-semibold text-white">{s.chord.symbol}</span>
                    <span className="relative w-14 font-serif italic text-zinc-400">{s.chord.roman}</span>
                    <span className="relative ml-auto font-mono text-xs text-zinc-400">{(s.p * 100).toFixed(0)}%</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------- Mixer ----------

const FAMILY_LABEL: Record<Family, string> = { keys: "Keys", lead: "Leads", pad: "Pads", pluck: "Plucks & mallets", bass: "Bass", drums: "Drum kits" };

function useSampleStates() {
  const [, force] = useState(0);
  useEffect(() => {
    const off = onSampleState(() => force((n) => n + 1));
    return () => void off();
  }, []);
}

export function Mixer({ mix, onChange, onReroll, activity }: { mix: Mix; onChange: (id: TrackId, patch: Partial<TrackMix>) => void; onReroll: (id: TrackId) => void; activity: Record<TrackId, boolean> }) {
  useSampleStates();
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
      {TRACK_IDS.map((id) => {
        const t = mix.tracks[id];
        const meta = TRACK_META[id];
        const def = getInstrument(t.instrument);
        const st = sampleState(t.instrument);
        const families: Family[] = id === "drums" ? ["drums"] : ["keys", "lead", "pad", "pluck", "bass"];
        return (
          <div key={id} className={`rounded-xl border border-white/[0.06] bg-zinc-950/50 p-2.5 ${t.mute ? "opacity-50" : ""}`}>
            <div className="mb-2 flex items-center gap-2">
              <span className="size-2 rounded-full transition" style={{ background: meta.color, boxShadow: activity[id] ? `0 0 10px ${meta.color}` : "none" }} />
              <span className={`text-xs font-semibold ${meta.text}`}>{meta.label}</span>
              <button
                onClick={() => onReroll(id)}
                className="ml-auto grid size-6 place-items-center rounded-md text-zinc-500 transition hover:bg-white/10 hover:text-white"
                title={`Re-roll ${meta.label.toLowerCase()}`}
                aria-label={`Re-roll ${meta.label.toLowerCase()}`}
              >
                <Dice />
              </button>
            </div>
            <select
              value={t.instrument}
              onChange={(e) => onChange(id, { instrument: e.target.value })}
              aria-label={`${meta.label} instrument`}
              className="mb-2 w-full rounded-md border border-white/10 bg-zinc-900 px-1.5 py-1 text-xs text-zinc-200"
            >
              {families.map((f) => (
                <optgroup key={f} label={FAMILY_LABEL[f]}>
                  {INSTRUMENTS.filter((i) => i.family === f).map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                      {i.kind === "sampled" ? " ◆" : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <div className="mb-1.5 h-3 text-[10px] text-zinc-500">
              {def.kind === "sampled"
                ? st.state === "loading"
                  ? `Loading samples ${Math.round(st.progress * 100)}%`
                  : st.state === "ready"
                    ? "◆ Sampled"
                    : st.state === "error"
                      ? "Samples offline · synth"
                      : "◆ Sampled (on play)"
                : def.kind === "kit"
                  ? "Synth kit"
                  : "Synth"}
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={t.volume}
                onChange={(e) => onChange(id, { volume: Number(e.target.value) })}
                aria-label={`${meta.label} volume`}
                className="range min-w-0 flex-1"
                style={{ "--pct": `${t.volume * 100}%`, "--accent": meta.color } as React.CSSProperties}
              />
              <button
                onClick={() => onChange(id, { mute: !t.mute })}
                aria-pressed={t.mute}
                className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${t.mute ? "bg-rose-500 text-white" : "bg-white/5 text-zinc-400 hover:text-white"}`}
              >
                M
              </button>
              <button
                onClick={() => onChange(id, { solo: !t.solo })}
                aria-pressed={t.solo}
                className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${t.solo ? "bg-amber-400 text-zinc-900" : "bg-white/5 text-zinc-400 hover:text-white"}`}
              >
                S
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Markov brain ----------

export function MarkovBrain({ piece, currentIndex }: { piece: Piece; currentIndex: number }) {
  const chain = harmonyChain(piece.style.id);
  const tokens = useMemo(() => {
    const vocab = [...chain.vocabulary];
    const order = (t: string) => (/^\d$/.test(t) ? Number(t) : 10 + t.length);
    return vocab.sort((a, b) => order(a) - order(b));
  }, [chain]);
  const matrix = useMemo(() => chain.matrix(tokens), [chain, tokens]);
  const labels = tokens.map((t) => buildChord(piece.key, t, "triad").roman);
  const cur = piece.chords[currentIndex];
  const prev = currentIndex > 0 ? piece.chords[currentIndex - 1] : undefined;
  const from = prev ? tokens.indexOf(prev.chord.token) : -1;
  const to = cur ? tokens.indexOf(cur.chord.token) : -1;
  const size = tokens.length;

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="mx-auto border-separate border-spacing-[2px] text-[10px]">
          <thead>
            <tr>
              <th className="pr-1 text-right font-normal text-zinc-500">from ↓ to →</th>
              {labels.map((l, j) => (
                <th key={j} className={`w-7 font-serif font-normal italic ${j === to ? "text-amber-300" : "text-zinc-400"}`}>
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, i) => (
              <tr key={i}>
                <th className={`pr-1 text-right font-serif font-normal italic ${i === from ? "text-amber-300" : "text-zinc-400"}`}>{labels[i]}</th>
                {row.map((p, j) => {
                  const hot = i === from && j === to;
                  return (
                    <td
                      key={j}
                      title={`${labels[i]} → ${labels[j]}: ${(p * 100).toFixed(0)}%`}
                      className={`h-6 w-7 rounded-[4px] text-center font-mono ${hot ? "ring-2 ring-amber-300" : ""}`}
                      style={{ background: `rgba(251,191,36,${p === 0 ? 0.03 : 0.12 + p * 0.85})`, color: p > 0.45 ? "#18181b" : "rgba(255,255,255,0.55)" }}
                    >
                      {p >= 0.05 ? Math.round(p * 100) : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-zinc-400">
        First-order view of the {piece.style.name.toLowerCase()} harmony chain ({size} chords, trained on {piece.style.progressions.length} progressions).
        Generation uses an order-2 chain with back-off, looks ahead so each section lands on a cadence, and a second chain learned
        from folk melodies picks melodic intervals, nudged toward chord tones on strong beats.
      </p>
    </div>
  );
}

// ---------- Spectrum ----------

export function Spectrum({ analyser, active }: { analyser: AnalyserNode | null; active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const g = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    const W = 120;
    const H = 32;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    let raf = 0;
    const data = new Uint8Array(analyser?.frequencyBinCount ?? 1024);
    const bars = 24;
    const draw = () => {
      g.clearRect(0, 0, W, H);
      if (analyser && active) analyser.getByteFrequencyData(data);
      else data.fill(0);
      for (let i = 0; i < bars; i++) {
        // log-spaced bins
        const a = Math.floor(Math.pow(data.length, i / bars));
        const b = Math.max(a + 1, Math.floor(Math.pow(data.length, (i + 1) / bars)));
        let m = 0;
        for (let k = a; k < b; k++) m = Math.max(m, data[k]!);
        const h = Math.max(1.5, (m / 255) * H);
        const grad = g.createLinearGradient(0, H, 0, 0);
        grad.addColorStop(0, "#f59e0b");
        grad.addColorStop(1, "#f472b6");
        g.fillStyle = grad;
        g.fillRect(i * (W / bars), H - h, W / bars - 1.5, h);
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [analyser, active]);
  return <canvas ref={ref} style={{ width: 120, height: 32 }} aria-hidden className="hidden sm:block" />;
}

export { chordPcs };
