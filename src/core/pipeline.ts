// Analyse a part's notes: the one place that decides how notes become chords and a key.
import { PAIR_CHORD_NOTES } from "@core/consts";
import { analyze } from "@core/analyze";
import { readMidi } from "@core/midi";
import { detectChords } from "@core/segment";
import { type Analysed, type MidiFile, type Segmentation } from "@core/types";

/**
 * Analyse a part's notes for chords and a key.
 * @param file - The part, as read from a MIDI file or taken from a DAW clip.
 * @returns The analysed part.
 * @throws When the part holds no notes.
 */
export function analyseNotes(file: MidiFile): Analysed {
  // Triads and up first; only a part with no such chords is read with pairs counting.
  let segmentation: Segmentation = detectChords(file.notes);

  if (!segmentation.chords.length) {
    segmentation = detectChords(file.notes, PAIR_CHORD_NOTES);
  }

  return {
    analysis: analyze(segmentation.chords, segmentation.loose),
    file,
    chords: segmentation.chords,
  };
}

/**
 * Read a MIDI file and analyse its chords and key.
 * @param bytes - The file's bytes.
 * @returns The analysed file.
 * @throws When the bytes are not a readable MIDI file, or hold no notes.
 */
export function analyseMidi(bytes: ArrayBuffer): Analysed {
  return analyseNotes(readMidi(bytes));
}
