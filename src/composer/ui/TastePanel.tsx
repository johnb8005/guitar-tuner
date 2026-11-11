import { useCallback, useMemo, useRef, useState } from "react";
import {
  FEATURES,
  LinearTS,
  type FeatureGroup,
  type FeedbackEvent,
  type ModelJSON,
} from "../bandit";
import type { StyleId } from "../styles";
import { Slider } from "./components";

// ---------------- Model state (persisted per style) ----------------

const storageKey = (style: StyleId) => `cadence-taste-v1:${style}`;

function loadModel(style: StyleId): LinearTS {
  try {
    const raw = localStorage.getItem(storageKey(style));
    if (raw) return LinearTS.fromJSON(JSON.parse(raw) as ModelJSON);
  } catch {
    /* storage unavailable or corrupt: start fresh */
  }
  return new LinearTS();
}

function saveModel(style: StyleId, model: LinearTS) {
  try {
    localStorage.setItem(storageKey(style), JSON.stringify(model.toJSON()));
  } catch {
    /* ignore quota / privacy mode */
  }
}

export function useTaste(style: StyleId) {
  const models = useRef(new Map<StyleId, LinearTS>());
  const [version, setVersion] = useState(0);
  let model = models.current.get(style);
  if (!model) {
    model = loadModel(style);
    models.current.set(style, model);
  }
  const current = model;
  const rate = useCallback(
    (
      phi: number[],
      reward: number,
      meta: Omit<FeedbackEvent, "reward" | "predicted">,
    ) => {
      current.update(phi, reward, meta);
      saveModel(style, current);
      setVersion((v) => v + 1);
    },
    [current, style],
  );
  const reset = useCallback(() => {
    const fresh = new LinearTS();
    models.current.set(style, fresh);
    saveModel(style, fresh);
    setVersion((v) => v + 1);
  }, [style]);
  return { model: current, version, rate, reset };
}

// ---------------- Feedback buttons ----------------

export function FeedbackButtons({
  enabled,
  onRate,
  flash,
}: {
  enabled: boolean;
  onRate: (reward: 1 | -1) => void;
  flash: { reward: number; n: number } | null;
}) {
  const base =
    "relative grid h-12 w-12 place-items-center rounded-xl text-xl ring-1 transition disabled:cursor-not-allowed disabled:opacity-35";
  return (
    <div
      className="flex items-center gap-1.5"
      title={
        enabled
          ? "Rate the bar that is playing (↑ / ↓)"
          : "Press play, then rate bars as they go by"
      }
    >
      <button
        type="button"
        disabled={!enabled}
        onClick={() => onRate(1)}
        aria-label="I like this bar"
        className={`${base} bg-emerald-500/15 ring-emerald-400/30 hover:bg-emerald-500/30`}
      >
        <span
          key={flash?.reward === 1 ? flash.n : "up"}
          className={flash?.reward === 1 ? "animate-[pop_0.35s_ease-out]" : ""}
        >
          👍
        </span>
      </button>
      <button
        type="button"
        disabled={!enabled}
        onClick={() => onRate(-1)}
        aria-label="I don't like this bar"
        className={`${base} bg-rose-500/15 ring-rose-400/30 hover:bg-rose-500/30`}
      >
        <span
          key={flash?.reward === -1 ? flash.n : "down"}
          className={flash?.reward === -1 ? "animate-[pop_0.35s_ease-out]" : ""}
        >
          👎
        </span>
      </button>
    </div>
  );
}

// ---------------- Panel ----------------

const GROUP_COLOR: Record<FeatureGroup, string> = {
  general: "#d4d4d8",
  harmony: "#38bdf8",
  melody: "#fbbf24",
  rhythm: "#f472b6",
};

const LINE_COLORS = ["#fbbf24", "#38bdf8", "#f472b6", "#34d399", "#a78bfa"];

type Props = {
  model: LinearTS;
  version: number;
  learning: boolean;
  setLearning: (v: boolean) => void;
  evolve: boolean;
  setEvolve: (v: boolean) => void;
  exploration: number;
  setExploration: (v: number) => void;
  onReset: () => void;
  onNextTake: () => void;
  take: number;
  /** Ratings given since the playing take was written. */
  pendingRatings: number;
  styleName: string;
};

export function TastePanel(props: Props) {
  const { model, version, exploration } = props;
  const mu = useMemo(() => model.mean(), [model, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const sd = useMemo(
    () => model.std(exploration),
    [model, version, exploration],
  ); // eslint-disable-line react-hooks/exhaustive-deps
  const history = model.history;
  const ups = history.filter((h) => h.reward > 0).length;
  const order = useMemo(
    () =>
      FEATURES.map((f, i) => ({ f, i })).sort(
        (a, b) => Math.abs(mu[b.i]!) - Math.abs(mu[a.i]!),
      ),
    [mu],
  );
  const maxAbs = Math.max(
    0.5,
    ...order.map(({ i }) => Math.abs(mu[i]!) + sd[i]!),
  );

  // Model accuracy: did its prediction (before the update) agree with the rating?
  const recent = history.slice(-30);
  const agree = recent.filter(
    (h) => Math.sign(h.predicted) === Math.sign(h.reward) && h.predicted !== 0,
  ).length;

  return (
    <div className="space-y-4">
      {/* Controls & stats */}
      <div className="grid gap-3 sm:grid-cols-[auto_auto_minmax(0,1fr)_auto] sm:items-center">
        <Toggle
          label="Learn from ratings"
          checked={props.learning}
          onChange={props.setLearning}
        />
        <Toggle
          label="Apply ratings each loop"
          checked={props.evolve}
          onChange={props.setEvolve}
          disabled={!props.learning}
        />
        <div className="sm:px-3">
          <Slider
            label="Exploration"
            value={Math.round(exploration * 100)}
            min={5}
            max={150}
            onChange={(v) => props.setExploration(v / 100)}
            format={(v) => `${v}%`}
            hint={["Play it safe", "Try new things"]}
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={props.onNextTake}
            disabled={!props.learning || props.pendingRatings <= 0}
            title={
              props.pendingRatings > 0
                ? `Rewrite now using ${props.pendingRatings} new rating${props.pendingRatings === 1 ? "" : "s"}`
                : "Rate something first: the music only changes from your ratings"
            }
            className="rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-200 ring-1 ring-emerald-400/30 hover:bg-emerald-500/25 disabled:opacity-40"
          >
            Apply now
          </button>
          <button
            onClick={() => {
              if (confirm(`Forget everything learned for ${props.styleName}?`))
                props.onReset();
            }}
            className="rounded-lg px-3 py-1.5 text-xs text-zinc-400 ring-1 ring-white/10 hover:bg-white/10 hover:text-white"
          >
            Reset taste
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Ratings" value={String(history.length)} />
        <Stat
          label="Liked"
          value={
            history.length
              ? `${Math.round((ups / history.length) * 100)}%`
              : "—"
          }
        />
        <Stat label="Take" value={`#${props.take + 1}`} />
        <Stat
          label="Model agreed (last 30)"
          value={
            recent.length >= 5
              ? `${Math.round((agree / recent.length) * 100)}%`
              : "—"
          }
        />
      </div>

      {history.length === 0 && (
        <p className="rounded-xl border border-dashed border-white/10 p-3 text-xs leading-relaxed text-zinc-400">
          Press play and hit 👍 / 👎 (or ↑ / ↓) whenever a bar grabs you or bugs
          you. Each rating updates a Bayesian linear model over{" "}
          {FEATURES.length} traits of that bar. The loop replays exactly as it
          is until you rate something. At the end of a loop with new ratings,
          the composer chooses again among the same Markov candidate
          progressions and melodies, keeping the ones the updated model
          (Thompson sampling) predicts you will like best. Nothing else changes,
          so every difference you hear comes from your feedback.
        </p>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Learned weights */}
        <div>
          <h3 className="mb-2 flex items-center justify-between text-xs font-medium text-zinc-300">
            What it has learned
            <span className="flex gap-2 text-[10px] font-normal text-zinc-500">
              {(["harmony", "melody", "rhythm"] as FeatureGroup[]).map((g) => (
                <span key={g} className="flex items-center gap-1">
                  <span
                    className="size-1.5 rounded-full"
                    style={{ background: GROUP_COLOR[g] }}
                  />
                  {g}
                </span>
              ))}
            </span>
          </h3>
          <ul className="space-y-1">
            {order.map(({ f, i }) => {
              const m = mu[i]!;
              const s = sd[i]!;
              const pct = (v: number) => 50 + (v / maxAbs) * 50;
              return (
                <li
                  key={f.id}
                  className="grid grid-cols-[150px_minmax(0,1fr)_40px] items-center gap-2 text-[11px]"
                >
                  <span
                    className="flex items-center gap-1.5 truncate text-zinc-400"
                    title={f.label}
                  >
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ background: GROUP_COLOR[f.group] }}
                    />
                    {f.label}
                  </span>
                  <div className="relative h-4 rounded bg-white/[0.03]">
                    <span className="absolute inset-y-0 left-1/2 w-px bg-white/15" />
                    {/* uncertainty band */}
                    <span
                      className="absolute inset-y-1 rounded-full bg-white/10 transition-all duration-500"
                      style={{
                        left: `${pct(m - s)}%`,
                        width: `${pct(m + s) - pct(m - s)}%`,
                      }}
                    />
                    <span
                      className={`absolute inset-y-0.5 rounded transition-all duration-500 ${m >= 0 ? "bg-emerald-400/80" : "bg-rose-400/80"}`}
                      style={{
                        left: `${Math.min(50, pct(m))}%`,
                        width: `${Math.abs(pct(m) - 50)}%`,
                      }}
                    />
                  </div>
                  <span
                    className={`text-right font-mono tabular-nums ${m >= 0 ? "text-emerald-300" : "text-rose-300"}`}
                  >
                    {m >= 0 ? "+" : ""}
                    {m.toFixed(2)}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[10px] text-zinc-500">
            Bars show the posterior mean weight; the grey band is ±1σ of the
            exploration-scaled uncertainty that Thompson sampling draws from.
          </p>
        </div>

        <div className="space-y-4">
          <EvolutionChart model={model} version={version} />
          <TakesChart history={history} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-zinc-950/50 px-3 py-2 ring-1 ring-white/[0.06]">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div className="text-lg font-semibold tabular-nums text-white">
        {value}
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-2 text-xs text-zinc-300 ${disabled ? "opacity-40" : ""}`}
    >
      <input
        type="checkbox"
        className="toggle"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

/** Posterior mean of the strongest traits after each rating. */
function EvolutionChart({
  model,
  version,
}: {
  model: LinearTS;
  version: number;
}) {
  const W = 520;
  const H = 170;
  const pad = { l: 30, r: 8, t: 8, b: 22 };
  const trace = model.trace;
  const history = model.history;
  const data = useMemo(() => {
    const last = trace[trace.length - 1];
    if (!last) return null;
    const top = FEATURES.map((f, i) => ({ f, i }))
      .filter(({ f }) => f.id !== "bias")
      .sort((a, b) => Math.abs(last[b.i]!) - Math.abs(last[a.i]!))
      .slice(0, 5);
    const all = trace.flatMap((row) => top.map(({ i }) => row[i]!));
    const lim = Math.max(0.3, ...all.map(Math.abs));
    return { top, lim };
  }, [trace, version]); // eslint-disable-line react-hooks/exhaustive-deps

  const n = trace.length;
  const x = (k: number) =>
    pad.l + (n <= 1 ? 0 : (k / (n - 1)) * (W - pad.l - pad.r));
  const y = (v: number) =>
    pad.t + ((data!.lim - v) / (2 * data!.lim)) * (H - pad.t - pad.b);

  return (
    <div>
      <h3 className="mb-2 text-xs font-medium text-zinc-300">
        Evolution of the strongest traits
      </h3>
      <div className="rounded-xl bg-zinc-950/50 p-2 ring-1 ring-white/[0.06]">
        {!data ? (
          <div className="grid h-[170px] place-items-center text-xs text-zinc-500">
            Ratings will draw here
          </div>
        ) : (
          <>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="w-full"
              role="img"
              aria-label="Weights of the strongest traits over time"
            >
              <line
                x1={pad.l}
                x2={W - pad.r}
                y1={y(0)}
                y2={y(0)}
                stroke="rgba(255,255,255,0.15)"
              />
              {[data.lim, -data.lim].map((v) => (
                <text
                  key={v}
                  x={pad.l - 4}
                  y={y(v) + 3}
                  textAnchor="end"
                  fontSize="9"
                  fill="rgba(255,255,255,0.4)"
                >
                  {v > 0 ? "+" : ""}
                  {v.toFixed(1)}
                </text>
              ))}
              {/* ratings as ticks along the bottom */}
              {history.slice(-n).map((h, k) => (
                <rect
                  key={k}
                  x={x(k) - 1}
                  y={H - pad.b + 6}
                  width={2}
                  height={8}
                  rx={1}
                  fill={h.reward > 0 ? "#34d399" : "#fb7185"}
                />
              ))}
              {data.top.map(({ i }, c) => (
                <polyline
                  key={i}
                  fill="none"
                  stroke={LINE_COLORS[c]}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  points={trace
                    .map((row, k) => `${x(k)},${y(row[i]!)}`)
                    .join(" ")}
                />
              ))}
            </svg>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 px-1 text-[10px] text-zinc-400">
              {data.top.map(({ f }, c) => (
                <span key={f.id} className="flex items-center gap-1">
                  <span
                    className="h-0.5 w-3 rounded"
                    style={{ background: LINE_COLORS[c] }}
                  />
                  {f.label}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** 👍 / 👎 counts per take: do later takes earn more likes? */
function TakesChart({ history }: { history: FeedbackEvent[] }) {
  const takes = useMemo(() => {
    const map = new Map<string, { label: string; up: number; down: number }>();
    for (const h of history) {
      const k = h.key ?? `t${h.take}`;
      let t = map.get(k);
      if (!t) map.set(k, (t = { label: `${h.take + 1}`, up: 0, down: 0 }));
      if (h.reward > 0) t.up++;
      else t.down++;
    }
    return [...map.values()].slice(-20);
  }, [history, history.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const max = Math.max(1, ...takes.map((t) => Math.max(t.up, t.down)));
  return (
    <div>
      <h3 className="mb-2 text-xs font-medium text-zinc-300">Likes per take</h3>
      <div className="flex h-[120px] items-stretch gap-1 rounded-xl bg-zinc-950/50 p-2 ring-1 ring-white/[0.06]">
        {takes.length === 0 ? (
          <div className="grid flex-1 place-items-center text-xs text-zinc-500">
            No takes rated yet
          </div>
        ) : (
          takes.map((t, i) => {
            const ratio = t.up / Math.max(1, t.up + t.down);
            return (
              <div
                key={i}
                className="flex min-w-0 flex-1 flex-col items-center"
                title={`Take ${t.label}: ${t.up} 👍 ${t.down} 👎`}
              >
                <div className="flex w-full flex-1 flex-col justify-end">
                  <div
                    className="mx-auto w-3/4 max-w-5 rounded-t bg-emerald-400/80"
                    style={{ height: `${(t.up / max) * 100}%` }}
                  />
                </div>
                <div className="my-0.5 h-px w-full bg-white/15" />
                <div className="flex w-full flex-1 flex-col justify-start">
                  <div
                    className="mx-auto w-3/4 max-w-5 rounded-b bg-rose-400/80"
                    style={{ height: `${(t.down / max) * 100}%` }}
                  />
                </div>
                <span
                  className="mt-0.5 text-[9px] tabular-nums"
                  style={{ color: `hsl(${ratio * 120}, 70%, 65%)` }}
                >
                  {t.label}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
