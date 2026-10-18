/**
 * Search metadata for the public routes, shared by the build-time prerender (head tags, sitemap) and the in-app
 * document updates on navigation. Pure data and string builders, so it is safe in Node (build) and the browser.
 */

export const SITE_URL = 'https://kcb-fbla.vercel.app';
export const SITE_NAME = 'FBLC United';
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
    title: 'FBLC United: FBLA-style practice exams, vocab and duels',
    description:
      'Practise FBLA-style exams, vocab decks and 1v1 duels, and watch your Elo climb. A free study tool for FBL Canada members.',
    index: true,
    sitemap: true,
    required: false,
    lastmod: POLICY_DATE,
  },
  {
    path: '/login',
    title: 'Sign in | FBLC United',
    description: 'Sign in to your FBLC United practice account to pick up your exams, vocab and duels.',
    index: false,
    sitemap: false,
    required: true,
    lastmod: POLICY_DATE,
  },
  {
    path: '/signup',
    title: 'Create a free account | FBLC United',
    description: 'Make a free FBLC United account for FBLA-style exams, vocab decks and 1v1 duels. Takes about a minute.',
    index: true,
    sitemap: true,
    required: true,
    lastmod: POLICY_DATE,
  },
  {
    path: '/terms',
    title: 'Terms of use | FBLC United',
    description:
      'The rules for using FBLC United, a free and independent FBLA-style study site: accounts, fair play, content and what we do not promise.',
    index: true,
    sitemap: true,
    required: true,
    lastmod: POLICY_DATE,
  },
  {
    path: '/privacy',
    title: 'Privacy policy | FBLC United',
    description:
      'What FBLC United collects from members, why, who can see it, how long we keep it, and how to ask us to change or delete it.',
    index: true,
    sitemap: true,
    required: true,
    lastmod: POLICY_DATE,
  },
];

/**
 * The app's signed-in sections. Their titles only label the browser tab and history (the pages are noindex); the list
 * also tells returnPathAfterAuth which paths are real app pages.
 */
const PRIVATE_TITLES: Array<[RegExp, string]> = [
  [/^\/$/, 'Home'],
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

/** Steps of signing in or up: never a page to come back to afterwards. */
const AUTH_STEPS = /^\/(login|signup|onboarding|reset)(\/|$)/;

/**
 * Where the top bar's "Sign in" and "Join free" bring a visitor back to once they are in: the app page they were on (a
 * chapter invite link, say), or null (home) for a public page, an auth step or a path the app doesn't have. Someone
 * who reads the Terms and taps Join free should finish onboarding on their dashboard, not back on the Terms.
 */
export function returnPathAfterAuth(path: string): string | null {
  const p = normalizePath(path);
  if (findPublicRoute(p) || AUTH_STEPS.test(p)) return null;
  return PRIVATE_TITLES.some(([re]) => re.test(p)) ? p : null;
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
 * itself, never FBLA-PBL or FBL Canada, and it carries no logo: the shield on the site is the club's own mark, but it is
 * left out of the structured data until it has a final export.
 */
export function jsonLd(): string {
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        name: SITE_NAME,
        alternateName: 'FBLC United',
        url: `${SITE_URL}/`,
        description: PUBLIC_ROUTES[0].description,
        inLanguage: 'en-CA',
        publisher: { '@id': `${SITE_URL}/#organization` },
      },
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: 'FBLC United',
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
    `<meta property="og:image:alt" content="FBLC United: FBLA-style practice for FBL Canada members" />`,
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

export type DocumentMeta = {
  title: string;
  robots: string;
  /** null: a signed-in page, which has no canonical URL. */
  canonical: string | null;
  /** Public pages only. */
  description?: string;
};

/**
 * The head a route should carry in the browser. `member`: a visitor who is signed in (or whose stored session is still
 * being checked). For them "/" is their dashboard, so it gets a private title and stays out of the index; every other
 * public page is the same page for everyone.
 */
export function documentMetaFor(pathname: string, { member = false }: { member?: boolean } = {}): DocumentMeta {
  const route = member && normalizePath(pathname) === '/' ? undefined : findPublicRoute(pathname);
  if (!route) return { title: titleForPrivate(pathname), robots: 'noindex, nofollow', canonical: null };
  return {
    title: route.title,
    description: route.description,
    robots: route.index ? 'index, follow, max-image-preview:large' : 'noindex, follow',
    canonical: canonicalFor(route.path),
  };
}

/**
 * Keeps the tab title and search tags in step with the route being shown. `firstLoad`: the document's head came from
 * the server. If that head was written for this very URL (a prerendered page, or head tags only for "/" while it
 * redirects), its robots rule stands: the build knows whether the page rendered, the browser does not.
 */
export function applyDocumentMeta(pathname: string, { member = false, firstLoad = false } = {}): void {
  if (typeof document === 'undefined') return;
  const meta = documentMetaFor(pathname, { member });
  document.title = meta.title;
  upsert('property', 'og:title', meta.title);
  upsert('name', 'twitter:title', meta.title);
  if (meta.canonical === null) {
    upsert('name', 'robots', meta.robots);
    document.head.querySelector('link[rel="canonical"]')?.remove();
    return;
  }
  const serverHead =
    firstLoad && document.head.querySelector('link[rel="canonical"]')?.getAttribute('href') === meta.canonical;
  if (!serverHead) upsert('name', 'robots', meta.robots);
  upsert('rel', 'canonical', meta.canonical);
  upsert('name', 'description', meta.description ?? '');
  upsert('property', 'og:description', meta.description ?? '');
  upsert('property', 'og:url', meta.canonical);
  upsert('name', 'twitter:description', meta.description ?? '');
}
