import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { compose, type Piece, type Settings } from "../generate";
import { tasteFrom } from "../bandit";
import { randomSeed } from "../random";
import { STYLES, TRACK_IDS, type StyleId, type TrackId } from "../styles";
import { KEY_NAMES, SCALES, type Extension, type ScaleId } from "../theory";
import {
  Engine,
  renderOffline,
  type Mix,
  type TrackMix,
} from "../audio/engine";
import { download, encodeWav, exportMidi } from "../audio/export";
import {
  ChordTimeline,
  Dice,
  IconButton,
  MarkovBrain,
  Mixer,
  Panel,
  Segmented,
  Slider,
  Spectrum,
} from "./components";
import { PianoRoll } from "./PianoRoll";
import { FeedbackButtons, TastePanel, useTaste } from "./TastePanel";
import { mixForStyle, readHash, settingsForStyle, writeHash } from "./state";
import { ChatPanel } from "./ChatPanel";
import { describeState, type Command } from "../assistant";

let sharedEngine: Engine | null = null;

function initialState(): { settings: Settings; mix: Mix } {
  const fromHash = typeof location !== "undefined" ? readHash() : null;
  if (fromHash) return fromHash;
  const settings = settingsForStyle("pop");
  return { settings, mix: mixForStyle("pop") };
}

export function ComposerPage() {
  const [{ settings, mix }, setState] = useState(initialState);
  const engine = useMemo(() => (sharedEngine ??= new Engine(mix)), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Learning from feedback (linear Thompson sampling)
  const taste = useTaste(settings.style);
  const [learning, setLearning] = useState(true);
  const [evolve, setEvolve] = useState(true);
  const [exploration, setExploration] = useState(0.5);
  const [take, setTake] = useState(0);
  const [flash, setFlash] = useState<{ reward: number; n: number } | null>(
    null,
  );

  // Pieces are cached per (settings, take, learning) so the loop hand-off and
  // React render agree on the exact same object.
  const cache = useRef(new WeakMap<Settings, Map<string, Piece>>());
  const makePiece = useCallback(
    (
      s: Settings,
      t: number,
      learn: boolean,
      explore: number,
      model = taste.model,
    ) => {
      let byTake = cache.current.get(s);
      if (!byTake) cache.current.set(s, (byTake = new Map()));
      const key = `${t}|${learn ? explore : "off"}`;
      let p = byTake.get(key);
      if (!p) {
        p = compose(
          s,
          learn ? { taste: tasteFrom(model, explore), take: t } : { take: t },
        );
        byTake.set(key, p);
      }
      return p;
    },
    [taste.model],
  );
  const piece = useMemo(
    () => makePiece(settings, take, learning, exploration),
    [makePiece, settings, take, learning, exploration],
  );

  // At the end of each loop, rewrite the piece only if there are new ratings.
  // Without new feedback the loop replays exactly; with it, the only thing
  // that changes is what the updated model chooses.
  const live = useRef({
    settings,
    take,
    learning,
    evolve,
    exploration,
    makePiece,
    piece,
    model: taste.model,
  });
  live.current = {
    settings,
    take,
    learning,
    evolve,
    exploration,
    makePiece,
    piece,
    model: taste.model,
  };
  useEffect(() => {
    engine.onLoopEnd = () => {
      const l = live.current;
      if (!l.learning || !l.evolve) return null;
      if (l.model.n === l.piece.tasteRatings) return null;
      const next = l.makePiece(l.settings, l.take + 1, true, l.exploration);
      l.take = l.take + 1;
      setTake(l.take);
      return next;
    };
    return () => {
      engine.onLoopEnd = null;
    };
  }, [engine]);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [currentChord, setCurrentChord] = useState(-1);
  const [activity, setActivity] = useState<Record<TrackId, boolean>>({
    lead: false,
    keys: false,
    pad: false,
    arp: false,
    bass: false,
    drums: false,
  });
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const generation = useRef(0);

  const setSettings = (patch: Partial<Settings>) =>
    setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  const setMix = (fn: (m: Mix) => Mix) =>
    setState((s) => ({ ...s, mix: fn(s.mix) }));

  // Keep engine in sync
  useEffect(() => engine.setPiece(piece), [engine, piece]);
  useEffect(() => engine.setMix(mix), [engine, mix]);
  useEffect(() => {
    engine.loop = loop;
  }, [engine, loop]);
  useEffect(() => {
    const off = engine.subscribe(() => setPlaying(engine.playing));
    return () => void off();
  }, [engine]);
  useEffect(() => () => engine.stop(), [engine]);
  useEffect(() => writeHash(settings, mix), [settings, mix]);

  // Track the current chord & per-track activity while playing
  useEffect(() => {
    if (!playing) {
      setCurrentChord(-1);
      return;
    }
    let raf = 0;
    let last = -2;
    let lastAct = "";
    const tick = () => {
      const pos = engine.position();
      let idx = -1;
      for (const c of piece.chords) if (c.time <= pos) idx = c.index;
      if (idx !== last) {
        last = idx;
        setCurrentChord(idx);
      }
      const act = {} as Record<TrackId, boolean>;
      for (const id of TRACK_IDS) act[id] = false;
      for (const n of piece.notes)
        if (n.time <= pos && pos < n.time + Math.min(n.dur, 0.5))
          act[n.track] = true;
      for (const d of piece.drums)
        if (d.time <= pos && pos < d.time + 0.15) act.drums = true;
      const key = JSON.stringify(act);
      if (key !== lastAct) {
        lastAct = key;
        setActivity(act);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [playing, piece, engine]);

  const play = useCallback(
    (from = 0) => {
      engine.ensure();
      void engine.preloadInstruments();
      engine.play(from);
    },
    [engine],
  );

  const generate = useCallback(() => {
    generation.current++;
    setTake(0);
    setState((s) => ({
      ...s,
      settings: {
        ...s.settings,
        seed: randomSeed(),
        partSeeds: {},
        overrides: {},
      },
    }));
  }, []);

  const changeStyle = (style: StyleId) => {
    setTake(0);
    setState((s) => ({
      settings: { ...settingsForStyle(style, s.settings), seed: randomSeed() },
      mix: mixForStyle(style, s.mix),
    }));
  };

  const reroll = (id: TrackId) => {
    const part =
      id === "lead"
        ? "melody"
        : id === "bass"
          ? "bass"
          : id === "drums"
            ? "drums"
            : "comp";
    setSettings({ partSeeds: { ...settings.partSeeds, [part]: randomSeed() } });
  };

  const rerollHarmony = () =>
    setSettings({
      partSeeds: { ...settings.partSeeds, harmony: randomSeed() },
      overrides: {},
    });

  const updateTrack = (id: TrackId, patch: Partial<TrackMix>) =>
    setMix((m) => ({
      ...m,
      tracks: { ...m.tracks, [id]: { ...m.tracks[id], ...patch } },
    }));

  const pieceKey = `${settings.seed}:${piece.take}`;
  const rate = useCallback(
    (reward: 1 | -1) => {
      if (!engine.playing) return;
      // Allow ~a quarter second of reaction time
      const beat = Math.max(
        0,
        engine.position() - 0.25 * (settings.tempo / 60),
      );
      const bar = Math.min(
        piece.barFeatures.length - 1,
        Math.floor(beat / piece.beatsPerBar),
      );
      const phi = piece.barFeatures[bar];
      if (!phi) return;
      taste.rate(phi, reward, {
        at: Date.now(),
        take: piece.take,
        bar,
        key: pieceKey,
      });
      setFlash((f) => ({ reward, n: (f?.n ?? 0) + 1 }));
    },
    [engine, piece, pieceKey, settings.tempo, taste],
  );
  const marks = useMemo(
    () =>
      taste.model.history
        .filter((h) => h.key === pieceKey)
        .map((h) => ({ bar: h.bar, reward: h.reward })),
    [taste.model, taste.version, pieceKey], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const barScores = useMemo(
    () => piece.barFeatures.map((phi) => taste.model.predict(phi)),
    [piece, taste.model, taste.version], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Talk to the composer: apply a command from the chat box.
  const current = useRef({ settings, mix, playing });
  current.current = { settings, mix, playing };
  const applyCommand = (cmd: Command): string => {
    const { set } = cmd;
    const changes: string[] = [];
    if (set.style && set.style !== settings.style) {
      changeStyle(set.style);
      changes.push(`style ${set.style}`);
    }
    const patch: Partial<Settings> = {};
    if (set.key) {
      const i = KEY_NAMES.indexOf(set.key as (typeof KEY_NAMES)[number]);
      if (i >= 0) patch.tonic = i;
    }
    if (set.scale) patch.scale = set.scale;
    if (set.tempo) patch.tempo = set.tempo;
    if (set.bars) patch.bars = set.bars;
    if (set.extension) patch.extension = set.extension;
    if (set.creativity !== undefined) patch.creativity = set.creativity / 100;
    if (set.swing !== undefined) patch.swing = set.swing / 100;
    if (set.key) changes.push(`key ${set.key}`);
    if (set.scale) changes.push(`scale ${set.scale}`);
    if (set.tempo) changes.push(`${set.tempo} bpm`);
    if (set.bars) changes.push(`${set.bars} bars`);
    if (set.extension) changes.push(set.extension);
    if (set.creativity !== undefined)
      changes.push(`creativity ${set.creativity}%`);
    if (set.swing !== undefined) changes.push(`swing ${set.swing}%`);
    // Applied after changeStyle, so explicit values win over style defaults.
    if (Object.keys(patch).length)
      setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
    if (
      set.reverb !== undefined ||
      set.echo !== undefined ||
      set.vinyl !== undefined
    ) {
      setMix((m) => ({
        ...m,
        reverb: set.reverb !== undefined ? set.reverb / 100 : m.reverb,
        delay: set.echo !== undefined ? set.echo / 100 : m.delay,
        vinyl: set.vinyl ?? m.vinyl,
      }));
      if (set.reverb !== undefined) changes.push(`reverb ${set.reverb}%`);
      if (set.echo !== undefined) changes.push(`echo ${set.echo}%`);
      if (set.vinyl !== undefined)
        changes.push(`vinyl ${set.vinyl ? "on" : "off"}`);
    }
    for (const a of cmd.actions) {
      switch (a.do) {
        case "play":
          if (!engine.playing) play();
          break;
        case "stop":
          engine.stop();
          break;
        case "compose":
          generate();
          break;
        case "newProgression":
          rerollHarmony();
          break;
        case "like":
        case "dislike":
          if (!engine.playing) {
            changes.push("(press play first to rate a bar)");
            continue;
          }
          rate(a.do === "like" ? 1 : -1);
          break;
        case "reroll":
          reroll(a.track!);
          break;
        case "mute":
        case "unmute":
          updateTrack(a.track!, { mute: a.do === "mute" });
          break;
        case "solo":
        case "unsolo":
          updateTrack(a.track!, { solo: a.do === "solo" });
          break;
      }
      changes.push(a.track ? `${a.do} ${a.track}` : a.do);
    }
    return changes.join(" · ");
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (e.code === "Space") {
        e.preventDefault();
        if (engine.playing) engine.stop();
        else play();
      } else if (e.key === "g" || e.key === "G") generate();
      else if (e.key === "ArrowUp" && engine.playing) {
        e.preventDefault();
        rate(1);
      } else if (e.key === "ArrowDown" && engine.playing) {
        e.preventDefault();
        rate(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [engine, play, generate, rate]);

  const exportWav = async () => {
    setExporting(true);
    try {
      engine.ensure();
      const buffer = await renderOffline(piece, mix);
      download(encodeWav(buffer), `${fileBase()}.wav`);
    } finally {
      setExporting(false);
    }
  };
  const fileBase = () =>
    `${piece.style.id}-${KEY_NAMES[settings.tonic]}-${settings.scale}-${settings.seed}`;

  const getPosition = useCallback(() => engine.position(), [engine]);
  const hidden = useMemo(
    () => new Set(TRACK_IDS.filter((id) => mix.tracks[id].mute)),
    [mix],
  );
  const scale = SCALES.find((s) => s.id === settings.scale)!;
  const durationSec = (piece.beats * 60) / settings.tempo;

  return (
    <div className="mx-auto max-w-[1400px] px-3 pb-16 pt-4 sm:px-5">
      {/* Hero / transport */}
      <div className="mb-4 flex flex-col gap-4 rounded-2xl border border-white/[0.07] bg-gradient-to-br from-zinc-900/90 via-zinc-900/70 to-zinc-950/90 p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300/80">
            <span className="inline-block size-1.5 animate-pulse rounded-full bg-amber-400" />{" "}
            Markov composer
          </div>
          <h1 className="mt-1 truncate text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {piece.style.name} in {KEY_NAMES[settings.tonic]}{" "}
            {scale.name.toLowerCase()}
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            {settings.bars} bars · {settings.tempo} bpm ·{" "}
            {Math.floor(durationSec / 60)}:
            {String(Math.round(durationSec % 60)).padStart(2, "0")} ·{" "}
            {piece.sections.map((s) => s.label).join(" ")} · seed{" "}
            <span className="font-mono text-zinc-300">
              {settings.seed.toString(36)}
            </span>
            {learning && (
              <>
                {" "}
                ·{" "}
                <span className="text-emerald-300">take {piece.take + 1}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Spectrum
            analyser={engine.graph?.analyser ?? null}
            active={playing}
          />
          <FeedbackButtons enabled={playing} onRate={rate} flash={flash} />
          <button
            onClick={() => (playing ? engine.stop() : play())}
            className={`flex h-12 items-center gap-2 rounded-xl px-5 font-semibold shadow-lg transition ${
              playing
                ? "bg-white text-zinc-900 hover:bg-zinc-200"
                : "bg-gradient-to-r from-amber-400 to-orange-500 text-zinc-950 hover:brightness-110"
            }`}
            aria-label={playing ? "Stop" : "Play"}
          >
            {playing ? (
              <svg
                viewBox="0 0 24 24"
                className="size-5"
                fill="currentColor"
                aria-hidden
              >
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                className="size-5"
                fill="currentColor"
                aria-hidden
              >
                <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
              </svg>
            )}
            {playing ? "Stop" : "Play"}
          </button>
          <button
            onClick={generate}
            className="flex h-12 items-center gap-2 rounded-xl bg-white/10 px-4 font-semibold text-white ring-1 ring-white/10 transition hover:bg-white/15"
          >
            <Dice /> Compose new
          </button>
          <div className="flex items-center rounded-xl bg-white/5 p-1 ring-1 ring-white/10">
            <IconButton
              label={loop ? "Loop on" : "Loop off"}
              active={loop}
              onClick={() => setLoop(!loop)}
            >
              <svg
                viewBox="0 0 24 24"
                className="size-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
              >
                <path d="M17 2l4 4-4 4" />
                <path d="M3 11V9a3 3 0 0 1 3-3h15" />
                <path d="M7 22l-4-4 4-4" />
                <path d="M21 13v2a3 3 0 0 1-3 3H3" />
              </svg>
            </IconButton>
            <IconButton
              label="Download MIDI"
              onClick={() =>
                download(exportMidi(piece, mix), `${fileBase()}.mid`)
              }
            >
              <span className="text-[10px] font-bold">MID</span>
            </IconButton>
            <IconButton
              label={exporting ? "Rendering WAV…" : "Download WAV"}
              onClick={() => !exporting && void exportWav()}
            >
              {exporting ? (
                <span className="size-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <span className="text-[10px] font-bold">WAV</span>
              )}
            </IconButton>
            <IconButton
              label={copied ? "Link copied" : "Copy share link"}
              onClick={() => {
                void navigator.clipboard?.writeText(location.href);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? (
                "✓"
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  className="size-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden
                >
                  <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1 1" />
                  <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1-1" />
                </svg>
              )}
            </IconButton>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* Controls */}
        <aside className="order-2 space-y-4 lg:order-1">
          <Panel title="Style">
            <div className="grid grid-cols-2 gap-2">
              {STYLES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => changeStyle(s.id)}
                  aria-pressed={s.id === settings.style}
                  className={`group relative overflow-hidden rounded-xl p-2.5 text-left ring-1 transition ${
                    s.id === settings.style
                      ? "ring-white/40"
                      : "ring-white/5 hover:ring-white/20"
                  }`}
                >
                  <span
                    className={`absolute inset-0 bg-gradient-to-br ${s.gradient} transition ${s.id === settings.style ? "opacity-30" : "opacity-[0.08] group-hover:opacity-15"}`}
                  />
                  <span className="relative block text-sm font-semibold text-white">
                    {s.name}
                  </span>
                  <span className="relative block text-[10px] leading-tight text-zinc-300/80">
                    {s.blurb}
                  </span>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="Key & scale">
            <div className="mb-3 grid grid-cols-6 gap-1">
              {KEY_NAMES.map((k, i) => (
                <button
                  key={k}
                  onClick={() => setSettings({ tonic: i })}
                  aria-pressed={settings.tonic === i}
                  className={`rounded-md py-1.5 text-xs font-semibold transition ${
                    settings.tonic === i
                      ? "bg-amber-400 text-zinc-900"
                      : k.length > 1
                        ? "bg-zinc-950 text-zinc-400 hover:text-white"
                        : "bg-zinc-800/80 text-zinc-200 hover:bg-zinc-700"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
            <select
              value={settings.scale}
              onChange={(e) =>
                setSettings({ scale: e.target.value as ScaleId })
              }
              aria-label="Scale"
              className="w-full rounded-lg border border-white/10 bg-zinc-950 px-2 py-2 text-sm text-zinc-200"
            >
              {SCALES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.mood}
                </option>
              ))}
            </select>
          </Panel>

          <Panel title="Composition">
            <div className="space-y-4">
              <div>
                <div className="mb-1.5 text-xs text-zinc-400">Length</div>
                <Segmented
                  label="Length"
                  value={settings.bars}
                  onChange={(v) => setSettings({ bars: v })}
                  options={[8, 16, 32].map((b) => ({
                    value: b as 8 | 16 | 32,
                    label: `${b} bars`,
                  }))}
                />
              </div>
              <div>
                <div className="mb-1.5 text-xs text-zinc-400">
                  Harmony colour
                </div>
                <Segmented<Extension>
                  label="Chord extensions"
                  value={settings.extension}
                  onChange={(v) => setSettings({ extension: v })}
                  options={[
                    { value: "triad", label: "Triads" },
                    { value: "seventh", label: "7ths" },
                    { value: "ninth", label: "9ths" },
                  ]}
                />
              </div>
              <Slider
                label="Tempo"
                value={settings.tempo}
                min={50}
                max={180}
                onChange={(v) => setSettings({ tempo: v })}
                format={(v) => `${v} bpm`}
              />
              <Slider
                label="Creativity"
                value={Math.round(settings.creativity * 100)}
                min={0}
                max={100}
                onChange={(v) => setSettings({ creativity: v / 100 })}
                format={(v) => `${v}%`}
                hint={["Predictable", "Adventurous"]}
              />
              <Slider
                label="Swing"
                value={Math.round(settings.swing * 100)}
                min={0}
                max={100}
                onChange={(v) => setSettings({ swing: v / 100 })}
                format={(v) => `${v}%`}
              />
            </div>
          </Panel>

          <Panel title="Space">
            <div className="space-y-4">
              <Slider
                label="Reverb"
                value={Math.round(mix.reverb * 100)}
                min={0}
                max={100}
                onChange={(v) => setMix((m) => ({ ...m, reverb: v / 100 }))}
                format={(v) => `${v}%`}
              />
              <Slider
                label="Echo"
                value={Math.round(mix.delay * 100)}
                min={0}
                max={100}
                onChange={(v) => setMix((m) => ({ ...m, delay: v / 100 }))}
                format={(v) => `${v}%`}
              />
              <label className="flex cursor-pointer items-center justify-between text-xs text-zinc-400">
                Vinyl crackle
                <input
                  type="checkbox"
                  checked={mix.vinyl}
                  onChange={(e) =>
                    setMix((m) => ({ ...m, vinyl: e.target.checked }))
                  }
                  className="toggle"
                />
              </label>
            </div>
          </Panel>
        </aside>

        {/* Main */}
        <main className="order-1 min-w-0 space-y-4 lg:order-2">
          <Panel
            title="Harmony"
            className="relative z-20"
            action={
              <div className="flex items-center gap-1">
                {Object.keys(settings.overrides).length > 0 && (
                  <button
                    onClick={() => setSettings({ overrides: {} })}
                    className="rounded-md px-2 py-1 text-xs text-zinc-400 hover:bg-white/10 hover:text-white"
                  >
                    Reset edits
                  </button>
                )}
                <button
                  onClick={rerollHarmony}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-zinc-300 hover:bg-white/10 hover:text-white"
                >
                  <Dice /> New progression
                </button>
              </div>
            }
          >
            <ChordTimeline
              piece={piece}
              currentIndex={currentChord}
              onReplace={(i, token) =>
                setSettings({
                  overrides: { ...settings.overrides, [i]: token },
                })
              }
              onPreview={(midis) => engine.preview("keys", midis, 1.5)}
            />
            <p className="mt-3 text-[11px] text-zinc-500">
              Click a chord to see what the Markov chain would play there
              instead.{" "}
              <span className="inline-flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-emerald-400" />
                tonic
              </span>{" "}
              <span className="inline-flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-sky-400" />
                pre-dominant
              </span>{" "}
              <span className="inline-flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-rose-400" />
                dominant
              </span>{" "}
              <span className="inline-flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-violet-400" />
                colour
              </span>
            </p>
          </Panel>

          <Panel
            title="Score"
            action={
              <span className="text-[11px] text-zinc-500">
                Click a bar to play from there · Space to play/stop · G to
                compose
              </span>
            }
          >
            <PianoRoll
              piece={piece}
              getPosition={getPosition}
              playing={playing}
              hidden={hidden}
              onSeek={(beat) => play(beat)}
              barScores={learning ? barScores : undefined}
              marks={marks}
            />
          </Panel>

          <Panel
            title="Talk to the composer"
            action={
              <span className="text-[11px] text-zinc-500">
                Chrome built-in AI · on-device
              </span>
            }
          >
            <ChatPanel
              getState={() => {
                const c = current.current;
                return {
                  ...c,
                  text: describeState(c.settings, c.mix, c.playing),
                };
              }}
              apply={applyCommand}
            />
          </Panel>

          <Panel
            title="Teach it your taste · linear Thompson sampling"
            action={
              <span className="text-[11px] text-zinc-500">
                👍 / 👎 or ↑ / ↓ rate the bar that is playing
              </span>
            }
          >
            <TastePanel
              model={taste.model}
              version={taste.version}
              learning={learning}
              setLearning={setLearning}
              evolve={evolve}
              setEvolve={setEvolve}
              exploration={exploration}
              setExploration={setExploration}
              onReset={taste.reset}
              onNextTake={() => setTake((t) => t + 1)}
              pendingRatings={learning ? taste.model.n - piece.tasteRatings : 0}
              take={piece.take}
              styleName={piece.style.name}
            />
          </Panel>

          <Panel
            title="Mixer & instruments"
            action={
              <span className="text-[11px] text-zinc-500">
                ◆ = real recorded samples, streamed on first play
              </span>
            }
          >
            <Mixer
              mix={mix}
              onChange={updateTrack}
              onReroll={reroll}
              activity={activity}
            />
          </Panel>

          <Panel title="Inside the Markov chain">
            <MarkovBrain piece={piece} currentIndex={currentChord} />
          </Panel>
        </main>
      </div>
    </div>
  );
}
