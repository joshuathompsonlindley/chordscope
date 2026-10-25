import type { JSX } from "preact";
import { useState } from "preact/hooks";
import { applyTheme, loadTheme, otherTheme, type Theme } from "@ui/utils/theme";

/**
 * A button that switches the page between light and dark.
 * @returns The button, naming the theme it switches to.
 */
export function ThemeToggle(): JSX.Element {
  const [theme, setTheme] = useState<Theme>(loadTheme);

  /** Switch to the other theme and apply it. */
  function handleClick(): void {
    const next: Theme = otherTheme(theme);

    applyTheme(next);
    setTheme(next);
  }

  return (
    <button type="button" class="theme-toggle" onClick={handleClick}>
      {theme === "light" ? "Dark mode" : "Light mode"}
    </button>
  );
}
