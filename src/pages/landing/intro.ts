// Whether the hero's headline reveal should play. Pure so it can be unit tested.
//
// The reveal only makes sense when the landing is the first thing the visitor sees being painted. When static HTML of
// the landing was already on screen (a prerendered page that React then takes over), replaying the reveal would make
// text the visitor is already reading drop and rise again, so the text stays still and only the 3D room assembles.

export type IntroEnv = {
  reducedMotion: boolean;
  /** ms since navigation start when the browser first painted content, null if it has not yet */
  firstContentfulPaint: number | null;
  /** ms since navigation start, now (when the landing mounts) */
  now: number;
  /** the landing's static HTML was in the document before React rendered it */
  prerendered: boolean;
};

/** Longest gap between first paint and the landing mounting that still counts as "the landing is the first paint". */
export const FIRST_PAINT_GRACE_MS = 250;

export function shouldPlayIntro(env: IntroEnv): boolean {
  if (env.reducedMotion) return false;
  if (env.prerendered) return false;
  if (env.firstContentfulPaint === null) return true;
  return env.now - env.firstContentfulPaint <= FIRST_PAINT_GRACE_MS;
}
