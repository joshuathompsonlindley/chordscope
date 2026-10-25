// The whole page: drop a file, read what it says, and check the way files come in and out.
import { readFileSync } from "node:fs";
import { options } from "preact";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { buildFile, chordClip } from "@test/helpers";
import { MAX_FILE_BYTES } from "@ui/App";

const PAGE_BODY = readFileSync("index.html", "utf8")
  .match(/<body>([\s\S]*)<\/body>/)![1]
  .replace(/<script[\s\S]*?<\/script>/g, "");

/** Hand a file to the page the way the file input does. */
async function loadFile(bytes: Uint8Array, name: string): Promise<void> {
  const input = document.getElementById("file") as HTMLInputElement;
  const file = new File([bytes.slice().buffer as ArrayBuffer], name);

  Object.defineProperty(input, "files", { value: [file], configurable: true });
  input.dispatchEvent(new Event("change"));
  await vi.waitFor(() => {
    expect(document.getElementById("drop-text")!.textContent).toBe(name);
    expect(
      document.getElementById("result")!.children.length + (document.getElementById("error")!.hidden ? 0 : 1),
    ).toBeGreaterThan(0);
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
}

/** The chord table as rows of text. */
function tableRows(): (string | null)[][] {
  return [...document.querySelectorAll("#result tbody tr")].map((row) =>
    [...row.children].map((cell) => cell.textContent),
  );
}

beforeAll(async () => {
  document.body.innerHTML = PAGE_BODY;
  // Render as soon as state changes, so a test can read the page straight after something happens.
  options.debounceRendering = (callback: () => void): void => callback();
  await import("@ui/main");
});

describe("page", () => {
  for (const sample of ["funk.mid", "waltz.mid"]) {
    it(`renders ${sample}`, async () => {
      await loadFile(new Uint8Array(readFileSync(`test/clips/${sample}`)), sample);
      const result = document.getElementById("result")!;

      expect(document.getElementById("error")!.hidden).toBe(true);
      // The keys and their tips, not the markup: the ids that tie each tip to its key are not meant to stay put.
      expect(
        [...result.querySelectorAll(".key")].map((key) => [key.textContent, key.getAttribute("data-tip")]),
      ).toMatchSnapshot("keys");
      expect(result.querySelector(".card .label")!.textContent).toMatchSnapshot("key label");
      expect(byId("announce").textContent).toMatchSnapshot("announcement");
      expect(tableRows()).toMatchSnapshot("chord table");
    });
  }

  it("shows the reason for a bad file and clears the result", async () => {
    await loadFile(new Uint8Array([1, 2, 3]), "bad.mid");

    const error = document.getElementById("error")!;

    expect(error.hidden).toBe(false);
    expect(error.textContent).toBe("Not a MIDI file");
    expect(document.getElementById("result")!.children).toHaveLength(0);
  });
});

/** Run `act` with the page seeing `files` as the file input's choice, and wait for the page to settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const byId = (id: string) => document.getElementById(id) as HTMLElement;
const dyads = () =>
  new Uint8Array(
    buildFile([
      chordClip([
        [[48, 55], 2],
        [[60, 67], 2],
      ]),
    ]),
  );

describe("announcing results", () => {
  it("tells a screen reader what was found when a file loads", async () => {
    await loadFile(dyads(), "announce.mid");

    expect(byId("announce").getAttribute("role")).toBe("status");
    expect(byId("announce").textContent).toMatch(/^(Key|Close call), from the chords: .+\. 1 chord found\.$/);
  });
  it("says nothing before a file is chosen, or when it cannot be read", async () => {
    await loadFile(new Uint8Array([1, 2, 3]), "bad.mid");

    expect(byId("announce").textContent).toBe("");
  });
});

describe("page events", () => {
  it("makes the drop zone a real button, so the keyboard and a screen reader can use it", () => {
    const button = byId("drop").querySelector("button")!;

    expect(button.type).toBe("button");
    expect(button.tagName).toBe("BUTTON");
    expect(button.textContent).toContain(byId("drop-text").textContent);
  });
  it("opens the file picker when the button is pressed", () => {
    const click = vi.fn();

    byId("file").click = click;
    (byId("drop").querySelector("button") as HTMLButtonElement).click();

    expect(click).toHaveBeenCalledTimes(1);
  });
  it("highlights the drop area while a file is dragged over, and stops when it leaves", () => {
    const over = new Event("dragover", { cancelable: true, bubbles: true });

    byId("drop").dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
    expect(byId("drop").classList.contains("over")).toBe(true);

    byId("drop").dispatchEvent(new Event("dragleave", { bubbles: true }));
    expect(byId("drop").classList.contains("over")).toBe(false);
  });
  it("loads a dropped file and drops the highlight", async () => {
    const file = new File([dyads().slice().buffer as ArrayBuffer], "dropped.mid");
    const drop = Object.assign(new Event("drop", { cancelable: true, bubbles: true }), {
      dataTransfer: { files: [file] },
    });

    byId("drop").dispatchEvent(new Event("dragover", { cancelable: true, bubbles: true }));
    expect(byId("drop").classList.contains("over")).toBe(true);
    byId("drop").dispatchEvent(drop);
    await settle();

    expect(drop.defaultPrevented).toBe(true);
    expect(byId("drop").classList.contains("over")).toBe(false);
    expect(byId("drop-text").textContent).toBe("dropped.mid");
    expect(byId("result").children.length).toBeGreaterThan(0);
  });
  it("ignores a drop with no file", async () => {
    const before = byId("drop-text").textContent;

    byId("drop").dispatchEvent(
      Object.assign(new Event("drop", { cancelable: true, bubbles: true }), { dataTransfer: { files: [] } }),
    );
    byId("drop").dispatchEvent(new Event("drop", { cancelable: true, bubbles: true }));
    await settle();

    expect(byId("drop-text").textContent).toBe(before);
  });
  it("ignores a change that chose nothing", async () => {
    const input = byId("file") as HTMLInputElement;
    const before = byId("drop-text").textContent;

    Object.defineProperty(input, "files", { value: [], configurable: true });
    input.dispatchEvent(new Event("change"));
    await settle();

    expect(byId("drop-text").textContent).toBe(before);
  });
  it("shows a file name as text, never as HTML", async () => {
    await loadFile(dyads(), "<b>x</b>.mid");

    expect(byId("drop-text").children).toHaveLength(0);
    expect(byId("drop-text").textContent).toBe("<b>x</b>.mid");
  });
});

describe("dropping and picking files", () => {
  it("loads a file dropped anywhere on the page, not just on the drop box", async () => {
    const file = new File([dyads().slice().buffer as ArrayBuffer], "anywhere.mid");
    const drop = Object.assign(new Event("drop", { cancelable: true, bubbles: true }), {
      dataTransfer: { files: [file] },
    });

    document.body.dispatchEvent(drop);
    await settle();

    expect(drop.defaultPrevented).toBe(true);
    expect(byId("drop-text").textContent).toBe("anywhere.mid");
  });
  it("stops the browser opening a file dragged over the page", () => {
    const over = new Event("dragover", { cancelable: true, bubbles: true });

    document.body.dispatchEvent(over);

    expect(over.defaultPrevented).toBe(true);
    expect(byId("drop").classList.contains("over")).toBe(true);
  });
  it("keeps the highlight while the drag moves between elements, and drops it on leaving the page", () => {
    document.body.dispatchEvent(new Event("dragover", { bubbles: true }));
    document.body.dispatchEvent(
      Object.assign(new Event("dragleave", { bubbles: true }), { relatedTarget: byId("drop") }),
    );
    expect(byId("drop").classList.contains("over")).toBe(true);

    document.body.dispatchEvent(Object.assign(new Event("dragleave", { bubbles: true }), { relatedTarget: null }));
    expect(byId("drop").classList.contains("over")).toBe(false);
  });
  it("forgets the picked file, so choosing the same file again still loads it", async () => {
    const input = byId("file") as HTMLInputElement;
    const file = new File([dyads().slice().buffer as ArrayBuffer], "same.mid");
    let value = "C:\\fakepath\\same.mid";

    Object.defineProperty(input, "files", { value: [file], configurable: true });
    Object.defineProperty(input, "value", {
      get: () => value,
      set: (next: string) => {
        value = next;
      },
      configurable: true,
    });
    input.dispatchEvent(new Event("change"));
    await settle();

    expect(value).toBe("");
    expect(byId("drop-text").textContent).toBe("same.mid");
  });
});

describe("what gets analysed", () => {
  it("reads a part of dyads, which has no triads, with pairs counting", async () => {
    await loadFile(dyads(), "power.mid");

    expect(tableRows().map((row) => row[0])).toEqual(["C5"]);
  });
  it("says so for a part with no chords at all", async () => {
    await loadFile(
      new Uint8Array(
        buildFile([
          chordClip([
            [[60], 1],
            [[62], 1],
            [[64], 1],
          ]),
        ]),
      ),
      "melody.mid",
    );

    expect(byId("result").textContent).toContain("from the notes alone");
    expect(byId("result").textContent).toContain("No chords found in this part.");
    expect(tableRows()).toEqual([]);
  });
  it("clears an error when a good file follows a bad one", async () => {
    await loadFile(new Uint8Array([1, 2, 3]), "bad.mid");
    expect(byId("error").hidden).toBe(false);

    await loadFile(dyads(), "good.mid");
    expect(byId("error").hidden).toBe(true);
    expect(byId("result").children.length).toBeGreaterThan(0);
  });
  it("replaces the previous result rather than adding to it", async () => {
    await loadFile(dyads(), "one.mid");
    await loadFile(dyads(), "two.mid");

    expect(byId("result").querySelectorAll(".summary")).toHaveLength(1);
  });
  it("reports a file that cannot be read", async () => {
    const input = byId("file") as HTMLInputElement;
    const unreadable = { name: "gone.mid", arrayBuffer: () => Promise.reject(new Error("disk")) };

    Object.defineProperty(input, "files", { value: [unreadable], configurable: true });
    input.dispatchEvent(new Event("change"));
    await settle();

    expect(byId("error").hidden).toBe(false);
    expect(byId("error").textContent).toBe("Could not read that file");
    expect(byId("result").children).toHaveLength(0);
  });
  it("does not carry the old result into the error", async () => {
    await loadFile(dyads(), "ok.mid");
    await loadFile(new Uint8Array([0]), "bad.mid");

    expect(byId("result").children).toHaveLength(0);
  });
});

describe("choosing files in quick succession", () => {
  it("shows the file chosen last, even if an earlier one finishes reading later", async () => {
    const input = byId("file") as HTMLInputElement;
    const slow = {
      name: "slow.mid",
      arrayBuffer: () =>
        new Promise<ArrayBuffer>((resolve) => setTimeout(() => resolve(dyads().slice().buffer as ArrayBuffer), 60)),
    };
    const quick = new File([new Uint8Array([1, 2, 3]).buffer as ArrayBuffer], "quick.mid");

    Object.defineProperty(input, "files", { value: [slow], configurable: true });
    input.dispatchEvent(new Event("change"));
    Object.defineProperty(input, "files", { value: [quick], configurable: true });
    input.dispatchEvent(new Event("change"));
    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(byId("drop-text").textContent).toBe("quick.mid");
    expect(byId("error").textContent).toBe("Not a MIDI file");
    expect(byId("result").children).toHaveLength(0);
  });
});

describe("file size", () => {
  it("refuses a file too big to be a MIDI part, without reading it", async () => {
    const input = byId("file") as HTMLInputElement;
    const arrayBuffer = vi.fn(() => Promise.resolve(new ArrayBuffer(0)));
    const huge = { name: "huge.mid", size: MAX_FILE_BYTES + 1, arrayBuffer };

    Object.defineProperty(input, "files", { value: [huge], configurable: true });
    input.dispatchEvent(new Event("change"));
    await settle();

    expect(byId("error").hidden).toBe(false);
    expect(byId("error").textContent).toBe("That file is too big to be a MIDI part");
    expect(byId("drop-text").textContent).toBe("huge.mid");
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(byId("result").children).toHaveLength(0);
  });
  it("accepts a file right at the limit", async () => {
    const bytes = dyads();
    const input = byId("file") as HTMLInputElement;
    const file = Object.assign(new File([bytes.slice().buffer as ArrayBuffer], "edge.mid"), {});

    Object.defineProperty(file, "size", { value: MAX_FILE_BYTES });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input.dispatchEvent(new Event("change"));
    await settle();

    expect(byId("error").hidden).toBe(true);
    expect(byId("result").children.length).toBeGreaterThan(0);
  });
});
