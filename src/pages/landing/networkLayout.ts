// Geometry for the event network (a bracket: a root, five discipline hubs, fifteen events). Pure so the SVG paths and
// the HTML nodes are placed from the same numbers, and so the layout can be unit tested.
//
// Vertical positions are in CSS pixels inside the network box. Horizontal positions are percentages of its width, so
// the SVG uses a viewBox 100 wide with preserveAspectRatio="none" and non-scaling strokes.

import type { DisciplineId } from "./observatoryEvents";

export type NetworkInput = { id: DisciplineId; events: string[] }[];

export type NetworkLayout = {
  height: number;
  rowHeight: number;
  rootY: number;
  hubs: { id: DisciplineId; y: number }[];
  events: { slug: string; discipline: DisciplineId; y: number }[];
};

/** Column edges in percent of the network width. */
export const COLUMNS = {
  rootX: 3,
  hubLeft: 12,
  hubRight: 42,
  eventLeft: 52,
  eventRight: 100,
} as const;

export const ROW = { pitch: 46, height: 40, groupGap: 22 } as const;

export function networkLayout(
  groups: NetworkInput,
  row: { pitch: number; height: number; groupGap: number } = ROW,
): NetworkLayout {
  const events: NetworkLayout["events"] = [];
  const hubs: NetworkLayout["hubs"] = [];
  let y = row.height / 2;
  groups.forEach((g, gi) => {
    if (gi > 0) y += row.groupGap;
    const ys: number[] = [];
    for (const slug of g.events) {
      events.push({ slug, discipline: g.id, y });
      ys.push(y);
      y += row.pitch;
    }
    const mid = ys.length ? (ys[0] + ys[ys.length - 1]) / 2 : y;
    hubs.push({ id: g.id, y: mid });
  });
  const last = events.length ? events[events.length - 1].y : 0;
  const height = last + row.height / 2;
  const rootY = hubs.length
    ? (hubs[0].y + hubs[hubs.length - 1].y) / 2
    : height / 2;
  return { height, rowHeight: row.height, rootY, hubs, events };
}

/** A horizontal S-curve from (x1, y1) to (x2, y2), control points halfway across. */
export function link(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2;
  const f = (n: number) => Number(n.toFixed(2));
  return `M ${f(x1)} ${f(y1)} C ${f(mx)} ${f(y1)}, ${f(mx)} ${f(y2)}, ${f(x2)} ${f(y2)}`;
}
