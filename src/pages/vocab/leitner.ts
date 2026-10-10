// Leitner spaced repetition for fbla_vocab_progress (box 0-5, 4+ mastered).
//
// - No row: the term is new.
// - A miss drops the term to box 0, due again right away.
// - A correct answer on a term that is due (or new) moves it up one box and schedules it BOX_DAYS[box] days out.
// - A correct answer on a term that is not due yet is counted but does not promote it, so cramming the same deck
//   five times in one evening cannot fake mastery.

export const MAX_BOX = 5;
export const MASTERED_BOX = 4;
/** Days until the next review after landing in box i. */
export const BOX_DAYS = [0, 1, 3, 7, 14, 30] as const;

export type ProgressLike = {
  term_id: string;
  box: number;
  due_at: string;
  correct_count: number;
  wrong_count: number;
  last_reviewed_at: string | null;
};

export type TermStatus = 'new' | 'learning' | 'review' | 'mastered';

export const STATUS_LABEL: Record<TermStatus, string> = {
  new: 'New',
  learning: 'Learning',
  review: 'Reviewing',
  mastered: 'Mastered',
};

export function endOfDay(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function addDays(now: Date, days: number): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  return d;
}

export function statusOf(p: ProgressLike | undefined): TermStatus {
  if (!p) return 'new';
  if (p.box >= MASTERED_BOX) return 'mastered';
  if (p.box >= 2) return 'review';
  return 'learning';
}

/** Due today (anything scheduled up to the end of the local day). New terms are not "due". */
export function isDue(p: ProgressLike | undefined, now: Date = new Date()): boolean {
  return !!p && new Date(p.due_at).getTime() <= endOfDay(now).getTime();
}

export type ReviewResult = ProgressLike & { promoted: boolean; demoted: boolean };

export function review(
  termId: string,
  prev: ProgressLike | undefined,
  correct: boolean,
  now: Date = new Date(),
): ReviewResult {
  const at = now.toISOString();
  const base: ProgressLike = prev ?? {
    term_id: termId,
    box: 0,
    due_at: at,
    correct_count: 0,
    wrong_count: 0,
    last_reviewed_at: null,
  };
  if (!correct) {
    return {
      ...base,
      term_id: termId,
      box: 0,
      due_at: at,
      wrong_count: base.wrong_count + 1,
      last_reviewed_at: at,
      promoted: false,
      demoted: !!prev && prev.box > 0,
    };
  }
  const eligible = !prev || isDue(prev, now);
  if (!eligible) {
    return {
      ...base,
      term_id: termId,
      correct_count: base.correct_count + 1,
      last_reviewed_at: at,
      promoted: false,
      demoted: false,
    };
  }
  const box = Math.min(MAX_BOX, (prev?.box ?? 0) + 1);
  return {
    ...base,
    term_id: termId,
    box,
    due_at: addDays(now, BOX_DAYS[box]).toISOString(),
    correct_count: base.correct_count + 1,
    last_reviewed_at: at,
    promoted: true,
    demoted: false,
  };
}

export type DeckStats = {
  total: number;
  fresh: number;
  learning: number;
  review: number;
  mastered: number;
  due: number;
  /** 0..1, weighted by box so the ring grows with every promotion, not only at mastery. */
  strength: number;
  /** Earliest future due date among studied terms that are not due today. */
  nextDue: string | null;
};

export function deckStats(
  termIds: readonly string[],
  progress: ReadonlyMap<string, ProgressLike>,
  now: Date = new Date(),
): DeckStats {
  const s: DeckStats = { total: termIds.length, fresh: 0, learning: 0, review: 0, mastered: 0, due: 0, strength: 0, nextDue: null };
  let pts = 0;
  for (const id of termIds) {
    const p = progress.get(id);
    const st = statusOf(p);
    if (st === 'new') s.fresh++;
    else if (st === 'learning') s.learning++;
    else if (st === 'review') s.review++;
    else s.mastered++;
    if (p) {
      pts += Math.min(p.box, MASTERED_BOX);
      if (isDue(p, now)) s.due++;
      else if (!s.nextDue || p.due_at < s.nextDue) s.nextDue = p.due_at;
    }
  }
  s.strength = termIds.length ? pts / (termIds.length * MASTERED_BOX) : 0;
  return s;
}

/**
 * A Learn session: everything due (weakest box first, oldest due first), then up to `newLimit` new terms in deck
 * order, capped at `max`.
 */
export function learnQueue<T extends { id: string }>(
  terms: readonly T[],
  progress: ReadonlyMap<string, ProgressLike>,
  opts: { newLimit?: number; max?: number; now?: Date } = {},
): T[] {
  const { newLimit = 10, max = 20, now = new Date() } = opts;
  const due = terms
    .filter((t) => isDue(progress.get(t.id), now))
    .sort((a, b) => {
      const pa = progress.get(a.id)!;
      const pb = progress.get(b.id)!;
      return pa.box - pb.box || pa.due_at.localeCompare(pb.due_at);
    });
  const fresh = terms.filter((t) => !progress.has(t.id)).slice(0, newLimit);
  return [...due, ...fresh].slice(0, max);
}

/** Terms to drill when nothing is due: lowest box first, most-missed first. Does not promote (not due). */
export function weakestQueue<T extends { id: string }>(
  terms: readonly T[],
  progress: ReadonlyMap<string, ProgressLike>,
  max = 10,
): T[] {
  return terms
    .filter((t) => progress.has(t.id))
    .sort((a, b) => {
      const pa = progress.get(a.id)!;
      const pb = progress.get(b.id)!;
      return pa.box - pb.box || pb.wrong_count - pa.wrong_count;
    })
    .slice(0, max);
}

export function shuffled<T>(list: readonly T[], rand: () => number = Math.random): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** `count` wrong options for `answer`, preferring terms from the same sub-area so the choice is not trivial. */
export function distractors<T extends { id: string; sub?: string | null }>(
  answer: T,
  pool: readonly T[],
  count = 3,
  rand: () => number = Math.random,
): T[] {
  const others = pool.filter((t) => t.id !== answer.id);
  const same = shuffled(
    others.filter((t) => answer.sub && t.sub === answer.sub),
    rand,
  );
  const rest = shuffled(
    others.filter((t) => !(answer.sub && t.sub === answer.sub)),
    rand,
  );
  return [...same, ...rest].slice(0, count);
}

export function relativeDue(iso: string, now: Date = new Date()): string {
  const days = Math.round((endOfDay(new Date(iso)).getTime() - endOfDay(now).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 7) return `in ${days} days`;
  if (days < 14) return 'next week';
  if (days < 60) return `in ${Math.round(days / 7)} weeks`;
  return `in ${Math.round(days / 30)} months`;
}
