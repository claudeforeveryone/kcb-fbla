// The landing's code, fetched once the page has painted (src/lib/paint.ts). The prerendered "/" is on screen and usable before
// this chunk runs (its links are plain links, the reveal does not replay over static HTML), so nothing it does belongs
// before the first frame: on a phone it would only compete with the fonts and the app's own script, and where a frame
// is slow to reach the screen it would add a chain of requests and a hydration pass in front of it. On a real phone the
// prerendered page paints before the app's script has even arrived, so this wait is usually already over. The build's
// prerender (no window) imports at once.
import { browserPaintEnv, whenPainted } from "../../lib/paint";

export function loadLandingPage() {
  const painted =
    typeof window === "undefined"
      ? Promise.resolve()
      : whenPainted(browserPaintEnv());
  return painted.then(() => import("./LandingPage"));
}
