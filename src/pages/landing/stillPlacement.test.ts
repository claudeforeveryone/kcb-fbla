import { describe, expect, it } from "vitest";
import { placeStill } from "./stillPlacement";

// The tall hero still is 780 x 1536; its last row brighter than white text allows (under 3:1) is 43.62% down.
const TALL = { iw: 780, ih: 1536, brightBottom: 0.4362 };

describe("where the still of the room is drawn", () => {
  it("covers the canvas, centred, when nothing needs to stay clear (390 x 780 hero)", () => {
    const p = placeStill({ ...TALL, cw: 390, ch: 780 });
    // scale max(390/780, 780/1536) = 0.5078125: 396.09 x 780, 3.05 px cropped from each side
    expect(p.w).toBeCloseTo(396.09, 2);
    expect(p.h).toBeCloseTo(780, 2);
    expect(p.x).toBeCloseTo(-3.05, 2);
    expect(p.y).toBeCloseTo(0, 2);
  });

  it("never brings the picture's top edge into the canvas", () => {
    // the core ends at 0.4362 * 780 = 340.2 px; a headline starting at 400 is already clear of it (400 - 12 > 340.2)
    const p = placeStill({
      ...TALL,
      cw: 390,
      ch: 780,
      clearY: 400,
      gap: 12,
      overscan: 280,
    });
    expect(p.y).toBeCloseTo(0, 2);
  });

  it("lifts the picture so the bright core ends `gap` above the headline (375 x 667: 375 x 620 hero, H1 at 162)", () => {
    // scale max(375/780, 620/1536) = 0.480769: 375 x 738.46; centred y = -59.23; core bottom 0.4362 * 738.46 = 322.12
    // wanted: 162 - 12 = 150, so y = 150 - 322.12 = -172.12 (within the 620 - 738.46 - 223.2 = -341.66 limit)
    const p = placeStill({
      ...TALL,
      cw: 375,
      ch: 620,
      clearY: 162,
      gap: 12,
      overscan: 223.2,
    });
    expect(p.h).toBeCloseTo(738.46, 2);
    expect(p.y).toBeCloseTo(-172.12, 2);
    expect(p.y + TALL.brightBottom * p.h).toBeCloseTo(150, 2);
  });

  it("moves the picture down to the headline when there is room (portrait tablet: 768 x 948 hero, H1 at 524)", () => {
    // scale max(768/780, 948/1536) = 0.984615: 1512.37 tall; centred y = -282.18 would cut the arches' tops off
    // wanted: 524 - 12 - 0.4362 * 1512.37 = -147.70, still covering the canvas (top edge above it)
    const p = placeStill({ ...TALL, cw: 768, ch: 948, clearY: 524, gap: 12, overscan: 341.28 });
    expect(p.y).toBeCloseTo(-147.7, 1);
  });

  it("keeps the crystal's rings a margin below the canvas top, before keeping the core clear (the band covers that)", () => {
    // rings start 24% down the still: on the 375 x 620 hero they may not rise above 24 - 0.24 * 738.46 = -153.23
    const p = placeStill({
      ...TALL,
      cw: 375,
      ch: 620,
      clearY: 162,
      gap: 12,
      overscan: 223.2,
      top: { fraction: 0.24, margin: 24 },
    });
    expect(p.y).toBeCloseTo(-153.23, 2);
    // where the core clears the headline anyway, the margin changes nothing (390 x 780 hero, H1 at 322)
    const roomy = placeStill({
      ...TALL,
      cw: 390,
      ch: 780,
      clearY: 322,
      gap: 12,
      overscan: 280.8,
      top: { fraction: 0.24, margin: 24 },
    });
    // 322 - 12 - 0.4362 * 780 = -30.24
    expect(roomy.y).toBeCloseTo(-30.24, 2);
  });

  it("never lifts the bottom edge further than the overscan the solid scrim hides", () => {
    const p = placeStill({
      ...TALL,
      cw: 375,
      ch: 620,
      clearY: 162,
      gap: 12,
      overscan: 60,
    });
    // lowest allowed: 620 - 738.46 - 60 = -178.46 would be fine; with overscan 20 it is -138.46
    expect(p.y).toBeCloseTo(-172.12, 2);
    const tight = placeStill({
      ...TALL,
      cw: 375,
      ch: 620,
      clearY: 162,
      gap: 12,
      overscan: 20,
    });
    expect(tight.y).toBeCloseTo(-138.46, 2);
  });

  it("works in device pixels as well as CSS pixels (everything scales together)", () => {
    const css = placeStill({
      ...TALL,
      cw: 375,
      ch: 620,
      clearY: 162,
      gap: 12,
      overscan: 223.2,
    });
    const dev = placeStill({
      ...TALL,
      cw: 750,
      ch: 1240,
      clearY: 324,
      gap: 24,
      overscan: 446.4,
    });
    expect(dev.y).toBeCloseTo(css.y * 2, 2);
    expect(dev.h).toBeCloseTo(css.h * 2, 2);
  });
});
