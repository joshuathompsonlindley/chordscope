// The key card: the leading key, or every close call, each with a tip on how sure we are.
import type { KeyCardModel, KeyChoice } from "@ui/utils/keys";
import type { JSX } from "preact";
import { useEffect, useId, useState } from "preact/hooks";

/**
 * The key card: the leading key, or every close call when the music does not settle it. Hovering or focusing a key shows
 * how sure we are, and a screen reader reads the same text as the key's description. Escape puts the tip away.
 * @param props - The card's props.
 * @param props.model - The card's text.
 * @returns The card.
 */
export function KeyCard(props: { model: KeyCardModel }): JSX.Element {
  const { model }: { model: KeyCardModel } = props;
  const idBase: string = useId();
  const [dismissed, setDismissed] = useState<boolean>(false);

  // Escape dismisses a tip without moving the pointer or focus (WCAG 1.4.13); it returns on the next hover or focus.
  useEffect((): (() => void) => {
    /**
     * Put the tip away on Escape.
     * @param event - The key event.
     */
    function handleEscape(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setDismissed(true);
      }
    }

    document.addEventListener("keydown", handleEscape);

    return (): void => document.removeEventListener("keydown", handleEscape);
  }, []);

  /** Let the tip show again. */
  function handleReturn(): void {
    setDismissed(false);
  }

  return (
    <div class="card">
      <div class="label">{model.label}</div>
      <div class="big" data-dismissed={dismissed ? "true" : undefined}>
        {model.keys.map((key: KeyChoice, index: number): JSX.Element => (
          <>
            {index > 0 ? "  ·  " : null}
            <span
              class="key has-tip"
              tabIndex={0}
              data-tip={key.tip}
              aria-describedby={`${idBase}-${index}`}
              onMouseEnter={handleReturn}
              onFocus={handleReturn}
            >
              {key.name}
            </span>
            <span id={`${idBase}-${index}`} hidden>
              {key.tip.replace("\n", ". ")}
            </span>
          </>
        ))}
      </div>
      {model.note ? <div class="note">{model.note}</div> : null}
    </div>
  );
}
