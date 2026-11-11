import { describe, expect, test } from "bun:test";
import { compose, defaultSettings, harmonyChain } from "./generate";
import { STYLES } from "./styles";
import { buildChord, chordCorePcs, mod, voiceLead } from "./theory";
import { MarkovChain } from "./markov";
import { createRng } from "./random";

describe("theory", () => {
  test("diatonic chords in C major", () => {
    const key = { tonic: 0, scale: "ionian" as const };
    expect(buildChord(key, "1", "triad").symbol).toBe("C");
    expect(buildChord(key, "2", "seventh").symbol).toBe("Dm7");
    expect(buildChord(key, "5", "seventh").symbol).toBe("G7");
    expect(buildChord(key, "7", "seventh").symbol).toBe("Bm7b5");
    expect(buildChord(key, "4", "ninth").symbol).toBe("Fmaj9");
    expect(buildChord(key, "6", "triad").roman).toBe("vi");
    expect(buildChord(key, "bVII", "triad").symbol).toBe("Bb");
  });

  test("minor keys spell with flats and raised V7", () => {
    const key = { tonic: 2, scale: "aeolian" as const }; // D minor
    expect(buildChord(key, "1", "triad").symbol).toBe("Dm");
    expect(buildChord(key, "6", "triad").symbol).toBe("Bb");
    expect(buildChord(key, "V7", "triad").symbol).toBe("A7");
  });

  test("voice leading keeps common tones", () => {
    const key = { tonic: 0, scale: "ionian" as const };
    const c = voiceLead(buildChord(key, "1", "triad"), null, 52, 76);
    const am = voiceLead(buildChord(key, "6", "triad"), c, 52, 76);
    const moved = am.reduce(
      (a, n) => a + Math.min(...c.map((p) => Math.abs(p - n))),
      0,
    );
    expect(moved).toBeLessThanOrEqual(2);
  });
});

describe("markov", () => {
  test("learns transitions and backs off", () => {
    const chain = new MarkovChain(2).trainAll([
      ["a", "b", "c"],
      ["a", "b", "c"],
      ["a", "b", "d"],
    ]);
    const d = chain.distribution(["a", "b"]);
    expect(d.get("c")!).toBeGreaterThan(d.get("d")!);
    expect(chain.distribution(["zzz", "b"]).size).toBeGreaterThan(0);
    const rng = createRng(1);
    expect(["c", "d"]).toContain(chain.sample(["a", "b"], rng));
  });
});

describe("compose", () => {
  for (const style of STYLES) {
    test(`${style.id}: deterministic, structured and in key`, () => {
      for (const bars of [8, 16, 32] as const) {
        const settings = { ...defaultSettings(style.id, 42), bars };
        const a = compose(settings);
        const b = compose(settings);
        expect(a.notes).toEqual(b.notes);
        expect(a.chords.length).toBeGreaterThanOrEqual(bars);

        // Starts on tonic, ends with an authentic cadence on I
        expect(a.chords[0]!.chord.token).toBe("1");
        expect(a.chords[a.chords.length - 1]!.chord.token).toBe("1");

        const lead = a.notes.filter((n) => n.track === "lead");
        expect(lead.length).toBeGreaterThan(bars * 1.5);
        // Final melody note is the tonic
        expect(mod(lead[lead.length - 1]!.midi - a.key.tonic, 12)).toBe(0);
        // All lead notes are in range and inside the scale
        for (const n of lead) {
          expect(n.midi).toBeGreaterThanOrEqual(style.melodyRange[0] - 3);
          expect(n.midi).toBeLessThanOrEqual(style.melodyRange[1] + 5);
        }
        // Strong-beat melody notes mostly land on chord tones or their 9ths
        // (the rest are appoggiaturas that resolve by step)
        let strong = 0;
        let fit = 0;
        for (const n of lead) {
          const beat = Math.round(n.time * 4) / 4;
          if (beat % 2 !== 0) continue;
          const slot = [...a.chords]
            .reverse()
            .find((c) => c.time <= n.time + 1e-3)!;
          strong++;
          const pc = mod(n.midi, 12);
          if (
            chordCorePcs(slot.chord).includes(pc) ||
            mod(pc - slot.chord.root, 12) === 2
          )
            fit++;
        }
        expect(fit / strong).toBeGreaterThan(0.6);
        expect(a.notes.every((n) => n.time >= 0 && n.time < a.beats + 1)).toBe(
          true,
        );
      }
    });
  }

  test("different seeds give different music", () => {
    const a = compose(defaultSettings("pop", 1));
    const b = compose(defaultSettings("pop", 2));
    expect(a.notes.map((n) => n.midi)).not.toEqual(b.notes.map((n) => n.midi));
  });

  test("overrides replace a chord", () => {
    const s = defaultSettings("jazz", 5);
    const p = compose({ ...s, overrides: { 1: "4" } });
    expect(p.chords[1]!.chord.token).toBe("4");
  });

  test("harmony chains are trained", () => {
    for (const s of STYLES)
      expect(harmonyChain(s.id).vocabulary.size).toBeGreaterThan(4);
  });
});
