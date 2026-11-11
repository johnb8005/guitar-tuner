import { describe, expect, test } from "bun:test";
import { DIM, FEATURES, LinearTS, tasteFrom } from "./bandit";
import { compose, defaultSettings } from "./generate";
import { createRng } from "./random";

const idx = (id: string) => FEATURES.findIndex((f) => f.id === id);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe("LinearTS", () => {
  test("posterior mean recovers a hidden preference", () => {
    const rng = createRng(7);
    const truth = new Array(DIM).fill(0);
    truth[idx("stepwise")] = 1;
    truth[idx("leaps")] = -1;
    const model = new LinearTS();
    for (let i = 0; i < 400; i++) {
      const phi = Array.from({ length: DIM }, (_, j) =>
        j === 0 ? 1 : rng.next(),
      );
      const r = phi.reduce((a, x, j) => a + x * truth[j]!, 0) > 0 ? 1 : -1;
      model.update(phi, r, { at: i, take: 0, bar: 0 });
    }
    const mu = model.mean();
    expect(mu[idx("stepwise")]!).toBeGreaterThan(0.3);
    expect(mu[idx("leaps")]!).toBeLessThan(-0.3);
    // Uncertainty shrinks with data
    expect(model.std(1)[idx("stepwise")]!).toBeLessThan(0.2);
  });

  test("serialises and restores", () => {
    const m = new LinearTS();
    m.update(new Array(DIM).fill(0.5), 1, { at: 0, take: 0, bar: 0 });
    const r = LinearTS.fromJSON(JSON.parse(JSON.stringify(m.toJSON())));
    expect(r.mean()).toEqual(m.mean());
    expect(r.history.length).toBe(1);
  });
});

describe("composing with a taste", () => {
  test("pieces have bar features and stay deterministic", () => {
    const model = new LinearTS();
    const s = defaultSettings("pop", 11);
    const a = compose(s, { taste: tasteFrom(model, 0.5), take: 2 });
    const b = compose(s, { taste: tasteFrom(model, 0.5), take: 2 });
    expect(a.notes).toEqual(b.notes);
    expect(a.barFeatures.length).toBe(s.bars);
    expect(a.barFeatures[0]!.length).toBe(DIM);
  });

  test("loops change only when the model has new ratings", () => {
    const s = defaultSettings("pop", 5);
    const plain = compose(s);
    // Learning on but nothing rated yet: identical to the plain piece.
    const model = new LinearTS();
    const untaught = compose(s, { taste: tasteFrom(model, 0.5), take: 1 });
    expect(untaught.notes).toEqual(plain.notes);
    expect(untaught.drums).toEqual(plain.drums);

    // Rate a few bars, then write two more takes with the same ratings:
    // the take number alone never changes the music.
    plain.barFeatures
      .slice(0, 6)
      .forEach((phi, bar) =>
        model.update(phi, bar % 2 ? 1 : -1, { at: bar, take: 0, bar }),
      );
    const a = compose(s, { taste: tasteFrom(model, 0.5), take: 2 });
    const b = compose(s, { taste: tasteFrom(model, 0.5), take: 7 });
    expect(a.notes).toEqual(b.notes);
    expect(a.tasteRatings).toBe(6);

    // Accompaniment that the model does not judge (drums) never changes.
    expect(a.drums.filter((d) => d.time < 4)).toEqual(
      plain.drums.filter((d) => d.time < 4),
    );
  });

  test("a simulated listener steers the music toward what they like", () => {
    // Listener who loves busy, stepwise melodies and dislikes big leaps.
    const likes = (phi: number[]) =>
      phi[idx("density")]! * 2 +
      phi[idx("stepwise")]! -
      phi[idx("leaps")]! * 2 -
      1;
    const score = (model: LinearTS | null, takes: number[]) =>
      mean(
        takes.map((take) => {
          const p = compose(
            defaultSettings("pop", 3),
            model ? { taste: tasteFrom(model, 0.3), take } : { take },
          );
          return mean(p.barFeatures.map(likes));
        }),
      );

    const baseline = score(null, [1, 2, 3, 4, 5, 6]);
    const model = new LinearTS();
    const rng = createRng(1);
    for (let take = 1; take <= 8; take++) {
      const p = compose(defaultSettings("pop", 3), {
        taste: tasteFrom(model, 0.6),
        take,
      });
      p.barFeatures.forEach((phi, bar) => {
        if (rng.chance(0.5))
          model.update(phi, likes(phi) > 0 ? 1 : -1, { at: take, take, bar });
      });
    }
    const learned = score(model, [11, 12, 13, 14, 15, 16]);
    expect(learned).toBeGreaterThan(baseline + 0.1);
  });
});
