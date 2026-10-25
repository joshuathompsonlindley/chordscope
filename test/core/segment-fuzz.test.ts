// The fast, searching versions of the window and held-note code must agree with the plain scanning versions they replaced.
import { describe, expect, it } from "vitest";
import { DEFAULT_MIN_CHORD_NOTES, ONSET_TOLERANCE_BEATS } from "@core/consts";
import {
  chordFromNotes,
  clusterByOnset,
  indexNotes,
  indexedNotesInWindow,
  recoverHeldChanges,
  segmentNotes,
} from "@core/segment";
import { bassPitchClass, chordEvent, nameChord } from "@core/theory";
import { type ChordEvent, type NoteEvent, type Segmentation } from "@core/types";

/** A small seeded generator, so a failure can be repeated. */
function seeded(seed: number): () => number {
  let state: number = seed;

  return function next(): number {
    state = (state + 0x6d2b79f5) | 0;
    let mixed: number = Math.imul(state ^ (state >>> 15), 1 | state);

    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;

    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

const noteEnd = (note: NoteEvent): number => note.start + note.duration;

/** The original scan over every note for `notesInWindow`. */
function naiveNotesInWindow(notes: readonly NoteEvent[], begin: number, end: number): NoteEvent[] {
  return notes.filter((note) => {
    const startsInside = note.start >= begin && note.start < end;
    const soundsInto = note.start < begin && Math.min(noteEnd(note), end) - begin >= 0.125;

    return startsInside || soundsInto;
  });
}

/** The original `recoverHeldChanges`, scanning every note for each cluster. */
function naiveRecoverHeldChanges(
  notes: readonly NoteEvent[],
  chords: readonly ChordEvent[],
  loose: readonly NoteEvent[],
  minChordNotes: number = DEFAULT_MIN_CHORD_NOTES,
  tolerance: number = ONSET_TOLERANCE_BEATS,
): Segmentation {
  let result: ChordEvent[] = [...chords];
  const absorbed = new Set<NoteEvent>();

  for (const cluster of clusterByOnset(loose, tolerance)) {
    const moment = cluster[0].start;
    const sounding = notes.filter((note) => note.start <= moment + tolerance && noteEnd(note) > moment + tolerance);
    const released = new Set(
      notes
        .filter((note) => note.start < moment - tolerance && Math.abs(noteEnd(note) - moment) <= tolerance)
        .map((note) => note.pitchClass),
    );

    if (released.size < 2) {
      continue;
    }

    const event = chordFromNotes(moment, Math.max(...cluster.map((note) => note.duration)), sounding);

    if (event.pitchClasses.length < minChordNotes || !nameChord(event.pitchClasses, bassPitchClass(event)).length) {
      continue;
    }

    for (const note of cluster) {
      absorbed.add(note);
    }

    result = result.map((chord) =>
      chord.start < moment - tolerance && chord.start + chord.duration > moment + tolerance
        ? chordEvent(chord.start, moment - chord.start, chord.pitchClasses, chord.midiNotes)
        : chord,
    );
    result.push(event);
  }

  result.sort((left, right) => left.start - right.start);

  return { chords: result, loose: loose.filter((note) => !absorbed.has(note)) };
}

/** Random notes: some on a grid so they cluster, some off it, with short and very long lengths mixed. */
function randomNotes(random: () => number, count: number): NoteEvent[] {
  return Array.from({ length: count }, () => {
    const midi = 36 + Math.floor(random() * 48);
    const onGrid = random() < 0.6;
    const start = onGrid ? Math.floor(random() * 32) * 0.5 : random() * 16;
    const duration = random() < 0.1 ? 4 + random() * 12 : 0.05 + random() * 3;

    return { pitchClass: midi % 12, midi, start, duration };
  });
}

const identity = (note: NoteEvent): string => `${note.start}|${note.midi}|${note.duration}`;
const sortedIds = (notes: readonly NoteEvent[]): string[] => notes.map(identity).sort();

describe("indexedNotesInWindow agrees with scanning every note", () => {
  it("on random notes and random windows", () => {
    const random = seeded(7);

    for (let round = 0; round < 150; round++) {
      const notes = randomNotes(random, 5 + Math.floor(random() * 80));
      const size = [0.5, 1, 2, 4, 8][Math.floor(random() * 5)];

      for (let window = 0; window < 12; window++) {
        const begin = Math.floor(random() * 20) * size * 0.5;

        expect(sortedIds(indexedNotesInWindow(indexNotes(notes), begin, begin + size))).toEqual(
          sortedIds(naiveNotesInWindow(notes, begin, begin + size)),
        );
      }
    }
  });
  it("when one very long note could reach any window", () => {
    const notes: NoteEvent[] = [{ pitchClass: 0, midi: 48, start: 0, duration: 100 }, ...randomNotes(seeded(3), 40)];

    for (let begin = 0; begin < 20; begin += 1) {
      expect(sortedIds(indexedNotesInWindow(indexNotes(notes), begin, begin + 2))).toEqual(
        sortedIds(naiveNotesInWindow(notes, begin, begin + 2)),
      );
    }
  });
  it("on notes given out of order", () => {
    const notes = randomNotes(seeded(11), 60).reverse();

    expect(sortedIds(indexedNotesInWindow(indexNotes(notes), 4, 8))).toEqual(
      sortedIds(naiveNotesInWindow(notes, 4, 8)),
    );
  });
  it("on no notes", () => {
    expect(indexedNotesInWindow(indexNotes([]), 0, 4)).toEqual([]);
  });
});

describe("recoverHeldChanges agrees with scanning every note", () => {
  it("on random notes", () => {
    const random = seeded(21);
    let recoveredSomewhere = 0;

    for (let round = 0; round < 120; round++) {
      const notes = randomNotes(random, 10 + Math.floor(random() * 70));
      const { chords, loose } = segmentNotes(notes);
      const fast = recoverHeldChanges(notes, chords, loose);
      const slow = naiveRecoverHeldChanges(notes, chords, loose);

      expect(fast.chords).toEqual(slow.chords);
      expect(sortedIds(fast.loose)).toEqual(sortedIds(slow.loose));

      if (fast.chords.length > chords.length) {
        recoveredSomewhere++;
      }
    }

    // The comparison only means something if recovery actually happened in some of the rounds.
    expect(recoveredSomewhere).toBeGreaterThan(0);
  });
});
