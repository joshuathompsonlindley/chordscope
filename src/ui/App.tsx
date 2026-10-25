// The page: drop a MIDI part, analyse it, show the result.
import type { JSX, RefObject } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { analyseMidi } from "@core/pipeline";
import { type Analysed } from "@core/types";
import { Result } from "@ui/components/Result";
import { ThemeToggle } from "@ui/components/ThemeToggle";
import { announcement } from "@ui/utils/announcement";

const DEFAULT_DROP_TEXT: string = "Drop a .mid file here, or click to choose";
/** A MIDI part is a few kilobytes; a file this big is not one, and reading it would only freeze the page. */
export const MAX_FILE_BYTES: number = 10_000_000;

/** What the page is showing. */
interface PageState {
  /** Shown in the drop area; the default prompt before a file is chosen. */
  dropText: string;
  analysed: Analysed | null;
  error: string | null;
}

/**
 * Turn anything thrown into a message for the person.
 * @param error - What was thrown.
 * @returns The message.
 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The drop area's classes: roomy to start with, one line once a file is loaded.
 * @param dragging - Whether a file is being dragged over it.
 * @param loaded - Whether a file has been chosen.
 * @returns The class names.
 */
function dropClass(dragging: boolean, loaded: boolean): string {
  return ["drop", loaded ? "compact" : "", dragging ? "over" : ""].filter(Boolean).join(" ");
}

/**
 * The whole page below the heading.
 * @returns The drop area, error line and result.
 */
export function App(): JSX.Element {
  const [page, setPage] = useState<PageState>({ dropText: DEFAULT_DROP_TEXT, analysed: null, error: null });
  const [dragging, setDragging] = useState<boolean>(false);
  const inputRef: RefObject<HTMLInputElement | null> = useRef<HTMLInputElement>(null);
  const latestLoad: RefObject<number> = useRef<number>(0);
  // The window listeners are set up once, so they call whichever `load` is current through this ref.
  const loadRef: RefObject<(file: File) => Promise<void>> = useRef<(file: File) => Promise<void>>(load);

  // A file dropped anywhere on the page is loaded: left alone, the browser would navigate away to the file.
  useEffect((): (() => void) => {
    /**
     * Highlight the drop area while a file is dragged over the page, and allow the drop.
     * @param event - The drag event.
     */
    function handleDragOver(event: DragEvent): void {
      event.preventDefault();
      setDragging(true);
    }

    /**
     * Remove the drop highlight when the drag leaves the page (moving between elements keeps it).
     * @param event - The drag event.
     */
    function handleDragLeave(event: DragEvent): void {
      if (!event.relatedTarget) {
        setDragging(false);
      }
    }

    /**
     * Load a dropped file.
     * @param event - The drop event.
     */
    function handleDrop(event: DragEvent): void {
      event.preventDefault();
      setDragging(false);

      const dropped: File | undefined = event.dataTransfer?.files[0];

      if (dropped) {
        void loadRef.current(dropped);
      }
    }

    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);

    return (): void => {
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
    };
  }, []);

  /**
   * Read a dropped or chosen file and analyse it.
   * @param file - The file.
   */
  async function load(file: File): Promise<void> {
    const thisLoad: number = ++latestLoad.current;

    if (file.size > MAX_FILE_BYTES) {
      setPage({ dropText: file.name, analysed: null, error: "That file is too big to be a MIDI part" });

      return;
    }

    setPage({ dropText: file.name, analysed: null, error: null }); // text node: file names are untrusted

    let bytes: ArrayBuffer;

    try {
      bytes = await file.arrayBuffer();
    } catch {
      if (thisLoad === latestLoad.current) {
        setPage({ dropText: file.name, analysed: null, error: "Could not read that file" });
      }

      return;
    }

    if (thisLoad !== latestLoad.current) {
      return; // a newer file was chosen while this one was being read
    }

    try {
      setPage({ dropText: file.name, analysed: analyseMidi(bytes), error: null });
    } catch (error: unknown) {
      setPage({ dropText: file.name, analysed: null, error: messageOf(error) });
    }
  }

  /** Load the file chosen with the file picker. */
  function handleChange(): void {
    const input: HTMLInputElement | null = inputRef.current;
    const chosen: File | undefined = input?.files?.[0];

    if (input) {
      // Forget the choice, so picking the same file again (a fresh export under the same name) fires a change.
      input.value = "";
    }

    if (chosen) {
      void load(chosen);
    }
  }

  /** Open the file picker. The drop zone is a real button, so Enter and Space reach this too. */
  function handleChoose(): void {
    inputRef.current?.click();
  }

  loadRef.current = load;

  const loaded: boolean = page.dropText !== DEFAULT_DROP_TEXT;

  return (
    <>
      <ThemeToggle />
      {loaded ? null : <p class="sub">Drop a MIDI part from your DAW to see its chords and key.</p>}
      <div id="drop" class={dropClass(dragging, loaded)}>
        <button type="button" class="drop-button" onClick={handleChoose}>
          <span id="drop-text">{page.dropText}</span>
          {loaded ? <span class="drop-hint"> · drop another to replace</span> : null}
        </button>
        <input
          id="file"
          type="file"
          accept=".mid,.midi,audio/midi,audio/x-midi"
          hidden
          ref={inputRef}
          onChange={handleChange}
        />
      </div>

      <p id="error" class="error" role="alert" hidden={page.error === null}>
        {page.error}
      </p>
      <div id="announce" class="sr-only" role="status">
        {page.analysed ? announcement(page.analysed) : ""}
      </div>
      <div id="result">{page.analysed ? <Result analysed={page.analysed} /> : null}</div>
    </>
  );
}
