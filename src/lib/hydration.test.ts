import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BUILD_YEAR, useCurrentYear, useHydrated } from './hydration';

function Probe() {
  return createElement('p', null, `${useHydrated() ? 'browser' : 'server'} ${useCurrentYear()}`);
}

describe('hydration-safe values', () => {
  it('renders the server value in prerendered HTML, which the first browser render must match', () => {
    expect(renderToString(createElement(Probe))).toBe(`<p>server ${BUILD_YEAR}</p>`);
  });

  it('takes the build year from the build, not the visitor clock', () => {
    expect(Number.isInteger(BUILD_YEAR)).toBe(true);
    expect(BUILD_YEAR).toBeGreaterThanOrEqual(2026);
  });
});
