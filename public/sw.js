// FBLC United service worker: a small offline shell, nothing more.
// - Precaches the offline page (self-contained: its logo and icon are inline).
// - Pages always come from the network; with no connection the offline page is shown instead of a browser error.
// - Hashed build files (assets/) are cached after their first load: their names change whenever their content does.
// - Everything else (icons, manifest, images) is left to the browser's normal HTTP cache, so updates always arrive.
// - Never touches other origins (Supabase) or Supabase API paths, so no account or practice data is
//   ever stored here. No push notifications.
// Paths are relative to this file, so the same worker works at / (Vercel) and under a sub-path (GitHub Pages).
// The build (scripts/prerender.mjs) replaces VERSION with a hash of the precached files: no hand bumping.
const VERSION = 'fblc-shell-dev';
const PRECACHE_FILES = ['offline.html'];
const at = (path) => new URL(path, self.location.href).href;
const OFFLINE_URL = at('offline.html');
const PRECACHED = new Set(PRECACHE_FILES.map(at));
const ASSETS = at('assets/');
const API_PATHS = ['/rest/v1/', '/auth/v1/', '/storage/v1/', '/functions/v1/', '/realtime/v1/', '/graphql/v1/'];
// Old builds' files pile up across deploys; keep the newest ones only.
const MAX_ENTRIES = 160;

async function remember(request, response) {
  const cache = await caches.open(VERSION);
  await cache.put(request, response);
  const keys = await cache.keys();
  const extra = keys.filter((k) => !PRECACHED.has(k.url)).slice(0, Math.max(0, keys.length - MAX_ENTRIES));
  await Promise.all(extra.map((k) => cache.delete(k)));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      // `reload`: fetch past the HTTP cache, so a new version never precaches an old copy.
      .then((cache) => cache.addAll([...PRECACHED].map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Same origin only, and never an API path: everything else goes straight to the network, uncached.
  if (url.origin !== self.location.origin) return;
  if (API_PATHS.some((p) => url.pathname.includes(p))) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  if (url.href.startsWith(ASSETS)) {
    event.respondWith(
      caches.match(request).then((hit) => {
        if (hit) return hit;
        return fetch(request).then((response) => {
          if (response.ok && response.type === 'basic') event.waitUntil(remember(request, response.clone()));
          return response;
        });
      }),
    );
  }
});
