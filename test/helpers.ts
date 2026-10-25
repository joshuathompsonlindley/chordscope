// Test helpers: MIDI byte builders and chord-text parsing (ported from the Python tests / CLI).
import { readFileSync } from "node:fs";
import { analyze } from "@core/analyze";
import { readMidi } from "@core/midi";
import { bassPitchClass, chordEvent, identifyChord } from "@core/theory";
import { type ChordEvent, type ChordMatch, type ChordReport, type MidiNote, type NoteEvent } from "@core/types";
import { parseNote } from "@test/notes";

export const LOOP_CHORDS = ["E2 G3 B3 D4 F#4", "F#2 A3 C#4 E4*2", "B2 A3 C#4 D#4"];
export const USER_CLIP = ["Gb2 Ab3 Db4 F4 Ab4", "Bb2 F3 Db4 Ab4", "Db2 Db3 F3 Ab3 Db4", "Eb2 Eb3 Db4 F4"];

export function vlq(value: number): number[] {
  const groups = [value & 0x7f];
  value = Math.floor(value / 128);
  while (value) {
    groups.push((value & 0x7f) | 0x80);
    value = Math.floor(value / 128);
  }
  return groups.reverse();
}
export const noteOn = (channel: number, pitch: number, velocity = 100): number[] => [0x90 | channel, pitch, velocity];
export const noteOff = (channel: number, pitch: number): number[] => [0x80 | channel, pitch, 0];

const u32 = (n: number): number[] => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16 = (n: number): number[] => [(n >>> 8) & 255, n & 255];
const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));

export function buildTrack(events: [number, number[]][]): number[] {
  const body = [...events.flatMap(([delta, payload]) => [...vlq(delta), ...payload]), ...vlq(0), 0xff, 0x2f, 0x00];
  return [...ascii("MTrk"), ...u32(body.length), ...body];
}
export function buildFile(tracks: number[][], division = 480): Uint8Array {
  return Uint8Array.from([
    ...ascii("MThd"),
    ...u32(6),
    ...u16(1),
    ...u16(tracks.length),
    ...u16(division),
    ...tracks.flat(),
  ]);
}
/** Block chords one after another: [midi pitches, beats] pairs. */
export function chordClip(chords: [number[], number][], channel = 0): number[] {
  const events: [number, number[]][] = [];
  for (const [pitches, beats] of chords) {
    for (const p of pitches) events.push([0, noteOn(channel, p)]);
    events.push([beats * 480, noteOff(channel, pitches[0])]);
    for (const p of pitches.slice(1)) events.push([0, noteOff(channel, p)]);
  }
  return buildTrack(events);
}

export function chordEventFromNames(names: string[], start = 0, duration = 1): ChordEvent {
  if (!names.length) throw new Error("A chord needs at least one note");
  const parsed = names.map(parseNote);
  const pcs = [...new Set(parsed.map((n) => n.pitchClass))].sort((a, b) => a - b);
  let midi = parsed
    .filter((n) => n.midi !== null)
    .map((n) => n.midi as number)
    .sort((a, b) => a - b);
  if (midi.length !== parsed.length) midi = [];
  return chordEvent(start, duration, pcs, midi);
}

/** "F#2 A3 C#4 E4*2" -> chord with duration 2. Separators: whitespace, commas, slashes. */
export function parseChordArgument(text: string, start = 0): ChordEvent {
  const star = text.lastIndexOf("*");
  const body = star < 0 ? text : text.slice(0, star);
  const lengthText = star < 0 ? "1" : text.slice(star + 1);
  const duration = Number(lengthText.trim());
  if (lengthText.trim() === "" || Number.isNaN(duration)) throw new Error(`Bad chord length in '${text}'`);
  if (duration <= 0) throw new Error(`Chord length must be positive in '${text}'`);
  return chordEventFromNames(
    body
      .trim()
      .split(/[\s,/]+/)
      .filter(Boolean),
    start,
    duration,
  );
}

export function notesFromArguments(texts: string[]): NoteEvent[] {
  return texts
    .flatMap((t) => t.trim().split(/[\s,]+/))
    .filter(Boolean)
    .map((name) => {
      const p = parseNote(name);
      return { pitchClass: p.pitchClass, midi: p.midi, start: 0, duration: 1 };
    });
}

export function reportFor(names: string, start = 0): ChordReport {
  const event = parseChordArgument(names, start);
  return { event, matches: identifyChord(event.pitchClasses, bassPitchClass(event)) };
}
export function bestMatch(names: string): ChordMatch {
  const best = reportFor(names).matches[0];
  if (!best) throw new Error(names);
  return best;
}

/** Chords laid end to end from chord argument strings, as the Python CLI did. */
export function chordsFromArguments(texts: string[]): ChordEvent[] {
  const out: ChordEvent[] = [];
  let start = 0;
  for (const t of texts) {
    const c = parseChordArgument(t, start);
    out.push(c);
    start += c.duration;
  }
  return out;
}
export const analyzeChords = (texts: string[]) => analyze(chordsFromArguments(texts), []);

/** Just the notes of a MIDI file. */
export const parseMidi = (buffer: ArrayBuffer | Uint8Array): MidiNote[] => readMidi(buffer).notes;

/** Bytes of a clip in test/clips, in their own buffer so `.buffer` is exactly the file. */
export const readClip = (name: string): Uint8Array => new Uint8Array(readFileSync(`test/clips/${name}`));
