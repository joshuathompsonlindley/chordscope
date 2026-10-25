// Tuning constants and lookup tables shared across core.

// Chord naming, key finding and roman numerals.
export const SHARP_NAMES: readonly string[] = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export const FLAT_NAMES: readonly string[] = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

export const FLAT_KEY_MAJOR_TONICS: ReadonlySet<number> = new Set([1, 3, 5, 8, 10]);

export const BASS_WEIGHT: number = 2.0;

export const BASS_ROOT_BONUS: number = 3.0;

export const OMITTED_TONE_PENALTY: number = 0.5;

export const FIFTH_INTERVAL: number = 7;

export const MINOR_SEVENTH_INTERVAL: number = 10;

export const MAJOR_SEVENTH_INTERVAL: number = 11;

export const STACKING_WEIGHTS: Record<number, number> = {
  3: 3.0,
  4: 3.0,
  7: 2.5,
  6: 1.5,
  8: 1.5,
  10: 2.0,
  11: 2.0,
  2: 1.0,
  9: 1.0,
  5: 0.5,
};

export const MAX_ALTERNATIVE_READINGS: number = 2;

export const DEFAULT_MIN_CHORD_NOTES: number = 3;

export const AMBIGUITY_MARGIN: number = 0.05;

export const TONIC_WEIGHT: number = 0.15;

export const RESOLUTION_WEIGHT: number = 0.3;

/** How much the pitch-profile correlation counts beside the chord fit when keys are ranked by their chords. */
export const PROFILE_WEIGHT: number = 0.3;

export const KRUMHANSL_MAJOR: readonly number[] = [
  6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
];

export const KRUMHANSL_MINOR: readonly number[] = [
  6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
];

// The scales a key is read against.
export const SCALES: Record<"major" | "natural minor", readonly number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  "natural minor": [0, 2, 3, 5, 7, 8, 10],
};

export const MAJOR_NUMERALS: readonly string[] = [
  "I",
  "♭II",
  "II",
  "♭III",
  "III",
  "IV",
  "♯IV",
  "V",
  "♭VI",
  "VI",
  "♭VII",
  "VII",
];

export const MINOR_NUMERALS: readonly string[] = [
  "I",
  "♭II",
  "II",
  "III",
  "♯III",
  "IV",
  "♯IV",
  "V",
  "VI",
  "♯VI",
  "VII",
  "♯VII",
];

export const DOMINANT_SYMBOLS: ReadonlySet<string> = new Set([
  "7",
  "9",
  "7b9",
  "7#9",
  "7sus4",
  "13",
  "7b5",
  "7#5",
  "7#11",
  "7b13",
  "9sus4",
  "13sus4",
]);

// Segmentation: onset clustering, windows and held-note recovery.
export const ONSET_TOLERANCE_BEATS: number = 1 / 16;

export const WINDOW_SIZES_BEATS: readonly number[] = [1.0, 2.0, 4.0, 8.0];

export const WINDOW_COVERAGE_TARGET: number = 0.75;

export const WINDOW_MIN_OVERLAP_BEATS: number = 0.125;

export const MIN_ONSET_COVERAGE: number = 0.5;

export const MIN_RELEASED_PITCH_CLASSES: number = 2;

export const ADJACENT_WINDOW_TOLERANCE_BEATS: number = 1e-6;

/** A step is a move of this many semitones or fewer. */
export const STEP_SEMITONES: number = 2;

/** Notes moving by step at least this often read as a melodic line, not a chord spelled out. */
export const MELODIC_STEP_SHARE: number = 0.6;

// MIDI reading.
/** The shortest a note is read as, in beats: a note-off on the same tick as its note-on still has a place in time. */
export const MIN_NOTE_BEATS: number = 1 / 64;

// Pipeline.
/** Chords need at least this many distinct notes, then pairs count for parts with no triads (power chords, dyads). */
export const PAIR_CHORD_NOTES: number = 2;
