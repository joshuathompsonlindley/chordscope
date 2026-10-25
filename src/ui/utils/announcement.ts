// What a screen reader is told when a file's result appears.
import { prefersFlats } from "@core/key";
import { type Analysed } from "@core/types";
import { buildBands } from "@ui/utils/chords";
import { keyCardModel, type KeyCardModel, type KeyChoice } from "@ui/utils/keys";

/**
 * A sentence for a screen reader when a file's result appears: what was found, without the visual layout.
 * @param analysed - The analysed file.
 * @returns The announcement.
 */
export function announcement(analysed: Analysed): string {
  const flats: boolean = prefersFlats(analysed.analysis.keys[0]!);
  const card: KeyCardModel = keyCardModel(analysed.analysis, flats);
  const keys: string = card.keys.map((key: KeyChoice): string => key.name).join(" or ");
  const chordCount: number = buildBands(analysed.chords, flats).length;
  const chords: string = chordCount === 1 ? "1 chord" : `${chordCount} chords`;

  return `${card.label}: ${keys}. ${chords} found.`;
}
