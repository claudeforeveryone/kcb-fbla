// Play area data: the member's answer log and attempts (for per-event / per-area stats, previews and the
// question pickers in src/lib/pick.ts), chapter assignments, custom tests, and the daily-challenge clock.
// Grading and Elo are server-side (fbla_submit_attempt via core.submitAttempt).
import { supabase } from '../lib/supabase';
import { toApiError } from './core';
import type { Answer, Diff } from '../lib/score';
import type { Assignment, Attempt, CustomTest } from '../lib/types';

// ------------------------------------------------------------------------------------------------ history

export type HistoryAnswer = {
  question_id: string;
  attempt_id: string;
  event: string | null;
  sub: string | null;
  diff: number | null;
  correct: boolean;
  ms: number;
  elo_delta: number;
  created_at: string;
};

export type HistoryAttempt = Pick<
  Attempt,
  | 'id'
  | 'kind'
  | 'event'
  | 'label'
  | 'total'
  | 'correct'
  | 'duration_ms'
  | 'elo_before'
  | 'elo_after'
  | 'custom_test_id'
  | 'assignment_id'
  | 'created_at'
>;

export type PlayHistory = {
  answers: HistoryAnswer[];
  /** Newest first. */
  attempts: HistoryAttempt[];
  /** Official answers in the shape src/lib/score.ts and src/lib/pick.ts expect (oldest first). */
  log: Answer[];
  /** Official question ids answered before (K = 24 vs 8). */
  seen: Set<string>;
};

const ATTEMPT_COLS =
  'id,kind,event,label,total,correct,duration_ms,elo_before,elo_after,custom_test_id,assignment_id,created_at';
const ANSWER_COLS = 'question_id,attempt_id,event,sub,diff,correct,ms,elo_delta,created_at';

async function uid(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw toApiError(new Error('Sign in first.'));
  return id;
}

type Page<T> = PromiseLike<{ data: T[] | null; error: unknown }>;
async function pageAll<T>(build: (from: number, to: number) => unknown): Promise<T[]> {
  const out: T[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const res = await (build(from, from + size - 1) as Page<T>);
    if (res.error) throw toApiError(res.error as Error);
    const rows = res.data ?? [];
    out.push(...rows);
    if (rows.length < size || out.length >= 20000) break;
  }
  return out;
}

let cached: { uid: string; at: number; p: Promise<PlayHistory> } | null = null;

/** Drop the cached history (call after submitting an attempt). */
export function invalidatePlayHistory() {
  cached = null;
}

/** The member's whole answer log and attempt list, cached for a minute. */
export async function loadPlayHistory(force = false): Promise<PlayHistory> {
  const me = await uid();
  if (!force && cached && cached.uid === me && Date.now() - cached.at < 60_000) return cached.p;
  const p = (async () => {
    const [answers, attempts] = await Promise.all([
      pageAll<HistoryAnswer>((a, b) =>
        supabase.from('fbla_answers').select(ANSWER_COLS).eq('user_id', me).order('id', { ascending: true }).range(a, b),
      ),
      pageAll<HistoryAttempt>((a, b) =>
        supabase
          .from('fbla_attempts')
          .select(ATTEMPT_COLS)
          .eq('user_id', me)
          .order('created_at', { ascending: false })
          .range(a, b),
      ),
    ]);
    const kindOf = new Map(attempts.map((t) => [t.id, t.kind]));
    const seen = new Set<string>();
    const log: Answer[] = [];
    for (const a of answers) {
      if (a.question_id.startsWith('custom:') || !a.event) continue;
      log.push({
        qid: a.question_id,
        topic: a.event,
        sub: a.sub ?? '',
        diff: (a.diff ?? 2) as Diff,
        correct: a.correct,
        first: !seen.has(a.question_id),
        ms: a.ms,
        mode: kindOf.get(a.attempt_id) ?? 'practice',
        at: a.created_at,
      });
      seen.add(a.question_id);
    }
    return { answers, attempts, log, seen };
  })();
  cached = { uid: me, at: Date.now(), p };
  p.catch(() => {
    if (cached?.p === p) cached = null;
  });
  return p;
}

export type EventSummary = {
  event: string;
  answered: number;
  correct: number;
  accuracy: number;
  attempts: number;
  eloDelta: number;
  lastAt: string | null;
};

/** Per-event totals from the answer log (official questions only). */
export function summariseEvents(h: PlayHistory): Map<string, EventSummary> {
  const m = new Map<string, EventSummary>();
  const get = (ev: string) => {
    let s = m.get(ev);
    if (!s) {
      s = { event: ev, answered: 0, correct: 0, accuracy: 0, attempts: 0, eloDelta: 0, lastAt: null };
      m.set(ev, s);
    }
    return s;
  };
  for (const a of h.answers) {
    if (!a.event || a.question_id.startsWith('custom:')) continue;
    const s = get(a.event);
    s.answered++;
    if (a.correct) s.correct++;
    s.eloDelta += a.elo_delta;
    if (!s.lastAt || a.created_at > s.lastAt) s.lastAt = a.created_at;
  }
  for (const t of h.attempts) if (t.event) get(t.event).attempts++;
  for (const s of m.values()) s.accuracy = s.answered ? s.correct / s.answered : 0;
  return m;
}

export type AreaSummary = { sub: string; answered: number; correct: number; accuracy: number; lastAt: string | null };

/** Per competency area totals for one event. */
export function summariseAreas(h: PlayHistory, event: string): Map<string, AreaSummary> {
  const m = new Map<string, AreaSummary>();
  for (const a of h.answers) {
    if (a.event !== event || !a.sub || a.question_id.startsWith('custom:')) continue;
    const s = m.get(a.sub) ?? { sub: a.sub, answered: 0, correct: 0, accuracy: 0, lastAt: null };
    s.answered++;
    if (a.correct) s.correct++;
    if (!s.lastAt || a.created_at > s.lastAt) s.lastAt = a.created_at;
    m.set(a.sub, s);
  }
  for (const s of m.values()) s.accuracy = s.answered ? s.correct / s.answered : 0;
  return m;
}

/** Official questions whose latest answer was wrong, newest first. */
export function openMisses(h: PlayHistory, event?: string | null): string[] {
  const last = new Map<string, { ok: boolean; at: string }>();
  for (const a of h.answers) {
    if (a.question_id.startsWith('custom:')) continue;
    if (event && a.event !== event) continue;
    last.set(a.question_id, { ok: a.correct, at: a.created_at });
  }
  return [...last.entries()]
    .filter(([, v]) => !v.ok)
    .sort((x, y) => y[1].at.localeCompare(x[1].at))
    .map(([id]) => id);
}

/** Best Endless run (most correct answers), optionally per event ('' = mixed). */
export function bestEndless(h: PlayHistory, event?: string | null): HistoryAttempt | null {
  let best: HistoryAttempt | null = null;
  for (const t of h.attempts) {
    if (t.kind !== 'endless') continue;
    if (event !== undefined && (t.event ?? null) !== (event ?? null)) continue;
    if (!best || t.correct > best.correct) best = t;
  }
  return best;
}

// ------------------------------------------------------------------------------------------------ daily clock

const TZ = 'America/Toronto';

/** Calendar day in Toronto (the server's streak clock), "YYYY-MM-DD". */
export function torontoDay(d: Date | string | number = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(d),
  );
}

/** Milliseconds until the next Toronto midnight (when a new daily unlocks). */
export function msUntilNextDay(now = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(now);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const elapsed = (n('hour') * 3600 + n('minute') * 60 + n('second')) * 1000 + now.getMilliseconds();
  return Math.max(1000, 86_400_000 - elapsed);
}

/** Today's daily attempt, if the member already played it. */
export function todaysDaily(h: PlayHistory): HistoryAttempt | null {
  const today = torontoDay();
  return h.attempts.find((t) => t.kind === 'daily' && torontoDay(t.created_at) === today) ?? null;
}

/** Consecutive days (ending today or yesterday) with a daily played. */
export function dailyStreak(h: PlayHistory): number {
  const days = new Set(h.attempts.filter((t) => t.kind === 'daily').map((t) => torontoDay(t.created_at)));
  let d = new Date();
  if (!days.has(torontoDay(d))) d = new Date(d.getTime() - 86_400_000);
  let n = 0;
  while (days.has(torontoDay(d))) {
    n++;
    d = new Date(d.getTime() - 86_400_000);
  }
  return n;
}

// ------------------------------------------------------------------------------------------------ chapter content

export async function getCustomTest(id: string): Promise<CustomTest | null> {
  const res = await supabase.from('fbla_custom_tests').select('*').eq('id', id).maybeSingle<CustomTest>();
  if (res.error) throw toApiError(res.error);
  return res.data;
}

export async function getAssignment(id: string): Promise<Assignment | null> {
  const res = await supabase.from('fbla_assignments').select('*').eq('id', id).maybeSingle<Assignment>();
  if (res.error) throw toApiError(res.error);
  return res.data;
}

export type MyAssignment = Assignment & {
  /** Attempts the member has made for it, newest first. */
  attempts: HistoryAttempt[];
  done: boolean;
  best: HistoryAttempt | null;
  overdue: boolean;
  /** Question count of the custom test, when kind = 'test'. */
  questionCount: number | null;
};

/** Assignments in the member's chapter, open ones first (by due date), with completion. */
export async function listMyAssignments(chapterId: string, history?: PlayHistory): Promise<MyAssignment[]> {
  const res = await supabase
    .from('fbla_assignments')
    .select('*')
    .eq('chapter_id', chapterId)
    .order('due_at', { ascending: true, nullsFirst: false })
    .limit(200)
    .returns<Assignment[]>();
  if (res.error) throw toApiError(res.error);
  const rows = res.data ?? [];
  const h = history ?? (await loadPlayHistory());
  const testIds = rows.filter((r) => r.kind === 'test').map((r) => r.ref);
  const counts = new Map<string, number>();
  if (testIds.length) {
    const t = await supabase.from('fbla_custom_tests').select('id,questions').in('id', testIds);
    if (!t.error) for (const r of (t.data ?? []) as { id: string; questions: unknown[] }[]) counts.set(r.id, r.questions?.length ?? 0);
  }
  const now = Date.now();
  const out = rows.map((r) => {
    const attempts = h.attempts.filter((t) => t.assignment_id === r.id);
    const best = attempts.reduce<HistoryAttempt | null>(
      (b, t) => (!b || t.correct / Math.max(1, t.total) > b.correct / Math.max(1, b.total) ? t : b),
      null,
    );
    return {
      ...r,
      attempts,
      done: attempts.length > 0,
      best,
      overdue: !attempts.length && !!r.due_at && new Date(r.due_at).getTime() < now,
      questionCount: r.kind === 'test' ? (counts.get(r.ref) ?? null) : null,
    };
  });
  return out.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const da = a.due_at ? new Date(a.due_at).getTime() : Infinity;
    const db = b.due_at ? new Date(b.due_at).getTime() : Infinity;
    return da - db || b.created_at.localeCompare(a.created_at);
  });
}

/** How many questions an "official" assignment (ref = event slug) gives. */
export const OFFICIAL_ASSIGNMENT_SIZE = 25;

