// Top-level analysis: name chords, fold repeats, rank keys.
import { AMBIGUITY_MARGIN } from "@core/consts";
import { pitchClassWeights, rankKeys, rankKeysByChords } from "@core/key";
import { bassPitchClass, joinChords, nameChord, sameHarmony } from "@core/theory";
import {
  type Analysis,
  type ChordEvent,
  type ChordMatch,
  type ChordReport,
  type KeyCandidate,
  type NoteEvent,
} from "@core/types";

/**
 * The best key and every other key scoring within AMBIGUITY_MARGIN of it.
 * @param analysis - The finished analysis.
 * @returns The close-call keys, best first.
 */
export function closeCalls(analysis: Analysis): KeyCandidate[] {
  return analysis.keys.filter((key: KeyCandidate): boolean => analysis.keys[0]!.score - key.score <= AMBIGUITY_MARGIN);
}

/**
 * Whether more than one key is a close call.
 * @param analysis - The finished analysis.
 * @returns True when the key is uncertain.
 */
export function isAmbiguous(analysis: Analysis): boolean {
  return closeCalls(analysis).length > 1;
}

/**
 * Merge neighbouring chords with the same harmony (e.g. a chord re-struck every beat).
 * @param chords - Chords in time order.
 * @returns The chords with repeats merged into one longer event.
 */
export function mergeRepeatedHits(chords: readonly ChordEvent[]): ChordEvent[] {
  const merged: ChordEvent[] = [];

  for (const chord of chords) {
    const previous: ChordEvent | undefined = merged[merged.length - 1];

    if (previous && sameHarmony(previous, chord)) {
      merged[merged.length - 1] = joinChords(previous, chord);
    } else {
      merged.push(chord);
    }
  }

  return merged;
}

/**
 * Same name (root, quality, bass), whatever the voicing or length; unnamed chords match on pitch classes.
 * @param first - First chord report.
 * @param second - Second chord report.
 * @returns True when both read as the same chord.
 */
export function reportsMatch(first: ChordReport, second: ChordReport): boolean {
  const firstMatch: ChordMatch | undefined = first.matches[0];
  const secondMatch: ChordMatch | undefined = second.matches[0];

  if (firstMatch && secondMatch) {
    return (
      firstMatch.rootPitchClass === secondMatch.rootPitchClass &&
      firstMatch.template.symbol === secondMatch.template.symbol &&
      firstMatch.template.thirdOmitted === secondMatch.template.thirdOmitted &&
      firstMatch.bassPitchClass === secondMatch.bassPitchClass
    );
  }

  return !firstMatch && !secondMatch && sameHarmony(first.event, second.event);
}

/**
 * Fold a sequence that plays through more than once to one pass: `A B A B` -> `A B` x2; `A B A` stays.
 * @param items - The sequence.
 * @param match - Whether two items count as the same.
 * @returns The one-pass sequence.
 */
export function foldRepeats<T>(items: readonly T[], match: (first: T, second: T) => boolean): T[] {
  const count: number = items.length;

  for (let period: number = 1; period < count; period++) {
    if (
      count % period === 0 &&
      items.every((item: T, index: number): boolean => index < period || match(item, items[index % period]!))
    ) {
      return items.slice(0, period);
    }
  }

  return [...items];
}

/**
 * Name the chords and estimate the key.
 * @param chords - Detected chords.
 * @param looseNotes - Notes that belong to no chord.
 * @returns The full analysis.
 * @throws When there are no notes to analyse.
 */
export function analyze(chords: readonly ChordEvent[], looseNotes: readonly NoteEvent[]): Analysis {
  const weights: number[] = pitchClassWeights(chords, looseNotes);

  if (weights.reduce((total: number, weight: number): number => total + weight, 0) <= 0) {
    throw new Error("No notes to analyse");
  }

  // Weights use every note played; naming and folding use merged / deduplicated chords.
  const named: ChordReport[] = mergeRepeatedHits(chords).map((event: ChordEvent): ChordReport => ({
    event,
    matches: nameChord(event.pitchClasses, bassPitchClass(event)),
  }));

  const reports: ChordReport[] = foldRepeats(named, reportsMatch);

  // With chords rank keys by chord function; with only loose notes the pitch profile is all there is.
  const keys: KeyCandidate[] = reports.length ? rankKeysByChords(reports, weights) : rankKeys(weights);
  const keyBasis: Analysis["keyBasis"] = reports.length ? "chord function" : "pitch profile";

  return { chords: reports, keys, keyBasis };
}
