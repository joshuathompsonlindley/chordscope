/** The colour scheme on the page. */
export type Theme = "light" | "dark";

const STORAGE_KEY: string = "chordscope-theme";

/**
 * The other theme.
 * @param theme - The current theme.
 * @returns The theme a toggle press switches to.
 */
export function otherTheme(theme: Theme): Theme {
  return theme === "light" ? "dark" : "light";
}

/**
 * The theme to start with: the saved choice, else what the system prefers. Storage can be blocked or hold
 * anything, so a bad value counts as no choice.
 * @returns The starting theme.
 */
export function loadTheme(): Theme {
  try {
    const saved: string | null = localStorage.getItem(STORAGE_KEY);

    if (saved === "light" || saved === "dark") {
      return saved;
    }
  } catch {
    // Blocked storage means no saved choice.
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Show a theme on the page and remember it. Saving is best effort: the page still changes if storage is blocked.
 * @param theme - The theme to apply.
 */
export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);

  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Blocked storage only means the choice is forgotten on reload.
  }
}
