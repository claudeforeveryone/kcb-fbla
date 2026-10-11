import { StrictMode, type ReactNode } from 'react';
import { prerender } from 'react-dom/static';
import { StaticRouter } from 'react-router-dom';
import { AppTree, ROUTER_BASENAME } from './AppTree';

export { PUBLIC_ROUTES, headTags, sitemapXml } from './lib/seo';
export { assertPageContent, splitLeadingHints } from './lib/prerender';

/**
 * Build time only (scripts/prerender.mjs). Renders one route of the real app, signed out, to static HTML.
 *
 * Two passes of React 19's static prerender. The first waits for every lazy page chunk the route needs and throws its
 * HTML away. A lazy component that has loaded no longer suspends, so the second pass writes every Suspense boundary
 * inline. (A single pass would leave each boundary that suspended as a hidden segment that only a script reveals,
 * which crawlers and link previews that do not run JavaScript never see; `progressiveChunkSize` stops the same thing
 * happening to boundaries that are merely large.) Anything browser-only (canvas, WebGL,
 * window, storage) must run in an effect or behind a `typeof window` check: it is absent from the HTML and appears
 * once the page hydrates. A pass still running after `timeoutMs` is aborted, which leaves unfinished boundaries as
 * fallbacks, and assertPageContent then rejects the page.
 */
export async function renderRoute(path: string, timeoutMs = 20_000): Promise<string> {
  const location = ROUTER_BASENAME === '/' ? path : `${ROUTER_BASENAME}${path === '/' ? '' : path}`;
  const tree = (
    <StrictMode>
      <StaticRouter basename={ROUTER_BASENAME} location={location}>
        <AppTree />
      </StaticRouter>
    </StrictMode>
  );
  await renderOnce(tree, path, timeoutMs);
  return renderOnce(tree, path, timeoutMs);
}

async function renderOnce(tree: ReactNode, path: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`prerender of ${path} timed out`)), timeoutMs);
  try {
    // progressiveChunkSize: never split a large finished boundary (a long policy page) into a script-revealed segment.
    const { prelude } = await prerender(tree, { signal: controller.signal, progressiveChunkSize: Number.MAX_SAFE_INTEGER });
    const reader = prelude.getReader();
    const decoder = new TextDecoder();
    let html = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
    }
    return html + decoder.decode();
  } finally {
    clearTimeout(timer);
  }
}
