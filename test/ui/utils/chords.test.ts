import { describe, expect, it } from "vitest";

import { chordEvent } from "@core/theory";
import { type ChordEvent, type KeyCandidate } from "@core/types";
import { buildBands, chordInKeys, chordRows, type Band } from "@ui/utils/chords";

const majorKey = (tonicPitchClass: number): KeyCandidate => ({ tonicPitchClass, minor: false, score: 1 });
const minorKey = (tonicPitchClass: number): KeyCandidate => ({ tonicPitchClass, minor: true, score: 1 });

/** C major triad as a chord event with real octaves, so the bass is known. */
const cMajor = (start = 0, duration = 4): ChordEvent => chordEvent(start, duration, [0, 4, 7], [48, 52, 55]);

describe("buildBands", () => {
  it("merges neighbouring hits of one chord into one band", () => {
    const hits: ChordEvent[] = [cMajor(0, 1), cMajor(2, 1), cMajor(4, 1)];
    const bands: Band[] = buildBands(hits, false);

    expect(bands).toHaveLength(1);
  });
  it("starts a new band when the harmony changes", () => {
    const f: ChordEvent = chordEvent(4, 4, [0, 5, 9], [53, 57, 60]);
    const bands: Band[] = buildBands([cMajor(0, 4), f], false);

    expect(bands.map((b) => b.label)).toEqual(["C", "F"]);
  });
  it("starts a new band when only the bass changes", () => {
    const inversion: ChordEvent = chordEvent(4, 4, [0, 4, 7], [52, 55, 60]);

    expect(buildBands([cMajor(0, 4), inversion], false).map((b) => b.label)).toEqual(["C", "C/E"]);
  });
  it("labels an unnamed cluster with ? and no match", () => {
    const [band] = buildBands([chordEvent(0, 1, [0, 1, 2], [48, 49, 50])], false);

    expect(band.label).toBe("?");
    expect(band.match).toBeUndefined();
    expect(band.matches).toEqual([]);
  });
  it("spells with flats on request", () => {
    expect(buildBands([chordEvent(0, 1, [1, 5, 8], [49, 53, 56])], true)[0].label).toBe("Db");
    expect(buildBands([chordEvent(0, 1, [1, 5, 8], [49, 53, 56])], false)[0].label).toBe("C#");
  });
  it("copes with no chords", () => {
    expect(buildBands([], false)).toEqual([]);
  });
});

describe("chordInKeys", () => {
  const d9 = (): Band => buildBands([chordEvent(0, 1, [2, 6, 9, 0, 4], [50, 54, 57, 60, 64])], false)[0];

  it("lists one line per key, in the order given", () => {
    const lines = chordInKeys(d9().match!, [majorKey(0), majorKey(7)], false);

    expect(lines.map((line) => line.split(":")[0])).toEqual(["C major", "G major"]);
  });
  it("marks notes outside the key", () => {
    expect(chordInKeys(d9().match!, [majorKey(0)], false)[0]).toBe("C major: II9 · outside F#");
  });
  it("leaves out the outside note when the chord is wholly in key", () => {
    const g7 = buildBands([chordEvent(0, 1, [2, 5, 7, 11], [43, 47, 50, 53])], false)[0].match!;

    expect(chordInKeys(g7, [majorKey(0)], false)).toEqual(["C major: V7"]);
  });
  it("spells with flats on request", () => {
    const band = buildBands([chordEvent(0, 1, [1, 5, 8, 11], [49, 53, 56, 59])], false)[0].match!;

    expect(chordInKeys(band, [majorKey(0)], true)[0]).toContain("Db");
    expect(chordInKeys(band, [majorKey(0)], false)[0]).toContain("C#");
  });
  it("is empty with no keys", () => {
    expect(chordInKeys(d9().match!, [], false)).toEqual([]);
  });
});

describe("chordRows", () => {
  const bands = buildBands([cMajor(0, 4), chordEvent(4, 4, [0, 5, 9], [53, 57, 60])], false);
  const rows = chordRows(bands, [majorKey(0), minorKey(9)], false);

  it("has a row for each band, in order", () => {
    expect(rows.map((row) => row.label)).toEqual(["C", "F"]);
  });
  it("lists the notes as voiced", () => {
    expect(rows.map((row) => row.notes)).toEqual(["C3 E3 G3", "F3 A3 C4"]);
  });
  it("reads the chord in each candidate key, in the order given", () => {
    expect(rows[0]!.readings).toEqual(["C major: I", "A minor: III"]);
    expect(rows[1]!.readings).toEqual(["C major: IV", "A minor: VI"]);
  });
  it("remarks on the other names a chord could have, and says nothing when there are none", () => {
    const am7 = buildBands([chordEvent(0, 4, [0, 4, 7, 9], [57, 60, 64, 67])], false);

    expect(chordRows(am7, [], false)[0]!.remark).toBe("Also reads as C6/A");
    expect(rows[0]!.remark).toBeNull();
  });
  it("has no readings and no alternatives for a chord nothing fits", () => {
    const cluster = buildBands([chordEvent(0, 4, [0, 1, 2], [48, 49, 50])], false);
    const [row] = chordRows(cluster, [majorKey(0)], false);

    expect(row).toMatchObject({ label: "?", readings: [], remark: "No standard chord matches" });
  });
  it("explains a name built from intervals, instead of listing alternatives", () => {
    const built = buildBands([chordEvent(0, 4, [0, 1, 3, 4], [48, 49, 51, 52])], false);

    expect(chordRows(built, [], false)[0]!.remark).toBe("Named from its intervals; not a standard chord shape");
  });
  it("is empty with no bands", () => {
    expect(chordRows([], [], false)).toEqual([]);
  });
  it("spells with flats on request", () => {
    const flat = buildBands([chordEvent(0, 4, [1, 5, 8], [49, 53, 56])], true);

    expect(chordRows(flat, [], true)[0]!.notes).toBe("Db3 F3 Ab3");
  });
});
