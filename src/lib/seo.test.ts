import { describe, expect, it } from 'vitest';
import {
  PUBLIC_ROUTES,
  SITE_URL,
  canonicalFor,
  documentMetaFor,
  findPublicRoute,
  headTags,
  jsonLd,
  normalizePath,
  returnPathAfterAuth,
  scriptJson,
  sitemapXml,
  titleForPrivate,
} from './seo';

describe('public routes', () => {
  it('covers the five routes the prerender script writes', () => {
    expect(PUBLIC_ROUTES.map((r) => r.path)).toEqual(['/', '/login', '/signup', '/terms', '/privacy']);
  });

  it('keeps titles and descriptions inside search-result lengths', () => {
    for (const r of PUBLIC_ROUTES) {
      expect(r.title.length).toBeLessThanOrEqual(60);
      expect(r.description.length).toBeGreaterThanOrEqual(70);
      expect(r.description.length).toBeLessThanOrEqual(160);
    }
  });

  it('requires every page that renders today to keep prerendering ("/" joins once the landing renders there)', () => {
    expect(PUBLIC_ROUTES.filter((r) => r.required).map((r) => r.path)).toEqual(['/login', '/signup', '/terms', '/privacy']);
  });

  it('indexes every public page except sign-in, and lists exactly the indexed pages in the sitemap', () => {
    expect(PUBLIC_ROUTES.filter((r) => r.index).map((r) => r.path)).toEqual(['/', '/signup', '/terms', '/privacy']);
    expect(PUBLIC_ROUTES.filter((r) => r.sitemap).map((r) => r.path)).toEqual(
      PUBLIC_ROUTES.filter((r) => r.index).map((r) => r.path),
    );
  });
});

describe('paths', () => {
  it('normalises query, hash and trailing slashes', () => {
    expect(normalizePath('/play/')).toBe('/play');
    expect(normalizePath('/?ref=share')).toBe('/');
    expect(normalizePath('/terms#top')).toBe('/terms');
    expect(normalizePath('/')).toBe('/');
  });

  it('finds public routes whatever their trailing slash', () => {
    expect(findPublicRoute('/privacy/')?.path).toBe('/privacy');
    expect(findPublicRoute('/play')).toBeUndefined();
  });

  it('builds canonical URLs on the live domain', () => {
    expect(canonicalFor('/')).toBe(`${SITE_URL}/`);
    expect(canonicalFor('/privacy/')).toBe(`${SITE_URL}/privacy`);
  });
});

describe('where sign-in and sign-up send a visitor back to', () => {
  it('returns to an app page the visitor needs an account for', () => {
    expect(returnPathAfterAuth('/chapter/join/abc123')).toBe('/chapter/join/abc123');
    expect(returnPathAfterAuth('/play/accounting')).toBe('/play/accounting');
    expect(returnPathAfterAuth('/u/omega_qa_test')).toBe('/u/omega_qa_test');
    expect(returnPathAfterAuth('/me/settings/')).toBe('/me/settings');
  });

  it('does not return to a public page: a new member would finish onboarding on the Terms', () => {
    for (const path of ['/', '/terms', '/privacy', '/terms/', '/login', '/signup']) {
      expect(returnPathAfterAuth(path), path).toBeNull();
    }
  });

  it('does not return to an auth step or to a page the app does not have', () => {
    for (const path of ['/onboarding', '/reset', '/reset/update', '/no-such-page', '/terms-of-use', '/players']) {
      expect(returnPathAfterAuth(path), path).toBeNull();
    }
  });
});

describe('private page titles', () => {
  it('labels signed-in pages without matching look-alike paths', () => {
    expect(titleForPrivate('/play/accounting')).toBe('Play | FBLC');
    expect(titleForPrivate('/me')).toBe('Profile | FBLC');
    expect(titleForPrivate('/me/settings')).toBe('Settings | FBLC');
    expect(titleForPrivate('/me/career')).toBe('Career | FBLC');
    expect(titleForPrivate('/u/ada')).toBe('Profile | FBLC');
    expect(titleForPrivate('/meow')).toBe('FBLC');
    expect(titleForPrivate('/dev/ui')).toBe('FBLC');
  });
});

describe('document meta in the browser', () => {
  it("gives a member's home page (their dashboard) a private title and keeps it out of the index", () => {
    expect(documentMetaFor('/', { member: true })).toEqual({ title: 'Home | FBLC', robots: 'noindex, nofollow', canonical: null });
  });

  it('gives a signed-out visitor the public home page', () => {
    expect(documentMetaFor('/?ref=share', { member: false })).toMatchObject({
      title: PUBLIC_ROUTES[0].title,
      robots: 'index, follow, max-image-preview:large',
      canonical: `${SITE_URL}/`,
    });
  });

  it('shows the legal pages to members as the same public pages', () => {
    expect(documentMetaFor('/terms', { member: true })).toMatchObject({ title: 'Terms of use | FBLC', canonical: `${SITE_URL}/terms` });
  });

  it('labels signed-in pages for anyone', () => {
    for (const member of [true, false]) {
      expect(documentMetaFor('/play/accounting', { member })).toEqual({ title: 'Play | FBLC', robots: 'noindex, nofollow', canonical: null });
    }
  });
});

describe('head tags', () => {
  const terms = PUBLIC_ROUTES.find((r) => r.path === '/terms')!;
  const login = PUBLIC_ROUTES.find((r) => r.path === '/login')!;

  it('sets the title, canonical and social images for a content page', () => {
    const head = headTags(terms);
    expect(head).toContain('<title>Terms of use | FBLC</title>');
    expect(head).toContain(`<link rel="canonical" href="${SITE_URL}/terms" />`);
    expect(head).toContain('<meta name="robots" content="index, follow, max-image-preview:large" />');
    expect(head).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(head).toContain(`<meta property="og:image" content="${SITE_URL}/og-image.png" />`);
  });

  it('keeps sign-in pages out of the index but still follows their links', () => {
    expect(headTags(login)).toContain('<meta name="robots" content="noindex, follow" />');
  });

  it('keeps a page that prerendered with no content out of the index (it would be an empty shell to a crawler)', () => {
    const home = PUBLIC_ROUTES[0];
    const head = headTags(home, { rendered: false });
    expect(head).toContain('<meta name="robots" content="noindex, follow" />');
    expect(head).not.toContain('index, follow, max-image-preview');
    expect(headTags(home, { rendered: true })).toContain('content="index, follow, max-image-preview:large"');
  });

  it('escapes attribute text', () => {
    const head = headTags({ ...terms, description: 'Rules "for" <you> & me' });
    expect(head).toContain('content="Rules &quot;for&quot; &lt;you&gt; &amp; me"');
  });
});

describe('structured data and sitemap', () => {
  it('emits valid JSON-LD with WebSite and Organization, and no raw "<"', () => {
    const raw = jsonLd();
    expect(raw).not.toContain('<');
    const parsed = JSON.parse(raw) as { '@graph': Array<{ '@type': string }> };
    expect(parsed['@graph'].map((n) => n['@type'])).toEqual(['WebSite', 'Organization']);
  });

  it('escapes "<" in inline script JSON so data cannot close the tag', () => {
    const out = scriptJson({ name: '</script><script>alert(1)</script>' });
    expect(out).not.toContain('<');
    expect(out).toContain(`${String.fromCharCode(92)}u003c/script>`);
    expect(JSON.parse(out)).toEqual({ name: '</script><script>alert(1)</script>' });
  });

  it('describes the student project, not FBLA-PBL or FBL Canada, and claims no logo', () => {
    const parsed = JSON.parse(jsonLd()) as { '@graph': Array<Record<string, unknown>> };
    const org = parsed['@graph'].find((n) => n['@type'] === 'Organization')!;
    expect(org.name).toBe('FBLC Practice');
    expect(org.logo).toBeUndefined();
    expect(String(org.description)).toMatch(/Not affiliated with or endorsed by FBLA-PBL or FBL Canada/);
  });

  it('lists only the indexable public routes in sitemap.xml', () => {
    const xml = sitemapXml();
    expect(xml).toContain(`<loc>${SITE_URL}/</loc>`);
    expect(xml).toContain(`<loc>${SITE_URL}/signup</loc>`);
    expect(xml).toContain(`<loc>${SITE_URL}/terms</loc>`);
    expect(xml).toContain(`<loc>${SITE_URL}/privacy</loc>`);
    expect(xml).not.toContain('/login');
    expect(xml.match(/<url>/g)).toHaveLength(4);
  });

  it('leaves out routes that prerendered with no content', () => {
    const xml = sitemapXml(['/']);
    expect(xml).not.toContain(`<loc>${SITE_URL}/</loc>`);
    expect(xml).toContain(`<loc>${SITE_URL}/terms</loc>`);
    expect(xml.match(/<url>/g)).toHaveLength(3);
  });
});
