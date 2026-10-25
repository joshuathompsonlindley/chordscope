import { describe, expect, it } from "vitest";
import { analyze } from "@core/analyze";
import { analyseMidi } from "@core/pipeline";
import { type Analysis } from "@core/types";
import { MAX_CLOSE_CALL_KEYS, keyCardModel, keyShares, keyTip, shownKeys } from "@ui/utils/keys";
import { analyzeChords, readClip } from "@test/helpers";

/** A real clip whose key is a close call: A# minor and its relative C# major fit almost equally. */
const closeCallAnalysis = (): Analysis => analyseMidi(readClip("prog.mid").buffer as ArrayBuffer).analysis;

describe("key card", () => {
  const loop: Analysis = analyzeChords(["C3 E3 G3", "F3 A3 C4", "G3 B3 D4", "C3 E3 G3"]);
  const ambiguous: Analysis = closeCallAnalysis();

  it("shows only the leading key when it is clear", () => {
    const model = keyCardModel(loop, false);

    expect(model.label).toBe("Key, from the chords");
    expect(model.keys.map((key) => key.name)).toEqual(["C major"]);
    expect(model.note).toBeNull();
  });
  it("lists every close call, best first, with a warning, when the music does not settle it", () => {
    const model = keyCardModel(ambiguous, false);

    expect(model.label).toBe("Close call, from the chords");
    expect(model.keys.length).toBeGreaterThan(1);
    expect(model.keys.map((key) => key.name)).toEqual(["A# minor", "C# major"]);
    expect(model.note).toBe("The music alone does not settle which note is home.");
  });
  it("caps close calls", () => {
    expect(shownKeys(loop).length).toBeLessThanOrEqual(MAX_CLOSE_CALL_KEYS);
  });
  it("says 'from the notes alone' when there are no chords", () => {
    const notesOnly: Analysis = analyze(
      [],
      [60, 62, 64, 65, 67, 69, 71, 72].map((midi, index) => ({
        pitchClass: midi % 12,
        midi,
        start: index,
        duration: 1,
      })),
    );

    expect(keyCardModel(notesOnly, false).label).toMatch(/from the notes alone$/);
  });
  it("spells keys with flats on request", () => {
    const flat: Analysis = analyzeChords(["Db3 F3 Ab3", "Gb3 Bb3 Db4", "Ab3 C4 Eb4", "Db3 F3 Ab3"]);

    expect(keyCardModel(flat, true).keys.map((key) => key.name)).toEqual(["Db major"]);
    expect(keyCardModel(flat, false).keys.map((key) => key.name)).toEqual(["C# major"]);
  });
  it("gives every key a hover tip", () => {
    expect(keyCardModel(loop, false).keys.every((key) => key.tip.length > 0)).toBe(true);
    expect(keyCardModel(ambiguous, false).keys.every((key) => key.tip.includes("confidence ·"))).toBe(true);
  });
});

describe("keyShares", () => {
  /** An analysis with just the ranking that `keyShares` reads. */
  const ranked = (...scores: number[]): Analysis =>
    ({ keys: scores.map((score, index) => ({ tonicPitchClass: index, minor: false, score })) }) as unknown as Analysis;

  it("adds up to one", () => {
    const shares = keyShares(ranked(1.0, 0.9, 0.7, 0.5));

    expect(shares.reduce((sum, share) => sum + share, 0)).toBeCloseTo(1);
  });
  it("gives tied keys equal shares", () => {
    const shares = keyShares(ranked(1, 1, 1, 1));

    expect(shares).toEqual([0.25, 0.25, 0.25, 0.25]);
  });
  it("gives a lone key all of it", () => {
    expect(keyShares(ranked(0.8))).toEqual([1]);
  });
  it("falls as the score falls", () => {
    const shares = keyShares(ranked(1.0, 0.95, 0.9, 0.5));

    expect(shares[0]).toBeGreaterThan(shares[1]);
    expect(shares[1]).toBeGreaterThan(shares[2]);
    expect(shares[2]).toBeGreaterThan(shares[3]);
  });
  it("takes one close-call margin of score as a drop to about a third", () => {
    const [first, second] = keyShares(ranked(1.0, 0.95));

    expect(second / first).toBeCloseTo(Math.exp(-1));
  });
  it("is unmoved by adding the same amount to every score, so only the gaps count", () => {
    const low = keyShares(ranked(0.5, 0.45, 0.3));
    const high = keyShares(ranked(1.5, 1.45, 1.3));

    low.forEach((share, index) => expect(share).toBeCloseTo(high[index]));
  });
  it("copes with scores that are all negative", () => {
    expect(keyShares(ranked(-0.1, -0.5)).reduce((sum, share) => sum + share, 0)).toBeCloseTo(1);
  });
  it("shares sum to one on a real analysis of 24 keys", () => {
    const real = analyzeChords(["C3 E3 G3", "F3 A3 C4", "G3 B3 D4", "C3 E3 G3"]);
    const shares = keyShares(real);

    expect(shares).toHaveLength(24);
    expect(shares.reduce((sum, share) => sum + share, 0)).toBeCloseTo(1);
  });
});

describe("keyTip", () => {
  const ranked = (...scores: number[]): Analysis =>
    ({
      keys: scores.map((score, index) => ({ tonicPitchClass: index === 0 ? 0 : index * 2, minor: index === 1, score })),
    }) as unknown as Analysis;

  it("is high confidence when the leader holds most of the likelihood", () => {
    expect(keyTip(ranked(1.0, 0.7, 0.6), 0, false)).toBe("High confidence · 100%\nnext closest D minor 0%");
  });
  it("is medium confidence for a fair lead", () => {
    expect(keyTip(ranked(1.0, 0.97, 0.97, 0.9), 0, false)).toMatch(/^Medium confidence · 45%/);
  });
  it("is low confidence for a toss-up", () => {
    expect(keyTip(ranked(1.0, 1.0, 1.0), 0, false)).toMatch(/^Low confidence · 33%/);
  });
  it("puts the share cut-offs at 60% and 35%", () => {
    // Two keys a margin-multiple apart give a leader share of 1 / (1 + e^-d).
    expect(keyTip(ranked(1.0, 0.95), 0, false)).toMatch(/^High confidence · 73%/);
    expect(keyTip(ranked(1.0, 1.0), 0, false)).toMatch(/^Medium confidence · 50%/);
    expect(keyTip(ranked(1.0, 1.0, 1.0), 0, false)).toMatch(/^Low confidence · 33%/);
  });
  it("tips a runner-up with its own share and the leader's", () => {
    expect(keyTip(ranked(1.0, 0.95), 1, false)).toBe("Low confidence · 27%\nleader C major 73%");
  });
  it("spells names with flats on request", () => {
    const flats = {
      keys: [
        { tonicPitchClass: 1, minor: false, score: 0.9 },
        { tonicPitchClass: 3, minor: false, score: 0.5 },
      ],
    } as unknown as Analysis;

    expect(keyTip(flats, 0, true)).toContain("next closest Eb major");
    expect(keyTip(flats, 0, false)).toContain("next closest D# major");
  });
  it("works on a real analysis", () => {
    const real = analyzeChords(["C3 E3 G3", "F3 A3 C4", "G3 B3 D4", "C3 E3 G3"]);

    expect(keyTip(real, 0, false)).toMatch(/^(High|Medium|Low) confidence · \d+%\nnext closest .+ \d+%$/);
  });
  it("is not low for every real clip: the samples reach the upper levels", async () => {
    const { readFileSync } = await import("node:fs");
    const level = (sample: string) => {
      const bytes = readFileSync(`test/clips/${sample}`);
      const { analysis } = analyseMidi(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      );

      return keyTip(analysis, 0, false).split(" ")[0];
    };

    expect([level("waltz.mid"), level("funk.mid")]).toEqual(["High", "Medium"]);
  });
});
