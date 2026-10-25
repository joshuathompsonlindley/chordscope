// Guards against analysis time growing with the square of the note count. The limits are generous: they fail when the
// work is quadratic (tens of seconds at this size), not when the machine is merely slow.
import { describe, expect, it } from "vitest";
import { analyseMidi } from "@core/pipeline";
import { buildBands } from "@ui/utils/chords";
import { buildFile, buildTrack, noteOff, noteOn } from "@test/helpers";

/** A long arpeggiated part: one note every sixteenth, cycling through two chords. */
function longArpeggio(noteCount: number): ArrayBuffer {
  const pitches = [48, 52, 55, 59, 60, 64, 67, 71];
  const events: [number, number[]][] = [];

  for (let index = 0; index < noteCount; index++) {
    const pitch = pitches[index % pitches.length] + (index % 3 === 0 ? 12 : 0);

    events.push([index === 0 ? 0 : 120, noteOn(0, pitch)], [100, noteOff(0, pitch)]);
  }

  return buildFile([buildTrack(events)]).slice().buffer as ArrayBuffer;
}

describe("long parts", () => {
  it("analyses 40,000 notes in seconds, not minutes", () => {
    const bytes = longArpeggio(40_000);
    const started = Date.now();
    const analysed = analyseMidi(bytes);

    expect(analysed.file.notes).toHaveLength(40_000);
    expect(analysed.chords.length).toBeGreaterThan(1000);
    expect(Date.now() - started).toBeLessThan(5000);
  });
  it("builds the roll's chord bands for 40,000 notes in seconds", () => {
    const analysed = analyseMidi(longArpeggio(40_000));
    const started = Date.now();
    const bands = buildBands(analysed.chords, false);

    expect(bands.length).toBeGreaterThan(1000);
    expect(Date.now() - started).toBeLessThan(3000);
  });
});
