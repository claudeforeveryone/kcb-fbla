import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BUILD_YEAR, hashTargetId, useCurrentYear, useHydrated } from './hydration';

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

describe('hashTargetId', () => {
  it('reads the section id from a link such as /privacy#email', () => {
    expect(hashTargetId('#email')).toBe('email');
    expect(hashTargetId('#choices')).toBe('choices');
  });

  it('decodes an encoded id', () => {
    expect(hashTargetId('#caf%C3%A9')).toBe('café');
  });

  it('has nothing to scroll to without a hash', () => {
    expect(hashTargetId('')).toBeNull();
    expect(hashTargetId('#')).toBeNull();
  });

  it('keeps a malformed escape as written instead of throwing', () => {
    expect(hashTargetId('#50%off')).toBe('50%off');
  });
});
