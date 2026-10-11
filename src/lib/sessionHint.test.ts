import { afterEach, describe, expect, it, vi } from 'vitest';
import indexHtml from '../../index.html?raw';
import { AUTH_STORAGE_KEY, mayHaveSession } from './sessionHint';

type Visitor = { href: string; stored?: string | null; storage?: 'ok' | 'getItem-throws' | 'blocked' };

function fakeStorage(v: Visitor) {
  return {
    getItem(key: string) {
      if (v.storage === 'getItem-throws') throw new Error('SecurityError');
      return key === AUTH_STORAGE_KEY ? (v.stored ?? null) : null;
    },
  };
}

function stubWindow(v: Visitor) {
  const win: Record<string, unknown> = { location: { href: v.href } };
  Object.defineProperty(win, 'localStorage', {
    get() {
      if (v.storage === 'blocked') throw new Error('SecurityError: storage is disabled');
      return fakeStorage(v);
    },
  });
  vi.stubGlobal('window', win);
}

const SIGNED_OUT: Visitor = { href: 'https://kcb-fbla.vercel.app/terms' };
const STORED: Visitor = { href: 'https://kcb-fbla.vercel.app/', stored: '{"access_token":"x"}' };
const AUTH_LINKS = [
  'https://kcb-fbla.vercel.app/onboarding#access_token=abc&refresh_token=def&type=signup',
  'https://kcb-fbla.vercel.app/onboarding?code=4f1e2d',
  'https://kcb-fbla.vercel.app/reset/update?foo=1&code=4f1e2d',
  'https://kcb-fbla.vercel.app/reset/update#type=recovery',
  'https://kcb-fbla.vercel.app/#type=invite',
  'https://kcb-fbla.vercel.app/#type=magiclink',
];

afterEach(() => vi.unstubAllGlobals());

describe('mayHaveSession', () => {
  it('is false on the server (build-time prerender renders every page signed out)', () => {
    expect(typeof window).toBe('undefined');
    expect(mayHaveSession()).toBe(false);
  });

  it('is false for a visitor with no stored session and no auth link', () => {
    stubWindow(SIGNED_OUT);
    expect(mayHaveSession()).toBe(false);
  });

  it('ignores ordinary query strings that only look similar', () => {
    for (const href of [
      'https://kcb-fbla.vercel.app/login?next=%2Fplay',
      'https://kcb-fbla.vercel.app/?barcode=1',
      'https://kcb-fbla.vercel.app/terms?type=print',
    ]) {
      stubWindow({ href });
      expect(mayHaveSession(), href).toBe(false);
    }
  });

  it('is true when Supabase has a session stored under the app key', () => {
    stubWindow(STORED);
    expect(mayHaveSession()).toBe(true);
  });

  it('is true for every kind of auth link (hash token, PKCE code, email link types)', () => {
    for (const href of AUTH_LINKS) {
      stubWindow({ href });
      expect(mayHaveSession(), href).toBe(true);
    }
  });

  it('assumes a session when storage cannot be read', () => {
    stubWindow({ ...SIGNED_OUT, storage: 'getItem-throws' });
    expect(mayHaveSession()).toBe(true);
    stubWindow({ ...SIGNED_OUT, storage: 'blocked' });
    expect(mayHaveSession()).toBe(true);
  });
});

/** The inline <script> blocks in index.html's <head>, which every prerendered page copies. */
function headScripts(): string[] {
  const head = indexHtml.slice(0, indexHtml.indexOf('</head>'));
  return [...head.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}

/** Runs the head scripts against a fake page and reports which attributes they set on <html>. */
function runHeadScripts(v: Visitor) {
  const attrs = new Map<string, string>();
  const classes = new Set<string>();
  const documentElement = {
    setAttribute: (k: string, val: string) => attrs.set(k, val),
    classList: { add: (c: string) => classes.add(c) },
  };
  const storage = {
    getItem(key: string) {
      if (v.storage === 'getItem-throws') throw new Error('SecurityError');
      if (key === 'fblc:theme') return 'dark';
      return key === AUTH_STORAGE_KEY ? (v.stored ?? null) : null;
    },
  };
  for (const body of headScripts()) {
    // The scripts read the page globals by name; hand them in as parameters.
    new Function('document', 'localStorage', 'location', body)({ documentElement }, storage, { href: v.href });
  }
  return { session: attrs.has('data-session'), dark: classes.has('dark') };
}

describe('index.html head script', () => {
  it('flags exactly the visitors main.tsx will not hydrate for (same test as mayHaveSession)', () => {
    const visitors: Visitor[] = [
      SIGNED_OUT,
      STORED,
      { href: 'https://kcb-fbla.vercel.app/login?next=%2Fplay' },
      { ...SIGNED_OUT, storage: 'getItem-throws' },
      ...AUTH_LINKS.map((href) => ({ href })),
    ];
    for (const v of visitors) {
      stubWindow(v);
      expect(runHeadScripts(v).session, v.href).toBe(mayHaveSession());
    }
  });

  it('still applies the saved dark theme', () => {
    expect(runHeadScripts(SIGNED_OUT).dark).toBe(true);
  });

  it('hides prerendered markup from flagged visitors until the app replaces it', () => {
    expect(indexHtml).toMatch(/html\[data-session\]\s+#root\[data-prerendered\]\s*>\s*\*\s*\{[^}]*display:\s*none/);
  });
});
