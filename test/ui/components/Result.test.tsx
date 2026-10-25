import { analyseMidi } from "@core/pipeline";
import { type Analysed } from "@core/types";
import { Result } from "@ui/components/Result";
import { buildFile, buildTrack, readClip, chordClip, noteOff, noteOn } from "@test/helpers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mount, settle } from "@test/ui/support";

/** Analyse a clip the way the page does. */
function analyseBytes(bytes: Uint8Array): Analysed {
  return analyseMidi(bytes.slice().buffer as ArrayBuffer);
}

/** Render a result and return the elements it makes. */
async function renderNodes(analysed: Analysed): Promise<HTMLElement[]> {
  const container: HTMLElement = await mount(<Result analysed={analysed} />);

  return [...container.children] as HTMLElement[];
}

const progression = (chords: [number[], number][]): Analysed => analyseBytes(buildFile([chordClip(chords)]));
const GMAJ7_TO_C: [number[], number][] = [
  [[43, 47, 50, 53], 4],
  [[48, 52, 55], 4],
];
/** A real clip whose key is a close call: Bb minor and its relative Db major fit almost equally. */
const closeCall = (): Analysed => analyseBytes(readClip("prog.mid"));
const kindOf = (node: HTMLElement): string => node.className || node.tagName.toLowerCase();
const cells = (row: Element): (string | null)[] => [...row.children].map((cell) => cell.textContent);

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("Result with a clear key", () => {
  let nodes: HTMLElement[];

  beforeAll(async () => {
    nodes = await renderNodes(progression(GMAJ7_TO_C));
  });

  it("gives the key, then the chords", () => {
    expect(nodes.map(kindOf)).toEqual(["summary", "chords-section"]);
  });
  it("names the key large, and says where it came from", () => {
    expect(nodes[0]!.querySelector(".label")!.textContent).toBe("Key, from the chords");
    expect(nodes[0]!.querySelector(".key")!.textContent).toBe("C major");
    expect(nodes[0]!.querySelector(".note")).toBeNull();
  });
  it("puts the confidence in a hover tip on the key", () => {
    const key = nodes[0]!.querySelector(".key.has-tip") as HTMLElement;

    expect(key.getAttribute("data-tip")).toMatch(/^(High|Medium|Low) confidence · \d+%\n/);
    expect(key.tabIndex).toBe(0);
  });
  it("has no cross-check, key table, cues, chips, chart, clip badges or roll", () => {
    const text = nodes.map((node) => node.outerHTML).join("");

    expect(text).not.toMatch(
      /cross-check|class="chip|class="profile|class="fact|Harmonic cues|class="cues"|<canvas|roll/,
    );
  });
});

describe("the chord table", () => {
  it("has a row for every chord, in time order, with its notes and its readings", async () => {
    const [, section] = await renderNodes(progression(GMAJ7_TO_C));
    const rows = [...section!.querySelectorAll("table tbody tr")].map(cells);

    expect(rows).toEqual([
      ["G7", "G2 B2 D3 F3", "C major: V7"],
      ["C", "C3 E3 G3", "C major: I"],
    ]);
  });
  it("is on the page, not hidden behind a disclosure", async () => {
    const [, section] = await renderNodes(progression(GMAJ7_TO_C));

    expect(section!.querySelector("details")).toBeNull();
    expect(section!.querySelector("table")).not.toBeNull();
  });
  it("heads its columns, with the candidate keys named in the last", async () => {
    const [, section] = await renderNodes(closeCall());
    const heads = [...section!.querySelectorAll("thead th")].map((cell) => [
      cell.textContent,
      cell.getAttribute("scope"),
    ]);

    expect(heads).toEqual([
      ["Chord", "col"],
      ["Notes", "col"],
      ["In Bb minor and Db major", "col"],
    ]);
  });
  it("scrolls on its own, as a focusable named region, when the screen is too narrow for it", async () => {
    const [, section] = await renderNodes(progression(GMAJ7_TO_C));
    const wrap = section!.querySelector(".table-wrap") as HTMLElement;

    expect(wrap.getAttribute("role")).toBe("region");
    expect(wrap.getAttribute("aria-label")).toBe("Chord table");
    expect(wrap.tabIndex).toBe(0);
  });
  it("names the table, for screen readers that list tables", async () => {
    const [, section] = await renderNodes(progression(GMAJ7_TO_C));

    expect(section!.querySelector("caption")!.textContent).toBe("Chords in order");
  });
  it("makes the chord name a row header, so a screen reader announces it with each cell", async () => {
    const [, section] = await renderNodes(progression(GMAJ7_TO_C));

    expect(section!.querySelector("tbody th")!.getAttribute("scope")).toBe("row");
  });
  it("puts each key's reading on its own line", async () => {
    const [, section] = await renderNodes(closeCall());
    const last = section!.querySelector("tbody tr")!.lastElementChild!;

    expect([...last.querySelectorAll("div")].map((line) => line.textContent).slice(0, 2)).toEqual([
      "Bb minor: III6/9",
      "Db major: I6/9",
    ]);
  });
  it("adds a muted remark on other names for a chord", async () => {
    const [, section] = await renderNodes(closeCall());
    const remark = section!.querySelector("tbody tr")!.lastElementChild!.querySelector(".muted")!;

    expect(remark.textContent).toBe("Also reads as Eb9sus4/Db, Bbm11/Db");
  });
  it("says why a chord has no standard name", async () => {
    const [, section] = await renderNodes(progression([[[48, 49, 50], 4]]));

    expect(cells(section!.querySelector("tbody tr")!)).toEqual(["?", "C3 Db3 D3", "No standard chord matches"]);
  });
  it("marks notes outside the key", async () => {
    const chromatic = progression([
      [[48, 52, 55], 4],
      [[53, 57, 60], 4],
      [[55, 59, 62], 4],
      [[48, 52, 55], 4],
      [[50, 54, 57], 4],
    ]);
    const [, section] = await renderNodes(chromatic);

    expect(section!.textContent).toContain("outside F#");
  });
  it("spells black keys with flats for a flat key", async () => {
    const flat = progression([
      [[49, 53, 56], 4],
      [[54, 58, 61], 4],
      [[56, 60, 63], 4],
      [[49, 53, 56], 4],
    ]);
    const [summary, section] = await renderNodes(flat);

    expect(summary!.querySelector(".key")!.textContent).toBe("Db major");
    expect([...section!.querySelectorAll("tbody th")].map((cell) => cell.textContent)).toEqual([
      "Db",
      "Gb",
      "Ab",
      "Db",
    ]);
  });
});

describe("the chords section", () => {
  it("is a labelled region", async () => {
    const [, section] = await renderNodes(progression(GMAJ7_TO_C));

    expect(section!.getAttribute("aria-label")).toBe("Chords");
  });
});

describe("a close call", () => {
  it("lists every candidate, warns, and tips each one with its share", async () => {
    const nodes = await renderNodes(closeCall());

    expect(nodes[0]!.querySelector(".label")!.textContent).toBe("Close call, from the chords");
    expect(nodes[0]!.querySelector(".note")!.textContent).toBe("The music alone does not settle which note is home.");
    expect(nodes[0]!.querySelectorAll(".key").length).toBeGreaterThan(1);
    expect(
      [...nodes[0]!.querySelectorAll(".key")].every((key) => /confidence · \d+%/.test(key.getAttribute("data-tip")!)),
    ).toBe(true);
  });
  it("separates the candidates with a dot", async () => {
    const nodes = await renderNodes(closeCall());

    expect(nodes[0]!.querySelector(".big")!.textContent).toContain("  ·  ");
  });
  it("reads every chord in every candidate key", async () => {
    const [, section] = await renderNodes(closeCall());
    const first = section!.querySelector("tbody tr")!.lastElementChild!.textContent!;

    expect(first).toContain("Bb minor:");
    expect(first).toContain("Db major:");
  });
});

describe("a part with no chords", () => {
  const melody = analyseBytes(
    buildFile([
      buildTrack([
        [0, noteOn(0, 60)],
        [480, noteOff(0, 60)],
        [0, noteOn(0, 62)],
        [480, noteOff(0, 62)],
        [0, noteOn(0, 64)],
        [480, noteOff(0, 64)],
      ]),
    ]),
  );
  let nodes: HTMLElement[];

  beforeAll(async () => {
    nodes = await renderNodes(melody);
  });

  it("still names the key, from the notes alone", () => {
    expect(melody.analysis.chords).toHaveLength(0);
    expect(nodes[0]!.querySelector(".label")!.textContent).toMatch(/from the notes alone$/);
  });
  it("says there are no chords, with no table", () => {
    expect(nodes.map(kindOf)).toEqual(["summary", "muted"]);
    expect(nodes[1]!.textContent).toBe("No chords found in this part.");
  });
});

describe("key tips for assistive technology", () => {
  let summary: HTMLElement;
  const keys = () => [...summary.querySelectorAll(".key")] as HTMLElement[];
  const big = () => summary.querySelector(".big") as HTMLElement;

  beforeEach(async () => {
    summary = (await renderNodes(closeCall()))[0]!;
  });

  it("describes each key with its tip, through aria-describedby", () => {
    for (const key of keys()) {
      const description = document.getElementById(key.getAttribute("aria-describedby")!)!;

      expect(description.textContent).toBe(key.getAttribute("data-tip")!.replace("\n", ". "));
    }
  });
  it("keeps the description out of the page but in the accessibility tree", () => {
    expect(document.getElementById(keys()[0]!.getAttribute("aria-describedby")!)!.hidden).toBe(true);
  });
  it("gives every key its own description", () => {
    const ids = keys().map((key) => key.getAttribute("aria-describedby"));

    expect(new Set(ids).size).toBe(ids.length);
  });
  it("lets the keyboard reach every key", () => {
    expect(keys().every((key) => key.tabIndex === 0)).toBe(true);
  });
  it("does not read the tip twice: it is not in the key's own name", () => {
    expect(keys()[0]!.textContent).toBe("Bb minor");
  });
  it("puts the tip away on Escape", async () => {
    expect(big().getAttribute("data-dismissed")).toBeNull();

    await settle(() => void document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(big().getAttribute("data-dismissed")).toBe("true");
  });
  it("leaves the tip alone for other keys", async () => {
    await settle(() => void document.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true })));

    expect(big().getAttribute("data-dismissed")).toBeNull();
  });
  it("brings the tip back when the pointer returns or focus comes back", async () => {
    await settle(() => void document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await settle(() => void keys()[0]!.dispatchEvent(new Event("mouseenter")));
    expect(big().getAttribute("data-dismissed")).toBeNull();

    await settle(() => void document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await settle(() => void keys()[1]!.dispatchEvent(new Event("focus")));
    expect(big().getAttribute("data-dismissed")).toBeNull();
  });
});

describe("rendering", () => {
  it("renders text as text", async () => {
    const [summary] = await renderNodes(progression(GMAJ7_TO_C));

    expect(summary!.querySelector("img")).toBeNull();
  });
  it("renders to the same markup twice", async () => {
    const first = (await renderNodes(progression(GMAJ7_TO_C))).map((node) => node.outerHTML);
    const second = (await renderNodes(progression(GMAJ7_TO_C))).map((node) => node.outerHTML);

    // The ids that tie a key to its description are generated per render; everything else must match.
    const plain = (html: string): string => html.replace(/(id|aria-describedby)="[^"]*"/g, "");

    expect(second.map(plain)).toEqual(first.map(plain));
  });
});
