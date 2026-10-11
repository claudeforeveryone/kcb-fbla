import { describe, expect, it } from 'vitest';
import robots from '../../public/robots.txt?raw';
import indexHtml from '../../index.html?raw';
import { SITE_URL } from './seo';

const rules = (field: string) =>
  robots
    .split('\n')
    .map((l) => l.replace(/#.*/, '').trim())
    .filter((l) => l.toLowerCase().startsWith(`${field.toLowerCase()}:`))
    .map((l) => l.slice(field.length + 1).trim());

describe('robots.txt', () => {
  it('blocks no page, so crawlers can read the noindex on signed-in pages', () => {
    // Every signed-in path is served the app shell (index.html, copied to app.html and 404.html), which says noindex.
    // A crawler that is not allowed to fetch a URL never sees that tag, and a URL linked from the public pages (the
    // footer links /play, /vocab, /arena ...) can still be listed as "Indexed, though blocked by robots.txt".
    expect(indexHtml).toContain('<meta name="robots" content="noindex, nofollow" />');
    expect(rules('Disallow').filter(Boolean)).toEqual([]);
  });

  it('points crawlers at the sitemap on the live domain', () => {
    expect(rules('Sitemap')).toEqual([`${SITE_URL}/sitemap.xml`]);
  });
});
