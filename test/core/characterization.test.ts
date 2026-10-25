// Characterization tests: pin current chord naming, numerals and key analysis so refactors cannot change them silently.
import { describe, expect, it } from "vitest";
import { analyze } from "@core/analyze";
import { bestMatch, resolvesTo } from "@core/key";
import { detectChords, segmentNotes } from "@core/segment";
import { CHORD_TEMPLATES, formatChord, identifyChord, nameChord } from "@core/theory";
import { type ChordMatch, type ChordReport } from "@core/types";
import { mod } from "@core/utils/math";
import { parseMidi, readClip } from "@test/helpers";

/** Every pitch-class subset of the given sizes, as ascending arrays. */
function subsets(sizes: number[]): number[][] {
  const result: number[][] = [];
  for (let mask = 1; mask < 1 << 12; mask++) {
    const members = [...Array(12).keys()].filter((pc) => mask & (1 << pc));
    if (sizes.includes(members.length)) result.push(members);
  }
  return result;
}

/** A chord a fifth below the match's root, so `resolvesTo` is true exactly for dominant-type matches. */
function fifthBelow(match: ChordMatch): ChordMatch {
  return { ...match, rootPitchClass: mod(match.rootPitchClass - 7), template: CHORD_TEMPLATES[0] };
}

function describeMatch(match: ChordMatch): string {
  const t = match.template;
  const omitted = [...match.omitted].sort((a, b) => a - b).join(",");
  const flags = [
    t.minorLike ? "minor" : "",
    t.thirdOmitted ? "no3" : "",
    resolvesTo(match, fifthBelow(match)) ? "dom" : "",
  ];
  return `${formatChord(match, true)}{${t.numeralSuffix}|${flags.filter(Boolean).join(" ")}|omit ${omitted}|${match.approximate ? "approx" : "std"}}`;
}

describe("chord naming across every pitch-class set", () => {
  const lines: string[] = [];
  for (const members of subsets([1, 2, 3, 4, 5, 6, 7])) {
    for (const bass of [null, members[0]]) {
      const names = nameChord(members, bass).map(describeMatch).join(" ; ");
      const exact = identifyChord(members, bass).length;
      lines.push(`${members.join(",")} bass=${bass ?? "-"} exact=${exact} => ${names}`);
    }
  }

  it("matches the recorded readings", async () => {
    await expect(lines.join("\n")).toMatchFileSnapshot("./__snapshots__/naming.txt");
  });
});

describe("whole-clip analysis of the real DAW exports", () => {
  function summary(clip: string): unknown {
    const notes = parseMidi(readClip(clip));
    const { chords: onsetChords, loose: onsetLoose } = segmentNotes(notes);
    const { chords: detected, loose: detectedLoose } = detectChords(notes);
    const run = (chords: typeof onsetChords, loose: typeof onsetLoose) => {
      const result = analyze(chords, loose);
      return {
        chords: result.chords.map((report: ChordReport) => {
          const best = bestMatch(report);
          return `${best ? formatChord(best) : "?"} @${report.event.start}+${report.event.duration}`;
        }),
        keyBasis: result.keyBasis,
        keys: result.keys.slice(0, 6).map((k) => [k.tonicPitchClass, k.minor, Math.round(k.score * 1e9) / 1e9]),
      };
    };
    return { onset: run(onsetChords, onsetLoose), detected: run(detected, detectedLoose) };
  }

  it("funk clip", () => {
    expect(summary("funk.mid")).toMatchSnapshot();
  });
  it("prog clip", () => {
    expect(summary("prog.mid")).toMatchSnapshot();
  });
});
