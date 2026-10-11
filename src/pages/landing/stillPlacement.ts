// Where a still of the room is drawn in its canvas. By default it covers the canvas, centred (the outline frame's
// xMidYMid slice). On a short phone the headline sits higher up the hero than on a tall one (the copy is a fixed block
// at the bottom), and a centred tall still put the crystal's bright core right behind it: white text on near-white,
// about 1:1. So when a headline is given, the picture is placed so its bright core ends `gap` above it: lifted on a
// short phone, lowered on a portrait tablet (where centring cut the arches' tops off and left the room far above the
// copy). Limits, strongest first: the picture's top edge never comes into the canvas; the crystal's top (`top`) stays
// a margin below the canvas top, even if the core then reaches behind the headline (the scrim band under the headline,
// observatory.css .obs-keep, keeps the text readable there); and the bottom edge rises no more than `overscan`, the
// strip the solid scrim hides anyway, so no gap is ever seen.
// All lengths are in one unit (CSS or device pixels); `brightBottom` and `top.fraction` are fractions of the image
// height.

export type StillPlacement = { x: number; y: number; w: number; h: number };

export function placeStill(o: {
  /** canvas size */
  cw: number;
  ch: number;
  /** image size */
  iw: number;
  ih: number;
  /** last row of the image brighter than white text allows, as a fraction of its height */
  brightBottom: number;
  /** top of the text to keep clear, from the canvas top; none: plain cover */
  clearY?: number | null;
  gap?: number;
  /** how far the image's bottom edge may rise above the canvas bottom */
  overscan?: number;
  /** the highest feature that must stay in view (its top, as a fraction of the image height) and its margin */
  top?: { fraction: number; margin: number };
}): StillPlacement {
  const s = Math.max(o.cw / o.iw, o.ch / o.ih);
  const w = o.iw * s;
  const h = o.ih * s;
  const x = (o.cw - w) / 2;
  let y = (o.ch - h) / 2;
  if (o.clearY != null) {
    y = o.clearY - (o.gap ?? 0) - o.brightBottom * h;
    y = Math.max(y, o.ch - h - (o.overscan ?? 0));
    if (o.top) y = Math.max(y, o.top.margin - o.top.fraction * h);
    y = Math.min(y, 0);
  }
  return { x, y, w, h };
}
