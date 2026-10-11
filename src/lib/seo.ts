/**
 * Search metadata for the public routes, shared by the build-time prerender (head tags, sitemap) and the in-app
 * document updates on navigation. Pure data and string builders, so it is safe in Node (build) and the browser.
 */

export const SITE_URL = 'https://kcb-fbla.vercel.app';
export const SITE_NAME = 'FBLC';
export const CONTACT_EMAIL = 'josephislockedin@gmail.com';
export const OG_IMAGE = `${SITE_URL}/og-image.png`;
/** Effective date of the current Terms and Privacy policy. */
export const POLICY_DATE = '2026-10-11';

export type PublicRoute = {
  path: string;
  title: string;
  description: string;
  /** Lets search engines index the page. The sign-in page stays out of the index (its links are still followed). */
  index: boolean;
  /** Listed in sitemap.xml. */
  sitemap: boolean;
  /**
   * The build fails unless this route prerenders as a real page. Off only for "/" while it redirects signed-out
   * visitors to /login; turn it on when the signed-out landing renders there.
   */
  required: boolean;
  lastmod: string;
};

/** Every route the prerender script writes to static HTML. Keep in step with App.tsx. */
export const PUBLIC_ROUTES: PublicRoute[] = [
  {
    path: '/',
    title: 'FBLC: FBLA-style practice exams, vocab and duels',
    description:
      'Practise FBLA-style exams, vocab decks and 1v1 duels, and watch your Elo climb. A free study tool for FBL Canada members.',
    index: true,
    sitemap: true,
    required: false,
    lastmod: POLICY_DATE,
  },
  {
    path: '/login',
    title: 'Sign in | FBLC',
    description: 'Sign in to your FBLC practice account to pick up your exams, vocab and duels.',
    index: false,
    sitemap: false,
    required: true,
    lastmod: POLICY_DATE,
  },
  {
    path: '/signup',
    title: 'Create a free account | FBLC',
    description: 'Make a free FBLC account for FBLA-style exams, vocab decks and 1v1 duels. Takes about a minute.',
    index: true,
    sitemap: true,
    required: true,
    lastmod: POLICY_DATE,
  },
  {
    path: '/terms',
    title: 'Terms of use | FBLC',
    description:
      'The rules for using FBLC, a free and independent FBLA-style study site: accounts, fair play, content and what we do not promise.',
    index: true,
    sitemap: true,
    required: true,
    lastmod: POLICY_DATE,
  },
  {
    path: '/privacy',
    title: 'Privacy policy | FBLC',
    description:
      'What FBLC collects from members, why, who can see it, how long we keep it, and how to ask us to change or delete it.',
    index: true,
    sitemap: true,
    required: true,
    lastmod: POLICY_DATE,
  },
];

/** Titles for signed-in pages. They are noindex, so these only label the browser tab and history. */
const PRIVATE_TITLES: Array<[RegExp, string]> = [
  [/^\/leaderboard(\/|$)/, 'Leaderboard'],
  [/^\/play(\/|$)/, 'Play'],
  [/^\/vocab(\/|$)/, 'Vocab'],
  [/^\/arena(\/|$)/, 'Arena'],
  [/^\/chapter(\/|$)/, 'Chapter'],
  [/^\/me\/settings(\/|$)/, 'Settings'],
  [/^\/me\/career(\/|$)/, 'Career'],
  [/^\/(me(\/|$)|u\/)/, 'Profile'],
  [/^\/notifications(\/|$)/, 'Notifications'],
  [/^\/onboarding(\/|$)/, 'Set up your player card'],
  [/^\/reset(\/|$)/, 'Reset your password'],
];

/** Path without the query string or hash, and without a trailing slash (except the root). */
export function normalizePath(path: string): string {
  const clean = path.split(/[?#]/)[0] || '/';
  return clean.length > 1 ? clean.replace(/\/+$/, '') || '/' : clean;
}

export function findPublicRoute(path: string): PublicRoute | undefined {
  const p = normalizePath(path);
  return PUBLIC_ROUTES.find((r) => r.path === p);
}

export function canonicalFor(path: string): string {
  const p = normalizePath(path);
  return p === '/' ? `${SITE_URL}/` : `${SITE_URL}${p}`;
}

export function titleForPrivate(path: string): string {
  const p = normalizePath(path);
  const hit = PRIVATE_TITLES.find(([re]) => re.test(p));
  return hit ? `${hit[1]} | ${SITE_NAME}` : SITE_NAME;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * WebSite and Organization structured data, the same on every public page. The organization is the student project
 * itself, never FBLA-PBL or FBL Canada, and it carries no logo: the logo on the site is FBL Canada's mark, which this
 * project does not own.
 */
export function jsonLd(): string {
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        name: SITE_NAME,
        alternateName: 'FBLC Practice',
        url: `${SITE_URL}/`,
        description: PUBLIC_ROUTES[0].description,
        inLanguage: 'en-CA',
        publisher: { '@id': `${SITE_URL}/#organization` },
      },
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: 'FBLC Practice',
        url: `${SITE_URL}/`,
        email: CONTACT_EMAIL,
        founder: [
          { '@type': 'Person', name: 'Joseph' },
          { '@type': 'Person', name: 'Kaden' },
        ],
        description:
          'An independent, student-run study site for FBL Canada members. Not affiliated with or endorsed by FBLA-PBL or FBL Canada.',
      },
    ],
  };
  return scriptJson(graph);
}

/** JSON for an inline <script>: every "<" is escaped, so no string in the data can close the tag early. */
export function scriptJson(value: unknown): string {
  // The six characters backslash-u-0-0-3-c: JSON reads them back as "<", HTML never sees a tag.
  return JSON.stringify(value).replaceAll('<', `${String.fromCharCode(92)}u003c`);
}

/**
 * Head tags for one public route, written into the prerendered HTML. `rendered: false` is a route the prerender could
 * not fill (head tags over an empty root, e.g. "/" while it still redirects signed-out visitors): crawlers would see
 * an empty page, so it stays out of the index until it renders.
 */
export function headTags(route: PublicRoute, { rendered = true }: { rendered?: boolean } = {}): string {
  const url = canonicalFor(route.path);
  const robots = route.index && rendered ? 'index, follow, max-image-preview:large' : 'noindex, follow';
  return [
    `<title>${esc(route.title)}</title>`,
    `<meta name="description" content="${esc(route.description)}" />`,
    `<meta name="robots" content="${robots}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:locale" content="en_CA" />`,
    `<meta property="og:title" content="${esc(route.title)}" />`,
    `<meta property="og:description" content="${esc(route.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${OG_IMAGE}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="FBLC: FBLA-style practice for FBL Canada members" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(route.title)}" />`,
    `<meta name="twitter:description" content="${esc(route.description)}" />`,
    `<meta name="twitter:image" content="${OG_IMAGE}" />`,
    `<script type="application/ld+json">${jsonLd()}</script>`,
  ].join('\n    ');
}

/** sitemap.xml: public, indexable routes only, minus any the prerender could not fill (`skip`). */
export function sitemapXml(skip: readonly string[] = []): string {
  const urls = PUBLIC_ROUTES.filter((r) => r.sitemap && !skip.includes(r.path)).map(
    (r) => `  <url>\n    <loc>${canonicalFor(r.path)}</loc>\n    <lastmod>${r.lastmod}</lastmod>\n  </url>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

function upsert(kind: 'name' | 'property' | 'rel', key: string, value: string) {
  const tag = kind === 'rel' ? 'link' : 'meta';
  const attr = kind === 'rel' ? 'href' : 'content';
  let el = document.head.querySelector<HTMLElement>(`${tag}[${kind}="${key}"]`);
  if (!el) {
    el = document.createElement(tag);
    el.setAttribute(kind, key);
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

/** In-app navigation: keep the tab title and search tags in step with the route being shown. */
export function applyDocumentMeta(pathname: string): void {
  if (typeof document === 'undefined') return;
  const route = findPublicRoute(pathname);
  if (route) {
    const url = canonicalFor(route.path);
    document.title = route.title;
    upsert('name', 'description', route.description);
    upsert('name', 'robots', route.index ? 'index, follow, max-image-preview:large' : 'noindex, follow');
    upsert('rel', 'canonical', url);
    upsert('property', 'og:title', route.title);
    upsert('property', 'og:description', route.description);
    upsert('property', 'og:url', url);
    upsert('name', 'twitter:title', route.title);
    upsert('name', 'twitter:description', route.description);
    return;
  }
  const title = titleForPrivate(pathname);
  document.title = title;
  upsert('name', 'robots', 'noindex, nofollow');
  upsert('property', 'og:title', title);
  upsert('name', 'twitter:title', title);
  document.head.querySelector('link[rel="canonical"]')?.remove();
}
