import { describe, expect, it } from "vitest";
// Readable as text because vite.config.ts lets observatory.css through Vitest's CSS handling.
import css from "./observatory.css?raw";
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

describe("the hero's headline reveal", () => {
  it("plays for every visitor who allows motion, the prerendered page included: the lines rise and the rule draws", () => {
    expect(block(motionOk, ".obs-hero .obs-line > span")).toMatch(
      /animation:\s*obs-rise\b/,
    );
    expect(block(motionOk, ".obs-hero .obs-rule")).toMatch(
      /animation:\s*obs-draw\b/,
    );
  });

  it("moves with transform only, so the text is painted from the first frame (the largest paint is not delayed)", () => {
    for (const name of ["obs-rise", "obs-draw"]) {
      const frames = block(css, `@keyframes ${name}`);
      expect(frames, name).toMatch(/transform/);
      expect(frames, name).not.toMatch(/opacity|visibility|clip/);
    }
  });

  it("leaves the lead, body and buttons of the prerendered hero still (the LCP paragraph never fades)", async () => {
    const html = await renderRoute("/");
    const hero = html.match(/<section[^>]*id="top"[^>]*>/)?.[0] ?? "";
    expect(hero).toContain("obs-hero");
    expect(hero).not.toContain("obs-intro");
  }, 60_000);
});
