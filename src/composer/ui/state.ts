// Shared UI state helpers: defaults, URL hash persistence, track metadata.

import { defaultSettings, type Settings } from "../generate";
import { randomSeed } from "../random";
import { getStyle, TRACK_IDS, type StyleId, type TrackId } from "../styles";
import type { Mix } from "../audio/engine";

export const TRACK_META: Record<
  TrackId,
  { label: string; color: string; text: string; ring: string }
> = {
  lead: {
    label: "Melody",
    color: "#fbbf24",
    text: "text-amber-300",
    ring: "ring-amber-400/60",
  },
  keys: {
    label: "Keys",
    color: "#38bdf8",
    text: "text-sky-300",
    ring: "ring-sky-400/60",
  },
  pad: {
    label: "Pad",
    color: "#a78bfa",
    text: "text-violet-300",
    ring: "ring-violet-400/60",
  },
  arp: {
    label: "Arpeggio",
    color: "#34d399",
    text: "text-emerald-300",
    ring: "ring-emerald-400/60",
  },
  bass: {
    label: "Bass",
    color: "#fb7185",
    text: "text-rose-300",
    ring: "ring-rose-400/60",
  },
  drums: {
    label: "Drums",
    color: "#d4d4d8",
    text: "text-zinc-200",
    ring: "ring-zinc-300/60",
  },
};

export function mixForStyle(style: StyleId, prev?: Mix): Mix {
  const s = getStyle(style);
  const tracks = {} as Mix["tracks"];
  for (const id of TRACK_IDS) {
    tracks[id] = {
      instrument: s.instruments[id],
      volume: prev?.tracks[id].volume ?? 0.8,
      mute: prev?.tracks[id].mute ?? false,
      solo: prev?.tracks[id].solo ?? false,
    };
  }
  return {
    tracks,
    reverb: style === "cinematic" ? 0.55 : style === "jazz" ? 0.3 : 0.4,
    delay: style === "synthwave" ? 0.35 : style === "classical" ? 0.1 : 0.22,
    vinyl: style === "lofi",
  };
}

export function settingsForStyle(style: StyleId, prev?: Settings): Settings {
  const base = defaultSettings(style, prev?.seed ?? randomSeed());
  if (!prev) return base;
  return {
    ...base,
    tonic: prev.tonic,
    bars: prev.bars,
    creativity: prev.creativity,
  };
}

type Saved = { s: Settings; i: Record<TrackId, string> };

export function readHash(): { settings: Settings; mix: Mix } | null {
  try {
    const raw = location.hash.replace(/^#/, "");
    if (!raw.startsWith("p=")) return null;
    const json = atob(
      decodeURIComponent(raw.slice(2)).replace(/-/g, "+").replace(/_/g, "/"),
    );
    const saved = JSON.parse(json) as Saved;
    const settings = {
      ...defaultSettings(saved.s.style, saved.s.seed),
      ...saved.s,
    };
    const mix = mixForStyle(settings.style);
    for (const id of TRACK_IDS)
      if (saved.i?.[id]) mix.tracks[id].instrument = saved.i[id];
    return { settings, mix };
  } catch {
    return null;
  }
}

export function writeHash(settings: Settings, mix: Mix) {
  const saved: Saved = {
    s: settings,
    i: Object.fromEntries(
      TRACK_IDS.map((id) => [id, mix.tracks[id].instrument]),
    ) as Saved["i"],
  };
  const b64 = btoa(JSON.stringify(saved))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  history.replaceState(
    null,
    "",
    `${location.pathname}${location.search}#p=${b64}`,
  );
}
