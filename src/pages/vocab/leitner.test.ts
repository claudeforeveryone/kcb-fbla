import { describe, expect, it } from 'vitest';
import { deckStats, distractors, isDue, learnQueue, review, statusOf, weakestQueue, type ProgressLike } from './leitner';

const now = new Date(2026, 9, 10, 15, 0, 0);
const row = (term_id: string, box: number, dueOffsetDays: number, wrong = 0): ProgressLike => {
  const d = new Date(now);
  d.setDate(d.getDate() + dueOffsetDays);
  return { term_id, box, due_at: d.toISOString(), correct_count: 0, wrong_count: wrong, last_reviewed_at: null };
};

describe('review', () => {
  it('promotes a new term to box 1, due tomorrow', () => {
    const r = review('a', undefined, true, now);
    expect(r.box).toBe(1);
    expect(r.promoted).toBe(true);
    expect(new Date(r.due_at).getDate()).toBe(11);
    expect(r.correct_count).toBe(1);
  });

  it('promotes a due term one box with the matching interval', () => {
    const r = review('a', row('a', 2, 0), true, now);
    expect(r.box).toBe(3);
    expect(new Date(r.due_at).getDate()).toBe(17);
  });

  it('does not promote a term that is not due yet', () => {
    const prev = row('a', 3, 4);
    const r = review('a', prev, true, now);
    expect(r.box).toBe(3);
    expect(r.due_at).toBe(prev.due_at);
    expect(r.promoted).toBe(false);
    expect(r.correct_count).toBe(1);
  });

  it('drops a miss to box 0, due now', () => {
    const r = review('a', row('a', 4, 10), false, now);
    expect(r.box).toBe(0);
    expect(r.demoted).toBe(true);
    expect(isDue(r, now)).toBe(true);
    expect(r.wrong_count).toBe(1);
  });

  it('caps at box 5', () => {
    expect(review('a', row('a', 5, -1), true, now).box).toBe(5);
  });
});

describe('deck helpers', () => {
  const terms = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, sub: id < 'c' ? 'x' : 'y' }));
  const progress = new Map<string, ProgressLike>([
    ['a', row('a', 4, 5)],
    ['b', row('b', 0, -1, 3)],
    ['c', row('c', 2, 0)],
  ]);

  it('counts statuses, due and strength', () => {
    const s = deckStats(terms.map((t) => t.id), progress, now);
    expect(s).toMatchObject({ total: 5, fresh: 2, learning: 1, review: 1, mastered: 1, due: 2 });
    expect(s.strength).toBeCloseTo(6 / 20);
    expect(statusOf(progress.get('a'))).toBe('mastered');
  });

  it('queues due terms weakest first, then new', () => {
    expect(learnQueue(terms, progress, { now, newLimit: 1 }).map((t) => t.id)).toEqual(['b', 'c', 'd']);
  });

  it('drills weakest studied terms', () => {
    expect(weakestQueue(terms, progress, 2).map((t) => t.id)).toEqual(['b', 'c']);
  });

  it('prefers distractors from the same sub-area', () => {
    const d = distractors(terms[0], terms, 1);
    expect(d[0].id).toBe('b');
    expect(distractors(terms[0], terms, 3)).toHaveLength(3);
  });
});
