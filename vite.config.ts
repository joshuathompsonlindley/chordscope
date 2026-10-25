import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

/**
 * What the built page may load: its own script and stylesheet, and nothing else. The page makes no network calls, and
 * the canvas and the empty `data:` favicon need no more.
 */
const CONTENT_SECURITY_POLICY: string = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

/**
 * Add the content security policy to the built page. The dev server needs inline scripts and a socket for hot reload,
 * so it is left out of development.
 * @returns The Vite plugin.
 */
function contentSecurityPolicy(): Plugin {
  return {
    name: "content-security-policy",
    apply: "build",
    transformIndexHtml(): { tag: string; attrs: Record<string, string>; injectTo: "head-prepend" }[] {
      return [
        {
          tag: "meta",
          attrs: { "http-equiv": "Content-Security-Policy", content: CONTENT_SECURITY_POLICY },
          injectTo: "head-prepend",
        },
      ];
    },
  };
}

/**
 * Make the built page open straight from disk. A browser will not load a module script, or a `crossorigin` file, from
 * a `file://` page, so the built script becomes a plain deferred one and the `crossorigin` marks go.
 * @returns The Vite plugin.
 */
function openFromDisk(): Plugin {
  return {
    name: "open-from-disk",
    apply: "build",
    enforce: "post",
    transformIndexHtml(html: string): string {
      return html.replace(/<script type="module" crossorigin /g, "<script defer ").replace(/ crossorigin(?=[ >])/g, "");
    },
  };
}

export default defineConfig({
  // Relative URLs, so the page works from any folder or from disk, not only at the root of a server.
  base: "./",
  plugins: [contentSecurityPolicy(), openFromDisk()],
  build: {
    modulePreload: false,
    cssCodeSplit: false,
    // One classic script: a `file://` page cannot load ES modules.
    rolldownOptions: { output: { format: "iife" } },
  },
  // `@core/*`, `@ui/*` and `@test/*` come from the tsconfig files, so the paths are written once.
  resolve: { tsconfigPaths: true },
  test: {
    projects: [
      { extends: true, test: { name: "core", include: ["test/core/**/*.test.ts"], environment: "node" } },
      { extends: true, test: { name: "ui", include: ["test/ui/**/*.test.{ts,tsx}"], environment: "happy-dom" } },
    ],
  },
});
