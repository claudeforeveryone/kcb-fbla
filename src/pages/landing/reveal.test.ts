import { describe, expect, it } from "vitest";
// Readable as text because vite.config.ts lets landing.css through Vitest's CSS handling.
import css from "./landing.css?raw";
import { renderRoute } from "../../entry-server";

/** The body of the first block that starts with `head` (balanced braces). */
function block(src: string, head: string): string {
  const at = src.indexOf(head);
  if (at < 0) return "";
  let depth = 0;
  for (let i = src.indexOf("{", at); i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0)
      return src.slice(src.indexOf("{", at) + 1, i);
  }
  return "";
}

const motionOk = block(css, "@media (prefers-reduced-motion: no-preference)");

describe("the landing's motion", () => {
  it("plays the headline reveal only for visitors who allow motion: the lines rise and the tricolour draws", () => {
    expect(block(motionOk, ".lp-hero .lp-line > span")).toMatch(/animation:\s*lp-rise\b/);
    expect(block(motionOk, ".lp-hero .lp-tricolour")).toMatch(/animation:\s*lp-draw\b/);
  });

  it("moves the headline with transform only, so its text is painted from the first frame", () => {
    for (const name of ["lp-rise", "lp-draw"]) {
      const frames = block(css, `@keyframes ${name}`);
      expect(frames, name).toMatch(/transform/);
      expect(frames, name).not.toMatch(/opacity|visibility|clip/);
    }
  });

  it("hides a section for its entrance only once JS has run, so the prerendered page is fully readable", async () => {
    expect(motionOk).toMatch(/\.lp-js \[data-reveal\]:not\(\.is-in\)/);
    expect(css.replace(motionOk, "")).not.toMatch(/\[data-reveal\][^{]*\{[^}]*opacity:\s*0/);
    const html = await renderRoute("/");
    expect(html).not.toContain("lp-js");
  }, 60_000);
});
