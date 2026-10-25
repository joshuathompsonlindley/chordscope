// The result area: the key card and the chord table.
import { keyName, prefersFlats } from "@core/key";
import { type Analysed, type KeyCandidate } from "@core/types";
import { buildBands, chordRows, type Band, type ChordRow } from "@ui/utils/chords";
import { keyCardModel, shownKeys, type KeyCardModel } from "@ui/utils/keys";
import type { JSX } from "preact";
import { useMemo } from "preact/hooks";
import { ChordTable } from "@ui/components/ChordTable";
import { KeyCard } from "@ui/components/KeyCard";

/**
 * The whole result area for one analysed file: the key, then the chords as a table.
 * @param props - The result's props.
 * @param props.analysed - The analysed file.
 * @returns The key card and the chords.
 */
export function Result(props: { analysed: Analysed }): JSX.Element {
  const { analysed }: { analysed: Analysed } = props;
  const flats: boolean = prefersFlats(analysed.analysis.keys[0]!);
  const model: KeyCardModel = useMemo(() => keyCardModel(analysed.analysis, flats), [analysed, flats]);
  const keys: KeyCandidate[] = useMemo(() => shownKeys(analysed.analysis), [analysed]);
  const bands: Band[] = useMemo(() => buildBands(analysed.chords, flats), [analysed, flats]);
  const rows: ChordRow[] = useMemo(() => chordRows(bands, keys, flats), [bands, keys, flats]);

  return (
    <>
      <div class="summary">
        <KeyCard model={model} />
      </div>
      {rows.length > 0 ? (
        <section class="chords-section" aria-label="Chords">
          <ChordTable
            rows={rows}
            keyNames={keys.map((key: KeyCandidate): string => keyName(key, flats)).join(" and ")}
          />
        </section>
      ) : (
        <p class="muted">No chords found in this part.</p>
      )}
    </>
  );
}
