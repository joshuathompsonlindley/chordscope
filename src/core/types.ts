// Data shapes shared across core.
export interface ChordTemplate {
  /** Suffix used when naming the chord, such as `m7` (empty for a major triad). */
  readonly symbol: string;
  /** Semitone intervals above the root that make up the full chord. */
  readonly intervals: ReadonlySet<number>;
  /** Intervals that may be left out of a voicing. */
  readonly optional: ReadonlySet<number>;
  /** Intervals every voicing must contain: `intervals` minus `optional`. */
  readonly required: readonly number[];
  /** Whether roman numerals for this quality are lower case. */
  readonly minorLike: boolean;
  /** Text appended to the roman numeral. */
  readonly numeralSuffix: string;
  /** Voicing has no third. */
  readonly thirdOmitted: boolean;
  /** Dominant-type: a major third with a minor seventh. */
  readonly dominant: boolean;
}

export interface NoteEvent {
  pitchClass: number;
  midi: number | null;
  /** Beats. */
  start: number;
  /** Beats. */
  duration: number;
}

export interface ChordEvent {
  start: number;
  duration: number;
  /** Distinct pitch classes, ascending. */
  pitchClasses: readonly number[];
  /** MIDI note numbers, lowest first; empty when octaves are unknown. */
  midiNotes: readonly number[];
}

export interface ChordMatch {
  rootPitchClass: number;
  template: ChordTemplate;
  bassPitchClass: number | null;
  /** Optional intervals missing from the voicing (usually the fifth). */
  omitted: ReadonlySet<number>;
  pitchClasses: ReadonlySet<number>;
  score: number;
  /** Built from intervals because no standard shape fits. */
  approximate: boolean;
}

/** A note read from a file: always has its octave. */
export interface MidiNote extends Omit<NoteEvent, "midi"> {
  midi: number;
}

export interface MidiFile {
  /** Sorted by start, times in beats. */
  notes: MidiNote[];
}

/** Notes split into chords and the melody notes that belong to none. */
export interface Segmentation {
  chords: ChordEvent[];
  loose: NoteEvent[];
}

/** A window-based segmentation, with the share of windows that could be named. */
export interface WindowSegmentation extends Segmentation {
  /** Share of windows named as chords, 0 to 1. */
  coverage: number;
}

/** Notes in order of start, with the longest one's length, so a window can find its notes without scanning them all. */
export interface NoteIndex {
  sorted: NoteEvent[];
  /** The longest note's length in beats: no note that starts earlier than this before a time can still be sounding. */
  longest: number;
}

export interface ChordReport {
  event: ChordEvent;
  /** Possible names, best first; empty when no known chord fits. */
  matches: readonly ChordMatch[];
}

export interface KeyCandidate {
  tonicPitchClass: number;
  minor: boolean;
  /** Pearson correlation (pitch profile) or weighted chord fit (chord function). */
  score: number;
}

export interface ChordInKey {
  numeral: string;
  outside: readonly number[];
}

export interface Analysis {
  /** One report per chord of the progression, in time order, repeats folded away. */
  chords: readonly ChordReport[];
  /** All 24 keys, best first, ranked by `keyBasis`. */
  keys: readonly KeyCandidate[];
  keyBasis: "chord function" | "pitch profile";
}

/** What one analysed file gives the page. */
export interface Analysed {
  analysis: Analysis;
  file: MidiFile;
  chords: ChordEvent[];
}

/** A note-on waiting for its note-off. */
export interface OpenNote {
  tick: number;
}

/** What one track chunk contributes to the file. */
export interface TrackResult {
  notes: MidiNote[];
}

/** A fixed-length slice of the clip and the notes sounding in it. */
export interface TimeWindow {
  begin: number;
  end: number;
  members: NoteEvent[];
  named: boolean;
}

/** Options for `defineTemplate`. */
export interface TemplateOptions {
  /** Intervals that may be left out of a voicing. */
  optional?: number[];
  /** Roman numerals for this quality are lower case. */
  minor?: boolean;
  /** Voicing has no third. */
  omitsThird?: boolean;
}

/** A note added to or altered on a chord, as its interval above the root and its label, such as `[1, "b9"]`. */
export type Tension = [interval: number, label: string];

/** Whether an interval above the root is present. */
export type HasInterval = (interval: number) => boolean;

/** The third and seventh structure of a chord built from intervals. */
export interface ChordShape {
  hasMajorThird: boolean;
  hasMinorThird: boolean;
  /** Minor third without a major third. */
  minor: boolean;
  /** A minor third, flat fifth and sixth, with no minor or major seventh. */
  diminishedSeventh: boolean;
  /** `"dim7"`, `"maj"` for a major seventh, `"7"` for a minor seventh, or empty for none. */
  seventh: string;
  sixth: boolean;
  ninth: boolean;
}
