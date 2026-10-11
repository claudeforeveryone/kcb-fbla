import { describe, expect, it } from 'vitest';
import indexHtml from '../../index.html?raw';
// Readable as text because vite.config.ts lets index.css through Vitest's CSS handling.
import indexCss from '../index.css?raw';

/** The font files in the repo, as paths from src/. */
const fontFiles = Object.keys(import.meta.glob('../assets/fonts/*.woff2')).map((p) => p.replace(/^\.\.\//, ''));

const head = indexHtml.slice(0, indexHtml.indexOf('</head>'));
const links = [...head.matchAll(/<link\b[^>]*>/g)].map((m) => m[0]);
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

/** Font files the stylesheet's @font-face rules point at, as paths from src/. */
const faceFiles = [...indexCss.matchAll(/url\("\.\/(assets\/fonts\/[^"]+\.woff2)"\)/g)].map((m) => m[1]);

describe('brand fonts', () => {
  it('load from this site: no stylesheet or font request to another origin holds up the first paint', () => {
    for (const tag of links) {
      const rel = attr(tag, 'rel');
      if (rel === 'stylesheet' || rel === 'preconnect' || rel === 'preload') {
        expect(attr(tag, 'href'), tag).not.toMatch(/^https?:\/\//);
      }
    }
    expect(indexCss).not.toMatch(/@import\s+url\(["']?https?:/);
  });

  it('declare every font file they use, and the files exist', () => {
    expect(faceFiles.length).toBeGreaterThanOrEqual(4);
    for (const file of faceFiles) {
      expect(fontFiles, file).toContain(file);
    }
  });

  it('preload the same files the stylesheet uses, as CORS font requests (or the browser downloads them twice)', () => {
    const preloads = links.filter((tag) => attr(tag, 'rel') === 'preload' && attr(tag, 'as') === 'font');
    expect(preloads.length).toBeGreaterThan(0);
    for (const tag of preloads) {
      expect(tag, tag).toMatch(/\scrossorigin[\s/>]/);
      expect(attr(tag, 'type')).toBe('font/woff2');
      expect(faceFiles).toContain(attr(tag, 'href')?.replace(/^\/src\//, ''));
    }
  });

  it('paint text straight away in a fallback while they load', () => {
    const faces = [...indexCss.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]).filter((b) => /url\(/.test(b));
    for (const face of faces) expect(face).toMatch(/font-display:\s*swap/);
  });
});
