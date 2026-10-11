import { describe, expect, it } from 'vitest';
import { MIN_PAGE_TEXT, assertPageContent, mainText, splitLeadingHints } from './prerender';

const page = (inner: string) => `<header><a href="/">FBLC</a></header><main id="main">${inner}</main><footer>Built with love</footer>`;

describe('mainText', () => {
  it('reads only the text inside <main>, without tags, scripts or entities', () => {
    const { text } = mainText(page('<h1>Privacy&nbsp;policy</h1><script>var x = "<b>hidden</b>";</script><p>What we collect.</p>'));
    expect(text).toBe('Privacy policy What we collect.');
  });

  it('returns nothing when the render has no <main>', () => {
    expect(mainText('<div class="splash">Loading</div>')).toEqual({ main: '', text: '' });
  });
});

describe('assertPageContent', () => {
  it('accepts a page with a heading and real text', () => {
    const body = page(`<h1>Terms of use</h1><p>${'Plain rules for using the site. '.repeat(3)}</p>`);
    expect(assertPageContent(body)).toBeGreaterThanOrEqual(MIN_PAGE_TEXT);
  });

  it('rejects an empty route (a redirect renders nothing inside the shell)', () => {
    expect(() => assertPageContent(page(''))).toThrow(/no page content/);
  });

  it('rejects a spinner or an unfinished lazy chunk', () => {
    expect(() => assertPageContent(page('<div role="status" aria-label="Loading page"><span></span></div>'))).toThrow(
      /heading missing/,
    );
  });

  it('rejects a heading with hardly any text', () => {
    expect(() => assertPageContent(page('<h1>Hi</h1>'))).toThrow(/heading present/);
  });

  it('rejects a page whose content waits for a script (pending or client-rendered boundary)', () => {
    const text = `<h1>Terms of use</h1><p>${'Plain rules for using the site. '.repeat(3)}</p>`;
    expect(() => assertPageContent(page(`<!--$?--><template id="B:0"></template>${text}<!--/$-->`))).toThrow(/Suspense/);
    expect(() => assertPageContent(page(`<!--$!--><template></template>${text}<!--/$-->`))).toThrow(/Suspense/);
    expect(assertPageContent(page(`<!--$-->${text}<!--/$-->`))).toBeGreaterThan(MIN_PAGE_TEXT);
  });

  it('does not count the header and footer chrome as page text', () => {
    const chrome = `<header>${'Sign in Join free '.repeat(10)}</header><main></main><footer>${'Terms Privacy '.repeat(10)}</footer>`;
    expect(() => assertPageContent(chrome)).toThrow();
  });
});

describe('splitLeadingHints', () => {
  it('moves the resource hints React writes first out of the body', () => {
    const out = splitLeadingHints('<link rel="preload" as="image" href="/brand/logo.webp"/><link rel="preload" as="font" href="/f.woff2"/><div class="app">x</div>');
    expect(out.hints).toBe('<link rel="preload" as="image" href="/brand/logo.webp"/><link rel="preload" as="font" href="/f.woff2"/>');
    expect(out.body).toBe('<div class="app">x</div>');
  });

  it('leaves markup without leading hints alone', () => {
    expect(splitLeadingHints('<div><link rel="stylesheet" href="/a.css"/></div>')).toEqual({
      hints: '',
      body: '<div><link rel="stylesheet" href="/a.css"/></div>',
    });
  });
});
