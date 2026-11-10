import { describe, expect, it } from 'vitest';
import { seeded } from '../../lib/srs';
import { MIXED_EVENT, canAutoStart, dailyPlan, firstRunHref, mockSet, parseRunSpec, resolveDaily, runHref, weakMix } from './runLogic';

const SLUGS = ['accounting', 'business-law', 'economics', 'marketing', 'personal-finance'];
const bank = (prefix: string, subs: string[], per: number) =>
  subs.flatMap((sub, s) =>
    Array.from({ length: per }, (_, i) => ({
      id: `${prefix}-${String(s * per + i + 1).padStart(3, '0')}`,
      sub,
      diff: ((i % 3) + 1) as 1 | 2 | 3,
      topic: prefix,
    })),
  );

describe('parseRunSpec', () => {
  it('reads the documented params and infers the mode', () => {
    expect(parseRunSpec(new URLSearchParams('mode=mock&event=accounting&n=50'))).toMatchObject({
      mode: 'mock',
      event: 'accounting',
      n: 50,
    });
    expect(parseRunSpec(new URLSearchParams('test=abc')).mode).toBe('custom');
    expect(parseRunSpec(new URLSearchParams('assignment=x&mode=quick')).mode).toBe('assignment');
    expect(parseRunSpec(new URLSearchParams('redo=wrong')).mode).toBe('redo');
    expect(parseRunSpec(new URLSearchParams('redo=abc&only=wrong')).onlyWrong).toBe(true);
    expect(parseRunSpec(new URLSearchParams('mode=nonsense')).mode).toBe('quick');
    expect(parseRunSpec(new URLSearchParams('n=999')).n).toBe(100);
  });
  it('round-trips through runHref', () => {
    const href = runHref({ mode: 'area', event: 'economics', area: 'Supply & demand', n: 10 });
    const spec = parseRunSpec(new URLSearchParams(href.split('?')[1]));
    expect(spec).toMatchObject({ mode: 'area', event: 'economics', area: 'Supply & demand', n: 10 });
  });
});

describe('daily challenge', () => {
  it('is the same for everyone on a day and changes the next day', () => {
    const a = dailyPlan('2026-10-10', SLUGS);
    const b = dailyPlan('2026-10-10', [...SLUGS].reverse());
    const c = dailyPlan('2026-10-11', SLUGS);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(a).toHaveLength(10);
  });
  it('resolves to 10 distinct questions, easiest first', () => {
    const byEvent = new Map(SLUGS.map((s) => [s, bank(s, ['x', 'y'], 10)]));
    const qs = resolveDaily(dailyPlan('2026-10-10', SLUGS), byEvent);
    expect(qs).toHaveLength(10);
    expect(new Set(qs.map((q) => q.id)).size).toBe(10);
    const diffs = qs.map((q) => q.diff);
    expect([...diffs].sort()).toEqual(diffs);
  });
});

describe('mockSet', () => {
  const qs = bank('acc', ['a', 'b', 'c', 'd'], 25).map((q, i) => ({ ...q, sub: i < 40 ? 'a' : i < 70 ? 'b' : i < 90 ? 'c' : 'd' }));
  it('keeps area proportions', () => {
    const set = mockSet(qs, 50, seeded('t'));
    expect(set).toHaveLength(50);
    const count = (s: string) => set.filter((q) => q.sub === s).length;
    expect([count('a'), count('b'), count('c'), count('d')]).toEqual([20, 15, 10, 5]);
  });
  it('returns the whole bank for a full mock', () => {
    expect(new Set(mockSet(qs, 100, seeded('t')).map((q) => q.id)).size).toBe(100);
  });
});

describe('weakMix', () => {
  const qs = [...bank('acc', ['tax', 'cycle'], 10)];
  it('leads with misses and fills from the worst areas, skipping mastered', () => {
    const set = weakMix(qs, {
      misses: ['acc-012', 'acc-013'],
      spots: [{ event: 'acc', sub: 'tax', accuracy: 0.2, answered: 5 }],
      mastered: new Set(['acc-001', 'acc-002']),
      seen: new Set(['acc-001', 'acc-002', 'acc-003']),
      n: 6,
      rand: seeded('w'),
    });
    expect(set).toHaveLength(6);
    const ids = set.map((q) => q.id);
    expect(ids).toContain('acc-012');
    expect(ids).toContain('acc-013');
    expect(ids).not.toContain('acc-001');
    expect(set.filter((q) => q.sub === 'tax').length).toBe(4);
  });
});

describe('opening on question 1 (go=1)', () => {
  const spec = (q: string) => parseRunSpec(new URLSearchParams(q));
  it('reads the flag and leaves it off by default', () => {
    expect(spec('mode=quick&go=1').go).toBe(true);
    expect(spec('mode=quick').go).toBe(false);
    expect(spec('mode=quick&go=yes').go).toBe(false);
  });
  it('skips the intro only for untimed practice sets', () => {
    expect(canAutoStart(spec('mode=quick&go=1'), false)).toBe(true);
    expect(canAutoStart(spec('mode=practice&event=accounting&go=1'), false)).toBe(true);
    expect(canAutoStart(spec('mode=area&event=accounting&area=Tax&go=1'), false)).toBe(true);
    // one try, a clock, lives, or chapter work: these keep their Start button
    for (const q of ['mode=daily&go=1', 'mode=mock&event=accounting&go=1', 'mode=endless&go=1', 'assignment=x&go=1', 'test=x&go=1', 'redo=wrong&go=1'])
      expect(canAutoStart(spec(q), false)).toBe(false);
  });
  it('never skips past a saved run, and never without the flag', () => {
    expect(canAutoStart(spec('mode=quick&go=1'), true)).toBe(false);
    expect(canAutoStart(spec('mode=quick'), false)).toBe(false);
  });
  it("a new member's first set is their main event, or mixed without one", () => {
    expect(spec(firstRunHref('accounting').split('?')[1])).toMatchObject({ mode: 'quick', event: 'accounting', go: true });
    expect(spec(firstRunHref(null).split('?')[1])).toMatchObject({ mode: 'quick', event: MIXED_EVENT, go: true });
  });
});
