import { describe, expect, it } from 'vitest';
import vercel from '../../vercel.json';
import { PUBLIC_ROUTES } from './seo';

type Rewrite = { source: string; destination: string };
const rewrites: Rewrite[] = vercel.rewrites;
const CATCH_ALL = rewrites.findIndex((r) => r.destination === '/app.html');

describe('vercel.json', () => {
  it('sends every other path to the signed-in app shell, last', () => {
    expect(CATCH_ALL).toBe(rewrites.length - 1);
    expect(rewrites[CATCH_ALL].source).toBe('/((?!content/|assets/).*)');
  });

  it('serves each prerendered public page (scripts/prerender.mjs writes <path>/index.html) before the catch-all', () => {
    // "/" needs no rewrite: Vercel serves dist/index.html for it before any rewrite runs.
    for (const route of PUBLIC_ROUTES.filter((r) => r.path !== '/')) {
      const i = rewrites.findIndex((r) => r.source === route.path);
      expect(i, `rewrite for ${route.path}`).toBeGreaterThanOrEqual(0);
      expect(rewrites[i].destination).toBe(`${route.path}/index.html`);
      expect(i).toBeLessThan(CATCH_ALL);
    }
  });

  it('rewrites no public path to a page the prerender does not write', () => {
    const pages = new Set(PUBLIC_ROUTES.map((r) => `${r.path}/index.html`));
    for (const r of rewrites.filter((x) => x.destination.endsWith('/index.html'))) {
      expect(pages.has(r.destination), r.destination).toBe(true);
    }
  });
});
