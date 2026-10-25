import { describe, expect, it } from "vitest";
import { analyze, closeCalls } from "@core/analyze";
import { keyName } from "@core/key";
import {
  chordFromNotes,
  detectChords,
  indexNotes,
  indexedNotesInWindow,
  isChordal,
  movesByStep,
  recoverHeldChanges,
  segmentNotes,
  segmentWindows,
  timelineCoverage,
} from "@core/segment";
import { bassPitchClass, chordEvent, formatChord, nameChord } from "@core/theory";
import { type ChordEvent, type NoteEvent } from "@core/types";
import { buildFile, buildTrack, noteOff, noteOn, parseMidi } from "@test/helpers";

const note = (midi: number, start: number, duration = 1): NoteEvent => ({
  pitchClass: midi % 12,
  midi,
  start,
  duration,
});
const arpeggio = (pitches: number[], start: number, step = 0.5, duration = step): NoteEvent[] =>
  pitches.map((p, i) => note(p, start + i * step, duration));
const names = (chords: ChordEvent[]) => chords.map((c) => formatChord(nameChord(c.pitchClasses, bassPitchClass(c))[0]));
const midis = (notes: NoteEvent[]) => notes.map((n) => n.midi);
const span = (chords: ChordEvent[]) => chords.map((c) => [c.start, c.duration]);

/** The notes belonging to a window, from a plain list. */
const windowNotes = (notes: NoteEvent[], begin: number, end: number): NoteEvent[] =>
  indexedNotesInWindow(indexNotes(notes), begin, end);

describe("window helpers", () => {
  it("notes starting in the window belong to it; the end is exclusive", () => {
    const notes = [note(60, 0, 0.05), note(62, 1), note(64, 0.99)];
    expect(midis(windowNotes(notes, 0, 1))).toEqual([60, 64]);
  });
  it("held notes belong to later windows", () => {
    const held = note(60, 0, 8);
    expect(windowNotes([held], 4, 8)).toEqual([held]);
  });
  it("a note released a hair late does not leak", () => {
    expect(windowNotes([note(60, 0, 4.05)], 4, 8)).toEqual([]);
    expect(windowNotes([note(60, 0, 4.2)], 4, 8)[0].midi).toBe(60);
  });
  it("chordFromNotes keeps the bass only when every note has an octave", () => {
    const known = chordFromNotes(0, 2, [note(55, 0), note(48, 0), note(52, 0)]);
    expect([known.midiNotes, known.pitchClasses]).toEqual([
      [48, 52, 55],
      [0, 4, 7],
    ]);
    expect(chordFromNotes(0, 2, [{ pitchClass: 0, midi: null, start: 0, duration: 1 }, note(52, 0)]).midiNotes).toEqual(
      [],
    );
  });
  it("timeline coverage", () => {
    const notes = [note(60, 0, 4), note(72, 4, 4)];
    const chord = chordEvent(0, 4, [0, 4, 7]);
    expect(timelineCoverage([], notes)).toBe(0);
    expect(timelineCoverage([chord], [])).toBe(0);
    expect(timelineCoverage([chord, chordEvent(2, 2, [0, 4, 7])], notes)).toBeCloseTo(0.5);
    expect(timelineCoverage([chord, chordEvent(4, 8, [0, 4, 7])], notes)).toBeCloseTo(1);
  });
  it("a zero-length clip has no coverage", () => {
    expect(timelineCoverage([chordEvent(0, 0, [0, 4, 7])], [note(60, 0, 0)])).toBe(0);
  });
});

describe("isChordal", () => {
  it.each([[[0, 4, 7]], [[0, 4, 7, 11]], [[0, 2, 3, 7, 10]]])("full chord %j", (pcs) => {
    expect(isChordal(pcs, 0)).toBe(true);
  });
  it("a seventh chord may lack its fifth", () => {
    expect(isChordal([0, 4, 11], 0)).toBe(true);
    expect(isChordal([0, 3, 10], 0)).toBe(true);
  });
  it("stepwise melodies are not chordal", () => {
    expect(isChordal([0, 2, 4], 0)).toBe(false);
    expect(isChordal([0, 2, 3], 0)).toBe(false);
    expect(isChordal([0, 1, 2, 3], 0)).toBe(false);
  });
  it("voicings with no third are not chordal", () => {
    expect(isChordal([0, 7, 10], 0)).toBe(false);
  });
  it("complete interval names count", () => {
    expect(isChordal([0, 1, 3, 4, 8, 10], 0)).toBe(true);
  });
});

describe("segmentWindows", () => {
  it("no notes", () => {
    expect(segmentWindows([], 2)).toEqual({ chords: [], loose: [], coverage: 0 });
  });
  it("an arpeggio in its window is a chord", () => {
    const { chords, loose, coverage } = segmentWindows(arpeggio([48, 52, 55, 59], 0), 2);
    expect(chords.map((c) => [c.start, c.duration, c.pitchClasses])).toEqual([[0, 2, [0, 4, 7, 11]]]);
    expect(chords[0].midiNotes).toEqual([48, 52, 55, 59]);
    expect([loose, coverage]).toEqual([[], 1]);
  });
  it("windows too small to hold a chord are loose", () => {
    const { chords, loose, coverage } = segmentWindows(arpeggio([48, 52, 55, 59], 0), 1);
    expect([chords, loose.length, coverage]).toEqual([[], 4, 0]);
  });
  it("neighbouring windows with the same harmony are joined", () => {
    const { chords } = segmentWindows(
      [48, 52, 55, 59].map((p) => note(p, 0, 8)),
      1,
    );
    expect(span(chords)).toEqual([[0, 8]]);
  });
  it("a gap stops windows being joined", () => {
    const { chords } = segmentWindows([...arpeggio([48, 52, 55], 0, 0.25), ...arpeggio([48, 52, 55], 4, 0.25)], 1);
    expect(chords.map((c) => c.start)).toEqual([0, 4]);
  });
  it("coverage counts named windows only", () => {
    const { chords, loose, coverage } = segmentWindows([...arpeggio([48, 52, 55], 0, 0.25), note(60, 2, 0.5)], 1);
    expect([chords.length, midis(loose)]).toEqual([1, [60]]);
    expect(coverage).toBeCloseTo(0.5);
  });
  it("the last window ends with the last note", () => {
    expect(segmentWindows(arpeggio([48, 52, 55], 0, 0.5), 4).chords[0].duration).toBe(1.5);
  });
});

describe("detectChords", () => {
  it("arpeggios become chords", () => {
    const { chords, loose } = detectChords([...arpeggio([48, 52, 55, 59], 0), ...arpeggio([45, 48, 52, 55], 2)]);
    expect(names(chords)).toEqual(["Cmaj7", "Am7"]);
    expect(span(chords)).toEqual([
      [0, 2],
      [2, 2],
    ]);
    expect(loose).toEqual([]);
  });
  it("arpeggio bass is the lowest note", () => {
    expect(names(detectChords(arpeggio([52, 55, 59, 60], 0)).chords)).toEqual(["Cmaj7/E"]);
  });
  it("the smallest workable window is used", () => {
    const notes = [...arpeggio([48, 52, 55, 60], 0, 0.25), ...arpeggio([53, 57, 60, 65], 1, 0.25)];
    expect(names(detectChords(notes).chords)).toEqual(["C", "F"]);
  });
  it("slow arpeggios need a longer window", () => {
    const { chords } = detectChords(arpeggio([48, 52, 55, 59], 0, 1));
    expect(names(chords)).toEqual(["Cmaj7"]);
    expect(chords[0].duration).toBe(4);
  });
  it("a strummed chord is one chord", () => {
    const { chords, loose } = detectChords([48, 52, 55, 59].map((p, i) => note(p, 0.0833 * i, 4)));
    expect(names(chords)).toEqual(["Cmaj7"]);
    expect(loose).toEqual([]);
  });
  it("arpeggio key follows the chords", () => {
    const { chords, loose } = detectChords([...arpeggio([48, 52, 55, 59], 0), ...arpeggio([45, 48, 52, 55], 2)]);
    const a = analyze(chords, loose);
    expect(a.keyBasis).toBe("chord function");
    expect(closeCalls(a).map((k) => keyName(k))).toContain("C major");
  });
  it("block chords are left alone", () => {
    const notes = [...[48, 52, 55].map((p) => note(p, 0, 4)), ...[53, 57, 60].map((p) => note(p, 4, 4))];
    expect(detectChords(notes)).toEqual(segmentNotes(notes));
  });
  it("block chords under a busy melody are left alone", () => {
    const chords = [...[48, 52, 55].map((p) => note(p, 0, 8)), ...[53, 57, 60].map((p) => note(p, 8, 8))];
    const melody = arpeggio([72, 74, 76, 77, 79, 77, 76, 74, 72, 74, 76, 77, 79, 77, 76, 74], 0.25, 0.5);
    const { chords: found, loose } = detectChords([...chords, ...melody]);
    expect(names(found)).toEqual(["C", "F"]);
    expect(loose).toHaveLength(melody.length);
  });
  it("unnameable clips fall back to onset reading", () => {
    const melody = arpeggio([60, 62, 64, 62], 0);
    expect(detectChords(melody)).toEqual({ chords: [], loose: melody });
  });
  it("no notes", () => {
    expect(detectChords([])).toEqual({ chords: [], loose: [] });
  });
  it("minimum chord notes applies to windows", () => {
    expect(names(detectChords(arpeggio([48, 55], 0, 0.5), 2).chords)).toEqual(["C5"]);
  });
});

describe("held notes", () => {
  const voiceLed = (): NoteEvent[] => [note(60, 0, 8), note(64, 0, 4), note(67, 0, 4), note(65, 4, 4), note(69, 4, 4)];

  it("a chord change over a held note is recovered", () => {
    const { chords, loose } = detectChords(voiceLed());
    expect(names(chords)).toEqual(["C", "F/C"]);
    expect(span(chords)).toEqual([
      [0, 4],
      [4, 4],
    ]);
    expect(loose).toEqual([]);
  });
  it("recovered notes are not double counted", () => {
    const notes = voiceLed();
    const { chords, loose } = segmentNotes(notes);
    const { chords: recovered, loose: remaining } = recoverHeldChanges(notes, chords, loose);
    expect(loose).toHaveLength(2);
    expect([recovered.length, remaining]).toEqual([2, []]);
  });
  it("a melody over a pad is not a chord change", () => {
    const pad = [48, 52, 55].map((p) => note(p, 0, 4));
    const { chords, loose } = detectChords([...pad, note(76, 0, 1), note(77, 1, 1), note(79, 2, 2)]);
    expect(chords).toHaveLength(1);
    expect(midis(loose)).toEqual([77, 79]);
  });
  it("one released note is not a chord change", () => {
    const { chords, loose } = detectChords([note(60, 0, 8), note(64, 0, 8), note(67, 0, 4), note(69, 4, 4)]);
    expect(chords).toHaveLength(1);
    expect(midis(loose)).toEqual([69]);
  });
  it("changes that cannot be named are ignored", () => {
    const { chords, loose } = detectChords([
      note(60, 0, 8),
      note(64, 0, 4),
      note(67, 0, 4),
      note(61, 4, 4),
      note(62, 4, 4),
    ]);
    expect(chords).toHaveLength(1);
    expect(loose).toHaveLength(2);
  });
  it("recovered chord length follows the new notes", () => {
    const notes = voiceLed();
    notes[0] = note(60, 0, 16);
    const { chords } = detectChords(notes);
    expect(chords[chords.length - 1].duration).toBe(4);
  });
});

describe("windowed MIDI", () => {
  it("MIDI arpeggios are read as chords", () => {
    const events: [number, number[]][] = [];
    for (const chord of [
      [48, 52, 55, 59],
      [45, 48, 52, 55],
    ])
      for (const p of chord) events.push([0, noteOn(0, p)], [240, noteOff(0, p)]);
    const { chords, loose } = detectChords(parseMidi(buildFile([buildTrack(events)])));
    expect(chords.map((c) => c.pitchClasses)).toEqual([
      [0, 4, 7, 11],
      [0, 4, 7, 9],
    ]);
    expect(loose).toEqual([]);
  });
});

describe("segmentation result shape", () => {
  it("segmentNotes and detectChords return chords and loose notes by name", () => {
    const notes = [note(48, 0), note(52, 0), note(55, 0), note(72, 4)];
    expect(Object.keys(segmentNotes(notes)).sort()).toEqual(["chords", "loose"]);
    expect(Object.keys(detectChords(notes)).sort()).toEqual(["chords", "loose"]);
  });
  it("segmentWindows adds coverage", () => {
    expect(Object.keys(segmentWindows(arpeggio([48, 52, 55], 0), 2)).sort()).toEqual(["chords", "coverage", "loose"]);
  });
  it("detectChords returns the onset result untouched when no chord or window reading beats it", () => {
    const melody = [note(60, 0, 1), note(62, 1, 1), note(64, 2, 1)];
    expect(detectChords(melody)).toEqual({ chords: [], loose: melody });
  });
});

describe("window joining", () => {
  it("joins adjacent windows of one harmony into one event", () => {
    const { chords } = segmentWindows(
      [48, 52, 55].map((midi) => note(midi, 0, 4)),
      1,
    );
    expect(chords).toHaveLength(1);
    expect([chords[0].start, chords[0].duration]).toEqual([0, 4]);
  });
  it("does not join windows separated by a silent window", () => {
    const { chords } = segmentWindows([...arpeggio([48, 52, 55], 0, 0.25), ...arpeggio([48, 52, 55], 2, 0.25)], 1);
    expect(chords.map((c) => c.start)).toEqual([0, 2]);
  });
  it("does not join adjacent windows of different harmony", () => {
    const { chords } = segmentWindows([...arpeggio([48, 52, 55], 0, 0.25), ...arpeggio([53, 57, 60], 1, 0.25)], 1);
    expect(chords.map((c) => formatChord(nameChord(c.pitchClasses, bassPitchClass(c))[0]))).toEqual(["C", "F"]);
  });
  it("does not join adjacent windows that share pitch classes but not a bass", () => {
    const { chords } = segmentWindows([...arpeggio([48, 52, 55], 0, 0.25), ...arpeggio([52, 55, 60], 1, 0.25)], 1);
    expect(chords).toHaveLength(2);
  });
});

describe("melodic lines are not chords", () => {
  const scale = (midis: number[], step = 1) => midis.map((midi, index) => note(midi, index * step, step));
  const C_MAJOR_UP = [60, 62, 64, 65, 67, 69, 71, 72];

  it("a scale run has no chords, whatever the window", () => {
    expect(detectChords(scale(C_MAJOR_UP)).chords).toEqual([]);
    expect(detectChords(scale([...C_MAJOR_UP].reverse())).chords).toEqual([]);
    expect(detectChords(scale(C_MAJOR_UP, 0.5)).chords).toEqual([]);
  });
  it("keeps every note of a scale run as loose melody", () => {
    expect(detectChords(scale(C_MAJOR_UP)).loose).toHaveLength(8);
  });
  it("a tune that moves mostly by step has no chords, leaps and all", () => {
    expect(detectChords(scale([60, 62, 64, 62, 60, 64, 67, 65, 64, 62, 60])).chords).toEqual([]);
  });
  it("an arpeggio of the same pitches is still a chord", () => {
    expect(names(detectChords(arpeggio([60, 64, 67, 72], 0, 0.5)).chords)).toEqual(["C"]);
  });
  it("a broken-chord pattern with repeats and leaps is still a chord", () => {
    expect(names(detectChords(scale([48, 55, 52, 55, 48, 55, 52, 55], 0.5)).chords)).toEqual(["C"]);
  });
  it("a melody-only part is keyed from its notes alone", () => {
    const { chords, loose } = detectChords(scale(C_MAJOR_UP));
    const analysis = analyze(chords, loose);

    expect(analysis.keyBasis).toBe("pitch profile");
    expect(analysis.keys[0]).toMatchObject({ tonicPitchClass: 0, minor: false });
  });
  it("chords under a stepwise melody are still found by onset", () => {
    const chords = [
      [48, 52, 55],
      [53, 57, 60],
      [55, 59, 62],
      [48, 52, 55],
    ].flatMap((chord, index) => chord.map((midi) => note(midi, index * 4, 4)));

    expect(
      names(
        detectChords([
          ...chords,
          ...scale([72, 74, 76, 77, 79, 77, 76, 74], 2).map((tone) => ({
            ...tone,
            start: tone.start + 1,
            duration: 1,
          })),
        ]).chords,
      ),
    ).toEqual(["C", "F", "G", "C"]);
  });
});

describe("movesByStep", () => {
  const run = (midis: number[]) => midis.map((midi, index) => note(midi, index, 1));

  it("is true for a scale run and false for a spelled-out chord", () => {
    expect([movesByStep(run([60, 62, 64, 65])), movesByStep(run([60, 64, 67, 72]))]).toEqual([true, false]);
  });
  it("counts a move of two semitones as a step and three as a leap", () => {
    expect(movesByStep(run([60, 62]))).toBe(true);
    expect(movesByStep(run([60, 63]))).toBe(false);
  });
  it("is true at exactly 60% steps and false below", () => {
    // moves: 2, 2, 2, 4, 3 -> 3 of 5 are steps
    expect(movesByStep(run([60, 62, 64, 66, 70, 73]))).toBe(true);
    // moves: 2, 2, 4, 3, 5 -> 2 of 5
    expect(movesByStep(run([60, 62, 64, 68, 71, 76]))).toBe(false);
  });
  it("ignores repeated notes", () => {
    expect(movesByStep(run([60, 60, 60, 62, 62, 64]))).toBe(true);
  });
  it("is false for one note, no notes, or all the same note", () => {
    expect([movesByStep([]), movesByStep(run([60])), movesByStep(run([60, 60, 60]))]).toEqual([false, false, false]);
  });
  it("goes in order of start, not the order given", () => {
    expect(movesByStep([note(64, 2), note(60, 0), note(62, 1)])).toBe(true);
  });
  it("is false when a note has no octave, since nothing can be judged", () => {
    expect(movesByStep([note(60, 0), { pitchClass: 2, midi: null, start: 1, duration: 1 }, note(64, 2)])).toBe(false);
  });
  it("orders notes that start together by pitch", () => {
    expect(movesByStep([note(64, 0), note(60, 0), note(62, 0)])).toBe(true);
  });
});
