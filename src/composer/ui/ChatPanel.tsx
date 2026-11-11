// "Talk to the composer": a chat box backed by Chrome's built-in on-device
// model (Gemini Nano via the Prompt API), with a keyword parser as fallback.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  COMMAND_SCHEMA,
  parseLocally,
  sanitizeCommand,
  SYSTEM_PROMPT,
  type Command,
} from "../assistant";

// ---------------- Prompt API (minimal typings) ----------------

type Availability =
  "unavailable" | "downloadable" | "downloading" | "available";
type LMSession = {
  prompt(
    input: string,
    opts?: { responseConstraint?: object; signal?: AbortSignal },
  ): Promise<string>;
  clone?(): Promise<LMSession>;
  destroy(): void;
};
type LMCreateOptions = {
  initialPrompts?: { role: "system" | "user" | "assistant"; content: string }[];
  expectedInputs?: { type: "text"; languages?: string[] }[];
  expectedOutputs?: { type: "text"; languages?: string[] }[];
  temperature?: number;
  topK?: number;
  monitor?: (m: EventTarget) => void;
};
type LMFactory = {
  availability(opts?: Partial<LMCreateOptions>): Promise<Availability>;
  create(opts?: LMCreateOptions): Promise<LMSession>;
  params?(): Promise<{ defaultTopK: number }>;
};

const LANG = {
  expectedInputs: [{ type: "text" as const, languages: ["en"] }],
  expectedOutputs: [{ type: "text" as const, languages: ["en"] }],
};

function factory(): LMFactory | null {
  const g = globalThis as unknown as {
    LanguageModel?: LMFactory;
    ai?: { languageModel?: LMFactory };
  };
  return g.LanguageModel ?? g.ai?.languageModel ?? null;
}

export type ModelStatus =
  | { kind: "checking" }
  | { kind: "unsupported" } // no Prompt API in this browser
  | { kind: "unavailable" } // API exists, model can't run on this device
  | { kind: "downloadable" }
  | { kind: "downloading"; progress: number }
  | { kind: "ready" }
  | { kind: "error"; message: string };

/** Lifecycle of the on-device model: detect, download on demand, prompt. */
export function useOnDeviceModel() {
  const [status, setStatus] = useState<ModelStatus>({ kind: "checking" });
  const base = useRef<LMSession | null>(null);

  const create = useCallback(async () => {
    const lm = factory();
    if (!lm) return;
    setStatus({ kind: "downloading", progress: 0 });
    try {
      base.current = await lm.create({
        ...LANG,
        initialPrompts: [{ role: "system", content: SYSTEM_PROMPT }],
        monitor(m) {
          m.addEventListener("downloadprogress", (e) =>
            setStatus({
              kind: "downloading",
              progress: (e as ProgressEvent).loaded ?? 0,
            }),
          );
        },
      });
      setStatus({ kind: "ready" });
    } catch (e) {
      setStatus({ kind: "error", message: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    const lm = factory();
    if (!lm) {
      setStatus({ kind: "unsupported" });
      return;
    }
    let cancelled = false;
    lm.availability(LANG)
      .then((a) => {
        if (cancelled) return;
        if (a === "available") void create();
        else if (a === "unavailable") setStatus({ kind: "unavailable" });
        else if (a === "downloading") void create();
        else setStatus({ kind: "downloadable" });
      })
      .catch((e) => setStatus({ kind: "error", message: String(e) }));
    return () => {
      cancelled = true;
      base.current?.destroy();
      base.current = null;
    };
  }, [create]);

  /** One stateless turn: clone the primed session so context never piles up. */
  const ask = useCallback(
    async (text: string, state: string, signal?: AbortSignal) => {
      const b = base.current;
      if (!b) throw new Error("Model not ready");
      const s = b.clone ? await b.clone() : b;
      try {
        const out = await s.prompt(`Current state: ${state}\n\nUser: ${text}`, {
          responseConstraint: COMMAND_SCHEMA,
          signal,
        });
        return sanitizeCommand(JSON.parse(out));
      } finally {
        if (s !== b) s.destroy();
      }
    },
    [],
  );

  return { status, download: create, ask };
}

// ---------------- UI ----------------

type Msg = {
  id: number;
  from: "you" | "composer";
  text: string;
  via?: "nano" | "keywords";
  changes?: string;
};

const SUGGESTIONS = [
  "Something sad and slow",
  "Jazz in Bb, a bit faster",
  "Mute the drums",
  "I love this part",
  "New melody please",
];

export function ChatPanel({
  getState,
  apply,
}: {
  /** Snapshot used for context and for the keyword fallback. */
  getState: () => Parameters<typeof parseLocally>[1] & { text: string };
  /** Applies a command and returns a short summary of what changed. */
  apply: (cmd: Command) => string;
}) {
  const model = useOnDeviceModel();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const nextId = useRef(0);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [msgs]);

  const send = async (text: string) => {
    text = text.trim();
    if (!text || busy) return;
    setInput("");
    setMsgs((m) => [...m, { id: nextId.current++, from: "you", text }]);
    setBusy(true);
    const state = getState();
    let cmd: Command;
    let via: Msg["via"] = "keywords";
    try {
      if (model.status.kind !== "ready") throw new Error("no model");
      cmd = await model.ask(text, state.text);
      via = "nano";
    } catch {
      cmd = parseLocally(text, state);
    }
    const changes = apply(cmd);
    setMsgs((m) => [
      ...m,
      { id: nextId.current++, from: "composer", text: cmd.reply, via, changes },
    ]);
    setBusy(false);
  };

  return (
    <div className="space-y-3">
      <ModelBadge status={model.status} onDownload={model.download} />
      {msgs.length > 0 && (
        <div
          ref={list}
          className="max-h-64 space-y-2 overflow-y-auto pr-1"
          aria-live="polite"
        >
          {msgs.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.from === "you" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  m.from === "you"
                    ? "bg-amber-400/90 text-zinc-950"
                    : "bg-white/[0.06] text-zinc-100 ring-1 ring-white/10"
                }`}
              >
                {m.text}
                {m.changes && (
                  <div className="mt-1 font-mono text-[10px] text-zinc-400">
                    {m.changes}
                  </div>
                )}
                {m.via === "keywords" && (
                  <div className="mt-1 text-[10px] text-zinc-500">
                    keyword mode
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && (
            <div className="text-xs text-zinc-500">Thinking on-device…</div>
          )}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Tell the composer what you want…"
          aria-label="Message to the composer"
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-400/60 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-4 text-sm font-semibold text-zinc-950 transition hover:brightness-110 disabled:opacity-40"
        >
          Send
        </button>
      </form>
      {msgs.length === 0 && (
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => void send(s)}
              className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-zinc-300 ring-1 ring-white/10 hover:bg-white/10 hover:text-white"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ModelBadge({
  status,
  onDownload,
}: {
  status: ModelStatus;
  onDownload: () => void;
}) {
  const dot = (c: string) => (
    <span className={`inline-block size-1.5 rounded-full ${c}`} />
  );
  let body: React.ReactNode;
  switch (status.kind) {
    case "checking":
      body = <>{dot("bg-zinc-500")} Looking for Chrome's built-in AI…</>;
      break;
    case "ready":
      body = (
        <>
          {dot("bg-emerald-400")} Gemini Nano, running on your device. Nothing
          leaves your browser.
        </>
      );
      break;
    case "downloadable":
      body = (
        <>
          {dot("bg-sky-400")} Chrome's on-device model is available.{" "}
          <button
            onClick={onDownload}
            className="font-semibold text-sky-300 underline-offset-2 hover:underline"
          >
            Download it
          </button>{" "}
          (one-time, a few GB). Keyword mode until then.
        </>
      );
      break;
    case "downloading":
      body = (
        <>
          {dot("animate-pulse bg-sky-400")} Downloading the model…{" "}
          {Math.round(status.progress * 100)}%
        </>
      );
      break;
    case "unsupported":
    case "unavailable":
    case "error":
      body = (
        <>
          {dot("bg-zinc-500")} Keyword mode.{" "}
          {status.kind === "unsupported"
            ? "For full language understanding, open this page in desktop Chrome with built-in AI (the Prompt API) enabled."
            : status.kind === "unavailable"
              ? "Chrome's built-in model can't run on this device."
              : `The on-device model failed to start (${status.message}).`}
        </>
      );
  }
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-400">
      {body}
    </p>
  );
}
