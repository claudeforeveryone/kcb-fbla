// Arena: 1v1 duels and friends (supabase/migrations/0010_arena.sql).
// Every write goes through a security-definer RPC; reads use RLS (participants only, the opponent's per-question
// run only once a duel is complete).
import { supabase } from '../lib/supabase';
import { profileSearchFilter } from '../lib/search';
import {
  PROFILE_CARD_COLUMNS,
  type Duel,
  type EventSlug,
  type Friend,
  type ProfileCard,
} from '../lib/types';
import { toApiError } from './core';
import { applyKeys, getQuestionKeys, type QuestionKey } from './keys';

// ------------------------------------------------------------------------------------------------ types

export type ArenaEvent = EventSlug | 'mixed';

/** public.fbla_duels with the Arena columns added in 0010. */
export type DuelRow = Duel & {
  time_limit_sec: number;
  message: string | null;
  /** Set when the duel ended because this player did not play in time. */
  forfeit_by: string | null;
  /** Whether each side has played (their score itself stays hidden until the duel is complete). */
  challenger_done?: boolean;
  opponent_done?: boolean;
};

export type DuelRunAnswer = {
  question_id: string;
  chosen: number | null;
  correct: boolean;
  correct_choice: number;
  ms: number;
};

/** public.fbla_duel_runs: one player's play of a duel. */
export type DuelRun = {
  duel_id: string;
  user_id: string;
  started_at: string;
  finished_at: string | null;
  score: number | null;
  ms: number | null;
  answers: DuelRunAnswer[];
  attempt_id: string | null;
};

export type DuelQuestion = {
  id: string;
  event: string;
  sub: string | null;
  diff: 1 | 2 | 3 | null;
  q: string;
  choices: string[];
  /** Only loaded for results (never while playing). */
  answer?: number;
  explain?: string | null;
};

export type StartDuelResult = {
  started_at: string;
  deadline: string;
  server_now: string;
  finished: boolean;
  /** The duel's questions in order (text and choices only). Only handed out once your clock has started. */
  question_ids: string[];
  questions: DuelQuestion[];
};

export type SubmitDuelResult = {
  duel_id: string;
  status: DuelRow['status'];
  winner_id: string | null;
  score: number;
  ms: number;
  total: number;
  attempt_id: string | null;
  answers: DuelRunAnswer[];
  achievements: string[];
};

export type DuelAnswerInput = { question_id: string; chosen: number | null; ms: number };

export const DUEL_CLOCKS = [
  { sec: 180, label: '3 min', name: 'Blitz' },
  { sec: 300, label: '5 min', name: 'Standard' },
  { sec: 600, label: '10 min', name: 'Relaxed' },
] as const;
export type DuelClock = (typeof DUEL_CLOCKS)[number]['sec'];

export const DUEL_QUESTIONS = 10;

// ------------------------------------------------------------------------------------------------ duels

/** Settles anything overdue (expired challenges, forfeits). Safe to call often; failures are ignored. */
export async function sweepDuels(): Promise<void> {
  const { error } = await supabase.rpc('fbla_arena_sweep');
  if (error) console.warn('[arena] sweep failed', error.message);
}

// Duels are read through fbla_my_duels (0015): question_ids stay empty until you start your run, and the other
// side's score and time stay null until the duel is complete. `challenger_done` / `opponent_done` say who played.
// `uid` is kept for callers; the server always answers for the signed-in user.
export async function listMyDuels(_uid: string, limit = 150, openOnly = false): Promise<DuelRow[]> {
  const { data, error } = await supabase.rpc('fbla_my_duels', { p_id: null, p_limit: limit, p_open: openOnly });
  if (error) throw toApiError(error, 'Could not load your duels.');
  return (data ?? []) as DuelRow[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getDuel(id: string): Promise<DuelRow | null> {
  if (!UUID_RE.test(id)) return null;
  const { data, error } = await supabase.rpc('fbla_my_duels', { p_id: id, p_limit: 1, p_open: false });
  if (error) throw toApiError(error, 'Could not load this duel.');
  return ((data ?? []) as DuelRow[])[0] ?? null;
}

/** Your own run always; the opponent's too once the duel is complete. */
export async function getDuelRuns(duelId: string): Promise<DuelRun[]> {
  const { data, error } = await supabase.from('fbla_duel_runs').select('*').eq('duel_id', duelId);
  if (error) throw toApiError(error, 'Could not load the duel results.');
  return (data ?? []) as DuelRun[];
}

/**
 * Question text in duel order. `withKey` adds the answer and explanation, which the server only hands out for
 * questions you have already answered (results only). While playing, use the questions startDuel() returns.
 */
export async function getDuelQuestions(ids: string[], withKey = false): Promise<DuelQuestion[]> {
  if (ids.length === 0) return [];
  const [res, keys] = await Promise.all([
    supabase.from('fbla_questions').select('id,event,sub,diff,q,choices').in('id', ids),
    withKey ? getQuestionKeys(ids) : Promise.resolve(new Map<string, QuestionKey>()),
  ]);
  if (res.error) throw toApiError(res.error, 'Could not load the questions.');
  const byId = new Map(((res.data ?? []) as unknown as DuelQuestion[]).map((q) => [q.id, q]));
  return applyKeys(
    ids.map((id) => byId.get(id)).filter((q): q is DuelQuestion => !!q),
    keys,
  );
}

export async function challengePlayer(input: {
  opponentId: string;
  event: ArenaEvent;
  timeLimitSec?: DuelClock;
  message?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc('fbla_challenge', {
    p_opponent: input.opponentId,
    p_event: input.event,
    p_time_limit_sec: input.timeLimitSec ?? 300,
    p_message: input.message?.trim() || null,
  });
  if (error) throw toApiError(error, 'Could not send the challenge.');
  return data as string;
}

export async function respondDuel(id: string, accept: boolean): Promise<DuelRow> {
  const { data, error } = await supabase.rpc('fbla_respond_duel', { p_duel: id, p_accept: accept });
  if (error) throw toApiError(error, 'Could not answer the challenge.');
  return data as DuelRow;
}

export async function cancelDuel(id: string): Promise<DuelRow> {
  const { data, error } = await supabase.rpc('fbla_cancel_duel', { p_duel: id });
  if (error) throw toApiError(error, 'Could not cancel the challenge.');
  return data as DuelRow;
}

/** Starts or resumes your clock; calling it again never resets it. */
export async function startDuel(id: string): Promise<StartDuelResult> {
  const { data, error } = await supabase.rpc('fbla_start_duel', { p_duel: id });
  if (error) throw toApiError(error, 'Could not start the duel.');
  return data as StartDuelResult;
}

export async function submitDuel(id: string, answers: DuelAnswerInput[]): Promise<SubmitDuelResult> {
  const { data, error } = await supabase.rpc('fbla_submit_duel', { p_duel: id, p_answers: answers });
  if (error) throw toApiError(error, 'Could not submit your answers.');
  return data as SubmitDuelResult;
}

// ------------------------------------------------------------------------------------------------ friends

export type FriendLink = {
  other: string;
  status: Friend['status'];
  /** 'out' = you asked them, 'in' = they asked you. */
  direction: 'in' | 'out';
  created_at: string;
};

export async function listFriendLinks(uid: string): Promise<FriendLink[]> {
  const { data, error } = await supabase
    .from('fbla_friends')
    .select('*')
    .or(`user_id.eq.${uid},friend_id.eq.${uid}`)
    .order('created_at', { ascending: false });
  if (error) throw toApiError(error, 'Could not load your friends.');
  return ((data ?? []) as Friend[]).map((f) => ({
    other: f.user_id === uid ? f.friend_id : f.user_id,
    status: f.status,
    direction: f.user_id === uid ? 'out' : 'in',
    created_at: f.created_at,
  }));
}

/** Sends a request (or accepts theirs if they already asked). Returns the resulting status. */
export async function sendFriendRequest(userId: string): Promise<'pending' | 'accepted'> {
  const { data, error } = await supabase.rpc('fbla_friend_request', { p_user: userId });
  if (error) throw toApiError(error, 'Could not send the friend request.');
  return data as 'pending' | 'accepted';
}

export async function respondFriendRequest(userId: string, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc('fbla_friend_respond', { p_user: userId, p_accept: accept });
  if (error) throw toApiError(error, 'Could not answer the friend request.');
}

/** Unfriend, cancel your request, or ignore theirs. */
export async function removeFriend(userId: string): Promise<void> {
  const { error } = await supabase.rpc('fbla_friend_remove', { p_user: userId });
  if (error) throw toApiError(error, 'Could not update your friends.');
}

// ------------------------------------------------------------------------------------------------ players

export async function getPlayerCards(ids: string[]): Promise<ProfileCard[]> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (uniq.length === 0) return [];
  const { data, error } = await supabase.from('fbla_profiles').select(PROFILE_CARD_COLUMNS).in('id', uniq);
  if (error) throw toApiError(error, 'Could not load players.');
  return (data ?? []) as unknown as ProfileCard[];
}

export async function getPlayerCardByUsername(username: string): Promise<ProfileCard | null> {
  const u = username.trim().toLowerCase().replace(/^@/, '');
  if (!u) return null;
  const { data, error } = await supabase.from('fbla_profiles').select(PROFILE_CARD_COLUMNS).eq('username', u).maybeSingle();
  if (error) throw toApiError(error, 'Could not find that player.');
  return (data as unknown as ProfileCard | null) ?? null;
}

/** Username prefix or display-name search for the challenge picker. Excludes `exceptId`. */
export async function searchPlayers(query: string, exceptId?: string, limit = 8): Promise<ProfileCard[]> {
  const filter = profileSearchFilter(query);
  if (!filter) return [];
  let req = supabase
    .from('fbla_profiles')
    .select(PROFILE_CARD_COLUMNS)
    .or(filter)
    .order('elo', { ascending: false })
    .limit(limit);
  if (exceptId) req = req.neq('id', exceptId);
  const { data, error } = await req;
  if (error) throw toApiError(error, 'Search failed.');
  return (data ?? []) as unknown as ProfileCard[];
}

// ------------------------------------------------------------------------------------------------ realtime

/**
 * Live updates for everything Arena shows a user: duels on either side and friend links on either side.
 * Returns an unsubscribe function.
 */
export function subscribeArena(
  uid: string,
  handlers: { onDuel?: (row: DuelRow, kind: 'INSERT' | 'UPDATE' | 'DELETE') => void; onFriends?: () => void },
): () => void {
  const tag = Math.random().toString(36).slice(2, 8);
  // Realtime payloads only carry the columns clients may read (no questions or hidden scores), so re-read the row.
  const duel = (p: { eventType: string; new: unknown; old: unknown }) => {
    const kind = p.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
    const raw = (kind === 'DELETE' ? p.old : p.new) as DuelRow;
    if (!raw?.id) return;
    if (kind === 'DELETE') return handlers.onDuel?.(raw, kind);
    void getDuel(raw.id)
      .then((row) => row && handlers.onDuel?.(row, kind))
      .catch(() => {});
  };
  const friends = () => handlers.onFriends?.();
  const ch = supabase
    .channel(`arena-${uid}-${tag}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'fbla_duels', filter: `opponent_id=eq.${uid}` }, duel)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'fbla_duels', filter: `challenger_id=eq.${uid}` }, duel)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'fbla_friends', filter: `friend_id=eq.${uid}` }, friends)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'fbla_friends', filter: `user_id=eq.${uid}` }, friends)
    .subscribe();
  return () => {
    void supabase.removeChannel(ch);
  };
}

/** Live updates for one duel. */
export function subscribeDuel(id: string, onChange: (row: DuelRow) => void): () => void {
  const ch = supabase
    .channel(`duel-${id}-${Math.random().toString(36).slice(2, 8)}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'fbla_duels', filter: `id=eq.${id}` }, () => {
      // the payload lacks the masked columns; read the row the server is willing to show
      void getDuel(id)
        .then((row) => row && onChange(row))
        .catch(() => {});
    })
    .subscribe();
  return () => {
    void supabase.removeChannel(ch);
  };
}

// ------------------------------------------------------------------------------------------------ helpers

export type DuelOutcome = 'win' | 'loss' | 'draw';

/** The duel from one player's side. */
export function duelSide(d: DuelRow, uid: string) {
  const isChallenger = d.challenger_id === uid;
  return {
    isChallenger,
    opponentId: isChallenger ? d.opponent_id : d.challenger_id,
    myScore: isChallenger ? d.challenger_score : d.opponent_score,
    myMs: isChallenger ? d.challenger_ms : d.opponent_ms,
    theirScore: isChallenger ? d.opponent_score : d.challenger_score,
    theirMs: isChallenger ? d.opponent_ms : d.challenger_ms,
    iPlayed: (isChallenger ? d.challenger_score : d.opponent_score) != null,
    theyPlayed: (isChallenger ? d.opponent_score : d.challenger_score) != null,
  };
}

export function duelOutcome(d: DuelRow, uid: string): DuelOutcome | null {
  if (d.status !== 'complete') return null;
  if (!d.winner_id) return 'draw';
  return d.winner_id === uid ? 'win' : 'loss';
}

export type DuelBucket = 'incoming' | 'outgoing' | 'your-move' | 'their-move' | 'done';

export function duelBucket(d: DuelRow, uid: string): DuelBucket {
  if (d.status === 'pending') return d.opponent_id === uid ? 'incoming' : 'outgoing';
  if (d.status === 'accepted') return duelSide(d, uid).iPlayed ? 'their-move' : 'your-move';
  return 'done';
}

export type DuelRecord = { wins: number; losses: number; draws: number; played: number; streak: number; streakKind: DuelOutcome | null };

/** W/L/D from a list of duels (newest first). `streak` counts the latest run of the same outcome. */
export function duelRecord(duels: DuelRow[], uid: string, opponentId?: string): DuelRecord {
  const r: DuelRecord = { wins: 0, losses: 0, draws: 0, played: 0, streak: 0, streakKind: null };
  let streakOpen = true;
  for (const d of duels) {
    if (opponentId && duelSide(d, uid).opponentId !== opponentId) continue;
    const o = duelOutcome(d, uid);
    if (!o) continue;
    r.played++;
    if (o === 'win') r.wins++;
    else if (o === 'loss') r.losses++;
    else r.draws++;
    if (streakOpen) {
      if (r.streakKind == null) {
        r.streakKind = o;
        r.streak = 1;
      } else if (r.streakKind === o) r.streak++;
      else streakOpen = false;
    }
  }
  return r;
}

/** "1:05" style duration, "0.0s" under a minute for per-question times. */
export function fmtMs(ms: number | null | undefined, precise = false): string {
  if (ms == null) return '-';
  const s = Math.max(0, ms) / 1000;
  if (precise && s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}
