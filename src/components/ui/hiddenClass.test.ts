import { describe, expect, it } from 'vitest';

// `hidden` loses to a component's own `inline-flex` / `inline-grid` (Button, Badge, Kbd): both set display, and the
// stylesheet lists them alphabetically, so the base class wins and the element shows on phones anyway. Hiding one of
// these below a breakpoint takes `max-sm:hidden` (or max-md, max-lg), which is a media query and does win.
const files = import.meta.glob('/src/**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
// a bare `hidden` token: not `lg:hidden` or `max-sm:hidden`
const BAD = /<(Button|ButtonLink|Badge|Kbd|Tag|EloBadge)\b[^>]*className="(?:[^"]*\s)?hidden(?:\s[^"]*)?"/g;

describe('hiding inline-flex components on phones', () => {
  it('never passes a bare `hidden` to a component whose base class sets display', () => {
    expect(Object.keys(files).length).toBeGreaterThan(50);
    const hits = Object.entries(files).flatMap(([path, src]) => (src.match(BAD) ?? []).map((m) => `${path}: ${m.slice(0, 90)}`));
    expect(hits).toEqual([]);
  });
});
