// Note-name parsing for test fixtures: `F#4`, `Bb3` or `E` (no octave). C4 is MIDI 60.
import { mod } from "@core/utils/math";

/** A parsed note name. */
export interface NoteName {
  pitchClass: number;
  /** MIDI note number; null when the name has no octave. */
  midi: number | null;
}

const NATURAL_PITCH_CLASSES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NOTE_PATTERN: RegExp = /^([A-Ga-g])([#b♯♭]*)(-?\d+)?$/;

/**
 * Parse a note name.
 * @param text - The note name.
 * @returns The pitch class and MIDI number (null without an octave).
 * @throws When the name is not recognised or falls outside MIDI range.
 */
export function parseNote(text: string): NoteName {
  const match: RegExpExecArray | null = NOTE_PATTERN.exec(text.trim());

  if (!match) {
    throw new Error(`Unrecognised note name: '${text}'`);
  }

  const [, letter, accidentals, octaveText]: string[] = match;
  let offset: number = 0;

  for (const accidental of accidentals) {
    offset += accidental === "#" || accidental === "♯" ? 1 : -1;
  }

  const semitone: number = NATURAL_PITCH_CLASSES[letter.toUpperCase()] + offset;

  if (octaveText === undefined) {
    return { pitchClass: mod(semitone), midi: null };
  }

  const midi: number = 12 * (parseInt(octaveText, 10) + 1) + semitone;

  if (midi < 0 || midi > 127) {
    throw new Error(`Note out of MIDI range: '${text}'`);
  }

  return { pitchClass: mod(semitone), midi };
}
