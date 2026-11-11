// Talk to the composer: turns a chat message into a structured command.
//
// Two interpreters share one Command shape:
//   • Chrome's built-in on-device model (Gemini Nano via the Prompt API), asked
//     to answer with JSON that matches COMMAND_SCHEMA.
//   • A small keyword parser, used when the Prompt API is missing or fails.
// Whatever comes back goes through sanitizeCommand, so the page only ever sees
// valid, clamped values.

import type { Settings } from "./generate";
import type { Mix } from "./audio/engine";
import { STYLES, TRACK_IDS, type StyleId, type TrackId } from "./styles";
import { KEY_NAMES, SCALES, type Extension, type ScaleId } from "./theory";

export type ActionName =
  | "play"
  | "stop"
  | "compose"
  | "newProgression"
  | "like"
  | "dislike"
  | "reroll"
  | "mute"
  | "unmute"
  | "solo"
  | "unsolo";

export type Action = { do: ActionName; track?: TrackId };

export type SettingsPatch = {
  style?: StyleId;
  key?: string; // one of KEY_NAMES
  scale?: ScaleId;
  tempo?: number;
  bars?: 8 | 16 | 32;
  creativity?: number; // 0..100
  extension?: Extension;
  swing?: number; // 0..100
  reverb?: number; // 0..100
  echo?: number; // 0..100
  vinyl?: boolean;
};

export type Command = {
  reply: string;
  set: SettingsPatch;
  actions: Action[];
};

const STYLE_IDS = STYLES.map((s) => s.id);
const SCALE_IDS = SCALES.map((s) => s.id);
const EXTENSIONS: Extension[] = ["triad", "seventh", "ninth"];
const ACTIONS: ActionName[] = [
  "play",
  "stop",
  "compose",
  "newProgression",
  "like",
  "dislike",
  "reroll",
  "mute",
  "unmute",
  "solo",
  "unsolo",
];
const TRACK_ACTIONS = new Set<ActionName>([
  "reroll",
  "mute",
  "unmute",
  "solo",
  "unsolo",
]);

/** JSON schema handed to the Prompt API as `responseConstraint`. */
export const COMMAND_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    set: {
      type: "object",
      properties: {
        style: { type: "string", enum: STYLE_IDS },
        key: { type: "string", enum: [...KEY_NAMES] },
        scale: { type: "string", enum: SCALE_IDS },
        tempo: { type: "integer", minimum: 50, maximum: 180 },
        bars: { type: "integer", enum: [8, 16, 32] },
        creativity: { type: "integer", minimum: 0, maximum: 100 },
        extension: { type: "string", enum: EXTENSIONS },
        swing: { type: "integer", minimum: 0, maximum: 100 },
        reverb: { type: "integer", minimum: 0, maximum: 100 },
        echo: { type: "integer", minimum: 0, maximum: 100 },
        vinyl: { type: "boolean" },
      },
      additionalProperties: false,
    },
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          do: { type: "string", enum: ACTIONS },
          track: { type: "string", enum: [...TRACK_IDS] },
        },
        required: ["do"],
        additionalProperties: false,
      },
    },
  },
  required: ["reply", "set", "actions"],
  additionalProperties: false,
} as const;

export const SYSTEM_PROMPT = `You control a Markov-chain music composer in a web page. The user talks to you in plain language; you answer ONLY with JSON matching the given schema.

Fields:
- reply: one short, friendly sentence saying what you changed (or answering the question).
- set: only the settings that should change. Leave out everything else.
  style: ${STYLES.map((s) => `${s.id} (${s.blurb})`).join("; ")}.
  key: tonic note, one of ${KEY_NAMES.join(" ")}.
  scale: ${SCALES.map((s) => `${s.id} (${s.name}, ${s.mood.toLowerCase()})`).join("; ")}.
  tempo: bpm 50-180. bars: 8, 16 or 32. extension: triad, seventh or ninth (harmony colour).
  creativity, swing, reverb, echo: 0-100. vinyl: crackle on/off.
- actions: things to do, in order.
  play, stop; compose (a whole new piece); newProgression (new chords only);
  like / dislike (feedback on the bar playing right now, teaches the model the user's taste);
  reroll, mute, unmute, solo, unsolo need a track: lead (melody), keys, pad, arp (arpeggio), bass, drums.

Guidelines:
- Relative requests use the current state: "faster" is about +15 bpm, "a lot more reverb" about +30.
- Moods: sad or dark → minor scales (aeolian, harmonicMinor, phrygian); happy or bright → ionian or lydian; dreamy → lydian, more reverb; chill → lofi, slower; energetic → faster, higher creativity.
- Praise of the music ("I love this", "nice", "this part is great") → like. Complaints ("boring", "I hate this bit") → dislike.
- Changing style, key or scale does not need compose.
- If the user only asks a question, answer in reply with empty set and actions.`;

/** Current state, written as context for the model. */
export function describeState(
  settings: Settings,
  mix: Mix,
  playing: boolean,
): string {
  const scale = SCALES.find((s) => s.id === settings.scale);
  const muted = TRACK_IDS.filter((id) => mix.tracks[id].mute);
  const soloed = TRACK_IDS.filter((id) => mix.tracks[id].solo);
  return [
    `style=${settings.style}`,
    `key=${KEY_NAMES[settings.tonic]}`,
    `scale=${settings.scale}${scale ? ` (${scale.name})` : ""}`,
    `tempo=${settings.tempo}`,
    `bars=${settings.bars}`,
    `creativity=${Math.round(settings.creativity * 100)}`,
    `extension=${settings.extension}`,
    `swing=${Math.round(settings.swing * 100)}`,
    `reverb=${Math.round(mix.reverb * 100)}`,
    `echo=${Math.round(mix.delay * 100)}`,
    `vinyl=${mix.vinyl}`,
    `playing=${playing}`,
    `muted=${muted.join(",") || "none"}`,
    `soloed=${soloed.join(",") || "none"}`,
  ].join(", ");
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Math.round(v)));
const num = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

/** Validate untrusted model output into a Command (drops anything invalid). */
export function sanitizeCommand(raw: unknown): Command {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const s = (o.set && typeof o.set === "object" ? o.set : {}) as Record<
    string,
    unknown
  >;
  const set: SettingsPatch = {};
  if (STYLE_IDS.includes(s.style as StyleId)) set.style = s.style as StyleId;
  if (typeof s.key === "string") {
    const k = normalizeKey(s.key);
    if (k) set.key = k;
  }
  if (SCALE_IDS.includes(s.scale as ScaleId)) set.scale = s.scale as ScaleId;
  if (num(s.tempo) !== undefined) set.tempo = clamp(s.tempo as number, 50, 180);
  if (s.bars === 8 || s.bars === 16 || s.bars === 32) set.bars = s.bars;
  for (const f of ["creativity", "swing", "reverb", "echo"] as const)
    if (num(s[f]) !== undefined) set[f] = clamp(s[f] as number, 0, 100);
  if (EXTENSIONS.includes(s.extension as Extension))
    set.extension = s.extension as Extension;
  if (typeof s.vinyl === "boolean") set.vinyl = s.vinyl;

  const actions: Action[] = [];
  if (Array.isArray(o.actions))
    for (const a of o.actions) {
      if (!a || typeof a !== "object") continue;
      const { do: name, track } = a as Record<string, unknown>;
      if (!ACTIONS.includes(name as ActionName)) continue;
      const t = TRACK_IDS.includes(track as TrackId)
        ? (track as TrackId)
        : undefined;
      if (TRACK_ACTIONS.has(name as ActionName) && !t) continue;
      actions.push(
        t ? { do: name as ActionName, track: t } : { do: name as ActionName },
      );
    }

  const reply =
    typeof o.reply === "string" && o.reply.trim()
      ? o.reply.trim().slice(0, 400)
      : "Done.";
  return { reply, set, actions };
}

const FLAT_OF: Record<string, string> = {
  "C#": "Db",
  "D#": "Eb",
  "F#": "F#",
  "G#": "Ab",
  "A#": "Bb",
  Gb: "F#",
};

/** "c#", "Db", "eb" → a name from KEY_NAMES, or undefined. */
export function normalizeKey(k: string): string | undefined {
  const m = k.trim().match(/^([a-gA-G])\s*(#|b|♯|♭|sharp|flat)?$/);
  if (!m) return undefined;
  const acc =
    m[2] === "♯" || m[2] === "sharp"
      ? "#"
      : m[2] === "♭" || m[2] === "flat"
        ? "b"
        : (m[2] ?? "");
  let name = m[1]!.toUpperCase() + acc;
  name = FLAT_OF[name] ?? name;
  if (name === "Cb") name = "B";
  if (name === "Fb") name = "E";
  if (name === "E#") name = "F";
  if (name === "B#") name = "C";
  return (KEY_NAMES as readonly string[]).includes(name) ? name : undefined;
}

// ---------------- Keyword fallback ----------------

const TRACK_WORDS: [RegExp, TrackId][] = [
  [/\b(melody|lead|tune)\b/, "lead"],
  [/\b(keys|piano|chords?)\b/, "keys"],
  [/\b(pad|pads|strings)\b/, "pad"],
  [/\b(arp|arps|arpeggios?)\b/, "arp"],
  [/\b(bass|bassline)\b/, "bass"],
  [/\b(drums?|beat|percussion)\b/, "drums"],
];

const SCALE_WORDS: [RegExp, ScaleId][] = [
  [/harmonic minor/, "harmonicMinor"],
  [/melodic minor/, "melodicMinor"],
  [/\bdorian\b/, "dorian"],
  [/\bphrygian\b/, "phrygian"],
  [/\blydian\b/, "lydian"],
  [/\bmixolydian\b/, "mixolydian"],
  [/\blocrian\b/, "locrian"],
  [/\b(minor|sad|melanchol\w*|dark)\b/, "aeolian"],
  [/\b(major|happy|bright|cheerful)\b/, "ionian"],
];

/**
 * Understands short, common requests without any model:
 * "jazz in D minor at 90 bpm", "faster", "more reverb", "mute the drums",
 * "new melody", "I like this", "play".
 */
export function parseLocally(
  text: string,
  current: { settings: Settings; mix: Mix },
): Command {
  const t = ` ${text.toLowerCase()} `;
  const set: SettingsPatch = {};
  const actions: Action[] = [];
  const said: string[] = [];
  const { settings, mix } = current;
  const pct = (v: number) => Math.round(v * 100);

  for (const s of STYLES)
    if (
      t.includes(s.id) ||
      t.includes(s.name.toLowerCase()) ||
      (s.id === "lofi" && /lo-?fi|chill/.test(t))
    )
      set.style = s.id;

  const key = t.match(
    /\bin ([a-g])(#|b|♯|♭| sharp| flat)?(?=[\s,.!?]|m\b|min\b|maj\b)/,
  );
  if (key) {
    const k = normalizeKey(key[1]! + (key[2]?.trim() ?? ""));
    if (k) set.key = k;
  }
  for (const [re, id] of SCALE_WORDS)
    if (re.test(t)) {
      set.scale = id;
      break;
    }

  const bpm = t.match(/(\d{2,3})\s*(bpm|beats)/);
  if (bpm) set.tempo = clamp(Number(bpm[1]), 50, 180);
  else if (/\b(faster|speed up|quicker|more energy|energetic|upbeat)\b/.test(t))
    set.tempo = clamp(
      settings.tempo + (/\bmuch|lot\b/.test(t) ? 30 : 15),
      50,
      180,
    );
  else if (/\b(slower|slow down|calmer|relax\w*)\b/.test(t))
    set.tempo = clamp(
      settings.tempo - (/\bmuch|lot\b/.test(t) ? 30 : 15),
      50,
      180,
    );

  const bars = t.match(/\b(8|16|32)\s*bars?\b/);
  if (bars) set.bars = Number(bars[1]) as 8 | 16 | 32;

  const step = (cur: number, up: boolean) =>
    clamp(cur + (up ? 20 : -20), 0, 100);
  const more = (w: string) =>
    new RegExp(`\\b(more|add|increase)\\b[^.]*\\b${w}`).test(t);
  const less = (w: string) =>
    new RegExp(`\\b(less|no|remove|reduce|decrease)\\b[^.]*\\b${w}`).test(t);
  if (more("reverb|space")) set.reverb = step(pct(mix.reverb), true);
  else if (less("reverb|space"))
    set.reverb = /\bno\b/.test(t) ? 0 : step(pct(mix.reverb), false);
  if (more("(echo|delay)")) set.echo = step(pct(mix.delay), true);
  else if (less("(echo|delay)"))
    set.echo = /\bno\b/.test(t) ? 0 : step(pct(mix.delay), false);
  if (more("swing")) set.swing = step(pct(settings.swing), true);
  else if (less("swing"))
    set.swing = /\bno\b/.test(t) ? 0 : step(pct(settings.swing), false);
  if (/\b(wilder|weirder|more creative|adventurous|surprise)\b/.test(t))
    set.creativity = step(pct(settings.creativity), true);
  else if (/\b(simpler|predictable|less creative|safer)\b/.test(t))
    set.creativity = step(pct(settings.creativity), false);
  if (/\b(vinyl|crackle)\b/.test(t))
    set.vinyl = !/\b(no|off|remove|without)\b/.test(t);
  if (/\b(triads?|simple chords)\b/.test(t)) set.extension = "triad";
  else if (/\b(9ths?|ninths?)\b/.test(t)) set.extension = "ninth";
  else if (/\b(7ths?|sevenths?|jazzier chords)\b/.test(t))
    set.extension = "seventh";

  const track = TRACK_WORDS.find(([re]) => re.test(t))?.[1];
  if (track && /\b(unmute|bring back)\b/.test(t))
    actions.push({ do: "unmute", track });
  else if (track && /\b(mute|silence|without|drop)\b/.test(t))
    actions.push({ do: "mute", track });
  else if (track && /\bunsolo\b/.test(t)) actions.push({ do: "unsolo", track });
  else if (track && /\b(solo|only)\b/.test(t))
    actions.push({ do: "solo", track });
  else if (
    track &&
    /\b(new|another|different|change|reroll)\b/.test(t) &&
    track !== "keys"
  )
    actions.push({ do: "reroll", track });

  if (/\b(new|other|different) (chords|progression|harmony)\b/.test(t))
    actions.push({ do: "newProgression" });
  else if (
    /\b(new (song|piece|tune)|compose|start over|something else)\b/.test(t)
  )
    actions.push({ do: "compose" });

  if (
    /\b(love|like|nice|great|awesome|beautiful|good)\b/.test(t) &&
    !/\b(don't|do not|not)\b/.test(t)
  )
    actions.push({ do: "like" });
  else if (
    /\b(hate|dislike|boring|bad|ugly|don't like|do not like|not good)\b/.test(t)
  )
    actions.push({ do: "dislike" });

  if (/\b(stop|pause|quiet|silence)\b/.test(t) && !track)
    actions.push({ do: "stop" });
  else if (/\b(play|start|go)\b/.test(t)) actions.push({ do: "play" });

  if (set.style) said.push(STYLES.find((s) => s.id === set.style)!.name);
  if (set.key || set.scale)
    said.push(
      `${set.key ?? KEY_NAMES[settings.tonic]} ${SCALES.find((s) => s.id === (set.scale ?? settings.scale))!.name.toLowerCase()}`,
    );
  if (set.tempo) said.push(`${set.tempo} bpm`);
  const n = Object.keys(set).length + actions.length;
  const reply =
    n === 0
      ? "Sorry, I didn't catch that. Try “jazz in D minor”, “faster”, “mute the drums” or “I like this”."
      : said.length
        ? `Okay: ${said.join(", ")}.`
        : "Okay.";
  return { reply, set, actions };
}
