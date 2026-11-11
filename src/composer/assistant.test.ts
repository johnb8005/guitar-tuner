import { describe, expect, test } from "bun:test";
import { defaultSettings } from "./generate";
import { mixForStyle } from "./ui/state";
import {
  COMMAND_SCHEMA,
  normalizeKey,
  parseLocally,
  sanitizeCommand,
} from "./assistant";

const current = () => ({
  settings: defaultSettings("pop", 1),
  mix: mixForStyle("pop"),
});

describe("sanitizeCommand", () => {
  test("keeps valid fields and clamps numbers", () => {
    const cmd = sanitizeCommand({
      reply: "Going jazzy.",
      set: {
        style: "jazz",
        key: "c#",
        tempo: 400,
        reverb: -5,
        scale: "dorian",
      },
      actions: [{ do: "mute", track: "drums" }, { do: "play" }],
    });
    expect(cmd.set).toEqual({
      style: "jazz",
      key: "Db",
      tempo: 180,
      reverb: 0,
      scale: "dorian",
    });
    expect(cmd.actions).toEqual([
      { do: "mute", track: "drums" },
      { do: "play" },
    ]);
  });

  test("drops junk", () => {
    const cmd = sanitizeCommand({
      set: { style: "polka", bars: 12, vinyl: "yes" },
      actions: [{ do: "explode" }, { do: "mute" }, null],
    });
    expect(cmd.set).toEqual({});
    expect(cmd.actions).toEqual([]);
    expect(cmd.reply).toBe("Done.");
    expect(sanitizeCommand("nonsense").actions).toEqual([]);
  });

  test("schema enums cover every scale used by the UI", () => {
    expect(
      COMMAND_SCHEMA.properties.set.properties.scale.enum.length,
    ).toBeGreaterThan(5);
  });
});

describe("normalizeKey", () => {
  test("sharps and flats map to the app's key names", () => {
    expect(normalizeKey("bb")).toBe("Bb");
    expect(normalizeKey("A#")).toBe("Bb");
    expect(normalizeKey("f#")).toBe("F#");
    expect(normalizeKey("Gb")).toBe("F#");
    expect(normalizeKey("H")).toBeUndefined();
  });
});

describe("parseLocally", () => {
  test("style, key, scale and tempo in one sentence", () => {
    const cmd = parseLocally("jazz in D minor at 90 bpm", current());
    expect(cmd.set).toMatchObject({
      style: "jazz",
      key: "D",
      scale: "aeolian",
      tempo: 90,
    });
  });

  test("relative changes", () => {
    const c = current();
    const cmd = parseLocally("faster with more reverb", c);
    expect(cmd.set.tempo).toBe(c.settings.tempo + 15);
    expect(cmd.set.reverb).toBe(Math.round(c.mix.reverb * 100) + 20);
  });

  test("tracks and feedback", () => {
    expect(parseLocally("mute the drums", current()).actions).toEqual([
      { do: "mute", track: "drums" },
    ]);
    expect(parseLocally("new melody please", current()).actions).toEqual([
      { do: "reroll", track: "lead" },
    ]);
    expect(parseLocally("I love this part", current()).actions).toEqual([
      { do: "like" },
    ]);
    expect(parseLocally("this is boring", current()).actions).toEqual([
      { do: "dislike" },
    ]);
  });

  test("unknown text gets a helpful reply and no changes", () => {
    const cmd = parseLocally("what's the weather", current());
    expect(cmd.set).toEqual({});
    expect(cmd.actions).toEqual([]);
    expect(cmd.reply).toContain("Try");
  });
});
