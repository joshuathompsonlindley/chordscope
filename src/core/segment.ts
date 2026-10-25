// Turn a flat list of notes into chords: by onset, by fixed windows (arpeggios), or by recovering changes under held notes.
import {
  ADJACENT_WINDOW_TOLERANCE_BEATS,
  DEFAULT_MIN_CHORD_NOTES,
  FIFTH_INTERVAL,
  MAJOR_SEVENTH_INTERVAL,
  MELODIC_STEP_SHARE,
  MINOR_SEVENTH_INTERVAL,
  MIN_ONSET_COVERAGE,
  MIN_RELEASED_PITCH_CLASSES,
  ONSET_TOLERANCE_BEATS,
  STEP_SEMITONES,
  WINDOW_COVERAGE_TARGET,
  WINDOW_MIN_OVERLAP_BEATS,
  WINDOW_SIZES_BEATS,
} from "@core/consts";
import { bassPitchClass, chordEvent, joinChords, nameChord, sameHarmony } from "@core/theory";
import {
  type ChordEvent,
  type NoteEvent,
  type NoteIndex,
  type Segmentation,
  type WindowSegmentation,
  type TimeWindow,
} from "@core/types";
import { ascending, maxOf, minOf } from "@core/utils/math";
import { lowerBound, upperBound } from "@core/utils/search";

/**
 * Sort notes by start for fast searching.
 * @param notes - The notes, in any order.
 * @returns The index.
 */
export function indexNotes(notes: readonly NoteEvent[]): NoteIndex {
  return {
    sorted: [...notes].sort((left: NoteEvent, right: NoteEvent): number => left.start - right.start),
    longest: maxOf(notes.map((note: NoteEvent): number => note.duration)),
  };
}

/**
 * Where a note starts.
 * @param note - The note.
 * @returns Start position in beats.
 */
function noteStart(note: NoteEvent): number {
  return note.start;
}

/**
 * Where a note stops sounding.
 * @param note - The note.
 * @returns End position in beats.
 */
function noteEnd(note: NoteEvent): number {
  return note.start + note.duration;
}

/**
 * Group notes whose onsets fall within `tolerance` of the group's first note.
 * @param notes - The notes.
 * @param tolerance - Largest onset gap, in beats, within a group.
 * @returns The groups in time order.
 */
export function clusterByOnset(notes: readonly NoteEvent[], tolerance: number): NoteEvent[][] {
  const clusters: NoteEvent[][] = [];

  for (const note of [...notes].sort((left: NoteEvent, right: NoteEvent): number => left.start - right.start)) {
    const last: NoteEvent[] | undefined = clusters[clusters.length - 1];

    if (last && note.start - last[0]!.start <= tolerance) {
      last.push(note);
    } else {
      clusters.push([note]);
    }
  }

  return clusters;
}

/**
 * Build a chord event from notes. Octaves only give a bass when every note has one.
 * @param start - Start position in beats.
 * @param duration - Length in beats.
 * @param notes - The notes that make up the chord.
 * @returns The chord event.
 */
export function chordFromNotes(start: number, duration: number, notes: readonly NoteEvent[]): ChordEvent {
  const pitchClasses: number[] = [...new Set(notes.map((note: NoteEvent): number => note.pitchClass))].sort(ascending);
  let midiNotes: number[] = notes
    .filter((note: NoteEvent): boolean => note.midi !== null)
    .map((note: NoteEvent): number => note.midi as number)
    .sort(ascending);

  if (midiNotes.length !== notes.length) {
    midiNotes = [];
  }

  return chordEvent(start, duration, pitchClasses, midiNotes);
}

/**
 * Split notes into chords (notes starting together) and loose melody notes.
 * @param notes - The notes.
 * @param minChordNotes - Fewest distinct pitch classes that make a chord.
 * @param tolerance - Largest onset gap, in beats, for notes to count as together.
 * @returns The chords and the loose notes.
 */
export function segmentNotes(
  notes: readonly NoteEvent[],
  minChordNotes: number = DEFAULT_MIN_CHORD_NOTES,
  tolerance: number = ONSET_TOLERANCE_BEATS,
): Segmentation {
  const chords: ChordEvent[] = [];
  const loose: NoteEvent[] = [];

  for (const cluster of clusterByOnset(notes, tolerance)) {
    if (new Set(cluster.map((note: NoteEvent): number => note.pitchClass)).size < minChordNotes) {
      loose.push(...cluster);
      continue;
    }

    chords.push(
      chordFromNotes(cluster[0]!.start, maxOf(cluster.map((note: NoteEvent): number => note.duration)), cluster),
    );
  }

  return { chords, loose };
}

/**
 * The notes that start in a stretch of time.
 * @param index - The notes, indexed by start.
 * @param from - Earliest start, inclusive.
 * @param to - Latest start.
 * @param inclusive - Whether a note starting exactly at `to` counts.
 * @returns The notes, in order of start.
 */
function notesBetween(index: NoteIndex, from: number, to: number, inclusive: boolean): NoteEvent[] {
  const first: number = lowerBound(index.sorted, from, noteStart);
  const stop: number = inclusive ? upperBound(index.sorted, to, noteStart) : lowerBound(index.sorted, to, noteStart);

  return index.sorted.slice(first, stop);
}

/**
 * Notes starting in the window, plus earlier notes sounding into it for at least WINDOW_MIN_OVERLAP_BEATS.
 * @param index - The notes, indexed by start.
 * @param begin - Window start in beats.
 * @param end - Window end in beats.
 * @returns The notes belonging to the window, in order of start.
 */
export function indexedNotesInWindow(index: NoteIndex, begin: number, end: number): NoteEvent[] {
  // Only a note that starts within its own length of the window's start can sound into it.
  const first: number = lowerBound(index.sorted, begin - index.longest, noteStart);
  const stop: number = lowerBound(index.sorted, end, noteStart);
  const members: NoteEvent[] = [];

  for (let at: number = first; at < stop; at++) {
    const note: NoteEvent = index.sorted[at]!;
    const startsInside: boolean = note.start >= begin;
    const soundsInto: boolean = note.start < begin && Math.min(noteEnd(note), end) - begin >= WINDOW_MIN_OVERLAP_BEATS;

    if (startsInside || soundsInto) {
      members.push(note);
    }
  }

  return members;
}

/**
 * Whether a set gathered from a time window is solid enough to be a chord (has its third, all tones bar a 7th chord's fifth).
 * @param pitchClasses - Sounding pitch classes.
 * @param bass - Bass pitch class, or null when unknown.
 * @returns True when some reading is complete enough.
 */
export function isChordal(pitchClasses: Iterable<number>, bass: number | null = null): boolean {
  for (const match of nameChord(pitchClasses, bass)) {
    if (match.template.thirdOmitted) {
      continue;
    }

    const omitted: number[] = [...match.omitted];
    const hasSeventh: boolean = [...match.template.intervals].some(
      (interval: number): boolean => interval === MINOR_SEVENTH_INTERVAL || interval === MAJOR_SEVENTH_INTERVAL,
    );

    if (
      omitted.length === 0 ||
      (omitted.every((interval: number): boolean => interval === FIFTH_INTERVAL) && hasSeventh)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Whether the notes move mostly by step, like a scale run or a tune, rather than by the leaps of a spelled-out chord.
 * Notes with octaves are taken in the order they start; a note without one gives nothing to judge, so the answer is no.
 * @param notes - The notes of a window.
 * @returns True when at least MELODIC_STEP_SHARE of the moves from one note to the next are steps.
 */
export function movesByStep(notes: readonly NoteEvent[]): boolean {
  if (notes.some((note: NoteEvent): boolean => note.midi === null)) {
    return false;
  }

  const ordered: NoteEvent[] = [...notes].sort(
    (left: NoteEvent, right: NoteEvent): number =>
      left.start - right.start || (left.midi as number) - (right.midi as number),
  );
  let moves: number = 0;
  let steps: number = 0;

  for (let index: number = 1; index < ordered.length; index++) {
    const interval: number = Math.abs((ordered[index]!.midi as number) - (ordered[index - 1]!.midi as number));

    if (interval === 0) {
      continue; // a repeated note is no move
    }

    moves++;

    if (interval <= STEP_SEMITONES) {
      steps++;
    }
  }

  return moves > 0 && steps / moves >= MELODIC_STEP_SHARE;
}

/**
 * Read chords from the notes sounding in fixed windows.
 * @param notes - The notes.
 * @param size - Window length in beats.
 * @param minChordNotes - Fewest distinct pitch classes that make a chord.
 * @returns The chords, the loose notes, and the share of windows that were named.
 */
export function segmentWindows(
  notes: readonly NoteEvent[],
  size: number,
  minChordNotes: number = DEFAULT_MIN_CHORD_NOTES,
): WindowSegmentation {
  if (!notes.length) {
    return { chords: [], loose: [], coverage: 0 };
  }

  const noteIndex: NoteIndex = indexNotes(notes);
  const stop: number = maxOf(notes.map(noteEnd));
  const windows: TimeWindow[] = [];
  let index: number = Math.floor(minOf(notes.map((note: NoteEvent): number => note.start)) / size);

  while (index * size < stop) {
    const begin: number = index * size;
    const end: number = (index + 1) * size;
    const members: NoteEvent[] = indexedNotesInWindow(noteIndex, begin, end);

    index++;

    if (!members.length) {
      continue;
    }

    const event: ChordEvent = chordFromNotes(begin, Math.min(end, stop) - begin, members);
    const named: boolean =
      event.pitchClasses.length >= minChordNotes &&
      !movesByStep(members) &&
      isChordal(event.pitchClasses, bassPitchClass(event));

    windows.push({ begin, end: Math.min(end, stop), members, named });
  }

  // Join neighbouring named windows with the same harmony; notes starting in unnamed windows stay loose.
  const chords: ChordEvent[] = [];
  const loose: NoteEvent[] = [];

  for (const { begin, end, members, named } of windows) {
    if (!named) {
      loose.push(...members.filter((note: NoteEvent): boolean => note.start >= begin && note.start < end));
      continue;
    }

    const event: ChordEvent = chordFromNotes(begin, end - begin, members);
    const previous: ChordEvent | undefined = chords[chords.length - 1];

    if (
      previous &&
      Math.abs(previous.start + previous.duration - begin) <= ADJACENT_WINDOW_TOLERANCE_BEATS &&
      sameHarmony(previous, event)
    ) {
      chords[chords.length - 1] = joinChords(previous, event);
    } else {
      chords.push(event);
    }
  }

  const coverage: number = windows.length
    ? windows.filter((window: TimeWindow): boolean => window.named).length / windows.length
    : 0;

  return { chords, loose, coverage };
}

/**
 * Share of the clip's length (first start to last end) lying inside a chord.
 * @param chords - The chords.
 * @param notes - All notes in the clip.
 * @returns A fraction from 0 to 1.
 */
export function timelineCoverage(chords: readonly ChordEvent[], notes: readonly NoteEvent[]): number {
  if (!notes.length || !chords.length) {
    return 0;
  }

  const begin: number = minOf(notes.map((note: NoteEvent): number => note.start));
  const stop: number = maxOf(notes.map(noteEnd));

  if (stop <= begin) {
    return 0;
  }

  // Chords can overlap, so merge spans before adding up covered time.
  let covered: number = 0;
  let reach: number = begin;

  for (const chord of [...chords].sort((left: ChordEvent, right: ChordEvent): number => left.start - right.start)) {
    const low: number = Math.max(chord.start, reach, begin);
    const high: number = Math.min(chord.start + chord.duration, stop);

    if (high > low) {
      covered += high - low;
    }

    reach = Math.max(reach, high);
  }

  return covered / (stop - begin);
}

/**
 * Find chord changes hidden by held notes (a common tone stays while other voices move).
 * @param notes - All notes in the clip.
 * @param chords - Chords found so far.
 * @param loose - Notes not yet in a chord.
 * @param minChordNotes - Fewest distinct pitch classes that make a chord.
 * @param tolerance - Largest onset gap, in beats, for notes to count as together.
 * @returns The chords with recovered changes added, and the notes still loose.
 */
export function recoverHeldChanges(
  notes: readonly NoteEvent[],
  chords: readonly ChordEvent[],
  loose: readonly NoteEvent[],
  minChordNotes: number = DEFAULT_MIN_CHORD_NOTES,
  tolerance: number = ONSET_TOLERANCE_BEATS,
): Segmentation {
  let result: ChordEvent[] = [...chords];
  const absorbed: Set<NoteEvent> = new Set<NoteEvent>();
  const index: NoteIndex = indexNotes(notes);

  for (const cluster of clusterByOnset(loose, tolerance)) {
    const moment: number = cluster[0]!.start;
    const sounding: NoteEvent[] = notesBetween(
      index,
      moment + tolerance - index.longest,
      moment + tolerance,
      true,
    ).filter((note: NoteEvent): boolean => noteEnd(note) > moment + tolerance);
    const released: Set<number> = new Set(
      notesBetween(index, moment - tolerance - index.longest, moment - tolerance, false)
        .filter((note: NoteEvent): boolean => Math.abs(noteEnd(note) - moment) <= tolerance)
        .map((note: NoteEvent): number => note.pitchClass),
    );

    if (released.size < MIN_RELEASED_PITCH_CLASSES) {
      continue;
    }

    // Held and new notes together must make a chord with a name.
    const event: ChordEvent = chordFromNotes(
      moment,
      maxOf(cluster.map((note: NoteEvent): number => note.duration)),
      sounding,
    );

    if (event.pitchClasses.length < minChordNotes || !nameChord(event.pitchClasses, bassPitchClass(event)).length) {
      continue;
    }

    for (const note of cluster) {
      absorbed.add(note);
    }

    result = result.map((chord: ChordEvent): ChordEvent =>
      chord.start < moment - tolerance && chord.start + chord.duration > moment + tolerance
        ? chordEvent(chord.start, moment - chord.start, chord.pitchClasses, chord.midiNotes)
        : chord,
    );

    result.push(event);
  }

  result.sort((left: ChordEvent, right: ChordEvent): number => left.start - right.start);

  return { chords: result, loose: loose.filter((note: NoteEvent): boolean => !absorbed.has(note)) };
}

/**
 * Find chords whether played as blocks, arpeggios, strums or over held notes.
 * @param notes - The notes.
 * @param minChordNotes - Fewest distinct pitch classes that make a chord.
 * @param tolerance - Largest onset gap, in beats, for notes to count as together.
 * @returns The chords and the loose notes.
 */
export function detectChords(
  notes: readonly NoteEvent[],
  minChordNotes: number = DEFAULT_MIN_CHORD_NOTES,
  tolerance: number = ONSET_TOLERANCE_BEATS,
): Segmentation {
  const onset: Segmentation = segmentNotes(notes, minChordNotes, tolerance);
  const onsetCoverage: number = timelineCoverage(onset.chords, notes);

  if (onsetCoverage >= MIN_ONSET_COVERAGE) {
    return recoverHeldChanges(notes, onset.chords, onset.loose, minChordNotes, tolerance);
  }

  // A line that moves by step is a melody: no window of it is a chord spelled out.
  if (movesByStep(notes)) {
    return onset;
  }

  // Smallest window where enough windows can be named; otherwise keep the best attempt.
  let best: WindowSegmentation | null = null;

  for (const size of WINDOW_SIZES_BEATS) {
    const attempt: WindowSegmentation = segmentWindows(notes, size, minChordNotes);

    if (attempt.coverage >= WINDOW_COVERAGE_TARGET) {
      return { chords: attempt.chords, loose: attempt.loose };
    }

    if (!best || attempt.coverage > best.coverage) {
      best = attempt;
    }
  }

  if (best && best.chords.length && best.coverage > onsetCoverage) {
    return { chords: best.chords, loose: best.loose };
  }

  return onset;
}
