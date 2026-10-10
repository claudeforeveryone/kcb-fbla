// Me area: profile pages, career history, wrong-question review, friends and account settings.
// Builds on src/api/core.ts; every function throws ApiError with a toast-ready message on failure.
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { loadQuestions, type Question } from '../lib/content';
import {
  ApiError,
  getProfileByUsername,
  playerLeaderboard,
  profileStats,
  toApiError,
} from './core';
import type { Attempt, AttemptKind, FriendStatus, PlayerLeaderboardRow, Profile, ProfileStats } from '../lib/types';

function must<T>(res: { data: T | null; error: PostgrestError | null }, fallback?: string): T {
  if (res.error) throw toApiError(res.error, fallback);
  return res.data as T;
}

async function myUid(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) throw new ApiError('You are signed out. Sign in and try again.', '42501');
  return uid;
}

// ------------------------------------------------------------------------------------------------ profile page

/** Stats for /me (username null) or /u/:username. null when the username does not exist. */
export async function loadProfilePage(username: string | null): Promise<ProfileStats | null> {
  if (!username) return profileStats();
  const p = await getProfileByUsername(username);
  if (!p) return null;
  return profileStats(p.id);
}

export type MiniBoard = {
  top: PlayerLeaderboardRow[];
  around: PlayerLeaderboardRow[];
  me: PlayerLeaderboardRow | null;
  total: number;
};

/** Top 3 plus the two players above and below `userId` on the overall board. */
export async function miniLeaderboard(userId: string, rankHint: number): Promise<MiniBoard> {
  const start = Math.max(0, rankHint - 6);
  const [top, windowRows] = await Promise.all([
    playerLeaderboard({ limit: 3, offset: 0 }),
    playerLeaderboard({ limit: 12, offset: start }),
  ]);
  let rows = windowRows;
  let idx = rows.findIndex((r) => r.user_id === userId);
  if (idx < 0) {
    // ties can shift the order a little further than the hint; widen once
    rows = await playerLeaderboard({ limit: 60, offset: Math.max(0, rankHint - 30) });
    idx = rows.findIndex((r) => r.user_id === userId);
  }
  if (idx < 0) return { top, around: [], me: null, total: top[0]?.total_count ?? 0 };
  const around = rows.slice(Math.max(0, idx - 2), idx + 3);
  return { top, around, me: rows[idx], total: rows[idx].total_count };
}

/** Rank inside the member's chapter (by Elo) and the chapter size. */
export async function chapterRank(chapterId: string, userId: string): Promise<{ rank: number; of: number } | null> {
  const rows = await playerLeaderboard({ chapterId, limit: 200 });
  const me = rows.find((r) => r.user_id === userId);
  return me ? { rank: me.rank, of: me.total_count } : null;
}

// ------------------------------------------------------------------------------------------------ friends

export type Friendship =
  | { state: 'none' }
  | { state: 'outgoing' }
  | { state: 'incoming' }
  | { state: 'friends'; since: string };

type FriendRow = { user_id: string; friend_id: string; status: FriendStatus; created_at: string };

export async function getFriendship(otherId: string): Promise<Friendship> {
  const uid = await myUid();
  const rows =
    must(
      await supabase
        .from('fbla_friends')
        .select('*')
        .or(`and(user_id.eq.${uid},friend_id.eq.${otherId}),and(user_id.eq.${otherId},friend_id.eq.${uid})`)
        .returns<FriendRow[]>(),
    ) ?? [];
  const accepted = rows.find((r) => r.status === 'accepted');
  if (accepted) return { state: 'friends', since: accepted.created_at };
  if (rows.some((r) => r.user_id === otherId)) return { state: 'incoming' };
  if (rows.some((r) => r.user_id === uid)) return { state: 'outgoing' };
  return { state: 'none' };
}

// Writes go through the Arena RPCs (0010 removed direct insert/update/delete on fbla_friends).

/** Sends a request, or accepts theirs if they already asked. */
export async function addFriend(otherId: string): Promise<Friendship> {
  const res = await supabase.rpc('fbla_friend_request', { p_user: otherId });
  if (res.error) throw toApiError(res.error, 'Could not send the request.');
  return res.data === 'accepted' ? getFriendship(otherId) : { state: 'outgoing' };
}

export async function acceptFriend(otherId: string): Promise<Friendship> {
  const res = await supabase.rpc('fbla_friend_respond', { p_user: otherId, p_accept: true });
  if (res.error) throw toApiError(res.error, 'Could not accept the request.');
  return getFriendship(otherId);
}

/** Removes a friend, cancels your request or declines theirs. */
export async function removeFriend(otherId: string): Promise<void> {
  const res = await supabase.rpc('fbla_friend_remove', { p_user: otherId });
  if (res.error) throw toApiError(res.error, 'Could not update your friends.');
}

export type FriendEntry = {
  profile: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url' | 'elo' | 'school'>;
  status: FriendStatus;
  /** true when they sent the request to you */
  incoming: boolean;
  created_at: string;
};

/** Your friends and pending requests, accepted first then incoming then outgoing. */
export async function listFriends(): Promise<FriendEntry[]> {
  const uid = await myUid();
  const rows =
    must(
      await supabase.from('fbla_friends').select('*').or(`user_id.eq.${uid},friend_id.eq.${uid}`).returns<FriendRow[]>(),
    ) ?? [];
  const ids = rows.map((r) => (r.user_id === uid ? r.friend_id : r.user_id));
  if (!ids.length) return [];
  const profiles =
    must(
      await supabase
        .from('fbla_profiles')
        .select('id,username,display_name,avatar_url,elo,school')
        .in('id', [...new Set(ids)])
        .returns<FriendEntry['profile'][]>(),
    ) ?? [];
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const order = (e: FriendEntry) => (e.status === 'accepted' ? 0 : e.incoming ? 1 : 2);
  return rows
    .map((r) => {
      const other = r.user_id === uid ? r.friend_id : r.user_id;
      const profile = byId.get(other);
      return profile ? { profile, status: r.status, incoming: r.friend_id === uid, created_at: r.created_at } : null;
    })
    .filter((x): x is FriendEntry => x != null)
    .sort((a, b) => order(a) - order(b) || b.profile.elo - a.profile.elo);
}

// ------------------------------------------------------------------------------------------------ career

/** Every attempt of the caller, newest first (paged through in 1000s). */
export async function listAllAttempts(): Promise<Attempt[]> {
  const uid = await myUid();
  const out: Attempt[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const res = await supabase
      .from('fbla_attempts')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .range(from, from + page - 1)
      .returns<Attempt[]>();
    const rows = must(res, 'Could not load your exams.') ?? [];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

export type WrongQuestion = {
  id: string;
  event: string;
  sub: string;
  /** Your latest (wrong) choice; null when you ran out of time. */
  chosen: number | null;
  misses: number;
  tries: number;
  last_at: string;
  question: Question | null;
};

type WrongRow = { question_id: string; event: string | null; sub: string | null; chosen: number | null; correct: boolean; created_at: string };

/** Official questions whose latest answer was wrong, newest first, with the question text from content. */
export async function listWrongQuestions(): Promise<WrongQuestion[]> {
  const uid = await myUid();
  const rows: WrongRow[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const res = await supabase
      .from('fbla_answers')
      .select('question_id,event,sub,chosen,correct,created_at')
      .eq('user_id', uid)
      .not('question_id', 'like', 'custom:%')
      .order('id', { ascending: true })
      .range(from, from + page - 1)
      .returns<WrongRow[]>();
    const got = must(res, 'Could not load your answers.') ?? [];
    rows.push(...got);
    if (got.length < page) break;
  }
  const latest = new Map<string, { row: WrongRow; misses: number; tries: number }>();
  for (const r of rows) {
    const prev = latest.get(r.question_id);
    latest.set(r.question_id, {
      row: r,
      misses: (prev?.misses ?? 0) + (r.correct ? 0 : 1),
      tries: (prev?.tries ?? 0) + 1,
    });
  }
  const wrong = [...latest.values()].filter((x) => !x.row.correct && x.row.event);
  const events = [...new Set(wrong.map((w) => w.row.event as string))];
  const banks = await Promise.all(events.map((e) => loadQuestions(e).catch(() => [] as Question[])));
  const byId = new Map<string, Question>();
  banks.flat().forEach((q) => byId.set(q.id, q));
  return wrong
    .map(({ row, misses, tries }) => {
      const question = byId.get(row.question_id) ?? null;
      return {
        id: row.question_id,
        event: row.event as string,
        sub: row.sub ?? question?.sub ?? 'General',
        chosen: row.chosen,
        misses,
        tries,
        last_at: row.created_at,
        question,
      };
    })
    .sort((a, b) => b.last_at.localeCompare(a.last_at));
}

/** Link that starts a redo run of the given official question ids. */
export function redoUrl(ids: string[], label?: string): string {
  const p = new URLSearchParams({ mode: 'redo', ids: ids.join(',') });
  if (label) p.set('label', label);
  return `/play/run?${p.toString()}`;
}

export const KIND_FILTERS: { value: AttemptKind | 'all'; label: string }[] = [
  { value: 'all', label: 'All kinds' },
  { value: 'practice', label: 'Practice' },
  { value: 'mock', label: 'Mock exam' },
  { value: 'daily', label: 'Daily challenge' },
  { value: 'endless', label: 'Endless' },
  { value: 'weak', label: 'Weak spots' },
  { value: 'area', label: 'Area drill' },
  { value: 'redo', label: 'Redo missed' },
  { value: 'custom', label: 'Chapter test' },
  { value: 'assignment', label: 'Assignment' },
  { value: 'duel', label: 'Arena duel' },
];

// ------------------------------------------------------------------------------------------------ account

/** Re-checks the current password, then sets the new one. */
export async function changePassword(current: string, next: string): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const email = data.session?.user.email;
  if (!email) throw new ApiError('You are signed out. Sign in and try again.');
  const check = await supabase.auth.signInWithPassword({ email, password: current });
  if (check.error) throw new ApiError('Your current password is not right.');
  const up = await supabase.auth.updateUser({ password: next });
  if (up.error) {
    const m = up.error.message.toLowerCase();
    if (m.includes('different from the old')) throw new ApiError('Pick a password you have not used here before.');
    if (m.includes('password')) throw new ApiError('Choose a stronger password: at least 8 characters.');
    throw new ApiError(up.error.message || 'Could not change your password.');
  }
}

/** Email of the signed-in account. */
export async function myEmail(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.email ?? null;
}

// ------------------------------------------------------------------------------------------------ formatting

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, '0')}m`;
}

export function formatHours(ms: number): string {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export const pct = (v: number) => `${Math.round(v * 100)}%`;

export function formatDate(iso: string, withYear = false): string {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) });
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return formatDate(iso, d > 300);
}
