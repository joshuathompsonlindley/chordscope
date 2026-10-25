import { describe, expect, it } from "vitest";
import { MIN_NOTE_BEATS } from "@core/consts";
import { readMidi } from "@core/midi";
import { segmentNotes } from "@core/segment";
import { bassPitchClass } from "@core/theory";
import { type NoteEvent } from "@core/types";
import { buildFile, buildTrack, noteOff, noteOn, parseMidi } from "@test/helpers";

const note = (midi: number, start: number, duration = 1): NoteEvent => ({
  pitchClass: midi % 12,
  midi,
  start,
  duration,
});
const midis = (notes: NoteEvent[]) => notes.map((n) => n.midi);

describe("segmentNotes", () => {
  it("simultaneous notes become a chord, a lone later note stays loose", () => {
    const { chords, loose } = segmentNotes([note(48, 0, 2), note(52, 0, 4), note(55, 0), note(72, 1)]);
    expect(chords).toHaveLength(1);
    expect(chords[0].pitchClasses).toEqual([0, 4, 7]);
    expect(chords[0].midiNotes).toEqual([48, 52, 55]);
    expect(chords[0].duration).toBe(4);
    expect(midis(loose)).toEqual([72]);
  });
  it("onset tolerance", () => {
    expect(segmentNotes([note(48, 0), note(52, 0.05), note(55, 0.06)]).chords).toHaveLength(1);
    expect(segmentNotes([note(48, 0), note(52, 0.5), note(55, 1)]).chords).toEqual([]);
  });
  it("minimum chord size", () => {
    const notes = [note(48, 0), note(55, 0)];
    expect(segmentNotes(notes).chords).toEqual([]);
    expect(segmentNotes(notes, 2).chords).toHaveLength(1);
  });
  it("octave doublings do not make a chord", () => {
    expect(segmentNotes([note(48, 0), note(60, 0), note(72, 0)]).chords).toEqual([]);
  });
  it("unknown octaves leave the bass unknown", () => {
    const { chords } = segmentNotes([
      { pitchClass: 0, midi: null, start: 0, duration: 1 },
      { pitchClass: 4, midi: 52, start: 0, duration: 1 },
      { pitchClass: 7, midi: 55, start: 0, duration: 1 },
    ]);
    expect(bassPitchClass(chords[0])).toBeNull();
  });
  it("chords come out in time order", () => {
    const notes = [note(55, 4), note(48, 4), note(52, 4), note(55, 0), note(48, 0), note(52, 0)];
    expect(segmentNotes(notes).chords.map((c) => c.start)).toEqual([0, 4]);
  });
});

describe("parseMidi", () => {
  const file = (events: [number, number[]][]) => buildFile([buildTrack(events)]);

  it("single note", () => {
    expect(
      parseMidi(
        file([
          [0, noteOn(0, 60)],
          [480, noteOff(0, 60)],
        ]),
      ),
    ).toEqual([{ pitchClass: 0, midi: 60, start: 0, duration: 1 }]);
  });
  it("running status", () => {
    const notes = parseMidi(
      file([
        [0, noteOn(0, 60)],
        [0, [64, 100]],
        [480, noteOff(0, 60)],
        [0, [64, 0]],
      ]),
    );
    expect(notes.map((n) => [n.midi, n.duration])).toEqual([
      [60, 1],
      [64, 1],
    ]);
  });
  it("velocity-0 note-on ends a note", () => {
    expect(
      parseMidi(
        file([
          [0, noteOn(0, 60)],
          [240, noteOn(0, 60, 0)],
        ]),
      )[0].duration,
    ).toBe(0.5);
  });
  it("meta, sysex and other messages are skipped", () => {
    const events: [number, number[]][] = [
      [0, [0xff, 0x51, 0x03, 0x07, 0xa1, 0x20]],
      [0, [0xf0, 0x03, 0x7e, 0x00, 0xf7]],
      [0, [0xc0, 5]],
      [0, [0xb0, 7, 100]],
      [0, noteOn(0, 62)],
      [480, noteOff(0, 62)],
    ];
    expect(parseMidi(file(events))).toMatchObject([{ pitchClass: 2, midi: 62, start: 0, duration: 1 }]);
  });
  it("unfinished note ends with the track", () => {
    expect(
      parseMidi(
        file([
          [0, noteOn(0, 60)],
          [960, [0xb0, 7, 100]],
        ]),
      )[0].duration,
    ).toBe(2);
  });
  it("reads every channel, since a file is one part exported from a DAW", () => {
    const data = file([
      [0, noteOn(0, 60)],
      [0, noteOn(1, 64)],
      [480, noteOff(0, 60)],
      [0, noteOff(1, 64)],
    ]);
    expect(midis(parseMidi(data))).toEqual([60, 64]);
  });
  it("reads the drum channel too, since a drum-kit export sits on channel 10", () => {
    const data = file([
      [0, noteOn(0, 60)],
      [0, noteOn(9, 36)],
      [480, noteOff(0, 60)],
      [0, noteOff(9, 36)],
    ]);
    expect(midis(parseMidi(data))).toEqual([36, 60]);
  });
  it("tracks are merged in time order", () => {
    const late = buildTrack([
      [480, noteOn(0, 64)],
      [480, noteOff(0, 64)],
    ]);
    const early = buildTrack([
      [0, noteOn(0, 60)],
      [480, noteOff(0, 60)],
    ]);
    expect(midis(parseMidi(buildFile([late, early])))).toEqual([60, 64]);
  });
  it("time division scales beats", () => {
    const n = parseMidi(
      buildFile(
        [
          buildTrack([
            [96, noteOn(0, 60)],
            [192, noteOff(0, 60)],
          ]),
        ],
        96,
      ),
    )[0];
    expect([n.start, n.duration]).toEqual([1, 2]);
  });
  it("rejects bad files", () => {
    const good = buildFile([
      buildTrack([
        [0, noteOn(0, 60)],
        [480, noteOff(0, 60)],
      ]),
    ]);
    // Header for one 480-tick track, then a track chunk that claims 2 bytes: a delta and half a note-on.
    const truncatedMessage = Uint8Array.of(
      ...[0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, 1, 1, 0xe0],
      ...[0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 2, 0x00, 0x90],
    );
    const bad: Record<string, Uint8Array> = {
      "not midi": new TextEncoder().encode("RIFF0000WAVEfmt "),
      empty: new Uint8Array(),
      smpte: buildFile([], 0xe728),
      "zero division": buildFile([], 0),
      "truncated track": good.slice(0, -6),
      "missing track": good.slice(0, 14),
      "data byte first": file([[0, [60, 100]]]),
      "truncated message": truncatedMessage,
    };
    for (const [label, data] of Object.entries(bad)) expect(() => parseMidi(data), label).toThrow();
  });
});

describe("readMidi per-track reading", () => {
  const ticks = (beats: number) => beats * 480;

  it("pairs overlapping same-pitch notes first in, first out", () => {
    const track = buildTrack([
      [0, noteOn(0, 60, 40)],
      [ticks(1), noteOn(0, 60, 90)],
      [ticks(1), noteOff(0, 60)],
      [ticks(1), noteOff(0, 60)],
    ]);
    const { notes } = readMidi(buildFile([track]));
    expect(notes.map((n) => [n.start, n.duration])).toEqual([
      [0, 2],
      [1, 2],
    ]);
  });
  it("keeps the same pitch on two channels apart", () => {
    const track = buildTrack([
      [0, noteOn(0, 60)],
      [ticks(1), noteOn(1, 60)],
      [ticks(1), noteOff(1, 60)],
      [ticks(1), noteOff(0, 60)],
    ]);
    const { notes } = readMidi(buildFile([track]));
    // Channel 0 holds the note from 0 to 3, channel 1 from 1 to 2; a key that ignored the channel would pair them wrongly.
    expect(notes.map((n) => [n.start, n.duration])).toEqual([
      [0, 3],
      [1, 1],
    ]);
  });
  it("keeps the same pitch on two tracks apart", () => {
    const first = buildTrack([
      [0, noteOn(0, 60)],
      [ticks(1), noteOff(0, 60)],
    ]);
    const second = buildTrack([
      [ticks(1), noteOn(0, 60)],
      [ticks(2), noteOff(0, 60)],
    ]);
    const { notes } = readMidi(buildFile([first, second]));
    expect(notes.map((n) => [n.start, n.duration])).toEqual([
      [0, 1],
      [1, 2],
    ]);
  });
  it("ends every unfinished note at its own track's end, on any channel and pitch", () => {
    const track = buildTrack([
      [0, noteOn(0, 60)],
      [0, noteOn(0, 60)],
      [0, noteOn(3, 72)],
      [ticks(4), [0xb0, 7, 100]],
    ]);
    const { notes } = readMidi(buildFile([track]));
    expect(notes.map((n) => [n.midi, n.duration])).toEqual([
      [60, 4],
      [60, 4],
      [72, 4],
    ]);
  });
  it("ignores a note-off with no matching note-on", () => {
    expect(readMidi(buildFile([buildTrack([[0, noteOff(0, 60)]])])).notes).toEqual([]);
  });
  it("reads a track with more notes than fit in one function call's arguments", () => {
    const count = 150_000;
    const events: [number, number[]][] = [];
    for (let i = 0; i < count; i++) {
      events.push([0, noteOn(0, 60 + (i % 12))], [1, noteOff(0, 60 + (i % 12))]);
    }
    expect(readMidi(buildFile([buildTrack(events)])).notes).toHaveLength(count);
  });
  it("rejects a note event cut short by the end of the file", () => {
    const track = buildTrack([[0, noteOn(0, 60)]]).slice(0, -4);
    const bytes = Uint8Array.from([...buildFile([track])]);
    expect(() => readMidi(bytes)).toThrow();
  });
});

describe("zero-length notes", () => {
  it("get a minimum length, so a note-off on the note-on's tick still counts", () => {
    const track = buildTrack([
      [0, noteOn(0, 60)],
      [0, noteOff(0, 60)],
      [480, [0xb0, 7, 100]],
    ]);

    expect(readMidi(buildFile([track])).notes[0].duration).toBe(MIN_NOTE_BEATS);
  });
  it("leave longer notes as they were", () => {
    const track = buildTrack([
      [0, noteOn(0, 60)],
      [480, noteOff(0, 60)],
    ]);

    expect(readMidi(buildFile([track])).notes[0].duration).toBe(1);
  });
  it("give a note shorter than the minimum the minimum", () => {
    const track = buildTrack([
      [0, noteOn(0, 60)],
      [1, noteOff(0, 60)],
    ]);

    expect(readMidi(buildFile([track])).notes[0].duration).toBe(MIN_NOTE_BEATS);
  });
});

describe("unknown chunks", () => {
  const u32 = (value: number): number[] => [
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ];
  const ascii = (text: string): number[] => [...text].map((letter) => letter.charCodeAt(0));
  const chunk = (tag: string, body: number[]): number[] => [...ascii(tag), ...u32(body.length), ...body];
  const header = (trackCount: number): number[] => [...ascii("MThd"), ...u32(6), 0, 1, 0, trackCount, 0x01, 0xe0];
  const trackBytes = (pitch: number): number[] =>
    buildTrack([
      [0, noteOn(0, pitch)],
      [480, noteOff(0, pitch)],
    ]);
  const read = (bytes: number[]) => readMidi(Uint8Array.from(bytes));

  it("skips a chunk of another kind between tracks", () => {
    const notes = read([...header(2), ...trackBytes(60), ...chunk("XFIH", [1, 2, 3]), ...trackBytes(64)]).notes;

    expect(notes.map((note) => note.midi)).toEqual([60, 64]);
  });
  it("skips a chunk before the first track and after the last", () => {
    const notes = read([...header(1), ...chunk("JUNK", [9, 9]), ...trackBytes(62), ...chunk("TAIL", [])]).notes;

    expect(notes.map((note) => note.midi)).toEqual([62]);
  });
  it("skips several unknown chunks in a row", () => {
    expect(read([...header(1), ...chunk("AAAA", [1]), ...chunk("BBBB", [2, 3]), ...trackBytes(60)]).notes).toHaveLength(
      1,
    );
  });
  it("still needs every track the header promises", () => {
    expect(() => read([...header(2), ...chunk("JUNK", [1]), ...trackBytes(60)])).toThrow(
      "Missing or damaged track chunk",
    );
  });
  it("still reports a truncated chunk, whatever its kind", () => {
    expect(() => read([...header(1), ...ascii("JUNK"), ...u32(100), 1, 2])).toThrow("Truncated MIDI data");
    expect(() => read([...header(1), ...trackBytes(60).slice(0, -3)])).toThrow("Truncated MIDI data");
  });
  it("reads the same notes with or without the extra chunks", () => {
    const plain = read([...header(2), ...trackBytes(60), ...trackBytes(64)]);
    const padded = read([
      ...header(2),
      ...chunk("XFIH", [5]),
      ...trackBytes(60),
      ...chunk("XFIH", [6, 7]),
      ...trackBytes(64),
    ]);

    expect(padded).toEqual(plain);
  });
});
