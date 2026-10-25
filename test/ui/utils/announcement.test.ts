import { describe, expect, it } from "vitest";

import { analyseMidi } from "@core/pipeline";
import { type Analysed } from "@core/types";
import { announcement } from "@ui/utils/announcement";
import { buildFile, chordClip, readClip } from "@test/helpers";

describe("announcement", () => {
  const clipOf = (chords: [number[], number][]): Analysed =>
    analyseMidi(buildFile([chordClip(chords)]).slice().buffer as ArrayBuffer);

  it("names the close calls with 'or', and says how it was found", () => {
    const analysed = analyseMidi(readClip("prog.mid").buffer as ArrayBuffer);

    expect(announcement(analysed)).toBe("Close call, from the chords: Bb minor or Db major. 10 chords found.");
  });
  it("names just the key when it is clear", () => {
    const analysed = clipOf([
      [[48, 52, 55], 4],
      [[53, 57, 60], 4],
      [[55, 59, 62], 4],
      [[48, 52, 55], 4],
    ]);

    expect(announcement(analysed)).toBe("Key, from the chords: C major. 4 chords found.");
  });
  it("says 'chord' for exactly one", () => {
    expect(announcement(clipOf([[[48, 52, 55], 4]]))).toMatch(/ 1 chord found\.$/);
  });
  it("spells the key as the page does, with flats where it prefers them", () => {
    const analysed = clipOf([
      [[49, 53, 56], 4],
      [[54, 58, 61], 4],
      [[56, 60, 63], 4],
      [[49, 53, 56], 4],
    ]);

    expect(announcement(analysed)).toContain("Db major");
  });
});
