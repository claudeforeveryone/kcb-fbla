// Typed access to the core tables and RPCs (supabase/migrations/0006..0009). Feature APIs build on this.
// Every function throws ApiError (a plain Error with a friendly message and the Postgres code) on failure.
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { profileSearchFilter } from '../lib/search';
import {
  CHAPTER_COLUMNS,
  type AchievementRow,
  type AnswerRow,
  type Attempt,
  type AttemptKind,
  type Chapter,
  type ChapterInvite,
  type ChapterLeaderboardRow,
  type ChapterMember,
  type ChapterPreview,
  type PlayerLeaderboardRow,
  PROFILE_COLUMNS,
  type Profile,
  type ProfilePatch,
  type ProfileStats,
  type SubmitAttemptInput,
  type SubmitAttemptResult,
  type WeakSpot,
} from '../lib/types';

// ------------------------------------------------------------------------------------------------ errors

export class ApiError extends Error {
  code: string | null;
  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

const FRIENDLY: Record<string, string> = {
  '42501': "You don't have permission to do that.",
  '23505': 'That already exists.',
  PGRST116: 'Not found.',
};

/** Turns a PostgREST error into an ApiError with a message fit for a toast. */
export function toApiError(e: PostgrestError | Error | null | undefined, fallback = 'Something went wrong.'): ApiError {
  if (!e) return new ApiError(fallback);
  if (e instanceof ApiError) return e;
  const code = 'code' in e && typeof e.code === 'string' ? e.code : null;
  const raw = e.message || '';
  if (/failed to fetch|network/i.test(raw)) return new ApiError('Network error. Check your connection and try again.', code);
  // Our functions raise readable messages ("that username is taken"); capitalise and keep them.
  const readable = raw && !/^(new row violates|permission denied|duplicate key|violates)/i.test(raw);
  if (readable) return new ApiError(raw.charAt(0).toUpperCase() + raw.slice(1), code);
  return new ApiError((code && FRIENDLY[code]) || fallback, code);
}

function must<T>(res: { data: T | null; error: PostgrestError | null }, fallback?: string): T {
  if (res.error) throw toApiError(res.error, fallback);
  return res.data as T;
}

async function requireUid(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) throw new ApiError('You are signed out. Sign in and try again.', '42501');
  return uid;
}

// ------------------------------------------------------------------------------------------------ profiles

export async function getProfile(id: string): Promise<Profile | null> {
  return must(await supabase.from('fbla_profiles').select(PROFILE_COLUMNS).eq('id', id).maybeSingle<Profile>());
}

export async function getMyProfile(): Promise<Profile | null> {
  return getProfile(await requireUid());
}

export async function getProfileByUsername(username: string): Promise<Profile | null> {
  return must(
    await supabase.from('fbla_profiles').select(PROFILE_COLUMNS).eq('username', username.trim().toLowerCase()).maybeSingle<Profile>(),
  );
}

export async function getProfiles(ids: string[]): Promise<Profile[]> {
  if (ids.length === 0) return [];
  return must(await supabase.from('fbla_profiles').select(PROFILE_COLUMNS).in('id', [...new Set(ids)]).returns<Profile[]>());
}

/** Prefix search on username or display name, for pickers (challenge a friend, add a member). */
export async function searchProfiles(query: string, limit = 10): Promise<Profile[]> {
  const filter = profileSearchFilter(query);
  if (!filter) return [];
  return must(
    await supabase
      .from('fbla_profiles')
      .select(PROFILE_COLUMNS)
      .or(filter)
      .order('elo', { ascending: false })
      .limit(limit)
      .returns<Profile[]>(),
  );
}

/** Updates the caller's cosmetic fields. Stats columns are rejected by the database. */
export async function updateMyProfile(patch: ProfilePatch): Promise<Profile> {
  const uid = await requireUid();
  const clean: ProfilePatch = { ...patch };
  if (clean.username != null) clean.username = clean.username.trim().toLowerCase();
  if (clean.display_name != null) clean.display_name = clean.display_name.trim();
  const res = await supabase.from('fbla_profiles').update(clean).eq('id', uid).select(PROFILE_COLUMNS).single<Profile>();
  if (res.error?.code === '23505') throw new ApiError('That username is taken.', '23505');
  const row = must(res, 'Could not save your profile.');
  // email_opt_in is not selectable (owner-only via fbla_my_profile); echo back what was just saved
  return clean.email_opt_in === undefined ? row : { ...row, email_opt_in: clean.email_opt_in };
}

export type NewProfileInput = {
  username: string;
  display_name: string;
  school?: string | null;
  grade?: number | null;
  main_event?: string | null;
};

/** Onboarding: creates the caller's profile, or updates it if it exists. */
export async function createProfile(p: NewProfileInput): Promise<Profile> {
  const res = await supabase.rpc('fbla_create_profile', {
    p_username: p.username.trim().toLowerCase(),
    p_display_name: p.display_name.trim(),
    p_school: p.school?.trim() || null,
    p_grade: p.grade ?? null,
    p_main_event: p.main_event || null,
  });
  if (res.error?.code === '23505') throw new ApiError('That username is taken. Try another.', '23505');
  return must(res as { data: Profile | null; error: PostgrestError | null }, 'Could not create your profile.');
}

/** True if the name is valid, not reserved and free (your own current name counts as available). */
export async function isUsernameAvailable(username: string): Promise<boolean> {
  const res = await supabase.rpc('fbla_username_available', { p_username: username });
  return Boolean(must(res as { data: boolean | null; error: PostgrestError | null }));
}

/** Records that the caller is around (for "last seen" and idle emails). Errors are ignored. */
export async function touchLastSeen(): Promise<void> {
  try {
    const uid = await requireUid();
    await supabase.from('fbla_profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', uid);
  } catch {
    /* best effort */
  }
}

const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

/** Uploads to avatars/<uid>/..., saves avatar_url on the profile and returns the public URL. */
export async function uploadAvatar(file: Blob): Promise<string> {
  const uid = await requireUid();
  if (!AVATAR_TYPES.includes(file.type)) throw new ApiError('Use a PNG, JPEG, WebP or GIF image.');
  if (file.size > AVATAR_MAX_BYTES) throw new ApiError('That image is over 2 MB. Try a smaller one.');
  const ext = file.type.split('/')[1].replace('jpeg', 'jpg');
  const path = `${uid}/avatar-${Date.now()}.${ext}`;
  const up = await supabase.storage.from('avatars').upload(path, file, { contentType: file.type, cacheControl: '31536000' });
  if (up.error) throw new ApiError(up.error.message || 'Upload failed.');
  const url = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
  await updateMyProfile({ avatar_url: url });
  // tidy up older uploads; failures don't matter
  const listed = await supabase.storage.from('avatars').list(uid);
  const stale = (listed.data ?? []).map((f) => `${uid}/${f.name}`).filter((p) => p !== path);
  if (stale.length) await supabase.storage.from('avatars').remove(stale);
  return url;
}

// ------------------------------------------------------------------------------------------------ attempts

/** Grades a run on the server, applies Elo and stats, awards achievements. */
export async function submitAttempt(input: SubmitAttemptInput): Promise<SubmitAttemptResult> {
  if (input.answers.length === 0) throw new ApiError('Answer at least one question first.');
  const payload = {
    ...input,
    answers: input.answers.map((a) => ({ question_id: a.question_id, chosen: a.chosen, ms: Math.max(0, Math.round(a.ms)) })),
    duration_ms: input.duration_ms == null ? undefined : Math.max(0, Math.round(input.duration_ms)),
  };
  const res = await supabase.rpc('fbla_submit_attempt', { p: payload });
  return must(res as { data: SubmitAttemptResult | null; error: PostgrestError | null }, 'Could not save your results.');
}

export type AttemptSort = 'newest' | 'oldest' | 'best' | 'worst';
export type ListAttemptsOptions = {
  userId?: string;
  event?: string | null;
  kind?: AttemptKind | AttemptKind[];
  assignmentId?: string;
  customTestId?: string;
  sort?: AttemptSort;
  limit?: number;
  offset?: number;
};

/** The career list. Returns rows plus the total count for paging. RLS: your own, or members you staff. */
export async function listAttempts(opts: ListAttemptsOptions = {}): Promise<{ rows: Attempt[]; count: number }> {
  const uid = opts.userId ?? (await requireUid());
  let q = supabase.from('fbla_attempts').select('*', { count: 'exact' }).eq('user_id', uid);
  if (opts.event) q = q.eq('event', opts.event);
  if (opts.kind) q = Array.isArray(opts.kind) ? q.in('kind', opts.kind) : q.eq('kind', opts.kind);
  if (opts.assignmentId) q = q.eq('assignment_id', opts.assignmentId);
  if (opts.customTestId) q = q.eq('custom_test_id', opts.customTestId);
  const sort = opts.sort ?? 'newest';
  if (sort === 'newest' || sort === 'oldest') q = q.order('created_at', { ascending: sort === 'oldest' });
  else q = q.order('correct', { ascending: sort === 'worst' }).order('total', { ascending: true }).order('created_at', { ascending: false });
  const limit = opts.limit ?? 25;
  const offset = opts.offset ?? 0;
  const res = await q.range(offset, offset + limit - 1).returns<Attempt[]>();
  if (res.error) throw toApiError(res.error);
  let rows = res.data ?? [];
  // "best"/"worst" by percentage, not raw count, within the page
  if (sort === 'best' || sort === 'worst') {
    const pct = (a: Attempt) => (a.total ? a.correct / a.total : 0);
    rows = [...rows].sort((a, b) => (sort === 'best' ? pct(b) - pct(a) : pct(a) - pct(b)));
  }
  return { rows, count: res.count ?? rows.length };
}

/** One attempt with its answers in the order they were given. */
export async function getAttempt(id: string): Promise<{ attempt: Attempt; answers: AnswerRow[] } | null> {
  const [a, ans] = await Promise.all([
    supabase.from('fbla_attempts').select('*').eq('id', id).maybeSingle<Attempt>(),
    supabase.from('fbla_answers').select('*').eq('attempt_id', id).order('id').returns<AnswerRow[]>(),
  ]);
  const attempt = must(a);
  if (!attempt) return null;
  return { attempt, answers: must(ans) ?? [] };
}

async function allAnswers(uid: string, columns: string, event?: string | null): Promise<AnswerRow[]> {
  const out: AnswerRow[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    let q = supabase.from('fbla_answers').select(columns).eq('user_id', uid).not('question_id', 'like', 'custom:%');
    if (event) q = q.eq('event', event);
    const res = await q.order('id', { ascending: true }).range(from, from + page - 1).returns<AnswerRow[]>();
    const rows = must(res) ?? [];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

/** Official question ids the member has answered before (a repeat earns no Elo, see src/lib/elo.ts). */
export async function getSeenQuestionIds(userId?: string): Promise<Set<string>> {
  const uid = userId ?? (await requireUid());
  return new Set((await allAnswers(uid, 'question_id')).map((a) => a.question_id));
}

export type MissedQuestion = { question_id: string; event: string | null; sub: string | null; misses: number; last_at: string };

/** Official questions whose most recent answer was wrong, most recent first (for "redo missed"). */
export async function getMissedQuestions(opts: { userId?: string; event?: string | null } = {}): Promise<MissedQuestion[]> {
  const uid = opts.userId ?? (await requireUid());
  const rows = await allAnswers(uid, 'question_id,event,sub,correct,created_at', opts.event);
  const latest = new Map<string, MissedQuestion & { correct: boolean }>();
  for (const r of rows) {
    const prev = latest.get(r.question_id);
    latest.set(r.question_id, {
      question_id: r.question_id,
      event: r.event,
      sub: r.sub,
      misses: (prev?.misses ?? 0) + (r.correct ? 0 : 1),
      last_at: r.created_at,
      correct: r.correct,
    });
  }
  return [...latest.values()]
    .filter((m) => !m.correct)
    .sort((a, b) => b.last_at.localeCompare(a.last_at))
    .map(({ correct: _c, ...m }) => m);
}

// ------------------------------------------------------------------------------------------------ stats

export async function playerLeaderboard(
  opts: { limit?: number; offset?: number; event?: string | null; chapterId?: string | null } = {},
): Promise<PlayerLeaderboardRow[]> {
  const res = await supabase.rpc('fbla_player_leaderboard', {
    p_limit: opts.limit ?? 50,
    p_offset: opts.offset ?? 0,
    p_event: opts.event ?? null,
    p_chapter: opts.chapterId ?? null,
  });
  return (must(res as { data: PlayerLeaderboardRow[] | null; error: PostgrestError | null }) ?? []).map((r) => ({
    ...r,
    rank: Number(r.rank),
    total_count: Number(r.total_count),
    accuracy: Number(r.accuracy),
  }));
}

export async function chapterLeaderboard(opts: { limit?: number; offset?: number } = {}): Promise<ChapterLeaderboardRow[]> {
  const res = await supabase.rpc('fbla_chapter_leaderboard', { p_limit: opts.limit ?? 50, p_offset: opts.offset ?? 0 });
  return (must(res as { data: ChapterLeaderboardRow[] | null; error: PostgrestError | null }) ?? []).map((r) => ({
    ...r,
    rank: Number(r.rank),
    total_elo: Number(r.total_elo),
    questions_answered: Number(r.questions_answered),
    total_count: Number(r.total_count),
  }));
}

/** Per (event, area) accuracy, worst first. For yourself, or a member of a chapter you staff. */
export async function weakSpots(userId?: string): Promise<WeakSpot[]> {
  const res = await supabase.rpc('fbla_weak_spots', { p_user: userId ?? null });
  return (must(res as { data: WeakSpot[] | null; error: PostgrestError | null }) ?? []).map((w) => ({
    ...w,
    accuracy: Number(w.accuracy),
  }));
}

/** Everything a profile page needs in one call. null if the user has no profile. */
export async function profileStats(userId?: string): Promise<ProfileStats | null> {
  const res = await supabase.rpc('fbla_profile_stats', { p_user: userId ?? null });
  return must(res as { data: ProfileStats | null; error: PostgrestError | null });
}

export async function getAchievements(userId?: string): Promise<AchievementRow[]> {
  const uid = userId ?? (await requireUid());
  return must(
    await supabase.from('fbla_achievements').select('*').eq('user_id', uid).order('earned_at', { ascending: false }).returns<AchievementRow[]>(),
  ) ?? [];
}

// ------------------------------------------------------------------------------------------------ chapter basics

export async function getChapter(id: string): Promise<Chapter | null> {
  return must(await supabase.from('fbla_chapters').select(CHAPTER_COLUMNS).eq('id', id).maybeSingle<Chapter>());
}

/** The caller's membership row (role) or null. */
export async function getMyMembership(): Promise<ChapterMember | null> {
  const uid = await requireUid();
  return must(await supabase.from('fbla_chapter_members').select('*').eq('user_id', uid).maybeSingle<ChapterMember>());
}

/** Creates a chapter with the caller as president (the database adds the membership). */
export async function createChapter(input: {
  name: string;
  school?: string | null;
  region?: string | null;
  description?: string | null;
}): Promise<Chapter> {
  const res = await supabase
    .from('fbla_chapters')
    .insert({
      name: input.name.trim(),
      school: input.school?.trim() || null,
      region: input.region?.trim() || null,
      description: input.description?.trim() || null,
    })
    .select(CHAPTER_COLUMNS)
    .single<Chapter>();
  return must(res, 'Could not create the chapter.');
}

/** Join code and invite token. Presidents and executives only. */
export async function getChapterInvite(chapterId: string): Promise<ChapterInvite> {
  const res = await supabase.rpc('fbla_chapter_invite', { p_chapter: chapterId });
  const rows = must(res as { data: ChapterInvite[] | null; error: PostgrestError | null }) ?? [];
  if (!rows[0]) throw new ApiError('Chapter not found.');
  return rows[0];
}

/** New join code and/or invite link; old ones stop working. */
export async function rotateChapterInvite(chapterId: string, what: 'code' | 'token' | 'both' = 'both'): Promise<ChapterInvite> {
  const res = await supabase.rpc('fbla_rotate_chapter_invite', { p_chapter: chapterId, p_what: what });
  const rows = must(res as { data: ChapterInvite[] | null; error: PostgrestError | null }) ?? [];
  if (!rows[0]) throw new ApiError('Chapter not found.');
  return rows[0];
}

/** Looks up a chapter by 6-character code or invite token, without joining. */
export async function previewChapter(code: string): Promise<ChapterPreview | null> {
  const res = await supabase.rpc('fbla_chapter_preview', { p_code: code.trim() });
  const rows = must(res as { data: ChapterPreview[] | null; error: PostgrestError | null }) ?? [];
  return rows[0] ?? null;
}

/** Joins by code or invite token; returns the chapter id. */
export async function joinChapter(code: string): Promise<string> {
  const res = await supabase.rpc('fbla_join_chapter', { p_code: code.trim() });
  return must(res as { data: string | null; error: PostgrestError | null }, 'Could not join the chapter.') as string;
}

/** Leaves the chapter. A president can only leave when alone, which deletes the chapter. */
export async function leaveChapter(): Promise<void> {
  must(await supabase.rpc('fbla_leave_chapter'), 'Could not leave the chapter.');
}

/** Builds the shareable invite URL for a token. */
export function inviteUrl(token: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${window.location.origin}${base}/chapter/join/${encodeURIComponent(token)}`;
}
