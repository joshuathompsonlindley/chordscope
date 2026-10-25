// Standard MIDI file reader (PPQ time division only), built on the `midi-file` event parser.
import { parseMidi as parseEvents, type MidiEvent } from "midi-file";
import { MIN_NOTE_BEATS } from "@core/consts";
import { type MidiFile, type MidiNote, type OpenNote, type TrackResult } from "@core/types";

/**
 * Keep the header and the track chunks the header promises, dropping any other chunk, as the MIDI spec asks readers to.
 * Also checks them: midi-file throws bare strings and reads past the end of truncated data without complaint.
 * @param data - The file bytes.
 * @param trackCount - Number of track chunks the header promises.
 * @param headerLength - Length of the header chunk body.
 * @returns The bytes of a file with just the header and its tracks.
 * @throws When a track chunk is missing or the data is truncated.
 */
function keepTrackChunks(data: Uint8Array, trackCount: number, headerLength: number): Uint8Array {
  const view: DataView = new DataView(data.buffer, data.byteOffset, data.byteLength);

  /**
   * Read a four-character chunk tag.
   * @param at - Byte offset.
   * @returns The tag text.
   */
  function tag(at: number): string {
    return String.fromCharCode(...data.subarray(at, at + 4));
  }

  const kept: Uint8Array[] = [data.subarray(0, 8 + headerLength)];
  let position: number = 8 + headerLength;

  while (kept.length <= trackCount) {
    if (position + 8 > data.length) {
      throw new Error("Missing or damaged track chunk");
    }

    const end: number = position + 8 + view.getUint32(position + 4);

    if (end > data.length) {
      throw new Error("Truncated MIDI data");
    }

    if (tag(position) === "MTrk") {
      kept.push(data.subarray(position, end));
    }

    position = end;
  }

  const result: Uint8Array = new Uint8Array(
    kept.reduce((total: number, chunk: Uint8Array): number => total + chunk.length, 0),
  );
  let offset: number = 0;

  for (const chunk of kept) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

/**
 * Key for an open note: one number per channel and pitch.
 * @param channel - Zero-based channel.
 * @param pitch - MIDI note number.
 * @returns The key.
 */
function openNoteKey(channel: number, pitch: number): number {
  return channel * 128 + pitch;
}

/**
 * Read one track chunk's events into notes. Every channel counts: a file is one part exported
 * from a DAW.
 * @param events - The track's parsed events.
 * @param division - Ticks per quarter note.
 * @returns The track's contribution to the file.
 * @throws When a note event is cut short.
 */
function readTrack(events: MidiEvent[], division: number): TrackResult {
  const notes: MidiNote[] = [];
  const active: Map<number, OpenNote[]> = new Map<number, OpenNote[]>();
  let tick: number = 0;

  /**
   * End a held note.
   * @param key - The note's channel-and-pitch key.
   * @param endTick - Tick where the note ends.
   */
  function close(key: number, endTick: number): void {
    const open: OpenNote | undefined = active.get(key)?.shift();

    if (!open) {
      return;
    }

    const pitch: number = key % 128;

    notes.push({
      pitchClass: pitch % 12,
      midi: pitch,
      start: open.tick / division,
      duration: Math.max((endTick - open.tick) / division, MIN_NOTE_BEATS),
    });
  }

  for (const event of events) {
    tick += event.deltaTime;

    if (event.type === "noteOn" || event.type === "noteOff") {
      // midi-file returns a bare event (no note number) when a message is cut short.
      if (event.noteNumber === undefined || event.velocity === undefined) {
        throw new Error("Truncated MIDI data");
      }

      const key: number = openNoteKey(event.channel, event.noteNumber);

      if (event.type === "noteOff") {
        close(key, tick);
        continue;
      }

      const list: OpenNote[] | undefined = active.get(key);

      if (list) {
        list.push({ tick });
      } else {
        active.set(key, [{ tick }]);
      }
    }
  }

  // Notes with no note-off end with the track.
  for (const [key, list] of active) {
    while (list.length > 0) {
      close(key, tick);
    }
  }

  return { notes };
}

/**
 * Read the notes of a standard MIDI file.
 * @param buffer - The file bytes.
 * @returns The notes.
 * @throws When the data is not a readable PPQ MIDI file.
 */
export function readMidi(buffer: ArrayBuffer | Uint8Array): MidiFile {
  const data: Uint8Array = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  if (data.length < 14 || String.fromCharCode(...data.subarray(0, 4)) !== "MThd") {
    throw new Error("Not a MIDI file");
  }

  const view: DataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const division: number = view.getUint16(12);

  if (division & 0x8000) {
    throw new Error("SMPTE time division is not supported");
  }

  if (division === 0) {
    throw new Error("Invalid time division");
  }

  const tracksOnly: Uint8Array = keepTrackChunks(data, view.getUint16(10), view.getUint32(4));
  let parsed: ReturnType<typeof parseEvents>;

  try {
    parsed = parseEvents(tracksOnly);
  } catch (error: unknown) {
    throw new Error(typeof error === "string" ? error : error instanceof Error ? error.message : "Invalid MIDI data", {
      cause: error,
    });
  }

  const notes: MidiNote[] = [];

  parsed.tracks.forEach((events: MidiEvent[]): void => {
    const track: TrackResult = readTrack(events, division);

    track.notes.forEach((note: MidiNote): void => {
      notes.push(note);
    });
  });

  notes.sort((left: MidiNote, right: MidiNote): number => left.start - right.start || left.midi - right.midi);

  return { notes };
}
