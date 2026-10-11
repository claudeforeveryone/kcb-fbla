import { describe, expect, it } from "vitest";
import { shouldPlayIntro } from "./intro";

const base = {
  reducedMotion: false,
  firstContentfulPaint: null,
  now: 400,
  prerendered: false,
};

describe("shouldPlayIntro", () => {
  it("plays when nothing has been painted yet", () => {
    expect(shouldPlayIntro(base)).toBe(true);
  });

  it("plays when the landing mounts right after the first paint (shell, then landing)", () => {
    expect(
      shouldPlayIntro({ ...base, firstContentfulPaint: 300, now: 420 }),
    ).toBe(true);
    expect(
      shouldPlayIntro({ ...base, firstContentfulPaint: 300, now: 550 }),
    ).toBe(true);
  });

  it("stays still when the page was already readable for a while (prerendered HTML, client navigation)", () => {
    expect(
      shouldPlayIntro({ ...base, firstContentfulPaint: 300, now: 551 }),
    ).toBe(false);
    expect(
      shouldPlayIntro({ ...base, firstContentfulPaint: 500, now: 1900 }),
    ).toBe(false);
  });

  it("stays still when the static landing HTML was in the document", () => {
    expect(shouldPlayIntro({ ...base, prerendered: true })).toBe(false);
  });

  it("never plays under reduced motion", () => {
    expect(shouldPlayIntro({ ...base, reducedMotion: true })).toBe(false);
  });
});
