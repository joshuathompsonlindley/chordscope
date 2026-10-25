import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "@ui/components/ThemeToggle";
import { mount, settle } from "@test/ui/support";

afterEach((): void => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  vi.unstubAllGlobals();
});

describe("ThemeToggle", (): void => {
  it("switches between light and dark on each press", async (): Promise<void> => {
    vi.stubGlobal("matchMedia", (): { matches: boolean } => ({ matches: false }));
    const container: HTMLElement = await mount(<ThemeToggle />);
    const button: HTMLButtonElement = container.querySelector("button")!;

    expect(button.textContent).toBe("Dark mode");
    await settle((): void => button.click());
    expect(button.textContent).toBe("Light mode");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    await settle((): void => button.click());
    expect(button.textContent).toBe("Dark mode");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("starts on the saved theme", async (): Promise<void> => {
    localStorage.setItem("chordscope-theme", "dark");
    const container: HTMLElement = await mount(<ThemeToggle />);

    expect(container.querySelector("button")!.textContent).toBe("Light mode");
  });
});
