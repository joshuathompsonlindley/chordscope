// The chords as a table: its notes, and how it reads in each candidate key.
import type { ChordRow } from "@ui/utils/chords";
import type { JSX } from "preact";

/**
 * Every chord, in order, with its notes and how it reads in each candidate key. A table too wide for a
 * narrow screen scrolls in its own region, which the keyboard can reach.
 * @param props - The table's props.
 * @param props.rows - The rows.
 * @param props.keyNames - The candidate keys' names, for the last column's heading.
 * @returns The table.
 */
export function ChordTable(props: { rows: ChordRow[]; keyNames: string }): JSX.Element {
  return (
    <div class="table-wrap" role="region" aria-label="Chord table" tabIndex={0}>
      <table class="chords">
        <caption class="sr-only">Chords in order</caption>
        <thead>
          <tr>
            <th scope="col">Chord</th>
            <th scope="col">Notes</th>
            <th scope="col">{`In ${props.keyNames}`}</th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row: ChordRow): JSX.Element => (
            <tr>
              <th scope="row">{row.label}</th>
              <td>{row.notes}</td>
              <td>
                {row.readings.map((reading: string): JSX.Element => (
                  <div>{reading}</div>
                ))}
                {row.remark ? <div class="muted">{row.remark}</div> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
