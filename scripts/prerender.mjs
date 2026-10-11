// Build-time prerender of the public routes (/, /login, /signup, /terms, /privacy). Runs after `vite build`.
//
// 1. Keeps the client build's empty shell as dist/app.html (Vercel's fallback for every signed-in path, see
//    vercel.json) and dist/404.html (the GitHub Pages fallback).
// 2. Builds src/entry-server.tsx for Node and renders each public route with the real app tree, signed out, using
//    React's static prerender (it waits for lazy chunks). The page goes into the shell with that route's own head
//    tags (title, description, canonical, robots, Open Graph, Twitter, JSON-LD) and `data-prerendered` on #root, which
//    tells main.tsx to hydrate it.
// 3. Writes dist/sitemap.xml.
// 4. Stamps dist/sw.js with a hash of the files it precaches, so changing one reaches installed users.
//
// A route whose render throws, times out or comes out without real page content (a heading and some text inside
// <main>) still gets its own title, description and canonical over an empty #root, but `noindex` and no sitemap entry:
// a crawler would only see an empty page. Set PRERENDER_STRICT=1 to fail the build instead.
import { build } from 'vite';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const dist = path.join(root, 'dist');
const ssrDir = path.join(root, 'dist-ssr');
const strict = process.env.PRERENDER_STRICT === '1';

// Head tags the shell carries by default (index.html); every public page replaces them with its own.
const SHELL_HEAD = [
  /<title>[\s\S]*?<\/title>\s*/g,
  /<meta\s+name="(?:description|robots)"[^>]*>\s*/g,
  /<link\s+rel="canonical"[^>]*>\s*/g,
  /<meta\s+(?:property="og:|name="twitter:)[^>]*>\s*/g,
];
const EMPTY_ROOT = /<div id="root">\s*<\/div>/;

function pageFile(routePath) {
  return routePath === '/' ? path.join(dist, 'index.html') : path.join(dist, routePath.slice(1), 'index.html');
}

async function stampServiceWorker(mod) {
  const file = path.join(dist, 'sw.js');
  const source = await readFile(file, 'utf8');
  const hash = createHash('sha256');
  for (const name of mod.precacheFiles(source)) hash.update(name).update('\0').update(await readFile(path.join(dist, name)));
  const version = `fblc-shell-${hash.digest('hex').slice(0, 12)}`;
  await writeFile(file, mod.stampServiceWorker(source, version));
  console.log(`prerender: sw.js cache version ${version}`);
}

async function main() {
  const shell = await readFile(path.join(dist, 'index.html'), 'utf8');
  if (!EMPTY_ROOT.test(shell)) throw new Error('dist/index.html has no empty <div id="root"></div> to fill');

  await writeFile(path.join(dist, 'app.html'), shell);
  await writeFile(path.join(dist, '404.html'), shell);

  await rm(ssrDir, { recursive: true, force: true });
  await build({
    logLevel: 'warn',
    build: { ssr: 'src/entry-server.tsx', outDir: ssrDir, emptyOutDir: true, copyPublicDir: false },
  });
  const mod = await import(pathToFileURL(path.join(ssrDir, 'entry-server.js')).href);

  let bare = shell;
  for (const re of SHELL_HEAD) bare = bare.replace(re, '');
  const withHead = (tags) => bare.replace('</head>', () => `    ${tags}\n  </head>`);

  const headOnly = [];
  for (const route of mod.PUBLIC_ROUTES) {
    let html;
    try {
      const { hints, body } = mod.splitLeadingHints(await mod.renderRoute(route.path));
      const chars = mod.assertPageContent(body);
      const tags = hints ? `${mod.headTags(route)}\n    ${hints}` : mod.headTags(route);
      html = withHead(tags).replace(EMPTY_ROOT, () => `<div id="root" data-prerendered>${body}</div>`);
      console.log(`prerender ${route.path}: ${chars} characters of page text`);
    } catch (err) {
      if (strict) throw err;
      html = withHead(mod.headTags(route, { rendered: false }));
      headOnly.push(route.path);
      const why = err instanceof Error ? err.message : String(err);
      console.warn(`prerender ${route.path}: head tags only (${why}); noindex and left out of sitemap.xml`);
    }

    const file = pageFile(route.path);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, html);
  }

  await writeFile(path.join(dist, 'sitemap.xml'), mod.sitemapXml(headOnly));
  await stampServiceWorker(mod);
  await rm(ssrDir, { recursive: true, force: true });
  const full = mod.PUBLIC_ROUTES.length - headOnly.length;
  console.log(`prerender: ${full} of ${mod.PUBLIC_ROUTES.length} public routes with full HTML; sitemap.xml written`);
}

main().then(
  // The app's modules (Supabase client, timers) must not keep the build step alive.
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
