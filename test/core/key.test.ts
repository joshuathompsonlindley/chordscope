import { describe, expect, it } from "vitest";
import { PROFILE_WEIGHT } from "@core/consts";
import {
  isTonicChord,
  keyChordPitchClasses,
  keyScalePitchClasses,
  prefersFlats,
  profileCorrelation,
  rankKeys,
  rankKeysByChords,
  resolvesTo,
} from "@core/key";
import { type ChordReport, type KeyCandidate } from "@core/types";
import { pearson } from "@core/utils/math";
import { bestMatch, reportFor } from "@test/helpers";

const candidate = (tonicPitchClass: number, minor: boolean): KeyCandidate => ({ tonicPitchClass, minor, score: 0 });

/** Every key once, as "tonic:minor" strings. */
const keyIds = (keys: readonly KeyCandidate[]) => keys.map((k) => `${k.tonicPitchClass}:${k.minor}`);

describe("rankKeys / rankKeysByChords", () => {
  const flat = new Array<number>(12).fill(1);
  const reports: ChordReport[] = [reportFor("C3 E3 G3", 0), reportFor("F3 A3 C4", 1), reportFor("G3 B3 D4", 2)];

  it("both rank all 24 distinct keys", () => {
    for (const ranked of [rankKeys([5, 0, 3, 0, 4, 2, 0, 5, 0, 3, 0, 1]), rankKeysByChords(reports)]) {
      expect(ranked).toHaveLength(24);
      expect(new Set(keyIds(ranked)).size).toBe(24);
    }
  });
  it("both sort best first", () => {
    for (const ranked of [rankKeys([5, 0, 3, 0, 4, 2, 0, 5, 0, 3, 0, 1]), rankKeysByChords(reports)]) {
      const scores = ranked.map((k) => k.score);
      expect(scores).toEqual([...scores].sort((a, b) => b - a));
    }
  });
  it("ties go to the lower tonic, then major before minor", () => {
    // Flat weights correlate with nothing, so every key scores 0.
    const ranked = rankKeys(flat);
    expect(new Set(ranked.map((k) => k.score))).toEqual(new Set([0]));
    expect(keyIds(ranked).slice(0, 4)).toEqual(["0:false", "0:true", "1:false", "1:true"]);
    expect(keyIds(ranked).at(-1)).toBe("11:true");
  });
  it("rotates the profile to each tonic", () => {
    const major = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
    // Shift the profile up two semitones: the best key moves from C major to D major.
    const shifted = major.map((_, pitchClass) => major[(pitchClass + 10) % 12]);

    expect(rankKeys(major)[0]).toMatchObject({ tonicPitchClass: 0, minor: false });
    expect(rankKeys(major)[0].score).toBeCloseTo(1);
    expect(rankKeys(shifted)[0]).toMatchObject({ tonicPitchClass: 2, minor: false });
  });
  it("chord ranking puts the home key first for I IV V", () => {
    expect(rankKeysByChords(reports)[0]).toMatchObject({ tonicPitchClass: 0, minor: false });
  });
  it("chord ranking scores 0 for every key when there are no chords", () => {
    expect(new Set(rankKeysByChords([]).map((k) => k.score))).toEqual(new Set([0]));
  });
});

describe("pearson", () => {
  it("is 1 for proportional series and -1 for opposed ones", () => {
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    expect(pearson([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1);
  });
  it("is 0 when a series is flat", () => {
    expect(pearson([1, 1, 1], [1, 2, 3])).toBe(0);
  });
  it("rejects series of different lengths", () => {
    expect(() => pearson([1, 2], [1])).toThrow("Series must be the same length");
  });
});

describe("resolvesTo / isTonicChord", () => {
  it("a dominant seventh resolves to the chord a fifth below", () => {
    expect(resolvesTo(bestMatch("G3 B3 D4 F4"), bestMatch("C3 E3 G3"))).toBe(true);
  });
  it("a dominant does not resolve to anything else", () => {
    expect(resolvesTo(bestMatch("G3 B3 D4 F4"), bestMatch("D3 F#3 A3"))).toBe(false);
  });
  it("a plain triad is not dominant", () => {
    expect(resolvesTo(bestMatch("G3 B3 D4"), bestMatch("C3 E3 G3"))).toBe(false);
  });
  it("a third-less voicing is not dominant", () => {
    expect(resolvesTo(bestMatch("G3 D4 F4"), bestMatch("C3 E3 G3"))).toBe(false);
  });
  it("tonic chords match root and mode, a thirdless voicing fits either", () => {
    expect(isTonicChord(bestMatch("C3 E3 G3"), 0, false)).toBe(true);
    expect(isTonicChord(bestMatch("C3 E3 G3"), 0, true)).toBe(false);
    expect(isTonicChord(bestMatch("A3 C4 E4"), 9, true)).toBe(true);
    expect(isTonicChord(bestMatch("C3 G3 B3"), 0, true)).toBe(true);
    expect(isTonicChord(bestMatch("D3 F#3 A3"), 0, false)).toBe(false);
  });
});

describe("keyScalePitchClasses / prefersFlats", () => {
  it("builds major and natural minor scales", () => {
    expect([...keyScalePitchClasses(0, false)].sort((a, b) => a - b)).toEqual([0, 2, 4, 5, 7, 9, 11]);
    expect([...keyScalePitchClasses(9, true)].sort((a, b) => a - b)).toEqual([0, 2, 4, 5, 7, 9, 11]);
    expect([...keyScalePitchClasses(2, true)].sort((a, b) => a - b)).toEqual([0, 2, 4, 5, 7, 9, 10]);
  });
  it("prefers flats for flat keys and their relatives", () => {
    expect([candidate(5, false), candidate(10, false), candidate(1, false)].map(prefersFlats)).toEqual([
      true,
      true,
      true,
    ]);
    expect([candidate(2, true), candidate(10, true)].map(prefersFlats)).toEqual([true, true]);
    expect([candidate(7, false), candidate(0, false), candidate(9, true)].map(prefersFlats)).toEqual([
      false,
      false,
      false,
    ]);
  });
});

describe("profileCorrelation", () => {
  const cMajorWeights = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];

  it("is 1 when the weights are the key's own profile", () => {
    expect(profileCorrelation(cMajorWeights, 0, false)).toBeCloseTo(1);
  });
  it("rotates the profile to the tonic", () => {
    const inD = cMajorWeights.map((_, pitchClass) => cMajorWeights[(pitchClass + 10) % 12]);

    expect(profileCorrelation(inD, 2, false)).toBeCloseTo(1);
    expect(profileCorrelation(inD, 0, false)).toBeLessThan(0.9);
  });
  it("is what rankKeys scores each key by", () => {
    const weights = [5, 0, 3, 0, 4, 2, 0, 5, 0, 3, 0, 1];

    for (const candidate of rankKeys(weights)) {
      expect(candidate.score).toBeCloseTo(profileCorrelation(weights, candidate.tonicPitchClass, candidate.minor));
    }
  });
});

describe("rankKeysByChords with the notes' weights", () => {
  const reports: ChordReport[] = [
    reportFor("A3 C4 E4", 0),
    reportFor("F3 A3 C4", 1),
    reportFor("C3 E3 G3", 2),
    reportFor("G3 B3 D4", 3),
  ];
  const cHeavy = [9, 0, 3, 0, 4, 3, 0, 6, 0, 3, 0, 2];
  const aHeavy = [3, 0, 2, 0, 4, 3, 0, 2, 0, 9, 0, 2];
  const score = (ranked: KeyCandidate[], tonic: number, minor: boolean) =>
    ranked.find((k) => k.tonicPitchClass === tonic && k.minor === minor)!.score;

  it("is the chord fit alone when no weights are given", () => {
    const ranked = rankKeysByChords(reports);

    expect(ranked).toHaveLength(24);
    expect(new Set(ranked.map((k) => `${k.tonicPitchClass}:${k.minor}`)).size).toBe(24);
  });
  it("adds the profile correlation, at PROFILE_WEIGHT, to each key's chord fit", () => {
    const fit = rankKeysByChords(reports);
    const combined = rankKeysByChords(reports, cHeavy);

    for (const key of combined) {
      expect(key.score).toBeCloseTo(
        score(fit, key.tonicPitchClass, key.minor) +
          PROFILE_WEIGHT * profileCorrelation(cHeavy, key.tonicPitchClass, key.minor),
      );
    }
  });
  it("breaks a tie between relative keys toward the one the notes dwell on", () => {
    const fit = rankKeysByChords(reports);

    // C major and A minor share every note, so their chord fits are within a hair of each other.
    expect(Math.abs(score(fit, 0, false) - score(fit, 9, true))).toBeLessThan(0.1);
    expect(rankKeysByChords(reports, cHeavy)[0]).toMatchObject({ tonicPitchClass: 0, minor: false });
    expect(rankKeysByChords(reports, aHeavy)[0]).toMatchObject({ tonicPitchClass: 9, minor: true });
  });
  it("leaves the order alone when every note weighs the same", () => {
    const flat = new Array<number>(12).fill(1);

    expect(rankKeysByChords(reports, flat).map((k) => [k.tonicPitchClass, k.minor])).toEqual(
      rankKeysByChords(reports).map((k) => [k.tonicPitchClass, k.minor]),
    );
  });
  it("only ever moves a score by at most PROFILE_WEIGHT", () => {
    const fit = rankKeysByChords(reports);

    for (const key of rankKeysByChords(reports, cHeavy)) {
      expect(Math.abs(key.score - score(fit, key.tonicPitchClass, key.minor))).toBeLessThanOrEqual(
        PROFILE_WEIGHT + 1e-9,
      );
    }
  });
});

describe("keyChordPitchClasses", () => {
  const sorted = (set: Set<number>) => [...set].sort((a, b) => a - b);

  it("is the major scale for a major key", () => {
    expect(sorted(keyChordPitchClasses(0, false))).toEqual([0, 2, 4, 5, 7, 9, 11]);
  });
  it("is the natural minor scale plus the raised seventh for a minor key", () => {
    expect(sorted(keyChordPitchClasses(9, true))).toEqual([0, 2, 4, 5, 7, 8, 9, 11]);
    expect(sorted(keyChordPitchClasses(0, true))).toEqual([0, 2, 3, 5, 7, 8, 10, 11]);
  });
  it("does not change the plain scale, which numerals use for case", () => {
    expect(sorted(keyScalePitchClasses(9, true))).toEqual([0, 2, 4, 5, 7, 9, 11]);
  });
  it("is a fresh set each time", () => {
    const first = keyChordPitchClasses(0, true);

    first.add(1);
    expect(keyChordPitchClasses(0, true).has(1)).toBe(false);
  });
});
