// Client mirror of the Elo rule in fbla_submit_attempt() (supabase/migrations/0014_answer_keys_and_elo.sql).
// The server is authoritative; this exists for previews ("+12 if right") and charts. Keep the two in sync.
//
//   question rating: easy -200, medium 0, hard +200
//   K: 24 on a member's first graded answer to a question, 0 afterwards (repeats, and questions whose key the member
//      saw before answering, never move Elo; the same question twice in one attempt counts once)
//   expected = 1 / (1 + 10^((q - r) / 400))
//   r' = max(0, r + K * (score - expected))      applied answer by answer, kept unrounded (profiles.elo_exact)
//   shown rating = round(r'); each answer's elo_delta = round(r') - round(r), so the deltas add up to the change
//
// Kinds "custom" and "duel" never move Elo, and neither do custom questions (ids starting "custom:").

export type Diff = 1 | 2 | 3;

export const ELO_K_FIRST = 24;
export const ELO_K_REPEAT = 0;
export const ELO_FLOOR = 0;
export const NO_ELO_KINDS = ['custom', 'duel'] as const;

export function questionRating(diff: number): number {
  return diff === 1 ? -200 : diff === 3 ? 200 : 0;
}

export function expectedScore(rating: number, diff: number): number {
  return 1 / (1 + Math.pow(10, (questionRating(diff) - rating) / 400));
}

/** Unrounded rating after one answer. */
export function nextRatingExact(rating: number, diff: number, correct: boolean, first: boolean): number {
  const k = first ? ELO_K_FIRST : ELO_K_REPEAT;
  if (k === 0) return rating;
  return Math.max(ELO_FLOOR, rating + k * ((correct ? 1 : 0) - expectedScore(rating, diff)));
}

/** Rating after one answer, rounded the way the profile shows it. */
export function nextRating(rating: number, diff: number, correct: boolean, first: boolean): number {
  return Math.round(nextRatingExact(rating, diff, correct, first));
}

/** Change from one answer (what the server stores as elo_delta). */
export function eloDelta(rating: number, diff: number, correct: boolean, first: boolean): number {
  return Math.round(nextRatingExact(rating, diff, correct, first)) - Math.round(rating);
}

/** What a right and a wrong answer would do right now, for "+12 / -9" previews. */
export function eloPreview(rating: number, diff: number, first: boolean): { win: number; loss: number } {
  return { win: eloDelta(rating, diff, true, first), loss: eloDelta(rating, diff, false, first) };
}

export type EloStep = { questionId: string; diff: number; correct: boolean };

/**
 * Replays a run the way the server grades it. `seen` holds question ids the member had answered (or seen the key
 * of) before this run. A question already in this run is skipped (the server ignores duplicates). `start` may be
 * the unrounded rating. Returns the rating after the run, the unrounded one, and each answer's delta.
 */
export function replayElo(
  start: number,
  steps: EloStep[],
  seen: Iterable<string> = [],
  kind?: string,
): { final: number; exact: number; deltas: number[] } {
  const done = new Set(seen);
  const inRun = new Set<string>();
  const noElo = kind !== undefined && (NO_ELO_KINDS as readonly string[]).includes(kind);
  let r = start;
  const deltas = steps.map((s) => {
    if (noElo || s.questionId.startsWith('custom:') || inRun.has(s.questionId)) return 0;
    inRun.add(s.questionId);
    const next = nextRatingExact(r, s.diff, s.correct, !done.has(s.questionId));
    done.add(s.questionId);
    const d = Math.round(next) - Math.round(r);
    r = next;
    return d;
  });
  return { final: Math.round(r), exact: r, deltas };
}

/** Named bands for badges. Thresholds match the elo_300/500/700 achievements. */
