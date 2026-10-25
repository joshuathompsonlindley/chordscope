// Chord and note theory: constants, chord templates, naming. Port of python_prototype/chord_key_analysis.py.
import {
  BASS_ROOT_BONUS,
  DEFAULT_MIN_CHORD_NOTES,
  DOMINANT_SYMBOLS,
  FIFTH_INTERVAL,
  FLAT_NAMES,
  MAJOR_SEVENTH_INTERVAL,
  MINOR_SEVENTH_INTERVAL,
  OMITTED_TONE_PENALTY,
  SHARP_NAMES,
  STACKING_WEIGHTS,
} from "@core/consts";
import {
  type ChordEvent,
  type ChordMatch,
  type ChordTemplate,
  type TemplateOptions,
  type Tension,
  type HasInterval,
  type ChordShape,
} from "@core/types";
import { arraysEqual, isSubset } from "@core/utils/collections";
import { ascending, mod } from "@core/utils/math";

/**
 * Build a chord event.
 * @param start - Start position in beats.
 * @param duration - Length in beats.
 * @param pitchClasses - Distinct pitch classes, ascending.
 * @param midiNotes - MIDI note numbers, lowest first; empty when octaves are unknown.
 * @returns The chord event.
 */
export function chordEvent(
  start: number,
  duration: number,
  pitchClasses: readonly number[],
  midiNotes: readonly number[] = [],
): ChordEvent {
  return { start, duration, pitchClasses, midiNotes };
}

/**
 * Whether two chord events have the same harmony: the same pitch classes over the same bass.
 * @param first - First chord event.
 * @param second - Second chord event.
 * @returns True when the voicings agree, whatever their timing.
 */
export function sameHarmony(first: ChordEvent, second: ChordEvent): boolean {
  return arraysEqual(first.pitchClasses, second.pitchClasses) && bassPitchClass(first) === bassPitchClass(second);
}

/**
 * Join a chord event to the one after it, keeping the earlier voicing and covering both durations.
 * @param previous - The earlier chord event.
 * @param next - The chord event that follows it.
 * @returns The joined chord event.
 */
export function joinChords(previous: ChordEvent, next: ChordEvent): ChordEvent {
  return chordEvent(previous.start, previous.duration + next.duration, previous.pitchClasses, previous.midiNotes);
}

/**
 * Pitch class of the lowest sounding note.
 * @param chord - The chord event.
 * @returns The bass pitch class, or null when octaves are unknown.
 */
export function bassPitchClass(chord: ChordEvent): number | null {
  return chord.midiNotes.length ? mod(chord.midiNotes[0]!) : null;
}

/**
 * Whether a chord reading has a bass note other than its root.
 * @param match - The chord reading.
 * @returns True for a slash chord.
 */
export function isSlash(match: ChordMatch): boolean {
  return match.bassPitchClass !== null && match.bassPitchClass !== match.rootPitchClass;
}

/**
 * Roman-numeral suffix for a chord symbol: drops the minor `m` (case carries it), writes `dim` as `°`, `aug` as `+`,
 * and a half-diminished `m7b5` or `m9b5` as `ø7` or `ø9`.
 * @param symbol - Chord symbol suffix such as `m7`, `dim7` or `maj9`.
 * @param minorLike - Whether the quality is minor.
 * @returns The suffix to put after the numeral, with accidentals left as typed.
 */
export function numeralFromSymbol(symbol: string, minorLike: boolean): string {
  let suffix: string = symbol;

  if (suffix.startsWith("mMaj")) {
    suffix = "maj" + suffix.slice(4);
  } else if (minorLike && suffix.startsWith("m")) {
    suffix = suffix.slice(1).replace(/^(\d+)b5$/, "ø$1");
  }

  return suffix.replaceAll("dim", "°").replaceAll("aug", "+");
}

/**
 * Build a chord template from its parts.
 * @param symbol - Suffix used when naming the chord.
 * @param intervals - Semitone intervals above the root.
 * @param options - Optional tones, case and third omission.
 * @returns The template.
 */
function defineTemplate(symbol: string, intervals: number[], options: TemplateOptions = {}): ChordTemplate {
  const minorLike: boolean = options.minor ?? false;
  const optional: number[] = options.optional ?? [];

  return {
    symbol,
    intervals: new Set(intervals),
    optional: new Set(optional),
    required: intervals.filter((interval: number): boolean => !optional.includes(interval)),
    minorLike,
    numeralSuffix: numeralFromSymbol(symbol, minorLike).replace(/b/g, "♭").replace(/#/g, "♯"),
    thirdOmitted: options.omitsThird ?? false,
    dominant: DOMINANT_SYMBOLS.has(symbol),
  };
}

const OPTIONAL_FIFTH: number[] = [FIFTH_INTERVAL];
const OPTIONAL_SECOND_AND_FIFTH: number[] = [2, FIFTH_INTERVAL];

// Order matters: ties in score fall back to template length, then list order.
export const CHORD_TEMPLATES: readonly ChordTemplate[] = [
  defineTemplate("", [0, 4, 7]),
  defineTemplate("m", [0, 3, 7], { minor: true }),
  defineTemplate("dim", [0, 3, 6], { minor: true }),
  defineTemplate("aug", [0, 4, 8]),
  defineTemplate("sus2", [0, 2, 7]),
  defineTemplate("sus4", [0, 5, 7]),
  defineTemplate("5", [0, 7]),
  defineTemplate("6", [0, 4, 7, 9]),
  defineTemplate("m6", [0, 3, 7, 9], { minor: true }),
  defineTemplate("7", [0, 4, 7, 10], { optional: OPTIONAL_FIFTH }),
  defineTemplate("maj7", [0, 4, 7, 11], { optional: OPTIONAL_FIFTH }),
  defineTemplate("m7", [0, 3, 7, 10], { optional: OPTIONAL_FIFTH, minor: true }),
  defineTemplate("mMaj7", [0, 3, 7, 11], { optional: OPTIONAL_FIFTH, minor: true }),
  defineTemplate("m7b5", [0, 3, 6, 10], { minor: true }),
  defineTemplate("dim7", [0, 3, 6, 9], { minor: true }),
  defineTemplate("7sus4", [0, 5, 7, 10], { optional: OPTIONAL_FIFTH }),
  defineTemplate("add9", [0, 2, 4, 7], { optional: OPTIONAL_FIFTH }),
  defineTemplate("madd9", [0, 2, 3, 7], { optional: OPTIONAL_FIFTH, minor: true }),
  defineTemplate("9", [0, 2, 4, 7, 10], { optional: OPTIONAL_FIFTH }),
  defineTemplate("maj9", [0, 2, 4, 7, 11], { optional: OPTIONAL_FIFTH }),
  defineTemplate("m9", [0, 2, 3, 7, 10], { optional: OPTIONAL_FIFTH, minor: true }),
  defineTemplate("7b9", [0, 1, 4, 7, 10], { optional: OPTIONAL_FIFTH }),
  defineTemplate("7#9", [0, 3, 4, 7, 10], { optional: OPTIONAL_FIFTH }),
  defineTemplate("add4", [0, 4, 5, 7]),
  defineTemplate("madd4", [0, 3, 5, 7], { minor: true }),
  defineTemplate("7", [0, 7, 10], { omitsThird: true }),
  defineTemplate("maj7", [0, 7, 11], { omitsThird: true }),
  defineTemplate("9", [0, 2, 7, 10], { optional: OPTIONAL_FIFTH, omitsThird: true }),
  defineTemplate("maj9", [0, 2, 7, 11], { optional: OPTIONAL_FIFTH, omitsThird: true }),
  defineTemplate("6/9", [0, 2, 4, 7, 9], { optional: OPTIONAL_FIFTH }),
  defineTemplate("m6/9", [0, 2, 3, 7, 9], { optional: OPTIONAL_FIFTH, minor: true }),
  defineTemplate("m11", [0, 2, 3, 5, 7, 10], { optional: OPTIONAL_SECOND_AND_FIFTH, minor: true }),
  defineTemplate("maj7#11", [0, 4, 6, 7, 11], { optional: OPTIONAL_FIFTH }),
  defineTemplate("maj9#11", [0, 2, 4, 6, 7, 11], { optional: OPTIONAL_FIFTH }),
  defineTemplate("maj9#11", [0, 2, 6, 7, 11], { optional: OPTIONAL_FIFTH, omitsThird: true }),
  defineTemplate("13", [0, 2, 4, 7, 9, 10], { optional: OPTIONAL_SECOND_AND_FIFTH }),
  defineTemplate("7b5", [0, 4, 6, 10]),
  defineTemplate("7#5", [0, 4, 8, 10]),
  defineTemplate("7#11", [0, 4, 6, 7, 10], { optional: OPTIONAL_FIFTH }),
  defineTemplate("7b13", [0, 4, 7, 8, 10], { optional: OPTIONAL_FIFTH }),
  defineTemplate("9sus4", [0, 2, 5, 7, 10], { optional: OPTIONAL_FIFTH }),
  defineTemplate("13sus4", [0, 2, 5, 7, 9, 10], { optional: OPTIONAL_SECOND_AND_FIFTH }),
  defineTemplate("maj7#5", [0, 4, 8, 11]),
  defineTemplate("maj13", [0, 2, 4, 7, 9, 11], { optional: OPTIONAL_FIFTH }),
  defineTemplate("m13", [0, 2, 3, 7, 9, 10], { optional: OPTIONAL_SECOND_AND_FIFTH, minor: true }),
  defineTemplate("m9b5", [0, 2, 3, 6, 10], { minor: true }),
];

/**
 * Name a pitch class.
 * @param pitchClass - Pitch class, 0-11.
 * @param flats - Spell black keys with flats instead of sharps.
 * @returns The note name without octave.
 */
export function pitchClassName(pitchClass: number, flats: boolean = false): string {
  return (flats ? FLAT_NAMES : SHARP_NAMES)[mod(pitchClass)]!;
}

/**
 * Name a MIDI note with its octave.
 * @param midi - MIDI note number.
 * @param flats - Spell black keys with flats instead of sharps.
 * @returns The note name such as `C4`.
 */
export function midiNoteName(midi: number, flats: boolean = false): string {
  return `${pitchClassName(mod(midi), flats)}${Math.floor(midi / 12) - 1}`;
}

/**
 * Reject pitch classes outside 0-11.
 * @param present - Sounding pitch classes.
 * @param bass - Bass pitch class, or null.
 * @throws When any pitch class is out of range.
 */
function checkPitchClasses(present: ReadonlySet<number>, bass: number | null): void {
  const outOfRange: boolean = [...present].some((pitchClass: number): boolean => pitchClass < 0 || pitchClass >= 12);

  if (outOfRange || (bass !== null && (bass < 0 || bass >= 12))) {
    throw new Error("Pitch classes must be between 0 and 11");
  }
}

/**
 * Every known chord that explains the pitch classes, best first.
 * @param pitchClasses - Sounding pitch classes.
 * @param bass - Bass pitch class, or null when unknown.
 * @returns Matching readings, best first.
 */
export function identifyChord(pitchClasses: Iterable<number>, bass: number | null = null): ChordMatch[] {
  const present: Set<number> = new Set(pitchClasses);

  checkPitchClasses(present, bass);

  const matches: ChordMatch[] = [];

  for (const root of [...present].sort(ascending)) {
    const relative: Set<number> = new Set([...present].map((pitchClass: number): number => mod(pitchClass - root)));

    for (const template of CHORD_TEMPLATES) {
      // Must explain every sounding note and contain every non-optional tone.
      if (
        !isSubset(relative, template.intervals) ||
        !template.required.every((interval: number): boolean => relative.has(interval))
      ) {
        continue;
      }

      const omitted: Set<number> = new Set(
        [...template.intervals].filter((interval: number): boolean => !relative.has(interval)),
      );
      let score: number = -OMITTED_TONE_PENALTY * omitted.size;

      if (root === bass) {
        score += BASS_ROOT_BONUS;
      }

      matches.push({
        rootPitchClass: root,
        template,
        bassPitchClass: bass,
        omitted,
        pitchClasses: present,
        score,
        approximate: false,
      });
    }
  }

  matches.sort(
    (left: ChordMatch, right: ChordMatch): number =>
      right.score - left.score ||
      left.rootPitchClass - right.rootPitchClass ||
      left.template.intervals.size - right.template.intervals.size,
  );

  return matches;
}

/**
 * Read the third and seventh structure of a set of intervals.
 * @param has - Whether an interval above the root is present.
 * @returns The shape, or null if the intervals are not a stack of thirds.
 */
function readShape(has: HasInterval): ChordShape | null {
  const hasMajorThird: boolean = has(4);
  const hasMinorThird: boolean = has(3);

  if (!(hasMajorThird || hasMinorThird) || ![6, 7, 8, MINOR_SEVENTH_INTERVAL, MAJOR_SEVENTH_INTERVAL].some(has)) {
    return null;
  }

  const minor: boolean = hasMinorThird && !hasMajorThird;

  // A diminished seventh is a sixth above a minor third and flat fifth.
  const diminishedSeventh: boolean =
    minor && has(6) && has(9) && !has(MINOR_SEVENTH_INTERVAL) && !has(MAJOR_SEVENTH_INTERVAL);
  const seventh: string = diminishedSeventh
    ? "dim7"
    : has(MAJOR_SEVENTH_INTERVAL)
      ? "maj"
      : has(MINOR_SEVENTH_INTERVAL)
        ? "7"
        : "";

  return {
    hasMajorThird,
    hasMinorThird,
    minor,
    diminishedSeventh,
    seventh,
    sixth: has(9) && !diminishedSeventh,
    ninth: has(2),
  };
}

/**
 * List the altered and added tones that the chord's core name does not cover.
 * @param has - Whether an interval above the root is present.
 * @param shape - The chord's third and seventh structure.
 * @returns The tensions in no particular order.
 */
function collectTensions(has: HasInterval, shape: ChordShape): Tension[] {
  const tensions: Tension[] = [];

  if (has(1)) {
    tensions.push([1, "b9"]);
  }

  if (shape.hasMajorThird && shape.hasMinorThird) {
    tensions.push([3, "#9"]);
  }

  if (has(5)) {
    tensions.push([5, shape.seventh ? "11" : "add4"]);
  }

  if (has(6) && !shape.diminishedSeventh) {
    // A tritone beside a perfect fifth is a sharp eleventh; otherwise a flat fifth.
    if (has(FIFTH_INTERVAL)) {
      tensions.push([6, "#11"]);
    } else if (shape.seventh || !shape.minor) {
      tensions.push([6, "b5"]);
    }
  }

  if (has(8)) {
    tensions.push([8, has(FIFTH_INTERVAL) ? "b13" : "#5"]);
  }

  if (has(MINOR_SEVENTH_INTERVAL) && has(MAJOR_SEVENTH_INTERVAL)) {
    tensions.push([MINOR_SEVENTH_INTERVAL, "b7"]);
  }

  // Without a seventh a ninth is named on the chord; with one it raises the chord to a 9th or 13th.
  if (!shape.seventh && shape.ninth && !shape.sixth) {
    tensions.push([2, "add9"]);
  }

  return tensions;
}

/**
 * Name the chord's core: its seventh, sixth or ninth, or a diminished or augmented triad.
 * @param has - Whether an interval above the root is present.
 * @param shape - The chord's third and seventh structure.
 * @returns The core name, and the tension label it already covers (so it is not listed twice), if any.
 */
function nameCore(has: HasInterval, shape: ChordShape): { core: string; covered: string | null } {
  if (shape.seventh === "dim7") {
    return { core: "dim7", covered: null };
  }

  if (shape.seventh) {
    const extension: string = shape.sixth ? "13" : shape.ninth ? "9" : "7";

    return { core: (shape.seventh === "maj" ? "maj" : "") + extension, covered: null };
  }

  if (shape.minor && has(6) && !has(FIFTH_INTERVAL) && !shape.sixth) {
    return { core: "dim", covered: "b5" };
  }

  if (shape.hasMajorThird && has(8) && !has(FIFTH_INTERVAL)) {
    return { core: "aug", covered: "#5" };
  }

  return { core: shape.sixth ? (shape.ninth ? "6/9" : "6") : "", covered: null };
}

/**
 * Compare tensions by interval, then by label.
 * @param left - First tension.
 * @param right - Second tension.
 * @returns Negative when `left` sorts first.
 */
function compareTensions(left: Tension, right: Tension): number {
  return left[0] - right[0] || (left[1] < right[1] ? -1 : left[1] > right[1] ? 1 : 0);
}

/**
 * Build a quality from intervals above a root for shapes CHORD_TEMPLATES lacks.
 * @param relative - Intervals above the root, in semitones.
 * @returns The template, or null if the intervals are not a stack of thirds.
 */
export function intervalTemplate(relative: ReadonlySet<number>): ChordTemplate | null {
  /**
   * Whether an interval above the root is present.
   * @param interval - Semitones above the root.
   * @returns True when the interval sounds.
   */
  function has(interval: number): boolean {
    return relative.has(interval);
  }

  const shape: ChordShape | null = readShape(has);

  if (!shape) {
    return null;
  }

  const { core, covered }: { core: string; covered: string | null } = nameCore(has, shape);
  const tensions: Tension[] = collectTensions(has, shape)
    .filter((tension: Tension): boolean => tension[1] !== covered)
    .sort(compareTensions);

  // A minor chord takes an `m` prefix, except dim, and a minor-major seventh reads `mMaj`.
  let symbol: string = core;

  if (shape.minor && !core.startsWith("dim")) {
    symbol = "m" + (core.startsWith("maj") ? "Maj" + core.slice(3) : core);
  }

  if (tensions.length) {
    symbol += `(${tensions.map((tension: Tension): string => tension[1]).join(",")})`;
  }

  const fifthPresent: boolean = has(6) || has(FIFTH_INTERVAL) || has(8);
  const intervals: Set<number> = fifthPresent ? new Set(relative) : new Set([...relative, FIFTH_INTERVAL]);

  return {
    symbol,
    intervals,
    optional: fifthPresent ? new Set<number>() : new Set([FIFTH_INTERVAL]),
    required: [...intervals].filter((interval: number): boolean => fifthPresent || interval !== FIFTH_INTERVAL),
    minorLike: shape.minor,
    numeralSuffix: numeralFromSymbol(symbol, shape.minor),
    thirdOmitted: false,
    dominant: shape.hasMajorThird && shape.seventh === "7",
  };
}

/**
 * How much the pitch classes stack like thirds above a root.
 * @param present - Sounding pitch classes.
 * @param root - Candidate root pitch class.
 * @returns The summed stacking weight.
 */
export function stackingScore(present: ReadonlySet<number>, root: number): number {
  return [...present].reduce(
    (total: number, pitchClass: number): number => total + (STACKING_WEIGHTS[mod(pitchClass - root)] ?? 0),
    0,
  );
}

/**
 * Name a chord from its intervals when no standard shape fits.
 * @param pitchClasses - Sounding pitch classes.
 * @param bass - Bass pitch class, or null when unknown.
 * @returns An approximate reading, or null when none fits.
 */
export function describeChord(pitchClasses: Iterable<number>, bass: number | null = null): ChordMatch | null {
  const present: Set<number> = new Set(pitchClasses);

  checkPitchClasses(present, bass);

  if (present.size < DEFAULT_MIN_CHORD_NOTES) {
    return null;
  }

  // Bass first, then the pitch classes whose intervals stack most like thirds.
  const roots: number[] = [...present].sort(
    (left: number, right: number): number =>
      Number(left !== bass) - Number(right !== bass) ||
      stackingScore(present, right) - stackingScore(present, left) ||
      left - right,
  );

  for (const root of roots) {
    const relative: Set<number> = new Set([...present].map((pitchClass: number): number => mod(pitchClass - root)));
    const template: ChordTemplate | null = intervalTemplate(relative);

    if (template) {
      return {
        rootPitchClass: root,
        template,
        bassPitchClass: bass,
        omitted: new Set([...template.intervals].filter((interval: number): boolean => !relative.has(interval))),
        pitchClasses: present,
        score: 0,
        approximate: true,
      };
    }
  }

  return null;
}

/**
 * Standard readings if any fit, otherwise the single interval-built reading, otherwise empty.
 * @param pitchClasses - Sounding pitch classes.
 * @param bass - Bass pitch class, or null when unknown.
 * @returns Readings, best first.
 */
export function nameChord(pitchClasses: Iterable<number>, bass: number | null = null): ChordMatch[] {
  const pitchClassList: number[] = [...pitchClasses];
  const matches: ChordMatch[] = identifyChord(pitchClassList, bass);

  if (matches.length) {
    return matches;
  }

  const fallback: ChordMatch | null = describeChord(pitchClassList, bass);

  return fallback ? [fallback] : [];
}

/**
 * Chord name such as `Em9`, `B9(no5)` or `F#m7/A`.
 * @param match - The chord reading.
 * @param flats - Spell black keys with flats instead of sharps.
 * @returns The chord name.
 */
export function formatChord(match: ChordMatch, flats: boolean = false): string {
  let name: string = pitchClassName(match.rootPitchClass, flats) + match.template.symbol;
  const missing: string[] = [
    ...(match.template.thirdOmitted ? ["no3"] : []),
    ...(match.omitted.has(FIFTH_INTERVAL) ? ["no5"] : []),
  ];

  if (missing.length && name.endsWith(")")) {
    name = `${name.slice(0, -1)},${missing.join(",")})`;
  } else if (missing.length) {
    name += `(${missing.join(",")})`;
  }

  if (isSlash(match) && match.bassPitchClass !== null) {
    name += "/" + pitchClassName(match.bassPitchClass, flats);
  }

  return name;
}
