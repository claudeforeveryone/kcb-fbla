import { describe, expect, it } from "vitest";
import { link, networkLayout, ROW } from "./networkLayout";
import { DISCIPLINES, EVENTS, eventsIn } from "./observatoryEvents";

const input = DISCIPLINES.map((d) => ({
  id: d.id,
  events: eventsIn(d.id).map((e) => e.slug),
}));

describe("networkLayout", () => {
  const layout = networkLayout(input);

  it("places every event once, top to bottom, at least one row apart", () => {
    expect(layout.events.map((e) => e.slug).sort()).toEqual(
      EVENTS.map((e) => e.slug).sort(),
    );
    for (let i = 1; i < layout.events.length; i++) {
      expect(
        layout.events[i].y - layout.events[i - 1].y,
      ).toBeGreaterThanOrEqual(ROW.pitch);
    }
  });

  it("opens a wider gap between disciplines than inside one", () => {
    for (let i = 1; i < layout.events.length; i++) {
      const a = layout.events[i - 1];
      const b = layout.events[i];
      const gap = b.y - a.y;
      expect(gap).toBe(
        a.discipline === b.discipline ? ROW.pitch : ROW.pitch + ROW.groupGap,
      );
    }
  });

  it("centres each hub on its own events and the root on the hubs", () => {
    for (const hub of layout.hubs) {
      const ys = layout.events
        .filter((e) => e.discipline === hub.id)
        .map((e) => e.y);
      expect(hub.y).toBeCloseTo((Math.min(...ys) + Math.max(...ys)) / 2);
    }
    expect(layout.rootY).toBeGreaterThan(layout.hubs[0].y);
    expect(layout.rootY).toBeLessThan(layout.hubs[layout.hubs.length - 1].y);
  });

  it("fits every row inside the box", () => {
    const first = layout.events[0];
    const last = layout.events[layout.events.length - 1];
    expect(first.y - layout.rowHeight / 2).toBe(0);
    expect(last.y + layout.rowHeight / 2).toBe(layout.height);
  });
});

describe("link", () => {
  it("draws a horizontal S-curve with control points halfway across", () => {
    expect(link(0, 10, 40, 90)).toBe("M 0 10 C 20 10, 20 90, 40 90");
    expect(link(12.345, 1, 20, 1)).toBe("M 12.35 1 C 16.17 1, 16.17 1, 20 1");
  });
});
