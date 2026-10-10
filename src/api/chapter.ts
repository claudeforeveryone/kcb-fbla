// Chapter core + admin: membership, roster, roles, bans, trainers, attendance and analytics.
// RPCs live in supabase/migrations/0011_chapter.sql (plus the invite/join helpers in 0007). Every function throws an
// ApiError with a toast-ready message on failure.
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import {
  CHAPTER_COLUMNS,
  type Attendance,
  type AttendanceSession,
  type AttendanceStatus,
  type Chapter,
  type ChapterBan,
  type ChapterMember,
  type ChapterRole,
  type Profile,
  type Trainer,
} from '../lib/types';
import { ApiError, toApiError } from './core';

export {
  getChapter,
  getMyMembership,
  previewChapter,
  joinChapter,
  leaveChapter,
  inviteUrl,
  getChapterInvite,
  rotateChapterInvite,
} from './core';

type Res<T> = { data: T | null; error: PostgrestError | null };
function must<T>(res: Res<T>, fallback?: string): T {
  if (res.error) throw toApiError(res.error, fallback);
  return res.data as T;
}

async function uid(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new ApiError('You are signed out. Sign in and try again.', '42501');
  return id;
}

// ------------------------------------------------------------------------------------------------ context

export type MyChapter = { chapter: Chapter; membership: ChapterMember };

/** The caller's chapter and role, or null when they are not in one. */
export async function getMyChapter(): Promise<MyChapter | null> {
  const me = await uid();
  const m = must(
    await supabase.from('fbla_chapter_members').select('*').eq('user_id', me).maybeSingle<ChapterMember>(),
  );
  if (!m) return null;
  const chapter = must(
    await supabase.from('fbla_chapters').select(CHAPTER_COLUMNS).eq('id', m.chapter_id).maybeSingle<Chapter>(),
  );
  if (!chapter) return null;
  return { chapter, membership: m };
}

/** Registers a chapter with the caller as president. Returns the new chapter id. */
export async function createChapter(input: {
  name: string;
  school?: string | null;
  region?: string | null;
  description?: string | null;
}): Promise<string> {
  const res = await supabase.rpc('fbla_create_chapter', {
    p_name: input.name.trim(),
    p_school: input.school?.trim() || null,
    p_region: input.region?.trim() || null,
    p_description: input.description?.trim() || null,
  });
  return must(res as Res<string>, 'Could not register the chapter.');
}

/** Name, school, region and description. Presidents and executives. */
export async function updateChapter(
  chapterId: string,
  patch: Partial<Pick<Chapter, 'name' | 'school' | 'region' | 'description'>>,
): Promise<Chapter> {
  const clean: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(patch)) clean[k] = typeof v === 'string' ? v.trim() || null : (v ?? null);
  if ('name' in clean && !clean.name) throw new ApiError('The chapter needs a name.');
  const res = await supabase.from('fbla_chapters').update(clean).eq('id', chapterId).select(CHAPTER_COLUMNS).single<Chapter>();
  return must(res, 'Could not save the chapter details.');
}

// ------------------------------------------------------------------------------------------------ roster

export type RosterMember = {
  user_id: string;
  role: ChapterRole;
  joined_at: string;
  profile: Pick<
    Profile,
    | 'id'
    | 'username'
    | 'display_name'
    | 'avatar_url'
    | 'school'
    | 'grade'
    | 'main_event'
    | 'elo'
    | 'peak_elo'
    | 'questions_answered'
    | 'questions_correct'
    | 'current_streak'
    | 'last_active_date'
    | 'last_seen_at'
  >;
};

const ROSTER_PROFILE =
  'id,username,display_name,avatar_url,school,grade,main_event,elo,peak_elo,questions_answered,questions_correct,current_streak,last_active_date,last_seen_at';

/** Every member with their public profile, highest Elo first. */
export async function listMembers(chapterId: string): Promise<RosterMember[]> {
  const members = must(
    await supabase.from('fbla_chapter_members').select('*').eq('chapter_id', chapterId).returns<ChapterMember[]>(),
  ) ?? [];
  if (!members.length) return [];
  const profiles = must(
    await supabase
      .from('fbla_profiles')
      .select(ROSTER_PROFILE)
      .in('id', members.map((m) => m.user_id))
      .returns<RosterMember['profile'][]>(),
  ) ?? [];
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return members
    .filter((m) => byId.has(m.user_id))
    .map((m) => ({ user_id: m.user_id, role: m.role, joined_at: m.joined_at, profile: byId.get(m.user_id)! }))
    .sort((a, b) => b.profile.elo - a.profile.elo || b.profile.questions_answered - a.profile.questions_answered);
}

export async function listTrainers(chapterId: string): Promise<Trainer[]> {
  return must(
    await supabase.from('fbla_trainers').select('*').eq('chapter_id', chapterId).order('created_at').returns<Trainer[]>(),
  ) ?? [];
}

export type BanWithProfile = ChapterBan & {
  profile: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'> | null;
  banned_by_name: string | null;
};

/** Bans, newest first. Presidents and executives. */
export async function listBans(chapterId: string): Promise<BanWithProfile[]> {
  const bans = must(
    await supabase
      .from('fbla_chapter_bans')
      .select('*')
      .eq('chapter_id', chapterId)
      .order('created_at', { ascending: false })
      .returns<ChapterBan[]>(),
  ) ?? [];
  if (!bans.length) return [];
  const ids = [...new Set(bans.flatMap((b) => [b.user_id, b.banned_by].filter(Boolean) as string[]))];
  const profiles = must(
    await supabase
      .from('fbla_profiles')
      .select('id,username,display_name,avatar_url')
      .in('id', ids)
      .returns<BanWithProfile['profile'][]>(),
  ) ?? [];
  const byId = new Map(profiles.filter(Boolean).map((p) => [p!.id, p!]));
  return bans.map((b) => ({
    ...b,
    profile: byId.get(b.user_id) ?? null,
    banned_by_name: b.banned_by ? (byId.get(b.banned_by)?.display_name ?? null) : null,
  }));
}

// ------------------------------------------------------------------------------------------------ admin actions

export async function addMemberByUsername(chapterId: string, username: string): Promise<string> {
  const res = await supabase.rpc('fbla_add_member', { p_chapter: chapterId, p_username: username.trim() });
  return must(res as Res<string>, 'Could not add that member.');
}

export type AssignableRole = Exclude<ChapterRole, 'president'>;

export async function setRole(chapterId: string, userId: string, role: AssignableRole): Promise<void> {
  must(await supabase.rpc('fbla_set_role', { p_chapter: chapterId, p_user: userId, p_role: role }), 'Could not change the role.');
}

export async function removeMember(chapterId: string, userId: string): Promise<void> {
  must(await supabase.rpc('fbla_remove_member', { p_chapter: chapterId, p_user: userId }), 'Could not remove the member.');
}

export async function banMember(chapterId: string, userId: string, reason: string | null): Promise<void> {
  must(
    await supabase.rpc('fbla_ban_member', { p_chapter: chapterId, p_user: userId, p_reason: reason?.trim() || null }),
    'Could not ban the member.',
  );
}

export async function unbanMember(chapterId: string, userId: string): Promise<void> {
  must(await supabase.rpc('fbla_unban_member', { p_chapter: chapterId, p_user: userId }), 'Could not lift the ban.');
}

/** Replaces the trainers for one event (0 to 2 members). */
export async function setEventTrainers(chapterId: string, event: string, userIds: string[]): Promise<void> {
  must(
    await supabase.rpc('fbla_set_event_trainers', { p_chapter: chapterId, p_event: event, p_users: userIds }),
    'Could not update the trainers.',
  );
}

/** President only. The caller becomes an executive. */
export async function transferPresidency(chapterId: string, userId: string): Promise<void> {
  must(await supabase.rpc('fbla_transfer_presidency', { p_chapter: chapterId, p_user: userId }), 'Could not transfer the chapter.');
}

/** President only. `confirmName` must match the chapter name. */
export async function deleteChapter(chapterId: string, confirmName: string): Promise<void> {
  must(await supabase.rpc('fbla_delete_chapter', { p_chapter: chapterId, p_confirm: confirmName }), 'Could not delete the chapter.');
}

// ------------------------------------------------------------------------------------------------ attendance

export const ATTENDANCE_STATUSES: readonly AttendanceStatus[] = ['present', 'late', 'absent', 'excused'];
export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  present: 'Present',
  late: 'Late',
  absent: 'Absent',
  excused: 'Excused',
};

/** Present and late count as attended; excused sessions are left out of the rate. */
export function attendanceRate(statuses: (AttendanceStatus | null | undefined)[]): { rate: number | null; attended: number; counted: number } {
  let attended = 0;
  let counted = 0;
  for (const s of statuses) {
    if (!s || s === 'excused') continue;
    counted++;
    if (s === 'present' || s === 'late') attended++;
  }
  return { rate: counted ? attended / counted : null, attended, counted };
}

export async function listSessions(chapterId: string): Promise<AttendanceSession[]> {
  return must(
    await supabase
      .from('fbla_attendance_sessions')
      .select('*')
      .eq('chapter_id', chapterId)
      .order('held_on', { ascending: false })
      .order('created_at', { ascending: false })
      .returns<AttendanceSession[]>(),
  ) ?? [];
}

/** Marks for the given sessions. Admins see everyone's; members see only their own (RLS). */
export async function listAttendance(sessionIds: string[], userId?: string): Promise<Attendance[]> {
  if (!sessionIds.length) return [];
  const out: Attendance[] = [];
  for (let i = 0; i < sessionIds.length; i += 150) {
    let q = supabase.from('fbla_attendance').select('*').in('session_id', sessionIds.slice(i, i + 150));
    if (userId) q = q.eq('user_id', userId);
    out.push(...(must(await q.returns<Attendance[]>()) ?? []));
  }
  return out;
}

export async function createSession(chapterId: string, title: string, heldOn: string): Promise<AttendanceSession> {
  const t = title.trim();
  if (!t) throw new ApiError('Give the meeting a title.');
  const res = await supabase
    .from('fbla_attendance_sessions')
    .insert({ chapter_id: chapterId, title: t, held_on: heldOn })
    .select('*')
    .single<AttendanceSession>();
  return must(res, 'Could not create the meeting.');
}

export async function updateSession(id: string, patch: { title?: string; held_on?: string }): Promise<void> {
  const clean = { ...patch, ...(patch.title != null ? { title: patch.title.trim() } : {}) };
  must(await supabase.from('fbla_attendance_sessions').update(clean).eq('id', id), 'Could not save the meeting.');
}

export async function deleteSession(id: string): Promise<void> {
  must(await supabase.from('fbla_attendance_sessions').delete().eq('id', id), 'Could not delete the meeting.');
}

/** Sets (or clears, with null) one member's mark. */
export async function markAttendance(sessionId: string, userId: string, status: AttendanceStatus | null): Promise<void> {
  if (status == null) {
    must(await supabase.from('fbla_attendance').delete().eq('session_id', sessionId).eq('user_id', userId), 'Could not clear the mark.');
    return;
  }
  must(
    await supabase.from('fbla_attendance').upsert({ session_id: sessionId, user_id: userId, status }, { onConflict: 'session_id,user_id' }),
    'Could not save attendance.',
  );
}

/** Marks many members at once (e.g. "everyone present"). */
export async function markAttendanceMany(sessionId: string, userIds: string[], status: AttendanceStatus): Promise<void> {
  if (!userIds.length) return;
  must(
    await supabase
      .from('fbla_attendance')
      .upsert(userIds.map((u) => ({ session_id: sessionId, user_id: u, status })), { onConflict: 'session_id,user_id' }),
    'Could not save attendance.',
  );
}

export type MemberAttendanceRow = { session: AttendanceSession; status: AttendanceStatus | null };

/** One member's record across every meeting of the chapter, newest first. */
export async function memberAttendance(chapterId: string, userId: string): Promise<MemberAttendanceRow[]> {
  const sessions = await listSessions(chapterId);
  const marks = await listAttendance(sessions.map((s) => s.id), userId);
  const byS = new Map(marks.map((m) => [m.session_id, m.status]));
  return sessions.map((s) => ({ session: s, status: byS.get(s.id) ?? null }));
}

// ------------------------------------------------------------------------------------------------ analytics

export type AnalyticsMember = {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  role: ChapterRole;
  joined_at: string;
  grade: number | null;
  main_event: string | null;
  elo: number;
  peak_elo: number;
  questions_answered: number;
  questions_correct: number;
  /** 0..1, null before the first answer */
  accuracy: number | null;
  current_streak: number;
  last_seen_at: string | null;
  answered_7d: number;
  correct_7d: number;
  answered_30d: number;
  sets_7d: number;
  last_answer_at: string | null;
  attended: number;
  attendance_counted: number;
  attendance_rate: number | null;
};

export type ChapterAnalytics = {
  summary: {
    members: number;
    total_elo: number;
    avg_elo: number;
    questions_answered: number;
    questions_correct: number;
    answered_7d: number;
    correct_7d: number;
    active_7d: number;
    sessions: number;
  };
  members: AnalyticsMember[];
  by_event: { event: string; answered: number; correct: number; accuracy: number; members: number }[];
  /** Worst accuracy first. */
  by_sub: { event: string; sub: string; answered: number; correct: number; accuracy: number; members: number }[];
  /** Last 30 days, oldest first, days without answers omitted. */
  daily: { date: string; answered: number; correct: number; active: number }[];
  generated_at: string;
};

/** Chapter-wide numbers. Presidents, executives and trainers. */
export async function chapterAnalytics(chapterId: string): Promise<ChapterAnalytics> {
  const res = await supabase.rpc('fbla_chapter_analytics', { p_chapter: chapterId });
  const a = must(res as Res<ChapterAnalytics>, 'Could not load analytics.');
  const n = (v: unknown) => (v == null ? null : Number(v));
  return {
    ...a,
    members: a.members.map((m) => ({ ...m, accuracy: n(m.accuracy), attendance_rate: n(m.attendance_rate) })),
    by_event: a.by_event.map((e) => ({ ...e, accuracy: Number(e.accuracy) })),
    by_sub: a.by_sub.map((e) => ({ ...e, accuracy: Number(e.accuracy) })),
  };
}

// ------------------------------------------------------------------------------------------------ helpers

/** Days since an ISO date/time (null when never). */
export function daysSince(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  const t = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now - t) / 86_400_000));
}

/** "today", "yesterday", "3 days ago", "Mar 4". */
export function relativeDay(iso: string | null | undefined): string {
  const d = daysSince(iso);
  if (d == null) return 'Never';
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 30) return `${d} days ago`;
  return new Date(iso!.length === 10 ? `${iso}T12:00:00` : iso!).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d > 300 ? 'numeric' : undefined });
}

/** Local date as YYYY-MM-DD (for <input type="date"> and held_on). */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
