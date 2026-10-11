import { describe, expect, it } from "vitest";
import {
  COLONNADE_FULL,
  COLONNADE_LITE,
  ROOM,
  archDelay,
  archLayout,
  archOutline,
  closeFraming,
  colonnadeWidth,
  easeOutQuint,
  framing,
  project,
} from "./roomLayout";

describe("archLayout", () => {
  it("is symmetric, tallest in the middle, and every arch faces the centre", () => {
    for (const spec of [COLONNADE_FULL, COLONNADE_LITE]) {
      const arches = archLayout(spec);
      expect(arches).toHaveLength(spec.count);
      const mid = arches[(spec.count - 1) / 2];
      expect(mid.x).toBeCloseTo(0);
      expect(mid.h).toBeCloseTo(ROOM.arch.hMax);
      for (const a of arches) {
        const twin = arches[spec.count - 1 - a.index];
        expect(a.x).toBeCloseTo(-twin.x);
        expect(a.h).toBeCloseTo(twin.h);
        expect(Math.hypot(a.x, a.z)).toBeCloseTo(spec.radius);
        expect(a.h).toBeLessThanOrEqual(ROOM.arch.hMax + 1e-9);
        expect(a.h).toBeGreaterThanOrEqual(ROOM.arch.hMin - 1e-9);
      }
    }
  });

  it("raises the centre arch first, then pairs outward", () => {
    const arches = archLayout(COLONNADE_FULL);
    const delays = arches.map(archDelay);
    expect(delays[3]).toBeLessThan(delays[2]);
    expect(delays[2]).toBe(delays[4]);
    expect(delays[0]).toBe(Math.max(...delays));
  });

  it("draws each arch outline from the floor, over the head and back to the floor", () => {
    const [arch] = archLayout(COLONNADE_FULL);
    const pts = archOutline(arch);
    expect(pts[0][1]).toBe(0);
    expect(pts[pts.length - 1][1]).toBe(0);
    const top = Math.max(...pts.map((p) => p[1]));
    expect(top).toBeLessThanOrEqual(arch.h + 1e-9);
    expect(top).toBeGreaterThan(arch.h - 0.05);
  });
});

describe("framing and project", () => {
  it("puts the camera target at the shifted centre of the canvas", () => {
    const f = framing(1440, 824, COLONNADE_FULL);
    const [x, y] = project(f.target, f, 1440, 824);
    expect(x).toBeCloseTo(1440 * (0.5 + f.shiftX));
    expect(y).toBeCloseTo(824 * (0.5 - f.shiftY));
  });

  it("keeps the whole colonnade on the right side of a desktop hero", () => {
    const w = 1440,
      h = 824;
    const f = framing(w, h, COLONNADE_FULL);
    expect(f.wide).toBe(true);
    const xs = archLayout(COLONNADE_FULL).flatMap((a) =>
      archOutline(a).map((p) => project(p, f, w, h)[0]),
    );
    expect(Math.min(...xs)).toBeGreaterThan(w * 0.36);
    expect(Math.max(...xs)).toBeLessThan(w);
  });

  it("fits the lite colonnade across a phone and in the upper part of the hero", () => {
    const w = 390,
      h = 768;
    const f = framing(w, h, COLONNADE_LITE);
    expect(f.wide).toBe(false);
    const pts = archLayout(COLONNADE_LITE).flatMap((a) =>
      archOutline(a).map((p) => project(p, f, w, h)),
    );
    expect(Math.min(...pts.map((p) => p[0]))).toBeGreaterThan(0);
    expect(Math.max(...pts.map((p) => p[0]))).toBeLessThan(w);
    expect(Math.max(...pts.map((p) => p[1]))).toBeLessThan(h * 0.6);
  });

  it("measures the colonnade wider when it has more arches on a wider arc", () => {
    expect(colonnadeWidth(COLONNADE_FULL)).toBeGreaterThan(
      colonnadeWidth(COLONNADE_LITE),
    );
  });
});

describe("closeFraming", () => {
  const room = (spec: typeof COLONNADE_FULL, w: number, h: number) => {
    const f = closeFraming(framing(w, h, spec));
    return archLayout(spec).flatMap((a) =>
      archOutline(a).map((p) => project(p, f, w, h)),
    );
  };

  it("keeps the whole colonnade on the right of a desktop closing scene", () => {
    const pts = room(COLONNADE_FULL, 1440, 824);
    expect(Math.min(...pts.map((p) => p[0]))).toBeGreaterThan(1440 * 0.4);
    expect(Math.max(...pts.map((p) => p[0]))).toBeLessThan(1440);
    expect(Math.min(...pts.map((p) => p[1]))).toBeGreaterThan(0);
  });

  it("keeps the whole colonnade above the copy on a phone", () => {
    const w = 390,
      h = 780;
    const pts = room(COLONNADE_LITE, w, h);
    expect(Math.min(...pts.map((p) => p[0]))).toBeGreaterThan(0);
    expect(Math.max(...pts.map((p) => p[0]))).toBeLessThan(w);
    expect(Math.min(...pts.map((p) => p[1]))).toBeGreaterThan(0);
    // the closing copy takes the lower half of the section on a phone
    expect(Math.max(...pts.map((p) => p[1]))).toBeLessThan(h * 0.44);
  });
});

describe("easeOutQuint", () => {
  it("runs from 0 to 1 and clamps outside", () => {
    expect(easeOutQuint(-1)).toBe(0);
    expect(easeOutQuint(0)).toBe(0);
    expect(easeOutQuint(1)).toBe(1);
    expect(easeOutQuint(2)).toBe(1);
    expect(easeOutQuint(0.5)).toBeCloseTo(1 - 1 / 32);
  });
});
