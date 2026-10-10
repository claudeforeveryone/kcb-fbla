import { describe, expect, it } from 'vitest';
import { eloDelta, eloPreview, eloTier, expectedScore, nextRating, questionRating, replayElo } from './elo';

// Sequences graded by fbla_submit_attempt() on the live database (2026-10-10), so the client mirror is pinned
// to the server: the same answers must give the same deltas.
const DIFF: Record<string, number> = {
  'acc-001': 1, 'acc-002': 1, 'acc-003': 1, 'acc-004': 1, 'acc-005': 3, 'acc-006': 2, 'acc-007': 1,
  'acc-008': 3, 'acc-009': 1, 'acc-010': 2, 'acc-011': 1, 'acc-012': 3, 'law-001': 1, 'law-003': 2,
};
const step = (id: string, correct: boolean) => ({ questionId: id, diff: DIFF[id], correct });
const FIRST_TEN = ['acc-001', 'acc-002', 'acc-003', 'acc-004', 'acc-005', 'acc-006', 'acc-007', 'acc-008', 'acc-009', 'acc-010'];

describe('elo', () => {
  it('rates questions by difficulty', () => {
    expect(questionRating(1)).toBe(-200);
    expect(questionRating(2)).toBe(0);
    expect(questionRating(3)).toBe(200);
  });

  it('expects an even match against a medium question at 0', () => {
    expect(expectedScore(0, 2)).toBeCloseTo(0.5, 10);
    expect(expectedScore(0, 1)).toBeCloseTo(1 / (1 + Math.pow(10, -0.5)), 10);
  });

  it('uses K = 24 first time and K = 8 on repeats', () => {
    expect(eloDelta(0, 2, true, true)).toBe(12);
    expect(eloDelta(0, 2, true, false)).toBe(4);
    expect(eloDelta(400, 2, false, true)).toBe(Math.round(400 - 24 * expectedScore(400, 2)) - 400);
  });

  it('never drops below 0', () => {
    expect(nextRating(0, 1, false, true)).toBe(0);
    expect(nextRating(5, 3, false, true)).toBe(0);
  });

  it('matches the server on a perfect first paper', () => {
    const r = replayElo(0, FIRST_TEN.map((id) => step(id, true)));
    expect(r.deltas).toEqual([6, 6, 5, 5, 18, 11, 5, 17, 4, 9]);
    expect(r.final).toBe(86);
  });

  it('matches the server with repeats and misses', () => {
    const r = replayElo(
      86,
      [step('acc-011', true), step('acc-012', false), step('acc-001', true), step('acc-002', false), step('law-001', false)],
      FIRST_TEN,
    );
    expect(r.deltas).toEqual([4, -8, 1, -7, -20]);
    expect(r.final).toBe(56);
  });

  it('matches the server for a new player starting with a miss', () => {
    const r = replayElo(0, [step('acc-001', false), step('acc-005', true), step('law-003', true)]);
    expect(r.deltas).toEqual([0, 18, 11]);
    expect(r.final).toBe(29);
  });

  it('counts repeats inside the same run', () => {
    const r = replayElo(0, [step('acc-006', true), step('acc-006', true)]);
    expect(r.deltas).toEqual([12, eloDelta(12, 2, true, false)]);
  });

  it('ignores custom questions and no-Elo kinds', () => {
    expect(replayElo(50, [{ questionId: 'custom:t:0', diff: 2, correct: true }]).final).toBe(50);
    expect(replayElo(50, [step('acc-006', true)], [], 'duel').deltas).toEqual([0]);
    expect(replayElo(50, [step('acc-006', true)], [], 'custom').final).toBe(50);
  });

  it('previews win and loss', () => {
    expect(eloPreview(0, 2, true)).toEqual({ win: 12, loss: 0 });
    expect(eloPreview(300, 2, false)).toEqual({ win: eloDelta(300, 2, true, false), loss: eloDelta(300, 2, false, false) });
  });

  it('names tiers', () => {
    expect(eloTier(0).name).toBe('Rookie');
    expect(eloTier(320).name).toBe('Silver');
    expect(eloTier(900).name).toBe('Elite');
  });
});
