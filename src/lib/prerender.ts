/**
 * Checks used by the build-time prerender (scripts/prerender.mjs, through entry-server.tsx) to decide whether a
 * rendered route is a real page worth shipping as static HTML. Pure string work, so it runs in Node and in tests.
 */

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
 * Returns the length of the page text, or throws when the render is not a page: no <main>, no <h1> inside it, hardly
 * any text (a redirect, a spinner or an unfinished lazy chunk renders like that), or a Suspense boundary left pending
 * or handed to the client (its content would only appear after a script runs).
 */
export function assertPageContent(html: string): number {
  if (html.includes('<!--$?-->') || html.includes('<!--$!-->'))
    throw new Error('a Suspense boundary did not finish on the server');
  const { main, text } = mainText(html);
  const hasHeading = /<h1[\s>]/.test(main);
  if (!hasHeading || text.length < MIN_PAGE_TEXT)
    throw new Error(`no page content (${text.length} characters of text, heading ${hasHeading ? 'present' : 'missing'})`);
  return text.length;
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
