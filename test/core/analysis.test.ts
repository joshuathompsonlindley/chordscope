import { describe, expect, it } from "vitest";
import { AMBIGUITY_MARGIN, BASS_WEIGHT, KRUMHANSL_MAJOR, KRUMHANSL_MINOR } from "@core/consts";
import { analyze, closeCalls, foldRepeats, isAmbiguous, mergeRepeatedHits, reportsMatch } from "@core/analyze";
import {
  bestMatch as best,
  isTonicChord,
  keyName,
  keyScalePitchClasses,
  pitchClassWeights,
  prefersFlats,
  rankKeys,
  rankKeysByChords,
  readInKey,
  resolvesTo,
  romanNumeral,
  scoreKeyByChords,
} from "@core/key";
import { segmentNotes } from "@core/segment";
import { chordEvent, describeChord, formatChord, identifyChord, isSlash, nameChord, stackingScore } from "@core/theory";
import { type ChordEvent, type ChordReport, type KeyCandidate } from "@core/types";
import { pearson } from "@core/utils/math";
import {
  LOOP_CHORDS,
  USER_CLIP,
  analyzeChords,
  bestMatch,
  chordsFromArguments,
  notesFromArguments,
  parseChordArgument,
  reportFor,
  parseMidi,
  readClip,
} from "@test/helpers";

const key = (tonicPc: number, minor: boolean): KeyCandidate => ({ tonicPitchClass: tonicPc, minor, score: 0 });
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const keyNames = (a: ReturnType<typeof analyze>, flats = false) => new Set(closeCalls(a).map((k) => keyName(k, flats)));
const rounded = (keys: readonly KeyCandidate[]) =>
  keys.map((k) => [k.tonicPitchClass, k.minor, Math.round(k.score * 1e9) / 1e9]);

describe("pitchClassWeights", () => {
  it("duration and bass emphasis", () => {
    const w = pitchClassWeights(
      [chordEvent(0, 2, [0, 4, 7], [48, 52, 55])],
      [{ pitchClass: 2, midi: 62, start: 2, duration: 0.5 }],
    );
    const extra = 2 * (BASS_WEIGHT - 1);
    expect(w[0]).toBe(2 + extra);
    expect(w[4]).toBe(2);
    expect(w[7]).toBe(2);
    expect(w[2]).toBe(0.5);
    expect(sum(w)).toBe(6 + extra + 0.5);
  });
  it("unknown bass gets no extra weight", () => {
    const w = pitchClassWeights([chordEvent(0, 1, [0, 4, 7])], []);
    expect([w[0], w[4], w[7]]).toEqual([1, 1, 1]);
  });
});

describe("pitch-profile key estimate", () => {
  it("pearson", () => {
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    expect(pearson([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1);
    expect(pearson([1, 1, 1], [1, 2, 3])).toBe(0);
    expect(() => pearson([1, 2], [1, 2, 3])).toThrow();
  });
  it("profile-shaped weights find their own key", () => {
    const majorG = Array.from({ length: 12 }, (_, pc) => KRUMHANSL_MAJOR[(pc - 7 + 12) % 12]);
    const minorD = Array.from({ length: 12 }, (_, pc) => KRUMHANSL_MINOR[(pc - 2 + 12) % 12]);
    expect(rankKeys(majorG)[0]).toMatchObject({ tonicPitchClass: 7, minor: false });
    expect(rankKeys(minorD)[0]).toMatchObject({ tonicPitchClass: 2, minor: true });
  });
  it("ranks all 24 keys best first", () => {
    const keys = rankKeys([1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1]);
    expect(keys).toHaveLength(24);
    expect(new Set(keys.map((k) => `${k.tonicPitchClass}:${k.minor}`)).size).toBe(24);
    const scores = keys.map((k) => k.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });
});

describe("chord-function key estimate", () => {
  it("resolvesTo", () => {
    const g7 = identifyChord([7, 11, 2, 5], 7)[0];
    const c = identifyChord([0, 4, 7], 0)[0];
    expect(resolvesTo(g7, c)).toBe(true);
    expect(resolvesTo(g7, identifyChord([9, 0, 4], 9)[0])).toBe(false);
    expect(resolvesTo(c, identifyChord([5, 9, 0], 5)[0])).toBe(false);
  });
  it("isTonicChord needs a matching quality", () => {
    const major = identifyChord([0, 4, 7], 0)[0];
    const minor = identifyChord([0, 3, 7], 0)[0];
    expect(isTonicChord(major, 0, false)).toBe(true);
    expect(isTonicChord(minor, 0, false)).toBe(false);
    expect(isTonicChord(minor, 0, true)).toBe(true);
    expect(isTonicChord(major, 0, true)).toBe(false);
    expect(isTonicChord(major, 7, false)).toBe(false);
  });
  it("plain progression finds its key", () => {
    const ranked = rankKeysByChords(["C3 E4 G4", "F3 A4 C5", "G2 B3 D4 F4", "C3 E4 G4"].map((t) => reportFor(t)));
    expect(ranked[0]).toMatchObject({ tonicPitchClass: 0, minor: false });
    expect(ranked[0].score - ranked[1].score).toBeGreaterThan(AMBIGUITY_MARGIN);
  });
  it("minor progression finds its key", () => {
    const ranked = rankKeysByChords(["A2 C4 E4", "D3 F4 A4", "E2 G#3 B3 D4", "A2 C4 E4"].map((t) => reportFor(t)));
    expect(ranked[0]).toMatchObject({ tonicPitchClass: 9, minor: true });
  });
  it("dominant resolution adds to the score", () => {
    const resolving = [reportFor("G2 B3 D4 F4"), reportFor("C3 E4 G4")];
    const not = [reportFor("G2 B3 D4 F4"), reportFor("A2 C4 E4")];
    expect(scoreKeyByChords(resolving, 0, false)).toBeGreaterThan(scoreKeyByChords(not, 0, false));
  });
  it("empty input scores zero", () => {
    expect(scoreKeyByChords([], 0, false)).toBe(0);
  });
  it("unidentified chords still count towards fit", () => {
    const cluster = reportFor("C3 C#3 D3 D#3");
    expect(best(cluster)).toBeNull();
    expect(scoreKeyByChords([cluster], 0, false)).toBeGreaterThan(0);
  });
});

describe("loop analysis (Em9, F#m7, B9)", () => {
  const result = analyzeChords(LOOP_CHORDS);
  const bests = result.chords.map((r) => best(r)!);

  it("names the chords", () => {
    expect(bests.map((m) => formatChord(m))).toEqual(["Em9", "F#m7", "B9(no5)"]);
  });
  it("on the chords alone is ambiguous between B minor and E minor, not E major", () => {
    const chordsOnly = rankKeysByChords(result.chords);
    const close = new Set(
      chordsOnly.filter((k) => chordsOnly[0].score - k.score <= AMBIGUITY_MARGIN).map((k) => keyName(k)),
    );
    expect(result.keyBasis).toBe("chord function");
    expect(close.has("B minor") && close.has("E minor")).toBe(true);
    expect(close.has("E major")).toBe(false);
  });
  it("with the notes counted too, F# minor leads clearly", () => {
    expect(result.keys[0]).toMatchObject({ tonicPitchClass: 6, minor: true });
    expect(isAmbiguous(result)).toBe(false);
  });
  it("roman numerals in both readings", () => {
    expect(bests.map((m) => romanNumeral(m, 4, true))).toEqual(["i9", "ii7", "V9"]);
    expect(bests.map((m) => romanNumeral(m, 11, true))).toEqual(["iv9", "v7", "I9"]);
    expect(readInKey(bests[2], key(11, true)).outside).toEqual([3]);
    expect(readInKey(bests[1], key(4, true)).outside).toEqual([1]);
  });
});

describe("notes-only analysis", () => {
  it("uses the pitch profile", () => {
    const notes = notesFromArguments(["C D E F G A B C G"]);
    const r = analyze([], notes);
    expect(r.keyBasis).toBe("pitch profile");
    expect(r.keys).toEqual(rankKeys(pitchClassWeights([], notes)));
    expect(r.keys[0]).toMatchObject({ tonicPitchClass: 0, minor: false });
    expect(r.chords).toEqual([]);
  });
  it("empty input throws", () => {
    expect(() => analyze([], [])).toThrow();
  });
});

describe("roman numerals", () => {
  it.each([
    ["C3 E4 G4", "I"],
    ["G2 B3 D4 F4", "V7"],
    ["A2 C4 E4", "vi"],
    ["B2 D4 F4", "vii°"],
    ["Bb2 D4 F4", "♭VII"],
    ["F2 A3 C4 E4", "IVmaj7"],
    ["B2 D4 F4 A4", "viiø7"],
    ["D2 F4 A4", "ii"],
    ["E2 G#3 B3", "III"],
  ])("C major: %s", (names, expected) => {
    expect(romanNumeral(bestMatch(names), 0, false)).toBe(expected);
  });
  it.each([
    ["A2 C4 E4", "i"],
    ["C3 E4 G4", "III"],
    ["F3 A4 C5", "VI"],
    ["G2 B3 D4", "VII"],
    ["E2 G#3 B3", "V"],
  ])("A minor: %s", (names, expected) => {
    expect(romanNumeral(bestMatch(names), 9, true)).toBe(expected);
  });
  it("outside tones", () => {
    const e = bestMatch("E2 G#3 B3");
    // G# is A minor's raised seventh, so it is not outside there; it is outside C major.
    expect(readInKey(e, key(9, true)).outside).toEqual([]);
    expect(readInKey(e, key(0, false)).outside).toEqual([8]);
    expect(readInKey(bestMatch("C3 E4 G4"), key(0, false)).outside).toEqual([]);
  });
  it("a minor key's dominant is wholly in key, leading tone included", () => {
    expect(readInKey(bestMatch("E2 G#3 B3 D4"), key(9, true)).outside).toEqual([]);
    expect(readInKey(bestMatch("G2 B3 D4"), key(0, true)).outside).toEqual([]);
  });
  it("other chromatic notes in a minor key are still outside", () => {
    expect(readInKey(bestMatch("D2 F#3 A3"), key(9, true)).outside).toEqual([6]);
    expect(readInKey(bestMatch("A2 C#3 E3"), key(9, true)).outside).toEqual([1]);
  });
  it("a major key has no raised seventh to allow", () => {
    expect(readInKey(bestMatch("F2 A3 C4 Eb4"), key(0, false)).outside).toEqual([3]);
  });
  it("numeral case comes from the key when the third is missing", () => {
    const eb = bestMatch("Eb2 Db4 F4");
    const gb = bestMatch("Gb2 Ab3 Db4 F4");
    const cases: [typeof eb, number, boolean, string][] = [
      [eb, 1, false, "ii9"],
      [eb, 10, true, "iv9"],
      [eb, 3, true, "i9"],
      [eb, 6, false, "vi9"],
      [eb, 0, false, "♭III9"],
      [gb, 1, false, "IVmaj9"],
      [gb, 10, true, "VImaj9"],
      [gb, 6, false, "Imaj9"],
    ];
    for (const [m, tonic, minor, expected] of cases) expect(romanNumeral(m, tonic, minor)).toBe(expected);
  });
  it("key scale pitch classes", () => {
    const cMajor = new Set([0, 2, 4, 5, 7, 9, 11]);
    expect(keyScalePitchClasses(0, false)).toEqual(cMajor);
    expect(keyScalePitchClasses(9, true)).toEqual(cMajor);
  });
  it("flat preference", () => {
    expect([key(5, false), key(2, true), key(10, false)].map(prefersFlats)).toEqual([true, true, true]);
    expect([key(4, true), key(7, false), key(6, true)].map(prefersFlats)).toEqual([false, false, false]);
  });
  it("key name", () => {
    expect(keyName(key(10, false), true)).toBe("Bb major");
    expect(keyName(key(10, true))).toBe("A# minor");
  });
});

describe("repeats", () => {
  it("foldRepeats on any items", () => {
    const eq = (a: number, b: number) => a === b;
    expect(foldRepeats([1, 2, 1, 2], eq)).toEqual([1, 2]);
    expect(foldRepeats([1, 2, 1, 2, 1, 2], eq)).toEqual([1, 2]);
    expect(foldRepeats([1, 1, 1], eq)).toEqual([1]);
    expect(foldRepeats([1, 2, 3], eq)).toEqual([1, 2, 3]);
    expect(foldRepeats([1, 2, 1, 4], (a, b) => a % 2 === b % 2)).toEqual([1, 2]);
  });
  it.each([[[1, 2, 3]], [[1, 2, 1]], [[1, 2, 1, 2, 1]], [[1, 2, 1, 3]], [[1]], [[]]])("%j does not tile", (seq) => {
    expect(foldRepeats(seq, (a, b) => a === b)).toEqual(seq);
  });
  it("reportsMatch by name, not notes", () => {
    const triad = reportFor("C3 E4 G4");
    expect(reportsMatch(triad, reportFor("C3 G3 E5"))).toBe(true);
    expect(reportsMatch(triad, reportFor("E3 G3 C4"))).toBe(false);
    expect(reportsMatch(triad, reportFor("C3 Eb4 G4"))).toBe(false);
    const short = reportFor("Bb3 Ab4 Db5 Eb5 F5");
    const full = reportFor("Bb3 Ab4 Db5 Eb5 F5 C6");
    expect(short.event.pitchClasses).not.toEqual(full.event.pitchClasses);
    expect(reportsMatch(short, full)).toBe(true);
  });
  it("unidentified chords match only on their notes", () => {
    const cluster = reportFor("C3 C#3 D3 D#3");
    expect(best(cluster)).toBeNull();
    expect(reportsMatch(cluster, reportFor("C3 C#4 D4 D#4"))).toBe(true);
    expect(reportsMatch(cluster, reportFor("C3 C#3 D3 E3"))).toBe(false);
    expect(reportsMatch(cluster, reportFor("C3 E4 G4"))).toBe(false);
  });
  it("a repeated clip analyses like one pass", () => {
    const events = USER_CLIP.map((t) => parseChordArgument(t));
    const once = analyze(events, []);
    const twice = analyze([...events, ...events], []);
    expect(twice.chords).toHaveLength(4);
    expect(twice.chords.map((r) => r.event)).toEqual(once.chords.map((r) => r.event));
    expect(pitchClassWeights([...events, ...events], [])).toEqual(pitchClassWeights(events, []).map((w) => 2 * w));
    expect(rounded(twice.keys)).toEqual(rounded(once.keys));
  });
});

describe("mergeRepeatedHits", () => {
  const STAB = ["E2 G3 B3 D4 F#4", "F#2 A3 C#4 E4", "B2 A3 C#4 D#4"];
  const COUNTS = [4, 8, 4];
  const stabLoop = (): ChordEvent[] => {
    const events: ChordEvent[] = [];
    STAB.forEach((text, i) => {
      for (let n = 0; n < COUNTS[i]; n++) events.push(parseChordArgument(text, events.length));
    });
    return events;
  };

  it("neighbouring hits merge", () => {
    const hits = [0, 1, 2].map((beat) => parseChordArgument("C3 E4 G4", beat));
    const merged = mergeRepeatedHits(hits);
    expect(merged).toHaveLength(1);
    expect([merged[0].start, merged[0].duration]).toEqual([0, 3]);
    expect(merged[0].pitchClasses).toEqual(hits[0].pitchClasses);
  });
  it("voicing and length do not matter but the bass does", () => {
    const first = parseChordArgument("C3 E4 G4");
    const merged = mergeRepeatedHits([first, parseChordArgument("C3 G3 E5*2", 1), parseChordArgument("E3 G3 C4", 3)]);
    expect(merged.map((c) => c.duration)).toEqual([3, 1]);
    expect(merged[0].midiNotes).toEqual(first.midiNotes);
  });
  it("only neighbours merge", () => {
    const a = parseChordArgument("C3 E4 G4");
    const b = parseChordArgument("F3 A4 C5");
    expect(mergeRepeatedHits([a, b, a])).toEqual([a, b, a]);
    expect(mergeRepeatedHits([])).toEqual([]);
  });
  it("stab loop reads as three chords", () => {
    const r = analyze(stabLoop(), []);
    expect(r.chords.map((c) => formatChord(best(c)!))).toEqual(["Em9", "F#m7", "B9(no5)"]);
    expect(r.chords.map((c) => c.event.duration)).toEqual([4, 8, 4]);
  });
  it("stab loop scores like the same loop with long chords", () => {
    const stabs = analyze(stabLoop(), []);
    const longEvents = chordsFromArguments(LOOP_CHORDS).map((c) => ({ ...c, start: 0 }));
    const long = analyze(longEvents, []);
    expect(rounded(stabs.keys)).toEqual(rounded(long.keys));
    expect(pitchClassWeights(stabLoop(), [])).toEqual(pitchClassWeights(longEvents, []).map((w) => 4 * w));
  });
  it("stab loop played twice still folds", () => {
    const r = analyze([...stabLoop(), ...stabLoop()], []);
    expect(r.chords).toHaveLength(3);
    expect(r.chords.map((c) => c.event.duration)).toEqual([4, 8, 4]);
  });
});

describe("Db major clip (Gb, Bbm7, Db, Eb played twice)", () => {
  const events = [...USER_CLIP, ...USER_CLIP].map((t) => parseChordArgument(t));
  const result = analyze(events, []);

  it("names every chord", () => {
    expect(result.chords.every((r) => best(r) !== null)).toBe(true);
  });
  it("on the chords alone the relative keys are close calls", () => {
    const chordsOnly = rankKeysByChords(result.chords);
    const close = new Set(
      chordsOnly.filter((k) => chordsOnly[0].score - k.score <= AMBIGUITY_MARGIN).map((k) => keyName(k, true)),
    );
    expect(close).toEqual(new Set(["Db major", "Bb minor", "Eb minor", "Gb major"]));
  });
  it("with the notes counted too, Db major wins outright", () => {
    expect(keyNames(result, true)).toEqual(new Set(["Db major"]));
  });
  it("pitch profile agrees on Db major and Bb minor", () => {
    expect(
      new Set(
        rankKeys(pitchClassWeights(events, []))
          .slice(0, 2)
          .map((k) => `${k.tonicPitchClass}:${k.minor}`),
      ),
    ).toEqual(new Set(["1:false", "10:true"]));
  });
  it("reads each chord in each key", () => {
    expect(result.chords).toHaveLength(4);
    const read = (k: KeyCandidate) => result.chords.map((r) => readInKey(best(r)!, k).numeral);
    expect(read(key(1, false))).toEqual(["IVmaj9", "vi7", "I", "ii9"]);
    expect(read(key(10, true))).toEqual(["VImaj9", "i7", "III", "iv9"]);
  });
});

describe("funk clip (real DAW export)", () => {
  const notes = parseMidi(readClip("funk.mid"));
  const { chords: hits, loose } = segmentNotes(notes);
  const reports = (events: ChordEvent[]): ChordReport[] =>
    events.map((event) => ({
      event,
      matches: identifyChord(event.pitchClasses, event.midiNotes.length ? event.midiNotes[0] % 12 : null),
    }));

  it("is read completely", () => {
    expect([notes.length, hits.length, loose.length]).toEqual([68, 16, 0]);
    expect(Math.max(...notes.map((n) => n.start + n.duration))).toBeCloseTo(15.625);
  });
  it("hits merge into the three chords", () => {
    const r = analyze(hits, []);
    expect(r.chords.map((c) => formatChord(best(c)!))).toEqual(["Em9", "F#m7", "B9(no5)"]);
  });
  it("has four close calls on the chords alone", () => {
    const chordsOnly = rankKeysByChords(analyze(hits, []).chords);
    const close = new Set(
      chordsOnly.filter((k) => chordsOnly[0].score - k.score <= AMBIGUITY_MARGIN).map((k) => keyName(k)),
    );
    expect(close).toEqual(new Set(["F# minor", "D major", "B minor", "E minor"]));
  });
  it("is F# minor outright once the notes are counted", () => {
    expect(keyNames(analyze(hits, []))).toEqual(new Set(["F# minor"]));
  });
  it("merging gives the dominant run its resolution credit", () => {
    const perHit = scoreKeyByChords(reports(hits), 4, true);
    const merged = scoreKeyByChords(reports(mergeRepeatedHits(hits)), 4, true);
    expect(perHit).toBeLessThan(merged);
  });
});

describe("prog clip (real DAW export)", () => {
  const notes = parseMidi(readClip("prog.mid"));
  const { chords, loose } = segmentNotes(notes);
  const result = analyze(chords, loose);

  it("is read completely", () => {
    expect([notes.length, chords.length, loose.length]).toEqual([50, 10, 0]);
    expect(Math.max(...notes.map((n) => n.start + n.duration))).toBeCloseTo(32);
  });
  it("names every chord and folds the repeat", () => {
    expect(result.chords.map((c) => formatChord(best(c)!, true))).toEqual([
      "Db6/9",
      "Eb6/9",
      "Bbm11",
      "Fm11(no5)",
      "Gbmaj9#11(no3)",
    ]);
    expect(result.chords).toHaveLength(5);
  });
  it("relative keys are the only close calls", () => {
    expect(keyNames(result, true)).toEqual(new Set(["Bb minor", "Db major"]));
  });
  it("reads chords in both close-call keys, flagging the out-of-key G", () => {
    const read = (k: KeyCandidate) => result.chords.map((r) => readInKey(best(r)!, k));
    expect(read(key(1, false)).map((r) => r.numeral)).toEqual(["I6/9", "II6/9", "vi11", "iii11", "IVmaj9♯11"]);
    expect(read(key(1, false)).map((r) => r.outside)).toEqual([[], [7], [], [], []]);
    expect(read(key(10, true)).map((r) => r.numeral)).toEqual(["III6/9", "IV6/9", "i11", "v11", "VImaj9♯11"]);
  });
});

describe("new templates", () => {
  it.each<[string, number[]]>([
    ["C9sus4", [0, 2, 5, 7, 10]],
    ["C13sus4", [0, 2, 5, 7, 9, 10]],
    ["C7b5", [0, 4, 6, 10]],
    ["C7#5", [0, 4, 8, 10]],
    ["C7#11", [0, 4, 6, 7, 10]],
    ["C7b13", [0, 4, 7, 8, 10]],
    ["Cm13", [0, 2, 3, 7, 9, 10]],
    ["Cm9b5", [0, 2, 3, 6, 10]],
    ["Cmaj13", [0, 2, 4, 7, 9, 11]],
    ["Cmaj7#5", [0, 4, 8, 11]],
  ])("%s", (expected, pcs) => {
    expect(formatChord(identifyChord(pcs, 0)[0])).toBe(expected);
  });
  it("add9 chords may leave out the fifth", () => {
    expect(formatChord(identifyChord([0, 2, 4], 0)[0])).toBe("Cadd9(no5)");
    expect(formatChord(identifyChord([0, 2, 3], 0)[0])).toBe("Cmadd9(no5)");
    expect(formatChord(identifyChord([0, 2, 4, 7], 0)[0])).toBe("Cadd9");
  });
  it.each([[[7, 11, 1, 5]], [[7, 11, 2, 5, 9]], [[7, 0, 2, 5, 9]]])("dominant %j resolves", (pcs) => {
    expect(resolvesTo(identifyChord(pcs, 7)[0], identifyChord([0, 4, 7], 0)[0])).toBe(true);
  });
});

describe("interval naming", () => {
  const described = (pcs: number[], bass: number | null = 0) => formatChord(describeChord(pcs, bass)!);

  it.each<[string, number[]]>([
    ["C7(b9,#9,#5)", [0, 1, 3, 4, 8, 10]],
    ["C7(b9,#9)", [0, 1, 3, 4, 7, 10]],
    ["CmMaj7(b5)", [0, 3, 6, 11]],
    ["C6/9(#11)", [0, 2, 4, 6, 7, 9]],
    ["C9(#11)", [0, 2, 4, 6, 7, 10]],
    ["Cm13(11,no5)", [0, 3, 5, 9, 10]],
    ["Cmaj7(b9)", [0, 1, 4, 7, 11]],
    ["C(b5)", [0, 4, 6]],
  ])("%s", (expected, pcs) => {
    expect(described(pcs)).toBe(expected);
  });
  it("diminished and augmented triads with added notes", () => {
    expect(described([0, 3, 6, 2])).toBe("Cdim(add9)");
    expect(described([0, 4, 8, 11, 2])).toBe("Cmaj9(#5)");
    expect(described([0, 4, 8, 5])).toBe("Caug(add4)");
  });
  it("interval names are marked approximate", () => {
    expect(describeChord([0, 1, 3, 4, 8, 10], 0)!.approximate).toBe(true);
    expect(identifyChord([0, 4, 7], 0)[0].approximate).toBe(false);
  });
  it.each([[[0, 1, 2, 3]], [[0, 1, 6]], [[0, 7]], [[0]], [[]]])("unstacked %j is not named", (pcs) => {
    expect(describeChord(pcs)).toBeNull();
  });
  it("rejects out-of-range input", () => {
    expect(() => describeChord([12, 4, 7])).toThrow();
    expect(() => describeChord([0, 4, 7], 12)).toThrow();
  });
  it("the root follows the bass when it stacks", () => {
    const m = describeChord([0, 1, 3, 4, 8, 10], 0)!;
    expect(m.rootPitchClass).toBe(0);
    expect(isSlash(m)).toBe(false);
  });
  it("without a bass the best-stacked root is chosen", () => {
    const present = new Set([0, 2, 4, 6, 7, 10]);
    expect(stackingScore(present, 0)).toBeGreaterThan(stackingScore(present, 4));
    expect(formatChord(describeChord(present, null)!)).toBe("C9(#11)");
  });
  it("a bass that does not stack gives a slash chord", () => {
    const m = describeChord([0, 4, 7, 9, 11, 2], 2)!;
    expect(isSlash(m) || m.rootPitchClass === 2).toBe(true);
    expect(m.bassPitchClass).toBe(2);
  });
  it("standard shapes win over interval names", () => {
    const standard = nameChord([0, 4, 7], 0);
    expect(standard[0].approximate).toBe(false);
    expect(nameChord([0, 1, 3, 4, 8, 10], 0).map((m) => m.approximate)).toEqual([true]);
    expect(nameChord([0, 1, 2, 3], 0)).toEqual([]);
  });
  it("roman numerals for interval names", () => {
    expect(romanNumeral(describeChord([0, 3, 5, 9, 10], 0)!, 0, true)).toBe("i13(11)");
    expect(romanNumeral(describeChord([0, 3, 6, 2], 0)!, 0, true)).toBe("i°(add9)");
  });
  it("altered dominants built from intervals resolve", () => {
    const altered = describeChord([7, 8, 10, 11, 3, 5], 7)!;
    expect(altered.approximate).toBe(true);
    expect(altered.template.dominant).toBe(true);
    expect(resolvesTo(altered, identifyChord([0, 4, 7], 0)[0])).toBe(true);
  });
  it("minor sevenths built from intervals are not dominant", () => {
    expect(describeChord([0, 3, 5, 9, 10], 0)!.template.dominant).toBe(false);
  });
  it("analysis names unusual chords", () => {
    const r = analyze(
      [chordEvent(0, 1, [0, 1, 3, 4, 8, 10], [36, 49, 51, 52, 56, 58]), parseChordArgument("F2 A3 C4", 1)],
      [],
    );
    const m = best(r.chords[0])!;
    expect(formatChord(m)).toBe("C7(b9,#9,#5)");
    expect(m.approximate).toBe(true);
  });
  it("repeats fold by interval name", () => {
    const pcs = [0, 1, 3, 4, 8, 10];
    const a: ChordReport = { event: chordEvent(0, 1, pcs, [36, 49, 51, 52, 56, 58]), matches: nameChord(pcs, 0) };
    const b: ChordReport = { event: chordEvent(1, 1, pcs, [48, 49, 51, 52, 56, 58]), matches: nameChord(pcs, 0) };
    expect(reportsMatch(a, b)).toBe(true);
  });
});
