// Can this visitor be signed in? Answered synchronously, before Supabase has restored anything, so "/" can paint the
// landing at once for a first visit instead of a splash that the landing then replaces (which moved the footer by
// most of a screen: CLS 0.69 in Lighthouse).

/** Must match `storageKey` in src/lib/supabase.ts (a test checks it). */
export const AUTH_STORAGE_KEY = "kcbfbla-auth-v2";

// What Supabase puts in the URL when a sign-in, sign-up, invite or recovery link opens the app. Exactly fbla-trust's
// AUTH_LINK_RE (src/lib/sessionHint.ts and its index.html head script; session.test.ts pins it): trust hydrates the
// prerendered landing when its rule says "signed out", so this rule must give the same answer for every URL. Once
// both are on main, IndexRoute can call trust's mayHaveSession() and this file and its test can go.
export const AUTH_IN_URL =
  /access_token=|[?&]code=|type=(recovery|signup|invite|magiclink)/;

export function mayHaveSession(
  storage: Pick<Storage, "getItem"> | null,
  href: string,
): boolean {
  if (AUTH_IN_URL.test(href)) return true;
  // storage that cannot be read: unknown, so keep the splash until Supabase has checked
  if (!storage) return true;
  try {
    return storage.getItem(AUTH_STORAGE_KEY) !== null;
  } catch {
    return true;
  }
}

/** The browser's answer; on the server (prerender) the visitor is treated as signed out. */
export function mayHaveSessionNow(): boolean {
  if (typeof window === "undefined") return false;
  let storage: Storage | null = null;
  try {
    storage = window.localStorage;
  } catch {
    storage = null;
  }
  return mayHaveSession(storage, window.location.href);
}
