import { afterEach, describe, expect, it, vi } from "vitest";
import { applyTheme, loadTheme, otherTheme } from "@ui/utils/theme";

/**
 * Make the system prefer dark or light.
 * @param dark - Whether the system prefers dark.
 */
function prefer(dark: boolean): void {
  vi.stubGlobal("matchMedia", (): { matches: boolean } => ({ matches: dark }));
}

afterEach((): void => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("theme", (): void => {
  it("switches between light and dark", (): void => {
    expect(otherTheme("light")).toBe("dark");
    expect(otherTheme("dark")).toBe("light");
  });

  it("applies and remembers a theme", (): void => {
    applyTheme("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(loadTheme()).toBe("dark");
    applyTheme("light");
    expect(loadTheme()).toBe("light");
  });

  it("starts from the system preference when nothing is saved or the saved value is junk", (): void => {
    prefer(true);
    expect(loadTheme()).toBe("dark");
    localStorage.setItem("chordscope-theme", "purple");
    expect(loadTheme()).toBe("dark");
    prefer(false);
    expect(loadTheme()).toBe("light");
  });

  it("survives blocked storage", (): void => {
    prefer(true);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation((): never => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation((): never => {
      throw new Error("blocked");
    });
    expect(loadTheme()).toBe("dark");
    applyTheme("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});
