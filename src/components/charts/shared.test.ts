import { describe, expect, it } from 'vitest';
import { countTicks } from './shared';

describe('countTicks (axes for counts of people)', () => {
  it('never shows a fraction of a person, even when every bar is 0 or 1', () => {
    for (const max of [0, 1, 2, 3, 4, 5, 7, 12, 37, 99, 1234]) {
      const t = countTicks(max);
      expect(t.every(Number.isInteger), `max ${max}: ${t.join(',')}`).toBe(true);
      expect(t[0]).toBe(0);
      expect(t[t.length - 1]).toBeGreaterThanOrEqual(max);
    }
  });

  it('keeps a small chart readable: the axis goes up to at least 5', () => {
    expect(countTicks(0)[countTicks(0).length - 1]).toBeGreaterThanOrEqual(5);
    expect(countTicks(1)[countTicks(1).length - 1]).toBeGreaterThanOrEqual(5);
  });

  it('uses round steps for bigger numbers', () => {
    expect(countTicks(12)).toEqual([0, 5, 10, 15]);
    expect(countTicks(7)).toEqual([0, 2, 4, 6, 8]);
  });
});
