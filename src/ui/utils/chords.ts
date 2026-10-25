// The chords of a part as plain data: grouped into bands and read in each candidate key.
import { MAX_ALTERNATIVE_READINGS } from "@core/consts";
import { keyName, readInKey } from "@core/key";
import { bassPitchClass, formatChord, midiNoteName, nameChord, pitchClassName, sameHarmony } from "@core/theory";
import { type ChordEvent, type ChordInKey, type ChordMatch, type KeyCandidate } from "@core/types";

/** A run of re-struck hits of one chord. */
export interface Band {
  chord: ChordEvent;
  /** Every reading, best first; empty when no chord fits. */
  matches: ChordMatch[];
  match: ChordMatch | undefined;
  label: string;
}

/** One chord of the part, as a row of the chord table. */
export interface ChordRow {
  /** The chord's name, or `?` when nothing fits. */
  label: string;
  /** The notes as voiced. */
  notes: string;
  /** How the chord reads in each candidate key, or empty when no chord fits. */
  readings: string[];
  /** What else to know: the other names the chord could have, or why it has no standard name. Null when nothing. */
  remark: string | null;
}

/**
 * Group re-struck hits of one chord into bands and name each band.
 * @param chords - Detected chords in time order.
 * @param flats - Spell black keys with flats.
 * @returns The bands.
 */
export function buildBands(chords: readonly ChordEvent[], flats: boolean): Band[] {
  const bands: Band[] = [];

  for (const chord of chords) {
    const previous: Band | undefined = bands[bands.length - 1];

    if (previous && sameHarmony(previous.chord, chord)) {
      continue;
    }

    const matches: ChordMatch[] = nameChord(chord.pitchClasses, bassPitchClass(chord));
    const match: ChordMatch | undefined = matches[0];

    bands.push({ chord, matches, match, label: match ? formatChord(match, flats) : "?" });
  }

  return bands;
}

/**
 * The notes of a band's chord as voiced, lowest first, or by pitch class when octaves are unknown.
 * @param band - The band.
 * @param flats - Spell black keys with flats.
 * @returns The note names, separated by spaces.
 */
function voicingOf(band: Band, flats: boolean): string {
  const names: string[] = band.chord.midiNotes.length
    ? [...new Set(band.chord.midiNotes)].map((midi: number): string => midiNoteName(midi, flats))
    : band.chord.pitchClasses.map((pitchClass: number): string => pitchClassName(pitchClass, flats));

  return names.join(" ");
}

/**
 * How a chord reads in each candidate key: its roman numeral, and any notes outside the key.
 * @param match - The chord reading.
 * @param keys - The candidate keys.
 * @param flats - Spell black keys with flats.
 * @returns One line per key, such as `C major: V7` or `F# minor: vii9 · outside G`.
 */
export function chordInKeys(match: ChordMatch, keys: readonly KeyCandidate[], flats: boolean): string[] {
  return keys.map((key: KeyCandidate): string => {
    const reading: ChordInKey = readInKey(match, key);
    const outside: string =
      reading.outside.length > 0
        ? ` · outside ${reading.outside.map((pitchClass: number): string => pitchClassName(pitchClass, flats)).join(", ")}`
        : "";

    return `${keyName(key, flats)}: ${reading.numeral}${outside}`;
  });
}

/**
 * What else a reader should know about a chord's name.
 * @param band - The band.
 * @param flats - Spell black keys with flats.
 * @returns The other names it could have, or why it has no standard name, or null when there is nothing to add.
 */
function remarkOn(band: Band, flats: boolean): string | null {
  if (!band.match) {
    return "No standard chord matches";
  }

  if (band.match.approximate) {
    return "Named from its intervals; not a standard chord shape";
  }

  const alternatives: string[] = band.matches
    .slice(1, 1 + MAX_ALTERNATIVE_READINGS)
    .map((match: ChordMatch): string => formatChord(match, flats));

  return alternatives.length > 0 ? `Also reads as ${alternatives.join(", ")}` : null;
}

/**
 * The chords as rows of text, in time order.
 * @param bands - The chord bands.
 * @param keys - The candidate keys.
 * @param flats - Spell black keys with flats.
 * @returns One row per band.
 */
export function chordRows(bands: readonly Band[], keys: readonly KeyCandidate[], flats: boolean): ChordRow[] {
  return bands.map((band: Band): ChordRow => ({
    label: band.label,
    notes: voicingOf(band, flats),
    readings: band.match ? chordInKeys(band.match, keys, flats) : [],
    remark: remarkOn(band, flats),
  }));
}
