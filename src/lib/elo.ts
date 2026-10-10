// Client mirror of the Elo rule in fbla_submit_attempt() (supabase/migrations/0007_core_rpcs.sql).
// The server is authoritative; this exists for previews ("+12 if right") and charts. Keep the two in sync.
//
//   question rating: easy -200, medium 0, hard +200
//   K: 24 the first time a member answers a question, 8 on repeats
//   expected = 1 / (1 + 10^((q - r) / 400))
//   r' = max(0, round(r + K * (score - expected)))      applied answer by answer, in order
//
// Kinds "custom" and "duel" never move Elo, and neither do custom questions (ids starting "custom:").

export type Diff = 1 | 2 | 3;

export const ELO_K_FIRST = 24;
export const ELO_K_REPEAT = 8;
export const ELO_FLOOR = 0;
export const NO_ELO_KINDS = ['custom', 'duel'] as const;

export function questionRating(diff: number): number {
  return diff === 1 ? -200 : diff === 3 ? 200 : 0;
}

export function expectedScore(rating: number, diff: number): number {
  return 1 / (1 + Math.pow(10, (questionRating(diff) - rating) / 400));
}

/** Rating after one answer. */
export function nextRating(rating: number, diff: number, correct: boolean, first: boolean): number {
  const k = first ? ELO_K_FIRST : ELO_K_REPEAT;
  const raw = rating + k * ((correct ? 1 : 0) - expectedScore(rating, diff));
  return Math.max(ELO_FLOOR, Math.round(raw));
}

/** Change from one answer (what the server stores as elo_delta). */
export function eloDelta(rating: number, diff: number, correct: boolean, first: boolean): number {
  return nextRating(rating, diff, correct, first) - rating;
}

/** What a right and a wrong answer would do right now, for "+12 / -9" previews. */
export function eloPreview(rating: number, diff: number, first: boolean): { win: number; loss: number } {
  return { win: eloDelta(rating, diff, true, first), loss: eloDelta(rating, diff, false, first) };
}

export type EloStep = { questionId: string; diff: number; correct: boolean };

/**
 * Replays a run the way the server grades it. `seen` holds question ids the member had answered before this
 * run; repeats inside the run also count as repeats. Returns the rating after each answer and the final one.
 */
export function replayElo(
  start: number,
  steps: EloStep[],
  seen: Iterable<string> = [],
  kind?: string,
): { final: number; deltas: number[] } {
  const done = new Set(seen);
  const noElo = kind !== undefined && (NO_ELO_KINDS as readonly string[]).includes(kind);
  let r = start;
  const deltas = steps.map((s) => {
    if (noElo || s.questionId.startsWith('custom:')) return 0;
    const next = nextRating(r, s.diff, s.correct, !done.has(s.questionId));
    done.add(s.questionId);
    const d = next - r;
    r = next;
    return d;
  });
  return { final: r, deltas };
}

/** Named bands for badges. Thresholds match the elo_300/500/700 achievements. */
export const ELO_TIERS = [
  { min: 0, name: 'Rookie' },
  { min: 150, name: 'Bronze' },
  { min: 300, name: 'Silver' },
  { min: 500, name: 'Gold' },
  { min: 700, name: 'Elite' },
] as const;

export function eloTier(rating: number): (typeof ELO_TIERS)[number] {
  let tier: (typeof ELO_TIERS)[number] = ELO_TIERS[0];
  for (const t of ELO_TIERS) if (rating >= t.min) tier = t;
  return tier;
}
