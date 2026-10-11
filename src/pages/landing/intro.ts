// Whether the hero's lead, body and actions fade up (obs-intro). Pure so it can be unit tested. The headline's own
// reveal (lines rising, the rule drawing) is transform-only CSS that plays from the first paint for everyone who
// allows motion, prerendered page included (observatory.css, reveal.test.ts).
//
// The fade only makes sense when the landing is the first thing the visitor sees being painted. When static HTML of
// the landing was already on screen (a prerendered page that React then takes over), fading text the visitor is
// already reading out and in again would be wrong, and the body paragraph is the page's largest paint, so it stays.

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
