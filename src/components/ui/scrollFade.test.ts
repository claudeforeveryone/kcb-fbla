import { describe, expect, it } from "vitest";
import { revealScrollLeft } from "./scrollFade";

// The owner console's tab strip on a 390 px phone: 358 px wide, 737 px of tabs.
const strip = { clientWidth: 358, scrollWidth: 737 };

describe("revealScrollLeft", () => {
  it("leaves the row alone when the item is already in full view", () => {
    expect(
      revealScrollLeft({ ...strip, scrollLeft: 0, start: 0, width: 90 }),
    ).toBeNull();
    expect(
      revealScrollLeft({ ...strip, scrollLeft: 0, start: 94, width: 80 }),
    ).toBeNull();
  });

  it("centres an item that sits past the right edge", () => {
    // Preparation at 300-404: (358 - 104) / 2 = 127 px either side, so the row scrolls to 300 - 127.
    expect(
      revealScrollLeft({ ...strip, scrollLeft: 0, start: 300, width: 104 }),
    ).toBe(173);
  });

  it("stops at the end of the row instead of centring past it", () => {
    // Users at 675-737 would centre at 527, but the row can only scroll 737 - 358 = 379.
    expect(
      revealScrollLeft({ ...strip, scrollLeft: 0, start: 675, width: 62 }),
    ).toBe(379);
  });

  it("brings back an item scrolled off the left edge, stopping at the start", () => {
    expect(
      revealScrollLeft({ ...strip, scrollLeft: 379, start: 0, width: 90 }),
    ).toBe(0);
  });

  it("treats an item under the faded edge as hidden", () => {
    // 285-335 is inside the 358 px view but under the 40 px fade on the right (318 onward).
    expect(
      revealScrollLeft({ ...strip, scrollLeft: 0, start: 285, width: 50 }),
    ).toBe(131);
    // At the very start there is no left fade, so an item touching the left edge is in view.
    expect(
      revealScrollLeft({ ...strip, scrollLeft: 0, start: 0, width: 50 }),
    ).toBeNull();
  });

  it("does nothing when the row does not scroll", () => {
    expect(
      revealScrollLeft({
        clientWidth: 358,
        scrollWidth: 358,
        scrollLeft: 0,
        start: 300,
        width: 58,
      }),
    ).toBeNull();
  });
});
