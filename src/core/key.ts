// Key and scale estimation, and roman numerals.
import {
  BASS_WEIGHT,
  FIFTH_INTERVAL,
  FLAT_KEY_MAJOR_TONICS,
  KRUMHANSL_MAJOR,
  KRUMHANSL_MINOR,
  MAJOR_NUMERALS,
  MINOR_NUMERALS,
  PROFILE_WEIGHT,
  RESOLUTION_WEIGHT,
  SCALES,
  TONIC_WEIGHT,
} from "@core/consts";
import { bassPitchClass, pitchClassName } from "@core/theory";
import {
  type ChordEvent,
  type ChordInKey,
  type ChordMatch,
  type ChordReport,
  type ChordTemplate,
  type KeyCandidate,
  type NoteEvent,
} from "@core/types";
import { ascending, mod, pearson, sum } from "@core/utils/math";

/**
 * The best-ranked reading of a chord.
 * @param report - The chord report.
 * @returns The top match, or null when no known chord fits.
 */
export function bestMatch(report: ChordReport): ChordMatch | null {
  return report.matches[0] ?? null;
}

/**
 * Total up how much each pitch class sounds, with extra weight on chord bass notes.
 * @param chords - Detected chords.
 * @param loose - Notes that belong to no chord.
 * @returns Twelve weights, one per pitch class.
 */
export function pitchClassWeights(chords: readonly ChordEvent[], loose: readonly NoteEvent[]): number[] {
  const weights: number[] = new Array<number>(12).fill(0);

  for (const chord of chords) {
    for (const pitchClass of chord.pitchClasses) {
      weights[pitchClass] = (weights[pitchClass] ?? 0) + chord.duration;
    }

    const bass: number | null = bassPitchClass(chord);

    if (bass !== null) {
      weights[bass] = (weights[bass] ?? 0) + chord.duration * (BASS_WEIGHT - 1);
    }
  }

  for (const note of loose) {
    weights[note.pitchClass] = (weights[note.pitchClass] ?? 0) + note.duration;
  }

  return weights;
}

/**
 * Sort keys by score, then tonic, then major before minor.
 * @param left - First key.
 * @param right - Second key.
 * @returns Negative when `left` ranks first.
 */
function byScore(left: KeyCandidate, right: KeyCandidate): number {
  return (
    right.score - left.score || left.tonicPitchClass - right.tonicPitchClass || Number(left.minor) - Number(right.minor)
  );
}

/**
 * Score all 24 keys and rank them.
 * @param scoreKey - Scores one key from its tonic pitch class and whether it is minor.
 * @returns All keys, best first.
 */
function rankAllKeys(scoreKey: (tonicPitchClass: number, minor: boolean) => number): KeyCandidate[] {
  const candidates: KeyCandidate[] = [];

  for (let tonic: number = 0; tonic < 12; tonic++) {
    for (const minor of [false, true]) {
      candidates.push({ tonicPitchClass: tonic, minor, score: scoreKey(tonic, minor) });
    }
  }

  return candidates.sort(byScore);
}

/**
 * Correlation of the pitch-class weights with one key's Krumhansl-Schmuckler profile.
 * @param weights - Twelve pitch-class weights.
 * @param tonic - The key's tonic pitch class.
 * @param minor - Whether the key is minor.
 * @returns The Pearson correlation, -1 to 1.
 */
export function profileCorrelation(weights: readonly number[], tonic: number, minor: boolean): number {
  const profile: readonly number[] = minor ? KRUMHANSL_MINOR : KRUMHANSL_MAJOR;

  // Rotate the profile so index 0 lines up with the candidate tonic.
  const rotated: number[] = Array.from(
    { length: 12 },
    (_: unknown, pitchClass: number): number => profile[mod(pitchClass - tonic)]!,
  );

  return pearson(weights, rotated);
}

/**
 * Krumhansl-Schmuckler ranking of all 24 keys.
 * @param weights - Twelve pitch-class weights.
 * @returns All keys, best first.
 */
export function rankKeys(weights: readonly number[]): KeyCandidate[] {
  return rankAllKeys(function correlateWithProfile(tonic: number, minor: boolean): number {
    return profileCorrelation(weights, tonic, minor);
  });
}

/**
 * Whether a dominant-type chord with a third has its root a fifth above the next chord's.
 * @param current - The chord that moves.
 * @param following - The chord it moves to.
 * @returns True for a dominant resolution.
 */
export function resolvesTo(current: ChordMatch, following: ChordMatch): boolean {
  const template: ChordTemplate = current.template;
  const isDominant: boolean = template.dominant && !template.thirdOmitted;

  return isDominant && mod(current.rootPitchClass - following.rootPitchClass) === FIFTH_INTERVAL;
}

/**
 * Whether a chord is the tonic chord of a key.
 * @param match - The chord reading.
 * @param tonicPitchClass - The key's tonic pitch class.
 * @param minor - Whether the key is minor.
 * @returns True when the chord is the tonic.
 */
export function isTonicChord(match: ChordMatch, tonicPitchClass: number, minor: boolean): boolean {
  return (
    match.rootPitchClass === tonicPitchClass && (match.template.thirdOmitted || match.template.minorLike === minor)
  );
}

/**
 * The pitch classes of a key's scale.
 * @param tonicPitchClass - The key's tonic pitch class.
 * @param minor - Whether the key is minor.
 * @returns The scale's pitch classes.
 */
export function keyScalePitchClasses(tonicPitchClass: number, minor: boolean): Set<number> {
  return new Set(
    SCALES[minor ? "natural minor" : "major"].map((interval: number): number => mod(tonicPitchClass + interval)),
  );
}

/**
 * The pitch classes that belong to a key when chords are read in it: its scale, plus the raised seventh of a minor
 * key, since the leading tone of a minor key's dominant (E7 in A minor) is not a stray note.
 * @param tonicPitchClass - The key's tonic pitch class.
 * @param minor - Whether the key is minor.
 * @returns The key's pitch classes for chord reading.
 */
export function keyChordPitchClasses(tonicPitchClass: number, minor: boolean): Set<number> {
  const scale: Set<number> = keyScalePitchClasses(tonicPitchClass, minor);

  if (minor) {
    scale.add(mod(tonicPitchClass + 11)); // raised seventh
  }

  return scale;
}

/**
 * How well a key explains a progression (treated as a loop): chord-tone fit + tonic time + V-I resolution time.
 * @param reports - The chord progression.
 * @param tonicPitchClass - The key's tonic pitch class.
 * @param minor - Whether the key is minor.
 * @returns The score; higher fits better.
 */
export function scoreKeyByChords(reports: readonly ChordReport[], tonicPitchClass: number, minor: boolean): number {
  const total: number = sum(reports.map((report: ChordReport): number => report.event.duration));

  if (total <= 0) {
    return 0;
  }

  const scale: Set<number> = keyChordPitchClasses(tonicPitchClass, minor);

  let fit: number = 0;
  let tonicTime: number = 0;
  let resolvingTime: number = 0;

  reports.forEach((report: ChordReport, index: number): void => {
    const { duration, pitchClasses: tones }: { duration: number; pitchClasses: readonly number[] } = report.event;

    fit += (duration * tones.filter((pitchClass: number): boolean => scale.has(pitchClass)).length) / tones.length;

    // Tonic and resolution evidence only apply to identified chords.
    const best: ChordMatch | null = bestMatch(report);

    if (!best) {
      return;
    }

    if (isTonicChord(best, tonicPitchClass, minor)) {
      tonicTime += duration;
    }

    const following: ChordMatch | null = bestMatch(reports[(index + 1) % reports.length]!);

    if (following && isTonicChord(following, tonicPitchClass, minor) && resolvesTo(best, following)) {
      resolvingTime += duration;
    }
  });

  return (fit + TONIC_WEIGHT * tonicTime + RESOLUTION_WEIGHT * resolvingTime) / total;
}

/**
 * Rank all 24 keys by how well they explain a chord progression. Keys that share most of their notes (a major key and
 * its relative minor) fit the chords almost equally, so when the notes' weights are given their pitch-profile
 * correlation settles the tie: the profile rewards the key whose tonic and dominant the music dwells on.
 * @param reports - The chord progression.
 * @param weights - Twelve pitch-class weights of every note played; leave out to rank on the chords alone.
 * @returns All keys, best first.
 */
export function rankKeysByChords(reports: readonly ChordReport[], weights?: readonly number[]): KeyCandidate[] {
  return rankAllKeys(function scoreProgression(tonic: number, minor: boolean): number {
    const chordFit: number = scoreKeyByChords(reports, tonic, minor);

    return weights ? chordFit + PROFILE_WEIGHT * profileCorrelation(weights, tonic, minor) : chordFit;
  });
}

/**
 * Roman numeral for a chord in a key; a thirdless voicing takes its case from the key's scale.
 * @param match - The chord reading.
 * @param tonicPitchClass - The key's tonic pitch class.
 * @param minor - Whether the key is minor.
 * @returns The numeral with its quality suffix.
 */
export function romanNumeral(match: ChordMatch, tonicPitchClass: number, minor: boolean): string {
  let numeral: string = (minor ? MINOR_NUMERALS : MAJOR_NUMERALS)[mod(match.rootPitchClass - tonicPitchClass)]!;
  let lower: boolean = match.template.minorLike;

  if (match.template.thirdOmitted) {
    const scale: Set<number> = keyScalePitchClasses(tonicPitchClass, minor);

    lower = scale.has(mod(match.rootPitchClass + 3)) && !scale.has(mod(match.rootPitchClass + 4));
  }

  if (lower) {
    numeral = numeral.toLowerCase();
  }

  return numeral + match.template.numeralSuffix;
}

/**
 * Read a chord in a key.
 * @param match - The chord reading.
 * @param key - The key.
 * @returns The roman numeral and any pitch classes outside the key (its scale, and a minor key's raised seventh).
 */
export function readInKey(match: ChordMatch, key: KeyCandidate): ChordInKey {
  const scale: Set<number> = keyChordPitchClasses(key.tonicPitchClass, key.minor);
  const outside: number[] = [...match.pitchClasses]
    .filter((pitchClass: number): boolean => !scale.has(pitchClass))
    .sort(ascending);

  return { numeral: romanNumeral(match, key.tonicPitchClass, key.minor), outside };
}

/**
 * Whether a key is conventionally spelled with flats.
 * @param key - The key.
 * @returns True for flat keys.
 */
export function prefersFlats(key: KeyCandidate): boolean {
  return FLAT_KEY_MAJOR_TONICS.has(key.minor ? mod(key.tonicPitchClass + 3) : key.tonicPitchClass);
}

/**
 * Display name of a key, such as `A minor`.
 * @param key - The key.
 * @param flats - Spell black keys with flats instead of sharps.
 * @returns The key name.
 */
export function keyName(key: KeyCandidate, flats: boolean = false): string {
  return `${pitchClassName(key.tonicPitchClass, flats)} ${key.minor ? "minor" : "major"}`;
}
