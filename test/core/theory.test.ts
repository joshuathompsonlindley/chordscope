import { describe, expect, it } from "vitest";
import { FIFTH_INTERVAL } from "@core/consts";
import { isTonicChord, resolvesTo } from "@core/key";
import {
  CHORD_TEMPLATES,
  bassPitchClass,
  chordEvent,
  formatChord,
  identifyChord,
  intervalTemplate,
  isSlash,
  joinChords,
  midiNoteName,
  numeralFromSymbol,
  pitchClassName,
  sameHarmony,
} from "@core/theory";
import { parseNote } from "@test/notes";
import { LOOP_CHORDS, USER_CLIP, bestMatch, notesFromArguments, parseChordArgument, reportFor } from "@test/helpers";

const fmt = (pcs: number[], bass: number | null, flats = false) => formatChord(identifyChord(pcs, bass)[0], flats);

describe("parseNote", () => {
  it.each([
    ["C4", 0, 60],
    ["F#4", 6, 66],
    ["Bb3", 10, 58],
    ["Cb4", 11, 59],
    ["B#3", 0, 60],
    ["F##3", 7, 55],
    ["E♭4", 3, 63],
    ["bb4", 10, 70],
    ["E", 4, null],
    ["f#", 6, null],
  ])("%s", (text, pc, midi) => {
    expect(parseNote(text)).toEqual({ pitchClass: pc, midi });
  });
  it.each(["H4", "", "4", "C#x", "C-2", "G10"])("rejects %j", (text) => {
    expect(() => parseNote(text)).toThrow();
  });
});

describe("naming", () => {
  it("pitch class names", () => {
    expect(pitchClassName(10)).toBe("A#");
    expect(pitchClassName(10, true)).toBe("Bb");
    expect(pitchClassName(14)).toBe("D");
  });
  it("midi note names", () => {
    expect(midiNoteName(60)).toBe("C4");
    expect(midiNoteName(66)).toBe("F#4");
    expect(midiNoteName(70, true)).toBe("Bb4");
    expect(midiNoteName(0)).toBe("C-1");
  });
});

describe("identifyChord", () => {
  it("names the loop chords", () => {
    expect(formatChord(bestMatch(LOOP_CHORDS[0]))).toBe("Em9");
    expect(formatChord(bestMatch(LOOP_CHORDS[1]))).toBe("F#m7");
    expect(formatChord(bestMatch(LOOP_CHORDS[2]))).toBe("B9(no5)");
  });
  it("records the missing fifth", () => {
    expect([...bestMatch(LOOP_CHORDS[2]).omitted]).toEqual([FIFTH_INTERVAL]);
    expect(bestMatch(LOOP_CHORDS[0]).omitted.size).toBe(0);
  });
  it("bass picks between equivalent chords", () => {
    const pcs = [6, 9, 1, 4];
    const f = identifyChord(pcs, 6);
    expect(formatChord(f[0])).toBe("F#m7");
    expect(f.map((m) => formatChord(m))).toContain("A6/F#");
    expect(formatChord(identifyChord(pcs, 9)[0])).toBe("A6");
  });
  it("offers both readings without a bass", () => {
    expect(new Set(identifyChord([6, 9, 1, 4]).map((m) => formatChord(m)))).toEqual(new Set(["F#m7", "A6"]));
  });
  it("writes inversions as slash chords", () => {
    expect(fmt([0, 4, 7], 4)).toBe("C/E");
  });
  it.each<[string, number[]]>([
    ["C", [0, 4, 7]],
    ["Cm", [0, 3, 7]],
    ["Cdim", [0, 3, 6]],
    ["Caug", [0, 4, 8]],
    ["Csus2", [0, 2, 7]],
    ["Csus4", [0, 5, 7]],
    ["C5", [0, 7]],
    ["C6", [0, 4, 7, 9]],
    ["C7", [0, 4, 7, 10]],
    ["Cmaj7", [0, 4, 7, 11]],
    ["Cm7", [0, 3, 7, 10]],
    ["CmMaj7", [0, 3, 7, 11]],
    ["Cm7b5", [0, 3, 6, 10]],
    ["Cdim7", [0, 3, 6, 9]],
    ["Cadd9", [0, 2, 4, 7]],
    ["Cmaj9", [0, 2, 4, 7, 11]],
    ["C7b9", [0, 1, 4, 7, 10]],
    ["C7#9", [0, 3, 4, 7, 10]],
    ["Cadd4", [0, 4, 5, 7]],
    ["Cmadd4", [0, 3, 5, 7]],
    ["C6/9", [0, 2, 4, 7, 9]],
    ["Cm6/9", [0, 2, 3, 7, 9]],
    ["Cm11", [0, 2, 3, 5, 7, 10]],
    ["Cmaj7#11", [0, 4, 6, 7, 11]],
    ["Cmaj9#11", [0, 2, 4, 6, 7, 11]],
    ["C13", [0, 2, 4, 7, 9, 10]],
  ])("common quality %s", (expected, pcs) => {
    expect(fmt(pcs, 0)).toBe(expected);
  });
  it("flat spelling", () => {
    const m = identifyChord([3, 6, 9, 0], 3)[0];
    expect(formatChord(m)).toBe("D#dim7");
    expect(formatChord(m, true)).toBe("Ebdim7");
  });
  it.each<[string, number[]]>([
    ["C7(no3)", [0, 7, 10]],
    ["Cmaj7(no3)", [0, 7, 11]],
    ["C9(no3)", [0, 2, 7, 10]],
    ["C9(no3,no5)", [0, 2, 10]],
    ["Cmaj9(no3)", [0, 2, 7, 11]],
    ["Cmaj9(no3,no5)", [0, 2, 11]],
    ["Cmaj9#11(no3)", [0, 2, 6, 7, 11]],
  ])("open voicing %s", (expected, pcs) => {
    const m = identifyChord(pcs, 0)[0];
    expect(formatChord(m)).toBe(expected);
    expect(m.template.thirdOmitted).toBe(true);
  });
  it("names the Db major clip", () => {
    expect(USER_CLIP.map((t) => formatChord(bestMatch(t), true))).toEqual([
      "Gbmaj9(no3)",
      "Bbm7",
      "Db",
      "Eb9(no3,no5)",
    ]);
    expect(reportFor(USER_CLIP[0]).matches.map((m) => formatChord(m, true))).toContain("Dbadd4/Gb");
  });
  it.each<[string, number[]]>([
    ["C13(no5)", [0, 4, 9, 10]],
    ["Cm11(no5)", [0, 3, 5, 10]],
    ["C6/9(no5)", [0, 2, 4, 9]],
    ["Cm11", [0, 3, 5, 7, 10]],
  ])("extended chord %s", (expected, pcs) => {
    expect(fmt(pcs, 0)).toBe(expected);
  });
  it("13th chords are dominants", () => {
    const c13 = bestMatch("C3 E4 A4 Bb4");
    expect(formatChord(c13)).toBe("C13(no5)");
    expect(resolvesTo(c13, identifyChord([5, 9, 0], 5)[0])).toBe(true);
  });
  it("names the prog clip chords", () => {
    const voicings = [
      "Db4 Ab4 Eb5 F5 Bb5",
      "Eb4 Bb4 C5 F5 G5",
      "Bb3 Ab4 Db5 Eb5 F5",
      "F3 Ab4 Eb5 Bb5",
      "Gb3 Db4 Ab4 F5 C6",
    ];
    expect(voicings.map((t) => formatChord(bestMatch(t), true))).toEqual([
      "Db6/9",
      "Eb6/9",
      "Bbm11",
      "Fm11(no5)",
      "Gbmaj9#11(no3)",
    ]);
    expect(reportFor(voicings[2]).matches.map((m) => formatChord(m, true))).toContain("Db6/9/Bb");
  });
  it("third-less voicings are not dominants", () => {
    const g7 = bestMatch("G2 D3 F3");
    const c = identifyChord([0, 4, 7], 0)[0];
    expect(formatChord(g7)).toBe("G7(no3)");
    expect(resolvesTo(g7, c)).toBe(false);
    expect(resolvesTo(bestMatch("G2 B3 D4 F4"), c)).toBe(true);
  });
  it("third-less voicings can be tonic in either mode", () => {
    const eb = bestMatch("Eb2 Db4 F4");
    expect(isTonicChord(eb, 3, true)).toBe(true);
    expect(isTonicChord(eb, 3, false)).toBe(true);
    expect(isTonicChord(eb, 1, false)).toBe(false);
  });
  it.each([[[0, 1, 2, 3]], [[0]], [[0, 4]], [[]]])("unrecognised %j", (pcs) => {
    expect(identifyChord(pcs)).toEqual([]);
  });
  it("rejects out-of-range input", () => {
    expect(() => identifyChord([12, 4, 7])).toThrow();
    expect(() => identifyChord([0, 4, 7], 12)).toThrow();
  });
  it("slash property", () => {
    expect(isSlash(identifyChord([0, 4, 7], 0)[0])).toBe(false);
    expect(isSlash(identifyChord([0, 4, 7])[0])).toBe(false);
    expect(isSlash(identifyChord([0, 4, 7], 7)[0])).toBe(true);
  });
});

describe("chord input helpers", () => {
  it("parses octaves, bass and default length", () => {
    const c = parseChordArgument("E2 G3 B3");
    expect(c.pitchClasses).toEqual([4, 7, 11]);
    expect(c.midiNotes).toEqual([40, 55, 59]);
    expect(bassPitchClass(c)).toBe(4);
    expect(c.duration).toBe(1);
  });
  it("length multiplier", () => {
    expect(parseChordArgument("F#2 A3 C#4 E4*2").duration).toBe(2);
    expect(parseChordArgument("F#2 A3 C#4 E4*0.5").duration).toBe(0.5);
  });
  it("other separators", () => {
    const expected = parseChordArgument("E2 G3 B3");
    expect(parseChordArgument("E2/G3/B3")).toEqual(expected);
    expect(parseChordArgument("E2, G3, B3")).toEqual(expected);
  });
  it("no octave means no bass", () => {
    expect(bassPitchClass(parseChordArgument("E G B"))).toBeNull();
    expect(bassPitchClass(parseChordArgument("E2 G B3"))).toBeNull();
  });
  it("start is recorded", () => {
    expect(parseChordArgument("E2 G3 B3", 4).start).toBe(4);
  });
  it.each(["", "H2 G3", "E2 G3*x", "E2 G3*0", "E2 G3*-1"])("rejects %j", (t) => {
    expect(() => parseChordArgument(t)).toThrow();
  });
  it("notes from arguments", () => {
    const notes = notesFromArguments(["E, G, B", "D F#"]);
    expect(notes.map((n) => n.pitchClass)).toEqual([4, 7, 11, 2, 6]);
    expect(notes.every((n) => n.duration === 1)).toBe(true);
    expect(() => notesFromArguments(["E", "H"])).toThrow();
  });
});

describe("numeralFromSymbol", () => {
  it.each([
    ["", false, ""],
    ["m", true, ""],
    ["7", false, "7"],
    ["m7", true, "7"],
    ["maj7", false, "maj7"],
    ["mMaj7", true, "maj7"],
    ["m7b5", true, "ø7"],
    ["m9b5", true, "ø9"],
    ["7b5", false, "7b5"],
    ["dim", true, "°"],
    ["dim7", true, "°7"],
    ["aug", false, "+"],
    ["madd9", true, "add9"],
    ["m6/9", true, "6/9"],
    ["maj9#11", false, "maj9#11"],
    ["m7(b9)", true, "7(b9)"],
  ])("%j (minor=%s) -> %j", (symbol, minorLike, expected) => {
    expect(numeralFromSymbol(symbol, minorLike)).toBe(expected);
  });
});

describe("CHORD_TEMPLATES", () => {
  it("require exactly the intervals that are not optional", () => {
    for (const t of CHORD_TEMPLATES) {
      expect(new Set(t.required)).toEqual(new Set([...t.intervals].filter((i) => !t.optional.has(i))));
      expect(t.optional.size === 0 || [...t.optional].every((i) => t.intervals.has(i))).toBe(true);
    }
  });
  it("mark exactly the listed symbols as dominant", () => {
    const dominant = new Set(CHORD_TEMPLATES.filter((t) => t.dominant).map((t) => t.symbol));
    expect(dominant).toEqual(
      new Set(["7", "9", "7b9", "7#9", "7sus4", "13", "7b5", "7#5", "7#11", "7b13", "9sus4", "13sus4"]),
    );
  });
  it("derive their numeral suffix, with typographic accidentals", () => {
    const numeral = (symbol: string, thirdOmitted = false) =>
      CHORD_TEMPLATES.find((t) => t.symbol === symbol && t.thirdOmitted === thirdOmitted)!.numeralSuffix;
    expect(["dim", "aug", "m7b5", "7b9", "7#9", "7b5", "maj7#11", "mMaj7", "m11"].map((s) => numeral(s))).toEqual([
      "°",
      "+",
      "ø7",
      "7♭9",
      "7♯9",
      "7♭5",
      "maj7♯11",
      "maj7",
      "11",
    ]);
    expect(numeral("maj9#11", true)).toBe("maj9♯11");
  });
  it("carry no ASCII flat or sharp in a numeral", () => {
    expect(CHORD_TEMPLATES.filter((t) => /[b#]/.test(t.numeralSuffix))).toEqual([]);
  });
});

describe("sameHarmony / joinChords", () => {
  const triad = (start: number, duration: number, bass: number) =>
    chordEvent(start, duration, [0, 4, 7], [bass, 64, 67]);

  it("sameHarmony compares pitch classes and bass, not timing", () => {
    expect(sameHarmony(triad(0, 1, 48), triad(5, 3, 60))).toBe(true);
    expect(sameHarmony(triad(0, 1, 48), triad(0, 1, 52))).toBe(false);
    expect(sameHarmony(chordEvent(0, 1, [0, 4, 7]), chordEvent(1, 1, [0, 4, 9]))).toBe(false);
  });
  it("sameHarmony treats unknown bass as equal only to unknown bass", () => {
    expect(sameHarmony(chordEvent(0, 1, [0, 4, 7]), chordEvent(1, 1, [0, 4, 7]))).toBe(true);
    expect(sameHarmony(chordEvent(0, 1, [0, 4, 7]), triad(0, 1, 48))).toBe(false);
  });
  it("joinChords keeps the earlier voicing and start, and adds the durations", () => {
    const joined = joinChords(triad(2, 1.5, 48), triad(3.5, 2, 55));
    expect(joined).toEqual(chordEvent(2, 3.5, [0, 4, 7], [48, 64, 67]));
  });
});

describe("intervalTemplate", () => {
  const symbolOf = (...intervals: number[]) => intervalTemplate(new Set(intervals))?.symbol;

  it("rejects what is not a stack of thirds", () => {
    expect(intervalTemplate(new Set([0, 5, 7]))).toBeNull();
    expect(intervalTemplate(new Set([0, 3, 5]))).toBeNull();
    expect(intervalTemplate(new Set([0, 4]))).toBeNull();
  });
  it("names a major third with a minor seventh as a dominant", () => {
    const template = intervalTemplate(new Set([0, 4, 7, 10, 1]))!;
    expect(template).toMatchObject({ symbol: "7(b9)", dominant: true, minorLike: false, thirdOmitted: false });
    expect(template.numeralSuffix).toBe("7(b9)");
  });
  it("prefixes minor qualities and marks the minor-major seventh", () => {
    expect([symbolOf(0, 3, 7, 10, 1), symbolOf(0, 3, 7, 11, 5)]).toEqual(["m7(b9)", "mMaj7(11)"]);
    expect(intervalTemplate(new Set([0, 3, 7, 11, 5]))!.numeralSuffix).toBe("maj7(11)");
  });
  it("calls a minor third with a flat fifth and no seventh dim, and drops the duplicate b5", () => {
    expect(symbolOf(0, 3, 6, 5)).toBe("dim(add4)");
    expect(intervalTemplate(new Set([0, 3, 6, 5]))!.numeralSuffix).toBe("°(add4)");
  });
  it("calls a major third with a sharp fifth and no fifth aug, and drops the duplicate #5", () => {
    expect(symbolOf(0, 4, 8, 5)).toBe("aug(add4)");
  });
  it("lists tensions in interval order, then label order", () => {
    expect(symbolOf(0, 4, 7, 10, 1, 3, 5)).toBe("7(b9,#9,11)");
  });
  it("reads a sixth and ninth without a seventh as 6/9", () => {
    expect(symbolOf(0, 4, 7, 9, 2, 6)).toBe("6/9(#11)");
  });
  it("reads a sixth with a seventh as a 13th", () => {
    expect(symbolOf(0, 4, 7, 9, 10, 8)).toBe("13(b13)");
    expect(symbolOf(0, 4, 7, 9, 11, 8)).toBe("maj13(b13)");
  });
  it("tells a diminished seventh from a minor sixth", () => {
    expect(symbolOf(0, 3, 6, 9, 1)).toBe("dim7(b9)");
    expect(symbolOf(0, 3, 7, 9, 10, 1)).toBe("m13(b9)");
  });
  it("lists both sevenths as b7 tension", () => {
    expect(symbolOf(0, 4, 7, 10, 11)).toBe("maj7(b7)");
  });
  it("adds an unwritten fifth as an optional tone", () => {
    const template = intervalTemplate(new Set([0, 4, 10, 1]))!;
    expect(template.optional).toEqual(new Set([7]));
    expect(template.intervals.has(7)).toBe(true);
    expect([...template.required].sort((a, b) => a - b)).toEqual([0, 1, 4, 10]);
  });
  it("keeps a sounding fifth required", () => {
    const template = intervalTemplate(new Set([0, 4, 7, 10, 1]))!;
    expect(template.optional.size).toBe(0);
    expect([...template.required].sort((a, b) => a - b)).toEqual([0, 1, 4, 7, 10]);
  });
});
