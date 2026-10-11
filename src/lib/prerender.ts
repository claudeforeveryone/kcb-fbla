/**
 * Checks used by the build-time prerender (scripts/prerender.mjs, through entry-server.tsx) to decide whether a
 * rendered route is a real page worth shipping as static HTML. Pure string work, so it runs in Node and in tests.
 */

/** The render came out with no page in it (a redirect or an empty route). By design for a route that is not required. */
export class EmptyPageError extends Error {
  override name = 'EmptyPageError';
}

/** Minimum visible text inside the page's <main> before it counts as real content. */
export const MIN_PAGE_TEXT = 40;

/** The first <main> element of some rendered HTML, and its visible text (no tags, scripts, styles or entities). */
export function mainText(html: string): { main: string; text: string } {
  const main = html.match(/<main[\s>][\s\S]*<\/main>/)?.[0] ?? '';
  const text = main
    .replace(/<(script|style)[\s>][\s\S]*?<\/\1>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { main, text };
}

/**
 * Returns the length of the page text, or throws when the render is not a page: an EmptyPageError for no <main>, no
 * <h1> inside it or hardly any text (a redirect renders like that, and so does a spinner), and a plain Error for a
 * Suspense boundary left pending or handed to the client (its content would only appear after a script runs).
 */
export function assertPageContent(html: string): number {
  if (html.includes('<!--$?-->') || html.includes('<!--$!-->'))
    throw new Error('a Suspense boundary did not finish on the server');
  const { main, text } = mainText(html);
  const hasHeading = /<h1[\s>]/.test(main);
  if (!hasHeading || text.length < MIN_PAGE_TEXT)
    throw new EmptyPageError(`no page content (${text.length} characters of text, heading ${hasHeading ? 'present' : 'missing'})`);
  return text.length;
}

/**
 * What the build does with a public route that did not prerender. Head tags only (noindex, left out of the sitemap)
 * is right for a route that renders no page by design: "/" while it sends signed-out visitors to /login. Anything else
 * fails the build, because that fallback would quietly take a real page out of search with only a warning in the log:
 * - the render threw, timed out or left a Suspense boundary pending (say a canvas that touches `window` while
 *   rendering, or a loader that never resolves in Node), whatever the route;
 * - a `required` route came out empty;
 * - PRERENDER_STRICT=1.
 */
export function prerenderFallback(route: { required: boolean }, err: unknown, strict: boolean): 'head-only' | 'fail' {
  if (strict || route.required) return 'fail';
  return err instanceof EmptyPageError ? 'head-only' : 'fail';
}

/**
 * React puts resource hints it found while rendering (for example `<link rel="preload" as="image">`) at the very start
 * of its output. They belong in <head>: inside #root they would sit in front of the app's first element and trip up
 * hydration. Returns the hints and the rest of the markup separately.
 */
export function splitLeadingHints(html: string): { hints: string; body: string } {
  const m = html.match(/^(?:\s*<link\b[^>]*>)+/);
  if (!m) return { hints: '', body: html };
  return { hints: m[0].trim(), body: html.slice(m[0].length) };
}

const SW_VERSION = /^const VERSION = '[^'\n]*';$/m;
const SW_PRECACHE = /^const PRECACHE_FILES = \[([^\]]*)\];$/m;

/** The files public/sw.js precaches (its PRECACHE_FILES list, relative to the worker). */
export function precacheFiles(swSource: string): string[] {
  const list = swSource.match(SW_PRECACHE);
  if (!list) throw new Error('sw.js has no `const PRECACHE_FILES = [...]` line');
  return [...list[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/**
 * sw.js with its cache VERSION set for this build. The build passes a hash of the precached files, so changing one
 * changes the worker's bytes: browsers then install the new worker, which re-downloads them and drops the old cache.
 */
export function stampServiceWorker(swSource: string, version: string): string {
  if (!SW_VERSION.test(swSource)) throw new Error("sw.js has no `const VERSION = '...';` line to stamp");
  return swSource.replace(SW_VERSION, () => `const VERSION = '${version}';`);
}
