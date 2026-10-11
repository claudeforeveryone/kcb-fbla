import { describe, expect, it } from 'vitest';
import { crashKind } from './ErrorBoundary';

const CHUNK = [
  'Failed to fetch dynamically imported module: https://kcb-fbla.vercel.app/assets/Privacy-abc.js',
  'Importing a module script failed.',
  'Loading chunk 12 failed.',
];

describe('crashKind', () => {
  it('says offline (not "new version") when a page chunk fails with no connection', () => {
    for (const m of CHUNK) expect(crashKind(m, { offlineAtCrash: true, online: false }), m).toBe('offline');
  });

  it('says offline when the connection dropped after the crash', () => {
    expect(crashKind(CHUNK[0], { offlineAtCrash: false, online: false })).toBe('offline');
  });

  it('offers a reload once the connection is back', () => {
    expect(crashKind(CHUNK[0], { offlineAtCrash: true, online: true })).toBe('reconnected');
  });

  it('keeps the new-version message for a chunk that fails while online (a deploy replaced it)', () => {
    expect(crashKind(CHUNK[1], { offlineAtCrash: false, online: true })).toBe('update');
  });

  it('treats any other error as a page crash, online or not', () => {
    expect(crashKind("Cannot read properties of undefined (reading 'map')", { offlineAtCrash: true, online: false })).toBe(
      'error',
    );
    expect(crashKind('boom', { offlineAtCrash: false, online: true })).toBe('error');
  });
});
