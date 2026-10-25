// Entry point: mount the page.
import { render } from "preact";
import { App } from "@ui/App";
import { applyTheme, loadTheme } from "@ui/utils/theme";

const root: HTMLElement | null = document.getElementById("app");

if (!root) {
  throw new Error("Page is missing the element #app");
}

// Apply the saved theme before the first paint of the app.
applyTheme(loadTheme());
render(<App />, root);
