import { describe, expect, it } from "vitest";
// Readable as text because vite.config.ts lets landing.css through Vitest's CSS handling.
import css from "./landing.css?raw";
import { renderRoute } from "../../entry-server";

// House rule (design guide): nothing on the landing animates on its own. No headline entrance, no sections rising
// in on scroll. The only keyframes left belong to the sample question, which moves when the visitor answers it.
describe("the landing's motion", () => {
  it("has no entrance animations: the only keyframes are the sample question's", () => {
    const names = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]).sort();
    expect(names).toEqual(["lp-fade-in", "lp-swap-x", "lp-swap-y"]);
    expect(css).not.toMatch(/data-reveal|lp-js/);
  });

  it("never hides content waiting for a scroll or a script, so the prerendered page is fully readable", async () => {
    const html = await renderRoute("/");
    expect(html).not.toMatch(/data-reveal|lp-js/);
    // every opacity: 0 in the stylesheet sits inside a keyframe's starting state, never on a resting element
    const withoutKeyframes = css.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
    expect(withoutKeyframes).not.toMatch(/opacity:\s*0\b/);
  }, 60_000);

  it("keeps the sample question's swap to a fade under reduced motion", () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*animation-name:\s*lp-fade-in/);
  });
});
