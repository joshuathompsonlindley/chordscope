import { describe, expect, it } from "vitest";
import { bestMatch } from "@core/key";
import { analyseMidi, analyseNotes } from "@core/pipeline";
import { formatChord } from "@core/theory";
import { buildFile, buildTrack, chordClip, noteOff, noteOn } from "@test/helpers";

const bytesOf = (track: number[]): ArrayBuffer => buildFile([track]).slice().buffer as ArrayBuffer;
const names = (clip: [number[], number][]) =>
  analyseMidi(bytesOf(chordClip(clip))).analysis.chords.map((report) => formatChord(bestMatch(report)!));

describe("analyseNotes", () => {
  it("names the chords of notes that did not come from a file", () => {
    const note = (midi: number, start: number) => ({ pitchClass: midi % 12, midi, start, duration: 4 });
    const notes = [note(48, 0), note(52, 0), note(55, 0), note(53, 4), note(57, 4), note(60, 4)];
    const analysed = analyseNotes({ notes });

    expect(analysed.analysis.chords.map((report) => formatChord(bestMatch(report)!))).toEqual(["C", "F"]);
  });
  it("rejects a part with no notes", () => {
    expect(() => analyseNotes({ notes: [] })).toThrow("No notes to analyse");
  });
});

describe("analyseMidi", () => {
  it("names the chords and estimates the key", () => {
    const analysed = analyseMidi(
      bytesOf(
        chordClip([
          [[48, 52, 55], 4],
          [[53, 57, 60], 4],
          [[55, 59, 62], 4],
          [[48, 52, 55], 4],
        ]),
      ),
    );

    expect(analysed.analysis.chords.map((report) => formatChord(bestMatch(report)!))).toEqual(["C", "F", "G", "C"]);
    expect(analysed.analysis.keys[0]).toMatchObject({ tonicPitchClass: 0, minor: false });
    expect(analysed.chords).toHaveLength(4);
    expect(analysed.file.notes).toHaveLength(12);
  });
  it("reads every channel, drums included, because the file is one exported part", () => {
    const onDrums = buildTrack([
      [0, noteOn(9, 48)],
      [0, noteOn(9, 52)],
      [0, noteOn(9, 55)],
      [480, noteOff(9, 48)],
      [0, noteOff(9, 52)],
      [0, noteOff(9, 55)],
    ]);

    expect(analyseMidi(bytesOf(onDrums)).file.notes).toHaveLength(3);
  });
  it("counts pairs as chords only when the part has no triads", () => {
    expect(
      names([
        [[48, 55], 2],
        [[60, 67], 2],
      ]),
    ).toEqual(["C5"]);
  });
  it("prefers triads and up when the part has them", () => {
    expect(
      names([
        [[48, 52, 55], 2],
        [[53, 60], 2],
      ]),
    ).toEqual(["C"]);
  });
  it("finds no chords in a melody and falls back to the pitch profile", () => {
    const melody = analyseMidi(
      bytesOf(
        chordClip([
          [[60], 1],
          [[62], 1],
          [[64], 1],
        ]),
      ),
    );

    expect(melody.analysis.chords).toHaveLength(0);
    expect(melody.analysis.keyBasis).toBe("pitch profile");
  });
  it("analyses a clip whose notes all start and stop on the same tick", () => {
    const track = buildTrack([
      [0, noteOn(0, 60)],
      [0, noteOn(0, 64)],
      [0, noteOn(0, 67)],
      [0, noteOff(0, 60)],
      [0, noteOff(0, 64)],
      [0, noteOff(0, 67)],
      [1920, [0xb0, 7, 100]],
    ]);
    const analysed = analyseMidi(bytesOf(track));

    expect(analysed.analysis.chords.map((report) => formatChord(bestMatch(report)!))).toEqual(["C"]);
    expect(analysed.analysis.keys[0]).toMatchObject({ tonicPitchClass: 0, minor: false });
  });
  it("reads a file with a garbled time signature quickly, as 4/4", () => {
    const track = buildTrack([
      [0, [0xff, 0x58, 4, 4, 30, 24, 8]],
      [0, noteOn(0, 60)],
      [480 * 16, noteOff(0, 60)],
    ]);
    const started = Date.now();
    const analysed = analyseMidi(bytesOf(track));

    expect(analysed.file.notes).toHaveLength(1);
    expect(Date.now() - started).toBeLessThan(1000);
  });
  it("rejects bytes that are not a MIDI file", () => {
    expect(() => analyseMidi(new Uint8Array([1, 2, 3]).buffer)).toThrow("Not a MIDI file");
  });
  it("rejects a file with no notes", () => {
    expect(() => analyseMidi(bytesOf(buildTrack([])))).toThrow("No notes to analyse");
  });
});
