/**
 * Whether this visitor might be signed in, decided before the app loads. No Supabase import, so the build-time
 * prerender, main.tsx and tests can use it cheaply.
 *
 * index.html's head script repeats this test in plain JavaScript (it runs before any module loads, on every
 * prerendered page). sessionHint.test.ts runs that script against the same cases: change both together.
 */

/** localStorage key Supabase keeps the signed-in session under. */
export const AUTH_STORAGE_KEY = 'kcbfbla-auth-v2';

/** What Supabase auth links put in the URL: a hash token, a PKCE code, or an email link type. */
export const AUTH_LINK_RE = /access_token=|[?&]code=|type=(recovery|signup|invite|magiclink)/;

/**
 * A visitor with no stored session and no auth link in the URL is known to be signed out: public pages paint at once
 * (no splash over prerendered HTML) and main.tsx can hydrate that HTML. Anything that might carry a session keeps the
 * splash until Supabase has checked it, and so does a browser whose storage cannot be read. Always false on the
 * server (build-time prerender), which renders every page signed out.
 */
export function mayHaveSession(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (AUTH_LINK_RE.test(window.location.href)) return true;
    return window.localStorage.getItem(AUTH_STORAGE_KEY) !== null;
  } catch {
    return true;
  }
}
