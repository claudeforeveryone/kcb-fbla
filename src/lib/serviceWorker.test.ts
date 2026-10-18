import { describe, expect, it } from 'vitest';
import swSource from '../../public/sw.js?raw';
import offlineHtml from '../../public/offline.html?raw';
import { precacheFiles, stampServiceWorker } from './prerender';

describe('service worker build stamp', () => {
  it('reads the precached files from sw.js', () => {
    expect(precacheFiles(swSource)).toEqual(['offline.html']);
  });

  it('replaces only the cache version, so a changed precached file reinstalls the worker', () => {
    const stamped = stampServiceWorker(swSource, 'fblc-shell-3f9a1c2b7d');
    expect(stamped).toContain("const VERSION = 'fblc-shell-3f9a1c2b7d';");
    expect(stamped.split('\n').filter((line, i) => line !== swSource.split('\n')[i])).toEqual([
      "const VERSION = 'fblc-shell-3f9a1c2b7d';",
    ]);
  });

  it('fails the build when sw.js loses the lines the stamp needs', () => {
    expect(() => stampServiceWorker('self.addEventListener("fetch", () => {});', 'v')).toThrow(/VERSION/);
    expect(() => precacheFiles('const VERSION = "x";')).toThrow(/PRECACHE_FILES/);
  });
});

describe('offline page', () => {
  it('needs no other file: it is served for any URL, under any base path (Vercel or GitHub Pages)', () => {
    expect(offlineHtml).not.toMatch(/\s(?:src|href)="(?!data:|#)/);
    expect(offlineHtml).toMatch(/<svg [^>]*aria-label="FBLC United"/);
  });

  /** Runs the offline page's script with a fake browser: connection state, the site's answer, timers. */
  function offlinePage({ online, siteAnswers }: { online: boolean; siteAnswers: boolean }) {
    const scripts = [...offlineHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    const listeners: Record<string, Array<() => void>> = {};
    const timers: Array<() => void> = [];
    const page = {
      reloads: 0,
      probes: [] as Array<{ url: string; init?: RequestInit }>,
      navigator: { onLine: online },
      answers: siteAnswers,
      fire: (type: string) => (listeners[type] ?? []).forEach((fn) => fn()),
      /** Runs the timers due so far, then lets the probes settle. */
      tick: async () => {
        timers.splice(0).forEach((fn) => fn());
        await new Promise((r) => setTimeout(r, 0));
      },
      pendingTimers: () => timers.length,
    };
    const env = {
      addEventListener: (type: string, fn: () => void) => (listeners[type] ??= []).push(fn),
      location: { href: 'https://kcb-fbla.vercel.app/privacy', reload: () => page.reloads++ },
      navigator: page.navigator,
      fetch: (url: string, init?: RequestInit) => {
        page.probes.push({ url, init });
        return page.answers ? Promise.resolve({ ok: true, status: 200 }) : Promise.reject(new TypeError('Failed to fetch'));
      },
      setTimeout: (fn: () => void) => timers.push(fn),
      clearTimeout: () => timers.splice(0),
    };
    for (const body of scripts) new Function(...Object.keys(env), body)(...Object.values(env));
    return page;
  }

  it('loads the requested page by itself once the site answers again', async () => {
    const page = offlinePage({ online: false, siteAnswers: false });
    expect(page.pendingTimers()).toBe(0); // offline: waits for the connection, no polling
    page.navigator.onLine = true;
    page.answers = true;
    page.fire('online');
    await page.tick();
    expect(page.probes[0]).toMatchObject({ url: 'https://kcb-fbla.vercel.app/privacy', init: { method: 'HEAD', cache: 'no-store' } });
    expect(page.reloads).toBe(1);
  });

  it('keeps trying when the first request after reconnecting still fails, instead of reloading into itself', async () => {
    const page = offlinePage({ online: false, siteAnswers: false });
    page.navigator.onLine = true;
    page.fire('online');
    await page.tick();
    expect(page.reloads).toBe(0);
    expect(page.pendingTimers()).toBe(1);
    page.answers = true;
    await page.tick();
    expect(page.reloads).toBe(1);
  });

  it('also recovers when it was shown while the browser still counted as online (a dropped request)', async () => {
    const page = offlinePage({ online: true, siteAnswers: true });
    expect(page.reloads).toBe(0);
    await page.tick();
    expect(page.reloads).toBe(1);
  });
});
