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
    expect(offlineHtml).toMatch(/<img [^>]*src="data:image\/webp;base64,/);
  });
});
