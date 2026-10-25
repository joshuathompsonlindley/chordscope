// Real MIDI clips, read end to end the way the page reads them: file in, chords and key out.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isAmbiguous } from "@core/analyze";
import { bestMatch, keyName } from "@core/key";
import { analyseMidi } from "@core/pipeline";
import { formatChord } from "@core/theory";
import { keyCardModel } from "@ui/utils/keys";

/** What a clip should read as. */
interface ClipExpectation {
  /** Path from the project root. */
  path: string;
  /** Chords in order, as named with sharps. */
  chords: string[];
  /** The leading key. */
  key: string;
  /** Other keys the music does not rule out, when the key is a close call. */
  alsoClose?: string[];
  /** The confidence word on the leading key's tooltip. */
  confidence: "High" | "Medium" | "Low";
}

// `satellite_chorus_C#maj` is named for its key by its author, so that one is a known answer. The others record what the
// analysis gives today: they guard against change, and say nothing about whether the reading is musically right.
const CLIPS: ClipExpectation[] = [
  {
    path: "test/clips/satellite_chorus_C#maj.mid",
    chords: ["F#maj9(no3)", "A#m7", "C#", "D#9(no3,no5)"],
    key: "C# major",
    confidence: "High",
  },
  {
    path: "test/clips/funk.mid",
    chords: ["Em9", "F#m7", "B9(no5)"],
    key: "F# minor",
    confidence: "Medium",
  },
  {
    path: "test/clips/funk_octave_down.mid",
    chords: ["Em9", "F#m7", "B9(no5)"],
    key: "F# minor",
    confidence: "Medium",
  },
  {
    path: "test/clips/prog.mid",
    chords: ["C#6/9", "D#6/9", "A#m11", "Fm11(no5)", "F#maj9#11(no3)"],
    key: "A# minor",
    alsoClose: ["C# major"],
    confidence: "Medium",
  },
  {
    path: "test/clips/prog2.mid",
    chords: ["Cadd9", "G6", "F", "Cadd9", "G6", "Fadd9"],
    key: "C major",
    confidence: "High",
  },
  {
    path: "test/clips/waltz.mid",
    chords: ["C", "Am", "Dm", "G7", "C", "F"],
    key: "C major",
    confidence: "High",
  },
];

/**
 * Read a clip from disk and analyse it.
 * @param path - Path from the project root.
 * @returns The analysis.
 */
function analyseClip(path: string): ReturnType<typeof analyseMidi> {
  const bytes: Buffer = readFileSync(path);

  return analyseMidi(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
}

describe.each(CLIPS)("$path", (clip: ClipExpectation) => {
  const analysed = analyseClip(clip.path);

  it("names its chords in order", () => {
    expect(analysed.analysis.chords.map((report) => formatChord(bestMatch(report)!))).toEqual(clip.chords);
  });
  it("leads with its key", () => {
    expect(keyName(analysed.analysis.keys[0])).toBe(clip.key);
  });
  it(clip.alsoClose ? "is a close call with the keys it shares notes with" : "is not a close call", () => {
    const card = keyCardModel(analysed.analysis, false);

    expect(isAmbiguous(analysed.analysis)).toBe(Boolean(clip.alsoClose));
    expect(card.keys.map((key) => key.name)).toEqual([clip.key, ...(clip.alsoClose ?? [])]);
  });
  it("tips its leading key with the expected confidence", () => {
    expect(keyCardModel(analysed.analysis, false).keys[0].tip.split(" ")[0]).toBe(clip.confidence);
  });
  it("reads every note of the file", () => {
    expect(analysed.file.notes.length).toBeGreaterThan(0);
    expect(analysed.chords.length).toBeGreaterThan(0);
  });
});

describe("clips that differ only in register", () => {
  it("funk an octave down reads as the same key and chords as funk", () => {
    const funk = analyseClip("test/clips/funk.mid");
    const lower = analyseClip("test/clips/funk_octave_down.mid");

    expect(lower.analysis.keys.slice(0, 5).map((key) => keyName(key))).toEqual(
      funk.analysis.keys.slice(0, 5).map((key) => keyName(key)),
    );
    expect(lower.file.notes.map((note) => note.midi + 12)).toEqual(funk.file.notes.map((note) => note.midi));
  });
});

describe("the key as a musician would name it", () => {
  it("is C# major for the clip named for it, with no other key in the running", () => {
    const card = keyCardModel(analyseClip("test/clips/satellite_chorus_C#maj.mid").analysis, false);

    expect(card.keys).toHaveLength(1);
    expect(card.keys[0].name).toBe("C# major");
    expect(card.note).toBeNull();
  });
});
