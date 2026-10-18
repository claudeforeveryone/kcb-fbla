// Small queries the Home dashboard needs beyond src/api/core.ts. Read-only; RLS scopes every one to the caller.
import { supabase } from '../../lib/supabase';
import { runHref } from '../play/runLogic';
import { toApiError } from '../../api/core';
import {
  CHAPTER_COLUMNS,
  PROFILE_CARD_COLUMNS,
  type Assignment,
  type Attempt,
  type Chapter,
  type ChapterRole,
  type Duel,
  type ProfileCard,
} from '../../lib/types';

// ------------------------------------------------------------------------------------------------ time

const TZ = 'America/Toronto';

/** YYYY-MM-DD for a moment in America/Toronto (the server's streak day). */
export function torontoDay(at: Date | string | number = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(at),
  );
}

/** The next midnight in Toronto, when the daily challenge and streak day roll over. */
export function nextTorontoMidnight(now = Date.now()): Date {
  const today = torontoDay(now);
  // Walk forward in 15-minute steps until the Toronto day changes (handles DST without a tz library).
  let t = now - (now % (15 * 60_000)) + 15 * 60_000;
  for (let i = 0; i < 200 && torontoDay(t) === today; i++) t += 15 * 60_000;
  // Step back to the exact minute.
  while (torontoDay(t - 60_000) !== today) t -= 60_000;
  return new Date(t);
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
export function timeAgo(at: string | number | Date, now = Date.now()): string {
  const s = Math.round((new Date(at).getTime() - now) / 1000);
  const abs = Math.abs(s);
  if (abs < 45) return 'just now';
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  if (abs < 86400 * 7) return rtf.format(Math.round(s / 86400), 'day');
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** "Due tomorrow", "Due Fri, Oct 17", "Overdue by 2 days". */
export function dueLabel(due: string | null, now = Date.now()): { text: string; tone: 'red' | 'warning' | 'neutral' } {
  if (!due) return { text: 'No due date', tone: 'neutral' };
  const ms = new Date(due).getTime() - now;
  const days = Math.round(ms / 86_400_000);
  if (ms < 0) {
    const late = Math.max(1, Math.round(-ms / 86_400_000));
    return { text: -ms < 86_400_000 ? 'Overdue' : `Overdue by ${late} day${late === 1 ? '' : 's'}`, tone: 'red' };
  }
  if (ms < 86_400_000) {
    const sameDay = torontoDay(due) === torontoDay(now);
    const time = new Date(due).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return { text: `${sameDay ? 'Due today' : 'Due tomorrow'}, ${time}`, tone: 'warning' };
  }
  if (days <= 6) return { text: `Due ${new Date(due).toLocaleDateString(undefined, { weekday: 'long' })}`, tone: days <= 2 ? 'warning' : 'neutral' };
  return { text: `Due ${new Date(due).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`, tone: 'neutral' };
}

// ------------------------------------------------------------------------------------------------ daily

export type DailyStatus = { done: false } | { done: true; attempt: Attempt };

/** Whether the caller has already played today's daily challenge (Toronto day). */
export async function getDailyStatus(uid: string): Promise<DailyStatus> {
  const since = new Date(Date.now() - 36 * 3600_000).toISOString();
  const res = await supabase
    .from('fbla_attempts')
    .select('*')
    .eq('user_id', uid)
    .eq('kind', 'daily')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(5)
    .returns<Attempt[]>();
  if (res.error) throw toApiError(res.error);
  const today = torontoDay();
  const hit = (res.data ?? []).find((a) => torontoDay(a.created_at) === today);
  return hit ? { done: true, attempt: hit } : { done: false };
}

// ------------------------------------------------------------------------------------------------ duels

export type DuelItem = {
  duel: Duel;
  opponent: ProfileCard | null;
  /** incoming: someone challenged you. yourTurn: accepted, you haven't played. waiting: you sent it / you played. */
  state: 'incoming' | 'yourTurn' | 'waiting';
};

export async function getOpenDuels(uid: string): Promise<DuelItem[]> {
  // masked rows (0015): your own score is visible, theirs only once the duel is complete
  const res = await supabase.rpc('fbla_my_duels', { p_id: null, p_limit: 20, p_open: true });
  if (res.error) throw toApiError(res.error);
  const duels = (res.data ?? []) as Duel[];
  const otherIds = [...new Set(duels.map((d) => (d.challenger_id === uid ? d.opponent_id : d.challenger_id)))];
  const people = await getCards(otherIds);
  const order = { incoming: 0, yourTurn: 1, waiting: 2 } as const;
  return duels
    .map((duel): DuelItem => {
      const mine = duel.challenger_id === uid;
      const myScore = mine ? duel.challenger_score : duel.opponent_score;
      const state: DuelItem['state'] =
        duel.status === 'pending' ? (mine ? 'waiting' : 'incoming') : myScore == null ? 'yourTurn' : 'waiting';
      return { duel, state, opponent: people.get(mine ? duel.opponent_id : duel.challenger_id) ?? null };
    })
    .sort((a, b) => order[a.state] - order[b.state]);
}

async function getCards(ids: string[]): Promise<Map<string, ProfileCard>> {
  if (ids.length === 0) return new Map();
  const res = await supabase.from('fbla_profiles').select(PROFILE_CARD_COLUMNS).in('id', ids).returns<ProfileCard[]>();
  if (res.error) throw toApiError(res.error);
  return new Map((res.data ?? []).map((p) => [p.id, p]));
}

// ------------------------------------------------------------------------------------------------ assignments

export type AssignmentItem = Assignment & { done: boolean };

/** Chapter assignments, open (not completed by you) ones first, soonest due first. */
export async function getAssignments(uid: string, chapterId: string): Promise<AssignmentItem[]> {
  const res = await supabase
    .from('fbla_assignments')
    .select('*')
    .eq('chapter_id', chapterId)
    .order('due_at', { ascending: true, nullsFirst: false })
    .limit(30)
    .returns<Assignment[]>();
  if (res.error) throw toApiError(res.error);
  const list = res.data ?? [];
  if (list.length === 0) return [];
  const done = await supabase
    .from('fbla_attempts')
    .select('assignment_id')
    .eq('user_id', uid)
    .in(
      'assignment_id',
      list.map((a) => a.id),
    )
    .returns<{ assignment_id: string }[]>();
  if (done.error) throw toApiError(done.error);
  const doneSet = new Set((done.data ?? []).map((d) => d.assignment_id));
  // Keep everything you still owe, plus finished ones whose due date hasn't passed (shown ticked off).
  const now = Date.now();
  return list
    .map((a) => ({ ...a, done: doneSet.has(a.id) }))
    .filter((a) => !a.done || (a.due_at != null && new Date(a.due_at).getTime() > now));
}

// ------------------------------------------------------------------------------------------------ chapter

export type ChapterSummary = {
  chapter: Chapter;
  role: ChapterRole | null;
  memberCount: number;
  rank: number | null;
  chapters: number | null;
  totalElo: number | null;
  avgElo: number | null;
  /** Up to 5 members by Elo, for the face pile. */
  faces: ProfileCard[];
};

export async function getChapterSummary(uid: string, chapterId: string): Promise<ChapterSummary | null> {
  const [ch, mem, count, faces, board] = await Promise.all([
    supabase.from('fbla_chapters').select(CHAPTER_COLUMNS).eq('id', chapterId).maybeSingle<Chapter>(),
    supabase.from('fbla_chapter_members').select('role').eq('user_id', uid).maybeSingle<{ role: ChapterRole }>(),
    supabase.from('fbla_chapter_members').select('user_id', { count: 'exact', head: true }).eq('chapter_id', chapterId),
    supabase
      .from('fbla_profiles')
      .select(PROFILE_CARD_COLUMNS)
      .eq('chapter_id', chapterId)
      .order('elo', { ascending: false })
      .limit(5)
      .returns<ProfileCard[]>(),
    supabase.rpc('fbla_chapter_leaderboard', { p_limit: 500, p_offset: 0 }),
  ]);
  if (ch.error) throw toApiError(ch.error);
  if (!ch.data) return null;
  type Row = { rank: number; is_mine: boolean; total_count: number; total_elo: number; avg_elo: number; chapter_id: string };
  const rows = (board.data as Row[] | null) ?? [];
  const mine = rows.find((r) => r.chapter_id === chapterId);
  return {
    chapter: ch.data,
    role: mem.data?.role ?? null,
    memberCount: count.count ?? 0,
    rank: mine ? Number(mine.rank) : null,
    chapters: rows.length ? Number(rows[0].total_count) : null,
    totalElo: mine ? Number(mine.total_elo) : null,
    avgElo: mine ? Math.round(Number(mine.avg_elo)) : null,
    faces: faces.data ?? [],
  };
}

// ------------------------------------------------------------------------------------------------ vocab

/** Vocab cards whose Leitner review is due now, plus how many are mastered. */
export async function getVocabDue(uid: string): Promise<{ due: number; mastered: number; started: number }> {
  const now = new Date().toISOString();
  const [due, mastered, started] = await Promise.all([
    supabase.from('fbla_vocab_progress').select('term_id', { count: 'exact', head: true }).eq('user_id', uid).lte('due_at', now),
    supabase.from('fbla_vocab_progress').select('term_id', { count: 'exact', head: true }).eq('user_id', uid).gte('box', 4),
    supabase.from('fbla_vocab_progress').select('term_id', { count: 'exact', head: true }).eq('user_id', uid),
  ]);
  const err = due.error ?? mastered.error ?? started.error;
  if (err) throw toApiError(err);
  return { due: due.count ?? 0, mastered: mastered.count ?? 0, started: started.count ?? 0 };
}

// ------------------------------------------------------------------------------------------------ run links

/**
 * Links into the exam runner, in Play's /play/run vocabulary (mode, event, area, n). `kind` is the Home-side name
 * for the run: practice without an event is a mixed Quick 10, practice with one is a focused practice set.
 */
export function runLink(p: { kind: string; event?: string | null; n?: number; sub?: string | null }): string {
  const mode = p.kind === 'practice' ? (p.event ? 'practice' : 'quick') : p.kind;
  return runHref({ mode, event: p.event ?? null, n: mode === 'quick' ? null : (p.n ?? null), area: p.sub ?? null });
}
