// Shared helpers for UI tests: mounting components and letting them settle.
import { render, type ComponentChild } from "preact";
import { act } from "preact/test-utils";

/**
 * Render a component into a fresh container in the page and let its effects run.
 * @param vnode - What to render.
 * @returns The container.
 */
export async function mount(vnode: ComponentChild): Promise<HTMLElement> {
  const container: HTMLElement = document.createElement("div");

  document.body.append(container);
  await act((): void => {
    render(vnode, container);
  });

  return container;
}

/**
 * Run something that triggers events, then let the page update.
 * @param action - What to do.
 */
export async function settle(action: () => void): Promise<void> {
  await act(action);
}
